-- OLI · borrar datos de prueba antes de una fecha sin que vuelvan.
-- meta/purgas = {"cortes": {"ventas": "2026-10-13", ...}}: un envío (no un borrado) de un documento con fecha anterior al corte
-- no se guarda y responde "purged" (los equipos lo dan por enviado y lo sacan de su cola). Idempotente.
-- datos borrados por el administrador: meta/purgas guarda, por colección, la fecha desde la que se conservan ({"cortes": {"ventas": "2026-10-13"}})
create or replace function oli.purga_corte(p_org uuid, c text) returns text language sql stable security definer set search_path = public as
$$ select o.data->'cortes'->>c from oli_docs o where o.org_id = p_org and o.collection = 'meta' and o.doc_id = 'purgas' $$;
revoke execute on function oli.purga_corte(uuid, text) from public, anon, authenticated;
do $m$
declare src text;
  ancla text := $n$    select * into cur from oli_docs where org_id = mem.org_id and collection = c and doc_id = id for update;$n$;
  bloque text := $n$    if not del and d ? 'fecha' and oli.purga_corte(mem.org_id, c) is not null and d->>'fecha' < oli.purga_corte(mem.org_id, c) then   -- datos que el administrador borró (antes de una fecha): no vuelven
      insert into sync_ops (op_id, org_id, store_id, device_id, user_id, collection, doc_id, kind, device_ts, status, detail) values (opid, mem.org_id, mem.store_id, dev, uid, c, id, 'set', ts, 'purged', 'borrado por el administrador: antes de ' || oli.purga_corte(mem.org_id, c));
      res := res || jsonb_build_object('op_id', opid, 'status', 'purged', 'detail', 'borrado por el administrador: antes de ' || oli.purga_corte(mem.org_id, c)); continue;
    end if;$n$;
begin
  src := pg_get_functiondef('public.oli_apply(jsonb,text,text)'::regprocedure);
  if position('purga_corte' in src) > 0 then return; end if;
  if position(ancla in src) = 0 then raise exception 'oli_apply: no se encontró dónde poner la regla de datos borrados'; end if;
  execute replace(src, ancla, bloque || chr(10) || ancla);
end $m$;
