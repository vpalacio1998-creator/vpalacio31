/* ============ 20 · dominio: productos, inventario, ventas, caja y finanzas ============ */
const CATS = ["Paletas", "Helados", "Bebidas", "Combos", "Otros"];
const METODOS = ["Efectivo", "Nequi", "Daviplata", "QR Bancolombia", "Tarjeta", "Otro"];
const esDigital = m => m === "Nequi" || m === "Daviplata" || m === "QR Bancolombia";
const CATS_GASTO = ["Arrendamiento", "Servicios", "Nómina", "Materia prima", "Transporte", "Publicidad", "Mantenimiento", "Otros"];
const MOTIVOS_MERMA = ["Vencimiento", "Daño", "Preparación", "Error", "Devolución", "Otro"];
const BASE_COSTO = "Materia prima";           // se refleja en el costo de mercancía; no se resta dos veces

/* ---------- productos ---------- */
const prods = () => memo("prods", () => Object.entries(col("productos")).map(([id, p]) => Object.assign({id}, p)).sort((a, b) => (a.orden || 0) - (b.orden || 0) || a.nombre.localeCompare(b.nombre, "es")));
const prodMap = () => memo("prodMap", () => { const m = {}; for (const p of prods()) m[p.id] = p; return m; });
const prod = id => prodMap()[id] || null;
const vendibles = () => prods().filter(p => p.activo !== false && p.tipo !== "insumo");
const terminados = () => prods().filter(p => p.tipo !== "insumo");
const insumos = () => prods().filter(p => p.tipo === "insumo");
const costos = () => col("costos");
function costoEn(id, t) { const c = costos()[id]; if (!c) return null; const h = c.hist || []; if (!h.length) return c.costo == null ? null : c.costo; let r = h[0].c; for (const e of h) if (e.t <= t) r = e.c; return r; }
function costoUnit(pid, t = Date.now()) { const p = prod(pid); if (!p) return null; if (p.combo) { let s = 0; for (const c of p.combo) { const x = costoUnit(c.pid, t); if (x == null) return null; s += x * (esSabor(c.pid) ? c.q / bolasCaja() : c.q); } return s; } return costoEn(pid, t); }   // un sabor de helado en un combo va en bolas (la caja trae bolasCaja)
const costoActual = pid => costoUnit(pid, Date.now());

/* ---------- ventas ---------- */
const anuladasSet = () => memo("anul", () => { const s = new Set(); for (const d of Object.values(col("anulaciones"))) for (const a of (d.items || [])) s.add(a.ventaId); return s; });
const confirmadasMap = () => memo("confs", () => { const m = {}; for (const d of Object.values(col("confirmaciones"))) for (const c of (d.items || [])) m[c.ventaId] = c.t; return m; });
const ventasAll = () => memo("ventasAll", () => {
  const out = [], an = anuladasSet(), cf = confirmadasMap(), cm = correccionesMedio();
  for (const [docId, d] of Object.entries(col("ventas"))) for (const v0 of (d.ventas || [])) {
    // si el administrador corrigió cómo pagaron (p. ej. quedó en efectivo y fue por QR), vale el medio corregido; el original queda en mOrig
    const cr = cm[v0.id], v = cr ? Object.assign({}, v0, {m: cr.a, mOrig: v0.m, corrMedio: cr, confirmada: v0.confirmada || !!cr.conf}) : v0;
    out.push(Object.assign({}, v, {fecha: v.fecha || d.fecha, docId, dev: d.dev || v.dev, uid: v.uid || d.uid, anulada: an.has(v.id), conf: cf[v.id] || 0, pend: esDigital(v.m) && !cf[v.id] && !v.confirmada}));
  }
  return out.sort((a, b) => a.t - b.t);
});
/* ---------- diferencias de caja: cómo las resolvió el administrador (colección "ajustescaja"; la escribe el administrador, todos la leen) ----------
   Un documento por caja (id = el de la caja), con items {id, t, uid, cierre, tipo, monto, ventas, de, a, conf, gasto, vinculado, mot, nota} o {id, t, uid, anula}.
   tipo: "medio"  se cobró por otro medio (con las ventas que se corrigen, o solo el monto si no se sabe cuál fue)
         "gasto"  se pagó algo con plata de la caja y no se anotó (se crea el gasto, o se liga uno ya anotado en Dinero: vinculado; si ese gasto se borra, deja de explicar)
         "retiro" alguien sacó plata y no se anotó (mot: dueño, consignación u otro)   "ingreso" entró plata y no se anotó (mot: base, cambio u otro)
         "conteo" se contó mal: monto = lo que de verdad había de más (+) o de menos (−)
         "aceptada" no se sabe: se acepta la diferencia como está (queda revisada)
   La diferencia FINAL de un cierre = la del cierre − lo que explican sus ajustes. Todas las pantallas usan difCierre(). */
const TIPOS_AJUSTE = {medio: "Se cobró por otro medio", gasto: "Pago desde la caja sin anotar", retiro: "Retiro sin anotar", ingreso: "Entrada de plata sin anotar", conteo: "Se contó mal", aceptada: "Se aceptó la diferencia"};
const ajustesCajaAll = () => memo("ajCaja", () => {
  const out = []; for (const [docId, d] of Object.entries(col("ajustescaja"))) for (const x of ((d && d.items) || [])) if (x && x.id) out.push(Object.assign({caja: docId}, x));
  const anul = new Set(out.filter(x => x.anula).map(x => x.anula));
  return out.filter(x => !x.anula && !anul.has(x.id)).sort((a, b) => (a.t || 0) - (b.t || 0));
});
// la corrección de medio vigente de cada venta (la más reciente que no se deshizo)
const correccionesMedio = () => memo("corrM", () => { const m = {}; for (const x of ajustesCajaAll()) if (x.tipo === "medio" && Array.isArray(x.ventas) && x.a) for (const id of x.ventas) m[id] = x; return m; });
// cuánto de la diferencia explica un ajuste (con el signo de la diferencia: un faltante se explica con montos negativos)
function explicaAjuste(x) {
  const m = Math.abs(Number(x.monto) || 0);
  if (x.tipo === "medio") return x.de === "Efectivo" && x.a !== "Efectivo" ? -m : x.a === "Efectivo" && x.de !== "Efectivo" ? m : 0;
  if (x.tipo === "gasto") return x.gasto && esAdmin() && DS.ready.gastos && !col("gastos")[x.gasto] ? 0 : -m;     // si borraron ese gasto, ya no explica nada (los equipos de caja no leen los gastos)
  if (x.tipo === "retiro") return -m;
  if (x.tipo === "ingreso") return m;
  if (x.tipo === "conteo") return -(Number(x.monto) || 0);   // había más de lo contado (+): explica un faltante; había menos (−): explica un sobrante
  return 0;
}
function difCierre(c) {
  const ci = c && (c.cierres || []).slice(-1)[0]; if (!ci) return null;
  const id = c.id || cajaId(c.fecha, c.dev), items = ajustesCajaAll().filter(x => x.caja === id && x.cierre === ci.id);
  const orig = Math.round(Number(ci.dif) || 0), explicado = Math.round(sum(items, explicaAjuste)), final = orig - explicado;
  const contado = (Number(ci.contado) || 0) + sum(items.filter(x => x.tipo === "conteo"), x => Number(x.monto) || 0);
  return {ci, orig, explicado, final, items, conAjustes: items.length > 0, contado, esperado: contado - final, revisada: Math.abs(final) < 1 || items.some(x => x.tipo === "aceptada")};
}
// diferencia que cuenta (para plata y alertas): la final si el administrador ya la revisó con ajustes; si no, la del cierre
const difFinal = c => { const r = difCierre(c); return r ? r.final : 0; };
const ajusteTxt = x => (TIPOS_AJUSTE[x.tipo] || x.tipo) + (x.tipo === "medio" ? ": " + (x.de || "?") + " → " + (x.a || "?") : "") + (x.monto && x.tipo !== "aceptada" ? " · " + fmt(Math.abs(Number(x.monto))) : "") + (x.mot ? " · " + x.mot : "") + (x.nota ? " · " + x.nota : "");
const ventasOk = () => memo("ventasOk", () => ventasAll().filter(v => !v.anulada));
/* datos del cliente que pidió factura (solo administrador). Las ventas viejas los traían adentro (v.cliente con doc y nombre). */
const facturasMap = () => memo("facts", () => { const m = {}; for (const d of Object.values(col("facturas"))) for (const x of (d.items || [])) if (x && x.ventaId) m[x.ventaId] = x; return m; });
const clienteDe = v => facturasMap()[v.id] || (v.cliente && typeof v.cliente === "object" ? v.cliente : null);
const ventasEn = (a, b) => ventasOk().filter(v => v.fecha >= a && v.fecha <= b);
/* qué inventario gasta una línea (de una venta o del pedido): los combos se abren en sus componentes; un cono gasta su barquillo y su cucurucho o vaso.
   Las bolas de helado no se descuentan una a una: se miden por caja de cada sabor (ver 63-conos). */
function consumoBruto(it) {
  // lo que se guardó al vender (no cambia si después se edita el producto). Solo insumos y cantidades razonables (la misma regla del servidor):
  // un dato raro no suma inventario ni descuenta otro producto
  if (Array.isArray(it.gasta)) return it.gasta.filter(x => x && (prod(x.pid) || {}).tipo === "insumo" && Number(x.q) > 0 && Number(x.q) <= (Number(it.q) || 0) * 3);
  const p = prod(it.pid);
  if (p && p.combo) return p.combo.map(c => ({pid: c.pid, q: c.q * it.q}));
  if (p && p.cono) return gastoCono(p, it.pres, it.q);
  return [{pid: it.pid, q: it.q}];
}
/* un sabor de helado se lleva por cajas: si un combo o una venta guardada lo trae (p. ej. los conos de antes, "1 de Helado Red velvet"),
   eso son BOLAS, no cajas. No baja el inventario por venta (baja al abrir cada caja) y cuesta la caja ÷ bolasCaja por bola. */
const esSabor = pid => !!(prod(pid) || {}).sabor;
const consumoLinea = it => consumoBruto(it).filter(x => !esSabor(x.pid));
const bolasDeLinea = it => consumoBruto(it).filter(x => esSabor(x.pid));
const gastoCono = (p, pres, q) => [p.cono.barquillo, pres === "vaso" ? p.cono.vaso : p.cono.cucurucho].filter(Boolean).map(pid => ({pid, q}));
function lineasExp(v) {
  const out = [];
  for (const it of (v.items || [])) {
    for (const x of consumoLinea(it)) out.push({pid: x.pid, q: x.q, t: v.t});
    for (const x of bolasDeLinea(it)) out.push({pid: x.pid, q: x.q / (it.bc || bolasCaja()), t: v.t, porCaja: true});
    if (Array.isArray(it.sab)) for (const s of it.sab) out.push({pid: s, q: it.q / (it.bc || bolasCaja()), t: v.t, porCaja: true});   // bolas en fracción de caja: para costo y consumo, no para el inventario (ese baja al abrir cada caja)
  }
  return out;
}

/* ---------- inventario ---------- */
const mermasAll = () => memo("mermasAll", () => { const out = []; for (const [docId, d] of Object.entries(col("mermas"))) for (const m of (d.items || [])) out.push(Object.assign({fecha: d.fecha, dev: d.dev, docId}, m)); return out.sort((a, b) => a.t - b.t); });
const stockDocs = () => col("stock");
const stockMap = () => memo("stockMap", () => {
  const sold = {}, mer = {}, del = {}, ab = {};
  for (const e of eventosHelado()) if (e.motivo !== "inicio") (ab[e.sabor] = ab[e.sabor] || []).push(e);   // abrir una caja de helado resta una caja cerrada
  for (const v of ventasOk()) for (const l of lineasExp(v)) if (!l.porCaja) (sold[l.pid] = sold[l.pid] || []).push(l);
  for (const m of mermasAll()) (mer[m.pid] = mer[m.pid] || []).push(m);
  for (const d of Object.values(col("movinv"))) for (const x of (d.items || [])) if (x.delta) (del[x.pid] = del[x.pid] || []).push(x);   // entradas, compras, producción, consumo
  const out = {}, base = id => { const s = stockDocs()[id]; if (!s || s.base == null) return null; let q = s.base; const t0 = s.t || 0; for (const x of (sold[id] || [])) if (x.t > t0) q -= x.q; for (const x of (mer[id] || [])) if (x.t > t0) q -= x.q; for (const x of (del[id] || [])) if (x.t > t0) q += x.q; for (const x of (ab[id] || [])) if (x.t > t0) q -= 1; return Math.round(q * 1000) / 1000; };
  for (const p of prods()) if (p.controla !== false && !p.combo) out[p.id] = base(p.id);
  for (const p of prods()) if (p.combo) { let m = Infinity; for (const c of p.combo) { if (esSabor(c.pid)) continue; const s = out[c.pid]; if (s == null) { m = null; break; } m = Math.min(m, Math.floor(s / c.q)); } out[p.id] = m === Infinity ? null : m; }
  return out;
});
window.stockMap = stockMap;
const stockDe = pid => stockMap()[pid];
function estadoProd(p) {
  if (p.controla === false) return {k: "disponible", st: null, txt: "Disponible"};
  const st = stockDe(p.id);
  if (st == null) return {k: "sin", st, txt: "Sin contar"};
  if (st <= 0) return {k: "agotado", st: Math.max(0, st), txt: "Agotado"};
  if (st <= (p.min || 0)) return {k: "bajo", st, txt: "Inventario bajo"};
  return {k: "disponible", st, txt: "Disponible"};
}
const estadoPill = e => e.k === "agotado" ? "bad" : e.k === "bajo" ? "warn" : e.k === "sin" ? "" : "ok";
function maxVendible(p, enCarrito = 0) { const e = estadoProd(p); if (e.k === "sin" || p.controla === false) return Infinity; return Math.max(0, e.st - enCarrito); }

/* ---------- cajas (una por dispositivo y día) ---------- */
const cajaId = (fecha, dev = DEV.id) => fecha + "_" + dev;
const cajasAll = () => memo("cajasAll", () => Object.entries(col("cajas")).map(([id, c]) => Object.assign({id}, c)));
const reabiertas = () => memo("reab", () => { const m = {}; for (const r of Object.values(col("reaperturas"))) for (const x of (r.items || [])) (m[x.caja] = m[x.caja] || []).push(x); return m; });
function cajaEstado(c) {
  if (!c || !c.apertura) return "sin";
  const ci = (c.cierres || []).slice(-1)[0]; if (!ci) return "abierta";
  const rea = (reabiertas()[c.id || cajaId(c.fecha, c.dev)] || []).filter(x => x.cierre ? x.cierre === ci.id : x.t > ci.t);
  return rea.length ? "abierta" : "cerrada";
}
const cajaDe = (fecha, dev = DEV.id) => { const c = col("cajas")[cajaId(fecha, dev)]; return c ? Object.assign({id: cajaId(fecha, dev)}, c) : null; };
function cajaCalc(c) {
  const vs = ventasOk().filter(v => v.fecha === c.fecha && v.dev === c.dev), por = {};
  for (const v of vs) por[v.m] = (por[v.m] || 0) + v.total;
  const movs = c.movs || [], ing = sum(movs.filter(m => m.tipo === "ingreso"), m => m.monto), ret = sum(movs.filter(m => m.tipo === "retiro"), m => m.monto), gas = sum(movs.filter(m => m.tipo === "gasto"), m => m.monto);
  const ap = c.apertura ? c.apertura.monto : 0, ef = por["Efectivo"] || 0;
  return {ventas: sum(vs, v => v.total), n: vs.length, por, apertura: ap, efectivo: ef, ingresos: ing, retiros: ret, gastos: gas, esperado: ap + ef + ing - ret - gas};
}
const cajaHoy = () => cajaDe(S.today);
function cajaBloqueada() { const c = cajaHoy(); return c && cajaEstado(c) === "cerrada"; }
const checklistDe = (fecha, dev = DEV.id) => col("checklists")[cajaId(fecha, dev)] || {fecha, dev, apertura: {}, cierre: {}};

/* ---------- finanzas ---------- */
/* devoluciones en efectivo ("Sacar dinero" → "Devolución a cliente"): la venta sigue contada (su caja ya cerró), así que la plata devuelta se resta
   de la utilidad. Las devoluciones por Nequi u otro medio se anotan como gasto (ya se restan). */
const esDevolucion = m => m && m.tipo === "retiro" && String(m.motivo || "").indexOf("Devolución a cliente") === 0;
function devolucionesEn(a, b) { const out = []; for (const c of cajasAll()) if (c.fecha >= a && c.fecha <= b) for (const m of (c.movs || [])) if (esDevolucion(m)) out.push({fecha: c.fecha, monto: Number(m.monto) || 0}); return out; }
function gastosEn(a, b) {
  const out = [];
  for (const [id, g] of Object.entries(col("gastos"))) if (g.fecha >= a && g.fecha <= b) out.push(Object.assign({id, origen: "gasto"}, g));
  for (const c of cajasAll()) if (c.fecha >= a && c.fecha <= b) for (const m of (c.movs || [])) if (m.tipo === "gasto") out.push({id: m.id, fecha: c.fecha, cat: m.cat || "Otros", desc: m.motivo, valor: m.monto, m: "Efectivo", uid: m.uid, origen: "caja"});
  return out.sort((x, y) => (y.fecha > x.fecha ? 1 : -1));
}
function finanzas(a, b) {
  const vs = ventasEn(a, b); let ventas = 0, cogs = 0, sinCosto = 0, sinCostoHelado = false, uds = 0;
  for (const v of vs) {
    ventas += v.total; for (const it of (v.items || [])) uds += it.q;
    for (const l of lineasExp(v)) { const c = costoUnit(l.pid, v.t); if (c == null) { if (l.porCaja) sinCostoHelado = true; else sinCosto += l.q; } else cogs += c * l.q; }
  }
  const gs = gastosEn(a, b), gastosOp = sum(gs.filter(g => g.cat !== BASE_COSTO), g => g.valor), gastosMP = sum(gs.filter(g => g.cat === BASE_COSTO), g => g.valor);
  const devol = sum(devolucionesEn(a, b), x => x.monto);   // plata devuelta en efectivo de ventas que ya no se podían anular (caja cerrada)
  const bruta = ventas - cogs, utilidad = bruta - gastosOp - devol;
  return {ventas, cogs, bruta, gastos: gastosOp, gastosMP, devol, utilidad, margen: ventas ? utilidad / ventas : NaN, margenBruto: ventas ? bruta / ventas : NaN, n: vs.length, uds, ticket: vs.length ? ventas / vs.length : 0, sinCosto, sinCostoHelado};
}
function rentabilidad(a, b) {
  const rows = {};
  for (const v of ventasEn(a, b)) for (const it of (v.items || [])) {
    const p = prod(it.pid), r = rows[it.pid] = rows[it.pid] || {pid: it.pid, n: (p && p.nombre) || it.n || "?", cat: p ? p.cat : "Otros", uds: 0, ing: 0, costo: 0, sinCosto: 0};
    r.uds += it.q; r.ing += it.p * it.q - (Number(it.d) || 0); r.desc = (r.desc || 0) + (Number(it.d) || 0); const c = costoItem(it, v.t); if (c == null) r.sinCosto += it.q; else r.costo += c * it.q;   // ing: lo que de verdad entró, con el descuento ya restado (como el total de la venta)
  }
  return Object.values(rows).map(r => Object.assign(r, {util: r.ing - r.costo, margen: r.ing ? (r.ing - r.costo) / r.ing : NaN}));
}
function porClave(a, b, f) { const m = {}; for (const v of ventasEn(a, b)) { const k = f(v); m[k] = (m[k] || 0) + v.total; } return Object.entries(m).sort((x, y) => y[1] - x[1]); }
function serieDiaria(a, b) {
  const out = [], by = {}; for (const v of ventasEn(a, b)) { const o = by[v.fecha] = by[v.fecha] || {ventas: 0, n: 0, cogs: 0}; o.ventas += v.total; o.n++; for (const l of lineasExp(v)) { const c = costoUnit(l.pid, v.t); if (c != null) o.cogs += c * l.q; } }
  const gs = {}; for (const g of gastosEn(a, b)) if (g.cat !== BASE_COSTO) gs[g.fecha] = (gs[g.fecha] || 0) + g.valor;
  for (const x of devolucionesEn(a, b)) gs[x.fecha] = (gs[x.fecha] || 0) + x.monto;
  for (let d = a, i = 0; d <= b && i < 400; d = addDays(d, 1), i++) { const o = by[d] || {ventas: 0, n: 0, cogs: 0}; out.push({d, ventas: o.ventas, n: o.n, cogs: o.cogs, bruta: o.ventas - o.cogs, util: o.ventas - o.cogs - (gs[d] || 0)}); }
  return out;
}
const configNeg = () => col("config").negocio || {};
const gastosFijosPlan = () => (configNeg().gastosFijos || []);
const totalFijos = () => sum(gastosFijosPlan(), g => g.v);
/* arriendo, nómina y servicios que ya están dentro de los gastos fijos del mes: si además se registran como gasto, no se restan dos veces.
   Solo se da por incluida una categoría si el plan tiene algún renglón de ella con valor (con Luz, Agua e Internet en $0, un recibo de luz sí se resta). */
const CATS_FIJAS = {Arrendamiento: /arriendo|arrendamiento|alquiler|local/i, "Nómina": /trabajador|n[oó]mina|sueldo|salario|emplead|pago de personal/i, Servicios: /luz|agua|internet|gas|servicio|energ|tel[eé]fono|celular|acueducto/i};
const catsEnFijos = () => Object.keys(CATS_FIJAS).filter(c => gastosFijosPlan().some(g => (Number(g.v) || 0) > 0 && (CATS_FIJAS[c].test(g.n || "") || g.n === c)));
const gastosVariables = (a, b) => { const fijas = catsEnFijos(); return sum(gastosEn(a, b).filter(g => g.cat !== BASE_COSTO && !fijas.includes(g.cat)), g => g.valor) + sum(devolucionesEn(a, b), x => x.monto); };
const margenObjetivo = () => (configNeg().margenObjetivo != null ? configNeg().margenObjetivo : 0.6);

/* ---------- rangos de fecha para filtros ---------- */
function rangoFechas(k) {
  const t = S.today;
  if (k === "hoy") return [t, t]; if (k === "ayer") return [addDays(t, -1), addDays(t, -1)];
  if (k === "7") return [addDays(t, -6), t]; if (k === "30") return [addDays(t, -29), t];
  if (k === "mes") return [firstOfMonth(t), t]; if (k === "mesant") { const a = prevMonthFirst(t); return [a, lastOfMonth(a)]; }
  if (k === "custom") return [S.desde || addDays(t, -6), S.hasta || t];
  return [addDays(t, -6), t];
}
const RANGOS = [["hoy", "Hoy"], ["7", "7 días"], ["30", "30 días"], ["mes", "Mes"], ["custom", "Personalizado"]];
