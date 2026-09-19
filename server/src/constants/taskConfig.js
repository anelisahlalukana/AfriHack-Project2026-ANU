// Shared constants for the claims & requests engine.
// Stage lists, claim categories and request types live in the database
// (claim_stages, claim_categories, request_types) so they can change without code.

const CLAIM_CATEGORIES = ["motor", "life", "health", "funeral", "personal", "commercial"];

const TASK_STATUSES = ["draft", "open", "awaiting_client", "completed", "declined", "cancelled"];
const CLOSED_STATUSES = ["completed", "declined", "cancelled"];

const CLIENT_ACTION_KINDS = ["confirm", "date", "upload", "review"];

// A task nobody has touched for this long while it waits on Royal Square is overdue.
const OVERDUE_AFTER_HOURS = 48;

const TASK_FILES_BUCKET = process.env.TASK_FILES_BUCKET || "task-files";
const SIGNED_URL_TTL_SECONDS = 60 * 10;
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES = [/^image\//, /^audio\//, /^application\/pdf$/];

const MAX_NOTE_LENGTH = 2000;

// Invented names for the mocked insurer responses (demo data only).
const MOCK_HANDLERS = [
  "Riaan Botha",
  "Lerato Dlamini",
  "Pieter van der Merwe",
  "Ayesha Patel",
  "Sipho Ndlovu",
  "Megan Jacobs",
];

module.exports = {
  CLAIM_CATEGORIES,
  TASK_STATUSES,
  CLOSED_STATUSES,
  CLIENT_ACTION_KINDS,
  OVERDUE_AFTER_HOURS,
  TASK_FILES_BUCKET,
  SIGNED_URL_TTL_SECONDS,
  MAX_UPLOAD_BYTES,
  ALLOWED_UPLOAD_TYPES,
  MAX_NOTE_LENGTH,
  MOCK_HANDLERS,
};
