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
| Ducking (sidechain) of ambience and score under dialogue | Wwise auto-ducking and HDR audio (DICE's Battlefield) | The street and the score step back 5 dB under each line of dialogue, released half a second after it |
| Loudness targets | ITU-R BS.1770-4 (K-weighting, gating), EBU R128; the Audio Standards Working Group's ASWG-R001 for games (−24 LUFS ±2 at home, −18 on a phone) | `tools/sound_render.js` measures every cue's peak, its loudest 400 ms (momentary) and its gated integrated loudness, with BS.1770's filters |

## The mix

```
street sources ─► master (the world's bus) ─► tape (AudioWorklet) ─┬─► duck ─► main (Sound switch) ─► out
                                                                    └─► place's room (convolver) ─► duck
score (music.js) ─► musicBus ─────────────────────────────────────────► duck
story cues, dialogue ticks ─► storyBus ─────────────────────────────────────────────────────────────► out
```

- **The street** (crowd, screens, walk calls, footsteps, rain, wind, traffic, trains) is braked by
  the Stop. **The score** is not: it is not the street's. **The story's own sound** is never braked or
  ducked: it is what is heard in a stopped street.
- **Off** (the Sound switch) suspends the context after the fade, so a muted phone computes nothing.

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

**Checked.** `tools/music_check.js` renders `story-first-frame`, `story-last-frame`, `story-stop` and
`story-stings` with the rest (peak under −8 dBFS, never silent for two seconds, dark above 4 kHz) and
writes them as WAV files to listen to. Not checked by ear on a device's speaker; levels against the street
are those of the map's score, which the story played before.
