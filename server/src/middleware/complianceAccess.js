function requireSelf(req, res, next) {
  if (req.user.id !== req.params.adviserId) {
    return res.status(403).json({ error: "Only the adviser may change their own compliance record." });
  }
  next();
}
module.exports = { requireSelf };
