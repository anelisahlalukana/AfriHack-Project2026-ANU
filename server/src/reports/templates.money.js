// Money reports. Claim values come from tasks.claimed_amount / settled_amount (migration
// 202609200001_claim_amounts.sql); until that's applied these reports return an explanatory
// notice instead of a chart. Cash flow comes from the FNA income and expense lines.
const {
  scopedClients, forClients, providerNames, adviserLabel, scopedTasks, periodsFor, inRange,
  humanise, pct, plural, claimAmounts, AMOUNTS_NOTICE, monthlyAmount, periodName,
} = require("./helpers");

const RAND = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 });
const rand = (n) => RAND.format(Math.round(n || 0));
const sum = (list) => list.reduce((a, b) => a + b, 0);
const mean = (list) => (list.length ? sum(list) / list.length : 0);

function noAmounts(extra = {}) {
  return { chartType: "bar", rows: [], series: [], unit: "rand", headline: "Claim amounts aren't recorded yet", notice: AMOUNTS_NOTICE, llmRows: [], ...extra };
}

// Claims in the period (by logged date) with their amounts attached, or null when amounts don't exist yet.
async function claimsWithAmounts(access, params, ctx, { dateOf = (t) => t.created_at } = {}) {
  const clients = await scopedClients(ctx.db, access, params);
  const tasks = (await scopedTasks(ctx, clients, (q) => q.eq("task_type", "claim"))).filter(
    (t) => t.task_type === "claim" && t.status !== "draft" && (!params.date_range || inRange(dateOf(t), params.date_range))
  );
  const amounts = await claimAmounts(ctx, tasks.map((t) => t.id));
  if (!amounts) return null;
  return tasks.map((t) => ({ ...t, claimed: amounts.get(t.id)?.claimed ?? null, settled: amounts.get(t.id)?.settled ?? null }));
}

const MONEY_TEMPLATES = [
  {
    id: "claim_amounts_by_type",
    category: "Money & goals",
    featured: true,
    label: "Average claim size by type",
    description: "Average amount claimed and average amount paid out per product line (motor, funeral, health…).",
    suggestedQuestion: "What's the average claim amount per product line?",
    examples: ["average claim amount", "how big are our claims", "average payout per claim type", "claim size by category", "average motor claim value", "how much do clients claim on average"],
    keywords: ["average claim", "claim amount", "claim size", "claim value", "payout", "paid out", "how much", "rand", "value of claims", "amount"],
    params: ["date_range", "advisor_id", "provider_id"],
    defaults: { rangeDays: 365 },
    async run(access, params, ctx) {
      let claims = await claimsWithAmounts(access, params, ctx);
      if (!claims) return noAmounts();
      if (params.provider_id) claims = claims.filter((c) => c.provider_id === params.provider_id);
      const withAmount = claims.filter((c) => c.claimed != null);
      const groups = new Map();
      for (const c of withAmount) {
        const label = humanise(c.claim_category || "Uncategorised");
        if (!groups.has(label)) groups.set(label, { claimed: [], settled: [] });
        groups.get(label).claimed.push(c.claimed);
        if (c.status === "completed" && c.settled != null) groups.get(label).settled.push(c.settled);
      }
      const rows = [...groups.entries()]
        .map(([label, g]) => ({ label, avg_claimed: Math.round(mean(g.claimed)), avg_paid: Math.round(mean(g.settled)), claims: g.claimed.length, total_claimed: Math.round(sum(g.claimed)) }))
        .sort((a, b) => b.avg_claimed - a.avg_claimed);
      if (!rows.length) return { ...noAmounts(), headline: "No claim amounts recorded in this period", notice: null };
      const overall = mean(withAmount.map((c) => c.claimed));
      const biggestBook = [...rows].sort((a, b) => b.total_claimed - a.total_claimed)[0];
      const paid = withAmount.filter((c) => c.status === "completed" && c.settled != null);
      return {
        chartType: "bar",
        rows,
        series: [
          { key: "avg_claimed", label: "Average claimed" },
          { key: "avg_paid", label: "Average paid out" },
        ],
        unit: "rand",
        headline: `Average claim ${rand(overall)}; ${rows[0].label} claims are the largest at ${rand(rows[0].avg_claimed)}`,
        highlights: [
          { label: "Average claim", value: rand(overall) },
          { label: "Total claimed", value: rand(sum(withAmount.map((c) => c.claimed))) },
          { label: "Paid out on settled claims", value: paid.length ? `${pct(sum(paid.map((c) => c.settled)), sum(paid.map((c) => c.claimed)))}%` : "—" },
        ],
        llmRows: rows,
        insights: [
          `${biggestBook.label} carries the most value overall: ${rand(biggestBook.total_claimed)} across ${plural(biggestBook.claims, "claim")}.`,
          ...(withAmount.length < claims.length ? [`${plural(claims.length - withAmount.length, "claim")} in this period ${claims.length - withAmount.length === 1 ? "has" : "have"} no amount recorded.`] : []),
        ],
      };
    },
  },
  {
    id: "claim_value_trend",
    category: "Money & goals",
    featured: true,
    label: "Claim value over time",
    description: "Total rand value claimed and paid out each week or month.",
    suggestedQuestion: "How much have clients claimed and been paid out per week?",
    examples: ["total claims per week", "claim value per month", "how much was paid out this year", "rand value of claims over time", "weekly claim totals", "payouts per month"],
    keywords: ["per week", "per month", "weekly", "monthly", "over time", "trend", "total claims", "claim value", "paid out", "payouts", "claimed"],
    params: ["date_range", "advisor_id", "group_by"],
    groupBy: ["week", "month"],
    defaults: { rangeDays: 180 },
    async run(access, params, ctx) {
      // Claimed value is counted when the claim was logged; paid-out value when it was settled.
      const all = await claimsWithAmounts(access, { ...params, date_range: undefined }, ctx);
      if (!all) return noAmounts({ chartType: "line" });
      const periods = periodsFor(params.date_range, params.group_by);
      const rows = periods.keys.map((label) => ({ label, claimed: 0, paid: 0, claims: 0 }));
      const row = (value) => rows.find((r) => r.label === periods.keyOf(value));
      for (const c of all) {
        if (c.claimed != null && inRange(c.created_at, params.date_range)) {
          const r = row(c.created_at);
          if (r) {
            r.claimed += c.claimed;
            r.claims += 1;
          }
        }
        if (c.status === "completed" && c.settled != null && c.closed_at && inRange(c.closed_at, params.date_range)) {
          const r = row(c.closed_at);
          if (r) r.paid += c.settled;
        }
      }
      for (const r of rows) {
        r.claimed = Math.round(r.claimed);
        r.paid = Math.round(r.paid);
      }
      const claimed = sum(rows.map((r) => r.claimed));
      const paid = sum(rows.map((r) => r.paid));
      if (!claimed && !paid) return { ...noAmounts({ chartType: "line" }), headline: "No claim amounts recorded in this period", notice: null };
      const peak = rows.reduce((best, r) => (r.claimed > best.claimed ? r : best), rows[0]);
      const unit = periods.weekly ? "week" : "month";
      const perPeriod = claimed / Math.max(1, rows.length);
      return {
        chartType: "line",
        rows,
        series: [
          { key: "claimed", label: "Claimed" },
          { key: "paid", label: "Paid out" },
        ],
        unit: "rand",
        period: unit,
        headline: `${rand(claimed)} claimed and ${rand(paid)} paid out, about ${rand(perPeriod)} claimed per ${unit}`,
        highlights: [
          { label: "Claimed", value: rand(claimed) },
          { label: "Paid out", value: rand(paid) },
          { label: `Average per ${unit}`, value: rand(perPeriod) },
        ],
        llmRows: rows.map((r) => ({ period: r.label, claimed: r.claimed, paid_out: r.paid, claims_logged: r.claims })),
        insights: peak.claimed ? [`The biggest ${unit} was ${periodName(peak.label)}, with ${rand(peak.claimed)} claimed across ${plural(peak.claims, "claim")}.`] : [],
      };
    },
  },
  {
    id: "settlement_by_provider",
    category: "Money & goals",
    label: "Payout rate by provider",
    description: "For decided claims: how much was claimed from each insurer, how much they paid out, and the payout rate.",
    suggestedQuestion: "Which insurers pay out the most of what's claimed?",
    examples: ["payout rate per insurer", "how much does each provider pay out", "settlement ratio by provider", "which insurer pays the least", "claimed vs paid by insurer"],
    keywords: ["payout rate", "pays out", "pay out", "settlement", "settlement ratio", "paid vs claimed", "claimed vs paid", "pays the least", "pays the most"],
    params: ["date_range", "advisor_id", "product_type"],
    defaults: { rangeDays: 365 },
    async run(access, params, ctx) {
      let claims = await claimsWithAmounts(access, params, ctx, { dateOf: (t) => t.closed_at || t.created_at });
      if (!claims) return noAmounts();
      if (params.product_type) claims = claims.filter((c) => c.claim_category === params.product_type);
      const decided = claims.filter((c) => ["completed", "declined"].includes(c.status) && c.claimed != null);
      const names = await providerNames(ctx.db, decided.map((c) => c.provider_id));
      const groups = new Map();
      for (const c of decided) {
        const label = names.get(c.provider_id) || "No provider";
        if (!groups.has(label)) groups.set(label, { label, claimed: 0, paid: 0, declined_value: 0, claims: 0 });
        const g = groups.get(label);
        g.claimed += c.claimed;
        g.paid += c.status === "completed" ? c.settled ?? 0 : 0;
        if (c.status === "declined") g.declined_value += c.claimed;
        g.claims += 1;
      }
      const rows = [...groups.values()]
        .map((g) => ({ ...g, claimed: Math.round(g.claimed), paid: Math.round(g.paid), declined_value: Math.round(g.declined_value), payout_rate: pct(g.paid, g.claimed) }))
        .sort((a, b) => b.claimed - a.claimed);
      if (!rows.length) return { ...noAmounts(), headline: "No decided claims with amounts in this period", notice: null };
      const totalClaimed = sum(rows.map((r) => r.claimed));
      const totalPaid = sum(rows.map((r) => r.paid));
      const lowest = [...rows].filter((r) => r.claims >= 2).sort((a, b) => a.payout_rate - b.payout_rate)[0];
      return {
        chartType: "bar",
        rows,
        series: [
          { key: "claimed", label: "Claimed" },
          { key: "paid", label: "Paid out" },
        ],
        unit: "rand",
        headline: `Insurers paid out ${pct(totalPaid, totalClaimed)}% of the ${rand(totalClaimed)} claimed`,
        highlights: [
          { label: "Claimed (decided claims)", value: rand(totalClaimed) },
          { label: "Paid out", value: rand(totalPaid) },
          { label: "Payout rate", value: `${pct(totalPaid, totalClaimed)}%` },
        ],
        llmRows: rows,
        insights: lowest
          ? [`${lowest.label} paid out the lowest share (${lowest.payout_rate}%), with ${rand(lowest.declined_value)} of claims declined.`]
          : [],
      };
    },
  },
  {
    id: "monthly_cash_flow",
    category: "Money & goals",
    label: "Monthly cash flow",
    description: "Clients' monthly income minus expenses from their financial needs analysis, grouped into surplus bands.",
    suggestedQuestion: "Which clients are spending more than they earn each month?",
    examples: ["client cash flow", "monthly surplus", "clients in deficit", "income vs expenses", "who spends more than they earn", "disposable income"],
    keywords: ["cash flow", "cashflow", "surplus", "deficit", "income vs expenses", "spending", "expenses", "disposable income", "budget", "afford"],
    params: ["advisor_id", "group_by"],
    groupBy: ["band", "adviser"],
    async run(access, params, ctx) {
      const clients = await scopedClients(ctx.db, access, params);
      const items = await forClients(ctx.db, "client_financial_items", "id, client_id, category, amount, frequency", clients.map((c) => c.id), (q) => q.in("category", ["income", "expense"]));
      const flows = new Map();
      for (const item of items) {
        if (!["income", "expense"].includes(item.category)) continue;
        const f = flows.get(item.client_id) || { income: 0, expense: 0 };
        f[item.category] += monthlyAmount(item);
        flows.set(item.client_id, f);
      }
      const measured = clients.filter((c) => flows.has(c.id) && flows.get(c.id).income > 0);
      if (!measured.length) return { chartType: "bar", rows: [], series: [], unit: "clients", headline: "No income and expense figures captured yet", llmRows: [] };
      const surplus = (c) => flows.get(c.id).income - flows.get(c.id).expense;
      const BANDS = [["In deficit", -Infinity, 0], ["R0 – R5k", 0, 5000], ["R5k – R15k", 5000, 15000], ["R15k – R30k", 15000, 30000], ["R30k+", 30000, Infinity]];
      const groupBy = params.group_by || (access.role === "admin" ? "adviser" : "band");
      let rows;
      let series;
      let unit;
      if (groupBy === "adviser") {
        const label = await adviserLabel(ctx, clients.map((c) => c.advisor_id));
        const groups = new Map();
        for (const c of measured) {
          const key = label(c.advisor_id);
          if (!groups.has(key)) groups.set(key, { income: [], expense: [] });
          groups.get(key).income.push(flows.get(c.id).income);
          groups.get(key).expense.push(flows.get(c.id).expense);
        }
        rows = [...groups.entries()].map(([k, g]) => ({ label: k, income: Math.round(mean(g.income)), expenses: Math.round(mean(g.expense)) }));
        series = [
          { key: "income", label: "Average monthly income" },
          { key: "expenses", label: "Average monthly expenses" },
        ];
        unit = "rand";
      } else {
        rows = BANDS.map(([label, lo, hi]) => ({ label, value: measured.filter((c) => surplus(c) >= lo && surplus(c) < hi).length }));
        series = [{ key: "value", label: "Clients" }];
        unit = "clients";
      }
      const deficit = measured.filter((c) => surplus(c) < 0).length;
      const avgSurplus = mean(measured.map(surplus));
      return {
        chartType: "bar",
        rows,
        series,
        unit,
        headline: deficit
          ? `Average monthly surplus ${rand(avgSurplus)}; ${plural(deficit, "client")} ${deficit === 1 ? "spends" : "spend"} more than they earn`
          : `Average monthly surplus ${rand(avgSurplus)}; no client spends more than they earn`,
        highlights: [
          { label: "Average monthly surplus", value: rand(avgSurplus) },
          { label: "Clients in deficit", value: String(deficit) },
          { label: "Clients with cash-flow figures", value: `${measured.length} of ${clients.length}` },
        ],
        llmRows: rows,
        insights: deficit ? [`Review budgets with the ${plural(deficit, "client")} in deficit before recommending new premiums.`] : ["Every client with cash-flow figures has money left over each month."],
      };
    },
  },
];

module.exports = { MONEY_TEMPLATES, rand };
