// RestoCosto — normaliza a "Primera mayúscula, resto minúscula" los campos de
// texto libre ya cargados (descripciones/nombres), para que no queden mezclados
// MAYÚSCULA / Título / minúscula como venían del Excel. Idempotente: se puede
// correr las veces que haga falta.
//
// Uso: npm run normalize-text

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function toSentenceCase(value) {
  if (value === null || value === undefined) return value
  const trimmed = value.toString().trim()
  if (!trimmed) return trimmed
  const lower = trimmed.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

async function normalizeTable(table, fields) {
  const { data, error } = await supabase.from(table).select(['id', ...fields].join(', '))
  if (error) throw new Error(`Leer ${table}: ${error.message}`)

  let updated = 0
  for (const row of data ?? []) {
    const patch = {}
    for (const field of fields) {
      const original = row[field]
      if (typeof original !== 'string') continue
      const normalized = toSentenceCase(original)
      if (normalized !== original) patch[field] = normalized
    }
    if (Object.keys(patch).length === 0) continue
    const { error: updateError } = await supabase.from(table).update(patch).eq('id', row.id)
    if (updateError) {
      console.error(`  Error actualizando ${table} ${row.id}:`, updateError.message)
      continue
    }
    updated++
  }
  console.log(`${table}: ${updated} de ${data?.length ?? 0} filas actualizadas`)
}

async function main() {
  await normalizeTable('productos', ['descripcion', 'proveedor', 'categoria'])
  await normalizeTable('preparaciones', ['nombre'])
  await normalizeTable('recetas', ['nombre'])
  await normalizeTable('rubros', ['descripcion'])
  console.log('\nListo.')
}

main().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
