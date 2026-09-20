const webpush = require("web-push");

// Builds the function that sends one Web Push message, from the VAPID settings in the environment:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT (a contact such as mailto:you@example.com).
// Returns push(subscription, payload), or null when push isn't set up, so callers just check for it.
// Generate a key pair with `npm run push:keys`.
//
// The two warnings are the ones server.js has always logged: one when the settings are invalid, one
// when only some of the three are set. With none set nothing is said, because that is a normal
// "push is off" setup. `warn: false` is for a second caller that would only repeat them.
function createPushSender({ warn = true } = {}) {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;

  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT) {
    try {
      webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
      return (subscription, payload) =>
        webpush.sendNotification(subscription, JSON.stringify(payload), {
          TTL: 86400,
          timeout: 10000,
        });
    } catch (error) {
      if (warn) console.warn(`[Reminders] Push notifications are OFF: invalid VAPID settings (${error.message}).`);
    }
  } else if (warn && (VAPID_PUBLIC_KEY || VAPID_PRIVATE_KEY || VAPID_SUBJECT)) {
    console.warn(
      "[Reminders] Push notifications are OFF: set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT " +
        "(a contact such as mailto:you@example.com) in server/.env. Generate keys with `npm run push:keys`.",
    );
  }

  return null;
}

module.exports = { createPushSender };
