-- OLI · anulaciones que llegan cuando la caja de esa venta ya está cerrada (auditoría del 20-oct).
-- La regla del empleado (anular su propia venta en los 10 minutos siguientes) usa la hora que manda su equipo: una anulación hecha sin
-- Internet antes del cierre es legítima aunque llegue después, pero con una hora inventada alguien podría anular una venta de hace días
-- cuya plata ya se contó. El servidor no puede saber cuál es cuál, así que no la rechaza (no se pierde una anulación real): la guarda
-- marcada "cajaCerrada" con la hora en que llegó, y el administrador la ve como riesgo alto en la auditoría y en sus avisos.
-- Idempotente (marca: anul_caja_cerrada).

create or replace function oli.marcar_anul_caja_cerrada(p_org uuid, p_id text, p_doc jsonb) returns jsonb language sql stable security definer set search_path = public as
$$ select jsonb_set(p_doc, '{items}', coalesce((
     select jsonb_agg(case when not exists (select 1 from oli_docs o, jsonb_array_elements(case when jsonb_typeof(o.data->'items') = 'array' then o.data->'items' else '[]'::jsonb end) x
                                            where o.org_id = p_org and o.collection = 'anulaciones' and o.doc_id = p_id and x->>'id' = it->>'id')
                            and exists (select 1 from sales sa join cash_sessions cs on cs.org_id = sa.org_id and cs.device_id = sa.device_id and cs.local_date = sa.local_date
                                        where sa.org_id = p_org and sa.id = it->>'ventaId' and cs.status = 'cerrada')
                           then it || jsonb_build_object('cajaCerrada', true, 'recibida', (extract(epoch from clock_timestamp()) * 1000)::bigint) else it end order by n)
     from jsonb_array_elements(p_doc->'items') with ordinality as e(it, n)), '[]'::jsonb)) $$;
revoke execute on function oli.marcar_anul_caja_cerrada(uuid, text, jsonb) from public, anon, authenticated;

do $m$
declare src text;
  a1 text := $n$    select * into cur from oli_docs where org_id = mem.org_id and collection = c and doc_id = id for update;$n$;
  b1 text := $n$    if not del and lvl < 3 and c = 'anulaciones' and jsonb_typeof(d->'items') = 'array' then d := oli.marcar_anul_caja_cerrada(mem.org_id, id, d); end if;   -- anul_caja_cerrada
    select * into cur from oli_docs where org_id = mem.org_id and collection = c and doc_id = id for update;$n$;
begin
  src := pg_get_functiondef('public.oli_apply(jsonb,text,text)'::regprocedure);
  if position('anul_caja_cerrada' in src) > 0 then return; end if;
  if position(a1 in src) = 0 then raise exception 'oli_apply: no se encontró dónde marcar las anulaciones'; end if;
  execute replace(src, a1, b1);
end $m$;
