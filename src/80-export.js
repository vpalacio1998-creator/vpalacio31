/* ============ 80 · exportaciones: Excel, PDF y paquete para el contador ============
   Todo sale de datosInforme(): la misma fuente para pantalla, Excel y PDF, así los totales cuadran.
   Las librerías se cargan solo cuando se pide un archivo (PWA: copia local, guardada para usar sin Internet; artefacto: CDN). */
const LIBS = {
  ExcelJS: {v: "exceljs.min.js", cdn: ["https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js", "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js"], ok: () => window.ExcelJS},
  JSZip: {v: "jszip.min.js", cdn: ["https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js", "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"], ok: () => window.JSZip},
  jspdf: {v: "jspdf.umd.min.js", cdn: ["https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js", "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"], ok: () => window.jspdf && window.jspdf.jsPDF},
  autotable: {v: "jspdf.plugin.autotable.min.js", cdn: ["https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js", "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js"], ok: () => window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API.autoTable, dep: "jspdf"}
};
const cargarScript = src => new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.async = true; s.onload = res; s.onerror = () => { s.remove(); rej(new Error(src)); }; document.head.appendChild(s); });
async function lib(k) {
  const L = LIBS[k]; if (L.ok()) return; if (L.dep) await lib(L.dep);
  for (const s of (window.OLI_PWA ? ["vendor/" + L.v] : []).concat(L.cdn)) { try { await cargarScript(s); if (L.ok()) return; } catch (e) { /* siguiente fuente */ } }
  throw new Error("No se pudo preparar el generador de archivos. Conéctate a Internet una vez y vuelve a intentarlo.");
}
// PWA: deja las librerías guardadas para poder exportar sin Internet
function precargarLibs() { if (!window.OLI_PWA || !navigator.onLine || !esAdmin()) return; for (const L of Object.values(LIBS)) fetch("vendor/" + L.v).catch(() => {}); }
let _dl = null;
const downloadsCap = () => _dl || (_dl = (window.claude && typeof window.claude.use === "function") ? window.claude.use("downloads").catch(() => null) : Promise.resolve(null));
async function guardarArchivo(nombre, blob) {
  const dl = await downloadsCap();
  if (dl) {
    try { await dl.save({filename: nombre, data: blob}); toast("Listo: " + nombre); return true; }
    catch (e) { const c = e && e.code; if (c === "declined") { toast("Descarga cancelada."); return false; } if (c === "rate_limited") { toast("Ya hay una descarga esperando tu confirmación.", true); return false; } if (!["unavailable", "not_granted", "capability_disabled", "capability_removed"].includes(c)) { toast("No se pudo entregar el archivo.", true); return false; } }
  }
  const u = URL.createObjectURL(blob), a = document.createElement("a"); a.href = u; a.download = nombre; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000);
  toast("Descargado: " + nombre); return true;
}

/* ---------- datos del informe (una sola fuente) ---------- */
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const fCorta = s => s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "";
const periodoDoc = (a, b) => a === b ? fCorta(a) : fCorta(a) + " – " + fCorta(b);
const esMesCompleto = (a, b) => a.slice(8) === "01" && b === lastOfMonth(a);
const etiquetaPeriodo = (a, b) => esMesCompleto(a, b) ? MESES[+a.slice(5, 7) - 1].toUpperCase() + "_" + a.slice(0, 4) : a + "_a_" + b;
const generadoTxt = () => { const d = new Date(); return fCorta(ymd(d)) + " " + d.toLocaleTimeString("es-CO", {hour: "numeric", minute: "2-digit"}); };
const negocioNombre = () => (configNeg().nombre || "OLI").trim();
const AVISO_TRIB = "Este informe organiza y prepara la información para revisión contable y tributaria. Las obligaciones aplicables deben validarse según el RUT, régimen, actividad y situación particular de la empresa.";
function filtrosTxt(F) {
  const p = []; if (!F) return "";
  if (F.dev) p.push("Caja: " + devNombre(F.dev)); if (F.uid) p.push("Empleado: " + empNombre(F.uid)); if (F.m) p.push("Pago: " + F.m);
  if (F.cat) p.push("Categoría: " + F.cat); if (F.pid) p.push("Producto: " + ((prod(F.pid) || {}).nombre || F.pid)); return p.join(" · ");
}
const hayFiltro = F => !!(F && (F.cat || F.pid || F.uid || F.m || F.dev));
function datosInforme(a, b, F) {
  F = Object.assign({cat: "", pid: "", uid: "", m: "", dev: ""}, F || {});
  const ventas = filasVentas(a, b, F); for (const r of ventas) { const c = costoUnit(r.pid, r.t); r.costo = c == null ? null : Math.round(c * r.cantidad); }
  const ok = ventas.filter(r => r.estado === "Confirmada"), ids = uniq(ok.map(r => r.id)), tot = sum(ok, r => r.total), desc = sum(ok, r => r.descuento), costo = sum(ok, r => r.costo || 0), bruto = tot + desc;
  const anuladas = uniq(ventas.filter(r => r.estado === "Anulada").map(r => r.id)), anuladoTot = sum(ventas.filter(r => r.estado === "Anulada"), r => r.total);
  const prodFiltro = !!(F.cat || F.pid), gastos = filasGastos(a, b), gastosOp = prodFiltro ? null : sum(gastos.filter(g => g.categoria !== BASE_COSTO), g => g.total), bruta = tot - costo, util = gastosOp == null ? null : bruta - gastosOp;
  const mermas = filasMermas(a, b).filter(m => { const p = prods().find(x => x.nombre === m.producto); return (!F.pid || (p && p.id === F.pid)) && (!F.cat || (p && p.cat === F.cat)); });
  const rmap = {}; for (const r of ok) { const o = rmap[r.pid] = rmap[r.pid] || {pid: r.pid, producto: r.producto, categoria: r.categoria, unidades: 0, ventas: 0, costo: 0, sinCosto: 0, descuentos: 0, merma: 0}; o.unidades += r.cantidad; o.ventas += r.total; o.descuentos += r.descuento; if (r.costo == null) o.sinCosto += r.cantidad; else o.costo += r.costo; }
  for (const m of mermas) { const p = prods().find(x => x.nombre === m.producto); if (p && rmap[p.id]) rmap[p.id].merma += m.total || 0; }
  const rent = Object.values(rmap).map(o => Object.assign(o, {bruta: o.ventas - o.costo, margen: o.ventas ? (o.ventas - o.costo) / o.ventas : null, neta: o.ventas - o.costo - o.merma, costoOk: o.sinCosto === 0})).sort((x, y) => y.bruta - x.bruta);
  const dmap = {}; for (let d = a, i = 0; d <= b && i < 400; d = addDays(d, 1), i++) dmap[d] = {fecha: d, ventas: 0, costo: 0, n: new Set()};
  for (const r of ok) { const o = dmap[r.fecha]; if (!o) continue; o.ventas += r.total; o.costo += r.costo || 0; o.n.add(r.id); }
  const dias = Object.values(dmap).map(o => ({fecha: o.fecha, ventas: o.ventas, costo: o.costo, bruta: o.ventas - o.costo, n: o.n.size}));
  const agrupa = k => { const m = {}; for (const r of ok) m[r[k] || "Sin dato"] = (m[r[k] || "Sin dato"] || 0) + r.total; return Object.entries(m).map(([n, v]) => ({n, v})).sort((x, y) => y.v - x.v); };
  const cajas = filasCajas(a, b).filter(c => !F.dev || cajasAll().some(x => x.id === c.id && x.dev === F.dev));
  const control = [];
  if (!hayFiltro(F)) { const fz = finanzas(a, b); control.push({t: "Ventas del detalle = ventas del resumen", ok: Math.abs(fz.ventas - tot) < 1, x: tot, y: fz.ventas}); }
  control.push({t: "Total = suma de productos − descuentos", ok: Math.abs(tot - (sum(ok, r => r.precio * r.cantidad) - desc)) < 1, x: tot, y: sum(ok, r => r.precio * r.cantidad) - desc});
  control.push({t: "Base + impuesto = total", ok: Math.abs(sum(ok, r => r.subtotal + r.impuesto) - tot) < 1, x: sum(ok, r => r.subtotal + r.impuesto), y: tot});
  return {a, b, F, filtrado: hayFiltro(F), ventas, ok, n: ids.length, tot, desc, bruto, costo, bruta, gastosOp, util, margen: tot && util != null ? util / tot : null, margenBruto: tot ? bruta / tot : null, ticket: ids.length ? tot / ids.length : 0,
    uds: sum(ok, r => r.cantidad), anuladas: anuladas.length, anuladoTot, sinCosto: ok.filter(r => r.costo == null).length, rent, dias, cats: agrupa("categoria"), metodos: agrupa("metodo"), empleados: agrupa("empleado"), cajasV: agrupa("caja"),
    inv: filasInventario(a, b), compras: filasCompras(a, b), rec: filasRecomendacion(), cajas, movCaja: filasMovCaja(a, b), gastos, mermas, clientes: filasClientes(a, b), anul: filasAnulaciones(a, b), audit: filasAuditoria(a, b), ajustes: filasAjustes(a, b),
    terceros: filasTerceros(a, b), imp: resumenImpuestos(a, b), integ: integridad(a, b), pend: informacionPendiente(a, b), conc: conciliacion(a, b), riesgos: riesgosAuditoria(a, b), control};
}
// periodo anterior de igual duración (para tendencias)
function periodoAnterior(a, b) { const n = diffDays(b, a) + 1; return [addDays(a, -n), addDays(a, -1)]; }

/* ---------- gráficos (canvas → PNG) para Excel y PDF ---------- */
function pasoBonito(x) { const e = Math.pow(10, Math.floor(Math.log10(Math.max(1, x)))), f = x / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e; }
const CHART_PAL = ["#2F7B5A", "#D9A441", "#5B8DB8", "#B5655B", "#8CC7A6", "#9A8FB0", "#7A8C84"];
function grafico(tipo, datos, o = {}) {
  const W = o.w || 900, H = o.h || 420, sc = 2, cv = document.createElement("canvas"); cv.width = W * sc; cv.height = H * sc; const c = cv.getContext("2d"); c.scale(sc, sc);
  const FN = "Figtree, Helvetica, Arial, sans-serif", ink = "#22302A", mut = "#6B7A72", grid = "#E6ECE8", verde = "#2F7B5A";
  c.fillStyle = "#FFFFFF"; c.fillRect(0, 0, W, H); c.textBaseline = "alphabetic";
  let top = 18; if (o.titulo) { c.fillStyle = ink; c.font = `700 19px ${FN}`; c.fillText(o.titulo, 18, 30); top = 52; }
  if (o.sub) { c.fillStyle = mut; c.font = `500 13px ${FN}`; c.fillText(o.sub, 18, top - 4); top += 12; }
  const fmtEje = o.fmt || fmtK;
  const redondeo = (x, y, w, h, r) => { r = Math.min(r, w / 2, Math.abs(h)); c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r); c.lineTo(x + w, y + h); c.closePath(); c.fill(); };
  if (!datos.length || datos.every(d => !d.v && !d.v2)) { c.fillStyle = mut; c.font = `500 15px ${FN}`; c.textAlign = "center"; c.fillText("Sin datos en este periodo", W / 2, H / 2); return cv.toDataURL("image/png"); }
  if (tipo === "barras" || tipo === "linea") {
    const L = 74, R = 18, B = 44, pw = W - L - R, ph = H - top - B, n = datos.length, mx = Math.max(1, ...datos.map(d => Math.max(d.v || 0, d.v2 || 0))), st = pasoBonito(mx / 4), ymax = Math.ceil(mx / st) * st, y = v => top + ph - (v / ymax) * ph;
    c.font = `500 12px ${FN}`; c.textAlign = "right"; c.strokeStyle = grid; c.lineWidth = 1;
    for (let v = 0; v <= ymax + 0.1; v += st) { c.beginPath(); c.moveTo(L, y(v) + .5); c.lineTo(W - R, y(v) + .5); c.stroke(); c.fillStyle = mut; c.fillText(fmtEje(v), L - 8, y(v) + 4); }
    const slot = pw / n, cada = Math.max(1, Math.ceil(n / 12)); c.textAlign = "center";
    datos.forEach((d, i) => { if (i % cada === 0 || i === n - 1) { c.fillStyle = mut; c.fillText(d.l, L + slot * i + slot / 2, H - B + 20); } });
    if (tipo === "barras") {
      const bw = Math.max(2, Math.min(42, slot * (o.v2 ? .38 : .62)));
      datos.forEach((d, i) => { const x0 = L + slot * i + slot / 2 - (o.v2 ? bw + 1 : bw / 2); c.fillStyle = verde; if (d.v > 0) redondeo(x0, y(d.v), bw, y(0) - y(d.v), 4); if (o.v2 && d.v2 > 0) { c.fillStyle = "#8CC7A6"; redondeo(x0 + bw + 2, y(d.v2), bw, y(0) - y(d.v2), 4); } });
    } else {
      const serie = (k, col) => { c.strokeStyle = col; c.lineWidth = 2.5; c.beginPath(); datos.forEach((d, i) => { const X = L + slot * i + slot / 2, Y = y(d[k] || 0); i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.stroke(); if (n <= 40) datos.forEach((d, i) => { c.fillStyle = col; c.beginPath(); c.arc(L + slot * i + slot / 2, y(d[k] || 0), 3.5, 0, Math.PI * 2); c.fill(); }); };
      serie("v", verde); if (o.v2) serie("v2", "#D9A441");
    }
    if (o.leyenda) { c.textAlign = "left"; c.font = `600 12px ${FN}`; let x = W - R - 10; for (let i = o.leyenda.length - 1; i >= 0; i--) { const t = o.leyenda[i], w = c.measureText(t).width; x -= w; c.fillStyle = ink; c.fillText(t, x, 30); x -= 16; c.fillStyle = i ? (tipo === "linea" ? "#D9A441" : "#8CC7A6") : verde; c.fillRect(x, 21, 11, 11); x -= 14; } }
  } else if (tipo === "hbar") {
    const n = datos.length, L = Math.min(300, W * .36), R = 110, rowH = Math.min(34, (H - top - 10) / n), mx = Math.max(1, ...datos.map(d => d.v));
    datos.forEach((d, i) => { const yy = top + i * rowH, w = (W - L - R) * d.v / mx; c.fillStyle = ink; c.font = `500 13px ${FN}`; c.textAlign = "right"; let t = d.l; while (c.measureText(t).width > L - 14 && t.length > 4) t = t.slice(0, -2); c.fillText(t === d.l ? t : t + "…", L - 10, yy + rowH / 2 + 4);
      c.fillStyle = d.c || verde; if (w > 0) { c.beginPath(); const h = rowH * .62, y0 = yy + (rowH - h) / 2, r = Math.min(4, h / 2, w); c.moveTo(L, y0); c.lineTo(L + w - r, y0); c.quadraticCurveTo(L + w, y0, L + w, y0 + r); c.lineTo(L + w, y0 + h - r); c.quadraticCurveTo(L + w, y0 + h, L + w - r, y0 + h); c.lineTo(L, y0 + h); c.closePath(); c.fill(); }
      c.fillStyle = mut; c.textAlign = "left"; c.font = `600 12px ${FN}`; c.fillText(d.txt || fmtEje(d.v), L + w + 8, yy + rowH / 2 + 4); });
  } else if (tipo === "dona") {
    const tot = sum(datos, d => d.v), cx = Math.min(W * .3, (H - top) / 2 + 20), cy = top + (H - top) / 2, r = Math.min((H - top) / 2 - 8, W * .22); let ang = -Math.PI / 2;
    datos.forEach((d, i) => { const a2 = ang + (d.v / tot) * Math.PI * 2; c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, r, ang, a2); c.closePath(); c.fillStyle = CHART_PAL[i % CHART_PAL.length]; c.fill(); c.strokeStyle = "#FFFFFF"; c.lineWidth = 2; c.stroke(); ang = a2; });
    c.beginPath(); c.arc(cx, cy, r * .58, 0, Math.PI * 2); c.fillStyle = "#FFFFFF"; c.fill(); c.fillStyle = ink; c.textAlign = "center"; c.font = `700 18px ${FN}`; c.fillText(fmtEje(tot), cx, cy + 6);
    c.textAlign = "left"; datos.forEach((d, i) => { const yy = top + 14 + i * 28, x = cx + r + 40; c.fillStyle = CHART_PAL[i % CHART_PAL.length]; c.fillRect(x, yy - 11, 13, 13); c.fillStyle = ink; c.font = `600 14px ${FN}`; c.fillText(d.l, x + 22, yy); c.fillStyle = mut; c.font = `500 13px ${FN}`; c.fillText(fmtEje(d.v) + " · " + pct(d.v / tot), x + 22 + Math.max(150, c.measureText(d.l).width + 14), yy); });
  }
  return cv.toDataURL("image/png");
}
function logoPNG() {
  const cv = document.createElement("canvas"); cv.width = 360; cv.height = 150; const c = cv.getContext("2d");
  c.fillStyle = "#2F7B5A"; c.font = "700 118px Fredoka, Figtree, Helvetica, Arial, sans-serif"; c.textBaseline = "middle"; c.fillText("OLI", 6, 80); return cv.toDataURL("image/png");
}
const top5 = (arr, k, n = 5) => arr.slice().sort((x, y) => (y[k] || 0) - (x[k] || 0)).slice(0, n);
const diaEje = f => f.slice(8, 10) + "/" + f.slice(5, 7);

/* ---------- Excel ---------- */
const XC = {verde: "FF2F7B5A", verdeO: "FF1F5C43", menta: "FFE3F1EA", crema: "FFFAF7F0", borde: "FFD5E0D9", gris: "FF6B7A72", tinta: "FF22302A", rojo: "FFB03A2E", rojoC: "FFFBE3E0", amb: "FF9A6A12", ambC: "FFFDF1DC", nar: "FFB5601F", narC: "FFFCE9D9", okC: "FFE3F1EA"};
const XF = {money: '"$"#,##0;[Red]-"$"#,##0', int: "#,##0", num: "#,##0.##", pct: "0.0%", fecha: "dd/mm/yyyy"};
const colL = n => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const xFecha = s => { if (!s) return null; const [y, m, d] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const nombreHoja = s => s.replace(/[\[\]:*?\/\\]/g, " ").slice(0, 31);
const ESTILO_ESTADO = {AGOTADO: [XC.rojoC, XC.rojo], BAJO: [XC.ambC, XC.amb], RIESGO: [XC.narC, XC.nar], NORMAL: [XC.okC, XC.verdeO], "SIN CONTAR": ["FFEFEFEF", XC.gris], Alto: [XC.rojoC, XC.rojo], Medio: [XC.ambC, XC.amb], Bajo: [XC.okC, XC.verdeO], Anulada: [XC.rojoC, XC.rojo], "REVISAR": [XC.ambC, XC.amb], "OK": [XC.okC, XC.verdeO]};
function nuevoLibro() { const wb = new ExcelJS.Workbook(); wb.creator = "OLI · VP Visual Project"; wb.lastModifiedBy = "OLI"; wb.company = "VP Visual Project"; wb.title = "OLI"; wb.created = new Date(); wb.modified = new Date(); wb._logo = null; return wb; }
function hojaBase(wb, nombre, titulo, ctx, ncols, freeze) {
  const ws = wb.addWorksheet(nombreHoja(nombre), {properties: {tabColor: {argb: XC.verde}}, views: [{state: freeze ? "frozen" : "normal", ySplit: freeze || 0, showGridLines: false}],
    pageSetup: {paperSize: 9, orientation: ncols > 8 ? "landscape" : "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: {left: .4, right: .4, top: .5, bottom: .6, header: .25, footer: .25}},
    headerFooter: {oddFooter: "&L&8OLI · Software propiedad de VP Visual Project · Creado por Víctor Palacio&R&8Página &P de &N", oddHeader: "&R&8" + titulo.replace(/&/g, "&&")}});
  try { if (wb._logo == null) wb._logo = wb.addImage({base64: logoPNG(), extension: "png"}); ws.addImage(wb._logo, {tl: {col: 0.1, row: 0.15}, ext: {width: 74, height: 31}}); } catch (e) { ws.getCell(1, 1).value = "OLI"; ws.getCell(1, 1).font = {bold: true, size: 20, color: {argb: XC.verde}}; }
  const span = Math.max(4, ncols);
  ws.getRow(1).height = 30; ws.mergeCells(1, 2, 1, span); const t = ws.getCell(1, 2); t.value = titulo; t.font = {bold: true, size: 15, color: {argb: XC.tinta}}; t.alignment = {vertical: "middle"};
  ws.mergeCells(2, 1, 2, span); const p = ws.getCell(2, 1); p.value = "Periodo: " + periodoDoc(ctx.a, ctx.b) + "   ·   " + negocioNombre(); p.font = {bold: true, size: 10.5, color: {argb: XC.verdeO}};
  ws.mergeCells(3, 1, 3, span); const g = ws.getCell(3, 1); g.value = "Generado: " + generadoTxt() + (ctx.F && hayFiltro(ctx.F) ? "   ·   Filtros: " + filtrosTxt(ctx.F) : "") + "   ·   OLI " + BRAND.version; g.font = {size: 9, color: {argb: XC.gris}};
  return ws;
}
const fmtCelda = (t) => t === "money" ? XF.money : t === "int" ? XF.int : t === "num" ? XF.num : t === "pct" ? XF.pct : t === "fecha" ? XF.fecha : null;
// cols: [{h, k|f, t: text|money|int|num|pct|fecha, tot: true, w}]  → tabla con encabezado, filtros, totales con SUBTOTAL y anchos automáticos
function hojaTabla(wb, nombre, titulo, cols, rows, ctx, o = {}) {
  const HR = o.leyenda ? 6 : 5, ws = hojaBase(wb, nombre, titulo, ctx, cols.length, HR);
  if (o.leyenda) { ws.getCell(4, 1).value = "Leyenda:"; ws.getCell(4, 1).font = {size: 9, bold: true, color: {argb: XC.gris}}; o.leyenda.forEach((k, i) => { const c = ws.getCell(4, 2 + i); c.value = k; const e = ESTILO_ESTADO[k]; if (e) { c.fill = {type: "pattern", pattern: "solid", fgColor: {argb: e[0]}}; c.font = {size: 9, bold: true, color: {argb: e[1]}}; } c.alignment = {horizontal: "center"}; }); }
  const hr = ws.getRow(HR); hr.height = 30;
  cols.forEach((c, i) => { const cell = hr.getCell(i + 1); cell.value = c.h; cell.font = {bold: true, size: 10, color: {argb: XC.verdeO}}; cell.fill = {type: "pattern", pattern: "solid", fgColor: {argb: XC.menta}}; cell.alignment = {vertical: "middle", horizontal: c.t && c.t !== "text" && c.t !== "fecha" ? "right" : "left", wrapText: true}; cell.border = {bottom: {style: "medium", color: {argb: XC.verde}}}; });
  const val = (c, r) => { const v = c.f ? c.f(r) : r[c.k]; if (v == null || v === "") return null; if (c.t === "fecha") return xFecha(v); if (c.t && c.t !== "text") return typeof v === "number" ? (c.t === "money" ? Math.round(v) : v) : (isFinite(+v) ? +v : v); return String(v); };
  rows.forEach((r, j) => { const row = ws.getRow(HR + 1 + j); cols.forEach((c, i) => { const cell = row.getCell(i + 1), v = val(c, r); cell.value = v; const nf = fmtCelda(c.t); if (nf) cell.numFmt = nf; cell.font = {size: 10, color: {argb: XC.tinta}}; cell.border = {bottom: {style: "hair", color: {argb: XC.borde}}};
    if (c.estado && v != null && ESTILO_ESTADO[v]) { const e = ESTILO_ESTADO[v]; cell.fill = {type: "pattern", pattern: "solid", fgColor: {argb: e[0]}}; cell.font = {size: 10, bold: true, color: {argb: e[1]}}; cell.alignment = {horizontal: "center"}; }
    if (c.neg && typeof v === "number" && v < 0) cell.font = {size: 10, bold: true, color: {argb: XC.rojo}}; }); });
  const r0 = HR + 1, r1 = HR + rows.length, totRow = r1 + 1;
  if (rows.length) {
    ws.autoFilter = {from: {row: HR, column: 1}, to: {row: r1, column: cols.length}};
    if (cols.some(c => c.tot)) { const tr = ws.getRow(totRow); tr.getCell(1).value = o.totalTxt || "TOTAL"; cols.forEach((c, i) => { const cell = tr.getCell(i + 1); if (c.tot) { const L = colL(i + 1); cell.value = {formula: `SUBTOTAL(109,${L}${r0}:${L}${r1})`, result: sum(rows, r => { const v = val(c, r); return typeof v === "number" ? v : 0; })}; cell.numFmt = fmtCelda(c.t) || XF.num; }
      cell.font = {bold: true, size: 10.5, color: {argb: XC.verdeO}}; cell.fill = {type: "pattern", pattern: "solid", fgColor: {argb: XC.crema}}; cell.border = {top: {style: "medium", color: {argb: XC.verde}}}; }); }
  } else { ws.mergeCells(r0, 1, r0, Math.max(1, cols.length)); const c = ws.getCell(r0, 1); c.value = o.vacio || "Sin registros en este periodo."; c.font = {italic: true, color: {argb: XC.gris}}; }
  let y = (rows.length ? totRow : r0) + 2;
  for (const n of (o.notas || [])) { ws.mergeCells(y, 1, y, Math.max(4, cols.length)); const c = ws.getCell(y, 1); c.value = n; c.font = {size: 9, italic: true, color: {argb: XC.gris}}; c.alignment = {wrapText: true, vertical: "top"}; ws.getRow(y).height = n.length > 140 ? 30 : 15; y++; }
  cols.forEach((c, i) => { let w = c.w || Math.max(String(c.h).length * .9, ...rows.slice(0, 400).map(r => { const v = val(c, r); return v == null ? 0 : v instanceof Date ? 10 : typeof v === "number" ? (c.t === "money" ? String(Math.round(v)).length * 1.35 + 2 : String(v).length + 2) : String(v).length; })) + 2; ws.getColumn(i + 1).width = Math.min(o.maxW || 46, Math.max(9, w)); });
  ws.pageSetup.printTitlesRow = HR + ":" + HR; ws._oli = {HR, r0, r1, totRow, cols};
  return ws;
}
// rango de una columna de una hoja de detalle (se calcula antes de crear la hoja: encabezado en la fila 5, datos desde la 6)
const rango = (h, k) => { const i = h.cols.findIndex(c => c.k === k || c.id === k), L = colL(i + 1), r0 = 6, r1 = Math.max(r0, 5 + h.n); return `'${h.nombre}'!$${L}$${r0}:$${L}$${r1}`; };
// tarjeta de indicador en hojas de resumen
function tarjeta(ws, r, c, etiqueta, valor, nf, nota) {
  ws.mergeCells(r, c, r, c + 1); ws.mergeCells(r + 1, c, r + 1, c + 1); const l = ws.getCell(r, c), v = ws.getCell(r + 1, c);
  l.value = etiqueta; l.font = {bold: true, size: 9, color: {argb: XC.gris}}; l.fill = {type: "pattern", pattern: "solid", fgColor: {argb: XC.crema}}; l.border = {top: {style: "thin", color: {argb: XC.borde}}, left: {style: "thin", color: {argb: XC.borde}}, right: {style: "thin", color: {argb: XC.borde}}};
  v.value = valor; if (nf) v.numFmt = nf; v.font = {bold: true, size: 17, color: {argb: XC.verdeO}}; v.fill = {type: "pattern", pattern: "solid", fgColor: {argb: XC.crema}}; v.alignment = {horizontal: "left", vertical: "middle"}; v.border = {bottom: {style: "thin", color: {argb: XC.borde}}, left: {style: "thin", color: {argb: XC.borde}}, right: {style: "thin", color: {argb: XC.borde}}};
  ws.getRow(r + 1).height = 28; if (nota) { const n = ws.getCell(r + 2, c); n.value = nota; n.font = {size: 8, italic: true, color: {argb: XC.gris}}; }
}
function seccion(ws, r, txt, span = 8) { ws.mergeCells(r, 1, r, span); const c = ws.getCell(r, 1); c.value = txt.toUpperCase(); c.font = {bold: true, size: 11, color: {argb: XC.verde}}; c.border = {bottom: {style: "thin", color: {argb: XC.verde}}}; ws.getRow(r).height = 20; }
function lineaTexto(ws, r, txt, o = {}) { ws.mergeCells(r, 1, r, o.span || 8); const c = ws.getCell(r, 1); c.value = txt; c.font = Object.assign({size: 10, color: {argb: o.color || XC.tinta}}, o.font || {}); c.alignment = {wrapText: true, vertical: "top"}; if (o.h) ws.getRow(r).height = o.h; return r + 1; }
function imagen(wb, ws, png, col, row, w, h) { const id = wb.addImage({base64: png, extension: "png"}); ws.addImage(id, {tl: {col, row}, ext: {width: w, height: h}}); }
const xlsxBlob = async wb => new Blob([await wb.xlsx.writeBuffer()], {type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});

/* columnas de cada tabla (las mismas en el informe gerencial, los Excel por módulo y el paquete del contador) */
const COLS = {
  ventas: [{h: "ID venta", k: "id"}, {h: "N.º", k: "num"}, {h: "Fecha", k: "fecha", t: "fecha"}, {h: "Hora", k: "hora"}, {h: "Caja", k: "caja"}, {h: "Empleado", k: "empleado"}, {h: "Producto", k: "producto"}, {h: "Categoría", k: "categoria"}, {h: "Cantidad", k: "cantidad", t: "num", tot: 1}, {h: "Precio unitario", k: "precio", t: "money"}, {h: "Descuento", k: "descuento", t: "money", tot: 1}, {h: "Subtotal (base)", k: "subtotal", t: "money", tot: 1}, {h: "Impuesto", k: "impuesto", t: "money", tot: 1}, {h: "Total", k: "total", t: "money", tot: 1}, {h: "Tratamiento tributario", f: r => TIPO_IMP[r.impTipo] || r.impTipo}, {h: "Método de pago", k: "metodo"}, {h: "Cliente", k: "cliente"}, {h: "Estado", k: "estado", estado: 1}, {h: "Estado sincronización", k: "sync"}],
  inventario: [{h: "Producto", k: "producto"}, {h: "SKU / código", k: "sku"}, {h: "Categoría", k: "categoria"}, {h: "Tipo", k: "tipo"}, {h: "Unidad", k: "unidad"}, {h: "Inventario inicial", k: "inicial", t: "num"}, {h: "Entradas", k: "entradas", t: "num", tot: 1}, {h: "Salidas", k: "salidas", t: "num", tot: 1}, {h: "Ventas", k: "ventas", t: "num", tot: 1}, {h: "Mermas", k: "mermas", t: "num", tot: 1}, {h: "Consumo en producción", k: "consumo", t: "num", tot: 1}, {h: "Ajustes (conteos)", k: "ajustes", t: "num", tot: 1, neg: 1}, {h: "Inventario final", k: "final", t: "num", neg: 1}, {h: "Costo unitario", k: "costo", t: "money"}, {h: "Valor inventario", id: "valor", f: r => r.final != null && r.costo != null ? Math.max(0, r.final) * r.costo : null, t: "money", tot: 1}, {h: "Inventario mínimo", k: "minimo", t: "num"}, {h: "Stock de seguridad", k: "seguridad", t: "num"}, {h: "Días de cobertura", k: "cobertura", t: "num"}, {h: "Estado", k: "estado", estado: 1}],
  compras: [{h: "Proveedor", k: "proveedor"}, {h: "NIT", k: "nit"}, {h: "Fecha", k: "fecha", t: "fecha"}, {h: "Factura", k: "factura"}, {h: "Producto", k: "producto"}, {h: "Cantidad", k: "cantidad", t: "num", tot: 1}, {h: "Unidad", k: "unidad"}, {h: "Costo unitario", k: "costo", t: "money"}, {h: "IVA", k: "iva", t: "money", tot: 1}, {h: "Total", k: "total", t: "money", tot: 1}, {h: "Estado", k: "estado"}, {h: "Recibido", k: "recibido", t: "num", tot: 1}, {h: "Pendiente", k: "pendiente", t: "num", tot: 1}, {h: "Tipo de soporte", k: "tipoSoporte"}, {h: "Soporte (referencia)", k: "soporte"}],
  recomendacion: [{h: "Producto", k: "producto"}, {h: "Inventario", k: "inventario", t: "num"}, {h: "Consumo promedio / día", k: "consumo", t: "num"}, {h: "Demanda estimada (7 días)", k: "demanda", t: "num"}, {h: "Stock de seguridad", k: "seguridad", t: "num"}, {h: "Cantidad recomendada", k: "cantidad", t: "num", tot: 1}, {h: "Proveedor sugerido", k: "proveedor"}, {h: "Costo estimado", k: "costoTotal", t: "money", tot: 1}, {h: "Fecha recomendada de compra", k: "fecha", t: "fecha"}, {h: "Motivo", k: "motivo"}],
  cajas: [{h: "Fecha", k: "fecha", t: "fecha"}, {h: "Caja", k: "caja"}, {h: "Empleado", k: "empleado"}, {h: "Apertura", k: "apertura", t: "money", tot: 1}, {h: "Ventas efectivo", k: "efectivo", t: "money", tot: 1}, {h: "Ventas digitales y tarjeta", k: "digitales", t: "money", tot: 1}, {h: "Entradas de dinero", k: "ingresos", t: "money", tot: 1}, {h: "Retiros", k: "retiros", t: "money", tot: 1}, {h: "Gastos pagados en caja", k: "gastos", t: "money", tot: 1}, {h: "Efectivo esperado", k: "esperado", t: "money", tot: 1}, {h: "Efectivo contado", k: "contado", t: "money", tot: 1}, {h: "Diferencia", k: "diferencia", t: "money", tot: 1, neg: 1}, {h: "Hora apertura", k: "hAp"}, {h: "Hora cierre", k: "hCi"}, {h: "Estado", k: "estado"}, {h: "Observación", k: "obs"}],
  movCaja: [{h: "Fecha", k: "fecha", t: "fecha"}, {h: "Hora", k: "hora"}, {h: "Caja", k: "caja"}, {h: "Tipo", k: "tipo"}, {h: "Valor", k: "valor", t: "money", tot: 1}, {h: "Motivo", k: "motivo"}, {h: "Usuario", k: "usuario"}, {h: "Soporte", k: "soporte"}],
  gastos: [{h: "Fecha", k: "fecha", t: "fecha"}, {h: "Proveedor", k: "proveedor"}, {h: "Categoría", k: "categoria"}, {h: "Descripción", k: "descripcion"}, {h: "Base", k: "base", t: "money", tot: 1}, {h: "IVA", k: "iva", t: "money", tot: 1}, {h: "Retención", k: "retencion", t: "money", tot: 1}, {h: "Total", k: "total", t: "money", tot: 1}, {h: "Método de pago", k: "metodo"}, {h: "Caja / banco", k: "cuenta"}, {h: "Usuario", k: "usuario"}, {h: "Soporte", k: "soporte"}, {h: "Estado", k: "estado"}],
  rent: [{h: "Producto", k: "producto"}, {h: "Categoría", k: "categoria"}, {h: "Unidades vendidas", k: "unidades", t: "num", tot: 1}, {h: "Ventas", k: "ventas", t: "money", tot: 1}, {h: "Costo", k: "costo", t: "money", tot: 1}, {h: "Utilidad bruta", k: "bruta", t: "money", tot: 1, neg: 1}, {h: "Margen", k: "margen", t: "pct"}, {h: "Descuentos", k: "descuentos", t: "money", tot: 1}, {h: "Merma (costo)", k: "merma", t: "money", tot: 1}, {h: "Utilidad neta estimada", k: "neta", t: "money", tot: 1, neg: 1}, {h: "Costo completo", f: r => r.costoOk ? "Sí" : "Falta costo de " + r.sinCosto + " und"}],
  mermas: [{h: "Producto", k: "producto"}, {h: "Fecha", k: "fecha", t: "fecha"}, {h: "Cantidad", k: "cantidad", t: "num", tot: 1}, {h: "Unidad", k: "unidad"}, {h: "Costo unitario", k: "costo", t: "money"}, {h: "Costo total", k: "total", t: "money", tot: 1}, {h: "Motivo", k: "motivo"}, {h: "Empleado", k: "empleado"}, {h: "Observación", k: "obs"}],
  clientes: [{h: "Identificación", k: "cliente"}, {h: "Nombre", k: "nombre"}, {h: "Correo", k: "correo"}, {h: "Última compra", k: "ultima", t: "fecha"}, {h: "Número de compras", k: "compras", t: "int", tot: 1}, {h: "Total comprado", k: "total", t: "money", tot: 1}, {h: "Ticket promedio", k: "ticket", t: "money"}, {h: "Producto favorito", k: "favorito"}, {h: "Puntos", k: "puntos", t: "int"}, {h: "Estado", k: "estado"}],
  anul: [{h: "Fecha", k: "fecha", t: "fecha"}, {h: "Hora", k: "hora"}, {h: "Venta", k: "venta"}, {h: "Total anulado", k: "total", t: "money", tot: 1}, {h: "Motivo", k: "motivo"}, {h: "Usuario", k: "usuario"}],
  audit: [{h: "Fecha", k: "fecha", t: "fecha"}, {h: "Hora", k: "hora"}, {h: "Acción", k: "accion"}, {h: "Código", k: "codigo"}, {h: "Registro", k: "registro"}, {h: "Detalle", k: "detalle"}, {h: "Usuario", k: "usuario"}, {h: "Equipo", k: "equipo"}],
  riesgos: [{h: "Riesgo", k: "riesgo", estado: 1}, {h: "Tipo", k: "tipo"}, {h: "Acción / detalle", k: "accion"}, {h: "Usuario", k: "usuario"}, {h: "Fecha", k: "fecha"}, {h: "Soporte / referencia", k: "soporte"}],
  ajustes: [{h: "Fecha", k: "fecha", t: "fecha"}, {h: "Hora", k: "hora"}, {h: "Producto", k: "producto"}, {h: "Tipo de movimiento", k: "tipo"}, {h: "Cantidad (+/−)", k: "cantidad", t: "num", tot: 1, neg: 1}, {h: "Antes", k: "antes", t: "num"}, {h: "Después", k: "despues", t: "num"}, {h: "Motivo / referencia", k: "motivo"}, {h: "Usuario", k: "usuario"}],
  terceros: [{h: "Nombre / razón social", k: "nombre"}, {h: "NIT / identificación", k: "nit"}, {h: "Tipo", k: "tipo"}, {h: "Registros", k: "registros", t: "int", tot: 1}, {h: "Valor operaciones (base)", k: "compras", t: "money", tot: 1}, {h: "IVA", k: "iva", t: "money", tot: 1}, {h: "Retención", k: "retencion", t: "money", tot: 1}, {h: "Identificación completa", f: r => r.completo ? "Sí" : "Falta NIT o nombre"}],
  dias: [{h: "Fecha", k: "fecha", t: "fecha"}, {h: "Día", f: r => DOW[dowOf(r.fecha)]}, {h: "Número de ventas", k: "n", t: "int", tot: 1}, {h: "Ventas", k: "ventas", t: "money", tot: 1}, {h: "Costo de ventas", k: "costo", t: "money", tot: 1}, {h: "Utilidad bruta", k: "bruta", t: "money", tot: 1}]
};
const NOTA_COSTOS = "El costo de ventas usa el costo registrado de cada producto en la fecha de la venta. Si un producto no tiene costo, se indica y no se inventa.";
const NOTA_FILTRO = d => d.filtrado ? "Informe filtrado (" + filtrosTxt(d.F) + "). Los gastos generales no se reparten por producto, caja o empleado." : "";

// hoja de resumen ejecutivo con fórmulas que leen las hojas de detalle
function hojaResumen(wb, d, hojas, titulo) {
  const ws = hojaBase(wb, "Resumen ejecutivo", titulo, d, 8, 0); for (let i = 1; i <= 8; i++) ws.getColumn(i).width = 17;
  seccion(ws, 5, "Resumen ejecutivo");
  const V = hojas.ventas, R = hojas.rent, G = hojas.gastos;
  const fVentas = V ? `SUMIFS(${rango(V, "total")},${rango(V, "estado")},"Confirmada")` : null, fCosto = R ? `SUM(${rango(R, "costo")})` : null, fGastos = G && d.gastosOp != null ? `SUMIFS(${rango(G, "total")},${rango(G, "categoria")},"<>${BASE_COSTO}")` : null;
  tarjeta(ws, 6, 1, "VENTAS", fVentas ? {formula: fVentas, result: d.tot} : d.tot, XF.money);
  tarjeta(ws, 6, 3, "COSTO DE VENTAS", fCosto ? {formula: fCosto, result: d.costo} : d.costo, XF.money, d.sinCosto ? "Faltan costos en " + d.sinCosto + " líneas" : "");
  tarjeta(ws, 6, 5, "UTILIDAD BRUTA", {formula: "A7-C7", result: d.bruta}, XF.money);
  tarjeta(ws, 6, 7, "GASTOS", d.gastosOp == null ? "No aplica con filtro" : fGastos ? {formula: fGastos, result: d.gastosOp} : d.gastosOp, XF.money, "Sin materia prima (ya está en el costo)");
  tarjeta(ws, 10, 1, "UTILIDAD ESTIMADA", d.util == null ? "–" : {formula: "E7-G7", result: d.util}, XF.money);
  tarjeta(ws, 10, 3, "MARGEN", d.util == null || !d.tot ? "–" : {formula: "IF(A7=0,0,A11/A7)", result: d.margen}, XF.pct);
  tarjeta(ws, 10, 5, "NÚMERO DE VENTAS", d.n, XF.int);
  tarjeta(ws, 10, 7, "TICKET PROMEDIO", {formula: "IF(E11=0,0,A7/E11)", result: d.ticket}, XF.money);
  tarjeta(ws, 14, 1, "UNIDADES VENDIDAS", d.uds, XF.num); tarjeta(ws, 14, 3, "DESCUENTOS", d.desc, XF.money); tarjeta(ws, 14, 5, "VENTAS ANULADAS", d.anuladas, XF.int, d.anuladas ? fmt(d.anuladoTot) + " no se suman" : ""); tarjeta(ws, 14, 7, "MARGEN BRUTO", {formula: "IF(A7=0,0,E7/A7)", result: d.margenBruto || 0}, XF.pct);
  let y = 18; seccion(ws, y++, "Control de integridad");
  const inc = d.integ.length; y = lineaTexto(ws, y, inc ? "EL INFORME TIENE " + inc + (inc === 1 ? " INCONSISTENCIA" : " INCONSISTENCIAS") + " (detalle en la hoja Integridad)" : "Sin inconsistencias detectadas en el periodo.", {font: {bold: true, size: 11}, color: inc ? XC.rojo : XC.verdeO});
  for (const c of d.control) y = lineaTexto(ws, y, (c.ok ? "✓ " : "✗ ") + c.t + (c.ok ? "" : " — diferencia " + fmt(c.x - c.y)), {color: c.ok ? XC.verdeO : XC.rojo});
  if (d.filtrado) y = lineaTexto(ws, y, NOTA_FILTRO(d), {color: XC.gris, font: {italic: true, size: 9}});
  y++; seccion(ws, y++, "Gráficos");
  try {
    const serie = d.dias.map(x => ({l: diaEje(x.fecha), v: x.ventas, v2: x.bruta}));
    imagen(wb, ws, grafico("barras", serie, {titulo: "Ventas y utilidad bruta por día", v2: true, leyenda: ["Ventas", "Utilidad bruta"]}), 0, y, 560, 262);
    let ac = 0; const acum = d.dias.map(x => ({l: diaEje(x.fecha), v: (ac += x.ventas)}));
    imagen(wb, ws, grafico("linea", acum, {titulo: "Evolución de ventas (acumulado)"}), 4.4, y, 560, 262);
    y += 15;
    const tp = d.rent.slice().sort((p, q) => q.ventas - p.ventas).slice(0, 8).map(r => ({l: r.producto, v: r.ventas}));
    imagen(wb, ws, grafico("hbar", tp, {titulo: "Productos que más venden", h: 380}), 0, y, 560, 262);
    const cs = d.cats.slice(0, 6); if (d.cats.length > 6) cs.push({n: "Otras", v: sum(d.cats.slice(6), c => c.v)});
    imagen(wb, ws, grafico("dona", cs.map(c => ({l: c.n, v: c.v})), {titulo: "Ventas por categoría"}), 4.4, y, 560, 262);
    y += 15;
  } catch (e) { y = lineaTexto(ws, y, "No se pudieron dibujar los gráficos en este equipo.", {color: XC.gris}); }
  seccion(ws, y++, "Lo más importante");
  const masV = top5(d.rent, "unidades", 3).map(r => r.producto + " (" + fmtN(r.unidades, 0) + ")").join(", "), masR = d.rent.filter(r => r.costoOk).slice(0, 3).map(r => r.producto + " (" + fmt(r.bruta) + ")").join(", ");
  y = lineaTexto(ws, y, "Más vendidos: " + (masV || "—")); y = lineaTexto(ws, y, "Más rentables: " + (masR || "—"));
  if (d.metodos.length) y = lineaTexto(ws, y, "Medios de pago: " + d.metodos.map(m => m.n + " " + fmt(m.v) + " (" + pct(d.tot ? m.v / d.tot : 0) + ")").join(" · "));
  const ag = d.inv.filter(r => r.estado === "AGOTADO").map(r => r.producto); y = lineaTexto(ws, y, "Agotados al cierre: " + (ag.length ? ag.join(", ") : "ninguno"));
  if (d.rec.length) y = lineaTexto(ws, y, "Comprar: " + d.rec.slice(0, 5).map(r => r.cantidad + " " + r.producto).join(", "));
  y++; y = lineaTexto(ws, y, NOTA_COSTOS, {color: XC.gris, font: {italic: true, size: 9}, h: 26});
  lineaTexto(ws, y, "OLI · Software propiedad de VP Visual Project · Creado por Víctor Palacio", {color: XC.gris, font: {size: 8}});
  return ws;
}
function hojaIntegridad(wb, d) {
  const rows = d.integ.map(x => ({sev: x.sev === "bad" ? "Alto" : "Medio", t: x.t, n: x.n, d: x.d})).concat(d.control.map(c => ({sev: c.ok ? "OK" : "Alto", t: "Control: " + c.t, n: c.ok ? 0 : 1, d: c.ok ? "Cuadra" : "Diferencia " + fmt(c.x - c.y)})));
  return hojaTabla(wb, "Integridad", "Control de integridad", [{h: "Severidad", k: "sev", estado: 1}, {h: "Validación", k: "t"}, {h: "Cantidad", k: "n", t: "int"}, {h: "Detalle", k: "d"}], rows, d, {notas: [d.integ.length ? "EL INFORME TIENE " + d.integ.length + (d.integ.length === 1 ? " INCONSISTENCIA." : " INCONSISTENCIAS.") : "Sin inconsistencias detectadas."]});
}
async function excelGerencial(d) {
  await lib("ExcelJS"); const wb = nuevoLibro(), titulo = "Informe gerencial";
  hojaResumen(wb, d, {ventas: {nombre: "Ventas", cols: COLS.ventas, n: d.ventas.length}, rent: {nombre: "Rentabilidad", cols: COLS.rent, n: d.rent.length}, gastos: {nombre: "Gastos", cols: COLS.gastos, n: d.gastos.length}}, titulo);
  hojaTabla(wb, "Ventas", "Detalle de ventas", COLS.ventas, d.ventas, d, {notas: [NOTA_FILTRO(d)].filter(Boolean)});
  hojaTabla(wb, "Por día", "Ventas por día", COLS.dias, d.dias, d);
  hojaTabla(wb, "Rentabilidad", "Rentabilidad por producto", COLS.rent, d.rent, d, {notas: [NOTA_COSTOS, "Ordenado de más a menos rentable. Usa los filtros del encabezado para ordenar por unidades, margen o ventas."]});
  hojaTabla(wb, "Inventario", "Inventario", COLS.inventario, d.inv, d, {leyenda: ["NORMAL", "BAJO", "AGOTADO", "RIESGO", "SIN CONTAR"], notas: ["Inventario inicial = final − entradas + salidas − ajustes. Valor a costo actual."]});
  hojaTabla(wb, "Compras recomendadas", "Recomendación de compra", COLS.recomendacion, d.rec, d, {notas: ["Recomendación = demanda estimada (7 días) + seguridad − inventario − pedidos pendientes. OLI recomienda; tú decides."]});
  hojaTabla(wb, "Cajas", "Cajas", COLS.cajas, d.cajas, d);
  hojaTabla(wb, "Gastos", "Gastos", COLS.gastos, d.gastos, d, {notas: ["Los gastos de la categoría “" + BASE_COSTO + "” no se restan otra vez: ya están en el costo de ventas."]});
  hojaTabla(wb, "Mermas", "Mermas", COLS.mermas, d.mermas, d);
  hojaIntegridad(wb, d);
  return xlsxBlob(wb);
}
// Excel por módulo
const MODULOS = {
  ventas: {t: "Ventas", hojas: d => [["Detalle de ventas", COLS.ventas, d.ventas, {notas: [NOTA_FILTRO(d)].filter(Boolean)}], ["Por día", COLS.dias, d.dias], ["Por medio de pago", [{h: "Medio de pago", k: "n"}, {h: "Ventas", k: "v", t: "money", tot: 1}, {h: "Participación", f: r => d.tot ? r.v / d.tot : 0, t: "pct"}], d.metodos], ["Por empleado", [{h: "Empleado", k: "n"}, {h: "Ventas", k: "v", t: "money", tot: 1}], d.empleados]]},
  inventario: {t: "Inventario", hojas: d => [["Inventario", COLS.inventario, d.inv, {leyenda: ["NORMAL", "BAJO", "AGOTADO", "RIESGO", "SIN CONTAR"], notas: ["Inventario inicial = final − entradas + salidas − ajustes."]}], ["Movimientos", COLS.ajustes, d.ajustes, {vacio: "Sin entradas, conteos ni producción en el periodo."}]]},
  compras: {t: "Compras", hojas: d => [["Compras", COLS.compras, d.compras], ["Recomendación de compra", COLS.recomendacion, d.rec, {notas: ["OLI recomienda; la decisión de compra es tuya."]}]]},
  caja: {t: "Caja", hojas: d => [["Cajas", COLS.cajas, d.cajas], ["Detalle movimientos de caja", COLS.movCaja, d.movCaja]]},
  gastos: {t: "Gastos", hojas: d => [["Gastos", COLS.gastos, d.gastos], ["Por categoría", [{h: "Categoría", k: "n"}, {h: "Total", k: "v", t: "money", tot: 1}], agruparPor(d.gastos, "categoria", "total")]]},
  rentabilidad: {t: "Rentabilidad", hojas: d => [["Rentabilidad por producto", COLS.rent, d.rent, {notas: [NOTA_COSTOS]}], ["Más vendidos", COLS.rent, top5(d.rent, "unidades", 50)], ["Mayor margen", COLS.rent, d.rent.filter(r => r.margen != null).sort((x, y) => y.margen - x.margen)], ["Menor margen", COLS.rent, d.rent.filter(r => r.margen != null).sort((x, y) => x.margen - y.margen)], ["Baja rotación", [{h: "Producto", f: r => r.p.nombre}, {h: "Inventario", k: "st", t: "num"}, {h: "Vendidas en 30 días", k: "u30", t: "int"}, {h: "Días de inventario", f: r => r.cov === Infinity ? null : Math.round(r.cov), t: "int"}, {h: "Recomendación", k: "rec"}], productosLentos()]]},
  mermas: {t: "Mermas", hojas: d => [["Mermas", COLS.mermas, d.mermas, {notas: resumenMermas(d)}]]},
  clientes: {t: "Clientes", hojas: d => [["Clientes", COLS.clientes, d.clientes, {vacio: "No hay clientes registrados (solo se guardan datos cuando el cliente pide factura).", notas: ["Solo se exportan los datos necesarios para facturación (identificación, nombre y correo). No se recolecta información personal adicional."]}]]},
  auditoria: {t: "Auditoría", hojas: d => [["Auditoría del periodo", COLS.riesgos, d.riesgos, {vacio: "Sin eventos de riesgo en el periodo.", notas: ["Un riesgo indica algo para revisar, no una falta comprobada."]}], ["Registro de acciones", COLS.audit, d.audit], ["Anulaciones", COLS.anul, d.anul]]},
  impuestos: {t: "Impuestos", hojas: d => [["Impuestos", COLS_IMP, filasImpuestos(d), {notas: [AVISO_TRIB, "Las tarifas salen del tratamiento configurado en cada producto. OLI no asume tarifas por el nombre del producto."]}]]},
  terceros: {t: "Terceros", hojas: d => [["Terceros", COLS.terceros, d.terceros, {notas: ["Base para preparar información exógena. Formatos y versiones se parametrizan en Contabilidad → Exógena."]}]]}
};
function agruparPor(rows, k, v) { const m = {}; for (const r of rows) m[r[k] || "Sin dato"] = (m[r[k] || "Sin dato"] || 0) + (r[v] || 0); return Object.entries(m).map(([n, x]) => ({n, v: x})).sort((a, b) => b.v - a.v); }
function resumenMermas(d) {
  const tot = sum(d.mermas, m => m.total || 0), comp = sum(d.compras.filter(c => c.estado === "Recibida"), c => c.total - c.iva), por = agruparPor(d.mermas, "producto", "total")[0];
  return ["Merma total: " + fmtN(sum(d.mermas, m => m.cantidad), 2) + " unidades", "Costo total: " + fmt(tot), "Porcentaje sobre compras: " + (comp ? pct(tot / comp, 1) : "sin compras registradas"), "Producto con mayor merma: " + (por ? por.n + " (" + fmt(por.v) + ")" : "—")];
}
const COLS_IMP = [{h: "Concepto", k: "c"}, {h: "Tratamiento", k: "t"}, {h: "Tarifa", k: "r", t: "pct"}, {h: "Base", k: "base", t: "money", tot: 1}, {h: "Impuesto", k: "imp", t: "money", tot: 1}, {h: "Total", k: "total", t: "money", tot: 1}, {h: "Estado", k: "e"}];
function filasImpuestos(d) {
  const out = d.imp.ventas.map(x => ({c: "Ventas", t: TIPO_IMP[x.tipo] || x.tipo, r: x.tarifa, base: x.base, imp: x.impuesto, total: x.total, e: x.tipo === "validar" ? "POR VALIDAR con el contador" : "Configurado"}));
  out.push({c: "IVA en compras registradas", t: "IVA descontable (por validar)", r: null, base: null, imp: d.imp.ivaCompras, total: null, e: "Según soportes registrados"});
  out.push({c: "IVA en gastos registrados", t: "IVA (por validar)", r: null, base: null, imp: d.imp.ivaGastos, total: null, e: "Según soportes registrados"});
  out.push({c: "Retenciones registradas en gastos", t: "Retención", r: null, base: null, imp: d.imp.retenciones, total: null, e: "Según registro"});
  return out;
}
async function excelModulo(k, d) {
  await lib("ExcelJS"); const M = MODULOS[k], wb = nuevoLibro();
  for (const [n, cols, rows, o] of M.hojas(d)) hojaTabla(wb, n, n === M.t ? M.t : M.t + " · " + n, cols, rows || [], d, o || {});
  return xlsxBlob(wb);
}

/* ---------- PDF ---------- */
const PDFC = {verde: [47, 123, 90], verdeO: [31, 92, 67], menta: [227, 241, 234], crema: [250, 247, 240], tinta: [34, 48, 42], gris: [107, 122, 114], borde: [213, 224, 217], rojo: [176, 58, 46], amb: [154, 106, 18]};
const pt = s => String(s == null ? "" : s).replace(/[✓✔]/g, "OK").replace(/[✗✘]/g, "X").replace(/⚠️?/g, "!").replace(/→/g, "->").replace(/≈/g, "~").replace(/−/g, "-").replace(/[^\x00-\xFF–—•…‘’“”€]/g, "");
function pdfNuevo() { const doc = new window.jspdf.jsPDF({unit: "mm", format: "a4", compress: true}); doc.setProperties({title: "OLI", author: "OLI · VP Visual Project", creator: "OLI " + BRAND.version + " · VP Visual Project", subject: "Informe OLI"}); doc._y = 20; return doc; }
const PW = 210, PM = 16, PCW = PW - PM * 2;
function pdfNecesita(doc, h) { if (doc._y + h > 278) { doc.addPage(); doc._y = 20; } }
function pdfTxt(doc, s, o = {}) { doc.setFont("helvetica", o.b ? "bold" : "normal"); doc.setFontSize(o.size || 10); doc.setTextColor(...(o.c || PDFC.tinta)); const ls = doc.splitTextToSize(pt(s), o.w || PCW); const lh = (o.size || 10) * .42 + .6; pdfNecesita(doc, ls.length * lh + 1); doc.text(ls, o.x || PM, doc._y); doc._y += ls.length * lh + (o.after == null ? 1.5 : o.after); }
function pdfH(doc, s, n) { pdfNecesita(doc, 40); doc._y += 3; doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(...PDFC.verde); doc.text(pt((n ? n + ". " : "") + s), PM, doc._y); doc.setDrawColor(...PDFC.verde); doc.setLineWidth(.4); doc.line(PM, doc._y + 2, PW - PM, doc._y + 2); doc._y += 9; }
function pdfH2(doc, s) { pdfNecesita(doc, 32); doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...PDFC.verdeO); doc.text(pt(s), PM, doc._y); doc._y += 5.5; }
function pdfKpis(doc, items, porFila = 3) {
  const gap = 4, w = (PCW - gap * (porFila - 1)) / porFila, h = 21;
  for (let i = 0; i < items.length; i += porFila) { pdfNecesita(doc, h + 4); items.slice(i, i + porFila).forEach((k, j) => { const x = PM + j * (w + gap), y = doc._y; doc.setFillColor(...PDFC.crema); doc.setDrawColor(...PDFC.borde); doc.roundedRect(x, y, w, h, 2.5, 2.5, "FD");
    doc.setFont("helvetica", "bold"); doc.setFontSize(7.5); doc.setTextColor(...PDFC.gris); doc.text(pt(k.l).toUpperCase(), x + 4, y + 6); doc.setFontSize(k.v.length > 13 ? 12 : 14.5); doc.setTextColor(...(k.c || PDFC.verdeO)); doc.text(pt(k.v), x + 4, y + 14);
    if (k.s) { doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...PDFC.gris); doc.text(pt(k.s).slice(0, 48), x + 4, y + 18.5); } }); doc._y += h + gap; }
  doc._y += 1;
}
function pdfTabla(doc, head, body, o = {}) {
  if (!body.length) { pdfTxt(doc, o.vacio || "Sin registros en este periodo.", {c: PDFC.gris, size: 9}); return; }
  pdfNecesita(doc, 16);
  doc.autoTable({startY: doc._y, head: [head.map(pt)], body: body.map(r => r.map(pt)), margin: {left: PM, right: PM, top: 18, bottom: 18}, theme: o.plano ? "grid" : "plain",
    styles: {font: "helvetica", fontSize: o.size || 8.4, cellPadding: 1.7, textColor: PDFC.tinta, lineColor: PDFC.borde, lineWidth: o.plano ? .1 : 0, overflow: "linebreak"},
    headStyles: {fillColor: PDFC.menta, textColor: PDFC.verdeO, fontStyle: "bold", lineWidth: 0}, alternateRowStyles: o.plano ? {} : {fillColor: [252, 251, 247]}, columnStyles: o.cols || {},
    foot: o.foot ? [o.foot.map(pt)] : undefined, footStyles: {fillColor: PDFC.crema, textColor: PDFC.verdeO, fontStyle: "bold"}, showFoot: "lastPage",
    didParseCell: o.color ? (h => { if (h.section === "body") { const c = o.color(h.row.index, h.column.index, h.cell.raw); if (c) { h.cell.styles.textColor = c; h.cell.styles.fontStyle = "bold"; } } }) : undefined});
  doc._y = doc.lastAutoTable.finalY + 6;
}
function pdfImg(doc, png, h = 72) { pdfNecesita(doc, h + 4); doc.addImage(png, "PNG", PM, doc._y, PCW, h, undefined, "FAST"); doc._y += h + 5; }
function pdfAviso(doc, s, tipo) { const c = tipo === "bad" ? PDFC.rojo : tipo === "warn" ? PDFC.amb : PDFC.verdeO; doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); const ls = doc.splitTextToSize(pt(s), PCW - 10), h = ls.length * 4.6 + 6; pdfNecesita(doc, h + 3); doc.setFillColor(...(tipo ? [252, 246, 236] : PDFC.menta)); doc.roundedRect(PM, doc._y, PCW, h, 2, 2, "F"); doc.setFillColor(...c); doc.rect(PM, doc._y, 1.6, h, "F"); doc.setTextColor(...c); doc.text(ls, PM + 6, doc._y + 5.6); doc._y += h + 4; }
function pdfPortada(doc, titulo, sub, d) {
  doc.setFillColor(...PDFC.crema); doc.rect(0, 0, PW, 297, "F"); doc.setFillColor(...PDFC.verde); doc.rect(0, 0, PW, 6, "F");
  try { doc.addImage(logoPNG(), "PNG", PM, 54, 66, 27.5); } catch (e) { doc.setFont("helvetica", "bold"); doc.setFontSize(48); doc.setTextColor(...PDFC.verde); doc.text("OLI", PM, 76); }
  doc.setFont("helvetica", "bold"); doc.setFontSize(28); doc.setTextColor(...PDFC.tinta); doc.text(pt(titulo), PM, 112);
  doc.setFont("helvetica", "normal"); doc.setFontSize(13); doc.setTextColor(...PDFC.gris); doc.text(pt(sub), PM, 122);
  doc.setDrawColor(...PDFC.verde); doc.setLineWidth(.8); doc.line(PM, 132, PM + 40, 132);
  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...PDFC.verdeO); doc.text(pt("Periodo: " + periodoDoc(d.a, d.b)), PM, 146);
  doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(...PDFC.tinta); doc.text(pt(negocioNombre()), PM, 154); doc.setTextColor(...PDFC.gris); doc.setFontSize(9.5); doc.text(pt("Generado: " + generadoTxt()), PM, 161);
  if (d.filtrado) doc.text(pt("Filtros: " + filtrosTxt(d.F)), PM, 167);
  doc.setFontSize(8.5); doc.text(pt("OLI · Sistema inteligente de gestión y punto de venta"), PM, 280); doc.text(pt("Software propiedad de VP Visual Project · Creado por Víctor Palacio"), PM, 285);
  doc.addPage(); doc._y = 20;
}
function pdfCierre(doc, titulo) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) { doc.setPage(i); doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...PDFC.gris);
    if (i > 1 || !doc._portada) { doc.setDrawColor(...PDFC.borde); doc.setLineWidth(.2); doc.line(PM, 286, PW - PM, 286); doc.text(pt("OLI · Software propiedad de VP Visual Project · Creado por Víctor Palacio"), PM, 290.5); doc.text(pt("Página " + i + " de " + n), PW - PM, 290.5, {align: "right"}); doc.text(pt(titulo), PW - PM, 11, {align: "right"}); } }
  return doc.output("blob");
}
const filasPdf = (rows, ks) => rows.map(r => ks.map(k => typeof k === "function" ? k(r) : r[k]));
const vx = v => v == null ? "–" : v;
async function pdfEmpresarial(d) {
  await lib("autotable"); const doc = pdfNuevo(); doc._portada = true; pdfPortada(doc, "Informe empresarial", "Resumen de la operación, rentabilidad y recomendaciones", d);
  const [pa, pb] = periodoAnterior(d.a, d.b), ant = datosVentasRapido(pa, pb, d.F), cmp = comparable(d, ant), dif = (x, y) => cmp && y ? (x >= y ? "+" : "") + pct((x - y) / y) + " vs periodo anterior" : "sin periodo anterior comparable";
  pdfH(doc, "Resumen ejecutivo", 1);
  pdfKpis(doc, [{l: "Ventas", v: fmt(d.tot), s: dif(d.tot, ant.tot)}, {l: "Utilidad bruta", v: fmt(d.bruta), s: "Margen bruto " + pct(d.margenBruto || 0)}, {l: "Utilidad estimada", v: d.util == null ? "–" : fmt(d.util), s: d.util == null ? "No aplica con filtro" : "Margen " + pct(d.margen || 0), c: d.util != null && d.util < 0 ? PDFC.rojo : null},
    {l: "Número de ventas", v: fmtN(d.n, 0), s: dif(d.n, ant.n)}, {l: "Ticket promedio", v: fmt(d.ticket)}, {l: "Gastos", v: d.gastosOp == null ? "–" : fmt(d.gastosOp), s: "Sin materia prima"}]);
  const tp = top5(d.rent, "unidades", 1)[0], tr = d.rent.filter(r => r.costoOk)[0];
  pdfTxt(doc, `En el periodo se registraron ${fmtN(d.n, 0)} ventas por ${fmt(d.tot)}, con un ticket promedio de ${fmt(d.ticket)}. ${tp ? "El producto más vendido fue " + tp.producto + " (" + fmtN(tp.unidades, 0) + " unidades)" : ""}${tr && tp && tr.pid !== tp.pid ? " y el que más utilidad dejó fue " + tr.producto + " (" + fmt(tr.bruta) + ")." : tp ? "." : ""} ${d.sinCosto ? "Hay " + d.sinCosto + " líneas de venta sin costo registrado: la utilidad real puede ser menor." : ""}`);
  if (d.integ.length) pdfAviso(doc, "EL INFORME TIENE " + d.integ.length + (d.integ.length === 1 ? " INCONSISTENCIA" : " INCONSISTENCIAS") + ": " + d.integ.slice(0, 4).map(x => x.t + " (" + x.n + ")").join(", ") + ".", "warn");
  pdfH(doc, "Ventas", 2);
  try { pdfImg(doc, grafico("barras", d.dias.map(x => ({l: diaEje(x.fecha), v: x.ventas, v2: x.bruta})), {titulo: "Ventas y utilidad bruta por día", v2: true, leyenda: ["Ventas", "Utilidad bruta"], h: 380}), 64); } catch (e) {}
  pdfTabla(doc, ["Medio de pago", "Ventas", "Participación"], d.metodos.map(m => [m.n, fmt(m.v), pct(d.tot ? m.v / d.tot : 0)]), {cols: {1: {halign: "right"}, 2: {halign: "right"}}});
  pdfH(doc, "Rentabilidad", 3);
  pdfTabla(doc, ["Producto", "Unid.", "Ventas", "Costo", "Utilidad bruta", "Margen"], d.rent.slice(0, 12).map(r => [r.producto, fmtN(r.unidades, 0), fmt(r.ventas), r.costoOk ? fmt(r.costo) : "Falta costo", fmt(r.bruta), r.margen == null ? "–" : pct(r.margen)]), {cols: {1: {halign: "right"}, 2: {halign: "right"}, 3: {halign: "right"}, 4: {halign: "right"}, 5: {halign: "right"}}, foot: ["Total", fmtN(d.uds, 0), fmt(d.tot), fmt(d.costo), fmt(d.bruta), pct(d.margenBruto || 0)]});
  pdfH(doc, "Productos", 4);
  try { pdfImg(doc, grafico("hbar", top5(d.rent, "unidades", 8).map(r => ({l: r.producto, v: r.unidades, txt: fmtN(r.unidades, 0) + " und"})), {titulo: "Más vendidos (unidades)", h: 330, fmt: x => fmtN(x, 0)}), 58); } catch (e) {}
  const lentos = productosLentos(); if (lentos.length) pdfTxt(doc, "Rotación baja: " + lentos.slice(0, 5).map(x => x.p.nombre + " (" + x.u30 + " vendidas en 30 días)").join(", ") + ".", {c: PDFC.gris, size: 9});
  pdfH(doc, "Inventario", 5);
  const cnt = k => d.inv.filter(r => r.estado === k).length, valInv = sum(d.inv, r => r.final != null && r.costo != null ? Math.max(0, r.final) * r.costo : 0);
  pdfKpis(doc, [{l: "Agotados", v: String(cnt("AGOTADO")), c: cnt("AGOTADO") ? PDFC.rojo : null}, {l: "Bajos o en riesgo", v: String(cnt("BAJO") + cnt("RIESGO"))}, {l: "Valor del inventario", v: fmt(valInv), s: "A costo actual"}]);
  pdfTabla(doc, ["Producto", "Final", "Cobertura (días)", "Estado"], d.inv.filter(r => r.estado !== "NORMAL" && r.tipo !== "Insumo").slice(0, 14).map(r => [r.producto, vx(r.final), vx(r.cobertura), r.estado]), {vacio: "Todo el inventario está en estado normal.", color: (i, j, v) => j === 3 ? (v === "AGOTADO" ? PDFC.rojo : PDFC.amb) : null});
  pdfH(doc, "Compras", 6);
  const cp = agruparPor(d.compras.filter(c => c.estado === "Recibida"), "proveedor", "total");
  pdfTabla(doc, ["Proveedor", "Compras recibidas"], cp.map(x => [x.n, fmt(x.v)]), {vacio: "No se registraron compras recibidas en el periodo.", cols: {1: {halign: "right"}}});
  pdfH2(doc, "Qué comprar (próximos 7 días)");
  pdfTabla(doc, ["Producto", "Hay", "Comprar", "Costo estimado", "Motivo"], d.rec.slice(0, 12).map(r => [r.producto, vx(r.inventario), r.cantidad, r.costoTotal == null ? "–" : fmt(r.costoTotal), r.motivo]), {vacio: "No hay compras urgentes según la demanda estimada."});
  pdfH(doc, "Gastos", 7);
  pdfTabla(doc, ["Categoría", "Total"], agruparPor(d.gastos, "categoria", "total").map(x => [x.n, fmt(x.v)]), {vacio: "Sin gastos registrados.", cols: {1: {halign: "right"}}, foot: d.gastos.length ? ["Total", fmt(sum(d.gastos, g => g.total))] : null});
  pdfH(doc, "Caja", 8);
  pdfTabla(doc, ["Fecha", "Caja", "Esperado", "Contado", "Diferencia", "Estado"], d.cajas.slice(-20).map(c => [fCorta(c.fecha), c.caja, fmt(c.esperado), c.contado == null ? "–" : fmt(c.contado), c.diferencia == null ? "–" : fmt(c.diferencia), c.estado]), {vacio: "Sin cajas en el periodo.", color: (i, j, v) => j === 4 && v !== "$0" && v !== "–" ? PDFC.rojo : null});
  pdfH(doc, "Clientes", 9);
  pdfTxt(doc, d.clientes.length ? d.clientes.length + " clientes pidieron factura a su nombre en el periodo, por " + fmt(sum(d.clientes, c => c.total)) + ". Sus datos personales no se incluyen en este informe." : "Ningún cliente pidió factura a su nombre en el periodo. OLI no recolecta datos personales en ventas normales.");
  pdfH(doc, "Operación", 10);
  pdfTabla(doc, ["Caja / equipo", "Ventas"], d.cajasV.map(x => [x.n, fmt(x.v)]), {cols: {1: {halign: "right"}}});
  pdfTxt(doc, `Descuentos: ${fmt(d.desc)}. Ventas anuladas: ${d.anuladas} (${fmt(d.anuladoTot)}, no se suman). Mermas: ${fmt(sum(d.mermas, m => m.total || 0))}.`);
  pdfH(doc, "Tendencias", 11);
  pdfTxt(doc, cmp ? `Periodo anterior (${periodoDoc(pa, pb)}): ventas ${fmt(ant.tot)} en ${fmtN(ant.n, 0)} ventas. Cambio: ${pct((d.tot - ant.tot) / ant.tot)}.` : `El periodo anterior (${periodoDoc(pa, pb)}) no tiene datos suficientes para comparar (${ant.dias} días con ventas).`);
  for (const f of patrones().frases.slice(0, 4)) pdfTxt(doc, "• " + f);
  pdfH(doc, "Alertas", 12);
  const al = alertas().slice(0, 10); if (al.length) for (const a of al) pdfTxt(doc, "• " + a.t + (a.d ? " " + a.d : ""), {size: 9.5}); else pdfTxt(doc, "Sin alertas activas.");
  pdfH(doc, "Recomendaciones", 13);
  const recs = recsNoCompra(d); if (recs.length) for (const r of recs) pdfTxt(doc, "• " + r.t + (r.d ? " " + r.d : ""), {size: 9.5}); else pdfTxt(doc, "Sin recomendaciones pendientes.");
  pdfTxt(doc, "Recomendaciones calculadas con la información disponible al " + generadoTxt() + ". OLI recomienda; las decisiones son del administrador.", {c: PDFC.gris, size: 8.5});
  pdfH(doc, "Anexos", 14);
  pdfTxt(doc, "Metodología: ventas = suma de ventas confirmadas (sin anuladas). Costo de ventas = costo registrado del producto en la fecha de cada venta. Utilidad estimada = utilidad bruta − gastos operativos (sin materia prima, que ya está en el costo). Recomendación de compra = demanda estimada + stock de seguridad − inventario − pedidos pendientes.", {size: 9});
  for (const c of d.control) pdfTxt(doc, (c.ok ? "OK  " : "X  ") + "Control: " + c.t, {size: 9, c: c.ok ? PDFC.verdeO : PDFC.rojo});
  return pdfCierre(doc, "Informe empresarial · " + periodoDoc(d.a, d.b));
}
function datosVentasRapido(a, b, F) { const r = filasVentas(a, b, F || {}).filter(x => x.estado === "Confirmada"); return {tot: sum(r, x => x.total), n: uniq(r.map(x => x.id)).length, dias: uniq(r.map(x => x.fecha)).length}; }
// solo se compara con el periodo anterior si tiene datos de casi todos los días (si no, el porcentaje engaña)
const comparable = (d, ant) => ant.tot > 0 && ant.dias >= 0.8 * d.dias.filter(x => x.n).length;
// recomendaciones que no son de compra (las compras ya tienen su propia sección con horizonte de 7 días)
function recsNoCompra(d) { const dh = decisionesHoy(), r = dh.urgente.concat(dh.importante, dh.oportunidad).filter(x => x.tab !== "compras"); return (d.rec.length ? [{t: "Hacer el pedido sugerido (" + d.rec.length + " productos para los próximos 7 días).", d: ""}] : []).concat(r); }
async function pdfDueno(d) {
  await lib("autotable"); const doc = pdfNuevo();
  try { doc.addImage(logoPNG(), "PNG", PM, 12, 26, 10.8); } catch (e) {}
  doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(...PDFC.tinta); doc.text("Informe del dueño", PM + 32, 20); doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...PDFC.gris); doc.text(pt(negocioNombre() + " · " + periodoDoc(d.a, d.b)), PM + 32, 26); doc._y = 38;
  const [pa, pb] = periodoAnterior(d.a, d.b), ant = datosVentasRapido(pa, pb, d.F), cmp = comparable(d, ant);
  const P = (q, a) => { pdfH2(doc, q); pdfTxt(doc, a, {size: 10.5}); doc._y += 1; };
  P("¿Cuánto vendí?", `${fmt(d.tot)} en ${fmtN(d.n, 0)} ventas (ticket promedio ${fmt(d.ticket)}).${cmp ? " Frente al periodo anterior: " + (d.tot >= ant.tot ? "subió " : "bajó ") + pct(Math.abs(d.tot - ant.tot) / ant.tot) + "." : ""}`);
  P("¿Cuánto gané?", `Utilidad bruta ${fmt(d.bruta)} (margen ${pct(d.margenBruto || 0)}).${d.util != null ? " Después de gastos (" + fmt(d.gastosOp) + "): " + fmt(d.util) + "." : ""}${d.sinCosto ? " Ojo: faltan costos en " + d.sinCosto + " líneas, la ganancia real puede ser menor." : ""}`);
  P("¿Qué vendí?", top5(d.rent, "unidades", 5).map(r => r.producto + ": " + fmtN(r.unidades, 0) + " (" + fmt(r.ventas) + ")").join(" · ") || "Sin ventas.");
  const ag = d.inv.filter(r => r.estado === "AGOTADO").map(r => r.producto); P("¿Qué se agotó?", ag.length ? ag.join(", ") + "." : "Nada está agotado ahora.");
  P("¿Qué debo comprar?", d.rec.length ? "Para los próximos 7 días: " + d.rec.slice(0, 6).map(r => r.cantidad + " " + r.producto).join(", ") + (sum(d.rec, r => r.costoTotal || 0) ? ". Costo estimado " + fmt(sum(d.rec, r => r.costoTotal || 0)) + "." : ".") : "Por ahora no hace falta comprar.");
  const gc = agruparPor(d.gastos, "categoria", "total"); P("¿Qué pasó con los gastos?", d.gastos.length ? "Gastaste " + fmt(sum(d.gastos, g => g.total)) + ". Lo principal: " + gc.slice(0, 3).map(g => g.n + " " + fmt(g.v)).join(", ") + "." : "No se registraron gastos.");
  const cc = d.cajas.filter(c => c.contado != null), dsum = sum(cc, c => c.diferencia || 0), ab = d.cajas.filter(c => c.estado === "Abierta").length;
  P("¿Cómo está la caja?", cc.length ? cc.length + " cierres. " + (dsum === 0 ? "Todo cuadró." : "Diferencia acumulada " + fmt(dsum) + " en " + cc.filter(c => c.diferencia).length + " cierres.") + (ab ? " " + ab + " cajas siguen abiertas." : "") : "No hay cierres de caja en el periodo.");
  const recs = recsNoCompra(d).slice(0, 5); P("¿Qué debería hacer?", recs.length ? recs.map(r => r.t).join(" ") : "Seguir así: no hay pendientes importantes.");
  try { pdfImg(doc, grafico("barras", d.dias.map(x => ({l: diaEje(x.fecha), v: x.ventas})), {titulo: "Ventas por día", h: 340}), 58); } catch (e) {}
  if (d.integ.length) pdfAviso(doc, "Hay " + d.integ.length + " puntos por revisar en la información (ver informe para el contador).", "warn");
  return pdfCierre(doc, "Informe del dueño · " + periodoDoc(d.a, d.b));
}
function resumenContable(d) {
  const recib = d.compras.filter(c => c.estado === "Recibida"), pedidas = d.compras.filter(c => c.estado === "Pendiente"), porConf = ventasOk().filter(v => v.fecha >= d.a && v.fecha <= d.b && v.pend);
  const valIni = sum(d.inv, r => (r.inicial || 0) > 0 && r.costo != null ? r.inicial * r.costo : 0), valFin = sum(d.inv, r => (r.final || 0) > 0 && r.costo != null ? r.final * r.costo : 0);
  const cc = d.cajas.filter(c => c.contado != null), impV = sum(d.imp.ventas, x => x.impuesto);
  return [
    ["Periodo", periodoDoc(d.a, d.b), ""], ["Ventas brutas (antes de descuentos)", fmt(d.bruto), "Ventas confirmadas"], ["Devoluciones / anulaciones", fmt(d.anuladoTot), d.anuladas + " ventas anuladas (no se suman)"], ["Descuentos", fmt(d.desc), ""],
    ["Ingresos netos", fmt(d.tot), "Ventas brutas − descuentos (impuestos incluidos)"], ["Base gravable / no gravada de ventas", fmt(sum(d.imp.ventas, x => x.base)), "Según tratamiento configurado"], ["Costo de ventas", fmt(d.costo), d.sinCosto ? d.sinCosto + " líneas sin costo" : "Costo registrado"],
    ["Utilidad bruta", fmt(d.bruta), ""], ["Gastos", d.gastosOp == null ? "–" : fmt(d.gastosOp), "Operativos, sin materia prima"], ["Utilidad estimada", d.util == null ? "–" : fmt(d.util), "Estimación de gestión, no es un estado financiero"],
    ["Impuestos en ventas (según configuración)", fmt(impV), d.imp.porValidar ? fmt(d.imp.porValidar) + " de ventas con tratamiento POR VALIDAR" : ""], ["IVA en compras y gastos registrado", fmt(d.imp.ivaCompras + d.imp.ivaGastos), "Por validar contra soportes"], ["Retenciones registradas", fmt(d.imp.retenciones), ""],
    ["Compras recibidas", fmt(sum(recib, c => c.total)), recib.length + " líneas"], ["Cuentas por pagar", "No registrado", "OLI no lleva cartera de proveedores. Pedidos sin recibir: " + fmt(sum(pedidas, c => c.total))],
    ["Cuentas por cobrar", fmt(sum(porConf, v => v.total)), "Pagos digitales sin confirmar (" + porConf.length + "). OLI no vende a crédito."],
    ["Inventarios (a costo actual)", fmt(valIni) + " → " + fmt(valFin), "Inicial → final"], ["Caja (efectivo esperado / contado)", fmt(sum(cc, c => c.esperado)) + " / " + fmt(sum(cc, c => c.contado)), cc.length + " cierres"],
    ["Diferencias de caja", fmt(sum(cc, c => c.diferencia || 0)), cc.filter(c => c.diferencia).length + " cierres con diferencia"], ["Novedades", d.ajustes.length + " movimientos de inventario · " + d.mermas.length + " mermas", "Mermas a costo: " + fmt(sum(d.mermas, m => m.total || 0))]
  ];
}
function consecutivos(d) { const m = {}; for (const v of ventasAll()) if (v.fecha >= d.a && v.fecha <= d.b) { const k = devNombre(v.dev), o = m[k] = m[k] || {caja: k, min: Infinity, max: -Infinity, n: 0, anul: 0}; o.min = Math.min(o.min, v.n || 0); o.max = Math.max(o.max, v.n || 0); o.n++; if (v.anulada) o.anul++; } return Object.values(m); }
async function pdfContador(d) {
  await lib("autotable"); const doc = pdfNuevo();
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(...PDFC.tinta); doc.text("Resumen contable", PM, 20); doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(...PDFC.gris);
  doc.text(pt(negocioNombre() + " · Periodo " + periodoDoc(d.a, d.b) + " · Generado " + generadoTxt() + " · OLI " + BRAND.version), PM, 26); doc._y = 33;
  pdfAviso(doc, AVISO_TRIB);
  pdfH2(doc, "1. Resumen del periodo");
  pdfTabla(doc, ["Concepto", "Valor", "Nota"], resumenContable(d), {plano: 1, cols: {1: {halign: "right", fontStyle: "bold"}, 2: {textColor: PDFC.gris}}});
  pdfH2(doc, "2. Información pendiente");
  if (d.pend.length) for (const p of d.pend) pdfTxt(doc, "!  " + p, {c: PDFC.amb, b: 1, size: 9.5}); else pdfTxt(doc, "Sin información pendiente.", {c: PDFC.verdeO});
  pdfH2(doc, "3. Impuestos por tratamiento (según configuración de productos)");
  pdfTabla(doc, ["Concepto", "Tratamiento", "Tarifa", "Base", "Impuesto", "Total"], filasImpuestos(d).map(x => [x.c, x.t, x.r == null ? "" : pct(x.r), x.base == null ? "" : fmt(x.base), fmt(x.imp), x.total == null ? "" : fmt(x.total)]), {plano: 1, cols: {3: {halign: "right"}, 4: {halign: "right"}, 5: {halign: "right"}}});
  pdfH2(doc, "4. Consecutivos de venta por caja");
  pdfTabla(doc, ["Caja", "Desde", "Hasta", "Ventas", "Anuladas"], consecutivos(d).map(c => [c.caja, "#" + c.min, "#" + c.max, c.n, c.anul]), {plano: 1});
  pdfTxt(doc, "Los consecutivos internos de OLI no son numeración de facturación electrónica. La facturación electrónica requiere un proveedor tecnológico conectado.", {c: PDFC.gris, size: 8.5});
  pdfH2(doc, "5. Conciliación");
  pdfTabla(doc, ["Comparación", "Valor A", "Valor B", "Diferencia", "Estado"], d.conc.map(c => [c.n, c.nx + ": " + fmt(c.x), c.y == null ? c.ny + ": no disponible" : c.ny + ": " + fmt(c.y), c.dif == null ? "–" : fmt(c.dif), c.y == null ? "REQUIERE CONTADOR" : c.ok ? "OK" : "REVISAR"]), {plano: 1, color: (i, j, v) => j === 4 ? (v === "OK" ? PDFC.verdeO : PDFC.amb) : null});
  pdfH2(doc, "6. Control de integridad");
  pdfTxt(doc, d.integ.length ? "EL INFORME TIENE " + d.integ.length + (d.integ.length === 1 ? " INCONSISTENCIA" : " INCONSISTENCIAS") : "Sin inconsistencias detectadas.", {b: 1, c: d.integ.length ? PDFC.rojo : PDFC.verdeO});
  pdfTabla(doc, ["Validación", "Cantidad", "Detalle"], d.integ.map(x => [x.t, x.n, x.d || ""]), {plano: 1, vacio: "—"});
  pdfH2(doc, "7. Terceros (proveedores)");
  pdfTabla(doc, ["Nombre", "NIT", "Base", "IVA", "Retención", "Completo"], d.terceros.map(t => [t.nombre, t.nit || "FALTA", fmt(t.compras), fmt(t.iva), fmt(t.retencion), t.completo ? "Sí" : "No"]), {plano: 1, vacio: "Sin terceros registrados."});
  pdfH2(doc, "8. Auditoría del periodo (riesgos)");
  pdfTabla(doc, ["Riesgo", "Tipo", "Detalle", "Usuario", "Fecha"], d.riesgos.slice(0, 40).map(r => [r.riesgo, r.tipo, r.accion, r.usuario, r.fecha]), {plano: 1, vacio: "Sin eventos de riesgo.", color: (i, j, v) => j === 0 ? (v === "Alto" ? PDFC.rojo : v === "Medio" ? PDFC.amb : null) : null});
  pdfTxt(doc, "Un riesgo indica algo para revisar, no una falta comprobada. El detalle completo está en 14_AUDITORIA.xlsx.", {c: PDFC.gris, size: 8.5});
  pdfH2(doc, "9. Facturación electrónica y documentos");
  const tr = configNeg().tributario || {}; pdfTxt(doc, tr.proveedorFE ? "Proveedor de facturación configurado: " + tr.proveedorFE + ". Estado de la integración: " + (tr.feEstado || "NO CONECTADO") + "." : "No hay proveedor de facturación electrónica conectado. OLI no emite facturas electrónicas ni documentos equivalentes POS en este momento; las ventas en las que el cliente pidió factura se listan para su emisión.", {size: 9.5});
  pdfTxt(doc, AVISO_TRIB, {c: PDFC.gris, size: 8.5});
  return pdfCierre(doc, "Resumen contable · " + periodoDoc(d.a, d.b));
}

/* ---------- paquete para el contador (ZIP) ---------- */
async function zipContador(d, conGerencia) {
  await lib("ExcelJS"); await lib("JSZip"); await lib("autotable");
  const zip = new window.JSZip(), un = async (nombre, hojas) => { const wb = nuevoLibro(); for (const [n, cols, rows, o] of hojas) hojaTabla(wb, n, n, cols, rows || [], d, o || {}); zip.file(nombre, await wb.xlsx.writeBuffer()); };
  const costoVentas = d.rent.map(r => ({producto: r.producto, unidades: r.unidades, cu: r.unidades && r.costoOk ? r.costo / r.unidades : null, costo: r.costoOk ? r.costo : null, ventas: r.ventas, completo: r.costoOk ? "Sí" : "Falta costo"}));
  const prov = d.terceros.filter(t => t.tipo === "proveedor");
  await un("01_VENTAS.xlsx", [["Detalle de ventas", COLS.ventas, d.ventas], ["Por día", COLS.dias, d.dias]]);
  await un("02_COMPRAS.xlsx", [["Compras", COLS.compras, d.compras]]);
  await un("03_GASTOS.xlsx", [["Gastos", COLS.gastos, d.gastos]]);
  await un("04_CAJA.xlsx", [["Cajas", COLS.cajas, d.cajas], ["Movimientos de caja", COLS.movCaja, d.movCaja]]);
  await un("05_INVENTARIO.xlsx", [["Inventario", COLS.inventario, d.inv, {leyenda: ["NORMAL", "BAJO", "AGOTADO", "RIESGO", "SIN CONTAR"]}]]);
  await un("06_COSTO_VENTAS.xlsx", [["Costo de ventas", [{h: "Producto", k: "producto"}, {h: "Unidades vendidas", k: "unidades", t: "num", tot: 1}, {h: "Costo unitario promedio", k: "cu", t: "money"}, {h: "Costo de ventas", k: "costo", t: "money", tot: 1}, {h: "Ventas", k: "ventas", t: "money", tot: 1}, {h: "Costo completo", k: "completo"}], costoVentas, {notas: [NOTA_COSTOS]}],
    ["Conciliación inventario", [{h: "Comparación", k: "n"}, {h: "Valor A", k: "x", t: "money"}, {h: "Valor B", k: "y", t: "money"}, {h: "Diferencia", k: "dif", t: "money", neg: 1}, {h: "Nota", k: "nota"}], d.conc.filter(c => /Inventario/.test(c.n))]]);
  await un("07_IMPUESTOS.xlsx", [["Impuestos", COLS_IMP, filasImpuestos(d), {notas: [AVISO_TRIB]}]]);
  await un("08_CLIENTES.xlsx", [["Clientes", COLS.clientes, d.clientes, {vacio: "No hay clientes con datos de facturación en el periodo.", notas: ["Solo datos necesarios para facturación."]}]]);
  await un("09_PROVEEDORES.xlsx", [["Proveedores", COLS.terceros, prov]]);
  await un("10_TERCEROS.xlsx", [["Terceros", COLS.terceros, d.terceros]]);
  await un("11_MERMAS.xlsx", [["Mermas", COLS.mermas, d.mermas, {notas: resumenMermas(d)}]]);
  await un("12_AJUSTES.xlsx", [["Movimientos de inventario", COLS.ajustes, d.ajustes, {vacio: "Sin ajustes, entradas ni producción en el periodo."}]]);
  await un("13_ANULACIONES.xlsx", [["Anulaciones", COLS.anul, d.anul]]);
  await un("14_AUDITORIA.xlsx", [["Riesgos", COLS.riesgos, d.riesgos], ["Registro de acciones", COLS.audit, d.audit]]);
  { const wb = nuevoLibro(); hojaTabla(wb, "Resumen contable", "Resumen contable", [{h: "Concepto", k: 0}, {h: "Valor", k: 1}, {h: "Nota", k: 2}], resumenContable(d).map(r => ({0: r[0], 1: r[1], 2: r[2]})), d, {notas: [AVISO_TRIB]});
    hojaTabla(wb, "Información pendiente", "Información pendiente", [{h: "Pendiente", k: "t"}], d.pend.map(t => ({t})), d, {vacio: "Sin información pendiente."});
    hojaTabla(wb, "Conciliación", "Conciliación contable", [{h: "Comparación", k: "n"}, {h: "Valor A", k: "x", t: "money"}, {h: "Valor B", k: "y", t: "money"}, {h: "Diferencia", k: "dif", t: "money", neg: 1}, {h: "Estado", f: c => c.y == null ? "REQUIERE CONTADOR" : c.ok ? "OK" : "REVISAR", estado: 1}, {h: "Nota", k: "nota"}], d.conc, d);
    hojaIntegridad(wb, d); zip.file("15_RESUMEN_CONTABLE.xlsx", await wb.xlsx.writeBuffer()); }
  zip.file("PDF_RESUMEN_CONTABLE.pdf", await pdfContador(d));
  if (conGerencia) { zip.file("00_INFORME_GERENCIAL.xlsx", await excelGerencial(d)); zip.file("00_INFORME_EMPRESARIAL.pdf", await pdfEmpresarial(d)); }
  zip.file("LEEME.txt", ["OLI · Paquete para el contador", "Periodo: " + periodoDoc(d.a, d.b), "Negocio: " + negocioNombre(), "Generado: " + generadoTxt(), "", "Contenido: 01_VENTAS … 15_RESUMEN_CONTABLE (Excel) y PDF_RESUMEN_CONTABLE.pdf.", d.integ.length ? "ATENCIÓN: EL INFORME TIENE " + d.integ.length + " INCONSISTENCIAS (ver 15_RESUMEN_CONTABLE → Integridad)." : "Sin inconsistencias detectadas.", "", AVISO_TRIB, "", "OLI · Software propiedad de VP Visual Project · Creado por Víctor Palacio"].join("\r\n"));
  return zip.generateAsync({type: "blob", compression: "DEFLATE", compressionOptions: {level: 6}});
}

/* ---------- acciones de descarga ---------- */
const NOMBRES = {gerencial: "OLI_Informe_Gerencial", empresarial: "OLI_Informe_Empresarial", dueno: "OLI_Informe_Dueno", contador: "OLI_Resumen_Contable", zip: "OLI_CONTABILIDAD"};
async function generar(tipo, a, b, F) {
  exigirAdmin(); const d = datosInforme(a, b, F), et = etiquetaPeriodo(a, b);
  let blob, nombre;
  if (tipo === "gerencial") { blob = await excelGerencial(d); nombre = NOMBRES.gerencial + "_" + et + ".xlsx"; }
  else if (tipo === "empresarial") { blob = await pdfEmpresarial(d); nombre = NOMBRES.empresarial + "_" + et + ".pdf"; }
  else if (tipo === "dueno") { blob = await pdfDueno(d); nombre = NOMBRES.dueno + "_" + et + ".pdf"; }
  else if (tipo === "contador") { blob = await pdfContador(d); nombre = NOMBRES.contador + "_" + et + ".pdf"; }
  else if (tipo === "zip") { blob = await zipContador(d); nombre = NOMBRES.zip + "_" + et + ".zip"; if (esMesCompleto(a, b)) { const mes = mesId(a), cur = col("periodos")[mes] || {}; await put("periodos", mes, Object.assign({}, cur, {paqueteT: Date.now()})); } }
  else if (MODULOS[tipo]) { blob = await excelModulo(tipo, d); nombre = "OLI_" + MODULOS[tipo].t.normalize("NFD").replace(/[̀-ͯ]/g, "") + "_" + et + ".xlsx"; }
  else throw new Error("Tipo de informe desconocido.");
  audit("EXPORTACION", tipo, nombre);
  window.__oliUltimo = {nombre, size: blob.size};
  return guardarArchivo(nombre, blob);
}
