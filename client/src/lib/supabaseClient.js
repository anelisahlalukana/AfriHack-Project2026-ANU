import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[supabaseClient] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is not set in client/.env"
  );
}

// Shared client for Supabase Auth and the existing RLS-protected FNA API.
// Missing configuration is null so AuthProvider can show setup help.
export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
