#!/bin/bash
# One frame of the story on the desktop's page, counted against its budget as tools/check.sh's story part counts it
# (tools/story_play.js BUDGET, 800 x 500, no stills, no frame drawn between them), at the code checked out now:
#   tools/job.sh run beat -- tools/beat_one.sh <frame from 1> <out.jsonl> [desktop|phone]
# then python3 tools/beat_budget.py show <out.jsonl>. To compare two commits, check each out and run it again.
f=${1:?frame}; out=${2:?out.jsonl}; tier=${3:-desktop}; d=$(mktemp -d)
if [ "$tier" = phone ]; then
  CHROME_LOG=$d/chrome.log BUDGET="$out" PHONE=1 DPR=3 TIER=low FROM=$((f-1)) UPTO=$f STILLS=0 DRAW=1000 LIMIT=3000 xvfb-run -a node tools/story_play.js $d 390x844 > $d/log 2>&1
else
  CHROME_LOG=$d/chrome.log BUDGET="$out" FROM=$((f-1)) UPTO=$f STILLS=0 DRAW=1000 LIMIT=3000 xvfb-run -a node tools/story_play.js $d 800x500 > $d/log 2>&1
fi
echo "exit $? (log $d/log)"; tail -2 $d/log
