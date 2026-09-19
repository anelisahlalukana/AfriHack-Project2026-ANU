const { randomUUID } = require("node:crypto");

function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}
function text(value, name, max = 200) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    fail(400, `${name} is required (maximum ${max} characters).`);
  return value.trim();
}
function date(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    fail(400, "Use a valid date in YYYY-MM-DD format.");
  return value;
}
function months(value) {
  if (!Number.isInteger(value) || value < 0 || value > 120)
    fail(400, "Repeat interval must be 0–120 whole months.");
  return value;
}
function audience(value) {
  if (!["client", "adviser", "both"].includes(value))
    fail(400, "Choose client, adviser or both.");
  return value;
}
// Advance from the original date, preserving Jan 31 / Feb 29 anchors across years.
function nextOccurrence(anchor, repeatMonths, after) {
  const start = new Date(`${anchor}T00:00:00Z`);
  for (let offset = repeatMonths; ; offset += repeatMonths) {
    const candidate = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + offset, 1),
    );
    const lastDay = new Date(
      Date.UTC(candidate.getUTCFullYear(), candidate.getUTCMonth() + 1, 0),
    ).getUTCDate();
    candidate.setUTCDate(Math.min(start.getUTCDate(), lastDay));
    const result = candidate.toISOString().slice(0, 10);
    if (result > after) return result;
  }
}
function createService({
  store,
  getUsers,
  checkConsent = async () => ({ valid: false }),
  now = () => new Date(),
  push,
  pushPublicKey = "",
}) {
  const timestamp = () => now().toISOString();
  const today = () =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Johannesburg",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now());
  const adviser = (user) => {
    if (user.role !== "adviser") fail(403, "Adviser access required.");
  };
  async function clientFor(user, clientId) {
    if (user.role !== "adviser" && user.clientId !== clientId)
      fail(403, "You cannot access this client.");
    const client = (await getUsers()).find(
      (u) => u.role === "client" && u.clientId === clientId,
    );
    if (!client) fail(404, "Client not found.");
    return client;
  }
  const visible = (user, r) =>
    user.role === "adviser" ||
    (r.clientId === user.clientId && r.audience !== "adviser");
  function enqueue(
    draft,
    userId,
    eventKey,
    title,
    body,
    section = "notifications",
  ) {
    if (
      draft.notifications.some(
        (n) => n.userId === userId && n.eventKey === eventKey,
      )
    )
      return;
    draft.notifications.push({
      id: randomUUID(),
      userId,
      eventKey,
      title,
      body,
      section,
      createdAt: timestamp(),
      readAt: null,
      deliveredTo: [],
      pushAttempts: 0,
      pushStatus: "pending",
    });
  }
  let ticking = false;
  let flushing = false;
  const service = {
    async clients(user) {
      return (await getUsers())
        .filter(
          (u) =>
            u.role === "client" &&
            (user.role === "adviser" || user.clientId === u.clientId),
        )
        .map(({ clientId, name }) => ({ id: clientId, name }));
    },
    rules() {
      return store.data.rules;
    },
    saveRule(user, input, id) {
      adviser(user);
      const fields = {
        title: text(input.title, "Title"),
        repeatMonths: months(input.repeatMonths),
        audience: audience(input.audience),
        enabled: input.enabled !== false,
      };
      return store.transaction((draft) => {
        if (id) {
          const rule = draft.rules.find((r) => r.id === id);
          if (!rule) fail(404, "Rule not found.");
          Object.assign(rule, fields);
          return rule;
        }
        const rule = { id: randomUUID(), ...fields };
        draft.rules.push(rule);
        return rule;
      });
    },
    reminders(user) {
      return store.data.reminders
        .filter((r) => visible(user, r))
        .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    },
    async addReminder(user, input) {
      adviser(user);
      await clientFor(user, input.clientId);
      const rule = store.data.rules.find(
        (r) => r.id === input.ruleId && r.enabled,
      );
      if (!rule) fail(400, "Select an enabled reminder type.");
      const dueDate = date(input.dueDate);
      const reminder = {
        id: randomUUID(),
        clientId: input.clientId,
        ruleId: rule.id,
        title: rule.title,
        audience: audience(input.audience ?? rule.audience),
        repeatMonths: months(input.repeatMonths ?? rule.repeatMonths),
        dueDate,
        anchorDate: dueDate,
        status: "active",
        lastSentAt: null,
        createdAt: timestamp(),
      };
      store.transaction((draft) => draft.reminders.push(reminder));
      return reminder;
    },
    completeReminder(user, id) {
      return store.transaction((draft) => {
        const reminder = draft.reminders.find(
          (r) => r.id === id && visible(user, r),
        );
        if (!reminder) fail(404, "Reminder not found.");
        // Shared/adviser schedules are managed by the practice, not a client.
        adviser(user);
        reminder.status = "completed";
        reminder.completedAt = timestamp();
        return reminder;
      });
    },
    notifications(user) {
      return store.data.notifications
        .filter((n) => n.userId === user.id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    readNotification(user, id) {
      return store.transaction((draft) => {
        const notification = draft.notifications.find(
          (n) => n.id === id && n.userId === user.id,
        );
        if (!notification) fail(404, "Notification not found.");
        notification.readAt = timestamp();
        return notification;
      });
    },
    async messages(user, clientId) {
      await clientFor(user, clientId);
      return store.data.messages.filter((m) => m.clientId === clientId);
    },
    async sendMessage(user, input) {
      const client = await clientFor(user, input.clientId);
      const body = text(input.body, "Message", 4000);
      const users = await getUsers();
      const recipients =
        user.role === "adviser"
          ? [client]
          : users.filter((u) => u.role === "adviser");
      const message = {
        id: randomUUID(),
        clientId: client.clientId,
        senderId: user.id,
        senderName: user.name,
        senderRole: user.role,
        body,
        createdAt: timestamp(),
      };
      store.transaction((draft) => {
        draft.messages.push(message);
        recipients.forEach((recipient) =>
          enqueue(
            draft,
            recipient.id,
            `message:${message.id}`,
            "New message",
            "You have a new message from Royal Square or your client. Open Messages to read it.",
            "messages",
          ),
        );
      });
      return message;
    },
    // Internal entry point for Dev 2 / Dev 3; never accept arbitrary recipient IDs from a browser.
    async publishEvent({
      eventId,
      clientId,
      type,
      title,
      body,
      audience: target = "both",
    }) {
      text(eventId, "Event ID");
      text(title, "Title");
      text(body, "Body", 1000);
      audience(target);
      if (
        !["claim.stage_changed", "task.updated", "document.expiring"].includes(
          type,
        )
      )
        fail(400, "Unsupported notification event.");
      const users = await getUsers();
      if (!users.some((u) => u.role === "client" && u.clientId === clientId))
        fail(404, "Client not found.");
      const recipients = users.filter(
        (u) =>
          (u.role === "adviser" && target !== "client") ||
          (u.role === "client" &&
            u.clientId === clientId &&
            target !== "adviser"),
      );
      store.transaction((draft) =>
        recipients.forEach((u) =>
          enqueue(draft, u.id, `${type}:${clientId}:${eventId}`, title, body),
        ),
      );
    },
    async tick() {
      if (ticking) return;
      ticking = true;
      try {
        const users = await getUsers();
        const currentDate = today();
        store.transaction((draft) => {
          for (const r of draft.reminders) {
            if (
              r.status !== "active" ||
              r.dueDate > currentDate ||
              !draft.rules.find((rule) => rule.id === r.ruleId)?.enabled
            )
              continue;
            const recipients = users.filter(
              (u) =>
                (u.role === "adviser" && r.audience !== "client") ||
                (u.role === "client" &&
                  u.clientId === r.clientId &&
                  r.audience !== "adviser"),
            );
            if (!recipients.length) continue;
            const client = users.find((u) => u.clientId === r.clientId);
            recipients.forEach((u) =>
              enqueue(
                draft,
                u.id,
                `reminder:${r.id}:${r.dueDate}`,
                r.title,
                `${u.role === "adviser" ? `${client?.name || "Client"} · ` : ""}Due ${r.dueDate}`,
                "reminders",
              ),
            );
            r.lastSentAt = timestamp();
            if (r.repeatMonths)
              r.dueDate = nextOccurrence(
                r.anchorDate,
                r.repeatMonths,
                currentDate,
              );
            else r.status = "notified";
          }
        });
        await service.flushPush();
      } finally {
        ticking = false;
      }
    },
    pushConfig() {
      return {
        enabled: Boolean(push && pushPublicKey),
        publicKey: pushPublicKey,
      };
    },
    subscribe(user, input) {
      if (!push || !pushPublicKey)
        fail(503, "Push is not configured. Set the server VAPID keys first.");
      const endpoint = text(input.endpoint, "Push endpoint", 2048);
      let url;
      try {
        url = new URL(endpoint);
      } catch {
        fail(400, "Invalid push endpoint.");
      }
      const allowed = [
        "fcm.googleapis.com",
        "updates.push.services.mozilla.com",
        "push.services.mozilla.com",
        "web.push.apple.com",
        "notify.windows.com",
      ];
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        (url.port && url.port !== "443") ||
        !allowed.some(
          (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
        )
      )
        fail(400, "Unsupported push service.");
      const keys = input.keys;
      if (
        !keys ||
        typeof keys.p256dh !== "string" ||
        !/^[\w-]{87,88}={0,2}$/.test(keys.p256dh) ||
        typeof keys.auth !== "string" ||
        !/^[\w-]{22}={0,2}$/.test(keys.auth)
      )
        fail(400, "Invalid push subscription keys.");
      store.transaction((draft) => {
        draft.subscriptions = draft.subscriptions.filter(
          (s) => s.endpoint !== endpoint,
        );
        draft.subscriptions.push({
          userId: user.id,
          endpoint,
          keys: { p256dh: keys.p256dh, auth: keys.auth },
        });
      });
      return { subscribed: true };
    },
    unsubscribe(user, endpoint) {
      store.transaction((draft) => {
        draft.subscriptions = draft.subscriptions.filter(
          (s) => !(s.userId === user.id && s.endpoint === endpoint),
        );
      });
    },
    async flushPush() {
      if (!push || flushing) return;
      flushing = true;
      try {
        for (const n of store.data.notifications.filter(
          (n) => n.pushStatus === "pending" && n.pushAttempts < 3,
        )) {
          const subscriptions = store.data.subscriptions.filter(
            (s) => s.userId === n.userId,
          );
          if (!subscriptions.length) continue;
          let failed = false;
          for (const subscription of subscriptions) {
            if (n.deliveredTo.includes(subscription.endpoint)) continue;
            try {
              // No financial, medical, or message content is exposed on the lock screen.
              await push(subscription, {
                title: "Royal Square Financial",
                body: "You have a new update. Open Royal Square to view it.",
                tag: n.id,
                url: "/#notifications",
              });
              store.transaction((draft) =>
                draft.notifications
                  .find((item) => item.id === n.id)
                  .deliveredTo.push(subscription.endpoint),
              );
            } catch (error) {
              if ([404, 410].includes(error.statusCode)) {
                store.transaction((draft) => {
                  draft.subscriptions = draft.subscriptions.filter(
                    (s) => s.endpoint !== subscription.endpoint,
                  );
                });
              } else failed = true;
            }
          }
          store.transaction((draft) => {
            const current = draft.notifications.find(
              (item) => item.id === n.id,
            );
            current.pushAttempts += 1;
            current.pushStatus = failed
              ? current.pushAttempts >= 3
                ? "failed"
                : "pending"
              : "sent";
          });
        }
      } finally {
        flushing = false;
      }
    },
    async financialPull(user, clientId) {
      await clientFor(user, clientId);
      // Dev 2 remains the authority. Fail closed on missing, expired or unavailable consent.
      let consent;
      try {
        consent = await checkConsent(clientId);
      } catch {
        fail(
          503,
          "Consent verification is unavailable. No financial data was pulled.",
        );
      }
      if (
        consent?.valid !== true ||
        !consent.expiresAt ||
        !Number.isFinite(Date.parse(consent.expiresAt)) ||
        Date.parse(consent.expiresAt) <= now().getTime()
      )
        fail(403, "Valid, unexpired client consent is required.");
      const assets = [
        { name: "Mock savings", amount: 85000 },
        { name: "Mock retirement fund", amount: 420000 },
      ];
      const liabilities = [{ name: "Mock vehicle finance", amount: 95000 }];
      const snapshot = {
        id: randomUUID(),
        clientId,
        source: "Ubuntu Demo Financial (fictional provider)",
        simulated: true,
        currency: "ZAR",
        assets,
        liabilities,
        netWorth:
          assets.reduce((s, a) => s + a.amount, 0) -
          liabilities.reduce((s, l) => s + l.amount, 0),
        pulledAt: timestamp(),
      };
      store.transaction((draft) => {
        draft.snapshots = draft.snapshots.filter(
          (s) => s.clientId !== clientId,
        );
        draft.snapshots.push(snapshot);
      });
      return snapshot;
    },
  };
  return service;
}
module.exports = { createService, nextOccurrence };
