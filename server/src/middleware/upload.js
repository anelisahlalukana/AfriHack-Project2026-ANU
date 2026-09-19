const multer = require("multer");
const { MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_TYPES } = require("../constants/taskConfig");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
  fileFilter(req, file, cb) {
    if (ALLOWED_UPLOAD_TYPES.some((pattern) => pattern.test(file.mimetype))) return cb(null, true);
    cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "file"));
  },
});

// One file in the `file` field: a photo, PDF or voice note. Multer errors become a clear 400.
function singleTaskFile(req, res, next) {
  upload.single("file")(req, res, (err) => {
    if (!err) return next();
    const error =
      err.code === "LIMIT_FILE_SIZE"
        ? `Files must be ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB or smaller`
        : "Upload a photo, PDF or voice note";
    res.status(400).json({ error });
  });
}

module.exports = { singleTaskFile };
