import { FormEvent, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Modal } from '../components/ui/Modal'
import { toSentenceCase } from '../lib/textFormat'
import { useSortableTable } from '../lib/useSortableTable'
import { SortableTh } from '../components/ui/SortableTh'

interface Proveedor {
  id: string
  nombre: string
  contacto: string | null
}

export function ProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Proveedor | null>(null)
  const [nombre, setNombre] = useState('')
  const [contacto, setContacto] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('proveedores').select('id, nombre, contacto').order('nombre')
    setProveedores((data ?? []) as Proveedor[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const { sorted, sortKey, direction, toggleSort } = useSortableTable<Proveedor>(
    proveedores.filter((p) => !search.trim() || p.nombre.toLowerCase().includes(search.trim().toLowerCase())),
    'nombre',
  )

  function openNew() {
    setEditing(null)
    setNombre('')
    setContacto('')
    setError(null)
    setModalOpen(true)
  }

  function openEdit(p: Proveedor) {
    setEditing(p)
    setNombre(p.nombre)
    setContacto(p.contacto ?? '')
    setError(null)
    setModalOpen(true)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const payload = { nombre: toSentenceCase(nombre.trim()), contacto: contacto.trim() || null }
    const { error } = editing
      ? await supabase.from('proveedores').update(payload).eq('id', editing.id)
      : await supabase.from('proveedores').insert(payload)
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    setModalOpen(false)
    await load()
  }

  async function handleDelete(p: Proveedor) {
    const { count } = await supabase.from('compras').select('id', { count: 'exact', head: true }).eq('proveedor_id', p.id)
    if ((count ?? 0) > 0) {
      alert(`No se puede borrar "${p.nombre}": tiene ${count} compra(s) registradas.`)
      return
    }
    if (!window.confirm(`¿Borrar el proveedor "${p.nombre}"? No se puede deshacer.`)) return
    const { error } = await supabase.from('proveedores').delete().eq('id', p.id)
    if (error) {
      alert('No se pudo borrar: ' + error.message)
      return
    }
    await load()
  }

  return (
    <div>
      <div className="rc-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1>Proveedores</h1>
          <p>{proveedores.length} proveedores cargados.</p>
        </div>
        <button className="rc-btn rc-btn-primary" onClick={openNew}>
          + Nuevo proveedor
        </button>
      </div>

      <div style={{ marginBottom: '1rem', maxWidth: 320 }}>
        <input className="rc-input" placeholder="Buscar por nombre..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="rc-card" style={{ overflowX: 'auto' }}>
        {loading ? (
          <p style={{ color: 'var(--rc-text-muted)' }}>Cargando...</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--rc-border)' }}>
                <SortableTh label="Nombre" active={sortKey === 'nombre'} direction={direction} onClick={() => toggleSort('nombre')} style={{ padding: '0.5rem 0.5rem 0.5rem 0' }} />
                <SortableTh label="Contacto" active={sortKey === 'contacto'} direction={direction} onClick={() => toggleSort('contacto')} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--rc-border)' }}>
                  <td style={{ padding: '0.4rem 0.5rem 0.4rem 0' }}>{p.nombre}</td>
                  <td>{p.contacto ?? '—'}</td>
                  <td style={{ display: 'flex', gap: '0.4rem' }}>
                    <button className="rc-btn rc-btn-secondary" onClick={() => openEdit(p)}>
                      Editar
                    </button>
                    <button className="rc-btn rc-btn-secondary" onClick={() => handleDelete(p)}>
                      Borrar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalOpen && (
        <Modal title={editing ? 'Editar proveedor' : 'Nuevo proveedor'} onClose={() => setModalOpen(false)}>
          {error && <div className="rc-alert rc-alert-error">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="rc-field">
              <label>Nombre</label>
              <input className="rc-input" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
            </div>
            <div className="rc-field">
              <label>Contacto (teléfono, email...)</label>
              <input className="rc-input" value={contacto} onChange={(e) => setContacto(e.target.value)} />
            </div>
            <button type="submit" className="rc-btn rc-btn-primary" style={{ width: '100%' }} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  )
}
