const dashboardService = require("../services/dashboard.service");
const clientOverviewService = require("../services/clientOverview.service");

// The signed-in client's own dashboard. Scoped to their client record inside the service.
async function getMyOverview(req, res) {
  try {
    const overview = await clientOverviewService.getClientOverview(req.user);
    res.json({ overview });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

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

module.exports = { getDashboard, getMyOverview, getAtRiskClients, getClientPulse, sendCheckIn };
