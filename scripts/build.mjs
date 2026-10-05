// Arma OLI: artefacto de una sola página (dist-artifact.html) y la PWA para Vercel (dist/).
// Uso: node scripts/build.mjs        Variables de entorno (opcionales; nunca secretos):
//   OLI_SUPABASE_URL, OLI_SUPABASE_ANON_KEY, OLI_ENV (dev|staging|production), OLI_APP_URL
import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto"; import { createRequire } from "node:module";
const R = process.cwd(), S = path.join(R, "src"), D = path.join(R, "dist"), rd = f => fs.readFileSync(path.join(S, f), "utf8"), req = createRequire(import.meta.url);
const css = rd("style.css");
const icon = (n, p) => `<svg class="ic" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const body = rd("body.html").replace("__ICON_BUSCAR__", icon("b", '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/>')).replace("__ICON_CAMPANA__", icon("c", '<path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15L6 17z"/><path d="M10 21a2 2 0 0 0 4 0"/>'));
const jsFiles = fs.readdirSync(S).filter(f => /^\d\d-.*\.js$/.test(f)).sort();
const js = jsFiles.map(f => `/* >>> ${f} */\n${rd(f)}`).join("\n");
const build = process.env.OLI_BUILD || (process.env.VERCEL_GIT_COMMIT_SHA || crypto.createHash("sha1").update(css + js).digest("hex")).slice(0, 8);
const wrap = j => `(function(){\n"use strict";\n${j}\n})();`;
try { new Function(wrap(js)); } catch (e) { console.error("OLI: ERROR DE SINTAXIS en src/*.js → " + e.message); process.exit(1); }   // nunca publicar código roto
const META = `<meta name="author" content="Víctor Palacio"><meta name="copyright" content="VP Visual Project"><meta name="description" content="OLI · Sistema inteligente de gestión y punto de venta. Software propiedad de VP Visual Project · Creado por Víctor Palacio"><meta name="generator" content="OLI">`;
const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Figtree:wght@400;500;600;700&display=swap" rel="stylesheet">`;
const BANNER = `<!-- OLI · Software propiedad de VP Visual Project · Creado por Víctor Palacio · © 2026 VP Visual Project. Todos los derechos reservados. -->\n`;

// 1) Artefacto de Claude: el contenedor agrega doctype/head/body
fs.writeFileSync(path.join(R, "dist-artifact.html"), BANNER + `<title>OLI</title>\n${META}\n${FONTS}\n<style>\n${css}\n</style>\n${body}\n<script>window.OLI_BUILD=${JSON.stringify(build)};</script>\n<script>\n${wrap(js)}\n</script>\n`);

// 1b) Capacidades del artefacto: las reglas del servidor salen del mismo RULES que usa el cliente (una sola fuente)
const rulesSrc = /const RULES = (\[[\s\S]*?\n\]);/.exec(rd("10-data.js"))[1].replace(/\/\/[^\n]*/g, "");
fs.writeFileSync(path.join(R, "dist-artifact-capabilities.json"), JSON.stringify({ db: { rules: new Function("return " + rulesSrc)() }, user: { scopes: ["profile"] }, downloads: true }, null, 2));

// 2) PWA para Vercel
fs.rmSync(D, { recursive: true, force: true }); fs.mkdirSync(path.join(D, "vendor"), { recursive: true });
const h = s => crypto.createHash("sha1").update(s).digest("hex").slice(0, 8), appJs = `app.${h(js)}.js`, appCss = `styles.${h(css)}.css`;
fs.writeFileSync(path.join(D, appJs), `window.OLI_BUILD=${JSON.stringify(build)};window.OLI_PWA=true;\n` + wrap(js)); fs.writeFileSync(path.join(D, appCss), css);
const cfg = { env: process.env.OLI_ENV || "dev", appUrl: process.env.OLI_APP_URL || "", supabaseUrl: process.env.OLI_SUPABASE_URL || "", supabaseAnonKey: process.env.OLI_SUPABASE_ANON_KEY || "" };
const useSb = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
fs.writeFileSync(path.join(D, "config.js"), useSb ? `window.OLI_CONFIG=${JSON.stringify(cfg)};\n` : `window.OLI_CONFIG=null; /* sin servidor configurado: OLI trabaja solo en este equipo */\n`);
const vend = (pkg, rel, out) => { try { const f = path.join(R, "node_modules", pkg, rel); fs.copyFileSync(f, path.join(D, "vendor", out)); return "vendor/" + out; } catch (e) { return null; } };
const sbLib = useSb ? vend("@supabase/supabase-js", "dist/umd/supabase.js", "supabase.js") : null;
const libs = [vend("exceljs", "dist/exceljs.min.js", "exceljs.min.js"), vend("jszip", "dist/jszip.min.js", "jszip.min.js"), vend("jspdf", "dist/jspdf.umd.min.js", "jspdf.umd.min.js"), vend("jspdf-autotable", "dist/jspdf.plugin.autotable.min.js", "jspdf.plugin.autotable.min.js")].filter(Boolean);
for (const f of fs.readdirSync(path.join(R, "public"))) fs.copyFileSync(path.join(R, "public", f), path.join(D, f));
const html = `<!doctype html>\n${BANNER}<html lang="es">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<title>OLI</title>\n${META}\n<meta name="theme-color" content="#2F7B5A">\n<link rel="manifest" href="manifest.webmanifest">\n<link rel="icon" href="icon.svg" type="image/svg+xml">\n<link rel="apple-touch-icon" href="icon-192.png">\n<meta name="apple-mobile-web-app-capable" content="yes">\n${FONTS}\n<link rel="stylesheet" href="${appCss}">\n</head>\n<body>\n${body}\n<script src="config.js"></script>\n${sbLib ? `<script src="${sbLib}"></script>\n` : ""}<script src="${appJs}"></script>\n</body>\n</html>\n`;
fs.writeFileSync(path.join(D, "index.html"), html);
const shell = ["index.html", appJs, appCss, "config.js", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "icon-maskable-512.png"].concat(sbLib ? [sbLib] : []).filter(f => fs.existsSync(path.join(D, f)) || f === "index.html");
fs.writeFileSync(path.join(D, "sw.js"), rd("sw.js").replaceAll("__BUILD__", build).replace("__SHELL__", JSON.stringify(shell)));
fs.writeFileSync(path.join(D, "version.json"), JSON.stringify({ producto: "OLI", version: "1.0.0", build, empresa: "VP Visual Project", creador: "Víctor Palacio", env: cfg.env }, null, 2));
console.log(`OLI build ${build} · backend: ${useSb ? "Supabase" : "ninguno (modo local/artefacto)"} · dist/ listo · artefacto ${Math.round(fs.statSync(path.join(R, "dist-artifact.html")).size / 1024)} KB · libs: ${libs.length}`);
