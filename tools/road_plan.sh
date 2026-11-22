#!/usr/bin/env bash
# A city's road plan made again from the roads, the built model and the survey (docs/ROADS.md), in the order its
# parts depend on each other:
#   1 pipeline/road_plan.py with nothing measured: the pieces joined under cover, the solids over them raised
#   2 pipeline/landmarks.py: the railway's bridges over the streets of the graph as it now is (cities/<id>/rail.py)
#   3 tools/road_walls.js and pipeline/road_passages.py, the packs made between passes: footprints stood back from
#     a road, passages carved, posts out of a carriageway, until nothing changes
#   4 tools/road_net_dump.js: the game's own measure of what is still cut or too narrow (road_measured.json), then
#     the plan with it, the packs, and the measure once more (closing a piece can leave its neighbour too short)
#   5 the plan's checks, and its map (docs/images/roads/)
# Serve web/ on $PORT (8800) first; run it as a job: tools/job.sh run roadplan -- tools/road_plan.sh shibuya
set -eu
cd "$(dirname "$0")/.."
c=${1:-shibuya}
OUT=${OUT:-/tmp/oe-roadplan}
mkdir -p "$OUT"
pack() { python3 pipeline/pack.py > "$OUT/pack.log" 2>&1 || { tail -5 "$OUT/pack.log"; exit 1; }; }
echo '{"source":"","cut":[],"off":[]}' > "cities/$c/road_measured.json"
python3 pipeline/road_plan.py --city "$c" > "$OUT/plan0.log"; sed -n 1,2p "$OUT/plan0.log"
python3 pipeline/landmarks.py --city "$c" > "$OUT/landmarks.log"; tail -1 "$OUT/landmarks.log"
pack
for pass in 1 2 3 4; do
  xvfb-run -a node tools/road_walls.js "$c" --json "$OUT/walls.$pass.json" > "$OUT/walls.$pass.log" 2>&1
  res=$(python3 pipeline/road_passages.py --city "$c" --walls "$OUT/walls.$pass.json" | tail -1)
  echo "passages, pass $pass: ${res# *}"
  [ "${res}" = "${last:-}" ] && break   # (the same again: what is left it cannot carve)
  last=$res
  case "$res" in *"nothing to change"*) break;; esac
  pack
done
pack
for pass in 1 2; do
  xvfb-run -a node tools/road_net_dump.js "$c" "$OUT/net.json" "cities/$c/road_measured.json" | grep measured
  python3 pipeline/road_plan.py --city "$c" > "$OUT/plan$pass.log"; grep -v "joined under" "$OUT/plan$pass.log" | sed -n 1,2p
  pack
done
python3 pipeline/road_plan.py --city "$c" --check
python3 tools/road_map.py "$c" docs/images/roads | tail -2
