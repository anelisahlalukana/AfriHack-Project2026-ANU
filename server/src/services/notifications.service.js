const { randomUUID } = require("node:crypto");
const { supabaseAdmin } = require("../config/supabaseClient");
const { CLIENT_ROLE_ID } = require("../constants/roles");
const { createPushSender } = require("../utils/pushSender");
const { sendTransactionalEmail } = require("../utils/brevoClient");
const { escapeHtml } = require("../utils/escapeHtml");

// One push sender for this module, built when it loads. It is null when VAPID isn't configured, and a
// client's notification is then the in-app row and the email only. server.js builds its own for the
// reminders module and already reports a bad setup, so this one stays quiet about it.
const push = createPushSender({ warn: false });

// What a device shows for a client notification: the same generic wording reminders.service.js sends,
// so nothing about the client appears on a lock screen. The in-app notification and the email carry the
// detail. Tapping it opens the client's home page.
const PUSH_TITLE = "Royal Square Financial";
const PUSH_BODY = "You have a new update. Open Royal Square to view it.";
const PUSH_URL = "/account";

// A push service answering 404 or 410 is saying the subscription is gone for good.
const GONE_STATUS_CODES = [404, 410];

const emailConfigured = () => Boolean(process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL);

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

// Forgets a device the push service says is gone, so it isn't tried again. Never throws.
async function removeSubscription(authUserId, endpoint) {
  try {
    const { error } = await supabaseAdmin.from("push_subscriptions").delete().eq("user_id", authUserId).eq("endpoint", endpoint);
    if (error) console.error("[notifications] could not remove an expired push subscription:", error.message);
  } catch (err) {
    console.error("[notifications] could not remove an expired push subscription:", err.message);
  }
}

// One device. The endpoint is left out of the logs: it is a capability URL for that device.
async function pushToDevice(authUserId, subscription, payload) {
  try {
    await push({ endpoint: subscription.endpoint, keys: subscription.keys }, payload);
  } catch (err) {
    console.warn(`[notifications] push to one device failed (${err.statusCode || err.message})`);
    if (GONE_STATUS_CODES.includes(err.statusCode)) await removeSubscription(authUserId, subscription.endpoint);
  }
}

// Every device the client has turned push on for. push_subscriptions.user_id is the Supabase auth
// user, which is users.auth_user_id and not the client's own users.id.
async function pushToClient(clientId, authUserId, notificationId) {
  if (!push) return;
  if (!authUserId) {
    console.log(`[notifications] no push for client ${clientId}: they haven't got a login yet`);
    return;
  }

  let subscriptions;
  try {
    const { data, error } = await supabaseAdmin.from("push_subscriptions").select("endpoint, keys").eq("user_id", authUserId);
    if (error) throw new Error(error.message);
    subscriptions = data || [];
  } catch (err) {
    console.error(`[notifications] could not look up push subscriptions for client ${clientId}:`, err.message);
    return;
  }
  if (!subscriptions.length) {
    console.log(`[notifications] no push for client ${clientId}: no device has push turned on`);
    return;
  }

  const payload = { title: PUSH_TITLE, body: PUSH_BODY, tag: notificationId || clientId, url: PUSH_URL };
  await Promise.all(subscriptions.map((subscription) => pushToDevice(authUserId, subscription, payload)));
}

// A short, plain email in the style of the registration invite.
function emailHtml(firstName, body) {
  return `
        <p>${firstName ? `Hi ${escapeHtml(firstName)},` : "Hi,"}</p>
        ${body ? `<p>${escapeHtml(body)}</p>` : ""}
        <p>Sign in to Royal Square Financial to see the details.</p>
      `;
}

async function emailToClient(clientId, client, { title, body }) {
  if (!emailConfigured()) return;
  if (!client.contact_email) {
    console.warn(`[notifications] no email sent to client ${clientId}: no email address on file`);
    return;
  }
  try {
    await sendTransactionalEmail({
      to: client.contact_email,
      toName: client.first_name,
      subject: title,
      htmlContent: emailHtml(client.first_name, body),
    });
  } catch (err) {
    console.error(`[notifications] could not email client ${clientId}:`, err.message);
  }
}

// The push notification and the email that go with a client's in-app notification. Every step is
// caught and logged, so this never rejects: whatever goes wrong here, the notification that is
// already saved stays saved and the action that caused it carries on. When neither channel is
// configured there is nothing to do, and it does no lookups at all.
async function deliverToClient(clientId, { id, title, body }) {
  try {
    if (!push && !emailConfigured()) return;

    const { data: client, error } = await supabaseAdmin
      .from("users")
      .select("auth_user_id, contact_email, first_name")
      .eq("id", clientId)
      .eq("role_id", CLIENT_ROLE_ID)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!client) {
      console.warn(`[notifications] no push or email: client ${clientId} was not found`);
      return;
    }

    // Independent of each other: a failure in one never holds back the other.
    await Promise.all([pushToClient(clientId, client.auth_user_id, id), emailToClient(clientId, client, { title, body })]);
  } catch (err) {
    console.error(`[notifications] could not deliver a push or email to client ${clientId}:`, err.message);
  }
}

// The in-app notification, then (if it was saved) a push to their devices and an email. Those two
// run in the background: a slow push service or mail provider can't hold up, or fail, the caller.
function notifyClient(clientId, { title, body }) {
  if (!clientId) return Promise.resolve(false);
  // Our own id, so the push carries the notification's id as its tag.
  const id = randomUUID();
  return insertNotification({
    id,
    client_id: clientId,
    recipient: "client",
    title,
    body,
  }).then((saved) => {
    if (saved) deliverToClient(clientId, { id, title, body });
    return saved;
  });
}

// Advisers only get the in-app notification.
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

module.exports = { notifyClient, notifyAdviser, deliverToClient };
