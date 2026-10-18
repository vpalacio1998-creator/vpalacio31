-- OLI · inventario en el servidor (auditoría del 18-oct).
-- 1) Lo que una venta dice que gastó (gasta / consumption: el barquillo y el cucurucho o vaso de un cono) solo cuenta si es un
--    insumo y una cantidad razonable (más de 0 y como mucho 3 por unidad vendida). Un dato raro no puede sumar inventario (cantidad
--    negativa) ni descontar otro producto. No se rechaza la venta (el documento trae todas las ventas del día de ese equipo): solo se ignora
--    ese dato, igual que hace la app (consumoBruto), para que la app y el servidor den el mismo número.
-- 2) Un cambio de caja de helado solo descuenta una caja si el sabor es de verdad un sabor de helado y el motivo es "acabo" o "danada".
-- 3) Al borrar un documento de pérdidas, movimientos de inventario o cambios de caja, se borran también sus filas en las tablas de
--    consulta (antes quedaban huérfanas: hoy hay 9 pérdidas de la demostración así; no se tocan aquí, las decide el dueño).
-- Idempotente (marcas: inventario_servidor).

create or replace view inventory_current with (security_invoker = true) as
with lines as (
  select si.org_id, si.sale_id, si.product_id, si.qty, si.consumption, s.sold_at from sale_items si
  join sales s on s.org_id = si.org_id and s.id = si.sale_id
  where not exists (select 1 from sale_voids v where v.org_id = s.org_id and v.sale_id = s.id)
), sabores as (
  select o.org_id, o.doc_id as product_id from oli_docs o
  where o.collection = 'productos' and coalesce((o.data->>'sabor')::boolean, false)
), gasto as (   -- lo que la línea dijo que gastó (conos: barquillo + cucurucho o vaso); una cantidad que no es número queda en null (no rompe la consulta)
  select l.org_id, l.sold_at, l.qty as lqty, g.value->>'pid' as product_id,
         case when g.value->>'q' ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then (g.value->>'q')::numeric end as qty
  from lines l, lateral jsonb_array_elements(l.consumption) g(value) where jsonb_typeof(l.consumption) = 'array'
), exp as (
  select gs.org_id, gs.sold_at, gs.qty, gs.product_id from gasto gs
  where not exists (select 1 from sabores sb where sb.org_id = gs.org_id and sb.product_id = gs.product_id)
    and gs.qty > 0 and gs.qty <= gs.lqty * 3                                                              -- inventario_servidor: solo cantidades razonables
    and exists (select 1 from products px where px.org_id = gs.org_id and px.id = gs.product_id and px.type = 'insumo')   -- y solo insumos
  union all
  select l.org_id, l.sold_at, l.qty * (c.value->>'q')::numeric as qty, c.value->>'pid' as product_id
  from lines l join products p on p.org_id = l.org_id and p.id = l.product_id and p.combo is not null, lateral jsonb_array_elements(p.combo) c(value) where l.consumption is null
    and not exists (select 1 from sabores sb where sb.org_id = l.org_id and sb.product_id = c.value->>'pid')
  union all
  select l.org_id, l.sold_at, l.qty, l.product_id from lines l left join products p on p.org_id = l.org_id and p.id = l.product_id where p.combo is null and l.consumption is null
)
select c.org_id, c.product_id, c.base - coalesce((select sum(e.qty) from exp e where e.org_id = c.org_id and e.product_id = c.product_id and e.sold_at > c.counted_at), 0)
       - coalesce((select sum(w.qty) from waste w where w.org_id = c.org_id and w.product_id = c.product_id and w.at > c.counted_at), 0)
       + coalesce((select sum(m.qty) from inventory_movements m where m.org_id = c.org_id and m.product_id = c.product_id and m.delta and m.at > c.counted_at), 0) as qty, c.counted_at
from inventory_counts c;

do $m$
declare src text;
  -- project_b: al borrar un documento de pérdidas o de movimientos, se borran sus filas (por los ids de sus items)
  a1 text := $n$  if c = 'mermas' then$n$;
  b1 text := $n$  if del and c in ('mermas', 'movinv') then   -- inventario_servidor: el documento que se borra llega en d
    if c = 'mermas' then execute 'dele' || 'te from waste where org_id = $1 and id = any($2)' using p_org, array(select s2->>'id' from jsonb_array_elements(coalesce(d->'items','[]'::jsonb)) s2);
    else execute 'dele' || 'te from inventory_movements where org_id = $1 and id = any($2)' using p_org, array(select s2->>'id' from jsonb_array_elements(coalesce(d->'items','[]'::jsonb)) s2); end if;
    return;
  end if;
  if c = 'mermas' then$n$;
begin
  src := pg_get_functiondef('oli.project_b(uuid,uuid,text,text,jsonb,boolean)'::regprocedure);
  if position('inventario_servidor' in src) = 0 then
    if position(a1 in src) = 0 then raise exception 'oli.project_b: no se encontró dónde poner el borrado'; end if;
    execute replace(src, a1, b1);
  end if;
end $m$;

do $m$
declare src text;
  a1 text := $n$  if c <> 'cajashelado' or del then return; end if;$n$;
  b1 text := $n$  if c <> 'cajashelado' then return; end if;
  if del then   -- inventario_servidor: el documento que se borra llega en d; sus cajas abiertas dejan de descontarse
    execute 'dele' || 'te from inventory_movements where org_id = $1 and id = any($2)' using p_org, array(select 'caja_' || (x2->>'id') from jsonb_array_elements(coalesce(d->'items','[]'::jsonb)) x2);
    return;
  end if;$n$;
  a2 text := $n$    elsif coalesce(it->>'motivo','') <> 'inicio' and not exists$n$;
  b2 text := $n$    elsif it->>'motivo' in ('acabo', 'danada')
          and exists (select 1 from oli_docs op where op.org_id = p_org and op.collection = 'productos' and op.doc_id = it->>'sabor' and coalesce((op.data->>'sabor')::boolean, false))
          and not exists$n$;
begin
  src := pg_get_functiondef('oli.project_c(uuid,uuid,text,text,jsonb,boolean)'::regprocedure);
  if position('inventario_servidor' in src) = 0 then
    if position(a1 in src) = 0 or position(a2 in src) = 0 then raise exception 'oli.project_c: no se encontró dónde poner las reglas'; end if;
    execute replace(replace(src, a1, b1), a2, b2);
  end if;
end $m$;

do $m$
declare src text;
  a1 text := $n$perform oli.project(mem.org_id, mem.store_id, c, id, null, true);$n$;
  b1 text := $n$perform oli.project(mem.org_id, mem.store_id, c, id, case when c in ('mermas', 'movinv', 'cajashelado') then cur.data end, true);   -- inventario_servidor$n$;
begin
  src := pg_get_functiondef('public.oli_apply(jsonb,text,text)'::regprocedure);
  if position('inventario_servidor' in src) > 0 then return; end if;
  if position(a1 in src) = 0 then raise exception 'oli_apply: no se encontró el borrado'; end if;
  execute replace(src, a1, b1);
end $m$;
