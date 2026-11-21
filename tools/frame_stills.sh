#!/usr/bin/env bash
# Stills of some of the story's frames on a desktop (1440x900, the high tier) and a phone (390x844, the low tier), for a
# before and after of a visual change (AGENTS.md, "Checking your own work"): each play is tools/story_play.js.
#   tools/job.sh run stills -- tools/frame_stills.sh OUT "3 5" "1 2"     # FROM UPTO pairs; OUT/<from>-<upto>-desktop, -phone
# Needs the page served on 8800. SCREENS="desktop" or "phone" plays one of the two.
set -u
OUT=$1; shift
X=""; [ -z "${DISPLAY:-}" ] && X="xvfb-run -a"
rc=0
for pair in "$@"; do
  set -- $pair
  for screen in ${SCREENS:-desktop phone}; do
    case $screen in desktop) size=1440x900 tier=high ;; *) size=390x844 tier=low ;; esac
    d="$OUT/$1-$2-$screen"; mkdir -p "$d"
    if TIER=$tier FROM=$1 UPTO=$2 DRAW=${DRAW:-30} LIMIT=3000 timeout 3300 $X node tools/story_play.js "$d" $size >"$d/play.log" 2>&1
    then echo "ok   frames $1..$2 $screen: $(ls "$d" | grep -c jpg) stills"
    else echo "FAIL frames $1..$2 $screen: $(tail -1 "$d/play.log" | cut -c1-200)"; rc=1; fi
  done
done
exit $rc
