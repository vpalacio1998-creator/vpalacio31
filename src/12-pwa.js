/* ============ 12 · PWA: instalación, actualización controlada ============
   El service worker (sw.js) guarda la interfaz para abrir sin Internet. Una versión nueva NUNCA se aplica en medio de una venta:
   se descarga en segundo plano y se activa cuando no hay pedido ni ventanas abiertas (o cuando la persona lo pide). */
const PWA = {hay: false, worker: null, reloading: false, recargado: false, evento: null, instalada: false};
function registrarSW() {
  if (!window.OLI_PWA || !("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.register("sw.js").then(reg => {
    if (reg.waiting && navigator.serviceWorker.controller) { PWA.worker = reg.waiting; PWA.hay = true; changed(); }
    reg.addEventListener("updatefound", () => { const w = reg.installing; if (!w) return; w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) { PWA.worker = w; PWA.hay = true; changed(); } }); });
    setInterval(() => reg.update().catch(() => {}), 30 * 60 * 1000);
  }).catch(() => {});
  // Solo se recarga cuando OLI pidió aplicar una versión nueva. La primera instalación (clients.claim) no recarga: cortaría un ingreso en curso.
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (!PWA.reloading || PWA.recargado) return; PWA.recargado = true; location.reload(); });
}
const operacionEnCurso = () => S.cart.length > 0 || !!sheetFn || (typeof cobrando !== "undefined" && cobrando) || ((DS.needsLogin || DS.needsOrg) && document.activeElement && /INPUT/.test(document.activeElement.tagName));
function aplicarActualizacion(forzar) { if (!PWA.worker) return false; if (!forzar && operacionEnCurso()) return false; PWA.reloading = true; PWA.worker.postMessage("SKIP_WAITING"); return true; }
setInterval(() => { if (PWA.hay) aplicarActualizacion(false); }, 20000);
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); PWA.evento = e; changed(); });
window.addEventListener("appinstalled", () => { PWA.instalada = true; PWA.evento = null; toast("OLI quedó instalada en este equipo"); changed(); });
ACT.instalar = async () => { if (!PWA.evento) { abrir(() => head("Instalar OLI") + `<p>En <b>Chrome o Edge</b>: abre el menú del navegador y elige <b>Instalar OLI</b>.<br>En <b>iPad / iPhone</b> (Safari): toca <b>Compartir</b> y luego <b>Agregar a pantalla de inicio</b>.</p><button class="btn pri wide xl" data-act="cerrar">Entendido</button>`); return; } PWA.evento.prompt(); await PWA.evento.userChoice.catch(() => {}); PWA.evento = null; changed(); };
ACT.actualizarYa = async () => { if (operacionEnCurso() && !(await confirmar({titulo: "Hay un pedido en curso", texto: "Tu pedido y tus ventas quedan guardados. ¿Actualizar ahora?", si: "Sí, actualizar", no: "Esperar"}))) return; aplicarActualizacion(true); };
const esInstalada = () => (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
registrarSW();
