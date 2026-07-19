// RestoCosto — carga datos de DEMOSTRACIÓN para poder ver el módulo de
// Compras/Stock/Análisis funcionando con resultados reales: 2 semanas
// consecutivas para Bar y 2 para Resto, con conteos, compras, ventas por
// receta (para el análisis teórico/forense) y descuentos.
//
// Son datos de prueba con proporciones realistas (no reales) — se pueden
// borrar en cualquier momento desde la plataforma si se quiere arrancar
// de cero con datos genuinos.
//
// Uso: npm run seed-demo-analisis

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// PRNG determinístico para que los datos sean reproducibles
let seed = 42
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}
function randInt(min, max) {
  return Math.floor(min + rand() * (max - min + 1))
}
function pick(arr) {
  return arr[randInt(0, arr.length - 1)]
}

function toISO(d) {
  return d.toISOString().slice(0, 10)
}
function addDays(d, n) {
  const nd = new Date(d)
  nd.setDate(nd.getDate() + n)
  return nd
}
function lastMonday(offsetWeeks) {
  const hoy = new Date()
  const dia = hoy.getDay()
  const diffAlLunes = (dia + 6) % 7
  const lunesActual = addDays(hoy, -diffAlLunes)
  return addDays(lunesActual, -7 * offsetWeeks)
}

const CATEGORIAS = ['Almacen', 'Carnes', 'Pescados', 'Lacteos', 'Bebidas', 'Frutas y verduras', 'Cafeteria', 'Descartables', 'Limpieza']
const PRODUCTOS_POR_CATEGORIA = 5
const AVG_TICKET = { bar: 12000, resto: 22000 }
const PCT_CONSUMO_OBJETIVO = { bar: [0.26, 0.32], resto: [0.28, 0.36] }

async function seedVenue(venue, productosPorCategoria, todosLosProductosNoMadre, proveedorIds, recetasVenue, config) {
  console.log(`\n=== ${venue.toUpperCase()} ===`)

  const semana1Inicio = lastMonday(2)
  const semana1Fin = addDays(semana1Inicio, 6)
  const semana2Inicio = addDays(semana1Fin, 1)
  const semana2Fin = addDays(semana2Inicio, 6)

  const muestra = CATEGORIAS.flatMap((cat) => (productosPorCategoria.get(cat) ?? []).slice(0, PRODUCTOS_POR_CATEGORIA))

  // --- Período 1 ---
  const { data: periodo1 } = await supabase
    .from('periodos_valorizacion')
    .insert({ venue, tipo: 'semanal', fecha_inicio: toISO(semana1Inicio), fecha_fin: toISO(semana1Fin), venta_bruta: 0, anulaciones: 0, tickets: 0, cubiertos: 0 })
    .select('id')
    .single()

  // Siembra TODOS los productos no-Madre con cantidad_inicial 0 (igual que "Nuevo período" en la app)
  const filasP1 = todosLosProductosNoMadre.map((p) => ({ periodo_id: periodo1.id, producto_id: p.id, cantidad_inicial: 0 }))
  for (let i = 0; i < filasP1.length; i += 300) await supabase.from('stock_conteos').insert(filasP1.slice(i, i + 300))

  let totalConsumoP1 = 0
  let totalCompradoP1 = 0
  const finalesP1 = new Map()

  for (const producto of muestra) {
    const inicial = randInt(8, 25)
    const cantidadComprada = randInt(10, 35)
    const montoComprado = Math.round(cantidadComprada * producto.precio_unitario * 100) / 100
    const disponible = inicial + cantidadComprada
    const consumoFraccion = randInt(60, 88) / 100
    const consumo = Math.round(disponible * consumoFraccion)
    const final = disponible - consumo

    await supabase.from('stock_conteos').update({ cantidad_inicial: inicial, cantidad_final: final }).eq('periodo_id', periodo1.id).eq('producto_id', producto.id)
    await supabase.from('compras').insert({
      proveedor_id: pick(proveedorIds),
      producto_id: producto.id,
      venue,
      fecha: toISO(addDays(semana1Inicio, randInt(0, 6))),
      cantidad: cantidadComprada,
      monto: montoComprado,
    })

    totalConsumoP1 += consumo * producto.precio_unitario
    totalCompradoP1 += montoComprado
    finalesP1.set(producto.id, final)
  }

  const [pctMin1, pctMax1] = PCT_CONSUMO_OBJETIVO[venue]
  const pctConsumoObjetivo1 = pctMin1 + rand() * (pctMax1 - pctMin1)
  const ventaNeta1 = totalConsumoP1 / pctConsumoObjetivo1
  const ventaBruta1 = Math.round(ventaNeta1 * (1 + config.iva_pct) * 100) / 100
  const tickets1 = Math.round(ventaBruta1 / AVG_TICKET[venue])
  const anulaciones1 = Math.round(ventaBruta1 * 0.015 * 100) / 100

  await supabase
    .from('periodos_valorizacion')
    .update({ venta_bruta: ventaBruta1, anulaciones: anulaciones1, tickets: tickets1, cubiertos: Math.round(tickets1 * 1.3) })
    .eq('id', periodo1.id)

  console.log(`Período 1: ${toISO(semana1Inicio)} al ${toISO(semana1Fin)} | venta_bruta=${ventaBruta1.toFixed(0)} | comprado=${totalCompradoP1.toFixed(0)} | consumo=${totalConsumoP1.toFixed(0)}`)

  // --- Período 2 (arrastra inicial del final del período 1) ---
  const { data: periodo2 } = await supabase
    .from('periodos_valorizacion')
    .insert({ venue, tipo: 'semanal', fecha_inicio: toISO(semana2Inicio), fecha_fin: toISO(semana2Fin), venta_bruta: 0, anulaciones: 0, tickets: 0, cubiertos: 0 })
    .select('id')
    .single()

  const filasP2 = todosLosProductosNoMadre.map((p) => ({ periodo_id: periodo2.id, producto_id: p.id, cantidad_inicial: finalesP1.get(p.id) ?? 0 }))
  for (let i = 0; i < filasP2.length; i += 300) await supabase.from('stock_conteos').insert(filasP2.slice(i, i + 300))

  let totalConsumoP2 = 0
  let totalCompradoP2 = 0

  for (const producto of muestra) {
    const inicial = finalesP1.get(producto.id) ?? 0
    const cantidadComprada = randInt(10, 35)
    const montoComprado = Math.round(cantidadComprada * producto.precio_unitario * 100) / 100
    const disponible = inicial + cantidadComprada
    const consumoFraccion = randInt(55, 92) / 100
    const consumo = Math.round(disponible * consumoFraccion)
    const final = Math.max(0, disponible - consumo)

    await supabase.from('stock_conteos').update({ cantidad_final: final }).eq('periodo_id', periodo2.id).eq('producto_id', producto.id)
    await supabase.from('compras').insert({
      proveedor_id: pick(proveedorIds),
      producto_id: producto.id,
      venue,
      fecha: toISO(addDays(semana2Inicio, randInt(0, 6))),
      cantidad: cantidadComprada,
      monto: montoComprado,
    })

    totalConsumoP2 += consumo * producto.precio_unitario
    totalCompradoP2 += montoComprado
  }

  const [pctMin2, pctMax2] = PCT_CONSUMO_OBJETIVO[venue]
  const pctConsumoObjetivo2 = pctMin2 + rand() * (pctMax2 - pctMin2)
  const ventaNeta2 = totalConsumoP2 / pctConsumoObjetivo2
  const ventaBruta2 = Math.round(ventaNeta2 * (1 + config.iva_pct) * 100) / 100
  const tickets2 = Math.round(ventaBruta2 / AVG_TICKET[venue])
  const anulaciones2 = Math.round(ventaBruta2 * 0.015 * 100) / 100

  await supabase
    .from('periodos_valorizacion')
    .update({ venta_bruta: ventaBruta2, anulaciones: anulaciones2, tickets: tickets2, cubiertos: Math.round(tickets2 * 1.3) })
    .eq('id', periodo2.id)

  console.log(`Período 2: ${toISO(semana2Inicio)} al ${toISO(semana2Fin)} | venta_bruta=${ventaBruta2.toFixed(0)} | comprado=${totalCompradoP2.toFixed(0)} | consumo=${totalConsumoP2.toFixed(0)}`)

  // --- Ventas por receta (Forense / consumo teórico), ~15 recetas, solo período 2 ---
  const muestraRecetas = [...recetasVenue].sort(() => rand() - 0.5).slice(0, Math.min(15, recetasVenue.length))
  const filasVentas = muestraRecetas.map((r) => ({ periodo_id: periodo2.id, receta_id: r.id, unidades_vendidas: randInt(5, 45) }))
  if (filasVentas.length) await supabase.from('receta_ventas_periodo').insert(filasVentas)
  console.log(`Ventas por receta cargadas (Período 2): ${filasVentas.length} de ${recetasVenue.length} recetas de ${venue}`)

  return { periodo1, periodo2 }
}

async function main() {
  const { data: config } = await supabase.from('configuracion').select('iva_pct').single()

  const { data: productos } = await supabase.from('productos').select('id, categoria, precio_unitario').not('categoria', 'ilike', 'madre').gt('precio_unitario', 0)
  const productosPorCategoria = new Map()
  for (const p of productos ?? []) {
    const cat = p.categoria ?? 'Sin categoría'
    if (!productosPorCategoria.has(cat)) productosPorCategoria.set(cat, [])
    productosPorCategoria.get(cat).push(p)
  }

  const { data: proveedores } = await supabase.from('proveedores').select('id')
  const proveedorIds = (proveedores ?? []).map((p) => p.id)

  const { data: recetas } = await supabase.from('recetas').select('id, venue')
  const recetasPorVenue = { bar: (recetas ?? []).filter((r) => r.venue === 'bar'), resto: (recetas ?? []).filter((r) => r.venue === 'resto') }

  for (const venue of ['bar', 'resto']) {
    await seedVenue(venue, productosPorCategoria, productos ?? [], proveedorIds, recetasPorVenue[venue], config)
  }

  // --- Descuentos de muestra ---
  const personasExistentes = await supabase.from('personas_descuento').select('id, nombre')
  let personas = personasExistentes.data ?? []
  if (personas.length === 0) {
    const { data: nuevas } = await supabase
      .from('personas_descuento')
      .insert([
        { nombre: 'Socio 1', porcentaje: 0.99 },
        { nombre: 'Empleados', porcentaje: 0.15 },
      ])
      .select('id, nombre')
    personas = nuevas ?? []
  }
  const hoy = new Date()
  for (const venue of ['bar', 'resto']) {
    for (let i = 0; i < 4; i++) {
      await supabase.from('descuentos').insert({
        persona_id: pick(personas).id,
        venue,
        fecha: toISO(addDays(hoy, -randInt(1, 13))),
        cantidad_operaciones: randInt(1, 3),
        monto: randInt(3000, 25000),
      })
    }
  }
  console.log('\nDescuentos de muestra cargados.')
  console.log('\nListo. Ya podés ver resultados en /stock y /analisis para Bar y Resto.')
}

main().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
