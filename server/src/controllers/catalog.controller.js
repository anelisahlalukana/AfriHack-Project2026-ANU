const catalogService = require("../services/catalog.service");
const taskAccessService = require("../services/taskAccess.service");

// Claim categories, request types and providers: the config the claim and request forms render from.
async function getCatalog(req, res) {
  try {
    const catalog = await catalogService.getCatalog();
    res.json(catalog);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

// Who the signed-in user is for the client portal: staff, or which client record.
async function getMe(req, res) {
  try {
    const me = await taskAccessService.getMe(req.user);
    res.json(me);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

module.exports = { getCatalog, getMe };
