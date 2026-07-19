// RestoCosto — completa datos faltantes para poder probar Compras/Stock de punta a punta:
// 1) Carga como Proveedores todos los nombres que ya estaban como texto libre en productos.proveedor.
// 2) Agrega los ~28 productos de Limpieza reales del Excel de gestión (categoría que no existía).
// Los precios en $0 en el Excel original se completan con un valor estimado razonable (pedido
// explícito del usuario para poder cerrar el ciclo de prueba).
//
// Uso: npm run seed-limpieza

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
  const trimmed = (value ?? '').toString().trim()
  if (!trimmed) return trimmed
  const lower = trimmed.toLowerCase()
  return lower.charAt(0).toUpperCase() + lower.slice(1)
}

// [descripcion, unidad, precio (null = inventar), proveedor]
const LIMPIEZA = [
  ['Abrillantador', 'LTS', null, 'Dispeko'],
  ['Alcohol sanitizante diluyente 70%', 'BIDON', 338.8, 'Dispeko'],
  ['Blem muebles', 'UN', null, 'Dispeko'],
  ['Bobina papel tissue (doble hoja) 24x400', 'UN', 3781.86, 'Dispeko'],
  ['Bolsa basura negra 90x120', 'UN', 74.16, 'Dispeko'],
  ['Bolsa basura verde 90x120 (paq x 50 un)', 'UN', 69.3, 'Dispeko'],
  ['Papel higienico elegante (personal) pack', 'PAQ', 5091.07, 'Dispeko'],
  ['Descarbonizante', 'BIDON', 1990.45, 'Dispeko'],
  ['Desodorante antibacterial (aromatizante)', 'BIDON', 1948.1, 'Dispeko'],
  ['Delantal pvc bacha', 'UN', null, 'Dispeko'],
  ['Trapo rejilla profesional', 'UN', 531.43, 'Dispeko'],
  ['Detergente lavavajilla concentrado', 'BIDON', 2541, 'Dispeko'],
  ['Escobillon', 'UN', null, 'Dispeko'],
  ['Fibra esponja grande', 'UN', 427.98, 'Dispeko'],
  ['Fibra fuerte parrillera', 'UN', 393, 'Dispeko'],
  ['Limpiador 3m clearx 900cc', 'UN', 1123.11, 'Dispeko'],
  ['Lavandina (hipoclorito de sodio)', 'BIDON', 1249.33, 'Dispeko'],
  ['Jabon liquido para manos (nacarado)', 'BIDON', null, 'Dispeko'],
  ['Strong desengrasante', 'BIDON', 3583.8, 'Dispeko'],
  ['Limpiador cremoso', 'UN', null, 'Dispeko'],
  ['Paño absorbente amarillo', 'UN', 111.08, 'Dispeko'],
  ['Papel higienico 300mts x8 uni extra blanco (salon)', 'UN', null, 'Dispeko'],
  ['Cazuela dip aluminio picadas', 'UN', null, 'Dispeko'],
  ['Secador de pisos', 'UN', null, 'Dispeko'],
  ['Secador de vidrios', 'UN', null, 'Dispeko'],
  ['Toalla intercalada (10 pack x 2500u)', 'CAJA', 8185.5, 'Dispeko'],
  ['Gatillo envase transparente 500cc', 'UN', null, 'Moop'],
  ['Trapo de pisos gris', 'UN', null, 'Dispeko'],
]

// Precios estimados para los que venían en $0 en el Excel (pedido del usuario: "inventalo")
const PRECIO_ESTIMADO = {
  Abrillantador: 2500,
  'Blem muebles': 3200,
  'Delantal pvc bacha': 4500,
  Escobillon: 1800,
  'Jabon liquido para manos (nacarado)': 3800,
  'Limpiador cremoso': 1500,
  'Papel higienico 300mts x8 uni extra blanco (salon)': 9500,
  'Cazuela dip aluminio picadas': 150,
  'Secador de pisos': 3200,
  'Secador de vidrios': 2800,
  'Gatillo envase transparente 500cc': 650,
  'Trapo de pisos gris': 900,
}

function codigoDesde(descripcion, usados) {
  const base = descripcion
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .split(' ')
    .filter(Boolean)
  let codigo = (base[0]?.slice(0, 3) ?? 'PRD') + (base[1]?.slice(0, 2) ?? '')
  codigo = codigo.slice(0, 8)
  let final = codigo
  let n = 2
  while (usados.has(final)) {
    final = `${codigo}${n}`
    n++
  }
  usados.add(final)
  return final
}

async function main() {
  // 1) Proveedores desde productos.proveedor existente
  const { data: productosData } = await supabase.from('productos').select('proveedor')
  const nombresProveedores = new Set(
    (productosData ?? [])
      .map((p) => (p.proveedor ?? '').trim())
      .filter(Boolean)
      .map((n) => toSentenceCase(n)),
  )
  for (const nombre of ['Dispeko', 'Moop']) nombresProveedores.add(nombre)

  const { data: existentes } = await supabase.from('proveedores').select('nombre')
  const yaExisten = new Set((existentes ?? []).map((p) => p.nombre))
  const nuevosProveedores = [...nombresProveedores].filter((n) => !yaExisten.has(n)).map((nombre) => ({ nombre }))

  if (nuevosProveedores.length) {
    const { error } = await supabase.from('proveedores').insert(nuevosProveedores)
    if (error) throw new Error('Insert proveedores: ' + error.message)
  }
  console.log(`Proveedores: ${nuevosProveedores.length} nuevos (de ${nombresProveedores.size} totales detectados).`)

  // 2) Productos de Limpieza
  const { data: codigosExistentes } = await supabase.from('productos').select('codigo')
  const usados = new Set((codigosExistentes ?? []).map((p) => p.codigo.toUpperCase()))

  const filas = LIMPIEZA.map(([descripcion, unidad, precio, proveedor]) => ({
    codigo: codigoDesde(descripcion, usados),
    descripcion: toSentenceCase(descripcion),
    proveedor,
    precio_compra: precio ?? PRECIO_ESTIMADO[descripcion] ?? 1000,
    descuento_pct: 0,
    unidad,
    cantidad_envase: 1,
    categoria: 'Limpieza',
  }))

  const { data: inserted, error: insertError } = await supabase.from('productos').insert(filas).select('id, codigo, descripcion')
  if (insertError) throw new Error('Insert productos limpieza: ' + insertError.message)
  console.log(`Productos de Limpieza insertados: ${inserted?.length ?? 0}`)
  for (const p of inserted ?? []) console.log(`  ${p.codigo} — ${p.descripcion}`)
}

main().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
