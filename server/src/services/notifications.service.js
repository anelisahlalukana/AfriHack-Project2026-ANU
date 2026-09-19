const { supabaseAdmin } = require("../config/supabaseClient");

// In-app notifications for document and registration activity. Same insert shape as
// taskNotifications.service.js (which does this for claims and requests), minus related_task_id.
// A failed notification never blocks the action that caused it: it is logged and swallowed.
// Resolves to whether it was saved, for the rare caller (a manual check-in) that must not claim
// success when nothing was sent. Callers that don't care can ignore the result.
async function insertNotification(row) {
  try {
    const { error } = await supabaseAdmin.from("notifications").insert(row);
    if (error) {
      console.error("[notifications] could not save notification:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[notifications] could not save notification:", err.message);
    return false;
  }
}

function notifyClient(clientId, { title, body }) {
  if (!clientId) return Promise.resolve(false);
  return insertNotification({
    client_id: clientId,
    recipient: "client",
    title,
    body,
  });
}

function notifyAdviser(advisorId, clientId, { title, body }) {
  if (!advisorId) return Promise.resolve(false);
  return insertNotification({
    client_id: clientId,
    advisor_id: advisorId,
    recipient: "advisor",
    title,
    body,
  });
}

module.exports = { notifyClient, notifyAdviser };
