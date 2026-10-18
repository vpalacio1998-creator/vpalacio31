-- Notificaciones al administrador (Web Push)
-- Cuando llega al servidor una venta, una anulación, una apertura o cierre de caja, una salida de dinero de la caja o un cambio
-- que el servidor no aceptó, se arma un aviso corto y se manda a los celulares/equipos donde un administrador activó las
-- notificaciones. El aviso se arma aquí, con lo que ya está guardado en el servidor (nunca con texto que mande un equipo),
-- y lo envía la Edge Function "oli-push" (supabase/functions/oli-push). Nunca lleva costos ni utilidades.
-- Si algo falla al armar el aviso, la venta se guarda igual: el aviso nunca frena una venta.

do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then create extension if not exists pg_net with schema extensions; end if;
exception when others then raise warning 'OLI: no se pudo activar pg_net (los avisos no saldrán al instante): %', sqlerrm; end $$;

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
  fails int not null default 0,                             -- envíos seguidos que el servicio de avisos no aceptó
  last_error text
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
  entregados text[] not null default '{}',                  -- a qué equipos ya llegó (al reintentar no se repite)
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
$$ select left(coalesce(nullif((select o.data->>'nombre' from oli_docs o where o.org_id = p_org and o.collection = 'dispositivos' and o.doc_id = p_dev), ''), nullif(p_alt, ''), 'Una caja'), 40) $$;

-- un número que llega en el documento (si no es número, no se usa: un aviso nunca debe fallar por un dato raro)
create or replace function oli.num(t text) returns numeric language sql immutable as
$$ select case when t ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then t::numeric end $$;

-- preferencias válidas: un objeto con solo estas claves y valores sí/no
create or replace function oli.push_prefs_ok(p jsonb) returns boolean language sql immutable as
$$ select p is null or (jsonb_typeof(p) = 'object' and not exists (select 1 from jsonb_each(p) e where e.key not in ('venta', 'anulacion', 'caja', 'dinero', 'problema') or jsonb_typeof(e.value) <> 'boolean')) $$;

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
  dev text := coalesce(new.device_id, new.data->>'dev'); nom text; n int; tot numeric; k int; x jsonb; it jsonb; prods text; s record; hay boolean := false;
  pend boolean; dif numeric;
begin
  if not exists (select 1 from oli_push_subs ps where ps.org_id = new.org_id) then return new; end if;   -- nadie activó avisos
  if new.doc_id like 'demo%' then return new; end if;                                                    -- datos de demostración
  begin
    nom := oli.push_nombre_equipo(new.org_id, dev, new.data->>'devNombre');

    if new.collection = 'ventas' then
      -- ventas nuevas en este documento (las que no estaban antes)
      select count(*), coalesce(sum(oli.num(v->>'total')), 0) into n, tot
        from jsonb_array_elements(coalesce(new.data->'ventas', '[]'::jsonb)) v
        where coalesce(v->>'id', '') not like 'demo-%'
          and not exists (select 1 from jsonb_array_elements(coalesce(old.data->'ventas', '[]'::jsonb)) o where o->>'id' = v->>'id');
      if n between 1 and 3 then
        for x in select v from jsonb_array_elements(coalesce(new.data->'ventas', '[]'::jsonb)) v
                 where coalesce(v->>'id', '') not like 'demo-%'
                   and not exists (select 1 from jsonb_array_elements(coalesce(old.data->'ventas', '[]'::jsonb)) o where o->>'id' = v->>'id') loop
          select string_agg(case when coalesce(oli.num(i->>'q'), 1) <> 1 then (i->>'q') || '× ' else '' end || coalesce(i->>'n', 'producto'), ', ') into prods
            from jsonb_array_elements(case when jsonb_typeof(x->'items') = 'array' then x->'items' else '[]'::jsonb end) i;
          pend := coalesce(x->>'m', '') in ('Nequi', 'Daviplata', 'QR Bancolombia') and coalesce(x->>'confirmada', '') <> 'true';   -- igual que la app: pago digital sin confirmar
          insert into oli_push_queue (org_id, kind, title, body, tag, url, dev)
          values (new.org_id, 'venta', oli.push_corto('Venta ' || oli.plata(oli.num(x->>'total')) || ' · ' || nom, 90),
                  oli.push_corto(coalesce(x->>'m', '') || case when pend then ' (por confirmar)' else '' end || case when prods is not null then ' · ' || prods else '' end, 160),
                  'venta-' || (x->>'id'), '#ventas', dev);
          hay := true;
        end loop;
      elsif n > 3 then
        insert into oli_push_queue (org_id, kind, title, body, tag, url, dev)
        values (new.org_id, 'venta', oli.push_corto(nom || ': llegaron ' || n || ' ventas por ' || oli.plata(tot), 90),
                'Estaban guardadas en el equipo (sin Internet) y ya llegaron al servidor.', 'ventas-' || new.doc_id, '#ventas', dev);
        hay := true;
      end if;

    elsif new.collection = 'anulaciones' then
      for it in select i from jsonb_array_elements(coalesce(new.data->'items', '[]'::jsonb)) i
                where not exists (select 1 from jsonb_array_elements(coalesce(old.data->'items', '[]'::jsonb)) o where o->>'id' = i->>'id') loop
        select sa.sale_label, sa.total into s from sales sa where sa.org_id = new.org_id and sa.id = it->>'ventaId';
        insert into oli_push_queue (org_id, kind, title, body, tag, url, dev)
        values (new.org_id, 'anulacion', oli.push_corto('Venta anulada · ' || nom, 90),
                oli.push_corto(coalesce(s.sale_label || ' ', '') || 'por ' || oli.plata(coalesce(s.total, oli.num(it->>'total'))) || case when coalesce(it->>'motivo', '') <> '' then ' · ' || (it->>'motivo') else '' end, 160),
                'anul-' || (it->>'id'), '#ventas', dev);
        hay := true;
      end loop;

    elsif new.collection = 'cajas' then
      if jsonb_typeof(new.data->'apertura') = 'object' and (old.data is null or jsonb_typeof(old.data->'apertura') is distinct from 'object') then
        insert into oli_push_queue (org_id, kind, title, body, tag, url, dev)
        values (new.org_id, 'caja', oli.push_corto(nom || ' abrió caja', 90), 'Base ' || oli.plata(oli.num(new.data->'apertura'->>'monto')), 'abre-' || new.doc_id, '#caja', dev);
        hay := true;
      end if;
      for it in select c from jsonb_array_elements(coalesce(new.data->'cierres', '[]'::jsonb)) c
                where not exists (select 1 from jsonb_array_elements(coalesce(old.data->'cierres', '[]'::jsonb)) o where o->>'id' = c->>'id') loop
        dif := coalesce(oli.num(it->>'dif'), 0);
        insert into oli_push_queue (org_id, kind, title, body, tag, url, dev)
        values (new.org_id, 'caja',
                oli.push_corto(nom || ' cerró caja' || case when dif < 0 then ': faltaron ' || oli.plata(-dif) when dif > 0 then ': sobraron ' || oli.plata(dif) else ': cuadró' end, 90),
                oli.push_corto('Esperado ' || oli.plata(oli.num(it->>'esperado')) || ' · contado ' || oli.plata(oli.num(it->>'contado')) || case when coalesce(it->>'obs', '') <> '' then ' · ' || (it->>'obs') else '' end, 160),
                'cierre-' || (it->>'id'), '#caja', dev);
        hay := true;
      end loop;
      for it in select m from jsonb_array_elements(coalesce(new.data->'movs', '[]'::jsonb)) m
                where m->>'tipo' in ('retiro', 'gasto', 'ingreso')
                  and not exists (select 1 from jsonb_array_elements(coalesce(old.data->'movs', '[]'::jsonb)) o where o->>'id' = m->>'id') loop
        insert into oli_push_queue (org_id, kind, title, body, tag, url, dev)
        values (new.org_id, 'dinero',
                oli.push_corto(case when it->>'tipo' = 'ingreso' then 'Entró ' || oli.plata(oli.num(it->>'monto')) || ' a ' || nom
                     when it->>'tipo' = 'gasto' then 'Pago desde ' || nom || ': ' || oli.plata(oli.num(it->>'monto'))
                     else 'Salió ' || oli.plata(oli.num(it->>'monto')) || ' de ' || nom end, 90),
                oli.push_corto(coalesce(it->>'motivo', ''), 160), 'mov-' || (it->>'id'), '#caja', dev);
        hay := true;
      end loop;

    elsif new.collection = 'dispositivos' then
      k := coalesce(oli.num(new.data->>'rech'), 0)::int - coalesce(oli.num(old.data->>'rech'), 0)::int;
      if k > 0 then
        -- el rechazo nuevo (el que no estaba en el reporte anterior); si no se distingue, el último
        select i into x from jsonb_array_elements(case when jsonb_typeof(new.data->'rechInfo') = 'array' then new.data->'rechInfo' else '[]'::jsonb end) with ordinality e(i, o)
          where not exists (select 1 from jsonb_array_elements(case when jsonb_typeof(old.data->'rechInfo') = 'array' then old.data->'rechInfo' else '[]'::jsonb end) p
                            where p->>'c' is not distinct from i->>'c' and p->>'t' is not distinct from i->>'t')
          order by o desc limit 1;
        insert into oli_push_queue (org_id, kind, title, body, tag, url, dev)
        values (new.org_id, 'problema', oli.push_corto(nom || case when k = 1 then ': un cambio no llegó al servidor' else ': ' || k || ' cambios no llegaron al servidor' end, 90),
                oli.push_corto(coalesce(x->>'c', 'Un cambio') || case when coalesce(x->>'e', '') <> '' then ' (' || (x->>'e') || ')' else '' end || '. Revísalo en Equipo.', 160),
                'rech-' || new.doc_id || '-' || coalesce(new.data->>'rech', ''), '#equipo', null);
        hay := true;
      end if;
    end if;

    if hay then perform oli.push_ping(); end if;
  exception when others then
    raise warning 'OLI: no se pudo armar el aviso (% %): %', new.collection, new.doc_id, sqlerrm;   -- un aviso nunca frena una venta
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
  if coalesce(p_endpoint, '') !~ '^https://' or length(p_endpoint) > 1000 or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' or length(p_p256dh) > 200 or length(p_auth) > 100 then raise exception 'suscripción inválida' using errcode = '22023'; end if;
  if not oli.push_prefs_ok(p_prefs) then raise exception 'preferencias inválidas' using errcode = '22023'; end if;
  insert into oli_push_subs (endpoint, org_id, user_id, device_id, p256dh, auth, prefs)
  values (p_endpoint, mem.org_id, auth.uid(), p_dev, p_p256dh, p_auth, coalesce(p_prefs, '{}'::jsonb))
  on conflict (endpoint) do update set org_id = excluded.org_id, user_id = excluded.user_id, device_id = excluded.device_id, p256dh = excluded.p256dh, auth = excluded.auth,
    prefs = coalesce(p_prefs, oli_push_subs.prefs), updated_at = now(), fails = 0, last_error = null;
  return (select jsonb_build_object('prefs', prefs, 'fails', fails, 'last_error', last_error, 'last_ok', last_ok) from oli_push_subs where endpoint = p_endpoint);
end $$;

create or replace function oli_push_prefs(p_endpoint text, p_prefs jsonb default null) returns jsonb
language plpgsql security definer set search_path = public as
$$
begin
  if not oli.push_prefs_ok(p_prefs) then raise exception 'preferencias inválidas' using errcode = '22023'; end if;
  if p_prefs is not null then update oli_push_subs set prefs = p_prefs, updated_at = now() where endpoint = p_endpoint and user_id = auth.uid(); end if;
  return (select jsonb_build_object('prefs', prefs, 'fails', fails, 'last_error', last_error, 'last_ok', last_ok) from oli_push_subs where endpoint = p_endpoint and user_id = auth.uid());
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
  return jsonb_build_object('ok', true, 'url', exists (select 1 from oli_push_conf where k = 'url'), 'net', to_regproc('net.http_post') is not null);
end $$;

revoke all on function oli_push_suscribir(text, text, text, text, jsonb), oli_push_prefs(text, jsonb), oli_push_quitar(text), oli_push_prueba(text) from public, anon;
grant execute on function oli_push_suscribir(text, text, text, text, jsonb), oli_push_prefs(text, jsonb), oli_push_quitar(text), oli_push_prueba(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Lo que usa la Edge Function (solo con la clave de servicio)
-- ---------------------------------------------------------------------------
create or replace function oli_push_claves() returns jsonb language sql stable security definer set search_path = public as
$$ select jsonb_build_object('pub', (select v from oli_push_conf where k = 'vapid_pub'), 'priv', (select v from oli_push_conf where k = 'vapid_priv'), 'sujeto', coalesce((select v from oli_push_conf where k = 'sujeto'), 'https://oli-pos.vercel.app')) $$;

-- la función guarda su propia dirección para que la base de datos la llame (solo una dirección de función de Supabase)
create or replace function oli_push_guardar_url(p_url text) returns void language plpgsql security definer set search_path = public as
$$
begin
  if coalesce(p_url, '') !~ '^https://[a-z0-9-]+\.supabase\.co/functions/v1/oli-push$' then return; end if;
  insert into oli_push_conf (k, v) values ('url', p_url) on conflict (k) do update set v = excluded.v;
end $$;

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
                               and (t.solo_endpoint is not null or (s.prefs -> t.kind) is distinct from 'false'::jsonb)
                               and (t.dev is null or s.device_id is distinct from t.dev)
                               and not (s.endpoint = any(t.entregados))), '[]'::jsonb)) order by t.id), '[]'::jsonb)
    into r from tomados t;
  return r;
end $$;

-- p_ids: avisos terminados; p_entregas: [{id, endpoint}] que sí llegaron (al reintentar no se repiten);
-- p_fallas: [{endpoint, status}] que el servicio de avisos no aceptó (quedan registradas para mostrarlas en Ajustes)
create or replace function oli_push_resultado(p_ids bigint[], p_ok text[], p_malos text[], p_entregas jsonb default '[]'::jsonb, p_fallas jsonb default '[]'::jsonb) returns void language plpgsql security definer set search_path = public as
$$
begin
  update oli_push_queue q set entregados = q.entregados || array(select e->>'endpoint' from jsonb_array_elements(coalesce(p_entregas, '[]'::jsonb)) e where (e->>'id')::bigint = q.id)
    where q.id in (select (e->>'id')::bigint from jsonb_array_elements(coalesce(p_entregas, '[]'::jsonb)) e);
  update oli_push_queue set sent_at = now(), result = 'ok' where id = any(coalesce(p_ids, '{}'));
  update oli_push_subs set last_ok = now(), fails = 0, last_error = null where endpoint = any(coalesce(p_ok, '{}'));
  update oli_push_subs s set fails = s.fails + 1, last_error = 'el servicio de avisos respondió ' || (f->>'status')
    from jsonb_array_elements(coalesce(p_fallas, '[]'::jsonb)) f where s.endpoint = f->>'endpoint';
  delete from oli_push_subs where endpoint = any(coalesce(p_malos, '{}'));                     -- el navegador ya no la tiene (404/410)
  delete from oli_push_queue where sent_at < now() - interval '30 days';
end $$;

revoke all on function oli_push_claves(), oli_push_guardar_claves(text, text), oli_push_guardar_url(text), oli_push_tomar(int), oli_push_resultado(bigint[], text[], text[], jsonb, jsonb) from public, anon, authenticated;
grant execute on function oli_push_claves(), oli_push_guardar_claves(text, text), oli_push_guardar_url(text), oli_push_tomar(int), oli_push_resultado(bigint[], text[], text[], jsonb, jsonb) to service_role;
revoke execute on function oli.push_eventos(), oli.push_ping(), oli.push_nombre_equipo(uuid, text, text), oli.plata(numeric), oli.push_corto(text, int), oli.num(text), oli.push_prefs_ok(jsonb) from public, anon, authenticated;

-- reintento cada minuto: un aviso que falló (o cuya llamada se perdió) no espera a que haya otra venta
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'oli-push-reintentar';
    perform cron.schedule('oli-push-reintentar', '* * * * *',
      $c$ select oli.push_ping() where exists (select 1 from public.oli_push_queue where sent_at is null and tries < 5 and created_at > now() - interval '2 hours' and (claimed_at is null or claimed_at < now() - interval '2 minutes')) $c$);
  end if;
exception when others then raise warning 'OLI: no se pudo programar el reintento de avisos (pg_cron): %', sqlerrm; end $$;
