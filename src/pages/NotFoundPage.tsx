import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="rc-auth-page">
      <div className="rc-auth-box rc-card" style={{ textAlign: 'center' }}>
        <h2 style={{ marginTop: 0 }}>Página no encontrada</h2>
        <p style={{ color: 'var(--rc-text-muted)' }}>La ruta que buscás no existe.</p>
        <Link to="/" className="rc-btn rc-btn-primary">
          Volver al inicio
        </Link>
      </div>
    </div>
  )
}
