// Creates a provider portal login for one of the provider organisations (the
// insurers seeded as public.users rows with role_id 2), the same way the admin
// "Add a new user" form does: random unusable password + Brevo email with a
// password-setup link.
//
// Usage: node scripts/create-provider-login.js "person@example.com" "Full Name" "Old Mutual"
require("dotenv").config();
const { supabaseAdmin } = require("../src/config/supabaseClient");
const { createStaffUser } = require("../src/services/users.service");
const { PROVIDER_ROLE, PROVIDER_ROLE_ID } = require("../src/constants/roles");

async function main() {
  const [, , email, fullName, organisation] = process.argv;

  if (!email || !fullName || !organisation) {
    console.error('Usage: node scripts/create-provider-login.js "email@example.com" "Full Name" "Old Mutual"');
    process.exit(1);
  }

  const { data, error } = await supabaseAdmin
    .from("users")
    .select("id, organisation_name")
    .eq("role_id", PROVIDER_ROLE_ID)
    .ilike("organisation_name", organisation)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(`No provider called '${organisation}'. Run the claims migration first, or check the spelling.`);

  const user = await createStaffUser({ email, fullName, role: PROVIDER_ROLE, providerId: data.id });
  console.log("Provider login created:", user);
  console.log("Check the inbox for the password-setup email.");
}

main().catch((err) => {
  console.error("Failed to create provider login:", err.message);
  process.exit(1);
});
