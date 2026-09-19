const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { requireAuth } = require("./src/middleware/auth");
const documentsController = require("./src/controllers/documents.controller");
const documentsRoutes = require("./src/routes/documents.routes");
const complianceRoutes = require("./src/routes/compliance.routes");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
// Signature captures are base64-encoded PNGs, so the default 100kb JSON limit is too small.
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", (req, res) => {
  res.json({ status: "Server is running" });
});

app.use("/api/clients/:clientId/documents", documentsRoutes);
app.get("/api/clients/:clientId/consent-status", requireAuth, documentsController.getConsentStatus);
app.use("/api/advisers/:adviserId/compliance", complianceRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});