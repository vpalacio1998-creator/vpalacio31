/* ============ 85 · catálogo real de OLI y datos de demostración ============ */
const DEMO = "demo-";
const DEMO_PERSONAS = {"demo-u1": "María", "demo-u2": "Juan"};
const esDemoId = id => String(id).startsWith(DEMO);
const hoy0 = () => parse(S.today).getTime();

/* ---------- catálogo real (OLI_negocio.xlsx): cada sabor es un producto ---------- */
async function cargarCatalogoOLI() {
  exigirAdmin(); let o = 1;
  const P = async (id, nombre, cat, precio, costo, o2 = {}) => { await put("productos", id, Object.assign({nombre, cat, tipo: "terminado", precio, unidad: "und", min: 3, seg: 0, pack: 1, activo: true, controla: false, orden: o++, imp: {t: "validar", r: 0}}, o2)); if (costo != null) await put("costos", id, {costo, hist: [{t: Date.now(), c: costo}]}); };
  const pal = [["Arequipe queso", 15], ["Bocadillo queso", 15], ["Milky", 10], ["Quimbaya", 5], ["Yogurt y frutos rojos", 8], ["Yogurt y frutas exóticas", 7], ["Arequipe coco", 6], ["Brownie", 6], ["Maracuyá", 6], ["Queso mora", 6]];
  for (const [n, st] of pal) { const id = "p-pal-" + n.toLowerCase().replace(/[^a-z]+/g, "-"); await P(id, "Paleta " + n, "Paletas", 11000, 7255, {controla: true, min: 3, seg: 4}); await put("stock", id, {base: st, t: Date.now()}); }
  for (const [n, st] of [["Queso arequipe", 5], ["Yogurt maracuyá", 5]]) { const id = "p-light-" + n.toLowerCase().replace(/[^a-z]+/g, "-"); await P(id, "Paleta light " + n, "Paletas", 12000, 7650, {controla: true, min: 2, seg: 2}); await put("stock", id, {base: st, t: Date.now()}); }
  await P("p-galleta", "Galleta", "Otros", 4000, 2000, {controla: true}); await put("stock", "p-galleta", {base: 20, t: Date.now()});
  for (const [id, n, pr] of [["p-cafe", "Café", 3500], ["p-capuchino", "Capuchino", 8500], ["p-latte", "Latte", 6000], ["p-milo", "Milo", 6000]]) await P(id, n, "Bebidas", pr, null);
  await P("p-michelada", "Michelada de frutas", "Bebidas", 9000, 3000); await P("p-agua", "Botella de agua", "Bebidas", 2000, 700, {controla: true, min: 6}); await put("stock", "p-agua", {base: 24, t: Date.now()});
  await P("p-soda", "Soda", "Bebidas", 4000, 2300, {controla: true, min: 6}); await put("stock", "p-soda", {base: 24, t: Date.now()});
  for (const [k, n, p12, p9, c12, c9] of [["mango", "Mango biche", 6500, 5000, 1950, 1425], ["rojos", "Frutos rojos", 7500, 5500, 2200, 1600], ["coco", "Limonada de coco", 8000, 6000, 2289, 1663], ["lulo", "Lulo", 7000, 5500, 2093, 1525]]) { await P("p-g12-" + k, "Granizado " + n + " 12 oz", "Bebidas", p12, c12, {icono: "granizado"}); await P("p-g9-" + k, "Granizado " + n + " 9 oz", "Bebidas", p9, c9, {icono: "granizado"}); }
  const ins = [["Vasos 12 oz", "vasos", "Empaques"], ["Vasos 9 oz", "vasos", "Empaques"], ["Tapas", "tapas", "Empaques"], ["Pitillos", "pitillos", "Empaques"], ["Servilletas", "paquetes", "Empaques"], ["Vasos para conos", "unidades", "Empaques"], ["Crema para conos", "unidades", "Otros"], ["Jabón de manos", "unidades", "Aseo"], ["Papel higiénico", "rollos", "Aseo"], ["Toallas de mano", "paquetes", "Aseo"]];
  let i = 0; for (const [n, u, c] of ins) await put("productos", "i-" + (i++), {nombre: n, cat: c, tipo: "insumo", precio: 0, unidad: u, min: 5, seg: 0, pack: 1, activo: true, controla: true, orden: 500 + i, max: 20});
  await guardarConfig({nombre: "OLI", margenObjetivo: .6, gastosFijos: [{n: "Arriendo", v: 1500000}, {n: "Trabajadoras", v: 3000000}, {n: "Industria y comercio", v: 70000}, {n: "Luz", v: 0}, {n: "Agua", v: 0}, {n: "Internet", v: 0}], movimientosEmpleado: true, preciosIncluyenImpuesto: true});
  await put("meta", "app", {modo: "real", creado: Date.now(), version: 2});
}
async function empezarVacio() { exigirAdmin(); await guardarConfig({nombre: "OLI", margenObjetivo: .6, gastosFijos: [], movimientosEmpleado: true, preciosIncluyenImpuesto: true}); await put("meta", "app", {modo: "real", creado: Date.now(), version: 2}); }

/* ---------- datos de demostración: un mes completo, reproducible ---------- */
async function cargarDemo() {
  exigirAdmin(); const R = rng(20261004), now = Date.now(), hoy = S.today, nDias = 34, mid = hoy0();
  const PR = [  // id, nombre, cat, precio, costo, min, seg, stockDespuesDeHoy, peso
    ["mango", "Paleta Mango", "Paletas", 8000, 3360, 8, 6, 9, 0.22], ["fresa", "Paleta Fresa", "Paletas", 8000, 4200, 8, 6, 14, 0.17], ["maracuya", "Paleta Maracuyá", "Paletas", 8000, 2500, 8, 6, 7, 0.14],
    ["chocolate", "Paleta Chocolate", "Paletas", 9000, 4000, 6, 5, 28, 0.11], ["mora", "Paleta Mora", "Paletas", 8000, 3200, 6, 5, 25, 0.08], ["coco", "Paleta Coco", "Paletas", 8500, 3500, 4, 3, 42, 0.012], ["limon", "Paleta Limón", "Paletas", 7500, 2800, 6, 4, 18, 0.07],
    ["cono", "Helado Cono Vainilla", "Helados", 6000, 2200, 6, 4, 30, 0.07], ["agua", "Botella de agua", "Bebidas", 2500, 900, 8, 6, 40, 0.05], ["soda", "Soda", "Bebidas", 4000, 2200, 8, 6, 22, 0.04]];
  const P = {}; PR.forEach(x => P[x[0]] = {id: DEMO + "p-" + x[0], n: x[1], pr: x[3], co: x[4], w: x[8]});
  let orden = 1; for (const [k, n, cat, pr, co, mn, sg] of PR) { const id = DEMO + "p-" + k; await put("productos", id, {nombre: n, cat, tipo: "terminado", precio: pr, unidad: "und", min: mn, seg: sg, pack: 1, activo: true, controla: true, orden: orden++, imp: {t: "validar", r: 0}, color: undefined}); }
  await put("productos", DEMO + "p-combo", {nombre: "Combo 2 paletas", cat: "Combos", tipo: "terminado", precio: 14000, unidad: "und", min: 0, seg: 0, pack: 1, activo: true, controla: true, orden: 20, combo: [{pid: DEMO + "p-mango", q: 1}, {pid: DEMO + "p-fresa", q: 1}], imp: {t: "validar", r: 0}});
  for (const [k, , , , co] of PR) { const id = DEMO + "p-" + k; const hist = k === "mango" ? [{t: now - 40 * 864e5, c: 2850}, {t: now - 9 * 864e5, c: 3360}] : k === "fresa" ? [{t: now - 40 * 864e5, c: 4200}] : [{t: now - 40 * 864e5, c: co}]; await put("costos", id, {costo: hist[hist.length - 1].c, hist}); }
  const INS = [["mango", "Mango (fruta)", "kg", "Frutas", 6500, 5, 4, 14, [{t: now - 40 * 864e5, c: 5500}, {t: now - 10 * 864e5, c: 6500}]], ["fresa", "Fresa (fruta)", "kg", "Frutas", 9000, 2.5, 3, 12, null], ["maracuya", "Maracuyá (pulpa)", "kg", "Frutas", 12000, 6, 3, 10, null], ["leche", "Leche", "litros", "Lácteos", 3200, 12, 6, 24, null], ["azucar", "Azúcar", "kg", "Otros", 3800, 9, 5, 20, null],
    ["palitos", "Palitos", "und", "Empaques", 40, 220, 150, 600, null], ["empaques", "Empaques", "und", "Empaques", 90, 140, 150, 600, null], ["jabon", "Jabón de manos", "und", "Aseo", 4500, 3, 2, 6, null]];
  for (const [k, n, u, cat, co, st, mn, mx, hist] of INS) { const id = DEMO + "i-" + k; await put("productos", id, {nombre: n, cat, tipo: "insumo", precio: 0, unidad: u, min: mn, seg: 0, pack: 1, max: mx, activo: true, controla: true, orden: 100}); await put("costos", id, {costo: co, hist: hist || [{t: now - 40 * 864e5, c: co}]}); await put("stock", id, {base: st, t: mid}); }
  for (const [k, , , , , , , , w] of PR.filter(x => ["mango", "fresa", "maracuya", "chocolate", "mora", "coco", "limon"].includes(x[0]))) await put("recetas", DEMO + "p-" + k, {lineas: [{iid: DEMO + "i-" + (k === "mango" ? "mango" : k === "fresa" ? "fresa" : k === "maracuya" ? "maracuya" : "leche"), q: k === "mango" || k === "fresa" || k === "maracuya" ? 0.1 : 0.08}, {iid: DEMO + "i-azucar", q: 0.02}, {iid: DEMO + "i-palitos", q: 1}, {iid: DEMO + "i-empaques", q: 1}], rinde: 1});
  /* ventas */
  const dowF = {0: 1.3, 1: .7, 2: .78, 3: .9, 4: 1.0, 5: 1.2, 6: 1.5}, hw = [0, 0, 0, 0, 0, 0, 0, 0, 0, .02, .04, .06, .08, .07, .07, .10, .14, .15, .10, .07, .05, .03, .01, 0];
  const pesos = (dow) => PR.map(x => [x[0], x[8] * (x[0] === "maracuya" && dow === 0 ? 1.24 : 1) * (x[0] === "mango" && dow === 6 ? 1.18 : 1)]);
  const pick = (arr) => { const tot = sum(arr, a => a[1]); let r = R() * tot; for (const [k, w] of arr) { r -= w; if (r <= 0) return k; } return arr[0][0]; };
  const metodos = [["Efectivo", .35], ["Nequi", .28], ["Tarjeta", .24], ["Daviplata", .13]], docs = {}, ventasHoy = {}, soldHoy = {};
  const DEVS = [["demo-c1", "Caja 1", "demo-u1"], ["demo-c2", "Caja 2", "demo-u2"]];
  for (let d = -nDias; d <= 0; d++) {
    const f = addDays(hoy, d), dow = dowOf(f), n = Math.round(34 * dowF[dow] * (0.88 + R() * 0.24) * (1 + (d + nDias) * 0.004)), cnt = {};
    for (let i = 0; i < n; i++) {
      let h = pick(hw.map((w, hh) => [hh, w + (dow === 6 && hh >= 12 && hh <= 14 ? 0.04 : 0)]).filter(x => x[1] > 0)); const min = Math.floor(R() * 60), t = new Date(parse(f).getFullYear(), parse(f).getMonth(), parse(f).getDate(), h, min, Math.floor(R() * 60)).getTime();
      if (t > now) continue; const dv = R() < 0.6 ? DEVS[0] : DEVS[1], k = dv[0] + f; cnt[k] = (cnt[k] || 0) + 1;
      const items = [], nI = 1 + Math.floor(R() * 2), ya = {}; for (let j = 0; j < nI; j++) { const key = pick(pesos(dow)), q = R() < .2 ? 2 : 1; ya[key] = (ya[key] || 0) + q; }
      if (R() < .06) { items.push({pid: DEMO + "p-combo", n: "Combo 2 paletas", q: 1, p: 14000, d: 0, imp: {t: "validar", r: 0, base: 14000, v: 0}}); }
      for (const [key, q] of Object.entries(ya)) items.push({pid: P[key].id, n: P[key].n, q, p: PR.find(x => x[0] === key)[3], d: 0, imp: {t: "validar", r: 0, base: PR.find(x => x[0] === key)[3] * q, v: 0}});
      const total = sum(items, x => x.p * x.q), m = pick(metodos), seq = cnt[k], v = {id: DEMO + f + "-" + dv[0] + "-" + seq, n: seq, num: dv[1] + " #" + seq, t, fecha: f, uid: dv[2], dev: dv[0], m, total, sub: total, desc: 0, recibido: total, cambio: 0, ref: "", cliente: null, estado: "confirmada", confirmada: true, items};
      const key = DEMO + f + "_" + dv[0]; (docs[key] = docs[key] || {fecha: f, dev: dv[0], uid: dv[2], devNombre: dv[1], ventas: []}).ventas.push(v);
      if (f === hoy) for (const it of items) { soldHoy[it.pid] = (soldHoy[it.pid] || 0) + it.q; if (it.pid === DEMO + "p-combo") { soldHoy[DEMO + "p-mango"] = (soldHoy[DEMO + "p-mango"] || 0) + it.q; soldHoy[DEMO + "p-fresa"] = (soldHoy[DEMO + "p-fresa"] || 0) + it.q; } }
    }
  }
  for (const [k, d] of Object.entries(docs)) await put("ventas", k, d);
  /* inventario al empezar hoy = lo que debe quedar + lo vendido hoy */
  for (const [k, , , , , , , dej] of PR) { const id = DEMO + "p-" + k; await put("stock", id, {base: dej + (soldHoy[id] || 0), t: mid}); }
  /* cajas */
  let anul = 0, difs = 0;
  for (const [k, d] of Object.entries(docs)) {
    const f = d.fecha, vs = d.ventas, ef = sum(vs.filter(v => v.m === "Efectivo"), v => v.total), tt = vs.map(v => v.t), t0 = new Date(parse(f).getTime() + 8.5 * 3600000).getTime(), dow = dowOf(f), ret = dow === 6 ? 150000 : 0, gas = R() < .25 ? 15000 : 0, esp = 200000 + ef - ret - gas, cerr = f !== hoy;
    const dif = cerr && [-30, -17, -11, -5, -3].includes(diffDays(f, hoy)) && difs < 5 && d.dev === "demo-c1" ? (difs++, [-5000, -12000, -5000, 3000, -5000][difs - 1]) : 0, movs = [];
    if (ret) movs.push({id: DEMO + "m" + k + "r", t: t0 + 5.5 * 3600000, tipo: "retiro", monto: ret, motivo: "Retiro del dueño", cat: "", uid: d.uid}); if (gas) movs.push({id: DEMO + "m" + k + "g", t: t0 + 4 * 3600000, tipo: "gasto", monto: gas, motivo: "Domicilio", cat: "Transporte", uid: d.uid});
    await put("cajas", DEMO + f + "_" + d.dev, {fecha: f, dev: d.dev, devNombre: d.devNombre, apertura: {id: DEMO + "a" + k, t: t0, monto: 200000, uid: d.uid}, movs, cierres: cerr ? [{id: DEMO + "c" + k, t: t0 + 12.6 * 3600000, uid: d.uid, esperado: esp, contado: esp + dif, dif, obs: dif ? "Error de cambio" : "", resumen: {ventas: sum(vs, v => v.total), n: vs.length, por: {}, apertura: 200000, ingresos: 0, retiros: ret, gastos: gas}}] : []});
  }
  /* anulaciones y mermas */
  const ks = Object.keys(docs); for (const j of [3, 11, 20]) { const d = docs[ks[j]], v = d && d.ventas[2]; if (v) { await put("anulaciones", DEMO + "an" + j, {fecha: d.fecha, dev: d.dev, items: [{id: DEMO + "an" + j, ventaId: v.id, t: v.t + 120000, uid: d.uid, motivo: "Error al cobrar", total: v.total}]}); anul++; } }
  const MER = [[-32, "coco", 2, "Vencimiento"], [-27, "coco", 2, "Vencimiento"], [-20, "fresa", 1, "Daño"], [-14, "coco", 2, "Vencimiento"], [-12, "mango", 1, "Error"], [-9, "mora", 1, "Daño"], [-6, "coco", 3, "Vencimiento"], [-3, "limon", 1, "Preparación"], [-1, "coco", 2, "Vencimiento"]];
  for (let i = 0; i < MER.length; i++) { const [dd, k, q, mo] = MER[i], f = addDays(hoy, dd); await put("mermas", DEMO + "mer" + i, {fecha: f, dev: "demo-c1", items: [{id: DEMO + "mm" + i, t: parse(f).getTime() + 15 * 3600000, pid: P[k].id, q, motivo: mo, obs: "", uid: "demo-u1"}]}); }
  /* terceros, compras, gastos */
  await put("terceros", DEMO + "t1", {tipo: "proveedor", nombre: "Helados Del Valle SAS (demo)", nit: "900123456-7", regimen: "Responsable de IVA", correo: "ventas@ejemplo.co", obligadoFacturar: true});
  await put("terceros", DEMO + "t2", {tipo: "proveedor", nombre: "Fruver Don Pepe (demo)", nit: "12345678", regimen: "No responsable", obligadoFacturar: false});
  await put("terceros", DEMO + "t3", {tipo: "proveedor", nombre: "Empaques y Más (demo)", nit: "", regimen: "", obligadoFacturar: true});
  for (let c = 0; c < 7; c++) { const f = addDays(hoy, -33 + c * 5), prov = c % 3 === 1 ? "Fruver Don Pepe (demo)" : "Helados Del Valle SAS (demo)", lineas = ["mango", "fresa", "maracuya", "chocolate", "mora", "limon"].map(k => ({pid: P[k].id, q: 60 + Math.floor(R() * 80), costo: PR.find(x => x[0] === k)[4], ok: true}));
    await put("compras", DEMO + "c" + c, {estado: "recibido", fecha: f, recFecha: f, recT: parse(f).getTime() + 10 * 3600000, t: parse(f).getTime(), proveedor: prov, nit: c % 3 === 1 ? "12345678" : "900123456-7", factura: c === 2 || c === 5 ? "" : "FE-" + (1000 + c), iva: 0, soporte: c === 2 || c === 5 ? {tipo: "Sin soporte", ref: ""} : {tipo: "Factura electrónica", ref: "FE-" + (1000 + c)}, lineas}); }
  await put("compras", DEMO + "cp", {estado: "pedido", fecha: hoy, t: now, proveedor: "Empaques y Más (demo)", motivo: "Lista de insumos", lineas: [{pid: DEMO + "i-empaques", q: 500, costo: 90, ok: false}, {pid: DEMO + "i-palitos", q: 400, costo: 40, ok: true}]});
  const G = [[-30, "Arrendamiento", "Arriendo del local", 1500000, "Transferencia", "Inmobiliaria Centro"], [-26, "Nómina", "Nómina quincenal", 1500000, "Transferencia", ""], [-22, "Servicios", "Energía", 180000, "Transferencia", "Empresa de energía"], [-21, "Servicios", "Internet", 95000, "Transferencia", ""], [-18, "Servicios", "Agua", 90000, "Efectivo", ""], [-15, "Publicidad", "Pauta en redes", 120000, "Tarjeta", ""], [-11, "Nómina", "Nómina quincenal", 1500000, "Transferencia", ""], [-9, "Mantenimiento", "Mantenimiento de neveras", 80000, "Efectivo", "Frío Técnico"], [-5, "Transporte", "Domicilios", 45000, "Efectivo", ""], [-2, "Transporte", "Domicilios", 30000, "Efectivo", ""]];
  for (let i = 0; i < G.length; i++) { const [dd, cat, desc, valor, m, prov] = G[i], f = addDays(hoy, dd); await put("gastos", DEMO + "g" + i, {fecha: f, cat, desc, valor, m, proveedor: prov, base: valor, iva: 0, retencion: 0, soporte: {ref: i % 3 === 0 ? "" : "SP-" + (200 + i)}, estado: "registrado", uid: "demo-u3", t: parse(f).getTime() + 11 * 3600000}); }
  await put("dispositivos", DEMO + "c1", {dev: "demo-c1", nombre: "Caja 1 (demo)", uid: "demo-u1", rol: "empleado", vis: now - 4000, pend: 0, ventasPend: 0});
  await put("dispositivos", DEMO + "c2", {dev: "demo-c2", nombre: "Caja 2 (demo)", uid: "demo-u2", rol: "empleado", vis: now - 9 * 60000, pend: 3, ventasPend: 3});
  await guardarConfig({nombre: "OLI (demostración)", metaDia: 500000, margenObjetivo: .6, gastosFijos: [{n: "Arriendo", v: 1500000}, {n: "Nómina", v: 3000000}, {n: "Servicios", v: 365000}], movimientosEmpleado: true, preciosIncluyenImpuesto: true});
  await put("meta", "app", {modo: "demo", creado: now, version: 2}); Object.assign(NAMES, DEMO_PERSONAS);
}
async function borrarDemo() {
  exigirAdmin(); const cols = SHARED_COLS.concat(ADMIN_COLS).filter(c => c !== "meta");
  for (const c of cols) for (const id of Object.keys(DS.c[c] || {})) if (esDemoId(id)) await remove(c, id);
  for (const id of Object.keys(DS.c.stock || {})) if (esDemoId(id)) await remove("stock", id);
  const m = col("meta").app; if (m && m.modo === "demo") { await remove("meta", "app"); await remove("config", "negocio").catch(() => {}); }
}
