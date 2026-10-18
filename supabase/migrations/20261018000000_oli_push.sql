-- Notificaciones al administrador (Web Push)
-- Cuando llega al servidor una venta, una anulación, una apertura o cierre de caja, una salida de dinero de la caja o un cambio
-- que el servidor no aceptó, se arma un aviso corto y se manda a los celulares/equipos donde un administrador activó las
-- notificaciones. El aviso se arma aquí, con lo que ya está guardado en el servidor (nunca con texto que mande un equipo),
-- y lo envía la Edge Function "oli-push" (supabase/functions/oli-push). Nunca lleva costos ni utilidades.
-- Si algo falla al armar el aviso, la venta se guarda igual: el aviso nunca frena una venta.

do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then create extension if not exists pg_net with schema extensions; end if;
exception when others then null; end $$;

-- a quién avisar: un registro por equipo donde un administrador activó las notificaciones
create table if not exists oli_push_subs (
  endpoint text primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text,
  p256dh text not null,
  auth text not null,
  prefs jsonb not null default '{}'::jsonb,                -- {venta, anulacion, caja, dinero, problema}: false = no avisar
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_ok timestamptz,
  fails int not null default 0
);
create index if not exists oli_push_subs_org on oli_push_subs (org_id);

-- avisos por mandar (los toma la Edge Function)
create table if not exists oli_push_queue (
  id bigserial primary key,
  org_id uuid not null references organizations(id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  tag text,
  url text,
  dev text,                                                 -- equipo que lo originó (a ese equipo no se le avisa)
  solo_endpoint text,                                       -- aviso de prueba: solo a ese equipo
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  tries int not null default 0,
  result text
);
create index if not exists oli_push_queue_pend on oli_push_queue (id) where sent_at is null;

-- configuración del envío (URL de la función y claves VAPID). Solo la lee el servidor.
create table if not exists oli_push_conf (k text primary key, v text not null);

alter table oli_push_subs enable row level security;
alter table oli_push_queue enable row level security;
alter table oli_push_conf enable row level security;
revoke all on oli_push_subs, oli_push_queue, oli_push_conf from public, anon, authenticated;
revoke all on sequence oli_push_queue_id_seq from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Textos
-- ---------------------------------------------------------------------------
create or replace function oli.plata(n numeric) returns text language sql immutable as
$$ select case when n < 0 then '− ' else '' end || '$' || replace(to_char(round(abs(coalesce(n, 0))), 'FM999,999,999,990'), ',', '.') $$;

create or replace function oli.push_nombre_equipo(p_org uuid, p_dev text, p_alt text) returns text language sql stable security definer set search_path = public as
$$ select coalesce(nullif((select o.data->>'nombre' from oli_docs o where o.org_id = p_org and o.collection = 'dispositivos' and o.doc_id = p_dev), ''), nullif(p_alt, ''), 'Una caja') $$;

create or replace function oli.push_corto(t text, n int) returns text language sql immutable as
$$ select case when length(coalesce(t, '')) > n then left(t, n - 1) || '…' else coalesce(t, '') end $$;

-- avisa a la Edge Function que hay avisos por mandar (si ya se configuró su dirección)
create or replace function oli.push_ping() returns void language plpgsql security definer set search_path = public as
$$
declare u text;
begin
  select v into u from oli_push_conf where k = 'url';
  if u is null or to_regproc('net.http_post') is null then return; end if;
  execute 'select net.http_post(url := $1, body := ''{}''::jsonb, headers := ''{"Content-Type":"application/json"}''::jsonb, timeout_milliseconds := 8000)' using u;
exception when others then null;                                   -- sin aviso inmediato: sale con el siguiente
end $$;

-- ---------------------------------------------------------------------------
-- Armar los avisos a partir de lo que cambió en oli_docs
-- ---------------------------------------------------------------------------
create or replace function oli.push_eventos() returns trigger language plpgsql security definer set search_path = public as
$$
declare
  dev text := coalesce(new.device_id, new.data->>'dev'); nom text; n int; tot numeric; x jsonb; it jsonb; prods text; s record; hay boolean := false;
begin
  if not exists (select 1 from oli_push_subs ps where ps.org_id = new.org_id) then return new; end if;   -- nadie activó avisos
  if new.doc_id like 'demo%' then return new; end if;                                                    -- datos de demostración
  begin
    nom := oli.push_nombre_equipo(new.org_id, dev, new.data->>'devNombre');

    if new.collection = 'ventas' then
      -- ventas nuevas en este documento (las que no estaban antes)
      select count(*), coalesce(sum((v->>'total')::numeric), 0) into n, tot
        from jsonb_array_elements(coalesce(new.data->'ventas', '[]'::jsonb)) v
        where coalesce(v->>'id', '') not like 'demo-%'
          and not exists (select 1 from jsonb_array_elements(coalesce(old.data->'ventas', '[]'::jsonb)) o where o->>'id' = v->>'id');
      if n between 1 and 3 then
        for x in select v from jsonb_array_elements(coalesce(new.data->'ventas', '[]'::jsonb)) v
                 where coalesce(v->>'id', '') not like 'demo-%'
                   and not exists (select 1 from jsonb_array_elements(coalesce(old.data->'ventas', '[]'::jsonb)) o where o->>'id' = v->>'id') loop
          select string_agg(case when coalesce((i->>'q')::numeric, 1) <> 1 then (i->>'q') || '× ' else '' end || coalesce(i->>'n', 'producto'), ', ') into prods
            from jsonb_array_elements(coalesce(x->'items', '[]'::jsonb)) i;
          insert into oli_push_queue (org_id, kind, title, body, tag, url, dev)
          values (new.org_id, 'venta', 'Venta ' || oli.plata((x->>'total')::numeric) || ' · ' || nom,
                  oli.push_corto(coalesce(x->>'m', '') || case when coalesce((x->>'pend')::boolean, false) then ' (por confirmar)' else '' end || case when prods is not null then ' · ' || prods else '' end, 160),
                  'venta-' || (x->>'id'), '#ventas', dev);
          hay := true;
        end loop;
      elsif n > 3 then
        insert into oli_push_queue (org_id, kind, title, body, tag, url, dev)
        values (new.org_id, 'venta', nom || ': llegaron ' || n || ' ventas por ' || oli.plata(tot),
                'Estaban guardadas en el equipo (sin Internet) y ya llegaron al servidor.', 'ventas-' || new.doc_id, '#ventas', dev);
        hay := true;
      end if;

    elsif new.collection = 'anulaciones' then
      for it in select i from jsonb_array_elements(coalesce(new.data->'items', '[]'::jsonb)) i
                where not exists (select 1 from jsonb_array_elements(coalesce(old.data->'items', '[]'::jsonb)) o where o->>'id' = i->>'id') loop
        select sa.sale_label, sa.total into s from sales sa where sa.org_id = new.org_id and sa.id = it->>'ventaId';
        insert into oli_push_queue (org_id, kind, title, body, tag, url, dev)
        values (new.org_id, 'anulacion', 'Venta anulada · ' || nom,
                oli.push_corto(coalesce(s.sale_label || ' ', '') || 'por ' || oli.plata(coalesce((it->>'total')::numeric, s.total)) || case when coalesce(it->>'motivo', '') <> '' then ' · ' || (it->>'motivo') else '' end, 160),
                'anul-' || (it->>'id'), '#ventas', dev);
        hay := true;
      end loop;

    elsif new.collection = 'cajas' then
      if new.data ? 'apertura' and jsonb_typeof(new.data->'apertura') = 'object' and (old.data is null or not (old.data ? 'apertura') or jsonb_typeof(old.data->'apertura') <> 'object') then
        insert into oli_push_queue (org_id, kind, title, body, tag, url, dev)
        values (new.org_id, 'caja', nom || ' abrió caja', 'Base ' || oli.plata((new.data->'apertura'->>'monto')::numeric), 'abre-' || new.doc_id, '#caja', dev);
        hay := true;
      end if;
      for it in select c from jsonb_array_elements(coalesce(new.data->'cierres', '[]'::jsonb)) c
                where not exists (select 1 from jsonb_array_elements(coalesce(old.data->'cierres', '[]'::jsonb)) o where o->>'id' = c->>'id') loop
        insert into oli_push_queue (org_id, kind, title, body, tag, url, dev)
        values (new.org_id, 'caja',
                nom || ' cerró caja' || case when coalesce((it->>'dif')::numeric, 0) < 0 then ': faltaron ' || oli.plata(-(it->>'dif')::numeric)
                                              when coalesce((it->>'dif')::numeric, 0) > 0 then ': sobraron ' || oli.plata((it->>'dif')::numeric) else ': cuadró' end,
                oli.push_corto('Esperado ' || oli.plata((it->>'esperado')::numeric) || ' · contado ' || oli.plata((it->>'contado')::numeric) || case when coalesce(it->>'obs', '') <> '' then ' · ' || (it->>'obs') else '' end, 160),
                'cierre-' || (it->>'id'), '#caja', dev);
        hay := true;
      end loop;
      for it in select m from jsonb_array_elements(coalesce(new.data->'movs', '[]'::jsonb)) m
                where m->>'tipo' in ('retiro', 'gasto', 'ingreso')
                  and not exists (select 1 from jsonb_array_elements(coalesce(old.data->'movs', '[]'::jsonb)) o where o->>'id' = m->>'id') loop
        insert into oli_push_queue (org_id, kind, title, body, tag, url, dev)
        values (new.org_id, 'dinero',
                case when it->>'tipo' = 'ingreso' then 'Entró ' || oli.plata((it->>'monto')::numeric) || ' a ' || nom
                     when it->>'tipo' = 'gasto' then 'Pago desde ' || nom || ': ' || oli.plata((it->>'monto')::numeric)
                     else 'Salió ' || oli.plata((it->>'monto')::numeric) || ' de ' || nom end,
                oli.push_corto(coalesce(it->>'motivo', ''), 160), 'mov-' || (it->>'id'), '#caja', dev);
        hay := true;
      end loop;

    elsif new.collection = 'dispositivos' then
      if coalesce((new.data->>'rech')::int, 0) > coalesce((old.data->>'rech')::int, 0) then
        x := new.data->'rechInfo'->0;
        insert into oli_push_queue (org_id, kind, title, body, tag, url, dev)
        values (new.org_id, 'problema', nom || ': un cambio no llegó al servidor',
                oli.push_corto(coalesce(x->>'c', 'Un cambio') || case when coalesce(x->>'e', '') <> '' then ' (' || (x->>'e') || ')' else '' end || '. Revísalo en Equipo.', 160),
                'rech-' || new.doc_id, '#equipo', null);
        hay := true;
      end if;
    end if;

    if hay then perform oli.push_ping(); end if;
  exception when others then null;                                   -- un aviso nunca frena una venta
  end;
  return new;
end $$;

drop trigger if exists oli_docs_push on oli_docs;
create trigger oli_docs_push after insert or update on oli_docs
  for each row when (new.collection in ('ventas', 'anulaciones', 'cajas', 'dispositivos'))
  execute function oli.push_eventos();

-- ---------------------------------------------------------------------------
-- Lo que usa la app del administrador
-- ---------------------------------------------------------------------------
create or replace function oli_push_suscribir(p_endpoint text, p_p256dh text, p_auth text, p_dev text, p_prefs jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as
$$
declare mem record;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into mem from oli.my_membership();
  if mem.org_id is null or oli.role_level(mem.role) < 3 then raise exception 'solo el administrador recibe notificaciones' using errcode = '42501'; end if;
  if coalesce(p_endpoint, '') !~ '^https://' or length(p_endpoint) > 1000 or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then raise exception 'suscripción inválida' using errcode = '22023'; end if;
  insert into oli_push_subs (endpoint, org_id, user_id, device_id, p256dh, auth, prefs)
  values (p_endpoint, mem.org_id, auth.uid(), p_dev, p_p256dh, p_auth, coalesce(p_prefs, '{}'::jsonb))
  on conflict (endpoint) do update set org_id = excluded.org_id, user_id = excluded.user_id, device_id = excluded.device_id, p256dh = excluded.p256dh, auth = excluded.auth,
    prefs = coalesce(p_prefs, oli_push_subs.prefs), updated_at = now(), fails = 0;
  return (select jsonb_build_object('prefs', prefs) from oli_push_subs where endpoint = p_endpoint);
end $$;

create or replace function oli_push_prefs(p_endpoint text, p_prefs jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as
$$
begin
  if p_prefs is not null then update oli_push_subs set prefs = p_prefs, updated_at = now() where endpoint = p_endpoint and user_id = auth.uid(); end if;
  return (select jsonb_build_object('prefs', prefs) from oli_push_subs where endpoint = p_endpoint and user_id = auth.uid());
end $$;

create or replace function oli_push_quitar(p_endpoint text) returns void language sql security definer set search_path = public as
$$ delete from oli_push_subs where endpoint = p_endpoint and user_id = auth.uid() $$;

create or replace function oli_push_prueba(p_endpoint text) returns jsonb language plpgsql security definer set search_path = public as
$$
declare sub record;
begin
  select * into sub from oli_push_subs where endpoint = p_endpoint and user_id = auth.uid();
  if sub.endpoint is null then raise exception 'este equipo no tiene las notificaciones activadas' using errcode = '22023'; end if;
  insert into oli_push_queue (org_id, kind, title, body, tag, url, solo_endpoint)
  values (sub.org_id, 'prueba', 'OLI: notificación de prueba', 'Así te van a llegar los avisos de ventas y de la caja.', 'prueba', '#hoy', p_endpoint);
  perform oli.push_ping();
  return jsonb_build_object('ok', true, 'url', (select v is not null from oli_push_conf where k = 'url'));
end $$;

revoke all on function oli_push_suscribir(text, text, text, text, jsonb), oli_push_prefs(text, jsonb), oli_push_quitar(text), oli_push_prueba(text) from public, anon;
grant execute on function oli_push_suscribir(text, text, text, text, jsonb), oli_push_prefs(text, jsonb), oli_push_quitar(text), oli_push_prueba(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Lo que usa la Edge Function (solo con la clave de servicio)
-- ---------------------------------------------------------------------------
create or replace function oli_push_claves() returns jsonb language sql stable security definer set search_path = public as
$$ select jsonb_build_object('pub', (select v from oli_push_conf where k = 'vapid_pub'), 'priv', (select v from oli_push_conf where k = 'vapid_priv'), 'sujeto', coalesce((select v from oli_push_conf where k = 'sujeto'), 'https://oli-pos.vercel.app')) $$;

create or replace function oli_push_guardar_claves(p_pub text, p_priv text) returns jsonb language plpgsql security definer set search_path = public as
$$
begin
  if not exists (select 1 from oli_push_conf where k = 'vapid_pub') then                      -- se generan una sola vez: cambiarlas dejaría sin avisos a quienes ya las activaron
    insert into oli_push_conf (k, v) values ('vapid_pub', p_pub), ('vapid_priv', p_priv) on conflict (k) do nothing;
  end if;
  return oli_push_claves();
end $$;

-- toma hasta p_limite avisos pendientes (con a quién mandarlos); los de hace más de 2 horas ya no se mandan
create or replace function oli_push_tomar(p_limite int default 50) returns jsonb language plpgsql security definer set search_path = public as
$$
declare r jsonb;
begin
  update oli_push_queue set sent_at = now(), result = 'vencido' where sent_at is null and created_at < now() - interval '2 hours';
  with tomados as (
    update oli_push_queue q set claimed_at = now(), tries = q.tries + 1
    where q.id in (select id from oli_push_queue where sent_at is null and tries < 5 and (claimed_at is null or claimed_at < now() - interval '2 minutes')
                   order by id limit greatest(1, least(coalesce(p_limite, 50), 200)) for update skip locked)
    returning q.*)
  select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'kind', t.kind, 'title', t.title, 'body', t.body, 'tag', t.tag, 'url', t.url,
           'subs', coalesce((select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
                             from oli_push_subs s join memberships m on m.user_id = s.user_id and m.org_id = s.org_id and m.active and oli.role_level(m.role) >= 3
                             where s.org_id = t.org_id
                               and (t.solo_endpoint is null or s.endpoint = t.solo_endpoint)
                               and (t.solo_endpoint is not null or coalesce((s.prefs->>t.kind)::boolean, true))
                               and (t.dev is null or s.device_id is distinct from t.dev)), '[]'::jsonb)) order by t.id), '[]'::jsonb)
    into r from tomados t;
  return r;
end $$;

create or replace function oli_push_resultado(p_ids bigint[], p_ok text[], p_malos text[]) returns void language plpgsql security definer set search_path = public as
$$
begin
  update oli_push_queue set sent_at = now(), result = 'ok' where id = any(coalesce(p_ids, '{}'));
  update oli_push_subs set last_ok = now(), fails = 0 where endpoint = any(coalesce(p_ok, '{}'));
  delete from oli_push_subs where endpoint = any(coalesce(p_malos, '{}'));                     -- el navegador ya no la tiene (404/410)
  delete from oli_push_queue where sent_at < now() - interval '30 days';
end $$;

revoke all on function oli_push_claves(), oli_push_guardar_claves(text, text), oli_push_tomar(int), oli_push_resultado(bigint[], text[], text[]) from public, anon, authenticated;
grant execute on function oli_push_claves(), oli_push_guardar_claves(text, text), oli_push_tomar(int), oli_push_resultado(bigint[], text[], text[]) to service_role;
revoke execute on function oli.push_eventos(), oli.push_ping(), oli.push_nombre_equipo(uuid, text, text), oli.plata(numeric), oli.push_corto(text, int) from public, anon, authenticated;
