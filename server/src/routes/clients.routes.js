const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const {
  validateNewClientPayload,
  validateCompleteRegistrationPayload,
} = require("../middleware/validate");
const controller = require("../controllers/clients.controller");

const router = express.Router();

// Public on purpose: this IS the client's authentication step (they have no
// session yet). It only works for a pending, unverified client login.
router.post("/complete-registration", validateCompleteRegistrationPayload, controller.completeRegistration);

// Advisers add clients; the client's login is created with them.
router.post("/", requireAuth, requireRole(["advisor"]), validateNewClientPayload, controller.createClient);

module.exports = router;
