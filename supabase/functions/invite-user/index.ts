// Edge Function: el administrador crea la cuenta de un empleado (o de otro administrador).
// Corre en el servidor de Supabase con la service_role key (secreto del servidor; NUNCA llega al navegador).
// Despliegue:  supabase functions deploy invite-user
// Llamada desde OLI: supabase.functions.invoke('invite-user', { body: { email, password, rol, nombre } })
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";
    // 1) Quién llama: con SU token (RLS) se averigua si es administrador.
    const asCaller = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const me = (await asCaller.rpc("oli_me")).data;
    if (!me || !me.is_admin) return json({ error: "Solo un administrador puede crear cuentas." }, 403);

    const { email, password, rol, nombre } = await req.json();
    if (!email || !password || String(password).length < 8) return json({ error: "Escribe un correo y una contraseña de al menos 8 caracteres." }, 400);
    const role = rol === "admin" ? "admin" : "employee";
    if (role === "admin" && me.role !== "owner") return json({ error: "Solo el propietario puede crear administradores." }, 403);

    // 2) Con la service_role se crea el usuario y su membresía (solo en esta organización y sede).
    const admin = createClient(url, service);
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) return json({ error: created.error?.message ?? "No se pudo crear la cuenta." }, 400);
    const ins = await admin.from("memberships").insert({ user_id: created.data.user.id, org_id: me.org_id, store_id: me.store_id, role, display_name: nombre ?? null });
    if (ins.error) return json({ error: ins.error.message }, 400);
    return json({ ok: true, user_id: created.data.user.id });
  } catch (e) {
    return json({ error: "Error inesperado: " + (e as Error).message }, 500);
  }
});
