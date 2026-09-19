const test = require("node:test");
const assert = require("node:assert/strict");
const { createSharedService } = require("../services/reminders.service");
const { createRemindersAuth } = require("../middleware/remindersAuth");
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
  await createRemindersAuth(db)(req, res, () => { accepted = true; });
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
  const row = { id: client.clientId, first_name: "Test", surname: "Client" };
  const linked = await authenticate(database([row]), { id: client.id });
  assert.equal(linked.user.clientId, client.clientId);
  assert.equal((await authenticate(database([row, row]), { id: client.id })).status, 403);
  assert.equal((await authenticate(database([]), { id: client.id })).status, 403);
  for (const role of ["admin", "provider"]) assert.equal((await authenticate(database([row]), { id: client.id, app_metadata: { role } })).status, 403);
});
test("client auth links by users.auth_user_id only (there is no client_user_id column) and shows names without 'null'", async () => {
  const db = database([{ id: client.clientId, first_name: "Nelago", second_name: null, surname: null }]);
  const linked = await authenticate(db, { id: client.id });
  assert.equal(linked.user.name, "Nelago");
  assert.ok(db.calls.some(c => c[0] === "eq" && c[1] === "auth_user_id" && c[2] === client.id));
  assert.ok(!JSON.stringify(db.calls).includes("client_user_id"));
});
test("client list shows full names and never the text 'null'", async () => {
  const db = database([{ id: "1", first_name: "Nelago", second_name: null, surname: null }, { id: "2", first_name: "Anna", second_name: "Marie", surname: "Botha" }]);
  const names = (await createSharedService({ db }).clients({ role: "adviser", id: "a" })).map(c => c.name);
  assert.deepEqual(names, ["Nelago", "Anna Marie Botha"]);
});
function flushDatabase(notification, subscriptions) {
  const updates = [];
  const chain = data => new Proxy({}, { get(_, key) {
    if (key === "then") return (resolve, reject) => Promise.resolve({ data, error: null }).then(resolve, reject);
    return () => chain(data);
  } });
  return { updates, rpc: () => chain([notification]), from: table => table === "push_subscriptions" ? chain(subscriptions) : { update: values => { updates.push(values); return chain(null); } } };
}
test("push deep-links advisers to /reminders and clients to /account/reminders, with no private text on the lock screen", async () => {
  for (const [recipient, url] of [["advisor", "/reminders"], ["client", "/account/reminders"]]) {
    const sent = [];
    const notification = { id: "n1", recipient, recipient_user_id: "u1", delivered_to: [], push_attempts: 1, push_lease_token: "t" };
    const db = flushDatabase(notification, [{ endpoint: "https://fcm.googleapis.com/x", keys: {}, user_id: "u1" }]);
    await createSharedService({ db, push: async (subscription, payload) => { sent.push(payload); } }).flushPush();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].url, url);
    assert.equal(sent[0].body, "You have a new update. Open Royal Square to view it.");
    assert.equal(db.updates[0].push_status, "sent");
    assert.deepEqual(db.updates[0].delivered_to, ["https://fcm.googleapis.com/x"]);
  }
});
test("push retries a transient failure, gives up after three attempts, and removes expired subscriptions", async () => {
  const subscription = { endpoint: "https://fcm.googleapis.com/x", keys: {}, user_id: "u1" };
  const attempt = async (pushAttempts, error) => {
    const db = flushDatabase({ id: "n1", recipient: "client", recipient_user_id: "u1", delivered_to: [], push_attempts: pushAttempts, push_lease_token: "t" }, [subscription]);
    await createSharedService({ db, push: async () => { throw error; } }).flushPush();
    return db.updates.at(-1).push_status;
  };
  assert.equal(await attempt(1, Object.assign(new Error("503"), { statusCode: 503 })), "pending");
  assert.equal(await attempt(3, Object.assign(new Error("503"), { statusCode: 503 })), "failed");
});

test("push is still delivered when firing due reminders fails, and the failure is reported", async () => {
  const sent = [];
  const notification = { id: "n1", recipient: "advisor", recipient_user_id: "u1", delivered_to: [], push_attempts: 1, push_lease_token: "t" };
  const base = flushDatabase(notification, [{ endpoint: "https://fcm.googleapis.com/x", keys: {}, user_id: "u1" }]);
  const chain = error => new Proxy({}, { get(_, key) { return key === "then" ? (resolve, reject) => Promise.resolve({ data: null, error }).then(resolve, reject) : () => chain(error); } });
  const db = { ...base, rpc: name => name === "reminders_run_reminders" ? chain({ code: "42703", message: "column does not exist" }) : base.rpc(name) };
  await assert.rejects(createSharedService({ db, push: async (_s, payload) => { sent.push(payload); } }).tick(), { status: 503 });
  assert.equal(sent.length, 1);
});
