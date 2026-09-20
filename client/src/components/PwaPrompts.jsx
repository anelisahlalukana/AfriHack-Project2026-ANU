import { useEffect, useState, useSyncExternalStore } from 'react'
import { Download, RefreshCw, X } from 'lucide-react'
import { canInstall, onInstallAvailability, promptInstall, registerServiceWorker } from '../lib/pwa'

// Once someone says no, don't ask again on this device.
const DISMISSED_KEY = 'rsf-install-dismissed'

function wasDismissed() {
  try { return localStorage.getItem(DISMISSED_KEY) === '1' } catch { return false }
}

// The two things an installed app has to tell people about: that it can be installed at all, and
// that a new version is ready. Mounted once, at the root, so it works on every page including the
// login screen. Both banners sit above the client area's bottom navigation.
export default function PwaPrompts() {
  // beforeinstallprompt can fire before this ever mounts, so the answer is read from lib/pwa
  // rather than kept here. false on the server snapshot: there is nothing to install there.
  const installable = useSyncExternalStore(onInstallAvailability, canInstall, () => false)
  const [dismissed, setDismissed] = useState(wasDismissed)
  const [updateReady, setUpdateReady] = useState(false)

  useEffect(() => { registerServiceWorker({ onUpdate: () => setUpdateReady(true) }) }, [])

  function dismiss() {
    setDismissed(true)
    try { localStorage.setItem(DISMISSED_KEY, '1') } catch { /* private mode: it just asks again */ }
  }

  // An update is the more urgent of the two, and only one banner shows at a time.
  if (updateReady) return <div className="pwa-banner" role="status">
    <span><b>A new version is ready</b><small>Refresh to get the latest Royal Square.</small></span>
    <button type="button" className="primary" onClick={() => window.location.reload()}><RefreshCw size={16} /> Refresh</button>
  </div>

  if (!installable || dismissed) return null

  return <div className="pwa-banner" role="status">
    <span><b>Install Royal Square</b><small>Add it to your home screen to open it like an app.</small></span>
    <button type="button" className="primary" onClick={() => promptInstall()}><Download size={16} /> Install</button>
    <button type="button" className="pwa-dismiss" onClick={dismiss} aria-label="Not now"><X size={16} /></button>
  </div>
}
