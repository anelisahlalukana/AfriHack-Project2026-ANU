const test = require("node:test");
const assert = require("node:assert/strict");

const CLIENT = "11111111-1111-4111-8111-111111111111";
const AUTH = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; // the client's Supabase login
const OTHER_AUTH = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ADVISER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

// --- A small fake of the parts of Supabase this module uses -------------------------------------
const db = {};
const failures = {}; // table -> "error" (a Supabase error) or "throw" (the call itself throws)
const reads = [];

function reset() {
  db.users = [{ id: CLIENT, role_id: 1, auth_user_id: AUTH, contact_email: "thabo@example.com", first_name: "Thabo" }];
  db.push_subscriptions = [];
  db.notifications = [];
  for (const key of Object.keys(failures)) delete failures[key];
  reads.length = 0;
}

function from(table) {
  if (failures[table] === "throw") throw new Error(`connection lost (${table})`);
  let op = "select";
  let inserted;
  const filters = [];
  const matching = () => db[table].filter((row) => filters.every(([column, value]) => row[column] === value));
  const run = () => {
    if (failures[table] === "error") return { data: null, error: { message: `${table} refused` } };
    if (op === "insert") {
      db[table].push(inserted);
      return { data: null, error: null };
    }
    if (op === "delete") {
      const gone = new Set(matching());
      db[table] = db[table].filter((row) => !gone.has(row));
      return { data: null, error: null };
    }
    reads.push(table);
    return { data: matching().map((row) => ({ ...row })), error: null };
  };
  const builder = {
    select: () => builder,
    delete: () => ((op = "delete"), builder),
    insert: (row) => ((op = "insert"), (inserted = row), builder),
    eq: (column, value) => (filters.push([column, value]), builder),
    maybeSingle: async () => {
      const { data, error } = run();
      return { data: data ? data[0] || null : null, error };
    },
    then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject),
  };
  return builder;
}

// --- Fakes for the two outside services ----------------------------------------------------------
const pushed = [];
const emailed = [];
let pushImpl;
let emailImpl;

function stub(request, exports) {
  const file = require.resolve(request);
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}

// Loads notifications.service afresh, since it builds its push sender when it loads.
function load({ push = true } = {}) {
  stub("../src/config/supabaseClient", { supabaseAdmin: { from } });
  stub("../src/utils/brevoClient", { sendTransactionalEmail: (message) => emailImpl(message) });
  stub("../src/utils/pushSender", {
    createPushSender: () => (push ? (subscription, payload) => pushImpl(subscription, payload) : null),
  });
  delete require.cache[require.resolve("../src/services/notifications.service")];
  return require("../src/services/notifications.service");
}

// Lets the background delivery finish: everything here settles in microtasks, which all run before this.
const flush = () => new Promise((resolve) => setImmediate(resolve));

const device = (userId, name) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${name}`, user_id: userId, keys: { p256dh: `p256dh-${name}`, auth: `auth-${name}` } });
const httpError = (statusCode) => Object.assign(new Error(`push service said ${statusCode}`), { statusCode });

const logs = { log: [], warn: [], error: [] };
const realConsole = { log: console.log, warn: console.warn, error: console.error };
const BREVO = { BREVO_API_KEY: process.env.BREVO_API_KEY, BREVO_SENDER_EMAIL: process.env.BREVO_SENDER_EMAIL };

test.beforeEach(() => {
  reset();
  pushed.length = 0;
  emailed.length = 0;
  pushImpl = async (subscription, payload) => void pushed.push({ subscription, payload });
  emailImpl = async (message) => void emailed.push(message);
  process.env.BREVO_API_KEY = "test-key";
  process.env.BREVO_SENDER_EMAIL = "hello@example.com";
  for (const level of Object.keys(logs)) {
    logs[level].length = 0;
    console[level] = (...args) => logs[level].push(args.join(" "));
  }
});
test.afterEach(() => {
  Object.assign(console, realConsole);
  for (const [key, value] of Object.entries(BREVO)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

// -------------------------------------------------------------------------------------------------

test("a client notification is saved, then pushed to each of the client's devices and emailed", async () => {
  const { notifyClient } = load();
  db.push_subscriptions.push(device(AUTH, "phone"), device(AUTH, "laptop"), device(OTHER_AUTH, "someone-else"));

  const saved = await notifyClient(CLIENT, { title: "Your adviser is checking in", body: "Your adviser wanted to check in." });
  await flush();

  assert.equal(saved, true);
  assert.equal(db.notifications.length, 1);
  const [row] = db.notifications;
  assert.match(row.id, /^[0-9a-f-]{36}$/);
  assert.deepEqual({ ...row, id: undefined }, { id: undefined, client_id: CLIENT, recipient: "client", title: "Your adviser is checking in", body: "Your adviser wanted to check in." });

  // Only this client's devices, and the same generic wording reminders.service.js sends.
  assert.deepEqual(pushed.map((p) => p.subscription.endpoint).sort(), [
    "https://fcm.googleapis.com/fcm/send/laptop",
    "https://fcm.googleapis.com/fcm/send/phone",
  ]);
  for (const { subscription, payload } of pushed) {
    assert.deepEqual(Object.keys(subscription).sort(), ["endpoint", "keys"]);
    assert.deepEqual(payload, {
      title: "Royal Square Financial",
      body: "You have a new update. Open Royal Square to view it.",
      tag: row.id,
      url: "/account",
    });
  }

  assert.equal(emailed.length, 1);
  assert.equal(emailed[0].to, "thabo@example.com");
  assert.equal(emailed[0].toName, "Thabo");
  assert.equal(emailed[0].subject, "Your adviser is checking in");
  assert.match(emailed[0].htmlContent, /<p>Hi Thabo,<\/p>/);
  assert.match(emailed[0].htmlContent, /<p>Your adviser wanted to check in\.<\/p>/);
});

test("devices are found by the client's login id, never by the client's own id", async () => {
  const { notifyClient } = load();
  // A row keyed by the client's users.id is a different person's data and must be ignored.
  db.push_subscriptions.push(device(CLIENT, "wrong-id"), device(AUTH, "right-id"));

  await notifyClient(CLIENT, { title: "T", body: "B" });
  await flush();

  assert.deepEqual(pushed.map((p) => p.subscription.endpoint), ["https://fcm.googleapis.com/fcm/send/right-id"]);
});

test("a client without a login is emailed but cannot be pushed to", async () => {
  const { notifyClient } = load();
  db.users[0].auth_user_id = null;
  db.push_subscriptions.push(device(AUTH, "phone"));

  assert.equal(await notifyClient(CLIENT, { title: "T", body: "B" }), true);
  await flush();

  assert.equal(pushed.length, 0);
  assert.equal(emailed.length, 1);
  assert.equal(reads.includes("push_subscriptions"), false, "no login means no subscription lookup");
  assert.match(logs.log.join("\n"), /haven't got a login yet/);
});

test("a client with a login but no device gets the email and a note in the log", async () => {
  const { notifyClient } = load();
  await notifyClient(CLIENT, { title: "T", body: "B" });
  await flush();

  assert.equal(pushed.length, 0);
  assert.equal(emailed.length, 1);
  assert.match(logs.log.join("\n"), /no device has push turned on/);
});

test("a client with no email address is pushed to but not emailed, and it is logged", async () => {
  const { notifyClient } = load();
  db.users[0].contact_email = null;
  db.push_subscriptions.push(device(AUTH, "phone"));

  assert.equal(await notifyClient(CLIENT, { title: "T", body: "B" }), true);
  await flush();

  assert.equal(pushed.length, 1);
  assert.equal(emailed.length, 0);
  assert.match(logs.warn.join("\n"), /no email address on file/);
});

test("one failing device never stops the others, and devices the push service says are gone are forgotten", async () => {
  const { notifyClient } = load();
  db.push_subscriptions.push(device(AUTH, "gone"), device(AUTH, "flaky"), device(AUTH, "ok"), device(AUTH, "never-existed"));
  pushImpl = async (subscription, payload) => {
    if (subscription.endpoint.endsWith("/gone")) throw httpError(410);
    if (subscription.endpoint.endsWith("/never-existed")) throw httpError(404);
    if (subscription.endpoint.endsWith("/flaky")) throw httpError(500);
    pushed.push({ subscription, payload });
  };

  assert.equal(await notifyClient(CLIENT, { title: "T", body: "B" }), true);
  await flush();

  assert.deepEqual(pushed.map((p) => p.subscription.endpoint), ["https://fcm.googleapis.com/fcm/send/ok"]);
  // 410 and 404 mean gone for good, so those are removed; a 500 may be temporary, so that one stays.
  assert.deepEqual(db.push_subscriptions.map((s) => s.endpoint.split("/").pop()).sort(), ["flaky", "ok"]);
  assert.equal(emailed.length, 1, "the email is unaffected");
  assert.equal(logs.warn.filter((line) => /push to one device failed/.test(line)).length, 3);
  assert.doesNotMatch(logs.warn.join("\n"), /fcm\.googleapis\.com/, "endpoints stay out of the logs");
});

test("a push that fails for any reason, even one with no status code, is swallowed", async () => {
  const { notifyClient } = load();
  db.push_subscriptions.push(device(AUTH, "phone"));
  pushImpl = async () => { throw new Error("socket hang up"); };

  assert.equal(await notifyClient(CLIENT, { title: "T", body: "B" }), true);
  await flush();

  assert.equal(db.push_subscriptions.length, 1, "a network error is not a reason to forget the device");
  assert.match(logs.warn.join("\n"), /socket hang up/);
  assert.equal(emailed.length, 1);
});

test("a mail provider error is logged and swallowed; the push and the notification are unaffected", async () => {
  const { notifyClient } = load();
  db.push_subscriptions.push(device(AUTH, "phone"));
  emailImpl = async () => { throw new Error("Brevo request failed (401): unauthorised"); };

  assert.equal(await notifyClient(CLIENT, { title: "T", body: "B" }), true);
  await flush();

  assert.equal(db.notifications.length, 1);
  assert.equal(pushed.length, 1);
  assert.match(logs.error.join("\n"), /could not email client .*Brevo request failed \(401\)/);
});

test("if the notification cannot be saved, nothing is pushed or emailed", async () => {
  const { notifyClient } = load();
  db.push_subscriptions.push(device(AUTH, "phone"));

  for (const mode of ["error", "throw"]) {
    failures.notifications = mode;
    assert.equal(await notifyClient(CLIENT, { title: "T", body: "B" }), false);
  }
  await flush();

  assert.equal(pushed.length, 0);
  assert.equal(emailed.length, 0);
  assert.equal(reads.length, 0, "not even the client was looked up");
});

test("if the client cannot be looked up, it is logged and the saved notification stands", async () => {
  const { notifyClient } = load();
  db.push_subscriptions.push(device(AUTH, "phone"));

  for (const mode of ["error", "throw"]) {
    failures.users = mode;
    assert.equal(await notifyClient(CLIENT, { title: "T", body: "B" }), true);
    await flush();
  }

  assert.equal(db.notifications.length, 2);
  assert.equal(pushed.length, 0);
  assert.equal(emailed.length, 0);
  assert.equal(logs.error.filter((line) => /could not deliver a push or email/.test(line)).length, 2);
});

test("if the device list cannot be read, the email still goes", async () => {
  const { notifyClient } = load();
  for (const mode of ["error", "throw"]) {
    failures.push_subscriptions = mode;
    emailed.length = 0;
    assert.equal(await notifyClient(CLIENT, { title: "T", body: "B" }), true);
    await flush();
    assert.equal(emailed.length, 1, `email despite a ${mode}`);
  }
  assert.match(logs.error.join("\n"), /could not look up push subscriptions/);
});

test("with push not configured the email still goes and no devices are read", async () => {
  const { notifyClient } = load({ push: false });
  db.push_subscriptions.push(device(AUTH, "phone"));

  await notifyClient(CLIENT, { title: "T", body: "B" });
  await flush();

  assert.equal(pushed.length, 0);
  assert.equal(emailed.length, 1);
  assert.equal(reads.includes("push_subscriptions"), false);
});

test("with neither push nor email configured nothing extra is looked up or logged", async () => {
  const { notifyClient } = load({ push: false });
  delete process.env.BREVO_API_KEY;

  assert.equal(await notifyClient(CLIENT, { title: "T", body: "B" }), true);
  await flush();

  assert.equal(db.notifications.length, 1);
  assert.deepEqual(reads, []);
  assert.deepEqual([logs.log, logs.warn, logs.error], [[], [], []]);
});

test("the email is plain, and everything in it that came from elsewhere is escaped", async () => {
  const { notifyClient } = load();
  db.users[0].first_name = "Thabo <b>&</b>";

  await notifyClient(CLIENT, { title: "Tom & Jerry's <update>", body: '<script>alert("x")</script> & more' });
  await flush();

  const [{ subject, htmlContent }] = emailed;
  assert.equal(subject, "Tom & Jerry's <update>", "the subject is plain text, not HTML");
  assert.doesNotMatch(htmlContent, /<script>|<b>/);
  assert.match(htmlContent, /Hi Thabo &lt;b&gt;&amp;&lt;\/b&gt;,/);
  assert.match(htmlContent, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; more/);
});

test("a notification with no body and a client with no first name still make a sensible email", async () => {
  const { notifyClient } = load();
  db.users[0].first_name = null;

  await notifyClient(CLIENT, { title: "All onboarding documents complete", body: undefined });
  await flush();

  const [{ htmlContent, toName }] = emailed;
  assert.match(htmlContent, /<p>Hi,<\/p>/);
  assert.equal((htmlContent.match(/<p>/g) || []).length, 2, "a greeting and the closing line, no empty paragraph");
  assert.equal(toName, null);
});

test("push and email run in the background: a hanging push service or mail provider never holds up the caller", async () => {
  const { notifyClient } = load();
  db.push_subscriptions.push(device(AUTH, "phone"));
  pushImpl = () => new Promise(() => {}); // never answers
  emailImpl = () => new Promise(() => {}); // never answers

  const outcome = await Promise.race([
    notifyClient(CLIENT, { title: "T", body: "B" }),
    new Promise((resolve) => setTimeout(() => resolve("still waiting"), 250)),
  ]);

  assert.equal(outcome, true);
});

test("delivering never rejects, however much goes wrong", async () => {
  const { deliverToClient } = load();
  db.push_subscriptions.push(device(AUTH, "phone"));
  pushImpl = async () => { throw new TypeError("boom"); };
  emailImpl = async () => { throw new TypeError("boom"); };
  failures.push_subscriptions = "throw";

  await assert.doesNotReject(deliverToClient(CLIENT, { id: "n1", title: "T", body: "B" }));
  failures.users = "throw";
  await assert.doesNotReject(deliverToClient(CLIENT, { id: "n1", title: "T", body: "B" }));
  await assert.doesNotReject(deliverToClient(undefined, { id: "n1", title: "T", body: "B" }));
});

test("with no client id there is nothing to notify", async () => {
  const { notifyClient } = load();
  assert.equal(await notifyClient(undefined, { title: "T", body: "B" }), false);
  assert.equal(await notifyClient(null, { title: "T", body: "B" }), false);
  assert.equal(db.notifications.length, 0);
});

test("adviser notifications stay in-app only", async () => {
  const { notifyAdviser } = load();
  db.push_subscriptions.push(device(AUTH, "phone"));

  assert.equal(await notifyAdviser(ADVISER, CLIENT, { title: "Thabo signed a document", body: "Open their profile." }), true);
  await flush();

  assert.deepEqual(db.notifications, [{ client_id: CLIENT, advisor_id: ADVISER, recipient: "advisor", title: "Thabo signed a document", body: "Open their profile." }]);
  assert.equal(pushed.length, 0);
  assert.equal(emailed.length, 0);
  assert.deepEqual(reads, []);
  assert.equal(await notifyAdviser(null, CLIENT, { title: "T", body: "B" }), false, "no adviser, nothing to notify");
});
