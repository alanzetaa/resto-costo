import { FormEvent, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabaseClient'

export function DashboardPage() {
  const { profile } = useAuth()
  const [mermaPct, setMermaPct] = useState('')
  const [ivaPct, setIvaPct] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from('configuracion').select('merma_pct, iva_pct').single()
    setMermaPct(data ? String(Number(data.merma_pct) * 100) : '')
    setIvaPct(data ? String(Number(data.iva_pct) * 100) : '')
    setLoading(false)
  }

  useEffect(() => {
    load()
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
  }

  return (
    <div>
      <div className="rc-page-header">
        <h1>Dashboard</h1>
        <p>Bienvenido, {profile?.email}.</p>
      </div>

      <div className="rc-card" style={{ marginBottom: '1.25rem' }}>
        <p style={{ margin: 0, color: 'var(--rc-text-muted)' }}>
          Acá vas a ver alertas de precios vencidos y food cost fuera de objetivo más adelante.
        </p>
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
