-- OLI · reglas del servidor que antes dependían solo de la app (auditoría del 18-oct).
-- 1) La hora que manda un equipo no puede quedar más de 10 minutos en el futuro: un reloj adelantado (o un envío hecho a mano
--    con t = 9999999999999) dejaba los documentos "bloqueados" y los cambios reales de los demás salían como viejos.
-- 2) El latido de un equipo que usa una cuenta de empleado siempre dice esa cuenta y rol empleado (no puede decir "admin" ni
--    otra persona).
-- 3) Si el administrador apagó "Los empleados pueden sacar dinero de caja", un retiro o pago desde caja de un empleado que llega
--    igual (equipo sin Internet con el permiso viejo, versión vieja de la app o envío hecho a mano) NO se pierde, porque la plata
--    sí salió de la caja: se guarda marcado "sinPermiso" y el aviso al administrador lo dice. Rechazarlo escondería el faltante
--    y trabaría el cierre de esa caja.
-- 4) Una pérdida (merma) de un empleado tiene que tener cantidad mayor que cero (una negativa sumaría inventario).
-- Idempotente: se aplica una sola vez sobre la versión que esté en el servidor (marca: reglas_servidor).

create or replace function oli.permiso_mov_apagado(p_org uuid) returns boolean language sql stable security definer set search_path = public as
$$ select coalesce((select o.data->>'movimientosEmpleado' from oli_docs o where o.org_id = p_org and o.collection = 'meta' and o.doc_id = 'permisos'), 'true') = 'false' $$;

-- marca los retiros y pagos NUEVOS (que el servidor no tenía en ese documento) como hechos sin permiso
create or replace function oli.marcar_movs_sin_permiso(p_org uuid, p_id text, p_doc jsonb) returns jsonb language sql stable security definer set search_path = public as
$$ select jsonb_set(p_doc, '{movs}', coalesce((
     select jsonb_agg(case when m->>'tipo' in ('retiro', 'gasto')
                            and not exists (select 1 from oli_docs o, jsonb_array_elements(case when jsonb_typeof(o.data->'movs') = 'array' then o.data->'movs' else '[]'::jsonb end) x
                                            where o.org_id = p_org and o.collection = 'cajas' and o.doc_id = p_id and x->>'id' = m->>'id')
                           then m || '{"sinPermiso": true}'::jsonb else m end order by n)
     from jsonb_array_elements(p_doc->'movs') with ordinality as e(m, n)), '[]'::jsonb)) $$;

-- cada pérdida del documento con cantidad numérica mayor que cero
create or replace function oli.mermas_ok(p_doc jsonb) returns boolean language sql immutable set search_path = pg_catalog as
$$ select jsonb_typeof(coalesce(p_doc->'items', '[]'::jsonb)) = 'array'
      and not exists (select 1 from jsonb_array_elements(coalesce(p_doc->'items', '[]'::jsonb)) i
                      where jsonb_typeof(i->'q') <> 'number' or (i->>'q')::numeric <= 0) $$;

revoke execute on function oli.permiso_mov_apagado(uuid), oli.marcar_movs_sin_permiso(uuid, text, jsonb), oli.mermas_ok(jsonb) from public, anon, authenticated;

do $m$
declare src text;
  a_ts text := $n$dev := coalesce(op->>'device_id', p_device_id);$n$;
  b_ts text := $n$dev := coalesce(op->>'device_id', p_device_id); ts := least(ts, (extract(epoch from clock_timestamp()) * 1000)::bigint + 600000);   -- reglas_servidor: nada más de 10 min en el futuro$n$;
  a_rej text := $n$    elsif c = 'cajashelado' and lvl < 3 and not oli.helado_ok(mem.org_id, id, d) then$n$;
  b_rej text := $n$    elsif c = 'mermas' and lvl < 3 and not del and not oli.mermas_ok(d) then status := 'rejected'; detail := 'una pérdida debe tener una cantidad mayor que cero';
    elsif c = 'cajashelado' and lvl < 3 and not oli.helado_ok(mem.org_id, id, d) then$n$;
  a_cur text := $n$    select * into cur from oli_docs where org_id = mem.org_id and collection = c and doc_id = id for update;$n$;
  b_cur text := $n$    if not del and lvl < 3 and c = 'dispositivos' and jsonb_typeof(d) = 'object' then d := d || jsonb_build_object('uid', uid::text, 'rol', 'empleado'); end if;
    if not del and lvl < 3 and c = 'cajas' and jsonb_typeof(d->'movs') = 'array' and oli.permiso_mov_apagado(mem.org_id) then d := oli.marcar_movs_sin_permiso(mem.org_id, id, d); end if;
    select * into cur from oli_docs where org_id = mem.org_id and collection = c and doc_id = id for update;$n$;
begin
  src := pg_get_functiondef('public.oli_apply(jsonb,text,text)'::regprocedure);
  if position('reglas_servidor' in src) > 0 then return; end if;
  if position(a_ts in src) = 0 or position(a_rej in src) = 0 or position(a_cur in src) = 0 then raise exception 'oli_apply: no se encontró dónde poner las reglas del servidor'; end if;
  src := replace(src, a_ts, b_ts);
  src := replace(src, a_rej, b_rej);
  src := replace(src, a_cur, b_cur);
  execute src;
end $m$;

-- el aviso al administrador dice cuando un retiro o pago se hizo sin permiso
do $m$
declare src text;
  a text := $n$oli.push_corto(coalesce(it->>'motivo', ''), 160), 'mov-' || (it->>'id')$n$;
  b text := $n$oli.push_corto(case when it->>'sinPermiso' = 'true' then 'Sin permiso para empleados · ' else '' end || coalesce(it->>'motivo', ''), 160), 'mov-' || (it->>'id')$n$;
begin
  src := pg_get_functiondef('oli.push_eventos()'::regprocedure);
  if position('sinPermiso' in src) > 0 then return; end if;
  if position(a in src) = 0 then raise exception 'oli.push_eventos: no se encontró el aviso de los movimientos de caja'; end if;
  execute replace(src, a, b);
end $m$;
