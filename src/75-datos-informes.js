/* ============ 75 · datos para informes, contabilidad e integridad ============
   Toda cifra sale de los mismos registros (ventas, compras, caja, gastos, mermas). Así los totales cuadran entre pantallas, Excel y PDF. */
S.filtros = {cat: "", pid: "", uid: "", m: "", dev: ""};
const devNombre = dev => (col("dispositivos")[dev] || {}).nombre || ((cajasAll().find(c => c.dev === dev) || {}).devNombre) || dev || "";
const empNombre = uid => nombreDe(uid) || (DEMO_PERSONAS[uid] || "") || (uid ? "Usuario " + String(uid).slice(-4) : "");
function pasaF(v, it, F) { F = F || S.filtros; if (F.uid && v.uid !== F.uid) return false; if (F.m && v.m !== F.m) return false; if (F.dev && v.dev !== F.dev) return false; if (it) { if (F.pid && it.pid !== F.pid) return false; if (F.cat && ((prod(it.pid) || {}).cat || "") !== F.cat) return false; } return true; }
const lineaNeta = it => it.p * it.q - (it.d || 0);
function filasVentas(a, b, F) {
  const out = [];
  for (const v of ventasAll()) if (v.fecha >= a && v.fecha <= b && pasaF(v, null, F)) for (const it of (v.items || [])) {
    if (!pasaF(v, it, F)) continue; const neto = lineaNeta(it), iv = (it.imp && it.imp.v) || 0, p = prod(it.pid);
    out.push({id: v.id, num: v.num || "", fecha: v.fecha, hora: hora(v.t), t: v.t, caja: devNombre(v.dev), empleado: empNombre(v.uid), producto: it.n, pid: it.pid, categoria: (p && p.cat) || "", cantidad: it.q, precio: it.p, descuento: it.d || 0,
      subtotal: neto - iv, impuesto: iv, impTipo: (it.imp && it.imp.t) || "validar", impTarifa: (it.imp && it.imp.r) || 0, total: neto, metodo: v.m, cliente: v.cliente ? "Pidió factura" : "", estado: v.anulada ? "Anulada" : "Confirmada", sync: ventaSyncTxt(ventaSync(v))});
  }
  return out.sort((x, y) => x.t - y.t);
}
function stockFinalEn(pid, b) {    // inventario al final del periodo = actual + lo que salió después − lo que entró después
  const st = stockDe(pid); if (st == null) return null; if (b >= S.today) return st;
  let s = st; for (const v of ventasOk()) if (v.fecha > b) for (const l of lineasExp(v)) if (l.pid === pid) s += l.q;
  for (const m of mermasAll()) if (m.fecha > b && m.pid === pid) s += m.q;
  for (const c of Object.values(col("compras"))) if (c.estado === "recibido" && (c.recFecha || c.fecha) > b) for (const l of (c.lineas || [])) if (l.pid === pid) s -= l.q || 0;
  return s;
}
function ajustesInventario(a, b) {
  return auditList().filter(x => x.a === "AJUSTE_INVENTARIO" && ymd(new Date(x.t)) >= a && ymd(new Date(x.t)) <= b).map(x => { const m = /(-?\d+(?:[.,]\d+)?)\s*→\s*(-?\d+(?:[.,]\d+)?)/.exec(x.d || ""), d = m ? numDec(m[2]) - numDec(m[1]) : 0; return {pid: x.r, t: x.t, delta: d, u: x.u, d: x.d}; });
}
function filasInventario(a, b) {
  const aj = ajustesInventario(a, b), out = [];
  for (const p of prods().filter(x => x.controla !== false && !x.combo)) {
    const fin = stockFinalEn(p.id, b); let ven = 0, mer = 0, ent = 0;
    for (const v of ventasEn(a, b)) for (const l of lineasExp(v)) if (l.pid === p.id) ven += l.q;
    for (const m of mermasAll()) if (m.fecha >= a && m.fecha <= b && m.pid === p.id) mer += m.q;
    for (const c of Object.values(col("compras"))) if (c.estado === "recibido" && (c.recFecha || c.fecha) >= a && (c.recFecha || c.fecha) <= b) for (const l of (c.lineas || [])) if (l.pid === p.id) ent += l.q || 0;
    const ajs = sum(aj.filter(x => x.pid === p.id), x => x.delta), ini = fin == null ? null : fin - ent + ven + mer - ajs, e = estadoProd(p), c = costoActual(p.id), cov = cobertura(p.id), ag = agotaEn(p.id);
    const estado = e.k === "agotado" ? "AGOTADO" : e.k === "bajo" ? "BAJO" : ag && ag.dias <= 3 ? "RIESGO" : e.k === "sin" ? "SIN CONTAR" : "NORMAL";
    out.push({producto: p.nombre, sku: p.id, categoria: p.cat || "", tipo: p.tipo === "insumo" ? "Insumo" : "Producto terminado", unidad: p.unidad || "und", inicial: ini, entradas: ent, salidas: ven + mer, ventas: ven, mermas: mer, ajustes: ajs, final: fin, costo: c, minimo: p.min || 0, seguridad: p.seg || 0, cobertura: cov == null || cov === Infinity ? null : Math.round(cov * 10) / 10, estado});
  }
  return out;
}
function proveedorDe(pid) { const cs = Object.values(col("compras")).filter(c => (c.lineas || []).some(l => l.pid === pid) && c.proveedor).sort((x, y) => (y.t || 0) - (x.t || 0)); return cs[0] ? cs[0].proveedor : ""; }
function filasCompras(a, b) {
  const out = [];
  for (const [id, c] of Object.entries(col("compras"))) { if (c.fecha < a || c.fecha > b) continue; const tot = sum(c.lineas || [], l => (l.costo || 0) * (l.q || 0));
    for (const l of (c.lineas || [])) { const val = (l.costo || 0) * (l.q || 0), iva = tot ? Math.round((c.iva || 0) * val / tot) : 0, p = prod(l.pid);
      out.push({id, proveedor: c.proveedor || "", nit: c.nit || "", fecha: c.fecha, factura: c.factura || "", producto: (p && p.nombre) || l.n || "", unidad: (p && p.unidad) || "und", cantidad: l.q || 0, costo: l.costo || 0, iva, total: val + iva, estado: c.estado === "recibido" ? "Recibida" : c.estado === "cancelado" ? "Cancelada" : "Pendiente", recibido: c.estado === "recibido" ? l.q || 0 : 0, pendiente: c.estado === "pedido" ? l.q || 0 : 0, soporte: (c.soporte && c.soporte.ref) || "", tipoSoporte: (c.soporte && c.soporte.tipo) || ""}); } }
  return out.sort((x, y) => x.fecha.localeCompare(y.fecha));
}
function filasRecomendacion() {
  return recomendarCompra(fechasHorizonte("7")).filter(r => r.comprar > 0).map(r => ({producto: r.p.nombre, inventario: r.st == null ? null : Math.max(0, r.st), consumo: r.avg == null ? null : Math.round(r.avg * 10) / 10, demanda: r.dem == null ? null : Math.round(r.dem), seguridad: r.seg, cantidad: r.comprar, proveedor: proveedorDe(r.pid), costo: costoActual(r.pid), costoTotal: costoActual(r.pid) == null ? null : costoActual(r.pid) * r.comprar, fecha: r.ag ? r.ag.fecha : S.today, motivo: r.riesgo === "bad" ? "Se agota pronto" : r.riesgo === "warn" ? "Inventario ajustado para la demanda" : "Reposición normal"}));
}
function filasCajas(a, b) {
  return cajasAll().filter(c => c.fecha >= a && c.fecha <= b && c.apertura).sort((x, y) => (x.fecha + x.dev).localeCompare(y.fecha + y.dev)).map(c => { const k = cajaCalc(c), ci = (c.cierres || []).slice(-1)[0];
    return {fecha: c.fecha, caja: devNombre(c.dev), empleado: empNombre(c.apertura.uid), apertura: k.apertura, efectivo: k.efectivo, digitales: k.ventas - k.efectivo, ingresos: k.ingresos, retiros: k.retiros, gastos: k.gastos, esperado: k.esperado, contado: ci ? ci.contado : null, diferencia: ci ? ci.contado - k.esperado : null, hAp: hora(c.apertura.t), hCi: ci ? hora(ci.t) : "", estado: cajaEstado(c) === "cerrada" ? "Cerrada" : "Abierta", obs: ci ? ci.obs || "" : "", id: c.id}; });
}
function filasMovCaja(a, b) { const out = []; for (const c of cajasAll()) if (c.fecha >= a && c.fecha <= b) for (const m of (c.movs || [])) out.push({fecha: c.fecha, hora: hora(m.t), caja: devNombre(c.dev), tipo: m.tipo === "retiro" ? "Salida de dinero" : m.tipo === "ingreso" ? "Entrada de dinero" : "Pago desde caja", valor: m.monto, motivo: m.motivo, usuario: empNombre(m.uid), soporte: ""}); return out; }
function filasGastos(a, b) { return gastosEn(a, b).map(g => ({fecha: g.fecha, proveedor: g.proveedor || "", categoria: g.cat || "", descripcion: g.desc || "", base: g.base || (g.iva ? g.valor - g.iva : g.valor), iva: g.iva || 0, retencion: g.retencion || 0, total: g.valor, metodo: g.m || "", cuenta: g.origen === "caja" || g.m === "Efectivo" ? "Caja" : "Banco", usuario: empNombre(g.uid), soporte: (g.soporte && g.soporte.ref) || "", estado: g.origen === "caja" ? "Desde caja" : (g.estado || "Registrado")})).sort((x, y) => x.fecha.localeCompare(y.fecha)); }
function filasMermas(a, b) { return mermasAll().filter(m => m.fecha >= a && m.fecha <= b).map(m => { const p = prod(m.pid), c = costoUnit(m.pid, m.t); return {producto: (p && p.nombre) || m.pid, fecha: m.fecha, cantidad: m.q, unidad: (p && p.unidad) || "und", costo: c, total: c == null ? null : c * m.q, motivo: m.motivo, empleado: empNombre(m.uid), obs: m.obs || ""}; }); }
function filasRentabilidad(a, b) {
  const desc = {}, mer = {}; for (const r of filasVentas(a, b, {})) if (r.estado === "Confirmada") desc[r.pid] = (desc[r.pid] || 0) + r.descuento;
  for (const m of filasMermas(a, b)) { const p = prods().find(x => x.nombre === m.producto); if (p) mer[p.id] = (mer[p.id] || 0) + (m.total || 0); }
  return rentabilidad(a, b).map(r => ({producto: r.n, pid: r.pid, unidades: r.uds, ventas: r.ing - (desc[r.pid] || 0), costo: r.sinCosto ? null : r.costo, descuentos: desc[r.pid] || 0, merma: mer[r.pid] || 0}));
}
function filasClientes(a, b) {
  const m = {}; for (const v of ventasOk()) if (v.fecha >= a && v.fecha <= b && v.cliente && v.cliente.doc) { const k = v.cliente.doc, o = m[k] = m[k] || {doc: k, nombre: v.cliente.nombre || "", correo: v.cliente.correo || "", ult: "", n: 0, total: 0, prods: {}}; o.n++; o.total += v.total; if (v.fecha > o.ult) o.ult = v.fecha; for (const it of (v.items || [])) o.prods[it.n] = (o.prods[it.n] || 0) + it.q; }
  const cada = configNeg().puntosCada || 0;
  return Object.values(m).map(o => ({cliente: o.doc, nombre: o.nombre, correo: o.correo, ultima: o.ult, compras: o.n, total: o.total, ticket: o.n ? o.total / o.n : 0, favorito: Object.entries(o.prods).sort((x, y) => y[1] - x[1])[0][0], puntos: cada ? Math.floor(o.total / cada) : null, estado: "Activo"}));
}
function filasAnulaciones(a, b) { const out = []; for (const d of Object.values(col("anulaciones"))) for (const x of (d.items || [])) { const f = ymd(new Date(x.t)); if (f < a || f > b) continue; const v = ventasAll().find(y => y.id === x.ventaId); out.push({fecha: f, hora: hora(x.t), venta: v ? v.num : x.ventaId, total: x.total || (v ? v.total : 0), motivo: x.motivo || "", usuario: empNombre(x.uid)}); } return out; }
function filasAuditoria(a, b) { return auditList().filter(x => { const f = ymd(new Date(x.t)); return f >= a && f <= b; }).map(x => ({fecha: ymd(new Date(x.t)), hora: hora(x.t), accion: audTxt(x.a), codigo: x.a, registro: x.r, detalle: x.d, usuario: empNombre(x.u), equipo: devNombre(x.dev)})); }
function filasTerceros(a, b) {
  const m = {}; const add = (nombre, nit, tipo, valor, iva, ret) => { const k = (nit || nombre || "").trim(); if (!k) return; const o = m[k] = m[k] || {nombre: nombre || "", nit: nit || "", tipo, compras: 0, iva: 0, retencion: 0, registros: 0, completo: !!(nit && nombre)}; o.compras += valor; o.iva += iva || 0; o.retencion += ret || 0; o.registros++; };
  for (const t of Object.values(col("terceros"))) add(t.nombre, t.nit, t.tipo || "proveedor", 0, 0, 0);
  for (const c of filasCompras(a, b)) if (c.estado === "Recibida") add(c.proveedor, c.nit || (Object.values(col("terceros")).find(t => t.nombre === c.proveedor) || {}).nit, "proveedor", c.total - c.iva, c.iva, 0);
  for (const g of filasGastos(a, b)) if (g.proveedor) add(g.proveedor, (Object.values(col("terceros")).find(t => t.nombre === g.proveedor) || {}).nit, "proveedor", g.base, g.iva, g.retencion);
  return Object.values(m).map(o => Object.assign(o, {completo: !!(o.nit && o.nombre)}));
}
function resumenImpuestos(a, b) {
  const ventas = {}; for (const r of filasVentas(a, b, {})) if (r.estado === "Confirmada") { const k = r.impTipo + "|" + r.impTarifa, o = ventas[k] = ventas[k] || {tipo: r.impTipo, tarifa: r.impTarifa, base: 0, impuesto: 0, total: 0}; o.base += r.subtotal; o.impuesto += r.impuesto; o.total += r.total; }
  const compras = filasCompras(a, b).filter(c => c.estado === "Recibida"), gastos = filasGastos(a, b);
  return {ventas: Object.values(ventas), ivaCompras: sum(compras, c => c.iva), ivaGastos: sum(gastos, g => g.iva), retenciones: sum(gastos, g => g.retencion), porValidar: Object.values(ventas).filter(x => x.tipo === "validar").reduce((s, x) => s + x.total, 0)};
}
const TIPO_IMP = {validar: "Por validar", iva: "IVA", exento: "Exento", excluido: "Excluido", no_gravado: "No gravado", inc: "Impuesto al consumo", otro: "Otro"};

/* ---------- control de integridad ---------- */
function integridad(a, b) {
  const out = [], add = (sev, t, n, d) => { if (n) out.push({sev, t, n, d}); }, vs = ventasAll().filter(v => v.fecha >= a && v.fecha <= b);
  add("bad", "Ventas sin detalle", vs.filter(v => !(v.items || []).length).length, "Ventas sin productos.");
  const ids = {}; vs.forEach(v => ids[v.id] = (ids[v.id] || 0) + 1); add("bad", "Ventas duplicadas", Object.values(ids).filter(n => n > 1).length, "El mismo identificador aparece más de una vez.");
  add("bad", "Ventas con total inconsistente", vs.filter(v => Math.abs(v.total - sum(v.items || [], lineaNeta)) > 1).length, "El total no coincide con la suma de sus productos.");
  add("bad", "Inventario negativo", Object.values(stockMap()).filter(s => s != null && s < 0).length, "Haz un conteo de esos productos.");
  add("warn", "Cierres sin apertura", cajasAll().filter(c => c.fecha >= a && c.fecha <= b && (c.cierres || []).length && !c.apertura).length, "");
  add("warn", "Cajas sin cerrar", cajasAll().filter(c => c.fecha >= a && c.fecha <= b && c.fecha < S.today && c.apertura && cajaEstado(c) !== "cerrada").length, "Cajas de días anteriores que siguen abiertas.");
  add("warn", "Movimientos sin usuario", cajasAll().filter(c => c.fecha >= a && c.fecha <= b).reduce((s, c) => s + (c.movs || []).filter(m => !m.uid).length, 0) + mermasAll().filter(m => m.fecha >= a && m.fecha <= b && !m.uid).length, "");
  const cr = Object.values(col("compras")).filter(c => c.estado === "recibido" && c.fecha >= a && c.fecha <= b);
  add("warn", "Compras sin proveedor", cr.filter(c => !c.proveedor).length, "");
  add("warn", "Compras sin soporte", cr.filter(c => !(c.soporte && c.soporte.ref)).length, "Falta la factura o documento soporte.");
  const gs = Object.values(col("gastos")).filter(g => g.fecha >= a && g.fecha <= b);
  add("warn", "Gastos sin categoría", gs.filter(g => !g.cat).length, ""); add("warn", "Gastos sin soporte", gs.filter(g => !(g.soporte && g.soporte.ref)).length, "Falta el recibo o factura.");
  add("warn", "Ventas pendientes de enviar (este equipo)", ventasPendientes(), "Se envían solas cuando hay Internet.");
  add("warn", "Ventas pendientes en otros equipos", sum(dispositivosEstado().filter(d => !d.mine), d => d.ventasPend || 0), "Según su última conexión.");
  add("warn", "Cambios sin sincronizar", pendientes().length, ""); add("bad", "Operaciones rechazadas por el servidor", rechazadas().length, "");
  add("warn", "Productos vendidos sin impuesto validado", uniq(filasVentas(a, b, {}).filter(r => r.impTipo === "validar").map(r => r.pid)).length, "Configura el tratamiento tributario con tu contador.");
  return out;
}
function informacionPendiente(a, b) {
  const out = [], cr = Object.values(col("compras")).filter(c => c.estado === "recibido" && c.fecha >= a && c.fecha <= b);
  const n1 = cr.filter(c => !(c.soporte && c.soporte.ref)).length; if (n1) out.push(n1 + (n1 === 1 ? " compra sin soporte tributario" : " compras sin soporte tributario"));
  const n2 = filasTerceros(a, b).filter(t => !t.completo).length; if (n2) out.push(n2 + (n2 === 1 ? " proveedor sin identificación completa" : " proveedores sin identificación completa"));
  const n3 = filasMovCaja(a, b).filter(m => m.tipo === "Pago desde caja").length; if (n3) out.push(n3 + (n3 === 1 ? " pago desde caja sin soporte" : " pagos desde caja sin soporte"));
  const n4 = pendientes().length; if (n4) out.push(n4 + " documentos pendientes de sincronización");
  const n5 = uniq(filasVentas(a, b, {}).filter(r => r.impTipo === "validar").map(r => r.pid)).length; if (n5) out.push(n5 + " productos sin tratamiento tributario validado");
  const n6 = ventasOk().filter(v => v.fecha >= a && v.fecha <= b && v.cliente).length; if (n6) out.push(n6 + " ventas en las que el cliente pidió factura (revisar emisión)");
  return out;
}
function conciliacion(a, b) {
  const f = finanzas(a, b), de = Object.values(col("docelec")).filter(d => d.fecha >= a && d.fecha <= b && d.estado === "aceptado"), feCfg = !!(configNeg().tributario && configNeg().tributario.proveedorFE);
  const cajas = filasCajas(a, b).filter(c => c.contado != null), cr = filasCompras(a, b).filter(c => c.estado === "Recibida"), crSop = cr.filter(c => c.soporte);
  const inv = filasInventario(a, b), valIni = sum(inv, r => (r.inicial || 0) * (r.costo || 0)), valFin = sum(inv, r => (r.final || 0) * (r.costo || 0)), compras = sum(cr, c => c.total - c.iva), merma = sum(filasMermas(a, b), m => m.total || 0), cvTeo = valIni + compras - valFin - merma;
  const dig = ventasOk().filter(v => v.fecha >= a && v.fecha <= b && esDigital(v.m)), digConf = sum(dig.filter(v => !v.pend), v => v.total), digTot = sum(dig, v => v.total);
  const row = (n, x, nx, y, ny, tol, nota) => ({n, x, nx, y, ny, dif: y == null ? null : x - y, ok: y != null && Math.abs(x - y) <= tol, nota});
  return [
    feCfg ? row("Ventas OLI vs documentos electrónicos", f.ventas, "Ventas OLI", sum(de, d => d.total || 0), "Documentos aceptados", 1, "") : {n: "Ventas OLI vs documentos electrónicos", x: f.ventas, nx: "Ventas OLI", y: null, ny: "Documentos electrónicos", dif: null, ok: false, nota: "No hay proveedor de facturación electrónica conectado. Requiere contador."},
    row("Caja OLI vs caja declarada", sum(cajas, c => c.esperado), "Efectivo esperado", sum(cajas, c => c.contado), "Efectivo contado", 0, ""),
    row("Compras vs soportes", sum(cr, c => c.total), "Compras registradas", sum(crSop, c => c.total), "Con soporte", 0, ""),
    row("Inventario vs costo de ventas", f.cogs, "Costo de ventas (OLI)", Math.round(cvTeo), "Inventario inicial + compras − final − mermas", Math.max(1000, f.cogs * 0.05), "Estimación con costos actuales; diferencias menores al 5% son normales."),
    row("Pagos digitales vs confirmados", digTot, "Ventas digitales", digConf, "Pagos confirmados", 0, "")
  ];
}
function riesgosAuditoria(a, b) {
  const out = [], R = {ANULACION: "Medio", DESCUENTO: "Bajo", CAMBIO_PRECIO: "Medio", CAMBIO_COSTO: "Medio", AJUSTE_INVENTARIO: "Medio", GASTO_BORRADO: "Alto", REABRIR_CAJA: "Medio", SYNC_RECHAZADA: "Alto", CONFLICTO_INVENTARIO: "Alto", PRODUCTO_DESACTIVADO: "Bajo"};
  for (const x of filasAuditoria(a, b)) if (R[x.codigo]) out.push({riesgo: R[x.codigo], tipo: x.accion, accion: x.detalle, usuario: x.usuario, fecha: x.fecha + " " + x.hora, soporte: x.registro});
  for (const c of filasCajas(a, b)) if (c.diferencia) out.push({riesgo: Math.abs(c.diferencia) >= 20000 ? "Alto" : "Medio", tipo: "Diferencia de caja", accion: fmt(c.diferencia) + (c.obs ? " · " + c.obs : ""), usuario: c.empleado, fecha: c.fecha + " " + c.hCi, soporte: c.caja});
  for (const c of filasCompras(a, b)) if (c.estado === "Recibida" && !c.soporte) out.push({riesgo: "Medio", tipo: "Compra sin soporte", accion: c.producto + " · " + fmt(c.total), usuario: "", fecha: c.fecha, soporte: c.proveedor || "sin proveedor"});
  if (pendientes().length) out.push({riesgo: "Medio", tipo: "Sincronización pendiente", accion: pendientes().length + " cambios en este equipo", usuario: "", fecha: S.today, soporte: DEV.nombre});
  const ord = {Alto: 0, Medio: 1, Bajo: 2}; return out.sort((x, y) => ord[x.riesgo] - ord[y.riesgo] || y.fecha.localeCompare(x.fecha));
}
/* ---------- cierre mensual ---------- */
const mesId = f => f.slice(0, 7);
function chequeosCierre(mes) {
  const a = mes + "-01", b = lastOfMonth(a), per = col("periodos")[mes] || {}, man = per.manual || {}, it = integridad(a, b);
  const cajasAb = cajasAll().filter(c => c.fecha >= a && c.fecha <= b && c.apertura && cajaEstado(c) !== "cerrada").length;
  const syncP = pendientes().length + sum(dispositivosEstado().filter(d => !d.mine), d => d.ventasPend || 0);
  const invOk = !Object.values(stockMap()).some(s => s != null && s < 0);
  const comprasViejas = Object.values(col("compras")).filter(c => c.estado === "pedido" && c.fecha <= addDays(S.today, -3)).length;
  const difs = filasCajas(a, b).filter(c => c.diferencia).length;
  return [
    {k: "cajas", t: "Todas las cajas cerradas", ok: cajasAb === 0, auto: true, d: cajasAb ? cajasAb + " cajas abiertas" : ""},
    {k: "sync", t: "Ventas sincronizadas", ok: syncP === 0, auto: true, d: syncP ? syncP + " pendientes" : ""},
    {k: "inv", t: "Inventario conciliado", ok: invOk, auto: true, d: invOk ? "" : "Hay inventario negativo"},
    {k: "compras", t: "Compras registradas", ok: comprasViejas === 0, auto: true, d: comprasViejas ? comprasViejas + " pedidos sin registrar llegada" : ""},
    {k: "gastos", t: "Gastos registrados", ok: !!man.gastos, auto: false},
    {k: "mermas", t: "Mermas registradas", ok: !!man.mermas, auto: false},
    {k: "anul", t: "Anulaciones revisadas", ok: !!man.anul, auto: false, d: filasAnulaciones(a, b).length + " anulaciones"},
    {k: "docs", t: "Documentos electrónicos revisados", ok: !!man.docs, auto: false},
    {k: "difs", t: "Diferencias revisadas", ok: !!man.difs, auto: false, d: difs ? difs + " cierres con diferencia" : ""},
    {k: "paquete", t: "Información para contador generada", ok: !!per.paqueteT, auto: true, d: per.paqueteT ? "Generado " + diaCorto(ymd(new Date(per.paqueteT))) : ""}
  ].map(x => Object.assign(x, {inconsistencias: it.length}));
}
