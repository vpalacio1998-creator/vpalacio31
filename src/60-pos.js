/* ============ 60 · punto de venta, caja e inventario (pantallas del empleado) ============
   Venta normal: tocar producto -> COBRAR -> (efectivo ya viene elegido) -> CONFIRMAR. */
const BILLETES = [2000, 5000, 10000, 20000, 50000, 100000];
let cobrando = false, doneTimer = 0;
function saveCart() { IDB.kvSet("cart", S.cart).catch(() => {}); }
async function restoreCart() { try { const c = await IDB.get("kv", "cart"); if (Array.isArray(c) && c.length) S.cart = c; } catch (e) {} }

/* ---------- vender ---------- */
function tileHTML(p) {
  const e = estadoProd(p), q = enCarrito(p.id), agot = e.k === "agotado";
  const estado = agot ? `<span class="pill bad">${ic("x", 14)}Agotado</span>` : e.k === "bajo" ? `<span class="pill warn">${ic("alerta", 14)}Quedan ${e.st}</span>` : "";
  return `<button class="tile${q ? " inc" : ""}${agot ? " out" : ""}" data-act="tile" data-id="${esc(p.id)}" aria-label="${esc(p.nombre)}, ${fmt(p.precio)}${agot ? ", agotado" : ""}">
    ${q ? `<span class="badge" aria-label="${q} en el pedido">${q}</span>` : ""}<span class="art" style="height:96px">${prodArt(p, 88)}</span>
    <span class="n">${esc(p.nombre)}</span>${estado ? `<span>${estado}</span>` : ""}<span class="p">${fmt(p.precio)}</span></button>`;
}
function gridHTML() {
  const q = (S.q || "").trim().toLowerCase(), list = vendibles().filter(p => (S.cat === "Todas" || p.cat === S.cat) && (!q || p.nombre.toLowerCase().includes(q)));
  return list.length ? list.map(tileHTML).join("") : '<div class="empty" style="grid-column:1/-1">No hay productos con ese nombre.</div>';
}
function bannerCaja() {
  const c = cajaHoy(), st = cajaEstado(c);
  if (st === "sin") return `<div class="alertrow" style="border-color:var(--marca)"><span class="sev"></span><div style="flex:1"><b>Primero abre la caja</b><span>Así queda registrado con cuánto efectivo empiezas.</span></div><button class="btn pri" data-act="abrirCaja">${ic("caja", 20)} ABRIR CAJA</button></div>`;
  if (st === "cerrada") return `<div class="notice">${ic("lock", 16)} La caja de hoy está cerrada. ${esAdmin() ? '<button class="btn sm ghost" data-act="reabrir">Reabrir caja</button>' : "Si necesitas vender más, avísale al administrador."}</div>`;
  return "";
}
VIEWS.vender = () => {
  const ps = vendibles(); if (!ps.length) return vacio("productos", "Todavía no hay productos", esAdmin() ? "Agrega tu primer producto para empezar a vender." : "Pídele al administrador que agregue los productos.", esAdmin() ? '<button class="btn pri xl" data-act="ir" data-r="productos">AGREGAR PRODUCTO</button>' : "");
  const cats = ["Todas"].concat(CATS.filter(c => ps.some(p => p.cat === c))), al = ps.filter(p => estadoProd(p).k === "agotado");
  if (!cats.includes(S.cat)) S.cat = "Todas";
  return `${bannerCaja()}${DS.canWrite ? "" : '<div class="notice">Tienes acceso de solo lectura. Pídele al administrador que te dé permiso de colaborador.</div>'}
  ${al.length ? `<div class="alertrow"><span class="sev bad"></span><div><b>Se acabó: ${esc(al.slice(0, 4).map(nombreCorto).join(", "))}${al.length > 4 ? " y " + (al.length - 4) + " más" : ""}</b><span>Estos productos no se pueden vender por ahora.</span></div></div>` : ""}
  <div class="search" style="margin-bottom:10px">${ic("buscar", 20)}<input class="in plain" id="qsearch" type="search" placeholder="Buscar producto" value="${esc(S.q)}" autocomplete="off" aria-label="Buscar producto"></div>
  <div class="chips" role="group" aria-label="Categorías">${cats.map(c => `<button class="chip" style="min-height:48px;font-size:15px" data-act="cat" data-v="${esc(c)}" aria-pressed="${c === S.cat}">${esc(c)}</button>`).join("")}</div>
  <div class="grid" id="grid">${gridHTML()}</div>`;
};
ACT.cat = (el, d) => { S.cat = d.v; draw(); };
const perdidaRecien = {};
ACT.tile = (el, d) => {
  const p = prod(d.id); if (!p) return; if (!DS.canWrite) { toast("Tienes acceso de solo lectura.", true); return; }
  if (cajaEstado(cajaHoy()) === "cerrada") { toast("La caja de hoy está cerrada.", true); return; }
  if (estadoProd(p).k === "agotado") { toast(p.nombre + " está agotado.", true); if (!perdidaRecien[p.id] || Date.now() - perdidaRecien[p.id] > 30000) { perdidaRecien[p.id] = Date.now(); anotarDemandaPerdida(p.id).catch(() => {}); } return; }
  if (agregarAlCarrito(p)) { saveCart(); draw(); }
};
function lineasPedido() {   // nombre arriba (ancho completo) y cantidades abajo: se lee bien también en el panel angosto de la tablet
  return S.cart.map(c => `<div class="pline"><div class="pl-top"><div class="l"><b>${esc(c.n)}</b><div class="small muted">${fmt(c.p)} c/u</div></div><button class="btn ghost sm" data-act="quitar" data-id="${esc(c.pid)}" aria-label="Quitar ${esc(c.n)} del pedido">${ic("x", 16)}</button></div>
    <div class="pl-bot"><div class="qty"><button data-act="menos" data-id="${esc(c.pid)}" aria-label="Quitar una unidad de ${esc(c.n)}" style="width:44px;height:44px">−</button><b style="font-size:18px">${c.q}</b><button data-act="mas1" data-id="${esc(c.pid)}" aria-label="Agregar una unidad de ${esc(c.n)}" style="width:44px;height:44px">+</button></div><b class="pl-tot">${fmt(c.p * c.q)}</b></div></div>`).join("");
}
function pedidoHTML(modal) {
  if (!S.cart.length) return `<div class="tk-empty">${ic("paleta", 48)}<b style="color:var(--ink)">Tu pedido está vacío</b><p style="margin:0">Toca un producto para empezar.</p></div>`;
  return `<div style="flex:1">${lineasPedido()}</div><div class="row" style="border:0;padding-top:14px"><b style="font-size:18px">TOTAL</b><span class="big">${fmt(totalCarrito())}</span></div>
    <button class="btn pri xl wide" data-act="cobrar" style="margin-top:6px">${ic("moneda", 22)} COBRAR</button>
    <button class="btn ghost wide" style="margin-top:10px" data-act="vaciar">Cancelar venta</button>`;
}
function ticketHTML() { return `<div class="tk-head"><h3>Tu pedido</h3><span class="muted small">${cantCarrito()} ${cantCarrito() === 1 ? "producto" : "productos"}</span></div>${pedidoHTML()}`; }
function cartbarHTML() {
  if (!S.cart.length) return ""; const n = cantCarrito();
  return `<div class="cartbar"><div class="inner"><div data-act="verPedido" role="button" tabindex="0" aria-label="Ver el pedido" style="cursor:pointer"><small>${n} ${n === 1 ? "producto" : "productos"} · tocar para ver</small><b>${fmt(totalCarrito())}</b></div><button class="btn xl" data-act="cobrar" style="min-height:52px">COBRAR</button></div></div>`;
}
ACT.verPedido = () => abrir(() => head("Tu pedido", "Seguir vendiendo") + `<div style="display:flex;flex-direction:column">${pedidoHTML(true)}</div>`);
ACT.menos = (el, d) => { cambiarCantidad(d.id, -1); saveCart(); draw(); redrawSheet(true); if (!S.cart.length) cerrar(); };
ACT.mas1 = (el, d) => { cambiarCantidad(d.id, 1); saveCart(); draw(); redrawSheet(true); };
ACT.quitar = (el, d) => { S.cart = S.cart.filter(c => c.pid !== d.id); saveCart(); draw(); redrawSheet(true); if (!S.cart.length) cerrar(); };
ACT.vaciar = async () => { if (!S.cart.length) return; if (cantCarrito() >= 3 && !(await confirmar({titulo: "¿Cancelar la venta?", texto: "Se borrará todo el pedido.", si: "Sí, cancelar", no: "No, seguir", peligro: true}))) return; S.cart = []; saveCart(); cerrar(); draw(); };

/* ---------- cobrar ---------- */
Object.assign(S, {desc: 0, descModo: "", cliente: null, mas: false});
function totalConDesc() { return totalCarrito() - clamp(S.desc, 0, totalCarrito()); }
function cobroHTML() {
  const sub = totalCarrito(), total = totalConDesc(), rec = num(S.recibido) || (S.metodo === "Efectivo" ? total : 0), cambio = S.metodo === "Efectivo" ? rec - total : 0;
  const billetes = uniq([total].concat(BILLETES.filter(b => b >= total).slice(0, 4)));
  return head("Cobrar", "Volver al pedido") + `
  <div style="text-align:center;margin:4px 0 14px"><span class="muted">TOTAL A PAGAR</span><div class="big" style="font-size:46px">${fmt(total)}</div>${S.desc > 0 ? `<span class="pill ok">Descuento ${fmt(S.desc)}</span>` : ""}</div>
  <label class="f">¿Cómo paga?</label>
  <div class="paygrid">${METODOS.map(m => `<button data-act="metodo" data-v="${esc(m)}" aria-pressed="${m === S.metodo}" style="min-height:58px;font-size:15px">${esc(m)}</button>`).join("")}</div>
  ${S.metodo === "Efectivo" ? `<label class="f">¿Con cuánto paga?</label><div class="btns">${billetes.map(b => `<button class="btn ${rec === b ? "pri" : "ghost"}" style="flex:1;min-width:30%" data-act="recibido" data-v="${b}">${b === total ? "Exacto" : fmt(b)}</button>`).join("")}</div>
    <div class="row" style="border:0;margin-top:6px"><b>Cambio</b><span class="big" style="font-size:30px;color:${cambio < 0 ? "var(--danger)" : "var(--marca-d)"}">${cambio < 0 ? "Faltan " + fmt(-cambio) : fmt(cambio)}</span></div>`
  : esDigital(S.metodo) ? `<div class="notice ok" style="margin-top:12px">Cuando veas el aviso de que llegó el pago, toca <b>CONFIRMAR</b>. Si aún no llega, el administrador lo verá como “por confirmar”.</div>` : ""}
  <details style="margin:14px 0"${S.mas ? " open" : ""}><summary class="small" style="font-weight:700;cursor:pointer;min-height:40px;display:flex;align-items:center" data-act="masOpc">Más opciones</summary>
    <label class="f">Descuento</label><div class="btns">${[0, 5, 10].map(p => `<button class="btn ${S.descModo === String(p) ? "pri" : "ghost"} sm" data-act="descuento" data-p="${p}">${p === 0 ? "Sin descuento" : p + "%"}</button>`).join("")}</div>
    <label class="check" style="margin-top:12px"><input type="checkbox" id="pidefactura" data-act-change="pideFactura" ${S.cliente ? "checked" : ""}> El cliente pide factura a su nombre</label>
    ${S.cliente ? `<div class="split" style="margin-top:8px"><div><label class="f" for="c-doc">Documento (CC o NIT)</label><input class="in plain" id="c-doc" inputmode="numeric" value="${esc(S.cliente.doc || "")}"></div><div><label class="f" for="c-nom">Nombre o razón social</label><input class="in plain" id="c-nom" value="${esc(S.cliente.nombre || "")}"></div></div><label class="f" for="c-mail">Correo para enviar la factura</label><input class="in plain" id="c-mail" type="email" value="${esc(S.cliente.correo || "")}">` : ""}
  </details>
  <button class="btn pri xl wide" data-act="confirmarVenta" ${cobrando ? "disabled" : ""}>${ic("ok", 22)} CONFIRMAR VENTA · ${fmt(total)}</button>`;
}
ACT.masOpc = () => { S.mas = !S.mas; };
ACT.cobrar = () => {
  if (!S.cart.length) { toast("Toca un producto para empezar.", true); return; }
  if (!DS.canWrite) { toast("Tienes acceso de solo lectura.", true); return; }
  const c = cajaHoy(), st = cajaEstado(c); if (st === "sin") { ACT.abrirCaja(); return; } if (st === "cerrada") { toast("La caja de hoy está cerrada.", true); return; }
  S.recibido = ""; S.desc = 0; S.descModo = ""; S.cliente = null; S.mas = false; if (!METODOS.includes(S.metodo)) S.metodo = "Efectivo";
  abrir(() => cobroHTML());
};
ACT.metodo = (el, d) => { S.metodo = d.v; if (d.v !== "Efectivo") S.recibido = ""; redrawSheet(true); };
ACT.recibido = (el, d) => { S.recibido = d.v; redrawSheet(true); };
ACT.descuento = (el, d) => { const p = Number(d.p); S.descModo = String(p); S.desc = Math.round(totalCarrito() * p / 100); S.mas = true; redrawSheet(true); };
document.addEventListener("change", e => {
  if (e.target.id === "pidefactura") { S.cliente = e.target.checked ? {doc: "", nombre: "", correo: ""} : null; S.mas = true; redrawSheet(true); }
  if (e.target.id === "c-doc" || e.target.id === "c-nom" || e.target.id === "c-mail") S.cliente = {doc: $("#c-doc").value.trim(), nombre: $("#c-nom").value.trim(), correo: $("#c-mail").value.trim()};
});
ACT.confirmarVenta = async () => {
  if (cobrando) return; const total = totalConDesc(), rec = num(S.recibido) || total;
  if (S.metodo === "Efectivo" && rec < total) { toast("El efectivo recibido no alcanza.", true); return; }
  if (S.cliente) S.cliente = {doc: ($("#c-doc") || {value: S.cliente.doc}).value.trim(), nombre: ($("#c-nom") || {value: S.cliente.nombre}).value.trim(), correo: ($("#c-mail") || {value: S.cliente.correo}).value.trim()};
  if (S.cliente && (!S.cliente.doc || !S.cliente.nombre)) { toast("Para la factura escribe el documento y el nombre.", true); return; }
  cobrando = true; redrawSheet(true);
  try {
    const v = await registrarVenta({m: S.metodo, desc: S.desc, recibido: rec, cliente: S.cliente});
    S.cart = []; saveCart(); S.cliente = null; S.desc = 0; S.recibido = "";
    const off = DS.mode === "db" && !SYNC.online;
    abrir(() => `<div class="done" data-v="${esc(v.id)}"><div class="tick">${ic("ok", 52)}</div><h2 style="margin:14px 0 4px">Venta realizada</h2><div class="big">${fmt(v.total)}</div><p class="muted" style="margin:6px 0 0">${esc(v.m)}${v.m === "Efectivo" && v.cambio > 0 ? " · Cambio: <b>" + fmt(v.cambio) + "</b>" : ""}</p>${off ? '<p class="small muted">Guardada en este equipo. Se enviará sola cuando vuelva Internet.</p>' : ""}<button class="btn pri xl wide" style="margin-top:16px" data-act="cerrar" autofocus>Nueva venta</button></div>`);
    clearTimeout(doneTimer); const vid = v.id; doneTimer = setTimeout(() => { const el = $("#panel .done"); if (sheetFn && el && el.dataset.v === vid) cerrar(); }, 2600); draw();
  } catch (e) {
    if (e.abrirCaja) { cerrar(); ACT.abrirCaja(); } else toast(e.message && !e.code ? e.message : errMsg(e), true);
  } finally { cobrando = false; redrawSheet(true); }
};

/* ---------- caja ---------- */
function cajaCardHTML(c, mia) {
  const k = cajaCalc(c), st = cajaEstado(c), ci = (c.cierres || []).slice(-1)[0], adm = esAdmin();
  return `<div class="card"><div class="row" style="padding-top:0"><div class="l"><h3 style="margin:0">${esc(c.devNombre || (col("dispositivos")[c.dev] || {}).nombre || "Caja")}</h3><div class="small muted">${st === "abierta" ? "Abierta " + hora(c.apertura.t) : st === "cerrada" ? "Cerrada " + (ci ? hora(ci.t) : "") : "Sin abrir"}</div></div>
    <span class="pill ${st === "abierta" ? "ok" : st === "cerrada" ? "" : "warn"}">${st === "abierta" ? "Abierta" : st === "cerrada" ? "Cerrada" : "Sin abrir"}</span></div>
    ${c.apertura ? `<div class="row"><div class="l">Empezó con</div><div class="r">${fmt(k.apertura)}</div></div>
    <div class="row"><div class="l">Ventas en efectivo</div><div class="r">+ ${fmt(k.efectivo)}</div></div>
    ${k.ingresos ? `<div class="row"><div class="l">Entró dinero</div><div class="r">+ ${fmt(k.ingresos)}</div></div>` : ""}
    ${k.retiros ? `<div class="row"><div class="l">Salió dinero</div><div class="r">− ${fmt(k.retiros)}</div></div>` : ""}
    ${k.gastos ? `<div class="row"><div class="l">Pagos hechos</div><div class="r">− ${fmt(k.gastos)}</div></div>` : ""}
    <div class="row"><div class="l"><b>Debería haber en efectivo</b></div><div class="r big" style="font-size:26px">${fmt(k.esperado)}</div></div>
    ${Object.entries(k.por).filter(([m]) => m !== "Efectivo").map(([m, v]) => `<div class="row"><div class="l">${esc(m)}</div><div class="r">${fmt(v)}</div></div>`).join("")}
    ${ci ? `<div class="notice ${Math.abs(ci.dif) < 1 ? "ok" : "bad"}" style="margin:10px 0 0"><b>${Math.abs(ci.dif) < 1 ? "La caja cuadró" : ci.dif > 0 ? "Sobran " + fmt(ci.dif) : "Faltan " + fmt(-ci.dif)}</b><br>Contado: ${fmt(ci.contado)}${ci.obs ? " · " + esc(ci.obs) : ""}</div>` : ""}` : ""}
    ${adm && st === "cerrada" ? `<button class="btn ghost sm" style="margin-top:10px" data-act="reabrir" data-id="${esc(c.id)}">Reabrir caja</button>` : ""}</div>`;
}
const CHECK_AP = [["caja", "Caja abierta con el efectivo inicial"], ["inv", "Revisé el inventario"], ["neveras", "Las neveras funcionan"], ["prods", "Los productos están disponibles"], ["limpieza", "El local está limpio"]];
const CHECK_CI = [["caja", "Caja cerrada"], ["efectivo", "Efectivo contado"], ["inv", "Revisé el inventario"], ["mermas", "Anoté lo que se dañó"], ["novedades", "Anoté las novedades"]];
function checklistHTML(grupo, items) {
  const cl = checklistDe(S.today)[grupo] || {}, hechos = items.filter(([k]) => cl[k]).length;
  return `<div class="card"><div class="row" style="padding-top:0"><h3 style="margin:0">${grupo === "apertura" ? "Al abrir" : "Al cerrar"}</h3><span class="pill ${hechos === items.length ? "ok" : ""}">${hechos}/${items.length}</span></div>${items.map(([k, t]) => `<label class="check" style="width:100%;padding:6px 0;min-height:48px"><input type="checkbox" data-act-change="check" data-g="${grupo}" data-k="${k}" ${cl[k] ? "checked" : ""}> ${esc(t)}</label>`).join("")}</div>`;
}
document.addEventListener("change", e => { const t = e.target; if (t.dataset && t.dataset.actChange === "check") toggleChecklist(t.dataset.g, t.dataset.k).catch(err => toast(errMsg(err), true)); });
VIEWS.caja = () => {
  const c = cajaHoy(), st = cajaEstado(c), todas = cajasAll().filter(x => x.fecha === S.today && x.id !== (c && c.id));
  let principal = "";
  if (st === "sin") principal = `<div class="card" style="text-align:center;padding:26px 16px">${ic("caja", 56)}<h3 style="margin:10px 0 6px">La caja está cerrada</h3><p class="muted" style="margin:0 0 16px">Ábrela para empezar a vender. Te preguntamos con cuánto efectivo empiezas.</p><button class="btn pri xl wide" data-act="abrirCaja">${ic("caja", 22)} ABRIR CAJA</button></div>`;
  else principal = cajaCardHTML(c, true) + (st === "abierta" ? `<div class="btns" style="margin-bottom:14px"><button class="btn ghost" style="flex:1" data-act="movCaja" data-t="retiro">Sacar dinero</button><button class="btn ghost" style="flex:1" data-act="movCaja" data-t="ingreso">Entró dinero</button><button class="btn ghost" style="flex:1" data-act="movCaja" data-t="gasto">Pagué algo</button></div><button class="btn pri xl wide" data-act="cerrarCaja">${ic("lock", 22)} CERRAR CAJA</button>` : "");
  const pend = ventasOk().filter(v => v.pend && v.fecha >= addDays(S.today, -3));
  const adm = esAdmin();
  return cabecera("Caja", "Hoy · " + diaLargo(S.today) + (DEV.nombre ? " · " + esc(DEV.nombre) : "")) + (st === "sin" ? principal : cajaCardHTML(c, true)) +
    (st !== "sin" ? checklistHTML("apertura", CHECK_AP) : "") + (st === "abierta" ? checklistHTML("cierre", CHECK_CI) : "") +
    (pend.length ? `<div class="card"><h3>Pagos por confirmar</h3><p class="small muted" style="margin-top:-4px">Mira el aviso de tu banco o billetera. Si ya llegó, toca “Ya llegó”.</p>${pend.slice(-8).reverse().map(v => `<div class="row"><div class="l"><b>${fmt(v.total)}</b> <span class="pill">${esc(v.m)}</span><div class="small muted">${hora(v.t)}${v.ref ? " · " + esc(v.ref) : ""}</div></div><button class="btn pri sm" data-act="ya" data-id="${esc(v.id)}">Ya llegó</button></div>`).join("")}</div>` : "") +
    (st === "abierta" ? `<div class="btns" style="margin-bottom:14px"><button class="btn ghost" style="flex:1" data-act="movCaja" data-t="retiro">Sacar dinero</button><button class="btn ghost" style="flex:1" data-act="movCaja" data-t="ingreso">Entró dinero</button><button class="btn ghost" style="flex:1" data-act="movCaja" data-t="gasto">Pagué algo</button></div><button class="btn pri xl wide" data-act="cerrarCaja">${ic("lock", 22)} CERRAR CAJA</button>` : "") +
    (adm && todas.length ? `<h3>Otras cajas de hoy</h3>${todas.map(x => cajaCardHTML(x, false)).join("")}` : "");
};
ACT.ya = async (el, d) => { const v = ventasOk().find(x => x.id === d.id); if (v) { await guardar(() => confirmarPago(v), "Pago confirmado"); } };
const SUGERIDOS_APERTURA = [0, 50000, 100000, 200000];
ACT.abrirCaja = () => abrir(() => `${head("Abrir caja")}<p style="margin-top:0">¿Con cuánto efectivo empiezas?</p>
  <div class="btns" style="margin-bottom:10px">${SUGERIDOS_APERTURA.map(m => `<button class="btn ghost" style="flex:1;min-width:45%" data-act="aperturaMonto" data-v="${m}">${m === 0 ? "$0 (sin base)" : fmt(m)}</button>`).join("")}</div>
  <label class="f" for="ap-monto">Otro valor</label><input class="in money" id="ap-monto" inputmode="numeric" value="${S.apMonto ? fmt(S.apMonto) : ""}" placeholder="$0">${teclado("ap-monto")}
  <button class="btn pri xl wide" style="margin-top:14px" data-act="doAbrir">${ic("ok", 22)} ABRIR CAJA</button>`, {});
ACT.aperturaMonto = (el, d) => { $("#ap-monto").value = Number(d.v) ? fmt(Number(d.v)) : "$0"; };
ACT.doAbrir = async () => { const v = num($("#ap-monto").value); await guardar(async () => { await abrirCaja(v); cerrar(); draw(); }, "Caja abierta. ¡A vender!"); };
const MOT_MOV = {retiro: ["Retiro del dueño", "Consignación", "Cambio de billetes", "Otro"], ingreso: ["Base adicional", "Cambio de billetes", "Otro"], gasto: ["Insumos", "Domicilio", "Aseo", "Transporte", "Otro"]};
const TIT_MOV = {retiro: "Sacar dinero de la caja", ingreso: "Entró dinero a la caja", gasto: "Pagué algo con dinero de la caja"};
ACT.movCaja = (el, d) => { if (!esAdmin() && configNeg().movimientosEmpleado === false) { toast("Pídele al administrador que haga este movimiento.", true); return; } S.movTipo = d.t;
  abrir(() => `${head(TIT_MOV[S.movTipo])}<label class="f" for="mv-monto">¿Cuánto?</label><input class="in money" id="mv-monto" inputmode="numeric" placeholder="$0">${teclado("mv-monto")}
  <label class="f">¿Para qué?</label>${sel("mv-mot", MOT_MOV[S.movTipo], "")}<label class="f" for="mv-nota">Detalle (opcional)</label><input class="in plain" id="mv-nota" placeholder="Ej: compra de vasos">
  <button class="btn pri xl wide" style="margin-top:14px" data-act="doMov">GUARDAR</button>`); };
ACT.doMov = async () => { const m = num($("#mv-monto").value), mot = selVal("mv-mot"), nota = $("#mv-nota").value.trim(); if (!mot) { toast("Elige para qué fue.", true); return; }
  await guardar(async () => { await movimientoCaja(S.movTipo, m, mot + (nota ? " · " + nota : ""), S.movTipo === "gasto" ? "Otros" : ""); cerrar(); draw(); }, "Guardado"); };
ACT.cerrarCaja = () => { const c = cajaHoy(), k = cajaCalc(c); S.cierreVal = ""; abrir(() => {
  const cont = $("#ci-monto") ? num($("#ci-monto").value) : null;
  return `${head("Cerrar caja")}<div class="card flat"><div class="row" style="padding-top:0"><div class="l">Ventas de hoy</div><div class="r">${fmt(k.ventas)}</div></div>${Object.entries(k.por).map(([m, v]) => `<div class="row"><div class="l">${esc(m)}</div><div class="r">${fmt(v)}</div></div>`).join("")}
    <div class="row"><div class="l"><b>Efectivo que debería haber</b></div><div class="r big" style="font-size:26px">${fmt(k.esperado)}</div></div></div>
  <label class="f" for="ci-monto">¿Cuánto efectivo hay realmente en la caja?</label><input class="in money" id="ci-monto" inputmode="numeric" placeholder="$0" style="font-size:24px;min-height:58px">${teclado("ci-monto")}
  <div id="ci-dif" style="margin:10px 0"></div><div id="ci-obs"></div>
  <button class="btn pri xl wide" data-act="doCerrar">${ic("lock", 22)} CERRAR CAJA</button>`; }); };
document.addEventListener("input", e => {
  if (e.target.id === "ci-monto") { const k = cajaCalc(cajaHoy()), v = num(e.target.value), dif = v - k.esperado, has = e.target.value.trim() !== "";
    $("#ci-dif").innerHTML = has ? `<div class="notice ${dif === 0 ? "ok" : "bad"}"><b>${dif === 0 ? "La caja cuadra" : dif > 0 ? "Sobran " + fmt(dif) : "Faltan " + fmt(-dif)}</b></div>` : "";
    $("#ci-obs").innerHTML = has && dif !== 0 ? `<label class="f">¿Qué pasó?</label>${sel("ci-mot", ["Error de cambio", "Gasto sin anotar", "Retiro sin anotar", "No sé"], "")}<label class="f" for="ci-nota">Detalle (opcional)</label><input class="in plain" id="ci-nota">` : ""; }
  if (e.target.id === "qsearch") { S.q = e.target.value; const g = $("#grid"); if (g) g.innerHTML = gridHTML(); }
});
ACT.doCerrar = async () => { const raw = $("#ci-monto").value; if (!raw.trim()) { toast("Escribe cuánto efectivo hay en la caja.", true); return; } const mot = selVal("ci-mot"), nota = ($("#ci-nota") || {value: ""}).value.trim();
  const k = cajaCalc(cajaHoy()), dif = num(raw) - k.esperado; if (dif !== 0 && !mot) { toast("Elige qué pasó con la diferencia.", true); return; }
  await guardar(async () => { const ci = await cerrarCaja(num(raw), (mot ? mot : "") + (nota ? " · " + nota : "")); abrir(() => `<div class="done"><div class="tick">${ic("ok", 52)}</div><h2 style="margin:14px 0 4px">Caja cerrada</h2><p class="muted">Vendiste ${fmt(ci.resumen.ventas)} en ${ci.resumen.n} ventas.<br>${ci.dif === 0 ? "La caja cuadró." : ci.dif > 0 ? "Sobraron " + fmt(ci.dif) + "." : "Faltaron " + fmt(-ci.dif) + "."}</p><button class="btn pri xl wide" data-act="cerrar">Listo</button></div>`); draw(); }); };
ACT.reabrir = async (el, d) => { const c = d.id ? cajasAll().find(x => x.id === d.id) : cajaHoy(); if (c && await confirmar({titulo: "¿Reabrir la caja?", texto: "Quedará registrado quién la reabrió.", si: "Sí, reabrir", no: "No"})) await guardar(() => reabrirCaja(c), "Caja reabierta"); };

