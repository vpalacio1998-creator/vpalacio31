/* ============ 40 · acciones (servicios) ============
   Cada acción valida permisos y reglas de negocio, escribe local primero (offline-first) y deja rastro de auditoría. */
const uidActual = () => DS.uid || "local";
async function guardar(fn, ok) { try { const r = await fn(); if (ok) toast(ok); return r; } catch (e) { toast(e && e.message && e.code !== "denied" && !e.code ? e.message : errMsg(e), true); return null; } }
function errMsg(e) { const c = e && e.code; if (c === "pausa") return e.message; if (c === "denied" || c === "invalid_argument") return "No tienes permiso para hacer esto."; if (c === "quota_exceeded") return "Se llenó el espacio de datos. Avísale al administrador."; return "No se pudo guardar en este dispositivo. Libera espacio e inténtalo otra vez."; }
function exigirAdmin() { if (!esAdmin()) { const e = new Error("denied"); e.code = "denied"; throw e; } }

/* ---------- ventas ---------- */
function totalCarrito() { return sum(S.cart, c => c.p * c.q); }
const cantCarrito = () => sum(S.cart, c => c.q);
const enCarrito = pid => sum(S.cart.filter(c => c.pid === pid), c => c.q);
// demanda real del pedido por producto que lleva inventario (los combos se abren en sus componentes)
function demandaPedido(cart) {
  const m = {}; for (const c of cart) { const p = prod(c.pid); if (!p) continue; if (p.combo) for (const x of p.combo) m[x.pid] = (m[x.pid] || 0) + x.q * c.q; else m[c.pid] = (m[c.pid] || 0) + c.q; }
  return m;
}
function faltante(cart) {   // primer producto cuyo inventario no alcanza para el pedido, o null
  const d = demandaPedido(cart);
  for (const [pid, q] of Object.entries(d)) { const p = prod(pid); if (!p || p.controla === false) continue; const st = stockDe(pid); if (st != null && q > Math.max(0, st)) return {p, st: Math.max(0, st)}; }
  return null;
}
function agregarAlCarrito(p) {
  const e = estadoProd(p); if (e.k === "agotado") { toast(p.nombre + " está agotado.", true); return false; }
  const prueba = S.cart.map(c => Object.assign({}, c)), ex0 = prueba.find(c => c.pid === p.id); if (ex0) ex0.q++; else prueba.push({pid: p.id, q: 1});
  const f = faltante(prueba); if (f) { toast("Solo hay " + f.st + " de " + f.p.nombre + ".", true); return false; }
  const ex = S.cart.find(c => c.pid === p.id); if (ex) ex.q++; else S.cart.push({pid: p.id, n: p.nombre, q: 1, p: p.precio}); return true;
}
function cambiarCantidad(pid, d) {
  const c = S.cart.find(x => x.pid === pid); if (!c) return; const p = prod(pid);
  if (d > 0 && p) { const prueba = S.cart.map(x => Object.assign({}, x, x.pid === pid ? {q: x.q + d} : {})), f = faltante(prueba); if (f) { toast("No hay más inventario de " + f.p.nombre + ".", true); return; } }
  c.q += d; if (c.q <= 0) S.cart = S.cart.filter(x => x !== c);
}
/* impuesto de la línea: se toma del tratamiento configurado en el producto. Si no está validado, no se asume. */
function impLinea(p, precioTotalLinea) {
  const imp = p && p.imp; if (!imp || !imp.t || imp.t === "validar") return {t: "validar", r: 0, base: precioTotalLinea, imp: 0};
  // el precio al público incluye el impuesto: lo cobrado nunca cambia; se separa base e impuesto para el contador
  const r = (imp.t === "iva" || imp.t === "inc" || imp.t === "otro") ? (Number(imp.r) || 0) : 0, base = Math.round(precioTotalLinea / (1 + r));
  return {t: imp.t, r, base, imp: Math.round(precioTotalLinea) - base};
}
async function registrarVenta(opts) {
  if (!DS.canWrite) throw Object.assign(new Error("denied"), {code: "denied"});
  if (!S.cart.length) throw new Error("El pedido está vacío.");
  const caja = cajaHoy();
  if (!caja || !caja.apertura) { const e = new Error("Primero abre la caja."); e.abrirCaja = true; throw e; }
  if (cajaEstado(caja) === "cerrada") throw new Error("La caja de hoy está cerrada. El administrador puede reabrirla.");
  for (const c of S.cart) { const p = prod(c.pid); if (!p || p.activo === false) throw new Error(c.n + " ya no está disponible."); }
  const falta = faltante(S.cart); if (falta) throw new Error("No alcanza el inventario de " + falta.p.nombre + " (hay " + falta.st + ").");
  const sub = totalCarrito(), desc = clamp(Math.round(opts.desc || 0), 0, sub), total = sub - desc, seq = await nextSeq();
  let resto = desc;   // el descuento se reparte por línea y la suma cuadra exacto con el total
  const items = S.cart.map((c, k) => { const p = prod(c.pid), bruto = c.p * c.q, d = k === S.cart.length - 1 ? resto : Math.round(sub ? desc * bruto / sub : 0); resto -= d; const i = impLinea(p, bruto - d); return {pid: c.pid, n: c.n, q: c.q, p: c.p, d, imp: {t: i.t, r: i.r, base: i.base, v: i.imp}}; });
  const t = Date.now(), fecha = ymd(new Date(t));
  const venta = {id: DEV.id + "-" + t.toString(36) + "-" + seq, n: seq, num: (DEV.nombre || DEV.id) + " #" + seq, t, fecha, uid: uidActual(), dev: DEV.id, m: opts.m, total, sub, desc, recibido: opts.m === "Efectivo" ? (opts.recibido || total) : total, cambio: opts.m === "Efectivo" ? Math.max(0, (opts.recibido || total) - total) : 0, ref: opts.ref || "", cliente: opts.cliente || null, estado: "confirmada"};
  venta.items = items;
  await appendTo("ventas", cajaId(fecha), "ventas", venta, {fecha, dev: DEV.id, uid: uidActual(), devNombre: DEV.nombre});
  if (desc > 0) audit("DESCUENTO", venta.id, fmt(desc) + " sobre " + fmt(sub));
  return venta;
}
async function anularVenta(v, motivo) {
  const caja = cajaDe(v.fecha, v.dev);
  if (caja && cajaEstado(caja) === "cerrada") throw new Error("Esta venta es de una caja ya cerrada. Si devolviste el dinero, regístralo en Caja como “Sacar dinero”.");
  const propio = v.uid === uidActual() && v.dev === DEV.id && Date.now() - v.t < 10 * 60000 && caja && cajaEstado(caja) === "abierta";
  if (!esAdmin() && !propio) throw Object.assign(new Error("denied"), {code: "denied"});
  const id = cajaId(v.fecha, DEV.id), cur = col("anulaciones")[id] || {fecha: v.fecha, dev: DEV.id, items: []};
  await put("anulaciones", id, Object.assign({}, cur, {items: cur.items.concat([{id: newId(), ventaId: v.id, t: Date.now(), uid: uidActual(), motivo: motivo || "", total: v.total}])}));
  audit("ANULACION", v.id, (motivo || "sin motivo") + " · " + fmt(v.total));
}
async function confirmarPago(v) { const id = cajaId(v.fecha, DEV.id), cur = col("confirmaciones")[id] || {fecha: v.fecha, dev: DEV.id, items: []}; await put("confirmaciones", id, Object.assign({}, cur, {items: cur.items.concat([{id: newId(), ventaId: v.id, t: Date.now(), uid: uidActual()}])})); }

/* ---------- caja ---------- */
async function abrirCaja(monto) {
  const f = S.today, id = cajaId(f), cur = col("cajas")[id];
  const vieja = cajasAll().find(x => x.dev === DEV.id && x.fecha < f && x.apertura && cajaEstado(x) === "abierta"); if (vieja) throw new Error("Primero cierra la caja del " + diaCorto(vieja.fecha) + ".");
  if (cur && cur.apertura && cajaEstado(Object.assign({id}, cur)) !== "cerrada") throw new Error("La caja ya está abierta.");
  await put("cajas", id, Object.assign({fecha: f, dev: DEV.id, devNombre: DEV.nombre, movs: [], cierres: []}, cur || {}, {apertura: {id: newId(), t: Date.now(), monto: Math.max(0, monto), uid: uidActual()}}));
  audit("APERTURA_CAJA", id, fmt(monto));
}
async function movimientoCaja(tipo, monto, motivo, cat) {
  const c = cajaHoy(); if (!c || cajaEstado(c) !== "abierta") throw new Error("La caja debe estar abierta.");
  if (!esAdmin() && (col("meta").permisos || {}).movimientosEmpleado === false) throw new Error("Pídele al administrador que haga este movimiento.");
  if (!(monto > 0)) throw new Error("Escribe un valor.");
  if (!motivo || !motivo.trim()) throw new Error("Escribe el motivo.");
  await put("cajas", c.id, Object.assign({}, col("cajas")[c.id], {movs: (c.movs || []).concat([{id: newId(), t: Date.now(), tipo, monto, motivo: motivo.trim(), cat: cat || "", uid: uidActual()}])}));
  audit("CAJA_" + tipo.toUpperCase(), c.id, fmt(monto) + " · " + motivo);
}
async function cerrarCaja(contado, obs, caja) {
  const c = caja || cajaHoy(); if (!c || cajaEstado(c) !== "abierta") throw new Error("No hay una caja abierta para cerrar.");
  const k = cajaCalc(c), dif = contado - k.esperado;
  if (dif !== 0 && !(obs || "").trim()) throw new Error("Hay diferencia: escribe una observación.");
  const ci = {id: newId(), t: Date.now(), uid: uidActual(), esperado: k.esperado, contado, dif, obs: (obs || "").trim(), resumen: {ventas: k.ventas, n: k.n, por: k.por, apertura: k.apertura, ingresos: k.ingresos, retiros: k.retiros, gastos: k.gastos}};
  await put("cajas", c.id, Object.assign({}, col("cajas")[c.id], {cierres: (c.cierres || []).concat([ci])}));
  audit("CIERRE_CAJA", c.id, "Esperado " + fmt(k.esperado) + " · contado " + fmt(contado) + " · dif " + fmt(dif));
  return ci;
}
async function reabrirCaja(c) {
  exigirAdmin(); const id = "r_" + c.fecha + "_" + DEV.id, cur = col("reaperturas")[id] || {fecha: c.fecha, dev: DEV.id, items: []};
  const ult = (c.cierres || []).slice(-1)[0];   // se guarda QUÉ cierre se reabre: no depende de los relojes de cada equipo
  await put("reaperturas", id, Object.assign({}, cur, {items: cur.items.concat([{id: newId(), caja: c.id, cierre: ult ? ult.id : null, t: Date.now(), uid: uidActual()}])})); audit("REABRIR_CAJA", c.id, "");
}
async function toggleChecklist(grupo, k) {
  const id = cajaId(S.today), cur = col("checklists")[id] || {fecha: S.today, dev: DEV.id, apertura: {}, cierre: {}}, g = Object.assign({}, cur[grupo]);
  if (g[k]) delete g[k]; else g[k] = Date.now(); await put("checklists", id, Object.assign({}, cur, {[grupo]: g}));
}

/* ---------- inventario ---------- */
async function registrarMerma(pid, q, motivo, obs) {
  if (!(q > 0)) throw new Error("Escribe la cantidad."); const f = S.today, id = cajaId(f), cur = col("mermas")[id] || {fecha: f, dev: DEV.id, items: []};
  await put("mermas", id, Object.assign({}, cur, {items: cur.items.concat([{id: newId(), t: Date.now(), pid, q, motivo, obs: obs || "", uid: uidActual()}])}));
  audit("MERMA", pid, q + " · " + motivo);
}
/* movimientos de inventario (kardex): cada cambio de existencias deja registro con antes y después */
async function movInv(items) {
  if (!items.length) return; const f = S.today, id = cajaId(f), cur = col("movinv")[id] || {fecha: f, dev: DEV.id, items: []};
  await put("movinv", id, Object.assign({}, cur, {items: cur.items.concat(items.map(x => Object.assign({id: newId(), t: Date.now(), uid: uidActual()}, x)))}));
}
async function fijarStock(pid, nuevo, mov) {
  const antes = stockDe(pid); await put("stock", pid, {base: nuevo, t: Date.now()});
  await movInv([Object.assign({pid, antes: antes == null ? null : antes, despues: nuevo, q: antes == null ? nuevo : nuevo - antes}, mov)]);
  return antes;
}
// entradas, compras, producción y consumo: movimiento con signo. NO reescribe la base del inventario, así nunca se
// pierden ventas de otros equipos que aún no sincronizan. Si el producto nunca se contó, la primera entrada fija la base.
async function sumarStock(pid, q, mov) {
  const antes = stockDe(pid); if (antes == null) return fijarStock(pid, Math.max(0, q), mov);
  await movInv([Object.assign({pid, delta: true, q, antes, despues: Math.round((antes + q) * 1000) / 1000}, mov)]);
  return antes;
}
// el historial de ventas en el equipo cubre ~95 días: si un inventario no se cuenta en 80 días, se hace un corte automático (sin cambiar la cantidad)
async function rebaseStockViejo() {
  if (!esAdmin() || DS.mode !== "db" || !DS.remoteSeen) return; const lim = Date.now() - 80 * 864e5;
  for (const [pid, s0] of Object.entries(stockDocs())) { const p = prod(pid), st = stockDe(pid); if (!p || p.controla === false || p.combo || st == null || !s0 || (s0.t || 0) > lim || OUT[pathOf("stock", pid)]) continue;
    await fijarStock(pid, st, {tipo: "rebase", motivo: "Corte automático del inventario"}).catch(() => {}); }
}
async function contarStock(pid, cantidad, motivo) {
  exigirAdmin(); const p = prod(pid), antes = await fijarStock(pid, cantidad, {tipo: "conteo", motivo: motivo || "Conteo"});
  audit("AJUSTE_INVENTARIO", pid, (p ? p.nombre : pid) + ": " + (antes == null ? "sin contar" : antes) + " → " + cantidad + (motivo ? " · " + motivo : ""));
}
async function entradaStock(pid, q, o = {}) {
  exigirAdmin(); if (!(q > 0)) throw new Error("Escribe cuántas llegaron."); const st = stockDe(pid), p = prod(pid);
  await sumarStock(pid, q, {tipo: "entrada", motivo: o.motivo || "Llegó mercancía", ref: o.proveedor || ""});
  if (o.costo > 0 && (costos()[pid] || {}).costo !== o.costo) await fijarCosto(pid, o.costo, "entrada de mercancía");
  audit("ENTRADA_INVENTARIO", pid, (p ? p.nombre : pid) + ": +" + q + (o.proveedor ? " · " + o.proveedor : ""));
}
async function fijarCosto(pid, costo, motivo) {
  exigirAdmin(); const cur = costos()[pid] || {hist: []}, h = (cur.hist || []).slice();
  if (cur.costo === costo) return; h.push({t: Date.now(), c: costo}); await put("costos", pid, {costo, hist: h.slice(-40)});
  audit("CAMBIO_COSTO", pid, (cur.costo == null ? "sin costo" : fmt(cur.costo)) + " → " + fmt(costo) + (motivo ? " · " + motivo : ""));
}

/* ---------- productos ---------- */
async function guardarProducto(id, d, costo) {
  exigirAdmin(); const ant = id ? prod(id) : null; id = id || "p" + newId(); const nuevo = Object.assign({}, ant ? deepClone(col("productos")[id]) : {orden: prods().length + 1}, d);
  delete nuevo.id; await put("productos", id, nuevo);
  if (!ant) audit("PRODUCTO_CREADO", id, nuevo.nombre); else if (ant.precio !== nuevo.precio) audit("CAMBIO_PRECIO", id, ant.nombre + ": " + fmt(ant.precio) + " → " + fmt(nuevo.precio));
  else if ((ant.activo !== false) !== (nuevo.activo !== false)) audit(nuevo.activo === false ? "PRODUCTO_DESACTIVADO" : "PRODUCTO_REACTIVADO", id, ant.nombre);
  else audit("PRODUCTO_EDITADO", id, nuevo.nombre);
  if (costo !== undefined && costo !== null && costo !== "") await fijarCosto(id, costo);
  return id;
}
async function guardarReceta(pid, lineas, rinde) { exigirAdmin(); await put("recetas", pid, {lineas, rinde: rinde || 1}); audit("RECETA", pid, lineas.length + " ingredientes"); }
async function producir(pid, q) {
  exigirAdmin(); if (!(q > 0)) throw new Error("Escribe la cantidad."); const r = col("recetas")[pid], p = prod(pid), st = stockDe(pid);
  await sumarStock(pid, q, {tipo: "produccion", motivo: "Producción"});
  if (r) for (const l of r.lineas) { const s = stockDe(l.iid); if (s != null) await sumarStock(l.iid, -Math.round(l.q * q / (r.rinde || 1) * 1000) / 1000, {tipo: "consumo", motivo: "Producción de " + q + " " + p.nombre}); }
  audit("PRODUCCION", pid, q + " de " + p.nombre);
}

/* ---------- gastos, compras, terceros ---------- */
async function guardarGasto(g) { exigirAdmin(); const id = g.id || "g" + newId(); await put("gastos", id, Object.assign({estado: "registrado", uid: uidActual(), t: Date.now()}, g, {id: undefined})); audit("GASTO", id, g.cat + " · " + fmt(g.valor)); return id; }
async function borrarGasto(id) { exigirAdmin(); await remove("gastos", id); audit("GASTO_BORRADO", id, ""); }
async function guardarTercero(id, d) { exigirAdmin(); id = id || "t" + newId(); await put("terceros", id, Object.assign({}, col("terceros")[id] || {}, d)); audit("TERCERO", id, d.nombre); return id; }
async function crearCompra(c) { exigirAdmin(); const id = "c" + newId(); await put("compras", id, Object.assign({estado: "pedido", fecha: S.today, t: Date.now(), uid: uidActual()}, c)); audit("COMPRA_PEDIDO", id, (c.lineas || []).length + " líneas"); return id; }
async function actualizarCompra(id, patch) { exigirAdmin(); await put("compras", id, Object.assign({}, col("compras")[id], patch)); }
async function recibirCompra(id, lineas, datos) {
  exigirAdmin(); const c = col("compras")[id]; if (!c) throw new Error("No existe la compra.");
  for (const l of lineas) { if (!(l.q > 0)) continue; await sumarStock(l.pid, l.q, {tipo: "compra", motivo: "Compra recibida", compra: id, ref: (c.proveedor || "") + (datos && datos.factura ? " · " + datos.factura : "")}); if (l.costo != null && l.costo > 0) { const unit = l.costo; if ((costos()[l.pid] || {}).costo !== unit) await fijarCosto(l.pid, unit, "compra " + id); } }
  await put("compras", id, Object.assign({}, c, datos || {}, {lineas, estado: "recibido", recT: Date.now(), recFecha: S.today}));
  audit("COMPRA_RECIBIDA", id, fmt(sum(lineas, l => (l.costo || 0) * (l.q || 0))));
}
async function guardarConfig(patch) { exigirAdmin(); const cur = configNeg(); await put("config", "negocio", Object.assign({}, cur, patch)); audit("CONFIG", "negocio", Object.keys(patch).join(",")); }
