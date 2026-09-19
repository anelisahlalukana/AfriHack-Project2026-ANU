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
function periodsFor(range) {
  const start = Date.parse(`${range.from}T00:00:00Z`);
  const end = Date.parse(`${range.to}T00:00:00Z`);
  const weekly = (end - start) / DAY_MS <= 120;
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

const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0);
const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const daysSince = (value, now) => Math.max(0, Math.floor((now.getTime() - Date.parse(value)) / DAY_MS));

module.exports = {
  scopedClients, forClients, providerNames, DAY_MS, dateKey,
  OPEN_REMINDER_STATUSES, CLAIM_STATUS_LABELS, AUTOMATIC_PROVIDER_REPLIES, DONE_DOCUMENT_STATUSES,
  round1, avg, pct, plural, daysSince, humanise, taskTypeLabel, rangeBounds, inRange, countRows, increment,
  adviserLabel, scopedTasks, periodsFor, DECLINE_BUCKETS, declineReason, NET_WORTH_BUCKETS, TASK_COLUMNS,
};
