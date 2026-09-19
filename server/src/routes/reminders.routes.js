const express = require("express");
const { createRemindersController } = require("../controllers/reminders.controller");
const { createRemindersAuth } = require("../middleware/remindersAuth");
function createSharedRouter({ service, db }) {
  const router = express.Router(), c = createRemindersController(service);
  router.get("/config", c.config);
  router.use(createRemindersAuth(db));
  router.get("/me", c.me);
  router.get("/clients", c.clients);
  router.get("/rules", c.rules);
  router.post("/rules", c.addRule);
  router.put("/rules/:id", c.updateRule);
  router.get("/reminders", c.reminders);
  router.post("/reminders", c.addReminder);
  router.post("/reminders/:id/complete", c.completeReminder);
  router.get("/notifications", c.notifications);
  router.patch("/notifications/:id/read", c.readNotification);
  router.get("/messages/:clientId", c.messages);
  router.post("/messages", c.sendMessage);
  router.post("/push/subscriptions", c.subscribe);
  router.delete("/push/subscriptions", c.unsubscribe);
  router.post("/financial-pull/:clientId", c.financialPull);
  router.use((error, _req, res, _next) => {
    const status = error.status || 500;
    // Server-side failures show the person only a generic message, so record the real one here.
    if (status >= 500) console.error("[Reminders]", error.code || "", error.message || error);
    res.status(status).json({ error: status === 500 ? "The request could not be completed. Please try again." : error.message });
  });
  return router;
}
module.exports = { createSharedRouter };
