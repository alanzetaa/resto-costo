import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useSortableTable } from '../lib/useSortableTable'
import { SortableTh } from '../components/ui/SortableTh'

interface PrecioRow {
  id: string
  producto: string
  precioAnterior: number | null
  precioNuevo: number
  cambiadoPor: string
  fecha: string
}

interface AccesoRow {
  id: string
  accion: string
  detalle: string
  actor: string
  fecha: string
}

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })
const ACTION_LABEL: Record<string, string> = {
  grant_access: 'Otorgó acceso',
  update_role: 'Actualizó rol',
}

export function HistorialPage() {
  const [precios, setPrecios] = useState<PrecioRow[]>([])
  const [accesos, setAccesos] = useState<AccesoRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [{ data: hist }, { data: audit }] = await Promise.all([
        supabase
          .from('historial_precios')
          .select('id, precio_anterior, precio_nuevo, changed_at, productos(codigo, descripcion), profiles(email)')
          .order('changed_at', { ascending: false })
          .limit(200),
        supabase
          .from('audit_log')
          .select('id, action, entity_type, new_value, created_at, profiles(email)')
          .order('created_at', { ascending: false })
          .limit(200),
      ])

      setPrecios(
        (hist ?? []).map((h) => {
          const producto = h.productos as unknown as { codigo: string; descripcion: string } | null
          const profile = h.profiles as unknown as { email: string } | null
          return {
            id: h.id,
            producto: producto ? `${producto.codigo} — ${producto.descripcion}` : '(producto eliminado)',
            precioAnterior: h.precio_anterior,
            precioNuevo: h.precio_nuevo,
            cambiadoPor: profile?.email ?? '—',
            fecha: h.changed_at,
          }
        }),
      )

      setAccesos(
        (audit ?? []).map((a) => {
          const profile = a.profiles as unknown as { email: string } | null
          const value = a.new_value as { email?: string; role?: string } | null
          return {
            id: a.id,
            accion: ACTION_LABEL[a.action] ?? a.action,
            detalle: value?.email ? `${value.email} → ${value.role}` : JSON.stringify(value),
            actor: profile?.email ?? '—',
            fecha: a.created_at,
          }
        }),
      )
      setLoading(false)
    }
    load()
  }, [])

  const preciosSort = useSortableTable<PrecioRow>(precios, 'fecha')
  const accesosSort = useSortableTable<AccesoRow>(accesos, 'fecha')

  return (
    <div>
      <div className="rc-page-header">
        <h1>Historial</h1>
        <p>Cambios de precio de Productos y altas/cambios de rol en Accesos.</p>
      </div>

      <div className="rc-card" style={{ overflowX: 'auto', marginBottom: '1.25rem' }}>
        <h3 style={{ marginTop: 0 }}>Cambios de precio</h3>
        {loading ? (
          <p style={{ color: 'var(--rc-text-muted)' }}>Cargando...</p>
        ) : precios.length === 0 ? (
          <p style={{ color: 'var(--rc-text-muted)' }}>Todavía no hay cambios de precio registrados.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--rc-border)' }}>
                <SortableTh label="Producto" active={preciosSort.sortKey === 'producto'} direction={preciosSort.direction} onClick={() => preciosSort.toggleSort('producto')} style={{ padding: '0.5rem 0.5rem 0.5rem 0' }} />
                <SortableTh label="Precio anterior" active={preciosSort.sortKey === 'precioAnterior'} direction={preciosSort.direction} onClick={() => preciosSort.toggleSort('precioAnterior')} />
                <SortableTh label="Precio nuevo" active={preciosSort.sortKey === 'precioNuevo'} direction={preciosSort.direction} onClick={() => preciosSort.toggleSort('precioNuevo')} />
                <SortableTh label="Cambiado por" active={preciosSort.sortKey === 'cambiadoPor'} direction={preciosSort.direction} onClick={() => preciosSort.toggleSort('cambiadoPor')} />
                <SortableTh label="Fecha" active={preciosSort.sortKey === 'fecha'} direction={preciosSort.direction} onClick={() => preciosSort.toggleSort('fecha')} />
              </tr>
            </thead>
            <tbody>
              {preciosSort.sorted.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--rc-border)' }}>
                  <td style={{ padding: '0.4rem 0.5rem 0.4rem 0' }}>{p.producto}</td>
                  <td>{p.precioAnterior !== null ? money.format(p.precioAnterior) : '—'}</td>
                  <td>{money.format(p.precioNuevo)}</td>
                  <td>{p.cambiadoPor}</td>
                  <td>{new Date(p.fecha).toLocaleString('es-AR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rc-card" style={{ overflowX: 'auto' }}>
        <h3 style={{ marginTop: 0 }}>Accesos</h3>
        {loading ? (
          <p style={{ color: 'var(--rc-text-muted)' }}>Cargando...</p>
        ) : accesos.length === 0 ? (
          <p style={{ color: 'var(--rc-text-muted)' }}>Todavía no hay cambios de acceso registrados.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--rc-border)' }}>
                <SortableTh label="Acción" active={accesosSort.sortKey === 'accion'} direction={accesosSort.direction} onClick={() => accesosSort.toggleSort('accion')} style={{ padding: '0.5rem 0.5rem 0.5rem 0' }} />
                <SortableTh label="Detalle" active={accesosSort.sortKey === 'detalle'} direction={accesosSort.direction} onClick={() => accesosSort.toggleSort('detalle')} />
                <SortableTh label="Realizado por" active={accesosSort.sortKey === 'actor'} direction={accesosSort.direction} onClick={() => accesosSort.toggleSort('actor')} />
                <SortableTh label="Fecha" active={accesosSort.sortKey === 'fecha'} direction={accesosSort.direction} onClick={() => accesosSort.toggleSort('fecha')} />
              </tr>
            </thead>
            <tbody>
              {accesosSort.sorted.map((a) => (
                <tr key={a.id} style={{ borderBottom: '1px solid var(--rc-border)' }}>
                  <td style={{ padding: '0.4rem 0.5rem 0.4rem 0' }}>{a.accion}</td>
                  <td>{a.detalle}</td>
                  <td>{a.actor}</td>
                  <td>{new Date(a.fecha).toLocaleString('es-AR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
