import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'

interface SearchResult {
  insumo_type: 'producto' | 'preparacion'
  insumo_id: string
  label: string
  sublabel: string
}

interface IngredientPickerProps {
  onAdd: (item: { insumo_type: 'producto' | 'preparacion'; insumo_id: string }, cantidad: number) => void | Promise<void>
}

type TipoFiltro = 'todos' | 'producto' | 'preparacion'

const FILTROS: { value: TipoFiltro; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'producto', label: 'Productos' },
  { value: 'preparacion', label: 'Madres' },
]

function Badge({ tipo }: { tipo: 'producto' | 'preparacion' }) {
  return (
    <span className={tipo === 'producto' ? 'rc-badge rc-badge-admin' : 'rc-badge rc-badge-super_admin'}>
      {tipo === 'producto' ? 'Producto' : 'Madre'}
    </span>
  )
}

export function IngredientPicker({ onAdd }: IngredientPickerProps) {
  const [query, setQuery] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>('todos')
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState<SearchResult | null>(null)
  const [cantidad, setCantidad] = useState('')

  async function runSearch(q: string, filtro: TipoFiltro) {
    setSelected(null)
    if (q.trim().length < 2) {
      setResults([])
      return
    }
    setSearching(true)

    const buscarProductos = filtro === 'todos' || filtro === 'producto'
    const buscarPreparaciones = filtro === 'todos' || filtro === 'preparacion'

    const [productosRes, preparacionesRes] = await Promise.all([
      buscarProductos
        ? supabase.from('productos').select('id, codigo, descripcion').or(`codigo.ilike.%${q}%,descripcion.ilike.%${q}%`).limit(10)
        : Promise.resolve({ data: [] as { id: string; codigo: string; descripcion: string }[] }),
      buscarPreparaciones
        ? supabase.from('preparaciones').select('id, nombre, venue').ilike('nombre', `%${q}%`).limit(10)
        : Promise.resolve({ data: [] as { id: string; nombre: string; venue: string }[] }),
    ])

    setSearching(false)
    const combined: SearchResult[] = [
      ...(productosRes.data ?? []).map((p) => ({
        insumo_type: 'producto' as const,
        insumo_id: p.id,
        label: p.descripcion,
        sublabel: `Código ${p.codigo}`,
      })),
      ...(preparacionesRes.data ?? []).map((p) => ({
        insumo_type: 'preparacion' as const,
        insumo_id: p.id,
        label: p.nombre,
        sublabel: `Madre · ${p.venue}`,
      })),
    ]
    setResults(combined)
  }

  function handleQueryChange(q: string) {
    setQuery(q)
    runSearch(q, tipoFiltro)
  }

  function handleFiltroChange(f: TipoFiltro) {
    setTipoFiltro(f)
    runSearch(query, f)
  }

  async function handleAdd() {
    const qty = parseFloat(cantidad.replace(',', '.'))
    if (!selected || !qty || qty <= 0) return
    await onAdd({ insumo_type: selected.insumo_type, insumo_id: selected.insumo_id }, qty)
    setQuery('')
    setResults([])
    setSelected(null)
    setCantidad('')
  }

  return (
    <div style={{ border: '1px dashed var(--rc-border)', borderRadius: 'var(--rc-radius)', padding: '0.75rem' }}>
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '0.6rem' }}>
        {FILTROS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => handleFiltroChange(f.value)}
            className={tipoFiltro === f.value ? 'rc-btn rc-btn-primary' : 'rc-btn rc-btn-secondary'}
            style={{ padding: '0.35rem 0.75rem', fontSize: '0.82rem' }}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 260px' }}>
          <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--rc-text-muted)' }}>
            Buscar {tipoFiltro === 'todos' ? 'ingrediente' : tipoFiltro === 'producto' ? 'producto' : 'madre'}
          </label>
          <input
            className="rc-input"
            placeholder="Código o nombre..."
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
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
        <div style={{ marginTop: '0.6rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ color: 'var(--rc-text-muted)' }}>Seleccionado:</span>
          <Badge tipo={selected.insumo_type} />
          <strong>{selected.label}</strong>
        </div>
      )}

      {!selected && query.trim().length >= 2 && (
        <div style={{ marginTop: '0.5rem', maxHeight: 200, overflowY: 'auto' }}>
          {searching && <div style={{ fontSize: '0.85rem', color: 'var(--rc-text-muted)' }}>Buscando...</div>}
          {!searching && results.length === 0 && (
            <div style={{ fontSize: '0.85rem', color: 'var(--rc-text-muted)' }}>Sin resultados. Solo podés agregar productos o madres que ya estén cargados.</div>
          )}
          {results.map((r) => (
            <div
              key={`${r.insumo_type}-${r.insumo_id}`}
              onClick={() => setSelected(r)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.45rem 0.5rem',
                cursor: 'pointer',
                borderRadius: 6,
                fontSize: '0.88rem',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--rc-bg)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <Badge tipo={r.insumo_type} />
              <span>{r.label}</span>
              <span style={{ color: 'var(--rc-text-muted)', fontSize: '0.8rem' }}>{r.sublabel}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
