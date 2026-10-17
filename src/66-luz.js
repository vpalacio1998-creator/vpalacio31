/* ============ 66 · a las 5:30 p. m.: prender la luz de afuera ============
   Con la caja abierta, desde las 5:30 p. m. sale una ventana con sonido y un aviso fijo arriba hasta que alguien toque
   "Ya la prendí" (si la cierran sin marcar, la ventana vuelve 10 minutos después de cerrarla). Queda en la lista "En la tarde"
   de la caja, que solo se puede marcar desde las 5:30; si se marca en un equipo, la alerta se quita en los demás.
   La hora es la del equipo. Una ventana de OLI en pausa (otra ventana tiene el control) no avisa. */
const HORA_LUZ = {h: 17, m: 30};
const LUZ = {ultimaVentana: 0, pendiente: false, ac: null};
const desdeLuz = f => parse(f).getTime() + (HORA_LUZ.h * 60 + HORA_LUZ.m) * 60000;           // 5:30 p. m. de ese día
const luzHecha = () => Object.values(col("checklists")).some(c => c && c.fecha === S.today && c.tarde && Number(c.tarde.luzAfuera) >= desdeLuz(c.fecha));
const yaEsHoraDeLuz = () => Date.now() >= desdeLuz(S.today);
function luzPendiente() {
  if (DS.bloqueada || DS.mode === "loading" || DS.needsLogin || DS.needsOrg) return false;
  const c = cajaHoy(); return !!c && cajaEstado(c) === "abierta" && yaEsHoraDeLuz() && !luzHecha();
}
const avisoLuzHTML = () => luzPendiente() ? `<div class="notice luz" role="alert">${ic("luz", 26)}<span><b>Prende la luz de afuera.</b> Ya pasaron las 5:30 p. m.</span><button class="btn pri sm" data-act="luzPrendida">${ic("ok", 16)} YA LA PRENDÍ</button></div>` : "";
const ventanaLuz = () => `<div class="luz-v">${ic("luz", 64)}<h2>Hora de prender la luz de afuera</h2><p><b>Ya pasaron las 5:30 p. m.</b><br>Prende la luz de afuera: es muy importante.</p>
  <button class="btn pri xl wide" data-act="luzPrendida">${ic("ok", 22)} YA LA PRENDÍ</button><button class="btn ghost wide" style="margin-top:10px" data-act="cerrar">Ahora no (te recuerdo en 10 minutos)</button></div>`;
async function marcarLuzAfuera() {
  const id = cajaId(S.today), cur = col("checklists")[id] || {fecha: S.today, dev: DEV.id, apertura: {}, cierre: {}};
  if (Number((cur.tarde || {}).luzAfuera) >= desdeLuz(S.today)) return;
  await put("checklists", id, Object.assign({}, cur, {tarde: Object.assign({}, cur.tarde, {luzAfuera: Date.now()})})); audit("LUZ_AFUERA", id, "");
}
/* el navegador (sobre todo en iPad) solo deja sonar si antes hubo un toque: el sonido se prepara con cualquier toque en la pantalla */
function audioLuz() { try { LUZ.ac = LUZ.ac || new (window.AudioContext || window.webkitAudioContext)(); if (LUZ.ac.state !== "running") LUZ.ac.resume().catch(() => {}); } catch (e) {} return LUZ.ac; }
["click", "touchend"].forEach(ev => document.addEventListener(ev, () => { if (!LUZ.ac || LUZ.ac.state !== "running") audioLuz(); }, {capture: true, passive: true}));
function sonarAviso() {
  try { const A = audioLuz(); if (A) { const o = A.createOscillator(), g = A.createGain(), t = A.currentTime; g.gain.value = 0.2; o.connect(g); g.connect(A.destination);
    o.frequency.setValueAtTime(880, t); o.frequency.setValueAtTime(660, t + 0.3); o.frequency.setValueAtTime(880, t + 0.6); o.start(t); o.stop(t + 0.9); } } catch (e) {}
  try { if (navigator.vibrate) navigator.vibrate([300, 150, 300]); } catch (e) {}
}
function revisarLuz() {
  if (DS.bloqueada) return;                                                   // la ventana en pausa no avisa (la otra sí)
  if (sheetFn === ventanaLuz) LUZ.ultimaVentana = Date.now();                // los 10 minutos cuentan desde que se cierra la ventana
  const p = luzPendiente();
  if (p !== LUZ.pendiente) { LUZ.pendiente = p; if (!p && sheetFn === ventanaLuz) cerrar(); changed(); }   // redibuja: aviso de arriba y casilla de "En la tarde"
  if (p && Date.now() - LUZ.ultimaVentana > 10 * 60000 && !operacionEnCurso()) { LUZ.ultimaVentana = Date.now(); abrir(ventanaLuz); sonarAviso(); }   // nunca en medio de una venta
}
setInterval(() => { try { revisarLuz(); } catch (e) {} }, 15000);
ACT.luzPrendida = async () => { await guardar(() => marcarLuzAfuera(), "¡Listo! Luz de afuera prendida"); if (sheetFn === ventanaLuz) cerrar(); LUZ.pendiente = luzPendiente(); draw(); };
