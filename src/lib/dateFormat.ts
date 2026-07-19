/** "2026-07-06" -> "06/07/2026". Trabaja con el string tal cual (sin pasar por
 * Date/timezone) para evitar que una fecha "pura" (sin hora) corra un día
 * según la zona horaria del navegador. */
export function formatFechaAR(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  if (!y || !m || !d) return iso
  return `${d}/${m}/${y}`
}

/** "2026-07-06" + "2026-07-12" -> "06/07/2026 al 12/07/2026" */
export function formatRangoFechasAR(desde: string, hasta: string): string {
  return `${formatFechaAR(desde)} al ${formatFechaAR(hasta)}`
}
