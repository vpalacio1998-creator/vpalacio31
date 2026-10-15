-- OLI · cambios de caja de helado (cajashelado): la empleada marca cuándo cambia la caja de un sabor; cada equipo escribe solo sus documentos.
-- Idempotente: se puede aplicar sobre una base que ya tiene oli_core.
create or replace function oli.col_write_min(c text) returns int language sql immutable as
$$ select case when c in ('ventas','cajas','mermas','checklists','anulaciones','confirmaciones','demandaperdida','dispositivos','audit','cajashelado') then 2 else 3 end $$;
create or replace function oli.single_writer(c text) returns boolean language sql immutable as
$$ select c in ('ventas','cajas','mermas','checklists','anulaciones','confirmaciones','demandaperdida','cajashelado') $$;
create or replace function oli.merge_fields(c text) returns text[] language sql immutable as
$$ select case c when 'ventas' then array['ventas'] when 'cajas' then array['movs','cierres'] when 'mermas' then array['items']
  when 'anulaciones' then array['items'] when 'confirmaciones' then array['items'] when 'demandaperdida' then array['items']
  when 'reaperturas' then array['items'] when 'movinv' then array['items'] when 'audit' then array['items'] when 'cajashelado' then array['items'] else array[]::text[] end $$;
do $m$
declare src text; viejo text := $n$'periodos','docelec','movinv') then status := 'rejected'; detail := 'colección desconocida';$n$;
begin
  src := pg_get_functiondef('public.oli_apply(jsonb,text,text)'::regprocedure);
  if position('''cajashelado''' in src) > 0 then return; end if;
  if position(viejo in src) = 0 then raise exception 'oli_apply: no se encontró la lista de colecciones'; end if;
  execute replace(src, viejo, $n$'periodos','docelec','movinv','cajashelado') then status := 'rejected'; detail := 'colección desconocida';$n$);
end $m$;
alter function oli.col_write_min(text) set search_path = public;
alter function oli.single_writer(text) set search_path = public;
alter function oli.merge_fields(text) set search_path = public;

-- ---------------------------------------------------------------------------
-- Conos: cada línea de venta guarda lo que gastó y sus opciones; el inventario del servidor lo descuenta
alter table sale_items add column if not exists consumption jsonb;
alter table sale_items add column if not exists options jsonb;
do $m$
declare src text;
  ins_viejo text := $n$tax_type, tax_rate, tax_base, tax_value)
        values (p_org, s->>'id', n, it->>'pid', it->>'n', (it->>'q')::numeric, (it->>'p')::numeric, coalesce((it->>'d')::numeric,0), it#>>'{imp,t}', (it#>>'{imp,r}')::numeric, (it#>>'{imp,base}')::numeric, (it#>>'{imp,v}')::numeric)$n$;
  ins_nuevo text := $n$tax_type, tax_rate, tax_base, tax_value, consumption, options)
        values (p_org, s->>'id', n, it->>'pid', it->>'n', (it->>'q')::numeric, (it->>'p')::numeric, coalesce((it->>'d')::numeric,0), it#>>'{imp,t}', (it#>>'{imp,r}')::numeric, (it#>>'{imp,base}')::numeric, (it#>>'{imp,v}')::numeric,
                case when jsonb_typeof(it->'gasta') = 'array' then it->'gasta' end, case when it ? 'sab' then jsonb_build_object('sab', it->'sab', 'pres', it->'pres', 'det', it->'det') end)$n$;
begin
  src := pg_get_functiondef('oli.project_a(uuid,uuid,text,text,jsonb,boolean)'::regprocedure);
  if position('consumption' in src) = 0 then
    if position(ins_viejo in src) = 0 then raise exception 'project_a: no se encontró el insert de sale_items'; end if;
    src := replace(src, ins_viejo, ins_nuevo);
  end if;
  -- un "orden" con decimales no debe tumbar todo el lote
  src := replace(src, $n$d->'combo', (d->>'orden')::int, now())$n$, $n$d->'combo', round((d->>'orden')::numeric)::int, now())$n$);
  execute src;
end $m$;

-- cambios de caja de helado: abrir una caja nueva resta una caja cerrada (kardex); un cambio anulado se quita (venga de donde venga la anulación)
create or replace function oli.project_c(p_org uuid, p_store uuid, c text, id text, d jsonb, del boolean) returns void language plpgsql as
$$
#variable_conflict use_column
declare it jsonb;
begin
  if c <> 'cajashelado' or del then return; end if;
  for it in select * from jsonb_array_elements(coalesce(d->'items','[]'::jsonb)) loop
    if it ? 'anula' then
      delete from inventory_movements m where m.org_id = p_org and m.id = 'caja_' || (it->>'anula');
    elsif coalesce(it->>'motivo','') <> 'inicio' and not exists (select 1 from oli_docs o, jsonb_array_elements(coalesce(o.data->'items','[]'::jsonb)) x
                                                                    where o.org_id = p_org and o.collection = 'cajashelado' and x->>'anula' = it->>'id') then
      insert into inventory_movements (org_id, id, product_id, type, qty, delta, reason, ref, at, user_id, device_id, local_date)
      values (p_org, 'caja_' || (it->>'id'), it->>'sabor', 'apertura_caja', -1, true, case when it->>'motivo' = 'danada' then 'la caja anterior se dañó' else 'caja nueva' end,
              it->>'obs', oli.ms((it->>'t')::bigint), it->>'uid', d->>'dev', (d->>'fecha')::date)
      on conflict (org_id, id) do nothing;
    end if;
  end loop;
end $$;

create or replace function oli.project(p_org uuid, p_store uuid, c text, id text, d jsonb, del boolean) returns void language plpgsql as
$$
begin
  -- dividida en dos mitades para que cada función sea pequeña
  if c in ('productos','costos','stock','ventas','anulaciones','confirmaciones','cajas') then perform oli.project_a(p_org, p_store, c, id, d, del);
  elsif c = 'cajashelado' then perform oli.project_c(p_org, p_store, c, id, d, del);
  else perform oli.project_b(p_org, p_store, c, id, d, del); end if;
end $$;

-- cambios de caja de helado: un empleado solo anula cambios que están en el documento de su propio equipo
create or replace function oli.helado_ok(p_org uuid, p_doc text, d jsonb) returns boolean language sql stable security definer set search_path = public as
$$ select not exists (
     select 1 from jsonb_array_elements(coalesce(d->'items','[]'::jsonb)) it
     where it ? 'anula'
       and not exists (select 1 from jsonb_array_elements(coalesce(d->'items','[]'::jsonb)) y where y->>'id' = it->>'anula' and not (y ? 'anula'))
       and not exists (select 1 from oli_docs o, jsonb_array_elements(coalesce(o.data->'items','[]'::jsonb)) x
                       where o.org_id = p_org and o.collection = 'cajashelado' and o.doc_id = p_doc and x->>'id' = it->>'anula')) $$;

create or replace view inventory_current with (security_invoker = true) as
with lines as (
  select si.org_id, si.sale_id, si.product_id, si.qty, si.consumption, s.sold_at from sale_items si
  join sales s on s.org_id = si.org_id and s.id = si.sale_id
  where not exists (select 1 from sale_voids v where v.org_id = s.org_id and v.sale_id = s.id)
), exp as (
  select l.org_id, l.sold_at, (g.value->>'q')::numeric as qty, g.value->>'pid' as product_id          -- lo que la línea dijo que gastó (conos: barquillo + cucurucho o vaso)
  from lines l, lateral jsonb_array_elements(l.consumption) g(value) where jsonb_typeof(l.consumption) = 'array'
  union all
  select l.org_id, l.sold_at, l.qty * (c.value->>'q')::numeric as qty, c.value->>'pid' as product_id
  from lines l join products p on p.org_id = l.org_id and p.id = l.product_id and p.combo is not null, lateral jsonb_array_elements(p.combo) c(value) where l.consumption is null
  union all
  select l.org_id, l.sold_at, l.qty, l.product_id from lines l left join products p on p.org_id = l.org_id and p.id = l.product_id where p.combo is null and l.consumption is null
)
select c.org_id, c.product_id, c.base - coalesce((select sum(e.qty) from exp e where e.org_id = c.org_id and e.product_id = c.product_id and e.sold_at > c.counted_at), 0)
       - coalesce((select sum(w.qty) from waste w where w.org_id = c.org_id and w.product_id = c.product_id and w.at > c.counted_at), 0)
       + coalesce((select sum(m.qty) from inventory_movements m where m.org_id = c.org_id and m.product_id = c.product_id and m.delta and m.at > c.counted_at), 0) as qty, c.counted_at
from inventory_counts c;

do $m$
declare src text; viejo text := $n$then status := 'rejected'; detail := 'el empleado solo anula su propia venta en los 10 minutos siguientes';$n$;
begin
  src := pg_get_functiondef('public.oli_apply(jsonb,text,text)'::regprocedure);
  if position('helado_ok' in src) > 0 then return; end if;
  if position(viejo in src) = 0 then raise exception 'oli_apply: no se encontró la regla de anulaciones'; end if;
  execute replace(src, viejo, viejo || chr(10) || $n$    elsif c = 'cajashelado' and lvl < 3 and not oli.helado_ok(mem.org_id, id, d) then status := 'rejected'; detail := 'el empleado solo anula cambios de caja de su propio equipo';$n$);
end $m$;

alter function oli.project_c(uuid, uuid, text, text, jsonb, boolean) set search_path = public;
alter function oli.project(uuid, uuid, text, text, jsonb, boolean) set search_path = public;
alter function oli.project_a(uuid, uuid, text, text, jsonb, boolean) set search_path = public;
revoke execute on function oli.project_c(uuid, uuid, text, text, jsonb, boolean), oli.helado_ok(uuid, text, jsonb) from public, anon, authenticated;
