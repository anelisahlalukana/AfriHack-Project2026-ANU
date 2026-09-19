// Errors that carry the HTTP status the API should answer with. Services throw
// these; controllers reply with res.status(err.status || 500).json({ error: err.message }).
class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const badRequest = (message, details) => new HttpError(400, message, details);
const forbidden = (message = "You do not have access to this record") => new HttpError(403, message);
const notFound = (message = "Not found") => new HttpError(404, message);
const conflict = (message) => new HttpError(409, message);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Last line of defence for ids that reach a service from somewhere other than a validated URL.
function assertUuid(value, name = "id") {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw badRequest(`Invalid ${name}`);
  }
  return value;
}

module.exports = { HttpError, badRequest, forbidden, notFound, conflict, assertUuid };
