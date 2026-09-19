const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const { createStore, demoUsers } = require("./store");
const { createService, nextOccurrence } = require("./service");
const { createReminders } = require("./index");
const adviser = demoUsers[0];
const otherAdviser = demoUsers[1];
const client = demoUsers[2];
const otherClient = demoUsers[3];
const now = () => new Date("2026-09-19T08:00:00Z");
function fixture(overrides = {}) {
  const store = createStore();
  const service = createService({
    store,
    getUsers: async () => demoUsers,
    now,
    ...overrides,
  });
  return { store, service };
}
test("month-end and leap-year reminders retain their original anchor", () => {
  assert.equal(nextOccurrence("2024-01-31", 1, "2024-01-31"), "2024-02-29");
  assert.equal(nextOccurrence("2024-01-31", 1, "2024-02-29"), "2024-03-31");
  assert.equal(nextOccurrence("2024-02-29", 12, "2027-03-01"), "2028-02-29");
});
test("due reminders notify both advisers and client once, and advance recurrence", async () => {
  const { service, store } = fixture();
  await service.addReminder(adviser, {
    clientId: client.clientId,
    ruleId: "valuation",
    dueDate: "2026-09-19",
  });
  await Promise.all([service.tick(), service.tick()]);
  await service.tick();
  assert.equal(store.data.notifications.length, 3);
  assert.equal(service.notifications(otherClient).length, 0);
  assert.equal(store.data.reminders[0].dueDate, "2028-09-19");
});
test("paused rules do not fire; one-time dates fire only once; completed reminders stop", async () => {
  const { service, store } = fixture();
  const rule = service.rules().find((r) => r.id === "licence");
  service.saveRule(adviser, { ...rule, enabled: false }, rule.id);
  await assert.rejects(
    service.addReminder(adviser, {
      clientId: client.clientId,
      ruleId: rule.id,
      dueDate: "2026-09-19",
    }),
    { status: 400 },
  );
  service.saveRule(adviser, { ...rule, enabled: true }, rule.id);
  const r = await service.addReminder(adviser, {
    clientId: client.clientId,
    ruleId: rule.id,
    dueDate: "2026-09-19",
  });
  service.saveRule(adviser, { ...rule, enabled: false }, rule.id);
  await service.tick();
  assert.equal(store.data.notifications.length, 0);
  service.saveRule(adviser, { ...rule, enabled: true }, rule.id);
  await service.tick();
  await service.tick();
  assert.equal(store.data.notifications.length, 1);
  assert.equal(store.data.reminders[0].status, "notified");
  service.completeReminder(adviser, r.id);
  await service.tick();
  assert.equal(store.data.notifications.length, 1);
});
test("South Africa date boundary and missed recurring schedules are handled", async () => {
  const { service, store } = fixture({
    now: () => new Date("2026-09-18T22:05:00Z"),
  });
  await service.addReminder(adviser, {
    clientId: client.clientId,
    ruleId: "birthday",
    dueDate: "2020-09-19",
  });
  await service.tick();
  assert.equal(store.data.reminders[0].dueDate, "2027-09-19");
  assert.equal(store.data.notifications.length, 3);
});
test("rules, dates, recipients and clients are validated; client cannot manage reminders", async () => {
  const { service } = fixture();
  assert.throws(
    () =>
      service.saveRule(client, {
        title: "Bad",
        audience: "both",
        repeatMonths: 12,
      }),
    { status: 403 },
  );
  for (const dueDate of ["2026-02-30", "tomorrow", ""])
    await assert.rejects(
      service.addReminder(adviser, {
        clientId: client.clientId,
        ruleId: "birthday",
        dueDate,
      }),
      { status: 400 },
    );
  for (const repeatMonths of [-1, 1.5, "12", 121])
    assert.throws(
      () =>
        service.saveRule(adviser, {
          title: "Bad",
          audience: "both",
          repeatMonths,
        }),
      { status: 400 },
    );
  await assert.rejects(
    service.addReminder(adviser, {
      clientId: "missing",
      ruleId: "birthday",
      dueDate: "2026-09-19",
    }),
    { status: 404 },
  );
  await assert.rejects(
    service.addReminder(client, {
      clientId: client.clientId,
      ruleId: "birthday",
      dueDate: "2026-09-19",
    }),
    { status: 403 },
  );
});
test("client inbox, reminder and conversation access are isolated", async () => {
  const { service } = fixture();
  await service.addReminder(adviser, {
    clientId: client.clientId,
    ruleId: "retirement-fee",
    dueDate: "2026-09-19",
  });
  await service.tick();
  assert.equal(service.reminders(client).length, 0);
  assert.equal(service.reminders(otherClient).length, 0);
  const n = service.notifications(adviser)[0];
  assert.throws(() => service.readNotification(client, n.id), { status: 404 });
  await assert.rejects(service.messages(otherClient, client.clientId), {
    status: 403,
  });
  await assert.rejects(
    service.sendMessage(otherClient, { clientId: client.clientId, body: "No" }),
    { status: 403 },
  );
});
test("all advisers can reply to any client; clients notify both advisers", async () => {
  const { service } = fixture();
  await service.sendMessage(client, {
    clientId: client.clientId,
    body: "Hello team",
  });
  assert.equal(service.notifications(adviser).length, 1);
  assert.equal(service.notifications(otherAdviser).length, 1);
  await service.sendMessage(otherAdviser, {
    clientId: client.clientId,
    body: "Happy to help",
  });
  assert.equal((await service.messages(client, client.clientId)).length, 2);
  assert.equal(service.notifications(client).length, 1);
  await assert.rejects(
    service.sendMessage(client, { clientId: client.clientId, body: "   " }),
    { status: 400 },
  );
});
test("trusted claim events are idempotent and client-scoped", async () => {
  const { service, store } = fixture();
  const event = {
    eventId: "claim-12-stage-2",
    clientId: client.clientId,
    type: "claim.stage_changed",
    title: "Claim assessed",
    body: "Your assessment is ready.",
  };
  await service.publishEvent(event);
  await service.publishEvent(event);
  assert.equal(store.data.notifications.length, 3);
  assert.equal(service.notifications(otherClient).length, 0);
});
test("financial pull checks consent every time and calculates net worth", async () => {
  let consent = { valid: true, expiresAt: "2027-01-01T00:00:00Z" };
  const { service, store } = fixture({ checkConsent: async () => consent });
  const snapshot = await service.financialPull(client, client.clientId);
  assert.equal(snapshot.netWorth, 410000);
  assert.equal(snapshot.simulated, true);
  for (const invalid of [
    { valid: false, expiresAt: "2027-01-01" },
    { valid: true },
    { valid: true, expiresAt: "bad" },
    { valid: true, expiresAt: now().toISOString() },
  ]) {
    consent = invalid;
    await assert.rejects(service.financialPull(client, client.clientId), {
      status: 403,
    });
  }
  assert.equal(store.data.snapshots.length, 1);
  await assert.rejects(service.financialPull(otherClient, client.clientId), {
    status: 403,
  });
  const denied = fixture();
  await assert.rejects(denied.service.financialPull(client, client.clientId), {
    status: 403,
  });
  const unavailable = fixture({
    checkConsent: async () => {
      throw new Error("offline");
    },
  });
  await assert.rejects(
    unavailable.service.financialPull(client, client.clientId),
    { status: 503 },
  );
});
test("push removes expired subscriptions, retries transient failures and hides private text", async () => {
  let attempts = 0;
  const payloads = [];
  const { service, store } = fixture({
    pushPublicKey: "test",
    push: async (subscription, payload) => {
      payloads.push(payload);
      attempts++;
      if (subscription.endpoint.endsWith("expired")) throw { statusCode: 410 };
      if (attempts === 2) throw { statusCode: 503 };
    },
  });
  store.transaction((draft) =>
    draft.subscriptions.push(
      { userId: client.id, endpoint: "https://fcm.googleapis.com/expired" },
      { userId: client.id, endpoint: "https://fcm.googleapis.com/valid" },
    ),
  );
  await service.sendMessage(adviser, {
    clientId: client.clientId,
    body: "Private account detail",
  });
  await service.flushPush();
  await service.flushPush();
  await service.flushPush();
  assert.equal(store.data.subscriptions.length, 1);
  assert.equal(attempts, 3);
  assert.equal(store.data.notifications[0].pushStatus, "sent");
  assert.ok(payloads.every((p) => !p.body.includes("Private")));
  assert.throws(
    () =>
      service.subscribe(client, {
        endpoint: "http://localhost/private",
        keys: {},
      }),
    { status: 400 },
  );
});
test("persistent store survives restart and does not repeat delivered reminders", async () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "royal-square-test-"),
  );
  try {
    const file = path.join(directory, "data.json");
    const first = fixture({ store: createStore(file) });
    await first.service.addReminder(adviser, {
      clientId: client.clientId,
      ruleId: "licence",
      dueDate: "2026-09-19",
    });
    await first.service.tick();
    const store = createStore(file);
    const restarted = fixture({ store });
    await restarted.service.tick();
    assert.equal(store.data.notifications.length, 1);
  } finally {
    fs.rmSync(directory, { recursive: true });
  }
});
test("HTTP routes require authentication, isolate clients and reject client rule writes", async (t) => {
  const app = express();
  app.use(express.json());
  const reminders = createReminders({ demo: true, store: createStore(), now });
  app.use("/api/reminders", reminders.router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/reminders`;
  assert.equal((await fetch(`${url}/notifications`)).status, 401);
  const headers = {
    "X-Demo-User": client.id,
    "Content-Type": "application/json",
  };
  assert.equal(
    (
      await fetch(`${url}/rules`, {
        method: "POST",
        headers,
        body: JSON.stringify({ title: "Bad" }),
      })
    ).status,
    403,
  );
  assert.equal(
    (await fetch(`${url}/messages/${otherClient.clientId}`, { headers }))
      .status,
    403,
  );
  const clients = await (await fetch(`${url}/clients`, { headers })).json();
  assert.equal(clients.length, 1);
  assert.equal(clients[0].id, client.clientId);
  assert.equal(
    (
      await fetch(`${url}/financial-pull/${client.clientId}`, {
        method: "POST",
        headers,
      })
    ).status,
    200,
  );
});
test("normal mode never trusts demo headers", async (t) => {
  const app = express();
  app.use(express.json());
  app.use("/api/reminders", createReminders({ store: createStore() }).router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  assert.equal(
    (
      await fetch(
        `http://127.0.0.1:${server.address().port}/api/reminders/clients`,
        { headers: { "X-Demo-User": adviser.id } },
      )
    ).status,
    401,
  );
});
