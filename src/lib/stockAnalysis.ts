import { supabase } from './supabaseClient'

export interface PeriodoResumen {
  id: string
  venue: string
  fecha_inicio: string
  fecha_fin: string
  venta_bruta: number
  anulaciones: number
}

export const SIN_CATEGORIA = 'Sin categoría'

/**
 * % de consumo por categoría (consumo $ / venta neta) para un período dado.
 * Única fuente de verdad — la usan tanto StockDetailPage como AnalisisPage,
 * para garantizar que ambas pantallas muestren siempre el mismo número.
 */
export async function calcularPctPorCategoria(periodo: PeriodoResumen, ivaPct: number): Promise<Map<string, number>> {
  const { data: conteos } = await supabase
    .from('stock_conteos')
    .select('producto_id, cantidad_inicial, cantidad_final')
    .eq('periodo_id', periodo.id)

  const productoIds = (conteos ?? []).map((c) => c.producto_id)
  const { data: productos } = productoIds.length
    ? await supabase.from('productos').select('id, categoria, precio_unitario').in('id', productoIds)
    : { data: [] as { id: string; categoria: string | null; precio_unitario: number }[] }
  const productoById = new Map((productos ?? []).map((p) => [p.id, p]))

  const { data: compras } = await supabase
    .from('compras')
    .select('producto_id, cantidad')
    .eq('venue', periodo.venue)
    .gte('fecha', periodo.fecha_inicio)
    .lte('fecha', periodo.fecha_fin)
    .not('producto_id', 'is', null)
  const compradoPorProducto = new Map<string, number>()
  for (const c of compras ?? []) {
    compradoPorProducto.set(c.producto_id as string, (compradoPorProducto.get(c.producto_id as string) ?? 0) + (c.cantidad ?? 0))
  }

  const consumoPorCategoria = new Map<string, number>()
  for (const c of conteos ?? []) {
    if (c.cantidad_final === null) continue
    const producto = productoById.get(c.producto_id)
    if (!producto) continue
    const disponible = c.cantidad_inicial + (compradoPorProducto.get(c.producto_id) ?? 0)
    const consumoMonto = (disponible - c.cantidad_final) * producto.precio_unitario
    const cat = producto.categoria || SIN_CATEGORIA
    consumoPorCategoria.set(cat, (consumoPorCategoria.get(cat) ?? 0) + consumoMonto)
  }

  const ventaNeta = (periodo.venta_bruta - periodo.anulaciones) / (1 + ivaPct)
  const pctPorCategoria = new Map<string, number>()
  if (ventaNeta > 0) {
    for (const [cat, monto] of consumoPorCategoria) pctPorCategoria.set(cat, monto / ventaNeta)
  }
  return pctPorCategoria
}

export interface ResumenPeriodo {
  ventaNeta: number
  totalComprado: number
  totalConsumoMonto: number
  totalValorizado: number
  pctCompra: number | null
  pctConsumo: number | null
}

/**
 * Totales generales de un período (venta neta, comprado, consumo, valorizado, %compra, %consumo).
 * Misma fórmula exacta que usa StockDetailPage para el período que se está editando
 * (ahí se calcula a partir de las filas ya cargadas en memoria; acá se recalcula desde
 * cero para poder usarse con cualquier período elegido en el comparador).
 */
export async function calcularResumenPeriodo(periodo: PeriodoResumen, ivaPct: number): Promise<ResumenPeriodo> {
  const { data: conteos } = await supabase
    .from('stock_conteos')
    .select('producto_id, cantidad_inicial, cantidad_final')
    .eq('periodo_id', periodo.id)

  const productoIds = (conteos ?? []).map((c) => c.producto_id)
  const { data: productos } = productoIds.length
    ? await supabase.from('productos').select('id, precio_unitario').in('id', productoIds)
    : { data: [] as { id: string; precio_unitario: number }[] }
  const productoById = new Map((productos ?? []).map((p) => [p.id, p]))

  const { data: compras } = await supabase
    .from('compras')
    .select('producto_id, cantidad, monto')
    .eq('venue', periodo.venue)
    .gte('fecha', periodo.fecha_inicio)
    .lte('fecha', periodo.fecha_fin)
    .not('producto_id', 'is', null)

  const compradoPorProducto = new Map<string, { cantidad: number; monto: number }>()
  let totalComprado = 0
  for (const c of compras ?? []) {
    const prev = compradoPorProducto.get(c.producto_id as string) ?? { cantidad: 0, monto: 0 }
    compradoPorProducto.set(c.producto_id as string, {
      cantidad: prev.cantidad + (c.cantidad ?? 0),
      monto: prev.monto + (c.monto ?? 0),
    })
    totalComprado += c.monto ?? 0
  }

  let totalConsumoMonto = 0
  let totalValorizado = 0
  for (const c of conteos ?? []) {
    const producto = productoById.get(c.producto_id)
    if (!producto) continue
    const comprado = compradoPorProducto.get(c.producto_id)?.cantidad ?? 0
    const disponible = c.cantidad_inicial + comprado
    if (c.cantidad_final !== null) {
      totalConsumoMonto += (disponible - c.cantidad_final) * producto.precio_unitario
      totalValorizado += c.cantidad_final * producto.precio_unitario
    }
  }

  const ventaNeta = (periodo.venta_bruta - periodo.anulaciones) / (1 + ivaPct)
  return {
    ventaNeta,
    totalComprado,
    totalConsumoMonto,
    totalValorizado,
    pctCompra: ventaNeta > 0 ? totalComprado / ventaNeta : null,
    pctConsumo: ventaNeta > 0 ? totalConsumoMonto / ventaNeta : null,
  }
}

/**
 * Estilo de fila para las tablas de comparación por categoría (Stock y Análisis):
 * colorea toda la fila, no solo la celda de diferencia, para que se lea de un vistazo
 * — igual que el resaltado verde/naranja del Excel original. Diferencia positiva
 * significa que el % de consumo subió respecto al período comparado (peor); negativa,
 * que bajó (mejor).
 */
export function filaComparacionEstilo(diferencia: number | null): { background: string; borderLeft: string } | undefined {
  if (diferencia === null || diferencia === 0) return undefined
  return diferencia > 0
    ? { background: 'rgba(220, 38, 38, 0.09)', borderLeft: '3px solid var(--rc-danger)' }
    : { background: 'rgba(22, 163, 74, 0.09)', borderLeft: '3px solid var(--rc-success)' }
}

export interface ConsumoTeoricoResultado {
  porCategoria: Map<string, number>
  recetasConVentasCargadas: number
  recetasTotales: number
}

/**
 * Consumo teórico por categoría según lo efectivamente vendido de cada Receta
 * (cargado en Forense: receta_ventas_periodo) × los ingredientes de cada Receta.
 * Incluye la cobertura de carga (cuántas Recetas del sector tienen ventas
 * cargadas para este período) para poder avisar si el número es parcial.
 */
export async function calcularConsumoTeoricoPorCategoria(periodo: { id: string; venue: string }): Promise<ConsumoTeoricoResultado> {
  const [{ data: ventas }, { count: recetasTotales }] = await Promise.all([
    supabase.from('receta_ventas_periodo').select('receta_id, unidades_vendidas').eq('periodo_id', periodo.id),
    supabase.from('recetas').select('id', { count: 'exact', head: true }).eq('venue', periodo.venue),
  ])

  const unidadesPorReceta = new Map((ventas ?? []).map((v) => [v.receta_id, v.unidades_vendidas]))
  const recetaIds = [...unidadesPorReceta.keys()]

  if (recetaIds.length === 0) {
    return { porCategoria: new Map(), recetasConVentasCargadas: 0, recetasTotales: recetasTotales ?? 0 }
  }

  const { data: ingredientes } = await supabase
    .from('receta_ingredientes')
    .select('parent_id, insumo_id, cantidad_usada')
    .eq('insumo_type', 'producto')
    .in('parent_id', recetaIds)

  const productoIds = [...new Set((ingredientes ?? []).map((i) => i.insumo_id))]
  const { data: productos } = productoIds.length
    ? await supabase.from('productos').select('id, categoria, precio_unitario').in('id', productoIds)
    : { data: [] as { id: string; categoria: string | null; precio_unitario: number }[] }
  const productoById = new Map((productos ?? []).map((p) => [p.id, p]))

  const porCategoria = new Map<string, number>()
  for (const ing of ingredientes ?? []) {
    const producto = productoById.get(ing.insumo_id)
    if (!producto) continue
    const unidadesVendidas = unidadesPorReceta.get(ing.parent_id) ?? 0
    const costo = ing.cantidad_usada * unidadesVendidas * producto.precio_unitario
    const cat = producto.categoria || SIN_CATEGORIA
    porCategoria.set(cat, (porCategoria.get(cat) ?? 0) + costo)
  }

  return { porCategoria, recetasConVentasCargadas: recetaIds.length, recetasTotales: recetasTotales ?? 0 }
}
