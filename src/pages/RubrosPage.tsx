import { FormEvent, useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Modal } from '../components/ui/Modal'

interface Rubro {
  id: string
  codigo: string
  descripcion: string
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

export function RubrosPage() {
  const [rubros, setRubros] = useState<Rubro[]>([])
  const [listas, setListas] = useState<Lista[]>([])
  const [objetivos, setObjetivos] = useState<Objetivo[]>([])
  const [loading, setLoading] = useState(true)
  const [newOpen, setNewOpen] = useState(false)

  async function load() {
    setLoading(true)
    const [{ data: r }, { data: l }, { data: o }] = await Promise.all([
      supabase.from('rubros').select('id, codigo, descripcion').order('descripcion'),
      supabase.from('listas_precio').select('id, codigo, nombre').order('codigo'),
      supabase.from('rubro_lista_objetivo').select('rubro_id, lista_id, food_cost_pct'),
    ])
    setRubros((r ?? []) as Rubro[])
    setListas((l ?? []) as Lista[])
    setObjetivos((o ?? []) as Objetivo[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  function pctFor(rubroId: string, listaId: string): number | '' {
    const found = objetivos.find((o) => o.rubro_id === rubroId && o.lista_id === listaId)
    return found ? found.food_cost_pct : ''
  }

  async function savePct(rubroId: string, listaId: string, value: string) {
    const pct = parseFloat(value.replace(',', '.'))
    if (!Number.isFinite(pct)) return
    setObjetivos((prev) => {
      const rest = prev.filter((o) => !(o.rubro_id === rubroId && o.lista_id === listaId))
      return [...rest, { rubro_id: rubroId, lista_id: listaId, food_cost_pct: pct }]
    })
    await supabase.from('rubro_lista_objetivo').upsert(
      { rubro_id: rubroId, lista_id: listaId, food_cost_pct: pct },
      { onConflict: 'rubro_id,lista_id' },
    )
  }

  async function saveDescripcion(rubroId: string, value: string) {
    setRubros((prev) => prev.map((r) => (r.id === rubroId ? { ...r, descripcion: value } : r)))
    await supabase.from('rubros').update({ descripcion: value }).eq('id', rubroId)
  }

  return (
    <div>
      <div className="rc-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h1>Rubros</h1>
          <p>Food cost objetivo por rubro y lista de precios. Los cambios se guardan al salir del campo.</p>
        </div>
        <button className="rc-btn rc-btn-primary" onClick={() => setNewOpen(true)}>
          + Nuevo rubro
        </button>
      </div>

      <div className="rc-card" style={{ overflowX: 'auto' }}>
        {loading ? (
          <p style={{ color: 'var(--rc-text-muted)' }}>Cargando...</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--rc-border)' }}>
                <th style={{ padding: '0.5rem 0.5rem 0.5rem 0' }}>Código</th>
                <th>Descripción</th>
                {listas.map((l) => (
                  <th key={l.id}>{l.nombre}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rubros.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--rc-border)' }}>
                  <td style={{ padding: '0.4rem 0.5rem 0.4rem 0' }}>{r.codigo}</td>
                  <td>
                    <input
                      className="rc-input"
                      defaultValue={r.descripcion}
                      onBlur={(e) => saveDescripcion(r.id, e.target.value)}
                      style={{ minWidth: 180 }}
                    />
                  </td>
                  {listas.map((l) => (
                    <td key={l.id}>
                      <input
                        className="rc-input"
                        style={{ width: 80 }}
                        defaultValue={pctFor(r.id, l.id)}
                        onBlur={(e) => savePct(r.id, l.id, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {newOpen && <NuevoRubroModal listas={listas} onClose={() => setNewOpen(false)} onSaved={load} />}
    </div>
  )
}

function NuevoRubroModal({ listas, onClose, onSaved }: { listas: Lista[]; onClose: () => void; onSaved: () => void }) {
  const [codigo, setCodigo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [pcts, setPcts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const { data: rubro, error: rubroError } = await supabase
      .from('rubros')
      .insert({ codigo: codigo.trim(), descripcion: descripcion.trim() })
      .select('id')
      .single()
    if (rubroError || !rubro) {
      setSaving(false)
      setError(rubroError?.message ?? 'No se pudo crear el rubro.')
      return
    }
    const objetivoRows = listas
      .map((l) => ({ rubro_id: rubro.id, lista_id: l.id, food_cost_pct: parseFloat((pcts[l.id] ?? '').replace(',', '.')) }))
      .filter((o) => Number.isFinite(o.food_cost_pct))
    if (objetivoRows.length) {
      await supabase.from('rubro_lista_objetivo').insert(objetivoRows)
    }
    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <Modal title="Nuevo rubro" onClose={onClose}>
      {error && <div className="rc-alert rc-alert-error">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="rc-field">
          <label>Código</label>
          <input className="rc-input" value={codigo} onChange={(e) => setCodigo(e.target.value)} required />
        </div>
        <div className="rc-field">
          <label>Descripción</label>
          <input className="rc-input" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} required />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          {listas.map((l) => (
            <div key={l.id} className="rc-field" style={{ flex: 1, marginBottom: 0 }}>
              <label>{l.nombre}</label>
              <input
                className="rc-input"
                value={pcts[l.id] ?? ''}
                onChange={(e) => setPcts({ ...pcts, [l.id]: e.target.value })}
                placeholder="0.30"
              />
            </div>
          ))}
        </div>
        <button type="submit" className="rc-btn rc-btn-primary" style={{ width: '100%' }} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </form>
    </Modal>
  )
}
