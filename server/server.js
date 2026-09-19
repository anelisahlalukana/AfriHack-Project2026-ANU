const express = require("express");
const cors = require("cors");
require("dotenv").config({ path: ".env.reminders.local", quiet: true });
require("dotenv").config({ quiet: true });

const { requireAuth } = require("./src/middleware/auth");
const documentsController = require("./src/controllers/documents.controller");
const documentsRoutes = require("./src/routes/documents.routes");
const complianceRoutes = require("./src/routes/compliance.routes");
const usersRoutes = require("./src/routes/users.routes");
const clientsRoutes = require("./src/routes/clients.routes");
const { createReminders } = require("./src/reminders");
const webpush = require("web-push");

const app = express();
const PORT = process.env.PORT || 5000;

const demo = process.argv.includes("--demo");
let push;
const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT) {
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    push = (subscription, payload) =>
      webpush.sendNotification(subscription, JSON.stringify(payload), {
        TTL: 86400,
        timeout: 10000,
      });
  } catch (error) {
    console.warn(`[Reminders] Push notifications are OFF: invalid VAPID settings (${error.message}).`);
  }
} else if (VAPID_PUBLIC_KEY || VAPID_PRIVATE_KEY || VAPID_SUBJECT) {
  console.warn(
    "[Reminders] Push notifications are OFF: set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT " +
      "(a contact such as mailto:you@example.com) in server/.env. Generate keys with `npm run push:keys`.",
  );
}
const reminders = createReminders({
  demo,
  push,
  pushPublicKey: push ? VAPID_PUBLIC_KEY : "",
});
app.locals.reminders = reminders.service;

app.use(cors({ origin: process.env.CLIENT_ORIGIN || ["http://localhost:5173", "http://127.0.0.1:5173"] }));
app.use("/api/reminders", express.json({ limit: "32kb" }), reminders.router);
// Signature captures are base64-encoded PNGs, so the default 100kb JSON limit is too small.
// Document signatures require larger payloads; the reminders module retains its smaller limit above.
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", (req, res) => {
  res.json({ status: "Server is running" });
});

app.use("/api/clients", clientsRoutes);
app.use("/api/clients/:clientId/documents", documentsRoutes);
app.get("/api/clients/:clientId/consent-status", requireAuth, documentsController.getConsentStatus);
app.use("/api/advisers/:adviserId/compliance", complianceRoutes);
app.use("/api/admin/users", usersRoutes);

const server = app.listen(PORT, "127.0.0.1", () => {
  console.log(`Server running on port ${PORT}`);
  if (demo)
    console.log(
      "REMINDERS DEMO: fictional identities and financial data; local use only.",
    );
});
const tick = () =>
  reminders.service
    .tick()
    .catch((error) => console.error("[Reminder scheduler]", error.message));
tick();
// How often due reminders are fired and waiting push messages are sent (milliseconds).
const scheduler = setInterval(tick, Number(process.env.REMINDERS_TICK_MS) || 30000);
scheduler.unref();
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    clearInterval(scheduler);
    server.close();
  });