import { http } from "./http";

export async function listStaffUsers() {
  const { data } = await http.get("/api/admin/users");
  return data.users;
}

export async function createStaffUser({ email, fullName, role }) {
  const { data } = await http.post("/api/admin/users", { email, fullName, role });
  return data.user;
}
