#!/usr/bin/env bash
# Long work as a job of this machine, not a child of the shell that asked for it (docs/CHECKS.md, "A run is a job").
#
# A session's shell tool stops what it started: a command in the foreground after 10 minutes, one in the background
# after 40 ("was stopped after reaching its background time limit", whatever timeout it was given), and every one of
# them when the session's worker restarts ("Stopped by a worker restart"). A change to the page runs 35 to 60 minutes
# of checks on a session's machine and the story alone 17, so a check run as the tool's child was stopped near its end
# and started again from the beginning, and each restart left its browser behind to slow the next run's story clock.
# Here a long command is started in a process session of its own (setsid), its output in a file, and the tool only
# waits on it. When a wait is cut off the job goes on, and asking for it again attaches to it: a job is never started
# twice, and never two at once.
#
#   tools/job.sh run <name> -- <command...>  start it, or attach to it when it already runs that command, and wait up
#                                            to $JOB_WAIT seconds (540: inside the foreground's 10 minutes). Exits with
#                                            the command's own code once it has ended, 75 while it still runs
#   tools/job.sh wait <name> [seconds]       wait on it again; starts nothing
#   tools/job.sh status [name]               the jobs of this machine: running or ended, for how long, the last line
#   tools/job.sh stop <name>                 stop it and everything it started, its browsers too
#   tools/job.sh log <name> [lines]          its last lines (40)
#
# A wait prints the lines the job wrote since the last wait (the last $JOB_LINES of them, 20) and, while it runs, a
# line saying how long it has run. An ended job's result is told once: the next run of that name starts it afresh.
# One job at a time: a browser or a build takes two or three of the four cores, and a story played beside another
# runs its clock at half speed (66 minutes for a 25-minute check). A second job is refused while one runs, and a
# browser not started as a job is named; JOB_PARALLEL=1 starts it all the same. JOB_LIGHT=1 marks a job that takes
# little, such as the page's server (JOB_LIGHT=1 tools/job.sh run serve -- python3 -m http.server 8800 --directory web):
# it neither waits for another nor holds one back, its run returns once it is up, and it outlives the turn.
set -u
JOBS=${JOBS:-/tmp/oe-jobs}
LINES_=${JOB_LINES:-20}
mkdir -p "$JOBS"

usage() { sed -n '/^#   tools\/job.sh/p' "$0" | cut -c3-; exit 2; }
now() { date +%s; }
mins() { echo $(( ($(now) - $(cat "$1/started")) / 60 )); }
leader() { cat "$1/pid" 2>/dev/null; }
# every process of the job, by the mark its environment carries: what a job starts inherits it, a browser that puts
# itself in a process session of its own too
# (and every process of its process session and group, the leader's, whatever its environment says; a zombie is not
# counted: it runs nothing and goes when its parent does)
procs() {
  local mark p sid st me=$$ ch=1 out=
  local -A par in
  mark=$(cat "$1/mark" 2>/dev/null) || return 0
  sid=$(leader "$1")
  # (the leader's session only while the leader is the job's: a number given again after a restart is someone else's)
  [ -n "$sid" ] && ! tr '\0' '\n' 2>/dev/null <"/proc/$sid/environ" | grep -qx "OE_JOB=$mark" && sid=
  for p in /proc/[0-9]*; do
    p=${p#/proc/}; [ "$p" = "$me" ] && continue
    st=$(cat "/proc/$p/stat" 2>/dev/null) || continue
    st=${st##*) }; set -- $st   # (state, ppid, pgrp, session: the fields after the command's name, which may hold spaces)
    [ "$1" = Z ] && continue
    par[$p]=$2
    if { [ -n "$sid" ] && { [ "$4" = "$sid" ] || [ "$3" = "$sid" ]; }; } || tr '\0' '\n' 2>/dev/null <"/proc/$p/environ" | grep -qx "OE_JOB=$mark"; then in[$p]=1; fi
  done
  # (and whatever they started, though it left their session and their environment behind)
  while [ $ch = 1 ]; do ch=0; for p in "${!par[@]}"; do [ -z "${in[$p]:-}" ] && [ -n "${in[${par[$p]}]:-}" ] && { in[$p]=1; ch=1; }; done; done
  for p in "${!in[@]}"; do out="$out $p"; done
  echo $out
}
# (a job that wrote its exit has ended, whatever holds its process number now: after a session's worker restarts the
# numbers are given again, and a job ended hours before was held to be running by a kernel thread on its old pid, which
# refused every check after it)
running() { local p; [ -f "$1/exit" ] && return 1; p=$(leader "$1") && kill -0 "$p" 2>/dev/null; }
key_of() { printf '%s\n' "$PWD" "$@" "${JOB_KEY:-}" | sha1sum | cut -c1-16; }

show_new() {   # the job's lines since the last wait
  local d=$1 n s k
  n=$(wc -l <"$d/log" 2>/dev/null || echo 0); s=$(cat "$d/seen" 2>/dev/null || echo 0)
  [ "$n" -gt "$s" ] || return 0
  k=$((n - s))
  [ "$k" -gt "$LINES_" ] && echo "  (and $((k - LINES_)) lines before these: $d/log)"
  sed -n "$((s + 1)),${n}p" "$d/log" | tail -n "$LINES_" | cut -c1-400
  echo "$n" >"$d/seen"
}

ended() {   # <dir>: tell an ended job's result, once
  local d=$1 name code
  name=$(basename "$d"); code=$(cat "$d/exit")
  show_new "$d"
  echo "job $name ended after $(( ($(stat -c %Y "$d/exit") - $(cat "$d/started")) / 60 )) min with exit $code"
  touch "$d/told"
  case "$code" in [0-9]*) return "$code" ;; *) return 1 ;; esac
}

wait_on() {   # <dir> <seconds>
  local d=$1 secs=$2 t0 name
  name=$(basename "$d"); t0=$(now)
  [ -d "$d" ] || { echo "no job $name: tools/job.sh run $name -- <command>"; return 2; }
  while :; do
    [ -f "$d/exit" ] && { ended "$d"; return; }
    if ! running "$d"; then
      sleep 1; [ -f "$d/exit" ] && { ended "$d"; return; }
      show_new "$d"
      echo "job $name died after $(mins "$d") min without an exit code: the machine or its worker restarted, or it was killed (log: $d/log)"
      echo died >"$d/exit"; touch "$d/told"; return 70
    fi
    if [ $(( $(now) - t0 )) -ge "$secs" ]; then
      show_new "$d"
      [ -f "$d/light" ] && { echo "job $name running (pid $(leader "$d")): $(cat "$d/stopcmd") stops it"; return 0; }
      echo "job $name still running after $(mins "$d") min; nothing is lost when a wait is cut off: wait again with $(cat "$d/waitcmd" 2>/dev/null || echo "tools/job.sh wait $name") (it starts nothing)"
      return 75
    fi
    sleep 5
  done
}

strays() {   # browsers on this machine that no running job started
  local p mark
  for p in $(pgrep -f 'chrom(e|ium)|headless_shell' 2>/dev/null); do
    mark=$(tr '\0' '\n' 2>/dev/null <"/proc/$p/environ" | grep '^OE_JOB=' | cut -d= -f2)
    [ -n "$mark" ] && [ -d "$JOBS/${mark%%@*}" ] && running "$JOBS/${mark%%@*}" && continue
    tr '\0' ' ' 2>/dev/null <"/proc/$p/cmdline" | grep -q -- '--type=' && continue   # (a browser's helpers: its main process is named)
    echo "$p"
  done
}

run() {
  local name=${1:-}; [ -n "$name" ] || usage; shift
  [ "${1:-}" = -- ] && shift
  [ $# -gt 0 ] || usage
  local d="$JOBS/$name" key other s
  key=$(key_of "$@")
  exec 9>"$JOBS/.lock"; flock 9
  if [ -d "$d" ] && running "$d"; then
    if [ "$(cat "$d/key")" != "$key" ]; then
      echo "job $name is running something else for $(mins "$d") min: $(cut -c1-200 "$d/cmd")"
      echo "wait on it ($(cat "$d/waitcmd")) or stop it ($(cat "$d/stopcmd")) first"
      return 4
    fi
    echo "job $name already running for $(mins "$d") min: attached, not started again"
  elif [ -d "$d" ] && [ -f "$d/exit" ] && [ ! -f "$d/told" ] && [ "$(cat "$d/key")" = "$key" ]; then
    ended "$d"; return
  else
    if [ "${JOB_PARALLEL:-0}" != 1 ]; then
      [ "${JOB_LIGHT:-0}" = 1 ] || for other in "$JOBS"/*/; do
        other=${other%/}; [ "$other" = "$d" ] || [ -f "$other/light" ] && continue
        running "$other" && { echo "job $(basename "$other") is running ($(mins "$other") min: $(cut -c1-160 "$other/cmd")): one job at a time, so that neither runs at half speed. $(cat "$other/waitcmd"), or $(cat "$other/stopcmd"), or JOB_PARALLEL=1"; return 4; }
      done
      s=$([ "${JOB_LIGHT:-0}" = 1 ] || strays | head -5 | paste -sd ' ' -)
      [ -n "$s" ] && echo "note: a browser that no job started is running (pid $s: $(tr '\0' ' ' 2>/dev/null <"/proc/${s%% *}/cmdline" | cut -c1-120)); it slows this job's clock: kill it unless it is yours and still needed"
    fi
    rm -rf "$d"; mkdir -p "$d"
    printf '%s ' "$@" >"$d/cmd"; echo "$key" >"$d/key"; now >"$d/started"; echo 0 >"$d/seen"
    echo "$name@$(now)" >"$d/mark"; [ "${JOB_LIGHT:-0}" = 1 ] && touch "$d/light"
    echo "${JOB_WAITCMD:-tools/job.sh wait $name}" >"$d/waitcmd"; echo "${JOB_STOPCMD:-tools/job.sh stop $name}" >"$d/stopcmd"
    # (forked off and in a process session of its own, so that it is no longer under the shell that asked for it: the
    # tool stops the whole tree of what it started, and a job started as a child of this script, even in a session of
    # its own, was stopped with the wait)
    OE_JOB=$(cat "$d/mark") setsid -f bash -c 'trap "" HUP; echo $$ >"$0/pid"; "$@" </dev/null; echo $? >"$0/exit"' "$d" "$@" >"$d/log" 2>&1 </dev/null 9>&-
    for _ in $(seq 50); do [ -s "$d/pid" ] && break; sleep 0.1; done
    echo "job $name started (pid $(leader "$d")): $(cut -c1-200 "$d/cmd")"
  fi
  flock -u 9
  wait_on "$d" "${JOB_WAIT:-$([ -f "$d/light" ] && echo 3 || echo 540)}"
}

stop() {
  local d="$JOBS/${1:-}" p left
  [ -n "${1:-}" ] && [ -d "$d" ] || { echo "no job ${1:-}"; return 2; }
  running "$d" || [ -n "$(procs "$d")" ] || { echo "job $1 is not running"; return 0; }
  # (held first, every process of it, until a listing finds none it had not held: a script told to stop went on starting
  # the next part, a browser, while the ones listed before were stopped, and kept going after "stopped" was said; the
  # #196 session's run, 24 November, until a browser was killed for memory. Then told to end, let go to hear it, and
  # whatever is left killed; "stopped" is said only once nothing of the job runs)
  local held= n
  for _ in $(seq 30); do
    left=$(procs "$d"); n=
    for p in $left; do case " $held " in *" $p "*) ;; *) n="$n $p" ;; esac; done
    [ -z "$n" ] && break
    kill -STOP $n 2>/dev/null; held="$held$n"
  done
  [ -n "$held" ] && { kill -TERM $held 2>/dev/null; kill -CONT $held 2>/dev/null; }
  for _ in $(seq 20); do left=$(procs "$d"); [ -z "$left" ] && break; sleep 0.5; done
  for _ in $(seq 20); do
    left=$(procs "$d"); [ -z "$left" ] && break
    kill -STOP $left 2>/dev/null; kill -KILL $left 2>/dev/null; sleep 0.5
  done
  left=$(procs "$d")
  if [ -n "$left" ]; then
    echo "job $1 NOT stopped: still running after TERM and KILL: $(for p in $left; do printf '%s (%s) ' "$p" "$(tr '\0' ' ' 2>/dev/null <"/proc/$p/cmdline" | cut -c1-60)"; done)"
    return 1
  fi
  [ -f "$d/exit" ] || echo stopped >"$d/exit"; touch "$d/told"
  echo "job $1 stopped after $(mins "$d") min: nothing of it runs"
}

status() {
  local d any=0
  for d in "$JOBS"/${1:-*}/; do
    d=${d%/}; [ -f "$d/started" ] || continue; any=1
    if [ -f "$d/exit" ]; then st="ended $(cat "$d/exit")"; elif running "$d"; then st="running"; else st="died"; fi
    printf '%-10s %-10s %4d min  %s\n            last: %s\n' "$(basename "$d")" "$st" "$( [ -f "$d/exit" ] && echo $(( ($(stat -c %Y "$d/exit") - $(cat "$d/started")) / 60 )) || mins "$d")" "$(cut -c1-120 "$d/cmd")" "$(tail -1 "$d/log" 2>/dev/null | cut -c1-160)"
  done
  [ $any = 1 ] || echo "no jobs"
  s=$(strays | paste -sd ' ' -); [ -n "$s" ] && echo "browsers no job started: $s"
  return 0
}

case "${1:-}" in
  run) shift; run "$@" ;;
  wait) [ -n "${2:-}" ] || usage; wait_on "$JOBS/$2" "${3:-${JOB_WAIT:-540}}" ;;
  status) status "${2:-}" ;;
  stop) stop "${2:-}" ;;
  log) [ -n "${2:-}" ] || usage; tail -n "${3:-40}" "$JOBS/$2/log" ;;
  *) usage ;;
esac
