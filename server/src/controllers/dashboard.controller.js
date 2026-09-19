const dashboardService = require("../services/dashboard.service");

async function getDashboard(req, res) {
  try {
    const dashboard = await dashboardService.getDashboard(req.user);
    res.json({ dashboard });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function getAtRiskClients(req, res) {
  try {
    const atRisk = await dashboardService.getAtRiskClients(req.user);
    res.json({ atRisk });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function getClientPulse(req, res) {
  try {
    const pulse = await dashboardService.getClientPulse(req.user, req.params.clientId);
    res.json({ pulse });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function sendCheckIn(req, res) {
  try {
    const checkIn = await dashboardService.sendCheckIn(req.user, req.params.clientId);
    res.json({ checkIn });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

module.exports = { getDashboard, getAtRiskClients, getClientPulse, sendCheckIn };
