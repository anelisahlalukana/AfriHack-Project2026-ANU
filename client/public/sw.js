// Service worker for the installed app: offline start-up, asset caching and push notifications.
// Registered at "/" on start-up by lib/pwa.js, and again by api/reminders.js (enablePush) for
// anyone who turns push on. Registering twice is harmless; the browser keeps one worker per scope.

// Bump VERSION on each release. Old caches are deleted on activate, which both refreshes the
// precached shell and clears out build assets belonging to previous deploys; leave it alone and
// those hashed files stay cached until the browser evicts them.
const VERSION = 'v1'
const SHELL_CACHE = `rsf-shell-${VERSION}`
const ASSET_CACHE = `rsf-assets-${VERSION}`
const CURRENT_CACHES = [SHELL_CACHE, ASSET_CACHE]

// The app shell and the images every page draws. Build output is not listed: Vite gives those
// files content-hashed names, so they are cached as they are requested (see below) and a new
// build simply asks for different names.
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icons.svg',
  '/images/logo.jpg',
  '/images/slogan.png',
  '/icons/favicon-16.png',
  '/icons/favicon-32.png',
  '/icons/favicon-48.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
]

self.addEventListener('install', event => {
  // A missing file must not stop the whole install, or one typo leaves the app with no worker.
  event.waitUntil(caches.open(SHELL_CACHE)
    .then(cache => Promise.all(SHELL.map(path => cache.add(path).catch(error => console.warn('[sw] could not precache', path, error)))))
    .then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys()
    .then(names => Promise.all(names.filter(name => name.startsWith('rsf-') && !CURRENT_CACHES.includes(name)).map(name => caches.delete(name))))
    .then(() => self.clients.claim()))
})

// --- Caching ---------------------------------------------------------------------------------
// Nothing signed-in is ever written to the cache. The Cache API outlives a sign-out and is shared
// by everyone using the device, so only files that are the same for every visitor go in: the app
// shell, the build output and the brand images. API responses and anything on another origin
// (the API host, Supabase) are passed straight through to the network, untouched.

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) await cache.put(request, response.clone())
  return response
}

// Answers from the cache at once, and refreshes it in the background for next time. With nothing
// cached yet, a failed request is reported as the network failure it is rather than as an empty
// response, which respondWith would reject anyway.
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then(response => {
      if (response.ok) cache.put(request, response.clone())
      return response
    })
    .catch(error => {
      if (cached) return cached
      throw error
    })
  return cached || network
}

// Pages come from the network first, so a signed-in person always gets the current build. The
// cached shell is only used when the network fails, which is what lets the app open offline.
async function shellForNavigation(request) {
  try {
    const response = await fetch(request)
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE)
      await cache.put('/index.html', response.clone())
    }
    return response
  } catch (error) {
    const cache = await caches.open(SHELL_CACHE)
    const cached = (await cache.match('/index.html')) || (await cache.match('/'))
    if (cached) return cached
    throw error
  }
}

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET' || request.headers.has('range')) return

  let url
  try { url = new URL(request.url) } catch { return }
  // Another origin (the API, Supabase, anything else) or a signed-in API call: never our business.
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') {
    event.respondWith(shellForNavigation(request))
    return
  }
  // Vite's build output is content-hashed, so a hit is always the right file for this build.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, ASSET_CACHE))
    return
  }
  if (SHELL.includes(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE))
  }
})

// --- Push notifications ----------------------------------------------------------------------
// The server sends { title, body, tag, url }. The body is deliberately generic, so no
// client details or financial information ever appear on a lock screen.

self.addEventListener('push', event => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { /* not JSON: fall back to the defaults below */ }

  event.waitUntil(self.registration.showNotification(data.title || 'Royal Square Financial', {
    body: data.body || 'You have a new update. Open Royal Square to view it.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
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
