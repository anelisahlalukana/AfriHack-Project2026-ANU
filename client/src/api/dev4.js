export function createDev4Api({ demoUserId, accessToken } = {}) {
  return async (path, { method = "GET", body } = {}) => {
    const response = await fetch(`/api/dev4${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(demoUserId ? { "X-Demo-User": demoUserId } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (response.status === 204) return null;
    const data = await response
      .json()
      .catch(() => ({ error: "The server returned an unreadable response." }));
    if (!response.ok) throw new Error(data.error || "Request failed.");
    return data;
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
