import { http } from "./http";

// Provider portal (insurer logins). The API only returns the claims and
// requests sent to the signed-in provider's organisation.

export async function getProviderMe() {
  const { data } = await http.get("/api/provider/me");
  return data;
}

// params: { view: 'action' | 'waiting' | 'closed' | 'all', kind, q }. Returns { tasks, counts }.
export async function listProviderTasks(params = {}) {
  const { data } = await http.get("/api/provider/tasks", { params });
  return data;
}

export async function getProviderTask(taskId) {
  const { data } = await http.get(`/api/provider/tasks/${taskId}`);
  return data.task;
}

// Complete our next step, or post an update on a repeating step. { note? }
export async function respondToTask(taskId, body = {}) {
  const { data } = await http.post(`/api/provider/tasks/${taskId}/respond`, body);
  return data.task;
}

// { note } is the reason, shown to the client and Royal Square.
export async function declineTask(taskId, body) {
  const { data } = await http.post(`/api/provider/tasks/${taskId}/decline`, body);
  return data.task;
}

export async function messageRoyalSquare(taskId, body) {
  const { data } = await http.post(`/api/provider/tasks/${taskId}/messages`, body);
  return data.task;
}

export async function changeClaimsHandler(taskId, name) {
  const { data } = await http.post(`/api/provider/tasks/${taskId}/handler`, { name });
  return data.task;
}

export async function uploadProviderFile(taskId, file, { documentKey, label } = {}) {
  const form = new FormData();
  form.append("file", file);
  if (documentKey) form.append("documentKey", documentKey);
  if (label) form.append("label", label);
  const { data } = await http.post(`/api/provider/tasks/${taskId}/files`, form);
  return data.task;
}

export async function getProviderFileUrl(taskId, fileId) {
  const { data } = await http.get(`/api/provider/tasks/${taskId}/files/${fileId}/url`);
  return data.url;
}
