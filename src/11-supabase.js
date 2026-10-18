/* ============ 11 · adaptador Supabase (producción) ============
   Auth: Supabase Auth (correo + contraseña). Datos: oli_docs (RLS) + RPC oli_apply (idempotente).
   Tiempo real: Supabase Realtime (postgres_changes). La anon key es pública por diseño: la seguridad real está en RLS y en oli_apply.
   Nunca hay claves secretas en el frontend. Config en window.OLI_CONFIG (generada en el build desde variables de entorno). */
const APP_VERSION = window.OLI_BUILD || "dev";
const SB = {client: null, org: null, store: null, role: null, email: "", chan: null, rt: "", rtWasDown: false, authError: false, subs: false, sinVerificar: false, gen: 0, autoParado: false, salio: false, salioUid: null, ingresando: null, cargasEnCamino: 0, recargar: false, envioEnCamino: null, revocadas: new Set()};
/* ¿el error es de red (sin Internet, servidor caído o en pausa, WiFi sin salida)? No es lo mismo que una clave mala o una sesión revocada. */
const errRed = e => !!e && ((window.supabase && typeof window.supabase.isAuthRetryableFetchError === "function" && window.supabase.isAuthRetryableFetchError(e)) ||
  e.name === "AuthRetryableFetchError" || e.code === "timeout" || e.status === 0 || /failed to fetch|networkerror|network request failed|load failed/i.test(String(e.message || "")));
const SB_ADMIN_COLS = ADMIN_COLS.concat(["audit"]);
/* error del servidor (no de la clave): 5xx, demasiados intentos, respuesta que no es JSON */
const errServidor = e => !!e && !errRed(e) && ((e.status >= 500) || e.status === 429 || e.name === "AuthUnknownError");
const MSG_SERVIDOR = "El servidor de OLI no está respondiendo bien. Intenta de nuevo en unos minutos.";
const MSG_SIN_RED = "No hay conexión con el servidor de OLI. Revisa el Internet; si hay Internet, el servidor no está respondiendo: avísale al administrador.";
/* ¿queda en este equipo una sesión de Supabase que se pueda renovar? Sin ella no hay cómo reconectarse solo */
function haySesionGuardada() { try { for (let i = 0; i < localStorage.length; i++) if (/^sb-.*-auth-token$/.test(localStorage.key(i) || "")) return true; } catch (e) {} return false; }
/* Sesiones que se cerraron en este equipo. Una renovación que ya venía en camino (la librería reintenta ~30 s y no se puede cancelar)
   NO debe volver a guardarse ni a usarse: se reconoce por el identificador de sesión (session_id del token, igual en cada renovación;
   un ingreso nuevo trae otro). La lista vive en localStorage para que todas las ventanas de OLI la respeten. */
const SES_CERRADAS = "oli-sesiones-cerradas";
function sesionIdDe(s) { try { const b = String(s.access_token).split(".")[1].replace(/-/g, "+").replace(/_/g, "/"); return JSON.parse(atob(b)).session_id || null; } catch (e) { return null; } }
function sesionesCerradas() { try { const v = JSON.parse(localStorage.getItem(SES_CERRADAS) || "[]"); return Array.isArray(v) ? v.filter(x => x && x.sid && Date.now() - x.t < 7 * 864e5) : []; } catch (e) { return []; } }
function marcarCerrada(s) { const sid = s && sesionIdDe(s); if (!sid) return; try { localStorage.setItem(SES_CERRADAS, JSON.stringify(sesionesCerradas().filter(x => x.sid !== sid).concat([{sid, t: Date.now()}]).slice(-20))); } catch (e) {} }
const esCerrada = s => { const sid = s && sesionIdDe(s); return !!sid && sesionesCerradas().some(x => x.sid === sid); };
function sesionGuardada() { try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i) || ""; if (/^sb-.*-auth-token$/.test(k)) return JSON.parse(localStorage.getItem(k)); } } catch (e) {} return null; }
/* almacén de la sesión: igual a localStorage, pero no guarda una sesión que ya se cerró aquí */
const ALMACEN_SESION = {getItem: k => localStorage.getItem(k), removeItem: k => localStorage.removeItem(k),
  setItem: (k, v) => { try { if (/-auth-token$/.test(k) && esCerrada(JSON.parse(v))) return; } catch (e) {} localStorage.setItem(k, v); }};
const lsOk = () => { try { localStorage.setItem("oli-ls", "1"); localStorage.removeItem("oli-ls"); return true; } catch (e) { return false; } };
/* invalida en el servidor una sesión que ya se cerró aquí (solo esa: no saca a la persona de sus otros equipos) */
function revocarSesion(s) { if (!s || !s.access_token || SB.revocadas.has(s.access_token)) return; SB.revocadas.add(s.access_token); try { withTimeout(SB.client.auth.admin.signOut(s.access_token, "local"), 8000).catch(() => {}); } catch (e) {} }
/* la sesión se cerró o el servidor la rechazó: este equipo olvida la identidad y lo que solo ve el administrador (las ventas por enviar se conservan) */
async function olvidarIdentidad() {
  await IDB.tx([["kv", "del", "ident"]]).catch(() => {});
  const soloAdmin = new Set(SB_ADMIN_COLS); for (const c of soloAdmin) { delete DS.c[c]; delete DS.ready[c]; }   // al volver a ingresar se espera a que lleguen de nuevo
  try { const all = await IDB.getAll("docs"), ops = []; for (const [p, x] of Object.entries(all || {})) if (x && soloAdmin.has(x.col)) ops.push(["docs", "del", p]); if (ops.length) await IDB.tx(ops); } catch (e) {}
  DS.isAdmin = false; DS.uid = null; SB.role = null;
}

async function bootSupabase(ident) {
  const cfg = window.OLI_CONFIG;
  if (!window.supabase || !window.supabase.createClient) { DS.mode = "local"; DS.error = "No se pudo cargar la conexión con el servidor."; changed(); return; }
  const habiaSesion = haySesionGuardada();                                                 // antes de crear el cliente: al arrancar, la librería puede borrarla sin avisar por qué
  SB.client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {auth: Object.assign({persistSession: true, autoRefreshToken: true, detectSessionInUrl: false}, lsOk() ? {storage: ALMACEN_SESION} : {}), realtime: {params: {eventsPerSecond: 20}}});
  DS.mode = "db"; DS.backend = "supabase"; REMOTE.kind = "supabase"; REMOTE.desc = "Supabase"; REMOTE.apply = sbApply;
  SB.client.auth.onAuthStateChange(sbCambioSesion);
  let session = null, err = null; try { const r = await withTimeout(SB.client.auth.getSession(), 5000); session = r.data && r.data.session; err = r.error; } catch (e) { err = e; }
  /* La sesión vencida se renueva con el servidor. Si el servidor no responde (sin Internet, caído, en pausa o WiFi sin salida),
     el equipo que ya había ingresado abre con lo guardado y se reconecta solo cuando el servidor vuelva.
     Una sesión cerrada o revocada (error que no es de red) sí pide ingresar de nuevo. */
  const sinServidor = (typeof navigator !== "undefined" && navigator.onLine === false) || errRed(err);
  if (!session && ident && ident.sb && sinServidor && haySesionGuardada()) {
    usarIdent(ident); SB.sinVerificar = true; sbIniciar();
    probarSesion();                                                                                    // por si la sesión se renovó justo después de los 5 segundos
    return;
  }
  if (!session) {
    if (ident && ident.sb) await olvidarIdentidad();                                                    // sin sesión no hay a quién renovar: lo del administrador no se queda en el equipo
    if (err && errServidor(err)) DS.loginMsg = MSG_SERVIDOR;                                            // el servidor falló al renovar: no es culpa de la clave
    else if (err && !errRed(err)) { DS.loginMsg = "Tu sesión venció. Ingresa de nuevo: lo que quedó guardado en este equipo se envía al ingresar."; }
    else if (sinServidor && ident && ident.sb) DS.loginMsg = MSG_SIN_RED;                                // no queda sesión que renovar: para ingresar hace falta el servidor
    else if (habiaSesion) DS.loginMsg = "Tienes que ingresar de nuevo. Lo que quedó guardado en este equipo se envía al ingresar.";   // venció, se cerró en otro lado o el servidor falló al renovarla
    DS.needsLogin = true; changed(); return;
  }
  await sbCompletarSesion(session);
}
/* cuando el servidor vuelve y la sesión se renueva, el equipo que abrió sin verificar se conecta y recarga; si la sesión fue revocada, pide ingresar */
/* una sola comprobación a la vez (cada una puede tardar ~30 s si el servidor no responde) */
function probarSesion() { if (SB.probando || !SB.sinVerificar) return; SB.probando = true; SB.client.auth.getSession().then(r => { const s = r && r.data && r.data.session; if (s) sbCambioSesion("TOKEN_REFRESHED", s); }).catch(() => {}).finally(() => { SB.probando = false; }); }
function sbCambioSesion(ev, session) {
  if (DS.bloqueada) return;                                                                 // ventana en pausa: la activa es otra ventana de OLI
  const conSesion = (ev === "TOKEN_REFRESHED" || ev === "SIGNED_IN") && !!(session && session.user);
  // 0) una sesión que ya se cerró en este equipo (en esta u otra ventana) y que una renovación atrasada trae de vuelta: no se usa y se invalida en el servidor
  if (conSesion && esCerrada(session)) {
    revocarSesion(session);
    try { const g = sesionGuardada(); SB.client.realtime.setAuth(g && !esCerrada(g) ? g.access_token : window.OLI_CONFIG.supabaseAnonKey); } catch (e) {}   // el tiempo real tampoco la usa
    return;
  }
  const uid = conSesion ? session.user.id : null, email = ((conSesion && session.user.email) || "").toLowerCase();
  const reIngreso = SB.ingresando && email && email === SB.ingresando.email;                 // la misma persona está volviendo a ingresar aquí
  // 1) se cerró sesión y aún no ingresa nadie: lo demás no toca este equipo. Si el servidor no da identificador de sesión, se compara la persona.
  if (SB.salio) { if (conSesion && !sesionIdDe(session) && uid === SB.salioUid && !reIngreso) setTimeout(descartarSesion, 0); return; }
  // 2) con alguien adentro, aparece la sesión de OTRA persona sin que nadie haya ingresado en este equipo: por seguridad, pedir ingresar
  if (conSesion && DS.uid && !SB.ingresando && !SB.sinVerificar && uid !== DS.uid) { SB.gen++; setTimeout(() => sesionPerdida("Por seguridad, ingresa de nuevo.", session), 0); return; }
  // 3) la sesión se cerró por fuera (revocada, vencida o se cerró en otra ventana): olvidar y pedir ingresar
  if (ev === "SIGNED_OUT" && !SB.ingresando) { if (DS.needsLogin) return; SB.sinVerificar = false; SB.gen++; setTimeout(() => sesionPerdida("Tu sesión se cerró. Ingresa de nuevo: lo que quedó guardado en este equipo se envía al ingresar."), 0); return; }
  if (!SB.sinVerificar) return;
  if (conSesion) {
    SB.sinVerificar = false; setTimeout(async () => { if (SB.chan) { try { SB.client.removeChannel(SB.chan); } catch (e) {} SB.chan = null; } netFail = false; SYNC.error = ""; await sbCompletarSesion(session); }, 0);   // sbCompletarSesion -> sbIniciar recarga todo una vez y envía lo pendiente
  }
}
/* cierra la sesión guardada en este equipo (solo esta sesión: la persona sigue adentro en sus otros equipos) */
function descartarSesion() { const s = sesionGuardada(); if (s) marcarCerrada(s); withTimeout(SB.client.auth.signOut({scope: "local"}), 6000).catch(() => {}).then(borrarSesionGuardada); }
async function sesionPerdida(msg, ajena) {
  DS.needsLogin = true;
  if (ajena) { marcarCerrada(ajena); revocarSesion(ajena); }
  if (SB.chan) { try { SB.client.removeChannel(SB.chan); } catch (e) {} SB.chan = null; }
  descartarSesion(); await olvidarIdentidad(); DS.needsLogin = true; DS.needsOrg = false; DS.loginMsg = msg; changed();
}
async function sbCompletarSesion(session) {
  const gen = SB.gen;                                                                       // si alguien cierra sesión mientras esto espera, no se vuelve a entrar solo
  let me = null, fallo = false; try { const r = await withTimeout(SB.client.rpc("oli_me"), 9000); me = r.data; fallo = !!r.error; } catch (e) { fallo = true; }
  const ident = await IDB.get("kv", "ident"); if (gen !== SB.gen) return;
  try { const cur = await withTimeout(SB.client.auth.getSession(), 3000), cs = cur && cur.data && cur.data.session; if (cs && cs.user && cs.user.id !== session.user.id) { SB.gen++; await sesionPerdida("Por seguridad, ingresa de nuevo."); return; } } catch (e) {}
  if (!me && fallo && ident && ident.sb && ident.uid === session.user.id) usarIdent(ident);                           // servidor sin respuesta: identidad guardada
  else if (!me && fallo) { DS.needsLogin = true; DS.loginMsg = "Ingresaste, pero el servidor de OLI no está respondiendo. Intenta de nuevo en unos minutos."; changed(); return; }
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
  for (const n of (SB.sinVerificar ? cols : SHARED_COLS)) if (SB.sinVerificar || Object.keys(DS.c[n] || {}).length) DS.ready[n] = true;   // sin servidor no llega nada más: se usa lo guardado
  sbCargarTodo(cols); if (!SB.sinVerificar) sbRealtime();                                  // sin sesión verificada no se pide nada al servidor: se espera a que la sesión se renueve
  const gen = SB.gen; setTimeout(() => { if (gen !== SB.gen) return; for (const n of cols) DS.ready[n] = true; DS.fromCache = false; changed(); }, 6000);   // no marca nada de una sesión que ya se cerró
  recalcEstado(); changed(); kickSync(500);
  if (!SB.subs) { SB.subs = true;
    setInterval(() => { if (pendientes().length) { netFail = false; kickSync(); } }, 20000);
    setInterval(() => heartbeat(), 45000);
    setInterval(() => { if (SB.rtWasDown && conRed()) sbCargarTodo(); }, 20000);                                  // respaldo SOLO si el tiempo real está caído
    window.addEventListener("online", () => { if (SB.sinVerificar) probarSesion(); else sbCargarTodo(); });
  }
}
const sbCols = () => SHARED_COLS.concat(DS.isAdmin ? SB_ADMIN_COLS : []);
async function sbCargar(name, gen) {
  const desde = addDays(S.today, -HIST_DIAS), m = {}; let from = 0;
  for (;;) {
    let q = SB.client.from("oli_docs").select("doc_id,data").eq("org_id", SB.org).eq("collection", name).range(from, from + 999);
    if (RANGED.has(name)) q = q.gte("data->>fecha", desde);
    const real = Promise.resolve(q); SB.cargasEnCamino++; real.catch(() => {}).finally(() => {   // si deja de esperarse, se recuerda que sigue en camino
      if (--SB.cargasEnCamino === 0 && SB.recargar && !SB.cargando) setTimeout(() => sbCargarTodo(), 0); });   // (también si quien la pidió es quien ingresó después)   // y cuando por fin responde, se hace la recarga que quedó pedida
    const r = await withTimeout(real, 15000); if (r.error) throw r.error;
    for (const x of r.data) m[x.doc_id] = x.data; if (r.data.length < 1000) break; from += 1000;
  }
  if (gen !== SB.gen || !puede(name, "read")) return;                                       // se cerró sesión o cambió quién está: lo que llegó tarde no se usa
  aplicarSnapshot(name, m);
}
/* Un solo pase a la vez. Si un pedido no responde, el pase se corta y no empieza otro mientras ese siga en camino:
   con el servidor caído cada pedido espera en fila a que la sesión se renueve, y se acumularían cientos. */
async function sbCargarTodo(cols) {
  if (SB.sinVerificar || DS.needsLogin || !DS.uid) return;                                  // sin nadie adentro no se pide nada (sin sesión el servidor respondería vacío)
  if (SB.cargando || SB.cargasEnCamino > 0) { SB.recargar = true; return; }
  SB.cargando = true; SB.recargar = false; const gen = SB.gen, lista = (cols || sbCols()).slice().sort((x, y) => (y === "meta") - (x === "meta")); let cortado = false;   // "meta" primero: trae lo que el administrador borró antes de revisar ventas y cajas
  try {
    for (const n of lista) {
      if (cortado) { DS.ready[n] = true; continue; }
      try { await sbCargar(n, gen); } catch (e) { DS.ready[n] = true; if (e && /JWT|401|auth/i.test(e.message || "")) SB.authError = true; if (errRed(e)) cortado = true; }
    }
  } finally { SB.cargando = false; }
  if (!SB.rtWasDown) SB.authError = false; recalcEstado(); changed();
  if (!cortado && SB.recargar) { SB.recargar = false; setTimeout(() => sbCargarTodo(), 0); }   // alguien pidió recargar mientras tanto
}
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
  if (SB.envioEnCamino) throw {code: "unavailable", message: "el envío anterior sigue esperando al servidor"};   // uno solo en camino (se reenvía igual: oli_apply es idempotente)
  const real = Promise.resolve(SB.client.rpc("oli_apply", {p_ops: payload, p_device_id: DEV.id, p_app_version: APP_VERSION})); SB.envioEnCamino = real;
  real.catch(() => {}).finally(() => { if (SB.envioEnCamino === real) SB.envioEnCamino = null; });
  let r; try { r = await real; } catch (e) { throw {code: "unavailable", message: String(e && e.message || e)}; }
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
  SB.ingresando = {email: email.trim().toLowerCase()};
  try { await sbLoginInterno(email, pass); } finally { SB.ingresando = null; }
}
async function sbLoginInterno(email, pass) {
  let r; try { r = await withTimeout(SB.client.auth.signInWithPassword({email: email.trim(), password: pass}), 20000); } catch (e) { r = {error: e, data: {}}; }
  if (r.error && errRed(r.error)) throw new Error(MSG_SIN_RED);
  const credMala = e => e && e.status === 400 && /invalid_credentials|invalid_grant|invalid login|email not confirmed/i.test((e.code || "") + " " + (e.message || ""));
  if (r.error && !credMala(r.error)) throw new Error(MSG_SERVIDOR);                                  // solo se culpa a la clave cuando el servidor dice que la clave está mal
  if (r.error || !r.data.session) { const e = new Error("No pudimos ingresar. Revisa tu correo y contraseña."); throw e; }
  SB.salio = false; SB.salioUid = null;
  if (SB.autoParado) { SB.autoParado = false; try { SB.client.auth.startAutoRefresh(); } catch (e) {} }
  await sbCompletarSesion(r.data.session);
}
async function sbCrearNegocio(nombre) { const r = await SB.client.rpc("oli_bootstrap", {p_org_name: nombre, p_store_name: "OLI 001"}); if (r.error) throw new Error("No se pudo crear el negocio. " + (r.error.message || "")); const s = await SB.client.auth.getSession(); await sbCompletarSesion(s.data.session); }
async function sbSalir() {
  await quitarNotisAlSalir();                                                                        // este equipo deja de recibir los avisos del administrador
  const sinServidor = SB.sinVerificar || !conRed(); SB.gen++; SB.sinVerificar = false; SB.salio = true; SB.salioUid = DS.uid;
  const ses = sesionGuardada(); if (ses) marcarCerrada(ses);                                         // una renovación atrasada de esta sesión ya no se guarda ni se usa
  if (!sinServidor) { try { await withTimeout(SB.client.auth.signOut({scope: "local"}), 6000); } catch (e) {} }   // con servidor: también se invalida allá (solo en este equipo)
  else if (ses) revocarSesion(ses);                                                                  // sin servidor: se intenta igual; si no llega, se invalida cuando la renovación atrasada aparezca
  try { SB.autoParado = true; await withTimeout(SB.client.auth.stopAutoRefresh(), 2000); } catch (e) {}  // nada debe renovar esta sesión por su cuenta
  borrarSesionGuardada();                                                                           // sin servidor, signOut no la borra: se borra aquí
  if (SB.chan) { try { SB.client.removeChannel(SB.chan); } catch (e) {} SB.chan = null; }
  await olvidarIdentidad();
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
