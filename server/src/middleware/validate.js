const { DOCUMENT_TYPE_VALUES, ACKNOWLEDGE_ONLY_TYPES } = require("../constants/documentTypes");
const { ACCOUNT_ROLES, PROVIDER_ROLE } = require("../constants/roles");
const { QUALIFICATION_STATUSES } = require("../constants/complianceStatuses");
const { SCREENING_TYPES, AUDIT_DEFAULT_LIMIT, AUDIT_MAX_LIMIT } = require("../constants/compliance");
const { southAfricaDate } = require("../utils/complianceRules");
const AUDIT_PAGE = require("../constants/auditLog");

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
  // FAIS Disclosure is acknowledged with a typed name, so its signature image is optional.
  const signatureOptional =
    ACKNOWLEDGE_ONLY_TYPES.includes(req.params.type) && (signature === undefined || signature === null || signature === "");

  if (!signatureOptional) {
    if (typeof signature !== "string" || signature.trim().length === 0) {
      return res.status(400).json({ error: "Field 'signature' (base64 image data) is required" });
    }

    if (!/^data:image\/(png|jpeg);base64,/.test(signature)) {
      return res
        .status(400)
        .json({ error: "Field 'signature' must be a base64 data URL (image/png or image/jpeg)" });
    }
  }

  if (typeof signerName !== "string" || signerName.trim().length === 0) {
    return res.status(400).json({ error: "Field 'signerName' is required" });
  }

  next();
}

// Runs after singleDocumentFile. The mimetype is client-supplied, so also check the PDF header.
function validateSignedUpload(req, res, next) {
  if (ACKNOWLEDGE_ONLY_TYPES.includes(req.params.type)) {
    return res.status(400).json({
      error: "This document is acknowledged with your name in the app; it can't be uploaded as a signed copy",
    });
  }
  if (!req.file) {
    return res.status(400).json({ error: "Attach the signed PDF in the 'file' field" });
  }
  if (req.file.buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return res.status(400).json({ error: "The file you uploaded isn't a valid PDF" });
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
  if (!ACCOUNT_ROLES.includes(role)) {
    return res.status(400).json({ error: `Field 'role' must be one of: ${ACCOUNT_ROLES.join(", ")}` });
  }
  const { providerId } = req.body;
  if (role === PROVIDER_ROLE && (typeof providerId !== "string" || !UUID_PATTERN.test(providerId))) {
    return res.status(400).json({ error: "Choose which provider this login is for" });
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
  const allowed = ["qualificationStatus", "isPoliticallyExposed", "pepDetails", "terrorismFinancingFlag", "terrorismFinancingDetails"];
  if (!isPlainObject(body) || !Object.keys(body).length || Object.keys(body).some(key => !allowed.includes(key))) {
    return res.status(400).json({ error: "Supply supported compliance fields. CPD status is calculated from recorded hours." });
  }
  if ([body.pepDetails, body.terrorismFinancingDetails].some(value => typeof value === "string" && value.length > 2000)) {
    return res.status(400).json({ error: "Compliance notes must be at most 2000 characters." });
  }

  if (
    body.qualificationStatus !== undefined &&
    !QUALIFICATION_STATUSES.includes(body.qualificationStatus)
  ) {
    return res.status(400).json({
      error: `Field 'qualificationStatus' must be one of: ${QUALIFICATION_STATUSES.join(", ")}`,
    });
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

// --- Claims & requests -------------------------------------------------------
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TASK_NOTE_LENGTH = 2000;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateTaskIdParam(req, res, next) {
  if (!UUID_PATTERN.test(req.params.taskId || "")) {
    return res.status(400).json({ error: "The claim or request id in the URL isn't valid" });
  }
  if (req.params.fileId !== undefined && !UUID_PATTERN.test(req.params.fileId)) {
    return res.status(400).json({ error: "The file id in the URL isn't valid" });
  }
  next();
}

// Shared by new claims and new requests: an optional client (advisers only) and form answers.
function validateTaskBody(req, res) {
  const { clientId, form, providerId, policyNumber } = req.body || {};
  if (clientId !== undefined && clientId !== null && !UUID_PATTERN.test(clientId)) {
    res.status(400).json({ error: "Field 'clientId' isn't a valid client id" });
    return false;
  }
  if (providerId !== undefined && providerId !== null && providerId !== "" && !UUID_PATTERN.test(providerId)) {
    res.status(400).json({ error: "Choose a provider from the list" });
    return false;
  }
  if (form !== undefined && !isPlainObject(form)) {
    res.status(400).json({ error: "Field 'form' must be an object of answers" });
    return false;
  }
  if (policyNumber !== undefined && policyNumber !== null && typeof policyNumber !== "string") {
    res.status(400).json({ error: "Field 'policyNumber' must be text" });
    return false;
  }
  return true;
}

function validateNewClaimPayload(req, res, next) {
  if (!validateTaskBody(req, res)) return;
  if (typeof req.body.category !== "string" || !req.body.category.trim()) {
    return res.status(400).json({ error: "Choose what kind of claim this is" });
  }
  next();
}

function validateNewRequestPayload(req, res, next) {
  if (!validateTaskBody(req, res)) return;
  if (typeof req.body.taskType !== "string" || !req.body.taskType.trim()) {
    return res.status(400).json({ error: "Choose what you need help with" });
  }
  next();
}

function validateDraftPayload(req, res, next) {
  if (!validateTaskBody(req, res)) return;
  const { checklist } = req.body || {};
  if (checklist !== undefined && !isPlainObject(checklist)) {
    return res.status(400).json({ error: "Field 'checklist' must be an object" });
  }
  next();
}

function validateTaskUpdatePayload(req, res, next) {
  const { note, stageKey, visibleToClient, outcome } = req.body || {};
  if (note !== undefined && note !== null && (typeof note !== "string" || note.length > MAX_TASK_NOTE_LENGTH)) {
    return res.status(400).json({ error: `Notes must be text of at most ${MAX_TASK_NOTE_LENGTH} characters` });
  }
  if (stageKey !== undefined && stageKey !== null && stageKey !== "" && typeof stageKey !== "string") {
    return res.status(400).json({ error: "Field 'stageKey' must be text" });
  }
  if (visibleToClient !== undefined && typeof visibleToClient !== "boolean") {
    return res.status(400).json({ error: "Field 'visibleToClient' must be true or false" });
  }
  if (outcome !== undefined && !["completed", "declined"].includes(outcome)) {
    return res.status(400).json({ error: "Field 'outcome' must be completed or declined" });
  }
  next();
}

function validateClientActionPayload(req, res, next) {
  const { date, rating, review } = req.body || {};
  if (date !== undefined && (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
    return res.status(400).json({ error: "Pick a date" });
  }
  if (rating !== undefined && (!Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5)) {
    return res.status(400).json({ error: "Choose a rating from 1 to 5" });
  }
  if (review !== undefined && review !== null && (typeof review !== "string" || review.length > MAX_TASK_NOTE_LENGTH)) {
    return res.status(400).json({ error: `A review can be at most ${MAX_TASK_NOTE_LENGTH} characters` });
  }
  next();
}

// Provider portal: a reply to Royal Square (required text) or a new claims handler name.
function validateProviderMessagePayload(req, res, next) {
  const { note } = req.body || {};
  if (typeof note !== "string" || !note.trim() || note.length > MAX_TASK_NOTE_LENGTH) {
    return res.status(400).json({ error: `Write a message of at most ${MAX_TASK_NOTE_LENGTH} characters` });
  }
  next();
}

function validateHandlerPayload(req, res, next) {
  const { name } = req.body || {};
  if (typeof name !== "string" || !name.trim() || name.trim().length > 120) {
    return res.status(400).json({ error: "Enter the claims handler's name (at most 120 characters)" });
  }
  next();
}

function validateClientIdParam(req, res, next) {
  if (!UUID_PATTERN.test(req.params.clientId || "")) {
    return res.status(400).json({ error: "The client id in the URL isn't valid" });
  }
  next();
}

function validateComplianceIds(req, res, next) {
  for (const name of ["clientId", "adviserId"]) {
    if (req.params[name] !== undefined && !UUID_PATTERN.test(req.params[name])) {
      return res.status(400).json({ error: `Invalid ${name} in the URL` });
    }
  }
  next();
}

function validateAuditLimit(req, res, next) {
  const raw = req.query.limit;
  if (raw !== undefined && (typeof raw !== "string" || !/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw)))) {
    return res.status(400).json({ error: "Audit limit must be a positive integer." });
  }
  req.auditLimit = Math.min(raw === undefined ? AUDIT_DEFAULT_LIMIT : Number(raw), AUDIT_MAX_LIMIT);
  next();
}

// Audit log query string: page, page size, sort, direction, date range and filters.
// Anything unrecognised is rejected rather than ignored, so a caller never receives a
// silently different page from the one they asked for. Cleaned values land on
// req.auditQuery, which is the only thing the service reads.
const ALLOWED_AUDIT_KEYS = ["page", "size", "sort", "dir", "q", "source", "category", "actorType", "from", "to", "clientId", "taskId", "all"];

function isIsoInstant(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function validateAuditQuery(req, res, next) {
  const query = req.query || {};
  const unknown = Object.keys(query).filter((key) => !ALLOWED_AUDIT_KEYS.includes(key));
  if (unknown.length) {
    return res.status(400).json({ error: `Unknown audit filter: ${unknown.join(", ")}` });
  }
  // Express parses a repeated key into an array; every filter here is single-valued.
  for (const [key, value] of Object.entries(query)) {
    if (typeof value !== "string") {
      return res.status(400).json({ error: `Repeat the ${key} filter only once.` });
    }
  }

  const page = query.page === undefined ? 1 : Number(query.page);
  if (!Number.isInteger(page) || page < 1 || page > 100000) {
    return res.status(400).json({ error: "Page must be a positive integer." });
  }
  const size = query.size === undefined ? AUDIT_PAGE.DEFAULT_PAGE_SIZE : Number(query.size);
  if (!AUDIT_PAGE.PAGE_SIZES.includes(size)) {
    return res.status(400).json({ error: `Page size must be one of ${AUDIT_PAGE.PAGE_SIZES.join(", ")}.` });
  }
  const sort = query.sort === undefined ? AUDIT_PAGE.DEFAULT_SORT : query.sort;
  if (!Object.prototype.hasOwnProperty.call(AUDIT_PAGE.SORTABLE, sort)) {
    return res.status(400).json({ error: `Sort must be one of ${Object.keys(AUDIT_PAGE.SORTABLE).join(", ")}.` });
  }
  const dir = query.dir === undefined ? AUDIT_PAGE.DEFAULT_DIRECTION : query.dir;
  if (!["asc", "desc"].includes(dir)) {
    return res.status(400).json({ error: "Direction must be asc or desc." });
  }
  if (query.source !== undefined && !AUDIT_PAGE.SOURCES.includes(query.source)) {
    return res.status(400).json({ error: `Source must be one of ${AUDIT_PAGE.SOURCES.join(", ")}.` });
  }
  for (const key of ["from", "to"]) {
    if (query[key] !== undefined && !isIsoInstant(query[key])) {
      return res.status(400).json({ error: `The ${key} date must be an ISO date.` });
    }
  }
  if (query.from && query.to && Date.parse(query.from) > Date.parse(query.to)) {
    return res.status(400).json({ error: "The from date must not be after the to date." });
  }
  for (const key of ["clientId", "taskId"]) {
    if (query[key] !== undefined && !UUID_PATTERN.test(query[key])) {
      return res.status(400).json({ error: `The ${key} filter must be a uuid.` });
    }
  }
  for (const key of ["q", "category", "actorType"]) {
    if (query[key] !== undefined && query[key].length > 120) {
      return res.status(400).json({ error: `The ${key} filter is too long.` });
    }
  }
  if (query.all !== undefined && query.all !== "1") {
    return res.status(400).json({ error: "Use all=1 to download every matching row." });
  }

  req.auditQuery = {
    page,
    pageSize: size,
    sort,
    direction: dir,
    all: query.all === "1",
    search: query.q || "",
    source: query.source || "",
    category: query.category || "",
    actorType: query.actorType || "",
    from: query.from || "",
    to: query.to || "",
    clientId: query.clientId || "",
    taskId: query.taskId || "",
  };
  next();
}

function validateScreening(req, res, next) {
  const body = req.body;
  if (!isPlainObject(body) || Object.keys(body).some(k => !["screeningType", "simulateFlag"].includes(k)) ||
    !SCREENING_TYPES.includes(body.screeningType) || (body.simulateFlag !== undefined && typeof body.simulateFlag !== "boolean")) {
    return res.status(400).json({ error: "Choose a PEP or terrorism financing check; simulateFlag must be a boolean." });
  }
  if (body.simulateFlag && process.env.NODE_ENV === "production") {
    return res.status(400).json({ error: "Simulated flags are disabled in production." });
  }
  next();
}

function validateCpdRecord(req, res, next) {
  const body = req.body;
  if (!isPlainObject(body) || Object.keys(body).some(k => !["activity", "hours", "completedOn"].includes(k))) {
    return res.status(400).json({ error: "Supply activity, hours and completedOn." });
  }
  const { activity, hours, completedOn } = body;
  if (typeof activity !== "string" || !activity.trim() || activity.trim().length > 200) {
    return res.status(400).json({ error: "Activity must contain 1 to 200 characters." });
  }
  if (typeof hours !== "number" || !Number.isFinite(hours) || hours <= 0 || hours > 100 || Math.abs(hours * 100 - Math.round(hours * 100)) > 1e-8) {
    return res.status(400).json({ error: "Hours must be greater than 0 and at most 100, with up to two decimal places." });
  }
  const time = typeof completedOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(completedOn) ? Date.parse(`${completedOn}T00:00:00Z`) : NaN;
  if (!Number.isFinite(time) || completedOn < "0001-01-01" || new Date(time).toISOString().slice(0, 10) !== completedOn || completedOn > southAfricaDate()) {
    return res.status(400).json({ error: "Completion must be a real past-or-today date in YYYY-MM-DD format." });
  }
  req.body.activity = activity.trim();
  next();
}

module.exports = {
  validateProviderMessagePayload,
  validateHandlerPayload,
  validateClientIdParam,
  validateComplianceIds,
  validateAuditLimit,
  validateAuditQuery,
  validateScreening,
  validateCpdRecord,
  validateTaskIdParam,
  validateNewClaimPayload,
  validateNewRequestPayload,
  validateDraftPayload,
  validateTaskUpdatePayload,
  validateClientActionPayload,
  validateDocumentType,
  validateSignaturePayload,
  validateSignedUpload,
  validateNewUserPayload,
  validateNewClientPayload,
  validateCompleteRegistrationPayload,
  validateClientLoginPayload,
  validateUserIdParam,
  validateComplianceUpdate,
};
