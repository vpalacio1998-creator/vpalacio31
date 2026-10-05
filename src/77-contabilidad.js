/* ============ 77 · contabilidad y cumplimiento (administrador) ============
   OLI organiza y prepara la información. No afirma cumplimiento: cada obligación la define el administrador con su contador
   (APLICA / NO APLICA / POR VALIDAR) y su estado sale de lo configurado, nunca de "tener datos". Nada tributario está fijo en el código. */
S.conTab = "resumen"; S.cierreMes = null; S.exoSel = null;
const trib = () => configNeg().tributario || {};
// contabilidad SIEMPRE con todo el negocio (los filtros de Informes no aplican aquí: el contador necesita cifras completas)
const datosConta = () => memo("conta:" + rangoInf().join(), () => { const [a, b] = rangoInf(); return datosInforme(a, b, {}); });
async function guardarTrib(patch) { exigirAdmin(); await guardarConfig({tributario: Object.assign({}, trib(), patch)}); }
const prodsSinTrat = () => vendibles().filter(p => !p.combo && (!p.imp || !p.imp.t || p.imp.t === "validar"));
// capa de facturación electrónica desacoplada: la conexión real va en el servidor (credenciales del proveedor nunca en el navegador)
const FE = {
  conectado: () => trib().feEstado === "CONECTADO",
  estado: () => trib().proveedorFE ? (trib().feEstado || "NO CONECTADO") : "SIN PROVEEDOR",
  async emitir() { throw new Error("No hay un proveedor de facturación electrónica conectado. OLI no genera facturas ficticias."); }
};
const OBLIG = [
  {k: "fe", n: "Facturación electrónica de venta", g: "Depende de tu RUT y de si estás obligado a facturar electrónicamente. Valídalo con tu contador.", falta: t => [!t.proveedorFE && "Proveedor tecnológico", !t.resolucion && "Resolución de numeración", !t.prefijo && "Prefijo", !(t.rangoDesde && t.rangoHasta) && "Rango autorizado", !FE.conectado() && "Integración con el proveedor (no conectada)"].filter(Boolean)},
  {k: "num", n: "Numeración y resoluciones", g: "Prefijos, rangos y vigencia autorizados para tus documentos.", falta: t => [!t.resolucion && "Número de resolución", !t.resFecha && "Fecha de la resolución", !(t.rangoDesde && t.rangoHasta) && "Rango desde/hasta", !t.resVence && "Vigencia"].filter(Boolean)},
  {k: "pos", n: "Documento equivalente electrónico POS", g: "Para ventas de mostrador cuando corresponda según tu situación tributaria.", falta: t => [!t.proveedorFE && "Proveedor tecnológico", !FE.conectado() && "Integración con el proveedor (no conectada)"].filter(Boolean)},
  {k: "notas", n: "Notas crédito y débito", g: "Para corregir o anular documentos electrónicos ya emitidos.", falta: t => [!FE.conectado() && "Integración con el proveedor (no conectada)"].filter(Boolean)},
  {k: "soporte", n: "Documento soporte (compras a no obligados)", g: "Cuando compras a quien no está obligado a facturar. OLI guarda los datos; el documento lo genera quien defina tu contador.", falta: t => [!t.dsResponsable && "Quién genera el documento soporte"].filter(Boolean)},
  {k: "iva", n: "IVA", g: "Si eres responsable de IVA y qué tarifa tiene cada producto lo define tu contador. OLI no asume tarifas por el nombre del producto.", falta: () => { const n = prodsSinTrat().length; return n ? [n + " productos sin tratamiento tributario"] : []; }},
  {k: "inc", n: "Impuesto nacional al consumo", g: "Aplica solo a ciertas actividades. Valídalo con tu contador.", falta: () => { const n = prodsSinTrat().length; return n ? [n + " productos sin tratamiento tributario"] : []; }},
  {k: "ret", n: "Retenciones en la fuente", g: "Depende de tu calidad de agente retenedor. Las retenciones se registran en cada gasto.", falta: () => []},
  {k: "autoret", n: "Autorretenciones", g: "Solo para algunos contribuyentes. Valídalo con tu contador.", falta: () => []},
  {k: "ica", n: "Obligaciones municipales (ICA y otras)", g: "Dependen del municipio donde operas.", falta: t => [!t.municipio && "Municipio"].filter(Boolean)},
  {k: "exogena", n: "Información exógena", g: "Formatos y montos cambian por año gravable: se parametrizan en la pestaña Exógena.", falta: t => [!(configNeg().exogena || []).some(x => +x.anio === +(t.anio || S.today.slice(0, 4))) && "Formatos del año gravable"].filter(Boolean)},
  {k: "nomina", n: "Nómina electrónica", g: "Depende de si tienes trabajadores y usas la nómina como soporte de costos. OLI registra los pagos como gastos (categoría Nómina).", falta: t => [!t.proveedorNomina && "Proveedor de nómina electrónica"].filter(Boolean)}
];
function estadoOblig(o) {
  const c = (trib().oblig || {})[o.k] || {};
  if (c.aplica === "NO APLICA") return "NO APLICA"; if (!c.aplica || c.aplica === "POR VALIDAR") return "REQUIERE CONTADOR";
  return o.falta(trib()).length ? "PENDIENTE" : c.validado ? "VALIDADO" : "CONFIGURADO";
}
const tagEstado = e => `<span class="estado-tag ${({"NO APLICA": "NOAPLICA", "REQUIERE CONTADOR": "REQUIERE"})[e] || e}">${esc(e)}</span>`;
const icoEstado = e => e === "VALIDADO" || e === "CONFIGURADO" ? `<span style="color:var(--ok)">${ic("ok", 20)}</span>` : e === "NO APLICA" ? `<span style="color:var(--muted)">${ic("x", 20)}</span>` : `<span style="color:var(--warn)">${ic("alerta", 20)}</span>`;
const TABS_CON = [["resumen", "Resumen"], ["cumplimiento", "Cumplimiento"], ["facturacion", "Facturación"], ["soporte", "Doc. soporte"], ["exogena", "Exógena"], ["conciliacion", "Conciliación"], ["auditoria", "Auditoría"], ["cierre", "Cierre de mes"]];

/* ---------- resumen ---------- */
function conResumen() {
  const [a, b] = rangoInf(), d = datosConta(), rc = resumenContable(d);
  const traz = {"Ingresos netos": "ventas", "Compras recibidas": "compras", "Gastos": "gastos", "Caja (efectivo esperado / contado)": "caja", "Inventarios (a costo actual)": "inventario", "Costo de ventas": "costo"};
  return `<div class="card"><h3>Periodo</h3><div class="seg">${RANGOS_INF.map(([k, l]) => `<button data-act="rangoInf" data-v="${k}" aria-pressed="${S.inf.rango === k}">${l}</button>`).join("")}</div><p class="small muted" style="margin:8px 0 0">${periodoDoc(a, b)}</p></div>` + avisoIntegridad(d) +
    (d.pend.length ? `<div class="card" style="border-color:var(--warn)"><h3>${ic("alerta", 18)} Información pendiente</h3>${d.pend.map(p => `<div class="row" style="padding:8px 0"><span>${esc(p)}</span></div>`).join("")}<p class="xs muted" style="margin:6px 0 0">Completarla antes de enviar el paquete le ahorra trabajo a tu contador.</p></div>` : `<div class="notice">Sin información pendiente para el contador.</div>`) +
    `<div class="card"><h3>Resumen contable</h3>${rc.map(r => `<div class="row" style="align-items:flex-start;padding:9px 0"><div class="l" style="flex:1"><span>${esc(r[0])}</span>${r[2] ? `<div class="xs muted">${esc(r[2])}</div>` : ""}</div><div style="text-align:right"><b>${esc(r[1])}</b>${traz[r[0]] ? `<div><button class="btn ghost sm" style="min-height:30px;padding:2px 8px;margin-top:4px" data-act="traza" data-v="${traz[r[0]]}">¿De dónde sale?</button></div>` : ""}</div></div>`).join("")}</div>
    <div class="btns">${BOTON_INF("zip", "GENERAR PAQUETE PARA CONTADOR")}${BOTON_INF("contador", "Resumen contable (PDF)", "ghost")}</div><p class="xs muted" style="margin-top:12px">${esc(AVISO_TRIB)}</p>`;
}
/* trazabilidad: del total al detalle */
ACT.traza = (el, x) => {
  const [a, b] = rangoInf(), d = datosConta(), t = x.v;
  abrir(() => {
    let h = "";
    if (t === "compras") { const r = d.compras.filter(c => c.estado === "Recibida"), fac = uniq(r.map(c => c.id)), prov = uniq(r.map(c => c.proveedor)), sop = uniq(r.filter(c => c.soporte).map(c => c.id)), movs = movimientosInv(null).filter(m => m.tipo === "compra" && m.fecha >= a && m.fecha <= b);
      h = `<p><b>${fmt(sum(r, c => c.total))}</b> de compras → <b>${fac.length}</b> compras · <b>${prov.length}</b> proveedores · <b>${sop.length}</b> con soporte · <b>${movs.length}</b> movimientos de inventario</p>` + tablaVista([{h: "Fecha", f: c => fCorta(c.fecha)}, {h: "Proveedor", f: c => esc(c.proveedor || "Sin proveedor")}, {h: "Factura", f: c => esc(c.factura || "—")}, {h: "Producto", f: c => esc(c.producto)}, {h: "Total", n: 1, f: c => fmt(c.total)}, {h: "Soporte", f: c => c.soporte ? esc(c.tipoSoporte || "Sí") : '<span class="pill warn">Falta</span>'}], r); }
    else if (t === "ventas" || t === "costo") { const dd = d.dias.filter(x => x.n); h = `<p><b>${fmt(t === "costo" ? d.costo : d.tot)}</b> → <b>${d.n}</b> ventas en <b>${dd.length}</b> días · ${d.cajasV.length} cajas${t === "costo" && d.sinCosto ? ` · <span class="pill warn">${d.sinCosto} líneas sin costo</span>` : ""}</p>` + tablaVista([{h: "Día", f: x => diaCorto(x.fecha)}, {h: "Ventas", n: 1, f: x => x.n}, {h: "Total", n: 1, f: x => fmt(x.ventas)}, {h: "Costo", n: 1, f: x => fmt(x.costo)}], dd) + tablaVista([{h: "Caja", f: x => esc(x.n)}, {h: "Total", n: 1, f: x => fmt(x.v)}], d.cajasV); }
    else if (t === "gastos") { h = `<p><b>${fmt(sum(d.gastos, g => g.total))}</b> → <b>${d.gastos.length}</b> gastos · <b>${d.gastos.filter(g => !g.soporte).length}</b> sin soporte</p>` + tablaVista([{h: "Fecha", f: g => fCorta(g.fecha)}, {h: "Categoría", f: g => esc(g.categoria)}, {h: "Descripción", f: g => esc(g.descripcion)}, {h: "Total", n: 1, f: g => fmt(g.total)}, {h: "Soporte", f: g => g.soporte ? esc(g.soporte) : '<span class="pill warn">Falta</span>'}], d.gastos); }
    else if (t === "caja") { h = tablaVista([{h: "Fecha", f: c => fCorta(c.fecha)}, {h: "Caja", f: c => esc(c.caja)}, {h: "Esperado", n: 1, f: c => c.esperado == null ? "Abierta" : fmt(c.esperado)}, {h: "Contado", n: 1, f: c => c.contado == null ? "–" : fmt(c.contado)}, {h: "Dif.", n: 1, f: c => c.diferencia == null ? "–" : `<b style="color:${c.diferencia ? "var(--danger)" : "inherit"}">${fmt(c.diferencia)}</b>`}], d.cajas); }
    else if (t === "inventario") { h = tablaVista([{h: "Producto", f: r => esc(r.producto)}, {h: "Inicial", n: 1, f: r => vx(r.inicial)}, {h: "Entradas", n: 1, f: r => fmtN(r.entradas, 2)}, {h: "Salidas", n: 1, f: r => fmtN(r.salidas, 2)}, {h: "Ajustes", n: 1, f: r => fmtN(r.ajustes, 2)}, {h: "Final", n: 1, f: r => vx(r.final)}], d.inv.filter(r => r.entradas || r.salidas || r.ajustes)); }
    return head("¿De dónde sale este dato?") + `<p class="small muted" style="margin-top:0">${periodoDoc(a, b)}</p>` + h;
  }, {wide: true});
};

/* ---------- cumplimiento ---------- */
function conCumplimiento() {
  const t = trib(), est = OBLIG.map(o => ({o, e: estadoOblig(o), c: (t.oblig || {})[o.k] || {}})), cuenta = k => est.filter(x => x.e === k).length;
  return `<div class="notice">${esc(AVISO_TRIB)}</div>
    <div class="card"><h3>Perfil tributario</h3>${[["País", t.pais || "Colombia"], ["Año gravable", t.anio || S.today.slice(0, 4)], ["Tipo de contribuyente", t.tipoContribuyente || "Por definir"], ["Régimen", t.regimen || "Por definir"], ["Responsabilidades del RUT", t.responsabilidades || "Por definir"], ["Municipio", t.municipio || "Por definir"]].map(([l, v]) => `<div class="row"><span>${l}</span><b>${esc(v)}</b></div>`).join("")}
      <button class="btn ghost sm" style="margin-top:8px" data-act="editPerfilTrib">Editar perfil</button></div>
    <div class="kpis">${[["Configurado o validado", cuenta("CONFIGURADO") + cuenta("VALIDADO")], ["Pendiente", cuenta("PENDIENTE")], ["Requiere contador", cuenta("REQUIERE CONTADOR")], ["No aplica", cuenta("NO APLICA")]].map(([l, v]) => `<div class="kpi"><span>${l}</span><b>${v}</b></div>`).join("")}</div>
    <div class="card"><h3>Centro de cumplimiento</h3><p class="small muted" style="margin-top:-4px">Nada se marca como cumplido solo porque OLI tenga datos. Tú y tu contador definen si cada obligación aplica.</p>
      ${est.map(({o, e, c}) => { const fl = o.falta(t); return `<div class="oblig"><div style="display:flex;gap:10px;align-items:flex-start">${icoEstado(e)}<div><b>${esc(o.n)}</b><div class="xs muted" style="margin-top:2px">${c.aplica ? esc(c.aplica) : "POR VALIDAR"}${c.validado && c.validadoT ? " · validado " + diaCorto(ymd(new Date(c.validadoT))) : ""}</div>
        <details style="margin-top:4px"><summary class="xs" style="font-weight:700;cursor:pointer;color:var(--marca-d)">¿Por qué?</summary><div class="small" style="margin-top:4px">${esc(c.porque || o.g)}${e === "PENDIENTE" && fl.length ? `<div class="xs" style="margin-top:4px;color:var(--warn)">Falta: ${esc(fl.join(" · "))}</div>` : ""}${c.nota ? `<div class="xs muted" style="margin-top:4px">Nota: ${esc(c.nota)}</div>` : ""}</div></details></div></div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">${tagEstado(e)}<button class="btn ghost sm" style="min-height:32px" data-act="editOblig" data-k="${o.k}">Definir</button></div></div>`; }).join("")}
    </div>
    <div class="card"><h3>Nómina</h3><p class="small" style="margin:0">OLI no liquida nómina en esta versión. Los pagos a trabajadores se registran como gastos en la categoría “Nómina” (${fmt(sum(Object.values(col("gastos")).filter(g => /n[oó]mina/i.test(g.cat || "")), g => g.valor || 0))} registrados) para que tu contador los use. La nómina electrónica se emite con un proveedor autorizado.</p></div>`;
}
ACT.editPerfilTrib = () => { const t = trib(); abrir(() => head("Perfil tributario") + `<p class="small muted" style="margin-top:0">Copia estos datos de tu RUT o pídeselos a tu contador. OLI no los deduce.</p>
  <div class="split"><div><label class="f" for="pt-pais">País</label><input class="in plain" id="pt-pais" value="${esc(t.pais || "Colombia")}"></div><div><label class="f" for="pt-anio">Año gravable</label><input class="in plain" id="pt-anio" inputmode="numeric" value="${esc(t.anio || S.today.slice(0, 4))}"></div></div>
  <label class="f">Tipo de contribuyente</label>${sel("pt-tipo", ["Persona natural", "Persona jurídica", "Por definir"], t.tipoContribuyente || "Por definir")}
  <label class="f" for="pt-reg">Régimen</label><input class="in plain" id="pt-reg" value="${esc(t.regimen || "")}" placeholder="Ej: como aparece en tu RUT">
  <label class="f" for="pt-resp">Responsabilidades del RUT (códigos)</label><input class="in plain" id="pt-resp" value="${esc(t.responsabilidades || "")}" placeholder="Ej: los códigos de la casilla 53">
  <label class="f" for="pt-mun">Municipio</label><input class="in plain" id="pt-mun" value="${esc(t.municipio || "")}">
  <button class="btn pri xl wide" style="margin-top:14px" data-act="doPerfilTrib">GUARDAR</button>`); };
ACT.doPerfilTrib = async () => { await guardar(async () => { await guardarTrib({pais: $("#pt-pais").value.trim() || "Colombia", anio: num($("#pt-anio").value) || +S.today.slice(0, 4), tipoContribuyente: selVal("pt-tipo"), regimen: $("#pt-reg").value.trim(), responsabilidades: $("#pt-resp").value.trim(), municipio: $("#pt-mun").value.trim()}); cerrar(); }, "Perfil guardado"); };
ACT.editOblig = (el, x) => { const o = OBLIG.find(y => y.k === x.k), c = (trib().oblig || {})[o.k] || {};
  abrir(() => head(o.n) + `<p class="small muted" style="margin-top:0">${esc(o.g)}</p><label class="f">¿Aplica a tu negocio?</label>${sel("ob-ap", ["APLICA", "NO APLICA", "POR VALIDAR"], c.aplica || "POR VALIDAR")}
    <label class="f" for="ob-pq">¿Por qué? (lo que dijo tu contador)</label><textarea class="in plain" id="ob-pq" rows="3" style="min-height:84px">${esc(c.porque || "")}</textarea>
    <label class="check" style="margin-top:10px"><input type="checkbox" id="ob-val" ${c.validado ? "checked" : ""}> Mi contador validó esta obligación</label>
    <label class="f" for="ob-nota">Nota (opcional)</label><input class="in plain" id="ob-nota" value="${esc(c.nota || "")}">
    <button class="btn pri xl wide" style="margin-top:14px" data-act="doOblig" data-k="${o.k}">GUARDAR</button>`); };
ACT.doOblig = async (el, x) => { const ob = Object.assign({}, trib().oblig || {}), prev = ob[x.k] || {}, val = $("#ob-val").checked;
  ob[x.k] = {aplica: selVal("ob-ap") || "POR VALIDAR", porque: $("#ob-pq").value.trim(), validado: val, validadoT: val ? (prev.validadoT || Date.now()) : null, nota: $("#ob-nota").value.trim(), uid: uidActual(), t: Date.now()};
  await guardar(async () => { await guardarTrib({oblig: ob}); audit("CUMPLIMIENTO", x.k, ob[x.k].aplica + (val ? " · validado" : "")); cerrar(); }, "Guardado"); };

/* ---------- facturación electrónica (preparada, sin proveedor conectado) ---------- */
function conFacturacion() {
  const t = trib(), [a, b] = rangoInf(), pidieron = ventasOk().filter(v => v.fecha >= a && v.fecha <= b && v.cliente), docs = Object.values(col("docelec")), docDe = id => docs.find(x => x.ventaId === id);
  return `<div class="card" style="border-color:${FE.conectado() ? "var(--marca)" : "var(--warn)"}"><h3>Proveedor tecnológico</h3><div class="row"><span>Estado</span>${tagEstado(FE.conectado() ? "CONFIGURADO" : "PENDIENTE")}</div><div class="row"><span>Proveedor</span><b>${esc(t.proveedorFE || "Sin definir")}</b></div><div class="row"><span>Integración</span><b>${esc(FE.estado())}</b></div>
      <p class="small" style="margin:10px 0 0">OLI tiene lista la capa para conectarse a un proveedor tecnológico autorizado (factura electrónica, notas crédito y débito, documento equivalente POS, respuesta de validación, CUFE, QR, prefijos y resoluciones). <b>Mientras no haya un proveedor conectado, OLI no emite documentos electrónicos ni crea facturas ficticias.</b></p>
      <button class="btn ghost sm" style="margin-top:10px" data-act="editFE">Datos de facturación y numeración</button></div>
    <div class="card"><h3>Documentos contemplados</h3>${tablaVista([{h: "Documento", f: r => r}, {h: "Estado", f: () => FE.conectado() ? "Listo para emitir" : '<span class="pill warn">Requiere proveedor conectado</span>'}], ["Factura electrónica de venta", "Nota crédito", "Nota débito", "Documento equivalente electrónico POS"])}
      <div class="row"><span>Numeración</span><b>${t.prefijo || t.resolucion ? esc((t.prefijo || "") + " · Res. " + (t.resolucion || "—") + " · " + (t.rangoDesde || "?") + " a " + (t.rangoHasta || "?") + (t.resVence ? " · vence " + fCorta(t.resVence) : "")) : "Sin configurar"}</b></div></div>
    <div class="card"><h3>Ventas en las que el cliente pidió factura</h3><p class="small muted" style="margin-top:-4px">${periodoDoc(a, b)}. Si la factura se emitió en el portal de tu proveedor, registra aquí el número o CUFE para que quede la trazabilidad.</p>
      ${pidieron.length ? tablaVista([{h: "Venta", f: v => esc(v.num)}, {h: "Fecha", f: v => fCorta(v.fecha)}, {h: "Cliente", f: v => esc((v.cliente && (v.cliente.nombre || v.cliente.doc)) || "")}, {h: "Total", n: 1, f: v => fmt(v.total)}, {h: "Documento", f: v => { const dd = docDe(v.id); return dd ? `<span class="pill ok">${esc(dd.numero || dd.cufe || "Registrado")}</span>` : `<button class="btn ghost sm" style="min-height:30px" data-act="regDoc" data-id="${esc(v.id)}">Registrar emisión</button>`; }}], pidieron) : '<p class="muted" style="margin:0">Ningún cliente pidió factura en este periodo.</p>'}</div>`;
}
ACT.editFE = () => { const t = trib(); abrir(() => head("Facturación y numeración") + `<p class="small muted" style="margin-top:0">Datos de tu proveedor y de la resolución de numeración. Las credenciales del proveedor nunca se guardan en este equipo: la conexión se hace desde el servidor.</p>
  <label class="f" for="fe-p">Proveedor tecnológico</label><input class="in plain" id="fe-p" value="${esc(t.proveedorFE || "")}" placeholder="Nombre del proveedor">
  <label class="f">Ambiente</label>${sel("fe-amb", ["Pruebas", "Producción"], t.feAmbiente || "Pruebas")}
  <div class="split"><div><label class="f" for="fe-pre">Prefijo</label><input class="in plain" id="fe-pre" value="${esc(t.prefijo || "")}"></div><div><label class="f" for="fe-res">N.º resolución</label><input class="in plain" id="fe-res" value="${esc(t.resolucion || "")}"></div></div>
  <div class="split"><div><label class="f" for="fe-rf">Fecha resolución</label><input class="in" type="date" id="fe-rf" value="${esc(t.resFecha || "")}"></div><div><label class="f" for="fe-rv">Vigencia hasta</label><input class="in" type="date" id="fe-rv" value="${esc(t.resVence || "")}"></div></div>
  <div class="split"><div><label class="f" for="fe-d">Rango desde</label><input class="in plain" id="fe-d" inputmode="numeric" value="${esc(t.rangoDesde || "")}"></div><div><label class="f" for="fe-h">Rango hasta</label><input class="in plain" id="fe-h" inputmode="numeric" value="${esc(t.rangoHasta || "")}"></div></div>
  <label class="f" for="fe-anx">Versión del anexo técnico</label><input class="in plain" id="fe-anx" value="${esc(t.anexoVersion || "")}" placeholder="La que indique tu proveedor">
  <label class="f">Documento soporte: ¿quién lo genera?</label>${sel("fe-ds", ["El contador", "El proveedor tecnológico", "Por definir"], t.dsResponsable || "Por definir")}
  <label class="f" for="fe-nom">Proveedor de nómina electrónica (si aplica)</label><input class="in plain" id="fe-nom" value="${esc(t.proveedorNomina || "")}">
  <button class="btn pri xl wide" style="margin-top:14px" data-act="doFE">GUARDAR</button>`); };
ACT.doFE = async () => { const ds = selVal("fe-ds"); await guardar(async () => { await guardarTrib({proveedorFE: $("#fe-p").value.trim(), feAmbiente: selVal("fe-amb"), prefijo: $("#fe-pre").value.trim(), resolucion: $("#fe-res").value.trim(), resFecha: $("#fe-rf").value, resVence: $("#fe-rv").value, rangoDesde: $("#fe-d").value.trim(), rangoHasta: $("#fe-h").value.trim(), anexoVersion: $("#fe-anx").value.trim(), dsResponsable: ds === "Por definir" ? "" : ds, proveedorNomina: $("#fe-nom").value.trim()}); cerrar(); }, "Guardado"); };
ACT.regDoc = (el, x) => { const v = ventasAll().find(y => y.id === x.id); abrir(() => head("Registrar emisión") + `<p class="small muted" style="margin-top:0">Venta ${esc(v.num)} · ${fmt(v.total)}. Solo registra documentos que ya emitiste en el portal de tu proveedor.</p>
  <label class="f">Tipo</label>${sel("rd-t", ["Factura electrónica de venta", "Documento equivalente POS"], "Factura electrónica de venta")}<label class="f" for="rd-n">Número (prefijo y consecutivo)</label><input class="in plain" id="rd-n"><label class="f" for="rd-c">CUFE / CUDE (opcional)</label><input class="in plain" id="rd-c">
  <button class="btn pri xl wide" style="margin-top:14px" data-act="doRegDoc" data-id="${esc(v.id)}">GUARDAR</button>`); };
ACT.doRegDoc = async (el, x) => { const v = ventasAll().find(y => y.id === x.id), n = $("#rd-n").value.trim(); if (!n) { toast("Escribe el número del documento.", true); return; }
  await guardar(async () => { exigirAdmin(); const id = "de" + newId(); await put("docelec", id, {ventaId: v.id, fecha: v.fecha, total: v.total, tipo: selVal("rd-t"), numero: n, cufe: $("#rd-c").value.trim(), estado: "registrado", origen: "manual", t: Date.now(), uid: uidActual()}); audit("DOC_ELECTRONICO", v.id, n); cerrar(); }, "Documento registrado"); };

/* ---------- documento soporte ---------- */
const EST_DS = ["PENDIENTE DE GENERAR", "GENERADO POR EL CONTADOR", "TRANSMITIDO (referencia)"];
function conSoporte() {
  const [a, b] = rangoInf(), cs = Object.entries(col("compras")).map(([id, c]) => Object.assign({id}, c)).filter(c => c.estado === "recibido" && c.fecha >= a && c.fecha <= b && (!c.soporte || ["Documento soporte", "Sin soporte", ""].includes(c.soporte.tipo || "") || !c.factura));
  return `<div class="notice">Para compras a proveedores no obligados a facturar. OLI guarda la información que necesita tu contador (proveedor, NIT, fecha, descripción, valor, impuestos, numeración y soporte). <b>Guardar la compra no significa que el documento soporte ya exista.</b></div>
    <div class="card"><h3>Compras que pueden requerir documento soporte</h3><p class="small muted" style="margin-top:-4px">${periodoDoc(a, b)}</p>
    ${cs.length ? cs.map(c => { const tot = sum(c.lineas || [], l => (l.costo || 0) * (l.q || 0)), s = c.soporte || {}; return `<div class="row" style="align-items:flex-start;padding:10px 0"><div class="l" style="flex:1"><b>${esc(c.proveedor || "Sin proveedor")}</b>${c.nit ? "" : ' <span class="pill warn">Falta NIT</span>'}<div class="small muted">${fCorta(c.fecha)} · ${esc((c.lineas || []).map(l => (prod(l.pid) || {nombre: l.n || ""}).nombre).join(", "))}</div><div class="xs muted">${s.num ? "N.º " + esc(s.num) + " · " : ""}${esc(s.estado || "PENDIENTE DE GENERAR")}${s.ref ? " · " + esc(s.ref) : ""}</div></div><div style="text-align:right"><b>${fmt(tot)}</b><div><button class="btn ghost sm" style="min-height:30px;margin-top:4px" data-act="editDS" data-id="${esc(c.id)}">Completar</button></div></div></div>`; }).join("") : '<p class="muted" style="margin:0">No hay compras sin factura en este periodo.</p>'}</div>`;
}
ACT.editDS = (el, x) => { const c = col("compras")[x.id], s = c.soporte || {}; abrir(() => head("Documento soporte") + `<p class="small muted" style="margin-top:0">${esc(c.proveedor || "Sin proveedor")} · ${fCorta(c.fecha)}</p>
  <label class="f" for="ds-nit">NIT o documento del proveedor</label><input class="in plain" id="ds-nit" value="${esc(c.nit || "")}"><label class="f" for="ds-num">Numeración del documento soporte</label><input class="in plain" id="ds-num" value="${esc(s.num || "")}" placeholder="La asigna quien lo genera">
  <label class="f" for="ds-ref">Soporte (enlace, número o código)</label><input class="in plain" id="ds-ref" value="${esc(s.ref || "")}" placeholder="Ej: enlace al PDF o CUDS">
  <label class="f">Estado</label>${sel("ds-est", EST_DS, s.estado || EST_DS[0])}
  <button class="btn pri xl wide" style="margin-top:14px" data-act="doDS" data-id="${esc(x.id)}">GUARDAR</button>`); };
ACT.doDS = async (el, x) => { const c = col("compras")[x.id]; await guardar(async () => { await actualizarCompra(x.id, {nit: $("#ds-nit").value.trim(), soporte: Object.assign({}, c.soporte || {}, {tipo: "Documento soporte", num: $("#ds-num").value.trim(), ref: $("#ds-ref").value.trim(), estado: selVal("ds-est")})}); audit("DOC_SOPORTE", x.id, selVal("ds-est")); cerrar(); }, "Guardado"); };

/* ---------- información exógena (parametrizable por año, formato, versión y tipo de obligado) ---------- */
const CAMPOS_EXO = [["nombre", "Nombre / razón social"], ["nit", "NIT / identificación"], ["tipo", "Tipo de tercero"], ["compras", "Valor de operaciones (base)"], ["iva", "IVA"], ["retencion", "Retención"], ["registros", "Número de registros"]];
const exoList = () => configNeg().exogena || [];
function filasExo(f) { const a = f.anio + "-01-01", b = f.anio + "-12-31"; return filasTerceros(a, b).filter(t => (t.compras || 0) >= (f.umbral || 0)); }
function conExogena() {
  const L = exoList(), s = L.find(x => x.id === S.exoSel) || L[0];
  return `<div class="notice">OLI no trae formatos fijos de exógena: cambian por año gravable. Tu contador define formato, versión, tipo de obligado, campos y montos; se pueden actualizar sin reinstalar OLI.</div>
    <div class="card"><h3>Formatos configurados</h3>${L.length ? L.map(f => `<div class="row" style="padding:10px 0"><div class="l" style="flex:1"><b>Formato ${esc(f.formato)} · v${esc(f.version || "?")}</b><div class="small muted">Año ${esc(f.anio)} · ${esc(f.tipo || "Tipo de obligado por definir")} · desde ${fmt(f.umbral || 0)}</div></div><div class="btns"><button class="btn ghost sm" data-act="exoVer" data-id="${esc(f.id)}" aria-pressed="${s && s.id === f.id}">Ver</button><button class="btn ghost sm" data-act="exoEdit" data-id="${esc(f.id)}">Editar</button></div></div>`).join("") : '<p class="muted" style="margin:0 0 8px">Todavía no hay formatos configurados.</p>'}<button class="btn pri" style="margin-top:8px" data-act="exoEdit" data-id="">${ic("plus", 18)} Agregar formato</button></div>
    ${s ? (() => { const rows = filasExo(s); return `<div class="card"><h3>Vista previa · formato ${esc(s.formato)} (${esc(s.anio)})</h3><p class="small muted" style="margin-top:-4px">${rows.length} terceros · ${rows.filter(r => !r.completo).length} sin identificación completa</p>${rows.length ? tablaVista(s.campos.map(k => ({h: (CAMPOS_EXO.find(c => c[0] === k) || [k, k])[1], n: ["compras", "iva", "retencion", "registros"].includes(k) ? 1 : 0, f: r => ["compras", "iva", "retencion"].includes(k) ? fmt(r[k]) : r[k] == null || r[k] === "" ? '<span class="pill warn">Falta</span>' : esc(r[k])})), rows.slice(0, 50)) : '<p class="muted">Sin terceros que superen el monto mínimo.</p>'}<button class="btn ghost" style="margin-top:8px" data-act="exoExcel" data-id="${esc(s.id)}">${ic("descargar", 18)} Descargar Excel del formato</button></div>`; })() : ""}`;
}
ACT.exoVer = (el, x) => { S.exoSel = x.id; draw(); };
ACT.exoEdit = (el, x) => { const f = exoList().find(y => y.id === x.id) || {anio: S.today.slice(0, 4), campos: ["nombre", "nit", "compras", "iva", "retencion"], umbral: 0};
  abrir(() => head(x.id ? "Editar formato" : "Nuevo formato") + `<div class="split"><div><label class="f" for="ex-a">Año gravable</label><input class="in plain" id="ex-a" inputmode="numeric" value="${esc(f.anio)}"></div><div><label class="f" for="ex-f">Formato (código)</label><input class="in plain" id="ex-f" value="${esc(f.formato || "")}"></div></div>
    <div class="split"><div><label class="f" for="ex-v">Versión</label><input class="in plain" id="ex-v" value="${esc(f.version || "")}"></div><div><label class="f" for="ex-u">Monto mínimo por tercero</label><input class="in money" id="ex-u" inputmode="numeric" value="${f.umbral ? fmt(f.umbral) : ""}" placeholder="$0"></div></div>
    <label class="f" for="ex-t">Tipo de obligado</label><input class="in plain" id="ex-t" value="${esc(f.tipo || "")}" placeholder="Según la resolución del año">
    <label class="f">Campos a exportar</label>${CAMPOS_EXO.map(([k, l]) => `<label class="check"><input type="checkbox" data-exc="${k}" ${f.campos.includes(k) ? "checked" : ""}> ${l}</label>`).join("")}
    <button class="btn pri xl wide" style="margin-top:14px" data-act="doExo" data-id="${esc(x.id || "")}">GUARDAR</button>${x.id ? `<button class="btn ghost wide" style="margin-top:8px" data-act="borrarExo" data-id="${esc(x.id)}">Eliminar formato</button>` : ""}`); };
ACT.doExo = async (el, x) => { const campos = [...document.querySelectorAll("#panel [data-exc]")].filter(i => i.checked).map(i => i.dataset.exc), fm = $("#ex-f").value.trim(); if (!fm) { toast("Escribe el código del formato.", true); return; } if (!campos.length) { toast("Elige al menos un campo.", true); return; }
  const f = {id: x.id || "ex" + newId(), anio: num($("#ex-a").value) || +S.today.slice(0, 4), formato: fm, version: $("#ex-v").value.trim(), umbral: num($("#ex-u").value), tipo: $("#ex-t").value.trim(), campos};
  await guardar(async () => { await guardarConfig({exogena: exoList().filter(y => y.id !== f.id).concat([f])}); S.exoSel = f.id; cerrar(); }, "Formato guardado"); };
ACT.borrarExo = async (el, x) => { if (await confirmar({titulo: "¿Eliminar el formato?", texto: "Solo se borra la configuración, no los datos.", si: "Sí, eliminar", no: "No", peligro: true})) await guardar(async () => { await guardarConfig({exogena: exoList().filter(y => y.id !== x.id)}); S.exoSel = null; cerrar(); }, "Eliminado"); };
ACT.exoExcel = async (el, x) => { const f = exoList().find(y => y.id === x.id); if (!f) return;
  await guardar(async () => { exigirAdmin(); await lib("ExcelJS"); const wb = nuevoLibro(), ctx = {a: f.anio + "-01-01", b: f.anio + "-12-31", F: {}}, money = ["compras", "iva", "retencion"];
    hojaTabla(wb, "Formato " + f.formato, "Información exógena · formato " + f.formato + (f.version ? " v" + f.version : ""), f.campos.map(k => ({h: (CAMPOS_EXO.find(c => c[0] === k) || [k, k])[1], k, t: money.includes(k) ? "money" : k === "registros" ? "int" : "text", tot: money.includes(k) ? 1 : 0})), filasExo(f), ctx, {notas: ["Parámetros definidos por el usuario: año " + f.anio + ", tipo de obligado " + (f.tipo || "por definir") + ", monto mínimo " + fmt(f.umbral || 0) + ".", AVISO_TRIB]});
    await guardarArchivo("OLI_Exogena_" + f.formato + "_" + f.anio + ".xlsx", await xlsxBlob(wb)); }); };

/* ---------- conciliación y auditoría ---------- */
const TRAZA_CONC = ["ventas", "caja", "compras", "inventario", "ventas"];
function conConciliacion() {
  const [a, b] = rangoInf(), d = datosConta();
  return `<div class="card"><h3>Periodo</h3><div class="seg">${RANGOS_INF.map(([k, l]) => `<button data-act="rangoInf" data-v="${k}" aria-pressed="${S.inf.rango === k}">${l}</button>`).join("")}</div><p class="small muted" style="margin:8px 0 0">${periodoDoc(a, b)}</p></div>
    ${d.conc.map((c, i) => `<div class="card"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><h3 style="margin:0">${esc(c.n)}</h3>${c.y == null ? tagEstado("REQUIERE CONTADOR") : c.ok ? '<span class="pill ok">OK</span>' : '<span class="pill warn">' + ic("alerta", 14) + " REVISAR</span>"}</div>
      <div class="row"><span>${esc(c.nx)}</span><b>${fmt(c.x)}</b></div><div class="row"><span>${esc(c.ny)}</span><b>${c.y == null ? "No disponible" : fmt(c.y)}</b></div>${c.dif != null ? `<div class="row"><span>Diferencia</span><b style="color:${c.ok ? "inherit" : "var(--warn)"}">${fmt(c.dif)}</b></div>` : ""}${c.nota ? `<p class="xs muted" style="margin:6px 0 0">${esc(c.nota)}</p>` : ""}
      <button class="btn ghost sm" style="margin-top:8px" data-act="traza" data-v="${TRAZA_CONC[i]}">¿De dónde sale?</button></div>`).join("")}`;
}
function conAuditoria() {
  const [a, b] = rangoInf(), d = datosConta(), cnt = k => d.riesgos.filter(r => r.riesgo === k).length;
  return `<div class="card"><h3>Periodo</h3><div class="seg">${RANGOS_INF.map(([k, l]) => `<button data-act="rangoInf" data-v="${k}" aria-pressed="${S.inf.rango === k}">${l}</button>`).join("")}</div></div>
    <div class="kpis k3"><div class="kpi"><span>Riesgo alto</span><b style="color:${cnt("Alto") ? "var(--danger)" : "inherit"}">${cnt("Alto")}</b></div><div class="kpi"><span>Medio</span><b>${cnt("Medio")}</b></div><div class="kpi"><span>Bajo</span><b>${cnt("Bajo")}</b></div></div>
    <div class="card"><h3>Auditoría del periodo</h3><p class="small muted" style="margin-top:-4px">Ventas anuladas, descuentos, cambios de precio e inventario, diferencias de caja, compras sin soporte y sincronización. Un riesgo es algo para revisar, no una falta comprobada.</p>
    ${d.riesgos.length ? tablaVista([{h: "Riesgo", f: r => `<span class="pill ${r.riesgo === "Alto" ? "bad" : r.riesgo === "Medio" ? "warn" : ""}">${esc(r.riesgo)}</span>`}, {h: "Tipo", f: r => esc(r.tipo)}, {h: "Detalle", f: r => esc(r.accion)}, {h: "Usuario", f: r => esc(r.usuario || "—")}, {h: "Fecha", f: r => esc(r.fecha)}], d.riesgos.slice(0, 80)) : '<p class="muted" style="margin:0">Sin eventos para revisar en el periodo.</p>'}
    <div class="btns" style="margin-top:10px">${BOTON_INF("auditoria", "Excel de auditoría", "ghost")}</div></div>`;
}

/* ---------- cierre mensual ---------- */
function conCierre() {
  const mes = S.cierreMes || mesId(S.today), meses = [mesId(S.today), mesId(prevMonthFirst(S.today)), mesId(prevMonthFirst(prevMonthFirst(S.today)))], ch = chequeosCierre(mes), ok = ch.filter(x => x.ok).length, pctOk = Math.round(ok / ch.length * 100), per = col("periodos")[mes] || {}, a = mes + "-01", b = lastOfMonth(a), inc = ch[0] ? ch[0].inconsistencias : 0;
  const nombreMes = m => cap1(MESES[+m.slice(5, 7) - 1]) + " " + m.slice(0, 4);
  return `<div class="seg" style="margin-bottom:14px">${meses.map(m => `<button data-act="cierreMes" data-v="${m}" aria-pressed="${m === mes}">${nombreMes(m)}</button>`).join("")}</div>
    <div class="card"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px"><h3 style="margin:0">Estado del cierre · ${nombreMes(mes)}</h3><b style="font-size:22px">${pctOk === 100 ? "✓ " : ""}${pctOk}% listo</b></div><div class="progreso" style="margin:12px 0 6px"><i style="width:${pctOk}%"></i></div>
      ${per.cerrado ? `<div class="notice">Mes marcado como cerrado el ${diaCorto(ymd(new Date(per.cerrado.t)))}${per.cerrado.pendientes ? " con " + per.cerrado.pendientes + " pendientes" : ""}.</div>` : ""}
      ${pctOk === 100 ? '<div class="alertrow" style="border-color:var(--marca)"><span class="sev ok"></span><div><b>✓ MES LISTO PARA CONTABILIDAD</b><span>Genera el paquete y envíaselo a tu contador.</span></div></div>' : `<p class="small muted" style="margin:4px 0 0">Pendientes: ${ch.filter(x => !x.ok).length}${inc ? " · el informe tiene " + inc + " inconsistencias" : ""}</p>`}</div>
    <div class="card"><h3>Lista de cierre</h3>${ch.map(x => `<label class="check" style="justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line);margin:0"><span style="display:flex;gap:10px;align-items:center"><input type="checkbox" ${x.ok ? "checked" : ""} ${x.auto ? "disabled" : ""} data-act-change="cierreItem" data-k="${x.k}" data-mes="${mes}"> <span>${esc(x.t)}${x.d ? `<br><span class="xs muted">${esc(x.d)}</span>` : ""}</span></span><span class="xs muted hide-sm">${x.auto ? "Automático" : "Lo marcas tú"}</span></label>`).join("")}</div>
    <div class="btns"><button class="btn pri" data-act="prepararCierre" data-mes="${mes}" ${S.generando ? "disabled" : ""}>${S.generando === "cierre" ? '<span class="spin" aria-hidden="true"></span> Preparando…' : ic("descargar", 18) + " PREPARAR CIERRE (ZIP)"}</button><button class="btn ghost" data-act="cerrarMes" data-mes="${mes}">Marcar mes como cerrado</button></div>
    <p class="xs muted" style="margin-top:10px">“Preparar cierre” genera en un solo archivo el informe gerencial, el informe empresarial, los 15 Excel para el contador y el resumen contable en PDF (${periodoDoc(a, b)}).</p>`;
}
ACT.cierreMes = (el, x) => { S.cierreMes = x.v; draw(); };
document.addEventListener("change", async e => { const t = e.target; if (!t.dataset || t.dataset.actChange !== "cierreItem") return; const mes = t.dataset.mes, cur = col("periodos")[mes] || {}, man = Object.assign({}, cur.manual || {}); if (t.checked) man[t.dataset.k] = Date.now(); else delete man[t.dataset.k];
  await guardar(async () => { exigirAdmin(); await put("periodos", mes, Object.assign({}, cur, {manual: man})); }); });
ACT.prepararCierre = async (el, x) => { if (S.generando) return; const a = x.mes + "-01", b = lastOfMonth(a); S.generando = "cierre"; draw();
  try { exigirAdmin(); const d = datosInforme(a, b, {}); const blob = await zipContador(d, true); const cur = col("periodos")[x.mes] || {}; await put("periodos", x.mes, Object.assign({}, cur, {paqueteT: Date.now()})); audit("EXPORTACION", "cierre", x.mes); await guardarArchivo("OLI_CIERRE_" + etiquetaPeriodo(a, b) + ".zip", blob); }
  catch (e) { console.error(e); toast((e && e.message) || "No se pudo preparar el cierre.", true); } finally { S.generando = null; draw(); } };
ACT.cerrarMes = async (el, x) => { const ch = chequeosCierre(x.mes), pend = ch.filter(c => !c.ok);
  const okc = await confirmar(pend.length ? {titulo: "Hay " + pend.length + " pendientes", texto: "Pendiente: " + pend.map(p => p.t).join(", ") + ". ¿Marcar el mes como cerrado de todas formas? Quedará registrado.", si: "Cerrar con pendientes", no: "Revisar primero", peligro: true} : {titulo: "¿Marcar el mes como cerrado?", texto: "Quedará registrado quién y cuándo lo cerró.", si: "Sí, cerrar", no: "No"});
  if (!okc) return; await guardar(async () => { exigirAdmin(); const cur = col("periodos")[x.mes] || {}; await put("periodos", x.mes, Object.assign({}, cur, {cerrado: {t: Date.now(), uid: uidActual(), pendientes: pend.length}})); audit("CIERRE_MES", x.mes, pend.length ? pend.length + " pendientes" : "completo"); }, "Mes cerrado"); };

VIEWS.contabilidad = () => {
  if (!TABS_CON.some(t => t[0] === S.conTab)) S.conTab = "resumen";
  const body = {resumen: conResumen, cumplimiento: conCumplimiento, facturacion: conFacturacion, soporte: conSoporte, exogena: conExogena, conciliacion: conConciliacion, auditoria: conAuditoria, cierre: conCierre}[S.conTab]();
  return cabecera("Contabilidad", "Información organizada para tu contador. Sin promesas de cumplimiento automático.") + `<div class="chips wrap" style="margin-bottom:14px">${TABS_CON.map(([k, l]) => `<button class="chip" data-act="conTab" data-v="${k}" aria-pressed="${S.conTab === k}">${l}</button>`).join("")}</div>` + body;
};
ACT.conTab = (el, x) => { S.conTab = x.v; draw(); };
