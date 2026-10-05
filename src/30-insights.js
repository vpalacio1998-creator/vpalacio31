/* ============ 30 · inteligencia de negocio ============
   Todo sale de los datos reales (ventas, inventario, costos, caja). Cada recomendación guarda sus números
   en `why` para poder explicarla. Si no hay datos suficientes, se dice y no se inventa precisión. */
const MIN_DIAS = 14;           // días con ventas necesarios para proyectar
const histVentasDia = () => memo("vpd", () => { const m = {}; for (const v of ventasOk()) { const o = m[v.fecha] = m[v.fecha] || {total: 0, n: 0}; o.total += v.total; o.n++; } return m; });
const diasAbiertos = (a, b) => Object.keys(histVentasDia()).filter(d => d >= a && d <= b).sort();
const histInfo = () => memo("hist", () => { const t = S.today, dias = diasAbiertos(addDays(t, -60), addDays(t, -1)); return {dias, n: dias.length, primero: dias[0] || null, ok: dias.length >= MIN_DIAS}; });
const unidadesDia = () => memo("upd", () => { const m = {}; for (const v of ventasOk()) for (const l of lineasExp(v)) { const o = m[l.pid] = m[l.pid] || {}; o[v.fecha] = (o[v.fecha] || 0) + l.q; } return m; });
const unidadesHoy = pid => (unidadesDia()[pid] || {})[S.today] || 0;

/* ---- factor por día de la semana (a nivel tienda) ---- */
function dowFactors() {
  return memo("dowf", () => {
    const t = S.today, dias = diasAbiertos(addDays(t, -56), addDays(t, -1)), by = {};
    for (const d of dias) (by[dowOf(d)] = by[dowOf(d)] || []).push(histVentasDia()[d].total);
    const all = dias.map(d => histVentasDia()[d].total), avg = all.length ? sum(all) / all.length : 0, span = dias.length ? diffDays(t, dias[0]) : 0, f = {}, ok = {}, n = {};
    for (let k = 0; k < 7; k++) { const arr = by[k] || []; n[k] = arr.length; ok[k] = arr.length >= 3; f[k] = ok[k] && avg ? (sum(arr) / arr.length) / avg : (span >= 28 && !arr.length ? 0 : 1); if (span >= 28 && !arr.length) ok[k] = true; }
    return {f, ok, n, avg, by, dias: dias.length};
  });
}
/* ---- promedio diario y tendencia por producto ---- */
function avgDaily(pid, win = 14) { const dias = histInfo().dias.slice(-win); if (dias.length < 3) return null; const u = unidadesDia()[pid] || {}; return sum(dias, d => u[d] || 0) / dias.length; }
function unidadesVent(pid, n, desfase = 0) { const dias = histInfo().dias; const sl = dias.slice(Math.max(0, dias.length - n - desfase), dias.length - desfase); const u = unidadesDia()[pid] || {}; return {u: sum(sl, d => u[d] || 0), dias: sl.length}; }
function tendencia(pid) { const a = unidadesVent(pid, 7, 0), b = unidadesVent(pid, 7, 7); if (a.dias < 7 || b.dias < 7 || b.u < 5) return null; return a.u / b.u; }
const tendTienda = () => memo("tt", () => { const a = sum(histInfo().dias.slice(-7), d => histVentasDia()[d].total), b = sum(histInfo().dias.slice(-14, -7), d => histVentasDia()[d].total); return histInfo().n >= 14 && b > 0 ? a / b : null; });
function demandaDia(pid, fecha, parcial) {
  const base = avgDaily(pid); if (base == null) return null;
  const df = dowFactors(), fac = df.f[dowOf(fecha)] != null ? df.f[dowOf(fecha)] : 1, tp = tendencia(pid), tr = clamp(tp != null ? tp : (tendTienda() != null ? tendTienda() : 1), 0.75, 1.35);
  let d = base * fac * tr; if (parcial) d = Math.max(0, d - unidadesHoy(pid)); return d;
}
function demanda(pid, fechas) { let s = 0; for (const f of fechas) { const d = demandaDia(pid, f, f === S.today); if (d == null) return null; s += d; } return s; }
function fechasHorizonte(k) {
  const t = S.today;
  if (k === "hoy") return [t]; if (k === "3") return [t, addDays(t, 1), addDays(t, 2)]; if (k === "7") return Array.from({length: 7}, (_, i) => addDays(t, i));
  if (k === "finde") { let s = dowOf(t); const sab = s === 6 ? t : s === 0 ? addDays(t, 6) : addDays(t, 6 - s); return [sab, addDays(sab, 1)]; }
  if (k === "custom") { const a = S.desde || t, b = S.hasta || addDays(t, 6), out = []; for (let d = a < t ? t : a; d <= b && out.length < 60; d = addDays(d, 1)) out.push(d); return out.length ? out : [t]; }
  return [t];
}
const HORIZONTES = [["hoy", "Hoy"], ["3", "3 días"], ["7", "Semana"], ["finde", "Fin de semana"], ["custom", "Rango"]];
const comprasPend = () => memo("cpend", () => { const m = {}; for (const c of Object.values(col("compras"))) if (c.estado === "pedido") for (const l of (c.lineas || [])) m[l.pid] = (m[l.pid] || 0) + (l.q || 0); return m; });

/* ---- cuándo se agota ---- */
function agotaEn(pid) {
  const p = prod(pid), st = stockDe(pid); if (st == null || p.controla === false) return null; if (st <= 0) return {dias: 0, fecha: S.today};
  let s = st; for (let i = 0; i < 14; i++) { const f = addDays(S.today, i), d = demandaDia(pid, f, i === 0); if (d == null) return null; s -= d; if (s <= 0) return {dias: i, fecha: f, frac: i === 0}; } return null;
}
const cobertura = pid => { const st = stockDe(pid), a = avgDaily(pid); if (st == null || a == null) return null; return a > 0 ? Math.max(0, st) / a : Infinity; };
function cuandoTxt(f) { const d = diffDays(f, S.today); return d <= 0 ? "hoy" : d === 1 ? "mañana" : d < 7 ? "antes del " + DOW[dowOf(f)] : "en " + d + " días"; }

/* ---- asistente de compras: ¿qué debo pedir? ---- */
function recomendarCompra(fechas) {
  return terminados().filter(p => p.activo !== false && p.controla !== false && !p.combo).map(p => {
    const st = stockDe(p.id), avg = avgDaily(p.id), dem = demanda(p.id, fechas), seg = p.seg || 0, pend = comprasPend()[p.id] || 0, cov = cobertura(p.id), tp = tendencia(p.id);
    const u7 = unidadesVent(p.id, 7);
    const need = dem == null ? null : dem + seg - Math.max(st == null ? 0 : st, 0) - pend;
    let comprar = need == null ? null : Math.max(0, Math.ceil(need)); const pack = p.pack || 1; if (comprar && pack > 1) comprar = Math.ceil(comprar / pack) * pack;
    const ag = agotaEn(p.id), riesgo = st != null && st <= 0 ? "bad" : (ag && ag.dias <= 2) ? "bad" : (ag && ag.dias <= 5) ? "warn" : st != null && st <= (p.min || 0) ? "warn" : "ok";
    return {pid: p.id, p, st, avg, dem, seg, pend, cov, comprar, riesgo, ag, why: {avg, u7: u7.u, dias7: u7.dias, tend: tp, st, cov, dem, seg, pend, comprar, fechas, pack, fac: fechas.map(f => dowFactors().f[dowOf(f)])}};
  }).sort((a, b) => ({bad: 0, warn: 1, ok: 2}[a.riesgo] - {bad: 0, warn: 1, ok: 2}[b.riesgo]) || (b.comprar || 0) - (a.comprar || 0));
}
function explicarCompra(r) {
  const w = r.why, l = [];
  l.push(["Ventas promedio", w.avg == null ? "sin datos" : fmtN(w.avg, 1) + " /día"], ["Ventas últimos 7 días", w.u7 + " unidades"],
    ["Tendencia", w.tend == null ? "sin datos" : (w.tend >= 1 ? "+" : "") + Math.round((w.tend - 1) * 100) + "%"], ["Inventario actual", r.st == null ? "sin contar" : String(Math.max(0, r.st))],
    ["Cobertura", w.cov == null ? "sin datos" : w.cov === Infinity ? "sin ventas" : fmtN(w.cov, 1) + " días"], ["Demanda estimada", w.dem == null ? "sin datos" : fmtN(w.dem, 0)],
    ["Stock de seguridad", String(w.seg)], ["Pedidos por llegar", String(w.pend)], ["Cantidad recomendada", w.comprar == null ? "—" : String(w.comprar)]);
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
    return Object.assign({}, r, {disp, deficit, riesgoF: dem == null ? "sin" : dem + r.seg > disp ? (disp < dem ? "bad" : "warn") : "ok"});
  });
  const ventasEsp = sum(rows, r => (r.dem || 0) * (r.p.precio || 0)), enRiesgo = rows.filter(r => r.riesgoF === "bad" || r.riesgoF === "warn");
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
  for (const p of vendibles()) { const d = demanda(p.id, fechas.map(f => f)); if (d == null) continue; const c = costoActual(p.id); ventas += d * (p.precio || 0); if (c == null) sinCosto += d; else costo += d * c; por.push({p, d}); }
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
  if (pid === "*") { const f = finanzas(a, b); return {precio: f.uds ? f.ventas / f.uds : 0, costo: f.uds ? f.cogs / f.uds : 0, vol: f.uds, gastos: f.gastos || totalFijos()}; }
  const r = rentabilidad(a, b).find(x => x.pid === pid), p = prod(pid); return {precio: p ? p.precio : 0, costo: costoActual(pid) || 0, vol: r ? r.uds : 0, gastos: totalFijos()};
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
      if (Math.abs(ch) >= 0.05 && S.today <= addDays(ymd(new Date(h[h.length - 1].t)), 60)) out.push({p, tipo: ch > 0 ? "sube" : "baja", prev: a, nuevo: b, ch, mPrev: p.precio ? (p.precio - a) / p.precio : NaN, mNuevo: p.precio ? (p.precio - b) / p.precio : NaN, t: h[h.length - 1].t}); }
  }
  for (const p of insumos()) { const c = costos()[p.id], h = (c && c.hist) || []; if (h.length >= 2) { const a = h[h.length - 2].c, b = h[h.length - 1].c, ch = a ? (b - a) / a : 0; if (Math.abs(ch) >= 0.05 && S.today <= addDays(ymd(new Date(h[h.length - 1].t)), 60)) out.push({p, insumo: true, tipo: ch > 0 ? "sube" : "baja", prev: a, nuevo: b, ch, t: h[h.length - 1].t}); } }
  return out.sort((a, b) => b.t - a.t);
}
function difRecetas() { if (!esAdmin()) return []; const out = []; for (const p of terminados()) { const cr = costoReceta(p.id), cu = costoActual(p.id); if (cr != null && cu != null && cu > 0 && Math.abs(cr - cu) / cu >= 0.08) out.push({p, receta: cr, registrado: cu}); } return out; }

/* ---- mermas ---- */
function analisisMermas() {
  const t = S.today, a = firstOfMonth(t), ms = mermasAll().filter(m => m.fecha >= a && m.fecha <= t);
  let costo = 0; for (const m of ms) { const c = costoUnit(m.pid, m.t); if (c != null) costo += c * m.q; }
  const compras = sum(Object.values(col("compras")).filter(c => c.estado === "recibido" && c.fecha >= a), c => sum(c.lineas || [], l => (l.costo || 0) * (l.q || 0)));
  const finMes = finanzas(a, t), baseCmp = compras || finMes.cogs, anormal = [], by = {};
  for (const m of ms) by[m.pid] = (by[m.pid] || 0) + m.q;
  const prev30 = mermasAll().filter(m => m.fecha >= addDays(t, -59) && m.fecha < addDays(t, -29)), pv = {}; prev30.forEach(m => pv[m.pid] = (pv[m.pid] || 0) + m.q);
  const vend = {}; rentabilidad(a, t).forEach(r => vend[r.pid] = r.uds);
  for (const [pid, q] of Object.entries(by)) { const v = vend[pid] || 0, p = prod(pid); if (!p) continue; if (q >= 3 && q / (q + v) >= 0.1) anormal.push({p, q, v, motivo: "Más del 10% de lo que sale se pierde (" + q + " de " + (q + v) + ")."}); else if (q >= 5 && q >= 2 * (pv[pid] || 0.5)) anormal.push({p, q, v, motivo: "Subió a " + q + " este mes (antes " + (pv[pid] || 0) + ")."}); }
  const porMotivo = {}; ms.forEach(m => porMotivo[m.motivo] = (porMotivo[m.motivo] || 0) + m.q);
  return {ms, unidades: sum(ms, m => m.q), costo, pctCompras: baseCmp ? costo / baseCmp : NaN, base: compras ? "compras" : "costo de lo vendido", anormal, porMotivo};
}

/* ---- productos lentos y estrellas ---- */
function productosLentos() {
  return memo("lentos", () => {
    if (!histInfo().ok) return [];
    const rent = {}; rentabilidad(addDays(S.today, -29), S.today).forEach(r => rent[r.pid] = r); const out = [];
    for (const p of terminados().filter(x => x.activo !== false && x.controla !== false && !x.combo)) {
      const st = stockDe(p.id); if (st == null || st <= (p.min || 0)) continue; const u = (rent[p.id] || {}).uds || 0, cov = u > 0 ? st / (u / 30) : Infinity;
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
    const difs = cajasAll().filter(c => c.fecha >= addDays(t, -29) && (c.cierres || []).length && Math.abs((c.cierres.slice(-1)[0] || {}).dif || 0) >= 1000);
    if (difs.length >= 3) out.push({sev: "warn", t: `Se registraron ${difs.length} cierres con diferencias en 30 días.`, d: "Conviene revisar los cierres y el conteo de efectivo.", ir: "cierres"});
    for (const [pid, st] of Object.entries(stockMap())) if (st != null && st < 0) out.push({sev: "bad", t: `El inventario de ${(prod(pid) || {}).nombre || pid} quedó negativo (${st}).`, d: "Puede ser un conflicto entre dispositivos o un conteo desactualizado. Haz un conteo.", ir: "inventario"});
    return out;
  });
}
const enMin = t => Math.max(0, Math.round((Date.now() - t) / 60000));
const haceTxt = t => { const m = enMin(t); return m < 1 ? "hace segundos" : m < 60 ? "hace " + m + " min" : m < 1440 ? "hace " + Math.round(m / 60) + " h" : "hace " + Math.round(m / 1440) + " d"; };
function dispositivosEstado() {
  const now = Date.now(); return Object.values(col("dispositivos")).map(d => { const dt = now - (d.vis || 0), on = dt < 100000, mine = d.dev === DEV.id; return Object.assign({}, d, {online: mine ? SYNC.online : on, hace: dt, mine, pendMios: mine ? ventasPendientes() : d.ventasPend}); }).sort((a, b) => b.vis - a.vis);
}

/* ---- alertas unificadas (cada rol ve lo que le corresponde) ---- */
function alertas() {
  return memo("alertas:" + (DS.isAdmin ? "a" : "e"), () => {
    const out = [], adm = esAdmin();
    for (const r of riesgosStock()) out.push({sev: r.sev, tipo: "inventario", t: r.t, d: r.d, tab: "inventario", pid: r.pid});
    for (const r of riesgosInsumos()) out.push({sev: r.sev, tipo: "inventario", t: r.t, d: r.d, tab: "inventario", pid: r.pid});
    const pend = ventasOk().filter(v => v.pend).length; if (pend) out.push({sev: "warn", tipo: "caja", t: pend + (pend === 1 ? " pago digital por confirmar." : " pagos digitales por confirmar."), d: "Verifica que llegó el dinero.", tab: "caja"});
    const c = cajaHoy(); if (c && cajaEstado(c) === "cerrada") { const ci = c.cierres.slice(-1)[0]; if (ci && Math.abs(ci.dif) >= 1) out.push({sev: "warn", tipo: "caja", t: "Diferencia de caja de " + fmt(ci.dif) + " en " + (col("dispositivos")[c.dev] || {nombre: "la caja"}).nombre + ".", d: ci.obs ? "Observación: " + ci.obs : "Sin observación.", tab: "caja"}); }
    if (SYNC.rechazadas) out.push({sev: "bad", tipo: "sync", t: SYNC.rechazadas + " operación(es) no se pudieron sincronizar.", d: "El servidor las rechazó; quedan guardadas en este dispositivo.", tab: "ajustes"});
    if (adm) {
      for (const a of anomalias()) out.push({sev: a.sev, tipo: "anomalia", t: a.t, d: a.d, tab: a.ir === "hoy" ? "hoy" : a.ir === "compras" ? "compras" : a.ir === "inventario" ? "inventario" : a.ir === "cierres" ? "reportes" : "reportes", anom: true});
      for (const a of alertasCostos()) out.push({sev: a.tipo === "sube" ? "warn" : "ok", tipo: "costo", t: (a.insumo ? "El costo de " : "El costo de ") + a.p.nombre + (a.tipo === "sube" ? " aumentó " : " bajó ") + Math.round(Math.abs(a.ch) * 100) + "%.", d: a.insumo ? "Costo anterior " + fmt(a.prev) + ", nuevo " + fmt(a.nuevo) + ". Revisa precio o receta." : "Margen de " + pct(a.mPrev) + " a " + pct(a.mNuevo) + ". Revisa precio o receta.", tab: "productos", pid: a.p.id});
      const cp = Object.values(col("compras")).filter(x => x.estado === "pedido"); if (cp.length) out.push({sev: "ok", tipo: "compra", t: cp.length + (cp.length === 1 ? " compra pendiente por recibir." : " compras pendientes por recibir."), d: "Registra la llegada para actualizar el inventario.", tab: "compras"});
      const ta = dispositivosEstado().filter(d => !d.mine && !d.online && d.hace > 10 * 60000 && d.hace < 12 * 3600000);
      for (const d of ta) { const cj = cajaDe(S.today, d.dev); if (cj && cajaEstado(cj) === "abierta") out.push({sev: "warn", tipo: "sync", t: d.nombre + " lleva " + Math.round(d.hace / 60000) + " minutos sin sincronizar.", d: "Puede estar sin Internet. Sus ventas aparecerán cuando se reconecte.", tab: "equipo"}); }
      const rd = recomendarPrecios(); if (rd.length) out.push({sev: "ok", tipo: "oportunidad", t: rd.length + (rd.length === 1 ? " producto con margen mejorable." : " productos con margen mejorable."), d: "Revisa las recomendaciones de precio.", tab: "analisis"});
    }
    const rank = {bad: 0, warn: 1, ok: 2}; return out.sort((a, b) => rank[a.sev] - rank[b.sev]);
  });
}

/* ---- ¿qué debería hacer hoy? (centro de decisiones) ---- */
function decisionesHoy() {
  return memo("decisiones", () => {
    const urg = [], imp = [], opo = [], t = S.today;
    for (const r of riesgosStock()) { const p = prod(r.pid); const rec = recomendarCompra(fechasHorizonte("3")).find(x => x.pid === r.pid);
      const acc = rec && rec.comprar ? "Comprar " + rec.comprar + " de " + p.nombre + "." : r.t; (r.sev === "bad" ? urg : imp).push({t: acc, d: r.d, tab: "compras"}); }
    for (const r of riesgosInsumos()) (r.sev === "bad" ? urg : imp).push({t: "Reponer " + prod(r.pid).nombre + ".", d: r.d, tab: "compras"});
    const ayer = addDays(t, -1); for (const c of cajasAll().filter(c => c.fecha === ayer && c.apertura && cajaEstado(c) !== "cerrada")) urg.push({t: "Cerrar la caja de ayer (" + ((col("dispositivos")[c.dev] || {}).nombre || "caja") + ").", d: "Quedó abierta.", tab: "caja"});
    for (const c of cajasAll().filter(c => c.fecha >= addDays(t, -1) && (c.cierres || []).length)) { const ci = c.cierres.slice(-1)[0]; if (Math.abs(ci.dif) >= 1000) urg.push({t: "Revisar diferencia de caja de " + fmt(ci.dif) + ".", d: ci.obs || "Sin observación.", tab: "reportes"}); }
    for (const a of anomalias().filter(x => x.sev === "bad")) urg.push({t: a.t, d: a.d, tab: "inventario"});
    const cp = Object.values(col("compras")).filter(c => c.estado === "pedido"); if (cp.length) imp.push({t: "Registrar llegada de " + cp.length + (cp.length === 1 ? " pedido." : " pedidos."), d: "Así el inventario queda al día.", tab: "compras"});
    const pend = ventasOk().filter(v => v.pend).length; if (pend) imp.push({t: "Confirmar " + pend + " pagos digitales.", d: "Verifica que llegaron al banco.", tab: "caja"});
    for (const a of alertasCostos().filter(x => x.tipo === "sube").slice(0, 2)) imp.push({t: "Revisar el costo de " + a.p.nombre + ": subió " + Math.round(a.ch * 100) + "%.", d: "Margen " + pct(a.mPrev) + " → " + pct(a.mNuevo) + ".", tab: "productos"});
    const dw = dowOf(t); if (dw >= 3 && dw <= 5 && histInfo().ok) { const pf = prepararFinde(); if (pf.enRiesgo.length) imp.push({t: "Preparar producción para el fin de semana.", d: pf.enRiesgo.length + " productos presentan riesgo de agotamiento.", tab: "compras"}); else opo.push({t: "Fin de semana: inventario cubre la demanda esperada.", d: "Ventas esperadas ~" + fmt(pf.ventasEsp) + ".", tab: "compras"}); }
    const rp = recomendarPrecios()[0]; if (rp) opo.push({t: "Evaluar el margen de " + rp.p.nombre + ".", d: "Hoy deja " + pct(rp.margen) + "; con " + fmt(rp.nuevo) + " llegaría a " + pct(rp.margenNuevo) + ".", tab: "analisis"});
    const pl = productosLentos()[0]; if (pl) opo.push({t: "Comprar menos " + pl.p.nombre + ".", d: "Inventario para " + (pl.cov === Infinity ? "mucho tiempo" : Math.round(pl.cov) + " días") + " con ventas de " + pl.u30 + " en 30 días.", tab: "analisis"});
    const dr = difRecetas()[0]; if (dr) opo.push({t: "Revisar la receta de " + dr.p.nombre + ".", d: "Receta " + fmt(dr.receta) + " vs costo registrado " + fmt(dr.registrado) + ".", tab: "productos"});
    return {urgente: urg.slice(0, 3), importante: imp.slice(0, 3), oportunidad: opo.slice(0, 2)};
  });
}

/* ---- resumen del día ---- */
function resumenDia(fecha = S.today) {
  const f = finanzas(fecha, fecha), rent = rentabilidad(fecha, fecha).sort((a, b) => b.uds - a.uds), est = rent[0], ago = prods().filter(p => p.activo !== false && p.controla !== false && estadoProd(p).k === "agotado");
  const cajas = cajasAll().filter(c => c.fecha === fecha && (c.cierres || []).length), dif = sum(cajas, c => c.cierres.slice(-1)[0].dif || 0), al = alertas().length;
  const rec = recomendarCompra(fechasHorizonte("finde")).filter(r => r.comprar > 0 && r.riesgo !== "ok").slice(0, 2);
  const recTxt = rec.length ? "Comprar " + rec.map(r => r.comprar + " " + r.p.nombre.replace(/^Paleta /, "")).join(" y ") + " antes del " + DOW[6] + "." : (ago.length ? "Reponer " + ago.map(p => p.nombre).slice(0, 2).join(" y ") + "." : "Todo en orden. Sigue así.");
  return {f, fecha, uds: sum(rent, r => r.uds), est, ago, dif, al, rec: recTxt, txt: ""};
}
function resumenTexto(r) {
  return ["OLI · " + diaLargo(r.fecha), "Ventas: " + fmt(r.f.ventas), "Utilidad estimada: " + fmt(r.f.utilidad), "Productos vendidos: " + r.uds, "Producto estrella: " + (r.est ? r.est.n : "—"),
    "Agotados: " + (r.ago.length ? r.ago.map(p => p.nombre).join(", ") : "ninguno"), "Diferencia de caja: " + fmt(r.dif), "Alertas: " + r.al, "Recomendación: " + r.rec].join("\n");
}
