-- Un envío que el servidor ya rechazó sigue rechazado si llega otra vez con el mismo op_id.
-- Antes contestaba "duplicate", y la app toma "duplicate" como guardado: si la respuesta del rechazo se perdió (sin Internet)
-- y el equipo reenviaba, el cambio se borraba del equipo sin haberse guardado nunca. Lo aplicado sigue contestando "duplicate".
do $m$
declare src text; viejo text := $n$if exists (select 1 from sync_ops where sync_ops.op_id = opid) then res := res || jsonb_build_object('op_id', opid, 'status', 'duplicate'); continue; end if;$n$;
begin
  src := pg_get_functiondef('public.oli_apply(jsonb,text,text)'::regprocedure);
  if position('dup_rechazada' in src) > 0 then return; end if;
  if position(viejo in src) = 0 then raise exception 'oli_apply: no se encontró la regla de idempotencia'; end if;
  execute replace(src, viejo, $n$if exists (select 1 from sync_ops where sync_ops.op_id = opid) then   -- dup_rechazada: lo que ya se rechazó, sigue rechazado
      select so.status, so.detail into status, detail from sync_ops so where so.op_id = opid and so.org_id = mem.org_id limit 1;
      res := res || case when status = 'rejected' then jsonb_build_object('op_id', opid, 'status', 'rejected', 'detail', detail) else jsonb_build_object('op_id', opid, 'status', 'duplicate') end;
      continue;
    end if;$n$);
end $m$;
