const { randomUUID } = require("node:crypto");
const { CLIENT_ROLE_ID, PUSH_HOSTS } = require("../constants/reminders");
const { fullName } = require("../utils/fullName");

function fail(status, message) { throw Object.assign(new Error(message), { status }); }
function required(value, label, max = 200) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) fail(400, `${label} is required (maximum ${max} characters).`);
  return value.trim();
}
function interval(value) {
  if (!Number.isInteger(value) || value < 0 || value > 120) fail(400, "Repeat interval must be 0–120 whole months.");
  return value;
}
function audience(value) {
  if (!["client", "adviser", "both"].includes(value)) fail(400, "Choose client, adviser or both.");
  return value;
}
function date(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0,10) !== value) fail(400, "Use a valid date in YYYY-MM-DD format.");
  return value;
}
const ruleView = r => ({ id: r.id, title: r.title, repeatMonths: r.repeat_months, audience: r.audience, enabled: r.enabled });
const reminderView = r => ({ id: r.id, clientId: r.client_id, ruleId: r.rule_id, title: r.title, audience: r.recipient, repeatMonths: r.repeat_months, dueDate: r.trigger_date, anchorDate: r.anchor_date, status: r.status === "pending" ? "active" : r.status, lastSentAt: r.last_sent_at, createdAt: r.created_at });
const notificationView = r => ({ id: r.id, title: r.title, body: r.body, section: r.section, createdAt: r.created_at, readAt: r.is_read ? (r.read_at || r.created_at) : null });
const messageView = r => ({ id: r.id, clientId: r.client_id, senderId: r.sender_id, senderName: r.sender_name, senderRole: r.sender_role, body: r.body, createdAt: r.created_at });

function createSharedService({ db, checkConsent, push, pushPublicKey = "" }) {
  async function result(query) {
    const { data, error } = await query;
    if (error) {
      // Log the real cause: the message below is all a browser gets, and a wrong table, column or
      // function name inside the database looks identical to a missing migration from out here.
      if (["42P01", "42703", "PGRST202", "PGRST204", "PGRST205"].includes(error.code)) {
        console.error(`[Reminders] database schema problem (${error.code}): ${error.message}`);
        fail(503, "Shared database setup is incomplete or out of date. Apply the reminders migrations (202609190010 and 202609190011).");
      }
      throw error;
    }
    return data;
  }
  const adviser = user => { if (user.role !== "adviser") fail(403, "Adviser access required."); };
  async function clientFor(user, id) {
    if (user.role !== "adviser" && user.clientId !== id) fail(403, "You cannot access this client.");
    const client = await result(db.from("users").select("id, first_name, second_name, surname").eq("role_id", CLIENT_ROLE_ID).eq("id", id).maybeSingle());
    if (!client) fail(404, "Client not found.");
    return client;
  }
  function inbox(query, user) {
    // Include notifications created by the claims module using the established schema.
    return user.role === "adviser"
      ? query.or(`recipient_user_id.eq.${user.id},and(recipient_user_id.is.null,advisor_id.eq.${user.id})`)
      : query.eq("client_id", user.clientId).eq("recipient", "client")
        .or(`recipient_user_id.eq.${user.id},recipient_user_id.is.null`);
  }
  const service = {
    async ready() { await result(db.from("reminder_rules").select("id").limit(1)); },
    async clients(user) {
      let query = db.from("users").select("id, first_name, second_name, surname").eq("role_id", CLIENT_ROLE_ID).order("first_name");
      if (user.role !== "adviser") query = query.eq("id", user.clientId);
      return (await result(query)).map(c => ({ id: c.id, name: fullName(c) }));
    },
    async rules() { return (await result(db.from("reminder_rules").select("*").order("title"))).map(ruleView); },
    async saveRule(user, input, id) {
      adviser(user);
      const values = { title: required(input.title, "Title"), repeat_months: interval(input.repeatMonths), audience: audience(input.audience), enabled: input.enabled !== false };
      const query = id ? db.from("reminder_rules").update(values).eq("id", id) : db.from("reminder_rules").insert({ id: randomUUID(), ...values });
      const row = await result(query.select().maybeSingle());
      if (!row) fail(404, "Rule not found.");
      return ruleView(row);
    },
    async reminders(user) {
      let query = db.from("reminders").select("*").order("trigger_date");
      if (user.role !== "adviser") query = query.eq("client_id", user.clientId).in("recipient", ["client", "both"]);
      return (await result(query)).map(reminderView);
    },
    async addReminder(user, input) {
      adviser(user); await clientFor(user, input.clientId);
      const rule = await result(db.from("reminder_rules").select("*").eq("id", input.ruleId).eq("enabled", true).maybeSingle());
      if (!rule) fail(400, "Select an enabled reminder type.");
      const due = date(input.dueDate), repeat = interval(input.repeatMonths ?? rule.repeat_months);
      const row = await result(db.from("reminders").insert({ client_id: input.clientId, rule_id: rule.id, reminder_type: rule.id, title: rule.title, trigger_date: due, anchor_date: due, recipient: audience(input.audience ?? rule.audience), repeat_months: repeat, recurrence: repeat ? `every_${repeat}_months` : "once", status: "pending" }).select().single());
      return reminderView(row);
    },
    async completeReminder(user, id) {
      adviser(user);
      const row = await result(db.from("reminders").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", id).select().maybeSingle());
      if (!row) fail(404, "Reminder not found.");
      return reminderView(row);
    },
    async notifications(user) {
      return (await result(inbox(db.from("notifications").select("*"), user).order("created_at", { ascending: false }))).map(notificationView);
    },
    async readNotification(user, id) {
      const row = await result(inbox(db.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", id), user).select().maybeSingle());
      if (!row) fail(404, "Notification not found.");
      return notificationView(row);
    },
    async messages(user, clientId) {
      await clientFor(user, clientId);
      return (await result(db.from("client_messages").select("*").eq("client_id", clientId).order("created_at"))).map(messageView);
    },
    async sendMessage(user, input) {
      await clientFor(user, input.clientId);
      const row = await result(db.rpc("reminders_send_message", { p_client_id: input.clientId, p_sender_id: user.id, p_sender_name: user.name, p_sender_role: user.role, p_body: required(input.body, "Message", 4000) }));
      return messageView(row);
    },
    async publishEvent({ eventId, clientId, type, title, body, audience: target = "both" }) {
      if (!["claim.stage_changed", "task.updated", "document.expiring"].includes(type)) fail(400, "Unsupported notification event.");
      await result(db.rpc("reminders_publish_event", { p_client_id: clientId, p_event_key: `${type}:${clientId}:${required(eventId, "Event ID")}`, p_title: required(title, "Title"), p_body: required(body, "Body", 1000), p_audience: audience(target) }));
    },
    pushConfig() { return { enabled: Boolean(push && pushPublicKey), publicKey: pushPublicKey }; },
    async subscribe(user, input) {
      if (!push || !pushPublicKey) fail(503, "Push is not configured.");
      const endpoint = required(input.endpoint, "Push endpoint", 2048);
      let url; try { url = new URL(endpoint); } catch { fail(400, "Invalid push endpoint."); }
      if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || !PUSH_HOSTS.some(h => url.hostname === h || url.hostname.endsWith(`.${h}`))) fail(400, "Unsupported push service.");
      if (!/^[\w-]{87,88}={0,2}$/.test(input.keys?.p256dh || "") || !/^[\w-]{22}={0,2}$/.test(input.keys?.auth || "")) fail(400, "Invalid push subscription keys.");
      await result(db.from("push_subscriptions").upsert({ endpoint, user_id: user.id, keys: { p256dh: input.keys.p256dh, auth: input.keys.auth } }, { onConflict: "endpoint" }));
      return { subscribed: true };
    },
    async unsubscribe(user, endpoint) { await result(db.from("push_subscriptions").delete().eq("user_id", user.id).eq("endpoint", endpoint)); },
    // Sending push is independent of firing reminders: a failure in one step must not hold back
    // notifications that are already waiting to be delivered.
    async tick() { try { await result(db.rpc("reminders_run_reminders")); } finally { await service.flushPush(); } },
    async flushPush() {
      if (!push) return;
      for (const n of await result(db.rpc("reminders_claim_push"))) {
        const subscriptions = await result(db.from("push_subscriptions").select("*").eq("user_id", n.recipient_user_id));
        let failed = false;
        const delivered = [...n.delivered_to];
        for (const s of subscriptions) {
          if (delivered.includes(s.endpoint)) continue;
          try {
            await push({ endpoint: s.endpoint, keys: s.keys }, { title: "Royal Square Financial", body: "You have a new update. Open Royal Square to view it.", tag: n.id, url: n.recipient === "advisor" ? "/reminders" : "/account/reminders" });
            delivered.push(s.endpoint);
          } catch (error) {
            if ([404,410].includes(error.statusCode)) await service.unsubscribe({ id: s.user_id }, s.endpoint);
            else failed = true;
          }
        }
        await result(db.from("notifications").update({ delivered_to: delivered, push_status: failed ? (n.push_attempts >= 3 ? "failed" : "pending") : "sent", push_lease_until: null }).eq("id", n.id).eq("push_lease_token", n.push_lease_token));
      }
    },
    async financialPull(user, clientId) {
      await clientFor(user, clientId);
      let consent;
      try { consent = await checkConsent(clientId, user); } catch { fail(503, "Consent verification is unavailable. No financial data was pulled."); }
      if (consent?.valid !== true || !consent.expiresAt || !(Date.parse(consent.expiresAt) > Date.now())) fail(403, "Valid, unexpired client consent is required.");
      // The insurer remains mocked as requested by Royal Square; storage and consent are real.
      const snapshot = { id: randomUUID(), clientId, source: "Ubuntu Demo Financial (fictional provider)", simulated: true, currency: "ZAR", assets: [{ name: "Mock savings", amount: 85000 }, { name: "Mock retirement fund", amount: 420000 }], liabilities: [{ name: "Mock vehicle finance", amount: 95000 }], netWorth: 410000, pulledAt: new Date().toISOString() };
      await result(db.from("financial_snapshots").upsert({ client_id: clientId, data: snapshot, pulled_at: snapshot.pulledAt }, { onConflict: "client_id" }));
      return snapshot;
    },
  };
  return service;
}
module.exports = { createSharedService };
