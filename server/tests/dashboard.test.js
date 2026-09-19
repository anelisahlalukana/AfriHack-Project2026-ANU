const test = require("node:test");
const assert = require("node:assert/strict");

const NOW = new Date("2026-09-19T10:00:00Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();
const daysAhead = (n) => new Date(NOW.getTime() + n * 86400000);
const dateOnly = (date) => date.toISOString().slice(0, 10);

// --- Fake Supabase: in-memory tables with just the query shapes the dashboard service uses.
const tables = {};

function from(table) {
  const filters = [];
  let range = null;
  let head = false;
  const rows = () => {
    const hit = (tables[table] || []).filter((row) =>
      filters.every(([col, val, isIn]) => (isIn ? val.includes(row[col]) : row[col] === val))
    );
    return range ? hit.slice(range[0], range[1] + 1) : hit;
  };
  const builder = {
    select: (cols, opts) => ((head = Boolean(opts?.head)), builder),
    eq: (col, val) => (filters.push([col, val]), builder),
    in: (col, val) => (filters.push([col, val, true]), builder),
    order: () => builder,
    limit: () => builder,
    range: (from, to) => ((range = [from, to]), builder),
    maybeSingle: async () => ({ data: rows()[0] || null, error: null }),
    then: (resolve, reject) =>
      Promise.resolve(head ? { count: rows().length, error: null } : { data: rows(), error: null }).then(resolve, reject),
  };
  return builder;
}

function stubModule(relativePath, exports) {
  const file = require.resolve(relativePath);
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
}
stubModule("../src/config/supabaseClient", { supabaseAdmin: { from } });
stubModule("../src/services/tasks.service", {
  listTasks: async () => [
    { waitingOn: "us", overdue: true },
    { waitingOn: "client", overdue: false },
    { waitingOn: "us", overdue: false },
  ],
});

const { getDashboard } = require("../src/services/dashboard.service");
const ADVISER = { id: "adviser-1" };

function doc(client_id, document_type, status, extra = {}) {
  return { client_id, document_type, status, sent_at: null, signed_at: null, expires_at: null, ...extra };
}

function seed() {
  tables.users = [
    { id: "A", role_id: 1, first_name: "Thabo", surname: "Mokoena", status: "onboarding", created_at: daysAgo(20), risk_profile_category: null, is_politically_exposed: true },
    { id: "B", role_id: 1, first_name: "Ayesha", surname: "Patel", status: "active", created_at: daysAgo(100), risk_profile_category: "balanced", is_politically_exposed: false },
    { id: "C", role_id: 1, first_name: "Sipho", surname: "Ndlovu", status: "inactive", created_at: daysAgo(5), risk_profile_category: null, is_politically_exposed: false },
    { id: "P", role_id: 2, first_name: null, surname: null, status: "active", created_at: daysAgo(5) },
  ];
  tables.client_financial_items = [
    { client_id: "A", category: "asset", amount: "1000" },
    { client_id: "A", category: "liability", amount: 200 },
    { client_id: "B", category: "asset", amount: 5000 },
    { client_id: "P", category: "asset", amount: 999999 }, // not a client: ignored
  ];
  tables.client_goals = [
    { client_id: "A", status: "in_progress", target_amount: 1000, current_progress: 250, target_date: "2026-01-01" },
    { client_id: "B", status: "in_progress", target_amount: null, current_progress: 0, target_date: null },
  ];
  tables.documents = [
    doc("A", "fais_disclosure", "signed", { signed_at: daysAgo(19) }),
    doc("A", "confidentiality_agreement", "signed", { signed_at: daysAgo(19) }),
    doc("A", "broker_appointment", "sent", { sent_at: daysAgo(5) }),
    ...["confidentiality_agreement", "broker_appointment", "service_agreement", "fais_disclosure"].map((t) =>
      doc("B", t, "signed", { signed_at: daysAgo(90) })
    ),
    doc("B", "client_consent", "signed", { signed_at: daysAgo(355), expires_at: daysAhead(10).toISOString() }),
  ];
  tables.reminders = [
    { trigger_date: dateOnly(daysAhead(-1)), status: "pending" },
    { trigger_date: dateOnly(daysAhead(0)), status: "pending" },
    { trigger_date: dateOnly(daysAhead(3)), status: "active" },
    { trigger_date: dateOnly(daysAhead(30)), status: "pending" },
    { trigger_date: dateOnly(daysAhead(-5)), status: "completed" },
  ];
  tables.notifications = [
    { id: "n1", advisor_id: "adviser-1", title: "Old", body: "b", is_read: true, created_at: daysAgo(3), client_id: "A" },
    { id: "n2", advisor_id: "adviser-1", title: "New", body: "b", is_read: false, created_at: daysAgo(1), client_id: "A" },
    { id: "n3", advisor_id: "someone-else", title: "Not mine", body: "b", is_read: false, created_at: daysAgo(1), client_id: "A" },
  ];
  tables.adviser_compliance = [{ adviser_id: "adviser-1", qualification_status: "pending", cpd_status: "overdue" }];
}

test("dashboard rolls the practice up into business numbers", async () => {
  seed();
  const d = await getDashboard(ADVISER, NOW);

  assert.equal(d.generatedAt, NOW.toISOString());
  assert.equal(d.clients.total, 3);
  assert.deepEqual(d.clients.byStatus, { onboarding: 1, active: 1, inactive: 1 });
  assert.equal(d.clients.newInWindow, 2);
  assert.equal(d.clients.politicallyExposed, 1);
  assert.equal(d.clients.noFinancialAnalysis, 1);
  assert.deepEqual(d.clients.riskMix, { not_assessed: 2, balanced: 1 });

  assert.deepEqual(d.portfolio, { assets: 6000, liabilities: 200, netWorth: 5800 });

  assert.equal(d.goals.inProgress, 2);
  assert.equal(d.goals.pastTargetDate, 1);
  assert.equal(d.goals.fundedPercent, 25);

  assert.equal(d.documents.awaitingSignature, 1);
  assert.equal(d.documents.oldestWaitingDays, 5);
  assert.equal(d.documents.completeClients, 1);
  assert.equal(d.documents.missingForOnboarding, 2);
  assert.equal(d.documents.consentsExpiringSoon, 1);
  assert.equal(d.documents.consentsExpired, 0);

  assert.equal(d.onboarding.total, 1);
  assert.equal(d.onboarding.stalled, 1);
  assert.deepEqual(d.onboarding.clients[0], {
    id: "A", name: "Thabo Mokoena", days: 20, stalled: true, signed: 2, awaitingClient: 1, notSent: 2,
  });

  assert.deepEqual(d.work, { open: 3, waitingOnUs: 2, waitingOnClients: 1, overdue: 1 });
  assert.equal(d.reminders.overdue, 1);
  assert.equal(d.reminders.dueSoon, 2);

  assert.equal(d.activity.unread, 1);
  assert.deepEqual(d.activity.recent.map((n) => n.id).sort(), ["n1", "n2"]); // only this adviser's
  assert.deepEqual(d.compliance, { qualificationStatus: "pending", cpdStatus: "overdue" });
});

test("an expired consent is counted as expired, not expiring soon", async () => {
  seed();
  tables.documents = [doc("B", "client_consent", "signed", { signed_at: daysAgo(400), expires_at: daysAgo(35) })];
  const d = await getDashboard(ADVISER, NOW);
  assert.equal(d.documents.consentsExpired, 1);
  assert.equal(d.documents.consentsExpiringSoon, 0);
});

test("an empty practice returns zeros instead of failing", async () => {
  for (const key of Object.keys(tables)) tables[key] = [];
  const d = await getDashboard(ADVISER, NOW);
  assert.equal(d.clients.total, 0);
  assert.equal(d.goals.fundedPercent, null);
  assert.equal(d.compliance, null);
  assert.deepEqual(d.onboarding.clients, []);
});
