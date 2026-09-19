const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const {
  validateNewClientPayload,
  validateCompleteRegistrationPayload,
  validateClientLoginPayload,
} = require("../middleware/validate");
const controller = require("../controllers/clients.controller");

const router = express.Router();

// Public on purpose: this IS the client's authentication step (they have no
// session yet). It only works for a pending, unverified client login.
router.post("/complete-registration", validateCompleteRegistrationPayload, controller.completeRegistration);

// Public: clients sign in with their ID number + password. Supabase only signs in
// by email, so the server finds the client's login and returns the session tokens.
router.post("/login", validateClientLoginPayload, controller.login);

// Called by the browser right after the client verifies their email code: sends the
// FAIS Disclosure and Confidentiality Agreement. Signed-in clients only (staff have no
// client profile, so they get a 404).
router.post("/finish-registration", requireAuth, controller.finishRegistration);

// Advisers add clients; the client's login is created with them.
router.post("/", requireAuth, requireRole(["advisor"]), validateNewClientPayload, controller.createClient);

module.exports = router;
