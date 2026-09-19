const { supabaseAdmin } = require("../config/supabaseClient");
const { ROLES, CLIENT_ROLE_ID } = require("../constants/roles");

// Guards the /api/clients/:clientId/... routes, which used to accept any signed-in
// user. Advisors can reach any client (matching the advisor RLS policy); a client
// can only reach their own record; admins never see client data. Runs after
// requireAuth.
async function requireClientAccess(req, res, next) {
  const role = req.user?.app_metadata?.role;

  if (role === "advisor") return next();
  if (ROLES.includes(role)) {
    return res.status(403).json({ error: "Forbidden: insufficient role" });
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id")
    .eq("id", req.params.clientId)
    .eq("auth_user_id", req.user.id)
    .eq("role_id", CLIENT_ROLE_ID)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data) return res.status(403).json({ error: "Forbidden: you can only access your own documents" });

  next();
}

// A client can only sign a document that has actually been sent to them; sending
// is the adviser's (or registration's) step. Advisors are not restricted. Runs
// after requireClientAccess.
async function requireSentToClient(req, res, next) {
  if (req.user?.app_metadata?.role === "advisor") return next();

  const { data, error } = await supabaseAdmin
    .from("documents")
    .select("status")
    .eq("client_id", req.params.clientId)
    .eq("document_type", req.params.type)
    .maybeSingle();

  if (error) return res.status(500).json({ error: error.message });
  if (!data || data.status === "not_sent") {
    return res.status(403).json({ error: "This document hasn't been sent to you yet" });
  }

  next();
}

module.exports = { requireClientAccess, requireSentToClient };
