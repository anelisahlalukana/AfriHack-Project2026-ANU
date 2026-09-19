const { DOCUMENT_TYPE_VALUES } = require("../constants/documentTypes");

function validateDocumentType(req, res, next) {
  const { type } = req.params;

  if (!DOCUMENT_TYPE_VALUES.includes(type)) {
    return res.status(400).json({
      error: `Invalid document type '${type}'`,
      allowed: DOCUMENT_TYPE_VALUES,
    });
  }

  next();
}

function validateSignaturePayload(req, res, next) {
  const { signature, signerName } = req.body || {};

  if (typeof signature !== "string" || signature.trim().length === 0) {
    return res.status(400).json({ error: "Field 'signature' (base64 image data) is required" });
  }

  if (!/^data:image\/(png|jpeg);base64,/.test(signature)) {
    return res
      .status(400)
      .json({ error: "Field 'signature' must be a base64 data URL (image/png or image/jpeg)" });
  }

  if (typeof signerName !== "string" || signerName.trim().length === 0) {
    return res.status(400).json({ error: "Field 'signerName' is required" });
  }

  next();
}

module.exports = { validateDocumentType, validateSignaturePayload };
