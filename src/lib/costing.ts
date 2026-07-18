export interface IngredienteCosteo {
  cantidad_usada: number
  precio_unitario: number
}

export interface ObjetivoLista {
  lista_id: string
  lista_codigo: string
  lista_nombre: string
  food_cost_pct: number | null
}

export interface ResultadoLista extends ObjetivoLista {
  precio_sugerido: number | null
}

export interface ResultadoCosteo {
  subtotal: number
  scrapMonto: number
  totalConMerma: number
  porLista: ResultadoLista[]
}

interface CalcularCosteoInput {
  ingredientes: IngredienteCosteo[]
  mermaPct: number
  ivaPct: number
  objetivos: ObjetivoLista[]
}

function redondear1(x: number): number {
  return Math.round(x * 10) / 10
}

function techoMedio(x: number): number {
  return Math.ceil(x / 0.5) * 0.5
}

export function precioSugerido(totalConMerma: number, foodCostPct: number, ivaPct: number): number | null {
  if (!foodCostPct || foodCostPct <= 0) return null
  const bruto = (totalConMerma / foodCostPct) * (1 + ivaPct)
  return techoMedio(redondear1(bruto))
}

export function calcularCosteo({ ingredientes, mermaPct, ivaPct, objetivos }: CalcularCosteoInput): ResultadoCosteo {
  const subtotal = ingredientes.reduce((sum, i) => sum + i.cantidad_usada * i.precio_unitario, 0)
  const scrapMonto = subtotal * mermaPct
  const totalConMerma = subtotal + scrapMonto

  const porLista: ResultadoLista[] = objetivos.map((o) => ({
    ...o,
    precio_sugerido: o.food_cost_pct !== null ? precioSugerido(totalConMerma, o.food_cost_pct, ivaPct) : null,
  }))

  return { subtotal, scrapMonto, totalConMerma, porLista }
}
