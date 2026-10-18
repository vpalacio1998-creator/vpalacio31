/* ============ 67 · notificaciones al administrador (Web Push) ============
   El administrador las activa en cada equipo donde las quiera (Ajustes → Notificaciones). Cuando llega al servidor una venta,
   una anulación, una apertura o cierre de caja, plata que entra o sale de la caja, o un cambio que el servidor no aceptó, el
   servidor arma el aviso y lo manda (migración 20261018000000_oli_push.sql + Edge Function oli-push): llega aunque OLI esté
   cerrada. Lo que pasa en este mismo equipo no se avisa aquí. Los avisos nunca llevan costos ni utilidades.
   En iPhone/iPad solo funcionan con OLI instalada (Agregar a inicio), abierta desde el ícono, con iOS 16.4 o más nuevo.
   Si la sesión del administrador termina (cerrar sesión, vencida o revocada), el equipo deja de recibirlos y se borran los
   avisos que ya estaban a la vista: el equipo puede quedar en manos de un empleado. */
const NOTI = {perm: "default", sub: null, info: null, registrada: false, verificado: false, cargando: false, revisado: false, guardando: Promise.resolve()};
const TIPOS_NOTI = [["venta", "Cada venta"], ["anulacion", "Ventas anuladas"], ["caja", "Abrir y cerrar caja (con faltantes o sobrantes)"], ["dinero", "Plata que entra o sale de la caja"], ["problema", "Cambios que no llegan al servidor"]];
const pushSoportado = () => { try { return !!window.OLI_PWA && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window; } catch (e) { return false; } };
const notisPosibles = () => DS.backend === "supabase" && esAdmin();
const b64uBytes = s => { const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
const mismaClave = (sub, pk) => { try { const a = new Uint8Array(sub.options.applicationServerKey), b = b64uBytes(pk); return a.length === b.length && a.every((x, i) => x === b[i]); } catch (e) { return false; } };
const errNoti = e => (e && (e.message || e.error_description)) || "intenta de nuevo";
async function revisarNotis() {
  if (!pushSoportado() || !notisPosibles() || NOTI.revisando) return;
  NOTI.revisando = true; try { await revisarNotisYa(); } finally { NOTI.revisando = false; }
}
async function revisarNotisYa() {
  NOTI.perm = Notification.permission;
  try { const reg = await navigator.serviceWorker.getRegistration(); NOTI.sub = reg ? await reg.pushManager.getSubscription() : null; } catch (e) { NOTI.sub = null; }
  NOTI.registrada = false; NOTI.verificado = false; NOTI.info = null;
  if (NOTI.sub && SB.client && conRed() && !SB.sinVerificar) {
    try { const r = await withTimeout(Promise.resolve(SB.client.rpc("oli_push_prefs", {p_endpoint: NOTI.sub.endpoint})), 9000); if (!r.error) { NOTI.verificado = true; if (r.data) { NOTI.registrada = true; NOTI.info = r.data; } } } catch (e) {}
  }
  NOTI.revisado = true; changed();
}
window.addEventListener("online", () => { NOTI.revisado = false; changed(); });   // al volver Internet se revisa otra vez
const notiActiva = () => !!(NOTI.sub && NOTI.registrada && NOTI.perm === "granted");
const prefsNoti = () => (NOTI.info && NOTI.info.prefs) || {};
function notisHTML() {
  if (!notisPosibles()) return "";
  if (!NOTI.revisado && pushSoportado()) setTimeout(() => revisarNotis(), 0);
  const ios = /^ios/.test(equipoTipo()), cuerpo = (() => {
    if (!window.OLI_PWA) return '<p class="muted" style="margin:0">Las notificaciones funcionan en la app instalada desde la página de OLI.</p>';
    if (ios && !esInstalada()) return `<p style="margin:0 0 10px">En iPhone o iPad primero instala OLI: toca <b>Compartir</b> → <b>Agregar a inicio</b> y ábrela desde el ícono. Ahí aparece el botón para activarlas.</p>${btnInstalar()}`;
    if (ios && !pushSoportado()) return '<p class="muted" style="margin:0">Este iPhone o iPad necesita iOS 16.4 o más nuevo para recibir notificaciones: actualízalo en <b>Ajustes → General → Actualización de software</b>.</p>';
    if (!pushSoportado()) return '<p class="muted" style="margin:0">Este navegador no puede recibir notificaciones. Prueba con Chrome (Android o computador) o con OLI instalada en iPhone.</p>';
    if (NOTI.perm === "denied") return '<div class="notice bad" style="margin:0">Las notificaciones de OLI están bloqueadas en este equipo. Permítelas en los ajustes del navegador o del teléfono (Notificaciones → OLI) y vuelve aquí.</div>';
    if (!NOTI.revisado) return '<p class="muted" style="margin:0">Revisando…</p>';
    if (NOTI.sub && !NOTI.verificado) return '<p style="margin:0">Este equipo tiene notificaciones, pero ahora no se pudo revisar con el servidor (¿sin Internet?). Se revisa otra vez cuando vuelva la conexión.</p>';
    if (!notiActiva()) return `<p style="margin:0 0 10px">Te avisamos al celular, aunque OLI esté cerrada, cuando en las cajas pase algo: una venta, una anulación, abrir o cerrar caja, plata que sale de la caja.</p>
      <button class="btn pri" data-act="activarNotis" ${NOTI.cargando ? "disabled" : ""}>${ic("campana", 18)} ${NOTI.cargando ? "Activando…" : "ACTIVAR NOTIFICACIONES"}</button>${NOTI.sub && NOTI.verificado && !NOTI.registrada ? '<p class="small muted">Este equipo tenía notificaciones pero el servidor ya no lo tiene en la lista: actívalas otra vez.</p>' : ""}`;
    const inf = NOTI.info || {};
    return `<div class="notice ok" style="margin:0 0 10px">Activadas en este equipo.</div>${inf.fails ? `<div class="notice bad" style="margin:0 0 10px">Los últimos avisos no llegaron a este equipo (${esc(inf.last_error || "error")}). Prueba «Desactivar» y activarlas otra vez.</div>` : ""}<p class="small muted" style="margin:0 0 6px">Avisarme de:</p>
      ${TIPOS_NOTI.map(([k, l]) => `<label class="check"><input type="checkbox" data-act-change="notiPref" data-k="${k}" ${prefsNoti()[k] === false ? "" : "checked"}> ${l}</label>`).join("")}
      <div class="btns" style="margin-top:10px"><button class="btn ghost" data-act="probarNotis">Enviar una de prueba</button><button class="btn ghost" data-act="quitarNotis">Desactivar en este equipo</button></div>
      <p class="xs muted" style="margin-bottom:0">Lo que hagas en este mismo equipo no te llega aquí. Los avisos no llevan costos ni utilidades.</p>`;
  })();
  return `<div class="card"><h3>Notificaciones</h3>${cuerpo}</div>`;
}
ACT.activarNotis = async () => {
  if (!pushSoportado() || !notisPosibles() || NOTI.cargando) return;
  let perm = Notification.permission;
  if (perm === "default") { try { perm = await Notification.requestPermission(); } catch (e) { perm = Notification.permission; } }   // primero el permiso (iPhone exige que salga del toque)
  NOTI.perm = perm;
  if (perm !== "granted") { draw(); toast(perm === "denied" ? "Quedaron bloqueadas: permítelas en los ajustes del teléfono." : "No se activaron.", true); return; }
  if (!conRed() || SB.sinVerificar) { toast("Para activarlas hace falta Internet.", true); draw(); return; }
  NOTI.cargando = true; draw();
  try {
    const reg = await withTimeout(navigator.serviceWorker.ready, 10000);
    const k = await withTimeout(SB.client.functions.invoke("oli-push", {method: "GET"}), 15000);
    const pk = k && k.data && k.data.publicKey; if (!pk) throw new Error("el servidor de avisos no respondió");
    let sub = await reg.pushManager.getSubscription();
    if (sub && !mismaClave(sub, pk)) { await sub.unsubscribe().catch(() => {}); sub = null; }
    if (!sub) sub = await reg.pushManager.subscribe({userVisibleOnly: true, applicationServerKey: b64uBytes(pk)});
    const j = sub.toJSON();
    const r = await withTimeout(Promise.resolve(SB.client.rpc("oli_push_suscribir", {p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth, p_dev: DEV.id, p_prefs: null})), 15000);
    if (r.error) throw r.error;
    NOTI.sub = sub; NOTI.registrada = true; NOTI.verificado = true; NOTI.info = r.data || {};
    audit("NOTIS_ACTIVADAS", DEV.id, DEV.nombre || "");
    toast("Listo: este equipo recibirá los avisos. Toca «Enviar una de prueba» para verlo.");
  } catch (e) { toast("No se pudieron activar: " + errNoti(e), true); }
  NOTI.cargando = false; NOTI.revisado = true; draw();
};
/* las preferencias se mandan en orden y completas (lo que dicen todas las casillas), así dos cambios seguidos no se pisan */
ACT.notiPref = (el) => {
  if (!notiActiva()) return;
  const prefs = {}; document.querySelectorAll('input[data-act-change="notiPref"]').forEach(c => { prefs[c.dataset.k] = !!c.checked; });
  NOTI.guardando = NOTI.guardando.then(async () => {
    try {
      const r = await withTimeout(Promise.resolve(SB.client.rpc("oli_push_prefs", {p_endpoint: NOTI.sub.endpoint, p_prefs: prefs})), 10000);
      if (r.error) throw r.error;
      if (!r.data) { NOTI.registrada = false; toast("El servidor ya no tiene este equipo en la lista: activa las notificaciones otra vez.", true); draw(); return; }
      NOTI.info = r.data; toast("Guardado");
    } catch (e) { toast("No se pudo guardar (" + errNoti(e) + ").", true); revisarNotis(); }
  });
};
document.addEventListener("change", e => { const t = e.target; if (t.dataset && t.dataset.actChange === "notiPref") ACT.notiPref(t, t.dataset); });
ACT.probarNotis = async () => {
  if (!notiActiva()) return;
  try {
    const r = await withTimeout(Promise.resolve(SB.client.rpc("oli_push_prueba", {p_endpoint: NOTI.sub.endpoint})), 10000); if (r.error) throw r.error;
    const listo = r.data && r.data.url !== false && r.data.net !== false;
    toast(listo ? "Enviada: debe llegar en unos segundos. Si no llega, revisa que el teléfono no tenga las notificaciones de OLI silenciadas." : "El envío de avisos todavía no está listo en el servidor: llegará cuando quede configurado.", !listo);
  } catch (e) { toast("No se pudo enviar (" + errNoti(e) + ").", true); }
};
async function quitarNotis(silencio) {
  const sub = NOTI.sub; if (!sub) return;
  try { if (SB.client && conRed()) await withTimeout(Promise.resolve(SB.client.rpc("oli_push_quitar", {p_endpoint: sub.endpoint})), 6000); } catch (e) {}
  try { await sub.unsubscribe(); } catch (e) {}                                                      // sin la suscripción, el servidor la borra cuando el servicio de avisos diga que ya no existe
  NOTI.sub = null; NOTI.registrada = false; NOTI.info = null;
  if (!silencio) { audit("NOTIS_DESACTIVADAS", DEV.id, DEV.nombre || ""); toast("Notificaciones desactivadas en este equipo."); draw(); }
}
ACT.quitarNotis = () => quitarNotis(false);
/* el equipo deja de recibir los avisos del administrador y se quitan los que ya estaban a la vista (también sin Internet) */
async function limpiarNotisEquipo(conServidor) {
  if (!pushSoportado()) return;
  try {
    const reg = await withTimeout(navigator.serviceWorker.getRegistration(), 3000); if (!reg) return;
    try { for (const n of await reg.getNotifications()) n.close(); } catch (e) {}
    const sub = await reg.pushManager.getSubscription();
    if (sub) { NOTI.sub = sub; if (conServidor) await quitarNotis(true); else { try { await sub.unsubscribe(); } catch (e) {} NOTI.sub = null; NOTI.registrada = false; NOTI.info = null; } }
  } catch (e) {}
  NOTI.revisado = false;
}
const quitarNotisAlSalir = () => limpiarNotisEquipo(true);                  // al tocar «Cerrar sesión» (con la sesión todavía válida)
/* tocar un aviso abre OLI en la sección del aviso (el service worker manda la sección) */
if (window.OLI_PWA) try {
  navigator.serviceWorker.addEventListener("message", e => {
    const d = e.data; if (!d || d.tipo !== "ir" || typeof d.url !== "string") return;
    const r = d.url.replace("#", ""); if (RUTAS[r] && rutaOk(r)) irA(r);
  });
} catch (e) {}
