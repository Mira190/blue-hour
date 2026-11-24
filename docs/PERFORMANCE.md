# Performance on ordinary devices

The rule: cut what a player cannot see (GPU memory nobody samples, triangles smaller than a pixel,
work repeated for nothing), never what they can. Every change here is measured before and after, and
checked in stills from the same viewpoints.

## Measuring

- `tools/tex_mem.js` hooks every 2D texture upload in the page and sums the GPU memory per texture
  (mips included), with the image each came from. `STACK=1` names the script line that made a
  generated one; `OWNERS=1` lists which mesh and material holds a texture of each size in the game.
- `tools/far_cost.js` counts one frame's triangles and draw calls from a viewpoint, and for every mesh
  (each instance of an instanced one) how many of its triangles lie past 300 m, 800 m and 2 km.
- `tools/frame_cost.js` lists every framebuffer one frame draws into (size, format, MSAA), the draws and
  triangles into each, the full-screen passes and the bytes they write, the pixels shaded and the main thread's
  time a frame; `tools/frame_sweep.sh` makes a table of it for every live city and tier.
- `tools/reef_frame.js` does the same for a reef or alpine site on the WebGPU backend the visitors get: every render
  and compute pass of a frame with who asked for it, its target, draws, triangles, pixels and bytes written, and the
  GPU's time inside it by timestamp query; `ABLATE=1` adds what each thing in the scene costs.
- `tools/views/sydney-vram.json`: a street view and an aerial view at day and night, for
  `tools/game_shot.js` before and after.

## GPU memory

Sydney's game on the high tier at 1440 × 900 held **456 MB** of textures, the title screen **195 MB**,
none of it block-compressed. What was cut, with no change on screen:

| What | Before | After | How |
|---|---|---|---|
| The sun's shadow map | 64 MB RGBA8 colour beside the 48 MB depth | 16 MB R8 colour | three.js r186 gives a PCF shadow map's render target an RGBA8 colour texture it never reads (only the depth texture is sampled). `world.js` `leanShadowMap` makes the target first, with a one-byte colour texture, and WebGLShadowMap keeps it (it builds its own only while `shadow.map` is null). A framebuffer's attachments must share a size, so the colour cannot go entirely. |
| The water's cover mask (`world.js` `waterCover`) | 40 MB RGBA8 | 10 MB R8 | a mask read as `.r` |
| The title's clouds (`earth.js`) | 43 MB RGBA8 | 11 MB R8 | a grey image read as `.r` (the 8K night lights already were) |
| The vessels' baked AO (`game/vehicles.js` `dress`) | 21 MB RGBA8 each (2048 px) | 5 MB R8 | three.js reads an AO map's `.r` |

Result: the game **456 → 362 MB**, the title **195 → 163 MB**. A rerun of the same build differs from
itself as much as before differs from after (moving crowd, cars and clouds), and the shadows match.

### KTX2 / Basis Universal: tried, not adopted for photographs

The biggest textures are aerial photographs (twelve 1000 × 1200 ground tiles per city, 6 MB each on
the GPU; the roofs' 2560 × 4096 composite of them; the sea) and the globe's Blue Marble. Encoded with
Basis Universal 1.x (Apache-2.0, through the MIT `ktx2-encoder` package's WASM build) and transcoded
back with three.js's `basis_transcoder`, one Sydney tile (JPEG 414 KB) gave:

| Mode | File | Against the source | GPU |
|---|---|---|---|
| ETC1S, quality 255 | 321 KB | PSNR 27.7 dB, SSIM 0.944: visibly softer and blockier | ÷ 12 |
| ETC1S, quality 128 | 222 KB | 24.9 dB | ÷ 12 |
| UASTC, effort 2, Zstandard | 1,565 KB | 42.4 dB, SSIM 0.999: indistinguishable | ÷ 4 |
| UASTC with RDO λ 3 | 1,424 KB | 36.5 dB | ÷ 4 |

For a photograph KTX2 trades either the picture (ETC1S) or the download, 3.5 times the JPEG (UASTC),
for GPU memory. Both break the rule, so the photographs stay JPEG. KTX2 remains the right format for
textures authored for it in the Blender builds (where UASTC's size is close to the PNG it replaces),
and real-time GPU block compression of a decoded JPEG (as Ludicon's spark.js does) would get the
memory without the download; neither is done yet.

## Work done for nothing each frame

Two more, the same picture to the bit:

- **The post stack's second multisampled buffer** (`world.js` `leanComposer`, used by the game, the viewer and
  the title). An EffectComposer clones its target for the other half of its ping-pong pair, so with 4x MSAA every
  full-screen pass after the scene (AO mix, highlights, bloom composite, lens, output) wrote four samples a
  pixel into an RGBA16F target and resolved them. A triangle that covers the frame gives all four samples the
  same value. Now only the scene draws into the multisampled target, and the passes take turns between two
  single-sampled ones. The second MSAA colour-and-depth buffer is gone: 62 MB at 1440 x 900, about 250 MB
  at 2880 x 1800 on a high-DPI screen.
- **The buildings in cells** (`buildings.js` `cells`). The city's walls and roofs were one mesh (Sydney:
  572,000 triangles across 5.7 km), so the GPU drew all of it twice every frame: once for the view and once for
  the sun's shadow map, which covers 340 m round a walker. The same triangles now go out as meshes over a grid
  of about 64 cells. They share the one geometry's vertex buffers (only the indices are new), and frustum
  culling drops the cells behind the camera and outside the shadow box. The one mesh stays out of the scene,
  for picking and its bounds tree. Sydney's game from the street went from **5.40 to 4.42 million triangles a
  frame** (shadow pass 2.08 to 1.57, view 3.31 to 2.84) for 29 more draw calls. The viewer's software-rendered
  frame went from 269 to 121 ms.

- **The static instanced props in cells** (`buildings.js` `cellInstances`): the rooftop plant, tanks, dormers,
  chimney stacks and gables (`buildings.js`), the landmarks' street furniture (`world.js`) and the game's benches
  and lamp posts (`game/game.js`). An instanced mesh is culled as a whole against a sphere round every instance,
  so a city's plant boxes were drawn into the view and the shadow map wherever the camera stood. Each is now
  split in place over a 400 m grid: the mesh keeps one cell's instances and takes the rest as child instanced
  meshes with the same geometry and material, so the cells outside the view or the shadow box are dropped.
  Each cell is a draw call, and on an old device draw calls cost the CPU more than small triangles cost the
  GPU, so only a mesh of 30,000 triangles or more is split. A first try at 250 m on every mesh of 48 instances
  or more saved 0.29 million triangles for up to 292 more draws, too many. Sydney from the street now draws
  **4.31 → 4.09 and 4.75 → 4.58 million triangles** (two views facing each other) for 40 and 81 more draws.
  The street lamps after dark were already drawn by cell (`night.js`).

- **The sun's shadow, split by what moves** (`world.js` `shadowCache`, `trees.js` `shadowCount`). A frame-by-frame
  count of the shadow pass on foot in Sydney (`tools/frame_cost.js` with `FOOT=1 FREEZE=1`, and a split by caster)
  found it was not the buildings: those were already culled by cell. It was the trees within 520 m, which are
  drawn whole (their instances are re-sorted as the camera moves, so frustum culling is off for them) into a map
  180 m round the player, the traffic signals of the whole city, the crowd and the cars. Three changes:
  - the trees: each re-sort writes the near and mid trees nearest first by their distance from the eye in the
    light's plane, and the shadow pass draws only the first so many that can reach the shadow camera's box, with
    30 m for a crown and its sway and room for the sun's turn since the sort (a turn of 3 degrees re-sorts). The
    view draws them all. 0.35 to 0.20 million triangles.
  - the traffic signals' poles, arms and housings (`game/junctions.js`) go in cells, like the props above.
  - the still casters (buildings, props, landmarks, signals, benches, lamp posts: `world.js` `still()`, or
    `userData.shadowStatic`) are drawn into a depth map of their own only when the light's pose or one of them
    changes (the sun steps every quarter second of the game's clock; a lift car moving; a landmark shown or
    hidden), and copied into the shadow map with a framebuffer blit in place of its clear each frame, before
    the moving casters are drawn over it. Three.js's own shadow pass draws both halves with its own materials.
    `fitShadow` keeps 5% more room than asked and holds the box still while the view moves inside that room and
    the sun has not stepped, so a walker does not slide it a texel every few frames. `?shadowcache=off` turns it
    off.

  Sydney on foot, one frame without a refresh: the shadow pass went from about **1.47 to 1.16 million
  triangles**, the still casters' share drawn about four times a second instead of sixty. Stills with the cache on
  and off match to the bit from the air and in every shadow on the ground on foot (the rest is wind, waves and the
  crowd). What is left is the crowd (about 0.6 million; people only stand round the player, so the box covers
  them) and the cars. Not measurable here: the time a blit of a 4096 px depth map takes on a phone's GPU, against
  the triangles it saves; on the low tier the map is 2048 px, a quarter of the bytes.

What the shadow pass still draws is mostly instanced props, trees and people spread over the whole city. An
instanced mesh is culled as a whole, so these are drawn in full however small the shadow box.

## The story check's frames not drawn (issue 70)

On a session's machine (four cores, Chromium on Mesa's llvmpipe under `xvfb-run`) `tools/story_play.js` plays the story
at 800x500 with one frame in thirty drawn (`DRAW=30`, issue 51). Measured with the play's own clock (its last line now
says where the wall's time went: frames not drawn, frames drawn, and the stills with the frames drawn whole for them) and
CDP `Profiler` (`PROFILE=still:seconds`), one browser at a time, the same machine before and after.

**Where an undrawn frame's time went** (a minute after a still, sampled every 0.5 ms; own time):

| frame 2's walk (`2-said-go-talk-shun`) | | frame 7's rain, the full crowd (`7-rain-0s`) | |
|---|---|---|---|
| `getError` (game.js `glCheck`) | 16% | `getBufferSubData` (world.js `pollReads`: the rain's cover map read back) | 27% |
| crowd `update` (actors.js 2487, the traffic) | 6% | `getError` (`glCheck`) | 8% |
| crowd `plazaStep` (actors.js 1070) | 6% | crowd `walk` (actors.js 1341) | 4% |
| crowd `walk` (actors.js 1341) | 6% | `updateMatrixWorld` (the world, at each render skipped) | 4% |
| crowd `update` (actors.js 1270) | 6% | crowd `plazaStep` | 4% |
| `updateMatrixWorld` | 5% | traffic `update` (actors.js 2487) | 4% |
| crowd `nearest` (actors.js 320) | 4% | crowd `update` (actors.js 1270) | 3% |
| `simulate` (game.js) | 3% | crowd `nearest` | 2% |
| `traverseVisible` (the `onBeforeRender` replay) | 2% | `getProgramInfoLog` (a program's first draw) | 2% |
| `getPropertyValue` (hud.js `css`, the minimap) | 2% | `traverseVisible` | 2% |

Including what they call: the crowd and the traffic (`actors.js` `update`, its walking, its plazas, its nearest
neighbours, `people.js` `place`) were 44% in frame 2 and 40% in frame 7. They are what the checks read (where everyone
is, who blocks whom, the umbrellas), so they stay. The two biggest lines were neither: each was the page asking the GPU
something it could only answer once llvmpipe had finished the frame drawn before, which took a second. A frame not drawn
waited for it.

**What was cut, on a check's frames not drawn only** (`window.__draw.on === false`, which only the harness sets; a
player's page has no `__draw`, and every frame of it is drawn as before):

- `getError` answers no error without asking (story_play.js). An error stays in the context until it is asked for, so
  the game's `glCheck` still finds it, in its next ask made in a drawn frame. No story check read it (the `gl` target does).
- The rain's cover map (weather.js `renderOcc`) is neither drawn nor read back there. Its render was skipped already (#51),
  and its read back of the old map waited for the GPU. The map is drawn and read in the next frame drawn, which so shows the
  rain kept out from under cover as it is; before, a still's frame could carry a map whose render had been skipped.
  `world.js` `pollReads` waits for a frame drawn to read.
- The minimap (hud.js `draw`) and the names over the street (game.js `updateLabels`) are placed for the frame drawn
  alone: both are worked out from where things are, with nothing carried over.

Not cut: the rigs' animation out of view (`rig.animate` sets each walker's clip speed from their pace every frame, so a
pose deferred to the next drawn frame would not be the same pose), the street mirror's render (drawn every other frame,
so skipping it would move which of a still's two frames reflects), and the world's `updateMatrixWorld` at each render
skipped (code between two renders of a frame reads the matrices the first left).

**Before and after, the whole play** (`DRAW=30 node tools/story_play.js out 800x500` under `xvfb-run -a`):

| | before | after |
|---|---|---|
| played in | 996 s | 953 s |
| script in a frame | 54.1 ms | 48.8 ms |
| a frame not drawn | about 55 ms (frame 7: 56) | 40 ms, the game's clock at 0.89 of the wall's (frame 7: 0.64 before) |

The page's errors none either way, the same beats reached and the same stills (a contact sheet of nine beats side by side:
the same light, grade and interface; the crowd stands elsewhere in any two runs, since a frame's step follows the wall clock).

**Why the play cannot come under 600 s with the same stills.** After the cut the play's 953 s were 435 s of frames not drawn
(the game's clock at 0.89 of the wall's: the frames cannot make the story's clock run faster than the wall's, a twentieth of
a second a frame at most), 52 s of frames drawn between the stills, and 472 s of 136 stills: 141 s drawing their frames
whole and 278 s taking them. A frame drawn whole costs llvmpipe 1.1 to 1.6 s at 800x500 on the high tier (`GPUCOST=7-rain-10s`:
from the frame's start to a pixel read back, the GPU idle again 5 ms after the frame), and a still is of the second of two
frames drawn whole, since the ambient occlusion carries its history from one drawn frame to the next (ao.js), so a still costs
two of them and the screenshot waits for both. The stills alone are over 350 s, and the story's clock needs some 420 s
on top, so a play under 600 s would mean fewer stills, a lighter tier for them, or a frame drawn whole for less on llvmpipe
(the frame budget's own work, issue 352 and after), not cheaper frames not drawn.

## The story check's stills (issue 78)

After issue 70 the play's stills were 472 to 502 s of it: each a second of two frames drawn whole, since the ambient
occlusion carries its history from one frame drawn to the next (ao.js). Measured on a session's machine, one browser at
a time, with the play's last line and `SHOTCOST=still` (each part of taking a still, after that still, with the page's
frames held):

- **The screenshot is not what is slow.** With the page idle Playwright's screenshot takes 60 to 90 ms at 800x500 (CDP's
  PNG fast 50 to 70, a JPEG 30 to 45, a PNG at its best compression 160 to 200; the page's round trip, `fonts.ready` and
  the layout's metrics 1 ms each). Taken straight after the frames drawn whole it took 1.4 to 3.5 s: llvmpipe draws in
  the GPU process behind the page's script, and the screenshot waits until the frames it was given are drawn. Read back
  a pixel there instead and the read waits as long. So the 278 to 333 s of "taking them" was llvmpipe drawing the
  still's frames, not the screenshot.
- **Where a frame drawn whole goes** (`tools/gpu_cost.js`, 800x500, high tier, night): the scene into its multisampled
  target 71%, the sun's shadow map 26% (its still casters' cache drawn again whenever the sun or the box has moved, which
  after thirty frames not drawn it always has), the occlusion, the bloom and the lens together 3%. Nothing past the
  scene is worth lightening.
- **Tried, not kept: the first frame's scene drawn into its depth alone.** The second frame needs of the first only its
  depth (for the occlusion's history), so the first frame's scene was drawn with its colour masked, which lets llvmpipe
  compile its shaders without their shading. The same stills, but no faster: llvmpipe's frame here is its vertices (some
  eight million triangles a frame with the shadow pass), not its pixels.
- **Kept: a still is of one frame drawn whole.** What the first of two frames left the second, in targets of their
  own, is the occlusion's history (nine tenths of the second's occlusion, where it lands) and the street mirror's
  picture (mirror.js draws it every other frame). The shadows' cache and the rain's cover map are drawn in whichever
  frame finds them stale. So in the one frame the occlusion is worked out twice from the frame's depth, as the first
  frame would (its noise, the history as it was) and then as the second (its noise, the history the first left, where
  the camera has not moved), and the mirror is asked for as after a frame without it. This costs two half-size passes,
  a few ms.
- **Kept: the page's frames are held as that frame is drawn**, not when the harness next asks: while the harness heard
  of the frame and asked for the hold, the page began another frame drawn whole, so a still had cost three frames drawn
  (384 frames drawn for 136 stills), and the screenshot waited for the third.

Only the harness does this: `window.__draw` is set by `tools/story_play.js` alone, and the page a player opens is not
touched. `ONE=0` takes stills as before.

**The same stills.** No two plays' stills are the same pixels (the crowd stands where a frame's step on the wall clock
put it, and the lens's grain and the lights' easing run on the wall clock too), so the stills were compared from one held
state (`ONETEST=still`: the world held, the lens's grain on one time, the occlusion's noise at the same step and its
history forgotten, stills of two frames and of one, `tools/still_diff.py`). At frame 2's talk, two stills of two frames
differ from each other by 1.0 to 1.9 levels on average and 8 at most; a still of one frame from a still of two by 1.1 to
2.7 on average, 9 to 14 at most, spread over the frame in the grain's and the occlusion's noise, with no shape moved or
lost. A contact sheet of the play's beats before and after shows the same light, grade, occlusion, wet street mirror and
interface. Where a beat reads a card on the wall clock it can fall otherwise: at frame 2's print the print is now still
in the hand, as the step meant it to be, where the slower stills had let it go.

**Before and after, the whole play** (`DRAW=30 node tools/story_play.js out 800x500` under `xvfb-run -a`; after: the same,
in `tools/check.sh`):

| | before | after |
|---|---|---|
| played in | 1115 s | 817 s |
| stills | 136: 169 s drawing their frames whole, 333 s taking them | 137: 30 s, 225 s |
| frames drawn whole for the stills | 384 | 184 |
| a still in all | 3.7 s | 1.9 s |

The rest is the frames not drawn (472 s, the game's clock at 0.83 of the wall's) and the frames drawn between the stills
(53 s), as after issue 70. The 600 s #70 set is not reached: under it would take fewer stills, a lighter tier for them, or
fewer frames' worth of the story's own clock.

Not cut: `mark`'s 1.2 s on the wall clock before a beat's still. The dialogue types on the game's clock (55 letters a
second) and the cards come and go on the wall's, so a still taken sooner shows less of its line or another card: it is
what the still shows, not a wait for nothing.

## The far trees as impostors

Past the mid distance (520 m; a wood's trees from 200 m) a tree was a trunk and an 80-triangle crown hull in its
species' one colour. Now each species' mid-distance model (its real leaf cards, in the season's colours) is drawn
once, at load, into an atlas from three heights (level, 40 and 80 degrees up; 256 px a view, 128 on a small
screen), and each far tree is one camera-facing quad (`web/trees.js`, `bakeFar`). The quad blends the two
nearest heights, is mirrored for every other tree and tinted per tree, and is lit by the sun as a round crown (a
spheroid normal, as the near trees' cards are). Where a yozakura is lit after dark it is uplit too. The alpha is
scaled by the mip level, so a crown keeps its density at a distance rather than thinning to twigs. The atlas is
drawn again only when the season's look changes. `?impostors=off` keeps the hulls.

Sydney's game on foot, high tier, 1440 x 900: **3.75 → 3.14 million triangles** a frame (−16%) and 456 → 450 draws.
The stills from the air at day, dusk and night, on a desktop and a phone, show the far trees with their leaves,
species colours and light, where the hulls were smooth green domes.

Adopted from: octahedral impostors (Ryan Brucks, for Fortnite) and
[agargaro/octahedral-impostor](https://github.com/agargaro/octahedral-impostor) (MIT) for the idea; no code was
taken. A tree is near enough to round that three heights and a mirror do here instead of an octahedral grid.

## What cannot be seen is not drawn (issue 358, B1)

From a street the street wall hides most of the city, and the city never changes. Frustum culling cannot
know that: it drops what is behind the camera, not what is behind a building.

**Measured first** (`tools/far_cost.js`, the street, high tier, 1440 x 900): Shibuya draws 7.74 million
triangles a frame. The crowd's instanced meshes are about 2.5 million of the view and 2.5 million again of the
shadow pass (about 1,500 triangles a walker, every mesh drawn at its full count with the walkers out of
reach scaled to nothing); the buildings' cells are 0.89 million of the view (0.76 million of them past
300 m) and 0.24 million of the shadow pass. Sydney draws 2.71 million, 0.13 million of them buildings. So
hiding buildings alone is worth a twentieth of Shibuya's frame; the crowd and the cars are the prize, and
they need the instance compaction of issue 352 before a hidden walker stops costing its vertices.

**Tried first, not adopted: a set per cell, computed offline** (the potentially visible set of Quake, Teller
and Sequin 1991; for cities, Wonka, Wimmer and Schmalstieg 2000, "Visibility preprocessing with occluder
fusion for urban walkthroughs"). For it to be conservative for a whole 64 m viewer cell, the occluders must be
shrunk by the spacing of the eye points sampled in the cell, and the cell's answer is the union over all of
them. On Shibuya that hid a walker in 13 to 17% of the ground cells within 270 m, where a single eye point hides
81%: Tokyo's buildings are 6 to 10 m wide, shrinking by 2 m leaves 12% of the frame as occluder against 33%,
and a 64 m cell sees round every corner in it. Without the shrinking (no longer conservative) it reached 42 to
58%. Smaller cells mean megabytes of sets per map, and an hour of baking for each.

**Adopted: the occluders baked offline, the sweep from where the camera is.** What is static and expensive to
get right is the occluder model, so that is what the pipeline distils:

- `pipeline/visibility.py` writes `web/data/<city>/vis.bin` (made by `python pipeline/pack.py` with the packs,
  checked by `--check`): the height of the buildings at 1 m, one byte a pixel. Only solids that stand on the
  ground, are not replaced by a landmark's model, are not canopies and have no road through them, up to their
  eaves; only pixels wholly inside them (the union, with walls that meet within 4 cm as one, shrunk by half a
  0.5 m pixel's diagonal, then each 1 m pixel the lowest of its four and the ring round them). Landmarks, trees,
  bridges, vehicles and people hide nothing. 60 to 660 kB a city, 1.1 MB for Shibuya, fetched by the Worker after
  play has begun; Queenstown has too few buildings (1.6% of its frame) to be worth one and gets a header.
- `web/visibility-sweep.js` (in `visibility-worker.js`): from the camera, 720 wedges march outward over a
  min-pyramid of that raster and the terrain, keeping the horizon. Behind an occluder of top *o* at distance
  *d*, nothing below *e + (o - e) r / d* can be seen at distance *r* (occluder shadows, Wonka and Schmalstieg
  1999). A wedge's occluder is the lowest along the whole chord across it, so it holds for every ray inside.
  The answer is a grid of 16 m cells: the height under which nothing in the cell can be seen. 13 to 19 ms in
  Node on this machine, off the main thread.
- `web/visibility.js` (`OEVis`): asks for a sweep when the camera nears the edge of the last one's margin. The
  occluders are shrunk by that margin first (1, 2, 4 or 8 m, by the camera's speed), which makes what is hidden
  from the sweep's point hidden from every point within the margin (occluder shrinking, from the same 2000
  paper), and the eye is taken a metre higher than the camera, since a higher eye sees everything a lower one
  does. An answer is used only while the camera is within its margin and no higher: outside it, with no
  answer yet, inside a building or a room, or faster than a sweep can follow, everything is drawn as before.
  So the worst case is the old frame. `OEVis.gate(mesh)` hides a static mesh (layer 0 off, so that a prop
  cell's child cells are still drawn) while every 16 m cell it touches is hidden to its height there;
  `OEVis.seen(x, y, top, reach)` is the same question for one moving thing, for the crowd and the cars.
- The sun's shadow needs every caster, seen or not (a tower behind the street wall still shades the street):
  `world.js` shows the gated meshes again round the shadow pass, outside the shadow cache. The view's list is
  made before the shadow pass in the same render call, so it keeps the gates. The water's and the wet street's
  mirrors take the gates as they are: in a 2.5D city what a mirror in the ground shows of a thing can be seen
  directly too.

No code was taken from the papers; the method is theirs, the 2.5D horizon form is the old viewshed sweep of
terrain analysis.

**Proof.** `tools/vis_unit.js` (in `tools/check.sh`): in every live city, exact rays from eyes anywhere within
a sweep's margin to random points up to 1.5 km away; of 2,600 to 6,600 rays a city that reach their point, none
is reported hidden. `tools/vis_check.js`: walks and drives each map's own footways and roads, and at each stop
draws the same held instant with the gates and without, four ways round, from the sweep's point and from the
edge of its margin; the two frames must match to the pixel (the page's clock is stopped for the pair, or the
water's waves differ between any two frames).

What the harness measured, 960 x 600, high tier, 15:30, a mean over about 96 frames a map from a walker's eye,
a camera behind one and a driver's (every pass of the frame: the view, the shadow map, the reflections):

| Map | Stops | Frames compared | Frames that differ | Triangles a frame, all drawn → gated | Draws | Static meshes hidden |
|---|---|---|---|---|---|---|
| Shibuya | 25 | 100 | 0 | 7.58 → 7.25 M | 389 → 354 | 129 of 205 |
| Shinjuku | 24 | 96 | 0 | 4.07 → 3.89 M | 324 → 295 | 109 of 180 |
| Tokyo (Marunouchi) | 24 | 96 | 0 | 3.73 → 3.57 M | 400 → 375 | 90 of 178 |
| Kyoto | 24 | 95 | 0 | 3.82 → 3.42 M | 459 → 450 | 31 of 74 |
| Sydney | 23 | 92 | 0 | 3.84 → 3.79 M | 497 → 479 | 67 of 148 |
| Higashiyama | 25 | 98 | 0 | 3.47 → 3.44 M | 270 → 266 | 14 of 42 |
| Philosopher's Path | 25 | 100 | 0 | 3.21 → 3.18 M | 366 → 361 | 16 of 47 |
| Fushimi Inari | 25 | 100 | 0 | 3.62 → 3.61 M | 295 → 290 | 18 of 42 |
| Queenstown | no raster: nothing gated | | | | | |

Shibuya again at 21:30 (15 stops, 60 frames, none differ: 7.43 → 7.06 M, 355 → 317 draws) and on the low tier
at 390 x 844 (15 stops, 60 frames, none differ: 3.66 → 3.55 M, 27 of 72 static meshes hidden). Kamakura came
onto main while this ran: its raster is baked and passes the exact-ray check; the harness has not walked it.

So the static meshes alone give 1 to 10% of the triangles and up to 35 draws: the street wall hides half to two
thirds of them, but they were a small part of the frame. A stop where the camera stood inside a building's
footprint (a footway mapped through a block: five of 195) got no answer and drew everything, as it should; the
first run of the harness found exactly that case as missing towers in Sydney, which is why the camera is now
tested against the solids themselves.

**The crowd and the cars** (after issue 352 put the walkers drawn at the front of their meshes). They are chosen in
the game's step, before the camera moves for the frame, so they ask `OEVis.seenNext(x, y, top, height)`: the
answer counts only while the camera has a tenth of a second's travel of its margin left, and the thing's height
gives how far its shadow reaches under the sun now (`OEVis.cot`, set by the game). The step also moves the crowd,
so two frames of it cannot be compared to the pixel; `tools/vis_check.js` instead casts rays from the camera to
the feet, waist, head and shoulders of every walker within 450 m that the question leaves out, against the walls
and the ground as drawn, and each must be stopped. Stops among the crowd near each map's start, and the others:

| Map | Walkers within 450 m | Left out as hidden | Of those, in plain sight |
|---|---|---|---|
| Shibuya | 4,001 | 2,639 | 0 |
| Shinjuku | 3,705 | 2,652 | 0 |
| Tokyo | 2,998 | 1,829 | 0 |
| Kyoto | 1,269 | 997 | 0 |
| Kamakura | 985 | 420 | 0 |
| Sydney | 770 | 599 | 0 |

(The static meshes again compared to the pixel at every stop: none differ, Kamakura included.)

**What it does not do yet.** The trees are re-sorted every 12 m the camera moves, further than an answer holds,
so they are not gated; the far ones are two triangles each already. The landmarks are one mesh a material
across the map and cannot be hidden in parts. Not checked: a real GPU, Safari or iOS (the Worker needs `DecompressionStream`: Safari 16.4), a phone's memory
with the 18 MB raster of the largest map and its shrunk copy (the low tier keeps one copy, the others two).

## The rest of issue 358's Layer B and C, as measured

**B2, the sky the ground sees** (`pipeline/skyvis.py`, `web/data/<city>/skyvis.webp`; on by default since the look stream (issue 353)
agreed to it at 0.6, a pure scalar; `?skyvis=off` leaves it out). For each point of the ground, the horizon in 16 directions out to 300 m
over the 2 m surface model, and from it the share of a uniform sky's light on a level surface there (the mean of
cos² of the horizon's elevation: horizon-based ambient occlusion, Bavoil, Sainz and Dimitrov 2008, on a height
field as Timonen and Westerholm 2010; the method only). One channel, 4 m a pixel, lossy WebP at quality 80
(234 kB for Shibuya, 3 in 255 off on average; lossless was six times that, and a second height and the ground's
level in the other channels three times, for things only a tree's crown would read). `world.js` `skyLit` reads
it in the materials that take the street lights (the ground and what is paved on it) and multiplies the indirect
diffuse light alone, within 500 m of the camera: further off the aerial photograph carries its own shade. Shibuya's
ground sees 54% of the sky on average, a canyon like Center Gai a third. It is the soft shade that screen-space
AO gave only within a few metres of each pixel and computed again every frame; with it the AO pass can shrink to
contact shadows (issue 352's to decide). The walls already carried a per-vertex openness (`buildings.js`).

**B4, the sun's shadow past the shadow map** (`visibility-sweep.js` `sunShadow`, `world.js` `farSun`; a prototype,
`?farsun=on`, or `?farsun=all` to see the field everywhere). The shadow map covers 180 to 340 m round the
player; past it nothing was shaded by the sun, and a tower outside the box threw no shadow into it. Instead of
horizon angles stored per texel for every azimuth of the sun's track (megabytes a map), a Worker sweeps the
game's own 2 m surface model once along the sun's direction: a cell's shadow height is the higher of the top and
the shadow height one step towards the sun, less the sun's climb over the step. 1 to 1.6 s for Shibuya on this
machine under a software renderer's load, off the main thread, again when the sun has turned 0.4 degrees; the
result is an RG16F texture at 4 m (4.4 MB), the height under which the sun is hidden, as a roof sees it and as
the ground and walls do. The lit materials of the ground and the buildings multiply the sun's light by it
outside the shadow map's box. At 13:00 on 10 November it shades 54% of Shibuya's open ground. **Judged, and left
off (issue 375):** a film driving down Shibuya's streets at 16:00, and stills down Dogenzaka and from 260 m over the
roofs at 12:30 and 15:30 (`tools/views/shibuya-farsun-375.json`), with it on and off: no artefact, and almost no
difference either. The mean of each frame moved by under 0.1 of 255 and no pixel by more than 15; even
`?farsun=all` (the field everywhere, the shadow map's own box included) darkened the view from the air by 0.8 of
255. Past the box the haze and the aerial photographs' own shade carry the far city, so the Worker's sweep (a second
or more of a core each time the sun turns 0.4 degrees) and the 4.4 MB field buy nothing a player sees. It stays a
flag; it earns its place only if the shadow box shrinks (issue 375, item 2), when the ground between the smaller
box and the haze would need it.

**B3, a far shell of the buildings: measured, not built.** The buildings' cells are 0.89 of Shibuya's 7.7 million
triangles from the street and 0.5 once B1 hides what the street wall covers; Sydney's are 0.13 of 2.7. A shell
of flat-roofed blocks merged by height within 500 m cells comes to 584,000 triangles for Shibuya against the
1.96 million drawn now (37,576 polygons from 49,950 solids: Tokyo's houses stand apart and differ in height,
so merging buys little) and 122,000 against 455,000 for Sydney. Drawn in place of the cells past 500 m it would save about 0.3 million
triangles a frame on Shibuya, 4%, for a megabyte more to download or a second build at load, and a second
facade to keep equal at day, dusk and night (the far windows are lit by the facade's shader). The walls'
splits at 8, 24, 48 m (for the openness) are another 0.1 million. Worth doing after the crowd (2.5 million in
the view and as many in the shadow pass) no longer dwarfs it.

**C1, a cached far layer: not built, for the same reason.** With the crowd within 450 m and the near field
drawn every frame, a cube map of what lies past 250 m, one face a frame, would replace about 0.5 million
triangles a frame on Shibuya (7%) and the shading of the far pixels, against a seam between two layers under
4x MSAA, the water, the night's additive lights and everything that moves out there at a sixth of the frame
rate. The frame is fill-bound on the measured device (issue 358's telemetry), which the pixel budget of issue
352 addresses directly.
## The frame budget (issue 352)

A frame costs the pixels shaded times the work on each, the draws and triangles submitted, and the main
thread's time. `tools/frame_cost.js` prints all of them (the pixels shaded: every full-screen pass's
viewport, and each target the scene's geometry is drawn into once per MSAA sample; the main thread: the time
inside the frame's `requestAnimationFrame` callbacks), and `tools/frame_sweep.sh` runs it on foot, with the
clock held, for every live city on each tier. Software-renderer frame times are not in the tables: they only
compare one build with another.

### One full-resolution pass after the scene

After the scene was drawn, four passes each drew the whole frame again into a full-size RGBA16F target: the
contact shadows' mix, the highlights' roll-off, the bloom's blend and the lens. Each did a few arithmetic
operations a pixel; what they cost was the 8 bytes a pixel written and read back four times, which is what a
phone's tile-based GPU and any integrated GPU's memory bandwidth pay for.

Now (`web/game/atmosphere.js`, `web/lens.js`, `web/game/ao.js`) nothing after the scene runs at the frame's
full size but the last pass, the lens, which writes the canvas. As it reads the scene's own target it applies
the contact shadows (upsampled by depth from their half-size texture), rolls the highlights off and adds the
bloom's half-size composite, then grades as before. The bloom's bright pass, at half size, reads the scene
directly and rolls the highlights off for itself (four taps, each rolled off, so a one-pixel glint blooms as
it did). The game no longer builds an `EffectComposer`; the stack keeps a composer's shape (`passes`,
`addPass`, `render`) for the films' director and the checks. A camera effect (photo mode's depth of field,
an opening shot's motion blur, an overture's painted look) or a film's own lens brings a full-size pass or two
back for as long as it is on, through two targets that are only made then (20 MB at 1440 x 900 that play no
longer holds).

With it:

- The low tier's bloom ran in full although `TIERS.low.bloom` says none. It now runs from a quarter of the
  frame (four levels in place of five from a half), and only from dusk to dawn: by day nothing reaches its
  threshold but the sun's glints. Night stills on the low tier match main's.
- The canvas was created multisampled on the medium and high tiers, though with the post stack the only thing
  drawn to it is the lens's triangle. It is now single-sampled there (the scene's own target keeps the tier's
  MSAA): at 1440 x 900 that is a 4x colour and depth buffer the browser no longer allocates and resolves.
- The contact shadows' passes draw one triangle over the frame, as the others do, rather than two (no
  diagonal seam shaded twice).

Sydney's game on foot, high tier, 1440 x 900, 15:30 (`FOOT=1 FREEZE=1 tools/frame_cost.js sydney`):

| | main | after |
|---|---|---|
| full-size passes after the scene | 4 | 1 |
| full-screen passes in all (45 of them the ocean's 128 px transform) | 69 | 66 |
| bytes the full-screen passes write a frame | 70.1 MB | 40.4 MB |
| pixels shaded (passes, and geometry targets per sample) | 31.3 M | 27.4 M |
| draws, triangles | 420, 3.33 M | 416, 3.31 M |

Stills of the same views before and after (a street by day, at dusk and at night on each tier, and the city
from the air by day and at night) differ only in what moves between two runs: the clouds, the trees in the
wind, the waves and the traffic. Not measurable here: what the bandwidth saved is worth in milliseconds on a
phone's GPU or an integrated one.

### Resolution that goes both ways

`shed()` stepped down every four seconds below 24 frames a second (the rain's extras, the weather, the wet
street's mirror, then pixels to 85% and 70%) and never came back; the contact shadows had a budget of their
own beside it. Both are replaced by one governor (`web/quality.js` `OEQuality.governor`, ticked by
`game.js`):

- It holds a smoothed frame time against a target: the display's own interval, or the frame-rate cap's (the
  menu's Frame rate: 30, 60 or the display's; 60 by default, so a 120 or 144 Hz display draws every second
  frame of the game, not twice the frames for the same picture).
- `governor.scale` is the scene's resolution against the canvas's, in steps of a twentieth between the tier's
  ceiling and 0.6. The post stack draws the scene, the occlusion and the bloom at that scale; the canvas and
  the interface stay at the display's resolution, and the lens upscales with a contrast-adaptive sharpening
  (the limiter of AMD's FidelityFX RCAS, MIT, written here: four more taps, only while the scale is under 1).
- `governor.extras` (1, 0.5, 0) is how much of what a frame can do without is drawn: at 0.5 no far rain or
  splashes, no wet-street mirror, the lighter contact shadows and two MSAA samples in place of four; at 0 no
  weather's drops, no contact shadows and no MSAA (the sharpened upscale and the lens's grain hide the edges
  there more cheaply than four samples a pixel).
- The display's interval is taken only from gaps between animation frames shorter than a 60 Hz display's (a
  90, 120 or 144 Hz display); otherwise it is a 60 Hz display's. The first version took the shortest gap seen,
  and on a device that cannot keep up that gap is the frame's own time: it aimed at the slowness itself and
  stopped stepping down after one step (found with `tools/governor_probe.js` once the software renderer's
  frames had become fast enough to fall under the 100 ms it accepted).
- Down: resolution to 0.8, then the extras, then resolution to 0.6. Up: vertical sync hides headroom, so after
  four calm seconds it tries a step up; a try that does not fit is taken back and the next waits twice as long
  (to a minute). Extras return at full resolution after a longer calm (the weather keeps what it shed until
  the next visit, as before). A display that cannot be met even at the floor is given half its rate as the
  target, where frames are even, and resolution comes back against that.
- The tier's pixels have a ceiling. The high tier was `min(dpr, 2)` of the display with 4x MSAA: 8.3 million
  pixels on a 4K display, 14.7 million on a 5K one at 2x. The canvas is now held to a 4K display's pixels and
  the scene inside it to 2560 x 1440's (the governor's ceiling), so a 4K display draws the scene at two
  thirds of its size and the lens brings it up.

- It runs on the title's orbit as well as in play (the telemetry's slowest frames were Shibuya's title screen,
  where nothing held them), reports each step to the telemetry (scale, what was shed, MSAA, the cap) and keeps
  the scale the device held on each map (`localStorage` `bh-gov-<city>`), so the next visit starts there
  and climbs again if it can.

`tools/governor_probe.js` feeds it frames on a clock of its own (fast: it stays; 40 ms: 1.00 to 0.80, extras
to 0, 0.60, then half rate and back up; fast again: 1.00 with every extra) and takes stills at 1.0, 0.8 and
0.6; `tools/game_check.js` checks the order and the way back in every city. Not checkable here: how it
feels on a real display, where the frame time is a GPU's and not a simulation's.

### A choice that settles, and the state a device plays in (issue 485)

**What the device said.** The owner's Apple M3 (Chrome, tier high, device pixel ratio 2, a 1001 x 894 window) held
59 frames a second in Shibuya by moving: its `quality` events show the scale stepping 0.6, 0.65, 0.7, 0.75 five
seconds apart, falling back to 0.6 in three steps a second apart, and starting again half a minute later, all
session. The governor's only memory was of a try that failed within four seconds; that device's tries held four
seconds and failed in the ninth, as the player walked on, so nothing was learned and the next try came on time.

**From first principles.** A step of resolution is seen when it happens; five percent of headroom left unused is
not. So down stays prompt (a missed frame is seen) and up is rationed by what was learned:

- the step a try failed at is remembered (`top`), and a failure counts as the try's for as long as the wait that
  is running, not for four seconds. The way back up to the step under it is as quick as before (four seconds a
  step); the step itself is asked for again after half a minute, and that wait doubles each time a try fails
  again, to eight minutes, and starts over once the failures stop coming;
- a step the frames stop fitting at with no try behind it (the scene got heavier) is left alone for half a minute
  and no more (`bad`), so the way back is not climbed while the heavy scene lasts and is quick once it has passed;
- the extras have the same memory (a minute, doubling to sixteen): multisampling and the shadow map's size coming
  and going are seen more than any step of resolution. A try of the extras that fails is taken back as the
  extras, where before it cost resolution;
- a record from an earlier visit starts settled (`resume`): the step above what the device held waits its turn;
- half the display's rate, taken when the floor cannot be met, ends as soon as frames come at the full rate
  again (before, the resolution climbed to its ceiling under the half rate, and one heavy half minute left a
  device at thirty frames a second for the rest of the visit).

`tools/governor_unit.js` (in `tools/check.sh`'s static checks; no browser) plays modelled devices through vertical
sync for twenty-two minutes each. Changes of resolution in the twenty minutes after the first two:

| device | before | now |
|---|---|---|
| its limit between 0.65 and 0.70 | 36 | 6 |
| on the edge at 0.80 with half the extras | 36 | 6 |
| a scene that drifts by a tenth as the player walks (a try holds, then fails seconds later) | 41 | 13 |

A fast device with no record is still at its ceiling in twenty seconds, a scene 1.6 times heavier is given way to
within six, and the resolution and the full rate are back a minute after it has passed. Not checkable here: the
real device's own trace, which the `quality` events of its next sessions will show (a settled device sends two
or three in ten minutes, not thirty).

**The state no check drew.** Under a harness the governor stands still and the software renderer is given no
multisampling, so every check and still opened the map at its ceiling, single-sampled, in clear weather: a state
an ordinary desktop is never in. Three switches put a check where a device is:

- `?gov=0.8/0.5` opens the map as a device with that record does (the extras shed from the first frame);
- `?msaa=on` draws the scene with the tier's samples on a software renderer too;
- `?gltrace=1` traces the load (below).

`tools/game_check.js` now walks the ladder drawn: every step down and back (some twenty states), in clear weather,
in the rain and after dark, two frames each, the samples set to four, two and none with the extras, and the context
asked for its error after every call. `tools/gl_error_probe.js` (`tools/check.sh gl`: Shibuya before landing, every
live map on main) opens the map with the extras shed and multisampling on and does the same from the context's
first call. Both pass on all three live maps: 130,000 calls a load and 11,000 to 34,000 a frame, none refused.

**What was not found.** The M3 reported `WebGL error 0x502` (INVALID_OPERATION) after the first frame of both
loads it made once the game asked (`glCheck`), with the shadow map on the GPU and its pass on, at 0.8/0 and at
0.8/0.5. Mesa's llvmpipe raises none in the same states, with or without multisampling, rain, night, or a walk of
the ladder, so the call is one a software renderer accepts and Apple's driver does not, and the flag does not
name it. The owner's screenshots of the pale ground were all taken before the fix for the page opened after dark
(#483) was deployed, so whether this error is that picture is not known either. The device is asked instead:
after an error, the next three frames are traced (`glcare.js` `trace`: the error asked for after every call) and
the call, its arguments and the lines of the page that made it go to the telemetry; an error that the first frame
had and those three do not was raised once while the map loaded, and the next load of that map on that device
is traced from its first call (one slower load). The next visit from that device names the call.

**What the trace found here.** Run in the game check, the game's own watch reported `0x502` under llvmpipe after
all, and the trace named it: after a lost context comes back, a render target made before the loss still carries
the listener of the renderer's old state, and its next `dispose()` or `setSize()` deletes a framebuffer, a
renderbuffer and a texture of the dead context beside the live ones (`world.js` `setShadowSize` from the
governor's rung, the shadow cache's `resize`, the scene's target changing samples or size, the sky's light made
again in `restoreGPU`). Each is INVALID_OPERATION. Nothing is drawn wrong by it, but it raises the one flag the
watch reads, on any device whose context was ever restored (a laptop woken from sleep, a GPU process restarted)
and whose governor then moves. `glcare.js` now leaves a delete of an object the context does not know unsent once
a context has been restored (`spareTheDead`), for the game and the viewer alike, and `tools/gl_restore_probe.js`
traces a loss, the restoration and the rungs after it: nothing refused. Whether the M3's two reports were this
(a context restored while the map loaded) or another call, its next visit says.

### Two samples where the display is dense (issue 375)

Four samples a pixel are for a scene drawn a pixel to the CSS pixel. On a dense display the high tier draws the
scene at up to two device pixels each way, so every CSS pixel already has up to four of them under it, each
multisampled. `quality.js` `samplesAt(w, h)` gives the view two samples where the scene has one and a half device
pixels or more to the CSS pixel each way (the canvas's pixel ratio times the scene's ceiling), and the tier's four
elsewhere: a 1x display, and a 4K or 5K display filled at 2x, where the scene's budget brings it back to about a
pixel each. The governor's rung follows the window (`game.js` `msaaFor`); the viewer takes the same count.

| view (high tier) | scene pixels | samples a frame, before | now |
|---|---|---|---|
| 1001 x 894 at 2x (the M3's window) | 3.58 M | 14.3 M | 7.2 M |
| 1440 x 900 at 2x | 3.69 M | 14.7 M | 7.4 M |
| 1920 x 1080 at 2x (scene at 1.33) | 3.69 M | 14.7 M | 14.7 M |
| 1440 x 900 at 1x | 1.30 M | 5.2 M | 5.2 M |

At eight bytes of colour and four of depth a sample, that is 86 MB less written and resolved a frame on the M3.
Stills of Shibuya at 2x with four samples and with two (`DPR=2 QUERY='?msaa=on' tools/game_shot.js`, day, dusk
and night), enlarged three times at the roof lines and the signs' edges: no difference to be seen. A phone and
the medium tier are not touched (no samples, and two). What a real GPU has to confirm: the milliseconds; the
count of samples is exact.

### What is left of issues 375 and 358, by what was measured

One frame on foot at the spawn, high tier, 1440 x 900 at 1x, 15:30 (`FOOT=1 FREEZE=1 tools/frame_cost.js`), after
the work above:

| map | draws | triangles | of them the sun's shadow pass | full-screen passes | written by them |
|---|---|---|---|---|---|
| Shibuya | 510 | 2.72 M | 0.78 M in 185 draws | 17 | 26.4 MB |
| Tokyo | 927 | 3.01 M | 0.63 M in 227 draws | 65 (45 the sea's FFT at 128 x 128) | 38.0 MB |
| Sydney | 461 | 1.81 M | 0.38 M in 139 draws | 65 (45 the sea's FFT) | 38.0 MB |

The one device that reports GPU time is bound by its pixels, so the items were ordered by the pixels and samples
they take off, which is the count that carries from a software renderer to a GPU:

- **Done: two samples on a dense display** (above): half the scene's samples there.
- **Done: a governor that settles** (above): no pixels saved, but the resolution the device can hold is held.
- **Cut: `BatchedMesh` with per-instance culling.** It was for the static props in the shadow pass. Since the
  still casters' cache, those are drawn into the shadow map only when the light or the box moves; the 0.4 to 0.8
  million triangles the pass draws every frame are the crowd, the cars and the trees, which move and are instanced
  and culled by their own systems (the crowd and cars by the visibility sweep). In the view the props are
  already left out by cell. Nothing is left for it to cull that a frame pays for.
- **Cut: shadow cascades.** The pass is 8 to 14% of a frame and a cascade adds passes to it; the far sun's field
  showed that nothing past the box is missed (under 0.1 of 255); the ladder halves the map on a device that is
  short. It would buy sharper near shadows, which is the look's question, not the budget's.
- **Cut: temporal anti-aliasing in place of MSAA (358 C2), and the contact shadows shrunk to a near field.** The
  cost it was to remove is now removed where it was paid: four samples became two on dense displays, and the
  governor takes them to none at the floor, where the sharpened upscale carries the edges. On medium and low it
  would add a full-size resolve and a history target to the tiers that are shortest of fill and memory. The
  contact shadows are six taps at half size on a rung of their own: 4% of a frame with the bloom and the lens.
- **Cut: reprojection to the display's rate (358 C3), the cached far layer (C1) and the far shell (B3).** The far
  layer and the shell were measured at 4 to 7% of Shibuya's triangles for a second facade path and a seam. The
  reprojection answers a device held at thirty frames a second; the governor now holds the display's rate by
  resolution and returns to it as soon as it fits, and what a warped frame does at a disocclusion can only be
  judged on a real display.
- **Cut: a purpose-built city material.** The measurement behind it (the ground and the walls a fifth of their
  time when unlit) is a software rasteriser's, where a texture lookup costs many times a GPU's. The part with no
  effect on the picture was taken (dark spot lights passed over: 8% of the scene pass). The rest (the
  environment's diffuse lookup, 10% of the scene pass in software) changes the light on every surface of every
  map, which is the look's to decide with a GPU's timer beside it: the `gpu_ms` of the M3's sessions after this
  lands say whether shading still bounds it once the samples are halved.

### Scene renders nobody sees

- **The sea, inland.** The ocean's wave transform (45 passes into 128 px targets), its wake field and, on a
  GPU that affords it, a second draw of the city for its reflection ran every frame in every city, Fushimi
  Inari's hillside included. An occlusion query had been tried for this (below) and reported water where
  there was none. The world now asks the terrain, with no GPU at all (`world.js` `seaInView`): the sea shows
  where the ground is at its level, so a map with no such ground never draws or updates it, and elsewhere the
  ground is sampled under a grid of rays through the frame and along the frame's sector out to 13 km.
  Buildings in the way are not counted, so it errs towards drawing; with none in sight the waves, wakes and
  reflection rest, and the sheet keeps the waves it had for the frame that brings it back.
- **The wake field** was drawn by handing the whole world to the renderer with a camera that sees one layer:
  every object of the scene graph visited for a handful of wake meshes. It is now drawn from the list of wake
  meshes (`water.js` `wakeScene`), and not at all when none is shown.
- **The reflection** is redrawn every frame only while the camera moves; while it stands still, every third.
- **The wet street's mirror** already drew every other frame at a third of the size; it now rests when the
  frame is all sky.

### Instances that are not drawn

The crowd's instanced meshes were never culled, a hidden walker was a model scaled to nothing (its vertices
still run, in the view and in the shadow map), and every instance buffer was uploaded whole every frame. Now
(`people.js` `crowdRenderer`) each character's drawn walkers are the first `mesh.count` slots: a walker out
for the hour, near enough to be a skinned person, or out of the camera's sight by more than a shadow's
length (30 m) changes places with the last one drawn, colours and all, and only the drawn range of the
matrices and the gait is uploaded. The cars' models were already packed each frame; they take the same sight
test and upload only the slots taken (`actors.js`). Both also ask the precomputed visibility
(`visibility.js` `OEVis.seen`, issue 358) with the shadow's reach for the sun's height: a walker or a car
behind the buildings, whose shadow cannot reach anything seen, takes no slot. Shibuya's scramble on foot then
draws 2.91 million triangles in 315 draws (7.60 million in 415 on main at the start of this issue).

### The far crowd as the scanned cast (issue 475)

The far crowd's dolls gave way to a far copy of each cast member (`pipeline/crowd_cast.py`, docs/LOOK.md):
about 1,000 to 1,800 triangles a copy against the dolls' 1,350 to 2,250, one 128 x 192 picture each (half that
on a phone, about 33 kB of the GPU a character), and no per-walker colours to upload (the dolls' skin, hair,
clothes and pattern, 52 bytes a walker). A copy is one instanced draw in the view and in each shadow pass, as a
doll was, so the cast is held to twelve on the desktop tiers and eight on a phone (`game.js` `realCast`), below
the dolls' thirteen; a cast member with nobody drawn this frame is not drawn at all (`people.js` `end`).
Measured with `tools/frame_cost.js` on foot at the spawn at 12:30 (FREEZE=1; desktop 1440 x 900 high, phone
390 x 844 low), against `?farcast=off` (the dolls), and `tools/mem_check.js` (a phone's peak GPU memory):

| Map | Desktop draws | Desktop triangles | Phone draws | Phone triangles | Phone GPU peak (textures) |
|---|---|---|---|---|---|
| Shibuya | 513 -> 513 | 2.69 M -> 2.59 M | 354 -> 334 | 1.17 M -> 1.11 M | 242 -> 242 MB (164 -> 164) |
| Tokyo | 949 -> 929 | 3.11 M -> 3.05 M | 744 -> 730 | 2.40 M -> 2.36 M | 272 -> 271 MB (171 -> 172) |
| Sydney | 466 -> 462 | 1.88 M -> 1.86 M | 405 -> 405 | 1.61 M -> 1.60 M | 226-231 -> 227-231 MB (160 -> 160) |

(The phone's peak moves by up to 5 MB between two runs of the same page, in the buffers of the map streamed round
the player; its textures, where the copies' pictures are, did not move.) The download grows by the file, 650 kB
for the live maps' 24 cast members, fetched with the dolls before the game opens.

### The main thread

- No vector is made per walker per frame (`people.js`), and the shadow cache compares the still casters'
  state in two buffers it keeps instead of two arrays of some twenty numbers a caster made and dropped every
  frame (`world.js`).
- The frame's HUD nodes are looked up once and their text is written only when it changes (a text node
  replaced with the same words is still a style and layout pass); the minimap repaints 30 times a second at
  most (`game.js`, `hud.js`).

### Lights that are dark

Every light in the scene is in every lit shader whatever its intensity. `tools/light_cost.js` takes them out and
measures (Shibuya's scramble at 13:00, high tier, software renderer, median frame): the two spotlights (the
car's headlamp, the helicopter's searchlight) and the night's fill, dark by day, cost nothing that can be
measured. The screens' eight area lights and the light card did: 3,557 ms with them, 3,058 ms without, a seventh
of the frame, for a light held to 6% of its night's strength by day. Rather than a second set of programs for
the day (compiled ahead, twice the shaders), the area lights' loop passes over a light whose colour is zero
(`lens.js` `loopAreaLights`: a test of a uniform), and the screens' light fades to nothing in full daylight
(`neon.js`). The same view then takes 3,053 ms with every dark light in the scene, and taking them out gains
nothing more. Day, dusk and night stills of the scramble match.

### Every live city, before and after

On foot at the start, 15:30, clock held, 1440 x 900 (`tools/frame_sweep.sh`), main (0dd48803) → after
(90aa3ea0; Kamakura is new since). The sea's cities (Sydney, Tokyo, Queenstown, Kamakura) keep the ocean's 45
small passes while water is in the frame; the others have none. The low tier's frame by day in a city with no
sea is the scene and one pass.

| city | tier | full-screen passes | draws | triangles (M) | pixels shaded (M) | passes write (MB) |
|---|---|---|---|---|---|---|
| fushimi-inari | high | 69 → 18 | 260 → 194 | 2.06 → 0.74 | 31.06 → 26.39 | 70 → 29 |
| fushimi-inari | medium | 67 → 16 | 284 → 196 | 2.06 → 0.75 | 15.24 → 10.57 | 65 → 24 |
| fushimi-inari | low | 63 → 1 | 243 → 198 | 1.90 → 0.56 | 11.44 → 6.69 | 47 → 5 |
| higashiyama | high | 69 → 18 | 323 → 235 | 2.85 → 1.33 | 31.06 → 26.39 | 70 → 29 |
| higashiyama | medium | 67 → 16 | 316 → 228 | 2.83 → 1.31 | 15.24 → 10.57 | 65 → 24 |
| higashiyama | low | 63 → 1 | 310 → 210 | 2.75 → 1.20 | 11.44 → 6.69 | 47 → 5 |
| kamakura | high | new: 66 | new: 196 | new: 0.69 | new: 27.18 | new: 40 |
| kamakura | medium | new: 64 | new: 216 | new: 0.69 | new: 11.35 | new: 36 |
| kamakura | low | new: 49 | new: 194 | new: 0.55 | new: 7.48 | new: 16 |
| kyoto | high | 69 → 18 | 373 → 279 | 2.91 → 1.78 | 31.06 → 26.39 | 70 → 29 |
| kyoto | medium | 67 → 16 | 333 → 277 | 2.83 → 1.77 | 15.24 → 10.57 | 65 → 24 |
| kyoto | low | 63 → 1 | 322 → 293 | 2.63 → 1.66 | 11.44 → 6.69 | 47 → 5 |
| queenstown | high | 69 → 66 | 610 → 555 | 3.82 → 2.77 | 31.33 → 27.44 | 70 → 40 |
| queenstown | medium | 67 → 64 | 608 → 549 | 3.78 → 2.73 | 15.50 → 11.61 | 65 → 36 |
| queenstown | low | 63 → 49 | 632 → 525 | 2.50 → 1.40 | 11.70 → 7.74 | 47 → 16 |
| shibuya | high | 69 → 18 | 415 → 360 | 7.60 → 3.50 | 31.06 → 26.39 | 70 → 29 |
| shibuya | medium | 67 → 16 | 417 → 372 | 7.61 → 3.53 | 15.24 → 10.57 | 65 → 24 |
| shibuya | low | 63 → 1 | 373 → 304 | 4.23 → 2.47 | 11.44 → 6.69 | 47 → 5 |
| shinjuku | high | 69 → 18 | 370 → 301 | 3.99 → 2.43 | 31.06 → 26.39 | 70 → 29 |
| shinjuku | medium | 67 → 16 | 356 → 310 | 3.96 → 2.46 | 15.24 → 10.57 | 65 → 24 |
| shinjuku | low | 63 → 1 | 317 → 253 | 3.69 → 2.17 | 11.44 → 6.69 | 47 → 5 |
| sydney | high | 69 → 66 | 419 → 416 | 3.19 → 2.17 | 31.33 → 27.44 | 70 → 40 |
| sydney | medium | 67 → 64 | 417 → 414 | 3.19 → 2.16 | 15.50 → 11.61 | 65 → 36 |
| sydney | low | 63 → 49 | 436 → 386 | 3.13 → 2.02 | 11.70 → 7.74 | 47 → 16 |
| tetsugaku | high | 69 → 18 | 452 → 386 | 2.91 → 1.97 | 31.06 → 26.39 | 70 → 29 |
| tetsugaku | medium | 67 → 16 | 450 → 384 | 2.90 → 1.96 | 15.24 → 10.57 | 65 → 24 |
| tetsugaku | low | 63 → 1 | 503 → 374 | 2.59 → 1.66 | 11.44 → 6.69 | 47 → 5 |
| tokyo | high | 69 → 66 | 595 → 596 | 4.35 → 2.68 | 31.33 → 27.44 | 70 → 40 |
| tokyo | medium | 67 → 64 | 593 → 586 | 4.35 → 2.66 | 15.50 → 11.61 | 65 → 36 |
| tokyo | low | 63 → 49 | 542 → 554 | 3.98 → 2.35 | 11.70 → 7.74 | 47 → 16 |

The main thread's time in the frame's callbacks was 10 to 105 ms before and 12 to 105 ms after on the software
renderer, with a run-to-run spread as large as any difference (the rasteriser's threads share the cores): it
says nothing either way here. What changed on the main thread is in "The main thread" above; a browser's
profiler on a real device is where to measure it.

Stills of the same views before and after differ only in what moves between two runs: Sydney's quay at day,
dusk and night on each tier and on a phone, the city from the air, Shibuya's scramble by day, at dusk, at
night and in the rain (the same people in the same places).

## The frame budget, second round (issue 375)

**The contact shadows reuse the frames before** (`web/game/ao.js`). The occlusion is still taken at half size from
the scene's depth, but with 6 samples on high and 4 on medium (16 and 8 before), its spiral and radii turned on each
frame (interleaved gradient noise moved by the frame, Jimenez 2014); a resolve pass then reprojects the last frame's
result with the last frame's view and projection (`uReproj`: this frame's view space to the last frame's clip space,
composed on the CPU so the shader never handles kilometre coordinates), keeps it where the distance it stored is the
distance this point had then, clamps it to this frame's 3 x 3 neighbours' mean plus or minus their spread (variance
clipping, Salvi 2016) and blends it in at 0.8 (0.48 within 6 m of the camera, rising to 0.8 by 25 m, where the
player and the walkers beside them move and a lagging contact shadow shows most). One depth-aware blur follows, not
two. A cut (a jump of 30 m or a turn of more than 45 degrees in a frame, a resize, a frame without it) starts the
history again. Per half-size pixel: 6 occlusion taps and 11 in the resolve in place of 16 occlusion taps; four
half-size passes in place of five (Shibuya on foot: 17 full-screen passes writing 26.4 MB a frame, 18 and 28.8 MB
before). `?aotaa=off` draws each frame from scratch as before.

Judged in motion with `tools/ao_film.js` (on foot with the camera swinging round, and driving your car, 30 frames a
second of game time, each saved): side by side with `?aotaa=off` and with `?ao=show` (the occlusion alone). The mean
change between consecutive frames of the occlusion alone was 2.64 of 255 with the history and 2.68 without, its 99th
percentile 12.7 and 13.7: no more shimmer, and none on the railings and kerbs. The first version (range clamp, 0.9)
left the player's own contact shadow faint and a short trail behind it; the variance clip and the lower weight near
the camera took both out. No ghost behind the car. Not judged on a real GPU's frame rate, where the history's
weight would be tuned again.

**The sea's reflection leaves out the walkers, the traffic and the street furniture** (`water.js`: objects flagged
`userData.noRefl` where they are added: the crowd and its umbrellas, the cars, benches and lamp posts, the landmarks'
street furniture). On Sydney's quay it took the reflection's second draw from 127 draws to 119; its 1.24 million
triangles are the buildings and the trees, which the water should show.

**The crowd's umbrellas are packed** (`people.js`) as the crowd is: those held this frame are the first `count`
slots, with their holder's colour, and only those slots are uploaded. Before, every walker had a slot, scaled to
nothing when not held, and the whole buffer went to the GPU every frame of rain.

**The model viewer and the title have one full-size pass after the scene** (`lens.js` `stack`, used by `city.js`
and `earth.js`): the scene into its target, the bloom's chain at half size with `bright()` as its first pass, and the
lens, which adds the bloom's sum as it reads the scene. The bloom's full-size blend and the second full-size target
are gone; `world.js` `leanComposer` and `lens.js` `tameBloom` with them. Sydney's viewer by day, at dusk and at night
and the title's Earth match main's within 1.4 and 2.4 of 255 on average (the clouds and the title's text fading in).

**One ladder, started low** (`quality.js` `rung`, `startLow`; `game.js`). Every system that sheds registers a rung:
its value with every extra, at half of them and with none. The weather (light, then off), the wet street's mirror,
the contact shadows (full, lite, off) and MSAA (the tier's, two, none) as before; now also the sun's shadow map (the
tier's, half, 1024 on a side: `world.js` `setShadowSize`, the map and the still casters' cache made again at the next
shadow pass), the sea's reflection (every frame while the camera moves, every second, none: `water.js` `reflEvery`)
and the crowd (whole, whole, three in four). A device with no record of its own starts at 0.8 of the scene's
resolution with half the extras, and tries a step up every second and a half until one does not fit; a fast device
is at its ceiling in about thirteen seconds (`governor.simulate`). The record kept per map is now the scale and the
extras (`bh-gov-<city>`: `0.85/0.5`), and a device that has one starts there. Under automation the governor stands
still, as before, so checks and stills start at the ceiling. `tools/game_check.js` sees the shadow map, the
reflection and the crowd move with the extras and come back.

**Not done** (left in issue 375): shadow cascades (item 2: with the far sun's field showing so little past the box,
the case for a far cascade is weaker than it looked; the 4096 map's cached depth blitted every frame is still not
measured, and the ladder now halves the map on a device that is short), and `BatchedMesh` with per-instance culling of
the props in the shadow box (item 3). Temporal anti-aliasing from the same history in place of MSAA on medium and low
(the second half of item 1) waits for jittered projection, which the history above does not yet need.

## The frame budget, third round: where the GPU's time goes

The tables above count work (passes, draws, triangles, pixels); they do not say which of it is slow.
`tools/gpu_cost.js` times it: every draw call, clear and blit of one frame is fenced (one pixel of the target drawn
into is blitted to a 1 x 1 target of its kind and read back, since `gl.finish()` returns at once in Chromium) and
the times are summed by target and by what drew (the object's name, else its material's, its instance count, and
whether it is a tree). Software-renderer times, so shares, not milliseconds; `EVAL` takes a part out to see what it
costs, `DUMP` writes a draw's compiled shaders.

The one telemetry device with GPU timers (an Apple M3, high tier, Sydney and Shibuya) is GPU-bound at 30 frames a
second, 37 to 70 ms of GPU a frame at 0.8 of its 3.6 million canvas pixels: the frame's cost is in its pixels.

Shibuya on foot, high tier, 1440 x 900, 15:30 (fenced total 1.75 s):

| part | share |
|---|---|
| the scene's target (4x MSAA): the ground's tiles | 28% |
| the scene's target: the buildings' cells | 22% |
| the scene's target: everything else (props, people, sky, far land) | 38% |
| the sun's shadow map (moving casters over the cached still ones, and the blit) | 8% |
| contact shadows, bloom, lens | 4% |

Drawn with an unlit material, the ground and the buildings took a fifth of the time: their cost is their
shaders, not their triangles. Taken out one at a time (the scene pass's time against the same frame's):

| taken out | scene pass |
|---|---|
| the two spot lights (dark by day) | -8% |
| the environment's light (`envMap`): its diffuse lookup alone | -15%; -10% |
| the shadow map's five taps | under the run-to-run spread |
| the area lights (already passed over when dark) | none |

**Dark spot lights are passed over** (`lens.js` `skipDarkSpots`). The car's headlamp and the helicopter's
searchlight stay in every lit shader so that switching them on compiles nothing, and each was a full light
and BRDF evaluation per fragment at zero intensity. Their unrolled blocks now test the light's colour first, as
the area lights' loop does. A lit beam draws exactly as before (night stills with the beam on match).

In Sydney the shadow pass is 14% of the frame, and most of what it draws every frame is trees (their crowns sway in
the depth pass too, so they are not among the cached still casters). The sea's planar reflection, where it is drawn
(high tier on a hardware GPU), is about 5% at the quay.

## The frame budget, fourth round: a desktop that crawled (November 2026)

The owner played on an M3 MacBook and found it "still very laggy". The telemetry of that hour (PostHog, `time` and
`quality` events) said why, in three parts:

- **Two browsers drawing at once.** The title was left open in Chrome for over an hour (4,070 s on the title screen)
  while the walk was played in Safari. Chrome's title drew at its full rate behind Safari's window the whole time: its
  GPU's frame went from 20 ms to 100 ms as Safari started, and the walk in Safari ran at ten frames a second with
  everything shed (scale 0.65, no extras). A page nobody is looking at now gives the GPU back (`game.js` `awayHold`):
  its window behind another (`document.hasFocus()` false, the tab still showing, so the browser still calls it) draws
  ten frames a second, and the title left untouched for a minute thirty, as a PC game's background frame limit does.
  The governor is not ticked on a held frame. Never under a harness, whose page has no focus.
- **A dense display drawn at 1.2 pixels to the CSS pixel at the floor.** Its canvases were 3.9 and 4.6 million pixels
  (1099 x 894 and 1241 x 931 at a device pixel ratio of 2). The GPU's frame grew with the pixels (the title: 17 to 20
  ms at 2.4 million, 30 to 35 ms at 3.9 million), and in the story the governor sat at its floor, 0.6, drawing the
  scene at 1.2 device pixels to the CSS pixel at 30 to 35 frames a second. On a display of 1.75 pixels to the CSS pixel
  or more (not a phone) the floor is now 0.45 and the middle step 0.7 (`game.js` `DENSE`): the scene may come down to
  a little under one pixel to the CSS pixel, half the pixels of the old floor, sharpened up by the lens, before the
  extras go.
- **What a street-level frame costs, part by part.** `tools/perf_walk.js` runs `game/perf.js` (`?perf`) on the walk
  from a harness. On the software renderer (shares, not milliseconds), the walk at night, high tier, 960 x 720: the post
  stack 45% of the frame, of which the scene's 4x multisampling 20%; the materials' shading 41% (every material flat);
  the scene at scale 0.6 a third less; the aerial ground's 25 tiles 29%; the far land 17%. The far land was drawn first
  of everything (`renderOrder` -1) and the ground's tiles in the order their materials were made, so on a GPU without
  hidden-surface removal every pixel of them behind the hero level's paving and the buildings was shaded and then
  painted over. Both are now drawn after the city's other opaque surfaces (`world.js` the ground's tiles 1,
  `farland.js` 2), where their depth rejects what is covered before it is shaded. Opaque and depth-tested, the frame
  looks the same. An Apple GPU removes hidden opaque surfaces itself, so on the owner's Mac this saves little; on the
  other desktops it saves most of those shares.

### `?perf` made trustworthy (issue 67)

The table above came from a `perf.js` that measured the wrong frame. It started as soon as the title element was
hidden, but the title is hidden while the page is still loading too (`preTitle`), so it began during the loading
plate. On the software renderer it then measured a camera still at the map's origin (105 draws, 428k triangles), and
its long blocks of finished frames starved the loading of everything else. About a minute in, the walk set out, the
camera came down to the street (580 draws, 2.3M triangles, about seven times the GPU work), and the visibility sweep
made its first answer. Every row from then on, and *the frame as it is, again*, measured the real street against a
first row that had measured nothing. Hiding the instanced meshes had nothing to do with it: with the rows in another
order, the jump came at *without far-land* instead. Nothing was left invalidated: the shadow cache, the visibility
sweep and the buffers were all as they should be. So the shares in the last bullet above were measured from the
origin, not the street, and are measured again below.

What `perf.js` does now:

- **It waits for the street.** `game.js` hands it `ready()`: the loader gone and the title down, the walk or the story
  set out, no crane, cut, level wait, menu or photograph going on. Then the camera has to stand within 0.6 m for eight
  seconds before anything is measured. The table says what it is waiting for, and asks you to stand still.
- **Drift is not counted as a part's cost.** The frame as it is gets measured again every four rows, and each row is
  set against the value interpolated between the two measures either side of it. The last row compares the end with
  the start and lists every measure, so drift shows up there.
- **The governor is held while it measures** (`gov.auto` off), then given back and reset, so the long measuring
  frames are never taken for the scene's cost. Everything a row changes is put back, whether or not the row succeeds.
- **Precise on a fast GPU.** Each sample is the mean of enough finished frames to take at least 30 ms, because
  Safari's clock counts whole milliseconds and an M3's frame is about ten of them.
- **Rows that separate an Apple GPU's costs:** the ambient occlusion and the bloom by name (the lens writes the canvas,
  so the post-stack row covers it); MSAA; the shadow map *not redrawn* (drawing it) apart from *without shadows*
  (drawing and sampling it); the area lights; the hero level's 24 materials without their maps (what its texture
  reads cost); and the scene's parts by what they are: the ground's tiles and fine tiles, the crowd, the people near,
  the trees, the far land, the hero level, the buildings and their roof kit. Named parts are measured whatever their
  size.
- **The page stays playable after.** The table has Copy and Close buttons, and says whether it was sent with the
  telemetry (a `perf` event, with the GPU's name, the draws, the triangles and every row).

`tools/perf_walk.js 960x720 night clear` (software renderer, high tier, the walk at night, 580 draws, 2.3M triangles,
a frame of about 1.7 s): over three runs, *the frame as it is, again* came out +2.7%, -10.6% and -5.1% of the first.
The measures in between stayed within 1580 to 1935 ms, which is this renderer's own noise; before the fix the end was
seven times the start. Shares of that street frame, as the three runs agree on them (software renderer, so only a
guide; anything under 5% is lost in the noise): the post stack 60%, nearly all of it the 4x MSAA (55%); with every
material flat the frame is 82% cheaper; the scene at scale 0.6 37% cheaper; the people near 20%; the ground's fine
tiles 16 to 21%; the hero level 9 to 20%; the area lights 12%; the buildings 7 to 13%; the crowd 6 to 10%; the
hero level's maps 6 to 10%; the shadows 5 to 10% (drawing the map costs almost nothing, because the cache keeps it).
The far land, the trees, the roof kit, the ambient occlusion and the bloom were each within the noise.

Not measured: a real GPU's table, which is the next round's first step. Open the page with `?perf` on the owner's Mac
(Chrome and Safari), set out on the walk, and stand still for a minute; the table appears on the page and goes to the
telemetry. Not checked here: Safari, WebGPU, a real Apple GPU.

## Next, by what it saves for what it risks

Measured on Sydney's game, high tier, 1440 x 900, from the street, after the work above: 4.42 million triangles,
849 draws, 78 full-screen passes.

1. **Per-instance culling for the static instanced props** (rooftop plant, gable bodies, landmark street
   furniture, benches, lamp posts). three.js r186's `BatchedMesh` culls each instance against the camera, the
   shadow camera included (`perObjectFrustumCulled`), and sorts them; an `InstancedMesh` is all or nothing.
   Most of the 1.5 million shadow-pass triangles are these. No visual change.
2. **A cached shadow map for what does not move.** Done (above), as a copy of the cached depth under each frame's
   moving casters rather than two maps, so the lit shaders are unchanged.
3. **Impostors for the far trees.** Done (below).
4. **The ocean's FFT** draws 45 full-screen passes a frame into 128 x 128 RGBA32F targets (256 x 256 on a large
   screen with a hardware GPU). Its outputs are already half float, and the butterflies stay 32-bit where the GPU
   can render to it, because seven butterfly stages in half float would put noise in the waves. At 128 x 128 the
   passes cost little, so this stays as it is.

   *Tried, not adopted (and since done another way, from the terrain: "Scene renders nobody sees" above):*
   skipping the waves and the water's reflection while no water is on screen, found with an
   occlusion query round the water's draw. In Shibuya's streets, with no water in the picture (checked by painting
   the water red), the query still reported samples drawn every frame, so it would rarely switch off. The one large
   saving would have been the reflection's second render, and only the high tier on a large screen has that: an old
   device already goes without it.
5. **Shader precision on the low tier.** Mobile GPUs run `mediump` at twice the rate of `highp`. The world-space
   maths (positions kilometres from the origin, the reversed depth) must stay `highp`; colour and lighting need
   not. Go shader by shader, with stills.
6. **4x MSAA on a high-DPI screen.** At two device pixels a CSS pixel the edges are already sampled twice in
   each direction, so 2x MSAA there would likely look the same for half the samples. That is a visual change,
   however small, so it needs stills side by side first.

## Far geometry: what games do, and what this game draws

One frame of Sydney's game from the street draws **5.3 million triangles** on the high tier and **4.6
million on the low tier on a phone** (about 2 million of them the shadow map's). Of the view pass,
**60% lies past 300 m and a third past 800 m**: mostly thousands of instanced far trees (an 80-triangle
crown hull each, 7,352 of them), street props and the building chunks. That is the part an old device
pays for and a player cannot tell apart from a picture.

How games handle the distance:

- **Impostors.** A far object becomes a quad showing a picture of it baked from many directions
  (octahedral impostors, Ryan Brucks for Fortnite; SpeedTree's billboard LOD). The three.js library
  [agargaro/octahedral-impostor](https://github.com/agargaro/octahedral-impostor) draws a forest of
  200,000 trees with a meshoptimizer LOD from 15 to 100 m and impostors beyond; the
  [cinevva write-up (2026)](https://app.cinevva.com/blog/2026-05-04-open-world-browser-part-19-imposters) found
  hemi-octahedral grids stop the flicker at the poles. Licence to be checked before any code is taken.
- **Hierarchical LOD.** Unreal's World Partition merges a far cell's meshes into one proxy with baked
  textures; GTA V chains LOD and "SLOD" models, with night lights as sprites at range.
- **Backdrops.** Games with a bounded playable area paint or bake what lies beyond it into cards or a
  sky dome (the city skyline in Persona 5's Tokyo, the far ranges in Genshin Impact's regions). This
  game already does it for the land past the model's frame (`farland.js`: terrain and land cover from
  open data, lit and hazed with the scene). Inside the frame the helicopter reaches everywhere, so a
  backdrop there has to be distance-based, which is an impostor or an HLOD.
- **Not this:** a mobile team's write-up ([Game Developer](https://gamedeveloper.com/production/fake-it-til-you-make-it-faking-extended-draw-distance-in-mobile-games))
  found HLOD unsuitable for their case and faked distance with fog and shaders; the haze here already
  does that past the frame.

Next, in order of value: impostors for the far trees (the largest share, and the case the technique was
built for), screen-size culling for small instanced props once they are under a pixel, and limiting the
shadow pass to casters whose shadow lands inside the shadow camera's sharp range. Each must pass the
same before-and-after stills.

## The tap on Play (the entry)

The owner played the episode on an iPhone (iOS 27, November 2026): the tap on the title's Play took 4.4 s to answer
(the telemetry's `inp`), and the opening that follows had six hitches, the worst 0.9 s. `tools/entry_cost.js` loads
the story as a phone, waits on the title, taps Play and reports the time to the frame after the tap, the opening's
long frames, the shader programs linked (named by their material, or by their defines), the objects drawn with a
program the tap made, the programs first used in it, and a CPU profile of each. On llvmpipe it found the tap 4.5 s
(3.2 s of it waiting for programs to link) and four kinds of thing made after the loader's warm-up and compiled in
the frame that first drew them:

- **the hero level** (hero.js), fetched only as the opening's camera flew within reach of it: 25 programs mid-flight,
  a hitch of most of a second for each few. It is now loaded round the player as well as the camera while the title
  is up and while the opening plays, so it is fetched, compiled and its vertex buffers sent behind the title (the
  buffers were 0.7 s of the tap: `sendBuffers` in game.js lays them in slices with world.js `uploadBuffers`, the
  meshes on a layer of their own until they are in). It is shown, as before, only once it is ready;
- **the opening's own things** (overture.js: the guide, its drift, the glows, the painted sky), built in the tap:
  now built hidden and compiled behind the title (`prewarm`), and drawn by the tap;
- **the stopped air** (stopfx.js: the leaves, the pigeons, the motes), made at the story's first beat: one of each is
  now kept hidden in the world and compiled behind the title (`warm`), so the later ones find their programs made;
- **the trains** (trains.js: the E235's cars, per material), made when the first train of a stock came: every stock's
  cars are now made as the cars' models arrive and warmed then.

And a program's first use reads its log back, a wait on the GPU: world.js `firstUse` now reads every program a
material has, not only the current one (a see-through two-sided material is drawn back face then front, two
programs; the back's was read in the tap).

| llvmpipe, 390×844, low tier, Play 25 s after the title | before | after |
|---|---|---|
| tap to the frame after it | 4.5 s (1.3 s in another run) | 0.3 s (one frame of the software renderer) |
| programs linked in the tap / in the opening's first 12 s | 8 / 25 | 0 / 0 |

Tapped 7 s after the title, as the owner did, the hero level is still compiling when the opening starts: its slices
go on under the opening, it is not drawn until they are done, and the city's own model stands there meanwhile. What
is left in the opening on llvmpipe is the software renderer's own frame time and the 3-second WebGL error check
(game.js `glCheck`), whose wait for the GPU is the length of a frame on a real one. Not measured: a real iPhone, whose
shader compiles (ANGLE to Metal) took 22 of the owner's 33 s of load.

### The loader's compile (issue 27)

The owner's iPhone (iOS 27 Safari, low tier) loaded the story in 33.3 s, 22 s of it between "built" and the first frame:
the loader's warm-up, about 150 ms a program for the programs it waits for. `tools/entry_cost.js` now also prints the
load's stages (the telemetry's marks), the loader's own frames from "built" to the first frame, every program linked
before the first frame against when it was first drawn with (on the title, in the opening's first `SHOT` seconds, later,
never), the materials and objects behind each one it need not have made, and the programs a draw linked (a hitch in its
frame: no warm-up made them). What it counted on main, and what was done:

- **A third were never drawn.** Of 126 programs (136 on the desktop tier), 69 were drawn on the title, 6 in the
  opening's first seconds and 50 not in the watch at all:
  - **the shadow pass's variant with no lights** (world.js `compileDepth`), ten programs. The shadow pass keys its
    depth programs with the lights the scene's render state last set up, and the loader's own compile sets up the
    scene's lights before the first frame, so the variant with none was never drawn with. Dropped.
  - **things hidden when the loader compiles**: the rain's streaks and splashes, the stopped air's spares, a car's
    and the helicopter's parts, the petals, the light show. The loader now compiles what is `shown()` (world.js: it and
    every parent visible), and what is hidden behind the title (game.js `warmRest`, a slice a frame, held through the
    opening's shots as the rain's mirror is). A hidden thing the opening shows says so with `userData.warmFirst` and
    is in the first set: the city's light show (lights.js), which the story's evening reaches five seconds into the
    opening, otherwise compiled in its draw there.
  - **post passes that are off** (the opening's depth of field and motion blur, the anime look), and the screen's
    variant of passes that never draw to the screen (bloom's blurs and its composite, nine programs: `warmPasses`
    compiled the last three passes for the screen whether they were on or not). The first set is the passes that are
    on, and the screen's variant of the last of them only; the rest come first in `warmRest`, before the tap needs them.
- **Programs that were one shader.** The weather's patch (weather.js `wrap`) keyed a paving's or a pond's program by
  the material's name, though its text is written by the patch's options alone: the Scramble's plaza, setts, inlay
  and asphalt were four programs for one shader. Keyed by the options now.
- **`KHR_parallel_shader_compile`.** llvmpipe's Chromium exposes it; world.js `compile` already polls it (three.js's
  `isReady`) so that slices overlap the loader. Safari has listed it since iOS 14.5, but a WebKit bug
  ([251514](https://bugs.webkit.org/show_bug.cgi?id=251514)) reports its compiles still block, which the owner's 22 s
  agrees with. The telemetry now says which devices expose it (`pcompile` on every event, quality.js `probe`); the
  count of programs is what helps either way.
- **The loader's animation** is CSS transforms and opacity (plate.js), run by the compositor, so the main thread's
  slices do not stop it; what made it stutter is the GPU process busy compiling, which fewer programs shortens.

| llvmpipe, Play 7 s after the title (`tools/entry_cost.js`) | main | after |
|---|---|---|
| 390×844, low tier: programs linked before the first frame | 126 | 89 |
| built to the first frame | 8.2 s, 9.4 s | 6.6 s, 6.8 s, 7.5 s |
| programs made before the tap, all told | 168 | 152 |
| 1440×900, high tier: programs linked before the first frame | 136 | 97 to 99 |
| built to the first frame | 38.2 s, 48.7 s | 30.7 s, 31.3 s, 33.1 s |
| programs a draw linked, title to 10 s into the opening | the same three people's programs on the title, and the instanced program below | the same |

At about 150 ms a program, 37 fewer programs is about 5.5 s off the iPhone's 22 s; the iPhone's own number waits for the
owner's device (the telemetry's `load` event: `build_ms` to `frame_ms`, and `pcompile`). Left as they were, on main as
here: three people's programs (their characters arrive after the loader's compile and before `lib.warm` is set) are
linked in the title's first frame, and on the desktop tier one instanced standard program is linked by a draw in the
title and waited on in the tap (2 to 15 s on llvmpipe; issue 31, below).

### What a draw still linked (issue 31)

`tools/entry_cost.js` lists the programs a draw linked after the first frame (no warm-up made them: a hitch in their
frame, and a wait on the GPU the first time three.js reads one back); with `DUMP=1` it now prints each one's three.js
key beside the keys of the warmed programs of the same name, which is how each cause below was told from the others.
On main, 1440×900 high tier: three, at the title and in the opening; 390×844 low tier: three, at the title. Each was a
program the warm-ups did make, but in another variant, or made too late:

- **The cast that came before a warm-up.** The crowd's near cast (and the story's people) are asked for while the
  page loads. One that came after the loader's compile and before the title set `lib.warm` was shown unwarmed, and the
  title's first frames linked its programs (`f018_body`, `f013_opacity` on a phone; `f017_body` on a desktop). The game
  now gives its warm-up (`lib.setWarm`) the moment the loader's compile is done, and an NPC's character that comes
  before then waits for it and is shown once warmed (people.js `ready`; the far crowd's copy stands in until then).
  A main character, which the load itself waits for, does not wait.
- **The crowd's change of clothes.** A walker of the crowd drawn in other clothes (people.js `rig.dress`) wears its own
  copy of the body's material, a program of its own (`dress6`) that no warm-up made. It is now compiled once a library
  with the first cast member to come (`warmDress`), and the copy takes the weather's patch as it is made
  (`lib.dressNew`), as the warmed one had: drawn first without it, it was still another program.
- **The trees' defines.** The trees' patch (trees.js `shader`) added its atlas's defines to the material's own
  `defines` object in `onBeforeCompile`, so the next time three.js keyed the material it was another program with the
  same text: every crown linked twice, the second time by a draw in the opening. It now patches a copy (as world.js's
  floor map already did). And the near trees, which come behind the title (`loadNear`), take the weather's patch before
  their first draw, as the umbrellas and the dressed walkers do.
- **The umbrellas** were made at the first rain, and the story's evening rains at its title. They are made with the
  crowd's renderer and compiled once the game gives its warm-up; nobody puts one up before.

| `tools/entry_cost.js`, llvmpipe | main | after |
|---|---|---|
| 1440×900, high tier: programs a draw linked after the first frame | 3 (the trees twice, a dressed walker) | 0 |
| 390×844, low tier: programs a draw linked after the first frame | 3 (two cast members' programs) | 0 |

The desktop tier's tap, which waited 2 to 15 s on main on the instanced program a draw had linked (the trees' second variant), took 5.7 s in the last run
here, none of it on a program (llvmpipe's taps vary by seconds from run to run). The warm-ups that a draw made before
are now made at the loader's tail and behind the title, so the low tier links
about seven more programs before its first frame (100 against 93): on an iPhone, at about 150 ms a program, a second
more under the loader in place of the same second in the title's first frames. Not checked: a real GPU, Safari or iOS.

### The loader's compile, second round (issue 27)

The owner's iPhone still spent 22 of its 33 s between "built" and the first frame. `tools/entry_cost.js` now prints the
page's own `warm:` lines (when each part of the loader's wait was done, counted from "built", and how long the first frame
waited for the GPU to draw it), and with `DUMP=1` the calls that linked each program (its `why`): which warm-up, or which
draw. Measured with Mesa's shader cache off (`MESA_SHADER_CACHE_DISABLE=true`), as a first visit is: with it on, a second
run here took half the time and hid what a first visit pays. What it found, and what was done:

- **A program linked in the first frame.** The inland water's reflections of the street lights (inland.js `glints`) are
  hidden until the lights come on, which the story's evening does in its first frame, so the loader's first set left them
  out. Flagged `warmFirst` they were compiled, and still linked again in the first frame: the map builds them again when it
  stands its lanterns (world.js `buildGlints`), and the new material was a new program. One material now serves every
  build. On llvmpipe that draw was 11.7 of the first frame's 12.5 s.
- **Programs made for nothing**, before the first frame:
  - the sea's waves (water.js `FFT`, four programs) on a map with no sea: compiled only where the sea can be seen;
  - the far trees' atlas (trees.js `bakeFar`, three): baked in the world's set-up, before the weather's patch was on the
    trees' materials, so its compile made the variant without it and the atlas's draw made the right ones. Baked now when
    the game first asks for it (world.js `ready`), after the weather;
  - the ground and the far land without the light from the sky (two): compiled before the game's first `setSun` set the
    scene's environment. The world now sets a first one once the sky's program is ready;
  - PMREM's blur (one), which `fromScene` uses only with a sigma, never given here;
  - the post passes' materials the frame does not draw (five): the bloom's fifth blur on the low tier, its merge, the
    plain lens, and the lens's merged material into a target. A pass may say what its frame draws (`firstDraws`), and the
    first set compiles that alone.
- **Programs that were one shader.** The bloom's blurs were a program a level (three.js writes each level's kernel into
  its shader: four on the low tier, five on the others); one now, each level reading its own taps up to its own count. A
  cherry's bark bands were a define, two programs for the trees' solid parts and two more for the atlas; a uniform now.
  A landmark under a canopy wrote its share of the sky into its shader as numbers; uniforms now.
- **Work queued ahead of the first frame** that it does not draw: the crowd's palette and umbrellas (eight programs,
  given with the game's warm-up as the loader finished) and the trains' cars (four, as their models arrived). On a GPU that
  compiles one program at a time each was in the queue before the first frame's draws. Both start once the first frame is
  drawn (game.js `firstFramed`); an NPC still waits to be shown until its programs are made (issue 31).
- **The loader's compile, one at a time to the end.** The city's warm-up started behind the set-up with one program in
  flight and a slice a frame, so that the set-up's own synchronous calls did not wait on a queue (issue 327), and kept that
  pace after the set-up was done, with nothing else left to wait for. It now runs between the set-up's tasks rather than a
  slice a frame, and takes up to six programs at once from "built".
- **The periodic WebGL error check** (game.js `glCheck`, every 3 s) waits for the GPU, and behind the title for every
  program queued: it is skipped while a sliced compile is under way (world.js `compiling()`) and asked once they are done.
  The first frame's own check stays: it is what makes "frame" the time the GPU drew it.

| `tools/entry_cost.js`, llvmpipe, Mesa's cache off | main | after |
|---|---|---|
| 390×844, low tier: programs linked before the first frame | 99 (68 drawn on the title, 26 not in the watch) | 69 (63 drawn on the title, 4 not in the watch) |
| built to the first frame | 28.0 s, 27.9 s | 25.3 s, 23.2 s |
| tap to the frame after it | 0.5 s, 1.0 s | 7.6 s, 0.4 s (see below) |
| 1440×900, high tier: programs linked before the first frame | 110 (79 on the title, 24 not in the watch) | 79 (73 on the title, 4 not in the watch) |
| built to the first frame | 65.0 s | 52.3 s |
| tap to the frame after it | 9.3 s | 2.5 s |
| programs a draw linked, title to 8 s into the opening | 0 | 0 |

What is left on llvmpipe, by the `warm:` lines on the low tier: the programs are linked 10 to 12 s after "built", and the
first frame then waits about 12 s for the GPU to draw it. That second wait is Mesa compiling each program's machine code
at its first draw (with its cache on it is under a second), about 190 ms for each of the 63 programs the title draws; a
draw behind the loader of each object into the post stack's target, tried, did not make the variants the frame then
needed. An iPhone has the same two steps (ANGLE's Metal backend makes a pipeline for a program at its first draw), so the
count of programs the first view draws is what to cut next: twelve landmark programs (each pattern writes its own shader;
one pattern's numbers as uniforms would fold some), and the night's three kinds of light point. The opening's first
seconds still hold one long frame (4.5 to 6 s here, on main as after): its first draws of what the title did not show,
the same wait; it falls in the tap's frame or the one after it as the 3-second error check happens to fall, which is the
7.6 s above.

Not measured: an iPhone. At about 150 ms a program, 30 fewer before the first frame (the twelve moved behind it among
them) would be about 4.5 s of its 22 s, and five fewer drawn on the title somewhat more at their first draw; the
telemetry's `load` event (`build_ms` to `frame_ms`) on the owner's device is the number to read. Not checked either: a
real GPU, Safari, WebGPU.

### The first view's programs (issue 60)

After the second round the first frame still waited about 12 s on llvmpipe for the GPU to make machine code for each of
the 63 programs the title draws, the step an iPhone's ANGLE takes too (a Metal pipeline a program, at its first draw). So
the count of distinct programs the first view draws was cut, without changing what any of them draws. What
`tools/entry_cost.js DUMP=1` showed, and what was done:

- **Landmark materials that differed only in having a picture, or a pattern that does nothing.** A landmark's plain
  stone, bronze and steel, its painted bands and its images wrote the shader the granite beside them writes, less the
  granite's few lines, or the same shader without a map: four programs for two shaders, on the Hachiko square and the
  Scramble alone. A material with no pattern now takes the granite's with no speckle (`uSpeck` 0) and no joints, which
  multiplies its colour by exactly one, and one with no picture a white texel for its map (world.js `WHITE`), which
  does the same; byText then keys them all to one program, the paving's to another. The inland water's railing takes
  the white texel and byText too, and shares the Scramble fence's railing program.
- **The night's points of light** (night.js): the street lamps, the traffic's moving lights and the aircraft warning
  lights shared their fragment shader and had three vertex shaders. One shader now, each kind its own branch as its own
  shader was (`uKind`).
- **The signals' lenses and arrows** (junctions.js): the same unlit instanced program, one drawn from both sides and
  one from the front. A lens is drawn from both sides now (its back faces into its housing).

Left as they are: the leaf's cut-out (alpha test, which costs every fragment of the shared program if added to it),
the glass's two passes (front and back), and programs of different shaders (the screens, the lit signs, a curtain wall, the
ashlar wall). Four depth programs are still linked and not drawn in the watch.

| `tools/entry_cost.js`, llvmpipe, Mesa's cache off | main | after |
|---|---|---|
| 390×844, low tier: programs linked before the first frame | 69 (63 drawn on the title) | 63 (57 drawn on the title) |
| built to the first frame | 29.9 s (13.9 s of it waiting for the GPU) | 27.4 s, 30.7 s (12.4 s, 13.8 s) |
| 1440×900, high tier: programs linked before the first frame | 79 (73 drawn on the title) | 73 (67 drawn on the title) |
| built to the first frame | 68.7 s (20.8 s of it waiting for the GPU) | 67.9 s (18.4 s) |
| programs a draw linked, title to 8 s into the opening | 0 | 0 |

Six fewer programs at about 190 ms each on llvmpipe is a little over a second of the GPU's wait, inside what the
software renderer varies by from run to run (the times above); the counts do not vary. On an iPhone, at about 150 ms a
pipeline, it is about a second of the first frame; the telemetry's `load` event (`build_ms` to `frame_ms`) on the
owner's device is the number to read. Stills of the Hachiko square, the Q-Front side and the Scramble from the air, at
dusk and at night, on a desktop and a phone, were taken on main and here and compared. Not checked: a real GPU, Safari, iOS.

## The build stage (issue 327)

The telemetry's desktop loads spent about 10 s between "decoded" and "built". `tools/start_profile.js LOAD=1
PROFILE=1` now prints the load's stages, the build's time by the loader's step and a profile of the build as a
whole; `tools/stage_sweep.sh` gives one line a city; `tools/reef_load.js` does the same for a reef or alpine
site. What the build spent its time on (Kyoto, llvmpipe), and what was done:

- **A GPU read back, 5.1 s.** The haze at the model's edge was read from twelve pixels of the sky drawn on the
  GPU (`readPixels`), which waited for every shader and upload queued before it; an asynchronous read only moved
  the wait to `getBufferSubData`. world.js now evaluates the sky's shader (three.js r186's Sky with this app's
  changes, clouds included) for those pixels on the CPU (`hazeOf`). `tools/haze_check.js` holds it to the GPU's
  read: 80 of 80 suns, clear and cloudy, within 0.03 of a 2% tolerance. A clock set from the menu no longer
  stalls a frame either.
- **The inland water's levels, 1.2 s.** `inland.js` looked its ring points up through a Map keyed by strings,
  a million times in `raise()`: a dense grid now.
- **The city's shaders, after everything else.** They now compile from the moment every light is in place
  (the car's headlamp and the helicopter's searchlight are put in the world at the start for that), behind
  the surface model, the footways, the people and the traffic, one program in flight at a time (a synchronous
  GL call there waits for one at most). Where the GPU compiles in parallel the two overlap.
- Still on the CPU: the buildings (4 s in Kyoto, already in slices between frames), the surface model and the
  walking network (nav.js, 2 to 3 s), the footways (1.5 s). The next step would be a Worker for the buildings'
  geometry (follow-up issue).

Every live city, llvmpipe, 960×600, high tier, the median of two runs (`tools/stage_sweep.sh`), main → after:

| city | playable (s) | build, decoded → built (s) |
|---|---|---|
| fushimi-inari | 9.4 → 8.5 | 3.3 → 2.7 |
| higashiyama | 11.8 → 10.1 | 5.6 → 3.2 |
| kyoto | 27.9 → 23.8 | 18.1 → 9.9 |
| queenstown | 17.1 → 15.4 | 7.6 → 5.7 |
| shibuya | 21.5 → 19.4 | 12.1 → 9.2 |
| shinjuku | 18.9 → 16.3 | 9.7 → 6.8 |
| sydney | 17.2 → 15.9 | 7.3 → 6.5 |
| tetsugaku | 10.8 → 9.4 | 5.0 → 3.3 |
| tokyo | 20.3 → 20.0 | 12.3 → 8.9 |

The reef and alpine sites build in 1.7 to 4.3 s; their wait was after "built", in three.js's WebGL backend
compiling (`_completeCompile`, 11.6 s of Lake Tekapo's load), much of it in the first frame after
`compileAsync`, and in Tekapo's detail photograph (`terrain.prepare`). On a device with WebGPU, as the
telemetry's desktop has, the backend is another one; a follow-up issue holds it.

## The build in a Worker (issue 344)

After issue 327 the build's main-thread time in a large city was mostly the buildings' geometry (4 to 7 s on
llvmpipe), the walking model's 2 m surface model and the landmarks laid on its grid (1 to 1.5 s in Kyoto and Sydney:
twenty million points sampled on their triangles), and the footways. The worker that decodes the packs
(`pack-worker.js`) now keeps its copy of `buildings.bin` and, in the game, of `landmarks.bin`, and builds from them
once the ground is final (after the inland water levels it, before the aerial imagery is draped), so the work
overlaps the page's own:

- **The walls, roofs, decks, posts and awnings** (`buildings-geo.js`, split from `buildings.js` with no three.js in
  it; the triangulation is three.js's own Earcut, imported into the worker), sent back as packed vertex arrays
  handed over. The page only makes the BufferGeometry, the facade material and the rooftop plant.
- **The game's 2 m surface model** with the building on top of each cell (`Sun.buildDSM`), on the walking ground.
- **The landmarks on the walking grid** (`game/navcells.js`, split from `nav.js`): their height intervals, tops
  and paving, as typed arrays the page turns back into `nav.js`'s Maps.

Without a Worker, or if it fails, the page builds each itself as before. `tools/build_hash.js` fingerprints the
built walls: byte-identical to main in the viewer and the game, and with `Worker` taken away; the surface model and
the landmark cells were compared cell by cell (Kyoto, Sydney, Queenstown, Fushimi Inari).

Every live city, llvmpipe, 960x600, high tier, one run each (`tools/stage_sweep.sh`; on this machine the time to
playable swings by several seconds between runs, mostly one texture upload after the build), main -> after:

| city | build, decoded -> built (s) | playable (s) |
|---|---|---|
| fushimi-inari | 3.9 -> 3.6 | 11.6 -> 13.3 (12.2, 12.7 again; main 11.6, 12.4) |
| higashiyama | 4.7 -> 4.6 | 13.4 -> 15.8 |
| kamakura | 4.4 -> 3.9 | 11.7 -> 13.2 |
| kyoto | 14.8 -> 13.0 | 35.4 -> 46.0 |
| queenstown | 8.5 -> 7.3 | 50.8 -> 22.5 |
| shibuya | 14.6 -> 12.4 | 28.7 -> 28.9 |
| shinjuku | 10.2 -> 9.9 | 49.3 -> 58.1 |
| sydney | 13.0 -> 11.3 | 38.8 -> 39.1 |
| tetsugaku | 5.2 -> 4.6 | 13.1 -> 14.3 (12.7, 13.2 again; main 13.2, 37.1) |
| tokyo | 15.7 -> 13.3 | 34.5 -> 36.4 |

The build stage is shorter everywhere, by 1.5 to 2.4 s in the large cities; the time to playable here is
dominated by the GPU's share after it, which a software renderer makes noisy. Still on the main thread: the footways
(`OERoute.walkable` and `cutAtWalls`, 2 s in Kyoto) and the collision world (1.2 s), both built from the live walking
model's queries; a follow-up issue holds them.

## The reef and alpine sites' compile (issue 343)

After issue 327 a reef or alpine site built in 2 to 4 s and then spent most of its load compiling: Lake Tekapo linked 247
WebGL programs, 117 of them in the first frames (one frame of 32 s on llvmpipe, the lake's mirror compiling on the spot),
and waited up to 19 s more for the aerial detail photograph. `tools/reef_load.js` now counts the programs linked in each
loader step. What was done, for every site:

- **The detail photograph does not hold the loader.** It is asked for as soon as the camera is placed, decoded off the
  page's thread (an ImageBitmap), at most 4096 px a side below the high tier, and fades in when it comes; stills, films
  and tools under automation still wait for it (`?detail=later` loads as a visitor). Its placeholder is in the
  photograph's colour space, so the land's programs are not made again when it comes.
- **The precompile compiles what the frames draw.** A frame's work bar the drawing runs first (the player's view, the
  land's chunks, the plants' patches, the water's tiles); then, at once and side by side, the scene into the post
  chain's own target (a program is made for its target: the canvas's was compiled again by the first frame), the lake's
  mirror as its reflector draws it (half-float, layer 0, from below the water), and the land's hidden detail patches.
- **One program where there was one per mesh.** three.js r186 puts an InstancedMesh's matrices (and a skeleton's
  bones) in a uniform array when they fit a uniform block, with the array's name and length written into the shader:
  every instanced mesh linked its own program. The reef page sets the backend's uniform-block limit to 0 for these
  (`?ubo=1`: as before), so they come as instanced attributes and a bone texture, the same code for every mesh.
- **Uniforms, not constants:** each lake's id and level (22 programs at Tekapo), and the land strips' offsets.

Stills from the same views (desktop and phone; day, dusk and night; Tekapo, Pukaki, Milford, Whitsundays) are identical
to main's pixel for pixel. Every site, llvmpipe, 1440x900, high tier, `tools/reef_load.js`, the second of two runs
(the first of each pair warms the cache), main -> after:

| site | programs (in the first frames) | ready (s) |
|---|---|---|
| whitsundays | 68 (32) -> 57 (14) | 12.7 -> 12.2 |
| hardy-reef | 59 (46) -> 56 (15) | 8.5 -> 9.6 |
| green-island | 64 (29) -> 55 (13) | 12.9 -> 11.2 |
| heron-island | 48 (35) -> 46 (13) | 7.1 -> 7.6 |
| lady-elliot-island | 45 (27) -> 42 (11) | 7.3 -> 7.4 |
| lake-pukaki | 85 (48) -> 50 (16) | 24.4 -> 15.7 |
| lake-tekapo | 247 (117) -> 49 (10) | 28.3 -> 15.8 |
| milford-sound | 67 (36) -> 53 (17) | 13.9 -> 10.7 |

On the reefs the total is within the runs' noise, but the programs the first frames compile on the spot (a frozen
frame) are a third of what they were; on the alpine sites the load is shorter by 3 to 12 s. What the first frames still
compile: the bloom chain's small passes, and what is hidden at the precompile (a character shown on the first frame).
On WebGPU (the telemetry's desktops) pipelines compile asynchronously and the per-mesh variants cost the same way; not
measurable here (#320).

## The alpine sites' frame (Milford Sound)

The owner found Milford Sound slow on a desktop with WebGPU. Where a frame went (`tools/reef_parts.js`, llvmpipe, the
view from 500 m over the head of the fiord, without the mirror and the post chain): the land's shader, two thirds of
it. What was done, for every alpine site (Tekapo, Pukaki and Milford share `alpine/terrain.js`):

- **Branches on what a fragment shows.** The land's shader computed every layer for every fragment and chose with
  `select` and `mix`: the close-up grain (five noises, wanted within 60 m), the chipseal and its lines (beyond the
  roads), the bump of the relief (sixteen hash reads and eight texture reads, wanted within 900 m), a fiord's rock
  (eight noises) on the bush and its bush on the rock. Each is now inside an `If` on its weight or its distance. The
  branches follow the picture in big coherent regions, so a GPU's threads agree and the skipped work is not paid.
  Derivatives (`fwidth`) and implicit-level texture reads stay outside them (`toVar()` puts a node on the stack where
  it is made): WGSL refuses both in non-uniform control flow, and the terrain's shadow is read at level 0 for that.
- **The crowns.** A fiord's bush was four MaterialX worley noises a fragment (27 cells each). It is now one
  2 × 2 × 2 cellular noise of two octaves that also returns the direction to the nearest point, which is the crown's
  slope, so the sunlit side needs no second pair of evaluations: about a fortieth of the work for the same picture.
- **Pixels.** The high tier drew the display's own pixels at up to 2× however large the window, so a Retina laptop at
  full screen drew 13 million pixels four samples each. It now stops at a 1440p display's pixels, as the cities' scene
  does (`reef/tier.js`).
- **The governor.** The viewer now runs `OEQuality.governor()` as the cities' game does (its form since issue 382 is in
  the next section: the scene's target scaled inside the canvas and sharpened up, under the frame-rate cap, from an
  opening budget). Stills, films and the checks keep the tier's pixels.

Frame time at equal pixels, llvmpipe, 1200 × 750, high tier (`tools/reef_cost.js`), before → after: the ship shot
1743 → 1205 ms, the aerial 2927 → 1440 ms. The base's own runs varied by a fifth between passes. Not measured: a real
GPU. `tools/reef_webgpu.js` runs the page on WebGPU here (Chromium's Dawn over lavapipe, headless) and checks that
every WGSL module compiles: 101 for Milford's game, 281 for Tekapo's, none with an error, and naga agrees. It cannot
take a still (the canvas reads back empty), so the picture is checked with `tools/reef_shot.js` on WebGL2.

## The reef and alpine sites on WebGPU (issue 382)

The telemetry's first day with frame costs named the device behind the slowest samples: an Apple M3 at a pixel
ratio of 2, tier high, on the WebGPU pages (the Whitsundays at 20 to 30 frames a second, Lake Pukaki at 12, Milford
Sound at 5) with the main thread idle. Those pages had no pixel budget, no governor and no frame cap, and the telemetry
could not see inside their frames.

### Measuring a WebGPU frame

`tools/reef_frame.js` runs a site on the WebGPU backend (Chromium's Dawn on SwiftShader here, which has
`timestamp-query`) and wraps the page's WebGPU calls from outside: each render and compute pass of one frame with the
node or file that asked for it, its target (size, formats, samples), its draws and triangles, the pixels its target
holds per sample, the bytes its attachments take, and the GPU's time inside it. `ABLATE=1` hides each thing in the
scene in turn and prints what the passes cost without it. SwiftShader is a CPU: its times compare one pass with another
and one build with another; the counts are exact.

### What it found

The scene's pass, at four samples of half-float colour and depth, was **ended and begun again six times a frame**.
The sea's refraction (`ocean.js`) reads the frame behind the water through three.js's viewport nodes, and each of its
two depth reads and its colour read, for the water's back faces and again for its front, copied the framebuffer on its
own; a copy cannot happen inside a pass, so the backend ends the pass, copies, and begins it again with `load`. On a
tile-based GPU (every Apple one, every phone) a pass that ends stores all four samples of colour and depth to memory
and one that begins loads them back: 96 bytes a pixel each time. On the M3's full-screen Retina canvas (5.9 million
pixels) that was about 3.4 GB of memory traffic a frame before anything was shaded, a third of a 100 GB/s memory's
second, which alone holds a frame near 30 ms. Each site's start at 960 x 540, high tier, the governor at its ceiling
(`tools/reef_frame.js <site> start high 2`; the counts scale with the pixels; before: main as the telemetry saw it,
b0313a6e; after: this work merged with main's lighter land shader). Pixels in targets: every pass's target, each sample
counted; bytes: what those targets hold, which a pass that is ended and begun again stores and loads:

| site | passes (over the whole frame) | pixels in targets | bytes | draws | triangles | SwiftShader GPU ms |
|---|---|---|---|---|---|---|
| Milford Sound | 49 (13) → 44 (8) | 17.0 M → 6.6 M | 185 → 67 MB | 362 | 0.95 M | 35 500 → 24 900 |
| Lake Pukaki | 49 (13) → 44 (8) | 16.9 M → 6.5 M | 184 → 65 MB | 716 | 3.6 M | 15 600 → 15 700 |
| Whitsundays | 47 (12) → 42 (7) | 15.9 M → 5.5 M | 177 → 58 MB | 196 | 1.6 M | 5 580 → 5 440 |
| Hardy Reef | 47 (12) → 42 (7) | 15.9 M → 5.5 M | 177 → 58 MB | 170 | 0.38 M | 4 920 → 4 800 |

SwiftShader's times barely move, as they should not: a CPU has no tile memory to store and reload, and the land is
shaded the same at the same pixels (runs here vary by a fifth or more under load, so Milford's drop says little; main's
land shader is measured in the section above). What the bytes save is a tile GPU's memory traffic, which only a real
device's telemetry can time; what the governor saves is pixels, which the lab holds at its ceiling.

By object (`ABLATE=1`, Milford Sound's start, after main's lighter land shader of the section above): the land is
88% of the frame's GPU time, the water and its mirror (which draws the land again) 14%, the sky and the far land 7%
each; at Lake Pukaki the land, the plants and the mirror lead. So what pays is fewer of the land's pixels, drawn once.

### What was done

- **One copy behind the water** (`reef/behind.js`): one node pair for the colour and the depth behind the water,
  copied once a render, both in the one break of the pass. The sea looks as it did (stills below).
- **The governor** (`OEQuality.governor`, the city game's, unchanged): the scene's pass is drawn at `governor.scale`
  of the canvas and the last pass brings it up with the contrast-adaptive sharpening of the game's lens (RCAS, MIT),
  so the canvas, the interface and the edges stay at the display's resolution. Its ceiling is the tier's scene
  budget (2560 x 1440 on high, the cities' own; the canvas within a 4K display's pixels), its floor half the canvas.
  Its extras are the lake's mirror at half its size again and the two ripple tiles at every second frame (third at
  0). It runs under the game's frame-rate cap (60 unless the player chose otherwise), so a 120 Hz laptop draws every
  second frame, evenly.
- **Start low, remember.** A device new to a site starts within an opening budget (1920 x 1080 of scene pixels on
  high), not at the ceiling, and is granted more as its frames allow; the scale it held is kept for its next visit
  (`localStorage` `oe3d-scale:<site>:<tier>`). The M3's first frames at Milford were its slowest.
- **The mirror while the eye is still**: redrawn every third frame (it renders the land again); every frame as soon as
  the camera moves.
- **Telemetry**: the page reports its own GPU frame (`OETelemetry.gpu`; docs/OBSERVABILITY.md), the release
  (`version.js` now loads on the reef page and finds `version.json` from its own folder) and the kind of site.

Together, on the M3 at full screen: the scene's pixels from 5.9 million (one frame before main's budget) to 2.1
million at the start, the ceiling 3.7 million, the floor 1.5 million; the memory traffic of the breaks from about 3.4 GB
a frame to 0.2 GB at the start. Main's lighter land shader (the section above) cut the shading of each of those
pixels by a third to a half on top.

The reef gametest steps the governor on every site (slow frames take the resolution down and shed the extras, fast
frames bring them back, the scene's target following each step); `tools/telemetry_check.js` checks that a reef site's
time events carry its kind and its own draws, triangles and pixels; `tools/reef_pair.sh` compares stills of two builds.
Stills of Milford Sound, Lake Pukaki, the Whitsundays and Hardy Reef at day and dusk, on a desktop (1440 x 900) and a
phone (390 x 844), match main's to the pixel (at most 0.01% of pixels differ by more than 8 of 255, on the sea); the
governor stands still at its ceiling under automation, so these are the full-resolution picture. Not checked here: a
real GPU, Safari, iOS. The owner's own play, read back from PostHog (`fps`, `gpu_ms`, `bound`, `scale` by `site`), is
the real check.

## On a phone: the memory budget (the iPhone "A problem repeatedly occurred")

Shibuya's game, opened on an iPhone in Safari, ended in the full-page "A problem repeatedly occurred": iOS had
killed the tab's WebContent process more than once. iOS kills a tab that grows past about 1-1.5 GB (less on an older
phone), and a WebGL page's textures and buffers count against it as much as its script heap does. Measured on the
phone tier (an iPhone emulated, `tools/mem_check.js`, the low tier `quality.js` gives a phone), Shibuya's game held
**865 MB** of WebGL memory and over **800 MB** of script, most of it never seen on a 390 × 844 screen.

The rule is the same one the rest of this file keeps: a phone is given a lighter set, never a broken one. A phone's
low tier is marked `lean` in `quality.js` (`city().lean`: a touch screen under 600 px, or a device that reports 4 GB
or less), and the loader (`world.js`) reads its `budget` and does less there, the picture unchanged where it can be and
gently lighter where it cannot:

- **The walls' shading lives on the GPU alone.** The buildings are one geometry of a few million vertices with eight
  attributes (position, normal, colour, the facade's two, the window pack's two, the height source). Once uploaded,
  the six the shader reads back from the GPU are let go on the main thread (`BufferAttribute.onUpload`), and so are the
  drawn cells' indices; the picking mesh keeps only what a pick reads (position, index, the building id). In Shibuya
  this is **201 → 64 MB** of script memory. A geometry held only on the GPU cannot be rebuilt after a lost context, so
  there the game reloads the view (the note in `glcare.js`) instead of restoring it in place — `Wd.gpuOnly`.
- **The ground aerial is streamed.** A city's twenty-odd 1 km aerial tiles are 6 MB each on the GPU (122 MB in
  Shibuya, 170 in Queenstown). On a phone only the `budget.groundTiles` nearest the camera keep their own picture; the
  rest show the frame's low overview, one image for them all, and swap in and out as the camera moves
  (`world.js` `groundKeep`, called from the game's `groundLod`). The street-marking overlay a tile draws when you
  stand on it (`game.js` `streetTexture`) is drawn at a coarser 0.75 m a pixel on a phone and let go when you walk away.
- **Textures are capped by the tier, decorations more.** The low tier's largest texture is 2048 on a side
  (`renderer.capabilities.maxTextureSize`), so three.js scales a larger picture down as it uploads it; the ground
  aerial and the data masks (`shore`, `woods`, read by the pixel) keep clear of it. A landmark's decorative images —
  the big LED screens, signage atlases, plaques — are drawn at most 1024 on a phone (Shibuya's `screens.webp` is 2048,
  21 MB; there 1024, 5), the picture drawn once at its own size and let go. A text sign stays legible: these are seen
  across a street, not read.

Measured on the phone tier, the game on foot with the NPCs, the helicopter and the near car and tree models all
loaded (`tools/mem_check.js <city>`; the peak GPU memory it was asked for, summed per texture, buffer and renderbuffer
as each is uploaded and freed, and the JS heap of the page and its Workers once it has settled, a collection after the
run):

| Map (phone tier) | Peak GPU, MB | Settled JS heap, MB | Peak JS heap, MB |
|---|---|---|---|
| Shibuya (before) | 865 | — | 814 |
| Shibuya | 575 | 542 | 818 |
| Tokyo (Marunouchi-Ginza) | 586 | 807 | 1192 |
| Kyoto | 618 | 668 | 981 |
| Queenstown | 606 | 499 | 600 |
| Sydney | 531 | 462 | 604 |
| Shinjuku | 498 | 430 | 574 |
| Kamakura | 366 | 208 | 274 |
| Tetsugaku | 297 | 223 | 311 |
| Higashiyama | 294 | 208 | 350 |
| Fushimi Inari | 260 | 156 | 221 |

The budget (`quality.js` `budget`, `tools/mem_check.js` defaults) is **700 MB of peak GPU memory and 880 MB of
settled heap**, just above the heaviest maps (Kyoto's GPU, Tokyo's heap). What is left on the large maps is their
own: the buildings' few million vertices on the GPU (about 175 MB in Shibuya, all eight attributes read by the
facade shader), and in the script heap the walking model's solids (`collision.js` prisms, `nav.js` fine cells and
tiles, `navcells.js` maps: about 150 MB in Tokyo) and the landmarks' meshes, which the walking model reads. Those
are the next cuts (a per-distance building LOD; a packed collision store), not done here.

`tools/check.sh` runs `tools/mem_check.js` for each live city it checks (a step in `run_city`) and fails a city whose
peak GPU memory or settled heap goes over the budget (`MEM_GPU`, `MEM_HEAP`), so a change that re-inflates a phone's
memory cannot land silently. The budget is a regression ceiling set above the heaviest live city, not a hard iOS
number — that cannot be read from Chromium. The largest maps (Kyoto, Tokyo, Shinjuku, Shibuya) sit nearest it; their
few-million-vertex building geometry is the floor, and a per-distance building LOD would be the next cut.

### The peak while it loads

The owner's iPhone still ended in "A problem repeatedly occurred" opening Shibuya and Tokyo. The telemetry's
`crash` events (a page that died while on screen, reported by the next load) place it: `prev_ready` false, five
to thirty seconds in, with the data fetched and decoded and the scene never built. So the tab dies at the load's
peak, which the table above does not show (it is what the page holds once it plays).
`tools/mem_timeline.js <city>` prints that load as a timeline: the page's heap, its Workers' and the renderer
process's resident memory every half second, with the loader's stage. In Shibuya on the phone tier the resident
memory went from 0.5 GB to 1.7 GB between the second and the eighth second, in "Building the city".

The first cut is in the Worker that makes the buildings' vertex arrays (`buildings-geo.js` `Buf`). Its eight
arrays grew by doubling into new ones (the old and the new alive together), were copied once more to their
exact length at the end, and the triangles' corners were kept as an array of numbers and then copied into a
typed one: at four million vertices, about 370 MB held for 180 MB of result. They now grow and are cut to
length with `ArrayBuffer.transfer`, which gives the old buffer up as the new one is made (a copy where an
engine has no `transfer`), and the corners are a typed list from the start.

| Shibuya, phone tier, renderer resident memory (Chromium, llvmpipe) | Before | After |
|---|---|---|
| 8 s in, building | 1,699 MB | 1,378 MB |
| scene built | 1,743 MB | 1,507 MB |

That is a quarter of a gigabyte off the peak, not yet a load known to fit an iPhone. What is left is the map
itself: 48,000 buildings as one geometry, the walking model of all of it, and every landmark, whatever the
player can see from where they stand. The next cut is a phone's map built round the player (issue 443).

**Not checked here: a real iPhone or Safari.** These are emulated under Chromium with Mesa's llvmpipe; the numbers are
what WebGL was asked for and what V8's heap holds, not what iOS accounts. The owner's own play on a phone is the real
check.

### Round 2 (issue 406): what the player cannot see takes no memory

Round 1 left the large maps just under the budget, and hero levels are being added at every spawn. This round
asked where the bytes are from first principles: a heap snapshot of Tokyo on the phone tier, summed by the path
that holds each array buffer (`tools/heap_owners.js`, from `SNAP=file tools/mem_check.js`), and the sampling
profile of the page's live objects (`SAMPLE=1`). What it found and what was done:

| What | Where it was | Cut |
|---|---|---|
| The collision world's solids | an object and nested ring arrays per solid (`collision.js` prisms), about 100 MB of Tokyo's objects | a struct of typed arrays (heights, box, tag, id, a run of walls), the walls written as a solid is added |
| The collision world's walls | 72 MB in Tokyo: nine in ten solids are upright boxes (a landmark's 2 m and fine cells, a canopy's posts), four walls each with their buckets and marks | `addBox()` keeps the box alone; the queries read its four walls from it |
| The ground clip mask (`world.js` CLIP) | an RGBA canvas at half a metre kept as image data: 45 MB on the page and again on the GPU in Tokyo | one byte a texel on the GPU (R8), a bit a texel for `near()` |
| The piers' deck heights | a Float32 over the whole 2 m model (15 MB, also where a map has none) | a grid over the piers' bounds alone |
| The landmarks' nav cells (`navcells.js`) | unpacked from the worker's packed arrays into Maps of arrays, 30 MB in Tokyo | read in place: sorted keys, a binary search |
| The walls' picking copy and bounds-tree | position, index and building id kept on the page for the survey lens, and a bounds-tree built for it (3-4 s in a Worker) | the game picks from its collision world (`collision.js` `pick`, `tools/pick_check.js`: 94% of 720 rays name the same building); the picking index goes, and on a phone the positions and ids once uploaded |
| The NPCs' pictures on a phone | 1024 a side, 5.3 MB each with mipmaps, twenty-odd characters: 127 MB of Tokyo's GPU | 512 a side on the phone tier (stills at two metres show no difference); the characters you play keep theirs |

The collision world answers as it did: `tools/build_hash.js` now fingerprints it (Kyoto's identical before and
after), and a randomised comparison of every query against the old store differs only where a circle starts inside
a cluster of fine boxes and two pushes out tie (27 of 300,000), where either answer is as good. Building it is
quicker too: Kyoto's walking model (`nav:` in the console) 1257 -> 844 ms.

Every live map on the phone tier, before (main at the start of the round) and after (`tools/mem_check.js`):

| Map (phone tier) | Peak GPU, MB | Settled JS heap, MB | Peak JS heap, MB |
|---|---|---|---|
| Tokyo (Marunouchi-Ginza) | 577 -> 493 | 793 -> 569 | 1261 -> ~900 (noisy: 827-1067) |
| Kyoto | 620 -> 570 | 669 -> 437 | 960 -> 808 |
| Shibuya | 576 -> 529 | 544 -> 384 | 767 -> 695 |
| Queenstown | 607 -> 513 | 500 -> 454 | 575 -> 578 |
| Sydney | 531 -> 418 | 465 -> 374 | 641 -> 538 |
| Shinjuku | 507 -> 433 | 438 -> 319 | 554 -> 542 |
| Kamakura | 367 -> 327 | 210 -> 181 | 297 -> 289 |
| Tetsugaku | 297 -> 273 | 225 -> 190 | 349 -> 284 |
| Higashiyama | 293 -> 261 | 208 -> 165 | 340 -> 317 |
| Fushimi Inari | 263 -> 239 | 156 -> 137 | 208 -> 192 |

(Tokyo's after includes main's new Marunouchi hero level, merged during the round.) The budget is lowered to
**620 MB peak GPU and 620 MB settled heap** (`quality.js` `budget`, `tools/mem_check.js` defaults), a tenth above
the heaviest map, so the room made here is for the hero levels and cannot creep back unnoticed.

What is left, by size: the buildings' vertex buffers on the GPU (Kyoto 325 MB: 5.3 million vertices, 45 bytes
each; Kyoto has 65,738 buildings, so the building id does not fit 16 bits there; a coarser set for the far cells on
the phone tier is the cut), the ground aerial and sea textures, the surface model (`DSM` data and ids, 29 MB in
Tokyo, needed), the quays' distance fields (25 MB in Tokyo), the landmarks' fine-cell triangles kept per tile
(`nav.js` `tileTris`, 14 MB of small arrays) and the streets' carriageways (15 MB). And the load's peak heap, still
300-400 MB above the settled one on the large maps while the worker's arrays and the page's copies overlap.

### A map built round the player (issue 443)

The rule, in the owner's words: **what is not seen costs nothing**. It is the first row of issue 358's table, the
analogy the owner drew with efficient language models (a mixture of experts runs only the experts a token needs;
here, build, unpack and upload only what the player can see from where they stand), applied to memory and to
the load, where rounds 1 and 2 had applied it to what a frame draws. Until now a map was one thing: Shibuya's
48,000 buildings were 4.9 million vertices in one geometry, built, sent to the page and uploaded before the first
frame, whatever the player could see of them from the Scramble. On an iPhone the tab died while that happened.

**Where the load's memory is.** `tools/mem_timeline.js` prints the renderer's resident memory as the load goes, and
the page's heap is a small part of it. `tools/mem_infra.js <city> 3,5,8` asks Chromium for its own account by
allocator at those seconds of the load (memory-infra), and `tools/heap_at.js <city> 3.2 file` takes a heap
snapshot mid-load for `tools/heap_owners.js`. Shibuya on the phone tier, five seconds in, before this round:
array buffers 643 MB (of which the page's own live ones were under 70: the rest were the Worker's vertex arrays,
their copies on the way to the page and what a collection had not yet taken), the two heaps 365 MB (most of it
garbage from decoding the packs: a snapshot of the page, which collects first, finds 55 MB of live objects), 300 MB
of the allocator's (decoded pictures, the message with the decoded data), 136 MB of 2D canvases and 130 MB of
decoded images.

**The buildings by cells, at the detail their distance needs** (`buildings-geo.js` `cells`, `buildings.js`
`stream`, `world.js` `mapAt`). On a phone's game (`quality.js` `lean`, `budget.map`) the Worker sorts the solids
into a grid of 250 m cells and builds each on its own:

| A cell's nearest point to the player | What is built |
|---|---|
| within 500 m | everything, as before |
| within 1.5 km | the walls in one lift from base to eave (no rows of vertices at 8, 24 and 48 m for the sky's openness: it is taken at the foot and the eave), a pitched roof as a flat one at its ridge, no plinth, canopy posts or passage ceilings |
| past 1.5 km | the same, and only the solids 25 m or taller: the skyline, which is what shows over the street wall and through the haze |

Each cell is a mesh of its own with its own buffers (most have a 16-bit index), a still shadow caster, gated by
the visibility sweep like any static mesh (`OEVis.gate(mesh, true)`, `ungate`), its arrays let go once the GPU has
them. The game calls `Wd.mapAt(x, y)` every second and wherever it moves the player; once that is 100 m from where
the cells were last built round, the cells whose level changes are built again on the page, in slices of 6 ms
(the Worker has let its copy of the data go: keeping it would hold a hundred MB to save a few milliseconds a
second), from the same options and the same surface model the first build used, and swapped in. Walking changes
a few cells every hundred metres; a train or the helicopter to the far corner of Shibuya changes 188, about
0.7 s of building spread over the frames of 1.3 to 3 s.

| Phone tier (`tools/mem_check.js`) | Buildings' vertices | Peak GPU, MB | of which buffers | Array buffers 5 s into the load |
|---|---|---|---|---|
| Shibuya | 4,910,630 -> 753,581 | 529 -> 363 | 251 -> 68 | 643 -> about 300 MB |
| Tokyo (Marunouchi) | 1,839,376 -> 569,037 | 494 -> 445 | 150 -> 91 | |
| Sydney | 1,102,604 -> 192,587 | 433 -> 392 | 107 -> 66 | |

`tools/mem_check.js` now takes the player to the map's far corner and back before it reads the peak, so the peak
counts both places' cells while they change over, and fails a map whose cell under the player does not come back
whole or whose buildings are not the same on return. The budget for peak GPU memory goes from 620 to **490 MB**, a
tenth above the heaviest (Tokyo).

**Stills**, 390 x 844 on the phone tier, the map whole (`?map=whole`) beside the map round the player: at the
spawn and from 110 m over it the two are the same picture; from 260 m up looking across the far zone, the low
houses past 1.5 km are the aerial photograph instead of boxes, a thin band under the horizon by day and fewer
lit windows there by night. On the ground it cannot be seen. The medium and high tiers and the model viewer
build the map whole as before (the viewer picks a building from the one geometry).

No code was taken for this. The method is what open worlds do (Unreal's World Partition and its HLODs, GTA V's
LOD chain: "Far geometry" above); the levels are this project's own.

**What the page kept after the GPU had it.** `tools/canvas_mem.js <city>` lists the 2D canvases, decoded
pictures and decoded sounds still alive in play, with who made each. Shibuya on the phone tier held 183 MB of
canvases and 153 MB of decoded pictures:

| What | Held | Now |
|---|---|---|
| The inland water's masks (`inland.js` `raster`): three canvases drawn to read one byte a cell from | 116 MB, on every tier | let go once read; read in bands of rows, not 45 MB of pixels at once |
| The hole mask's two distance grids (`inland.js` `holeMask`) | 94 MB of floats while it ran | sixteen bits a cell (a tenth of a millimetre a step) |
| The roofs' photo canvas (`buildings.js` `loadPhoto`) | 14 MB | on a phone, let go when the last tile is on it and the GPU has it |
| The water's cover mask canvas (`world.js` `waterCover`) | 14 MB | on a phone, sent at once and let go |
| three.js's own canvas for scaling a picture over the tier's cap, kept at the size of the last | 14 MB | a sliver sent through it once the tiles are in |
| The ground's twenty decoded aerial tiles (`world.js` `groundKeep`) | 92 MB | on a phone, a tile's picture goes when the GPU has it and every tile has been on the roofs' photo; read again from the browser's cache when it comes back among the nearest |
| The hole mask's bytes on the page | 11 MB | on a phone, the GPU's alone once sent |

After: 38 MB of canvases (the minimap's base, 17, is the largest) and 62 MB of pictures (the shared models'
own, which three.js keeps beside the GPU's copy). `groundKeep` also moved its tiles only when the player had gone
150 m since the *last call*, which a walker never does in a second: it now measures from where the tiles were
last chosen.

**A second chance instead of a crash loop** (`quality.js` `died`, `telemetry.js`). A phone gives no reading of
the memory it has left. The one signal is that the system killed the tab, and the next page load finds it: the
note a visible page leaves every five seconds is still there. That load now counts the death against the map
(`bh-died-<map>`, kept fourteen days), and on the low tier each one makes the next load of that map lighter;
the loader says "a lighter set: the last visit ran out of memory here". This is the closed loop of issue 358's
Layer A applied to memory: measure, then grant.

| Shibuya, phone tier | Buildings whole / simplified / skyline from | Aerial tiles of their own | Decorative and NPC pictures | Buildings' vertices | Peak GPU |
|---|---|---|---|---|---|
| as it comes | 500 m / 1.5 km / 25 m | 6 | 1024 / 512 | 753,581 | 366 MB |
| after one death | 350 m / 1 km / 30 m | 4 | 512 / 256 | 436,013 | 312 MB |
| after two or more | 250 m / 750 m / 40 m | 2 | 512 / 256 | 273,096 | 289 MB |

(then `DIED=1 tools/mem_check.js shibuya`; now `LV=n`, below: at the spawn and from 110 m up the
lightest set is the same picture but for softer signs.) A device on the low tier that is not a phone gets the
phone's set after its first death. `tools/telemetry_check.js` checks that a dead page is counted against its map.

**The reload Safari makes itself.** Safari loads a tab again the moment its page is killed, so the dead page's
note is a few seconds old when the next load reads it, and a note under half a minute old was taken for another
tab's that is still open: the death went uncounted, the second load was as heavy as the first, and the visitor was
left on "A problem repeatedly occurred" before any lighter set was tried. The tab's own last page is now known by
the tab's session storage, which outlives a killed page, and its note is a dead page's at any age
(`telemetry.js` `before`).

**What follows the first frame comes in turn.** With the map round the player on the site, the owner's iPhone drew
Shibuya's first frame (the telemetry's `load`: `frame_ms` 10,986) and its tab died within seconds of it. 700 ms
after the loader fades, `game.js` `afterPlayable` fetched the NPCs within 300 m, the near cars, the near trees and
the far aerial tiles all at once, with the helicopter beside them: every picture decoded, resized and sent to the
GPU next to the others. On a phone they now come one after another with a quarter of a second between (the people
nearest first, then the cars, the trees, the pictures, the helicopter last), and `npcStream` brings one character
at a time. The far models stand in a few seconds longer; nothing is left out.

**Where a page died.** The note that a page is alive carries the last step of the load the page named
(`fetched`, `decoded`, `built`, `frame`, then on a phone `late people`, `late cars`, `late trees`,
`late pictures`, `late in`, `late helicopter`), written at each step and not only every five seconds, and the next
load's `crash` event reports it as `prev_stage`. The next death names its step.

**Left, in order of what they hold**: the textures (223 to 339 MB of the peak: the landmarks' pictures, the ground,
the NPCs', loaded for the whole map at the start), the walking model and the landmarks built for the whole map
(Tokyo's page holds 383 MB of array buffers at rest), the Worker's and the page's garbage while the packs decode
(a collection finds 210 MB of live array buffers where Chromium counts 490), the shared models' decoded pictures
kept beside the GPU's, and the minimap's base. Tokyo's array buffers at rest by who holds them
(`tools/heap_owners.js`): the walking model 128 MB (the collision world 56, the rest of `nav.js` 72), the
landmarks' geometry kept on the page after the GPU has it 66, the surface model 29, the quays' distance fields 26.

**Not checked: a real iPhone, Safari, a real GPU.** Chromium under llvmpipe, an iPhone's screen and user agent.
The numbers are what WebGL was asked for and what Chromium holds; what iOS counts, and where it kills, only the
owner's phone can say. The telemetry's `crash` events will show whether a second load now gets through.

### Measure, then grant: a phone starts light (issue 443, round 4)

With the rounds above on the site, the owner's iPhone drew Shibuya's first frame at 10 s and its tab died at 20 s,
after the last of the late steps (`crash`: `prev_stage` `late helicopter`); the load Safari started again, on the
set one step lighter, died before its first frame, and Safari showed "A problem repeatedly occurred".

**What the limit is** (WebKit's own engineers and kernel logs; no figure is published):

- An iPhone's tab has a soft limit of about 1.5 GB, lower on phones with less memory, enforced as the system
  comes under pressure, and a hard one of 2,048 MB seen in kernel logs on iOS 26
  ([WebKit bug 277848](https://bugs.webkit.org/show_bug.cgi?id=277848), 2024;
  [Apple developer forums 823061](https://developer.apple.com/forums/thread/823061), 2026).
- **The GPU's memory is charged to the tab**: "WebKit assigns the cost GPU process memory for a tab to the tab
  itself" ([WebKit bug 256703](https://bugs.webkit.org/show_bug.cgi?id=256703)). So what counts is the sum of the
  two columns this file had kept apart. Shibuya on the phone's set held 392 MB of WebGL memory beside a renderer
  process of 1.1 to 1.3 GB at the load's peak (Chromium's; `tools/mem_check.js`): at the limit, not under it.
- Nothing warns the page: no memory reading exists in Safari (`performance.memory`, `navigator.deviceMemory`
  and `measureUserAgentSpecificMemory` are all absent) and no event comes before the kill
  ([WebKit bug 300782](https://bugs.webkit.org/show_bug.cgi?id=300782), open).
- What others keep to on an iPhone: 100 to 150 MB of video memory (PlayCanvas's forum, 2023), a fixed texture
  pool by device profile (Unreal's `r.Streaming.PoolSize`: 70 to 180 MB in Epic's mobile profiles).

**Why the lighter set did not save the second load.** The ladder ran the wrong way. The fullest set came first
and each death took a fifth off (peak GPU 366, 312, 289 MB); Safari allows two deaths. And the second load started
the instant the first page died, while its memory, the GPU's with it, was still being taken back.

**The loop now** (`quality.js` `level`, `held`; `telemetry.js`). A phone's set is a level, 0 the fullest to 3 the
lightest, granted the way a congestion window is:

- a phone with no record starts at level 2, a set that is meant to fit, not the one that looks best;
- a minute of play at a level (`held`, counted on screen, after the late steps) lets the next visit try the level
  above it;
- a page that dies has written its level in the note it left (`lv`), and that level and the heavier ones are
  ruled out on that map for fourteen days (a death from before levels were written counts as level 1);
- a load within twenty seconds of a death waits three and a half first ("Making room").

A phone with the room climbs to the full set in two visits; one without stays where it lives. The `crash` event
carries `prev_lv`, and the load's last step is `held` once a level has been held, so the owner's phone says which
level it lives at.

**On the story's page none of this ran** until 21 November 2026. `quality.js` read the map from the address alone
(`#play-shibuya`), and the story's page has nothing after the `#`: its deaths were written and never read, so a phone
the system had killed loaded the same set again, and the minutes it held never let it climb. The owner's iPhone that
evening (telemetry, app 0.1.137): the context lost 35 s in, during the opening's shot from above; the page reloaded at
level 2 and was killed at `built` 12 s later; Safari's own reload at level 2 again took 139 s to get in. Now:

- the page names its map (`<html data-map="shibuya">`), which `quality.js` reads where the address has none;
- a lost WebGL context on a phone is a death at its level too, counted as it is lost (`quality.js` `lost`, once a page,
  asked by `telemetry.js` `noteLost` and by `glcare.js`, which works with the telemetry off): on a phone it is the GPU's
  memory run out, and the reload makes room and loads a level lighter. A loss while the tab is put away is not counted (the tab in front took the memory), and the page does not reload until it is seen:
  a phone keeps every tab's WebGL in one GPU process, and that evening a tab of the story in the background lost its
  context, reloaded and built the whole map beside the tab being played, which then lost its own;
- once `glcare.js` has given up, the frames hold: a restored context that is not rebuilt drew walls whose arrays the
  phone had let go of, and three.js threw (`null is not an object (evaluating 'r.byteLength')`);
- the climb stops at level 2 (`TOP`), the set the budget is measured at: at frame 5 a phone at level 2 holds 269 of
  its 270 MB (issue 105), and level 1 keeps pictures at 2048 where level 2 keeps 1024. It goes up when a fuller set is
  measured within the budget there.

`tools/glcare_phone.js` plays all of it as a phone (the levels from the notes, a loss with the tab put away, a loss
seen), and fails on the code before.

**A loss is taken up where it happened** (issue 118, 23 November 2026). The reload put the player back on the title: the
owner's phone lost its context four times in five minutes in the first frame, and each time began the evening again,
its film and its call. Now the game notes where the player was as `glcare.js` gives up (`onGiveUp`, game.js
`noteResume`, in the tab's session storage) and the next load takes them up there with no title and no film
(`takeResume`): the story at the frame it was at, from that frame's beginning (a Stop's words and photograph are not
kept part way; standing where the world stopped, it stops again), the walk at its hour and sky, and on foot where they
stood. A killed page's death is counted with the measurements off too (`web/lifeline.js`, issue 128). On 21 and 22
November every `r.byteLength` error in the telemetry came from builds without the frames' hold above: 0.1.137 on GitHub
Pages and `0.1+fc003e3` on Vercel, whose production deploy stayed on that commit of 21 November 09:11 after
`vercel.json` began building the branch `live` only. `tools/ctx_beats.js` loses and restores the context at the third
frame's street, at its Stop and on the walk, on a desktop (restored in place) and on a phone (taken up after the reload).

| Level | Buildings whole / simplified / skyline from | Largest picture | Sun's shadow map | Signs / NPC pictures | Aerial tiles of their own | Scanned walkers | Fetched ahead |
|---|---|---|---|---|---|---|---|
| 0 | 500 m / 1.5 km / 25 m | 2048 | 2048 | 1024 / 512 | 6 | 8 | all |
| 1 | 350 m / 1 km / 30 m | 2048 | 2048 | 1024 / 256 | 4 | 8 | all |
| **2, a phone's first** | 250 m / 1.1 km / 30 m | 1024 | 1024 | 1024 / 256 | 2 | 4 | all |
| 3 | 200 m / 700 m / 40 m | 1024 | 1024 | 512 / 256 | 1 | 2 | not the helicopter (until 150 m from it) or the near trees |

The canvas a phone draws is 487 x 1055 pixels: a 2048 picture on it is sampled at a quarter of its texels at best.
Also on every level of a phone's game: the ground tiles' vertex arrays go once the GPU has them (30 MB of
Shibuya's page; only the model viewer casts a ray at the ground), and a fine ground tile left 700 m behind is
disposed and built again on the way back.

| Phone's first load (`tools/mem_check.js`) | Peak GPU, MB, before -> now | of which textures |
|---|---|---|
| Shibuya | 392 -> 224 | 305 -> 152 |
| Tokyo (Marunouchi) | 445 -> 273 | 339 -> 171 |
| Sydney | 392 -> 221 | |

The budget for peak GPU memory goes from 490 to **300 MB**. Stills at 390 x 844 at the spawn by day and night and
from 150 m up at dusk, in all three maps: level 2 against level 0 differs at the spawn in nothing a player reads
(at 512 the shop names across the Scramble blurred, so level 2 keeps the signs at 1024); from the air with the
middle distance cut at 600 m the aerial photograph showed as a blue band under the horizon, so level 2 keeps it
to 1.1 km.

**Would a smaller play area or fewer people do it?** Measured, by who holds the page's memory in Shibuya
(`OWNERS=1 tools/mem_check.js`, `tools/heap_owners.js`): the people are the small part (the avatars' library
8.5 MB of arrays, about 4 MB of pictures a character: the cast of four is now 16 MB; the far crowd is instanced and
costs frames, not memory). What scales with the *map* and not with the player is the large part, and it is still
built whole: the 2 m surface model (34 MB), the inland water's rasters over the channels' box (29 MB, and an 11 MB
mask on the GPU), the collision world and walking model (45 MB), the roads' and footways' nets, the landmarks, the
decoded packs (40 MB), and 143 MB of objects, most of them parsed arrays of the whole map's data. So limiting
where a phone's player can go pays only if the map itself is cut to that district before the page builds
anything, which is the next step below; limiting the walkers to one street would save a few MB.

**The same thinking as an efficient model** (the owner's analogy; DeepSeek-V2 and V3,
[arXiv 2405.04434](https://arxiv.org/abs/2405.04434), [2412.19437](https://arxiv.org/abs/2412.19437)):

| There | Here | State |
|---|---|---|
| Mixture of experts: 37 of 671 billion parameters run for a token | build, unpack and upload only what the player can see from where they stand | the buildings (cells); not yet the walking model, the rasters, the landmarks |
| Low precision where it holds (FP8 with fine-grained scaling) | sixteen-bit heights and ids in the surface model, quantised vertices, block-compressed pictures (ASTC 4x4 is a quarter of RGBA8; every iPhone has it) | not done: the largest cut left on the GPU |
| A compressed latent in place of the full keys and values (MLA) | the middle and far distance as a distilled stand-in (issue 358's static world) | simplified cells; no baked far world |
| Distillation offline, cheap inference | cut and simplify the phone's district in the pipeline, not on the phone | not done |
| Load balancing by feedback, no auxiliary loss | the level, from deaths and minutes held | this round |

No code was taken; these are methods.

**Next, in order of what they hold** (issue 443; the first is done, "A phone's district" below): the phone's district as a pack of its own, cut offline to a
kilometre round the spawn with the play area bounded to it (every map-wide grid above shrinks with the frame, and
the load's peak with the data decoded); pictures block-compressed for phones; the surface model in sixteen bits;
the inland rasters by tile.

**Not checked: a real iPhone, Safari, a real GPU.** Chromium under llvmpipe. The page's own heap is unchanged by
this round (about 380 MB settled in Shibuya, 580 in Tokyo) and the renderer process still peaks over a gigabyte
there; whether 170 MB less on the GPU and a load that waits is enough, the owner's phone says, through `crash`
(`prev_lv`, `prev_stage`) and `held`.

### A phone's district (issues 443, 406, 335 and 404)

Round 4 moved the GPU's share and left the page's own: about 380 MB of settled heap in Shibuya and 580 in Tokyo, and
a renderer process over a gigabyte at the load's peak. What held it scaled with the map, not with the player: the 2 m
surface model, the walking model and its collision world, the inland water's rasters, the packs as decoded and the
objects parsed from them, all made for 15 to 18 square kilometres before the first frame.

**The telemetry first.** Between PR 482 reaching the site (13:05 UTC, 14 November) and this round, no phone opened
a game: the last iPhone events are 12:47 UTC on release 0.1.285, first frame at 11.7 s and the tab dead 6 s later
(`prev_stage` `late trees`), no `prev_lv` yet. So which level the owner's phone lives at is still not known, and
the order below is by what each cut holds.

**The cut is made offline** (`pipeline/district.py`; `python pipeline/pack.py` keeps it with the packs and
`--check` fails a stale one). A live map has a rectangle of four to five square kilometres round its spawn
(`cities/<id>/city.json` `phone_district`, chosen to hold the map's lines of play: Shibuya from Yoyogi and Harajuku
down to Daikanyama, Tokyo from the Palace plaza and Hibiya to Ginza, Sydney from Hyde Park to Milsons Point), and
`web/data/<id>/d/` holds the same packs cut to it:

| Pack | What is in a district's |
|---|---|
| `scene.bin` | the frame is the district; `world` is the whole map's frame, and the ground, the aerial tiles, the haze at the edge, the land past it, the night's light map and the roofs' photograph are drawn over it as before; the inland water clipped 60 m past the edge; the woods' and the shore's rasters cropped |
| `buildings.bin` | every solid that touches the district or the 200 m past its edge (scenery: the streets a player at the edge looks down), and past that the skyline alone, 30 m and taller, which is what a phone's level 2 draws there anyway; the rows renumbered |
| `landmarks.bin` | the meshes that touch the district or that band, and past it those 40 m and taller (Tokyo Tower from Marunouchi) |
| `game.bin` | the walking terrain and the water mask cropped; roads and footways clipped at the edge, their run through the band kept apart to paint the streets there; and the play that can be finished inside: people, spots, stations, wharves, ferry routes, and each line's quests up to the first with a step outside |
| `places.bin`, `vis.bin` | places inside, trees to the band's edge; the occluder raster cropped |

Everything keeps its coordinates, so the page's code is the same and only the amount differs: `world.js` `load`
fetches `d/` on a phone (`quality.js` `lean`; `?district=on` anywhere, `?district=off` or `?map=whole` to compare),
and the handful of places that mean "everything drawn" rather than "where the game is played" read
`scene.worldFrame`. The play area is the district: a walker and a car stop at its edge as they do at the whole
map's, the helicopter is held 120 m past it, a train past its last station inside is not boarded (as at the map's
edge), and the game says "The edge of this district" rather than leave a wall without a word. What a district
leaves out is listed in `d/district.json` (`cut`): Sangenjaya's two quests in Shibuya, the water bus and Tokyo
Tower in Tokyo, the western wharves in Sydney. Those stay on the whole map, on a larger screen.

**Landmarks as numbers, not objects.** The pack format decodes a landmark's vertex lists as typed arrays, but
`pack.py` tested the plain-list case first and never reached the typed one, so every vertex came back a boxed
number in a plain array: 39 MB of Tokyo's page for 2.2 million of them, on every tier
(`PLAIN=6 tools/heap_owners.js` names who holds a snapshot's plain arrays and numbers, as it did the array
buffers). The order is fixed and the live maps' landmarks repacked. On a phone a landmark's geometry, and the
ground's clip mask, are now the GPU's alone once sent, like the walls'.

| Phone's first load, level 2 (`tools/mem_check.js`, `tools/mem_timeline.js`) | Whole map (PR 482) | District |
|---|---|---|
| Shibuya: settled heap / peak heap / renderer at the load's peak | 409 / 512 / 1,200 MB | 242 / 387 / 845 MB |
| Tokyo | 595 / 998 / 1,426 MB | 331 / 543 / 1,198 MB |
| Sydney | 393 / 552 / 1,047 MB (in play) | 276 / 461 / 945 MB (in play) |
| Peak GPU: Shibuya, Tokyo, Sydney | 242, 270, 226 MB | 218, 241, 214 MB |
| First frame (llvmpipe): Shibuya, Tokyo | 16.1 s, 49.4 s | 10.6 s, 25.4 s |
| The packs downloaded: Shibuya, Tokyo, Sydney | 4.5, 3.4, 1.8 MB | 1.9, 2.6, 1.4 MB |
| The walking model, footways and roads on the main thread (issue 404): Shibuya, Tokyo | 1.36 s, 3.54 s | 0.86 s, 2.10 s |

The budget is lowered to hold it: **270 MB of peak GPU memory and 400 MB of settled heap** (`quality.js` `budget`,
`tools/mem_check.js`), and the memory check now also fails a map whose district is not loaded on the phone tier,
names something outside it, or lets a walker out of it.

**The memory check's clock is pinned** (issue 516). It played at the real date and hour, and the weather is a hash
of the date: the same code measured Tokyo at 263 MB one morning and at 283 the next, in the rain, and failed on
main on a wet night (273). `tools/mem_check.js` now pins the clock as the game check does (`GAME_TIME`,
2026-11-02T10:00 in the city's zone unless given), then asks for the heaviest hour instead of waiting for it,
rain at ten at night held twelve seconds, and says which part of the run the peak fell in. Pinned, 16 November
2026: Tokyo 270 MB (the peak as the map changes over to the far corner; 263 once loaded, 265 in the rain at
night), Shibuya 228 (in the rain), Sydney 239 (in the rain). Tokyo is at the ceiling, not a tenth under it: the
phone's sharper canvas (about 12 MB of targets) and the station's halls came after the ceiling was set.

**Stills** at 390 x 844, the whole map built whole beside the district: at each spawn by day, dusk and night, from
180 to 260 m over it looking out across the far zone, and at the district's own edge on foot looking out. The
pairs are the same pictures but for the crowd and the clouds' moment. (`tools/game_shot.js` now waits for the
cells round a view before it takes it: with `LEAN=1` a view far from the spawn was taken before they were built.)

**No code was taken.** The method is a level's bounds as open-world games cut them (a playable cell with a
scenery ring past it and the skyline as far geometry: "Far geometry" above).

**Not checked: a real iPhone, Safari, a real GPU.** Chromium under llvmpipe. A renderer process of 0.85 to 1.2 GB
at the load's peak is under WebKit's 1.5 GB soft limit by Chromium's count, which is not iOS's; the owner's phone
says, through `crash` (`prev_lv`, `prev_stage`) and `held`.

### A phone's pictures in ASTC blocks (issue 443)

After the district, the largest thing left that an iPhone charges to the tab was the pictures: 148 to 160 MB of
RGBA8 textures, four bytes a texel. ASTC 4x4 is one byte a texel and every iPhone decodes it.

**Encoded on the device, not shipped.** The trial above stands: as KTX2 a photograph is three and a half times
its JPEG, and this project's pictures are WebP, AVIF and JPEG inside models and beside them. So the files stay
what they are, and each picture is encoded after it is decoded and before it is first sent to the GPU
(`web/astc.js`, in a Worker, `web/astc-worker.js`; `web/tex.js` holds a texture back until its blocks are there, so
the uncompressed copy never reaches the GPU). The download does not change.

| What is packed | Where |
|---|---|
| every model's colour pictures (people, vehicles, trees, trains, the hero level) | a GLTFLoader plugin, registered on every loader (`web/gltf.js`); the characters' and the hero level's after they have been made smaller (`people.js`, `hero.js`) |
| a landmark's signs, screens and plaques | `world.js` `leanDown` |
| the ground: the overview, the tiles of their own, the land past the frame | `world.js`, `farland.js` |
| the roofs' photograph and the streets painted on the near tiles | `buildings.js` `loadPhoto`, `game.js` `streetTexture` |

Not packed: normal maps and the packed roughness, metalness and occlusion (their channels do not move together,
which a block's one line of colours cannot follow), data textures and masks read by the pixel, canvases that are
drawn again, render targets.

**The encoder** writes two of ASTC's layouts, one partition and a 4x4 weight grid each: opaque blocks with RGB
endpoints at eight bits and a three-bit weight a texel; blocks with alpha in two planes of two-bit weights, the
second for alpha alone, their endpoints at 48 levels packed as ASTC packs trits. A block of a cut-out that has no
alpha in it takes the opaque layout. Endpoints are the ends of the block's principal axis, refined once by least
squares. It counts its own error, and a picture that would fall under 33 dB (27 for alpha) is left as it was: one
64 x 96 far figure in each map. `tools/astc_check.js` encodes this project's own pictures on a page, hands the
blocks to a real decoder (SwiftShader's; Mesa's llvmpipe offers none) and compares what comes back: 35.6 to 47.8 dB
opaque (an aerial tile 39.6), 33 to 46 with alpha, the encoder's own count within a fifth of a decibel of the
decoder's, no block rejected; `tools/check.sh astc` runs it when the encoder changes. Five to fourteen million
texels a second in the software renderer's page. No code was taken: the layout is the Khronos data format
specification's, the method the textbook one.

**Cut-outs** (November 2026: the guide's coat grey and streaked on the owner's iPhone, white on a desktop). The worker
reads a picture back from a canvas, and a canvas holds its pixels premultiplied: where alpha is 0 the colour comes
back black. That colour is read all the same. Each mipmap level was the plain mean of the four above it, so a thin
strand's colour was averaged with the black beside it, a step darker each level: the guard hairs (a 256 x 512 picture
of white strands, two thirds cut away) were at 244 on top and 210 three levels down, where a phone at a few metres
samples them, and the trees' leaves and the people's hair cards the same. A block where nothing showed was black, and
a filter mixed it into the edge beside it. A desktop does not pack, and the browser keeps the file's colour there,
which is why only a phone showed it. Now (`web/astc.js`): `bleed()` gives every texel that does not show the colour
of the nearest that do (push-pull: what shows averaged down by halves, by how much it shows, then each hidden texel
filled from the level below), each level is averaged by alpha (as a premultiplied picture is filtered; an opaque one
comes out bit for bit as before), and a texel cut away in a block takes the step of the block's line nearest its own
bled colour instead of the block's mean. What shows is untouched. `tools/astc_check.js` measures both, on a real
decoder: the mipmaps' colour, by how much it shows, against the top level's (the guard hairs 45.7 steps of 8-bit sRGB
before, 0.3 now; the trees' leaves 44 and 5.5; at most 8 passes), and the rim, a cut-away texel beside one that shows
against that one's colour (41 and 23.7 at worst; at most 30). `tools/coat_shot.js` draws the guide on a phone's
screen packed and not packed, side by side.

| Phone's first load in its district (`tools/mem_check.js` without `xvfb-run`, so on SwiftShader) | Peak GPU, RGBA8 -> ASTC | Pictures packed | Their blocks |
|---|---|---|---|
| Shibuya | 215 -> 143 MB | 82 | 31.6 MB |
| Tokyo | 239 -> 187 MB | 80 | 29.0 MB |
| Sydney | 213 -> 156 MB | 91 | 27.7 MB |

The blocks stay on the page (a texture let go and worn again is sent from them), 20 to 30 MB of array buffers in
place of the decoded pictures the browser held. What is left on the GPU is not pictures: the render targets, the
sun's shadow map, the night's light map, the hole and clip masks, the buildings' and landmarks' vertices.

**Stills** at 390 x 844 on SwiftShader, `?tex=raw` beside the default: Shibuya's spawn by day and night, Hachiko,
Center Gai at dusk; Sydney's spawn by day and night, the trees on the quay, the harbour at dusk. Signs read the
same, faces and leaves are the same; the pairs differ by the crowd's and the screens' moment.

**Not checked: a real iPhone.** The blocks are valid to SwiftShader's decoder, which is ARM's reference code; that
Safari's WebGL takes them from a Worker-encoded buffer the same way is expected and unproven. `?tex=raw` turns the
packing off, and the telemetry's events carry `astc: 1` where it is on, so a phone that does worse with it shows.

### A picture three.js made smaller, sent upside down (issue 68)

On the phone's path the zelkovas, ginkgos and camphors round Hachiko drew a pink lavender in October, in about a
third of the loads; the next load drew them green. It was not the season, the shaders or the leaf atlas's file:
read back from the GPU in a pink load, the atlas was **upside down**. Its seven rows of cells were in the reverse
order, so the cell a camphor's cards point at (row 2) held the weeping and Kawazu cherries' blossom (row 4), and
the ginkgo's (row 3, the middle) held its own. The pink was blossom, not a colour gone wrong.

**The cause is in three.js r186.** Before it sends a texture, `WebGLTextures` sets the flags the picture is sent with
(`UNPACK_FLIP_Y_WEBGL`, `UNPACK_PREMULTIPLY_ALPHA_WEBGL`, `UNPACK_COLORSPACE_CONVERSION_WEBGL`), but only when the
texture's image is not an ImageBitmap, since WebGL ignores them for one. Then a picture over the renderer's
texture cap is drawn smaller into a canvas (`resizeImage`), and a canvas does obey them. So an ImageBitmap made
smaller went up with whatever flags the texture before it left set. Every glTF model's pictures are ImageBitmaps
(GLTFLoader), and a canvas texture's or a TextureLoader's flips by default. Which texture went up just before the
atlas depended on the order the loads finished in, hence one load in three.

**Who it reached:** a renderer with a cap (`quality.js` `tex`, applied in `world.js`): a phone's 1024 and the low
tier's 2048. The leaf atlas is 1024 x 3584, over both. Under the phone's cap, so were the crowd's, the cars' and the
landmarks' model pictures (1000 x 1200, 1333 x 1600, 2048 x 2048, ...), wherever ASTC is off. On a phone that packs,
a packed picture never reaches `resizeImage` (`tex.js` hands three.js the blocks), but one the encoder keeps as it
was (under its quality floor) still did. It turned a
picture upside down, or premultiplied its alpha, or converted its colours, depending on what went before it. The high
tier (no cap) never resized, which is why a desktop drew the trees green.

**The fix** is in three.js's module itself, the one place it can be made for every picture: an ImageBitmap that is
to be made smaller is sent with the flags an ImageBitmap is sent as (not turned, its alpha as it is, its colours not
converted), whatever the texture before it set. `pipeline/fetch_vendor.py` `PATCHES` makes it each time three.js is
fetched, and fails if the text it fixes has changed. `--patch` makes it in place, and `--check` (in
`tools/check.sh` static) fails if the vendored module lacks it. On an upgrade, drop the patch once three.js sets the
flags for the resized image itself.

**Tools.** `tools/atlas_upload_probe.js` sends the atlas alone and then just after a texture that flips and
premultiplies, at the phone's cap, and reads it back: without the fix the second comes out upside down every time,
with the pink of the stills (200, 114, 132 where the camphor's green is 27, 57, 10). `tools/leaf_probe.js` reads
the atlas back from the game's own GPU with the trees round a place and the leaf program's defines. `tools/game_shot.js`
now leaves the game's renderer at `window.__R` for a view's `js`.

**Not checked:** a real iPhone, where the packed pictures do not take this path but anything left unpacked would;
WebKit's own handling of these flags for an ImageBitmap.

### A phone's picture: two pixels to the point, and no floor for nothing

The owner's verdict on an iPhone, the day the district landed: the picture is far too poor. The telemetry of that
visit says why. The low tier's canvas is 1.25 device pixels to the CSS pixel, a slow laptop's figure: 491 x 869 on
a 393 x 695 view whose screen has 1179 x 2085. Within three seconds of play the governor had the scene at 0.6 of
that, 295 x 521, and it stayed there, and then took half the display's rate as its target. The frames did not
come back for it: 30 to 53 a second at every scale, with 10 to 14 ms of script, 420 to 510 draw calls and 1.1 to
1.5 million triangles in each. A frame that is slow for its calls and its vertices takes as long at 0.6 as at 0.8.

Two changes (`web/quality.js`):

- **A phone's canvas is two device pixels to the CSS pixel** within the tier's budget of 1.25 million (1.5 at its
  lightest level): 786 x 1390 on that iPhone, 2.6 times the pixels at full scale, and at the governor's floor
  still 1.2, what full scale was before. One pass, no multisampling: about 12 MB more of targets, where ASTC had
  just freed 60 to 70.
- **Resolution that buys nothing is given back.** The governor keeps the frame time at its middle step with no
  extras left; when the floor has been held three seconds for less than 15% off it, the scale returns to the
  middle step and climbs a step every four seconds while the frame stays within 8% of its time at the floor. The
  scale it reaches stays the floor for two minutes. A device that opens at the floor from its record is asked
  the same way, a step up at a time. Frames that are a slow GPU's (shorter with fewer pixels) go to the floor
  and stay, as before; half the display's rate is still the target where the full rate cannot be met.

On a clock of its own (`G.simulate`), "scale/extras":

| Frames | Before | Now |
|---|---|---|
| 60 ms whatever the scale | 1.00/1 … 0.60/0, and stays | 1.00/1 … 0.60/0, 0.80/0 … 1.00/0 |
| 24 ms whatever the scale | … 0.60/0, half rate, 0.65/0 … 1.00/0 | … 0.60/0, 0.80/0 … 1.00/0, 1.00/0.5 |
| 30 + 50 s² ms (a slow GPU) | … 0.60/0 | the same |
| a GPU that fits at 0.8 with half the extras | 1.00/1, 0.85/1, 0.80/1, 0.80/0.5 | the same |

`tools/game_check.js` plays both kinds (its slow frames are a slow GPU's now, and a flat 60 ms must get the
resolution back); `tools/touch_check.js` checks the canvas's size on a phone's page.

**Not checked: a real iPhone.** That its GPU draws 2.6 times the pixels in the same frame is what the telemetry
implies and no more. If it does not, the governor's ordinary way down takes the scale to 0.6 of the new canvas,
which is the old canvas's full size, so the picture is never worse than the best it was. The `time` events carry
`px_k`, `scale` and `fps`: the next visit shows which.

### The surface model in sixteen bits, the rasters by tile: cut

Both were on round 4's list by what they held on the whole map: the surface model 34 MB, the inland rasters 29 MB
and an 11 MB mask. In a district the surface model is 8 MB (4 of heights, 4 of ids), and sixteen bits would save
4 of them for an accessor in front of every reader of `DSM.data` (the walking model, the sun's rays, the camera,
the far shadows). The inland water is clipped to the district, and its hole mask is 6 MB in Shibuya alone. Neither
is worth its risk now; the masks' page copies already go once the GPU has them.

### The last CPU of the city build (issue 404), measured

With the console's new `nav:` and `footways:` lines (desktop tier, llvmpipe): Kyoto's walking model 844 ms, of which
the landmarks' coarse cells and tile sort (`nav.js` `landmarkCells`) 451 ms; the footways people can walk 490 ms and
the roads cut at the walls 231 ms. Tokyo: 1756 ms, `landmarkCells` 1327 ms, footways 796 ms, roads 239 ms. The
collision world's own build is now the small part. What remains reads the whole walking model (the ground, strips,
roofs, piers, decks, landmark cells): moving it to a Worker means a second walking model there (a hundred MB more at
the load's peak, against this round's aim), so the better cut is to bake its result offline into `game.bin` with the
inputs' fingerprint and fall back to the live build when they differ. Not done in this round.

On a phone the district answers it by building less: Shibuya's walking model 762 -> 564 ms, footways 372 -> 210 and
roads 221 -> 82; Tokyo's 2,445 -> 1,655, 800 -> 364 and 291 -> 81 (the table under "A phone's district").


### The speaking cast's faces (issue 12)

Faces that move cost memory and vertex work, so they are given only where a face is seen to speak:

- **Who has them.** The characters who speak to the player (`pipeline/fetch_rocketbox.py` `face_cast`: the story's
  people, the NPCs a frame meets and the walk's talkers; and Kagami, whom the reverse shot sees): 13 NPCs and the two
  Kagamis. Every other model has no morph targets. The far crowd's copy of a speaking character the crowd also wears
  (Yuna, Taro, Riko) takes the face's mesh as before (`pipeline/crowd_cast.mjs`).
- **Only what is used.** Fourteen shapes of HeadBox's 176 (`build_people.py` `FACE_KEYS`): each eye's or side's pair summed
  into one, positions only (no normal or tangent targets). The face is a mesh of its own (the head and the lashes), so the
  body carries none: 1,755 to 2,447 vertices a face. The files grew by 10 to 70 kB.
- **Only the faces in play cost the GPU.** three.js keeps a mesh's shapes as a float texture (16 bytes a vertex a shape, 0.4
  to 0.55 MB a character), made the first time it is drawn with them and kept as long as its geometry. So every face mesh
  is drawn from a still geometry (the same buffers without the shapes: the program the crowd's faces use, people.js
  `ready` calls `face.js` `prepare`), and a face chosen to move is given a live geometry with the shapes (its own small
  copies of the buffers), disposed, texture and all, when it is let go (`face.js` `live`). The crowd's copies of a speaking
  character are never chosen and stay still. With every speaking character's texture made at once, the phone measured
  271 MB against its 270; with only the faces in play, 252 to 253.
- **Only the nearest animated.** `game.js` `faceChoose` poses the face of whoever is saying the line on screen (or whom the
  talk is with while a question waits), the player's in a talk or with the camera within 3.5 m of it (from the chase view
  it is the back of a head), and the nearest one other within 8 m of the camera on a phone (two within 14 m on a desktop).
  The first time a character's face moves its program with shapes is compiled; the nearest-within-reach rule usually
  brings that on as the player walks up, before the talk's cut.
- **Measured** (`tools/mem_check.js`, an iPhone on the low tier, November 2026, at `tools/check.sh`'s spot by the river):
  main without the faces 269 MB of GPU at its peak; with every face drawn moving at once 271, with the player's face always
  moving 270 (over the 270 budget); as above, the same as without.

### Frame 5's place: what is held there, and what of it is seen (issue 105)

Main on 21 November held 268 MB settled and 270 MB at its peak at frame 5's place on a phone (`AT=521.9,-1074.1
tools/mem_check.js shibuya`, rain at ten at night), against a 270 MB budget: any change that added a megabyte there
failed `mem` on noise. Measured first: `mem_check.js` now prints, at `AT`, what each hero level loaded there holds
(textures and geometry), and with `OWN=n` the n largest textures with the meshes that hold them or the script line that
made them (a render target, a pass, a uniform). What was held at frame 5, largest first:

| Held | MB | Seen there? |
|---|---|---|
| The scene's target and the lens's two half-float ping targets (760 x 1644 each) | 3 x 9.5 | the scene's: always. The two pings: drawn into only while a camera effect is on (a conversation, the camera raised, the arrival's crane), and kept from the first arrival to the end of play |
| The Scramble level, 70 m off its edge | 12.2 textures, 12.7 geometry | 25 of its 56 squares from the stand and the ground round it, more from where the helicopter sets you down |
| The two PMREM targets (the light from the sky, and three.js's ping-pong for baking it) | 2 x 6.0 | both while the sky is baked again, which the measure's own change of hour does |
| The inland channels' hole mask, the far land's two pictures, the night map, the roofs' photo | 6.0, 5.3 + 5.0, 4.8, 4.8 | map-wide, sampled by whatever ground, sky or roof is drawn |
| The player's face, body and hair (1024 each) | 3 x 5.3 | yes, up close |

The Scramble level was the issue's first suspect, but from frame 5's ground much of it can be seen: down Miyamasu-zaka
under the Ginza line's deck and up Meiji-dori, 2,000 to 30,000 of the 393,216 pixels of a cube round the eye.
`tools/hero_unseen.js scramble` asks the GPU: from a grid of eyes at four heights, the level's meshes each in a colour of
its own against the depth of everything else the page draws, the crowd and the trees left out. From the stand alone 31
of its squares are hidden: 4.2 MB of geometry and none of its pictures, since every material it has is also on a square
that is seen. The visibility sweep (`visibility.js`) cannot say even that much: the station's landmarks hide nothing in
its raster, so it counts 455 of the level's 486 meshes as seen from the stand.

The biggest holder no draw read was the two ping targets, 19 MB. A first cut here let them go when idle and gave the
depth of field one target; issue 130's cut, which landed first, does both and more (the blur reads the scene itself, one
pass; "The depth of field in one pass" below), and is what main has. On top of it, the measure now plays frame 5's own
worst moment: at `AT`, a conversation's depth of field for six seconds (`FX=0` leaves it out), then the rain at ten while
its target is still held, so a change that adds to the one target or to what a talk there holds is seen.

| Phone, frame 5's place (`mem_check.js`, `AT=521.9,-1074.1`) | Main before (21 Nov, f11cc12) | Main with issue 130 |
|---|---|---|
| The load and the first play | 252 MB | 237 MB |
| Settled at frame 5's place | 268 MB | 247 MB |
| A conversation's depth of field there | 268 MB (the pings already held) | 257 MB |
| The peak | 270 MB, in the rain | 259 MB, the rain with the conversation's target still held |

Not done, by what it would save: the Scramble's squares hidden from the stand parked off the GPU there (4.2 MB, at the
stand only); the sky's PMREM ping-pong let go between bakes (6 MB settled, nothing at a bake, which needs both).

## A desktop's map round the player (issue 20)

The phone had been built round the player since issue 443; the desktop still built the whole map and sent it to the
GPU before the title. Opening the story on the high tier, the loader's own log said `buffers: 1000 objects, 283 MB`,
for an episode played within 200 m of the Scramble.

**Where the 283 MB was** (`tools/upload_map.js`: the bytes WebGL was given by the title, and the scene's drawable
geometry by kind and by the distance of its bounds from the player at the Scramble):

| Kind | MB | within 150 m / 500 m / 1.5 km / 3 km / further |
|---|---|---|
| The buildings' walls and roofs: the whole map in one geometry, 4.9 million vertices of 45 bytes and a 32-bit index | 243 | 4 / 14 / 72 / 127 / 12 (as cells, 229 MB with 16-bit indices) |
| The ground: twenty aerial tiles over the map, and the two fine ones under the player | 12 | the fine two within 150 m |
| Two vertex-coloured meshes at the Scramble (unnamed) | 4 | within 150 m |
| The far land | 3 | (one mesh round everything) |
| The rest: the landmarks, the inland water's walls and rails, the crowd's and the lamps' instanced pools, the far trees, the night's lights | 22 | most within 150 m |

So it was the buildings, and nine tenths of them more than 500 m away: the street wall round the Scramble was 18 MB.
The crowd's pools (under a megabyte), the trees and the landmarks are small, and most of them are the hero level's.

**The cut** (`world.js` `DESK_MAP`). A desktop's game now takes the phone's road with its own distances: the buildings
by cells of 250 m, whole within 700 m of where the player starts (every standpoint, the roof and the flight's way are
within 200 m of the Scramble, so their whole view of the hero level and the streets round it is at full detail), and
past that to the map's edge in the middle distance's form (`buildings-geo.js` level 1: the walls in one lift from base
to eave, a pitched roof flat at its ridge, no plinth, posts or passage ceilings). Nothing is left out: unlike the
phone's skyline zone, every solid is kept to the edge (`tall` 0), because the roof at 242 m and the flight see the low
houses to the haze. And the cells are built again only when the player has gone 350 m (`step`), which the story never
does: no cell changes level while the story is played, so nothing can pop from the roof or the flight. In the free
game (`?walk=1`) a walk of 350 m rebuilds the cells that change, on the page in slices of 6 ms, at 350 m and more from
the player, the old cells drawn until the new ones are in (to the map's far corner: 55 cells, 27 s of slices between
the software renderer's slow frames; back again 1.3 s). A desktop keeps the cells' arrays after they are sent (85 MB of the page's, where it held 243), so a lost
context is still restored in place; a phone lets them go as before. `?map=whole` builds the map whole to compare;
`?map-near=`, `?map-mid=`, `?map-tall=` and `?map-step=` try other distances.

| Story, high tier, 1440 x 900 (`tools/upload_map.js`, llvmpipe) | Before | After |
|---|---|---|
| Vertex buffers sent before the title, by the loader's log | 283 MB | **125 MB** (44%) |
| WebGL's buffers at the title | 285 MB | 128 MB |
| The buildings' vertices | 4,910,630 | 1,858,855 |
| The buildings built in the Worker | 4.2-4.5 s | 2.6-3.0 s |
| Time to the title (three runs each) | 71, 72, 74 s | 74, 75, 76 s |

The time to the title did not move on the software renderer: there it is the shaders' compile (36 s of it) and the
first frames, and copying 158 MB more into llvmpipe's memory cost about a second. On a real GPU the 158 MB not sent
is a bus transfer and the driver's memory not taken; what that is worth on a mid laptop was not measured.

**Stills** (`tools/scramble_shot.js shibuya tools/views/story-standpoints.json`, 1440 x 900, at dusk and at 21:00):
the seven standpoints, the roof at the frame 4 stand looking at its relic and out over the city to the north-east and
east, from the air over the roof's west edge looking north, west and south, and four points along the flight down.
Before and after are the same pictures: from the roof and the air the mean difference is 2 levels in 255, with under
half a percent of pixels over 40, all in the far zone's lit windows; at the standpoints the differences are the crowd
and the screens' programmes at their moment. A phone's set is unchanged (the low tier's lean path, its level and its
district), so its stills were not taken again.

**A budget** (`tools/mem_check.js`, run by `tools/check.sh mem`): after the phone, the story is opened as a desktop to
its title and fails if the loader's log says more than **140 MB** of vertex buffers were sent (MEM_DESK), or if the
map does not come back whole under the player after a trip to the far corner. `DESK=0` leaves it out. The loader's
set is its own line (`buffers:`); a hero level's model comes behind the title, a minute or two later on a software
renderer, and its upload is logged apart (`late buffers:`) and listed, not counted: counted with the loader's, the
same page read 130, 142 or 156 MB by how long the check went on watching it (issue 159).

**Not checked:** a real GPU, Safari, WebGPU, a mid laptop's time to the title. Every number here is Chromium under
llvmpipe.

## The device's own numbers (November 2026)

The owner's Apple M3 played Shibuya at 5 to 20 frames a second with the governor at its floor (scale 0.6, no
extras, no multisampling), and at 59 only by day at that floor. Telemetry said the GPU held the frame; it could not
say which part of it. Two things came of that.

**The frame, part by part, on the player's device** (`web/game/perf.js`, `?perf` on a game's address, with
`?story=<map>` for the story's evening). Once the street is the player's and the camera has stood still for eight
seconds ("The frame budget, fourth round"), the page draws its frame
several times over, finished each time (`gl.finish` and a pixel read back), then again with one thing taken away
at a time: the post stack and each of its passes, the shadows, the screens' area lights, the wet street's mirror,
the weather, the multisampling, the scene at the governor's floor and at full size, every material flat (what
the geometry alone costs) and each top-level group of the scene. The table is shown on the page and sent with the
telemetry as a `perf` event. `tools/perf_scan.js` runs it here to see that it runs through; under a software
renderer its numbers say little. `tools/frame_cost.js` times one finished frame of a map at an hour and a weather,
with and without the area lights, for comparing two ways of drawing the same thing.

**The screens' area lights in closed form** (`web/neon.js` `lean()`). three.js evaluates a rectangular light with
linearly transformed cosines: two table lookups, a matrix and four clipped edge integrals, twice, for each of ten
lights at every lit pixel, by day as well (the lights are in the programs whether or not a screen is on). Here the
rectangle is the form factor A cos / (pi d^2 + A) towards its nearest point for the diffuse part, and Karis's
representative point with one GGX lobe for the specular (Real Shading in Unreal Engine 4, SIGGRAPH 2013); a light
that is off returns at once. Under the software renderer the lights' share of a rainy evening frame at the floor
went from 57 ms of 381 to 28 of 349, and stills of the scramble at 19:30 in rain differ by 5 levels in 255 on
average (`?arealight=ltc` brings three.js's own back). The two LTC tables are no longer bound either, which leaves
two more of an Apple or a phone GPU's sixteen texture units to a material's own layers. Not measured on a real GPU.

## A phone in the hand: thirty even frames (November 2026)

The owner's iPhone grew hot after a few minutes of the story. Its telemetry (version `0.1+b8aba51`, Safari 27, an
"apple gpu" reporting four cores): 34 to 43 frames a second over the opening, 17 to 20 in frames 1 to 3, every
piece `bound: gpu?` (slow, and not for the script's time); 13 to 28 ms of script a frame; 270 to 390 draw calls and
1.2 to 1.3 million triangles; the canvas 786 x 1390 (two device pixels to the point) and the governor at 0.65 to 0.95
of it with every extra shed. Its frame-rate cap was 60, so the governor asked for 60 until it gave up and asked for 30,
and the frames came as fast as the GPU could draw them: the GPU never idle, the CPU busy three quarters of each frame.

**A phone's cap is 30** (`game.js` `PHONE_FPS`: a touch device on a phone's set, quality.js `lean`), unless the
player picked one in the menu (Frame rate: 30, 60, the display's). Every second display frame is passed over at
once (`governor.due`), the governor aims at 33 ms from the start, and what a frame does not need of its 33 ms is
left idle: over the opening, a third to a quarter of the GPU's time. Where the frame takes longer than 33 ms the
cap changes nothing; what is drawn then decides.

What is drawn, at the story's first walk on a phone's set (here, the same view, triangles by top-level group; the
iPhone's own count was 1.27 million):

| What | Triangles | Draws |
|---|---|---|
| the far crowd, four of the scanned cast instanced (289 people, 1,000 to 1,360 triangles each) | 350,000 | 4 |
| the game's ground near the player, two fine tiles of the 5 m grid and two coarse | 240,000 | 4 |
| the hero level, in the squares in view | 116,000 | 17 |
| the district's buildings | 52,000 | 18 |
| the far land | 32,000 | 1 |
| the trains on the tracks beside the station | 73,000 | 5 |
| the rest (the night's lights, the trees, the props, the near people) | 378,000 | 217 |

The far crowd is the largest: a walker 60 m off is some 35 device pixels tall on that screen (about 400 pixels in
all) and drawn in 1,300 triangles, a triangle for every three pixels, which a phone's GPU shades in quads of four.

**The coarser copy (issue 61).** Each of the cast now has a second, coarser far copy (`pipeline/crowd_cast.py`
`COARSE`: 298 to 366 triangles against 1,000 to 1,406), drawn past 60 m from the camera as the lens counts it
(people.js `COARSE_M`, 4 m of slack either way) on the same picture and the same material, so the same program: a
second instanced mesh a cast member, each walker with a slot in both. The body is simplified across its texture seams
(meshoptimizer's `Permissive`), the head keeps its seams, and the hair cards, loose quads the simplifier cannot merge,
are cut to the largest of them. `tools/crowd_tris.js` counts what the cast's copies draw on a phone's set
(`?farcoarse=off` draws them all as the copy, as before):

| 390×844, low tier, 30 s | far crowd, before | after | the frame, before | after |
|---|---|---|---|---|
| the story's opening (467 walkers, all past 60 m) | 561,000 | 156,000 | 1,564,000 | 1,156,000 |
| on foot at the Scramble (`?walk=1`, 229 walkers, 10 to 18 past 60 m) | 276,000 | 265,000 | 1,050,000 | 1,037,000 |

On foot at the crossing most of the far crowd is between 32 and 60 m, where the copy stays. The file is 90 kB larger
(445 kB). `tools/coarse_film.js` films a walk across the crossing's diagonal, eye high, with the crowd staged ahead,
so that walkers come in from past 60 m to under it (desktop and phone, at dusk): frame by frame a walker keeps its
clothes, hair and height through the step, and no pop shows; stills from the helicopter's height, where every walker is the
coarser copy, read as the crowd did. The iPhone's own frame time waits for `?perf` on the device. The ground's fine tiles lie under the hero level's paving within its circle, where the paving hides them. Only
`?perf` on the phone itself (above) says which of these its GPU spends the frame on: not measured on a real iPhone.

Also found on the way: on the low tier the hero level's asphalt, crossings' paint, pavers and setts were drawn as a
rough metal (docs/HERO.md, "Streamed"), lit by the sky's reflection and not by a lamp; fixed.

## Sixteen texture units (issue 485, second round, November 2026)

The owner's Apple M3 MacBook, in Chrome and in Safari, kept logging over a week (telemetry, `event = 'error'`):
12 times `THREE.WebGLProgram: did not link (FRAGMENT shader texture image units count exceeds
MAX_TEXTURE_IMAGE_UNITS(16)); 20 materials, MeshStandardMaterial; 16 units; rung 1 to 2 (without floor)`, the last on
Blue Hour's own build of 20 November; 8 times `Shader Error 0 - VALIDATE_STATUS false`; and the consequences, `WebGL
refused, each frame: useProgram 0x502 x3 at RenderPass.js:165 < atmosphere.js:502` and `WebGL error 0x502 after a
frame` with every shadow map size and extras level. The "rung" in the first message is not the governor's: it is
the ladder of `glcare.js` `fit`, which, after a program had failed to link, compiled the materials that wore it again
without one more layer. So every load on an Apple GPU sent the ground's twenty tile materials to be linked with too
many samplers, every draw of them was refused for a frame or more (the 0x502s, whichever governor state the frame
was in), and then they came back without the parks' floors.

**What each sampler of the ground is for.** The ground (the photo-draped tiles, `game.js` and `world.js`) is the
material with the most; counted by `tools/sampler_probe.js` with `?units=16` before the change:

| sampler | what for | where |
|---|---|---|
| `map` | the aerial photograph | three.js |
| `envMap`, `dfgLUT` | the sky's reflection, and the table of its multiple scattering (every standard material reads it in r186) | three.js |
| `directionalShadowMap[0]` | the sun's shadow | three.js |
| `spotLightMap[0]` | the pattern of the player's car's headlamps (`cars.js` `beamPattern`) | three.js |
| `uMirror` | the wet street's reflection (`mirror.js`, the governor's `mirror` rung) | patch |
| `uNightMap`, `uGlowMap` | the street lights' pools, and the screens' light while they play (`night.js`) | patch |
| `uSkyVis` | how much of the sky the ground sees (`skyvis.webp`) | patch |
| `uWoods`, `uFloorMap` | the woods' mask, and the parks' own floors (earth, lawn, gravel) | patch |
| `uClip`, `uHole` | where the water and the walled channels cut the ground away | patch |
| `uOeOcc`, `uOeTrail` | the rain's cover under roofs, and the snow's tracks round the player (`weather.js`) | patch |
| `uSf` | the asphalt's and the concrete's surface (`surface.js`) | patch |
| `uStreet` | the street's paint and kerbs near the player (`game.js` `streetTexture`) | patch |
| `uShore` | the wet band along a shore (`water.js`) | patch |

Seventeen without the snow's tracks, eighteen with: the five of three.js's depend on the scene's lights (a second
headlamp's pattern, `?arealight=ltc`'s two tables, a spot light's shadow would add theirs), the rest on what the map
has.

**What was done.**

- *Merged:* the screens' light is in the alpha of the street lights' map (`night.js`): the same frame at a quarter of
  its resolution, drawn up into it, as brightness alone, with the screens' mean colour as a uniform. Shibuya's 21
  timed screens are near-white pinks and blues within a few percent of their mean, so the light on the street reads
  as it did (a still of the crossing at 21:00 beside one before). One sampler less in every material the street
  lights fall on: the ground, the walls, the piers.
- *Counted as it is compiled:* every material's `onBeforeCompile` is guarded (`glcare.js` `guard`, a property of
  three.js's `Material` that hands three.js a wrapper of each material's own function, its text the function's, so the
  program cache keys as before). The wrapper counts the samplers the program will have: three.js's from the program's
  parameters (each map, the environment's two, each shadow map and spot light pattern, the area lights' tables, a
  probe grid) and the patches' from the uniform lines they wrote, through their `#ifdef`s. A program over the GPU's
  units is compiled again, that program alone, a rung further down the layers' ladder (the snow's tracks, the parks'
  floors, the shore, the mirror, the surface, the woods: the least missed first), until it fits. Nothing is sent to be
  linked with more samplers than the GPU has, whatever lights the scene has, and no other material goes without the
  layer. The count errs high (a sampler declared and never read is counted), never low: the probe compares it with
  what every program linked with. The ladder after a failed link (`onShaderError`) stays as the net under it; a run of
  the checks that needs it fails.
- So on a GPU with sixteen units the ground has sixteen, and goes without the snow's tracks alone (it had gone
  without them and the parks' floors); with 32 (most desktop GPUs other than Apple's) it has every layer.

**Checked.** `tools/check.sh gl` plays the map as a GPU with sixteen units (`?units=16`: a program with more reads as
not linked, as on the M3). `tools/sampler_probe.js` walks noon, dusk and night, clear, rain and snow, and at each the
governor's three states (extras 1, 0.5 and 0: the weather's level, the mirror, the AO, the multisampling, the shadow
map's size and the crowd move together) and fails on a program over sixteen, one that did not link, one the page counted
lower than it linked, and any the ladder had to catch: 135 programs, the most samplers in one 16, none failed.
`tools/gl_error_probe.js` opens with the extras shed and multisampling on as a sixteen-unit GPU, walks the ladder down
and up by day and again in rain at night, and fails on any WebGL error or any failed link: none.

**Also found.** The two `Cannot read properties of undefined (reading 'reset')` were Open Earth's build on Vercel
(`people.js:589`, 14 November): a walker asked for a clip its rig had no action for. `people.js` `play` has fallen
back to the idle, or any clip the rig has, since 17 November; the other `reset()` calls ask for an action that exists
(`companion.js`) or call their own object's.

Not checked: a real Apple GPU, Safari, iOS, WebGPU. The vertex stage's units are not counted (no patch reads a
texture in a vertex shader; three.js's skinning, morph and batching textures are within any GPU's sixteen there).

## Every millisecond and megabyte on what the player sees now (issue 130, November 2026)

The owner's ask: from first principles, all the compute on the blade's edge; a picture that goes up while the frame and
the memory go down. Where it stood on real devices (three days of telemetry to 21 November): an iPhone at a median of
27 frames a second with 40% of its frames slower than 50 ms, held by the GPU 73% of the time, a frame of some 376
draws, 1.26 million triangles and 11 passes over 1.09 million pixels, four WebGL contexts lost in five minutes
(issue 118) and the GPU's memory at frame 5 at 269 MB of 270 (issue 105); an M3 at 59 frames a second with the
governor at its floor (scale 0.6), 13 passes over 3.9 million pixels and 29 ms of GPU a frame.

**The principle.** A frame's cost is set by what is in this picture at this moment, at the detail this picture can
show, and by nothing else: not the size of the map, not the number of things that exist, not what the last beat
needed. Memory the same (resident is what the next minute of play can show) and the download (what the first beat
shows comes before it). Three questions follow, asked of everything in a frame:

1. *Is it in the picture?* A thing behind a wall, on a roof seen from the street, behind the camera or under a
   pixel is not. Its triangles, its draw and its textures are owed nothing.
2. *How much of it can the picture show?* A triangle smaller than a pixel, a texel smaller than a pixel, a pass at
   a resolution finer than what it computes (occlusion, bloom, fog and a wet street's reflection are soft by
   nature) are paid for and not seen.
3. *Is it paid for once?* A pixel shaded and then covered, a target stored and loaded again between two passes, a
   pose worked out for a walker nobody sees, a texture kept after its beat: each is the same cost twice.

### What the frontier does, and what is taken from it

Surveyed 21 November 2026 (rendering in a browser, and what shipped games do within a fixed frame). What is adopted
is the design; no code was copied.

| Topic | What was found | Here |
|---|---|---|
| Hidden surfaces on a phone's GPU | Apple's GPUs remove hidden surfaces themselves: "if you only perform a depth pre-pass for performance, then hidden surface removal serves the same purpose on Apple GPUs... without any additional costs" (WWDC 2020, session 10632). Opaque first, then anything that discards, then the translucent; the opaque order does not matter there. Arm's Mali and Qualcomm's Adreno do reward front to back, and a `discard` stops both of their early rejections ([Arm](https://developer.arm.com/community/arm-community-blogs/b/mobile-graphics-and-gaming-blog/posts/hidden-surface-graphics-removal-methods-in-mali-gpus), [Mesa's notes on Adreno](https://docs.mesa3d.org/drivers/freedreno/hw/lrz.html)). | **No depth prepass**: on an iPhone it would shade 1.26 million triangles' vertices twice for nothing. Opaque sorted front to back as three.js does already; alpha-tested things kept after the opaque. |
| Passes on a tile-based GPU | Each render pass loads its target into the tile memory and stores it after; Apple: load and store actions "consume the majority of your app's system bandwidth". Meta measured a pass on an Adreno at 1216 x 1344 with 2x MSAA: 10.6 ms, of which 3.9 ms was load and store that could be avoided ([Meta](https://developers.meta.com/horizon/blog/loads-stores-passes-and-advanced-gpu-pipelines/)). | **Adopted as the first cost to cut on a phone**: fewer passes and fewer full-size ones, the soft ones at half size, targets invalidated when their contents are done with. The budget counts passes and the pixels they shade, per beat. |
| Triangles within a frame | Epic's guideline for mobile: at most 700 draws and 500,000 triangles in view ([Unreal Engine, performance guidelines for mobile](https://dev.epicgames.com/documentation/en-us/unreal-engine/performance-guidelines-for-mobile-devices-in-unreal-engine)). Virtualised geometry in a browser exists on WebGPU only ([Scthe/nanite-webgpu](https://github.com/Scthe/nanite-webgpu), MIT; no streaming, no skinning). On WebGL 2: three.js's `BatchedMesh` (per-object culling, multi-draw), [agargaro/instanced-mesh](https://github.com/agargaro/instanced-mesh) (MIT: per-instance culling, a BVH, levels of detail), meshoptimizer's simplifier (MIT, already in the pipeline). | **A level of detail by projected size for every kind of thing**, built in the pipeline with meshoptimizer, chosen by the height in pixels a thing has on this screen; a phone's beat aims at Epic's half million. The draws are within the guideline; the triangles were 2.5 times over it. Nanite-like clusters: not taken (WebGPU only, and the level is small enough for discrete levels). |
| Resolution | three.js has a temporal upscaler (`TAAUNode`) and FSR 1 (`FSR1Node`) for its WebGPU renderer. FSR 1's two passes (EASU, RCAS; AMD, MIT) run on WebGL 2 (Babylon.js ships it). Arm's ASR (MIT, from FSR 2) is the temporal one on phones. | The governor's render scale is kept. A sharpening upscale when the scale is under 0.8 is the candidate, to be judged on the devices (it costs a pass, and a pass is what a phone is short of). |
| Lights | three.js's tiled and clustered lighting are WebGPU only; no measured gain was found under some tens of lights. | **Not taken.** The ten screens' lights are in closed form already ("The device's own numbers"); the street's lamps are a baked map. |
| Texture memory | A 4096 x 4096 RGBA texture with its mips is about 90 MB on the GPU whatever its file's size; block formats cut that four to eight times ([Don McCurdy, 2024](https://www.donmccurdy.com/2024/02/11/web-texture-formats/)). iOS gives a tab no fixed limit; context loss is reported there without growth, too. | ASTC on a phone is done ("A phone's pictures in ASTC blocks"), and BC7 and BC5 on a desktop ("A desktop's pictures in blocks": 1.25 GB of textures in frame 1 to 535 MB). What a beat leaves behind: the same section. |
| Crowds | Past a hundred skinned meshes the cost is the skeletons' update on the CPU; bone matrices baked to a texture with instancing is the standard answer (GPU Gems 3, chapter 2). | The far crowd is instanced from baked poses already (issue 475); the near cast stays skinned. |
| Shaders at load | `KHR_parallel_shader_compile` is exposed by Safari, but compiling is reported to block there still (WebKit bug 251514). | Programs are compiled behind the loading plate ("The loader's compile"), never counted on to be asynchronous. |
| WebGPU | Safari 26 ships it on iOS, Chrome on Android since 121. three.js's WebGPU renderer is slower than its WebGL one with many separate meshes (682 against 2,562 meshes at 60 frames a second in one comparison, [ICS, 2025](https://ics.media/en/entry/250501/)). | **Not moved to.** At 400 draws it buys nothing by itself; its worth would be compute culling and a temporal upscale, to be measured on one beat before any move. WebGL 2 stays the path every device has. |
| Budgets | Studios play their levels through every night and collect what each costs (Epic's Automated Performance Tests). | **Adopted**: below. |

### A budget for every beat

Until now the budget was one number for the map (`tools/mem_check.js`: a phone's GPU memory at one place). Now every
beat of the episode has its own, on a phone's tier and a desktop's.

- **Counted where the story is played.** `tools/story_play.js` with `BUDGET=file` counts, at every still it takes, the
  still's own frame (`tools/beat_count.js`; the harness draws that one whole, so the count costs a play no frame more): draw calls, triangles, full-screen passes (as the telemetry counts
  them), the pixels shaded at least once (every pass's target, and every target the scene is drawn into: the canvas
  itself is 1), and what WebGL holds (`tools/gl_mem.js`: textures, buffers, renderbuffers). `BUDGET_BY=1` adds what
  was drawn, by name; `BUDGET_TOP=n` the largest textures and buffers held.
- **A beat is one of the episode's frames** (and the title); its cost is the heaviest of its stills, measure by measure
  (of what a frame draws, the second heaviest: work done once, the mirror's warm-up drawing the scene again as the game
  settles, falls in whichever frame it falls in, and a cost that stays shows in more stills than one). A still's frame
  is the heavy kind of frame: the wet street's mirror and the rain's cover map are drawn in it.
- **These are the page's own asks**, so they are the same under this machine's software renderer as on a GPU, and they
  are what the telemetry reports from a device (`draws`, `tris_k`, `passes`, `px_k`): the session's counts and the
  owner's iPhone's agree (here 390 to 520 draws and 1.3 to 1.7 million triangles a beat; there 376 and 1.26 million).
  What a frame costs in milliseconds only a device says.
- **The check.** `tools/budgets/shibuya.json` holds each beat's ceiling. The story's own check counts its stills and
  fails a beat over the desktop's budget; `tools/check.sh budget` plays the episode as an iPhone (390 x 844 at three
  pixels to the point, the low tier) and fails a beat over a phone's (main's checks run it for every change to the
  page). A budget is set a little above what the beat costs (`tools/beat_budget.py set`: 12% over for draws and
  triangles, which differ from play to play with the crowd; 3% for memory; none for passes) and goes down as the
  work lands. It only goes up on purpose, with the reason in the commit.

**The budgets as first set** (21 November, main at `e48d974`; each beat's cost with the room above it: what was
counted is 12% under these for draws and triangles, 3% for memory).
Counted on a session's machine (Chromium on Mesa's software renderer), which changes none of these counts; the phone
is an iPhone emulated (its size, three pixels to the point, its user agent, touch), without ASTC, so its textures are
weighed uncompressed as `tools/mem_check.js` weighs them. The script's time is this machine's, a guide only, and is
not held to a budget.

phone (390x844, the low tier, canvas 760 x 1644):

| beat | draws | triangles | passes | pixels shaded, canvases | textures | textures, MB | buffers, MB | GPU memory, MB | script, ms |
|---|---|---|---|---|---|---|---|---|---|
| title | 216 | 0.95 M | 11 | 2.41 | 106 | 145 | 49.4 | 198 | 15.7 |
| frame 1 | 440 | 1.63 M | 13 | 4.51 | 318 | 202 | 88 | 296 | 28.9 |
| frame 2 | 582 | 1.83 M | 13 | 4.51 | 323 | 203 | 89.1 | 297 | 30.7 |
| frame 3 | 529 | 1.63 M | 13 | 4.51 | 334 | 205 | 90.1 | 300 | 34.4 |
| frame 4 | 460 | 1.47 M | 13 | 4.51 | 354 | 219 | 103.5 | 329 | 55 |
| frame 5 | 895 | 1.59 M | 13 | 4.51 | 354 | 219 | 103.5 | 329 | 38.3 |
| frame 6 | 492 | 1.78 M | 13 | 4.51 | 366 | 211 | 101.2 | 318 | 47.9 |
| frame 7 | 973 | 2.68 M | 13 | 4.52 | 383 | 211 | 97.5 | 314 | 46 |

desktop (800x500, the high tier, canvas 800 x 500):

| beat | draws | triangles | passes | pixels shaded, canvases | textures | textures, MB | buffers, MB | GPU memory, MB | script, ms |
|---|---|---|---|---|---|---|---|---|---|
| title | 329 | 2.02 M | 17 | 4.38 | 137 | 683 | 132.3 | 846 | 29.8 |
| frame 1 | 759 | 3.07 M | 19 | 6.48 | 761 | 1288 | 174.8 | 1496 | 60.7 |
| frame 2 | 833 | 3.17 M | 19 | 6.48 | 771 | 1289 | 182.3 | 1504 | 93.8 |
| frame 3 | 845 | 2.96 M | 19 | 6.48 | 786 | 1299 | 183.3 | 1515 | 99.4 |
| frame 4 | 746 | 2.78 M | 19 | 6.48 | 805 | 1375 | 196 | 1605 | 122.2 |
| frame 5 | 1072 | 3.08 M | 19 | 6.48 | 818 | 1375 | 196.8 | 1605 | 88.1 |
| frame 6 | 836 | 3.23 M | 19 | 6.48 | 830 | 1315 | 196.9 | 1546 | 112.3 |
| frame 7 | 2392 | 8.10 M | 19 | 6.77 | 857 | 1310 | 189.5 | 1533 | 107.6 |

**What the first count found**, largest first:

- *A phone's memory is not what one place holds; it is what the story has left behind.* `mem_check.js` puts the
  player at frame 5's place and reads 266 MB. Played from the title, the same phone holds 253 MB as frame 1 opens,
  296 by frame 4 and **320 MB at frame 4's lift and through frame 5**: fifty megabytes over the budget the check
  held it to, in the frames where the owner's iPhone lost its context. Nothing a beat brings is given back.
- *Depth of field costs two more full-size passes and two full-size targets, and the targets are kept for good.* A
  conversation's shot, the camera raised, a print and the flight all blur by depth (a third of a play's stills). The
  frame then draws the bloom's merge into one full-size half-float target, the blur into a second, and the lens to the
  canvas: on a phone 4.29 canvases of pixels shaded against 2.29 without it, and 19 MB (two targets of 760 x 1644)
  that stay after the first conversation; on a desktop at 2560 x 1440, 59 MB.
- *A desktop holds 1.25 GB of textures in frame 1* (1.45 GB of GPU memory in all), none of it in blocks.
- *Triangles by what they are*, a phone's mean of 1.32 million a still: the ground's tiles 256,000 (19%, most of them
  under the hero level's paving); the far crowd 165,000 (12%); the guide dog 113,000 with its guard hairs (8.5%, one
  animal); the roof kit 72,000, the same in every still of the play (never culled); the trains 100,000. A desktop's
  mean of 2.72 million: the roof kit 430,000 (16%, on roofs the street cannot see), the wet street's mirror 250,000
  more (the scene drawn again at a third of the size), the dog 120,000, the far land 127,000 in one draw.
- *Frame 7 in the rain draws the scene three times.* On a desktop a still's frame there is 7.2 million triangles and
  2,135 draws: 3.0 million for the picture, 2.9 million again for the wet street's mirror, a target of 267 x 167
  pixels (sixty triangles a pixel; every other frame), and 1.2 million for the rain's cover map, 256 x 256, seen from
  above (weather.js: every half second while it rains). On a phone, which has no mirror, the cover map alone adds
  0.9 million triangles to a frame of 1.45 million, into 128 x 128 pixels: one frame in fifteen two thirds heavier.
- *Passes.* A phone's eleven are the scene, ten small ones of the bloom (a quarter of the size and down) and the
  lens: 2.29 canvases in all, already lean. A desktop's seventeen to nineteen shade 4.2 to 6.2 canvases.

**The order of work**, by what was counted: the depth of field's passes and targets; the scene drawn again for the
rain's cover and the mirror, from what a picture of that size can show; what a beat leaves behind in a phone's memory; the triangles nobody can see (the roof kit from the street, the ground under the paving) and the
ones no screen can show (the dog, the far crowd, the trains by projected size); a desktop's textures in blocks.
Each lands by itself with its beats' numbers before and after, and the budgets come down with it.

**On the devices** (what a session cannot measure: a GPU's milliseconds). After each release:

1. iPhone: open the story, play into frame 1 until the world has stopped, add `?perf` to the address (with
   `?story=shibuya` for the story's evening), stand still for a minute; the table appears on the page and is sent
   with the telemetry as a `perf` event. The same on the M3 in Chrome and in Safari.
2. `python3 tools/slo_report.py --posthog --days 3`: "the levels by release" sets each version's frame rate, slow
   frames, GPU and script time, draws, triangles and passes side by side, by device; a release is better when its
   phone rows show fewer slow frames at the same or a higher governor scale, and no `gl_lost`.

### The depth of field in one pass (issue 130, the first cut)

A conversation's shot, the camera raised, a print and the flight blur by depth (`atmosphere.js` `camFx`; a third of a
play's stills). With it on, the frame drew the scene, the occlusion and the bloom together into one full-size
half-float target (`lens.js` `merge`), blurred that into a second, and the lens read the second: two full-size passes
and two full-size targets more than a frame without it, and the targets, made at the first conversation, were kept
for good.

Now the blur reads the scene itself (`camFx.merged`): each tap is rolled off as the merge rolled it off and shaded by
the occlusion (the pixel's own with the depth-aware upsample; a neighbour's as the occlusion's texel has it, which
under a blur reads alike), and the bloom's sum, soft already, is added after the blur. One pass, one target; a pixel
in focus is what the merge made it. Eight seconds after the last frame that needed it the target is let go. Any other
tail (the opening's animated lens, a film's own pass) draws as before.

`tools/dof_compare.js` holds the walk at 19:30 in photo mode and draws the same frame both ways
(`composer.camFxPasses`, or `?camfx=two` on the address):

| the same held frame | passes | pixels shaded, canvases | full-size targets | GPU memory while on | after |
|---|---|---|---|---|---|
| a phone (760 x 1644, the low tier), before | 13 | 4.29 | 2 | 260.7 MB | 260.7 MB (kept) |
| after | 12 | 3.29 | 1 | 244.0 MB | 241.7 MB (let go) |
| a desktop (1440 x 900, the high tier), before | 19 | 6.17 | 2 | 1104 MB | kept |
| after | 18 | 5.17 | 1 | 1084 MB | let go |

The picture: on the phone's page the two ways differ by 0.93 levels of 255 on average, where the old way drawn twice
differs from itself by 0.92 (the film's grain); the largest difference of any channel is 17. On the desktop's page
4.6 against 3.7 (the screens play on between the two draws). Stills of both are side by side in the branch's report.
Measured on a session's machine (the counts and the megabytes are the page's own; the milliseconds a full-size pass
costs an iPhone or an M3 are for `?perf` and the telemetry to say).

### The rain's cover map: what stands still is kept (issue 130, the second cut)

While it rains the game keeps a map of the tops of things from straight above, 80 m square round the camera
(`weather.js` `occRT`: 128 x 128 on a phone, 256 x 256 on a desktop), so that no drop falls under a roof and the
ground is dry there. It was drawn whole every half second of rain, and whenever the camera had gone four metres: the
ground's tiles, the buildings, the hero level, the roofs' kit, the trains. At the Scramble that is 660,000 triangles
and 345 draws on a phone into 16,384 pixels, in one frame of every fifteen, on top of a picture of 1.45 million; on a
desktop 1.07 million.

Almost none of it moves. What stands still (the shadows' cache's mark, `userData.shadowStatic`, and
`userData.oeStill` for the ground's tiles, the far land and the lamps, which cast no shadow) now has a map of its own
(`occStill`), drawn when the map's place changes and every six seconds (for what the map round the player has built
or let go). Each time the map is due, that one is copied, colour and depth, and what moves (the cars, the trains, a
door) is drawn over it. The map keeps its place while the camera stays within two metres of where it was set; set
afresh at every draw, as it was, a camera's sway moved it a texel each time. `?occ=whole` draws it whole as before.

`tools/rain_cover.js` holds the walk at the Scramble in the rain and draws the map three ways from one place:

| each time the map is due | draws | triangles | the map against the whole |
|---|---|---|---|
| a phone, whole, as before | 345 | 659,000 | |
| a phone, the moving over the map kept | 86 | 111,000 | no texel differs |
| a desktop, whole, as before | 220 | 1,074,000 | |
| a desktop, the moving over the map kept | 118 | 297,000 | no texel differs |

Standing in the rain for ten seconds of the game's time, the map is due nineteen times; the still things are drawn
once where they were drawn nineteen times. Walking, the still things are drawn again every two metres (a second and
a half on foot), where the whole was drawn every half second. The picture is the same by construction: the three maps
are compared texel by texel (height and cover) and must not differ. What is left in the moving pass on a phone: the
trains (57,000), and instanced things nobody has marked as still (45,000). A still's frame in the story's check is
usually a frame that draws the still things too (the play has just put the camera somewhere new), so frame 7's budget
does not show this; the harness's count does. Measured on a session's machine; the counts are the page's own.

## A desktop's frames: hitches, Safari and a tier step (issue 184, November 2026)

The owner's ask: the device is the bottleneck, and the desktop stutters. Measured first, from the owner's own plays
(the telemetry's `time` and `jank` events, 17 to 22 November 2026, GitHub Pages and Vercel hosts):

- **Chrome on an Apple M3, high tier** (851 x 881 CSS px at 2x): 59 frames a second, but the 95th-percentile frame
  29 to 42 ms, and the governor holding the scene at **0.45 to 0.56** of its resolution with **every extra shed**
  (`shed` 2) for hours. 1.9 to 2.2 M triangles, 350 to 610 draws, 13 passes. (`gpu_ms` reads 40 to 70 at 59 frames a
  second, which a GPU cannot do every frame: Chrome's timer query on ANGLE's Metal is not taken at its word here.)
- **Safari on the same Mac, high tier** (1241 x 903 at 2x): 10 to 26 frames a second, `slow` up to 100%, **28 ms of
  script a frame** (Chrome on the same machine: 1 to 16), 4.5 M canvas pixels, 555 to 690 draws, the tier never
  stepped down.
- The long frames the browser reported were the game's `frame` (script 160 to 560 ms in it) on foot, in the story
  and on the title.

### What held the M3 down: hitches taken for load

The governor's measure was a moving average of every frame. A frame held up by the page's script (a model arriving,
pictures sent to the GPU, the garbage collected) weighed as much as a scene too heavy for the GPU, and each was a
step down; the way back up waited half a minute and doubled at each failure. Modelled in `tools/governor_unit.js` (a
scene that costs 4 to 13 ms, through vertical sync, with hitches of 60 to 140 ms):

| hitches (share of frames) | before: scale/extras after 10 min | after |
| --- | --- | --- |
| 1% | 0.70/0.5 | 1.00/1 |
| 3% | 0.45/0 | 1.00/1 |
| 6% | 0.50/0 | 1.00/1 |

The measure is now the mean of the last 48 frames with the hitches left out: a frame over 2.5 times the median (and
over 40 ms), at most one in six (`quality.js` governor, `robust`). A frame that misses one refresh (33 ms among 17s)
is the scene's and still counts, so a device between two steps settles as before; every earlier case of the unit
check holds. Pixels cannot buy back a hitch; the hitches are spread at their source (below).

### The hitches at their source

`tools/walk_hitch.js` (`PLAY=1 STACK=1`, the high tier at 1440 x 900, 45 s from the press of Play; it now names the
draw and the page's frames behind each large upload, and counts a nine-argument `texSubImage2D` by its width and
height, not by its y offset and width):

| | before | after |
| --- | --- | --- |
| largest pictures (≥ 512 x 512) sent in one frame | 13 | 2 |
| the near trees' fifteen bark scans | uploaded in the first frames that drew them (31.5 to 32.7 s) | one a frame, ahead (`trees.js` `send`) |
| the canals' walls (`inland_wall`) | uploaded by the shadow pass that first took them in (29.7 s) | ahead, one a frame (`world.js` `uploadRest`) |
| the far aerial tiles (1000 x 1200) | four in one idle moment, each waiting on idle time of its own | the shared queue, one a frame (`sendTex`) |

The shared queue (`world.js` `upload`) now takes a picture a draw has already sent without spending a frame on it, so
the sweep of what is in the scene and not yet drawn (`uploadRest`, a desktop's, after its late models) costs only the
pictures that need it. What is left in the first minute is the warm-up's own compiles (the hero level's and the
people's programs, compiled in slices by `world.js compile` and waited on by a draw that came first: `alu_fin`,
`ginza_joint`, seconds each on a software renderer); a follow-up.

### Safari

Safari's WebGL crosses to the GPU process on every call, and its ANGLE on Metal resolves a multisampled half-float
target slowly; the owner's Mac drew there at a third of Chrome's rate with five times the script a frame. A Mac's
Safari (WebKit's own engine, told from its user agent; the renderer string is masked as "Apple GPU") now starts on
**medium** with **no multisampling** (the lens's sharpened upscale and grain hide the edges): at 1241 x 903 the canvas
is 2.4 M pixels instead of 4.5 M, the scene's budget 2.4 M instead of 3.7 M, the shadow map 2048, half the far woods'
crowns and 18 of the people's models instead of 28. If that is still too much, the tier step below takes it to low.

### A tier step, not only a scale

When the governor has nothing left to give (its floor, every extra shed) and the frames still miss their target for
eight seconds, or come under twenty a second for six whatever it holds, or it has sat at its floor for twenty, it asks
for a tier down (`onTier(-1)`); after a minute held at its ceiling with every extra in a tier below the device's own,
for one back up. The game applies the new tier's canvas, scene budget, multisampling and shadow map at once
(`game.js`, `gov.onTier`), and the rest of the tier (the world's set of details, the woods, the cast) from the next
load, which starts on the tier this one ended on: `bh-tier-<map>` in localStorage, how many tiers below the device's
own, and how long the next climb waits (a minute, doubled to sixteen by each climb that fails within two minutes).
Never below low, never a phone's (its level is quality.js `level()`), never a tier the visitor chose. Each step is a
`tier_step` event in the telemetry. Checked in `tools/governor_unit.js`: a device under twenty frames a second at its
floor is a tier down in thirty seconds and at low in two minutes, and climbs back once the scene is light; a fast
device, a hitchy one and one settled below its ceiling keep their tier; the ladder in storage, with a faked desktop
context, goes high → medium → low and no lower, back up, and waits twice as long after a climb that failed.

### Not checked here

A real GPU, Safari and its user agent's detection on the owner's Mac, and a Mac in Low Power Mode (where Safari may
hold requestAnimationFrame to 30 a second; the governor then aims at 60 and finds nothing fits). A software renderer
gives counts (uploads, compiles, programs), not a GPU's milliseconds. The numbers to read next are the owner's: the
`time` events' `scale` and `shed` on the M3 in Chrome (expected at or near 1.00 and 0), and `tier`, `fps` and `cpu_ms`
on Safari.

## A phone's frame halved (November 2026)

The owner's ask: a basic playable game on a weaker device first, from first principles: do less, and only what is needed.
The owner's iPhone on foot at the Scramble (build 0.1.233): 27 to 34 frames a second, 40% of frames slow, 1.34 to 1.37
million triangles, 412 to 454 draws, 11 passes, and its WebGL context lost often (issue 118). The aim: half of that.

**Measured first.** `tools/phone_frame.js` opens the page as an iPhone (390 x 844 at three pixels to the point, touch, its
user agent, the low tier), counts the title's frame and then the walk on foot by Hachiko facing four ways, each by what
was drawn (`BY=1`; tools/beat_count.js), with a still of each. `tools/story_play.js BUDGET_GROUPS=n` does the same at
every still of the story; `tools/beat_compare.py` sets two plays' counts side by side. Main, on foot at dusk:

| what (main, on foot by Hachiko, the heaviest way) | triangles | draws |
|---|---|---|
| the game's ground, four fine tiles of the 5 m grid drawn whole and the far tiles | 304,000 | 8 |
| the far crowd, the scanned cast instanced | 154,000 | 8 |
| the near walkers, the speaking cast and the guide dog | 123,000 + 125,000 (the dog, in the story) | 47 |
| the trains round the station | 104,000 | 40 |
| the roofs' kit (stair huts, tanks, plant) | 72,000 | 7 |
| the near and mid trees | 78,000 | 30 |
| the traffic, its full model within 35 m | 37,000 to 78,000 | 4 to 30 |
| the Stop's leaves and pigeons (the story), drawn twice | 116,000 | 16 |
| the buildings round the player | 58,000 | 43 |
| the hero levels | 24,000 to 34,000 | 65 to 84 |

**What was done**, each where the player cannot see the difference:

- *The ground near the player is cut into squares* (game.js `fineTile`, world.js `chunkGeo`): a fine tile is a kilometre
  of ground drawn as one mesh, never out of view. In squares of 240 m, each over the tile's shared vertices with its own
  bounds, the frustum leaves out what is behind the camera and the visibility sweep what the walls hide (the squares
  are gated, visibility.js). 264,000 triangles became 26,000 to 54,000. The grid is also drawn with only the triangles
  its shape needs (world.js `gridLod`: a quadtree of blocks that lie within 5 cm of the surface their corners span,
  crack-free; the far tiles, drawn only past 260 m, within 0.3 m). Shibuya's 5 m grid has the street's own relief, so
  that alone took a tenth to a fifth. `?groundchunk=off`, `?gridlod=off`. The far tiles cut into squares were tried and
  undone: 33 draws for 36,000 triangles where whole they are 3 for 54,000.
- *The far crowd's coarser copy from 24 m on a phone* (people.js `coarseM`, 60 m elsewhere): a walker 24 m off is some
  110 device pixels tall at full scale and 65 at the governor's 0.6; its copy's 1,000 to 1,400 triangles were a
  triangle to every pixel, the coarser copy's 300 one to every three. Nobody is drawn past 260 m by the lens (`farM`).
  The near walkers drawn whole stay ten (issue 174).
- *The guide dog's body in a lighter index over the same vertices* (pipeline/lod_index.mjs, `akita.lod.json`; companion.js
  `leanBody`): 20,000 triangles of 90,000 within a thousandth of his size, posed by the same skeleton; his guard hairs
  (31,500 triangles of cards) only within 7 m of the camera. blender/build_dog.py writes the index after its build; a
  model built without it is drawn whole.
- *The Stop's leaves and pigeons drawn once* (stopfx.js): three.js draws a two-sided translucent thing twice, back faces
  then front; a leaf is a card. On every device: 58,000 triangles and 8 draws fewer. A phone has two thirds of them.
- *The roofs' kit only from a camera above the street* on a phone (game.js, `Wd.roofKit`): from the street it is behind
  the parapets, and its instanced meshes, each over a cell of the map, were never out of view.
- *The traffic's full model within 12 m, its third past 70 m* on a phone (actors.js; 35 and 110 m elsewhere); *the
  trains' far copy past 15 m and none past 350 m* (trains.js; still heard); *the trees' full model within 80 m and their
  hero model within 14 m, a dozen at most* (trees.js; 130 m, 24 m and 40 on the low tier).
- *Two passes fewer*: the bloom's three levels on a phone, not four (atmosphere.js), the widest level's share given to
  the three kept. 11 passes became 9.
- *Late uploads and compiles in 12 ms slices on a phone* (world.js `sliceMs`; 25 to 50 ms before): iOS draws every tab's
  WebGL and plays the page's sound in one GPU process (issue 166).
- *A smaller or older phone starts at the lightest set* (quality.js `first`): 3 GB or less, or a screen of 700 points or
  less on its long side (an iPhone SE). It climbs from there a level a minute held, as every phone does.

**Before and after**, the iPhone emulated on a session's machine (the counts are the page's own; the GPU memory is
WebGL's as tools/gl_mem.js weighs it, the pictures uncompressed):

| 390 x 844, low tier | triangles, main | this | draws, main | this | passes | GPU MB |
|---|---|---|---|---|---|---|
| the title | 919,000 | 520,000 | 214 | 207 | 11 > 9 | 197 > 191 |
| on foot by Hachiko at dusk (four ways) | 1,108,000 to 1,180,000 | 646,000 to 660,000 | 358 to 383 | 352 to 373 | 11 > 9 | 236 > 234 |
| the story's frame 1, at its Stop | 1,592,000 | about 1,000,000 | 396 | about 380 | 11 > 9 | 255 > 248 |

What is left over the aim (600,000 triangles and 250 draws on foot): the draws are the hero levels' squares (65 to 84,
one a material and a square), the buildings' cells (43), the trains (40) and the near people (50, three meshes each);
the triangles the near people (120,000, each 8,000 in full at any distance), the far crowd (100,000) and the far tiles
(60,000). These are the follow-up (issue in the tracker: a lighter index for the near people past a few metres, the
hero levels' squares merged by material on a phone, the trains' far cars in one mesh). Not measured on a real iPhone:
its frame time and whether its context still goes are for the telemetry to say after the release.

### The room over a reading, and what one code reads twice (issue 130, 22 November)

Main went red on a phone's frame 7 at 304.2 MB over a ceiling of 304. Nothing heavy had landed: the ceiling had been
set three percent over one play's reading after a cut (`--down`), other sessions' work had each added a megabyte or
two under it, and the same code played again reads that beat anywhere in two megabytes (296.7 to 298.6 in three plays:
what the browser has collected yet, which of the cast are near). The last megabyte tripped it, and it would have been
whichever change came next. A ceiling nearer to its reading than the reading is to itself is not a budget. The rules
now (`tools/beat_budget.py`):

- **A reading is the median of several plays of the same code** where there are several (`set a.jsonl b.jsonl ... phone`),
  and how far they lay apart is kept with the budget (`noise`, beside `at`, the reading itself).
- **The room over a reading** is the largest of: the measure's share (12% for draws and triangles, 5% for the pixels
  shaded, 3% for memory); a floor (8 MB of memory, 100,000 triangles, 30 draws, a tenth of a canvas); and three times
  the noise (two megabytes and 60,000 triangles are assumed where only one play was read). Passes have no room: a
  pass more is a pass more.
- **Memory near its ceiling is said before it is over** (`near frame 7: GPU memory 299 of 305`, within twice the
  noise): not a failure, a line in the check's log for whoever is adding to that beat, so that the room is seen to go.
- **Over is over.** A change that takes a beat past its ceiling pays for it in that beat, or sets the budget on purpose
  from plays of its own code with the reason in the commit. Raising one number by hand to get past a run is neither.
- **After a cut** the budgets come down with `--down` from the plays that measured it, by the same rule: the room is
  the rule's, not what the cut happened to leave.

### What the faces left behind (issue 130, 22 November)

A phone played from the title held 297 MB at frame 7 where the same phone opened at frame 7 held 266. The difference,
listed by `BUDGET_TOP` (every texture WebGL holds, a still at a time): 55 three-dimensional textures more, 0.46 MB
each. They are the textures three.js makes of a mesh's shapes (its morph targets) the first time it is drawn with
them: the speaking cast's faces (`face.js`). A face is drawn from a still geometry and given one with its shapes only
while it moves ("The speaking cast's faces"), and letting it go was to dispose that geometry, texture and all. But a
head whose vertex data is interleaved shared its buffer with the still geometry, and for the still one's sake was
never disposed: each time such a face moved, rested and moved again it made a new geometry and left the last one's
texture behind. Played through, frame 6 alone left sixteen.

Now a live geometry has attributes of its own over the same arrays, interleaved ones included, and is always
disposed; and a face no longer chosen is put to rest where the faces are chosen (`game.js` `faceChoose`), not at its
rig's next animation, which someone gone from the scene never has. The sky light's map also gives back the depth
buffer three.js draws it with (2.3 MB at 768 x 1024, read by nothing once the map is made: `world.js` `envSpare`).

| a phone played from the title, GPU memory | frame 1 | frame 4 | frame 6 | frame 7 | shapes' textures at frame 7 |
|---|---|---|---|---|---|
| before (main at `04097a4`) | 268 MB | 311 MB | 299 MB | 297 MB | 80 |
| after | 259 MB | 293 MB | 278 MB | 272 MB | 0 to 4, those of the faces moving |

So the faces cost what the picture shows of them: at most four textures, 2 MB, for the one speaking, the one
listening and the nearest. (The owner asked whether a weak phone should go without the faces' shapes altogether:
with the leak gone that would give back 2 MB and still the face in a conversation's close shot, which is where a
phone's screen shows a face at all; so the faces stay, and the nearest walkers' are the first to go if a megabyte is
wanted.) Counted on a session's machine as an iPhone emulated; the megabytes are the page's own asks of WebGL.

## Load time and the slowest interaction (issue 186 A, issue 191's first item, November 2026)

The launch review's service levels missed on three counts (PostHog, Blue Hour's pages, 21 to 22 November): load to
ready p75 **17.0 s on a desktop** (target 10) and **21.3 s on a phone** (target 20), and the **slowest interaction per
page load p75 844 ms** (target 200; 592 over 7 days). The load's stages at p75, desktop and phone, in seconds from the
view's start: fetched 2.35 / 3.98 · decoded 2.71 / 4.14 · built 8.97 / 14.36 · first frame 16.86 / 21.17 · ready
17.02 / 21.28. So the download is not it: the game's set-up after decoding (6 s / 10 s of main thread) and the loader's
warm-up from "built" to the first frame (8 s / 7 s) are.

**Which interaction.** The telemetry kept only the slowest interaction's duration, not what it was. Read against the
page loads' event order, nearly every slow one fell in the first half-minute after the title's tap into play (`mode`
`menu → foot`, `start: true`), beside a 2.7 to 3.5 s long frame in `game.js:frame`; the rest in the minutes after it, on
long frames of the same kind. `tools/entry_cost.js` on this machine found the cause: the tap's frame drew the stopped
air's leaves (`stopfx.js`, an instanced two-sided see-through Lambert), whose programs no warm-up had finished, and the
draw linked them, 5.5 s of `getProgramInfoLog` on the software renderer. Their warm-up (`stopfx.js` `warm`) waits for the
hero level round the start, so a player who taps before the level is in (an iPhone, a slow network) draws them cold. The
phone tier showed the same with `tools/load_probe.js`: three programs linked by a draw after the tap, 1.7 to 2.0 s
waiting on their logs.

**A draw does not wait for a program** (`world.js` `gate`, issue 191 item 1). With `KHR_parallel_shader_compile` a
program compiles and links off the page's thread, and only a question about it (three.js reads its log on first use)
waits until it is done. The world's draws now go through a check first: a draw whose material has a program still being
linked is left out of that frame and drawn in the first frame after it is ready (10 s at most: past that it is drawn and
waited for as before); a mesh whose own material has no program at all is compiled once the frame is done, for the render
target and clipping planes it was drawn with, and left out until then, once (a draw with a material the mesh does not own,
a pass's `overrideMaterial`, is drawn as before: compiling the mesh would never make that one, and the first cut of the
gate held such a draw for good).
Only the world scene and the shadow pass go through it (a post pass's quad is never left out: its frame would be black),
and `uploadBuffers` passes it by (a slice marks every mesh's buffers sent).

*Issue 205: what is on the screen stays on it.* The first cut held every draw of a material while any one of its
programs was linking, so a new variant of a material long on screen (a warm-up for another target or count of lights, a
cube's or a photograph's first draw of it) took it off the screen while that variant linked: with a GPU played slow
(`LINKLAG=400`) the Ginza level's paving, the guide's coat and a speaker's head were gone for seconds. Now a draw is held
only for a mesh never drawn yet whose material has no program ready; once drawn, a mesh is always drawn, and a variant
still linking is waited for as three.js does (a hitch, not a hole). The gate looks only at draws into the frame's own
targets (the canvas and the post stack's; `targets` from `game.js`), so a picture that is kept (a level's reflection cube,
the rain's cover map, the story's photographs) is drawn whole whenever it is taken, and the shadow pass is no longer gated
(its map is cached). `window.__gate.n.kept` counts the draws the first cut would have left out of a drawn mesh, and
`LINKLAG=ms` in `tools/load_probe.js` as in `tools/story_play.js`. Frame 1 played with `LINKLAG=400 STILLS=1 DRAW=30`
on a desktop: whole in all 29 stills; to the title, the gate held 6 never-drawn draws (4 before) and took none off. Without the extension nothing changes. The
loader goes on a frame the gate left nothing out of (at most 1.5 s more: on the software renderer here, where a link takes seconds and a frame 1.4 s, a 4 s bound held the loader 4.7 s past the first frame; the phone tier waited 0.5 to 0.8 s), so nothing comes in under the title; the page's
log says when it waited (`warm: the loader waited ...`). `?gate=0` turns it off, to measure against. Measured with
`tools/load_probe.js` on the phone tier (390 x 844, two runs each): programs a draw linked in the 8 s after the tap
**3 → 0**, the time waiting on program logs then 1.7–2.0 s → 0.9–1.5 s (what is left is three.js's diagnostics on each
program's first use, kept: they are how the telemetry caught the 16-texture-unit link failure), 18 to 20 materials
compiled after their frame instead of in it.

**The set-up's compile, three at a time on a desktop.** The early warm-up (`game.js` `earlyWarm`) kept one program in
flight while the set-up ran (issue 327: on a GPU that compiles one at a time, the set-up's own synchronous calls waited
behind the queue). A desktop whose GPU compiles in parallel now keeps three in flight through the set-up (`setUpFlight`;
a phone keeps one, `?flight=1` for one everywhere). Desktop tier, two runs each: the loader's programs ready 17.1–17.6 s
after built against 19.8–21.0, the first frame 43–47 s against 46–52, the set-up no slower.

**What a real device will say.** The software renderer here is GPU-bound in every frame (a desktop frame 1.4 s, of it
50 ms of script), so its interactions measure its frames, not the page's work, and its load is three to six times a real
desktop's. The telemetry now says what was slow on the devices themselves (version 8): each `time`'s slowest
interaction with what was pressed (`inp_on`), the event, and its split into the wait for the page, the handlers and the
paint after them; and on `load` the warm-up's parts (`warm_prog_ms`, `warm_tex_ms`, `warm_buf_ms`), which split the
8 s from built to the first frame. `tools/slo_report.py` prints both. Read them after the next deploy before the next
cut: a long `inp_paint` with short handlers is a frame slow to draw after the press; a long `warm_buf_ms` is the 131 MB
of the city's vertex buffers (`buffers:` in the page's log).

**The set-up's CPU, measured, not yet cut** (desktop tier on this machine, decoded to built 12 to 13 s, inclusive time):
`OEWorld.create` 2.7 s, setting the clock and the sun (`setSun`, the sky's environment drawn again) 1.35 s,
`nav.withoutFine` 1.0 s and `nav.create` 0.9 s, `decks.plan` 1.0 s, `night.create` 0.7 s, `surface.copy` 0.5 s. On a
phone's tier the same order, half the size. Each second here is about half a second on the owner's M3 (6.3 s set-up at
p75) and more on a phone; they are the next place to cut (issue opened with this).

**The set-up's fixed work, baked (issue 194, item 2).** On the owner's M3 the set-up keeps the main thread busy 5.4 s of its
6.9 (`tools/load_probe.js`, `GPU=metal`), and of that the decks' plan, the two networks' sweeps and the collision reads under
them were 1.6 s. They are a function of the map's data alone, and the title draws what they make (the decks' meshes; the crowd
and the traffic walk and drive the networks), so they could not wait for the first frame. They are computed once instead, by
the page's own set-up run in a browser (`tools/bake_setup.js`, `?bake=1`), and kept beside the packs as `setup.bin` (the
values as gzipped JSON: the decks' runs and pieces with their columns cleared, the road and footway lines handed to
`OEActors.network`, the road lines the first sweep gives one lane, the second's fit per street), one for the whole map and one
for a phone's district (`d/setup.bin`: a phone computes its networks from the cut map, and the result differs). The set-up
reads them (`game.js`, `bakeIn`, `BK`) and computes as before when there is none, or one of another `BAKE_V`; `?bake=off`
computes, to measure against. The benches are still computed (their seats point at their bench, which a file cannot keep).

What keeps it right: the static checks fail on a bake stale against the packs it was made from (`game.bin`, `buildings.bin`,
`landmarks.bin`) or against `BAKE_V` (bumped when what the set-up means by them changes), and `pipeline/pack.py` bakes again
after it packs (a run of `pipeline/district.py` alone leaves `d/` without one, and the check says so). The code it runs is not
hashed (five sessions edit it at once): `tools/check.sh`'s mem target (played wherever the set-up's code changes, as it loads the whole page) loads the page computing and compares it with the
bake field by field, and a change that changes the result fails there ("rebake with `node tools/bake_setup.js`").

Measured on a session's machine, two runs each, `?bake=off` against the bake: the fixed work 2.7 to 3.0 s → 0.03 to 0.1 s on
the desktop tier and 1.0 s → 0.012 s on the phone's; "built" 18.4 → 16.3 s on the desktop tier. The phone's "built" did not
move here (8.1 → 8.2 s): the saved time went into `setSun`'s first draw waiting on the software GPU, busy with the early
warm-up's compile (1.7 s waited there against 0.6), and the first frame here is held by the compile on both tiers (46 s either
way on the desktop's). On the M3, where the set-up is the CPU's and the programs are ready 0.5 s after built, the 1.6 s
should come off "built" and the first frame; the next deploy's telemetry and a run on the M3 will say. The download: 1.1 MB
for the map, 0.28 MB for a phone's district.

### The one you play: the head's and the hair's pictures at a phone's size (issue 130, 23 November)

By whose each texture is (`BUDGET_TOP`'s `owners`: every texture a material holds, by the names up its mesh's parents),
the heaviest person on a phone was the one you play: the head's picture and the hair's at 1024 a side and the head's
relief, 12 MB, where each of the cast's is 1 MB (`people.js` `smaller`: 512 a side on a phone, 256 on the lighter
levels; "the characters you play keep theirs"). A phone's canvas is 760 pixels wide; the player's face is 300 across
at its nearest, in a talk's two-shot, and from behind, where it is for most of the game, it is hair. So on a phone the
head's and the hair's pictures go up at 512 a side, at every level; the clothes' picture, seen large from behind all
through the game, stays at 1024 (it was tried at 512: the jacket's weave went soft).

`tools/hero_face_shot.js` sets the camera before the player's head on a phone's page, at a talk's distance (1.6 m)
and nearer than any shot goes (0.7 m), with the pictures as they come (`?herotex=full`) and at the phone's size: at
1.6 m the two are not told apart; at 0.7 m the skin is a little softer and the jacket the same. The player's head and
hair: 12 MB of the GPU to 4, in every beat. Counted on a session's machine as an iPhone emulated.

## Draws: one a material, not one a square (issue 192, November 2026)

The owner's telemetry over a week (`tools/slo_report.py --posthog --days 7`): sixteen visitors of twenty on an iPhone,
playing at a median of 32 frames a second with a third of the frames slower than 50 ms, at about 400 draws, 1.3 M
triangles and 11 passes a frame, GPU-bound three quarters of the time; a Mac's Safari at 10 frames a second. "A
phone's frame halved" took the triangles and two passes; the draws stayed (352 to 393 on foot by Hachiko). In WebKit
every WebGL call crosses to the GPU process, so a draw there costs its binds, its uniforms and the call, whatever it
draws: 84 draws of a hero level's squares for 30,000 triangles cost what 84 draws of anything cost.

### What runs in a browser today, and what was taken

| technique | where it is from, licence | taken? |
|---|---|---|
| `BatchedMesh`: many geometries of one material in one buffer, each with a matrix, culled by itself, drawn by one `multiDrawElementsWEBGL` | three.js r186 core, MIT | **yes**: the hero levels' squares, the canals' walls, the trains' cars (`web/batch.js`) |
| `WEBGL_multi_draw` | the extension BatchedMesh draws with. Safari 15 and later on iOS and macOS (WebKit bug 219139), Chrome; not Firefox, where three.js draws the parts one by one, as before | yes, through BatchedMesh |
| merged static geometry (`BufferGeometryUtils.mergeGeometries`) | three.js, MIT | no: one draw but nothing left out by the frustum, and a level's 149,000 triangles would all be drawn where 47,000 are seen |
| texture arrays or an atlas, so that several materials are one | (a technique; three.js `DataArrayTexture`, MIT) | not yet: it changes how each material is sampled and filtered (the paving's anisotropy, the joints at an atlas's seams), so it is a change to the picture and wants its own stills. It is what would take the hero levels and the landmarks from a draw a material to a few |
| BVH culling and levels of detail for BatchedMesh and InstancedMesh | `@three.ez/batched-mesh-extensions`, `@three.ez/instanced-mesh` (agargaro), MIT | no: a level has a few hundred squares, tested against the frustum in microseconds |
| octahedral impostors | `octahedral-impostor` (agargaro), MIT | no: the far trees are impostors already ("The far trees as impostors"), the far crowd the scanned cast's copies |

Not known from here: whether ANGLE on Metal runs a multi-draw as one Metal call or a loop of them inside the GPU
process. Either way the page makes one call and one set of binds where it made dozens, which is the cost WebKit adds.
An ANGLE report (issue 8566) has multi-draw slow on Metal with `flat` shading; nothing here is flat-shaded.

### What was done

- **A hero level's squares of one material are one draw** (`hero.js`, `batch.js` `merge`). The Scramble's level is 486
  meshes of 21 materials; each material's squares are now one BatchedMesh, each square with its own matrix (a
  meshopt-packed position is in its node's units) and its own bounds, so the frustum leaves out what it left out
  before. Same triangles, same materials, same shaders with three.js's batching variant. Done after the paving has been
  read from the squares (`game.js` `heroCover`). `?batch=off` draws every mesh as it was.
- **The rain's cover map draws a batch**: its own shader reads the batch's matrices (`weather.js` `occMat`), and a batch
  is not taken for a thing that draws its own pass.
- **The trains' cars of one material are one draw** (`trains.js` `poolsOf`, `batch.js` `pool`): a stock's three bodies,
  each near and far, were an instanced mesh a material each; now a material's shapes of every body share a buffer, a car
  is a place in the pool given its shape and matrix each frame, and a car out of view is left out (before, none was).
- **The canals' walls, copings, rails and beds** a draw a material across the bodies (`inland.js`).
- **The counters count a multi-draw as one draw** with the triangles of all its parts: the telemetry's sampled frame
  (`telemetry.js`) and `tools/beat_count.js`.

### Before and after

The iPhone emulated on a session's machine (`tools/phone_frame.js`, 390 x 844, the low tier, dusk; the counts are the
page's own asks of WebGL, a multi-draw one draw):

| | draws, main | this | triangles, main | this |
|---|---|---|---|---|
| the title | 198 to 207 | 195 to 209 | 455,000 to 477,000 | 455,000 to 472,000 |
| on foot by Hachiko, four ways | 357 to 393 | 253 to 286 | 577,000 to 651,000 | 535,000 to 601,000 |
| of which the hero levels | 71 to 121 | 43 to 52 | 47,000 to 66,000 | the same |
| of which the trains | 40 | 0 to 18 | 29,000 to 36,000 | 0 to 11,000 (those in view) |

GPU memory: a batch holds its whole level's vertices from its first draw, where the squares were sent as each was
first seen, so they are packed as they go in (`batch.js` `packer`: a normal in three 16-bit numbers, a level's baked
light, all of it in 0..1, in four; 34 bytes a vertex for 48). On foot by Hachiko the emulated iPhone holds 226 MB
where with every square a mesh (`?batch=off`) it holds 232; behind the title, where only what the camera had passed
was held before, 200 MB for 189. Positions stay floats: packed to a square's own box, two squares' shared edge would
be rounded two ways and could show a seam.

The same views with the batches on and off (`tools/ab_shots.sh out '&batch=off'`: on foot, from 8 m and from 80 m, at
dusk, at night and in rain, at 1440 x 900 on the high tier and 390 x 844 on the low) show the same picture, the rain's
wet paving under the level's canopies included.

### The buildings' cells in one draw (issue 192, second step)

The cells of the map round the player were a mesh and a draw each: 205 held on a phone by Hachiko (418,000 vertices,
239,000 triangles), 27 to 45 of them drawn in a frame, all of one material. They are streamed (swapped for another
level of detail as the player moves), hidden cell by cell by the visibility sweep, and on a phone their arrays are
let go once sent (19 MB of vertices and 3 MB of indices that the page then does not hold). A BatchedMesh keeps every
vertex in the page's memory to add to its buffer, so it would not do. `batch.js` `arena`:

- **One buffer an attribute, the GPU's alone** (`THREE.GLBufferAttribute`): a cell's arrays are written into it with
  `bufferSubData` as the cell comes, its range is given back as it goes (first fit, joined to its neighbours), and a
  full buffer is grown by a tenth over what is asked through a copy on the GPU (`copyBufferSubData`). Room is made
  once for a batch of cells. Writes go through `COPY_WRITE_BUFFER`, so no vertex array's state is touched.
- **Drawn through three.js's own multi-draw path**: the arena's mesh says it is a batch (its matrices one identity:
  every cell stands where it is), and before each pass it lists the index ranges of the cells to draw. With
  `WEBGL_multi_draw` that is one call; without it three.js draws the ranges one by one, as many draws as before
  (measured with the extension hidden, `NOEXT=WEBGL_multi_draw tools/phone_frame.js`: 42 draws of cells, the same picture).
- **The sweep and the frustum as before**: a cell's mesh is still made, undrawn and out of the scene, and gated by
  the visibility sweep as it was (`world.js` `onCell`, unchanged): the arena draws a cell while its mesh is on the
  layer every camera sees, and inside the frustum of the pass being drawn (the view's, the shadow map's, the rain's
  cover).
- **A lost context**: on a phone the cells are the GPU's alone and the page loads again, as it did
  (`tools/glcare_phone.js` passes with the arena in); on a desktop the arena makes its buffers again from the cells'
  arrays (`tools/gl_restore_probe.js`: restored, no call refused, the buildings back in the frame after).

What it found on the way: WebGL keeps index buffers apart from the rest by their first binding and will not copy one
kind into the other. The arena's index buffer, grown through a copy into a buffer first bound elsewhere, lost every
cell it held, and from 80 m up blocks of buildings were not drawn. It showed only in the stills with the batches on
and off; nothing counted it. A grown index buffer is first bound as an index buffer.

| emulated iPhone, on foot by Hachiko, four ways | before (main, 23 November) | with the cells in one draw |
|---|---|---|
| draws | 258 to 288 | 242 to 260 (and 291 where the player's parked car is in view) |
| of which the buildings' cells | 27 to 45 | 1 |
| GPU memory | 212 MB | 213 MB |

### What is left

- **The player's car parked by the Scramble** (since the first drive landed): about 77,000 triangles and 40 draws
  in a phone's frame when it is in view, its full model with a physical material.
- **The landmarks and the hero levels, a draw a material** (25 and 20 by Hachiko): an atlas or a texture array, above.
- **The near people, three draws each** (body, head, hair), 38 to 50 a frame; who is drawn whole and at what detail
  is issue 174's and issue 130's (a level of detail by size on the screen), not this section's.
- **Instanced meshes with nothing in them** (38 by Hachiko: the trees' and the traffic's sets with a count of 0) make
  no draw call but are still given their program and uniforms each frame; hidden while empty they would cost nothing.

### Not checked here

A real iPhone, Safari on iOS or macOS (whether its ANGLE makes one Metal call of a multi-draw; the frame time at
all), and WebGPU. The counts are a software renderer's, which are the page's own asks; the milliseconds are the
telemetry's to say after the release: `draws` on "apple gpu" expected near 260 on foot where it read 402.

**The budgets hold it** (`tools/budgets/shibuya.json`, a phone's beats): the draws and triangles of every beat came
down to what the story's play on this code read plus the rule's room (the measure's share, the floor, or three times
what main's own plays lay apart): frame 1 held to 368 draws where its ceiling was 452, frame 4 to 399 for 683, frame 5
to 521 for 892, frame 7 (whose plays lie 162 apart: which walkers the rain has near) to 1,038 for 1,412. The memory's
and the pixels' ceilings are left as the work on issue 130 set them.

## A desktop's pictures in blocks (November 2026)

A desktop held 1.25 GB of textures in frame 1, none of it in block formats ("A budget for every beat"). Listed by
what wears each (`tools/story_play.js` `BUDGET_TOP`, which now names a texture's slot and the line that made it):
650 MB were colour pictures from files (the landmarks' four atlases 139 MB, twenty ground tiles 122, the cast's
bodies and heads at 5.3 MB each, the trees' leaves, the hero level's surfaces), 125 MB colour drawn on a canvas (the
roofs' photograph 77, the streets' paint 49), 44 MB normal maps, 21 MB packed roughness and metalness, and the rest
not pictures: two shadow maps of 64 MB, the night's light map, masks, render targets.

**What was surveyed** (23 November 2026; what is adopted is the design, no code was copied):

| Way | What was found | Here |
|---|---|---|
| KTX2 with Basis Universal, shipped | three.js r186's `KTX2Loader` (MIT) transcodes UASTC to ASTC 4x4, else BC7, else ETC2, and ETC1S to ETC2, else BC7 mode 5, with Binomial's `basis_transcoder.wasm` (Apache-2.0; 527 KB, 245 KB gzipped). ETC1S is 0.3 to 3 bits a texel on disk at low to medium quality; UASTC 8 bits a texel, made smaller by RDO and Zstandard, and is what Khronos' KTX Artist Guide gives for normal maps, packed channels and detailed colour. Basis 2.x adds XUASTC and XUBC7 (about 2 bits a texel), which r186's loader does not read. The transcoder never targets BC5: a two-channel normal map ships as raw BC5 with an EAC or ASTC twin for Apple and phones. ([KTX2Loader r186](https://github.com/mrdoob/three.js/blob/r186/examples/jsm/loaders/KTX2Loader.js), [Basis Universal](https://github.com/BinomialLLC/basis_universal), [KTX Artist Guide](https://github.com/KhronosGroup/3D-Formats-Guidelines/blob/main/KTXArtistGuide.md)) | **Not taken.** The trial at the top of this file stands: ETC1S softens a photograph and smears a sign (27.7 dB), UASTC is three and a half times the download of the JPEG it replaces, and this project's pictures are WebP and AVIF inside models and beside them. Two of the largest are drawn on the device (the roofs' photograph, the streets' paint) and cannot be shipped at all. |
| Encoded on the GPU as it loads | Ludicon's spark.js encodes BC1, BC5, BC7, ETC2 and ASTC in shaders on WebGPU and WebGL 2. Its shaders are under its own licence: free below US$100,000 of revenue with a visible credit, paid above ([spark.js](https://github.com/Ludicon/spark.js), [its licence](https://www.ludicon.com/sparkjs/eula.html)). | **Not taken**: not open source, and a credit on the page is the owner's to give. |
| Encoded on the device in a Worker | What a phone already does for ASTC ("A phone's pictures in ASTC blocks"): the files stay, the download does not grow, and every picture goes the same way whatever made it. | **Adopted for a desktop**, in BC7 and BC5. |
| Which blocks a desktop decodes | BC7 (`EXT_texture_compression_bptc`) on 99.7% of Windows, 85% of macOS and 93% of Linux browsers; BC5 (`EXT_texture_compression_rgtc`) the same and a little more; ASTC on 1.9% of Windows and 92% of macOS ([Web3D Survey](https://web3dsurvey.com/webgl2/extensions/EXT_texture_compression_bptc)). Apple Silicon decodes both families (Apple's Metal feature tables); an Intel Mac BC only. | BC7 where it is offered, else ASTC, else the pixels as before. |
| Android without ASTC | 99.8% of Android's WebGL 2 browsers offer ASTC (the same survey); what is left is GPUs of 2013 and 2014. | **ETC2 not written**: a phone without ASTC keeps its pixels, as before. |
| A normal map in two channels | three.js works a normal's blue out of its red and green when the map's format has two channels (`USE_PACKED_NORMALMAP`, since r184; BC5 among them). | **Adopted**: a model's normal maps as BC5. |

**The encoder** (`web/bc7.js`, in the Workers `web/tex.js` already keeps). BC7 has eight block layouts and a block
names its own; three are written. Mode 6 (one line through the block in four channels, endpoints of 7 bits and a
shared bit, a 4-bit step a texel) takes every smooth block: a sky, a wall, a face. Mode 1 (two lines, the texels
divided by one of 32 of the format's patterns, 6-bit endpoints, a 3-bit step) is tried for an opaque block one line
fits badly, from the three patterns nearest to how the first line divided it: a sign's letter in one colour beside a
ground of another. Mode 5 (colour and alpha each on a line of their own) takes a block of a cut-out whose alpha does
not follow its colour. BC5 is a block of eight values for red and one for green. A line is the principal axis of its
texels, refined once by least squares against the steps chosen, as the ASTC encoder's is; the mipmaps, the colour
bled under a cut-out and the quality floor (33 dB, 27 for alpha: under it a picture keeps its pixels) are the ASTC
path's own. No code was taken: the layouts are the Khronos data format specification's.

`tools/bc_check.py` (with `tools/check.sh astc`) encodes with the page's encoder in Node and decodes with Pillow's,
which is not ours: 2,560 made-up blocks that force each layout and every pattern decode to within a fifth of a
decibel of the encoder's own count; a dusk sky's gradient comes back with no texel more than one step of 255 from
what it was (mean 0.32: no band); and this project's pictures at their own size:

| Picture | BC7, opaque | as a cut-out (colour, alpha) | Phone's ASTC, for comparison |
|---|---|---|---|
| a ground tile | 45.5 dB | 36.4, 34.1 | 39.6 |
| the signs' atlases (`atlas`, `scramble`, `yongen`) | 44.1, 44.0, 47.0 | 39.4 to 41.8 | 35.6 to 47.8 over all pictures |
| the screens' programmes | 45.1 | 40.2, 41.8 | |
| the far trees' leaves | 46.1 | 39.2, 40.9 | |
| a body of the cast | 47.9 | | |
| a normal map as BC5 | 52.0 in red and green | | not packed |

**What is packed on a desktop**: everything a phone packs, at its full size (`world.js` `leanDown`, the far tiles,
`farcity.js`'s towers), and a model's tangent-space normal maps where nothing else wears the same picture. **What is
not, and why**: the packed roughness, metalness and occlusion (three unrelated channels on one line: 21 MB, the next
candidate, as BC7 with two lines or as two BC4); the trees' bark normals (swapped in after the game opens: a
two-channel map is another program, so a compile in play; 27 MB); masks read by the pixel (`woods`, `shore`: 28 MB,
which could be one channel); data textures, canvases drawn again, render targets and shadow maps.

**Three things a desktop's path met that a phone's had not.** WebGL takes a BC texture only where its top level is
whole blocks (ASTC has no such rule): the roofs' photograph is 4096 x 3682, so a side is drawn at the multiple of
four under it (a third of a percent at most). A texture already sent as pixels cannot become blocks in the same
storage: `wear()` lets the old one go first. And `neon.js` reads the screens' programmes by the pixel for the light
they throw: a picture in blocks has no pixels on the page, so the Worker hands back a copy 512 on a side for it
(`userData.thumb`).

**A software renderer keeps its pixels.** Mesa's llvmpipe offers BC7 and decodes it a texel at a time as it samples:
a drawn frame went from 1.7 s to 9.7 s here. So where the renderer names itself software (`tex.js` `on`), nothing is
packed unless `?tex=bc7` asks; the checks' plays are as they were, and a count in blocks is asked for with
`Q='?tex=bc7' STILLS=0 DRAW=1000` (the page's asks of WebGL are counted, not rasterised). `?tex=raw` turns it off
anywhere, and the telemetry's events carry `bc: 1` where it is on (`astc: 1` on a phone, as before).

**Before and after**, the episode played on the desktop tier (800 x 500, the high tier; `Q='?tex=bc7' STILLS=0
DRAW=1000 BUDGET=...`, against the same play unpacked; a session's machine, where the megabytes are the page's own
asks of WebGL and so are a GPU's):

| beat | textures, MB | GPU memory, MB |
|---|---|---|
| frame 1 | 1239 -> 535 | 1438 -> 734 |
| frame 2 | 1236 -> 532 | 1443 -> 738 |
| frame 3 | 1247 -> 538 | 1454 -> 745 |
| frame 4 | 1355 -> 592 | 1578 -> 814 |
| frame 5 | 1357 -> 594 | 1580 -> 816 |
| frame 6 | 1269 -> 552 | 1488 -> 771 |
| frame 7 | 1270 -> 547 | 1482 -> 766 |

At the title on 1440 x 900: textures 660 -> 356 MB, the peak 858 -> 553 MB; 182 pictures packed, 142 million texels
into 181 MB of blocks, none left under the floor (the worst 35.6 dB). What a desktop still holds in frame 1 that is
not blocks: the two shadow maps (128 MB), the night's light map and the masks (58 MB), the unpacked channels above,
render targets. A phone's formats are untouched: its numbers are the budgets' own.

**The load.** The encoder writes 10 million texels a second on one core of a session's machine (a 2.3 GHz Xeon;
`tools/bc_encode.js`), so a desktop's 190 million with their mipmaps are some twenty core-seconds there, spread over
up to four Workers (`tex.js` `crew`: the cores less two), beside a main thread that is building the map meanwhile.
On this machine, where the software renderer has the same four cores, the title came at 54 s unpacked and 103 s in
blocks (`tools/load_tex.js`): a guide to nothing but this machine. On a GPU the pixels' upload and the mipmaps the
GPU made of them (1.2 GB) are no longer asked for, and the blocks are sent as they are. Which of the two is the
greater on an ordinary desktop is **not measured here**: the telemetry's `bc: 1` splits load-to-ready by it, and
`?tex=raw` is the comparison on one machine. If the first visit is slower, the next step is to keep the blocks
(Cache Storage, by a hash of the pixels) so that a second visit encodes nothing.

**Stills**, 1440 x 900 on the high tier at dusk and at night, `?tex=raw` beside `?tex=bc7`
(`tools/scramble_shot.js` with `QUERY=`; the Scramble from its middle, from Hachiko and from the cafe): the static
signs (HIKARIDO, the green board's kana and its small line, the bookshop's four characters, the subway's small
type), the leaves and the paving are the same at three times their size, and the sky has no band (it is drawn, not a
picture; the encoder's own gradient is held by `tools/bc_check.py`). The pairs differ by the screens' and the crowd's
moment.

**Not checked**: a real GPU (the decode is the GPU's own; Pillow's and llvmpipe's agree with the encoder), Safari and
its `EXT_texture_compression_bptc`, an Apple Silicon Mac (it offers BC7 and ASTC; BC7 is taken), WebGPU (the page is
WebGL 2), and the load's seconds on any of them.

### What a beat leaves behind

Listed the same way (a texture no material in the scene wears, by the line that made it), a desktop's play leaves:

- *The probe of frame 4's glass.* SKY STAGE's glass mirrors a cube taken from the roof (`hero.js` `probeOf`); three.js
  makes a sky-light map of that cube for the glass (768 x 1024 in half floats, 6 MB) and lets it go when the cube's
  texture says it is disposed. Letting the level go disposed the render target, which does not say so: the map stayed
  from frame 4 to the last card, with the generator's second target of the same size beside it. `drop()` now disposes
  the texture too: 6 MB back on a desktop (0.7 on a phone, whose cube is 64). The generator's own second target is
  three.js's and is kept by it (6 MB, once).
- *The cast.* 172 to 283 MB of bodies and heads that nobody on the street wears at the moment (143 to 179 pictures):
  the templates the crowd is cloned from and the rigs waiting in its pool (`people.js` `lib.tpl`, `free`). They are
  worn again as walkers come near, so they are a cache, not a leak; in blocks they are 43 to 71 MB. Which of them a
  beat will not ask for again (the speaking cast of a frame that is over) is the next cut, and it is the people's
  sessions' file: an issue, not this branch.
- *The levels* are already let go as the story leaves them (frame 4's roof: 64 MB back as frame 5 opens).


### The hole over the channels: a distance needs half the texels (issue 130, 23 November)

The largest single texture a phone held that no file names was 3345 x 1891 texels of one byte, 6.3 MB: the ground's
hole over the walled channels (`inland.js` `holeMask`), a signed distance to the walls' faces at half a metre over the
box of every walled channel in the district, which is a few strips of river in a box 1.7 km wide. A distance, filtered,
follows a straight wall as closely from metre to metre as from half metre to half metre: it is linear there. So on a
phone the mask is sent at half the size, each texel the mean of four, 1.6 MB; the raster that walking and the terrain
read is as it was (`?holemask=full`: whole, to set beside).

`tools/hole_shot.js` puts a phone's player beside the open Shibuya river and takes stills from 14 m over them looking
each way and down, with the mask whole and at half: along the walls, at the channel's corner and under the coping
the two are not told apart; no ground over the coping, no gap. 4.7 MB less in every beat on a phone. Counted on a
session's machine as an iPhone emulated.

## Vertices at the size the picture needs (issue 130, 23 November)

**Where frame 4's megabytes were.** A phone opened at frame 4 (the roof) holds what a phone played to it from the
title holds, 290 MB: nothing there is left over from earlier beats, the place itself asks for it. `tools/story_play.js
BUDGET_TOP=n` now says whose every megabyte is (`geo`, the scene's vertex and index buffers WebGL holds, by the two
outermost names over each mesh; `own`, the textures by whose material wears them; `loose`, what no material in the
scene wears: the targets, and anything left behind). Of frame 4's 99 MB of buffers: the map's own (buildings, ground,
landmarks) 39, the hero levels 21, the cars 20, the guide dog 6. A phone's pictures are in ASTC blocks on the device
and uncompressed in this count (Mesa's software renderer has no ASTC), so on an iPhone the buffers are the larger
half of what is held: they are what to cut.

**What a vertex was.** The models' files keep every attribute as 32-bit floats (pipeline/meshopt_glb.mjs: "so the
code that reads the geometry is unchanged"), and they were sent to the GPU so. A hero level's vertex was 48 bytes:
a position (12), a normal (12), a texture coordinate (8) and the baked light (16). The GPU needs a unit normal as
three signed bytes (half a degree at worst, exact along an axis, which a street's walls and paving are), the baked
light as half floats (it runs to 40, so not bytes), a skin's four weights as sixteen bits each, a painted colour as a
byte a channel. `web/verts.js` (`OEVerts.lean`, `row`, `compact`) rewrites the attributes a caller names after its
own code has read them and before the geometry is first drawn, so the float copy never reaches the GPU. Bytes go in
rows of four: a vertex buffer's stride is a multiple of four on Metal, which every Apple GPU is behind. The design
is the one `KHR_mesh_quantization` and gltfpack (MIT) apply in the file; done on the page here, so the files and the
code that reads them stay as they are. No code was taken. `?verts=raw` leaves everything as the file has it.

| what, on a phone at frame 4 | buffers before | after | how |
|---|---|---|---|
| the Scramble's level | 12.7 MB | 8.7 | normals in bytes, the baked light in half floats (hero.js) |
| the roof's and Miyamasu's | 3.9 and 3.3 | 2.7 and 2.3 | the same |
| the guide dog | 6.0 | 2.7 | normals, weights and colour (companion.js); on a phone only the vertices his lighter index uses (`compact`): the body 3.1 MB to 0.7 |
| the traffic's models | 5.5 | 3.6 | normals in bytes; the tone, the part and the occlusion, a float each, as one row of four bytes (actors.js) |
| a car someone gets into | 2.65 | 0.57 | its parts were split with a corner for every triangle, three to six times the vertices its file has: each part's own vertices once, under an index (cars.js) |

The guide dog is also left out of the rain's map of what is under cover, as people are: he was 55,000 triangles of
a 128-pixel map each time it was made.

| a phone played from the title, GPU memory | frame 1 | frame 2 | frame 3 | frame 4 | frame 5 | frame 6 | frame 7 |
|---|---|---|---|---|---|---|---|
| before (main at `9b2fbe1`) | 263.6 MB | 264.0 | 265.3 | 291.8 | 280.4 | 276.1 | 270.3 |
| after | 247.9 MB | 247.2 | 250.2 | 274.5 | 263.1 | 260.1 | 255.5 |
| of which buffers, before and after | 86 > 71 | 88 > 71 | 88 > 73 | 101 > 84 | 100 > 83 | 95 > 79 | 92 > 77 |

Frames 5 and 6 are under 270; frame 4 is 4.5 MB over it still. What it holds that the others do not: the roof's
level and Miyamasu's beside the Scramble's (all three are in the picture when the lens looks down from the east
glass), the helicopter (3.4 MB) and a second full-size target while the camera is raised (9.5 MB).

Stills of frame 1 and frame 4 on a phone and frame 1 on a desktop, each beside the same build with `?verts=raw`:
the levels' shading, the cars and the dog are the same; the pairs differ by the crowd's moment. Counted on a
session's machine as an iPhone emulated; the megabytes are the page's own asks of WebGL. Not checked: a real GPU
(that Metal takes the rows of four as they are sent is the reason for them, and unproven here).

## The same encoder, written twice (issue 130, 23 November)

The desktop's BC7 above was written in two sessions at once; this one's landed second and was taken out for the
one above. What its own measure adds: decoded by SwiftShader's decoder in the page (a real GPU's path, where the
section above used Pillow's and Mesa's), a single-subset mode 6 gave an aerial tile 44.8 dB, the landmarks' atlas
38.1 and a character's body 47.7, the encoder's own count the decoder's to a tenth of a decibel; and the story's
first frame on the high tier in BC7 alone, without the normal maps' BC5, held 791 MB where the section above holds
734. The lesson is the working rule's: fetch and read the branches in flight again before each new part of a long
session, not only at its start.

## The frame's script by system (issue 130, 23 November)

`PROFILE=<still>:<seconds>` on `tools/story_play.js` writes a CPU profile; `tools/profile_parts.py` sums it by
whose script it is. A phone's page in frame 1 with the crossing running (the job's beat, thirty seconds, frames not
drawn, so this is the script alone; a session's machine, so the shares compare systems, not devices):

| whose | share of the frame's script | the heaviest in it |
|---|---|---|
| the crowd and the traffic (`actors.js`) | 36% | the traffic's update 8%, the crowd's 5.5%, a plaza's step 5.3%, a walker's walk 4.8% |
| the near people (`people.js`) | 19% | the arms' clearance (`sliceAt`, `clrAsk`) 9%, placing 3%, the lean 2.5% |
| three.js | 13% | `updateMatrixWorld` 4.4%, matrices 1.6%, the traversal 1.4% |
| the browser | 11% | `getBoundingClientRect` 7%: the finder's box read from the page's layout every frame (`story.js` `finderRect`) |
| the game's frame (`game.js`) | 8% | |
| collision, the ways, the junctions | 7% | |
| garbage collection | 1.3% | |

Two things it says. The simulation runs whole at the picture's rate: the traffic and the crowd are half of a
phone's script, and what of them is out of sight could step at half the rate. And the finder's box: with the
interface changing every frame, reading two boxes from the layout lays the page out again each time, 6% of the
script while a camera is up. Keeping the box for a tenth of a second was tried and undone: the camera then no longer
came up on the thing when raised (the story's check, frame 1). It wants the box worked out from the lines' own
numbers, not measured.

## What is left of issue 130

- **Level of detail by projected size**: not started in this round. The largest case is the near people (some
  120,000 triangles of a phone's frame, each drawn whole at any distance: a lighter index over the same vertices,
  issue 192), then the roofs' kit from above (72,000 triangles, never culled) and the works' hoardings (33,000).
- **A phone's frame 4**: 274.5 MB against 270 by this round alone; with the head's and hair's pictures at a phone's
  size (above) the budget's own play says where it stands.
- **A desktop's pictures in blocks**: what is left is issue 199's.
- **CPU**: the simulation out of sight at a lower rate; the finder's box without the layout.
- **WebGPU**: not measured. The game's materials are three.js's WebGL ones patched in GLSL (`onBeforeCompile`), which
  its WebGPU renderer does not take, so a beat cannot be drawn on it without porting them; what can be measured
  first is the renderer's own cost for a beat's geometry under plain materials, on the owner's devices.

## The Stop's script: the guide's planner and the programs linked in it (issue 206, November 2026)

The owner's iPhone played the whole episode at 21 to 32 fps walking and 1 to 5 fps in the Stop's seek (frame 6's `time`
event: `cpu95` 714 ms, `bound cpu`), with taps that waited 2 to 3.7 s. `tools/stop_cost.js` (`STOPCOST=1` with
`tools/story_play.js`) prints, beat by beat, the frames' script, the guide's `stand()` asks and the programs linked. On a
session's machine, phone tier (390x844, `TIER=low`, `DRAW=60`), main at 2f1b4cb9:

- **The guide's planner** (`companion.js` `plan`/`planIn`, an A* on a 0.35 m grid round the held crowd) asks his
  options' `stand()` once a cell, and `stand()` built every car's and train's box for each cell (`carBoxes`, half of
  its time). A plan that finds no way is made again the next frame on the same grid: in frame 3's talk 264,624 asks in
  334 frames, frames up to 318 ms; in frame 1's talk 3.1 million. In `game.js` the boxes are now gathered once a frame
  for 30 m round (`standBoxes`), and while the world is held each answer is kept for the hold by the place asked to
  5 cm (`standHeld`; cleared when a post is added, moved or taken away, or the world runs): an ask went from about 6 µs
  to 0.7 µs, frame 3's talk from 1.7 s of asks to 0.35 s. The plan made again after it failed is the companion's
  (the #157 session's file): the goal's cell is shut by the afterimage's own post and the player's body, the search
  runs to its cap three times a frame. Until that lands the talk's frames carry 75 to 108 ms of planning.
- **Programs linked in the Stop**: each Stop's afterimage is drawn through `people.js` `exposure`, a program of its own
  for each of their materials, and their face's shapes (face.js, live while they speak) another; with the halation's
  sprite they were linked in the Stop's first frames and its talk (frames of 0.2 to 2.9 s here). `game.js`
  `warmGhosts` compiles one rig of each afterimage, still and speaking, and the halation, after the title's level is
  in (with `stopFx.warm`). The guide's own model (coat, nose, whiskers) still links in the frame he is first drawn
  (384 ms here in frame 1's film): the companion's.

Not measured: an iPhone. The CSS grade the Stop lays on the canvas (`story.css` `.story-stop #game-gl` filter and the
veil's multiply) is drawn in every beat of the Stop, the still at 42 fps on the owner's phone as well as the seek, so
it is not what parts them; what it costs a phone's compositor is not known.
