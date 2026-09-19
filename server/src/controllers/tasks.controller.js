const tasks = require("../services/tasks.service");
const catalog = require("../services/catalog.service");
const clientLinks = require("../services/clientLinks.service");
const { resolveAccess } = require("../services/taskAccess.service");
const { handle } = require("../utils/httpError");

const withAccess = (fn) => handle(async (req, res) => fn(req, res, await resolveAccess(req.user)));

module.exports = {
  // Catalog: claim categories, request types and providers (config-driven forms).
  getCatalog: handle(async (req, res) => {
    res.json(await catalog.getCatalog());
  }),

  me: handle(async (req, res) => {
    res.json(await clientLinks.whoAmI(req.user));
  }),

  listTasks: withAccess(async (req, res, access) => {
    const { kind, view, category, q, clientId } = req.query;
    res.json({ tasks: await tasks.listTasks(access, { kind, view, category, q, clientId }) });
  }),

  getTask: withAccess(async (req, res, access) => {
    res.json({ task: await tasks.getTaskDetail(access, req.params.taskId) });
  }),

  createClaim: withAccess(async (req, res, access) => {
    res.status(201).json({ task: await tasks.createClaim(access, req.body || {}) });
  }),

  updateDraft: withAccess(async (req, res, access) => {
    res.json({ task: await tasks.updateDraft(access, req.params.taskId, req.body || {}) });
  }),

  submitTask: withAccess(async (req, res, access) => {
    res.json({ task: await tasks.submitTask(access, req.params.taskId, req.body || {}) });
  }),

  cancelDraft: withAccess(async (req, res, access) => {
    res.json({ task: await tasks.cancelDraft(access, req.params.taskId) });
  }),

  createRequest: withAccess(async (req, res, access) => {
    res.status(201).json({ task: await tasks.createRequest(access, req.body || {}) });
  }),

  postUpdate: withAccess(async (req, res, access) => {
    const task =
      access.role === "staff"
        ? await tasks.postStaffUpdate(access, req.params.taskId, req.body || {})
        : await tasks.postClientMessage(access, req.params.taskId, req.body || {});
    res.json({ task });
  }),

  clientAction: withAccess(async (req, res, access) => {
    res.json({ task: await tasks.completeClientAction(access, req.params.taskId, req.body || {}) });
  }),

  closeTask: withAccess(async (req, res, access) => {
    res.json({ task: await tasks.closeTask(access, req.params.taskId, req.body || {}) });
  }),

  simulateProvider: withAccess(async (req, res, access) => {
    res.json({ task: await tasks.simulateProvider(access, req.params.taskId, req.body || {}) });
  }),

  uploadFile: withAccess(async (req, res, access) => {
    res.status(201).json({ task: await tasks.uploadFile(access, req.params.taskId, req.file, req.body || {}) });
  }),

  getFileUrl: withAccess(async (req, res, access) => {
    res.json({ url: await tasks.getFileUrl(access, req.params.taskId, req.params.fileId) });
  }),

  getLinkStatus: withAccess(async (req, res, access) => {
    res.json(await clientLinks.getLinkStatus(access, req.params.clientId));
  }),

  linkAccount: withAccess(async (req, res, access) => {
    res.json(await clientLinks.linkClientAccount(access, req.params.clientId, req.body?.email));
  }),

  unlinkAccount: withAccess(async (req, res, access) => {
    res.json(await clientLinks.unlinkClientAccount(access, req.params.clientId));
  }),
};
