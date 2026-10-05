/* ============ 71 · compras, producción y productos (administrador) ============ */
S.comprasTab = "pedir"; S.horiz = "3"; S.sel = null;
const TABS_COMPRAS = [["pedir", "¿Qué pedir?"], ["finde", "Fin de semana"], ["produccion", "Producción"], ["lista", "Mis compras"]];

function abrirExplicacion(pid, hk) {
  const fechas = fechasHorizonte(hk || S.horiz), r = recomendarCompra(fechas).find(x => x.pid === pid); if (!r) return;
  abrir(() => `${head("¿Por qué " + (r.comprar ? "comprar " + r.comprar : "no comprar") + " " + r.p.nombre + "?")}
    <div class="card flat">${explicarCompra(r).map(([a, b]) => `<div class="row" style="padding:8px 0"><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join("")}</div>
    <div class="notice ok"><b>Cómo se calcula</b><br>Demanda = ventas promedio × factor del día de la semana × tendencia.<br>A comprar = demanda + stock de seguridad − inventario − pedidos por llegar.</div>
    <p class="small muted">Fuente: ventas de los últimos 14 días con venta, inventario actual y tendencia de los últimos 7 días. ${r.avg == null ? "Aún no hay suficientes días con ventas para calcular." : ""}</p>
    <button class="btn pri wide" data-act="cerrar">Entendido</button>`);
}
VIEWS.compras = () => {
  const tab = S.comprasTab;
  return cabecera("Compras", "OLI calcula qué pedir con tus ventas e inventario.") + `<div class="seg" style="margin-bottom:14px">${TABS_COMPRAS.map(([k, l]) => `<button data-act="comprasTab" data-v="${k}" aria-pressed="${tab === k}">${l}</button>`).join("")}</div>` + ({pedir: vPedir, finde: vFinde, produccion: vProduccion, lista: vLista}[tab] || vPedir)();
};
ACT.comprasTab = (el, d) => { S.comprasTab = d.v; draw(); };
function vPedir() {
  const hi = histInfo(), fechas = fechasHorizonte(S.horiz), rows = recomendarCompra(fechas), con = rows.filter(r => r.comprar > 0), sinHist = !hi.ok;
  if (!S.sel) S.sel = new Set(con.filter(r => r.riesgo !== "ok" || (r.st != null && r.st <= (r.p.min || 0))).map(r => r.pid));
  const total = sum(rows.filter(r => S.sel.has(r.pid)), r => (costoActual(r.pid) || 0) * r.comprar), uds = sum(rows.filter(r => S.sel.has(r.pid)), r => r.comprar);
  return `<div class="seg" style="margin-bottom:12px">${HORIZONTES.map(([k, l]) => `<button data-act="horiz" data-v="${k}" aria-pressed="${S.horiz === k}">${l}</button>`).join("")}</div>
  ${S.horiz === "custom" ? `<div class="split" style="margin-bottom:10px"><div><label class="f" for="f-desde">Desde</label><input class="in" type="date" id="f-desde" value="${esc(S.desde || S.today)}" data-act-change="fechas"></div><div><label class="f" for="f-hasta">Hasta</label><input class="in" type="date" id="f-hasta" value="${esc(S.hasta || addDays(S.today, 6))}" data-act-change="fechas"></div></div>` : ""}
  ${sinHist ? `<div class="notice">Todavía hay pocos días de ventas (${hi.n} de ${MIN_DIAS}). Las cantidades usan lo que hay y pueden cambiar mucho. Con más historia serán más confiables.</div>` : ""}
  ${rows.length ? "" : vacio("inventario", "No hay productos con inventario", "Activa el control de inventario en tus productos.")}
  ${rows.map(r => `<div class="card" style="padding:14px"><div style="display:flex;gap:12px;align-items:center"><label class="check" style="flex:none;min-height:48px"><input type="checkbox" data-act-change="selCompra" data-id="${esc(r.pid)}" ${S.sel.has(r.pid) ? "checked" : ""} ${r.comprar > 0 ? "" : "disabled"} aria-label="Incluir ${esc(r.p.nombre)}"></label>
    <div style="flex:1;min-width:0"><b>${esc(r.p.nombre)}</b><div class="small muted"><span class="sev ${r.riesgo === "ok" ? "" : r.riesgo}" style="display:inline-block;margin-right:6px"></span>${r.riesgo === "bad" ? "Urgente" : r.riesgo === "warn" ? "Pronto" : "Normal"} · hay ${r.st == null ? "?" : Math.max(0, r.st)}${r.cov != null && r.cov !== Infinity ? " · alcanza " + fmtN(r.cov, 1) + " días" : ""}</div></div>
    <div style="text-align:right"><div class="small muted">Comprar</div><div class="big" style="font-size:30px">${r.comprar == null ? "–" : r.comprar}</div></div></div>
    <button class="btn ghost sm" style="margin-top:8px" data-act="porque" data-id="${esc(r.pid)}">¿Por qué?</button></div>`).join("")}
  ${rows.length ? `<div class="card" style="position:sticky;bottom:${isWide() ? 12 : 72}px;box-shadow:0 8px 24px rgba(0,0,0,.12)"><div class="row" style="padding-top:0"><div><b>${S.sel.size} productos · ${uds} unidades</b><div class="small muted">${total ? "Costo estimado " + fmt(total) : "Sin costo registrado"}</div></div></div><button class="btn pri xl wide" data-act="generarPedido" ${S.sel.size ? "" : "disabled"}>${ic("compras", 20)} GENERAR PEDIDO</button></div>` : ""}`;
}
ACT.horiz = (el, d) => { S.horiz = d.v; S.sel = null; draw(); };
document.addEventListener("change", e => {
  const t = e.target; if (!t.dataset) return;
  if (t.dataset.actChange === "selCompra") { if (t.checked) S.sel.add(t.dataset.id); else S.sel.delete(t.dataset.id); draw(); }
  if (t.dataset.actChange === "fechas") { S.desde = ($("#f-desde") || {}).value || S.desde; S.hasta = ($("#f-hasta") || {}).value || S.hasta; S.sel = null; draw(); }
});
ACT.generarPedido = () => {
  const rows = recomendarCompra(fechasHorizonte(S.horiz)).filter(r => S.sel.has(r.pid) && r.comprar > 0); if (!rows.length) return;
  abrir(() => head("Generar pedido") + `<p style="margin-top:0">${rows.length} productos · ${sum(rows, r => r.comprar)} unidades. Quedará como pedido pendiente. Cuando llegue, lo registras y el inventario se actualiza.</p>
    <label class="f" for="gp-prov">Proveedor (opcional)</label><input class="in plain" id="gp-prov" value="${esc(S.ultimoProv)}" placeholder="Ej: Distribuidora de paletas">
    <button class="btn pri xl wide" style="margin-top:14px" data-act="doPedido">CREAR PEDIDO</button>`);
};
ACT.doPedido = async () => {
  const rows = recomendarCompra(fechasHorizonte(S.horiz)).filter(r => S.sel.has(r.pid) && r.comprar > 0), prov = $("#gp-prov").value.trim(); S.ultimoProv = prov;
  await guardar(async () => { await crearCompra({proveedor: prov, lineas: rows.map(r => ({pid: r.pid, q: r.comprar, costo: costoActual(r.pid), ok: false})), motivo: "Recomendación OLI (" + (HORIZONTES.find(h => h[0] === S.horiz) || ["", ""])[1] + ")"}); cerrar(); S.comprasTab = "lista"; S.sel = null; draw(); }, "Pedido creado");
};
function vFinde() {
  const pf = prepararFinde(), r = pf.rows.filter(x => x.comprar > 0 || x.riesgoF !== "ok");
  return `<div class="card"><div class="small muted">${pf.fechas.map(diaCorto).join(" y ")}</div><h3 style="margin:2px 0 8px">${pf.enRiesgo.length ? pf.enRiesgo.length + " productos presentan riesgo de agotamiento durante el fin de semana." : "El inventario cubre la demanda esperada del fin de semana."}</h3>
    <div class="kpis" style="grid-template-columns:repeat(2,1fr)"><div class="kpi"><span>Ventas esperadas</span><b>${fmtK(pf.ventasEsp)}</b></div><div class="kpi"><span>Unidades a comprar</span><b>${sum(pf.rows, x => x.comprar || 0)}</b></div></div>
    ${pf.basico ? `<div class="notice">Estimación básica: aún no hay 3 sábados y 3 domingos con ventas. Mejora con el tiempo.</div>` : `<p class="xs muted">Basado en ${dowFactors().n[6]} sábados y ${dowFactors().n[0]} domingos anteriores, ventas recientes y stock de seguridad.</p>`}</div>
  ${r.length ? r.map(x => `<div class="card" style="padding:14px"><div class="row" style="padding:0;border:0"><b>${esc(x.p.nombre)}</b><span class="pill ${x.riesgoF === "bad" ? "bad" : x.riesgoF === "warn" ? "warn" : "ok"}">${x.riesgoF === "bad" ? "Riesgo alto" : x.riesgoF === "warn" ? "Ajustado" : "Sin riesgo"}</span></div>
    <div class="kpis" style="grid-template-columns:repeat(3,1fr);margin:8px 0 0"><div class="kpi"><span>Demanda</span><b>${x.dem == null ? "–" : Math.round(x.dem)}</b></div><div class="kpi"><span>Disponible</span><b>${x.disp}</b></div><div class="kpi"><span>Comprar</span><b>${x.comprar || 0}</b></div></div></div>`).join("") : vacio("ok", "Todo cubierto", "No hace falta comprar nada para el fin de semana.")}
  ${pf.rows.some(x => x.comprar > 0) ? `<button class="btn pri xl wide" data-act="pedidoFinde">${ic("compras", 20)} GENERAR PEDIDO DEL FIN DE SEMANA</button>` : ""}`;
}
ACT.pedidoFinde = () => { S.horiz = "finde"; S.sel = new Set(prepararFinde().rows.filter(r => r.comprar > 0).map(r => r.pid)); S.comprasTab = "pedir"; ACT.generarPedido(); };
function vProduccion() {
  const pr = preparacion(); return `<div class="notice ok">Producción recomendada para <b>${diaLargo(pr.fecha)}</b>, según la demanda esperada y el inventario.</div>
  ${pr.rows.length ? pr.rows.map(r => `<div class="card" style="padding:14px"><div class="row" style="padding:0;border:0"><div><b>${esc(r.p.nombre)}</b><div class="small muted">Demanda ~${Math.round(r.dem)} · hay ${r.st == null ? "?" : Math.max(0, r.st)}</div></div><div style="text-align:right"><div class="small muted">Preparar</div><div class="big" style="font-size:30px">${r.rec}</div></div></div>
    ${r.receta ? `<div class="small" style="margin-top:6px">${r.det.map(d => esc(d.n) + " " + fmtN(d.need, 1) + " " + esc(d.u || "")).join(" · ")}</div>${r.falta ? `<div class="notice bad" style="margin:8px 0 0">Con los insumos actuales solo puedes producir ${r.maxProd}.</div>` : r.maxProd != null ? `<div class="small muted">Con el inventario actual puedes producir hasta ${r.maxProd}.</div>` : ""}` : `<div class="small muted" style="margin-top:6px">Sin receta. Agrégala en Productos para calcular insumos.</div>`}
    <button class="btn ghost sm" style="margin-top:8px" data-act="producir" data-id="${esc(r.p.id)}" data-q="${r.rec}">Registrar producción</button></div>`).join("") : vacio("ok", "No hace falta producir", "El inventario cubre la demanda de mañana.")}
  ${pr.insumos.length ? `<div class="card"><h3>Insumos necesarios en total</h3>${pr.insumos.map(i => `<div class="row"><span>${esc(i.n)}</span><b style="color:${i.falta ? "var(--danger)" : "inherit"}">${fmtN(i.need, 1)} ${esc(i.u || "")}${i.falta ? " · tienes " + fmtN(Math.max(0, i.s), 1) : ""}</b></div>`).join("")}</div>` : ""}`;
}
ACT.producir = (el, d) => abrir(() => head("Registrar producción") + `<p style="margin-top:0">${esc(prod(d.id).nombre)}: suma al inventario y descuenta los insumos de la receta.</p>${stepper("pr-q", Number(d.q) || 1)}<button class="btn pri xl wide" style="margin-top:14px" data-act="doProducir" data-id="${esc(d.id)}">GUARDAR PRODUCCIÓN</button>`);
ACT.doProducir = async (el, d) => { await guardar(async () => { await producir(d.id, num($("#pr-q").value)); cerrar(); }, "Producción registrada"); };
function insumosFaltantes() {
  return insumos().filter(p => p.activo !== false && p.controla !== false).map(p => { const e = estadoProd(p), ideal = p.max || (p.min || 0) * 3; return {p, e, q: e.k === "bajo" || e.k === "agotado" ? Math.max(1, Math.ceil(ideal - Math.max(e.st || 0, 0))) : 0}; }).filter(x => x.q > 0);
}
function vLista() {
  const cs = Object.entries(col("compras")).map(([id, c]) => Object.assign({id}, c)).sort((a, b) => b.t - a.t), ab = cs.filter(c => c.estado === "pedido"), hist = cs.filter(c => c.estado !== "pedido").slice(0, 10), ins = insumosFaltantes(), cats = uniq(ins.map(x => x.p.cat || "Otros"));
  const card = c => `<div class="card"><div class="row" style="padding-top:0"><div class="l"><b>${esc(c.proveedor || "Sin proveedor")}</b><div class="small muted">${diaCorto(c.fecha)} · ${(c.lineas || []).length} productos${c.factura ? " · factura " + esc(c.factura) : ""}</div></div><span class="pill ${c.estado === "recibido" ? "ok" : c.estado === "cancelado" ? "bad" : "warn"}">${c.estado === "pedido" ? "Pendiente" : c.estado === "recibido" ? "Recibida" : "Cancelada"}</span></div>
    ${(c.lineas || []).map((l, i) => `<label class="check" style="width:100%;padding:4px 0"><input type="checkbox" data-act-change="lineaOk" data-id="${esc(c.id)}" data-i="${i}" ${l.ok ? "checked" : ""} ${c.estado === "pedido" ? "" : "disabled"}> <span style="flex:1">${esc((prod(l.pid) || {nombre: l.n || "?"}).nombre)}</span><b>${l.q}</b></label>`).join("")}
    ${c.estado === "pedido" ? `<div class="btns" style="margin-top:10px"><button class="btn pri" style="flex:1" data-act="recibir" data-id="${esc(c.id)}">REGISTRAR LLEGADA</button><button class="btn ghost" data-act="cancelarCompra" data-id="${esc(c.id)}">Cancelar pedido</button></div>` : c.estado === "recibido" ? `<div class="small muted" style="margin-top:6px">Total ${fmt(sum(c.lineas, l => (l.costo || 0) * (l.q || 0)))}${c.soporte && c.soporte.ref ? " · soporte " + esc(c.soporte.ref) : ' · <span style="color:var(--warn)">sin soporte</span>'}</div>` : ""}</div>`;
  return `<div class="btns" style="margin-bottom:12px"><button class="btn pri" data-act="nuevaCompra">${ic("plus", 18)} Nueva compra</button></div>
    ${ab.length ? ab.map(card).join("") : vacio("compras", "No tienes pedidos pendientes", "Genera uno desde ¿Qué pedir?")}
    ${ins.length ? `<div class="card"><h3>Lista de compras de insumos</h3>${cats.map(c => `<div class="small" style="font-weight:700;margin-top:8px;text-transform:uppercase;letter-spacing:.05em">${esc(c)}</div>${ins.filter(x => (x.p.cat || "Otros") === c).map(x => `<div class="row" style="padding:8px 0"><span>${esc(x.p.nombre)}</span><b>${x.q} ${esc(x.p.unidad || "")}</b></div>`).join("")}`).join("")}<button class="btn ghost sm" style="margin-top:10px" data-act="pedidoInsumos">Crear compra con esta lista</button></div>` : ""}
    ${hist.length ? `<h3>Anteriores</h3>${hist.map(card).join("")}` : ""}`;
}
document.addEventListener("change", e => { const t = e.target; if (t.dataset && t.dataset.actChange === "lineaOk") { const c = col("compras")[t.dataset.id]; if (!c) return; const ls = c.lineas.map((l, i) => i === Number(t.dataset.i) ? Object.assign({}, l, {ok: t.checked}) : l); actualizarCompra(t.dataset.id, {lineas: ls}).catch(err => toast(errMsg(err), true)); } });
ACT.pedidoInsumos = async () => { const ins = insumosFaltantes(); await guardar(async () => { await crearCompra({proveedor: "", motivo: "Lista de insumos", lineas: ins.map(x => ({pid: x.p.id, q: x.q, costo: costoActual(x.p.id), ok: false}))}); draw(); }, "Compra creada"); };
ACT.cancelarCompra = async (el, d) => { if (await confirmar({titulo: "¿Cancelar este pedido?", texto: "No se sumará nada al inventario.", si: "Sí, cancelar", no: "No", peligro: true})) await guardar(() => actualizarCompra(d.id, {estado: "cancelado"}), "Pedido cancelado"); };
ACT.nuevaCompra = () => { const ps = prods().filter(p => p.activo !== false && p.controla !== false);
  abrir(() => head("Nueva compra") + `<label class="f" for="nc-prov">Proveedor</label><input class="in plain" id="nc-prov" value="${esc(S.ultimoProv)}" placeholder="Nombre del proveedor">
    <label class="f" for="nc-prod">¿Qué compraste o vas a comprar?</label><select class="in" id="nc-prod">${ps.map(p => `<option value="${esc(p.id)}">${esc(p.nombre)}</option>`).join("")}</select>
    <label class="f">Cantidad</label>${stepper("nc-q", 10)}<button class="btn pri xl wide" style="margin-top:14px" data-act="doNuevaCompra">GUARDAR COMPRA</button>`); };
ACT.doNuevaCompra = async () => { const pid = $("#nc-prod").value, q = num($("#nc-q").value), prov = $("#nc-prov").value.trim(); S.ultimoProv = prov; await guardar(async () => { await crearCompra({proveedor: prov, lineas: [{pid, q, costo: costoActual(pid), ok: false}]}); cerrar(); S.comprasTab = "lista"; irA("compras"); }, "Compra creada"); };
ACT.recibir = (el, d) => { const c = col("compras")[d.id]; if (!c) return; const terc = Object.entries(col("terceros")).filter(([, t]) => t.tipo === "proveedor");
  abrir(() => head("Llegó el pedido") + `<p class="small muted" style="margin-top:0">Corrige lo que de verdad llegó. Se suma solo al inventario.</p>
    ${c.lineas.map((l, i) => `<div class="row" style="align-items:flex-end"><div class="l" style="flex:1"><b>${esc((prod(l.pid) || {nombre: "?"}).nombre)}</b><div class="small muted">Pediste ${l.q}</div></div><div style="width:84px"><label class="f" style="margin:0" for="rq-${i}">Llegó</label><input class="in plain" id="rq-${i}" inputmode="numeric" value="${l.q}" style="text-align:center"></div><div style="width:110px"><label class="f" style="margin:0" for="rc-${i}">Costo c/u</label><input class="in money" id="rc-${i}" inputmode="numeric" value="${l.costo != null ? fmt(l.costo) : ""}"></div></div>`).join("")}
    <details style="margin:12px 0"><summary class="small" style="font-weight:700;min-height:40px;display:flex;align-items:center;cursor:pointer">Datos para contabilidad (opcional)</summary>
      <label class="f" for="rf-fac">Número de factura o documento</label><input class="in plain" id="rf-fac" value="${esc(c.factura || "")}">
      <label class="f" for="rf-nit">NIT o cédula del proveedor</label><input class="in plain" id="rf-nit" inputmode="numeric" value="${esc(c.nit || "")}">
      <label class="f" for="rf-sop">Soporte (enlace, número o código)</label><input class="in plain" id="rf-sop" value="${esc((c.soporte || {}).ref || "")}" placeholder="Ej: enlace al PDF o CUFE">
      <label class="f">Tipo de soporte</label>${sel("rf-tip", ["Factura electrónica", "Factura", "Documento soporte", "Sin soporte"], (c.soporte || {}).tipo || "")}
      <label class="f" for="rf-iva">IVA total de la compra (si aplica)</label><input class="in money" id="rf-iva" inputmode="numeric" value="${c.iva ? fmt(c.iva) : ""}"></details>
    <button class="btn pri xl wide" data-act="doRecibir" data-id="${esc(d.id)}">GUARDAR Y SUMAR AL INVENTARIO</button>`); };
ACT.doRecibir = async (el, d) => { const c = col("compras")[d.id], ls = c.lineas.map((l, i) => Object.assign({}, l, {q: num($("#rq-" + i).value), costo: $("#rc-" + i).value.trim() ? num($("#rc-" + i).value) : l.costo, ok: true}));
  await guardar(async () => { await recibirCompra(d.id, ls, {factura: $("#rf-fac").value.trim(), nit: $("#rf-nit").value.trim(), iva: num($("#rf-iva").value), soporte: {tipo: selVal("rf-tip"), ref: $("#rf-sop").value.trim()}}); cerrar(); }, "Inventario actualizado"); };

/* ---------- productos ---------- */
VIEWS.productos = () => {
  const q = (S.q || "").toLowerCase(), ps = prods().filter(p => !q || p.nombre.toLowerCase().includes(q)), ok = ps.filter(p => p.activo !== false), off = ps.filter(p => p.activo === false);
  const fila = p => { const c = costoActual(p.id), m = c != null && p.precio ? (p.precio - c) / p.precio : null, e = estadoProd(p);
    return `<div class="row click" role="button" tabindex="0" data-act="editProd" data-id="${esc(p.id)}" style="padding:12px 0;cursor:pointer"><span class="art" style="width:52px;height:52px;border-radius:12px;background:var(--surface-2);display:grid;place-items:center;overflow:hidden;flex:none">${prodArt(p, 40)}</span>
    <div class="l" style="flex:1"><b>${esc(p.nombre)}</b>${p.tipo === "insumo" ? ' <span class="pill">Insumo</span>' : ""}<div class="small muted">${p.tipo === "insumo" ? "Costo " + (c != null ? fmt(c) : "sin costo") : fmt(p.precio) + " · costo " + (c != null ? fmt(c) : "sin costo") + (m != null ? " · margen " + pct(m) : "")}</div></div>
    <div style="text-align:right">${p.controla === false ? '<span class="xs muted">Sin inventario</span>' : pillEstado(e)}${e.st != null && p.controla !== false ? `<div class="small" style="font-weight:700">${e.st}</div>` : ""}</div></div>`; };
  return cabecera("Productos", "Lo que vendes y lo que usas para hacerlo.", `<button class="btn pri xl" data-act="nuevoProducto">${ic("plus", 20)} AGREGAR PRODUCTO</button>`) +
    `<div class="search" style="margin-bottom:12px">${ic("buscar", 20)}<input class="in plain" id="prodq" type="search" placeholder="Buscar producto" value="${esc(S.q)}" aria-label="Buscar producto"></div>` +
    (ok.length ? `<div class="card">${ok.map(fila).join("")}</div>` : vacio("productos", "Todavía no hay productos", "Toca AGREGAR PRODUCTO. Solo necesitas nombre y precio.")) + (off.length ? `<h3>Desactivados</h3><div class="card">${off.map(fila).join("")}</div>` : "");
};
document.addEventListener("input", e => { if (e.target.id === "prodq") { S.q = e.target.value; draw(); const i = $("#prodq"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } } });
ACT.nuevoProducto = () => ACT.editProd(null, {id: ""});
const IMP_TIPOS = [["validar", "Por validar"], ["iva", "IVA"], ["exento", "Exento"], ["excluido", "Excluido"], ["no_gravado", "No gravado"], ["inc", "Impuesto al consumo"], ["otro", "Otro"]];
ACT.editProd = (el, d) => {
  const p = d.id ? prod(d.id) : null, c = p ? costoActual(p.id) : null, rc = p ? col("recetas")[p.id] : null; S.prodImg = p ? p.foto || "" : ""; S.recDraft = rc ? deepClone(rc.lineas) : []; S.comboDraft = p && p.combo ? deepClone(p.combo) : [];
  abrir(() => `${head(p ? "Editar producto" : "Agregar producto")}
    <label class="f" for="pr-n">Nombre</label><input class="in plain" id="pr-n" value="${p ? esc(p.nombre) : ""}" placeholder="Ej: Paleta Mango" autofocus>
    <div class="split"><div><label class="f" for="pr-p">Precio de venta</label><input class="in money" id="pr-p" inputmode="numeric" value="${p ? fmt(p.precio) : ""}" placeholder="$0"></div>
    <div><label class="f" for="pr-i">${p ? "Inventario actual" : "Inventario inicial"}</label><input class="in plain" id="pr-i" inputmode="numeric" value="${p && stockDe(p.id) != null ? Math.max(0, stockDe(p.id)) : ""}" placeholder="0"></div></div>
    <label class="f">Categoría</label>${sel("pr-cat", CATS, p ? p.cat : "Paletas")}
    <div id="pr-calc" class="small muted" style="margin-top:8px"></div>
    <details style="margin:14px 0"><summary style="font-weight:700;min-height:44px;display:flex;align-items:center;cursor:pointer">Más opciones</summary>
      <div class="split"><div><label class="f" for="pr-c">Lo que te cuesta ${ayuda("Lo que pagas por cada unidad. Con esto OLI calcula tu utilidad y margen.")}</label><input class="in money" id="pr-c" inputmode="numeric" value="${c != null ? fmt(c) : ""}" placeholder="$0"></div>
      <div><label class="f" for="pr-u">Se cuenta en</label><input class="in plain" id="pr-u" value="${esc(p ? p.unidad || "und" : "und")}"></div></div>
      <div class="split"><div><label class="f" for="pr-m">Avisar cuando queden ${ayuda("Cantidad mínima. Cuando queden esas unidades o menos, OLI avisa que está quedando poco.")}</label><input class="in plain" id="pr-m" inputmode="numeric" value="${p && p.min != null ? p.min : ""}" placeholder="3"></div>
      <div><label class="f" for="pr-s">Reserva de seguridad ${ayuda("Unidades extra que quieres tener siempre por si se vende más de lo esperado. OLI las suma al recomendar compras.")}</label><input class="in plain" id="pr-s" inputmode="numeric" value="${p && p.seg != null ? p.seg : ""}" placeholder="0"></div></div>
      <label class="f">Tipo</label>${sel("pr-tipo", ["Producto que vendo", "Insumo"], p && p.tipo === "insumo" ? "Insumo" : "Producto que vendo")}
      <label class="check" style="margin-top:10px"><input type="checkbox" id="pr-ctl" ${!p || p.controla !== false ? "checked" : ""}> Llevar inventario de este producto</label>
      <label class="check"><input type="checkbox" id="pr-act" ${!p || p.activo !== false ? "checked" : ""}> Disponible para vender</label>
      <label class="f" for="pr-foto">Foto (opcional)</label><input class="in plain" id="pr-foto" type="file" accept="image/*" data-act-change="fotoProd"><div id="pr-prev" class="small muted">${S.prodImg ? "Foto cargada" : "Sin foto: OLI dibuja el producto con su color."}</div>
      <div class="split"><div><label class="f" for="pr-pack">Viene en cajas de</label><input class="in plain" id="pr-pack" inputmode="numeric" value="${p && p.pack ? p.pack : ""}" placeholder="1"></div><div><label class="f" for="pr-max">Cantidad ideal (insumos)</label><input class="in plain" id="pr-max" inputmode="numeric" value="${p && p.max ? p.max : ""}"></div></div>
      <label class="f">Impuesto ${ayuda("Pregúntale a tu contador. OLI no asume el impuesto por el nombre del producto: hasta que lo valides queda “Por validar”.")}</label>${sel("pr-imp", IMP_TIPOS.map(x => x[1]), (IMP_TIPOS.find(x => x[0] === ((p && p.imp && p.imp.t) || "validar")) || IMP_TIPOS[0])[1])}
      <div class="split"><div><label class="f" for="pr-tar">Tarifa % (si aplica)</label><input class="in plain" id="pr-tar" inputmode="decimal" value="${p && p.imp && p.imp.r ? p.imp.r * 100 : ""}"></div><div><label class="f" for="pr-cta">Cuenta contable (opcional)</label><input class="in plain" id="pr-cta" value="${esc(p && p.imp ? p.imp.cuenta || "" : "")}"></div></div>
      <div id="pr-rec">${recetaEditorHTML()}</div>
    </details>
    <div class="btns" style="margin-top:6px">${p ? `<button class="btn ghost" data-act="desactivarProd" data-id="${esc(p.id)}">${p.activo === false ? "Reactivar" : "Desactivar"}</button>` : ""}<button class="btn pri xl" style="flex:1" data-act="doGuardarProd" data-id="${esc(d.id)}">GUARDAR</button></div>`, {wide: false});
  setTimeout(calcMargenProd, 30);
};
function recetaEditorHTML() {
  const ins = insumos();
  return `<label class="f">Receta (cuánto insumo lleva cada unidad) ${ayuda("Opcional. Con la receta OLI calcula el costo del producto y los insumos que necesitas para producir.")}</label>${S.recDraft.map((l, i) => `<div class="row" style="padding:6px 0"><span style="flex:1">${esc((prod(l.iid) || {nombre: "?"}).nombre)}</span><span>${l.q} ${esc((prod(l.iid) || {}).unidad || "")}</span><button class="btn ghost sm" data-act="quitarIng" data-i="${i}">Quitar</button></div>`).join("")}
  ${ins.length ? `<div class="split" style="margin-top:6px"><select class="in" id="ing-p">${ins.map(x => `<option value="${esc(x.id)}">${esc(x.nombre)}</option>`).join("")}</select><input class="in plain" id="ing-q" inputmode="decimal" placeholder="Cantidad"></div><button class="btn ghost sm" style="margin-top:6px" data-act="agregarIng">Agregar ingrediente</button>` : '<p class="small muted">Primero crea insumos (tipo “Insumo”).</p>'}`;
}
ACT.agregarIng = () => { const q = numDec($("#ing-q").value); if (!(q > 0)) { toast("Escribe la cantidad.", true); return; } S.recDraft.push({iid: $("#ing-p").value, q}); $("#pr-rec").innerHTML = recetaEditorHTML(); };
ACT.quitarIng = (el, d) => { S.recDraft.splice(Number(d.i), 1); $("#pr-rec").innerHTML = recetaEditorHTML(); };
function calcMargenProd() { const el = $("#pr-calc"); if (!el) return; const pr = num(($("#pr-p") || {}).value), c = ($("#pr-c") || {value: ""}).value.trim() ? num($("#pr-c").value) : null; el.innerHTML = pr && c != null ? `Utilidad por unidad: <b>${fmt(pr - c)}</b> · Margen: <b>${pct((pr - c) / pr, 1)}</b>` : pr ? "Agrega el costo (en Más opciones) para ver tu utilidad." : ""; }
document.addEventListener("input", e => { if (e.target.id === "pr-p" || e.target.id === "pr-c") calcMargenProd(); });
document.addEventListener("change", e => { const t = e.target; if (t.dataset && t.dataset.actChange === "fotoProd" && t.files && t.files[0]) {
  const img = new Image(), url = URL.createObjectURL(t.files[0]); img.onload = () => { const c = document.createElement("canvas"), s = 220, k = Math.min(1, s / Math.max(img.width, img.height)); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); S.prodImg = c.toDataURL("image/jpeg", .72); URL.revokeObjectURL(url); $("#pr-prev").textContent = "Foto lista (" + Math.round(S.prodImg.length / 1024) + " KB)"; }; img.src = url; } });
ACT.doGuardarProd = async (el, d) => {
  const n = $("#pr-n").value.trim(), pr = num($("#pr-p").value); if (!n) { toast("Escribe el nombre.", true); return; } if (!(pr > 0) && selVal("pr-tipo") !== "Insumo") { toast("Escribe el precio de venta.", true); return; }
  const impT = (IMP_TIPOS.find(x => x[1] === selVal("pr-imp")) || IMP_TIPOS[0])[0], tar = numDec($("#pr-tar").value) / 100, ant = d.id ? prod(d.id) : null;
  const dat = {nombre: n, cat: selVal("pr-cat") || "Otros", tipo: selVal("pr-tipo") === "Insumo" ? "insumo" : "terminado", precio: pr, unidad: $("#pr-u").value.trim() || "und", min: $("#pr-m").value.trim() === "" ? 3 : num($("#pr-m").value), seg: num($("#pr-s").value), pack: num($("#pr-pack").value) || 1, max: num($("#pr-max").value) || null,
    controla: $("#pr-ctl").checked, activo: $("#pr-act").checked, imp: {t: impT, r: tar || 0, cuenta: $("#pr-cta").value.trim()}};
  if (S.prodImg) dat.foto = S.prodImg; else delete dat.foto; if (ant && ant.combo) dat.combo = ant.combo;
  await guardar(async () => {
    const costoRaw = $("#pr-c").value.trim(), id = await guardarProducto(d.id, dat, costoRaw ? num(costoRaw) : null);
    if (S.recDraft.length || (d.id && col("recetas")[id])) await guardarReceta(id, S.recDraft.slice(), 1);
    const inv = $("#pr-i").value.trim(); if (inv !== "" && dat.controla && (!ant || stockDe(id) !== num(inv))) await contarStock(id, num(inv), ant ? "edición" : "inventario inicial");
    cerrar();
  }, "Producto guardado");
};
ACT.desactivarProd = async (el, d) => { const p = prod(d.id), act = p.activo === false; if (!act && !(await confirmar({titulo: "¿Quieres desactivar " + p.nombre + "?", texto: "Ya no aparecerá para vender. Sus ventas anteriores se conservan.", si: "Sí, desactivar", no: "No", peligro: true}))) return;
  await guardar(async () => { await guardarProducto(d.id, Object.assign({}, deepClone(col("productos")[d.id]), {activo: act})); cerrar(); }, act ? "Producto reactivado" : "Producto desactivado"); };
