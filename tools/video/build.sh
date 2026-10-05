set -e
cd "$(dirname "$0")"
FF=$(command -v ffmpeg || python3 -c 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())')
FR=${FRAMES:-frames}; SC=${SCENES:-scenes.json}; OUT=${OUT:-OLI_Tutorial_Gonzalo.mp4}
mkdir -p audio clips
SCENES=$SC python3 - <<'PY'
import json, subprocess
import os
for s in json.load(open(os.environ.get('SCENES','scenes.json'))):
    subprocess.run(['python3','-m','edge_tts','--voice','es-CO-GonzaloNeural','--rate','-4%','--text',s['say'],'--write-media',f"audio/{s['id']}.mp3"], check=True)
print('VOZ_OK')
PY
: > list.txt
for f in $FR/*.png; do id=$(basename $f .png)
  d=$($FF -i audio/$id.mp3 2>&1 | grep -o 'Duration: [0-9:.]*' | cut -d' ' -f2 | awk -F: '{print $1*3600+$2*60+$3}')
  T=$(python3 -c "print(round($d+0.9,2))"); N=$(python3 -c "print(int(($d+0.9)*30))"); FO=$(python3 -c "print(round($d+0.9-0.35,2))")
  $FF -y -loglevel error -loop 1 -framerate 30 -i $f -i audio/$id.mp3 -filter_complex "[0:v]scale=2112:1188,zoompan=z='1+0.035*on/$N':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=$N:s=1920x1080:fps=30,fade=t=in:st=0:d=0.35,fade=t=out:st=$FO:d=0.35,format=yuv420p[v];[1:a]adelay=350|350,apad,aformat=sample_rates=48000:channel_layouts=stereo[a]" -map "[v]" -map "[a]" -t $T -c:v libx264 -preset medium -crf 20 -c:a aac -b:a 160k clips/$id.mp4
  echo "file 'clips/$id.mp4'" >> list.txt; echo "clip $id $T s"
done
$FF -y -loglevel error -f concat -safe 0 -i list.txt -c copy -movflags +faststart $OUT
$FF -i $OUT 2>&1 | grep -E 'Duration|Stream' ; ls -la $OUT
