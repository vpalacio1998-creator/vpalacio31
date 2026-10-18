/* ============ 61 · resolver una diferencia de caja (administrador) ============
   Cuando una caja cierra con faltante o sobrante, el administrador dice qué pasó y OLI lo corrige donde corresponde:
   - se cobró por otro medio (QR, Nequi, transferencia… y quedó en efectivo, o al revés): se corrige el medio de esas ventas;
   - se pagó algo con plata de la caja y no se anotó: se registra el gasto;
   - alguien sacó plata o entró plata y no se anotó; se contó mal; o no se sabe y se acepta la diferencia.
   Nada se borra: cada ajuste queda en el historial y se puede deshacer. Las cifras salen de difCierre() (20-domain). */
S.dif = {id: "", paso: "inicio", sel: [], vid: ""};
// lo que la persona ya eligió o escribió en el paso actual se conserva cuando la hoja se vuelve a dibujar (al tocar una venta o al sincronizar)
const DIF_VACIO = {sel: [], a: "", conf: true, nota: "", m: null, cat: "", mot: "", fresco: true};
function difGuardarLoEscrito() {
  if (S.dif.fresco) { S.dif.fresco = false; return; }
  const a = selVal("df-a"), cat = selVal("df-cat"), mot = selVal("df-mot"), cf = $("#df-conf"), n = $("#df-nota"), m = $("#df-m");
  if (a) S.dif.a = a; if (cat) S.dif.cat = cat; if (mot) S.dif.mot = mot; if (cf) S.dif.conf = cf.checked; if (n) S.dif.nota = n.value; if (m) S.dif.m = m.value;
}
const MEDIOS_CORR = ["QR Bancolombia", "Nequi", "Daviplata", "Transferencia", "Tarjeta", "Otro"];
const cajaPorId = id => cajasAll().find(x => x.id === id) || null;
const nombreCaja = c => (c && (c.devNombre || (col("dispositivos")[c.dev] || {}).nombre)) || "Caja";
const difTxt = n => n < 0 ? "Faltan " + fmt(-n) : n > 0 ? "Sobran " + fmt(n) : "Cuadra";
ACT.resolverDif = (el, d) => {
  if (!esAdmin()) return; const c = cajaPorId(d.id); if (!c || !difCierre(c)) { toast("Esa caja no tiene un cierre para revisar.", true); return; }
  S.dif = Object.assign({id: c.id, paso: "inicio", vid: ""}, DIF_VACIO, {sel: []}); abrir(difSheet, {live: true});
};
ACT.difPaso = (el, d) => { Object.assign(S.dif, DIF_VACIO, {paso: d.v, sel: []}); redrawSheet(true); };
ACT.difVenta = (el, d) => { const s = S.dif.sel, i = s.indexOf(d.id); if (i >= 0) s.splice(i, 1); else s.push(d.id); redrawSheet(true); };
function difSheet() {
  difGuardarLoEscrito();
  const c = cajaPorId(S.dif.id), r = c && difCierre(c); if (!c || !r) return head("Diferencia de caja") + '<p class="muted">Esa caja ya no tiene un cierre para revisar.</p>';
  const ci = r.ci, quien = nombreDe(ci.uid), falta = r.final < 0, p = S.dif.paso;
  const cab = `${head("Diferencia de caja", p === "inicio" ? "Cerrar" : "")}
    <div class="small muted" style="margin-top:-6px">${esc(nombreCaja(c))} · ${esc(diaLargo(c.fecha))} · cerró ${hora(ci.t)}${quien ? " · " + esc(quien) : ""}</div>
    <div class="card flat" style="margin-top:10px"><div class="row" style="padding-top:0"><span>Efectivo que debía haber al cerrar</span><b>${fmt(ci.esperado != null ? ci.esperado : (Number(ci.contado) || 0) - r.orig)}</b></div>
      <div class="row"><span>Contaron</span><b>${fmt(ci.contado)}</b></div>
      <div class="row"><span>Diferencia al cerrar</span><b style="color:${r.orig < 0 ? "var(--danger)" : "inherit"}">${difTxt(r.orig)}</b></div>
      ${ci.obs ? `<div class="small muted" style="padding:6px 0">Lo que anotó la caja: «${esc(ci.obs)}»</div>` : ""}
      ${r.items.length ? `<div class="small" style="font-weight:700;margin-top:6px">Lo que ya se revisó</div>${r.items.map(x => `<div class="row" style="align-items:flex-start"><div class="l small" style="flex:1">${esc(ajusteTxt(x))}${x.ventas && x.ventas.length ? `<div class="xs muted">${esc(x.ventas.map(id => (ventasAll().find(v => v.id === id) || {}).num || "").filter(Boolean).join(", "))}</div>` : ""}<div class="xs muted">${diaCorto(ymd(new Date(x.t)))} ${hora(x.t)}${nombreDe(x.uid) ? " · " + esc(nombreDe(x.uid)) : ""}</div></div>${p === "inicio" ? `<button class="btn ghost sm" data-act="difDeshacer" data-id="${esc(x.id)}">Deshacer</button>` : ""}</div>`).join("")}` : ""}
      <div class="row" style="border-bottom:0"><b>${r.items.length ? "Diferencia que queda" : "Diferencia"}</b><b class="big" style="font-size:22px;color:${Math.abs(r.final) >= 1 && !r.revisada ? "var(--danger)" : "var(--marca-d)"}">${difTxt(r.final)}</b></div>
      ${r.revisada && Math.abs(r.final) >= 1 ? `<div class="small muted">Revisada: se aceptó la diferencia.</div>` : ""}</div>`;
  if (p === "inicio") {
    if (r.revisada) return cab + `<div class="notice ok">${Math.abs(r.final) < 1 ? "Listo: con lo revisado, esta caja cuadra." : "Listo: la diferencia quedó revisada y aceptada."} Si algo de lo revisado está mal, tócalo en «Deshacer».</div>`;
    const ops = falta ? [["medio", "Una venta se pagó por QR, Nequi o transferencia y quedó como efectivo"], ["gasto", "Se pagó algo con plata de la caja y no se anotó"], ["retiro", "Alguien sacó plata de la caja y no se anotó"], ["conteo", "Se contó mal: la plata sí estaba"], ["aceptar", "No se sabe qué pasó: aceptar el faltante"]]
      : [["medioInv", "Una venta se marcó como QR, Nequi o tarjeta y la pagaron en efectivo"], ["ingreso", "Entró plata a la caja y no se anotó (base, cambio)"], ["conteo", "Se contó mal: había menos"], ["aceptar", "No se sabe qué pasó: aceptar el sobrante"]];
    return cab + `<h3 style="font-size:16px;margin:14px 0 6px">¿Qué pasó?</h3>${ops.map(([k, t]) => `<button class="alertrow" style="width:100%" data-act="difPaso" data-v="${k}"><span class="sev ${k === "aceptar" ? "" : "warn"}"></span><div><b>${esc(t)}</b></div></button>`).join("")}
      <p class="xs muted" style="margin-top:8px">Puedes usar varias: por ejemplo, una venta por QR y el resto aceptado. Todo queda en el historial y se puede deshacer.</p>`;
  }
  const volver = `<button class="btn ghost sm" style="margin-top:10px" data-act="difPaso" data-v="inicio">← Volver</button>`, resta = Math.abs(r.final);
  if (p === "medio" || p === "medioInv") {
    const efectivo = p === "medio", vs = ventasOk().filter(v => v.fecha === c.fecha && v.dev === c.dev && (efectivo ? v.m === "Efectivo" : v.m !== "Efectivo")).slice().reverse(), elegidas = vs.filter(v => S.dif.sel.includes(v.id)), tot = sum(elegidas, v => Number(v.total) || 0);
    return cab + `<h3 style="font-size:16px;margin:14px 0 4px">${efectivo ? "¿Cuál venta pagaron por otro medio?" : "¿Cuál venta pagaron en efectivo?"}</h3>
      <p class="small muted" style="margin:0 0 6px">${efectivo ? "Ventas de esa caja que quedaron en efectivo." : "Ventas de esa caja que quedaron con otro medio."} Toca las que fueron. Elegidas: <b>${fmt(tot)}</b> de ${fmt(resta)}.</p>
      ${vs.length ? `<div style="max-height:44vh;overflow:auto">${vs.map(v => { const on = S.dif.sel.includes(v.id); return `<button class="row" style="width:100%;background:${on ? "var(--marca-soft, #e7f2ec)" : "none"};border:0;border-bottom:1px solid var(--line);text-align:left;cursor:pointer;font:inherit;color:inherit" data-act="difVenta" data-id="${esc(v.id)}" aria-pressed="${on}"><div class="l" style="min-width:0"><b>${on ? "✓ " : ""}${hora(v.t)} · ${esc(v.num || "")}</b><div class="small muted" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc((v.items || []).map(i => i.q + " " + i.n).join(", "))}${efectivo ? "" : " · " + esc(v.m)}</div></div><b class="num">${fmt(v.total)}</b></button>`; }).join("")}</div>` : `<p class="muted">No hay ventas así en esa caja.</p>`}
      ${efectivo ? `<label class="f">¿Cómo pagaron de verdad?</label>${sel("df-a", MEDIOS_CORR, S.dif.a || "")}<label class="check" style="margin-top:10px"><input type="checkbox" id="df-conf" ${S.dif.conf === false ? "" : "checked"}> Ya revisé que la plata llegó a la cuenta</label>` : ""}
      <label class="f" for="df-nota">Nota (opcional)</label><input class="in plain" id="df-nota" placeholder="Ej: lo vimos en el extracto del banco" value="${esc(S.dif.nota || "")}">
      <button class="btn pri xl wide" style="margin-top:14px" data-act="difGuardarMedio" ${elegidas.length ? "" : "disabled"}>CORREGIR ${elegidas.length === 1 ? "LA VENTA" : elegidas.length ? elegidas.length + " VENTAS" : ""}</button>
      ${efectivo ? `<button class="btn ghost sm" style="margin-top:10px" data-act="difPaso" data-v="medioMonto">No sé cuál venta fue</button>` : ""}${volver}`;
  }
  if (p === "medioMonto") return cab + `<h3 style="font-size:16px;margin:14px 0 4px">Pagaron por otro medio (sin saber cuál venta)</h3>
      <p class="small muted" style="margin:0 0 6px">Esa plata se cuenta en las cuentas, no en la caja. Las ventas quedan como están.</p>
      <label class="f" for="df-m">¿Cuánto?</label><input class="in money" id="df-m" inputmode="numeric" value="${esc(S.dif.m != null ? S.dif.m : fmt(resta))}">
      <label class="f">¿Por qué medio?</label>${sel("df-a", MEDIOS_CORR, S.dif.a || "")}<label class="f" for="df-nota">Nota (opcional)</label><input class="in plain" id="df-nota" value="${esc(S.dif.nota || "")}">
      <button class="btn pri xl wide" style="margin-top:14px" data-act="difGuardar" data-t="medio">GUARDAR</button>${volver}`;
  if (p === "gasto") { const ya = gastosLigables(c); return cab + `<h3 style="font-size:16px;margin:14px 0 4px">Se pagó algo con plata de la caja</h3>
      ${ya.length ? `<div class="card flat" style="margin:6px 0 10px"><div class="small" style="font-weight:700">¿Ya lo anotaron en Dinero?</div><p class="xs muted" style="margin:2px 0 6px">Gastos en efectivo de ese día. Si es uno de estos, tócalo: no se registra otra vez.</p>${ya.map(g => `<button class="row" style="width:100%;background:none;border:0;border-bottom:1px solid var(--line);text-align:left;cursor:pointer;font:inherit;color:inherit" data-act="difLigarGasto" data-id="${esc(g.id)}"><div class="l"><b>${esc(g.cat || "Gasto")}</b><div class="small muted">${esc(g.desc || "")}</div></div><b class="num">${fmt(g.valor)}</b></button>`).join("")}</div>
      <div class="small" style="font-weight:700">Si no está anotado, regístralo aquí:</div>` : ""}
      <p class="small muted" style="margin:0 0 6px">Se registra como gasto en efectivo del ${esc(diaCorto(c.fecha))} y se resta en Dinero.</p>
      <label class="f" for="df-m">¿Cuánto?</label><input class="in money" id="df-m" inputmode="numeric" value="${esc(S.dif.m != null ? S.dif.m : fmt(resta))}">
      <label class="f">¿En qué?</label>${sel("df-cat", CATS_GASTO, S.dif.cat || "")}<label class="f" for="df-nota">¿Qué se pagó?</label><input class="in plain" id="df-nota" placeholder="Ej: hielo, domicilio" value="${esc(S.dif.nota || "")}">
      <button class="btn pri xl wide" style="margin-top:14px" data-act="difGuardar" data-t="gasto">REGISTRAR EL GASTO</button>${volver}`; }
  if (p === "retiro" || p === "ingreso") { const ret = p === "retiro"; return cab + `<h3 style="font-size:16px;margin:14px 0 4px">${ret ? "Alguien sacó plata de la caja" : "Entró plata a la caja"}</h3>
      <p class="small muted" style="margin:0 0 6px">${ret ? "La plata sigue siendo del negocio (no es un gasto): solo cambió de lugar. Si se pagó algo, vuelve y elige «Se pagó algo con plata de la caja»." : "Plata que no es de ventas (base, cambio de billetes): no cuenta como ingreso."}</p>
      <label class="f" for="df-m">¿Cuánto?</label><input class="in money" id="df-m" inputmode="numeric" value="${esc(S.dif.m != null ? S.dif.m : fmt(resta))}">
      <label class="f">${ret ? "¿Quién o para qué?" : "¿Qué fue?"}</label>${sel("df-mot", ret ? ["Retiro del dueño", "Consignación", "Otro"] : ["Base adicional", "Cambio de billetes", "Otro"], S.dif.mot || "")}
      <label class="f" for="df-nota">Nota (opcional)</label><input class="in plain" id="df-nota" value="${esc(S.dif.nota || "")}">
      <button class="btn pri xl wide" style="margin-top:14px" data-act="difGuardar" data-t="${p}">GUARDAR</button>${volver}`; }
  if (p === "conteo") return cab + `<h3 style="font-size:16px;margin:14px 0 4px">Se contó mal</h3>
      <label class="f" for="df-m">¿Cuánto había de verdad en la caja al cerrar?</label><input class="in money" id="df-m" inputmode="numeric" placeholder="$0" value="${esc(S.dif.m || "")}">
      <label class="f" for="df-nota">Nota (opcional)</label><input class="in plain" id="df-nota" placeholder="Ej: un billete quedó en el otro cajón" value="${esc(S.dif.nota || "")}">
      <button class="btn pri xl wide" style="margin-top:14px" data-act="difGuardar" data-t="conteo">GUARDAR EL CONTEO</button>${volver}`;
  if (p === "aceptar") return cab + `<h3 style="font-size:16px;margin:14px 0 4px">Aceptar la diferencia</h3>
      <p class="small muted" style="margin:0 0 6px">La diferencia de ${fmt(resta)} queda como ${falta ? "faltante" : "sobrante"} de esa caja y deja de salir como pendiente.</p>
      <label class="f" for="df-nota">¿Qué se sabe?</label><input class="in plain" id="df-nota" placeholder="Ej: error de cambio, no se encontró" value="${esc(S.dif.nota || "")}">
      <button class="btn pri xl wide" style="margin-top:14px" data-act="difGuardar" data-t="aceptada">ACEPTAR</button>${volver}`;
  return cab + volver;
}
const difCajaActual = () => { const c = cajaPorId(S.dif.id); if (!c || !difCierre(c)) throw new Error("Esa caja ya no tiene un cierre para revisar."); return c; };
const notaDif = () => (($("#df-nota") || {}).value || "").trim();
ACT.difGuardarMedio = (el, d) => unaVez("act:difMedio", () => guardar(async () => {
  const c = difCajaActual(), efectivo = S.dif.paso === "medio", vs = ventasOk().filter(v => S.dif.sel.includes(v.id) && v.fecha === c.fecha && v.dev === c.dev);
  if (!vs.length) throw new Error("Toca la venta que fue.");
  const a = efectivo ? selVal("df-a") : "Efectivo"; if (!a) throw new Error("Elige cómo pagaron de verdad.");
  const grupos = {}; for (const v of vs) (grupos[v.m] = grupos[v.m] || []).push(v);                 // ventas con medios distintos: una corrección por medio
  for (const g of Object.values(grupos)) await corregirMedio(g, a, efectivo ? !!($("#df-conf") || {}).checked : true, notaDif());
  Object.assign(S.dif, DIF_VACIO, {paso: "inicio", sel: []}); redrawSheet(true);
}, "Corregido"));
ACT.difGuardar = (el, d) => unaVez("act:difGuardar", () => guardar(async () => {
  const c = difCajaActual(), t = d.t, nota = notaDif(), r = difCierre(c);
  if (t === "aceptada") { if (!nota) throw new Error("Escribe qué se sabe."); await ajustarCaja(c, {tipo: "aceptada", monto: Math.abs(r.final), nota}); }
  else if (t === "conteo") { const raw = ($("#df-m") || {}).value || ""; if (!raw.trim()) throw new Error("Escribe cuánto había."); const real = num(raw), m = real - r.contado; if (!m) throw new Error("Es lo mismo que se contó."); await ajustarCaja(c, {tipo: "conteo", monto: m, nota}); }
  else {
    const m = num(($("#df-m") || {}).value); if (!(m > 0)) throw new Error("Escribe el valor.");
    if (t === "gasto") await gastoDeCaja(c, m, selVal("df-cat"), nota);
    else if (t === "medio") { const a = selVal("df-a"); if (!a) throw new Error("Elige por qué medio pagaron."); await ajustarCaja(c, {tipo: "medio", monto: m, de: "Efectivo", a, nota}); }
    else { const mot = selVal("df-mot"); if (!mot) throw new Error(t === "retiro" ? "Elige quién o para qué." : "Elige qué fue."); await ajustarCaja(c, {tipo: t, monto: m, mot, nota}); }
  }
  Object.assign(S.dif, DIF_VACIO, {paso: "inicio", sel: []}); redrawSheet(true);
}, "Guardado"));
// gastos en efectivo de ese día ya anotados en Dinero que todavía no explican ninguna diferencia
// (también el que se registró al revisar un cierre anterior de esta misma caja, si la reabrieron y la volvieron a cerrar)
const gastosLigables = c => { const r = difCierre(c), aqui = new Set(((r && r.items) || []).filter(x => x.gasto).map(x => x.gasto)), otras = new Set(ajustesCajaAll().filter(x => x.gasto && x.caja !== c.id).map(x => x.gasto));
  return Object.entries(col("gastos")).filter(([id, g]) => g && g.fecha === c.fecha && (g.m || "Efectivo") === "Efectivo" && (!g.cajaAjuste || g.cajaAjuste === c.id) && !aqui.has(id) && !otras.has(id)).map(([id, g]) => Object.assign({}, g, {id})); };
ACT.difLigarGasto = (el, d) => unaVez("act:difLigar", () => guardar(async () => {
  const c = difCajaActual(), g = gastosLigables(c).find(x => x.id === d.id); if (!g) throw new Error("Ese gasto ya no está o ya explica otra diferencia.");
  await ajustarCaja(c, {tipo: "gasto", monto: Number(g.valor) || 0, gasto: g.id, vinculado: true, nota: "ya estaba anotado"});
  Object.assign(S.dif, DIF_VACIO, {paso: "inicio", sel: []}); redrawSheet(true);
}, "Listo"));
ACT.difDeshacer = async (el, d) => {
  const c = cajaPorId(S.dif.id), x = ajustesCajaAll().find(y => y.id === d.id); if (!c || !x) return;
  if (!(await confirmar({titulo: "¿Deshacer esto?", texto: "<b>" + esc(ajusteTxt(x)) + "</b>" + (x.tipo === "gasto" && !x.vinculado ? "<br>También se borra el gasto que se registró." : "") + (x.tipo === "medio" && x.ventas ? "<br>Esas ventas dejan de tener esta corrección (si después se corrigieron otra vez, queda la última)." : "") + "<br>Queda en el historial.", si: "Sí, deshacer", no: "No"}))) { abrir(difSheet, {live: true}); return; }
  await guardar(() => deshacerAjuste(c, x.id), "Deshecho"); abrir(difSheet, {live: true});
};
/* corregir cómo pagaron una venta, desde su detalle (si su caja ya cerró, también explica la diferencia de ese cierre) */
ACT.corregirPago = (el, d) => { if (!esAdmin()) return; const v = ventasOk().find(x => x.id === d.id); if (!v) return; S.dif.vid = v.id;
  const c = cajaDe(v.fecha, v.dev), cerrada = c && cajaEstado(c) === "cerrada";
  abrir(() => head("¿Cómo pagaron de verdad?") + `<p class="muted" style="margin-top:0">${esc(v.num || "Venta")} · ${fmt(v.total)} · quedó como <b>${esc(v.m)}</b>${v.mOrig ? " (antes " + esc(v.mOrig) + ")" : ""}.</p>
    ${sel("cp-a", ["Efectivo"].concat(MEDIOS_CORR).filter(m => m !== v.m), "")}
    <label class="check" style="margin-top:10px"><input type="checkbox" id="cp-conf" checked> Si no fue en efectivo: ya revisé que la plata llegó a la cuenta</label>
    <label class="f" for="cp-nota">Nota (opcional)</label><input class="in plain" id="cp-nota">
    ${cerrada ? `<p class="small muted">La caja de esta venta ya cerró: la corrección también ajusta la diferencia de ese cierre.</p>` : ""}
    <button class="btn pri xl wide" style="margin-top:12px" data-act="doCorregirPago">GUARDAR</button>`); };
ACT.doCorregirPago = () => unaVez("act:corrPago", () => guardar(async () => {
  const v = ventasOk().find(x => x.id === S.dif.vid); if (!v) throw new Error("Esa venta ya no está."); const a = selVal("cp-a"); if (!a) throw new Error("Elige cómo pagaron.");
  await corregirMedio([v], a, !!($("#cp-conf") || {}).checked, (($("#cp-nota") || {}).value || "").trim()); cerrar();
}, "Corregido"));
