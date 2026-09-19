const { supabaseAdmin } = require("../config/supabaseClient");
const { EVENTS } = require("../constants/compliance");

// Accepts server-verified Auth users or the reminders middleware's normalized user.
function auditActor(user) {
  return { actor_id: user?.id || null,
    actor_name: user ? user.name || user.user_metadata?.full_name || user.email || "Authenticated user" : "System" };
}

function createAuditService(db = supabaseAdmin, logger = console) {
  async function writeAudit(event, actor) {
    const { error } = await db.from("compliance_audit_log").insert({ ...event, ...auditActor(actor) });
    if (error) throw new Error("The compliance audit entry could not be saved.");
  }
  async function logConsentSigning(clientId, document, previous, actor) {
    try {
      await writeAudit({ event_type: previous?.signed_at ? EVENTS.CONSENT_RENEWED : EVENTS.CONSENT_SIGNED,
        summary: previous?.signed_at ? "Client consent renewed" : "Client consent signed", result: "signed", client_id: clientId,
        metadata: { documentId: document.id, signedAt: document.signed_at, expiresAt: document.expires_at } }, actor);
    } catch {
      // Deliberate exception: a completed signature remains successful; do not log PII.
      logger.error("[Compliance] Consent signature saved, but its audit entry failed.");
    }
  }
  return { writeAudit, logConsentSigning };
}
module.exports = { ...createAuditService(), createAuditService, auditActor };
