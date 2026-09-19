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

module.exports = { listUsers, createUser };
