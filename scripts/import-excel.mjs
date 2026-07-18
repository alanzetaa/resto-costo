// RestoCosto — Fase 1: importa Rubros, Productos, Madres y Recetas
// desde el Excel maestro a Supabase. Corre una sola vez, localmente.
//
// Uso: npm run import-excel
// Requiere SUPABASE_URL y SUPABASE_SECRET_KEY en .env.local

import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const EXCEL_PATH = path.join(os.homedir(), 'Desktop', 'RECETAS BAR ULTIMA 21-02-2024 ENERO 2024 LISTA 3.xlsx')

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY

if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
  console.error('Faltan SUPABASE_URL y/o SUPABASE_SECRET_KEY en .env.local')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
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

function chunk(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function insertBatched(table, rows, chunkSize = 300) {
  for (const batch of chunk(rows, chunkSize)) {
    if (batch.length === 0) continue
    const { error } = await supabase.from(table).insert(batch)
    if (error) throw new Error(`Insert en ${table} falló: ${error.message}`)
  }
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
    const codeCell = ws[`A${r}`]
    const qtyCell = ws[`C${r}`]
    const code = clean(codeCell?.v)
    const qty = num(qtyCell?.v)
    if (!code || qty === null) continue
    lines.push({ code, cantidad: qty })
  }
  return lines
}

async function main() {
  console.log('Leyendo', EXCEL_PATH)
  const wb = XLSX.readFile(EXCEL_PATH, { cellFormula: false })

  // --- Guard: evita reimportar sobre datos existentes ---
  const { count: existingRubros, error: guardError } = await supabase
    .from('rubros')
    .select('id', { count: 'exact', head: true })
  if (guardError) throw new Error('No se pudo verificar el estado de la base: ' + guardError.message)
  if ((existingRubros ?? 0) > 0) {
    console.error('Ya hay datos en "rubros" — el import no corre para evitar duplicar todo. Truncá las tablas primero si querés reimportar.')
    process.exit(1)
  }

  // --- Listas de precio ya sembradas en 0003 ---
  const { data: listasRows, error: listasError } = await supabase.from('listas_precio').select('id, codigo')
  if (listasError) throw new Error(listasError.message)
  const listaIdByCodigo = new Map(listasRows.map((l) => [l.codigo, l.id]))
  const listaCodigos = ['LISTA_1', 'LISTA_2', 'LISTA_3', 'LISTA_4']
  if (!listaCodigos.every((c) => listaIdByCodigo.has(c))) {
    throw new Error('Faltan las listas_precio LISTA_1..4. ¿Corriste la migración 0003?')
  }

  // ============================================================
  // 1) RUBROS
  // ============================================================
  console.log('\n--- Rubros ---')
  const rubrosWs = wb.Sheets['rubros']
  const rubrosRows = XLSX.utils.sheet_to_json(rubrosWs, { header: 1, defval: null })
  const rubrosToInsert = []
  const objetivosBySourceRow = []
  for (let i = 1; i < rubrosRows.length; i++) {
    const row = rubrosRows[i]
    const codigo = clean(row[0])
    const descripcion = clean(row[1])
    if (!codigo || !descripcion) continue
    rubrosToInsert.push({ codigo, descripcion })
    objetivosBySourceRow.push({
      codigo,
      pcts: [num(row[2]), num(row[3]), num(row[4]), num(row[5])],
    })
  }

  const { data: insertedRubros, error: rubrosError } = await supabase
    .from('rubros')
    .insert(rubrosToInsert)
    .select('id, codigo')
  if (rubrosError) throw new Error('Insert rubros: ' + rubrosError.message)
  const rubroIdByCodigo = new Map(insertedRubros.map((r) => [r.codigo, r.id]))
  console.log('Rubros insertados:', insertedRubros.length)

  const objetivoRows = []
  for (const { codigo, pcts } of objetivosBySourceRow) {
    const rubroId = rubroIdByCodigo.get(codigo)
    if (!rubroId) continue
    pcts.forEach((pct, idx) => {
      if (pct === null) return
      objetivoRows.push({ rubro_id: rubroId, lista_id: listaIdByCodigo.get(listaCodigos[idx]), food_cost_pct: pct })
    })
  }
  await insertBatched('rubro_lista_objetivo', objetivoRows)
  console.log('Objetivos de food cost insertados:', objetivoRows.length)

  // ============================================================
  // 2) PRODUCTOS
  // ============================================================
  console.log('\n--- Productos ---')
  const productosWs = wb.Sheets['productos']
  const productosRows = XLSX.utils.sheet_to_json(productosWs, { header: 1, defval: null })
  const seenCodes = new Map()
  const productosToInsert = []
  const dupesReport = []

  for (let i = 1; i < productosRows.length; i++) {
    const row = productosRows[i]
    const rawCodigo = clean(row[0])
    if (!rawCodigo) continue
    const key = norm(rawCodigo)
    const timesSeen = (seenCodes.get(key) ?? 0) + 1
    seenCodes.set(key, timesSeen)

    let codigo = rawCodigo
    if (timesSeen > 1) {
      codigo = `${rawCodigo}__dup${timesSeen}`
      dupesReport.push(codigo)
    }

    productosToInsert.push({
      codigo,
      descripcion: clean(row[1]) ?? codigo,
      proveedor: clean(row[2]),
      precio_compra: num(row[3]) ?? 0,
      descuento_pct: num(row[4]) ?? 0,
      unidad: clean(row[6]) ?? '-',
      cantidad_envase: num(row[7]) ?? 1,
      categoria: clean(row[9]),
      precio_anterior: num(row[10]),
      _isCanonical: timesSeen === 1,
      _normCode: key,
    })
  }

  const productoIdByNormCode = new Map()
  for (const batch of chunk(productosToInsert, 300)) {
    const payload = batch.map(({ _isCanonical, _normCode, ...rest }) => rest)
    const { data, error } = await supabase.from('productos').insert(payload).select('id, codigo')
    if (error) throw new Error('Insert productos: ' + error.message)
    const byCodigo = new Map(data.map((p) => [p.codigo, p.id]))
    for (const row of batch) {
      if (!row._isCanonical) continue
      const id = byCodigo.get(row.codigo)
      if (id) productoIdByNormCode.set(row._normCode, id)
    }
  }
  console.log('Productos insertados:', productosToInsert.length, '| códigos duplicados:', dupesReport.length)
  if (dupesReport.length) console.log('  Duplicados (sufijo __dupN):', dupesReport.join(', '))

  // ============================================================
  // 3) MADRES (preparaciones)
  // ============================================================
  console.log('\n--- Madres ---')
  const madreSheets = [
    ...wb.SheetNames.filter((n) => /^M\d+$/.test(n)).map((n) => ({ name: n, venue: 'bar' })),
    ...wb.SheetNames.filter((n) => /^MR\d+$/.test(n)).map((n) => ({ name: n, venue: 'resto' })),
  ]

  const orphanIngredients = []
  const preparacionIngredientesRows = []
  let madresInsertadas = 0

  for (const { name, venue } of madreSheets) {
    const ws = wb.Sheets[name]
    const nombre = clean(ws['B1']?.v)
    if (!nombre) continue
    const rubroCodigo = clean(ws['F1']?.v)
    const rubroId = rubroCodigo ? rubroIdByCodigo.get(rubroCodigo) : null
    const { cantidad, unidad } = parseRendimiento(ws)

    const { data: prep, error: prepError } = await supabase
      .from('preparaciones')
      .insert({
        nombre,
        venue,
        rendimiento_cantidad: cantidad,
        rendimiento_unidad: unidad,
        rubro_id: rubroId,
      })
      .select('id')
      .single()
    if (prepError) throw new Error(`Insert preparacion (${name}): ${prepError.message}`)
    madresInsertadas++

    for (const line of readIngredientLines(ws)) {
      const productoId = productoIdByNormCode.get(norm(line.code))
      if (!productoId) {
        orphanIngredients.push({ sheet: name, code: line.code, tipo: 'madre' })
        continue
      }
      preparacionIngredientesRows.push({
        parent_id: prep.id,
        insumo_type: 'producto',
        insumo_id: productoId,
        cantidad_usada: line.cantidad,
      })
    }
  }
  await insertBatched('preparacion_ingredientes', preparacionIngredientesRows)
  console.log('Madres insertadas:', madresInsertadas, '| líneas de ingrediente:', preparacionIngredientesRows.length)

  // ============================================================
  // 4) RECETAS
  // ============================================================
  console.log('\n--- Recetas ---')
  const recetaSheets = [
    ...wb.SheetNames.filter((n) => /^P\d+$/.test(n)).map((n) => ({ name: n, venue: 'bar' })),
    ...wb.SheetNames.filter((n) => /^R\d+$/.test(n)).map((n) => ({ name: n, venue: 'resto' })),
  ]

  const recetaIngredientesRows = []
  let recetasInsertadas = 0

  for (const { name, venue } of recetaSheets) {
    const ws = wb.Sheets[name]
    const nombre = clean(ws['B1']?.v)
    if (!nombre) continue
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
      })
      .select('id')
      .single()
    if (recetaError) throw new Error(`Insert receta (${name}): ${recetaError.message}`)
    recetasInsertadas++

    for (const line of readIngredientLines(ws)) {
      const productoId = productoIdByNormCode.get(norm(line.code))
      if (!productoId) {
        orphanIngredients.push({ sheet: name, code: line.code, tipo: 'receta' })
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
  await insertBatched('receta_ingredientes', recetaIngredientesRows)
  console.log('Recetas insertadas:', recetasInsertadas, '| líneas de ingrediente:', recetaIngredientesRows.length)

  // ============================================================
  // RESUMEN
  // ============================================================
  console.log('\n=== Resumen ===')
  console.log('Rubros:', insertedRubros.length)
  console.log('Productos:', productosToInsert.length, '(duplicados:', dupesReport.length, ')')
  console.log('Madres:', madresInsertadas)
  console.log('Recetas:', recetasInsertadas)
  console.log('Ingredientes huérfanos (código no encontrado en productos):', orphanIngredients.length)
  if (orphanIngredients.length) {
    console.log('  Primeros 40:')
    orphanIngredients.slice(0, 40).forEach((o) => console.log(`  - [${o.tipo}] ${o.sheet}: código "${o.code}"`))
    if (orphanIngredients.length > 40) console.log(`  ...y ${orphanIngredients.length - 40} más.`)
  }
  console.log('\nListo.')
}

main().catch((err) => {
  console.error('\nError durante el import:', err.message)
  process.exit(1)
})
