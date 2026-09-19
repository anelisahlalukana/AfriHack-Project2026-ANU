const express = require("express");
const multer = require("multer");
const { requireAuth } = require("../middleware/auth");
const { requireStaff } = require("../middleware/roles");
const controller = require("../controllers/tasks.controller");
const { MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_TYPES } = require("../constants/taskConfig");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter(req, file, cb) {
    if (ALLOWED_UPLOAD_TYPES.some((pattern) => pattern.test(file.mimetype))) return cb(null, true);
    cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "file"));
  },
});

// Turns multer errors into a readable 400 instead of a 500.
function singleFile(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (!err) return next();
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? `Files must be ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB or smaller`
        : "Upload a photo, PDF or voice note";
    res.status(400).json({ error: message });
  });
}

// Mounted at /api/tasks. Clients and staff share these routes; the service
// checks what each caller may see and do.
const router = express.Router();
router.use(requireAuth);

router.get("/", controller.listTasks);
router.post("/claims", controller.createClaim);
router.post("/requests", controller.createRequest);
router.get("/:taskId", controller.getTask);
router.patch("/:taskId/draft", controller.updateDraft);
router.post("/:taskId/submit", controller.submitTask);
router.post("/:taskId/cancel", controller.cancelDraft);
router.post("/:taskId/updates", controller.postUpdate);
router.post("/:taskId/client-action", controller.clientAction);
router.post("/:taskId/files", singleFile, controller.uploadFile);
router.get("/:taskId/files/:fileId/url", controller.getFileUrl);
router.post("/:taskId/close", requireStaff, controller.closeTask);
// Demo control for the mocked product-provider integration.
router.post("/:taskId/mock-provider/event", requireStaff, controller.simulateProvider);

module.exports = router;
