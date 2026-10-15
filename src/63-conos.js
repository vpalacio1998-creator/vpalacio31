/* ============ 63 · conos de helado: sabores, cucurucho o vaso, y rendimiento de cada caja ============
   Cono sencillo (1 bola) o doble (2 bolas, pueden ser de sabores distintos). Cada cono gasta 1 barquillo y 1 cucurucho o 1 vaso (ver consumoLinea).
   La crema viene en cajas y hay UNA caja abierta por sabor. Cuando se acaba, la empleada marca "Cambié la caja": eso resta una caja cerrada
   del inventario y cierra la cuenta de bolas de la caja anterior. El administrador ve cuántas bolas dio cada caja: lo esperado lo dice el
   proveedor (30 por defecto) y fuera del rango aceptable (27 a 33 por defecto, se cambia en Ajustes) OLI avisa. No se asume fraude: también
   puede ser el tamaño de la bola o un sabor mal marcado al vender. */
const CONO_DEF = {bolasCaja: 30, min: 27, max: 33};
const confConos = () => { const x = Object.assign({}, CONO_DEF, configNeg().conos || {}, col("meta").conos || {}); return {bolasCaja: x.bolasCaja, min: x.min, max: x.max}; };   // en "meta" (lo lee la tablet de la empleada: no tiene costos)
const bolasCaja = () => confConos().bolasCaja || CONO_DEF.bolasCaja;
const saboresHelado = () => prods().filter(p => p.sabor && p.activo !== false).sort((a, b) => (a.orden || 0) - (b.orden || 0) || a.nombre.localeCompare(b.nombre, "es"));
const nombreSabor = pid => ((prod(pid) || {}).nombre || pid).replace(/^Helado\s+/i, "");
const PRES_TXT = {cucurucho: "cucurucho", vaso: "vaso"};
const itemsHelado = () => memo("itHel", () => { const out = []; for (const [docId, d] of Object.entries(col("cajashelado"))) for (const x of (d.items || [])) if (x && x.id) out.push(Object.assign({fecha: d.fecha, dev: d.dev, docId}, x)); return out.sort((a, b) => a.t - b.t); });
/* cambios de caja vigentes: sin los anulados; y un "empezar a contar" solo vale si es el primero de su sabor (no parte una caja en dos) */
const eventosHelado = () => memo("evHel", () => {
  const anulados = new Set(itemsHelado().filter(x => x.anula).map(x => x.anula)), vistos = new Set(), out = [];
  for (const x of itemsHelado()) { if (!x.sabor || x.anula || anulados.has(x.id)) continue; if (x.motivo === "inicio" && vistos.has(x.sabor)) continue; vistos.add(x.sabor); out.push(x); }
  return out;
});
const bolasVendidas = () => memo("bolasV", () => { const m = {}; for (const v of ventasOk()) for (const it of (v.items || [])) if (Array.isArray(it.sab)) for (const s of it.sab) (m[s] = m[s] || []).push({t: v.t, q: it.q}); return m; });

/* cada caja de un sabor va de un cambio de caja al siguiente; la última sigue abierta */
function rendimientoCajas() {
  return memo("rendCajas", () => {
    const c = confConos(), ev = eventosHelado(), bv = bolasVendidas(), out = {};
    for (const s of uniq(ev.map(e => e.sabor))) {
      const es = ev.filter(e => e.sabor === s), ls = bv[s] || [], cajas = [];
      for (let i = 0; i < es.length; i++) {
        const desde = es[i].t, fin = es[i + 1] || null, hasta = fin ? fin.t : null, bolas = sum(ls.filter(x => x.t >= desde && (hasta == null || x.t < hasta)), x => x.q);
        const parcial = es[i].motivo === "inicio";                                   // se empezó a contar con la caja ya empezada: no se sabe cuánto traía
        const bc = es[i].bc || c.bolasCaja, mn = bc - (c.bolasCaja - c.min), mx = bc + (c.max - c.bolasCaja);   // cada caja con las bolas esperadas cuando se abrió (si se cambia el número, las viejas no se re-juzgan)
        const estado = fin && fin.motivo === "danada" ? "danada" : bolas > mx ? "muchas" : !fin ? "abierta" : parcial ? "parcial" : bolas < mn ? "pocas" : "ok";
        cajas.push({sabor: s, desde, hasta, bolas, estado, parcial, abierta: !fin, apertura: es[i], cierre: fin, bc, min: mn, max: mx});
      }
      out[s] = cajas;
    }
    return out;
  });
}
const cajasCerradasHelado = () => Object.values(rendimientoCajas()).flat().filter(k => !k.abierta).sort((a, b) => b.hasta - a.hasta);
const ESTADO_CAJA = {ok: ["ok", "Dentro del rango"], pocas: ["bad", "Pocas bolas"], muchas: ["warn", "Muchas bolas"], danada: ["", "Dañada (pérdida)"], abierta: ["", "Abierta"], parcial: ["", "Se empezó a contar a mitad"]};
const pillCaja = k => `<span class="pill ${ESTADO_CAJA[k.estado][0]}">${ESTADO_CAJA[k.estado][1]}</span>`;
/* conos mal configurados: sin barquillo, cucurucho o vaso válidos no se descuenta lo que gastan */
function conosIncompletos() { return prods().filter(p => p.cono && p.activo !== false).map(p => ({p, falta: ["barquillo", "cucurucho", "vaso"].filter(k => !p.cono[k] || !prod(p.cono[k]))})).filter(x => x.falta.length); }
function alertasHelado() {
  const out = [], desde = Date.now() - 14 * 864e5, rangoDe = k => `lo esperado es ${k.bc}; aceptable ${k.min} a ${k.max}`;
  const nota = " También pasa si al vender se marca un sabor distinto al que se sirvió.";
  for (const x of conosIncompletos()) out.push({sev: "warn", t: `Al producto ${x.p.nombre} le falta definir: ${x.falta.join(", ")}.`, d: "Sin eso no se descuenta del inventario lo que gasta cada cono. Edítalo en Productos."});
  for (const k of Object.values(rendimientoCajas()).flat()) {
    const n = nombreSabor(k.sabor);
    if (k.estado === "pocas" && k.hasta >= desde) out.push({sev: "bad", sabor: k.sabor, t: `La caja de ${n} dio ${k.bolas} bolas (${rangoDe(k)}).`, d: "Se están sirviendo bolas más grandes o se perdió producto: es plata que se pierde." + nota});
    else if (k.estado === "muchas" && (k.abierta || k.hasta >= desde)) out.push({sev: "warn", sabor: k.sabor, t: k.abierta ? `La caja abierta de ${n} ya va en ${k.bolas} bolas (máximo aceptable ${k.max}).` : `La caja de ${n} dio ${k.bolas} bolas (${rangoDe(k)}).`, d: "Se están sirviendo bolas más pequeñas de lo que se le ofrece al cliente." + nota});
  }
  return out;
}
/* una caja abierta que se dañó es pérdida: lo que faltaba por servir, en fracción de caja */
function perdidasHelado(a, b) {
  return cajasCerradasHelado().filter(k => k.estado === "danada" && k.cierre.fecha >= a && k.cierre.fecha <= b).map(k => {
    const frac = k.parcial ? null : Math.max(0, Math.round((k.bc - k.bolas) / k.bc * 100) / 100), c = costoUnit(k.sabor, k.hasta);
    return {pid: k.sabor, producto: "Helado " + nombreSabor(k.sabor) + " (caja abierta)", fecha: k.cierre.fecha, cantidad: frac, unidad: "cajas", costo: c, total: c == null || frac == null ? null : Math.round(c * frac), motivo: "Caja dañada o derretida", empleado: empNombre(k.cierre.uid),
      obs: (k.cierre.obs || "") + (k.parcial ? (k.cierre.obs ? " · " : "") + "la caja se empezó a contar a mitad: no se sabe cuánto quedaba" : "")};
  });
}
/* costo de una unidad de una línea vendida: un cono suma barquillo, cucurucho o vaso y sus bolas (costo de la caja ÷ bolas por caja) */
function costoItem(it, t) {
  if (!Array.isArray(it.sab)) return costoUnit(it.pid, t);
  let s = 0; const q = it.q || 1;
  for (const x of consumoLinea(it)) { const c = costoUnit(x.pid, t); if (c == null) return null; s += c * x.q / q; }
  for (const sb of it.sab) { const c = costoUnit(sb, t); if (c == null) return null; s += c / (it.bc || bolasCaja()); }
  return Math.round(s);
}

/* ---------- vender un cono: sabor(es) y cucurucho o vaso ---------- */
S.cono = null;
function abrirCono(p) {
  if (!saboresHelado().length) { toast("Todavía no hay sabores de helado. " + (esAdmin() ? "Créalos en Productos." : "Pídele al administrador que los agregue."), true); return; }
  S.cono = {pid: p.id, sab: [], pres: "cucurucho"}; abrir(conoSheet);
}
function conoSheet() {
  const c = S.cono, p = c && prod(c.pid); if (!p || !p.cono) return head("Cono") + "";
  const n = p.cono.bolas || 1, falta = n - c.sab.length;
  return head(p.nombre + " · " + fmt(p.precio)) + `<p class="muted" style="margin-top:0">${n === 1 ? "Elige el sabor." : "Elige 2 sabores: pueden ser iguales o distintos."}</p>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">${Array.from({length: n}, (_, i) => `<span class="pill ${c.sab[i] ? "ok" : ""}" style="font-size:15px">${n > 1 ? (i + 1) + ". " : ""}${c.sab[i] ? esc(nombreSabor(c.sab[i])) : "—"}</span>`).join("")}${c.sab.length ? '<button class="btn ghost sm" data-act="conoBorrar">Borrar</button>' : ""}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px">${saboresHelado().map(s => `<button class="btn ${c.sab.includes(s.id) ? "pri" : "ghost"}" style="min-height:56px" data-act="conoSabor" data-id="${esc(s.id)}" ${falta <= 0 ? "disabled" : ""}>${esc(nombreSabor(s.id))}</button>`).join("")}</div>
    <label class="f">¿Cómo lo lleva?</label><div class="seg">${Object.entries(PRES_TXT).map(([k, l]) => `<button data-act="conoPres" data-v="${k}" aria-pressed="${c.pres === k}">${cap1(l)}</button>`).join("")}</div>
    <button class="btn pri xl wide" style="margin-top:14px" data-act="conoAgregar" ${falta > 0 ? "disabled" : ""}>${falta > 0 ? (n === 1 ? "ELIGE EL SABOR" : falta === 1 ? "ELIGE 1 SABOR MÁS" : "ELIGE 2 SABORES") : "AGREGAR AL PEDIDO"}</button>
    <button class="btn ghost wide" style="margin-top:8px" data-act="cambioCaja" data-desde="cono">¿Se acabó una caja? Marcar cambio de caja</button>`;
}
ACT.conoSabor = (el, d) => { const c = S.cono, p = c && prod(c.pid); if (!p || c.sab.length >= (p.cono.bolas || 1)) return; c.sab.push(d.id); redrawSheet(true); };
ACT.conoBorrar = () => { if (S.cono) { S.cono.sab = []; redrawSheet(true); } };
ACT.conoPres = (el, d) => { if (S.cono && PRES_TXT[d.v]) { S.cono.pres = d.v; redrawSheet(true); } };
ACT.conoAgregar = () => {
  const c = S.cono, p = c && prod(c.pid); if (!p || c.sab.length !== (p.cono.bolas || 1)) return;
  if (agregarCono(p, c.sab, c.pres)) { S.cono = null; saveCart(); cerrar(); draw(); }
};
function agregarCono(p, sab, pres) {
  const ss = sab.slice().sort(), k = p.id + "|" + ss.join("+") + "|" + pres, det = ss.map(nombreSabor).join(" + ") + " · " + PRES_TXT[pres];
  const prueba = S.cart.map(c => Object.assign({}, c)), ex0 = prueba.find(c => claveLinea(c) === k); if (ex0) ex0.q++; else prueba.push({k, pid: p.id, q: 1, sab: ss, pres});
  const f = faltante(prueba); if (f) { toast("Solo hay " + f.st + " de " + f.p.nombre + ".", true); return false; }
  const ex = S.cart.find(c => claveLinea(c) === k); if (ex) ex.q++; else S.cart.push({k, pid: p.id, n: p.nombre, q: 1, p: p.precio, sab: ss, pres, det}); return true;
}

/* ---------- cambio de caja (empleada o administrador) ---------- */
S.cambio = null;
const MIN_REPETIDO = 15, MIN_ANULAR_CAJA = 10;
ACT.cambioCaja = (el, d) => {
  if (!saboresHelado().length) { toast("Todavía no hay sabores de helado.", true); return; }
  const desdeCono = !!(d && d.desde === "cono" && S.cono), elegidos = desdeCono ? uniq(S.cono.sab) : [], pre = d && d.id ? d.id : elegidos.length === 1 ? elegidos[0] : "";
  const s = pre && prod(pre) && prod(pre).sabor ? pre : "";
  S.cambio = {sabor: s, motivo: s ? motivoInicial(s) : "", desdeCono, ofrecer: elegidos}; abrir(cambioSheet);
};
const motivoInicial = s => eventosHelado().some(e => e.sabor === s) ? "acabo" : "";                         // la primera vez se elige a propósito: no se asume
const recienteDe = s => eventosHelado().filter(e => e.sabor === s && Date.now() - e.t < MIN_REPETIDO * 60000).slice(-1)[0];
const puedeAnularCambio = e => esAdmin() || (e.dev === DEV.id && Date.now() - e.t < MIN_ANULAR_CAJA * 60000);
const nombreEquipo = dev => (col("dispositivos")[dev] || {}).nombre || (dev === DEV.id ? DEV.nombre : "") || "otro equipo";
function cambioSheet() {
  const c = S.cambio || {}, medido = c.sabor && eventosHelado().some(e => e.sabor === c.sabor), rec = c.sabor && recienteDe(c.sabor);
  const ops = !c.sabor ? [] : medido ? [["acabo", "Se acabó y puse una caja nueva"], ["danada", "Se dañó o se derritió y puse una caja nueva"]]
    : [["acabo", "Se acabó y abrí una caja nueva"], ["inicio", "Todavía no se acaba: empezar a contar la que ya está abierta (no descuenta cajas)"]];
  if (rec) pedirNombres([rec.uid]);
  const lista = eventosHelado().filter(puedeAnularCambio).filter(e => Date.now() - e.t < 24 * 3600000).slice(-6).reverse();
  return head("Cambio de caja de helado") + `<p class="muted" style="margin-top:0">Márcalo cuando pongas una caja nueva. OLI descuenta una caja cerrada y cuenta cuántas bolas dio la anterior.</p>
    <label class="f">¿De qué sabor?</label><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px">${saboresHelado().map(s => `<button class="btn ${c.sabor === s.id ? "pri" : "ghost"}" style="min-height:52px${c.ofrecer && c.ofrecer.includes(s.id) && c.sabor !== s.id ? ";border-color:var(--marca)" : ""}" data-act="cambioSabor" data-id="${esc(s.id)}">${esc(nombreSabor(s.id))}</button>`).join("")}</div>
    ${ops.length ? `<label class="f">¿Qué pasó?</label><div style="display:flex;flex-direction:column;gap:8px">${ops.map(([k, l]) => `<button class="btn ${c.motivo === k ? "pri" : "ghost"}" style="justify-content:flex-start;text-align:left" data-act="cambioMotivo" data-v="${k}" aria-pressed="${c.motivo === k}">${l}</button>`).join("")}</div>` : ""}
    ${c.motivo === "danada" ? `<label class="f" for="cc-obs">Cuéntanos qué pasó (opcional)</label><input class="in plain" id="cc-obs" placeholder="Ej: se derritió por un corte de luz">` : ""}
    ${rec ? `<div class="notice warn" style="margin-top:12px">Ya se marcó un cambio de caja de <b>${esc(nombreSabor(c.sabor))}</b> a las ${hora(rec.t)} (${esc(nombreDe(rec.uid) || "alguien")} en ${esc(nombreEquipo(rec.dev))}). Guarda solo si de verdad se abrió <b>otra</b> caja.</div>` : ""}
    <button class="btn pri xl wide" style="margin-top:14px" data-act="doCambioCaja" ${c.sabor && c.motivo && !c.guardando ? "" : "disabled"}>${c.guardando ? "GUARDANDO…" : rec ? "SÍ, ES OTRA CAJA: GUARDAR" : "GUARDAR"}</button>
    ${lista.length ? `<h3 style="font-size:15px;margin:16px 0 4px">${esAdmin() ? "Cambios de las últimas 24 horas" : "Tus cambios recientes"}</h3>${lista.map(e => `<div class="row" style="padding:8px 0"><div class="l" style="flex:1"><b>${esc(nombreSabor(e.sabor))}</b> · ${hora(e.t)}<div class="xs muted">${esc({acabo: "caja nueva", danada: "la anterior se dañó", inicio: "empezó a contarse"}[e.motivo] || "")} · ${esc(nombreEquipo(e.dev))}</div></div><button class="btn ghost sm" data-act="anularCambio" data-id="${esc(e.id)}">Anular</button></div>`).join("")}<p class="xs muted">${esAdmin() ? "Anula un cambio marcado por error o repetido: la caja vuelve al inventario." : "Puedes anular un cambio tuyo en los " + MIN_ANULAR_CAJA + " minutos siguientes; después, pídeselo al administrador."}</p>` : ""}`;
}
ACT.cambioSabor = (el, d) => { if (!S.cambio) return; S.cambio.sabor = d.id; S.cambio.motivo = motivoInicial(d.id); redrawSheet(true); };
ACT.cambioMotivo = (el, d) => { if (S.cambio && ["acabo", "danada", "inicio"].includes(d.v)) { S.cambio.motivo = d.v; redrawSheet(true); } };
ACT.doCambioCaja = async () => {
  const c = S.cambio; if (!c || !c.sabor || c.guardando) return; if (!c.motivo) { toast("Elige qué pasó.", true); return; }
  const obs = (($("#cc-obs") || {}).value || "").trim(), antes = (rendimientoCajas()[c.sabor] || []).find(k => k.abierta);
  c.guardando = true; redrawSheet(true);
  const ok = await guardar(async () => { await registrarCambioCaja(c.sabor, c.motivo, obs); return true; },
    c.motivo === "inicio" ? "Listo: desde ahora se cuentan las bolas de " + nombreSabor(c.sabor) : "Caja de " + nombreSabor(c.sabor) + " cambiada" + (esAdmin() && antes && !antes.parcial && c.motivo === "acabo" ? " · la anterior dio " + antes.bolas + " bolas" : ""));
  c.guardando = false;
  if (ok !== true) { redrawSheet(true); return; }
  S.cambio = null; if (c.desdeCono && S.cono) abrir(conoSheet); else cerrar();            // si venía de vender un cono, vuelve al cono sin perder lo elegido
};
ACT.anularCambio = async (el, d) => {
  const e = itemsHelado().find(x => x.id === d.id && x.sabor); if (!e) return;
  if (!puedeAnularCambio(e)) { toast("Pasaron más de " + MIN_ANULAR_CAJA + " minutos o no es de este equipo: pídeselo al administrador.", true); return; }
  const volver = sheetFn, como = {live: sheetLive, wide: sheetWide};                                                                 // la confirmación reemplaza la hoja: después se vuelve a la misma (cambio de caja o rendimiento)
  const si = await confirmar({titulo: "¿Anular el cambio de " + nombreSabor(e.sabor) + " de las " + hora(e.t) + "?", texto: "Úsalo si se marcó por error o dos veces. La caja vuelve al inventario y las bolas se cuentan como si ese cambio no hubiera pasado.", si: "Sí, anular", no: "No"});
  if (si) await guardar(() => anularCambioCaja(e), "Cambio anulado");
  if (volver) abrir(volver, como);
};
async function registrarCambioCaja(sabor, motivo, obs) {
  const p = prod(sabor); if (!p || !p.sabor) throw new Error("Elige el sabor.");
  if (!["acabo", "danada", "inicio"].includes(motivo)) throw new Error("Elige qué pasó.");
  await agregarItemHelado({id: newId(), t: Date.now(), sabor, motivo, obs: obs || "", uid: uidActual(), bc: bolasCaja()});
  audit("CAMBIO_CAJA_HELADO", sabor, nombreSabor(sabor) + " · " + ({acabo: "caja nueva", danada: "la anterior se dañó o derritió", inicio: "empieza a contarse"}[motivo]) + (obs ? " · " + obs : ""));
}
async function anularCambioCaja(e) {
  if (!puedeAnularCambio(e)) throw Object.assign(new Error("denied"), {code: "denied"});
  await agregarItemHelado({id: newId(), t: Date.now(), anula: e.id, uid: uidActual()}, e.docId);   // en el mismo documento del cambio (p. ej. uno de antes de medianoche u otro equipo)
  audit("ANULA_CAMBIO_CAJA", e.sabor, nombreSabor(e.sabor) + " · cambio de las " + hora(e.t));
}
async function agregarItemHelado(item, docId) {
  const docs = col("cajashelado");
  if (docId && docs[docId]) { const cur = docs[docId]; await put("cajashelado", docId, Object.assign({}, cur, {items: (cur.items || []).concat([item])})); return; }   // conserva su fecha y su equipo
  const f = S.today, id = cajaId(f), cur = docs[id] || {fecha: f, dev: DEV.id, items: []};
  await put("cajashelado", id, Object.assign({}, cur, {fecha: f, dev: DEV.id, items: (cur.items || []).concat([item])}));
}

/* ---------- tarjeta en Inventario y detalle para el administrador ---------- */
function cardHelados() {
  const ss = saboresHelado(); if (!ss.length) return "";
  const adm = esAdmin(), r = rendimientoCajas(), c = confConos();
  return `<div class="card"><div class="row" style="border:0;padding-top:0;align-items:center"><h3 style="margin:0">Cajas de helado</h3><button class="btn pri sm" data-act="cambioCaja">Cambié una caja</button></div>
    ${ss.map(s => { const cs = r[s.id] || [], ab = cs.find(k => k.abierta), st = stockDe(s.id), ult = cs.filter(k => !k.abierta && !k.parcial).slice(-1)[0];
      return `<div class="row" style="padding:9px 0;align-items:flex-start"><div class="l" style="flex:1"><b>${esc(nombreSabor(s.id))}</b>
        <div class="small muted">${st == null ? "Cajas cerradas: sin contar" : "Cajas cerradas: " + fmtN(Math.max(0, st), 0)} · ${ab ? "abierta desde " + diaCorto(ymd(new Date(ab.desde))) + " " + hora(ab.desde) + (adm ? " · lleva " + ab.bolas + (ab.bolas === 1 ? " bola" : " bolas") : "") : "aún no se cuenta"}</div>
        ${adm && (ult || (ab && ab.estado === "muchas")) ? `<div class="small" style="margin-top:3px">${ab && ab.estado === "muchas" ? pillCaja(ab) + " la abierta ya pasó de " + ab.max : pillCaja(ult) + " última caja: " + ult.bolas + " bolas"}</div>` : ""}</div></div>`; }).join("")}
    ${adm ? `<p class="xs muted" style="margin:8px 0 0">Esperado ${c.bolasCaja} bolas por caja · aceptable ${c.min} a ${c.max} (se cambia en Ajustes).</p><button class="btn ghost sm" style="margin-top:8px" data-act="verRendimiento">Ver todas las cajas</button>` : ""}</div>`;
}
ACT.verRendimiento = () => abrir(() => {
  const ks = cajasCerradasHelado().slice(0, 60), c = confConos();
  return head("Rendimiento de cajas de helado") + `<p class="muted" style="margin-top:0">Esperado ${c.bolasCaja} bolas por caja; aceptable de ${c.min} a ${c.max}. Una caja dañada no cuenta para el rendimiento: va a pérdidas.</p>
    ${ks.length ? `<div class="card flat">${ks.map(k => { pedirNombres([k.cierre.uid]); return `<div class="row" style="align-items:flex-start;padding:9px 0"><div class="l" style="flex:1"><b>${esc(nombreSabor(k.sabor))} · ${k.bolas} bolas</b><div class="small muted">${diaCorto(ymd(new Date(k.desde)))} ${hora(k.desde)} → ${diaCorto(ymd(new Date(k.hasta)))} ${hora(k.hasta)} · cambió ${esc(nombreDe(k.cierre.uid) || "—")}${k.cierre.obs ? " · " + esc(k.cierre.obs) : ""}</div></div><div style="text-align:right">${pillCaja(k)}${esAdmin() ? `<div><button class="btn ghost sm" style="margin-top:4px" data-act="anularCambio" data-id="${esc(k.cierre.id)}" aria-label="Anular el cambio de caja de ${esc(nombreSabor(k.sabor))} de las ${hora(k.hasta)}">Anular cambio</button></div>` : ""}</div></div>`; }).join("")}</div>` : '<p class="muted">Todavía no se ha terminado ninguna caja. Cuando se marque el primer cambio, aparecerá aquí cuántas bolas dio.</p>'}
    <button class="btn pri wide" style="margin-top:12px" data-act="cerrar">Entendido</button>`;
});
