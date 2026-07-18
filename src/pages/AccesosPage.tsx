import { FormEvent, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useSortableTable } from '../lib/useSortableTable'
import { SortableTh } from '../components/ui/SortableTh'

interface RoleAssignmentRow {
  email: string
  role: string
  invited_at: string
}

interface ProfileRow {
  email: string
  role: string
  created_at: string
}

interface AccessRow {
  email: string
  role: string
  estado: 'Invitado' | 'Activo'
}

const ASSIGNABLE_ROLES = [
  { value: 'admin', label: 'Administrador (edición total del módulo de costeo)' },
]

export function AccesosPage() {
  const [rows, setRows] = useState<AccessRow[]>([])
  const [loadingRows, setLoadingRows] = useState(true)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState(ASSIGNABLE_ROLES[0].value)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function loadAccessRows() {
    setLoadingRows(true)
    const [{ data: assignments }, { data: profiles }] = await Promise.all([
      supabase.from('role_assignments').select('email, role, invited_at').returns<RoleAssignmentRow[]>(),
      supabase.from('profiles').select('email, role, created_at').returns<ProfileRow[]>(),
    ])

    const activeEmails = new Set((profiles ?? []).map((p) => p.email.toLowerCase()))
    const merged: AccessRow[] = (assignments ?? []).map((a) => ({
      email: a.email,
      role: a.role,
      estado: activeEmails.has(a.email.toLowerCase()) ? 'Activo' : 'Invitado',
    }))
    setRows(merged)
    setLoadingRows(false)
  }

  useEffect(() => {
    loadAccessRows()
  }, [])

  const { sorted, sortKey, direction, toggleSort } = useSortableTable<AccessRow>(rows, 'email')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    setSubmitting(true)

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      setSubmitting(false)
      setMessage({ type: 'error', text: 'Tu sesión expiró, volvé a iniciar sesión.' })
      return
    }

    try {
      const res = await fetch('/api/invite-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ email, role }),
      })
      const body = await res.json()
      if (!res.ok) {
        throw new Error(body?.error ?? 'Error desconocido')
      }
      setMessage({ type: 'success', text: `Se otorgó acceso a ${email}.` })
      setEmail('')
      await loadAccessRows()
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'No se pudo dar de alta el acceso.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div className="rc-page-header">
        <h1>Accesos</h1>
        <p>Solo vos, como Super Admin, ves esta sección. Acá gestionás quién entra a RestoCosto y con qué rol.</p>
      </div>

      <div className="rc-card" style={{ maxWidth: 480, marginBottom: '1.5rem' }}>
        <h3 style={{ marginTop: 0 }}>Dar acceso a un nuevo email</h3>
        {message && <div className={`rc-alert rc-alert-${message.type}`}>{message.text}</div>}
        <form onSubmit={handleSubmit}>
          <div className="rc-field">
            <label htmlFor="newEmail">Email</label>
            <input
              id="newEmail"
              type="email"
              className="rc-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="rc-field">
            <label htmlFor="role">Tipo de acceso</label>
            <select id="role" className="rc-input" value={role} onChange={(e) => setRole(e.target.value)}>
              {ASSIGNABLE_ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="rc-btn rc-btn-primary" disabled={submitting}>
            {submitting ? 'Guardando...' : 'Dar acceso'}
          </button>
        </form>
      </div>

      <div className="rc-card">
        <h3 style={{ marginTop: 0 }}>Accesos otorgados</h3>
        {loadingRows ? (
          <p style={{ color: 'var(--rc-text-muted)' }}>Cargando...</p>
        ) : rows.length === 0 ? (
          <p style={{ color: 'var(--rc-text-muted)' }}>Todavía no diste de alta ningún acceso.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--rc-border)' }}>
                <SortableTh label="Email" active={sortKey === 'email'} direction={direction} onClick={() => toggleSort('email')} style={{ padding: '0.5rem 0' }} />
                <SortableTh label="Rol" active={sortKey === 'role'} direction={direction} onClick={() => toggleSort('role')} />
                <SortableTh label="Estado" active={sortKey === 'estado'} direction={direction} onClick={() => toggleSort('estado')} />
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr key={row.email} style={{ borderBottom: '1px solid var(--rc-border)' }}>
                  <td style={{ padding: '0.5rem 0' }}>{row.email}</td>
                  <td>{row.role}</td>
                  <td>{row.estado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
