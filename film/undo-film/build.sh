#!/bin/sh
# One command: page -> frames -> video, voices + score + foley -> mix, then mux at -14 LUFS and a small copy for phones.
# Run from Git Bash. Needs the Lemo-Opuscar library (LIB, default ~/lemo-opuscar) with its core, voice tier and the VCSL samples.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
LIB=${LIB:-$HOME/lemo-opuscar}
export LIB
[ -f "$LIB/core/render/video.mjs" ] || { echo "set LIB to the Lemo-Opuscar folder"; exit 1; }
PY="$LIB/.venv/Scripts/python.exe"; [ -x "$PY" ] || PY="$LIB/.venv/bin/python"
node "$HERE/join.mjs" world.part,cast.part,film.part index.html
cd "$LIB"
"$PY" core/tts/tts.py "$HERE/lines.json" "$HERE/voice"
PYTHONIOENCODING=utf-8 "$PY" core/tts/asr_check.py "$HERE/lines.json" "$HERE/voice" --lang en
node core/render/video.mjs "$HERE" --fps 24 --workers 3 --out "$HERE/out/video.mp4"
PYTHONIOENCODING=utf-8 "$PY" "$HERE/mix.py"
sh core/render/mux.sh "$HERE/out/video.mp4" "$HERE/out/mix.wav" "$HERE/undo-film.mp4" 24 0
"$PY" core/render/srt.py "$HERE/cues.json" "$HERE/undo-film.srt"
ffmpeg -y -v error -i "$HERE/undo-film.mp4" -c:v libx264 -b:v 2000k -maxrate 3200k -bufsize 6400k -preset slow -pix_fmt yuv420p -c:a aac -b:a 128k -movflags +faststart "$HERE/undo-film-small.mp4"
echo "done: $HERE/undo-film.mp4 and undo-film-small.mp4"
