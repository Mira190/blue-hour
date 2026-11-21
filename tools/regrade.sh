#!/bin/sh
# The map's levels made again, in the order they depend on each other (docs/LEVELS.md): the ground from the survey,
# the retaining blocks on its breaks, the buildings' passes, the landmarks on the ground as it is, the packs.
#   tools/regrade.sh [city]     (ten minutes or so: run it as a job, tools/job.sh run regrade -- tools/regrade.sh)
set -e
cd "$(dirname "$0")/.."
C=${1:-shibuya}
python3 pipeline/street_ground.py --city "$C" --force >/dev/null
python3 pipeline/terraces.py --city "$C"
python3 pipeline/stations.py --city "$C"
python3 pipeline/lobby.py --city "$C"
[ -f "cities/$C/scrsq_base.py" ] && python3 "cities/$C/scrsq_base.py"
python3 pipeline/roofkit.py --city "$C"
python3 pipeline/landmarks.py --city "$C" | tail -1
python3 pipeline/street_ground.py --city "$C" --settled
python3 pipeline/terraces.py --city "$C" --check
python3 pipeline/pack.py
python3 tools/levels_check.py "$C"
