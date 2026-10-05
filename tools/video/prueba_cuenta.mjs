// Prueba real de "Crear cuenta": el administrador crea una cuenta de prueba con la función invite-user y luego esa cuenta entra.
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.SB_URL, process.env.SB_KEY), mail = 'prueba-borrar@oli.app', pass = 'Prueba-OLI-2026';
await sb.auth.signInWithPassword({ email: 'admin@oli.app', password: process.env.ADM_PASS });
const r = await sb.functions.invoke('invite-user', { body: { email: mail, password: pass, rol: 'employee', nombre: 'Prueba' } });
console.log('CREAR_CUENTA', r.error ? 'ERROR ' + ((r.data && r.data.error) || r.error.message) : JSON.stringify(r.data));
const e = createClient(process.env.SB_URL, process.env.SB_KEY, { auth: { persistSession: false } });
const l = await e.auth.signInWithPassword({ email: mail, password: pass });
const me = l.error ? null : (await e.rpc('oli_me')).data;
console.log('ENTRA_CUENTA', l.error ? 'ERROR ' + l.error.message : JSON.stringify(me));
const emp = createClient(process.env.SB_URL, process.env.SB_KEY, { auth: { persistSession: false } });
await emp.auth.signInWithPassword({ email: 'empleado@oli.app', password: process.env.EMP_PASS });
const r2 = await emp.functions.invoke('invite-user', { body: { email: 'intruso-borrar@oli.app', password: 'Intruso-12345', rol: 'admin' } });
console.log('EMPLEADO_CREA', r2.error ? 'RECHAZADO ' + (r2.response ? r2.response.status : '') : 'PERMITIDO ' + JSON.stringify(r2.data));
