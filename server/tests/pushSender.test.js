const test = require("node:test");
const assert = require("node:assert/strict");

// web-push is replaced, so no key is ever validated for real and nothing is sent.
const calls = { vapid: [], sent: [] };
const failWith = { vapid: null };
const webpushPath = require.resolve("web-push");
require.cache[webpushPath] = {
  id: webpushPath,
  filename: webpushPath,
  loaded: true,
  exports: {
    setVapidDetails: (...args) => {
      if (failWith.vapid) throw failWith.vapid;
      calls.vapid.push(args);
    },
    sendNotification: async (...args) => {
      calls.sent.push(args);
      return { statusCode: 201 };
    },
  },
};
const { createPushSender } = require("../src/utils/pushSender");

const KEYS = ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"];
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
const warnings = [];
const realWarn = console.warn;

test.beforeEach(() => {
  for (const key of KEYS) delete process.env[key];
  calls.vapid.length = 0;
  calls.sent.length = 0;
  failWith.vapid = null;
  warnings.length = 0;
  console.warn = (message) => warnings.push(message);
});
test.afterEach(() => {
  console.warn = realWarn;
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

const configure = () => Object.assign(process.env, { VAPID_PUBLIC_KEY: "public-key", VAPID_PRIVATE_KEY: "private-key", VAPID_SUBJECT: "mailto:ops@example.com" });

test("with all three VAPID settings it returns a sender that pushes a JSON payload", async () => {
  configure();
  const push = createPushSender();

  assert.equal(typeof push, "function");
  assert.deepEqual(calls.vapid, [["mailto:ops@example.com", "public-key", "private-key"]]);

  const subscription = { endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "a", auth: "b" } };
  const result = await push(subscription, { title: "Hi", body: "There", tag: "t", url: "/account" });

  assert.deepEqual(result, { statusCode: 201 });
  assert.deepEqual(calls.sent, [[subscription, JSON.stringify({ title: "Hi", body: "There", tag: "t", url: "/account" }), { TTL: 86400, timeout: 10000 }]]);
  assert.deepEqual(warnings, []);
});

test("with none of the settings it returns null and says nothing", () => {
  assert.equal(createPushSender(), null);
  assert.deepEqual(calls.vapid, []);
  assert.deepEqual(warnings, []);
});

test("with only some of the settings it returns null and explains what to set", () => {
  process.env.VAPID_PUBLIC_KEY = "public-key";
  assert.equal(createPushSender(), null);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Push notifications are OFF: set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT/);
  assert.deepEqual(calls.vapid, []);
});

test("with settings the library rejects it returns null and reports why", () => {
  configure();
  failWith.vapid = new Error("Vapid public key must be URL safe Base64");
  assert.equal(createPushSender(), null);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Push notifications are OFF: invalid VAPID settings \(Vapid public key must be URL safe Base64\)/);
});

test("warn: false returns the same answers without repeating the warnings", () => {
  process.env.VAPID_SUBJECT = "mailto:ops@example.com";
  assert.equal(createPushSender({ warn: false }), null);

  configure();
  failWith.vapid = new Error("bad key");
  assert.equal(createPushSender({ warn: false }), null);
  assert.deepEqual(warnings, []);

  failWith.vapid = null;
  assert.equal(typeof createPushSender({ warn: false }), "function");
});

test("each call reads the environment afresh", () => {
  assert.equal(createPushSender(), null);
  configure();
  assert.equal(typeof createPushSender(), "function");
});
