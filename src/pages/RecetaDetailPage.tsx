import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { calcularCosteo, type ObjetivoLista, type ResultadoCosteo } from '../lib/costing'
import { insumoKey, resolveInsumos } from '../lib/resolveInsumos'
import { IngredientPicker } from '../components/ingredients/IngredientPicker'
import { toSentenceCase } from '../lib/textFormat'

interface Rubro {
  id: string
  codigo: string
  descripcion: string
}

interface Linea {
  id: string
  insumo_type: 'producto' | 'preparacion'
  insumo_id: string
  cantidad_usada: number
  nombre: string
  unidad: string | null
  precio_unitario: number
}

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })
const pct = (n: number) => `${(n * 100).toFixed(0)}%`

export function RecetaDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [nombre, setNombre] = useState('')
  const [venue, setVenue] = useState('bar')
  const [rubroId, setRubroId] = useState<string>('')
  const [rendimientoCantidad, setRendimientoCantidad] = useState('')
  const [rendimientoUnidad, setRendimientoUnidad] = useState('')

  const [rubros, setRubros] = useState<Rubro[]>([])
  const [lineas, setLineas] = useState<Linea[]>([])
  const [mermaPct, setMermaPct] = useState(0.05)
  const [ivaPct, setIvaPct] = useState(0.21)
  const [objetivos, setObjetivos] = useState<ObjetivoLista[]>([])
  const [resultado, setResultado] = useState<ResultadoCosteo | null>(null)

  const [loading, setLoading] = useState(true)
  const [savingHeader, setSavingHeader] = useState(false)
  const [notFound, setNotFound] = useState(false)

  async function load() {
    if (!id) return
    setLoading(true)

    const [{ data: receta, error: recetaError }, { data: rubrosData }, { data: config }, { data: listas }] = await Promise.all([
      supabase.from('recetas').select('*').eq('id', id).maybeSingle(),
      supabase.from('rubros').select('id, codigo, descripcion').order('descripcion'),
      supabase.from('configuracion').select('merma_pct, iva_pct').single(),
      supabase.from('listas_precio').select('id, codigo, nombre').order('codigo'),
    ])

    if (recetaError || !receta) {
      setNotFound(true)
      setLoading(false)
      return
    }

    setNombre(receta.nombre)
    setVenue(receta.venue)
    setRubroId(receta.rubro_id ?? '')
    setRendimientoCantidad(receta.rendimiento_cantidad !== null ? String(receta.rendimiento_cantidad) : '')
    setRendimientoUnidad(receta.rendimiento_unidad ?? '')
    setRubros((rubrosData ?? []) as Rubro[])
    setMermaPct(Number(config?.merma_pct ?? 0.05))
    setIvaPct(Number(config?.iva_pct ?? 0.21))

    const { data: ingredientRows } = await supabase
      .from('receta_ingredientes')
      .select('id, insumo_type, insumo_id, cantidad_usada')
      .eq('parent_id', id)

    const refs = (ingredientRows ?? []).map((r) => ({ insumo_type: r.insumo_type, insumo_id: r.insumo_id }))
    const info = await resolveInsumos(supabase, Number(config?.merma_pct ?? 0.05), refs)

    const lineasUI: Linea[] = (ingredientRows ?? []).map((r) => {
      const i = info.get(insumoKey(r.insumo_type, r.insumo_id))
      return {
        id: r.id,
        insumo_type: r.insumo_type,
        insumo_id: r.insumo_id,
        cantidad_usada: r.cantidad_usada,
        nombre: i?.nombre ?? '(no encontrado)',
        unidad: i?.unidad ?? null,
        precio_unitario: i?.precio_unitario ?? 0,
      }
    })
    setLineas(lineasUI)

    let objetivosData: ObjetivoLista[] = []
    if (receta.rubro_id && listas?.length) {
      const { data: obj } = await supabase
        .from('rubro_lista_objetivo')
        .select('lista_id, food_cost_pct')
        .eq('rubro_id', receta.rubro_id)
      objetivosData = listas.map((l) => ({
        lista_id: l.id,
        lista_codigo: l.codigo,
        lista_nombre: l.nombre,
        food_cost_pct: obj?.find((o) => o.lista_id === l.id)?.food_cost_pct ?? null,
      }))
    } else if (listas?.length) {
      objetivosData = listas.map((l) => ({ lista_id: l.id, lista_codigo: l.codigo, lista_nombre: l.nombre, food_cost_pct: null }))
    }
    setObjetivos(objetivosData)

    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    setResultado(
      calcularCosteo({
        ingredientes: lineas.map((l) => ({ cantidad_usada: l.cantidad_usada, precio_unitario: l.precio_unitario })),
        mermaPct,
        ivaPct,
        objetivos,
      }),
    )
  }, [lineas, mermaPct, ivaPct, objetivos])

  async function handleSaveHeader() {
    if (!id) return
    setSavingHeader(true)
    await supabase
      .from('recetas')
      .update({
        nombre: toSentenceCase(nombre.trim()),
        venue,
        rubro_id: rubroId || null,
        rendimiento_cantidad: rendimientoCantidad ? parseFloat(rendimientoCantidad.replace(',', '.')) : null,
        rendimiento_unidad: rendimientoUnidad.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
    setSavingHeader(false)
    await load()
  }

  async function handleAddIngrediente(item: { insumo_type: 'producto' | 'preparacion'; insumo_id: string }, cantidad: number) {
    if (!id) return
    const { data, error } = await supabase
      .from('receta_ingredientes')
      .insert({ parent_id: id, insumo_type: item.insumo_type, insumo_id: item.insumo_id, cantidad_usada: cantidad })
      .select('id')
      .single()
    if (error || !data) return
    const info = await resolveInsumos(supabase, mermaPct, [item])
    const i = info.get(insumoKey(item.insumo_type, item.insumo_id))
    setLineas((prev) => [
      ...prev,
      {
        id: data.id,
        insumo_type: item.insumo_type,
        insumo_id: item.insumo_id,
        cantidad_usada: cantidad,
        nombre: i?.nombre ?? '(no encontrado)',
        unidad: i?.unidad ?? null,
        precio_unitario: i?.precio_unitario ?? 0,
      },
    ])
  }

  async function handleUpdateCantidad(lineaId: string, value: string) {
    const cantidad = parseFloat(value.replace(',', '.'))
    if (!Number.isFinite(cantidad)) return
    setLineas((prev) => prev.map((l) => (l.id === lineaId ? { ...l, cantidad_usada: cantidad } : l)))
    await supabase.from('receta_ingredientes').update({ cantidad_usada: cantidad }).eq('id', lineaId)
  }

  async function handleQuitar(lineaId: string) {
    setLineas((prev) => prev.filter((l) => l.id !== lineaId))
    await supabase.from('receta_ingredientes').delete().eq('id', lineaId)
  }

  if (loading) return <p style={{ color: 'var(--rc-text-muted)' }}>Cargando...</p>
  if (notFound) return <p>No se encontró esta Receta.</p>

  return (
    <div>
      <div className="rc-page-header">
        <button className="rc-btn rc-btn-secondary" onClick={() => navigate('/recetas')} style={{ marginBottom: '1rem' }}>
          ← Volver a Recetas
        </button>
        <h1>{nombre || 'Receta sin nombre'}</h1>
      </div>

      <div className="rc-card" style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ marginTop: 0 }}>Datos generales</h3>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div className="rc-field" style={{ flex: '1 1 240px' }}>
            <label>Nombre</label>
            <input className="rc-input" value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="rc-field" style={{ width: 140 }}>
            <label>Venue</label>
            <select className="rc-input" value={venue} onChange={(e) => setVenue(e.target.value)}>
              <option value="bar">Bar</option>
              <option value="resto">Resto</option>
            </select>
          </div>
          <div className="rc-field" style={{ flex: '1 1 200px' }}>
            <label>Rubro</label>
            <select className="rc-input" value={rubroId} onChange={(e) => setRubroId(e.target.value)}>
              <option value="">Sin rubro</option>
              {rubros.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.descripcion}
                </option>
              ))}
            </select>
          </div>
          <div className="rc-field" style={{ width: 140 }}>
            <label>Rendimiento</label>
            <input className="rc-input" value={rendimientoCantidad} onChange={(e) => setRendimientoCantidad(e.target.value)} placeholder="Opcional" />
          </div>
          <div className="rc-field" style={{ width: 140 }}>
            <label>Unidad rendimiento</label>
            <input className="rc-input" value={rendimientoUnidad} onChange={(e) => setRendimientoUnidad(e.target.value)} placeholder="Opcional" />
          </div>
        </div>
        <button className="rc-btn rc-btn-primary" onClick={handleSaveHeader} disabled={savingHeader}>
          {savingHeader ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>

      <div className="rc-card" style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ marginTop: 0 }}>Ingredientes</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', marginBottom: '1rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--rc-border)' }}>
              <th style={{ padding: '0.4rem 0.5rem 0.4rem 0' }}>Insumo</th>
              <th>Cantidad</th>
              <th>Unidad</th>
              <th>Precio unitario</th>
              <th>Costo parcial</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l) => (
              <tr key={l.id} style={{ borderBottom: '1px solid var(--rc-border)' }}>
                <td style={{ padding: '0.4rem 0.5rem 0.4rem 0' }}>
                  <span className={l.insumo_type === 'preparacion' ? 'rc-badge rc-badge-super_admin' : 'rc-badge rc-badge-admin'} style={{ marginRight: '0.5rem' }}>
                    {l.insumo_type === 'preparacion' ? 'Madre' : 'Producto'}
                  </span>
                  {l.nombre}
                </td>
                <td>
                  <input
                    className="rc-input"
                    style={{ width: 90 }}
                    defaultValue={l.cantidad_usada}
                    onBlur={(e) => handleUpdateCantidad(l.id, e.target.value)}
                  />
                </td>
                <td>{l.unidad ?? '—'}</td>
                <td>{money.format(l.precio_unitario)}</td>
                <td>{money.format(l.cantidad_usada * l.precio_unitario)}</td>
                <td>
                  <button className="rc-btn rc-btn-secondary" onClick={() => handleQuitar(l.id)}>
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
            {lineas.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: '0.5rem 0', color: 'var(--rc-text-muted)' }}>
                  Todavía no hay ingredientes cargados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <IngredientPicker onAdd={handleAddIngrediente} />
      </div>

      {resultado && (
        <div className="rc-card">
          <h3 style={{ marginTop: 0 }}>Costeo</h3>
          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--rc-text-muted)' }}>Subtotal</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{money.format(resultado.subtotal)}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--rc-text-muted)' }}>Merma ({pct(mermaPct)})</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{money.format(resultado.scrapMonto)}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--rc-text-muted)' }}>Total con merma</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--rc-primary)' }}>{money.format(resultado.totalConMerma)}</div>
            </div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--rc-border)' }}>
                <th style={{ padding: '0.4rem 0.5rem 0.4rem 0' }}>Lista</th>
                <th>Food cost objetivo</th>
                <th>Precio sugerido</th>
              </tr>
            </thead>
            <tbody>
              {resultado.porLista.map((o) => (
                <tr key={o.lista_id} style={{ borderBottom: '1px solid var(--rc-border)' }}>
                  <td style={{ padding: '0.4rem 0.5rem 0.4rem 0' }}>{o.lista_nombre}</td>
                  <td>{o.food_cost_pct !== null ? pct(o.food_cost_pct) : '—'}</td>
                  <td>{o.precio_sugerido !== null ? money.format(o.precio_sugerido) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
