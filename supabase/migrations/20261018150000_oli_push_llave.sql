-- OLI · la función de notificaciones (Edge Function oli-push) solo atiende a la base de datos.
-- Corre sin sesión (verify_jwt = false) porque la llama la base de datos; antes cualquiera podía llamarla (no exponía datos: solo
-- mandaba lo que ya estaba en la cola, que igual sale al minuto). Ahora la base de datos manda una llave (x-oli-llave), generada aquí y
-- guardada en oli_push_conf (sin acceso desde la app), y la función rechaza lo que no la traiga. GET (la clave pública) sigue abierto.
-- Compatible en cualquier orden: si la función todavía no conoce la llave, no la exige.
insert into oli_push_conf (k, v) values ('llave', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')) on conflict (k) do nothing;

create or replace function oli.push_ping() returns void language plpgsql security definer set search_path = public as
$$
declare u text; l text;
begin
  select v into u from oli_push_conf where k = 'url';
  select v into l from oli_push_conf where k = 'llave';
  if u is null or to_regproc('net.http_post') is null then return; end if;
  execute 'select net.http_post(url := $1, body := ''{}''::jsonb, headers := jsonb_build_object(''Content-Type'', ''application/json'', ''x-oli-llave'', coalesce($2, '''')), timeout_milliseconds := 8000)' using u, l;
exception when others then null;                                   -- sin aviso inmediato: sale con el siguiente
end $$;

create or replace function oli_push_claves() returns jsonb language sql stable security definer set search_path = public as
$$ select jsonb_build_object('pub', (select v from oli_push_conf where k = 'vapid_pub'), 'priv', (select v from oli_push_conf where k = 'vapid_priv'), 'sujeto', coalesce((select v from oli_push_conf where k = 'sujeto'), 'https://oli-pos.vercel.app'),
  'llave', (select v from oli_push_conf where k = 'llave')) $$;
