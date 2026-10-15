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
