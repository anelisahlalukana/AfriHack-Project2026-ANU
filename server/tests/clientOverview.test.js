const test = require("node:test");
const assert = require("node:assert/strict");

const NOW = new Date("2026-09-20T10:00:00Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();
const dateOnly = (n) => new Date(NOW.getTime() + n * 86400000).toISOString().slice(0, 10);

// --- Fake Supabase: in-memory tables with just the query shapes the service uses.
const tables = {};

function from(table) {
  const filters = [];
  let limit = null;
  const rows = () => {
    const hit = (tables[table] || []).filter((row) =>
      filters.every(([col, val, isIn]) => (isIn ? val.includes(row[col]) : row[col] === val))
    );
    return limit === null ? hit : hit.slice(0, limit);
  };
  const builder = {
    select: () => builder,
    eq: (col, val) => (filters.push([col, val]), builder),
    in: (col, val) => (filters.push([col, val, true]), builder),
    order: () => builder,
    limit: (n) => ((limit = n), builder),
    maybeSingle: async () => ({ data: rows()[0] || null, error: null }),
    then: (resolve, reject) => Promise.resolve({ data: rows(), error: null }).then(resolve, reject),
  };
  return builder;
}

function stubModule(relativePath, exports) {
  const file = require.resolve(relativePath);
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}
stubModule("../src/config/supabaseClient", { supabaseAdmin: { from } });

// The task list the client would see, shaped as tasks.service.listTasks returns it.
let taskList = [];
stubModule("../src/services/tasks.service", { listTasks: async () => taskList });

const { getClientOverview } = require("../src/services/clientOverview.service");

const CLIENT = "client-1";
const LOGIN = { id: "auth-1", app_metadata: {} };

function doc(document_type, status, extra = {}) {
  return { client_id: CLIENT, document_type, status, sent_at: null, signed_at: null, expires_at: null, ...extra };
}

function seed() {
  tables.users = [
    {
      id: CLIENT,
      role_id: 1,
      auth_user_id: "auth-1",
      advisor_id: "adviser-1",
      first_name: "Thabo",
      surname: "Mokoena",
      status: "active",
      risk_profile_category: "balanced",
      created_at: daysAgo(400),
    },
  ];
  tables.documents = [
    doc("fais_disclosure", "signed", { signed_at: daysAgo(300) }),
    doc("confidentiality_agreement", "signed", { signed_at: daysAgo(300) }),
    // Waiting on the client for longer than UNSIGNED_DOCUMENT_DAYS: urgent.
    doc("broker_appointment", "sent", { sent_at: daysAgo(12) }),
    doc("service_agreement", "sent", { sent_at: daysAgo(1) }),
    // Signed 11 months ago, so it lapses inside the 30-day warning window.
    doc("client_consent", "signed", { signed_at: daysAgo(340) }),
  ];
  tables.client_financial_items = [
    { client_id: CLIENT, category: "asset", item_type: "Retirement fund", description: null, amount: 800000 },
    { client_id: CLIENT, category: "asset", item_type: "Savings", description: "Emergency fund", amount: 120000 },
    { client_id: CLIENT, category: "liability", item_type: "Home loan", description: null, amount: 450000 },
  ];
  tables.client_goals = [
    {
      id: "goal-1",
      client_id: CLIENT,
      goal_name: "Retire at 60",
      goal_type: "retirement",
      status: "in_progress",
      target_amount: 2000000,
      current_progress: 500000,
      target_date: dateOnly(900),
    },
    {
      id: "goal-2",
      client_id: CLIENT,
      goal_name: "New car",
      goal_type: "purchase",
      status: "in_progress",
      target_amount: 300000,
      current_progress: 60000,
      target_date: dateOnly(-30), // target date has passed
    },
    {
      id: "goal-3",
      client_id: CLIENT,
      goal_name: "Wedding",
      goal_type: "life",
      status: "achieved",
      target_amount: 150000,
      current_progress: 150000,
      target_date: dateOnly(-400),
    },
  ];
  tables.client_dependants = [{ id: "dep-1", client_id: CLIENT }];
  tables.reminders = [
    { id: "rem-1", client_id: CLIENT, title: "Annual review", trigger_date: dateOnly(-3), recipient: "client", status: "pending" },
    { id: "rem-2", client_id: CLIENT, title: "Policy renewal", trigger_date: dateOnly(4), recipient: "both", status: "pending" },
    { id: "rem-3", client_id: CLIENT, title: "Tax season", trigger_date: dateOnly(90), recipient: "client", status: "pending" },
    // Adviser-only and completed reminders are not the client's business.
    { id: "rem-4", client_id: CLIENT, title: "Internal check", trigger_date: dateOnly(1), recipient: "adviser", status: "pending" },
    { id: "rem-5", client_id: CLIENT, title: "Old one", trigger_date: dateOnly(-9), recipient: "client", status: "completed" },
  ];
  tables.notifications = [
    { id: "n-1", client_id: CLIENT, recipient: "client", title: "Claim moved on", body: "Assessor booked", is_read: false, created_at: daysAgo(1), related_task_id: "task-1" },
    { id: "n-2", client_id: CLIENT, recipient: "client", title: "Welcome", body: null, is_read: true, created_at: daysAgo(100), related_task_id: null },
    { id: "n-3", client_id: "someone-else", recipient: "client", title: "Not yours", body: null, is_read: false, created_at: daysAgo(1), related_task_id: null },
  ];
  taskList = [
    {
      id: "task-1",
      reference: "RSF-0001",
      isClaim: true,
      typeLabel: "Motor",
      status: "awaiting_client",
      currentStage: { label: "Documents needed", clientActionLabel: "Upload your accident photos" },
      progress: { step: 2, total: 5 },
      waitingOn: "client",
      provider: { id: "p-1", name: "Ubuntu Demo Financial" },
      createdAt: daysAgo(10),
      updatedAt: daysAgo(4),
    },
    {
      id: "task-2",
      reference: "RSF-0002",
      isClaim: false,
      typeLabel: "Change of address",
      status: "open",
      currentStage: { label: "With your adviser" },
      progress: { step: 1, total: 3 },
      waitingOn: "us",
      provider: null,
      createdAt: daysAgo(3),
      updatedAt: daysAgo(2),
    },
    {
      id: "task-3",
      reference: "RSF-0003",
      isClaim: true,
      typeLabel: "Funeral",
      status: "draft",
      currentStage: null,
      progress: null,
      waitingOn: null,
      provider: null,
      createdAt: daysAgo(6),
      updatedAt: daysAgo(6),
    },
    {
      id: "task-4",
      reference: "RSF-0004",
      isClaim: true,
      typeLabel: "Health",
      status: "completed",
      currentStage: null,
      progress: { step: 5, total: 5 },
      waitingOn: null,
      provider: null,
      createdAt: daysAgo(200),
      updatedAt: daysAgo(150),
    },
  ];
}

test.beforeEach(seed);

test("the overview only ever answers for the signed-in client's own record", async () => {
  const overview = await getClientOverview(LOGIN, NOW);
  assert.equal(overview.client.id, CLIENT);
  assert.equal(overview.client.name, "Thabo Mokoena");
  assert.equal(overview.client.daysWithUs, 400);
  // The notification belonging to another client is never read.
  assert.deepEqual(overview.activity.recent.map((n) => n.id), ["n-1", "n-2"]);
  assert.equal(overview.activity.unread, 1);
});

test("a staff login is refused rather than shown somebody's client dashboard", async () => {
  await assert.rejects(() => getClientOverview({ id: "u-advisor", app_metadata: { role: "advisor" } }, NOW), /client logins/);
  await assert.rejects(() => getClientOverview({ id: "u-admin", app_metadata: { role: "admin" } }, NOW), /Admin accounts/);
});

test("a login with no client record is told so, not handed an empty dashboard", async () => {
  tables.users = [];
  await assert.rejects(() => getClientOverview(LOGIN, NOW), /client profile/);
});

test("the action centre ranks what is late above what is merely coming up", async () => {
  const { actions } = await getClientOverview(LOGIN, NOW);
  const ids = actions.list.map((a) => a.id);

  // Urgent first: the claim waiting on the client, the 12-day-old document, the overdue reminder.
  assert.deepEqual(ids.slice(0, 3), ["document:broker_appointment", "task:task-1", "reminder:rem-1"]);
  assert.equal(actions.urgent, 3);
  assert.ok(actions.list.slice(0, 3).every((a) => a.priority === "urgent"));

  const claim = actions.list.find((a) => a.id === "task:task-1");
  assert.equal(claim.title, "Upload your accident photos");
  assert.equal(claim.href, "/account/tasks/task-1");

  // Everything else is dated but not late, and the reminder 90 days out is left off entirely.
  assert.ok(!ids.includes("reminder:rem-3"));
  assert.ok(!ids.includes("reminder:rem-4"), "adviser-only reminders are not the client's to action");
});

test("an unsent draft is the client's to finish, and links to where they left off", async () => {
  const { actions, work } = await getClientOverview(LOGIN, NOW);
  const draft = actions.list.find((a) => a.id === "task:task-3");
  assert.equal(draft.priority, "soon");
  assert.equal(draft.href, "/account/claims/task-3/continue");
  assert.equal(work.drafts, 1);
  // A draft is not open work: nobody is waiting on it but the client.
  assert.deepEqual(work.list.map((t) => t.id), ["task-1", "task-2"]);
  assert.equal(work.open, 2);
  assert.equal(work.awaitingYou, 1);
  assert.equal(work.withAdviser, 1);
  assert.equal(work.settled, 1);
});

test("a consent inside its last 30 days is raised before it lapses", async () => {
  const { actions } = await getClientOverview(LOGIN, NOW);
  const consent = actions.list.find((a) => a.id === "consent:renewal");
  assert.equal(consent.priority, "soon");
  assert.match(consent.title, /about to expire/);
});

test("a consent that has already lapsed is urgent, and says what it costs the client", async () => {
  tables.documents = tables.documents.map((row) =>
    row.document_type === "client_consent" ? { ...row, signed_at: daysAgo(400) } : row
  );
  const { actions } = await getClientOverview(LOGIN, NOW);
  const consent = actions.list.find((a) => a.id === "consent:renewal");
  assert.equal(consent.priority, "urgent");
  assert.match(consent.detail, /can't act on your behalf/);
});

test("paperwork counts the same five documents the adviser is measured on", async () => {
  const { paperwork } = await getClientOverview(LOGIN, NOW);
  assert.equal(paperwork.total, 5);
  assert.equal(paperwork.signed, 3);
  assert.equal(paperwork.percent, 60);
  assert.equal(paperwork.awaitingYou, 2);
  assert.equal(paperwork.complete, false);
  assert.equal(paperwork.steps.find((s) => s.documentType === "broker_appointment").status, "sent");
});

test("the money panel totals what the adviser recorded and names the biggest items", async () => {
  const { finances } = await getClientOverview(LOGIN, NOW);
  assert.equal(finances.recorded, true);
  assert.equal(finances.assets, 920000);
  assert.equal(finances.liabilities, 450000);
  assert.equal(finances.netWorth, 470000);
  assert.deepEqual(finances.topAssets, [
    { label: "Retirement fund", amount: 800000 },
    { label: "Emergency fund", amount: 120000 },
  ]);
});

test("goals report funding and flag the ones past their target date", async () => {
  const { goals } = await getClientOverview(LOGIN, NOW);
  assert.equal(goals.total, 3);
  assert.equal(goals.inProgress, 2);
  assert.equal(goals.achieved, 1);
  assert.equal(goals.offTrack, 1);
  // 710 000 of 2 450 000 across all three targeted goals.
  assert.equal(goals.fundedPercent, 29);
  // Soonest target date first, so the one already past it leads.
  assert.deepEqual(goals.list.map((g) => g.id), ["goal-2", "goal-1"]);
  assert.equal(goals.list[0].offTrack, true);
  assert.equal(goals.list[0].percent, 20);
});

test("reminders the client can see are split into overdue and due soon", async () => {
  const { reminders } = await getClientOverview(LOGIN, NOW);
  assert.equal(reminders.overdue, 1);
  assert.equal(reminders.dueSoon, 1);
  assert.deepEqual(reminders.list.map((r) => r.id), ["rem-1", "rem-2", "rem-3"]);
  assert.equal(reminders.list[0].daysUntil, -3);
});

test("a client with nothing outstanding gets suggestions instead of an empty page", async () => {
  tables.documents = ["fais_disclosure", "confidentiality_agreement", "broker_appointment", "service_agreement"].map((type) =>
    doc(type, "signed", { signed_at: daysAgo(10) })
  );
  tables.documents.push(doc("client_consent", "signed", { signed_at: daysAgo(10) }));
  tables.client_financial_items = [];
  tables.client_goals = [];
  tables.client_dependants = [];
  tables.reminders = [];
  taskList = [];

  const { actions, paperwork, finances } = await getClientOverview(LOGIN, NOW);
  assert.equal(paperwork.complete, true);
  assert.equal(finances.recorded, false);
  assert.equal(actions.urgent, 0);
  assert.ok(actions.list.every((a) => a.priority === "info"));
  assert.deepEqual(actions.list.map((a) => a.id), ["suggest:fna", "suggest:beneficiaries"]);
});
