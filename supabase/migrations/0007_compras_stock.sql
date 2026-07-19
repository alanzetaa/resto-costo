-- RestoCosto — Módulo de Compras y Control de Stock (valorización semanal/mensual + forense)

create table public.proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  contacto text,
  created_at timestamptz not null default now()
);

create table public.compras (
  id uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references public.proveedores (id),
  producto_id uuid references public.productos (id),
  venue text not null check (venue in ('bar', 'resto')),
  fecha date not null,
  cantidad numeric(14, 4),
  monto numeric(12, 2) not null,
  nota text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index compras_proveedor_idx on public.compras (proveedor_id);
create index compras_producto_venue_fecha_idx on public.compras (producto_id, venue, fecha);

create table public.periodos_valorizacion (
  id uuid primary key default gen_random_uuid(),
  venue text not null check (venue in ('bar', 'resto')),
  tipo text not null check (tipo in ('semanal', 'mensual')),
  fecha_inicio date not null,
  fecha_fin date not null,
  venta_bruta numeric(14, 2) not null default 0,
  anulaciones numeric(14, 2) not null default 0,
  tickets integer,
  cubiertos integer,
  cerrado boolean not null default false,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index periodos_venue_tipo_idx on public.periodos_valorizacion (venue, tipo, fecha_inicio desc);

create table public.stock_conteos (
  id uuid primary key default gen_random_uuid(),
  periodo_id uuid not null references public.periodos_valorizacion (id) on delete cascade,
  producto_id uuid not null references public.productos (id),
  cantidad_inicial numeric(14, 4) not null default 0,
  cantidad_final numeric(14, 4),
  unique (periodo_id, producto_id)
);

create table public.receta_ventas_periodo (
  id uuid primary key default gen_random_uuid(),
  periodo_id uuid not null references public.periodos_valorizacion (id) on delete cascade,
  receta_id uuid not null references public.recetas (id),
  unidades_vendidas numeric(10, 2) not null default 0,
  unique (periodo_id, receta_id)
);

-- ============================================================
-- RLS
-- ============================================================

alter table public.proveedores enable row level security;
alter table public.compras enable row level security;
alter table public.periodos_valorizacion enable row level security;
alter table public.stock_conteos enable row level security;
alter table public.receta_ventas_periodo enable row level security;

create policy proveedores_business_access on public.proveedores
  for all using (public.has_business_access()) with check (public.has_business_access());

create policy compras_business_access on public.compras
  for all using (public.has_business_access()) with check (public.has_business_access());

create policy periodos_valorizacion_business_access on public.periodos_valorizacion
  for all using (public.has_business_access()) with check (public.has_business_access());

create policy stock_conteos_business_access on public.stock_conteos
  for all using (public.has_business_access()) with check (public.has_business_access());

create policy receta_ventas_periodo_business_access on public.receta_ventas_periodo
  for all using (public.has_business_access()) with check (public.has_business_access());
