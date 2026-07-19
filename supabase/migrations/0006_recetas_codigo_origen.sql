-- RestoCosto — trazabilidad: de qué solapa del Excel vino cada Receta.
-- Necesario para poder distinguir versiones vigentes de versiones viejas
-- cuando el mismo plato quedó cargado más de una vez en el archivo original.

alter table public.recetas add column if not exists codigo_origen text;
