import { http } from "./http";

export async function listDocuments(clientId) {
  const { data } = await http.get(`/api/clients/${clientId}/documents`);
  return data.documents;
}

export async function sendDocument(clientId, type) {
  const { data } = await http.post(`/api/clients/${clientId}/documents/${type}/send`);
  return data.document;
}

export async function signDocument(clientId, type, { signature, signerName }) {
  const { data } = await http.post(`/api/clients/${clientId}/documents/${type}/sign`, {
    signature,
    signerName,
  });
  return data.document;
}

export async function getDownloadUrl(clientId, type) {
  const { data } = await http.get(`/api/clients/${clientId}/documents/${type}/download`);
  return data.url;
}

export async function getConsentStatus(clientId) {
  const { data } = await http.get(`/api/clients/${clientId}/consent-status`);
  return data;
}

// Compatibility exports for existing imports. Compliance requests have one API owner.
export { getAdviserCompliance, updateAdviserCompliance } from './compliance'
