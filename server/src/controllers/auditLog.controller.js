const auditLogService = require("../services/auditLog.service");

// One feed for every role. The service decides what the caller may see from
// req.user, so there is no per-role endpoint to keep in step.
async function list(req, res) {
  try {
    res.json(await auditLogService.list(req.user, req.auditQuery));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

// The distinct sources, categories and actor types present in this caller's own
// slice of the log, used to build the filter dropdowns.
async function facets(req, res) {
  try {
    res.json(await auditLogService.facets(req.user));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

module.exports = { list, facets };
