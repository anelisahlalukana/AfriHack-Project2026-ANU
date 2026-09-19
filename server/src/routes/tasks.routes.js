const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const { singleTaskFile } = require("../middleware/upload");
const {
  validateTaskIdParam,
  validateNewClaimPayload,
  validateNewRequestPayload,
  validateDraftPayload,
  validateTaskUpdatePayload,
  validateClientActionPayload,
} = require("../middleware/validate");
const { ADVISOR_ROLE } = require("../constants/roles");
const controller = require("../controllers/tasks.controller");

// Mounted at /api/tasks. Advisors and clients share these routes; the service
// decides what each may see and do. Closing and the mock insurer are advisor-only.
const router = express.Router();
router.use(requireAuth);

router.get("/", controller.listTasks);
router.post("/claims", validateNewClaimPayload, controller.createClaim);
router.post("/requests", validateNewRequestPayload, controller.createRequest);
router.get("/:taskId", validateTaskIdParam, controller.getTask);
router.patch("/:taskId/draft", validateTaskIdParam, validateDraftPayload, controller.updateDraft);
router.post("/:taskId/submit", validateTaskIdParam, validateDraftPayload, controller.submitTask);
router.post("/:taskId/cancel", validateTaskIdParam, controller.cancelDraft);
router.post("/:taskId/updates", validateTaskIdParam, validateTaskUpdatePayload, controller.postUpdate);
router.post("/:taskId/client-action", validateTaskIdParam, validateClientActionPayload, controller.clientAction);
router.post("/:taskId/files", validateTaskIdParam, singleTaskFile, controller.uploadFile);
router.get("/:taskId/files/:fileId/url", validateTaskIdParam, controller.getFileUrl);
router.post("/:taskId/close", requireRole([ADVISOR_ROLE]), validateTaskIdParam, validateTaskUpdatePayload, controller.closeTask);
router.post("/:taskId/mock-provider/event", requireRole([ADVISOR_ROLE]), validateTaskIdParam, validateTaskUpdatePayload, controller.simulateProvider);

module.exports = router;
