import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { formatRangoFechasAR } from '../lib/dateFormat'

interface Periodo {
  id: string
  venue: string
  fecha_inicio: string
  fecha_fin: string
}

interface ProductoOpcion {
  id: string
  codigo: string
  descripcion: string
  unidad: string
  precio_unitario: number
}

interface RecetaUso {
  id: string // receta_ingredientes.id
  recetaId: string
  nombre: string
  cantidadUsada: number
  unidadesVendidas: number
}

export function ForensePage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()

  const [periodo, setPeriodo] = useState<Periodo | null>(null)
  const [query, setQuery] = useState('')
  const [resultados, setResultados] = useState<ProductoOpcion[]>([])
  const [producto, setProducto] = useState<ProductoOpcion | null>(null)
  const [usos, setUsos] = useState<RecetaUso[]>([])
  const [consumoReal, setConsumoReal] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function loadPeriodo() {
      if (!id) return
      const { data } = await supabase.from('periodos_valorizacion').select('id, venue, fecha_inicio, fecha_fin').eq('id', id).maybeSingle()
      setPeriodo(data as Periodo | null)
    }
    loadPeriodo()
  }, [id])

  async function buscar(q: string) {
    setQuery(q)
    if (q.trim().length < 2) {
      setResultados([])
      return
    }
    const { data } = await supabase
      .from('productos')
      .select('id, codigo, descripcion, unidad, precio_unitario')
      .or(`codigo.ilike.%${q}%,descripcion.ilike.%${q}%`)
      .limit(10)
    setResultados((data ?? []) as ProductoOpcion[])
  }

  async function elegirProducto(p: ProductoOpcion) {
    if (!id || !periodo) return
    setProducto(p)
    setQuery('')
    setResultados([])
    setLoading(true)

    const [{ data: ingredientes }, { data: conteo }, { data: ventas }] = await Promise.all([
      supabase.from('receta_ingredientes').select('id, parent_id, cantidad_usada').eq('insumo_type', 'producto').eq('insumo_id', p.id),
      supabase.from('stock_conteos').select('cantidad_inicial, cantidad_final').eq('periodo_id', id).eq('producto_id', p.id).maybeSingle(),
      supabase.from('receta_ventas_periodo').select('receta_id, unidades_vendidas').eq('periodo_id', id),
    ])

    const recetaIds = [...new Set((ingredientes ?? []).map((i) => i.parent_id))]
    const { data: recetas } = recetaIds.length
      ? await supabase.from('recetas').select('id, nombre').in('id', recetaIds)
      : { data: [] as { id: string; nombre: string }[] }
    const nombrePorReceta = new Map((recetas ?? []).map((r) => [r.id, r.nombre]))
    const ventasPorReceta = new Map((ventas ?? []).map((v) => [v.receta_id, v.unidades_vendidas]))

    setUsos(
      (ingredientes ?? []).map((i) => ({
        id: i.id,
        recetaId: i.parent_id,
        nombre: nombrePorReceta.get(i.parent_id) ?? '(receta eliminada)',
        cantidadUsada: i.cantidad_usada,
        unidadesVendidas: ventasPorReceta.get(i.parent_id) ?? 0,
      })),
    )

    if (conteo) {
      const { data: compras } = await supabase
        .from('compras')
        .select('cantidad')
        .eq('producto_id', p.id)
        .eq('venue', periodo.venue)
        .gte('fecha', periodo.fecha_inicio)
        .lte('fecha', periodo.fecha_fin)
      const cantidadComprada = (compras ?? []).reduce((s, c) => s + (c.cantidad ?? 0), 0)
      const disponible = conteo.cantidad_inicial + cantidadComprada
      setConsumoReal(conteo.cantidad_final !== null ? disponible - conteo.cantidad_final : null)
    } else {
      setConsumoReal(null)
    }

    setLoading(false)
  }

  async function handleUpdateUnidades(uso: RecetaUso, value: string) {
    if (!id) return
    const num = parseFloat(value.replace(',', '.'))
    if (!Number.isFinite(num)) return
    setUsos((prev) => prev.map((u) => (u.recetaId === uso.recetaId ? { ...u, unidadesVendidas: num } : u)))
    await supabase
      .from('receta_ventas_periodo')
      .upsert(
        { periodo_id: id, receta_id: uso.recetaId, unidades_vendidas: num, updated_by: profile?.id ?? null, updated_at: new Date().toISOString() },
        { onConflict: 'periodo_id,receta_id' },
      )
  }

  const consumoTeorico = usos.reduce((s, u) => s + u.cantidadUsada * u.unidadesVendidas, 0)
  const diferencia = consumoReal !== null ? consumoReal - consumoTeorico : null

  if (!periodo) return <p style={{ color: 'var(--rc-text-muted)' }}>Cargando...</p>

  return (
    <div>
      <div className="rc-page-header">
        <button className="rc-btn rc-btn-secondary" onClick={() => navigate(`/stock/${id}`)} style={{ marginBottom: '1rem' }}>
          ← Volver al período
        </button>
        <h1>Análisis forense</h1>
        <p>
          {periodo.venue} · {formatRangoFechasAR(periodo.fecha_inicio, periodo.fecha_fin)}
        </p>
      </div>

      <div className="rc-card" style={{ marginBottom: '1.25rem', position: 'relative' }}>
        <h3 style={{ marginTop: 0 }}>Elegir insumo a investigar</h3>
        <input
          className="rc-input"
          style={{ maxWidth: 360 }}
          placeholder="Buscar código o nombre..."
          value={producto ? `${producto.codigo} — ${producto.descripcion}` : query}
          onChange={(e) => {
            setProducto(null)
            buscar(e.target.value)
          }}
        />
        {resultados.length > 0 && (
          <div style={{ maxWidth: 360, border: '1px solid var(--rc-border)', borderRadius: 'var(--rc-radius)', marginTop: '0.4rem', maxHeight: 200, overflowY: 'auto' }}>
            {resultados.map((p) => (
              <div
                key={p.id}
                onClick={() => elegirProducto(p)}
                style={{ padding: '0.4rem 0.6rem', cursor: 'pointer', fontSize: '0.88rem' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--rc-bg)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {p.codigo} — {p.descripcion}
              </div>
            ))}
          </div>
        )}
      </div>

      {producto && !loading && (
        <>
          <div className="rc-card" style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--rc-text-muted)' }}>Consumo teórico (según ventas)</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                  {consumoTeorico.toFixed(2)} {producto.unidad}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--rc-text-muted)' }}>Consumo real (según conteo)</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                  {consumoReal !== null ? `${consumoReal.toFixed(2)} ${producto.unidad}` : 'Sin conteo final cargado'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--rc-text-muted)' }}>Diferencia (real − teórico)</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, color: diferencia !== null && diferencia > 0 ? 'var(--rc-danger)' : 'var(--rc-success)' }}>
                  {diferencia !== null ? `${diferencia.toFixed(2)} ${producto.unidad}` : '—'}
                </div>
              </div>
            </div>
            <p style={{ color: 'var(--rc-text-muted)', fontSize: '0.85rem', marginBottom: 0 }}>
              Diferencia positiva: faltó más producto del que explican las ventas (posible merma, sobreporción o error de conteo). Negativa: faltó menos de lo esperado.
            </p>
          </div>

          <div className="rc-card" style={{ overflowX: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>Recetas que usan este insumo</h3>
            {usos.length === 0 ? (
              <p style={{ color: 'var(--rc-text-muted)' }}>Ninguna receta cargada usa este insumo.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--rc-border)' }}>
                    <th style={{ padding: '0.5rem 0.5rem 0.5rem 0' }}>Receta</th>
                    <th>Cantidad por porción</th>
                    <th>Unidades vendidas</th>
                    <th>Consumo teórico</th>
                  </tr>
                </thead>
                <tbody>
                  {usos.map((u) => (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--rc-border)' }}>
                      <td style={{ padding: '0.4rem 0.5rem 0.4rem 0' }}>{u.nombre}</td>
                      <td>
                        {u.cantidadUsada} {producto.unidad}
                      </td>
                      <td>
                        <input
                          className="rc-input"
                          style={{ width: 90 }}
                          defaultValue={u.unidadesVendidas}
                          onBlur={(e) => handleUpdateUnidades(u, e.target.value)}
                        />
                      </td>
                      <td>
                        {(u.cantidadUsada * u.unidadesVendidas).toFixed(2)} {producto.unidad}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  )
}
