// Moves tasks between stages and records every change in task_updates.
// Shared by the tasks service and the mock provider so both follow the same rules.
const { supabaseAdmin } = require("../config/supabaseClient");
const { listStagesByWorkflow, getRequestType } = require("./catalog.service");
const { notifyClient, notifyAdviser } = require("./taskNotifications.service");
const { applyRequestToClient } = require("./requestEffects.service");
const { findStage, statusForStage } = require("../utils/workflow");
const { badRequest } = require("../utils/httpError");
const { clientName } = require("./taskAccess.service");

async function stagesFor(task) {
  const grouped = await listStagesByWorkflow();
  return grouped[task.workflow] || [];
}

async function addUpdate(task, { stage = null, note = null, actorType, actorLabel = null, userId = null, kind, visibleToClient = true }) {
  const { data, error } = await supabaseAdmin
    .from("task_updates")
    .insert({
      task_id: task.id,
      stage,
      note,
      created_by: userId,
      actor_type: actorType,
      actor_label: actorLabel,
      update_kind: kind,
      visible_to_client: visibleToClient,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function patchTask(taskId, fields) {
  const { data, error } = await supabaseAdmin
    .from("tasks")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", taskId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

function taskName(task) {
  return `${task.title || "Your request"} (${task.reference})`;
}

// Moves a task to a stage. actor = { type, label, userId }.
async function moveToStage(task, stageKey, actor, { note = null, visibleToClient = true } = {}) {
  const stages = await stagesFor(task);
  const stage = findStage(stages, stageKey);
  if (!stage) throw badRequest(`'${stageKey}' is not a step in this workflow`);

  const status = statusForStage(stage);
  const closing = ["completed", "declined"].includes(status);
  const updated = await patchTask(task.id, {
    current_stage: stage.stage_key,
    status,
    closed_at: closing ? new Date().toISOString() : null,
  });

  await addUpdate(task, {
    stage: stage.stage_key,
    note,
    actorType: actor.type,
    actorLabel: actor.label,
    userId: actor.userId || null,
    kind: "stage_change",
    visibleToClient,
  });

  const merged = { ...task, ...updated };

  if (status === "completed" && task.task_type !== "claim") {
    const requestType = await getRequestType(task.task_type);
    const summary = await applyRequestToClient(merged, requestType);
    if (summary) {
      await addUpdate(task, { note: summary, actorType: "system", actorLabel: "Royal Square", kind: "message" });
    }
  }

  if (visibleToClient) {
    const title =
      status === "awaiting_client"
        ? `Action needed: ${stage.client_action_label || stage.stage_label}`
        : status === "declined"
          ? `${taskName(merged)} was declined`
          : status === "completed"
            ? `${taskName(merged)} is complete`
            : `${taskName(merged)}: ${stage.stage_label}`;
    await notifyClient(merged, { title, body: note || stage.stage_label });
  }
  if (actor.type !== "adviser") {
    await notifyAdviser(merged, {
      title: `${clientName(merged.client)}: ${stage.stage_label}`,
      body: note || `${taskName(merged)} moved to "${stage.stage_label}".`,
    });
  }

  return merged;
}

module.exports = { stagesFor, addUpdate, patchTask, moveToStage };
