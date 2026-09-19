const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");

// Only the Supabase token check is faked; the real routers, auth/role middleware and validators run.
// Requests are rejected (or answered) before any real data access; the tables below only feed the access checks.
const UUID = "3f2b8a4e-1c5d-4e6f-9a7b-0c1d2e3f4a5b";
const users = {
  admin: { id: "u-admin", app_metadata: { role: "admin" } },
  advisor: { id: "u-advisor", app_metadata: { role: "advisor" } },
  client: { id: "u-client", app_metadata: {} },
  provider: { id: "u-provider", app_metadata: { role: "provider", provider_id: UUID } },
};
// Tiny in-memory stand-in for the two tables the access middleware reads.
const OTHER_CLIENT = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const tables = {
  users: [
    { id: UUID, auth_user_id: "u-client", role_id: 1 },
    { id: OTHER_CLIENT, auth_user_id: "someone-else", role_id: 1 },
  ],
  documents: [
    { client_id: UUID, document_type: "client_consent", status: "not_sent" },
    { client_id: UUID, document_type: "service_agreement", status: "sent" },
  ],
};
function from(table) {
  const filters = [];
  const builder = {
    select: () => builder,
    eq: (column, value) => (filters.push([column, value]), builder),
    maybeSingle: async () => ({
      data: tables[table].find((row) => filters.every(([column, value]) => row[column] === value)) || null,
      error: null,
    }),
  };
  return builder;
}
const config = require.resolve("../src/config/supabaseClient");
require.cache[config] = {
  id: config,
  filename: config,
  loaded: true,
  exports: {
    supabaseAdmin: {
      from,
      auth: {
        async getUser(token) {
          const user = users[token];
          return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: "bad jwt" } };
        },
      },
    },
  },
};

// The same mounts as server.js (minus the reminders module and the scheduler).
const app = express();
app.use(express.json({ limit: "10mb" }));
app.get("/api/health", (req, res) => res.json({ status: "Server is running" }));
app.use("/api/clients", require("../src/routes/clients.routes"));
app.use("/api/clients/:clientId/documents", require("../src/routes/documents.routes"));
app.use("/api/advisers/:adviserId/compliance", require("../src/routes/compliance.routes"));
app.use("/api/clients/:clientId/compliance", require("../src/routes/clientCompliance.routes"));
app.use("/api/compliance", require("../src/routes/complianceDashboard.routes"));
app.use("/api/tasks", require("../src/routes/tasks.routes"));
app.use("/api/dashboard", require("../src/routes/dashboard.routes"));
app.use("/api", require("../src/routes/catalog.routes"));
app.use("/api/admin/users", require("../src/routes/users.routes"));
app.use("/api/provider", require("../src/routes/provider.routes"));

let server;
let base;
test.before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => new Promise((resolve) => server.close(resolve)));

async function request(method, path, { as, body } = {}) {
  const response = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", ...(as ? { Authorization: `Bearer ${as}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Not JSON: leave json as null so the assertion below reports the status.
  }
  return { status: response.status, json };
}

test("the health check is public", async () => {
  const { status, json } = await request("GET", "/api/health");
  assert.equal(status, 200);
  assert.deepEqual(json, { status: "Server is running" });
});

test("every protected endpoint answers 401 with a JSON error when signed out", async () => {
  const endpoints = [
    ["GET", "/api/me"],
    ["GET", "/api/catalog"],
    ["GET", "/api/dashboard"],
    ["GET", "/api/dashboard/at-risk"],
    ["GET", `/api/dashboard/at-risk/${UUID}`],
    ["POST", `/api/dashboard/at-risk/${UUID}/check-in`],
    ["GET", "/api/tasks"],
    ["POST", "/api/tasks/claims"],
    ["GET", `/api/tasks/${UUID}`],
    ["POST", "/api/clients"],
    ["POST", "/api/clients/finish-registration"],
    ["GET", `/api/clients/${UUID}/documents`],
    ["GET", "/api/admin/users"],
    ["POST", "/api/admin/users"],
    ["GET", "/api/provider/me"],
    ["GET", "/api/provider/tasks"],
    ["GET", "/api/compliance/summary"],
    ["GET", `/api/clients/${UUID}/compliance`],
    ["GET", `/api/advisers/${UUID}/compliance`],
  ];
  for (const [method, path] of endpoints) {
    const { status, json } = await request(method, path, { body: method === "POST" ? {} : undefined });
    assert.equal(status, 401, `${method} ${path}`);
    assert.equal(typeof json?.error, "string", `${method} ${path} should reply with { error }`);
  }
});

test("a forged or unknown token is rejected", async () => {
  const { status, json } = await request("GET", "/api/tasks", { as: "forged" });
  assert.equal(status, 401);
  assert.match(json.error, /Invalid or expired/);
});

test("admin user management is admin-only", async () => {
  for (const as of ["advisor", "client", "provider"]) {
    assert.equal((await request("GET", "/api/admin/users", { as })).status, 403, `${as} list`);
    assert.equal((await request("POST", "/api/admin/users", { as, body: {} })).status, 403, `${as} create`);
  }
});

test("admins are validated, not trusted: bad payloads and ids are 400s", async () => {
  const create = (body) => request("POST", "/api/admin/users", { as: "admin", body });
  assert.equal((await create({})).status, 400);
  assert.equal((await create({ email: "nope", fullName: "A", role: "advisor" })).status, 400);
  assert.equal((await create({ email: "a@b.co", fullName: "A", role: "client" })).status, 400);
  assert.equal((await create({ email: "a@b.co", fullName: "A", role: "provider" })).status, 400);
  assert.equal((await request("POST", "/api/admin/users/not-a-uuid/resend-invite", { as: "admin" })).status, 400);
});

test("the practice dashboard and client creation are advisor-only", async () => {
  for (const as of ["admin", "client", "provider"]) {
    assert.equal((await request("GET", "/api/dashboard", { as })).status, 403, `dashboard as ${as}`);
    assert.equal((await request("POST", "/api/clients", { as, body: {} })).status, 403, `create client as ${as}`);
  }
});

test("Client Pulse and its check-in action are advisor-only", async () => {
  for (const as of ["admin", "client", "provider"]) {
    assert.equal((await request("GET", "/api/dashboard/at-risk", { as })).status, 403, `ranking as ${as}`);
    assert.equal((await request("GET", `/api/dashboard/at-risk/${UUID}`, { as })).status, 403, `drill-down as ${as}`);
    assert.equal((await request("POST", `/api/dashboard/at-risk/${UUID}/check-in`, { as })).status, 403, `check-in as ${as}`);
  }
});

test("Client Pulse rejects a malformed client id before touching any data", async () => {
  const drill = await request("GET", "/api/dashboard/at-risk/not-a-uuid", { as: "advisor" });
  assert.equal(drill.status, 400);
  assert.match(drill.json.error, /client id/);
  assert.equal((await request("POST", "/api/dashboard/at-risk/not-a-uuid/check-in", { as: "advisor" })).status, 400);
});

test("the advisor's add-client form is validated before anything is created", async () => {
  const add = (body) => request("POST", "/api/clients", { as: "advisor", body });
  assert.equal((await add({})).status, 400);
  assert.equal((await add({ first_name: "Thabo", surname: "Mokoena", contact_email: "bad" })).status, 400);
});

test("client sign-in and registration are public but validated", async () => {
  assert.equal((await request("POST", "/api/clients/login", { body: {} })).status, 400);
  assert.equal((await request("POST", "/api/clients/login", { body: { id_number: "123", password: "x" } })).status, 400);
  assert.equal((await request("POST", "/api/clients/complete-registration", { body: {} })).status, 400);
  const short = { email: "t@example.com", id_number: "9001015800085", password: "short" };
  const { status, json } = await request("POST", "/api/clients/complete-registration", { body: short });
  assert.equal(status, 400);
  assert.match(json.error, /between 8 and 72/);
});

test("claims and requests: malformed ids and payloads never reach the service", async () => {
  assert.equal((await request("GET", "/api/tasks/not-a-uuid", { as: "client" })).status, 400);
  assert.equal((await request("POST", "/api/tasks/claims", { as: "client", body: {} })).status, 400);
  assert.equal((await request("POST", "/api/tasks/requests", { as: "client", body: {} })).status, 400);
  assert.equal((await request("POST", `/api/tasks/${UUID}/client-action`, { as: "client", body: { rating: 9 } })).status, 400);
});

test("closing a task and messaging the insurer are advisor-only", async () => {
  for (const as of ["client", "provider", "admin"]) {
    assert.equal((await request("POST", `/api/tasks/${UUID}/close`, { as, body: {} })).status, 403, `close as ${as}`);
    assert.equal((await request("POST", `/api/tasks/${UUID}/provider-messages`, { as, body: { note: "hi" } })).status, 403, `message as ${as}`);
  }
  assert.equal((await request("POST", `/api/tasks/${UUID}/provider-messages`, { as: "advisor", body: {} })).status, 400);
});

test("the provider portal is for provider logins only", async () => {
  for (const as of ["advisor", "admin", "client"]) {
    assert.equal((await request("GET", "/api/provider/tasks", { as })).status, 403, `tasks as ${as}`);
    assert.equal((await request("GET", "/api/provider/me", { as })).status, 403, `me as ${as}`);
  }
  const asProvider = (path, body) => request("POST", `/api/provider/tasks/${path}`, { as: "provider", body });
  assert.equal((await request("GET", "/api/provider/tasks/not-a-uuid", { as: "provider" })).status, 400);
  assert.equal((await asProvider(`${UUID}/decline`, {})).status, 400);
  assert.equal((await asProvider(`${UUID}/messages`, { note: "" })).status, 400);
  assert.equal((await asProvider(`${UUID}/handler`, { name: "" })).status, 400);
});

test("a client can only reach their own documents; admins never can", async () => {
  const sign = (as, clientId, type = "passport") =>
    request("POST", `/api/clients/${clientId}/documents/${type}/sign`, { as, body: {} });
  assert.equal((await sign("admin", UUID)).status, 403, "admin");
  assert.equal((await sign("client", OTHER_CLIENT)).status, 403, "another client's record");
  assert.equal((await request("GET", `/api/clients/${OTHER_CLIENT}/documents`, { as: "client" })).status, 403);
  // Access is granted for their own record, so the request reaches document-type validation.
  assert.equal((await sign("client", UUID)).status, 400, "own record, unknown document type");
});

test("a client can't sign a document that hasn't been sent to them", async () => {
  const sign = (as, type, body = {}) => request("POST", `/api/clients/${UUID}/documents/${type}/sign`, { as, body });
  const notSent = await sign("client", "client_consent");
  assert.equal(notSent.status, 403);
  assert.match(notSent.json.error, /hasn't been sent/);
  const neverCreated = await sign("client", "broker_appointment");
  assert.equal(neverCreated.status, 403);
  // A sent document gets past the gate and is then validated (no signature supplied).
  const sent = await sign("client", "service_agreement");
  assert.equal(sent.status, 400);
  assert.match(sent.json.error, /signature/);
  // Advisors aren't restricted by send status.
  assert.equal((await sign("advisor", "client_consent")).status, 400);
});
