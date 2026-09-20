const reportsService = require("../services/reports.service");

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function reply(res, err) {
  if (!err.status) console.error("[reports]", err);
  res.status(err.status || 500).json({ error: err.status ? err.message : "The report couldn't be run. Please try again." });
}

function listTemplates(req, res) {
  res.json(reportsService.catalogue());
}

async function ask(req, res) {
  try {
    const { question } = req.body || {};
    res.json(await reportsService.ask(req.user, question));
  } catch (err) {
    reply(res, err);
  }
}

async function run(req, res) {
  try {
    const { template_id, parameters } = req.body || {};
    if (parameters !== undefined && !isPlainObject(parameters)) {
      return res.status(400).json({ error: "Field 'parameters' must be an object" });
    }
    res.json(await reportsService.run(req.user, template_id, parameters || {}));
  } catch (err) {
    reply(res, err);
  }
}

async function generate(req, res) {
  try {
    const { template_id, parameters, query } = req.body || {};
    if (parameters !== undefined && !isPlainObject(parameters)) {
      return res.status(400).json({ error: "Field 'parameters' must be an object" });
    }
    if (query !== undefined && !isPlainObject(query)) {
      return res.status(400).json({ error: "Field 'query' must be an object" });
    }
    res.json(await reportsService.generate(req.user, template_id, parameters || {}, query));
  } catch (err) {
    reply(res, err);
  }
}

async function query(req, res) {
  try {
    const { query: spec } = req.body || {};
    if (!isPlainObject(spec)) return res.status(400).json({ error: "Field 'query' must be an object" });
    res.json(await reportsService.query(req.user, spec));
  } catch (err) {
    reply(res, err);
  }
}

module.exports = { listTemplates, ask, run, query, generate };
