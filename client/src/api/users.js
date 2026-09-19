import { http } from "./http";

export async function listStaffUsers() {
  const { data } = await http.get("/api/admin/users");
  return data.users;
}

// providerId: the provider organisation, required when role is 'provider'.
export async function createStaffUser({ email, fullName, role, providerId }) {
  const { data } = await http.post("/api/admin/users", { email, fullName, role, providerId });
  return data.user;
}

export async function resendStaffInvite(id) {
  const { data } = await http.post(`/api/admin/users/${id}/resend-invite`);
  return data.user;
}
