# Despliegue en Vercel (proyecto `oli-pos`)
Producción: https://oli-pos.vercel.app
Se despliega con un proyecto mínimo (este `build.sh` + `vercel.json` del repositorio) que descarga el código público de GitHub y ejecuta `scripts/build.mjs`.
Sin variables `OLI_SUPABASE_URL` / `OLI_SUPABASE_ANON_KEY` la app trabaja **solo en cada equipo** (no sincroniza entre dispositivos).
