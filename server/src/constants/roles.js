// Staff role values, stored in each Supabase auth user's app_metadata.role.
// Clients have no role set (or a non-staff value) and are handled separately
// on the frontend (see client/src/lib/authRoles.js). 'provider' is not a
// logged-in role — it's the mocked external insurer/integration layer (see
// docs/system_requirments.md).
const ROLES = ["admin", "advisor"];

module.exports = { ROLES };
