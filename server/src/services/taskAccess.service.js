const { supabaseAdmin } = require("../config/supabaseClient");
const { CLIENT_ROLE_ID, ADVISOR_ROLE, PROVIDER_ROLE, PROVIDER_ROLE_ID } = require("../constants/roles");
const { forbidden, notFound, badRequest, assertUuid } = require("../utils/httpError");

// Client columns the claims engine needs. Clients are public.users rows with role_id 1.
const CLIENT_COLUMNS = "id, role_id, advisor_id, auth_user_id, first_name, surname, contact_email";

// Tasks point at users twice (client_id and provider_id), so each embed names its foreign key.
const TASK_SELECT = [
  "*",
  `client:users!tasks_client_id_fkey!inner(${CLIENT_COLUMNS})`,
  "provider:users!tasks_provider_id_fkey(id, name:organisation_name, reference_prefix, product_lines)",
].join(", ");

const UUID_OK = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clientName(client) {
  return [client?.first_name, client?.surname].filter(Boolean).join(" ") || "Client";
}

// Works out who is calling. Advisors see the clients assigned to them. Clients see
// only their own users row (matched by auth_user_id). Admins manage staff accounts
// and never see client data, the same rule the FNA tables follow.
async function resolveAccess(user) {
  const role = user?.app_metadata?.role;
  if (role === ADVISOR_ROLE) {
    return { role: "staff", userId: user.id, label: user.user_metadata?.full_name || user.email };
  }
  if (role === PROVIDER_ROLE) {
    throw forbidden("Provider logins use the provider portal.");
  }
  if (role) {
    throw forbidden("Admin accounts manage staff and can't open client claims or requests.");
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .select(CLIENT_COLUMNS)
    .eq("auth_user_id", user.id)
    .eq("role_id", CLIENT_ROLE_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);

  return {
    role: "client",
    userId: user.id,
    clientId: data?.id || null,
    client: data || null,
    label: data ? clientName(data) : user.email,
  };
}

function requireClientRecord(access) {
  if (access.role === "client" && !access.clientId) {
    throw forbidden("We couldn't find your client profile. Please contact your adviser.");
  }
}

// Loads a client the caller may act for. Advisors may act for the clients assigned to them.
async function getClientForAccess(access, clientId) {
  if (access.role === "client") {
    requireClientRecord(access);
    if (clientId && clientId !== access.clientId) throw forbidden();
    return access.client;
  }

  if (!clientId) throw badRequest("Choose which client this is for");
  assertUuid(clientId, "clientId");
  const { data, error } = await supabaseAdmin
    .from("users")
    .select(CLIENT_COLUMNS)
    .eq("id", clientId)
    .eq("role_id", CLIENT_ROLE_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw notFound("Client not found");
  if (data.advisor_id !== access.userId) throw forbidden();
  return data;
}

// Loads a task with its client and provider, and checks the caller may see it.
async function getTaskForAccess(access, taskId) {
  assertUuid(taskId, "task id");
  requireClientRecord(access);

  const { data, error } = await supabaseAdmin.from("tasks").select(TASK_SELECT).eq("id", taskId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw notFound("Claim or request not found");

  const allowed =
    access.role === "staff" ? data.client.advisor_id === access.userId : data.client_id === access.clientId;
  if (!allowed) throw notFound("Claim or request not found");

  return data;
}

// Provider portal: the signed-in login must carry role 'provider' and a provider_id
// that points at a provider organisation (public.users, role_id 2). Both live in
// app_metadata, which only an admin (service role) can set.
async function resolveProviderAccess(user) {
  if (user?.app_metadata?.role !== PROVIDER_ROLE) throw forbidden("The provider portal is for insurers and product providers.");
  const providerId = user.app_metadata.provider_id;
  if (typeof providerId !== "string" || !UUID_OK.test(providerId)) {
    throw forbidden("Your login isn't linked to a provider yet. Ask Royal Square to check it.");
  }
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, name:organisation_name, reference_prefix, product_lines")
    .eq("id", providerId)
    .eq("role_id", PROVIDER_ROLE_ID)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw forbidden("Your login isn't linked to a provider yet. Ask Royal Square to check it.");
  return {
    role: "provider",
    userId: user.id,
    providerId: data.id,
    provider: data,
    label: user.user_metadata?.full_name || user.email,
  };
}

// A task sent to this provider. Drafts never count: the client hasn't submitted them.
async function getTaskForProvider(access, taskId) {
  assertUuid(taskId, "task id");
  const { data, error } = await supabaseAdmin.from("tasks").select(TASK_SELECT).eq("id", taskId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.provider_id !== access.providerId || data.status === "draft") {
    throw notFound("Claim or request not found");
  }
  return data;
}

// For the signed-in user: staff, or which client they are (the client portal uses this).
async function getMe(user) {
  const access = await resolveAccess(user);
  if (access.role === "staff") return { role: "staff", client: null };
  return {
    role: "client",
    client: access.client ? { id: access.client.id, name: clientName(access.client) } : null,
  };
}

module.exports = {
  TASK_SELECT,
  clientName,
  resolveAccess,
  requireClientRecord,
  getClientForAccess,
  getTaskForAccess,
  getMe,
  resolveProviderAccess,
  getTaskForProvider,
};
