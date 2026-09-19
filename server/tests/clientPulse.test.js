const test = require("node:test");
const assert = require("node:assert/strict");

const NOW = new Date("2026-09-19T10:00:00Z");
const DAY = 86400000;
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY).toISOString();
const dateOnly = (offsetDays) => new Date(NOW.getTime() + offsetDays * DAY).toISOString().slice(0, 10);
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// --- Fake Supabase: in-memory tables with just the query shapes the dashboard service uses.
const tables = {};
let insertFails = false;

function from(table) {
  const filters = [];
  let range = null;
  const rows = () => {
    const hit = (tables[table] || []).filter((row) =>
      filters.every(([col, val, isIn]) => (isIn ? val.includes(row[col]) : row[col] === val))
    );
    return range ? hit.slice(range[0], range[1] + 1) : hit;
  };
  const builder = {
    select: () => builder,
    eq: (col, val) => (filters.push([col, val]), builder),
    in: (col, val) => (filters.push([col, val, true]), builder),
    order: () => builder,
    range: (start, end) => ((range = [start, end]), builder),
    insert: async (row) => {
      if (insertFails) return { error: { message: "insert refused" } };
      (tables[table] ||= []).push(row);
      return { error: null };
    },
    then: (resolve, reject) => Promise.resolve({ data: rows(), error: null }).then(resolve, reject),
  };
  return builder;
}

function stubModule(relativePath, exports) {
  const file = require.resolve(relativePath);
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}
const sessions = { "advisor-token": { id: "adviser-1", app_metadata: { role: "advisor" } }, "client-token": { id: "u-client", app_metadata: {} } };
const auth = {
  async getUser(token) {
    const user = sessions[token];
    return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: "bad jwt" } };
  },
};
stubModule("../src/config/supabaseClient", { supabaseAdmin: { from, auth } });
let openTasks = [];
stubModule("../src/services/tasks.service", {
  // Mirrors the real listTasks: `clientId` narrows to one client.
  listTasks: async (user, filters = {}) => openTasks.filter((t) => !filters.clientId || t.client.id === filters.clientId),
});

const service = require("../src/services/dashboard.service");
const { RISK_WEIGHTS, AT_RISK_LIST_LIMIT, AT_RISK_MIN_SCORE, AT_RISK_HIGH_SCORE } = require("../src/constants/dashboard");
const ADVISER = { id: "adviser-1" };

const client = (n, first, extra = {}) => ({
  id: id(n), role_id: 1, first_name: first, second_name: null, surname: "Test", status: "active",
  created_at: daysAgo(200), risk_profile_category: null, is_politically_exposed: false, ...extra,
});
const sentDoc = (n, type, sentDaysAgo) => ({
  client_id: id(n), document_type: type, status: "sent", sent_at: daysAgo(sentDaysAgo), signed_at: null, expires_at: null,
});
const reminder = (n, offsetDays, extra = {}) => ({ id: `r-${n}-${offsetDays}`, client_id: id(n), title: "Annual review", trigger_date: dateOnly(offsetDays), status: "pending", ...extra });
const goal = (n, extra = {}) => ({ id: `g-${n}`, client_id: id(n), goal_name: "Emergency fund", status: "in_progress", target_amount: 50000, current_progress: 0, target_date: "2027-01-01", ...extra });
const task = (n, updatedDaysAgo, extra = {}) => ({
  id: id(900 + n), client: { id: id(n), name: "x" }, reference: `RSF-${n}`, title: "Change of address", typeLabel: "Change of address",
  status: "open", waitingOn: "us", updatedAt: daysAgo(updatedDaysAgo), ...extra,
});

function reset() {
  for (const key of Object.keys(tables)) delete tables[key];
  tables.users = [];
  tables.client_goals = [];
  tables.documents = [];
  tables.reminders = [];
  tables.notifications = [];
  openTasks = [];
  insertFails = false;
}

// Thabo (1) has every signal; Ayesha (2) one unsigned document; Sipho (3), Lerato (4) and Naledi (5)
// each have something going on that is too small to count.
function seedPractice() {
  reset();
  tables.users = [
    client(1, "Thabo", { status: "onboarding", created_at: daysAgo(20) }),
    client(2, "Ayesha"),
    client(3, "Sipho"),
    client(4, "Lerato"),
    client(5, "Naledi"),
    { id: id(99), role_id: 2, first_name: null, surname: null, status: "active", created_at: daysAgo(5) }, // a provider, never scored
  ];
  tables.documents = [
    { client_id: id(1), document_type: "fais_disclosure", status: "signed", sent_at: daysAgo(19), signed_at: daysAgo(18), expires_at: null },
    sentDoc(1, "broker_appointment", 10),
    sentDoc(2, "client_consent", 8),
    sentDoc(3, "service_agreement", 3), // sent recently: not a signal yet
  ];
  tables.reminders = [
    reminder(1, -3), reminder(1, -1), reminder(1, 0), reminder(1, 5),
    reminder(3, -2), // one overdue reminder alone is below the threshold
    reminder(4, -10, { status: "completed" }), // completed reminders are never fetched
  ];
  tables.client_goals = [
    goal(1),
    goal(4), // a stalled goal alone is below the threshold
    goal(5, { current_progress: 100 }), // has progress
  ];
  openTasks = [task(1, 9), task(2, 2)];
}

test("clients are scored from all five signals and ranked riskiest first", async () => {
  seedPractice();
  const { clients, flaggedTotal, scale } = await service.getAtRiskClients(ADVISER, NOW);

  assert.deepEqual(clients.map((c) => c.name), ["Thabo Test", "Ayesha Test"]);
  assert.equal(flaggedTotal, 2);
  assert.deepEqual(scale, { mediumAbove: AT_RISK_MIN_SCORE, highAbove: AT_RISK_HIGH_SCORE });

  const [thabo, ayesha] = clients;
  const expected = RISK_WEIGHTS.unsignedDocument + RISK_WEIGHTS.overdueReminder * 2 + RISK_WEIGHTS.staleTask + RISK_WEIGHTS.stalledGoal + RISK_WEIGHTS.stalledOnboarding;
  assert.equal(thabo.score, expected);
  assert.equal(thabo.level, "high");
  assert.equal(ayesha.score, RISK_WEIGHTS.unsignedDocument);
  assert.equal(ayesha.level, "medium");
});

test("reasons name the actual problem, heaviest first", async () => {
  seedPractice();
  const { clients } = await service.getAtRiskClients(ADVISER, NOW);
  assert.deepEqual(clients[0].reasons, [
    "Still in onboarding after 20 days", // weight 4
    "Broker Appointment unsigned for 10 days", // 3
    "Request open 9 days with no update", // 3
    "2 overdue reminders", // 2 (ties with the goal, so they keep signal order)
    "Emergency fund goal has no progress", // 2
  ]);
  assert.deepEqual(clients[1].reasons, ["Client Consent unsigned for 8 days"]);
});

test("signals only count once they cross their threshold", async () => {
  seedPractice();
  tables.documents = [sentDoc(1, "broker_appointment", 6), sentDoc(2, "client_consent", 7)];
  openTasks = [task(1, 6), task(2, 7)];
  tables.reminders = [reminder(3, 0)]; // due today is not overdue
  tables.client_goals = [goal(1, { current_progress: 1 }), goal(2, { status: "completed" }), goal(3, { current_progress: null })];
  tables.users[0].created_at = daysAgo(13);

  const { clients } = await service.getAtRiskClients(ADVISER, NOW);
  const byName = Object.fromEntries(clients.map((c) => [c.name, c.reasons]));
  assert.deepEqual(byName["Ayesha Test"], ["Client Consent unsigned for 7 days", "Request open 7 days with no update"]);
  assert.equal(byName["Thabo Test"], undefined, "6 days, progress made and 13 days onboarding: nothing to flag");
  assert.equal(byName["Sipho Test"], undefined, "due today plus one stalled goal is 2, not above the minimum");
});

test("only the top five are returned, but the total flagged is reported", async () => {
  reset();
  for (let n = 1; n <= 8; n++) {
    tables.users.push(client(n, `Client${n}`));
    tables.documents.push(sentDoc(n, "client_consent", 8 + n)); // every client has one stale document...
    if (n % 2 === 0) tables.documents.push(sentDoc(n, "broker_appointment", 8)); // ...even ones have two
  }
  const result = await service.getAtRiskClients(ADVISER, NOW);
  assert.equal(result.clients.length, AT_RISK_LIST_LIMIT);
  assert.equal(result.flaggedTotal, 8);
  assert.equal(result.limit, AT_RISK_LIST_LIMIT);
  // Four clients have two stale documents and rank first; the fifth place goes to a one-document client.
  const double = 2 * RISK_WEIGHTS.unsignedDocument;
  assert.deepEqual(result.clients.map((c) => c.score), [double, double, double, double, RISK_WEIGHTS.unsignedDocument]);
});

test("an empty practice returns an empty ranking", async () => {
  reset();
  const result = await service.getAtRiskClients(ADVISER, NOW);
  assert.deepEqual(result.clients, []);
  assert.equal(result.flaggedTotal, 0);
});

test("the drill-down lists every signal with its underlying data, oldest first", async () => {
  seedPractice();
  const pulse = await service.getClientPulse(ADVISER, id(1), NOW);

  assert.deepEqual(pulse.client, { id: id(1), name: "Thabo Test", status: "onboarding" });
  assert.equal(pulse.level, "high");
  assert.deepEqual(pulse.signals.map((s) => s.kind), ["onboarding", "document", "task", "reminder", "goal"]);

  // Oldest first: onboarding (20 days), document (10), task (9), reminders (3), then the undated goal.
  const [onboarding, document, taskSignal, reminders, goalSignal] = pulse.signals;
  assert.equal(onboarding.days, 20);
  assert.deepEqual([onboarding.signed, onboarding.awaitingClient, onboarding.notSent], [1, 1, 3]);
  assert.equal(document.documentType, "broker_appointment");
  assert.equal(document.label, "Broker Appointment");
  assert.equal(document.sentAt, undefined, "dates come through `since`");
  assert.equal(document.since, daysAgo(10));
  assert.deepEqual(reminders.reminders.map((r) => [r.title, r.triggerDate, r.daysOverdue]), [
    ["Annual review", dateOnly(-3), 3],
    ["Annual review", dateOnly(-1), 1],
  ]);
  assert.deepEqual([taskSignal.reference, taskSignal.title, taskSignal.status, taskSignal.days], ["RSF-1", "Change of address", "open", 9]);
  assert.deepEqual([goalSignal.goalName, goalSignal.targetAmount, goalSignal.currentProgress, goalSignal.since], ["Emergency fund", 50000, 0, null]);
});

test("the drill-down works for a client who is not at risk", async () => {
  seedPractice();
  const pulse = await service.getClientPulse(ADVISER, id(5), NOW);
  assert.equal(pulse.score, 0);
  assert.equal(pulse.level, "low");
  assert.deepEqual(pulse.signals, []);
  assert.deepEqual(pulse.reasons, []);
});

test("the drill-down only reads the requested client's data", async () => {
  seedPractice();
  const pulse = await service.getClientPulse(ADVISER, id(2), NOW);
  assert.deepEqual(pulse.reasons, ["Client Consent unsigned for 8 days"], "Thabo's reminders, goals and tasks don't leak in");
});

test("an unknown client is a 404 and a malformed id is a 400", async () => {
  seedPractice();
  await assert.rejects(service.getClientPulse(ADVISER, id(404), NOW), (e) => e.status === 404 && /not found/i.test(e.message));
  await assert.rejects(service.getClientPulse(ADVISER, id(99), NOW), (e) => e.status === 404, "a provider is not a client");
  await assert.rejects(service.getClientPulse(ADVISER, "nope", NOW), (e) => e.status === 400);
});

test("a check-in notifies the client and says why they were flagged", async () => {
  seedPractice();
  const sent = await service.sendCheckIn(ADVISER, id(1), NOW);

  assert.equal(tables.notifications.length, 1);
  const [row] = tables.notifications;
  assert.equal(row.client_id, id(1));
  assert.equal(row.recipient, "client");
  assert.equal(row.title, "Your adviser is checking in");
  assert.match(row.body, /^Your adviser wanted to check in: /);
  assert.match(row.body, /your onboarding isn't finished yet/, "heaviest signal first");
  assert.match(row.body, /the Broker Appointment is waiting for your signature/);
  assert.doesNotMatch(row.body, /overdue/, "only the two heaviest signals are mentioned");

  assert.deepEqual(sent, { clientId: id(1), clientName: "Thabo Test", title: row.title, body: row.body, sentAt: NOW.toISOString() });
});

test("a client with nothing flagged still gets a polite generic check-in", async () => {
  seedPractice();
  await service.sendCheckIn(ADVISER, id(5), NOW);
  assert.equal(tables.notifications[0].body, "Your adviser wanted to check in. Get in touch if there is anything you need.");
});

test("a check-in that can't be saved is reported as a failure, never as success", async () => {
  seedPractice();
  insertFails = true;
  const log = console.error;
  console.error = () => {};
  try {
    await assert.rejects(service.sendCheckIn(ADVISER, id(1), NOW), (e) => e.status === 502 && /couldn't be sent/.test(e.message));
  } finally {
    console.error = log;
  }
  assert.equal(tables.notifications.length, 0);
});

test("checking in on an unknown client sends nothing", async () => {
  seedPractice();
  await assert.rejects(service.sendCheckIn(ADVISER, id(404), NOW), (e) => e.status === 404);
  assert.equal(tables.notifications.length, 0);
});

test("check-in wording is built per signal kind", () => {
  const { body } = service.checkInMessage([
    { kind: "goal", weight: 2, goalName: "Holiday" },
    { kind: "task", weight: 3, title: "Change of address" },
    { kind: "reminder", weight: 1, reminders: [{}] },
  ]);
  assert.equal(body, 'Your adviser wanted to check in: your request "Change of address" is still open, and your "Holiday" goal hasn\'t started yet. Get in touch if you need a hand.');
  assert.match(service.checkInMessage([{ kind: "reminder", weight: 2, reminders: [{}, {}] }]).body, /you have 2 overdue reminders/);
  assert.match(service.checkInMessage([{ kind: "reminder", weight: 1, reminders: [{}] }]).body, /you have an overdue reminder/);
});

// --- Through the real router, auth middleware, controller and service: the JSON envelope the
// frontend's api/dashboard.js reads ({ atRisk }, { pulse }, { checkIn }).
const express = require("express");
const app = express();
app.use(express.json());
app.use("/api/dashboard", require("../src/routes/dashboard.routes"));
let server;
let base;
test.before(async () => {
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => new Promise((resolve) => server.close(resolve)));
const call = async (method, path, token = "advisor-token") => {
  const response = await fetch(base + path, { method, headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: response.status, json: await response.json() };
};

test("HTTP: the ranking is served as { atRisk } to advisers only", async () => {
  seedPractice();
  const ok = await call("GET", "/api/dashboard/at-risk");
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.json.atRisk.clients.map((c) => c.name), ["Thabo Test", "Ayesha Test"]);
  assert.equal(typeof ok.json.atRisk.generatedAt, "string");
  assert.deepEqual(Object.keys(ok.json.atRisk.clients[0]).sort(), ["id", "level", "name", "reasons", "score", "status"]);

  assert.equal((await call("GET", "/api/dashboard/at-risk", null)).status, 401);
  assert.equal((await call("GET", "/api/dashboard/at-risk", "client-token")).status, 403);
});

test("HTTP: the drill-down is served as { pulse } and unknown clients are 404s", async () => {
  seedPractice();
  const ok = await call("GET", `/api/dashboard/at-risk/${id(1)}`);
  assert.equal(ok.status, 200);
  assert.equal(ok.json.pulse.client.name, "Thabo Test");
  assert.equal(ok.json.pulse.signals.length, 5);

  const missing = await call("GET", `/api/dashboard/at-risk/${id(404)}`);
  assert.equal(missing.status, 404);
  assert.equal(typeof missing.json.error, "string");
  assert.equal((await call("GET", "/api/dashboard/at-risk/nope")).status, 400);
});

test("HTTP: the check-in is served as { checkIn } and really creates the client's notification", async () => {
  seedPractice();
  const ok = await call("POST", `/api/dashboard/at-risk/${id(1)}/check-in`);
  assert.equal(ok.status, 200);
  assert.equal(ok.json.checkIn.clientName, "Thabo Test");
  assert.equal(tables.notifications.length, 1);
  assert.equal(tables.notifications[0].body, ok.json.checkIn.body);

  assert.equal((await call("POST", `/api/dashboard/at-risk/${id(1)}/check-in`, "client-token")).status, 403);
  assert.equal(tables.notifications.length, 1, "a client can't check in on themselves");

  insertFails = true;
  const log = console.error;
  console.error = () => {};
  try {
    const failed = await call("POST", `/api/dashboard/at-risk/${id(1)}/check-in`);
    assert.equal(failed.status, 502);
    assert.match(failed.json.error, /couldn't be sent/);
  } finally {
    console.error = log;
  }
});
