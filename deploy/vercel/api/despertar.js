/* OLI · visita diaria a Supabase (Vercel Cron, una vez al día).
   El plan gratuito de Supabase pausa el proyecto si en una semana casi no recibe consultas a la base de datos;
   esto hace unas pocas consultas reales cada día para que no se pause cuando la tienda no vende (cierres, vacaciones).
   Usa solo la clave pública (anon) y la función oli_ping, que hace una lectura real pero solo devuelve la hora del servidor:
   no ve ni cambia datos del negocio. */
const VECES = 3;
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  // Vercel Cron manda "Authorization: Bearer <CRON_SECRET>" cuando ese secreto está configurado en el proyecto: así solo el cron la usa
  const secreto = process.env.CRON_SECRET;
  if (secreto && req.headers.authorization !== "Bearer " + secreto) { res.status(401).json({ok: false}); return; }
  const url = process.env.OLI_SUPABASE_URL, key = process.env.OLI_SUPABASE_ANON_KEY;
  if (!url || !key) { res.status(500).json({ok: false, error: "Falta configurar OLI_SUPABASE_URL / OLI_SUPABASE_ANON_KEY"}); return; }
  const out = [];
  for (let i = 1; i <= VECES; i++) {
    try {
      const r = await fetch(url + "/rest/v1/rpc/oli_ping", {method: "POST", headers: {apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json"}, body: "{}", signal: AbortSignal.timeout(15000)});
      out.push({consulta: i, estado: r.status});
    } catch (e) { out.push({consulta: i, estado: 0, error: String((e && e.message) || e).slice(0, 120)}); }
  }
  const ok = out.every(x => x.estado >= 200 && x.estado < 300);
  if (!ok) console.error("OLI despertar: el servidor no respondió bien", JSON.stringify(out));   // queda en los registros de Vercel
  res.status(ok ? 200 : 502).json({ok, cuando: new Date().toISOString(), consultas: out});
};
