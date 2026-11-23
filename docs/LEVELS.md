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
- Issue 158's walls at street edges, as above: not built yet. The check's `slopes` budget is a ratchet at today's
  count until they are.
- The utility poles and shop signs of `city.py` still take their height from the build's elevation model.
