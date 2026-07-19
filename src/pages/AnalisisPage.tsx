import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import {
  calcularPctPorCategoria,
  calcularResumenPeriodo,
  calcularConsumoTeoricoPorCategoria,
  filaComparacionEstilo,
  CATEGORIA_MADRE,
  type PeriodoResumen,
  type ResumenPeriodo,
  type ConsumoTeoricoResultado,
} from '../lib/stockAnalysis'
import { formatRangoFechasAR } from '../lib/dateFormat'

interface PeriodoOpcion extends PeriodoResumen {
  tickets: number | null
}

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })
const pct = (n: number) => `${(n * 100).toFixed(1)}%`
const pctPuntos = (n: number) => `${n >= 0 ? '+' : ''}${(n * 100).toFixed(2)} pp`

function diffColor(diferencia: number | null, invertido = false) {
  if (diferencia === null) return undefined
  const peor = invertido ? diferencia < 0 : diferencia > 0
  if (diferencia === 0) return undefined
  return peor ? 'var(--rc-danger)' : 'var(--rc-success)'
}

export function AnalisisPage() {
  const [venue, setVenue] = useState<'bar' | 'resto'>('bar')
  const [tipo, setTipo] = useState<'semanal' | 'mensual'>('semanal')
  const [periodos, setPeriodos] = useState<PeriodoOpcion[]>([])
  const [periodoAId, setPeriodoAId] = useState('')
  const [periodoBId, setPeriodoBId] = useState('')
  const [ivaPct, setIvaPct] = useState(0.21)
  const [loadingPeriodos, setLoadingPeriodos] = useState(true)

  const [resumenA, setResumenA] = useState<ResumenPeriodo | null>(null)
  const [resumenB, setResumenB] = useState<ResumenPeriodo | null>(null)
  const [pctCatA, setPctCatA] = useState<Map<string, number>>(new Map())
  const [pctCatB, setPctCatB] = useState<Map<string, number>>(new Map())
  const [teoricoA, setTeoricoA] = useState<ConsumoTeoricoResultado | null>(null)
  const [teoricoB, setTeoricoB] = useState<ConsumoTeoricoResultado | null>(null)
  const [descuentosA, setDescuentosA] = useState(0)
  const [descuentosB, setDescuentosB] = useState(0)
  const [proveedoresA, setProveedoresA] = useState<Map<string, number>>(new Map())
  const [proveedoresB, setProveedoresB] = useState<Map<string, number>>(new Map())
  const [loadingComparacion, setLoadingComparacion] = useState(false)

  async function loadPeriodos() {
    setLoadingPeriodos(true)
    const [{ data }, { data: config }] = await Promise.all([
      supabase
        .from('periodos_valorizacion')
        .select('id, venue, fecha_inicio, fecha_fin, venta_bruta, anulaciones, tickets')
        .eq('venue', venue)
        .eq('tipo', tipo)
        .order('fecha_inicio', { ascending: false }),
      supabase.from('configuracion').select('iva_pct').single(),
    ])
    const lista = (data ?? []) as PeriodoOpcion[]
    setPeriodos(lista)
    setIvaPct(Number(config?.iva_pct ?? 0.21))
    setPeriodoAId(lista[1]?.id ?? lista[0]?.id ?? '')
    setPeriodoBId(lista[0]?.id ?? '')
    setLoadingPeriodos(false)
  }

  useEffect(() => {
    loadPeriodos()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venue, tipo])

  async function cargarDescuentos(p: PeriodoResumen): Promise<number> {
    const { data } = await supabase
      .from('descuentos')
      .select('monto')
      .eq('venue', p.venue)
      .gte('fecha', p.fecha_inicio)
      .lte('fecha', p.fecha_fin)
    return (data ?? []).reduce((s, d) => s + d.monto, 0)
  }

  async function cargarComprasPorProveedor(p: PeriodoResumen): Promise<Map<string, number>> {
    const { data: compras } = await supabase
      .from('compras')
      .select('proveedor_id, monto')
      .eq('venue', p.venue)
      .gte('fecha', p.fecha_inicio)
      .lte('fecha', p.fecha_fin)
    const proveedorIds = [...new Set((compras ?? []).map((c) => c.proveedor_id))]
    const { data: proveedores } = proveedorIds.length
      ? await supabase.from('proveedores').select('id, nombre').in('id', proveedorIds)
      : { data: [] as { id: string; nombre: string }[] }
    const nombrePorId = new Map((proveedores ?? []).map((p2) => [p2.id, p2.nombre]))
    const porProveedor = new Map<string, number>()
    for (const c of compras ?? []) {
      const nombre = nombrePorId.get(c.proveedor_id) ?? '—'
      porProveedor.set(nombre, (porProveedor.get(nombre) ?? 0) + c.monto)
    }
    return porProveedor
  }

  useEffect(() => {
    async function cargarComparacion() {
      const periodoA = periodos.find((p) => p.id === periodoAId)
      const periodoB = periodos.find((p) => p.id === periodoBId)
      if (!periodoA || !periodoB) return
      setLoadingComparacion(true)

      const [rA, rB, cA, cB, tA, tB, dA, dB, pA, pB] = await Promise.all([
        calcularResumenPeriodo(periodoA, ivaPct),
        calcularResumenPeriodo(periodoB, ivaPct),
        calcularPctPorCategoria(periodoA, ivaPct),
        calcularPctPorCategoria(periodoB, ivaPct),
        calcularConsumoTeoricoPorCategoria(periodoA),
        calcularConsumoTeoricoPorCategoria(periodoB),
        cargarDescuentos(periodoA),
        cargarDescuentos(periodoB),
        cargarComprasPorProveedor(periodoA),
        cargarComprasPorProveedor(periodoB),
      ])

      setResumenA(rA)
      setResumenB(rB)
      setPctCatA(cA)
      setPctCatB(cB)
      setTeoricoA(tA)
      setTeoricoB(tB)
      setDescuentosA(dA)
      setDescuentosB(dB)
      setProveedoresA(pA)
      setProveedoresB(pB)
      setLoadingComparacion(false)
    }
    if (periodoAId && periodoBId) cargarComparacion()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodoAId, periodoBId, ivaPct])

  const categoriasComparacion = useMemo(() => {
    const categorias = new Set<string>([...pctCatA.keys(), ...pctCatB.keys()])
    return [...categorias].sort((a, b) => a.localeCompare(b, 'es'))
  }, [pctCatA, pctCatB])

  const categoriasProveedores = useMemo(() => {
    const nombres = new Set<string>([...proveedoresA.keys(), ...proveedoresB.keys()])
    return [...nombres].sort((a, b) => (proveedoresB.get(b) ?? 0) + (proveedoresA.get(b) ?? 0) - ((proveedoresB.get(a) ?? 0) + (proveedoresA.get(a) ?? 0)))
  }, [proveedoresA, proveedoresB])

  const periodoA = periodos.find((p) => p.id === periodoAId)
  const periodoB = periodos.find((p) => p.id === periodoBId)

  function renderTeorico(label: string, periodo: PeriodoOpcion | undefined, teorico: ConsumoTeoricoResultado | null, pctCat: Map<string, number>, resumen: ResumenPeriodo | null) {
    if (!periodo || !teorico || !resumen) return null
    // "Madre" no es una categoría de compra — es costo de recetas que ya está incluido en el
    // total, pero no se desglosa acá porque lo que importa es el costo de la Receta completa,
    // no el de la Madre en sí.
    const categorias = new Set<string>([...teorico.porCategoria.keys(), ...pctCat.keys()].filter((c) => c !== CATEGORIA_MADRE))
    const montoMadre = teorico.porCategoria.get(CATEGORIA_MADRE) ?? 0
    const bajaCobertura = teorico.recetasTotales > 0 && teorico.recetasConVentasCargadas / teorico.recetasTotales < 0.5
    return (
      <div className="rc-card" style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ marginTop: 0 }}>
          Consumo teórico vs. real — {label} ({formatRangoFechasAR(periodo.fecha_inicio, periodo.fecha_fin)})
        </h3>
        <p style={{ marginTop: 0, fontSize: '0.85rem', color: bajaCobertura ? 'var(--rc-danger)' : 'var(--rc-text-muted)' }}>
          {teorico.recetasConVentasCargadas} de {teorico.recetasTotales} recetas del sector tienen unidades vendidas cargadas para este período
          {bajaCobertura ? ' — cobertura baja, el teórico es parcial y puede subestimar el consumo esperado.' : '.'} Se carga desde "Análisis forense" en cada período de Stock.
        </p>
        {teorico.recetasConVentasCargadas === 0 ? (
          <p style={{ color: 'var(--rc-text-muted)' }}>Sin datos cargados — no se puede calcular el teórico todavía.</p>
        ) : (
          <>
            <p style={{ fontSize: '0.95rem' }}>
              <strong>Costo teórico total de recetas vendidas: {money.format(teorico.totalTeorico)}</strong>
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.87rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--rc-border)' }}>
                  <th style={{ padding: '0.4rem 0.5rem 0.4rem 0' }}>Categoría</th>
                  <th>Real $</th>
                  <th>Teórico $</th>
                  <th>Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {[...categorias].sort((a, b) => a.localeCompare(b, 'es')).map((cat) => {
                  const realMonto = (pctCat.get(cat) ?? 0) * resumen.ventaNeta
                  const teoricoMonto = teorico.porCategoria.get(cat) ?? 0
                  const diferencia = realMonto - teoricoMonto
                  return (
                    <tr key={cat} style={{ borderBottom: '1px solid var(--rc-border)', ...filaComparacionEstilo(diferencia) }}>
                      <td style={{ padding: '0.35rem 0.5rem 0.35rem 0.5rem' }}>{cat}</td>
                      <td>{money.format(realMonto)}</td>
                      <td>{money.format(teoricoMonto)}</td>
                      <td style={{ fontWeight: 700, color: diffColor(diferencia) }}>{money.format(diferencia)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {montoMadre > 0 && (
              <p style={{ marginTop: '0.5rem', marginBottom: 0, fontSize: '0.8rem', color: 'var(--rc-text-muted)' }}>
                De ese total, {money.format(montoMadre)} corresponde a recetas que usan Madres (preparaciones internas) como ingrediente — está incluido
                en el costo total de recetas de arriba, pero no se desglosa por categoría porque "Madre" no es una categoría de compra.
              </p>
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="rc-page-header">
        <h1>Análisis comparativo</h1>
        <p>Elegí dos períodos (semana vs. semana, o mes vs. mes) para comparar ventas, compras, consumo real y teórico.</p>
      </div>

      <div style={{ marginBottom: '1.25rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--rc-text-muted)', display: 'block' }}>Sector</label>
          <select className="rc-input" style={{ maxWidth: 140 }} value={venue} onChange={(e) => setVenue(e.target.value as 'bar' | 'resto')}>
            <option value="bar">Bar</option>
            <option value="resto">Resto</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--rc-text-muted)', display: 'block' }}>Tipo</label>
          <select className="rc-input" style={{ maxWidth: 140 }} value={tipo} onChange={(e) => setTipo(e.target.value as 'semanal' | 'mensual')}>
            <option value="semanal">Semanal</option>
            <option value="mensual">Mensual</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--rc-text-muted)', display: 'block' }}>Período A</label>
          <select className="rc-input" style={{ maxWidth: 220 }} value={periodoAId} onChange={(e) => setPeriodoAId(e.target.value)}>
            {periodos.map((p) => (
              <option key={p.id} value={p.id}>
                {formatRangoFechasAR(p.fecha_inicio, p.fecha_fin)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--rc-text-muted)', display: 'block' }}>Período B</label>
          <select className="rc-input" style={{ maxWidth: 220 }} value={periodoBId} onChange={(e) => setPeriodoBId(e.target.value)}>
            {periodos.map((p) => (
              <option key={p.id} value={p.id}>
                {formatRangoFechasAR(p.fecha_inicio, p.fecha_fin)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loadingPeriodos ? (
        <p style={{ color: 'var(--rc-text-muted)' }}>Cargando períodos...</p>
      ) : periodos.length < 1 ? (
        <p style={{ color: 'var(--rc-text-muted)' }}>Todavía no hay períodos {tipo} de {venue} cargados en Stock.</p>
      ) : loadingComparacion || !resumenA || !resumenB ? (
        <p style={{ color: 'var(--rc-text-muted)' }}>Calculando comparación...</p>
      ) : (
        <>
          <div className="rc-card" style={{ overflowX: 'auto', marginBottom: '1.25rem' }}>
            <h3 style={{ marginTop: 0 }}>Resumen comparativo</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--rc-border)' }}>
                  <th style={{ padding: '0.4rem 0.5rem 0.4rem 0' }}></th>
                  <th>A ({periodoA ? formatRangoFechasAR(periodoA.fecha_inicio, periodoA.fecha_fin) : '—'})</th>
                  <th>B ({periodoB ? formatRangoFechasAR(periodoB.fecha_inicio, periodoB.fecha_fin) : '—'})</th>
                  <th>Diferencia (B − A)</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--rc-border)' }}>
                  <td style={{ padding: '0.35rem 0.5rem 0.35rem 0' }}>Venta bruta</td>
                  <td>{money.format(periodoA?.venta_bruta ?? 0)}</td>
                  <td>{money.format(periodoB?.venta_bruta ?? 0)}</td>
                  <td>{money.format((periodoB?.venta_bruta ?? 0) - (periodoA?.venta_bruta ?? 0))}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--rc-border)' }}>
                  <td style={{ padding: '0.35rem 0.5rem 0.35rem 0' }}>Venta neta</td>
                  <td>{money.format(resumenA.ventaNeta)}</td>
                  <td>{money.format(resumenB.ventaNeta)}</td>
                  <td>{money.format(resumenB.ventaNeta - resumenA.ventaNeta)}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--rc-border)' }}>
                  <td style={{ padding: '0.35rem 0.5rem 0.35rem 0' }}>Tickets</td>
                  <td>{periodoA?.tickets ?? '—'}</td>
                  <td>{periodoB?.tickets ?? '—'}</td>
                  <td>{periodoA?.tickets !== null && periodoB?.tickets !== null && periodoA && periodoB ? (periodoB.tickets ?? 0) - (periodoA.tickets ?? 0) : '—'}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--rc-border)' }}>
                  <td style={{ padding: '0.35rem 0.5rem 0.35rem 0' }}>Ticket promedio</td>
                  <td>{periodoA?.tickets ? money.format((periodoA.venta_bruta ?? 0) / periodoA.tickets) : '—'}</td>
                  <td>{periodoB?.tickets ? money.format((periodoB.venta_bruta ?? 0) / periodoB.tickets) : '—'}</td>
                  <td>—</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--rc-border)' }}>
                  <td style={{ padding: '0.35rem 0.5rem 0.35rem 0' }}>Total comprado</td>
                  <td>{money.format(resumenA.totalComprado)}</td>
                  <td>{money.format(resumenB.totalComprado)}</td>
                  <td>{money.format(resumenB.totalComprado - resumenA.totalComprado)}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--rc-border)' }}>
                  <td style={{ padding: '0.35rem 0.5rem 0.35rem 0' }}>Total consumo $</td>
                  <td>{money.format(resumenA.totalConsumoMonto)}</td>
                  <td>{money.format(resumenB.totalConsumoMonto)}</td>
                  <td>{money.format(resumenB.totalConsumoMonto - resumenA.totalConsumoMonto)}</td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--rc-border)' }}>
                  <td style={{ padding: '0.35rem 0.5rem 0.35rem 0' }}>% compra</td>
                  <td>{resumenA.pctCompra !== null ? pct(resumenA.pctCompra) : '—'}</td>
                  <td>{resumenB.pctCompra !== null ? pct(resumenB.pctCompra) : '—'}</td>
                  <td
                    style={{
                      fontWeight: 700,
                      color: resumenA.pctCompra !== null && resumenB.pctCompra !== null ? diffColor(resumenB.pctCompra - resumenA.pctCompra) : undefined,
                    }}
                  >
                    {resumenA.pctCompra !== null && resumenB.pctCompra !== null ? pctPuntos(resumenB.pctCompra - resumenA.pctCompra) : '—'}
                  </td>
                </tr>
                <tr style={{ borderBottom: '1px solid var(--rc-border)' }}>
                  <td style={{ padding: '0.35rem 0.5rem 0.35rem 0' }}>% consumo</td>
                  <td>{resumenA.pctConsumo !== null ? pct(resumenA.pctConsumo) : '—'}</td>
                  <td>{resumenB.pctConsumo !== null ? pct(resumenB.pctConsumo) : '—'}</td>
                  <td
                    style={{
                      fontWeight: 700,
                      color: resumenA.pctConsumo !== null && resumenB.pctConsumo !== null ? diffColor(resumenB.pctConsumo - resumenA.pctConsumo) : undefined,
                    }}
                  >
                    {resumenA.pctConsumo !== null && resumenB.pctConsumo !== null ? pctPuntos(resumenB.pctConsumo - resumenA.pctConsumo) : '—'}
                  </td>
                </tr>
                <tr>
                  <td style={{ padding: '0.35rem 0.5rem 0.35rem 0' }}>Total descuentos</td>
                  <td>{money.format(descuentosA)}</td>
                  <td>{money.format(descuentosB)}</td>
                  <td>{money.format(descuentosB - descuentosA)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="rc-card" style={{ overflowX: 'auto', marginBottom: '1.25rem' }}>
            <h3 style={{ marginTop: 0 }}>% consumo por categoría, A vs. B</h3>
            <p style={{ marginTop: 0, marginBottom: '0.75rem', fontSize: '0.85rem', display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--rc-danger)', fontWeight: 600 }}>■ Rojo: subió el % de consumo de A a B (revisar)</span>
              <span style={{ color: 'var(--rc-success)', fontWeight: 600 }}>■ Verde: bajó el % de consumo de A a B (mejoró)</span>
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--rc-border)' }}>
                  <th style={{ padding: '0.4rem 0.5rem 0.4rem 0' }}>Categoría</th>
                  <th>A</th>
                  <th>B</th>
                  <th>Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {categoriasComparacion.map((cat) => {
                  const a = pctCatA.get(cat) ?? null
                  const b = pctCatB.get(cat) ?? null
                  const diferencia = a !== null && b !== null ? b - a : null
                  return (
                    <tr key={cat} style={{ borderBottom: '1px solid var(--rc-border)', ...filaComparacionEstilo(diferencia) }}>
                      <td style={{ padding: '0.35rem 0.5rem 0.35rem 0.5rem' }}>{cat}</td>
                      <td>{a !== null ? pct(a) : '—'}</td>
                      <td>{b !== null ? pct(b) : '—'}</td>
                      <td style={{ fontWeight: 700, color: diffColor(diferencia) }}>{diferencia !== null ? pctPuntos(diferencia) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {renderTeorico('Período A', periodoA, teoricoA, pctCatA, resumenA)}
          {renderTeorico('Período B', periodoB, teoricoB, pctCatB, resumenB)}

          <div className="rc-card" style={{ overflowX: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>Compras por proveedor, A vs. B</h3>
            {categoriasProveedores.length === 0 ? (
              <p style={{ color: 'var(--rc-text-muted)' }}>Sin compras registradas en estos períodos.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--rc-border)' }}>
                    <th style={{ padding: '0.4rem 0.5rem 0.4rem 0' }}>Proveedor</th>
                    <th>A</th>
                    <th>B</th>
                  </tr>
                </thead>
                <tbody>
                  {categoriasProveedores.map((nombre) => (
                    <tr key={nombre} style={{ borderBottom: '1px solid var(--rc-border)' }}>
                      <td style={{ padding: '0.35rem 0.5rem 0.35rem 0' }}>{nombre}</td>
                      <td>{money.format(proveedoresA.get(nombre) ?? 0)}</td>
                      <td>{money.format(proveedoresB.get(nombre) ?? 0)}</td>
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
