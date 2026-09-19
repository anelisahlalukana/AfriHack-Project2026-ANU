import { http } from "./http";

export async function getDashboard() {
  const { data } = await http.get("/api/dashboard");
  return data.dashboard;
}
