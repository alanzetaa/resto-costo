-- RestoCosto — datos personales del perfil (nombre, apellido, teléfono)

alter table public.profiles add column if not exists nombre text;
alter table public.profiles add column if not exists apellido text;
alter table public.profiles add column if not exists telefono text;

-- Cada usuario puede actualizar su propia fila (para nombre/apellido/telefono).
-- La UPDATE de super_admin ya existía (0002); esta se suma, no la reemplaza.
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Blindaje: si alguien intenta cambiarse el rol a si mismo (via esta nueva
-- policy, ej. desde la consola del navegador) y no es super_admin, el cambio
-- de rol se ignora en silencio — el resto de los campos se guardan igual.
create or replace function public.guard_profile_self_role_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null and not public.is_super_admin() then
    new.role := old.role;
  end if;
  return new;
end;
$$;

create trigger guard_profiles_self_role_update
  before update on public.profiles
  for each row execute function public.guard_profile_self_role_update();
