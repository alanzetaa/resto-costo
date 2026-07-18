import { FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setSubmitting(false)
    if (error) {
      setError('No pudimos procesar la solicitud. Intentá nuevamente.')
      return
    }
    setSent(true)
  }

  return (
    <div className="rc-auth-page">
      <div className="rc-auth-box rc-card">
        <div className="rc-auth-logo">RestoCosto</div>
        {error && <div className="rc-alert rc-alert-error">{error}</div>}
        {sent ? (
          <div className="rc-alert rc-alert-success">
            Si el email existe en el sistema, te enviamos un link para restablecer tu contraseña.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="rc-field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                className="rc-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>
            <button type="submit" className="rc-btn rc-btn-primary" style={{ width: '100%' }} disabled={submitting}>
              {submitting ? 'Enviando...' : 'Enviar link de recuperación'}
            </button>
          </form>
        )}
        <div className="rc-auth-links" style={{ justifyContent: 'center', marginTop: '1rem' }}>
          <Link to="/login">Volver a Ingresar</Link>
        </div>
      </div>
    </div>
  )
}
