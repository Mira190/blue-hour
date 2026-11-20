# The trailers

Two films made from the game itself, frame by frame: **Blue Hour**, the story's trailer (about 110 seconds), and
**Walk Shibuya**, the map with no story in it at any hour and under any sky (about 80 seconds, with no face near the
lens: the owner's ask, November 2026). Nothing in them is painted over or composited from elsewhere: every picture is
the page as a player's browser draws it, from cameras a player's cannot reach, and every sound is synthesised from the
same shot list, so each hit falls on its cut.

| | |
|---|---|
| Shot lists | `tools/views/trailer-story.json`, `tools/views/trailer-walk.json` (the shots, their type and the score's cues) |
| Director | `tools/trailer/director.js`, run inside the game page: the camera, the clock, the world's pace, the grade, the cast, the type |
| Score | `tools/trailer/score.js`, an OfflineAudioContext in a blank page: every instrument synthesised, no samples |
| Runner | `tools/trailer.js`: stills, the film, the score and the cut (ffmpeg); `tools/trailer/render_score.js` renders a score to a wav |
| Short cuts | `tools/trailer_short.js` and `tools/views/short-*.json`: the films cut again for a phone held upright, from their frames |

```bash
python3 -m http.server 8800 --directory web &
xvfb-run -a node tools/trailer.js tools/views/trailer-story.json --stills --k 0.5        # a still of each shot
xvfb-run -a node tools/trailer.js tools/views/trailer-story.json --stills --shots girl   # one shot
xvfb-run -a node tools/trailer.js tools/views/trailer-story.json                         # the film, its score, the cut
xvfb-run -a node tools/trailer.js tools/views/trailer-story.json --from dog --to meet    # those shots again
node tools/trailer.js tools/views/trailer-story.json --score                             # the score alone
node tools/trailer.js tools/views/trailer-story.json --cut                               # the cut from the frames on disk
```

The film is drawn at 1920×804 (2.39:1, the scope frame) and padded to 1920×1080 by the cut, with a fine grain laid on in
motion and the score under it; a 720p copy is made beside it for a phone. On a session's machine (four cores, Mesa's
llvmpipe) a frame takes about 3.5 seconds, so a film of 75 seconds of picture takes about 1¾ hours; a card on black
costs almost nothing. Frames are numbered by the film's time, so `--from`/`--to` films a few shots again into the same
folder and `--cut` puts the whole together.

## What a blockbuster trailer does, and what is taken from it

| Craft | What it does | Here |
|---|---|---|
| Three movements | The world as it is; the thing that breaks it; the stakes, cut faster and louder to the title | Story: the crossing at the blue hour; the Stop and the girl of 1964; the seven frames counted down to the last. Walk: golden hour; the city lit; rain and a storm to the night |
| The cold open | A held picture or a black card and one sound before any music | A card at 17:14 over a low boom; the walk opens on its coordinates |
| Cards between pictures | Two to four words each, wide-tracked, one idea a card, the tracking breathing open while it is up | The story's own card style (`web/game/story.css` `#g-story-card`: amber mono eyebrow, a rule, Zalando Sans Expanded 200 in caps) extended to the trailer's cards, title and closing plate |
| The cut that stops | Silence is the loudest sound: everything drops out on the turn | The shutter on the Stop, then nothing but a sub falling away and a glass chord; the city's air is taken out with it |
| The braam | Low brass in octaves, the filter opening and closing (after *Inception*, 2010) | Synthesised: saws an octave apart, driven, under a swept low-pass |
| The countdown montage | Short shots on a grid, each cut on a hit | The story's own clock: the frames left on the roll, 6 to 1, a shutter and a hit on each card, every cut on a 120 bpm grid |
| The title drop | After the climax, a beat of black, then the title on the biggest hit | 1.1 s of silence, then the title with an anamorphic streak on a hit and a braam |
| The button | One quiet moment after the title, often a line | The girl at her kerb in the held rain: *Sixty years I have stood on this kerb. I was not waiting for you.* |
| The scope frame, grain | 2.39:1, a film's grain | Drawn at 2.39:1, grain in the cut (`grain` in the shot list), not in the picture the encoder compresses |

Learned from the craft, not copied from any film: no music, picture, type or line of another work is used.

## How a shot is made

Each shot is data (the header of `tools/trailer/director.js` lists every field): a camera move (an orbit, a dolly, a
curve, or a black card), the hour (minutes after the blue hour on the story's date, a named light, or two of them for a
time-lapse), the weather and lightning, the world's pace (1 running, a fraction for slow motion, 0 for time held), the
Stop (the ring, the cold drained street of `story.css` `#g-story-veil`, the air held: `web/game/stopfx.js`), the crowd
(gathered at the Scramble's kerbs, or put round a point, with a wedge in front of the lens kept clear), the signal's
red and green, the story's people (`storyFigure`: an afterimage moves in a stopped world; it can walk, turn to the lens,
or be there only once time stops), the dog (`web/game/companion.js`), a thing of 1964 formed out of grain
(`web/game/past.js`), the helicopter along a path, a train due past a point, depth of field and the camera's motion blur
(`atmosphere.js` camFx), a trim on the hour's own grade, a hand-held drift, a hit felt in the lens, fades and flashes,
and the type.

What the game itself would do is kept: the light and grade for the hour (`atmosphere.js`), its night tone, bloom and
ambient occlusion, its flare when the sun is in the frame (a shot with no `grade`), the crowd, traffic and signals as
they run, the rain and the wet street. Under a harness the game's camera, clock and pace are the director's: the page's
`requestAnimationFrame` and `performance.now` are held by `tools/film/clock.js`, and each frame is given exactly the
world time the shot asks for (none while time is held). The governor is pinned (`?gov=1/1`), so no frame is drawn at a
lower resolution because the last one was slow.

Before a shot is filmed its set is built: the world is simulated for its `preroll` (a crowd mid-crossing, the green
already given), and frames are run without being drawn until the hero level and the characters it needs have come (a
texture goes up a frame, and a drawn frame takes seconds here). A frame is read through the DevTools protocol
(Playwright's own screenshot waits for the page to settle: two seconds a frame).

## The short cuts

For a phone held upright (a short-video feed: 9:16, 20 to 30 seconds), each film has a short cut made from its frames
already on disk, with no filming: `tools/trailer_short.js` and the cut lists `tools/views/short-story.json` (28.5 s)
and `tools/views/short-walk.json` (23 s).

```bash
node tools/trailer_short.js tools/views/short-story.json --film-frames <the film's frames> [--stills 0.5,9.6]
```

| Craft of the feed | Here |
|---|---|
| The first second decides | The story opens on the Stop itself (the crowd crossing, the shutter, time held); the walk on the drop from SHIBUYA SKY's edge |
| A line on screen over every picture | A hook line above the picture for each segment, held over the next while it is the same thought (`head`) |
| Cut on the beat | Every segment a multiple of half a second at 120 bpm, a hit or a shutter on each cut, a push in on the hit (`punch`) |
| Faster, not slower | A stretch of a shot played at its own pace or faster (`speed`): a time-lapse at three times, a crowd at one and a half; never slower, which would show a frame twice |
| The screen filled | A 4:5 window of the film, cropped round its subject (`cx`, or a pair of them to follow it across the frame: the two of the story's meeting walk in from the edges), over the same picture blurred to the edges; the cards drawn again for the upright frame |
| The app's own buttons | No type in the right edge or the bottom of the screen, where the feed puts its buttons and caption |
| A drop on the title | A riser into the last frame's flash, a beat of nothing, the title on the biggest hit |

The film's own type is in its frames (its subtitles, centred, stay inside the window; a card over a picture is not
used, its words would be cut), so the short cut takes its stretches where the film has none or only a centred line.

## The score

`tools/trailer/score.js` renders the shot list's `score.events` in an OfflineAudioContext at 48 kHz: a felt piano (the
story's own motif, `game.overture.score.motif`, in its key), a drone, the braam, impacts, risers and reversed cymbals, a
taiko ensemble and a low string ostinato on the montage's grid, a choir, string swells, a rangefinder's shutter and its
film advance, the Scramble's crossing calls (the chick and the cuckoo), the city's air, rain and thunder. An event's
time names a shot (`"meet@0.909"`: that far through it), so a shot made longer moves its sound with it. It is mixed
through a glue compressor and a limiter, high-passed at 30 Hz, and set to -1 dBFS. The story is in C♯ minor, the walk
in E Lydian. This is a tool, not the game: none of it runs in a player's page (the game's own sound is
`web/game/audio.js`, which keeps the rules for a phone's audio thread).

## Licences

Everything in the films is the repository's own: the map and its models (their licences are in `docs/BUILDINGS.md` and
beside each asset; the people are Microsoft Rocketbox, MIT, `web/assets/people/LICENSE-Rocketbox.txt`), the fonts in
`web/assets/fonts` (SIL Open Font License), and the sound, synthesised here. Nothing was downloaded for them.

## What is not checked

The films are drawn by Mesa's llvmpipe, not a GPU: what a real GPU draws (its antialiasing, its precision) can differ a
little. They are filmed at the desktop tier. The story's dog is the remodelled Akita (`web/assets/animals/akita.glb`,
November 2026), filmed from its branch before it reached main; main now has the same model.
