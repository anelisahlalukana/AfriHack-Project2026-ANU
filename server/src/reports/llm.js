// Gemini (free Flash tier), server-side only. The key never leaves the server.
// Every call has a hard timeout that is shorter than the browser's 15s timeout, so a slow
// model always falls back (keyword intent / templated narrative) before the page gives up.
//   GEMINI_API_KEY          required to enable the model; without it the feature runs on fallbacks
//   GEMINI_MODEL            default gemini-2.5-flash
//   REPORTS_LLM_TIMEOUT_MS  default 10000
const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_TIMEOUT_MS = 10000;
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Models sometimes wrap JSON in ```json fences or add a sentence; take the first JSON object.
function parseJsonReply(text) {
  if (typeof text !== "string") throw new Error("Empty model reply");
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("Model reply was not JSON");
  }
}

function createGeminiClient({
  apiKey = process.env.GEMINI_API_KEY,
  model = process.env.GEMINI_MODEL || DEFAULT_MODEL,
  timeoutMs = Number(process.env.REPORTS_LLM_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
} = {}) {
  const enabled = Boolean(apiKey && fetchImpl);

  // Sends a system prompt and a user message; resolves to the parsed JSON object.
  async function generateJson(systemPrompt, userMessage) {
    if (!enabled) throw new Error("Model disabled: GEMINI_API_KEY is not set");
    const response = await fetchImpl(`${API_BASE}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json", maxOutputTokens: 1024 },
      }),
    });
    if (!response.ok) throw new Error(`Model call failed (${response.status})`);
    const body = await response.json();
    const text = body?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("");
    return parseJsonReply(text);
  }

  return { enabled, model, timeoutMs, generateJson };
}

module.exports = { createGeminiClient, parseJsonReply, DEFAULT_MODEL, DEFAULT_TIMEOUT_MS };
