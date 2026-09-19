const clientsService = require("../services/clients.service");

async function createClient(req, res) {
  try {
    const { first_name, second_name, surname, contact_email, contact_mobile } = req.body;
    const client = await clientsService.createClient({
      advisorId: req.user.id,
      firstName: first_name,
      secondName: second_name,
      surname,
      email: contact_email,
      mobile: contact_mobile,
    });
    res.status(201).json({ client });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function completeRegistration(req, res) {
  try {
    const { email, id_number, password } = req.body;
    await clientsService.completeRegistration({ email, idNumber: id_number, password });
    res.json({ message: "We've emailed you a verification code." });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function login(req, res) {
  try {
    const { id_number, password } = req.body;
    const session = await clientsService.loginWithIdNumber({ idNumber: id_number, password });
    res.json({ session });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

async function finishRegistration(req, res) {
  try {
    const result = await clientsService.finishRegistration(req.user.id);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}

module.exports = { createClient, completeRegistration, login, finishRegistration };
