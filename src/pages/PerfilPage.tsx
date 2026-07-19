import { FormEvent, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { toSentenceCase } from '../lib/textFormat'

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Administrador',
  pending: 'Sin acceso',
}

function iniciales(nombre: string | null | undefined, apellido: string | null | undefined, email: string | undefined) {
  const n = nombre?.trim()?.[0] ?? ''
  const a = apellido?.trim()?.[0] ?? ''
  if (n || a) return (n + a).toUpperCase()
  return (email?.[0] ?? '?').toUpperCase()
}

export function PerfilPage() {
  const { profile, refreshProfile } = useAuth()
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [telefono, setTelefono] = useState('')
  const [savingDatos, setSavingDatos] = useState(false)
  const [messageDatos, setMessageDatos] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    setNombre(profile?.nombre ?? '')
    setApellido(profile?.apellido ?? '')
    setTelefono(profile?.telefono ?? '')
  }, [profile])

  async function handleSaveDatos(e: FormEvent) {
    e.preventDefault()
    if (!profile) return
    setMessageDatos(null)
    setSavingDatos(true)
    const { error } = await supabase
      .from('profiles')
      .update({
        nombre: nombre.trim() ? toSentenceCase(nombre.trim()) : null,
        apellido: apellido.trim() ? toSentenceCase(apellido.trim()) : null,
        telefono: telefono.trim() || null,
      })
      .eq('id', profile.id)
    setSavingDatos(false)
    if (error) {
      setMessageDatos({ type: 'error', text: 'No se pudo guardar: ' + error.message })
      return
    }
    await refreshProfile()
    setMessageDatos({ type: 'success', text: 'Datos guardados.' })
  }

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    if (newPassword.length < 8) {
      setMessage({ type: 'error', text: 'La contraseña debe tener al menos 8 caracteres.' })
      return
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Las contraseñas no coinciden.' })
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
    setConfirmPassword('')
    setMessage({ type: 'success', text: 'Contraseña actualizada correctamente.' })
  }

  const nombreCompleto = [profile?.nombre, profile?.apellido].filter(Boolean).join(' ')

  return (
    <div>
      <div className="rc-page-header">
        <h1>Mi Perfil</h1>
      </div>

      <div className="rc-card" style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'var(--rc-primary)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.5rem',
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {iniciales(profile?.nombre, profile?.apellido, profile?.email)}
        </div>
        <div style={{ display: 'flex', gap: '2.5rem', flexWrap: 'wrap', flex: 1 }}>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--rc-text-muted)' }}>Nombre</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>{nombreCompleto || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--rc-text-muted)' }}>Email</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>{profile?.email}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--rc-text-muted)' }}>Teléfono</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>{profile?.telefono || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--rc-text-muted)' }}>Rol</div>
            <span className={`rc-badge rc-badge-${profile?.role ?? 'pending'}`}>{ROLE_LABEL[profile?.role ?? ''] ?? profile?.role}</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1.25rem' }}>
        <div className="rc-card">
          <h3 style={{ marginTop: 0 }}>Datos personales</h3>
          {messageDatos && <div className={`rc-alert rc-alert-${messageDatos.type}`}>{messageDatos.text}</div>}
          <form onSubmit={handleSaveDatos}>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <div className="rc-field" style={{ flex: 1 }}>
                <label htmlFor="nombre">Nombre</label>
                <input id="nombre" className="rc-input" value={nombre} onChange={(e) => setNombre(e.target.value)} />
              </div>
              <div className="rc-field" style={{ flex: 1 }}>
                <label htmlFor="apellido">Apellido</label>
                <input id="apellido" className="rc-input" value={apellido} onChange={(e) => setApellido(e.target.value)} />
              </div>
            </div>
            <div className="rc-field">
              <label htmlFor="telefono">Teléfono</label>
              <input id="telefono" className="rc-input" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Opcional" />
            </div>
            <button type="submit" className="rc-btn rc-btn-primary" disabled={savingDatos}>
              {savingDatos ? 'Guardando...' : 'Guardar datos'}
            </button>
          </form>
        </div>

        <div className="rc-card">
          <h3 style={{ marginTop: 0 }}>Cambiar contraseña</h3>
          {message && <div className={`rc-alert rc-alert-${message.type}`}>{message.text}</div>}
          <form onSubmit={handleChangePassword}>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <div className="rc-field" style={{ flex: 1 }}>
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
              <div className="rc-field" style={{ flex: 1 }}>
                <label htmlFor="confirmPassword">Confirmar contraseña</label>
                <input
                  id="confirmPassword"
                  type="password"
                  className="rc-input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
            </div>
            <button type="submit" className="rc-btn rc-btn-primary" disabled={submitting}>
              {submitting ? 'Guardando...' : 'Actualizar contraseña'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
