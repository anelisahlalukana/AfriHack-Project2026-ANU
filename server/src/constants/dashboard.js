// Thresholds and windows for the advisor dashboard (services/dashboard.service.js).
const BUSINESS_TIME_ZONE = "Africa/Johannesburg";

// A client still onboarding after this long is stalled and needs a nudge.
const STALLED_ONBOARDING_DAYS = 14;
// A client consent expiring within this many days is flagged before it lapses.
const CONSENT_EXPIRY_WARNING_DAYS = 30;
// Reminders due within this many days count as due soon.
const REMINDER_DUE_SOON_DAYS = 7;
const NEW_CLIENT_WINDOW_DAYS = 30;

const ONBOARDING_LIST_LIMIT = 8;
const RECENT_ACTIVITY_LIMIT = 6;

// --- Client Pulse: ranking clients by risk of disengagement (getAtRiskClients).
// A client's score is the sum of the weights of every signal below that applies to them.
// Tune the numbers here; nothing else needs to change.

// A document sent to the client and still unsigned after this many days is a signal.
const UNSIGNED_DOCUMENT_DAYS = 7;
// An open request or claim with no update for this many days is a signal.
const STALE_TASK_DAYS = 7;
// (A client still onboarding after STALLED_ONBOARDING_DAYS, above, is also a signal.)

const RISK_WEIGHTS = {
  unsignedDocument: 3, // per document
  overdueReminder: 1, // per overdue reminder
  staleTask: 3, // per open request or claim
  stalledGoal: 2, // per in-progress goal with no progress
  stalledOnboarding: 4, // once
};

// Clients whose score is not above AT_RISK_MIN_SCORE are left out of the ranking.
const AT_RISK_MIN_SCORE = 2;
// A score above this is "high" risk; anything else that is listed is "medium".
const AT_RISK_HIGH_SCORE = 5;
// How many clients the ranking returns.
const AT_RISK_LIST_LIMIT = 5;
// A check-in message mentions at most this many of the client's flagged signals (heaviest first).
const CHECK_IN_MAX_REASONS = 2;

module.exports = {
  CHECK_IN_MAX_REASONS,
  UNSIGNED_DOCUMENT_DAYS,
  STALE_TASK_DAYS,
  RISK_WEIGHTS,
  AT_RISK_MIN_SCORE,
  AT_RISK_HIGH_SCORE,
  AT_RISK_LIST_LIMIT,
  BUSINESS_TIME_ZONE,
  STALLED_ONBOARDING_DAYS,
  CONSENT_EXPIRY_WARNING_DAYS,
  REMINDER_DUE_SOON_DAYS,
  NEW_CLIENT_WINDOW_DAYS,
  ONBOARDING_LIST_LIMIT,
  RECENT_ACTIVITY_LIMIT,
};
