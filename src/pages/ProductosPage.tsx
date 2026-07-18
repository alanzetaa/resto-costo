import { FormEvent, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { Modal as ModalShell } from '../components/ui/Modal'
import { toSentenceCase } from '../lib/textFormat'
import { useSortableTable } from '../lib/useSortableTable'
import { SortableTh } from '../components/ui/SortableTh'

interface Producto {
  id: string
  codigo: string
  descripcion: string
  proveedor: string | null
  precio_compra: number
  descuento_pct: number
  unidad: string
  cantidad_envase: number
  categoria: string | null
  precio_unitario: number
}

interface FormState {
  id: string | null
  codigo: string
  descripcion: string
  proveedor: string
  precio_compra: string
  descuento_pct: string
  unidad: string
  cantidad_envase: string
  categoria: string
}

const EMPTY_FORM: FormState = {
  id: null,
  codigo: '',
  descripcion: '',
  proveedor: '',
  precio_compra: '0',
  descuento_pct: '0',
  unidad: '',
  cantidad_envase: '1',
  categoria: '',
}

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })

export function ProductosPage() {
  const { profile } = useAuth()
  const [productos, setProductos] = useState<Producto[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.from('productos').select('*').order('descripcion')
    if (!error) setProductos((data ?? []) as Producto[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return productos
    return productos.filter(
      (p) =>
        p.codigo.toLowerCase().includes(q) ||
        p.descripcion.toLowerCase().includes(q) ||
        (p.proveedor ?? '').toLowerCase().includes(q) ||
        (p.categoria ?? '').toLowerCase().includes(q),
    )
  }, [productos, search])

  const { sorted, sortKey, direction, toggleSort } = useSortableTable<Producto>(filtered, 'descripcion')

  function openEdit(p: Producto) {
    setError(null)
    setForm({
      id: p.id,
      codigo: p.codigo,
      descripcion: p.descripcion,
      proveedor: p.proveedor ?? '',
      precio_compra: String(p.precio_compra),
      descuento_pct: String(p.descuento_pct),
      unidad: p.unidad,
      cantidad_envase: String(p.cantidad_envase),
      categoria: p.categoria ?? '',
    })
  }

  function openNew() {
    setError(null)
    setForm({ ...EMPTY_FORM })
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!form) return
    setError(null)
    setSaving(true)

    const payload = {
      codigo: form.codigo.trim(),
      descripcion: toSentenceCase(form.descripcion.trim()),
      proveedor: form.proveedor.trim() ? toSentenceCase(form.proveedor.trim()) : null,
      precio_compra: parseFloat(form.precio_compra.replace(',', '.')) || 0,
      descuento_pct: parseFloat(form.descuento_pct.replace(',', '.')) || 0,
      unidad: form.unidad.trim(),
      cantidad_envase: parseFloat(form.cantidad_envase.replace(',', '.')) || 1,
      categoria: form.categoria.trim() ? toSentenceCase(form.categoria.trim()) : null,
      updated_by: profile?.id,
    }

    const { error } = form.id
      ? await supabase.from('productos').update(payload).eq('id', form.id)
      : await supabase.from('productos').insert(payload)

    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    setForm(null)
    await load()
  }

  return (
    <div>
      <div className="rc-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1>Productos</h1>
          <p>{productos.length} insumos cargados.</p>
        </div>
        <button className="rc-btn rc-btn-primary" onClick={openNew}>
          + Nuevo producto
        </button>
      </div>

      <div style={{ marginBottom: '1rem', maxWidth: 360 }}>
        <input
          className="rc-input"
          placeholder="Buscar por código, nombre, proveedor o categoría..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="rc-card" style={{ overflowX: 'auto' }}>
        {loading ? (
          <p style={{ color: 'var(--rc-text-muted)' }}>Cargando...</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--rc-border)' }}>
                <SortableTh label="Código" active={sortKey === 'codigo'} direction={direction} onClick={() => toggleSort('codigo')} style={{ padding: '0.5rem 0.5rem 0.5rem 0' }} />
                <SortableTh label="Descripción" active={sortKey === 'descripcion'} direction={direction} onClick={() => toggleSort('descripcion')} />
                <SortableTh label="Proveedor" active={sortKey === 'proveedor'} direction={direction} onClick={() => toggleSort('proveedor')} />
                <SortableTh label="Categoría" active={sortKey === 'categoria'} direction={direction} onClick={() => toggleSort('categoria')} />
                <SortableTh label="Precio compra" active={sortKey === 'precio_compra'} direction={direction} onClick={() => toggleSort('precio_compra')} />
                <SortableTh label="Desc. %" active={sortKey === 'descuento_pct'} direction={direction} onClick={() => toggleSort('descuento_pct')} />
                <SortableTh label="Unidad" active={sortKey === 'unidad'} direction={direction} onClick={() => toggleSort('unidad')} />
                <SortableTh label="Cant. envase" active={sortKey === 'cantidad_envase'} direction={direction} onClick={() => toggleSort('cantidad_envase')} />
                <SortableTh label="Precio unitario" active={sortKey === 'precio_unitario'} direction={direction} onClick={() => toggleSort('precio_unitario')} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--rc-border)' }}>
                  <td style={{ padding: '0.4rem 0.5rem 0.4rem 0' }}>{p.codigo}</td>
                  <td>{p.descripcion}</td>
                  <td>{p.proveedor ?? '—'}</td>
                  <td>{p.categoria ?? '—'}</td>
                  <td>{money.format(p.precio_compra)}</td>
                  <td>{(p.descuento_pct * 100).toFixed(0)}%</td>
                  <td>{p.unidad}</td>
                  <td>{p.cantidad_envase}</td>
                  <td>{money.format(p.precio_unitario)}</td>
                  <td>
                    <button className="rc-btn rc-btn-secondary" onClick={() => openEdit(p)}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {form && (
        <ProductoModal
          form={form}
          setForm={setForm}
          onSubmit={handleSubmit}
          saving={saving}
          error={error}
          onClose={() => setForm(null)}
        />
      )}
    </div>
  )
}

interface ProductoModalProps {
  form: FormState
  setForm: (f: FormState) => void
  onSubmit: (e: FormEvent) => void
  saving: boolean
  error: string | null
  onClose: () => void
}

function ProductoModal({ form, setForm, onSubmit, saving, error, onClose }: ProductoModalProps) {
  return (
    <ModalShell title={form.id ? 'Editar producto' : 'Nuevo producto'} onClose={onClose}>
      {error && <div className="rc-alert rc-alert-error">{error}</div>}
      <form onSubmit={onSubmit}>
        <div className="rc-field">
          <label>Código</label>
          <input className="rc-input" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} required />
        </div>
        <div className="rc-field">
          <label>Descripción</label>
          <input className="rc-input" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} required />
        </div>
        <div className="rc-field">
          <label>Proveedor</label>
          <input className="rc-input" value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} />
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <div className="rc-field" style={{ flex: 1 }}>
            <label>Precio de compra</label>
            <input className="rc-input" value={form.precio_compra} onChange={(e) => setForm({ ...form, precio_compra: e.target.value })} />
          </div>
          <div className="rc-field" style={{ flex: 1 }}>
            <label>Descuento (0-1)</label>
            <input className="rc-input" value={form.descuento_pct} onChange={(e) => setForm({ ...form, descuento_pct: e.target.value })} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <div className="rc-field" style={{ flex: 1 }}>
            <label>Unidad</label>
            <input className="rc-input" value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })} required />
          </div>
          <div className="rc-field" style={{ flex: 1 }}>
            <label>Cantidad por envase</label>
            <input className="rc-input" value={form.cantidad_envase} onChange={(e) => setForm({ ...form, cantidad_envase: e.target.value })} />
          </div>
        </div>
        <div className="rc-field">
          <label>Categoría</label>
          <input className="rc-input" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} placeholder="ALMACEN, CARNES, BEBIDAS..." />
        </div>
        <button type="submit" className="rc-btn rc-btn-primary" style={{ width: '100%' }} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </form>
    </ModalShell>
  )
}

