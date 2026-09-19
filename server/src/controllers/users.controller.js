const usersService = require("../services/users.service");

async function listUsers(req, res) {
  try {
    const users = await usersService.listStaffUsers();
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function createUser(req, res) {
  try {
    const { email, fullName, role } = req.body;
    const user = await usersService.createStaffUser({ email, fullName, role });
    res.status(201).json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function resendInvite(req, res) {
  try {
    const result = await usersService.resendStaffInvite(req.params.id);
    res.json({ user: result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

module.exports = { listUsers, createUser, resendInvite };
