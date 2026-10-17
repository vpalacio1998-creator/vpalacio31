/* ============ 66 · a las 5:30 p. m.: prender la luz de afuera ============
   Con la caja abierta, desde las 5:30 p. m. sale una ventana con sonido y un aviso fijo arriba hasta que alguien toque
   "Ya la prendí" (si la cierran sin marcar, la ventana vuelve a salir cada 10 minutos). Queda en la lista "En la tarde" de la
   caja; si se marca en un equipo, la alerta se quita en los demás. La hora es la del equipo. */
const HORA_LUZ = {h: 17, m: 30};
const LUZ = {ultimaVentana: 0, pendiente: false};
const luzHecha = () => Object.values(col("checklists")).some(c => c && c.fecha === S.today && c.tarde && c.tarde.luzAfuera);
const yaEsHoraDeLuz = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes() >= HORA_LUZ.h * 60 + HORA_LUZ.m; };
function luzPendiente() {
  if (DS.mode === "loading" || DS.needsLogin || DS.needsOrg) return false;
  const c = cajaHoy(); return !!c && cajaEstado(c) === "abierta" && yaEsHoraDeLuz() && !luzHecha();
}
const avisoLuzHTML = () => luzPendiente() ? `<div class="notice luz" role="alert">${ic("luz", 26)}<span><b>Prende la luz de afuera.</b> Ya son las 5:30 p. m.</span><button class="btn pri sm" data-act="luzPrendida">${ic("ok", 16)} YA LA PRENDÍ</button></div>` : "";
const ventanaLuz = () => `<div class="luz-v">${ic("luz", 64)}<h2>Son las 5:30 p. m.</h2><p><b>Prende la luz de afuera.</b><br>Es muy importante.</p>
  <button class="btn pri xl wide" data-act="luzPrendida">${ic("ok", 22)} YA LA PRENDÍ</button><button class="btn ghost wide" style="margin-top:10px" data-act="cerrar">Ahora no (te recuerdo en 10 minutos)</button></div>`;
async function marcarLuzAfuera() {
  const id = cajaId(S.today), cur = col("checklists")[id] || {fecha: S.today, dev: DEV.id, apertura: {}, cierre: {}};
  if ((cur.tarde || {}).luzAfuera) return;
  await put("checklists", id, Object.assign({}, cur, {tarde: Object.assign({}, cur.tarde, {luzAfuera: Date.now()})})); audit("LUZ_AFUERA", id, "");
}
function sonarAviso() {
  try { const A = new (window.AudioContext || window.webkitAudioContext)(), o = A.createOscillator(), g = A.createGain(); g.gain.value = 0.2; o.connect(g); g.connect(A.destination);
    o.frequency.value = 880; o.start(); setTimeout(() => { o.frequency.value = 660; }, 300); setTimeout(() => { o.frequency.value = 880; }, 600); setTimeout(() => { o.stop(); A.close(); }, 900); } catch (e) {}
  try { if (navigator.vibrate) navigator.vibrate([300, 150, 300]); } catch (e) {}
}
function revisarLuz() {
  const p = luzPendiente();
  if (p !== LUZ.pendiente) { LUZ.pendiente = p; banners(); if (!p && sheetFn === ventanaLuz) cerrar(); }
  if (p && Date.now() - LUZ.ultimaVentana > 10 * 60000 && !operacionEnCurso()) { LUZ.ultimaVentana = Date.now(); abrir(ventanaLuz); sonarAviso(); }   // nunca en medio de una venta
}
setInterval(() => { try { revisarLuz(); } catch (e) {} }, 15000);
ACT.luzPrendida = async () => { await guardar(() => marcarLuzAfuera(), "¡Listo! Luz de afuera prendida"); if (sheetFn === ventanaLuz) cerrar(); LUZ.pendiente = luzPendiente(); draw(); };
