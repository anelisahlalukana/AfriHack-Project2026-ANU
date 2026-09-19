import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[supabaseClient] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set in client/.env"
  );
}

// Used only for auth (sign-in/session). Feature data always goes through the
// Express API, never straight to Supabase, from the frontend.
// Until real credentials are in client/.env, fall back to a stub that throws
// on first use instead of crashing the whole app at import time.
export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : new Proxy(
        {},
        {
          get() {
            throw new Error(
              "Supabase is not configured: set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in client/.env"
            );
          },
        }
      );
