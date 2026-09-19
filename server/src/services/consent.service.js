const { supabaseAdmin } = require("../config/supabaseClient");
const { consentState } = require("../utils/complianceRules");
const { HttpError } = require("../utils/httpError");

function createConsentService(db = supabaseAdmin, now = () => new Date()) {
  async function getConsentStatus(clientId) {
    const { data, error } = await db.from("documents").select("id,status,signed_at,expires_at")
      .eq("client_id", clientId).eq("document_type", "client_consent").limit(2);
    if (error) throw new HttpError(503, "Consent verification is unavailable. Please try again.");
    if (data?.length > 1) return { ...consentState(null, now()), state: "invalid" };
    return consentState(data?.[0], now());
  }
  return { getConsentStatus };
}
module.exports = { ...createConsentService(), createConsentService };
