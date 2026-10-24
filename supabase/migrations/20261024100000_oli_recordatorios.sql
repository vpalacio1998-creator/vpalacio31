-- OLI · recordatorios por notificación (24-oct). Hasta ahora OLI solo avisaba cuando algo pasaba (una venta, abrir o cerrar caja,
-- plata que sale); lo que se queda pendiente no avisaba: dos cajas quedaron abiertas una semana y nadie se enteró.
-- 1) «Pendientes» a las 9 a. m. (hora de Colombia), solo si hay algo: cajas de días anteriores que siguen abiertas y pagos por
--    QR, Nequi o Daviplata que nadie ha confirmado (últimos 30 días, sin anuladas). Los números salen de las tablas del servidor.
-- 2) Pedido semanal (config.negocio.pedidoSemanal): el día límite, 3 horas y 1 hora antes de la hora límite, si ese día todavía
--    no se registró un pedido. No dice cuánto pedir (ese cálculo está en la app, en Compras): solo recuerda la hora.
-- Cada aviso tiene su propia casilla en «Notificaciones» (pendientes, pedido). Corre cada hora con pg_cron; un aviso con la
-- misma etiqueta no se repite. Idempotente.

create or replace function oli.push_recordatorios(p_ahora timestamptz default now()) returns int language plpgsql security definer set search_path = public as
$$
declare
  o record; loc timestamp := p_ahora at time zone 'America/Bogota'; hoy date := (p_ahora at time zone 'America/Bogota')::date;
  h int := extract(hour from loc)::int; dw int := extract(dow from loc)::int;   -- dow: 0 = domingo (igual que la app)
  n int := 0; cfg jsonb; ncaj int; cajas text; npag int; tpag numeric; lineas text[]; etq text; hc int; llega date; cats text;
begin
  for o in select distinct s.org_id from oli_push_subs s where s.baja is null loop
    begin
      -- 1) pendientes, a las 9 a. m.
      if h = 9 then
        etq := 'pend-' || hoy;
        if not exists (select 1 from oli_push_queue q where q.org_id = o.org_id and q.tag = etq) then
          lineas := '{}';
          select count(*), string_agg(x.nom || ' del ' || to_char(x.local_date, 'DD/MM'), ', ' order by x.local_date) into ncaj, cajas
            from (select cs.local_date, oli.push_nombre_equipo(o.org_id, cs.device_id, null) nom from cash_sessions cs
                  where cs.org_id = o.org_id and cs.status = 'abierta' and cs.local_date < hoy) x;
          if ncaj > 0 then lineas := lineas || ((case when ncaj = 1 then 'Sigue abierta la caja ' else ncaj || ' cajas siguen abiertas: ' end) || cajas); end if;
          select count(*), coalesce(sum(p.amount), 0) into npag, tpag from payments p join sales s on s.org_id = p.org_id and s.id = p.sale_id
            where p.org_id = o.org_id and not coalesce(p.confirmed, false) and p.method in ('Nequi', 'Daviplata', 'QR Bancolombia')
              and coalesce(s.status, '') <> 'anulada' and s.local_date >= hoy - 30 and s.local_date < hoy;
          if npag > 0 then lineas := lineas || (npag || (case when npag = 1 then ' pago' else ' pagos' end) || ' por QR, Nequi o Daviplata sin confirmar (' || oli.plata(tpag) || ')'); end if;
          if coalesce(array_length(lineas, 1), 0) > 0 then
            insert into oli_push_queue (org_id, kind, title, body, tag, url, dev)
            values (o.org_id, 'pendientes', case when array_length(lineas, 1) = 1 then 'OLI: una cosa por revisar' else 'OLI: ' || array_length(lineas, 1) || ' cosas por revisar' end,
                    oli.push_corto(array_to_string(lineas, ' · ') || '.', 160), etq, '#caja', null);
            n := n + 1;
          end if;
        end if;
      end if;

      -- 2) pedido semanal: el día límite, 3 h y 1 h antes de la hora límite, si ese día no se ha registrado un pedido
      select d.data->'pedidoSemanal' into cfg from oli_docs d where d.org_id = o.org_id and d.collection = 'config' and d.doc_id = 'negocio';
      if cfg is not null and jsonb_typeof(cfg) = 'object' and coalesce(cfg->>'activo', 'true') <> 'false' and jsonb_typeof(cfg->'cats') = 'array'
         and oli.num(cfg->>'cierreDia') is not null and oli.num(cfg->>'cierreHora') is not null and dw = oli.num(cfg->>'cierreDia')::int then
        hc := oli.num(cfg->>'cierreHora')::int;
        if h in (hc - 3, hc - 1) then
          etq := 'pedido-' || hoy || '-' || h;
          if not exists (select 1 from oli_push_queue q where q.org_id = o.org_id and q.tag = etq)
             and not exists (select 1 from oli_docs c where c.org_id = o.org_id and c.collection = 'compras' and c.data->>'fecha' = hoy::text and c.data->>'estado' in ('pedido', 'recibido')) then
            select string_agg(c, ', ') into cats from jsonb_array_elements_text(cfg->'cats') c;
            llega := hoy + ((oli.num(cfg->>'llega')::int - dw + 7) % 7);
            if llega = hoy then llega := hoy + 7; end if;
            insert into oli_push_queue (org_id, kind, title, body, tag, url, dev)
            values (o.org_id, 'pedido', oli.push_corto('Hoy hasta las ' || case when hc = 12 then '12 m.' else ((hc + 11) % 12 + 1) || (case when hc < 12 then ' a. m.' else ' p. m.' end) end || ' se hace el pedido de ' || coalesce(cats, 'la semana'), 90),
                    'Abre OLI → Compras: ahí está cuánto pedir de cada uno (llega el ' || to_char(llega, 'DD/MM') || '). Si ya lo hiciste, regístralo en Compras.', etq, '#compras', null);
            n := n + 1;
          end if;
        end if;
      end if;
    exception when others then raise warning 'OLI recordatorios (%): %', o.org_id, sqlerrm;   -- un negocio con un dato raro no frena a los demás
    end;
  end loop;
  if n > 0 then perform oli.push_ping(); end if;
  return n;
end $$;
revoke execute on function oli.push_recordatorios(timestamptz) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    if not exists (select 1 from cron.job where jobname = 'oli-recordatorios') then
      perform cron.schedule('oli-recordatorios', '2 * * * *', 'select oli.push_recordatorios()');
    end if;
  end if;
exception when others then raise warning 'OLI: no se pudo programar los recordatorios (pg_cron): %', sqlerrm; end $$;
