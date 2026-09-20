import { http } from "./http";

// The browser gives a report 15 seconds. The server's model calls time out sooner
// (REPORTS_LLM_TIMEOUT_MS, 10s) and fall back, so a slow model still returns in time.
export const REPORT_TIMEOUT_MS = 15000;

// Turns axios's timeout into a message people can act on (the shared interceptor
// would otherwise say "Couldn't reach the server").
function friendly(error) {
  if (error?.code === "ECONNABORTED" || error?.code === "ETIMEDOUT") {
    error.message = "The report took too long. Please try again.";
    error.timedOut = true;
  }
  if (error?.code === "ERR_CANCELED") error.canceled = true;
  throw error;
}

async function post(path, body, signal) {
  try {
    const { data } = await http.post(path, body, { timeout: REPORT_TIMEOUT_MS, signal });
    return data;
  } catch (error) {
    return friendly(error);
  }
}

// { templates, categories, ai: { enabled, model } }
export async function getReportCatalogue() {
  try {
    const { data } = await http.get("/api/reports/templates", { timeout: REPORT_TIMEOUT_MS });
    return { templates: data.templates || [], categories: data.categories || [], ai: data.ai || { enabled: false } };
  } catch (error) {
    return friendly(error);
  }
}

export const askReport = (question, signal) => post("/api/reports/ask", { question }, signal);

export const runReport = (templateId, parameters = {}, signal) =>
  post("/api/reports/run", { template_id: templateId, parameters }, signal);

// Only the template and parameters (or the query spec) go up: the server re-runs it itself,
// under the signed-in user's scope.
export const generateReport = (templateId, parameters = {}, signal, query) =>
  post("/api/reports/generate", query ? { query } : { template_id: templateId, parameters }, signal);

export const runQuery = (query, signal) => post("/api/reports/query", { query }, signal);
