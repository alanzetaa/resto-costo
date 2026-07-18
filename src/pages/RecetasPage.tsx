import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useSortableTable } from '../lib/useSortableTable'
import { SortableTh } from '../components/ui/SortableTh'
import { calcularSubtotalesBulk } from '../lib/bulkCosteo'

interface Receta {
  id: string
  nombre: string
  venue: string
  rubro_id: string | null
}

interface RecetaRow extends Receta {
  rubroNombre: string
  costo: number
}

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })

export function RecetasPage() {
  const navigate = useNavigate()
  const [recetas, setRecetas] = useState<Receta[]>([])
  const [rubroNombreById, setRubroNombreById] = useState<Map<string, string>>(new Map())
  const [costoById, setCostoById] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [venueFilter, setVenueFilter] = useState<'todos' | 'bar' | 'resto'>('todos')
  const [creating, setCreating] = useState(false)

  async function load() {
    setLoading(true)
    const [{ data: recetasData }, { data: rubros }, { data: config }] = await Promise.all([
      supabase.from('recetas').select('id, nombre, venue, rubro_id').order('nombre'),
      supabase.from('rubros').select('id, descripcion'),
      supabase.from('configuracion').select('merma_pct').single(),
    ])
    setRecetas((recetasData ?? []) as Receta[])
    setRubroNombreById(new Map((rubros ?? []).map((r) => [r.id, r.descripcion])))

    const mermaPct = Number(config?.merma_pct ?? 0.05)
    const ids = (recetasData ?? []).map((p) => p.id)
    const subtotalByReceta = await calcularSubtotalesBulk(supabase, 'receta_ingredientes', ids)
    const costo = new Map<string, number>()
    for (const [id, subtotal] of subtotalByReceta) costo.set(id, subtotal * (1 + mermaPct))
    setCostoById(costo)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return recetas.filter((p) => {
      if (venueFilter !== 'todos' && p.venue !== venueFilter) return false
      if (q && !p.nombre.toLowerCase().includes(q)) return false
      return true
    })
  }, [recetas, search, venueFilter])

  const rows: RecetaRow[] = useMemo(
    () =>
      filtered.map((p) => ({
        ...p,
        rubroNombre: p.rubro_id ? rubroNombreById.get(p.rubro_id) ?? '' : '',
        costo: costoById.get(p.id) ?? 0,
      })),
    [filtered, rubroNombreById, costoById],
  )
  const { sorted, sortKey, direction, toggleSort } = useSortableTable<RecetaRow>(rows, 'nombre')

  async function handleNueva() {
    setCreating(true)
    const { data, error } = await supabase.from('recetas').insert({ nombre: 'Nueva Receta', venue: 'bar' }).select('id').single()
    setCreating(false)
    if (!error && data) navigate(`/recetas/${data.id}`)
  }

  async function handleDelete(e: MouseEvent, r: Receta) {
    e.stopPropagation()
    if (!window.confirm(`¿Borrar "${r.nombre}"? No se puede deshacer.`)) return
    const { error } = await supabase.from('recetas').delete().eq('id', r.id)
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
          <h1>Recetas</h1>
          <p>{recetas.length} platos de carta.</p>
        </div>
        <button className="rc-btn rc-btn-primary" onClick={handleNueva} disabled={creating}>
          + Nueva Receta
        </button>
      </div>

      <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <input
          className="rc-input"
          style={{ maxWidth: 320 }}
          placeholder="Buscar por nombre..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="rc-input" style={{ maxWidth: 160 }} value={venueFilter} onChange={(e) => setVenueFilter(e.target.value as typeof venueFilter)}>
          <option value="todos">Todos los sectores</option>
          <option value="bar">Bar</option>
          <option value="resto">Resto</option>
        </select>
      </div>

      <div className="rc-card" style={{ overflowX: 'auto' }}>
        {loading ? (
          <p style={{ color: 'var(--rc-text-muted)' }}>Cargando...</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--rc-border)' }}>
                <SortableTh label="Nombre" active={sortKey === 'nombre'} direction={direction} onClick={() => toggleSort('nombre')} style={{ padding: '0.5rem 0.5rem 0.5rem 0' }} />
                <SortableTh label="Sector" active={sortKey === 'venue'} direction={direction} onClick={() => toggleSort('venue')} />
                <SortableTh label="Rubro" active={sortKey === 'rubroNombre'} direction={direction} onClick={() => toggleSort('rubroNombre')} />
                <SortableTh label="Costo con merma" active={sortKey === 'costo'} direction={direction} onClick={() => toggleSort('costo')} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr
                  key={p.id}
                  style={{ borderBottom: '1px solid var(--rc-border)', cursor: 'pointer' }}
                  onClick={() => navigate(`/recetas/${p.id}`)}
                >
                  <td style={{ padding: '0.4rem 0.5rem 0.4rem 0' }}>{p.nombre}</td>
                  <td style={{ textTransform: 'capitalize' }}>{p.venue}</td>
                  <td>{p.rubroNombre || '—'}</td>
                  <td>{money.format(p.costo)}</td>
                  <td style={{ display: 'flex', gap: '0.4rem' }}>
                    <span className="rc-btn rc-btn-secondary">Ver</span>
                    <button className="rc-btn rc-btn-secondary" onClick={(e) => handleDelete(e, p)}>
                      Borrar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
