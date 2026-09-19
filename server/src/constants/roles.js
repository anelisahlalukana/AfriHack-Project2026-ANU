// Staff role values, stored in each Supabase auth user's app_metadata.role.
// Clients have no role set (or a non-staff value) and are handled separately
// on the frontend (see client/src/lib/authRoles.js). Providers sign in to their
// own portal and are not staff (see PROVIDER_ROLE below).
const ROLES = ["admin", "advisor"];

// public.roles.id for the 'client' row (1 = client, 2 = provider, 3 = advisor).
// This is the database role_id on public.users, not an app_metadata.role value.
const CLIENT_ROLE_ID = 1;

// public.roles.id for product providers (the mocked insurers), stored as users rows.
const PROVIDER_ROLE_ID = 2;

// The only staff role that works with client data (claims, requests, FNA).
const ADVISOR_ROLE = "advisor";

// Insurer and product-provider logins (the provider portal). Not staff: they only
// see the claims and requests sent to their organisation. The login carries
// app_metadata.role = 'provider' and app_metadata.provider_id, the id of the
// organisation's public.users row (role_id 2). Only an admin can set either.
const PROVIDER_ROLE = "provider";

// Every login an admin can create.
const ACCOUNT_ROLES = [...ROLES, PROVIDER_ROLE];

module.exports = { ROLES, CLIENT_ROLE_ID, PROVIDER_ROLE_ID, ADVISOR_ROLE, PROVIDER_ROLE, ACCOUNT_ROLES };
