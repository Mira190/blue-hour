# The checks

`tools/check.sh` is the one command that decides whether work may land. The project is one story on
one map (Blue Hour, at the Shibuya Scramble; [STORY.md](STORY.md)), so there is one page to check and
the script is short: a set of checks that open no browser, and a handful that open the page.

## The targets

| Target | What it does | Tool |
|---|---|---|
| `static` | Everything that needs no browser, half a minute together (below) | several |
| `story` | Plays the episode frame by frame to its last card: the street runs, the Stop comes, the afterimage speaks, the photograph is taken (a frame spent only with the lens on the subject), the world runs on, the last card with its two ways on, and its Walk Shibuya taken up in the same night (the card gone, the walk's corner up, the evening's people gone once the lens turns away). A still at each beat. Without a GPU one frame in thirty is drawn (`DRAW=30`) and the rest run the game without their draw calls, their clears, their `renderer.render` (the world's matrices and every `onBeforeRender` still run) or a wait for the display's next frame, so that the story keeps its own time on a software renderer; the stills and the photographs are of frames drawn whole, and the page's frames are held while a still is taken of the frame drawn last (#51); a still is of one frame drawn whole (#78), in which the ambient occlusion is worked out twice and the street mirror drawn, as the first of the two frames a still once took left them for the second (`ONE=0`: two, as before). In a frame not drawn the page asks the GPU nothing it would wait for (no `getError`, no read back of the rain's cover map) and places no minimap or street names, and the play's last line says where the wall's time went (#70; docs/PERFORMANCE.md). Every frame the game notes each of the crowd drawn (near or far copy) within 0.45 m of one of the story's people, the player or the guide (`game.js` `bodiesCheck`), and any one fails the play: the crowd keeps clear of everyone standing who is not of it (`actors.js` `api.bodies`, issue 65) | `tools/story_play.js` |
| `walk` | The title's way in under the story (its list led by the story, the walk second, every row one size), on a desktop's page (800x500) and a phone's by touch (390x844): Walk Shibuya only after who you play, its hour and sky as the street behind the card, Back to the story's evening, its opening flight seen to play (its title in the bars, high over the city) and ended by a key or a tap, out on the street with no goal, no light and nothing of the old free game (its keys open nothing), where and when in the corner, walking, the menu with the story in it, the camera; tonight's set dressing up in SKY GATE's lobby; Mei's story at Hachiko told to its end (her amber speech mark, her talk in the story's box, what she asks under the hour, Riko across the crossing, the story's name put up: `walktalk.js`); Taro's on the roof asked, and met by a photograph of the crossing from the helicopter over it (not by one from the roof on foot); a photograph of Hachiko the first of the views of Shibuya, its picture in the menu's album; the office's call on the first walk, the car's button lit while it is spoken of; Ren's street moment answered by a choice and thanked; your car driven (its keys, its speed in the corner, out once stopped; on a phone its buttons), called from the corner's Your car (it pulls in at a kerb near you) and brought to the kerb from the menu; SKY GATE's lift ridden in the dark to the top stop; the helicopter on the roof boarded, flown up (its keys, its height) and landed; on the desktop also the last card's fresh-page way out. Stills of each beat | `tools/walk_play.js` |
| `guide` | Leads the story's guide along each frame's way (frame 4's as the story gives it, and four others from the story's data) with a player behind him on his trail: every quarter second a ray down onto the drawn scene under his feet (a fault more than 6 cm above it or 8 cm into it), his room either side across the way (`ways.room`: a fault where the way is wider than 3.2 m and he, or the way he plans, runs within 0.8 m of a wall, a drop, a well, a kerb or a post for more than 1.5 m; not within 2.5 m of where the way steps onto or off a crossing, where it crosses the kerb's line), and the mark with the signs out as for a lost player, the view turned four ways: what it points at must be on the way and walkable to in a straight line, its metres the way's. Then frame 4 once more with a player who runs their own way from the west side of Hachiko Square's north planter (`tools/guide_own.js`, issue 207): a fault if he stands with a step asked for and not gone for 1.5 s, waits while the player is further along the way than he is, or holds them at his flank; `tools/guide_follow.js` sweeps every side of both planters and two whole leads, by hand. Stills behind the player. Run when the guide, the routes, the walking grid or the marks change (`companion.js`, `route.js`, `nav.js`, `story.js`) | `tools/guide_way.js` |
| `roads` | The road plan in the game (docs/ROADS.md, issue 167). From two kerbs for three minutes each: no vehicle made on a quiet street, at a wall or within 120 m, buses made on bus streets and keeping to them, no two vehicles one inside the other for over 3 s, no queue held for good, traffic coming in and going out. Then the Scramble counted at its stop lines for four minutes: no cycle over 130 s, no arm whose greens pass nobody of a queue (issue 175). Then the walk's drive to 109 on the autopilot from three starts and one back across the Scramble, each arriving within its road at 6 m/s and one cycle of the Scramble; a failed drive is run a second time, and fails only where the same start failed both times (else `FLAKY`). About fifteen minutes | `tools/road_traffic_watch.js`, `tools/junction_flow.js`, `tools/road_drive.js` |
| `ride` | Takes frame 6's car (the one the story sends) from where the flight sets you down to Hachiko, stepping the world on and checking every car (the ride, your own, the traffic) against every person (the crowd, the NPCs, you) at every step: it fails on any car standing in someone. `PIN=5` plays the skip's case instead: five of the crowd held where the car will stand at its stop, then F (#50). You get in from the kerb seat's door; `PASS=1 SIDE=road` plays #94 instead: you stood off the car's road-side flank as a car of the traffic passes over the spot, which fails every run (`tools/lane_you_probe.js`: a walker set down in a lane ahead of a car, which the traffic never drives into, and one set down inside a car, counted for the one frame before its step moves them out). When the car gives way to a car across its way, each step's line names that car (`xb`: its speed, why it stands and for whom); a ride that did not arrive ends with what held it up, ten cars down the chain (#97). The cause found was a car inside another when it came into sight; the driver now has a bound on standing that no change of reason sets back, and the story one of its own (docs/STORY.md, "The car always comes"); `tools/ride_come.js [trials]` sends for the car again and again and prints what each stood for (`FORCE=overlap`, `FORCE=hold`: the two cases made to happen). Against the rails as drawn too (#208): the ride's box, every step from when it is sent, against the guard rails and posts the hero levels draw (`tools/rails_drawn.js`), and at the door where you get in and where it sets you down, no rail between the door and the pavement; then, set down by Hachiko, you walk the station's free passage (frame 4's way to SKY's lift) in and turn and drag the view at its far end, the lens never over or through its ceiling, as drawn and as built (`tools/cam_ceiling.js`; `PASSAGE=all` the whole walk, `PASSAGE=0` none). Prints the ride's mean speed on the move; stills from behind the car. Run when the drivers, the cars or the crowd change (`web/game/cars.js`, `actors.js`, `game.js`) | `tools/ride_people.js` |
| `mem` | Opens the page as an iPhone on the low tier and fails it over the memory budget (peak GPU memory, read with a conversation's depth of field up in the rain at ten at night, the heaviest a player holds; settled JS heap), so that a phone's tab is not killed; then the story as a desktop to its title, the loader's own vertex buffers against 140 MB; counts a phone's lost context as a death at once, once (`tools/lost_check.js`); and plays the story's page through a lost WebGL context as a phone: a death makes the next load lighter, the reload waits for a tab put away to be seen (a minute) | `tools/mem_check.js`, `tools/lost_check.js`, `tools/glcare_phone.js` |
| `budget` | Plays the episode as an iPhone (390 x 844 at three pixels to the point, the low tier) and counts every still's frame: each beat's draws, triangles, passes, pixels shaded and GPU memory against a phone's budget (`tools/budgets/shibuya.json`; docs/PERFORMANCE.md, "A budget for every beat"). The `story` check counts its own stills against the desktop's budget as it plays, and the static checks hold the counts of a kept play against the budgets as they are now. Main's full tier runs it for every change to the page. Before landing it plays in the story's three parts, `budget1` (frames 1 to 4), `budget2` (5 and 6) and `budget3` (7 and the last card), each only where the change reaches it ("A phone's beats before landing", below) | `tools/story_play.js` with `BUDGET=`, `tools/beat_count.js`, `tools/gl_mem.js`, `tools/beat_budget.py` |
| `storyp` | Plays the episode on a phone's page by touch (390 x 844, the low tier, `TOUCH=1`): every answer, every line passed, the camera, the release, a hint, the roll, the cards, the order and the helicopter's door are taps of a finger where the thing is on the screen, not a key, a script's click or the story's own functions. A thing that cannot be tapped (off the screen however the page is scrolled, or under something else) fails the play, and is then clicked so that the play goes on and names the rest. Main's full tier only, a runner of its own (issue 120) | `tools/story_play.js` |
| `storyl` | Plays the episode down its losing branches, as the man (`PLAYER=M SLIP=3,5,6,7 CHOOSE=3:0,4:0 SPEND=5 BACKTO=3`): a lie at the police box, two guesses at the foreman and at Mr Tanaka's pitch, each seen through and asked again where it was lost (issue 93), the summation's first question answered wrongly until she says it herself; the false solution said aloud and the lecturer named, and every line the story says only to one who chose so heard, filed or on the last card; frame 5 spent from the wrong place (its card kept once, then spent), so that the summation's first question is asked in words alone; and from the last card frame 3 gone back into and played to its print. Not played by it: the other frames spent (`SPEND=4` leaves frame 5 nothing to cross-examine with, `SPEND=2` frame 6 nothing to show; run them by hand), *I cannot tell yet* (`CHOOSE=4:2`), silence (`SILENT=3`) and *Play it again*. Main's full tier only, a runner of its own (issue 120) | `tools/story_play.js` |
| `audio` | Every sound on the audio thread, as an iPhone makes it ([SOUND.md](SOUND.md), "Every sound on the audio thread"): the reverbs a phone hears held to the whole convolution (energy decay by band, the seam, echo density, left and right); every one-shot the street and the story make played many times over, failing on a graph that is larger once they have ended than before them (a node left on the mix is visited in every block) or a sound begun at or before the context's time; the sound's giving up (voices capped, the room and the street's beds let go as the output's clock steps, taken back after ninety quiet seconds); the mix of each place (the level of each of the world's buses read from the graph at set listening points on the real page, the kerb, under the railway's deck, the roof, a lift, the helicopter's cabin and the car's, each in the range of SOUND.md's table; the same train a pass-by at the kerb, weight under the deck and nothing on the roof; nothing of the moving world past the tape at a Stop; as a desktop and as a touch screen); then the page played as an iPhone (the opening shot by shot, a Stop and its choir, every room, the live score), failing on a convolver on the live context longer than WebKit's realtime limit, a second context, a worklet, or anything spoken in the opening; and again touched first on the title, failing on two pieces of music at once in the opening. Run when the sound changes (`audio.js`, `music.js`, `overture.js`, `film-score.js`, `trains.js`, `walkcalls.js`) | `tools/reverb_check.js`, `tools/audio_graph_check.js`, `tools/audio_shed_check.js`, `tools/sound_places.js`, `tools/phone_audio.js` |
| `clip` | Measures what passes through what in the free game (`?walk=1`): street furniture in the roads, cars in each other and in posts, people in cars and walls | `tools/clip_check.js` |
| `gl` | Opens the map as an ordinary device does, with the governor's extras shed and multisampling on, and asks WebGL for its error (once in 256 calls, since each asking waits for the GPU and asking after every call made the load fifteen times as long; a run that finds an error is played again with `EVERY=1`, which names the call and where it was made); walks the governor's ladder down and up by day and in rain at night, and fails on any error or any program that did not link; all of it as a GPU with sixteen texture units (`?units=16`, an Apple GPU's or a phone's), where `tools/sampler_probe.js` also walks noon, dusk and night, clear, rain and snow, at each of the governor's states, and fails on a program over sixteen samplers, one that did not link, or one the page counted lower than it linked (docs/PERFORMANCE.md, "Sixteen texture units") | `tools/gl_error_probe.js`, `tools/sampler_probe.js` |
| `touch` | Plays the free game by touch on a phone's page, where no key can be pressed | `tools/touch_check.js` |
| `astc` | The device-side ASTC encoder (`web/astc.js`) against a real decoder: each picture's quality, and a cut-out's mipmaps and edge against its own colour (the guide's coat went grey on a phone where they strayed) | `tools/astc_check.js` |
| `launch` | What a player who comes back meets (issue 116). The site as two commits, each stamped as a deploy stamps it, from a server that keeps what GitHub Pages keeps: the second loaded in a browser whose cache holds the first, and every file it used the second's, every request with its file's hash, the page the second's, the case left going still offered. A start that fails saying so, on a desktop and a phone: a script that does not arrive, an error before the first frame, a browser without import maps, a pack that stalls or is never answered (given up, asked twice more, the loader's error state), a pack answered 503 once (asked again, the load goes on). A case kept by another build of the story not taken up, the title saying why; storage full; the page's storage keys its own, the old ones copied once | `tools/launch_check.js` |
| `hold` | Every avatar the street casts (`game.json` `crowd.cast` and the map's people, both sexes) through every clip it holds something in (Phone, Reading, Documents, Drink, Photo, Talk, Idle), at 30 frames a second on a lineup (`web/game/lineup.html`), as the page poses it and as the clip was made: how deep each forearm, hand and what the hand holds go inside the person's own torso, measured on the skinned mesh (`tools/hold_depth.js`: a point is inside where level rays meet the torso every way round), and how hard each wrist changes its pace from one frame to the next. Fails over 2 cm in, or a jerk the correction added. A minute; when `web/game/people.js` or the people's models change | `tools/hold_check.js` |
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

The walk's storyline without a browser: `node tools/walk_story_unit.js` plays its five stories through in their order
from `game.json` and fails on two people with a part at once, two stories begun at once, an empty corner, a photograph
from the roof on foot taken for the helicopter's, a story left untold, a corner's arrow that does not point the way, or
a view of Shibuya not found (or found twice, or from the wrong height) by a photograph, or a street moment that does
not begin unseen 30 to 110 m off, does not lapse when walked away from, or is not thanked. Run it when `walktalk.js` or `game.walk`
changes. The walk's people (`web/game/walktalk.js`, `game.json` `walk` and the `walk: true` people in `npcs`) are looked at in
stills: `tools/walk_people.js out [WxH] [hour] [sky]` sets out on the walk, waits for each to be drawn, and takes each from
twelve metres with their speech mark and from three in front, printing where each stands and whether that is in a road.
The walk as a review looks at it (issue 134): `tools/walk_review.js out [WxH] [hour.sky,...]` sets out on the walk, presses
the menu's own hour and sky for each condition, and takes the page (the walk's interface in it) from standpoints in three
sets: `hud` (round the scramble, turned eight ways, so the corner and the keys are seen over every picture), `edge` (out
along six ways from the hero level's centre at each distance in `RINGS`, the footway nearest that point, looking on and
back) and `menu` (the menu, its foot, the camera). It prints for each still where you stand, how many of the crowd are out,
and what of the interface lies within `EDGE` px of the screen's edge. `tools/views/walk-heights.json` is the scramble from
the heights the walk reaches (on foot to 400 m), for `tools/scramble_shot.js`. Neither is run by `tools/check.sh`: they
are for looking, and what `tools/walk_play.js` does not play is listed in issue 134.
The walk's night by the hour (`web/game/tonight.js`, docs/STORY.md "Tonight"): `tools/tonight_play.js out [WxH]` sets the
clock to just before each moment (CROSSING LIGHT, the shutters, the screens, the last trains), fails if its line is not in
the corner before, its name not over the street as it comes, the searchlights not on, a train runs after the last or none
again in the evening, or the menu has no timetable; and takes a still of each (`ONLY=light,last` for some).
The walk's opening (`game.walk.overture`, STORY.md "The walk's opening") is looked at shot by shot: `tools/walk_open.js out
[WxH] [hour] [sky]` sets out as the story's last card does on a fresh page, holds the film on a virtual clock, takes a still at
a few points of each shot (`K`, `SHOTS`) with the bars, the title and the names, prints the camera's clearance over the
roofs and from the trees' crowns (failing under 4 m) and ends on your shoulder; `FILM=1` films it whole with its score, `VIEWS=file` places free
cameras over the walk for scouting. The frame's cost part by part on the walk: `tools/perf_walk.js [WxH]` runs `game/perf.js` (`?perf`) from a harness
(shares on a software renderer; a real device's own table comes with its telemetry, issue 67).

What lights a person (issue 123): `xvfb-run -a node tools/cast_probe.js [HH:MM]` opens the walk at that hour and prints the
scene's lights in numbers and, for the one you play, whether each material's program carries the cast's light and the
hair's (`web/game/people.js` `castPatch`, `hairMaterial`): for when a still of a person shows no change.

The story's faces (`web/game/face.js`, issue 12): `tools/face_check.js out [WxH]` plays the episode (story_play.js's
settings: `FROM`, `UPTO`, `DRAW`) and at every talk shot asks whether the speaker's face moves, cropping a still of it
(`face-talk-NN-*.png`); on the first two-shot it holds time for five seconds of stills and fails if an eye bone or a shape
moved at all (a pose laid over the clip that builds on the frame before winds round while time is held), then steps five
seconds a thirtieth at a time and fails without a blink, without the mouth moving while the line is typed, or with the eyes
more than 35 degrees off the head's ahead. `story_play.js` itself notes each line whose speaker's face does not move. Run
when the faces, the speaking cast or the people's models change, on a desktop and a phone.

The way in waits for the level the player stands in (`web/game/game.js` `holdForLevel`, issue 62): `tools/level_wait.js
[out] [WxH]` begins the story with the Scramble's level held back (`DELAY`, 12 s by default), skips the opening as soon as
it can, and reads the veil, the level and the camera every fifth of a second; it fails if the camera reaches the player
before the level is drawn while the veil is down, or if the wait runs past its bound (6 s). `CRANE=1` takes the crane
down from the title instead (`?overture=0`, reduced motion); `BOUND=200` gives the page a bound longer than a software
renderer takes to make the level ready (before issue 69 it was queued behind the title's other warm-ups here, some 100 s), to see the veil
lift once the level is drawn; `DELAY=0 LOG=1` prints the page's compiles and the level's warm-up steps as they finish (with the level put first, issue 69, it is ready before the skip here and no veil comes up). Run when the way into the story or a hero level's loading changes. A phone's light on the
corner after dark (`web/neon.js` `pooled`) is looked at in stills: `tools/game_shot.js shibuya
tools/views/corner-night-62.json out [390x844 with LEAN=1]`, beside the desktop's; `game_shot.js` now waits for a hero
level that is loading before a still, which on the low tier here is half a minute (before, a phone's stills of the
Scramble were of the city's own model).

Four of the story's probes are run by hand, when what they look at changes. The guide (`web/game/companion.js`, his
film in `story.js` `meetGuide`): `tools/guide_meet.js` plays the first Stop, takes stills of his film, fails if his way
to you passes within 0.42 m of a held person's middle or ends away from you, then runs after him at the game's own run
and fails if he is behind the player more than a quarter of the time. A frame whose place is found (`task.find`):
`tools/find_probe.js` plays it to its camera and takes stills, with what the finder says, from where the world stops,
from the standpoint and from points given (`AT=x,y;x,y`), so that the words and the place are seen to agree.
The end of the first talk (`story.js` `camCan`, `camWait`): `tools/talk_end_probe.js` plays to Sumiko and passes her
lines as a hand does (E on a desktop, a tap on the words on a phone; `MASH=1` presses F or taps several times a second and
on past the last line), then fails if the camera came up or its button was offered off the light, or if in the light the
button is not there or does not raise it. Stills of each.
The opening (`story.js` `jobBegin`, `hud.js` dialogue `free`; docs/STORY.md, *The opening rebuilt*): `tools/opening_play.js`
plays the first frame from the order to the second frame's goal and fails if the player cannot walk while the office's
call is said, if the camera comes up before the call asks for the picture, if the world stops with her corner behind the
camera or not in the finder once it is held there, or if a call holds the player after the first print. Stills of each beat.
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
- the ground graded by the method as it is, its roads' cross-falls and creases within their limits
  (`pipeline/street_ground.py --check`: lost from the script in a merge of 18 November 2026, after which the map
  stood on an older grading for three days and nothing said so; back on 21 November);
- no landmark hanging in the air (`tools/float_check.py`), no sign or screen behind another landmark
  (`tools/sign_clear.py`), no sign that reads mirrored (`tools/sign_check.py`): a picture against its own winding,
  two faces of a sign built back to back the wrong way, or a face wound right but turned to a wall (cast from its
  middle along its normal and back: blocked within half a metre in front and open behind, against the landmarks'
  triangles and the buildings' walls, glass and nets left out), which is seen only from behind, mirrored (the JR
  bridge's clearance sign over the road by Hachiko, 21 November 2026); or an upright picture with nothing within half
  a metre behind it, which anyone passing behind, looking down from a deck or flying over sees mirrored (the
  station's scaffold advert, from SKY's street hall). Every upright landmark picture is given a plain painted back
  5 cm behind it when the landmarks are built (`pipeline/landmarks.py` `sign_backs`, the mesh `sign_back`), which
  the turned-to-a-wall test looks past; `python3 tools/sign_check.py --hero` casts the
  hero levels' own signs the same way (about two minutes, so run by hand when a level's signs change); and no
  vehicle's name mirrored or facing into its model (`tools/decal_check.js`: the helicopter's registration and
  operator, the ferries' names);
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
  `cities/shibuya/city.json` runs `static`, the story in its three parts (`story1`, `story2`, `story3`), the same parts as a phone draws them, each beat against its budget (`budget1`, `budget2`, `budget3`), the walk's desktop page (`walk1`) and `mem`; the sound adds `audio`,
  the drivers, the cars and the crowd `ride`, the guide and his ways `guide`, and what a phone alone runs (its tier in
  `quality.js`, the tour's touch words in `onboard.js`, its district under `web/data/shibuya/d/`) the walk's phone page
  (`walk2`). In the sessions of 18 to 21 November the phone's page failed twice, both times beside the desktop's, and
  cost 9 of a run's 42 minutes; main's full tier plays both pages and `touch` (issue 95);
- a change of models, pictures or sounds alone (`.glb`, `.webp`, `.png`, `.jpg`, `.avif`, `.ktx2`, `.mp3` and the like
  under `web/`) runs `static`, `look` and `mem`, and of the story only the counting of its beats: such a file can
  change how the street looks, what a phone holds and what a beat costs to draw, not where the story goes. So a model
  or a picture asks for the story's parts on both tiers (`story1` to `story3` count the desktop's beats, `budget1` to
  `budget3` a phone's), and each part that never fetched the file is kept; a sound asks for none. Not so the guide dog's model (his body's size is taken from it), a file
  removed, or a model that lost or changed a name, a flag or an attribute the code can ask for, or whose ground moved
  (`tools/model_contract.py`; a hero level's ground meshes are what everyone walks on): those run as code does. The
  people's models and their index (`web/assets/people/`) are behind their own contract (`tools/people_contract.py`,
  with the static checks): a set that gives what the page asks of it is looked at and weighed, whatever its nodes
  are called ([SEAMS.md](SEAMS.md));
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
- a browser check whose last pass read nothing that has changed since, or nothing whose change can reach it, is not
  played again: its line says `kept from its pass at <commit>` and why ("The router and the cache" and "Checks by
  reach", below). The pass is this clone's, or main's where the clone has none ("Main's passes, shared"). After a fix
  to one check, a run plays that check and whatever the fix reaches, not the rest again;
- the browser checks play side by side, as many as the machine has cores and memory for (two on a session's
  machine), and the static checks beside them ("The checks faster").

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
  `walk2` the phone's (together 17 minutes on one runner), `guide1` his ways and `guide2` his body (19). Since issue 192
  the desktop's page is two halves, `walk1` from the title's way in to the seat on Hachiko's wall and `walk3` from the
  walk's line to the end, set out at once (`tools/walk_play.js` `WALK_PART`): the buildings' cells in one draw cost a
  software renderer a third more on the beats that cross the city (1016 s to 1373 s here, 24 November), and the whole
  page took run 340's runner past its cap of 2400 s with no beat failed. `walk` still plays each page whole.
- **Only a commit it passes is published.** `.github/workflows/pages.yml` runs when this workflow ends on a
  push to main, and only on a pass: it publishes that commit to GitHub Pages, tags it, and moves the branch
  `live` to it, which Vercel's production deploys (`vercel.json` builds `live`; the Vercel project's
  production branch is `live`). A red main leaves the site on the last commit that passed. Deploy to Pages run by
  hand publishes main as it is.
- **One deploy a pass** (23 November 2026). Vercel's plan allows so many deployments a day, and every branch pushed
  made one: each push to main a production build cancelled by `ignoreCommand`, each session's branch and `land/*`
  a preview cancelled the same way, and `check-passes` (no `vercel.json` of its own) a build that failed, about
  forty a day for nothing. Meanwhile the project's production branch was still `main`, so `live`'s builds were
  previews and the production site stayed on `fc003e3` from 21 to 23 November (#193). Now:
  - `vercel.json` `git.deploymentEnabled` makes no deployment of any branch but `live` (a branch cut before this
    still carries the old file until it merges main; its push is cancelled by `ignoreCommand`, kept as the backstop,
    and by the project's own Ignored Build Step, the same command, for a branch with no `vercel.json` at all). The
    rule is `"**": false`: Vercel matches branch names with minimatch, whose `*` stops at a slash, so `"*": false`
    (23 to 24 November) left every `claude/…` and `fix/…` branch on the default, a deployment made and cancelled
    for each of their pushes (`claude/junctions-175`, `claude/hero-survey-196`) while `main` and `fix-roads-943` made
    none. A branch on more than one rule is deployed if any of them is true, so `live` still is;
  - `check-passes` carries a `vercel.json` of its own that turns deployments off (`checks.yml`, the passes job);
  - `pages.yml` moves `live` only when what Vercel serves changed since it (`web/`, `vercel.json`, `VERSION`,
    `tools/vercel_build.sh`, `tools/stamp.js`): a pass of docs, tools or checks is published to Pages and tagged,
    and Vercel keeps the commit before, which serves the same files;
  - a commit main's checks fail never reaches either host, as before.
  The Vercel project's production branch has to be `live` (Settings, Environments, Production, Branch Tracking):
  that setting is the account's, not the repository's.
- Each browser shard prints which renderer it got and on which CPU (`tools/gl_renderer.js`): llvmpipe, or SwiftShader
  when the GL backend could not start, about three times slower. Chromium's download and the shaders llvmpipe compiled
  are kept from one run to the next (`actions/cache`), the shaders a CPU apiece (its model and its flags in the
  cache's key). llvmpipe compiles for the CPU it runs on, by name, and files the shaders under an id that records only
  the CPU's family and its SSE, AVX and AVX-512 basics (Mesa 25.2, `lp_screen.c`), so two Intels of one family share
  it: a runner loaded what one with another CPU had compiled, its GPU process died of an illegal instruction (SIGILL,
  exit code 132, in the shard's `-chrome.log`) at the first context, and the clip and ride shards waited out 13 and 15
  minutes on a page with no WebGL (issue 84). A renderer that does not come up is asked again with the kept shaders
  dropped, and a browser with no WebGL at all stops the shard there, in seconds.
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
tools/check.sh all                  # static look story storyp storyl budget guide walk ride mem audio clip gl touch astc
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

## A run is a job

On a session's machine `tools/check.sh` does not play the run in the shell that asked for it: it hands it to
`tools/job.sh`, which starts it forked off and in a process session of its own, its output in a file
(`/tmp/oe-jobs/check/log`), and only waits on it.

Why, from the 48 sessions' transcripts of 18 to 21 November 2026 (every event of each, read through the sessions' own
event logs). The shell tool a session runs commands with stops what it started, and the whole tree under it: a
foreground command after 10 minutes (29 times), a watch on output after 30 (7), a background command after 30 to 60
whatever its timeout ("was stopped after reaching its background time limit": 20 times, 6 of them runs of the checks
and 2 other browsers, the rest waits on them), and every one at a restart of the session's worker (7). A run of the checks takes, on that machine, the static checks 35 s,
mem 3 minutes, the ride 5, the walk's two pages 18, the story 20 and the guide 20 (medians of the runs whose times they printed: 36 of the story, 37 of the walk, 8 of the guide), so
a change to the page checked for about 42 minutes and one to `game.js` or `story.js` for 47 to 62 (33, and 38 to 53, since
the fast tier plays the walk's desktop page alone, issue 95). Until 18 November a
change to the page checked for about 24 (the story and mem); the walk joined it then, and a run started as the tool's
child was stopped near its end from that day on. 183 of the 201 runs were started that way. Each stopped run was started
again from the beginning, and what it left behind took cores from the next one's story clock: the sessions ran 92 commands
killing stray browsers, servers and harnesses and 45 looking for them, and the walk's two pages took up to 33 minutes
against a median of 18. Started as a
child of the waiting script, even in a session of its own, a run was stopped with the wait: the tool stops every process
under the shell, so the job is forked off it (`setsid -f`) and belongs to the machine.

What the job gives:

- **A wait is cut off, the run is not.** `tools/check.sh` waits up to nine minutes (`JOB_WAIT`), printing each check as it
  ends, and before them how long the run will take on this machine: each target's median over its last five passes in
  this clone (`.git/oe-check-times`), a pass kept from the cache counting nothing. If the run is still going when the wait
  ends it says so and exits 75; `tools/check.sh --wait [seconds]`, or the same command again, attaches and goes on from
  the last line it printed. A run whose result has been told once is started afresh by the next command.
- **Never twice, never two.** The same command (the same tree, the same settings) attaches to the run that is going. An
  edit since it started makes another run, refused while the first goes: `tools/check.sh --stop` first. A second job of
  any kind is refused while one runs, and a browser that no job started is named, so that no check runs at half speed.
- **Stopped whole.** Every process a job starts carries its mark in its environment, a browser that puts itself in a
  session of its own too, and `tools/check.sh --stop` (`tools/job.sh stop <name>`) stops them all.
- **Any long command.** `tools/job.sh run <name> -- <command>` does the same for a story's frames played, a film, stills or
  a build; `JOB_LIGHT=1` for the page's server, which neither waits for nor holds back another job and outlives the turn.
  `tools/job.sh status` lists the jobs and the strays.

A runner (where `CI` is set), a machine without `setsid` (macOS) and `CHECK_INLINE=1` play the run in the foreground, as
before. A job outlives its wait and the end of a turn (tried: a wait stopped after 30 s, its job ran on), and being no longer
under the session's worker it should outlive the worker's restart too (not yet seen). It does not outlive the machine (a
session started afresh has neither the job nor the cache), and a run stopped anyhow keeps the passes of the checks it had
finished (`tools/check_cache.py`), so the next run plays only the rest.

## A load is of one commit

The site is published many times a day and nothing is compiled: `web/` is served as it is. Until issue 116 no
address carried a version, Vercel kept `/data`, `/assets` and `/vendor` an hour (and a day of stale-while-revalidate)
and GitHub Pages keeps everything ten minutes, so a player who came back ran the new scripts on the packs and models
the browser had kept. What holds it now:

- **The stamp** (`tools/stamp.js`, run by both deploys: `tools/vercel_build.sh` and `.github/workflows/pages.yml`).
  It hashes every file under `web/` and writes the commit and `{ path: hash }` into the guard at the top of
  `web/index.html`; gives `index.html`'s own `src=`, `href=` and `url()` their `?v=<hash>`, and `url()` in the
  stylesheets; puts every module in the import map (by its address, and by its bare name under each prefix the map
  gives, so that no module is loaded twice under two addresses); and writes `version.json`. The hash is of the
  file's content, so a file that did not change keeps its address from deploy to deploy and is not downloaded again.
- **The guard** (the first script in `web/index.html`, in the oldest JavaScript). `OEV(url)` gives one of the page's
  files its address with its hash. `fetch` of the page's own files goes through it, three.js's loaders through
  `DefaultLoadingManager.setURLModifier`, and the few places that make an `Image`, a `Worker` or a `<script>`
  themselves call it. A worker is given the build as well (`?b=`), and asks for what it imports by it. A new place
  that asks for a file some other way is found by the check: every request of the page's own must carry `v=` or `b=`.
- **A page older than the site.** Pages keeps `index.html` ten minutes too. The guard reads `version.json`
  (never cached); when it names another commit than the page's, the page loads itself anew once, with the commit in
  its address so that no cache answers.
- **The hosts.** `vercel.json`: an address without a hash is asked for again every time (`max-age=0,
  must-revalidate`), one with a hash is kept a day. Pages' ten minutes cannot be set, and no longer matter.
- **Not covered:** a deploy while a page is open. What that page asks for afterwards, by the old hashes, is answered
  with the new files. Only a site whose every deploy keeps its own files (addresses under the commit) ends that.

The same guard gives every fetch of the page's own an end (no answer in 20 s is given up; a failure or a 5xx is
tried twice more, after 0.8 and 2.4 s; `world.js` does the same for a pack whose download stalls or breaks off),
turns the loader to its error state with Reload when a start fails before the first frame, tells a browser without
import maps that it cannot run the page, and copies the storage keys of before the split (`oe-*`, `oe3d-*`) to the
page's own (`bh-*`) once. A harness shortens the waits with `window.OE_NET = { head_ms, stall_ms, retry_ms, still_ms }`.

A harness that sets a case at a frame by hand (`bh-story-late` with no `v`: `tools/story_play.js` `FROM=n`, the ride,
the guide) is taken up as before: under automation a case with no shape is the harness's. A player's case with no
shape is of a build before the change and is not taken up; `launch` plays that with another shape, not with none.

`tools/launch_check.js` (`tools/check.sh launch`) holds all of it. Run by hand: `xvfb-run -a node
tools/launch_check.js [keys] [start] [save] [cache]`, `SCREEN=phone` for one screen, stills in `$OUT`. It was seen
to fail: with `OEV` returning its address unchanged, the second load used the commit before's `data/cities.json`,
`pack.js` and `pack-worker.js`, and 93 requests carried no hash.

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

## Checks by reach

The owner's ask of 21 November 2026 (issue 131): with fifteen sessions at work the checks cost too much, every branch
checks again when main moves, and the parts are not separate enough ("if I change the people's models next time, it
should not touch the story at all, and the story should not be played again"). From first principles: **a check is
worth its time only where the change can alter its result.** What a change can reach is decided by the seams between
the parts; where a seam is written down and held, a change behind it needs the seam's check and its own part's.

What was read first, and what was taken from it (ideas and published behaviour only; no code from any of them):

| Work | What it says | Taken here |
|---|---|---|
| Ekstazi (Gligoric, Eloussi, Marinov, ISSTA 2015) | A test's dependencies are the files it was seen to read; it runs again only when one of them changed. Less end-to-end time though it selects more tests than a finer analysis | What `tools/check_cache.py` already did by files, from the server's log |
| Test Impact Analysis, Azure Pipelines (Microsoft's docs) | A map from each test to the sources it ran, from earlier runs; a change selects the tests that had its files; a safe fallback to everything for what it cannot read, and a full run at a set period | The map one level finer: functions, not files. The fallback: anything that is not a counted script is judged by its bytes. The full run: main's full tier, after every landing |
| V8's code coverage (v8.dev, "JavaScript code coverage"; `Profiler.startPreciseCoverage` in the DevTools protocol; V8 is BSD-3-Clause) | Precise binary coverage: yes or no for each function, none lost to the garbage collector, and the optimiser allowed again once a function has reported; a take gives what ran since the last one | The source of the map. `tools/browser_watch.js` asks every page a check opens (`COVER`), function by function, yes or no |
| Bazel's remote cache (bazel.build; Apache-2.0) | An action's result is kept under a hash of its inputs, its command and its environment, in a store shared by every machine; a test whose inputs did not change is not run again | The pass kept with every input's bytes (as git blobs) and the settings; shared between machines: main's passes for a fresh session (below) |
| Chromium's commit queue (docs/infra/cq.md) | A passing build is reused for an equivalent patch set across a trivial rebase, inside a window of commits; only the suites a change might affect are compiled and run | Main moving under a branch is the trivial rebase: the branch's passes stand where main's change and the branch's are in different functions |
| Predictive test selection (Machalica et al., Meta, 2018) and Taming Google-scale continuous testing (Memon et al., 2017) | Very few tests ever fail; those that do are near the code changed; a selection that reports 99.9% of faulty changes at half the cost | The shape, not the model: a draft before landing that plays what the change reaches, an exact check after it that plays everything, and nothing published that the exact check failed |
| GitHub's merge queue (docs.github.com) | Each queued pull request is checked once, on a temporary branch with main and those ahead of it, by workflows on `merge_group` | Not taken: see "A merge queue, weighed" |
| Fix Your Timestep! (Glenn Fiedler), FoundationDB's simulation, TigerBeetle's VOPR | The simulation steps in fixed dt; with the clock, the network and the disk under the test, a run repeats exactly and runs faster than the wall | The game under test already steps a twentieth of a second at most with seeded draws; what was slow was the drawing between the stills (below) |
| Chromium's virtual time (`Emulation.setVirtualTimePolicy`) and Playwright's `page.clock` (Apache-2.0) | Timers, `Date` and `performance.now` from a synthetic source; `page.clock` fakes `requestAnimationFrame` too, in the page's script only | Weighed, not taken yet: the story's harness already owns the page's frames; see "The clock" |
| Mesa's llvmpipe (`LP_NUM_THREADS`, docs.mesa3d.org; MIT) | How many threads the software renderer draws with; the default is every core | The lanes: checks side by side, each renderer held to its share of the cores |

**The rule.** With a pass, `tools/check_cache.py` keeps every file the check read as a git blob, and for the page's
scripts which of their functions the check ran. When a file it read has changed, the pass still stands if every
change in that file since the pass is one of:

- **main's**: the lines are as `origin/main` has them now, and they lie in a function this branch has not itself
  changed against main. Main's own checks play main's change with this branch once it lands, and only a commit they
  pass is published; that was the rule for a whole file (above), and is now the rule for a function;
- **comments and spacing only** (both sources printed without comments by TypeScript's printer, where it is installed);
- **inside a function the check never ran**, which is still that one whole function under the same name (V8 is asked:
  the text, evaluated as an expression in an empty context, must give a function that prints back as exactly that
  text; so a brace closed early, which would put new statements outside it, is seen);
- **a new function** under a name nothing in the file said before.

Anything else reaches the check, and its line says what: `web/game/story.js:412 changed in meetGuide(), which it ran`.
A model, a picture, a pack or any file that is not a counted script reaches every check that read it, unless it is
main's as main has it. Scripts that a worker runs too (`pack.js`, `sun.js`, `navcells.js` and the like) are judged by
their bytes: the page's count says nothing of what ran in the worker. `tools/reach_unit.py` holds each rule on a small
script in a clone of its own, with the static checks.

    python3 tools/check_cache.py why story          # each file changed since story's pass, and whether it reaches
    python3 tools/check_cache.py ran story web/game/story.js meetGuide   # did the story's pass run it

**What the rule cannot see.** A function that did not run in the pass that was kept, and would in another run of the
same check: the story is seeded and its clock pinned, but which frame a load finishes in is the machine's. Such a
function is rare (the count is of a whole play), and main's full tier plays everything after landing. Measured on
21 November 2026, the same check played on a runner and on a session's machine: of 8,200 functions in scripts of the
same bytes, `story2` ran 7 on the runner only and 3 here only, `story3` 2 and 4; all but one were the traffic's and
the crowd's, by what the street happened to do (`queueing`, `oncoming`, `parkNow`). So a pass is kept with the count of
every play seen of the same bytes, this clone's and main's together: a function that ran in any of them ran. A script the
page evaluates from a string, and a page a page opens by itself, are not counted; the page has neither.

### A phone's beats before landing

Until 23 November 2026 the phone's budget (`budget`: the episode as an iPhone, every beat against its budget of draws,
triangles, passes, pixels and GPU memory) ran only in main's full tier. A change that cost a beat more was found
after it was on main, and main was red for everyone (issue 162 was that; issue 131's gap). Now it is routed by reach,
as the story is:

- **Three parts.** `budget1` plays frames 1 to 4 as a phone, `budget2` frames 5 and 6 from a case left at frame 5,
  `budget3` frame 7 and the last card (`FROM`, `UPTO`, as the story's parts). A change to the page asks for all
  three; each is kept where the change cannot reach it, by the same rule and the same count of functions as any
  check. Main's runners play the three parts, whose passes a fresh session starts from, and the whole episode in one
  page as before.
- **What reaches a beat's cost.** A function the part ran (a draw, the crowd, the level's loader), a pack or the
  hero level's data it fetched, and a model or a picture it fetched: for the six counting checks (`story1` to
  `story3`, which count the desktop's beats as they play, and `budget1` to `budget3`) a model behind its contract is
  not apart, as it is for every other play. A change to models or pictures alone therefore plays the parts that
  loaded the file, on both tiers, and no part that did not. A sound reaches none.
- **Dry.** Before landing no still is taken and no frame rasterised: each still's frame is asked for whole and its
  calls counted, and what WebGL holds is read as ever. A phone's picture at three device pixels to the point is the
  software renderer's slowest: frames 5 and 6 took 461 s drawn and 250 to 277 s dry, frame 7 264 s and 172 s, with
  the same counts (frame 7: 890 and 1,011 draws in two plays, 1.40 M triangles in both, 261.6 and 262.3 MB). Main's
  full tier draws one frame in sixty and takes the stills, as the budgets were measured.
- **A failure says the two ways out**: draw less in that beat on that tier, or set the budget again on purpose with
  the reason in the commit (`python3 tools/beat_budget.py set <counts.jsonl> phone`; the play's counts are in the
  file the failure names).

Measured on a session's machine, 23 November 2026 (four cores, two checks side by side): `budget1` 407 s, `budget2`
277 s, `budget3` 172 s; 14 minutes of checks, 8 of the wall by themselves. What that adds to a landing, from the
counts of the functions each part ran:

| Change | Added before landing |
|---|---|
| One function of `web/game/game.js` (1,385 functions) | nothing at the median: 707 of them no part runs on a phone; 6 min of checks on average; all 14 for the 520 every part runs |
| One function of `web/game/story.js` (323) | 6.8 min of checks at the median (frames 1 to 4), 8 on average |
| One function of `web/game/people.js` or `actors.js` (the frame's hot code) | 14 min of checks, about 7.5 of the wall beside the story's parts |
| Every check of a page change played | 45 min of checks where it was 31; about 23 min of the wall where it was 16 (reckoned from the parts' times, two side by side) |
| A model or a picture every part loads (the people, the hero level) | the six counting parts: 38 min of checks, about 19 of the wall (reckoned so), where it was 4 to 6 min; a model one frame loads, that frame twice |
| Main moved under a branch it did not reach | nothing: the parts' passes stand as the story's do |

What it does not hold as tightly as main's whole play: GPU memory in the later parts. A case opened at frame 5 or 7
has not loaded what frames 1 to 4 left behind, and read 6 to 10 MB under the whole play's beat (frame 5: 275.7 MB
against 281.7; frame 7: 261.6 against 272.2), with 9 MB of room in the budget. Draws, triangles, passes and pixels
read as the whole play's do. So a change that adds less than about 15 MB to frames 5 to 7 alone can still pass here
and fail on main; budgets of the parts' own, set from the parts, would close that (`tools/budgets/shibuya.json` is
issue 130's). Found on the way: the phone's triangle budgets stand at twice what the beats now read (frame 1: 0.81 M
of 1.80 M) since the phone's crowd was made lighter, so a triangle regression of up to that much passes everywhere.

## Main moved

Fifteen sessions land on one main, most of them through `web/game/game.js`; each landing moved main under the others,
and each of the others merged and checked again. What a branch owes when main moves, decided by `tools/check.sh` and
printed with its reason:

- A file that is main's as main has it runs the static checks only (the rule since November 2026, by files).
- A file both sides changed is judged by its functions: main's lines, in functions the branch has not changed against
  main, are main's. The branch's kept passes stand: `kept from its pass at ...: what changed since cannot reach it:
  web/game/game.js: 3 changes main's`. Until issue 131 one such file sent the branch through the story and the walk again.
- Main's lines in a function the branch changed too are the branch's to check, as its own change is. A closure that
  holds a script's functions (eight or more: `game.js`'s is 7,500 lines) is a scope as a file is, not a function: main's
  statement at its level and the branch's stand apart.
- A file that is main's as main has it is apart before any other rule is asked (a hero level whose ground main moved
  is main's to play, not the branch's).
- A play kept, with its beats counted then (issue 130), whose counts are over the budgets as they are now is played
  again and counted again: main may have made the beat lighter and its budget with it.

Measured on 21 November 2026: main moved nine times while issue 131's steps were being landed. With no file shared
(seven files of main's, `web/game/people.js` among them) the merge checked in 55 s, the static checks and the
contracts; with `game.js` cut on the branch and changed in fifteen, then twenty places by main, in 60 s each time,
every pass kept (`web/game/game.js: 20 changes main's`). Twice a merge played more: once all of it, for the two rules
above that were not yet written, and once the story's last two parts, whose kept counts were over main's new budgets.
What stands behind this is unchanged: main's full tier plays main's change with the branch's once it lands, and only a
commit it passes is published.

### A merge queue, weighed

GitHub's merge queue checks each queued pull request once, on a temporary branch holding main and those ahead of it
in the queue (the `merge_group` event), and merges only what passed. It would move the branch-side question ("main
moved: do I check again?") to the server, with an exact answer.

- **It cannot be turned on here.** GitHub offers merge queues "in any public repository owned by an organization, or
  in private repositories owned by organizations using GitHub Enterprise Cloud" (docs.github.com, "Managing a merge
  queue"). This repository is owned by a personal account. Moving it to an organization is the owner's to decide.
- **What it would cost.** The checks worth queueing on are the full tier: fourteen runners for up to twenty minutes,
  for every landing, in order. At thirty landings a day that is a queue hours long unless landings are batched, and
  a batch that fails is split and run again. Landing would also go through pull requests, where today a session
  merges and pushes. A landing that takes a minute here would take twenty there.
- **What it would buy.** Main never red. Today main can be red until the next landing fixes it (issue `main-red`),
  and nothing red is published.

Decided: not now. The same question is answered on the branch side by reach, in a minute, and the exact check runs
after landing. If the repository moves to an organization, the queue to try is one that runs `tools/check.sh` with
main's passes on `merge_group`, so that a queued change plays only what it reaches.

## Main's passes, shared

A session's machine is new: it has no pass of its own, and before issue 131 its first run of the checks played
everything, 33 to 62 minutes, to learn what main's own run had already shown. Now each shard of main's full tier
that passes leaves what a session's pass leaves (the files it read, by their git blob ids, and the functions it ran),
and the workflow's last job pushes them to the branch `check-passes`: one small file a check, one commit, replaced
every time; a shard a run did not play keeps its last pass. `tools/check.sh` fetches the branch (twenty seconds at
most; `CHECK_SHARED=0` goes without) and, for a check this clone has no pass of, judges by main's: the lines main has
changed since are main's, so what is left to reach the check is the branch's own change. A check kept so says `kept
from its pass at main's <commit>`. This is Bazel's remote cache in small: the result of a test kept under what it
read, on a store every machine can reach.

The pass is of a runner's play, not this machine's. What a check runs is the page's script, the same on both; what
differs is timing, and a function one machine's play reaches and the other's does not is the rule's known blind spot
(above), covered by main's full tier after landing. The job that pushes the branch cannot fail the run, and nothing
waits for it.

## The checks faster

Where a play's time went, measured on a session's machine (four cores, 16 GB, WebGL in software) on 21 November 2026:
the whole story took 1,015 s, of which 534 s were the script of 8,197 frames not drawn, 107 s were 281 frames drawn
between the stills (one in thirty), and 397 s were 187 stills at 2.1 s each. So two fifths of the play was drawing for
pictures nobody looks at unless the play fails, and a tenth was drawing nothing looks at at all.

- **No drawing where a check does not look.** On the fast tier the story takes no still and draws no frame between
  them (`STILLS=0`, `DRAW=1000`); the photographs the story itself takes are drawn as ever. Where a still's frame is
  counted against the beat's budget (issue 130) the frame is asked for whole all the same, dry: the page makes every
  call of it and the counts are of the calls, and no draw or clear is passed on to the renderer. The walk and the
  ride draw one frame in twenty (`tools/draw_skip.js`); the walk takes no still. `STILLS=1 DRAW=30 tools/check.sh
  story3` plays a part with its pictures, and main's full tier plays them so, as the budgets were measured, with its
  pictures in a failed run's artifacts. A still was also a wait: with none taken, the walk's photograph from the
  helicopter was released before the lens had come to rest, and now waits for that.
- **The story from frame n.** The parts start from a case left at a frame (`FROM`, `UPTO`: a state the game itself
  saves and opens), as main's runners have played them since issue 51: `story1` frames 1 to 4, `story2` 5 and 6,
  `story3` 7 and the last card. The fast tier plays the parts too, each kept or played by itself; the whole story in
  one page (a case carried from frame 4 to 5 and from 6 to 7) is a shard of main's.
- **Side by side.** A check's page takes one core for its script and the renderer's threads when it draws, and 5 to
  6 GB with the map at a desktop's tier. Three side by side had one killed for memory; two play. `tools/check.sh`
  runs as many lanes as half the cores and a sixth of the free gigabytes allow (`CHECK_LANES`), each with its own
  server (its log is what its check read) and the renderer held to its share of the cores (`LP_NUM_THREADS`), the
  longest check first; the static checks run beside them. A check that draws every frame starves beside another:
  the walk took 29 minutes so, against 9 alone, which is why it draws one frame in twenty now.
- **The clock.** The game under test already steps a twentieth of a second a frame at most, from seeded draws and a
  pinned date; with nothing drawn a frame costs 60 to 80 ms of script, so the story's clock runs at 0.6 to 0.7 of the
  wall's, and that is what a part's four to five minutes are. A virtual clock (Chromium's, or Playwright's
  `page.clock`) would not shorten the script of a frame; a longer step would change what is played. The fixed wait of
  1.2 s before a beat's still was tried at none (`MARKWAIT=0`): no shorter, the play waits on the game. So the next
  gain here is in the game's own frame (the crowd, the skinning, the world's matrices), which a player gains too.
- **The long checks to main.** The whole story, the walk's phone page, `touch`, `clip`, `gl` and the phone's budget
  over the whole episode in one page run on main's runners after landing, a runner each; a session plays what its
  change reaches, the phone's budget in its parts among it ("A phone's beats before landing").

What the same change costs, before and after (a session's machine; "before" from the medians above):

| Change | Before | After |
|---|---|---|
| Every check of a page change played (`story`, `walk1`, `ride`, `mem`, `look`, static) | 38 to 43 min | 31 min of checks in 16 min of the wall |
| One function of `web/game/story.js` (routed to static, mem, story, walk1 and guide: 52 min on 21 November) | 51 min | 10 min at the median: the checks that ran it, side by side (from the passes' counts of 163 functions; 23 min where every part and the guide ran it) |
| One function of `web/game/game.js` | 36 min | 8.5 min at the median, 16 at the worst |
| Main moved, the branch's own change not reached | static only when no file was shared, else 33 min or more | 55 to 60 s, `game.js` changed by both sides or not |
| A model or a people's set replaced, its contract kept | 4 to 6 min since the router of November; 35 to 40 before it | the same 4 to 6 min (static beside `look` and `mem`; `mem` is 250 s of it), and no longer the story when another change in the branch routes there |
| A hero level rebuilt with its ground and names as they were | 33 min (played as code) | 4 to 6 min |
| A fresh session's first run, the branch's change reaching one part of the story | 33 to 62 min | that part, and what else it reaches (main's passes) |

The target of issue 131 was ten minutes for a typical change to one part, five for a model, one for main moving. The
last is met; a model is at four to six, held there by `mem`'s own four minutes; a typical change is at the median
of ten, and a change to the frame's own hot code (the crowd's step, the people's rigs: what every check runs) is
sixteen, because it reaches every check and two play at a time. What would bring that under ten is a third lane
(memory: a page lighter than 5 GB under the software renderer) or a cheaper frame.

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

## A check that fails now and then

A check that fails one run in five costs every session a run of fifty minutes thrown away, and turns main red
under a change that did not touch it. Such a check is not run again until it passes, and its number is not moved:
it is run several times on one commit to say how often it fails, the thing that differs from run to run is found,
and that is what is changed. `tools/repeat.sh` runs one command n times as a job and counts
(`tools/job.sh run rep -- tools/repeat.sh 5 /tmp/out -- xvfb-run -a node tools/mem_check.js shibuya`);
`BUSY=3` keeps three cores busy beside it, which is what a second lane of checks or a slow runner does to a page's
frames and its load order, and is where most of these came from. What was found, each on a session's machine
(four cores, llvmpipe), the same commit before and after:

| The check | What differed from run to run | What was changed | Before | After |
|---|---|---|---|---|
| `mem`, the desktop's vertex buffers (issue 159) | The check summed every `buffers:` line the page logged until it was closed. A hero level comes 90 to 170 s after the title on a software renderer and sends its own (12 MB Scramble Square, 13 MB the Scramble); a run that was still watching the page then read 142 or 156 MB of 140 | A late model's upload says so (`late buffers:`, `world.js` `uploadBuffers` `late`), and the check counts the loader's own set, listing the late ones beside it | 130 MB in nine runs of nine closed early; 142 MB (FAIL) watched 90 s longer, 155 MB held after 200 s | 130 MB in every run, with 25 MB of late models listed when the page is watched 200 s |
| `mem`, a phone's GPU memory (issues 110 and 141) | The peak was the rain at ten at night with or without the target of the conversation's depth of field: the check ended the shot, waited six seconds of the wall and began the rain, and the page lets the target go a few seconds of its own frames after. 10 MB held or not by which came first | The conversation stays up into the rain: the peak is read in one state, the heaviest a player holds (a conversation in the rain at night), and the line says how far under the budget it is | 257 to 260 MB in nine runs (266 to 271 of 270 before issue 105 took 11 MB off) | 258.8 to 259.3 MB in eight runs (three of them with three cores kept busy), 10.7 to 11.2 MB under 270 |
| `guide`, his body against the player's, pushed against a wall (issues 133 and 138) | Held against a wall he was let 3 cm into the player's circle before he said he was held, and his own tick could walk or turn him further in; the check's margin was the same 3 cm. Which side of it a run fell was decided by where the crowd he plans round stood when the world was held | A rule, in `companion.js` `keepOff`: the two touch and never overlap. He is held as soon as any of the push is left over (2 mm), the player is stopped short by that much in the same frame, and a step or turn of his own that would end further inside the player's circle is not taken. The check fails half a centimetre of overlap, in the open and against a wall | 2.0 to 3.0 cm inside in twelve plays of the case in one load (`ONLY=wall WALL_N=12`), eleven of them within 2 mm of the old margin or over it | 0.0 to 0.2 cm in twelve of twelve, his model 27 cm clear of the player's torso |
| `walk1`, Taro's photograph of the crossing from the helicopter (issues 142 and 153) | Both issues describe the check as it was until 5f064af6 (21 November, 15:54): it polled sixty times for the lens to come to rest over the crossing, a slow frame ended the count first, and the photograph was taken from the chase camera behind the helicopter. That commit made the wait the lens's matrix alike over six of the game's frames | The wait is for what the photograph is judged by, the photo camera at the pose asked for, read from the camera; a photograph that is not Taro's says in its line what the page was doing (photo mode on or not, a talk open, where the lens and the helicopter were). `AIR_N=n` takes the photograph n times more in one play | Once in five runs before 5f064af6. Since it, not reproduced: 80 of 80 photographs with the six-frames wait in two plays (one with three cores kept busy) | 40 of 40 with the pose's wait |
| `walk1` beside another check (issue 159: two lanes failed the walk on four cores) | The check set you down nine metres from the seat, waited for its mark to show and read the mark's name. The mark may be up already from where you stood before, pale and unnamed, and with two cores taken the page had not drawn a frame since you were set down: the name read was the old frame's, empty. The same with the speech marks from fourteen metres: any mark up ended the wait, the one judged had not come | Each step waits for the mark it judges as it judges it: the seat's shown and named, a story's mark shown | `walk1` with two cores kept busy (`BUSY=2 tools/repeat.sh`): one of two failed, "the seat's mark is not named from nine metres". `ride` the same way: three of three passed | Three of three passed. Two lanes stay the default on four cores |
| `budget1`, frame 2's passes on a phone (issue 131, 23 November 2026) | The talk's depth of field is one pass more. A beat's passes are its second heaviest still's, so a pass in one still is not the beat's; in frame 2 it fell in one still in some plays (`2-said-go-talk-shun`) and in two in others (`2-find` too, taken before the lens had let go), on the same code: 9 drawn and 10 dry at one commit, 10 drawn at a later one. The budget stood at 9 with no room, set from plays that read 9 | Frame 2's passes and pixels on a phone are frames 1's and 3's, which hold the same talk: 10 and 3.46. `tools/beat_bisect.sh` plays one frame for one still's count, a minute a step, for when a count does move with a commit |
| `budget` and the story's beats, frame 7 (issue 151) | A still's count was begun by the harness before it asked for the still's frame and ended after it heard of it: a frame the play drew of itself in between (one in DRAW) was counted with it, twice the passes and triangles under one still's name, or the still's own frame was missed and two of the game's frames were sampled instead (`frames: 2`). And the sky's light taken afresh (world.js setSun, three.js's PMREMGenerator.fromScene: a cube of targets 256 x 256 and smaller) fell in whichever frame it fell in and was counted as that beat's cost | The count begins and ends inside the still's frame, round its own calls (`tools/story_play.js`, the frame's flush). The sky's refresh is counted as what it is: `sky_refresh` with its draws and triangles beside the frame's, not in them (`tools/beat_count.js`; `tools/sky_count.js` forces one inside a counted frame and fails unless it is counted apart) | Frame 7 played with one frame in five drawn: 3 of 20 stills with `frames: 2` | 64 of 64 stills of their own frame in two plays; a forced refresh, 32 draws, counted apart |
| `guide1`, frame 4's lead to SKY's lift (main's checks, about three runs in eight) | Not the check: the walk. A level whose floor is its own (SKY's street lift hall, `hero[].floor`) was walked on at its floor grid's height, one value a 0.5 m cell taken at the cell's middle (`game.js` `heroCover`). Where a plank's step or a kerb crossed a cell, the whole cell took one side's height, and the guide stood 7 to 9 cm in the air on the other side, whenever the crowd put his way over such a cell | Each cell of such a level keeps the floor's upward triangles over it, and the height is read at the point itself (the grid's value only where no triangle is over it). `tools/floor_grid.js` compares the height walked on with a ray onto the drawn floor every 5 cm over the level's circle | 140 of 80,844 points (0.17%) more than 6 cm out, the worst 38.5 cm | none; the worst 0.0 cm |

## The set-up's bake (issue 194)

`web/data/<map>/setup.bin` and `d/setup.bin` are the set-up's fixed work computed once (docs/PERFORMANCE.md, "The set-up's fixed
work, baked"). Two checks hold them: the static `bake` (`node tools/bake_setup.js --check`) fails when one is missing or older
than the packs it was made from or the set-up's `BAKE_V`; and the page computing is compared with each bake field
by field (`--compare`, at the end of `mem`, which loads the whole page and so is played wherever that code changes), failing with "the set-up's output changed" when a change to the code it runs (decks, nav, collision,
route, actors, junctions) changes what it computes. Either way the answer is `xvfb-run -a node tools/bake_setup.js` (or
`python pipeline/pack.py`, which bakes after it packs), and the two `setup.bin` committed with the change. Never merge one by
hand: bake again on the merged tree.

So a repack needs the browser: `python pipeline/pack.py` ends with `node tools/bake_setup.js --if-stale`, which does nothing
while the bake is fresh (a hash, no browser), and where a pack it reads changed loads the page twice in Chromium (the map and a
phone's district; under `xvfb-run` where there is no display, serving `web/` itself): about a minute on a session's machine.
The static check (`--check`) is a hash of `game.bin`, `buildings.bin`, `landmarks.bin` and `BAKE_V` alone, no browser.

## What is not checked

- The story past its first episode: `tools/story_play.js` plays episode one. A new episode adds its
  beats there.
- A real GPU, WebGPU, Safari and iOS: the checks run Chromium on a software renderer.
- The hosts themselves: `launch` reads `vercel.json`'s cache rules as Vercel documents them and plays GitHub Pages'
  ten minutes from a server of its own. That Vercel applies a header by `has: query`, and what Safari's cache does
  with a page reloaded by `location.replace`, are not seen until a deploy.
- What a person sees. For a visual change take stills (`tools/game_shot.js`, `tools/story_play.js`,
  `tools/scramble_shot.js`) on a desktop and a phone, at day, dusk and night, and look at them.
  Some of the story's frames on both screens in one job, for a before and after:
  `tools/job.sh run stills -- tools/frame_stills.sh OUT "3 5" "1 2"` (FROM and UPTO pairs; `PORT=8801` plays a
  copy of main served beside the branch).
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
  `SAFE=1` adds a notched phone's safe area and fails a word or a button under the notch or the home bar; in photo
  mode it holds what the camera's controls may cover (issues 147 and 154). `tools/legible.js` measures the walk's words
  with the story's.
- Whether the words on the picture can be read: `tools/legible.js`, by hand after a change to the story's goal, its
  hint, what is said over the picture, the finder's words or their styles (it is not a target either: it lays out the
  same recordings). Each screen a play wrote down (`UI_DUMP=dir`) is laid in with the page's stylesheets and no game
  over pale paving at dusk (#cbc6d0), over white, and over the picture the still was of where the play kept it
  (`BARE=regex` on `tools/story_play.js` saves the canvas alone in `out/bare`; `BARE_DIR=` here). Every line is
  measured where a letter is read: the letters are found as what differs between the screen and the same screen with
  its glyphs left out, and the contrast is the letter's colour against what lies under it and for two pixels round
  each stroke, backing and shadows drawn. It fails a line under 4.5:1 on the paving or the picture, or under 3:1 on
  white, and prints the least of each kind of words. Before issue 114 the goal measured 2.9:1 on the paving and its
  hint 2.3:1; after, 6.2:1 and 5.5:1, and 1949 lines on 226 screens of frames 1, 2, 5 and 6 (a desktop and a phone)
  pass. `tools/story_play.js` itself now fails a play where two lines are said over the picture at once, and one
  where the dialogue, the goal or a slip is still drawn with the log open; `LOGAT=n LOGSECS=5` opens the log after
  frame n and takes a still of it each second.
- The Credits screen: `tools/credits_shot.js`, by hand after a change to `web/credits.js`, `credits.css`, `credits.json`
  or telemetry's switch. On a desktop's page (1440x900) and a phone's (390x844, by touch) it opens the Credits from the
  title's menu (by the keys on the desktop) and from the pause menu, and fails a screen without the map's sources, the
  works, the version or the switch, anything wider than the screen, a switch that leaves the visitor id in the browser
  or lets another batch out, a page that measures again once opened after it, and Esc or Back that does not give back
  the screen beneath. The way in from the last card is the story's own step (`tools/story_play.js`, at the last card).
  The list, the licence texts, the link's tags and `web/og.jpg` are held by the static checks
  (`tools/credits_check.py`); the link's picture is taken from the title by `tools/og_shot.js` (`WRITE=1`).
- The title's ways in as one list: `tools/title_menu.js`, by hand after a change to the title's buttons (`story.css`
  "the title's ways in", `walk.js`, `game.js` `titleLead`). On a desktop's page (1440x900) and a phone's (390x844, by
  touch), as a player who has chosen, with no case going and with one, the menu opened from the press by a key or a tap: it fails a menu that is not the walk, the story and the
  options (with a case going, Continue first and in the amber), rows not all one width and height (or under 48 px on a
  phone), the Enter key on a row Enter does not take, up and down that do not move the hand along the list, the walk's
  step not opened by Enter or a tap and not left by Esc or Back, the story's screen not opened whole (its episode, its
  line, a roll of seven, the hand on Begin; with a case going, how far, the frames on the roll, Continue and the evening
  again) or not left back to its row, the evening again that does not ask first or loses the case by asking, and the
  options not lent the pause menu's controls or not giving them back. Stills of each screen.
- The title's marks, a camera for each of its screens: `tools/title_marks.js`, by hand after a change to the title's
  camera (`game.js` `titleMarks`, `MARK`; docs/STORY.md "A mark for each screen"). On a desktop's page (1440x900) and a
  phone's (390x844, by touch): the press framed as it opens; pressed, the move to the menu's mark (it fails a menu framed
  as the press is, a move that overshoots or turns back on itself); options, the story and who you play each taking the
  camera further in and Back bringing it out; Esc giving the press its frame again; and the walk set out from the menu's
  mark with no jump where the crane down to the shoulder takes over. `TUNES='[{...}]'` lays each object over `MARK` for
  a still of the menu's frame with it, to try framings in one load. On a software renderer the move takes a minute of
  the wall clock (a frame in two seconds, each a twentieth of a second of the move at most).

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

## Under a ceiling, at a kerb (issue 208)

The owner's iPhone found two things the checks did not: in frame 4's way through the station's free passage the chase
camera rose through the ceiling and looked down through the open top of its roof, and the car that came for you went
through a railing. Both were a thing drawn that the game's own readings did not have: the passage's ceiling is a flat top
inside a walker's band, which the walking grid lays by its edges only, and the rails are the hero levels' meshes. The
fixes read them from what is drawn (nav.js `ceilOver` and `soffits`, game.js `heroSoffit`: ceilings and rails), and the
checks hold them against what is drawn, not the walking grid:

- `tools/cam_ceiling.js`: the passage walked both ways, turned and dragged at its ends and middle, a frame at a time; the
  lens held against the drawn ceiling (a ray up from the head, a ray down from the lens and the line between, flat
  surfaces only) and against the passage as built (a phone lets go of the drawn arrays); then the class: every spot within
  the story's circles where a walker stands under something drawn within 5 m, stood at with the view turned round
  (`SCAN=0` leaves it out). On main before the fix: 146 frames in the passage on a desktop, 46 on a phone; after: none.
  The spots under the city's building canopies south-west of the Scramble have a few frames of the lens pulled into a
  wall as the view swings, on main as after (the walls', not the ceiling's: a follow-up).
- `tools/ride_rails.js`: a ride ordered from twelve kerbs round the Scramble, Hachiko, the station's east side and
  Miyamasu, stepped in and held against the drawn rails on its way and at its door. Before the fix, rides stopped with
  Hachiko's guard rail between the door and the pavement (frame 6's own set-down among them), and one was set off
  standing inside that rail and drove out through it; after, every one stops at an opening.
- `tools/ceiling_watch.js` in `tools/story_play.js`: every frame on foot in the passage in a story's play. The check's
  plays start frame 4 at the lift, so it fires only on a play that walks there; the ride's check walks it every time.



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


## One body in another (issue 126)

On 21 November 2026 the owner's still of frame 6 showed Kagami and Mr Tanaka in one body on the stone blossom. The play
checked only the crowd against the story's people (`bodiesCheck`, issue 65); nothing measured the player against them.

- **`tools/clip_probe.js`** is put into the page by `tools/story_play.js` and called by the game every frame
  (`window.__probe.frame`, `web/game/game.js`). It measures, from what the game holds and from the bones as they are
  posed: the player, the story's people (the living and the afterimages), the guide and the map's NPCs against each
  other (middle to middle; under 0.45 m is one body in another); each model's hands, forearms, feet, calves, head and
  what it carries against its own body (less the rest pose's own depth) and its neighbours' (each part an ellipsoid
  fitted to the vertices its bone carries); the lowest of each foot against the floor it stands on; each body against
  walls, posts, cars and a floor at its head; in a helicopter or a car, the seat, the floor and the roof by rays. Every
  case is printed once with its frame, beat, place, greatest depth and how many frames it lasted.
- **Forearms and hands in their own bodies.** The probe also measures the near crowd (the skinned walkers,
  `crowdDraw.active`), the map's people and the story's people nearest the camera, every 15th frame, with the measure
  `tools/hold_check.js` takes (`tools/hold_depth.js`, on the skinned mesh). Deeper than 2 cm for three readings fails the
  play (kind `hold`): the owner found a texting forearm inside a suit jacket at the crossing in the opening.
- **The play fails** on one body in another and on a foot more than 15 cm under or over its floor. A foot read 3 to
  15 cm off its floor is printed as a note, not failed: the first whole play after the fix read 3 to 10 cm under for
  the walkers of frame 7, for Yuna and for the guide's paws, and the one such reading looked at closely (Yuna, in the
  map without the story) was the measure's and not the model's; the others are not yet looked at (issue 126's
  follow-up). The rest are printed as notes too: the ellipsoids are fitted, not the skin itself, so a limb case is a place to look, with
  `tools/clip_look.js` (a close still of someone's feet and body, and the ground as it is drawn under each foot by a
  ray through the world's meshes).
- **Walked into.** After each talk and in each Stop the play walks the player straight at everyone within 14 m with the
  key held, takes a still from the side (`into-*.png`) and fails when the player comes within 0.45 m of their middle.
- **`tools/standpoints.py`** (static): no place the story sends the player to stand lies inside one of its people or
  its things of 1964, and no two of its people stand in each other.

What the first measure found, a whole play on a desktop (9164 frames, 231 cases): the player walked into every one of
the story's people, living or afterimage, to 0.05 to 0.12 m from their middle (nothing held the player out of them);
the guide sat with his flank inside Mr Tanaka and inside Akira's afterimage; and nothing else of the kind: nobody of
the story stood in a wall, a post or a car, and the feet the first measure called sunk (the map's NPCs, 5 to 9 cm) were
its own error (it took a kerb beside a foot for the foot's floor; `tools/clip_look.js` has their soles within a
centimetre of the paving drawn). The cause was fixed in `storyFigure`: each of the story's people holds a place as a
map's NPC does (`posts`, kind `story`), so the player's step stops at their shoulder (0.63 m, middle to middle), the
guide keeps his body off them, one of them who walks goes round whoever stands in the way, and a player on whom
someone is set down steps out of them at a walk.

Not measured by the probe, and said so: the skin itself (hair and collar against the neck are told by the fitted parts
only), the crowd's limbs (their middles only, as before), and anything a real GPU, Safari or iOS draws differently.

### At the skin (issue 157)

`tools/clip_people.js` is the close measure for the cases the probe leaves as notes. It skins each model on the CPU as
the GPU does (morphs and bones), calls a point of one body inside another when rays from it along the axes cross that
body's triangles an odd number of times, and gives its depth as the distance to the nearest triangle. Three modes, each
with stills on a desktop's page or a phone's (`TIER=low PHONE=1`, 390x844):

- **`into`**: the player walked straight at each of the map's people named from eight directions with the key held, as
  the play walks into them, and then run past them. What it found on main: the hand that leads the stride 2 to 4.5 cm
  inside a back or an arm in the one frame the middle stopped at their shoulder, from every side. The cause was the
  stride and not the post: `walkStep` kept the point the stride reaches out of walls, and not out of people. It now
  does both, so a walk stops about 0.69 m from someone's middle and a run 0.83 m, and the measure reads no hand in
  anyone.
- **`look`**: someone's head, hair and neck against their own chest and shoulders, and their hands and forearms
  against their trunk, through five seconds of their clip, with a still each second from four sides and one of the
  deepest reading. Taro's head, 3.8 cm in his chest by the probe's ellipsoids through his Photo clip, is 1.4 cm at the
  skin at one point and shows nothing in the stills. Shun's ponytail reads 4.5 cm into his upper back and is a
  ponytail lying on a back in every still; hair fails past 6 cm.
- **`seats`**: the player at the wheel of their car and in the helicopter, on the map without the story (the story's
  flight shows no player). It waits for each model to come before boarding: boarded earlier, the helicopter is its
  stand-in and the car is not drawn at all. The probe's seat measure had thrown at its first ray since it was written
  (a lamp's sprite in the ray's way asks the ray for a camera), so no seat had been read. Read at last: in the
  helicopter the head stood 9 cm through the cabin roof and the hands hung into the seat's sides, fixed in `game.js`
  `heliSit` (the head kept under the roof over it as `cars.js` `sit` does, by `vehicles.js` `roofOver`; the hands in
  the lap). At the wheel the pose is right; what the probe still prints there is a bucket seat round the thighs and
  the wheel's rim in the hands. Sinking the body 8 cm for the roof puts the soles that far under the cabin's floor,
  as it does in the car: under an opaque floor, and printed.

The probe's limb measure in a seat is taken from the limb's own middle out to its points, met from either side: taken
from the pelvis, the front edge of any cushion stood between a seated hip and its shin and read 15 to 43 cm.

## Nobody paces (issue 168)

On 21 November 2026 the owner's still of the walk showed two men under the deck east of the Scramble walking to and
fro. Nothing measured whether a walker gets anywhere.

- **`tools/crowd_pacing.js`** is the survey: on the walk, at each hour (8:00, 12:30, 17:59, 21:00, 23:30), you are
  stood at each of 24 stations (the Scramble, the place of the still, a 400 m grid over the phone's district) with
  the world stepped a tenth of a second at a time for a minute, and every walker is followed by its place in the
  crowd. Over each 30 s a walker who covered more than 12 m, ended within 4 m of where it began and turned round at
  least twice has paced; each is printed with its place, its line, how far its ways lead and what turned it
  (`actors.js` `turn`'s reason, kept when a harness asks). `390x844` runs it as a phone, inside its district. It is
  a job of 35 minutes for a screen, run when the ways or the steering change, not on every change.
- **`tools/pacing_watch.js`** is the same measure on the side of a play: `tools/walk_play.js` and
  `tools/story_play.js` put it in their page, and fail on a walker who paced two windows running or turned four
  times in one. One window alone is a note: a walker held by a car turns once and comes back.

Not measured: whether a walker who stops where the way ends reads as someone waiting (that is for stills), and a
real phone's crowd, which is thinner than the emulated one only by its tier.

## The glass that mirrors its place (issue 203)

On 23 November 2026 a play from the title on the owner's M3 showed SKY STAGE's glass black in frame 4's Stop, and the
man at it with a black mask for a face; begun at frame 4 the same stills were right. Nothing here had seen it, for
two reasons that are now both closed.

- **The cube was never drawn here.** The glass mirrors a cube of the scene taken once, when the level is first shown
  (`hero.js` `probe`). `tools/story_play.js` draws one frame in thirty and leaves the draws out of the rest, and the
  cube's six draws were left out with them: every play mirrored an empty cube, so the checks' roof had clean glass
  whatever a GPU would have drawn in it. A cube's draws are now passed on whatever frame they fall in (the harness
  wraps `THREE.CubeCamera.prototype.update`): the cube a play mirrors is the one a GPU makes.
- **Nothing looked at the glass.** At each Stop where a level's cube has been taken, the play now reads the cube back
  (`hero.probes()`): it must be drawn (over half its texels lit), hold no texel that is no number, and under 0.2% at
  128 or more (a right cube of the roof at night has none; the guide's whiskers put a third of its sky at 65504).
  Then it takes the picture twice, with the glass and without it (`hero.glass(false)`), and over the pane's footprint
  (the pixels the two differ in) sets how light the picture is with the glass against without it: a pane a fifth
  opaque that adds what it mirrors leaves it about as light (1.1 times on a desktop, 1.9 on a phone, whose 64-pixel
  cube spreads the towers' lamps over the pane); the black pane left it at 0.35 to 0.4, garbage on Mesa at 3.4. The
  play fails under 0.7 or over 3. The camera eases between the two pictures, so they are not compared pixel by pixel.
  Both are in every play that reaches a
  Stop on the roof, so in `story1`, `budget1`, `storyp` and `storyl`; with `STILLS=1` the picture without the glass is
  kept beside the still (`4-stop-no-glass.png`).

`?probe=all` puts whoever moves back in the cube (the fault as it was): the check fails on it, which is how it was
tried. `LINKLAG=ms` plays a GPU that links a program in that many milliseconds, one after another (a software renderer
links as it is asked, so no draw here meets a program still linking); each still then prints what `world.js`'s gate
has left out so far. It did not make #203's picture; what it did show is issue 205.

Not measured here: Metal's own reading of the same cube (a Mac shows black where Mesa shows noise: both are the
garbage, read differently), and the guide's black coat in frame 6's Stop on a phone, which no play here has shown.
