-- RestoCosto — Descuentos/cortesías por persona autorizada (socios, empleados, etc.)

create table public.personas_descuento (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  porcentaje numeric(5, 4) not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.descuentos (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references public.personas_descuento (id),
  venue text not null check (venue in ('bar', 'resto')),
  fecha date not null,
  cantidad_operaciones integer,
  monto numeric(12, 2) not null,
  nota text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index descuentos_persona_idx on public.descuentos (persona_id);
create index descuentos_venue_fecha_idx on public.descuentos (venue, fecha);

alter table public.personas_descuento enable row level security;
alter table public.descuentos enable row level security;

create policy personas_descuento_business_access on public.personas_descuento
  for all using (public.has_business_access()) with check (public.has_business_access());

create policy descuentos_business_access on public.descuentos
  for all using (public.has_business_access()) with check (public.has_business_access());
