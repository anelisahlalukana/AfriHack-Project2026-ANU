// Parameter schema and normalisation for report templates.
// Every value that reaches a query builder passes through normalizeParams, whatever
// its source (the intent model, a suggested-question chip, or a hand-made request).
// Scope never comes from here: advisor_id is only honoured for admins (see scope.js).
const { BUSINESS_TIME_ZONE } = require("../constants/dashboard");

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_RANGE_DAYS = 10 * 366; // "all time" questions

// Shared definitions. A template lists the keys it accepts in `params`.
const PARAM_SCHEMA = {
  date_range: { type: "object", description: "{ from: YYYY-MM-DD, to: YYYY-MM-DD } inclusive" },
  advisor_id: { type: "uuid", description: "Only one adviser's book (admins only; ignored for advisers)" },
  product_type: { type: "string", description: "Claim category: motor, life, health, funeral, personal or commercial" },
  provider_id: { type: "uuid", description: "Only one product provider" },
  client_id: { type: "uuid", description: "Only one client" },
  days_ahead: { type: "integer", description: "Look-ahead window in days (1-365)" },
  older_than_days: { type: "integer", description: "Only items idle for at least this many days (1-365)" },
  task_type: { type: "string", description: "'claim' or a request type key such as update_address" },
  goal_type: { type: "string", description: "Goal type as stored on the goal, e.g. retirement, education" },
  group_by: { type: "string", description: "How to group the result (see the template's options)" },
};

const PRODUCT_TYPES = ["motor", "life", "health", "funeral", "personal", "commercial"];

function dateKey(date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE }).format(date);
}

function isRealDate(value) {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

function defaultRange(days, now) {
  return { from: dateKey(new Date(now.getTime() - (days - 1) * DAY_MS)), to: dateKey(now) };
}

function normalizeRange(value, fallbackDays, now) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaultRange(fallbackDays, now);
  const from = isRealDate(value.from) ? value.from : null;
  const to = isRealDate(value.to) ? value.to : null;
  if (!from && !to) return defaultRange(fallbackDays, now);
  const end = to || dateKey(now);
  let start = from || dateKey(new Date(Date.parse(`${end}T00:00:00Z`) - (fallbackDays - 1) * DAY_MS));
  if (start > end) return defaultRange(fallbackDays, now);
  const span = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY_MS;
  if (span > MAX_RANGE_DAYS) start = dateKey(new Date(Date.parse(`${end}T00:00:00Z`) - MAX_RANGE_DAYS * DAY_MS));
  return { from: start, to: end };
}

function cleanText(value, max = 60) {
  if (typeof value !== "string") return undefined;
  const text = value.trim().toLowerCase().replace(/\s+/g, "_");
  return text && text.length <= max && /^[a-z0-9_-]+$/.test(text) ? text : undefined;
}

// Returns only the parameters the template declares, with safe values and defaults.
function normalizeParams(template, raw = {}, now = new Date()) {
  const input = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const out = {};
  for (const key of template.params) {
    const value = input[key];
    switch (key) {
      case "date_range":
        out.date_range = normalizeRange(value, template.defaults?.rangeDays || 90, now);
        break;
      case "advisor_id":
      case "provider_id":
      case "client_id":
        if (typeof value === "string" && UUID.test(value)) out[key] = value.toLowerCase();
        break;
      case "days_ahead": {
        const days = Number(value);
        out.days_ahead = Number.isInteger(days) && days >= 1 && days <= 365 ? days : template.defaults?.daysAhead || 60;
        break;
      }
      case "older_than_days": {
        const days = Number(value);
        out.older_than_days = Number.isInteger(days) && days >= 1 && days <= 365 ? days : template.defaults?.olderThanDays || 7;
        break;
      }
      case "product_type": {
        const type = cleanText(value);
        if (PRODUCT_TYPES.includes(type)) out.product_type = type;
        break;
      }
      case "group_by": {
        const choice = cleanText(value);
        if (template.groupBy?.includes(choice)) out.group_by = choice;
        break;
      }
      default: {
        const text = cleanText(value);
        if (text) out[key] = text;
      }
    }
  }
  return out;
}

// The part of the schema a template exposes, for the intent model and the browse list.
function describeParams(template) {
  return Object.fromEntries(
    template.params.map((key) => {
      const spec = { ...PARAM_SCHEMA[key] };
      if (key === "group_by" && template.groupBy) spec.options = template.groupBy;
      if (key === "product_type") spec.options = PRODUCT_TYPES;
      return [key, spec];
    })
  );
}

module.exports = { PARAM_SCHEMA, PRODUCT_TYPES, DAY_MS, dateKey, isRealDate, defaultRange, normalizeParams, describeParams };
