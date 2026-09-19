// Staff role values, stored in each Supabase auth user's app_metadata.role.
// Clients have no role set (or a non-staff value) and are handled separately
// on the frontend (see client/src/lib/authRoles.js).
const ROLES = ["admin", "advisor", "provider", "broker"];

module.exports = { ROLES };
