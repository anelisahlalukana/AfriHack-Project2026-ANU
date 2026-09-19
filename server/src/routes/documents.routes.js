const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const { requireClientAccess, requireSentToClient } = require("../middleware/clientAccess");
const {
  validateDocumentType,
  validateSignaturePayload,
  validateSignedUpload,
} = require("../middleware/validate");
const { singleDocumentFile } = require("../middleware/upload");
const controller = require("../controllers/documents.controller");

const router = express.Router({ mergeParams: true });

// Advisors reach any client's documents; a client only their own.
router.use(requireAuth, requireClientAccess);

router.get("/", controller.listDocuments);
router.get("/:type/download", validateDocumentType, controller.downloadDocument);
// Sending is an adviser action (clients get theirs from registration or an adviser).
router.post("/:type/send", requireRole(["advisor"]), validateDocumentType, controller.sendDocument);
router.post(
  "/:type/sign",
  validateDocumentType,
  requireSentToClient,
  validateSignaturePayload,
  controller.signDocument
);
// Signed outside the app (print/scan or a PDF editor) and uploaded back as the signed copy.
router.post(
  "/:type/upload-signed",
  validateDocumentType,
  requireSentToClient,
  singleDocumentFile,
  validateSignedUpload,
  controller.uploadSignedDocument
);

module.exports = router;
