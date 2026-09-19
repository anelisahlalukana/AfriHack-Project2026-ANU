const { supabaseAdmin } = require("../config/supabaseClient");

// Writes in-app notifications for claim and request activity.
// Reminders & Notifications (Dev 4) can layer push delivery on top of these rows.
// A failed notification never blocks the task change that caused it.
async function insertNotification(row) {
  const { error } = await supabaseAdmin.from("notifications").insert(row);
  if (error) console.error("[taskNotifications] could not save notification:", error.message);
}

function notifyClient(task, { title, body }) {
  return insertNotification({
    client_id: task.client_id,
    recipient: "client",
    title,
    body,
    related_task_id: task.id,
  });
}

function notifyAdviser(task, { title, body }) {
  const advisorId = task.clients?.advisor_id;
  if (!advisorId) return Promise.resolve();
  return insertNotification({
    client_id: task.client_id,
    advisor_id: advisorId,
    recipient: "advisor",
    title,
    body,
    related_task_id: task.id,
  });
}

module.exports = { notifyClient, notifyAdviser };
