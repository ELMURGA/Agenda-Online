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

-- ============================================================================
-- Notificaciones Push (Web Push / VAPID) — recordatorios de eventos.
-- ============================================================================

-- Una fila por dispositivo suscrito (un mismo calendario/clave puede tener
-- varios dispositivos). El "endpoint" lo asigna el navegador y es único.
create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  key_hash   text not null references public.calendars(key_hash) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_key_hash_idx on public.push_subscriptions(key_hash);
alter table public.push_subscriptions enable row level security;

-- Registro de envíos (para no avisar dos veces el mismo día si el cron se
-- ejecuta más de una vez o se redespliega).
create table if not exists public.push_log (
  key_hash   text not null references public.calendars(key_hash) on delete cascade,
  notif_date date not null,
  sent_at    timestamptz not null default now(),
  primary key (key_hash, notif_date)
);
alter table public.push_log enable row level security;

-- Guarda (o actualiza) la suscripción Push de un dispositivo para una clave.
create or replace function public.save_push_subscription(p_key text, p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.calendars (key_hash, data) values (p_key, '{"S":{},"T":{}}'::jsonb)
    on conflict (key_hash) do nothing;
  insert into public.push_subscriptions (endpoint, key_hash, p256dh, auth)
  values (p_endpoint, p_key, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set key_hash = excluded.key_hash, p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;

-- Elimina la suscripción de un dispositivo (solo si pertenece a esa clave).
create or replace function public.delete_push_subscription(p_key text, p_endpoint text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and key_hash = p_key;
$$;

-- Elimina una suscripción caducada/inválida detectada por el cron (p. ej. el
-- usuario desinstaló la app o revocó el permiso), sin necesitar la clave.
create or replace function public.prune_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;

-- Devuelve, para cada dispositivo suscrito, los datos de su calendario, para
-- que el cron pueda calcular qué eventos tiene mañana.
create or replace function public.list_push_targets()
returns table(key_hash text, data jsonb, endpoint text, p256dh text, auth text)
language sql
security definer
set search_path = public
as $$
  select c.key_hash, c.data, p.endpoint, p.p256dh, p.auth
  from public.push_subscriptions p
  join public.calendars c on c.key_hash = p.key_hash;
$$;

-- Marca que ya se ha avisado a una clave en una fecha dada. Devuelve true la
-- primera vez (hay que enviar la notificación) y false si ya se había
-- marcado antes (evita duplicados).
create or replace function public.mark_push_sent(p_key text, p_notif_date date)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.push_log (key_hash, notif_date) values (p_key, p_notif_date)
    on conflict (key_hash, notif_date) do nothing;
  return found;
end;
$$;

-- Solo el backend (service_role) puede ejecutar estas funciones.
revoke all on function public.save_push_subscription(text, text, text, text) from public;
revoke all on function public.delete_push_subscription(text, text) from public;
revoke all on function public.prune_push_subscription(text) from public;
revoke all on function public.list_push_targets() from public;
revoke all on function public.mark_push_sent(text, date) from public;
grant execute on function public.save_push_subscription(text, text, text, text) to service_role;
grant execute on function public.delete_push_subscription(text, text) to service_role;
grant execute on function public.prune_push_subscription(text) to service_role;
grant execute on function public.list_push_targets() to service_role;
grant execute on function public.mark_push_sent(text, date) to service_role;
