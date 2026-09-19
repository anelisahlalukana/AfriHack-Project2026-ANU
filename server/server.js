const express = require("express");
const cors = require("cors");
require("dotenv").config({ path: ".env.dev4.local", quiet: true });
require("dotenv").config({ quiet: true });

const { requireAuth } = require("./src/middleware/auth");
const documentsController = require("./src/controllers/documents.controller");
const documentsRoutes = require("./src/routes/documents.routes");
const complianceRoutes = require("./src/routes/compliance.routes");
const usersRoutes = require("./src/routes/users.routes");
const app = express();
const PORT = process.env.PORT || 5000;
const { createDev4 } = require("./src/dev4");
const webpush = require("web-push");
const demo = process.argv.includes("--demo");
let push;
if (
  process.env.VAPID_PUBLIC_KEY &&
  process.env.VAPID_PRIVATE_KEY &&
  process.env.VAPID_SUBJECT
) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT,
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  push = (subscription, payload) =>
    webpush.sendNotification(subscription, JSON.stringify(payload), {
      TTL: 86400,
      timeout: 10000,
    });
}
const dev4 = createDev4({
  demo,
  push,
  pushPublicKey: process.env.VAPID_PUBLIC_KEY || "",
});
app.locals.dev4 = dev4.service;

app.use(cors({ origin: process.env.CLIENT_ORIGIN || ["http://localhost:5173", "http://127.0.0.1:5173"] }));
app.use("/api/dev4", express.json({ limit: "32kb" }), dev4.router);
// Document signatures require larger payloads; Dev 4 retains its smaller limit.
app.use(express.json({ limit: "10mb" }));
app.use("/api/clients/:clientId/documents", documentsRoutes);
app.get("/api/clients/:clientId/consent-status", requireAuth, documentsController.getConsentStatus);
app.use("/api/advisers/:adviserId/compliance", complianceRoutes);

app.use("/api/admin/users", usersRoutes);

app.get("/api/health", (req, res) => {
  res.json({ status: "Server is running" });
});

const server = app.listen(PORT, "127.0.0.1", () => {
  console.log(`Server running on port ${PORT}`);
  if (demo)
    console.log(
      "DEV 4 DEMO: fictional identities and financial data; local use only.",
    );
});
const tick = () =>
  dev4.service
    .tick()
    .catch((error) => console.error("[Reminder scheduler]", error.message));
tick();
const scheduler = setInterval(tick, 30000);
scheduler.unref();
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    clearInterval(scheduler);
    server.close();
  });
