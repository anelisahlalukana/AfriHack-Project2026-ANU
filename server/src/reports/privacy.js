// What may be sent to the model. Rows are already aggregated by each template (llmRows);
// these helpers are the second and third lines of defence:
//   sanitizeRows   drops any field that looks personal and anything that isn't a plain value
//   redactQuestion replaces client names, ID numbers, emails and phone numbers typed into a question
//   containsClientData  a final check on the exact payload string before it is sent
const PERSONAL_KEY = /(^client|name|email|mobile|phone|address|id_?number|^id$|clientid|dob|birth|health|medical|signature)/i;
const ID_NUMBER = /\b\d{13}\b/g;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const PHONE = /(?:\+27|\b0)\d(?:[\s-]?\d){8}\b/g;

function sanitizeRows(rows = []) {
  return rows.slice(0, 60).map((row) =>
    Object.fromEntries(
      Object.entries(row).filter(
        ([key, value]) => !PERSONAL_KEY.test(key) && (typeof value === "number" || typeof value === "boolean" || (typeof value === "string" && value.length <= 80))
      )
    )
  );
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Distinct client name parts worth matching (short parts would redact ordinary words).
function nameParts(clients = []) {
  const parts = new Set();
  for (const c of clients) {
    for (const part of [c.first_name, c.surname]) {
      if (typeof part === "string" && part.trim().length >= 3) parts.add(part.trim());
    }
  }
  return [...parts];
}

function redactQuestion(question, clients = []) {
  let text = String(question || "")
    .replace(ID_NUMBER, "[id number]")
    .replace(EMAIL, "[email]")
    .replace(PHONE, "[phone]");
  for (const part of nameParts(clients)) {
    text = text.replace(new RegExp(`\\b${escapeRegExp(part)}\\b`, "gi"), "[client]");
  }
  return text;
}

function containsClientData(payload, clients = []) {
  const text = String(payload);
  if (new RegExp(ID_NUMBER.source).test(text)) return true;
  const lower = text.toLowerCase();
  return nameParts(clients).some((part) => new RegExp(`\\b${escapeRegExp(part.toLowerCase())}\\b`).test(lower));
}

module.exports = { sanitizeRows, redactQuestion, containsClientData };
