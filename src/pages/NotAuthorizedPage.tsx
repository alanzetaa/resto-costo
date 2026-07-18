import { useAuth } from '../contexts/AuthContext'

export function NotAuthorizedPage() {
  const { profile, signOut } = useAuth()

  return (
    <div className="rc-auth-page">
      <div className="rc-auth-box rc-card" style={{ textAlign: 'center' }}>
        <div className="rc-auth-logo">RestoCosto</div>
        <h2 style={{ marginTop: 0 }}>Tu cuenta no tiene acceso</h2>
        <p style={{ color: 'var(--rc-text-muted)' }}>
          {profile?.email ?? 'Tu email'} inició sesión correctamente, pero todavía no tiene un rol asignado en la
          plataforma. Pedile al administrador que te dé de alta desde la sección Accesos.
        </p>
        <button className="rc-btn rc-btn-secondary" onClick={() => signOut()}>
          Salir
        </button>
      </div>
    </div>
  )
}
