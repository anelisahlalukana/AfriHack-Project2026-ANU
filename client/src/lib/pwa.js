// Everything the page side of the PWA needs: registering the service worker, noticing when a new
// version has been installed, and holding on to the browser's install prompt until someone asks
// for it. No React in here, so the listeners can be attached before the app has mounted.

// Chrome fires beforeinstallprompt once, early, and only if the app is installable. Saving the
// event is the only way to show an install button later, at a moment that suits the user.
let deferredPrompt = null
const listeners = new Set()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault() // stop the browser's own mini-infobar; we offer it in the UI instead
    deferredPrompt = event
    listeners.forEach(listener => listener(true))
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    listeners.forEach(listener => listener(false))
  })
}

export const canInstall = () => deferredPrompt !== null

// Subscribes to whether an install can be offered right now. Returns an unsubscribe function.
export function onInstallAvailability(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Shows the browser's install dialog. Resolves to true if the app was installed. The saved event
// is single-use, so it is dropped either way.
export async function promptInstall() {
  if (!deferredPrompt) return false
  const prompt = deferredPrompt
  deferredPrompt = null
  listeners.forEach(listener => listener(false))
  prompt.prompt()
  const { outcome } = await prompt.userChoice
  return outcome === 'accepted'
}

// Registers the worker in public/sw.js. Production only: in development Vite serves modules the
// worker knows nothing about, and a cached shell would fight hot reloading. `onUpdate` is called
// when a new version has finished installing behind the one currently running.
export function registerServiceWorker({ onUpdate } = {}) {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  navigator.serviceWorker.register('/sw.js').then(registration => {
    registration.addEventListener('updatefound', () => {
      const installing = registration.installing
      if (!installing) return
      installing.addEventListener('statechange', () => {
        // Reaching 'installed' while a worker is already in control means this is an update,
        // not the very first install.
        if (installing.state === 'installed' && navigator.serviceWorker.controller) onUpdate?.()
      })
    })
  }).catch(error => {
    // An app that can't cache still works; it just isn't installable. Never break the page over it.
    console.warn('[pwa] service worker registration failed:', error.message)
  })
}
