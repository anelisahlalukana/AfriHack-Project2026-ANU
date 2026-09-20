const { supabaseAdmin } = require("../config/supabaseClient");
const { CLIENT_ROLE_ID } = require("../constants/roles");
const { DOCUMENT_TYPES, DOCUMENT_TYPE_VALUES, CONSENT_VALIDITY_MONTHS } = require("../constants/documentTypes");
const {
  BUSINESS_TIME_ZONE,
  CONSENT_EXPIRY_WARNING_DAYS,
  REMINDER_DUE_SOON_DAYS,
  UNSIGNED_DOCUMENT_DAYS,
  CLIENT_ACTIVITY_LIMIT,
  CLIENT_GOAL_LIMIT,
  CLIENT_LIST_LIMIT,
  CLIENT_BREAKDOWN_LIMIT,
} = require("../constants/dashboard");
const { fullName } = require("../utils/fullName");
const { forbidden, notFound } = require("../utils/httpError");
const { resolveAccess } = require("./taskAccess.service");
const tasksService = require("./tasks.service");

const DAY_MS = 24 * 60 * 60 * 1000;
const CLOSED = ["completed", "declined", "cancelled"];

const dateKey = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TIME_ZONE }).format(date);
const daysSince = (value, nowMs) => Math.floor((nowMs - new Date(value).getTime()) / DAY_MS);
// trigger_date and target_date are plain dates, so both sides read as UTC midnight and the difference is whole days.
const daysBetweenDates = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
const sum = (rows, pick) => rows.reduce((total, row) => total + (Number(pick(row)) || 0), 0);
const documentLabel = (type) => DOCUMENT_TYPES.find((d) => d.type === type)?.label || String(type).replaceAll("_", " ");
const daysWord = (count) => `${count} day${count === 1 ? "" : "s"}`;

async function result(query) {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

// When a signed Client Consent lapses. The row's own expires_at wins; otherwise it runs
// CONSENT_VALIDITY_MONTHS from signature, the same rule the adviser dashboard applies.
function consentExpiry(row) {
  if (row.expires_at) return new Date(row.expires_at).getTime();
  const date = new Date(row.signed_at);
  date.setMonth(date.getMonth() + CONSENT_VALIDITY_MONTHS);
  return date.getTime();
}

// --- The action centre -------------------------------------------------------------------
// Everything the client personally has to do, from whichever part of the app it came from, as
// one ranked list. 'urgent' is late or blocking, 'soon' has a date coming up, 'info' is a
// suggestion. Each entry carries the link that actually completes it.
const PRIORITY_RANK = { urgent: 0, soon: 1, info: 2 };

function documentActions(documents, nowMs) {
  const actions = [];
  for (const doc of documents) {
    if (doc.status !== "sent") continue;
    const label = documentLabel(doc.document_type);
    const days = doc.sent_at ? daysSince(doc.sent_at, nowMs) : 0;
    actions.push({
      id: `document:${doc.document_type}`,
      kind: "document",
      priority: days >= UNSIGNED_DOCUMENT_DAYS ? "urgent" : "soon",
      title: `Sign your ${label}`,
      detail: days > 0 ? `Sent to you ${daysWord(days)} ago` : "Sent to you today",
      actionLabel: "Open and sign",
      href: "/account/documents",
      days,
    });
  }

  // A lapsed consent stops an adviser acting on the client's behalf, so it is worth its own row.
  const consent = documents.find((doc) => doc.document_type === "client_consent");
  if (consent?.status === "signed" && consent.signed_at) {
    const expiresAt = consentExpiry(consent);
    const expired = expiresAt < nowMs;
    const daysLeft = Math.ceil((expiresAt - nowMs) / DAY_MS);
    if (expired || expiresAt - nowMs <= CONSENT_EXPIRY_WARNING_DAYS * DAY_MS) {
      actions.push({
        id: "consent:renewal",
        kind: "consent",
        priority: expired ? "urgent" : "soon",
        title: expired ? "Your consent has expired" : "Your consent is about to expire",
        detail: expired
          ? "Your adviser can't act on your behalf until you renew it."
          : `It lapses in ${daysWord(daysLeft)}.`,
        actionLabel: "Ask to renew it",
        href: "/account/documents",
        days: Math.abs(daysLeft),
      });
    }
  }
  return actions;
}

function taskActions(tasks, nowMs) {
  const actions = [];
  for (const task of tasks) {
    const name = task.isClaim ? `${task.typeLabel} claim` : task.typeLabel;
    if (task.status === "draft") {
      actions.push({
        id: `task:${task.id}`,
        kind: "draft",
        priority: "soon",
        title: `Finish your ${name}`,
        detail: `Started but not sent yet · ${task.reference}`,
        actionLabel: "Continue",
        href: `/account/claims/${task.id}/continue`,
        days: daysSince(task.createdAt, nowMs),
      });
    } else if (task.status === "awaiting_client") {
      actions.push({
        id: `task:${task.id}`,
        kind: "task",
        priority: "urgent",
        title: task.currentStage?.clientActionLabel || `Your ${name} needs something from you`,
        detail: `${task.reference}${task.provider ? ` · ${task.provider.name}` : ""}`,
        actionLabel: "Do this now",
        href: `/account/tasks/${task.id}`,
        days: daysSince(task.updatedAt, nowMs),
      });
    }
  }
  return actions;
}

function reminderActions(reminders, today) {
  return reminders
    .filter((reminder) => daysBetweenDates(today, reminder.trigger_date) <= REMINDER_DUE_SOON_DAYS)
    .map((reminder) => {
      const days = daysBetweenDates(today, reminder.trigger_date);
      return {
        id: `reminder:${reminder.id}`,
        kind: "reminder",
        priority: days < 0 ? "urgent" : "soon",
        title: reminder.title,
        detail: days < 0 ? `${daysWord(-days)} overdue` : days === 0 ? "Due today" : `Due in ${daysWord(days)}`,
        actionLabel: "View reminder",
        href: "/account/reminders",
        days: Math.abs(days),
      };
    });
}

// Nothing is late, but the client gets more out of the practice by doing these.
function suggestionActions({ financialItems, goals, dependants, status }) {
  const suggestions = [];
  if (!financialItems.length) {
    suggestions.push({
      id: "suggest:fna",
      kind: "advice",
      priority: "info",
      title: "Book your financial needs analysis",
      detail: "Your adviser needs it before they can recommend cover or products.",
      actionLabel: "Ask your adviser",
      href: "/account/claims",
      days: 0,
    });
  } else if (!goals.length) {
    suggestions.push({
      id: "suggest:goals",
      kind: "advice",
      priority: "info",
      title: "Set your first financial goal",
      detail: "Goals are what your adviser plans and reports against.",
      actionLabel: "Ask your adviser",
      href: "/account/claims",
      days: 0,
    });
  }
  if (status !== "onboarding" && !dependants.length) {
    suggestions.push({
      id: "suggest:beneficiaries",
      kind: "advice",
      priority: "info",
      title: "Add your beneficiaries",
      detail: "Without them a claim can be held up while your estate is sorted out.",
      actionLabel: "Open your profile",
      href: "/account/profile",
      days: 0,
    });
  }
  return suggestions;
}

// Late first, then whatever has been waiting longest.
const rankActions = (actions) =>
  actions.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || b.days - a.days);

// --- The overview ------------------------------------------------------------------------

// One read-only snapshot of everything a signed-in client's portal knows about them: what they
// still have to do, how their paperwork is going, their claims and requests, the money and goals
// their adviser recorded for them, their reminders and the latest activity. Computed on demand,
// so every refresh reflects what is in the database right now.
async function getClientOverview(user, now = new Date()) {
  const access = await resolveAccess(user);
  if (access.role !== "client") throw forbidden("The client overview is for client logins.");
  if (!access.clientId) throw notFound("We couldn't find your client profile. Please contact your adviser.");

  const clientId = access.clientId;
  const [client, documents, financialItems, goals, dependants, reminders, notifications, tasks] = await Promise.all([
    supabaseAdmin
      .from("users")
      .select("id, first_name, second_name, surname, status, risk_profile_category, advisor_id, created_at")
      .eq("id", clientId)
      .eq("role_id", CLIENT_ROLE_ID)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) throw new Error(error.message);
        return data;
      }),
    result(
      supabaseAdmin
        .from("documents")
        .select("document_type, status, sent_at, signed_at, expires_at")
        .eq("client_id", clientId)
    ),
    result(
      supabaseAdmin
        .from("client_financial_items")
        .select("category, item_type, description, amount")
        .eq("client_id", clientId)
    ),
    result(
      supabaseAdmin
        .from("client_goals")
        .select("id, goal_name, goal_type, status, target_amount, current_progress, target_date")
        .eq("client_id", clientId)
    ),
    result(supabaseAdmin.from("client_dependants").select("id").eq("client_id", clientId)),
    result(
      supabaseAdmin
        .from("reminders")
        .select("id, title, trigger_date, recipient, status")
        .eq("client_id", clientId)
        .in("recipient", ["client", "both"])
        .in("status", ["pending", "active"])
        .order("trigger_date")
    ),
    result(
      supabaseAdmin
        .from("notifications")
        .select("id, title, body, is_read, created_at, related_task_id")
        .eq("client_id", clientId)
        .eq("recipient", "client")
        .order("created_at", { ascending: false })
        .limit(CLIENT_ACTIVITY_LIMIT)
    ),
    tasksService.listTasks(user, {}),
  ]);
  if (!client) throw notFound("We couldn't find your client profile. Please contact your adviser.");

  const nowMs = now.getTime();
  const today = dateKey(now);

  // --- Paperwork: the same 5 compliance documents the adviser tracks, in the client's words.
  const byType = new Map(documents.map((doc) => [doc.document_type, doc]));
  const steps = DOCUMENT_TYPE_VALUES.map((type) => ({
    documentType: type,
    label: documentLabel(type),
    status: byType.get(type)?.status || "not_sent",
  }));
  const signed = steps.filter((step) => ["signed", "filed"].includes(step.status)).length;

  // --- Claims and requests. Drafts are the client's own unsent work, so they sit apart.
  const openTasks = tasks.filter((task) => !CLOSED.includes(task.status) && task.status !== "draft");

  // --- Money under advice. These rows are the adviser's record of the client, and the portal
  // has never shown them back to the one person who can say they are out of date.
  const assets = financialItems.filter((item) => item.category === "asset");
  const liabilities = financialItems.filter((item) => item.category === "liability");
  const assetTotal = sum(assets, (item) => item.amount);
  const liabilityTotal = sum(liabilities, (item) => item.amount);
  const biggest = (rows) =>
    [...rows]
      .sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0))
      .slice(0, CLIENT_BREAKDOWN_LIMIT)
      .map((item) => ({ label: item.description || item.item_type, amount: Number(item.amount) || 0 }));

  // --- Goals, with how far each one is from its target date.
  const goalRows = goals.map((goal) => {
    const target = Number(goal.target_amount) || 0;
    const progress = Number(goal.current_progress) || 0;
    return {
      id: goal.id,
      name: goal.goal_name,
      type: goal.goal_type,
      status: goal.status,
      targetAmount: target || null,
      currentProgress: progress,
      percent: target > 0 ? Math.min(100, Math.round((progress / target) * 100)) : null,
      targetDate: goal.target_date,
      daysToTarget: goal.target_date ? daysBetweenDates(today, goal.target_date) : null,
      offTrack: Boolean(goal.status === "in_progress" && goal.target_date && goal.target_date < today),
    };
  });
  const openGoals = goalRows.filter((goal) => goal.status === "in_progress");
  const targeted = goalRows.filter((goal) => goal.targetAmount);
  const goalTarget = sum(targeted, (goal) => goal.targetAmount);
  const goalProgress = sum(targeted, (goal) => Math.min(goal.currentProgress, goal.targetAmount));

  const actions = rankActions([
    ...documentActions(documents, nowMs),
    ...taskActions(tasks, nowMs),
    ...reminderActions(reminders, today),
    ...suggestionActions({ financialItems, goals, dependants, status: client.status }),
  ]);

  return {
    generatedAt: now.toISOString(),
    client: {
      id: client.id,
      name: fullName(client),
      firstName: client.first_name,
      status: client.status,
      riskProfile: client.risk_profile_category,
      daysWithUs: daysSince(client.created_at, nowMs),
      hasAdviser: Boolean(client.advisor_id),
    },
    actions: {
      urgent: actions.filter((action) => action.priority === "urgent").length,
      total: actions.length,
      list: actions.slice(0, CLIENT_LIST_LIMIT),
    },
    paperwork: {
      signed,
      total: steps.length,
      percent: Math.round((signed / steps.length) * 100),
      awaitingYou: steps.filter((step) => step.status === "sent").length,
      complete: signed === steps.length,
      steps,
    },
    work: {
      open: openTasks.length,
      awaitingYou: openTasks.filter((task) => task.waitingOn === "client").length,
      withAdviser: openTasks.filter((task) => task.waitingOn === "us").length,
      withProvider: openTasks.filter((task) => task.waitingOn === "provider").length,
      drafts: tasks.filter((task) => task.status === "draft").length,
      settled: tasks.filter((task) => task.status === "completed").length,
      list: openTasks.slice(0, CLIENT_LIST_LIMIT).map((task) => ({
        id: task.id,
        reference: task.reference,
        title: task.isClaim ? `${task.typeLabel} claim` : task.typeLabel,
        status: task.status,
        stage: task.currentStage?.label || null,
        progress: task.progress,
        waitingOn: task.waitingOn,
        provider: task.provider?.name || null,
        updatedAt: task.updatedAt,
      })),
    },
    finances: {
      recorded: financialItems.length > 0,
      assets: assetTotal,
      liabilities: liabilityTotal,
      netWorth: assetTotal - liabilityTotal,
      topAssets: biggest(assets),
      topLiabilities: biggest(liabilities),
    },
    goals: {
      total: goalRows.length,
      inProgress: openGoals.length,
      achieved: goalRows.filter((goal) => goal.status === "achieved").length,
      offTrack: openGoals.filter((goal) => goal.offTrack).length,
      fundedPercent: goalTarget > 0 ? Math.round((goalProgress / goalTarget) * 100) : null,
      totalTarget: goalTarget,
      totalProgress: goalProgress,
      list: [...openGoals]
        .sort((a, b) => (a.daysToTarget ?? Infinity) - (b.daysToTarget ?? Infinity))
        .slice(0, CLIENT_GOAL_LIMIT),
    },
    reminders: {
      overdue: reminders.filter((reminder) => reminder.trigger_date < today).length,
      dueSoon: reminders.filter(
        (reminder) =>
          reminder.trigger_date >= today && daysBetweenDates(today, reminder.trigger_date) <= REMINDER_DUE_SOON_DAYS
      ).length,
      dueSoonDays: REMINDER_DUE_SOON_DAYS,
      list: reminders.slice(0, CLIENT_LIST_LIMIT).map((reminder) => ({
        id: reminder.id,
        title: reminder.title,
        dueDate: reminder.trigger_date,
        daysUntil: daysBetweenDates(today, reminder.trigger_date),
      })),
    },
    activity: {
      unread: notifications.filter((note) => !note.is_read).length,
      recent: notifications.map((note) => ({
        id: note.id,
        title: note.title,
        body: note.body,
        read: Boolean(note.is_read),
        createdAt: note.created_at,
        href: note.related_task_id ? `/account/tasks/${note.related_task_id}` : "/account/reminders",
      })),
    },
  };
}

module.exports = { getClientOverview };
