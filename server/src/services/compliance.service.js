const { supabaseAdmin } = require("../config/supabaseClient");

// Maps camelCase API field names to the snake_case adviser_compliance columns.
const UPDATABLE_FIELDS = {
  qualificationStatus: "qualification_status",
  cpdStatus: "cpd_status",
  isPoliticallyExposed: "is_politically_exposed",
  pepDetails: "pep_details",
  terrorismFinancingFlag: "terrorism_financing_flag",
  terrorismFinancingDetails: "terrorism_financing_details",
};

function toCamel(row, adviserId) {
  if (!row) {
    return {
      id: null,
      adviserId,
      qualificationStatus: "pending",
      cpdStatus: "not_started",
      isPoliticallyExposed: false,
      pepDetails: null,
      terrorismFinancingFlag: false,
      terrorismFinancingDetails: null,
      createdAt: null,
      updatedAt: null,
    };
  }

  return {
    id: row.id,
    adviserId: row.adviser_id,
    qualificationStatus: row.qualification_status,
    cpdStatus: row.cpd_status,
    isPoliticallyExposed: row.is_politically_exposed,
    pepDetails: row.pep_details,
    terrorismFinancingFlag: row.terrorism_financing_flag,
    terrorismFinancingDetails: row.terrorism_financing_details,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getComplianceRecord(adviserId) {
  const { data, error } = await supabaseAdmin
    .from("adviser_compliance")
    .select("*")
    .eq("adviser_id", adviserId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return toCamel(data, adviserId);
}

async function updateComplianceRecord(adviserId, updates) {
  const payload = { adviser_id: adviserId, updated_at: new Date().toISOString() };

  for (const [camelKey, dbKey] of Object.entries(UPDATABLE_FIELDS)) {
    if (Object.prototype.hasOwnProperty.call(updates, camelKey)) {
      payload[dbKey] = updates[camelKey];
    }
  }

  const { data, error } = await supabaseAdmin
    .from("adviser_compliance")
    .upsert(payload, { onConflict: "adviser_id" })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return toCamel(data, adviserId);
}

module.exports = { getComplianceRecord, updateComplianceRecord };
