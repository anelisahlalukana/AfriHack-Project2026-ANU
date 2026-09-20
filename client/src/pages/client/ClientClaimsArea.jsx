import { Outlet, useOutletContext } from 'react-router-dom'

// Wraps every claims page inside the client area: they all need the signed-in person to have a
// client profile, so that is checked once here instead of on each page.
export default function ClientClaimsArea() {
  const context = useOutletContext()
  const { client } = context

  if (client === undefined) return <p role="status">Loading your account…</p>
  if (!client) return <section className="card"><h1>We couldn't find your client profile</h1><p>Please contact your Royal Square adviser so they can check your account.</p></section>
  return <Outlet context={context} />
}
