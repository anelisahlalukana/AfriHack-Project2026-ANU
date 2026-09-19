// Staff role values, stored in each Supabase auth user's app_metadata.role.
// Clients have no role set (or a non-staff value) and are handled separately
// on the frontend (see client/src/lib/authRoles.js). 'provider' is not a
// logged-in role — it's the mocked external insurer/integration layer (see
// docs/system_requirments.md).
const ROLES = ["admin", "advisor"];

// public.roles.id for the 'client' row (1 = client, 2 = provider, 3 = advisor).
// This is the database role_id on public.users, not an app_metadata.role value.
const CLIENT_ROLE_ID = 1;

module.exports = { ROLES, CLIENT_ROLE_ID };
