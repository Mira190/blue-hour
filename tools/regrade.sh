#!/bin/sh
# The map's levels made again, in the order they depend on each other (docs/LEVELS.md): the ground from the survey,
# the buildings' passes, the landmarks on the ground as it is, the packs.
#   tools/regrade.sh [city]     (ten minutes or so: run it as a job, tools/job.sh run regrade -- tools/regrade.sh)
set -e
cd "$(dirname "$0")/.."
C=${1:-shibuya}
# (the landmarks stand on the ground and the grading keeps the ground under their paving: made in turn until a
# further grading would move nothing, which the second round does from any start seen so far)
n=0
while :; do
  python3 pipeline/street_ground.py --city "$C" --force >/dev/null
  python3 pipeline/stations.py --city "$C"
  python3 pipeline/lobby.py --city "$C"
  [ -f "cities/$C/scrsq_base.py" ] && python3 "cities/$C/scrsq_base.py" >/dev/null
  python3 pipeline/roofkit.py --city "$C"
  python3 pipeline/landmarks.py --city "$C" | tail -1
  python3 pipeline/street_ground.py --city "$C" --settled && break
  n=$((n + 1)); [ $n -ge 4 ] && { echo "FAIL the ground did not settle in 4 rounds"; exit 1; }
done
python3 pipeline/pack.py
python3 tools/levels_check.py "$C"
