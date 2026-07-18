# RestoCosto

Plataforma de gestión y costeo para restaurantes. Primer módulo de un sistema modular más amplio, inspirado en la experiencia de uso de [biddit.com.ar](https://biddit.com.ar) pero con identidad visual propia (gama de azules/celestes) y un dominio de negocio distinto: costeo de alimentos, recetas y listas de precio.

---

## 1. Visión

Reemplazar el archivo Excel maestro (`RECETAS BAR ULTIMA...xlsx`, ~2300 solapas... en realidad ~900 solapas y 2.3MB) por una plataforma web donde:

- Cada **Producto** (insumo comprado) tiene un precio que se actualiza y dispara en cascada el recosteo de todo lo que lo usa.
- Cada **Madre** (preparación base / sub-receta: salsas, panes, escabeches, etc.) se costea a partir de Productos **y** de otras Madres.
- Cada **Receta** (plato final de carta) se costea a partir de Productos y Madres.
- El sistema sugiere automáticamente el **precio de venta** según el food cost objetivo de cada Rubro y Lista de precios (venue/canal).
- Todo queda auditado: quién cambió qué precio y cuándo.

Nada de esto se pierde de la lógica actual del Excel — se traslada 1:a-1 a una base de datos relacional para que sea mantenible, auditable y accesible desde cualquier lugar, con permisos por usuario.

---

## 2. Relevamiento del Excel actual (lógica de negocio)

Se analizó `RECETAS BAR ULTIMA 21-02-2024 ENERO 2024 LISTA 3.xlsx` en detalle. Estructura encontrada:

| Grupo de solapas | Cantidad | Qué representa |
|---|---|---|
| `M1`...`M110` | 108 | Madres del **Bar** |
| `MR1`...`MR247` | 245 | Madres del **Resto** |
| `P1`...`P140` | 140 | Recetas (Bar / Café / Mishiguene) |
| `R1`...`R89` | 82 | Recetas del **Resto** |
| `productos` (1 solapa maestra) | 707 filas | Catálogo de insumos comprados |
| `MADRES` (1 solapa maestra) | — | Índice de todas las Madres (Bar en cols A-C, Resto en cols F-H) |
| `rubros` (1 solapa maestra) | 25 filas | Categorías de carta, con % food cost objetivo por lista |
| `scarp` (1 celda) | — | % de merma/scrap global (5%) |
| `1ER LISTA FEBRERO BAR`, `LISTA RESTO ULTIMA`, `LISTA CAFE ULTIMA`, `LISTA MISHIGUENE BAR`, `LISTA MISHIGUENE RESTO` (x2) | 6 | Reportes de precios por venue: precio sugerido vs. precio actual, food cost real |

### 2.1 Tabla maestra `productos`

Columnas: `Cod` (código único), `Descripcion`, `Proveedor`, `Precio` (precio de compra), `DES` (% descuento), `Neto` (= Precio − Precio×Descuento), `Unidad`, `Cantidad` (tamaño del envase, ej. 1000 gr), `Precio` unitario (= Neto / Cantidad → precio por gramo/ml/unidad), `Rubro`, `anterior` (precio previo, para historial), `dif` (% variación).

**Insight clave**: una Madre, una vez definida, también se carga como fila en `productos` (con su propio código y su precio-por-unidad calculado). Así puede usarse como ingrediente dentro de otra Madre o de una Receta. Esto es exactamente el patrón de "sub-recetas" que vamos a modelar con una tabla de ingredientes que admite referenciar **otro producto o otra madre**.

### 2.2 Solapa individual de Madre / Receta (todas comparten el mismo layout)

```
Nombre:  [nombre]        Rendimiento: [cantidad] [unidad] (ej "9960 GRS")
Rubro:   [código rubro] → descripción (VLOOKUP a rubros)

Código | Descripción | Cantidad usada | Unidad | Precio unitario (ref) | Precio parcial (costo/unidad) | Costo parcial
...(líneas de ingredientes, cada una referenciando un Producto o Madre por código)...

Sub Total:                     = SUMA(costos parciales)
Scrap 5%:                      = Sub Total × % merma global
Total Materia Prima s/IVA:     = Sub Total + Scrap
Food Cost Teórico Lista 1..4:  = % objetivo del Rubro para esa lista
Precio sugerido Lista 1..4:    = Total Materia Prima / Food Cost % × 1.21 (IVA 21%), redondeado hacia arriba al 0.5
```

### 2.3 Reportes de Lista de Precios (por venue)

Cada solapa `LISTA ...` agrega, para un conjunto de Recetas/Madres, columnas por lista: `% food cost objetivo`, `precio sugerido`, `precio actual` (carga manual), `diferencia $`, `diferencia %`, `food cost real` (= costo×1.21 / precio actual). Sirve para decidir aumentos de carta.

### 2.4 Fórmula de costeo (la que vamos a replicar exactamente)

```
precio_unitario_producto = (precio_compra − precio_compra × descuento) / cantidad_envase
costo_linea_ingrediente  = cantidad_usada × precio_unitario_del_ingrediente (producto o madre)
subtotal                 = Σ costo_linea_ingrediente
costo_con_merma          = subtotal × (1 + %merma_global)
precio_sugerido(lista)   = techo( redondeo( costo_con_merma / %food_cost_objetivo(rubro, lista) × 1.21 , 1 ), 0.5 )
food_cost_real           = costo_con_merma × 1.21 / precio_actual
```

---

## 3. Modelo de datos (Supabase / Postgres)

Normalizamos las ~900 solapas en tablas relacionales:

- **`rubros`**: `id`, `codigo`, `descripcion`, `food_cost_objetivo` (jsonb o tabla hija `rubro_lista_objetivo` con `rubro_id`, `lista_id`, `porcentaje`)
- **`productos`**: `id`, `codigo`, `descripcion`, `proveedor`, `precio_compra`, `descuento_pct`, `unidad`, `cantidad_envase`, `rubro_id`, `precio_anterior`, `updated_at`, `updated_by`
- **`preparaciones`** (unifica "Madres"): `id`, `nombre`, `tipo` (`madre_bar` / `madre_resto`, o simplemente `venue`), `rendimiento_cantidad`, `rendimiento_unidad`, `rubro_id`, `producto_generado_id` (FK nullable a `productos`, para cuando se usa como ingrediente de otra receta/madre)
- **`recetas`**: `id`, `nombre`, `rubro_id`, `venue` (bar/resto/café/mishiguene…), `rendimiento_cantidad`, `rendimiento_unidad`
- **`ingredientes`** (líneas de una preparación o receta): `id`, `parent_type` (`preparacion`/`receta`), `parent_id`, `insumo_type` (`producto`/`preparacion`), `insumo_id`, `cantidad_usada`
- **`listas_precio`**: `id`, `nombre` (Lista 1-4 / venue), `descripcion`
- **`precios_venta`**: `receta_id`/`preparacion_id`, `lista_id`, `precio_actual`, `updated_at`, `updated_by` — histórico de precios de venta reales
- **`configuracion`**: `merma_pct` (scrap global), `iva_pct` (21%)
- **`historial_precios`**: log inmutable de cambios de precio de productos (auditoría, ya que hoy el Excel guarda solo el "anterior")

Todos los cálculos (precio unitario, subtotal, costo con merma, precio sugerido, food cost real) se resuelven con **funciones/vistas SQL** (o cálculo en el backend), nunca hardcodeados en el frontend, para que sean consistentes en toda la plataforma.

---

## 4. Módulos / navegación (estilo biddit: sidebar de botones a la izquierda)

- **Dashboard** — resumen: alertas de precios vencidos, food cost fuera de objetivo, últimos cambios.
- **Productos** — catálogo de insumos, precios, proveedores, historial de variación.
- **Madres** — preparaciones base, por venue (Bar/Resto).
- **Recetas** — platos de carta, por venue.
- **Rubros** — categorías y % food cost objetivo por lista.
- **Listas de Precio** — comparación precio sugerido vs. precio actual, food cost real, por venue.
- **Accesos** (solo Super Admin) — alta de usuarios, asignación de rol.
- **Mi Perfil** — datos de cuenta, cambio de contraseña.

Cada uno de estos es un botón en el sidebar, igual que en biddit/piloto3.

---

## 5. Identidad visual

Paleta propia para diferenciar de biddit (que usa tonos ladrillo/gris-azulado oscuro):

| Uso | Color |
|---|---|
| Primario (acciones, botones activos) | `#2563EB` azul |
| Secundario / hover | `#3B82F6` azul medio |
| Acento claro (fondos de sección, badges) | `#38BDF8` celeste |
| Fondo general | `#F0F6FC` gris-celeste muy claro |
| Texto principal | `#0F172A` azul-negro |
| Bordes | `#CBD5E1` |
| Alertas / food cost fuera de objetivo | `#DC2626` rojo (se mantiene semántico, no azul) |
| Éxito / dentro de objetivo | `#16A34A` verde |

Layout: sidebar fijo a la izquierda con logo "RestoCosto", igual estructura de biddit (botones con ícono + label, badge de rol, logout abajo), colapsable a barra inferior en mobile.

---

## 6. Autenticación y accesos

- Pantalla pública de landing + botón **Ingresar**.
- Login con **usuario/contraseña**, **"olvidé mi contraseña"** (reset por email vía Supabase Auth) e **"Ingresar con Google"** (OAuth), igual que en biddit.
- **Super Admin**: cuenta fija vinculada a `alanzeta@gmail.com`. Es la única que ve la sección **Accesos**, donde puede:
  - Invitar nuevos usuarios por email.
  - Asignar rol/tipo de acceso a cada uno.
  - Revocar accesos.
  - Ver auditoría de acciones sensibles.
- El rol Super Admin **no se asigna desde la UI** — está fijado por email en una tabla protegida por RLS (Row Level Security) que solo el propio Super Admin (o una migración manual) puede modificar. Así, aunque alguien comprometa el panel de accesos, no puede auto-otorgarse ni robar el rol máximo.
- Roles adicionales (Admin, Editor de precios, Solo lectura, etc.) se definirán más adelante — la tabla de roles queda preparada para extenderse sin romper nada (se decidió posponer el detalle de roles intermedios).

### Flujo de login (equivalente a biddit)
1. Landing → botón "Ingresar"
2. Formulario: email + contraseña, link "¿Olvidaste tu contraseña?", botón "Ingresar con Google"
3. Tras login, redirección según rol a Dashboard con el sidebar correspondiente a sus permisos.

---

## 7. Seguridad

- **Supabase Auth** para manejo de contraseñas (hashing, tokens, expiración) — nunca se implementa hashing propio.
- **Row Level Security (RLS)** activado en todas las tablas desde el día uno: cada policy valida el rol del usuario autenticado antes de permitir SELECT/INSERT/UPDATE/DELETE.
- **Service role key** de Supabase nunca se expone al cliente ni se sube al repo — solo vive como variable de entorno server-side (Vercel Environment Variables / Supabase Edge Functions).
- **Variables de entorno**: `.env.local` en `.gitignore` desde el primer commit; `.env.example` documentando las claves necesarias sin valores reales.
- **Validación de inputs** en frontend y backend (nunca confiar solo en el cliente) — especialmente en carga de precios y Excel.
- **Rate limiting** en endpoints sensibles (login, reset password, invitación de usuarios) vía Supabase o middleware en Vercel.
- **Auditoría**: tabla `audit_log` registrando cambios de precio, alta/baja de usuarios y cambios de rol (quién, qué, cuándo, valor anterior/nuevo).
- **Principio de menor privilegio**: cada rol ve y edita solo lo que le corresponde; el Super Admin es el único con acceso a gestión de usuarios.
- **HTTPS obligatorio** (por defecto en Vercel).
- **Protección contra XSS/SQLi**: uso de queries parametrizadas de Supabase (PostgREST), sanitización de inputs, Content-Security-Policy en headers de Vercel.
- **2FA** para el Super Admin: evaluar habilitarlo como mejora futura (Supabase Auth lo soporta).
- **Backups**: Supabase provee backups automáticos; documentar plan de recuperación.

---

## 8. Stack técnico

| Capa | Tecnología |
|---|---|
| Frontend | React (Vite) |
| Backend / DB / Auth | Supabase (Postgres + Auth + RLS + Storage para futuros adjuntos) |
| Hosting | Vercel (deploy automático desde GitHub) |
| Repositorio | GitHub — `resto-costo` |
| Dominio | Subdominio de Vercel por ahora; dominio propio a comprar más adelante |

---

## 9. Roadmap

1. **Fase 0 — Fundaciones** *(actual)*: este documento, scaffolding del repo, conexión a Supabase, esquema de base de datos, autenticación básica (login/registro/reset/Google), Super Admin fijo, panel de Accesos mínimo.
2. **Fase 1 — Carga de datos**: importar Rubros, Productos, Madres y Recetas desde el Excel real a Supabase (script de migración one-shot, respetando las fórmulas relevadas).
3. **Fase 2 — Módulos CRUD**: pantallas de Productos, Madres, Recetas y Rubros con edición completa y recálculo automático de costos/precios sugeridos.
4. **Fase 3 — Listas de Precio**: reportes por venue con precio sugerido vs. actual, food cost real, alertas.
5. **Fase 4 — Pulido y seguridad**: auditoría completa, roles intermedios, 2FA, dominio propio.
6. **Fase 5+**: nuevos módulos (fuera del alcance de costeo).

---

## 10. Decisiones ya tomadas

- Repo GitHub: **`resto-costo`**.
- Roles intermedios: **se definen más adelante** (solo Super Admin por ahora).
- Supabase: proyecto **ya existente** (pendiente compartir URL + anon key).
- Excel de referencia: `RECETAS BAR ULTIMA 21-02-2024 ENERO 2024 LISTA 3.xlsx` (Desktop del usuario) — ya analizado, ver sección 2.
