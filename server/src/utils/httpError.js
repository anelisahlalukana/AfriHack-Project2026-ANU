// An error that carries the HTTP status the API should answer with.
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

// Wraps an async controller so thrown HttpErrors become clean JSON responses
// and anything unexpected becomes a 500 without leaking internals.
function handle(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof HttpError) {
        return res.status(err.status).json({ error: err.message, details: err.details });
      }
      console.error(`[${req.method} ${req.originalUrl}]`, err);
      res.status(500).json({ error: "Something went wrong. Please try again." });
    }
  };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function assertUuid(value, name = "id") {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw badRequest(`Invalid ${name}`);
  }
  return value;
}

module.exports = { HttpError, badRequest, forbidden, notFound, conflict, handle, assertUuid };
