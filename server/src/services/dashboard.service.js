const { supabaseAdmin } = require("../config/supabaseClient");
const { CLIENT_ROLE_ID } = require("../constants/roles");
const { DOCUMENT_TYPES, DOCUMENT_TYPE_VALUES, CONSENT_VALIDITY_MONTHS } = require("../constants/documentTypes");
const { CLIENT_STATUSES, ONBOARDING_STATUS } = require("../constants/clientStatuses");
const {
  BUSINESS_TIME_ZONE,
  STALLED_ONBOARDING_DAYS,
  CONSENT_EXPIRY_WARNING_DAYS,
  REMINDER_DUE_SOON_DAYS,
  NEW_CLIENT_WINDOW_DAYS,
  ONBOARDING_LIST_LIMIT,
  RECENT_ACTIVITY_LIMIT,
  UNSIGNED_DOCUMENT_DAYS,
  STALE_TASK_DAYS,
  RISK_WEIGHTS,
  AT_RISK_MIN_SCORE,
  AT_RISK_HIGH_SCORE,
  AT_RISK_LIST_LIMIT,
  CHECK_IN_MAX_REASONS,
} = require("../constants/dashboard");
const { fullName } = require("../utils/fullName");
const { HttpError, notFound, assertUuid } = require("../utils/httpError");
const { notifyClient } = require("./notifications.service");
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

// Each client's compliance documents, keyed by client id then document type.
function groupDocumentsByClient(documents) {
  const docsByClient = new Map();
  for (const doc of documents) {
    if (!docsByClient.has(doc.client_id)) docsByClient.set(doc.client_id, new Map());
    docsByClient.get(doc.client_id).set(doc.document_type, doc);
  }
  return docsByClient;
}
const documentStatus = (docsByClient, clientId, type) => docsByClient.get(clientId)?.get(type)?.status || "not_sent";

// The rows the dashboard and Client Pulse both work from. Passing clientId narrows every read to
// one client, so the Pulse drill-down doesn't load the whole practice. The extra columns (ids,
// names, titles) are read by Client Pulse only; getDashboard ignores them.
async function fetchPracticeData(user, { clientId } = {}) {
  const only = (query, column = "client_id") => (clientId ? query.eq(column, clientId) : query);
  const [clients, goals, documents, reminders, tasks] = await Promise.all([
    fetchAll(() =>
      only(
        supabaseAdmin
          .from("users")
          .select("id, first_name, second_name, surname, status, risk_profile_category, is_politically_exposed, created_at")
          .eq("role_id", CLIENT_ROLE_ID),
        "id"
      ).order("id")
    ),
    fetchAll(() =>
      only(
        supabaseAdmin.from("client_goals").select("id, client_id, goal_name, status, target_amount, current_progress, target_date")
      ).order("id")
    ),
    fetchAll(() =>
      only(
        supabaseAdmin.from("documents").select("client_id, document_type, status, sent_at, signed_at, expires_at")
      ).order("id")
    ),
    fetchAll(() =>
      only(
        supabaseAdmin.from("reminders").select("id, client_id, title, trigger_date").in("status", ["pending", "active"])
      ).order("id")
    ),
    tasksService.listTasks(user, clientId ? { view: "open", clientId } : { view: "open" }),
  ]);
  return { clients, goals, documents, reminders, tasks };
}

// One read-only snapshot of the practice for the advisor dashboard: clients and onboarding,
// paperwork, money under advice, goals, the work queue, reminders and recent activity. It is
// computed on demand so every refresh reflects what is in the database right now.
async function getDashboard(user, now = new Date()) {
  const [practice, items, recent, unread, compliance] = await Promise.all([
    fetchPracticeData(user),
    fetchAll(() => supabaseAdmin.from("client_financial_items").select("client_id, category, amount").order("id")),
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
  const { clients, goals, documents, reminders, tasks } = practice;

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
  const docsByClient = groupDocumentsByClient(ofClients(documents));
  const statusOf = (clientId, type) => documentStatus(docsByClient, clientId, type);

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

// --- Client Pulse ---------------------------------------------------------------------------
// Ranks clients by risk of disengagement from the same rows the dashboard reads. Each signal is
// one thing that is going stale for a client; the weights and thresholds are in constants/dashboard.js.

const CHECK_IN_TITLE = "Your adviser is checking in";

const daysWord = (count) => `${count} day${count === 1 ? "" : "s"}`;
const documentLabel = (type) => DOCUMENT_TYPES.find((d) => d.type === type)?.label || String(type).replaceAll("_", " ");
// trigger_date is a plain date, so both sides are read as UTC midnight and the difference is whole days.
const daysBetweenDates = (from, to) => Math.floor((Date.parse(to) - Date.parse(from)) / DAY_MS);
const riskLevel = (score) => (score > AT_RISK_HIGH_SCORE ? "high" : score > AT_RISK_MIN_SCORE ? "medium" : "low");

function groupBy(rows, keyOf) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return groups;
}

// Every signal that applies to one client. `since` is when it started (null when the data has no date).
function buildSignals(client, { docs, reminders, tasks, goals }, { nowMs, today }) {
  const signals = [];

  for (const doc of docs.values()) {
    if (doc.status !== "sent" || !doc.sent_at) continue;
    const days = daysBetween(doc.sent_at, nowMs);
    if (days < UNSIGNED_DOCUMENT_DAYS) continue;
    const label = documentLabel(doc.document_type);
    signals.push({
      kind: "document",
      reason: `${label} unsigned for ${daysWord(days)}`,
      weight: RISK_WEIGHTS.unsignedDocument,
      since: new Date(doc.sent_at).toISOString(),
      days,
      documentType: doc.document_type,
      label,
    });
  }

  const overdue = reminders
    .filter((r) => r.trigger_date < today)
    .map((r) => ({ id: r.id, title: r.title, triggerDate: r.trigger_date, daysOverdue: daysBetweenDates(r.trigger_date, today) }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
  if (overdue.length) {
    signals.push({
      kind: "reminder",
      reason: `${overdue.length} overdue reminder${overdue.length === 1 ? "" : "s"}`,
      weight: RISK_WEIGHTS.overdueReminder * overdue.length,
      since: `${overdue[0].triggerDate}T00:00:00.000Z`,
      days: overdue[0].daysOverdue,
      reminders: overdue,
    });
  }

  for (const task of tasks) {
    const days = daysBetween(task.updatedAt, nowMs);
    if (days < STALE_TASK_DAYS) continue;
    signals.push({
      kind: "task",
      reason: `Request open ${daysWord(days)} with no update`,
      weight: RISK_WEIGHTS.staleTask,
      since: new Date(task.updatedAt).toISOString(),
      days,
      taskId: task.id,
      reference: task.reference,
      title: task.title,
      typeLabel: task.typeLabel,
      status: task.status,
      waitingOn: task.waitingOn,
    });
  }

  for (const goal of goals) {
    if (goal.status !== "in_progress" || Number(goal.current_progress) > 0) continue;
    signals.push({
      kind: "goal",
      reason: `${goal.goal_name} goal has no progress`,
      weight: RISK_WEIGHTS.stalledGoal,
      since: null,
      days: null,
      goalId: goal.id,
      goalName: goal.goal_name,
      targetAmount: goal.target_amount === null ? null : Number(goal.target_amount),
      currentProgress: Number(goal.current_progress) || 0,
      targetDate: goal.target_date,
    });
  }

  const onboardingDays = daysBetween(client.created_at, nowMs);
  if (client.status === ONBOARDING_STATUS && onboardingDays >= STALLED_ONBOARDING_DAYS) {
    const statuses = DOCUMENT_TYPE_VALUES.map((type) => docs.get(type)?.status || "not_sent");
    signals.push({
      kind: "onboarding",
      reason: `Still in onboarding after ${daysWord(onboardingDays)}`,
      weight: RISK_WEIGHTS.stalledOnboarding,
      since: new Date(client.created_at).toISOString(),
      days: onboardingDays,
      signed: statuses.filter((s) => s === "signed").length,
      awaitingClient: statuses.filter((s) => s === "sent").length,
      notSent: statuses.filter((s) => s === "not_sent").length,
    });
  }

  return signals;
}

// Scores every client (or just options.clientId) from one shared fetch.
async function assessClients(user, now, options) {
  const { clients, goals, documents, reminders, tasks } = await fetchPracticeData(user, options);
  const clock = { nowMs: now.getTime(), today: dateKey(now) };
  const docsByClient = groupDocumentsByClient(documents);
  const goalsByClient = groupBy(goals, (g) => g.client_id);
  const remindersByClient = groupBy(reminders, (r) => r.client_id);
  const tasksByClient = groupBy(tasks, (t) => t.client?.id);

  return clients.map((client) => {
    const signals = buildSignals(
      client,
      {
        docs: docsByClient.get(client.id) || new Map(),
        reminders: remindersByClient.get(client.id) || [],
        tasks: tasksByClient.get(client.id) || [],
        goals: goalsByClient.get(client.id) || [],
      },
      clock
    );
    const score = signals.reduce((total, signal) => total + signal.weight, 0);
    return { id: client.id, name: fullName(client), status: client.status, score, level: riskLevel(score), signals };
  });
}

// Reasons read heaviest first; the drill-down timeline reads oldest first, undated signals last.
const reasonsOf = (assessment) => [...assessment.signals].sort((a, b) => b.weight - a.weight).map((s) => s.reason);
const timelineOf = (assessment) =>
  [...assessment.signals].sort((a, b) => (a.since ?? "9999").localeCompare(b.since ?? "9999"));

// The ranking behind the Client Pulse page: clients above the minimum score, riskiest first.
async function getAtRiskClients(user, now = new Date()) {
  const flagged = (await assessClients(user, now))
    .filter((a) => a.score > AT_RISK_MIN_SCORE)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  return {
    generatedAt: now.toISOString(),
    flaggedTotal: flagged.length,
    limit: AT_RISK_LIST_LIMIT,
    scale: { mediumAbove: AT_RISK_MIN_SCORE, highAbove: AT_RISK_HIGH_SCORE },
    clients: flagged
      .slice(0, AT_RISK_LIST_LIMIT)
      .map((a) => ({ id: a.id, name: a.name, status: a.status, score: a.score, level: a.level, reasons: reasonsOf(a) })),
  };
}

// One client's full signal breakdown for the drill-down. Works for any client, flagged or not,
// so the page still opens if a client drops off the ranking between refreshes.
async function getClientPulse(user, clientId, now = new Date()) {
  assertUuid(clientId, "clientId");
  const [assessment] = await assessClients(user, now, { clientId });
  if (!assessment) throw notFound("Client not found");

  return {
    generatedAt: now.toISOString(),
    client: { id: assessment.id, name: assessment.name, status: assessment.status },
    score: assessment.score,
    level: assessment.level,
    scale: { mediumAbove: AT_RISK_MIN_SCORE, highAbove: AT_RISK_HIGH_SCORE },
    reasons: reasonsOf(assessment),
    signals: timelineOf(assessment),
  };
}

// What the client is told, in their own terms.
const CHECK_IN_PHRASES = {
  document: (s) => `the ${s.label} is waiting for your signature`,
  task: (s) => `your request "${s.title || s.reference}" is still open`,
  reminder: (s) => (s.reminders.length === 1 ? "you have an overdue reminder" : `you have ${s.reminders.length} overdue reminders`),
  goal: (s) => `your "${s.goalName}" goal hasn't started yet`,
  onboarding: () => "your onboarding isn't finished yet",
};

function checkInMessage(signals) {
  const phrases = [...signals]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, CHECK_IN_MAX_REASONS)
    .map((signal) => CHECK_IN_PHRASES[signal.kind](signal));
  const body = phrases.length
    ? `Your adviser wanted to check in: ${phrases.join(", and ")}. Get in touch if you need a hand.`
    : "Your adviser wanted to check in. Get in touch if there is anything you need.";
  return { title: CHECK_IN_TITLE, body };
}

// Sends the client an in-app notification saying why their adviser is reaching out. The text is
// built here from the client's current signals, never taken from the request.
async function sendCheckIn(user, clientId, now = new Date()) {
  const pulse = await getClientPulse(user, clientId, now);
  const { title, body } = checkInMessage(pulse.signals);

  const delivered = await notifyClient(clientId, { title, body });
  if (!delivered) throw new HttpError(502, "The check-in couldn't be sent. Please try again in a moment.");

  return { clientId, clientName: pulse.client.name, title, body, sentAt: now.toISOString() };
}

module.exports = { getDashboard, getAtRiskClients, getClientPulse, sendCheckIn, checkInMessage };
