import { useEffect, useState } from 'react'
import { Bell, BellOff } from 'lucide-react'
import { currentPushStatus, getPushConfig, turnOffPush, turnOnPush } from '../../api/reminders'

const MESSAGES = {
  checking: 'Checking notification settings…',
  unavailable: "Push notifications aren't set up on the server yet. Ask whoever runs the server to add the VAPID settings (see docs/setup.md).",
  unsupported: 'This browser or connection cannot receive push notifications. They need a supported browser on HTTPS or localhost (on iPhone, add the app to your Home Screen first).',
  denied: 'Notifications are blocked for this site. Allow them in your browser settings, then reload this page.',
  off: 'Turn on push notifications to be alerted on this device when a reminder is due, even when Royal Square is closed.',
  on: 'Push notifications are on for this device. You will be alerted when a reminder is due.',
}

// Turns push notifications on or off for the browser being used. Each device is subscribed separately.
// `unavailableMessage` lets a page say something suitable for its audience when the server has no push set up.
export function PushControl({ unavailableMessage }) {
  const [status, setStatus] = useState('checking')
  const [publicKey, setPublicKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    getPushConfig()
      .then(async push => {
        if (!active) return
        if (!push.enabled) { setStatus('unavailable'); return }
        setPublicKey(push.publicKey)
        const next = await currentPushStatus()
        if (active) setStatus(next)
      })
      .catch(error => { if (active) { setStatus('unavailable'); setError(error.message) } })
    return () => { active = false }
  }, [])

  async function toggle() {
    setBusy(true)
    setError('')
    try {
      if (status === 'on') await turnOffPush()
      else await turnOnPush(publicKey)
      setStatus(await currentPushStatus())
    } catch (error) {
      setError(error.message)
      setStatus(await currentPushStatus().catch(() => 'off'))
    } finally {
      setBusy(false)
    }
  }

  const canToggle = status === 'on' || status === 'off'

  return <section className="card">
    <header className="section-heading">
      <div><h2>{status === 'on' ? <Bell size={20} /> : <BellOff size={20} />} Push notifications</h2><p role="status">{status === 'unavailable' && unavailableMessage ? unavailableMessage : MESSAGES[status]}</p></div>
      {canToggle && <button type="button" className={status === 'on' ? '' : 'primary'} onClick={toggle} disabled={busy}>
        {busy ? 'Working…' : status === 'on' ? 'Turn off' : 'Turn on'}
      </button>}
    </header>
    {error && <p className="error" role="alert">{error}</p>}
  </section>
}
