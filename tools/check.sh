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
#           - the ground graded by the method as it is: the streets level across, the lots between them stretched from
#             the streets, the roads' cross-falls and creases within their limits (pipeline/street_ground.py --check);
#           - what is built stands on that ground by rule (tools/levels_check.py, docs/LEVELS.md): every run of a wall,
#             a fence or a hoarding level-topped and stepped at its posts with its feet in the ground, no tooth in any
#             landmark's top, every building's base on the lowest ground along its walls, no paved ground steeper than
#             a street beyond the budget;
#           - no landmark hanging in the air (tools/float_check.py), no sign or screen behind another landmark
#             (tools/sign_clear.py), no sign reading mirrored or turned to a wall (tools/sign_check.py), no vehicle's
#             name mirrored (tools/decal_check.js);
#           - nothing standing in a lift's street lobby, and its hall's posts and belts inside it (tools/lobby_check.py);
#           - the story's flight clear of the buildings, and its helicopter in every frame of its shots from one side of its
#             way (tools/flight_clear.py, tools/flight_frames.py);
#           - the far crowd's copy of the cast (pipeline/crowd_cast.py --check);
#           - every shared model meshopt-compressed and its parts up to date (pipeline/meshopt_glb.mjs, meshopt.py split);
#           - nothing that sounds made off the audio thread, outside the one place each is allowed (tools/audio_thread_check.py);
#           - no place the story sends the player to stand inside one of its people or its things (tools/standpoints.py);
#           - the credits: every shipped work with its licence text, the fonts' OFL, the map's sources beside the README's,
#             a link's picture and its tags, the version's repository, the three ways to the Credits (tools/credits_check.py);
#           - three.js's vendored module with its fixes (pipeline/fetch_vendor.py --check);
#           - the rules by which a check's pass is kept though a file it read changed (tools/reach_unit.py);
#           - the seams between the page's parts: each asks another only for what its contract offers (tools/seams.py),
#             and the people's models give what the page asks of them (tools/people_contract.py);
#   story   the episode played frame by frame to its last card in a browser (tools/story_play.js): the street runs, the Stop
#           comes, the afterimage speaks, the photograph is taken, the world runs on, the last card, and its Walk Shibuya
#           taken up in the same night;
#   guide   the story's guide led along each frame's way with a player behind him (tools/guide_way.js): his feet on what is
#           drawn under them, down the middle of the way, and the mark pointing along the way, not as the crow flies;
#           when the guide, the routes, the walking grid or the marks change;
#   walk    the title's first way in, on a desktop's page and a phone's (tools/walk_play.js): Walk Shibuya after who you play,
#           its hour and sky as the street behind the card, out on the street with nothing of the story or the old free game,
#           SKY's hall drawn round you in its lobby; your car driven and called, SKY GATE ridden in the dark, the helicopter flown;
#   mem     the page as an iPhone on the low tier, inside the memory budget (tools/mem_check.js), and its memory loop
#           through a lost context (tools/glcare_phone.js);
#   budget  the episode played as an iPhone, every still's frame counted: each beat within a phone's budget of draws,
#           triangles, passes, pixels and GPU memory (tools/beat_budget.py; the story counts the desktop's as it plays);
#           before landing in the story's three parts, budget1 to budget3, each where the change reaches it;
#   audio   every sound on the audio thread, as an iPhone makes it: the reverbs a phone hears against the whole convolution
#           (tools/reverb_check.js), the graph as small after every one-shot has sounded as before, and no sound begun
#           before the audio thread can take it up (tools/audio_graph_check.js), and the opening and the story's own sound
#           played as an iPhone, every convolver on the live context within WebKit's realtime limit, one context, no
#           worklet (tools/phone_audio.js);
#           when the sound changes;
#   roads   the road plan in the game (docs/ROADS.md, issue 167): the traffic watched for three minutes from two kerbs
#           (none made on a quiet street, at a wall or within 120 m, buses on bus streets, no vehicle inside another,
#           none stood for good: tools/road_traffic_watch.js) and the walk's drive to 109 on the autopilot from three
#           starts (tools/road_drive.js); when the traffic, the drivers, the junctions or the plan change. The plan
#           itself is held with the static checks (pipeline/road_plan.py --check)
#   ride    frame 6's car taken from where the flight sets you down to Hachiko, every car checked against every person
#           on every step: never one standing in someone (tools/ride_people.js); when the drivers, the cars or the crowd change;
#   clip    what passes through what in the free game, ?walk=1 (tools/clip_check.js);
#   gl      the map as an ordinary device opens it: no WebGL call refused, and every material drawn on a GPU with
#           sixteen texture units (tools/gl_error_probe.js, tools/sampler_probe.js);
#   touch   the free game played by touch on a phone's page (tools/touch_check.js);
#   astc    the device-side ASTC encoder against a real decoder (tools/astc_check.js), and the BC7 and BC5 one (tools/bc_check.py);
#   hold    every avatar the street casts through every clip it holds something in: no forearm, hand or held thing inside
#           its own torso, and no jerk from moving it out (tools/hold_check.js); when the people or their models change;
#   launch  what a player who comes back meets (tools/launch_check.js, issue 116): the site as two commits, the second
#           loaded in a browser whose cache holds the first, and every file it used the second's; a start that fails
#           saying so on a desktop and a phone; a case kept by another build of the story not taken up; storage full;
#           the page's storage keys its own; when the page's loading, the story's save, the stamp or the hosts' rules change;
#   look    the models, pictures and sounds changed, each loaded as the page loads it (every texture decoded, every
#           material drawn) and set beside itself as it was, in a still (tools/look_check.js); for a change of those
#           alone the fast tier runs this and mem, not the story (a model whose names, flags or attributes changed, as
#           tools/model_contract.py reads them, goes to the page's checks like code);
#   story1, story2, story3  the story in three parts, each on its own runner (frames 1 to 4; 5 and 6 from a late start; 7
#           and the last card from one): what "story" checks, in a third of the time; CHECK_SPLIT=1 --plan names them for "story"
#   storyp  the story on a phone's page by touch (390 x 844, the low tier): every answer, line, camera, release, hint, roll
#           and card a tap where the thing is on the screen; one that cannot be tapped fails (TOUCH=1, issue 120)
#   storyl  the story down its losing branches, as the man: seen through at frames 3, 5 and 6 and told at 7, the false
#           solution said aloud and the lecturer named, frame 5 spent, and frame 3 gone back into from the last card
#           (PLAYER=M SLIP=3,5,6,7 CHOOSE=3:0,4:0 SPEND=5 BACKTO=3). Both on main's full tier only, a runner each
#   walk1, walk2, guide1, guide2  the walk's desktop page and its phone's, the guide's ways and his body: a runner each
#   game    the free game's long scenario (tools/game_check.js: walk, talk, helicopter, car, taxi, trains). It was
#           written for the game before the story and has not been run since the cut-back, so it runs by name only.
# Prints one line per check and the time each took, and exits 1 if any failed. Logs and stills go to $CHECK_OUT.
# A browser check whose last pass in this clone read nothing that has changed since is not played again: its pass is
# kept (tools/check_cache.py, from the server's log of what the page fetched).
#   tools/check.sh                      # the fast tier: static, and story, walk1 and mem when the page or the map changed;
#                                       # after a pass, only what changed since it (CHECK_FULL=1: the whole branch)
#   CHECK_CACHE=0 tools/check.sh ...    # every check played, none kept from an earlier pass
#   tools/check.sh static               # the checks that open no browser only
#   tools/check.sh story                # the story only (story mem, shibuya:clip,mem ...: several)
#   tools/check.sh all                  # static look hold launch story storyp storyl budget guide walk ride mem audio clip gl touch astc
#   tools/check.sh --plan               # print the targets a run would check, one a line, and stop
#   tools/check.sh --wait [s]           # on a session's machine a run is a job (tools/job.sh): wait on it again (540 s)
#   tools/check.sh --status | --stop    # what the run is doing; or stop it and its browsers
#   CHECK_INLINE=1 tools/check.sh ...   # played in this shell, not as a job (as on a runner, where CI is set)
#   CHECK_TIER=full tools/check.sh      # as main runs it after landing (.github/workflows/checks.yml): clip, gl and touch too
#   CHECK_BASE=<commit> tools/check.sh  # what changed since that commit, not since origin/main
#   CHECK_STATIC=0 tools/check.sh ...   # without the static checks (a runner's shard)
#   CHECK_LANES=1 tools/check.sh ...    # one browser check at a time (by default as many side by side as the cores and the memory allow)
#   CHECK_SHARED=0 tools/check.sh ...   # without main's passes: only this clone's own are kept
#   CHECK_STORE=dir tools/check.sh ...  # each pass kept in that folder, on any tier (a runner's, for main's passes to share)
#   GAME_TIME=22:40 tools/check.sh clip # the free game's clock pinned to another hour (tools/pin_clock.js; live: the real clock)
set -u
cd "$(dirname "$0")/.."
MAP=shibuya
PORT=${PORT:-8870}
OUT=${CHECK_OUT:-/tmp/oe-check}
TIER=${CHECK_TIER:-fast}
# the browser checks, in the order they run: the quick ones first, so that a failure there is known in minutes
KINDS="look hold launch mem astc audio ride roads story story1 story2 story3 budget budget1 budget2 budget3 storyp storyl walk walk1 walk2 guide guide1 guide2 clip gl touch game"
ALL="look hold launch story storyp storyl budget guide walk ride roads mem audio clip gl touch astc"    # "all", and the most the full tier selects: not the game check (see above)
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
# main's passes, for the checks this clone has no pass of (tools/check_cache.py passes): asked for once a run, and gone without when the remote does not answer
[ -z "${CI:-}" ] && [ "${CHECK_SHARED:-1}" != 0 ] && [ $plan -eq 0 ] && timeout 20 git fetch -q origin check-passes 2>/dev/null
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
  case $1 in static) echo 35 ;; look) echo 15 ;; hold) echo 60 ;; astc) echo 60 ;; launch) echo 480 ;; audio) echo 500 ;; mem) echo 200 ;; ride) echo 290 ;; roads) echo 600 ;; clip) echo 800 ;;
    story|guide) echo 1180 ;; storyp) echo 800 ;; storyl) echo 1500 ;; budget) echo 1900 ;; walk) echo 1110 ;; story1|story2|story3|walk1|walk2|guide1|guide2) echo 560 ;; budget1|budget2|budget3) echo 300 ;; game) echo 2700 ;; *) echo 600 ;; esac
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
  # the page or the map changed. On the fast tier the walk's desktop page only (walk1, 9 minutes of its 18), its phone's
  # (walk2) for what a phone alone runs, below: in the sessions of 18 to 21 November the phone's page failed twice, both
  # times beside the desktop's, and found nothing it did not (issue 95). Main's full tier plays both, and touch.
  # (the story in its three parts on the fast tier: side by side where the machine has the cores and the memory, each
  # kept or played by itself, so that a change only frame 7 runs plays frame 7; docs/CHECKS.md, "Checks by reach")
  page() { if [ "$TIER" = full ]; then add story storyp storyl budget walk mem clip gl touch launch; else add story1 story2 story3 budget1 budget2 budget3 walk1 mem; fi; return 0; }   # (launch on main: a request any script makes without its file's hash)
  # A model, a picture or a sound: on the fast tier it is loaded and set beside itself as it was (look) and weighed on a
  # phone (mem), not played through the story, which it cannot send another way; unless it is gone, or it is a model
  # whose names, flags or attributes changed (tools/model_contract.py, after the loop), when the code may be waiting
  # for what it lost. The full tier on main plays the page for it all the same.
  looks= glbs=
  asset() {
    [ -e "$1" ] || { page; return 0; }
    looks="$looks $1"; case "$1" in *.glb) glbs="$glbs $1" ;; esac
    if [ "$TIER" = full ]; then page; add look; else add look mem; counted "$1"; fi
  }
  # What a beat draws (issue 131, after issue 162: a beat one model heavier was found on main, by its full tier's
  # phone, and main was red for everyone). A model or a picture cannot send the story another way, and can cost a
  # beat more draws, triangles and memory: so the story's parts are asked for with it, on a phone's tier (budget1 to
  # budget3) and the desktop's (the story's parts count their beats as they play), and the cache keeps each part that
  # never fetched the file (tools/check_cache.py counted()): a model only frame 7 loads plays frame 7, twice.
  counted() { case "$1" in *.mp3|*.ogg|*.m4a|*.wav) ;; *) add story1 story2 story3 budget1 budget2 budget3 ;; esac; return 0; }
  # A harness, or a module harnesses share: the checks that require it (tools/check_cache.py users); on the fast tier only
  # the quickest of several, which shows the module still works, and on main all of them
  harness() {
    local u k one; u=$(python3 tools/check_cache.py users "$1" | tr ' ' '\n' | grep -vx game | paste -sd ' ' -)
    [ -n "$u" ] || return 0
    one=$(echo "$u" | wc -w)
    # (on the fast tier the story in its parts and the walk's desktop page, as for a change to the page)
    [ "$TIER" = full ] || u=$(echo " $u " | sed 's/ story / story1 story2 story3 /; s/ budget / budget1 budget2 budget3 /; s/ walk / walk1 /' | xargs)
    if [ "$TIER" = full ] || [ "$one" -eq 1 ]; then add $u; return 0; fi
    for k in $KINDS; do is_in "$k" "$u" && { add "$k"; return 0; }; done
  }
  for f in $( { git diff --name-only "$base"; git ls-files --others --exclude-standard; } | sort -u); do
    if [ "${frommain:-0}" = 1 ] && mains "$f"; then static=1; skipped=$((skipped + 1)); continue; fi
    case "$f" in
      web/astc.js|web/astc-worker.js|tools/astc_check.js|web/bc7.js|tools/bc_check.py|tools/bc_encode.js) static=1; add astc launch mem ;;
      web/game/people.js|web/game/lineup.html|tools/hold_check.js|tools/hold_depth.js) static=1; [ "${f#tools}" = "$f" ] && page; add hold ;;   # (the arms out of the body over the clips)
      # (how the page is loaded, kept and published: issue 116)
      vercel.json|tools/stamp.js|tools/vercel_build.sh|.github/workflows/pages.yml|tools/launch_check.js) static=1; add launch ;;
      web/index.html|web/world.js|web/gltf.js|web/pack.js|web/pack-worker.js|web/bvh-worker.js|web/visibility.js|web/visibility-worker.js|web/tex.js|web/version.js|web/telemetry.js) static=1; page; add launch ;;
      web/data/$MAP/d/*) static=1; add mem walk2; [ "$TIER" = full ] || add budget1 budget2 budget3 ;;   # what a phone loads, and plays its walk in
      pipeline/district.py|tools/mem_check.js|tools/load_tex.js|tools/lost_check.js|tools/killed_check.js|tools/ctx_beats.js|web/lifeline.js) static=1; add mem ;;
      web/quality.js|web/onboard.js) static=1; page; add walk2 ;;   # (what a phone alone runs: its tier, the tour's touch words)
      tools/reverb_check.js|tools/phone_audio.js|tools/audio_graph_check.js|tools/audio_shed_check.js|tools/snd_probe_check.js|tools/snd_guard_check.js|tools/opening_audio.js|tools/sound_places.js|tools/audio_thread_check.py) static=1; add audio ;;
      web/game/audio.js|web/game/music.js|web/game/overture.js|web/film-score.js|web/game/trains.js|web/game/walkcalls.js) static=1; page; add audio ;;   # (the sound)
      web/game/cars.js|web/game/actors.js) static=1; page; add ride roads ;;   # (the drivers, the cars, the crowd; and where the traffic is made and goes)
      web/game/game.js) static=1; page; add ride ;;
      web/game/junctions.js|web/game/trips.js|web/game/rides.js|web/game/pilot.js|web/game/autopilot.js|cities/$MAP/road_plan.json|cities/$MAP/road_measured.json|cities/$MAP/roads_osm.json|pipeline/road_plan.py|cities/$MAP/rail.py|cities/$MAP/road_surface.json|cities/$MAP/bus_lines.json|pipeline/road_width.py|pipeline/road_survey.py|pipeline/bus_lines.py|pipeline/road_routes.py) static=1; [ "${f#web}" != "$f" ] && page; add roads ;;   # (the road plan and what drives by it)
      web/game/companion.js|web/game/route.js|web/game/nav.js|web/game/story.js|tools/guide_way.js|tools/guide_body.js|web/assets/animals/*) static=1; [ "${f#tools}" = "$f" ] && page; add guide; [ "$f" = web/game/story.js ] && add launch ;;   # (the guide, the ways, the marks; the story's save)
      # The people's models, their clips and their index, behind their contract (contracts/people.json, held by
      # tools/people_contract.py with the static checks): a model or a whole set replaced by one that gives what the page
      # asks of it is loaded, looked at and weighed, and the story is not played, whatever its nodes are called
      web/assets/people/*) static=1; if [ "$TIER" = full ]; then page; add look hold; else add look mem hold; counted "$f"; fi
        case "$f" in *.glb|*.webp|*.png|*.jpg) [ -e "$f" ] && looks="$looks $f" ;; esac ;;
      # (a hero level's ground meshes are what everyone walks on, game.js heroCover: where they lie is in the model's
      # contract, tools/model_contract.py, so a level rebuilt with its ground and its names as they were is looked at and
      # weighed like any model, and one whose ground moved is played)
      web/data/$MAP/hero/*.glb) static=1; asset "$f" ;;
      web/data/$MAP/hero/*) static=1; page ;;
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
      echo "a model's names, flags, attributes or ground changed, so the page's checks too: $(echo "$changed" | head -2 | cut -c9-140 | paste -sd ';' -) ($OUT/contract.txt)" >&2
      page
      # (ground moved: the guide led along his ways, his feet measured against what is drawn under them. A forecourt's
      # planks carried on under a deck left him 7.7 cm in the air on frame 6's way, found on main, issue 155)
      echo "$changed" | grep -q '\[ground\]' && add guide1
    elif ! is_in story1 "$want"; then echo "the models changed keep their names, flags, attributes and ground ($OUT/contract.txt): loaded and weighed, not played (CHECK_TIER=full plays them)" >&2; fi
  fi
  is_in walk "$want" && want=$(printf '%s\n' $want | grep -vx 'walk1\|walk2' | paste -sd ' ' -)   # (both pages already)
  [ "$skipped" -gt 0 ] && echo "$skipped files changed since the last pass are main's, as main has it: the static checks for them, the rest on main (CHECK_FULL=1 plays them here)" >&2
fi

if [ $plan -eq 1 ]; then   # the targets of this run, each one an argument to this script: a runner's shard
  [ $static -eq 1 ] && [ "${CHECK_STATIC:-1}" != 0 ] && echo static
  for k in $want; do
    # (a runner's plan: the story in three parts, one a runner, which together play every frame and the last card; the
    # walk a runner for each page, and the guide one for his ways and one for his body: no runner the long pole)
    # (and the story whole on a runner of its own: a case carried in one page from frame 4 to 5 and from 6 to 7, which the
    # fast tier, playing the parts, no longer plays before landing)
    if [ "${CHECK_SPLIT:-0}" = 1 ]; then case $k in story) echo story1; echo story2; echo story3; echo story ;; budget) echo budget1; echo budget2; echo budget3; echo budget ;; walk) echo walk1; echo walk2 ;; guide) echo guide1; echo guide2 ;; *) echo "$k" ;; esac
    else echo "$k"; fi
  done
  exit 0
fi

if [ $static -eq 0 ] && [ -z "$want" ]; then
  echo "nothing to check: no change to the page, the map, the build or the checks"
  stamp "$@"
  exit 0
fi

# Lanes: the browser checks side by side, as many as the machine has cores and memory for (CHECK_LANES=n; on a runner
# one, a target a runner). A check's page takes one core for its script and, drawing, the software renderer's threads,
# and 5 to 6 GB with the map loaded at a desktop's tier: three side by side on a session's 16 GB had one killed for
# memory, two play (docs/CHECKS.md, "The checks faster"). Each lane has its own server, so that its log is what its
# check read, and the renderer is held to its share of the cores (LP_NUM_THREADS).
lanes() {
  local n l; n=$(nproc 2>/dev/null || echo 2)
  l=$(( $(awk '/MemAvailable/ { print int($2 / 1048576) }' /proc/meminfo 2>/dev/null || echo 6) / 6 ))
  [ "$l" -gt $((n / 2)) ] && l=$((n / 2)); [ "$l" -lt 1 ] && l=1; echo "$l"
}
L=${CHECK_LANES:-$([ -n "${CI:-}" ] && echo 1 || lanes)}
[ "$(echo $want | wc -w)" -lt "$L" ] && L=$(echo $want | wc -w); [ "$L" -lt 1 ] && L=1
started=
if [ -n "$want" ] && ! curl -s -o /dev/null "http://localhost:$PORT/index.html"; then
  # (its log is what each check read: tools/check_cache.py keeps a pass for as long as all of that is as it was)
  for i in $(seq 0 $((L - 1))); do
    python3 -u -m http.server "$((PORT + i))" --directory web >"$OUT/server-$i.log" 2>&1 &
    started="$started $!"
  done
  for _ in $(seq 50); do curl -s -o /dev/null "http://localhost:$((PORT + L - 1))/index.html" && break; sleep 0.2; done
else L=1; fi
trap '[ -n "$started" ] && kill $started 2>/dev/null' EXIT
export PORT
PORT0=$PORT
[ "$L" -gt 1 ] && export LP_NUM_THREADS=${LP_NUM_THREADS:-$(( $(nproc) / L ))}
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
  # On the fast tier no still is taken and no frame drawn between them (STILLS=0, DRAW=1000): the check reads the story's
  # state, and a play spent half its time drawing what nothing looked at, 187 stills at 2.1 s and one frame in thirty
  # (issue 131). The photographs the story takes are drawn as ever, and every still's frame is counted all the same
  # (BUDGET: each beat it played against the desktop's budget, tools/beat_budget.py): asked for whole and its calls
  # counted, not rasterised. Main's full tier takes the stills and draws one frame in thirty, as the budgets were
  # measured, and its pictures are in a failed run's artifacts. STILLS=1 DRAW=30 tools/check.sh story3: a part so here.
  local still=${STILLS:-$([ "$TIER" = full ] && echo 1 || echo 0)} draw=${DRAW:-$([ "${GPU:-}" = metal ] && echo 0 || { [ "$TIER" = full ] && echo 30 || echo 1000; })}
  if CHROME_LOG="$OUT/$n-chrome.log" BUDGET="$OUT/$n-budget.jsonl" FROM=$2 UPTO=$3 STILLS=$still DRAW=$draw LIMIT=5400 timeout 6000 $X node tools/story_play.js "$OUT/$n" 800x500 >"$log" 2>&1; then
    printf 'ok   %-6s %s; %s\n' "$n" "$4" "$(grep -o 'played in [0-9]* s' "$log" | tail -1)"
    beats_of "$n" desktop "$OUT/$n-budget.jsonl"
  else printf 'FAIL %-6s %s   (see %s%s)\n' "$n" "$(why "$log")" "$log" "$([ "$still" = 0 ] && echo "; STILLS=1 DRAW=30 tools/check.sh $n for its pictures")"; fi
}
# a play's beats against their budgets (docs/PERFORMANCE.md, "A budget for every beat"); the play's counts are kept in
# this clone, so that a budget changed later is held against them while the play itself is kept (budgets_kept)
BUDGETS="$(git rev-parse --git-dir)/oe-budget"
beats_of() {   # <target> <desktop|phone> <the play's counts>
  mkdir -p "$BUDGETS"; cp "$3" "$BUDGETS/$1-$2.jsonl"
  if python3 tools/beat_budget.py check "$3" "$2" --map "$MAP" >"$OUT/$1-budget.txt" 2>&1; then printf 'ok   %-6s %s beats within the %s budget\n' "$1" "$(grep -c '^ok' "$OUT/$1-budget.txt")" "$2"
  else printf 'FAIL %-6s %s   (see %s)\n' "$1" "$(grep '^FAIL' "$OUT/$1-budget.txt" | head -2 | cut -c6-200 | paste -sd ';' -)" "$OUT/$1-budget.txt"; fi
}
budgets_kept() {   # (static: the counts of each play whose pass is kept, against the budgets as they are now)
  local f k n=0
  for f in "$BUDGETS"/*.jsonl; do
    [ -e "$f" ] || continue
    k=$(basename "$f" .jsonl); k=${k%-*}
    kept "$k" || continue   # (as this run keeps it: one over today's budgets is played again, above)
    python3 tools/beat_budget.py check "$f" "$(basename "$f" .jsonl | sed 's/.*-//')" --map "$MAP" | grep '^FAIL' && return 1
    n=$((n + 1))
  done
  echo "ok   $n kept plays' beats within their budgets"
}
# the story as an iPhone plays it (390 x 844 at three pixels to the point, the low tier, its user agent), every still's
# frame counted: each beat against a phone's budget. One frame in sixty drawn: the stills' frames are drawn whole
run_budget() { budget_part budget "" "" "the episode played as a phone plays it"; }
# and in the story's three parts (issue 131): before landing, only the parts a change reaches are played, as the story's
# are; a part's beats are held to the same budgets as the whole play's (docs/CHECKS.md, "A phone's beats before landing")
run_budget1() { budget_part budget1 "" 4 "frames 1 to 4 played as a phone plays them"; }
run_budget2() { budget_part budget2 4 6 "frames 5 and 6 played as a phone plays them, from a case left at frame 5"; }
run_budget3() { budget_part budget3 6 "" "frame 7 and the last card played as a phone plays them, from a case left at frame 7"; }
budget_part() {   # <name> <FROM> <UPTO> <what a pass says>
  # (on the fast tier dry, as the story's parts are: no still taken and no frame rasterised, each still's frame asked
  # for whole and its calls counted. A phone's three device pixels to the point are the software renderer's slowest
  # picture: frames 5 and 6 took 461 s drawn and 250 s dry, frame 7 264 s and 173 s, with the same counts. Main's full
  # tier draws them, one frame in sixty, as the budgets were measured)
  local n=$1 log="$OUT/$1.log" still=${STILLS:-$([ "$TIER" = full ] && echo 1 || echo 0)} draw=${DRAW:-$([ "${GPU:-}" = metal ] && echo 0 || { [ "$TIER" = full ] && echo 60 || echo 1000; })}
  if CHROME_LOG="$OUT/$n-chrome.log" BUDGET="$OUT/$n-budget.jsonl" PHONE=1 DPR=3 TIER=low FROM=$2 UPTO=$3 STILLS=$still DRAW=$draw LIMIT=5400 timeout 6000 $X node tools/story_play.js "$OUT/$n" 390x844 >"$log" 2>&1; then
    printf 'ok   %-6s %s; %s\n' "$n" "$4" "$(grep -o 'played in [0-9]* s' "$log" | tail -1)"
    beats_of "$n" phone "$OUT/$n-budget.jsonl"
  else printf 'FAIL %-6s %s   (see %s)\n' "$n" "$(why "$log")" "$log"; fi
}
# The story on a phone's page, by touch (issue 120): the win played with a finger, as the desktop's is with keys. No
# still but a failed step's, one frame in sixty drawn, one device pixel to the point: what it checks is that every
# thing the story asks for can be reached and tapped on that screen, to the last card (budget counts the phone's frames)
run_storyp() {
  local log="$OUT/storyp.log"
  if CHROME_LOG="$OUT/storyp-chrome.log" TOUCH=1 PHONE=1 TIER=low STILLS=${STILLS:-0} DRAW=${DRAW:-$([ "${GPU:-}" = metal ] && echo 0 || echo 60)} LIMIT=5400 timeout 6000 $X node tools/story_play.js "$OUT/storyp" 390x844 >"$log" 2>&1; then
    printf 'ok   %-6s the episode played by touch on a phone'"'"'s page, %s; %s\n' storyp "$(grep -o '^touch: [0-9]* taps' "$log" | tail -1 | cut -c8-)" "$(grep -o 'played in [0-9]* s' "$log" | tail -1)"
  else printf 'FAIL %-6s %s   (see %s; STILLS=1 tools/check.sh storyp for its pictures)\n' storyp "$(why "$log")" "$log"; fi
}
# The story down its losing branches (issue 120), which no other check plays: the man; a lie at the police box, two
# guesses at the foreman and at the old man's pitch, each seen through and asked again (issue 93), and the summation
# answered wrongly until she says it herself; the false solution said aloud and the lecturer named, and everything said
# only to one who chose so; frame 5 spent from the wrong place, its card kept once and then spent, and the summation's
# first question asked in words alone for it; and from the last card frame 3 gone back into and played to its print
run_storyl() {
  local log="$OUT/storyl.log"
  if CHROME_LOG="$OUT/storyl-chrome.log" PLAYER=M SLIP=3,5,6,7 CHOOSE=3:0,4:0 SPEND=5 BACKTO=3 STILLS=${STILLS:-0} DRAW=${DRAW:-$([ "${GPU:-}" = metal ] && echo 0 || echo 60)} LIMIT=5400 timeout 6000 $X node tools/story_play.js "$OUT/storyl" 800x500 >"$log" 2>&1; then
    printf 'ok   %-6s the losing branches played as the man: seen through %s times and told once, the accusation, a frame spent, a frame gone back into; %s\n' storyl "$(grep -c ': seen through$' "$log")" "$(grep -o 'played in [0-9]* s' "$log" | tail -1)"
  else printf 'FAIL %-6s %s   (see %s; STILLS=1 tools/check.sh storyl for its pictures)\n' storyl "$(why "$log")" "$log"; fi
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
    # (one frame in twenty drawn and no still taken, tools/draw_skip.js: the beats read the page's state; STILLS=1 DRAW=0 for its pictures)
    if ! CHROME_LOG="$OUT/walk-$d-chrome.log" STILLS=${STILLS:-$([ "$TIER" = full ] && echo 1 || echo 0)} DRAW=${DRAW:-$([ "${GPU:-}" = metal ] && echo 0 || echo 20)} timeout 2400 $X node tools/walk_play.js "$OUT/walk" $d night rain >"$OUT/walk-$d.log" 2>&1; then ok=0; echo "FAIL walk   $d: $(why "$OUT/walk-$d.log")   (see $OUT/walk-$d.log)"; fi
    said="${said:+$said and }$(grep -c '^ok' "$OUT/walk-$d.log") $([ "$d" = 390x844 ] && echo "beats on a phone's page" || echo "beats on a desktop's page")"
  done
  [ $ok -eq 1 ] && echo "ok   walk   $said: two ways in, the hour and the sky, out with no story"
  return 0
}
run_roads() {   # the road plan in the game (docs/ROADS.md): the traffic watched from two kerbs, and the walk's drive to 109 from three starts
  local ok=1
  if ! GAME_TIME=${GAME_TIME:-17:57} timeout 1500 $X node tools/road_traffic_watch.js "$MAP" 3 >"$OUT/roads-watch.log" 2>&1; then ok=0; echo "FAIL roads  the traffic: $(grep '^FAIL\|pageerror' "$OUT/roads-watch.log" | head -3 | cut -c1-170 | paste -sd ';' -)   (see $OUT/roads-watch.log)"; fi
  if ! GAME_TIME=${GAME_TIME:-17:57} timeout 900 $X node tools/trips_probe.js "$MAP" 120 >"$OUT/roads-trips.log" 2>&1; then ok=0; echo "FAIL roads  the trips: $(grep '^FAIL\|pageerror' "$OUT/roads-trips.log" | head -3 | cut -c1-170 | paste -sd ';' -)   (see $OUT/roads-trips.log)"; fi
  # (the drives with the traffic running, as the clip and the game check are: a second run when one fails, and a failure
  # only where the same start fails both times; else FLAKY, which main lists under check-flaky. Issue 175: the autopilot
  # and a bus in Dogenzaka-shita's junction under the expressway can still stand each waiting on the other)
  drive() { GAME_TIME=${GAME_TIME:-17:57} TO=268,-998.6 FROM="372,-1041;480,-722;560,-1100" timeout 2400 $X node tools/road_drive.js "$MAP" >"$OUT/roads-drive.log" 2>&1; }
  if ! drive; then
    cp "$OUT/roads-drive.log" "$OUT/roads-drive-first.log"
    if drive; then echo "ok   roads  the drive to 109 from three starts   (the second run; the first: $OUT/roads-drive-first.log)"
    else ok=0; twice roads "$OUT/roads-drive-first.log" "$OUT/roads-drive.log" | sed 's/^FLAKY roads/FLAKY roads  the drive to 109:/; s/^FAIL roads/FAIL roads  the drive to 109:/'; fi
  fi
  [ $ok -eq 1 ] && echo "ok   roads  no traffic made on a quiet street, at a wall or in sight, buses on their lines, every car bound somewhere and nearer it at each turn, none inside another; 109 reached from three starts"
  return 0
}
run_ride() {   # frame 6's ride, on a small page: no car in a person on any step of the way
  if CHROME_LOG="$OUT/ride-chrome.log" DRAW=${DRAW:-$([ "${GPU:-}" = metal ] && echo 0 || echo 20)} LIMIT=2400 timeout 3000 $X node tools/ride_people.js "$OUT/ride" 800x500 >"$OUT/ride.log" 2>&1; then echo "ok   ride   no car in a person along frame 6's ride; $(grep -o 'mean [0-9.]* km/h moving' "$OUT/ride.log" | head -1)"
  else echo "FAIL ride   $(grep '^overlaps\|^ride \|pageerror' "$OUT/ride.log" | head -3 | cut -c1-160 | paste -sd ';' -)   (see $OUT/ride.log)"; fi
}
# the page on a phone's low tier (an iPhone emulated, quality.js lean) must stay inside the memory budget, so that
# an iPhone's tab is not killed (docs/PERFORMANCE.md, "On a phone"); and at frame 5's place, where two hero levels are
# held at once (docs/HERO.md, "Miyamasu")
run_mem() {
  if AT=${AT:-521.9,-1074.1} timeout 1800 $X node tools/mem_check.js "$MAP" >"$OUT/mem.log" 2>&1; then
    echo "ok   mem    $(grep -o 'GPU peak [0-9]* MB ([0-9.]* MB under its [0-9]*' "$OUT/mem.log" | head -1)), $(grep -o '[0-9]* at the end after a collection' "$OUT/mem.log" | head -1) heap"
  else echo "FAIL mem    $(grep -o 'over [0-9]*' "$OUT/mem.log" | paste -sd ';' - | head -c120)   (see $OUT/mem.log)"; fi
  # (a desktop's pictures in blocks, web/tex.js and bc7.js: the story to its title with ?tex=bc7, which packs on a software
  # renderer too: every picture packed, none left under the floor, the textures held under MAX_TEX; docs/PERFORMANCE.md)
  if MAX_TEX=${MAX_TEX:-400} timeout 900 $X node tools/load_tex.js '?tex=bc7' >"$OUT/load_tex.log" 2>&1; then echo "ok   mem    $(grep -o 'textures [0-9]* MB' "$OUT/load_tex.log" | head -1) at a desktop's title with its pictures in blocks, $(grep -o '"packed":[0-9]*' "$OUT/load_tex.log" | cut -d: -f2) packed"
  else echo "FAIL mem    $(grep '^FAIL\|page errors' "$OUT/load_tex.log" | head -2 | cut -c1-160 | paste -sd ';' -)   (see $OUT/load_tex.log)"; fi
  # (a phone's lost WebGL context counts as a death at once: the next load is a level lighter, tools/lost_check.js)
  if timeout 300 $X node tools/lost_check.js >"$OUT/lost.log" 2>&1; then echo "ok   mem    a lost context on a phone counts as a death at once, once"
  else echo "FAIL mem    $(grep '^FAIL' "$OUT/lost.log" | head -2 | cut -c1-160 | paste -sd ';' -)   (see $OUT/lost.log)"; fi
  # and the memory loop on the story's page: a death makes the next load lighter, a lost context reloads lighter and
  # never from a tab put away (tools/glcare_phone.js, docs/PERFORMANCE.md "Measure, then grant")
  if timeout 900 $X node tools/glcare_phone.js >"$OUT/glcare_phone.log" 2>&1; then echo "ok   mem    $(grep -c '^ok' "$OUT/glcare_phone.log") steps of a phone's lost context and its next load"
  else echo "FAIL mem    $(grep '^FAIL' "$OUT/glcare_phone.log" | head -2 | cut -c6-150 | paste -sd ';' -)   (see $OUT/glcare_phone.log)"; fi
  # a killed page counted with the measurements off (issue 128, web/lifeline.js), and a lost context at the story's beats
  # and on the walk: restored in place on a desktop, taken up where it was after a phone's reload (issue 118)
  if timeout 300 $X node tools/killed_check.js >"$OUT/killed.log" 2>&1; then echo "ok   mem    a killed page loads a level lighter next time with the measurements off"
  else echo "FAIL mem    $(grep '^FAIL' "$OUT/killed.log" | head -2 | cut -c6-150 | paste -sd ';' -)   (see $OUT/killed.log)"; fi
  if timeout 2400 $X node tools/ctx_beats.js >"$OUT/ctx_beats.log" 2>&1; then echo "ok   mem    $(grep -c '^ok' "$OUT/ctx_beats.log") steps of a lost context at the story's beats and on the walk, desktop and phone"
  else echo "FAIL mem    $(grep '^FAIL' "$OUT/ctx_beats.log" | head -2 | cut -c6-150 | paste -sd ';' -)   (see $OUT/ctx_beats.log)"; fi
}
# every sound on the audio thread, as an iPhone makes it (docs/SOUND.md "Every sound on the audio thread")
run_audio() {
  if timeout 900 node tools/reverb_check.js >"$OUT/reverb.log" 2>&1; then echo "ok   audio  $(grep -c '^ok' "$OUT/reverb.log") reverbs as a phone hears them, each within its tolerance of the whole convolution"
  else echo "FAIL audio  $(grep '^FAIL' "$OUT/reverb.log" | head -2 | cut -c1-160 | paste -sd ';' -)   (see $OUT/reverb.log)"; fi
  if timeout 600 node tools/audio_graph_check.js >"$OUT/audio_graph.log" 2>&1; then echo "ok   audio  the graph as small once every one-shot has sounded as before ($(grep -o '[0-9]* once they have ended' "$OUT/audio_graph.log" | head -1 | grep -o '^[0-9]*') nodes), none begun before the audio thread can take it up"
  else echo "FAIL audio  $(grep '^FAIL' "$OUT/audio_graph.log" | head -2 | cut -c1-160 | paste -sd ';' -)   (see $OUT/audio_graph.log)"; fi
  if timeout 300 node tools/audio_shed_check.js >"$OUT/audio_shed.log" 2>&1; then echo "ok   audio  the sound gives up voices, the room and the street's beds when a phone clicks, and takes them back"
  else echo "FAIL audio  $(grep '^FAIL' "$OUT/audio_shed.log" | head -2 | cut -c1-160 | paste -sd ';' -)   (see $OUT/audio_shed.log)"; fi
  if timeout 120 node tools/snd_probe_check.js >"$OUT/snd_probe.log" 2>&1; then echo "ok   audio  $(grep -o '^PASS.*' "$OUT/snd_probe.log" | cut -c6-)"
  else echo "FAIL audio  the probe of the sound's breaks: $(grep '^FAIL' "$OUT/snd_probe.log" | head -2 | cut -c6-150 | paste -sd ';' -)   (see $OUT/snd_probe.log)"; fi
  # (a phone's street held while the page is busy and given up on a break, issue 166: docs/SOUND.md "The guard")
  if timeout 120 node tools/snd_guard_check.js >"$OUT/snd_guard.log" 2>&1; then echo "ok   audio  $(grep -o '^PASS.*' "$OUT/snd_guard.log" | cut -c6-)"
  else echo "FAIL audio  the street's guard: $(grep '^FAIL' "$OUT/snd_guard.log" | head -2 | cut -c6-150 | paste -sd ';' -)   (see $OUT/snd_guard.log)"; fi
  # (a phone's opening as an iPhone plays it, issue 166: no context until the film is over, the music on media elements, the
  # main thread throttled six times; the story's opening and the walk's)
  if DRAW=${DRAW:-$([ "${GPU:-}" = metal ] && echo 0 || echo 60)} timeout 900 $X node tools/opening_audio.js 390x844 >"$OUT/opening_audio.log" 2>&1; then echo "ok   audio  $(grep -o '^PASS.*' "$OUT/opening_audio.log" | cut -c6-)"
  else echo "FAIL audio  a phone's opening, the story's: $(grep '^FAIL' "$OUT/opening_audio.log" | head -2 | cut -c6-160 | paste -sd ';' -)   (see $OUT/opening_audio.log)"; fi
  if WALK=1 DRAW=${DRAW:-$([ "${GPU:-}" = metal ] && echo 0 || echo 60)} timeout 900 $X node tools/opening_audio.js 390x844 >"$OUT/opening_audio_walk.log" 2>&1; then echo "ok   audio  the walk's opening: $(grep -o '^PASS.*' "$OUT/opening_audio_walk.log" | cut -c6-)"
  else echo "FAIL audio  a phone's opening, the walk's: $(grep '^FAIL' "$OUT/opening_audio_walk.log" | head -2 | cut -c6-160 | paste -sd ';' -)   (see $OUT/opening_audio_walk.log)"; fi
  # (the two below play the music on the context, ?music=web, as a touch screen that is not an iPhone still does)
  if Q=?music=web DRAW=${DRAW:-$([ "${GPU:-}" = metal ] && echo 0 || echo 60)} timeout 1500 $X node tools/phone_audio.js 390x844 >"$OUT/phone_audio.log" 2>&1; then
    echo "ok   audio  as an iPhone: $(grep -o 'convolvers: [0-9]*, their responses [0-9]* to [0-9]* frames (the limit [0-9]*)' "$OUT/phone_audio.log" | head -1), one context, no worklet"
  else echo "FAIL audio  $(grep '^FAIL' "$OUT/phone_audio.log" | head -2 | cut -c1-160 | paste -sd ';' -)   (see $OUT/phone_audio.log)"; fi
  # the mix, place by place (docs/SOUND.md's table of listening points): each bus's level read from the graph at the
  # kerb, under the deck, on the roof, in the lift, the helicopter's cabin and the car's, and nothing of the moving
  # world past the tape at a Stop; as a desktop and as a touch screen
  if timeout 900 $X node tools/sound_places.js >"$OUT/sound_places.log" 2>&1; then echo "ok   audio  $(grep -o '^PASS.*' "$OUT/sound_places.log" | cut -c6-)"
  else echo "FAIL audio  the mix by place: $(grep '^FAIL' "$OUT/sound_places.log" | head -2 | cut -c6-150 | paste -sd ';' -)   (see $OUT/sound_places.log)"; fi
  if PHONE=1 timeout 900 $X node tools/sound_places.js >"$OUT/sound_places_phone.log" 2>&1; then echo "ok   audio  as a touch screen: $(grep -o '^PASS.*' "$OUT/sound_places_phone.log" | cut -c6-)"
  else echo "FAIL audio  the mix by place, as a touch screen: $(grep '^FAIL' "$OUT/sound_places_phone.log" | head -2 | cut -c6-150 | paste -sd ';' -)   (see $OUT/sound_places_phone.log)"; fi
  # (and touched first on the title: the opening's score with its own bed, and the loading cue let go)
  if Q=?music=web FIRST=title DRAW=${DRAW:-$([ "${GPU:-}" = metal ] && echo 0 || echo 60)} timeout 1500 $X node tools/phone_audio.js 390x844 >"$OUT/phone_audio_title.log" 2>&1; then
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
  if START=0.8/0.5 Q=msaa=on\&units=16 WALK=1 timeout 2400 $X node tools/gl_error_probe.js "$MAP" >"$OUT/gl.log" 2>&1; then
    echo "ok   gl     opened with the extras shed and multisampling on, the ladder walked by day and in rain at night as a 16-unit GPU: WebGL refused no call, every program linked"
  else
    # (a refused call was found among the last few hundred: played again asking after every call, which names it and
    # where it was made, and takes most of an hour on a software renderer)
    if grep -q 'EVERY=1 names it' "$OUT/gl.log"; then cp "$OUT/gl.log" "$OUT/gl-first.log"; EVERY=1 START=0.8/0.5 Q=msaa=on\&units=16 WALK=1 timeout 5400 $X node tools/gl_error_probe.js "$MAP" >"$OUT/gl.log" 2>&1; fi
    echo "FAIL gl     $( (grep -o '"call":"[^"]*"' "$OUT/gl.log" "$OUT/gl-first.log" 2>/dev/null | cut -d: -f2- | cut -c9-160; grep -o '^programs .*"failed":[1-9].*' "$OUT/gl.log") | head -2 | paste -sd ';' -)   (see $OUT/gl.log)"
  fi
  # the same map as a GPU with sixteen texture units in a fragment shader (Apple's, most phones'; the software
  # renderer has 32), by day, at dusk and at night, clear, in rain and in snow, at each of the governor's rungs: every
  # program fitted to sixteen as it is compiled (glcare.js guard), none failing to link, the page's count never low
  if Q=units=16 SKIES=clear,rain,snow timeout 2400 $X node tools/sampler_probe.js "$MAP" >"$OUT/units.log" 2>&1; then
    echo "ok   gl     as a 16-unit GPU every program linked, at every hour, weather and rung$(grep -o 'unit device: .*' "$OUT/units.log" | sed 's/^unit device: /; it goes without: /' | cut -c1-160)"
  else echo "FAIL gl     as a 16-unit GPU: $(grep -m2 'NOT LINKED\|counted \|pageerror' "$OUT/units.log" | cut -c1-160 | paste -sd ';' -)$(tail -2 "$OUT/units.log" | head -1 | cut -c1-120)   (see $OUT/units.log)"; fi
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
# what a player who comes back meets (docs/CHECKS.md "A load is of one commit"; the tool serves the site itself, as two
# commits, and writes what it served into the server's log for the cache of passes)
run_launch() {
  if OUT="$OUT/launch" SERVER_LOG="$OUT/server.log" timeout 1500 $X node tools/launch_check.js >"$OUT/launch.log" 2>&1; then
    echo "ok   launch $(grep -c '^ok' "$OUT/launch.log") steps: a cache of the commit before, a start that fails, a case of another story, storage full, the page's own keys (stills in $OUT/launch)"
  else echo "FAIL launch $(grep '^FAIL' "$OUT/launch.log" | head -2 | cut -c6-170 | paste -sd ';' -)   (see $OUT/launch.log)"; fi
}
run_hold() {   # every cast avatar through every held clip: no limb in its own torso, no jerk (a minute)
  if timeout 900 $X node tools/hold_check.js "$OUT/hold.json" >"$OUT/hold.log" 2>&1; then echo "ok   hold   $(tail -1 "$OUT/hold.log" | sed 's/^hold: //')"
  else echo "FAIL hold   $(grep '^FAIL' "$OUT/hold.log" | head -2 | cut -c6-150 | paste -sd ';' -)   (see $OUT/hold.log)"; fi
}
run_astc() {   # SwiftShader decodes ASTC; Mesa's llvmpipe offers none, so without a display
  # (and a desktop's BC7 and BC5, web/bc7.js, against Pillow's decoder: every layout it writes, a sky without a band, this project's pictures)
  if timeout 600 env -u DISPLAY node tools/astc_check.js >"$OUT/astc.log" 2>&1 && timeout 600 python3 tools/bc_check.py >>"$OUT/astc.log" 2>&1; then
    echo "ok   astc   $(grep -c '^ok' "$OUT/astc.log") pictures encoded as the page encodes them (ASTC, BC7, BC5) and decoded by another's decoder, none under the floor, no cut-out's mipmaps or edge astray"
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
# What this script does for a check, as a key: the check's own function and the helpers it calls, and theirs; not the
# rest of the script (a change to the walk's function is no change to how the story is run)
fnkey() {
  local body h; body=$(declare -f "run_$1")
  for _ in 1 2 3; do for h in story_part budget_part beats_of walk_on twice why fails_of run_guide1 run_guide2; do
    case "$body" in *"$h ()"*) ;; *"$h"*) body="$body
$(declare -f "$h")" ;; esac
  done; done
  echo "$body" | sha1sum | cut -c1-16
}
# Whether a check's pass is kept, asked once a run: the answer in $OUT/keep/<check> (its first line kept or played, then
# why: what changed since the pass and whether any of it can reach the check; docs/CHECKS.md, "Checks by reach")
kept() {
  local k=$1 f="$OUT/keep/$1" hit
  if [ ! -s "$f" ]; then
    mkdir -p "$OUT/keep"
    # (what this script does for it is in the key too: the target's function and the helpers it calls, not the rest)
    if ! cache_on; then printf 'played\n\n' >"$f"
    elif hit=$(CHECK_FN=$(fnkey "$k") python3 tools/check_cache.py hit "$k"); then
      # (a play kept, and its beats counted then: over a budget as the budgets are now, it is played again and counted
      # again, not failed on counts of the page as it was; main may have made the beat lighter and its budget with it)
      if over=$(for b in "$BUDGETS/$k"-*.jsonl; do [ -e "$b" ] && python3 tools/beat_budget.py check "$b" "$(basename "$b" .jsonl | sed 's/.*-//')" --map "$MAP" | grep -m1 '^FAIL'; done) && [ -n "$over" ]; then
        printf 'played\nits kept counts are over the budgets as they are now (%s)\n' "$(echo "$over" | head -1 | cut -c6-90)" >"$f"
      else printf 'kept\n%s\n' "$hit" >"$f"; fi
    else printf 'played\n%s\n' "$hit" >"$f"; fi
  fi
  [ "$(head -1 "$f")" = kept ]
}
run_one() {   # <check> [lane]
  local k=$1 lane=${2:-0} t0 n0=0 res
  PORT=$((PORT0 + lane)); export PORT
  CHECK_FN=$(fnkey "$k") && export CHECK_FN
  if kept "$k"; then
    printf 'ok   %-6s kept from its pass at %s (CHECK_CACHE=0 plays it again)\n' "$k" "$(sed -n 2p "$OUT/keep/$k")"
    return 0
  fi
  t0=$(date +%s); [ -n "$started" ] && n0=$(wc -l <"$OUT/server-$lane.log")
  echo "... $k from $(date +%H:%M), about $(( ($(eta "$k") + 30) / 60 )) min here$(sed -n '2s/^\(..*\)$/: \1/p' "$OUT/keep/$k")" >&2
  # (which of the page's functions it runs, counted by the browser: tools/browser_watch.js)
  rm -rf "$OUT/cover/$k"; export COVER="$OUT/cover/$k"
  res=$("run_$k"); echo "$res"
  echo "$k $(( $(date +%s) - t0 ))" >>"$OUT/times.txt"
  echo "$res" | grep -q '^FAIL\|^FLAKY' || echo "$k $(( $(date +%s) - t0 )) $(date +%s)" >>"$HIST"
  if echo "$res" | grep -q '^FAIL\|^FLAKY'; then python3 tools/check_cache.py drop "$k"
  elif [ -n "$started" ] && { cache_on || [ -n "${CHECK_STORE:-}" ]; }; then python3 tools/check_cache.py save "$k" "$OUT/server-$lane.log" "$n0" "$t0" "$(( $(date +%s) - t0 ))" "$COVER"; fi
}
rm -rf "$OUT/keep"
: >"$OUT/times.txt"
# what this run plays and how long that takes here (a pass kept from the cache costs nothing)
{ total=0; said=
  [ $static -eq 1 ] && [ "${CHECK_STATIC:-1}" != 0 ] && { total=$(eta static); said=static; }
  for k in $KINDS; do
    is_in "$k" "$want" || continue
    if kept "$k"; then said="$said $k(kept)"; else e=$(eta "$k"); total=$((total + e)); [ "$e" -gt "${long:-0}" ] && long=$e; said="$said $k"; fi
  done
  # (side by side, no sooner than the longest of them)
  [ "$L" -gt 1 ] && { st0=$([ $static -eq 1 ] && [ "${CHECK_STATIC:-1}" != 0 ] && eta static || echo 0); total=$(( st0 + (total - st0 + L - 1) / L )); [ "${long:-0}" -gt "$total" ] && total=$long; }
  echo "checks: ${said# }: about $(( (total + 30) / 60 )) min on this machine$([ "$L" -gt 1 ] && echo ", $L side by side")" >&2; }
{
  t_static=$(date +%s)
  # (the static checks beside the browser checks, on a session's machine: they take one core for a minute, which a run
  # of a few minutes should not wait out first; a runner has them on a shard of their own)
  if [ $static -eq 1 ] && [ "${CHECK_STATIC:-1}" != 0 ]; then (
    st voice voice - '^FAIL' python3 tools/voice_check.py
    st goals goals - '^FAIL' node tools/goals_check.js
    st pack pack "the packs up to date" '^FAIL' python3 pipeline/pack.py --check
    st pack pack_decode "the packs decode to their JSON" '^FAIL|Error' node tools/pack_check.js
    st vis vis "the sweep hides nothing an exact ray reaches" '^FAIL|Error' env EYES=12 node tools/vis_unit.js
    st budget budget - '^FAIL' budgets_kept
    st governor governor "a device at its limit settles, gives way and comes back" '^FAIL' node tools/governor_unit.js
    st guide guide "the guide goes round a held crowd and keeps in front of a run" '^FAIL' node tools/guide_unit.js
    st rings rings "the solids valid on their grid" '^FAIL|Error' python3 pipeline/solid_rings.py --check "$MAP"
    st ground ground - '^FAIL|Error' python3 pipeline/street_ground.py --city "$MAP" --check
    st roads roadplan - '^FAIL|Error' python3 pipeline/road_plan.py --city "$MAP" --check
    st roads roadwidth - '^FAIL|Error' python3 pipeline/road_width.py --city "$MAP" --check
    st roads roadground "the planned area's ground and every hero level's as the survey has them, every lane inside its kerbs" '^FAIL|Error' bash -c "python3 pipeline/road_ground.py --city $MAP --check && python3 tools/hero_survey_map.py $MAP --check && python3 pipeline/road_fit.py --city $MAP --check"
    st roads buslines - '^FAIL|Error' python3 pipeline/bus_lines.py --city "$MAP" --check
    st roads routes - '^FAIL|Error' python3 pipeline/road_routes.py "$MAP" --check
    st roads firstdrive "your car's first drive leads on, and every street open to it in the area is one a car can use" '^FAIL|Error' python3 tools/first_drive.py "$MAP"
    st levels levels - '^FAIL|^  |Error' python3 tools/levels_check.py "$MAP"
    st float float "every landmark stands on something" '^FLOATS|Error' python3 tools/float_check.py "$MAP"
    st signs signclear "no sign or screen behind another landmark" '^COVERED|Error' python3 tools/sign_clear.py "$MAP"
    st lobby lobby "nothing stands in a lift's lobby, its hall's posts and belts inside it" '^FAIL|Error' python3 tools/lobby_check.py "$MAP"
    st signs signs "every sign reads the right way round and faces the street" '^[^o]' python3 tools/sign_check.py "$MAP"
    st signs decals "the vehicles' names read the right way round" '^[^o]' node tools/decal_check.js
    st flight flight "the story's flight clears the buildings" 'too close|Error' python3 tools/flight_clear.py "$MAP"
    st flight flight_frames "the story's flight in every frame of its shots, from one side of it and clear of the buildings" '^FAIL|Error' python3 tools/flight_frames.py "$MAP"
    st stands standpoints - '^FAIL|Error' python3 tools/standpoints.py "$MAP"
    st bounds bounds "the planned area's edge as the story's and the walk's places give it" '^FAIL|Error' python3 pipeline/bounds.py --city "$MAP" --check
    st crowd crowd_cast - '^FAIL|Error' python3 pipeline/crowd_cast.py --check
    st meshopt meshopt - '^FAIL|Error' node pipeline/meshopt_glb.mjs --check web/assets/*/*.glb
    st parts parts "the parts of the shared models up to date" '^FAIL|Error' parts
    st audio audio_thread - '^FAIL' python3 tools/audio_thread_check.py
    st credits credits - '^FAIL' python3 tools/credits_check.py "$MAP"
    st reach reach - '^FAIL|Error' python3 tools/reach_unit.py
    st seams seams - '^FAIL|Error' python3 tools/seams.py
    st people people - '^FAIL|Error' python3 tools/people_contract.py
    st vendor vendor "three.js carries its fixes (an ImageBitmap made smaller sent unturned)" '^FAIL|Error' python3 pipeline/fetch_vendor.py --check
    echo "static $(( $(date +%s) - t_static ))" >>"$OUT/times.txt"; echo "static $(( $(date +%s) - t_static )) $(date +%s)" >>"$HIST"
  ) & fi
  [ -n "${CI:-}" ] && wait
  t_all=$(date +%s)
  if [ "$L" -le 1 ]; then for k in $KINDS; do is_in "$k" "$want" && run_one "$k"; done; wait
  else
    # the passes kept first (they cost nothing), then the longest first, each in the lane that comes free
    order=$(for k in $KINDS; do is_in "$k" "$want" || continue; if kept "$k"; then echo "0 $k"; else echo "$(( 100000 - $(eta "$k") )) $k"; fi; done | sort -n | cut -d' ' -f2)
    mkfifo "$OUT/.lanes" 2>/dev/null; exec 9<>"$OUT/.lanes"; rm -f "$OUT/.lanes"
    for i in $(seq 0 $((L - 1))); do echo "$i" >&9; done
    for k in $order; do
      read -r -u 9 lane
      ( run_one "$k" "$lane" >"$OUT/res-$k.txt"; cat "$OUT/res-$k.txt"; echo "$lane" >&9 ) &
    done
    wait
  fi
  [ -s "$OUT/times.txt" ] && echo "time: $(awk '{ printf "%s%s %d s", (NR > 1 ? ", " : ""), $1, $2; t += $2 } END { printf "; %d min of checks", (t + 30) / 60 }' "$OUT/times.txt") in $(( ($(date +%s) - t_static + 30) / 60 )) min of the wall"
} | tee "$OUT/summary.txt"
grep -q '^FAIL' "$OUT/summary.txt" && exit 1
stamp "$@"
