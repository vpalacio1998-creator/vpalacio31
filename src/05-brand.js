/* ============ 05 · marca, propiedad y versión ============
   OLI es la marca del producto. VP Visual Project es el propietario/desarrollador; Víctor Palacio es el creador.
   La marca VP nunca compite con OLI: aparece solo en pie de página, "Acerca de", inicio de sesión, informes y metadatos. */
const BRAND = {
  producto: "OLI", tagline: "Sistema inteligente de gestión y punto de venta", frase: "Sistema inteligente para la operación de tu negocio",
  empresa: "VP Visual Project", creador: "Víctor Palacio", anio: 2026, version: "1.0.0",
  texto: "Software propiedad de VP Visual Project · Creado por Víctor Palacio",
  copyright: "© 2026 VP Visual Project. Todos los derechos reservados.",
  soporte: {sitio: "", correo: "", canal: "", terminos: "", privacidad: ""}                  // se llenan cuando existan
};
const APP_BUILD = (typeof window !== "undefined" && window.OLI_BUILD) || "dev";
const versionTxt = () => "OLI v" + BRAND.version + (APP_BUILD !== "dev" ? " (" + APP_BUILD + ")" : "");
const footerHTML = () => `<footer class="foot"><b>OLI</b><span>${esc(BRAND.texto)}</span></footer>`;
function diagnostico() {
  return ["Producto: OLI", "Versión: " + BRAND.version + " · build " + APP_BUILD, "Desarrollador: " + BRAND.empresa, "Creador: " + BRAND.creador, "Servidor: " + (REMOTE.desc || (DS.mode === "local" ? "solo este equipo" : "—")),
    "Conexión: " + (SYNC ? SYNC.estado : "—"), "Equipo: " + (DEV.nombre || DEV.id), "Almacenamiento: " + (IDB.ok ? "IndexedDB" : "respaldo"), "Rol: " + (esAdmin() ? "administrador" : "empleado"), "Navegador: " + (navigator.userAgent || "").slice(0, 90), "Fecha: " + new Date().toISOString()].join("\n");
}
ACT.acerca = () => abrir(() => {
  const s = BRAND.soporte, item = (t, v) => `<div class="row"><span>${t}</span><b>${v ? esc(v) : '<span class="muted" style="font-weight:500">Próximamente</span>'}</b></div>`;
  return head("Acerca de OLI") + `<div style="text-align:center;padding:6px 0 14px"><div class="logo" style="font-size:54px">OLI</div><div class="muted">${esc(BRAND.tagline)}</div></div>
    <div class="card flat"><div class="row" style="padding-top:0"><span>Desarrollado y propiedad de</span><b>${esc(BRAND.empresa)}</b></div><div class="row"><span>Creado por</span><b>${esc(BRAND.creador)}</b></div><div class="row"><span>Versión</span><b>${esc(BRAND.version)}</b></div><div class="row"><span>Año</span><b>${BRAND.anio}</b></div></div>
    <p class="small muted" style="text-align:center;margin:0 0 12px">${esc(BRAND.copyright)}</p>
    <div class="card flat"><h3>Soporte</h3>${item("Sitio web", s.sitio)}${item("Correo", s.correo)}${item("Canal de soporte", s.canal)}${item("Términos de uso", s.terminos)}${item("Política de privacidad", s.privacidad)}</div>
    <details class="card flat"><summary style="font-weight:700;cursor:pointer;min-height:40px;display:flex;align-items:center">Información del sistema</summary><pre style="white-space:pre-wrap;font-size:12px;margin:8px 0">${esc(diagnostico())}</pre><button class="btn ghost sm" data-act="copiarDiag">${ic("copiar", 16)} Copiar</button></details>
    <button class="btn pri wide xl" data-act="cerrar">Cerrar</button>`;
});
ACT.copiarDiag = async () => { try { await navigator.clipboard.writeText(diagnostico()); toast("Copiado"); } catch (e) { toast("No se pudo copiar", true); } };
