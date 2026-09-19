// Service worker for push notifications. Registered by api/reminders.js (enablePush) at "/".
// The server sends { title, body, tag, url }. The body is deliberately generic, so no
// client details or financial information ever appear on a lock screen.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()))

self.addEventListener('push', event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { /* not JSON: fall back to the defaults below */ }

  event.waitUntil(self.registration.showNotification(data.title || 'Royal Square Financial', {
    body: data.body || 'You have a new update. Open Royal Square to view it.',
    tag: data.tag,            // the same notification never shows twice
    data: { url: data.url || '/' },
  }))
})

// Tapping the notification opens the app on the right page, reusing a window that is already open.
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href

  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    for (const window of windows) {
      if (new URL(window.url).origin === self.location.origin && 'focus' in window) {
        return window.focus().then(focused => ('navigate' in focused ? focused.navigate(target) : focused))
      }
    }
    return self.clients.openWindow(target)
  }))
})
