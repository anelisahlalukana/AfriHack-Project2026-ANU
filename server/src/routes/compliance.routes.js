const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const { requireSelf } = require("../middleware/complianceAccess");
const { ADVISOR_ROLE } = require("../constants/roles");
const { validateComplianceUpdate, validateComplianceIds, validateCpdRecord } = require("../middleware/validate");
const controller = require("../controllers/compliance.controller");

const router = express.Router({ mergeParams: true });

router.use(requireAuth, requireRole([ADVISOR_ROLE]), validateComplianceIds);

router.get("/", controller.getCompliance);
router.patch("/", requireSelf, validateComplianceUpdate, controller.updateCompliance);
router.post("/cpd", requireSelf, validateCpdRecord, controller.addCpdRecord);

module.exports = router;
