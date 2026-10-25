/* ============ 81 · informe financiero en Excel (de lo general a lo específico) ============
   Primera hoja: «Resumen del negocio» (indicadores, ¿cómo va el negocio?, alertas y gráficos). Segunda: «Análisis» (por día, semana y
   mes, comparativos, categorías, medios de pago). Después el detalle: Ventas, Productos, Inventario, Compras, Gastos, Caja, Estado de
   resultados, Equilibrio y Validaciones.
   Cada cifra del resumen es una fórmula que lee el Estado de resultados, y este lee las hojas de detalle (SUMIFS por fecha): si cambian
   «Desde» y «Hasta» en el resumen (dentro del periodo descargado) todo se recalcula, y cualquier número se puede rastrear hasta sus
   registros. Los valores que se guardan junto a cada fórmula se calculan aquí con las mismas filas, para que el archivo se vea bien
   aunque el programa no recalcule al abrir. Los gráficos son gráficos de Excel conectados a esas celdas (se agregan al archivo después
   de que ExcelJS lo arma, porque ExcelJS no los hace).
   Utilidad: la de Dinero (ventas − costo − gastos registrados) y, aparte, la que también descuenta los gastos fijos del plan que aún no
   se registraron, proporcionales a los días del periodo. Es una estimación de gestión, no una utilidad contable oficial. */
const QS = n => "'" + String(n).replace(/'/g, "''") + "'";
const qx = s => String(s == null ? "" : s).replace(/"/g, '""');   // texto dentro de una fórmula
const H_RES = "Resumen", H_AN = "Análisis", H_ER = "Estado de resultados", H_EQ = "Equilibrio", H_VAL = "Validaciones";
const DESDE = QS(H_RES) + "!$K$2", HASTA = QS(H_RES) + "!$K$3";
const TRAT = {mp: "Materia prima (ya está en el costo)", fijo: "Incluido en gastos fijos del plan", var: "Gasto del período"};
const diasDelMes = f => parse(lastOfMonth(f)).getDate();
// tabla (o bloque) de una hoja: dónde quedaron sus datos, para armar rangos de fórmulas
const T_ = (hoja, r0, r1, cols) => ({hoja, r0, r1: Math.max(r0, r1), cols});
const tDe = ws => T_(ws.name, ws._oli.r0, ws._oli.r1, ws._oli.cols);
function rCol(T, k) { const i = T.cols.findIndex(c => c.k === k || c.id === k); if (i < 0) throw new Error("Columna " + k); const L = colL(i + 1); return `${QS(T.hoja)}!$${L}$${T.r0}:$${L}$${T.r1}`; }
const enFechas = T => `${rCol(T, "fecha")},">="&${DESDE},${rCol(T, "fecha")},"<="&${HASTA}`;
const fx = (formula, result) => ({formula, result: result == null || (typeof result === "number" && !isFinite(result)) ? 0 : result});
const ir = (hoja, txt) => ({text: txt || hoja, hyperlink: "#" + QS(hoja) + "!A1"});
const relleno = argb => ({type: "pattern", pattern: "solid", fgColor: {argb}});
const XS = {menta2: "FF8CBA9C", amarillo: "FFD9A441"};

/* ---------- logo de OLI (el mismo dibujo del ícono de la app: paleta menta, centro crema y la palabra OLI) ---------- */
function logoOLI() {
  const cv = document.createElement("canvas"), W = 360, H = 120; cv.width = W * 2; cv.height = H * 2; const c = cv.getContext("2d"); c.scale(2, 2);
  const R = 52, cx = 60, cy = 60;
  c.fillStyle = "#FAF7F0"; c.beginPath(); c.moveTo(cx - R - 6 + 14, cy - R - 6); c.arcTo(cx + R + 6, cy - R - 6, cx + R + 6, cy + R + 6, 26); c.arcTo(cx + R + 6, cy + R + 6, cx - R - 6, cy + R + 6, 26); c.arcTo(cx - R - 6, cy + R + 6, cx - R - 6, cy - R - 6, 26); c.arcTo(cx - R - 6, cy - R - 6, cx + R + 6, cy - R - 6, 26); c.closePath(); c.fill();
  c.fillStyle = "#8CBA9C"; c.beginPath(); c.arc(cx, cy, R * .78, 0, Math.PI * 2); c.fill();
  c.fillStyle = "#FAF7F0"; c.beginPath(); c.arc(cx, cy, R * .38, 0, Math.PI * 2); c.fill();
  c.globalAlpha = .9; c.beginPath(); c.ellipse(cx - R * .42, cy - R * .3, R * .08, R * .12, 0, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
  c.fillStyle = "#2F7B5A"; c.font = "700 64px Fredoka, 'Trebuchet MS', Arial, sans-serif"; c.textBaseline = "middle"; c.fillText("OLI", 128, 64);
  return cv.toDataURL("image/png");
}

/* ---------- los números (mismas filas que van a las hojas) ---------- */
function filasVentasFin(d) {
  const pend = new Set(ventasOk().filter(v => v.pend).map(v => v.id)), vistas = new Set();
  return d.ventas.map(r => { const ok = r.estado === "Confirmada", primera = ok && !vistas.has(r.id); if (primera) vistas.add(r.id); return Object.assign({}, r, {pend: ok && pend.has(r.id), cuenta: primera ? 1 : 0}); });
}
function tratamientoGasto(cat) { if (cat === BASE_COSTO) return TRAT.mp; return totalFijos() > 0 && catsEnFijos().includes(cat) ? TRAT.fijo : TRAT.var; }
function filasGastosFin(d) { return d.gastos.map(g => Object.assign({}, g, {trat: tratamientoGasto(g.categoria)})); }
function clasifMov(m) { const t = String(m.motivo || ""); if (m.tipo === "Pago desde caja") return "Pago (gasto)"; if (empiezaCon(t, "Devolución a cliente")) return "Devolución a cliente"; if (empiezaCon(t, "Retiro del dueño")) return "Retiro del dueño"; if (empiezaCon(t, "Consignación")) return "Consignación"; if (empiezaCon(t, "Base adicional")) return "Base adicional"; if (empiezaCon(t, "Cambio de billetes")) return "Cambio de billetes"; return "Otro"; }
function filasMovCajaFin(d) { return d.movCaja.map(m => Object.assign({}, m, {clase: clasifMov(m)})); }
// el estado de resultados de un rango de fechas (las mismas cuentas que hacen las fórmulas del archivo)
function resultadoDe(V, G, M, a, b) {
  const en = f => f >= a && f <= b, ok = V.filter(r => r.estado === "Confirmada" && en(r.fecha));
  const netoProd = sum(ok, r => r.total), desc = sum(ok, r => r.descuento), costo = sum(ok, r => r.costo || 0), devol = sum(M.filter(m => m.clase === "Devolución a cliente" && en(m.fecha)), m => m.valor);
  const gs = G.filter(g => en(g.fecha)), gastosReg = sum(gs.filter(g => g.trat !== TRAT.mp), g => g.total), gFijoReg = sum(gs.filter(g => g.trat === TRAT.fijo), g => g.total), gVar = sum(gs.filter(g => g.trat === TRAT.var), g => g.total);
  const dias = diffDays(b, a) + 1, fijosPer = totalFijos() * dias / diasDelMes(a), fijosPend = Math.max(0, fijosPer - gFijoReg);
  const netas = netoProd - devol, bruta = netas - costo, reg = bruta - gastosReg, neta = reg - fijosPend, n = sum(ok, r => r.cuenta);
  return {brutas: netoProd + desc, desc, devol, netas, costo, bruta, mb: netas ? bruta / netas : 0, gastosReg, reg, fijosPer, fijosPend, neta, mn: netas ? neta / netas : 0, gTot: gastosReg + fijosPend, gVar, n, ticket: n ? netoProd / n : 0,
    pend: sum(ok.filter(r => r.pend), r => r.total), sinCosto: ok.filter(r => r.costo == null || r.costoParcial).length, dias};
}
// el periodo anterior de igual duración (solo para comparar; sus registros no van en el archivo)
function resultadoAnterior(a, b) {
  const [pa, pb] = periodoAnterior(a, b), d = datosInforme(pa, pb, {});
  const R = resultadoDe(filasVentasFin(d), filasGastosFin(d), filasMovCajaFin(d), pa, pb);
  return Object.assign(R, {a: pa, b: pb, conDatos: d.n > 0 && d.dias.filter(x => x.n).length >= 0.8 * Math.max(1, diasConVentas(a, b))});
}
const diasConVentas = (a, b) => uniq(ventasOk().filter(v => v.fecha >= a && v.fecha <= b).map(v => v.fecha)).length;
function variacion(act, ant, conDatos, masEsMejor = true) {
  if (!conDatos) return {txt: "Sin período anterior comparable", tono: "gris"};
  if (!ant) return {txt: act ? "Antes: $0" : "Igual que antes", tono: "gris"};
  const ch = (act - ant) / Math.abs(ant), sube = ch >= 0, bueno = masEsMejor ? sube : !sube;
  return {txt: (sube ? "▲ " : "▼ ") + Math.abs(Math.round(ch * 100)) + " % vs. período anterior", tono: Math.abs(ch) < 0.005 ? "gris" : bueno ? "verde" : "rojo"};
}

/* ---------- alertas (solo con lo que dicen los datos) ---------- */
function alertasFin(d, R, Ant, eq) {
  const out = [], add = (sev, t, revisar, hoja) => out.push({sev, t, revisar, hoja});
  if (R.sinCosto) { const ps = uniq(d.ok.filter(r => r.costo == null || r.costoParcial).map(r => r.producto)); add("bad", ps.length + (ps.length === 1 ? " producto se vendió" : " productos se vendieron") + " sin costo registrado: la utilidad sale más alta de lo real.", ps.slice(0, 3).join(", ") + (ps.length > 3 ? "…" : "") + " → Productos → costo.", "Productos"); }
  if (Ant.conDatos && Ant.gastosReg > 0 && R.gastosReg > Ant.gastosReg * 1.3 && R.gastosReg - Ant.gastosReg >= 50000) add("warn", "Los gastos registrados subieron " + Math.round((R.gastosReg / Ant.gastosReg - 1) * 100) + " % frente al período anterior.", "Qué categorías crecieron.", "Gastos");
  const obj = margenObjetivo(), bajos = d.rent.filter(r => r.costoOk && r.ventas > 0 && r.margen != null && r.margen < obj * 0.6).sort((x, y) => x.margen - y.margen);
  if (bajos.length) add("warn", bajos.length + (bajos.length === 1 ? " producto deja" : " productos dejan") + " menos de " + pct(obj * 0.6) + " de margen bruto (tu objetivo es " + pct(obj) + ").", bajos.slice(0, 3).map(r => r.producto + " " + pct(r.margen)).join(", ") + ".", "Productos");
  const ago = d.inv.filter(r => r.estado === "AGOTADO"), rie = d.inv.filter(r => r.estado === "RIESGO" || r.estado === "BAJO");
  if (ago.length) add("bad", ago.length + (ago.length === 1 ? " producto agotado" : " productos agotados") + ": " + ago.slice(0, 3).map(r => r.producto).join(", ") + (ago.length > 3 ? "…" : "") + ".", "Inventario y pedidos pendientes.", "Inventario");
  if (rie.length) add("warn", rie.length + (rie.length === 1 ? " producto con inventario bajo o por agotarse." : " productos con inventario bajo o por agotarse."), rie.slice(0, 3).map(r => r.producto).join(", ") + ".", "Inventario");
  if (eq.pe != null && eq.mes && eq.necesariaDia != null && eq.ritmoDia < eq.necesariaDia) add("bad", "Al ritmo de este período (" + fmt(eq.ritmoDia) + " por día) no se alcanza el punto de equilibrio: harían falta " + fmt(eq.necesariaDia) + " por día el resto del mes.", "Equilibrio y escenarios.", H_EQ);
  const sinRev = d.cajas.filter(c => c.revisada === false && c.difFinal && Math.abs(c.difFinal) >= 1000), abiertas = cajasAll().filter(c => c.fecha < S.today && c.apertura && cajaEstado(c) === "abierta");
  if (sinRev.length) add("warn", sinRev.length + (sinRev.length === 1 ? " diferencia de caja sin revisar" : " diferencias de caja sin revisar") + " (" + fmt(sum(sinRev, c => c.difFinal)) + ").", "Caja → columna «Diferencia final».", "Caja");
  if (abiertas.length) add("warn", abiertas.length + (abiertas.length === 1 ? " caja de un día anterior sigue abierta: " : " cajas de días anteriores siguen abiertas: ") + abiertas.slice(0, 2).map(c => (c.devNombre || devNombre(c.dev)) + " del " + diaCorto(c.fecha)).join(", ") + ".", "Ciérralas en OLI → Caja.", "Caja");
  if (R.pend) add("warn", "Hay " + fmt(R.pend) + " en pagos por QR, Nequi o Daviplata sin confirmar: no es plata segura hasta verla en la cuenta.", "Ventas → columna «Pago».", "Ventas");
  if (d.integ.length) add("warn", "El periodo tiene " + d.integ.length + (d.integ.length === 1 ? " inconsistencia de datos." : " inconsistencias de datos."), "Validaciones.", H_VAL);
  const ord = {bad: 0, warn: 1, ok: 2}; return out.sort((x, y) => ord[x.sev] - ord[y.sev]);
}

/* ---------- punto de equilibrio y meta (para el mes del final del período) ---------- */
// el ritmo cuenta desde el primer día con ventas del período (si el negocio abrió a mitad de mes, los días sin operar no lo bajan)
function equilibrioFin(R, a, b, V) {
  const fijos = totalFijos(), contrib = R.netas - R.costo - R.gVar, mc = R.netas > 0 ? contrib / R.netas : null, pe = fijos > 0 && mc != null && mc > 0 ? fijos / mc : null;
  const primera = V.filter(r => r.estado === "Confirmada" && r.fecha >= a && r.fecha <= b).map(r => r.fecha).sort()[0] || a, diasOp = diffDays(b, primera) + 1;
  const mes = a.slice(8) === "01" && a.slice(0, 7) === b.slice(0, 7), dm = diasDelMes(b), quedan = Math.max(0, dm - parse(b).getDate()), ritmoDia = diasOp ? R.netas / diasOp : 0;
  const falta = pe != null && mes ? Math.max(0, pe - R.netas) : null, metaDia = Number(configNeg().metaDia) || 0;
  return {fijos, contrib, mc, pe, mes, dm, quedan, ritmoDia, primera, diasOp, falta, necesariaDia: falta != null && quedan > 0 ? falta / quedan : null, avancePE: pe && mes ? R.netas / pe : null,
    metaDia, metaMes: metaDia ? metaDia * dm : null, avanceMeta: metaDia ? R.netas / (metaDia * R.dias) : null, proyMes: ritmoDia * dm};
}

/* ---------- estilos de bloques ---------- */
function celda(ws, ref, v, o = {}) {
  const c = ws.getCell(ref); c.value = v; if (o.nf) c.numFmt = o.nf; c.font = Object.assign({size: o.size || 10, color: {argb: o.color || XC.tinta}}, o.b ? {bold: true} : {}, o.i ? {italic: true} : {});
  if (o.fill) c.fill = relleno(o.fill); c.alignment = Object.assign({vertical: "middle", wrapText: !!o.wrap}, o.h ? {horizontal: o.h} : {}); if (o.borde) c.border = o.borde; return c;
}
function fusion(ws, r1, c1, r2, c2, v, o) { ws.mergeCells(r1, c1, r2, c2); return celda(ws, colL(c1) + r1, v, o); }
// tabla sin filtro debajo de otra (una hoja admite un solo filtro): título, encabezado, filas y total
function bloque(ws, y, titulo, cols, rows, o = {}) {
  fusion(ws, y, 1, y, Math.max(4, cols.length), titulo.toUpperCase(), {b: true, size: 11, color: XC.verde}); ws.getCell(y, 1).border = {bottom: {style: "thin", color: {argb: XC.verde}}}; y++;
  const hr = ws.getRow(y); cols.forEach((c, i) => { const cell = hr.getCell(i + 1); cell.value = c.h; cell.font = {bold: true, size: 10, color: {argb: XC.verdeO}}; cell.fill = relleno(XC.menta); cell.alignment = {wrapText: true, vertical: "middle", horizontal: c.t && c.t !== "text" && c.t !== "fecha" ? "right" : "left"}; }); hr.height = 28;
  const r0 = y + 1;
  rows.forEach((r, j) => { const row = ws.getRow(r0 + j); cols.forEach((c, i) => { const cell = row.getCell(i + 1); let v = c.f ? c.f(r, r0 + j) : r[c.k]; if (v != null && c.t === "fecha" && typeof v === "string") v = xFecha(v); cell.value = v == null || v === "" ? null : v; const nf = fmtCelda(c.t); if (nf) cell.numFmt = nf; cell.font = {size: 10, color: {argb: XC.tinta}}; cell.border = {bottom: {style: "hair", color: {argb: XC.borde}}}; if (c.neg && typeof v === "number" && v < 0) cell.font = {size: 10, bold: true, color: {argb: XC.rojo}}; }); });
  if (!rows.length) { fusion(ws, r0, 1, r0, Math.max(4, cols.length), o.vacio || "Sin registros en este periodo.", {i: true, color: XC.gris}); return {T: T_(ws.name, r0, r0, cols), next: r0 + 2}; }
  const r1 = r0 + rows.length - 1;
  if (cols.some(c => c.tot)) { const tr = ws.getRow(r1 + 1); tr.getCell(1).value = "TOTAL"; cols.forEach((c, i) => { const cell = tr.getCell(i + 1); if (c.tot) { const L = colL(i + 1); cell.value = fx(`SUM(${L}${r0}:${L}${r1})`, sum(rows, r => { const v = c.f ? c.f(r) : r[c.k]; return typeof v === "number" ? v : (v && typeof v.result === "number" ? v.result : 0); })); cell.numFmt = fmtCelda(c.t) || XF.num; } cell.font = {bold: true, size: 10, color: {argb: XC.verdeO}}; cell.fill = relleno(XC.crema); cell.border = {top: {style: "thin", color: {argb: XC.verde}}}; }); }
  return {T: T_(ws.name, r0, r1, cols), next: r1 + (cols.some(c => c.tot) ? 3 : 2)};
}
const volver = (ws, r = 4, c = 1) => { const x = ws.getCell(r, c); x.value = ir(H_RES, "← Volver al resumen"); x.font = {size: 9, bold: true, underline: true, color: {argb: XC.verde}}; };

/* ---------- columnas de las hojas de detalle ---------- */
const COLS_FIN = {
  ventas: [{h: "ID venta", k: "id"}, {h: "N.º", k: "num"}, {h: "Fecha", k: "fecha", t: "fecha"}, {h: "Hora", k: "hora"}, {h: "Caja", k: "caja"}, {h: "Empleado", k: "empleado"}, {h: "Código", k: "pid"}, {h: "Producto", k: "producto"}, {h: "Detalle", k: "detalle"}, {h: "Categoría", k: "categoria"},
    {h: "Cantidad", k: "cantidad", t: "num", tot: 1}, {h: "Precio unitario", k: "precio", t: "money"}, {h: "Descuento", k: "descuento", t: "money", tot: 1}, {h: "Total", k: "total", t: "money", tot: 1}, {h: "Costo", k: "costo", t: "money", tot: 1},
    {h: "Utilidad bruta", id: "ub", f: r => r.costo == null ? null : r.total - r.costo, t: "money", tot: 1, neg: 1}, {h: "Costo registrado", id: "costoOk", f: r => r.costo == null ? "Falta" : r.costoParcial ? "Incompleto" : "Sí"}, {h: "Método de pago", k: "metodo"}, {h: "Pago", id: "pago", f: r => r.estado !== "Confirmada" ? "" : r.pend ? "Por confirmar" : "Recibido"},
    {h: "Estado", k: "estado", estado: 1}, {h: "Cuenta como venta", id: "cuenta", f: r => r.cuenta, t: "int", tot: 1}],
  gastos: COLS.gastos.concat([{h: "Cómo cuenta en el resultado", id: "trat", f: r => r.trat}]),
  movCaja: COLS.movCaja.concat([{h: "Clasificación", id: "clase", f: r => r.clase}])
};

/* ---------- gráficos de Excel (DrawingML) ---------- */
const xe = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function chartXML(g) {
  const txt = (sz, col, b) => `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}"${b ? ' b="1"' : ""}><a:solidFill><a:srgbClr val="${col}"/></a:solidFill><a:latin typeface="Calibri"/></a:defRPr></a:pPr><a:endParaRPr lang="es-CO"/></a:p></c:txPr>`;
  const cache = (vals, num) => num ? `<c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${vals.length}"/>${vals.map((v, i) => v == null || !isFinite(v) ? "" : `<c:pt idx="${i}"><c:v>${Math.round(v * 100) / 100}</c:v></c:pt>`).join("")}</c:numCache>` : `<c:strCache><c:ptCount val="${vals.length}"/>${vals.map((v, i) => `<c:pt idx="${i}"><c:v>${xe(v)}</c:v></c:pt>`).join("")}</c:strCache>`;
  const cat = s => `<c:cat><c:strRef><c:f>${xe(s.catRef)}</c:f>${cache(s.cat, false)}</c:strRef></c:cat>`, val = s => `<c:val><c:numRef><c:f>${xe(s.valRef)}</c:f>${cache(s.val, true)}</c:numRef></c:val>`;
  const fill = col => `<c:spPr><a:solidFill><a:srgbClr val="${col}"/></a:solidFill></c:spPr>`;
  const nfEje = g.fmt === "pct" ? "0%" : '"$"#,##0';
  const ejes = `<c:catAx><c:axId val="5001"/><c:scaling><c:orientation val="${g.horizontal ? "maxMin" : "minMax"}"/></c:scaling><c:delete val="0"/><c:axPos val="${g.horizontal ? "l" : "b"}"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="low"/><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="D5E0D9"/></a:solidFill></a:ln></c:spPr>${txt(900, "6B7A72")}<c:crossAx val="5002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`
    + `<c:valAx><c:axId val="5002"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${g.horizontal ? "b" : "l"}"/><c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E6ECE8"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="${xe(nfEje)}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${txt(900, "6B7A72")}<c:crossAx val="5001"/><c:crosses val="${g.horizontal ? "max" : "autoZero"}"/><c:crossBetween val="between"/></c:valAx>`;
  const dLbls = (pos, extra) => `<c:dLbls><c:numFmt formatCode="${xe(extra === "pct" ? "0%" : g.lblFmt || nfEje)}" sourceLinked="0"/><c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${txt(900, "22302A", true)}${pos ? `<c:dLblPos val="${pos}"/>` : ""}<c:showLegendKey val="0"/><c:showVal val="${extra === "pct" ? 0 : 1}"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="${extra === "pct" ? 1 : 0}"/><c:showBubbleSize val="0"/>${extra === "pct" ? '<c:showLeaderLines val="1"/>' : ""}</c:dLbls>`;
  let plot;
  if (g.tipo === "barra") {
    const s = g.series[0], ptos = (s.colores || []).map((col, i) => `<c:dPt><c:idx val="${i}"/><c:invertIfNegative val="0"/><c:bubble3D val="0"/>${fill(col)}</c:dPt>`).join("");
    plot = `<c:barChart><c:barDir val="${g.horizontal ? "bar" : "col"}"/><c:grouping val="clustered"/><c:varyColors val="0"/>${g.series.map((s, i) => `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${xe(s.nombre)}</c:v></c:tx>${fill(s.color || "2F7B5A")}<c:invertIfNegative val="0"/>${i === 0 ? ptos : ""}${g.etiquetas ? dLbls(g.horizontal ? "outEnd" : "outEnd") : ""}${cat(s)}${val(s)}</c:ser>`).join("")}<c:gapWidth val="${g.gap || 60}"/><c:axId val="5001"/><c:axId val="5002"/></c:barChart>${ejes}`;
  } else if (g.tipo === "linea") {
    plot = `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${g.series.map((s, i) => `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${xe(s.nombre)}</c:v></c:tx><c:spPr><a:ln w="28575" cap="rnd"><a:solidFill><a:srgbClr val="${s.color || "2F7B5A"}"/></a:solidFill><a:round/></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr><a:solidFill><a:srgbClr val="${s.color || "2F7B5A"}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr></c:marker>${cat(s)}${val(s)}<c:smooth val="0"/></c:ser>`).join("")}<c:marker val="1"/><c:axId val="5001"/><c:axId val="5002"/></c:lineChart>${ejes}`;
  } else {
    const s = g.series[0];
    plot = `<c:doughnutChart><c:varyColors val="1"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>${xe(s.nombre)}</c:v></c:tx>${(s.colores || []).map((col, i) => `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${col}"/></a:solidFill><a:ln w="12700"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:dPt>`).join("")}${dLbls("", "pct")}${cat(s)}${val(s)}</c:ser><c:firstSliceAng val="0"/><c:holeSize val="55"/></c:doughnutChart>`;
  }
  const leyenda = g.leyenda ? `<c:legend><c:legendPos val="${g.leyenda}"/><c:overlay val="0"/>${txt(900, "22302A")}</c:legend>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:roundedCorners val="0"/><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1100" b="1"/></a:pPr><a:r><a:rPr lang="es-CO" sz="1100" b="1"><a:solidFill><a:srgbClr val="1F5C43"/></a:solidFill><a:latin typeface="Calibri"/></a:rPr><a:t>${xe(g.titulo)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>${plot}</c:plotArea>${leyenda}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:srgbClr val="D5E0D9"/></a:solidFill></a:ln></c:spPr>${txt(900, "22302A")}</c:chartSpace>`;
}
// agrega los gráficos a la hoja n.º hoja (1 = la primera) y arregla los vínculos internos que ExcelJS escribe como externos
async function posprocesarXlsx(buf, hoja, graficos) {
  await lib("JSZip"); const z = await window.JSZip.loadAsync(buf);
  for (const f of Object.keys(z.files).filter(f => /^xl\/worksheets\/sheet\d+\.xml$/.test(f))) {
    const s = await z.file(f).async("string"), s2 = s.replace(/<hyperlink ref="([A-Z]+\d+)" r:id="rId\d+" location="#([^"]+)"\/>/g, '<hyperlink ref="$1" location="$2"/>');
    if (s2 === s) continue; z.file(f, s2);
    const rp = f.replace("worksheets/", "worksheets/_rels/") + ".rels", rf = z.file(rp);   // y sus relaciones «externas» que ya nadie usa
    if (rf) z.file(rp, (await rf.async("string")).replace(/<Relationship Id="rId\d+" Type="[^"]+\/hyperlink" Target="#[^"]*" TargetMode="External"\/>/g, ""));
  }
  if (graficos.length) {
    const rels = await z.file(`xl/worksheets/_rels/sheet${hoja}.xml.rels`).async("string"), m = rels.match(/Target="\.\.\/drawings\/(drawing\d+\.xml)"/);
    if (!m) throw new Error("La hoja de resumen no tiene dibujo para los gráficos.");
    const dPath = "xl/drawings/" + m[1], rPath = "xl/drawings/_rels/" + m[1] + ".rels";
    let dXml = await z.file(dPath).async("string"), rXml = z.file(rPath) ? await z.file(rPath).async("string") : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
    let ct = await z.file("[Content_Types].xml").async("string"), anclas = "";
    graficos.forEach((g, i) => {
      const n = i + 1, rid = "rIdOliG" + n;
      z.file(`xl/charts/chart${n}.xml`, chartXML(g));
      rXml = rXml.replace("</Relationships>", `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${n}.xml"/></Relationships>`);
      ct = ct.replace("</Types>", `<Override PartName="/xl/charts/chart${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`);
      anclas += `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${g.desde[0]}</xdr:col><xdr:colOff>60000</xdr:colOff><xdr:row>${g.desde[1]}</xdr:row><xdr:rowOff>60000</xdr:rowOff></xdr:from><xdr:to><xdr:col>${g.hasta[0]}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${g.hasta[1]}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${1000 + n}" name="${xe(g.titulo)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="${rid}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
    });
    z.file(dPath, dXml.replace("</xdr:wsDr>", anclas + "</xdr:wsDr>")); z.file(rPath, rXml); z.file("[Content_Types].xml", ct);
  }
  return z.generateAsync({type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", compression: "DEFLATE"});
}

/* ---------- el libro ---------- */
async function excelFinanciero(d) {
  await lib("ExcelJS"); const wb = nuevoLibro(), a = d.a, b = d.b;
  // datos (las mismas filas para las hojas, los valores guardados y los gráficos)
  const V = filasVentasFin(d), G = filasGastosFin(d), M = filasMovCajaFin(d), R = resultadoDe(V, G, M, a, b), Ant = resultadoAnterior(a, b), eq = equilibrioFin(R, a, b, V), L = liquidez({a, b});
  const al = alertasFin(d, R, Ant, eq), titulo = "Resumen del negocio";
  wb._logo = wb.addImage({base64: logoOLI(), extension: "png"}); wb._logoW = 93;

  // el orden de las hojas es el de creación: primero lo general
  const wsR = wb.addWorksheet(H_RES, {properties: {tabColor: {argb: XC.verde}}, views: [{showGridLines: false, zoomScale: 90}], pageSetup: {paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 1, margins: {left: .3, right: .3, top: .4, bottom: .4, header: .2, footer: .2}}});
  const wsA = wb.addWorksheet(H_AN, {properties: {tabColor: {argb: XS.menta2}}, views: [{showGridLines: false}], pageSetup: {paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0}});

  // ---- detalle ----
  const hV = hojaTabla(wb, "Ventas", "Ventas detalladas (una fila por producto vendido)", COLS_FIN.ventas, V, d, {notas: ["«Cuenta como venta» vale 1 en la primera línea de cada venta confirmada: así se cuentan transacciones. Las anuladas aparecen pero no suman en el resumen (filtra Estado = Confirmada). La fila TOTAL suma lo que esté visible con los filtros.", "«Pago: Por confirmar» = QR, Nequi o Daviplata que nadie ha confirmado en la cuenta. OLI no registra ventas a crédito.", NOTA_COSTOS, NOTA_FILTRO(d)].filter(Boolean)});
  const TV = tDe(hV); volver(hV);
  const hP = hojaTabla(wb, "Productos", "Productos y rentabilidad (todo el período descargado)", COLS.rent, d.rent, d, {notas: [NOTA_COSTOS, "Ordenado de más a menos utilidad bruta. Margen en rojo: menor a la mitad de tu margen objetivo (" + pct(margenObjetivo()) + ")."]}); volver(hP);
  { const o = hP._oli, iM = o.cols.findIndex(c => c.k === "margen") + 1; if (d.rent.length) { const ref = colL(iM) + o.r0 + ":" + colL(iM) + o.r1; hP.addConditionalFormatting({ref, rules: [{type: "cellIs", operator: "lessThan", priority: 1, formulae: [String(margenObjetivo() * 0.6)], style: {font: {color: {argb: XC.rojo}, bold: true}, fill: relleno(XC.rojoC)}}, {type: "cellIs", operator: "greaterThanOrEqual", priority: 2, formulae: [String(margenObjetivo())], style: {font: {color: {argb: XC.verdeO}, bold: true}}}]}); } }
  const hI = hojaTabla(wb, "Inventario", "Inventario y movimientos", COLS.inventario, d.inv, d, {leyenda: ["NORMAL", "BAJO", "AGOTADO", "RIESGO", "SIN CONTAR"], notas: ["Inventario inicial = final − entradas + salidas − ajustes. Valor a costo actual."]}); volver(hI, 4, 8);
  { let y = hI._oli.totRow + 4 + 2; y = bloque(hI, y, "Movimientos de inventario (entradas, conteos, producción)", COLS.ajustes, d.ajustes, {vacio: "Sin entradas, conteos ni producción en el periodo."}).next; bloque(hI, y, "Pérdidas y mermas", COLS.mermas, d.mermas, {vacio: "Sin pérdidas anotadas en el periodo."}); }
  const provs = Object.values(d.compras.reduce((m, c) => { const k = c.proveedor || "Sin proveedor", o = m[k] = m[k] || {proveedor: k, compras: new Set(), recibido: 0, pendiente: 0}; o.compras.add(c.id); o.recibido += c.total || 0; o.pendiente += c.pedido || 0; return m; }, {})).map(o => Object.assign(o, {n: o.compras.size}));
  const hC = hojaTabla(wb, "Compras", "Compras y proveedores", COLS.compras, d.compras, d, {notas: ["Las compras de mercancía no son gasto: entran al inventario y se vuelven costo cuando se venden."]}); volver(hC);
  const bProv = bloque(hC, (d.compras.length ? hC._oli.totRow : hC._oli.r0) + 4, "Por proveedor", [{h: "Proveedor", k: "proveedor"}, {h: "Compras", k: "n", t: "int", tot: 1}, {h: "Recibido", k: "recibido", t: "money", tot: 1}, {h: "Pedido sin recibir", k: "pendiente", t: "money", tot: 1}], provs);
  { bloque(hC, bProv.next + 1, "Compras recomendadas (lo que OLI sugiere pedir para 7 días)", COLS.recomendacion, d.rec, {vacio: "OLI no recomienda compras por ahora."}); }
  const hG = hojaTabla(wb, "Gastos", "Gastos detallados", COLS_FIN.gastos, G, d, {notas: ["«Cómo cuenta»: materia prima ya está en el costo de lo vendido (no se resta otra vez); lo incluido en los gastos fijos del plan no se suma otra vez a ese plan; lo demás es gasto del período. Los pagos hechos desde la caja también están aquí (Estado = Desde caja)."]});
  const TG = tDe(hG); volver(hG);
  const gcat = Object.values(G.filter(g => g.trat !== TRAT.mp).reduce((m, g) => { const o = m[g.categoria || "Otros"] = m[g.categoria || "Otros"] || {cat: g.categoria || "Otros", v: 0}; o.v += g.total; return m; }, {})).sort((x, y) => y.v - x.v);
  const hK = hojaTabla(wb, "Caja", "Caja y métodos de pago", COLS.cajas, d.cajas, d, {notas: ["«Diferencia final» es lo que queda después de lo que el administrador revisó. Las cajas abiertas no tienen conteo."]}); volver(hK);
  let yK = (d.cajas.length ? hK._oli.totRow : hK._oli.r0) + 4;
  const medios = Object.values(V.filter(r => r.estado === "Confirmada").reduce((m, r) => { const o = m[r.metodo || "Otro"] = m[r.metodo || "Otro"] || {m: r.metodo || "Otro", v: 0, pend: 0}; o.v += r.total; if (r.pend) o.pend += r.total; return m; }, {})).sort((x, y) => y.v - x.v);
  yK = bloque(hK, yK, "Ventas por método de pago", [{h: "Método de pago", k: "m"}, {h: "Ventas", f: r => fx(`SUMIFS(${rCol(TV, "total")},${rCol(TV, "metodo")},"${qx(r.m)}",${rCol(TV, "estado")},"Confirmada",${enFechas(TV)})`, r.v), t: "money", tot: 1}, {h: "Por confirmar", f: r => fx(`SUMIFS(${rCol(TV, "total")},${rCol(TV, "metodo")},"${qx(r.m)}",${rCol(TV, "pago")},"Por confirmar",${enFechas(TV)})`, r.pend), t: "money", tot: 1}], medios).next;
  const bM = bloque(hK, yK, "Movimientos de caja (entradas, salidas y pagos)", COLS_FIN.movCaja, M, {vacio: "Sin movimientos de caja en el periodo."}), TM = bM.T;

  // ---- estado de resultados (fórmulas sobre el detalle) ----
  const wsE = hojaBase(wb, H_ER, "Estado de resultados (estimado)", d, 6, 0); volver(wsE);
  [15, 46, 18, 64].forEach((w, i) => wsE.getColumn(i + 1).width = w); wsE.getColumn(6).width = 26; wsE.getColumn(7).width = 16;
  const ER = {brutas: 7, desc: 8, devol: 9, netas: 10, costo: 11, bruta: 12, mb: 13, gastos: 14, reg: 15, fijos: 16, neta: 17, mn: 18, gtot: 20, n: 21, ticket: 22, pend: 23};
  const E = k => QS(H_ER) + "!$C$" + ER[k];
  const conf = `${rCol(TV, "estado")},"Confirmada",${enFechas(TV)}`;
  const nfDias = `(${HASTA}-${DESDE}+1)`, fijosForm = `${totalFijos()}*${nfDias}/DAY(EOMONTH(${DESDE},0))`;
  const lineasER = [
    ["brutas", "Ventas brutas (antes de descuentos)", fx(`SUMIFS(${rCol(TV, "total")},${conf})+SUMIFS(${rCol(TV, "descuento")},${conf})`, R.brutas), "Ventas → Total + Descuento, solo confirmadas y dentro de las fechas"],
    ["desc", "− Descuentos", fx(`SUMIFS(${rCol(TV, "descuento")},${conf})`, R.desc), "Ventas → Descuento"],
    ["devol", "− Devoluciones a clientes", fx(`SUMIFS(${rCol(TM, "valor")},${rCol(TM, "clase")},"Devolución a cliente",${enFechas(TM)})`, R.devol), "Caja → Movimientos (plata devuelta de ventas de cajas ya cerradas)"],
    ["netas", "= Ventas netas", fx(`C${ER.brutas}-C${ER.desc}-C${ER.devol}`, R.netas), "Lo que de verdad se vendió", true],
    ["costo", "− Costo de los productos vendidos", fx(`SUMIFS(${rCol(TV, "costo")},${conf})`, R.costo), "Ventas → Costo (costo registrado de cada producto el día de la venta)"],
    ["bruta", "= Utilidad bruta", fx(`C${ER.netas}-C${ER.costo}`, R.bruta), "Lo que deja vender, antes de gastos", true],
    ["mb", "Margen bruto", fx(`IF(C${ER.netas}=0,0,C${ER.bruta}/C${ER.netas})`, R.mb), "Utilidad bruta ÷ ventas netas"],
    ["gastos", "− Gastos registrados (sin materia prima)", fx(`SUMIFS(${rCol(TG, "total")},${rCol(TG, "trat")},"<>${TRAT.mp}",${enFechas(TG)})`, R.gastosReg), "Gastos → Total (la materia prima ya está en el costo)"],
    ["reg", "= Resultado con lo registrado", fx(`C${ER.bruta}-C${ER.gastos}`, R.reg), "Es la «Utilidad estimada» de Dinero en la app", true],
    ["fijos", "− Gastos fijos del plan aún no registrados", fx(`MAX(0,${fijosForm}-SUMIFS(${rCol(TG, "total")},${rCol(TG, "trat")},"${TRAT.fijo}",${enFechas(TG)}))`, R.fijosPend), totalFijos() ? "Plan de " + fmt(totalFijos()) + " al mes × días del período ÷ días del mes, menos lo de esas categorías que ya se registró" : "No hay gastos fijos en el plan (Ajustes)"],
    ["neta", "= Utilidad neta estimada", fx(`C${ER.reg}-C${ER.fijos}`, R.neta), "Estimación de gestión: no es la utilidad contable oficial", true],
    ["mn", "Margen neto estimado", fx(`IF(C${ER.netas}=0,0,C${ER.neta}/C${ER.netas})`, R.mn), "Utilidad neta estimada ÷ ventas netas"]
  ];
  celda(wsE, "B6", "Concepto", {b: true, color: XC.verdeO, fill: XC.menta}); celda(wsE, "C6", "Valor", {b: true, color: XC.verdeO, fill: XC.menta, h: "right"}); celda(wsE, "D6", "De dónde sale", {b: true, color: XC.verdeO, fill: XC.menta});
  for (const [k, t, v, n, fuerte] of lineasER) { const r = ER[k]; celda(wsE, "B" + r, t, {b: !!fuerte, size: fuerte ? 11 : 10}); const c = celda(wsE, "C" + r, v, {b: !!fuerte, size: fuerte ? 11 : 10, nf: k === "mb" || k === "mn" ? XF.pct : XF.money, h: "right"}); celda(wsE, "D" + r, n, {color: XC.gris, size: 9, wrap: true}); if (fuerte) ["B", "C", "D"].forEach(x => { wsE.getCell(x + r).fill = relleno(XC.crema); wsE.getCell(x + r).border = {top: {style: "thin", color: {argb: XC.borde}}}; }); c.numFmt = k === "mb" || k === "mn" ? XF.pct : XF.money; }
  const extras = [["gtot", "Gastos totales del período", fx(`C${ER.gastos}+C${ER.fijos}`, R.gTot), "Registrados + fijos del plan aún no registrados", XF.money], ["n", "Número de ventas", fx(`SUMIFS(${rCol(TV, "cuenta")},${conf})`, R.n), "Ventas → «Cuenta como venta»", XF.int], ["ticket", "Ticket promedio", fx(`IF(C${ER.n}=0,0,(C${ER.brutas}-C${ER.desc})/C${ER.n})`, R.ticket), "Ventas (sin devoluciones) ÷ número de ventas", XF.money], ["pend", "Pagos digitales por confirmar", fx(`SUMIFS(${rCol(TV, "total")},${rCol(TV, "pago")},"Por confirmar",${enFechas(TV)})`, R.pend), "Ventas → Pago = Por confirmar (todavía no es plata segura)", XF.money]];
  for (const [k, t, v, n, nf] of extras) { const r = ER[k]; celda(wsE, "B" + r, t); celda(wsE, "C" + r, v, {nf, h: "right"}); celda(wsE, "D" + r, n, {color: XC.gris, size: 9, wrap: true}); }
  wsE.addConditionalFormatting({ref: `C${ER.bruta}:C${ER.neta}`, rules: [{type: "cellIs", operator: "lessThan", priority: 1, formulae: ["0"], style: {font: {color: {argb: XC.rojo}, bold: true}}}]});
  let yE = 25; yE = lineaTexto(wsE, yE, "Esta es una estimación de gestión hecha con lo que está registrado en OLI. No reemplaza los estados financieros que prepara el contador.", {color: XC.gris, font: {italic: true, size: 9}, h: 28, span: 4});
  if (R.sinCosto) lineaTexto(wsE, yE, "ATENCIÓN: " + R.sinCosto + " líneas vendidas no tienen costo registrado; el costo sale más bajo y la utilidad más alta de lo real.", {color: XC.rojo, font: {bold: true, size: 10}, span: 4});
  // datos del gráfico «¿A dónde se va la plata?» (celdas conectadas al estado)
  celda(wsE, "F6", "Para el gráfico del resumen", {b: true, color: XC.gris, size: 9});
  const DIST = [["Ventas netas", `C${ER.netas}`, R.netas], ["Costo de lo vendido", `C${ER.costo}`, R.costo], ["Gastos", `C${ER.gtot}`, R.gTot], ["Resultado", `C${ER.neta}`, R.neta]];
  DIST.forEach(([l, f, v], i) => { celda(wsE, "F" + (7 + i), l, {size: 9}); celda(wsE, "G" + (7 + i), fx(f, v), {size: 9, nf: XF.money}); });

  // ---- equilibrio y escenarios ----
  const wsQ = hojaBase(wb, H_EQ, "Punto de equilibrio y escenarios", d, 5, 0); volver(wsQ);
  [42, 18, 18, 18, 40].forEach((w, i) => wsQ.getColumn(i + 1).width = w);
  let y = 6; seccion(wsQ, y++, "Gastos fijos del mes (plan en Ajustes)", 5);
  const plan = gastosFijosPlan().filter(g => g && (Number(g.v) || 0) > 0), y0p = y;
  if (plan.length) for (const g of plan) { celda(wsQ, "A" + y, g.n || "Gasto fijo"); celda(wsQ, "B" + y, Number(g.v) || 0, {nf: XF.money}); y++; } else { celda(wsQ, "A" + y, "No hay gastos fijos en el plan: escríbelos en OLI → Ajustes para calcular el punto de equilibrio.", {i: true, color: XC.gris}); y++; }
  const rFij = y; celda(wsQ, "A" + y, "Total gastos fijos del mes", {b: true}); celda(wsQ, "B" + y, plan.length ? fx(`SUM(B${y0p}:B${y - 1})`, eq.fijos) : 0, {b: true, nf: XF.money}); y += 2;
  seccion(wsQ, y++, "Margen de contribución (con lo del período elegido)", 5);
  const Q = {};
  const filaQ = (k, t, v, nf, nota) => { Q[k] = y; celda(wsQ, "A" + y, t); celda(wsQ, "B" + y, v, {nf, h: "right"}); if (nota) celda(wsQ, "C" + y, nota, {color: XC.gris, size: 9}); wsQ.mergeCells(y, 3, y, 5); y++; };
  filaQ("netas", "Ventas netas", fx(E("netas"), R.netas), XF.money, "Estado de resultados");
  filaQ("costo", "Costo de lo vendido", fx(E("costo"), R.costo), XF.money, "Estado de resultados");
  filaQ("var", "Gastos variables (los que no son fijos ni materia prima)", fx(`SUMIFS(${rCol(TG, "total")},${rCol(TG, "trat")},"${TRAT.var}",${enFechas(TG)})`, R.gVar), XF.money, "Gastos → «Gasto del período»");
  filaQ("contrib", "Contribución (lo que queda para pagar los fijos)", fx(`B${Q.netas}-B${Q.costo}-B${Q.var}`, eq.contrib), XF.money);
  filaQ("mc", "Margen de contribución", fx(`IF(B${Q.netas}=0,0,B${Q.contrib}/B${Q.netas})`, eq.mc || 0), XF.pct, "De cada $100 vendidos, quedan esos pesos para los gastos fijos");
  y++; seccion(wsQ, y++, "Punto de equilibrio mensual", 5);
  filaQ("pe", "Ventas del mes necesarias para no perder", fx(`IF(OR(B${rFij}=0,B${Q.mc}<=0),0,B${rFij}/B${Q.mc})`, eq.pe || 0), XF.money, eq.pe == null ? (eq.fijos ? "Con este margen no se alcanza: cada venta no deja para los fijos" : "Falta el plan de gastos fijos") : "Gastos fijos ÷ margen de contribución");
  filaQ("ventasMes", "Ventas del mes en el período", eq.mes ? fx(E("netas"), R.netas) : "Elige un período que empiece el día 1", eq.mes ? XF.money : null, eq.mes ? "Del 1 al " + diaCorto(b) : "");
  filaQ("avance", "Avance hacia el punto de equilibrio", eq.mes ? fx(`IF(B${Q.pe}=0,0,B${Q.ventasMes}/B${Q.pe})`, eq.avancePE || 0) : "–", eq.mes ? XF.pct : null);
  filaQ("falta", "Falta para el punto de equilibrio", eq.mes ? fx(`MAX(0,B${Q.pe}-B${Q.ventasMes})`, eq.falta || 0) : "–", eq.mes ? XF.money : null);
  filaQ("quedan", "Días que quedan del mes", fx(`EOMONTH(${HASTA},0)-${HASTA}`, eq.quedan), XF.int, "Después de «Hasta»");
  filaQ("porDia", "Ventas diarias necesarias el resto del mes", eq.mes ? fx(`IF(B${Q.quedan}=0,0,B${Q.falta}/B${Q.quedan})`, eq.necesariaDia || 0) : "–", eq.mes ? XF.money : null);
  filaQ("prim", "Primer día con ventas en el período", fx(`IFERROR(IF(COUNTIFS(${conf})=0,${DESDE},_xlfn.MINIFS(${rCol(TV, "fecha")},${conf})),${DESDE})`, xFecha(eq.primera)), XF.fecha, "Si el negocio abrió a mitad del período, cuenta desde ese día");
  filaQ("diasOp", "Días con operación", fx(`${HASTA}-B${Q.prim}+1`, eq.diasOp), XF.int);
  filaQ("ritmo", "Ritmo actual (ventas netas por día con operación)", fx(`IF(B${Q.diasOp}<=0,0,B${Q.netas}/B${Q.diasOp})`, eq.ritmoDia), XF.money);
  y++; seccion(wsQ, y++, "Meta de ventas", 5);
  filaQ("metaDia", "Meta diaria (Inicio → Meta de hoy)", eq.metaDia || "Sin meta definida", eq.metaDia ? XF.money : null, eq.metaDia ? "" : "Defínela en OLI para ver el cumplimiento");
  filaQ("metaPer", "Meta del período", eq.metaDia ? fx(`B${Q.metaDia}*${nfDias}`, eq.metaDia * R.dias) : "–", eq.metaDia ? XF.money : null);
  filaQ("cumple", "Cumplimiento de la meta", eq.metaDia ? fx(`IF(B${Q.metaPer}=0,0,B${Q.netas}/B${Q.metaPer})`, eq.avanceMeta || 0) : "–", eq.metaDia ? XF.pct : null);
  filaQ("metaMes", "Meta del mes", eq.metaDia ? fx(`B${Q.metaDia}*DAY(EOMONTH(${HASTA},0))`, eq.metaMes) : "–", eq.metaDia ? XF.money : null);
  y++; seccion(wsQ, y++, "Progreso del mes (para el gráfico del resumen)", 5); const yPg = y;
  const PROG = [["Ventas del mes", eq.mes ? `B${Q.ventasMes}` : null, eq.mes ? R.netas : 0], ["Punto de equilibrio", `B${Q.pe}`, eq.pe || 0]].concat(eq.metaDia ? [["Meta del mes", `B${Q.metaMes}`, eq.metaMes || 0]] : []);
  PROG.forEach(([l, f, v]) => { celda(wsQ, "A" + y, l); celda(wsQ, "B" + y, f ? fx(f, v) : 0, {nf: XF.money}); y++; });
  y++; seccion(wsQ, y++, "Escenarios del mes (cambia las ventas en la columna B para probar)", 5);
  ["Escenario", "Ventas del mes", "Contribución", "Gastos fijos", "Resultado estimado"].forEach((t, i) => celda(wsQ, colL(i + 1) + y, t, {b: true, color: XC.verdeO, fill: XC.menta, h: i ? "right" : "left"})); y++;
  const esc = [["Al ritmo actual", `B${Q.ritmo}*DAY(EOMONTH(${HASTA},0))`, eq.proyMes], ["Ritmo actual + 20 %", `B${Q.ritmo}*DAY(EOMONTH(${HASTA},0))*1.2`, eq.proyMes * 1.2], ["Ritmo actual − 20 %", `B${Q.ritmo}*DAY(EOMONTH(${HASTA},0))*0.8`, eq.proyMes * 0.8], ["En el punto de equilibrio", `B${Q.pe}`, eq.pe || 0]].concat(eq.metaDia ? [["Cumpliendo la meta del mes", `B${Q.metaMes}`, eq.metaMes]] : []);
  for (const [t, f, v] of esc) { const mc = eq.mc || 0; celda(wsQ, "A" + y, t); celda(wsQ, "B" + y, fx(f, v), {nf: XF.money}); celda(wsQ, "C" + y, fx(`B${y}*B${Q.mc}`, v * mc), {nf: XF.money}); celda(wsQ, "D" + y, fx(`B${rFij}`, eq.fijos), {nf: XF.money}); celda(wsQ, "E" + y, fx(`C${y}-D${y}`, v * mc - eq.fijos), {nf: XF.money, b: true}); y++; }
  wsQ.addConditionalFormatting({ref: `E${y - esc.length}:E${y - 1}`, rules: [{type: "cellIs", operator: "lessThan", priority: 1, formulae: ["0"], style: {font: {color: {argb: XC.rojo}, bold: true}}}, {type: "cellIs", operator: "greaterThan", priority: 2, formulae: ["0"], style: {font: {color: {argb: XC.verdeO}, bold: true}}}]});
  lineaTexto(wsQ, y + 1, "Los escenarios suponen el mismo margen de contribución del período. «Al ritmo actual» = ventas netas por día del período × días del mes: es una cuenta simple, no una predicción.", {color: XC.gris, font: {italic: true, size: 9}, h: 28, span: 5});

  // ---- validaciones y trazabilidad ----
  const fz = finanzas(a, b);
  const wsV = hojaBase(wb, H_VAL, "Validaciones, inconsistencias y trazabilidad", d, 5, 0); volver(wsV);
  [44, 18, 18, 14, 60].forEach((w, i) => wsV.getColumn(i + 1).width = w);
  y = 6; seccion(wsV, y++, "Controles automáticos", 5);
  ["Control", "En este archivo", "En OLI (app)", "Resultado", "Qué significa"].forEach((t, i) => celda(wsV, colL(i + 1) + y, t, {b: true, color: XC.verdeO, fill: XC.menta})); y++;
  const ctl = [["Ventas netas = ventas de Dinero − devoluciones", fx(E("netas"), R.netas), fz.ventas - fz.devol, "Las ventas del detalle son las mismas que ve la app"], ["Costo de lo vendido = costo de Dinero", fx(E("costo"), R.costo), Math.round(fz.cogs), "El costo de cada línea sale del costo registrado ese día"], ["Resultado con lo registrado = utilidad de Dinero", fx(E("reg"), R.reg), Math.round(fz.utilidad), "Ventas − costo − gastos registrados − devoluciones"], ["Número de ventas = ventas de Dinero", fx(E("n"), R.n), fz.n, "Transacciones confirmadas"]];
  for (const [t, f, app, n] of ctl) { const nf = /Número/.test(t) ? XF.int : XF.money; celda(wsV, "A" + y, t); celda(wsV, "B" + y, f, {nf}); celda(wsV, "C" + y, app, {nf}); celda(wsV, "D" + y, fx(`IF(ABS(B${y}-C${y})<=1,"Cuadra","No cuadra")`, Math.abs(f.result - app) <= 1 ? "Cuadra" : "No cuadra"), {b: true, h: "center"}); celda(wsV, "E" + y, n, {color: XC.gris, size: 9}); y++; }
  celda(wsV, "A" + y, "Las fechas «Desde/Hasta» del resumen están dentro del período descargado", {wrap: true}); celda(wsV, "D" + y, fx(`IF(AND(${DESDE}>=DATE(${a.slice(0, 4)},${+a.slice(5, 7)},${+a.slice(8)}),${HASTA}<=DATE(${b.slice(0, 4)},${+b.slice(5, 7)},${+b.slice(8)}),${DESDE}<=${HASTA}),"Cuadra","Fuera del período")`, "Cuadra"), {b: true, h: "center"}); celda(wsV, "E" + y, "Si se sale, faltan registros: descarga otro período desde OLI", {color: XC.gris, size: 9}); y++;
  const nCtl = y - 1; wsV.addConditionalFormatting({ref: `D8:D${nCtl}`, rules: [{type: "containsText", operator: "containsText", text: "Cuadra", priority: 1, style: {font: {color: {argb: XC.verdeO}, bold: true}, fill: relleno(XC.okC)}}, {type: "notContainsText", operator: "notContains", text: "Cuadra", priority: 2, style: {font: {color: {argb: XC.rojo}, bold: true}, fill: relleno(XC.rojoC)}}]});
  y++; seccion(wsV, y++, "Inconsistencias de los datos", 5);
  if (!d.integ.length) { celda(wsV, "A" + y, "Sin inconsistencias detectadas en el período.", {color: XC.verdeO, b: true}); y++; }
  for (const x of d.integ) { celda(wsV, "A" + y, x.t, {color: x.sev === "bad" ? XC.rojo : XC.amb, b: true, wrap: true}); celda(wsV, "B" + y, x.n, {nf: XF.int}); wsV.mergeCells(y, 3, y, 5); celda(wsV, "C" + y, x.d || "", {color: XC.gris, size: 9, wrap: true}); y++; }
  for (const x of d.control) { celda(wsV, "A" + y, "Control: " + x.t, {wrap: true}); celda(wsV, "D" + y, x.ok ? "Cuadra" : "No cuadra", {b: true, h: "center", color: x.ok ? XC.verdeO : XC.rojo}); y++; }
  y++; seccion(wsV, y++, "Trazabilidad: de dónde sale cada cifra del resumen", 5);
  ["Indicador", "Valor", "Hoja", "", "Cómo se calcula"].forEach((t, i) => celda(wsV, colL(i + 1) + y, t, {b: true, color: XC.verdeO, fill: XC.menta})); y++;
  const traz = [["Ventas netas", "netas", "Ventas", "Total + descuento − descuento − devoluciones, solo confirmadas, entre Desde y Hasta"], ["Costo de lo vendido", "costo", "Ventas", "Suma de la columna Costo de las ventas confirmadas"], ["Utilidad bruta", "bruta", H_ER, "Ventas netas − costo"], ["Gastos totales", "gtot", "Gastos", "Gastos registrados (sin materia prima) + gastos fijos del plan aún no registrados"], ["Utilidad neta estimada", "neta", H_ER, "Resultado con lo registrado − gastos fijos pendientes"], ["Pagos por confirmar", "pend", "Ventas", "Columna Pago = Por confirmar"]];
  for (const [t, k, h, c] of traz) { celda(wsV, "A" + y, t); celda(wsV, "B" + y, fx(E(k), R[{netas: "netas", costo: "costo", bruta: "bruta", gtot: "gTot", neta: "neta", pend: "pend"}[k]]), {nf: XF.money}); const x = wsV.getCell("C" + y); x.value = ir(h); x.font = {size: 10, underline: true, color: {argb: XC.verde}}; celda(wsV, "E" + y, c, {color: XC.gris, size: 9, wrap: true}); y++; }

  // ---- análisis (fórmulas por día, semana, mes y categoría) ----
  hojaAnalisis(wsA, wb, d, V, G, R, Ant, TV, TG, gcat, E);

  // ---- resumen (la primera hoja) ----
  const charts = hojaResumenFin(wsR, wb, d, R, Ant, eq, L, al, E, wsA, {dist: DIST, prog: PROG, yPg});

  return posprocesarXlsx(await wb.xlsx.writeBuffer(), 1, charts);
}

function hojaAnalisis(ws, wb, d, V, G, R, Ant, TV, TG, gcat, E) {
  ws.getColumn(1).width = 16; for (let i = 2; i <= 9; i++) ws.getColumn(i).width = 15;
  try { ws.addImage(wb._logo, {tl: {col: 0.1, row: 0.1}, ext: {width: 96, height: 32}}); } catch (e) { /* sin logo */ }
  fusion(ws, 1, 2, 1, 9, "Análisis del negocio", {b: true, size: 15}); ws.getRow(1).height = 28;
  fusion(ws, 2, 1, 2, 9, "Período: " + periodoDoc(d.a, d.b) + "   ·   Las cifras siguen las fechas «Desde» y «Hasta» del resumen", {b: true, size: 10, color: XC.verdeO});
  volver(ws, 3);
  const conf = `${rCol(TV, "estado")},"Confirmada"`, sumV = (k, extra) => `SUMIFS(${rCol(TV, k)},${conf}${extra})`, entre = (a, b) => `,${rCol(TV, "fecha")},">="&MAX(${DESDE},${a}),${rCol(TV, "fecha")},"<="&MIN(${HASTA},${b})`;
  const dt = f => `DATE(${f.slice(0, 4)},${+f.slice(5, 7)},${+f.slice(8)})`, ok = V.filter(r => r.estado === "Confirmada");
  const sumR = (f, a, b) => sum(ok.filter(r => r.fecha >= a && r.fecha <= b), f);
  const cabeza = (y, cols) => { cols.forEach((t, i) => celda(ws, colL(i + 1) + y, t, {b: true, color: XC.verdeO, fill: XC.menta, h: i ? "right" : "left", wrap: true})); ws.getRow(y).height = 28; return y + 1; };
  const filaNum = (y, vals) => vals.forEach(([v, nf], i) => { const c = celda(ws, colL(i + 1) + y, v, {nf, h: i ? "right" : "left"}); c.border = {bottom: {style: "hair", color: {argb: XC.borde}}}; });
  // por día (también alimenta el gráfico de ventas diarias)
  let y = 5; seccion(ws, y++, "Por día", 9); y = cabeza(y, ["Fecha", "Día", "Ventas (#)", "Ventas netas*", "Costo", "Utilidad bruta", "Ticket promedio", "Etiqueta"]);
  const dias = d.dias.map(x => x.fecha), y0 = y, unMes = d.a.slice(0, 7) === d.b.slice(0, 7), etq = f => unMes ? String(+f.slice(8)) : diaEje(f);
  for (const f of dias) {
    const n = sumR(r => r.cuenta, f, f), v = sumR(r => r.total, f, f), c = sumR(r => r.costo || 0, f, f), w = `,${rCol(TV, "fecha")},${dt(f)}`;
    filaNum(y, [[xFecha(f), XF.fecha], [DOW[dowOf(f)], null], [fx(sumV("cuenta", w), n), XF.int], [fx(sumV("total", w), v), XF.money], [fx(sumV("costo", w), c), XF.money], [fx(`D${y}-E${y}`, v - c), XF.money], [fx(`IF(C${y}=0,0,D${y}/C${y})`, n ? v / n : 0), XF.money], [etq(f), null]]);
    y++;
  }
  const yDia1 = y - 1;
  if (dias.length) { filaNum(y, [["TOTAL", null], ["", null], [fx(`SUM(C${y0}:C${yDia1})`, R.n), XF.int], [fx(`SUM(D${y0}:D${yDia1})`, sum(ok, r => r.total)), XF.money], [fx(`SUM(E${y0}:E${yDia1})`, R.costo), XF.money], [fx(`D${y}-E${y}`, sum(ok, r => r.total) - R.costo), XF.money], [fx(`IF(C${y}=0,0,D${y}/C${y})`, R.ticket), XF.money], ["", null]]); ["A", "B", "C", "D", "E", "F", "G"].forEach(x => { ws.getCell(x + y).font = {b: true, bold: true, color: {argb: XC.verdeO}}; ws.getCell(x + y).fill = relleno(XC.crema); }); y++; }
  ws.addConditionalFormatting({ref: `D${y0}:D${Math.max(y0, yDia1)}`, rules: [{type: "dataBar", priority: 1, cfvo: [{type: "min"}, {type: "max"}], color: {argb: "FF8CBA9C"}}]});
  lineaTexto(ws, y, "* Por día y por semana, «Ventas netas» es lo cobrado en las ventas confirmadas; las devoluciones de cajas ya cerradas se restan en el Estado de resultados.", {color: XC.gris, font: {italic: true, size: 9}, span: 9}); y += 2;
  ws._dias = {y0, y1: yDia1, n: dias.length, ventas: dias.map(f => sumR(r => r.total, f, f)), etiquetas: dias.map(etq)};
  // por semana (lunes a domingo, recortadas al período)
  seccion(ws, y++, "Por semana", 9); y = cabeza(y, ["Semana", "Desde", "Hasta", "Ventas (#)", "Ventas netas", "Costo", "Utilidad bruta", "Ticket promedio"]);
  const semanas = []; for (let f = d.a; f <= d.b; f = addDays(f, 1)) { const lun = addDays(f, -((dowOf(f) + 6) % 7)), k = lun; if (!semanas.length || semanas[semanas.length - 1].k !== k) semanas.push({k, a: f, b: f}); else semanas[semanas.length - 1].b = f; }
  for (const s of semanas) { const n = sumR(r => r.cuenta, s.a, s.b), v = sumR(r => r.total, s.a, s.b), c = sumR(r => r.costo || 0, s.a, s.b), w = entre(dt(s.a), dt(s.b)); filaNum(y, [["Semana del " + diaEje(s.k), null], [xFecha(s.a), XF.fecha], [xFecha(s.b), XF.fecha], [fx(sumV("cuenta", w), n), XF.int], [fx(sumV("total", w), v), XF.money], [fx(sumV("costo", w), c), XF.money], [fx(`E${y}-F${y}`, v - c), XF.money], [fx(`IF(D${y}=0,0,E${y}/D${y})`, n ? v / n : 0), XF.money]]); y++; }
  y++;
  // por mes (solo si el período toca más de un mes)
  const meses = uniq(d.dias.map(x => x.fecha.slice(0, 7)));
  if (meses.length > 1) { seccion(ws, y++, "Por mes", 9); y = cabeza(y, ["Mes", "Ventas (#)", "Ventas netas", "Costo", "Utilidad bruta"]);
    for (const m of meses) { const a = m < d.a.slice(0, 7) ? d.a : (m + "-01" < d.a ? d.a : m + "-01"), b = lastOfMonth(m + "-01") > d.b ? d.b : lastOfMonth(m + "-01"), w = entre(dt(a), dt(b)), n = sumR(r => r.cuenta, a, b), v = sumR(r => r.total, a, b), c = sumR(r => r.costo || 0, a, b); filaNum(y, [[nombreMes(m), null], [fx(sumV("cuenta", w), n), XF.int], [fx(sumV("total", w), v), XF.money], [fx(sumV("costo", w), c), XF.money], [fx(`C${y}-D${y}`, v - c), XF.money]]); y++; } y++; }
  // comparativo con el período anterior
  seccion(ws, y++, "Comparativo con el período anterior (" + periodoDoc(Ant.a, Ant.b) + ")", 9); y = cabeza(y, ["Indicador", "Este período", "Período anterior", "Cambio", "Cambio %"]);
  const cmp = [["Ventas netas", "netas", "netas"], ["Costo de lo vendido", "costo", "costo"], ["Utilidad bruta", "bruta", "bruta"], ["Gastos totales", "gtot", "gTot"], ["Utilidad neta estimada", "neta", "neta"], ["Número de ventas", "n", "n"], ["Ticket promedio", "ticket", "ticket"]];
  const yc0 = y;
  for (const [t, k, ka] of cmp) { const nf = k === "n" ? XF.int : XF.money, act = R[ka]; filaNum(y, [[t, null], [fx(E(k), act), nf], [Ant.conDatos ? Ant[ka] : "Sin datos", Ant.conDatos ? nf : null], [Ant.conDatos ? fx(`B${y}-C${y}`, act - Ant[ka]) : "–", Ant.conDatos ? nf : null], [Ant.conDatos ? fx(`IF(C${y}=0,"",(B${y}-C${y})/ABS(C${y}))`, Ant[ka] ? (act - Ant[ka]) / Math.abs(Ant[ka]) : "") : "–", XF.pct]]); y++; }
  ws.addConditionalFormatting({ref: `E${yc0}:E${y - 1}`, rules: [{type: "cellIs", operator: "lessThan", priority: 1, formulae: ["0"], style: {font: {color: {argb: XC.rojo}}}}, {type: "cellIs", operator: "greaterThan", priority: 2, formulae: ["0"], style: {font: {color: {argb: XC.verdeO}}}}]});
  y = lineaTexto(ws, y, Ant.conDatos ? "El período anterior lo calcula OLI con sus propios registros (no van en este archivo). En costo y gastos, que suban no es buena señal." : "No hay un período anterior comparable (el negocio tiene pocos días con ventas antes de este período).", {color: XC.gris, font: {italic: true, size: 9}, span: 9}) + 1;
  // por categoría
  seccion(ws, y++, "Rentabilidad por categoría", 9); y = cabeza(y, ["Categoría", "Unidades", "Ventas netas", "Costo", "Utilidad bruta", "Margen"]);
  const cats = uniq(ok.map(r => r.categoria || "")).sort((p, q) => sumR(r => r.categoria === q ? r.total : 0, d.a, d.b) - sumR(r => r.categoria === p ? r.total : 0, d.a, d.b));
  for (const cat of cats) { const w = `,${rCol(TV, "categoria")},"${qx(cat)}",${enFechas(TV)}`, sel = ok.filter(r => (r.categoria || "") === cat), v = sum(sel, r => r.total), c = sum(sel, r => r.costo || 0); filaNum(y, [[cat || "Sin categoría", null], [fx(`SUMIFS(${rCol(TV, "cantidad")},${conf}${w})`, sum(sel, r => r.cantidad)), XF.num], [fx(sumV("total", w), v), XF.money], [fx(sumV("costo", w), c), XF.money], [fx(`C${y}-D${y}`, v - c), XF.money], [fx(`IF(C${y}=0,0,E${y}/C${y})`, v ? (v - c) / v : 0), XF.pct]]); y++; }
  y++;
  // productos destacados (alimenta el gráfico)
  seccion(ws, y++, "Productos destacados (más vendidos)", 9); y = cabeza(y, ["Producto", "Unidades", "Ventas netas", "Utilidad bruta", "Margen"]);
  const top = d.rent.slice().sort((p, q) => q.ventas - p.ventas).slice(0, 8), yt0 = y;
  for (const r of top) { const w = `,${rCol(TV, "pid")},"${qx(r.pid)}",${enFechas(TV)}`, sel = ok.filter(x => x.pid === r.pid), v = sum(sel, x => x.total), c = sum(sel, x => x.costo || 0); filaNum(y, [[r.producto, null], [fx(`SUMIFS(${rCol(TV, "cantidad")},${conf}${w})`, sum(sel, x => x.cantidad)), XF.num], [fx(sumV("total", w), v), XF.money], [fx(sumV("ub", w), sum(sel, x => x.costo == null ? 0 : x.total - x.costo)), XF.money], [fx(`IF(C${y}=0,0,D${y}/C${y})`, v ? sum(sel, x => x.costo == null ? 0 : x.total - x.costo) / v : 0), XF.pct]]); y++; }
  ws._top = {y0: yt0, y1: y - 1, nombres: top.map(r => r.producto), ventas: top.map(r => sum(ok.filter(x => x.pid === r.pid), x => x.total))};
  y++;
  // gastos por categoría (alimenta la dona)
  seccion(ws, y++, "Gastos por categoría", 9); y = cabeza(y, ["Categoría", "Total", "Participación"]);
  const yg0 = y, filasG = gcat.map(g => ({n: g.cat, f: `SUMIFS(${rCol(TG, "total")},${rCol(TG, "categoria")},"${qx(g.cat)}",${rCol(TG, "trat")},"<>${TRAT.mp}",${enFechas(TG)})`, v: g.v})).concat(R.fijosPend > 0 ? [{n: "Gastos fijos del plan (no registrados)", f: E("fijos"), v: R.fijosPend}] : []);
  const totG = sum(filasG, g => g.v);
  for (const g of filasG) { filaNum(y, [[g.n, null], [fx(g.f, g.v), XF.money], [fx(`IF(SUM($B$${yg0}:$B$${yg0 + filasG.length - 1})=0,0,B${y}/SUM($B$${yg0}:$B$${yg0 + filasG.length - 1}))`, totG ? g.v / totG : 0), XF.pct]]); y++; }
  if (!filasG.length) { celda(ws, "A" + y, "Sin gastos en el período.", {i: true, color: XC.gris}); y++; }
  ws._gastos = {y0: yg0, y1: y - 1, nombres: filasG.map(g => g.n), vals: filasG.map(g => g.v)};
  y++;
  // medios de pago
  seccion(ws, y++, "Medios de pago", 9); y = cabeza(y, ["Medio", "Ventas", "Participación", "Por confirmar"]);
  const ms = uniq(ok.map(r => r.metodo || "Otro")), ym0 = y;
  for (const m of ms) { const sel = ok.filter(r => (r.metodo || "Otro") === m), w = `,${rCol(TV, "metodo")},"${qx(m)}",${enFechas(TV)}`; filaNum(y, [[m, null], [fx(sumV("total", w), sum(sel, r => r.total)), XF.money], [fx(`IF(SUM($B$${ym0}:$B$${ym0 + ms.length - 1})=0,0,B${y}/SUM($B$${ym0}:$B$${ym0 + ms.length - 1}))`, 0), XF.pct], [fx(`SUMIFS(${rCol(TV, "total")},${rCol(TV, "pago")},"Por confirmar"${w})`, sum(sel.filter(r => r.pend), r => r.total)), XF.money]]); y++; }
  const totM = sum(ok, r => r.total); for (let i = 0; i < ms.length; i++) ws.getCell("C" + (ym0 + i)).value = fx(ws.getCell("C" + (ym0 + i)).value.formula, totM ? sum(ok.filter(r => (r.metodo || "Otro") === ms[i]), r => r.total) / totM : 0);
  ws.views = [{state: "frozen", ySplit: 3, showGridLines: false}];
}

function hojaResumenFin(ws, wb, d, R, Ant, eq, L, al, E, wsA, X) {
  for (let i = 1; i <= 12; i++) ws.getColumn(i).width = 11.6;
  ws.addImage(wb._logo, {tl: {col: 0.15, row: 0.15}, ext: {width: 150, height: 50}});
  ws.getRow(1).height = 24; ws.getRow(2).height = 18; ws.getRow(3).height = 18;
  fusion(ws, 1, 3, 1, 8, "Resumen del negocio", {b: true, size: 18, color: XC.tinta});
  fusion(ws, 2, 3, 2, 8, "Período: " + periodoDoc(d.a, d.b) + "   ·   " + negocioNombre(), {b: true, size: 10.5, color: XC.verdeO});
  fusion(ws, 3, 3, 3, 8, "Generado: " + generadoTxt() + (d.filtrado ? "   ·   Filtros: " + filtrosTxt(d.F) : "") + "   ·   Cifras estimadas con lo registrado en OLI", {size: 9, color: XC.gris});
  // filtro de período (dentro de lo descargado)
  fusion(ws, 1, 10, 1, 12, "FILTRO DE PERÍODO", {b: true, size: 9, color: XC.gris, h: "center"});
  celda(ws, "J2", "Desde", {b: true, size: 9, h: "right", color: XC.verdeO}); celda(ws, "J3", "Hasta", {b: true, size: 9, h: "right", color: XC.verdeO});
  ws.mergeCells("K2:L2"); ws.mergeCells("K3:L3");
  for (const [ref, f] of [["K2", d.a], ["K3", d.b]]) { const c = celda(ws, ref, xFecha(f), {b: true, nf: XF.fecha, h: "center", fill: "FFFFFFFF", borde: {top: {style: "thin", color: {argb: XC.verde}}, bottom: {style: "thin", color: {argb: XC.verde}}, left: {style: "thin", color: {argb: XC.verde}}, right: {style: "thin", color: {argb: XC.verde}}}});
    c.dataValidation = {type: "date", operator: "between", allowBlank: false, showErrorMessage: true, errorTitle: "Fecha fuera del período", error: "Usa una fecha entre " + fCorta(d.a) + " y " + fCorta(d.b) + " (lo que trae este archivo).", showInputMessage: true, promptTitle: "Filtro de período", prompt: "Cambia la fecha y todo el resumen se recalcula (entre " + fCorta(d.a) + " y " + fCorta(d.b) + ").", formulae: [xFecha(d.a), xFecha(d.b)]}; }
  // navegación
  const nav = [["Análisis", H_AN], ["Ventas"], ["Productos"], ["Inventario"], ["Compras"], ["Gastos"], ["Caja"], ["Resultados", H_ER], ["Equilibrio", H_EQ], ["Validaciones", H_VAL]];
  celda(ws, "A4", "Ir a →", {b: true, size: 9, color: XC.gris});
  nav.forEach(([t, h], i) => { const c = ws.getCell(4, 2 + i); c.value = ir(h || t, t); c.font = {size: 9, bold: true, underline: true, color: {argb: XC.verde}}; c.alignment = {horizontal: "center"}; });
  ws.getRow(5).height = 6;
  // tarjetas
  const card = (r, c, etiqueta, valor, nf, sub, tono, grande) => {
    ws.mergeCells(r, c, r, c + 2); ws.mergeCells(r + 1, c, r + 1, c + 2); ws.mergeCells(r + 2, c, r + 2, c + 2);
    const bL = {style: "thin", color: {argb: XC.borde}}, l = ws.getCell(r, c), v = ws.getCell(r + 1, c), s = ws.getCell(r + 2, c);
    l.value = etiqueta; l.font = {bold: true, size: 9, color: {argb: XC.gris}}; v.value = valor; if (nf) v.numFmt = nf; v.font = {bold: true, size: grande ? 20 : 17, color: {argb: tono === "rojo" ? XC.rojo : XC.verdeO}}; v.alignment = {vertical: "middle", horizontal: "left"};
    s.value = sub || ""; s.font = {size: 8.5, color: {argb: tono === "rojo" ? XC.rojo : tono === "verde" ? XC.verdeO : tono === "ambar" ? XC.amb : XC.gris}}; s.alignment = {vertical: "top", wrapText: true};
    for (const x of [l, v, s]) x.fill = relleno(XC.crema); l.border = {top: {style: "medium", color: {argb: tono === "rojo" ? XC.rojo : tono === "ambar" ? "FFD9A441" : XC.verde}}, left: bL, right: bL}; v.border = {left: bL, right: bL}; s.border = {bottom: bL, left: bL, right: bL};
  };
  ws.getRow(7).height = 16; ws.getRow(8).height = 30; ws.getRow(9).height = 26; ws.getRow(11).height = 16; ws.getRow(12).height = 30; ws.getRow(13).height = 26;
  const vr = (act, ant, mej) => variacion(act, ant, Ant.conDatos, mej), v1 = vr(R.netas, Ant.netas, true), v2 = vr(R.costo, Ant.costo, false), v3 = vr(R.bruta, Ant.bruta, true), v4 = vr(R.gTot, Ant.gTot, false), v5 = vr(R.neta, Ant.neta, true);
  card(7, 1, "VENTAS NETAS", fx(E("netas"), R.netas), XF.money, v1.txt, v1.tono, true);
  card(7, 4, "COSTO DE LO VENDIDO", fx(E("costo"), R.costo), XF.money, R.sinCosto ? "⚠ " + R.sinCosto + " líneas sin costo registrado" : v2.txt, R.sinCosto ? "ambar" : v2.tono);
  card(7, 7, "UTILIDAD BRUTA", fx(E("bruta"), R.bruta), XF.money, "Margen bruto " + pct(R.mb) + " · " + v3.txt, R.bruta < 0 ? "rojo" : v3.tono);
  card(7, 10, "GASTOS TOTALES", fx(E("gtot"), R.gTot), XF.money, "Registrados " + fmt(R.gastosReg) + " + fijos del plan " + fmt(R.fijosPend), v4.tono === "rojo" ? "ambar" : "gris");
  card(11, 1, "UTILIDAD NETA ESTIMADA", fx(E("neta"), R.neta), XF.money, R.neta < 0 ? "Con los gastos fijos, el período da pérdida" : v5.txt, R.neta < 0 ? "rojo" : "verde", true);
  card(11, 4, "MARGEN NETO", fx(E("mn"), R.mn), XF.pct, R.mn < 0 ? "Por cada $100 vendidos se pierden " + fmt(Math.round(-R.mn * 100)) : "De cada $100 vendidos quedan " + fmt(Math.round(R.mn * 100)), R.mn < 0 ? "rojo" : "verde");
  card(11, 7, "PUNTO DE EQUILIBRIO DEL MES", eq.pe != null ? fx(QS(H_EQ) + "!$B$" + 0, eq.pe) : eq.fijos ? "No se alcanza" : "Sin gastos fijos", eq.pe != null ? XF.money : null, eq.pe != null ? (eq.mes ? "Llevas " + pct(eq.avancePE || 0) + " · faltan " + fmt(eq.falta || 0) : "Ventas del mes necesarias para no perder") : eq.fijos ? "El margen de contribución no cubre los fijos" : "Escríbelos en OLI → Ajustes", eq.pe != null && eq.mes && (eq.avancePE || 0) < 1 ? "ambar" : "gris");
  card(11, 10, "CUMPLIMIENTO DE LA META", eq.metaDia ? fx(QS(H_EQ) + "!$B$" + 0, eq.avanceMeta || 0) : "Sin meta", eq.metaDia ? XF.pct : null, eq.metaDia ? "Meta del período " + fmt(eq.metaDia * R.dias) : "Defínela en OLI → Inicio → Meta de hoy", eq.metaDia ? ((eq.avanceMeta || 0) >= 1 ? "verde" : "ambar") : "gris");
  // ¿cómo va el negocio? (izquierda) y alertas (derecha)
  let y = 15; ws.mergeCells(y, 1, y, 6); celda(ws, "A" + y, "¿CÓMO VA EL NEGOCIO?", {b: true, size: 11, color: XC.verde}); ws.getCell("A" + y).border = {bottom: {style: "thin", color: {argb: XC.verde}}};
  ws.mergeCells(y, 8, y, 12); celda(ws, "H" + y, "ALERTAS Y QUÉ REVISAR", {b: true, size: 11, color: XC.verde}); ws.getCell("H" + y).border = {bottom: {style: "thin", color: {argb: XC.verde}}};
  const preguntas = [["¿Cuánto hemos vendido?", fx(E("netas"), R.netas), XF.money], ["¿Cuánto nos costó lo que vendimos?", fx(E("costo"), R.costo), XF.money], ["¿Cuánto ganamos al vender?", fx(E("bruta"), R.bruta), XF.money], ["¿Cuánto hemos gastado?", fx(E("gtot"), R.gTot), XF.money], ["¿Cuánto nos queda después de todo?", fx(E("neta"), R.neta), XF.money],
    ["Plata que entró y quedó (efectivo + cuentas)", L.total, XF.money, "No es ganancia: no resta el costo de lo vendido ni las compras"], ["Pagos QR / Nequi / Daviplata sin confirmar", fx(E("pend"), R.pend), XF.money, "Todavía no es plata segura"],
    ["¿Vamos cumpliendo la meta?", eq.metaDia ? fx(QS(H_EQ) + "!$B$" + 0, eq.avanceMeta || 0) : "Sin meta definida", eq.metaDia ? XF.pct : null], ["¿Cuánto falta para el punto de equilibrio?", eq.mes && eq.pe != null ? fx(QS(H_EQ) + "!$B$" + 0, eq.falta || 0) : eq.pe == null ? (eq.fijos ? "No se alcanza con este margen" : "Faltan los gastos fijos") : "Elige un período desde el día 1", eq.mes && eq.pe != null ? XF.money : null]];
  y++; const yQ = y;
  for (const [q, v, nf, nota] of preguntas) { ws.mergeCells(y, 1, y, 4); celda(ws, "A" + y, q, {size: 10, color: XC.tinta}); ws.mergeCells(y, 5, y, 6); const c = celda(ws, "E" + y, v, {b: true, nf, h: "right", size: 10.5, color: XC.verdeO}); if (nota) c.note = nota; ws.getCell("A" + y).border = ws.getCell("E" + y).border = {bottom: {style: "hair", color: {argb: XC.borde}}}; ws.getRow(y).height = 18; y++; }
  ws.addConditionalFormatting({ref: `E${yQ}:E${y - 1}`, rules: [{type: "cellIs", operator: "lessThan", priority: 1, formulae: ["0"], style: {font: {color: {argb: XC.rojo}, bold: true}}}]});
  lineaTexto(ws, y, "La utilidad es una estimación con lo registrado, no la utilidad contable oficial. «Plata que entró y quedó» viene de Dinero → ¿Cuánta plata hay? para estas fechas.", {color: XC.gris, font: {italic: true, size: 8}, span: 6, h: 22});
  let ya = yQ; const iconos = {bad: ["●", XC.rojo], warn: ["●", XC.amb], ok: ["●", XC.verdeO]};
  if (!al.length) { ws.mergeCells(ya, 8, ya, 12); celda(ws, "H" + ya, "● Sin alertas: los datos del período no muestran problemas.", {color: XC.verdeO, b: true}); ya++; }
  for (const x of al.slice(0, 7)) { const [ic, col] = iconos[x.sev]; ws.mergeCells(ya, 8, ya, 11); const c = celda(ws, "H" + ya, ic + " " + x.t, {size: 9, color: XC.tinta, wrap: true}); c.font = {size: 9, color: {argb: XC.tinta}}; c.value = {richText: [{text: ic + " ", font: {size: 10, color: {argb: col}, bold: true}}, {text: x.t, font: {size: 9, color: {argb: XC.tinta}}}]}; const k = ws.getCell(ya, 12); k.value = ir(x.hoja, "Ver →"); k.font = {size: 9, bold: true, underline: true, color: {argb: XC.verde}}; k.alignment = {vertical: "middle", horizontal: "center"}; k.note = "Revisa: " + x.revisar; ws.getRow(ya).height = Math.max(ws.getRow(ya).height || 18, x.t.length > 85 ? 36 : 24); ya++; }
  if (al.length > 7) { ws.mergeCells(ya, 8, ya, 12); celda(ws, "H" + ya, "+ " + (al.length - 7) + " alertas más en Validaciones.", {size: 9, i: true, color: XC.gris}); ya++; }
  // gráficos
  y = Math.max(y + 2, ya + 1); ws.mergeCells(y, 1, y, 12); celda(ws, "A" + y, "GRÁFICOS", {b: true, size: 11, color: XC.verde}); ws.getCell("A" + y).border = {bottom: {style: "thin", color: {argb: XC.verde}}};
  const g0 = y; // fila (base 1) del título; los gráficos empiezan en la siguiente
  y = g0 + 1 + 15 + 1 + 15 + 1; lineaTexto(ws, y, "OLI · Software propiedad de VP Visual Project · Creado por Víctor Palacio", {color: XC.gris, font: {size: 8}, span: 12});
  ws.pageSetup.printArea = "A1:L" + y;
  // las celdas que leen el Equilibrio (se arman con la fila real de cada dato)
  const wsQ = wb.getWorksheet(H_EQ), fila = t => { for (let r = 1; r <= wsQ.rowCount; r++) if (wsQ.getCell("A" + r).value === t) return r; return null; };
  const refQ = t => QS(H_EQ) + "!$B$" + fila(t), arreglar = (ref, t) => { const c = ws.getCell(ref); if (c.value && c.value.formula) c.value = fx(refQ(t), c.value.result); };
  arreglar("G12", "Ventas del mes necesarias para no perder"); arreglar("J12", "Cumplimiento de la meta");
  for (let r = yQ; r < yQ + preguntas.length; r++) { const c = ws.getCell("E" + r); if (c.value && c.value.formula && /!\$B\$0$/.test(c.value.formula)) c.value = fx(refQ(r === yQ + 7 ? "Cumplimiento de la meta" : "Falta para el punto de equilibrio"), c.value.result); }
  // datos de los gráficos (ya escritos en Análisis, Estado de resultados y Equilibrio)
  const dA = wsA._dias, tA = wsA._top, gA = wsA._gastos, ref = (h, c, r0, r1) => `${QS(h)}!$${c}$${r0}:$${c}$${r1}`;
  const r1 = g0, ch = [];
  ch.push({tipo: dA.n > 20 ? "linea" : "barra", titulo: "Ventas diarias", desde: [0, r1], hasta: [6, r1 + 15], series: [{nombre: "Ventas netas", catRef: ref(H_AN, "H", dA.y0, Math.max(dA.y0, dA.y1)), cat: dA.etiquetas, valRef: ref(H_AN, "D", dA.y0, Math.max(dA.y0, dA.y1)), val: dA.ventas, color: "2F7B5A"}], gap: 40});
  ch.push({tipo: "barra", titulo: "¿A dónde se va la plata?", desde: [6, r1], hasta: [12, r1 + 15], etiquetas: true, series: [{nombre: "Pesos", catRef: ref(H_ER, "F", 7, 10), cat: X.dist.map(x => x[0]), valRef: ref(H_ER, "G", 7, 10), val: X.dist.map(x => x[2]), colores: ["2F7B5A", "D9A441", "B5655B", X.dist[3][2] < 0 ? "B03A2E" : "1F5C43"]}], gap: 50});
  const PAL = ["2F7B5A", "D9A441", "5B8DB8", "B5655B", "8CBA9C", "9A8FB0", "7A8C84", "C9B37E", "6FA3A0", "D88C6A"];
  ch.push({tipo: "dona", titulo: "Gastos por categoría", desde: [0, r1 + 16], hasta: [4, r1 + 31], leyenda: "r", series: [{nombre: "Gastos", catRef: ref(H_AN, "A", gA.y0, Math.max(gA.y0, gA.y1)), cat: gA.nombres.length ? gA.nombres : ["Sin gastos"], valRef: ref(H_AN, "B", gA.y0, Math.max(gA.y0, gA.y1)), val: gA.vals.length ? gA.vals : [0], colores: PAL}]});
  ch.push({tipo: "barra", horizontal: true, titulo: "Productos que más venden", desde: [4, r1 + 16], hasta: [8, r1 + 31], etiquetas: true, series: [{nombre: "Ventas netas", catRef: ref(H_AN, "A", tA.y0, Math.max(tA.y0, tA.y1)), cat: tA.nombres.length ? tA.nombres : ["Sin ventas"], valRef: ref(H_AN, "C", tA.y0, Math.max(tA.y0, tA.y1)), val: tA.ventas.length ? tA.ventas : [0], color: "8CBA9C"}], gap: 40});
  ch.push({tipo: "barra", horizontal: true, titulo: "Progreso del mes", desde: [8, r1 + 16], hasta: [12, r1 + 31], etiquetas: true, series: [{nombre: "Pesos", catRef: ref(H_EQ, "A", X.yPg, X.yPg + X.prog.length - 1), cat: X.prog.map(x => x[0]), valRef: ref(H_EQ, "B", X.yPg, X.yPg + X.prog.length - 1), val: X.prog.map(x => x[2]), colores: ["2F7B5A", "B5655B", "D9A441"]}], gap: 45});
  ws.views = [{state: "normal", showGridLines: false, zoomScale: 90, topLeftCell: "A1", activeCell: "A1"}];
  return ch;
}
