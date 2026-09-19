const express = require("express");
const { requireAuth } = require("../middleware/auth");
const controller = require("../controllers/catalog.controller");

// Mounted at /api. Auth is applied per route (not router-wide) so this router
// never intercepts other /api routes such as /api/health.
const router = express.Router();

router.get("/catalog", requireAuth, controller.getCatalog);
router.get("/me", requireAuth, controller.getMe);

module.exports = router;
