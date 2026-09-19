const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { fakeDatabase } = require("./helpers/complianceDb");
const selfId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const clientId = "33333333-3333-4333-8333-333333333333";
const users = {
  self: { id: selfId, app_metadata: { role: "advisor" }, user_metadata: { full_name: "First Adviser" } },
  other: { id: otherId, app_metadata: { role: "advisor" } },
  client: { id: clientId, app_metadata: {}, user_metadata: { role: "advisor" } },
  admin: { id: "admin", app_metadata: { role: "admin" } },
};
const db = fakeDatabase({ users: [{ id: clientId, role_id: 1, first_name: "Client" }] }, users);
// Test process only: inject the DB at the existing config boundary. Real routers,
// auth/role/self middleware, controllers and service code are exercised below.
const config = require.resolve("../src/config/supabaseClient");
require.cache[config] = { id: config, filename: config, loaded: true, exports: { supabaseAdmin: db } };
const app = express();
app.use(express.json());
app.use("/api/compliance", require("../src/routes/complianceDashboard.routes"));
app.use("/api/clients/:clientId/compliance", require("../src/routes/clientCompliance.routes"));
app.use("/api/advisers/:adviserId/compliance", require("../src/routes/compliance.routes"));
const base = `/api/advisers/${selfId}/compliance`;
let server, url;
test.before(async () => { server = app.listen(0, "127.0.0.1"); await new Promise(resolve => server.once("listening", resolve)); url = `http://127.0.0.1:${server.address().port}`; });
test.after(() => new Promise(resolve => server.close(resolve)));
async function request(path, token, method = "GET", body) {
  return fetch(url + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body) });
}
test("every compliance route rejects unauthenticated, client and admin callers", async () => {
  const endpoints = [["/api/compliance/summary"], ["/api/compliance/audit"], [`/api/clients/${clientId}/compliance`],
    [`/api/clients/${clientId}/compliance/audit`], [`/api/clients/${clientId}/compliance/screenings`, "POST", { screeningType: "pep" }],
    [base], [base, "PATCH", { qualificationStatus: "qualified" }], [base + "/cpd", "POST", { activity: "Course", hours: 1, completedOn: "2026-01-01" }]];
  for (const [path, method, body] of endpoints) {
    for (const [token, expected] of [[null, 401], ["client", 403], ["admin", 403]]) {
      const response = await request(path, token, method, body);
      assert.equal(response.status, expected, `${method || "GET"} ${path}, ${token}`);
      assert.equal(typeof (await response.json()).error, "string");
    }
  }
});
test("advisers can view each other but only write their own record", async () => {
  assert.equal((await request(base, "other")).status, 200);
  assert.equal((await request(base, "other", "PATCH", { qualificationStatus: "qualified" })).status, 403);
  assert.equal((await request(base + "/cpd", "other", "POST", { activity: "Course", hours: 1, completedOn: "2026-01-01" })).status, 403);
  assert.equal((await request(base, "self", "PATCH", { qualificationStatus: "qualified" })).status, 200);
  assert.equal((await request(base + "/cpd", "self", "POST", { activity: "Course", hours: 0.25, completedOn: "2026-01-01" })).status, 201);
  assert.equal(db.calls.find(c => c.rpc).args.p_actor, selfId);
  assert.equal((await request(`/api/advisers/${clientId}/compliance`, "self")).status, 404);
});
test("UUIDs, CPD, simulation, readonly CPD status and query limits are validated", async () => {
  assert.equal((await request("/api/advisers/not-a-uuid/compliance", "self")).status, 400);
  for (const value of ["0", "-1", "1.2", "abc", "50&limit=20"]) {
    assert.equal((await request(`/api/compliance/audit?limit=${value}`, "self")).status, 400);
  }
  assert.equal((await request("/api/compliance/audit?limit=500", "self")).status, 200);
  for (const body of [{ cpdStatus: "up_to_date" }, { actor_id: selfId }, [], {}, { qualificationStatus: "bad" }, { pepDetails: "a".repeat(2001) }]) {
    assert.equal((await request(base, "self", "PATCH", body)).status, 400);
  }
  const valid = { activity: "Course", hours: 1, completedOn: "2026-01-01" };
  for (const body of [{ ...valid, hours: 0 }, { ...valid, hours: -1 }, { ...valid, hours: 101 }, { ...valid, hours: "1" },
    { ...valid, hours: 0.001 }, { ...valid, completedOn: "2026-02-30" }, { ...valid, completedOn: "2099-01-01" },
    { ...valid, activity: "  " }, { ...valid, actorName: "Forged" }]) {
    assert.equal((await request(base + "/cpd", "self", "POST", body)).status, 400);
  }
  const path = `/api/clients/${clientId}/compliance/screenings`;
  assert.equal((await request(path, "self", "POST", { screeningType: "pep", simulateFlag: "true" })).status, 400);
  assert.equal((await request(path, "self", "POST", { screeningType: "other" })).status, 400);
  assert.equal((await request(path, "self", "POST", { screeningType: "pep" })).status, 201);
  assert.equal((await request(`/api/clients/${otherId}/compliance`, "self")).status, 404);
});
