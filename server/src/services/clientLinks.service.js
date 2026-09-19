// Links a client's own login to the client record their adviser manages,
// so the client can report claims and track requests. Staff-only.
const { supabaseAdmin } = require("../config/supabaseClient");
const { getClientForAccess, resolveAccess } = require("./taskAccess.service");
const { isStaffUser } = require("../middleware/roles");
const { badRequest, conflict, notFound } = require("../utils/httpError");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function findAuthUserByEmail(email) {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const match = data.users.find((u) => (u.email || "").toLowerCase() === target);
    if (match) return match;
    if (data.users.length < 200) break;
  }
  return null;
}

async function linkClientAccount(access, clientId, email) {
  const client = await getClientForAccess(access, clientId);
  if (typeof email !== "string" || !EMAIL_PATTERN.test(email.trim())) throw badRequest("Enter the client's login email");

  const user = await findAuthUserByEmail(email.trim());
  if (!user) throw notFound("No account uses that email. Ask the client to sign up first.");
  if (isStaffUser(user)) throw badRequest("That email belongs to a staff account, not a client");

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("clients")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing && existing.id !== client.id) throw conflict("That login is already linked to another client");

  const { error } = await supabaseAdmin.from("clients").update({ auth_user_id: user.id }).eq("id", client.id);
  if (error) throw new Error(error.message);
  return { clientId: client.id, linkedEmail: user.email };
}

async function unlinkClientAccount(access, clientId) {
  const client = await getClientForAccess(access, clientId);
  const { error } = await supabaseAdmin.from("clients").update({ auth_user_id: null }).eq("id", client.id);
  if (error) throw new Error(error.message);
  return { clientId: client.id, linkedEmail: null };
}

async function getLinkStatus(access, clientId) {
  const client = await getClientForAccess(access, clientId);
  if (!client.auth_user_id) return { clientId: client.id, linked: false, linkedEmail: null };
  const { data, error } = await supabaseAdmin.auth.admin.getUserById(client.auth_user_id);
  if (error) throw new Error(error.message);
  return { clientId: client.id, linked: true, linkedEmail: data.user?.email || null };
}

// For the signed-in user: are they staff, or which client record are they?
async function whoAmI(user) {
  const access = await resolveAccess(user);
  if (access.role === "staff") return { role: "staff", client: null };
  return {
    role: "client",
    client: access.client ? { id: access.client.id, name: `${access.client.first_name} ${access.client.surname}` } : null,
  };
}

module.exports = { linkClientAccount, unlinkClientAccount, getLinkStatus, whoAmI };
