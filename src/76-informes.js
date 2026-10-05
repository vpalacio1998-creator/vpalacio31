/* ============ 76 · informes (administrador) ============
   Elegir periodo y filtros → ver si la información está completa → descargar Excel, PDF o el paquete del contador. */
S.inf = {rango: "mes", F: {cat: "", pid: "", uid: "", m: "", dev: ""}}; S.generando = null;
const RANGOS_INF = [["hoy", "Hoy"], ["7", "7 días"], ["mes", "Este mes"], ["mesant", "Mes anterior"], ["30", "30 días"], ["custom", "Otro"]];
const rangoInf = () => rangoFechas(S.inf.rango);
const claveInf = () => { const [a, b] = rangoInf(); return a + b + JSON.stringify(S.inf.F); };
const datosVista = () => memo("inf:" + claveInf(), () => { const [a, b] = rangoInf(); return datosInforme(a, b, S.inf.F); });
function opcionesFiltro() {
  const vs = ventasAll(), devs = uniq(vs.map(v => v.dev).concat(cajasAll().map(c => c.dev))).filter(Boolean), uids = uniq(vs.map(v => v.uid)).filter(Boolean);
  pedirNombres(uids);
  return {devs: devs.map(d => [d, devNombre(d)]).sort((x, y) => x[1].localeCompare(y[1], "es")), uids: uids.map(u => [u, empNombre(u)]).sort((x, y) => x[1].localeCompare(y[1], "es")), cats: uniq(prods().map(p => p.cat || "Otros")).sort(), prods: prods().filter(p => p.tipo !== "insumo").map(p => [p.id, p.nombre])};
}
const selFiltro = (k, label, ops, todos) => `<div><label class="f" for="if-${k}">${label}</label><select class="in" id="if-${k}" data-act-change="filtroInf" data-k="${k}"><option value="">${todos}</option>${ops.map(([v, l]) => `<option value="${esc(v)}" ${S.inf.F[k] === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></div>`;
function controlesInforme() {
  const o = opcionesFiltro(), nF = Object.values(S.inf.F).filter(Boolean).length;
  return `<div class="card"><h3>Periodo</h3><div class="seg" role="group" aria-label="Periodo">${RANGOS_INF.map(([k, l]) => `<button data-act="rangoInf" data-v="${k}" aria-pressed="${S.inf.rango === k}">${l}</button>`).join("")}</div>
    ${S.inf.rango === "custom" ? `<div class="split" style="margin-top:10px"><div><label class="f" for="f-desde">Desde</label><input class="in" type="date" id="f-desde" value="${esc(S.desde || addDays(S.today, -6))}" data-act-change="fechas"></div><div><label class="f" for="f-hasta">Hasta</label><input class="in" type="date" id="f-hasta" value="${esc(S.hasta || S.today)}" data-act-change="fechas"></div></div>` : ""}
    <details style="margin-top:12px"${nF ? " open" : ""}><summary class="small" style="font-weight:700;min-height:40px;display:flex;align-items:center;cursor:pointer">Filtros${nF ? " (" + nF + ")" : " (opcional)"}</summary>
      <div class="split">${selFiltro("dev", "Caja", o.devs, "Todas las cajas")}${selFiltro("uid", "Empleado", o.uids, "Todos")}</div>
      <div class="split">${selFiltro("m", "Medio de pago", METODOS.map(m => [m, m]), "Todos")}${selFiltro("cat", "Categoría", o.cats.map(c => [c, c]), "Todas")}</div>
      ${selFiltro("pid", "Producto", o.prods, "Todos los productos")}
      ${nF ? '<button class="btn ghost sm" style="margin-top:10px" data-act="limpiarFiltrosInf">Quitar filtros</button>' : ""}
    </details></div>`;
}
const BOTON_INF = (tipo, txt, cls = "pri") => { const g = S.generando === tipo; return `<button class="btn ${cls}" data-act="generar" data-v="${tipo}" ${S.generando ? "disabled" : ""} aria-busy="${g}">${g ? '<span class="spin" aria-hidden="true"></span> Generando…' : ic("descargar", 18) + " " + txt}</button>`; };
const INFORMES = [
  {t: "gerencial", n: "Informe gerencial", f: "Excel", d: "Resumen ejecutivo con gráficos, ventas, rentabilidad, inventario, compras, caja, gastos y mermas.", b: "DESCARGAR INFORME GERENCIAL"},
  {t: "empresarial", n: "Informe empresarial", f: "PDF", d: "Documento completo de 14 secciones para presentar: ventas, rentabilidad, inventario, tendencias y recomendaciones.", b: "DESCARGAR PDF"},
  {t: "dueno", n: "Informe del dueño", f: "PDF", d: "Dos páginas: cuánto vendí, cuánto gané, qué se agotó, qué comprar y qué hacer.", b: "DESCARGAR PDF"},
  {t: "zip", n: "Paquete para el contador", f: "ZIP", d: "15 archivos Excel (ventas, compras, gastos, caja, inventario, impuestos, terceros, auditoría…) y el resumen contable en PDF.", b: "GENERAR PAQUETE"}
];
const MODS_INF = [["ventas", "Ventas"], ["inventario", "Inventario"], ["compras", "Compras"], ["caja", "Caja"], ["gastos", "Gastos"], ["rentabilidad", "Rentabilidad"], ["mermas", "Mermas"], ["clientes", "Clientes"], ["auditoria", "Auditoría"], ["impuestos", "Impuestos"], ["terceros", "Terceros"]];
function avisoIntegridad(d) {
  if (!d.integ.length) return `<div class="alertrow" style="border-color:var(--marca)"><span class="sev ok"></span><div><b>La información del periodo está completa.</b><span>No se encontraron inconsistencias. ${d.control.every(c => c.ok) ? "Los totales cuadran entre el detalle y el resumen." : ""}</span></div></div>`;
  return `<div class="alertrow" style="border-color:var(--warn)"><span class="sev warn"></span><div style="flex:1"><b>EL INFORME TIENE ${d.integ.length} ${d.integ.length === 1 ? "INCONSISTENCIA" : "INCONSISTENCIAS"}</b><span>Puedes descargar igual; quedan señaladas dentro del archivo.</span>
    <details style="margin-top:6px"><summary class="small" style="font-weight:700;cursor:pointer">Ver cuáles</summary>${d.integ.map(x => `<div class="row" style="padding:6px 0"><span class="small">${esc(x.t)}${x.d ? `<br><span class="xs muted">${esc(x.d)}</span>` : ""}</span><b>${x.n}</b></div>`).join("")}</details></div></div>`;
}
VIEWS.reportes = () => {
  const [a, b] = rangoInf(), d = datosVista();
  const kpi = (l, v, s, c) => `<div class="kpi"><span>${l}</span><b${c ? ` style="color:${c}"` : ""}>${v}</b>${s ? `<small>${s}</small>` : ""}</div>`;
  return cabecera("Informes", periodoDoc(a, b) + (d.filtrado ? " · " + esc(filtrosTxt(d.F)) : "") + " · todo sale de los mismos registros, así los totales cuadran.") + controlesInforme() + avisoIntegridad(d) +
    `<div class="kpis">${kpi("Ventas", fmt(d.tot), d.n + " ventas")}${kpi("Utilidad bruta", fmt(d.bruta), "margen " + pct(d.margenBruto || 0))}${kpi("Gastos", d.gastosOp == null ? "–" : fmt(d.gastosOp), d.gastosOp == null ? "no aplica con filtro" : "sin materia prima")}${kpi("Utilidad estimada", d.util == null ? "–" : fmt(d.util), d.util == null ? "" : "margen " + pct(d.margen || 0), d.util != null && d.util < 0 ? "var(--danger)" : "")}</div>
    ${d.sinCosto ? `<div class="notice">Faltan costos en ${d.sinCosto} líneas vendidas: la utilidad puede ser menor. <button class="btn ghost sm" data-act="ir" data-r="productos">Completar costos</button></div>` : ""}
    <div class="repgrid">${INFORMES.map(x => `<div class="card" style="margin:0;display:flex;flex-direction:column"><div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px"><h3 style="margin:0">${x.n}</h3><span class="pill">${x.f}</span></div><p class="small muted" style="flex:1;margin:6px 0 12px">${x.d}</p>${BOTON_INF(x.t, x.b)}</div>`).join("")}</div>
    <div class="card"><h3>Excel por tema</h3><p class="small muted" style="margin-top:-4px">Cada archivo trae encabezado OLI, periodo, filtros, totales, formatos de moneda y paneles congelados.</p><div class="btns">${MODS_INF.map(([k, l]) => BOTON_INF(k, l, "ghost")).join("")}</div></div>
    <div class="card"><h3>Resumen contable</h3><p class="small muted" style="margin-top:-4px">Ventas, descuentos, costo, impuestos por tratamiento, consecutivos, conciliación e información pendiente.</p><div class="btns">${BOTON_INF("contador", "Resumen contable (PDF)", "ghost")}<button class="btn ghost" data-act="ir" data-r="contabilidad">Abrir Contabilidad</button></div></div>
    <p class="xs muted">${esc(AVISO_TRIB)}</p>`;
};
ACT.rangoInf = (el, d) => { S.inf.rango = d.v; draw(); };
ACT.limpiarFiltrosInf = () => { S.inf.F = {cat: "", pid: "", uid: "", m: "", dev: ""}; draw(); };
document.addEventListener("change", e => { const t = e.target; if (t.dataset && t.dataset.actChange === "filtroInf") { S.inf.F[t.dataset.k] = t.value; draw(); } });
ACT.generar = async (el, d) => {
  if (S.generando) return; const [a, b] = rangoInf(); S.generando = d.v; draw();
  try { await new Promise(r => setTimeout(r, 30)); await generar(d.v, a, b, S.inf.F); }
  catch (e) { console.error(e); toast(e && e.code === "denied" ? "Solo el administrador puede generar informes." : (e && e.message) || "No se pudo generar el archivo.", true); }
  finally { S.generando = null; draw(); }
};
