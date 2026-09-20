// More report templates, covering the rest of the database: claims by type and provider,
// requests, open work, client mix, money, goals, compliance and reminders.
// Same contract as templates.js; every run() starts from scopedClients() so an adviser
// only ever sees their own clients. `insights(result)` adds specific sentences to the
// templated narrative used when the model is off.
const { fullName } = require("../utils/fullName");
const { cpdSummary } = require("../utils/complianceRules");
const { DOCUMENT_TYPES } = require("../constants/documentTypes");
const { CPD_REQUIRED_HOURS } = require("../constants/compliance");
const {
  scopedClients, forClients, providerNames, DAY_MS, dateKey,
  round1, avg, pct, plural, daysSince, humanise, taskTypeLabel, rangeBounds, inRange, countRows, increment,
  adviserLabel, scopedTasks, periodsFor,
} = require("./helpers");

const OPEN_STATUSES = ["open", "awaiting_client"];
const STATUS_SERIES = [
  { key: "open", label: "Open" },
  { key: "completed", label: "Completed" },
  { key: "declined", label: "Declined" },
  { key: "cancelled", label: "Cancelled" },
];
const AGE_BUCKETS = [
  ["0–2 days", 0, 2],
  ["3–7 days", 3, 7],
  ["8–30 days", 8, 30],
  ["Over 30 days", 31, Infinity],
];

const statusKey = (status) => (OPEN_STATUSES.includes(status) ? "open" : status);

// Rows of { label, open, completed, declined, cancelled, total, decline_rate } for a grouping.
function statusBreakdown(tasks, labelOf) {
  const groups = new Map();
  for (const task of tasks) {
    const label = labelOf(task);
    if (!groups.has(label)) groups.set(label, { label, open: 0, completed: 0, declined: 0, cancelled: 0, total: 0 });
    const row = groups.get(label);
    const key = statusKey(task.status);
    if (key in row) row[key] += 1;
    row.total += 1;
  }
  const rows = [...groups.values()].sort((a, b) => b.total - a.total);
  for (const row of rows) {
    const decided = row.completed + row.declined;
    row.decline_rate = decided ? pct(row.declined, decided) : 0;
  }
  return rows;
}

// Only the status series that actually occur, so the legend stays short.
function usedSeries(rows) {
  return STATUS_SERIES.filter((s) => rows.some((r) => r[s.key] > 0));
}

function shareInsight(rows, total, noun) {
  if (!rows.length || !total) return [];
  const [top, second] = rows;
  const lines = [`${top.label} is the largest at ${top.total ?? top.value} of ${total} ${noun} (${pct(top.total ?? top.value, total)}%).`];
  if (second) lines.push(`${second.label} follows with ${second.total ?? second.value}.`);
  return lines;
}

function declineInsight(rows) {
  const worst = rows.filter((r) => r.completed + r.declined >= 3).sort((a, b) => b.decline_rate - a.decline_rate)[0];
  return worst && worst.decline_rate > 0
    ? [`${worst.label} has the highest decline rate: ${worst.decline_rate}% of decided claims were declined. Check what's being rejected there.`]
    : [];
}

async function requestTypeLabels(ctx) {
  try {
    const { data } = await ctx.db.from("request_types").select("task_type, label");
    return new Map((data || []).map((r) => [r.task_type, r.label]));
  } catch {
    return new Map();
  }
}

function ageBucket(days) {
  return AGE_BUCKETS.find(([, lo, hi]) => days >= lo && days <= hi)[0];
}

const RAND = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 });

const EXTRA_TEMPLATES = [
  // ------------------------------------------------------------ claims & requests
  {
    id: "claims_by_type",
    category: "Claims & requests",
    featured: true,
    label: "Claims by type",
    description: "Claims per product line (motor, life, health, funeral, personal, commercial), split into open, completed, declined and cancelled.",
    suggestedQuestion: "Which types of claims do we get the most?",
    examples: [
      "List the most type of claims we got",
      "What kinds of claims do we have",
      "how many motor claims vs funeral claims",
      "claims per product line",
      "breakdown of claims by category",
      "which claim type is most common",
    ],
    keywords: ["type", "types", "kind", "kinds", "category", "categories", "product line", "motor", "funeral", "life", "health", "commercial", "personal", "most common", "breakdown"],
    params: ["date_range", "advisor_id", "provider_id"],
    defaults: { rangeDays: 365 },
    async run(access, params, ctx) {
      const clients = await scopedClients(ctx.db, access, params);
      const { from, to } = rangeBounds(params.date_range);
      let tasks = await scopedTasks(ctx, clients, (q) => q.eq("task_type", "claim").gte("created_at", from).lte("created_at", to));
      tasks = tasks.filter((t) => t.task_type === "claim" && t.status !== "draft" && inRange(t.created_at, params.date_range));
      if (params.provider_id) tasks = tasks.filter((t) => t.provider_id === params.provider_id);
      const rows = statusBreakdown(tasks, (t) => humanise(t.claim_category || "Uncategorised"));
      const top = rows[0];
      return {
        chartType: "bar",
        stacked: true,
        rows,
        series: usedSeries(rows),
        unit: "claims",
        headline: top
          ? `${top.label} is the biggest line: ${top.total} of ${tasks.length} claims (${pct(top.total, tasks.length)}%)`
          : "No claims in this period",
        llmRows: rows,
        insights: [...shareInsight(rows, tasks.length, "claims").slice(1), ...declineInsight(rows)],
      };
    },
  },
  {
    id: "requests_by_type",
    category: "Claims & requests",
    label: "Service requests by type",
    description: "Non-claim requests (address changes, bank details, new financial items and so on) by type and status.",
    suggestedQuestion: "What do clients ask us for most?",
    examples: ["what requests do clients send", "most common service requests", "how many address change requests", "requests by type", "what are clients asking for"],
    keywords: ["request", "requests", "service", "ask", "asking", "address", "bank details", "debit order", "admin"],
    params: ["date_range", "advisor_id"],
    defaults: { rangeDays: 365 },
    async run(access, params, ctx) {
      const clients = await scopedClients(ctx.db, access, params);
      const { from, to } = rangeBounds(params.date_range);
      const labels = await requestTypeLabels(ctx);
      const tasks = (await scopedTasks(ctx, clients, (q) => q.neq("task_type", "claim").gte("created_at", from).lte("created_at", to))).filter(
        (t) => t.task_type !== "claim" && t.status !== "draft" && inRange(t.created_at, params.date_range)
      );
      const rows = statusBreakdown(tasks, (t) => labels.get(t.task_type) || humanise(t.task_type));
      return {
        chartType: "bar",
        stacked: true,
        rows,
        series: usedSeries(rows),
        unit: "requests",
        headline: rows.length ? `${plural(tasks.length, "request")}; ${rows[0].label} is the most common` : "No requests in this period",
        llmRows: rows,
        insights: shareInsight(rows, tasks.length, "requests"),
      };
    },
  },
  {
    id: "claims_by_provider",
    category: "Claims & requests",
    featured: true,
    label: "Claims by provider",
    description: "How many claims went to each insurer or product provider, and how many each one declined.",
    suggestedQuestion: "Which providers handle most of our claims, and who declines the most?",
    examples: ["claims per insurer", "which insurer declines the most", "how many claims with each provider", "provider decline rate", "claims by insurer"],
    keywords: ["provider", "insurer", "decline rate", "per provider", "by provider", "who declines", "declines the most", "declines most", "handle most"],
    params: ["date_range", "advisor_id", "product_type"],
    defaults: { rangeDays: 365 },
    async run(access, params, ctx) {
      const clients = await scopedClients(ctx.db, access, params);
      const { from, to } = rangeBounds(params.date_range);
      let tasks = (await scopedTasks(ctx, clients, (q) => q.eq("task_type", "claim").gte("created_at", from).lte("created_at", to))).filter(
        (t) => t.task_type === "claim" && t.status !== "draft" && inRange(t.created_at, params.date_range)
      );
      if (params.product_type) tasks = tasks.filter((t) => t.claim_category === params.product_type);
      const names = await providerNames(ctx.db, tasks.map((t) => t.provider_id));
      const rows = statusBreakdown(tasks, (t) => names.get(t.provider_id) || "No provider yet");
      return {
        chartType: "bar",
        stacked: true,
        rows,
        series: usedSeries(rows),
        unit: "claims",
        headline: rows.length ? `${plural(tasks.length, "claim")} across ${plural(rows.length, "provider")}` : "No claims in this period",
        llmRows: rows,
        insights: [...shareInsight(rows, tasks.length, "claims"), ...declineInsight(rows)],
      };
    },
  },
  {
    id: "work_waiting",
    category: "Claims & requests",
    label: "Open work by age",
    description: "Open claims and requests, how long since they last moved, and whether they're waiting on the client or on us.",
    suggestedQuestion: "How much open work is waiting on clients versus on us?",
    examples: ["what's waiting on the client", "open tasks waiting on us", "how old is our open work", "backlog", "pending claims and requests", "what is still open"],
    keywords: ["waiting", "open work", "backlog", "pending", "waiting on client", "waiting on us", "outstanding", "queue", "age"],
    params: ["advisor_id"],
    async run(access, params, ctx) {
      const clients = await scopedClients(ctx.db, access, params);
      const tasks = (await scopedTasks(ctx, clients, (q) => q.in("status", OPEN_STATUSES))).filter((t) => OPEN_STATUSES.includes(t.status));
      const rows = AGE_BUCKETS.map(([label]) => ({ label, waiting_on_us: 0, waiting_on_client: 0 }));
      for (const task of tasks) {
        const row = rows.find((r) => r.label === ageBucket(daysSince(task.updated_at || task.created_at, ctx.now)));
        row[task.status === "awaiting_client" ? "waiting_on_client" : "waiting_on_us"] += 1;
      }
      const onUs = tasks.filter((t) => t.status === "open").length;
      const stale = rows.slice(2).reduce((s, r) => s + r.waiting_on_us + r.waiting_on_client, 0);
      return {
        chartType: "bar",
        stacked: true,
        rows,
        series: [
          { key: "waiting_on_us", label: "Waiting on us" },
          { key: "waiting_on_client", label: "Waiting on the client" },
        ],
        unit: "tasks",
        headline: `${plural(tasks.length, "open item")}: ${onUs} waiting on us, ${tasks.length - onUs} on clients`,
        llmRows: rows,
        insights: stale ? [`${plural(stale, "item")} haven't moved in over a week; follow those up first.`] : ["Nothing has been sitting for more than a week."],
      };
    },
  },
  {
    id: "stuck_tasks",
    category: "Claims & requests",
    featured: true,
    label: "Stuck claims and requests",
    description: "Open claims and requests that haven't moved for a while, oldest first, so you know who to chase.",
    suggestedQuestion: "Which claims and requests are stuck?",
    examples: ["which claims haven't moved", "stuck claims", "what should I chase", "claims with no update in a week", "neglected requests", "what needs follow up"],
    keywords: ["stuck", "stalled", "chase", "follow up", "no update", "not moved", "neglected", "idle", "old"],
    params: ["advisor_id", "older_than_days"],
    defaults: { olderThanDays: 7 },
    async run(access, params, ctx) {
      const clients = await scopedClients(ctx.db, access, params);
      const clientById = new Map(clients.map((c) => [c.id, c]));
      const labels = await requestTypeLabels(ctx);
      const tasks = (await scopedTasks(ctx, clients, (q) => q.in("status", OPEN_STATUSES))).filter((t) => OPEN_STATUSES.includes(t.status));
      const label = access.role === "admin" ? await adviserLabel(ctx, clients.map((c) => c.advisor_id)) : null;
      const rows = tasks
        .map((t) => ({ task: t, idle: daysSince(t.updated_at || t.created_at, ctx.now) }))
        .filter(({ idle }) => idle >= params.older_than_days)
        .sort((a, b) => b.idle - a.idle)
        .map(({ task, idle }) => ({
          taskId: task.id,
          clientId: task.client_id,
          reference: task.reference || "—",
          type: task.task_type === "claim" ? taskTypeLabel(task) : labels.get(task.task_type) || humanise(task.task_type),
          client: fullName(clientById.get(task.client_id)),
          ...(label ? { adviser: label(clientById.get(task.client_id)?.advisor_id) } : {}),
          waitingOn: task.status === "awaiting_client" ? "Client" : "Us",
          idleDays: idle,
        }));
      const byWho = new Map();
      for (const r of rows) increment(byWho, `Waiting on ${r.waitingOn === "Us" ? "us" : "the client"}`);
      const byType = new Map();
      for (const r of rows) increment(byType, r.type);
      const onUs = rows.filter((r) => r.waitingOn === "Us").length;
      return {
        chartType: "table",
        rows: rows.slice(0, 50), // oldest first; the headline carries the full count
        columns: [
          { key: "reference", label: "Reference", kind: "task" },
          { key: "type", label: "Type" },
          { key: "client", label: "Client", kind: "client" },
          ...(label ? [{ key: "adviser", label: "Adviser" }] : []),
          { key: "waitingOn", label: "Waiting on" },
          { key: "idleDays", label: "Idle", numeric: true, kind: "idle" },
        ],
        series: [],
        unit: "tasks",
        headline: rows.length
          ? `${plural(rows.length, "item")} idle for ${params.older_than_days}+ days; ${onUs} waiting on us`
          : `Nothing has been idle for ${params.older_than_days} days or more`,
        llmRows: [...countRows(byWho), ...countRows(byType), ...(rows[0] ? [{ label: "Longest idle (days)", value: rows[0].idleDays }] : [])],
        insights: onUs ? [`${plural(onUs, "item is", "items are")} waiting on us, so start there; the oldest has been idle ${rows.find((r) => r.waitingOn === "Us").idleDays} days.`] : [],
      };
    },
  },
  {
    id: "client_satisfaction",
    category: "Claims & requests",
    label: "Client satisfaction",
    description: "Average client rating (1–5) on closed claims and requests, by provider or by type.",
    suggestedQuestion: "How happy are clients with how their claims were handled?",
    examples: ["client ratings", "customer satisfaction by insurer", "average rating", "which provider gets the worst reviews", "are clients happy"],
    keywords: ["rating", "ratings", "satisfaction", "happy", "review", "reviews", "feedback", "stars", "nps"],
    params: ["date_range", "advisor_id", "group_by"],
    groupBy: ["provider", "task_type"],
    defaults: { rangeDays: 365 },
    async run(access, params, ctx) {
      const clients = await scopedClients(ctx.db, access, params);
      const tasks = (await scopedTasks(ctx, clients)).filter(
        (t) => Number(t.client_rating) >= 1 && inRange(t.closed_at || t.updated_at || t.created_at, params.date_range)
      );
      const groupBy = params.group_by || "provider";
      const names = groupBy === "provider" ? await providerNames(ctx.db, tasks.map((t) => t.provider_id)) : new Map();
      const groups = new Map();
      for (const t of tasks) {
        const key = groupBy === "provider" ? names.get(t.provider_id) || "No provider" : taskTypeLabel(t);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(Number(t.client_rating));
      }
      const rows = [...groups.entries()].map(([label, list]) => ({ label, value: round1(avg(list)), ratings: list.length })).sort((a, b) => a.value - b.value);
      const all = tasks.map((t) => Number(t.client_rating));
      const low = rows[0];
      return {
        chartType: "bar",
        rows,
        series: [{ key: "value", label: "Average rating" }],
        unit: "rating",
        headline: all.length ? `${round1(avg(all))} out of 5 on average from ${plural(all.length, "rating")}` : "No client ratings yet",
        llmRows: rows,
        insights: low && rows.length > 1 ? [`${low.label} has the lowest average (${low.value}/5 from ${plural(low.ratings, "rating")}).`] : [],
      };
    },
  },
  {
    id: "adviser_workload",
    category: "Claims & requests",
    label: "Workload",
    description: "Open claims and requests per adviser (admins) or per type (advisers), split by who they're waiting on.",
    suggestedQuestion: "Who has the most open work?",
    examples: ["busiest advisers", "workload per adviser", "how many open tasks does each adviser have", "who is overloaded", "my open work by type"],
    keywords: ["workload", "busiest", "busy adviser", "overloaded", "per adviser", "capacity", "most open"],
    params: ["advisor_id", "group_by"],
    groupBy: ["adviser", "task_type"],
    async run(access, params, ctx) {
      const clients = await scopedClients(ctx.db, access, params);
      const advisorOf = new Map(clients.map((c) => [c.id, c.advisor_id]));
      const tasks = (await scopedTasks(ctx, clients, (q) => q.in("status", OPEN_STATUSES))).filter((t) => OPEN_STATUSES.includes(t.status));
      const groupBy = params.group_by || (access.role === "admin" ? "adviser" : "task_type");
      const label = groupBy === "adviser" ? await adviserLabel(ctx, clients.map((c) => c.advisor_id)) : null;
      const groups = new Map();
      for (const t of tasks) {
        const key = label ? label(advisorOf.get(t.client_id)) : taskTypeLabel(t);
        if (!groups.has(key)) groups.set(key, { label: key, waiting_on_us: 0, waiting_on_client: 0, total: 0 });
        const row = groups.get(key);
        row[t.status === "awaiting_client" ? "waiting_on_client" : "waiting_on_us"] += 1;
        row.total += 1;
      }
      const rows = [...groups.values()].sort((a, b) => b.total - a.total);
      return {
        chartType: "bar",
        stacked: true,
        rows,
        series: [
          { key: "waiting_on_us", label: "Waiting on us" },
          { key: "waiting_on_client", label: "Waiting on the client" },
        ],
        unit: "tasks",
        headline: rows.length ? `${plural(tasks.length, "open item")}; ${rows[0].label} has the most (${rows[0].total})` : "No open work",
        llmRows: rows,
        insights: shareInsight(rows, tasks.length, "open items"),
      };
    },
  },

  // ------------------------------------------------------------ clients
  {
    id: "clients_by_status",
    category: "Clients",
    label: "Clients by status",
    description: "How many clients are onboarding, active or inactive.",
    suggestedQuestion: "How many clients do we have, and how many are still onboarding?",
    examples: ["how many clients do we have", "active clients", "client count", "how many clients are onboarding", "inactive clients"],
    keywords: ["how many clients do we have", "client count", "active", "inactive", "book size", "number of clients", "still onboarding"],
    params: ["advisor_id"],
    async run(access, params, ctx) {
      const clients = await scopedClients(ctx.db, access, params);
      const counts = new Map();
      for (const c of clients) increment(counts, humanise(c.status || "unknown"));
      const rows = countRows(counts, ["Onboarding", "Active", "Inactive"]);
      return {
        chartType: "donut",
        rows,
        series: [{ key: "value", label: "Clients" }],
        unit: "clients",
        headline: `${plural(clients.length, "client")} in the book`,
        llmRows: rows,
        insights: shareInsight(rows.slice().sort((a, b) => b.value - a.value), clients.length, "clients").slice(0, 1),
      };
    },
  },
  {
    id: "risk_profile_mix",
    category: "Clients",
    label: "Risk profile mix",
    description: "Clients by risk profile category (conservative to aggressive), including those not yet assessed.",
    suggestedQuestion: "What's the risk profile mix of our clients?",
    examples: ["risk appetite of clients", "how many conservative clients", "clients not risk assessed", "risk profiles", "aggressive investors"],
    keywords: ["risk", "risk profile", "conservative", "aggressive", "moderate", "balanced", "appetite", "assessed", "investor", "investors"],
    params: ["advisor_id"],
    async run(access, params, ctx) {
      const clients = await scopedClients(ctx.db, access, params);
      const extra = await forClients(ctx.db, "users", "id, risk_profile_category", clients.map((c) => c.id), (q) => q, "id");
      const risk = new Map(extra.map((r) => [r.id, r.risk_profile_category]));
      const counts = new Map();
      for (const c of clients) increment(counts, risk.get(c.id) ? humanise(risk.get(c.id)) : "Not assessed");
      const rows = countRows(counts).sort((a, b) => (a.label === "Not assessed") - (b.label === "Not assessed") || b.value - a.value);
      const missing = counts.get("Not assessed") || 0;
      return {
        chartType: "donut",
        rows,
        series: [{ key: "value", label: "Clients" }],
        unit: "clients",
        headline: missing ? `${missing} of ${clients.length} clients still need a risk assessment` : `Every client has a risk profile`,
        llmRows: rows,
        insights: missing ? [`Complete risk assessments for the ${missing} unassessed clients before giving advice.`] : [],
      };
    },
  },
  {
    id: "new_clients_trend",
    category: "Clients",
    label: "New clients over time",
    description: "How many clients joined each week or month.",
    suggestedQuestion: "How many new clients have we signed up this year?",
    examples: ["new clients per month", "client growth", "how many clients joined", "sign ups this year", "are we growing"],
    keywords: ["new clients", "joined", "sign up", "sign ups", "signups", "growth", "growing", "acquired", "per month"],
    params: ["date_range", "advisor_id"],
    defaults: { rangeDays: 365 },
    async run(access, params, ctx) {
      const clients = (await scopedClients(ctx.db, access, params)).filter((c) => inRange(c.created_at, params.date_range));
      const periods = periodsFor(params.date_range);
      const rows = periods.keys.map((label) => ({ label, value: 0 }));
      for (const c of clients) {
        const row = rows.find((r) => r.label === periods.keyOf(c.created_at));
        if (row) row.value += 1;
      }
      const best = rows.reduce((b, r) => (r.value > (b?.value ?? -1) ? r : b), null);
      return {
        chartType: "line",
        rows,
        series: [{ key: "value", label: "New clients" }],
        unit: "clients",
        period: periods.weekly ? "week" : "month",
        headline: `${plural(clients.length, "new client")} in this period`,
        llmRows: rows.map((r) => ({ period: r.label, new_clients: r.value })),
        insights: best?.value ? [`The best ${periods.weekly ? "week" : "month"} was ${best.label} with ${best.value}.`] : [],
      };
    },
  },

  // ------------------------------------------------------------ money & goals
  {
    id: "financial_breakdown",
    category: "Money & goals",
    label: "Assets and liabilities by type",
    description: "Total assets and liabilities under advice, by item type (property, investments, loans and so on).",
    suggestedQuestion: "What makes up our clients' assets and debts?",
    examples: ["total assets under advice", "how much debt do clients have", "assets by type", "liabilities breakdown", "money under advice", "aum"],
    keywords: ["asset", "assets", "liability", "liabilities", "debt", "owe", "loans", "investments", "property", "aum", "under advice", "money"],
    params: ["advisor_id"],
    async run(access, params, ctx) {
      const clients = await scopedClients(ctx.db, access, params);
      const items = await forClients(ctx.db, "client_financial_items", "id, client_id, category, item_type, amount", clients.map((c) => c.id));
      const groups = new Map();
      let assets = 0;
      let liabilities = 0;
      for (const item of items) {
        const amount = Number(item.amount) || 0;
        const key = item.category === "asset" ? "assets" : item.category === "liability" ? "liabilities" : null;
        if (!key) continue;
        const label = humanise(item.item_type);
        if (!groups.has(label)) groups.set(label, { label, assets: 0, liabilities: 0 });
        groups.get(label)[key] += amount;
        if (key === "assets") assets += amount;
        else liabilities += amount;
      }
      const rows = [...groups.values()].sort((a, b) => b.assets + b.liabilities - (a.assets + a.liabilities)).slice(0, 12);
      const ratio = assets ? pct(liabilities, assets) : 0;
      return {
        chartType: "bar",
        stacked: true, // an item type is either an asset or a liability, so one bar per row
        rows,
        series: [
          { key: "assets", label: "Assets" },
          { key: "liabilities", label: "Liabilities" },
        ],
        unit: "rand",
        headline: `${RAND.format(assets)} in assets and ${RAND.format(liabilities)} in liabilities`,
        llmRows: rows.concat([{ label: "Total assets", value: assets }, { label: "Total liabilities", value: liabilities }, { label: "Debt to assets (%)", value: ratio }]),
        insights: assets ? [`Liabilities are ${ratio}% of assets; net worth under advice is ${RAND.format(assets - liabilities)}.`] : [],
      };
    },
  },
  {
    id: "goals_by_type",
    category: "Money & goals",
    label: "Goal funding by type",
    description: "For each goal type, how much of the target amount clients have saved so far.",
    suggestedQuestion: "How well funded are our clients' retirement and education goals?",
    examples: ["how much have clients saved towards goals", "goal funding", "retirement savings progress", "education goals funded", "total goal targets"],
    keywords: ["funded", "funding", "saved", "savings", "target amount", "retirement", "education", "goal type", "shortfall"],
    params: ["advisor_id"],
    async run(access, params, ctx) {
      const clients = await scopedClients(ctx.db, access, params);
      const goals = (
        await forClients(ctx.db, "client_goals", "id, client_id, goal_type, target_amount, current_progress, status", clients.map((c) => c.id), (q) =>
          q.eq("status", "in_progress")
        )
      ).filter((g) => g.status === "in_progress" && Number(g.target_amount) > 0);
      const groups = new Map();
      for (const g of goals) {
        const label = humanise(g.goal_type || "Unspecified");
        if (!groups.has(label)) groups.set(label, { label, target: 0, saved: 0, goals: 0 });
        const row = groups.get(label);
        row.target += Number(g.target_amount);
        row.saved += Math.min(Number(g.current_progress) || 0, Number(g.target_amount));
        row.goals += 1;
      }
      const rows = [...groups.values()].map((r) => ({ ...r, value: pct(r.saved, r.target), shortfall: r.target - r.saved })).sort((a, b) => a.value - b.value);
      const target = rows.reduce((s, r) => s + r.target, 0);
      const saved = rows.reduce((s, r) => s + r.saved, 0);
      return {
        chartType: "bar",
        rows,
        series: [{ key: "value", label: "Funded" }],
        unit: "%",
        headline: target ? `${pct(saved, target)}% funded overall: ${RAND.format(saved)} of ${RAND.format(target)}` : "No goals with a target amount",
        llmRows: rows,
        insights: rows[0] ? [`${rows[0].label} goals are the least funded at ${rows[0].value}% (shortfall ${RAND.format(rows[0].shortfall)}).`] : [],
      };
    },
  },

  // ------------------------------------------------------------ compliance
  {
    id: "documents_awaiting_signature",
    category: "Compliance",
    label: "Documents awaiting signature",
    description: "Documents sent to clients but not yet signed, by document type, with the longest wait.",
    suggestedQuestion: "Which documents are clients still to sign?",
    examples: ["unsigned documents", "documents sent but not signed", "who hasn't signed", "pending signatures", "outstanding signatures"],
    keywords: ["signature", "unsigned", "not signed", "haven't signed", "yet to sign", "still to sign", "need to sign", "to sign", "awaiting signature", "sent"],
    params: ["advisor_id"],
    async run(access, params, ctx) {
      const clients = await scopedClients(ctx.db, access, params);
      const docs = (await forClients(ctx.db, "documents", "id, client_id, document_type, status, sent_at", clients.map((c) => c.id), (q) => q.eq("status", "sent"))).filter(
        (d) => d.status === "sent"
      );
      const labelOf = new Map(DOCUMENT_TYPES.map((d) => [d.type, d.label]));
      const groups = new Map();
      for (const d of docs) {
        const label = labelOf.get(d.document_type) || humanise(d.document_type);
        if (!groups.has(label)) groups.set(label, { label, value: 0, oldest_days: 0 });
        const row = groups.get(label);
        row.value += 1;
        if (d.sent_at) row.oldest_days = Math.max(row.oldest_days, daysSince(d.sent_at, ctx.now));
      }
      const rows = [...groups.values()].sort((a, b) => b.value - a.value);
      const oldest = rows.reduce((m, r) => Math.max(m, r.oldest_days), 0);
      return {
        chartType: "bar",
        rows,
        series: [{ key: "value", label: "Awaiting signature" }],
        unit: "documents",
        headline: docs.length
          ? `${plural(docs.length, "document")} waiting on clients${oldest ? `, the oldest for ${plural(oldest, "day")}` : ""}`
          : "Nothing waiting for a signature",
        llmRows: rows,
        insights: oldest > 7 ? ["Send a reminder for anything waiting more than a week."] : [],
      };
    },
  },
  {
    id: "screening_results",
    category: "Compliance",
    label: "PEP and sanctions screening",
    description: "Latest PEP and terrorism-financing screening result per client: clear, flagged or not screened.",
    suggestedQuestion: "Have all our clients been screened, and are any flagged?",
    examples: ["pep screening results", "flagged clients", "clients not screened", "sanctions checks", "terrorism financing checks", "fica screening"],
    keywords: ["pep", "screening", "screened", "flagged", "sanctions", "terrorism", "fica", "aml", "kyc", "politically exposed"],
    params: ["advisor_id"],
    async run(access, params, ctx) {
      const clients = await scopedClients(ctx.db, access, params);
      const checks = await forClients(ctx.db, "client_screenings", "id, client_id, screening_type, result, created_at", clients.map((c) => c.id));
      const latest = new Map();
      for (const c of checks) {
        const key = `${c.client_id}:${c.screening_type}`;
        if (!latest.has(key) || Date.parse(c.created_at) > Date.parse(latest.get(key).created_at)) latest.set(key, c);
      }
      const rows = [
        ["pep", "PEP"],
        ["terrorism_financing", "Terrorism financing"],
      ].map(([type, label]) => {
        const row = { label, clear: 0, flagged: 0, not_screened: 0 };
        for (const client of clients) {
          const hit = latest.get(`${client.id}:${type}`);
          row[hit ? (hit.result === "flagged" ? "flagged" : "clear") : "not_screened"] += 1;
        }
        return row;
      });
      const flagged = rows.reduce((s, r) => s + r.flagged, 0);
      const missing = rows.reduce((s, r) => s + r.not_screened, 0);
      return {
        chartType: "bar",
        stacked: true,
        rows,
        series: [
          { key: "clear", label: "Clear" },
          { key: "flagged", label: "Flagged" },
          { key: "not_screened", label: "Not screened" },
        ],
        unit: "clients",
        headline: `${plural(flagged, "flagged result")}, ${plural(missing, "check")} still to run`,
        llmRows: rows,
        insights: [
          ...(flagged ? [`Review the ${plural(flagged, "flagged result")} before doing further business.`] : []),
          ...(missing ? [`Run the ${plural(missing, "outstanding check")} from each client's compliance card.`] : []),
        ],
      };
    },
  },
  {
    id: "cpd_progress",
    category: "Compliance",
    label: "CPD hours",
    description: `Continuing professional development hours logged this cycle against the ${CPD_REQUIRED_HOURS} required, per adviser.`,
    suggestedQuestion: "Are advisers on track with their CPD hours?",
    examples: ["cpd hours", "how many cpd hours do I have", "continuing professional development", "who is behind on cpd", "training hours"],
    keywords: ["cpd", "continuing professional development", "training", "hours", "fais", "fit and proper", "learning"],
    params: ["advisor_id"],
    async run(access, params, ctx) {
      let adviserIds;
      if (access.role === "advisor") adviserIds = [access.userId];
      else if (params.advisor_id) adviserIds = [params.advisor_id];
      else adviserIds = [...new Set((await scopedClients(ctx.db, access, params)).map((c) => c.advisor_id).filter(Boolean))];
      const records = await forClients(ctx.db, "adviser_cpd_records", "id, adviser_id, hours, completed_on", adviserIds, (q) => q, "adviser_id");
      if (access.role === "admin" && !params.advisor_id) {
        for (const r of records) if (!adviserIds.includes(r.adviser_id)) adviserIds.push(r.adviser_id);
      }
      const names = await ctx.adviserNames(adviserIds);
      let cycleEnd = "";
      const rows = adviserIds
        .map((id) => {
          const summary = cpdSummary(records.filter((r) => r.adviser_id === id), ctx.now);
          cycleEnd = summary.end;
          return { label: names.get(id) || "Adviser", value: summary.hours, remaining: summary.remainingHours };
        })
        .sort((a, b) => a.value - b.value);
      const done = rows.filter((r) => r.remaining === 0).length;
      return {
        chartType: "bar",
        rows,
        series: [{ key: "value", label: "CPD hours this cycle" }],
        unit: "hours",
        headline: `${done} of ${plural(rows.length, "adviser")} ${done === 1 ? "has" : "have"} logged all ${CPD_REQUIRED_HOURS} hours${cycleEnd ? ` (cycle ends ${cycleEnd})` : ""}`,
        llmRows: rows.map((r) => ({ label: r.label, hours: r.value, remaining: r.remaining })),
        insights: rows[0]?.remaining ? [`${rows[0].label} needs ${rows[0].remaining} more hours before the cycle ends.`] : [],
      };
    },
  },

  // ------------------------------------------------------------ reminders
  {
    id: "upcoming_reminders",
    category: "Reminders",
    label: "Upcoming reminders",
    description: "Reminders due in the next N days (reviews, birthdays, renewals), by type.",
    suggestedQuestion: "What reminders are coming up in the next 30 days?",
    examples: ["upcoming reviews", "birthdays this month", "what's due next week", "reminders coming up", "annual reviews due"],
    keywords: ["upcoming", "coming up", "due", "next week", "birthday", "birthdays", "annual review", "renewal", "schedule"],
    params: ["days_ahead", "advisor_id", "group_by"],
    groupBy: ["reminder_type", "adviser"],
    defaults: { daysAhead: 30 },
    async run(access, params, ctx) {
      const clients = await scopedClients(ctx.db, access, params);
      const today = dateKey(ctx.now);
      const until = dateKey(new Date(ctx.now.getTime() + params.days_ahead * DAY_MS));
      const reminders = (
        await forClients(ctx.db, "reminders", "id, client_id, reminder_type, rule_id, trigger_date, status", clients.map((c) => c.id), (q) =>
          q.gte("trigger_date", today).lte("trigger_date", until).in("status", ["pending", "active"])
        )
      ).filter((r) => r.trigger_date >= today && r.trigger_date <= until && ["pending", "active"].includes(r.status));
      const groupBy = params.group_by || "reminder_type";
      const advisorOf = new Map(clients.map((c) => [c.id, c.advisor_id]));
      const label = groupBy === "adviser" ? await adviserLabel(ctx, clients.map((c) => c.advisor_id)) : null;
      const counts = new Map();
      for (const r of reminders) increment(counts, label ? label(advisorOf.get(r.client_id)) : humanise(r.reminder_type || r.rule_id));
      const rows = countRows(counts).sort((a, b) => b.value - a.value);
      const thisWeek = reminders.filter((r) => r.trigger_date <= dateKey(new Date(ctx.now.getTime() + 7 * DAY_MS))).length;
      return {
        chartType: "bar",
        rows,
        series: [{ key: "value", label: "Reminders due" }],
        unit: "reminders",
        headline: `${plural(reminders.length, "reminder")} due in the next ${params.days_ahead} days, ${thisWeek} this week`,
        llmRows: rows.concat([{ label: "Due within 7 days", value: thisWeek }]),
        insights: shareInsight(rows, reminders.length, "reminders").slice(0, 1),
      };
    },
  },
];

module.exports = { EXTRA_TEMPLATES, statusBreakdown };
