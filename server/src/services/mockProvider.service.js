// Simulated product-provider integration. Royal Square confirmed no real insurer
// APIs are available for the hackathon, so every exchange is mocked, but each one
// is logged in provider_events so the pass-through is visible in the data.
const crypto = require("crypto");
const { supabaseAdmin } = require("../config/supabaseClient");
const { MOCK_HANDLERS } = require("../constants/taskConfig");
const { moveToStage, stagesFor, addUpdate, patchTask } = require("./workflow.service");
const { findStage, nextStage, declinedStage, mainSteps } = require("../utils/workflow");
const { badRequest } = require("../utils/httpError");

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

function providerActor(provider) {
  return { type: "provider", label: provider?.name || "Product provider" };
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

// Claim submitted -> insurer returns a claim number and a claims handler (step 1, every category).
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

// Demo control: the insurer pushes the next update it is responsible for
// (authorisation, weekly repair update, payment, decline).
async function simulateProviderEvent(task, { decline = false, note } = {}) {
  const provider = task.providers;
  if (!provider) throw badRequest("This request has no product provider");
  if (["completed", "declined", "cancelled", "draft"].includes(task.status)) {
    throw badRequest("This request is not active");
  }

  const stages = await stagesFor(task);
  const actor = providerActor(provider);
  const cleanNote = typeof note === "string" && note.trim() ? note.trim().slice(0, 2000) : null;

  if (decline) {
    const declined = declinedStage(stages);
    await logEvent(task, provider.id, "received", "declined", { note: cleanNote });
    return moveToStage(task, declined.stage_key, actor, {
      note: cleanNote || `${provider.name} declined this ${task.task_type === "claim" ? "claim" : "request"}.`,
    });
  }

  const current = findStage(stages, task.current_stage);
  const next = nextStage(stages, task.current_stage);

  // A repeatable provider step (weekly repair updates) posts an update without moving on,
  // unless the provider's next step is also theirs and the adviser asked to advance.
  if (current?.repeatable && current.actor === "provider" && (!next || next.actor !== "provider")) {
    const update = cleanNote || `Weekly update from ${provider.name}: work is progressing as planned.`;
    await logEvent(task, provider.id, "received", "progress_update", { note: update });
    await addUpdate(task, { stage: current.stage_key, note: update, actorType: "provider", actorLabel: provider.name, kind: "provider_event" });
    return patchTask(task.id, {});
  }

  if (task.status === "awaiting_client") {
    throw badRequest("This step is waiting on the client before the provider can respond.");
  }
  if (!next || next.actor !== "provider") {
    const who = next ? (next.actor === "client" ? "the client" : "Royal Square") : "nobody";
    throw badRequest(`The next step is for ${who}, not ${provider.name}.`);
  }

  await logEvent(task, provider.id, "received", next.stage_key, { note: cleanNote });
  return moveToStage(task, next.stage_key, actor, { note: cleanNote || next.stage_label });
}

module.exports = { registerClaim, submitRequest, simulateProviderEvent };
