-- OLI · datos del cliente que pide factura (cédula o NIT, nombre, correo), solo para el administrador (auditoría del 18-oct).
-- Antes iban dentro de la venta (colección "ventas" y sales.customer), que leen todos los equipos y todos los empleados.
-- Ahora la caja los anota en la colección "facturas" (un documento por equipo y día, items unidos por id): el empleado la escribe pero no la
-- lee; el administrador sí. La venta solo dice que el cliente pidió factura (cliente: true).
-- Idempotente (marca en oli_apply: 'facturas').

create or replace function oli.col_read_min(c text) returns int language sql immutable set search_path = public as
$$ select case when c in ('costos','recetas','gastos','compras','config','terceros','periodos','docelec','audit','facturas') then 3 else 2 end $$;

create or replace function oli.col_write_min(c text) returns int language sql immutable set search_path = public as
$$ select case when c in ('ventas','cajas','mermas','checklists','anulaciones','confirmaciones','demandaperdida','dispositivos','audit','cajashelado','facturas') then 2 else 3 end $$;

create or replace function oli.single_writer(c text) returns boolean language sql immutable set search_path = public as
$$ select c in ('ventas','cajas','mermas','checklists','anulaciones','confirmaciones','demandaperdida','cajashelado','facturas') $$;

create or replace function oli.merge_fields(c text) returns text[] language sql immutable set search_path = public as
$$ select case c when 'ventas' then array['ventas'] when 'cajas' then array['movs','cierres'] when 'mermas' then array['items']
  when 'anulaciones' then array['items'] when 'confirmaciones' then array['items'] when 'demandaperdida' then array['items']
  when 'reaperturas' then array['items'] when 'movinv' then array['items'] when 'audit' then array['items'] when 'cajashelado' then array['items']
  when 'facturas' then array['items'] else array[]::text[] end $$;

do $m$
declare src text;
  a1 text := $n$'movinv','cajashelado') then status := 'rejected'; detail := 'colección desconocida';$n$;
  b1 text := $n$'movinv','cajashelado','facturas') then status := 'rejected'; detail := 'colección desconocida';$n$;
begin
  src := pg_get_functiondef('public.oli_apply(jsonb,text,text)'::regprocedure);
  if position('''cajashelado'',''facturas''' in src) > 0 then return; end if;
  if position(a1 in src) = 0 then raise exception 'oli_apply: no se encontró la lista de colecciones'; end if;
  execute replace(src, a1, b1);
end $m$;
