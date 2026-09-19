import axios from "axios";
import { supabase } from "@/lib/supabaseClient";

// Shared axios instance: attaches the current Supabase session's access
// token to every request so the Express API's requireAuth middleware can
// verify it. Feature-specific api/*.js files build on top of this instead of
// calling axios directly.
export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:5000",
});

http.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});
