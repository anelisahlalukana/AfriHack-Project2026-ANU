import { http } from "./http";

// Claims and client requests. All calls go through the Express API, which
// checks whether the signed-in user is staff or a linked client.

export async function getCatalog() {
  const { data } = await http.get("/api/catalog");
  return data;
}

export async function getMe() {
  const { data } = await http.get("/api/me");
  return data;
}

export async function listTasks(params = {}) {
  const { data } = await http.get("/api/tasks", { params });
  return data.tasks;
}

export async function getTask(taskId) {
  const { data } = await http.get(`/api/tasks/${taskId}`);
  return data.task;
}

export async function createClaim(body) {
  const { data } = await http.post("/api/tasks/claims", body);
  return data.task;
}

export async function updateDraft(taskId, body) {
  const { data } = await http.patch(`/api/tasks/${taskId}/draft`, body);
  return data.task;
}

export async function submitClaim(taskId, body) {
  const { data } = await http.post(`/api/tasks/${taskId}/submit`, body);
  return data.task;
}

export async function cancelDraft(taskId) {
  const { data } = await http.post(`/api/tasks/${taskId}/cancel`);
  return data.task;
}

export async function createRequest(body) {
  const { data } = await http.post("/api/tasks/requests", body);
  return data.task;
}

// Staff: { note, stageKey?, visibleToClient? }. Client: { note }.
export async function postUpdate(taskId, body) {
  const { data } = await http.post(`/api/tasks/${taskId}/updates`, body);
  return data.task;
}

export async function completeClientAction(taskId, body = {}) {
  const { data } = await http.post(`/api/tasks/${taskId}/client-action`, body);
  return data.task;
}

export async function closeTask(taskId, body) {
  const { data } = await http.post(`/api/tasks/${taskId}/close`, body);
  return data.task;
}

export async function simulateProviderEvent(taskId, body = {}) {
  const { data } = await http.post(`/api/tasks/${taskId}/mock-provider/event`, body);
  return data.task;
}

export async function uploadTaskFile(taskId, file, { documentKey, label } = {}) {
  const form = new FormData();
  form.append("file", file);
  if (documentKey) form.append("documentKey", documentKey);
  if (label) form.append("label", label);
  const { data } = await http.post(`/api/tasks/${taskId}/files`, form);
  return data.task;
}

export async function getTaskFileUrl(taskId, fileId) {
  const { data } = await http.get(`/api/tasks/${taskId}/files/${fileId}/url`);
  return data.url;
}
