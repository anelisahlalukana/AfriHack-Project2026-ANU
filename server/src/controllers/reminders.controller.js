function createRemindersController(service) {
  const reply = (fn, status = 200) => async (req, res) => res.status(status).json(await fn(req));
  return {
    config: reply(() => ({ demo: false, users: [], push: service.pushConfig() })),
    me: reply(req => req.user),
    clients: reply(req => service.clients(req.user)),
    rules: reply(() => service.rules()),
    addRule: reply(req => service.saveRule(req.user, req.body), 201),
    updateRule: reply(req => service.saveRule(req.user, req.body, req.params.id)),
    reminders: reply(req => service.reminders(req.user)),
    addReminder: reply(req => service.addReminder(req.user, req.body), 201),
    completeReminder: reply(req => service.completeReminder(req.user, req.params.id)),
    notifications: reply(req => service.notifications(req.user)),
    readNotification: reply(req => service.readNotification(req.user, req.params.id)),
    messages: reply(req => service.messages(req.user, req.params.clientId)),
    sendMessage: reply(req => service.sendMessage(req.user, req.body), 201),
    subscribe: reply(req => service.subscribe(req.user, req.body), 201),
    unsubscribe: async (req, res) => { await service.unsubscribe(req.user, req.body.endpoint); res.sendStatus(204); },
    financialPull: reply(req => service.financialPull(req.user, req.params.clientId)),
  };
}
module.exports = { createRemindersController };
