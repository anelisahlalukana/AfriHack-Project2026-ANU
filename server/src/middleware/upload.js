const multer = require("multer");
const { MAX_UPLOAD_BYTES, ALLOWED_UPLOAD_TYPES } = require("../constants/taskConfig");
const { SIGNED_UPLOAD_MAX_BYTES, SIGNED_UPLOAD_TYPES } = require("../constants/documentTypes");

// Builds a middleware that accepts one file in the `file` field. Multer errors become a clear 400.
function singleFileUpload({ maxBytes, allowedTypes, wrongTypeMessage }) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1 },
    fileFilter(req, file, cb) {
      if (allowedTypes.some((pattern) => pattern.test(file.mimetype))) return cb(null, true);
      cb(new multer.MulterError("LIMIT_UNEXPECTED_FILE", "file"));
    },
  });

  return function (req, res, next) {
    upload.single("file")(req, res, (err) => {
      if (!err) return next();
      const error =
        err.code === "LIMIT_FILE_SIZE"
          ? `Files must be ${Math.round(maxBytes / (1024 * 1024))} MB or smaller`
          : wrongTypeMessage;
      res.status(400).json({ error });
    });
  };
}

// A photo, PDF or voice note.
const singleTaskFile = singleFileUpload({
  maxBytes: MAX_UPLOAD_BYTES,
  allowedTypes: ALLOWED_UPLOAD_TYPES,
  wrongTypeMessage: "Upload a photo, PDF or voice note",
});

// A signed copy of a compliance document: PDF only.
const singleDocumentFile = singleFileUpload({
  maxBytes: SIGNED_UPLOAD_MAX_BYTES,
  allowedTypes: SIGNED_UPLOAD_TYPES,
  wrongTypeMessage: "Upload the signed document as a PDF file",
});

module.exports = { singleTaskFile, singleDocumentFile };
