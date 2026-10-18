// Edge Function "oli-push": manda las notificaciones al administrador (Web Push).
// - POST: la llama la base de datos cuando hay avisos nuevos (migración 20261018000000_oli_push.sql). Toma los avisos
//   pendientes de la cola y los manda a los equipos donde un administrador activó las notificaciones.
// - GET: devuelve la clave pública VAPID, que el navegador necesita para activar las notificaciones (no es secreta).
// Las claves VAPID se generan una sola vez, aquí mismo, y se guardan en el servidor (tabla oli_push_conf, sin acceso desde la
// app): la privada nunca sale del servidor. No recibe datos de quien la llama: solo manda lo que ya está en la cola, así que
// corre sin exigir sesión (verify_jwt = false). Usa la service_role key del entorno de Supabase (nunca llega al navegador).
// Despliegue: supabase functions deploy oli-push --no-verify-jwt
import webpush from "npm:web-push@3.6.7";

const BASE = Deno.env.get("SUPABASE_URL")!, KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type", "access-control-allow-methods": "GET, POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });

type Claves = { pub: string; priv: string; sujeto: string };
type Sub = { endpoint: string; p256dh: string; auth: string };
type Aviso = { id: number; kind: string; title: string; body: string; tag: string | null; url: string | null; subs: Sub[] };

async function rpc(nombre: string, args: Record<string, unknown> = {}) {
  const r = await fetch(`${BASE}/rest/v1/rpc/${nombre}`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(args) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${nombre}: ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}

let CLAVES: Claves | null = null;
async function claves(): Promise<Claves> {
  if (CLAVES) return CLAVES;
  let k = await rpc("oli_push_claves");
  if (!k || !k.pub || !k.priv) {                                       // primera vez: se generan y se guardan (si otra llamada ganó, quedan las suyas)
    const g = webpush.generateVAPIDKeys();
    k = await rpc("oli_push_guardar_claves", { p_pub: g.publicKey, p_priv: g.privateKey });
  }
  if (!k || !k.pub || !k.priv) throw new Error("no hay claves para las notificaciones");
  CLAVES = k as Claves;
  return CLAVES;
}

async function mandar(k: Claves, s: Sub, payload: string): Promise<number> {
  const det = webpush.generateRequestDetails({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload,
    { vapidDetails: { subject: k.sujeto, publicKey: k.pub, privateKey: k.priv }, TTL: 6 * 3600, urgency: "high" });
  const h = new Headers();
  for (const [a, b] of Object.entries(det.headers as Record<string, string | number>)) if (a.toLowerCase() !== "content-length") h.set(a, String(b));
  const r = await fetch(det.endpoint, { method: det.method, headers: h, body: det.body as Uint8Array });
  await r.body?.cancel();
  return r.status;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const k = await claves();
    if (req.method === "GET") return json({ publicKey: k.pub });
    let avisos = 0, enviados = 0;
    for (let vuelta = 0; vuelta < 10; vuelta++) {
      const lote = (await rpc("oli_push_tomar", { p_limite: 50 })) as Aviso[] | null;
      if (!lote || !lote.length) break;
      const ok = new Set<string>(), malos = new Set<string>(), listos: number[] = [];
      await Promise.all(lote.map(async (ev) => {
        const payload = JSON.stringify({ title: ev.title, body: ev.body, tag: ev.tag, url: ev.url, kind: ev.kind });
        let reintentar = false;
        await Promise.all((ev.subs || []).map(async (s) => {
          try {
            const st = await mandar(k, s, payload);
            if (st === 404 || st === 410) malos.add(s.endpoint);              // el navegador ya no tiene esa suscripción
            else if (st >= 200 && st < 300) { ok.add(s.endpoint); enviados++; }
            else if (st === 429 || st >= 500) reintentar = true;               // el servicio de avisos está ocupado: se reintenta luego
          } catch (_) { reintentar = true; }
        }));
        if (!reintentar) listos.push(ev.id);
        avisos++;
      }));
      await rpc("oli_push_resultado", { p_ids: listos, p_ok: [...ok], p_malos: [...malos] });
      if (listos.length < lote.length) break;                                 // lo que falló se reintenta con el próximo aviso
    }
    return json({ avisos, enviados });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
