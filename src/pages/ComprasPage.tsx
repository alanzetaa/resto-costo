import { FormEvent, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useSortableTable } from '../lib/useSortableTable'
import { SortableTh } from '../components/ui/SortableTh'
import { formatFechaAR } from '../lib/dateFormat'

interface Proveedor {
  id: string
  nombre: string
}

interface ProductoOpcion {
  id: string
  codigo: string
  descripcion: string
}

interface Compra {
  id: string
  proveedor_id: string
  producto_id: string | null
  venue: string
  fecha: string
  cantidad: number | null
  monto: number
  nota: string | null
}

interface CompraRow extends Compra {
  proveedorNombre: string
  productoNombre: string
  precioUnitario: number | null
}

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })
const todayISO = () => new Date().toISOString().slice(0, 10)

export function ComprasPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [compras, setCompras] = useState<Compra[]>([])
  const [loading, setLoading] = useState(true)

  // filtros
  const [filtroProveedor, setFiltroProveedor] = useState('')
  const [filtroVenue, setFiltroVenue] = useState<'todos' | 'bar' | 'resto'>('todos')
  const [filtroDesde, setFiltroDesde] = useState('')
  const [filtroHasta, setFiltroHasta] = useState('')

  // formulario alta
  const [proveedorId, setProveedorId] = useState('')
  const [productoQuery, setProductoQuery] = useState('')
  const [productoResultados, setProductoResultados] = useState<ProductoOpcion[]>([])
  const [productoSeleccionado, setProductoSeleccionado] = useState<ProductoOpcion | null>(null)
  const [venue, setVenue] = useState<'bar' | 'resto'>('bar')
  const [fecha, setFecha] = useState(todayISO())
  const [cantidad, setCantidad] = useState('')
  const [monto, setMonto] = useState('')
  const [nota, setNota] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [{ data: prov }, { data: comprasData }] = await Promise.all([
      supabase.from('proveedores').select('id, nombre').order('nombre'),
      supabase.from('compras').select('id, proveedor_id, producto_id, venue, fecha, cantidad, monto, nota').order('fecha', { ascending: false }).limit(500),
    ])
    setProveedores((prov ?? []) as Proveedor[])
    setCompras((comprasData ?? []) as Compra[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function buscarProducto(q: string) {
    setProductoQuery(q)
    setProductoSeleccionado(null)
    if (q.trim().length < 2) {
      setProductoResultados([])
      return
    }
    const { data } = await supabase
      .from('productos')
      .select('id, codigo, descripcion')
      .not('categoria', 'ilike', 'madre')
      .or(`codigo.ilike.%${q}%,descripcion.ilike.%${q}%`)
      .limit(10)
    setProductoResultados((data ?? []) as ProductoOpcion[])
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const montoNum = parseFloat(monto.replace(',', '.'))
    if (!proveedorId || !fecha || !Number.isFinite(montoNum)) {
      setError('Completá al menos proveedor, fecha y monto.')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('compras').insert({
      proveedor_id: proveedorId,
      producto_id: productoSeleccionado?.id ?? null,
      venue,
      fecha,
      cantidad: cantidad ? parseFloat(cantidad.replace(',', '.')) : null,
      monto: montoNum,
      nota: nota.trim() || null,
    })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    setProductoQuery('')
    setProductoSeleccionado(null)
    setCantidad('')
    setMonto('')
    setNota('')
    await load()
  }

  const proveedorNombreById = useMemo(() => new Map(proveedores.map((p) => [p.id, p.nombre])), [proveedores])

  const [productoNombreById, setProductoNombreById] = useState<Map<string, string>>(new Map())
  useEffect(() => {
    async function resolveProductos() {
      const ids = [...new Set(compras.filter((c) => c.producto_id).map((c) => c.producto_id as string))]
      if (!ids.length) return
      const { data } = await supabase.from('productos').select('id, codigo, descripcion').in('id', ids)
      setProductoNombreById(new Map((data ?? []).map((p) => [p.id, `${p.codigo} — ${p.descripcion}`])))
    }
    resolveProductos()
  }, [compras])

  const filtered: CompraRow[] = useMemo(() => {
    return compras
      .filter((c) => !filtroProveedor || c.proveedor_id === filtroProveedor)
      .filter((c) => filtroVenue === 'todos' || c.venue === filtroVenue)
      .filter((c) => !filtroDesde || c.fecha >= filtroDesde)
      .filter((c) => !filtroHasta || c.fecha <= filtroHasta)
      .map((c) => ({
        ...c,
        proveedorNombre: proveedorNombreById.get(c.proveedor_id) ?? '—',
        productoNombre: c.producto_id ? productoNombreById.get(c.producto_id) ?? '…' : '—',
        precioUnitario: c.cantidad ? c.monto / c.cantidad : null,
      }))
  }, [compras, filtroProveedor, filtroVenue, filtroDesde, filtroHasta, proveedorNombreById, productoNombreById])

  const { sorted, sortKey, direction, toggleSort } = useSortableTable<CompraRow>(filtered, 'fecha')

  const totalFiltrado = filtered.reduce((sum, c) => sum + c.monto, 0)

  // --- Histórico mensual (para el grafico) ---
  const porMes = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of compras) {
      const mes = c.fecha.slice(0, 7) // YYYY-MM
      map.set(mes, (map.get(mes) ?? 0) + c.monto)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12)
  }, [compras])

  const maxMes = Math.max(1, ...porMes.map(([, v]) => v))

  const porProveedor = useMemo(() => {
    const map = new Map<string, number>()
    for (const c of compras) {
      const nombre = proveedorNombreById.get(c.proveedor_id) ?? '—'
      map.set(nombre, (map.get(nombre) ?? 0) + c.monto)
    }
    return [...map.entries()].sort(([, a], [, b]) => b - a).slice(0, 8)
  }, [compras, proveedorNombreById])

  return (
    <div>
      <div className="rc-page-header">
        <h1>Compras</h1>
        <p>Registro de compras por proveedor, con histórico para analizar tendencias.</p>
      </div>

      <div className="rc-card" style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ marginTop: 0 }}>Registrar compra</h3>
        {error && <div className="rc-alert rc-alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div className="rc-field" style={{ flex: '1 1 200px' }}>
              <label>Proveedor</label>
              <select className="rc-input" value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} required>
                <option value="">Elegir...</option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div className="rc-field" style={{ flex: '1 1 220px', position: 'relative' }}>
              <label>Producto (opcional)</label>
              <input
                className="rc-input"
                placeholder="Buscar código o nombre..."
                value={productoSeleccionado ? `${productoSeleccionado.codigo} — ${productoSeleccionado.descripcion}` : productoQuery}
                onChange={(e) => buscarProducto(e.target.value)}
              />
              {!productoSeleccionado && productoResultados.length > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    background: '#fff',
                    border: '1px solid var(--rc-border)',
                    borderRadius: 'var(--rc-radius)',
                    maxHeight: 180,
                    overflowY: 'auto',
                    zIndex: 10,
                  }}
                >
                  {productoResultados.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => {
                        setProductoSeleccionado(p)
                        setProductoResultados([])
                      }}
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
            <div className="rc-field" style={{ width: 110 }}>
              <label>Sector</label>
              <select className="rc-input" value={venue} onChange={(e) => setVenue(e.target.value as 'bar' | 'resto')}>
                <option value="bar">Bar</option>
                <option value="resto">Resto</option>
              </select>
            </div>
            <div className="rc-field" style={{ width: 150 }}>
              <label>Fecha</label>
              <input className="rc-input" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} required />
            </div>
            <div className="rc-field" style={{ width: 110 }}>
              <label>Cantidad</label>
              <input className="rc-input" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="Opcional" />
            </div>
            <div className="rc-field" style={{ width: 140 }}>
              <label>Monto</label>
              <input className="rc-input" value={monto} onChange={(e) => setMonto(e.target.value)} required />
            </div>
            <div className="rc-field" style={{ flex: '1 1 160px' }}>
              <label>Nota</label>
              <input className="rc-input" value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Opcional" />
            </div>
          </div>
          <button type="submit" className="rc-btn rc-btn-primary" disabled={saving}>
            {saving ? 'Guardando...' : '+ Registrar compra'}
          </button>
        </form>
      </div>

      <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <div className="rc-card" style={{ flex: '2 1 420px' }}>
          <h3 style={{ marginTop: 0 }}>Compras por mes (últimos 12)</h3>
          {porMes.length === 0 ? (
            <p style={{ color: 'var(--rc-text-muted)' }}>Todavía no hay compras cargadas.</p>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.6rem', height: 160, paddingTop: '1rem' }}>
              {porMes.map(([mes, valor]) => (
                <div key={mes} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
                  <div
                    title={`${mes}: ${money.format(valor)}`}
                    style={{
                      width: '100%',
                      maxWidth: 32,
                      height: Math.max(4, (valor / maxMes) * 130),
                      background: 'var(--rc-primary)',
                      borderRadius: '4px 4px 0 0',
                    }}
                  />
                  <span style={{ fontSize: '0.68rem', color: 'var(--rc-text-muted)', writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: 46 }}>
                    {mes}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rc-card" style={{ flex: '1 1 280px' }}>
          <h3 style={{ marginTop: 0 }}>Top proveedores (total histórico)</h3>
          {porProveedor.length === 0 ? (
            <p style={{ color: 'var(--rc-text-muted)' }}>—</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <tbody>
                {porProveedor.map(([nombre, valor]) => (
                  <tr key={nombre} style={{ borderBottom: '1px solid var(--rc-border)' }}>
                    <td style={{ padding: '0.3rem 0' }}>{nombre}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{money.format(valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--rc-text-muted)', display: 'block' }}>Proveedor</label>
          <select className="rc-input" style={{ maxWidth: 200 }} value={filtroProveedor} onChange={(e) => setFiltroProveedor(e.target.value)}>
            <option value="">Todos</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--rc-text-muted)', display: 'block' }}>Sector</label>
          <select className="rc-input" style={{ maxWidth: 140 }} value={filtroVenue} onChange={(e) => setFiltroVenue(e.target.value as typeof filtroVenue)}>
            <option value="todos">Todos</option>
            <option value="bar">Bar</option>
            <option value="resto">Resto</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--rc-text-muted)', display: 'block' }}>Desde</label>
          <input className="rc-input" type="date" value={filtroDesde} onChange={(e) => setFiltroDesde(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--rc-text-muted)', display: 'block' }}>Hasta</label>
          <input className="rc-input" type="date" value={filtroHasta} onChange={(e) => setFiltroHasta(e.target.value)} />
        </div>
      </div>

      <div className="rc-card" style={{ overflowX: 'auto' }}>
        {loading ? (
          <p style={{ color: 'var(--rc-text-muted)' }}>Cargando...</p>
        ) : (
          <>
            <p style={{ marginTop: 0, color: 'var(--rc-text-muted)' }}>
              {filtered.length} compras — total {money.format(totalFiltrado)}
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--rc-border)' }}>
                  <SortableTh label="Fecha" active={sortKey === 'fecha'} direction={direction} onClick={() => toggleSort('fecha')} style={{ padding: '0.5rem 0.5rem 0.5rem 0' }} />
                  <SortableTh label="Proveedor" active={sortKey === 'proveedorNombre'} direction={direction} onClick={() => toggleSort('proveedorNombre')} />
                  <SortableTh label="Producto" active={sortKey === 'productoNombre'} direction={direction} onClick={() => toggleSort('productoNombre')} />
                  <SortableTh label="Sector" active={sortKey === 'venue'} direction={direction} onClick={() => toggleSort('venue')} />
                  <SortableTh label="Cantidad" active={sortKey === 'cantidad'} direction={direction} onClick={() => toggleSort('cantidad')} />
                  <SortableTh label="Precio unitario" active={sortKey === 'precioUnitario'} direction={direction} onClick={() => toggleSort('precioUnitario')} />
                  <SortableTh label="Precio total" active={sortKey === 'monto'} direction={direction} onClick={() => toggleSort('monto')} />
                  <th>Nota</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((c) => (
                  <tr key={c.id} style={{ borderBottom: '1px solid var(--rc-border)' }}>
                    <td style={{ padding: '0.4rem 0.5rem 0.4rem 0' }}>{formatFechaAR(c.fecha)}</td>
                    <td>{c.proveedorNombre}</td>
                    <td>{c.productoNombre}</td>
                    <td style={{ textTransform: 'capitalize' }}>{c.venue}</td>
                    <td>{c.cantidad ?? '—'}</td>
                    <td>{c.precioUnitario !== null ? money.format(c.precioUnitario) : '—'}</td>
                    <td>{money.format(c.monto)}</td>
                    <td>{c.nota ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  )
}
