#!/bin/bash
# The same views with a switch on and off, on a desktop and a phone, for a before/after look at a change that should
# not move the picture (docs/PERFORMANCE.md, "Draws: one a material"): tools/ab_shots.sh out_dir '&batch=off' [views.json]
#   tools/job.sh run ab -- tools/ab_shots.sh out/ab '&batch=off'
# ONLY and TIMES as tools/scramble_shot.js takes them (foot,h008,h080 and dusk,night,rain).
out=${1:-out/ab}; off=${2:-&batch=off}; views=${3:-tools/views/walk-heights.json}
export ONLY=${ONLY:-foot,h008,h080} TIMES=${TIMES:-dusk,night,rain}
for size in 1440x900 390x844; do
  tier=high; [ $size = 390x844 ] && tier=low
  TIER=$tier QUERY= xvfb-run -a node tools/scramble_shot.js shibuya $views $out/on-$size $size || exit 1
  TIER=$tier QUERY="$off" xvfb-run -a node tools/scramble_shot.js shibuya $views $out/off-$size $size || exit 1
done
