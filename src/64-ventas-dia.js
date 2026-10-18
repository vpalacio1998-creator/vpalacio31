/* ============ 64 · ventas por día (administrador) ============
   Un calendario que se despliega: cada día muestra cuánto se vendió. Al escoger un día se ve el total, cuántas ventas,
   cómo pagaron, qué productos salieron (y de los conos, qué sabores) y la lista de ventas; cada venta se abre para ver
   el detalle o anularla. Las ventas anuladas no suman, pero se ven en la lista. */
S.vdDia = null; S.vdCal = false; S.vdMes = null;
const vdFecha = () => S.vdDia && S.vdDia <= S.today ? S.vdDia : S.today;
const ventasDelDia = f => ventasAll().filter(v => v.fecha === f).sort((a, b) => b.t - a.t);
const totalesPorDia = () => memo("vdTot", () => { const m = {}; for (const v of ventasOk()) { const x = m[v.fecha] || (m[v.fecha] = {total: 0, n: 0}); x.total += Number(v.total) || 0; x.n++; } return m; });
const montoCorto = n => n >= 1e6 ? fmtN(n / 1e6, 1) + "M" : n >= 1000 ? fmtN(n / 1000, 0) + "k" : fmtN(n, 0);   // cabe en la casilla del día (k = mil pesos)
const diaMes = f => parse(f).toLocaleDateString("es-CO", {day: "numeric", month: "long"});   // "13 de octubre"
const nombreMes = mes => cap1(parse(mes + "-01").toLocaleDateString("es-CO", {month: "long", year: "numeric"}));
const masMes = (mes, n) => { const d = parse(mes + "-01"); d.setMonth(d.getMonth() + n); return ymd(d).slice(0, 7); };

VIEWS.ventas = () => {
  const f = vdFecha(), hoy = f === S.today, ayer = addDays(S.today, -1);
  return cabecera("Ventas por día", "Escoge un día en el calendario y mira qué se vendió.") +
    `<div class="vd-bar">
      <button class="btn ghost vd-flecha" data-act="vdMover" data-v="-1" aria-label="Día anterior">‹</button>
      <button class="btn vd-fecha ${S.vdCal ? "pri" : "ghost"}" data-act="vdCal" aria-expanded="${S.vdCal}" aria-controls="vd-cal">${ic("calendario", 20)}<span><b>${esc(diaLargo(f))}</b>${hoy ? " · hoy" : f === ayer ? " · ayer" : ""}</span><span aria-hidden="true">${S.vdCal ? "▴" : "▾"}</span></button>
      <button class="btn ghost vd-flecha" data-act="vdMover" data-v="1" aria-label="Día siguiente" ${hoy ? "disabled" : ""}>›</button>
    </div>
    <div class="btns vd-r"><button class="btn ghost sm" data-act="vdElegir" data-f="${S.today}" aria-pressed="${hoy}">Hoy</button><button class="btn ghost sm" data-act="vdElegir" data-f="${ayer}" aria-pressed="${f === ayer}">Ayer</button><button class="btn ghost sm" data-act="vdElegir" data-f="${addDays(f, -7)}">Mismo día, semana anterior</button></div>
    ${S.vdCal ? calendarioVentasHTML(f) : ""}${diaVentasHTML(f)}`;
};

function calendarioVentasHTML(sel) {
  const mes = S.vdMes || sel.slice(0, 7), mesHoy = S.today.slice(0, 7), primero = mes + "-01";
  const dias = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate(), hueco = (dowOf(primero) + 6) % 7;   // la semana empieza el lunes
  const tot = totalesPorDia(), delMes = Object.entries(tot).filter(([k]) => k.startsWith(mes + "-")), tope = Math.max(1, ...delMes.map(([, x]) => x.total));
  const corte = (cortesPurga() || {}).ventas, viejo = addDays(S.today, -HIST_DIAS);
  let celdas = "";
  for (let i = 0; i < hueco; i++) celdas += `<span class="vd-d vacio" aria-hidden="true"></span>`;
  for (let d = 1; d <= dias; d++) {
    const f = mes + "-" + String(d).padStart(2, "0"), t = tot[f], fut = f > S.today, fe = festivoDe(f);
    const nivel = t ? Math.max(10, Math.round(t.total / tope * 45)) : 0;
    celdas += `<button class="vd-d${t ? " con" : ""}${f === sel ? " sel" : ""}${f === S.today ? " hoy" : ""}" data-act="vdElegir" data-f="${f}" ${fut ? "disabled" : ""}
      aria-pressed="${f === sel}" aria-label="${esc(diaLargo(f))}: ${t ? fmt(t.total) + ", " + t.n + (t.n === 1 ? " venta" : " ventas") : "sin ventas"}${fe ? ", " + esc(fe.n) : ""}"
      ${t ? `style="--vd-n:${nivel}%"` : ""} title="${fe ? esc(fe.n) : ""}"><b>${d}${fe ? '<i class="vd-fest" aria-hidden="true"></i>' : ""}</b><small>${t ? montoCorto(t.total) : fut ? "" : "–"}</small></button>`;
  }
  const totMes = sum(delMes, ([, x]) => x.total), nMes = sum(delMes, ([, x]) => x.n), diasCon = delMes.length;
  return `<div class="card vd-cal" id="vd-cal">
    <div class="vd-cal-h"><button class="btn ghost sm" data-act="vdMes" data-v="-1" aria-label="Mes anterior">‹</button><b>${esc(nombreMes(mes))}</b><button class="btn ghost sm" data-act="vdMes" data-v="1" aria-label="Mes siguiente" ${mes >= mesHoy ? "disabled" : ""}>›</button></div>
    <div class="vd-grid">${["L", "M", "M", "J", "V", "S", "D"].map((x, i) => `<span class="vd-w" aria-hidden="true" title="${["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"][i]}">${x}</span>`).join("")}${celdas}</div>
    <p class="small muted" style="margin:10px 0 0">${diasCon ? `${esc(nombreMes(mes))}: <b>${fmt(totMes)}</b> en ${nMes} ${nMes === 1 ? "venta" : "ventas"} (${diasCon} ${diasCon === 1 ? "día" : "días"} con ventas).` : "Este mes no tiene ventas guardadas en este equipo."} Toca un día para ver qué se vendió.${corte && mes <= corte.slice(0, 7) ? ` Las ventas antes del ${esc(diaMes(corte))} se borraron (eran de prueba).` : ""}${mes <= viejo.slice(0, 7) ? ` Este equipo guarda los últimos ${HIST_DIAS} días.` : ""}</p>
    <p class="xs muted" style="margin:4px 0 0">k = mil pesos, M = millón; más oscuro = más vendido. <i class="vd-fest" aria-hidden="true"></i> festivo o temporada</p>
  </div>`;
}

function diaVentasHTML(f) {
  const todas = ventasDelDia(f), ok = todas.filter(v => !v.anulada), an = todas.filter(v => v.anulada);
  const corte = (cortesPurga() || {}).ventas;
  if (!todas.length) return `<div class="card">${vacio("calendario", "No hubo ventas este día", corte && f < corte ? "Las ventas antes del " + diaMes(corte) + " se borraron (eran de prueba)." : f < addDays(S.today, -HIST_DIAS) ? "Este equipo guarda los últimos " + HIST_DIAS + " días." : "")}</div>`;
  const total = sum(ok, v => v.total), n = ok.length;
  // por medio de pago
  const pagos = {}; for (const v of ok) { const x = pagos[v.m || "Otro"] || (pagos[v.m || "Otro"] = {t: 0, n: 0, pend: 0}); x.t += Number(v.total) || 0; x.n++; if (v.pend) x.pend++; }
  // qué se vendió (sin anuladas); de los conos, los sabores (en bolas)
  const prods = {};
  for (const v of ok) for (const it of (v.items || [])) {
    const k = it.pid || it.n, x = prods[k] || (prods[k] = {n: it.n, q: 0, t: 0, sab: {}});
    x.q += Number(it.q) || 0; x.t += (Number(it.p) || 0) * (Number(it.q) || 0) - (Number(it.d) || 0);
    if (Array.isArray(it.sab)) for (const s of it.sab) x.sab[s] = (x.sab[s] || 0) + (Number(it.q) || 0);
  }
  const desc = sum(ok, v => v.desc || 0), lista = Object.values(prods).sort((a, b) => b.t - a.t || b.q - a.q), totLineas = sum(lista, x => x.t) || 1;
  const nombreEq = dev => (col("dispositivos")[dev] || {}).nombre || (dev === DEV.id ? DEV.nombre : "") || "";
  pedirNombres(uniq(todas.map(v => v.uid)));
  return `<div class="kpis">
      <div class="kpi main"><span>Vendido</span><b>${fmt(total)}</b><small>${esc(diaCorto(f))}</small></div>
      <div class="kpi"><span>Ventas</span><b>${n}</b><small>${an.length ? an.length + (an.length === 1 ? " anulada (no suma)" : " anuladas (no suman)") : "sin anuladas"}</small></div>
      <div class="kpi"><span>Promedio por venta</span><b>${n ? fmt(total / n) : "–"}</b></div>
      <div class="kpi"><span>Productos vendidos</span><b>${fmtN(sum(lista, x => x.q), 0)}</b><small>unidades</small></div>
    </div>
    <div class="card"><h3>Cómo pagaron</h3>${Object.entries(pagos).sort((a, b) => b[1].t - a[1].t).map(([m, x]) => `<div class="row"><span>${esc(m)} <span class="small muted">· ${x.n} ${x.n === 1 ? "venta" : "ventas"}</span>${x.pend ? ` <span class="pill warn">${x.pend} por confirmar</span>` : ""}</span><b>${fmt(x.t)}</b></div>`).join("")}</div>
    <div class="card"><h3>Qué se vendió</h3>${lista.map(x => { const sab = Object.entries(x.sab).sort((a, b) => b[1] - a[1]);
      return `<div class="row" style="align-items:flex-start"><div class="l" style="flex:1;min-width:0"><b>${fmtN(x.q, 2)} × ${esc(x.n)}</b>${sab.length ? `<div class="small muted">${sab.map(([s, q]) => esc(nombreSabor(s)) + " " + fmtN(q, 0)).join(" · ")} (bolas)</div>` : ""}
        <div class="vd-barra" aria-hidden="true"><i style="width:${Math.max(2, Math.round(x.t / totLineas * 100))}%"></i></div></div><b class="num">${fmt(x.t)}</b></div>`; }).join("")}
      ${desc ? `<div class="row"><span>Descuentos (ya restados arriba)</span><b>${fmt(desc)}</b></div>` : ""}</div>
    <div class="card"><h3>Ventas del día <span class="xs muted">· toca una para ver el detalle o anularla</span></h3>
      ${todas.map(v => `<button class="row" style="width:100%;background:none;border:0;border-bottom:1px solid var(--line);text-align:left;cursor:pointer;font:inherit;color:inherit;${v.anulada ? "opacity:.6" : ""}" data-act="verVenta" data-id="${esc(v.id)}"><div class="l" style="min-width:0"><b>${hora(v.t)} · ${esc(v.num || "")}</b>${v.anulada ? ' <span class="pill bad">Anulada</span>' : ""}<div class="small muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc((v.items || []).map(i => i.q + " " + i.n).join(", "))}</div><div class="xs muted">${esc(v.m || "")}${nombreEq(v.dev) ? " · " + esc(nombreEq(v.dev)) : ""}${nombreDe(v.uid) ? " · " + esc(nombreDe(v.uid)) : ""}</div></div><b class="num" style="${v.anulada ? "text-decoration:line-through" : ""}">${fmt(v.total)}</b></button>`).join("")}</div>`;
}

ACT.vdCal = () => { S.vdCal = !S.vdCal; S.vdMes = vdFecha().slice(0, 7); draw(); };
ACT.vdMes = (el, d) => { const m = masMes(S.vdMes || vdFecha().slice(0, 7), Number(d.v) || 0); if (m > S.today.slice(0, 7)) return; S.vdMes = m; draw(); };
ACT.vdElegir = (el, d) => { const f = d.f; if (!f || f > S.today) return; S.vdDia = f; S.vdMes = f.slice(0, 7); S.vdCal = false; draw(); };   // al escoger, el calendario se recoge
ACT.vdMover = (el, d) => { const f = addDays(vdFecha(), Number(d.v) || 0); if (f > S.today) return; S.vdDia = f; S.vdMes = f.slice(0, 7); draw(); };
