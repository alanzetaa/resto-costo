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
