-- RestoCosto — Fase 1: corrige el modelo de Productos
-- La "Rubro" de Productos en el Excel es una taxonomía de despensa
-- (ALMACEN, CARNES, FRUTAS Y VERDURAS, etc.), distinta de los Rubros de
-- carta (rubros.codigo) que usan Madres/Recetas para el food cost objetivo.
-- No corresponde que sea una FK a rubros.

alter table public.productos drop column if exists rubro_id;
alter table public.productos add column if not exists categoria text;
