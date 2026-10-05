/* ============ 35 · datos del Centro de Comando ============
   Todo se calcula con ventas reales. Cuando faltan datos se dice, no se inventa. */
const minDelDia = t => { const d = new Date(t); return d.getHours() * 60 + d.getMinutes(); };
const ahoraMin = () => minDelDia(Date.now());
const ventasDiaTot = f => (histVentasDia()[f] || {total: 0}).total;
function ventasHasta(fecha, minCorte) { return sum(ventasOk().filter(v => v.fecha === fecha && minDelDia(v.t) <= minCorte), v => v.total); }
function diasSimilares(n = 8) { const t = S.today, out = []; for (let i = 1; i <= 12 && out.length < n; i++) { const f = addDays(t, -7 * i); if (ventasDiaTot(f) > 0) out.push(f); } return out; }
const MODOS_COMP = [["dow", "mismo día"], ["ayer", "ayer"], ["7", "prom. 7 días"], ["30", "prom. 30 días"]];
function comparacion(modo) {
  const t = S.today, m = ahoraMin(), actual = ventasHasta(t, m);
  let fs = [], et = "";
  if (modo === "ayer") { fs = ventasDiaTot(addDays(t, -1)) > 0 ? [addDays(t, -1)] : []; et = "ayer a esta hora"; }
  else if (modo === "dow") { fs = diasSimilares(6); et = fs.length ? "el promedio de los últimos " + fs.length + " " + DOW[dowOf(t)] + (DOW[dowOf(t)].endsWith("s") ? "" : "s") + " a esta hora" : ""; }
  else { const n = Number(modo) || 7; fs = diasAbiertos(addDays(t, -n), addDays(t, -1)); et = "el promedio de los últimos " + fs.length + " días a esta hora"; }
  if (!fs.length) return {actual, base: null, delta: null, et, n: 0};
  const base = sum(fs, f => ventasHasta(f, m)) / fs.length;
  return {actual, base, delta: base > 0 ? actual / base - 1 : null, et, n: fs.length};
}
function estimarCierre() {
  const t = S.today, m = ahoraMin(), actual = ventasHasta(t, m), fs = diasSimilares(10), falta = {ok: false, motivo: "Todavía no hay suficientes datos para generar una estimación confiable."};
  if (fs.length < 3 || actual <= 0) return falta;
  const ratios = fs.map(f => { const tot = ventasDiaTot(f), parc = ventasHasta(f, m); return parc > 0 && parc / tot >= 0.15 ? tot / parc : null; }).filter(x => x != null).sort((a, b) => a - b);
  if (ratios.length < 3) return Object.assign({}, falta, {motivo: "Es temprano para estimar el cierre con confianza. Se activa cuando haya ventas suficientes del día."});
  const q = p => ratios[clamp(Math.round((ratios.length - 1) * p), 0, ratios.length - 1)], lo = Math.max(actual, actual * q(.25)), hi = Math.max(actual, actual * q(.75)), med = Math.max(actual, actual * q(.5));
  return {ok: true, est: med, lo, hi, n: ratios.length};
}
function ritmoHora() { const t60 = Date.now() - 3600000; const vs = ventasOk().filter(v => v.t >= t60); return {total: sum(vs, v => v.total), n: vs.length, ult10: ventasOk().filter(v => v.t >= Date.now() - 600000).length}; }
function metaHoy() {
  const m = configNeg().metaDia; if (m > 0) return {meta: m, origen: "definida por ti"};
  const fs = diasSimilares(6); if (fs.length < 3) return null; const prom = sum(fs, f => ventasDiaTot(f)) / fs.length;
  return {meta: Math.round(prom * 1.05 / 10000) * 10000, origen: "sugerida: promedio de los últimos " + fs.length + " " + DOW[dowOf(S.today)] + "s + 5%"};
}
function horasProx() {
  const fs = diasSimilares(8); if (fs.length < 3) return null; const h0 = new Date().getHours(), hs = new Array(24).fill(0);
  for (const f of fs) for (const v of ventasOk().filter(x => x.fecha === f)) hs[horaDe(v.t)] += v.total / fs.length;
  const act = hs.filter(x => x > 0), med = act.length ? sum(act) / act.length : 0; if (!med) return null;
  return [h0 + 1, h0 + 2].filter(h => h < 24).map(h => ({h, v: hs[h], nivel: hs[h] === 0 ? "cerrado" : hs[h] > med * 1.25 ? "alta" : hs[h] < med * 0.75 ? "baja" : "moderada"}));
}
const fHora = h => { const x = h % 12 || 12; return x + ":00 " + (h < 12 ? "AM" : "PM"); };

/* ---- agotamiento en horas (más fino que por días) ---- */
function consumoHora(pid) {
  const ult = ventasOk().filter(v => v.t >= Date.now() - 90 * 60000), u = sum(ult, v => sum(lineasExp(v).filter(l => l.pid === pid), l => l.q));
  if (u >= 3) return u / 1.5; const hoy = unidadesHoy(pid), primera = ventasOk().find(v => v.fecha === S.today); if (!primera || hoy < 3) return null;
  return hoy / Math.max(1, (Date.now() - primera.t) / 3600000);
}
function riesgoHoras() {
  const out = [], cierre = (function () { const hs = (patrones().horas || []); let ult = 20; for (let h = 23; h >= 0; h--) if (hs[h] > 0) { ult = h; break; } return ult + 1; })();
  const hNow = new Date().getHours() + new Date().getMinutes() / 60;
  for (const p of terminados().filter(x => x.activo !== false && x.controla !== false && !x.combo)) {
    const st = stockDe(p.id); if (st == null || st <= 0) continue; const r = consumoHora(p.id); if (!r || r < 1) continue; const hr = st / r;
    if (hNow + hr < cierre && hr <= 4) { const cuando = new Date(Date.now() + hr * 3600000), rec = Math.max(1, Math.ceil(r * Math.max(2, cierre - hNow) + (p.seg || 0) - st));
      out.push({p, st, r, horas: hr, hora: cuando, rec}); }
  }
  return out.sort((a, b) => a.horas - b.horas);
}

/* ---- ventas que se pierden por falta de inventario ---- */
const demandaPerdidaAll = () => memo("dperd", () => { const o = []; for (const d of Object.values(col("demandaperdida"))) for (const x of (d.items || [])) o.push(Object.assign({fecha: d.fecha, dev: d.dev}, x)); return o; });
function ventasPerdidas(fecha = S.today) {
  const por = {}; for (const x of demandaPerdidaAll()) if (x.fecha === fecha) por[x.pid] = (por[x.pid] || 0) + 1;
  const rows = Object.entries(por).map(([pid, n]) => ({p: prod(pid), n, valor: n * ((prod(pid) || {}).precio || 0)})).filter(r => r.p).sort((a, b) => b.n - a.n);
  return {rows, n: sum(rows, r => r.n), valor: sum(rows, r => r.valor)};
}
async function anotarDemandaPerdida(pid) {
  const id = cajaId(S.today), cur = col("demandaperdida")[id] || {fecha: S.today, dev: DEV.id, items: []};
  await put("demandaperdida", id, Object.assign({}, cur, {items: cur.items.concat([{id: newId(), t: Date.now(), pid, uid: uidActual()}])}));
}

/* ---- equipo y dispositivos ---- */
function equipoAhora() {
  const hoy = ventasOk().filter(v => v.fecha === S.today), out = [];
  for (const d of dispositivosEstado()) { const c = cajaDe(S.today, d.dev), vs = hoy.filter(v => v.dev === d.dev); if (!c && !vs.length && d.hace > 12 * 3600000) continue;
    out.push({d, uid: d.uid, caja: c ? cajaEstado(c) : "sin", n: vs.length, total: sum(vs, v => v.total)}); }
  return out;
}

/* ---- preparación y producción ---- */
function preparacion(fecha) {
  fecha = fecha || addDays(S.today, 1);
  const rows = [], ins = {};
  for (const p of terminados().filter(x => x.activo !== false && x.controla !== false && !x.combo)) {
    const dem = demandaDia(p.id, fecha, false), st = stockDe(p.id); if (dem == null) continue;
    const rec = Math.max(0, Math.ceil(dem + (p.seg || 0) - Math.max(st == null ? 0 : st, 0))); if (rec <= 0) continue;
    const r = col("recetas")[p.id], det = []; let maxProd = null;
    if (r) for (const l of r.lineas) { const per = l.q / (r.rinde || 1), x = prod(l.iid), s = stockDe(l.iid); det.push({iid: l.iid, n: x ? x.nombre : l.iid, u: x ? x.unidad : "", need: per * rec, s}); ins[l.iid] = ins[l.iid] || {n: x ? x.nombre : l.iid, u: x ? x.unidad : "", need: 0, s}; ins[l.iid].need += per * rec; if (s != null && per > 0) maxProd = Math.min(maxProd == null ? Infinity : maxProd, Math.floor(Math.max(0, s) / per)); }
    rows.push({p, dem, st, rec, receta: !!r, det, maxProd: maxProd === Infinity ? null : maxProd, falta: maxProd != null && maxProd < rec});
  }
  const insRows = Object.entries(ins).map(([iid, x]) => Object.assign({iid}, x, {falta: x.s != null && x.s < x.need})).sort((a, b) => (b.falta - a.falta) || b.need - a.need);
  return {fecha, rows: rows.sort((a, b) => b.rec - a.rec), insumos: insRows, cuellos: insRows.filter(i => i.falta)};
}
function compraResumen() {
  const rec = recomendarCompra(fechasHorizonte("3")).filter(r => r.comprar > 0 && r.riesgo !== "ok" || (r.comprar > 0 && r.st != null && r.st <= (r.p.min || 0)));
  const costo = sum(rec, r => (costoActual(r.pid) || 0) * r.comprar);
  return {rows: rec, total: sum(rec, r => r.comprar), costo, sinCosto: rec.filter(r => costoActual(r.pid) == null).length};
}
function finDeSemanaRelevante() { const d = dowOf(S.today); return d >= 3 || d === 0; }       // jueves a domingo
function problematico() {
  const out = [], t = S.today, lent = productosLentos()[0], mer = analisisMermas().anormal[0], rp = recomendarPrecios()[0], ca = alertasCostos().find(a => a.tipo === "sube" && !a.insumo);
  if (lent) out.push({sev: 2, p: lent.p, txt: `${lent.p.nombre} tiene ${lent.st} unidades en inventario y solo ha vendido ${lent.u30} en 30 días.`, extra: (costoActual(lent.p.id) != null ? "Capital inmovilizado estimado: " + fmt(lent.st * costoActual(lent.p.id)) + "." : ""), tag: "Baja rotación"});
  if (mer) out.push({sev: 3, p: mer.p, txt: `${mer.p.nombre} tiene merma alta: ${mer.motivo}`, extra: "", tag: "Merma"});
  if (ca) out.push({sev: 3, p: ca.p, txt: `El costo de ${ca.p.nombre} subió ${Math.round(ca.ch * 100)}% y el margen pasó de ${pct(ca.mPrev)} a ${pct(ca.mNuevo)}.`, extra: "", tag: "Costo creciente"});
  if (rp && rp.margen < 0.45) out.push({sev: 2, p: rp.p, txt: `${rp.p.nombre} deja un margen de solo ${pct(rp.margen)}.`, extra: "Con " + fmt(rp.nuevo) + " llegaría a " + pct(rp.margenNuevo) + ".", tag: "Margen bajo"});
  return out.sort((a, b) => b.sev - a.sev)[0] || null;
}
function oportunidades() {
  const out = [], e = estrellas(), lent = productosLentos()[0];
  if (e && e.masV) { const p = prod(e.masV.pid), c = costoActual(e.masV.pid); if (p && c != null && p.precio && (p.precio - c) / p.precio >= 0.5) out.push({t: `${p.nombre} tiene alta demanda y margen de ${pct((p.precio - c) / p.precio)}.`, d: "Aumentar la disponibilidad podría aumentar las ventas.", tab: "analisis"}); }
  if (lent) out.push({t: `${lent.p.nombre} tiene inventario alto (${lent.st}).`, d: "Una promoción podría acelerar la rotación.", tab: "analisis"});
  const rp = recomendarPrecios()[0]; if (rp && out.length < 3) out.push({t: `${rp.p.nombre} podría mejorar su margen de ${pct(rp.margen)} a ${pct(rp.margenNuevo)}.`, d: "Revisa la recomendación de precio. OLI no cambia precios solo.", tab: "analisis"});
  return out.slice(0, 3);
}
function margenSemana() { const t = S.today, a = finanzas(addDays(t, -6), t), b = finanzas(addDays(t, -13), addDays(t, -7)); return a.ventas && b.ventas ? {a: a.margenBruto, b: b.margenBruto} : null; }

/* ---- estado general y frases generadas con los datos ---- */
function estadoGeneral() {
  return memo("estadoG", () => {
    const al = alertas(), bad = al.filter(a => a.sev === "bad"), warn = al.filter(a => a.sev === "warn"), cmp = comparacion("dow").delta != null ? comparacion("dow") : comparacion("7"), rh = riesgoHoras()[0];
    const hoyV = ventasDiaTot(S.today); let ventasTxt;
    if (!hoyV) ventasTxt = ahoraMin() < 11 * 60 ? "Todavía no hay ventas hoy" : "Hoy todavía no se han registrado ventas";
    else if (cmp.delta == null) ventasTxt = "Llevas " + fmt(hoyV) + " vendidos hoy (aún no hay historia suficiente para comparar)";
    else if (Math.abs(cmp.delta) < 0.05) ventasTxt = "Las ventas van en línea con lo normal"; else ventasTxt = `Las ventas van ${Math.round(Math.abs(cmp.delta) * 100)}% ${cmp.delta > 0 ? "por encima" : "por debajo"} del promedio`;
    const riesgo = rh ? `${rh.p.nombre} podría agotarse antes de las ${hora(rh.hora)}` : bad.find(a => a.tipo === "inventario") ? bad.find(a => a.tipo === "inventario").t.replace(/\.$/, "") : null;
    const nivel = bad.length ? "bad" : (warn.length || rh) ? "warn" : "ok";
    const titulo = nivel === "ok" ? "OLI ESTÁ EN ORDEN" : nivel === "warn" ? "OLI REQUIERE ATENCIÓN" : "HAY PROBLEMAS IMPORTANTES";
    const linea = nivel === "ok" ? ventasTxt + ". Caja y inventario sin novedades." : ventasTxt + (riesgo ? ", pero " + riesgo : (warn[0] || bad[0] ? ". " + (bad[0] || warn[0]).t : ".")) + (riesgo && !riesgo.endsWith(".") ? "." : "");
    return {nivel, titulo, linea, bad, warn, cmp, rh};
  });
}
function resumenInteligente() {
  const e = estadoGeneral(), est = rentabilidad(S.today, S.today).sort((a, b) => b.uds - a.uds), c = cajaHoy(), parts = [];
  const cmp = e.cmp; if (!ventasDiaTot(S.today)) parts.push("Todavía no hay ventas registradas hoy."); else if (cmp.delta != null) parts.push(Math.abs(cmp.delta) < 0.05 ? "Hoy OLI vende en línea con lo habitual." : `Hoy OLI está vendiendo ${cmp.delta > 0 ? "por encima" : "por debajo"} del promedio.`);
  if (est.length >= 2) parts.push(`${est[0].n.replace(/^Paleta /, "")} y ${est[1].n.replace(/^Paleta /, "")} lideran las ventas.`); else if (est.length === 1) parts.push(`${est[0].n.replace(/^Paleta /, "")} lidera las ventas.`);
  if (e.rh) parts.push(`${e.rh.p.nombre.replace(/^Paleta /, "")} presenta riesgo de agotamiento antes del cierre.`); else { const r = riesgosStock()[0]; if (r) parts.push(r.t); }
  const cajas = cajasAll().filter(x => x.fecha === S.today); if (cajas.some(x => (x.cierres || []).length && Math.abs(x.cierres.slice(-1)[0].dif) >= 1)) parts.push("Hay una diferencia de caja por revisar."); else if (cajas.length) parts.push("La caja está cuadrada.");
  const pri = e.rh ? `reponer ${e.rh.p.nombre.replace(/^Paleta /, "")}` : (decisionesHoy().urgente[0] ? decisionesHoy().urgente[0].t.replace(/\.$/, "").toLowerCase() : null);
  parts.push(pri ? `La prioridad es ${pri}.` : "No hay prioridades urgentes.");
  return parts.join(" ");
}
function avisos() {
  const out = [], e = estadoGeneral();
  if (e.cmp && e.cmp.delta != null && Math.abs(e.cmp.delta) >= 0.05) out.push(`Hoy estás vendiendo ${Math.round(Math.abs(e.cmp.delta) * 100)}% ${e.cmp.delta > 0 ? "más" : "menos"} que ${e.cmp.et}.`);
  if (e.rh) out.push(`${e.rh.p.nombre} se agotará pronto.`);
  const cr = compraResumen(); if (cr.rows.length) out.push(`Hay ${cr.rows.length} compras recomendadas.`);
  const ms = margenSemana(); if (ms && Math.abs(ms.a - ms.b) >= 0.01) out.push(`Tu margen ${ms.a > ms.b ? "mejoró" : "bajó"} ${fmtN(Math.abs(ms.a - ms.b) * 100, 1)} puntos frente a la semana anterior.`);
  const lent = productosLentos()[0]; if (lent) out.push(`${lent.p.nombre} tiene baja rotación (${lent.u30} vendidas en 30 días).`);
  return out.slice(0, 4);
}
const hoyTareas = () => { const d = decisionesHoy(); return {urg: d.urgente.length, imp: d.importante.length, opo: d.oportunidad.length}; };
