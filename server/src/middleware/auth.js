const { supabaseAdmin } = require("../config/supabaseClient");

// Requires a valid Supabase session: `Authorization: Bearer <access_token>`.
// Verifies the token against Supabase Auth and attaches the user to req.user.
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Missing or malformed Authorization header" });
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data?.user) {
    return res.status(401).json({ error: "Invalid or expired session" });
  }

  req.user = data.user;
  next();
}

// Gates a route to specific staff roles (req.user.app_metadata.role), e.g.
// requireRole(["admin"]). Must run after requireAuth.
function requireRole(allowedRoles) {
  return (req, res, next) => {
    const role = req.user?.app_metadata?.role;

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({ error: "Forbidden: insufficient role" });
    }

    next();
  };
}

module.exports = { requireAuth, requireRole };
