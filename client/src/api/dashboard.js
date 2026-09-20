import { http } from "./http";

export async function getDashboard() {
  const { data } = await http.get("/api/dashboard");
  return data.dashboard;
}

// The signed-in client's own dashboard. The server scopes it to their client record.
export async function getMyOverview() {
  const { data } = await http.get("/api/dashboard/me");
  return data.overview;
}

// Client Pulse: the ranking of clients at risk of disengaging.
export async function getAtRiskClients() {
  const { data } = await http.get("/api/dashboard/at-risk");
  return data.atRisk;
}

// One client's full signal breakdown (documents, reminders, request, goal, onboarding).
export async function getClientPulse(clientId) {
  const { data } = await http.get(`/api/dashboard/at-risk/${clientId}`);
  return data.pulse;
}

// Sends the client an in-app check-in that says why they were flagged. Returns what was sent.
export async function sendCheckIn(clientId) {
  const { data } = await http.post(`/api/dashboard/at-risk/${clientId}/check-in`);
  return data.checkIn;
}
