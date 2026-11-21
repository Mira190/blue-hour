#!/usr/bin/env bash
# The checks to pass before work lands on main, in one command (docs/CHECKS.md). The project is one story on
# one map (Blue Hour, at the Shibuya Scramble), so there is one page to check. For what the branch changed
# against origin/main (or for the targets named) it runs:
#   static  the checks that open no browser, half a minute together:
#           - what the characters and the story say (tools/voice_check.py: locals, not the map's credits);
#           - the map's lines and quests played to the last stamp without a browser (tools/goals_check.js);
#           - the packs (buildings, landmarks, game, terrain, places, scene .bin, vis.bin, skyvis.webp and the phone's
#             district d/) made from their JSON as it is now and decoded to the same values
#             (pipeline/pack.py --check, tools/pack_check.js);
#           - the visibility sweep against exact rays (tools/vis_unit.js);
#           - the frame-time governor on modelled devices (tools/governor_unit.js);
#           - the story's guide round a held crowd and ahead of a running player (tools/guide_unit.js);
#           - the building solids valid polygons on their decimetre grid (pipeline/solid_rings.py --check);
#           - no landmark hanging in the air (tools/float_check.py), no sign or screen behind another landmark
#             (tools/sign_clear.py), no sign reading mirrored (tools/sign_check.py);
#           - nothing standing in a lift's street lobby, and its hall's posts and belts inside it (tools/lobby_check.py);
#           - the story's flight clear of the buildings, and its helicopter in every frame of its shots from one side of its
#             way (tools/flight_clear.py, tools/flight_frames.py);
#           - the far crowd's copy of the cast (pipeline/crowd_cast.py --check);
#           - every shared model meshopt-compressed and its parts up to date (pipeline/meshopt_glb.mjs, meshopt.py split);
#           - nothing that sounds made off the audio thread, outside the one place each is allowed (tools/audio_thread_check.py);
#           - three.js's vendored module with its fixes (pipeline/fetch_vendor.py --check);
#   story   the episode played frame by frame to its last card in a browser (tools/story_play.js): the street runs, the Stop
#           comes, the afterimage speaks, the photograph is taken, the world runs on, the last card, and its Walk Shibuya
#           taken up in the same night;
#   guide   the story's guide led along each frame's way with a player behind him (tools/guide_way.js): his feet on what is
#           drawn under them, down the middle of the way, and the mark pointing along the way, not as the crow flies;
#           when the guide, the routes, the walking grid or the marks change;
#   walk    the title's first way in, on a desktop's page and a phone's (tools/walk_play.js): Walk Shibuya after who you play,
#           its hour and sky as the street behind the card, out on the street with nothing of the story or the old free game,
#           SKY's hall drawn round you in its lobby; your car driven and called, SKY GATE ridden in the dark, the helicopter flown;
#   mem     the page as an iPhone on the low tier, inside the memory budget (tools/mem_check.js);
#   audio   every sound on the audio thread, as an iPhone makes it: the reverbs a phone hears against the whole convolution
#           (tools/reverb_check.js), the graph as small after every one-shot has sounded as before, and no sound begun
#           before the audio thread can take it up (tools/audio_graph_check.js), and the opening and the story's own sound
#           played as an iPhone, every convolver on the live context within WebKit's realtime limit, one context, no
#           worklet (tools/phone_audio.js);
#           when the sound changes;
#   ride    frame 6's car taken from where the flight sets you down to Hachiko, every car checked against every person
#           on every step: never one standing in someone (tools/ride_people.js); when the drivers, the cars or the crowd change;
#   clip    what passes through what in the free game, ?walk=1 (tools/clip_check.js);
#   gl      the map as an ordinary device opens it: no WebGL call refused, and every material drawn on a GPU with
#           sixteen texture units (tools/gl_error_probe.js, tools/sampler_probe.js);
#   touch   the free game played by touch on a phone's page (tools/touch_check.js);
#   astc    the device-side ASTC encoder against a real decoder (tools/astc_check.js);
#   look    the models, pictures and sounds changed, each loaded as the page loads it (every texture decoded, every
#           material drawn) and set beside itself as it was, in a still (tools/look_check.js); for a change of those
#           alone the fast tier runs this and mem, not the story (a model whose names, flags or attributes changed, as
#           tools/model_contract.py reads them, goes to the page's checks like code);
#   story1, story2, story3  the story in three parts, each on its own runner (frames 1 to 4; 5 and 6 from a late start; 7
#           and the last card from one): what "story" checks, in a third of the time; CHECK_SPLIT=1 --plan names them for "story"
#   walk1, walk2, guide1, guide2  the walk's desktop page and its phone's, the guide's ways and his body: a runner each
#   game    the free game's long scenario (tools/game_check.js: walk, talk, helicopter, car, taxi, trains). It was
#           written for the game before the story and has not been run since the cut-back, so it runs by name only.
# Prints one line per check and the time each took, and exits 1 if any failed. Logs and stills go to $CHECK_OUT.
# A browser check whose last pass in this clone read nothing that has changed since is not played again: its pass is
# kept (tools/check_cache.py, from the server's log of what the page fetched).
#   tools/check.sh                      # the fast tier: static, and story and mem when the page or the map changed;
#                                       # after a pass, only what changed since it (CHECK_FULL=1: the whole branch)
#   CHECK_CACHE=0 tools/check.sh ...    # every check played, none kept from an earlier pass
#   tools/check.sh static               # the checks that open no browser only
#   tools/check.sh story                # the story only (story mem, shibuya:clip,mem ...: several)
#   tools/check.sh all                  # static look story guide walk ride mem audio clip gl touch astc
#   tools/check.sh --plan               # print the targets a run would check, one a line, and stop
#   tools/check.sh --wait [s]           # on a session's machine a run is a job (tools/job.sh): wait on it again (540 s)
#   tools/check.sh --status | --stop    # what the run is doing; or stop it and its browsers
#   CHECK_INLINE=1 tools/check.sh ...   # played in this shell, not as a job (as on a runner, where CI is set)
#   CHECK_TIER=full tools/check.sh      # as main runs it after landing (.github/workflows/checks.yml): clip, gl and touch too
#   CHECK_BASE=<commit> tools/check.sh  # what changed since that commit, not since origin/main
#   CHECK_STATIC=0 tools/check.sh ...   # without the static checks (a runner's shard)
#   GAME_TIME=22:40 tools/check.sh clip # the free game's clock pinned to another hour (tools/pin_clock.js; live: the real clock)
set -u
cd "$(dirname "$0")/.."
MAP=shibuya
PORT=${PORT:-8870}
OUT=${CHECK_OUT:-/tmp/oe-check}
TIER=${CHECK_TIER:-fast}
# the browser checks, in the order they run: the quick ones first, so that a failure there is known in minutes
KINDS="look mem astc audio ride story story1 story2 story3 walk walk1 walk2 guide guide1 guide2 clip gl touch game"
ALL="look story guide walk ride mem audio clip gl touch astc"    # "all", and the most the full tier selects: not the game check (see above)
plan=0; [ "${1:-}" = --plan ] && { plan=1; shift; }
# On a session's machine a run is a job of the machine, not a child of the shell that asked for it (tools/job.sh;
# docs/CHECKS.md, "A run is a job"): the shell tool stops what it started after 10 to 60 minutes, and a change to the
# page checks for 40 to 60 there. The same command asked again while the run goes attaches to it and prints what it has
# done since: a run is never started twice, nor beside another job. --wait [s] waits on it again, --status and --stop.
# On a runner (CI), without setsid (macOS) or with CHECK_INLINE=1 the run is played here, in the foreground.
if [ $plan -eq 0 ] && [ -z "${CI:-}" ] && [ "${CHECK_INLINE:-0}" != 1 ] && command -v setsid >/dev/null; then
  case "${1:-}" in
    --wait) exec tools/job.sh wait check "${2:-${JOB_WAIT:-540}}" ;;
    --status) exec tools/job.sh status check ;;
    --stop) exec tools/job.sh stop check ;;
  esac
  # (the run's key is the tree and the settings it plays: after an edit it is another run, refused while this one goes)
  JOB_KEY=$( { git rev-parse HEAD; git diff HEAD --binary; git ls-files -z --others --exclude-standard | xargs -0r sha1sum
    env | grep -E '^(CHECK_|GAME_TIME=|DRAW=|AT=|GPU=|LIMIT=|FROM=|UPTO=|PORT=)' | sort; } 2>/dev/null | sha1sum | cut -c1-16)
  export JOB_KEY JOB_LINES=${JOB_LINES:-40} JOB_WAITCMD="tools/check.sh --wait" JOB_STOPCMD="tools/check.sh --stop"
  exec tools/job.sh run check -- env CHECK_INLINE=1 tools/check.sh "$@"
fi
case "${1:-}" in --wait|--status|--stop) echo "$1: no run to wait on here (on a runner, without setsid or with CHECK_INLINE=1 a run plays in the foreground)"; exit 2 ;; esac
mkdir -p "$OUT"
export NODE_PATH=${NODE_PATH:-$(npm root -g 2>/dev/null)}
# (macOS has no timeout: there a check runs for as long as it takes)
command -v timeout >/dev/null || timeout() { shift; "$@"; }

STAMP="$(git rev-parse --git-dir)/oe-check-pass$([ "$TIER" = full ] && echo -full)"   # the commit of this tier's last pass, in this clone only
stamp() { [ $# -eq 0 ] && [ -z "${CHECK_BASE:-}" ] && [ -z "$(git status --porcelain)" ] && git rev-parse HEAD >"$STAMP"; return 0; }
is_in() { printf '%s\n' $2 | grep -qx "$1"; }
# how long each target takes on this machine: its passes, a line each (kind seconds epoch), in this clone only; a target's
# time is the median of its last five, or before any, what a session's machine took in November 2026 (48 sessions' runs)
HIST="$(git rev-parse --git-dir)/oe-check-times"
eta() {
  local v n
  v=$(grep "^$1 " "$HIST" 2>/dev/null | tail -5 | cut -d' ' -f2 | sort -n); n=$(echo "$v" | grep -c .)
  [ "$n" -gt 0 ] && { echo "$v" | sed -n "$(( (n + 1) / 2 ))p"; return; }
  case $1 in static) echo 35 ;; look) echo 15 ;; astc) echo 60 ;; audio) echo 180 ;; mem) echo 200 ;; ride) echo 290 ;; clip) echo 800 ;;
    story|guide) echo 1180 ;; walk) echo 1110 ;; story1|story2|story3|walk1|walk2|guide1|guide2) echo 560 ;; game) echo 2700 ;; *) echo 600 ;; esac
}

static=0 want= base= looks=
add() { local k; for k in "$@"; do is_in "$k" "$KINDS" || { echo "unknown target: $k (targets: static $KINDS all)"; exit 2; }; is_in "$k" "$want" || want="$want $k"; done; }

if [ $# -gt 0 ]; then
  for t in "$@"; do
    case "$t" in
      all) static=1; add $ALL ;;
      static|voice) static=1 ;;
      "$MAP") add story mem clip ;;
      "$MAP":*) add $(echo "${t#*:}" | tr ',' ' ') ;;   # (the map's name before a kind, as the shards were named: shibuya:clip,mem)
      *) add $(echo "$t" | tr ',' ' ') ;;
    esac
  done
else
  if [ -n "${CHECK_BASE:-}" ]; then base=$(git rev-parse --verify -q "$CHECK_BASE^{commit}") || { echo "CHECK_BASE=$CHECK_BASE is not a commit here"; exit 2; }
  else base=$(git merge-base origin/main HEAD 2>/dev/null) || { echo "no origin/main to compare with: git fetch origin main"; exit 2; }; fi
  # After a pass, only what changed since then. A run with no targets that passes on a clean tree stamps HEAD in
  # $STAMP; when main moves on and is merged in again, everything not yet checked is in the diff from that commit.
  last=$(cat "$STAMP" 2>/dev/null)
  if [ -z "${CHECK_FULL:-}" ] && [ -z "${CHECK_BASE:-}" ] && [ -n "$last" ] && git merge-base --is-ancestor "$last" HEAD 2>/dev/null \
     && ! git merge-base --is-ancestor "$last" "$base"; then
    echo "checking what changed since the last pass, $(git log -1 --format='%h %s' "$last" | cut -c1-70) (CHECK_FULL=1 for the whole branch)" >&2
    base=$last
    # A file that is main's, as main has it (main merged in, and nothing done to it here since), is left to main's own
    # checks, which play it with this branch once it lands; only a commit they pass is published
    # (.github/workflows/pages.yml). What this branch changed since the pass, or a file both sides changed, is routed
    # as it would have been, file by file.
    frommain=1
  fi
  mains() { [ "$(git rev-parse -q --verify "HEAD:$1" 2>/dev/null)" = "$(git rev-parse -q --verify "origin/main:$1" 2>/dev/null)" ] && git diff --quiet HEAD -- "$1" 2>/dev/null && [ -z "$(git ls-files --others --exclude-standard -- "$1")" ]; }
  skipped=0
  page() { add story walk mem; [ "$TIER" = full ] && add clip gl touch; return 0; }   # the page or the map changed
  # A model, a picture or a sound: on the fast tier it is loaded and set beside itself as it was (look) and weighed on a
  # phone (mem), not played through the story, which it cannot send another way; unless it is gone, or it is a model
  # whose names, flags or attributes changed (tools/model_contract.py, after the loop), when the code may be waiting
  # for what it lost. The full tier on main plays the page for it all the same.
  looks= glbs=
  asset() {
    [ -e "$1" ] || { page; return 0; }
    looks="$looks $1"; case "$1" in *.glb) glbs="$glbs $1" ;; esac
    if [ "$TIER" = full ]; then page; add look; else add look mem; fi
  }
  # A harness, or a module harnesses share: the checks that require it (tools/check_cache.py users); on the fast tier only
  # the quickest of several, which shows the module still works, and on main all of them
  harness() {
    local u k; u=$(python3 tools/check_cache.py users "$1" | tr ' ' '\n' | grep -vx game | paste -sd ' ' -)
    [ -n "$u" ] || return 0
    if [ "$TIER" = full ] || [ "$(echo "$u" | wc -w)" -eq 1 ]; then add $u; return 0; fi
    for k in $KINDS; do is_in "$k" "$u" && { add "$k"; return 0; }; done
  }
  for f in $( { git diff --name-only "$base"; git ls-files --others --exclude-standard; } | sort -u); do
    if [ "${frommain:-0}" = 1 ] && mains "$f"; then static=1; skipped=$((skipped + 1)); continue; fi
    case "$f" in
      web/astc.js|web/astc-worker.js|tools/astc_check.js) static=1; add astc ;;
      web/data/$MAP/d/*|pipeline/district.py|tools/mem_check.js) static=1; add mem ;;   # what a phone loads
      tools/reverb_check.js|tools/phone_audio.js|tools/audio_graph_check.js|tools/audio_thread_check.py) static=1; add audio ;;
      web/game/audio.js|web/game/music.js|web/game/overture.js|web/film-score.js|web/game/trains.js|web/game/walkcalls.js) static=1; page; add audio ;;   # (the sound)
      web/game/cars.js|web/game/actors.js|web/game/game.js) static=1; page; add ride ;;   # (the drivers, the cars, the crowd)
      web/game/companion.js|web/game/route.js|web/game/nav.js|web/game/story.js|tools/guide_way.js|tools/guide_body.js|web/assets/animals/*) static=1; [ "${f#tools}" = "$f" ] && page; add guide ;;   # (the guide, the ways, the marks)
      web/data/$MAP/hero/*) static=1; page ;;   # (a hero level's ground meshes are what everyone walks on: game.js heroCover)
      web/*.glb|web/*.webp|web/*.png|web/*.jpg|web/*.jpeg|web/*.avif|web/*.ktx2) static=1; asset "$f" ;;
      web/*.mp3|web/*.ogg|web/*.m4a|web/*.wav) static=1; add audio; asset "$f" ;;
      web/*|cities/$MAP/city.json) static=1; page ;;   # (tools/story_play.js reads the city's story from city.json itself)
      tools/*.js) static=1; harness "$f" ;;
      # (the builders' sources: the page sees only what they write under web/, which is in the diff once it is built)
      cities/*|tools/*|pipeline/*|blender/*|.github/*|requirements.txt) static=1 ;;   # the checks' own plumbing and the build: the static ones
    esac
  done
  if [ -n "$glbs" ] && [ "$TIER" != full ]; then
    changed=$(python3 tools/model_contract.py "$base" $glbs | tee "$OUT/contract.txt" | grep '^CHANGED')
    if [ -n "$changed" ]; then
      echo "a model's names, flags or attributes changed, so the page's checks too: $(echo "$changed" | head -2 | cut -c9-140 | paste -sd ';' -) ($OUT/contract.txt)" >&2
      page
    elif ! is_in story "$want"; then echo "the models changed keep their names, flags and attributes ($OUT/contract.txt): loaded and weighed, not played (CHECK_TIER=full plays them)" >&2; fi
  fi
  [ "$skipped" -gt 0 ] && echo "$skipped files changed since the last pass are main's, as main has it: the static checks for them, the rest on main (CHECK_FULL=1 plays them here)" >&2
fi

if [ $plan -eq 1 ]; then   # the targets of this run, each one an argument to this script: a runner's shard
  [ $static -eq 1 ] && [ "${CHECK_STATIC:-1}" != 0 ] && echo static
  for k in $want; do
    # (a runner's plan: the story in three parts, one a runner, which together play every frame and the last card; the
    # walk a runner for each page, and the guide one for his ways and one for his body: no runner the long pole)
    if [ "${CHECK_SPLIT:-0}" = 1 ]; then case $k in story) echo story1; echo story2; echo story3 ;; walk) echo walk1; echo walk2 ;; guide) echo guide1; echo guide2 ;; *) echo "$k" ;; esac
    else echo "$k"; fi
  done
  exit 0
fi

if [ $static -eq 0 ] && [ -z "$want" ]; then
  echo "nothing to check: no change to the page, the map, the build or the checks"
  stamp "$@"
  exit 0
fi

started=
if [ -n "$want" ] && ! curl -s -o /dev/null "http://localhost:$PORT/index.html"; then
  # (its log is what each check read: tools/check_cache.py keeps a pass for as long as all of that is as it was)
  python3 -u -m http.server "$PORT" --directory web >"$OUT/server.log" 2>&1 &
  started=$!
  for _ in $(seq 50); do curl -s -o /dev/null "http://localhost:$PORT/index.html" && break; sleep 0.2; done
fi
trap '[ -n "$started" ] && kill $started 2>/dev/null' EXIT
export PORT
# the free game's clock pinned to a date and an hour (tools/pin_clock.js): the weather is a hash of the date and the
# traffic follows the hour, so a run does not depend on when it is started
export GAME_TIME=${GAME_TIME:-2026-11-02T10:00}
X=; command -v xvfb-run >/dev/null && X="xvfb-run -a"

# A change that breaks something breaks the same step every time. So when the clip or the game check fails it is run
# a second time, and the run fails only on a step that failed both times (or on a run that named none: a crash, a
# timeout). Two runs with no failed step in common print FLAKY, pass, and are listed in $OUT/flaky.txt (on main,
# .github/workflows/checks.yml adds them to the issue labelled check-flaky)
: >"$OUT/flaky.txt"
fails_of() { grep '^FAIL' "$1" 2>/dev/null | cut -c6- | sed 's/ *[(:].*//' | sort -u; }   # the failed steps' names, without their numbers
# why a run failed, in a line: its failed steps, and what the browser said (tools/browser_watch.js: the GPU process, a lost
# context, the page loaded again); or, from a harness that died with no step named, the error it died of (issue 49)
why() { { grep '^FAIL\|pageerror\|^error:\|^gpu:\|^gl: \|^page:' "$1" 2>/dev/null || grep -E '^[A-Za-z]+(\.[A-Za-z]+)+: |^[A-Za-z]*Error: ' "$1" 2>/dev/null | tail -1; } | head -${2:-2} | cut -c1-160 | paste -sd ';' -; }
twice() {   # <kind> <first log> <second log>: the verdict of the second run
  local same one two
  one=$(fails_of "$2"); two=$(fails_of "$3")
  same=$(comm -12 <(echo "$one") <(echo "$two") | grep . | head -3 | cut -c1-110 | paste -sd ';' -)
  if [ -n "$one" ] && [ -n "$two" ] && [ -z "$same" ]; then
    echo "FLAKY $1   (no step failed twice; first: $(echo "$one" | head -2 | cut -c1-90 | paste -sd ';' -); then: $(echo "$two" | head -2 | cut -c1-90 | paste -sd ';' -))" | tee -a "$OUT/flaky.txt"
  else echo "FAIL $1   (${same:-$( [ -n "$two" ] && echo "$two" | head -2 | cut -c1-110 | paste -sd ';' - || why "$3")}; see $3; the first run $2)"; fi
}
run_story() {   # on a small page: a software renderer draws the stopped world's grade slowly
  story_part story "" "" "the episode plays through its seven frames to the last card"
}
# the story in parts, one a runner (CHECK_SPLIT=1 --plan): from the title to frame 4's print, where the log has been read;
# frames 5 and 6 from a case left at frame 5; frame 7, its summation and the last card from one left at frame 7
run_story1() { story_part story1 "" 4 "frames 1 to 4 played from the title to frame 4's print"; }
run_story2() { story_part story2 4 6 "frames 5 and 6 played from a case left at frame 5"; }
run_story3() { story_part story3 6 "" "frame 7 and the last card played from a case left at frame 7"; }
story_part() {   # <name> <FROM> <UPTO> <what a pass says>
  # (and one frame in thirty drawn, without a GPU: the game moves a twentieth of a second a frame at most, so at a software
  # renderer's frame a second the story's clock ran twenty times slow and the play did not fit the hour; the frames
  # between run the game without their draw calls, and every still is of frames drawn whole, tools/story_play.js)
  local n=$1 log="$OUT/$1.log"
  if CHROME_LOG="$OUT/$n-chrome.log" FROM=$2 UPTO=$3 DRAW=${DRAW:-$([ "${GPU:-}" = metal ] && echo 0 || echo 30)} LIMIT=5400 timeout 6000 $X node tools/story_play.js "$OUT/$n" 800x500 >"$log" 2>&1; then printf 'ok   %-6s %s; %s\n' "$n" "$4" "$(grep -o 'played in [0-9]* s' "$log" | tail -1)"
  else printf 'FAIL %-6s %s   (see %s)\n' "$n" "$(why "$log")" "$log"; fi
}
run_guide() { run_guide1; run_guide2; }   # the guide along each frame's way, on a small page; and his body and the player's never in each other
run_guide1() {   # (a runner each: CHECK_SPLIT=1)
  if CHROME_LOG="$OUT/guide-chrome.log" timeout 3600 $X node tools/guide_way.js "$OUT/guide" 800x500 >"$OUT/guide.log" 2>&1; then echo "ok   guide  $(grep -c '^ok' "$OUT/guide.log") ways led: his feet on the paving drawn, down the middle, and the mark along the way"
  else echo "FAIL guide  $(why "$OUT/guide.log")   (see $OUT/guide.log)"; fi
}
run_guide2() {
  if CHROME_LOG="$OUT/guide-body-chrome.log" timeout 1800 $X node tools/guide_body.js "$OUT/guide-body" 800x500 >"$OUT/guide-body.log" 2>&1; then echo "ok   guide  $(grep -c '^ok' "$OUT/guide-body.log") ways of meeting him (sitting, at heel, leading, against a wall): his model never in the player, measured by its own vertices"
  else echo "FAIL guide  body: $(why "$OUT/guide-body.log")   (see $OUT/guide-body.log)"; fi
}
run_walk() { walk_on 800x500 390x844; }   # the walk's way in and out on the street, on a small desktop page (and the last card's fresh page) and a phone's, by touch
run_walk1() { walk_on 800x500; }          # (a runner each: CHECK_SPLIT=1)
run_walk2() { walk_on 390x844; }
walk_on() {
  local ok=1 d said=
  for d in "$@"; do
    if ! CHROME_LOG="$OUT/walk-$d-chrome.log" timeout 2400 $X node tools/walk_play.js "$OUT/walk" $d night rain >"$OUT/walk-$d.log" 2>&1; then ok=0; echo "FAIL walk   $d: $(why "$OUT/walk-$d.log")   (see $OUT/walk-$d.log)"; fi
    said="${said:+$said and }$(grep -c '^ok' "$OUT/walk-$d.log") $([ "$d" = 390x844 ] && echo "beats on a phone's page" || echo "beats on a desktop's page")"
  done
  [ $ok -eq 1 ] && echo "ok   walk   $said: two ways in, the hour and the sky, out with no story"
  return 0
}
run_ride() {   # frame 6's ride, on a small page: no car in a person on any step of the way
  if CHROME_LOG="$OUT/ride-chrome.log" LIMIT=2400 timeout 3000 $X node tools/ride_people.js "$OUT/ride" 800x500 >"$OUT/ride.log" 2>&1; then echo "ok   ride   no car in a person along frame 6's ride; $(grep -o 'mean [0-9.]* km/h moving' "$OUT/ride.log" | head -1)"
  else echo "FAIL ride   $(grep '^overlaps\|^ride \|pageerror' "$OUT/ride.log" | head -3 | cut -c1-160 | paste -sd ';' -)   (see $OUT/ride.log)"; fi
}
# the page on a phone's low tier (an iPhone emulated, quality.js lean) must stay inside the memory budget, so that
# an iPhone's tab is not killed (docs/PERFORMANCE.md, "On a phone"); and at frame 5's place, where two hero levels are
# held at once (docs/HERO.md, "Miyamasu")
run_mem() {
  if AT=${AT:-521.9,-1074.1} timeout 1800 $X node tools/mem_check.js "$MAP" >"$OUT/mem.log" 2>&1; then
    echo "ok   mem    $(grep -o 'GPU peak [0-9]* MB' "$OUT/mem.log" | head -1), $(grep -o '[0-9]* at the end after a collection' "$OUT/mem.log" | head -1) heap"
  else echo "FAIL mem    $(grep -o 'over [0-9]*' "$OUT/mem.log" | paste -sd ';' - | head -c120)   (see $OUT/mem.log)"; fi
}
# every sound on the audio thread, as an iPhone makes it (docs/SOUND.md "Every sound on the audio thread")
run_audio() {
  if timeout 900 node tools/reverb_check.js >"$OUT/reverb.log" 2>&1; then echo "ok   audio  $(grep -c '^ok' "$OUT/reverb.log") reverbs as a phone hears them, each within its tolerance of the whole convolution"
  else echo "FAIL audio  $(grep '^FAIL' "$OUT/reverb.log" | head -2 | cut -c1-160 | paste -sd ';' -)   (see $OUT/reverb.log)"; fi
  if timeout 600 node tools/audio_graph_check.js >"$OUT/audio_graph.log" 2>&1; then echo "ok   audio  the graph as small once every one-shot has sounded as before ($(grep -o '[0-9]* once they have ended' "$OUT/audio_graph.log" | head -1 | grep -o '^[0-9]*') nodes), none begun before the audio thread can take it up"
  else echo "FAIL audio  $(grep '^FAIL' "$OUT/audio_graph.log" | head -2 | cut -c1-160 | paste -sd ';' -)   (see $OUT/audio_graph.log)"; fi
  if DRAW=${DRAW:-$([ "${GPU:-}" = metal ] && echo 0 || echo 60)} timeout 1500 $X node tools/phone_audio.js 390x844 >"$OUT/phone_audio.log" 2>&1; then
    echo "ok   audio  as an iPhone: $(grep -o 'convolvers: [0-9]*, their responses [0-9]* to [0-9]* frames (the limit [0-9]*)' "$OUT/phone_audio.log" | head -1), one context, no worklet"
  else echo "FAIL audio  $(grep '^FAIL' "$OUT/phone_audio.log" | head -2 | cut -c1-160 | paste -sd ';' -)   (see $OUT/phone_audio.log)"; fi
  # (and touched first on the title: the opening's score with its own bed, and the loading cue let go)
  if FIRST=title DRAW=${DRAW:-$([ "${GPU:-}" = metal ] && echo 0 || echo 60)} timeout 1500 $X node tools/phone_audio.js 390x844 >"$OUT/phone_audio_title.log" 2>&1; then
    echo "ok   audio  as an iPhone touched first on the title: one piece of music at a time in the opening"
  else echo "FAIL audio  touched first on the title: $(grep '^FAIL' "$OUT/phone_audio_title.log" | head -2 | cut -c1-160 | paste -sd ';' -)   (see $OUT/phone_audio_title.log)"; fi
}
run_clip() {
  if CHROME_LOG="$OUT/clip-chrome.log" timeout 1800 $X node tools/clip_check.js "$MAP" 40 "$OUT/clip.json" >"$OUT/clip.log" 2>&1; then echo "ok   clip   $(grep -c '^ok' "$OUT/clip.log") measures within tolerance"; return; fi
  cp "$OUT/clip.log" "$OUT/clip-first.log"; cp "$OUT/clip-chrome.log" "$OUT/clip-first-chrome.log" 2>/dev/null
  if CHROME_LOG="$OUT/clip-chrome.log" timeout 1800 $X node tools/clip_check.js "$MAP" 40 "$OUT/clip.json" >"$OUT/clip.log" 2>&1; then echo "ok   clip   $(grep -c '^ok' "$OUT/clip.log") measures within tolerance   (the second run; the first: $OUT/clip-first.log)"
  else twice clip "$OUT/clip-first.log" "$OUT/clip.log"; fi
}
run_game() {   # (every step takes about half an hour on a software renderer)
  if timeout 2700 $X node tools/game_check.js "$MAP" "$OUT/game" >"$OUT/game.log" 2>&1; then echo "ok   game   $(grep -c '^ok' "$OUT/game.log") steps of the free game"; return; fi
  cp "$OUT/game.log" "$OUT/game-first.log"
  if timeout 2700 $X node tools/game_check.js "$MAP" "$OUT/game" >"$OUT/game.log" 2>&1; then echo "ok   game   $(grep -c '^ok' "$OUT/game.log") steps of the free game   (the second run; the first: $OUT/game-first.log)"
  else twice game "$OUT/game-first.log" "$OUT/game.log"; fi
}
run_gl() {   # the governor's extras shed from the first frame, the scene multisampled, the ladder walked, every WebGL call asked for its error
  if START=0.8/0.5 Q=msaa=on WALK=1 timeout 1800 $X node tools/gl_error_probe.js "$MAP" >"$OUT/gl.log" 2>&1; then
    echo "ok   gl     opened with the extras shed and multisampling on, the ladder walked: WebGL refused no call"
  else
    # (a refused call was found among the last few hundred: played again asking after every call, which names it and
    # where it was made, and takes most of an hour on a software renderer)
    if grep -q 'EVERY=1 names it' "$OUT/gl.log"; then cp "$OUT/gl.log" "$OUT/gl-first.log"; EVERY=1 START=0.8/0.5 Q=msaa=on WALK=1 timeout 5400 $X node tools/gl_error_probe.js "$MAP" >"$OUT/gl.log" 2>&1; fi
    echo "FAIL gl     $(grep -o '"call":"[^"]*"' "$OUT/gl.log" "$OUT/gl-first.log" 2>/dev/null | head -2 | cut -d: -f2- | cut -c9-160 | paste -sd ';' -)   (see $OUT/gl.log)"
  fi
  # the same map as a GPU with sixteen texture units in a fragment shader (Apple's, most phones'; the software
  # renderer has 32): every program that does not link there is compiled again with less until it does
  if Q=units=16 timeout 1800 $X node tools/sampler_probe.js "$MAP" >"$OUT/units.log" 2>&1; then
    echo "ok   gl     as a 16-unit GPU every material drawn$(grep -o 'goes without: .*' "$OUT/units.log" | sed 's/^/, /')"
  else echo "FAIL gl     as a 16-unit GPU a material is left undrawn: $(tail -3 "$OUT/units.log" | head -1 | cut -c1-200)   (see $OUT/units.log)"; fi
}
run_touch() {
  if timeout 1500 $X node tools/touch_check.js "$MAP" "$OUT/touch" >"$OUT/touch.log" 2>&1; then
    echo "ok   touch  $(grep -c '^ok' "$OUT/touch.log") steps on a phone's page"
  else echo "FAIL touch  $(grep '^FAIL' "$OUT/touch.log" | head -2 | cut -c6-140 | paste -sd ';' -)   (see $OUT/touch.log)"; fi
}
run_look() {   # the models, pictures and sounds changed, loaded as the page loads them and set beside themselves as they were
  # (no file named by the diff, as on a runner's shard: every one under web/assets and the hero levels, decoded)
  if LOOK_BASE=${base:-} CHROME_LOG="$OUT/look-chrome.log" timeout 1200 $X node tools/look_check.js "$OUT/look" $looks >"$OUT/look.log" 2>&1; then
    echo "ok   look   $(tail -1 "$OUT/look.log" | sed 's/: all loaded$//')"
  else echo "FAIL look   $(grep '^FAIL' "$OUT/look.log" | head -2 | cut -c6-160 | paste -sd ';' -)   (see $OUT/look.log)"; fi
}
run_astc() {   # SwiftShader decodes ASTC; Mesa's llvmpipe offers none, so without a display
  if timeout 600 env -u DISPLAY node tools/astc_check.js >"$OUT/astc.log" 2>&1; then
    echo "ok   astc   $(grep -c '^ok' "$OUT/astc.log") pictures encoded on the page and decoded by the GPU, none under the floor"
  else echo "FAIL astc   $(grep '^FAIL' "$OUT/astc.log" | head -2 | cut -c6-140 | paste -sd ';' -)   (see $OUT/astc.log)"; fi
}
# one static check: <name> <log> <what a pass says, or - for the log's last line> <the lines of a failure to show> <command...>
st() {
  local name=$1 log="$OUT/$2.log" ok=$3 pat=$4; shift 4
  if "$@" >"$log" 2>&1; then [ "$ok" = - ] && tail -1 "$log" || printf 'ok   %-8s %s\n' "$name" "$ok"
  else printf 'FAIL %-8s %s   (see %s)\n' "$name" "$(grep -E "$pat" "$log" | head -2 | cut -c1-150 | paste -sd ';' -)" "$log"; fi
}
parts() {   # the parts of the shared models loaded before playable and after, as their model splits now
  local p dir
  rm -rf "$OUT/parts"; mkdir -p "$OUT/parts"
  python3 pipeline/meshopt.py split web/assets/vehicles/cars.glb web/assets/trees/trees.glb --out "$OUT/parts" || return 1
  for p in "$OUT"/parts/*.glb; do
    case $(basename "$p") in cars*) dir=vehicles ;; *) dir=trees ;; esac
    cmp -s "$p" "web/assets/$dir/$(basename "$p")" || { echo "FAIL $(basename "$p") is not its model's part: python3 pipeline/meshopt.py split web/assets/$dir/<model>.glb"; return 1; }
  done
}

# One browser check, or its pass kept: when everything it read at its last pass in this clone (the files the page
# fetched, by the server's log; its harness; its settings) is byte for byte as it is now, it would play the same page
# (tools/check_cache.py). CHECK_CACHE=0 or CHECK_FULL=1 plays it all the same; the full tier on main keeps nothing.
cache_on() { [ "${CHECK_CACHE:-1}" != 0 ] && [ -z "${CHECK_FULL:-}" ] && [ "$TIER" != full ]; }
run_one() {
  local k=$1 t0 n0=0 hit res
  # (what this script does for it is in the key too: the target's function and the helpers it calls, not the rest)
  CHECK_FN=$(declare -f "run_$k" story_part walk_on twice why fails_of | sha1sum | cut -c1-16) && export CHECK_FN
  if cache_on && hit=$(python3 tools/check_cache.py hit "$k"); then
    printf 'ok   %-6s kept from its pass at %s: nothing it read has changed since (CHECK_CACHE=0 plays it again)\n' "$k" "$hit"
    return 0
  fi
  t0=$(date +%s); [ -n "$started" ] && n0=$(wc -l <"$OUT/server.log")
  echo "... $k from $(date +%H:%M), about $(( ($(eta "$k") + 30) / 60 )) min here" >&2
  res=$("run_$k"); echo "$res"
  echo "$k $(( $(date +%s) - t0 ))" >>"$OUT/times.txt"
  echo "$res" | grep -q '^FAIL\|^FLAKY' || echo "$k $(( $(date +%s) - t0 )) $(date +%s)" >>"$HIST"
  if echo "$res" | grep -q '^FAIL\|^FLAKY'; then python3 tools/check_cache.py drop "$k"
  elif [ -n "$started" ] && cache_on; then python3 tools/check_cache.py save "$k" "$OUT/server.log" "$n0" "$t0" "$(( $(date +%s) - t0 ))"; fi
}
: >"$OUT/times.txt"
# what this run plays and how long that takes here (a pass kept from the cache costs nothing)
{ total=0; said=
  [ $static -eq 1 ] && [ "${CHECK_STATIC:-1}" != 0 ] && { total=$(eta static); said=static; }
  for k in $KINDS; do
    is_in "$k" "$want" || continue
    if cache_on && CHECK_FN=$(declare -f "run_$k" story_part walk_on twice why fails_of | sha1sum | cut -c1-16) python3 tools/check_cache.py hit "$k" >/dev/null 2>&1; then said="$said $k(kept)"; else total=$((total + $(eta "$k"))); said="$said $k"; fi
  done
  echo "checks: ${said# }: about $(( (total + 30) / 60 )) min on this machine" >&2; }
{
  t_static=$(date +%s)
  if [ $static -eq 1 ] && [ "${CHECK_STATIC:-1}" != 0 ]; then
    st voice voice - '^FAIL' python3 tools/voice_check.py
    st goals goals - '^FAIL' node tools/goals_check.js
    st pack pack "the packs up to date" '^FAIL' python3 pipeline/pack.py --check
    st pack pack_decode "the packs decode to their JSON" '^FAIL|Error' node tools/pack_check.js
    st vis vis "the sweep hides nothing an exact ray reaches" '^FAIL|Error' env EYES=12 node tools/vis_unit.js
    st governor governor "a device at its limit settles, gives way and comes back" '^FAIL' node tools/governor_unit.js
    st guide guide "the guide goes round a held crowd and keeps in front of a run" '^FAIL' node tools/guide_unit.js
    st rings rings "the solids valid on their grid" '^FAIL|Error' python3 pipeline/solid_rings.py --check "$MAP"
    st float float "every landmark stands on something" '^FLOATS|Error' python3 tools/float_check.py "$MAP"
    st signs signclear "no sign or screen behind another landmark" '^COVERED|Error' python3 tools/sign_clear.py "$MAP"
    st lobby lobby "nothing stands in a lift's lobby, its hall's posts and belts inside it" '^FAIL|Error' python3 tools/lobby_check.py "$MAP"
    st signs signs "every sign reads the right way round" '^[^o]' python3 tools/sign_check.py "$MAP"
    st flight flight "the story's flight clears the buildings" 'too close|Error' python3 tools/flight_clear.py "$MAP"
    st flight flight_frames "the story's flight in every frame of its shots, from one side of it and clear of the buildings" '^FAIL|Error' python3 tools/flight_frames.py "$MAP"
    st crowd crowd_cast - '^FAIL|Error' python3 pipeline/crowd_cast.py --check
    st meshopt meshopt - '^FAIL|Error' node pipeline/meshopt_glb.mjs --check web/assets/*/*.glb
    st parts parts "the parts of the shared models up to date" '^FAIL|Error' parts
    st audio audio_thread - '^FAIL' python3 tools/audio_thread_check.py
    st vendor vendor "three.js carries its fixes (an ImageBitmap made smaller sent unturned)" '^FAIL|Error' python3 pipeline/fetch_vendor.py --check
    echo "static $(( $(date +%s) - t_static ))" >>"$OUT/times.txt"; echo "static $(( $(date +%s) - t_static )) $(date +%s)" >>"$HIST"
  fi
  for k in $KINDS; do is_in "$k" "$want" && run_one "$k"; done
  [ -s "$OUT/times.txt" ] && echo "time: $(awk '{ printf "%s%s %d s", (NR > 1 ? ", " : ""), $1, $2; t += $2 } END { printf "; %d min in all", (t + 30) / 60 }' "$OUT/times.txt")"
} | tee "$OUT/summary.txt"
grep -q '^FAIL' "$OUT/summary.txt" && exit 1
stamp "$@"
