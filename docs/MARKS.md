# Marks over the picture

Every mark the page lays over the 3D picture at a point in the world follows one set of rules
(`web/game/marks.js`). That covers the speech marks over people on the walk, the call-outs, the seats' marks, the
overheard bubbles, the names, the story's goal mark in the frame, and the old game's "!" on the builder's map. This
page explains why, and records what was adopted. The check is `tools/mark_cover.js`.

## The report

On 22 November 2026 the owner sent two stills, at dusk and at night, from the chase camera at the player's shoulder
on the Scramble's crosswalk. A small yellow circle with an "!" was drawn on the back of her head, on her hair. The
owner asked for every prompt to follow the rules of perspective, with talk prompts and the like shown only when close.

**What it was.** The "!" was `OEActors.sprite('!')`, the old game's mark over a quest's giver (`game.js`, `npcs[].marker`).
Its material had `depthTest: false` and `renderOrder: 10`, so it was drawn after everything else and over everything.
A man standing beyond the player put his mark, 2.45 m over his head, right where her head was on the screen, and it
was drawn on her. It was also created visible, and only the HUD's minimap pass ever hid it. That pass does not run
behind the title or under the photo mode, so a mark could stay up wherever those left it.

**The class of bug.** Every mark is drawn from a point in the world projected onto the screen, and none of them asked
about the player's body:

- The walk's marks (`walktalk.js`) tested only the city's solids (`nav.col.pick`), and the call-outs tested nothing.
- The overheard bubbles (`places.js`) tested sight only when they found a speaker.
- The names (`game.js` labels) tested no occlusion at all.
- The story's goal ring sat on the player's back whenever she walked straight towards the goal, because that is
  where a point ahead of her lands under a chase camera.

## First principles

A mark drawn at a point of the world claims to be *at* that point. So it is part of the picture, and the picture is
seen from one eye. Whatever stands between that eye and the point stands in front of the mark. The player's body is
the nearest thing in a third-person frame, and a mark drawn over it reads as a mark *on her*. A mark is also an
invitation, and an invitation from across a crossing to someone a few pixels tall is noise. So distance decides when
it appears, and its size on the screen stays within limits.

## The rules

| Rule | How it is tested | Where |
|---|---|---|
| Not over the player's body | Her figure as the camera sees it is a capsule from her feet to 1.8 m (hair included), 0.3 m round, projected to the screen and widened by the mark's own half size. The mark is hidden when its point falls inside the capsule and she is nearer the eye than the point. In her car the capsule is the car's. | `marks.js` `covers` |
| Not over anyone nearer the eye | The same test against the people drawn within 40 m of the camera: the map's people, the story's figures, the guide dog and the crowd as drawn. The mark's own person is skipped. | `marks.js` `see` |
| Not through a wall, a deck or a floor | A ray from the camera to the point through the city's solids. It is asked again every sixth frame per mark and kept in between, so a ray per mark per frame isn't paid. | `marks.js` `see` |
| Only within reach | A part of a story is marked from 18 m (24 before), a word in passing from 10 m (18 before), a name from 8 m (11 before), a seat from 12 m (20 before), a call-out from 14 m, the story's speech mark from 12 m, the old game's "!" from 18 m, and a person's name on the builder's map from 12 m (40 before). Each fades in over its last 5 to 6 metres. | `walktalk.js`, `game.js` `npcMarks`, labels |
| Size between a least and a most | A mark is scaled by 10/d and held between 0.72 and 1, so it never shrinks to a speck or swells over a face. | `walktalk.js` |
| A prompt only within reach | E for a talk is offered within 3.2 m and on your level. It is not limited to the frame, because someone right beside you can be outside a phone's narrow portrait frame. A ray through the solids was tried as well and dropped: a post between two chests took the talk away from Riko at 1.6 m. | `game.js` `currentActionAny` |
| The way's sign is held over a figure, not hidden | The story's goal mark of a place to go or a thing to frame is what a lost player is given (story.js `LOST_S`), and a seat's mark on the walk is the street's offer of a place, so a figure in front of either point does not take it away. It is held just above the figure on the same vertical line (`see` with `lift`, up to six figures over one another), never on her. A speech mark over someone is hidden instead. The goal's way-mark is not tested against the walls: it points where the way can be walked straight from here (`ctx.way`), so a ray at head height meets only a post, a tree or an awning there (it took the mark away on the way from Center Gai to Hachiko). A seat's mark is tested against the walls. | `marks.js` `see`, `story.js` `markTick` |
| Off the frame: an arrow at the edge | The story's goal keeps its arrow at the frame's edge. Only a mark drawn where its point is goes through the tests. The light standing over the goal is a depth-tested column, so it still shows over the roofs when the ring is hidden. | `story.js` `markTick` |

The "!" sprite is now depth-tested like anything else in the world (`depthTest: true`, no depth write), starts hidden,
and is shown only by `npcMarks` under the rules above, fading over a few frames. The same change applies to the ferry
name sprites, which share `OEActors.sprite`.

A thing to frame (the story's `frame` kind) is often a building itself, so it is tested only against her body and the
people, not against the walls.

## What was adopted, and from where

- **Occlusion by line trace, refreshed periodically.** Third-person work in Unreal Engine tests a world-space prompt
  with a line trace from the camera on the visibility channel, every so often rather than every frame, because
  "visible on screen" is not "visible": a wall can stand between the camera and the object while both are in frame
  ([Unreal forums, "How to check if an actor is occluded?"](https://forums.unrealengine.com/t/how-to-check-if-an-actor-is-occluded/1928647)).
  Adopted as the solid ray, asked every sixth frame.
- **Two radii for a prompt.** A sphere of approach shows that something is there, and a smaller trace offers the action
  only when you are at it and turned to it
  ([Unreal forums, RE4-style interaction](https://forums.unrealengine.com/t/what-method-to-use-for-a-re4-style-third-person-interaction-system/1939530)).
  Adopted as the mark's reach (seen) and the E prompt's reach of 3.2 m (do).
- **Fade, not a hard cut.** Markup that would be hidden by a nearer object fades rather than blinks
  ([US patent 10,074,182, "Presenting markup in a scene using depth fading"](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/10074182)).
  Adopted as the marks' CSS opacity transitions and the sprite's eased opacity. Only the idea is used: the
  implementation is our own.
- **The player's body as an occluder.** Engines' depth buffers do this for free for things drawn in the world, which is
  why the "!" is now a depth-tested sprite. HTML marks over the canvas have no depth, so the capsule test stands in for
  it on the CPU. Reading the GPU's depth back for each mark would stall the pipeline, which is worst on a phone.

No library was adopted. The rules and the code are this project's own (`web/game/marks.js`).

## The check

`tools/mark_cover.js out_dir [WxH] [blue|night] [walk|free|story]` puts the player between the camera and someone
marked: Mei on the walk, a quest's giver on the builder's map, or the story's first goal. It does this at 4, 8, 14 and
22 m, with the camera pitched from looking down to looking up so that her head passes over the mark's point. The run
fails in any of these cases:

- a mark is drawn over her body (her skeleton's bones as projected, each 0.11 m round, independent of the rules'
  capsule) while its point lies beyond her;
- a mark is drawn where a solid stands between the eye and its point;
- a mark is drawn over someone beyond its reach;
- in every placing, the marked person's own mark was never drawn at all.

It saves a still for each distance.
