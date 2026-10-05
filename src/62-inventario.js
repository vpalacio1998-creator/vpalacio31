/* ============ 62 · inventario completo ============
   Empleado: consulta, alertas y pérdidas. Administrador: entradas, conteos, movimientos (kardex) con saldo, insumos y valor.
   Las ventas descuentan solas; cada cambio manual deja registro con antes y después. */
const TIPO_MOV = {venta: "Venta", perdida: "Pérdida", entrada: "Llegó mercancía", compra: "Compra recibida", conteo: "Conteo", produccion: "Producción", consumo: "Consumo de insumo"};
S.invTab = "resumen"; S.invEstado = "todos"; S.invCat = "Todas"; S.movRango = "7"; S.movPid = "";
function movimientosInv(pid) {
  const out = [];
  for (const v of ventasOk()) for (const l of lineasExp(v)) if (!pid || l.pid === pid) out.push({t: v.t, fecha: v.fecha, pid: l.pid, tipo: "venta", q: -l.q, det: v.num || "", uid: v.uid});
  for (const m of mermasAll()) if (!pid || m.pid === pid) out.push({t: m.t, fecha: m.fecha, pid: m.pid, tipo: "perdida", q: -m.q, det: m.motivo || "", uid: m.uid});
  for (const d of Object.values(col("movinv"))) for (const x of (d.items || [])) if (!pid || x.pid === pid) out.push({t: x.t, fecha: ymd(new Date(x.t)), pid: x.pid, tipo: x.tipo, q: x.q, antes: x.antes, despues: x.despues, det: (x.motivo || "") + (x.ref ? " · " + x.ref : ""), uid: x.uid});
  out.sort((x, y) => x.t - y.t);
  if (pid) {             // saldo: desde cada conteo/entrada (valor conocido) y desde el último conteo guardado
    const s0 = stockDocs()[pid]; let saldo = null;
    for (const m of out) { if (m.despues != null) saldo = m.despues; else if (s0 && m.t > (s0.t || 0)) { if (saldo == null) saldo = s0.base; saldo += m.q; } else if (saldo != null) saldo += m.q; m.saldo = saldo; }
  }
  return out;
}
const consumoDia = pid => avgDaily(pid);
function lineaCobertura(p) {
  if (p.controla === false) return "No lleva inventario";
  const e = estadoProd(p), a = consumoDia(p.id), cov = cobertura(p.id), ag = agotaEn(p.id);
  if (e.k === "sin") return "Sin contar todavía"; if (e.k === "agotado") return "Agotado";
  if (a == null) return "Aún no hay suficientes ventas para calcular cuánto alcanza";
  if (a === 0) return "No se ha vendido en los últimos días";
  return "Se venden ~" + fmtN(a, 1) + " al día · alcanza " + (cov < 1 ? "menos de 1 día" : "~" + fmtN(cov, cov < 10 ? 1 : 0) + " días") + (ag && ag.dias <= 7 ? " · se agotaría " + cuandoTxt(ag.fecha) : "");
}
const ESTADOS_INV = [["todos", "Todos"], ["agotado", "Agotados"], ["bajo", "Quedan pocos"], ["disponible", "Normales"], ["sin", "Sin contar"]];
function filaInventario(p) {
  const e = estadoProd(p), adm = esAdmin(), st = e.st;
  return `<div class="row click" style="padding:12px 0;cursor:pointer" data-act="verProd" data-id="${esc(p.id)}" role="button" tabindex="0" aria-label="Ver ${esc(p.nombre)}">
    <span class="art" style="width:48px;height:48px;border-radius:12px;background:var(--surface-2);display:grid;place-items:center;overflow:hidden;flex:none">${prodArt(p, 38)}</span>
    <div class="l" style="flex:1"><b>${esc(p.nombre)}</b><div style="margin:3px 0">${pillEstado(e)}</div><div class="small muted">${esc(lineaCobertura(p))}</div></div>
    <div style="text-align:right;min-width:62px"><div class="big" style="font-size:28px;color:${e.k === "agotado" ? "var(--danger)" : "inherit"}">${st == null ? "–" : fmtN(st, 2)}</div><div class="xs muted">${esc(p.unidad || "und")}</div></div>
    ${adm ? `<div class="btns" style="flex-direction:column;gap:6px"><button class="btn ghost sm" data-act="entrada" data-id="${esc(p.id)}">+ Llegó</button><button class="btn ghost sm" data-act="contar" data-id="${esc(p.id)}">Contar</button></div>` : ""}</div>`;
}
function listaInventario(tipo) {
  const q = (S.q || "").toLowerCase(), base = prods().filter(p => p.activo !== false && p.controla !== false && !p.combo && (tipo === "insumo" ? p.tipo === "insumo" : p.tipo !== "insumo"));
  const cats = ["Todas"].concat(uniq(base.map(p => p.cat || "Otros"))); if (!cats.includes(S.invCat)) S.invCat = "Todas";
  const ord = {agotado: 0, bajo: 1, sin: 2, disponible: 3}, list = base.filter(p => (S.invEstado === "todos" || estadoProd(p).k === S.invEstado) && (S.invCat === "Todas" || (p.cat || "Otros") === S.invCat) && (!q || p.nombre.toLowerCase().includes(q))).sort((a, b) => ord[estadoProd(a).k] - ord[estadoProd(b).k] || a.nombre.localeCompare(b.nombre, "es"));
  return `<div class="search" style="margin-bottom:10px">${ic("buscar", 20)}<input class="in plain" id="invq" type="search" placeholder="Buscar ${tipo === "insumo" ? "insumo" : "producto"}" value="${esc(S.q)}" aria-label="Buscar"></div>
    <div class="chips">${ESTADOS_INV.map(([k, l]) => `<button class="chip" data-act="invEstado" data-v="${k}" aria-pressed="${S.invEstado === k}">${l} (${k === "todos" ? base.length : base.filter(p => estadoProd(p).k === k).length})</button>`).join("")}</div>
    ${cats.length > 2 ? `<div class="chips">${cats.map(c => `<button class="chip" data-act="invCat" data-v="${esc(c)}" aria-pressed="${S.invCat === c}">${esc(c)}</button>`).join("")}</div>` : ""}
    ${list.length ? `<div class="card">${list.map(filaInventario).join("")}</div>` : vacio("inventario", base.length ? "Nada con ese filtro" : (tipo === "insumo" ? "Todavía no hay insumos" : "Todavía no hay productos con inventario"), base.length ? "Cambia el filtro o la búsqueda." : (esAdmin() ? "Crea uno en Productos y activa “Llevar inventario”." : "El administrador aún no los ha configurado."), !base.length && esAdmin() ? '<button class="btn pri xl" data-act="nuevoProducto">AGREGAR PRODUCTO</button>' : "")}`;
}
function resumenInventario() {
  const ps = terminados().filter(p => p.activo !== false && p.controla !== false && !p.combo), cnt = k => ps.filter(p => estadoProd(p).k === k).length, adm = esAdmin();
  const valor = adm ? sum(prods().filter(p => p.controla !== false && !p.combo), p => { const s = stockDe(p.id), c = costoActual(p.id); return s != null && s > 0 && c != null ? s * c : 0; }) : 0;
  const rs = riesgosStock().concat(riesgosInsumos()), rh = riesgoHoras();
  const filas = ps.map(p => ({p, e: estadoProd(p), a: consumoDia(p.id), cov: cobertura(p.id), ag: agotaEn(p.id)})).filter(x => x.e.k === "agotado" || x.e.k === "bajo" || (x.ag && x.ag.dias <= 5)).sort((x, y) => (x.e.k === "agotado" ? -1 : 0) - (y.e.k === "agotado" ? -1 : 0) || (x.cov == null ? 99 : x.cov) - (y.cov == null ? 99 : y.cov));
  return `<div class="kpis"><div class="kpi"><span>${ic("x", 13)} Agotados</span><b style="color:${cnt("agotado") ? "var(--danger)" : "inherit"}">${cnt("agotado")}</b></div><div class="kpi"><span>${ic("alerta", 13)} Quedan pocos</span><b>${cnt("bajo")}</b></div><div class="kpi"><span>${ic("ok", 13)} Normales</span><b>${cnt("disponible")}</b></div>${adm ? `<div class="kpi"><span>Valor del inventario</span><b>${fmtK(valor)}</b><small>a costo</small></div>` : `<div class="kpi"><span>Sin contar</span><b>${cnt("sin")}</b></div>`}</div>
    ${rh.length ? `<div class="alertrow" style="border-color:var(--warn)"><span class="sev warn"></span><div><b>${esc(rh[0].p.nombre)} probablemente se agotará antes de las ${hora(rh[0].hora)}.</b><span>Quedan ${Math.max(0, rh[0].st)} y se venden ~${fmtN(rh[0].r, 1)} por hora.</span></div></div>` : ""}
    <div class="card"><h3>Alertas de inventario</h3>${rs.length ? rs.slice(0, 8).map(r => `<div class="row" style="align-items:flex-start;cursor:pointer" data-act="verProd" data-id="${esc(r.pid)}"><span class="sev ${r.sev}" style="margin-top:7px"></span><div class="l" style="flex:1"><b>${esc(r.t)}</b><div class="small muted">${esc(r.d || "")}</div></div></div>`).join("") : '<p class="muted" style="margin:0">Todo el inventario está en orden.</p>'}</div>
    ${filas.length ? `<div class="card"><h3>Riesgo de agotarse</h3>${tablaVista([{h: "Producto", f: x => esc(x.p.nombre)}, {h: "Hay", n: 1, f: x => x.e.st == null ? "–" : Math.max(0, x.e.st)}, {h: "Se vende/día", n: 1, f: x => x.a == null ? "–" : fmtN(x.a, 1)}, {h: "Alcanza", n: 1, f: x => x.e.k === "agotado" ? "0" : x.cov == null ? "–" : x.cov === Infinity ? "∞" : fmtN(x.cov, 1) + " d"}, {h: "Riesgo", f: x => `<span class="pill ${x.e.k === "agotado" || (x.ag && x.ag.dias <= 1) ? "bad" : "warn"}">${x.e.k === "agotado" ? "Agotado" : x.ag && x.ag.dias <= 1 ? "Alto" : "Medio"}</span>`}], filas)}${adm ? '<button class="btn pri" style="margin-top:4px" data-act="ir" data-r="compras">Ver qué pedir</button>' : '<p class="small muted" style="margin:6px 0 0">Avísale al administrador para hacer el pedido.</p>'}</div>` : ""}`;
}
function movimientosVista() {
  const [a, b] = rangoFechas(S.movRango), ps = prods().filter(p => p.controla !== false && !p.combo), movs = movimientosInv(S.movPid || null).filter(m => m.fecha >= a && m.fecha <= b).reverse().slice(0, 150);
  pedirNombres(uniq(movs.map(m => m.uid)));
  return `<div class="seg" style="margin-bottom:10px">${[["hoy", "Hoy"], ["7", "7 días"], ["30", "30 días"]].map(([k, l]) => `<button data-act="movRango" data-v="${k}" aria-pressed="${S.movRango === k}">${l}</button>`).join("")}</div>
    <label class="f" for="mv-pid">Producto</label><select class="in" id="mv-pid" data-act-change="movPid"><option value="">Todos</option>${ps.map(p => `<option value="${esc(p.id)}" ${S.movPid === p.id ? "selected" : ""}>${esc(p.nombre)}</option>`).join("")}</select>
    <div class="card" style="margin-top:12px">${movs.length ? movs.map(m => `<div class="row" style="align-items:flex-start;padding:9px 0"><div class="l" style="flex:1"><b>${esc(TIPO_MOV[m.tipo] || m.tipo)}</b> · ${esc((prod(m.pid) || {nombre: m.pid}).nombre)}<div class="small muted">${diaCorto(m.fecha)} ${hora(m.t)}${m.det ? " · " + esc(m.det) : ""}${nombreDe(m.uid) ? " · " + esc(nombreDe(m.uid)) : ""}${m.antes != null && m.despues != null ? " · " + fmtN(m.antes, 2) + " → " + fmtN(m.despues, 2) : ""}</div></div><div style="text-align:right"><b style="color:${m.q < 0 ? "var(--danger)" : "var(--marca-d)"}">${m.q > 0 ? "+" : ""}${fmtN(m.q, 2)}</b>${S.movPid && m.saldo != null ? `<div class="xs muted">Saldo ${fmtN(m.saldo, 2)}</div>` : ""}</div></div>`).join("") : '<p class="muted" style="margin:0">No hay movimientos en este periodo.</p>'}</div>
    ${S.movPid ? "" : '<p class="xs muted">Elige un producto para ver el saldo después de cada movimiento.</p>'}`;
}
VIEWS.inventario = () => {
  const adm = esAdmin(), tabs = adm ? [["resumen", "Resumen"], ["productos", "Productos"], ["insumos", "Insumos"], ["movimientos", "Movimientos"]] : [["resumen", "Resumen"], ["productos", "Productos"]];
  if (!tabs.some(t => t[0] === S.invTab)) S.invTab = "resumen";
  const accion = adm ? `<div class="btns"><button class="btn pri" data-act="entrada" data-id="">${ic("plus", 18)} LLEGÓ MERCANCÍA</button><button class="btn ghost" data-act="merma">${ic("merma", 18)} Pérdida</button></div>` : `<button class="btn pri xl" data-act="merma">${ic("merma", 18)} ANOTAR PÉRDIDA</button>`;
  const cuerpo = S.invTab === "resumen" ? resumenInventario() : S.invTab === "productos" ? listaInventario("terminado") : S.invTab === "insumos" ? listaInventario("insumo") : movimientosVista();
  return cabecera("Inventario", "Lo que hay ahora. Cada venta lo descuenta sola.", accion) + `<div class="seg" style="margin-bottom:14px">${tabs.map(([k, l]) => `<button data-act="invTab" data-v="${k}" aria-pressed="${S.invTab === k}">${l}</button>`).join("")}</div>` + cuerpo;
};
ACT.invTab = (el, d) => { S.invTab = d.v; S.q = ""; draw(); };
ACT.invEstado = (el, d) => { S.invEstado = d.v; draw(); };
ACT.invCat = (el, d) => { S.invCat = d.v; draw(); };
ACT.movRango = (el, d) => { S.movRango = d.v; draw(); };
document.addEventListener("change", e => { if (e.target.dataset && e.target.dataset.actChange === "movPid") { S.movPid = e.target.value; draw(); } });
document.addEventListener("input", e => { if (e.target.id === "invq") { S.q = e.target.value; draw(); const i = $("#invq"); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } } });

/* ---------- ficha de producto: resumen → explicación → acción ---------- */
ACT.verProd = (el, d) => {
  const p = prod(d.id); if (!p) return; const adm = esAdmin();
  abrir(() => {
    const e = estadoProd(p), a = consumoDia(p.id), u7 = unidadesVent(p.id, 7).u, cov = cobertura(p.id), ag = agotaEn(p.id), c = adm ? costoActual(p.id) : null, rec = recomendarCompra(fechasHorizonte("3")).find(r => r.pid === p.id);
    const serie = []; for (let i = 29; i >= 0; i--) { const f = addDays(S.today, -i); serie.push({l: i % 7 === 0 ? String(parse(f).getDate()) : "", v: (unidadesDia()[p.id] || {})[f] || 0, tip: diaCorto(f) + "<br>" + ((unidadesDia()[p.id] || {})[f] || 0) + " vendidas", hi: i === 0}); }
    const movs = movimientosInv(p.id).slice(-8).reverse(), r = adm ? col("recetas")[p.id] : null; pedirNombres(uniq(movs.map(m => m.uid)));
    return `<div class="head"><div style="display:flex;gap:12px;align-items:center"><span class="art" style="width:56px;height:56px;border-radius:14px;background:var(--surface-2);display:grid;place-items:center;overflow:hidden">${prodArt(p, 44)}</span><div><h2 style="margin:0">${esc(p.nombre)}</h2><div class="small muted">${esc(p.cat || "")}${adm ? " · " + fmt(p.precio) : ""}</div></div></div><button class="btn ghost sm" data-act="cerrar">${ic("x", 18)} Cerrar</button></div>
    <div class="kpis k3" style="margin-top:4px"><div class="kpi"><span>Hay ahora</span><b style="color:${e.k === "agotado" ? "var(--danger)" : "inherit"}">${e.st == null ? "–" : fmtN(e.st, 2)}</b><small>${pillEstado(e)}</small></div><div class="kpi"><span>Se vende al día</span><b>${a == null ? "–" : fmtN(a, 1)}</b><small>${u7} en 7 días</small></div><div class="kpi"><span>Alcanza</span><b>${e.k === "agotado" ? "0" : cov == null ? "–" : cov === Infinity ? "∞" : fmtN(cov, 1)}</b><small>${ag ? "se agota " + cuandoTxt(ag.fecha) : "días"}</small></div></div>
    <div class="small muted" style="margin:6px 0 10px">Mínimo ${p.min || 0} · reserva de seguridad ${p.seg || 0}${adm && c != null && e.st != null ? " · valor " + fmt(Math.max(0, e.st) * c) : ""}</div>
    ${rec && rec.comprar > 0 ? `<div class="notice ${rec.riesgo === "bad" ? "bad" : ""}" style="display:flex;justify-content:space-between;align-items:center;gap:10px"><span><b>Recomendación: comprar ${rec.comprar}</b> para los próximos 3 días.</span>${adm ? `<button class="btn ghost sm" data-act="porque" data-id="${esc(p.id)}">¿Por qué?</button>` : ""}</div>` : ""}
    <h3 style="font-size:15px;margin-top:12px">Ventas de los últimos 30 días</h3>${barras(serie, {fmt: x => String(x), aria: "Unidades vendidas por día", h: 120})}
    <h3 style="font-size:15px;margin-top:12px">Últimos movimientos</h3>${movs.length ? movs.map(m => `<div class="row" style="padding:8px 0"><div class="l"><b>${esc(TIPO_MOV[m.tipo] || m.tipo)}</b><div class="xs muted">${diaCorto(m.fecha)} ${hora(m.t)}${m.det ? " · " + esc(m.det) : ""}</div></div><div style="text-align:right"><b style="color:${m.q < 0 ? "var(--danger)" : "var(--marca-d)"}">${m.q > 0 ? "+" : ""}${fmtN(m.q, 2)}</b>${m.saldo != null ? `<div class="xs muted">Saldo ${fmtN(m.saldo, 2)}</div>` : ""}</div></div>`).join("") : '<p class="muted small">Sin movimientos todavía.</p>'}
    ${r && (r.lineas || []).length ? `<h3 style="font-size:15px;margin-top:12px">Receta (por unidad)</h3>${r.lineas.map(l => `<div class="row" style="padding:6px 0"><span>${esc((prod(l.iid) || {nombre: "?"}).nombre)}</span><b>${l.q} ${esc((prod(l.iid) || {}).unidad || "")}</b></div>`).join("")}` : ""}
    <div class="btns" style="margin-top:16px">${adm ? `<button class="btn pri" style="flex:1" data-act="entrada" data-id="${esc(p.id)}">+ Llegó mercancía</button><button class="btn ghost" style="flex:1" data-act="contar" data-id="${esc(p.id)}">Contar</button>` : ""}<button class="btn ghost" style="flex:1" data-act="merma" data-id="${esc(p.id)}">Pérdida</button>${adm ? `<button class="btn ghost" style="flex:1" data-act="editProd" data-id="${esc(p.id)}">Editar</button>` : ""}</div>`;
  }, {wide: true, live: true});
};

/* ---------- llegó mercancía (entrada sin pasar por una compra) ---------- */
ACT.entrada = (el, d) => {
  S.entPid = d.id || ""; const ps = prods().filter(p => p.activo !== false && p.controla !== false && !p.combo);
  abrir(() => { const p = S.entPid ? prod(S.entPid) : null;
    return head("Llegó mercancía") + (p ? `<p style="margin-top:0"><b>${esc(p.nombre)}</b> · hay ${stockDe(p.id) == null ? "sin contar" : fmtN(stockDe(p.id), 2)}</p>` : `<label class="f" for="en-p">¿Qué llegó?</label><select class="in" id="en-p" data-act-change="entPid"><option value="">Elige el producto</option>${ps.map(x => `<option value="${esc(x.id)}">${esc(x.nombre)}</option>`).join("")}</select>`) +
    `<label class="f">¿Cuántas llegaron?</label>${stepper("en-q", 10, 99999)}
    <details style="margin:12px 0"><summary class="small" style="font-weight:700;min-height:40px;display:flex;align-items:center;cursor:pointer">Más datos (opcional)</summary>
      <label class="f" for="en-c">Costo por unidad</label><input class="in money" id="en-c" inputmode="numeric" placeholder="${p && costoActual(p.id) != null ? fmt(costoActual(p.id)) : "$0"}"><label class="f" for="en-prov">Proveedor</label><input class="in plain" id="en-prov" value="${esc(S.ultimoProv)}"></details>
    <p class="xs muted">Si llegó un pedido que creaste en Compras, regístralo allá (“Registrar llegada”) para que también quede la compra.</p>
    <button class="btn pri xl wide" data-act="doEntrada">GUARDAR Y SUMAR</button>`; });
};
document.addEventListener("change", e => { if (e.target.dataset && e.target.dataset.actChange === "entPid") S.entPid = e.target.value; });
ACT.doEntrada = async () => { const pid = S.entPid || ($("#en-p") || {}).value; if (!pid) { toast("Elige el producto que llegó.", true); return; } const q = numDec($("#en-q").value), c = num(($("#en-c") || {}).value), prov = (($("#en-prov") || {}).value || "").trim(); if (prov) S.ultimoProv = prov;
  await guardar(async () => { await entradaStock(pid, q, {costo: c || null, proveedor: prov}); cerrar(); }, "Inventario actualizado: +" + q); };

/* ---------- contar ---------- */
ACT.contar = (el, d) => { const p = prod(d.id), st = stockDe(d.id);
  abrir(() => `${head("Contar " + p.nombre)}<p class="muted" style="margin-top:0">${st == null ? "Todavía no se ha contado." : "OLI calcula que hay " + fmtN(st, 2) + " " + esc(p.unidad || "") + "."} ¿Cuántos hay de verdad?</p>
    <input class="in plain" id="ct-q" inputmode="decimal" value="" placeholder="0" style="font-size:30px;text-align:center;min-height:64px" autofocus>${teclado("ct-q")}
    <div id="ct-dif" class="small" style="margin-top:8px;min-height:20px"></div>
    <label class="f">Motivo</label>${sel("ct-mot", ["Conteo de rutina", "Inventario inicial", "Corrección", "Diferencia encontrada"], st == null ? "Inventario inicial" : "Conteo de rutina")}
    <button class="btn pri xl wide" style="margin-top:14px" data-act="doContar" data-id="${esc(d.id)}">GUARDAR CONTEO</button>`); };
document.addEventListener("input", e => { if (e.target.id === "ct-q") { const d = $("#panel [data-act='doContar']"); if (!d) return; const st = stockDe(d.dataset.id), v = numDec(e.target.value), el = $("#ct-dif"); el.innerHTML = e.target.value.trim() && st != null && v !== st ? `Diferencia: <b style="color:${v < st ? "var(--danger)" : "var(--marca-d)"}">${v > st ? "+" : ""}${fmtN(v - st, 2)}</b>` : ""; } });
ACT.doContar = async (el, d) => { const raw = $("#ct-q").value; if (!raw.trim()) { toast("Escribe cuántos hay.", true); return; } await guardar(async () => { await contarStock(d.id, numDec(raw), selVal("ct-mot")); cerrar(); }, "Conteo guardado"); };

/* ---------- pérdidas ---------- */
ACT.merma = (el, d) => { S.mermaPid = (d && d.id) || ""; abrir(() => {
  const ps = terminados().filter(p => p.activo !== false && p.controla !== false && !p.combo).concat(esAdmin() ? insumos().filter(p => p.activo !== false && p.controla !== false) : []);
  return `${head("Anotar pérdida")}<p class="muted" style="margin-top:0">Cuando algo se daña, se vence o se cae.</p><label class="f">¿Qué producto?</label>
  <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px">${ps.map(p => `<button class="tile${S.mermaPid === p.id ? " inc" : ""}" style="min-height:64px;padding:10px" data-act="mermaProd" data-id="${esc(p.id)}"><span class="n">${esc(p.nombre)}</span></button>`).join("")}</div>
  <label class="f">¿Cuántas?</label>${stepper("mm-q", 1)}<label class="f">¿Por qué?</label>${sel("mm-mot", MOTIVOS_MERMA, "")}<label class="f" for="mm-obs">Detalle (opcional)</label><input class="in plain" id="mm-obs">
  <button class="btn pri xl wide" style="margin-top:14px" data-act="doMerma">GUARDAR</button>`; }); };
ACT.mermaProd = (el, d) => { S.mermaPid = d.id; document.querySelectorAll("#panel .tile").forEach(t => t.classList.toggle("inc", t.dataset.id === d.id)); };
ACT.doMerma = async () => { if (!S.mermaPid) { toast("Elige el producto.", true); return; } const mot = selVal("mm-mot"); if (!mot) { toast("Elige por qué fue.", true); return; }
  await guardar(async () => { await registrarMerma(S.mermaPid, numDec($("#mm-q").value), mot, ($("#mm-obs") || {value: ""}).value.trim()); cerrar(); }, "Pérdida anotada"); };
