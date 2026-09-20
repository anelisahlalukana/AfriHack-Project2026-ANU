// AI-assisted reports: plain-English question -> template -> live Supabase query -> chart,
// and an optional short written report. See server/src/reports/* for the pieces.
//
//   ask(user, question)             intent model (or keyword fallback) picks a template, then runs it
//   run(user, templateId, params)   runs a template directly (suggested-question chips, browse list)
//   generate(user, templateId, params)  re-runs the query server-side, then writes the narrative
//
// Scope always comes from the verified user (reports/scope.js), never from parameters or model output.
const { supabaseAdmin } = require("../config/supabaseClient");
const { badRequest } = require("../utils/httpError");
const { TEMPLATES, CATEGORIES, getTemplate } = require("../reports/templates");
const { normalizeParams, describeParams, dateKey } = require("../reports/params");
const { resolveReportAccess, scopedClients } = require("../reports/scope");
const { rankTemplates, extractParams } = require("../reports/keywords");
const { buildPlannerPrompt, NARRATIVE_PROMPT } = require("../reports/prompts");
const { runQuery, normalizeQuery } = require("../reports/query");
const { parseQuestion, detectClients } = require("../reports/queryParser");
const { describeDatasets, providerOptions } = require("../reports/datasets");
const { relatedTemplateIds, relatedQuerySpecs } = require("../reports/related");
const { periodName } = require("../reports/helpers");
const { sanitizeRows, redactQuestion, containsClientData } = require("../reports/privacy");
const { createGeminiClient } = require("../reports/llm");

const MIN_CONFIDENCE = 0.45;
// Below this, the page also offers the runner-up reports ("Did you mean…").
const SURE_CONFIDENCE = 0.75;
const ALTERNATIVES = 3;
// Without the model, a parsed query beats the best template when the question is this specific.
const STRONG_TEMPLATE = 10;
const EXACT_TEMPLATE = 24;
// Only offer prepared reports that are reasonably close to the question.
const MIN_ALTERNATIVE_SCORE = 4;
const MAX_QUESTION_LENGTH = 500;
// Parameters that are safe to show the model: ids are dropped (the model can't know them anyway).
const MODEL_VISIBLE_PARAMS = ["date_range", "days_ahead", "group_by", "product_type", "task_type", "goal_type"];

const { DATASETS } = require("../reports/datasets");
const DATE_FIELDS = new Set(Object.values(DATASETS).flatMap((d) => Object.entries(d.fields).filter(([, fl]) => fl.type === "date").map(([k]) => k)));

function templateSummary(t) {
  return {
    id: t.id,
    category: t.category,
    featured: Boolean(t.featured),
    label: t.label,
    description: t.description,
    suggestedQuestion: t.suggestedQuestion,
    parameters: describeParams(t),
  };
}

// What the intent model sees for each template: enough to tell similar reports apart.
function modelTemplate(t) {
  return { id: t.id, label: t.label, description: t.description, example_questions: [t.suggestedQuestion, ...(t.examples || [])].slice(0, 5), parameters: describeParams(t) };
}

function formatDay(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function describeScope(params) {
  if (params.date_range) return `${formatDay(params.date_range.from)} – ${formatDay(params.date_range.to)}`;
  if (params.days_ahead) return `next ${params.days_ahead} days`;
  return "all clients";
}

function modelVisibleParams(params) {
  return Object.fromEntries(Object.entries(params).filter(([key]) => MODEL_VISIBLE_PARAMS.includes(key)));
}

// A plain sentence or two from the top rows, used whenever the model is unavailable.
function fallbackNarrative(template, result, params, related = []) {
  const title = result.readAs ? template.label : `${template.label} (${describeScope(params)})`;
  const rows = result.llmRows || [];
  const unit = result.unit || "";
  const parts = [result.headline ? `${result.headline}.` : ""];
  if (result.chartType === "table") {
    const soon = rows.find((r) => r.label === "1–14 days");
    const expired = rows.find((r) => r.label === "Already expired");
    if (expired?.value) parts.push(`${expired.value} need renewing now.`);
    if (soon?.value) parts.push(`${soon.value} expire${soon.value === 1 ? "s" : ""} within 14 days; start with ${soon.value === 1 ? "that one" : "those"}.`);
  } else if (result.insights?.length) {
    // The template's own insights say it better than a generic line; they're added below.
  } else if (result.chartType === "line") {
    // Custom queries already name the busiest period (or the range, for averages) in the headline.
    if (!result.readAs && result.additive !== false) {
      const skip = new Set(["label", "period", "records"]);
      const totals = rows.map((r) => ({ period: r.label ?? r.period, total: Object.entries(r).reduce((s, [k, v]) => (skip.has(k) ? s : s + (Number(v) || 0)), 0) }));
      const busiest = totals.reduce((best, r) => (r.total > (best?.total ?? -1) ? r : best), null);
      if (busiest?.total) parts.push(`The busiest ${result.period || "period"} was ${periodName(busiest.period)}, with ${formatFigure(busiest.total, COUNT_UNITS.includes(unit) ? "" : unit)}.`);
    }
  } else if (result.stacked && result.series?.length > 1) {
    const key = result.series[1].key;
    const top = rows.filter((r) => typeof r[key] === "number").sort((a, b) => b[key] - a[key])[0];
    if (top?.[key]) parts.push(`${top.label} has the most ${result.series[1].label.toLowerCase()} (${top[key]}).`);
  } else {
    // The chart's own rows (llmRows can carry extra summary lines that aren't groups).
    const key = result.series?.[0]?.key || "value";
    const valued = (result.rows || []).map((r) => ({ label: r.label, value: r[key] })).filter((r) => typeof r.value === "number");
    const top = [...valued].sort((a, b) => b.value - a.value)[0];
    const countable = ["claims", "clients", "reminders", "tasks", "requests", "documents", "goals"].includes(unit);
    const total = valued.reduce((sum, r) => sum + r.value, 0);
    const low = [...valued].sort((a, b) => a.value - b.value)[0];
    if (result.readAs && top?.value && low && low !== top) {
      parts.push(`Lowest: ${low.label} at ${low.value}${unit && !countable ? ` ${unit}` : ""}.`);
    } else if (top?.value) {
      parts.push(
        countable && total
          ? `${top.label} is the largest group with ${top.value} of ${total} (${Math.round((top.value / total) * 100)}%).`
          : `Highest: ${top.label} at ${top.value}${unit ? ` ${unit}` : ""}.`
      );
    }
  }
  parts.push(...(result.insights || []));
  let narrative = parts.filter(Boolean).join(" ") || "There is no data for this report yet.";
  // Second paragraph: what the related views add.
  const extra = related
    .filter((r) => r.result?.headline)
    .map((r) => {
      // "Claims by provider — 88 claims…": the headline keeps its own capitals (product and provider names).
      return `${r.title} — ${r.result.headline}.${r.result.insights?.[0] ? ` ${r.result.insights[0]}` : ""}`;
    });
  if (extra.length) narrative += `\n\nAlongside this: ${extra.join(" ")}`;
  return { title, narrative };
}

const RAND = new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 });
const COUNT_UNITS = ["claims", "clients", "reminders", "tasks", "requests", "documents", "goals", "items", "dependants", "screenings"];

function formatFigure(value, unit) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (unit === "rand") return RAND.format(Math.round(value));
  // Thousands grouped the South African way, with a decimal point to match the written story.
  const text = (Number.isInteger(value) ? value : Math.round(value * 10) / 10).toLocaleString("en-ZA").replace(",", ".");
  return `${text}${unit === "%" ? "%" : unit === "days" ? " days" : unit === "hours" ? " h" : unit === "rating" ? " / 5" : unit === "years" ? " years" : ""}`;
}

// Three key figures for the top of a report, unless the template supplied its own.
function deriveHighlights(result) {
  if (Array.isArray(result.highlights) && result.highlights.length) return result.highlights.slice(0, 3);
  const rows = result.rows || [];
  const unit = result.unit || "";
  if (!rows.length) return [];
  if (result.chartType === "stat") return rows.slice(0, 3).map((r) => ({ label: r.label, value: formatFigure(r.value, unit) }));
  if (result.chartType === "table") return [{ label: "Items listed", value: String(rows.length) }];
  const keys = (result.series || []).map((s) => s.key);
  // Several series that add up (stacked bars, or several count lines) are summed per row.
  const sums = keys.length > 1 && (result.stacked || (result.chartType === "line" && COUNT_UNITS.includes(unit)));
  const valueOf = (r) => (sums ? keys.reduce((n, k) => n + (Number(r[k]) || 0), 0) : Number(r[keys[0] || "value"]) || 0);
  // Averages (and min/max) don't add up; counts and sums do.
  const additive = result.additive ?? (COUNT_UNITS.includes(unit) || unit === "rand" || result.stacked);
  const total = rows.reduce((n, r) => n + valueOf(r), 0);
  const out = [];
  // Stacked bars (signed vs missing, open vs completed…): the total of each part says more than the biggest bar.
  if (result.stacked && result.chartType === "bar" && keys.length > 1) {
    const parts = result.series.map((s) => ({ label: s.label, value: rows.reduce((n, r) => n + (Number(r[s.key]) || 0), 0) }));
    const whole = parts.reduce((n, p) => n + p.value, 0);
    const shown = parts.filter((p) => p.value > 0).sort((a, b) => b.value - a.value).slice(0, 2);
    return [{ label: "Total", value: formatFigure(whole, COUNT_UNITS.includes(unit) ? "" : unit) }, ...shown.map((p) => ({ label: p.label, value: `${formatFigure(p.value, COUNT_UNITS.includes(unit) ? "" : unit)}${whole && unit !== "rand" ? ` (${Math.round((p.value / whole) * 100)}%)` : ""}` }))];
  }
  if (additive) out.push({ label: result.chartType === "line" ? `Total over ${rows.length} ${result.period || "period"}s` : "Total", value: formatFigure(total, COUNT_UNITS.includes(unit) ? "" : unit) });
  if (result.chartType === "line") {
    const peak = rows.reduce((best, r) => (valueOf(r) > valueOf(best) ? r : best), rows[0]);
    out.push({ label: `Busiest ${result.period || "period"}`, value: `${periodName(peak.label)} (${formatFigure(valueOf(peak), COUNT_UNITS.includes(unit) ? "" : unit)})` });
    if (additive) out.push({ label: `Average per ${result.period || "period"}`, value: formatFigure(total / rows.length, COUNT_UNITS.includes(unit) ? "" : unit) });
    else if (rows.length > 1) {
      const low = rows.reduce((best, r) => (valueOf(r) < valueOf(best) ? r : best), rows[0]);
      out[0].label = `Highest ${result.period || "period"}`;
      out.push({ label: `Lowest ${result.period || "period"}`, value: `${periodName(low.label)} (${formatFigure(valueOf(low), COUNT_UNITS.includes(unit) ? "" : unit)})` });
    }
  } else {
    const sorted = [...rows].sort((a, b) => valueOf(b) - valueOf(a));
    const top = sorted[0];
    out.push({ label: "Largest", value: `${top.label}: ${formatFigure(valueOf(top), COUNT_UNITS.includes(unit) ? "" : unit)}${additive && total ? ` (${Math.round((valueOf(top) / total) * 100)}%)` : ""}` });
    const low = sorted[sorted.length - 1];
    if (sorted.length > 1) out.push({ label: additive ? "Groups" : "Lowest", value: additive ? String(sorted.length) : `${low.label}: ${formatFigure(valueOf(low), unit)}` });
  }
  return out.slice(0, 3).map((h) => ({ ...h, value: h.value.charAt(0).toUpperCase() + h.value.slice(1) }));
}

function hasChartData(result) {
  if (!result || result.notice || !result.rows?.length) return false;
  if (["table", "stat"].includes(result.chartType)) return true;
  const keys = (result.series || []).map((s) => s.key);
  return result.rows.some((r) => keys.some((k) => Number(r[k]) > 0));
}

// The browser-safe part of a related view (never llmRows).
function presentRelated(title, result, extra = {}) {
  const { llmRows, insights, highlights, ...visible } = result; // eslint-disable-line no-unused-vars
  return { title, ...visible, caption: result.headline, ...extra };
}

function defaultAdviserNames(db) {
  return async (ids) => {
    const names = new Map();
    await Promise.all(
      [...new Set(ids)].map(async (id) => {
        try {
          const { data } = await db.auth.admin.getUserById(id);
          const user = data?.user;
          names.set(id, user?.user_metadata?.full_name || user?.email || "Adviser");
        } catch {
          names.set(id, "Adviser");
        }
      })
    );
    return names;
  };
}

function createReportsService({ db = supabaseAdmin, llm = createGeminiClient(), now = () => new Date(), adviserNames } = {}) {
  const context = () => ({ db, now: now(), adviserNames: adviserNames || defaultAdviserNames(db) });

  function listTemplates() {
    return TEMPLATES.map(templateSummary);
  }

  function catalogue() {
    return { templates: listTemplates(), categories: CATEGORIES, ai: { enabled: Boolean(llm?.enabled), model: llm?.enabled ? llm.model : null } };
  }

  async function execute(access, template, rawParams, extra = {}) {
    const ctx = context();
    const params = normalizeParams(template, rawParams, ctx.now);
    if (access.role === "advisor") delete params.advisor_id; // advisers only ever see their own book
    const result = await template.run(access, params, ctx);
    return { params, result, ctx, ...extra };
  }

  function present(template, { params, result }, matchedBy) {
    const { llmRows, insights, highlights, ...visible } = result; // eslint-disable-line no-unused-vars
    return {
      template: { id: template.id, label: template.label, description: template.description },
      parameters: params,
      scope: describeScope(params),
      ...visible,
      matchedBy,
    };
  }

  function requireTemplate(templateId) {
    const template = typeof templateId === "string" ? getTemplate(templateId) : null;
    if (!template) throw badRequest("Unknown report");
    return template;
  }

  // Local plan (no model): the best template, unless the question is more specific than any
  // template can express (filters, a named client, a list of records, an average...).
  function planLocally(question, ranked, parsed, clientIds, today) {
    const best = ranked[0];
    const templateScore = best?.score || 0;
    // A near-exact match to a prepared report's own questions keeps that report, unless the
    // question narrows it (a filter) or names a client, which a prepared report can't do.
    if (parsed && !clientIds.length && parsed.filters === 0 && templateScore >= EXACT_TEMPLATE) {
      return { kind: "template", template: best.template, params: extractParams(question, today), matchedBy: "keyword" };
    }
    const specific =
      parsed &&
      (clientIds.length > 0 ||
        parsed.specificity >= 3 ||
        (parsed.filters >= 1 && parsed.specificity >= 2) ||
        (parsed.filters >= 1 && templateScore < STRONG_TEMPLATE) ||
        (parsed.spec.mode === "records" && (parsed.filters >= 1 || (parsed.hasDate && templateScore < STRONG_TEMPLATE))) ||
        (parsed.specificity >= 2 && templateScore < STRONG_TEMPLATE) ||
        (parsed.specificity >= 1 && templateScore < 4));
    if (specific) return { kind: "query", spec: parsed.spec, matchedBy: "keyword" };
    const template = templateScore > 0 ? best.template : TEMPLATES[0];
    return { kind: "template", template, params: extractParams(question, today), matchedBy: "keyword" };
  }

  // One model call that either picks a template or writes a query spec. Returns null on any
  // failure (off, slow, invalid JSON, unknown ids, low confidence) so the local plan takes over.
  async function planWithModel(question, clients, providers, today) {
    if (!llm?.enabled) return null;
    try {
      const system = buildPlannerPrompt(TEMPLATES.map(modelTemplate), describeDatasets(providers), dateKey(today));
      const message = JSON.stringify({ question: redactQuestion(question, clients) });
      if (containsClientData(message, clients)) throw new Error("Question still contains client data");
      const reply = await llm.generateJson(system, message);
      const confidence = Number(reply?.confidence);
      if (!Number.isFinite(confidence) || confidence < MIN_CONFIDENCE) return null;
      if (reply?.query && typeof reply.query === "object") {
        const { client_ids, advisor_id, ...spec } = reply.query; // eslint-disable-line no-unused-vars
        normalizeQuery(spec); // throws on anything outside the allowlist
        return { kind: "query", spec, matchedBy: "ai", confidence };
      }
      const template = typeof reply?.template_id === "string" ? getTemplate(reply.template_id) : null;
      if (!template) return null;
      const modelParams = reply.parameters && typeof reply.parameters === "object" ? reply.parameters : {};
      const { advisor_id, client_id, provider_id, ...safe } = modelParams; // eslint-disable-line no-unused-vars
      return { kind: "template", template, params: { ...extractParams(question, today), ...safe }, matchedBy: "ai", confidence };
    } catch (error) {
      console.warn("[reports] model unavailable or invalid, using local matching:", error.message);
      return null;
    }
  }

  function presentQuery({ spec, result }, matchedBy, alternatives = []) {
    const { llmRows, insights, highlights, title, readAs, ...visible } = result; // eslint-disable-line no-unused-vars
    const dateFilter = spec.filters.find((fl) => DATE_FIELDS.has(fl.field));
    return {
      kind: "query",
      template: { id: "custom", label: title, description: "Custom query over your records" },
      parameters: {},
      query: spec,
      readAs,
      scope: dateFilter ? readAs[spec.filters.indexOf(dateFilter) + 1].replace(/^[^0-9]*/, "") || "all records" : "all records",
      ...visible,
      matchedBy,
      alternatives,
    };
  }

  async function ask(user, question) {
    if (typeof question !== "string" || !question.trim()) throw badRequest("Type a question about your data");
    if (question.length > MAX_QUESTION_LENGTH) throw badRequest(`Keep questions under ${MAX_QUESTION_LENGTH} characters`);
    const access = resolveReportAccess(user);
    const text = question.trim();
    const today = now();
    const ctx = context();
    // Client names are matched here, against the caller's own clients only, and never sent to the model.
    const [clients, providers] = await Promise.all([scopedClients(db, access), providerOptions(db)]);
    const clientIds = detectClients(text, clients);
    const ranked = rankTemplates(text, TEMPLATES);
    const parsed = parseQuestion(text, { now: today, providers, clientIds });

    let plan = (await planWithModel(text, clients, providers, today)) || planLocally(text, ranked, parsed, clientIds, today);
    // Templates can't filter to one client, so a named client always becomes a query.
    if (plan.kind === "template" && clientIds.length && parsed) plan = { kind: "query", spec: parsed.spec, matchedBy: plan.matchedBy };

    const alternativesFor = (excludeId) =>
      ranked
        .filter((r) => r.template.id !== excludeId && r.score >= MIN_ALTERNATIVE_SCORE)
        .slice(0, ALTERNATIVES)
        .map(({ template }) => ({ id: template.id, label: template.label, suggestedQuestion: template.suggestedQuestion }));

    if (plan.kind === "query") {
      try {
        const spec = { ...plan.spec, ...(clientIds.length ? { client_ids: clientIds } : {}) };
        const ran = await runQuery(access, spec, ctx);
        return presentQuery(ran, plan.matchedBy, alternativesFor(null));
      } catch (error) {
        if (!error.status) throw error;
        console.warn("[reports] query rejected, falling back to a template:", error.message);
        plan = planLocally(text, ranked, null, [], today);
      }
    }
    const ran = await execute(access, plan.template, plan.params);
    const unsure = plan.matchedBy === "keyword" || !(plan.confidence >= SURE_CONFIDENCE);
    return { kind: "template", ...present(plan.template, ran, plan.matchedBy), alternatives: unsure ? alternativesFor(plan.template.id) : [] };
  }

  // Re-runs a query spec from the page (for "Generate report" and retries). Scope is re-applied.
  async function query(user, spec) {
    const access = resolveReportAccess(user);
    return presentQuery(await runQuery(access, spec, context()), "direct");
  }

  async function run(user, templateId, parameters) {
    const access = resolveReportAccess(user);
    const template = requireTemplate(templateId);
    return { kind: "template", ...present(template, await execute(access, template, parameters), "direct") };
  }

  async function writeNarrative(template, ran, clients, related = []) {
    const fallback = fallbackNarrative(template, ran.result, ran.params, related);
    if (!llm?.enabled) return { ...fallback, writtenBy: "template" };
    const payload = JSON.stringify({
      template: { label: template.label, description: template.description },
      parameters: modelVisibleParams(ran.params),
      headline: ran.result.headline,
      unit: ran.result.unit,
      rows: sanitizeRows(ran.result.llmRows),
      related: related.map((r) => ({ title: r.title, headline: r.result.headline, unit: r.result.unit, rows: sanitizeRows(r.result.llmRows).slice(0, 15) })),
    });
    if (containsClientData(payload, clients)) {
      console.warn("[reports] narrative payload held client data; using the templated narrative");
      return { ...fallback, writtenBy: "template" };
    }
    try {
      const reply = await llm.generateJson(NARRATIVE_PROMPT, payload);
      const title = typeof reply?.title === "string" ? reply.title.trim().slice(0, 140) : "";
      const narrative = typeof reply?.narrative === "string" ? reply.narrative.trim().slice(0, 2000) : "";
      if (title && narrative) return { title, narrative, writtenBy: "ai" };
    } catch (error) {
      console.warn("[reports] narrative model unavailable, using template:", error.message);
    }
    return { ...fallback, writtenBy: "template" };
  }

  // One or two companion views for the report. Each runs under the same scope; a view that
  // fails or has nothing to show is simply left out.
  async function relatedViews(access, template, ran, querySpec) {
    const jobs = querySpec
      ? relatedQuerySpecs(ran.spec).map(async (spec) => {
          const q = await runQuery(access, spec, context());
          return { title: q.result.title, result: q.result, readAs: q.result.readAs };
        })
      : relatedTemplateIds(template.id).map(async (id) => {
          const other = getTemplate(id);
          const { group_by, ...shared } = ran.params; // eslint-disable-line no-unused-vars
          const r = await execute(access, other, shared);
          return { title: other.label, result: r.result, templateId: id };
        });
    const settled = await Promise.allSettled(jobs);
    return settled.filter((s) => s.status === "fulfilled" && hasChartData(s.value.result)).map((s) => s.value).slice(0, 2);
  }

  async function generate(user, templateId, parameters, querySpec) {
    const access = resolveReportAccess(user);
    let ran;
    let template;
    let base;
    // Never trust rows from the browser: the query runs again here, under the caller's scope.
    if (querySpec) {
      const q = await runQuery(access, querySpec, context());
      template = { label: q.result.title, description: `Custom query: ${q.result.readAs.join(" · ")}` };
      ran = { params: {}, result: q.result, ctx: context(), spec: q.spec };
      base = presentQuery(q, "direct");
    } else {
      template = requireTemplate(templateId);
      ran = await execute(access, template, parameters);
      base = { kind: "template", ...present(template, ran, "direct") };
    }
    const [clients, related] = await Promise.all([scopedClients(db, access, ran.params), relatedViews(access, template, ran, querySpec)]);
    const { title, narrative, writtenBy } = await writeNarrative(template, ran, clients, related);
    let generatedFor = access.label;
    if (access.role === "admin") {
      const advisorId = ran.params.advisor_id || querySpec?.advisor_id;
      generatedFor = advisorId
        ? `${(await ran.ctx.adviserNames([advisorId])).get(advisorId)}'s clients (prepared by ${access.label})`
        : `All advisers (prepared by ${access.label})`;
    }
    return {
      ...base,
      title,
      narrative,
      writtenBy,
      highlights: deriveHighlights(ran.result),
      related: related.map((r) => presentRelated(r.title, r.result, r.readAs ? { readAs: r.readAs } : { templateId: r.templateId })),
      generatedAt: ran.ctx.now.toISOString(),
      generatedFor,
    };
  }

  return { listTemplates, catalogue, ask, run, query, generate, fallbackNarrative };
}

module.exports = { ...createReportsService(), createReportsService, fallbackNarrative, deriveHighlights, MIN_CONFIDENCE };
