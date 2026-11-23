#!/bin/sh
# The map's levels made again, in the order they depend on each other (docs/LEVELS.md): the ground from the survey,
# the buildings' passes, the landmarks on the ground as it is, the packs, the road plan over them.
#   tools/regrade.sh [city]     (twenty minutes or so, with web/ served: run it as a job, tools/job.sh run regrade -- tools/regrade.sh)
set -e
cd "$(dirname "$0")/.."
C=${1:-shibuya}
# (the landmarks stand on the ground and the grading keeps the ground under their paving: made in turn until a
# further grading would move nothing, which the second round does from any start seen so far)
n=0
while :; do
  python3 pipeline/street_ground.py --city "$C" --force >/dev/null
  python3 pipeline/proportion.py --city "$C"
  python3 pipeline/stations.py --city "$C"
  python3 pipeline/lobby.py --city "$C"
  [ -f "cities/$C/scrsq_base.py" ] && python3 "cities/$C/scrsq_base.py" >/dev/null
  python3 pipeline/roofkit.py --city "$C"
  python3 pipeline/landmarks.py --city "$C" | tail -1
  python3 pipeline/street_ground.py --city "$C" --settled && break
  n=$((n + 1)); [ $n -ge 4 ] && { echo "FAIL the ground did not settle in 4 rounds"; exit 1; }
done
python3 pipeline/pack.py
# The road plan is made after the buildings' passes (docs/ROADS.md, tools/road_plan.sh): stations.py gives a building that
# stands off the ground one underside, the lowest its solids have, and the plan then raises the solids a road passes
# under. Left out here, the Ginza line's viaduct came back down to 3.9 m over Meiji-dori, the buses under it stood, and
# the drive to 109 jammed behind them (issue 173's first run of the checks). It plays the page: serve web/ first.
if curl -s -o /dev/null "http://localhost:${PORT:-8800}/"; then
  tools/road_plan.sh "$C" 2>&1 | grep -v "^Traceback\|^  File\|^    import\|ModuleNotFound"
else
  echo "FAIL the road plan was not made again: serve web/ on ${PORT:-8800} and run tools/road_plan.sh $C"; exit 1
fi
python3 tools/levels_check.py "$C"
