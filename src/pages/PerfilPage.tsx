import { FormEvent, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { toSentenceCase } from '../lib/textFormat'

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Administrador',
  pending: 'Sin acceso',
}

export function PerfilPage() {
  const { profile, refreshProfile } = useAuth()
  const [nombre, setNombre] = useState('')
  const [apellido, setApellido] = useState('')
  const [telefono, setTelefono] = useState('')
  const [savingDatos, setSavingDatos] = useState(false)
  const [messageDatos, setMessageDatos] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [newPassword, setNewPassword] = useState('')
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

      <div className="rc-card" style={{ maxWidth: 420, marginBottom: '1.25rem' }}>
        <h3 style={{ marginTop: 0 }}>Datos personales</h3>
        {messageDatos && <div className={`rc-alert rc-alert-${messageDatos.type}`}>{messageDatos.text}</div>}
        <form onSubmit={handleSaveDatos}>
          <div className="rc-field">
            <label htmlFor="nombre">Nombre</label>
            <input id="nombre" className="rc-input" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="rc-field">
            <label htmlFor="apellido">Apellido</label>
            <input id="apellido" className="rc-input" value={apellido} onChange={(e) => setApellido(e.target.value)} />
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
