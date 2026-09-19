const providerService = require("../services/providerPortal.service");

// Provider portal (insurers and product providers). Each handler reads req, calls one
// service function and replies. The service checks the login belongs to a provider
// and only returns that provider's claims and requests.

async function getMe(req, res) {
  try {
    const me = await providerService.getMe(req.user);
    res.json(me);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function listTasks(req, res) {
  try {
    const { view, kind, q } = req.query;
    const result = await providerService.listTasks(req.user, { view, kind, q });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function getTask(req, res) {
  try {
    const task = await providerService.getTask(req.user, req.params.taskId);
    res.json({ task });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function respond(req, res) {
  try {
    const task = await providerService.respond(req.user, req.params.taskId, req.body);
    res.json({ task });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function decline(req, res) {
  try {
    const task = await providerService.decline(req.user, req.params.taskId, req.body);
    res.json({ task });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function sendMessage(req, res) {
  try {
    const task = await providerService.sendMessage(req.user, req.params.taskId, req.body);
    res.status(201).json({ task });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function changeHandler(req, res) {
  try {
    const task = await providerService.changeHandler(req.user, req.params.taskId, req.body);
    res.json({ task });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function uploadFile(req, res) {
  try {
    const task = await providerService.uploadFile(req.user, req.params.taskId, req.file, req.body);
    res.status(201).json({ task });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function getFileUrl(req, res) {
  try {
    const url = await providerService.getFileUrl(req.user, req.params.taskId, req.params.fileId);
    res.json({ url });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

module.exports = { getMe, listTasks, getTask, respond, decline, sendMessage, changeHandler, uploadFile, getFileUrl };
