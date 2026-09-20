const test = require("node:test");
const assert = require("node:assert/strict");

const { createReportsService } = require("../src/services/reports.service");
const { TEMPLATES } = require("../src/reports/templates");
const { declineReason } = require("../src/reports/templates");
const { extractDateRange, matchTemplate } = require("../src/reports/keywords");
const { parseJsonReply, createGeminiClient } = require("../src/reports/llm");
const { redactQuestion, sanitizeRows } = require("../src/reports/privacy");

const NOW = new Date("2026-09-19T10:00:00Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();
const dayOnly = (iso) => iso.slice(0, 10);

const A1 = "11111111-1111-4111-8111-111111111111";
const C1 = "c1c1c1c1-0000-4000-8000-000000000001";
const C2 = "c2c2c2c2-0000-4000-8000-000000000002";
const C3 = "c3c3c3c3-0000-4000-8000-000000000003";
const A2 = "22222222-2222-4222-8222-222222222222";
const P1 = "aaaaaaaa-0000-4000-8000-000000000001";
const P2 = "aaaaaaaa-0000-4000-8000-000000000002";

const adviser = (id) => ({ id, email: `${id}@rsf.test`, app_metadata: { role: "advisor" }, user_metadata: { full_name: id === A1 ? "Qiniso Adviser" : "Vusi Adviser" } });
const ADMIN = { id: "33333333-3333-4333-8333-333333333333", email: "admin@rsf.test", app_metadata: { role: "admin" }, user_metadata: { full_name: "Admin" } };

// ---------------------------------------------------------------- fake Supabase
function compare(a, b) {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isFinite(ta) && Number.isFinite(tb)) return ta - tb;
  return a < b ? -1 : a > b ? 1 : 0;
}

function fakeDb(tables) {
  function from(table) {
    const filters = [];
    let range = null;
    const rows = () => {
      const hit = (tables[table] || []).filter((row) => filters.every((f) => f(row)));
      return range ? hit.slice(range[0], range[1] + 1) : hit;
    };
    const builder = {
      select: () => builder,
      eq: (c, v) => (filters.push((r) => r[c] === v), builder),
      neq: (c, v) => (filters.push((r) => r[c] !== v), builder),
      in: (c, v) => (filters.push((r) => v.includes(r[c])), builder),
      gte: (c, v) => (filters.push((r) => r[c] != null && compare(r[c], v) >= 0), builder),
      lte: (c, v) => (filters.push((r) => r[c] != null && compare(r[c], v) <= 0), builder),
      lt: (c, v) => (filters.push((r) => r[c] != null && compare(r[c], v) < 0), builder),
      order: () => builder,
      limit: () => builder,
      range: (a, b) => ((range = [a, b]), builder),
      then: (resolve, reject) => Promise.resolve({ data: rows(), error: null }).then(resolve, reject),
    };
    return builder;
  }
  return { from };
}

// ---------------------------------------------------------------- seed data
// Clients C1, C2 belong to adviser A1; C3 belongs to A2. Names and ID numbers are distinctive
// so the privacy tests can look for them in anything sent to the model.
const SECRET_NAMES = ["Thandiwe", "Mokoenaville", "Sibusiso", "Dlaminiberg", "Zanelethu", "Ndlovukazi"];
const SECRET_IDS = ["9001015009087", "8502025009081", "7703035009083"];

function seed() {
  const users = [
    { id: C1, role_id: 1, advisor_id: A1, first_name: "Thandiwe", surname: "Mokoenaville", id_number: SECRET_IDS[0], status: "active", risk_profile_category: "balanced", marital_status: "married", occupation: "teacher", annual_income: 450000, date_of_birth: "1960-03-01", created_at: daysAgo(400) },
    { id: C2, role_id: 1, advisor_id: A1, first_name: "Sibusiso", surname: "Dlaminiberg", id_number: SECRET_IDS[1], status: "onboarding", created_at: daysAgo(40) },
    { id: C3, role_id: 1, advisor_id: A2, first_name: "Zanelethu", surname: "Ndlovukazi", id_number: SECRET_IDS[2], status: "active", risk_profile_category: "aggressive", created_at: daysAgo(300) },
    { id: P1, role_id: 2, organisation_name: "Santam Mock", created_at: daysAgo(900) },
    { id: P2, role_id: 2, organisation_name: "Discovery Mock", created_at: daysAgo(900) },
  ];
  const task = (id, client_id, extra) => {
    const row = { id, client_id, reference: `RSF-${id}`, task_type: "claim", claim_category: "motor", status: "open", provider_id: P1, created_at: daysAgo(10), submitted_at: daysAgo(10), closed_at: null, client_rating: null, ...extra };
    return { updated_at: row.closed_at || row.created_at, ...row };
  };
  const tasks = [
    task("T1", C1, { status: "completed", submitted_at: daysAgo(30), closed_at: daysAgo(20), created_at: daysAgo(31), client_rating: 4, claimed_amount: 50000, settled_amount: 45000 }),
    task("T2", C1, { status: "declined", closed_at: daysAgo(5), created_at: daysAgo(12), claimed_amount: 30000, settled_amount: 0 }),
    task("T3", C2, { status: "awaiting_client", provider_id: P2, claim_category: "life", claimed_amount: 400000 }),
    task("T4", C2, { task_type: "update_address", claim_category: null, provider_id: null, status: "completed", submitted_at: daysAgo(8), closed_at: daysAgo(6), created_at: daysAgo(8) }),
    task("T5", C2, { status: "draft", submitted_at: null }),
    task("T6", C3, { status: "declined", closed_at: daysAgo(3), created_at: daysAgo(9), claimed_amount: 99999, settled_amount: 0 }),
    task("T7", C3, { status: "completed", provider_id: P2, submitted_at: daysAgo(50), closed_at: daysAgo(10), created_at: daysAgo(50), client_rating: 2, claimed_amount: 88888, settled_amount: 80000 }),
    task("T8", C3, { status: "open", claim_category: "funeral", created_at: daysAgo(40), updated_at: daysAgo(30) }),
  ];
  const ev = (id, task_id, provider_id, direction, event_type, ago, note) => ({ id, task_id, provider_id, direction, event_type, payload: note ? { note } : {}, created_at: daysAgo(ago) });
  const provider_events = [
    ev("E1", "T1", P1, "sent", "claim_submitted", 30),
    ev("E2", "T1", P1, "received", "claim_registered", 30), // automatic ack: ignored
    ev("E3", "T1", P1, "received", "assessment_submitted", 28), // 48 h after E1
    ev("E4", "T2", P1, "sent", "claim_submitted", 12),
    ev("E5", "T2", P1, "received", "declined", 5, "Policy exclusion: wear and tear is not covered"),
    ev("E6", "T3", P2, "sent", "claim_submitted", 10), // still waiting
    ev("E7", "T6", P1, "sent", "claim_submitted", 9),
    ev("E8", "T6", P1, "received", "declined", 3, "Zanelethu Ndlovukazi did not submit the police report"),
  ];
  const task_updates = [
    { id: "U1", task_id: "T2", note: "Declined.", update_kind: "stage_change", created_at: daysAgo(5) },
    { id: "U2", task_id: "T6", note: "Missing documents", update_kind: "stage_change", created_at: daysAgo(3) },
  ];
  const reminders = [
    { id: "R1", client_id: C1, reminder_type: "annual-review", rule_id: "annual-review", trigger_date: dayOnly(daysAgo(4)), status: "notified" },
    { id: "R2", client_id: C2, reminder_type: "birthday", rule_id: "birthday", trigger_date: dayOnly(daysAgo(1)), status: "pending" },
    { id: "R3", client_id: C2, reminder_type: "birthday", rule_id: "birthday", trigger_date: dayOnly(daysAgo(9)), status: "completed" },
    { id: "R4", client_id: C3, reminder_type: "valuation", rule_id: "valuation", trigger_date: dayOnly(daysAgo(20)), status: "notified" },
    { id: "R5", client_id: C1, reminder_type: "birthday", rule_id: "birthday", trigger_date: dayOnly(daysAgo(-5)), status: "pending" },
    { id: "R6", client_id: C3, reminder_type: "annual-review", rule_id: "annual-review", trigger_date: dayOnly(daysAgo(-3)), status: "pending" },
  ];
  const client_goals = [
    { id: "G1", client_id: C1, goal_type: "retirement", target_amount: 1000000, current_progress: 900000, target_date: "2027-09-19", status: "in_progress" },
    { id: "G2", client_id: C2, goal_type: "education", target_amount: 100000, current_progress: 0, target_date: "2026-10-01", status: "in_progress" },
    { id: "G3", client_id: C2, goal_type: "education", target_amount: null, current_progress: 0, target_date: null, status: "in_progress" },
    { id: "G4", client_id: C3, goal_type: "retirement", target_amount: 500000, current_progress: 0, target_date: "2026-12-01", status: "in_progress" },
  ];
  const types = ["confidentiality_agreement", "broker_appointment", "client_consent", "service_agreement", "fais_disclosure"];
  const documents = [
    ...types.map((t, i) => ({ id: `D1${i}`, client_id: C1, document_type: t, status: "signed", signed_at: daysAgo(350), expires_at: null })),
    { id: "D20", client_id: C2, document_type: "fais_disclosure", status: "signed", signed_at: daysAgo(30), expires_at: null },
    { id: "D21", client_id: C2, document_type: "client_consent", status: "sent", sent_at: daysAgo(9), signed_at: null, expires_at: null },
    ...types.map((t, i) => ({ id: `D3${i}`, client_id: C3, document_type: t, status: "signed", signed_at: daysAgo(360), expires_at: null })),
  ];
  const client_financial_items = [
    { id: "F1", client_id: C1, category: "asset", item_type: "property", amount: 2000000 },
    { id: "F2", client_id: C1, category: "liability", item_type: "home_loan", amount: 500000 },
    { id: "F3", client_id: C3, category: "asset", item_type: "investments", amount: 9000000 },
    { id: "F4", client_id: C1, category: "income", item_type: "salary", amount: 40000, frequency: "monthly" },
    { id: "F5", client_id: C1, category: "expense", item_type: "household", amount: 30000, frequency: "monthly" },
    { id: "F6", client_id: C2, category: "income", item_type: "salary", amount: 240000, frequency: "annually" },
    { id: "F7", client_id: C2, category: "expense", item_type: "household", amount: 25000, frequency: "monthly" },
    { id: "F8", client_id: C3, category: "income", item_type: "salary", amount: 90000, frequency: "monthly" },
  ];
  const client_screenings = [
    { id: "S1", client_id: C1, screening_type: "pep", result: "clear", created_at: daysAgo(30) },
    { id: "S2", client_id: C3, screening_type: "pep", result: "flagged", created_at: daysAgo(30) },
  ];
  const adviser_cpd_records = [
    { id: "CPD1", adviser_id: A1, hours: 5, completed_on: "2026-07-01" },
    { id: "CPD2", adviser_id: A2, hours: 10, completed_on: "2026-07-01" },
  ];
  const client_dependants = [
    { id: "DP1", client_id: C1, full_name: "Secret Kid Mokoenaville", relationship: "child", beneficiary_percentage: 50 },
    { id: "DP2", client_id: C3, full_name: "Other Kid", relationship: "spouse", beneficiary_percentage: 100 },
  ];
  const request_types = [{ task_type: "update_address", label: "Change of address" }];
  return { users, tasks, provider_events, task_updates, reminders, client_goals, documents, client_financial_items, client_screenings, adviser_cpd_records, request_types, client_dependants };
}

// The same data with adviser A2's clients (and everything hanging off them) removed.
function withoutA2(data) {
  const gone = new Set(data.users.filter((u) => u.advisor_id === A2).map((u) => u.id));
  const goneTasks = new Set(data.tasks.filter((t) => gone.has(t.client_id)).map((t) => t.id));
  const out = {};
  for (const [table, rows] of Object.entries(data)) {
    out[table] = rows.filter((r) => !gone.has(r.id) && !gone.has(r.client_id) && !goneTasks.has(r.task_id) && r.adviser_id !== A2);
  }
  return out;
}

const adviserNames = async (ids) => new Map(ids.map((id) => [id, id === A1 ? "Qiniso Adviser" : "Vusi Adviser"]));
const noLlm = { enabled: false };

function service(data = seed(), llm = noLlm) {
  return createReportsService({ db: fakeDb(data), llm, now: () => NOW, adviserNames });
}

// ---------------------------------------------------------------- scoping
for (const template of TEMPLATES) {
  test(`${template.id}: an adviser only ever sees their own clients, even with a spoofed advisor_id`, async () => {
    const own = await service().run(adviser(A1), template.id, {});
    const spoofed = await service().run(adviser(A1), template.id, { advisor_id: A2 });
    const isolated = await service(withoutA2(seed())).run(adviser(A1), template.id, {});
    assert.deepEqual(spoofed, own, "advisor_id from the request must be ignored for advisers");
    assert.deepEqual(own, isolated, "another adviser's data must not change an adviser's report");
    assert.equal(own.parameters.advisor_id, undefined);
    const text = JSON.stringify(own);
    for (const secret of ["Zanelethu", "Ndlovukazi", SECRET_IDS[2], C3, "T6", "T7", "T8", "Vusi"]) {
      assert.ok(!text.includes(secret), `${template.id} leaked ${secret}`);
    }
  });
}

test("admins see every adviser's clients, and can narrow to one adviser", async () => {
  const all = await service().run(ADMIN, "consent_expiry_pipeline", { days_ahead: 60 });
  assert.deepEqual(all.rows.map((r) => r.clientId).sort(), [C1, C3].sort());
  assert.ok(all.rows.every((r) => r.adviser));
  const onlyA2 = await service().run(ADMIN, "consent_expiry_pipeline", { days_ahead: 60, advisor_id: A2 });
  assert.deepEqual(onlyA2.rows.map((r) => r.clientId), [C3]);
});

test("clients and providers can't run reports", async () => {
  await assert.rejects(service().run({ id: "x", app_metadata: {} }, "claims_by_status", {}), { status: 403 });
  await assert.rejects(service().run({ id: "x", app_metadata: { role: "provider" } }, "claims_by_status", {}), { status: 403 });
  await assert.rejects(service().run(adviser(A1), "drop_tables", {}), { status: 400 });
});

// ---------------------------------------------------------------- template results
test("claims_by_status counts an adviser's claims and skips drafts and requests", async () => {
  const r = await service().run(adviser(A1), "claims_by_status", {});
  assert.deepEqual(r.rows, [
    { label: "Waiting on client", value: 1 },
    { label: "Completed", value: 1 },
    { label: "Declined", value: 1 },
  ]);
  assert.equal(r.chartType, "bar");
});

test("avg_time_to_close groups by provider, or by type", async () => {
  const byProvider = await service().run(adviser(A1), "avg_time_to_close", {});
  assert.deepEqual(byProvider.rows, [
    { label: "Santam Mock", value: 10, count: 1 },
    { label: "No provider", value: 2, count: 1 },
  ]);
  const byType = await service().run(adviser(A1), "avg_time_to_close", { group_by: "task_type" });
  assert.deepEqual(byType.rows.map((r) => r.label), ["Motor claim", "Update address"]);
});

test("overdue_reminders ignores completed and future reminders", async () => {
  const r = await service().run(adviser(A1), "overdue_reminders", {});
  assert.deepEqual(r.rows, [
    { label: "Annual review", value: 1 },
    { label: "Birthday", value: 1 },
  ]);
});

test("goal_progress compares funding with time elapsed", async () => {
  const r = await service().run(adviser(A1), "goal_progress", {});
  assert.deepEqual(r.rows, [
    { label: "Education", on_track: 0, behind: 1 },
    { label: "Retirement", on_track: 1, behind: 0 },
  ]);
  assert.match(r.headline, /1 of 2 goals behind/);
});

test("declined reasons are bucketed from the provider's decline note", async () => {
  const r = await service().run(ADMIN, "declined_claims_by_reason", {});
  assert.deepEqual(r.rows, [
    { label: "Missing documents", value: 1 },
    { label: "Policy exclusion", value: 1 },
  ]);
  assert.equal(declineReason("Premiums unpaid for three months"), "Policy lapsed");
  assert.equal(declineReason(""), "Other");
});

test("net_worth_distribution buckets assets minus liabilities", async () => {
  const r = await service().run(ADMIN, "net_worth_distribution", {});
  const counts = Object.fromEntries(r.rows.map((x) => [x.label, x.value]));
  assert.equal(counts["R1m – R5m"], 1);
  assert.equal(counts["R5m+"], 1);
  assert.equal(counts["No FNA yet"], 1);
});

test("provider_responsiveness skips the automatic acknowledgement", async () => {
  const r = await service().run(adviser(A1), "provider_responsiveness", {});
  const santam = r.rows.find((x) => x.label === "Santam Mock");
  assert.equal(santam.value, (48 + 7 * 24) / 2);
  assert.equal(r.rows.find((x) => x.label === "Discovery Mock").awaiting, 1);
});

test("document_completion and task_volume_trend return chartable rows", async () => {
  const docs = await service().run(adviser(A1), "document_completion", {});
  assert.match(docs.headline, /1 of 2 clients \(50%\)/);
  const trend = await service().run(adviser(A1), "task_volume_trend", {});
  assert.equal(trend.chartType, "line");
  assert.equal(trend.period, "month"); // default 180-day range is monthly
  assert.ok(trend.rows.length >= 6);
  const weekly = await service().run(adviser(A1), "task_volume_trend", { date_range: { from: "2026-08-01", to: "2026-09-19" } });
  assert.equal(weekly.period, "week");
  assert.equal(weekly.rows.reduce((n, r) => n + trend.series.reduce((m, s) => m + (r[s.key] || 0), 0), 0), 4);
  assert.ok(trend.series.some((s) => s.label === "Motor claim"));
});

// ---------------------------------------------------------------- intent
test("every suggested question resolves to its template with the model mocked", async () => {
  const llm = {
    enabled: true,
    generateJson: async (system, message) => {
      const { question } = JSON.parse(message);
      const t = TEMPLATES.find((x) => x.suggestedQuestion === question);
      return { template_id: t.id, parameters: {}, confidence: 0.9 };
    },
  };
  for (const t of TEMPLATES) {
    const r = await service(seed(), llm).ask(adviser(A1), t.suggestedQuestion);
    assert.equal(r.template.id, t.id);
    assert.equal(r.matchedBy, "ai");
  }
});

test("every suggested question resolves to its template with the model disabled (keyword fallback)", async () => {
  for (const t of TEMPLATES) {
    const r = await service().ask(adviser(A1), t.suggestedQuestion);
    assert.equal(r.template.id, t.id, `"${t.suggestedQuestion}" matched ${r.template.id}`);
    assert.equal(r.matchedBy, "keyword");
  }
});

test("bad model output falls back to keywords: invalid JSON, unknown template, low confidence, timeout", async () => {
  const replies = [
    async () => {
      throw new Error("Model reply was not JSON");
    },
    async () => ({ template_id: "delete_everything", parameters: {}, confidence: 0.99 }),
    async () => ({ template_id: "net_worth_distribution", parameters: {}, confidence: 0.1 }),
    async () => {
      throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    },
  ];
  for (const generateJson of replies) {
    const r = await service(seed(), { enabled: true, generateJson }).ask(adviser(A1), "Which reminders are overdue?");
    assert.equal(r.template.id, "overdue_reminders");
    assert.equal(r.matchedBy, "keyword");
  }
});

test("an unlisted but reasonable question still resolves to something sensible", async () => {
  assert.equal((await service().ask(adviser(A1), "who's slow to get back to us, the insurers?")).template.id, "provider_responsiveness");
  assert.equal((await service().ask(adviser(A1), "How wealthy are my clients?")).template.id, "net_worth_distribution");
  assert.equal((await service().ask(adviser(A1), "zzz")).template.id, TEMPLATES[0].id);
});

test("an adviser can't widen scope through the model's parameters", async () => {
  const llm = { enabled: true, generateJson: async () => ({ template_id: "consent_expiry_pipeline", parameters: { advisor_id: A2, days_ahead: 90 }, confidence: 0.9 }) };
  const r = await service(seed(), llm).ask(adviser(A1), "consents expiring soon");
  assert.deepEqual(r.rows.map((x) => x.clientId), [C1]);
  assert.equal(r.parameters.days_ahead, 90);
});

test("relative dates become explicit ranges", () => {
  assert.deepEqual(extractDateRange("claims last quarter", NOW), { from: "2026-04-01", to: "2026-06-30" });
  assert.deepEqual(extractDateRange("this year", NOW), { from: "2026-01-01", to: "2026-09-19" });
  assert.deepEqual(extractDateRange("in the last 30 days", NOW), { from: "2026-08-21", to: "2026-09-19" });
  assert.equal(matchTemplate("", TEMPLATES).template.id, TEMPLATES[0].id);
});

// ---------------------------------------------------------------- privacy
test("nothing sent to the model contains client names or ID numbers", async () => {
  const sent = [];
  const llm = {
    enabled: true,
    generateJson: async (system, message) => {
      sent.push(system, message);
      if (system.includes("report-intent matcher")) return { template_id: "claims_by_status", parameters: {}, confidence: 0.9 };
      return { title: "t", narrative: "n" };
    },
  };
  await service(seed(), llm).ask(ADMIN, `How are Thandiwe Mokoenaville's claims going? ID ${SECRET_IDS[0]}, email t@x.co`);
  for (const t of TEMPLATES) await service(seed(), llm).generate(ADMIN, t.id, {});
  const all = sent.join("\n");
  assert.ok(sent.length > TEMPLATES.length);
  for (const secret of [...SECRET_NAMES, ...SECRET_IDS, "t@x.co", "did not submit the police report", "wear and tear"]) {
    assert.ok(!all.includes(secret), `model payload contained ${secret}`);
  }
});

test("privacy helpers redact questions and drop personal fields", () => {
  const clients = [{ first_name: "Thandiwe", surname: "Mokoenaville" }];
  assert.equal(redactQuestion("claims for thandiwe mokoenaville 9001015009087", clients), "claims for [client] [client] [id number]");
  assert.deepEqual(sanitizeRows([{ label: "Motor", value: 2, client: "X", clientId: "C1", email: "a@b.c" }]), [{ label: "Motor", value: 2 }]);
});

test("generate works with the model off and returns a templated narrative", async () => {
  const r = await service().generate(adviser(A1), "consent_expiry_pipeline", { days_ahead: 60 });
  assert.equal(r.writtenBy, "template");
  assert.ok(r.title.includes("Client consents expiring"));
  assert.ok(r.narrative.length > 10);
  assert.equal(r.generatedFor, "Qiniso Adviser");
  assert.equal(r.generatedAt, NOW.toISOString());
  assert.equal(r.rows[0].clientId, C1);
});

test("generate ignores rows from the client and re-runs the query", async () => {
  const r = await service().generate(adviser(A1), "claims_by_status", { rows: [{ label: "Fake", value: 999 }] });
  assert.ok(!r.rows.some((x) => x.label === "Fake"));
});

// ---------------------------------------------------------------- model client
test("model replies are parsed from fenced JSON", () => {
  assert.deepEqual(parseJsonReply('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonReply('Sure! {"a":2} hope that helps'), { a: 2 });
  assert.throws(() => parseJsonReply("nope"));
});

test("the model client is off without a key and times out on a slow call", async () => {
  assert.equal(createGeminiClient({ apiKey: "" }).enabled, false);
  const slowFetch = (url, { signal }) =>
    new Promise((resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason)));
  const client = createGeminiClient({ apiKey: "k", timeoutMs: 30, fetchImpl: slowFetch });
  const keepAlive = setTimeout(() => {}, 1000); // AbortSignal.timeout doesn't hold the event loop open
  await assert.rejects(client.generateJson("s", "m"), { name: "TimeoutError" });
  clearTimeout(keepAlive);
});

// ---------------------------------------------------------------- wider template set
test("claims_by_type answers 'which types of claims' with motor, funeral and so on", async () => {
  const r = await service().ask(adviser(A1), "List the most type of claims we got");
  assert.equal(r.template.id, "claims_by_type");
  assert.deepEqual(r.rows.map((x) => [x.label, x.total]), [["Motor", 2], ["Life", 1]]);
  assert.match(r.headline, /Motor is the biggest line: 2 of 3 claims \(67%\)/);
  const all = await service().run(ADMIN, "claims_by_type", {});
  assert.equal(all.rows[0].label, "Motor");
  assert.deepEqual(all.rows.map((x) => x.label).sort(), ["Funeral", "Life", "Motor"]);
});

test("keyword answers come with 'did you mean' alternatives", async () => {
  const r = await service().ask(adviser(A1), "What kinds of claims do we have");
  assert.equal(r.matchedBy, "keyword");
  assert.equal(r.alternatives.length, 3);
  assert.ok(!r.alternatives.some((a) => a.id === r.template.id));
  const sure = { enabled: true, generateJson: async () => ({ template_id: "claims_by_type", parameters: {}, confidence: 0.95 }) };
  assert.deepEqual((await service(seed(), sure).ask(adviser(A1), "claim types")).alternatives, []);
});

test("new templates return the expected figures", async () => {
  const s = service();
  const stuck = await s.run(adviser(A1), "stuck_tasks", { older_than_days: 7 });
  assert.deepEqual(stuck.rows.map((r) => r.reference), ["RSF-T3"]); // the only open A1 item, idle 10 days
  assert.ok(stuck.rows.every((r) => r.idleDays >= 7));
  const waiting = await s.run(adviser(A1), "work_waiting", {});
  assert.equal(waiting.rows.reduce((n, r) => n + r.waiting_on_client + r.waiting_on_us, 0), 1);
  const ratings = await s.run(ADMIN, "client_satisfaction", {});
  assert.deepEqual(ratings.rows.map((r) => [r.label, r.value]), [["Discovery Mock", 2], ["Santam Mock", 4]]);
  const money = await s.run(adviser(A1), "financial_breakdown", {});
  assert.match(money.headline, /R.?2.?000.?000 in assets/);
  const screening = await s.run(ADMIN, "screening_results", {});
  assert.deepEqual(screening.rows[0], { label: "PEP", clear: 1, flagged: 1, not_screened: 1 });
  const cpd = await s.run(adviser(A1), "cpd_progress", {});
  assert.deepEqual(cpd.rows, [{ label: "Qiniso Adviser", value: 5, remaining: 13 }]);
  const cpdAll = await s.run(ADMIN, "cpd_progress", {});
  assert.equal(cpdAll.rows.length, 2);
  const upcoming = await s.run(adviser(A1), "upcoming_reminders", {});
  assert.deepEqual(upcoming.rows, [{ label: "Birthday", value: 1 }]);
  const requests = await s.run(adviser(A1), "requests_by_type", {});
  assert.equal(requests.rows[0].label, "Change of address");
  const risk = await s.run(adviser(A1), "risk_profile_mix", {});
  assert.deepEqual(risk.rows, [{ label: "Balanced", value: 1 }, { label: "Not assessed", value: 1 }]);
});

test("the templated narrative uses each report's own insights", async () => {
  const r = await service().generate(ADMIN, "screening_results", {});
  assert.match(r.narrative, /Review the 1 flagged result/);
  assert.equal(r.insights, undefined, "insights stay server-side");
});

test("everyday questions reach the right report without the model", async () => {
  const cases = [
    ["which company rejects most of our claims", "claims_by_provider"],
    ["things I need to follow up on that are stuck", "stuck_tasks"],
    ["how many requests are waiting on customers", "work_waiting"],
    ["show client sign ups per month", "new_clients_trend"],
    ["how much do clients owe", "financial_breakdown"],
    ["politically exposed clients", "screening_results"],
    ["my training hours this cycle", "cpd_progress"],
    ["reviews due this month", "upcoming_reminders"],
    ["insurer ratings from clients", "client_satisfaction"],
  ];
  for (const [question, id] of cases) {
    assert.equal((await service().ask(adviser(A1), question)).template.id, id, question);
  }
});

test("comparing product lines shows both lines side by side", async () => {
  // Either the Claims by type report or a query split by product line is a good answer.
  const r = await service().ask(adviser(A1), "do we see more car claims or life claims");
  const byLine = r.kind === "query" ? r.rows.map((x) => [x.label, x.value]) : r.rows.map((x) => [x.label, x.total]);
  assert.ok(r.kind === "query" ? r.query.split_by === "product_line" : r.template.id === "claims_by_type");
  assert.deepEqual(byLine, [["Motor", 2], ["Life", 1]]);
});

test("share questions lead with the value asked about", async () => {
  const r = await service().ask(ADMIN, "what share of claims are declined");
  assert.equal(r.kind, "query");
  assert.equal(r.chartType, "donut");
  assert.match(r.headline, /^Declined: 2 of 6 claims \(33%\)$/);
});

test("the catalogue lists categories, featured chips and whether AI is on", () => {
  const c = service().catalogue();
  assert.equal(c.templates.length, TEMPLATES.length);
  assert.ok(c.templates.filter((t) => t.featured).length >= 6);
  assert.ok(c.templates.every((t) => c.categories.includes(t.category)));
  assert.deepEqual(c.ai, { enabled: false, model: null });
});

// ---------------------------------------------------------------- free-form queries
const { DATASETS } = require("../src/reports/datasets");
const { normalizeQuery } = require("../src/reports/query");
const { parseQuestion, detectClients } = require("../src/reports/queryParser");

for (const dataset of Object.keys(DATASETS)) {
  test(`query on ${dataset}: an adviser only ever sees their own clients, even with a spoofed advisor_id`, async () => {
    for (const shape of [{ mode: "records" }, { mode: "aggregate", group_by: "adviser" }, { mode: "aggregate" }]) {
      const spec = { dataset, ...shape };
      const own = await service().query(adviser(A1), spec);
      const spoofed = await service().query(adviser(A1), { ...spec, advisor_id: A2 });
      const isolated = await service(withoutA2(seed())).query(adviser(A1), spec);
      assert.deepEqual(spoofed, own);
      assert.deepEqual(own, isolated);
      const text = JSON.stringify(own);
      for (const secret of ["Zanelethu", "Ndlovukazi", C3, "Vusi", "Other Kid", "Secret Kid"]) assert.ok(!text.includes(secret), `${dataset} leaked ${secret}`);
    }
  });
}

test("queries outside the allowlist are rejected", () => {
  assert.throws(() => normalizeQuery({ dataset: "users" }), { status: 400 });
  assert.throws(() => normalizeQuery({ dataset: "clients", filters: [{ field: "client", op: "eq", value: "x" }] }), { status: 400 });
  assert.throws(() => normalizeQuery({ dataset: "clients", filters: [{ field: "id_number", op: "eq", value: "x" }] }), { status: 400 });
  assert.throws(() => normalizeQuery({ dataset: "claims", filters: [{ field: "status", op: "gt", value: 3 }] }), { status: 400 });
  assert.throws(() => normalizeQuery({ dataset: "claims", group_by: "client" }), { status: 400 });
  assert.throws(() => normalizeQuery({ dataset: "claims", metric: { op: "sum", field: "status" } }), { status: 400 });
  assert.throws(() => normalizeQuery({ dataset: "claims", client_ids: ["not-a-uuid"] }), { status: 400 });
  assert.throws(() => normalizeQuery({ dataset: "claims", filters: [{ field: "created_at", op: "gte", value: "yesterday" }] }), { status: 400 });
});

test("free-form questions become queries over the records", async () => {
  const s = service();
  const declinedMotor = await s.ask(adviser(A1), "how many motor claims were declined");
  assert.equal(declinedMotor.kind, "query");
  assert.equal(declinedMotor.rows[0].value, 1);
  const list = await s.ask(adviser(A1), "show me open claims with Discovery");
  assert.equal(list.chartType, "table");
  assert.deepEqual(list.rows.map((r) => r.reference), ["RSF-T3"]);
  const avg = await s.ask(ADMIN, "average client rating per provider");
  assert.deepEqual(avg.rows.map((r) => [r.label, r.value]), [["Santam Mock", 4], ["Discovery Mock", 2]]);
  const married = await s.ask(adviser(A1), "how many clients are married");
  assert.equal(married.rows[0].value, 1);
  assert.ok(married.readAs.includes("Marital status is married"));
  const kids = await s.ask(adviser(A1), "how many dependants per relationship");
  assert.deepEqual(kids.rows.map((r) => [r.label, r.value]), [["Child", 1]]);
});

test("a named client narrows the query to that client, only within the adviser's own book", async () => {
  const mine = await service().ask(adviser(A1), "show me Thandiwe Mokoenaville's claims");
  assert.equal(mine.kind, "query");
  assert.ok(mine.readAs.includes("One client"));
  assert.deepEqual(mine.rows.map((r) => r.reference).sort(), ["RSF-T1", "RSF-T2"]);
  const theirs = await service().ask(adviser(A1), "show me Zanelethu Ndlovukazi's claims");
  assert.ok(!JSON.stringify(theirs).includes("RSF-T6"), "another adviser's client must never be matched");
  assert.deepEqual(detectClients("claims for thandiwe mokoenaville", [{ id: C1, first_name: "Thandiwe", surname: "Mokoenaville" }]), [C1]);
  assert.deepEqual(detectClients("a thandiwe tree", [{ id: C1, first_name: "Thandiwe", surname: "Mokoenaville" }]), []);
});

test("the model can plan a query; a bad plan falls back to local matching", async () => {
  const good = { enabled: true, generateJson: async () => ({ query: { dataset: "claims", filters: [{ field: "product_line", op: "eq", value: "Motor" }], group_by: "status", metric: { op: "count" } }, confidence: 0.9 }) };
  const r = await service(seed(), good).ask(adviser(A1), "motor claims by status please");
  assert.equal(r.kind, "query");
  assert.equal(r.matchedBy, "ai");
  assert.deepEqual(r.rows.map((x) => [x.label, x.value]).sort(), [["Completed", 1], ["Declined", 1]]);
  const bad = { enabled: true, generateJson: async () => ({ query: { dataset: "users", filters: [{ field: "id_number", op: "eq", value: "1" }] }, confidence: 0.99 }) };
  const fallback = await service(seed(), bad).ask(adviser(A1), "Which reminders are overdue?");
  assert.equal(fallback.matchedBy, "keyword");
  assert.equal(fallback.template.id, "overdue_reminders");
  const sneaky = { enabled: true, generateJson: async () => ({ query: { dataset: "claims", client_ids: [C3], advisor_id: A2, mode: "records" }, confidence: 0.9 }) };
  const guarded = await service(seed(), sneaky).ask(adviser(A1), "list claims");
  assert.ok(!JSON.stringify(guarded).includes("RSF-T6"), "model-supplied client ids and advisers are ignored");
});

test("the planner prompt describes fields, never client data", async () => {
  const sent = [];
  const llm = { enabled: true, generateJson: async (system, message) => (sent.push(system, message), { template_id: "claims_by_status", parameters: {}, confidence: 0.9 }) };
  await service(seed(), llm).ask(ADMIN, `claims for Thandiwe Mokoenaville ${SECRET_IDS[0]}`);
  const all = sent.join("\n");
  assert.match(all, /"dataset": "claims"/);
  assert.match(all, /Santam Mock/); // provider organisations are fine to list
  for (const secret of [...SECRET_NAMES, ...SECRET_IDS, "Secret Kid", "teacher"]) assert.ok(!all.includes(secret), `planner saw ${secret}`);
});

test("reports can be generated from a query; the model only gets counts for record lists", async () => {
  const sent = [];
  const llm = { enabled: true, generateJson: async (system, message) => (sent.push(message), { title: "Open claims", narrative: "One open claim." }) };
  const r = await service(seed(), llm).generate(ADMIN, null, null, { dataset: "claims", mode: "records", filters: [{ field: "status", op: "eq", value: "Open" }] });
  assert.equal(r.kind, "query");
  assert.equal(r.writtenBy, "ai");
  assert.equal(r.rows.length, 1);
  for (const secret of [...SECRET_NAMES, "RSF-T8"]) assert.ok(!sent.join("").includes(secret), `narrative payload had ${secret}`);
  const templated = await service().generate(adviser(A1), null, null, { dataset: "claims", group_by: "provider" });
  assert.equal(templated.writtenBy, "template");
  assert.ok(templated.narrative.length > 10);
});

test("the local parser reads common question shapes", () => {
  const now = NOW;
  const p = (q) => parseQuestion(q, { now, providers: ["Santam Mock"] }).spec;
  assert.deepEqual(p("average days to close motor claims by provider").metric, { op: "avg", field: "days_to_close" });
  assert.equal(p("list clients who are onboarding").mode, "records");
  assert.deepEqual(p("debts over R1m").filters, [{ field: "category", op: "eq", value: "liability" }, { field: "amount", op: "gt", value: 1000000 }]);
  assert.equal(p("claims per month by status").time_bucket, "month");
  assert.equal(p("claims per month by status").split_by, "status");
  assert.equal(p("how many clients have funeral claims").metric.op, "count_clients");
  assert.equal(p("which provider has the most declined claims").group_by, "provider");
  assert.equal(p("total assets and debts of clients").split_by, "category");
});

// ---------------------------------------------------------------- money reports and richer reports
const { deriveHighlights } = require("../src/services/reports.service");

test("claim money reports use claimed and paid-out amounts", async () => {
  const s = service();
  const avg = await s.run(adviser(A1), "claim_amounts_by_type", {});
  assert.deepEqual(avg.rows.map((r) => [r.label, r.avg_claimed, r.avg_paid, r.claims]), [["Life", 400000, 0, 1], ["Motor", 40000, 45000, 2]]);
  const report = await s.generate(adviser(A1), "claim_amounts_by_type", {});
  assert.equal(report.highlights.find((h) => h.label === "Paid out on settled claims").value, "90%");
  const trend = await s.run(adviser(A1), "claim_value_trend", { group_by: "week", date_range: { from: "2026-08-01", to: "2026-09-19" } });
  assert.equal(trend.period, "week");
  assert.equal(trend.rows.reduce((n, r) => n + r.claimed, 0), 480000);
  assert.equal(trend.rows.reduce((n, r) => n + r.paid, 0), 45000);
  const payout = await s.run(adviser(A1), "settlement_by_provider", {});
  assert.deepEqual(payout.rows.map((r) => [r.label, r.claimed, r.paid, r.payout_rate]), [["Santam Mock", 80000, 45000, 56]]);
});

test("monthly cash flow converts frequencies and finds clients in deficit", async () => {
  const r = await service().run(adviser(A1), "monthly_cash_flow", {});
  // C1: 40 000 - 30 000 = +10 000; C2: 240 000/12 = 20 000 - 25 000 = -5 000
  assert.deepEqual(r.rows.map((x) => x.value), [1, 0, 1, 0, 0]);
  assert.match(r.headline, /1 client spends more than they earn/);
});

test("without the amounts migration, money reports explain what's missing instead of failing", async () => {
  const data = seed();
  const db = fakeDb(data);
  const strict = { from: (table) => {
    const b = db.from(table);
    const select = b.select;
    b.select = (cols) => {
      if (table === "tasks" && /claimed_amount/.test(cols || "")) {
        const err = { then: (res) => res({ data: null, error: { message: "column tasks.claimed_amount does not exist" } }) };
        err.in = () => err; err.eq = () => err; err.order = () => err; err.range = () => err;
        return err;
      }
      return select(cols);
    };
    return b;
  } };
  const s = createReportsService({ db: strict, llm: noLlm, now: () => NOW, adviserNames });
  const r = await s.run(adviser(A1), "claim_amounts_by_type", {});
  assert.match(r.notice, /202609200001_claim_amounts\.sql/);
  const q = await s.ask(adviser(A1), "average claim amount per week");
  assert.equal(q.kind, "query");
  assert.match(q.notice, /aren't recorded yet/);
  const other = await s.run(adviser(A1), "claims_by_type", {});
  assert.ok(other.rows.length > 0, "other reports keep working");
});

test("generated reports come with key figures, a two-part story and related charts", async () => {
  const r = await service().generate(adviser(A1), "claims_by_type", {});
  assert.ok(r.highlights.length >= 2);
  assert.ok(r.related.length >= 1 && r.related.length <= 2);
  for (const view of r.related) {
    assert.ok(view.title && view.caption && view.chartType);
    assert.equal(view.llmRows, undefined);
    assert.equal(view.insights, undefined);
  }
  assert.match(r.narrative, /\n\nAlongside this: /);
  const q = await service().generate(adviser(A1), null, null, { dataset: "claims", filters: [{ field: "product_line", op: "eq", value: "Motor" }], metric: { op: "count" }, group_by: "status" });
  assert.deepEqual(q.related.map((v) => v.readAs.at(-1)), ["per month", "by provider"]);
});

test("the story model sees the related charts, never client data", async () => {
  const sent = [];
  const llm = { enabled: true, generateJson: async (system, message) => (sent.push({ system, message }), { title: "Motor dominates", narrative: "One.\n\nTwo." }) };
  const r = await service(seed(), llm).generate(ADMIN, "claims_by_type", {});
  assert.equal(r.writtenBy, "ai");
  const payload = JSON.parse(sent.at(-1).message);
  assert.ok(payload.related.length >= 1);
  assert.ok(payload.related.every((v) => v.title && v.headline && Array.isArray(v.rows)));
  assert.match(sent.at(-1).system, /related charts/);
  for (const secret of [...SECRET_NAMES, ...SECRET_IDS]) assert.ok(!sent.at(-1).message.includes(secret));
});

test("key figures are derived sensibly for each chart shape", () => {
  const bars = deriveHighlights({ chartType: "bar", unit: "claims", rows: [{ label: "Motor", value: 6 }, { label: "Life", value: 2 }], series: [{ key: "value" }] });
  assert.deepEqual(bars, [{ label: "Total", value: "8" }, { label: "Largest", value: "Motor: 6 (75%)" }, { label: "Groups", value: "2" }]);
  const line = deriveHighlights({ chartType: "line", unit: "tasks", period: "month", rows: [{ label: "2026-08", a: 2, b: 1 }, { label: "2026-09", a: 4, b: 3 }], series: [{ key: "a" }, { key: "b" }] });
  assert.deepEqual(line.map((h) => h.value), ["10", "September 2026 (7)", "5"]);
  const avg = deriveHighlights({ chartType: "bar", unit: "days", rows: [{ label: "A", value: 9 }, { label: "B", value: 3 }], series: [{ key: "value" }] });
  assert.deepEqual(avg, [{ label: "Largest", value: "A: 9 days" }, { label: "Lowest", value: "B: 3 days" }]);
  assert.deepEqual(deriveHighlights({ chartType: "bar", highlights: [{ label: "x", value: "1" }], rows: [] }), [{ label: "x", value: "1" }]);
});

test("money questions reach the money reports or a money query", async () => {
  const s = service();
  assert.equal((await s.ask(adviser(A1), "What's the average claim amount per product line?")).template.id, "claim_amounts_by_type");
  assert.equal((await s.ask(adviser(A1), "total claims per week")).template?.id, "claim_value_trend");
  const avgWeek = await s.ask(adviser(A1), "average claim amount per week");
  assert.equal(avgWeek.kind, "query");
  assert.deepEqual(avgWeek.query.metric, { op: "avg", field: "claimed_amount" });
  assert.equal(avgWeek.query.time_bucket, "week");
  // Weekly means weekly (Monday keys), even when the claims span many months.
  assert.ok(avgWeek.rows.length > 0 && avgWeek.rows.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.label)), JSON.stringify(avgWeek.rows));
  assert.ok(avgWeek.rows.every((r) => new Date(`${r.label}T12:00:00Z`).getUTCDay() === 1));
  // Averages aren't added up in the key figures or the story.
  const avgReport = await s.generate(adviser(A1), null, {}, avgWeek.query);
  assert.ok(avgReport.highlights.every((h) => !/^Total/.test(h.label)), JSON.stringify(avgReport.highlights));
  assert.doesNotMatch(avgReport.narrative, /undefined|NaN/);
  const big = await s.ask(adviser(A1), "list motor claims over R40k");
  assert.deepEqual(big.rows.map((r) => r.reference), ["RSF-T1"]);
});
