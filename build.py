#!/usr/bin/env python3
"""Arma index.html (y la versión PWA instalable) a partir de src/. Uso: python3 build.py"""
import glob, os, re, sys
R = os.path.dirname(os.path.abspath(__file__)); S = os.path.join(R, "src")
def rd(p): return open(os.path.join(S, p), encoding="utf-8").read()
css = rd("style.css"); body = rd("body.html")
icons = {"__ICON_BUSCAR__": '<svg class="ic" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>',
         "__ICON_CAMPANA__": '<svg class="ic" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15L6 17z"/><path d="M10 21a2 2 0 0 0 4 0"/></svg>'}
for k, v in icons.items(): body = body.replace(k, v)
js_files = sorted(f for f in os.listdir(S) if re.match(r"\d\d-.*\.js$", f))
js = "\n".join("/* >>> %s */\n%s" % (f, rd(f)) for f in js_files)
def page(pwa):
    head = ('<title>OLI</title>\n<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
            '<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Figtree:wght@400;500;600;700&display=swap" rel="stylesheet">\n')
    if pwa: head += '<link rel="manifest" href="manifest.webmanifest"><meta name="theme-color" content="#2F7B5A"><link rel="icon" href="icon.svg"><link rel="apple-touch-icon" href="icon-192.png">\n'
    sw = ('\ntry{if("serviceWorker" in navigator&&location.protocol.startsWith("http"))navigator.serviceWorker.register("sw.js")}catch(e){}\n' if pwa else "")
    return head + "<style>\n" + css + "\n</style>\n" + body + "\n<script>\n(function(){\n\"use strict\";\n" + js + "\n})();" + sw + "\n</script>\n"
art = page(False)                                  # artefacto de Claude: el contenedor agrega doctype/head/body
open(os.path.join(R, "dist-artifact.html"), "w", encoding="utf-8").write(art)
full = '<!doctype html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' + page(False) .split("</style>")[0].replace('<title>OLI</title>', '<title>OLI</title>') + "</style>\n</head>\n<body>\n" + art.split("</style>\n", 1)[1] + "</body>\n</html>\n"
open(os.path.join(R, "index.html"), "w", encoding="utf-8").write(full)
print("ok", len(art), "bytes")
