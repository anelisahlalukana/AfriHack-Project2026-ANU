// Shared building blocks for report templates (templates.js, templates.extra.js).
const { scopedClients, forClients, providerNames } = require("./scope");
const { DAY_MS, dateKey } = require("./params");

const OPEN_REMINDER_STATUSES = ["pending", "active", "notified"];
const CLAIM_STATUS_LABELS = {
  open: "Open",
  awaiting_client: "Waiting on client",
  completed: "Completed",
  declined: "Declined",
  cancelled: "Cancelled",
};
// The mocked insurer API acknowledges a submission instantly; that isn't a person responding.
const AUTOMATIC_PROVIDER_REPLIES = ["claim_registered", "request_acknowledged"];
const DONE_DOCUMENT_STATUSES = ["signed", "filed"];

// ---------------------------------------------------------------- helpers
const round1 = (n) => Math.round(n * 10) / 10;
const avg = (list) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0);

function humanise(key) {
  if (!key) return "Other";
  const text = String(key).replace(/[_-]+/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function taskTypeLabel(task) {
  if (task.task_type === "claim") return task.claim_category ? `${humanise(task.claim_category)} claim` : "Claim";
  return humanise(task.task_type);
}

// Timestamps in [from, to] (whole days in the business time zone).
function rangeBounds(range) {
  return { from: `${range.from}T00:00:00+02:00`, to: `${range.to}T23:59:59.999+02:00` };
}
function inRange(value, range) {
  if (!value) return false;
  const time = Date.parse(value);
  const { from, to } = rangeBounds(range);
  return time >= Date.parse(from) && time <= Date.parse(to);
}

function countRows(map, order) {
  const keys = order ? order.filter((k) => map.has(k)).concat([...map.keys()].filter((k) => !order.includes(k))) : [...map.keys()];
  return keys.map((label) => ({ label, value: map.get(label) }));
}
function increment(map, key, by = 1) {
  map.set(key, (map.get(key) || 0) + by);
}

async function adviserLabel(ctx, ids) {
  const names = await ctx.adviserNames(ids.filter(Boolean));
  return (id) => (id ? names.get(id) || "Adviser" : "Unassigned");
}

const TASK_COLUMNS =
  "id, client_id, task_type, claim_category, status, provider_id, created_at, updated_at, submitted_at, closed_at, client_rating, reference";

function scopedTasks(ctx, clients, refine) {
  return forClients(
    ctx.db,
    "tasks",
    TASK_COLUMNS,
    clients.map((c) => c.id),
    refine
  );
}

// Weekly buckets for ranges up to ~4 months, monthly beyond that.
// Weekly buckets for ranges up to ~4 months, monthly beyond that, unless `bucket` says otherwise.
function periodsFor(range, bucket) {
  const start = Date.parse(`${range.from}T00:00:00Z`);
  const end = Date.parse(`${range.to}T00:00:00Z`);
  const weekly = bucket === "week" ? true : bucket === "month" ? false : (end - start) / DAY_MS <= 120;
  const keyOf = (value) => {
    const day = dateKey(new Date(value));
    if (!weekly) return day.slice(0, 7);
    const date = new Date(`${day}T00:00:00Z`);
    const monday = new Date(date.getTime() - ((date.getUTCDay() + 6) % 7) * DAY_MS);
    return monday.toISOString().slice(0, 10);
  };
  const keys = [];
  for (let t = start; t <= end; t += DAY_MS) {
    const key = keyOf(new Date(t + 12 * 3600 * 1000));
    if (!keys.includes(key)) keys.push(key);
  }
  return { weekly, keys, keyOf };
}

// Free-text decline notes -> a small, fixed set of reasons (the note itself is never sent to the model).
const DECLINE_BUCKETS = [
  ["Policy exclusion", /exclu|not covered|no cover|outside (the )?cover|pre-?existing|waiting period|not insured/i],
  ["Policy lapsed", /laps|premium|unpaid|arrear|not in force|cancelled policy|policy (was )?cancel/i],
  ["Missing documents", /document|docs\b|paperwork|proof|certificate|missing|evidence|form\b|report|invoice|quote|photo/i],
];
function declineReason(note) {
  if (!note || !note.trim()) return "Other";
  const hit = DECLINE_BUCKETS.find(([, pattern]) => pattern.test(note));
  return hit ? hit[0] : "Other";
}

const NET_WORTH_BUCKETS = [
  ["Negative", -Infinity, 0],
  ["R0 – R250k", 0, 250000],
  ["R250k – R1m", 250000, 1000000],
  ["R1m – R5m", 1000000, 5000000],
  ["R5m+", 5000000, Infinity],
];

// Claim amounts live in two optional columns (migration 202609200001_claim_amounts.sql).
// Until that migration is applied, reports say so instead of failing.
const AMOUNTS_MIGRATION = "supabase/migrations/202609200001_claim_amounts.sql";
const AMOUNTS_NOTICE = `Claim amounts aren't recorded yet. Apply ${AMOUNTS_MIGRATION} and record the claimed and paid-out amounts on claims to see this.`;

async function claimAmounts(ctx, taskIds) {
  if (ctx.amountsAvailable === false) return null;
  if (!taskIds.length) return new Map();
  try {
    const rows = await forClients(ctx.db, "tasks", "id, claimed_amount, settled_amount", taskIds, (q) => q, "id");
    ctx.amountsAvailable = true;
    const num = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
    return new Map(rows.map((r) => [r.id, { claimed: num(r.claimed_amount), settled: num(r.settled_amount) }]));
  } catch (error) {
    if (/claimed_amount|settled_amount|does not exist|schema cache/i.test(error.message)) {
      ctx.amountsAvailable = false;
      return null;
    }
    throw error;
  }
}

// Monthly equivalent of an FNA income/expense line.
const PER_MONTH = { monthly: 1, weekly: 52 / 12, quarterly: 1 / 3, annually: 1 / 12, annual: 1 / 12, yearly: 1 / 12 };
function monthlyAmount(item) {
  const factor = PER_MONTH[String(item.frequency || "").toLowerCase()];
  return factor ? (Number(item.amount) || 0) * factor : 0;
}

// "2026-04" -> "April 2026"; "2026-04-13" (a week's Monday) -> "the week of 13 Apr".
function periodName(key) {
  if (/^\d{4}-\d{2}$/.test(key)) return new Date(`${key}-01T12:00:00Z`).toLocaleDateString("en-ZA", { month: "long", year: "numeric", timeZone: "UTC" });
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    const d = new Date(`${key}T12:00:00Z`);
    return `the week of ${d.getUTCDate()} ${d.toLocaleDateString("en-ZA", { month: "short", timeZone: "UTC" })}`;
  }
  return key;
}

const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const daysSince = (value, now) => Math.max(0, Math.floor((now.getTime() - Date.parse(value)) / DAY_MS));

module.exports = {
  scopedClients, forClients, providerNames, DAY_MS, dateKey,
  OPEN_REMINDER_STATUSES, CLAIM_STATUS_LABELS, AUTOMATIC_PROVIDER_REPLIES, DONE_DOCUMENT_STATUSES,
  round1, avg, pct, plural, daysSince, humanise, taskTypeLabel, rangeBounds, inRange, countRows, increment,
  adviserLabel, scopedTasks, periodsFor, DECLINE_BUCKETS, declineReason, NET_WORTH_BUCKETS, TASK_COLUMNS,
  claimAmounts, AMOUNTS_NOTICE, AMOUNTS_MIGRATION, monthlyAmount, periodName,
};
