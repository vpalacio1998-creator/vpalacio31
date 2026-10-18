-- Pruebas del esquema OLI: permisos, idempotencia, fusión sin pérdida y conflictos.
create or replace function t_assert(ok boolean, msg text) returns void language plpgsql as $$ begin if not ok then raise exception 'FALLÓ: %', msg; end if; raise notice 'OK  %', msg; end $$;
create or replace function t_as(u uuid) returns void language plpgsql as $$ begin perform set_config('request.jwt.claims', json_build_object('sub', u)::text, false); end $$;
grant execute on function t_as(uuid), t_assert(boolean, text) to authenticated, anon;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1','dueña@oli.test'), ('00000000-0000-0000-0000-0000000000e1','maria@oli.test'), ('00000000-0000-0000-0000-0000000000e2','juan@oli.test'), ('00000000-0000-0000-0000-0000000000f1','intruso@oli.test');

do $$
declare a uuid := '00000000-0000-0000-0000-0000000000a1'; e1 uuid := '00000000-0000-0000-0000-0000000000e1'; e2 uuid := '00000000-0000-0000-0000-0000000000e2'; x uuid := '00000000-0000-0000-0000-0000000000f1';
  org uuid; st uuid; r jsonb; n int; sale1 jsonb; sale2 jsonb; sale3 jsonb; v numeric; ok boolean;
begin
  set role authenticated; perform t_as(a);
  r := oli_bootstrap('OLI', 'OLI 001'); org := (r->>'org_id')::uuid; st := (r->>'store_id')::uuid;
  perform t_assert(oli_me()->>'role' = 'owner', 'el primer usuario queda como propietario');
  reset role;
  insert into memberships (user_id, org_id, store_id, role) values (e1, org, st, 'employee'), (e2, org, st, 'employee');

  -- administrador crea catálogo, costo y conteo de inventario
  set role authenticated; perform t_as(a);
  r := oli_apply(jsonb_build_array(
    jsonb_build_object('op_id','a-p1','col','productos','id','p-mango','t',1000,'data','{"nombre":"Paleta Mango","cat":"Paletas","precio":8000,"min":3,"controla":true,"activo":true}'::jsonb),
    jsonb_build_object('op_id','a-p2','col','productos','id','p-fresa','t',1000,'data','{"nombre":"Paleta Fresa","cat":"Paletas","precio":8000,"min":3,"controla":true,"activo":true}'::jsonb),
    jsonb_build_object('op_id','a-c1','col','costos','id','p-mango','t',1000,'data','{"costo":3000,"hist":[{"t":1000,"c":3000}]}'::jsonb),
    jsonb_build_object('op_id','a-s1','col','stock','id','p-mango','t',1000,'data','{"base":10,"t":1000}'::jsonb)), 'dA', '1.0');
  perform t_assert((select count(*) from jsonb_array_elements(r) el where el->>'status' = 'applied') = 4, 'admin aplica 4 operaciones');

  -- T2: venta del empleado y reintento con el mismo op_id (idempotencia)
  reset role; set role authenticated; perform t_as(e1);
  sale1 := '{"id":"d1-aaa-1","n":1,"num":"Caja 1 #1","t":2000,"fecha":"2026-10-03","uid":"u1","dev":"d1","m":"Efectivo","total":24000,"sub":24000,"desc":0,"recibido":30000,"cambio":6000,"estado":"confirmada","items":[{"pid":"p-mango","n":"Paleta Mango","q":2,"p":8000,"d":0,"imp":{"t":"validar","r":0,"base":16000,"v":0}},{"pid":"p-fresa","n":"Paleta Fresa","q":1,"p":8000,"d":0,"imp":{"t":"validar","r":0,"base":8000,"v":0}}]}'::jsonb;
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','d1-op-1','col','ventas','id','2026-10-03_d1','t',2000,'data', jsonb_build_object('fecha','2026-10-03','dev','d1','uid','u1','ventas', jsonb_build_array(sale1)))), 'd1', '1.0');
  perform t_assert(r->0->>'status' = 'applied', 'empleado registra una venta');
  perform t_assert((select count(*) from sales) = 1 and (select count(*) from sale_items) = 2 and (select count(*) from payments) = 1, 'la venta se proyecta a sales / sale_items / payments');
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','d1-op-1','col','ventas','id','2026-10-03_d1','t',2000,'data', jsonb_build_object('fecha','2026-10-03','dev','d1','uid','u1','ventas', jsonb_build_array(sale1)))), 'd1', '1.0');
  perform t_assert(r->0->>'status' = 'duplicate' and (select count(*) from sales) = 1, 'IDEMPOTENCIA: el mismo op_id no duplica la venta');

  -- T3: reenvío del documento con otra operación (reintento) + venta nueva: sin duplicados
  sale2 := '{"id":"d1-aaa-2","n":2,"num":"Caja 1 #2","t":3000,"fecha":"2026-10-03","uid":"u1","dev":"d1","m":"Nequi","total":8000,"sub":8000,"desc":0,"items":[{"pid":"p-fresa","n":"Paleta Fresa","q":1,"p":8000,"d":0,"imp":{"t":"validar","r":0,"base":8000,"v":0}}]}'::jsonb;
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','d1-op-2','col','ventas','id','2026-10-03_d1','t',3000,'data', jsonb_build_object('fecha','2026-10-03','dev','d1','uid','u1','ventas', jsonb_build_array(sale1, sale2)))), 'd1', '1.0');
  perform t_assert((select count(*) from sales) = 2 and (select count(*) from sale_items) = 3, 'reenviar el documento con otra operación no duplica ventas');
  perform t_assert((select confirmed from payments where sale_id = 'd1-aaa-2') = false, 'un pago Nequi queda por confirmar');

  -- T4: llegada desordenada: primero lo nuevo, después lo viejo
  sale3 := '{"id":"d1-aaa-3","n":3,"num":"Caja 1 #3","t":4000,"fecha":"2026-10-03","uid":"u1","dev":"d1","m":"Efectivo","total":8000,"sub":8000,"desc":0,"items":[{"pid":"p-mango","n":"Paleta Mango","q":1,"p":8000,"d":0,"imp":{"t":"validar","r":0,"base":8000,"v":0}}]}'::jsonb;
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','d1-op-4','col','ventas','id','2026-10-03_d1','t',4000,'data', jsonb_build_object('fecha','2026-10-03','dev','d1','uid','u1','ventas', jsonb_build_array(sale1, sale2, sale3)))), 'd1', '1.0');
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','d1-op-3','col','ventas','id','2026-10-03_d1','t',2500,'data', jsonb_build_object('fecha','2026-10-03','dev','d1','uid','u1','ventas', jsonb_build_array(sale1)))), 'd1', '1.0');
  perform t_assert((select jsonb_array_length(data->'ventas') from oli_docs where collection = 'ventas' and doc_id = '2026-10-03_d1') = 3, 'una operación vieja que llega tarde NO borra ventas más nuevas');

  -- T5: una venta confirmada no se puede alterar
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','d1-op-5','col','ventas','id','2026-10-03_d1','t',5000,'data', jsonb_build_object('fecha','2026-10-03','dev','d1','uid','u1','ventas', jsonb_build_array(jsonb_set(sale1, '{total}', '1'::jsonb))))), 'd1', '1.0');
  perform t_assert((select total from sales where id = 'd1-aaa-1') = 24000, 'una venta confirmada es inmutable');

  -- T6: el empleado no puede escribir ni leer costos / gastos
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','e-hack-1','col','costos','id','p-mango','t',6000,'data','{"costo":1,"hist":[]}'::jsonb)), 'd1', '1.0');
  perform t_assert(r->0->>'status' = 'rejected', 'el empleado no puede cambiar costos (rechazado en el servidor)');
  perform t_assert((select count(*) from oli_docs where collection = 'costos') = 0 and (select count(*) from product_costs) = 0, 'el empleado no ve los costos (RLS)');
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','e-hack-2','col','gastos','id','g1','t',6000,'data','{"fecha":"2026-10-03","valor":5}'::jsonb)), 'd1', '1.0');
  perform t_assert(r->0->>'status' = 'rejected', 'el empleado no puede registrar gastos administrativos');
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','e-hack-3','col','productos','id','p-mango','t',6000,'data','{"nombre":"Paleta Mango","precio":1}'::jsonb)), 'd1', '1.0');
  perform t_assert(r->0->>'status' = 'rejected' and (select price from products where id = 'p-mango') = 8000, 'el empleado no puede cambiar precios');

  -- T7: un empleado no escribe en el documento de otro dispositivo
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','e-hack-4','col','ventas','id','2026-10-03_d9','t',7000,'data', jsonb_build_object('fecha','2026-10-03','dev','d9','ventas', '[]'::jsonb))), 'd1', '1.0');
  perform t_assert(r->0->>'status' = 'rejected', 'un dispositivo no puede escribir los documentos de otro');

  -- T8: no hay escritura directa a las tablas
  begin insert into oli_docs (org_id, collection, doc_id, data) values (org, 'ventas', 'x', '{}'); ok := false; exception when insufficient_privilege then ok := true; end;
  perform t_assert(ok, 'el empleado no puede insertar directo en la base (solo por oli_apply)');
  begin update sales set total = 1; ok := false; exception when insufficient_privilege then ok := true; end;
  perform t_assert(ok, 'el empleado no puede modificar ventas directo');

  -- T9: administración: la última escritura gana; lo viejo queda como conflicto
  reset role; set role authenticated; perform t_as(a);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','a-p3','col','productos','id','p-mango','t',9000,'data','{"nombre":"Paleta Mango","cat":"Paletas","precio":8500,"min":3,"controla":true,"activo":true}'::jsonb)), 'dA', '1.0');
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','a-p4','col','productos','id','p-mango','t',8000,'data','{"nombre":"Paleta Mango","cat":"Paletas","precio":7000,"min":3,"controla":true,"activo":true}'::jsonb)), 'dB', '1.0');
  perform t_assert(r->0->>'status' = 'stale' and (select price from products where id = 'p-mango') = 8500, 'ÚLTIMA ESCRITURA GANA: lo más viejo no pisa lo nuevo');
  perform t_assert((select count(*) from sync_conflicts where kind = 'stale_write') = 1, 'lo descartado queda registrado como conflicto');

  -- T10: dos cajas venden lo mismo: el inventario queda negativo y se registra el conflicto (sin borrar nada)
  reset role; set role authenticated; perform t_as(e2);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','d2-op-1','col','ventas','id','2026-10-03_d2','t',10000,'data', jsonb_build_object('fecha','2026-10-03','dev','d2','uid','u2','ventas', jsonb_build_array(
        jsonb_build_object('id','d2-bbb-1','n',1,'num','Caja 2 #1','t',10000,'fecha','2026-10-03','uid','u2','dev','d2','m','Tarjeta','total',72000,'sub',72000,'desc',0,'items', jsonb_build_array(jsonb_build_object('pid','p-mango','n','Paleta Mango','q',9,'p',8000,'d',0,'imp','{}'::jsonb))))))), 'd2', '1.0');
  reset role; set role authenticated; perform t_as(a);
  perform t_assert((select qty from inventory_current where product_id = 'p-mango') = 10 - 2 - 1 - 9, 'el inventario suma las ventas de TODOS los dispositivos (10 - 2 - 1 - 9 = -2)');
  perform t_assert((select count(*) from sync_conflicts where kind = 'inventory_negative' and doc_id = 'p-mango' and not resolved) = 1, 'DIFERENCIA DE INVENTARIO registrada para revisión');
  perform t_assert((select array_length(devices,1) from sync_conflicts where kind = 'inventory_negative') = 2, 'el conflicto nombra los dos dispositivos involucrados');
  perform t_assert((select count(*) from sales) = 4, 'ninguna venta se perdió en el conflicto');

  -- T11: el administrador sí ve costos y gastos; el empleado no
  perform t_assert((select count(*) from product_costs) = 1, 'el administrador ve los costos');
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','a-g1','col','gastos','id','g1','t',11000,'data','{"fecha":"2026-10-03","cat":"Servicios","desc":"Luz","valor":180000,"m":"Transferencia"}'::jsonb)), 'dA', '1.0');
  perform t_assert((select count(*) from expenses) = 1, 'el administrador registra un gasto');
  reset role; set role authenticated; perform t_as(e1);
  perform t_assert((select count(*) from expenses) = 0 and (select count(*) from oli_docs where collection = 'gastos') = 0, 'el empleado no ve los gastos (RLS)');

  -- T12: caja: apertura, movimientos y cierre; reenviar no duplica
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','d1-c1','col','cajas','id','2026-10-03_d1','t',12000,'data', jsonb_build_object('fecha','2026-10-03','dev','d1','apertura', jsonb_build_object('id','ap1','t',1500,'monto',200000,'uid','u1'),
        'movs', jsonb_build_array(jsonb_build_object('id','m1','t',5000,'tipo','retiro','monto',50000,'motivo','Retiro del dueño')),
        'cierres', jsonb_build_array(jsonb_build_object('id','ci1','t',11000,'uid','u1','esperado',182000,'contado',177000,'dif',-5000,'obs','Error de cambio'))))), 'd1', '1.0');
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','d1-c2','col','cajas','id','2026-10-03_d1','t',12500,'data', jsonb_build_object('fecha','2026-10-03','dev','d1','apertura', jsonb_build_object('id','ap1','t',1500,'monto',200000,'uid','u1'),
        'movs', jsonb_build_array(jsonb_build_object('id','m1','t',5000,'tipo','retiro','monto',50000,'motivo','Retiro del dueño')),
        'cierres', jsonb_build_array(jsonb_build_object('id','ci1','t',11000,'uid','u1','esperado',182000,'contado',177000,'dif',-5000,'obs','Error de cambio'))))), 'd1', '1.0');
  perform t_assert((select count(*) from cash_movements) = 1 and (select difference from cash_sessions) = -5000 and (select status from cash_sessions) = 'cerrada', 'la caja guarda apertura, movimiento y cierre con diferencia (sin duplicar al reenviar)');

  -- T13: auditoría propia sí, ajena no; solo el administrador la lee
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','au1','col','audit','id', e1::text || '__audit_2026-10-03','t',13000,'data','{"fecha":"2026-10-03","items":[{"t":13000,"u":"x","a":"CIERRE_CAJA","r":"c","d":"ok"}]}'::jsonb)), 'd1', '1.0');
  perform t_assert(r->0->>'status' = 'applied', 'el empleado escribe su propia auditoría');
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','au2','col','audit','id', a::text || '__audit_2026-10-03','t',13000,'data','{"items":[]}'::jsonb)), 'd1', '1.0');
  perform t_assert(r->0->>'status' = 'rejected', 'el empleado NO puede escribir en la auditoría de otra persona');
  perform t_assert((select count(*) from audit_logs) = 0, 'el empleado no lee la auditoría');
  reset role; set role authenticated; perform t_as(a);
  perform t_assert((select count(*) from audit_logs) = 1, 'el administrador sí lee la auditoría');

  -- T14: quien no pertenece a la organización no puede operar ni leer
  reset role; set role authenticated; perform t_as(x);
  begin perform oli_apply('[]'::jsonb, 'dX', '1'); ok := false; exception when others then ok := sqlerrm = 'no_membership'; end;
  perform t_assert(ok, 'un usuario sin membresía no puede enviar operaciones');
  perform t_assert((select count(*) from sales) = 0 and (select count(*) from products) = 0, 'un usuario sin membresía no ve nada');
  reset role; set role anon;
  begin perform count(*) from sales; ok := false; exception when insufficient_privilege then ok := true; end;
  perform t_assert(ok, 'sin sesión no se lee nada');

  -- T15: el heartbeat de un dispositivo actualiza la tabla devices (monitoreo)
  reset role; set role authenticated; perform t_as(e1);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','hb1','col','dispositivos','id','d1','t',14000,'data','{"dev":"d1","nombre":"Caja 1","rol":"empleado","vis":1760000000000,"pend":2,"ventasPend":2}'::jsonb)), 'd1', '1.0');
  reset role; perform t_assert((select name from devices where id = 'd1') = 'Caja 1' and (select pending_sales from devices where id = 'd1') = 2, 'el servidor registra el estado de cada dispositivo (nombre, pendientes, última señal)');
  -- T17: kardex de inventario: solo el administrador lo escribe y lo lee; reenviar no duplica
  reset role; set role authenticated; perform t_as(a);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','mi1','col','movinv','id','2026-10-03_da','t',15000,'data','{"fecha":"2026-10-03","dev":"da","items":[{"id":"m1","t":15000,"pid":"p-mango","tipo":"entrada","q":20,"antes":-2,"despues":18,"motivo":"Proveedor"}]}'::jsonb)), 'da', '1.0');
  perform t_assert(r->0->>'status' = 'applied' and (select after_qty from inventory_movements where id = 'm1') = 18, 'el administrador registra una entrada de inventario con antes y después');
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','mi2','col','movinv','id','2026-10-03_da','t',15001,'data','{"fecha":"2026-10-03","dev":"da","items":[{"id":"m1","t":15000,"pid":"p-mango","tipo":"entrada","q":20,"antes":-2,"despues":18},{"id":"m2","t":15001,"pid":"p-mango","tipo":"conteo","q":-1,"antes":18,"despues":17}]}'::jsonb)), 'da', '1.0');
  perform t_assert((select count(*) from inventory_movements) = 2, 'reenviar el kardex no duplica movimientos');
  reset role; set role authenticated; perform t_as(e1);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','mi3','col','movinv','id','2026-10-03_d1','t',15002,'data','{"fecha":"2026-10-03","dev":"d1","items":[{"id":"m3","t":15002,"pid":"p-mango","tipo":"entrada","q":99}]}'::jsonb)), 'd1', '1.0');
  perform t_assert(r->0->>'status' = 'rejected', 'el empleado no puede sumar inventario por su cuenta');
  perform t_assert((select count(*) from inventory_movements where id = 'm3') = 0, 'la entrada falsa del empleado no existe');
  perform t_assert((select count(*) from inventory_movements) = 2, 'el empleado ve el kardex (sin costos) para calcular el inventario');
  -- T18: una entrada (delta) suma al inventario sin borrar ventas hechas antes en otro equipo
  reset role; set role authenticated; perform t_as(a);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','mi4','col','movinv','id','2026-10-03_da','t',15003,'data','{"fecha":"2026-10-03","dev":"da","items":[{"id":"m1","t":15000,"pid":"p-mango","tipo":"entrada","q":20,"antes":-2,"despues":18},{"id":"m2","t":15001,"pid":"p-mango","tipo":"conteo","q":-1,"antes":18,"despues":17},{"id":"m4","t":4102444800000,"pid":"p-mango","tipo":"entrada","q":5,"delta":true}]}'::jsonb)), 'da', '1.0');
  perform t_assert((select qty from inventory_current where product_id = 'p-mango') = -2 + 5, 'el inventario del servidor suma la entrada (delta) sobre el conteo y las ventas');
  -- T19: un empleado no puede escribir el documento de otra caja aunque declare ese dispositivo como propio
  reset role; set role authenticated; perform t_as(e1);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','sp1','col','ventas','id','2026-10-03_d2','t',16000,'data','{"fecha":"2026-10-03","dev":"d1","ventas":[]}'::jsonb)), 'd1', '1.0');
  perform t_assert(r->0->>'status' = 'rejected', 'el id del documento debe ser del dispositivo que escribe');
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','sp2','col','audit','id', e1::text || '__audit_2026-10-03','t',9000000000000000,'del',true)), 'd1', '1.0');
  perform t_assert(r->0->>'status' = 'rejected', 'el empleado no puede borrar su auditoría');
  -- T20: una escritura vieja devuelve la versión vigente para que el equipo se corrija
  reset role; set role authenticated; perform t_as(a);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','st9','col','productos','id','p-mango','t',1,'data','{"nombre":"Mango viejo","precio":1}'::jsonb)), 'da', '1.0');
  perform t_assert(r->0->>'status' = 'stale' and (r->0->'data'->>'precio')::numeric = 8500, 'el servidor responde stale con el dato vigente');
  -- T21: anulaciones — el empleado solo anula su propia venta reciente; el administrador, cualquiera; queda el historial
  reset role; set role authenticated; perform t_as(e1);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','vv1','col','ventas','id','2026-10-03_d1','t',20000,'data', jsonb_build_object('fecha','2026-10-03','dev','d1','ventas', jsonb_build_array(
         jsonb_build_object('id','d1-vv-1','n',9,'num','Caja 1 #9','t',20000,'fecha','2026-10-03','uid',e1::text,'dev','d1','m','Efectivo','total',8000,'sub',8000,'desc',0,'estado','confirmada','items','[{"pid":"p-mango","n":"Paleta Mango","q":1,"p":8000,"d":0}]'::jsonb))))), 'd1', '1.0');
  perform t_assert(r->0->>'status' = 'applied', 'el empleado registra una venta propia');
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','an1','col','anulaciones','id','2026-10-03_d1','t',20100,'data', jsonb_build_object('fecha','2026-10-03','dev','d1','items', jsonb_build_array(
         jsonb_build_object('id','an-x1','ventaId','d1-aaa-1','t',20100,'uid',e1::text,'motivo','Error al marcar','total',24000))))), 'd1', '1.0');
  perform t_assert(r->0->>'status' = 'rejected', 'el empleado no puede anular una venta que no es suya');
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','an2','col','anulaciones','id','2026-10-03_d1','t',20200,'data', jsonb_build_object('fecha','2026-10-03','dev','d1','items', jsonb_build_array(
         jsonb_build_object('id','an-x2','ventaId','d1-vv-1','t',20000 + 20*60000,'uid',e1::text,'motivo','Error al marcar','total',8000))))), 'd1', '1.0');
  perform t_assert(r->0->>'status' = 'rejected', 'el empleado no puede anular su venta pasados los 10 minutos');
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','an3','col','anulaciones','id','2026-10-03_d1','t',20300,'data', jsonb_build_object('fecha','2026-10-03','dev','d1','items', jsonb_build_array(
         jsonb_build_object('id','an-1','ventaId','d1-vv-1','t',20000 + 2*60000,'uid',e1::text,'motivo','Error al marcar · marqué dos','total',8000))))), 'd1', '1.0');
  perform t_assert(r->0->>'status' = 'applied', 'el empleado anula su propia venta a los 2 minutos');
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','an4','col','anulaciones','id','2026-10-03_d1','t',20400,'data', jsonb_build_object('fecha','2026-10-03','dev','d1','items', jsonb_build_array(
         jsonb_build_object('id','an-1','ventaId','d1-vv-1','t',20000 + 2*60000,'uid',e1::text,'motivo','Error al marcar · marqué dos','total',8000))))), 'd1', '1.0');
  perform t_assert(r->0->>'status' = 'applied', 'reenviar la misma anulación no se rechaza');
  reset role; set role authenticated; perform t_as(a);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','an5','col','anulaciones','id','2026-10-03_dA','t',20500,'data', jsonb_build_object('fecha','2026-10-03','dev','dA','items', jsonb_build_array(
         jsonb_build_object('id','an-2','ventaId','d1-aaa-1','t',4102444800000,'uid',a::text,'motivo','Cobro duplicado','total',24000))))), 'dA', '1.0');
  perform t_assert(r->0->>'status' = 'applied', 'el administrador anula cualquier venta, aunque sea tarde');
  reset role;
  perform t_assert((select count(*) from sale_voids where id in ('an-1','an-2')) = 2 and (select count(*) from sale_voids where id in ('an-x1','an-x2')) = 0, 'solo quedan las anulaciones permitidas');
  perform t_assert((select reason from sale_voids where id = 'an-1') = 'Error al marcar · marqué dos' and (select user_id from sale_voids where id = 'an-1') = e1::text, 'el historial guarda quién y por qué');
  perform t_assert((select count(*) from sales where id in ('d1-vv-1','d1-aaa-1')) = 2, 'las ventas anuladas no se borran');
  -- T22: cambios de caja de helado — la empleada escribe solo en el documento de su equipo; se unen sin perder registros
  reset role; set role authenticated; perform t_as(e1);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','ch1','col','cajashelado','id','2026-10-03_d1','t',30000,'data','{"fecha":"2026-10-03","dev":"d1","items":[{"id":"c1","t":30000,"sabor":"h-choco","motivo":"inicio","uid":"x"}]}'::jsonb)), 'd1', '1.0');
  perform t_assert(r->0->>'status' = 'applied', 'la empleada registra un cambio de caja en su equipo');
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','ch2','col','cajashelado','id','2026-10-03_d1','t',30100,'data','{"fecha":"2026-10-03","dev":"d1","items":[{"id":"c2","t":30100,"sabor":"h-choco","motivo":"acabo","uid":"x"}]}'::jsonb)), 'd1', '1.0');
  perform t_assert((select jsonb_array_length(data->'items') from oli_docs where collection='cajashelado' and doc_id='2026-10-03_d1') = 2, 'dos cambios enviados por separado se unen (no se pierde ninguno)');
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','ch3','col','cajashelado','id','2026-10-03_d2','t',30200,'data','{"fecha":"2026-10-03","dev":"d2","items":[]}'::jsonb)), 'd1', '1.0');
  perform t_assert(r->0->>'status' = 'rejected', 'la empleada no puede escribir el documento de otro equipo');
  reset role; set role authenticated; perform t_as(e2);
  perform t_assert((select count(*) from oli_docs where collection='cajashelado') = 1, 'otro empleado del negocio ve los cambios de caja');
  reset role; set role authenticated; perform t_as(x);
  perform t_assert((select count(*) from oli_docs where collection='cajashelado') = 0, 'alguien de otro negocio no los ve');
  -- T23: conos — el servidor descuenta lo que gastó cada línea; abrir caja resta una caja cerrada; un cambio anulado se quita
  reset role; set role authenticated; perform t_as(a);
  r := oli_apply(jsonb_build_array(
    jsonb_build_object('op_id','cn1','col','productos','id','i-barq','t',40000,'data','{"nombre":"Barquillo","tipo":"insumo","precio":0,"orden":700.5}'::jsonb),
    jsonb_build_object('op_id','cn2','col','stock','id','i-barq','t',40000,'data','{"base":100,"t":40000}'::jsonb),
    jsonb_build_object('op_id','cn3','col','stock','id','h-choco','t',40000,'data','{"base":5,"t":40000}'::jsonb),
    jsonb_build_object('op_id','cn4','col','productos','id','p-cono2','t',40000,'data','{"nombre":"Cono doble","precio":9000,"cono":{"bolas":2,"barquillo":"i-barq"}}'::jsonb)), 'dA', '1.0');
  perform t_assert((select count(*) from jsonb_array_elements(r) el where el->>'status' = 'applied') = 4 and (select sort from products where id = 'i-barq') = 701, 'un orden con decimales no tumba el lote (se redondea)');
  reset role; set role authenticated; perform t_as(e1);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','cn5','col','ventas','id','2026-10-03_d1','t',41000,'data', jsonb_build_object('fecha','2026-10-03','dev','d1','ventas', jsonb_build_array(
         jsonb_build_object('id','d1-cono-1','n',20,'num','Caja 1 #20','t',41000,'fecha','2026-10-03','uid',e1::text,'dev','d1','m','Efectivo','total',18000,'sub',18000,'desc',0,'estado','confirmada',
           'items','[{"pid":"p-cono2","n":"Cono doble","q":2,"p":9000,"d":0,"sab":["h-choco","h-choco"],"pres":"vaso","det":"Chocolate + Chocolate · vaso","gasta":[{"pid":"i-barq","q":2}]}]'::jsonb))))), 'd1', '1.0');
  perform t_assert((select qty from inventory_current where product_id = 'i-barq') = 98, 'el servidor descuenta los barquillos que gastó el cono');
  perform t_assert((select options->>'pres' from sale_items where sale_id = 'd1-cono-1') = 'vaso', 'la línea guarda sabores y presentación');
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','cn6','col','cajashelado','id','2026-10-03_d1','t',42000,'data','{"fecha":"2026-10-03","dev":"d1","items":[{"id":"c9","t":42000,"sabor":"h-choco","motivo":"acabo","uid":"x"}]}'::jsonb)), 'd1', '1.0');
  perform t_assert((select qty from inventory_current where product_id = 'h-choco') = 4, 'abrir una caja nueva resta una caja cerrada en el servidor');
  reset role; set role authenticated; perform t_as(e2);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','cn7','col','cajashelado','id','2026-10-03_d2','t',42100,'data','{"fecha":"2026-10-03","dev":"d2","items":[{"id":"z1","t":42100,"anula":"c9","uid":"y"}]}'::jsonb)), 'd2', '1.0');
  perform t_assert(r->0->>'status' = 'rejected', 'un empleado no puede anular el cambio de caja de otro equipo');
  reset role; set role authenticated; perform t_as(a);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','cn8','col','cajashelado','id','2026-10-03_dA','t',42200,'data','{"fecha":"2026-10-03","dev":"dA","items":[{"id":"z2","t":42200,"anula":"c9","uid":"a"}]}'::jsonb)), 'dA', '1.0');
  perform t_assert(r->0->>'status' = 'applied' and (select qty from inventory_current where product_id = 'h-choco') = 5, 'el administrador anula el cambio y la caja vuelve al inventario');
  reset role; set role authenticated; perform t_as(e1);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','cn9','col','cajashelado','id','2026-10-03_d1','t',42300,'data','{"fecha":"2026-10-03","dev":"d1","items":[{"id":"c10","t":42300,"sabor":"h-choco","motivo":"acabo","uid":"x"},{"id":"z3","t":42400,"anula":"c10","uid":"x"}]}'::jsonb)), 'd1', '1.0');
  perform t_assert(r->0->>'status' = 'applied' and (select qty from inventory_current where product_id = 'h-choco') = 5, 'reenviar el documento no revive el cambio anulado; el empleado anula el suyo');
  -- T24: una anulación del administrador hecha en la tablet de la empleada no bloquea los cambios que ella marque después
  reset role; set role authenticated; perform t_as(a);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','cn10','col','cajashelado','id','2026-10-04_d1','t',50000,'data','{"fecha":"2026-10-04","dev":"d1","items":[{"id":"za","t":50000,"anula":"c9","uid":"a"}]}'::jsonb)), 'd1', '1.0');
  perform t_assert(r->0->>'status' = 'applied', 'el administrador anula desde la tablet de la empleada');
  reset role; set role authenticated; perform t_as(e1);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','cn11','col','cajashelado','id','2026-10-04_d1','t',50100,'data','{"fecha":"2026-10-04","dev":"d1","items":[{"id":"za","t":50000,"anula":"c9","uid":"a"},{"id":"c11","t":50100,"sabor":"h-choco","motivo":"acabo","uid":"x"}]}'::jsonb)), 'd1', '1.0');
  perform t_assert(r->0->>'status' = 'applied', 'después, la empleada marca su cambio de caja en esa misma tablet sin que se rechace');
  -- T25: nadie copia el cambio de otro equipo a su documento para anularlo; la anulación va al documento del cambio (aunque sea de ayer)
  reset role; v := (select qty from inventory_current where product_id = 'h-choco');
  set role authenticated; perform t_as(e1);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','cf1','col','cajashelado','id','2026-10-05_d1','t',60000,'data','{"fecha":"2026-10-05","dev":"d1","items":[{"id":"c20","t":60000,"sabor":"h-choco","motivo":"acabo","uid":"x"}]}'::jsonb)), 'd1', '1.0');
  perform t_assert(r->0->>'status' = 'applied' and (select qty from inventory_current where product_id = 'h-choco') = v - 1, 'la tablet 1 abre una caja');
  reset role; set role authenticated; perform t_as(e2);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','cf2','col','cajashelado','id','2026-10-05_d2','t',60100,'data','{"fecha":"2026-10-05","dev":"d2","items":[{"id":"c20","t":60000,"sabor":"h-choco","motivo":"inicio","uid":"y"},{"id":"z20","t":60100,"anula":"c20","uid":"y"}]}'::jsonb)), 'd2', '1.0');
  perform t_assert(r->0->>'status' = 'rejected' and (select qty from inventory_current where product_id = 'h-choco') = v - 1, 'otro empleado no anula ese cambio copiándolo en su documento');
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','cf3','col','cajashelado','id','2026-10-05_d2','t',60200,'data','{"fecha":"2026-10-05","dev":"d2","items":[{"id":"c20","t":60000,"sabor":"h-choco","motivo":"inicio","uid":"y"}]}'::jsonb)), 'd2', '1.0');
  perform t_assert(r->0->>'status' = 'rejected', 'tampoco puede guardar una copia del cambio para anularla después');
  reset role; set role authenticated; perform t_as(e1);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','cf4','col','cajashelado','id','2026-10-06_d1','t',60300,'data','{"fecha":"2026-10-06","dev":"d1","items":[{"id":"z21","t":60300,"anula":"c20","uid":"x"}]}'::jsonb)), 'd1', '1.0');
  perform t_assert(r->0->>'status' = 'rejected', 'la anulación en el documento de otro día se rechaza (por eso va al documento del cambio)');
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','cf5','col','cajashelado','id','2026-10-05_d1','t',60400,'data','{"fecha":"2026-10-05","dev":"d1","items":[{"id":"c20","t":60000,"sabor":"h-choco","motivo":"acabo","uid":"x"},{"id":"z22","t":60400,"anula":"c20","uid":"x"}]}'::jsonb)), 'd1', '1.0');
  perform t_assert(r->0->>'status' = 'applied' and (select qty from inventory_current where product_id = 'h-choco') = v, 'pasada la medianoche, la empleada anula su cambio de ayer en el documento de ayer');
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','cf6','col','cajashelado','id','2026-10-05_d1','t',60500,'data','{"fecha":"2026-10-05","dev":"d1","items":[{"id":"c20","t":60000,"sabor":"h-choco","motivo":"acabo","uid":"x"},{"id":"z22","t":60400,"anula":"c20","uid":"x"},{"id":"c23","t":60500,"sabor":"h-choco","motivo":"acabo","uid":"x"}]}'::jsonb)), 'd1', '1.0');
  perform t_assert(r->0->>'status' = 'applied' and (select qty from inventory_current where product_id = 'h-choco') = v - 1, 'y sigue marcando cambios en ese documento');
  reset role; set role authenticated; perform t_as(a);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','cf7','col','cajashelado','id','2026-10-05_d1','t',60600,'data','{"fecha":"2026-10-05","dev":"d1","items":[{"id":"z23","t":60600,"anula":"c23","uid":"a"}]}'::jsonb)), 'dA', '1.0');
  perform t_assert(r->0->>'status' = 'applied' and (select qty from inventory_current where product_id = 'h-choco') = v
                   and (select data->>'dev' from oli_docs where collection = 'cajashelado' and doc_id = '2026-10-05_d1') = 'd1'
                   and (select jsonb_array_length(data->'items') from oli_docs where collection = 'cajashelado' and doc_id = '2026-10-05_d1') = 4, 'el administrador anula en el documento del otro equipo sin borrar nada de él');
  reset role; set role authenticated; perform t_as(e1);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','cf8','col','cajashelado','id','2026-10-05_d1','t',60700,'data','{"fecha":"2026-10-05","dev":"d1","items":[{"id":"c20","t":60000,"sabor":"h-choco","motivo":"acabo","uid":"x"},{"id":"z22","t":60400,"anula":"c20","uid":"x"},{"id":"c23","t":60500,"sabor":"h-choco","motivo":"acabo","uid":"x"},{"id":"z23","t":60600,"anula":"c23","uid":"a"},{"id":"c24","t":60700,"sabor":"h-choco","motivo":"acabo","uid":"x"}]}'::jsonb)), 'd1', '1.0');
  perform t_assert(r->0->>'status' = 'applied' and (select qty from inventory_current where product_id = 'h-choco') = v - 1, 'la tablet reenvía su documento con la anulación del administrador y su cambio nuevo entra');
  -- T28: datos borrados por el administrador antes de una fecha no vuelven (aunque un equipo los reenvíe)
  reset role; set role authenticated; perform t_as(a);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','pg1','col','meta','id','purgas','t',80000,'data','{"cortes":{"ventas":"2026-10-04"}}'::jsonb)), 'dA', '1.0');
  perform t_assert(r->0->>'status' = 'applied', 'el administrador fija la fecha de corte');
  reset role; set role authenticated; perform t_as(e1);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','pg2','col','ventas','id','2026-10-02_d1','t',80100,'data', jsonb_build_object('fecha','2026-10-02','dev','d1','ventas', jsonb_build_array(
         jsonb_build_object('id','d1-viejo-1','n',90,'num','Caja 1 #90','t',80100,'fecha','2026-10-02','uid',e1::text,'dev','d1','m','Efectivo','total',5000,'sub',5000,'desc',0,'estado','confirmada','items','[{"pid":"p1","n":"X","q":1,"p":5000,"d":0}]'::jsonb))))), 'd1', '1.0');
  reset role;
  perform t_assert(r->0->>'status' = 'purged' and not exists (select 1 from oli_docs where collection = 'ventas' and doc_id = '2026-10-02_d1') and not exists (select 1 from sales where id = 'd1-viejo-1'), 'una venta anterior al corte no se guarda (responde purged)');
  set role authenticated; perform t_as(e1);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','pg2','col','ventas','id','2026-10-02_d1','t',80100,'data','{}'::jsonb)), 'd1', '1.0');
  perform t_assert(r->0->>'status' = 'duplicate', 'reenviarla da duplicado (ya se dio por enviada)');
  reset role;
  perform t_assert((select count(*) from oli_docs where collection = 'ventas' and doc_id = '2026-10-03_d1') = 1, 'las ventas del día del corte o después no se tocan');
  set role authenticated; perform t_as(a);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','pg3','col','meta','id','purgas','t',80200,'data','{"cortes":{}}'::jsonb)), 'dA', '1.0');
  reset role;
  -- T30: un sabor de helado dentro de un combo (los conos de antes) son bolas: el servidor no resta cajas por venta; lo demás sí
  reset role; set role authenticated; perform t_as(a);
  r := oli_apply(jsonb_build_array(
    jsonb_build_object('op_id','sb1','col','productos','id','h-vaini','t',95000,'data','{"nombre":"Helado Vainilla","tipo":"insumo","unidad":"cajas","sabor":true,"precio":0}'::jsonb),
    jsonb_build_object('op_id','sb2','col','stock','id','h-vaini','t',95000,'data','{"base":3,"t":95000}'::jsonb),
    jsonb_build_object('op_id','sb3','col','productos','id','i-cucu','t',95000,'data','{"nombre":"Cucurucho","tipo":"insumo","precio":0}'::jsonb),
    jsonb_build_object('op_id','sb4','col','stock','id','i-cucu','t',95000,'data','{"base":50,"t":95000}'::jsonb),
    jsonb_build_object('op_id','sb5','col','productos','id','p-conov','t',95000,'data','{"nombre":"Cono 1 bola Vainilla","precio":5000,"combo":[{"pid":"h-vaini","q":1},{"pid":"i-cucu","q":1}]}'::jsonb)), 'dA', '1.0');
  perform t_assert((select count(*) from jsonb_array_elements(r) el where el->>'status' = 'applied') = 5, 'sabor, cucurucho y cono de antes guardados');
  reset role; set role authenticated; perform t_as(e1);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','sb6','col','ventas','id','2026-10-04_d1','t',95100,'data', jsonb_build_object('fecha','2026-10-04','dev','d1','ventas', jsonb_build_array(
         jsonb_build_object('id','d1-conov-1','n',70,'num','Caja 1 #70','t',95100,'fecha','2026-10-04','uid',e1::text,'dev','d1','m','Efectivo','total',10000,'sub',10000,'desc',0,'estado','confirmada','items','[{"pid":"p-conov","n":"Cono 1 bola Vainilla","q":2,"p":5000,"d":0}]'::jsonb),
         jsonb_build_object('id','d1-conov-2','n',71,'num','Caja 1 #71','t',95200,'fecha','2026-10-04','uid',e1::text,'dev','d1','m','Efectivo','total',5000,'sub',5000,'desc',0,'estado','confirmada','items','[{"pid":"p-conov","n":"Cono 1 bola Vainilla","q":1,"p":5000,"d":0,"gasta":[{"pid":"h-vaini","q":1},{"pid":"i-cucu","q":1}]}]'::jsonb))))), 'd1', '1.0');
  reset role;
  perform t_assert(r->0->>'status' = 'applied' and (select qty from inventory_current where product_id = 'h-vaini') = 3, 'vender conos de antes no resta cajas de helado en el servidor (son bolas)');
  perform t_assert((select qty from inventory_current where product_id = 'i-cucu') = 47, 'pero sí resta los cucuruchos de esos conos (3)');
  -- T31: el caso del 15 de oct.: la anulación llega antes que su venta y se rechaza; reenviada con el mismo op_id sigue rechazada
  -- (no "duplicate", que la app toma como guardado); con un op_id nuevo, ya con la venta en el servidor, entra
  reset role; set role authenticated; perform t_as(e1);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','inc1','col','anulaciones','id','2026-10-04_d1','t',96100,'data', jsonb_build_object('fecha','2026-10-04','dev','d1','items', jsonb_build_array(
         jsonb_build_object('id','an-inc','ventaId','d1-inc-1','t',96009,'uid',e1::text,'motivo','Error al marcar','total',9000))))), 'd1', '1.0');
  perform t_assert(r->0->>'status' = 'rejected', 'una anulación que llega antes que su venta se rechaza');
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','inc2','col','ventas','id','2026-10-04_d1','t',96500,'data', jsonb_build_object('fecha','2026-10-04','dev','d1','ventas', jsonb_build_array(
         jsonb_build_object('id','d1-inc-1','n',72,'num','Caja 1 #72','t',96000,'fecha','2026-10-04','uid',e1::text,'dev','d1','m','Efectivo','total',9000,'sub',9000,'desc',0,'estado','confirmada','items','[{"pid":"p-mango","n":"Paleta Mango","q":1,"p":9000,"d":0}]'::jsonb))))), 'd1', '1.0');
  perform t_assert(r->0->>'status' = 'applied', 'después llega la venta');
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','inc1','col','anulaciones','id','2026-10-04_d1','t',96100,'data', jsonb_build_object('fecha','2026-10-04','dev','d1','items', jsonb_build_array(
         jsonb_build_object('id','an-inc','ventaId','d1-inc-1','t',96009,'uid',e1::text,'motivo','Error al marcar','total',9000))))), 'd1', '1.0');
  perform t_assert(r->0->>'status' = 'rejected' and coalesce(r->0->>'detail','') <> '', 'reenviada con el mismo op_id sigue rechazada, con su motivo (no "duplicate")');
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','inc2','col','ventas','id','2026-10-04_d1','t',96500,'data','{}'::jsonb)), 'd1', '1.0');
  perform t_assert(r->0->>'status' = 'duplicate', 'lo que sí se aplicó, repetido, sigue siendo "duplicate"');
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','inc3','col','anulaciones','id','2026-10-04_d1','t',96100,'data', jsonb_build_object('fecha','2026-10-04','dev','d1','items', jsonb_build_array(
         jsonb_build_object('id','an-inc','ventaId','d1-inc-1','t',96009,'uid',e1::text,'motivo','Error al marcar','total',9000))))), 'd1', '1.0');
  reset role;
  perform t_assert(r->0->>'status' = 'applied' and exists (select 1 from sale_voids where id = 'an-inc' and sale_id = 'd1-inc-1'), 'con un op_id nuevo y la venta ya en el servidor, la anulación entra');
  -- T29: la plata contada (config/saldos) la guarda solo el administrador y el empleado no la puede leer ni cambiar
  reset role; set role authenticated; perform t_as(a);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','sl1','col','config','id','saldos','t',90000,'data','{"efectivo":500000,"cuentas":1200000,"desde":"2026-10-17","t":90000,"uid":"x"}'::jsonb)), 'dA', '1.0');
  perform t_assert(r->0->>'status' = 'applied', 'el administrador guarda la plata contada');
  reset role; set role authenticated; perform t_as(e1);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','sl2','col','config','id','saldos','t',90100,'data','{"efectivo":1,"cuentas":1,"desde":"2026-10-17","t":90100}'::jsonb)), 'd1', '1.0');
  perform t_assert(r->0->>'status' = 'rejected', 'el empleado no puede cambiar la plata contada (rechazado en el servidor)');
  perform t_assert((select count(*) from oli_docs where collection = 'config') = 0, 'el empleado no ve la plata contada (RLS)');
  reset role;
  perform t_assert((select (data->>'efectivo')::int from oli_docs where collection = 'config' and doc_id = 'saldos') = 500000, 'la plata contada quedó como la guardó el administrador');
  -- T27: visita diaria — la clave pública (anon) puede llamar oli_ping y solo recibe la hora (no datos)
  reset role; set role anon;
  perform t_assert(oli_ping() is not null, 'anon puede llamar oli_ping (visita diaria)');
  perform t_assert(not has_table_privilege('anon', 'public.oli_docs', 'select'), 'anon sigue sin poder leer oli_docs');
  reset role;
  perform t_assert(not exists (select 1 from information_schema.routines where routine_name = 'oli_ping' and data_type <> 'timestamp with time zone'), 'oli_ping solo devuelve una hora');
  -- T26: borrar un producto guardado sin equipo (device_id vacío) sí lo borra (antes respondía "applied" y no hacía nada)
  reset role; set role authenticated; perform t_as(a);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','bz1','col','productos','id','p-borrable','t',70000,'data','{"nombre":"Borrable","precio":1000}'::jsonb)), null, 'asistente');
  reset role;
  perform t_assert(r->0->>'status' = 'applied' and (select device_id from oli_docs where collection = 'productos' and doc_id = 'p-borrable') is null, 'producto guardado sin equipo');
  set role authenticated; perform t_as(a);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','bz2','col','productos','id','p-borrable','t',70100,'del',true)), 'dA', '1.0');
  reset role;
  perform t_assert(r->0->>'status' = 'applied' and not exists (select 1 from oli_docs where collection = 'productos' and doc_id = 'p-borrable') and not exists (select 1 from products where id = 'p-borrable'), 'al borrarlo desaparece de verdad (documento y tabla)');
  set role authenticated; perform t_as(a);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','bz3','col','productos','id','p-borrable2','t',70200,'data','{"nombre":"Borrable 2","precio":1000}'::jsonb)), null, 'asistente');
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','bz4','col','productos','id','p-borrable2','t',60000,'del',true)), 'dA', '1.0');
  reset role;
  perform t_assert(r->0->>'status' = 'stale' and exists (select 1 from oli_docs where collection = 'productos' and doc_id = 'p-borrable2'), 'un borrado más viejo que el último cambio no borra (queda "stale")');
  -- T32: notificaciones al administrador (Web Push)
  reset role; set role authenticated; perform t_as(e1);
  begin perform oli_push_suscribir('https://push.example/e1', 'k', 'a', 'd1', null); ok := false; exception when others then ok := true; end;
  perform t_assert(ok, 'un empleado no puede activar notificaciones');
  reset role; set role authenticated; perform t_as(a);
  r := oli_push_suscribir('https://push.example/a1', 'BPkey', 'authk', 'dA', null);
  perform t_assert(r ? 'prefs', 'el administrador activa las notificaciones en su celular');
  begin perform oli_push_suscribir('http://inseguro.example/a2', 'k', 'a', 'dA', null); ok := false; exception when others then ok := true; end;
  perform t_assert(ok, 'una suscripción que no es https se rechaza');
  begin perform oli_push_prefs('https://push.example/a1', '{"venta":"x"}'::jsonb); ok := false; exception when others then ok := true; end;
  perform t_assert(ok, 'preferencias con valores que no son sí/no se rechazan (no pueden dañar el envío)');
  begin perform oli_push_tomar(10); ok := false; exception when others then ok := true; end;
  perform t_assert(ok, 'la app no puede tomar los avisos por mandar (solo el servidor)');
  begin perform count(*) from oli_push_queue; ok := false; exception when others then ok := true; end;
  perform t_assert(ok, 'la app no puede leer la cola de avisos');
  reset role; set role authenticated; perform t_as(e1);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','pd1','col','dispositivos','id','d1','t',96900,'data','{"dev":"d1","nombre":"Caja 1","vis":96900,"rech":0}'::jsonb)), 'd1', '1.0');
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','ps1','col','ventas','id','2026-10-05_d1','t',97000,'data', jsonb_build_object('fecha','2026-10-05','dev','d1','ventas', jsonb_build_array(
         jsonb_build_object('id','d1-ps-1','n',80,'num','Caja 1 #80','t',97000,'fecha','2026-10-05','uid',e1::text,'dev','d1','m','Nequi','total',16000,'sub',16000,'desc',0,'estado','confirmada','items','[{"pid":"p-mango","n":"Paleta Mango","q":2,"p":8000,"d":0}]'::jsonb))))), 'd1', '1.0');
  reset role;
  perform t_assert(r->0->>'status' = 'applied' and (select count(*) from oli_push_queue where kind = 'venta' and title = 'Venta $16.000 · Caja 1' and body = 'Nequi (por confirmar) · 2× Paleta Mango' and dev = 'd1') = 1, 'una venta nueva arma un aviso con el valor, el medio, los productos y la caja');
  set role authenticated; perform t_as(e1);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','ps2','col','ventas','id','2026-10-05_d1','t',97100,'data', jsonb_build_object('fecha','2026-10-05','dev','d1','ventas', jsonb_build_array(
         jsonb_build_object('id','d1-ps-1','n',80,'num','Caja 1 #80','t',97000,'fecha','2026-10-05','uid',e1::text,'dev','d1','m','Nequi','total',16000,'sub',16000,'desc',0,'estado','confirmada','items','[{"pid":"p-mango","n":"Paleta Mango","q":2,"p":8000,"d":0}]'::jsonb),
         jsonb_build_object('id','d1-ps-2','n',81,'num','Caja 1 #81','t',97100,'fecha','2026-10-05','uid',e1::text,'dev','d1','m','Efectivo','total',8000,'sub',8000,'desc',0,'estado','confirmada','items','[{"pid":"p-mango","n":"Paleta Mango","q":1,"p":8000,"d":0}]'::jsonb))))), 'd1', '1.0');
  reset role;
  perform t_assert((select count(*) from oli_push_queue where kind = 'venta') = 2 and exists (select 1 from oli_push_queue where title = 'Venta $8.000 · Caja 1' and body = 'Efectivo · Paleta Mango'), 'al reenviar el documento del día solo avisa la venta nueva');
  set role authenticated; perform t_as(e1);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','ps3','col','ventas','id','2026-10-06_d1','t',98000,'data', jsonb_build_object('fecha','2026-10-06','dev','d1','ventas',
         (select jsonb_agg(jsonb_build_object('id','d1-ps-b' || g,'n',90 + g,'num','Caja 1 #' || (90 + g),'t',98000 + g,'fecha','2026-10-06','uid',e1::text,'dev','d1','m','Efectivo','total',8000,'sub',8000,'desc',0,'estado','confirmada','items','[{"pid":"p-mango","n":"Paleta Mango","q":1,"p":8000,"d":0}]'::jsonb)) from generate_series(1, 4) g)))), 'd1', '1.0');
  reset role;
  perform t_assert((select count(*) from oli_push_queue where kind = 'venta') = 3 and exists (select 1 from oli_push_queue where title = 'Caja 1: llegaron 4 ventas por $32.000'), 'muchas ventas que llegan juntas (estaban sin Internet) salen en un solo aviso');
  set role authenticated; perform t_as(e1);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','pa1','col','anulaciones','id','2026-10-05_d1','t',97200,'data', jsonb_build_object('fecha','2026-10-05','dev','d1','items', jsonb_build_array(
         jsonb_build_object('id','an-ps','ventaId','d1-ps-2','t',97100 + 60000,'uid',e1::text,'motivo','Error al marcar','total',8000))))), 'd1', '1.0');
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','pc1','col','cajas','id','2026-10-05_d1','t',97300,'data', jsonb_build_object('fecha','2026-10-05','dev','d1','devNombre','Caja 1',
         'apertura', jsonb_build_object('id','ap-ps','t',96000,'monto',50000,'uid',e1::text),
         'movs', jsonb_build_array(jsonb_build_object('id','mv-ps','t',97250,'tipo','retiro','monto',20000,'motivo','Hielo','uid',e1::text)),
         'cierres', jsonb_build_array(jsonb_build_object('id','ci-ps','t',97300,'esperado',54000,'contado',49000,'dif',-5000,'obs','No sé','uid',e1::text))))), 'd1', '1.0');
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','pd2','col','dispositivos','id','d1','t',97400,'data','{"dev":"d1","nombre":"Caja 1","vis":97400,"rech":1,"rechInfo":[{"c":"Anulación de una venta","e":"el empleado solo anula su propia venta en los 10 minutos siguientes","t":1}]}'::jsonb)), 'd1', '1.0');
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','pd3','col','dispositivos','id','d1','t',97500,'data','{"dev":"d1","nombre":"Caja 1","vis":97500,"rech":3,"rechInfo":[{"c":"Anulación de una venta","e":"el empleado solo anula su propia venta en los 10 minutos siguientes","t":1},{"c":"Caja del dom","e":"sin permiso para cajas","t":2},{"c":"Pérdidas del dom","e":"sin permiso para mermas","t":3}]}'::jsonb)), 'd1', '1.0');
  reset role;
  perform t_assert(exists (select 1 from oli_push_queue where kind = 'anulacion' and title = 'Venta anulada · Caja 1' and body = 'Caja 1 #81 por $8.000 · Error al marcar'), 'una anulación avisa qué venta, cuánto y por qué');
  perform t_assert(exists (select 1 from oli_push_queue where kind = 'caja' and title = 'Caja 1 abrió caja' and body = 'Base $50.000')
               and exists (select 1 from oli_push_queue where kind = 'dinero' and title = 'Salió $20.000 de Caja 1' and body = 'Hielo')
               and exists (select 1 from oli_push_queue where kind = 'caja' and title = 'Caja 1 cerró caja: faltaron $5.000' and body = 'Esperado $54.000 · contado $49.000 · No sé'), 'abrir caja, sacar dinero y cerrar con faltante avisan');
  perform t_assert(exists (select 1 from oli_push_queue where kind = 'problema' and title = 'Caja 1: un cambio no llegó al servidor'), 'un cambio que el servidor no aceptó avisa al administrador');
  perform t_assert(exists (select 1 from oli_push_queue where kind = 'problema' and title = 'Caja 1: 2 cambios no llegaron al servidor' and body like 'Pérdidas del dom (sin permiso para mermas)%'), 'si suben los rechazos, el aviso cuenta cuántos y describe el nuevo (no el viejo)');
  set role service_role;
  r := oli_push_tomar(100);
  reset role;
  perform t_assert(jsonb_array_length(r) = 9 and (select bool_and(jsonb_array_length(ev->'subs') = 1 and ev->'subs'->0->>'endpoint' = 'https://push.example/a1') from jsonb_array_elements(r) ev), 'el servidor toma los avisos y sabe a qué celular mandarlos');
  set role authenticated; perform t_as(a);
  r := oli_push_prefs('https://push.example/a1', '{"venta":false}'::jsonb);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','pc2','col','cajas','id','2026-10-07_dA','t',99000,'data','{"fecha":"2026-10-07","dev":"dA","apertura":{"id":"ap-a","t":99000,"monto":10000}}'::jsonb)), 'dA', '1.0');
  reset role; set role authenticated; perform t_as(e1);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','ps4','col','ventas','id','2026-10-07_d1','t',99100,'data', jsonb_build_object('fecha','2026-10-07','dev','d1','ventas', jsonb_build_array(
         jsonb_build_object('id','d1-ps-9','n',99,'num','Caja 1 #99','t',99100,'fecha','2026-10-07','uid',e1::text,'dev','d1','m','Efectivo','total',8000,'sub',8000,'desc',0,'estado','confirmada','items','[{"pid":"p-mango","n":"Paleta Mango","q":1,"p":8000,"d":0}]'::jsonb))))), 'd1', '1.0');
  reset role; set role service_role;
  r := oli_push_tomar(100);
  reset role;
  perform t_assert(jsonb_array_length(r) = 2 and (select bool_and(jsonb_array_length(ev->'subs') = 0) from jsonb_array_elements(r) ev), 'no le avisa lo que apagó (ventas) ni lo que hizo en su propio equipo');
  set role authenticated; perform t_as(a);
  r := oli_push_prueba('https://push.example/a1');
  reset role; set role service_role;
  r := oli_push_tomar(100);
  perform oli_push_resultado(array[(r->0->>'id')::bigint], array['https://push.example/a1'], array[]::text[]);
  reset role;
  perform t_assert(jsonb_array_length(r) = 1 and r->0->>'kind' = 'prueba' and r->0->'subs'->0->>'endpoint' = 'https://push.example/a1' and (select sent_at is not null from oli_push_queue where id = (r->0->>'id')::bigint), 'la notificación de prueba va solo a ese celular y queda enviada');
  -- un aviso que llegó a un equipo y falló en otro: al reintentar no se repite en el primero
  reset role; set role authenticated; perform t_as(a);
  r := oli_push_suscribir('https://push.example/a2', 'BPkey2', 'authk2', 'dB', null);
  reset role; set role authenticated; perform t_as(e1);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','pc3','col','cajas','id','2026-10-08_d1','t',99300,'data','{"fecha":"2026-10-08","dev":"d1","apertura":{"id":"ap-8","t":99300,"monto":20000}}'::jsonb)), 'd1', '1.0');
  reset role; set role service_role;
  r := oli_push_tomar(100);
  perform t_assert(jsonb_array_length(r) = 1 and jsonb_array_length(r->0->'subs') = 2, 'un aviso va a los dos equipos del administrador');
  perform oli_push_resultado(array[]::bigint[], array['https://push.example/a1'], array[]::text[], jsonb_build_array(jsonb_build_object('id', r->0->'id', 'endpoint', 'https://push.example/a1')), jsonb_build_array(jsonb_build_object('endpoint', 'https://push.example/a2', 'status', 413)));
  reset role;
  update oli_push_queue set claimed_at = now() - interval '5 minutes' where id = (r->0->>'id')::bigint;
  set role service_role;
  r := oli_push_tomar(100);
  reset role;
  perform t_assert(jsonb_array_length(r) = 1 and jsonb_array_length(r->0->'subs') = 1 and r->0->'subs'->0->>'endpoint' = 'https://push.example/a2', 'al reintentar, el aviso solo va al equipo donde no llegó (no se repite)');
  perform t_assert((select fails = 1 and last_error = 'el servicio de avisos respondió 413' from oli_push_subs where endpoint = 'https://push.example/a2'), 'lo que el servicio de avisos no acepta queda registrado en ese equipo');
  set role authenticated; perform t_as(a);
  perform oli_push_quitar('https://push.example/a2');
  reset role; set role service_role;
  perform oli_push_resultado(array[(r->0->>'id')::bigint], array[]::text[], array[]::text[]);
  perform oli_push_resultado(array[]::bigint[], array[]::text[], array['https://push.example/a1']);
  reset role;
  perform t_assert(not exists (select 1 from oli_push_subs where endpoint = 'https://push.example/a1'), 'un celular que ya no recibe (el navegador la quitó) se borra de la lista');
  set role authenticated; perform t_as(e1);
  r := oli_apply(jsonb_build_array(jsonb_build_object('op_id','ps5','col','ventas','id','2026-10-07_d1','t',99200,'data', jsonb_build_object('fecha','2026-10-07','dev','d1','ventas', jsonb_build_array(
         jsonb_build_object('id','d1-ps-10','n',100,'num','Caja 1 #100','t',99200,'fecha','2026-10-07','uid',e1::text,'dev','d1','m','Efectivo','total',8000,'sub',8000,'desc',0,'estado','confirmada','items','[{"pid":"p-mango","n":"Paleta Mango","q":1,"p":8000,"d":0}]'::jsonb))))), 'd1', '1.0');
  reset role;
  perform t_assert(r->0->>'status' = 'applied' and not exists (select 1 from oli_push_queue where tag = 'venta-d1-ps-10'), 'sin nadie con avisos activados, la venta se guarda y no se arma ningún aviso');
  -- T16: coherencia de totales
  reset role;
  perform t_assert((select sum(total) from sales) = (select sum(amount) from payments), 'total de ventas = total de pagos');
  perform t_assert((select sum(total) from sales) = (select sum(qty * unit_price - discount) from sale_items), 'total de ventas = suma de sus productos');
  raise notice 'TODAS LAS PRUEBAS DE BASE DE DATOS PASARON';
end $$;
