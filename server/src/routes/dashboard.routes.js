const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const controller = require("../controllers/dashboard.controller");

const router = express.Router();

// The practice overview is an adviser view (admins manage staff and never see client data).
router.get("/", requireAuth, requireRole(["advisor"]), controller.getDashboard);

module.exports = router;
