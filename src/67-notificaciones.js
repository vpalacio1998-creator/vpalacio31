/* ============ 67 · notificaciones al administrador (Web Push) ============
   El administrador las activa en cada equipo donde las quiera (Ajustes → Notificaciones). Cuando llega al servidor una venta,
   una anulación, una apertura o cierre de caja, plata que entra o sale de la caja, o un cambio que el servidor no aceptó, el
   servidor arma el aviso y lo manda (migración 20261018000000_oli_push.sql + Edge Function oli-push): llega aunque OLI esté
   cerrada. Lo que pasa en este mismo equipo no se avisa aquí. Los avisos nunca llevan costos ni utilidades.
   En iPhone/iPad solo funcionan con OLI instalada (Agregar a inicio) y abierta desde el ícono. */
const NOTI = {perm: "default", sub: null, prefs: null, registrada: false, cargando: false, revisado: false};
const TIPOS_NOTI = [["venta", "Cada venta"], ["anulacion", "Ventas anuladas"], ["caja", "Abrir y cerrar caja (con faltantes o sobrantes)"], ["dinero", "Plata que entra o sale de la caja"], ["problema", "Cambios que no llegan al servidor"]];
const pushSoportado = () => !!window.OLI_PWA && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const notisPosibles = () => DS.backend === "supabase" && esAdmin();
const b64uBytes = s => { const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
const mismaClave = (sub, pk) => { try { const a = new Uint8Array(sub.options.applicationServerKey), b = b64uBytes(pk); return a.length === b.length && a.every((x, i) => x === b[i]); } catch (e) { return false; } };
async function revisarNotis() {
  if (!pushSoportado() || !notisPosibles()) return;
  NOTI.perm = Notification.permission;
  try { const reg = await navigator.serviceWorker.getRegistration(); NOTI.sub = reg ? await reg.pushManager.getSubscription() : null; } catch (e) { NOTI.sub = null; }
  NOTI.registrada = false; NOTI.prefs = null;
  if (NOTI.sub && SB.client && conRed()) { try { const r = await withTimeout(Promise.resolve(SB.client.rpc("oli_push_prefs", {p_endpoint: NOTI.sub.endpoint})), 9000); if (!r.error && r.data) { NOTI.registrada = true; NOTI.prefs = r.data.prefs || {}; } } catch (e) {} }
  NOTI.revisado = true; changed();
}
const notiActiva = () => !!(NOTI.sub && NOTI.registrada && NOTI.perm === "granted");
function notisHTML() {
  if (!notisPosibles()) return "";
  if (!NOTI.revisado && pushSoportado()) setTimeout(() => revisarNotis(), 0);
  const ios = /^ios/.test(equipoTipo()), cuerpo = (() => {
    if (!window.OLI_PWA) return '<p class="muted" style="margin:0">Las notificaciones funcionan en la app instalada desde la página de OLI.</p>';
    if (ios && !esInstalada()) return `<p style="margin:0 0 10px">En iPhone o iPad primero instala OLI: toca <b>Compartir</b> → <b>Agregar a inicio</b> y ábrela desde el ícono. Ahí aparece el botón para activarlas.</p>${btnInstalar()}`;
    if (!pushSoportado()) return '<p class="muted" style="margin:0">Este navegador no puede recibir notificaciones. Prueba con Chrome (Android o computador) o con OLI instalada en iPhone.</p>';
    if (NOTI.perm === "denied") return '<div class="notice bad" style="margin:0">Las notificaciones de OLI están bloqueadas en este equipo. Permítelas en los ajustes del navegador o del teléfono (Notificaciones → OLI) y vuelve aquí.</div>';
    if (!notiActiva()) return `<p style="margin:0 0 10px">Te avisamos al celular, aunque OLI esté cerrada, cuando en las cajas pase algo: una venta, una anulación, abrir o cerrar caja, plata que sale de la caja.</p>
      <button class="btn pri" data-act="activarNotis" ${NOTI.cargando ? "disabled" : ""}>${ic("campana", 18)} ${NOTI.cargando ? "Activando…" : "ACTIVAR NOTIFICACIONES"}</button>${NOTI.sub && !NOTI.registrada && conRed() ? '<p class="small muted">Este equipo tenía notificaciones pero el servidor ya no lo tiene en la lista: actívalas otra vez.</p>' : ""}`;
    return `<div class="notice ok" style="margin:0 0 10px">Activadas en este equipo.</div><p class="small muted" style="margin:0 0 6px">Avisarme de:</p>
      ${TIPOS_NOTI.map(([k, l]) => `<label class="check"><input type="checkbox" data-act-change="notiPref" data-k="${k}" ${(NOTI.prefs || {})[k] === false ? "" : "checked"}> ${l}</label>`).join("")}
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
    NOTI.sub = sub; NOTI.registrada = true; NOTI.prefs = (r.data && r.data.prefs) || {};
    audit("NOTIS_ACTIVADAS", DEV.id, DEV.nombre || "");
    toast("Listo: este equipo recibirá los avisos. Toca «Enviar una de prueba» para verlo.");
  } catch (e) { toast("No se pudieron activar: " + ((e && e.message) || "intenta de nuevo"), true); }
  NOTI.cargando = false; NOTI.revisado = true; draw();
};
ACT.notiPref = async (el, d) => {
  if (!notiActiva()) return;
  const prefs = Object.assign({}, NOTI.prefs, {[d.k]: !!el.checked});
  try { const r = await withTimeout(Promise.resolve(SB.client.rpc("oli_push_prefs", {p_endpoint: NOTI.sub.endpoint, p_prefs: prefs})), 10000); if (r.error) throw r.error; NOTI.prefs = (r.data && r.data.prefs) || prefs; toast("Guardado"); }
  catch (e) { el.checked = !el.checked; toast("No se pudo guardar: revisa la conexión.", true); }
};
document.addEventListener("change", e => { const t = e.target; if (t.dataset && t.dataset.actChange === "notiPref") ACT.notiPref(t, t.dataset); });
ACT.probarNotis = async () => {
  if (!notiActiva()) return;
  try { const r = await withTimeout(Promise.resolve(SB.client.rpc("oli_push_prueba", {p_endpoint: NOTI.sub.endpoint})), 10000); if (r.error) throw r.error;
    toast(r.data && r.data.url === false ? "El envío de avisos todavía no está configurado en el servidor." : "Enviada: debe llegar en unos segundos.", r.data && r.data.url === false); }
  catch (e) { toast("No se pudo enviar: revisa la conexión.", true); }
};
async function quitarNotis(silencio) {
  const sub = NOTI.sub; if (!sub) return;
  try { if (SB.client && conRed()) await withTimeout(Promise.resolve(SB.client.rpc("oli_push_quitar", {p_endpoint: sub.endpoint})), 6000); } catch (e) {}
  try { await sub.unsubscribe(); } catch (e) {}                                                      // sin la suscripción, el servidor la borra cuando el servicio de avisos diga que ya no existe
  NOTI.sub = null; NOTI.registrada = false; NOTI.prefs = null;
  if (!silencio) { audit("NOTIS_DESACTIVADAS", DEV.id, DEV.nombre || ""); toast("Notificaciones desactivadas en este equipo."); draw(); }
}
ACT.quitarNotis = () => quitarNotis(false);
/* al cerrar sesión: este equipo deja de recibir los avisos del administrador (puede quedar en manos de un empleado) */
async function quitarNotisAlSalir() {
  if (!pushSoportado()) return;
  try { const reg = await withTimeout(navigator.serviceWorker.getRegistration(), 3000); const sub = reg && await reg.pushManager.getSubscription(); if (sub) { NOTI.sub = sub; await quitarNotis(true); } } catch (e) {}
}
/* tocar un aviso abre OLI en la sección del aviso (el service worker manda la sección) */
if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", e => {
  const d = e.data; if (!d || d.tipo !== "ir" || typeof d.url !== "string") return;
  const r = d.url.replace("#", ""); if (RUTAS[r] && rutaOk(r)) irA(r);
});
