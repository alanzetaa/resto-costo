import { FormEvent, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setSubmitting(true)
    const { error } = await supabase.auth.updateUser({ password })
    setSubmitting(false)

    if (error) {
      setError('No pudimos actualizar tu contraseña. El link puede haber expirado.')
      return
    }
    navigate('/dashboard', { replace: true })
  }

  return (
    <div className="rc-auth-page">
      <div className="rc-auth-box rc-card">
        <div className="rc-auth-logo">RestoCosto</div>
        <p style={{ color: 'var(--rc-text-muted)', marginTop: 0 }}>Elegí tu nueva contraseña.</p>
        {error && <div className="rc-alert rc-alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="rc-field">
            <label htmlFor="password">Nueva contraseña</label>
            <input
              id="password"
              type="password"
              className="rc-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          <div className="rc-field">
            <label htmlFor="confirmPassword">Confirmar contraseña</label>
            <input
              id="confirmPassword"
              type="password"
              className="rc-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          <button type="submit" className="rc-btn rc-btn-primary" style={{ width: '100%' }} disabled={submitting}>
            {submitting ? 'Guardando...' : 'Guardar nueva contraseña'}
          </button>
        </form>
      </div>
    </div>
  )
}
