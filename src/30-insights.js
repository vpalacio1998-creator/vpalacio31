/* ============ 30 · inteligencia de negocio ============
   Todo sale de los datos reales (ventas, inventario, costos, caja). Cada recomendación guarda sus números
   en `why` para poder explicarla. Si no hay datos suficientes, se dice y no se inventa precisión. */
const MIN_DIAS = 14;           // días con ventas necesarios para proyectar
const histVentasDia = () => memo("vpd", () => { const m = {}; for (const v of ventasOk()) { const o = m[v.fecha] = m[v.fecha] || {total: 0, n: 0}; o.total += v.total; o.n++; } return m; });
const diasAbiertos = (a, b) => Object.keys(histVentasDia()).filter(d => d >= a && d <= b).sort();
const histInfo = () => memo("hist", () => { const t = S.today, dias = diasAbiertos(addDays(t, -60), addDays(t, -1)); return {dias, n: dias.length, primero: dias[0] || null, ok: dias.length >= MIN_DIAS}; });
const unidadesDia = () => memo("upd", () => { const m = {}; for (const v of ventasOk()) for (const l of lineasExp(v)) { const o = m[l.pid] = m[l.pid] || {}; o[v.fecha] = (o[v.fecha] || 0) + l.q; } return m; });
const unidadesHoy = pid => (unidadesDia()[pid] || {})[S.today] || 0;
/* unidades VENDIDAS de cada producto por día (un cono es un cono, un combo es un combo): para proyectar plata.
   unidadesDia, en cambio, es lo que sale del inventario (el barquillo y el cucurucho del cono): para comprar. */
const vendidasDia = () => memo("vdia", () => { const m = {}; for (const v of ventasOk()) for (const it of (v.items || [])) { const o = m[it.pid] = m[it.pid] || {}; o[v.fecha] = (o[v.fecha] || 0) + (Number(it.q) || 0); } return m; });

/* ---- factor por día de la semana (a nivel tienda) ---- */
function dowFactors() {
  return memo("dowf", () => {
    const t = S.today, dias = diasAbiertos(addDays(t, -56), addDays(t, -1)).filter(d => !diaEspecial(d)), by = {};   // los festivos no inflan el factor del lunes
    for (const d of dias) (by[dowOf(d)] = by[dowOf(d)] || []).push(histVentasDia()[d].total);
    const all = dias.map(d => histVentasDia()[d].total), avg = all.length ? sum(all) / all.length : 0, span = dias.length ? diffDays(t, dias[0]) : 0, f = {}, ok = {}, n = {};
    for (let k = 0; k < 7; k++) { const arr = by[k] || []; n[k] = arr.length; ok[k] = arr.length >= 3; f[k] = ok[k] && avg ? (sum(arr) / arr.length) / avg : (span >= 28 && !arr.length ? 0 : 1); if (span >= 28 && !arr.length) ok[k] = true; }
    return {f, ok, n, avg, by, dias: dias.length};
  });
}
/* ---- promedio diario y tendencia por producto ---- */
/* promedio diario de los últimos días con ventas, con más peso a los recientes: con pocos días (tienda nueva) el peso se reduce a la
   mitad cada 2 días, para que unos primeros días fuera de lo común (la apertura) no inflen lo que viene; con 14 días o más, cada 5.
   Medido con las ventas reales de la tienda (17 al 23-oct): el promedio simple esperaba bastante más de lo que se vendió; este, menos. */
const vidaMedia = () => histInfo().n < MIN_DIAS ? 2 : 5;
function promPesado(dias, u) { let s = 0, w = 0; const hl = vidaMedia(); dias.forEach((d, i) => { const k = Math.pow(0.5, (dias.length - 1 - i) / hl); s += (u[d] || 0) * k; w += k; }); return w ? s / w : 0; }
function avgDaily(pid, win = 14) { const dias = histInfo().dias.slice(-win); if (dias.length < 3) return null; return promPesado(dias, unidadesDia()[pid] || {}); }
function unidadesVent(pid, n, desfase = 0) { const dias = histInfo().dias; const sl = dias.slice(Math.max(0, dias.length - n - desfase), dias.length - desfase); const u = unidadesDia()[pid] || {}; return {u: sum(sl, d => u[d] || 0), dias: sl.length}; }
function tendencia(pid) { const a = unidadesVent(pid, 7, 0), b = unidadesVent(pid, 7, 7); if (a.dias < 7 || b.dias < 7 || b.u < 5) return null; return a.u / b.u; }
const tendTienda = () => memo("tt", () => { const a = sum(histInfo().dias.slice(-7), d => histVentasDia()[d].total), b = sum(histInfo().dias.slice(-14, -7), d => histVentasDia()[d].total); return histInfo().n >= 14 && b > 0 ? a / b : null; });
/* ---- festivos medidos con tus propias ventas: cuánto vende un festivo frente a los días normales de alrededor ---- */
function factorFestivoMedido() {
  return memo("ffest", () => {
    const h = histVentasDia(), rs = [];
    for (const d of Object.keys(h)) { const e = diaEspecial(d); if (!e || e.tipo === "puente" || d >= S.today) continue;
      const vec = Object.keys(h).filter(x => x !== d && Math.abs(diffDays(x, d)) <= 28 && !diaEspecial(x)); if (vec.length < 7) continue;
      const prom = sum(vec, x => h[x].total) / vec.length; if (prom > 0) rs.push(h[d].total / prom); }
    return rs.length >= 2 ? {f: sum(rs) / rs.length, n: rs.length} : null;
  });
}
/* factor del día: día de la semana (de tus ventas) y, si es festivo, Semana Santa o puente, el colchón para pedir más */
function factorDia(fecha) {
  const df = dowFactors(), w = dowOf(fecha), base = df.f[w] != null ? df.f[w] : 1, e = diaEspecial(fecha);
  if (!e) return {fac: base, esp: null};
  const cc = colchonFestivo();
  if (e.tipo === "puente") return {fac: base * (1 + cc), esp: e, fuente: "fin de semana + " + Math.round(cc * 100) + " %"};
  const fm = factorFestivoMedido(), finde = Math.max(df.f[6] != null ? df.f[6] : 1, df.f[0] != null ? df.f[0] : 1, base);
  return fm ? {fac: fm.f * (1 + cc), esp: e, fuente: "medido en " + fm.n + " festivos + " + Math.round(cc * 100) + " %"} : {fac: finde * (1 + cc), esp: e, fuente: "como tu mejor día de fin de semana + " + Math.round(cc * 100) + " %"};
}
function demandaDia(pid, fecha, parcial) {
  const base = avgDaily(pid); if (base == null) return null;
  const fac = factorDia(fecha).fac, tp = tendencia(pid), tr = clamp(tp != null ? tp : (tendTienda() != null ? tendTienda() : 1), 0.75, 1.35);
  let d = base * fac * tr; if (parcial) d = Math.max(0, d - unidadesHoy(pid)); return d;
}
function demanda(pid, fechas) { let s = 0; for (const f of fechas) { const d = demandaDia(pid, f, f === S.today); if (d == null) return null; s += d; } return s; }
// unidades que se espera VENDER de un producto en esas fechas (para plata). Igual que demanda, pero los conos y combos cuentan como tales.
function demandaVendida(pid, fechas) {
  const p = prod(pid); if (!p || !(p.cono || p.combo)) return demanda(pid, fechas);
  const dias = histInfo().dias.slice(-14); if (dias.length < 3) return null; const u = vendidasDia()[pid] || {}, base = promPesado(dias, u);
  const tr = clamp(tendTienda() != null ? tendTienda() : 1, 0.75, 1.35); let s = 0;
  for (const f of fechas) { let d = base * factorDia(f).fac * tr; if (f === S.today) d = Math.max(0, d - (u[S.today] || 0)); s += d; }
  return s;
}
// costo por unidad para proyectar y simular: el registrado; si el producto no tiene uno propio (conos), el promedio de lo vendido en 30 días
function costoProyeccion(pid) {
  const c = costoActual(pid); if (c != null) return c;
  const r = rentabilidad(addDays(S.today, -29), S.today).find(x => x.pid === pid), n = r ? r.uds - r.sinCosto : 0;
  return n > 0 ? r.costo / n : null;
}
function fechasHorizonte(k) {
  const t = S.today;
  if (k === "hoy") return [t]; if (k === "3") return [t, addDays(t, 1), addDays(t, 2)]; if (k === "7") return Array.from({length: 7}, (_, i) => addDays(t, i));
  if (k === "finde") { let s = dowOf(t); const sab = s === 6 ? t : s === 0 ? addDays(t, 6) : addDays(t, 6 - s); return bloqueFinde(sab); }   // con lunes festivo o Semana Santa, el fin de semana es más largo
  if (k === "custom") { const a = S.desde || t, b = S.hasta || addDays(t, 6), out = []; for (let d = a < t ? t : a; d <= b && out.length < 60; d = addDays(d, 1)) out.push(d); return out.length ? out : [t]; }
  return [t];
}
const HORIZONTES = [["hoy", "Hoy"], ["3", "3 días"], ["7", "Semana"], ["finde", "Fin de semana"], ["custom", "Rango"]];
const comprasPend = () => memo("cpend", () => { const m = {}; for (const c of Object.values(col("compras"))) if (c.estado === "pedido") for (const l of (c.lineas || [])) m[l.pid] = (m[l.pid] || 0) + (l.q || 0); return m; });

/* ---- pedido semanal: productos que solo llegan un día de la semana (p. ej. las paletas: llegan el martes, se piden hasta el lunes a las 12 m.,
   vienen en paquetes de 10). Para esos no sirve pedir "para 3 días": lo que se pide hoy llega el próximo día de llegada y tiene que alcanzar
   hasta el siguiente. A pedir = demanda de esa semana (del día de llegada a la víspera del siguiente) + seguridad − lo que quedará al llegar
   (inventario + lo ya pedido − lo que se venda antes), redondeado a paquetes. Configuración: config.negocio.pedidoSemanal. ---- */
const pedidoSemanalCfg = () => { const c = configNeg().pedidoSemanal; return c && c.activo !== false && Array.isArray(c.cats) && c.cats.length ? c : null; };
const esSemanal = p => { const c = pedidoSemanalCfg(); return !!(c && p && c.cats.includes(p.cat)); };
// la próxima llegada que todavía se alcanza a pedir: {llega, cierre (día límite), lim (ms), sig (la llegada siguiente)}
function proximaLlegada(ahora = Date.now()) {
  const c = pedidoSemanalCfg(); if (!c) return null;
  for (let i = 0; i <= 14; i++) {                                                            // hoy también, si el límite es hoy y todavía no pasó
    const f = addDays(S.today, i); if (dowOf(f) !== Number(c.llega)) continue;
    let dc = f; for (let k = 0; k < 7 && dowOf(dc) !== Number(c.cierreDia); k++) dc = addDays(dc, -1);
    const lim = parse(dc).getTime() + (Number(c.cierreHora) || 0) * 3600000;
    if (ahora < lim) return {llega: f, cierre: dc, lim, sig: addDays(f, 7)};
  }
  return null;
}
const horaTxt = h => { h = Number(h) || 0; return h === 12 ? "12 m." : (h % 12 || 12) + (h < 12 ? " a. m." : " p. m."); };
// lo ya pedido de un producto: lo que llega antes de esa llegada (o sin día) cuenta para los días de antes; lo que llega ese mismo día, para su semana
function pendPorLlegada(pid, llega) { const o = {antes: 0, ese: 0}; for (const c of Object.values(col("compras"))) if (c && c.estado === "pedido" && !(c.llega && c.llega > llega)) for (const l of (c.lineas || [])) if (l.pid === pid) o[c.llega === llega ? "ese" : "antes"] += Number(l.q) || 0; return o; }
function planSemanal(p, st) {
  const L = proximaLlegada(); if (!L) return null; const c = pedidoSemanalCfg(), pp = pendPorLlegada(p.id, L.llega);
  const antes = []; for (let d = S.today; d < L.llega; d = addDays(d, 1)) antes.push(d);
  const semana = Array.from({length: 7}, (_, i) => addDays(L.llega, i)), demAntes = demanda(p.id, antes), demSem = demanda(p.id, semana);
  const pack = (p.pack || 1) > 1 ? p.pack : Math.max(1, Number(c.paquete) || 1);
  const alLlegar = st == null || demAntes == null ? null : st + pp.antes - demAntes;      // negativo: se acaba antes de que llegue el pedido
  const need = demSem == null ? null : demSem + (p.seg || 0) - Math.max(alLlegar == null ? 0 : alLlegar, 0) - pp.ese;
  const comprar = need == null ? null : Math.ceil(Math.max(0, Math.ceil(need - 1e-9)) / pack) * pack;
  return {L, antes, semana, demAntes, demSem, pack, alLlegar, need, comprar, paquetes: comprar == null ? null : comprar / pack, yaPedido: pp.ese};
}

/* cómo viene acertando el cálculo con los productos del pedido semanal: en cada uno de los últimos días con ventas (hasta 7), lo que el
   promedio de ahora habría esperado con los días de antes, contra lo que se vendió. Es una comprobación con las ventas reales, no una promesa. */
function aciertoSemanal() {
  return memo("acierto", () => {
    if (!pedidoSemanalCfg()) return null; const ps = terminados().filter(p => esSemanal(p) && p.controla !== false && !p.combo), dias = histInfo().dias, ud = unidadesDia(), ult = dias.slice(-7);
    let esp = 0, real = 0, n = 0;
    for (const D of ult) { const prev = dias.filter(d => d < D).slice(-14); if (prev.length < 3) continue; n++; for (const p of ps) { const u = ud[p.id] || {}; esp += promPesado(prev, u); real += u[D] || 0; } }
    return {n, esp, real, vendidas: sum(ult, d => sum(ps, p => (ud[p.id] || {})[d] || 0)), dias: ult.length, hist: histInfo().n};
  });
}
// para Inicio y los recordatorios: cuánto pedir en el próximo pedido semanal y si ya se hizo
function pedidoSemanalResumen() {
  const c = pedidoSemanalCfg(), L = c && proximaLlegada(); if (!L) return null;
  // ya está hecho cuando hay pedido para esa llegada y no falta nada más (lo pedido ya cuenta en cada producto)
  const todas = recomendarCompra([S.today]).filter(r => r.semanal), rows = todas.filter(r => r.comprar > 0), yaPedido = Object.values(col("compras")).some(x => x && x.estado === "pedido" && x.llega === L.llega);
  return {L, cats: c.cats.join(", "), cierreHora: c.cierreHora, rows, yaPedido, hecho: yaPedido && !rows.length, sinDatos: todas.length > 0 && todas.every(r => r.comprar == null), paquetes: sum(rows, r => r.semanal.paquetes || 0), unidades: sum(rows, r => r.comprar), horas: (L.lim - Date.now()) / 3600000, agotan: todas.filter(r => r.semanal.alLlegar != null && r.semanal.alLlegar < 0)};
}

/* ---- lo pedido que todavía no llega ----
   Cada pedido llega el día que dice (llega); si no lo dice, un pedido semanal llega el siguiente día de llegada después de pedirlo y los
   demás al día siguiente. Lo que ya debió llegar y no se ha registrado no se cuenta como inventario: se pregunta si llegó. */
function llegadaEsperada(c) {
  if (c.llega) return c.llega; const cfg = pedidoSemanalCfg(), base = c.fecha || S.today;
  if (cfg && (c.lineas || []).some(l => esSemanal(prod(l.pid)))) for (let i = 1; i <= 7; i++) { const f = addDays(base, i); if (dowOf(f) === Number(cfg.llega)) return f; }
  return addDays(base, 1);
}
const pedidosPendientes = () => Object.entries(col("compras")).filter(([, c]) => c && c.estado === "pedido").map(([id, c]) => ({id, c, llega: llegadaEsperada(c)}));
const porLlegar = () => memo("porLlegar", () => { const m = {}; for (const x of pedidosPendientes()) if (x.llega >= S.today) for (const l of (x.c.lineas || [])) { const o = m[l.pid] = m[l.pid] || {}; o[x.llega] = (o[x.llega] || 0) + (Number(l.q) || 0); } return m; });
const pedidosAtrasados = () => pedidosPendientes().filter(x => x.llega < S.today).sort((a, b) => a.llega.localeCompare(b.llega));

/* ---- cuándo se agota ---- */
function agotaEn(pid) {
  const p = prod(pid), st = stockDe(pid); if (st == null || p.controla === false) return null; if (st <= 0) return {dias: 0, fecha: S.today};
  const viene = porLlegar()[pid] || {};   // lo que llega ese día se suma antes de vender (no avisa «se agota mañana» si el pedido llega hoy)
  let s = st; for (let i = 0; i < 14; i++) { const f = addDays(S.today, i), d = demandaDia(pid, f, i === 0); if (d == null) return null; s += viene[f] || 0; s -= d; if (s <= 0) return {dias: i, fecha: f, frac: i === 0}; } return null;
}
const cobertura = pid => { const st = stockDe(pid), a = avgDaily(pid); if (st == null || a == null) return null; return a > 0 ? Math.max(0, st) / a : Infinity; };
function cuandoTxt(f) { const d = diffDays(f, S.today); return d <= 0 ? "hoy" : d === 1 ? "mañana" : d < 7 ? "antes del " + DOW[dowOf(f)] : "en " + d + " días"; }

/* ---- asistente de compras: ¿qué debo pedir? ---- */
function recomendarCompra(fechas) {
  return terminados().filter(p => p.activo !== false && p.controla !== false && !p.combo).map(p => {
    const st = stockDe(p.id), avg = avgDaily(p.id), dem = demanda(p.id, fechas), seg = p.seg || 0, pend = comprasPend()[p.id] || 0, cov = cobertura(p.id), tp = tendencia(p.id);
    const u7 = unidadesVent(p.id, 7);
    const sem = esSemanal(p) ? planSemanal(p, st) : null;   // llega un solo día de la semana: se pide para esa semana, sin importar el periodo elegido
    const need = sem ? sem.need : dem == null ? null : dem + seg - Math.max(st == null ? 0 : st, 0) - pend;
    let comprar = sem ? sem.comprar : need == null ? null : Math.max(0, Math.ceil(need)); const pack = sem ? sem.pack : p.pack || 1; if (!sem && comprar && pack > 1) comprar = Math.ceil(comprar / pack) * pack;
    const ag = agotaEn(p.id), riesgo = st != null && st <= 0 ? "bad" : (ag && ag.dias <= 2) ? "bad" : (ag && ag.dias <= 5) ? "warn" : st != null && st <= (p.min || 0) ? "warn" : "ok";
    const ds = sem ? sem.demSem : dem, fs = sem ? sem.semana : fechas;   // dem sigue siendo la del periodo pedido (fin de semana, proyección…); la explicación usa la semana del pedido
    return {pid: p.id, p, st, avg, dem, seg, pend, cov, comprar, riesgo, ag, semanal: sem, why: {avg, u7: u7.u, dias7: u7.dias, tend: tp, st, cov, dem: ds, seg, pend, comprar, fechas: fs, pack, fac: fs.map(f => factorDia(f).fac), esp: fs.map(f => ({f, x: factorDia(f)})).filter(o => o.x.esp)}};
  }).sort((a, b) => ({bad: 0, warn: 1, ok: 2}[a.riesgo] - {bad: 0, warn: 1, ok: 2}[b.riesgo]) || (b.comprar || 0) - (a.comprar || 0));
}
function explicarCompra(r) {
  const w = r.why, l = [];
  l.push(["Ventas promedio", w.avg == null ? "sin datos" : fmtN(w.avg, 1) + " /día"], ["Ventas últimos 7 días", w.u7 + " unidades"],
    ["Tendencia", w.tend == null ? "sin datos" : (w.tend >= 1 ? "+" : "") + Math.round((w.tend - 1) * 100) + "%"], ["Inventario actual", r.st == null ? "sin contar" : String(Math.max(0, r.st))],
    ["Cobertura", w.cov == null ? "sin datos" : w.cov === Infinity ? "sin ventas" : fmtN(w.cov, 1) + " días"], ["Demanda estimada", w.dem == null ? "sin datos" : fmtN(w.dem, 0)],
    ["Stock de seguridad", String(w.seg)], ["Pedidos por llegar", String(w.pend)]);
  const sm = r.semanal; if (sm) l.push(["Llega el pedido", diaCorto(sm.L.llega) + " (se pide hasta el " + diaCorto(sm.L.cierre) + ", " + horaTxt(pedidoSemanalCfg().cierreHora) + ")"],
    ["Se venderán antes de que llegue", sm.demAntes == null ? "sin datos" : fmtN(sm.demAntes, 0)], ["Quedarán al llegar", sm.alLlegar == null ? "sin contar" : sm.alLlegar < 0 ? "0 (se acaba antes: faltarían ~" + fmtN(-sm.alLlegar, 0) + ")" : fmtN(sm.alLlegar, 0)],
    ["Demanda de la semana del pedido", (sm.demSem == null ? "sin datos" : fmtN(sm.demSem, 0)) + " (" + diaCorto(sm.semana[0]) + " a " + diaCorto(sm.semana[6]) + ")"], ["Viene en paquetes de", String(sm.pack)]);
  for (const o of w.esp || []) l.push([diaCorto(o.f) + " · " + o.x.esp.n, (o.x.esp.tipo === "festivo" ? "Festivo" : o.x.esp.tipo === "temporada" ? "Semana Santa" : "Puente") + ": " + o.x.fuente]);
  l.push(["Cantidad recomendada", w.comprar == null ? "—" : String(w.comprar) + (sm && w.comprar ? " (" + sm.paquetes + (sm.paquetes === 1 ? " paquete)" : " paquetes)") : "")]);
  return l;
}
function riesgosStock() {
  const out = [];
  for (const p of terminados().filter(x => x.activo !== false && x.controla !== false && !x.combo)) {
    const e = estadoProd(p), nm = p.nombre, ag = agotaEn(p.id), cov = cobertura(p.id), hoyU = unidadesHoy(p.id);
    if (e.k === "agotado") out.push({pid: p.id, sev: "bad", t: nm + " agotado.", d: "No se puede vender hasta que llegue inventario."});
    else if (ag && ag.dias <= 1) out.push({pid: p.id, sev: "bad", t: nm + " probablemente se agotará " + cuandoTxt(ag.fecha) + ".", d: "Quedan " + e.st + " y se venden ~" + fmtN(avgDaily(p.id), 1) + " al día."});
    else if (ag && ag.dias <= 4) out.push({pid: p.id, sev: "warn", t: nm + " tiene aproximadamente " + fmtN(cov, 0) + " días de inventario.", d: "Podría agotarse " + cuandoTxt(ag.fecha) + "."});
    else if (e.k === "bajo") out.push({pid: p.id, sev: "warn", t: "Solo quedan " + e.st + " unidades de " + nm + ".", d: "Está en el mínimo de " + (p.min || 0) + "."});
  }
  return out;
}
function riesgosInsumos() { const out = []; for (const p of insumos().filter(x => x.activo !== false && x.controla !== false)) { const e = estadoProd(p); if (e.k === "agotado") out.push({pid: p.id, sev: "bad", t: p.nombre + " agotado.", d: "Insumo sin existencias."}); else if (e.k === "bajo") out.push({pid: p.id, sev: "warn", t: "Quedan " + e.st + " " + (p.unidad || "und") + " de " + p.nombre + ".", d: "Mínimo: " + (p.min || 0) + "."}); } return out; }

/* ---- fin de semana ---- */
function prepararFinde() {
  const fechas = fechasHorizonte("finde"), df = dowFactors(), hi = histInfo();
  const basico = !hi.ok || !(df.ok[6] && df.ok[0]);
  const rows = recomendarCompra(fechas).map(r => {
    const disp = r.st == null ? 0 : Math.max(0, r.st), dem = r.dem, deficit = dem == null ? null : Math.max(0, dem + r.seg - disp);
    return Object.assign({}, r, {disp, deficit, riesgoF: dem == null ? "sin" : dem + r.seg > disp ? (disp < dem ? "bad" : "warn") : "ok"}, r.semanal ? {comprar: 0} : {});   // lo que llega un solo día se pide en su pedido semanal
  });
  const ventasEsp = sum(vendibles(), p => (demandaVendida(p.id, fechas) || 0) * (p.precio || 0)), enRiesgo = rows.filter(r => r.riesgoF === "bad" || r.riesgoF === "warn");
  return {fechas, rows, ventasEsp, enRiesgo, basico, datosOk: hi.ok};
}

/* ---- patrones por día y hora ---- */
function patrones() {
  return memo("patrones", () => {
    const df = dowFactors(), hi = histInfo(), out = {ok: hi.ok, frases: [], dow: [], horas: []};
    for (let k = 0; k < 7; k++) { const arr = df.by[k] || []; out.dow.push({k, nombre: DOW[k], avg: arr.length ? sum(arr) / arr.length : 0, n: arr.length, f: df.f[k], ok: df.ok[k]}); }
    if (!hi.ok) return out;
    const top = out.dow.filter(x => x.ok && x.n >= 3).sort((a, b) => b.f - a.f)[0];
    if (top && top.f >= 1.1) out.frases.push(`Los ${top.nombre}s vendes ${Math.round((top.f - 1) * 100)}% más que el promedio semanal.`);
    const flo = out.dow.filter(x => x.ok && x.n >= 3).sort((a, b) => a.f - b.f)[0]; if (flo && flo.f <= 0.85 && flo !== top) out.frases.push(`Los ${flo.nombre}s son tu día más flojo (${Math.round((1 - flo.f) * 100)}% menos que el promedio).`);
    const desde = addDays(S.today, -56), hs = new Array(24).fill(0); let nv = 0;
    for (const v of ventasOk()) if (v.fecha >= desde) { hs[horaDe(v.t)] += v.total; nv++; }
    out.horas = hs;
    if (nv >= 30) { let bi = 0, bv = -1; for (let h = 0; h < 23; h++) { const s = hs[h] + hs[h + 1]; if (s > bv) { bv = s; bi = h; } } const f = h => { const x = h % 12 || 12; return x + ":00 " + (h < 12 ? "AM" : "PM"); }; out.frases.push(`Tu hora de mayor venta es ${f(bi)}–${f(bi + 2)}.`); out.pico = bi; }
    const prodLift = [];
    for (const p of vendibles()) { const u = unidadesDia()[p.id] || {}, dias = histInfo().dias.filter(d => d >= desde); if (!dias.length || sum(dias, d => u[d] || 0) < 20) continue; const avg = sum(dias, d => u[d] || 0) / dias.length;
      for (const k of [0, 6, 5]) { const dk = dias.filter(d => dowOf(d) === k); if (dk.length >= 3) { const a = sum(dk, d => u[d] || 0) / dk.length; if (avg > 0 && a / avg >= 1.2) prodLift.push({p, k, lift: a / avg}); } } }
    prodLift.sort((a, b) => b.lift - a.lift).slice(0, 3).forEach(x => out.frases.push(`${x.p.nombre} aumenta ${Math.round((x.lift - 1) * 100)}% los ${DOW[x.k]}s.`));
    return out;
  });
}

/* ---- proyección ---- */
function proyeccion(dias) {
  const hi = histInfo(); if (!hi.ok) return {ok: false, dias};
  const fechas = Array.from({length: dias}, (_, i) => addDays(S.today, i + 1)); let ventas = 0, costo = 0, sinCosto = 0; const por = [];
  for (const p of vendibles()) { const d = demandaVendida(p.id, fechas); if (d == null) continue; const c = costoProyeccion(p.id); ventas += d * (p.precio || 0); if (c == null) sinCosto += d; else costo += d * c; por.push({p, d}); }
  const fijos = totalFijos() * dias / 30, ant = fechas.map(f => ({f, f2: dowFactors().f[dowOf(f)]})), sorted = ant.filter(x => x.f2 > 0).sort((a, b) => b.f2 - a.f2);
  const df = dowFactors(), top = Object.entries(df.f).filter(([k]) => df.ok[k]).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => DOW[k]);
  const need = recomendarCompra(fechas).filter(r => r.comprar), riesgo = need.filter(r => r.riesgo !== "ok");
  return {ok: true, dias, ventas, costo, bruta: ventas - costo, fijos, utilidad: ventas - costo - fijos, sinCosto, necesarios: need, riesgo, topDias: top};
}

/* ---- simulador ---- */
function simular(i) {
  const ing = i.precio * i.vol, cogs = i.costo * i.vol, bruta = ing - cogs, util = bruta - i.gastos, mu = i.precio - i.costo, pe = mu > 0 ? Math.ceil(i.gastos / mu) : null;
  return {ing, cogs, bruta, util, margen: ing ? util / ing : NaN, margenU: i.precio ? mu / i.precio : NaN, pe, peIng: pe != null ? pe * i.precio : null};
}
function baseSimulador(pid) {
  const a = addDays(S.today, -29), b = S.today;
  // gastos del mes: los fijos del plan más lo variable registrado (la misma regla del punto de equilibrio del inicio); sin plan, lo registrado
  const gastosMes = totalFijos() > 0 ? totalFijos() + gastosVariables(a, b) : finanzas(a, b).gastos;
  if (pid === "*") { const f = finanzas(a, b); return {precio: f.uds ? f.ventas / f.uds : 0, costo: f.uds ? f.cogs / f.uds : 0, vol: f.uds, gastos: gastosMes}; }
  const r = rentabilidad(a, b).find(x => x.pid === pid), p = prod(pid), c = costoProyeccion(pid);
  return {precio: p ? p.precio : 0, costo: c == null ? 0 : Math.round(c), sinCosto: c == null, vol: r ? r.uds : 0, gastos: gastosMes};
}

/* ---- recomendaciones de precio (solo recomienda; nunca cambia precios) ---- */
function recomendarPrecios() {
  if (!esAdmin()) return [];
  const obj = margenObjetivo(), rent = rentabilidad(addDays(S.today, -29), S.today), uds = {}; rent.forEach(r => uds[r.pid] = r.uds);
  const orden = Object.values(uds).sort((a, b) => a - b), med = orden.length ? orden[Math.floor(orden.length / 2)] : 0, out = [];
  for (const p of vendibles()) {
    const c = costoActual(p.id); if (c == null || !p.precio) continue; const m = (p.precio - c) / p.precio; if (m >= obj) continue;
    let np = Math.ceil((p.precio + 1) / 500) * 500; const cap = p.precio * 1.15; while ((np - c) / np < m + 0.03 && np + 500 <= cap) np += 500;
    const alta = (uds[p.id] || 0) > med, nm = (np - c) / np;
    out.push({p, precio: p.precio, costo: c, margen: m, nuevo: np, margenNuevo: nm, alta, uds: uds[p.id] || 0, motivo: alta ? "Se vende bien y el margen está por debajo del objetivo (" + pct(obj) + ")." : "El margen está por debajo del objetivo (" + pct(obj) + ")."});
  }
  return out.sort((a, b) => a.margen - b.margen);
}
/* ---- alertas de costos ---- */
function costoReceta(pid) {
  const r = col("recetas")[pid]; if (!r || !(r.lineas || []).length) return null; let s = 0;
  for (const l of r.lineas) { const c = costoActual(l.iid); if (c == null) return null; s += c * l.q; } return s / (r.rinde || 1);
}
function alertasCostos() {
  if (!esAdmin()) return [];
  const out = [];
  for (const p of terminados()) {
    const c = costos()[p.id]; const h = (c && c.hist) || [];
    if (h.length >= 2) { const a = h[h.length - 2].c, b = h[h.length - 1].c, ch = a ? (b - a) / a : 0;
      if (Math.abs(ch) >= 0.05 && S.today <= addDays(ymd(new Date(h[h.length - 1].t)), 14)) out.push({p, tipo: ch > 0 ? "sube" : "baja", prev: a, nuevo: b, ch, mPrev: p.precio ? (p.precio - a) / p.precio : NaN, mNuevo: p.precio ? (p.precio - b) / p.precio : NaN, t: h[h.length - 1].t}); }
  }
  for (const p of insumos()) { const c = costos()[p.id], h = (c && c.hist) || []; if (h.length >= 2) { const a = h[h.length - 2].c, b = h[h.length - 1].c, ch = a ? (b - a) / a : 0; if (Math.abs(ch) >= 0.05 && S.today <= addDays(ymd(new Date(h[h.length - 1].t)), 14)) out.push({p, insumo: true, tipo: ch > 0 ? "sube" : "baja", prev: a, nuevo: b, ch, t: h[h.length - 1].t}); } }
  return out.sort((a, b) => b.t - a.t);
}
function difRecetas() { if (!esAdmin()) return []; const out = []; for (const p of terminados()) { const cr = costoReceta(p.id), cu = costoActual(p.id); if (cr != null && cu != null && cu > 0 && Math.abs(cr - cu) / cu >= 0.08) out.push({p, receta: cr, registrado: cu}); } return out; }

/* ---- mermas ---- */
function analisisMermas() {
  const t = S.today, a = firstOfMonth(t), ms = mermasAll().filter(m => m.fecha >= a && m.fecha <= t);
  let costo = 0; for (const m of ms) { const c = costoUnit(m.pid, m.t); if (c != null) costo += c * m.q; }
  const ph = perdidasHelado(a, t); costo += sum(ph, x => x.total || 0);                        // cajas de helado abiertas que se dañaron
  const compras = sum(Object.values(col("compras")).filter(c => c.estado === "recibido" && c.fecha >= a), c => sum(c.lineas || [], l => (l.costo || 0) * (l.q || 0)));
  const finMes = finanzas(a, t), baseCmp = compras || finMes.cogs, anormal = [], by = {};
  for (const m of ms) by[m.pid] = (by[m.pid] || 0) + m.q;
  const prev30 = mermasAll().filter(m => m.fecha >= addDays(t, -59) && m.fecha < addDays(t, -29)), pv = {}; prev30.forEach(m => pv[m.pid] = (pv[m.pid] || 0) + m.q);
  const vend = {}; rentabilidad(a, t).forEach(r => vend[r.pid] = r.uds);
  for (const [pid, q] of Object.entries(by)) { const v = vend[pid] || 0, p = prod(pid); if (!p) continue; if (q >= 3 && q / (q + v) >= 0.1) anormal.push({p, q, v, motivo: "Más del 10% de lo que sale se pierde (" + q + " de " + (q + v) + ")."}); else if (q >= 5 && q >= 2 * (pv[pid] || 0.5)) anormal.push({p, q, v, motivo: "Subió a " + q + " este mes (antes " + (pv[pid] || 0) + ")."}); }
  const porMotivo = {}; ms.forEach(m => porMotivo[m.motivo] = (porMotivo[m.motivo] || 0) + m.q); if (ph.length) porMotivo["Caja de helado dañada"] = ph.length;
  return {ms, cajasHelado: ph, unidades: sum(ms, m => m.q), costo, pctCompras: baseCmp ? costo / baseCmp : NaN, base: compras ? "compras" : "costo de lo vendido", anormal, porMotivo};
}

/* ---- productos lentos y estrellas ---- */
function productosLentos() {
  return memo("lentos", () => {
    if (!histInfo().ok) return [];
    const rent = {}; rentabilidad(addDays(S.today, -29), S.today).forEach(r => rent[r.pid] = r); const out = [];
    const nd = Math.max(1, Math.min(30, diffDays(S.today, histInfo().primero || S.today) + 1));   // días de verdad con historia (máx. 30): con 16 días no se divide por 30
    for (const p of terminados().filter(x => x.activo !== false && x.controla !== false && !x.combo)) {
      const st = stockDe(p.id); if (st == null || st <= (p.min || 0)) continue; const u = (rent[p.id] || {}).uds || 0, cov = u > 0 ? st / (u / nd) : Infinity;
      if (cov > 45 && st >= 8) out.push({p, st, u30: u, cov, rec: "Reducir producción o compra."});
    }
    return out.sort((a, b) => b.cov - a.cov);
  });
}
function estrellas() {
  return memo("estrellas", () => {
    const rent = rentabilidad(addDays(S.today, -29), S.today); if (!rent.length) return null;
    const masV = rent.slice().sort((a, b) => b.uds - a.uds)[0], masR = rent.filter(r => r.sinCosto === 0).sort((a, b) => b.util - a.util)[0];
    let crec = null; for (const p of vendibles()) { const t = tendencia(p.id), u7 = unidadesVent(p.id, 7).u; if (t != null && u7 >= 5 && (!crec || t > crec.t)) crec = {p, t}; }
    const lento = productosLentos()[0] || null, riesgo = riesgosStock().filter(r => r.sev !== "ok")[0] || null;
    return {masV, masR, crec: crec && crec.t > 1.05 ? crec : null, lento, riesgo};
  });
}

/* ---- anomalías (sin asumir fraude: solo "revisar") ---- */
function anomalias() {
  return memo("anom", () => {
    const out = [], t = S.today, hi = histInfo(), df = dowFactors();
    if (hi.ok) {
      const h = new Date().getHours(), tot = histVentasDia()[t] ? histVentasDia()[t].total : 0, desde = addDays(t, -56), hs = new Array(24).fill(0); let all = 0;
      for (const v of ventasOk()) if (v.fecha >= desde && v.fecha < t) { hs[horaDe(v.t)] += v.total; all += v.total; }
      const arr = df.by[dowOf(t)] || []; if (arr.length >= 3 && all > 0 && h >= 12) {
        let c = 0; for (let i = 0; i <= h; i++) c += hs[i]; const exp = (sum(arr) / arr.length) * (c / all);
        if (exp >= 40000 && tot < exp * 0.68) out.push({sev: "warn", t: `Las ventas de hoy están ${Math.round((1 - tot / exp) * 100)}% por debajo de lo normal a esta hora.`, d: "Llevas " + fmt(tot) + " y lo habitual es ~" + fmt(exp) + ".", ir: "hoy"});
        if (exp >= 40000 && tot > exp * 1.4) out.push({sev: "ok", t: `Las ventas de hoy están ${Math.round((tot / exp - 1) * 100)}% por encima de lo normal a esta hora.`, d: "Buen día: revisa que haya inventario suficiente.", ir: "compras"});
      }
      for (const p of vendibles()) { const a = avgDaily(p.id), hoy = unidadesHoy(p.id); if (a != null && hoy >= Math.max(6, 2 * a)) out.push({sev: "warn", t: `El inventario de ${p.nombre} disminuyó más rápido de lo esperado.`, d: hoy + " vendidas hoy contra ~" + fmtN(a, 1) + " en un día normal.", ir: "inventario"}); }
      const dig = v => esDigital(v.m), d30 = ventasEn(addDays(t, -29), addDays(t, -1)), h0 = ventasEn(t, t);
      if (d30.length >= 30 && h0.length >= 5) for (const m of ["Nequi", "Daviplata", "QR Bancolombia", "Tarjeta"]) { const s30 = d30.filter(v => v.m === m).length / d30.length, s0 = h0.filter(v => v.m === m).length / h0.length; if (s0 - s30 > 0.2) out.push({sev: "warn", t: `Las ventas por ${m} están por encima del comportamiento normal.`, d: Math.round(s0 * 100) + "% de las ventas de hoy contra " + Math.round(s30 * 100) + "% habitual.", ir: "reportes"}); }
    }
    const difs = cajasAll().filter(c => c.fecha >= addDays(t, -29) && cajaEstado(c) === "cerrada" && Math.abs(difFinal(c)) >= 1000);   // después de lo que el administrador ya explicó
    if (difs.length >= 3 && sum(difs, c => Math.abs(difFinal(c))) >= 10000) out.push({sev: "warn", t: `Se registraron ${difs.length} cierres con diferencias en 30 días.`, d: "Conviene revisar los cierres y el conteo de efectivo.", ir: "cierres"});
    for (const [pid, st] of Object.entries(stockMap())) { const p = prod(pid); if (st != null && st < 0 && (!p || (p.activo !== false && !p.combo))) out.push({sev: "bad", t: `El inventario de ${(p || {}).nombre || pid} quedó negativo (${st}).`, d: "Puede ser un conflicto entre dispositivos o un conteo desactualizado. Haz un conteo.", ir: "inventario"}); }   // un combo o un producto desactivado no se cuenta: su alerta sale en el insumo
    const viejos = conteosViejos(); if (viejos.length) { const malos = viejos.filter(x => x.dias >= HIST_DIAS - 2);
      out.push({sev: malos.length ? "bad" : "warn", t: malos.length ? `El inventario de ${malos.slice(0, 3).map(x => x.p.nombre).join(", ")}${malos.length > 3 ? " y " + (malos.length - 3) + " más" : ""} ya no es confiable en este equipo: hay que contarlo.` : `Hay ${viejos.length === 1 ? "1 producto que no se cuenta" : viejos.length + " productos que no se cuentan"} hace más de 70 días: ${viejos.slice(0, 3).map(x => x.p.nombre).join(", ")}${viejos.length > 3 ? "…" : ""}.`,
        d: "Este equipo guarda los últimos " + HIST_DIAS + " días de ventas. Cuenta esos productos (Inventario → Contar) para que el cálculo siga siendo exacto.", ir: "inventario"}); }
    // una venta cuyo total no es la suma de sus productos menos el descuento (la app nunca la arma así: llegó dañada o de otra forma). Sin asumir nada: revisar
    for (const v of ventasOk()) if (v.fecha >= addDays(t, -6) && (v.items || []).length && Math.abs((Number(v.total) || 0) - sum(v.items, it => (Number(it.p) || 0) * (Number(it.q) || 0) - (Number(it.d) || 0))) > 1) out.push({sev: "warn", t: `La venta ${v.num || v.id} tiene un total que no cuadra con sus productos.`, d: diaCorto(v.fecha) + " " + hora(v.t) + " · total " + fmt(v.total) + " · productos " + fmt(sum(v.items, it => (Number(it.p) || 0) * (Number(it.q) || 0) - (Number(it.d) || 0))) + ". Revísala en Ventas.", ir: "reportes"});
    // el servidor marca "sinPermiso" un retiro o pago de un empleado que llegó con el permiso apagado (la plata sí salió: se guarda y se avisa)
    for (const c of cajasAll()) if (c.fecha >= addDays(t, -6)) for (const m of (c.movs || [])) if (m.sinPermiso) out.push({sev: "warn", t: `${nombreDe(m.uid) || "Un empleado"} ${m.tipo === "gasto" ? "pagó" : "sacó"} ${fmt(m.monto)} de la caja aunque los empleados no tienen permiso.`, d: diaCorto(c.fecha) + " " + hora(m.t) + " · " + ((col("dispositivos")[c.dev] || {}).nombre || c.devNombre || "") + (m.motivo ? " · " + m.motivo : "") + ". La plata sí salió de la caja: quedó registrada.", ir: "caja"});
    return out;
  });
}
const enMin = t => Math.max(0, Math.round((Date.now() - t) / 60000));
const haceTxt = t => { const m = enMin(t); return m < 1 ? "hace segundos" : m < 60 ? "hace " + m + " min" : m < 1440 ? "hace " + Math.round(m / 60) + " h" : "hace " + Math.round(m / 1440) + " d"; };
function dispositivosEstado() {
  const now = Date.now(); return Object.values(col("dispositivos")).filter(d => d && typeof d === "object").map(d => { const dt = now - (d.vis || 0), on = dt < 100000, mine = d.dev === DEV.id;
    return Object.assign({}, d, {online: mine ? SYNC.online : on, hace: dt, mine, pendMios: mine ? ventasPendientes() : d.ventasPend, rech: mine ? rechazadas().length : Number(d.rech) || 0, rechInfo: mine ? [] : rechInfoDe(d)}); }).sort((a, b) => b.vis - a.vis);
}
/* lo que otro equipo cuenta de sus cambios rechazados llega de afuera: se normaliza para que un dato raro no rompa la pantalla */
const rechInfoDe = d => (Array.isArray(d.rechInfo) ? d.rechInfo : []).filter(x => x && typeof x === "object").slice(0, 5).map(x => ({c: String(x.c || "Un cambio"), e: String(x.e || "")}));
const rechTxt = d => d.rechInfo.map(x => x.c + (x.e ? " (" + x.e + ")" : "")).join("; ");
const DIAS_EQUIPO_VIEJO = 3;

/* diferencias de caja de la última semana sin revisar: desde DIF_GRANDE cada una es urgente; las pequeñas (de $1.000 a DIF_GRANDE: un
   error de cambio, unas monedas) se juntan en un solo aviso que no es urgente. Antes tres diferencias de ±$1.000 salían como urgentes. */
const DIF_GRANDE = 5000;
const difsSinRevisar = () => cajasAll().filter(c => c.fecha >= addDays(S.today, -7) && cajaEstado(c) === "cerrada").map(c => ({c, r: difCierre(c)})).filter(x => x.r && Math.abs(x.r.final) >= 1000 && !x.r.revisada).sort((a, b) => b.c.fecha.localeCompare(a.c.fecha));
const difsPequenas = () => difsSinRevisar().filter(x => Math.abs(x.r.final) < DIF_GRANDE);
const resumenPedido = c => { const ls = (c.lineas || []).filter(l => l && l.pid); return ls.slice(0, 2).map(l => ((prod(l.pid) || {}).nombre || l.pid) + " (" + fmtN(Number(l.q) || 0, 0) + ")").join(", ") + (ls.length > 2 ? " y " + (ls.length - 2) + " más" : "") || "un pedido"; };

/* ---- alertas unificadas (cada rol ve lo que le corresponde) ---- */
function alertas() {
  return memo("alertas:" + (DS.isAdmin ? "a" : "e"), () => {
    const out = [], adm = esAdmin();
    for (const r of riesgosStock()) out.push({sev: r.sev, tipo: "inventario", t: r.t, d: r.d, tab: "inventario", pid: r.pid});
    for (const r of riesgosInsumos()) out.push({sev: r.sev, tipo: "inventario", t: r.t, d: r.d, tab: "inventario", pid: r.pid});
    const pend = ventasOk().filter(v => v.pend && (adm || v.fecha >= addDays(S.today, -3))).length; if (pend) out.push({sev: "warn", tipo: "caja", t: pend + (pend === 1 ? " pago digital por confirmar." : " pagos digitales por confirmar."), d: "Verifica que llegó el dinero.", tab: "caja"});
    if (adm) { const pq = difsPequenas(); if (pq.length) out.push({sev: "ok", tipo: "caja", t: pq.length === 1 ? "Una diferencia pequeña de caja sin revisar (" + fmt(pq[0].r.final) + ")." : pq.length + " diferencias pequeñas de caja sin revisar (" + fmt(sum(pq, x => x.r.final)) + " en total).", d: "Menos de " + fmt(DIF_GRANDE) + " cada una. Revísalas en Caja → Acumulado del mes cuando puedas.", tab: "caja"}); }
    for (const c of adm ? cajasAll().filter(x => x.fecha >= addDays(S.today, -7) && cajaEstado(x) === "cerrada") : [cajaHoy()].filter(x => x && cajaEstado(x) === "cerrada")) { const r = difCierre(c); if (r && Math.abs(r.final) >= (c.fecha === S.today ? 1 : DIF_GRANDE) && !r.revisada) out.push({sev: "warn", tipo: "caja", t: "Diferencia de caja de " + fmt(r.final) + " en " + ((col("dispositivos")[c.dev] || {}).nombre || c.devNombre || "la caja") + (c.fecha === S.today ? "" : " (" + diaCorto(c.fecha) + ")") + ".", d: (r.ci.obs ? "Observación: " + r.ci.obs + ". " : "Sin observación. ") + (adm ? "Toca para decir qué pasó." : "El administrador la revisa."), tab: "caja", act: adm ? "resolverDif" : "", id: c.id}); }
    if (SYNC.rechazadas) out.push({sev: "bad", tipo: "sync", t: SYNC.rechazadas === 1 ? "Un cambio de este equipo no se pudo enviar: el servidor no lo aceptó." : SYNC.rechazadas + " cambios de este equipo no se pudieron enviar: el servidor no los aceptó.", d: rechazadas().map(descCambio).join("; ") + ". Toca «Hay datos que revisar» (arriba) para ver por qué y reintentar.", tab: "equipo"});
    if (adm) {
      for (const d of dispositivosEstado()) if (!d.mine && d.rech > 0) { const uno = d.rech === 1, dias = Math.floor(d.hace / 86400000);
        out.push({sev: "bad", tipo: "sync", t: (d.nombre || "Otro equipo") + ": " + (uno ? "un cambio que el servidor no aceptó." : d.rech + " cambios que el servidor no aceptó."),
          d: rechTxt(d) + ". " + (dias >= DIAS_EQUIPO_VIEJO
            ? "Ese equipo no se conecta desde hace " + dias + " días: si se borró o se reemplazó, " + (uno ? "ese cambio se perdió" : "esos cambios se perdieron") + " (no llegaron al servidor). Si ya no existe, quita este aviso en Equipo → «Quitar el aviso»."
            : (uno ? "Sigue guardado" : "Siguen guardados") + " en ese equipo, no en el servidor: allá toca «Hay datos que revisar» (arriba) y luego «Reintentar el envío». Si vuelve a fallar, ingresa en ese equipo con tu cuenta: como administrador puedes reintentarlo" + (DS.backend === "supabase" ? " o descartarlo" : "") + ". Última conexión de ese equipo: " + haceTxt(d.vis) + "."), tab: "equipo"}); }
      for (const c of cajasAbiertasViejas()) out.push({sev: "warn", tipo: "caja", t: "La caja " + ((col("dispositivos")[c.dev] || {}).nombre || c.devNombre || "") + " del " + diaCorto(c.fecha) + " sigue abierta.", d: "Cuenta el efectivo de esa caja y ciérrala; si no se usó, ciérrala con lo que tenga.", tab: "caja", act: "cerrarCaja", id: c.id});
      for (const x of anulacionesCajaCerrada(addDays(S.today, -30), S.today)) out.push({sev: "bad", tipo: "caja", t: "Se anuló " + x.venta + " (" + fmt(x.total) + ") con la caja ya cerrada.", d: "La anulación llegó al servidor después del cierre. Revisa si de verdad se hizo antes de cerrar: la plata de esa venta ya se había contado.", tab: "reportes"});
      for (const a of anomalias()) out.push({sev: a.sev, tipo: "anomalia", t: a.t, d: a.d, tab: a.ir === "hoy" ? "hoy" : a.ir === "compras" ? "compras" : a.ir === "inventario" ? "inventario" : a.ir === "cierres" ? "reportes" : "reportes", anom: true});
      for (const a of alertasCostos().filter(x => x.tipo === "sube")) out.push({sev: a.tipo === "sube" ? "warn" : "ok", tipo: "costo", t: (a.insumo ? "El costo de " : "El costo de ") + a.p.nombre + (a.tipo === "sube" ? " aumentó " : " bajó ") + Math.round(Math.abs(a.ch) * 100) + "%.", d: a.insumo ? "Costo anterior " + fmt(a.prev) + ", nuevo " + fmt(a.nuevo) + ". Revisa precio o receta." : "Margen de " + pct(a.mPrev) + " a " + pct(a.mNuevo) + ". Revisa precio o receta.", tab: "productos", pid: a.p.id});
      const pp = proximoPuente(7); if (pp) out.push({sev: "warn", tipo: "compra", t: "Se viene fin de semana largo: " + rangoFechasTxt(pp.fechas) + ".", d: (pp.nombres.join(", ") || "Festivo") + ". Haz el pedido para los " + pp.fechas.length + " días: OLI ya pide " + Math.round(colchonFestivo() * 100) + " % más para esos días.", tab: "compras"});
      for (const a of alertasHelado()) out.push({sev: a.sev, tipo: "helado", t: a.t, d: a.d, tab: "inventario"});
      for (const x of pedidosAtrasados()) out.push({sev: "warn", tipo: "compra", t: "¿Llegó el pedido de " + resumenPedido(x.c) + "?", d: "Se pidió el " + diaCorto(x.c.fecha) + " y debía llegar el " + diaCorto(x.llega) + ". Si llegó, registra la llegada (el inventario lo necesita); si no va a llegar, cancélalo.", tab: "compras"});
      const ta = dispositivosEstado().filter(d => !d.mine && !d.online && d.hace > 10 * 60000 && d.hace < 12 * 3600000);
      for (const d of ta) { const cj = cajaDe(S.today, d.dev); if (cj && cajaEstado(cj) === "abierta") out.push({sev: "warn", tipo: "sync", t: d.nombre + " lleva " + Math.round(d.hace / 60000) + " minutos sin sincronizar.", d: "Puede estar sin Internet. Sus ventas aparecerán cuando se reconecte.", tab: "equipo"}); }
    }
    const rank = {bad: 0, warn: 1, ok: 2}; return out.sort((a, b) => rank[a.sev] - rank[b.sev]);
  });
}

/* cajas de días anteriores que siguen abiertas (de cualquier equipo), sin importar cuántos días lleven: antes solo se miraba la última
   semana y una caja olvidada dejaba de avisarse aunque siguiera abierta (sus cuentas no cuadran hasta que se cierre) */
const cajasAbiertasViejas = () => cajasAll().filter(c => c.fecha < S.today && c.fecha >= addDays(S.today, -HIST_DIAS) && c.apertura && cajaEstado(c) === "abierta").sort((a, b) => b.fecha.localeCompare(a.fecha));
/* ---- ¿qué debería hacer hoy? (centro de decisiones) ---- */
function decisionesHoy() {
  return memo("decisiones", () => {
    const urg = [], imp = [], opo = [], urgDif = [], urgCaja = [], t = S.today;   // la plata primero: diferencias sin revisar y cajas que quedaron abiertas
    for (const r of riesgosStock()) { const p = prod(r.pid); const rec = recomendarCompra(fechasHorizonte("3")).find(x => x.pid === r.pid);
      if (rec && rec.semanal) { if (rec.semanal.alLlegar != null && rec.semanal.alLlegar < 0) imp.push({t: p.nombre + " se puede acabar antes del " + DOW[dowOf(rec.semanal.L.llega)] + ".", d: r.d + " El pedido llega el " + diaCorto(rec.semanal.L.llega) + ".", tab: "compras"}); continue; }   // va en el pedido semanal
      const acc = rec && rec.comprar ? "Comprar " + rec.comprar + " de " + p.nombre + "." : r.t; (r.sev === "bad" ? urg : imp).push({t: acc, d: r.d, tab: "compras"}); }
    const ps = pedidoSemanalResumen(); if (ps && !ps.hecho && ps.paquetes > 0 && ps.horas <= 36) (ps.horas <= 6 ? urg : imp).unshift({t: "Hacer el pedido de " + ps.cats + ": " + ps.paquetes + (ps.paquetes === 1 ? " paquete" : " paquetes") + ".", d: "Se puede pedir hasta el " + diaCorto(ps.L.cierre) + " a las " + horaTxt(ps.cierreHora) + " (llega el " + diaCorto(ps.L.llega) + ").", tab: "compras"});
    for (const r of riesgosInsumos()) (r.sev === "bad" ? urg : imp).push({t: "Reponer " + prod(r.pid).nombre + ".", d: r.d, tab: "compras"});
    // cajas de días anteriores que siguen abiertas (de cualquier equipo): RESOLVER abre el cierre de esa caja
    for (const c of cajasAbiertasViejas()) urgCaja.push({t: "Cerrar la caja " + (c.fecha === addDays(t, -1) ? "de ayer" : "del " + diaCorto(c.fecha)) + " (" + ((col("dispositivos")[c.dev] || {}).nombre || c.devNombre || "caja") + ").", d: "Quedó abierta. Cuenta el efectivo de esa caja y ciérrala.", tab: "caja", act: "cerrarCaja", id: c.id});
    // diferencias de cierre de la última semana que nadie ha revisado: RESOLVER abre la revisión (qué pasó y cómo corregirlo)
    for (const {c, r} of difsSinRevisar().filter(x => Math.abs(x.r.final) >= DIF_GRANDE)) { urgDif.push({t: "Revisar diferencia de caja de " + fmt(r.final) + " (" + ((col("dispositivos")[c.dev] || {}).nombre || c.devNombre || "caja") + ", " + diaCorto(c.fecha) + ").", d: r.ci.obs || "Sin observación.", tab: "caja", act: "resolverDif", id: c.id}); }
    for (const a of anomalias().filter(x => x.sev === "bad")) urg.push({t: a.t, d: a.d, tab: "inventario"});
    const pq = difsPequenas(); if (pq.length) imp.push({t: "Revisar " + (pq.length === 1 ? "una diferencia pequeña de caja" : pq.length + " diferencias pequeñas de caja") + " (" + fmt(sum(pq, x => x.r.final)) + ").", d: pq.map(x => diaCorto(x.c.fecha) + ": " + fmt(x.r.final) + (x.r.ci.obs ? " · " + x.r.ci.obs : "")).join(" · "), tab: "caja"});
    for (const x of pedidosAtrasados()) imp.push({t: "¿Llegó el pedido de " + resumenPedido(x.c) + "?", d: "Debía llegar el " + diaCorto(x.llega) + ". Registra la llegada o cancélalo.", tab: "compras"});
    const pend = ventasOk().filter(v => v.pend).length; if (pend) imp.push({t: "Confirmar " + pend + " pagos digitales.", d: "Verifica que llegaron al banco.", tab: "caja"});
    for (const a of alertasCostos().filter(x => x.tipo === "sube").slice(0, 2)) imp.push({t: "Revisar el costo de " + a.p.nombre + ": subió " + Math.round(a.ch * 100) + "%.", d: "Margen " + pct(a.mPrev) + " → " + pct(a.mNuevo) + ".", tab: "productos"});
    const dw = dowOf(t); if (dw >= 3 && dw <= 5 && histInfo().ok) { const pf = prepararFinde(); if (pf.enRiesgo.length) imp.push({t: "Preparar producción para el fin de semana.", d: pf.enRiesgo.length + " productos presentan riesgo de agotamiento.", tab: "compras"}); else opo.push({t: "Fin de semana: inventario cubre la demanda esperada.", d: "Ventas esperadas ~" + fmt(pf.ventasEsp) + ".", tab: "compras"}); }
    const rp = recomendarPrecios()[0]; if (rp) opo.push({t: "Evaluar el margen de " + rp.p.nombre + ".", d: "Hoy deja " + pct(rp.margen) + "; con " + fmt(rp.nuevo) + " llegaría a " + pct(rp.margenNuevo) + ".", tab: "analisis"});
    const pl = productosLentos()[0]; if (pl) opo.push({t: "Comprar menos " + pl.p.nombre + ".", d: "Inventario para " + (pl.cov === Infinity ? "mucho tiempo" : Math.round(pl.cov) + " días") + " con ventas de " + pl.u30 + " en 30 días.", tab: "analisis"});
    const dr = difRecetas()[0]; if (dr) opo.push({t: "Revisar la receta de " + dr.p.nombre + ".", d: "Receta " + fmt(dr.receta) + " vs costo registrado " + fmt(dr.registrado) + ".", tab: "productos"});
    // las de caja nunca se quedan por fuera (antes una caja abierta o un producto por agotarse podía esconder una diferencia sin revisar)
    const u = urgDif.concat(urgCaja, urg);
    return {urgente: u.slice(0, Math.max(3, urgDif.length + urgCaja.length)), importante: imp.slice(0, 3), oportunidad: opo.slice(0, 2), total: {urg: u.length, imp: imp.length, opo: opo.length}};
  });
}

/* ---- resumen del día ---- */
function resumenDia(fecha = S.today) {
  const f = finanzas(fecha, fecha), rent = rentabilidad(fecha, fecha).sort((a, b) => b.uds - a.uds), est = rent[0], ago = prods().filter(p => p.activo !== false && p.controla !== false && estadoProd(p).k === "agotado");
  const cajas = cajasAll().filter(c => c.fecha === fecha && cajaEstado(c) === "cerrada"), dif = sum(cajas, difFinal), al = alertas().length;   // una caja reabierta no cuenta su cierre viejo
  const rec = recomendarCompra(fechasHorizonte("finde")).filter(r => r.comprar > 0 && r.riesgo !== "ok" && !r.semanal).slice(0, 2), ps = pedidoSemanalResumen();
  const psTxt = ps && !ps.hecho && ps.paquetes > 0 && ps.horas <= 72 ? "Pedido de " + ps.cats + " (hasta el " + diaCorto(ps.L.cierre) + ", " + horaTxt(ps.cierreHora) + "): " + ps.paquetes + " paquetes." : "";
  const recTxt = rec.length ? "Comprar " + rec.map(r => r.comprar + " " + r.p.nombre.replace(/^Paleta /, "")).join(" y ") + " antes del " + DOW[6] + "." + (psTxt ? " " + psTxt : "") : psTxt || (ago.length ? "Reponer " + ago.map(p => p.nombre).slice(0, 2).join(" y ") + "." : "Todo en orden. Sigue así.");
  return {f, fecha, uds: sum(rent, r => r.uds), est, ago, dif, al, rec: recTxt, txt: ""};
}
function resumenTexto(r) {
  return ["OLI · " + diaLargo(r.fecha), "Ventas: " + fmt(r.f.ventas), "Utilidad estimada: " + fmt(r.f.utilidad), "Productos vendidos: " + r.uds, "Producto estrella: " + (r.est ? r.est.n : "—"),
    "Agotados: " + (r.ago.length ? r.ago.map(p => p.nombre).join(", ") : "ninguno"), "Diferencia de caja: " + fmt(r.dif), "Alertas: " + r.al, "Recomendación: " + r.rec].join("\n");
}
