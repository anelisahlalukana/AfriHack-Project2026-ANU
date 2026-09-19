const { DOCUMENT_TYPE_VALUES } = require("../constants/documentTypes");
const { ROLES } = require("../constants/roles");
const { QUALIFICATION_STATUSES, CPD_STATUSES } = require("../constants/complianceStatuses");

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

function validateNewUserPayload(req, res, next) {
  const { email, fullName, role } = req.body || {};

  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res
      .status(400)
      .json({ error: "Field 'email' must be a full email address, e.g. name@example.com" });
  }
  if (typeof fullName !== "string" || fullName.trim().length === 0) {
    return res.status(400).json({ error: "Field 'fullName' is required" });
  }
  if (!ROLES.includes(role)) {
    return res.status(400).json({ error: `Field 'role' must be one of: ${ROLES.join(", ")}` });
  }

  next();
}

function validateComplianceUpdate(req, res, next) {
  const body = req.body || {};

  if (
    body.qualificationStatus !== undefined &&
    !QUALIFICATION_STATUSES.includes(body.qualificationStatus)
  ) {
    return res.status(400).json({
      error: `Field 'qualificationStatus' must be one of: ${QUALIFICATION_STATUSES.join(", ")}`,
    });
  }
  if (body.cpdStatus !== undefined && !CPD_STATUSES.includes(body.cpdStatus)) {
    return res
      .status(400)
      .json({ error: `Field 'cpdStatus' must be one of: ${CPD_STATUSES.join(", ")}` });
  }
  if (body.isPoliticallyExposed !== undefined && typeof body.isPoliticallyExposed !== "boolean") {
    return res.status(400).json({ error: "Field 'isPoliticallyExposed' must be a boolean" });
  }
  if (body.terrorismFinancingFlag !== undefined && typeof body.terrorismFinancingFlag !== "boolean") {
    return res.status(400).json({ error: "Field 'terrorismFinancingFlag' must be a boolean" });
  }
  if (
    body.pepDetails !== undefined &&
    body.pepDetails !== null &&
    typeof body.pepDetails !== "string"
  ) {
    return res.status(400).json({ error: "Field 'pepDetails' must be a string" });
  }
  if (
    body.terrorismFinancingDetails !== undefined &&
    body.terrorismFinancingDetails !== null &&
    typeof body.terrorismFinancingDetails !== "string"
  ) {
    return res.status(400).json({ error: "Field 'terrorismFinancingDetails' must be a string" });
  }

  next();
}

module.exports = {
  validateDocumentType,
  validateSignaturePayload,
  validateNewUserPayload,
  validateComplianceUpdate,
};
