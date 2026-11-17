# Sound

Everything the game sounds is made in the browser with Web Audio (`web/game/audio.js`; the score is
`web/game/music.js`). No audio file is fetched. Issue 6 asked for sound "designed and recorded, with the
Stop as the signature"; this page says how it is built, what it learned from, and how its levels are
checked.

## What the frontier does, and what was taken

A short survey, November 2026, of what games with a reputation for sound do and what of it runs in a
browser on a phone.

| Practice | Where it comes from | Taken here |
|---|---|---|
| Time slowed as sound: the world's audio pitched and filtered down with the clock, a held tail under it | Max Payne's bullet time, Quantum Break's time stutters, Superhot, Returnal; the DJ's and producer's "tape stop" | **The Stop** (below): the street's own sound braked from a ring buffer at the story's clock, k² |
| A "freeze" of the last moment as a cloud of grains | Granular synthesis (Curtis Roads, *Microsound*, MIT Press 2001); Mutable Instruments Clouds' freeze (firmware MIT licence); PaulStretch (GPL-2) | The held shimmer: grains of the frozen ring. The idea only; no code was copied from either |
| Layered one-shots: transient, body, tail, each its own layer | Standard practice in AAA sound design (Rob Bridgett, *Game Audio Mixing*, 2021; GDC talks on Uncharted and The Last of Us) | Every story cue (`sfx`): a millisecond of filtered noise for the strike, a sine resonance for the body, the room or the mechanism for the tail |
| Procedural sound from physical behaviour | Andy Farnell, *Designing Sound* (MIT Press, 2010) | The shutter as the mechanism's sequence, the strap's creak as stick-slip, the ratchet's teeth |
| A convolution reverb per space, swapped as the player moves | Frostbite, Wwise's Reflect and convolution, Unreal's submix reverbs; the impulse response as exponentially decaying noise (J. A. Moorer, "About this reverberation business", 1979) | Four rooms (open crossing, the viaduct, inside, the deck at 230 m), impulse responses made at start from noise, crossfaded in 0.3 s. Tone.js (MIT) renders its reverb's IR the same way |
| HRTF spatialisation of point sources | Wwise and FMOD's 3D panners, Steam Audio (Apache-2.0), Resonance Audio (Apache-2.0) | Web Audio's own HRTF `PannerNode` for the walk signals' calls with a mouse; a stereo pan on a touch screen. Resonance Audio and Omnitone (ambisonics, Apache-2.0) were considered and not adopted: a dependency and a cost a phone does not need for a handful of sources |
| Ducking (sidechain) of ambience and score under dialogue | Wwise auto-ducking and HDR audio (DICE's Battlefield) | The street and the score step back 8 dB under each line of dialogue and the preface's type (25 ms in), released half a second after it. It was 5 dB, which left the ticks under the score: "Listened to", below |
| Loudness targets | ITU-R BS.1770-4 (K-weighting, gating), EBU R128; the Audio Standards Working Group's ASWG-R001 for games (−24 LUFS ±2 at home, −18 on a phone) | `tools/sound_render.js` measures every cue's peak, its loudest 400 ms (momentary) and its gated integrated loudness, with BS.1770's filters |

## The mix

```
street sources ─► master (the world's bus) ─► tape (AudioWorklet) ─┬─► duck ─► main (Sound switch) ─► out
                                                                    └─► place's room (convolver) ─► duck
score (music.js), the opening's score ─► musicBus ─────────────────────► duck
story cues, dialogue ticks ─► storyBus ─────────────────────────────────────────────────────────────► out
```

- **The street** (crowd, screens, walk calls, footsteps, rain, wind, traffic, trains) is braked by
  the Stop. **The score** is not: it is not the street's. **The story's own sound** is never braked or
  ducked: it is what is heard in a stopped street.
- **Off** (the Sound switch) suspends the context after the fade, so a muted phone computes nothing.
- **The street's beds** (the rotor, an engine, the wind, a car, its tyres, the rain) are made the first time each is
  asked to be heard, not with the context: made with it, a dozen sources and filters ran silent on a phone's audio
  thread from the loading screen on, while the page loaded.
- **On iOS the context is made in the first touch** (a key, a tap), the one that would have resumed it, and not with
  the page: a context iOS was not given leave for has come up at the wrong rate and played distorted (WebKit bug
  154538). Until then `OEAudio.pending` says sound is wanted and the loading screen asks for the touch as before;
  `OEAudio.made(fn)` runs fn when the context is made (the loading cue waits on it). Elsewhere it is made with the
  page and resumed by the touch.

## The Stop

`hush(true)` (story.js, as time is held) sets the tape's one parameter, `held`, at a time; `hush(false)`
lets it go. The tape keeps the last five seconds of the world's bus in a ring and, held:

1. **brakes** over 0.95 s, the speed of the story's clock (`st.k` from 1 to 0, the world's time k²): it
   plays the ring back at speed k², so pitch and rate fall together, through two one-pole low-passes
   closing from 11 kHz to 150 Hz, at a gain of √k;
2. **holds**: under the brake, as k falls, grains of the ring round where it stopped (80 to 300 ms,
   at the pitch, a fifth, an octave and a twelfth over, high-passed at 900 Hz) rise into a shimmer made
   of nothing but the last sound the street made, for as long as time is held, about 11 dB under the
   live street;
3. **spins up** on release over 0.6 s (k from 0 to 1) from where it stopped, and crosses into the
   live street in 0.25 s.

**On a touch screen, the deck.** The owner played the episode on an iPhone (iOS 27, November 2026) and heard, from
the opening on, a noise "as if the phone were broken". The tape was the one thing in the mix a phone does not do
well. An AudioWorklet takes the whole of a context's rendering onto its own thread, which is not a real-time one
(Chromium's design notes; WebKit renders the same way): under a page loading the map or compiling its shaders it
misses blocks, and a missed block is a click, a run of them a roar. And iOS has more than once left a whole context
distorted, at full level, once a worklet was added to it (WebKit bugs 251091, 274507; each fixed, each a regression
of the one before). So a touch screen (`maxTouchPoints`, as the HRTF panner is chosen) brakes the street with the
browser's own nodes instead (`deckOf` in audio.js): the street read through a DelayNode whose delay grows as the tape
slows is heard at the speed 1 − d′(t), pitch and rate falling together; the delay follows ∫(1 − k²), so the speed is
k² as the worklet's is, through a low-pass of Q 0.5 closing from 11 kHz to 150 Hz (the worklet's two one-pole
sections), at a gain of √k, laid on the parameters in straight segments a fortieth of a second long. Held, the deck
is silent where the worklet has its shimmer of grains (about −50 dB in the render): a phone hears the held street as
the room's tail, the story's choir and its glass. `?tape=worklet` or `?tape=deck` picks one on any device.
`TAPE=worklet|deck tools/sound_render.js` renders either (unset, a phone's, the deck): rendered side by side, the
engine's note brakes on the same curve (47, 44, 35, 26 Hz at 2.0 to 2.2 s), spins up on the same one, and neither
clicks.

The story's own cue `stop` lays over it air drawn in that swells to the moment time stops, a breath of
low air as the floor goes (noise, never a falling tone: a falling tone was tried in stopfx.js and was "a
telephone running out of battery"), and three notes of glass in a long room. `found`, a frame in the
viewfinder, is made of the same glass, grains of it crystallising. Where there is no AudioWorklet (an
old browser, or a page that is not a secure context) the Stop only hushes the street, as before.

## Rooms

`place(kind)` (game.js, every frame from `weatherTick`; it acts only on a change): `inside` in a lift
or a room (`doors.roomAt`), `roof` with the ears more than 40 m over the ground (the deck, the
helicopter), `viaduct` on foot under a roof (`weather.covered()`), `open` otherwise.

| Room | RT60 | Wet (against the dry sound) | Early reflections |
|---|---|---|---|
| open (the crossing's faces, open sky) | 1.5 s | −15 dB | slaps at 31 to 190 ms |
| viaduct (concrete overhead) | 1.9 s | −9 dB | dense, 9 to 45 ms |
| inside (a lobby, a lift) | 0.7 s | −12 dB | 6 to 24 ms |
| roof (230 m up) | 0.4 s | −26 dB | one, faint |

## Levels

`NODE_PATH=$(npm root -g) node tools/sound_render.js <dir>` renders each cue offline (Chromium's
OfflineAudioContext, audio.js unchanged; the tape needs the page to be https, which the harness fakes; the calls are
panned in stereo, as a phone hears them, because the HRTF panner's lazily loaded database can stall an offline render)
to a WAV at the level the game plays it, and prints its peak, its loudest 400 ms and its integrated
loudness. The street at a full crossing is about −36 LUFS momentary; the cues are trimmed (`TRIM` in
audio.js) to sit over it:

| Cue | Loudest 400 ms (LUFS) | |
|---|---|---|
| shutter + film advance, stamp, right | −33 to −34 | the story's moments: over the street |
| found, stop, run | −32 to −36 | |
| wrong, ghost | −36 to −37 | |
| cam-up, cam-down | −38 to −40 | handled, close, quiet |
| goal | about −38 | a breath, no chime |
| end | −31 | the evening resolved |

Peaks stay under −11 dBFS. The renders also hold `the-stop` (the street, braked, held five seconds, let
go), `tape` (the brake with no cues over it), `tape-engine` (a steady note braked, to read its pitch
curve) and `place-*` (footsteps and a call in each room, with its tail).

## The score

The story's score is the `bluehour` palette of `web/game/music.js` (`game.story.palette` in
`cities/shibuya/city.json`; `story.js` drives it through `ctx.score` and `ctx.sting`).

**What was wrong.** Until November 2026 the story played the map's `tokyo` palette: soft electric keys, a
kalimba, a shaker and a heartbeat, a melody improvised from a seed. That is music to walk about to. It said
"rest" under a story that says "seven frames, and they are running out"; it had no tune a player could know
again; it played on unchanged through a Stop; and nothing in it knew when the case turned.

**What the frontier does, and what was taken.**

| Practice | Where it comes from | Taken here |
|---|---|---|
| A theme that is assembled by the player's progress | *Outer Wilds* (A. Prahlow): each traveller found adds an instrument to one tune | The theme is five notes. The score knows two of them before the first frame and one more for each frame taken; a print's sting (`note`) is the note just earned |
| Leitmotif, and a second theme derived from the first | Film practice since Wagner; J. Williams; *The Last of Us* (G. Santaolalla): very few notes, one instrument | Hers: G♯ E D♯ C♯ E in C♯ minor (the overture's motif, and the five syllables of 遅かったね). His is hers upside down. Played together they move in contrary motion and end on one note: two people who mirrored each other for sixty years |
| Spotting: silence and stillness are scored | W. Murch on film sound; *Return of the Obra Dinn* (L. Pope): music only at the memory, cut dead after | No percussion anywhere. In a Stop the beat and the bass go inside a third of a second and the harmony stops moving: pulse and chord change are time's. The pad and the theme, slower, are what is left |
| Vertical layers switched by game state, changes on the bar line | iMUSE (LucasArts, 1991); Wwise and FMOD interactive music | Already how `music.js` works (a bus a layer, changes on the bar line); the Stop alone does not wait for the bar |
| Stingers at story beats, in key and made of the theme | *Ace Attorney* (the turn of a cross-examination), *Disco Elysium* | `turn` (a print settles a question; the world runs on after a reversal), `doubt` (frame 3's false solution: her first three notes with two of them a semitone flat), `meet`, `found` |
| One major chord, kept for the end | T. Newman, J. Hisaishi: a minor score that earns one resolution | `meet` ends on E major, the chord on the note the two lines meet on. Nothing else in the score is major |

Nothing was copied from any of these: the notes, the voices and the code are ours.

**By frame.**

| When | What plays |
|---|---|
| Walking to a frame | Felt piano, rolled chords two bars each, a low pad, a long bass. Once in eight bars the theme on a soft bell, as far as the roll has got |
| A Stop | Pad on one chord; the theme alone at the first bar and every eight, three beats a note |
| A print taken | `note`, 1.5 s after the shutter, under the postmark |
| A print that answers a question (frames 5, 6) | `turn` |
| Time runs on after frames 2, 4, 5 | `turn`; after frame 3, `doubt` |
| Frame 4, the roof | The helicopter's mix: pads only |
| From frame 6 | His answer under hers on the piano, a bar behind |
| Frame 7 | Rain (the felt piano and drops come in), the two themes together |
| They meet | `meet`: both lines to one note, then the major chord; the Stop holds until it has sounded |
| The last card | The existing `end` cue; `found` as the ticket comes up |

**Before the first frame.** The loading screen, the title and the prologue play the score as it is before a
frame is taken: the felt piano's rolled chords, the pad, and the two notes of the theme the score knows so far,
so that the first frame's score is the same music going on, not a second piece. Two things decided how.

- *A file, not the live score.* The live score writes its notes 300 ms ahead from a timer, and a page that is
  parsing and building the map holds the main thread for longer than that: notes would drop. Bouncing it in
  the page was measured too: thirteen seconds for eight bars on a desktop with nothing else to do, which a
  load cannot spare. So `tools/load_cue.js` bounces eight bars (35.6 s at 54) with the score's own code,
  lays the render's tail over its start so the loop has no seam, and writes
  `web/assets/story/late/cue.mp3` (342 kB). `OEMusic.loop` plays it as one looping buffer on the audio
  thread, through the music bus, so it ducks under the prologue's voice like the score. Run the tool again
  after a change to the `bluehour` palette.
- *A browser gives a page no sound before it is touched.* Where it does (a site the visitor has played
  before, a browser set to allow it), the cue starts with the page. Where it does not, the loading screen's
  upper bar says "Click for sound" ("Tap" on a phone) and the first key or touch anywhere starts it. The
  file is decoded only once the context runs, so a page nobody touches keeps no samples.

At the first frame the cue fades over five seconds under the score coming in (the same key, the same tempo)
and its buffer is let go. `?walk=1` has no cue. `tools/load_score.js` checks it as a browser that asks for
the touch: the bar says so and stops saying so, the score is on the bus within a second or two of the
touch and still there on the title, and the loop's join is smoother than the steps inside it.

**Checked.** `tools/music_check.js` renders `story-first-frame`, `story-last-frame`, `story-stop` and
`story-stings` with the rest (peak under −8 dBFS, never silent for two seconds, dark above 4 kHz) and
writes them as WAV files to listen to. Not checked by ear on a device's speaker; levels against the street
are those of the map's score, which the story played before.

**The opening and the flight** (`web/film-score.js`, the episode's `overture.score` and frame 5's `flight.score`).
The opening's score was silent for its first eighteen seconds and then struck an eight-note chord in 40 ms as the
title fell: 25 dB over the second before it, 33 dB over it in its first 50 ms, at -18 dBFS where the game's score
sits at -27. The owner heard it as a jolt. It is rearranged (`swell` on the plan) so that nothing arrives:

- a low bed from the first second (the root, its octave and the fifth between them, no third; one high fifth held
  far off), rising slowly to the title;
- her first two notes on the piano before the title, which falls where the third would;
- the title's chord and the finale's rise over two seconds and more, the low notes first, at under half their
  old level;
- no hush before the title: with nothing loud after it, there is nothing to hold a breath for.

When the game's score is already playing (the loading cue runs through the opening; the score itself through a
flight), `game.js` sets `under` on the plan and the film's score leaves the bed and the two notes to it: one piece
of music, with the title rising out of it.

`tools/overture_levels.js` renders the opening's score and prints its level second by second; it fails on a rise
of more than 8 dB from one second to the next, a 50 ms window more than 12 dB over the second before it, or a
peak over -8 dBFS (`UNDER=1`: as it plays over the loading cue). Now: largest rise 7.5 dB at the very start
(from -47 to -39 dBFS), loudest second -22 dBFS at the title, peak -12 dBFS.


## Listened to

Issue 7: the sound had been checked by level and timing, cue by cue, and never heard through. It is now recorded
through, the episode from the loading screen to the last card, as a player hears it, and read for what grates.

**How it is recorded.** `tools/sound_rec.js` plays the episode with `tools/story_play.js` unchanged, in a browser
whose every AudioContext is tapped where it meets the speakers (`tools/sound_tap.js`, added to the page before its own
scripts): a gain in place of `destination`, into an AudioWorklet that copies what it gets to the harness. The
worklet runs on the audio thread, so a busy main thread loses nothing; each block carries the context's frame and its
output timestamp, so two contexts land on one timeline. The same worklet keeps the level every 512 frames of the score
(before the duck), the street with the score (after it) and the story's own bus, each also round 2 kHz, so what masks
what can be read afterwards; and the page posts what it asked the sound to do (cues, voices, the Stop, the score's
state and stings) and the story's beats, on the same clock.

```
NODE_PATH=$(npm root -g) DRAW=300 xvfb-run -a node tools/sound_rec.js out/desktop 1440x900
NODE_PATH=$(npm root -g) DRAW=300 GESTURE=1 xvfb-run -a node tools/sound_rec.js out/phone 390x844
node tools/sound_page.js out/page desktop-before=... desktop-after=... phone-before=... phone-after=...
```

`GESTURE=1` gives the page no sound until it is touched, and touches the loading screen once, as a player does; the
recording fails if the sound is not running after it. No stills are taken (`SHOTS=1` to take them): on a software
renderer a still holds the main thread for seconds, and the score, which writes its notes 300 ms ahead from a timer,
drops them in the hold. The main thread's remaining stalls (a timer asked for every 100 ms that came 350 ms late or
more) are recorded, and what falls in one is listed apart, not counted: it is the test machine's, not the game's.

**What is listened for** (`tools/sound_analyse.js`, run by the recorder; alone: `node tools/sound_analyse.js out/desktop`):

| | Measured as | Counts as grating |
|---|---|---|
| A click | the waveform's second difference against the 20 ms round it | 30 times its neighbourhood and over 0.02, and not within half a second of a mechanism's own cue (the shutter's curtains, the strap, the ratchet) |
| A cue that strikes | the level of 6 ms against the 60 ms before it | 20 dB up to over −42 dBFS (listed), 30 dB (grates) |
| Clipping | the float samples before the 16-bit clamp | any at full scale, any peak over −1 dBFS |
| A dropout | digital silence in the recording once the sound has run three seconds | 20 ms or more |
| A loop seam | the loading cue's join against the same window at twenty places in its turn | a step half as big again, or a level step over 6 dB |
| A voice under the score | each tick of type (a `voice` call, a key of the preface) as what it adds to the story bus round 2 kHz, against the street and the score in that band while it sounds | a line whose median tick stands less than 6 dB over them |
| A level that jumps | momentary loudness (BS.1770 K-weighting, 400 ms, every 100 ms) | up 10 LU in half a second (not out of silence), or down 14 |

`tools/sound_page.js` makes a page of two runs: each recording whole as an MP3, its loudness from the first card to
the last over the story's beats with the findings marked, the findings side by side, and the same moments of each
(the preface, the opening's end, the first line, the first Stop, the first photograph, time running on) found by what
the story did, so that two runs at different paces line up.

**What it heard (November 2026), and what was done.** Main as it was, recorded through on a desktop and a phone, then
this change (`tools/sound_page.js` of the four runs is the page the owner listened to):

| | Desktop before | after | Phone before | after |
|---|---|---|---|---|
| Clicks | 2 | 0 | 1 | 0 |
| Lines whose ticks are under the score | 28 of 39 | 12 of 43 | 33 of 39 | 19 of 49 |
| Ticks over the bed round 2 kHz, median | +1.1 dB | +10.5 dB | −1.4 dB | +7.6 dB |
| Peaks over −1 dBFS, samples at full scale | 0, 0 | 0, 0 | 0, 0 | 0, 0 |
| AudioContexts | 3 | 1 | 3 | 1 |

- *Voices under the score.* The type's ticks (a line's `voice`, the preface's `key`) were set by their level alone, and
  in the mix they sat 3 to 11 dB under the score in their own band. They are 13 dB up (the keys 12), the duck is 8 dB
  (was 5) and comes in in 25 ms (was 50), and the preface's keys duck the score as a line does.
- *The opening ended on a cut.* Its render stops at its length plus two seconds while the last chord and the room
  still ring, and the fade at its end (three seconds) outlasted what was left: a step of 0.07 as the prologue began.
  `film-score.js` fades the render's last 1.5 s.
- *Two more AudioContexts.* The opening's and the flight's scores each made one of their own (`overture.js`): one a
  phone (iOS) leaves suspended when it is made outside a touch, and one the Sound switch and the duck did not reach.
  They play on the game's context, through the music bus, at the level they had.
- *Cues that struck.* The postmark's thump rose 30 dB over a stopped street in 12 ms, with the score's note under it;
  the finder's catch as the camera comes up rose 22. The thump is 6 ms in and 3 dB lower, the slap 3 ms in, the catch
  6 dB down.
- *A sample's tick* where a cue's later layer began (the goal's second breath, 80 ms in): three in each run. Every node
  of a cue is silent, and its filter at its frequency, from the moment it is made; none since.
- *A touch.* The sound resumed on a pointerdown or a key; the spec and WebKit count a touch at its end. It resumes on
  any pointerup, touchend, click or key, and when the page is seen again (iOS leaves a context interrupted). Chromium's
  phone emulation started on the first tap before and after; Safari was not run.
- *A typed line* (the preface's keys, a tick for every second letter) was the same tick each time, a machine gun
  once it was loud enough to hear: no two are alike now (a few per cent of pitch, a few dB, one in five struck
  harder), and two never come within 45 ms.
- *Stops before silence.* The held choir was stopped 3.2 s into a fade with a time constant of 0.9 s (31 dB down), the
  loading cue at five time constants: both now wait for eight.

Still marked and listened to: the rises left are the story's own cues over a stopped street (time running on, the
stings for a turn and a right answer, the stamp with the score's note, the frame found), 11 to 14 LU in half a second,
each rising over 25 ms or more and peaking under −20 dBFS: the moments, heard over the hush, as they are meant to be.
A third of the lines, in the score's fuller bars, stand over it by less than 6 dB. Counts move between runs with the
software renderer's pace. Main with the story's later calls (the ghost when the clear umbrella turns, a goal on a
choice, found and the score's note when two prints argue in the roll) was recorded through again on a desktop: no
clicks, no dropouts, nothing over −1 dBFS, ticks a median 7 dB over the bed. `wrong` on the fail card, which a played
route does not reach, was recorded alone: clean. Not checked: a real GPU or audio device, Safari or iOS, a phone's own speaker, headphones.
