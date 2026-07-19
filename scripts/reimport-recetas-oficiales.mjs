// RestoCosto — reemplaza TODAS las Recetas actuales por únicamente las que
// figuran en las 2 listas "oficiales" del Excel (LISTA RESTO ULTIMA para R#,
// LISTA CAFE ULTIMA para P#). Guarda el código de origen (codigo_origen) para
// poder rastrear de qué solapa vino cada una.
//
// Uso: npm run reimport-recetas
// Requiere que la migración 0006 (recetas.codigo_origen) ya esté corrida.

import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const EXCEL_PATH = path.join(os.homedir(), 'Desktop', 'RECETAS BAR ULTIMA 21-02-2024 ENERO 2024 LISTA 3.xlsx')
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const norm = (v) => (v ?? '').toString().trim().toUpperCase()
const clean = (v) => {
  const s = (v ?? '').toString().trim()
  return s === '' ? null : s
}
const num = (v) => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(v.toString().replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function toSentenceCase(value) {
  const trimmed = (value ?? '').toString().trim()
  if (!trimmed) return trimmed
  const lower = trimmed.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

function parseRendimiento(ws) {
  const i2 = ws['I2']?.v
  const j2 = ws['J2']?.v
  if (!i2 || norm(i2) !== 'RINDE' || !j2) return { cantidad: null, unidad: null }
  const text = j2.toString().trim()
  const match = text.match(/^([\d.,]+)\s*(.*)$/)
  if (!match) return { cantidad: null, unidad: text || null }
  return { cantidad: num(match[1]), unidad: match[2].trim() || null }
}

function readIngredientLines(ws) {
  const lines = []
  for (let r = 3; r <= 24; r++) {
    const code = clean(ws[`A${r}`]?.v)
    const qty = num(ws[`C${r}`]?.v)
    if (!code || qty === null) continue
    lines.push({ code, cantidad: qty })
  }
  return lines
}

function getOfficialCodes(sheetName) {
  const ws = XLSX.readFile(EXCEL_PATH).Sheets[sheetName]
  const range = XLSX.utils.decode_range(ws['!ref'])
  const codes = new Set()
  for (let r = 1; r <= range.e.r; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: 0 })]
    if (!cell || !cell.v) continue
    const code = cell.v.toString().trim()
    if (/^[A-Z]+\d+$/.test(code)) codes.add(code)
  }
  return codes
}

async function main() {
  console.log('Leyendo', EXCEL_PATH)
  const wb = XLSX.readFile(EXCEL_PATH)

  const oficialR = getOfficialCodes('LISTA RESTO ULTIMA')
  const oficialP = getOfficialCodes('LISTA CAFE ULTIMA')
  console.log('Códigos oficiales: R =', oficialR.size, '| P =', oficialP.size)

  // --- Mapa de rubros ---
  const { data: rubrosData } = await supabase.from('rubros').select('id, codigo')
  const rubroIdByCodigo = new Map((rubrosData ?? []).map((r) => [r.codigo, r.id]))

  // --- Mapa de productos (para resolver ingredientes) ---
  const { data: productosData } = await supabase.from('productos').select('id, codigo')
  const productoIdByNormCode = new Map((productosData ?? []).map((p) => [norm(p.codigo), p.id]))

  // --- Borra TODAS las recetas actuales (cascada limpia receta_ingredientes solas) ---
  const { error: deleteError } = await supabase.from('recetas').delete().not('id', 'is', null)
  if (deleteError) throw new Error('No se pudo borrar recetas existentes: ' + deleteError.message)
  console.log('Recetas anteriores borradas.')

  const sheets = [
    ...[...oficialP].map((n) => ({ name: n, venue: 'bar' })),
    ...[...oficialR].map((n) => ({ name: n, venue: 'resto' })),
  ]

  const orphanIngredients = []
  const recetaIngredientesRows = []
  let insertadas = 0

  for (const { name, venue } of sheets) {
    const ws = wb.Sheets[name]
    if (!ws) {
      console.warn(`  Aviso: la solapa "${name}" está en la lista oficial pero no existe en el Excel. Se saltea.`)
      continue
    }
    const nombre = toSentenceCase(clean(ws['B1']?.v) ?? name)
    const rubroCodigo = clean(ws['F1']?.v)
    const rubroId = rubroCodigo ? rubroIdByCodigo.get(rubroCodigo) : null
    const { cantidad, unidad } = parseRendimiento(ws)

    const { data: receta, error: recetaError } = await supabase
      .from('recetas')
      .insert({
        nombre,
        venue,
        rendimiento_cantidad: cantidad,
        rendimiento_unidad: unidad,
        rubro_id: rubroId,
        codigo_origen: name,
      })
      .select('id')
      .single()
    if (recetaError) throw new Error(`Insert receta (${name}): ${recetaError.message}`)
    insertadas++

    for (const line of readIngredientLines(ws)) {
      const productoId = productoIdByNormCode.get(norm(line.code))
      if (!productoId) {
        orphanIngredients.push({ sheet: name, code: line.code })
        continue
      }
      recetaIngredientesRows.push({
        parent_id: receta.id,
        insumo_type: 'producto',
        insumo_id: productoId,
        cantidad_usada: line.cantidad,
      })
    }
  }

  for (let i = 0; i < recetaIngredientesRows.length; i += 300) {
    const batch = recetaIngredientesRows.slice(i, i + 300)
    const { error } = await supabase.from('receta_ingredientes').insert(batch)
    if (error) throw new Error('Insert receta_ingredientes: ' + error.message)
  }

  console.log('\n=== Resumen ===')
  console.log('Recetas oficiales insertadas:', insertadas)
  console.log('Líneas de ingrediente:', recetaIngredientesRows.length)
  console.log('Ingredientes huérfanos:', orphanIngredients.length)
  console.log('\nListo.')
}

main().catch((err) => {
  console.error('\nError:', err.message)
  process.exit(1)
})
