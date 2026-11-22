#!/usr/bin/env bash
# The same stretch of the story played N times over, for a fault that comes and goes with the machine's pace: each play
# is tools/story_play.js with the environment given (FROM, UPTO, DRAW, ...), its log in OUT/<n>.log, and a line a play
# with how it ended and its clipping cases matching GREP (default "clip wall: guide").
#   tools/job.sh run rep -- tools/repeat_play.sh OUT N [WxH]
set -u
OUT=$1; N=$2; SIZE=${3:-800x500}; mkdir -p "$OUT"
X=""; [ -z "${DISPLAY:-}" ] && X="xvfb-run -a"
rc=0
for i in $(seq 1 "$N"); do
  if $X node tools/story_play.js "$OUT/p$i" "$SIZE" >"$OUT/$i.log" 2>&1; then r=ok; else r=FAIL; rc=1; fi
  echo "$r play $i: $(grep -c "${GREP:-clip wall: guide}" "$OUT/$i.log") cases; $(grep "${GREP:-clip wall: guide}" "$OUT/$i.log" | sed 's/.*deep, at /at /' | cut -c1-90 | sort | uniq -c | sort -rn | head -3 | tr '\n' ';')"
done
exit $rc
