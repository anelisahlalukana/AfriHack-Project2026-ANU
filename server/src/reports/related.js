// Companion charts for a generated report: one or two views that round out the story.
// Prepared reports list theirs here; custom queries get "the same thing over time" and
// "the same thing broken down another way".
const { DATASETS } = require("./datasets");

const RELATED = {
  claims_by_status: ["claims_by_type", "task_volume_trend"],
  claims_by_type: ["claims_by_provider", "claim_amounts_by_type"],
  claims_by_provider: ["settlement_by_provider", "provider_responsiveness"],
  avg_time_to_close: ["provider_responsiveness", "client_satisfaction"],
  overdue_reminders: ["upcoming_reminders", "work_waiting"],
  goal_progress: ["goals_by_type", "monthly_cash_flow"],
  declined_claims_by_reason: ["claims_by_provider", "settlement_by_provider"],
  task_volume_trend: ["claims_by_type", "claim_value_trend"],
  document_completion: ["documents_awaiting_signature", "clients_by_status"],
  net_worth_distribution: ["financial_breakdown", "monthly_cash_flow"],
  provider_responsiveness: ["avg_time_to_close", "client_satisfaction"],
  consent_expiry_pipeline: ["document_completion", "documents_awaiting_signature"],
  requests_by_type: ["task_volume_trend", "work_waiting"],
  work_waiting: ["adviser_workload", "claims_by_status"],
  stuck_tasks: ["work_waiting", "provider_responsiveness"],
  client_satisfaction: ["avg_time_to_close", "settlement_by_provider"],
  adviser_workload: ["work_waiting", "cpd_progress"],
  clients_by_status: ["new_clients_trend", "document_completion"],
  risk_profile_mix: ["net_worth_distribution", "clients_by_status"],
  new_clients_trend: ["clients_by_status", "risk_profile_mix"],
  financial_breakdown: ["net_worth_distribution", "monthly_cash_flow"],
  goals_by_type: ["goal_progress", "monthly_cash_flow"],
  documents_awaiting_signature: ["document_completion", "consent_expiry_pipeline"],
  screening_results: ["clients_by_status", "document_completion"],
  cpd_progress: ["adviser_workload"],
  upcoming_reminders: ["overdue_reminders"],
  claim_amounts_by_type: ["claim_value_trend", "settlement_by_provider"],
  claim_value_trend: ["claim_amounts_by_type", "task_volume_trend"],
  settlement_by_provider: ["claim_amounts_by_type", "declined_claims_by_reason"],
  monthly_cash_flow: ["financial_breakdown", "goals_by_type"],
};

function relatedTemplateIds(templateId) {
  return (RELATED[templateId] || []).slice(0, 2);
}

// Category fields worth breaking a dataset down by, most useful first.
const BREAKDOWNS = {
  claims: ["product_line", "provider", "status"],
  requests: ["request_type", "status", "provider"],
  clients: ["status", "risk_profile", "marital_status"],
  reminders: ["reminder_type", "status"],
  documents: ["document_type", "status"],
  goals: ["goal_type", "status"],
  financial_items: ["item_type", "category"],
  dependants: ["relationship"],
  screenings: ["screening_type", "result"],
};

// Two related specs for a custom query: over time (if it isn't already a time series) and a
// breakdown by a category it doesn't already use. Filters and the client scope are kept.
function relatedQuerySpecs(spec) {
  const dataset = DATASETS[spec.dataset];
  if (!dataset) return [];
  const base = {
    dataset: spec.dataset,
    filters: spec.filters,
    ...(spec.client_ids ? { client_ids: spec.client_ids } : {}),
    ...(spec.advisor_id ? { advisor_id: spec.advisor_id } : {}),
    metric: spec.mode === "records" ? { op: "count" } : spec.metric,
    mode: "aggregate",
  };
  const out = [];
  const timeGrouped = spec.group_by && dataset.fields[spec.group_by]?.type === "date";
  if (dataset.dateField && !timeGrouped) out.push({ ...base, group_by: dataset.dateField, time_bucket: "month" });
  const used = new Set([spec.group_by, spec.split_by, ...spec.filters.filter((f) => f.op === "eq").map((f) => f.field)]);
  // Averages of things only some statuses have (days to close, payouts) aren't worth splitting by status.
  if (!["count", "count_clients"].includes(base.metric.op)) used.add("status");
  const breakdown = (BREAKDOWNS[spec.dataset] || []).find((key) => !used.has(key));
  if (breakdown) out.push({ ...base, group_by: breakdown, limit: 8 });
  return out.slice(0, 2);
}

module.exports = { RELATED, relatedTemplateIds, relatedQuerySpecs };
