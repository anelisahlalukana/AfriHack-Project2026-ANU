// Datasets for free-form ("ask anything") queries. Each dataset loads the caller's
// scoped records as flat rows with friendly field names. The query engine (query.js) can
// only filter, group and aggregate the fields declared here, so nothing outside this
// allowlist (ID numbers, contact details, bank details, FNA health data, notes) can be
// queried, and every loader starts from scopedClients() so an adviser only ever reaches
// their own clients.
//
// Field types: enum (text categories), number, date (ISO), bool.
// `personal: true` fields (client names) are shown in record tables in the browser only;
// they can't be grouped by and never reach the model.
const { CLIENT_ROLE_ID } = require("../constants/roles");
const { DOCUMENT_TYPES } = require("../constants/documentTypes");
const { fullName } = require("../utils/fullName");
const {
  scopedClients, forClients, providerNames, DAY_MS, CLAIM_STATUS_LABELS, humanise, adviserLabel, scopedTasks, daysSince, claimAmounts,
} = require("./helpers");

const STATUS_LABELS = { ...CLAIM_STATUS_LABELS, draft: "Draft" };
const DOCUMENT_LABELS = new Map(DOCUMENT_TYPES.map((d) => [d.type, d.label]));

const f = (label, type, extra = {}) => ({ label, type, ...extra });
const CLIENT_FIELD = f("Client", "enum", { personal: true });
const ADVISER_FIELD = f("Adviser", "enum", { synonyms: ["advisor", "advisers", "advisors", "consultant"] });

// Clients in scope plus the per-client labels every dataset shares.
async function base(ctx, access, params) {
  const clients = await scopedClients(ctx.db, access, params);
  const byId = new Map(clients.map((c) => [c.id, c]));
  const adviserOf = access.role === "admin" ? await adviserLabel(ctx, clients.map((c) => c.advisor_id)) : () => access.label;
  const common = (clientId) => ({ client_id: clientId, client: fullName(byId.get(clientId)), adviser: adviserOf(byId.get(clientId)?.advisor_id) });
  return { clients, ids: clients.map((c) => c.id), byId, common };
}

async function requestLabels(ctx) {
  try {
    const { data } = await ctx.db.from("request_types").select("task_type, label");
    return new Map((data || []).map((r) => [r.task_type, r.label]));
  } catch {
    return new Map();
  }
}

function taskFields(kind) {
  return {
    reference: f("Reference", "enum", { groupable: false }),
    client: CLIENT_FIELD,
    adviser: ADVISER_FIELD,
    ...(kind === "claims"
      ? { product_line: f("Product line", "enum", { values: ["Motor", "Life", "Health", "Funeral", "Personal", "Commercial"], synonyms: ["category", "type", "claim type", "product", "line"] }) }
      : { request_type: f("Request type", "enum", { synonyms: ["type", "kind"] }) }),
    status: f("Status", "enum", { values: Object.values(CLAIM_STATUS_LABELS), synonyms: ["state", "stage"] }),
    provider: f("Provider", "enum", { dynamic: "providers", synonyms: ["insurer", "insurers", "company", "providers"] }),
    created_at: f("Logged on", "date", { synonyms: ["created", "logged", "submitted", "opened", "date"] }),
    closed_at: f("Closed on", "date", { synonyms: ["closed", "completed on", "finished"] }),
    days_to_close: f("Days to close", "number", { unit: "days", synonyms: ["turnaround", "time to close", "how long"] }),
    idle_days: f("Days since last update", "number", { unit: "days", synonyms: ["idle", "stuck", "no update", "waiting"] }),
    client_rating: f("Client rating", "number", { unit: "rating", synonyms: ["rating", "satisfaction", "stars", "review"] }),
    ...(kind === "claims"
      ? {
          // From migration 202609200001_claim_amounts.sql; empty until it's applied.
          claimed_amount: f("Amount claimed", "number", { unit: "rand", amounts: true, synonyms: ["claim amount", "claimed", "claim value", "claim size", "amount", "value", "worth", "money", "rand"] }),
          settled_amount: f("Amount paid out", "number", { unit: "rand", amounts: true, synonyms: ["paid out", "payout", "payouts", "paid", "settled amount", "settlement"] }),
        }
      : {}),
  };
}

async function loadTasks(kind, ctx, access, params) {
  const { clients, common } = await base(ctx, access, params);
  const tasks = (await scopedTasks(ctx, clients, (q) => (kind === "claims" ? q.eq("task_type", "claim") : q.neq("task_type", "claim")))).filter(
    (t) => (kind === "claims" ? t.task_type === "claim" : t.task_type !== "claim") && t.status !== "draft"
  );
  const names = await providerNames(ctx.db, tasks.map((t) => t.provider_id));
  const labels = kind === "requests" ? await requestLabels(ctx) : null;
  const amounts = kind === "claims" ? await claimAmounts(ctx, tasks.map((t) => t.id)) : null;
  return tasks.map((t) => ({
    id: t.id,
    reference: t.reference || null,
    ...common(t.client_id),
    ...(kind === "claims" ? { product_line: humanise(t.claim_category || "Uncategorised") } : { request_type: labels.get(t.task_type) || humanise(t.task_type) }),
    status: STATUS_LABELS[t.status] || humanise(t.status),
    provider: names.get(t.provider_id) || "No provider",
    created_at: t.created_at,
    closed_at: t.closed_at || null,
    days_to_close: t.submitted_at && t.closed_at && t.status === "completed" ? Math.round(((Date.parse(t.closed_at) - Date.parse(t.submitted_at)) / DAY_MS) * 10) / 10 : null,
    idle_days: ["open", "awaiting_client"].includes(t.status) ? daysSince(t.updated_at || t.created_at, ctx.now) : null,
    client_rating: t.client_rating ? Number(t.client_rating) : null,
    ...(kind === "claims" ? { claimed_amount: amounts?.get(t.id)?.claimed ?? null, settled_amount: amounts?.get(t.id)?.settled ?? null } : {}),
  }));
}

function age(dob, now) {
  const t = Date.parse(dob);
  if (!Number.isFinite(t)) return null;
  return Math.floor((now.getTime() - t) / (365.25 * DAY_MS));
}

const DATASETS = {
  claims: {
    label: "Claims",
    noun: "claims",
    description: "Insurance claims logged for clients (one row per claim).",
    synonyms: ["claim", "claims"],
    dateField: "created_at",
    numberField: "claimed_amount",
    fields: taskFields("claims"),
    recordColumns: ["reference", "client", "product_line", "status", "provider", "claimed_amount", "created_at"],
    load: (ctx, access, params) => loadTasks("claims", ctx, access, params),
  },
  requests: {
    label: "Service requests",
    noun: "requests",
    description: "Non-claim service requests such as address or bank detail changes (one row per request).",
    synonyms: ["request", "requests", "service request"],
    dateField: "created_at",
    numberField: "days_to_close",
    fields: taskFields("requests"),
    recordColumns: ["reference", "client", "request_type", "status", "provider", "created_at"],
    load: (ctx, access, params) => loadTasks("requests", ctx, access, params),
  },
  clients: {
    label: "Clients",
    noun: "clients",
    description: "Clients (one row per client) with status, risk profile, occupation, marital status, age and income.",
    synonyms: ["client", "clients", "customer", "customers", "people", "book"],
    dateField: "created_at",
    numberField: "annual_income",
    fields: {
      client: CLIENT_FIELD,
      adviser: ADVISER_FIELD,
      status: f("Status", "enum", { values: ["Onboarding", "Active", "Inactive"] }),
      risk_profile: f("Risk profile", "enum", { values: ["Conservative", "Moderate", "Balanced", "Aggressive", "Not assessed"], synonyms: ["risk", "risk category"] }),
      occupation: f("Occupation", "enum", { synonyms: ["job", "profession", "work"] }),
      marital_status: f("Marital status", "enum", { synonyms: ["married", "single", "marital"] }),
      nationality: f("Nationality", "enum", { synonyms: ["country", "citizenship"] }),
      politically_exposed: f("Politically exposed", "bool", { synonyms: ["pep"] }),
      age: f("Age", "number", { unit: "years", synonyms: ["old", "older", "younger", "years"] }),
      annual_income: f("Annual income", "number", { unit: "rand", synonyms: ["income", "salary", "earn", "earnings"] }),
      created_at: f("Joined on", "date", { synonyms: ["joined", "signed up", "onboarded", "created"] }),
    },
    recordColumns: ["client", "status", "risk_profile", "occupation", "age", "created_at"],
    async load(ctx, access, params) {
      const { ids, common } = await base(ctx, access, params);
      const rows = await forClients(
        ctx.db,
        "users",
        "id, role_id, status, risk_profile_category, occupation, marital_status, nationality, is_politically_exposed, annual_income, date_of_birth, created_at",
        ids,
        (q) => q.eq("role_id", CLIENT_ROLE_ID),
        "id"
      );
      return rows.map((u) => ({
        id: u.id,
        ...common(u.id),
        status: humanise(u.status || "unknown"),
        risk_profile: u.risk_profile_category ? humanise(u.risk_profile_category) : "Not assessed",
        occupation: u.occupation ? humanise(u.occupation) : "Not recorded",
        marital_status: u.marital_status ? humanise(u.marital_status) : "Not recorded",
        nationality: u.nationality || "Not recorded",
        politically_exposed: Boolean(u.is_politically_exposed),
        age: age(u.date_of_birth, ctx.now),
        annual_income: u.annual_income == null ? null : Number(u.annual_income),
        created_at: u.created_at,
      }));
    },
  },
  reminders: {
    label: "Reminders",
    noun: "reminders",
    description: "Reminders (reviews, birthdays, renewals, police reports) with due date and status.",
    synonyms: ["reminder", "reminders", "birthday", "birthdays", "review", "reviews", "follow up", "follow ups"],
    dateField: "due_date",
    numberField: null,
    fields: {
      client: CLIENT_FIELD,
      adviser: ADVISER_FIELD,
      reminder_type: f("Reminder type", "enum", { synonyms: ["type", "kind"] }),
      status: f("Status", "enum", { values: ["Pending", "Notified", "Completed", "Active", "Cancelled"] }),
      recipient: f("For", "enum", { values: ["Client", "Adviser", "Both"], parserSkip: true }),
      due_date: f("Due date", "date", { synonyms: ["due", "trigger", "date"] }),
    },
    recordColumns: ["client", "reminder_type", "status", "due_date"],
    async load(ctx, access, params) {
      const { ids, common } = await base(ctx, access, params);
      const rows = await forClients(ctx.db, "reminders", "id, client_id, reminder_type, rule_id, status, recipient, trigger_date", ids);
      return rows.map((r) => ({
        id: r.id,
        ...common(r.client_id),
        reminder_type: humanise(r.reminder_type || r.rule_id || "other"),
        status: humanise(r.status || "pending"),
        recipient: humanise(r.recipient || "client"),
        due_date: r.trigger_date,
      }));
    },
  },
  documents: {
    label: "Documents",
    noun: "documents",
    description: "The five onboarding/compliance documents per client with their status and dates.",
    synonyms: ["document", "documents", "paperwork", "consent", "signature", "fais", "broker appointment", "service agreement"],
    dateField: "sent_at",
    numberField: "days_waiting",
    fields: {
      client: CLIENT_FIELD,
      adviser: ADVISER_FIELD,
      document_type: f("Document", "enum", { values: DOCUMENT_TYPES.map((d) => d.label), synonyms: ["document type", "type", "form"] }),
      status: f("Status", "enum", { values: ["Not sent", "Sent", "Signed", "Filed"] }),
      sent_at: f("Sent on", "date", { synonyms: ["sent"] }),
      signed_at: f("Signed on", "date", { synonyms: ["signed"] }),
      expires_at: f("Expires on", "date", { synonyms: ["expires", "expiry"] }),
      days_waiting: f("Days waiting for signature", "number", { unit: "days", synonyms: ["waiting", "outstanding"] }),
    },
    recordColumns: ["client", "document_type", "status", "sent_at", "signed_at"],
    async load(ctx, access, params) {
      const { ids, common } = await base(ctx, access, params);
      const rows = await forClients(ctx.db, "documents", "id, client_id, document_type, status, sent_at, signed_at, expires_at", ids);
      return rows.map((d) => ({
        id: d.id,
        ...common(d.client_id),
        document_type: DOCUMENT_LABELS.get(d.document_type) || humanise(d.document_type),
        status: humanise(d.status || "not_sent"),
        sent_at: d.sent_at || null,
        signed_at: d.signed_at || null,
        expires_at: d.expires_at || null,
        days_waiting: d.status === "sent" && d.sent_at ? daysSince(d.sent_at, ctx.now) : null,
      }));
    },
  },
  goals: {
    label: "Goals",
    noun: "goals",
    description: "Client financial goals with target amount, amount saved, % funded and target date.",
    synonyms: ["goal", "goals", "target", "targets", "saving for"],
    dateField: "target_date",
    numberField: "target_amount",
    fields: {
      client: CLIENT_FIELD,
      adviser: ADVISER_FIELD,
      goal_type: f("Goal type", "enum", { synonyms: ["type", "kind"] }),
      status: f("Status", "enum", { synonyms: ["state"] }),
      target_amount: f("Target amount", "number", { unit: "rand", synonyms: ["target", "goal amount"] }),
      saved: f("Saved so far", "number", { unit: "rand", synonyms: ["saved", "progress", "current"] }),
      funded_pct: f("% funded", "number", { unit: "%", synonyms: ["funded", "percent", "percentage"] }),
      target_date: f("Target date", "date", { synonyms: ["deadline", "due", "by"] }),
    },
    recordColumns: ["client", "goal_type", "target_amount", "saved", "funded_pct", "target_date"],
    async load(ctx, access, params) {
      const { ids, common } = await base(ctx, access, params);
      const rows = await forClients(ctx.db, "client_goals", "id, client_id, goal_type, status, target_amount, current_progress, target_date", ids);
      return rows.map((g) => {
        const target = Number(g.target_amount) || null;
        const saved = Number(g.current_progress) || 0;
        return {
          id: g.id,
          ...common(g.client_id),
          goal_type: humanise(g.goal_type || "Unspecified"),
          status: humanise(g.status || "in_progress"),
          target_amount: target,
          saved,
          funded_pct: target ? Math.round((Math.min(saved, target) / target) * 100) : null,
          target_date: g.target_date || null,
        };
      });
    },
  },
  financial_items: {
    label: "Assets and liabilities",
    noun: "items",
    description: "Assets, liabilities, income and expenses captured in each client's financial needs analysis.",
    synonyms: ["asset", "assets", "liability", "liabilities", "debt", "debts", "loan", "loans", "investment", "investments", "property", "expense", "expenses", "income"],
    dateField: null,
    numberField: "amount",
    fields: {
      client: CLIENT_FIELD,
      adviser: ADVISER_FIELD,
      category: f("Category", "enum", { synonyms: ["asset or liability", "kind"] }),
      item_type: f("Item type", "enum", { synonyms: ["type", "item"] }),
      amount: f("Amount", "number", { unit: "rand", synonyms: ["value", "worth", "balance", "total"] }),
      frequency: f("Frequency", "enum", { synonyms: ["monthly", "annual"] }),
    },
    recordColumns: ["client", "category", "item_type", "amount"],
    async load(ctx, access, params) {
      const { ids, common } = await base(ctx, access, params);
      const rows = await forClients(ctx.db, "client_financial_items", "id, client_id, category, item_type, amount, frequency", ids);
      return rows.map((i) => ({
        id: i.id,
        ...common(i.client_id),
        category: humanise(i.category),
        item_type: humanise(i.item_type),
        amount: Number(i.amount) || 0,
        frequency: i.frequency ? humanise(i.frequency) : "Once-off",
      }));
    },
  },
  dependants: {
    label: "Dependants",
    noun: "dependants",
    description: "Clients' dependants and beneficiaries by relationship (names are never included).",
    synonyms: ["dependant", "dependants", "dependent", "dependents", "beneficiary", "beneficiaries", "children", "kids", "spouse"],
    dateField: null,
    numberField: "beneficiary_percentage",
    fields: {
      client: CLIENT_FIELD,
      adviser: ADVISER_FIELD,
      relationship: f("Relationship", "enum", { synonyms: ["relation"] }),
      beneficiary_percentage: f("Beneficiary %", "number", { unit: "%", synonyms: ["share", "percentage"] }),
    },
    recordColumns: ["client", "relationship", "beneficiary_percentage"],
    async load(ctx, access, params) {
      const { ids, common } = await base(ctx, access, params);
      const rows = await forClients(ctx.db, "client_dependants", "id, client_id, relationship, beneficiary_percentage", ids);
      return rows.map((d) => ({
        id: d.id,
        ...common(d.client_id),
        relationship: humanise(d.relationship || "Not recorded"),
        beneficiary_percentage: d.beneficiary_percentage == null ? null : Number(d.beneficiary_percentage),
      }));
    },
  },
  screenings: {
    label: "Screenings",
    noun: "screenings",
    description: "PEP and terrorism-financing screening checks run on clients, with result and date.",
    synonyms: ["screening", "screenings", "pep", "sanctions", "terrorism", "aml"],
    dateField: "checked_at",
    numberField: null,
    fields: {
      client: CLIENT_FIELD,
      adviser: ADVISER_FIELD,
      screening_type: f("Check", "enum", { values: ["PEP", "Terrorism financing"], synonyms: ["type", "check"] }),
      result: f("Result", "enum", { values: ["Clear", "Flagged"], synonyms: ["outcome"] }),
      checked_at: f("Checked on", "date", { synonyms: ["checked", "run", "date"] }),
    },
    recordColumns: ["client", "screening_type", "result", "checked_at"],
    async load(ctx, access, params) {
      const { ids, common } = await base(ctx, access, params);
      const rows = await forClients(ctx.db, "client_screenings", "id, client_id, screening_type, result, created_at", ids);
      return rows.map((s) => ({
        id: s.id,
        ...common(s.client_id),
        screening_type: s.screening_type === "pep" ? "PEP" : "Terrorism financing",
        result: humanise(s.result),
        checked_at: s.created_at,
      }));
    },
  },
};

// Provider names are organisations, not client data, so they can go in the planner prompt.
async function providerOptions(db) {
  try {
    const { data } = await db.from("users").select("organisation_name").eq("role_id", 2);
    return (data || []).map((p) => p.organisation_name).filter(Boolean).sort();
  } catch {
    return [];
  }
}

// A compact description of what can be queried, for the planner prompt.
function describeDatasets(providers = []) {
  return Object.entries(DATASETS).map(([id, d]) => ({
    dataset: id,
    description: d.description,
    fields: Object.fromEntries(
      Object.entries(d.fields)
        .filter(([, field]) => !field.personal)
        .map(([key, field]) => [
          key,
          `${field.type}${field.values ? `: ${field.values.join(" | ")}` : field.dynamic === "providers" && providers.length ? `: ${providers.join(" | ")}` : ""}${field.unit ? ` (${field.unit})` : ""}`,
        ])
    ),
  }));
}

module.exports = { DATASETS, describeDatasets, providerOptions };
