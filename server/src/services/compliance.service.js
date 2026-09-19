const { supabaseAdmin } = require("../config/supabaseClient");

const UPDATABLE_FIELDS = [
  "qualification_status",
  "cpd_status",
  "is_politically_exposed",
  "pep_details",
  "terrorism_financing_flag",
  "terrorism_financing_details",
];

async function getComplianceRecord(adviserId) {
  const { data, error } = await supabaseAdmin
    .from("adviser_compliance")
    .select("*")
    .eq("adviser_id", adviserId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return (
    data || {
      adviser_id: adviserId,
      qualification_status: "pending",
      cpd_status: "not_started",
      is_politically_exposed: false,
      pep_details: null,
      terrorism_financing_flag: false,
      terrorism_financing_details: null,
    }
  );
}

async function updateComplianceRecord(adviserId, updates) {
  const payload = { adviser_id: adviserId, updated_at: new Date().toISOString() };

  for (const field of UPDATABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(updates, field)) {
      payload[field] = updates[field];
    }
  }

  const { data, error } = await supabaseAdmin
    .from("adviser_compliance")
    .upsert(payload, { onConflict: "adviser_id" })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

module.exports = { getComplianceRecord, updateComplianceRecord };
