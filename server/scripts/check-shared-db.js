// Read-only: verifies credentials and schema without printing keys or client data.
require("dotenv").config({ path: require("node:path").join(__dirname, "../.env"), quiet: true });
const { supabaseAdmin: db } = require("../src/config/supabaseClient");
async function main() {
  const { error: authError } = await db.auth.admin.listUsers({ perPage: 1 });
  if (authError) throw new Error("Backend authentication failed. Check the service-role API key.");
  console.log("Shared Supabase authentication: connected");
  let missing = false;
  for (const table of ["users", "documents", "reminders", "notifications", "reminder_rules", "client_messages", "push_subscriptions", "financial_snapshots"]) {
    // GET with limit 0 verifies schema without retrieving rows. Some gateways mask HEAD errors.
    const { error } = await db.from(table).select("*").limit(0);
    console.log(`${table}: ${error ? "unavailable" : "accessible"}`);
    if (error) missing = true;
  }
  if (missing) throw new Error("Apply supabase/migrations/202609190010_reminders_shared.sql in the shared project's SQL Editor, then rerun this check.");
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
