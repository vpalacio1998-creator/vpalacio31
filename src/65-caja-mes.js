/* ============ 65 · caja: acumulado del mes (administrador) ============
   En Caja, además de "Hoy", el administrador ve el mes acumulado: lo vendido, los gastos (los de Dinero y los pagados desde
   la caja), las devoluciones y lo que faltó o sobró al cerrar caja, día por día y acumulado. Usa las mismas reglas que
   "¿Cuánta plata hay?" (74-liquidez) para que los dos números cuadren. La utilidad con el costo de lo vendido está en Dinero → Mes. */
S.cajaVista = "hoy"; S.cajaMes = null;
const vistaCajaSeg = () => `<div class="seg" role="group" aria-label="Qué ver" style="margin-bottom:14px"><button data-act="cajaVista" data-v="hoy" aria-pressed="${S.cajaVista !== "mes"}">Hoy</button><button data-act="cajaVista" data-v="mes" aria-pressed="${S.cajaVista === "mes"}">Acumulado del mes</button></div>`;
const mesCaja = () => S.cajaMes && S.cajaMes <= S.today.slice(0, 7) ? S.cajaMes : S.today.slice(0, 7);
const primerMesDatos = () => { const fs = ventasOk().map(v => v.fecha).concat(cajasAll().map(c => c.fecha), Object.values(col("gastos")).map(g => g && g.fecha)).filter(Boolean).sort(); return (fs[0] || S.today).slice(0, 7); };

function resumenMes(mes) {
  const a = mes + "-01", fin = lastOfMonth(a), b = fin < S.today ? fin : S.today, en = f => !!f && f >= a && f <= b;
  const L = liquidez({a, b}), dias = {}, dia = f => dias[f] || (dias[f] = {f, vendido: 0, n: 0, gastos: 0, devol: 0, dif: 0, sinAnotar: 0, cajas: 0, abiertas: 0, cerradas: 0});
  const porMedio = {}, porCat = {};
  for (const v of ventasOk()) if (en(v.fecha)) { const d = dia(v.fecha), x = Number(v.total) || 0; d.vendido += x; d.n++; porMedio[v.m || "Otro"] = (porMedio[v.m || "Otro"] || 0) + x; }
  for (const g of gastosEn(a, b)) { const x = Number(g.valor) || 0; dia(g.fecha).gastos += x; porCat[g.cat || "Otros"] = (porCat[g.cat || "Otros"] || 0) + x; }
  const sinCerrar = []; let cerradas = 0;
  for (const c of cajasAll()) if (en(c.fecha)) {
    const d = dia(c.fecha);
    if (c.apertura) { d.cajas++; if (cajaEstado(c) === "abierta") { d.abiertas++; if (c.fecha < S.today) sinCerrar.push(c); } }
    for (const mv of (c.movs || [])) if (mv.tipo === "retiro" && empiezaCon(mv.motivo, "Devolución a cliente")) d.devol += Number(mv.monto) || 0;
    const ci = (c.cierres || []).slice(-1)[0];   // misma regla que la liquidez: un faltante por "Gasto sin anotar" se resta cuando se anota el gasto
    if (ci && c.apertura && cajaEstado(c) === "cerrada") { const x = Number(ci.dif) || 0; d.cerradas++; cerradas++;
      if (x < 0 && empiezaCon(ci.obs, "Gasto sin anotar")) d.sinAnotar -= x; else if (x) d.dif += x; }
  }
  let acum = 0;
  const filas = Object.values(dias).sort((x, y) => x.f.localeCompare(y.f)).map(d => { const neto = d.vendido - d.gastos - d.devol + d.dif; acum += neto; return Object.assign(d, {neto, acum}); });
  return {a, b, L, filas, porMedio, porCat, sinCerrar, cerradas, incompleto: DS.mode === "db" && a < addDays(S.today, -HIST_DIAS)};
}

function cajaMesHTML() {
  const mes = mesCaja(), R = resumenMes(mes), L = R.L, completo = R.b === lastOfMonth(R.a);
  const plata = v => (v < 0 ? "− " : "") + fmt(Math.abs(v)), plural = (n, uno, varios) => n + " " + (n === 1 ? uno : varios);
  const fila = (txt, sub, v) => `<div class="row"><div class="l">${txt}${sub ? `<div class="small muted">${sub}</div>` : ""}</div><div class="r">${plata(v)}</div></div>`;
  const medios = Object.entries(R.porMedio).sort((x, y) => y[1] - x[1]), cats = Object.entries(R.porCat).sort((x, y) => y[1] - x[1]);
  const nombreEq = c => c.devNombre || (col("dispositivos")[c.dev] || {}).nombre || "Caja";
  return `<div class="cm-nav"><button class="btn ghost sm" data-act="cajaMesMover" data-v="-1" aria-label="Mes anterior" ${mes <= primerMesDatos() ? "disabled" : ""}>‹</button>
      <div><b>${esc(nombreMes(mes))}</b><div class="small muted">${completo ? "Todo el mes" : "Del 1 al " + parse(R.b).getDate() + " (hoy)"}</div></div>
      <button class="btn ghost sm" data-act="cajaMesMover" data-v="1" aria-label="Mes siguiente" ${mes >= S.today.slice(0, 7) ? "disabled" : ""}>›</button></div>
    ${R.incompleto ? `<div class="notice bad" style="margin-bottom:12px">Este equipo guarda los últimos ${HIST_DIAS} días: de este mes puede faltar información.</div>` : ""}
    ${!R.filas.length ? `<div class="card">${vacio("caja", "No hay movimientos este mes", "")}</div>` : `
    <div class="kpis">
      <div class="kpi main"><span>Vendido menos gastos</span><b>${plata(L.total)}</b><small>Efectivo ${plata(L.efectivo)} · cuentas ${plata(L.cuentas)}</small></div>
      <div class="kpi"><span>Vendido</span><b>${fmt(L.ventas)}</b><small>${plural(L.nV, "venta", "ventas")}, sin anuladas</small></div>
      <div class="kpi"><span>Gastos</span><b>${fmt(L.gastos)}</b><small>${plural(L.nG, "gasto", "gastos")}, también los pagados desde la caja</small></div>
      <div class="kpi${L.difs < 0 ? " neg" : ""}"><span>${L.difs < 0 ? "Faltó al cerrar caja" : L.difs > 0 ? "Sobró al cerrar caja" : "Cierres de caja"}</span><b>${plata(L.difs)}</b><small>${L.nDifs ? plural(L.nDifs, "cierre", "cierres") + " con diferencia" : !R.cerradas ? "Ninguna caja cerrada" : L.sinAnotar ? "" : "Todo cuadró"}${L.sinAnotar ? (L.nDifs ? " · " : "") + "faltó " + fmt(L.sinAnotar) + " por gastos sin anotar" : ""}</small></div>
    </div>
    ${R.sinCerrar.length ? `<div class="notice bad" style="margin-bottom:12px"><b>${R.sinCerrar.length === 1 ? "Una caja quedó sin cerrar" : R.sinCerrar.length + " cajas quedaron sin cerrar"}:</b> ${esc(R.sinCerrar.map(c => nombreEq(c) + " (" + diaCorto(c.fecha) + ")").join(", "))}. Ciérrenla en ese equipo para que su efectivo y su diferencia entren en la cuenta.</div>` : ""}
    <div class="two">
      <div class="card"><h3>Cómo pagaron</h3>${medios.map(([m, v]) => fila(esc(m), "", v)).join("")}</div>
      <div class="card"><h3>En qué se gastó</h3>${cats.length ? cats.map(([c, v]) => fila(esc(c), "", v)).join("") : '<p class="muted" style="margin:0">No hay gastos registrados este mes.</p>'}${L.devol ? fila("Devoluciones a clientes", "“Sacar dinero” → “Devolución a cliente”", L.devol) : ""}</div>
    </div>
    ${L.retDueno || L.consig || L.otrosRet || L.otrosIng || L.sinAnotar ? `<div class="card"><h3>Movimientos de caja que no suman ni restan</h3><p class="small muted" style="margin-top:-4px">La plata cambia de lugar o no se sabe qué fue.</p>
      ${L.retDueno ? fila("Retiros del dueño", "Sigue siendo plata del negocio", L.retDueno) : ""}${L.consig ? fila("Consignaciones", "Del efectivo al banco", L.consig) : ""}
      ${L.otrosRet ? fila("Salió de la caja por «Otro»", "Si fue un pago, anótenlo como gasto", L.otrosRet) : ""}${L.otrosIng ? fila("Entró a la caja por «Otro»", "", L.otrosIng) : ""}
      ${L.sinAnotar ? fila("Faltó por «Gasto sin anotar»", "Se resta cuando anoten ese gasto en Dinero", L.sinAnotar) : ""}</div>` : ""}
    <div class="card"><h3>Día por día</h3><p class="small muted" style="margin-top:-4px">Toca un día para ver qué se vendió.</p>
      ${tablaVista([{h: "Día", f: d => `<button class="lnk" data-act="verDiaVentas" data-f="${esc(d.f)}">${esc(diaCorto(d.f))}</button>`}, {h: "Vendido", n: 1, f: d => fmt(d.vendido)}, {h: "Gastos", n: 1, f: d => d.gastos || d.devol ? "− " + fmt(d.gastos + d.devol) : "–"},
        {h: "Caja", n: 1, f: d => [d.dif ? `<span style="color:${d.dif < 0 ? "var(--danger)" : "inherit"}">${d.dif < 0 ? "Faltó " : "Sobró "}${fmt(Math.abs(d.dif))}</span>` : "",
          d.sinAnotar ? `<span class="muted">Faltó ${fmt(d.sinAnotar)} (gasto sin anotar)</span>` : "", d.abiertas ? '<span class="muted">abierta</span>' : "",
          !d.dif && !d.sinAnotar && d.cerradas ? "cuadró" : ""].filter(Boolean).join("<br>") || "–"},
        {h: "Acumulado", n: 1, f: d => `<b>${plata(d.acum)}</b>`}], R.filas)}
    </div>
    <p class="xs muted">Acumulado = lo vendido menos los gastos y las devoluciones, más o menos lo que faltó o sobró al cerrar caja (igual que «¿Cuánta plata hay?» en Dinero). No incluye la plata con la que empezaron ni el costo de lo vendido: la utilidad está en Dinero → Mes.</p>`}`;
}
ACT.cajaVista = (el, d) => { S.cajaVista = d.v === "mes" ? "mes" : "hoy"; if (S.cajaVista === "mes") S.cajaMes = mesCaja(); draw(); };
ACT.cajaMesMover = (el, d) => { const m = masMes(mesCaja(), Number(d.v) || 0); if (m > S.today.slice(0, 7) || m < primerMesDatos()) return; S.cajaMes = m; draw(); };
ACT.verDiaVentas = (el, d) => { if (!d.f) return; S.vdDia = d.f; S.vdMes = d.f.slice(0, 7); S.vdCal = false; irA("ventas"); };
