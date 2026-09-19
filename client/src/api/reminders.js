import axios from "axios";
import { http } from "./http";

// Same server address as every other API call (see http.js); "/config" is public, so it is sent without a login.
const publicHttp = axios.create({ baseURL: http.defaults.baseURL });

export function createRemindersApi({ demoUserId } = {}) {
  return async (path, { method = "GET", body } = {}) => {
    try {
      // Real requests get the current session on every call, including after token refresh.
      const transport = demoUserId || path === "/config" ? publicHttp : http;
      const response = await transport.request({ url: `/api/reminders${path}`, method, data: body,
        headers: demoUserId ? { "X-Demo-User": demoUserId } : undefined });
      return response.status === 204 ? null : response.data;
    } catch (error) {
      throw new Error(error.response?.data?.error || error.message || "Request failed.", { cause: error });
    }
  };
}

export async function disablePush(api) {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager?.getSubscription();
  if (subscription) {
    await api("/push/subscriptions", {
      method: "DELETE",
      body: { endpoint: subscription.endpoint },
    });
    await subscription.unsubscribe();
  }
}

export async function enablePush(api, publicKey) {
  if (
    !window.isSecureContext ||
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  )
    throw new Error(
      "Push needs a supported browser on HTTPS or localhost. On iPhone, install the app on your Home Screen first.",
    );
  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error(
      "Notifications were not allowed. You can change this in your browser settings.",
    );
  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const key = publicKey.replace(/-/g, "+").replace(/_/g, "/");
  const applicationServerKey = Uint8Array.from(
    atob(key.padEnd(Math.ceil(key.length / 4) * 4, "=")),
    (c) => c.charCodeAt(0),
  );
  const subscription =
    (await registration.pushManager.getSubscription()) ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    }));
  try {
    await api("/push/subscriptions", {
      method: "POST",
      body: subscription.toJSON(),
    });
  } catch (error) {
    await subscription.unsubscribe();
    throw error;
  }
}

// What this browser can do about push right now: 'unsupported' (needs HTTPS/localhost and a
// browser with push), 'denied' (blocked in browser settings), 'on' (subscribed) or 'off'.
export async function currentPushStatus() {
  if (!window.isSecureContext || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window))
    return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager?.getSubscription();
  return subscription && Notification.permission === "granted" ? "on" : "off";
}

// One function per call, for the advisor Reminders page. Every request carries the signed-in
// session (see http.js); the server decides what the signed-in person may see.
const api = createRemindersApi();

export const getPushConfig = async () => (await api("/config")).push;
export const listReminderClients = () => api("/clients");
export const listReminderRules = () => api("/rules");
export const listReminders = () => api("/reminders");
export const addReminder = (input) => api("/reminders", { method: "POST", body: input });
export const completeReminder = (id) => api(`/reminders/${id}/complete`, { method: "POST" });
export const listNotifications = () => api("/notifications");
export const markNotificationRead = (id) => api(`/notifications/${id}/read`, { method: "PATCH" });
export const turnOnPush = (publicKey) => enablePush(api, publicKey);
export const turnOffPush = () => disablePush(api);

