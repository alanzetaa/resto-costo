-- RestoCosto — Fase 0: Row Level Security

alter table public.profiles enable row level security;
alter table public.role_assignments enable row level security;
alter table public.rubros enable row level security;
alter table public.listas_precio enable row level security;
alter table public.rubro_lista_objetivo enable row level security;
alter table public.productos enable row level security;
alter table public.preparaciones enable row level security;
alter table public.recetas enable row level security;
alter table public.preparacion_ingredientes enable row level security;
alter table public.receta_ingredientes enable row level security;
alter table public.configuracion enable row level security;
alter table public.precios_venta enable row level security;
alter table public.historial_precios enable row level security;
alter table public.audit_log enable row level security;

-- Helpers, evaluados con el rol del usuario autenticado (auth.uid())
create or replace function public.current_role_name()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.current_role_name() = 'super_admin';
$$;

create or replace function public.has_business_access()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.current_role_name() in ('super_admin', 'admin');
$$;

-- profiles: cada uno ve su propia fila; super_admin ve todas.
create policy profiles_select_own on public.profiles
  for select using (id = auth.uid() or public.is_super_admin());

create policy profiles_update_super_admin on public.profiles
  for update using (public.is_super_admin());

-- role_assignments: exclusivo del super_admin
create policy role_assignments_all_super_admin on public.role_assignments
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- Tablas de negocio: lectura/escritura para super_admin y admin
create policy rubros_business_access on public.rubros
  for all using (public.has_business_access()) with check (public.has_business_access());

create policy listas_precio_business_access on public.listas_precio
  for all using (public.has_business_access()) with check (public.has_business_access());

create policy rubro_lista_objetivo_business_access on public.rubro_lista_objetivo
  for all using (public.has_business_access()) with check (public.has_business_access());

create policy productos_business_access on public.productos
  for all using (public.has_business_access()) with check (public.has_business_access());

create policy preparaciones_business_access on public.preparaciones
  for all using (public.has_business_access()) with check (public.has_business_access());

create policy recetas_business_access on public.recetas
  for all using (public.has_business_access()) with check (public.has_business_access());

create policy preparacion_ingredientes_business_access on public.preparacion_ingredientes
  for all using (public.has_business_access()) with check (public.has_business_access());

create policy receta_ingredientes_business_access on public.receta_ingredientes
  for all using (public.has_business_access()) with check (public.has_business_access());

create policy configuracion_business_access on public.configuracion
  for all using (public.has_business_access()) with check (public.has_business_access());

create policy precios_venta_business_access on public.precios_venta
  for all using (public.has_business_access()) with check (public.has_business_access());

-- historial_precios / audit_log: solo lectura para super_admin/admin.
-- Las inserciones las hacen los triggers (SECURITY DEFINER), que no están sujetos a RLS.
create policy historial_precios_select on public.historial_precios
  for select using (public.has_business_access());

create policy audit_log_select on public.audit_log
  for select using (public.has_business_access());
