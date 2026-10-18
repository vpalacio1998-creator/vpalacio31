-- OLI · arreglos de la revisión independiente del 18-oct (servidor).
-- 1) Datos del cliente que pide factura: una versión vieja de la app los manda dentro de la venta (cliente: {doc, nombre, correo}), que
--    leen todos los equipos. El servidor los pasa a "facturas" (solo administrador) y en la venta deja cliente: true; en sales.customer
--    tampoco quedan.
-- 2) Corrección de medio de pago: un pago que se confirmó (confirmaciones) no vuelve a quedar "por confirmar" cuando se guarda otro
--    ajuste en la misma caja; y si la corrección llega antes que la venta, se aplica cuando llega la venta.
-- 3) Una pérdida sin cantidad (o con una cantidad que no es número) se rechaza con un mensaje, en vez de hacer fallar todo el envío.
-- Idempotente (marcas: revision_oct18).

create or replace function oli.ventas_sin_cliente() returns trigger language plpgsql security definer set search_path = public as
$$
declare its jsonb;
begin
  if jsonb_typeof(new.data->'ventas') is distinct from 'array' then return new; end if;
  its := (select coalesce(jsonb_agg(jsonb_build_object('id', 'f-' || (v->>'id'), 'ventaId', v->>'id', 't', v->'t', 'uid', v->>'uid',
            'doc', coalesce(v#>>'{cliente,doc}', ''), 'nombre', coalesce(v#>>'{cliente,nombre}', ''), 'correo', coalesce(v#>>'{cliente,correo}', ''))), '[]'::jsonb)
          from jsonb_array_elements(new.data->'ventas') v where jsonb_typeof(v->'cliente') = 'object');
  if jsonb_array_length(its) = 0 then return new; end if;
  new.data := jsonb_set(new.data, '{ventas}', (select jsonb_agg(case when jsonb_typeof(v->'cliente') = 'object' then jsonb_set(v, '{cliente}', 'true'::jsonb) else v end order by n)
                                               from jsonb_array_elements(new.data->'ventas') with ordinality e(v, n)));
  insert into oli_docs (org_id, store_id, collection, doc_id, data, device_id, device_ts)
  values (new.org_id, new.store_id, 'facturas', new.doc_id, jsonb_build_object('fecha', new.data->>'fecha', 'dev', new.data->>'dev', 'items', its), new.device_id, new.device_ts)
  on conflict (org_id, collection, doc_id) do update
    set data = jsonb_set(oli_docs.data, '{items}', coalesce(oli_docs.data->'items', '[]'::jsonb) || (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(excluded.data->'items') x
               where not exists (select 1 from jsonb_array_elements(coalesce(oli_docs.data->'items', '[]'::jsonb)) y where y->>'id' = x->>'id'))),
        server_ts = now(), rev = oli_docs.rev + 1;
  return new;
end $$;
revoke execute on function oli.ventas_sin_cliente() from public, anon, authenticated;
do $m$
begin
  if not exists (select 1 from pg_trigger where tgname = 'oli_docs_ventas_sin_cliente') then
    create trigger oli_docs_ventas_sin_cliente before insert or update on oli_docs for each row when (new.collection = 'ventas') execute function oli.ventas_sin_cliente();
  end if;
end $m$;

do $m$
declare src text;
  a1 text := $n$s->'cliente', s->>'ref')$n$;
  b1 text := $n$case when jsonb_typeof(s->'cliente') = 'object' then 'true'::jsonb else s->'cliente' end, s->>'ref')   /* revision_oct18 */$n$;
begin
  src := pg_get_functiondef('oli.project_a(uuid,uuid,text,text,jsonb,boolean)'::regprocedure);
  if position('revision_oct18' in src) > 0 then return; end if;
  if position(a1 in src) = 0 then raise exception 'oli.project_a: no se encontró dónde se guarda el cliente de la venta'; end if;
  execute replace(src, a1, b1);
end $m$;

-- el medio de pago vigente de cada venta que corrige este documento (ver 20261018140000): ahora también cuenta si el pago ya se confirmó
create or replace function oli.project_ajustes(p_org uuid, d jsonb, del boolean) returns void language plpgsql set search_path = public as
$$
declare sid text; x jsonb; its jsonb := case when jsonb_typeof(d->'items') = 'array' then d->'items' else '[]'::jsonb end;
  anul text[]; dig text[] := array['Nequi','Daviplata','QR Bancolombia']; conf boolean;
begin
  if del then return; end if;
  anul := array(select it->>'anula' from jsonb_array_elements(its) it where it ? 'anula');
  for sid in select distinct v from jsonb_array_elements(its) it, jsonb_array_elements_text(case when jsonb_typeof(it->'ventas') = 'array' then it->'ventas' else '[]'::jsonb end) v
             where it->>'tipo' = 'medio' loop
    x := (select it from jsonb_array_elements(its) it
          where it->>'tipo' = 'medio' and jsonb_typeof(it->'ventas') = 'array' and it->'ventas' ? sid and coalesce(it->>'a', '') <> '' and not coalesce(it->>'id' = any(anul), false)
          order by coalesce((it->>'t')::bigint, 0) desc limit 1);
    conf := exists (select 1 from oli_docs o, jsonb_array_elements(coalesce(o.data->'items', '[]'::jsonb)) ci where o.org_id = p_org and o.collection = 'confirmaciones' and ci->>'ventaId' = sid);
    if x is not null then
      update payments set method = x->>'a',
        confirmed = not ((x->>'a') = any(dig)) or coalesce((x->>'conf')::boolean, false) or conf,
        confirmed_at = case when not ((x->>'a') = any(dig)) or coalesce((x->>'conf')::boolean, false) or conf then coalesce(confirmed_at, oli.ms((x->>'t')::bigint)) end
      where org_id = p_org and sale_id = sid;
    else
      update payments p set method = s.method,
        confirmed = not (s.method = any(dig)) or conf
          or exists (select 1 from oli_docs o, jsonb_array_elements(coalesce(o.data->'ventas', '[]'::jsonb)) sv where o.org_id = p_org and o.collection = 'ventas' and sv->>'id' = sid and coalesce((sv->>'confirmada')::boolean, false))
      from sales s where p.org_id = p_org and p.sale_id = sid and s.org_id = p_org and s.id = sid and s.method is not null;
    end if;
  end loop;
end $$;

-- cuando llegan las ventas de una caja, se les aplica la corrección de medio que el administrador ya hubiera guardado (el documento de
-- ajustes tiene el mismo id que el de las ventas: fecha_equipo)
do $m$
declare src text;
  a1 text := $n$  else perform oli.project_b(p_org, p_store, c, id, d, del); end if;$n$;
  b1 text := $n$  else perform oli.project_b(p_org, p_store, c, id, d, del); end if;
  if c = 'ventas' and not del then perform oli.project_ajustes(p_org, (select o.data from oli_docs o where o.org_id = p_org and o.collection = 'ajustescaja' and o.doc_id = id), false); end if;   -- revision_oct18$n$;
begin
  src := pg_get_functiondef('oli.project(uuid,uuid,text,text,jsonb,boolean)'::regprocedure);
  if position('revision_oct18' in src) > 0 then return; end if;
  if position(a1 in src) = 0 then raise exception 'oli.project: no se encontró el final del reparto'; end if;
  execute replace(src, a1, b1);
end $m$;

-- cada pérdida con cantidad numérica mayor que cero (sin cantidad, o con texto, se rechaza: antes un item sin cantidad pasaba y el
-- envío completo fallaba al guardarla)
create or replace function oli.mermas_ok(p_doc jsonb) returns boolean language sql immutable set search_path = pg_catalog as
$$ select jsonb_typeof(coalesce(p_doc->'items', '[]'::jsonb)) = 'array'
      and not exists (select 1 from jsonb_array_elements(coalesce(p_doc->'items', '[]'::jsonb)) i
                      where case when jsonb_typeof(i->'q') = 'number' then (i->>'q')::numeric <= 0 else true end) $$;
