-- OLI · diferencias de caja: el administrador dice qué pasó y OLI lo corrige donde corresponde (pantalla "Diferencia de caja", 61-difcaja).
-- Colección "ajustescaja": un documento por caja (id = el de la caja), items {id, t, uid, cierre, tipo, monto, ventas, de, a, conf, gasto, mot, nota}
-- o {id, t, uid, anula} para deshacer uno. Nada se borra: los items se unen por id (como las anulaciones).
-- La escribe solo el administrador (nivel 3, el de siempre) y la leen todos los equipos (nivel 2): la caja ve que su diferencia ya se revisó.
-- Cuando un ajuste dice que una venta se pagó por otro medio (tipo "medio" con ventas), el pago de esa venta (payments) queda con el medio
-- corregido; si se deshace, vuelve al de la venta. La venta (sales) no cambia: guarda cómo se marcó al vender.
-- Idempotente (marca en oli_apply: 'facturas','ajustescaja'; en oli.project: ajustes_caja).

create or replace function oli.merge_fields(c text) returns text[] language sql immutable set search_path = public as
$$ select case c when 'ventas' then array['ventas'] when 'cajas' then array['movs','cierres'] when 'mermas' then array['items']
  when 'anulaciones' then array['items'] when 'confirmaciones' then array['items'] when 'demandaperdida' then array['items']
  when 'reaperturas' then array['items'] when 'movinv' then array['items'] when 'audit' then array['items'] when 'cajashelado' then array['items']
  when 'facturas' then array['items'] when 'ajustescaja' then array['items'] else array[]::text[] end $$;

-- el medio de pago vigente de cada venta que corrige este documento: la corrección más reciente que no se deshizo; si no queda ninguna, el de la venta
create or replace function oli.project_ajustes(p_org uuid, d jsonb, del boolean) returns void language plpgsql set search_path = public as
$$
declare sid text; x jsonb; its jsonb := case when jsonb_typeof(d->'items') = 'array' then d->'items' else '[]'::jsonb end;
  anul text[]; dig text[] := array['Nequi','Daviplata','QR Bancolombia'];
begin
  if del then return; end if;
  anul := array(select it->>'anula' from jsonb_array_elements(its) it where it ? 'anula');
  for sid in select distinct v from jsonb_array_elements(its) it, jsonb_array_elements_text(case when jsonb_typeof(it->'ventas') = 'array' then it->'ventas' else '[]'::jsonb end) v
             where it->>'tipo' = 'medio' loop
    x := (select it from jsonb_array_elements(its) it
          where it->>'tipo' = 'medio' and jsonb_typeof(it->'ventas') = 'array' and it->'ventas' ? sid and coalesce(it->>'a', '') <> '' and not coalesce(it->>'id' = any(anul), false)
          order by coalesce((it->>'t')::bigint, 0) desc limit 1);
    if x is not null then
      update payments set method = x->>'a',
        confirmed = not ((x->>'a') = any(dig)) or coalesce((x->>'conf')::boolean, false),
        confirmed_at = case when not ((x->>'a') = any(dig)) or coalesce((x->>'conf')::boolean, false) then coalesce(confirmed_at, oli.ms((x->>'t')::bigint)) end
      where org_id = p_org and sale_id = sid;
    else
      update payments p set method = s.method,
        confirmed = not (s.method = any(dig))
          or exists (select 1 from oli_docs o, jsonb_array_elements(coalesce(o.data->'items', '[]'::jsonb)) ci where o.org_id = p_org and o.collection = 'confirmaciones' and ci->>'ventaId' = sid)
          or exists (select 1 from oli_docs o, jsonb_array_elements(coalesce(o.data->'ventas', '[]'::jsonb)) sv where o.org_id = p_org and o.collection = 'ventas' and sv->>'id' = sid and coalesce((sv->>'confirmada')::boolean, false))
      from sales s where p.org_id = p_org and p.sale_id = sid and s.org_id = p_org and s.id = sid and s.method is not null;
    end if;
  end loop;
end $$;

do $m$
declare src text;
  a1 text := $n$'cajashelado','facturas') then status := 'rejected'; detail := 'colección desconocida';$n$;
  b1 text := $n$'cajashelado','facturas','ajustescaja') then status := 'rejected'; detail := 'colección desconocida';$n$;
begin
  src := pg_get_functiondef('public.oli_apply(jsonb,text,text)'::regprocedure);
  if position('''facturas'',''ajustescaja''' in src) > 0 then return; end if;
  if position(a1 in src) = 0 then raise exception 'oli_apply: no se encontró la lista de colecciones'; end if;
  execute replace(src, a1, b1);
end $m$;

do $m$
declare src text;
  a1 text := $n$  elsif c = 'cajashelado' then perform oli.project_c(p_org, p_store, c, id, d, del);$n$;
  b1 text := $n$  elsif c = 'cajashelado' then perform oli.project_c(p_org, p_store, c, id, d, del);
  elsif c = 'ajustescaja' then perform oli.project_ajustes(p_org, d, del);   -- ajustes_caja$n$;
begin
  src := pg_get_functiondef('oli.project(uuid,uuid,text,text,jsonb,boolean)'::regprocedure);
  if position('ajustes_caja' in src) > 0 then return; end if;
  if position(a1 in src) = 0 then raise exception 'oli.project: no se encontró dónde poner los ajustes de caja'; end if;
  execute replace(src, a1, b1);
end $m$;
