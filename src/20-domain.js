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
function costoUnit(pid, t = Date.now()) { const p = prod(pid); if (!p) return null; if (p.combo) { let s = 0; for (const c of p.combo) { const x = costoUnit(c.pid, t); if (x == null) return null; s += x * c.q; } return s; } return costoEn(pid, t); }
const costoActual = pid => costoUnit(pid, Date.now());

/* ---------- ventas ---------- */
const anuladasSet = () => memo("anul", () => { const s = new Set(); for (const d of Object.values(col("anulaciones"))) for (const a of (d.items || [])) s.add(a.ventaId); return s; });
const confirmadasMap = () => memo("confs", () => { const m = {}; for (const d of Object.values(col("confirmaciones"))) for (const c of (d.items || [])) m[c.ventaId] = c.t; return m; });
const ventasAll = () => memo("ventasAll", () => {
  const out = [], an = anuladasSet(), cf = confirmadasMap();
  for (const [docId, d] of Object.entries(col("ventas"))) for (const v of (d.ventas || [])) out.push(Object.assign({}, v, {fecha: v.fecha || d.fecha, docId, dev: d.dev || v.dev, uid: v.uid || d.uid, anulada: an.has(v.id), conf: cf[v.id] || 0, pend: esDigital(v.m) && !cf[v.id] && !v.confirmada}));
  return out.sort((a, b) => a.t - b.t);
});
const ventasOk = () => memo("ventasOk", () => ventasAll().filter(v => !v.anulada));
const ventasEn = (a, b) => ventasOk().filter(v => v.fecha >= a && v.fecha <= b);
function lineasExp(v) { const out = []; for (const it of (v.items || [])) { const p = prod(it.pid); if (p && p.combo) for (const c of p.combo) out.push({pid: c.pid, q: c.q * it.q, t: v.t}); else out.push({pid: it.pid, q: it.q, t: v.t}); } return out; }

/* ---------- inventario ---------- */
const mermasAll = () => memo("mermasAll", () => { const out = []; for (const [docId, d] of Object.entries(col("mermas"))) for (const m of (d.items || [])) out.push(Object.assign({fecha: d.fecha, dev: d.dev, docId}, m)); return out.sort((a, b) => a.t - b.t); });
const stockDocs = () => col("stock");
const stockMap = () => memo("stockMap", () => {
  const sold = {}, mer = {}, del = {};
  for (const v of ventasOk()) for (const l of lineasExp(v)) (sold[l.pid] = sold[l.pid] || []).push(l);
  for (const m of mermasAll()) (mer[m.pid] = mer[m.pid] || []).push(m);
  for (const d of Object.values(col("movinv"))) for (const x of (d.items || [])) if (x.delta) (del[x.pid] = del[x.pid] || []).push(x);   // entradas, compras, producción, consumo
  const out = {}, base = id => { const s = stockDocs()[id]; if (!s || s.base == null) return null; let q = s.base; const t0 = s.t || 0; for (const x of (sold[id] || [])) if (x.t > t0) q -= x.q; for (const x of (mer[id] || [])) if (x.t > t0) q -= x.q; for (const x of (del[id] || [])) if (x.t > t0) q += x.q; return Math.round(q * 1000) / 1000; };
  for (const p of prods()) if (p.controla !== false && !p.combo) out[p.id] = base(p.id);
  for (const p of prods()) if (p.combo) { let m = Infinity; for (const c of p.combo) { const s = out[c.pid]; if (s == null) { m = null; break; } m = Math.min(m, Math.floor(s / c.q)); } out[p.id] = m === Infinity ? null : m; }
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
function gastosEn(a, b) {
  const out = [];
  for (const [id, g] of Object.entries(col("gastos"))) if (g.fecha >= a && g.fecha <= b) out.push(Object.assign({id, origen: "gasto"}, g));
  for (const c of cajasAll()) if (c.fecha >= a && c.fecha <= b) for (const m of (c.movs || [])) if (m.tipo === "gasto") out.push({id: m.id, fecha: c.fecha, cat: m.cat || "Otros", desc: m.motivo, valor: m.monto, m: "Efectivo", uid: m.uid, origen: "caja"});
  return out.sort((x, y) => (y.fecha > x.fecha ? 1 : -1));
}
function finanzas(a, b) {
  const vs = ventasEn(a, b); let ventas = 0, cogs = 0, sinCosto = 0, uds = 0;
  for (const v of vs) {
    ventas += v.total; for (const it of (v.items || [])) uds += it.q;
    for (const l of lineasExp(v)) { const c = costoUnit(l.pid, v.t); if (c == null) sinCosto += l.q; else cogs += c * l.q; }
  }
  const gs = gastosEn(a, b), gastosOp = sum(gs.filter(g => g.cat !== BASE_COSTO), g => g.valor), gastosMP = sum(gs.filter(g => g.cat === BASE_COSTO), g => g.valor);
  const bruta = ventas - cogs, utilidad = bruta - gastosOp;
  return {ventas, cogs, bruta, gastos: gastosOp, gastosMP, utilidad, margen: ventas ? utilidad / ventas : NaN, margenBruto: ventas ? bruta / ventas : NaN, n: vs.length, uds, ticket: vs.length ? ventas / vs.length : 0, sinCosto};
}
function rentabilidad(a, b) {
  const rows = {};
  for (const v of ventasEn(a, b)) for (const it of (v.items || [])) {
    const p = prod(it.pid), r = rows[it.pid] = rows[it.pid] || {pid: it.pid, n: (p && p.nombre) || it.n || "?", cat: p ? p.cat : "Otros", uds: 0, ing: 0, costo: 0, sinCosto: 0};
    r.uds += it.q; r.ing += it.p * it.q; const c = costoUnit(it.pid, v.t); if (c == null) r.sinCosto += it.q; else r.costo += c * it.q;
  }
  return Object.values(rows).map(r => Object.assign(r, {util: r.ing - r.costo, margen: r.ing ? (r.ing - r.costo) / r.ing : NaN}));
}
function porClave(a, b, f) { const m = {}; for (const v of ventasEn(a, b)) { const k = f(v); m[k] = (m[k] || 0) + v.total; } return Object.entries(m).sort((x, y) => y[1] - x[1]); }
function serieDiaria(a, b) {
  const out = [], by = {}; for (const v of ventasEn(a, b)) { const o = by[v.fecha] = by[v.fecha] || {ventas: 0, n: 0, cogs: 0}; o.ventas += v.total; o.n++; for (const l of lineasExp(v)) { const c = costoUnit(l.pid, v.t); if (c != null) o.cogs += c * l.q; } }
  const gs = {}; for (const g of gastosEn(a, b)) if (g.cat !== BASE_COSTO) gs[g.fecha] = (gs[g.fecha] || 0) + g.valor;
  for (let d = a, i = 0; d <= b && i < 400; d = addDays(d, 1), i++) { const o = by[d] || {ventas: 0, n: 0, cogs: 0}; out.push({d, ventas: o.ventas, n: o.n, cogs: o.cogs, bruta: o.ventas - o.cogs, util: o.ventas - o.cogs - (gs[d] || 0)}); }
  return out;
}
const configNeg = () => col("config").negocio || {};
const gastosFijosPlan = () => (configNeg().gastosFijos || []);
const totalFijos = () => sum(gastosFijosPlan(), g => g.v);
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
