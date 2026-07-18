import type { SupabaseClient } from '@supabase/supabase-js'

export interface InsumoRef {
  insumo_type: 'producto' | 'preparacion'
  insumo_id: string
}

export interface InsumoInfo {
  nombre: string
  unidad: string | null
  precio_unitario: number
}

export function insumoKey(tipo: string, id: string) {
  return `${tipo}:${id}`
}

/**
 * Resuelve nombre/unidad/precio_unitario para una lista de referencias de insumo
 * (productos o preparaciones). El costo de una preparación usada como insumo se
 * calcula a partir de sus propios ingredientes de tipo "producto" únicamente
 * (un nivel de profundidad) — si esa preparación a su vez usa otra preparación
 * como ingrediente, ese costo no se propaga todavía.
 */
export async function resolveInsumos(
  supabase: SupabaseClient,
  mermaPct: number,
  refs: InsumoRef[],
): Promise<Map<string, InsumoInfo>> {
  const result = new Map<string, InsumoInfo>()
  const productoIds = [...new Set(refs.filter((r) => r.insumo_type === 'producto').map((r) => r.insumo_id))]
  const preparacionIds = [...new Set(refs.filter((r) => r.insumo_type === 'preparacion').map((r) => r.insumo_id))]

  if (productoIds.length) {
    const { data } = await supabase
      .from('productos')
      .select('id, descripcion, unidad, precio_unitario')
      .in('id', productoIds)
    for (const p of data ?? []) {
      result.set(insumoKey('producto', p.id), {
        nombre: p.descripcion,
        unidad: p.unidad,
        precio_unitario: Number(p.precio_unitario) || 0,
      })
    }
  }

  if (preparacionIds.length) {
    const { data: preps } = await supabase
      .from('preparaciones')
      .select('id, nombre, rendimiento_cantidad, rendimiento_unidad')
      .in('id', preparacionIds)

    const { data: lines } = await supabase
      .from('preparacion_ingredientes')
      .select('parent_id, insumo_type, insumo_id, cantidad_usada')
      .in('parent_id', preparacionIds)

    const productoIdsForLines = [
      ...new Set((lines ?? []).filter((l) => l.insumo_type === 'producto').map((l) => l.insumo_id)),
    ]
    const { data: lineProducts } = productoIdsForLines.length
      ? await supabase.from('productos').select('id, precio_unitario').in('id', productoIdsForLines)
      : { data: [] as { id: string; precio_unitario: number }[] }
    const precioById = new Map((lineProducts ?? []).map((p) => [p.id, Number(p.precio_unitario) || 0]))

    for (const prep of preps ?? []) {
      const subtotal = (lines ?? [])
        .filter((l) => l.parent_id === prep.id && l.insumo_type === 'producto')
        .reduce((sum, l) => sum + l.cantidad_usada * (precioById.get(l.insumo_id) ?? 0), 0)
      const totalConMerma = subtotal * (1 + mermaPct)
      const precioUnitario = prep.rendimiento_cantidad ? totalConMerma / prep.rendimiento_cantidad : 0
      result.set(insumoKey('preparacion', prep.id), {
        nombre: prep.nombre,
        unidad: prep.rendimiento_unidad,
        precio_unitario: precioUnitario,
      })
    }
  }

  return result
}
