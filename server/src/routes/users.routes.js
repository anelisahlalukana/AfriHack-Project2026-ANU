const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const { validateNewUserPayload } = require("../middleware/validate");
const controller = require("../controllers/users.controller");

const router = express.Router();

// Admin-only: providers/advisors/brokers don't self-register, so an admin
// provisions their account and Brevo emails them a password-setup link.
router.use(requireAuth, requireRole(["admin"]));

router.get("/", controller.listUsers);
router.post("/", validateNewUserPayload, controller.createUser);

module.exports = router;
