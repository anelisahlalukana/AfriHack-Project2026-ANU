const test = require("node:test");
const assert = require("node:assert/strict");
const { fakeDatabase } = require("./helpers/complianceDb");
const { createComplianceService } = require("../src/services/compliance.service");
const { createSharedService } = require("../src/services/reminders.service");
const { createAuditService } = require("../src/services/complianceAudit.service");
const { DOCUMENT_TYPES } = require("../src/constants/documentTypes");
const now = () => new Date("2026-09-19T12:00:00Z");
const actor = { id: "adviser", app_metadata: { role: "advisor" }, user_metadata: { full_name: "Verified Adviser" } };
const client = { id: "client", role_id: 1, first_name: "Test", surname: "Client" };
const consent = { id: "consent", client_id: "client", document_type: "client_consent", status: "signed", signed_at: "2026-01-01T00:00:00Z", expires_at: "2099-01-01T00:00:00Z" };
const logger = { error() {} };
function service(db, extra = {}) { return createComplianceService({ db, now, logger, ...extra }); }

test("consent gate authorizes, blocks, attributes actor and does not audit ordinary reads", async () => {
  const db = fakeDatabase({ documents: [consent] });
  const api = service(db);
  assert.equal(await api.isClientConsentValid("client"), true);
  assert.equal(db.tables.compliance_audit_log, undefined);
  assert.equal((await api.checkFinancialPullConsent("client", actor)).valid, true);
  let audit = db.tables.compliance_audit_log.at(-1);
  assert.equal(audit.event_type, "financial_pull_allowed");
  assert.equal(audit.actor_id, actor.id);
  assert.equal(audit.actor_name, "Verified Adviser");
  db.tables.documents[0].expires_at = "2026-02-01T00:00:00Z";
  assert.equal((await api.checkFinancialPullConsent("client", actor)).valid, false);
  assert.equal(db.tables.compliance_audit_log.at(-1).event_type, "financial_pull_blocked");
});
test("missing compliance tables identify the required migration without displaying database internals", async () => {
  const db = fakeDatabase();
  db.failures.client_screenings = { code: "PGRST205", message: "Internal database details" };
  await assert.rejects(service(db).getSummary(), error => error.status === 503 &&
    error.message.includes("202609190012_compliance.sql") && !error.message.includes("Internal database details"));
});
test("consent lookup and audit failures fail closed in the real reminders service", async () => {
  const normalized = { id: actor.id, role: "adviser", name: "Verified Adviser" };
  for (const failure of ["documents", "compliance_audit_log", "expired", "duplicate"]) {
    const db = fakeDatabase({ users: [client], documents: [consent] });
    if (failure === "expired") db.tables.documents[0].expires_at = "2026-02-01T00:00:00Z";
    else if (failure === "duplicate") db.tables.documents.push({ ...consent, id: "duplicate" });
    else db.failures[failure] = { code: "OFFLINE" };
    const reminders = createSharedService({ db, checkConsent: service(db).checkFinancialPullConsent });
    await assert.rejects(reminders.financialPull(normalized, "client"));
    assert.equal(db.tables.financial_snapshots, undefined);
    if (failure !== "compliance_audit_log") assert.equal(db.tables.compliance_audit_log.at(-1).event_type, "financial_pull_blocked");
  }
  const db = fakeDatabase({ users: [client], documents: [consent] });
  const reminders = createSharedService({ db, checkConsent: service(db).checkFinancialPullConsent });
  await reminders.financialPull(normalized, "client");
  assert.equal(db.tables.financial_snapshots.length, 1);
  assert.equal(db.tables.compliance_audit_log[0].actor_name, normalized.name);
  const auditIndex = db.calls.findIndex(c => c.table === "compliance_audit_log");
  assert.ok(auditIndex < db.calls.findIndex(c => c.table === "financial_snapshots"));
});
test("when verification and auditing are unavailable the gate still throws", async () => {
  const db = fakeDatabase();
  db.failures.documents = db.failures.compliance_audit_log = { code: "OFFLINE" };
  await assert.rejects(service(db).checkFinancialPullConsent("client", actor), /unavailable/);
});
test("consent signing audit failure is nonfatal, first signing and renewal are distinguished", async () => {
  const db = fakeDatabase();
  const audit = createAuditService(db, logger);
  await audit.logConsentSigning("client", consent, null, actor);
  await audit.logConsentSigning("client", consent, consent, actor);
  assert.deepEqual(db.tables.compliance_audit_log.map(r => r.event_type), ["consent_signed", "consent_renewed"]);
  db.failures.compliance_audit_log = { code: "OFFLINE" };
  await assert.doesNotReject(audit.logConsentSigning("client", consent, consent, actor));
});
test("summary pages through capped data, filters providers and counts clients not checks", async () => {
  const db = fakeDatabase({ users: [client, { ...client, id: "provider", role_id: 2 }],
    documents: DOCUMENT_TYPES.map((d, i) => ({ ...consent, id: `d${i}`, document_type: d.type })),
    client_screenings: [{ id: "s1", client_id: "client", screening_type: "pep", result: "flagged", created_at: "2026-01-01" },
      { id: "s2", client_id: "client", screening_type: "pep", result: "clear", created_at: "2026-02-01" },
      { id: "s3", client_id: "client", screening_type: "terrorism_financing", result: "clear", created_at: "2026-02-01" }] });
  db.pageCap = 2;
  const view = await service(db).getSummary();
  assert.equal(view.summary.clients, 1);
  assert.equal(view.summary.compliant, 1);
  assert.equal(view.summary.screeningsFlagged, 0);
  assert.equal(view.clients[0].documents.signed, 5);
  assert.equal(db.tables.compliance_audit_log, undefined);
});
test("client audit is filtered before limit and remains newest first", async () => {
  const db = fakeDatabase({ users: [client], compliance_audit_log: [
    { id: "1", client_id: "other", created_at: "2026-09-19" },
    { id: "2", client_id: "client", created_at: "2026-09-18" },
    { id: "3", client_id: "client", created_at: "2026-09-19" },
  ] });
  assert.deepEqual((await service(db).getAudit({ clientId: "client", limit: 1 })).map(r => r.id), ["3"]);
});
test("screening uses declaration, mock metadata and a transactional RPC; production simulation rejected", async () => {
  const db = fakeDatabase({ users: [{ ...client, is_politically_exposed: true }] });
  await service(db).runScreening("client", { screeningType: "pep" }, actor);
  const call = db.calls.find(c => c.rpc);
  assert.equal(call.rpc, "compliance_record_change");
  assert.equal(call.args.p_values.result, "flagged");
  assert.equal(call.args.p_audit.metadata.simulated, true);
  assert.equal(call.args.p_actor, actor.id);
  await assert.rejects(service(db, { environment: "production" }).runScreening("client", { screeningType: "pep", simulateFlag: true }, actor), /disabled/);
});
test("adviser identity, self-only writes, derived cycle status and mutation auditing", async () => {
  const db = fakeDatabase({ adviser_compliance: [{ adviser_id: actor.id, cpd_status: "up_to_date" }],
    adviser_cpd_records: [{ id: "old", adviser_id: actor.id, activity: "Old cycle", hours: 18, completed_on: "2026-05-31" }] }, { adviser: actor });
  const api = service(db);
  assert.equal((await api.getComplianceRecord(actor.id)).cpdStatus, "not_started");
  await assert.rejects(api.getComplianceRecord("not-an-adviser"), /not found/);
  await assert.rejects(api.updateComplianceRecord("other", {}, actor), /Only the adviser/);
  await api.addCpdRecord(actor.id, { activity: "Course", hours: 0.5, completedOn: "2026-09-01" }, actor);
  const call = db.calls.find(c => c.rpc);
  assert.equal(call.args.p_audit.event_type, "cpd_record_added");
  assert.equal(call.args.p_values.hours, 0.5);
});
