import { FormEvent, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabaseClient'

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Administrador',
  pending: 'Sin acceso',
}

export function PerfilPage() {
  const { profile } = useAuth()
  const [newPassword, setNewPassword] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    if (newPassword.length < 8) {
      setMessage({ type: 'error', text: 'La contraseña debe tener al menos 8 caracteres.' })
      return
    }
    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setSubmitting(false)
    if (error) {
      setMessage({ type: 'error', text: 'No pudimos actualizar la contraseña.' })
      return
    }
    setNewPassword('')
    setMessage({ type: 'success', text: 'Contraseña actualizada correctamente.' })
  }

  return (
    <div>
      <div className="rc-page-header">
        <h1>Mi Perfil</h1>
      </div>
      <div className="rc-card" style={{ maxWidth: 420, marginBottom: '1.25rem' }}>
        <p style={{ margin: '0 0 0.5rem' }}>
          <strong>Email:</strong> {profile?.email}
        </p>
        <p style={{ margin: 0 }}>
          <strong>Rol:</strong> {ROLE_LABEL[profile?.role ?? ''] ?? profile?.role}
        </p>
      </div>
      <div className="rc-card" style={{ maxWidth: 420 }}>
        <h3 style={{ marginTop: 0 }}>Cambiar contraseña</h3>
        {message && <div className={`rc-alert rc-alert-${message.type}`}>{message.text}</div>}
        <form onSubmit={handleChangePassword}>
          <div className="rc-field">
            <label htmlFor="newPassword">Nueva contraseña</label>
            <input
              id="newPassword"
              type="password"
              className="rc-input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </div>
          <button type="submit" className="rc-btn rc-btn-primary" disabled={submitting}>
            {submitting ? 'Guardando...' : 'Actualizar contraseña'}
          </button>
        </form>
      </div>
    </div>
  )
}
