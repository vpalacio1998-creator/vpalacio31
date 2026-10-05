/* ============ 12 · PWA: instalación, actualización controlada ============
   El service worker (sw.js) guarda la interfaz para abrir sin Internet. Una versión nueva NUNCA se aplica en medio de una venta:
   se descarga en segundo plano y se activa cuando no hay pedido ni ventanas abiertas (o cuando la persona lo pide). */
const PWA = {hay: false, worker: null, reloading: false, recargado: false, evento: null, instalada: false};
function registrarSW() {
  if (!window.OLI_PWA || !("serviceWorker" in navigator) || !/^https?:$/.test(location.protocol)) return;
  navigator.serviceWorker.register("sw.js").then(reg => {
    if (reg.waiting && navigator.serviceWorker.controller) { PWA.worker = reg.waiting; PWA.hay = true; changed(); setTimeout(() => aplicarActualizacion(false), 1500); }
    reg.addEventListener("updatefound", () => { const w = reg.installing; if (!w) return; w.addEventListener("statechange", () => { if (w.state === "installed" && navigator.serviceWorker.controller) { PWA.worker = w; PWA.hay = true; changed(); setTimeout(() => aplicarActualizacion(false), 1500); } }); });
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
const puedeInstalar = () => !!window.OLI_PWA && !esInstalada();
const btnInstalar = (cls = "btn ghost") => puedeInstalar() ? `<button class="${cls}" data-act="instalar">${typeof ic === "function" ? ic("descargar", 18) : ""} Instalar OLI en este equipo</button>` : "";
function equipoTipo() {
  const ua = navigator.userAgent || "";
  if (/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return /CriOS|FxiOS|EdgiOS/.test(ua) ? "ios-otro" : "ios";
  if (/SamsungBrowser/.test(ua)) return "samsung";
  if (/Android/.test(ua)) return /Chrome/.test(ua) ? "android" : "android-otro";
  return "pc";
}
const PASOS_INSTALAR = {
  ios: ["Toca el botón <b>Compartir</b> (el cuadrado con una flecha hacia arriba), arriba a la derecha o abajo.", "Baja y toca <b>Agregar a inicio</b>.", "Toca <b>Agregar</b>. Queda el ícono <b>OLI</b> en la pantalla de inicio."],
  "ios-otro": ["En iPad y iPhone OLI solo se instala desde <b>Safari</b>.", "Abre <b>Safari</b> y entra a <b>" + location.host + "</b>.", "Toca <b>Compartir</b> → <b>Agregar a inicio</b> → <b>Agregar</b>."],
  samsung: ["Toca el menú <b>☰</b> (abajo a la derecha).", "Toca <b>Agregar página a</b> → <b>Pantalla de inicio</b>.", "Si prefieres, ábrela en <b>Chrome</b>: menú <b>⋮</b> → <b>Instalar app</b> o <b>Agregar a la pantalla principal</b>."],
  android: ["Toca los tres puntos <b>⋮</b> (arriba a la derecha).", "Toca <b>Instalar app</b> o <b>Agregar a la pantalla principal</b>.", "Si te pregunta, elige <b>Instalar</b> (no \"Crear acceso directo\")."],
  "android-otro": ["Abre <b>Chrome</b> y entra a <b>" + location.host + "</b>.", "Toca los tres puntos <b>⋮</b> → <b>Instalar app</b> o <b>Agregar a la pantalla principal</b>."],
  pc: ["En <b>Chrome</b> o <b>Edge</b>: toca el ícono de instalar en la barra de dirección (a la derecha), o abre el menú y elige <b>Instalar OLI</b>."]
};
ACT.instalar = async () => {
  if (PWA.evento) { PWA.evento.prompt(); await PWA.evento.userChoice.catch(() => {}); PWA.evento = null; changed(); return; }
  const pasos = PASOS_INSTALAR[equipoTipo()] || PASOS_INSTALAR.pc;
  abrir(() => head("Instalar OLI") + `<p class="muted" style="margin-top:0">Así OLI queda como una app: con su ícono, a pantalla completa y funcionando sin Internet.</p><ol style="padding-left:20px;line-height:1.6">${pasos.map(x => "<li>" + x + "</li>").join("")}</ol><button class="btn pri wide xl" data-act="cerrar">Entendido</button>`);
};
ACT.actualizarYa = async () => { if (operacionEnCurso() && !(await confirmar({titulo: "Hay un pedido en curso", texto: "Tu pedido y tus ventas quedan guardados. ¿Actualizar ahora?", si: "Sí, actualizar", no: "Esperar"}))) return; aplicarActualizacion(true); };
const esInstalada = () => (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || window.navigator.standalone === true;
registrarSW();
