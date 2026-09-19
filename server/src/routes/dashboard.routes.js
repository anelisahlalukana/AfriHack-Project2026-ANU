const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const { validateClientIdParam } = require("../middleware/validate");
const controller = require("../controllers/dashboard.controller");

const router = express.Router();

// The practice overview is an adviser view (admins manage staff and never see client data).
router.get("/", requireAuth, requireRole(["advisor"]), controller.getDashboard);

// Client Pulse: who is at risk of disengaging, why, and the check-in action. Same access as above.
const advisorOnly = [requireAuth, requireRole(["advisor"])];
router.get("/at-risk", ...advisorOnly, controller.getAtRiskClients);
router.get("/at-risk/:clientId", ...advisorOnly, validateClientIdParam, controller.getClientPulse);
router.post("/at-risk/:clientId/check-in", ...advisorOnly, validateClientIdParam, controller.sendCheckIn);

module.exports = router;
