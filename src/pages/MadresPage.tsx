import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useSortableTable } from '../lib/useSortableTable'
import { SortableTh } from '../components/ui/SortableTh'
import { calcularSubtotalesBulk } from '../lib/bulkCosteo'

interface Preparacion {
  id: string
  nombre: string
  venue: string
  rubro_id: string | null
}

interface PreparacionRow extends Preparacion {
  rubroNombre: string
  costo: number
}

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })

export function MadresPage() {
  const navigate = useNavigate()
  const [preparaciones, setPreparaciones] = useState<Preparacion[]>([])
  const [rubroNombreById, setRubroNombreById] = useState<Map<string, string>>(new Map())
  const [costoById, setCostoById] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [venueFilter, setVenueFilter] = useState<'todos' | 'bar' | 'resto'>('todos')
  const [creating, setCreating] = useState(false)

  async function load() {
    setLoading(true)
    const [{ data: preps }, { data: rubros }, { data: config }] = await Promise.all([
      supabase.from('preparaciones').select('id, nombre, venue, rubro_id').order('nombre'),
      supabase.from('rubros').select('id, descripcion'),
      supabase.from('configuracion').select('merma_pct').single(),
    ])
    setPreparaciones((preps ?? []) as Preparacion[])
    setRubroNombreById(new Map((rubros ?? []).map((r) => [r.id, r.descripcion])))

    const mermaPct = Number(config?.merma_pct ?? 0.05)
    const prepIds = (preps ?? []).map((p) => p.id)
    const subtotalByPrep = await calcularSubtotalesBulk(supabase, 'preparacion_ingredientes', prepIds)
    const costo = new Map<string, number>()
    for (const [id, subtotal] of subtotalByPrep) costo.set(id, subtotal * (1 + mermaPct))
    setCostoById(costo)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return preparaciones.filter((p) => {
      if (venueFilter !== 'todos' && p.venue !== venueFilter) return false
      if (q && !p.nombre.toLowerCase().includes(q)) return false
      return true
    })
  }, [preparaciones, search, venueFilter])

  const rows: PreparacionRow[] = useMemo(
    () =>
      filtered.map((p) => ({
        ...p,
        rubroNombre: p.rubro_id ? rubroNombreById.get(p.rubro_id) ?? '' : '',
        costo: costoById.get(p.id) ?? 0,
      })),
    [filtered, rubroNombreById, costoById],
  )
  const { sorted, sortKey, direction, toggleSort } = useSortableTable<PreparacionRow>(rows, 'nombre')

  async function handleNueva() {
    setCreating(true)
    const { data, error } = await supabase
      .from('preparaciones')
      .insert({ nombre: 'Nueva Madre', venue: 'bar' })
      .select('id')
      .single()
    setCreating(false)
    if (!error && data) navigate(`/madres/${data.id}`)
  }

  async function handleDelete(e: MouseEvent, p: Preparacion) {
    e.stopPropagation()
    const [{ count: c1 }, { count: c2 }] = await Promise.all([
      supabase.from('preparacion_ingredientes').select('id', { count: 'exact', head: true }).eq('insumo_type', 'preparacion').eq('insumo_id', p.id),
      supabase.from('receta_ingredientes').select('id', { count: 'exact', head: true }).eq('insumo_type', 'preparacion').eq('insumo_id', p.id),
    ])
    const usos = (c1 ?? 0) + (c2 ?? 0)
    if (usos > 0) {
      alert(`No se puede borrar "${p.nombre}": está en uso en ${usos} Madre(s)/Receta(s).`)
      return
    }
    if (!window.confirm(`¿Borrar "${p.nombre}"? No se puede deshacer.`)) return
    const { error } = await supabase.from('preparaciones').delete().eq('id', p.id)
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
          <h1>Madres</h1>
          <p>{preparaciones.length} preparaciones base.</p>
        </div>
        <button className="rc-btn rc-btn-primary" onClick={handleNueva} disabled={creating}>
          + Nueva Madre
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
                  onClick={() => navigate(`/madres/${p.id}`)}
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
