// Provider portal: what an insurer or product provider sees and does. A provider
// login (app_metadata.role = 'provider') only reaches the claims and requests sent
// to its own organisation, and only what it needs to handle them: the policyholder's
// name, the policy number, the claim form, the documents and the steps. Never the
// client's contact details, other products or Royal Square's internal notes.
const { supabaseAdmin } = require("../config/supabaseClient");
const { CLOSED_STATUSES } = require("../constants/taskConfig");
const catalog = require("./catalog.service");
const { TASK_SELECT, resolveProviderAccess, getTaskForProvider } = require("./taskAccess.service");
const { stagesFor, addUpdate, patchTask } = require("./workflow.service");
const mockProvider = require("./mockProvider.service");
const { notifyClient, notifyAdviser } = require("./taskNotifications.service");
const { helpers } = require("./tasks.service");
const wf = require("../utils/workflow");
const { badRequest, conflict } = require("../utils/httpError");

const EVENT_LABELS = {
  claim_submitted: "Claim received from Royal Square",
  request_submitted: "Request received from Royal Square",
  claim_registered: "Claim registered",
  request_acknowledged: "Request acknowledged",
  progress_update: "Progress update",
  handler_changed: "Claims handler changed",
  declined: "Declined",
  message: "Message",
};

function actionFor(task, stages) {
  const action = wf.providerAction(task, stages);
  return action ? { kind: action.kind, label: action.stage.stage_label } : null;
}

// The adviser's list summary, minus what the insurer doesn't need (the client's
// internal id and Royal Square's overdue flag), plus what the insurer has to do.
function providerSummary(task, stages, config, latestEvent) {
  const summary = helpers.summarise(task, stages, config);
  delete summary.overdue;
  const newMessage = latestEvent?.direction === "sent" && latestEvent.event_type === "message";
  return {
    ...summary,
    client: summary.client ? { name: summary.client.name } : null,
    action: actionFor(task, stages),
    newMessage,
  };
}

// The latest provider_events row per task: a message from Royal Square that the
// provider hasn't answered (or acted on since) shows as new.
async function latestEvents(providerId, taskIds) {
  if (!taskIds.length) return new Map();
  const { data, error } = await supabaseAdmin
    .from("provider_events")
    .select("task_id, direction, event_type, created_at")
    .eq("provider_id", providerId)
    .in("task_id", taskIds)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const latest = new Map();
  for (const event of data) if (!latest.has(event.task_id)) latest.set(event.task_id, event);
  return latest;
}

async function getMe(access) {
  return {
    provider: { id: access.provider.id, name: access.provider.name, productLines: access.provider.product_lines || [] },
    user: { name: access.label },
  };
}

// view: action (needs us), waiting (with the client or Royal Square), closed, or all.
async function listTasks(access, { view = "action", kind, q } = {}) {
  let query = supabaseAdmin
    .from("tasks")
    .select(TASK_SELECT)
    .eq("provider_id", access.providerId)
    .neq("status", "draft")
    .order("updated_at", { ascending: false })
    .limit(500);
  if (kind === "claims") query = query.eq("task_type", "claim");
  if (kind === "requests") query = query.neq("task_type", "claim");
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const { stagesByWorkflow, configFor } = await helpers.configMaps();
  const latest = await latestEvents(access.providerId, data.map((t) => t.id));
  const all = data.map((task) => providerSummary(task, stagesByWorkflow[task.workflow] || [], configFor(task), latest.get(task.id)));

  const closed = (t) => CLOSED_STATUSES.includes(t.status);
  const needsUs = (t) => !closed(t) && (Boolean(t.action) || t.newMessage);
  const counts = {
    action: all.filter(needsUs).length,
    waiting: all.filter((t) => !closed(t) && !needsUs(t)).length,
    closed: all.filter(closed).length,
  };

  let tasks = all;
  if (view === "action") tasks = all.filter(needsUs);
  if (view === "waiting") tasks = all.filter((t) => !closed(t) && !needsUs(t));
  if (view === "closed") tasks = all.filter(closed);
  if (q) {
    const text = String(q).toLowerCase().slice(0, 100);
    tasks = tasks.filter((t) =>
      [t.reference, t.providerReference, t.client?.name, t.policyNumber, t.claimsHandler]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(text))
    );
  }
  return { tasks, counts };
}

async function buildDetail(access, task) {
  const stages = await stagesFor(task);
  const config = await catalog.getTaskConfig(task);

  const [updatesResult, filesResult, eventsResult] = await Promise.all([
    // Only step changes, so the timeline shows when each step was reached. Royal
    // Square's notes to the client stay private; the provider's own notes show.
    supabaseAdmin
      .from("task_updates")
      .select("id, stage, note, actor_type, actor_label, update_kind, created_at")
      .eq("task_id", task.id)
      .eq("update_kind", "stage_change")
      .order("created_at", { ascending: true }),
    supabaseAdmin
      .from("task_files")
      .select("id, label, document_key, content_type, size_bytes, actor_type, uploaded_at")
      .eq("task_id", task.id)
      .order("uploaded_at", { ascending: true }),
    supabaseAdmin
      .from("provider_events")
      .select("id, direction, event_type, payload, created_at")
      .eq("task_id", task.id)
      .eq("provider_id", access.providerId)
      .order("created_at", { ascending: true }),
  ]);
  for (const result of [updatesResult, filesResult, eventsResult]) if (result.error) throw new Error(result.error.message);

  const updates = updatesResult.data.map((u) => ({
    ...u,
    note: u.actor_type === "provider" ? u.note : null,
    visible_to_client: true,
  }));
  const events = eventsResult.data;
  const summary = providerSummary(task, stages, config, events.at(-1));
  const active = !CLOSED_STATUSES.includes(task.status);
  const next = wf.nextStage(stages, task.current_stage);

  return {
    ...summary,
    form: task.data?.form || {},
    config: config ? { label: config.label, formFields: config.form_fields, requiredDocuments: config.required_documents } : null,
    stages: wf.mainSteps(stages).map((s) => ({
      key: s.stage_key,
      label: s.stage_label,
      actor: s.actor,
      requiresClientAction: s.requires_client_action,
      repeatable: s.repeatable,
      terminal: s.is_terminal,
    })),
    updates,
    files: filesResult.data,
    documentPack: wf.documentPack(config?.required_documents || [], filesResult.data),
    messages: events
      .filter((e) => e.event_type === "message")
      .map((e) => ({ id: e.id, fromUs: e.direction === "received", note: e.payload?.note || "", by: e.payload?.by || null, createdAt: e.created_at })),
    history: events.map((e) => ({
      id: e.id,
      direction: e.direction,
      label: EVENT_LABELS[e.event_type] || stages.find((s) => s.stage_key === e.event_type)?.stage_label || e.event_type,
      note: e.payload?.note || (e.payload?.claim_number ? `Claim number ${e.payload.claim_number}, handler ${e.payload.claims_handler}` : null),
      by: e.payload?.by || null,
      createdAt: e.created_at,
    })),
    permissions: {
      action: active ? summary.action : null,
      waitingOn: summary.waitingOn,
      // The step after the current one, so the provider can see what it's waiting for.
      nextStep: active && next ? { label: next.stage_label, actor: next.actor } : null,
      canDecline: active,
      canMessage: task.status !== "cancelled",
      canUpload: active,
      canChangeHandler: active && task.task_type === "claim",
    },
  };
}

async function getTask(access, taskId) {
  return buildDetail(access, await getTaskForProvider(access, taskId));
}

function by(access) {
  return { userId: access.userId, label: access.label };
}

// Complete our next step, or post an update on a repeating step.
async function respond(access, taskId, body = {}) {
  const task = await getTaskForProvider(access, taskId);
  const updated = await mockProvider.respond(task, { note: body.note, by: by(access) });
  return buildDetail(access, { ...task, ...updated });
}

async function decline(access, taskId, body = {}) {
  const task = await getTaskForProvider(access, taskId);
  const updated = await mockProvider.decline(task, { note: body.note, by: by(access) });
  return buildDetail(access, { ...task, ...updated });
}

// A message to Royal Square. The adviser sees it as an internal note (not the client).
async function sendMessage(access, taskId, body = {}) {
  const task = await getTaskForProvider(access, taskId);
  if (task.status === "cancelled") throw conflict("This request was cancelled");
  const note = String(body.note).trim().slice(0, 2000);
  await mockProvider.logEvent(task, access.providerId, "received", "message", { note, by: access.label });
  await addUpdate(task, {
    stage: task.current_stage,
    note: `${access.provider.name} (${access.label}): ${note}`,
    actorType: "provider",
    actorLabel: access.provider.name,
    userId: access.userId,
    kind: "message",
    visibleToClient: false,
  });
  const updated = await patchTask(task.id, {});
  await notifyAdviser(task, { title: `${access.provider.name} replied on ${task.reference}`, body: note });
  return buildDetail(access, { ...task, ...updated });
}

// Reassign the claim to another claims handler. The client and adviser are told.
async function changeHandler(access, taskId, body = {}) {
  const task = await getTaskForProvider(access, taskId);
  if (task.task_type !== "claim") throw badRequest("Only claims have a claims handler");
  if (CLOSED_STATUSES.includes(task.status)) throw conflict("This claim is closed");
  const name = String(body.name).trim().slice(0, 120);
  if (name === task.data?.claims_handler) throw badRequest(`${name} is already the claims handler`);

  await mockProvider.logEvent(task, access.providerId, "received", "handler_changed", {
    note: `New claims handler: ${name}`,
    claims_handler: name,
    by: access.label,
  });
  const updated = await patchTask(task.id, { data: { ...(task.data || {}), claims_handler: name } });
  const note = `Your claims handler at ${access.provider.name} is now ${name}.`;
  await addUpdate(task, { stage: task.current_stage, note, actorType: "provider", actorLabel: access.provider.name, userId: access.userId, kind: "provider_event" });
  await notifyClient(task, { title: `New claims handler for ${task.reference}`, body: note });
  await notifyAdviser(task, { title: `${task.reference}: new claims handler`, body: note });
  return buildDetail(access, { ...task, ...updated });
}

// Upload a document (assessment report, settlement letter, policy schedule, ...).
async function uploadFile(access, taskId, file, body = {}) {
  const task = await getTaskForProvider(access, taskId);
  if (CLOSED_STATUSES.includes(task.status)) throw conflict("This request is closed");
  const updated = await helpers.storeTaskFile(task, file, body, mockProvider.providerActor(access.provider, access.userId));
  await notifyAdviser(task, { title: `${access.provider.name} uploaded a document on ${task.reference}`, body: file.originalname });
  return buildDetail(access, { ...task, ...updated });
}

async function getFileUrl(access, taskId, fileId) {
  const task = await getTaskForProvider(access, taskId);
  return helpers.signTaskFile(task, fileId);
}

// Every export takes the signed-in Supabase user (req.user), like tasks.service.js.
function withProvider(fn) {
  return async (user, ...args) => fn(await resolveProviderAccess(user), ...args);
}

module.exports = {
  getMe: withProvider(getMe),
  listTasks: withProvider(listTasks),
  getTask: withProvider(getTask),
  respond: withProvider(respond),
  decline: withProvider(decline),
  sendMessage: withProvider(sendMessage),
  changeHandler: withProvider(changeHandler),
  uploadFile: withProvider(uploadFile),
  getFileUrl: withProvider(getFileUrl),
};
