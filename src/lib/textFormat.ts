/** "ACEITE DE OLIVA" | "aceite de oliva" -> "Aceite de oliva" */
export function toSentenceCase(value: string): string
export function toSentenceCase(value: string | null): string | null
export function toSentenceCase(value: string | null): string | null {
  if (value === null) return null
  const trimmed = value.trim()
  if (!trimmed) return trimmed
  const lower = trimmed.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

const UNIDAD_SINONIMOS: Record<string, string> = {
  GR: 'GR',
  GRS: 'GR',
  UN: 'UN',
  'UNI.': 'UN',
  UNI: 'UN',
  'UN.': 'UN',
  ML: 'ML',
}

/** "gr" | "GRS" | "uni." -> "GR" / "UN" (mayúsculas, sinónimos unificados) */
export function normalizeUnidad(value: string): string {
  const upper = value.trim().toUpperCase()
  if (!upper) return upper
  return UNIDAD_SINONIMOS[upper] ?? upper
}
