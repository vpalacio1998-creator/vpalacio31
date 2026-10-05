/* ============ 50 · interfaz: base (navegación, ventanas, componentes) ============
   Principios: una acción principal por pantalla, botones grandes, texto humano, ícono + texto, errores recuperables. */
const ACT = {};
const VIEWS = {};
const RUTAS = {
  hoy: {t: "Inicio", i: "hoy", rol: "admin"}, vender: {t: "Vender", i: "vender", rol: "all"}, caja: {t: "Caja", i: "caja", rol: "all"}, inventario: {t: "Inventario", i: "inventario", rol: "all"},
  compras: {t: "Compras", i: "compras", rol: "admin"}, productos: {t: "Productos", i: "productos", rol: "admin"}, analisis: {t: "Análisis", i: "analisis", rol: "admin"}, finanzas: {t: "Dinero", i: "finanzas", rol: "admin"},
  contabilidad: {t: "Contabilidad", i: "reportes", rol: "admin"}, reportes: {t: "Informes", i: "descargar", rol: "admin"}, equipo: {t: "Equipo", i: "equipo", rol: "admin"}, ajustes: {t: "Ajustes", i: "ajustes", rol: "admin"}
};
const GRUPOS_ADMIN = [["Operación", ["vender", "caja", "inventario", "compras"]], ["Negocio", ["productos", "analisis", "finanzas"]], ["Administración", ["contabilidad", "reportes", "equipo", "ajustes"]]];
const rutasPermitidas = () => esAdmin() ? Object.keys(RUTAS) : ["vender", "caja", "inventario"];
const rutaOk = r => !!RUTAS[r] && rutasPermitidas().includes(r);

/* ---------- avisos ---------- */
let toastT = 0;
function toast(msg, err) { const t = $("#toast"); if (!t) return; t.textContent = msg; t.className = "toast on" + (err ? " err" : ""); clearTimeout(toastT); toastT = setTimeout(() => t.className = "toast", err ? 4200 : 2200); }

/* ---------- ventanas (hojas) ---------- */
let sheetFn = null, sheetLive = false, sheetWide = false;
function abrir(fn, o = {}) { sheetFn = fn; sheetLive = !!o.live; sheetWide = !!o.wide; $("#sheet").classList.remove("hidden"); $("#sheet").classList.toggle("wide", sheetWide); redrawSheet(true); }
function cerrar() { sheetFn = null; sheetLive = false; $("#sheet").classList.add("hidden"); $("#panel").innerHTML = ""; }
function redrawSheet(force) {
  if (!sheetFn) return; const ae = document.activeElement, p = $("#panel");
  if (!force && ae && p.contains(ae) && /INPUT|TEXTAREA|SELECT/.test(ae.tagName)) return;
  const sc = p.scrollTop; p.innerHTML = sheetFn(); p.scrollTop = sc; const f = p.querySelector("[autofocus]"); if (f && force) f.focus();
}
function head(t, volver) { return `<div class="head"><h2>${esc(t)}</h2><button class="btn ghost sm" data-act="cerrar">${ic("x", 18)} ${volver || "Cerrar"}</button></div>`; }
function confirmar(o) {
  return new Promise(res => {
    ACT._conf = v => { cerrar(); res(v); };
    abrir(() => `<div class="head"><h2>${esc(o.titulo)}</h2></div><p style="margin:0 0 16px">${o.texto || ""}</p>
      <div class="split"><button class="btn ghost xl" data-act="_conf" data-v="0">${esc(o.no || "No")}</button><button class="btn ${o.peligro ? "" : "pri"} xl" style="${o.peligro ? "background:var(--danger);color:#fff" : ""}" data-act="_conf" data-v="1" autofocus>${esc(o.si || "Sí")}</button></div>`);
  });
}
ACT._conf = () => {};
ACT.cerrar = () => cerrar();
const ayuda = t => `<details class="help"><summary aria-label="Ayuda">?</summary><span>${t}</span></details>`;

/* ---------- teclado numérico táctil (menos escritura) ---------- */
function teclado(target) { return `<div class="keypad" data-target="${target}">${[1, 2, 3, 4, 5, 6, 7, 8, 9, "00", 0, "←"].map(k => `<button type="button" data-act="tecla" data-k="${k}" data-t="${target}" aria-label="${k === "←" ? "Borrar" : k}">${k}</button>`).join("")}</div>`; }
ACT.tecla = (el, d) => {
  const inp = document.getElementById(d.t); if (!inp) return; let v = String(num(inp.value) || ""); if (d.k === "←") v = v.slice(0, -1); else if (v.length < 10) v += d.k;
  inp.value = v ? fmt(Number(v)) : ""; inp.dispatchEvent(new Event("input", {bubbles: true}));
};
function sel(id, opts, val) { return `<div class="paygrid" id="${id}" data-sel="${id}">${opts.map(o => `<button type="button" data-act="elegir" data-g="${id}" data-v="${esc(o)}" aria-pressed="${o === val}">${esc(o)}</button>`).join("")}</div>`; }
ACT.elegir = (el, d) => { const g = document.getElementById(d.g); g.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b === el ? "true" : "false")); g.dataset.val = d.v; };
const selVal = id => { const g = document.getElementById(id); if (!g) return ""; const b = g.querySelector('[aria-pressed="true"]'); return b ? b.dataset.v : ""; };
const stepper = (id, v = 1, mx = 999) => `<div class="qty" style="justify-content:center;gap:14px"><button type="button" data-act="paso" data-i="${id}" data-d="-1" aria-label="Menos" style="width:56px;height:56px;font-size:26px">−</button><input class="in plain" id="${id}" inputmode="numeric" value="${v}" style="width:90px;text-align:center;font-size:24px;font-weight:700" data-max="${mx}"><button type="button" data-act="paso" data-i="${id}" data-d="1" aria-label="Más" style="width:56px;height:56px;font-size:26px">+</button></div>`;
ACT.paso = (el, d) => { const i = document.getElementById(d.i); i.value = clamp(num(i.value) + Number(d.d), 1, Number(i.dataset.max) || 999); };

/* ---------- gráficos simples (sin adornos) ---------- */
let tipEl = null;
function tip(e, txt) { if (!tipEl) { tipEl = document.createElement("div"); tipEl.className = "tip"; document.body.appendChild(tipEl); } if (txt == null) { tipEl.style.display = "none"; return; } tipEl.innerHTML = txt; tipEl.style.display = "block"; const w = tipEl.offsetWidth; tipEl.style.left = clamp(e.clientX + 12, 4, innerWidth - w - 4) + "px"; tipEl.style.top = Math.max(4, e.clientY - tipEl.offsetHeight - 12) + "px"; }
document.addEventListener("pointermove", e => { const t = e.target.closest && e.target.closest("[data-tip]"); tip(e, t ? t.dataset.tip : null); });
document.addEventListener("pointerleave", () => tip(null, null), true);
function barras(data, o = {}) {      // data: [{l, v, tip, hi}]
  const W = 340, H = o.h || 150, top = 22, bot = 24, n = data.length, slot = W / Math.max(1, n), bw = Math.min(34, slot * 0.62), max = Math.max(1, ...data.map(x => x.v)), ph = H - top - bot;
  const marcar = new Set(); data.forEach((x, i) => { if (x.v === max && x.v > 0) marcar.add(i); if (x.hi) marcar.add(i); });
  const gs = [0.5, 1].map(f => `<path class="grid" d="M0 ${H - bot - ph * f}H${W}"/>`).join("");
  const bs = data.map((x, i) => { const h = x.v ? Math.max(3, x.v / max * ph) : 2, cx = slot * i + slot / 2, y = H - bot - h;
    return `<g data-tip="${esc(x.tip || x.l + ": " + (o.fmt || fmtK)(x.v))}"><rect class="hit" x="${slot * i}" y="0" width="${slot}" height="${H}"/><rect class="mk" x="${cx - bw / 2}" y="${y}" width="${bw}" height="${h}" rx="4" style="fill:${x.hi ? "var(--marca)" : "var(--bar)"}"/>${marcar.has(i) ? `<text class="v" x="${cx}" y="${y - 6}" text-anchor="middle">${esc((o.fmt || fmtK)(x.v))}</text>` : ""}<text x="${cx}" y="${H - 8}" text-anchor="middle">${esc(x.l)}</text></g>`; }).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria || "Gráfico de barras")}">${gs}${bs}</svg>`;
}
function lineas(series, o = {}) {    // series: [{n, c, pts:[{l,v}]}]
  const W = 340, H = o.h || 160, top = 14, bot = 22, left = 4, pts = series[0].pts, n = pts.length, max = Math.max(1, ...series.flatMap(s => s.pts.map(p => p.v))), min = Math.min(0, ...series.flatMap(s => s.pts.map(p => p.v))), ph = H - top - bot, X = i => left + (W - left * 2) * (n <= 1 ? .5 : i / (n - 1)), Y = v => top + ph * (1 - (v - min) / (max - min || 1));
  const ls = series.map(s => `<path d="${s.pts.map((p, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(p.v).toFixed(1)).join("")}" fill="none" stroke-width="2" stroke-linejoin="round" style="stroke:${s.c}"/>`).join("");
  const hits = pts.map((p, i) => `<rect class="hit" x="${X(i) - (W / n) / 2}" y="0" width="${W / n}" height="${H}" data-tip="${esc(p.l + "<br>" + series.map(s => s.n + ": " + fmt(s.pts[i].v)).join("<br>"))}"/>`).join("");
  const lab = [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i).map(i => `<text x="${X(i)}" y="${H - 6}" text-anchor="${i === 0 ? "start" : i === n - 1 ? "end" : "middle"}">${esc(pts[i].l)}</text>`).join("");
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria || "Gráfico de líneas")}"><path class="grid" d="M0 ${Y(0)}H${W}"/>${ls}${lab}${hits}</svg>` + `<div class="legend">${series.map(s => `<span><i style="background:${s.c}"></i>${esc(s.n)}</span>`).join("")}</div>`;
}
function hbarras(rows, o = {}) {     // rows: [{n, v, txt}]
  const mx = Math.max(1, ...rows.map(r => r.v)); return rows.map(r => `<div class="hbar"><span class="nm" title="${esc(r.n)}">${esc(r.n)}</span><span class="tr"><i style="width:${Math.max(2, r.v / mx * 100)}%"></i></span><span class="vl">${esc(r.txt != null ? r.txt : fmt(r.v))}</span></div>`).join("");
}
const tablaVista = (cols, rows) => `<div class="tbl"><table><thead><tr>${cols.map(c => `<th class="${c.n ? "n" : ""}">${esc(c.h)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map(c => `<td class="${c.n ? "n" : ""}">${c.f ? c.f(r) : esc(r[c.k])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;

/* ---------- piezas reutilizables ---------- */
const sevIcon = s => s === "bad" ? ic("alerta", 18) : s === "warn" ? ic("alerta", 18) : ic("ok", 18);
const sevTxt = s => s === "bad" ? "Urgente" : s === "warn" ? "Atención" : "Bien";
const pillEstado = e => `<span class="pill ${estadoPill(e)}">${e.k === "agotado" ? ic("x", 14) : e.k === "bajo" ? ic("alerta", 14) : e.k === "disponible" ? ic("ok", 14) : ""}${esc(e.k === "sin" ? "Sin contar" : e.txt)}</span>`;
const vacio = (icono, t, d, btn) => `<div class="empty">${ic(icono, 44)}<b>${esc(t)}</b>${d ? `<span>${esc(d)}</span>` : ""}${btn || ""}</div>`;
const cargando = () => `<div class="card"><div class="skel" style="width:60%;margin-bottom:12px"></div><div class="skel" style="width:90%;margin-bottom:12px"></div><div class="skel" style="width:75%"></div></div>`;
const cabecera = (t, sub, acc) => `<div class="page-h"><div><h2>${esc(t)}</h2>${sub ? `<p>${sub}</p>` : ""}</div>${acc || ""}</div>`;
const nombreCorto = p => p.nombre.replace(/^Paleta /, "");
const saludo = () => { const h = new Date().getHours(); return h < 12 ? "Buenos días" : h < 19 ? "Buenas tardes" : "Buenas noches"; };
function rangoControles(nombre = "rango") {
  return `<div class="seg" role="group" aria-label="Periodo">${RANGOS.map(([k, l]) => `<button data-act="rango" data-v="${k}" aria-pressed="${S.rango === k}">${l}</button>`).join("")}</div>${S.rango === "custom" ? `<div class="split" style="margin-top:10px"><div><label class="f" for="f-desde">Desde</label><input class="in" type="date" id="f-desde" value="${esc(S.desde || addDays(S.today, -6))}" data-act-change="fechas"></div><div><label class="f" for="f-hasta">Hasta</label><input class="in" type="date" id="f-hasta" value="${esc(S.hasta || S.today)}" data-act-change="fechas"></div></div>` : ""}`;
}
ACT.rango = (el, d) => { S.rango = d.v; draw(); };

/* ---------- conectividad ---------- */
function connInfo() {
  const e = SYNC.estado, pv = ventasPendientes();
  if (DS.mode === "local") return {k: "local", txt: "Solo en este equipo", cls: "off", ic: "info"};
  if (e === "offline") return {k: "offline", txt: "Sin conexión" + (pv ? " · " + pv + " por enviar" : ""), cls: "warn", ic: "alerta"};
  if (e === "sincronizando") return {k: "sync", txt: "Enviando " + Math.min(SYNC.hecho + 1, SYNC.total) + "/" + SYNC.total, cls: "ok", ic: "rayo"};
  if (e === "error") return {k: "error", txt: "Hay datos que revisar", cls: "bad", ic: "alerta"};
  if (e === "pendiente") return {k: "pend", txt: pv ? pv + " ventas por enviar" : "Enviando cambios", cls: "warn", ic: "rayo"};
  return {k: "ok", txt: "Conectado", cls: "ok", ic: "ok"};
}
function connPill() { const c = connInfo(); return `<button class="pill ${c.cls}" data-act="verEnvio" style="min-height:36px;border:0" aria-label="Estado de conexión: ${esc(c.txt)}"><span class="dot ${c.cls === "ok" ? "" : c.cls === "bad" ? "bad" : "off"}" style="${c.cls === "warn" ? "background:var(--warn)" : ""}"></span>${esc(c.txt)}</button>`; }
const ventaSyncTxt = e => ({pendiente: "Pendiente de enviar", sincronizando: "Enviando…", sincronizada: "Enviada ✓", error: "Necesita revisión", local: "Guardada"}[e] || e);
ACT.verEnvio = () => abrir(() => {
  const c = connInfo(), mias = ventasOk().filter(v => v.dev === DEV.id && v.fecha >= addDays(S.today, -1)).slice(-12).reverse(), pend = pendientes().length;
  return head("Estado de envío") + `<div class="notice ${c.cls === "ok" ? "ok" : c.cls === "bad" ? "bad" : ""}"><b>${esc(c.txt)}</b><br>${DS.mode === "local" ? "Los datos se guardan solo en este equipo." : c.k === "offline" ? "Trabajando sin conexión. Las ventas se guardan en este equipo y se enviarán solas cuando vuelva Internet." : pend ? "Hay " + pend + " cambios por enviar. Se envían solos." : "Todo está al día con el servidor."}</div>
    ${SYNC.ultima ? `<p class="small muted">Último envío: ${haceTxt(SYNC.ultima)}</p>` : ""}
    <h3>Mis últimas ventas</h3>${mias.length ? mias.map(v => `<div class="row"><div class="l"><b>${esc(v.num || "Venta")}</b> · ${hora(v.t)}<div class="small muted">${fmt(v.total)} · ${esc(v.m)}</div></div><div class="r"><span class="pill ${ventaSync(v) === "sincronizada" || ventaSync(v) === "local" ? "ok" : ventaSync(v) === "error" ? "bad" : "warn"}">${esc(ventaSyncTxt(ventaSync(v)))}</span></div></div>`).join("") : '<p class="muted">Todavía no hay ventas en este equipo.</p>'}
    ${rechazadas().length ? `<div class="notice bad" style="margin-top:12px">${rechazadas().length} cambio(s) no se pudieron enviar porque el servidor no los aceptó. Siguen guardados aquí. Avísale al administrador.</div>` : ""}
    <div class="small muted" style="margin-top:12px">Este equipo: <b>${esc(DEV.nombre || DEV.id)}</b></div>`;
}, {live: true});

/* ---------- ayuda y bienvenida ---------- */
ACT.ayuda = () => abrir(() => head("¿Necesitas ayuda?") + (esAdmin() ? `
  <div class="card flat"><b>Cada día</b><ol style="margin:8px 0 0;padding-left:20px"><li>Abre <b>Inicio</b>: ahí OLI te dice cómo va el negocio y qué hacer.</li><li>Si algo se acaba, entra a <b>Compras</b> y toca <b>¿Qué pedir?</b></li><li>Al final del día revisa <b>Caja</b>.</li></ol></div>
  <div class="card flat"><b>Para empezar</b><ol style="margin:8px 0 0;padding-left:20px"><li>Crea tus <b>Productos</b> con nombre, precio e inventario.</li><li>Invita a tu equipo con el botón <b>Compartir</b> de Claude (dales acceso de colaborador).</li><li>En la tablet, abre la <b>Caja</b> y empieza a vender.</li></ol></div>
  <button class="btn pri wide xl" data-act="cerrar">Entendido</button>` : `
  <div class="card flat"><b>Para vender</b><ol style="margin:8px 0 0;padding-left:20px"><li>Toca el producto. Toca otra vez para agregar otra unidad.</li><li>Toca <b>COBRAR</b>.</li><li>Elige cómo paga y toca <b>CONFIRMAR</b>.</li></ol></div>
  <div class="card flat"><b>¿Te equivocaste?</b><br>En el pedido usa <b>−</b> o <b>Quitar</b>. Antes de confirmar puedes cambiar cómo paga.</div>
  <div class="card flat"><b>¿Se cayó Internet?</b><br>No pasa nada: sigue vendiendo. OLI envía todo solo cuando vuelva.</div>
  <button class="btn pri wide xl" data-act="cerrar">Entendido</button>`));
ACT.onboardOmitir = () => { try { localStorage.setItem("oli-onboard", "1"); } catch (e) {} draw(); };

/* ---------- barra superior / menú ---------- */
function navBtn(r, cls) {
  const R = RUTAS[r], b = badgeDe(r);
  return `<button class="${cls}" data-act="ir" data-r="${r}" aria-current="${S.tab === r ? "page" : "false"}"${b ? ` data-n="${b.n}"${b.tone ? ` data-tone="${b.tone}"` : ""}` : ""}>${ic(R.i, 22)}<span>${R.t}</span></button>`;
}
function badgeDe(r) {
  const al = alertas();
  if (r === "inventario") { const n = al.filter(a => a.tipo === "inventario").length; return n ? {n, tone: al.some(a => a.tipo === "inventario" && a.sev === "bad") ? "danger" : ""} : null; }
  if (r === "caja") { const n = al.filter(a => a.tipo === "caja").length; return n ? {n, tone: ""} : null; }
  if (r === "compras" && esAdmin()) { const n = recomendarCompra(fechasHorizonte("3")).filter(x => x.comprar > 0 && x.riesgo !== "ok").length; return n ? {n, tone: ""} : null; }
  if (r === "hoy" && esAdmin()) { const n = al.filter(a => a.sev === "bad").length; return n ? {n, tone: "danger"} : null; }
  if (r === "equipo" && esAdmin()) { const n = al.filter(a => a.tipo === "sync").length; return n ? {n, tone: ""} : null; }
  return null;
}
function drawNav() {
  const adm = esAdmin(), nm = adm ? Object.keys(RUTAS).filter(r => !["hoy", "vender", "caja", "inventario", "compras"].includes(r)).reduce((a, r) => a + ((badgeDe(r) || {}).n || 0), 0) : 0;
  const mobile = adm ? ["hoy", "vender", "inventario", "compras"] : ["vender", "caja", "inventario"];
  $("#tabs").innerHTML = mobile.map(r => navBtn(r, "")).join("") + (adm ? `<button data-act="mas" aria-current="${["productos", "analisis", "finanzas", "contabilidad", "reportes", "equipo", "ajustes", "caja"].includes(S.tab) ? "page" : "false"}"${nm ? ` data-n="${nm}"` : ""}>${ic("mas", 22)}<span>Más</span></button>` : "");
  const items = adm ? `${navBtn("hoy", "nv")}${GRUPOS_ADMIN.map(([g, rs]) => `<div class="grp">${g}</div>${rs.map(r => navBtn(r, "nv")).join("")}`).join("")}` : ["vender", "caja", "inventario"].map(r => navBtn(r, "nv")).join("");
  $("#rail").innerHTML = `<div class="logo">OLI</div>${items}<div class="sp"></div><button class="nv" data-act="ayuda" style="display:flex;align-items:center;gap:12px;border:0;background:none;padding:10px 12px;font-weight:600;color:var(--muted);border-radius:12px">${ic("info", 22)}<span>¿Necesitas ayuda?</span></button>
    <div class="meta">${connPill()}</div>${DS.mode === "local" ? `<button class="btn ghost sm" style="margin:8px 10px 0" data-act="rolLocal">Ver como: ${esAdmin() ? "Administrador" : "Empleado"}</button>` : ""}<div class="meta" style="padding-top:2px"><span class="xs">${esc(DEV.nombre || "")}</span></div>`;
}
ACT.mas = () => abrir(() => {
  const g = GRUPOS_ADMIN.map(([t, rs]) => `<h3 style="margin-top:12px">${t}</h3><div class="masgrid">${rs.filter(r => r !== "vender" && r !== "inventario" && r !== "compras").map(r => { const b = badgeDe(r); return `<button data-act="ir" data-r="${r}"${b ? ` data-n="${b.n}"` : ""}>${ic(RUTAS[r].i, 24)}${RUTAS[r].t}</button>`; }).join("")}</div>`).join("");
  return head("Más opciones") + g + `<div class="btns" style="margin-top:14px"><button class="btn ghost" data-act="ayuda">${ic("info", 18)} ¿Necesitas ayuda?</button><button class="btn ghost" data-act="verEnvio">${ic("rayo", 18)} Estado de envío</button></div>`;
});
ACT.ir = (el, d) => { cerrar(); irA(d.r); };
function irA(r) { if (!rutaOk(r)) { toast("Esa sección es solo para el administrador.", true); r = "vender"; } S.tab = r; try { history.replaceState(null, "", "#" + r); } catch (e) {} window.scrollTo(0, 0); draw(); }
function leerHash() { try { const h = (location.hash || "").replace("#", ""); if (h && RUTAS[h]) return h; } catch (e) {} return null; }

ACT.rolLocal = () => { DS.localRole = esAdmin() ? "empleado" : "admin"; DS.isAdmin = DS.localRole === "admin"; try { localStorage.setItem("oli-local-role", DS.localRole); } catch (e) {} S.tab = DS.isAdmin ? "hoy" : "vender"; changed(); };
