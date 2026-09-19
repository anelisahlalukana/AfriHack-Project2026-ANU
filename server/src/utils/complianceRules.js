const { CONSENT_VALIDITY_MONTHS, CONSENT_WARNING_DAYS, CPD_REQUIRED_HOURS, CPD_START_MONTH } = require("../constants/compliance");
const { DOCUMENT_TYPES } = require("../constants/documentTypes");
const { fullName } = require("./fullName");

function addConsentMonths(value) {
  const date = new Date(value);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + CONSENT_VALIDITY_MONTHS);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString();
}

function consentState(row, now = new Date()) {
  const empty = { state: "not_signed", signed: false, expired: null, valid: false, signedAt: null, expiresAt: null };
  if (!row || row.status !== "signed") return empty;
  const signed = Date.parse(row.signed_at);
  const time = new Date(now).getTime();
  if (!Number.isFinite(signed) || signed > time) return { ...empty, state: "invalid" };
  const expiresAt = row.expires_at ?? addConsentMonths(row.signed_at);
  const expiry = Date.parse(expiresAt);
  if (!Number.isFinite(expiry) || expiry <= signed) return { ...empty, state: "invalid", signedAt: row.signed_at };
  const expired = expiry <= time;
  return { state: expired ? "expired" : expiry - time <= CONSENT_WARNING_DAYS * 86400000 ? "expiring" : "valid",
    signed: true, expired, valid: !expired, signedAt: row.signed_at, expiresAt };
}

function southAfricaDate(now = new Date()) {
  return new Date(new Date(now).getTime() + 2 * 3600000).toISOString().slice(0, 10);
}

function cpdCycle(now = new Date()) {
  const today = southAfricaDate(now);
  const year = Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < CPD_START_MONTH ? 1 : 0);
  return { start: `${year}-${String(CPD_START_MONTH).padStart(2, "0")}-01`,
    end: new Date(Date.UTC(year + 1, CPD_START_MONTH - 1, 0)).toISOString().slice(0, 10) };
}

function cpdSummary(records, now = new Date()) {
  const cycle = cpdCycle(now);
  const hundredths = records.filter(r => r.completed_on >= cycle.start && r.completed_on <= cycle.end)
    .reduce((sum, r) => sum + Math.round(Number(r.hours) * 100), 0);
  const hours = hundredths / 100;
  return { ...cycle, hours, requiredHours: CPD_REQUIRED_HOURS, remainingHours: Math.max(0, CPD_REQUIRED_HOURS - hours),
    status: hours >= CPD_REQUIRED_HOURS ? "up_to_date" : hours > 0 ? "in_progress" : "not_started" };
}

function screeningState(records, type, declaredPep) {
  const latest = records.filter(r => r.screening_type === type)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || String(b.id).localeCompare(String(a.id)))[0];
  return { status: type === "pep" && declaredPep ? "flagged" : latest?.result || "not_screened",
    declared: type === "pep" && Boolean(declaredPep), checkedAt: latest?.created_at || null,
    source: latest?.provider || null, simulated: latest?.simulated ?? false };
}

function clientCompliance(client, documents, screenings, now = new Date()) {
  const duplicates = DOCUMENT_TYPES.filter(meta => documents.filter(d => d.document_type === meta.type).length > 1);
  const consentRows = documents.filter(d => d.document_type === "client_consent");
  const consent = consentRows.length > 1 ? { ...consentState(null, now), state: "invalid" } : consentState(consentRows[0], now);
  const outstanding = DOCUMENT_TYPES.filter(meta => {
    const rows = documents.filter(d => d.document_type === meta.type);
    return rows.length !== 1 || rows[0].status !== "signed";
  });
  const pep = screeningState(screenings, "pep", client.is_politically_exposed);
  const terrorismFinancing = screeningState(screenings, "terrorism_financing", false);
  const actions = [];
  if (!consent.valid) actions.push(consent.state === "invalid" ? "Review the invalid or duplicate consent record." : "Obtain current signed client consent.");
  for (const [label, check] of [["PEP", pep], ["Terrorism financing", terrorismFinancing]]) {
    if (check.status === "flagged") actions.push(`Review the flagged ${label} check.`);
    if (check.status === "not_screened") actions.push(`Run the ${label} check.`);
  }
  for (const doc of outstanding) actions.push(`Complete ${doc.label}.`);
  for (const doc of duplicates) actions.push(`Resolve duplicate ${doc.label} records.`);
  const status = actions.length ? "action_required" : consent.state === "expiring" ? "attention" : "compliant";
  if (consent.state === "expiring") actions.push("Renew client consent within 30 days.");
  return { clientId: client.id, name: fullName(client) || "Client", status, consent, pep, terrorismFinancing,
    documents: { signed: DOCUMENT_TYPES.length - outstanding.length, total: DOCUMENT_TYPES.length,
      outstanding: outstanding.map(d => ({ type: d.type, label: d.label })) }, actions };
}

module.exports = { addConsentMonths, consentState, southAfricaDate, cpdCycle, cpdSummary, screeningState, clientCompliance };
