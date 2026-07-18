import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useSortableTable } from '../lib/useSortableTable'
import { SortableTh } from '../components/ui/SortableTh'
import { calcularSubtotalesBulk } from '../lib/bulkCosteo'
import { precioSugerido } from '../lib/costing'

interface Receta {
  id: string
  nombre: string
  venue: string
  rubro_id: string | null
  precio_actual: number | null
}

interface Lista {
  id: string
  codigo: string
  nombre: string
}

interface Objetivo {
  rubro_id: string
  lista_id: string
  food_cost_pct: number
}

interface Row {
  id: string
  nombre: string
  venue: string
  costoConMerma: number
  foodCostObjetivo: number | null
  precioSugerido: number | null
  precioActual: number | null
  diferenciaMonto: number | null
  diferenciaPct: number | null
  foodCostReal: number | null
}

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })
const pct = (n: number) => `${(n * 100).toFixed(1)}%`

export function ListasPrecioPage() {
  const navigate = useNavigate()
  const [recetas, setRecetas] = useState<Receta[]>([])
  const [listas, setListas] = useState<Lista[]>([])
  const [objetivos, setObjetivos] = useState<Objetivo[]>([])
  const [costoById, setCostoById] = useState<Map<string, number>>(new Map())
  const [ivaPct, setIvaPct] = useState(0.21)
  const [listaId, setListaId] = useState<string>('')
  const [venueFilter, setVenueFilter] = useState<'todos' | 'bar' | 'resto'>('todos')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const [{ data: recetasData }, { data: listasData }, { data: objetivosData }, { data: config }] = await Promise.all([
      supabase.from('recetas').select('id, nombre, venue, rubro_id, precio_actual').order('nombre'),
      supabase.from('listas_precio').select('id, codigo, nombre').order('codigo'),
      supabase.from('rubro_lista_objetivo').select('rubro_id, lista_id, food_cost_pct'),
      supabase.from('configuracion').select('merma_pct, iva_pct').single(),
    ])
    setRecetas((recetasData ?? []) as Receta[])
    setListas((listasData ?? []) as Lista[])
    setObjetivos((objetivosData ?? []) as Objetivo[])
    setIvaPct(Number(config?.iva_pct ?? 0.21))
    if (!listaId && listasData?.length) setListaId(listasData[0].id)

    const ids = (recetasData ?? []).map((r) => r.id)
    const subtotalById = await calcularSubtotalesBulk(supabase, 'receta_ingredientes', ids)
    const costo = new Map<string, number>()
    const merma = Number(config?.merma_pct ?? 0.05)
    for (const [id, subtotal] of subtotalById) costo.set(id, subtotal * (1 + merma))
    setCostoById(costo)

    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const rows: Row[] = useMemo(() => {
    return recetas
      .filter((r) => venueFilter === 'todos' || r.venue === venueFilter)
      .filter((r) => !search.trim() || r.nombre.toLowerCase().includes(search.trim().toLowerCase()))
      .map((r) => {
        const costoConMerma = costoById.get(r.id) ?? 0
        const objetivo = r.rubro_id ? objetivos.find((o) => o.rubro_id === r.rubro_id && o.lista_id === listaId) : undefined
        const foodCostObjetivo = objetivo?.food_cost_pct ?? null
        const sugerido = foodCostObjetivo !== null ? precioSugerido(costoConMerma, foodCostObjetivo, ivaPct) : null
        const precioActual = r.precio_actual
        const diferenciaMonto = precioActual !== null && sugerido !== null ? precioActual - sugerido : null
        const diferenciaPct = precioActual && diferenciaMonto !== null ? diferenciaMonto / precioActual : null
        const foodCostReal = precioActual ? (costoConMerma * (1 + ivaPct)) / precioActual : null
        return {
          id: r.id,
          nombre: r.nombre,
          venue: r.venue,
          costoConMerma,
          foodCostObjetivo,
          precioSugerido: sugerido,
          precioActual,
          diferenciaMonto,
          diferenciaPct,
          foodCostReal,
        }
      })
  }, [recetas, costoById, objetivos, listaId, ivaPct, venueFilter, search])

  const { sorted, sortKey, direction, toggleSort } = useSortableTable<Row>(rows, 'nombre')

  async function handleUpdatePrecioActual(recetaId: string, value: string) {
    const precio = value.trim() === '' ? null : parseFloat(value.replace(',', '.'))
    if (value.trim() !== '' && !Number.isFinite(precio)) return
    setRecetas((prev) => prev.map((r) => (r.id === recetaId ? { ...r, precio_actual: precio } : r)))
    await supabase
      .from('recetas')
      .update({ precio_actual: precio, precio_actualizado_at: new Date().toISOString() })
      .eq('id', recetaId)
  }

  return (
    <div>
      <div className="rc-page-header">
        <h1>Listas de Precio</h1>
        <p>Precio sugerido según food cost objetivo vs. precio de venta actual, por receta.</p>
      </div>

      <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--rc-text-muted)', display: 'block' }}>Lista (food cost objetivo)</label>
          <select className="rc-input" style={{ maxWidth: 200 }} value={listaId} onChange={(e) => setListaId(e.target.value)}>
            {listas.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nombre}
              </option>
            ))}
          </select>
        </div>
        <input
          className="rc-input"
          style={{ maxWidth: 260 }}
          placeholder="Buscar por nombre..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="rc-input" style={{ maxWidth: 160 }} value={venueFilter} onChange={(e) => setVenueFilter(e.target.value as typeof venueFilter)}>
          <option value="todos">Todos los venues</option>
          <option value="bar">Bar</option>
          <option value="resto">Resto</option>
        </select>
      </div>

      <div className="rc-card" style={{ overflowX: 'auto' }}>
        {loading ? (
          <p style={{ color: 'var(--rc-text-muted)' }}>Cargando...</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.87rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--rc-border)' }}>
                <SortableTh label="Nombre" active={sortKey === 'nombre'} direction={direction} onClick={() => toggleSort('nombre')} style={{ padding: '0.5rem 0.5rem 0.5rem 0' }} />
                <SortableTh label="Venue" active={sortKey === 'venue'} direction={direction} onClick={() => toggleSort('venue')} />
                <SortableTh label="Costo c/merma" active={sortKey === 'costoConMerma'} direction={direction} onClick={() => toggleSort('costoConMerma')} />
                <SortableTh label="Food cost objetivo" active={sortKey === 'foodCostObjetivo'} direction={direction} onClick={() => toggleSort('foodCostObjetivo')} />
                <SortableTh label="Precio sugerido" active={sortKey === 'precioSugerido'} direction={direction} onClick={() => toggleSort('precioSugerido')} />
                <th>Precio actual</th>
                <SortableTh label="Diferencia $" active={sortKey === 'diferenciaMonto'} direction={direction} onClick={() => toggleSort('diferenciaMonto')} />
                <SortableTh label="Diferencia %" active={sortKey === 'diferenciaPct'} direction={direction} onClick={() => toggleSort('diferenciaPct')} />
                <SortableTh label="Food cost real" active={sortKey === 'foodCostReal'} direction={direction} onClick={() => toggleSort('foodCostReal')} />
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--rc-border)' }}>
                  <td style={{ padding: '0.4rem 0.5rem 0.4rem 0' }}>{r.nombre}</td>
                  <td style={{ textTransform: 'capitalize' }}>{r.venue}</td>
                  <td>{money.format(r.costoConMerma)}</td>
                  <td>{r.foodCostObjetivo !== null ? pct(r.foodCostObjetivo) : '—'}</td>
                  <td>{r.precioSugerido !== null ? money.format(r.precioSugerido) : '—'}</td>
                  <td>
                    <input
                      className="rc-input"
                      style={{ width: 100 }}
                      defaultValue={r.precioActual ?? ''}
                      onBlur={(e) => handleUpdatePrecioActual(r.id, e.target.value)}
                    />
                  </td>
                  <td
                    style={{
                      color: r.diferenciaMonto !== null ? (r.diferenciaMonto < 0 ? 'var(--rc-danger)' : 'var(--rc-success)') : undefined,
                    }}
                  >
                    {r.diferenciaMonto !== null ? money.format(r.diferenciaMonto) : '—'}
                  </td>
                  <td>{r.diferenciaPct !== null ? pct(r.diferenciaPct) : '—'}</td>
                  <td
                    style={{
                      color:
                        r.foodCostReal !== null && r.foodCostObjetivo !== null && r.foodCostReal > r.foodCostObjetivo
                          ? 'var(--rc-danger)'
                          : undefined,
                    }}
                  >
                    {r.foodCostReal !== null ? pct(r.foodCostReal) : '—'}
                  </td>
                  <td>
                    <button className="rc-btn rc-btn-secondary" onClick={() => navigate(`/recetas/${r.id}`)}>
                      Ver
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
