import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

export function ProtectedRoute() {
  const { session, loading, hasAccess } = useAuth()

  if (loading) return <FullscreenLoader />
  if (!session) return <Navigate to="/login" replace />
  if (!hasAccess) return <Navigate to="/no-autorizado" replace />

  return <Outlet />
}

export function SuperAdminRoute() {
  const { loading, isSuperAdmin } = useAuth()

  if (loading) return <FullscreenLoader />
  if (!isSuperAdmin) return <Navigate to="/dashboard" replace />

  return <Outlet />
}

function FullscreenLoader() {
  return (
    <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
      Cargando...
    </div>
  )
}
