const complianceService = require("../services/compliance.service");

async function getCompliance(req, res) {
  try {
    const record = await complianceService.getComplianceRecord(req.params.adviserId);
    res.json({ compliance: record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function updateCompliance(req, res) {
  try {
    const record = await complianceService.updateComplianceRecord(
      req.params.adviserId,
      req.body || {}
    );
    res.json({ compliance: record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getCompliance, updateCompliance };
