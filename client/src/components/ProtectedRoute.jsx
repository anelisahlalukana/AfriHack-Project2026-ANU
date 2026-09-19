import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { isStaff, isAdmin } from '../lib/authRoles'

export default function ProtectedRoute({ staffOnly = false, adminOnly = false, excludeAdmin = false }) {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) return <div className="loading" role="status">Loading your workspace…</div>
  if (!session) {
    const from = `${location.pathname}${location.search}${location.hash}`
    return <Navigate to="/login" state={{ from }} replace />
  }
  if (staffOnly && !isStaff(session.user)) return <Navigate to="/account" replace />
  if (adminOnly && !isAdmin(session.user)) return <Navigate to="/" replace />
  if (excludeAdmin && isAdmin(session.user)) return <Navigate to="/admin" replace />
  return <Outlet key={session.user.id} />
}
