const { supabaseAdmin } = require("../config/supabaseClient");

// In-app notifications for document and registration activity. Same insert shape as
// taskNotifications.service.js (which does this for claims and requests), minus related_task_id.
// A failed notification never blocks the action that caused it: it is logged and swallowed.
async function insertNotification(row) {
  try {
    const { error } = await supabaseAdmin.from("notifications").insert(row);
    if (error) console.error("[notifications] could not save notification:", error.message);
  } catch (err) {
    console.error("[notifications] could not save notification:", err.message);
  }
}

function notifyClient(clientId, { title, body }) {
  if (!clientId) return Promise.resolve();
  return insertNotification({
    client_id: clientId,
    recipient: "client",
    title,
    body,
  });
}

function notifyAdviser(advisorId, clientId, { title, body }) {
  if (!advisorId) return Promise.resolve();
  return insertNotification({
    client_id: clientId,
    advisor_id: advisorId,
    recipient: "advisor",
    title,
    body,
  });
}

module.exports = { notifyClient, notifyAdviser };
