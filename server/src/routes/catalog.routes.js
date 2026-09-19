const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { requireStaff } = require("../middleware/roles");
const controller = require("../controllers/tasks.controller");

// Mounted at /api. Auth is applied per route (not router-wide) so this router
// never intercepts other /api routes such as /api/health.
const router = express.Router();

router.get("/catalog", requireAuth, controller.getCatalog);
router.get("/me", requireAuth, controller.me);
router.get("/clients/:clientId/account-link", requireAuth, requireStaff, controller.getLinkStatus);
router.post("/clients/:clientId/account-link", requireAuth, requireStaff, controller.linkAccount);
router.delete("/clients/:clientId/account-link", requireAuth, requireStaff, controller.unlinkAccount);

module.exports = router;
