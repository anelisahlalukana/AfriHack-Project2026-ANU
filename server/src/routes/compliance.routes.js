const express = require("express");
const { requireAuth } = require("../middleware/auth");
const controller = require("../controllers/compliance.controller");

const router = express.Router({ mergeParams: true });

router.use(requireAuth);

router.get("/", controller.getCompliance);
router.patch("/", controller.updateCompliance);

module.exports = router;
