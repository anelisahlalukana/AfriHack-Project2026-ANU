const dashboardService = require("../services/dashboard.service");

async function getDashboard(req, res) {
  try {
    const dashboard = await dashboardService.getDashboard(req.user);
    res.json({ dashboard });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

module.exports = { getDashboard };
