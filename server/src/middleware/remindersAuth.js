const { CLIENT_ROLE_ID, ADVISOR_ROLE } = require("../constants/reminders");
const { fullName } = require("../utils/fullName");

function createRemindersAuth(db) {
  return async (req, res, next) => {
    const match = /^Bearer (\S+)$/.exec(req.headers.authorization || "");
    if (!match) return res.status(401).json({ error: "Sign in to access Royal Square." });
    try {
      const { data, error } = await db.auth.getUser(match[1]);
      if (error || !data?.user) return res.status(401).json({ error: "Your session has expired. Sign in again." });
      const auth = data.user;
      const role = auth.app_metadata?.role;
      if (role === ADVISOR_ROLE) {
        req.user = { id: auth.id, role: "adviser", name: auth.user_metadata?.full_name || "Royal Square adviser" };
      } else {
        if (role && role !== "client") return res.status(403).json({ error: "This workspace is for clients and advisers." });
        // Match a trusted database link, never an email address or editable user metadata.
        const { data: clients, error: lookupError } = await db.from("users")
          .select("id, first_name, second_name, surname")
          .eq("role_id", CLIENT_ROLE_ID)
          .eq("auth_user_id", auth.id);
        if (lookupError) throw lookupError;
        if (clients?.length !== 1) return res.status(403).json({ error: "Your account must be linked to one client record by your adviser." });
        const client = clients[0];
        req.user = { id: auth.id, role: "client", clientId: client.id, name: fullName(client) };
      }
      next();
    } catch {
      res.status(503).json({ error: "Account verification is unavailable. Please try again." });
    }
  };
}
module.exports = { createRemindersAuth };
