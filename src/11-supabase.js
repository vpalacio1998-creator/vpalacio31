/* ============ 11 · adaptador Supabase (producción) ============
   Auth: Supabase Auth (correo + contraseña). Datos: oli_docs (RLS) + RPC oli_apply (idempotente).
   Tiempo real: Supabase Realtime (postgres_changes). La anon key es pública por diseño: la seguridad real está en RLS y en oli_apply.
   Nunca hay claves secretas en el frontend. Config en window.OLI_CONFIG (generada en el build desde variables de entorno). */
const APP_VERSION = window.OLI_BUILD || "dev";
const SB = {client: null, org: null, store: null, role: null, email: "", chan: null, rt: "", rtWasDown: false, authError: false, subs: false, sinVerificar: false, gen: 0, autoParado: false, salio: false};
/* ¿el error es de red (sin Internet, servidor caído o en pausa, WiFi sin salida)? No es lo mismo que una clave mala o una sesión revocada. */
const errRed = e => !!e && ((window.supabase && typeof window.supabase.isAuthRetryableFetchError === "function" && window.supabase.isAuthRetryableFetchError(e)) ||
  e.name === "AuthRetryableFetchError" || e.code === "timeout" || e.status === 0 || /failed to fetch|networkerror|network request failed|load failed/i.test(String(e.message || "")));
const SB_ADMIN_COLS = ADMIN_COLS.concat(["audit"]);

async function bootSupabase(ident) {
  const cfg = window.OLI_CONFIG;
  if (!window.supabase || !window.supabase.createClient) { DS.mode = "local"; DS.error = "No se pudo cargar la conexión con el servidor."; changed(); return; }
  SB.client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: false}, realtime: {params: {eventsPerSecond: 20}}});
  DS.mode = "db"; DS.backend = "supabase"; REMOTE.kind = "supabase"; REMOTE.desc = "Supabase"; REMOTE.apply = sbApply;
  SB.client.auth.onAuthStateChange(sbCambioSesion);
  let session = null, err = null; try { const r = await withTimeout(SB.client.auth.getSession(), 5000); session = r.data && r.data.session; err = r.error; } catch (e) { err = e; }
  /* La sesión vencida se renueva con el servidor. Si el servidor no responde (sin Internet, caído, en pausa o WiFi sin salida),
     el equipo que ya había ingresado abre con lo guardado y se reconecta solo cuando el servidor vuelva.
     Una sesión cerrada o revocada (error que no es de red) sí pide ingresar de nuevo. */
  const sinServidor = (typeof navigator !== "undefined" && navigator.onLine === false) || errRed(err);
  if (!session && ident && ident.sb && sinServidor) {
    usarIdent(ident); SB.sinVerificar = true; sbIniciar();
    SB.client.auth.getSession().then(r => { const s = r && r.data && r.data.session; if (s) sbCambioSesion("TOKEN_REFRESHED", s); }).catch(() => {});   // por si la sesión se renovó justo después de los 5 segundos
    return;
  }
  if (!session) { DS.needsLogin = true; changed(); return; }
  await sbCompletarSesion(session);
}
/* cuando el servidor vuelve y la sesión se renueva, el equipo que abrió sin verificar se conecta y recarga; si la sesión fue revocada, pide ingresar */
function sbCambioSesion(ev, session) {
  if (SB.salio) { if ((ev === "TOKEN_REFRESHED" || ev === "SIGNED_IN") && session) setTimeout(() => { withTimeout(SB.client.auth.signOut(), 6000).catch(() => {}).then(borrarSesionGuardada); }, 0); return; }   // se cerró sesión: una renovación que venía en camino no la revive
  if (!SB.sinVerificar) return;
  if ((ev === "TOKEN_REFRESHED" || ev === "SIGNED_IN") && session) {
    SB.sinVerificar = false; setTimeout(async () => { if (SB.chan) { try { SB.client.removeChannel(SB.chan); } catch (e) {} SB.chan = null; } netFail = false; SYNC.error = ""; await sbCompletarSesion(session); }, 0);   // sbCompletarSesion -> sbIniciar recarga todo una vez y envía lo pendiente
  } else if (ev === "SIGNED_OUT") {
    SB.sinVerificar = false; setTimeout(() => { DS.needsLogin = true; DS.loginMsg = "Tu sesión venció. Ingresa de nuevo: lo que quedó guardado en este equipo se envía al ingresar."; changed(); }, 0);
  }
}
async function sbCompletarSesion(session) {
  const gen = SB.gen;                                                                       // si alguien cierra sesión mientras esto espera, no se vuelve a entrar solo
  let me = null, fallo = false; try { const r = await withTimeout(SB.client.rpc("oli_me"), 9000); me = r.data; fallo = !!r.error; } catch (e) { fallo = true; }
  const ident = await IDB.get("kv", "ident"); if (gen !== SB.gen) return;
  if (!me && fallo && ident && ident.sb && ident.uid === session.user.id) usarIdent(ident);                           // servidor sin respuesta: identidad guardada
  else if (!me) { DS.needsLogin = false; DS.needsOrg = true; DS.uid = session.user.id; SB.email = session.user.email || ""; changed(); return; }
  else { SB.org = me.org_id; SB.store = me.store_id; SB.role = me.role; DS.uid = session.user.id; DS.isAdmin = !!me.is_admin; DS.nombre = me.name || (session.user.email || "").split("@")[0]; SB.email = session.user.email || "";
    if (gen !== SB.gen) return; await IDB.kvSet("ident", {uid: DS.uid, isAdmin: DS.isAdmin, org: SB.org, store: SB.store, role: SB.role, nombre: DS.nombre, sb: true}); }
  DS.needsLogin = false; DS.needsOrg = false; DS.loginMsg = ""; await purgarNoPermitido();
  if (DS.isAdmin && S.tab === "vender" && !leerHash()) S.tab = "hoy";                                       // el administrador empieza en Inicio (al arrancar aún no se sabía quién entraba)
  sbIniciar();
}
function usarIdent(i) { DS.uid = i.uid; DS.isAdmin = i.isAdmin; SB.org = i.org; SB.store = i.store; SB.role = i.role; DS.nombre = i.nombre || ""; DS.needsLogin = false; }
/* lo que este rol no puede leer no debe quedarse en el dispositivo (p. ej. costos en la tablet del empleado) */
function sbIniciar() {
  const cols = SHARED_COLS.concat(DS.isAdmin ? SB_ADMIN_COLS : []);
  for (const n of SHARED_COLS) if (Object.keys(DS.c[n] || {}).length) DS.ready[n] = true;
  sbCargarTodo(cols); if (!SB.sinVerificar) sbRealtime();                                  // sin sesión verificada no se pide nada al servidor: se espera a que la sesión se renueve
  setTimeout(() => { for (const n of SHARED_COLS) DS.ready[n] = true; DS.fromCache = false; changed(); }, 6000);
  recalcEstado(); changed(); kickSync(500);
  if (!SB.subs) { SB.subs = true;
    setInterval(() => { if (pendientes().length) { netFail = false; kickSync(); } }, 20000);
    setInterval(() => heartbeat(), 45000);
    setInterval(() => { if (SB.rtWasDown && conRed()) sbCargarTodo(); }, 20000);                                  // respaldo SOLO si el tiempo real está caído
    window.addEventListener("online", () => { sbCargarTodo(); });
  }
}
const sbCols = () => SHARED_COLS.concat(DS.isAdmin ? SB_ADMIN_COLS : []);
async function sbCargar(name) {
  const desde = addDays(S.today, -HIST_DIAS), m = {}; let from = 0;
  for (;;) {
    let q = SB.client.from("oli_docs").select("doc_id,data").eq("org_id", SB.org).eq("collection", name).range(from, from + 999);
    if (RANGED.has(name)) q = q.gte("data->>fecha", desde);
    const r = await withTimeout(q, 15000); if (r.error) throw r.error;
    for (const x of r.data) m[x.doc_id] = x.data; if (r.data.length < 1000) break; from += 1000;
  }
  aplicarSnapshot(name, m);
}
async function sbCargarTodo(cols) { if (SB.sinVerificar) return; for (const n of (cols || sbCols())) { try { await sbCargar(n); } catch (e) { DS.ready[n] = true; if (e && /JWT|401|auth/i.test(e.message || "")) SB.authError = true; } } if (!SB.rtWasDown) SB.authError = false; recalcEstado(); changed(); }
function sbRealtime() {
  if (SB.chan) return;
  SB.chan = SB.client.channel("oli-docs-" + SB.org).on("postgres_changes", {event: "*", schema: "public", table: "oli_docs", filter: "org_id=eq." + SB.org}, p => {
    const row = p.new && p.new.collection ? p.new : p.old; if (!row || !row.collection) return; const n = row.collection; if (!puede(n, "read")) return;
    const cur = Object.assign({}, DS.c[n]); if (p.eventType === "DELETE") delete cur[row.doc_id]; else cur[row.doc_id] = p.new.data; aplicarSnapshot(n, cur);
  }).subscribe(st => { SB.rt = st; if (st === "SUBSCRIBED") { if (SB.rtWasDown) sbCargarTodo(); SB.rtWasDown = false; } else if (st === "CHANNEL_ERROR" || st === "TIMED_OUT" || st === "CLOSED") SB.rtWasDown = true; changed(); });
}
async function sbApply(op) {
  if (SB.sinVerificar) throw {code: "unavailable", message: "esperando que el servidor responda"};   // cada llamada esperaría ~30 s renovando la sesión y se acumularían
  const payload = [{op_id: op.opId, col: op.col, id: op.id, data: op.del ? null : op.data, del: !!op.del, t: op.t, device_id: DEV.id}];
  let r; try { r = await SB.client.rpc("oli_apply", {p_ops: payload, p_device_id: DEV.id, p_app_version: APP_VERSION}); } catch (e) { throw {code: "unavailable", message: String(e && e.message || e)}; }
  if (r.error) {
    const m = String(r.error.message || ""), st = r.error.status || r.status || 0;
    if (r.error.code === "28000" || /not_authenticated|JWT|expired/i.test(m) || st === 401) { SB.authError = true; throw {code: "unavailable", message: "sesión vencida"}; }
    if (st === 409 || r.error.code === "23505" || r.error.code === "40001" || r.error.code === "40P01") throw {code: "unavailable", message: "reintentar"};   // carrera momentánea, no es rechazo
    if (r.error.code === "42501" || /no_membership/.test(m) || (st >= 400 && st < 500 && st !== 408 && st !== 429)) throw {code: "invalid_argument", message: m};
    throw {code: "unavailable", message: m};
  }
  SB.authError = false; const x = r.data && r.data[0]; if (x && x.status === "rejected") throw {code: "invalid_argument", message: x.detail || "rechazada"};
  if (x && x.status === "stale" && x.data) setTimeout(() => {      // había un cambio más reciente en el servidor: este equipo se corrige y avisa
    if (OUT[op.path]) return; DS.c[op.col] = Object.assign({}, DS.c[op.col], {[op.id]: x.data}); persistCol(op.col); changed();
    toast("Un cambio hecho en este equipo no se aplicó porque ya había uno más reciente.", true);
  }, 0);
  return x;
}
async function sbLogin(email, pass) {
  SB.salio = false; let r; try { r = await withTimeout(SB.client.auth.signInWithPassword({email: email.trim(), password: pass}), 20000); } catch (e) { r = {error: e, data: {}}; }
  if (r.error && errRed(r.error)) throw new Error("No hay conexión con el servidor de OLI. Revisa el Internet; si hay Internet, el servidor no está respondiendo: avísale al administrador.");
  if (r.error || !r.data.session) { const e = new Error("No pudimos ingresar. Revisa tu correo y contraseña."); throw e; }
  if (SB.autoParado) { SB.autoParado = false; try { SB.client.auth.startAutoRefresh(); } catch (e) {} }
  await sbCompletarSesion(r.data.session);
}
async function sbCrearNegocio(nombre) { const r = await SB.client.rpc("oli_bootstrap", {p_org_name: nombre, p_store_name: "OLI 001"}); if (r.error) throw new Error("No se pudo crear el negocio. " + (r.error.message || "")); const s = await SB.client.auth.getSession(); await sbCompletarSesion(s.data.session); }
async function sbSalir() {
  const sinServidor = SB.sinVerificar || !conRed(); SB.gen++; SB.sinVerificar = false; SB.salio = true;
  if (!sinServidor) { try { await withTimeout(SB.client.auth.signOut(), 6000); } catch (e) {} }        // con servidor: también se invalida la sesión allá
  try { SB.autoParado = true; await withTimeout(SB.client.auth.stopAutoRefresh(), 2000); } catch (e) {}  // nada debe renovar esta sesión por su cuenta
  borrarSesionGuardada();                                                                           // sin servidor, signOut no la borra: se borra aquí
  if (SB.chan) { try { SB.client.removeChannel(SB.chan); } catch (e) {} SB.chan = null; }
  await IDB.tx([["kv", "del", "ident"]]).catch(() => {});
  // lo que solo ve el administrador (costos, gastos, configuración, auditoría) no se queda en el equipo al cerrar sesión; lo compartido sí, para poder vender sin Internet
  const soloAdmin = new Set(SB_ADMIN_COLS); for (const c of soloAdmin) delete DS.c[c];
  try { const all = await IDB.getAll("docs"), ops = []; for (const [p, x] of Object.entries(all || {})) if (x && soloAdmin.has(x.col)) ops.push(["docs", "del", p]); if (ops.length) await IDB.tx(ops); } catch (e) {}
  DS.needsLogin = true; DS.loginMsg = ""; DS.isAdmin = false; DS.uid = null; changed();
}
function borrarSesionGuardada() { try { for (let i = localStorage.length - 1; i >= 0; i--) { const k = localStorage.key(i); if (k && /^sb-.*-auth-token/.test(k)) localStorage.removeItem(k); } } catch (e) {} }
async function sbInvitar(d) { const r = await SB.client.functions.invoke("invite-user", {body: d}); if (r.error) throw new Error((r.data && r.data.error) || "No se pudo crear la cuenta."); return r.data; }
/* fotos: la imagen completa va a Storage; en el documento queda la ruta y una miniatura para verla sin conexión */
async function sbSubirFoto(blob, pid) { const path = SB.org + "/products/" + pid + ".jpg"; const r = await SB.client.storage.from("product-images").upload(path, blob, {upsert: true, contentType: "image/jpeg"}); if (r.error) throw r.error; return path; }
/* errores no controlados -> auditoría (monitoreo) */
let errCount = 0;
window.addEventListener("error", e => { if (errCount++ < 5) try { audit("ERROR_APP", "", String(e.message || "").slice(0, 160)); } catch (x) {} });
window.addEventListener("unhandledrejection", e => { if (errCount++ < 5) try { audit("ERROR_APP", "", String((e.reason && e.reason.message) || e.reason || "").slice(0, 160)); } catch (x) {} });

window.bootSupabase = bootSupabase;
