const { supabaseAdmin } = require("../config/supabaseClient");
const { PROVIDER_ROLE_ID } = require("../constants/roles");

// Configuration tables change rarely; cache briefly so every request doesn't re-read them.
const CACHE_MS = 60 * 1000;
const cache = new Map();

async function cached(key, load) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

function clearCatalogCache() {
  cache.clear();
}

async function listClaimCategories() {
  return cached("claim_categories", async () => {
    const { data, error } = await supabaseAdmin
      .from("claim_categories")
      .select("*")
      .eq("is_active", true)
      .order("sort_order");
    if (error) throw new Error(error.message);
    return data;
  });
}

async function listRequestTypes() {
  return cached("request_types", async () => {
    const { data, error } = await supabaseAdmin
      .from("request_types")
      .select("*")
      .eq("is_active", true)
      .order("sort_order");
    if (error) throw new Error(error.message);
    return data;
  });
}

// All stages for every workflow, grouped: { motor: [...], request: [...] }.
async function listStagesByWorkflow() {
  return cached("claim_stages", async () => {
    const { data, error } = await supabaseAdmin
      .from("claim_stages")
      .select("*")
      .order("step_order");
    if (error) throw new Error(error.message);
    const grouped = {};
    for (const stage of data) {
      (grouped[stage.category] ||= []).push(stage);
    }
    return grouped;
  });
}

async function listProviders() {
  return cached("providers", async () => {
    // Product providers (the mocked insurers) are public.users rows with role_id 2.
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("id, name:organisation_name, provider_type, product_lines, reference_prefix, integration_mode")
      .eq("role_id", PROVIDER_ROLE_ID)
      .order("organisation_name");
    if (error) throw new Error(error.message);
    return data;
  });
}

async function getClaimCategory(category) {
  return (await listClaimCategories()).find((c) => c.category === category) || null;
}

async function getRequestType(taskType) {
  return (await listRequestTypes()).find((t) => t.task_type === taskType) || null;
}

// The config object (claim category or request type) that drives a task.
async function getTaskConfig(task) {
  return task.task_type === "claim"
    ? getClaimCategory(task.claim_category)
    : getRequestType(task.task_type);
}

async function getCatalog() {
  const [claimCategories, requestTypes, providers] = await Promise.all([
    listClaimCategories(),
    listRequestTypes(),
    listProviders(),
  ]);
  return { claimCategories, requestTypes, providers };
}

module.exports = {
  listClaimCategories,
  listRequestTypes,
  listStagesByWorkflow,
  listProviders,
  getClaimCategory,
  getRequestType,
  getTaskConfig,
  getCatalog,
  clearCatalogCache,
};
