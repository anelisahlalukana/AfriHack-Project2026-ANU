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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Clients sign in with their ID number, so it has to be exactly 13 digits.
const ID_NUMBER_PATTERN = /^\d{13}$/;

function validateNewClientPayload(req, res, next) {
  const { first_name, second_name, surname, contact_email, contact_mobile } = req.body || {};

  if (typeof first_name !== "string" || first_name.trim().length === 0) {
    return res.status(400).json({ error: "Field 'first_name' is required" });
  }
  if (typeof surname !== "string" || surname.trim().length === 0) {
    return res.status(400).json({ error: "Field 'surname' is required" });
  }
  if (typeof contact_email !== "string" || !EMAIL_PATTERN.test(contact_email.trim())) {
    return res
      .status(400)
      .json({ error: "Field 'contact_email' must be a full email address, e.g. name@example.com" });
  }
  for (const [name, value] of [["second_name", second_name], ["contact_mobile", contact_mobile]]) {
    if (value !== undefined && value !== null && typeof value !== "string") {
      return res.status(400).json({ error: `Field '${name}' must be text` });
    }
  }

  next();
}

function validateCompleteRegistrationPayload(req, res, next) {
  const { email, id_number, password } = req.body || {};

  if (typeof email !== "string" || !EMAIL_PATTERN.test(email.trim())) {
    return res
      .status(400)
      .json({ error: "Field 'email' must be a full email address, e.g. name@example.com" });
  }
  if (typeof id_number !== "string" || !ID_NUMBER_PATTERN.test(id_number.trim())) {
    return res.status(400).json({ error: "Your ID number must be exactly 13 digits" });
  }
  // 72 is the most bytes Supabase will hash from a password.
  if (typeof password !== "string" || password.length < 8 || password.length > 72) {
    return res.status(400).json({ error: "Your password must be between 8 and 72 characters" });
  }

  next();
}

function validateClientLoginPayload(req, res, next) {
  const { id_number, password } = req.body || {};

  if (typeof id_number !== "string" || !ID_NUMBER_PATTERN.test(id_number.trim())) {
    return res.status(400).json({ error: "Your ID number must be exactly 13 digits" });
  }
  if (typeof password !== "string" || password.length === 0) {
    return res.status(400).json({ error: "Field 'password' is required" });
  }

  next();
}

function validateUserIdParam(req, res, next) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) {
    return res.status(400).json({ error: "The user id in the URL isn't valid" });
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
  validateNewClientPayload,
  validateCompleteRegistrationPayload,
  validateClientLoginPayload,
  validateUserIdParam,
  validateComplianceUpdate,
};
