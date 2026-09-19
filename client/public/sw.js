self.addEventListener("push", (event) => {
  let payload;
  try {
    payload = event.data?.json();
  } catch {
    payload = null;
  }
  event.waitUntil(
    self.registration.showNotification(
      payload?.title || "Royal Square Financial",
      {
        body: payload?.body || "You have a new update.",
        tag: payload?.tag || "royal-square-update",
        icon: "/images/logo.jpg",
        data: { url: "/#notifications" },
      },
    ),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const url = new URL("/#notifications", self.location.origin).href;
      for (const windowClient of windows) {
        if (new URL(windowClient.url).origin === self.location.origin) {
          await windowClient.navigate(url);
          return windowClient.focus();
        }
      }
      return self.clients.openWindow(url);
    })(),
  );
});
