import { FormEvent, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { calcularSubtotalesBulk } from '../lib/bulkCosteo'

const DIAS_DESACTUALIZADO = 60
const UMBRAL_PUNTOS = 0.05

interface AlertaFoodCost {
  id: string
  nombre: string
  foodCostReal: number
  objetivo: number
}

interface AlertaProducto {
  id: string
  codigo: string
  descripcion: string
  updatedAt: string
}

const pct = (n: number) => `${(n * 100).toFixed(1)}%`
const dateFmt = (iso: string) => new Date(iso).toLocaleDateString('es-AR')

export function DashboardPage() {
  const { profile } = useAuth()
  const [mermaPct, setMermaPct] = useState('')
  const [ivaPct, setIvaPct] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [alertasFoodCost, setAlertasFoodCost] = useState<AlertaFoodCost[]>([])
  const [productosDesactualizados, setProductosDesactualizados] = useState<AlertaProducto[]>([])
  const [loadingAlertas, setLoadingAlertas] = useState(true)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('configuracion').select('merma_pct, iva_pct').single()
    setMermaPct(data ? String(Number(data.merma_pct) * 100) : '')
    setIvaPct(data ? String(Number(data.iva_pct) * 100) : '')
    setLoading(false)
  }

  async function loadAlertas() {
    setLoadingAlertas(true)

    const [{ data: recetas }, { data: listaUno }, { data: config }] = await Promise.all([
      supabase.from('recetas').select('id, nombre, rubro_id, precio_actual'),
      supabase.from('listas_precio').select('id').eq('codigo', 'LISTA_1').maybeSingle(),
      supabase.from('configuracion').select('merma_pct, iva_pct').single(),
    ])

    if (listaUno && recetas) {
      const { data: objetivos } = await supabase.from('rubro_lista_objetivo').select('rubro_id, food_cost_pct').eq('lista_id', listaUno.id)
      const objetivoByRubro = new Map((objetivos ?? []).map((o) => [o.rubro_id, o.food_cost_pct]))
      const merma = Number(config?.merma_pct ?? 0.05)
      const iva = Number(config?.iva_pct ?? 0.21)

      const conPrecio = recetas.filter((r) => r.precio_actual && r.rubro_id)
      const subtotales = await calcularSubtotalesBulk(
        supabase,
        'receta_ingredientes',
        conPrecio.map((r) => r.id),
      )

      const alertas: AlertaFoodCost[] = []
      for (const r of conPrecio) {
        const objetivo = objetivoByRubro.get(r.rubro_id!)
        if (objetivo === undefined) continue
        const subtotal = subtotales.get(r.id) ?? 0
        const costoConMerma = subtotal * (1 + merma)
        const foodCostReal = (costoConMerma * (1 + iva)) / r.precio_actual!
        if (foodCostReal - objetivo > UMBRAL_PUNTOS) {
          alertas.push({ id: r.id, nombre: r.nombre, foodCostReal, objetivo })
        }
      }
      alertas.sort((a, b) => b.foodCostReal - b.objetivo - (a.foodCostReal - a.objetivo))
      setAlertasFoodCost(alertas.slice(0, 10))
    }

    const fechaLimite = new Date(Date.now() - DIAS_DESACTUALIZADO * 24 * 3600 * 1000).toISOString()
    const { data: productosViejos } = await supabase
      .from('productos')
      .select('id, codigo, descripcion, updated_at')
      .lt('updated_at', fechaLimite)
      .order('updated_at', { ascending: true })
      .limit(10)
    setProductosDesactualizados(
      (productosViejos ?? []).map((p) => ({ id: p.id, codigo: p.codigo, descripcion: p.descripcion, updatedAt: p.updated_at })),
    )

    setLoadingAlertas(false)
  }

  useEffect(() => {
    load()
    loadAlertas()
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setMessage(null)
    const merma = parseFloat(mermaPct.replace(',', '.'))
    const iva = parseFloat(ivaPct.replace(',', '.'))
    if (!Number.isFinite(merma) || merma < 0 || merma > 100 || !Number.isFinite(iva) || iva < 0 || iva > 100) {
      setMessage({ type: 'error', text: 'Ingresá porcentajes válidos entre 0 y 100.' })
      return
    }
    setSaving(true)
    const { error } = await supabase
      .from('configuracion')
      .update({ merma_pct: merma / 100, iva_pct: iva / 100 })
      .eq('id', true)
    setSaving(false)
    if (error) {
      setMessage({ type: 'error', text: 'No se pudo guardar: ' + error.message })
      return
    }
    setMessage({ type: 'success', text: 'Guardado. El costeo de todas las Madres y Recetas ya usa este valor.' })
    loadAlertas()
  }

  return (
    <div>
      <div className="rc-page-header">
        <h1>Dashboard</h1>
        <p>Bienvenido, {profile?.email}.</p>
      </div>

      <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <div className="rc-card" style={{ flex: '1 1 320px' }}>
          <h3 style={{ marginTop: 0 }}>Food cost fuera de objetivo</h3>
          <p style={{ marginTop: 0, fontSize: '0.82rem', color: 'var(--rc-text-muted)' }}>
            Recetas con precio actual cargado cuyo food cost real supera en más de 5 puntos el objetivo de Lista 1.
          </p>
          {loadingAlertas ? (
            <p style={{ color: 'var(--rc-text-muted)' }}>Cargando...</p>
          ) : alertasFoodCost.length === 0 ? (
            <p style={{ color: 'var(--rc-success)', fontSize: '0.9rem' }}>Todo dentro de objetivo. 🎉</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.88rem' }}>
              {alertasFoodCost.map((a) => (
                <li key={a.id} style={{ marginBottom: '0.35rem' }}>
                  <Link to={`/recetas/${a.id}`}>{a.nombre}</Link>{' '}
                  <span style={{ color: 'var(--rc-danger)' }}>
                    {pct(a.foodCostReal)} real vs. {pct(a.objetivo)} objetivo
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rc-card" style={{ flex: '1 1 320px' }}>
          <h3 style={{ marginTop: 0 }}>Precios de insumo desactualizados</h3>
          <p style={{ marginTop: 0, fontSize: '0.82rem', color: 'var(--rc-text-muted)' }}>
            Productos sin cambios de precio hace más de {DIAS_DESACTUALIZADO} días.
          </p>
          {loadingAlertas ? (
            <p style={{ color: 'var(--rc-text-muted)' }}>Cargando...</p>
          ) : productosDesactualizados.length === 0 ? (
            <p style={{ color: 'var(--rc-success)', fontSize: '0.9rem' }}>Todo actualizado. 🎉</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '0.88rem' }}>
              {productosDesactualizados.map((p) => (
                <li key={p.id} style={{ marginBottom: '0.35rem' }}>
                  {p.codigo} — {p.descripcion} <span style={{ color: 'var(--rc-text-muted)' }}>({dateFmt(p.updatedAt)})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="rc-card" style={{ maxWidth: 420 }}>
        <h3 style={{ marginTop: 0 }}>Configuración general</h3>
        <p style={{ marginTop: 0, color: 'var(--rc-text-muted)', fontSize: '0.9rem' }}>
          Estos valores se aplican automáticamente al costeo de <strong>todas</strong> las Madres y Recetas (subtotal
          con merma y precio sugerido).
        </p>
        {loading ? (
          <p style={{ color: 'var(--rc-text-muted)' }}>Cargando...</p>
        ) : (
          <form onSubmit={handleSubmit}>
            {message && <div className={`rc-alert rc-alert-${message.type}`}>{message.text}</div>}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <div className="rc-field" style={{ flex: 1 }}>
                <label>Merma / Scrap (%)</label>
                <input className="rc-input" value={mermaPct} onChange={(e) => setMermaPct(e.target.value)} />
              </div>
              <div className="rc-field" style={{ flex: 1 }}>
                <label>IVA (%)</label>
                <input className="rc-input" value={ivaPct} onChange={(e) => setIvaPct(e.target.value)} />
              </div>
            </div>
            <button type="submit" className="rc-btn rc-btn-primary" disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
