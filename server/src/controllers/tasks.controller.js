const tasksService = require("../services/tasks.service");

// Claims and client requests. Each handler reads req, calls one service function,
// and replies. Services decide what the signed-in user may see and do.

async function listTasks(req, res) {
  try {
    const { kind, view, category, q, clientId } = req.query;
    const tasks = await tasksService.listTasks(req.user, { kind, view, category, q, clientId });
    res.json({ tasks });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function getTask(req, res) {
  try {
    const task = await tasksService.getTaskDetail(req.user, req.params.taskId);
    res.json({ task });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function createClaim(req, res) {
  try {
    const task = await tasksService.createClaim(req.user, req.body);
    res.status(201).json({ task });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function updateDraft(req, res) {
  try {
    const task = await tasksService.updateDraft(req.user, req.params.taskId, req.body);
    res.json({ task });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function submitTask(req, res) {
  try {
    const task = await tasksService.submitTask(req.user, req.params.taskId, req.body);
    res.json({ task });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function cancelDraft(req, res) {
  try {
    const task = await tasksService.cancelDraft(req.user, req.params.taskId);
    res.json({ task });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function createRequest(req, res) {
  try {
    const task = await tasksService.createRequest(req.user, req.body);
    res.status(201).json({ task });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function postUpdate(req, res) {
  try {
    const task = await tasksService.postUpdate(req.user, req.params.taskId, req.body);
    res.json({ task });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function clientAction(req, res) {
  try {
    const task = await tasksService.completeClientAction(req.user, req.params.taskId, req.body);
    res.json({ task });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function closeTask(req, res) {
  try {
    const task = await tasksService.closeTask(req.user, req.params.taskId, req.body);
    res.json({ task });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function messageProvider(req, res) {
  try {
    const task = await tasksService.messageProvider(req.user, req.params.taskId, req.body);
    res.json({ task });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function uploadFile(req, res) {
  try {
    const task = await tasksService.uploadFile(req.user, req.params.taskId, req.file, req.body);
    res.status(201).json({ task });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function getFileUrl(req, res) {
  try {
    const url = await tasksService.getFileUrl(req.user, req.params.taskId, req.params.fileId);
    res.json({ url });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

module.exports = {
  listTasks,
  getTask,
  createClaim,
  updateDraft,
  submitTask,
  cancelDraft,
  createRequest,
  postUpdate,
  clientAction,
  closeTask,
  messageProvider,
  uploadFile,
  getFileUrl,
};
