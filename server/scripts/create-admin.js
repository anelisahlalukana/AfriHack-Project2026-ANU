// One-off bootstrap: creates the first admin account, the same way the
// in-app "add user" flow does (random unusable password + Brevo email with
// a password-setup link) — just reachable before any admin exists yet.
//
// Usage: node scripts/create-admin.js "person@example.com" "Full Name"
require("dotenv").config();
const { createStaffUser } = require("../src/services/users.service");

async function main() {
  const [, , email, fullName] = process.argv;

  if (!email || !fullName) {
    console.error('Usage: node scripts/create-admin.js "email@example.com" "Full Name"');
    process.exit(1);
  }

  const user = await createStaffUser({ email, fullName, role: "admin" });
  console.log("Admin account created:", user);
  console.log("Check the inbox for the password-setup email.");
}

main().catch((err) => {
  console.error("Failed to create admin:", err.message);
  process.exit(1);
});
