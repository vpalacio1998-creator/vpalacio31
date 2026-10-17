-- Un sabor de helado (producto con "sabor": true, que se lleva por cajas) dentro de un combo o en lo que una venta dijo que
-- gastó son BOLAS, no cajas: no se descuenta del inventario por venta. Las cajas de helado bajan solo al abrir una caja nueva
-- (cajashelado → inventory_movements). Así el inventario del servidor coincide con el de la app (20-domain.js: bolasDeLinea).
create or replace view inventory_current with (security_invoker = true) as
with lines as (
  select si.org_id, si.sale_id, si.product_id, si.qty, si.consumption, s.sold_at from sale_items si
  join sales s on s.org_id = si.org_id and s.id = si.sale_id
  where not exists (select 1 from sale_voids v where v.org_id = s.org_id and v.sale_id = s.id)
), sabores as (
  select o.org_id, o.doc_id as product_id from oli_docs o
  where o.collection = 'productos' and coalesce((o.data->>'sabor')::boolean, false)
), exp as (
  select l.org_id, l.sold_at, (g.value->>'q')::numeric as qty, g.value->>'pid' as product_id          -- lo que la línea dijo que gastó (conos: barquillo + cucurucho o vaso)
  from lines l, lateral jsonb_array_elements(l.consumption) g(value) where jsonb_typeof(l.consumption) = 'array'
    and not exists (select 1 from sabores sb where sb.org_id = l.org_id and sb.product_id = g.value->>'pid')
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
