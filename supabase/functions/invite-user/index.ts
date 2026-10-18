// Edge Function: el administrador maneja las cuentas de su negocio.
// Corre en el servidor de Supabase con la service_role key (secreto del servidor; NUNCA llega al navegador).
// Despliegue:  supabase functions deploy invite-user
// Llamadas desde OLI (supabase.functions.invoke('invite-user', { body })):
//   { email, password, rol, nombre }                 crea la cuenta de un empleado (o de otro administrador)
//   { accion: "acceso", user_id, activo }            quita o devuelve el acceso de una cuenta (no se borra nada)
//   { accion: "clave", user_id, password }           le pone una contraseña nueva a una cuenta
// Reglas (aquí, en el servidor): solo un administrador; solo cuentas de SU negocio; nadie se cambia a sí mismo por aquí;
// la cuenta del propietario no se toca; un administrador que no es el propietario solo maneja cuentas de empleados.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });
const NUNCA = "876000h";   // "para siempre" (100 años): así bloquea Supabase Auth una cuenta sin borrarla

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!, anon = Deno.env.get("SUPABASE_ANON_KEY")!, service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";
    // 1) Quién llama: con SU token (RLS) se averigua si es administrador.
    const asCaller = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const me = (await asCaller.rpc("oli_me")).data;
    if (!me || !me.is_admin) return json({ error: "Solo un administrador puede manejar las cuentas." }, 403);
    const yo = (await asCaller.auth.getUser()).data.user?.id ?? null;

    const body = await req.json();
    const admin = createClient(url, service);

    if (body.accion === "acceso" || body.accion === "clave") {
      const uid = String(body.user_id || "");
      if (!uid || uid === yo) return json({ error: "Tu propia cuenta no se cambia desde aquí." }, 400);
      const m = await admin.from("memberships").select("user_id, role, active").eq("org_id", me.org_id).eq("user_id", uid).maybeSingle();
      if (m.error || !m.data) return json({ error: "Esa cuenta no es de este negocio." }, 404);
      if (m.data.role === "owner") return json({ error: "La cuenta del propietario no se puede cambiar desde aquí." }, 403);
      if (m.data.role !== "employee" && me.role !== "owner") return json({ error: "Solo el propietario puede cambiar la cuenta de otro administrador." }, 403);

      if (body.accion === "clave") {
        const pw = String(body.password || "");
        if (pw.length < 8) return json({ error: "La contraseña nueva debe tener al menos 8 caracteres." }, 400);
        const r = await admin.auth.admin.updateUserById(uid, { password: pw });
        if (r.error) return json({ error: /password/i.test(r.error.message) ? "Esa contraseña no se puede usar: escribe una más segura (al menos 8 caracteres, que no sea común)." : "No se pudo cambiar la contraseña. (" + r.error.message + ")" }, 400);
        return json({ ok: true });
      }

      const activo = body.activo === true;
      // primero la membresía: sin ella el servidor ya no le muestra ni le acepta nada (aunque su sesión siga abierta);
      // después se bloquea la cuenta para que no pueda volver a ingresar ni renovar la sesión
      const up = await admin.from("memberships").update({ active: activo }).eq("org_id", me.org_id).eq("user_id", uid);
      if (up.error) return json({ error: "No se pudo cambiar el acceso. (" + up.error.message + ")" }, 400);
      const ban = await admin.auth.admin.updateUserById(uid, { ban_duration: activo ? "none" : NUNCA });
      if (ban.error) return json({ ok: true, aviso: "El acceso quedó " + (activo ? "devuelto" : "quitado") + " en OLI, pero no se pudo " + (activo ? "desbloquear" : "bloquear") + " el ingreso de la cuenta. (" + ban.error.message + ")" });
      return json({ ok: true });
    }

    const { email, password, rol, nombre } = body;
    if (!email || !password || String(password).length < 8) return json({ error: "Escribe un correo y una contraseña de al menos 8 caracteres." }, 400);
    const role = rol === "admin" ? "admin" : "employee";
    if (role === "admin" && me.role !== "owner") return json({ error: "Solo el propietario puede crear administradores." }, 403);

    // 2) Con la service_role se crea el usuario y su membresía (solo en esta organización y sede).
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) {
      const m = created.error?.message ?? "";
      if (/already.*(registered|exists)|email_exists/i.test(m + " " + ((created.error as { code?: string })?.code ?? ""))) return json({ error: "Ya existe una cuenta con ese correo." }, 400);
      if (/password/i.test(m)) return json({ error: "Esa contraseña no se puede usar: escribe una más segura (al menos 8 caracteres, que no sea común)." }, 400);
      return json({ error: "No se pudo crear la cuenta." + (m ? " (" + m + ")" : "") }, 400);
    }
    const ins = await admin.from("memberships").insert({ user_id: created.data.user.id, org_id: me.org_id, store_id: me.store_id, role, display_name: nombre ?? null });
    if (ins.error) {
      // sin membresía la cuenta no sirve y dejaría el correo ocupado: se deshace la cuenta recién creada en esta misma llamada
      await admin.auth.admin.deleteUser(created.data.user.id).catch(() => null);
      return json({ error: "No se pudo crear la cuenta. Intenta de nuevo. (" + ins.error.message + ")" }, 400);
    }
    return json({ ok: true, user_id: created.data.user.id });
  } catch (e) {
    return json({ error: "Error inesperado: " + (e as Error).message }, 500);
  }
});
