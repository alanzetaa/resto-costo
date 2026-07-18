-- RestoCosto — Fase 3: precio de venta actual por Receta
-- precios_venta (item x lista) nunca se uso y modelaba algo que no existe en
-- el negocio: cada Receta tiene UN solo precio de venta actual, no uno por
-- cada nivel de food-cost objetivo (Lista 1-4). Se reemplaza por columnas
-- directas en recetas.

alter table public.recetas add column if not exists precio_actual numeric(12, 2);
alter table public.recetas add column if not exists precio_actualizado_at timestamptz;

drop table if exists public.precios_venta;
