#!/usr/bin/env bash
# One command run n times on the same tree, one after another, to say how often it fails: what a check that
# fails "now and then" is measured with before and after its fix (docs/CHECKS.md, "A check that fails now and then").
#
#   tools/job.sh run rep -- tools/repeat.sh <n> <out dir> [grep pattern] -- <command...>
#
# Each run's output goes to <out dir>/run-<i>.log; after each run a line with its exit code, its seconds and the
# lines of its log that match the pattern (default: ^FAIL), and at the end how many of the n failed. Exits 1 when any
# did. It is long work: run it as a job (tools/job.sh), never two beside each other.
# BUSY=n keeps n cores busy beside each run (plain loops, no browser): what a second lane of checks, or a runner's
# slower cores, does to a page's frame times and its load order, which is where most of these failures come from.
set -u
[ $# -ge 4 ] || { sed -n '2,9p' "$0" | cut -c3-; exit 2; }
N=$1; OUT=$2; shift 2
PAT='^FAIL'
if [ "$1" != "--" ]; then PAT=$1; shift; fi
[ "$1" = "--" ] && shift
mkdir -p "$OUT"
bad=0
for i in $(seq 1 "$N"); do
  t0=$(date +%s)
  pids=
  for _ in $(seq 1 "${BUSY:-0}"); do (while :; do :; done) & pids="$pids $!"; done
  "$@" >"$OUT/run-$i.log" 2>&1; rc=$?
  [ -z "$pids" ] || kill $pids 2>/dev/null
  [ $rc -eq 0 ] || bad=$((bad + 1))
  echo "run $i/$N: exit $rc after $(( $(date +%s) - t0 )) s"
  grep -E "$PAT" "$OUT/run-$i.log" | cut -c1-300 | sed 's/^/    /'
done
echo "$bad of $N runs failed (logs in $OUT)"
[ $bad -eq 0 ]
