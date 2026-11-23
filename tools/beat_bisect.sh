#!/usr/bin/env bash
# One still's count on a phone, for `git bisect run` (issue 131): plays one frame of the story as an iPhone, dry, and
# exits 0 when the still's measure is at most the ceiling, 1 when it is over, 125 when the play did not reach the still.
#   tools/beat_bisect.sh <frame, from 1> <still> <measure> <ceiling>      # tools/beat_bisect.sh 2 2-find passes 9
#   git bisect start --first-parent <bad> <good> && git bisect run tools/beat_bisect.sh 2 2-find passes 9
# As a job, since a bisect is several plays: tools/job.sh run bisect -- git bisect run tools/beat_bisect.sh ...
set -u
cd "$(dirname "$0")/.."
n=$1 still=$2 key=$3 max=$4 out=${OUT:-/tmp/oe-bisect} port=${PORT:-8890}
mkdir -p "$out"; export NODE_PATH=${NODE_PATH:-$(npm root -g 2>/dev/null)}
python3 -m http.server "$port" --directory web >"$out/server.log" 2>&1 & srv=$!
trap 'kill $srv 2>/dev/null' EXIT
for _ in $(seq 50); do curl -s -o /dev/null "http://localhost:$port/index.html" && break; sleep 0.2; done
X=; command -v xvfb-run >/dev/null && X="xvfb-run -a"
PORT=$port BUDGET="$out/counts.jsonl" PHONE=1 DPR=3 TIER=low FROM=$((n - 1)) UPTO=$n STILLS=0 DRAW=1000 LIMIT=1500 GAME_TIME=${GAME_TIME:-2026-11-02T10:00} \
  timeout 1700 $X node tools/story_play.js "$out/play" 390x844 >"$out/play.log" 2>&1
python3 - "$out/counts.jsonl" "$still" "$key" "$max" <<'PY'
import json, sys
f, still, key, top = sys.argv[1], sys.argv[2], sys.argv[3], float(sys.argv[4])
for line in open(f):
    s = json.loads(line)
    if s['still'] == still:
        print('%s: %s %s (ceiling %g) at %s' % (still, key, s.get(key), top, __import__('subprocess').run(['git', 'log', '-1', '--format=%h %s'], capture_output=True, text=True).stdout.strip()[:90]))
        sys.exit(0 if s.get(key, 0) <= top else 1)
print('%s: not reached' % still); sys.exit(125)
PY
