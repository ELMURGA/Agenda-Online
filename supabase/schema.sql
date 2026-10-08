-- Esquema de Supabase para el calendario 26/27.
-- Ejecuta este script completo en: panel de Supabase -> SQL Editor -> New query -> Run.
-- Puedes ejecutarlo varias veces sin problema (usa IF NOT EXISTS / OR REPLACE).

create table if not exists public.calendars (
  key_hash   text primary key check (key_hash ~ '^[a-f0-9]{64}$'),
  data       jsonb not null default '{"S":{},"T":{}}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Activamos RLS y no creamos ninguna política: así ni "anon" ni "authenticated"
-- pueden leer/escribir la tabla directamente. Solo el backend (service_role,
-- que usa la función serverless en Vercel) puede acceder, a través de las
-- funciones RPC de abajo.
alter table public.calendars enable row level security;

-- Devuelve el calendario de una clave; si no existe, lo crea vacío y marca is_new = true.
create or replace function public.get_or_create_calendar(p_key text)
returns table(data jsonb, is_new boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing jsonb;
  v_is_new boolean := false;
begin
  select c.data into v_existing from public.calendars c where c.key_hash = p_key;
  if v_existing is null then
    insert into public.calendars (key_hash, data) values (p_key, '{"S":{},"T":{}}'::jsonb)
      on conflict (key_hash) do nothing;
    select c.data into v_existing from public.calendars c where c.key_hash = p_key;
    v_is_new := true;
  end if;
  return query select v_existing, v_is_new;
end;
$$;

-- Fusiona (merge) los datos entrantes con los existentes de forma atómica
-- (bloquea la fila mientras fusiona, para que dos dispositivos guardando a
-- la vez no se pisen los datos) y devuelve el resultado ya fusionado.
create or replace function public.merge_calendar(p_key text, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing jsonb;
  v_merged jsonb;
  k text;
  rt numeric;
  lt numeric;
begin
  insert into public.calendars (key_hash, data)
  values (p_key, '{"S":{},"T":{}}'::jsonb)
  on conflict (key_hash) do nothing;

  select data into v_existing from public.calendars where key_hash = p_key for update;
  v_merged := v_existing;

  for k in select jsonb_object_keys(coalesce(p_data->'T', '{}'::jsonb))
  loop
    rt := (p_data->'T'->>k)::numeric;
    lt := coalesce((v_existing->'T'->>k)::numeric, 0);
    if rt > lt then
      v_merged := jsonb_set(v_merged, array['T', k], to_jsonb(rt));
      if p_data->'S' ? k then
        v_merged := jsonb_set(v_merged, array['S', k], p_data->'S'->k);
      else
        v_merged := v_merged #- array['S', k];
      end if;
    end if;
  end loop;

  update public.calendars set data = v_merged, updated_at = now() where key_hash = p_key;
  return v_merged;
end;
$$;

-- Solo el backend (service_role) puede ejecutar estas funciones.
revoke all on function public.get_or_create_calendar(text) from public;
revoke all on function public.merge_calendar(text, jsonb) from public;
grant execute on function public.get_or_create_calendar(text) to service_role;
grant execute on function public.merge_calendar(text, jsonb) to service_role;
