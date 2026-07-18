// RestoCosto — genera un reporte de códigos de ingrediente que no matchean
// ningún producto cargado. Solo lectura: no modifica la base ni el Excel.
//
// Uso: npm run report-orphans

import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
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

function readIngredientLines(ws) {
  const lines = []
  for (let r = 3; r <= 24; r++) {
    const code = clean(ws[`A${r}`]?.v)
    const qty = ws[`C${r}`]?.v
    if (!code || qty === null || qty === undefined || qty === '') continue
    lines.push(code)
  }
  return lines
}

const { data: productos, error } = await supabase.from('productos').select('codigo')
if (error) throw new Error(error.message)
const productCodes = new Set(productos.map((p) => norm(p.codigo)))

const wb = XLSX.readFile(EXCEL_PATH)
const sheets = [
  ...wb.SheetNames.filter((n) => /^M\d+$/.test(n)).map((n) => ({ name: n, tipo: 'madre' })),
  ...wb.SheetNames.filter((n) => /^MR\d+$/.test(n)).map((n) => ({ name: n, tipo: 'madre' })),
  ...wb.SheetNames.filter((n) => /^P\d+$/.test(n)).map((n) => ({ name: n, tipo: 'receta' })),
  ...wb.SheetNames.filter((n) => /^R\d+$/.test(n)).map((n) => ({ name: n, tipo: 'receta' })),
]

const missingByCode = new Map()
for (const { name, tipo } of sheets) {
  const ws = wb.Sheets[name]
  const nombre = clean(ws['B1']?.v) ?? name
  for (const code of readIngredientLines(ws)) {
    if (productCodes.has(norm(code))) continue
    const key = norm(code)
    if (!missingByCode.has(key)) missingByCode.set(key, { code, usos: [] })
    missingByCode.get(key).usos.push(`${tipo} ${name} (${nombre})`)
  }
}

const rows = [...missingByCode.values()].sort((a, b) => b.usos.length - a.usos.length)

const lines = [
  `Códigos de ingrediente sin match en productos: ${rows.length}`,
  `Total de líneas afectadas: ${rows.reduce((sum, r) => sum + r.usos.length, 0)}`,
  '',
]
for (const r of rows) {
  lines.push(`${r.code}  (usado ${r.usos.length} veces)`)
  for (const u of r.usos) lines.push(`    - ${u}`)
}

const outPath = path.join(__dirname, 'reports', 'ingredientes-huerfanos.txt')
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, lines.join('\n'), 'utf-8')
console.log('Reporte guardado en', outPath)
console.log(`${rows.length} códigos distintos sin match, ${rows.reduce((s, r) => s + r.usos.length, 0)} líneas afectadas.`)
