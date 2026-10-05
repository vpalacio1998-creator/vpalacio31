// Sube el video al almacenamiento privado de Supabase (bucket "exports", carpeta de la organización) y crea un enlace de descarga.
import { createClient } from '@supabase/supabase-js'; import fs from 'fs';
const sb = createClient(process.env.SB_URL, process.env.SB_KEY);
const { error: e1 } = await sb.auth.signInWithPassword({ email: 'admin@oli.app', password: process.env.ADM_PASS }); if (e1) throw e1;
const me = (await sb.rpc('oli_me')).data, path = `${me.org_id}/video/OLI_Tutorial_Gonzalo.mp4`;
const up = await sb.storage.from('exports').upload(path, fs.readFileSync('OLI_Tutorial_Gonzalo.mp4'), { contentType: 'video/mp4', upsert: true }); if (up.error) throw up.error;
const s = await sb.storage.from('exports').createSignedUrl(path, 60 * 60 * 24 * 365); if (s.error) throw s.error;
console.log('ENLACE', s.data.signedUrl);
