# The checks

`tools/check.sh` is the one command that decides whether work may land. The project is one story on
one map (Blue Hour, at the Shibuya Scramble; [STORY.md](STORY.md)), so there is one page to check and
the script is short: a set of checks that open no browser, and a handful that open the page.

## The targets

| Target | What it does | Tool |
|---|---|---|
| `static` | Everything that needs no browser, half a minute together (below) | several |
| `story` | Plays the episode frame by frame to its last card: the street runs, the Stop comes, the afterimage speaks, the photograph is taken (a frame spent only with the lens on the subject), the world runs on, the last card with its two ways on, and its Walk Shibuya taken up in the same night (the card gone, the walk's corner up, the evening's people gone once the lens turns away). A still at each beat. Without a GPU one frame in thirty is drawn (`DRAW=30`) and the rest run the game without their draw calls, their clears, their `renderer.render` (the world's matrices and every `onBeforeRender` still run) or a wait for the display's next frame, so that the story keeps its own time on a software renderer; the stills and the photographs are of frames drawn whole, and the page's frames are held while a still is taken of the frame drawn last (#51). Every frame the game notes each of the crowd drawn (near or far copy) within 0.45 m of one of the story's people, the player or the guide (`game.js` `bodiesCheck`), and any one fails the play: the crowd keeps clear of everyone standing who is not of it (`actors.js` `api.bodies`, issue 65) | `tools/story_play.js` |
| `walk` | The title's first way in (its list led by the walk, every row one size), on a desktop's page (800x500) and a phone's by touch (390x844): Walk Shibuya only after who you play, its hour and sky as the street behind the card, Back to the story's evening, out on the street with no goal, no light and nothing of the old free game (its keys open nothing), where and when in the corner, walking, the menu with the story in it, the camera; tonight's set dressing up in SKY GATE's lobby; your car driven (its keys, its speed in the corner, out once stopped; on a phone its buttons) and brought to the kerb from the menu; SKY GATE's lift ridden in the dark to the top stop; the helicopter on the roof boarded, flown up (its keys, its height) and landed; on the desktop also the last card's fresh-page way out. Stills of each beat | `tools/walk_play.js` |
| `guide` | Leads the story's guide along each frame's way (frame 4's as the story gives it, and four others from the story's data) with a player behind him on his trail: every quarter second a ray down onto the drawn scene under his feet (a fault more than 6 cm above it or 8 cm into it), his room either side across the way (`ways.room`: a fault where the way is wider than 3.2 m and he, or the way he plans, runs within 0.8 m of a wall, a drop, a well, a kerb or a post for more than 1.5 m; not within 2.5 m of where the way steps onto or off a crossing, where it crosses the kerb's line), and the mark with the signs out as for a lost player, the view turned four ways: what it points at must be on the way and walkable to in a straight line, its metres the way's. Stills behind the player. Run when the guide, the routes, the walking grid or the marks change (`companion.js`, `route.js`, `nav.js`, `story.js`) | `tools/guide_way.js` |
| `ride` | Takes frame 6's car (the one the story sends) from where the flight sets you down to Hachiko, stepping the world on and checking every car (the ride, your own, the traffic) against every person (the crowd, the NPCs, you) at every step: it fails on any car standing in someone. `PIN=5` plays the skip's case instead: five of the crowd held where the car will stand at its stop, then F (#50). Prints the ride's mean speed on the move; stills from behind the car. Run when the drivers, the cars or the crowd change (`web/game/cars.js`, `actors.js`, `game.js`) | `tools/ride_people.js` |
| `mem` | Opens the page as an iPhone on the low tier and fails it over the memory budget (peak GPU memory, settled JS heap), so that a phone's tab is not killed | `tools/mem_check.js` |
| `audio` | Every sound on the audio thread, as an iPhone makes it ([SOUND.md](SOUND.md), "Every sound on the audio thread"): the reverbs a phone hears held to the whole convolution (energy decay by band, the seam, echo density, left and right); every one-shot the street and the story make played many times over, failing on a graph that is larger once they have ended than before them (a node left on the mix is visited in every block) or a sound begun at or before the context's time; then the page played as an iPhone (the opening shot by shot, a Stop and its choir, every room, the live score), failing on a convolver on the live context longer than WebKit's realtime limit, a second context, a worklet, or anything spoken in the opening; and again touched first on the title, failing on two pieces of music at once in the opening. Run when the sound changes (`audio.js`, `music.js`, `overture.js`, `film-score.js`, `trains.js`, `walkcalls.js`) | `tools/reverb_check.js`, `tools/audio_graph_check.js`, `tools/phone_audio.js` |
| `clip` | Measures what passes through what in the free game (`?walk=1`): street furniture in the roads, cars in each other and in posts, people in cars and walls | `tools/clip_check.js` |
| `gl` | Opens the map as an ordinary device does, with the governor's extras shed and multisampling on, and asks WebGL for its error (once in 256 calls, since each asking waits for the GPU and asking after every call made the load fifteen times as long; a run that finds an error is played again with `EVERY=1`, which names the call and where it was made); then as a GPU with sixteen texture units, where every material must still be drawn | `tools/gl_error_probe.js`, `tools/sampler_probe.js` |
| `touch` | Plays the free game by touch on a phone's page, where no key can be pressed | `tools/touch_check.js` |
| `astc` | The device-side ASTC encoder (`web/astc.js`) against a real decoder | `tools/astc_check.js` |
| `look` | The models, pictures and sounds a branch changed, each loaded as the page loads it (its own three.js and GLTFLoader, meshopt in WebAssembly), every texture decoded and every material compiled and drawn, and a still of it as it was (left) beside it as it is (right), lit and framed alike, with its triangles, textures and bytes before and after. Fails on a file that does not load or decode, a texture left undecoded, a shader error or an error on the page. Named with no change to look at (as a runner's shard is), it decodes every model, picture and sound under `web/assets` and the hero levels, without stills: half a minute | `tools/look_check.js` |
| `game` | The free game's long scenario: walk, talk, the helicopter, your car, a taxi, the trains | `tools/game_check.js` |

Feet on the ground (`web/game/nav.js` `lift`, a hero level's paving and the city's own under it): `tools/feet_check.js [out]
[WxH]` plays the story to its first walk and measures every sole within 25 m against the ground drawn under it (the
lowest vertex of each foot as the skin poses it, a ray down onto whatever is drawn), failing a sole more than 2.5 cm
in or 5 cm over it; `HERO=off` holds the hero levels back, as a phone shows the street before its level has come (at
a desktop's size, where the city's buffers are kept to cast a ray at). Run when the walking heights, a hero level or
the landmarks' paving change. The tactile blocks' places (`cities/shibuya/scramble.py` `tactile_layout`) are looked at
in stills: `tools/game_shot.js shibuya tools/views/tactile.json out [390x844 with LEAN=1]`, from the air over Hachiko
Square and on foot at the start, at dusk and by day.

The way in waits for the level the player stands in (`web/game/game.js` `holdForLevel`, issue 62): `tools/level_wait.js
[out] [WxH]` begins the story with the Scramble's level held back (`DELAY`, 12 s by default), skips the opening as soon as
it can, and reads the veil, the level and the camera every fifth of a second; it fails if the camera reaches the player
before the level is drawn while the veil is down, or if the wait runs past its bound (6 s). `CRANE=1` takes the crane
down from the title instead (`?overture=0`, reduced motion); `BOUND=200` gives the page a bound longer than a software
renderer takes to make the level ready (it is queued behind the opening's own shaders here, some 80 s), to see the veil
lift once the level is drawn. Run when the way into the story or a hero level's loading changes. A phone's light on the
corner after dark (`web/neon.js` `pooled`) is looked at in stills: `tools/game_shot.js shibuya
tools/views/corner-night-62.json out [390x844 with LEAN=1]`, beside the desktop's; `game_shot.js` now waits for a hero
level that is loading before a still, which on the low tier here is half a minute (before, a phone's stills of the
Scramble were of the city's own model).

Two of the story's probes are run by hand, when what they look at changes. The guide (`web/game/companion.js`, his
film in `story.js` `meetGuide`): `tools/guide_meet.js` plays the first Stop, takes stills of his film, fails if his way
to you passes within 0.42 m of a held person's middle or ends away from you, then runs after him at the game's own run
and fails if he is behind the player more than a quarter of the time. A frame whose place is found (`task.find`):
`tools/find_probe.js` plays it to its camera and takes stills, with what the finder says, from where the world stops,
from the standpoint and from points given (`AT=x,y;x,y`), so that the words and the place are seen to agree.
The title in three screens and who you play (`web/game/game.js` `titleScreen`, `whoAsk`, `whoPick`; docs/STORY.md *The title, as a game opens*): `tools/title_who.js` opens the page as someone who has never played and presses as a hand does (a key or a tap past the press, mouse or touch, Enter, the arrows), and fails a title that does not open on its press, a first press of a way in that begins without bringing who you play up, portraits or a file on Kagami not shown whole, a Confirm with none chosen that goes on, a choice that is not who you then are, is not kept or does not set the file's lines, a Confirm that does not take the way in asked for, and a page opened again that asks again or does not name the choice under the menu. A rig's look (`web/game/people.js` `rig.animate`, the head turned to what an NPC or the player looks at): `tools/head_spin.js` holds every NPC's rig and the player's looking beside them, with time running and then held, and fails a head that goes on turning (a look laid over the last frame's look wound Aoi's head round by the Center Gai arch, on a phone, November 2026); `tools/story_play.js` reads every head at the first beat of each Stop as well. A train's sound (`web/game/audio.js` `trainAt`, `web/game/trains.js`): `tools/train_sound.js` renders one going by under
the Yamanote bridge and beside its viaduct, offline, to WAV, and reads its rhythm, its hiss far off and its deck's boom.

The static checks:

- what the characters and the story say (`tools/voice_check.py`): locals, not the map's credits;
- nothing that sounds made off the audio thread (an AudioWorklet, a ScriptProcessorNode, a ConvolverNode, an
  AudioContext, a media element's sound) outside the one place each is allowed (`tools/audio_thread_check.py`);
- the map's lines and quests played to the last stamp without a browser (`tools/goals_check.js`);
- the packs (`buildings.bin`, `landmarks.bin`, `game.bin`, terrain, places, scene, `vis.bin`,
  `skyvis.webp` and the phone's district under `d/`) made from their JSON as it is now, and decoded
  by the browser's decoder to the same values (`pipeline/pack.py --check`, `tools/pack_check.js`);
- the visibility sweep against exact rays (`tools/vis_unit.js`);
- the frame-time governor on modelled devices (`tools/governor_unit.js`);
- the story's guide without a browser: round a held crowd by its gap, never through a person, and in front of a player
  who runs, stops and overtakes him (`tools/guide_unit.js`);
- the building solids valid on their decimetre grid (`pipeline/solid_rings.py --check`);
- no landmark hanging in the air (`tools/float_check.py`), no sign or screen behind another landmark
  (`tools/sign_clear.py`), no sign that reads mirrored (`tools/sign_check.py`);
- no building solid standing in a lift's street lobby or through the lift's portal set in it (`tools/lobby_check.py`;
  stills of the lobbies and the guide dog at heel by their queue belts: `tools/lobby_shot.js`);
- the story's flight: its way clear of the buildings (`tools/flight_clear.py`), and its seven shots as a storyboard,
  on a desktop and a phone: the helicopter in the picture, the lens turning no faster than twelve degrees a second,
  every camera on one side of its way, out of the buildings and with none between it and the helicopter
  (`tools/flight_frames.py`). How it flies in the page, frame by frame, and where it
  sets you and the dog down: `tools/heli_flight.js` (a browser, on its own: half an hour on a software renderer);
- the far crowd's copy of every cast member (`pipeline/crowd_cast.py --check`);
- every shared model meshopt-compressed, and the parts the page loads before and after playable
  as their model splits now (`pipeline/meshopt_glb.mjs --check`, `pipeline/meshopt.py split`).

They need `numpy`, `shapely`, `pyproj`, `pillow` and Node; the browser checks need Playwright's
Chromium (`NODE_PATH` set to where `playwright` is installed, if it is not global).

## What runs when

**Before landing: the fast tier.** Plain `tools/check.sh` looks at what the branch changed against
`origin/main` (after a pass, at what changed since that pass):

- a change to the page's code or data (`web/`, but for the files in the next line) or to the story in
  `cities/shibuya/city.json` runs `static`, `story`, `walk` and `mem`; the sound adds `audio`, the drivers, the cars and
  the crowd `ride`, the guide and his ways `guide`;
- a change of models, pictures or sounds alone (`.glb`, `.webp`, `.png`, `.jpg`, `.avif`, `.ktx2`, `.mp3` and the like
  under `web/`) runs `static`, `look` and `mem`, not the story: such a file can change how the street looks and what a
  phone holds, not where the story goes. Not so a hero level's model (`web/data/shibuya/hero/`: its ground meshes are
  what everyone walks on), the guide dog's (his body's size is taken from it), a file removed, or a model that lost or
  changed a name, a flag or an attribute the code can ask for (`tools/model_contract.py`): those run as code does;
- a change to a check's harness runs the checks that require it (`tools/check_cache.py users`); of a module several
  share (`browser_watch.js`, `start_play.js`, `pin_clock.js`) the quickest of them, and on main all of them;
- a change to the build or the plumbing (`pipeline/`, `blender/`, the builders' sources under `cities/`, `tools/`,
  `.github/`) runs `static`: the page sees only what a build writes under `web/`, which is in the diff once it is built;
- a change to the docs alone runs nothing;
- after a pass, a file changed since that is main's as main has it (main merged in, nothing done to it on the
  branch) runs `static` only: main's full tier plays the two together once the branch lands, and a commit it fails
  is not published. The branch's own change since the pass, or a file both sides changed, is routed as it would
  have been, file by file (until November 2026 one such file, even a doc, sent all of main's change through the
  story and the walk again). `CHECK_FULL=1` runs it all.
- a browser check whose last pass in this clone read nothing that has changed since is not played again: its line says
  `kept from its pass at <commit>` ("The router and the cache", below). After a fix to one check, a run plays that
  check and whatever the fix touched, not the rest again.

**After landing: the full tier, on main, in GitHub Actions** (`.github/workflows/checks.yml`). Each
push to main runs `CHECK_TIER=full tools/check.sh --plan` against the commit of the last run that
passed, which adds `clip`, `gl` and `touch` for a change to the page, plays the page for a model, a picture or a sound too, and
gives every target it prints its own runner; it keeps no pass from an earlier run. Nobody waits for it.

- One run at a time. Pushes that arrive while it goes wait as one: the next run covers all of them,
  because it compares with the last pass, not with the push before.
- A failure opens an issue labelled `main-red` (or comments on the open one) with the shards that
  failed, links to their logs and stills, and the commits since the last pass. The next pass closes it.
- Reproduce a shard with its name: `tools/check.sh clip`.
- The story is played in three parts there, one a runner (`CHECK_SPLIT=1` in the plan): `story1` from the title to
  frame 4's print, where the log has been read; `story2` frames 5 and 6 from a case left at frame 5 (`FROM=4 UPTO=6`);
  `story3` frame 7, its summation and the last card from a case left at frame 7 (`FROM=6`), where the frames offered to
  go back into are the ones played and the first. Together they play every frame and every check of `story`; what they
  do not see is a case carried in one page across frames 4 to 5 and 6 to 7, which `tools/check.sh story` (the whole
  play, on a session's machine before landing) still plays. A runner played the whole story in 75 minutes (#51).
  The walk and the guide are split the same way, so that no runner is the long pole: `walk1` the desktop's page and
  `walk2` the phone's (together 17 minutes on one runner), `guide1` his ways and `guide2` his body (19).
- **Only a commit it passes is published.** `.github/workflows/pages.yml` runs when this workflow ends on a
  push to main, and only on a pass: it publishes that commit to GitHub Pages, tags it, and moves the branch
  `live` to it, which Vercel's production deploys (`vercel.json` builds `main` and `live`; the Vercel project's
  production branch is `live`). A red main leaves the site on the last commit that passed. Deploy to Pages run by
  hand publishes main as it is.
- Each browser shard prints which renderer it got (`tools/gl_renderer.js`): llvmpipe, or SwiftShader when the GL
  backend could not start, about three times slower. Chromium's download and the shaders llvmpipe compiled are kept
  from one run to the next (`actions/cache`).
- The browser shards run on `ubuntu-24.04`, whose Mesa (25.2) is a session's machine's, where each check's waits were
  measured. `ubuntu-latest` became Ubuntu 26.04 in November 2026 (Mesa 26.0, LLVM 21), and main went red for a day
  and a half without a step named (issue 49): there the desktop page's walk at night in the rain had not set out in
  ten minutes against three, and the clip check's page lost its WebGL context in its first half minute, run after
  run. Moving to a newer image is a change of its own, with every shard run on it by hand first
  (`workflow_dispatch` with the targets `all guide`).
- A browser check's log says what the browser said (`tools/browser_watch.js`): `gl:` the page's lost and restored
  contexts, `page:` the page loading again by itself or glcare's note, and `gpu:` what Chromium and its GPU process
  wrote in their own log about the GPU (kept whole as `<check>-chrome.log` beside the check's log, in the run's
  artifacts). A click or a still waits three minutes for the page, not Playwright's thirty seconds. When a harness
  dies with no step named, check.sh's line gives the error it died of.

**By name only: `game`.** `tools/game_check.js` was written for the game before the story: some 260
steps of one scenario, half an hour on a software renderer. Its steps for what was removed (fishing,
the daily life) are gone and it opens the free game, but it has not been run since the cut-back and
steps that expect the old game's fares, phone or ferries may fail. It is in neither tier until it has
been run and trimmed: `tools/check.sh game`.

## The command

```
tools/check.sh                      # the fast tier, for what this branch changed
tools/check.sh --plan               # the targets that would run, one a line
tools/check.sh static               # the checks that open no browser
tools/check.sh story                # one target; several: tools/check.sh story mem
tools/check.sh all                  # static look story guide walk ride mem audio clip gl touch astc
CHECK_TIER=full tools/check.sh      # as main runs it
CHECK_BASE=<commit> tools/check.sh  # what changed since that commit
CHECK_FULL=1 tools/check.sh         # the whole branch, not only what changed since the last pass, and no pass kept
CHECK_CACHE=0 tools/check.sh ...    # every check played, none kept from an earlier pass
CHECK_STATIC=0 tools/check.sh ...   # without the static checks (a runner's shard)
```

Logs and stills go to `$CHECK_OUT` (default `/tmp/oe-check`). The free game's clock is pinned
(`GAME_TIME`, default `2026-11-02T10:00` in Tokyo's time, `tools/pin_clock.js`), so a run does not
depend on the hour it is started at. Under `xvfb-run` (when it is installed) Chromium draws with
Mesa's llvmpipe; without it, headless with SwiftShader. Where `timeout` is missing (macOS) a check
runs for as long as it takes.

## The router and the cache

Where the time went, measured on 20 November 2026 (main's run of every target, and the sessions' own reports in main's
merge commits): the static checks took 23 s on a runner; the story 8.5, 10.5 and 8.5 minutes in its three parts, the
guide 19, the walk 17, the ride 7, mem 3, gl 3.6, touch 2.9 and clip 1.3. On a session's machine the story plays in 950
to 1100 s. Any change under `web/` ran the story, the walk and mem there, 35 to 40 minutes, and a change to `story.js` or
`game.js` the guide or the ride as well, an hour; a session ran it five or six times. In the ten days before, the files
most often changed were models: the people's alone came to 1,132 changed files in main's commits, twice everything
under `web/data`. A model rebuilt with its names as they were played the whole story to find nothing the story could have
done differently.

So the fast tier now asks two questions before it opens a browser, and the ideas behind both are taken from
DeepSeek's published work on spending compute only where it changes the answer (their papers and repositories, MIT
licensed; the ideas only, no code):

- **Each change to the checks it can reach** (DeepSeekMoE, 2024: a router sends each token to the few fine-grained
  experts it needs, beside a shared expert every token uses). The static checks are the shared expert, run for any
  change but the docs. A model, a picture or a sound goes to `look` and `mem`; code and data to the page's checks; a
  harness to the checks that require it; a builder's source to `static`.
- **A cheap index of what matters** (DeepSeek's Native Sparse Attention, 2025, and the lightning indexer of
  DeepSeek-V3.2, which picks the few tokens worth attending to before the expensive attention runs). For a model it is
  its interface (`tools/model_contract.py`): the names of its nodes, bones, clips, materials and meshes, the flags
  Blender left on them (extras, three.js userData), the attributes and morphs of its meshes, the extensions it requires.
  Read from the GLB's JSON header, without decoding a buffer, in milliseconds. A model that kept all of it cannot send
  the story another way; one that lost or changed any of it (`camera_strap1964` gone from Kagami, say) runs as code.
  What a model adds is allowed: nothing in the code is waiting for it.
- **Nothing computed twice** (DeepSeek's context caching on disk, 2024: a prompt's prefix seen before is read back, not
  computed again). A browser check reads its harness and whatever the page fetches from the server `tools/check.sh`
  starts, and the server's log names every file. After a pass `tools/check_cache.py` keeps, in the clone's git
  directory (`.git/oe-check-cache/`, never committed, so a fresh session starts with none), the list of those files with
  a hash of their bytes, the harness's files (the scripts and every module they require), the functions `tools/check.sh`
  runs it with (a change to the router or a comment keeps the pass), the story's `city.json`, and the settings that steer a run (`GAME_TIME`, `DRAW`, `AT` and the like). The next run plays the
  check only if any of that changed. A file the page asked for and did not get is kept as missing, so adding it counts.
  A file edited while the check ran keeps the pass from being kept. A run against a server it did not start (no log)
  keeps nothing. The page reads the same files for the same bytes because its clock is pinned and its draws are
  seeded; what the cache cannot see is the browser itself changing in the same clone (another Chromium, Mesa or
  Playwright): `CHECK_CACHE=0` then. `CHECK_FULL=1` and the full tier keep nothing.
- **No device the long pole** (DeepSeek-V3's load balancing without an auxiliary loss, and EPLB, which copies the
  busiest experts so that no GPU waits on another). On main the walk and the guide were the last runners home, 17 and 19
  minutes against the story's parts at 9 to 11; each is split in two (`walk1`, `walk2`, `guide1`, `guide2`).
- **The profile first** (DeepSeek published the profiles of its training and inference with DualPipe and EPLB, 2025).
  Every run ends on a line with the time each target took, from the same clock (`$CHECK_OUT/times.txt`).
- **A cheap draft, an exact check** (DeepSeek-V3's multi-token prediction, used to draft tokens that the full model
  then verifies). The fast tier on a branch is the draft; the full tier on main routes every model and picture to the
  story too and keeps no pass, and only a commit it passes is published.

What a model change costs now on a session's machine: the static checks, `look` (the changed files, seconds; every
file under `web/assets`, 18 s) and `mem` (a few minutes), against 35 to 40 minutes before. What it does not see, and
what a session still owes a visual change: how the model looks in the street at the episode's hour, in stills on a
desktop and a phone ("Checking your own work" in AGENTS.md); `look`'s stills are the model alone, before and after.

## Unsteady steps

A change that breaks something breaks the same step every time. So when the clip or the game check
fails, it is run a second time, and the run fails only on a step that failed both times, or on a run
that ended without naming a step (a crash, a timeout). Two runs with no failed step in common print
`FLAKY` and pass. On main, each `FLAKY` line is added to the issue labelled `check-flaky`: a step
that is named there often is the one to make steady.

A step that acts and then reads waits for what it reads, not for a fixed time (`tools/walk_play.js` `until`,
`pressFor`): on a slow runner the desktop walk read Back's state 2.5 s after the press, a frame before Back was
drawn, and every beat after it failed (issue 49). A press whose state has not come in 20 s is measured and made again.

The free game plays the same game in every run: the traffic's trips, the dispatch's tie-breaks and
the talk draw from seeded runs, the date is pinned (the weather is a hash of it), and nothing a held
frame does steps the world. `DIGEST=2` writes a digest after every step of the world, and the first
one two runs disagree on names the step (`tools/game_soak.sh`).

## What is not checked

- The story past its first episode: `tools/story_play.js` plays episode one. A new episode adds its
  beats there.
- A real GPU, WebGPU, Safari and iOS: the checks run Chromium on a software renderer.
- What a person sees. For a visual change take stills (`tools/game_shot.js`, `tools/story_play.js`,
  `tools/scramble_shot.js`) on a desktop and a phone, at day, dusk and night, and look at them.
  The roll's file (its kraft paper and hand) without playing the episode: `tools/file_shot.js`.
  The loading screen's three pictures, held at each and at two dissolves, checked to come up in order inside a
  desktop's load and never to let the frame dip: `tools/loader_roll.js`.
  The pictures themselves are filmed by `tools/key_shot.js` (views in `tools/views/key-art.json`): the map
  without the story at the episode's date and blue hour, every mark the game puts in the world held invisible
  (the goal's beam, the story's beacon, the route, an NPC's "!"), only the WebGL canvas read (no HUD or bars),
  the crowd mustered at the kerbs and cleared from the lens's wedge, so the title's band (35-60% of the height)
  falls on sky or open street on a desktop and on a phone's middle quarter. It prints any mark left visible.
- Whether the interface fits every screen: `tools/ui_fit.js`, by hand after a change to the story's or the walk's
  screens (it is not a target: it lays out recordings a story play made). The title in each of its states (first
  visit, who you play chosen, a case going, a case closed) is opened for real, on the screen it is about (the press as
  the page opens, the menu, who you play: `window.__game.titleScreen`); every other screen is laid in again from
  what `tools/story_play.js` and `tools/walk_play.js` wrote down at their stills with `UI_DUMP=dir`
  (`tools/ui_dump.js`): a desktop's play at 1024x768, 1280x720, 1440x900 and 1920x1080, a phone's (390x844, by touch)
  at 320x568, 360x740, 390x844, 412x915, 844x390 and 768x1024, each at the log's three word sizes. It fails on words
  out of their box or off the screen, words cut by a box that clips them or cut short with an ellipsis, words a
  scroller cannot reach, the page scrolling sideways, and buttons over buttons, and takes stills of one screen of each
  kind at every size (`STILLS=all` for all). In November 2026 it found the title's three buttons running into one
  another at 690 px, the prints and the roll overlapping at 1024 px, a phone on its side with the dialogue off the top,
  the hint over the camera's button, and the title's top out of reach on a 320 px phone. Its "who you play chosen"
  state stored the choice as `"M"` (in quotes, which the game does not read as a choice) until November 2026, so every
  title it opened still asked who you play; it stores `M` now.
- The title's ways in as one list: `tools/title_menu.js`, by hand after a change to the title's buttons (`story.css`
  "the title's ways in", `walk.js`, `game.js` `titleLead`). On a desktop's page (1440x900) and a phone's (390x844, by
  touch), as a player who has chosen, with no case going and with one, the menu opened from the press by a key or a tap: it fails a menu that is not the walk, the story and the
  options (with a case going, Continue first and in the amber), rows not all one width and height (or under 48 px on a
  phone), the Enter key on a row Enter does not take, up and down that do not move the hand along the list, the walk's
  step not opened by Enter or a tap and not left by Esc or Back, the story's screen not opened whole (its episode, its
  line, a roll of seven, the hand on Begin; with a case going, how far, the frames on the roll, Continue and the evening
  again) or not left back to its row, the evening again that does not ask first or loses the case by asking, and the
  options not lent the pause menu's controls or not giving them back. Stills of each screen.

## How it came to this

Until November 2026 the project built some twenty-five maps, and the check played every live one's
game for any change to the shared code: two hours on the landing session's machine. It was split
into a fast tier before landing and a full tier on main afterwards, one runner a target, reporting
rather than blocking (the common shape for a repository with expensive end-to-end tests; Google's
TAP and Chromium's commit queue are the published descriptions, and no code was taken from
either). The two tiers and the `main-red` issue remain; the maps, the smoke cities and the
per-city shards went with the cut-back to one story on one map (the tag `archive/world-2026-11`
has them). In November 2026 the fast tier learnt to route a change to the checks it can reach and to keep a pass whose
inputs had not changed ("The router and the cache"): the selection by what a test depends on that Bazel's action cache
and Meta's and Google's test selection describe, with the router's ideas taken from DeepSeek's sparse models.

## The story's places and the roof's escalators

Three checks by name, each a minute in a browser (`GPU=metal` on a Mac, `PORT` for a server already up):

- `node tools/story_clear.js`: every place the story stands someone or sends the player (cast, afterimages, where a
  picture is taken from, where a car or a flight sets you down, the things of 1964 in tonight's street) is on a floor at
  its own height and can be walked on, not in a wall or a fence.
- `node tools/escalator_walk.js shibuya`: each escalator carries a walker from the floor before it to its far end (the
  north one up to the roof, the west one down), nobody walks in beside its steps, and nobody steps off them sideways
  between its landings (a walker did, into the slot between the escalator and the stair, and stood in the balustrade).
- `node tools/escalator_route.js shibuya`: a route on foot rides a moving escalator only the way it runs: from each lift's
  stop beside one to every place a story frame stands the player on the floor above, and from the floor before each
  escalator to the floor past it and back. The gold line from SHIBUYA SKY's 46F lift once led right, up the stair beside
  the escalator that runs down, because the lines up the north escalator and stair stopped at the roof short of its paths
  (`web/game/route.js`: a strip's landing joined over its floor, the network's edges and its ground search one-way along
  moving steps, a metre ridden costing half one walked). `tools/story_play.js` runs the same at frame 4 of the first
  episode, so `tools/check.sh` has it, and takes a still of the line from where the lift lets you out (`4-lift-way`).

And one longer, about twelve minutes: `node tools/glass_body.js [out_dir]` walks, runs and stands the player into each
escalator's glass and along it (pushed sideways on the steps, across both landings, slantwise past the newel) and into
the roof's rim glass from eight directions, and measures every frame the skin of the rig as the clip poses it, part by
part, against the glass's plane and the collision world's walls; it fails on any part more than a centimetre in. With
an out dir, stills close and from the chase camera at each, and five with time held.

