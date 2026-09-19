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

module.exports = {
  BUSINESS_TIME_ZONE,
  STALLED_ONBOARDING_DAYS,
  CONSENT_EXPIRY_WARNING_DAYS,
  REMINDER_DUE_SOON_DAYS,
  NEW_CLIENT_WINDOW_DAYS,
  ONBOARDING_LIST_LIMIT,
  RECENT_ACTIVITY_LIMIT,
};
