# Voices and faces: the plan

Issue 10 names faces that hold a close shot and recorded Japanese voices with English text as the largest single
step in how the story is received. Neither can be finished in a container: a voice is a person in a booth, and a face
is judged on a real GPU at the distance the story frames it. This page is what can be decided before that: what the
story needs, what is adopted from the open work that runs in a browser, the licences, and the order of the work. The
work itself is issue 11 (voices) and issue 12 (faces).

## What the story has now

- Every line is text, typed in at 55 characters a second (`web/game/hud.js` `dialogue`), with a voice of its own
  under it: not words, the sound of someone saying them, a pitch and a breath per speaker (`web/game/audio.js`
  `voice`, set in `web/game/story.js` `voiceOf`). Someone of 1964 is heard twice, the second fainter.
- Every line is kept in the log of what was said (H, a controller's LB, or from the roll).
- The people are Microsoft Rocketbox avatars (MIT; `web/assets/people/LICENSE-Rocketbox.txt`), built by
  `blender/build_people.py` with their bodies' skeletons and clips. Their glTF is exported without morph targets
  (`export_morph=False`): the faces do not move.

## Voices

**What is wanted.** Each character's lines recorded in Japanese by a Japanese actor, with the English on screen as
subtitles; Kagami's lines stay unvoiced (the player's own words are read, not heard). About 140 lines in episode one,
under 15 minutes of finished audio. The typing of a line follows its recording: a line's text is shown whole as its
audio starts, so the reader is never held to the speaker.

**What is adopted, and the licences.**

| Need | Adopted | Licence | Notes |
|---|---|---|---|
| Recording | Professional actors through an agency, recorded at 48 kHz, 24-bit, dry (no room), one take per line chosen | A buyout contract per actor: use in the game and its trailers, worldwide, no term; and no use of the recordings to train or clone a voice | The owner's decision: money and a contract (AGENTS.md, Ask only) |
| The script for the booth | Generated from the episodes in `cities/shibuya/city.json` `game.story`: one row per line, its speaker, the English, the Japanese, the beat and what the speaker knows at that moment | Ours | A tool to write it: `tools/voice_script.py`, issue 11 |
| Translation | A native Japanese writer, from the English and the story bible (STORY.md), not machine translation | Work for hire | Sumiko's first words each evening are already Japanese |
| Delivery to the browser | Opus in WebM at 48 kbit/s mono (Ogg Opus where Safari needs it), one file per line, fetched when the frame before it begins | Opus: BSD; WebM: BSD | About 2.5 MB for the episode; nothing loads before it can be heard (docs/PERFORMANCE.md) |
| Loudness | The cues' rule (docs/SOUND.md): −24 LUFS integrated at home, dialogue the anchor the street and the score duck under | ITU-R BS.1770-4 | `tools/sound_render.js` measures it |
| Timing for the mouths | Rhubarb Lip Sync, offline, from each line's audio and text to mouth shapes with times | MIT | Its recogniser is English; for Japanese it is run in its phonetic mode, which needs no language model. Checked against a forced alignment from the Montreal Forced Aligner (MIT) and its Japanese model where a shot holds on a mouth |

**Not adopted.** Synthetic voices for the finished story: the owner asked for recorded ones. A synthetic Japanese
voice could stand in while the script is tried (VOICEVOX's characters each carry their own terms of use and a credit;
the code of Style-BERT-VITS2 is AGPL and its models vary): only as a placeholder, never shipped, and each model's
terms read before it is used at all.

## Faces

**What is wanted.** A face that holds the story's closest shot (the afterimage's head and shoulders at the
lower third, about 2 m from the lens): eyes that blink and look at the player, a mouth that follows the voice, brows
that move with what is said. Not a new cast: the same Rocketbox people, given faces that move.

**What is adopted, and the licences.**

| Need | Adopted | Licence | Notes |
|---|---|---|---|
| Blendshapes on the Rocketbox heads | HeadBox (Volonte et al., 2022): ARKit-style blendshapes and visemes made for the Rocketbox library | MIT, as the library | Built into `blender/build_people.py` for the speaking cast only; the crowd keeps faces without morphs (memory: docs/PERFORMANCE.md) |
| Morph targets in the browser | three.js `morphTargetInfluences` on the skinned mesh, in the glTF the build already writes (`export_morph=True` for the cast) | MIT | Visemes as morph targets, driven per frame from the line's Rhubarb track |
| Eyes | A look-at laid over the clip after the mixer has posed the head, taken off before the next frame (AGENTS.md: a pose laid over an animation), saccades and blinks on a timer | Ours | The same pattern as the guide dog's head (`web/game/companion.js`) |
| Skin at a close shot | three.js `MeshPhysicalMaterial` with sheen and a thin subsurface term (`transmission` off), a detail normal from the Rocketbox textures | MIT | Judged on a real GPU against a photograph of a face at the same distance and light, at dusk and at night |

**Not adopted.** MetaHuman (its licence ties the assets to Epic's terms and its faces are far beyond a phone's
budget), photogrammetry of real people (a likeness needs a release, and the story's people are not real ones), and a
face generated from a photograph of anyone.

## The order of the work

1. The script for the booth from the episodes, and its translation (no money spent until the owner says).
2. The faces' blendshapes and eyes, judged on a real GPU at the lower third: they make the story better even before
   it has voices.
3. The recordings, the delivery and the loudness; the typing of a line follows its audio.
4. The mouths from the recordings.

Each step adds its beat to `tools/story_play.js` (a line's audio requested and played; a face's morphs moving while
it speaks) and its stills beside the existing people in the same shot.
