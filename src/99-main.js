/* ============ 99 · arranque, dibujo general y eventos ============ */
let nameSheetShown = false, prevSync = "";
const splash = () => `<div class="gate"><div class="box"><div class="logo">OLI</div><p>Abriendo…</p><div class="skel" style="width:60%;margin:12px auto"></div></div></div>`;
function onboardingHTML() {
  if (!esAdmin()) return `<div class="gate"><div class="box"><div class="logo">OLI</div><h2>Todavía no está listo</h2><p>El administrador debe configurar OLI antes de empezar a vender. Pídele que abra la aplicación.</p><button class="btn pri xl wide" data-act="reintentar">${ic("rayo", 20)} Revisar de nuevo</button></div></div>`;
  return `<div class="gate"><div class="box" style="max-width:520px"><div class="logo">OLI</div><h2>Bienvenido a OLI 🌱</h2><p>Elige cómo quieres empezar. Puedes cambiarlo cuando quieras.</p>
    <button class="btn pri xl wide" data-act="empezarOLI" style="margin-bottom:10px">${ic("paleta", 22)} Empezar con el catálogo de OLI</button>
    <button class="btn ghost xl wide" data-act="empezarDemo" style="margin-bottom:10px">${ic("analisis", 22)} Explorar con datos de demostración</button>
    <button class="btn ghost wide" data-act="empezarVacio">Empezar desde cero</button>
    <div class="card flat" style="text-align:left;margin-top:18px"><b>Para empezar, solo 5 pasos</b><ol style="margin:8px 0 0;padding-left:20px"><li>Revisa tus productos y precios.</li><li>Pon el inventario de lo que tienes.</li><li>Define tus gastos fijos en Ajustes.</li><li>Da acceso a tu equipo con el botón Compartir.</li><li>Abre tu primera caja y vende.</li></ol><p class="small muted" style="margin:8px 0 0">No tienes que completar todo hoy.</p></div><p class="credit">Software by <b>VP Visual Project</b></p></div></div>`;
}
ACT.reintentar = () => { changed(); };
ACT.empezarOLI = async () => { toast("Preparando OLI…"); await guardar(() => cargarCatalogoOLI(), "Listo. Revisa tus productos."); S.tab = "productos"; draw(); };
ACT.empezarDemo = async () => { toast("Cargando un mes de ejemplo…"); await guardar(() => cargarDemo(), "Datos de demostración listos"); S.tab = "hoy"; draw(); };
ACT.empezarVacio = async () => { await guardar(() => empezarVacio(), "Listo"); S.tab = "productos"; draw(); };

function nombreEquipoSheet() {
  nameSheetShown = true;
  abrir(() => `<div class="head"><h2>¿Cómo se llama este equipo?</h2></div><p class="muted" style="margin-top:0">Así el administrador sabrá desde dónde se vende.</p>${sel("dv-n", esAdmin() ? ["Celular del administrador", "Caja 1", "Caja 2", "Computador"] : ["Caja 1", "Caja 2", "Caja 3", "Tablet"], "")}<label class="f" for="dv-o">Otro nombre (opcional)</label><input class="in plain" id="dv-o"><button class="btn pri xl wide" style="margin-top:14px" data-act="doNombreEquipo">CONTINUAR</button>`);
}
ACT.doNombreEquipo = async () => { const n = $("#dv-o").value.trim() || selVal("dv-n"); if (!n) { toast("Elige un nombre.", true); return; } await setDevNombre(n); heartbeat(true); cerrar(); draw(); };

function drawHeader() {
  $("#fecha").textContent = diaLargo(S.today); $("#estado").innerHTML = connInfo().txt;
  const c = connInfo(); $("#dot").className = "dot" + (c.cls === "ok" ? "" : c.cls === "bad" ? " bad" : " off"); $("#dot").style.background = c.cls === "warn" ? "var(--warn)" : "";
  const b = alertas().filter(a => a.sev === "bad").length; const bell = $("#bell"); bell.hidden = !esAdmin(); if (b) bell.dataset.n = b; else delete bell.dataset.n;
  $("#searchbtn").hidden = !esAdmin();
}
function banners() {
  const el = $("#banners"); let h = "";
  if (DS.mode === "db" && !SYNC.online) h += `<div class="notice" style="margin:0 0 12px;display:flex;gap:10px;align-items:center">${ic("info", 20)}<span><b>Trabajando sin conexión.</b> Las ventas se enviarán solas cuando vuelva Internet.${ventasPendientes() ? " Pendientes: <b>" + ventasPendientes() + "</b>." : ""}</span></div>`;
  else if (SYNC.estado === "sincronizando" && SYNC.total > 1) h += `<div class="notice ok" style="margin:0 0 12px">Enviando ${Math.min(SYNC.hecho + 1, SYNC.total)}/${SYNC.total}…</div>`;
  if (DS.error) h += `<div class="notice bad" style="margin:0 0 12px">${esc(DS.error)}</div>`;
  el.innerHTML = h;
}
function loginHTML() {
  return `<div class="gate"><div class="box"><div class="logo">OLI</div><h2>Bienvenido</h2><p>Ingresa para empezar.</p>
    <label class="f" for="lg-mail" style="text-align:left">Correo</label><input class="in plain" id="lg-mail" type="email" autocomplete="username" inputmode="email" placeholder="tucorreo@ejemplo.com">
    <label class="f" for="lg-pass" style="text-align:left">Contraseña</label><input class="in plain" id="lg-pass" type="password" autocomplete="current-password">
    <div id="lg-err" role="alert" style="color:var(--danger);min-height:22px;margin:8px 0;font-size:14px"></div>
    <button class="btn pri xl wide" data-act="login">INGRESAR</button>
    <p class="small muted" style="margin-top:14px">¿Olvidaste tu contraseña? Pídele al administrador que te ayude a cambiarla.</p><p class="credit">Desarrollado por <b>VP Visual Project</b></p></div></div>`;
}
function orgHTML() {
  return `<div class="gate"><div class="box"><div class="logo">OLI</div><h2>Crea tu negocio</h2><p>Esta cuenta aún no pertenece a ningún negocio. Si eres empleado, pídele al administrador que te agregue. Si eres el dueño, crea tu negocio.</p>
    <label class="f" for="og-n" style="text-align:left">Nombre del negocio</label><input class="in plain" id="og-n" value="OLI"><div id="lg-err" role="alert" style="color:var(--danger);min-height:22px;margin:8px 0;font-size:14px"></div>
    <button class="btn pri xl wide" data-act="crearNegocio">CREAR MI NEGOCIO</button><button class="btn ghost wide" style="margin-top:10px" data-act="logout">Salir</button></div></div>`;
}
ACT.login = async () => { const b = $("#lg-err"); b.textContent = ""; const m = $("#lg-mail").value.trim(), p = $("#lg-pass").value; if (!m || !p) { b.textContent = "Escribe tu correo y tu contraseña."; return; }
  try { await sbLogin(m, p); } catch (e) { b.textContent = navigator.onLine === false ? "No hay conexión a Internet para ingresar por primera vez." : (e.message || "No pudimos ingresar."); } };
ACT.crearNegocio = async () => { const n = $("#og-n").value.trim(); if (!n) return; try { await sbCrearNegocio(n); } catch (e) { $("#lg-err").textContent = e.message; } };
ACT.logout = async () => { if (pendientes().length && !(await confirmar({titulo: "Hay ventas sin enviar", texto: "Si sales ahora, quedan guardadas en este equipo y se enviarán cuando vuelvas a ingresar. ¿Salir de todos modos?", si: "Sí, salir", no: "No"}))) return; await sbSalir(); };
function renderView() {
  if (DS.needsLogin) return loginHTML(); if (DS.needsOrg) return orgHTML();
  if (!listo()) return splash();
  const meta = col("meta").app; if (!meta) return onboardingHTML();
  const f = VIEWS[S.tab] || VIEWS.vender; try { return f(); } catch (e) { console.error(e); return vacio("alerta", "Algo no salió bien al mostrar esta pantalla", "Vuelve a Inicio e inténtalo otra vez.", '<button class="btn pri" data-act="ir" data-r="' + (esAdmin() ? "hoy" : "vender") + '">Volver al inicio</button>'); }
}
function draw() {
  const root = $("#app"), meta = listo() && !DS.needsLogin ? col("meta").app : null;
  if (!rutaOk(S.tab)) S.tab = "vender";
  const gate = DS.needsLogin || DS.needsOrg || !listo() || !meta; root.classList.toggle("gate-mode", gate);
  $("#view").innerHTML = renderView();
  if (gate) { $("#ticket").innerHTML = ""; $("#cartbar").innerHTML = ""; $("#tabs").innerHTML = ""; $("#rail").innerHTML = ""; $("#banners").innerHTML = ""; return; }
  syncAuditSubs(); pedirNombres(Object.values(col("ventas")).map(d => d.uid));
  if (DEMO_ACTIVO()) Object.assign(NAMES, DEMO_PERSONAS);
  if (DEV.listo && !DEV.nombre && !nameSheetShown) nombreEquipoSheet();
  drawHeader(); drawNav(); banners();
  const wideT = isWide() && S.tab === "vender";
  $("#app").classList.toggle("has-ticket", wideT); $("#ticket").innerHTML = wideT ? ticketHTML() : "";
  $("#cartbar").innerHTML = !isWide() && S.tab === "vender" ? cartbarHTML() : "";
  if (prevSync && prevSync !== "sincronizado" && SYNC.estado === "sincronizado" && DS.mode === "db") toast("Todo sincronizado ✓");
  prevSync = SYNC.estado;
}
const DEMO_ACTIVO = () => { const m = col("meta").app; return m && m.modo === "demo"; };
const isWide = () => window.matchMedia("(min-width:1100px)").matches;
/* dibujo automático (por cambios de datos): no pisa lo que la persona está escribiendo */
function drawAuto() {
  const ae = document.activeElement, v = $("#view"), tk = $("#ticket");
  const escribiendo = ae && ae !== document.body && /INPUT|TEXTAREA|SELECT/.test(ae.tagName) && (v.contains(ae) || tk.contains(ae)) && ae.id !== "qsearch";
  if (escribiendo) { drawHeader(); banners(); return; }
  const sc = window.scrollY; draw(); if (!sheetFn) window.scrollTo(0, sc); if (sheetLive) redrawSheet();
}
window.draw = drawAuto;
ACT.buscar = () => abrir(() => `${head("Buscar")}<div class="search">${ic("buscar", 20)}<input class="in plain" id="gq" type="search" placeholder="Producto, venta, gasto, compra o persona" autofocus autocomplete="off"></div><div id="gres" style="margin-top:12px"></div>`, {wide: true});
ACT.campana = () => abrir(() => { const al = alertas(); return head("Avisos") + (al.length ? al.map(a => `<button class="alertrow" data-act="${a.tab ? "ir" : "cerrar"}" data-r="${a.tab || ""}"><span class="sev ${a.sev === "ok" ? "" : a.sev}"></span><div><b>${esc(a.t)}</b><span>${esc(a.d || "")}</span></div></button>`).join("") : vacio("ok", "Todo en orden", "No hay avisos por ahora.")); }, {live: true});
document.addEventListener("input", e => { if (e.target.id === "gq") { const q = e.target.value.trim().toLowerCase(), out = $("#gres"); if (q.length < 2) { out.innerHTML = ""; return; } out.innerHTML = buscarGlobal(q); } });
function buscarGlobal(q) {
  const g = (t, items) => items.length ? `<h3 style="font-size:15px">${t}</h3>${items.slice(0, 6).join("")}` : "", r = [];
  const ps = prods().filter(p => p.nombre.toLowerCase().includes(q)).map(p => `<button class="alertrow" data-act="editProd" data-id="${esc(p.id)}"><div><b>${esc(p.nombre)}</b><span>${fmt(p.precio)} · ${esc(p.cat)}</span></div></button>`);
  const vs = ventasAll().filter(v => (v.num || "").toLowerCase().includes(q) || (v.items || []).some(i => (i.n || "").toLowerCase().includes(q)) || String(v.total).includes(q) || (v.m || "").toLowerCase().includes(q)).slice(-6).reverse().map(v => `<button class="alertrow" data-act="verVenta" data-id="${esc(v.id)}"><div><b>${esc(v.num || "Venta")} · ${fmt(v.total)}</b><span>${diaCorto(v.fecha)} ${hora(v.t)} · ${esc(v.m)}${v.anulada ? " · anulada" : ""}</span></div></button>`);
  const gs = Object.entries(col("gastos")).filter(([, x]) => ((x.desc || "") + (x.cat || "") + (x.proveedor || "")).toLowerCase().includes(q)).map(([id, x]) => `<div class="row"><div class="l"><b>${esc(x.cat)}</b> ${esc(x.desc || "")}<div class="small muted">${diaCorto(x.fecha)}</div></div><b>${fmt(x.valor)}</b></div>`);
  const cs = Object.values(col("compras")).filter(x => ((x.proveedor || "") + (x.factura || "")).toLowerCase().includes(q)).map(x => `<div class="row"><div class="l"><b>${esc(x.proveedor || "Compra")}</b><div class="small muted">${diaCorto(x.fecha)} · ${esc(x.estado)}</div></div></div>`);
  const pe = personasConocidas().filter(x => (nombreDe(x.uid) || "").toLowerCase().includes(q)).map(x => `<div class="row"><b>${esc(nombreDe(x.uid))}</b><span class="small muted">${x.ventas || 0} ventas</span></div>`);
  return (g("Productos", ps) + g("Ventas", vs) + g("Gastos", gs) + g("Compras", cs) + g("Personas", pe)) || '<p class="muted">No encontré nada.</p>';
}
ACT.verVenta = (el, d) => { const v = ventasAll().find(x => x.id === d.id); if (!v) return; pedirNombres([v.uid]);
  abrir(() => `${head(v.num || "Venta")}<div class="notice ${v.anulada ? "bad" : "ok"}">${v.anulada ? "Esta venta fue anulada." : "Venta confirmada."} · ${esc(ventaSyncTxt(ventaSync(v)))}</div>
    <div class="row"><span>Fecha</span><b>${diaCorto(v.fecha)} ${hora(v.t)}</b></div><div class="row"><span>Caja</span><b>${esc((col("dispositivos")[v.dev] || {}).nombre || v.dev || "")}</b></div><div class="row"><span>Empleado</span><b>${esc(nombreDe(v.uid) || "—")}</b></div><div class="row"><span>Pago</span><b>${esc(v.m)}</b></div>
    ${(v.items || []).map(i => `<div class="row"><span>${i.q} × ${esc(i.n)}</span><b>${fmt(i.p * i.q)}</b></div>`).join("")}${v.desc ? `<div class="row"><span>Descuento</span><b>- ${fmt(v.desc)}</b></div>` : ""}<div class="row"><b>Total</b><b class="big" style="font-size:24px">${fmt(v.total)}</b></div>
    ${!v.anulada ? `<button class="btn danger wide" style="margin-top:10px" data-act="anular" data-id="${esc(v.id)}">Anular esta venta</button>` : ""}`); };
ACT.anular = async (el, d) => { const v = ventasAll().find(x => x.id === d.id); if (!v) return; if (!(await confirmar({titulo: "¿Anular esta venta?", texto: "Se descuenta de las ventas y el inventario vuelve a su lugar. Queda registrado.", si: "Sí, anular", no: "No", peligro: true}))) return; await guardar(async () => { await anularVenta(v, "Anulada por " + (esAdmin() ? "administrador" : "empleado")); cerrar(); }, "Venta anulada"); };

/* ---------- eventos ---------- */
document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]"); if (!el || el.tagName === "INPUT" && el.dataset.actChange) return;
  const f = ACT[el.dataset.act]; if (f) { if (el.tagName !== "SUMMARY") e.preventDefault(); try { const r = f(el, el.dataset, e); if (r && r.catch) r.catch(err => { console.error(err); toast(errMsg(err), true); }); } catch (err) { console.error(err); toast(errMsg(err), true); } }
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && sheetFn) { cerrar(); return; }
  const tag = (document.activeElement || {}).tagName;
  if (e.key === "Enter" && !e.shiftKey) {
    if (sheetFn) { const b = $("#panel [data-act='confirmarVenta']"); if (b && !/TEXTAREA/.test(tag)) { e.preventDefault(); b.click(); } return; }
    if (S.tab === "vender" && S.cart.length && !/INPUT|TEXTAREA|SELECT/.test(tag)) { e.preventDefault(); ACT.cobrar(); }
  }
  if (e.key === "/" && esAdmin() && !/INPUT|TEXTAREA|SELECT/.test(tag)) { e.preventDefault(); ACT.buscar(); }
});
window.addEventListener("hashchange", () => { const h = (location.hash || "").replace("#", ""); if (!h) return; if (!RUTAS[h]) return; if (!rutaOk(h)) { toast("Esa sección es solo para el administrador.", true); try { history.replaceState(null, "", "#" + (esAdmin() ? "hoy" : "vender")); } catch (e) {} S.tab = "vender"; } else S.tab = h; draw(); });
window.matchMedia("(min-width:1100px)").addEventListener("change", () => draw());
document.querySelectorAll("#sheet [data-close]").forEach(b => b.addEventListener("click", cerrar));
$("#sheet .bg").addEventListener("click", cerrar);

/* ---------- boot ---------- */
(async function boot() {
  aplicarTema(); $("#view").innerHTML = splash();
  try {
    await bootData(); await restoreCart();
    S.tab = leerHash() || (esAdmin() ? "hoy" : "vender"); if (!rutaOk(S.tab)) S.tab = "vender";
    changed(); setTimeout(() => heartbeat(true), 1500);
    setInterval(() => { const t = ymd(); if (t !== S.today) { S.today = t; changed(); } }, 30000);
  } catch (e) { console.error(e); $("#view").innerHTML = vacio("alerta", "No se pudo abrir OLI", "Recarga la página. Si sigue igual, avisa al administrador."); }
})();
