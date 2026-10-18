/* ============ 74 · ¿cuánta plata hay? (liquidez, administrador) ============
   Plata que hay = la plata que tenían cuando la contaron (si la anotan) + lo que se vendió (sin anuladas)
   − todos los gastos pagados (los de "Dinero" y los pagos hechos desde la caja, también materia prima)
   − devoluciones a clientes ± lo que faltó o sobró al cerrar caja (menos los faltantes por "Gasto sin anotar": ese gasto se
   anota y se resta una vez). Lo que entra o sale de la caja por "Otro" no se suma ni se resta (no se sabe qué fue): se muestra.
   Se separa en efectivo y en cuentas (banco, Nequi, Daviplata, tarjeta y otros medios) según el medio de pago.
   No se resta: el costo de lo vendido (al vender no sale plata), las compras (OLI no sabe si ya se pagaron ni con qué),
   los retiros del dueño, las bases de caja ni el cambio de billetes (la plata cambia de lugar, sigue siendo del negocio).
   Una consignación pasa plata del efectivo a las cuentas. Con conteo, cuenta lo que pasó después de contar (hora del
   equipo donde se guardó). Cada equipo con servidor guarda HIST_DIAS días de ventas y cajas: para que el total siga
   completo, hay que volver a contar la plata antes de que pase ese tiempo. */
const saldosIni = () => { const s = col("config").saldos; return s && typeof s.t === "number" ? s : null; };   // {efectivo, cuentas, desde, t, uid}
const enEfectivo = m => m === "Efectivo";
const empiezaCon = (txt, pre) => String(txt || "").indexOf(pre) === 0;
const pesosDe = v => num(String(v == null ? "" : v).replace(/[.,]\d{1,2}\s*$/, ""));   // "1.200.000,00" → 1200000: los centavos no se suman como pesos
const conteoAhora = s => !!s && s.t > parse(s.desde).getTime();                       // contaron a una hora (no "al empezar el día")
/* cómo entra en la plata lo que faltó o sobró al cerrar una caja. Sin revisar: según lo que anotó la caja al cerrar. Revisada (61-difcaja): cuenta la
   diferencia que queda, y lo que la explicó va a su lugar (las ventas corregidas y los gastos registrados ya se cuentan por su lado). */
function difPlata(c) {
  const r = difCierre(c), o = {dif: 0, sinAnotar: 0, aCuentas: 0, consig: 0, retDueno: 0, otrosRet: 0, otrosIng: 0}; if (!r) return o;
  if (!r.conAjustes) {
    const d = r.orig, obs = r.ci.obs;
    if (d < 0 && empiezaCon(obs, "Gasto sin anotar")) o.sinAnotar = -d;                 // ese gasto se anota en Dinero y se resta allá: aquí no, para no restarlo dos veces
    else if (d < 0 && empiezaCon(obs, "Pagaron por transferencia")) o.aCuentas = -d;    // se marcó efectivo pero llegó a la cuenta: la plata pasa de la caja a cuentas
    else o.dif = d;
    return o;
  }
  o.dif = r.final;
  for (const x of r.items) {
    const m = Math.abs(Number(x.monto) || 0);
    if (x.tipo === "medio" && !(x.ventas || []).length) o.aCuentas -= explicaAjuste(x);   // sin saber cuál venta: la plata pasa de la caja a cuentas (o al revés)
    else if (x.tipo === "retiro") o[x.mot === "Consignación" ? "consig" : x.mot === "Retiro del dueño" ? "retDueno" : "otrosRet"] += m;
    else if (x.tipo === "ingreso" && x.mot === "Otro") o.otrosIng += m;
  }
  return o;
}

function liquidez(rango) {                                    // rango {a, b}: solo lo que pasó entre esas fechas (sin conteo), p. ej. un mes
  const s = rango ? null : saldosIni(), t0 = s ? s.t : 0, cajas = cajasAll(), hoy = S.today;
  // sin conteo anotado: desde el primer día con ventas o cajas guardadas en este equipo (los gastos se cuentan desde ese día)
  const fechasDatos = ventasOk().map(v => v.fecha).concat(cajas.map(c => c.fecha)).filter(Boolean).sort();
  const desde = rango ? rango.a : s ? s.desde : (fechasDatos[0] || Object.values(col("gastos")).map(g => g && g.fecha).filter(Boolean).sort()[0] || hoy);
  // ¿entra en la cuenta? con conteo: lo que pasó después de contar; sin conteo: desde el primer día. Lo de fechas futuras, no.
  const despues = (fecha, t) => !!fecha && fecha <= hoy && (rango ? fecha >= rango.a && fecha <= rango.b : s ? (fecha > s.desde || (fecha === s.desde && (Number(t) || 0) > t0)) : fecha >= desde);
  const medios = {}, med = m => medios[m] || (medios[m] = {entro: 0, salio: 0});
  let vEf = 0, vCu = 0, nV = 0, pend = 0;
  for (const v of ventasOk()) if (despues(v.fecha, v.t)) {
    const x = Number(v.total) || 0, m = v.m || "Otro"; nV++; med(m).entro += x;
    if (enEfectivo(m)) vEf += x; else { vCu += x; if (v.pend) pend += x; }
  }
  // venta de antes del conteo anulada después: esa plata estaba en el conteo y salió (se devolvió). Un cobro duplicado nunca
  // entró dos veces, y un pago digital que no se confirmó no estaba en el conteo: esos no se restan.
  let anEf = 0, anCu = 0, nAn = 0;
  if (s) {
    const idx = {}, prim = {}; for (const v of ventasAll()) idx[v.id] = v;
    for (const d of Object.values(col("anulaciones"))) for (const a of ((d && d.items) || [])) { const t = Number(a.t) || 0; if (!prim[a.ventaId] || t < prim[a.ventaId].t) prim[a.ventaId] = {t, motivo: a.motivo}; }   // una venta anulada dos veces cuenta una vez
    for (const [vid, a] of Object.entries(prim)) {
      if (!(a.t > t0) || empiezaCon(a.motivo, "Cobro duplicado")) continue;
      const v = idx[vid]; if (!v || despues(v.fecha, v.t) || v.pend) continue;
      const x = Number(v.total) || 0, m = v.m || "Otro"; nAn++; med(m).salio += x; if (enEfectivo(m)) anEf += x; else anCu += x;
    }
  }
  let gEf = 0, gCu = 0, nG = 0;
  for (const g of Object.values(col("gastos"))) if (g && despues(g.fecha, g.t) && !(s && g.antesConteo === s.t)) {   // pagado antes de contar: el conteo ya lo descontó
    const x = Number(g.valor) || 0, m = g.m || "Efectivo"; nG++; med(m).salio += x;
    if (enEfectivo(m)) gEf += x; else gCu += x;
  }
  let consig = 0, retDueno = 0, devol = 0, otrosRet = 0, otrosIng = 0, difs = 0, nDifs = 0, sinAnotar = 0, aCuentas = 0; const sinAnotarF = [];
  for (const c of cajas) {
    for (const mv of (c.movs || [])) if (despues(c.fecha, mv.t)) {
      const x = Number(mv.monto) || 0;
      if (mv.tipo === "gasto") { nG++; gEf += x; med("Efectivo").salio += x; }
      else if (mv.tipo === "retiro") {
        if (empiezaCon(mv.motivo, "Consignación")) consig += x; else if (empiezaCon(mv.motivo, "Retiro del dueño")) retDueno += x;
        else if (empiezaCon(mv.motivo, "Devolución a cliente")) { devol += x; med("Efectivo").salio += x; }
        else if (empiezaCon(mv.motivo, "Otro")) otrosRet += x;                                   // "Cambio de billetes" solo cambia la plata de lugar
      } else if (mv.tipo === "ingreso" && empiezaCon(mv.motivo, "Otro")) otrosIng += x;          // "Base adicional" y "Cambio de billetes": la plata cambia de lugar
    }
    // lo que faltó o sobró al cerrar: solo cajas abiertas después del conteo (si no, el conteo ya lo incluye)
    if (cajaEstado(c) === "cerrada" && c.apertura && despues(c.fecha, c.apertura.t)) { const o = difPlata(c);
      if (o.sinAnotar) { sinAnotar += o.sinAnotar; sinAnotarF.push(c.fecha); }
      aCuentas += o.aCuentas; consig += o.consig; retDueno += o.retDueno; otrosRet += o.otrosRet; otrosIng += o.otrosIng;
      if (Math.abs(o.dif) >= 1) { difs += o.dif; nDifs++; } }
  }
  const sEf = s ? Number(s.efectivo) || 0 : 0, sCu = s ? Number(s.cuentas) || 0 : 0;
  const efectivo = sEf + vEf - anEf - gEf - devol + difs - consig - aCuentas, cuentas = sCu + vCu - anCu - gCu + consig + aCuentas;
  // compras recibidas en el mismo tiempo: se muestran, no se restan
  let compras = 0, nCompras = 0;
  for (const c of Object.values(col("compras"))) if (c && c.estado === "recibido") { const f = c.recFecha || c.fecha; if (despues(f, c.recT || c.t)) { compras += sum(c.lineas || [], l => (Number(l.costo) || 0) * (Number(l.q) || 0)) + (Number(c.iva) || 0); nCompras++; } }
  const abiertas = cajas.filter(c => cajaEstado(c) === "abierta").map(c => ({nombre: c.devNombre || (col("dispositivos")[c.dev] || {}).nombre || "Caja", fecha: c.fecha, esperado: cajaCalc(c).esperado}));
  // ventas que otros equipos aún no han enviado (lo dicen ellos mismos al reportarse)
  const sinEnviar = DS.mode === "db" ? sum(Object.values(col("dispositivos")).filter(d => d && d.dev !== DEV.id), d => Number(d.ventasPend) || 0) : 0;
  const cargando = DS.mode === "db" && ["ventas", "cajas", "anulaciones", "gastos", "config"].some(n => !DS.ready[n]);
  const incompleto = DS.mode === "db" && desde < addDays(hoy, -(HIST_DIAS - 5));   // con servidor, este equipo ya no tiene todas las ventas de ese tiempo
  return {conSaldo: !!s, saldo: s, desde, sEf, sCu, ventas: vEf + vCu, vEf, vCu, nV, anulDesp: anEf + anCu, nAn, gastos: gEf + gCu, gEf, gCu, nG,
    devol, otrosRet, otrosIng, sinAnotar, sinAnotarF: uniq(sinAnotarF).sort(), aCuentas, difs, nDifs, consig, retDueno, pend, efectivo, cuentas, total: efectivo + cuentas, medios, compras, nCompras, abiertas, sinEnviar, cargando, incompleto};
}

function liquidezHTML() {
  const L = liquidez(), neg = L.total < 0;
  if (L.cargando) return `<div class="card liq" id="liquidez"><div class="liq-h"><h3>¿Cuánta plata hay?</h3></div><p class="muted" style="margin:6px 0 0">Cargando ventas y gastos…</p></div>`;
  const signo = v => v < 0 ? "− " : "", plata = v => signo(v) + fmt(Math.abs(v));
  const fila = (txt, sub, v, sg) => `<div class="row"><div class="l">${txt}${sub ? `<div class="small muted">${sub}</div>` : ""}</div><div class="r">${sg || ""}${fmt(Math.abs(v))}</div></div>`;
  const plural = (n, uno, varios) => n + " " + (n === 1 ? uno : varios);
  const desdeTxt = L.conSaldo ? (conteoAhora(L.saldo) ? (L.saldo.desde === S.today ? "Desde hoy a las " : "Desde el " + diaMesLiq(L.desde) + " a las ") + hora(L.saldo.t) + ", cuando contaron la plata"
      : "Desde el comienzo del " + diaMesLiq(L.desde) + ", cuando contaron la plata")
    : "Desde el " + diaMesLiq(L.desde) + " · con lo que está registrado en OLI";
  const ayudaTxt = (L.conSaldo ? "Es la plata que debería tener el negocio: la que contaron, " : "Es lo que se vendió ") + (L.conSaldo ? "más lo que se vendió, " : "") + "menos todos los gastos pagados (también los que se pagan desde la caja) y las devoluciones a clientes, "
    + "más o menos lo que sobró o faltó al cerrar caja. No resta el costo de lo vendido, ni las compras (OLI no sabe si ya se pagaron), ni los retiros del dueño: esa plata sigue siendo del negocio aunque cambie de lugar. "
    + "Las comisiones del datáfono y de las apps no se descuentan.";
  const medios = Object.entries(L.medios).filter(([, x]) => x.entro || x.salio).sort((a, b) => (b[1].entro - b[1].salio) - (a[1].entro - a[1].salio));
  const viejas = L.abiertas.filter(c => c.fecha < S.today);
  const cajasTxt = L.abiertas.length ? "En las cajas abiertas (con la base): " + fmt(sum(L.abiertas, c => c.esperado)) + (viejas.length ? " · " + plural(viejas.length, "sin cerrar", "sin cerrar") + " desde el " + diaMesLiq(viejas.map(c => c.fecha).sort()[0]) : "") : "Ninguna caja abierta";
  return `<div class="card liq" id="liquidez">
    <div class="liq-h"><h3>¿Cuánta plata hay?</h3>${ayuda(esc(ayudaTxt))}</div>
    <p class="small muted" style="margin:2px 0 6px">${esc(desdeTxt)}</p>
    <p class="xs muted liq-cap">${L.conSaldo ? "Plata que debería haber" : "Lo vendido menos lo gastado"}</p>
    <div class="liq-total${neg ? " neg" : ""}">${plata(L.total)}</div>
    <div class="kpis k2 liq-bolsas">
      <div class="kpi${L.efectivo < 0 ? " neg" : ""}"><span>En efectivo</span><b>${plata(L.efectivo)}</b><small>${esc(cajasTxt)}</small></div>
      <div class="kpi${L.cuentas < 0 ? " neg" : ""}"><span>En cuentas</span><b>${plata(L.cuentas)}</b><small>Banco, Nequi, Daviplata, tarjeta y otros medios</small>${L.pend ? `<small class="liq-pend">${fmt(L.pend)} de Nequi, Daviplata o QR aún por confirmar</small>` : ""}</div>
    </div>
    ${L.conSaldo ? fila("+ Plata que tenían al contar", "Efectivo " + fmt(L.sEf) + " · cuentas " + fmt(L.sCu), L.sEf + L.sCu, "") : ""}
    ${fila("+ Lo que se vendió", plural(L.nV, "venta", "ventas") + " (sin las anuladas)", L.ventas, "")}
    ${L.anulDesp ? fila("− Ventas anuladas después de contar", plural(L.nAn, "venta", "ventas") + " de antes del conteo: esa plata se devolvió", L.anulDesp, "− ") : ""}
    ${fila("− Gastos pagados", L.nG ? plural(L.nG, "gasto", "gastos") + ", también los pagados desde la caja" : "No hay gastos registrados", L.gastos, "− ")}
    ${L.devol ? fila("− Devoluciones a clientes", "“Sacar dinero” → “Devolución a cliente”", L.devol, "− ") : ""}
    ${L.difs ? fila(L.difs < 0 ? "− Faltó al cerrar caja" : "+ Sobró al cerrar caja", plural(L.nDifs, "cierre", "cierres") + " con diferencia", L.difs, L.difs < 0 ? "− " : "") : ""}
    <div class="row"><div class="l"><b>= ${L.conSaldo ? "Plata que debería haber" : "Lo vendido menos lo gastado"}</b></div><div class="r" style="color:${neg ? "var(--danger)" : "var(--marca-d)"}">${plata(L.total)}</div></div>
    ${medios.length || L.consig ? `<details class="liq-det"><summary>Ver por medio de pago</summary><p class="xs muted" style="margin:0 0 4px">Lo que entró y salió por cada medio${L.conSaldo ? ", sin la plata que contaron" : ""}${L.difs ? " ni lo que faltó o sobró al cerrar caja" : ""}.</p>
      ${medios.map(([m, x]) => `<div class="row"><div class="l">${esc(m)}<div class="small muted">${x.entro ? "Entró " + fmt(x.entro) : ""}${x.entro && x.salio ? " · " : ""}${x.salio ? "salió " + fmt(x.salio) : ""}</div></div><div class="r">${plata(x.entro - x.salio)}</div></div>`).join("")}
      ${L.consig ? `<div class="row"><div class="l">Consignaciones<div class="small muted">Efectivo que salió de la caja hacia el banco: pasa de efectivo a cuentas</div></div><div class="r">${fmt(L.consig)}</div></div>` : ""}</details>` : ""}
    ${L.sinEnviar ? `<div class="notice" style="margin-top:12px">Faltan por llegar ${plural(L.sinEnviar, "venta", "ventas")} de otros equipos: se suman solas cuando lleguen.</div>` : ""}
    ${!L.conSaldo ? `<div class="notice" style="margin-top:12px">Este total no incluye la plata que ya tenían antes del ${esc(diaMesLiq(L.desde))}. Para saber la plata real, cuenten el efectivo y miren los saldos del banco y de Nequi, y anótenlos: desde ahí OLI sigue la cuenta sola.</div>` : ""}
    ${L.incompleto ? `<div class="notice bad" style="margin-top:12px">${L.conSaldo ? `<b>Vuelvan a contar la plata.</b> La cuenta empieza el ${esc(diaMesLiq(L.desde))} y este equipo solo guarda los últimos ${HIST_DIAS} días de ventas: ya falta información.` : `Este equipo guarda los últimos ${HIST_DIAS} días de ventas: lo de antes no está en esta cuenta.`}</div>` : ""}
    ${L.sinAnotar ? `<div class="notice" style="margin-top:12px">Al cerrar caja (${esc(L.sinAnotarF.map(diaMesLiq).join(", "))}) faltaron ${fmt(L.sinAnotar)} marcados como «Gasto sin anotar»: aquí no se restan. Si ese gasto todavía no está en Dinero, anótenlo en «Registrar gasto»; si ya lo anotaron, no hagan nada más.</div>` : ""}
    ${L.otrosRet || L.otrosIng ? `<p class="small muted" style="margin:10px 0 0">${L.otrosRet ? "Salieron " + fmt(L.otrosRet) + " de la caja" : ""}${L.otrosRet && L.otrosIng ? " y entraron " + fmt(L.otrosIng) : L.otrosIng ? "Entraron " + fmt(L.otrosIng) + " a la caja" : ""} por «Otro»: no se suman ni se restan porque no se sabe qué fue. Si fue un pago, anótenlo como gasto (una sola vez); si la plata ya no está, vuelvan a contar.</p>` : ""}
    ${L.retDueno ? `<p class="small muted" style="margin:10px 0 0">El dueño sacó ${fmt(L.retDueno)} de la caja en este tiempo y aquí se sigue contando como plata del negocio. Si se usó en algo del negocio, anótenlo como gasto; si ya no está (por ejemplo, fue para algo personal), vuelvan a contar la plata.</p>` : ""}
    ${L.nCompras ? `<p class="small muted" style="margin:10px 0 0">Compras recibidas en este tiempo: ${fmt(L.compras)} (${L.nCompras}). No se restan porque OLI no sabe si ya se pagaron: si ya las pagaron y no las anotaron como gasto, anótenlas como gasto.</p>` : ""}
    <div class="btns" style="margin-top:12px"><button class="btn ${L.conSaldo ? "ghost" : "pri"} sm" data-act="contarPlata">${ic("moneda", 16)} ${L.conSaldo ? "Volver a contar la plata" : "Anotar la plata que tenemos"}</button></div>
  </div>`;
}
const diaMesLiq = f => parse(f).toLocaleDateString("es-CO", {day: "numeric", month: "long"});

/* ---------- contar la plata (punto de partida) ---------- */
ACT.contarPlata = () => { const L = liquidez(), conMin = DS.mode === "db";
  abrir(() => head("¿Cuánta plata tienen?") + `<p style="margin-top:0">Cuenten el efectivo (lo de las cajas y lo guardado) y miren cuánto hay en el banco, Nequi y Daviplata. Desde ese momento, OLI suma lo que se venda y resta los gastos. Antes de guardar, anoten los gastos que ya pagaron y no han registrado.</p>
  ${L.abiertas.length ? `<div class="notice" style="margin:0 0 10px">Hay ${L.abiertas.length === 1 ? "una caja abierta" : L.abiertas.length + " cajas abiertas"}: guarden apenas terminen de contar, sin vender en el medio.</div>` : ""}
  <label class="f" for="lq-ef">Efectivo</label><input class="in money" id="lq-ef" inputmode="numeric" placeholder="$0">${L.conSaldo ? `<p class="xs muted" style="margin:4px 0 0">Según OLI debería haber ${esc(fmt(L.efectivo))}.</p>` : ""}
  <label class="f" for="lq-cu">En cuentas (banco, Nequi, Daviplata…)</label><input class="in money" id="lq-cu" inputmode="numeric" placeholder="$0">${L.conSaldo ? `<p class="xs muted" style="margin:4px 0 0">Según OLI debería haber ${esc(fmt(L.cuentas))}.</p>` : ""}
  <details style="margin:12px 0"><summary class="small" style="font-weight:700;min-height:40px;display:flex;align-items:center;cursor:pointer">La contaron al empezar un día (antes de vender)</summary><label class="f" for="lq-f">¿Qué día?</label><input class="in" type="date" id="lq-f" max="${S.today}"${conMin ? ` min="${addDays(S.today, -(HIST_DIAS - 5))}"` : ""}><p class="xs muted" style="margin:4px 0 0">OLI sumará todo lo vendido y restará los gastos desde el comienzo de ese día.</p></details>
  <button class="btn pri xl wide" data-act="doContarPlata">GUARDAR</button>${L.conSaldo ? `<button class="btn ghost sm" style="margin-top:10px" data-act="quitarSaldos">Quitar lo que anotamos</button>` : ""}`); };
ACT.doContarPlata = async () => {
  const ef = $("#lq-ef").value.trim(), cu = $("#lq-cu").value.trim(), f = ($("#lq-f") || {}).value || "";
  if (!ef || !cu) { toast(!ef ? "Escribe cuánto efectivo hay (si no hay, escribe 0)." : "Escribe cuánto hay en cuentas (si no hay, escribe 0).", true); return; }
  if (f && (f > S.today || (DS.mode === "db" && f < addDays(S.today, -(HIST_DIAS - 5))))) { toast(f > S.today ? "La fecha no puede ser futura." : "Elige un día de los últimos " + (HIST_DIAS - 5) + " días.", true); return; }
  const desde = f || S.today, t = f ? parse(f).getTime() : Date.now();   // con fecha: al comienzo de ese día; sin fecha: ahora
  await guardar(async () => { await guardarSaldos({efectivo: Math.max(0, pesosDe(ef)), cuentas: Math.max(0, pesosDe(cu)), desde, t}); cerrar(); draw(); }, "Listo: desde aquí OLI lleva la cuenta");
};
ACT.quitarSaldos = async () => { if (await confirmar({titulo: "¿Quitar la plata que anotaron?", texto: "OLI volverá a contar solo desde lo registrado. Quedará anotado en la auditoría.", si: "Sí, quitar", no: "No", peligro: true})) await guardar(async () => { await quitarSaldos(); draw(); }, "Listo"); };
async function guardarSaldos(o) { exigirAdmin(); await put("config", "saldos", {efectivo: o.efectivo, cuentas: o.cuentas, desde: o.desde, t: o.t, guardado: Date.now(), uid: uidActual()}); audit("PLATA_CONTADA", "saldos", "Efectivo " + fmt(o.efectivo) + " · cuentas " + fmt(o.cuentas) + " · desde " + o.desde); }
async function quitarSaldos() { exigirAdmin(); await remove("config", "saldos"); audit("PLATA_CONTADA_QUITADA", "saldos", ""); }
