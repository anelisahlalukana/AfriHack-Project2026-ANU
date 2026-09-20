// Demo data for the whole workspace, so dashboards, reports and client pages look alive.
//
//   node scripts/seed-demo.js --yes                  add demo data (refuses if it's already there)
//   node scripts/seed-demo.js --reset --yes          remove everything the seed added
//   node scripts/seed-demo.js --fresh --yes          reset, then seed again
//
// Options:
//   --clients=60                    how many demo clients (default 60, max 400)
//   --advisers=a@x.co,b@y.co        real adviser logins to give demo clients to (default: every
//                                   Auth user whose app_metadata.role is 'advisor')
//   --demo-advisers=2               extra demo adviser logins to create (default 2, max 5)
//   --demo-password=Secret123!      password for the demo advisers so you can sign in as them
//                                   (or set DEMO_ADVISER_PASSWORD; otherwise they get a random one)
//   --seed=2026                     random seed; the same seed gives the same data
//
// Everything is fictional. Demo rows are marked so --reset removes exactly them:
//   clients and demo advisers use @demo.royalsquare.test emails, CPD entries start with "Demo:",
//   demo notifications have event_key "demo-seed:…", and any provider the seed had to create
//   ends in "(demo)". Claims, documents, reminders and so on hang off the demo clients.
// It reads the stage lists, request types, claim categories, reminder rules and providers from
// the database, so it follows whatever configuration your project has.
require("dotenv").config({ path: require("node:path").join(__dirname, "../.env"), quiet: true });
const crypto = require("node:crypto");
const wf = require("../src/utils/workflow");

const DEMO_DOMAIN = "demo.royalsquare.test";
const DEMO_EVENT_PREFIX = "demo-seed:";
const CPD_PREFIX = "Demo: ";
const DAY = 86400000;
const CHUNK = 400;

// ------------------------------------------------------------------ randomness
function createRandom(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r = {
    next,
    chance: (p) => next() < p,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    num: (lo, hi) => lo + next() * (hi - lo),
    pick: (list) => list[Math.floor(next() * list.length)],
    weighted(pairs) {
      const total = pairs.reduce((s, [, w]) => s + w, 0);
      let x = next() * total;
      for (const [value, w] of pairs) if ((x -= w) < 0) return value;
      return pairs[pairs.length - 1][0];
    },
    uuid: () => {
      const h = [...Array(32)].map(() => Math.floor(next() * 16).toString(16)).join("");
      return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${"89ab"[Math.floor(next() * 4)]}${h.slice(17, 20)}-${h.slice(20, 32)}`;
    },
  };
  return r;
}

const round = (n, step = 1) => Math.round(n / step) * step;
const iso = (t) => new Date(t).toISOString();
const dateOnly = (t) => new Date(t).toISOString().slice(0, 10);
// Reminder dates are business days in South Africa, like the scheduler's.
const saDate = (t) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(new Date(t));
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// ------------------------------------------------------------------ fictional people
const FIRST = {
  f: ["Thandiwe", "Ayesha", "Lerato", "Naledi", "Zanele", "Megan", "Fatima", "Nomvula", "Palesa", "Chantelle", "Refilwe", "Priya", "Anele", "Busisiwe", "Karen", "Lindiwe", "Mpho", "Nadia", "Sibongile", "Tamsin", "Yolanda", "Zodwa", "Boitumelo", "Carmen", "Dineo", "Elize", "Keabetswe", "Nosipho"],
  m: ["Thabo", "Sipho", "Pieter", "Johan", "Kagiso", "Riaan", "Mandla", "Tshepo", "Lwazi", "Bongani", "Ruan", "Yusuf", "Themba", "Neo", "Andile", "Hendrik", "Kabelo", "Musa", "Rajesh", "Siyabonga", "Tebogo", "Vusi", "Xolani", "Brandon", "Dumisani", "Gerhard", "Jabu", "Sello"],
};
const SURNAMES = ["Mokoena", "Patel", "Ndlovu", "Dlamini", "Botha", "Jacobs", "Khumalo", "Naidoo", "van der Merwe", "Mahlangu", "Nkosi", "Pillay", "Molefe", "Pretorius", "Zulu", "Mthembu", "Nel", "Govender", "Sithole", "du Plessis", "Maseko", "Adams", "Petersen", "Mabaso", "Coetzee", "Radebe", "Hendricks", "Moodley", "Mokwena", "Venter", "Tshabalala", "Williams"];
const SUBURBS = [["Rondebosch", "Cape Town", "7700"], ["Durbanville", "Cape Town", "7550"], ["Sandton", "Johannesburg", "2196"], ["Soweto", "Johannesburg", "1804"], ["Umhlanga", "Durban", "4319"], ["Centurion", "Pretoria", "0157"], ["Hatfield", "Pretoria", "0083"], ["Summerstrand", "Gqeberha", "6001"], ["Bloemfontein Central", "Bloemfontein", "9301"], ["Stellenbosch Central", "Stellenbosch", "7600"], ["Randburg", "Johannesburg", "2194"], ["Khayelitsha", "Cape Town", "7784"]];
const STREETS = ["Acacia", "Protea", "Jacaranda", "Milkwood", "Yellowwood", "Fynbos", "Baobab", "Aloe", "Marula", "Stinkwood"];
const OCCUPATIONS = [
  ["Teacher", "Department of Education", 320000, 520000],
  ["Registered nurse", "Groote Schuur Hospital", 340000, 560000],
  ["Software developer", "Northwind Digital", 480000, 1100000],
  ["Chartered accountant", "Kruger & Naidoo Inc.", 650000, 1600000],
  ["Electrician", "Self-employed", 260000, 520000],
  ["Sales manager", "Coastal Motors", 420000, 900000],
  ["Civil engineer", "Tshwane Infrastructure", 560000, 1200000],
  ["Small business owner", "Own business", 300000, 1800000],
  ["Police officer", "SAPS", 280000, 460000],
  ["Pharmacist", "Clicks Pharmacy", 520000, 820000],
  ["Attorney", "Mokoena Attorneys", 600000, 1700000],
  ["Retail supervisor", "Shoprite", 180000, 320000],
  ["Doctor", "Private practice", 900000, 2200000],
  ["Retired", "—", 150000, 480000],
];
const NATIONALITIES = [["South African", 90], ["Zimbabwean", 3], ["Nigerian", 2], ["British", 2], ["Mozambican", 2], ["Indian", 1]];
const RISK = ["conservative", "moderate", "balanced", "growth", "aggressive"];
const DOC_TYPES = ["confidentiality_agreement", "broker_appointment", "client_consent", "service_agreement", "fais_disclosure"];
const HANDLERS = ["Riaan Botha", "Lerato Dlamini", "Pieter van der Merwe", "Ayesha Patel", "Sipho Ndlovu", "Megan Jacobs", "Nomsa Zungu", "Charl Venter"];
const DECLINE_REASONS = [
  "Declined: the policy excludes wear and tear on the vehicle.",
  "Declined: the loss is excluded under the policy terms (pre-existing condition).",
  "Declined: premiums were unpaid for three months, so the policy lapsed before the incident.",
  "Declined: the policy was not in force on the date of loss.",
  "Declined: required documents were not received (police report and driver's licence).",
  "Declined: missing proof of ownership for the claimed items.",
  "Declined: the claim falls within the six-month waiting period.",
  "Declined: the damage is not covered under the current plan.",
];
const REVIEWS = ["Quick and painless, thank you.", "Took longer than I hoped but the adviser kept me updated.", "Excellent service from start to finish.", "The insurer was slow to respond.", "Very happy with how this was handled.", "Communication could have been better."];
const CPD_ACTIVITIES = ["FAIS regulatory update webinar", "Retirement reform (two-pot) workshop", "Ethics in financial advice", "Short-term insurance claims masterclass", "POPIA refresher", "Estate planning fundamentals", "Medical aid benefits update", "Investment market outlook briefing"];

function luhnDigit(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return String((10 - (sum % 10)) % 10);
}

// A fictional but well-formed SA ID number (date of birth, gender, citizenship, check digit).
function idNumber(rnd, dob, female, citizen) {
  const base = `${dob.slice(2, 4)}${dob.slice(5, 7)}${dob.slice(8, 10)}${String(female ? rnd.int(0, 4999) : rnd.int(5000, 9999)).padStart(4, "0")}${citizen ? "0" : "1"}8`;
  return base + luhnDigit(base);
}

// ------------------------------------------------------------------ claim form answers
function fillForm(rnd, fields = [], when, category) {
  const form = {};
  for (const f of Array.isArray(fields) ? fields : []) {
    if (!f?.key) continue;
    const key = String(f.key).toLowerCase();
    const type = f.type || "text";
    if (type === "financial_items") form[f.key] = [{ category: "asset", item_type: "Unit trust", amount: rnd.int(20, 400) * 1000 }];
    else if (type === "boolean" || type === "checkbox") form[f.key] = rnd.chance(0.6);
    else if (type === "select") form[f.key] = Array.isArray(f.options) && f.options.length ? rnd.pick(f.options) : "Other";
    else if (type === "date") form[f.key] = dateOnly(when - rnd.int(0, 5) * DAY);
    else if (/datetime/.test(type)) form[f.key] = iso(when - rnd.int(2, 72) * 3600000).slice(0, 16);
    else if (type === "number" || type === "currency") form[f.key] = rnd.int(3, 250) * 1000;
    else if (/reg|plate/.test(key)) form[f.key] = `${rnd.pick(["CA", "CY", "GP", "ND", "EC"])} ${rnd.int(100, 999)}-${rnd.int(100, 999)}`;
    else if (/police|case|cas/.test(key)) form[f.key] = `CAS ${rnd.int(10, 480)}/${dateOnly(when).slice(5, 7)}/${dateOnly(when).slice(0, 4)}`;
    else if (/location|address|place|where/.test(key)) {
      const [sub, city] = rnd.pick(SUBURBS);
      form[f.key] = `${rnd.pick(STREETS)} Road, ${sub}, ${city}`;
    } else if (/email/.test(key)) form[f.key] = `contact@${DEMO_DOMAIN}`;
    else if (/phone|mobile|cell/.test(key)) form[f.key] = "000 000 0000";
    else if (/name/.test(key)) form[f.key] = `${rnd.pick([...FIRST.f, ...FIRST.m])} ${rnd.pick(SURNAMES)}`;
    else if (type === "textarea" || /descr|detail|what|how|reason/.test(key)) {
      form[f.key] = {
        motor: "Rear-ended at a traffic light; bumper and boot damaged. No injuries.",
        life: "Policyholder passed away after a short illness. Family has the death certificate.",
        health: "Hospital admission for an appendectomy; specialist and theatre accounts attached.",
        funeral: "Funeral of a covered family member; certified death certificate and ID attached.",
        personal: "Laptop and phone stolen from the car at a shopping centre.",
        commercial: "Storm damage to the shop roof and some stock water-damaged.",
      }[category] || "Please see the attached documents.";
    } else form[f.key] = f.label ? `Demo answer for ${String(f.label).toLowerCase()}` : "Demo answer";
  }
  return form;
}

// ------------------------------------------------------------------ Supabase store
// The seed talks to the database through this small interface so it can be tested against a
// plain Postgres database (see tests) and run for real against Supabase.
function createSupabaseStore(db) {
  const apply = (query, filters = []) => {
    for (const { col, op, value } of filters) {
      if (op === "eq") query = query.eq(col, value);
      else if (op === "in") query = query.in(col, value);
      else if (op === "like") query = query.like(col, value);
      else if (op === "is") query = query.is(col, value);
    }
    return query;
  };
  const chunked = async (filters, fn) => {
    const inFilter = filters.find((f) => f.op === "in");
    if (!inFilter) return fn(filters);
    const out = [];
    for (let i = 0; i < inFilter.value.length; i += 100) {
      out.push(...((await fn(filters.map((f) => (f === inFilter ? { ...f, value: inFilter.value.slice(i, i + 100) } : f)))) || []));
    }
    return out;
  };
  return {
    async select(table, columns, filters = []) {
      return chunked(filters, async (fs) => {
        const rows = [];
        for (let from = 0; ; from += 1000) {
          const { data, error } = await apply(db.from(table).select(columns), fs).range(from, from + 999);
          if (error) throw new Error(`${table}: ${error.message}`);
          rows.push(...data);
          if (data.length < 1000) return rows;
        }
      });
    },
    async insert(table, rows, returning = null) {
      const out = [];
      for (let i = 0; i < rows.length; i += CHUNK) {
        let q = db.from(table).insert(rows.slice(i, i + CHUNK));
        if (returning) q = q.select(returning);
        const { data, error } = await q;
        if (error) throw new Error(`${table}: ${error.message}`);
        if (returning) out.push(...data);
      }
      return out;
    },
    async delete(table, filters) {
      if (!filters.length) throw new Error("Refusing an unfiltered delete");
      const counts = await chunked(filters, async (fs) => {
        const { error, count } = await apply(db.from(table).delete({ count: "exact" }), fs);
        if (error) throw new Error(`${table}: ${error.message}`);
        return [count || 0];
      });
      return counts.reduce((a, b) => a + b, 0);
    },
    auth: {
      async listUsers() {
        const users = [];
        for (let page = 1; ; page += 1) {
          const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
          if (error) throw new Error(`auth: ${error.message}`);
          users.push(...data.users);
          if (data.users.length < 1000) return users;
        }
      },
      async createUser({ email, password, app_metadata, user_metadata }) {
        const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, app_metadata, user_metadata });
        if (error) throw new Error(`auth ${email}: ${error.message}`);
        return data.user;
      },
      async deleteUser(id) {
        const { error } = await db.auth.admin.deleteUser(id);
        if (error) throw new Error(`auth ${id}: ${error.message}`);
      },
    },
  };
}

// ------------------------------------------------------------------ seed
async function loadConfig(store) {
  const [stages, categories, requestTypes, rules, providers] = await Promise.all([
    store.select("claim_stages", "*"),
    store.select("claim_categories", "category, label, form_fields, is_active"),
    store.select("request_types", "task_type, label, workflow, requires_provider, form_fields, is_active"),
    store.select("reminder_rules", "id, title, repeat_months, audience, enabled"),
    store.select("users", "id, organisation_name, claim_category, product_lines, reference_prefix", [{ col: "role_id", op: "eq", value: 2 }]),
  ]);
  const stagesBy = new Map();
  for (const s of stages) {
    if (!stagesBy.has(s.category)) stagesBy.set(s.category, []);
    stagesBy.get(s.category).push(s);
  }
  return { stagesBy, categories: categories.filter((c) => c.is_active !== false), requestTypes: requestTypes.filter((r) => r.is_active !== false), rules, providers };
}

async function ensureProviders(store, rnd, config, log) {
  if (config.providers.length >= 2) return config.providers;
  const wanted = [
    ["Santam (demo)", "motor", ["motor", "personal", "commercial"], "SNT"],
    ["Old Mutual (demo)", "life", ["life", "funeral"], "OMU"],
    ["Discovery (demo)", "health", ["health", "life"], "DSC"],
    ["Hollard (demo)", "funeral", ["funeral", "personal", "motor"], "HOL"],
  ];
  const rows = wanted.map(([name, cat, lines, prefix]) => ({ id: rnd.uuid(), role_id: 2, organisation_name: name, claim_category: cat, product_lines: lines, reference_prefix: prefix, status: "active" }));
  await store.insert("users", rows);
  log(`  no providers found, created ${rows.length} demo providers`);
  return [...config.providers, ...rows];
}

function providerFor(rnd, providers, category) {
  const fits = providers.filter((p) => p.claim_category === category || (p.product_lines || []).includes(category));
  return rnd.pick(fits.length ? fits : providers);
}

// Provider personalities, so reports have a story: one is slow, one declines more.
function personality(provider, index) {
  return [
    { speed: 1, decline: 0.08, reply: [6, 30], rating: 4.3 },
    { speed: 2.2, decline: 0.16, reply: [30, 140], rating: 3.1 },
    { speed: 1.3, decline: 0.1, reply: [10, 60], rating: 3.9 },
    { speed: 1.6, decline: 0.22, reply: [20, 90], rating: 3.4 },
  ][index % 4];
}

async function seedDemo(store, options = {}) {
  const log = options.log || (() => {});
  const now = options.now ? new Date(options.now).getTime() : Date.now();
  const rnd = createRandom(options.seed ?? 2026);
  const clientCount = clamp(Number(options.clients) || 60, 1, 400);
  const today = saDate(now);

  const existing = await store.select("users", "id", [{ col: "contact_email", op: "like", value: `%@${DEMO_DOMAIN}` }]);
  if (existing.length) throw new Error(`Demo data is already there (${existing.length} demo clients). Run with --reset first, or use --fresh.`);

  const config = await loadConfig(store);
  if (!config.rules.length) throw new Error("reminder_rules is empty: apply the reminders migration (202609190010) first.");
  const providers = await ensureProviders(store, rnd, config, log);
  const traits = new Map(providers.map((p, i) => [p.id, personality(p, i)]));

  // ---------------- advisers
  const authUsers = await store.auth.listUsers();
  const wantedEmails = (options.advisers || []).map((e) => e.toLowerCase());
  let realAdvisers = authUsers.filter((u) => u.app_metadata?.role === "advisor" && !String(u.email).endsWith(`@${DEMO_DOMAIN}`));
  if (wantedEmails.length) {
    realAdvisers = authUsers.filter((u) => wantedEmails.includes(String(u.email).toLowerCase()));
    const missing = wantedEmails.filter((e) => !realAdvisers.some((u) => u.email.toLowerCase() === e));
    if (missing.length) throw new Error(`No login found for: ${missing.join(", ")}`);
    const notAdvisers = realAdvisers.filter((u) => u.app_metadata?.role !== "advisor");
    if (notAdvisers.length) throw new Error(`Not advisers (app_metadata.role must be 'advisor'): ${notAdvisers.map((u) => u.email).join(", ")}`);
  }
  const demoNames = ["Lindiwe Mahlaba", "Pieter Joubert", "Farah Essop", "Sizwe Mkhize", "Anna Kotze"];
  const demoAdvisers = [];
  const password = options.demoPassword || crypto.randomBytes(18).toString("base64url");
  for (const name of demoNames.slice(0, clamp(Number(options.demoAdvisers ?? 2), 0, 5))) {
    const email = `${name.toLowerCase().replace(/\s+/g, ".")}@${DEMO_DOMAIN}`;
    const user = await store.auth.createUser({ email, password, app_metadata: { role: "advisor" }, user_metadata: { full_name: `${name} (demo)` } });
    demoAdvisers.push({ id: user.id, email, name: `${name} (demo)` });
  }
  const advisers = [
    ...realAdvisers.map((u) => ({ id: u.id, email: u.email, name: u.user_metadata?.full_name || u.email, real: true })),
    ...demoAdvisers,
  ];
  if (!advisers.length) throw new Error("No advisers: create an adviser login first, or allow demo advisers (--demo-advisers=2).");
  log(`  advisers: ${advisers.map((a) => a.email).join(", ")}`);
  // Real advisers get most of the clients, so the person signing in sees a full book.
  const adviserWeights = advisers.map((a) => [a, a.real ? 3 : 1]);

  // ---------------- clients and their FNA
  const clients = [];
  const items = [];
  const goals = [];
  const dependants = [];
  const usedEmails = new Set();
  for (let i = 0; i < clientCount; i += 1) {
    const female = rnd.chance(0.52);
    const first = rnd.pick(female ? FIRST.f : FIRST.m);
    const surname = rnd.pick(SURNAMES);
    const status = rnd.weighted([["active", 70], ["onboarding", 20], ["inactive", 10]]);
    const createdAt = now - (status === "onboarding" ? rnd.int(1, 45) : status === "active" ? rnd.int(50, 900) : rnd.int(200, 1000)) * DAY - rnd.int(0, 86399) * 1000;
    const [occupation, employer, lo, hi] = rnd.pick(OCCUPATIONS);
    const age = occupation === "Retired" ? rnd.int(62, 78) : rnd.int(23, 61);
    const dob = dateOnly(now - (age * 365.25 + rnd.int(0, 364)) * DAY);
    const nationality = rnd.weighted(NATIONALITIES);
    const income = round(rnd.num(lo, hi), 1000);
    const married = rnd.weighted([["single", 30], ["married", 45], ["divorced", 10], ["life_partner", 8], ["widowed", age > 55 ? 7 : 1]]);
    const assessed = status !== "onboarding" || rnd.chance(0.4);
    const riskScore = rnd.int(8, 40);
    const riskCategory = RISK[clamp(Math.floor((riskScore - 8) / 6.5) + (age > 58 ? -1 : 0), 0, 4)];
    const [suburb, city, code] = rnd.pick(SUBURBS);
    let email = `${first}.${surname}`.toLowerCase().replace(/[^a-z.]/g, "");
    while (usedEmails.has(email)) email += rnd.int(1, 9);
    usedEmails.add(email);
    const pep = rnd.chance(0.04);
    const adviser = rnd.weighted(adviserWeights);
    const client = {
      id: rnd.uuid(),
      role_id: 1,
      advisor_id: adviser.id,
      first_name: first,
      second_name: rnd.chance(0.4) ? rnd.pick(female ? FIRST.f : FIRST.m) : null,
      surname,
      id_number: idNumber(rnd, dob, female, nationality === "South African"),
      date_of_birth: dob,
      nationality,
      marital_status: married,
      occupation,
      employer_name: employer === "—" ? null : employer,
      annual_income: income,
      is_politically_exposed: pep,
      pep_details: pep ? "Ward councillor in a local municipality (fictional demo record)" : null,
      risk_profile_score: assessed ? riskScore : null,
      risk_profile_category: assessed ? riskCategory : null,
      contact_email: `${email}@${DEMO_DOMAIN}`,
      contact_mobile: null,
      physical_address: `${rnd.int(1, 180)} ${rnd.pick(STREETS)} Street, ${suburb}, ${city}, ${code}`,
      status,
      created_at: iso(createdAt),
    };
    clients.push({ ...client, _adviser: adviser, _age: age, _female: female, _created: createdAt });

    // Financial needs analysis: most active clients, some onboarding ones.
    if (status !== "onboarding" ? rnd.chance(0.88) : rnd.chance(0.35)) {
      const add = (category, item_type, description, amount, frequency, rate = null) =>
        items.push({ id: rnd.uuid(), client_id: client.id, category, item_type, description, amount: round(amount, 100), frequency, interest_rate: rate, created_at: iso(createdAt + rnd.int(1, 20) * DAY) });
      const home = rnd.chance(age > 30 ? 0.65 : 0.25) ? income * rnd.num(2.5, 7) : 0;
      if (home) add("asset", "property", `Home in ${suburb}`, home, "once_off");
      const car = rnd.chance(0.8) ? rnd.num(120000, Math.min(900000, income * 1.1)) : 0;
      if (car) add("asset", "vehicle", rnd.pick(["Toyota Corolla", "VW Polo", "Ford Ranger", "Hyundai Tucson", "BMW 3 Series"]), car, "once_off");
      const years = Math.max(0, age - 25);
      if (rnd.chance(0.7)) add("asset", "retirement_annuity", "Retirement annuity", income * years * rnd.num(0.04, 0.12), "once_off");
      if (rnd.chance(0.45)) add("asset", "pension_fund", "Employer pension fund", income * years * rnd.num(0.05, 0.15), "once_off");
      if (rnd.chance(0.4)) add("asset", "unit_trusts", "Balanced unit trust", rnd.num(20000, income * 1.5), "once_off");
      if (rnd.chance(0.25)) add("asset", "shares", "Direct share portfolio", rnd.num(15000, income * 2), "once_off");
      add("asset", "savings", "Savings account", rnd.num(5000, income * 0.4), "once_off");
      if (home && rnd.chance(0.75)) add("liability", "home_loan", "Home loan", home * rnd.num(0.25, 0.9), "once_off", round(rnd.num(10.5, 12.5), 0.25));
      if (car && rnd.chance(0.6)) add("liability", "vehicle_finance", "Vehicle finance", car * rnd.num(0.3, 0.95), "once_off", round(rnd.num(11, 16), 0.25));
      if (rnd.chance(0.7)) add("liability", "credit_card", "Credit card", rnd.num(3000, 65000), "once_off", round(rnd.num(18, 22.5), 0.25));
      if (rnd.chance(0.25)) add("liability", "personal_loan", "Personal loan", rnd.num(15000, 180000), "once_off", round(rnd.num(19, 27), 0.25));
      if (age < 32 && rnd.chance(0.3)) add("liability", "student_loan", "Student loan", rnd.num(20000, 160000), "once_off", round(rnd.num(8, 11), 0.25));
      if (occupation !== "Retired") add("income", "salary", "Net salary", (income / 12) * rnd.num(0.68, 0.78), "monthly");
      else add("income", "pension", "Pension income", income / 12, "monthly");
      if (home && rnd.chance(0.15)) add("income", "rental_income", "Rental from a flatlet", rnd.num(4000, 12000), "monthly");
      add("expense", "household", "Household expenses", (income / 12) * rnd.num(0.25, 0.45), "monthly");
      if (rnd.chance(0.5)) add("expense", "insurance_premiums", "Insurance premiums", rnd.num(900, 6000), "monthly");
    }

    // Goals: progress is spread around "on schedule" so some are behind and some ahead.
    if (rnd.chance(status === "onboarding" ? 0.4 : 0.9)) {
      const goalTypes = rnd.chance(0.6) ? ["retirement", rnd.pick(["education", "home", "emergency_fund", "other"])] : [rnd.pick(["retirement", "education", "home", "emergency_fund", "other"])];
      for (const type of goalTypes) {
        const spec = {
          retirement: ["Retire comfortably", income * rnd.num(8, 16), Math.max(2, 65 - age)],
          education: ["Children's university fund", rnd.num(250000, 900000), rnd.int(4, 15)],
          home: ["Deposit for a home", rnd.num(150000, 600000), rnd.int(1, 4)],
          emergency_fund: ["Emergency fund (6 months)", income * 0.4, rnd.int(1, 2)],
          other: [rnd.pick(["Overseas holiday", "New car", "Wedding", "Start a business"]), rnd.num(60000, 400000), rnd.int(1, 3)],
        }[type];
        const [name, rawTarget, yearsAhead] = spec;
        const target = round(rawTarget, 1000);
        const started = createdAt + rnd.int(1, 40) * DAY;
        const due = now + yearsAhead * 365 * DAY - rnd.int(0, 200) * DAY;
        const elapsed = clamp((now - started) / (due - started), 0.02, 1);
        const statusGoal = rnd.weighted([["in_progress", 85], ["completed", 8], ["on_hold", 7]]);
        const progress = statusGoal === "completed" ? target : target * clamp(elapsed * rnd.num(0.3, 1.5) + (type === "retirement" ? rnd.num(0.02, 0.2) : 0), 0, 0.98);
        goals.push({ id: rnd.uuid(), client_id: client.id, goal_name: name, goal_type: type, target_amount: target, target_date: dateOnly(statusGoal === "completed" ? now - rnd.int(10, 200) * DAY : due), current_progress: Math.min(target, round(progress, 100)), status: statusGoal, is_shared: false });
      }
    }

    // Dependants and beneficiaries (never shown to the model; names are fictional).
    const deps = [];
    if (["married", "life_partner"].includes(married) && rnd.chance(0.85)) deps.push(["spouse", `${rnd.pick(female ? FIRST.m : FIRST.f)} ${surname}`, age + rnd.int(-5, 5)]);
    const kids = age > 28 && age < 60 ? rnd.weighted([[0, 3], [1, 3], [2, 3], [3, 1]]) : 0;
    for (let k = 0; k < kids; k += 1) deps.push(["child", `${rnd.pick([...FIRST.f, ...FIRST.m])} ${surname}`, rnd.int(1, Math.min(22, age - 20))]);
    if (age < 40 && rnd.chance(0.15)) deps.push(["parent", `${rnd.pick([...FIRST.f, ...FIRST.m])} ${surname}`, age + rnd.int(22, 35)]);
    let share = 100;
    deps.forEach(([relationship, fullName, depAge], k) => {
      const pct = k === deps.length - 1 ? share : relationship === "spouse" ? 50 : Math.floor(share / (deps.length - k));
      share -= pct;
      dependants.push({ id: rnd.uuid(), client_id: client.id, full_name: fullName, relationship, date_of_birth: dateOnly(now - (depAge * 365.25 + rnd.int(0, 300)) * DAY), id_number: null, beneficiary_percentage: pct });
    });
  }
  await store.insert("users", clients.map(({ _adviser, _age, _female, _created, ...row }) => row));
  await store.insert("client_financial_items", items);
  await store.insert("client_goals", goals);
  await store.insert("client_dependants", dependants);
  log(`  ${clients.length} clients, ${items.length} FNA items, ${goals.length} goals, ${dependants.length} dependants`);

  // ---------------- documents (5 per client, status follows the client's stage)
  const documents = [];
  for (const c of clients) {
    for (const type of DOC_TYPES) {
      let status;
      if (c.status === "onboarding") status = ["fais_disclosure", "confidentiality_agreement"].includes(type) ? rnd.weighted([["signed", 7], ["sent", 3]]) : rnd.weighted([["signed", 3], ["sent", 4], ["not_sent", 3]]);
      else status = rnd.chance(0.97) ? "signed" : "sent";
      if (status === "not_sent") continue;
      // Sent on or after the client joined, never in the future; signed after it was sent.
      const sentAt = status === "sent" ? Math.max(c._created + 3600000, now - rnd.int(1, 24) * DAY) : Math.min(now - 2 * 3600000, c._created + rnd.int(0, 6) * DAY);
      let signedAt = status === "signed" ? Math.max(sentAt + 3600000, Math.min(now - 3600000, sentAt + rnd.int(0, 12) * DAY + rnd.int(1, 20) * 3600000)) : null;
      // Consents are renewed yearly: spread the latest signature so some expire soon and a few already have.
      if (type === "client_consent" && status === "signed") {
        const lastSigned = now - rnd.weighted([[rnd.int(15, 300), 60], [rnd.int(300, 364), 30], [rnd.int(368, 430), 10]]) * DAY;
        signedAt = Math.max(signedAt, lastSigned);
      }
      documents.push({
        id: rnd.uuid(),
        client_id: c.id,
        document_type: type,
        status,
        sent_at: iso(sentAt),
        signed_at: signedAt ? iso(signedAt) : null,
        created_at: iso(sentAt),
      });
    }
  }
  await store.insert("documents", documents);

  // ---------------- claims and requests
  const tasks = [];
  const updates = [];
  const events = [];
  const categories = config.categories.filter((c) => (config.stagesBy.get(c.category) || []).length);
  const requestTypes = config.requestTypes.filter((r) => (config.stagesBy.get(r.workflow) || []).length);
  if (!categories.length) log("  no claim stages found: skipping claims (check claim_stages)");
  const categoryWeights = categories.map((c) => [c, { motor: 45, health: 15, funeral: 15, life: 8, personal: 12, commercial: 5 }[c.category] || 5]);

  function buildTask(client, kind) {
    // Spread over the past year with a gentle upward trend (a growing practice).
    const age = Math.floor(365 * Math.pow(rnd.next(), 1.2));
    const created = Math.min(now - 3 * 3600000, Math.max(client._created + DAY, now - age * DAY - rnd.int(0, 86399) * 1000));
    let category;
    let requestType;
    let stages;
    let provider = null;
    if (kind === "claim") {
      category = rnd.weighted(categoryWeights);
      stages = config.stagesBy.get(category.category);
      provider = providers.length ? providerFor(rnd, providers, category.category) : null;
    } else {
      requestType = rnd.pick(requestTypes);
      stages = config.stagesBy.get(requestType.workflow);
      provider = requestType.requires_provider && providers.length ? rnd.pick(providers) : null;
    }
    const trait = provider ? traits.get(provider.id) : { speed: 1, decline: 0.05, reply: [4, 24], rating: 4 };
    const steps = wf.mainSteps(stages);
    const declined = wf.declinedStage(stages);
    const completed = wf.completedStage(stages) || steps[steps.length - 1];
    const daysOld = (now - created) / DAY;
    const typicalDays = (kind === "claim" ? rnd.num(6, 24) : rnd.num(1, 8)) * trait.speed;
    let outcome;
    if (daysOld > typicalDays * 1.3) outcome = rnd.weighted([["completed", 70], ["declined", kind === "claim" && declined ? trait.decline * 100 : 0], ["cancelled", 5], ["open", 12]]);
    else outcome = rnd.weighted([["open", 80], ["completed", 12], ["cancelled", 3], ["declined", kind === "claim" && declined ? 5 : 0]]);

    let stage;
    let status;
    let closedAt = null;
    let reached;
    if (outcome === "completed") {
      stage = completed;
      status = "completed";
      reached = steps;
      closedAt = Math.max(created + 3600000, Math.min(now - 60000, created + typicalDays * rnd.num(0.6, 1.4) * DAY));
    } else if (outcome === "declined") {
      stage = declined;
      status = "declined";
      reached = steps.slice(0, rnd.int(1, Math.max(1, Math.floor(steps.length / 2))));
      closedAt = Math.max(created + 3600000, Math.min(now - 60000, created + typicalDays * rnd.num(0.3, 0.9) * DAY));
    } else if (outcome === "cancelled") {
      reached = steps.slice(0, rnd.int(1, Math.max(1, steps.length - 2)));
      stage = reached[reached.length - 1];
      status = "cancelled";
      closedAt = Math.max(created + 3600000, Math.min(now - 60000, created + rnd.num(1, 10) * DAY));
    } else {
      const open = steps.filter((s) => !s.is_terminal);
      const index = clamp(Math.floor(open.length * clamp(daysOld / (typicalDays * 1.4), 0.05, 0.95)), 0, Math.max(0, open.length - 1));
      stage = open[index] || steps[0];
      reached = steps.slice(0, steps.indexOf(stage) + 1);
      status = wf.statusForStage(stage);
    }
    const lastMove = closedAt || Math.max(created + 3600000, Math.min(now - 60000, created + (now - created) * rnd.num(0.3, 0.98)));
    const id = rnd.uuid();
    const adviser = client._adviser;
    const policyNumber = provider ? `${provider.reference_prefix || "POL"}${rnd.int(1000000, 9999999)}` : null;
    const rating = kind === "claim" && status === "completed" && rnd.chance(0.7) ? clamp(Math.round(trait.rating + rnd.num(-1.4, 1.2)), 1, 5) : null;
    tasks.push({
      id,
      client_id: client.id,
      task_type: kind === "claim" ? "claim" : requestType.task_type,
      title: kind === "claim" ? `${category.label || category.category} claim` : requestType.label,
      current_stage: stage?.stage_key || null,
      status,
      data: { form: fillForm(rnd, (kind === "claim" ? category : requestType).form_fields, created, category?.category), checklist: {}, client_actions: {} },
      created_at: iso(created),
      updated_at: iso(lastMove),
      provider_id: provider?.id || null,
      claim_category: kind === "claim" ? category.category : null,
      workflow: kind === "claim" ? category.category : requestType.workflow,
      policy_number: policyNumber,
      created_by: adviser.id,
      submitted_at: iso(created),
      closed_at: closedAt ? iso(closedAt) : null,
      client_rating: rating,
      client_review: rating ? rnd.pick(REVIEWS) : null,
    });

    // History: one stage-change update per step reached, spread between creation and the last move.
    const span = Math.max(3600000, lastMove - created);
    const trail = status === "declined" ? [...reached, declined] : reached;
    let waitingSince = null;
    trail.forEach((s, k) => {
      const at = created + (span * (k + 1)) / (trail.length + 0.5);
      const actor = s.actor || "adviser";
      const note =
        s.outcome === "declined" ? rnd.pick(DECLINE_REASONS)
        : k === 0 && kind === "claim" && provider ? `Claim registered with ${provider.organisation_name}. Handler: ${rnd.pick(HANDLERS)}.`
        : s.is_terminal ? (kind === "claim" ? "Claim settled and closed." : "Request completed.")
        : actor === "client" ? "Waiting for the client."
        : actor === "provider" ? `${provider?.organisation_name || "The provider"} completed this step.`
        : "Adviser moved this forward.";
      updates.push({
        id: rnd.uuid(),
        task_id: id,
        stage: s.stage_key,
        note,
        created_by: actor === "adviser" ? adviser.id : null,
        created_at: iso(at),
        actor_type: actor === "provider" ? "provider" : actor === "client" ? "client" : "adviser",
        actor_label: actor === "provider" ? provider?.organisation_name || "Provider" : actor === "client" ? `${client.first_name} ${client.surname}` : adviser.name,
        update_kind: "stage_change",
        visible_to_client: true,
      });
      if (provider && actor === "provider") {
        if (waitingSince === null || rnd.chance(0.5)) {
          const sentAt = at - rnd.num(trait.reply[0], trait.reply[1]) * 3600000;
          events.push({ id: rnd.uuid(), task_id: id, provider_id: provider.id, direction: "sent", event_type: "message", payload: { note: "Please see the latest documents and advise.", by: adviser.name }, created_at: iso(Math.max(created + 60000, sentAt)) });
        }
        events.push({ id: rnd.uuid(), task_id: id, provider_id: provider.id, direction: "received", event_type: s.outcome === "declined" ? "declined" : s.stage_key, payload: { note, by: rnd.pick(HANDLERS) }, created_at: iso(at) });
        waitingSince = at;
      }
    });
    if (provider) {
      const submitted = kind === "claim" ? "claim_submitted" : "request_submitted";
      const ack = kind === "claim" ? "claim_registered" : "request_acknowledged";
      events.push({ id: rnd.uuid(), task_id: id, provider_id: provider.id, direction: "sent", event_type: submitted, payload: { task_type: kind === "claim" ? "claim" : requestType.task_type, claim_category: category?.category || null, policy_number: policyNumber }, created_at: iso(created) });
      events.push({ id: rnd.uuid(), task_id: id, provider_id: provider.id, direction: "received", event_type: ack, payload: kind === "claim" ? { claim_number: `${provider.reference_prefix || "PRV"}-${new Date(created).getFullYear()}-${rnd.int(1000000, 9999999)}`, claims_handler: rnd.pick(HANDLERS) } : { reference: `${provider.reference_prefix || "PRV"}-REQ-${rnd.int(100000, 999999)}` }, created_at: iso(created + 60000) });
      // Open items still waiting on the insurer: our last message has no reply yet.
      if (["open"].includes(status) && rnd.chance(0.35)) {
        events.push({ id: rnd.uuid(), task_id: id, provider_id: provider.id, direction: "sent", event_type: "message", payload: { note: "Any update on this one, please?", by: adviser.name }, created_at: iso(lastMove) });
      }
    }
  }

  for (const c of clients) {
    const claimsFor = c.status === "onboarding" ? (rnd.chance(0.2) ? 1 : 0) : rnd.weighted([[0, 2], [1, 4], [2, 3], [3, 2], [4, 1]]);
    const requestsFor = c.status === "onboarding" ? (rnd.chance(0.4) ? 1 : 0) : rnd.weighted([[0, 2], [1, 4], [2, 3], [3, 1]]);
    if (categories.length) for (let k = 0; k < claimsFor; k += 1) buildTask(c, "claim");
    if (requestTypes.length) for (let k = 0; k < requestsFor; k += 1) buildTask(c, "request");
  }
  const inserted = await store.insert("tasks", tasks, "id, reference");
  const refs = new Map(inserted.map((t) => [t.id, t.reference]));
  await store.insert("task_updates", updates);
  await store.insert("provider_events", events);
  log(`  ${tasks.length} claims and requests, ${updates.length} updates, ${events.length} provider events`);

  // ---------------- reminders (past ones already notified/completed, so nothing fires on seed)
  const rules = new Map(config.rules.map((r) => [r.id, r]));
  const reminders = [];
  const addReminder = (client, ruleId, due) => {
    const rule = rules.get(ruleId);
    if (!rule) return;
    const past = due <= today; // due today counts as already sent, so nothing fires on seeding
    const overdue = past && rnd.chance(0.3);
    reminders.push({
      id: rnd.uuid(),
      client_id: client.id,
      rule_id: rule.id,
      reminder_type: rule.id,
      title: rule.title,
      trigger_date: due,
      anchor_date: due,
      recipient: rule.audience,
      repeat_months: rule.repeat_months,
      recurrence: rule.repeat_months ? `every_${rule.repeat_months}_months` : "once",
      status: past ? (overdue ? "notified" : "completed") : "pending",
      last_sent_at: past ? iso(Date.parse(`${due}T08:00:00+02:00`)) : null,
      completed_at: past && !overdue ? iso(Date.parse(`${due}T08:00:00+02:00`) + rnd.int(0, 6) * DAY) : null,
      created_at: iso(Math.min(now, client._created + DAY)),
    });
  };
  const nextOn = (monthDay, fromDays = 0) => {
    const year = new Date(now).getUTCFullYear();
    for (const y of [year, year + 1]) {
      const d = `${y}-${monthDay}`;
      if (d >= dateOnly(now + fromDays * DAY)) return d;
    }
    return `${year + 1}-${monthDay}`;
  };
  for (const c of clients) {
    if (c.status === "inactive") continue;
    addReminder(c, "birthday", nextOn(c.date_of_birth.slice(5).replace("02-29", "02-28")));
    // Annual review on the anniversary of joining: recent ones are overdue or done, others upcoming.
    const anniversary = c.created_at.slice(5, 10).replace("02-29", "02-28");
    addReminder(c, "annual-review", nextOn(anniversary));
    // About a quarter of clients also have a recent review that came due (most not done yet).
    if (c.status === "active" && rnd.chance(0.4)) {
      const due = dateOnly(now - rnd.int(2, 45) * DAY);
      addReminder(c, "annual-review", due);
      const last = reminders[reminders.length - 1];
      if (rnd.chance(0.7)) Object.assign(last, { status: "notified", completed_at: null });
    }
    if (items.some((it) => it.client_id === c.id && ["property", "vehicle"].includes(it.item_type)) && rnd.chance(0.5)) {
      addReminder(c, "valuation", dateOnly(now + rnd.int(-30, 120) * DAY));
    }
    if (c.occupation === "Retired" && rnd.chance(0.6)) addReminder(c, "retirement-fee", dateOnly(now + rnd.int(-20, 200) * DAY));
  }
  await store.insert("reminders", reminders);

  // ---------------- compliance: screenings and CPD
  const screenings = [];
  for (const c of clients) {
    if (c.status === "onboarding" && rnd.chance(0.6)) continue;
    const at = c._created + rnd.int(1, 25) * DAY;
    screenings.push({ id: rnd.uuid(), client_id: c.id, screening_type: "pep", result: c.is_politically_exposed || rnd.chance(0.02) ? "flagged" : "clear", provider: "Royal Square mock screening", simulated: true, simulated_flag: false, actor_id: c._adviser.id, created_at: iso(at) });
    if (rnd.chance(0.8)) screenings.push({ id: rnd.uuid(), client_id: c.id, screening_type: "terrorism_financing", result: "clear", provider: "Royal Square mock screening", simulated: true, simulated_flag: false, actor_id: c._adviser.id, created_at: iso(at + 3600000) });
  }
  await store.insert("client_screenings", screenings);
  const cycleYear = new Date(now).getUTCMonth() + 1 >= 6 ? new Date(now).getUTCFullYear() : new Date(now).getUTCFullYear() - 1;
  const cycleStart = Date.parse(`${cycleYear}-06-01T00:00:00Z`);
  const cpd = [];
  // Each adviser gets a total somewhere between "just started" and "done" (18 hours).
  advisers.forEach((a, index) => {
    let remaining = [20, 9, 15, 4, 18.5][index % 5];
    while (remaining > 0.25) {
      const hours = round(Math.min(remaining, rnd.num(1, 4)), 0.25);
      remaining -= hours;
      cpd.push({ id: rnd.uuid(), adviser_id: a.id, activity: `${CPD_PREFIX}${rnd.pick(CPD_ACTIVITIES)}`, hours, completed_on: dateOnly(Math.min(now - DAY, cycleStart + rnd.num(0, 1) * (now - cycleStart))) });
    }
  });
  await store.insert("adviser_cpd_records", cpd);

  // ---------------- recent notifications for each adviser (never queued for push)
  const notes = [];
  const recentTasks = tasks.filter((t) => Date.parse(t.updated_at) > now - 21 * DAY);
  for (const t of recentTasks.slice(0, 80)) {
    const client = clients.find((c) => c.id === t.client_id);
    const ref = refs.get(t.id) || "a request";
    const [title, body] =
      t.status === "declined" ? [`${ref} was declined`, `${client.first_name} ${client.surname}'s ${t.title.toLowerCase()} was declined by the insurer.`]
      : t.status === "completed" ? [`${ref} is complete`, `${client.first_name} ${client.surname}'s ${t.title.toLowerCase()} was closed.`]
      : t.status === "awaiting_client" ? [`${ref} needs the client`, `Waiting for ${client.first_name} to complete a step.`]
      : [`Update on ${ref}`, `There's a new update on ${client.first_name} ${client.surname}'s ${t.title.toLowerCase()}.`];
    notes.push({
      id: rnd.uuid(),
      client_id: client.id,
      title,
      body,
      is_read: rnd.chance(0.6),
      related_task_id: t.id,
      created_at: t.updated_at,
      recipient: "advisor",
      advisor_id: client._adviser.id,
      recipient_user_id: client._adviser.id,
      event_key: `${DEMO_EVENT_PREFIX}${t.id}`,
      section: "notifications",
      push_status: "sent",
    });
  }
  await store.insert("notifications", notes);

  const summary = {
    advisers: advisers.map((a) => ({ email: a.email, demo: !a.real, clients: clients.filter((c) => c._adviser.id === a.id).length })),
    clients: clients.length,
    financialItems: items.length,
    goals: goals.length,
    dependants: dependants.length,
    documents: documents.length,
    tasks: tasks.length,
    claims: tasks.filter((t) => t.task_type === "claim").length,
    taskUpdates: updates.length,
    providerEvents: events.length,
    reminders: reminders.length,
    screenings: screenings.length,
    cpdRecords: cpd.length,
    notifications: notes.length,
    demoAdviserPassword: demoAdvisers.length ? (options.demoPassword ? "(the password you gave)" : "random; use --demo-password to sign in as them") : null,
  };
  return summary;
}

// ------------------------------------------------------------------ reset
async function resetDemo(store, options = {}) {
  const log = options.log || (() => {});
  const removed = {};
  const del = async (table, filters) => {
    const n = await store.delete(table, filters);
    removed[table] = (removed[table] || 0) + n;
  };
  const clients = (await store.select("users", "id", [{ col: "contact_email", op: "like", value: `%@${DEMO_DOMAIN}` }, { col: "role_id", op: "eq", value: 1 }])).map((r) => r.id);
  const demoAdvisers = (await store.auth.listUsers()).filter((u) => String(u.email).endsWith(`@${DEMO_DOMAIN}`)).map((u) => u.id);
  if (clients.length) {
    const tasks = (await store.select("tasks", "id", [{ col: "client_id", op: "in", value: clients }])).map((r) => r.id);
    const goals = (await store.select("client_goals", "id", [{ col: "client_id", op: "in", value: clients }])).map((r) => r.id);
    if (tasks.length) {
      await del("provider_events", [{ col: "task_id", op: "in", value: tasks }]);
      await del("task_updates", [{ col: "task_id", op: "in", value: tasks }]);
      await del("task_files", [{ col: "task_id", op: "in", value: tasks }]);
      await del("notifications", [{ col: "related_task_id", op: "in", value: tasks }]);
      await del("reminders", [{ col: "task_id", op: "in", value: tasks }]);
    }
    await del("notifications", [{ col: "client_id", op: "in", value: clients }]);
    await del("reminders", [{ col: "client_id", op: "in", value: clients }]);
    await del("tasks", [{ col: "client_id", op: "in", value: clients }]);
    if (goals.length) await del("goal_participants", [{ col: "goal_id", op: "in", value: goals }]);
    await del("goal_participants", [{ col: "client_id", op: "in", value: clients }]);
    for (const table of ["client_goals", "client_financial_items", "client_dependants", "documents", "client_screenings", "client_messages", "financial_snapshots"]) {
      await del(table, [{ col: "client_id", op: "in", value: clients }]);
    }
    // The compliance audit log is append-only by design. A client someone acted on in the app
    // (e.g. ran a screening) has audit rows, so that client row has to stay.
    const audited = new Set((await store.select("compliance_audit_log", "client_id", [{ col: "client_id", op: "in", value: clients }])).map((r) => r.client_id));
    const removable = clients.filter((id) => !audited.has(id));
    if (removable.length) await del("users", [{ col: "id", op: "in", value: removable }]);
    if (audited.size) log(`  kept ${audited.size} demo client rows that the append-only audit log refers to (their other data was removed)`);
  }
  await del("adviser_cpd_records", [{ col: "activity", op: "like", value: `${CPD_PREFIX}%` }]);
  await del("notifications", [{ col: "event_key", op: "like", value: `${DEMO_EVENT_PREFIX}%` }]);
  if (demoAdvisers.length) {
    await del("notifications", [{ col: "recipient_user_id", op: "in", value: demoAdvisers }]);
    await del("notifications", [{ col: "advisor_id", op: "in", value: demoAdvisers }]);
    await del("push_subscriptions", [{ col: "user_id", op: "in", value: demoAdvisers }]);
    await del("adviser_cpd_records", [{ col: "adviser_id", op: "in", value: demoAdvisers }]);
    await del("adviser_compliance", [{ col: "adviser_id", op: "in", value: demoAdvisers }]);
    const audited = new Set((await store.select("compliance_audit_log", "actor_id", [{ col: "actor_id", op: "in", value: demoAdvisers }])).map((r) => r.actor_id));
    for (const id of demoAdvisers) {
      if (audited.has(id)) {
        log(`  kept demo adviser ${id}: the append-only audit log refers to them`);
        continue;
      }
      await store.auth.deleteUser(id);
      removed["auth users"] = (removed["auth users"] || 0) + 1;
    }
  }
  const demoProviders = (await store.select("users", "id", [{ col: "role_id", op: "eq", value: 2 }, { col: "organisation_name", op: "like", value: "% (demo)" }])).map((r) => r.id);
  if (demoProviders.length) {
    const stillUsed = new Set((await store.select("tasks", "provider_id", [{ col: "provider_id", op: "in", value: demoProviders }])).map((r) => r.provider_id));
    const free = demoProviders.filter((id) => !stillUsed.has(id));
    if (free.length) {
      await del("provider_events", [{ col: "provider_id", op: "in", value: free }]);
      await del("users", [{ col: "id", op: "in", value: free }]);
    }
  }
  return removed;
}

// ------------------------------------------------------------------ CLI
function parseArgs(argv) {
  const get = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");
  return {
    yes: argv.includes("--yes"),
    reset: argv.includes("--reset"),
    fresh: argv.includes("--fresh"),
    clients: get("clients"),
    advisers: get("advisers") ? get("advisers").split(",").map((s) => s.trim()).filter(Boolean) : [],
    demoAdvisers: get("demo-advisers") ?? 2,
    demoPassword: get("demo-password") || process.env.DEMO_ADVISER_PASSWORD || null,
    seed: get("seed") ? Number(get("seed")) : 2026,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.SUPABASE_URL || "(SUPABASE_URL not set)";
  if (!args.yes) {
    console.error(`This writes fictional demo data to ${url}.\nRe-run with --yes to continue (add --reset to remove it, --fresh to redo it).`);
    process.exit(2);
  }
  if (process.env.NODE_ENV === "production" && !process.argv.includes("--allow-production")) {
    console.error("NODE_ENV is production. Demo data doesn't belong there; pass --allow-production if you really mean it.");
    process.exit(2);
  }
  const { supabaseAdmin } = require("../src/config/supabaseClient");
  const store = createSupabaseStore(supabaseAdmin);
  const log = (line) => console.log(line);
  console.log(`Project: ${url}`);
  if (args.reset || args.fresh) {
    console.log("Removing demo data…");
    const removed = await resetDemo(store, { log });
    console.log("Removed:", Object.entries(removed).filter(([, n]) => n).map(([t, n]) => `${t} ${n}`).join(", ") || "nothing");
    if (!args.fresh) return;
  }
  console.log("Adding demo data…");
  const summary = await seedDemo(store, { ...args, log });
  console.log("\nDone:");
  for (const a of summary.advisers) console.log(`  ${a.demo ? "demo adviser" : "adviser     "} ${a.email}: ${a.clients} clients`);
  console.log(`  ${summary.clients} clients · ${summary.claims} claims · ${summary.tasks - summary.claims} requests · ${summary.goals} goals · ${summary.financialItems} FNA items`);
  console.log(`  ${summary.documents} documents · ${summary.reminders} reminders · ${summary.screenings} screenings · ${summary.cpdRecords} CPD entries · ${summary.notifications} notifications`);
  if (summary.demoAdviserPassword) console.log(`  Demo adviser password: ${summary.demoAdviserPassword}`);
  console.log("Remove it all again with: node scripts/seed-demo.js --reset --yes");
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Seeding failed:", error.message);
    process.exit(1);
  });
}

module.exports = { seedDemo, resetDemo, createSupabaseStore, createRandom, idNumber, luhnDigit, parseArgs, DEMO_DOMAIN, DEMO_EVENT_PREFIX, CPD_PREFIX };
