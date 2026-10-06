/* cómo dar acceso depende de dónde corre OLI: servidor propio (cuentas con correo), Claude (botón Compartir) o un solo equipo */
const accesoHTML = () => DS.backend === "supabase"
  ? `<div class="notice" style="margin-top:10px"><b>Dar acceso</b><br>Crea una cuenta con correo y contraseña. <b>Empleado</b>: vende, abre y cierra caja y consulta inventario. <b>Administrador</b>: ve todo. Los permisos los valida el servidor.</div><button class="btn pri sm" style="margin-top:10px" data-act="nuevaCuenta">${ic("plus", 16)} Crear cuenta</button>`
  : DS.mode === "local" ? `<div class="notice" style="margin-top:10px"><b>Un solo equipo</b><br>En este modo OLI guarda todo en este equipo. Para que cada persona entre con su propia cuenta, conecta OLI al servidor.</div>`
  : `<div class="notice" style="margin-top:10px"><b>Cómo dar acceso</b><br>Usa el botón <b>Compartir</b> de Claude: <b>Colaborador</b> = Empleado (vende, abre y cierra caja, consulta inventario). <b>Editor</b> = Administrador. Cada persona entra con su propia cuenta de Claude, y los permisos los valida el servidor.</div>`;
ACT.nuevaCuenta = () => abrir(() => head("Crear cuenta") + `<p class="muted" style="margin-top:0">La persona entra a OLI con este correo y esta contraseña.</p>
  <label class="f" for="nc-n">Nombre</label><input class="in plain" id="nc-n" placeholder="Ej: María">
  <label class="f" for="nc-m">Correo</label><input class="in plain" id="nc-m" type="email" inputmode="email" autocomplete="off" placeholder="correo@ejemplo.com">
  <label class="f" for="nc-p">Contraseña (mínimo 8 caracteres)</label><input class="in plain" id="nc-p" type="text" autocomplete="new-password">
  <label class="f">Rol</label>${sel("nc-r", SB.role === "owner" ? ["Empleado", "Administrador"] : ["Empleado"], "Empleado")}
  <button class="btn pri xl wide" style="margin-top:14px" data-act="doNuevaCuenta">CREAR CUENTA</button>`);
ACT.doNuevaCuenta = async () => {
  const nombre = $("#nc-n").value.trim(), email = $("#nc-m").value.trim(), password = $("#nc-p").value, rol = selVal("nc-r") === "Administrador" ? "admin" : "employee";
  if (!email || !/@/.test(email)) { toast("Escribe un correo válido.", true); return; }
  if (password.length < 8) { toast("La contraseña debe tener al menos 8 caracteres.", true); return; }
  if (!conRed()) { toast("Para crear una cuenta se necesita Internet.", true); return; }
  try { await sbInvitar({email, password, rol, nombre: nombre || null}); audit("CUENTA_CREADA", email, rol === "admin" ? "Administrador" : "Empleado"); cerrar(); toast("Cuenta creada. Ya puede entrar con " + email); }
  catch (e) { toast(e.message || "No se pudo crear la cuenta.", true); }
};
/* ============ 73 · equipo, auditoría y ajustes (administrador) ============ */
S.audFiltro = "todo";
function personasConocidas() {
  const m = {}; for (const d of Object.values(col("dispositivos"))) if (d.uid) m[d.uid] = Object.assign(m[d.uid] || {}, {uid: d.uid, vis: Math.max((m[d.uid] || {}).vis || 0, d.vis || 0), devs: ((m[d.uid] || {}).devs || []).concat([d.nombre])});
  for (const v of ventasOk()) if (v.uid) { const o = m[v.uid] = m[v.uid] || {uid: v.uid, devs: []}; o.ventas = (o.ventas || 0) + 1; o.total = (o.total || 0) + v.total; }
  return Object.values(m);
}
VIEWS.equipo = () => {
  const dv = dispositivosEstado(), pe = personasConocidas(); pedirNombres(pe.map(x => x.uid));
  const aud = auditList().filter(a => S.audFiltro === "todo" || (S.audFiltro === "conflictos" ? /CONFLICTO|SYNC/.test(a.a) : S.audFiltro === "precios" ? /PRECIO|COSTO/.test(a.a) : S.audFiltro === "inventario" ? /INVENTARIO|MERMA|PRODUCCION/.test(a.a) : /CAJA/.test(a.a))).slice(0, 60);
  return cabecera("Equipo y dispositivos", "Quién está operando, desde dónde y qué cambió.") +
  `<div class="card"><h3>Dispositivos</h3>${dv.length ? dv.map(d => `<div class="row" style="align-items:flex-start"><span class="dot ${d.online ? "" : "off"}" style="margin-top:8px;${d.online ? "" : "background:var(--warn)"}"></span><div class="l" style="flex:1"><b>${esc(d.nombre)}</b>${d.mine ? ' <span class="pill">Este equipo</span>' : ""}<div class="small muted">${d.online ? "En línea · última sincronización " + haceTxt(d.vis) : "Sin conexión · última conexión " + haceTxt(d.vis)}</div>${(d.mine ? ventasPendientes() : d.ventasPend) ? `<div class="small" style="color:var(--warn)">Ventas pendientes de enviar: ${d.mine ? ventasPendientes() : d.ventasPend}</div>` : ""}<div class="xs muted">${d.rol === "admin" ? "Administrador" : "Empleado"}</div></div></div>`).join("") : '<p class="muted">Todavía no se ha conectado ningún dispositivo.</p>'}
    <button class="btn ghost sm" style="margin-top:8px" data-act="renombrarDev">Cambiar nombre de este equipo</button></div>
  <div class="card"><h3>Personas</h3>${pe.length ? pe.map(x => `<div class="row"><div class="l"><b>${esc(nombreDe(x.uid) || "Persona")}</b><div class="small muted">${x.ventas || 0} ventas · ${fmtK(x.total || 0)}${x.vis ? " · visto " + haceTxt(x.vis) : ""}</div></div></div>`).join("") : '<p class="muted">Cuando tu equipo use OLI, aparecerá aquí.</p>'}
    ${accesoHTML()}</div>
  <div class="card"><h3>Historial de cambios</h3><div class="seg" style="margin-bottom:10px">${[["todo", "Todo"], ["precios", "Precios y costos"], ["inventario", "Inventario"], ["caja", "Caja"], ["conflictos", "Para revisar"]].map(([k, l]) => `<button data-act="audFiltro" data-v="${k}" aria-pressed="${S.audFiltro === k}">${l}</button>`).join("")}</div>
    ${aud.length ? aud.map(a => { pedirNombres([a.u]); return `<div class="row" style="align-items:flex-start;padding:8px 0"><div class="l"><b>${esc(audTxt(a.a))}</b><div class="small muted">${esc(a.d || "")}</div></div><div style="text-align:right" class="xs muted">${diaCorto(ymd(new Date(a.t)))} ${hora(a.t)}<br>${esc(nombreDe(a.u) || "")}</div></div>`; }).join("") : '<p class="muted">No hay registros.</p>'}</div>
  ${rechazadas().length ? `<div class="card"><h3>Operaciones que el servidor rechazó</h3>${rechazadas().map(o => `<div class="row"><div class="l"><b>${esc(o.path)}</b><div class="small muted">${esc(o.error || "")}</div></div></div>`).join("")}<p class="small muted">Siguen guardadas en este equipo. Si necesitas recuperarlas, no borres los datos del navegador.</p></div>` : ""}`;
};
const AUD_TXT = {APERTURA_CAJA: "Caja abierta", CIERRE_CAJA: "Caja cerrada", REABRIR_CAJA: "Caja reabierta", CAJA_RETIRO: "Salió dinero de caja", CAJA_INGRESO: "Entró dinero a caja", CAJA_GASTO: "Pago desde caja", ANULACION: "Venta anulada", DESCUENTO: "Descuento aplicado", MERMA: "Pérdida anotada", AJUSTE_INVENTARIO: "Inventario ajustado", CAMBIO_PRECIO: "Cambio de precio", CAMBIO_COSTO: "Cambio de costo", PRODUCTO_CREADO: "Producto creado", PRODUCTO_EDITADO: "Producto editado", PRODUCTO_DESACTIVADO: "Producto desactivado", PRODUCTO_REACTIVADO: "Producto reactivado", GASTO: "Gasto registrado", GASTO_BORRADO: "Gasto borrado", COMPRA_PEDIDO: "Compra creada", COMPRA_RECIBIDA: "Compra recibida", PRODUCCION: "Producción registrada", RECETA: "Receta guardada", CONFIG: "Configuración", TERCERO: "Tercero guardado", CONFLICTO_INVENTARIO: "Venta que necesita revisión", SYNC_RECHAZADA: "Envío rechazado"};
const audTxt = a => AUD_TXT[a] || a;
ACT.audFiltro = (el, d) => { S.audFiltro = d.v; draw(); };
ACT.renombrarDev = () => abrir(() => head("Nombre de este equipo") + `<p class="muted" style="margin-top:0">Así lo verá el administrador.</p>${sel("dv-n", ["Caja 1", "Caja 2", "Caja 3", "Celular del administrador"], DEV.nombre)}<label class="f" for="dv-o">Otro nombre</label><input class="in plain" id="dv-o" value=""><button class="btn pri xl wide" style="margin-top:14px" data-act="doRenombrar">GUARDAR</button>`);
ACT.doRenombrar = async () => { const n = ($("#dv-o").value.trim() || selVal("dv-n")); if (!n) { toast("Elige un nombre.", true); return; } await setDevNombre(n); heartbeat(true); cerrar(); draw(); toast("Listo"); };

/* ---------- ajustes ---------- */
VIEWS.ajustes = () => {
  const c = configNeg(), n = Object.keys(col("productos")).length, demo = col("meta").app && col("meta").app.modo === "demo";
  return cabecera("Ajustes") + `
  <div class="card"><h3>Tu negocio</h3><label class="f" for="aj-nom">Nombre</label><input class="in plain" id="aj-nom" value="${esc(c.nombre || "OLI")}">
    <div class="split"><div><label class="f" for="aj-mo">Margen que quieres ganar ${ayuda("OLI te sugiere subir el precio de los productos que dejan menos que esto.")}</label><input class="in plain" id="aj-mo" inputmode="numeric" value="${Math.round(margenObjetivo() * 100)}"></div></div>
    <label class="check" style="margin-top:10px"><input type="checkbox" id="aj-mov" ${(col("meta").permisos || {}).movimientosEmpleado !== false && c.movimientosEmpleado !== false ? "checked" : ""}> Los empleados pueden sacar dinero de caja o pagar cosas pequeñas</label>
    <button class="btn pri" style="margin-top:12px" data-act="guardarAjustes">GUARDAR</button></div>
  <div class="card"><h3>Gastos fijos del mes</h3><p class="small muted" style="margin-top:-4px">Arriendo, nómina, servicios. Se usan para el punto de equilibrio y las proyecciones.</p>${gastosFijosPlan().map(g => `<div class="row"><span>${esc(g.n)}</span><b>${fmt(g.v)}</b></div>`).join("") || '<p class="muted">Sin gastos fijos definidos.</p>'}<div class="row"><b>Total</b><b>${fmt(totalFijos())}</b></div><button class="btn ghost sm" style="margin-top:8px" data-act="editFijos">Editar gastos fijos</button></div>
  <div class="card"><h3>Festivos y temporadas</h3><p class="small muted" style="margin-top:-4px">OLI conoce los festivos de Colombia (incluida la Semana Santa) y los puentes. En esos días pide más para no quedarte sin producto.</p>
    <label class="f" for="aj-col">Pedir más en festivos, Semana Santa y puentes (%) ${ayuda("Se suma a la demanda de esos días. Cuando ya tengas al menos 2 festivos con ventas, OLI usa lo que de verdad vendiste en ellos y le suma este porcentaje.")}</label><input class="in plain" id="aj-col" inputmode="numeric" value="${Math.round(colchonFestivo() * 100)}">
    <div class="btns" style="margin-top:10px"><button class="btn pri" data-act="guardarColchon">GUARDAR</button><button class="btn ghost" data-act="verFestivos">Ver festivos de los próximos 2 años</button></div></div>
  <div class="card"><h3>Apariencia</h3><div class="seg">${[["auto", "Automática"], ["light", "Clara"], ["dark", "Oscura"]].map(([k, l]) => `<button data-act="tema" data-v="${k}" aria-pressed="${temaActual() === k}">${l}</button>`).join("")}</div></div>
  <div class="card"><h3>Datos de demostración</h3><p class="small muted" style="margin-top:-4px">Para explorar OLI con un mes completo de ventas de ejemplo. No se mezcla con tu información real: puedes borrarlos cuando quieras.</p>${demo ? '<div class="notice">Estás usando datos de demostración.</div>' : ""}<div class="btns"><button class="btn ghost" data-act="cargarDemo">Cargar datos de demostración</button>${demo ? '<button class="btn danger" data-act="borrarDemo">Borrar datos de demostración</button>' : ""}</div></div>
  <div class="card"><h3>Estado de OLI</h3><div class="row"><span>Productos</span><b>${n}</b></div><div class="row"><span>Almacenamiento en este equipo</span><b>${IDB.ok ? "IndexedDB" : "Respaldo básico"}</b></div><div class="row"><span>Conexión</span><b>${esc(connInfo().txt)}</b></div><div class="row"><span>Este equipo</span><b>${esc(DEV.nombre || DEV.id)}</b></div><div class="row"><span>Versión</span><b>${esc(versionTxt())}</b></div><div class="btns" style="margin-top:8px"><button class="btn ghost sm" data-act="ayuda">${ic("info", 16)} ¿Necesitas ayuda?</button><button class="btn ghost sm" data-act="verEnvio">Estado de envío</button><button class="btn ghost sm" data-act="acerca">Acerca de OLI</button></div><p class="xs muted" style="margin:10px 0 0">${esc(BRAND.texto)}</p></div>`;
};
ACT.guardarAjustes = async () => { await guardar(async () => { const mov = $("#aj-mov").checked; await put("meta", "permisos", Object.assign({}, col("meta").permisos || {}, {movimientosEmpleado: mov})); return guardarConfig({nombre: $("#aj-nom").value.trim() || "OLI", margenObjetivo: clamp(num($("#aj-mo").value) / 100, .05, .95), movimientosEmpleado: mov}); }, "Guardado"); };
ACT.guardarColchon = async () => { const v = num($("#aj-col").value); if (!(v >= 0 && v <= 100)) { toast("Escribe un porcentaje entre 0 y 100.", true); return; } await guardar(() => guardarConfig({colchonFestivo: v / 100}), "Guardado"); };
ACT.verFestivos = () => {
  const ls = festivosEntre(S.today, addDays(S.today, 730)); let anio = "";
  abrir(() => head("Festivos y temporadas") + `<p class="muted" style="margin-top:0">Desde hoy hasta ${diaCorto(addDays(S.today, 730))}. Calculados con la ley de festivos de Colombia (Ley 51 de 1983) y la fecha de Pascua. Sábado Santo y Domingo de Resurrección no son festivos legales, pero OLI los trata como días de mucha venta.</p>` +
    ls.map(x => { const y = x.f.slice(0, 4), h = y !== anio ? `<h3 style="margin:14px 0 4px">${y}</h3>` : ""; anio = y; return h + `<div class="row"><span>${esc(diaLargo(x.f))}</span><b>${esc(x.n)}${x.tipo === "temporada" ? ' <span class="pill">temporada</span>' : ""}</b></div>`; }).join("") +
    `<button class="btn pri wide" style="margin-top:14px" data-act="cerrar">Entendido</button>`);
};
ACT.editFijos = () => { S.fijosDraft = deepClone(gastosFijosPlan()); abrir(fijosSheet); };
const fijosSheet = () => head("Gastos fijos del mes") + S.fijosDraft.map((g, i) => `<div class="split" style="margin-bottom:8px"><input class="in plain" data-fn="${i}" value="${esc(g.n)}" placeholder="Concepto"><input class="in money" data-fv="${i}" inputmode="numeric" value="${g.v ? fmt(g.v) : ""}" placeholder="$0"></div>`).join("") + `<button class="btn ghost sm" data-act="addFijo">${ic("plus", 16)} Agregar otro</button><button class="btn pri xl wide" style="margin-top:14px" data-act="doFijos">GUARDAR</button>`;
ACT.addFijo = () => { leerFijos(); S.fijosDraft.push({n: "", v: 0}); redrawSheet(true); };
function leerFijos() { document.querySelectorAll("#panel [data-fn]").forEach(i => { S.fijosDraft[Number(i.dataset.fn)].n = i.value.trim(); }); document.querySelectorAll("#panel [data-fv]").forEach(i => { S.fijosDraft[Number(i.dataset.fv)].v = num(i.value); }); }
ACT.doFijos = async () => { leerFijos(); await guardar(async () => { await guardarConfig({gastosFijos: S.fijosDraft.filter(g => g.n || g.v)}); cerrar(); }, "Guardado"); };
const temaActual = () => { try { return localStorage.getItem("oli-tema") || "auto"; } catch (e) { return "auto"; } };
function aplicarTema() { const t = temaActual(), r = document.documentElement; if (t === "auto") r.removeAttribute("data-theme"); else r.setAttribute("data-theme", t); }
ACT.tema = (el, d) => { try { localStorage.setItem("oli-tema", d.v); } catch (e) {} aplicarTema(); draw(); };
ACT.cargarDemo = async () => { if (await confirmar({titulo: "¿Cargar datos de demostración?", texto: "Se crean productos y un mes de ventas de ejemplo. Puedes borrarlos después.", si: "Sí, cargar", no: "No"})) { toast("Cargando datos de demostración…"); await guardar(() => cargarDemo(), "Datos de demostración listos"); draw(); } };
ACT.borrarDemo = async () => { if (await confirmar({titulo: "¿Borrar los datos de demostración?", texto: "Se borran los productos y ventas de ejemplo. Tu información real no se toca.", si: "Sí, borrar", no: "No", peligro: true})) { toast("Borrando…"); await guardar(() => borrarDemo(), "Datos de demostración borrados"); draw(); } };
