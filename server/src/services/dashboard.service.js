const { supabaseAdmin } = require("../config/supabaseClient");
const { CLIENT_ROLE_ID } = require("../constants/roles");
const { DOCUMENT_TYPE_VALUES, CONSENT_VALIDITY_MONTHS } = require("../constants/documentTypes");
const { CLIENT_STATUSES, ONBOARDING_STATUS } = require("../constants/clientStatuses");
const {
  BUSINESS_TIME_ZONE,
  STALLED_ONBOARDING_DAYS,
  CONSENT_EXPIRY_WARNING_DAYS,
  REMINDER_DUE_SOON_DAYS,
  NEW_CLIENT_WINDOW_DAYS,
  ONBOARDING_LIST_LIMIT,
  RECENT_ACTIVITY_LIMIT,
} = require("../constants/dashboard");
const { fullName } = require("../utils/fullName");
const tasksService = require("./tasks.service");

const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 1000; // PostgREST returns at most this many rows per request.

// Reads every row of a query, a page at a time, so a growing practice never gets silently cut off.
async function fetchAll(buildQuery) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
}

const sum = (rows, pick) => rows.reduce((total, row) => total + (Number(pick(row)) || 0), 0);
const daysBetween = (from, to) => Math.floor((to - new Date(from).getTime()) / DAY_MS);
const dateKey = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE }).format(date);

function consentExpiry(row) {
  if (row.expires_at) return new Date(row.expires_at).getTime();
  const date = new Date(row.signed_at);
  date.setMonth(date.getMonth() + CONSENT_VALIDITY_MONTHS);
  return date.getTime();
}

// One read-only snapshot of the practice for the advisor dashboard: clients and onboarding,
// paperwork, money under advice, goals, the work queue, reminders and recent activity. It is
// computed on demand so every refresh reflects what is in the database right now.
async function getDashboard(user, now = new Date()) {
  const [clients, items, goals, documents, reminders, tasks, recent, unread, compliance] = await Promise.all([
    fetchAll(() =>
      supabaseAdmin
        .from("users")
        .select("id, first_name, second_name, surname, status, risk_profile_category, is_politically_exposed, created_at")
        .eq("role_id", CLIENT_ROLE_ID)
        .order("id")
    ),
    fetchAll(() => supabaseAdmin.from("client_financial_items").select("client_id, category, amount").order("id")),
    fetchAll(() =>
      supabaseAdmin.from("client_goals").select("client_id, status, target_amount, current_progress, target_date").order("id")
    ),
    fetchAll(() =>
      supabaseAdmin.from("documents").select("client_id, document_type, status, sent_at, signed_at, expires_at").order("id")
    ),
    fetchAll(() =>
      supabaseAdmin.from("reminders").select("trigger_date").in("status", ["pending", "active"]).order("id")
    ),
    tasksService.listTasks(user, { view: "open" }),
    supabaseAdmin
      .from("notifications")
      .select("id, title, body, is_read, created_at, client_id")
      .eq("advisor_id", user.id)
      .order("created_at", { ascending: false })
      .limit(RECENT_ACTIVITY_LIMIT),
    supabaseAdmin
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("advisor_id", user.id)
      .eq("is_read", false),
    supabaseAdmin
      .from("adviser_compliance")
      .select("qualification_status, cpd_status")
      .eq("adviser_id", user.id)
      .maybeSingle(),
  ]);
  for (const { error } of [recent, unread, compliance]) if (error) throw new Error(error.message);

  const nowMs = now.getTime();
  const clientIds = new Set(clients.map((c) => c.id));
  const ofClients = (rows) => rows.filter((row) => clientIds.has(row.client_id));

  // --- Clients
  const byStatus = Object.fromEntries(CLIENT_STATUSES.map((status) => [status, 0]));
  const riskMix = { not_assessed: 0 };
  for (const client of clients) {
    byStatus[client.status] = (byStatus[client.status] || 0) + 1;
    const risk = client.risk_profile_category || "not_assessed";
    riskMix[risk] = (riskMix[risk] || 0) + 1;
  }

  // --- Money under advice. Clients with no financial items haven't had their needs analysis yet.
  const financialItems = ofClients(items);
  const assets = sum(financialItems.filter((i) => i.category === "asset"), (i) => i.amount);
  const liabilities = sum(financialItems.filter((i) => i.category === "liability"), (i) => i.amount);
  const withFinancials = new Set(financialItems.map((i) => i.client_id));

  // --- Goals
  const clientGoals = ofClients(goals);
  const openGoals = clientGoals.filter((g) => g.status === "in_progress");
  const targeted = clientGoals.filter((g) => Number(g.target_amount) > 0);
  const totalTarget = sum(targeted, (g) => g.target_amount);
  const totalProgress = sum(targeted, (g) => Math.min(Number(g.current_progress) || 0, Number(g.target_amount)));
  const today = dateKey(now);

  // --- Paperwork: each client's 5 compliance documents.
  const docsByClient = new Map();
  for (const doc of ofClients(documents)) {
    if (!docsByClient.has(doc.client_id)) docsByClient.set(doc.client_id, new Map());
    docsByClient.get(doc.client_id).set(doc.document_type, doc);
  }
  const statusOf = (clientId, type) => docsByClient.get(clientId)?.get(type)?.status || "not_sent";

  let awaitingSignature = 0;
  let oldestWaitingDays = 0;
  let completeClients = 0;
  let consentsExpired = 0;
  let consentsExpiringSoon = 0;
  for (const client of clients) {
    const statuses = DOCUMENT_TYPE_VALUES.map((type) => statusOf(client.id, type));
    if (statuses.every((s) => s === "signed")) completeClients += 1;
    for (const type of DOCUMENT_TYPE_VALUES) {
      const doc = docsByClient.get(client.id)?.get(type);
      if (doc?.status === "sent") {
        awaitingSignature += 1;
        if (doc.sent_at) oldestWaitingDays = Math.max(oldestWaitingDays, daysBetween(doc.sent_at, nowMs));
      }
    }
    const consent = docsByClient.get(client.id)?.get("client_consent");
    if (consent?.status === "signed" && consent.signed_at) {
      const expiresAt = consentExpiry(consent);
      if (expiresAt < nowMs) consentsExpired += 1;
      else if (expiresAt - nowMs <= CONSENT_EXPIRY_WARNING_DAYS * DAY_MS) consentsExpiringSoon += 1;
    }
  }

  // --- Onboarding pipeline, oldest first.
  const onboarding = clients
    .filter((c) => c.status === ONBOARDING_STATUS)
    .map((c) => {
      const statuses = DOCUMENT_TYPE_VALUES.map((type) => statusOf(c.id, type));
      const days = daysBetween(c.created_at, nowMs);
      return {
        id: c.id,
        name: fullName(c),
        days,
        stalled: days >= STALLED_ONBOARDING_DAYS,
        signed: statuses.filter((s) => s === "signed").length,
        awaitingClient: statuses.filter((s) => s === "sent").length,
        notSent: statuses.filter((s) => s === "not_sent").length,
      };
    })
    .sort((a, b) => b.days - a.days);

  // --- Reminders (trigger_date is a plain date, compared as YYYY-MM-DD in the business time zone).
  const dueSoonCutoff = dateKey(new Date(nowMs + REMINDER_DUE_SOON_DAYS * DAY_MS));

  return {
    generatedAt: now.toISOString(),
    clients: {
      total: clients.length,
      byStatus,
      newInWindow: clients.filter((c) => nowMs - new Date(c.created_at).getTime() <= NEW_CLIENT_WINDOW_DAYS * DAY_MS).length,
      newWindowDays: NEW_CLIENT_WINDOW_DAYS,
      politicallyExposed: clients.filter((c) => c.is_politically_exposed).length,
      noFinancialAnalysis: clients.filter((c) => !withFinancials.has(c.id)).length,
      riskMix,
    },
    portfolio: { assets, liabilities, netWorth: assets - liabilities },
    goals: {
      inProgress: openGoals.length,
      pastTargetDate: openGoals.filter((g) => g.target_date && g.target_date < today).length,
      totalTarget,
      totalProgress,
      fundedPercent: totalTarget > 0 ? Math.round((totalProgress / totalTarget) * 100) : null,
    },
    documents: {
      awaitingSignature,
      oldestWaitingDays,
      completeClients,
      missingForOnboarding: onboarding.reduce((total, c) => total + c.notSent, 0),
      consentsExpired,
      consentsExpiringSoon,
      consentWarningDays: CONSENT_EXPIRY_WARNING_DAYS,
    },
    onboarding: {
      total: onboarding.length,
      stalled: onboarding.filter((c) => c.stalled).length,
      stalledAfterDays: STALLED_ONBOARDING_DAYS,
      clients: onboarding.slice(0, ONBOARDING_LIST_LIMIT),
    },
    work: {
      open: tasks.length,
      waitingOnUs: tasks.filter((t) => t.waitingOn === "us").length,
      waitingOnClients: tasks.filter((t) => t.waitingOn === "client").length,
      overdue: tasks.filter((t) => t.overdue).length,
    },
    reminders: {
      overdue: reminders.filter((r) => r.trigger_date < today).length,
      dueSoon: reminders.filter((r) => r.trigger_date >= today && r.trigger_date <= dueSoonCutoff).length,
      dueSoonDays: REMINDER_DUE_SOON_DAYS,
    },
    activity: {
      unread: unread.count || 0,
      recent: recent.data.map((n) => ({ id: n.id, title: n.title, body: n.body, read: Boolean(n.is_read), createdAt: n.created_at })),
    },
    compliance: compliance.data
      ? { qualificationStatus: compliance.data.qualification_status, cpdStatus: compliance.data.cpd_status }
      : null,
  };
}

module.exports = { getDashboard };
