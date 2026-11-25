#!/usr/bin/env bash
# The crowd's update with and without its step off the main thread (issue 220, ?simworker), measured in one page:
# tools/crowd_cost.js in HZ mode with its calls let go to the event loop between (GAP), in blocks of AB calls with the
# step handed over and not in turn (?ab=), so that both halves see the same crowd, the same near people and the same
# machine's moment (one run to the next, this machine reads the update up to half apart). Once with the Worker
# (?simworker=1) and once with the same step on the main thread (?simworker=main), each profile split into simulation
# and drawing (tools/prof_split.js). Serve web/ on $PORT (8800) first; run it as a job.
#   tools/simworker_cost.sh [WxH] [HZ] [seconds] [outdir]      (390x844 30: a phone's page; FROM=6: frame 7)
#   MODES="1": the Worker only
set -u
size=${1:-1440x900}; hz=${2:-60}; secs=${3:-40}; out=${4:-/tmp/simworker-cost}; ab=${AB:-30}
mkdir -p "$out"
for mode in ${MODES:-1 main}; do
  tag="$size-$mode${FROM:+-f$FROM}"
  echo "== $size, simworker=$mode, blocks of $ab"
  Q="?simworker=$mode&ab=$ab" GAP=1 HZ="$hz" OUT="$out/$tag.cpuprofile" xvfb-run -a node tools/crowd_cost.js "$size" "$secs" > "$out/$tag.log" 2>&1
  grep -E "update at|^A/B|^after" "$out/$tag.log" | cut -c1-500
done
