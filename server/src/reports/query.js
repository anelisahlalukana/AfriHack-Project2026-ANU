// Free-form queries over the datasets in datasets.js.
//
// A query is a small JSON spec, never SQL:
//   { dataset, filters: [{ field, op, value }], group_by, time_bucket, split_by,
//     metric: { op: count|count_clients|sum|avg|min|max, field }, sort, limit,
//     mode: aggregate|records, chart, title }
// normalizeQuery() validates it against the dataset's allowlisted fields (unknown
// datasets, fields, operators or badly typed values are rejected), and runQuery()
// loads the caller's scoped rows and filters/aggregates them in memory. Scope comes
// from `access` (the signed-in user), so a query can never widen whose data it sees.
const { badRequest } = require("../utils/httpError");
const { DATASETS } = require("./datasets");
const { dateKey, isRealDate } = require("./params");
const { humanise, periodsFor, periodName, AMOUNTS_NOTICE } = require("./helpers");

const OPS_BY_TYPE = {
  enum: ["eq", "neq", "in", "contains"],
  number: ["eq", "neq", "gt", "gte", "lt", "lte", "between", "is_null", "not_null"],
  date: ["gte", "lte", "between", "is_null", "not_null"],
  bool: ["eq"],
};
const METRICS = ["count", "count_clients", "sum", "avg", "min", "max"];
const BUCKETS = ["week", "month", "year"];
const CHARTS = ["bar", "donut", "line", "table"];
const MAX_FILTERS = 8;
const MAX_GROUPS = 12;
const MAX_SERIES = 6;
const MAX_WEEKS = 26;
const MAX_RECORDS = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RAND = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 });

const norm = (v) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function fieldOf(dataset, key) {
  const field = typeof key === "string" ? dataset.fields[key] : null;
  return field ? { key, ...field } : null;
}

function cleanValue(field, op, value) {
  if (op === "is_null" || op === "not_null") return null;
  const one = (v) => {
    if (field.type === "number") {
      const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.-]/g, ""));
      if (!Number.isFinite(n)) throw badRequest(`"${field.label}" needs a number`);
      return n;
    }
    if (field.type === "date") {
      const d = String(v).slice(0, 10);
      if (!isRealDate(d)) throw badRequest(`"${field.label}" needs a date (YYYY-MM-DD)`);
      return d;
    }
    if (field.type === "bool") {
      if (typeof v === "boolean") return v;
      if (/^(true|yes|1)$/i.test(String(v))) return true;
      if (/^(false|no|0)$/i.test(String(v))) return false;
      throw badRequest(`"${field.label}" needs yes or no`);
    }
    const text = String(v).trim();
    if (!text || text.length > 80) throw badRequest(`"${field.label}" needs a short text value`);
    return text;
  };
  if (op === "between") {
    if (!Array.isArray(value) || value.length !== 2) throw badRequest(`"${field.label}" between needs two values`);
    return value.map(one);
  }
  if (op === "in") {
    const list = Array.isArray(value) ? value : [value];
    if (!list.length || list.length > 20) throw badRequest(`"${field.label}" needs 1-20 values`);
    return list.map(one);
  }
  return one(Array.isArray(value) ? value[0] : value);
}

// Validates a spec from the model, the keyword parser or the browser. Throws 400 on anything
// outside the allowlist; otherwise returns a clean copy with defaults filled in.
function normalizeQuery(raw) {
  if (!isObject(raw)) throw badRequest("A query must be an object");
  const datasetId = String(raw.dataset || "");
  const dataset = DATASETS[datasetId];
  if (!dataset) throw badRequest(`Unknown dataset "${datasetId}"`);

  const filters = (Array.isArray(raw.filters) ? raw.filters : []).slice(0, MAX_FILTERS).map((fl) => {
    if (!isObject(fl)) throw badRequest("Each filter must be an object");
    const field = fieldOf(dataset, fl.field);
    if (!field || field.personal) throw badRequest(`"${fl.field}" can't be filtered on`);
    const op = String(fl.op || "eq");
    if (!OPS_BY_TYPE[field.type].includes(op)) throw badRequest(`"${op}" doesn't work on ${field.label}`);
    return { field: field.key, op, value: cleanValue(field, op, fl.value) };
  });

  // Client ids come from the server's own name matching (never from the model). They can
  // only narrow the caller's scoped rows, never widen them.
  // A bad id must fail, never be dropped: dropping it would widen the result to every client.
  if (raw.client_ids !== undefined && (!Array.isArray(raw.client_ids) || raw.client_ids.length > 20 || raw.client_ids.some((id) => typeof id !== "string" || !UUID.test(id)))) {
    throw badRequest("Invalid client filter");
  }
  const clientIds = raw.client_ids || [];

  const groupField = raw.group_by ? fieldOf(dataset, raw.group_by) : null;
  if (raw.group_by && (!groupField || groupField.personal || groupField.groupable === false)) throw badRequest(`Can't group by "${raw.group_by}"`);
  if (groupField?.type === "number") throw badRequest(`Group by a category or a date, not "${groupField.label}"`);
  const splitField = raw.split_by ? fieldOf(dataset, raw.split_by) : null;
  if (raw.split_by && (!splitField || splitField.personal || !["enum", "bool"].includes(splitField.type) || splitField.key === groupField?.key)) {
    throw badRequest(`Can't split by "${raw.split_by}"`);
  }

  const metricIn = isObject(raw.metric) ? raw.metric : { op: raw.metric || "count" };
  const op = METRICS.includes(metricIn.op) ? metricIn.op : "count";
  let metricField = null;
  if (!["count", "count_clients"].includes(op)) {
    metricField = fieldOf(dataset, metricIn.field || dataset.numberField);
    if (!metricField || metricField.type !== "number") throw badRequest(`"${op}" needs a number field`);
  }

  const mode = raw.mode === "records" ? "records" : "aggregate";
  const limit = Math.min(Math.max(Number.parseInt(raw.limit, 10) || (mode === "records" ? MAX_RECORDS : MAX_GROUPS), 1), mode === "records" ? MAX_RECORDS : 50);
  return {
    dataset: datasetId,
    filters,
    ...(clientIds.length ? { client_ids: clientIds } : {}),
    // Admin-only narrowing to one adviser's book; ignored for advisers (see runQuery).
    ...(typeof raw.advisor_id === "string" && UUID.test(raw.advisor_id) ? { advisor_id: raw.advisor_id } : {}),
    group_by: groupField?.key || null,
    time_bucket: groupField?.type === "date" ? (BUCKETS.includes(raw.time_bucket) ? raw.time_bucket : "month") : null,
    split_by: splitField?.key || null,
    metric: { op, field: metricField?.key || null },
    sort: raw.sort === "asc" ? "asc" : "desc",
    limit,
    mode,
    chart: CHARTS.includes(raw.chart) ? raw.chart : null,
    highlight: typeof raw.highlight === "string" ? raw.highlight.slice(0, 80) : null,
    title: typeof raw.title === "string" ? raw.title.replace(/[\r\n]+/g, " ").trim().slice(0, 90) : "",
  };
}

// ------------------------------------------------------------------ filtering
function dayBound(value, end) {
  return Date.parse(`${value}T${end ? "23:59:59.999" : "00:00:00"}+02:00`);
}

function matches(row, filter, field) {
  const v = row[filter.field];
  const { op, value } = filter;
  if (op === "is_null") return v == null;
  if (op === "not_null") return v != null;
  if (field.type === "enum") {
    const text = norm(v);
    const same = (x) => text === norm(x) || (!field.values && norm(x).length >= 3 && text.includes(norm(x)));
    if (op === "eq") return same(value);
    if (op === "neq") return !same(value);
    if (op === "in") return value.some(same);
    if (op === "contains") return text.includes(norm(value));
  }
  if (field.type === "bool") return Boolean(v) === value;
  if (v == null) return false;
  if (field.type === "date") {
    const t = Date.parse(v);
    if (op === "gte") return t >= dayBound(value, false);
    if (op === "lte") return t <= dayBound(value, true);
    if (op === "between") return t >= dayBound(value[0], false) && t <= dayBound(value[1], true);
  }
  const n = Number(v);
  if (op === "eq") return n === value;
  if (op === "neq") return n !== value;
  if (op === "gt") return n > value;
  if (op === "gte") return n >= value;
  if (op === "lt") return n < value;
  if (op === "lte") return n <= value;
  if (op === "between") return n >= Math.min(...value) && n <= Math.max(...value);
  return false;
}

// ------------------------------------------------------------------ describing
function formatNumber(value, unit) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (unit === "rand") return RAND.format(value);
  const text = Number.isInteger(value) ? value.toLocaleString("en-ZA") : (Math.round(value * 10) / 10).toLocaleString("en-ZA");
  return `${text}${unit === "%" ? "%" : unit === "days" ? " days" : unit === "years" ? " years" : unit === "rating" ? "/5" : ""}`;
}

const OP_WORDS = { eq: "is", neq: "is not", in: "is one of", contains: "contains", gt: "over", gte: "at least", lt: "under", lte: "at most", between: "between", is_null: "is empty", not_null: "is recorded" };

function describeFilter(filter, dataset) {
  const field = dataset.fields[filter.field];
  const show = (v) => (field.type === "number" ? formatNumber(v, field.unit) : field.type === "bool" ? (v ? "yes" : "no") : v);
  if (field.type === "date") {
    if (filter.op === "between") return `${field.label} ${filter.value[0]} – ${filter.value[1]}`;
    if (filter.op === "gte") return `${field.label} from ${filter.value}`;
    if (filter.op === "lte") return `${field.label} up to ${filter.value}`;
  }
  const value = Array.isArray(filter.value) ? filter.value.map(show).join(filter.op === "between" ? " and " : ", ") : show(filter.value);
  return `${field.label} ${OP_WORDS[filter.op]}${filter.value == null ? "" : ` ${value}`}`;
}

function metricLabel(spec, dataset) {
  const { op, field } = spec.metric;
  if (op === "count") return `Number of ${dataset.noun}`;
  if (op === "count_clients") return "Number of clients";
  const words = { sum: "Total", avg: "Average", min: "Lowest", max: "Highest" };
  return `${words[op]} ${dataset.fields[field].label.toLowerCase()}`;
}

// Plain-English chips showing how the question was read ("Claims · Status is Declined · by Provider").
function describeQuery(spec) {
  const dataset = DATASETS[spec.dataset];
  const parts = [dataset.label, ...spec.filters.map((fl) => describeFilter(fl, dataset))];
  if (spec.client_ids?.length) parts.push(spec.client_ids.length === 1 ? "One client" : `${spec.client_ids.length} clients`);
  if (spec.mode === "records") parts.push("List of records");
  else {
    parts.push(metricLabel(spec, dataset));
    if (spec.group_by) parts.push(spec.time_bucket ? `per ${spec.time_bucket}` : `by ${dataset.fields[spec.group_by].label.toLowerCase()}`);
    if (spec.split_by) parts.push(`split by ${dataset.fields[spec.split_by].label.toLowerCase()}`);
  }
  return parts;
}

// Short, specific titles: "Claims: Motor, Declined", "Number of claims per month", "Average days to close by provider".
function filterValues(spec, dataset) {
  return spec.filters
    .filter((fl) => ["enum", "bool"].includes(dataset.fields[fl.field].type) && ["eq", "in"].includes(fl.op))
    .map((fl) => (dataset.fields[fl.field].type === "bool" ? dataset.fields[fl.field].label : [].concat(fl.value).map((v) => humanise(String(v))).join(" or ")));
}

function defaultTitle(spec) {
  const dataset = DATASETS[spec.dataset];
  const values = filterValues(spec, dataset);
  const suffix = values.length ? `: ${values.join(", ")}` : "";
  if (spec.mode === "records") return `${dataset.label}${suffix}`.slice(0, 90);
  const by = spec.group_by ? (spec.time_bucket ? ` per ${spec.time_bucket}` : ` by ${dataset.fields[spec.group_by].label.toLowerCase()}`) : "";
  return `${metricLabel(spec, dataset)}${by}${suffix}`.slice(0, 90);
}

// ------------------------------------------------------------------ aggregation
function aggregate(list, spec) {
  const { op, field } = spec.metric;
  if (op === "count") return list.length;
  if (op === "count_clients") return new Set(list.map((r) => r.client_id)).size;
  const values = list.map((r) => r[field]).filter((v) => v != null && Number.isFinite(Number(v))).map(Number);
  if (!values.length) return null;
  if (op === "sum") return values.reduce((a, b) => a + b, 0);
  if (op === "avg") return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
  if (op === "min") return Math.min(...values);
  return Math.max(...values);
}

function groupLabel(row, field, bucketKey) {
  const v = row[field.key];
  if (field.type === "bool") return v ? "Yes" : "No";
  if (field.type === "date") return v ? bucketKey(v) : "No date";
  return v == null || v === "" ? "Not recorded" : String(v);
}

function unitFor(spec, dataset) {
  if (spec.metric.op === "count") return dataset.noun;
  if (spec.metric.op === "count_clients") return "clients";
  return dataset.fields[spec.metric.field].unit || "";
}

function bucketer(spec, rows) {
  if (!spec.group_by || !spec.time_bucket) return { keyOf: (v) => v, keys: null };
  const dates = rows.map((r) => r[spec.group_by]).filter(Boolean).map((v) => Date.parse(v)).filter(Number.isFinite);
  if (!dates.length) return { keyOf: (v) => v, keys: [] };
  const from = dateKey(new Date(Math.min(...dates)));
  const to = dateKey(new Date(Math.max(...dates)));
  if (spec.time_bucket === "year") {
    const years = [];
    for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y += 1) years.push(String(y));
    return { keyOf: (v) => dateKey(new Date(v)).slice(0, 4), keys: years };
  }
  if (spec.time_bucket === "week") {
    // Weekly over a long history is unreadable: keep the most recent MAX_WEEKS weeks.
    const periods = periodsFor({ from, to }, "week");
    const keys = periods.keys.slice(-MAX_WEEKS);
    return { keyOf: periods.keyOf, keys, only: periods.keys.length > keys.length ? new Set(keys) : null };
  }
  if (spec.time_bucket === "month") {
    const keys = [];
    for (let d = new Date(`${from.slice(0, 7)}-01T12:00:00Z`); dateKey(d).slice(0, 7) <= to.slice(0, 7); d.setUTCMonth(d.getUTCMonth() + 1)) keys.push(dateKey(d).slice(0, 7));
    return { keyOf: (v) => dateKey(new Date(v)).slice(0, 7), keys };
  }
  const periods = periodsFor({ from, to });
  return { keyOf: periods.keyOf, keys: periods.keys };
}

function recordsResult(spec, dataset, rows) {
  const used = [...new Set([...dataset.recordColumns, ...spec.filters.map((fl) => fl.field)])].filter((k) => dataset.fields[k]);
  const sortField = dataset.dateField && used.includes(dataset.dateField) ? dataset.dateField : dataset.numberField;
  const sorted = [...rows].sort((a, b) => {
    const x = a[sortField];
    const y = b[sortField];
    if (x == null) return 1;
    if (y == null) return -1;
    const diff = typeof x === "number" ? x - y : Date.parse(x) - Date.parse(y);
    return spec.sort === "asc" ? diff : -diff;
  });
  const shown = sorted.slice(0, spec.limit).map((r) => {
    const out = { clientId: r.client_id, ...(dataset.fields.reference ? { taskId: r.id } : {}) };
    for (const k of used) {
      const field = dataset.fields[k];
      const v = r[k];
      out[k] = v == null ? "—" : field.type === "date" ? dateKey(new Date(v)) : field.type === "bool" ? (v ? "Yes" : "No") : field.type === "number" ? formatNumber(v, field.unit) : v;
    }
    return out;
  });
  const columns = used.map((k) => ({
    key: k,
    label: dataset.fields[k].label,
    ...(k === "client" ? { kind: "client" } : k === "reference" ? { kind: "task" } : {}),
    ...(dataset.fields[k].type === "number" ? { numeric: true } : {}),
  }));
  // The model only ever gets counts: how many matched, and a breakdown by the first category column.
  const breakdownKey = used.find((k) => dataset.fields[k].type === "enum" && !dataset.fields[k].personal && k !== "reference");
  const breakdown = new Map();
  if (breakdownKey) for (const r of rows) breakdown.set(r[breakdownKey] ?? "Not recorded", (breakdown.get(r[breakdownKey] ?? "Not recorded") || 0) + 1);
  return {
    chartType: "table",
    rows: shown,
    columns,
    series: [],
    unit: dataset.noun,
    headline: rows.length
      ? `${rows.length.toLocaleString("en-ZA")} matching ${rows.length === 1 ? dataset.noun.replace(/s$/, "") : dataset.noun}${rows.length > shown.length ? ` (showing ${shown.length})` : ""}`
      : `No matching ${dataset.noun}`,
    llmRows: [
      { label: `Matching ${dataset.noun}`, value: rows.length },
      ...[...breakdown.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, value]) => ({ label: `${dataset.fields[breakdownKey].label}: ${label}`, value })),
    ],
  };
}

function aggregateResult(spec, dataset, rows) {
  const unit = unitFor(spec, dataset);
  const mLabel = metricLabel(spec, dataset);
  if (!spec.group_by) {
    const value = aggregate(rows, spec);
    const splits = spec.split_by ? splitRows(rows, spec, dataset) : null;
    return {
      chartType: splits ? "donut" : "stat",
      rows: splits || [{ label: mLabel, value: value ?? 0 }],
      series: [{ key: "value", label: mLabel }],
      unit,
      headline: splits?.length && ["count", "count_clients", "sum"].includes(spec.metric.op)
        ? (() => {
            const total = splits.reduce((sum, r) => sum + r.value, 0);
            const shownUnit = unit === dataset.noun || unit === "clients" ? "" : unit;
            const share = (r) => `${r.label} ${total ? Math.round((r.value / total) * 100) : 0}%`;
            const asked = spec.highlight && splits.find((r) => norm(r.label) === norm(spec.highlight));
            const ofTotal = `of ${formatNumber(total, shownUnit)}${shownUnit ? "" : ` ${unit}`}`;
            if (asked) return `${asked.label}: ${formatNumber(asked.value, shownUnit)} ${ofTotal} (${total ? Math.round((asked.value / total) * 100) : 0}%)`;
            return `${splits.map(share).slice(0, 3).join(", ")} ${ofTotal}`;
          })()
        : value == null
          ? `${mLabel}: no values recorded${rows.length ? ` on the ${rows.length.toLocaleString("en-ZA")} matching ${dataset.noun}` : ""}`
          : spec.metric.op === "count"
            ? `${value.toLocaleString("en-ZA")} matching ${value === 1 ? dataset.noun.replace(/s$/, "") : dataset.noun}`
            : spec.metric.op === "count_clients"
              ? `${value.toLocaleString("en-ZA")} ${value === 1 ? "client" : "clients"}, across ${rows.length.toLocaleString("en-ZA")} ${dataset.noun}`
              : `${mLabel}: ${formatNumber(value, unit)}${rows.length ? `, across ${rows.length.toLocaleString("en-ZA")} ${dataset.noun}` : ""}`,
      llmRows: splits || [{ label: mLabel, value: value ?? 0 }],
    };
  }
  const groupField = { key: spec.group_by, ...dataset.fields[spec.group_by] };
  const { keyOf, keys, only } = bucketer(spec, rows);
  const groups = new Map((keys || []).map((k) => [k, []]));
  for (const r of rows) {
    const label = groupLabel(r, groupField, keyOf);
    if (only && !only.has(label)) continue;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(r);
  }
  const isTime = groupField.type === "date";
  let series = [{ key: "value", label: mLabel }];
  let out;
  if (spec.split_by) {
    const splitField = { key: spec.split_by, ...dataset.fields[spec.split_by] };
    const totals = new Map();
    for (const r of rows) {
      const s = groupLabel(r, splitField, (v) => v);
      totals.set(s, (totals.get(s) || 0) + 1);
    }
    const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s);
    const shown = top.slice(0, top.length > MAX_SERIES ? MAX_SERIES - 1 : MAX_SERIES);
    series = shown.map((label, i) => ({ key: `s${i}`, label }));
    if (top.length > shown.length) series.push({ key: "other", label: "Other" });
    out = [...groups.entries()].map(([label, list]) => {
      const row = { label };
      for (const s of series) row[s.key] = 0;
      for (const s of series) {
        const members = list.filter((r) => {
          const v = groupLabel(r, splitField, (x) => x);
          return s.key === "other" ? !shown.includes(v) : v === s.label;
        });
        row[s.key] = members.length ? aggregate(members, spec) ?? 0 : 0;
      }
      row.total = series.reduce((sum, s) => sum + (Number(row[s.key]) || 0), 0);
      return row;
    });
  } else {
    // An empty period is zero claims, but it has no average: leave it out rather than plot R 0.
    const adds = ["count", "count_clients", "sum"].includes(spec.metric.op);
    out = [...groups.entries()].map(([label, list]) => ({ label, value: list.length ? aggregate(list, spec) : adds ? 0 : null, count: list.length }));
    // Averages/min/max over groups with no recorded values mean "no data", not zero.
    out = out.filter((r) => r.value != null);
  }
  const valueOf = (r) => (spec.split_by ? r.total : r.value);
  if (!isTime) {
    out.sort((a, b) => (spec.sort === "asc" ? valueOf(a) - valueOf(b) : valueOf(b) - valueOf(a)));
    if (out.length > spec.limit) {
      const kept = out.slice(0, spec.limit - 1);
      if (["count", "count_clients", "sum"].includes(spec.metric.op) && !spec.split_by) {
        const rest = out.slice(spec.limit - 1);
        kept.push({ label: `Other (${rest.length})`, value: rest.reduce((s, r) => s + r.value, 0), count: rest.reduce((s, r) => s + r.count, 0) });
      }
      out = kept;
    }
  }
  let chartType = isTime ? "line" : "bar";
  if (spec.chart === "table") chartType = "bar";
  else if (spec.chart === "donut" && !isTime && !spec.split_by && ["count", "count_clients", "sum"].includes(spec.metric.op) && out.length <= 8) chartType = "donut";
  else if (spec.chart === "line" && isTime) chartType = "line";
  const top = isTime ? null : out[0];
  const total = ["count", "count_clients", "sum"].includes(spec.metric.op) && !spec.split_by ? out.reduce((s, r) => s + (Number(r.value) || 0), 0) : null;
  const shownUnit = unit === dataset.noun || unit === "clients" ? "" : unit;
  const built = {
    chartType,
    stacked: Boolean(spec.split_by),
    rows: out,
    series,
    unit,
    ...(isTime ? { period: spec.time_bucket } : {}),
    additive: ["count", "count_clients", "sum"].includes(spec.metric.op),
    headline: !rows.length
      ? `No matching ${dataset.noun}`
      : !out.length
        ? `No ${spec.metric.field ? dataset.fields[spec.metric.field].label.toLowerCase() : "values"} recorded on the ${rows.length.toLocaleString("en-ZA")} matching ${dataset.noun}`
      : top
        ? `${top.label} ${spec.sort === "asc" ? "is lowest" : "leads"} with ${formatNumber(valueOf(top), shownUnit)}${total != null && spec.metric.op !== "sum" ? ` of ${total.toLocaleString("en-ZA")}` : ""}`
        : (() => {
            // Time series: the total and the busiest period.
            const peak = out.reduce((best, r) => (valueOf(r) > valueOf(best) ? r : best), out[0]);
            const sum = out.reduce((n, r) => n + (Number(valueOf(r)) || 0), 0);
            return ["count", "count_clients", "sum"].includes(spec.metric.op) && peak
              ? `${formatNumber(sum, shownUnit)}${shownUnit ? "" : ` ${unit}`} in total; busiest was ${periodName(peak.label)} (${formatNumber(valueOf(peak), shownUnit)})`
              : (() => {
                  // Averages over time: describe the range rather than adding them up.
                  const filled = out.filter((r) => r.count > 0 && Number.isFinite(valueOf(r)));
                  if (filled.length < 2) return `${mLabel} per ${spec.time_bucket}`;
                  const lo = filled.reduce((m, r) => (valueOf(r) < valueOf(m) ? r : m), filled[0]);
                  const hi = filled.reduce((m, r) => (valueOf(r) > valueOf(m) ? r : m), filled[0]);
                  return `${mLabel} ranged from ${formatNumber(valueOf(lo), shownUnit)} (${periodName(lo.label)}) to ${formatNumber(valueOf(hi), shownUnit)} (${periodName(hi.label)})`;
                })();
          })(),
    llmRows: out.map((r) => {
      const clean = { label: r.label };
      for (const s of series) clean[s.label] = r[s.key];
      if (r.count != null && spec.metric.op !== "count") clean.records = r.count;
      return clean;
    }),
  };
  if (only && out.length) built.headline = `Last ${MAX_WEEKS} weeks: ${built.headline.charAt(0).toLowerCase()}${built.headline.slice(1)}`;
  return built;
}

function splitRows(rows, spec, dataset) {
  const field = { key: spec.split_by, ...dataset.fields[spec.split_by] };
  const groups = new Map();
  for (const r of rows) {
    const label = groupLabel(r, field, (v) => v);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(r);
  }
  return [...groups.entries()].map(([label, list]) => ({ label, value: aggregate(list, spec) ?? 0 })).sort((a, b) => b.value - a.value);
}

// Runs a validated spec for the signed-in caller and returns a report result.
async function runQuery(access, rawSpec, ctx) {
  const spec = normalizeQuery(rawSpec);
  const dataset = DATASETS[spec.dataset];
  const advisorFilter = access.role === "admin" ? spec.advisor_id : undefined; // admins may narrow; advisers are always themselves
  let rows = await dataset.load(ctx, access, advisorFilter ? { advisor_id: advisorFilter } : {});
  if (spec.client_ids?.length) {
    const allowed = new Set(spec.client_ids);
    rows = rows.filter((r) => allowed.has(r.client_id));
  }
  for (const filter of spec.filters) {
    const field = dataset.fields[filter.field];
    rows = rows.filter((r) => matches(r, filter, field));
  }
  const result = spec.mode === "records" ? recordsResult(spec, dataset, rows) : aggregateResult(spec, dataset, rows);
  // Asked about claim amounts before the amounts migration was applied: say so.
  const usesAmounts = [spec.metric.field, ...spec.filters.map((fl) => fl.field)].some((k) => k && dataset.fields[k]?.amounts);
  if (usesAmounts && ctx.amountsAvailable === false) result.notice = AMOUNTS_NOTICE;
  if (access.role !== "admin") delete spec.advisor_id;
  return { spec, result: { ...result, readAs: describeQuery(spec), title: spec.title || defaultTitle(spec) } };
}

module.exports = { normalizeQuery, runQuery, describeQuery, defaultTitle, matches, OPS_BY_TYPE, METRICS, humanise };
