-- OLI · borrar un documento cuya fila tiene algún campo vacío (p. ej. device_id nulo) no hacía nada y respondía "applied".
-- En PL/pgSQL "registro is not null" solo es verdad si TODOS los campos tienen valor: se pregunta por cur.doc_id.
-- Idempotente: se puede aplicar sobre una base que ya tiene oli_core.
do $m$
declare src text;
begin
  src := pg_get_functiondef('public.oli_apply(jsonb,text,text)'::regprocedure);
  if position('cur.doc_id is not null and ts >= cur.device_ts' in src) > 0 then return; end if;
  if position('if cur is not null and ts >= cur.device_ts then' in src) = 0 or position($n$elsif cur is not null then status := 'stale'; end if;$n$ in src) = 0
     or position('elsif cur is null then' in src) = 0 then raise exception 'oli_apply: no se encontró el borrado'; end if;
  src := replace(src, 'if cur is not null and ts >= cur.device_ts then', 'if cur.doc_id is not null and ts >= cur.device_ts then');
  src := replace(src, $n$elsif cur is not null then status := 'stale'; end if;$n$, $n$elsif cur.doc_id is not null then status := 'stale'; end if;$n$);
  src := replace(src, 'elsif cur is null then', 'elsif cur.doc_id is null then');
  execute src;
end $m$;
