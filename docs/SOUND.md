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
| On a phone, algorithmic late reverb after a convolved head | Moorer 1979 (early reflections, then low-passed combs); M. R. Schroeder, "Natural sounding artificial reverberation" (1962); mobile game engines' algorithmic reverbs (Wwise RoomVerb, FMOD's) | `reverb()` on a touch screen: the head convolved, the tail from six combs a side fitted to the response (Every sound on the audio thread). A feedback delay network (Jot and Chaigne, 1991) and swaying delays (J. Dattorro, "Effect Design", 1997) were tried and measured, and dropped. The ideas only: no code was taken |
| HRTF spatialisation of point sources | Wwise and FMOD's 3D panners, Steam Audio (Apache-2.0), Resonance Audio (Apache-2.0) | Web Audio's own HRTF `PannerNode` for the walk signals' calls with a mouse; a stereo pan on a touch screen. Resonance Audio and Omnitone (ambisonics, Apache-2.0) were considered and not adopted: a dependency and a cost a phone does not need for a handful of sources |
| Ducking (sidechain) of ambience and score under dialogue | Wwise auto-ducking and HDR audio (DICE's Battlefield) | The street and the score step back 8 dB under each line of dialogue and the preface's type (25 ms in), released half a second after it. It was 5 dB, which left the ticks under the score: "Listened to", below |
| A sound's path to the ear: attenuation by distance, the air's loss of the highs, occlusion by what stands between, read by rays at a slower rate than the frame and eased | Unreal's Sound Attenuation (its air absorption low-pass and its occlusion trace, volume and low-pass, interpolated); Wwise's obstruction and occlusion and Spatial Audio's diffraction round edges; Steam Audio's air absorption (Apache-2.0: three bands' exponential loss a metre, 0.0002, 0.0017 and 0.0182); ISO 9613-1 (the air) and 9613-2 (a barrier's loss); Bullington's single knife edge (ITU-R P.526) | **Distance, the air and what stands between** (below): each street sound heard from where it is made, through the air, with the height in it; the middle band's loss and the high band's as one low-pass; the line to the ear read against the collision world and the ground, the edge that most lengthens the way round it taken as the one it bends over, and ISO 9613-2's loss for that path difference, muffled with it. The ideas and the published coefficients only: no code was taken |
| Several points for a long source | Wwise's multi-position emitters, Unreal's spread and its focus | A train heard from its nearest car and from whichever of its cars the air and the city leave the most of |
| Loudness targets | ITU-R BS.1770-4 (K-weighting, gating), EBU R128; the Audio Standards Working Group's ASWG-R001 for games (−24 LUFS ±2 at home, −18 on a phone) | `tools/sound_render.js` measures every cue's peak, its loudest 400 ms (momentary) and its gated integrated loudness, with BS.1770's filters |

## The mix

```
street sources ─► their bus (near, rail, weather, self, city: the mix of the place) ─► master (the world's bus) ─► tape (AudioWorklet; the deck on a touch screen) ─┬─► duck ─► main (Sound switch) ─► out
                                                                    └─► place's room (reverb(): convolver, or on a touch screen its head and combs) ─► duck
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
clicks. The episode recorded through on a phone with the deck (`GESTURE=1 tools/sound_rec.js`, 390×844, low tier):
no sample at full scale, no peak over −1 dBFS (the peak −10.6 dBFS), no dropout, no click or strike outside the test
machine's stalls; the rises as time runs on and the lines close to the score are those under "Listened to". Not
heard on an iPhone: `tools/load_score.js` with `IOS=1` checks the page as one (no context before the touch, the deck,
the score on the bus after it), in Chromium.

The story's own cue `stop` lays over it air drawn in that swells to the moment time stops, a breath of
low air as the floor goes (noise, never a falling tone: a falling tone was tried in stopfx.js and was "a
telephone running out of battery"), and three notes of glass in a long room. `found`, a frame in the
viewfinder, is made of the same glass, grains of it crystallising. Where there is no AudioWorklet (an
old browser, or a page that is not a secure context) the Stop only hushes the street, as before.

## Rooms

`place(kind)` (game.js, every frame from `weatherTick`; it acts only on a change): `inside` in a lift
or a room (`doors.roomAt`), `roof` with the ears more than 40 m over the ground (the deck, the
helicopter), `viaduct` on foot under a roof (the surface model over the ears: `game.js` `roofOver`), `open` otherwise. What the place does to each kind of sound is "The mix, place by place", below.

| Room | RT60 | Wet (against the dry sound) | Early reflections |
|---|---|---|---|
| open (the crossing's faces, open sky) | 1.5 s | −15 dB | slaps at 31 to 190 ms |
| viaduct (concrete overhead) | 1.9 s | −9 dB | dense, 9 to 45 ms |
| inside (a lobby, a lift) | 0.7 s | −12 dB | 6 to 24 ms |
| roof (230 m up) | 0.4 s | −26 dB | one, faint |

On a touch screen each room is the hybrid of "Every sound on the audio thread" (below): its first quarter of a second
convolved as it is, which holds every early reflection in the table, and the rest from feedback combs fitted to it. The
roof's response is 37 dB down by then: a phone hears its head alone.

## Distance, the air and what stands between

On SHIBUYA SKY's roof the owner heard the street below as if standing in it (November 2026): "theoretically you can't
hear the trains up there any more; set how near or far a sound is, or whether it is heard at all, as AAA games do".
What came up was the station's announcement, which was read in plan: the roof is 104 m from the station in plan, so it
played at nine tenths of its level, though the station is 250 m away through the air with the tower between. Each sound
had its own way of reading its distance (in plan for the announcements, a honk and a level crossing's bell; through the
air for the trains and the walk signals' calls), and nothing stood between any of them and the ear.

So every street sound with a place is heard from it through `audio.js` `reach(src, ear)`, as a game's sound engine
treats an emitter:

- **The distance** through the air, height in it. Each sound keeps its own curve (the trains' `(1 − d/240)^2.2`, the
  announcements' `(260 − d)/160`, the calls' `ref/d`), now on the true distance.
- **The air** takes the high sound first: Steam Audio's default coefficients (ISO 9613-1's at 20 °C), its middle band's
  loss as a gain (`exp(−0.0017 d)`) and its high band's as a second-order low-pass, `18 kHz · exp(−0.0083 d)`: 7 kHz at
  100 m, 2 kHz at 250 m.
- **What stands between**: the line from the sound to the ear is read in plan every 3 m (60 reads at most) against the
  collision world (the buildings as published, the landmarks' cells: SHIBUYA SKY's deck and glass among them) and the
  ground. Where it passes through something, the way over that thing's top; where it is clear, by how much. The point
  that most lengthens the way round is the edge the sound bends over (Bullington's single knife edge), and its path
  difference δ gives ISO 9613-2's barrier loss, `10 lg(3 + 20 δ/λ)` at 500 Hz, at most 25 dB (the standard's limit for a
  thick barrier, a building or a roof's two edges), nothing where the line clears with room to spare and a little where it
  grazes. The sound is muffled with it, its low-pass falling to 1.8 kHz at the full loss. The solids say what blocks, not
  the 2 m surface model alone: that is a height field, solid under a platform's canopy or a viaduct, and a train under
  Shibuya's platform roof lost 18 dB to the roof over it. Not the first 6 m from the sound (a train's viaduct, its
  station's canopy), nor 45 m round the station for its announcements (they come out of its doors all round it), nor
  the metre and a half round the ear.
- A sound that goes on (a train) reads its line four times a second and eases to it, as games read occlusion rays at a
  slower rate than the frame; a short one reads it once. A train is 200 m of sound: it is heard from its nearest car and
  from whichever of its cars (every third and the last) the air and the city leave the most of.

What the street sounds like from where (`tools/roof_hear.js`, which reads the page's own `reach`; levels against a sound
at its loudest):

| Where | Announcement, was → now | A train passing, was → now |
|---|---|---|
| the Scramble, at Hachiko | 0 → −1 dB (65 m, in the open) | −4 → −28 dB (behind the station's west front and the buildings north of it, 8 m round them) |
| the street by the station | 0 → 0 dB | +2 → +2 dB (8 m off, in the open) |
| SHIBUYA SKY, the deck's middle | −1 → −62 dB (26 m round the roof's edge) | −67 → −95 dB |
| SHIBUYA SKY, at the glass over the station | 0 → −46 dB | −52 → −75 dB |
| SHIBUYA SKY, at the east glass | −3 → silent | −72 → −101 dB |

On the roof the street is gone, as it is from a real observation deck, and **the wind** is what the deck is heard as:
the weather's wind is the wind at 10 m, and over a city it grows with height by the power law (Hellmann's exponent 0.3),
2.5 times as strong at 230 m, and never quite still there (`game.js` `weatherTick`: at least 0.34 of the wind's level from
200 m up, none in a lift or a room). A honk is heard within 90 m of its car, the walk signals' calls and a level
crossing's bell through `reach` too. One line costs about 0.1 ms on a software renderer (the trains, at most 84 a second:
under 10 ms a second).

## Every sound on the audio thread

**The principle.** iOS plays Web Audio in blocks of 128 frames, 2.7 ms at 48 kHz: whenever a page's Web Audio plays,
WebKit asks the hardware for one render quantum at a time (`MediaSessionManagerCocoa.mm`: `if (webAudioCount) bufferSize =
renderQuantumSize`), and a page's `latencyHint` is not used (`AudioContext.cpp`: "FIXME: Figure out where latencyHint
should go"). A block the audio thread has not made in time is a click; a run of them is a phone that sounds broken. The
context's own render thread is a real-time one (`RealtimeAudioThread.cpp`: time-constraint policy, priority 60); every
other thread is not, and a busy page starves it, and the page is busiest exactly where the story is most a film: the
opening over the crowd, the flight. So on a phone **nothing that sounds may wait on another thread**, and what runs on the
audio thread must cost what it costs whatever the scene. Twice this was broken without anyone seeing it in the code, and
both times the owner heard it on an iPhone first:

1. *The Stop's tape as an AudioWorklet* (November 2026): a worklet takes the whole context's rendering onto a thread of its
   own that is not real time (`AudioWorkletThread.cpp`: user-interactive at best). A touch screen brakes the street with
   the deck instead (The Stop, above).
2. *The reverbs as ConvolverNodes with long responses* (found the day after, when the owner heard the noise again at the
   opening's shot of the crossing from above): WebKit convolves the first 12,288 frames of a response on the audio thread
   and the rest on a "convolution background thread" of default priority (`ReverbConvolver.cpp`, `RealtimeFrameLimit`;
   its own comment: "would be better to up the thread priority here"), whose part of the tail is written late into a
   buffer the audio thread has already read when it is starved for more than a quarter of a second. Four rooms (1.6 to
   2.1 s), the story's hall (4.2 s) and the score's own room (3.6 s, `music.js`, under the score from the first frame on)
   all had such tails.

**What a phone hears now** (`audio.js` `reverb()`, used by the rooms, the hall and the score). Cutting a response into
pieces short enough for the audio thread is exact (tried: within −97 dB of the browser's own convolver) but costs that
thread a pair of 2,048-point FFTs per 1,024 frames for every 1,024 frames of response, since WebKit gives each stage its
own FFTs: the rooms, the hall and the score's room together came to most of a phone's core, which would miss blocks the
other way. So on a touch screen a reverb is a hybrid, as Moorer's paper (the one the impulse responses come from) proposed:

- its **head**, the first quarter of a second (11,025 frames at 44.1 kHz, 12,000 at 48), convolved as it is: every early
  reflection in the rooms' table, at the cost the realtime part of the old convolver had;
- its **tail** from six feedback combs a side (Schroeder 1962; Moorer's low-passed combs), each a delay of 67 to 132 ms
  feeding back into itself, losing in one pass what the response loses below 1 kHz in that time, through a high shelf at
  3 kHz for what it loses faster above (each band's rate a straight line through the first 30 dB of its energy decay
  curve), fed with the response's own last tenth of a second (Hann-windowed) and set to the level of the response's own
  tail. The level is found by running the combs in the page, sample by sample, once for each response (`tailOf`), and is
  what the browser renders within 0.01 dB. Every other comb is fed upside down, so they sum flatter;
- a response 30 dB down by the end of its head (the roof's) is its head alone.

Its cost does not grow with the tail: 12 delays, up to 12 shelves and 12 gains a reverb, nothing off the audio thread.
Fitting and building one takes the page 15 to 21 ms here, once for each response; handing the whole response to a
ConvolverNode, as before, took it 12 to 31 ms (the browser prepares every stage's FFTs when its buffer is set).
With a mouse the whole response is still convolved; `?verb=hybrid` or `?verb=whole` picks one on any device.

Two things were tried and dropped, both measured: a feedback delay network (Jot and Chaigne, 1991; four delays mixed by a
Hadamard matrix), which ran away in Chromium and in WebKit alike. Both engines add a render quantum to some of the edges
of interlocking loops and not to others (a 2×2 rotation scaled by 0.9 grew by 9 dB a second), which at 187 Hz turns a
negative entry of the matrix positive. Each comb is a loop of one delay of its own, and a loop of one delay goes round in
its delay and one quantum more in both engines, which the page's run of the combs counts. And delays that sway by a
fraction of a millisecond (Dattorro; Lexicon), so that no pass repeats the last: a delay read between samples dulls the
tail a little on every pass, 19 dB above 3 kHz by the end of the hall's fifty. Unswayed, the tail repeats itself no more
than 0.12 at any lag from 40 to 160 ms (the whole convolution's: up to 0.07).

**How close it is** (`tools/reverb_check.js`, the impulse responses rendered offline both ways in Chromium, whose
convolver is exact; WebKit's Linux build puts a Nyquist-rate pattern out of every FFT stage even for a silent response, so
it cannot judge, and iOS's WebKit uses Apple's vDSP instead; the four rooms' and the hall's noise comes from a fixed seed
for each room and channel since November 2026, so every page hears the room that was measured and a run gives the same
figures; the score's room is still drawn afresh and moves by a few tenths. Drawn afresh, the inside's low band at 48 kHz
once came out at 3.9 dB, past its 3.7):

| Reverb | Energy decay after the head, broadband (below 500 Hz, above 3 kHz) | Seam | Echo density (whole) | Left/right |
|---|---|---|---|---|
| open | within 0.6 dB (2.4, 1.5) | 1.6 dB | 1.04 (1.11) | 0.01 |
| viaduct | 0.6 (2.1, 1.6) | 1.6 | 1.04 (1.12) | 0.02 |
| inside | 1.3 (3.4, 1.4) | 2.1 | 1.03 (1.10) | 0.02 |
| roof | its head alone: the whole's energy within 0.2 dB | | | |
| hall | 3.7 (3.9, 3.7): its own envelope, (1 − t/4.2)^2.6, bends 3.3 dB away from any exponential, and a tail of loops is a sum of exponentials | 2.8 | 1.06 (1.33) | 0.00 |
| score's room | 1.0 (1.3, 0.6) | 1.6 | 1.00 (1.02) | 0.05 |

Echo density is Abel and Huang's (2006): the share of samples over one standard deviation in 20 ms windows against a
Gaussian's; 1 is noise. The seam is the largest difference of 60 ms windows from 0.15 to 0.6 s.

**The guards.** `tools/check.sh` runs both halves for a change to the sound (`audio`), and the static half always:

- `tools/audio_thread_check.py` reads `web/` and fails on an AudioWorklet, a ScriptProcessorNode, a ConvolverNode, an
  AudioContext made, or a media element's or stream's sound anywhere but the one place each is allowed, with the reason
  it is allowed there (the desktop's tape; `reverb()`; the offline renders; the one context);
- `tools/phone_audio.js` plays the page as an iPhone (its user agent, touch, a phone's viewport, the loading screen
  touched for sound): the opening shot by shot, then a Stop and its choir, a frame found, every room and the live score,
  and fails on a convolver on the live context longer than the realtime limit, a second context, a worklet, the deck or the
  hybrid not chosen, or anything given to speechSynthesis in the opening. Played with `?verb=whole` (the reverbs as they
  were) it fails: seven convolvers of 20,286 to 185,220 frames. Run again touched first on the title (`FIRST=title`), it
  fails on two pieces of music at once in the opening (below);
- `tools/reverb_check.js` holds the hybrid to the table above.

**Seen from a phone.** A browser says nothing of the blocks it missed. What a page can see is two clocks against the
wall's, read ten times a second while the sound runs and the page is seen (`audio.js` `health()`, given to telemetry.js with
each `time` event):

- *the context's own* (`currentTime`), which moves only as blocks are made: while the audio thread is held up it falls
  behind and then jumps. `snd_late` is how far, in ms, the gap rose over its least (the two clocks' drift taken out by a
  straight line through it), `snd_stall` how many readings were 25 ms or more behind, `snd_at` where the worst was (the
  opening's shot, or the story's frame and beat);
- *the output's* (`getOutputTimestamp`: the frame at the speaker and when it is heard). WebKit's `currentTime` counts the
  frames the page's thread has made, not the ones heard: a block made too late for the output leaves it as it was, and the
  output plays that block late and everything after it with it ("Underruns in WebContent Process audio thread lead to extra
  latency", WebKit bug 293296). So a crackle, a run of blocks each a little late, never showed in `snd_late`. The gap
  between the output's clock and the wall's steps up at each and stays: `snd_xrun` counts the steps of 2 ms or more,
  `snd_gap` is their ms in all, `snd_xat` the three places with most;
- and `snd_off`, the seconds the context was not running while sound was wanted and the page seen (iOS leaves it
  `interrupted` after a call or another app's sound; the page now asks for it back every two seconds while it is seen,
  as well as at the next touch), `snd_mute` with the Sound switch off; with `snd` (the tape, the reverb and the rate:
  `deck hybrid 48000`). A phone's story read no clock at all for six minutes (19 November): the context was not running,
  or the sound was off, and nothing said which.

**A page put away is silent.** The context is suspended as the page is hidden and resumed as it is seen again (and asked
again every two seconds while it is seen, should the resume not take). The game stands still in a tab put away, and its
street's beds had gone on behind another tab or app; on a phone a context left running there is an audio thread beside the
page being played. The owner's iPhone had two tabs of the story open on 21 November 2026 when the one in front read three
underruns and a 32.6 s step of the output's clock in the opening's shot from above, as the WebGL contexts of both were
lost. `tools/audio_graph_check.js` puts the page away and back.

The readings of the owner's iPhone from 19 to 21 November (every phone `time` event with sound): three to six underruns a
minute wherever the phone was, walking the map as much as in the opening (20 in 242 s in 渋谷, 35 in 240 s in 原宿), most at
frame 1's Stop (21 in 62 s), and none in some long pieces at the same frame rate (frame 3's approach, 60 s at 18 fps). The
page's load starving the audio thread, as issue 59 put it first, but everywhere and not in step with the frame rate.

A reading from the last second before the page is hidden or the context stops is dropped. The owner's iPhone (iOS 27,
19 November 2026, the episode played to its first Stop and left for a screenshot) read `snd_late 258, snd_stall 3`:
three readings 58, 158 and 258 ms behind, one tenth of a second apart, and then the page hidden. That is not the audio
thread held up and catching up but its clock stopped while the wall's went on, as iOS stops the sound of a page being left
a moment before it says the page is hidden. The same play's opening read 11 ms, another's 38: the opening's crackle, which
the owner heard both times at the shot of the crossing from above, was not in that clock at all. On this machine's headless
browser, whose audio device is a timer sharing the CPU with a software renderer, the clocks say nothing; a phone's are the
first true readings (`tools/audio_graph_check.js` checks the readings against an output clock made to step).

**The graph does not grow.** A node left connected to the mix is visited by the audio thread in every block, silent or not,
until the page lets go of it. WebKit's sound has crackled once a page had left a couple of thousand there (WebKit bug 222098,
fixed for the nodes with tails in 2021; its own advice: take nodes out of the graph once they are no longer useful), and
the street left them by the hundred: every one-shot's last gain stayed on its bus (a beep, a step, a horn, a call's notes
and its own pan, a bogie's wheels, a chime, the story's tones), and the screens' kick left one a beat, two a second for as
long as you stood at the crossing. Every one-shot now takes itself off its bus as it ends (`free`, and a call's own level
and pan after its length). `tools/audio_graph_check.js` plays every one the street and the story make six times over with
the street's beds running, and the screens' song and a train's wheels for six seconds: the graph the audio thread visits
went from 164 nodes to 2,710 and stayed there; it now comes back to what it was (131, with the story's hall, which is made
once and kept).

**Nothing begins before it can be taken up.** The audio thread takes up what the page has made only between blocks, and
only when the page is not changing the graph at that moment. A sound begun at the context's own time was taken up a block
or two late on a busy page, part way up its attack: a click, and over a crowd of them a crackle. Every one-shot begins
`LEAD` (12 ms, about four blocks) after now, the beep's, the step's and the stamp's 2 ms attack in place of the full level
in their first sample, and the deck's brake is laid from the same lead. A bogie's roll swelled up from 0.12 s before the
axle, which put its start in the past: it came in at nine tenths of its level in one sample at every bogie; it now begins
at the lead and the axle after it. The opening's score, joined late where the picture is, comes up over 40 ms.
`tools/audio_graph_check.js` fails on any source begun at or before the context's time.

**What each part costs the audio thread** (`tools/audio_cost.js`: each part on its own in an OfflineAudioContext at 48 kHz,
best of three, as a share of a 2.7 ms block on this machine; a phone's core differs, the shares between parts do not): a
room's hybrid reverb 1.9 %, the hall's 1.4 %, the score's room 1.9 %, the live score with its room 6.8 %, the held choir
1.4 %, the crowd's beds 0.3 %. Everything at once at a Stop is about 13 %; the opening (a room, the deck, two buffers of
music, a train's rumble) about 3 %. Cost is not what broke the opening.

**What the opening asks of the sound on a phone** (`tools/phone_audio.js`, shot by shot, the loading screen touched): the
loading cue alone through the aerial shot; from the kerb a train on the viaduct about 100 m off (its rumble is what the
room's reverb carries, −35 to −37 dBFS out of the convolver); the opening's own score silent until the title over the
crossing from above (it leaves the bed to the loading cue), where it rises with the title's chord; nothing spoken, no
walk calls until the green. The mix is quiet (its loudest second −24 dBFS RMS, its peak −14.7 dBFS) and mostly low: 50 to
80% of its energy under 150 Hz, which a phone's speaker does not play. Not checked: a real iPhone's audio thread, its
speaker, WebKit's real-time scheduling, its vDSP convolver.

## Giving up sound before a click

A block missed is a click whatever the sound costs, because what starves the audio thread (a busy page, heat, a
low-power mode, a page being killed for memory) is not the page's to lift. What the page can do is ask less of the thread
while it is starved. On a touch screen (`audio.js` `shed`; `?shed=0..3` fixes a level on any device, for the tools):

- the street's one-shots (steps, beeps of the world, calls, horns, chimes) are capped at 28 at once, taken from `take()`;
  the dialogue's beeps, the story's bus and the score are never given up;
- when the output's clock steps three times within twenty seconds (`snd_xrun`, above), the sound gives up a level, and at
  least eight seconds later another: **1** lets go of the room's reverb and halves the street's voices (14), **2** lets go
  of the crowd's murmur, the screens' song, the cicadas and the animals (8 voices), **3** keeps four voices of the street;
- ninety seconds without a step bring a level back, and the room with it;
- telemetry says what the phone is (`snd_dev`) and what was given up (`snd_shed`, `snd_shed_s`, `snd_drop`).

`tools/audio_shed_check.js` plays it as a phone's page. **What this does not do:** a page killed for memory. On 21 November
2026 an iPhone's page was taken twice within a minute of entering the story (`gl_lost` at `late trees` and `late in`,
then `crash`), its audio clock stepping by 32 s in the opening just before: the crackle there was the page dying, and no
sound's cost explains it (docs/PERFORMANCE.md, "On a phone").

## The mix, place by place

Issue 127, the owner on SHIBUYA SKY's roof (21 November 2026): the trains and the light rail were heard there as at
the kerb, "not real"; the background sound is to stand beside a AAA game's. `reach` (above) had by then taken each
*point* of sound through the air and round what stands between. What was left is what a *place* does to every sound of
a kind at once, and that is how games mix: every sound belongs to a bus, and where the listener is sets each bus's level
and low-pass.

**What was learned from** (November 2026; the ideas and the published figures only, no code and no recording was taken):

| Practice or measurement | Source | Taken here |
|---|---|---|
| A mix per place: buses by kind of sound, their levels and filters set by the listener's state | Wwise's states over bus volume and low-pass, FMOD's snapshots, Unreal's sound mixes and interior volumes (all proprietary; their documented design only) | `audio.js` `mix(place, up)`: five buses in the world's bus, six places |
| A loudness window: what is far under the loudest thing at the listener is not played | DICE's HDR audio (Frostbite, GDC 2009) | In the cabin and the lift the street's buses are shut, not merely lowered: under a rotor nothing of the city is audible |
| A city heard from height | W. Meyerson's 39-storey tower (USDA Forest Service, 1977): low floors hear the street below, high floors a wide area; Benocci and others, *Noise Mapping* 2020 (a balloon over Milan: 3 to 9 dB between 20 and 150 m); Insomniac's GDC 2019 talk on Spider-Man's New York (the city falls away and calms as you rise; known here from summaries of it, not the talk) | From 25 to 150 m over the street the `near` and `rail` buses fall to nothing and the `city` bus rises: 229 m up the city is 8 to 10 dB under the kerb's street, one sound, under 700 Hz |
| The air | ISO 9613-1 at 20 C, 70 %: 1.1 dB a kilometre at 250 Hz, 5.0 at 1 kHz, 9.0 at 2 kHz, 23 at 4 kHz, 78 at 8 kHz. Over 229 m that is 1 dB at 1 kHz and 5 at 4 kHz: the air is not what dulls a roof, the geometry is | A far event's level and low-pass (`far`); the roof's dullness is the mix, not an air filter |
| Sound is late | 343 m a second: 0.67 s from the street to the deck, 2 s from 700 m | `far(kind, d)` begins d / 343 s after it is asked for |
| A railway bridge | Thompson, *Railway Noise and Vibration* (2009), ch. 11; Liu, Thompson and others, *J. Sound Vib.* 2020: a bridge is about 5 dB (concrete) to 10 dB (steel) louder than plain track, the concrete's sound under 200 Hz, the steel's 200 Hz to 1 kHz | Under the deck the `rail` bus is 3 dB up through a low-pass at 300 Hz, the deck's drum and each axle's boom reach to 70 m, and the wheels' edge is a fifth of what it is beside the viaduct |
| A closed cabin | Car door panels are built for 25 dB or more of transmission loss from 100 Hz to 1 kHz (Akyol, Keller and Geissler, Institute of Acoustics); structure-borne sound under 400 Hz comes through | In the car the street is 12 to 14 dB down through a low-pass at 900 Hz (350 Hz for the trains): the level set against the engine's so that the street is still there, the slope by the figure |
| A helicopter's cabin | AS350: main rotor blade-pass 19.5 Hz; cabin noise is the gearbox's and the turbine's tones, 500 Hz to 3 kHz (NASA's SA 365 study) | The rotor's bed has a turbine's whine and a gearbox's tone in it, and in the cabin stands 8 dB up, the loudest place in the episode |

**Listened to as references** (their pages read, not adopted: nothing is sampled, every sound is still made in the
browser): the crossing, Freesound 79670 by daniele-salvati (CC BY-NC 4.0) and 31791 by Heigh-hoo (CC0); under a metal
railway bridge, Freesound pack 31484 by Pfannkuchn (Berlin's S-Bahn, CC BY 4.0); a car's cabin in night traffic with
its indicator, Freesound 149429 by conleec (CC0); a small helicopter's cabin, Freesound 390647 by gladkiy (CC0). No
recording from a high roof or an observation deck, nor one from under a Tokyo viaduct, was found. These were read as
descriptions and by their uploaders' notes from a session that cannot hear: nobody has yet compared them by ear with
the page.

**The buses** (each a level and a low-pass into the world's bus, so all of it is braked by the Stop):

| Bus | What plays into it |
|---|---|
| `near` | the crowd round you, the walk signals' calls, horns, the station's announcements, the crossing's bell, the birds |
| `rail` | the trains (rumble, wheels, the deck under them), the platforms' chimes and melodies |
| `weather` | rain, wind, thunder, cicadas |
| `self` | your steps, the car's engine, its tyres on the road (`road`), its indicator (`indicator`), the lift's hum and chime (`lift`, `liftChime`), the rotor with its turbine |
| `city` | the city as one sound (`city`: two beds of low noise that share nothing, one a side, each swelling slowly on its own) and its far events (`far`: an ambulance's two notes or a train's horn from 350 to 900 m, every minute or two) |

**The places** (`game.js` `weatherTick` says which, each frame; `audio.js` `MIX`: level in dB and low-pass for each bus):

| Place | Frames | What is heard | `near` | `rail` | `weather` | `self` | `city` |
|---|---|---|---|---|---|---|---|
| The kerb, the crossing | 1, 2, 3, 6, 7 | The crowd by how many stand round you (a third of the level the owner once found too loud and always there; nothing where nobody is), the walk signals' calls from their own posts, a train on the viaduct at its distance and behind the station, the city's hum under it all, in frame 7 the rain | 0 | 0 | 0 | 0 | −10 dB, 260 Hz |
| Under the railway's deck | 5, 6 | A train overhead is the deck: its drum and a boom at every axle, no wheels' edge; the street's voices a little down; the viaduct's close reflections (its room) | −3 dB, 9 kHz | +3 dB, 300 Hz | −4 dB, 6 kHz | 0 | −6 dB, 320 Hz |
| A lift, a room | 4 | The street gone; the machine's hum, the fan's air, two notes as it arrives; the doors open on the roof's wind | shut | shut | shut | 0 | shut |
| The roof, 229 m | 4, 5 | Wind first; the city as one low, wide bed; no car, voice or train; a siren or a horn, far, dulled and late; the helicopter's rotor when it is there | shut | shut | 0 | 0 | −2 dB, 700 Hz |
| The helicopter's cabin | 5 | Rotor, turbine and gearbox over everything, the air's rush with speed; the city silent | shut | shut | −8 dB, 1.8 kHz | +8 dB | shut |
| A car's cabin | 6 | Engine, the road under the tyres, the indicator's relay; the street outside low and dull; rain on the roof | −12 dB, 900 Hz | −14 dB, 350 Hz | −6 dB, 2.5 kHz | −5 dB | −14 dB, 220 Hz |

A phone's cap on voices holds: the far events and the indicator take a voice from the cap as every one-shot of the
street does, and the city's bed and its far events are given up at level 2 with the street's other beds ("Giving up
sound before a click"). Nothing here is off the audio thread: gains, biquads, oscillators, looped noise and a stereo
pan (`tools/audio_thread_check.py`).

Between the kerb and the roof the mix follows the ears' height over the ground (25 to 150 m), so a helicopter rising
from the street loses it by degrees. "Under a deck" is read from the surface model (something 2.5 to 14 m over the ears
and over three of the four points round them): the weather's own answer is drawn only while it rains, lags a walker and
stands after the rain has stopped: on a dry evening the street under the deck had been heard, and had rung, as the
open crossing, and the listening points' check found the roof mixed as under a deck once rain had fallen. The tall lift of SHIBUYA SKY is
ridden as a camera's move outside the tower; it is mixed as the lift for as long as the ride lasts.

**The same train, three places**: at the kerb beside the viaduct a pass-by (its bogies' rhythm, 3 % of its power over
500 Hz); under the deck 4 dB louder and all weight (0.1 to 0.2 % over 500 Hz); on the roof not played at all.

**The Stop.** Every bus is inside the world's bus, before the tape, so nothing of the moving world can pass a Stop:
measured past the tape with a train going by, a touch screen's deck is digitally silent while held (the world's bus
still at −26 dBFS behind it) and a mouse's tape plays only its shimmer of the last moment, 14 to 20 dB under the running
street; let go, the street is back within a decibel. One sound was outside the graph and went on through a Stop: a
platform's announcement spoken by the browser's own voice (`trains.js`). A Stop now cuts it, and the place's mix is
taken off its level, so none is spoken into a lift, a cabin or the roof.

**Levels at the listening points** (`tools/sound_places.js`, in `tools/check.sh`'s `audio`, as a desktop and as a touch
screen): the player stood at each point on the real page (`?walk=1`, 17:30, clear unless the row says rain), the game
driving its own sound, a train run past the nearest point of the real tracks at 54 km/h on a voice of its own, and each
bus's level read from the graph (an AnalyserNode on its output, RMS over four seconds, dBFS). The check reads this
table and fails on a bus outside its range, on a place the game takes for another, on a train under the deck that
still has its wheels in it, and on anything heard past the tape at a Stop. "Silent" is under −70 dBFS.

<!-- sound_places:table -->
| Listening point | near | rail | weather | self | city |
|---|---|---|---|---|---|
| `kerb` Hachiko's kerb, about 160 people round you, the train 40 m off behind the station | −51 to −40 | −67 to −30 | silent | silent | −57 to −45 |
| `kerb-station` the kerb by the station, the train 6 m off on the viaduct | −51 to −40 | −36 to −21 | silent | silent | −57 to −45 |
| `deck` under the railway's deck, the train 8 m overhead | −54 to −43 | −31 to −20 | silent | silent | −53 to −41 |
| `kerb-rain` Hachiko's kerb in frame 7's rain | −51 to −40 | −67 to −30 | −39 to −28 | silent | −57 to −45 |
| `roof` SHIBUYA SKY's deck, 229 m, the train 235 m below | silent | silent | −47 to −36 | silent | −48 to −37 |
| `lift` SHIBUYA SKY's lift, riding | silent | silent | silent | −43 to −32 | silent |
| `heli` the helicopter's cabin, hovering over the pad | silent | silent | silent | −37 to −26 | silent |
| `car` the car's cabin, standing at the kerb, its engine running | −66 to −55 | −78 to −55 | silent | −43 to −32 | −60 to −49 |

At Hachiko the `rail` bus moves by 25 dB from run to run (−35 to −61 in the runs so far): the check's train is behind
the station there, and the game's own trains on the open viaduct, and a platform's departure melody 65 m off (−35),
come and go over it. `self` is silent on foot because the player stands still (steps are its only sound there); the helicopter hovers, so
the air's rush with speed (`weather`) is not in its row.

**Not checked by anyone yet**: how any of this sounds. The levels are read from the graph on a machine with no
speaker; nobody has listened on the owner's iPhone speaker or on headphones, where the city's bed (most of it under
300 Hz) will be all but absent on the speaker and whole on headphones. What to listen for, place by place, is in issue
127's closing note.

## Trains

A train going by is told from a jet by its wheels. What the ear takes for a train, from the way railway noise is made
(D. Thompson, *Railway Noise and Vibration*, 2009: the impact of wheels at joints, the rolling noise of the wheels and
rail, and a steel bridge's own sound, radiated low by its plates): a bogie at a time over the rail's joints and a
deck's, its two axles a wheelbase (2.1 m) apart; a car's two bogies 0.69 of its length apart and the next car's front
bogie close behind the last one's rear, so that at a joint it goes *ta-tan . . . ta-tan ta-tan . . . ta-tan*; the roll of
the wheels swelling with each bogie as it passes, since the wheels are where it comes from; and overhead on a steel
deck, the deck struck by every axle, a low boom under the clatter. Far off, only the rumble: the air takes the high
sound first. The inverter's whine is heard while the motors work, pulling away or braking, and not while the train
coasts.

What it was: a bed of low noise with a hiss over it (a bandpass round 1.5 kHz, Q 0.5) swelling slowly from 240 m off
and falling as slowly, the wheels once a car length and soft (a low-passed thud), and the whine left on at a fixed
pitch as the train coasted, a thin steady tone at 1.2 kHz through the whole passage: a turbine. Under the bridge it was
an aircraft going over, as the owner heard it (November 2026).

So (`audio.js` `trainAt`, driven by `trains.js` with the distance to the nearest car, how far the rail is over your ears,
the speed and a car's length): the bogies' rhythm, each a tick, the wheel's body and the axle's knock, with the roll
swelling past under it; the roll's hiss only within 45 m; the deck's drum (50 to 80 Hz) and each axle's boom on it when
the rail is more than 3 m over you within 30 m; and no whine while it coasts. `tools/train_sound.js` renders eleven
cars at 54 km/h under the bridge and in the street beside the viaduct, offline, to WAV, and reads the rhythm (the
envelope's autocorrelation while it is by: 0.48 and 0.50 as it was, 0.75 and 0.66 now), the share of the sound over
1 kHz from 60 to 150 m off (10 to 11 %, now 5 %) and, under the bridge, the share under 110 Hz while it is overhead
(35 %, now 59 %). Its loudest 400 ms is −28.6 LUFS under the bridge and −30.6 beside the viaduct, 2.7 and 1.6 dB over
what it was: the rhythm, not the level, was what was missing.

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
  lower bar says "Click for sound" ("Tap" on a phone) beside a speaker, and the first key or touch anywhere
  starts it. The file is decoded only once the context runs, so a page nobody touches keeps no samples.
  The browser's leave is kept per site, so the same build can sound at once on one host and wait on another:
  Chrome lets a site it has seen the visitor play media on (its Media Engagement Index, `chrome://media-engagement`)
  sound before a touch, and a new host has none of that. In November 2026 the page sounded at once on the
  owner's GitHub Pages site, a host their browser knew, and waited on the new Vercel one,
  where the ask then sat dimmed in the corner of the upper bar and went unread: a silent load was taken for a
  broken deployment. So it was moved to the lower bar, where a game's loading screen says "press any key", in
  the bar's own type, with a speaker drawn beside it so it reads as a thing to do and not as a caption.

At the first frame the cue fades over five seconds under the score coming in (the same key, the same tempo)
and its buffer is let go. `?walk=1` has no cue. `tools/load_score.js` checks it as a browser that asks for
the touch: the lower bar says so where it can be read (on screen, clear of the roll) and stops saying so, the score is on the bus within a second or two of the
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

On an iPhone the context is made in the first touch, and the plan is decided when the page loads: a player who never
touched the loading screen has no loading cue then, so the opening's score is rendered with its own bed, and the touch
that makes the context (on the title, or Play itself) began the cue as well. Two pieces of music played through the
opening, the cue's piano over the score's bed of low sines (its lowest at 35 Hz). Now the cue is let go as the opening
starts, before it has sounded, whenever the opening's score has its own bed (`game.js` `open`). `FIRST=title
tools/phone_audio.js` touches the title first and fails on two pieces at once (before: two from the first shot to the
last; now: one).

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
