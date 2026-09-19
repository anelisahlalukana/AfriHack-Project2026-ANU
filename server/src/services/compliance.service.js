const { supabaseAdmin } = require("../config/supabaseClient");
const { CLIENT_ROLE_ID, ADVISOR_ROLE } = require("../constants/roles");
const { EVENTS, SCREENING_TYPES, SCREENING_SOURCE, PAGE_SIZE, AUDIT_DEFAULT_LIMIT } = require("../constants/compliance");
const { clientCompliance, cpdSummary } = require("../utils/complianceRules");
const { HttpError, notFound, forbidden, badRequest } = require("../utils/httpError");
const { createConsentService } = require("./consent.service");
const { createAuditService, auditActor } = require("./complianceAudit.service");

const CLIENT_COLUMNS = "id,first_name,second_name,surname,is_politically_exposed";
const DOCUMENT_COLUMNS = "id,client_id,document_type,status,signed_at,expires_at";
const UPDATABLE_FIELDS = { qualificationStatus: "qualification_status", isPoliticallyExposed: "is_politically_exposed",
  pepDetails: "pep_details", terrorismFinancingFlag: "terrorism_financing_flag", terrorismFinancingDetails: "terrorism_financing_details" };

function createComplianceService({ db = supabaseAdmin, now = () => new Date(), logger = console, environment = process.env.NODE_ENV } = {}) {
  const { getConsentStatus } = createConsentService(db, now);
  const { writeAudit } = createAuditService(db, logger);
  async function result(query) {
    const { data, error } = await query;
    if (error) {
      logger.error("[Compliance] Database operation failed:", error.code || "unknown");
      throw new HttpError(503, "Compliance data is unavailable. Check the compliance migration and try again.");
    }
    return data;
  }
  async function allRows(table, columns, configure = q => q) {
    const rows = [];
    // Page until empty, not until a short response (the database may cap below PAGE_SIZE).
    for (;;) {
      const page = await result(configure(db.from(table).select(columns)).order("id").range(rows.length, rows.length + PAGE_SIZE - 1));
      if (!page?.length) return rows;
      rows.push(...page);
    }
  }
  async function getClient(clientId) {
    const row = await result(db.from("users").select(CLIENT_COLUMNS).eq("role_id", CLIENT_ROLE_ID).eq("id", clientId).maybeSingle());
    if (!row) throw notFound("Client not found");
    return row;
  }
  async function requireAdviser(adviserId) {
    const { data, error } = await db.auth.admin.getUserById(adviserId);
    if (error && error.status !== 404) throw new HttpError(503, "Adviser verification is unavailable.");
    if (error || data?.user?.app_metadata?.role !== ADVISOR_ROLE) throw notFound("Adviser not found");
  }
  async function getClientCompliance(clientId) {
    const client = await getClient(clientId);
    const [documents, screenings] = await Promise.all([
      allRows("documents", DOCUMENT_COLUMNS, q => q.eq("client_id", clientId)),
      allRows("client_screenings", "*", q => q.eq("client_id", clientId)),
    ]);
    return clientCompliance(client, documents, screenings, now());
  }
  async function getSummary() {
    const [clients, documents, screenings] = await Promise.all([
      allRows("users", CLIENT_COLUMNS, q => q.eq("role_id", CLIENT_ROLE_ID)),
      allRows("documents", DOCUMENT_COLUMNS), allRows("client_screenings", "*"),
    ]);
    function byClient(rows) {
      const grouped = new Map();
      for (const row of rows) {
        if (!grouped.has(row.client_id)) grouped.set(row.client_id, []);
        grouped.get(row.client_id).push(row);
      }
      return grouped;
    }
    const docsByClient = byClient(documents), checksByClient = byClient(screenings);
    const evaluatedAt = now();
    const views = clients.map(c => clientCompliance(c, docsByClient.get(c.id) || [], checksByClient.get(c.id) || [], evaluatedAt));
    return { summary: { clients: views.length, compliant: views.filter(c => c.status === "compliant").length,
      actionRequired: views.filter(c => c.status === "action_required").length,
      consentExpiring: views.filter(c => c.consent.state === "expiring").length,
      screeningsFlagged: views.filter(c => c.pep.status === "flagged" || c.terrorismFinancing.status === "flagged").length,
      documentsOutstanding: views.filter(c => c.documents.outstanding.length).length }, clients: views };
  }
  async function getAudit({ clientId, limit = AUDIT_DEFAULT_LIMIT } = {}) {
    if (clientId) await getClient(clientId);
    let query = db.from("compliance_audit_log").select("id,event_type,summary,result,actor_name,client_id,adviser_id,created_at");
    if (clientId) query = query.eq("client_id", clientId);
    const rows = await result(query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit));
    return rows.map(r => ({ id: r.id, eventType: r.event_type, summary: r.summary, result: r.result,
      actorName: r.actor_name, clientId: r.client_id, adviserId: r.adviser_id, createdAt: r.created_at }));
  }
  async function recordChange(kind, target, values, actor, audit) {
    if (actor?.app_metadata?.role !== ADVISOR_ROLE) throw forbidden();
    return result(db.rpc("compliance_record_change", { p_kind: kind, p_target: target, p_values: values,
      p_actor: actor.id, p_actor_name: auditActor(actor).actor_name, p_audit: audit }));
  }
  async function runScreening(clientId, { screeningType, simulateFlag = false }, actor) {
    if (!SCREENING_TYPES.includes(screeningType) || typeof simulateFlag !== "boolean") throw badRequest("Invalid screening request");
    if (simulateFlag && environment === "production") throw badRequest("Simulated flags are disabled in production.");
    const client = await getClient(clientId);
    const outcome = simulateFlag || (screeningType === "pep" && client.is_politically_exposed) ? "flagged" : "clear";
    const row = await recordChange("screening", clientId, { screening_type: screeningType, result: outcome,
      provider: SCREENING_SOURCE, simulated_flag: simulateFlag }, actor,
    { event_type: EVENTS.SCREENING, summary: `${screeningType === "pep" ? "PEP" : "Terrorism financing"} check performed (mock)`,
      result: outcome, metadata: { screeningType, source: SCREENING_SOURCE, simulated: true, simulateFlag } });
    return { screening: { id: row.id, screeningType, result: outcome, source: row.provider, simulated: true, createdAt: row.created_at },
      compliance: await getClientCompliance(clientId) };
  }
  async function getComplianceRecord(adviserId) {
    await requireAdviser(adviserId);
    const [row, records] = await Promise.all([
      result(db.from("adviser_compliance").select("*").eq("adviser_id", adviserId).maybeSingle()),
      allRows("adviser_cpd_records", "*", q => q.eq("adviser_id", adviserId)),
    ]);
    const cpd = cpdSummary(records, now());
    return { id: row?.id || null, adviserId, qualificationStatus: row?.qualification_status || "pending", cpdStatus: cpd.status,
      isPoliticallyExposed: row?.is_politically_exposed || false, pepDetails: row?.pep_details || null,
      terrorismFinancingFlag: row?.terrorism_financing_flag || false, terrorismFinancingDetails: row?.terrorism_financing_details || null,
      createdAt: row?.created_at || null, updatedAt: row?.updated_at || null,
      cpd: { ...cpd, records: records.sort((a, b) => b.completed_on.localeCompare(a.completed_on) || b.id.localeCompare(a.id))
        .map(r => ({ id: r.id, activity: r.activity, hours: Number(r.hours), completedOn: r.completed_on })) } };
  }
  async function updateComplianceRecord(adviserId, updates, actor) {
    if (actor?.id !== adviserId) throw forbidden("Only the adviser may change their own compliance record.");
    await requireAdviser(adviserId);
    const values = Object.fromEntries(Object.entries(UPDATABLE_FIELDS).filter(([key]) => Object.hasOwn(updates, key)).map(([key, column]) => [column, updates[key]]));
    await recordChange("adviser", adviserId, values, actor, { event_type: EVENTS.ADVISER_UPDATED,
      summary: "Adviser compliance updated", result: "updated", metadata: { fields: Object.keys(values) } });
    return getComplianceRecord(adviserId);
  }
  async function addCpdRecord(adviserId, { activity, hours, completedOn }, actor) {
    if (actor?.id !== adviserId) throw forbidden("Only the adviser may add their own CPD activity.");
    await requireAdviser(adviserId);
    const row = await recordChange("cpd", adviserId, { activity, hours, completed_on: completedOn }, actor,
      { event_type: EVENTS.CPD_ADDED, summary: "CPD activity recorded", result: "recorded", metadata: { hours, completedOn } });
    return { record: { id: row.id, activity: row.activity, hours: Number(row.hours), completedOn: row.completed_on },
      compliance: await getComplianceRecord(adviserId) };
  }
  async function isClientConsentValid(clientId) { return (await getConsentStatus(clientId)).valid; }
  async function checkFinancialPullConsent(clientId, actor) {
    let consent;
    try { consent = await getConsentStatus(clientId); }
    catch (error) {
      try { await writeAudit({ event_type: EVENTS.PULL_BLOCKED, summary: "Financial refresh blocked: consent verification unavailable",
        result: "unavailable", client_id: clientId, metadata: {} }, actor); }
      catch { logger.error("[Compliance] Financial refresh blocked; audit storage also unavailable."); }
      throw error;
    }
    await writeAudit({ event_type: consent.valid ? EVENTS.PULL_ALLOWED : EVENTS.PULL_BLOCKED,
      summary: consent.valid ? "Financial refresh permitted by consent" : "Financial refresh blocked by consent",
      result: consent.valid ? "allowed" : "blocked", client_id: clientId,
      metadata: { consentState: consent.state, expiresAt: consent.expiresAt } }, actor);
    return consent;
  }
  return { getSummary, getAudit, getClientCompliance, runScreening, getComplianceRecord, updateComplianceRecord,
    addCpdRecord, isClientConsentValid, checkFinancialPullConsent };
}
module.exports = { ...createComplianceService(), createComplianceService };
