import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Suma cantidad_usada * precio_unitario por parent_id para muchos ítems a la vez
 * (usado en listados: Madres, Recetas, Listas de Precio, Dashboard). Solo tiene en
 * cuenta ingredientes de tipo "producto" — si un ítem usa una Madre como ingrediente,
 * ese aporte no se refleja acá (sí se calcula en detalle, ver resolveInsumos.ts).
 * Es una aproximación aceptada para vistas de lista con muchos ítems a la vez.
 */
export async function calcularSubtotalesBulk(
  supabase: SupabaseClient,
  tabla: 'preparacion_ingredientes' | 'receta_ingredientes',
  parentIds: string[],
): Promise<Map<string, number>> {
  const subtotalPorId = new Map<string, number>()
  if (parentIds.length === 0) return subtotalPorId

  const { data: lines } = await supabase
    .from(tabla)
    .select('parent_id, insumo_type, insumo_id, cantidad_usada')
    .in('parent_id', parentIds)

  const productoIds = [...new Set((lines ?? []).filter((l) => l.insumo_type === 'producto').map((l) => l.insumo_id))]
  const { data: productos } = productoIds.length
    ? await supabase.from('productos').select('id, precio_unitario').in('id', productoIds)
    : { data: [] as { id: string; precio_unitario: number }[] }
  const precioById = new Map((productos ?? []).map((p) => [p.id, Number(p.precio_unitario) || 0]))

  for (const line of lines ?? []) {
    if (line.insumo_type !== 'producto') continue
    const costo = line.cantidad_usada * (precioById.get(line.insumo_id) ?? 0)
    subtotalPorId.set(line.parent_id, (subtotalPorId.get(line.parent_id) ?? 0) + costo)
  }

  return subtotalPorId
}
