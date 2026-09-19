const complianceService = require("../services/compliance.service");

async function getCompliance(req, res) {
  try {
    const record = await complianceService.getComplianceRecord(req.params.adviserId);
    res.json({ compliance: record });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function updateCompliance(req, res) {
  try {
    const record = await complianceService.updateComplianceRecord(
      req.params.adviserId,
      req.body || {},
      req.user
    );
    res.json({ compliance: record });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function getSummary(req, res) {
  try { res.json(await complianceService.getSummary()); }
  catch (err) { res.status(err.status || 500).json({ error: err.message }); }
}
async function getAudit(req, res) {
  try { res.json({ entries: await complianceService.getAudit({ clientId: req.params.clientId, limit: req.auditLimit }) }); }
  catch (err) { res.status(err.status || 500).json({ error: err.message }); }
}
async function getClientCompliance(req, res) {
  try { res.json({ compliance: await complianceService.getClientCompliance(req.params.clientId) }); }
  catch (err) { res.status(err.status || 500).json({ error: err.message }); }
}
async function runScreening(req, res) {
  try { res.status(201).json(await complianceService.runScreening(req.params.clientId, req.body, req.user)); }
  catch (err) { res.status(err.status || 500).json({ error: err.message }); }
}
async function addCpdRecord(req, res) {
  try { res.status(201).json(await complianceService.addCpdRecord(req.params.adviserId, req.body, req.user)); }
  catch (err) { res.status(err.status || 500).json({ error: err.message }); }
}
module.exports = { getCompliance, updateCompliance, getSummary, getAudit, getClientCompliance, runScreening, addCpdRecord };
