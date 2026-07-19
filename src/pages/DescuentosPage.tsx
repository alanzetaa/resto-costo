import { FormEvent, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from '../contexts/AuthContext'
import { useSortableTable } from '../lib/useSortableTable'
import { SortableTh } from '../components/ui/SortableTh'
import { toSentenceCase } from '../lib/textFormat'
import { formatFechaAR } from '../lib/dateFormat'
import { DateInputAR } from '../components/ui/DateInputAR'
import { nombreUsuario, type UsuarioBasico } from '../lib/userDisplay'

interface Persona {
  id: string
  nombre: string
  porcentaje: number
  activo: boolean
}

interface Descuento {
  id: string
  persona_id: string
  venue: string
  fecha: string
  cantidad_operaciones: number | null
  monto: number
  nota: string | null
  profiles: UsuarioBasico | null
}

interface DescuentoRow extends Descuento {
  personaNombre: string
  cargadoPor: string
}

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })
const pct = (n: number) => `${(n * 100).toFixed(0)}%`
const todayISO = () => new Date().toISOString().slice(0, 10)

export function DescuentosPage() {
  const { profile } = useAuth()
  const [personas, setPersonas] = useState<Persona[]>([])
  const [descuentos, setDescuentos] = useState<Descuento[]>([])
  const [loading, setLoading] = useState(true)

  // alta de persona
  const [nombrePersona, setNombrePersona] = useState('')
  const [porcentajePersona, setPorcentajePersona] = useState('')
  const [savingPersona, setSavingPersona] = useState(false)

  // alta de descuento
  const [personaId, setPersonaId] = useState('')
  const [venue, setVenue] = useState<'bar' | 'resto'>('bar')
  const [fecha, setFecha] = useState(todayISO())
  const [cantidadOp, setCantidadOp] = useState('')
  const [monto, setMonto] = useState('')
  const [nota, setNota] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // filtros
  const [filtroPersona, setFiltroPersona] = useState('')
  const [filtroVenue, setFiltroVenue] = useState<'todos' | 'bar' | 'resto'>('todos')

  async function load() {
    setLoading(true)
    const [{ data: personasData }, { data: descuentosData }] = await Promise.all([
      supabase.from('personas_descuento').select('id, nombre, porcentaje, activo').order('nombre'),
      supabase
        .from('descuentos')
        .select('id, persona_id, venue, fecha, cantidad_operaciones, monto, nota, profiles(nombre, apellido, email)')
        .order('fecha', { ascending: false })
        .limit(500),
    ])
    setPersonas((personasData ?? []) as Persona[])
    setDescuentos((descuentosData ?? []) as unknown as Descuento[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleAddPersona(e: FormEvent) {
    e.preventDefault()
    const pctNum = parseFloat(porcentajePersona.replace(',', '.'))
    if (!nombrePersona.trim() || !Number.isFinite(pctNum)) return
    setSavingPersona(true)
    const { error } = await supabase.from('personas_descuento').insert({
      nombre: toSentenceCase(nombrePersona.trim()),
      porcentaje: pctNum / 100,
    })
    setSavingPersona(false)
    if (error) {
      alert('No se pudo guardar: ' + error.message)
      return
    }
    setNombrePersona('')
    setPorcentajePersona('')
    await load()
  }

  async function handleTogglePersona(p: Persona) {
    await supabase.from('personas_descuento').update({ activo: !p.activo }).eq('id', p.id)
    await load()
  }

  async function handleSubmitDescuento(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const montoNum = parseFloat(monto.replace(',', '.'))
    if (!personaId || !fecha || !Number.isFinite(montoNum)) {
      setError('Completá al menos persona, fecha y monto.')
      return
    }
    setSaving(true)
    const { error } = await supabase.from('descuentos').insert({
      persona_id: personaId,
      venue,
      fecha,
      cantidad_operaciones: cantidadOp ? parseInt(cantidadOp, 10) : null,
      monto: montoNum,
      nota: nota.trim() || null,
      created_by: profile?.id ?? null,
    })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    setCantidadOp('')
    setMonto('')
    setNota('')
    await load()
  }

  const personaNombreById = useMemo(() => new Map(personas.map((p) => [p.id, p.nombre])), [personas])

  const filtered: DescuentoRow[] = useMemo(() => {
    return descuentos
      .filter((d) => !filtroPersona || d.persona_id === filtroPersona)
      .filter((d) => filtroVenue === 'todos' || d.venue === filtroVenue)
      .map((d) => ({ ...d, personaNombre: personaNombreById.get(d.persona_id) ?? '—', cargadoPor: nombreUsuario(d.profiles) }))
  }, [descuentos, filtroPersona, filtroVenue, personaNombreById])

  const { sorted, sortKey, direction, toggleSort } = useSortableTable<DescuentoRow>(filtered, 'fecha')
  const totalFiltrado = filtered.reduce((s, d) => s + d.monto, 0)

  const porMes = useMemo(() => {
    const map = new Map<string, number>()
    for (const d of descuentos) {
      const mes = d.fecha.slice(0, 7)
      map.set(mes, (map.get(mes) ?? 0) + d.monto)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12)
  }, [descuentos])
  const maxMes = Math.max(1, ...porMes.map(([, v]) => v))

  return (
    <div>
      <div className="rc-page-header">
        <h1>Descuentos</h1>
        <p>Cortesías y descuentos a socios/empleados, por persona autorizada.</p>
      </div>

      <div className="rc-card" style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ marginTop: 0 }}>Personas autorizadas</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem', marginBottom: '1rem' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--rc-border)' }}>
              <th style={{ padding: '0.4rem 0.5rem 0.4rem 0' }}>Nombre</th>
              <th>% Descuento</th>
              <th>Estado</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {personas.map((p) => (
              <tr key={p.id} style={{ borderBottom: '1px solid var(--rc-border)' }}>
                <td style={{ padding: '0.35rem 0.5rem 0.35rem 0' }}>{p.nombre}</td>
                <td>{pct(p.porcentaje)}</td>
                <td>{p.activo ? 'Activo' : 'Inactivo'}</td>
                <td>
                  <button className="rc-btn rc-btn-secondary" onClick={() => handleTogglePersona(p)}>
                    {p.activo ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form onSubmit={handleAddPersona} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="rc-field" style={{ flex: '1 1 200px', marginBottom: 0 }}>
            <label>Nombre</label>
            <input className="rc-input" value={nombrePersona} onChange={(e) => setNombrePersona(e.target.value)} required />
          </div>
          <div className="rc-field" style={{ width: 140, marginBottom: 0 }}>
            <label>% Descuento</label>
            <input className="rc-input" value={porcentajePersona} onChange={(e) => setPorcentajePersona(e.target.value)} placeholder="ej. 30" required />
          </div>
          <button type="submit" className="rc-btn rc-btn-primary" disabled={savingPersona}>
            + Agregar persona
          </button>
        </form>
      </div>

      <div className="rc-card" style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ marginTop: 0 }}>Registrar descuento</h3>
        {error && <div className="rc-alert rc-alert-error">{error}</div>}
        <form onSubmit={handleSubmitDescuento}>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div className="rc-field" style={{ flex: '1 1 200px' }}>
              <label>Persona</label>
              <select className="rc-input" value={personaId} onChange={(e) => setPersonaId(e.target.value)} required>
                <option value="">Elegir...</option>
                {personas
                  .filter((p) => p.activo)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} ({pct(p.porcentaje)})
                    </option>
                  ))}
              </select>
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
              <DateInputAR value={fecha} onChange={setFecha} required />
            </div>
            <div className="rc-field" style={{ width: 130 }}>
              <label>Cant. operaciones</label>
              <input className="rc-input" value={cantidadOp} onChange={(e) => setCantidadOp(e.target.value)} placeholder="Opcional" />
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
            {saving ? 'Guardando...' : '+ Registrar descuento'}
          </button>
        </form>
      </div>

      <div className="rc-card" style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ marginTop: 0 }}>Descuentos por mes (últimos 12)</h3>
        {porMes.length === 0 ? (
          <p style={{ color: 'var(--rc-text-muted)' }}>Todavía no hay descuentos cargados.</p>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.6rem', height: 160, paddingTop: '1rem' }}>
            {porMes.map(([mes, valor]) => (
              <div key={mes} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.35rem' }}>
                <div
                  title={`${mes}: ${money.format(valor)}`}
                  style={{ width: '100%', maxWidth: 32, height: Math.max(4, (valor / maxMes) * 130), background: 'var(--rc-accent)', borderRadius: '4px 4px 0 0' }}
                />
                <span style={{ fontSize: '0.68rem', color: 'var(--rc-text-muted)', writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: 46 }}>{mes}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <select className="rc-input" style={{ maxWidth: 200 }} value={filtroPersona} onChange={(e) => setFiltroPersona(e.target.value)}>
          <option value="">Todas las personas</option>
          {personas.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
        <select className="rc-input" style={{ maxWidth: 140 }} value={filtroVenue} onChange={(e) => setFiltroVenue(e.target.value as typeof filtroVenue)}>
          <option value="todos">Todos los sectores</option>
          <option value="bar">Bar</option>
          <option value="resto">Resto</option>
        </select>
      </div>

      <div className="rc-card" style={{ overflowX: 'auto' }}>
        {loading ? (
          <p style={{ color: 'var(--rc-text-muted)' }}>Cargando...</p>
        ) : (
          <>
            <p style={{ marginTop: 0, color: 'var(--rc-text-muted)' }}>
              {filtered.length} descuentos — total {money.format(totalFiltrado)}
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--rc-border)' }}>
                  <SortableTh label="Fecha" active={sortKey === 'fecha'} direction={direction} onClick={() => toggleSort('fecha')} style={{ padding: '0.5rem 0.5rem 0.5rem 0' }} />
                  <SortableTh label="Persona" active={sortKey === 'personaNombre'} direction={direction} onClick={() => toggleSort('personaNombre')} />
                  <SortableTh label="Sector" active={sortKey === 'venue'} direction={direction} onClick={() => toggleSort('venue')} />
                  <SortableTh label="Cant. op." active={sortKey === 'cantidad_operaciones'} direction={direction} onClick={() => toggleSort('cantidad_operaciones')} />
                  <SortableTh label="Monto" active={sortKey === 'monto'} direction={direction} onClick={() => toggleSort('monto')} />
                  <th>Nota</th>
                  <SortableTh label="Cargado por" active={sortKey === 'cargadoPor'} direction={direction} onClick={() => toggleSort('cargadoPor')} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((d) => (
                  <tr key={d.id} style={{ borderBottom: '1px solid var(--rc-border)' }}>
                    <td style={{ padding: '0.4rem 0.5rem 0.4rem 0' }}>{formatFechaAR(d.fecha)}</td>
                    <td>{d.personaNombre}</td>
                    <td style={{ textTransform: 'capitalize' }}>{d.venue}</td>
                    <td>{d.cantidad_operaciones ?? '—'}</td>
                    <td>{money.format(d.monto)}</td>
                    <td>{d.nota ?? '—'}</td>
                    <td>{d.cargadoPor}</td>
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
