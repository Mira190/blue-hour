#!/bin/sh
# One GPU, several sessions on the same machine: runs a command while it holds the machine's GPU lock, so that a timing
# is of this page alone. The lock is a directory; one older than 45 minutes was left by a run that died, and is taken.
#   tools/gpu_lock.sh env GPU=metal node tools/load_tex.js '?tex=raw'
LOCK=${GPU_LOCK:-/tmp/blue-hour-gpu.lock}
until mkdir "$LOCK" 2>/dev/null; do
  [ -n "$(find "$LOCK" -maxdepth 0 -mmin +45 2>/dev/null)" ] && rmdir "$LOCK" 2>/dev/null && continue
  sleep 10
done
trap 'rmdir "$LOCK" 2>/dev/null' EXIT
trap 'exit 143' INT TERM HUP
"$@"
