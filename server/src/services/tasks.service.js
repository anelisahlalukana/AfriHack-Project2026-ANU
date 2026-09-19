// Claims and client requests: one engine for every claim category and request type.
const path = require("path");
const { supabaseAdmin } = require("../config/supabaseClient");
const {
  CLAIM_CATEGORIES,
  CLOSED_STATUSES,
  TASK_FILES_BUCKET,
  SIGNED_URL_TTL_SECONDS,
  MAX_NOTE_LENGTH,
} = require("../constants/taskConfig");
const catalog = require("./catalog.service");
const { getClientForAccess, getTaskForAccess, requireLinkedClient } = require("./taskAccess.service");
const { moveToStage, stagesFor, addUpdate, patchTask } = require("./workflow.service");
const mockProvider = require("./mockProvider.service");
const { notifyClient, notifyAdviser } = require("./taskNotifications.service");
const wf = require("../utils/workflow");
const { badRequest, forbidden, conflict, notFound, assertUuid } = require("../utils/httpError");

const TASK_SELECT =
  "*, clients!inner(id, advisor_id, auth_user_id, first_name, surname, contact_email), providers(id, name, reference_prefix, product_lines)";

function actorFor(access) {
  return {
    type: access.role === "staff" ? "adviser" : "client",
    label: access.label,
    userId: access.userId,
  };
}

function cleanNote(note, { required = false } = {}) {
  if (typeof note !== "string" || !note.trim()) {
    if (required) throw badRequest("Write a message first");
    return null;
  }
  return note.trim().slice(0, MAX_NOTE_LENGTH);
}

function assertActive(task) {
  if (CLOSED_STATUSES.includes(task.status)) throw conflict("This request is closed and can no longer change");
}

async function getProvider(providerId) {
  assertUuid(providerId, "providerId");
  const provider = (await catalog.listProviders()).find((p) => p.id === providerId);
  if (!provider) throw badRequest("Choose a provider from the list");
  return provider;
}

// ---------------------------------------------------------------------------
// Shaping responses
// ---------------------------------------------------------------------------
function summarise(task, stages, config) {
  const current = wf.findStage(stages, task.current_stage);
  const prog = wf.progress(stages, task.current_stage, task.status);
  return {
    id: task.id,
    reference: task.reference,
    title: task.title,
    taskType: task.task_type,
    isClaim: task.task_type === "claim",
    claimCategory: task.claim_category,
    workflow: task.workflow,
    typeLabel: config?.label || task.task_type,
    status: task.status,
    currentStage: current
      ? {
          key: current.stage_key,
          label: current.stage_label,
          actor: current.actor,
          requiresClientAction: current.requires_client_action,
          clientActionKind: current.client_action_kind,
          clientActionLabel: current.client_action_label,
        }
      : null,
    progress: prog,
    waitingOn: wf.waitingOn(task, stages),
    overdue: wf.isOverdue(task, stages),
    client: task.clients
      ? { id: task.clients.id, name: `${task.clients.first_name} ${task.clients.surname}`, linked: Boolean(task.clients.auth_user_id) }
      : null,
    provider: task.providers ? { id: task.providers.id, name: task.providers.name } : null,
    providerReference: task.data?.provider_reference || null,
    claimsHandler: task.data?.claims_handler || null,
    policyNumber: task.policy_number,
    createdAt: task.created_at,
    submittedAt: task.submitted_at,
    updatedAt: task.updated_at,
    closedAt: task.closed_at,
  };
}

async function configMaps() {
  const [claimCategories, requestTypes, stagesByWorkflow] = await Promise.all([
    catalog.listClaimCategories(),
    catalog.listRequestTypes(),
    catalog.listStagesByWorkflow(),
  ]);
  return {
    stagesByWorkflow,
    configFor: (task) =>
      task.task_type === "claim"
        ? claimCategories.find((c) => c.category === task.claim_category)
        : requestTypes.find((t) => t.task_type === task.task_type),
  };
}

// ---------------------------------------------------------------------------
// Listing and detail
// ---------------------------------------------------------------------------
async function listTasks(access, filters = {}) {
  requireLinkedClient(access);
  let query = supabaseAdmin.from("tasks").select(TASK_SELECT).order("updated_at", { ascending: false }).limit(500);
  query = access.role === "staff" ? query.eq("clients.advisor_id", access.userId) : query.eq("client_id", access.clientId);

  if (filters.clientId) {
    assertUuid(filters.clientId, "clientId");
    query = query.eq("client_id", filters.clientId);
  }
  if (filters.kind === "claims") query = query.eq("task_type", "claim");
  if (filters.kind === "requests") query = query.neq("task_type", "claim");
  if (filters.category && CLAIM_CATEGORIES.includes(filters.category)) query = query.eq("claim_category", filters.category);
  if (access.role === "staff") query = query.neq("status", "draft");

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const { stagesByWorkflow, configFor } = await configMaps();
  let tasks = data.map((task) => summarise(task, stagesByWorkflow[task.workflow] || [], configFor(task)));

  if (filters.view === "open") tasks = tasks.filter((t) => !CLOSED_STATUSES.includes(t.status));
  if (filters.view === "closed") tasks = tasks.filter((t) => CLOSED_STATUSES.includes(t.status));
  if (filters.view === "waiting_on_us") tasks = tasks.filter((t) => t.waitingOn === "us");
  if (filters.view === "needs_client") tasks = tasks.filter((t) => t.waitingOn === "client");
  if (filters.view === "overdue") tasks = tasks.filter((t) => t.overdue);
  if (filters.q) {
    const q = String(filters.q).toLowerCase().slice(0, 100);
    tasks = tasks.filter((t) =>
      [t.reference, t.title, t.client?.name, t.providerReference, t.provider?.name]
        .filter(Boolean)
        .some((v) => v.toLowerCase().includes(q))
    );
  }

  // Most urgent first: overdue, then waiting on us, then everything else by last activity.
  const rank = (t) => (t.overdue ? 0 : t.waitingOn === "us" ? 1 : t.waitingOn === "client" ? 2 : 3);
  return tasks.sort((a, b) => rank(a) - rank(b) || new Date(b.updatedAt) - new Date(a.updatedAt));
}

async function getTaskDetail(access, taskId) {
  const task = await getTaskForAccess(access, taskId);
  return buildDetail(access, task);
}

async function buildDetail(access, task) {
  const stages = await stagesFor(task);
  const config = await catalog.getTaskConfig(task);

  let updatesQuery = supabaseAdmin
    .from("task_updates")
    .select("id, stage, note, actor_type, actor_label, update_kind, visible_to_client, created_at")
    .eq("task_id", task.id)
    .order("created_at", { ascending: true });
  if (access.role === "client") updatesQuery = updatesQuery.eq("visible_to_client", true);

  const [{ data: updates, error: uErr }, { data: files, error: fErr }] = await Promise.all([
    updatesQuery,
    supabaseAdmin
      .from("task_files")
      .select("id, label, document_key, content_type, size_bytes, actor_type, uploaded_at")
      .eq("task_id", task.id)
      .order("uploaded_at", { ascending: true }),
  ]);
  if (uErr) throw new Error(uErr.message);
  if (fErr) throw new Error(fErr.message);

  let providerEvents = [];
  if (access.role === "staff") {
    const { data, error } = await supabaseAdmin
      .from("provider_events")
      .select("id, direction, event_type, payload, created_at")
      .eq("task_id", task.id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    providerEvents = data;
  }

  const summary = summarise(task, stages, config);
  const next = wf.nextStage(stages, task.current_stage);
  const current = wf.findStage(stages, task.current_stage);
  const active = !CLOSED_STATUSES.includes(task.status) && task.status !== "draft";

  return {
    ...summary,
    form: task.data?.form || {},
    draftForm: task.status === "draft" ? task.data?.draft_form || {} : undefined,
    checklist: task.data?.checklist || {},
    clientActions: task.data?.client_actions || {},
    review: task.client_rating ? { rating: task.client_rating, text: task.client_review } : null,
    config: config
      ? {
          label: config.label,
          formFields: config.form_fields,
          requiredDocuments: config.required_documents,
          sceneChecklist: config.scene_checklist || [],
          safetyBanner: Boolean(config.safety_banner),
        }
      : null,
    stages: wf.mainSteps(stages).map((s) => ({
      key: s.stage_key,
      label: s.stage_label,
      actor: s.actor,
      requiresClientAction: s.requires_client_action,
      repeatable: s.repeatable,
      terminal: s.is_terminal,
    })),
    updates,
    files,
    documentPack: wf.documentPack(config?.required_documents || [], files),
    providerEvents,
    permissions:
      access.role === "staff"
        ? {
            canUpdate: active,
            canClose: active,
            nextStage: next ? { key: next.stage_key, label: next.stage_label, actor: next.actor, terminal: next.is_terminal } : null,
            canSimulateProvider:
              active &&
              Boolean(task.providers) &&
              task.status !== "awaiting_client" &&
              ((next && next.actor === "provider") || (current?.repeatable && current.actor === "provider")),
          }
        : {
            canMessage: task.status !== "cancelled",
            canUpload: !CLOSED_STATUSES.includes(task.status),
            clientAction:
              task.status === "awaiting_client" && current?.requires_client_action
                ? { kind: current.client_action_kind, label: current.client_action_label, stage: current.stage_key }
                : null,
            canSubmitDraft: task.status === "draft",
          },
  };
}

// ---------------------------------------------------------------------------
// Creating and submitting
// ---------------------------------------------------------------------------
function cleanChecklist(sceneChecklist, checklist = {}) {
  if (checklist === null || typeof checklist !== "object" || Array.isArray(checklist)) return {};
  const clean = {};
  for (const item of sceneChecklist || []) {
    const entry = checklist[item.key];
    if (!entry) continue;
    clean[item.key] = {
      done: Boolean(entry.done),
      note: typeof entry.note === "string" ? entry.note.trim().slice(0, 500) : "",
    };
  }
  return clean;
}

// Creates a claim. Motor claims usually start as a draft (the roadside checklist),
// then the client comes back to fill in the form and submit.
async function createClaim(access, body = {}) {
  const client = await getClientForAccess(access, body.clientId);
  const category = await catalog.getClaimCategory(body.category);
  if (!category) throw badRequest(`Choose a claim type: ${CLAIM_CATEGORIES.join(", ")}`);

  const { data, error } = await supabaseAdmin
    .from("tasks")
    .insert({
      client_id: client.id,
      task_type: "claim",
      claim_category: category.category,
      workflow: category.category,
      title: `${category.label} claim`,
      status: "draft",
      created_by: access.userId,
      data: { checklist: cleanChecklist(category.scene_checklist, body.checklist), client_actions: {} },
    })
    .select(TASK_SELECT)
    .single();
  if (error) throw new Error(error.message);

  if (body.submit) return submitTask(access, data.id, body);
  return buildDetail(access, data);
}

async function updateDraft(access, taskId, body = {}) {
  const task = await getTaskForAccess(access, taskId);
  if (task.status !== "draft") throw conflict("Only a draft can be edited");
  const config = await catalog.getTaskConfig(task);

  const data = { ...(task.data || {}) };
  if (body.checklist) data.checklist = cleanChecklist(config.scene_checklist, body.checklist);
  if (body.form && typeof body.form === "object") data.draft_form = body.form;

  const updated = await patchTask(task.id, {
    data,
    provider_id: body.providerId ? (await getProvider(body.providerId)).id : task.provider_id,
    policy_number: typeof body.policyNumber === "string" ? body.policyNumber.trim().slice(0, 60) || null : task.policy_number,
  });
  return buildDetail(access, { ...task, ...updated });
}

async function createPoliceReminder(task, category, form) {
  if (!category.police_report_hours || form.police_notified || !form.incident_at) return;
  const remindAt = new Date(new Date(form.incident_at).getTime() + category.police_report_hours * 3600 * 1000);
  const { error } = await supabaseAdmin.from("reminders").insert({
    client_id: task.client_id,
    task_id: task.id,
    title: `Report the incident to the police by ${remindAt.toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" })}`,
    reminder_type: "police_report",
    trigger_date: remindAt.toISOString().slice(0, 10),
    remind_at: remindAt.toISOString(),
    recurrence: "once",
    recipient: "client",
    status: "pending",
  });
  if (error) console.error("[tasks] could not create police reminder:", error.message);
}

async function submitTask(access, taskId, body = {}) {
  const task = await getTaskForAccess(access, taskId);
  if (task.status !== "draft") throw conflict("This request has already been submitted");
  const category = await catalog.getClaimCategory(task.claim_category);

  const form = wf.validateForm(category.form_fields, body.form || task.data?.draft_form || {});
  const provider = await getProvider(body.providerId || task.provider_id);
  if (!provider.product_lines?.includes(category.category)) {
    throw badRequest(`${provider.name} does not handle ${category.label.toLowerCase()} claims. Choose another insurer.`);
  }
  const policyNumber = typeof body.policyNumber === "string" ? body.policyNumber.trim().slice(0, 60) : task.policy_number;

  const data = { ...(task.data || {}), form };
  delete data.draft_form;
  const submitted = await patchTask(task.id, {
    data,
    provider_id: provider.id,
    policy_number: policyNumber || null,
    status: "open",
    submitted_at: new Date().toISOString(),
  });
  let current = { ...task, ...submitted, providers: provider };

  await addUpdate(current, {
    note: `${category.label} claim submitted to Royal Square.`,
    actorType: actorFor(access).type,
    actorLabel: actorFor(access).label,
    userId: access.userId,
    kind: "message",
  });
  await createPoliceReminder(current, category, form);
  await notifyAdviser(current, {
    title: `New ${category.label.toLowerCase()} claim from ${current.clients.first_name} ${current.clients.surname}`,
    body: `${current.reference} was submitted and sent to ${provider.name}.`,
  });

  current = await mockProvider.registerClaim(current, provider);
  return buildDetail(access, { ...current, providers: provider });
}

// Non-claim requests are created and submitted in one step.
async function createRequest(access, body = {}) {
  const client = await getClientForAccess(access, body.clientId);
  const requestType = await catalog.getRequestType(body.taskType);
  if (!requestType) throw badRequest("Choose what you need help with");

  const form = wf.validateForm(requestType.form_fields, body.form || {});
  const provider = requestType.requires_provider ? await getProvider(body.providerId) : null;
  const policyNumber = typeof body.policyNumber === "string" ? body.policyNumber.trim().slice(0, 60) : null;

  const { data, error } = await supabaseAdmin
    .from("tasks")
    .insert({
      client_id: client.id,
      task_type: requestType.task_type,
      workflow: requestType.workflow,
      title: requestType.label,
      status: "open",
      provider_id: provider?.id || null,
      policy_number: policyNumber || null,
      created_by: access.userId,
      submitted_at: new Date().toISOString(),
      data: { form, client_actions: {} },
    })
    .select(TASK_SELECT)
    .single();
  if (error) throw new Error(error.message);

  const actor = actorFor(access);
  let current = await moveToStage(data, "submitted", actor, {
    note: access.role === "staff" ? `Logged by ${access.label} on the client's behalf.` : null,
  });
  current = { ...data, ...current };
  if (provider) current = await mockProvider.submitRequest(current, provider);
  return buildDetail(access, { ...data, ...current, providers: provider });
}

// ---------------------------------------------------------------------------
// Working a task
// ---------------------------------------------------------------------------

// Staff: post a note and/or move to a stage. Internal notes stay hidden from the client.
async function postStaffUpdate(access, taskId, body = {}) {
  if (access.role !== "staff") throw forbidden();
  const task = await getTaskForAccess(access, taskId);
  assertActive(task);
  if (task.status === "draft") throw conflict("The client has not submitted this yet");
  const note = cleanNote(body.note);
  const visibleToClient = body.visibleToClient !== false;

  if (body.stageKey && body.stageKey !== task.current_stage) {
    const stages = await stagesFor(task);
    const target = wf.findStage(stages, body.stageKey);
    if (!target) throw badRequest("Choose a step from this workflow");
    if (target.outcome === "declined" || (target.is_terminal && target.outcome === "completed")) {
      throw badRequest("Use Close or Decline to finish a request");
    }
    // Stage changes are always visible to the client; an internal note is kept separately.
    const updated = await moveToStage(task, target.stage_key, actorFor(access), {
      note: visibleToClient ? note : null,
      visibleToClient: true,
    });
    if (note && !visibleToClient) {
      await addUpdate(task, { stage: target.stage_key, note, actorType: "adviser", actorLabel: access.label, userId: access.userId, kind: "message", visibleToClient: false });
    }
    return buildDetail(access, { ...task, ...updated });
  }

  if (!note) throw badRequest("Write a note or choose the next step");
  await addUpdate(task, {
    stage: task.current_stage,
    note,
    actorType: "adviser",
    actorLabel: access.label,
    userId: access.userId,
    kind: "message",
    visibleToClient,
  });
  const updated = await patchTask(task.id, {});
  if (visibleToClient) await notifyClient(task, { title: `New message about ${task.title} (${task.reference})`, body: note });
  return buildDetail(access, { ...task, ...updated });
}

// Client: send a message on their own task.
async function postClientMessage(access, taskId, body = {}) {
  if (access.role !== "client") throw forbidden();
  const task = await getTaskForAccess(access, taskId);
  if (task.status === "cancelled") throw conflict("This request was cancelled");
  const note = cleanNote(body.note, { required: true });
  await addUpdate(task, { stage: task.current_stage, note, actorType: "client", actorLabel: access.label, userId: access.userId, kind: "message" });
  const updated = await patchTask(task.id, {});
  await notifyAdviser(task, { title: `Message from ${access.label} on ${task.reference}`, body: note });
  return buildDetail(access, { ...task, ...updated });
}

// Client: complete the action the current step needs (confirm, pick a date, upload, review).
async function completeClientAction(access, taskId, body = {}) {
  if (access.role !== "client") throw forbidden();
  const task = await getTaskForAccess(access, taskId);
  if (task.status !== "awaiting_client") throw conflict("Nothing is waiting on you for this request");
  const stages = await stagesFor(task);
  const stage = wf.findStage(stages, task.current_stage);
  if (!stage?.requires_client_action) throw conflict("Nothing is waiting on you for this request");

  const kind = stage.client_action_kind;
  const record = { kind, at: new Date().toISOString() };
  let note;

  if (kind === "date") {
    const date = typeof body.date === "string" ? body.date : "";
    const parsed = new Date(`${date}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime())) throw badRequest("Pick a date");
    if (parsed < today) throw badRequest("Pick a date from today onwards");
    record.value = date;
    note = `Chose ${parsed.toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })}.`;
  } else if (kind === "upload") {
    // Only files uploaded since this step started count.
    const { data: stageStart, error: sErr } = await supabaseAdmin
      .from("task_updates")
      .select("created_at")
      .eq("task_id", task.id)
      .eq("stage", stage.stage_key)
      .eq("update_kind", "stage_change")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    const since = stageStart?.created_at || task.submitted_at || task.created_at;
    const { count, error } = await supabaseAdmin
      .from("task_files")
      .select("id", { count: "exact", head: true })
      .eq("task_id", task.id)
      .eq("actor_type", "client")
      .gte("uploaded_at", since);
    if (error) throw new Error(error.message);
    if (!count) throw badRequest("Upload at least one document first");
    record.value = { files: count, since };
    note = "Uploaded the requested documents.";
  } else if (kind === "review") {
    const rating = Number(body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw badRequest("Choose a rating from 1 to 5");
    const review = cleanNote(body.review) || "";
    const data = { ...(task.data || {}), client_actions: { ...(task.data?.client_actions || {}), [stage.stage_key]: { ...record, value: rating } } };
    const updated = await patchTask(task.id, {
      data,
      status: "completed",
      closed_at: new Date().toISOString(),
      client_rating: rating,
      client_review: review || null,
    });
    await addUpdate(task, {
      stage: stage.stage_key,
      note: `Closed with a ${rating}/5 review${review ? `: "${review}"` : "."}`,
      actorType: "client",
      actorLabel: access.label,
      userId: access.userId,
      kind: "client_action",
    });
    await notifyAdviser(task, { title: `${access.label} closed ${task.reference} (${rating}/5)`, body: review || "No written review." });
    return buildDetail(access, { ...task, ...updated });
  } else {
    note = stage.client_action_label ? `Done: ${stage.client_action_label}.` : "Confirmed.";
  }

  const data = { ...(task.data || {}), client_actions: { ...(task.data?.client_actions || {}), [stage.stage_key]: record } };
  const updated = await patchTask(task.id, { data, status: "open" });
  await addUpdate(task, { stage: stage.stage_key, note, actorType: "client", actorLabel: access.label, userId: access.userId, kind: "client_action" });
  await notifyAdviser(task, { title: `${access.label} completed a step on ${task.reference}`, body: `${stage.stage_label}: ${note}` });
  return buildDetail(access, { ...task, ...updated });
}

// Staff: finish a task. Claims go to the client review step; requests complete (and update the client record).
async function closeTask(access, taskId, body = {}) {
  if (access.role !== "staff") throw forbidden();
  const task = await getTaskForAccess(access, taskId);
  assertActive(task);
  if (task.status === "draft") throw conflict("The client has not submitted this yet");
  const stages = await stagesFor(task);
  const note = cleanNote(body.note);

  const target = body.outcome === "declined" ? wf.declinedStage(stages) : wf.completedStage(stages);
  if (!target) throw badRequest("This workflow has no closing step");
  const updated = await moveToStage(task, target.stage_key, actorFor(access), {
    note: note || (body.outcome === "declined" ? "Declined." : target.requires_client_action ? "Ready for your review." : "Completed."),
  });
  return buildDetail(access, { ...task, ...updated });
}

async function cancelDraft(access, taskId) {
  const task = await getTaskForAccess(access, taskId);
  if (task.status !== "draft") throw conflict("Only a draft can be discarded");
  const updated = await patchTask(task.id, { status: "cancelled", closed_at: new Date().toISOString() });
  return buildDetail(access, { ...task, ...updated });
}

async function simulateProvider(access, taskId, body = {}) {
  if (access.role !== "staff") throw forbidden();
  const task = await getTaskForAccess(access, taskId);
  const updated = await mockProvider.simulateProviderEvent(task, { decline: Boolean(body.decline), note: body.note });
  return buildDetail(access, { ...task, ...updated });
}

// ---------------------------------------------------------------------------
// Files (private bucket, short-lived signed URLs)
// ---------------------------------------------------------------------------
function safeFileName(name) {
  const ext = path.extname(name || "").toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 8);
  const base = path.basename(name || "file", path.extname(name || "")).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60);
  return `${base || "file"}${ext}`;
}

async function uploadFile(access, taskId, file, body = {}) {
  if (!file) throw badRequest("Choose a file to upload");
  const task = await getTaskForAccess(access, taskId);
  if (CLOSED_STATUSES.includes(task.status)) throw conflict("This request is closed");

  const config = await catalog.getTaskConfig(task);
  const docKey = typeof body.documentKey === "string" ? body.documentKey : null;
  const docConfig = (config?.required_documents || []).find((d) => d.key === docKey) || null;
  const label = docConfig?.label || (typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 120) : file.originalname);

  const storagePath = `${task.client_id}/${task.id}/${Date.now()}-${safeFileName(file.originalname)}`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(TASK_FILES_BUCKET)
    .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false });
  if (uploadError) throw new Error(uploadError.message);

  const actor = actorFor(access);
  const { error } = await supabaseAdmin.from("task_files").insert({
    task_id: task.id,
    file_url: storagePath,
    file_type: file.mimetype.split("/")[0],
    label,
    document_key: docConfig ? docConfig.key : null,
    content_type: file.mimetype,
    size_bytes: file.size,
    uploaded_by: access.userId,
    actor_type: actor.type,
  });
  if (error) throw new Error(error.message);

  if (task.status !== "draft") {
    await addUpdate(task, { stage: task.current_stage, note: `Uploaded: ${label}`, actorType: actor.type, actorLabel: actor.label, userId: access.userId, kind: "file" });
  }
  const updated = await patchTask(task.id, {});
  return buildDetail(access, { ...task, ...updated });
}

async function getFileUrl(access, taskId, fileId) {
  const task = await getTaskForAccess(access, taskId);
  assertUuid(fileId, "file id");
  const { data, error } = await supabaseAdmin
    .from("task_files")
    .select("file_url")
    .eq("id", fileId)
    .eq("task_id", task.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw notFound("File not found");
  const { data: signed, error: signError } = await supabaseAdmin.storage
    .from(TASK_FILES_BUCKET)
    .createSignedUrl(data.file_url, SIGNED_URL_TTL_SECONDS);
  if (signError) throw new Error(signError.message);
  return signed.signedUrl;
}

module.exports = {
  listTasks,
  getTaskDetail,
  createClaim,
  updateDraft,
  submitTask,
  createRequest,
  postStaffUpdate,
  postClientMessage,
  completeClientAction,
  closeTask,
  cancelDraft,
  simulateProvider,
  uploadFile,
  getFileUrl,
};
