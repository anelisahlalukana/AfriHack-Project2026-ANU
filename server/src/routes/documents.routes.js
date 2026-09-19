const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { validateDocumentType, validateSignaturePayload } = require("../middleware/validate");
const controller = require("../controllers/documents.controller");

const router = express.Router({ mergeParams: true });

router.use(requireAuth);

router.get("/", controller.listDocuments);
router.get("/:type/download", validateDocumentType, controller.downloadDocument);
router.post("/:type/send", validateDocumentType, controller.sendDocument);
router.post(
  "/:type/sign",
  validateDocumentType,
  validateSignaturePayload,
  controller.signDocument
);

module.exports = router;
