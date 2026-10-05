-- ============================================================================
-- OLI · esquema central (Supabase / PostgreSQL)
--
-- Fuente de verdad: la base central. Los dispositivos trabajan offline-first (IndexedDB) y envían
-- operaciones con ID único por la función oli_apply(). Reglas:
--   * IDEMPOTENCIA: cada operación tiene op_id; si ya llegó, se ignora (sync_ops).
--   * ÚNICO ESCRITOR: ventas, cajas, mermas… viven en documentos propios de cada dispositivo
--     (fecha_dispositivo). Un dispositivo no puede escribir los de otro.
--   * VENTAS INMUTABLES: una venta con el mismo id nunca se reemplaza (la anulación es otro registro).
--   * ARREGLOS SIN PÉRDIDA: los arreglos append-only se unen por id (llegada en cualquier orden).
--   * ÚLTIMA ESCRITURA GANA (solo documentos de administración): se compara el reloj del dispositivo;
--     lo que llega viejo se registra en sync_conflicts, no se pierde en silencio.
--   * Los clientes NO escriben tablas directamente: solo SELECT con RLS + RPC SECURITY DEFINER.
-- Multi-empresa / multi-sede: todo lleva org_id y store_id.
-- ============================================================================
create extension if not exists pgcrypto;
create schema if not exists oli;

-- ---------------------------------------------------------------------------
-- Organización, sedes, usuarios, dispositivos
-- ---------------------------------------------------------------------------
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  created_at timestamptz not null default now()
);
create table if not exists stores (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  code text not null,                                  -- 'OLI 001'
  name text not null,
  timezone text not null default 'America/Bogota',
  created_at timestamptz not null default now(),
  unique (org_id, code)
);
create table if not exists memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  store_id uuid references stores(id) on delete set null,   -- null = todas las sedes
  role text not null check (role in ('owner','admin','employee')),
  display_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, org_id)
);
create table if not exists devices (
  id text primary key,                                  -- generado en el dispositivo
  org_id uuid not null references organizations(id) on delete cascade,
  store_id uuid references stores(id) on delete set null,
  name text,
  user_id uuid,
  role text,
  last_seen timestamptz,
  pending_ops int not null default 0,
  pending_sales int not null default 0,
  app_version text,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Superficie de sincronización: documentos (jsonb) con RLS por colección
-- ---------------------------------------------------------------------------
create table if not exists oli_docs (
  org_id uuid not null references organizations(id) on delete cascade,
  store_id uuid references stores(id) on delete set null,
  collection text not null,
  doc_id text not null,
  data jsonb not null,
  device_id text,
  device_ts bigint not null default 0,
  server_ts timestamptz not null default now(),
  rev bigint not null default 1,
  primary key (org_id, collection, doc_id)
);
create index if not exists oli_docs_col_ts on oli_docs (org_id, collection, server_ts);
create index if not exists oli_docs_fecha on oli_docs (org_id, collection, (data->>'fecha'));

create table if not exists sync_ops (
  op_id text primary key,                               -- idempotencia
  org_id uuid not null,
  store_id uuid,
  device_id text,
  user_id uuid,
  collection text not null,
  doc_id text not null,
  kind text not null,
  device_ts bigint,
  received_at timestamptz not null default now(),
  status text not null,                                 -- applied | stale | rejected
  detail text
);
create index if not exists sync_ops_org on sync_ops (org_id, received_at desc);
create table if not exists sync_conflicts (
  id bigserial primary key,
  org_id uuid not null,
  store_id uuid,
  kind text not null,                                   -- stale_write | inventory_negative | rejected_op
  collection text,
  doc_id text,
  devices text[],
  detail jsonb,
  created_at timestamptz not null default now(),
  resolved boolean not null default false,
  resolved_by uuid,
  resolved_at timestamptz,
  resolution text
);
create table if not exists audit_logs (
  org_id uuid not null,
  id text not null,
  store_id uuid,
  user_id text,
  device_id text,
  action text not null,
  ref text,
  detail text,
  at timestamptz not null,
  server_ts timestamptz not null default now(),
  primary key (org_id, id)
);

-- ---------------------------------------------------------------------------
-- Tablas normalizadas (proyección de los documentos; sirven para reportes, contador y BI)
-- ---------------------------------------------------------------------------
create table if not exists products (
  org_id uuid not null, id text not null, name text not null, category text, type text not null default 'terminado',
  price numeric not null default 0, unit text, min_stock numeric, safety_stock numeric, pack int, controls_stock boolean not null default true,
  active boolean not null default true, tax jsonb, image_path text, combo jsonb, sort int, updated_at timestamptz not null default now(),
  primary key (org_id, id));
create table if not exists product_costs (               -- solo administradores
  org_id uuid not null, product_id text not null, cost numeric, history jsonb, updated_at timestamptz not null default now(),
  primary key (org_id, product_id));
create table if not exists inventory_counts (
  org_id uuid not null, product_id text not null, base numeric not null, counted_at timestamptz not null,
  primary key (org_id, product_id));
create table if not exists sales (
  org_id uuid not null, id text not null, store_id uuid, device_id text, user_id text, sale_no int, sale_label text,
  sold_at timestamptz not null, local_date date not null, method text, subtotal numeric, discount numeric, total numeric not null,
  received numeric, change numeric, status text, customer jsonb, ref text, synced_at timestamptz not null default now(),
  primary key (org_id, id));
create index if not exists sales_date on sales (org_id, local_date);
create table if not exists sale_items (
  org_id uuid not null, sale_id text not null, line_no int not null, product_id text, name text, qty numeric not null,
  unit_price numeric not null, discount numeric default 0, tax_type text, tax_rate numeric, tax_base numeric, tax_value numeric,
  primary key (org_id, sale_id, line_no));
create table if not exists payments (
  org_id uuid not null, sale_id text not null, method text not null, amount numeric not null, confirmed boolean not null default true, confirmed_at timestamptz,
  primary key (org_id, sale_id));
create table if not exists sale_voids (
  org_id uuid not null, id text not null, sale_id text not null, at timestamptz, user_id text, reason text, total numeric,
  primary key (org_id, id));
create table if not exists cash_sessions (
  org_id uuid not null, id text not null, store_id uuid, device_id text, local_date date, opened_at timestamptz, opened_by text, opening_amount numeric,
  closed_at timestamptz, closed_by text, expected numeric, counted numeric, difference numeric, note text, status text, closures jsonb,
  primary key (org_id, id));
create table if not exists cash_movements (
  org_id uuid not null, id text not null, session_id text not null, type text not null, amount numeric not null, reason text, category text, at timestamptz, user_id text,
  primary key (org_id, id));
create table if not exists waste (
  org_id uuid not null, id text not null, product_id text, qty numeric not null, reason text, note text, at timestamptz, user_id text, device_id text, local_date date,
  primary key (org_id, id));
create table if not exists expenses (                      -- solo administradores
  org_id uuid not null, id text not null, local_date date, category text, description text, amount numeric not null, method text, supplier text,
  base numeric, tax numeric, withholding numeric, support jsonb, status text, user_id text,
  primary key (org_id, id));
create table if not exists purchases (                     -- solo administradores
  org_id uuid not null, id text not null, local_date date, supplier text, supplier_nit text, invoice text, status text, received_at timestamptz, tax numeric, support jsonb, total numeric,
  primary key (org_id, id));
create table if not exists purchase_items (
  org_id uuid not null, purchase_id text not null, line_no int not null, product_id text, qty numeric, unit_cost numeric, checked boolean,
  primary key (org_id, purchase_id, line_no));
create table if not exists inventory_movements (           -- kardex: entradas, conteos, compras, producción (lo escribe el administrador; sin costos)
  org_id uuid not null, id text not null, product_id text, type text not null, qty numeric, delta boolean not null default false, before_qty numeric, after_qty numeric, reason text, ref text,
  at timestamptz, user_id text, device_id text, local_date date,
  primary key (org_id, id));
create index if not exists inv_mov_prod on inventory_movements (org_id, product_id, at);
create table if not exists third_parties (                 -- proveedores / terceros
  org_id uuid not null, id text not null, kind text, name text, nit text, regime text, email text, data jsonb,
  primary key (org_id, id));

-- ---------------------------------------------------------------------------
-- Permisos por colección (espejo de las reglas del cliente)
-- ---------------------------------------------------------------------------
create or replace function oli.role_level(r text) returns int language sql immutable as
$$ select case r when 'owner' then 4 when 'admin' then 3 when 'employee' then 2 else 0 end $$;

create or replace function oli.col_read_min(c text) returns int language sql immutable as
$$ select case when c in ('costos','recetas','gastos','compras','config','terceros','periodos','docelec','audit') then 3 else 2 end $$;

create or replace function oli.col_write_min(c text) returns int language sql immutable as
$$ select case when c in ('ventas','cajas','mermas','checklists','anulaciones','confirmaciones','demandaperdida','dispositivos','audit') then 2 else 3 end $$;

-- colecciones donde cada dispositivo escribe SOLO sus documentos
create or replace function oli.single_writer(c text) returns boolean language sql immutable as
$$ select c in ('ventas','cajas','mermas','checklists','anulaciones','confirmaciones','demandaperdida') $$;

-- arreglos que se unen por id (crecen, no se reemplazan)
create or replace function oli.merge_fields(c text) returns text[] language sql immutable as
$$ select case c when 'ventas' then array['ventas'] when 'cajas' then array['movs','cierres'] when 'mermas' then array['items']
  when 'anulaciones' then array['items'] when 'confirmaciones' then array['items'] when 'demandaperdida' then array['items']
  when 'reaperturas' then array['items'] when 'movinv' then array['items'] when 'audit' then array['items'] else array[]::text[] end $$;

create or replace function oli.my_membership(p_org uuid default null)
returns table (org_id uuid, store_id uuid, role text) language sql stable security definer set search_path = public as
$$ select m.org_id, m.store_id, m.role from memberships m where m.user_id = auth.uid() and m.active and (p_org is null or m.org_id = p_org) order by (m.role = 'owner') desc limit 1 $$;

create or replace function oli.can_read(p_org uuid, c text) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from memberships m where m.user_id = auth.uid() and m.org_id = p_org and m.active and oli.role_level(m.role) >= oli.col_read_min(c)) $$;
create or replace function oli.is_admin(p_org uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from memberships m where m.user_id = auth.uid() and m.org_id = p_org and m.active and oli.role_level(m.role) >= 3) $$;
create or replace function oli.is_member(p_org uuid) returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from memberships m where m.user_id = auth.uid() and m.org_id = p_org and m.active) $$;

-- ---------------------------------------------------------------------------
-- Combinar documentos sin perder nada
-- ---------------------------------------------------------------------------
create or replace function oli.merge_doc(c text, old jsonb, new jsonb) returns jsonb language plpgsql immutable as
$$
declare f text; res jsonb := coalesce(old, '{}'::jsonb) || new; merged jsonb;
begin
  foreach f in array oli.merge_fields(c) loop
    -- unir por id: lo que ya existe en el servidor gana (inmutabilidad); lo nuevo se agrega
    select coalesce(jsonb_agg(e order by ord), '[]'::jsonb) into merged from (
      select distinct on (coalesce(e->>'id', md5(e::text))) e, ord from (
        select e, ord from (select e, row_number() over () as ord from jsonb_array_elements(coalesce(old->f, '[]'::jsonb)) e) a
        union all
        select e, 100000 + ord from (select e, row_number() over () as ord from jsonb_array_elements(coalesce(new->f, '[]'::jsonb)) e) b
      ) z order by coalesce(e->>'id', md5(e::text)), ord) w;
    res := jsonb_set(res, array[f], merged);
  end loop;
  if c = 'cajas' and old ? 'apertura' then res := jsonb_set(res, '{apertura}', old->'apertura'); end if;   -- la primera apertura manda
  if old ? 'dev' then res := jsonb_set(res, '{dev}', old->'dev'); end if;                                   -- el dueño del documento no cambia
  return res;
end $$;

-- ---------------------------------------------------------------------------
-- Proyección a tablas normalizadas (idempotente)
-- ---------------------------------------------------------------------------
create or replace function oli.ms(t bigint) returns timestamptz language sql immutable as
$$ select case when t is null then null else to_timestamp(t / 1000.0) end $$;

create or replace function oli.project(p_org uuid, p_store uuid, c text, id text, d jsonb, del boolean) returns void language plpgsql as
$$
#variable_conflict use_column
declare s jsonb; it jsonb; n int; mv jsonb; cl jsonb; la jsonb;
begin
  if c = 'productos' then
    if del then delete from products where org_id = p_org and products.id = project.id; return; end if;
    insert into products (org_id, id, name, category, type, price, unit, min_stock, safety_stock, pack, controls_stock, active, tax, image_path, combo, sort, updated_at)
    values (p_org, id, d->>'nombre', d->>'cat', coalesce(d->>'tipo','terminado'), coalesce((d->>'precio')::numeric,0), d->>'unidad', (d->>'min')::numeric, (d->>'seg')::numeric, (d->>'pack')::int,
            coalesce((d->>'controla')::boolean, true), coalesce((d->>'activo')::boolean, true), d->'imp', d->>'fotoPath', d->'combo', (d->>'orden')::int, now())
    on conflict (org_id, id) do update set name = excluded.name, category = excluded.category, type = excluded.type, price = excluded.price, unit = excluded.unit, min_stock = excluded.min_stock,
      safety_stock = excluded.safety_stock, pack = excluded.pack, controls_stock = excluded.controls_stock, active = excluded.active, tax = excluded.tax, image_path = excluded.image_path, combo = excluded.combo, sort = excluded.sort, updated_at = now();
  elsif c = 'costos' then
    if del then delete from product_costs where org_id = p_org and product_id = id; return; end if;
    insert into product_costs (org_id, product_id, cost, history, updated_at) values (p_org, id, (d->>'costo')::numeric, d->'hist', now())
    on conflict (org_id, product_id) do update set cost = excluded.cost, history = excluded.history, updated_at = now();
  elsif c = 'stock' then
    if del then delete from inventory_counts where org_id = p_org and product_id = id; return; end if;
    insert into inventory_counts (org_id, product_id, base, counted_at) values (p_org, id, (d->>'base')::numeric, oli.ms((d->>'t')::bigint))
    on conflict (org_id, product_id) do update set base = excluded.base, counted_at = excluded.counted_at;
  elsif c = 'ventas' then
    for s in select * from jsonb_array_elements(coalesce(d->'ventas','[]'::jsonb)) loop
      insert into sales (org_id, id, store_id, device_id, user_id, sale_no, sale_label, sold_at, local_date, method, subtotal, discount, total, received, change, status, customer, ref)
      values (p_org, s->>'id', p_store, coalesce(s->>'dev', d->>'dev'), coalesce(s->>'uid', d->>'uid'), (s->>'n')::int, s->>'num', oli.ms((s->>'t')::bigint), coalesce((s->>'fecha')::date, (d->>'fecha')::date),
              s->>'m', (s->>'sub')::numeric, coalesce((s->>'desc')::numeric,0), (s->>'total')::numeric, (s->>'recibido')::numeric, (s->>'cambio')::numeric, coalesce(s->>'estado','confirmada'), s->'cliente', s->>'ref')
      on conflict (org_id, id) do nothing;                                     -- inmutable
      n := 0;
      for it in select * from jsonb_array_elements(coalesce(s->'items','[]'::jsonb)) loop
        n := n + 1;
        insert into sale_items (org_id, sale_id, line_no, product_id, name, qty, unit_price, discount, tax_type, tax_rate, tax_base, tax_value)
        values (p_org, s->>'id', n, it->>'pid', it->>'n', (it->>'q')::numeric, (it->>'p')::numeric, coalesce((it->>'d')::numeric,0), it#>>'{imp,t}', (it#>>'{imp,r}')::numeric, (it#>>'{imp,base}')::numeric, (it#>>'{imp,v}')::numeric)
        on conflict (org_id, sale_id, line_no) do nothing;
      end loop;
      insert into payments (org_id, sale_id, method, amount, confirmed, confirmed_at)
      values (p_org, s->>'id', s->>'m', (s->>'total')::numeric, not (s->>'m' in ('Nequi','Daviplata','QR Bancolombia')) or coalesce((s->>'confirmada')::boolean, false), case when not (s->>'m' in ('Nequi','Daviplata','QR Bancolombia')) then oli.ms((s->>'t')::bigint) end)
      on conflict (org_id, sale_id) do nothing;
    end loop;
  elsif c = 'anulaciones' then
    for s in select * from jsonb_array_elements(coalesce(d->'items','[]'::jsonb)) loop
      insert into sale_voids (org_id, id, sale_id, at, user_id, reason, total) values (p_org, s->>'id', s->>'ventaId', oli.ms((s->>'t')::bigint), s->>'uid', s->>'motivo', (s->>'total')::numeric) on conflict do nothing;
    end loop;
  elsif c = 'confirmaciones' then
    for s in select * from jsonb_array_elements(coalesce(d->'items','[]'::jsonb)) loop
      update payments set confirmed = true, confirmed_at = oli.ms((s->>'t')::bigint) where org_id = p_org and sale_id = s->>'ventaId' and not confirmed;
    end loop;
  elsif c = 'cajas' then
    la := (select x from jsonb_array_elements(coalesce(d->'cierres','[]'::jsonb)) x order by (x->>'t')::bigint desc limit 1);
    insert into cash_sessions (org_id, id, store_id, device_id, local_date, opened_at, opened_by, opening_amount, closed_at, closed_by, expected, counted, difference, note, status, closures)
    values (p_org, id, p_store, d->>'dev', (d->>'fecha')::date, oli.ms((d#>>'{apertura,t}')::bigint), d#>>'{apertura,uid}', (d#>>'{apertura,monto}')::numeric,
            oli.ms((la->>'t')::bigint), la->>'uid', (la->>'esperado')::numeric, (la->>'contado')::numeric, (la->>'dif')::numeric, la->>'obs',
            case when la is null then 'abierta' else 'cerrada' end, d->'cierres')
    on conflict (org_id, id) do update set opened_at = coalesce(cash_sessions.opened_at, excluded.opened_at), closed_at = excluded.closed_at, closed_by = excluded.closed_by, expected = excluded.expected,
      counted = excluded.counted, difference = excluded.difference, note = excluded.note, status = excluded.status, closures = excluded.closures;
    for mv in select * from jsonb_array_elements(coalesce(d->'movs','[]'::jsonb)) loop
      insert into cash_movements (org_id, id, session_id, type, amount, reason, category, at, user_id)
      values (p_org, mv->>'id', id, mv->>'tipo', (mv->>'monto')::numeric, mv->>'motivo', mv->>'cat', oli.ms((mv->>'t')::bigint), mv->>'uid') on conflict do nothing;
    end loop;
  elsif c = 'mermas' then
    for s in select * from jsonb_array_elements(coalesce(d->'items','[]'::jsonb)) loop
      insert into waste (org_id, id, product_id, qty, reason, note, at, user_id, device_id, local_date)
      values (p_org, s->>'id', s->>'pid', (s->>'q')::numeric, s->>'motivo', s->>'obs', oli.ms((s->>'t')::bigint), s->>'uid', d->>'dev', (d->>'fecha')::date) on conflict do nothing;
    end loop;
  elsif c = 'movinv' then
    for s in select * from jsonb_array_elements(coalesce(d->'items','[]'::jsonb)) loop
      insert into inventory_movements (org_id, id, product_id, type, qty, delta, before_qty, after_qty, reason, ref, at, user_id, device_id, local_date)
      values (p_org, s->>'id', s->>'pid', coalesce(s->>'tipo','ajuste'), (s->>'q')::numeric, coalesce((s->>'delta')::boolean, false), (s->>'antes')::numeric, (s->>'despues')::numeric, s->>'motivo', s->>'ref',
              oli.ms((s->>'t')::bigint), s->>'uid', d->>'dev', (d->>'fecha')::date) on conflict do nothing;
    end loop;
  elsif c = 'gastos' then
    if del then delete from expenses where org_id = p_org and expenses.id = project.id; return; end if;
    insert into expenses (org_id, id, local_date, category, description, amount, method, supplier, base, tax, withholding, support, status, user_id)
    values (p_org, id, (d->>'fecha')::date, d->>'cat', d->>'desc', coalesce((d->>'valor')::numeric,0), d->>'m', d->>'proveedor', (d->>'base')::numeric, (d->>'iva')::numeric, (d->>'retencion')::numeric, d->'soporte', d->>'estado', d->>'uid')
    on conflict (org_id, id) do update set local_date = excluded.local_date, category = excluded.category, description = excluded.description, amount = excluded.amount, method = excluded.method,
      supplier = excluded.supplier, base = excluded.base, tax = excluded.tax, withholding = excluded.withholding, support = excluded.support, status = excluded.status;
  elsif c = 'compras' then
    if del then delete from purchases where org_id = p_org and purchases.id = project.id; delete from purchase_items where org_id = p_org and purchase_id = id; return; end if;
    insert into purchases (org_id, id, local_date, supplier, supplier_nit, invoice, status, received_at, tax, support, total)
    values (p_org, id, (d->>'fecha')::date, d->>'proveedor', d->>'nit', d->>'factura', d->>'estado', oli.ms((d->>'recT')::bigint), (d->>'iva')::numeric, d->'soporte',
            (select coalesce(sum((l->>'costo')::numeric * (l->>'q')::numeric),0) from jsonb_array_elements(coalesce(d->'lineas','[]'::jsonb)) l))
    on conflict (org_id, id) do update set supplier = excluded.supplier, supplier_nit = excluded.supplier_nit, invoice = excluded.invoice, status = excluded.status, received_at = excluded.received_at, tax = excluded.tax, support = excluded.support, total = excluded.total;
    delete from purchase_items where org_id = p_org and purchase_id = id; n := 0;
    for it in select * from jsonb_array_elements(coalesce(d->'lineas','[]'::jsonb)) loop
      n := n + 1; insert into purchase_items (org_id, purchase_id, line_no, product_id, qty, unit_cost, checked) values (p_org, id, n, it->>'pid', (it->>'q')::numeric, (it->>'costo')::numeric, coalesce((it->>'ok')::boolean,false));
    end loop;
  elsif c = 'terceros' then
    if del then delete from third_parties where org_id = p_org and third_parties.id = project.id; return; end if;
    insert into third_parties (org_id, id, kind, name, nit, regime, email, data) values (p_org, id, d->>'tipo', d->>'nombre', d->>'nit', d->>'regimen', d->>'correo', d)
    on conflict (org_id, id) do update set kind = excluded.kind, name = excluded.name, nit = excluded.nit, regime = excluded.regime, email = excluded.email, data = excluded.data;
  elsif c = 'dispositivos' then
    insert into devices (id, org_id, store_id, name, user_id, role, last_seen, pending_ops, pending_sales, updated_at)
    values (id, p_org, p_store, d->>'nombre', null, d->>'rol', oli.ms((d->>'vis')::bigint), coalesce((d->>'pend')::int,0), coalesce((d->>'ventasPend')::int,0), now())
    on conflict (id) do update set name = excluded.name, role = excluded.role, last_seen = excluded.last_seen, pending_ops = excluded.pending_ops, pending_sales = excluded.pending_sales, updated_at = now()
    where devices.org_id = p_org;
  elsif c = 'audit' then
    n := 0;
    for s in select * from jsonb_array_elements(coalesce(d->'items','[]'::jsonb)) loop
      n := n + 1;
      insert into audit_logs (org_id, id, store_id, user_id, device_id, action, ref, detail, at) values (p_org, id || ':' || n, p_store, s->>'u', s->>'dev', s->>'a', s->>'r', s->>'d', oli.ms((s->>'t')::bigint)) on conflict do nothing;
    end loop;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: aplicar operaciones de un dispositivo (idempotente, con permisos)
-- ---------------------------------------------------------------------------
create or replace function oli_apply(p_ops jsonb, p_device_id text default null, p_app_version text default null)
returns jsonb language plpgsql security definer set search_path = public as
$$
#variable_conflict use_column
declare
  uid uuid := auth.uid(); mem record; op jsonb; res jsonb := '[]'::jsonb; c text; id text; d jsonb; del boolean; ts bigint; opid text; cur record; merged jsonb;
  dev text; status text; detail text; wmin int; lvl int;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into mem from oli.my_membership();
  if mem.org_id is null then raise exception 'no_membership' using errcode = '42501'; end if;
  lvl := oli.role_level(mem.role);
  for op in select * from jsonb_array_elements(coalesce(p_ops,'[]'::jsonb)) loop
    opid := op->>'op_id'; c := op->>'col'; id := op->>'id'; d := op->'data'; del := coalesce((op->>'del')::boolean, false); ts := coalesce((op->>'t')::bigint, 0); dev := coalesce(op->>'device_id', p_device_id);
    status := 'applied'; detail := null;
    if opid is null or c is null or id is null then res := res || jsonb_build_object('op_id', opid, 'status', 'rejected', 'detail', 'operación incompleta'); continue; end if;
    perform pg_advisory_xact_lock(hashtext(opid));                                           -- dos envíos simultáneos del mismo op_id: el segundo espera y sale como duplicado
    if exists (select 1 from sync_ops where sync_ops.op_id = opid) then res := res || jsonb_build_object('op_id', opid, 'status', 'duplicate'); continue; end if;   -- IDEMPOTENCIA
    wmin := oli.col_write_min(c);
    if c = 'audit' then
      if split_part(id, '__', 1) <> uid::text then status := 'rejected'; detail := 'auditoría ajena';
      elsif del and lvl < 3 then status := 'rejected'; detail := 'la auditoría no se puede borrar'; end if;
    elsif lvl < wmin then status := 'rejected'; detail := 'sin permiso para ' || c;
    elsif c not in ('productos','costos','stock','recetas','ventas','cajas','mermas','checklists','anulaciones','confirmaciones','demandaperdida','dispositivos','reaperturas','meta','gastos','compras','config','terceros','periodos','docelec','movinv') then status := 'rejected'; detail := 'colección desconocida';
    elsif oli.single_writer(c) and lvl < 3 and (d is null or del or coalesce(d->>'dev','') <> coalesce(dev,'') or right(id, length(coalesce(dev,'')) + 1) <> '_' || coalesce(dev,'')) then status := 'rejected'; detail := 'solo el dispositivo dueño puede escribir este documento';
    elsif c = 'dispositivos' and lvl < 3 and id <> coalesce(dev,'') then status := 'rejected'; detail := 'dispositivo ajeno';
    end if;
    if status = 'rejected' then
      insert into sync_ops (op_id, org_id, store_id, device_id, user_id, collection, doc_id, kind, device_ts, status, detail) values (opid, mem.org_id, mem.store_id, dev, uid, c, id, case when del then 'del' else 'set' end, ts, 'rejected', detail);
      insert into sync_conflicts (org_id, store_id, kind, collection, doc_id, devices, detail) values (mem.org_id, mem.store_id, 'rejected_op', c, id, array[dev], jsonb_build_object('motivo', detail, 'user', uid));
      res := res || jsonb_build_object('op_id', opid, 'status', 'rejected', 'detail', detail); continue;
    end if;
    select * into cur from oli_docs where org_id = mem.org_id and collection = c and doc_id = id for update;
    if del then
      if cur is not null and ts >= cur.device_ts then delete from oli_docs where org_id = mem.org_id and collection = c and doc_id = id; perform oli.project(mem.org_id, mem.store_id, c, id, null, true);
      elsif cur is not null then status := 'stale'; end if;
    elsif cur is null then
      insert into oli_docs (org_id, store_id, collection, doc_id, data, device_id, device_ts) values (mem.org_id, mem.store_id, c, id, d, dev, ts);
      perform oli.project(mem.org_id, mem.store_id, c, id, d, false);
    elsif array_length(oli.merge_fields(c), 1) is not null then                              -- unión sin pérdida
      merged := oli.merge_doc(c, cur.data, d);
      update oli_docs set data = merged, device_id = dev, device_ts = greatest(device_ts, ts), server_ts = now(), rev = rev + 1 where org_id = mem.org_id and collection = c and doc_id = id;
      perform oli.project(mem.org_id, mem.store_id, c, id, merged, false);
    elsif ts >= cur.device_ts then                                                          -- última escritura gana
      update oli_docs set data = d, device_id = dev, device_ts = ts, server_ts = now(), rev = rev + 1 where org_id = mem.org_id and collection = c and doc_id = id;
      perform oli.project(mem.org_id, mem.store_id, c, id, d, false);
    else
      status := 'stale'; detail := 'llegó una versión más vieja'; merged := cur.data;
      insert into sync_conflicts (org_id, store_id, kind, collection, doc_id, devices, detail) values (mem.org_id, mem.store_id, 'stale_write', c, id, array[cur.device_id, dev], jsonb_build_object('servidor_ts', cur.device_ts, 'op_ts', ts, 'user', uid));
    end if;
    insert into sync_ops (op_id, org_id, store_id, device_id, user_id, collection, doc_id, kind, device_ts, status, detail) values (opid, mem.org_id, mem.store_id, dev, uid, c, id, case when del then 'del' else 'set' end, ts, status, detail);
    res := res || case when status = 'stale' then jsonb_build_object('op_id', opid, 'status', status, 'data', cur.data, 'device_ts', cur.device_ts) else jsonb_build_object('op_id', opid, 'status', status) end;
  end loop;
  if dev is null then dev := p_device_id; end if;
  if p_device_id is not null then
    insert into devices (id, org_id, store_id, user_id, role, last_seen, app_version) values (p_device_id, mem.org_id, mem.store_id, uid, mem.role, now(), p_app_version)
    on conflict (id) do update set last_seen = now(), user_id = excluded.user_id, role = excluded.role, app_version = coalesce(excluded.app_version, devices.app_version) where devices.org_id = mem.org_id;
  end if;
  perform oli.detect_inventory_conflicts(mem.org_id, mem.store_id);
  return res;
end $$;

-- ---------------------------------------------------------------------------
-- Inventario actual (suma todos los dispositivos) y detección de conflictos
-- ---------------------------------------------------------------------------
create or replace view inventory_current with (security_invoker = true) as
with lines as (
  select si.org_id, si.sale_id, si.product_id, si.qty, s.sold_at from sale_items si
  join sales s on s.org_id = si.org_id and s.id = si.sale_id
  where not exists (select 1 from sale_voids v where v.org_id = s.org_id and v.sale_id = s.id)
), exp as (
  select l.org_id, l.sold_at, l.qty * (c.value->>'q')::numeric as qty, c.value->>'pid' as product_id
  from lines l join products p on p.org_id = l.org_id and p.id = l.product_id and p.combo is not null, lateral jsonb_array_elements(p.combo) c(value)
  union all
  select l.org_id, l.sold_at, l.qty, l.product_id from lines l left join products p on p.org_id = l.org_id and p.id = l.product_id where p.combo is null
)
select c.org_id, c.product_id, c.base - coalesce((select sum(e.qty) from exp e where e.org_id = c.org_id and e.product_id = c.product_id and e.sold_at > c.counted_at), 0)
       - coalesce((select sum(w.qty) from waste w where w.org_id = c.org_id and w.product_id = c.product_id and w.at > c.counted_at), 0)
       + coalesce((select sum(m.qty) from inventory_movements m where m.org_id = c.org_id and m.product_id = c.product_id and m.delta and m.at > c.counted_at), 0) as qty, c.counted_at
from inventory_counts c;

create or replace function oli.detect_inventory_conflicts(p_org uuid, p_store uuid) returns void language plpgsql security definer set search_path = public as
$$
declare r record;
begin
  for r in select * from inventory_current ic where ic.org_id = p_org and ic.qty < 0 loop
    if not exists (select 1 from sync_conflicts where org_id = p_org and kind = 'inventory_negative' and doc_id = r.product_id and not resolved) then
      insert into sync_conflicts (org_id, store_id, kind, collection, doc_id, devices, detail)
      select p_org, p_store, 'inventory_negative', 'stock', r.product_id,
             array(select distinct s.device_id from sales s join sale_items si on si.org_id = s.org_id and si.sale_id = s.id where s.org_id = p_org and si.product_id = r.product_id and s.sold_at > r.counted_at),
             jsonb_build_object('inventario', r.qty, 'mensaje', 'Hay una diferencia de inventario que necesita revisión');
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Alta inicial: el primer usuario crea la organización y queda como propietario
-- ---------------------------------------------------------------------------
create or replace function oli_bootstrap(p_org_name text, p_store_name text default 'OLI 001') returns jsonb language plpgsql security definer set search_path = public as
$$
declare uid uuid := auth.uid(); o uuid; s uuid;
begin
  if uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if exists (select 1 from memberships where user_id = uid) then raise exception 'ya existe una organización para este usuario' using errcode = '23505'; end if;
  insert into organizations (name) values (p_org_name) returning id into o;
  insert into stores (org_id, code, name) values (o, 'OLI 001', p_store_name) returning id into s;
  insert into memberships (user_id, org_id, store_id, role) values (uid, o, s, 'owner');
  return jsonb_build_object('org_id', o, 'store_id', s);
end $$;

create or replace function oli_me() returns jsonb language sql stable security definer set search_path = public as
$$ select coalesce((select jsonb_build_object('org_id', m.org_id, 'store_id', m.store_id, 'role', m.role, 'is_admin', oli.role_level(m.role) >= 3, 'name', m.display_name) from memberships m where m.user_id = auth.uid() and m.active order by (m.role = 'owner') desc limit 1), 'null'::jsonb) $$;

-- salud del sistema para el administrador (monitoreo)
create or replace view oli_health with (security_invoker = true) as
select d.org_id, d.id as device_id, d.name, d.last_seen, now() - d.last_seen as silent_for, d.pending_ops, d.pending_sales,
       (select count(*) from sync_conflicts c where c.org_id = d.org_id and not c.resolved) as open_conflicts
from devices d;

-- ---------------------------------------------------------------------------
-- RLS: lectura por rol; escritura SOLO vía RPC
-- ---------------------------------------------------------------------------
alter table organizations enable row level security; alter table stores enable row level security; alter table memberships enable row level security; alter table devices enable row level security;
alter table oli_docs enable row level security; alter table sync_ops enable row level security; alter table sync_conflicts enable row level security; alter table audit_logs enable row level security;
alter table products enable row level security; alter table product_costs enable row level security; alter table inventory_counts enable row level security; alter table sales enable row level security;
alter table sale_items enable row level security; alter table payments enable row level security; alter table sale_voids enable row level security; alter table cash_sessions enable row level security;
alter table cash_movements enable row level security; alter table waste enable row level security; alter table inventory_movements enable row level security; alter table expenses enable row level security; alter table purchases enable row level security;
alter table purchase_items enable row level security; alter table third_parties enable row level security;

create policy org_read on organizations for select to authenticated using (oli.is_member(id));
create policy store_read on stores for select to authenticated using (oli.is_member(org_id));
create policy mem_read on memberships for select to authenticated using (user_id = auth.uid() or oli.is_admin(org_id));
create policy dev_read on devices for select to authenticated using (oli.is_member(org_id));
create policy docs_read on oli_docs for select to authenticated using (oli.can_read(org_id, collection) and (collection <> 'audit' or true));
create policy ops_read on sync_ops for select to authenticated using (oli.is_admin(org_id));
create policy conf_read on sync_conflicts for select to authenticated using (oli.is_admin(org_id));
create policy audit_read on audit_logs for select to authenticated using (oli.is_admin(org_id));
create policy prod_read on products for select to authenticated using (oli.is_member(org_id));
create policy cost_read on product_costs for select to authenticated using (oli.is_admin(org_id));
create policy cnt_read on inventory_counts for select to authenticated using (oli.is_member(org_id));
create policy sale_read on sales for select to authenticated using (oli.is_member(org_id));
create policy item_read on sale_items for select to authenticated using (oli.is_member(org_id));
create policy pay_read on payments for select to authenticated using (oli.is_member(org_id));
create policy void_read on sale_voids for select to authenticated using (oli.is_member(org_id));
create policy cash_read on cash_sessions for select to authenticated using (oli.is_member(org_id));
create policy cmov_read on cash_movements for select to authenticated using (oli.is_member(org_id));
create policy waste_read on waste for select to authenticated using (oli.is_member(org_id));
create policy invmov_read on inventory_movements for select to authenticated using (oli.is_member(org_id));
create policy exp_read on expenses for select to authenticated using (oli.is_admin(org_id));
create policy pur_read on purchases for select to authenticated using (oli.is_admin(org_id));
create policy puri_read on purchase_items for select to authenticated using (oli.is_admin(org_id));
create policy third_read on third_parties for select to authenticated using (oli.is_admin(org_id));

revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to authenticated;
grant select on organizations, stores, memberships, devices, oli_docs, sync_ops, sync_conflicts, audit_logs, products, product_costs, inventory_counts, sales, sale_items, payments, sale_voids,
  cash_sessions, cash_movements, waste, inventory_movements, expenses, purchases, purchase_items, third_parties, inventory_current, oli_health to authenticated;
revoke all on function oli_apply(jsonb, text, text), oli_bootstrap(text, text), oli_me() from public, anon;
grant execute on function oli_apply(jsonb, text, text), oli_bootstrap(text, text), oli_me() to authenticated;
revoke all on schema oli from public, anon, authenticated;
grant usage on schema oli to authenticated;
grant execute on function oli.role_level(text), oli.can_read(uuid, text), oli.is_admin(uuid), oli.is_member(uuid), oli.my_membership(uuid), oli.col_read_min(text) to authenticated;

-- Realtime: el administrador ve las ventas casi al instante (RLS filtra qué recibe cada rol)
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table oli_docs;
    alter publication supabase_realtime add table sync_conflicts;
    alter publication supabase_realtime add table devices;
  end if;
end $$;
