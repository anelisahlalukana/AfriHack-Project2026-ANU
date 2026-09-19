import axios from "axios";
import { supabase } from "../lib/supabaseClient";

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

// Every controller in server/src/controllers/*.js responds with
// { error: "message" } on failure. Without this, axios's error.message is a
// generic "Request failed with status code 400/500" and the real message
// never reaches the UI. Components just do `catch (error) { setError(error.message) }`
// and rely on this to have already put the backend's message there.
http.interceptors.response.use(
  (response) => response,
  (error) => {
    const backendMessage = error.response?.data?.error;

    if (backendMessage) {
      error.message = backendMessage;
    } else if (!error.response) {
      error.message = "Couldn't reach the server. Check your connection and try again.";
    }

    return Promise.reject(error);
  }
);
