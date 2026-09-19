import { http } from "@/api/http";

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

export async function getAdviserCompliance(adviserId) {
  const { data } = await http.get(`/api/advisers/${adviserId}/compliance`);
  return data.compliance;
}

export async function updateAdviserCompliance(adviserId, updates) {
  const { data } = await http.patch(`/api/advisers/${adviserId}/compliance`, updates);
  return data.compliance;
}
