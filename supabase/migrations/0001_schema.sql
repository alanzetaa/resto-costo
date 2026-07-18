-- RestoCosto — Fase 0: esquema inicial
-- Identidad y accesos + tablas de negocio (Rubros, Productos, Madres, Recetas, Listas de Precio)

create extension if not exists pgcrypto;

-- ============================================================
-- IDENTIDAD Y ACCESOS
-- ============================================================

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  role text not null default 'pending',
  created_at timestamptz not null default now()
);

create table public.role_assignments (
  email text primary key,
  role text not null,
  invited_by uuid references public.profiles (id),
  invited_at timestamptz not null default now()
);

-- Rol máximo blindado: nadie salvo alanzeta@gmail.com puede tener role = 'super_admin'.
create or replace function public.guard_super_admin_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'super_admin' and lower(new.email) <> 'alanzeta@gmail.com' then
    raise exception 'El rol super_admin está reservado para alanzeta@gmail.com';
  end if;
  return new;
end;
$$;

create trigger guard_role_assignments_super_admin
  before insert or update on public.role_assignments
  for each row execute function public.guard_super_admin_role();

create trigger guard_profiles_super_admin
  before insert or update on public.profiles
  for each row execute function public.guard_super_admin_role();

-- Al crear un usuario en auth.users, resolvemos su rol desde role_assignments (o 'pending').
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_role text;
begin
  select role into resolved_role
  from public.role_assignments
  where email = lower(new.email);

  insert into public.profiles (id, email, role)
  values (new.id, new.email, coalesce(resolved_role, 'pending'))
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Si el Super Admin cambia un rol en role_assignments después de que la persona
-- ya tiene cuenta, propagamos el cambio a profiles automáticamente.
create or replace function public.propagate_role_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set role = new.role
  where lower(email) = lower(new.email);
  return new;
end;
$$;

create trigger on_role_assignment_upsert
  after insert or update on public.role_assignments
  for each row execute function public.propagate_role_assignment();

-- ============================================================
-- NEGOCIO (costeo)
-- ============================================================

create table public.rubros (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  descripcion text not null,
  created_at timestamptz not null default now()
);

create table public.listas_precio (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null
);

create table public.rubro_lista_objetivo (
  rubro_id uuid not null references public.rubros (id) on delete cascade,
  lista_id uuid not null references public.listas_precio (id) on delete cascade,
  food_cost_pct numeric(6, 4) not null,
  primary key (rubro_id, lista_id)
);

create table public.productos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  descripcion text not null,
  proveedor text,
  precio_compra numeric(12, 2) not null default 0,
  descuento_pct numeric(5, 4) not null default 0,
  unidad text not null,
  cantidad_envase numeric(12, 3) not null default 1,
  rubro_id uuid references public.rubros (id),
  precio_anterior numeric(12, 2),
  precio_neto numeric(12, 2) generated always as (precio_compra - precio_compra * descuento_pct) stored,
  precio_unitario numeric(14, 6) generated always as (
    case when cantidad_envase = 0 then 0
    else (precio_compra - precio_compra * descuento_pct) / cantidad_envase end
  ) stored,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

create table public.preparaciones (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  venue text not null check (venue in ('bar', 'resto')),
  rendimiento_cantidad numeric(12, 3),
  rendimiento_unidad text,
  rubro_id uuid references public.rubros (id),
  producto_generado_id uuid references public.productos (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recetas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  venue text not null,
  rendimiento_cantidad numeric(12, 3),
  rendimiento_unidad text,
  rubro_id uuid references public.rubros (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.preparacion_ingredientes (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.preparaciones (id) on delete cascade,
  insumo_type text not null check (insumo_type in ('producto', 'preparacion')),
  insumo_id uuid not null,
  cantidad_usada numeric(14, 4) not null
);

create table public.receta_ingredientes (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.recetas (id) on delete cascade,
  insumo_type text not null check (insumo_type in ('producto', 'preparacion')),
  insumo_id uuid not null,
  cantidad_usada numeric(14, 4) not null
);

create table public.configuracion (
  id boolean primary key default true check (id),
  merma_pct numeric(5, 4) not null default 0.05,
  iva_pct numeric(5, 4) not null default 0.21
);

insert into public.configuracion (id) values (true);

create table public.precios_venta (
  id uuid primary key default gen_random_uuid(),
  item_type text not null check (item_type in ('receta', 'preparacion')),
  item_id uuid not null,
  lista_id uuid not null references public.listas_precio (id),
  precio_actual numeric(12, 2) not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  unique (item_type, item_id, lista_id)
);

create table public.historial_precios (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.productos (id) on delete cascade,
  precio_anterior numeric(12, 2),
  precio_nuevo numeric(12, 2) not null,
  changed_at timestamptz not null default now(),
  changed_by uuid references public.profiles (id)
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

-- Auditoría automática de cambios de precio de compra
create or replace function public.log_precio_producto_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.precio_compra is distinct from old.precio_compra then
    new.precio_anterior := old.precio_compra;
    insert into public.historial_precios (producto_id, precio_anterior, precio_nuevo, changed_by)
    values (old.id, old.precio_compra, new.precio_compra, new.updated_by);
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger productos_log_precio
  before update on public.productos
  for each row execute function public.log_precio_producto_change();
