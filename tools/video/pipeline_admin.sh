#!/bin/bash
# Video del administrador. Uso: EMP_PASS=... ADM_PASS=... SB_URL=... SB_KEY=... bash pipeline_admin.sh
cd "$(dirname "$0")"; R=$(cd ../.. && pwd); L=${LOG:-/tmp/video_admin.log}; : > $L
log() { echo "$@" >> $L; }
(cd $R && npm i --no-audit --no-fund >/dev/null 2>&1 && node scripts/build.mjs >/dev/null 2>&1) && log BUILD_OK
npm i --no-audit --no-fund >/dev/null 2>&1 && log NPM_OK
npx playwright install --with-deps chromium >/tmp/pw.log 2>&1 && log PW_OK
pip install -q edge-tts imageio-ffmpeg >/tmp/pip.log 2>&1 && log PIP_OK
(python3 -m http.server 8090 --directory $R/dist >/dev/null 2>&1 &); (python3 -m http.server 8091 --directory . >/dev/null 2>&1 &); sleep 1
node capture2.mjs >> $L 2>&1
node capture3.mjs >> $L 2>&1
export SCENES=scenes_admin.json FRAMES=frames_admin OUT=OLI_Tutorial_Administrador.mp4
node compose.mjs revisar >> $L 2>&1
node compose.mjs >> $L 2>&1
rm -rf clips audio; bash build.sh >> $L 2>&1
node upload.mjs >> $L 2>&1
log PIPELINE_FIN
