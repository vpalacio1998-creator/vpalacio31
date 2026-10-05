# Video tutorial con voz (Gonzalo, Colombia)

Se ejecuta en una máquina con internet (se usó un sandbox de Vercel):

1. `npm i playwright@1.47.2 @supabase/supabase-js@2.45.4 && npx playwright install --with-deps chromium && pip install edge-tts imageio-ffmpeg`
2. `EMP_PASS=... ADM_PASS=... node capture.mjs` → capturas reales de https://oli-pos.vercel.app (crea ventas de prueba: bórralas después).
3. `node compose.mjs` → láminas 1920×1080 con estilo Claude Design.
4. `bash build.sh` → narración con la voz `es-CO-GonzaloNeural` (Microsoft Edge TTS) y unión en `OLI_Tutorial_Gonzalo.mp4`.
5. `SB_URL=... SB_KEY=... ADM_PASS=... node upload.mjs` → sube el video al almacenamiento privado de Supabase y devuelve un enlace.

La narración y los textos de cada escena están en `scenes.json`.
