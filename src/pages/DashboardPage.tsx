import { FormEvent, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabaseClient'
import { calcularSubtotalesBulk } from '../lib/bulkCosteo'

interface Resumen {
  productos: number
  madres: number
  recetas: number
  rubros: number
  costoPromedioReceta: number
  costoPromedioMadre: number
  recetasConPrecio: number
  productoMasCaro: { descripcion: string; precio: number } | null
}

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rc-card" style={{ flex: '1 1 200px' }}>
      <div style={{ fontSize: '0.8rem', color: 'var(--rc-text-muted)' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--rc-primary)' }}>{value}</div>
    </div>
  )
}

export function DashboardPage() {
  const { profile } = useAuth()
  const [mermaPct, setMermaPct] = useState('')
  const [ivaPct, setIvaPct] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [loadingResumen, setLoadingResumen] = useState(true)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('configuracion').select('merma_pct, iva_pct').single()
    setMermaPct(data ? String(Number(data.merma_pct) * 100) : '')
    setIvaPct(data ? String(Number(data.iva_pct) * 100) : '')
    setLoading(false)
  }

  async function loadResumen() {
    setLoadingResumen(true)

    const [
      { count: productos },
      { count: madres },
      { count: recetas },
      { count: rubros },
      { count: recetasConPrecio },
      { data: config },
      { data: preps },
      { data: recetasData },
      { data: masCaro },
    ] = await Promise.all([
      supabase.from('productos').select('id', { count: 'exact', head: true }),
      supabase.from('preparaciones').select('id', { count: 'exact', head: true }),
      supabase.from('recetas').select('id', { count: 'exact', head: true }),
      supabase.from('rubros').select('id', { count: 'exact', head: true }),
      supabase.from('recetas').select('id', { count: 'exact', head: true }).not('precio_actual', 'is', null),
      supabase.from('configuracion').select('merma_pct'),
      supabase.from('preparaciones').select('id'),
      supabase.from('recetas').select('id'),
      supabase.from('productos').select('descripcion, precio_compra').order('precio_compra', { ascending: false }).limit(1).maybeSingle(),
    ])

    const merma = Number(config?.[0]?.merma_pct ?? 0.05)

    const [subtotalMadres, subtotalRecetas] = await Promise.all([
      calcularSubtotalesBulk(supabase, 'preparacion_ingredientes', (preps ?? []).map((p) => p.id)),
      calcularSubtotalesBulk(supabase, 'receta_ingredientes', (recetasData ?? []).map((r) => r.id)),
    ])

    const promedio = (mapa: Map<string, number>) => {
      if (mapa.size === 0) return 0
      const total = [...mapa.values()].reduce((s, v) => s + v * (1 + merma), 0)
      return total / mapa.size
    }

    setResumen({
      productos: productos ?? 0,
      madres: madres ?? 0,
      recetas: recetas ?? 0,
      rubros: rubros ?? 0,
      costoPromedioReceta: promedio(subtotalRecetas),
      costoPromedioMadre: promedio(subtotalMadres),
      recetasConPrecio: recetasConPrecio ?? 0,
      productoMasCaro: masCaro ? { descripcion: masCaro.descripcion, precio: masCaro.precio_compra } : null,
    })
    setLoadingResumen(false)
  }

  useEffect(() => {
    load()
    loadResumen()
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
    loadResumen()
  }

  return (
    <div>
      <div className="rc-page-header">
        <h1>Dashboard</h1>
        <p>Hola, {profile?.nombre || profile?.email}.</p>
      </div>

      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        {loadingResumen || !resumen ? (
          <p style={{ color: 'var(--rc-text-muted)' }}>Cargando resumen...</p>
        ) : (
          <>
            <StatTile label="Productos cargados" value={String(resumen.productos)} />
            <StatTile label="Madres cargadas" value={String(resumen.madres)} />
            <StatTile label="Recetas cargadas" value={String(resumen.recetas)} />
            <StatTile label="Rubros" value={String(resumen.rubros)} />
            <StatTile label="Costo promedio por Receta" value={money.format(resumen.costoPromedioReceta)} />
            <StatTile label="Costo promedio por Madre" value={money.format(resumen.costoPromedioMadre)} />
            <StatTile label="Recetas con precio de venta cargado" value={`${resumen.recetasConPrecio} / ${resumen.recetas}`} />
            {resumen.productoMasCaro && (
              <StatTile label="Producto más caro" value={`${resumen.productoMasCaro.descripcion} · ${money.format(resumen.productoMasCaro.precio)}`} />
            )}
          </>
        )}
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
