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
  {path: "anulaciones", write: "interact"}, {path: "confirmaciones", write: "interact"}, {path: "demandaperdida", write: "interact"}, {path: "dispositivos", write: "interact"},
  {path: "costos", read: "admin", write: "admin"}, {path: "recetas", read: "admin", write: "admin"}, {path: "gastos", read: "admin", write: "admin"},
  {path: "compras", read: "admin", write: "admin"}, {path: "config", read: "admin", write: "admin"}, {path: "terceros", read: "admin", write: "admin"}, {path: "periodos", read: "admin", write: "admin"}, {path: "docelec", read: "admin", write: "admin"},
  {path: "data/users", read: "admin", write: "admin"}, {path: "data/users/{self}", read: "interact", write: "interact"}
];
const LV = {view: 1, interact: 2, admin: 3, owner: 4};
const SHARED_COLS = ["productos", "stock", "ventas", "cajas", "mermas", "checklists", "anulaciones", "confirmaciones", "demandaperdida", "dispositivos", "reaperturas", "meta"];
const ADMIN_COLS = ["costos", "recetas", "gastos", "compras", "config", "terceros", "periodos", "docelec"];
const RANGED = new Set(["ventas", "cajas", "mermas", "checklists", "anulaciones", "confirmaciones", "demandaperdida", "reaperturas"]);
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
function pathOf(c, id) { if (c === "audit") { const [u, d] = id.split("__"); return "data/users/" + u + "/" + d; } return c + "/" + id; }

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
  flush() { try { localStorage.setItem("oli-fallback", JSON.stringify(this.mem)); } catch (e) {} },
  tx(ops) {      // ops: [[store, "put"|"del", key, value]]  -> una sola transacción: o se guarda todo o nada
    if (!this.ok) { for (const [s, k, key, v] of ops) { if (k === "put") this.mem[s][key] = v; else delete this.mem[s][key]; } this.flush(); return Promise.resolve(); }
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

/* ---------- escritura offline-first ---------- */
let opSeq = 0;
const newOpId = path => DEV.id + ":" + Date.now().toString(36) + ":" + (++opSeq) + ":" + path;
async function put(colName, id, data) {
  if (!puede(colName, "write")) { const e = new Error("denied"); e.code = "denied"; throw e; }
  const doc = Object.assign({sede: SEDE}, data), path = pathOf(colName, id), prev = (DS.c[colName] || {})[id], prevOp = OUT[path];
  const op = {path, col: colName, id, data: doc, t: Date.now(), opId: newOpId(path), estado: "pendiente", ids: idsDe(doc)};
  DS.c[colName] = Object.assign({}, DS.c[colName], {[id]: doc}); OUT[path] = op; changed();
  try { await IDB.tx([["docs", "put", path, {col: colName, id, data: doc}], ["outbox", "put", path, op]]); }
  catch (e) { const m = Object.assign({}, DS.c[colName]); if (prev === undefined) delete m[id]; else m[id] = prev; DS.c[colName] = m; if (prevOp) OUT[path] = prevOp; else delete OUT[path]; changed(); throw e; }
  if (DS.mode === "db") kickSync(); else { delete OUT[path]; IDB.tx([["outbox", "del", path]]).catch(() => {}); }
  return doc;
}
async function remove(colName, id) {
  if (!puede(colName, "write")) { const e = new Error("denied"); e.code = "denied"; throw e; }
  const path = pathOf(colName, id), m = Object.assign({}, DS.c[colName]); delete m[id]; DS.c[colName] = m;
  const op = {path, col: colName, id, del: true, t: Date.now(), opId: newOpId(path), estado: "pendiente", ids: []}; OUT[path] = op; changed();
  await IDB.tx([["docs", "del", path], ["outbox", "put", path, op]]);
  if (DS.mode === "db") kickSync(); else { delete OUT[path]; IDB.tx([["outbox", "del", path]]).catch(() => {}); }
}
const idsDe = d => { const o = []; for (const k of ["ventas", "items", "movs"]) for (const x of (d && d[k]) || []) if (x && x.id) o.push(x.id); return o; };
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
async function loadAcks() { DS.acks = (await IDB.get("kv", "acks")) || {}; }
function ventaSync(v) {
  if (DS.mode !== "db") return "local";
  const path = "ventas/" + v.docId, acked = (DS.acks || {})[path] || [];
  if (acked.includes(v.id)) return OUT[path] ? "sincronizada" : "sincronizada";
  if (!OUT[path] && v.dev !== DEV.id) return "sincronizada";          // venta de otro dispositivo ya está en el servidor
  if (SYNC.enCurso === path) return "sincronizando";
  return OUT[path] && OUT[path].estado === "rechazada" ? "error" : "pendiente";
}
const pendientes = () => Object.values(OUT).filter(o => o.estado !== "rechazada");
const rechazadas = () => Object.values(OUT).filter(o => o.estado === "rechazada");
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
async function syncNow() {
  if (syncing || DS.mode !== "db") return;
  if (!conRed()) { recalcEstado(); changed(); return; }
  const ops = Object.values(OUT).filter(o => o.estado !== "rechazada").sort((a, b) => a.t - b.t);
  if (!ops.length) { SYNC.estado = "sincronizado"; recalcEstado(); changed(); return; }
  syncing = true; SYNC.total = ops.length; SYNC.hecho = 0; recalcEstado(); changed();
  try {
    for (const op of ops) {
      if (!conRed()) break;
      SYNC.enCurso = op.path; changed();
      try {
        await withTimeout(REMOTE.apply(op), 12000);
        const still = OUT[op.path];
        const acks = DS.acks || (DS.acks = {}); acks[op.path] = (op.ids || []).slice(-600);
        const ops2 = [["kv", "put", "acks", acks]];
        if (still && still.t === op.t) { delete OUT[op.path]; ops2.push(["outbox", "del", op.path]); }
        await IDB.tx(ops2); SYNC.hecho++; SYNC.ultima = Date.now(); netFail = false;
      } catch (e) {
        if (esRechazo(e)) { op.estado = "rechazada"; op.error = (e && e.code) || "error"; OUT[op.path] = op; SYNC.rechazadas = rechazadas().length; await IDB.tx([["outbox", "put", op.path, op]]).catch(() => {}); audit("SYNC_RECHAZADA", op.path, op.error); }
        else { netFail = true; SYNC.error = "sin respuesta del servidor"; break; }
      }
      changed();
    }
  } finally { SYNC.enCurso = ""; syncing = false; SYNC.rechazadas = rechazadas().length; recalcEstado(); changed(); }
  if (pendientes().length) { clearTimeout(syncTimer); syncTimer = setTimeout(() => { netFail = false; syncNow(); }, 8000); }
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
function aplicarSnapshot(name, map) {
  const m = Object.assign({}, map);
  for (const op of Object.values(OUT)) if (op.col === name) { if (op.del) delete m[op.id]; else m[op.id] = op.data; }   // lo pendiente local manda hasta que suba
  DS.c[name] = m; DS.ready[name] = true; DS.remoteSeen = true; DS.lastRemote = Date.now(); netFail = false; persistCol(name); newSalesFeed(name); changed();
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
  DS.subs.push(DS.dbh.collection("data/users/" + uid).onSnapshot(snap => { const m = Object.assign({}, DS.c.audit || {}); snap.docs.forEach(d => { m[uid + "__" + d.id] = d.data(); }); DS.c.audit = m; changed(); }, () => {}));
}
function syncAuditSubs() { if (DS.mode !== "db" || DS.backend !== "claude" || !DS.isAdmin) return; if (DS.uid) subscribeAudit(DS.uid); for (const d of Object.values(DS.c.dispositivos || {})) if (d.uid) subscribeAudit(d.uid); for (const d of Object.values(DS.c.ventas || {})) if (d.uid) subscribeAudit(d.uid); }

/* ---------- arranque ---------- */
async function bootData() {
  await IDB.open(); await bootDevice(); await loadAcks();
  const docs = await IDB.getAll("docs"), outbox = await IDB.getAll("outbox"), ident = await IDB.get("kv", "ident");
  for (const x of Object.values(docs)) (DS.c[x.col] = DS.c[x.col] || {})[x.id] = x.data;
  for (const [p, op] of Object.entries(outbox)) { OUT[p] = op; if (op.estado === "rechazada") SYNC.rechazadas++; if (op.del) { if (DS.c[op.col]) delete DS.c[op.col][op.id]; } else (DS.c[op.col] = DS.c[op.col] || {})[op.id] = op.data; }
  if (window.OLI_CONFIG && window.OLI_CONFIG.supabaseUrl && typeof window.bootSupabase === "function") { await window.bootSupabase(ident); return; }
  let db = null, user = null;
  try { if (window.claude && typeof window.claude.use === "function") [db, user] = await Promise.all([window.claude.use("db"), window.claude.use("user")]); } catch (e) {}
  if (ident && !user) { DS.uid = ident.uid; DS.isAdmin = ident.isAdmin; }
  if (!db) {
    DS.mode = "local"; try { DS.localRole = localStorage.getItem("oli-local-role") || "admin"; } catch (e) {}
    DS.isAdmin = DS.localRole === "admin"; DS.uid = "local"; for (const n of SHARED_COLS.concat(ADMIN_COLS)) DS.ready[n] = true; DS.fromCache = false; recalcEstado(); changed(); return;
  }
  DS.mode = "db"; DS.dbh = db; DS.backend = "claude"; REMOTE.kind = "claude"; REMOTE.desc = "Claude";
  REMOTE.apply = op => op.del ? DS.dbh.doc(op.path).delete() : DS.dbh.doc(op.path).set(op.data);
  for (const n of SHARED_COLS) if (Object.keys(DS.c[n] || {}).length || ident) DS.ready[n] = true;      // con datos guardados, ya se puede operar sin esperar a la red
  try { if (user) { const me = await user.me(); DS.uid = me.id; DS.nombre = me.name || ""; DS.isAdmin = !!(await user.canEdit()); const cw = await user.can("data.write"); DS.canWrite = cw === null ? true : !!cw || DS.isAdmin; await IDB.kvSet("ident", {uid: DS.uid, isAdmin: DS.isAdmin}); } } catch (e) {}
  SHARED_COLS.forEach(subscribe); if (DS.isAdmin) ADMIN_COLS.forEach(subscribe);
  setTimeout(() => { for (const n of SHARED_COLS) DS.ready[n] = true; DS.fromCache = false; changed(); }, 5000);
  recalcEstado(); changed(); kickSync(500);
  setInterval(() => { if (pendientes().length) { netFail = false; kickSync(); } }, 20000);
  setInterval(() => heartbeat(), 45000);
}
const listo = () => DS.mode !== "loading" && !DS.needsLogin && !DS.needsOrg && ["productos", "meta"].every(n => DS.ready[n]);

/* ---------- dispositivos (para el administrador) ---------- */
let lastHb = 0;
function heartbeat(force) {
  if (DS.mode !== "db" || !DEV.listo || !DEV.nombre || !conRed()) return;
  if (Date.now() - lastHb < (force ? 15000 : 40000)) return; lastHb = Date.now();
  put("dispositivos", DEV.id, {dev: DEV.id, nombre: DEV.nombre, uid: DS.uid || "", rol: DS.isAdmin ? "admin" : "empleado", vis: Date.now(), pend: pendientes().length, ventasPend: ventasPendientes(), v: 2}).catch(() => {});
}

/* ---------- conflictos: inventario negativo tras sincronizar ---------- */
function detectarConflictos() {
  if (!window.stockMap) return;
  try {
    const sm = window.stockMap();
    for (const [pid, st] of Object.entries(sm)) if (st != null && st < 0) {
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
