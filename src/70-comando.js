/* ============ 70 · CENTRO DE COMANDO OLI (inicio del administrador) ============
   Orden del DOM = orden móvil. En escritorio se reparte en dos columnas; lo urgente sube solo. */
const NAMES = {};
function nombreDe(uid) { return NAMES[uid] || (uid === DS.uid && DS.nombre ? DS.nombre : ""); }
async function pedirNombres(ids) {
  ids = uniq(ids.filter(i => i && i !== "local" && !(i in NAMES))); if (!ids.length || !window.claude || !window.claude.use) return;
  try { const u = await window.claude.use("user"); if (!u) return; const ps = await u.profiles(ids); let ch = false; for (const i of ids) { NAMES[i] = (ps[i] && ps[i].name) || ""; ch = true; } if (ch) changed(); } catch (e) {}
}
const comandoModo = () => { try { return localStorage.getItem("oli-home") || "completa"; } catch (e) { return "completa"; } };
ACT.modoHome = (el, d) => { try { localStorage.setItem("oli-home", d.v); } catch (e) {} draw(); };
ACT.comp = (el, d) => { S.comp = d.v; draw(); };
S.comp = "dow";

function eventosHoy(max = 60) {
  const t = S.today, ev = [], disp = col("dispositivos"), dn = dev => (disp[dev] || {}).nombre || "";
  for (const v of ventasAll().filter(v => v.fecha === t)) ev.push({t: v.t, k: v.anulada ? "anul" : "venta", ic: v.anulada ? "x" : "ok", a: v.anulada ? "Venta anulada" : "Nueva venta", b: (v.items || []).slice(0, 3).map(i => nombreCorto({nombre: i.n}) + " × " + i.q).join(", ") + ((v.items || []).length > 3 ? "…" : ""), c: fmt(v.total) + " · " + v.m, quien: v.uid, dev: dn(v.dev)});
  for (const c of cajasAll().filter(c => c.fecha === t)) { if (c.apertura) ev.push({t: c.apertura.t, k: "caja", ic: "caja", a: "Caja abierta", b: dn(c.dev) || c.devNombre || "", c: fmt(c.apertura.monto), quien: c.apertura.uid}); for (const ci of (c.cierres || [])) ev.push({t: ci.t, k: "caja", ic: "lock", a: "Caja cerrada", b: dn(c.dev) || c.devNombre || "", c: ci.dif === 0 ? "Cuadró" : "Diferencia " + fmt(ci.dif), quien: ci.uid}); for (const m of (c.movs || [])) ev.push({t: m.t, k: "caja", ic: "moneda", a: m.tipo === "retiro" ? "Salió dinero de caja" : m.tipo === "ingreso" ? "Entró dinero a caja" : "Pago desde caja", b: m.motivo, c: fmt(m.monto), quien: m.uid}); }
  for (const g of Object.values(col("gastos"))) if (g.fecha === t && g.t) ev.push({t: g.t, k: "gasto", ic: "finanzas", a: "Gasto registrado", b: (g.cat || "") + (g.desc ? " · " + g.desc : ""), c: fmt(g.valor), quien: g.uid});
  for (const m of mermasAll().filter(m => m.fecha === t)) ev.push({t: m.t, k: "merma", ic: "merma", a: "Pérdida anotada", b: ((prod(m.pid) || {}).nombre || "") + " × " + m.q, c: m.motivo, quien: m.uid});
  return ev.sort((a, b) => b.t - a.t).slice(0, max);
}
const evHTML = e => `<div class="row" style="padding:9px 0;align-items:flex-start"><span style="color:var(--marca);margin-top:2px">${ic(e.ic, 18)}</span><div class="l" style="flex:1"><b>${esc(e.a)}</b><div class="small muted">${esc(e.b || "")}${e.quien && nombreDe(e.quien) ? " · " + esc(nombreDe(e.quien)) : e.dev ? " · " + esc(e.dev) : ""}</div></div><div style="text-align:right"><div class="small" style="font-weight:700">${esc(e.c || "")}</div><div class="xs muted">${hora(e.t)}</div></div></div>`;
ACT.verTodoEventos = () => abrir(() => head("Lo que pasó hoy") + (eventosHoy().length ? eventosHoy().map(evHTML).join("") : '<p class="muted">Todavía no hay movimientos hoy.</p>'), {live: true, wide: true});

/* ---- bloques ---- */
function bEncabezado() {
  const nm = (DS.nombre || "").split(" ")[0], ult = Math.max(DS.lastRemote || 0, SYNC.ultima || 0), off = DS.mode === "db" && !SYNC.online;
  return `<div class="full" style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap"><div><div class="muted small">${diaLargo(S.today)} · <span id="reloj">${hora(Date.now())}</span></div><h2 style="margin:2px 0 0">${saludo()}${nm ? ", " + esc(nm) : ""} 🌱</h2><div class="muted small">Así va OLI hoy</div></div>
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${off ? `<span class="pill warn">${ic("alerta", 14)} Sin conexión</span>` : `<span class="pill ok"><span class="dot"></span>EN TIEMPO REAL</span>`}
    <div class="seg"><button data-act="modoHome" data-v="resumida" aria-pressed="${comandoModo() === "resumida"}">Resumida</button><button data-act="modoHome" data-v="completa" aria-pressed="${comandoModo() === "completa"}">Completa</button></div></div></div>
    ${off ? `<div class="full notice">Estás viendo el último estado recibido${ult ? " (" + haceTxt(ult) + ")" : ""}. Los números pueden no incluir las ventas más recientes.</div>` : ""}`;
}
function bEstado() {
  const e = estadoGeneral(), col2 = {ok: "var(--marca)", warn: "var(--warn)", bad: "var(--danger)"}[e.nivel], ico = e.nivel === "ok" ? "ok" : "alerta";
  return `<div class="full card" style="border-left:6px solid ${col2};padding:18px"><div style="display:flex;gap:12px;align-items:flex-start"><span style="color:${col2}">${ic(ico, 30)}</span><div style="min-width:0"><div style="font-family:var(--display);font-weight:600;font-size:22px">${e.titulo}</div><p style="margin:4px 0 0;font-size:16px">${esc(e.linea)}</p></div></div></div>`;
}
function bAtencion() {
  const rh = riesgoHoras(), al = alertas().filter(a => a.sev === "bad" && a.tipo === "inventario")[0], r = rh[0];
  if (!r && !al) return "";
  if (r) return `<div class="full card" style="border:2px solid var(--warn);background:var(--warn-soft)"><div class="small" style="font-weight:700;letter-spacing:.06em;color:var(--warn)">${ic("alerta", 14)} ATENCIÓN</div><h3 style="margin:6px 0">${esc(r.p.nombre)} probablemente se agotará antes de las ${hora(r.hora)}.</h3>
    <div class="kpis k3" style="margin:8px 0"><div class="kpi"><span>Inventario</span><b>${Math.max(0, r.st)}</b></div><div class="kpi"><span>Se vende</span><b>${fmtN(r.r, 1)}/h</b></div><div class="kpi"><span>Alcanza</span><b>${fmtN(r.horas, 1)} h</b></div></div>
    <p style="margin:0 0 10px"><b>Recomendación:</b> reponer ${r.rec} unidades.</p><div class="btns"><button class="btn pri" data-act="resolver" data-id="${esc(r.p.id)}" data-q="${r.rec}">RESOLVER</button><button class="btn ghost" data-act="porque" data-id="${esc(r.p.id)}">¿Por qué?</button></div></div>`;
  return `<div class="full card" style="border:2px solid var(--danger);background:var(--danger-soft)"><div class="small" style="font-weight:700;letter-spacing:.06em;color:var(--danger)">${ic("alerta", 14)} ATENCIÓN</div><h3 style="margin:6px 0">${esc(al.t)}</h3><p style="margin:0 0 10px">${esc(al.d || "")}</p><div class="btns"><button class="btn pri" data-act="ir" data-r="compras">Ver qué pedir</button></div></div>`;
}
ACT.resolver = (el, d) => { const p = prod(d.id), q = Number(d.q) || 1; abrir(() => head("Resolver: " + p.nombre) + `<p style="margin-top:0">OLI crea un pedido pendiente con <b>${q}</b> unidades. Luego puedes ajustarlo en Compras.</p>
  <label class="f">Cantidad a pedir</label>${stepper("rs-q", q)}<label class="f" for="rs-prov">Proveedor (opcional)</label><input class="in plain" id="rs-prov" value="${esc(S.ultimoProv)}" placeholder="Ej: Distribuidora">
  <button class="btn pri xl wide" style="margin-top:14px" data-act="doResolver" data-id="${esc(d.id)}">CREAR PEDIDO</button>`); };
ACT.doResolver = async (el, d) => { const q = num($("#rs-q").value), p = prod(d.id), prov = $("#rs-prov").value.trim(); S.ultimoProv = prov;
  await guardar(async () => { await crearCompra({proveedor: prov, lineas: [{pid: d.id, q, costo: costoActual(d.id), ok: false}]}); cerrar(); irA("compras"); }, "Pedido creado: " + q + " de " + p.nombre); };
ACT.porque = (el, d) => abrirExplicacion(d.id, "3");
function bDinero() {
  const t = S.today, f = finanzas(t, t); let cmp = comparacion(S.comp); const modo = S.comp; if (cmp.delta == null && modo === "dow") { const alt = comparacion("7"); if (alt.delta != null) cmp = alt; }
  const m = metaHoy(), est = estimarCierre(), up = cmp.delta != null && cmp.delta >= 0;
  const prog = m ? clamp(f.ventas / m.meta, 0, 1.5) : 0, falta = m ? Math.max(0, m.meta - f.ventas) : 0, nec = m && f.ticket > 0 && falta > 0 ? Math.ceil(falta / f.ticket) : 0;
  return `<div class="full card" style="padding:18px"><div class="two wide-l" style="gap:20px">
    <div><div class="muted small" style="font-weight:700;letter-spacing:.05em">VENTAS HOY</div><div class="big" style="font-size:44px">${fmt(f.ventas)}</div>
      ${cmp.delta != null ? `<div style="margin-top:4px;font-weight:700;color:${up ? "var(--marca-d)" : "var(--danger)"}">${ic(up ? "sube" : "baja", 18)} ${up ? "↑" : "↓"} ${Math.abs(Math.round(cmp.delta * 100))}% <span class="muted" style="font-weight:500">vs ${esc(cmp.et)}</span></div><div class="small muted">Referencia: ${fmt(cmp.base)}</div>` : `<div class="small muted" style="margin-top:4px">Aún no hay suficiente historia para comparar.</div>`}
      <div class="seg" style="margin-top:10px">${MODOS_COMP.map(([k, l]) => `<button data-act="comp" data-v="${k}" aria-pressed="${S.comp === k}">${l}</button>`).join("")}</div></div>
    <div><div class="muted small" style="font-weight:700;letter-spacing:.05em">UTILIDAD ESTIMADA ${ayuda("Ventas menos el costo de lo vendido y los gastos de hoy. No incluye gastos fijos del mes (arriendo, nómina).")}</div><div class="big" style="font-size:36px;color:${f.utilidad < 0 ? "var(--danger)" : "var(--marca-d)"}">${fmt(f.utilidad)}</div>
      <div class="small muted">Margen ${pct(f.margen, 1)}${f.sinCosto ? " · " + f.sinCosto + " unidades sin costo" : ""}</div>
      <div class="row" style="padding:6px 0;margin-top:8px"><span class="small">Venta</span><b class="small">${fmt(f.ventas)}</b></div><div class="row" style="padding:6px 0"><span class="small">− Costo de lo vendido</span><b class="small">${fmt(f.cogs)}</b></div><div class="row" style="padding:6px 0"><span class="small">= Utilidad bruta</span><b class="small">${fmt(f.bruta)}</b></div><div class="row" style="padding:6px 0"><span class="small">− Gastos de hoy</span><b class="small">${fmt(f.gastos)}</b></div></div></div>
    <hr style="border:0;border-top:1px solid var(--line);margin:16px 0">
    <div class="two" style="gap:20px"><div><div class="row" style="border:0;padding:0"><b>META DE HOY</b><button class="btn ghost sm" data-act="editMeta">${m ? "Cambiar" : "Definir"}</button></div>
      ${m ? `<div class="big" style="font-size:26px;margin:4px 0">${fmt(f.ventas)} <span class="muted" style="font-size:16px">de ${fmt(m.meta)}</span></div><div class="bar" style="height:12px"><i style="width:${Math.min(100, prog * 100)}%"></i></div><div class="small" style="margin-top:6px"><b>${fmtN(prog * 100, 1)}%</b> · ${falta > 0 ? "faltan " + fmt(falta) : "¡meta cumplida!"}</div>${nec ? `<div class="small muted">Con tu ticket promedio actual necesitas unas ${nec} ventas más.</div>` : ""}<div class="xs muted">Meta ${esc(m.origen)}</div>` : '<p class="muted small">Aún no hay historia para sugerir una meta. Define una y OLI te mostrará el avance.</p>'}</div>
      <div><b>CIERRE ESTIMADO</b>${est.ok ? `<div class="big" style="font-size:26px;margin:4px 0">${fmtK(est.est)}</div><div class="small">Rango probable: <b>${fmtK(est.lo)} – ${fmtK(est.hi)}</b></div><div class="xs muted">Estimación basada en el comportamiento de hoy y en ${est.n} ${DOW[dowOf(S.today)]}s anteriores. No es una promesa.</div>` : `<p class="muted small" style="margin:6px 0 0">${esc(est.motivo)}</p>`}</div></div></div>`;
}
ACT.editMeta = () => abrir(() => head("Meta de hoy") + `<p class="muted" style="margin-top:0">¿Cuánto quieres vender por día?</p><input class="in money" id="mt-v" inputmode="numeric" value="${configNeg().metaDia ? fmt(configNeg().metaDia) : ""}" placeholder="$0" style="font-size:24px;min-height:58px">${teclado("mt-v")}<button class="btn pri xl wide" style="margin-top:14px" data-act="doMeta">GUARDAR META</button>`);
ACT.doMeta = async () => { await guardar(async () => { await guardarConfig({metaDia: num($("#mt-v").value)}); cerrar(); }, "Meta guardada"); };
function bHacer() {
  const d = decisionesHoy(), n = hoyTareas(), items = [].concat(d.urgente.map(x => ({s: "bad", x})), d.importante.map(x => ({s: "warn", x})), d.oportunidad.map(x => ({s: "ok", x}))).slice(0, 5);
  return `<div class="full card"><div class="row" style="padding-top:0"><h3 style="margin:0">¿Qué deberías hacer?</h3><div class="small" style="display:flex;gap:10px"><span>${ic("alerta", 14)}<b style="color:var(--danger)"> ${n.urg}</b> urgentes</span><span><b style="color:var(--warn)">${n.imp}</b> importantes</span><span><b style="color:var(--marca)">${n.opo}</b> oportunidades</span></div></div>
  ${items.length ? items.map(({s, x}, i) => `<div class="row" style="align-items:flex-start;padding:12px 0"><span class="sev ${s === "ok" ? "" : s}" style="margin-top:7px"></span><div class="l" style="flex:1"><b>${i + 1}. ${esc(x.t)}</b><div class="small muted">${esc(x.d || "")}</div></div><button class="btn ${s === "bad" ? "pri" : "ghost"} sm" data-act="ir" data-r="${x.tab === "hoy" ? "hoy" : x.tab}">${s === "bad" ? "RESOLVER" : "Ver"}</button></div>`).join("")
    : `<div class="notice ok" style="margin:10px 0 0">${ic("ok", 16)} No hay nada urgente. OLI está en orden.</div>`}</div>`;
}
function bAhora() {
  const t = S.today, f = finanzas(t, t), r = ritmoHora(), vs = ventasOk().filter(v => v.fecha === t), ult = vs[vs.length - 1], cajas = cajasAll().filter(c => c.fecha === t), efect = sum(cajas, c => cajaEstado(c) !== "sin" ? cajaCalc(c).esperado : 0), idCli = vs.filter(v => v.cliente).length, ev = eventosHoy(5);
  return `<div class="card"><div class="row" style="padding-top:0"><h3 style="margin:0">OLI ahora</h3><span class="pill ok"><span class="dot"></span>En vivo</span></div>
    <div class="kpis" style="grid-template-columns:repeat(2,1fr);margin:10px 0"><div class="kpi"><span>Última hora</span><b>${fmt(r.total)}</b><small>${r.n} ventas · ${r.ult10} en 10 min</small></div><div class="kpi"><span>Tickets hoy</span><b>${f.n}</b><small>Ticket promedio ${fmt(f.ticket)}</small></div><div class="kpi"><span>Productos vendidos</span><b>${f.uds}</b></div><div class="kpi"><span>Efectivo en caja</span><b>${fmt(efect)}</b></div></div>
    <div class="small muted" style="margin-bottom:6px">${ult ? "Última venta " + `<span data-ts="${ult.t}">${haceTxt(ult.t)}</span>` : "Todavía no hay ventas hoy."}${idCli ? " · " + idCli + " con cliente identificado" : ""}</div>
    <h3 style="font-size:15px;margin:10px 0 2px">EN VIVO</h3>${ev.length ? ev.map(evHTML).join("") : '<p class="muted small">Cuando se venda algo, aparece aquí.</p>'}
    <button class="btn ghost sm" style="margin-top:8px" data-act="verTodoEventos">VER TODO</button></div>`;
}
function bInventario() {
  const ps = terminados().filter(p => p.activo !== false && p.controla !== false && !p.combo), c = {agot: 0, bajo: 0, ok: 0, sin: 0}; ps.forEach(p => { const k = estadoProd(p).k; if (k === "agotado") c.agot++; else if (k === "bajo") c.bajo++; else if (k === "sin") c.sin++; else c.ok++; });
  const rs = ps.map(p => ({p, ag: agotaEn(p.id), cov: cobertura(p.id), rh: riesgoHoras().find(x => x.p.id === p.id)})).filter(x => x.rh || (x.ag && x.ag.dias <= 5 && x.cov != null && x.cov !== Infinity)).sort((a, b) => (a.rh ? a.rh.horas / 24 : a.cov) - (b.rh ? b.rh.horas / 24 : b.cov)).slice(0, 4);
  return `<div class="card"><div class="row" style="padding-top:0"><h3 style="margin:0">Inventario</h3><span class="muted small">${ps.length} productos</span></div>
    <div class="kpis k3" style="margin:8px 0"><div class="kpi"><span>${ic("x", 13)} Agotados</span><b style="color:${c.agot ? "var(--danger)" : "inherit"}">${c.agot}</b></div><div class="kpi"><span>${ic("alerta", 13)} Bajos</span><b>${c.bajo}</b></div><div class="kpi"><span>${ic("ok", 13)} Normales</span><b>${c.ok}</b></div></div>
    ${c.sin ? `<div class="small muted">${c.sin} sin contar</div>` : ""}${rs.length ? `<div class="small" style="font-weight:700;margin:8px 0 2px">Riesgo de agotarse pronto</div>${rs.map(x => `<div class="row" style="padding:8px 0"><span>${esc(x.p.nombre)}</span><b>${x.rh ? fmtN(x.rh.horas, 1) + " horas" : x.cov < 1 ? "menos de 1 día" : fmtN(x.cov, 1) + " días"}</b></div>`).join("")}` : '<p class="small muted">Nada en riesgo de agotarse pronto.</p>'}
    <button class="btn ghost sm" style="margin-top:8px" data-act="ir" data-r="inventario">VER INVENTARIO</button></div>`;
}
function bCompra() {
  const cr = compraResumen(); if (!cr.rows.length) return `<div class="card"><h3>${ic("compras", 18)} Compra recomendada</h3><p class="muted" style="margin:0">Por ahora no hace falta comprar. El inventario cubre la demanda de los próximos días.</p></div>`;
  return `<div class="card"><h3>${ic("compras", 18)} Compra recomendada</h3><p class="small muted" style="margin-top:-4px">${cr.rows.length} productos críticos · fecha recomendada: <b>HOY</b></p>
    ${cr.rows.slice(0, 5).map(r => `<div class="row" style="padding:8px 0"><span>${esc(r.p.nombre)}</span><b>${r.comprar}</b></div>`).join("")}${cr.rows.length > 5 ? `<div class="small muted">y ${cr.rows.length - 5} más</div>` : ""}
    <div class="row" style="border:0"><b>Total</b><b>${cr.total} unidades${cr.costo ? " · " + fmt(cr.costo) : ""}</b></div><p class="xs muted" style="margin:0 0 10px">Calculado según ventas históricas, inventario actual, demanda esperada y stock de seguridad.${cr.sinCosto ? " " + cr.sinCosto + " productos sin costo: el total es incompleto." : ""}</p>
    <button class="btn pri" data-act="ir" data-r="compras">VER LISTA DE COMPRA</button></div>`;
}
function bPrepara() {
  const pr = preparacion(); if (!pr.rows.length) return "";
  return `<div class="card"><h3>${ic("receta", 18)} Preparación recomendada</h3><p class="small muted" style="margin-top:-4px">Para mañana, ${diaCorto(pr.fecha)}</p>${pr.rows.slice(0, 4).map(r => `<div class="row" style="padding:8px 0"><span>${esc(r.p.nombre)}</span><b>${r.rec}</b></div>`).join("")}
    ${pr.insumos.length ? `<div class="small" style="font-weight:700;margin:8px 0 2px">Insumos necesarios</div>${pr.insumos.slice(0, 5).map(i => `<div class="row" style="padding:6px 0"><span class="small">${esc(i.n)}</span><span class="small" style="font-weight:700;color:${i.falta ? "var(--danger)" : "inherit"}">${fmtN(i.need, 1)} ${esc(i.u || "")}${i.falta ? " · falta" : ""}</span></div>`).join("")}` : `<p class="xs muted">Agrega recetas a tus productos para ver los insumos necesarios.</p>`}
    ${pr.cuellos.length ? `<div class="notice bad" style="margin-top:8px">Cuello de botella: ${esc(pr.cuellos.slice(0, 3).map(i => i.n).join(", "))}.</div>` : ""}
    <button class="btn ghost sm" style="margin-top:8px" data-act="ir" data-r="compras">VER PRODUCCIÓN</button></div>`;
}
function bFinde() {
  if (!finDeSemanaRelevante() || !histInfo().ok) return ""; const pf = prepararFinde(), f = dowFactors(), d = dowOf(S.today), fuerte = d === 4 || d === 5 || d === 6;
  const ups = [f.f[6], f.f[0]].filter(x => x > 0), up = ups.length ? sum(ups) / ups.length - 1 : null, cr = sum(pf.rows, r => (costoActual(r.pid) || 0) * (r.comprar || 0)), prod2 = sum(pf.rows, r => r.comprar || 0);
  return `<div class="card" style="${fuerte && pf.enRiesgo.length ? "border:2px solid var(--marca)" : ""}"><h3>${ic("rayo", 18)} Preparar fin de semana</h3><div class="kpis" style="grid-template-columns:repeat(2,1fr)"><div class="kpi"><span>Demanda esperada</span><b>${up != null ? (up >= 0 ? "+" : "") + Math.round(up * 100) + "%" : "–"}</b><small>vs un día normal</small></div><div class="kpi"><span>Riesgo de agotarse</span><b>${pf.enRiesgo.length}</b><small>productos</small></div><div class="kpi"><span>Compra recomendada</span><b>${cr ? fmtK(cr) : prod2 + " uds"}</b></div><div class="kpi"><span>Ventas esperadas</span><b>${fmtK(pf.ventasEsp)}</b></div></div><button class="btn ${fuerte && pf.enRiesgo.length ? "pri" : "ghost"} sm" style="margin-top:8px" data-act="finde">VER PLAN DEL FIN DE SEMANA</button></div>`;
}
ACT.finde = () => { S.comprasTab = "finde"; irA("compras"); };
function bProductos() {
  const e = estrellas(), t = S.today, hoyR = rentabilidad(t, t).sort((a, b) => b.uds - a.uds)[0], mes = rentabilidad(addDays(t, -29), t).filter(r => r.ing > 0).sort((a, b) => b.util - a.util).slice(0, 5), pb = problematico();
  const ch = (ico, tit, p, sub) => p ? `<div class="row" style="padding:8px 0"><span>${ic(ico, 18)} <span class="small muted">${tit}</span></span><b>${esc(typeof p === "string" ? p : nombreCorto(p))}${sub ? ` <span class="small muted">${sub}</span>` : ""}</b></div>` : "";
  let star = ""; if (hoyR) { const avg = avgDaily(hoyR.pid), vs = avg ? hoyR.uds / avg - 1 : null; star = `<div class="card" style="background:var(--marca-soft);border-color:transparent"><div class="small" style="font-weight:700;letter-spacing:.06em;color:var(--marca-d)">${ic("estrella", 14)} PRODUCTO ESTRELLA DE HOY</div><h3 style="margin:6px 0">${esc(hoyR.n)}</h3><div class="kpis k3" style="margin:0"><div class="kpi"><span>Vendidos</span><b>${hoyR.uds}</b></div><div class="kpi"><span>Ventas</span><b>${fmtK(hoyR.ing)}</b></div><div class="kpi"><span>Utilidad</span><b>${hoyR.sinCosto ? "–" : fmtK(hoyR.util)}</b></div></div>${vs != null && isFinite(vs) ? `<div class="small" style="margin-top:6px">${vs >= 0 ? "+" : ""}${Math.round(vs * 100)}% vs lo normal</div>` : ""}</div>`; }
  return star + (e ? `<div class="card"><h3>Productos destacados <span class="xs muted">(últimos 30 días)</span></h3>${ch("estrella", "Más vendido", e.masV ? e.masV.n : null, e.masV ? e.masV.uds + " uds" : "")}${ch("moneda", "Más rentable", e.masR ? e.masR.n : null, e.masR ? fmtK(e.masR.util) : "")}${ch("sube", "Mayor crecimiento", e.crec ? e.crec.p : null, e.crec ? "+" + Math.round((e.crec.t - 1) * 100) + "%" : "")}${ch("lento", "Baja rotación", e.lento ? e.lento.p : null, "")}${ch("alerta", "Riesgo de agotarse", e.riesgo ? (prod(e.riesgo.pid) || {nombre: ""}) : null, "")}</div>` : "")
    + (pb ? `<div class="card" style="border-color:var(--warn)"><div class="small" style="font-weight:700;color:var(--warn)">${ic("alerta", 14)} REVISAR · ${esc(pb.tag)}</div><p style="margin:6px 0 4px"><b>${esc(pb.txt)}</b></p>${pb.extra ? `<p class="small muted" style="margin:0">${esc(pb.extra)}</p>` : ""}</div>` : "")
    + (mes.length ? `<div class="card"><h3>¿Dónde estoy ganando?</h3>${tablaVista([{h: "Producto", f: r => esc(r.n)}, {h: "Ventas", n: 1, f: r => fmtK(r.ing)}, {h: "Utilidad", n: 1, f: r => r.sinCosto ? "–" : fmtK(r.util)}, {h: "Margen", n: 1, f: r => isFinite(r.margen) ? pct(r.margen) : "–"}], mes)}</div>` : "");
}
function bCaja() {
  const cajas = cajasAll().filter(c => c.fecha === S.today && c.apertura); if (!cajas.length) return `<div class="card"><h3>${ic("caja", 18)} Caja</h3><p class="muted" style="margin:0">Todavía no se ha abierto ninguna caja hoy.</p></div>`;
  const esp = sum(cajas, c => cajaCalc(c).esperado), cerr = cajas.filter(c => (c.cierres || []).length), dif = sum(cerr, c => c.cierres.slice(-1)[0].dif), abiertas = cajas.filter(c => cajaEstado(c) === "abierta").length, ult = cerr.map(c => c.cierres.slice(-1)[0]).sort((a, b) => b.t - a.t)[0];
  const ok = !cerr.length || Math.abs(dif) < 1;
  return `<div class="card"><h3>${ic("caja", 18)} Caja</h3><div class="row"><span>Efectivo que debería haber</span><b>${fmt(esp)}</b></div>${cerr.length ? `<div class="row"><span>Contado al cerrar</span><b>${fmt(sum(cerr, c => c.cierres.slice(-1)[0].contado))}</b></div><div class="row"><span>Diferencia</span><b style="color:${ok ? "inherit" : "var(--danger)"}">${fmt(dif)}</b></div>` : ""}
    <div style="margin-top:8px">${ok ? `<span class="pill ok">${ic("ok", 14)} ${cerr.length ? "CUADRA" : abiertas + " abierta" + (abiertas === 1 ? "" : "s")}</span>` : `<span class="pill bad">${ic("alerta", 14)} DIFERENCIA ${fmt(dif)}</span> <button class="btn ghost sm" data-act="ir" data-r="reportes">REVISAR</button>`}</div>
    ${ult ? `<div class="small muted" style="margin-top:8px">Último cierre: ${hora(ult.t)}${nombreDe(ult.uid) ? " · " + esc(nombreDe(ult.uid)) : ""}</div>` : ""}</div>`;
}
function bEquipo() {
  const eq = equipoAhora(); if (!eq.length) return ""; pedirNombres(eq.map(x => x.uid));
  return `<div class="card"><h3>${ic("equipo", 18)} Equipo y dispositivos</h3>${eq.map(x => { const d = x.d, on = d.online; return `<div class="row" style="align-items:flex-start;padding:10px 0"><span class="dot ${on ? "" : "off"}" style="margin-top:8px;${on ? "" : "background:var(--warn)"}"></span><div class="l" style="flex:1"><b>${esc(d.nombre)}</b>${nombreDe(x.uid) ? " · " + esc(nombreDe(x.uid)) : ""}<div class="small muted">${on ? "En línea · última señal " + haceTxt(d.vis) : "Sin conexión · última vez " + haceTxt(d.vis)}</div>${!on && d.ventasPend ? `<div class="small" style="color:var(--warn)">Ventas pendientes: ${d.ventasPend}</div>` : ""}</div><div style="text-align:right"><span class="pill ${x.caja === "abierta" ? "ok" : ""}">${x.caja === "abierta" ? "Caja abierta" : x.caja === "cerrada" ? "Caja cerrada" : "Sin abrir"}</span><div class="small muted" style="margin-top:4px">${x.n} ventas · ${fmtK(x.total)}</div></div></div>`; }).join("")}</div>`;
}
function bVentasHora() {
  const t = S.today, hs = new Array(24).fill(0); for (const v of ventasOk()) if (v.fecha === t) hs[horaDe(v.t)] += v.total;
  const fs = diasSimilares(6), ref = new Array(24).fill(0); for (const f of fs) for (const v of ventasOk().filter(x => x.fecha === f)) ref[horaDe(v.t)] += v.total / fs.length;
  const h0 = Math.min(...[...hs.keys()].filter(h => hs[h] > 0 || ref[h] > 0), 9), h1 = Math.max(...[...hs.keys()].filter(h => hs[h] > 0 || ref[h] > 0), new Date().getHours()), horas = []; for (let h = Math.min(h0, new Date().getHours()); h <= Math.max(h1, new Date().getHours()); h++) horas.push(h);
  const hNow = new Date().getHours(), por = porClave(t, t, v => v.m), tot = sum(por, x => x[1]);
  return `<div class="card"><h3>Ventas por hora <span class="xs muted">${fs.length >= 3 ? "· la línea punteada es un " + DOW[dowOf(t)] + " normal" : ""}</span></h3>${tot ? barras(horas.map(h => ({l: (h % 12 || 12) + (h < 12 ? "a" : "p"), v: hs[h], hi: h === hNow, tip: fHora(h) + "<br>" + fmt(hs[h]) + (fs.length >= 3 ? "<br>Normal: " + fmt(ref[h]) : "")})), {aria: "Ventas de hoy por hora"}) : '<p class="muted small">Cuando haya ventas, verás a qué hora se vende más.</p>'}
    ${tot ? `<h3 style="font-size:15px;margin-top:12px">Por forma de pago</h3>${hbarras(por.map(([m, v]) => ({n: m, v, txt: Math.round(v / tot * 100) + "% · " + fmtK(v)})))}` : ""}</div>`;
}
function bPerdidas() { const p = ventasPerdidas(); if (!p.n) return ""; return `<div class="card" style="border-color:var(--warn)"><h3>${ic("alerta", 18)} Ventas que puedes estar perdiendo</h3><p style="margin:0 0 6px"><b>${p.n}</b> ${p.n === 1 ? "vez" : "veces"} intentaron vender algo agotado hoy.</p>${p.rows.slice(0, 4).map(r => `<div class="row" style="padding:6px 0"><span>${esc(r.p.nombre)}</span><b>${r.n}</b></div>`).join("")}<p class="small" style="margin:8px 0 0">Ventas potenciales no atendidas (estimado): <b>${fmt(p.valor)}</b></p><p class="xs muted" style="margin:4px 0 0">Se cuenta cada vez que alguien toca un producto agotado en la caja.</p></div>`; }
function bDetecto() {
  const an = anomalias().filter(a => a.sev !== "bad").slice(0, 3); const ph = horasProx(), est = estimarCierre(), op = oportunidades(), av = avisos();
  return (an.length ? `<div class="card"><h3>${ic("buscar", 18)} OLI detectó</h3>${an.map(a => `<div class="row" style="align-items:flex-start"><div class="l"><b>${esc(a.t)}</b><div class="small muted">${esc(a.d)}</div></div><span class="pill warn">REVISAR</span></div>`).join("")}<p class="xs muted" style="margin:8px 0 0">Son señales para revisar, no acusaciones.</p></div>` : "")
    + (ph ? `<div class="card"><h3>🔮 Próximas horas</h3>${ph.map(x => `<div class="row"><span>${fHora(x.h)}–${fHora(x.h + 1)}</span><span class="pill ${x.nivel === "alta" ? "warn" : ""}">${x.nivel === "alta" ? "Demanda alta" : x.nivel === "baja" ? "Demanda baja" : x.nivel === "cerrado" ? "Normalmente sin ventas" : "Demanda moderada"}</span></div>`).join("")}${riesgoHoras()[0] ? `<p class="small" style="margin:8px 0 0">Riesgo: ${esc(riesgoHoras()[0].p.nombre)}</p>` : ""}${est.ok ? `<p class="small" style="margin:6px 0 0">Proyección de cierre: <b>${fmtK(est.lo)} – ${fmtK(est.hi)}</b></p>` : ""}<p class="xs muted" style="margin:6px 0 0">Basado en los últimos ${diasSimilares(8).length} ${DOW[dowOf(S.today)]}s.</p></div>` : "")
    + (op.length ? `<div class="card"><h3>💡 Oportunidades</h3>${op.map(o => `<div class="row" style="align-items:flex-start"><div class="l"><b>${esc(o.t)}</b><div class="small muted">${esc(o.d)}</div></div></div>`).join("")}<p class="xs muted" style="margin:8px 0 0">OLI solo recomienda. Tú decides.</p></div>` : "")
    + (av.length ? `<div class="card"><h3>OLI te avisa</h3>${av.map(a => `<p style="margin:0 0 8px">• ${esc(a)}</p>`).join("")}</div>` : "");
}
function bResumen() {
  const r = resumenDia(), c = cajasAll().filter(x => x.fecha === S.today && (x.cierres || []).length), e = estadoGeneral(), inv = alertas().filter(a => a.tipo === "inventario").length;
  return `<div class="full card"><h3>Resumen del día</h3><div class="kpis k3" style="margin-bottom:10px"><div class="kpi"><span>Ventas</span><b>${fmtK(r.f.ventas)}</b></div><div class="kpi"><span>Utilidad</span><b>${fmtK(r.f.utilidad)}</b></div><div class="kpi"><span>Productos vendidos</span><b>${r.uds}</b></div><div class="kpi"><span>Ticket</span><b>${fmtK(r.f.ticket)}</b></div><div class="kpi"><span>Caja</span><b>${c.length ? (Math.abs(r.dif) < 1 ? "✓" : fmtK(r.dif)) : "Abierta"}</b></div><div class="kpi"><span>Inventario</span><b>${inv ? inv + " críticos" : "✓"}</b></div></div>
    <div style="background:var(--marca-soft);border-radius:12px;padding:14px"><div class="small" style="font-weight:700;letter-spacing:.05em;color:var(--marca-d)">OLI TE RECOMIENDA</div><p style="margin:4px 0 0">${esc(resumenInteligente())}</p></div>
    <div class="btns" style="margin-top:10px"><button class="btn ghost sm" data-act="copiarResumen">${ic("copiar", 16)} Copiar resumen</button><button class="btn ghost sm" data-act="ir" data-r="reportes">${ic("descargar", 16)} Generar informe</button></div></div>`;
}
ACT.copiarResumen = async () => { const txt = resumenTexto(resumenDia()); try { await navigator.clipboard.writeText(txt); toast("Resumen copiado"); } catch (e) { abrir(() => head("Resumen") + `<textarea class="in" readonly style="min-height:220px">${esc(txt)}</textarea>`); } };
function bAcciones() {
  return `<div class="full"><div class="btns" style="gap:10px"><button class="btn pri" data-act="ir" data-r="vender">${ic("plus", 18)} Nueva venta</button><button class="btn ghost" data-act="nuevoProducto">${ic("plus", 18)} Producto</button><button class="btn ghost" data-act="nuevaCompra">${ic("compras", 18)} Compra</button><button class="btn ghost" data-act="nuevoGasto">${ic("finanzas", 18)} Gasto</button><button class="btn ghost" data-act="ir" data-r="caja">${ic("caja", 18)} Caja</button><button class="btn ghost" data-act="merma">${ic("merma", 18)} Pérdida</button><button class="btn ghost" data-act="ir" data-r="reportes">${ic("descargar", 18)} Informe</button></div></div>`;
}
const puestaEnMarcha = () => `<div class="card" style="border-color:var(--marca);border-width:2px"><h3 style="margin-top:0">${ic("paleta", 20)} Deja OLI lista en un minuto</h3><p class="muted" style="margin-top:-4px">Todavía no hay productos. Elige cómo empezar:</p>
  <div class="btns"><button class="btn pri xl" data-act="empezarOLI">${ic("paleta", 20)} Cargar el catálogo de OLI</button><button class="btn ghost xl" data-act="cargarDemo">${ic("analisis", 20)} Explorar con datos de demostración</button><button class="btn ghost" data-act="nuevoProducto">${ic("plus", 18)} Agregar un producto</button></div>
  <p class="xs muted" style="margin:10px 0 0">El catálogo trae las paletas, bebidas y precios de OLI. Los datos de demostración incluyen un mes de ventas de ejemplo y se pueden borrar en Ajustes.</p></div>`;
VIEWS.hoy = () => {
  if (!prods().length) return bEncabezado() + puestaEnMarcha();
  const comp = comandoModo() === "completa", cajaProblema = cajasAll().some(c => c.fecha >= addDays(S.today, -1) && (c.cierres || []).length && Math.abs(c.cierres.slice(-1)[0].dif) >= 1000), findeFuerte = [4, 5, 6].includes(dowOf(S.today)) && histInfo().ok;
  const partes = [bEncabezado(), bEstado(), bAtencion()];
  if (cajaProblema) partes.push(bCaja());
  partes.push(bDinero(), bHacer());
  if (comp) { if (findeFuerte) partes.push(bFinde()); partes.push(bAhora(), bInventario(), bCompra(), bPrepara()); if (!findeFuerte) partes.push(bFinde()); if (!cajaProblema) partes.push(bCaja()); partes.push(bEquipo(), bProductos(), bVentasHora(), bPerdidas(), bDetecto()); }
  else partes.push(bInventario(), cajaProblema ? "" : bCaja());
  partes.push(bResumen(), bAcciones());
  return `<div class="cc">${partes.join("")}</div>`;
};
/* actualiza horas relativas y el reloj sin volver a dibujar */
setInterval(() => { const r = $("#reloj"); if (r) r.textContent = hora(Date.now()); document.querySelectorAll("[data-ts]").forEach(e => { e.textContent = haceTxt(Number(e.dataset.ts)); }); }, 5000);
/* aviso en vivo cuando otro dispositivo registra una venta */
window.onNuevaVenta = (v, d) => { if (!esAdmin()) return; pedirNombres([v.uid || d.uid]); toast("Nueva venta: " + fmt(v.total) + " · " + v.m + (nombreDe(v.uid || d.uid) ? " · " + nombreDe(v.uid || d.uid) : "")); };
