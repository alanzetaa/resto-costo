// RestoCosto — estandariza productos.unidad: mayúsculas + sinónimos unificados
// (GR/GRS/gr/grs -> GR, UN/uni./un. -> UN, ML/ml -> ML). Idempotente.
//
// Uso: npm run normalize-unidades

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const SINONIMOS = {
  GR: 'GR',
  GRS: 'GR',
  UN: 'UN',
  'UNI.': 'UN',
  UNI: 'UN',
  'UN.': 'UN',
  ML: 'ML',
}

function normalizarUnidad(raw) {
  const upper = raw.trim().toUpperCase()
  return SINONIMOS[upper] ?? upper
}

async function main() {
  const { data, error } = await supabase.from('productos').select('id, unidad')
  if (error) throw new Error(error.message)

  let updated = 0
  for (const row of data ?? []) {
    if (typeof row.unidad !== 'string') continue
    const normalizado = normalizarUnidad(row.unidad)
    if (normalizado === row.unidad) continue
    const { error: updateError } = await supabase.from('productos').update({ unidad: normalizado }).eq('id', row.id)
    if (updateError) {
      console.error('  Error en', row.id, updateError.message)
      continue
    }
    updated++
  }
  console.log(`productos: ${updated} de ${data?.length ?? 0} filas actualizadas`)
}

main().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
