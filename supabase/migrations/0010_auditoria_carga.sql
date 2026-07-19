-- RestoCosto — Registrar qué usuario carga/actualiza compras, consumos de stock,
-- ventas del período (tickets) y descuentos.
--
-- compras, periodos_valorizacion y descuentos ya tenían columna created_by (nunca
-- completada por la app). stock_conteos y receta_ventas_periodo se editan a lo largo
-- del tiempo (cantidad_final, unidades_vendidas), así que además de created_by
-- necesitan updated_by/updated_at para registrar quién tocó el dato por última vez.

alter table public.stock_conteos add column if not exists updated_at timestamptz;
alter table public.stock_conteos add column if not exists updated_by uuid references public.profiles (id);

alter table public.receta_ventas_periodo add column if not exists updated_at timestamptz;
alter table public.receta_ventas_periodo add column if not exists updated_by uuid references public.profiles (id);

alter table public.periodos_valorizacion add column if not exists updated_at timestamptz;
alter table public.periodos_valorizacion add column if not exists updated_by uuid references public.profiles (id);

-- Con varios usuarios cargando datos, cualquiera con acceso al negocio necesita poder
-- resolver el nombre de quién cargó cada registro (antes profiles solo se podía leer
-- la fila propia, salvo para super_admin).
create policy profiles_select_business_access on public.profiles
  for select using (public.has_business_access());
