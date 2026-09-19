const documentsService = require("../services/documents.service");

async function listDocuments(req, res) {
  try {
    const documents = await documentsService.listDocuments(req.params.clientId);
    res.json({ documents });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function sendDocument(req, res) {
  try {
    const document = await documentsService.sendDocument(req.params.clientId, req.params.type);
    res.json({ document });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function signDocument(req, res) {
  try {
    const { signature, signerName } = req.body;
    const document = await documentsService.signDocument(req.params.clientId, req.params.type, {
      signature,
      signerName,
    });
    res.json({ document });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function uploadSignedDocument(req, res) {
  try {
    const document = await documentsService.uploadSignedDocument(
      req.params.clientId,
      req.params.type,
      req.file.buffer
    );
    res.json({ document });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function downloadDocument(req, res) {
  try {
    const url = await documentsService.getDownloadUrl(req.params.clientId, req.params.type);
    res.json({ url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function getConsentStatus(req, res) {
  try {
    const status = await documentsService.getConsentStatus(req.params.clientId);
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  listDocuments,
  sendDocument,
  signDocument,
  uploadSignedDocument,
  downloadDocument,
  getConsentStatus,
};
