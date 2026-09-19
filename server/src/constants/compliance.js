// Prototype policies, pending confirmation against Royal Square's licence and mandate.
const CONSENT_VALIDITY_MONTHS = 12;
const CONSENT_WARNING_DAYS = 30;
const CPD_REQUIRED_HOURS = 18;
const CPD_START_MONTH = 6;
const SCREENING_TYPES = ["pep", "terrorism_financing"];
const SCREENING_SOURCE = "Royal Square mock screening";
const AUDIT_DEFAULT_LIMIT = 50;
const AUDIT_MAX_LIMIT = 200;
const PAGE_SIZE = 500;
const EVENTS = {
  SCREENING: "screening_performed",
  CONSENT_SIGNED: "consent_signed",
  CONSENT_RENEWED: "consent_renewed",
  ADVISER_UPDATED: "adviser_compliance_updated",
  CPD_ADDED: "cpd_record_added",
  PULL_ALLOWED: "financial_pull_allowed",
  PULL_BLOCKED: "financial_pull_blocked",
};
module.exports = { CONSENT_VALIDITY_MONTHS, CONSENT_WARNING_DAYS, CPD_REQUIRED_HOURS,
  CPD_START_MONTH, SCREENING_TYPES, SCREENING_SOURCE, AUDIT_DEFAULT_LIMIT, AUDIT_MAX_LIMIT, PAGE_SIZE, EVENTS };
