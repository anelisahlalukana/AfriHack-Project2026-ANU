const { STAFF_ROLES } = require("../constants/taskConfig");
const { forbidden } = require("../utils/httpError");

// Roles come only from administrator-controlled app_metadata (see docs/setup.md).
function isStaffUser(user) {
  return STAFF_ROLES.includes(user?.app_metadata?.role);
}

// Use after requireAuth.
function requireStaff(req, res, next) {
  if (!isStaffUser(req.user)) {
    const err = forbidden("Only Royal Square staff can do this");
    return res.status(err.status).json({ error: err.message });
  }
  next();
}

module.exports = { isStaffUser, requireStaff };
