const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Service-role client: backend-only, bypasses RLS. Never expose this key to the frontend.
// Until real credentials are in server/.env, export a stub that throws a clear
// error on first use instead of crashing the whole server at require-time.
const supabaseAdmin =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : new Proxy(
        {},
        {
          get() {
            throw new Error(
              "Supabase is not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server/.env"
            );
          },
        }
      );

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.warn(
    "[supabaseClient] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not set. " +
      "Add them to server/.env (see comments there) before hitting any /api routes."
  );
}

module.exports = { supabaseAdmin };
