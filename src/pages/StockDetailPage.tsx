import { Fragment, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

interface Periodo {
  id: string
  venue: string
  tipo: string
  fecha_inicio: string
  fecha_fin: string
  venta_bruta: number
  anulaciones: number
  tickets: number | null
  cubiertos: number | null
  cerrado: boolean
}

interface Producto {
  id: string
  codigo: string
  descripcion: string
  categoria: string | null
  unidad: string
  proveedor: string | null
  precio_unitario: number
}

interface Conteo {
  id: string
  producto_id: string
  cantidad_inicial: number
  cantidad_final: number | null
}

interface FilaCalculada {
  conteoId: string
  producto: Producto
  cantidadInicial: number
  cantidadComprada: number
  montoComprado: number
  cantidadFinal: number | null
  disponible: number
  consumo: number | null
  consumoMonto: number | null
  valorizado: number | null
}

interface PeriodoResumen {
  id: string
  venue: string
  fecha_inicio: string
  fecha_fin: string
  venta_bruta: number
  anulaciones: number
}

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })
const pct = (n: number) => `${(n * 100).toFixed(1)}%`
const pctPuntos = (n: number) => `${n >= 0 ? '+' : ''}${(n * 100).toFixed(2)} pp`
const SIN_CATEGORIA = 'Sin categoría'

/** % de consumo por categoría (consumo $ / venta neta) para un período dado — se usa
 * tanto para el período actual como para el anterior, en la comparación semana/mes contra anterior. */
async function calcularPctPorCategoria(periodo: PeriodoResumen, ivaPct: number): Promise<Map<string, number>> {
  const { data: conteos } = await supabase
    .from('stock_conteos')
    .select('producto_id, cantidad_inicial, cantidad_final')
    .eq('periodo_id', periodo.id)

  const productoIds = (conteos ?? []).map((c) => c.producto_id)
  const { data: productos } = productoIds.length
    ? await supabase.from('productos').select('id, categoria, precio_unitario').in('id', productoIds)
    : { data: [] as { id: string; categoria: string | null; precio_unitario: number }[] }
  const productoById = new Map((productos ?? []).map((p) => [p.id, p]))

  const { data: compras } = await supabase
    .from('compras')
    .select('producto_id, cantidad')
    .eq('venue', periodo.venue)
    .gte('fecha', periodo.fecha_inicio)
    .lte('fecha', periodo.fecha_fin)
    .not('producto_id', 'is', null)
  const compradoPorProducto = new Map<string, number>()
  for (const c of compras ?? []) {
    compradoPorProducto.set(c.producto_id as string, (compradoPorProducto.get(c.producto_id as string) ?? 0) + (c.cantidad ?? 0))
  }

  const consumoPorCategoria = new Map<string, number>()
  for (const c of conteos ?? []) {
    if (c.cantidad_final === null) continue
    const producto = productoById.get(c.producto_id)
    if (!producto) continue
    const disponible = c.cantidad_inicial + (compradoPorProducto.get(c.producto_id) ?? 0)
    const consumoMonto = (disponible - c.cantidad_final) * producto.precio_unitario
    const cat = producto.categoria || SIN_CATEGORIA
    consumoPorCategoria.set(cat, (consumoPorCategoria.get(cat) ?? 0) + consumoMonto)
  }

  const ventaNeta = (periodo.venta_bruta - periodo.anulaciones) / (1 + ivaPct)
  const pctPorCategoria = new Map<string, number>()
  if (ventaNeta > 0) {
    for (const [cat, monto] of consumoPorCategoria) pctPorCategoria.set(cat, monto / ventaNeta)
  }
  return pctPorCategoria
}

export function StockDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [periodo, setPeriodo] = useState<Periodo | null>(null)
  const [filas, setFilas] = useState<FilaCalculada[]>([])
  const [ivaPct, setIvaPct] = useState(0.21)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [periodoAnterior, setPeriodoAnterior] = useState<PeriodoResumen | null>(null)
  const [pctAnteriorPorCategoria, setPctAnteriorPorCategoria] = useState<Map<string, number>>(new Map())

  async function load() {
    if (!id) return
    setLoading(true)

    const [{ data: periodoData, error: periodoError }, { data: config }] = await Promise.all([
      supabase.from('periodos_valorizacion').select('*').eq('id', id).maybeSingle(),
      supabase.from('configuracion').select('iva_pct').single(),
    ])

    if (periodoError || !periodoData) {
      setNotFound(true)
      setLoading(false)
      return
    }
    setPeriodo(periodoData as Periodo)
    setIvaPct(Number(config?.iva_pct ?? 0.21))

    const { data: conteos } = await supabase
      .from('stock_conteos')
      .select('id, producto_id, cantidad_inicial, cantidad_final')
      .eq('periodo_id', id)

    const productoIds = (conteos ?? []).map((c) => c.producto_id)
    const { data: productos } = productoIds.length
      ? await supabase.from('productos').select('id, codigo, descripcion, categoria, unidad, proveedor, precio_unitario').in('id', productoIds)
      : { data: [] as Producto[] }
    const productoById = new Map((productos ?? []).map((p) => [p.id, p as Producto]))

    const { data: comprasData } = await supabase
      .from('compras')
      .select('producto_id, cantidad, monto')
      .eq('venue', periodoData.venue)
      .gte('fecha', periodoData.fecha_inicio)
      .lte('fecha', periodoData.fecha_fin)
      .not('producto_id', 'is', null)

    const compradoPorProducto = new Map<string, { cantidad: number; monto: number }>()
    for (const c of comprasData ?? []) {
      const prev = compradoPorProducto.get(c.producto_id as string) ?? { cantidad: 0, monto: 0 }
      compradoPorProducto.set(c.producto_id as string, {
        cantidad: prev.cantidad + (c.cantidad ?? 0),
        monto: prev.monto + (c.monto ?? 0),
      })
    }

    const filasCalculadas: FilaCalculada[] = (conteos as Conteo[] | null ?? [])
      .map((c) => {
        const producto = productoById.get(c.producto_id)
        if (!producto) return null
        const comprado = compradoPorProducto.get(c.producto_id) ?? { cantidad: 0, monto: 0 }
        const disponible = c.cantidad_inicial + comprado.cantidad
        const consumo = c.cantidad_final !== null ? disponible - c.cantidad_final : null
        return {
          conteoId: c.id,
          producto,
          cantidadInicial: c.cantidad_inicial,
          cantidadComprada: comprado.cantidad,
          montoComprado: comprado.monto,
          cantidadFinal: c.cantidad_final,
          disponible,
          consumo,
          consumoMonto: consumo !== null ? consumo * producto.precio_unitario : null,
          valorizado: c.cantidad_final !== null ? c.cantidad_final * producto.precio_unitario : null,
        }
      })
      .filter((f): f is FilaCalculada => f !== null)
      .sort((a, b) => a.producto.descripcion.localeCompare(b.producto.descripcion, 'es'))

    setFilas(filasCalculadas)

    const { data: anterior } = await supabase
      .from('periodos_valorizacion')
      .select('id, venue, fecha_inicio, fecha_fin, venta_bruta, anulaciones')
      .eq('venue', periodoData.venue)
      .eq('tipo', periodoData.tipo)
      .lt('fecha_inicio', periodoData.fecha_inicio)
      .order('fecha_inicio', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (anterior) {
      setPeriodoAnterior(anterior as PeriodoResumen)
      const pctAnterior = await calcularPctPorCategoria(anterior as PeriodoResumen, Number(config?.iva_pct ?? 0.21))
      setPctAnteriorPorCategoria(pctAnterior)
    } else {
      setPeriodoAnterior(null)
      setPctAnteriorPorCategoria(new Map())
    }

    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const grupos = useMemo(() => {
    const map = new Map<string, FilaCalculada[]>()
    for (const f of filas) {
      const cat = f.producto.categoria || SIN_CATEGORIA
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat)!.push(f)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'es'))
  }, [filas])

  const ventaNetaActualParaComparacion = periodo ? (periodo.venta_bruta - periodo.anulaciones) / (1 + ivaPct) : 0

  const comparacion = useMemo(() => {
    const categorias = new Set<string>([...grupos.map(([cat]) => cat), ...pctAnteriorPorCategoria.keys()])
    return [...categorias]
      .map((categoria) => {
        const grupo = grupos.find(([cat]) => cat === categoria)
        const subConsumo = grupo ? grupo[1].reduce((s, f) => s + (f.consumoMonto ?? 0), 0) : 0
        const actual = ventaNetaActualParaComparacion > 0 ? subConsumo / ventaNetaActualParaComparacion : null
        const anterior = pctAnteriorPorCategoria.get(categoria) ?? null
        const diferencia = actual !== null && anterior !== null ? actual - anterior : null
        return { categoria, actual, anterior, diferencia }
      })
      .sort((a, b) => a.categoria.localeCompare(b.categoria, 'es'))
  }, [grupos, pctAnteriorPorCategoria, ventaNetaActualParaComparacion])

  const totales = useMemo(() => {
    const montoComprado = filas.reduce((s, f) => s + f.montoComprado, 0)
    const consumoMonto = filas.reduce((s, f) => s + (f.consumoMonto ?? 0), 0)
    const valorizado = filas.reduce((s, f) => s + (f.valorizado ?? 0), 0)
    return { montoComprado, consumoMonto, valorizado }
  }, [filas])

  const ventaNeta = periodo ? (periodo.venta_bruta - periodo.anulaciones) / (1 + ivaPct) : 0
  const pctCompra = ventaNeta > 0 ? totales.montoComprado / ventaNeta : null
  const pctConsumo = ventaNeta > 0 ? totales.consumoMonto / ventaNeta : null

  async function handleUpdateVenta(field: 'venta_bruta' | 'anulaciones' | 'tickets' | 'cubiertos', value: string) {
    if (!periodo) return
    const num = value.trim() === '' ? null : parseFloat(value.replace(',', '.'))
    setPeriodo({ ...periodo, [field]: num ?? 0 } as Periodo)
    await supabase.from('periodos_valorizacion').update({ [field]: num }).eq('id', periodo.id)
  }

  async function handleUpdateConteo(conteoId: string, field: 'cantidad_inicial' | 'cantidad_final', value: string) {
    const num = value.trim() === '' ? null : parseFloat(value.replace(',', '.'))
    if (field === 'cantidad_inicial' && num === null) return
    setFilas((prev) =>
      prev.map((f) => {
        if (f.conteoId !== conteoId) return f
        const cantidadInicial = field === 'cantidad_inicial' ? num! : f.cantidadInicial
        const cantidadFinal = field === 'cantidad_final' ? num : f.cantidadFinal
        const disponible = cantidadInicial + f.cantidadComprada
        const consumo = cantidadFinal !== null ? disponible - cantidadFinal : null
        return {
          ...f,
          cantidadInicial,
          cantidadFinal,
          disponible,
          consumo,
          consumoMonto: consumo !== null ? consumo * f.producto.precio_unitario : null,
          valorizado: cantidadFinal !== null ? cantidadFinal * f.producto.precio_unitario : null,
        }
      }),
    )
    await supabase.from('stock_conteos').update({ [field]: num }).eq('id', conteoId)
  }

  async function handleToggleCerrado() {
    if (!periodo) return
    const cerrado = !periodo.cerrado
    setPeriodo({ ...periodo, cerrado })
    await supabase.from('periodos_valorizacion').update({ cerrado }).eq('id', periodo.id)
  }

  if (loading) return <p style={{ color: 'var(--rc-text-muted)' }}>Cargando...</p>
  if (notFound || !periodo) return <p>No se encontró este período.</p>

  return (
    <div>
      <div className="rc-page-header">
        <button className="rc-btn rc-btn-secondary" onClick={() => navigate('/stock')} style={{ marginBottom: '1rem' }}>
          ← Volver a Stock
        </button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          <h1 style={{ textTransform: 'capitalize', margin: 0 }}>
            {periodo.tipo} · {periodo.venue} · {periodo.fecha_inicio} al {periodo.fecha_fin}
          </h1>
          <button className="rc-btn rc-btn-secondary" onClick={() => navigate(`/stock/${periodo.id}/forense`)}>
            Análisis forense
          </button>
        </div>
      </div>

      <div className="rc-card" style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ marginTop: 0 }}>Ventas del período</h3>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="rc-field" style={{ width: 160 }}>
            <label>Venta bruta</label>
            <input className="rc-input" defaultValue={periodo.venta_bruta} onBlur={(e) => handleUpdateVenta('venta_bruta', e.target.value)} />
          </div>
          <div className="rc-field" style={{ width: 140 }}>
            <label>Anulaciones</label>
            <input className="rc-input" defaultValue={periodo.anulaciones} onBlur={(e) => handleUpdateVenta('anulaciones', e.target.value)} />
          </div>
          <div className="rc-field" style={{ width: 110 }}>
            <label>Tickets</label>
            <input className="rc-input" defaultValue={periodo.tickets ?? ''} onBlur={(e) => handleUpdateVenta('tickets', e.target.value)} />
          </div>
          <div className="rc-field" style={{ width: 110 }}>
            <label>Cubiertos</label>
            <input className="rc-input" defaultValue={periodo.cubiertos ?? ''} onBlur={(e) => handleUpdateVenta('cubiertos', e.target.value)} />
          </div>
          <button className="rc-btn rc-btn-secondary" onClick={handleToggleCerrado}>
            {periodo.cerrado ? 'Reabrir período' : 'Cerrar período'}
          </button>
        </div>
      </div>

      <div className="rc-card" style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ marginTop: 0 }}>Resumen</h3>
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--rc-text-muted)' }}>Venta neta</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{money.format(ventaNeta)}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--rc-text-muted)' }}>Total comprado</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{money.format(totales.montoComprado)}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--rc-text-muted)' }}>Total consumo $</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{money.format(totales.consumoMonto)}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--rc-text-muted)' }}>Total valorizado (stock final)</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--rc-primary)' }}>{money.format(totales.valorizado)}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--rc-text-muted)' }}>% compra</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{pctCompra !== null ? pct(pctCompra) : '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--rc-text-muted)' }}>% consumo</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{pctConsumo !== null ? pct(pctConsumo) : '—'}</div>
          </div>
        </div>
      </div>

      <div className="rc-card" style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ marginTop: 0 }}>% consumo por categoría vs. período anterior</h3>
        {!periodoAnterior ? (
          <p style={{ color: 'var(--rc-text-muted)' }}>No hay un período {periodo.tipo} anterior de {periodo.venue} para comparar todavía.</p>
        ) : (
          <>
            <p style={{ marginTop: 0, color: 'var(--rc-text-muted)', fontSize: '0.85rem' }}>
              Anterior: {periodoAnterior.fecha_inicio} al {periodoAnterior.fecha_fin}
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--rc-border)' }}>
                  <th style={{ padding: '0.4rem 0.5rem 0.4rem 0' }}>Categoría</th>
                  <th>Actual</th>
                  <th>Anterior</th>
                  <th>Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {comparacion.map((c) => (
                  <tr key={c.categoria} style={{ borderBottom: '1px solid var(--rc-border)' }}>
                    <td style={{ padding: '0.35rem 0.5rem 0.35rem 0' }}>{c.categoria}</td>
                    <td>{c.actual !== null ? pct(c.actual) : '—'}</td>
                    <td>{c.anterior !== null ? pct(c.anterior) : '—'}</td>
                    <td
                      style={{
                        fontWeight: 700,
                        color: c.diferencia === null ? undefined : c.diferencia > 0 ? 'var(--rc-danger)' : 'var(--rc-success)',
                      }}
                    >
                      {c.diferencia !== null ? pctPuntos(c.diferencia) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <div className="rc-card" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--rc-border)' }}>
              <th style={{ padding: '0.5rem 0.5rem 0.5rem 0' }}>Producto</th>
              <th>Unidad</th>
              <th>Proveedor</th>
              <th>Inicial</th>
              <th>Comprado</th>
              <th>Disponible</th>
              <th>Final</th>
              <th>Consumo</th>
              <th>Precio unit.</th>
              <th>Consumo $</th>
              <th>Valorizado $</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map(([categoria, items]) => {
              const subConsumo = items.reduce((s, f) => s + (f.consumoMonto ?? 0), 0)
              const subValorizado = items.reduce((s, f) => s + (f.valorizado ?? 0), 0)
              return (
                <Fragment key={categoria}>
                  <tr style={{ background: 'var(--rc-bg)' }}>
                    <td colSpan={11} style={{ padding: '0.4rem 0.5rem', fontWeight: 700 }}>
                      {categoria}
                    </td>
                  </tr>
                  {items.map((f) => (
                    <tr key={f.conteoId} style={{ borderBottom: '1px solid var(--rc-border)' }}>
                      <td style={{ padding: '0.35rem 0.5rem 0.35rem 0' }}>
                        {f.producto.codigo} — {f.producto.descripcion}
                      </td>
                      <td>{f.producto.unidad}</td>
                      <td>{f.producto.proveedor ?? '—'}</td>
                      <td>
                        <input
                          className="rc-input"
                          style={{ width: 80 }}
                          defaultValue={f.cantidadInicial}
                          onBlur={(e) => handleUpdateConteo(f.conteoId, 'cantidad_inicial', e.target.value)}
                        />
                      </td>
                      <td>{f.cantidadComprada}</td>
                      <td>{f.disponible}</td>
                      <td>
                        <input
                          className="rc-input"
                          style={{ width: 80 }}
                          defaultValue={f.cantidadFinal ?? ''}
                          onBlur={(e) => handleUpdateConteo(f.conteoId, 'cantidad_final', e.target.value)}
                        />
                      </td>
                      <td>{f.consumo !== null ? f.consumo.toFixed(2) : '—'}</td>
                      <td>{money.format(f.producto.precio_unitario)}</td>
                      <td>{f.consumoMonto !== null ? money.format(f.consumoMonto) : '—'}</td>
                      <td>{f.valorizado !== null ? money.format(f.valorizado) : '—'}</td>
                    </tr>
                  ))}
                  <tr style={{ borderBottom: '2px solid var(--rc-border)', fontWeight: 700 }}>
                    <td colSpan={9} style={{ padding: '0.35rem 0.5rem 0.35rem 0', textAlign: 'right' }}>
                      Subtotal {categoria}
                    </td>
                    <td>{money.format(subConsumo)}</td>
                    <td>{money.format(subValorizado)}</td>
                  </tr>
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
