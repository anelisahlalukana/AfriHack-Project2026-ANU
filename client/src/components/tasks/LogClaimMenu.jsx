import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ShieldAlert } from 'lucide-react'
import { useCatalog } from '../../hooks/useTasks'
import { createClaim } from '../../api/tasks'
import { errorMessage } from '../../lib/taskFormat'

// "Log a claim": a button that opens a dropdown of claim types. Choosing one starts a draft claim
// straight away (so photos can be added at the scene) and opens it.
export function LogClaimMenu() {
  const catalog = useCatalog()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const closeOnOutsideClick = event => { if (!menuRef.current?.contains(event.target)) setOpen(false) }
    const closeOnEscape = event => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  async function choose(category) {
    setBusy(category)
    setError('')
    try {
      const task = await createClaim({ category })
      navigate(`/account/claims/${task.id}/continue`)
    } catch (error) {
      setError(errorMessage(error))
      setBusy(null)
    }
  }

  return <div className="col-menu" ref={menuRef}>
    <button type="button" className="primary" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <ShieldAlert size={16} /> Log a claim <ChevronDown size={16} />
    </button>
    {open && <div className="claim-panel" role="menu" aria-label="Type of claim">
      {catalog.loading && <p role="status">Loading…</p>}
      {catalog.error && <p className="error" role="alert">{catalog.error}</p>}
      {catalog.data?.claimCategories.map(category => <button key={category.category} type="button" role="menuitem" onClick={() => choose(category.category)} disabled={Boolean(busy)}>
        <b>{busy === category.category ? 'Starting…' : category.label}</b>
        <small>{category.description}</small>
      </button>)}
      {error && <p className="error" role="alert">{error}</p>}
    </div>}
  </div>
}
