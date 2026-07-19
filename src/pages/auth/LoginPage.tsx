import { FormEvent, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabaseClient'
import { useAuth } from '../../contexts/AuthContext'

export function LoginPage() {
  const { session, loading } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && session) {
    const from = (location.state as { from?: string } | null)?.from ?? '/productos'
    return <Navigate to={from} replace />
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setSubmitting(false)
    if (error) {
      setError('Email o contraseña incorrectos.')
    }
  }

  async function handleGoogle() {
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/productos` },
    })
    if (error) setError('No se pudo iniciar sesión con Google.')
  }

  return (
    <div className="rc-auth-page">
      <div className="rc-auth-box rc-card">
        <div className="rc-auth-logo">RestoCosto</div>
        {error && <div className="rc-alert rc-alert-error">{error}</div>}
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
          <div className="rc-field">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              type="password"
              className="rc-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          <button type="submit" className="rc-btn rc-btn-primary" style={{ width: '100%' }} disabled={submitting}>
            {submitting ? 'Ingresando...' : 'Ingresar'}
          </button>
          <div className="rc-auth-links">
            <Link to="/forgot-password">¿Olvidaste tu contraseña?</Link>
          </div>
        </form>
        <div className="rc-auth-divider">o</div>
        <button type="button" className="rc-btn rc-btn-google" onClick={handleGoogle}>
          Ingresar con Google
        </button>
      </div>
    </div>
  )
}
