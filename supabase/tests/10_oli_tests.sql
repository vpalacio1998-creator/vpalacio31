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
  -- T16: coherencia de totales
  reset role;
  perform t_assert((select sum(total) from sales) = (select sum(amount) from payments), 'total de ventas = total de pagos');
  perform t_assert((select sum(total) from sales) = (select sum(qty * unit_price - discount) from sale_items), 'total de ventas = suma de sus productos');
  raise notice 'TODAS LAS PRUEBAS DE BASE DE DATOS PASARON';
end $$;
