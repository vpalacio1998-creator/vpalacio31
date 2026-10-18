/* ============ 10 · datos: offline-first, cola de sincronización, identidad y permisos ============
   Autenticación: la maneja claude.ai (cada persona entra con su cuenta).
   Autorización: nivel del botón "Compartir": Editor/Propietario = ADMINISTRADOR, Colaborador = EMPLEADO.
   Las REGLAS de abajo las valida el servidor de la base de datos; esconder botones es solo comodidad.

   Modelo offline-first:
     escribir = (1) guardar en IndexedDB (documento + cola) -> (2) la pantalla ya lo ve -> (3) el motor de sincronización lo sube.
   Idempotencia y conflictos:
     cada dispositivo es el ÚNICO escritor de sus documentos (ventas/{fecha}_{dispositivo}, cajas/..., mermas/...).
     Subir de nuevo el mismo documento no puede duplicar nada, y cada venta lleva un id único.
     El inventario y la caja se calculan sumando todos los dispositivos; si dos cajas venden lo mismo
     y el inventario queda negativo, se registra un CONFLICTO para revisión (nunca se borra nada).
   Multi-sede: todo documento lleva `sede` (hoy "principal"). */
const SEDE = "principal";
const RULES = [
  {path: "", read: "interact", write: "admin"},
  {path: "ventas", write: "interact"}, {path: "cajas", write: "interact"}, {path: "mermas", write: "interact"}, {path: "checklists", write: "interact"},
  {path: "anulaciones", write: "interact"}, {path: "confirmaciones", write: "interact"}, {path: "demandaperdida", write: "interact"}, {path: "dispositivos", write: "interact"}, {path: "cajashelado", write: "interact"},
  {path: "costos", read: "admin", write: "admin"}, {path: "recetas", read: "admin", write: "admin"}, {path: "gastos", read: "admin", write: "admin"},
  {path: "compras", read: "admin", write: "admin"}, {path: "config", read: "admin", write: "admin"}, {path: "terceros", read: "admin", write: "admin"}, {path: "movinv", read: "interact", write: "admin"}, {path: "periodos", read: "admin", write: "admin"}, {path: "docelec", read: "admin", write: "admin"},
  {path: "audit", read: "admin", write: "admin"}, {path: "audit/{self}", read: "interact", write: "interact"},     // cada persona escribe su auditoría; solo el administrador la lee toda
  {path: "data/users", read: "admin", write: "admin"}, {path: "data/users/{self}", read: "interact", write: "interact"}
];
const LV = {view: 1, interact: 2, admin: 3, owner: 4};
const SHARED_COLS = ["productos", "stock", "movinv", "ventas", "cajas", "mermas", "checklists", "anulaciones", "confirmaciones", "demandaperdida", "dispositivos", "reaperturas", "meta", "cajashelado"];
const ADMIN_COLS = ["costos", "recetas", "gastos", "compras", "config", "terceros", "periodos", "docelec"];
const RANGED = new Set(["ventas", "cajas", "mermas", "checklists", "anulaciones", "confirmaciones", "demandaperdida", "reaperturas", "movinv", "cajashelado"]);
const HIST_DIAS = 95;

const DS = {lastRemote: 0, mode: "loading", dbh: null, uid: null, isAdmin: false, canWrite: true, c: {}, v: 0, ready: {}, error: null, fromCache: true, localRole: "admin", subs: [], remoteSeen: false};
const S = {today: ymd(), tab: "vender", cat: "Todas", q: "", cart: [], metodo: "Efectivo", recibido: "", ref: "", armed: null, rango: "7", desde: "", hasta: "", repTipo: "ventas", ultimoProv: "", verTabla: false};
const OUT = {};                    // cola de salida (espejo en memoria de IndexedDB): path -> operación
const SYNC = {estado: "offline", online: false, hecho: 0, total: 0, ultima: 0, error: "", rechazadas: 0, enCurso: ""};
const DEV = {id: "", nombre: "", seq: 0, listo: false};
const REMOTE = {kind: "none", apply: null, subscribe: null, desc: ""};   // adaptador del servidor: claude | supabase

/* ---------- permisos ---------- */
function reglaDe(col) {
  if (col === "audit") return {read: "admin", write: "interact"};
  let best = {read: "view", write: "interact"}, len = -1;
  for (const r of RULES) if (!r.path.includes("{") && (r.path === "" || r.path === col || col.startsWith(r.path + "/")) && r.path.length > len) { len = r.path.length; best = Object.assign({}, best, r); }
  return best;
}
const nivelUsuario = () => DS.isAdmin ? LV.admin : LV.interact;
function puede(col, accion) { const r = reglaDe(col); return nivelUsuario() >= (LV[r[accion] || (accion === "read" ? "view" : "interact")] || 2); }
const esAdmin = () => DS.isAdmin;
function col(name) { if (!puede(name, "read")) return {}; return DS.c[name] || {}; }
function pathOf(c, id) { if (c === "audit") { const [u, d] = id.split("__"); return "audit/" + u + "/d/" + d; } return c + "/" + id; }

/* ---------- reactividad ---------- */
let drawQ = 0;
function changed() { DS.v++; if (!drawQ) drawQ = requestAnimationFrame(() => { drawQ = 0; if (window.draw) window.draw(); }); }
const memo = (k, fn) => { const m = memo.c; if (m.v !== DS.v || m.d0 !== S.today) { m.v = DS.v; m.d0 = S.today; m.d = {}; } return k in m.d ? m.d[k] : (m.d[k] = fn()); };
memo.c = {v: -1, d: {}, d0: ""};

/* ---------- almacenamiento local robusto: IndexedDB (con respaldo en localStorage) ---------- */
/* Migraciones de IndexedDB: nunca se borran datos; cada versión nueva agrega un paso (así una actualización no pierde ventas pendientes). */
const IDB_VERSION = 1;
const IDB_MIGRATIONS = {1: d => { for (const s of ["docs", "outbox", "kv"]) d.createObjectStore(s); }};
const IDB = {
  db: null, ok: false, mem: {docs: {}, outbox: {}, kv: {}},
  open() {
    return new Promise(res => {
      try {
        const r = indexedDB.open("oli-v1", IDB_VERSION);
        r.onupgradeneeded = e => { const d = r.result; for (let v = e.oldVersion + 1; v <= IDB_VERSION; v++) (IDB_MIGRATIONS[v] || (() => {}))(d, r.transaction); };
        r.onsuccess = () => { this.db = r.result; this.ok = true; this.db.onversionchange = () => this.db.close(); res(true); };
        r.onerror = () => res(this.fallback()); r.onblocked = () => res(this.fallback());
      } catch (e) { res(this.fallback()); }
    });
  },
  fallback() { try { const o = JSON.parse(localStorage.getItem("oli-fallback") || "null"); if (o) this.mem = o; } catch (e) {} this.ok = false; return false; },
  flush() {      // respaldo sin IndexedDB: lo crítico (cola de envío y llaves) primero; si no cabe todo, se guarda sin el espejo del servidor
    try { localStorage.setItem("oli-fallback", JSON.stringify(this.mem)); return; } catch (e) {}
    localStorage.setItem("oli-fallback", JSON.stringify({docs: {}, outbox: this.mem.outbox, kv: this.mem.kv}));   // si esto falla, el error sube y la venta NO se da por guardada
  },
  tx(ops) {      // ops: [[store, "put"|"del", key, value]]  -> una sola transacción: o se guarda todo o nada
    if (!this.ok) { const prev = JSON.stringify(this.mem); for (const [s, k, key, v] of ops) { if (k === "put") this.mem[s][key] = v; else delete this.mem[s][key]; }
      try { this.flush(); return Promise.resolve(); } catch (e) { this.mem = JSON.parse(prev); return Promise.reject(Object.assign(new Error("quota"), {code: "quota_exceeded"})); } }
    return new Promise((res, rej) => {
      const stores = uniq(ops.map(o => o[0])), t = this.db.transaction(stores, "readwrite");
      for (const [s, k, key, v] of ops) { const st = t.objectStore(s); if (k === "put") st.put(v, key); else st.delete(key); }
      t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error("abort"));
    });
  },
  getAll(store) {
    if (!this.ok) return Promise.resolve(Object.assign({}, this.mem[store]));
    return new Promise((res, rej) => { const out = {}, c = this.db.transaction(store).objectStore(store).openCursor(); c.onsuccess = () => { const cur = c.result; if (cur) { out[cur.key] = cur.value; cur.continue(); } else res(out); }; c.onerror = () => rej(c.error); });
  },
  async get(store, key) { if (!this.ok) return this.mem[store][key]; return new Promise((res, rej) => { const r = this.db.transaction(store).objectStore(store).get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  kvSet(key, v) { return this.tx([["kv", "put", key, v]]); }
};

/* ---------- identidad del dispositivo ---------- */
async function bootDevice() {
  let id = await IDB.get("kv", "dev.id"); if (!id) { id = "d" + newId().slice(-8); await IDB.kvSet("dev.id", id); }
  DEV.id = id; DEV.nombre = (await IDB.get("kv", "dev.nombre")) || ""; DEV.seq = (await IDB.get("kv", "dev.seq")) || 0; DEV.listo = true;
}
const setDevNombre = async n => { DEV.nombre = n; await IDB.kvSet("dev.nombre", n); };
async function nextSeq() { DEV.seq++; await IDB.kvSet("dev.seq", DEV.seq); return DEV.seq; }

/* ---------- limpiar del equipo lo que el rol actual no puede ver (p. ej. un empleado en una tablet que usó el dueño) ---------- */
async function purgarNoPermitido() {
  const ops = []; for (const c of Object.keys(DS.c)) if (!puede(c, "read")) { delete DS.c[c]; }
  const all = await IDB.getAll("docs"); for (const [p, x] of Object.entries(all)) if (!puede(x.col, "read")) ops.push(["docs", "del", p]);
  if (ops.length) await IDB.tx(ops).catch(() => {});
}
/* ---------- escritura offline-first ---------- */
let opSeq = 0;
const newOpId = path => DEV.id + ":" + Date.now().toString(36) + ":" + (++opSeq) + ":" + path;
const errPausa = () => Object.assign(new Error("OLI está abierta en otra ventana de este equipo. Usa esa ventana."), {code: "pausa"});
async function put(colName, id, data) {
  if (DS.bloqueada) throw errPausa();
  if (!puede(colName, "write")) { const e = new Error("denied"); e.code = "denied"; throw e; }
  const doc = Object.assign({sede: SEDE}, data), path = pathOf(colName, id), prev = (DS.c[colName] || {})[id], prevOp = OUT[path];
  const op = {path, col: colName, id, data: doc, t: Date.now(), opId: newOpId(path), estado: "pendiente", ids: idsDe(doc), uid: DS.uid || null};
  DS.c[colName] = Object.assign({}, DS.c[colName], {[id]: doc}); OUT[path] = op; changed();
  try { await IDB.tx([["docs", "put", path, {col: colName, id, data: doc}], ["outbox", "put", path, op]]); }
  catch (e) { const m = Object.assign({}, DS.c[colName]); if (prev === undefined) delete m[id]; else m[id] = prev; DS.c[colName] = m; if (prevOp) OUT[path] = prevOp; else delete OUT[path]; changed(); throw e; }
  if (DS.mode === "db") kickSync(); else { delete OUT[path]; IDB.tx([["outbox", "del", path]]).catch(() => {}); }
  return doc;
}
async function remove(colName, id) {
  if (DS.bloqueada) throw errPausa();
  if (!puede(colName, "write")) { const e = new Error("denied"); e.code = "denied"; throw e; }
  const path = pathOf(colName, id), m = Object.assign({}, DS.c[colName]); delete m[id]; DS.c[colName] = m;
  const op = {path, col: colName, id, del: true, t: Date.now(), opId: newOpId(path), estado: "pendiente", ids: [], uid: DS.uid || null}; OUT[path] = op; changed();
  await IDB.tx([["docs", "del", path], ["outbox", "put", path, op]]);
  if (DS.mode === "db") kickSync(); else { delete OUT[path]; IDB.tx([["outbox", "del", path]]).catch(() => {}); }
}
const idsDe = d => { const o = []; for (const k of ["ventas", "items", "movs", "cierres"]) for (const x of (d && d[k]) || []) if (x && x.id) o.push(x.id); return o; };
function appendTo(colName, id, field, item, base) { const cur = (DS.c[colName] || {})[id] || Object.assign({}, base, {[field]: []}); return put(colName, id, Object.assign({}, cur, {[field]: (cur[field] || []).concat([item])})); }
function patchItem(colName, id, field, itemId, patch) { const cur = (DS.c[colName] || {})[id]; if (!cur) return Promise.reject(new Error("no existe")); return put(colName, id, Object.assign({}, cur, {[field]: (cur[field] || []).map(x => x.id === itemId ? Object.assign({}, x, patch) : x)})); }

/* ---------- auditoría ---------- */
function audit(accion, ref, det) {
  if (!DS.uid && DS.mode === "db") return;
  const f = S.today, uid = DS.uid || "local", id = uid + "__audit_" + f, cur = (DS.c.audit || {})[id] || {fecha: f, items: []};
  put("audit", id, {fecha: f, items: cur.items.concat([{t: Date.now(), u: uid, dev: DEV.id, a: accion, r: ref || "", d: det || ""}])}).catch(() => {});
}
const auditList = () => memo("audit", () => { if (!DS.isAdmin) return []; const out = []; for (const d of Object.values(DS.c.audit || {})) for (const it of (d.items || [])) out.push(it); return out.sort((a, b) => b.t - a.t); });

/* ---------- estado de sincronización de una venta ---------- */
async function loadAcks() {
  DS.acks = (await IDB.get("kv", "acks")) || {};
  // antes los cierres de caja no quedaban en lo recibido: esas marcas viejas de cajas se olvidan una vez (mejor "no se sabe" que "no llegó")
  if (((await IDB.get("kv", "acksV")) || 0) < 2) { for (const p of Object.keys(DS.acks)) if (p.startsWith("cajas/")) delete DS.acks[p]; await IDB.tx([["kv", "put", "acks", DS.acks], ["kv", "put", "acksV", 2]]).catch(() => {}); }
}
function ventaSync(v) {
  if (DS.mode !== "db") return "local";
  const path = "ventas/" + v.docId, acked = (DS.acks || {})[path] || [];
  if (acked.includes(v.id)) return OUT[path] ? "sincronizada" : "sincronizada";
  if (!OUT[path] && v.dev !== DEV.id) return "sincronizada";          // venta de otro dispositivo ya está en el servidor
  if (SYNC.enCurso === path) return "sincronizando";
  return OUT[path] && OUT[path].estado === "rechazada" ? "error" : "pendiente";
}
const pendientes = () => Object.values(OUT).filter(o => o.estado !== "rechazada");
const enviables = () => pendientes().filter(o => !o.uid || !DS.uid || o.uid === DS.uid || o.uid === "local");
const rechazadas = () => Object.values(OUT).filter(o => o.estado === "rechazada");
/* qué es un cambio, en palabras (para avisar cuando el servidor no lo acepta) */
const NOM_CAMBIO = {ventas: "Ventas", cajas: "Caja", anulaciones: "Anulación de una venta", confirmaciones: "Confirmación de un pago", mermas: "Pérdidas", checklists: "Lista de la caja", cajashelado: "Cambio de caja de helado", demandaperdida: "Lo que pidieron y no había", dispositivos: "Datos del equipo", audit: "Historial", reaperturas: "Caja reabierta"};
const descCambio = o => (NOM_CAMBIO[o.col] || o.col) + (/^\d{4}-\d{2}-\d{2}/.test(String(o.id)) ? " del " + diaCorto(String(o.id).slice(0, 10)) : "");
const ventasPendientes = () => { let n = 0; for (const o of pendientes()) if (o.col === "ventas") { const acked = (DS.acks || {})[o.path] || []; n += (o.ids || []).filter(i => !acked.includes(i)).length; } return n; };

/* ---------- motor de sincronización ---------- */
let syncing = false, syncTimer = 0, netFail = false;
const conRed = () => (typeof navigator === "undefined" || navigator.onLine !== false) && !netFail;
function withTimeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error("timeout"), {code: "timeout"})), ms))]); }
const esRechazo = e => e && (e.code === "invalid_argument" || e.code === "denied" || e.code === "transform_error" || e.code === "quota_exceeded");
function recalcEstado() {
  const p = pendientes().length;
  SYNC.online = DS.mode === "db" && conRed();
  SYNC.estado = DS.mode !== "db" ? "local" : !SYNC.online ? "offline" : syncing ? "sincronizando" : SYNC.rechazadas ? "error" : p ? "pendiente" : "sincronizado";
}
function kickSync(delay = 0) { clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, delay); recalcEstado(); changed(); }
/* orden de envío: primero las ventas y las cajas; las anulaciones y confirmaciones después, porque el servidor revisa que su venta
   ya esté allá (el 15 de oct. una anulación hecha sin Internet llegó antes que su venta y el servidor la rechazó) */
const ORDEN_ENVIO = {ventas: 0, cajas: 1, anulaciones: 3, confirmaciones: 3, dispositivos: 4, audit: 4};
const turnoEnvio = op => op.col in ORDEN_ENVIO ? ORDEN_ENVIO[op.col] : 2;
async function marcarRechazo(op, e) {
  op.estado = "rechazada"; op.error = (e && e.code) || "error"; op.detalle = String((e && e.message) || "").slice(0, 160); op.reint = 1;   // ya se reintentó en la ronda
  if (OUT[op.path] === op) { SYNC.rechazadas = rechazadas().length; await IDB.tx([["outbox", "put", op.path, op]]).catch(() => {}); }   // si ya hay un cambio más nuevo, ese manda
  audit("SYNC_RECHAZADA", op.path, descCambio(op) + (op.detalle ? " · " + op.detalle : ""));
}
/* El servidor recuerda el número de cada envío, también el de los que rechazó, y a uno repetido le contesta "duplicado" (que aquí
   cuenta como guardado). Antes de volver a mandar algo rechazado se le da un número nuevo: si no, se borraría sin haberse guardado. */
const numeroNuevo = op => { op.opId = newOpId(op.path); return op; };
async function syncNow() {
  if (syncing || DS.mode !== "db" || DS.bloqueada || DS.needsLogin) return;                   // en la pantalla de ingreso no se envía: se envía al ingresar
  if (!conRed()) { recalcEstado(); changed(); return; }
  // lo que se rechazó antes (p. ej. en la versión anterior, una anulación que llegó antes que su venta) se reintenta una vez, con número
  // nuevo, cuando su dueño ya ingresó; lo de otra persona sigue a la vista como rechazado
  const reint = DS.uid || DS.backend !== "supabase" ? rechazadas().filter(o => !o.reint && (!o.uid || o.uid === DS.uid || o.uid === "local")) : [];
  if (reint.length) { for (const o of reint) { o.estado = "pendiente"; o.reint = 1; numeroNuevo(o); } await IDB.tx(reint.map(o => ["outbox", "put", o.path, o])).catch(() => {}); SYNC.rechazadas = rechazadas().length; }
  if (syncing) return;                                                                        // (otra ronda empezó mientras se guardaba)
  // solo se envía lo que hizo la persona con sesión abierta (lo de otra persona espera a que ella vuelva a ingresar)
  const ops = enviables().sort((a, b) => turnoEnvio(a) - turnoEnvio(b) || a.t - b.t);
  if (!ops.length) { SYNC.estado = "sincronizado"; recalcEstado(); changed(); return; }
  syncing = true; SYNC.total = ops.length; SYNC.hecho = 0; recalcEstado(); changed();
  const enviar = async op => {                                                               // null = llegó; "red" = sin respuesta; si no, el rechazo
    SYNC.enCurso = op.path; changed();
    try {
      await withTimeout(REMOTE.apply(op), 12000);
      const still = OUT[op.path];
      const acks = DS.acks || (DS.acks = {}); acks[op.path] = (op.del ? [] : idsDe(op.data)).slice(-600);   // de lo que se envió (también ops guardados por una versión anterior)
      const ops2 = [["kv", "put", "acks", acks]];
      if (still && still.t === op.t) { delete OUT[op.path]; ops2.push(["outbox", "del", op.path]); }
      await IDB.tx(ops2); SYNC.hecho++; SYNC.ultima = Date.now(); netFail = false; return null;
    } catch (e) {
      if (!esRechazo(e)) { netFail = true; SYNC.error = "sin respuesta del servidor"; return "red"; }
      if (OUT[op.path] === op) { numeroNuevo(op); await IDB.tx([["outbox", "put", op.path, op]]).catch(() => {}); }   // ya rechazado: el próximo intento va con número nuevo
      return e;
    }
  };
  try {
    const dudosas = []; let red = false;
    for (const op of ops) {
      if (!conRed()) { red = true; break; }
      const r = await enviar(op); if (r === "red") { red = true; break; }
      if (r) dudosas.push([op, r]); changed();
    }
    // lo rechazado se prueba otra vez al final de la ronda (lo que le faltaba pudo llegar después); si vuelve a fallar, queda rechazado.
    // Si se cayó la red, queda pendiente para la próxima ronda.
    for (const [op, e0] of dudosas) {
      if (red || !conRed()) break;
      if (OUT[op.path] !== op) continue;                                                       // cambió mientras tanto: lo nuevo se envía en la próxima ronda
      let e = e0;
      if (SYNC.hecho) { e = await enviar(op); if (e === "red") break; if (!e || OUT[op.path] !== op) continue; }
      await marcarRechazo(op, e); changed();
    }
  } finally { SYNC.enCurso = ""; syncing = false; SYNC.rechazadas = rechazadas().length; recalcEstado(); changed(); }
  if (enviables().length) { clearTimeout(syncTimer); syncTimer = setTimeout(() => { netFail = false; syncNow(); }, 8000); }
  else { SYNC.estado = "sincronizado"; recalcEstado(); heartbeat(true); detectarConflictos(); }
}
window.addEventListener("online", () => { netFail = false; kickSync(200); heartbeat(true); });
window.addEventListener("offline", () => { recalcEstado(); changed(); });
document.addEventListener("visibilitychange", () => { if (!document.hidden) { netFail = false; kickSync(300); } });

/* ---------- espejo local de lo que llega del servidor ---------- */
const persistTimers = {};
function persistCol(name) {
  clearTimeout(persistTimers[name]);
  persistTimers[name] = setTimeout(async () => {
    try { const all = await IDB.getAll("docs"), ops = [], cur = DS.c[name] || {};
      for (const [p, x] of Object.entries(all)) if (x.col === name && !(x.id in cur) && !OUT[p]) ops.push(["docs", "del", p]);
      for (const [id, data] of Object.entries(cur)) ops.push(["docs", "put", pathOf(name, id), {col: name, id, data}]);
      if (ops.length) await IDB.tx(ops); } catch (e) {}
  }, 800);
}
/* integridad: ventas, movimientos de caja, cierres, mermas y anulaciones nunca se borran. Si un documento del servidor
   llega con menos elementos de los que este equipo ya vio (otra ventana o alguien lo sobrescribió), el administrador lo restaura uniendo por id. */
const UNION = {ventas: ["ventas"], cajas: ["movs", "cierres"], mermas: ["items"], anulaciones: ["items"], confirmaciones: ["items"], reaperturas: ["items"], movinv: ["items"], demandaperdida: ["items"], cajashelado: ["items"]};
/* Datos que el administrador borró (meta/purgas: por colección, la fecha desde la que se conservan; p. ej. ventas de prueba
   antes de abrir). No se muestran, no se restauran y lo pendiente de esas fechas se descarta: el servidor tampoco lo guarda. */
const cortesPurga = () => ((((DS.c.meta || {}).purgas) || {}).cortes) || {};
const purgado = (n, doc) => { const c = cortesPurga()[n]; return !!(typeof c === "string" && c && doc && typeof doc.fecha === "string" && doc.fecha < c); };
function descartarPurgados() {
  const cortes = cortesPurga(); if (!Object.keys(cortes).length) return;
  const ops = [], fuera = [];
  for (const op of Object.values(OUT)) if (!op.del && purgado(op.col, op.data)) { delete OUT[op.path]; ops.push(["outbox", "del", op.path]); fuera.push(op.path); }
  for (const n of Object.keys(cortes)) {
    const m = DS.c[n]; if (!m) continue; let cambio = false; const c = Object.assign({}, m);
    for (const [id, d] of Object.entries(m)) if (purgado(n, d)) { delete c[id]; cambio = true; }
    if (cambio) { DS.c[n] = c; persistCol(n); }
  }
  if (ops.length) { IDB.tx(ops).catch(() => {}); SYNC.rechazadas = rechazadas().length; recalcEstado(); audit("DATOS_DESCARTADOS", "", fuera.length + " envío(s) pendientes de fechas que el administrador borró: " + fuera.join(", ")); }
}
function restaurarPerdidos(name, map) {
  if (!UNION[name] || !DS.isAdmin || DS.mode !== "db") return;                                   // también en la primera carga: si el servidor perdió algo, lo guardado en este equipo lo restaura
  const prev = DS.c[name] || {}, fix = [];
  for (const [id, old] of Object.entries(prev)) {
    if (OUT[pathOf(name, id)] || String(id).startsWith("demo-") || purgado(name, old) || (RANGED.has(name) && old.fecha && old.fecha < addDays(S.today, -HIST_DIAS + 2))) continue; const cur = map[id]; let doc = cur ? Object.assign({}, cur) : Object.assign({}, old), cambio = !cur;
    for (const f of UNION[name]) { const ids = new Set(((cur && cur[f]) || []).map(x => x && x.id)), faltan = (old[f] || []).filter(x => x && x.id && !ids.has(x.id)); if (faltan.length) { doc[f] = ((cur && cur[f]) || []).concat(faltan).sort((x, y) => (x.t || 0) - (y.t || 0)); cambio = true; } }
    if (name === "cajas" && old.apertura && cur && !cur.apertura) { doc.apertura = old.apertura; cambio = true; }
    if (cambio) fix.push([id, doc]);
  }
  if (fix.length) setTimeout(() => { for (const [id, doc] of fix) put(name, id, doc).catch(() => {}); audit("DATOS_RESTAURADOS", name, fix.length + " documento(s) restaurados: " + fix.map(x => x[0]).join(", ")); }, 0);
}
function aplicarSnapshot(name, map) {
  restaurarPerdidos(name, map);
  const m = Object.assign({}, map);
  for (const op of Object.values(OUT)) if (op.col === name) { if (op.del) delete m[op.id]; else m[op.id] = op.data; }   // lo pendiente local manda hasta que suba
  DS.c[name] = m; DS.ready[name] = true; DS.remoteSeen = true; DS.lastRemote = Date.now(); netFail = false; persistCol(name);
  descartarPurgados(); newSalesFeed(name); changed();
}

/* ---------- suscripciones en tiempo real ---------- */
function subscribe(name) {
  const ref = DS.dbh.collection(name), q = RANGED.has(name) ? ref.where("fecha", ">=", addDays(S.today, -HIST_DIAS)) : ref;
  DS.subs.push(q.onSnapshot(snap => { const m = {}; snap.docs.forEach(d => { m[d.id] = d.data(); }); aplicarSnapshot(name, m); recalcEstado(); },
    e => { DS.ready[name] = true; if (e && e.code === "revoked") DS.error = "Se perdió el acceso a los datos."; changed(); }));
}
const auditSubs = new Set();
function subscribeAudit(uid) {
  if (!uid || auditSubs.has(uid) || !DS.isAdmin || DS.mode !== "db") return; auditSubs.add(uid);
  DS.subs.push(DS.dbh.collection("audit/" + uid + "/d").onSnapshot(snap => { const m = Object.assign({}, DS.c.audit || {}); snap.docs.forEach(d => { m[uid + "__" + d.id] = d.data(); }); DS.c.audit = m; changed(); }, () => {}));
}
function syncAuditSubs() { if (DS.mode !== "db" || DS.backend !== "claude" || !DS.isAdmin) return; if (DS.uid) subscribeAudit(DS.uid); for (const d of Object.values(DS.c.dispositivos || {})) if (d && d.uid) subscribeAudit(d.uid); for (const d of Object.values(DS.c.ventas || {})) if (d.uid) subscribeAudit(d.uid); }

/* ---------- arranque ---------- */
async function bootData() {
  await IDB.open(); await bootDevice(); await loadAcks();
  const docs = await IDB.getAll("docs"), outbox = await IDB.getAll("outbox"), ident = await IDB.get("kv", "ident");
  for (const x of Object.values(docs)) (DS.c[x.col] = DS.c[x.col] || {})[x.id] = x.data;
  for (const [p, op] of Object.entries(outbox)) { OUT[p] = op; if (op.estado === "rechazada") SYNC.rechazadas++; if (op.del) { if (DS.c[op.col]) delete DS.c[op.col][op.id]; } else (DS.c[op.col] = DS.c[op.col] || {})[op.id] = op.data; }
  if (window.OLI_CONFIG && window.OLI_CONFIG.supabaseUrl && typeof window.bootSupabase === "function") { await window.bootSupabase(ident); return; }
  const pedir = async () => { try { if (window.claude && typeof window.claude.use === "function") { const r = await Promise.all([window.claude.use("db"), window.claude.use("user")]); return r; } } catch (e) {} return [null, null]; };
  let [db, user] = await pedir();
  if (!db && window.claude && ident) for (let i = 0; i < 2 && !db; i++) { await new Promise(r => setTimeout(r, 1500)); [db, user] = await pedir(); }
  if (ident && !user) { DS.uid = ident.uid; DS.isAdmin = ident.isAdmin; }
  if (!db && window.claude && ident) {
    // este equipo ya trabajó con el servidor: NO pasar a modo local (perdería la cola de envío). Sigue sin conexión y reintenta.
    DS.mode = "db"; DS.backend = "claude"; REMOTE.kind = "claude"; REMOTE.desc = "Claude"; REMOTE.apply = () => Promise.reject({code: "unavailable"}); netFail = true;
    for (const n of SHARED_COLS.concat(DS.isAdmin ? ADMIN_COLS : [])) DS.ready[n] = true; recalcEstado(); changed();
    const reint = setInterval(async () => { const [d, u] = await pedir(); if (d) { clearInterval(reint); netFail = false; await conectarClaude(d, u, ident); } }, 15000);
    return;
  }
  if (!db) {
    DS.mode = "local"; try { DS.localRole = localStorage.getItem("oli-local-role") || "admin"; } catch (e) {}
    DS.isAdmin = DS.localRole === "admin"; DS.uid = "local"; for (const n of SHARED_COLS.concat(ADMIN_COLS)) DS.ready[n] = true; DS.fromCache = false; recalcEstado(); changed(); return;
  }
  await conectarClaude(db, user, ident);
}
async function conectarClaude(db, user, ident) {
  DS.mode = "db"; DS.dbh = db; DS.backend = "claude"; REMOTE.kind = "claude"; REMOTE.desc = "Claude";
  REMOTE.apply = op => op.del ? DS.dbh.doc(op.path).delete() : DS.dbh.doc(op.path).set(op.data);
  for (const n of SHARED_COLS) if (Object.keys(DS.c[n] || {}).length || ident) DS.ready[n] = true;      // con datos guardados, ya se puede operar sin esperar a la red
  try { if (user) { const me = await user.me(); DS.uid = me.id; DS.nombre = me.name || ""; DS.isAdmin = !!(await user.canEdit()); const cw = await user.can("data.write"); DS.canWrite = cw === null ? true : !!cw || DS.isAdmin; await IDB.kvSet("ident", {uid: DS.uid, isAdmin: DS.isAdmin}); } } catch (e) {}
  if (!DS.isAdmin) await purgarNoPermitido();
  SHARED_COLS.forEach(subscribe); if (DS.isAdmin) ADMIN_COLS.forEach(subscribe);
  setTimeout(() => { for (const n of SHARED_COLS.concat(DS.isAdmin ? ADMIN_COLS : [])) DS.ready[n] = true; DS.fromCache = false; changed(); }, 5000);
  recalcEstado(); changed(); kickSync(500);
  setInterval(() => { if (enviables().length) { netFail = false; kickSync(); } }, 20000);
  setInterval(() => heartbeat(), 45000);
}
const listo = () => DS.mode !== "loading" && !DS.needsLogin && !DS.needsOrg && ["productos", "meta"].every(n => DS.ready[n]);

/* ---------- dispositivos (para el administrador) ---------- */
let lastHb = 0, lastRech = -1;
function heartbeat(force) {
  if (DS.mode !== "db" || !DEV.listo || !DEV.nombre || !conRed() || DS.needsLogin) return;
  const rech = rechazadas();                                                                  // el administrador ve en su equipo lo que el servidor le rechazó a este
  if (Date.now() - lastHb < (force ? 15000 : 40000) && rech.length === lastRech) return; lastHb = Date.now(); lastRech = rech.length;   // si cambió, se avisa ya
  put("dispositivos", DEV.id, {dev: DEV.id, nombre: DEV.nombre, uid: DS.uid || "", rol: DS.isAdmin ? "admin" : "empleado", vis: Date.now(), pend: pendientes().length, ventasPend: ventasPendientes(),
    rech: rech.length, rechInfo: rech.slice(0, 5).map(o => ({c: descCambio(o), e: o.detalle || "", t: o.t})), v: 2}).catch(() => {});
}

/* ---------- conflictos: inventario negativo tras sincronizar ---------- */
function detectarConflictos() {
  if (!window.stockMap) return;
  try {
    const sm = window.stockMap();
    for (const [pid, st] of Object.entries(sm)) if (st != null && st < 0) {
      const p = typeof prod === "function" ? prod(pid) : null; if (p && (p.combo || p.activo === false)) continue;   // un combo o un producto desactivado no se cuenta: el aviso va en su insumo
      const key = "conf_" + pid + "_" + S.today, ya = (DS.c.audit || {})[(DS.uid || "local") + "__audit_" + S.today];
      if (ya && (ya.items || []).some(i => i.a === "CONFLICTO_INVENTARIO" && i.r === pid)) continue;
      audit("CONFLICTO_INVENTARIO", pid, "Inventario quedó en " + st + " al sincronizar ventas de varios dispositivos. Revisar y hacer un conteo.");
    }
  } catch (e) {}
}

/* ---------- actividad en vivo (nuevas ventas de otros dispositivos) ---------- */
const FEED = []; const seenSales = new Set(); let feedArmed = false;
function newSalesFeed(name) {
  if (name !== "ventas") return;
  const ids = [];
  for (const [docId, d] of Object.entries(DS.c.ventas || {})) for (const v of (d.ventas || [])) ids.push([v, d, docId]);
  if (!feedArmed) { ids.forEach(([v]) => seenSales.add(v.id)); feedArmed = true; return; }
  for (const [v, d, docId] of ids) if (!seenSales.has(v.id)) {
    seenSales.add(v.id);
    if (d.dev !== DEV.id && Date.now() - v.t < 180000) { FEED.unshift({t: Date.now(), tipo: "venta", v, uid: d.uid, dev: d.dev}); FEED.splice(30); if (window.onNuevaVenta) window.onNuevaVenta(v, d); }
  }
}
