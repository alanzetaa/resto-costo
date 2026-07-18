import { NavLink } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: '📊' },
  { to: '/productos', label: 'Productos', icon: '🧺' },
  { to: '/madres', label: 'Madres', icon: '🍯' },
  { to: '/recetas', label: 'Recetas', icon: '🍽️' },
  { to: '/rubros', label: 'Rubros', icon: '🏷️' },
  { to: '/listas-precio', label: 'Listas de Precio', icon: '💲' },
]

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Administrador',
  pending: 'Sin acceso',
}

export function Sidebar() {
  const { profile, isSuperAdmin, signOut } = useAuth()
  const roleClass = `rc-badge rc-badge-${profile?.role ?? 'pending'}`
  const roleLabel = ROLE_LABEL[profile?.role ?? 'pending'] ?? profile?.role

  return (
    <aside className="rc-sidebar">
      <div className="rc-sidebar-logo">RestoCosto</div>
      <div className="rc-sidebar-role">
        <span className={roleClass}>{roleLabel}</span>
      </div>
      <nav className="rc-sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => 'rc-sidebar-link' + (isActive ? ' active' : '')}
          >
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
        {isSuperAdmin && (
          <NavLink to="/accesos" className={({ isActive }) => 'rc-sidebar-link' + (isActive ? ' active' : '')}>
            <span aria-hidden="true">🔐</span>
            Accesos
          </NavLink>
        )}
        <NavLink to="/perfil" className={({ isActive }) => 'rc-sidebar-link' + (isActive ? ' active' : '')}>
          <span aria-hidden="true">👤</span>
          Mi Perfil
        </NavLink>
      </nav>
      <div className="rc-sidebar-footer">
        <button className="rc-sidebar-link" style={{ width: '100%', border: 'none', background: 'transparent', cursor: 'pointer' }} onClick={() => signOut()}>
          <span aria-hidden="true">🚪</span>
          Salir
        </button>
      </div>
    </aside>
  )
}
