const express = require("express");

function createRouter({ service, resolveUser, demoUsers = [] }) {
  const router = express.Router();
  router.get("/config", (_req, res) =>
    res.json({
      demo: demoUsers.length > 0,
      users: demoUsers,
      push: service.pushConfig(),
    }),
  );
  router.use(async (req, res, next) => {
    try {
      req.user = await resolveUser(req);
      if (
        !req.user?.id ||
        !["client", "adviser"].includes(req.user.role) ||
        (req.user.role === "client" && !req.user.clientId)
      )
        return res
          .status(401)
          .json({ error: "Sign in to access Royal Square." });
      next();
    } catch {
      res
        .status(401)
        .json({ error: "Your session could not be verified. Sign in again." });
    }
  });
  router.get("/clients", async (req, res) =>
    res.json(await service.clients(req.user)),
  );
  router.get("/rules", (_req, res) => res.json(service.rules()));
  router.post("/rules", (req, res) =>
    res.status(201).json(service.saveRule(req.user, req.body)),
  );
  router.put("/rules/:id", (req, res) =>
    res.json(service.saveRule(req.user, req.body, req.params.id)),
  );
  router.get("/reminders", (req, res) => res.json(service.reminders(req.user)));
  router.post("/reminders", async (req, res) =>
    res.status(201).json(await service.addReminder(req.user, req.body)),
  );
  router.post("/reminders/:id/complete", (req, res) =>
    res.json(service.completeReminder(req.user, req.params.id)),
  );
  router.get("/notifications", (req, res) =>
    res.json(service.notifications(req.user)),
  );
  router.patch("/notifications/:id/read", (req, res) =>
    res.json(service.readNotification(req.user, req.params.id)),
  );
  router.get("/messages/:clientId", async (req, res) =>
    res.json(await service.messages(req.user, req.params.clientId)),
  );
  router.post("/messages", async (req, res) =>
    res.status(201).json(await service.sendMessage(req.user, req.body)),
  );
  router.post("/push/subscriptions", (req, res) =>
    res.status(201).json(service.subscribe(req.user, req.body)),
  );
  router.delete("/push/subscriptions", (req, res) => {
    service.unsubscribe(req.user, req.body.endpoint);
    res.sendStatus(204);
  });
  router.post("/financial-pull/:clientId", async (req, res) =>
    res.json(await service.financialPull(req.user, req.params.clientId)),
  );
  router.use((err, _req, res, _next) => {
    const status = err.status || 500;
    if (status >= 500) console.error("[Dev 4]", err.message);
    res
      .status(status)
      .json({
        error:
          status === 500
            ? "The request could not be completed. Please try again."
            : err.message,
      });
  });
  return router;
}
module.exports = { createRouter };
