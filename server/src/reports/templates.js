// The fixed set of reports the Reports page can show. Each template:
//   id, label, description, suggestedQuestion, keywords (keyword fallback),
//   params (accepted parameter keys), defaults, groupBy (options, if any),
//   run(access, params, ctx) -> { chartType, rows, series, unit, headline, columns?, llmRows }
// `ctx` carries { db, now, adviserNames(ids) -> Map }. Every run() starts from
// scopedClients(), so an adviser only ever sees their own clients' data.
//
// Privacy: `rows` go to the browser (and may name clients, e.g. the consent pipeline);
// `llmRows` are what the narrative model sees: counts, averages and category labels only.
const { DOCUMENT_TYPES } = require("../constants/documentTypes");
const { consentState } = require("../utils/complianceRules");
const { fullName } = require("../utils/fullName");
const {
  scopedClients, forClients, providerNames, DAY_MS, dateKey,
  OPEN_REMINDER_STATUSES, CLAIM_STATUS_LABELS, AUTOMATIC_PROVIDER_REPLIES, DONE_DOCUMENT_STATUSES,
  round1, avg, humanise, taskTypeLabel, rangeBounds, inRange, countRows, increment,
  adviserLabel, scopedTasks, periodsFor, declineReason, NET_WORTH_BUCKETS,
} = require("./helpers");
const { EXTRA_TEMPLATES } = require("./templates.extra");
const { MONEY_TEMPLATES } = require("./templates.money");

// ---------------------------------------------------------------- templates
const TEMPLATES = [
  {
    id: "claims_by_status",
    category: "Claims & requests",
    featured: true,
    examples: ["how many claims are open", "claims by status", "status of our claims", "how many claims were completed", "open vs closed claims"],
    label: "Claims by status",
    description: "How many claims are open, waiting on the client, completed, declined or cancelled in a period.",
    suggestedQuestion: "How many claims do we have in each status over the last 90 days?",
    keywords: ["claim", "claims", "status", "open", "pending", "how many claims", "outstanding"],
    params: ["date_range", "advisor_id", "product_type"],
    defaults: { rangeDays: 90 },
    async run(access, params, ctx) {
      const clients = await scopedClients(ctx.db, access, params);
      const { from, to } = rangeBounds(params.date_range);
      let tasks = await scopedTasks(ctx, clients, (q) => q.eq("task_type", "claim").gte("created_at", from).lte("created_at", to));
      tasks = tasks.filter((t) => t.status !== "draft" && inRange(t.created_at, params.date_range));
      if (params.product_type) tasks = tasks.filter((t) => t.claim_category === params.product_type);
      const counts = new Map();
      for (const task of tasks) increment(counts, CLAIM_STATUS_LABELS[task.status] || humanise(task.status));
      const rows = countRows(counts, Object.values(CLAIM_STATUS_LABELS));
      return {
        chartType: "bar",
        rows,
        series: [{ key: "value", label: "Claims" }],
        unit: "claims",
        headline: `${tasks.length} claim${tasks.length === 1 ? "" : "s"} logged in this period`,
        llmRows: rows,
      };
    },
  },
  {
    id: "avg_time_to_close",
    category: "Claims & requests",
    featured: true,
    examples: ["how long do claims take", "average turnaround time", "how long to settle a claim", "time to close requests", "slowest provider to pay out"],
    label: "Average time to close",
    description: "Average days from submission to completion for claims and requests, by provider or by type.",
    suggestedQuestion: "Which providers take the longest to close claims?",
    keywords: ["time to close", "to close", "how long", "average", "turnaround", "longest", "close", "closed", "resolution", "take"],
    params: ["date_range", "task_type", "group_by", "advisor_id"],
    groupBy: ["provider", "task_type"],
    defaults: { rangeDays: 180 },
    async run(access, params, ctx) {
      const clients = await scopedClients(ctx.db, access, params);
      const { from, to } = rangeBounds(params.date_range);
      let tasks = await scopedTasks(ctx, clients, (q) => q.eq("status", "completed").gte("closed_at", from).lte("closed_at", to));
      tasks = tasks.filter((t) => t.status === "completed" && t.submitted_at && t.closed_at && inRange(t.closed_at, params.date_range));
      if (params.task_type) tasks = tasks.filter((t) => t.task_type === params.task_type);
      const groupBy = params.group_by || "provider";
      const names = groupBy === "provider" ? await providerNames(ctx.db, tasks.map((t) => t.provider_id)) : new Map();
      const groups = new Map();
      for (const task of tasks) {
        const days = (Date.parse(task.closed_at) - Date.parse(task.submitted_at)) / DAY_MS;
        if (!(days >= 0)) continue;
        const key = groupBy === "provider" ? names.get(task.provider_id) || "No provider" : taskTypeLabel(task);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(days);
      }
      const rows = [...groups.entries()]
        .map(([label, list]) => ({ label, value: round1(avg(list)), count: list.length }))
        .sort((a, b) => b.value - a.value);
      const all = [...groups.values()].flat();
      return {
        chartType: "bar",
        rows,
        series: [{ key: "value", label: "Average days" }],
        unit: "days",
        headline: all.length ? `${all.length} closed, ${round1(avg(all))} days on average` : "Nothing closed in this period",
        llmRows: rows,
      };
    },
  },
  {
    id: "overdue_reminders",
    category: "Reminders",
    featured: true,
    examples: ["overdue reminders", "missed follow ups", "reminders past due", "what did I forget", "late reviews"],
    label: "Overdue reminders",
    description: "Reminders whose date has passed but which haven't been completed, by adviser or by reminder type.",
    suggestedQuestion: "Which reminders are overdue?",
    keywords: ["reminder", "reminders", "overdue", "late", "missed", "past due", "follow up"],
    params: ["advisor_id", "group_by"],
    groupBy: ["adviser", "reminder_type"],
    async run(access, params, ctx) {
      const clients = await scopedClients(ctx.db, access, params);
      const today = dateKey(ctx.now);
      const reminders = (
        await forClients(ctx.db, "reminders", "id, client_id, reminder_type, rule_id, trigger_date, status", clients.map((c) => c.id), (q) =>
          q.lt("trigger_date", today).in("status", OPEN_REMINDER_STATUSES)
        )
      ).filter((r) => r.trigger_date < today && OPEN_REMINDER_STATUSES.includes(r.status));
      const groupBy = params.group_by || (access.role === "admin" ? "adviser" : "reminder_type");
      const advisorOf = new Map(clients.map((c) => [c.id, c.advisor_id]));
      const label = groupBy === "adviser" ? await adviserLabel(ctx, clients.map((c) => c.advisor_id)) : null;
      const counts = new Map();
      for (const r of reminders) {
        increment(counts, groupBy === "adviser" ? label(advisorOf.get(r.client_id)) : humanise(r.reminder_type || r.rule_id));
      }
      const rows = countRows(counts).sort((a, b) => b.value - a.value);
      const oldest = reminders.reduce((min, r) => (r.trigger_date < min ? r.trigger_date : min), today);
      const oldestDays = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${oldest}T00:00:00Z`)) / DAY_MS);
      return {
        chartType: "bar",
        rows,
        series: [{ key: "value", label: "Overdue reminders" }],
        unit: "reminders",
        headline: reminders.length ? `${reminders.length} overdue, the oldest by ${oldestDays} days` : "No overdue reminders",
        llmRows: rows.concat(reminders.length ? [{ label: "Oldest overdue (days)", value: oldestDays }] : []),
      };
    },
  },
  {
    id: "goal_progress",
    category: "Money & goals",
    featured: true,
    examples: ["are goals on track", "which goals are behind", "clients falling behind on savings goals", "goal progress", "behind schedule goals"],
    label: "Goal progress",
    description: "Client goals on track or behind: saved-so-far versus target, compared with how much time has passed.",
    suggestedQuestion: "Are our clients' goals on track?",
    keywords: ["goal", "goals", "on track", "behind", "target", "saving", "savings", "progress", "retirement", "education"],
    params: ["advisor_id", "goal_type", "group_by"],
    groupBy: ["adviser", "goal_type"],
    async run(access, params, ctx) {
      const clients = await scopedClients(ctx.db, access, params);
      const clientById = new Map(clients.map((c) => [c.id, c]));
      let goals = await forClients(
        ctx.db,
        "client_goals",
        "id, client_id, goal_type, target_amount, target_date, current_progress, status",
        clients.map((c) => c.id),
        (q) => q.eq("status", "in_progress")
      );
      goals = goals.filter((g) => g.status === "in_progress");
      if (params.goal_type) goals = goals.filter((g) => (g.goal_type || "").toLowerCase() === params.goal_type);
      const groupBy = params.group_by || (access.role === "admin" ? "adviser" : "goal_type");
      const label = groupBy === "adviser" ? await adviserLabel(ctx, clients.map((c) => c.advisor_id)) : null;
      const now = ctx.now.getTime();
      const groups = new Map();
      let unmeasured = 0;
      for (const goal of goals) {
        const target = Number(goal.target_amount);
        if (!(target > 0) || !goal.target_date) {
          unmeasured += 1;
          continue;
        }
        // client_goals has no created_at, so the client's own start date stands in for when the goal began.
        const start = Date.parse(clientById.get(goal.client_id)?.created_at) || now;
        const end = Date.parse(`${goal.target_date}T23:59:59+02:00`);
        const elapsed = end <= start ? 1 : Math.min(1, Math.max(0, (now - start) / (end - start)));
        const funded = Math.min(1, (Number(goal.current_progress) || 0) / target);
        const onTrack = funded >= 1 || (end > now && funded >= elapsed);
        const key = groupBy === "adviser" ? label(clientById.get(goal.client_id)?.advisor_id) : humanise(goal.goal_type || "Unspecified");
        if (!groups.has(key)) groups.set(key, { label: key, on_track: 0, behind: 0 });
        groups.get(key)[onTrack ? "on_track" : "behind"] += 1;
      }
      const rows = [...groups.values()].sort((a, b) => b.behind - a.behind || b.on_track - a.on_track);
      const behind = rows.reduce((s, r) => s + r.behind, 0);
      const measured = rows.reduce((s, r) => s + r.on_track + r.behind, 0);
      return {
        chartType: "bar",
        stacked: true,
        rows,
        series: [
          { key: "on_track", label: "On track" },
          { key: "behind", label: "Behind" },
        ],
        unit: "goals",
        headline: measured
          ? `${behind} of ${measured} goals behind schedule${unmeasured ? ` (${unmeasured} without a target amount or date)` : ""}`
          : "No goals with a target amount and date",
        llmRows: rows.concat(unmeasured ? [{ label: "Goals without a target amount or date", value: unmeasured }] : []),
      };
    },
  },
  {
    id: "declined_claims_by_reason",
    category: "Claims & requests",
    examples: ["why are claims declined", "reasons for rejected claims", "decline reasons", "why do insurers reject claims", "what causes declines"],
    label: "Declined claims by reason",
    description: "Why claims were declined, grouped into missing documents, policy exclusion, lapsed policy or other.",
    suggestedQuestion: "Why are claims being declined?",
    keywords: ["declined", "rejected", "reason", "reasons", "why", "repudiated", "turned down", "being declined"],
    params: ["date_range", "advisor_id"],
    defaults: { rangeDays: 365 },
    async run(access, params, ctx) {
      const clients = await scopedClients(ctx.db, access, params);
      // A declined claim counts in the period it was closed (older rows without closed_at use created_at).
      const tasks = (await scopedTasks(ctx, clients, (q) => q.eq("task_type", "claim").eq("status", "declined"))).filter(
        (t) => t.status === "declined" && inRange(t.closed_at || t.created_at, params.date_range)
      );
      const ids = tasks.map((t) => t.id);
      const [events, updates] = await Promise.all([
        forClients(ctx.db, "provider_events", "id, task_id, event_type, payload, created_at", ids, (q) => q.eq("event_type", "declined"), "task_id"),
        forClients(ctx.db, "task_updates", "id, task_id, note, update_kind, created_at", ids, (q) => q.eq("update_kind", "stage_change"), "task_id"),
      ]);
      const latest = (list, taskId) =>
        list.filter((r) => r.task_id === taskId).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
      const counts = new Map();
      for (const task of tasks) {
        const note = latest(events, task.id)?.payload?.note || latest(updates.filter((u) => u.note), task.id)?.note;
        increment(counts, declineReason(note));
      }
      const rows = countRows(counts, ["Missing documents", "Policy exclusion", "Policy lapsed", "Other"]);
      return {
        chartType: "donut",
        rows,
        series: [{ key: "value", label: "Declined claims" }],
        unit: "claims",
        headline: `${tasks.length} declined claim${tasks.length === 1 ? "" : "s"} in this period`,
        llmRows: rows,
      };
    },
  },
  {
    id: "task_volume_trend",
    category: "Claims & requests",
    examples: ["claims per month", "how busy have we been", "volume over time", "trend of requests", "are claims going up"],
    label: "Claims and requests over time",
    description: "How many claims and requests were logged each week or month, by type.",
    suggestedQuestion: "How has our claims and request volume changed this year?",
    keywords: ["trend", "volume", "over time", "weekly", "monthly", "busy", "busier", "busiest", "changed", "going up", "going down"],
    params: ["date_range", "advisor_id"],
    defaults: { rangeDays: 180 },
    async run(access, params, ctx) {
      const clients = await scopedClients(ctx.db, access, params);
      const { from, to } = rangeBounds(params.date_range);
      const tasks = (await scopedTasks(ctx, clients, (q) => q.gte("created_at", from).lte("created_at", to))).filter(
        (t) => t.status !== "draft" && inRange(t.created_at, params.date_range)
      );
      const periods = periodsFor(params.date_range);
      const totals = new Map();
      for (const task of tasks) increment(totals, taskTypeLabel(task));
      const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
      const shown = ranked.slice(0, ranked.length > 5 ? 4 : 5);
      const series = shown.map((label, i) => ({ key: `s${i}`, label }));
      if (ranked.length > shown.length) series.push({ key: "other", label: "Other" });
      const keyFor = (label) => series.find((s) => s.label === label)?.key || "other";
      const rows = periods.keys.map((label) => Object.fromEntries([["label", label], ...series.map((s) => [s.key, 0])]));
      for (const task of tasks) {
        const row = rows.find((r) => r.label === periods.keyOf(task.created_at));
        if (row) row[keyFor(taskTypeLabel(task))] += 1;
      }
      return {
        chartType: "line",
        rows,
        series,
        unit: "tasks",
        period: periods.weekly ? "week" : "month",
        headline: `${tasks.length} claims and requests, ${periods.weekly ? "per week" : "per month"}`,
        llmRows: rows.map((r) => Object.fromEntries([["period", r.label], ...series.map((s) => [s.label, r[s.key]])])),
      };
    },
  },
  {
    id: "document_completion",
    category: "Compliance",
    featured: true,
    examples: ["onboarding documents outstanding", "which clients have missing documents", "document completion", "fica documents complete", "paperwork missing"],
    label: "Onboarding document completion",
    description: "How many clients have all five required onboarding documents signed, and which documents are missing most.",
    suggestedQuestion: "How many clients still have onboarding documents outstanding?",
    keywords: ["document", "documents", "onboarding", "signed", "unsigned", "paperwork", "fica", "missing", "outstanding documents", "compliance"],
    params: ["advisor_id"],
    async run(access, params, ctx) {
      const clients = await scopedClients(ctx.db, access, params);
      const docs = await forClients(ctx.db, "documents", "id, client_id, document_type, status", clients.map((c) => c.id));
      const done = new Map();
      for (const doc of docs) {
        if (DONE_DOCUMENT_STATUSES.includes(doc.status)) {
          if (!done.has(doc.client_id)) done.set(doc.client_id, new Set());
          done.get(doc.client_id).add(doc.document_type);
        }
      }
      const rows = DOCUMENT_TYPES.map(({ type, label }) => {
        const signed = clients.filter((c) => done.get(c.id)?.has(type)).length;
        return { label, signed, missing: clients.length - signed };
      });
      const complete = clients.filter((c) => DOCUMENT_TYPES.every(({ type }) => done.get(c.id)?.has(type))).length;
      const percent = clients.length ? Math.round((complete / clients.length) * 100) : 0;
      return {
        chartType: "bar",
        stacked: true,
        rows,
        series: [
          { key: "signed", label: "Signed" },
          { key: "missing", label: "Missing" },
        ],
        unit: "clients",
        headline: `${complete} of ${clients.length} clients (${percent}%) have every document signed`,
        llmRows: rows.concat([{ label: "Clients with all documents signed", value: complete, of: clients.length, percent }]),
      };
    },
  },
  {
    id: "net_worth_distribution",
    category: "Money & goals",
    examples: ["net worth of clients", "how wealthy are my clients", "wealth distribution", "richest clients", "net worth bands"],
    label: "Net worth distribution",
    description: "Clients grouped by net worth (assets minus liabilities from their financial needs analysis).",
    suggestedQuestion: "What does the net worth spread of our clients look like?",
    keywords: ["net worth", "wealth", "wealthy", "assets", "liabilities", "rich", "distribution", "spread", "portfolio", "fna"],
    params: ["advisor_id"],
    async run(access, params, ctx) {
      const clients = await scopedClients(ctx.db, access, params);
      const items = await forClients(ctx.db, "client_financial_items", "id, client_id, category, amount", clients.map((c) => c.id));
      const worth = new Map();
      for (const item of items) {
        const sign = item.category === "asset" ? 1 : item.category === "liability" ? -1 : 0;
        if (sign) worth.set(item.client_id, (worth.get(item.client_id) || 0) + sign * (Number(item.amount) || 0));
      }
      const counts = new Map(NET_WORTH_BUCKETS.map(([label]) => [label, 0]));
      for (const client of clients) {
        if (!worth.has(client.id)) continue;
        const value = worth.get(client.id);
        const bucket = NET_WORTH_BUCKETS.find(([, lo, hi]) => value >= lo && value < hi) || NET_WORTH_BUCKETS[0];
        increment(counts, bucket[0]);
      }
      const noFna = clients.length - worth.size;
      counts.set("No FNA yet", noFna);
      const rows = countRows(counts);
      return {
        chartType: "bar",
        rows,
        series: [{ key: "value", label: "Clients" }],
        unit: "clients",
        headline: `${worth.size} of ${clients.length} clients have a financial needs analysis`,
        llmRows: rows,
      };
    },
  },
  {
    id: "provider_responsiveness",
    category: "Claims & requests",
    examples: ["which insurer responds slowest", "provider response time", "how long do insurers take to reply", "who is slow to get back to us", "provider sla"],
    label: "Provider responsiveness",
    description: "Average hours between Royal Square sending something to a provider and the provider's next reply on that claim or request.",
    suggestedQuestion: "Which providers are slowest to respond to us?",
    keywords: ["provider", "insurer", "respond", "response", "responsive", "reply", "slow", "slowest", "get back", "waiting on provider", "sla"],
    params: ["date_range", "advisor_id"],
    defaults: { rangeDays: 90 },
    async run(access, params, ctx) {
      const clients = await scopedClients(ctx.db, access, params);
      const tasks = await scopedTasks(ctx, clients);
      const taskProvider = new Map(tasks.map((t) => [t.id, t.provider_id]));
      const { from, to } = rangeBounds(params.date_range);
      const events = (
        await forClients(ctx.db, "provider_events", "id, task_id, provider_id, direction, event_type, created_at", tasks.map((t) => t.id), (q) =>
          q.gte("created_at", from).lte("created_at", to), "task_id")
      ).filter((e) => inRange(e.created_at, params.date_range));
      const byTask = new Map();
      for (const e of events) {
        if (!byTask.has(e.task_id)) byTask.set(e.task_id, []);
        byTask.get(e.task_id).push(e);
      }
      const groups = new Map(); // provider id -> { hours: [], waiting: 0 }
      const group = (id) => {
        if (!groups.has(id)) groups.set(id, { hours: [], waiting: 0 });
        return groups.get(id);
      };
      for (const [taskId, list] of byTask) {
        list.sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
        let waitingSince = null;
        let providerId = taskProvider.get(taskId);
        for (const e of list) {
          providerId = e.provider_id || providerId;
          if (e.direction === "sent") waitingSince = waitingSince || e;
          else if (e.direction === "received" && waitingSince && !AUTOMATIC_PROVIDER_REPLIES.includes(e.event_type)) {
            group(providerId).hours.push((Date.parse(e.created_at) - Date.parse(waitingSince.created_at)) / 3600000);
            waitingSince = null;
          }
        }
        if (waitingSince) group(providerId).waiting += 1;
      }
      const names = await providerNames(ctx.db, [...groups.keys()]);
      const rows = [...groups.entries()]
        .filter(([, g]) => g.hours.length || g.waiting)
        .map(([id, g]) => ({ label: names.get(id) || "Unknown provider", value: round1(avg(g.hours)), replies: g.hours.length, awaiting: g.waiting }))
        .sort((a, b) => b.value - a.value);
      const all = [...groups.values()].flatMap((g) => g.hours);
      const waiting = [...groups.values()].reduce((s, g) => s + g.waiting, 0);
      return {
        chartType: "bar",
        rows,
        series: [{ key: "value", label: "Average hours to reply" }],
        unit: "hours",
        headline: all.length
          ? `${round1(avg(all))} hours to reply on average; ${waiting} still waiting on a provider`
          : `No provider replies in this period; ${waiting} waiting`,
        llmRows: rows,
      };
    },
  },
  {
    id: "consent_expiry_pipeline",
    category: "Compliance",
    featured: true,
    examples: ["consents expiring soon", "client consent renewals", "whose consent expires", "popia consent expiry", "renew consent"],
    label: "Client consents expiring",
    description: "Clients whose signed Client Consent has expired or expires within the next N days, soonest first.",
    suggestedQuestion: "Whose client consent expires in the next 60 days?",
    keywords: ["consent", "consents", "expire", "expiring", "expiry", "renew", "renewal", "popia", "lapse soon"],
    params: ["days_ahead", "advisor_id"],
    defaults: { daysAhead: 60 },
    async run(access, params, ctx) {
      const clients = await scopedClients(ctx.db, access, params);
      const clientById = new Map(clients.map((c) => [c.id, c]));
      const docs = await forClients(ctx.db, "documents", "id, client_id, document_type, status, signed_at, expires_at", clients.map((c) => c.id), (q) =>
        q.eq("document_type", "client_consent")
      );
      const byClient = new Map();
      for (const doc of docs.filter((d) => d.document_type === "client_consent")) {
        if (!byClient.has(doc.client_id)) byClient.set(doc.client_id, []);
        byClient.get(doc.client_id).push(doc);
      }
      const now = ctx.now.getTime();
      const horizon = now + params.days_ahead * DAY_MS;
      const label = access.role === "admin" ? await adviserLabel(ctx, clients.map((c) => c.advisor_id)) : null;
      const rows = [];
      for (const [clientId, list] of byClient) {
        if (list.length !== 1) continue; // duplicates are a data problem the compliance page already flags
        const state = consentState(list[0], ctx.now);
        if (!state.signed || !state.expiresAt) continue;
        const expires = Date.parse(state.expiresAt);
        if (expires > horizon) continue;
        const client = clientById.get(clientId);
        rows.push({
          clientId,
          client: fullName(client),
          ...(label ? { adviser: label(client.advisor_id) } : {}),
          signed: dateKey(new Date(state.signedAt)),
          expires: dateKey(new Date(expires)),
          daysLeft: Math.ceil((expires - now) / DAY_MS),
        });
      }
      rows.sort((a, b) => a.daysLeft - b.daysLeft);
      const buckets = [
        ["Already expired", (d) => d <= 0],
        ["1–14 days", (d) => d > 0 && d <= 14],
        ["15–30 days", (d) => d > 14 && d <= 30],
        [`31–${params.days_ahead} days`, (d) => d > 30],
      ];
      const llmRows = buckets
        .map(([bucket, test]) => ({ label: bucket, value: rows.filter((r) => test(r.daysLeft)).length }))
        .filter((r, i) => i < 3 || params.days_ahead > 30);
      const expired = llmRows[0].value;
      return {
        chartType: "table",
        rows,
        columns: [
          { key: "client", label: "Client" },
          ...(label ? [{ key: "adviser", label: "Adviser" }] : []),
          { key: "signed", label: "Signed" },
          { key: "expires", label: "Expires" },
          { key: "daysLeft", label: "Days left", numeric: true },
        ],
        series: [],
        unit: "clients",
        headline: `${rows.length - expired} expiring within ${params.days_ahead} days, ${expired} already expired`,
        llmRows,
      };
    },
  },
];

// The first ten (above) plus the wider set in templates.extra.js.
TEMPLATES.push(...EXTRA_TEMPLATES, ...MONEY_TEMPLATES);

const CATEGORIES = ["Claims & requests", "Clients", "Money & goals", "Compliance", "Reminders"];
const TEMPLATE_BY_ID = new Map(TEMPLATES.map((t) => [t.id, t]));

function getTemplate(id) {
  return TEMPLATE_BY_ID.get(id) || null;
}

module.exports = { TEMPLATES, CATEGORIES, getTemplate, declineReason, humanise, periodsFor, OPEN_REMINDER_STATUSES, AUTOMATIC_PROVIDER_REPLIES };
