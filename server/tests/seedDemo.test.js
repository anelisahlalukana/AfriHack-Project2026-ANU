const test = require("node:test");
const assert = require("node:assert/strict");
const { seedDemo, resetDemo, luhnDigit, parseArgs, DEMO_DOMAIN } = require("../scripts/seed-demo");

const NOW = "2026-09-20T08:00:00+02:00";
const ADVISER = "aaaaaaaa-1111-4111-8111-000000000001";

// In-memory store with the same interface the seed uses against Supabase.
function memoryStore() {
  const tables = {
    users: [
      { id: "real-client", role_id: 1, advisor_id: ADVISER, first_name: "Real", surname: "Client", contact_email: "real@example.com" },
      { id: "p1", role_id: 2, organisation_name: "Santam", claim_category: "motor", product_lines: ["motor", "personal"], reference_prefix: "SNT" },
      { id: "p2", role_id: 2, organisation_name: "Old Mutual", claim_category: "life", product_lines: ["life", "funeral"], reference_prefix: "OMU" },
    ],
    claim_stages: [
      ...["motor", "funeral"].flatMap((c) => [
        { category: c, step_order: 1, stage_key: "claim_registered", actor: "provider" },
        { category: c, step_order: 2, stage_key: "documents", actor: "client", requires_client_action: true },
        { category: c, step_order: 3, stage_key: "assessed", actor: "provider" },
        { category: c, step_order: 4, stage_key: "closed", actor: "client", requires_client_action: true, is_terminal: true, outcome: "completed" },
        { category: c, step_order: 100, stage_key: "declined", actor: "provider", is_terminal: true, outcome: "declined" },
      ]),
      { category: "request", step_order: 1, stage_key: "received", actor: "adviser" },
      { category: "request", step_order: 2, stage_key: "done", actor: "adviser", is_terminal: true, outcome: "completed" },
    ],
    claim_categories: [{ category: "motor", label: "Motor", form_fields: [{ key: "incident_at", type: "datetime-local" }, { key: "vehicle_registration", type: "text" }] }, { category: "funeral", label: "Funeral", form_fields: [] }],
    request_types: [{ task_type: "update_address", label: "Change of address", workflow: "request", requires_provider: false, form_fields: [] }],
    reminder_rules: ["birthday", "annual-review", "valuation", "retirement-fee"].map((id) => ({ id, title: id, repeat_months: 12, audience: "both" })),
    adviser_cpd_records: [{ id: "real-cpd", adviser_id: ADVISER, activity: "Real course", hours: 2 }],
    compliance_audit_log: [],
  };
  const auth = [{ id: ADVISER, email: "qiniso@royalsquare.example", app_metadata: { role: "advisor" }, user_metadata: { full_name: "Qiniso" } }];
  const match = (row, { col, op, value }) =>
    op === "eq" ? row[col] === value
    : op === "in" ? value.includes(row[col])
    : op === "like" ? new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*")}$`).test(String(row[col] ?? ""))
    : op === "is" ? row[col] === value
    : false;
  let seq = 1000;
  return {
    tables,
    auth: {
      listUsers: async () => auth,
      createUser: async ({ email, app_metadata, user_metadata }) => {
        const u = { id: `auth-${auth.length}`, email, app_metadata, user_metadata };
        auth.push(u);
        return u;
      },
      deleteUser: async (id) => auth.splice(auth.findIndex((u) => u.id === id), 1),
      all: auth,
    },
    async select(table, columns, filters = []) {
      return (tables[table] || []).filter((r) => filters.every((f) => match(r, f)));
    },
    async insert(table, rows, returning) {
      const withDefaults = rows.map((r) => (table === "tasks" ? { reference: `RSF-${(seq += 1)}`, ...r } : { ...r }));
      (tables[table] ||= []).push(...withDefaults);
      return returning ? withDefaults : [];
    },
    async delete(table, filters) {
      const before = (tables[table] || []).length;
      tables[table] = (tables[table] || []).filter((r) => !filters.every((f) => match(r, f)));
      return before - tables[table].length;
    },
  };
}

test("seeds every area with linked, well-formed demo data", async () => {
  const store = memoryStore();
  const summary = await seedDemo(store, { now: NOW, clients: 40, seed: 3 });
  const t = store.tables;
  const clients = t.users.filter((u) => u.role_id === 1 && u.contact_email.endsWith(`@${DEMO_DOMAIN}`));
  assert.equal(clients.length, 40);
  assert.ok(summary.claims > 20 && summary.tasks > summary.claims);
  for (const table of ["client_financial_items", "client_goals", "client_dependants", "documents", "task_updates", "provider_events", "reminders", "client_screenings", "notifications"]) {
    assert.ok(t[table]?.length > 0, `${table} is empty`);
  }
  const ids = new Set(clients.map((c) => c.id));
  for (const table of ["client_financial_items", "client_goals", "documents", "tasks", "reminders", "client_screenings"]) {
    assert.ok(t[table].every((r) => ids.has(r.client_id)), `${table} has rows for other clients`);
  }
  // Clients go mostly to the real adviser (so they see a full book) plus two demo advisers.
  assert.equal(summary.advisers.length, 3);
  assert.ok(summary.advisers[0].clients > summary.advisers[1].clients);
  // Well-formed SA ID numbers that match the date of birth.
  for (const c of clients) {
    assert.equal(luhnDigit(c.id_number.slice(0, 12)), c.id_number[12]);
    assert.equal(c.id_number.slice(0, 6), c.date_of_birth.slice(2, 4) + c.date_of_birth.slice(5, 7) + c.date_of_birth.slice(8, 10));
  }
  // Nothing fires or pushes just because the data was seeded.
  assert.ok(t.reminders.every((r) => r.status !== "pending" || r.trigger_date > "2026-09-20"));
  assert.ok(t.notifications.every((n) => n.push_status !== "pending" && n.event_key.startsWith("demo-seed:")));
  // Task status always matches its stage.
  const stage = (task) => t.claim_stages.find((s) => s.category === task.workflow && s.stage_key === task.current_stage);
  for (const task of t.tasks) {
    const s = stage(task);
    assert.ok(s, `unknown stage ${task.current_stage}`);
    if (task.status === "declined") assert.equal(s.outcome, "declined");
    if (task.status === "completed") assert.equal(s.outcome, "completed");
    if (task.status === "awaiting_client") assert.ok(s.requires_client_action);
    if (["completed", "declined", "cancelled"].includes(task.status)) assert.ok(task.closed_at >= task.created_at);
  }
});

test("refuses to seed twice, and reset removes exactly the demo data", async () => {
  const store = memoryStore();
  await seedDemo(store, { now: NOW, clients: 10 });
  await assert.rejects(seedDemo(store, { now: NOW, clients: 10 }), /already there/);
  await resetDemo(store);
  const t = store.tables;
  assert.deepEqual(t.users.map((u) => u.id).sort(), ["p1", "p2", "real-client"]);
  assert.deepEqual(t.adviser_cpd_records.map((r) => r.id), ["real-cpd"]);
  for (const table of ["tasks", "task_updates", "provider_events", "documents", "reminders", "client_goals", "client_financial_items", "client_dependants", "client_screenings", "notifications"]) {
    assert.equal(t[table].length, 0, `${table} not emptied`);
  }
  assert.deepEqual(store.auth.all.map((u) => u.email), ["qiniso@royalsquare.example"]);
  await seedDemo(store, { now: NOW, clients: 5 }); // and it can seed again afterwards
});

test("reset keeps demo clients that the append-only audit log refers to", async () => {
  const store = memoryStore();
  await seedDemo(store, { now: NOW, clients: 5 });
  const audited = store.tables.users.find((u) => u.contact_email?.endsWith(`@${DEMO_DOMAIN}`));
  store.tables.compliance_audit_log.push({ id: "a1", client_id: audited.id, actor_id: ADVISER });
  const logs = [];
  await resetDemo(store, { log: (line) => logs.push(line) });
  assert.ok(store.tables.users.some((u) => u.id === audited.id));
  assert.match(logs.join("\n"), /kept 1 demo client/);
  const before = new Set(store.tables.users.map((u) => u.id));
  await seedDemo(store, { now: NOW, clients: 5 }); // the kept shell neither blocks a new seed nor clashes with it
  const added = store.tables.users.filter((u) => !before.has(u.id));
  assert.equal(added.length, 5);
  assert.equal(new Set(store.tables.users.map((u) => u.id)).size, store.tables.users.length, "no duplicate ids");
});

test("a demo login the database won't delete is kept by reset and reused by the next seed", async () => {
  const store = memoryStore();
  await seedDemo(store, { now: NOW, clients: 5 });
  const stuck = store.auth.all.find((u) => u.email.startsWith("lindiwe.mahlaba@"));
  const realDelete = store.auth.deleteUser;
  store.auth.deleteUser = async (id) => {
    if (id === stuck.id) throw new Error("auth: Database error deleting user");
    return realDelete(id);
  };
  const logs = [];
  const removed = await resetDemo(store, { log: (line) => logs.push(line) });
  assert.equal(removed["auth users kept"], 1);
  assert.match(logs.join("\n"), /kept demo login .*next seed reuses it/);
  const seedLogs = [];
  const summary = await seedDemo(store, { now: NOW, clients: 5, log: (line) => seedLogs.push(line) });
  assert.match(seedLogs.join("\n"), /reusing demo login lindiwe\.mahlaba@/);
  assert.equal(store.auth.all.filter((u) => u.email === stuck.email).length, 1);
  assert.ok(summary.advisers.some((a) => a.email === stuck.email));
});

test("the same seed gives the same data", async () => {
  const a = memoryStore();
  const b = memoryStore();
  await seedDemo(a, { now: NOW, clients: 8, seed: 9 });
  await seedDemo(b, { now: NOW, clients: 8, seed: 9 });
  assert.deepEqual(a.tables.tasks.map((x) => [x.status, x.claim_category]), b.tables.tasks.map((x) => [x.status, x.claim_category]));
});

test("options: named advisers must exist and be advisers", async () => {
  await assert.rejects(seedDemo(memoryStore(), { now: NOW, advisers: ["nobody@x.co"] }), /No login found/);
  const args = parseArgs(["--yes", "--clients=80", "--advisers=a@x.co, b@y.co", "--demo-advisers=0", "--seed=4"]);
  assert.deepEqual(args, { yes: true, reset: false, fresh: false, clients: "80", advisers: ["a@x.co", "b@y.co"], demoAdvisers: "0", demoPassword: args.demoPassword, seed: 4 });
  const solo = await seedDemo(memoryStore(), { now: NOW, clients: 6, demoAdvisers: 0 });
  assert.deepEqual(solo.advisers.map((a) => a.clients), [6]);
});
