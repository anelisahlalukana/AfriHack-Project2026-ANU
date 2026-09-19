import axios from "axios";
import { http } from "./http";

const publicHttp = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL || "" });

export function createDev4Api({ demoUserId } = {}) {
  return async (path, { method = "GET", body } = {}) => {
    try {
      // Real requests get the current session on every call, including after token refresh.
      const transport = demoUserId || path === "/config" ? publicHttp : http;
      const response = await transport.request({ url: `/api/dev4${path}`, method, data: body,
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
