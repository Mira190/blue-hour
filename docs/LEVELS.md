# Levels: one ground, and what is built on it (issue 163)

The owner, 21 November 2026, looking at stills from outside the hero level after the ground between the streets had
been levelled: "after the ground was fixed, do the buildings beside it not need fixing too? Why is the top of this
white hoarding jagged? Find the root cause; do not mend this one surface, solve every fault of its kind."

## The root cause, as found in the code

A city is built to datums: a street is graded, a plot is levelled to its street, where two levels meet there is a
made thing, and what stands on the ground has a level top and a foot on it. The map outside the hero level was made
in layers, each draped on the one below point by point, and each reading a ground of its own:

| What | How it took its heights | What it did |
|---|---|---|
| A works site's hoarding (`cities/shibuya/city.py` `works_site`) | each 4 m panel from the ground under its middle to 3.5 m over it, read from the viewer's 10 m grid (`terrain.json`), not the 5 m grid the game draws | 197 of 288 joints between panels jumped (up to 9.2 m); feet from 1.4 m in the ground to 1.9 m over it |
| The grading (`pipeline/street_ground.py`) | which path points "lie on the ground" from their height over the ground as it is now, which the grading itself rewrites; the survey's lumps kept wherever a landmark had a vertex near the ground | the ground was a function of itself: run again unchanged it moved 7,586 nodes and 420 buildings, then 2,919 and 175, then 2,637 and 169, and never settled; and a hoarding held the lump it stood on |
| A building's base | the lowest survey point under its corners, moved only where the lots' membrane touched it | 50 buildings stood 0.9 to 1.7 m off their graded street |
| The ground between two streets at different levels | one membrane from street to street, through the buildings | paved cells steeper than 15 %, the "paved hill" (issue 158): 8,399, of them 2,016 in the lots |

Three samplers read three grounds (the 10 m grid bilinearly, the 5 m grid as triangles, the build's elevation model),
and nothing tied a built thing to the ground it was drawn on. Mending one layer showed the next.

## What is done instead

One model of levels that every generator reads, in the pipeline (nothing is added at run time):

1. **The ground is a function of the survey.** `street_ground.py` settles once which path points lie on the ground
   (kept with the survey, `cities/<id>/ground_survey.json` "on"), and no longer keeps the survey under what is built by
   rule. `--settled` grades again without writing and fails if a node or a building would move: 0 and 0. (The landmarks
   stand on the ground and the grading keeps the ground under their paving, so after a change `tools/regrade.sh` makes
   the two in turn until that holds: the second round, from every start seen.)
2. **A plot is levelled to its street, and the difference between two streets is taken up in the buildings.** The
   lots' membrane is no longer stretched through a building: open ground is levelled from the streets and the open
   ground it joins, the ground under a building takes the level of the open ground nearest it, and the step between
   two sides lies inside the footprint, where the building's base and plinth take it (as in the place, where a
   building on a slope has doors on two floors, and as a game's level is built: the terrain yields to the plots).
   Steep paved cells inside the lots: 2,016 to 1,510, with nothing added to the map.
3. **One rule for whatever has a top** (`pipeline/levels.py`). `Levels` is the ground as the game draws it.
   `stepped(line, ground, height)` gives the bays of a wall, fence, hoarding, rail or parapet: each bay level, the
   fewest levels that keep every bay between its height and its height plus a slack over the highest ground under it
   (interval stabbing), a dip of one or two bays filled, feet under the lowest ground. `footing()` does the same for a mast or a crane. `walls()` and `posts()` draw them. A generator of
   a new kind of thing calls these and inherits the rule; the hoardings, their masts and cranes do.
4. **Every building stands on the lowest ground along its walls** (`rebase()`, now for all of them).
5. **The class is held by a check** (`tools/levels_check.py`, 9 s, in the static checks): runs and footings against
   the ground as it is now; a tooth in the top of any landmark mesh however it was built; every building's base; the
   paved cells steeper than a street against a budget (`tools/budgets/levels.json`).

The order things depend on, and are made in (`tools/regrade.sh`): survey → `street_ground.py` → `stations.py`,
`lobby.py`, the city's base passes, `roofkit.py` → `landmarks.py` → `pack.py`.
Then the road plan (`tools/road_plan.sh`, docs/ROADS.md), which `tools/regrade.sh` now runs last, with the page served:
`stations.py` gives a building that stands off the ground one underside, the lowest its solids have, and the plan then
raises the solids a road passes under. With the plan left out after a regrade, the Ginza line's viaduct stood 3.9 m
over Meiji-dori instead of 6.7, the buses under it stood, and `tools/check.sh` failed the drive to 109 behind them.

### A bridge meets its road (issue 173)

`tools/car_edges.js` drove your car's rules along every lane within 900 m of the start and found 47 places where the
car stopped on dry, open road. Thirty were three bridges south of the station, and the cause was the draping again:

| What | How it took its heights | What it did |
|---|---|---|
| A bridge in the lines (`game.json` paths) | the data lifts a bridge one level, 6 m over the ground under each of its points, whatever it crosses | where the Shibuya River runs under a street the ground is kept across it (`inland_water.py` "decks"), and upstream of Inari-bashi no river is drawn: a point stood 6 m over level ground between two ends 16 to 24 m apart, the page laid a deck through the three, and the car met a hump of 1 to 3 m rising at 30 % |
| A deck's end (`web/game/decks.js`) | from the street's last point on the ground to the first lifted point, 8 m on | the deck began at 30 % and more: a kerb and a half over the ground at the car's front corners a metre in, "Careful! That was a wall." |
| A deck's height along it | the data's, which is the survey's ground plus a level at each point | the bridge over the Yamanote south of Namikibashi copied the bank under it: 15 m up to 20.6, on to 24.5, down to 22.6 |
| The car's reach (`web/game/cars.js` `reachFloor`) | the floor at the car's end read once from its middle: where a deck stood more than a kerb over the middle and ground lay within 3.5 m under it, the ground was taken | a ramp at a street's steepest (12 %, 0.27 m over the middle at the car's end) was met as a ledge on every deck with ground near under it |

What is done instead:

1. **A bridge that spans nothing lies on the ground** (`street_ground.py` `spans_nothing`, kept in the survey's record
   of which points lie on the ground). A run off the ground between two ends on it is the street itself where it is
   too short to clear anything at a street's steepest (2 x 2.5 m / 12 %) or stands under a clearance over its ground,
   no water is drawn under it, no railway runs under it and the ground does not fall away under it. 134 points of 102
   lines; the grading then levels the street there like any other.
2. **A road's deck is laid by rule** (`decks.js`): a deck of one level between two ends on the ground starts from the
   straight line between them (a viaduct keeps the data's heights); near an end it is no higher than a 12 % ramp from
   that end reaches; over a railway, a street or a footway that passes under it, it stands that thing's room over it
   (5.5, 4.7, 2.5 m and the slab) and comes down from there at 12 %, the ramp taking its length from the street before
   the deck where the deck is too short, as the place has an approach there; where it lands it stands over the
   ground across its width.
3. **The car climbs a ramp on a deck as it climbs one on the ground** (`cars.js` `reachFloor`): a floor found more than
   a kerb under the middle, or within a kerb under a floor a walker would step up to, is reached by halves first.
4. **The check counts where a car can go** (`tools/car_edges.js`): inside the planned area and the band where it is
   turned back (docs/BOUNDS.md). 47 stops before, 0 where a car can go now; 11 are listed past the edge (the banks at
   street edges of issue 158 north-west of the level, and a motorway's embankment at x 1050), where no car is driven.

`tools/deck_profile.js <line,...>` prints a road line's profile as a car meets it (the ground, every deck, the line's
height, across five lanes), and `tools/car_ledge_at.js x,y,z,heading` what the car's rules find under its footprint.

### A railway's embankment is built, not ground (issue 158)

Inside what a player reaches (the planned area and 150 m round it, docs/BOUNDS.md) the paved cells steeper than a
street were about 80, and almost all lay along one thing: the Yamanote's embankment north of the Scramble (x 427 to
456, y -910 to -728), 4 to 5 m of earth in the survey, smeared by the 5 m grid over a cell or two either side and kept
as surveyed because the bed's ballast lay on it. Beside each street under the line the paving climbed a mound to a low
wall on its top: the owner's "paved mound against a viaduct".

| What | How it took its heights | What it did |
|---|---|---|
| The ground under and beside the bed | the survey's embankment, kept wherever a landmark's flat face lay near the ground | a paved bank up to the foot of a wall that stood on the bank's top |
| The rail's level (`cities/shibuya/rail.py`) | the ground under the track as it is now (the viewer's 10 m grid), smoothed | a function of whatever the grading last did there: with the embankment taken out it would have come down to the street |
| The bed's walls, masts and abutments | the viewer's 10 m grid | not the ground the game draws |

What is done instead: the embankment is a built thing. `street_ground.py` `viaduct()` marks the nodes within 12 m of a
track that stands 2.5 m or more over the lowest ground within 20 m of it; `lots()` treats them as it treats the ground
under a building (unknown: the level of the open ground nearest them), and a hero level's ground stays as it is. The
rail's level is settled once from the ground as it was (`cities/shibuya/rail_levels.json`), and what stands on the
ground reads `levels.Levels`. So the bed stands on its ashlar walls from the street up, a girder over each street, and
the paving runs level to the wall's foot. A track at grade or in a cutting keeps its survey. Steep paved cells: 8,130
to 7,948 on the map (the budget lowered to 8,000). The Scramble's JR fence north of the bridge, which stood panel by
panel on the ground under each bay's middle, is built by `levels.stepped` (15 bays).

Left: past the reach, the banks at street edges and the escarpment round (385, -575) are as they were. They are seen
only from the helicopter; `tools/levels_check.py` still counts them.

### What is placed stands on the ground that is drawn

The owner, 23 November, at a still of the bicycle lot under the Yamanote's viaduct: the bicycles have sunk through the
ground; look for the others like it. Sixty-six bicycles stood up to 1.66 m under the paving. The Scramble's generator
(`cities/shibuya/scramble.py`) placed everything it builds on the viewer's 10 m grid read bilinearly, the third
sampler of the table above: it lies up to a metre off the 5 m ground between its nodes, and 19 % of the planned area
is more than 10 cm off. Now its `ground()` is `levels.Standing`: the game's ground outside the hero levels, and inside
a level's circle the ground that level was built on. `tools/levels_check.py` `props` holds every placed thing of the
landmarks to 8 cm of the ground (57 of 64 failed before, none now). The game's own props (benches, signals, stops)
are seated on the floor by the page when it loads (`game.js` `seat`), so their stored heights are not what is drawn.

Left, and not this work's to change: inside the Scramble's circle the level's own floor under its viaduct north of the
girder bridge (x 425 to 440, y -1000 to -910) is the survey's embankment, 4 m of paved mound under a viaduct drawn on
columns, and the lot at the circle's edge lies on the slope down from it. Taking it out is a change to the hero
level's floor (docs/HERO.md).

### A picture stands on its building's face (issue 169)

A sign is placed by its own generator from the outline that generator read; the page draws the city model's solid.
Where the two differ the picture lay inside the solid: a blade at Center Gai's mouth 0.65 m into its building, and
the station's works hoarding on the Scramble's own outline of the station, 16 m inside the city model's box, where
nobody could see it. `pipeline/landmarks.py` `signs_out` moves each upright picture whose middle and front are inside a
solid out of it: a board the way it faces, to the face it is to be read on, a blade through the nearest face until its
root is at the wall; what stood on the ground is set on the ground where it now is. `tools/sign_check.py` fails a
picture left inside (4 before, 0 now), beside the two faults it already failed: a picture turned to a wall, and one
with nothing behind it (each upright picture has had a back since 7dd371a3).

### What was tried and withdrawn: a retaining block on every break

The first answer to issue 158 put a solid block over every cell where the graded ground broke by more than 1.2 m:
3,105 blocks on the map. The owner, looking at the stills: "so many retaining walls, appearing on flat ground? How
does a AAA game do this?" It was withdrawn before it reached main. It made the grid's fault into an object: a 5 m
grid cannot hold an edge, so each block was a cell wide and stood where the grid smeared a drop, not where a wall is
built. Measured afterwards, four fifths of the 8,155 steep paved cells are not in the lots at all: 3,516 touch a
street's own nodes, 2,396 a bank left beside a street, 2,678 kept survey (the railway's embankments). The break is at
the street's edge. What a game does, and what issue 158 now asks for: the terrain draws only gentle ground; a
vertical face at a street's edge is the street's own geometry, a thin wall along the street's vector edge with a
coping and a rail by the rule above, the ground behind it level to its foot; made where a player can go, each one
looked at in a still, and nothing added beyond that reach.

**Inside the Scramble's level too** (23 November 2026, the hand-over from issue 158). The Yamanote's bed north of the
girder bridge (x 425 to 440, y -1000 to -910) lies in the Scramble's circle, where the grading left every node as the
level was built on it: a paved mound 4 to 5 m high under a bed drawn on columns, the bicycle lot on its slope and its
fence in the bank. A level whose entry says `"viaduct": true` (`cities/shibuya/city.json` `game.hero`) is open to
`viaduct()` like the ground outside it, and its nodes there are no longer held (`street_ground.py` `run`). The first
try, without the level, left a 4 m step at the floor's edge, because the level's walked floor
(`cities/shibuya/hero_floor.json`) could not be exported again: `tools/hero_ground_probe.js` cast its rays on the
default layer and a level's ground is drawn on a layer of its own, so the probe read no ground under the Scramble
(issue 201). The probe's rays now meet every layer; the order is `tools/regrade.sh`, both levels built again
(`blender/build_hero.py`), the probe's export, `pipeline/hero_floor.py`, `pipeline/pack.py`. The ground under the bed
went from 20.2 m to 16.1 to 16.5 m, level with the lanes either side, and the Scramble's floor is exported on it.
Miyamasu's and SKY's lobby's floors are not: exported too, the two patches met at the forecourt's edge with lifts of
their own (5 cm and 1.2 cm) and the guide stood 6 cm over the paving there (`tools/guide_way.js`, frames 4 and 6), so
they are left as main has them, without a patch (issue 201). Views: `tools/views/viaduct-158.json`.

Left: under the bed's east half north of y -945 the ground is still 1.7 m up (17.8 m): the bicycle lot's paving at
the circle's edge is a landmark's, laid on the survey's slope at 17.6 m, and the ground nearest the unknown nodes
is read from it.

## What was surveyed, and what was adopted

| Work | How it conditions levels | Taken | Licence |
|---|---|---|---|
| Esri CityEngine | "Align terrain to shapes" cuts and fills the terrain to a shape with a blended border; "Align shapes to terrain" moves a footprint rigid to its lowest point; `extrude(world.up.flatTop)` gives a level top from a draped footprint; facades split `Groundfloor | Floor*` | terrain yields to what is built; a rigid base at the lowest ground; level tops; the ground floor as its own part | proprietary (documentation only read) |
| OSM2World | connectors share one elevation; roads are constrained level across and smooth along the centre line; a building's base is the minimum of its outline. Its walls and fences are per vertex (the jagged case), and the constraint solver is mostly unwritten | the road constraints (as `street_ground.py` already grades); the building's minimum. Its barriers are the counter-example | MIT |
| Streets GL | no flattening: roads are projected on the terrain per vertex; a building is set at the lowest terrain of its footprint with a plain foundation up to the highest | the foundation between lowest and highest ground (the page's plinth skirt does this) | MIT |
| PLATEAU (SDK for Unity; the standard) | the SDK reshapes terrain to LOD3 roads; an LOD1 solid's bottom is the lowest point where its outline meets the terrain | the base convention, which is the data's own | MIT (SDK); CC BY 4.0 (data) |
| Fencing practice | on a slope a fence is raked (rails follow the grade between plumb posts) or stepped (level panels dropping at posts); panels are stepped | stepped panels for anything solid; a rail may rake straight between posts on a graded street | — |
| 道路構造令; the barrier-free road standard | a small street's grade at most 12 %; a footway 5 %, 8 % where unavoidable | 12 % as the slope a plot's ground may have before it is a wall; 15 % as the check's limit | — |

They agree on five rules: a building is rigid with one base at the lowest ground under it; terrain yields to built
things; streets are level across and smooth along from the centre line; neighbours meet at shared points; draping is
for ground-hugging surfaces only, and a wall is level-topped.

## What is left

- Inside the hero levels the guard rails rake with the graded street and the JR fence steps per panel
  (`cities/shibuya/scramble.py`, `hero.py`, `hero_miyamasu.py`): the `tops` check holds them (no tooth today); they
  are not yet built by `levels.stepped`.
- Issue 158 past the planned area's reach: the banks at street edges and the escarpments between two streets are as
  they were (seen from the helicopter only). The check's `slopes` budget is a ratchet at today's count.
- The utility poles and shop signs of `city.py` still take their height from the build's elevation model.
