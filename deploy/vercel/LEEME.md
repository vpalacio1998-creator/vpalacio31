# Despliegue en Vercel (proyecto `oli-pos`)
Producción: https://oli-pos.vercel.app
Se despliega con un proyecto mínimo (este `build.sh` + `vercel.json` del repositorio) que descarga el código público de GitHub y ejecuta `scripts/build.mjs`.
Sin variables `OLI_SUPABASE_URL` / `OLI_SUPABASE_ANON_KEY` la app trabaja **solo en cada equipo** (no sincroniza entre dispositivos).

## Visita diaria (para que Supabase no se pause)
El plan gratuito de Supabase pausa el proyecto si en una semana casi no recibe consultas.
`vercel.json` tiene un Cron de Vercel que una vez al día (11:17 UTC = 6:17 a. m. de Colombia, puede correr dentro de esa hora)
llama `/api/despertar`, que hace 3 consultas a la función `oli_ping` de la base (migración `20261016000000_oli_ping.sql`).
Usa solo la clave pública; no lee ni cambia datos del negocio. Si falla, queda un error en los registros de Vercel.
Archivos del proyecto mínimo en Vercel: `build.sh`, `package.json`, `vercel.json`, `api/despertar.js` (esta carpeta).
