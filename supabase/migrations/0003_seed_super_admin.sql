-- RestoCosto — Fase 0: seed del Super Admin y listas de precio base

insert into public.role_assignments (email, role)
values ('alanzeta@gmail.com', 'super_admin')
on conflict (email) do update set role = excluded.role;

insert into public.listas_precio (codigo, nombre) values
  ('LISTA_1', 'Lista 1'),
  ('LISTA_2', 'Lista 2'),
  ('LISTA_3', 'Lista 3'),
  ('LISTA_4', 'Lista 4')
on conflict (codigo) do nothing;
