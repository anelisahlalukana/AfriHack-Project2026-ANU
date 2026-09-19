const test = require("node:test");
const assert = require("node:assert/strict");
const { consentState, addConsentMonths, cpdSummary, cpdCycle, clientCompliance, screeningState } = require("../src/utils/complianceRules");
const { DOCUMENT_TYPES } = require("../src/constants/documentTypes");
const now = new Date("2026-09-19T12:00:00Z");
const consent = { document_type: "client_consent", status: "signed", signed_at: "2026-01-01T12:00:00Z", expires_at: "2027-01-01T12:00:00Z" };
test("consent fails closed for missing, unsigned, invalid, future and inconsistent records", () => {
  for (const row of [null, { ...consent, status: "sent" }, { ...consent, signed_at: null },
    { ...consent, signed_at: "2030-01-01" }, { ...consent, expires_at: "bad" }, { ...consent, expires_at: "2025-01-01" }]) {
    assert.equal(consentState(row, now).valid, false);
  }
});
test("consent expiry and warning boundaries are inclusive; warning still permits refresh", () => {
  assert.equal(consentState(consent, now).state, "valid");
  assert.equal(consentState({ ...consent, expires_at: now.toISOString() }, now).state, "expired");
  const expiry = new Date(now.getTime() + 30 * 86400000);
  assert.equal(consentState({ ...consent, expires_at: expiry.toISOString() }, now).state, "expiring");
  assert.equal(consentState({ ...consent, expires_at: expiry.toISOString() }, now).valid, true);
  expiry.setMilliseconds(1);
  assert.equal(consentState({ ...consent, expires_at: expiry.toISOString() }, now).state, "valid");
});
test("fallback adds twelve calendar months, clamps leap day and preserves UTC time", () => {
  assert.equal(addConsentMonths("2024-02-29T15:30:00Z"), "2025-02-28T15:30:00.000Z");
  assert.equal(consentState({ ...consent, expires_at: null }, now).expiresAt, "2027-01-01T12:00:00.000Z");
});
const checks = ["pep", "terrorism_financing"].map(type => ({ id: type, screening_type: type, result: "clear", created_at: "2026-01-01" }));
const docs = DOCUMENT_TYPES.map(d => ({ ...consent, document_type: d.type }));
test("overall priority and unique required documents", () => {
  assert.equal(clientCompliance({ id: "a" }, docs, checks, now).status, "compliant");
  const expiring = docs.map(d => ({ ...d, expires_at: "2026-10-01T00:00:00Z" }));
  assert.equal(clientCompliance({}, expiring, checks, now).status, "attention");
  assert.equal(clientCompliance({}, expiring, [], now).status, "action_required");
  assert.equal(clientCompliance({}, docs.slice(1), checks, now).documents.signed, 4);
  assert.equal(clientCompliance({}, [...docs, consent], checks, now).consent.valid, false);
  assert.equal(clientCompliance({}, docs.map(d => ({ ...d, status: "filed" })), checks, now).documents.signed, 0);
  assert.equal(clientCompliance({ is_politically_exposed: true }, docs, checks, now).status, "action_required");
});
test("latest screening wins per type, deterministic ties, declared PEP overrides clear", () => {
  const rows = [...checks, { id: "z", screening_type: "pep", result: "flagged", created_at: "2026-02-01" },
    { id: "y", screening_type: "pep", result: "clear", created_at: "2026-02-01" }];
  assert.equal(screeningState(rows, "pep", false).status, "flagged");
  assert.equal(screeningState(rows, "terrorism_financing", false).status, "clear");
  assert.equal(screeningState(checks, "pep", true).status, "flagged");
  assert.equal(screeningState([], "pep", false).status, "not_screened");
});
test("CPD follows South African June boundary and excludes historical hours", () => {
  assert.equal(cpdCycle("2026-05-31T21:59:59Z").start, "2025-06-01");
  assert.equal(cpdCycle("2026-05-31T22:00:00Z").start, "2026-06-01");
  const records = [{ hours: 18, completed_on: "2026-05-31" }, { hours: 0.25, completed_on: "2026-06-01" }];
  assert.equal(cpdSummary(records, now).hours, 0.25);
  assert.equal(cpdSummary(records, now).status, "in_progress");
  records.push({ hours: 17.75, completed_on: "2026-09-01" });
  assert.equal(cpdSummary(records, now).status, "up_to_date");
  assert.equal(cpdSummary(records, "2027-06-01T00:00:00Z").status, "not_started");
  assert.equal(cpdSummary([{ hours: 19, completed_on: "2026-09-01" }], now).remainingHours, 0);
});
