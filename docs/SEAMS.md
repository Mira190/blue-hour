# The seams

The page is one story on one map, and it is made of parts: the people's models, the hero levels, the map's packs,
the story's data, and the scripts that play them. A change to one part should cost what that part can reach, not
what the whole game costs to check (issue 131; [CHECKS.md](CHECKS.md), "Checks by reach"). What a part can reach is
decided at its seams: what the rest may ask of it. Each seam here is a file under `contracts/` and a check that
holds it in seconds, with the static checks of `tools/check.sh`. A change that keeps its seam runs the seam's check
and its own part's; a change that moves a seam shows as a change to the contract, in the diff.

| Part | What the rest may ask of it | Contract | Held by | A change that keeps the seam runs |
|---|---|---|---|---|
| The people's models and clips | joints by name, clips by name, materials by the end of their name, a face's shapes, height, feet at the origin | `contracts/people.json` | `tools/people_contract.py` | `static`, `look`, `mem` |
| The hero levels' models | nodes, materials and flags by name; where the ground lies | the model's own interface at the commit before | `tools/model_contract.py` | `static`, `look`, `mem` |
| Any other model, picture or sound | names, flags, attributes, clips | the same | `tools/model_contract.py` | `static`, `look`, `mem` |
| The map's packs | the JSON they are packed from, decoded to the same values | the JSON itself | `pipeline/pack.py --check`, `tools/pack_check.js` | what the JSON's change reaches |
| The story's data | its frames; a frame's prose is read by the play of that frame only | `cities/shibuya/city.json` `game.story` | `tools/voice_check.py`, `tools/goals_check.js`, the rule for words in `tools/check_cache.py` | `static` and the story's part with that frame |
| The scripts, part by part | a global and the names on it | `contracts/parts.json` | `tools/seams.py` | the checks that ran the functions changed |

## The scripts' parts

`contracts/parts.json` lists twelve parts, the scripts of each, and for every global a part defines
(`window.OEAudio`, `window.OEStory` ...) the names other parts ask of it: 228 names across 69 globals in November
2026. `tools/seams.py` reads the scripts as they are and fails when a script asks another part for a name its
contract does not offer, when a contract offers a name its part no longer says, or when a script belongs to no part.

    python3 tools/seams.py            # the check
    python3 tools/seams.py --uses     # who asks what of whom
    python3 tools/seams.py --write    # the offers as the scripts ask for them now: a seam widened, said so in the diff
    python3 tools/seams.py part web/game/cars.js

| Part | For |
|---|---|
| game | The composition root, `web/game/game.js`: loads the map, makes every other part, runs the loop and the title |
| story | The story's engine: episodes, frames, the Stop, the dialogue and its log, the goals, the walk's talk |
| camera | Where the lens stands and how it moves: scripted shots, the talk's two-shot, a seat to watch from, the grade |
| people | The people drawn: rigs and clips, the crowd's copies, faces, the things carried |
| crowd | Who walks where: the crowd, the NPCs, the walking grid, the ways, the guide |
| traffic | Cars and their drivers, the junctions' lights, the helicopter, the trains |
| sound | Everything heard, made on the audio thread |
| hud | What is laid over the picture: the goal line, the cards, the viewfinder, the touch pad |
| light | The hour and the weather: sun, sky, night's lights, rain, ambient occlusion, the street's mirror |
| hero | The hero levels' loading round the player |
| world | The map drawn from its packs: buildings, streets, trees, materials, textures, visibility |
| device | The device's tier, the governor, the care of the WebGL context, telemetry |

What a name on a global returns (the object `OEStory.create` gives back, say) is not listed: its methods are asked
for through a local name, which a reader of the script's text cannot follow soundly. That seam is held the other
way, by what ran: the browser counts which functions each check runs, and a change inside a function a check never
ran does not send that check again ([CHECKS.md](CHECKS.md), "Checks by reach"). So the two together: the contract
says where one part may touch another, and the count says how far a change inside a part went.

`game.js` is the one part that may ask all the others, and it is 8,700 lines in one closure. It is being cut along
these seams, a section at a time (issue 131), so that a change's reach can be read from the files it touches and
fifteen sessions stop meeting in one file.

## A new avatar set

The owner's example: "if I change the people's models next time, it should not touch the story at all, and the
story should not be played again." What the page asks of a person's model is `contracts/people.json`; a set that
gives it replaces the one in use and runs `static` (where `tools/people_contract.py` is), `look` and `mem`:
minutes. The story is not played. Exactly what a set has to provide:

1. **The index**, `web/assets/people/people.json`: for who you play (`heroes.characters`) a `file`, `height_m`,
   `ground_speed` for `Walk`, `Run` and `Sprint`, `clips`, and `neck_camera` (`lugs`, `lens`, `top`, `centre`, `old`:
   where the camera hangs); for everyone else (`npcs.characters`) a `file`, `sex` and `height_m`, under the ids the
   map casts (`cities/shibuya/city.json`: `character` in the story's cast and afterimages, `game.npcs[].look`,
   `game.crowd.cast`); and for each of the two a `bones` map from the eighteen logical names the code asks for
   (`Head`, `Chest`, `Abdomen`, `Hips`, `WristR`, `WristL`, and the upper and lower leg, foot, upper and lower arm
   and wrist of each side) to the set's own bone names.
2. **Each model**: in metres, y up, facing +z, its origin between the feet on the ground (within 6 cm) and as tall
   as the index says (within 6 cm, between 1.45 and 1.98 m); one skin whose joints include every bone the `bones`
   map names, one joint ending `LEye`, `REye`, `Neck`, `Head`, and `Pelvis` or `Spine`, and a finger to grip with on
   each hand (`<hand's stem>_Finger2` or `_Finger01`); a material ending `_body` (its texture's alpha marks skin from
   cloth) and one ending `_head`; hair cards on a material ending `_opacity`.
3. **Clips.** Who you play carries their own: `Idle`, `Idle_Neutral`, `Walk`, `Run`, `Sprint`, `Wave`, `Talk`, walked
   and run on the spot. Everyone else shares one file a sex (`npcs.clips`: `Idle`, `Idle_Neutral`, `Walk`, `Wave`,
   `Talk`, `Listen`, `Nod`, and every clip a person of the map is cast with; `npcs.field`: `Run`), bound by bone
   name, so every bone a clip drives must be a node of every model of that sex.
4. **Faces.** A model the index gives a `face`, and both of who you play, has a mesh with the fourteen shapes
   `face.js` moves (`eyeBlink`, `eyeSquint`, `eyeWide`, the three brows, `mouthSmile`, `mouthFrown`, `mouthPress`,
   and the visemes `aa`, `E`, `O`, `U`, `PP`).
5. **Who you play only**: the camera's materials (`camera_camera`, `camera_strap`, and `camera_strap1964` for the
   frames of 1964).
6. **The far crowd**: `crowd_cast.glb` with a node for each of the crowd's cast and its `~coarse` copy
   (`pipeline/crowd_cast.py --check`, as before).
7. **The guide dog** (`story.episodes[].guide.model`): clips `idle`, `walk`, `trot`, `sit`, bones `head` and `neck`,
   looking along +x.

What the contract does not hold, and a session still owes: how the set looks in the street at the episode's hour, in
stills beside the people already there, on a desktop and a phone (AGENTS.md, "Checking your own work"); and main's
full tier plays the story with it after it lands.

One exception is written into the contract: `oda` is cast with the clip `Drink`, which the men's file has not, so
he stands in `Idle`. Building the clip or recasting him removes the line.

## The hero levels

`web/game/hero.js` finds a level's materials by the start of their name (`ground`, `glow`, `tube`, `chase`, `refl`,
`paper`, `lamp`, `win`) and its nodes by name (`nocast`, what the city hides for it); `game.js` takes the walking
heights from the meshes whose material is named `ground*`. So a level's interface is its names, flags and
attributes, as for any model, and where its ground lies: each ground primitive's vertex count, bounds and placing
(`tools/model_contract.py`, read from the GLB's header in milliseconds). A level rebuilt with all of that as it was
(a facade sculpted, a sign redrawn, an atlas repainted) is loaded, looked at and weighed; one whose ground moved,
or that lost a name, is played. Until November 2026 any change to a hero level played the story.

## The story's data

A frame's prose (what is said, the goal's line, a note) is read when that frame is played and by nothing else. When
all that differs in the game's data since a check passed is prose inside the story's frames, the packs made from it
reach only the play of those frames: `story1` plays frames 1 to 4, `story2` 5 and 6, `story3` 7 and the last card
(which offers frame 1 again). A name, a clip, an hour or a place is not prose, and reaches whatever read the pack.
`tools/voice_check.py` reads every line with the static checks, whatever is played.

## The cut of game.js

`web/game/game.js` was 8,700 lines in one closure: every function in it can name every variable of it, so nothing
said what a section needs of the rest. It is cut a section at a time by `tools/cut.js`, which reads the closure with
TypeScript's checker and moves the statements between two lines into a script of their own, a function of one
argument: `g`, the rest of the game by name. Every use in the section of a name the rest declares becomes `g.name`,
and the line left in `game.js` hands over an object with a getter for each (and a setter for a `let`); the names the
rest uses of the section come back from the call, by name. So the part's surface is two lists, written at the top of
its file, kept in `contracts/parts.json` (`asks_of_game`) and held by `tools/seams.py`: a `g.name` the contract does
not list, or one `game.js` does not hand over, fails the static checks instead of being `undefined` in the page.
Nothing outside the section moves and nothing inside it is reformatted, so a branch that did not edit the section
merges cleanly; a branch that did carries its edit over to the new file by hand, with `g.` before the game's names.

    node tools/cut_survey.js                         # each section: its lines, what it would offer, what it would ask
    node tools/cut.js web/game/game.js 1600 1941     # the same for two lines, by the checker: exact
    KEEP=pilotEnd node tools/cut.js web/game/game.js 1600 1941 web/game/pilot.js OEGamePilot   # the cut

| Cut | Lines | Part | Asks of the game | Gives back |
|---|---|---|---|---|
| `web/game/pilot.js`, November 2026 | 342 (the autopilot of your own car, the driver assists) | traffic | 38 names | 11 |

What a cut is not: a redesign. The section asks for what it used, which for the sections woven into the loop is most
of the game (`tools/cut_survey.js`: the loop asks 198 names, the camera's shots 249). Those want their state gathered
first; the order by which the survey says a cut is cheap is the traffic (cars, taxis and rides: lines no branch was
in), the old free game's tools (the height guess, the survey, the phone), the route, the input, and last the story's
section, the loop and the camera.
