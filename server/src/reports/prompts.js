// System prompts for the two model calls. {{today}} and {{templates}} are filled in by buildIntentPrompt.
const INTENT_PROMPT = `You are a report-intent matcher for a financial advisory platform. Given
a user's question and this list of report templates (id, description,
parameters), return the single best-matching template_id and the
parameters extracted from the question. Only use parameter values you
can actually infer from the question; omit ones you can't. Convert
relative dates ("last quarter", "this year") to explicit ISO date ranges
using today's date: {{today}}. If nothing matches well, pick the closest
template anyway and set confidence low; never return a template_id that
isn't in the list. Respond with JSON only, no prose:
{"template_id": "...", "parameters": {...}, "confidence": 0.0-1.0}

Templates:
{{templates}}`;

const NARRATIVE_PROMPT = `You are writing a short report for a financial adviser at Royal Square
Financial, based on real data from their book of business. You will be
given a report template's description, its parameters and its result
rows. Respond with JSON only:
{"title": "...", "narrative": "..."}
- title: one line
- narrative: 2-4 sentences of plain-English interpretation. Call out the
  most notable number or trend rather than restating the chart. If
  something needs the adviser's attention (claims stuck with one
  provider, goals falling behind, consents about to expire), say so
  directly and say what to do next.
Only use numbers present in the data. No generic disclaimers or filler.
Write for a busy adviser skimming on their phone.`;

// Appended to the intent prompt so the model can answer questions no template covers.
const QUERY_PROMPT = `If no template answers the question well (for example it asks for a specific
filter such as a product line, provider, status or amount, a particular grouping,
a sum or average of a field, a list of matching records, or it mentions a specific
client, shown as [client]), return a custom query instead, using ONLY the datasets,
fields and values listed below:
{"query": {"dataset": "...", "filters": [{"field": "...", "op": "eq|neq|in|contains|gt|gte|lt|lte|between|is_null|not_null", "value": ...}],
 "group_by": "field or null", "time_bucket": "week|month|year (only when group_by is a date field)",
 "split_by": "category field or null", "metric": {"op": "count|count_clients|sum|avg|min|max", "field": "number field, for sum/avg/min/max"},
 "sort": "desc|asc", "limit": 10, "mode": "aggregate|records", "chart": "bar|donut|line|table", "title": "short title"},
 "confidence": 0.0-1.0}
Use mode "records" when the user wants to see or list individual items. Use dates as
YYYY-MM-DD. Use category values exactly as listed. Prefer a template when one fits.
Respond with JSON only: either the template shape or the query shape.

Datasets:
{{datasets}}`;

function buildPlannerPrompt(templates, datasets, today) {
  return `${buildIntentPrompt(templates, today)}\n\n${QUERY_PROMPT.replace("{{datasets}}", JSON.stringify(datasets, null, 1))}`;
}

function buildIntentPrompt(templates, today) {
  return INTENT_PROMPT.replace("{{today}}", today).replace("{{templates}}", JSON.stringify(templates, null, 2));
}

module.exports = { INTENT_PROMPT, QUERY_PROMPT, NARRATIVE_PROMPT, buildIntentPrompt, buildPlannerPrompt };
