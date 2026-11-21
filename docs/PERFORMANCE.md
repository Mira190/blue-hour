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
  the scale the device held on each map (`localStorage` `oe3d-gov-<city>`), so the next visit starts there
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
extras (`oe3d-gov-<city>`: `0.85/0.5`), and a device that has one starts there. Under automation the governor stands
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
(`oe3d-died-<map>`, kept fourteen days), and on the low tier each one makes the next load of that map lighter;
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
map does not come back whole under the player after a trip to the far corner. `DESK=0` leaves it out.

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
| Texture memory | A 4096 x 4096 RGBA texture with its mips is about 90 MB on the GPU whatever its file's size; block formats cut that four to eight times ([Don McCurdy, 2024](https://www.donmccurdy.com/2024/02/11/web-texture-formats/)). iOS gives a tab no fixed limit; context loss is reported there without growth, too. | ASTC on a phone is done ("A phone's pictures in ASTC blocks"). **Next: what a beat leaves behind is freed**, and a desktop's textures (1.25 GB resident in frame 1 here, none of it in blocks). |
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
