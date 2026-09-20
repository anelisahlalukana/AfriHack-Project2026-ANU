// Keyword fallback for when the intent model is off, slow, unsure or wrong.
// It always resolves to a template, and pulls simple parameters (relative dates,
// "next N days", claim category, "by provider") out of the question with regexes.
const { DAY_MS, dateKey } = require("./params");

const STOP_WORDS = new Set([
  "the", "and", "our", "for", "with", "what", "which", "how", "are", "is", "of", "in", "to", "do", "does", "did", "we", "have", "has",
  "show", "me", "my", "a", "an", "by", "on", "this", "that", "last", "next", "days", "list", "give", "tell", "see", "about", "all",
  "any", "there", "their", "them", "they", "you", "your", "i", "it", "its", "be", "been", "was", "were", "can", "could", "would",
  "should", "please", "got", "get", "most", "much", "many", "some", "who", "whose", "vs", "versus", "or", "at", "from", "so", "far",
]);

// Words people use interchangeably in this domain. Written as plain words; they are
// stemmed once at load so every inflection ("insurers", "companies") maps the same way.
const SYNONYM_GROUPS = {
  provider: ["insurer", "insurers", "insurance", "company", "companies", "underwriter", "underwriters"],
  client: ["customer", "customers", "member", "members"],
  decline: ["reject", "rejects", "rejected", "rejection", "repudiate", "repudiated", "refuse", "refused", "turned"],
  type: ["kind", "kinds", "category", "categories", "sort"],
  productline: ["motor", "car", "cars", "vehicle", "vehicles", "funeral", "life", "health", "medical", "commercial", "personal"],
  signature: ["unsigned"],
  late: ["overdue", "missed"],
  worth: ["wealth", "wealthy", "rich", "richest"],
  owe: ["owes", "owed", "owing", "debt", "debts"],
};

function tokens(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((w) => w && !STOP_WORDS.has(w));
}

// Light stemming so "claims"/"claim", "declined"/"decline" and "expiring"/"expires" meet.
function stem(word) {
  const base = word.length > 4 ? word.replace(/(ing|ies|ed|es|s)$/, "") : word.replace(/s$/, "");
  const root = (base.length > 3 ? base.replace(/e$/, "") : base) || word;
  return SYNONYMS.get(root) || root;
}

function rawStem(word) {
  const base = word.length > 4 ? word.replace(/(ing|ies|ed|es|s)$/, "") : word.replace(/s$/, "");
  return (base.length > 3 ? base.replace(/e$/, "") : base) || word;
}
const SYNONYMS = new Map();
for (const [target, words] of Object.entries(SYNONYM_GROUPS)) {
  for (const word of words) SYNONYMS.set(rawStem(word), rawStem(target));
}

const stems = (text) => new Set(tokens(text).map(stem));

// Overlap between two word sets (Dice coefficient, 0..1).
function similarity(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}

function scoreTemplate(template, question) {
  const clean = (text) => String(text).toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
  const q = ` ${clean(question)} `;
  const qStems = stems(question);
  let score = 0;
  const counted = new Set(); // "claim" and "claims" count once
  for (const keyword of template.keywords || []) {
    const words = keyword.toLowerCase().split(/\s+/);
    if (words.length > 1) {
      if (q.includes(` ${clean(keyword)} `)) score += 3 * words.length;
    } else {
      const k = stem(words[0]);
      if (qStems.has(k) && !counted.has(k)) {
        counted.add(k);
        score += 2;
      }
    }
  }
  // How close the question is to the report's own example questions.
  const examples = [template.suggestedQuestion, ...(template.examples || [])];
  const best = Math.max(0, ...examples.map((e) => similarity(qStems, stems(e))));
  score += 10 * best;
  for (const word of stems(`${template.label} ${template.description}`)) {
    if (word.length > 3 && qStems.has(word)) score += 0.5;
  }
  return score;
}

// All templates ranked for a question, best first.
function rankTemplates(question, templates) {
  return templates
    .map((template, index) => ({ template, score: scoreTemplate(template, question), index }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
}

// Best template for a question; never null (falls back to the first template).
function matchTemplate(question, templates) {
  const [best] = rankTemplates(question, templates);
  return best && best.score > 0 ? { template: best.template, score: best.score } : { template: templates[0], score: 0 };
}

const iso = (date) => dateKey(date);
function monthStart(year, month) {
  return new Date(Date.UTC(year, month, 1, 12));
}

// Relative dates in the question -> an explicit { from, to } range (business time zone).
function extractDateRange(question, now = new Date()) {
  const q = String(question).toLowerCase();
  const today = iso(now);
  const [y, m] = today.split("-").map(Number);
  const back = (days) => ({ from: iso(new Date(now.getTime() - (days - 1) * DAY_MS)), to: today });

  const rel = q.match(/\b(?:last|past|previous)\s+(\d{1,3})\s*(day|week|month|year)s?\b/);
  if (rel) {
    const n = Number(rel[1]);
    const unit = { day: 1, week: 7, month: 30, year: 365 }[rel[2]];
    return back(Math.max(1, Math.min(n * unit, 3 * 366)));
  }
  if (/\b(all time|ever|overall|since (we )?(started|began|opened)|in total|to date)\b/.test(q) && !/\byear to date\b/.test(q)) {
    return { from: iso(new Date(now.getTime() - 10 * 365 * DAY_MS)), to: today };
  }
  if (/\b(this year|year to date|ytd|so far this year)\b/.test(q)) return { from: `${y}-01-01`, to: today };
  if (/\blast year\b/.test(q)) return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
  if (/\bthis month\b/.test(q)) return { from: iso(monthStart(y, m - 1)), to: today };
  if (/\blast month\b/.test(q)) {
    return { from: iso(monthStart(y, m - 2)), to: iso(new Date(monthStart(y, m - 1).getTime() - DAY_MS)) };
  }
  const quarter = Math.floor((m - 1) / 3);
  if (/\bthis quarter\b/.test(q)) return { from: iso(monthStart(y, quarter * 3)), to: today };
  if (/\blast quarter\b/.test(q)) {
    const start = monthStart(y, quarter * 3 - 3);
    return { from: iso(start), to: iso(new Date(monthStart(y, quarter * 3).getTime() - DAY_MS)) };
  }
  if (/\b(last|past) week\b/.test(q)) return back(7);
  if (/\b(last|past) month\b/.test(q)) return back(30);
  return undefined;
}

const PRODUCT_WORDS = [
  ["motor", /\b(motor|car|vehicle|accident)s?\b/],
  ["life", /\blife\b/],
  ["health", /\b(health|medical|hospital)\b/],
  ["funeral", /\bfuneral\b/],
  ["personal", /\bpersonal\b/],
  ["commercial", /\b(commercial|business)\b/],
];

function extractParams(question, now = new Date()) {
  const q = String(question).toLowerCase();
  const params = {};
  const range = extractDateRange(q, now);
  if (range) params.date_range = range;
  const ahead = q.match(/\b(?:next|within|coming|in)\s+(?:the\s+)?(?:next\s+)?(\d{1,3})\s*days?\b/);
  if (ahead) params.days_ahead = Number(ahead[1]);
  else if (/\bnext month\b/.test(q)) params.days_ahead = 30;
  else if (/\bnext (?:3|three) months\b/.test(q)) params.days_ahead = 90;
  for (const [type, pattern] of PRODUCT_WORDS) {
    if (pattern.test(q)) {
      params.product_type = type;
      break;
    }
  }
  if (/\bby (adviser|advisor)s?\b|\bper (adviser|advisor)\b/.test(q)) params.group_by = "adviser";
  else if (/\bby provider|\bper provider|\bprovider/.test(q)) params.group_by = "provider";
  else if (/\bby goal type|\bby type of goal/.test(q)) params.group_by = "goal_type";
  else if (/\bby (task |request )?type\b/.test(q)) params.group_by = "task_type";
  return params;
}

module.exports = { matchTemplate, rankTemplates, scoreTemplate, extractParams, extractDateRange, tokens, stems };
