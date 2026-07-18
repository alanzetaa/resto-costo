import { useAuth } from '../contexts/AuthContext'

export function DashboardPage() {
  const { profile } = useAuth()

  return (
    <div>
      <div className="rc-page-header">
        <h1>Dashboard</h1>
        <p>Bienvenido, {profile?.email}.</p>
      </div>
      <div className="rc-card">
        <p style={{ margin: 0, color: 'var(--rc-text-muted)' }}>
          Acá vas a ver alertas de precios vencidos, food cost fuera de objetivo y los últimos cambios de la
          plataforma. Este resumen se arma en la Fase 2, una vez que carguemos Productos, Madres y Recetas reales.
        </p>
      </div>
    </div>
  )
}
