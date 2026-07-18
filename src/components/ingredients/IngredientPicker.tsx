import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

interface SearchResult {
  insumo_type: 'producto' | 'preparacion'
  insumo_id: string
  label: string
}

interface IngredientPickerProps {
  onAdd: (item: SearchResult, cantidad: number) => void | Promise<void>
}

export function IngredientPicker({ onAdd }: IngredientPickerProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<SearchResult | null>(null)
  const [cantidad, setCantidad] = useState('')

  async function handleSearch(q: string) {
    setQuery(q)
    setSelected(null)
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    setSearching(true)
    const [{ data: productos }, { data: preparaciones }] = await Promise.all([
      supabase.from('productos').select('id, codigo, descripcion').or(`codigo.ilike.%${q}%,descripcion.ilike.%${q}%`).limit(10),
      supabase.from('preparaciones').select('id, nombre, venue').ilike('nombre', `%${q}%`).limit(10),
    ])
    setSearching(false)
    const combined: SearchResult[] = [
      ...(productos ?? []).map((p) => ({ insumo_type: 'producto' as const, insumo_id: p.id, label: `${p.codigo} — ${p.descripcion}` })),
      ...(preparaciones ?? []).map((p) => ({
        insumo_type: 'preparacion' as const,
        insumo_id: p.id,
        label: `${p.nombre} (Madre ${p.venue})`,
      })),
    ]
    setResults(combined)
  }

  async function handleAdd() {
    const qty = parseFloat(cantidad.replace(',', '.'))
    if (!selected || !qty || qty <= 0) return
    await onAdd(selected, qty)
    setQuery('')
    setResults([])
    setSelected(null)
    setCantidad('')
  }

  return (
    <div style={{ border: '1px dashed var(--rc-border)', borderRadius: 'var(--rc-radius)', padding: '0.75rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 260px' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--rc-text-muted)' }}>Buscar ingrediente</label>
          <input
            className="rc-input"
            placeholder="Código o nombre..."
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
        <div style={{ width: 110 }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--rc-text-muted)' }}>Cantidad</label>
          <input className="rc-input" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
        </div>
        <button type="button" className="rc-btn rc-btn-primary" disabled={!selected || !cantidad} onClick={handleAdd}>
          Agregar
        </button>
      </div>

      {selected && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--rc-text-muted)' }}>
          Seleccionado: <strong>{selected.label}</strong>
        </div>
      )}

      {!selected && query.trim().length >= 2 && (
        <div style={{ marginTop: '0.5rem', maxHeight: 180, overflowY: 'auto' }}>
          {searching && <div style={{ fontSize: '0.85rem', color: 'var(--rc-text-muted)' }}>Buscando...</div>}
          {!searching && results.length === 0 && (
            <div style={{ fontSize: '0.85rem', color: 'var(--rc-text-muted)' }}>Sin resultados.</div>
          )}
          {results.map((r) => (
            <div
              key={`${r.insumo_type}-${r.insumo_id}`}
              onClick={() => setSelected(r)}
              style={{ padding: '0.4rem 0.5rem', cursor: 'pointer', borderRadius: 6, fontSize: '0.88rem' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--rc-bg)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {r.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
