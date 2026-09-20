const express = require("express");
const cors = require("cors");
require("dotenv").config({ path: ".env.reminders.local", quiet: true });
require("dotenv").config({ quiet: true });

const { requireAuth } = require("./src/middleware/auth");
const { requireClientAccess } = require("./src/middleware/clientAccess");
const documentsController = require("./src/controllers/documents.controller");
const documentsRoutes = require("./src/routes/documents.routes");
const complianceRoutes = require("./src/routes/compliance.routes");
const clientComplianceRoutes = require("./src/routes/clientCompliance.routes");
const complianceDashboardRoutes = require("./src/routes/complianceDashboard.routes");
const tasksRoutes = require("./src/routes/tasks.routes");
const catalogRoutes = require("./src/routes/catalog.routes");
const usersRoutes = require("./src/routes/users.routes");
const clientsRoutes = require("./src/routes/clients.routes");
const providerRoutes = require("./src/routes/provider.routes");
const dashboardRoutes = require("./src/routes/dashboard.routes");
const auditLogRoutes = require("./src/routes/auditLog.routes");
const reportsRoutes = require("./src/routes/reports.routes");
const { createReminders } = require("./src/reminders");
const { createPushSender } = require("./src/utils/pushSender");

const app = express();
const PORT = process.env.PORT || 5000;

const demo = process.argv.includes("--demo");
const push = createPushSender();
const reminders = createReminders({
  demo,
  push,
  pushPublicKey: push ? process.env.VAPID_PUBLIC_KEY : "",
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
app.get(
  "/api/clients/:clientId/consent-status",
  requireAuth,
  requireClientAccess,
  documentsController.getConsentStatus
);
app.use("/api/advisers/:adviserId/compliance", complianceRoutes);
app.use("/api/clients/:clientId/compliance", clientComplianceRoutes);
app.use("/api/compliance", complianceDashboardRoutes);
app.use("/api/tasks", tasksRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/audit-log", auditLogRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api", catalogRoutes);
app.use("/api/admin/users", usersRoutes);
app.use("/api/provider", providerRoutes);

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
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
