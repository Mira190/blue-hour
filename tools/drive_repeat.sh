#!/usr/bin/env bash
# The roads check's drives played again and again (issue 204: a stand seen once in five plays is made repeatable).
#   tools/job.sh run drives -- tools/drive_repeat.sh [plays=10]
# Each play is the check's own `tools/road_drive.js` command (TIMED=1 TRACE=1, the same starts and place, 17:57), its
# log kept as out/drive-repeat/play-N.log; after each play the drives' result lines and every stand of 60 s or more are
# printed. FROM=, TO=, GAME_TIME=, TIMES= and PHONE=1 pass through; STAND=s sets the stand printed (60).
cd "$(dirname "$0")/.." || exit 1
N=${1:-10}; D=out/drive-repeat; mkdir -p "$D"; STAND=${STAND:-60}
X=; command -v xvfb-run >/dev/null && X="xvfb-run -a"
curl -s -o /dev/null http://localhost:${PORT:-8800}/ || { python3 -m http.server ${PORT:-8800} --directory web >/dev/null 2>&1 & SRV=$!; sleep 2; }
trap '[ -n "$SRV" ] && kill $SRV 2>/dev/null' EXIT
TIMES=(${TIMES:-})   # (TIMES="17:50 17:53 ...": play k at the k-th hour, round again; the plays at one hour differ little)
for k in $(seq 1 "$N"); do
  t0=$(date +%s); [ ${#TIMES[@]} -gt 0 ] && GAME_TIME=${TIMES[$(( (k - 1) % ${#TIMES[@]} ))]}
  GAME_TIME=${GAME_TIME:-17:57} TIMED=1 TRACE=1 TO=${TO:-268,-998.6} FROM="${FROM:-372,-1041;480,-722;560,-1100;247,-964>505,-996}" \
    timeout 2400 $X node tools/road_drive.js shibuya >"$D/play-$k.log" 2>&1; rc=$?
  echo "play $k at ${GAME_TIME:-17:57} ($(( $(date +%s) - t0 )) s, exit $rc):"
  grep -E '^(ok  |FAIL) start|pageerror' "$D/play-$k.log" | cut -c1-220 | sed 's/^/  /'
  awk -v S="$STAND" '/^   stood/ { if ($2 + 0 >= S) print "    " substr($0, 1, 400) }' "$D/play-$k.log"
done
