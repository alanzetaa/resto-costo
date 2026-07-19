import { FormEvent, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { formatFechaAR } from '../lib/dateFormat'
import { DateInputAR } from '../components/ui/DateInputAR'

interface Periodo {
  id: string
  venue: string
  tipo: string
  fecha_inicio: string
  fecha_fin: string
  venta_bruta: number
  cerrado: boolean
}

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })

function proximoLunes(desde: Date): Date {
  const d = new Date(desde)
  const dia = d.getDay() // 0=domingo
  const diff = (8 - dia) % 7 || 7
  d.setDate(d.getDate() + diff)
  return d
}

function toISO(d: Date) {
  return d.toISOString().slice(0, 10)
}

export function StockPage() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [venue, setVenue] = useState<'bar' | 'resto'>('bar')
  const [tipo, setTipo] = useState<'semanal' | 'mensual'>('semanal')
  const [periodos, setPeriodos] = useState<Periodo[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('periodos_valorizacion')
      .select('id, venue, tipo, fecha_inicio, fecha_fin, venta_bruta, cerrado')
      .eq('venue', venue)
      .eq('tipo', tipo)
      .order('fecha_inicio', { ascending: false })
    setPeriodos((data ?? []) as Periodo[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venue, tipo])

  function openForm() {
    setError(null)
    const ultimo = periodos[0]
    if (ultimo) {
      const siguienteInicio = new Date(ultimo.fecha_fin)
      siguienteInicio.setDate(siguienteInicio.getDate() + 1)
      const fin = new Date(siguienteInicio)
      if (tipo === 'semanal') fin.setDate(fin.getDate() + 6)
      else fin.setMonth(fin.getMonth() + 1, 0)
      setFechaInicio(toISO(siguienteInicio))
      setFechaFin(toISO(fin))
    } else {
      const hoy = new Date()
      const inicio = tipo === 'semanal' ? proximoLunes(new Date(hoy.getTime() - 7 * 86400000)) : new Date(hoy.getFullYear(), hoy.getMonth(), 1)
      const fin = new Date(inicio)
      if (tipo === 'semanal') fin.setDate(fin.getDate() + 6)
      else fin.setMonth(fin.getMonth() + 1, 0)
      setFechaInicio(toISO(inicio))
      setFechaFin(toISO(fin))
    }
    setFormOpen(true)
  }

  async function handleCrear(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!fechaInicio || !fechaFin) {
      setError('Completá fecha de inicio y fin.')
      return
    }
    setCreating(true)

    const { data: nuevoPeriodo, error: periodoError } = await supabase
      .from('periodos_valorizacion')
      .insert({ venue, tipo, fecha_inicio: fechaInicio, fecha_fin: fechaFin, created_by: profile?.id ?? null })
      .select('id')
      .single()

    if (periodoError || !nuevoPeriodo) {
      setCreating(false)
      setError(periodoError?.message ?? 'No se pudo crear el período.')
      return
    }

    // Productos a incluir: todos menos la categoría "Madre" (no son insumos físicos comprables)
    const { data: productos } = await supabase.from('productos').select('id, categoria').not('categoria', 'ilike', 'madre')

    // Arrastra cantidad_final del período anterior (mismo venue+tipo) como cantidad_inicial
    const { data: anterior } = await supabase
      .from('periodos_valorizacion')
      .select('id')
      .eq('venue', venue)
      .eq('tipo', tipo)
      .lt('fecha_inicio', fechaInicio)
      .order('fecha_inicio', { ascending: false })
      .limit(1)
      .maybeSingle()

    let finalPorProducto = new Map<string, number>()
    if (anterior) {
      const { data: conteosAnteriores } = await supabase
        .from('stock_conteos')
        .select('producto_id, cantidad_final')
        .eq('periodo_id', anterior.id)
      finalPorProducto = new Map((conteosAnteriores ?? []).map((c) => [c.producto_id, c.cantidad_final ?? 0]))
    }

    const filas = (productos ?? []).map((p) => ({
      periodo_id: nuevoPeriodo.id,
      producto_id: p.id,
      cantidad_inicial: finalPorProducto.get(p.id) ?? 0,
    }))

    for (let i = 0; i < filas.length; i += 300) {
      await supabase.from('stock_conteos').insert(filas.slice(i, i + 300))
    }

    setCreating(false)
    navigate(`/stock/${nuevoPeriodo.id}`)
  }

  return (
    <div>
      <div className="rc-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1>Stock — Valorización</h1>
          <p>Conteo y valorización de mercadería, semanal o mensual, por sector.</p>
        </div>
        <button className="rc-btn rc-btn-primary" onClick={openForm} disabled={creating}>
          + Nuevo período
        </button>
      </div>

      <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem' }}>
        <select className="rc-input" style={{ maxWidth: 140 }} value={venue} onChange={(e) => setVenue(e.target.value as 'bar' | 'resto')}>
          <option value="bar">Bar</option>
          <option value="resto">Resto</option>
        </select>
        <select className="rc-input" style={{ maxWidth: 140 }} value={tipo} onChange={(e) => setTipo(e.target.value as 'semanal' | 'mensual')}>
          <option value="semanal">Semanal</option>
          <option value="mensual">Mensual</option>
        </select>
      </div>

      <div className="rc-card" style={{ overflowX: 'auto' }}>
        {loading ? (
          <p style={{ color: 'var(--rc-text-muted)' }}>Cargando...</p>
        ) : periodos.length === 0 ? (
          <p style={{ color: 'var(--rc-text-muted)' }}>Todavía no hay períodos para este sector.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--rc-border)' }}>
                <th style={{ padding: '0.5rem 0.5rem 0.5rem 0' }}>Desde</th>
                <th>Hasta</th>
                <th>Venta bruta</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {periodos.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--rc-border)', cursor: 'pointer' }} onClick={() => navigate(`/stock/${p.id}`)}>
                  <td style={{ padding: '0.4rem 0.5rem 0.4rem 0' }}>{formatFechaAR(p.fecha_inicio)}</td>
                  <td>{formatFechaAR(p.fecha_fin)}</td>
                  <td>{money.format(p.venta_bruta)}</td>
                  <td>{p.cerrado ? 'Cerrado' : 'Abierto'}</td>
                  <td>
                    <span className="rc-btn rc-btn-secondary">Ver</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {formOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}
          onClick={() => setFormOpen(false)}
        >
          <div className="rc-card" style={{ width: '100%', maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Nuevo período {tipo}</h3>
            {error && <div className="rc-alert rc-alert-error">{error}</div>}
            <form onSubmit={handleCrear}>
              <div className="rc-field">
                <label>Desde</label>
                <DateInputAR value={fechaInicio} onChange={setFechaInicio} required />
              </div>
              <div className="rc-field">
                <label>Hasta</label>
                <DateInputAR value={fechaFin} onChange={setFechaFin} required />
              </div>
              <button type="submit" className="rc-btn rc-btn-primary" style={{ width: '100%' }} disabled={creating}>
                {creating ? 'Creando...' : 'Crear período'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
