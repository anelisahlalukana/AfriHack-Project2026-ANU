// Turns a plain-English question into a query spec without the model, for when Gemini is
// off or unavailable. It covers the common shapes:
//   "how many motor claims were declined this year"      -> count with filters
//   "average client rating per provider"                  -> avg grouped by a field
//   "total liabilities by item type"                      -> sum grouped by a field
//   "list clients who are onboarding"                     -> records
//   "claims per month by status"                          -> time series split by a field
//   "clients older than 60", "debts over R1m"             -> number comparisons
// Client names are matched locally against the caller's own clients (never sent anywhere).
// Returns { spec, specificity } or null when the question doesn't name a dataset.
const { DATASETS } = require("./datasets");
const { extractDateRange } = require("./keywords");
const { dateKey, DAY_MS } = require("./params");

const DATASET_ORDER = ["claims", "requests", "reminders", "documents", "goals", "financial_items", "dependants", "screenings", "clients"];

// Values people say for fields whose options come from the data.
const VOCAB = {
  goal_type: ["retirement", "education", "emergency fund", "property", "holiday", "vehicle", "wedding", "business"],
  item_type: ["property", "investment", "investments", "vehicle", "home loan", "bond", "credit card", "personal loan", "cash", "retirement annuity", "pension", "shares", "vehicle finance", "savings"],
  relationship: ["child", "son", "daughter", "spouse", "wife", "husband", "partner", "parent", "mother", "father"],
  reminder_type: ["birthday", "annual review", "valuation", "anniversary", "licence", "license", "police report", "retirement fee"],
  request_type: ["address", "bank details", "debit order", "financial items"],
  marital_status: ["married", "single", "divorced", "widowed"],
  category: ["asset", "liability", "income", "expense"],
};
const GENERIC_FIELD_WORDS = new Set(["type", "kind", "status", "state", "date", "created", "adviser", "advisor", "advisers", "advisors", "consultant", "category", "total", "value", "item", "product", "line", "form", "check", "outcome", "percentage", "percent", "share", "current", "progress", "target", "due", "by", "run", "waiting", "sent", "signed", "joined"]);
const VALUE_ALIASES = {
  liability: ["liability", "liabilities", "debt", "debts", "loan", "loans", "owe", "owed"],
  asset: ["asset", "assets"],
  "Waiting on client": ["waiting on the client", "waiting on client", "awaiting client", "with the client"],
  Declined: ["declined", "decline", "declines", "rejected", "reject", "repudiated", "turned down"],
  Completed: ["completed", "closed", "paid out", "settled", "finished"],
  Open: ["open", "outstanding", "in progress", "pending claims"],
  Flagged: ["flagged", "hit", "match"],
  Signed: ["signed"],
  Sent: ["unsigned", "awaiting signature", "not signed", "sent"],
  "Not sent": ["not sent"],
  Motor: ["motor", "car", "vehicle", "accident"],
  Health: ["health", "medical", "hospital"],
};
const GENERIC_PROVIDER_WORDS = new Set(["life", "insure", "insurance", "group", "financial", "mutual", "old", "health", "mock", "the"]);

const lower = (s) => ` ${String(s).toLowerCase().replace(/[^a-z0-9%.\s-]/g, " ").replace(/\s+/g, " ")} `;
const has = (q, phrase) => q.includes(` ${phrase.toLowerCase()} `);
const escape = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function pickDataset(q) {
  let best = null;
  for (const id of DATASET_ORDER) {
    const d = DATASETS[id];
    let score = 0;
    for (const word of d.synonyms) if (has(q, word)) score += word.includes(" ") ? 3 : 2;
    for (const [key, field] of Object.entries(d.fields)) {
      if (field.personal || field.parserSkip || key === "adviser" || key === "status") continue;
      for (const value of field.values || []) if (has(q, value.toLowerCase())) score += 1;
      // Field names that only make sense for this dataset ("rating" -> claims, "annual income" -> clients).
      const names = [field.label.toLowerCase(), ...(field.synonyms || [])].filter((n) => n.length >= 5 && !GENERIC_FIELD_WORDS.has(n));
      for (const name of names) if (has(q, name)) score += name.includes(" ") ? 3 : 1.5;
    }
    if (score > (best?.score || 0)) best = { id, score };
  }
  // "how many clients have motor claims" is about claims; clients is the fallback subject
  // unless a clients-only field (age, income, occupation...) decided it.
  if (best?.id === "clients" && best.score <= 2) {
    for (const id of DATASET_ORDER.slice(0, -1)) {
      if (DATASETS[id].synonyms.some((w) => has(q, w))) return id;
    }
  }
  return best?.id || null;
}

function valuesFor(field, key, providers) {
  if (field.values) return field.values;
  if (field.dynamic === "providers") return providers;
  return VOCAB[key] || [];
}

function mentions(q, value, field) {
  const text = value.toLowerCase().replace(/\s*\(.*?\)\s*/g, " ").trim();
  if (has(q, text)) return true;
  for (const alias of VALUE_ALIASES[value] || []) if (has(q, alias)) return true;
  if (field.dynamic === "providers") {
    const first = text.split(/\s+/)[0];
    return first.length >= 4 && !GENERIC_PROVIDER_WORDS.has(first) && has(q, first);
  }
  return false;
}

function findField(dataset, text) {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  for (const [key, field] of Object.entries(dataset.fields)) {
    if (field.personal) continue;
    const names = [key.replace(/_/g, " "), field.label.toLowerCase(), ...(field.synonyms || [])];
    if (names.some((n) => t === n || t.startsWith(`${n} `) || t.endsWith(` ${n}`) || t === `${n}s`)) return key;
  }
  return null;
}

function parseAmount(num, suffix) {
  let n = Number(String(num).replace(/[\s,]/g, ""));
  if (!Number.isFinite(n)) return null;
  if (/^(k|thousand)$/i.test(suffix || "")) n *= 1000;
  if (/^(m|mil|million)$/i.test(suffix || "")) n *= 1e6;
  return n;
}

function numberFilters(q, dataset) {
  const out = [];
  const re = /\b(over|more than|above|greater than|at least|older than|under|less than|below|at most|younger than)\s+(r\s?)?(\d[\d\s,.]*?)\s?(k|m|mil|million|thousand)?\s*(days?|years?|stars?|%|percent)?(?=\s|$)/g;
  let m;
  while ((m = re.exec(q))) {
    const [, word, rand, num, suffix, unitWord] = m;
    const value = parseAmount(num, suffix);
    if (value == null) continue;
    const op = /over|more|above|greater|older/.test(word) ? (word === "at least" ? "gte" : "gt") : word === "at most" ? "lte" : "lt";
    let field = null;
    const numberFields = Object.entries(dataset.fields).filter(([, fl]) => fl.type === "number");
    if (/day/.test(unitWord || "")) {
      const idle = /\b(idle|stuck|no update|not moved|waiting|open for)\b/.test(q);
      field = numberFields.find(([k]) => (idle ? k === "idle_days" || k === "days_waiting" : /days/.test(k)))?.[0];
    }
    else if (/year/.test(unitWord || "") || /older|younger/.test(word)) field = numberFields.find(([k]) => k === "age")?.[0];
    else if (/star/.test(unitWord || "") || has(q, "rating") || has(q, "rated")) field = numberFields.find(([k]) => k === "client_rating")?.[0];
    else if (/%|percent/.test(unitWord || "")) field = numberFields.find(([, fl]) => fl.unit === "%")?.[0];
    else if (rand || suffix) field = numberFields.find(([, fl]) => fl.unit === "rand")?.[0];
    if (!field) {
      for (const [key, fl] of numberFields) if ((fl.synonyms || []).some((s) => has(q, s))) field = key;
    }
    field = field || dataset.numberField;
    if (field && dataset.fields[field]?.type === "number") out.push({ field, op, value });
  }
  return out;
}

function dateFilter(q, dataset, now) {
  if (!dataset.dateField) return null;
  const today = dateKey(now);
  const future = ["due_date", "target_date", "expires_at"].includes(dataset.dateField);
  const ahead = q.match(/\b(?:next|within|coming|in the next)\s+(\d{1,3})\s*(day|week|month)s?\b/);
  if (future && (ahead || /\b(next week|next month|this week|coming up|upcoming)\b/.test(q))) {
    const days = ahead ? Number(ahead[1]) * { day: 1, week: 7, month: 30 }[ahead[2]] : /next month/.test(q) ? 30 : 7;
    return { field: dataset.dateField, op: "between", value: [today, dateKey(new Date(now.getTime() + days * DAY_MS))] };
  }
  if (future && /\b(overdue|past due|missed|late)\b/.test(q)) return { field: dataset.dateField, op: "lte", value: dateKey(new Date(now.getTime() - DAY_MS)) };
  const range = extractDateRange(q, now);
  return range ? { field: dataset.dateField, op: "between", value: [range.from, range.to] } : null;
}

// Client names in the question, matched only against the caller's own clients.
function detectClients(question, clients = []) {
  const text = String(question);
  const found = new Set();
  const exact = new Set();
  for (const c of clients) {
    const first = (c.first_name || "").trim();
    const last = (c.surname || "").trim();
    const full = `${first} ${last}`.trim();
    const hit = (name, needCapital) => {
      if (name.length < 3) return false;
      const re = new RegExp(`(^|[^A-Za-z])${escape(name)}('s)?([^A-Za-z]|$)`, needCapital ? "" : "i");
      return re.test(text);
    };
    if (full.includes(" ") && hit(full, false)) exact.add(c.id);
    else if ((last.length >= 4 && hit(last, true)) || hit(first, true)) found.add(c.id);
  }
  // A full name beats partial matches: "Naledi Khumalo" shouldn't also pull in every other Naledi.
  return [...(exact.size ? exact : found)];
}

function parseQuestion(question, { now = new Date(), providers = [], clientIds = [] } = {}) {
  const q = lower(question);
  const datasetId = pickDataset(q) || (clientIds.length ? "claims" : null);
  if (!datasetId) return null;
  const dataset = DATASETS[datasetId];

  // Category filters (a product line, a status, a provider, a goal type...).
  const filters = [];
  for (const [key, field] of Object.entries(dataset.fields)) {
    if (field.personal || field.parserSkip || field.type !== "enum" || key === "adviser" || key === "reference") continue;
    const hits = valuesFor(field, key, providers).filter((v) => mentions(q, v, field));
    // "Open" inside "open claims" is a status; skip it when the question is about opening dates.
    const clean = hits.filter((v) => !(v === "Open" && /\bopened\b/.test(q)));
    // "open claims" means everything still in progress, including those waiting on the client.
    if (key === "status" && clean.length === 1 && clean[0] === "Open" && (field.values || []).includes("Waiting on client")) {
      filters.push({ field: key, op: "in", value: ["Open", "Waiting on client"], stillOpen: true });
    } else if (clean.length === 1) filters.push({ field: key, op: "eq", value: clean[0] });
    else if (clean.length > 1) filters.push({ field: key, op: "in", value: clean });
  }
  if (datasetId === "clients" && (has(q, "pep") || has(q, "politically exposed"))) filters.push({ field: "politically_exposed", op: "eq", value: true });
  filters.push(...numberFilters(q, dataset));
  const date = dateFilter(q, dataset, now);

  // Grouping: "by X", "per X", "for each X", "split by X"; time: "per month", "over time".
  let groupBy = null;
  let splitBy = null;
  let bucket = null;
  const timeMatch = q.match(/\b(per|each|by|every)\s+(week|month|year)\b|\b(weekly|monthly|yearly|annually|over time|trend)\b/);
  if (timeMatch && dataset.dateField) {
    groupBy = dataset.dateField;
    const word = timeMatch[2] || timeMatch[3];
    bucket = /week/.test(word) ? "week" : /year|annual/.test(word) ? "year" : "month";
  }
  const byMatches = [...q.matchAll(/\b(?:by|per|for each|each|split by|broken down by|grouped by|across)\s+([a-z %]+?)(?=\s(?:and|by|per|for|in|over|this|last|with|from|since|split|where|that|who)\b|\s*$)/g)];
  for (const m of byMatches) {
    const words = m[1].trim().split(" ");
    let key = null;
    for (let n = Math.min(3, words.length); n >= 1 && !key; n -= 1) key = findField(dataset, words.slice(0, n).join(" "));
    if (!key || dataset.fields[key].type === "number" || key === dataset.dateField) continue;
    if (!groupBy) groupBy = key;
    else if (!splitBy && key !== groupBy) splitBy = key;
  }
  const andMatch = groupBy && !splitBy ? q.match(new RegExp(`\\b${escape(dataset.fields[groupBy]?.label.toLowerCase() || "")}\\s+and\\s+([a-z ]+?)(?=\\s|$)`)) : null;
  if (andMatch) {
    const key = findField(dataset, andMatch[1]);
    if (key && key !== groupBy && ["enum", "bool"].includes(dataset.fields[key].type)) splitBy = key;
  }
  // "which provider has the most claims" -> group by provider
  if (!groupBy) {
    const which = q.match(/\b(?:which|what)\s+([a-z ]+?)\s+(?:has|have|had|gets?|got|is|are)\s+(?:the\s+)?(most|fewest|least|highest|lowest|biggest)/);
    if (which) {
      const key = findField(dataset, which[1]);
      if (key && dataset.fields[key].type !== "number") groupBy = key;
    }
  }

  // Metric.
  const numberField = (() => {
    for (const [key, fl] of Object.entries(dataset.fields)) {
      if (fl.type === "number" && [key.replace(/_/g, " "), fl.label.toLowerCase(), ...(fl.synonyms || [])].some((s) => has(q, s))) return key;
    }
    return dataset.numberField;
  })();
  let metric = { op: "count" };
  const speed = /\b(how quickly|how fast|how long|turnaround|time to (close|settle|pay))\b/.test(q);
  const daysField = Object.entries(dataset.fields).find(([k, fl]) => fl.type === "number" && /days/.test(k))?.[0];
  if (speed && daysField) metric = { op: "avg", field: daysField };
  else if (/\b(average|avg|mean|typical)\b/.test(q) && numberField) metric = { op: "avg", field: numberField };
  else if (/\b(total|sum|how much|combined|worth)\b/.test(q) && numberField && dataset.fields[numberField].unit === "rand") metric = { op: "sum", field: numberField };
  else if (/\b(highest|largest|biggest|maximum|max|longest|oldest)\b/.test(q) && !groupBy && numberField && !/\bmost\b/.test(q)) metric = { op: "max", field: numberField };
  else if (/\b(lowest|smallest|minimum|min|shortest|youngest)\b/.test(q) && !groupBy && numberField) metric = { op: "min", field: numberField };
  else if (datasetId !== "clients" && /\bhow many (clients|customers|people)\b/.test(q)) metric = { op: "count_clients" };

  // Records: "list ...", "show me ...", "which clients ...", "who ...", or a named client.
  const aggregateWords = /\b(how many|number of|count|total|sum|average|avg|mean|most|least|breakdown|split|per|trend|over time|percentage|share)\b/.test(q);
  const listWords = /^\s*(list|show|which|who|find|give me|display|what are the|get)\b/.test(q) || /\b(list of|are there any|any)\b/.test(q);
  const records = !groupBy && metric.op === "count" && ((listWords && !aggregateWords) || (clientIds.length > 0 && !aggregateWords));

  const spec = {
    dataset: datasetId,
    filters: date ? [...filters, date] : filters,
    ...(clientIds.length ? { client_ids: clientIds } : {}),
    group_by: groupBy,
    time_bucket: bucket,
    split_by: splitBy,
    metric,
    mode: records ? "records" : "aggregate",
    sort: /\b(least|lowest|fewest|smallest|shortest)\b/.test(q) ? "asc" : "desc",
    chart: /\b(share|percentage|proportion|split)\b/.test(q) && !splitBy ? "donut" : null,
  };
  // "assets and debts", "motor and funeral claims": several values of one field are compared
  // side by side (split), not added together into one number.
  let comparedFilters = 0;
  if (!records && !splitBy) {
    const i = spec.filters.findIndex((fl) => fl.op === "in" && !fl.stillOpen);
    if (i >= 0 && spec.group_by !== spec.filters[i].field) {
      spec.split_by = spec.filters[i].field;
      comparedFilters = 1; // a comparison, not a narrowing filter
    }
  }
  const comparing = /\b(vs|versus|compared?|comparison|or)\b/.test(q) && comparedFilters > 0;
  // "what share of claims are declined" -> show the whole split (a donut), not one number.
  if (spec.chart === "donut" && !groupBy && !records) {
    const i = spec.filters.findIndex((fl) => fl.op === "eq" && DATASETS[datasetId].fields[fl.field].type === "enum");
    if (i >= 0) {
      spec.split_by = spec.filters[i].field;
      spec.highlight = spec.filters[i].value; // lead the answer with the value they asked about
      spec.filters.splice(i, 1);
      filters.splice(filters.findIndex((fl) => fl.field === spec.split_by), 1);
    }
  }
  // How much more this question asks for than a fixed report can give. Averages/sums and
  // time series are things the templates mostly don't do, so they weigh more.
  const specificity =
    filters.length - comparedFilters +
    (comparing ? 1 : 0) +
    (spec.group_by ? 1 : 0) +
    (spec.split_by ? 1 : 0) +
    (records ? 1 : 0) +
    (metric.op !== "count" && metric.op !== "count_clients" ? 2 : metric.op === "count_clients" ? 1 : 0) +
    (bucket ? 1 : 0) +
    (spec.chart === "donut" && spec.split_by && !spec.group_by ? 2 : 0) +
    (clientIds.length ? 3 : 0);
  spec.filters = spec.filters.map(({ field, op, value }) => ({ field, op, value }));
  return { spec, specificity, filters: filters.length - comparedFilters, hasDate: Boolean(date) };
}

module.exports = { parseQuestion, detectClients, pickDataset };
