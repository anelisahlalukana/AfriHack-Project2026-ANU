const express = require("express");
const { requireAuth, requireRole } = require("../middleware/auth");
const { singleTaskFile } = require("../middleware/upload");
const {
  validateTaskIdParam,
  validateTaskUpdatePayload,
  validateProviderMessagePayload,
  validateHandlerPayload,
} = require("../middleware/validate");
const { PROVIDER_ROLE } = require("../constants/roles");
const controller = require("../controllers/provider.controller");

// Mounted at /api/provider. Provider logins only (app_metadata.role = 'provider');
// the service also checks the login's provider_id on every call.
const router = express.Router();
router.use(requireAuth, requireRole([PROVIDER_ROLE]));

router.get("/me", controller.getMe);
router.get("/tasks", controller.listTasks);
router.get("/tasks/:taskId", validateTaskIdParam, controller.getTask);
router.post("/tasks/:taskId/respond", validateTaskIdParam, validateTaskUpdatePayload, controller.respond);
router.post("/tasks/:taskId/decline", validateTaskIdParam, validateProviderMessagePayload, controller.decline);
router.post("/tasks/:taskId/messages", validateTaskIdParam, validateProviderMessagePayload, controller.sendMessage);
router.post("/tasks/:taskId/handler", validateTaskIdParam, validateHandlerPayload, controller.changeHandler);
router.post("/tasks/:taskId/files", validateTaskIdParam, singleTaskFile, controller.uploadFile);
router.get("/tasks/:taskId/files/:fileId/url", validateTaskIdParam, controller.getFileUrl);

module.exports = router;
