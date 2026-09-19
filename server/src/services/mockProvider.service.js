// The product-provider side of a claim or request. Royal Square confirmed no real
// insurer APIs are available for the hackathon, so:
//   * the insurer's automatic API replies (claim registered, request received) are
//     mocked here and happen straight away on submit, and
//   * everything a person at the insurer does (complete a step, post a weekly
//     update, decline, reply) comes from the provider portal (providerPortal.service.js).
// Every exchange is logged in provider_events so the pass-through is visible in the data.
const crypto = require("crypto");
const { supabaseAdmin } = require("../config/supabaseClient");
const { MOCK_HANDLERS, CLOSED_STATUSES } = require("../constants/taskConfig");
const { moveToStage, stagesFor, addUpdate, patchTask } = require("./workflow.service");
const { declinedStage, mainSteps, providerAction } = require("../utils/workflow");
const { badRequest, conflict } = require("../utils/httpError");

// direction: 'sent' (Royal Square -> provider) or 'received' (provider -> Royal Square).
async function logEvent(task, providerId, direction, eventType, payload) {
  const { error } = await supabaseAdmin.from("provider_events").insert({
    task_id: task.id,
    provider_id: providerId,
    direction,
    event_type: eventType,
    payload,
  });
  if (error) throw new Error(error.message);
}

// Clients see the organisation, not the person at the insurer.
function providerActor(provider, userId = null) {
  return { type: "provider", label: provider?.name || "Product provider", userId };
}

function referenceNumber(provider) {
  const prefix = provider?.reference_prefix || "PRV";
  const digits = crypto.randomInt(1000000, 9999999);
  return `${prefix}-${new Date().getFullYear()}-${digits}`;
}

// What gets "sent" to the insurer: the claim, never the client's wider portfolio.
function outboundPayload(task) {
  return {
    royal_square_reference: task.reference,
    task_type: task.task_type,
    claim_category: task.claim_category,
    policy_number: task.policy_number,
    submitted_at: task.submitted_at,
    fields: Object.keys(task.data?.form || {}),
  };
}

// Claim submitted -> the insurer's system returns a claim number and assigns a
// claims handler (step 1, every category). The handler can be changed in the portal.
async function registerClaim(task, provider) {
  await logEvent(task, provider.id, "sent", "claim_submitted", outboundPayload(task));

  const claimNumber = referenceNumber(provider);
  const handler = MOCK_HANDLERS[crypto.randomInt(0, MOCK_HANDLERS.length)];
  await logEvent(task, provider.id, "received", "claim_registered", {
    claim_number: claimNumber,
    claims_handler: handler,
  });

  const withData = await patchTask(task.id, {
    data: { ...(task.data || {}), provider_reference: claimNumber, claims_handler: handler },
  });

  const stages = await stagesFor(task);
  const first = mainSteps(stages)[0];
  return moveToStage({ ...task, ...withData }, first.stage_key, providerActor(provider), {
    note: `${provider.name} claim number ${claimNumber}. Your claims handler is ${handler}.`,
  });
}

// Request that passes through to a product provider (bank details, beneficiary, IRP5, ...).
async function submitRequest(task, provider) {
  await logEvent(task, provider.id, "sent", "request_submitted", outboundPayload(task));
  const reference = referenceNumber(provider);
  await logEvent(task, provider.id, "received", "request_acknowledged", { reference });

  const withData = await patchTask(task.id, {
    data: { ...(task.data || {}), provider_reference: reference },
  });
  return moveToStage({ ...task, ...withData }, "with_provider", providerActor(provider), {
    note: `${provider.name} received the request. Their reference is ${reference}.`,
  });
}

function cleanText(note) {
  return typeof note === "string" && note.trim() ? note.trim().slice(0, 2000) : null;
}

// The provider completes its next step, or posts an update on a repeating step
// (weekly repair updates). `by` is the person at the provider, for the audit log.
async function respond(task, { note, by } = {}) {
  const provider = task.provider;
  if (!provider) throw badRequest("This request has no product provider");
  if (task.status === "awaiting_client") throw conflict("This step is waiting on the client.");

  const stages = await stagesFor(task);
  const action = providerAction(task, stages);
  if (!action) throw conflict(`Nothing is waiting on ${provider.name} right now.`);

  const actor = providerActor(provider, by?.userId);
  const text = cleanText(note);

  if (action.kind === "update") {
    const update = text || `Update from ${provider.name}: work is progressing as planned.`;
    await logEvent(task, provider.id, "received", "progress_update", { note: update, by: by?.label || null });
    await addUpdate(task, { stage: action.stage.stage_key, note: update, actorType: "provider", actorLabel: provider.name, userId: by?.userId || null, kind: "provider_event" });
    return patchTask(task.id, {});
  }

  await logEvent(task, provider.id, "received", action.stage.stage_key, { note: text, by: by?.label || null });
  return moveToStage(task, action.stage.stage_key, actor, { note: text || action.stage.stage_label });
}

// The provider declines the claim or request. A reason is required: the client sees it.
async function decline(task, { note, by } = {}) {
  const provider = task.provider;
  if (!provider) throw badRequest("This request has no product provider");
  if (CLOSED_STATUSES.includes(task.status) || task.status === "draft") throw conflict("This request is not active");
  const reason = cleanText(note);
  if (!reason) throw badRequest("Give the reason for declining. The client and Royal Square will see it.");

  const stages = await stagesFor(task);
  const declined = declinedStage(stages);
  if (!declined) throw badRequest("This workflow has no declined outcome");
  await logEvent(task, provider.id, "received", "declined", { note: reason, by: by?.label || null });
  return moveToStage(task, declined.stage_key, providerActor(provider, by?.userId), { note: reason });
}

module.exports = { logEvent, providerActor, registerClaim, submitRequest, respond, decline };
