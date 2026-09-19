const test = require("node:test");
const assert = require("node:assert/strict");
const { createSharedService } = require("../services/dev4.service");
const { createDev4Auth } = require("../middleware/dev4Auth");
const client = { id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa", clientId: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb", role: "client", name: "Test Client" };

function database(data = [], error = null) {
  const calls = [];
  const query = new Proxy({}, { get(_, key) {
    if (key === "then") return (resolve, reject) => Promise.resolve({ data, error }).then(resolve, reject);
    return (...args) => { calls.push([key, ...args]); return query; };
  } });
  return { calls, from: (...args) => { calls.push(["from", ...args]); return query; }, rpc: (...args) => { calls.push(["rpc", ...args]); return query; } };
}
test("shared storage rejects client schedule writes and cross-client messages before querying", async () => {
  const db = database(); const service = createSharedService({ db });
  await assert.rejects(service.addReminder(client, {}), { status: 403 });
  await assert.rejects(service.saveRule(client, {}), { status: 403 });
  await assert.rejects(service.completeReminder(client, "other"), { status: 403 });
  await assert.rejects(service.messages(client, "someone-else"), { status: 403 });
  await assert.rejects(service.sendMessage(client, { clientId: "someone-else", body: "test" }), { status: 403 });
  assert.equal(db.calls.length, 0);
});
test("shared client inbox read and mark-read are scoped to verified client and recipient", async () => {
  const db = database(); const service = createSharedService({ db });
  await service.notifications(client);
  assert.ok(db.calls.some(c => c[0] === "eq" && c[1] === "client_id" && c[2] === client.clientId));
  assert.ok(db.calls.some(c => c[0] === "eq" && c[1] === "recipient" && c[2] === "client"));
  assert.ok(db.calls.some(c => c[0] === "or" && c[1].includes(client.id)));
});
test("missing shared schema fails clearly and never selects a local storage fallback", async () => {
  const service = createSharedService({ db: database(null, { code: "PGRST205" }) });
  await assert.rejects(service.rules(), { status: 503, message: /migration/ });
});
test("mock financial data is not written if live consent is expired or unavailable", async () => {
  for (const checkConsent of [async () => ({ valid: false }), async () => { throw Error("offline"); }]) {
    const db = database({ id: client.clientId });
    const service = createSharedService({ db, checkConsent });
    await assert.rejects(service.financialPull(client, client.clientId));
    assert.ok(!db.calls.some(c => c[0] === "upsert" || c[0] === "insert"));
  }
});
async function authenticate(db, user, header = "Bearer test") {
  let status, body, accepted = false;
  db.auth = { getUser: async () => ({ data: { user } }) };
  const req = { headers: { authorization: header, "x-demo-user": "adviser-qiniso" } };
  const res = { status(code) { status = code; return this; }, json(data) { body = data; } };
  await createDev4Auth(db)(req, res, () => { accepted = true; });
  return { status, body, accepted, user: req.user };
}
test("verified app metadata grants adviser access; editable metadata cannot", async () => {
  const trusted = await authenticate(database(), { id: client.id, app_metadata: { role: "advisor" } });
  assert.equal(trusted.user.role, "adviser");
  const untrusted = await authenticate(database(), { id: client.id, user_metadata: { role: "advisor" } });
  assert.equal(untrusted.status, 403);
  const missing = await authenticate(database(), { id: client.id }, "");
  assert.equal(missing.status, 401);
});
test("client auth requires one unambiguous database account link and rejects admins/providers", async () => {
  const row = { id: client.clientId, first_name: "Test", surname: "Client", auth_user_id: client.id };
  const linked = await authenticate(database([row]), { id: client.id });
  assert.equal(linked.user.clientId, client.clientId);
  assert.equal((await authenticate(database([row, row]), { id: client.id })).status, 403);
  assert.equal((await authenticate(database([{ ...row, client_user_id: "different" }]), { id: client.id })).status, 403);
  for (const role of ["admin", "provider"]) assert.equal((await authenticate(database([row]), { id: client.id, app_metadata: { role } })).status, 403);
});
