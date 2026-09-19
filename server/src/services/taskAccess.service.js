const { supabaseAdmin } = require("../config/supabaseClient");
const { isStaffUser } = require("../middleware/roles");
const { forbidden, notFound, badRequest, assertUuid } = require("../utils/httpError");

const CLIENT_COLUMNS = "id, advisor_id, auth_user_id, first_name, surname, contact_email";

// Works out who is calling: a staff member (sees the clients they manage) or a
// client (sees only the client record linked to their login).
async function resolveAccess(user) {
  if (isStaffUser(user)) {
    return { role: "staff", userId: user.id, label: user.user_metadata?.full_name || user.email };
  }

  const { data, error } = await supabaseAdmin
    .from("clients")
    .select(CLIENT_COLUMNS)
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);

  return {
    role: "client",
    userId: user.id,
    clientId: data?.id || null,
    client: data || null,
    label: data ? `${data.first_name} ${data.surname}` : user.email,
  };
}

function requireLinkedClient(access) {
  if (access.role === "client" && !access.clientId) {
    throw forbidden(
      "Your login is not linked to a client record yet. Ask your adviser to link your account."
    );
  }
}

// Loads a client the caller may act for. Staff may act for the clients they manage.
async function getClientForAccess(access, clientId) {
  if (access.role === "client") {
    requireLinkedClient(access);
    if (clientId && clientId !== access.clientId) throw forbidden();
    return access.client;
  }

  if (!clientId) throw badRequest("clientId is required");
  assertUuid(clientId, "clientId");
  const { data, error } = await supabaseAdmin
    .from("clients")
    .select(CLIENT_COLUMNS)
    .eq("id", clientId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw notFound("Client not found");
  if (data.advisor_id !== access.userId) throw forbidden();
  return data;
}

// Loads a task plus its client and provider, and checks the caller may see it.
async function getTaskForAccess(access, taskId) {
  assertUuid(taskId, "task id");
  requireLinkedClient(access);

  const { data, error } = await supabaseAdmin
    .from("tasks")
    .select(`*, clients!inner(${CLIENT_COLUMNS}), providers(id, name, reference_prefix, product_lines)`)
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw notFound("Request not found");

  const allowed =
    access.role === "staff"
      ? data.clients.advisor_id === access.userId
      : data.client_id === access.clientId;
  if (!allowed) throw notFound("Request not found");

  return data;
}

module.exports = { resolveAccess, requireLinkedClient, getClientForAccess, getTaskForAccess };
