const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const controller = require("../controllers/reports.controller");

const router = express.Router();

// Advisers see their own clients' data; admins see every adviser's. The service enforces
// that scope from req.user; the routes only decide who may use reports at all.
router.use(requireAuth, requireRole(["advisor", "admin"]));

router.get("/templates", controller.listTemplates);
router.post("/ask", controller.ask);
router.post("/run", controller.run);
router.post("/query", controller.query);
router.post("/generate", controller.generate);

module.exports = router;
