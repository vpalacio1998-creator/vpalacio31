/* ============ 00 · utilidades, iconos e ilustraciones ============ */
const ACT = {};      // acciones de la interfaz (data-act)
const VIEWS = {};    // pantallas
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const num = v => { const n = Number(String(v == null ? "" : v).replace(/[^\d-]/g, "")); return isFinite(n) ? n : 0; };
const numDec = v => { const n = Number(String(v == null ? "" : v).replace(",", ".").replace(/[^\d.-]/g, "")); return isFinite(n) ? n : 0; };
const fmt = n => (n < 0 ? "-$" : "$") + Math.abs(Math.round(Number(n) || 0)).toLocaleString("es-CO");
const fmtK = n => { const a = Math.abs(n), s = n < 0 ? "-" : ""; return a >= 1e6 ? s + "$" + (a / 1e6).toFixed(1).replace(".", ",") + " M" : a >= 1000 ? s + "$" + Math.round(a / 1000) + " mil" : s + "$" + Math.round(a); };
const fmtN = (x, d = 1) => isFinite(x) ? (Math.round(x * 10 ** d) / 10 ** d).toLocaleString("es-CO", {minimumFractionDigits: 0, maximumFractionDigits: d}) : "–";
const pct = (x, d = 0) => isFinite(x) ? (x * 100).toFixed(d).replace(".", ",") + "%" : "–";
const sum = (a, f = x => x) => a.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const uniq = a => [...new Set(a)];
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const ymd = (d = new Date()) => { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); };
const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const diffDays = (a, b) => Math.round((parse(a) - parse(b)) / 864e5);
const dowOf = s => parse(s).getDay();                 // 0 = domingo
const DOW = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const DOWC = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const firstOfMonth = s => s.slice(0, 8) + "01";
const lastOfMonth = s => { const d = parse(s); return ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0)); };
const prevMonthFirst = s => { const d = parse(s); return ymd(new Date(d.getFullYear(), d.getMonth() - 1, 1)); };
const hora = t => new Date(t).toLocaleTimeString("es-CO", {hour: "numeric", minute: "2-digit"});
const cap1 = t => t.charAt(0).toUpperCase() + t.slice(1);
const diaLargo = s => cap1(parse(s).toLocaleDateString("es-CO", {weekday: "long", day: "numeric", month: "long"}));
const diaCorto = s => parse(s).toLocaleDateString("es-CO", {weekday: "short", day: "numeric", month: "short"}).replace(".", "");
const mesNombre = s => parse(s).toLocaleDateString("es-CO", {month: "long", year: "numeric"});
const horaDe = t => new Date(t).getHours();
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const deepClone = o => JSON.parse(JSON.stringify(o));

/* ---------- iconos de línea ---------- */
const IC = {
  hoy: '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5h4v5"/>',
  vender: '<path d="M6 8h12l-1 12H7L6 8z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
  caja: '<rect x="3" y="6" width="18" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 9.5v.01M17.5 14.5v.01"/>',
  inventario: '<path d="m3 8 9-5 9 5v8l-9 5-9-5V8z"/><path d="m3 8 9 5 9-5M12 13v8"/>',
  compras: '<path d="M3 4h2.5l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h8a1.5 1.5 0 0 0 1.5-1.1L20.5 8H6.2"/><circle cx="10" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/>',
  productos: '<path d="M3 12 12 3h8v8l-9 9-8-8z"/><circle cx="15.5" cy="8.5" r="1.4"/>',
  finanzas: '<circle cx="12" cy="12" r="9"/><path d="M14.8 9.2c-.5-.9-1.5-1.4-2.8-1.4-1.6 0-2.7.8-2.7 2s1 1.7 2.7 2.1c1.7.4 2.8.9 2.8 2.2 0 1.2-1.2 2-2.8 2-1.3 0-2.4-.6-2.9-1.5M12 6.2v1.6M12 16.2v1.6"/>',
  analisis: '<path d="M3 17l5-5 4 4 8-9"/><path d="M15 7h5v5"/>',
  reportes: '<path d="M4 20h16"/><rect x="5.5" y="11" width="3" height="9" rx="1"/><rect x="10.5" y="6" width="3" height="14" rx="1"/><rect x="15.5" y="13" width="3" height="7" rx="1"/>',
  decisiones: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/>',
  equipo: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 20c.4-3.6 3-5.5 6-5.5s5.6 1.9 6 5.5"/><path d="M16.5 5.5a3 3 0 0 1 0 6M18.5 15c1.6.7 2.6 2.2 2.8 4.5"/>',
  ajustes: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  mas: '<circle cx="5.5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18.5" cy="12" r="1.5"/>',
  dueno: '<rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M10 18.5h4M9 7h6M9 10.5h6"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  user: '<circle cx="12" cy="8.5" r="3.6"/><path d="M4.5 20c.5-4 3.4-6 7.5-6s7 2 7.5 6"/>',
  alerta: '<path d="M12 3.5 22 20H2L12 3.5z"/><path d="M12 10v4.5M12 17.5v.01"/>',
  campana: '<path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15L6 17z"/><path d="M10 21a2 2 0 0 0 4 0"/>',
  buscar: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  ok: '<path d="m5 12.5 4.5 4.5L19 7"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  borrar: '<path d="M21 5H9l-6 7 6 7h12V5z"/><path d="m13 9 5 6m0-6-5 6"/>',
  estrella: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z"/>',
  moneda: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5c0-1 1-1.7 2.5-1.7s2.5.7 2.5 1.7-1 1.5-2.5 1.9-2.5.9-2.5 2 1 1.8 2.5 1.8 2.5-.8 2.5-1.8"/>',
  sube: '<path d="M4 15l6-6 4 4 6-7"/><path d="M14 6h6v6"/>',
  baja: '<path d="M4 9l6 6 4-4 6 7"/><path d="M14 18h6v-6"/>',
  lento: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  merma: '<path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13"/><path d="M10 11v6M14 11v6"/>',
  receta: '<path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h7"/>',
  check: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12.5 3 3 5-6"/>',
  calendario: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  descargar: '<path d="M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 20h14"/>',
  salir: '<path d="M10 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h4M15 8l4 4-4 4M19 12H10"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
  rayo: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3z"/>',
  editar: '<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/>',
  copiar: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>',
  paleta: '<rect x="7" y="2.5" width="10" height="13.5" rx="5"/><path d="M12 16v5.5M10 6.5v3"/>',
  helado: '<path d="M7.5 11h9L12 21z"/><path d="M7 11a5 5 0 1 1 10 0"/>',
  galleta: '<circle cx="12" cy="12" r="9"/><path d="M9 9v.01M15 9.5v.01M9.5 15v.01M15 15v.01M12 12v.01"/>',
  cafe: '<path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V9z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3v3M12 3v3"/>',
  granizado: '<path d="M6 8h12l-1.5 12h-9L6 8z"/><path d="M5 8c0-2.2 3-3.2 7-3.2S19 5.8 19 8"/><path d="m13 4.8 2-3"/>',
  botella: '<path d="M10 2.5h4V5l2 3v13H8V8l2-3V2.5z"/><path d="M8 13h8"/>',
  lata: '<rect x="7" y="3" width="10" height="18" rx="3"/><path d="M7 8h10M7 16h10"/>',
  copa: '<path d="M5 5h14l-2 14.2a2 2 0 0 1-2 1.8H9a2 2 0 0 1-2-1.8L5 5z"/><path d="M8 11h8"/>',
  combo: '<rect x="3" y="9" width="8" height="11" rx="2.5"/><rect x="13" y="4" width="8" height="16" rx="2.5"/>',
  bolsa: '<path d="M6 8h12l-1 12H7L6 8z"/><path d="M9 8a3 3 0 0 1 6 0"/>',
  insumo: '<path d="M12 3c4 4 6 7 6 10a6 6 0 0 1-12 0c0-3 2-6 6-10z"/>',
  atras: '<path d="M15 5l-7 7 7 7"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.2 5.2 7 7M17 17l1.8 1.8M18.8 5.2 17 7M7 17l-1.8 1.8"/>'
};
const ic = (n, sz = 22) => `<svg class="ic" width="${sz}" height="${sz}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n] || IC.bolsa}</svg>`;

/* ---------- ilustración de producto (foto subida o dibujo con el color del sabor) ---------- */
const SABOR_COLOR = [[/mango/, "#F2A93B"], [/fresa|frutos rojos|mora/, "#D9546E"], [/maracuy/, "#F1C232"], [/chocol|brownie|milo/, "#7A4B2A"], [/coco/, "#E9E2CF"],
  [/lim[oó]n/, "#A8C94B"], [/lulo/, "#9BC15B"], [/arequipe|bocadillo|milky|quimbaya/, "#D9A25B"], [/yogur/, "#E9B6C4"], [/queso/, "#F2D58A"], [/caf[eé]|capuch|latte/, "#8B5E3C"]];
function colorProd(p) { if (p.color) return p.color; const t = (p.nombre || "").toLowerCase(); for (const [re, c] of SABOR_COLOR) if (re.test(t)) return c; return "#8CBA9C"; }
function iconoProd(p) {
  if (p.icono && IC[p.icono]) return p.icono;
  const t = ((p.nombre || "") + " " + (p.cat || "")).toLowerCase();
  if (p.combo) return "combo"; if (p.tipo === "insumo") return "insumo";
  if (/granizad/.test(t)) return "granizado"; if (/paleta/.test(t)) return "paleta"; if (/helado|cono/.test(t)) return "helado"; if (/galleta/.test(t)) return "galleta";
  if (/caf[eé]|capuch|latte|milo/.test(t)) return "cafe"; if (/agua|botella/.test(t)) return "botella"; if (/soda|gaseosa/.test(t)) return "lata"; if (/micheld/.test(t)) return "copa";
  return "bolsa";
}
function prodArt(p, h = 78) {
  if (p.foto) return `<img src="${esc(p.foto)}" alt="" loading="lazy">`;
  const c = colorProd(p), ico = iconoProd(p);
  if (ico === "paleta") return `<svg viewBox="0 0 64 80" width="${h * .8}" height="${h}" aria-hidden="true"><rect x="28" y="52" width="8" height="22" rx="4" fill="#D9C7A3"/><rect x="14" y="6" width="36" height="52" rx="18" fill="${c}"/><rect x="21" y="14" width="7" height="20" rx="3.5" fill="#fff" opacity=".35"/></svg>`;
  return `<span style="color:${c};display:grid;place-items:center">${ic(ico, h * .56)}</span>`;
}
