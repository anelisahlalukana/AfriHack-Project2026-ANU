const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const { validateAuditQuery } = require("../middleware/validate");
const { ROLES, PROVIDER_ROLE } = require("../constants/roles");
const controller = require("../controllers/auditLog.controller");

// Mounted at /api/audit-log. Admins, advisors and providers all use these two
// routes; what each one gets back is scoped inside auditLog.service.js from the
// verified session, never from anything the caller sends.
const router = express.Router();
router.use(requireAuth, requireRole([...ROLES, PROVIDER_ROLE]));

router.get("/", validateAuditQuery, controller.list);
router.get("/facets", controller.facets);

module.exports = router;
