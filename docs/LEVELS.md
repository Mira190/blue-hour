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
| The ground between two streets at different levels | one membrane from street to street | 8,294 paved cells steeper than 15 %: the "paved hill" (issue 158) |

Three samplers read three grounds (the 10 m grid bilinearly, the 5 m grid as triangles, the build's elevation model),
and nothing tied a built thing to the ground it was drawn on. Mending one layer showed the next.

## What is done instead

One model of levels that every generator reads, in the pipeline (nothing is added at run time):

1. **The ground is a function of the survey.** `street_ground.py` settles once which path points lie on the ground
   (kept with the survey, `cities/<id>/ground_survey.json` "on"), and no longer keeps the survey under what is built by
   rule. `--settled` grades again without writing and fails if a node or a building would move: 0 and 0. (The landmarks
   stand on the ground and the grading keeps the ground under their paving, so after a change `tools/regrade.sh` makes
   the two in turn until that holds: the second round, from every start seen.)
2. **A plot is levelled to its street, and a break is a wall.** In the lots' membrane, where the streets either side
   differ by more than 1.2 m with no room between them for a slope of 12 % (the limit for a small street), the
   membrane is cut: each side is levelled to its own street. `pipeline/terraces.py` then builds a retaining block
   over every break the ground has on paved land: a solid in the `wall` style from under the low ground to a level
   top over the high ground, its top in bands of 0.5 m so that a wall along a falling street steps, kept out of
   carriageways and footways (there the building beside takes the level in its plinth). 3,105 blocks on the map, 851
   in the phone's district; paved cells steeper than 15 %: 8,294 to 1,815, all along street banks.
3. **One rule for whatever has a top** (`pipeline/levels.py`). `Levels` is the ground as the game draws it.
   `stepped(line, ground, height)` gives the bays of a wall, fence, hoarding, rail or parapet: each bay level, the
   fewest levels that keep every bay between its height and its height plus a slack over the highest ground under it
   (interval stabbing), a dip of one or two bays filled, feet under the lowest ground, the line stopped against a
   retaining block. `footing()` does the same for a mast or a crane. `walls()` and `posts()` draw them. A generator of
   a new kind of thing calls these and inherits the rule; the hoardings, their masts and cranes do.
4. **Every building stands on the lowest ground along its walls** (`rebase()`, now for all of them).
5. **The class is held by a check** (`tools/levels_check.py`, 9 s, in the static checks): runs and footings against
   the ground as it is now; a tooth in the top of any landmark mesh however it was built; every building's base; the
   paved cells steeper than a street against a budget (`tools/budgets/levels.json`); and `terraces.py --check`.

The order things depend on, and are made in (`tools/regrade.sh`): survey → `street_ground.py` → `terraces.py` →
`stations.py`, `lobby.py`, the city's base passes, `roofkit.py` → `landmarks.py` → `pack.py`.

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
- A retaining block is a plain concrete mass with a level top. It has no rail on its upper edge and no stairs
  through it; a break wider than one wall could carry (13 m at 385, -575) is one wall, not terraces.
- The utility poles and shop signs of `city.py` still take their height from the build's elevation model.
