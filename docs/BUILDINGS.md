# Buildings: roofs, facades and rooftops

> **Scope, November 2026.** The project is now one story on one map: Blue Hour, at the Shibuya Scramble
> ([STORY.md](STORY.md)). This page was written while the project built many maps, a globe and a model viewer.
> Where it names another city, the title screen, the viewer or the reef sites, it describes work kept at the tag
> `archive/world-2026-11`; the shared code it explains is the code Shibuya runs.

Footprints and heights say where a building is and how tall it is. They do not
say what it looks like. Until this change every building was a flat-topped
prism, coloured per class, with the same 3.4 × 3.6 m window grid on every wall
above 9 m. This page covers what replaced that:
- what the frontier of footprint-based 3D cities does;
- what this project took from it;
- how each part is built and checked.

| What | Where | How it is checked |
|---|---|---|
| LOD2 roofs: hipped, gabled, half-hipped, pyramidal, skillion, mansard, gambrel, barrel, dome and onion, with eaves | `pipeline/roofs.py` | Every Sydney footprint (8,441) is built and validated: area, bounds and height |
| Roof shape when none is mapped (97% of buildings) | `pipeline/typology.py` | Mapped roofs predicted by the rules alone: `cities/<id>/analysis/roof_model.json` |
| Roof shape measured from Project PLATEAU's LOD2 meshes (Kyoto: 79,889 buildings) | `pipeline/plateau_3dtiles.py` | Against the 323 roofs also mapped in OSM: flat or pitched agrees 90%, shape family 85% |
| Facade style, storeys and ground floor, shopfronts, awnings, wall and roof colours, rooftop plant | `pipeline/typology.py`, `build_scene.py` | Screenshots from street level to overview (`tools/city_shot.js`) |
| The facade drawn in the shader: windows by floor and bay, curtain walls, glass, rooms behind the glass, lights by the hour | `web/buildings.js` | three.js r186 in the integrated build, and r128; all five cities and their games run headless (`tools/city_shot.js`, `tools/game_check.js`) |
| Shadows from the same roofs | `web/sun.js` | All sun analyses re-run |
| The same buildings in Blender | `blender/buildings.py` | Cycles renders of the same views |

## 1. What the frontier does

Open data gives a footprint, a height and sometimes a floor count. Overture's
roof fields are almost empty. Measured in release `2026-10-21.0`:

| City | Buildings | `roof_shape` set | `num_floors` set |
|---|---|---|---|
| Sydney | 8,460 | 2.7% | 70% |
| Tokyo (Chiyoda) | 34,614 | 0.6% | 10% |
| Kyoto (centre) | 80,157 | 0.6% | 5% |
| Osaka (Umeda) | 22,470 | 0.4% | 11% |

So every product that builds believable cities from footprints infers roofs and
facades. Here is how they do it.

| Product | Roofs | Facades | Source |
|---|---|---|---|
| Streets GL (open source) | 12 shapes. A CGAL straight skeleton for hipped, gabled and mansard; oriented-bounding-box profiles for the rest; flat when the shape is untagged | Material texture sets. 4 m windows stretched to fit each wall run (runs break at 30° corners). Rows from the level count. Noise-lit windows | Source code, [github.com/StrandedKitty/streets-gl](https://github.com/StrandedKitty/streets-gl) |
| OSM2World (open source) | About 20 shapes: one ridge through the bounding box plus a heightfield, so no skeleton | Textured or modelled windows | Source code, [github.com/tordanik/OSM2World](https://github.com/tordanik/OSM2World) |
| Mapbox Standard | Roof shapes classified by computer vision from footprints and aerial imagery | Windows, roofs and ground floors in about 8 cities | [Mapbox blog](https://mapbox.com/blog/detailed-architecture-and-new-design-flexibility-enhance-the-latest-release-of-mapbox-standard); method not public |
| Microsoft Flight Simulator (Blackshark.ai) | Footprints, heights and roof types by ML on aerial imagery | Facades from location and context | [Press coverage](https://techcrunch.com/2020/08/17/meet-the-startup-that-helped-microsoft-build-the-world-of-flight-simulator) only |
| Google, Apple | Photogrammetric meshes, or buildings modelled by contractors | — | Not procedural |

What this project took from them:
- A straight skeleton for roofs, with hip ends turned into gables, as in Streets GL.
- Window bays fitted to each wall run between sharp corners, as in Streets GL.
- Roof shape inferred where it is not mapped, like Mapbox and Microsoft Flight Simulator. Here the inference uses published, measured priors rather than a hidden model, and is scored against the roofs that mappers did record.
- Facades evaluated as a split grammar in the shader: margins, repeated bays and floors, then sill, window and head. This is the grammar of [Müller et al. 2006](https://doi.org/10.1145/1141911.1141931) and [Wonka et al. 2003](https://doi.org/10.1145/882262.882324).
- Interior mapping ([van Dongen 2008](https://www.proun-game.com/Oogst3D/CODING/InteriorMapping/InteriorMapping.pdf)): each window shows a room, from a ray cast in the pixel shader.

## 2. Roofs

### Shape

Each solid takes the first of these that applies:
1. **Mapped.** A `roof_shape` on the building part, or on the building.
2. **Measured.** The shape, pitch and height that a LOD2 model shows for the footprint (see [Measured roofs](#measured-roofs)). Today that is Kyoto. Paris measures its roofs from LiDAR over surveyed eaves instead (shape, height and material, but not the ridge's direction, so its gables still follow the street; see the Paris case study). Amsterdam's come from the 3DBAG's LOD2.2 models, measured with the same classifier as Kyoto's (the Amsterdam case study).
3. **Flat by rule.** Five or more floors, a top of 20 m or more, or a footprint of 2,000 m² or more. Also commercial or industrial buildings over 600 m², and parts of a larger building.
4. **Drawn from the region's prior** for the building's group:
   - house, semi-detached, terrace;
   - low flats, small structures, places of worship, civic, low commercial;
   - unclassed.

   The draw uses a fixed hash of the building's id, so a rebuild gives the same city.

The priors are measured from the roof shapes mapped across each metro area. Some
of the measurements:

| Group | Measured mix | Labels |
|---|---|---|
| Sydney, 1–2 floors | 87% pitched | Greater Sydney, 5,762 |
| Sydney, detached houses | 63% hipped, 33% gabled | Greater Sydney, 5,762 |
| Sydney, semi-detached | 86% hipped | Greater Sydney, 5,762 |
| Kyoto, houses | 82–89% gabled | Kyoto city, 21,188 |
| Tokyo, houses | 60% gabled, 31% hipped | 23 wards, 5,142 |
| Tokyo, 5+ floors | 90% or more flat | 23 wards, 5,142 |
| Hong Kong, village houses | 85% gabled | the SAR, 7,844 |
| Hong Kong, low flats and semis | 92% and 83% flat | the SAR, 7,844 |

A narrow, deep house carries its ridge across the long axis, along the street:
under 7.5 m wide and more than 1.8 times as deep. Sydney's terraces and Kyoto's
machiya are built this way.

**The check.** Every mapped roof shape is predicted by the rules alone, as if it
were not mapped. Shape family counts gabled and gabled across as one, and hipped,
half-hipped and pyramidal as one.

| City | Roofs scored | Flat or pitched correct | Shape family | Flat roofs found | Pitched roofs found |
|---|---|---|---|---|---|
| Sydney | 201 mapped | 68.7% | 41.3% | 84.7% | 62.0% |
| Melbourne | 51 mapped | 54.9% | 45.1% | 78.6% | 26.1% |
| Melbourne Bayside | 12 mapped | 83.3% | 41.7% | 50.0% | 90.0% |
| Osaka | 137 mapped | 67.9% | 59.9% | 85.4% | 41.8% |
| Kyoto | 337 mapped | 76.3% | 58.5% | 82.6% | 73.9% |
| Kyoto | 59,308 measured | 67.6% | 49.4% | 54.5% | 73.1% |
| Tokyo | 111 mapped | 85.6% | 81.1% | 98.9% | 37.5% |
| Hong Kong | 62 mapped | 75.8% | 69.4% | 88.1% | 50.0% |

Most of Sydney's misses are large heritage offices and colleges with pitched roofs
that the area rule makes flat. Melbourne uses Sydney's rules, and its CBD's pitched
roofs are mostly on large old buildings the rules make flat. Mapped roofs are not
a random sample, because mappers tag the interesting ones. Kyoto's measured roofs
are close to a census, and against them the rules get 68% of flat-or-pitched
right. That is about what a draw from the right mix can do without seeing the
building: in a group that is 78% pitched, a random draw from that mix is right
66% of the time.

### Measured roofs

Project PLATEAU publishes LOD2 building models, with real roof surfaces, for the
central wards of many Japanese cities. `plateau_3dtiles.py` reads Kyoto's LOD2
tiles (2,135 Draco-compressed b3dm tiles inside the bbox, out of a 1.8 GB zip by
HTTP range requests) and measures each building's roof from its triangles:

- **Roof and walls.** Triangles facing up and under 75° are roof; near-vertical ones are walls.
- **Flat** when over 70% of the roof's plan area slopes under 6°.
- **Skillion** when the sloped area's normals add up to one direction.
- **Gable or hip.** A gable stands as a wall above the eave. The wall area above the eave is set against the triangle that a gable on the short side would make: over 0.55 is gabled, 0.2–0.55 half-hipped, under that hipped.
- **Ridge direction.** Gabled across when most of the sloped area faces the ends of the footprint's long axis.
- **Pitch and height.** The area-weighted median slope, and the height from the eave (10th percentile of the sloped faces' low points) to the ridge.

79,889 of Kyoto's 80,870 PLATEAU buildings get a measured roof: 25,297 gabled
across, 12,651 gabled, 1,109 half-hipped, 1,077 hipped, 1,156 skillion and
18,830 flat among the solids built. The median pitch is 20.7°, and half lie
between 17° and 25°: close to the 4/10 slope (21.8°) of kawara roofs. Two checks:

- **Against OSM.** On the 323 buildings whose roof is both measured and mapped, the two agree on flat or pitched for 90% and on the shape family for 85%. The classifier finds 88% of the mapped gables and 90% of the flat roofs, but only 9 of 18 hips.
- **The ridge rule.** The rule that a narrow, deep house carries its ridge across holds: measured gables under 7.5 m wide and more than 1.8 times as deep run across 73–82% of the time. Wider buildings mostly run along.

Kyoto's measured mix is not used as the prior for Osaka and Tokyo. Kyoto is a
city of gabled machiya: 76% of its houses are gabled and 5% hipped, where Tokyo's
mapped houses are 31% hipped.

### Geometry

`roofs.py` builds the straight skeleton with the event-driven wavefront of
Felkel and Obdržálek (1998):
- every edge moves inwards at unit speed;
- vertices follow their bisectors;
- edge events and split events change the wavefront. A split event can merge a hole into the outline, so courtyards work.

A node's arrival time is its distance to its edges. Lifting the skeleton by
tan(pitch) × time gives a hipped roof. The other shapes are built on top of that:

| Shape | How |
|---|---|
| gabled, half-hipped, gambrel, round | Each triangular hip end whose apex has three faces is moved onto its edge. Half-hipped moves it 55% of the way |
| mansard, gambrel, round | A profile on the arrival time. The faces are sliced at the profile's breaks, so each slice stays planar |
| large footprints | When the pitch would make the roof taller than twice the cap, the roof is cut off flat at the cap: a hip roof with a deck |
| skillion | One plane, falling towards `roof_direction` |
| gabled "across" | Two planes meeting on a ridge at right angles to the long side |
| dome, onion | The footprint revolved about its centre |

**Eaves.** The roof is built over the footprint offset outwards. The depth is
0.45 m on houses, 0.25 m on terraces and 0.75 m on machiya. Then:
- the roof is lowered so it meets the walls at the eave;
- gable walls move back onto the footprint;
- soffits close the underside of the eaves and the rakes.

**Robustness.** On Sydney's 8,441 footprints the skeleton succeeds on 99.86%. The
other 12 are concave footprints with simultaneous degenerate events. A failed
roof retries on a simplified outline, then falls back to the two-plane gable,
then to flat. Every roof is checked: its faces must cover the footprint's area,
stay inside it and stay under its height.

### Height, material and colour

- **Height inside the measured top.** OSM and Overture heights include the roof, so the roof is carved inside the building's top height and the walls stop at the eave. The pitch is the region's: Sydney tile 30°, sheet metal 22° and terraces 33°; Japan kawara 24° and metal 18°. A roof may not leave less than 2.4 m of wall.
- **Material from the photo where it is clear.** That means terracotta red, or a dark neutral for slate or kawara. Otherwise the material is drawn from the region's mix for the group. In Sydney: Federation houses are 75% Marseilles terracotta; terraces are 55% corrugated iron and 30% slate.
- **Colour from the photo, leaned towards the material.** The colour is the median of the aerial photo over the footprint, leaned towards the material's own colours:
  - the published COLORBOND steel values;
  - terracotta, new to weathered;
  - slate;
  - kawara.

  It leans by 20% when the photo showed the material, and by 60% when the material was drawn. A 1 m photo median alone is too washed out to tell sheet metal from weathered tile.

## 3. Facades

`typology.py` gives each building one of 15 styles: plain, house, terrace,
apartment, office, glass (curtain wall), heritage, retail, industrial, civic,
machiya, mixed (Japanese mixed use with signs), stone, haussmann or grachtenpand;
`pipeline/walls.py` adds a 16th, wall, for precinct walls.

| Rule | Source |
|---|---|
| Curtain wall when `facade_material` is glass, an office is 40 m or taller (85%), or anything is 80 m or taller | Research synthesis |
| Heritage for churches, civic buildings and stations up to 50 m: round-headed windows, string courses, a rusticated base | Sydney sandstone civic buildings |
| Storey height from the floor count and wall height, capped by style. Above the top floor the rest of the wall is attic or parapet, because a residential floor-count height includes 2.8 m of roof. One floor on a wall taller than two of the style's tallest storeys is a register counting a whole block as one storey (Paris has about 1,600 at 15–30 m): its storeys are counted from the style's height instead (`typology.storeys`; `pipeline/restorey.py` gives the same storeys to a `buildings.json` built before without the raw downloads, about 1,900 buildings in ten cities, Paris 1,423, Osaka 326, Hong Kong 100; `buildings.js` still applies the rule to any file left stale) | `storey` model in `city.json` |
| A taller ground floor (+1.1 m) with a shopfront on edges that face a road within 14 m. Flats and unclassed buildings get shopfronts only on main streets | Overture road segments |
| Awnings over 80% of Sydney's shopfronts; the street pent roof (hisashi) on machiya | City of Sydney, Kyoto machiya guidance |
| A precinct wall (`pipeline/walls.py`, a step after `game_data.py`): one unnamed solid of no use class, at most 3.5 m thick on average and at least 80 m long, with no mapped footway along it, is drawn in the `wall` style: no windows or storeys, a stone plinth, plaster stained under its coping. An estimated height becomes a wall's (`walls.height_m`, 4 m); a measured one up to 6 m stands. With `walls.coping: "kawara"` it gets a hipped coping of glazed tiles over a 0.35 m overhang, and inside a `walls.lines` box the white lines of a suji-bei (five round the Kyoto Gosho and Sento Gosho) | OpenStreetMap, PLATEAU; Kyoto Gyoen notices (five lines, stone plinth); Sanjusangen-do's Taiko-bei, 5.3 m |

In the browser, `buildings.js` builds the walls:
- **Runs.** A ring's edges are grouped into runs between corners sharper than 30°. Each run holds a whole number of bays, with a 0.6 m margin at each end, so no window wraps a corner. Normals are smoothed inside a run, so round towers look round.
- **Bays and floors.** The shader evaluates the grammar per pixel. Floors come from the storey and ground-floor heights. Only whole floors under the eave get windows, so the top row is never cut off.
- **Window elements.** Frames, sills and the lintel's shadow on each window. Painted timber frames on houses, terraces and heritage buildings; dark aluminium on offices.
- **Curtain walls.** Mullions every 1.5 m and an opaque spandrel at each slab, in coated glass: a tinted mirror with F0 about 0.3, varied panel by panel.
- **Glass.** Glass gets per-pixel roughness of 0.04–0.12, so it reflects the sky (three.js's PMREM environment and GGX).
- **Rooms.** A room behind each window, from a ray cast through a box one bay wide and one storey high: back wall, side walls, floor, ceiling and furniture. Blinds are drawn on 28% of punched windows.
- **Lights at night.** Windows light on an occupancy schedule for the style and the local hour. Offices light mostly by the floor, so a tower reads in bands of lit storeys, and empty through the evening to a few floors lit all night; their lobbies stay lit. Homes light by unit. Each lit run has its own brightness, and some rooms are under cool light. Homes are warm (2700–3000 K) and offices neutral (about 3500 K). From farther off, whole runs of rooms are lit or dark along each floor; where a run is under a pixel, the facade shows the share lit. The street lights fall on the lower floors, and tall towers have lit crowns ([NIGHT.md](NIGHT.md)).
- **Anti-aliasing.** Every row of windows, frames, courses and slats is box-filtered over the pixel's footprint as a repeating pulse, so a row too fine for its pixels settles on its mean coverage instead of shimmering. What changes from one window to the next (blinds, rooms, signs, glass tint) settles on its average once a window is a few pixels across, and lit windows once it is a pixel or two. Glass widens its reflections a little as it shrinks, so the sun's glint glides over a facade instead of flashing between windows. Flags read back from per-vertex data are rounded to whole numbers first, since an interpolated 16 can arrive as 15.99999.
- **Overlapping solids.** Two sources can map the same building, so some solids overlap with their roofs in one plane. Each building is drawn a tiny share of its distance nearer the camera, along the view ray, so one of the two always wins the depth test and the roof does not speckle.
- **Openness.** Wall vertices carry a sky-openness term. It is the mean horizon height in five directions over a 4 m model of the building tops, so street canyons and party walls are darker in ambient light.

## 4. Rooftops

- **Flat roofs:** a 0.3 m parapet, 0.5–1.3 m high by style. The deck inside shows the aerial photo, softened and leaned towards the roof's median colour, with the same haze correction as the ground (ARCHITECTURE.md).
- **What the deck is made of** (issue 148): where the photograph is not its colour (round a hero level, and on a
  tower), a flat deck takes its `roof_material`'s tone and joints: sheet or coating in 1.2 m runs, gravel, or a
  concrete slab in 3 m bays, square to the building (docs/HERO.md, "From the air by day").
- **Plant rooms:** buildings 30 m or taller get a plant room or lift overrun, aligned to the roof's long axis.
- **Plant boxes:** smaller roofs get plant boxes placed without overlap.
- **Water tanks (Japan):** on 30% of buildings of 4–15 floors.

All of it is deterministic. Plant and tanks are decoration: they sit on the deck
and are not part of the shadow analysis.

### The rooftop kit (issue 73)

From the helicopter a Tokyo roofscape is mostly its equipment, and the flight in frame 5 showed extruded boxes
with bare decks. `pipeline/roofkit.py` (run after any step that writes `buildings.json`, then `pipeline/pack.py`)
places, from each flat roof's polygon, what the Tokyo roof carries besides the plant above:

- **A stair hut** (touya) on every flat roof from 7 m, against the roof's long edge, its steel door facing in and a
  slab over it, in the building's own render. Not on a roof whose plant room holds the stair already.
- **A row of air-conditioning condensers** along the opposite parapet, 2 to 12 units at a 0.95 m pitch, on roofs
  up to 80 m (a tower's plant is in its plant room).
- **The fire service's marks**: an "R" in a 10 m square for the emergency rescue space on a roof from 31 m, an "H"
  in a circle on an 18 m pad from 100 m, as near the middle of the roof as the plant leaves the square open (the
  Tokyo Fire Department's guidance for high-rise roofs; the thresholds are the Fire Service's 31 m and 100 m. The
  paint, yellow for the R and its square, white H, yellow circle and white border on a dark green pad, is from
  photographs of Shibuya's roofs, not a published specification).
- **Finer plant**: the plant boxes carry a louvred band and a fan guard on their lid, the water tanks are panel tanks
  with their ribs and hatch on a four-legged stand, the plant rooms a louvre and a door.

Roofs in `city.json` `roofkit.skip` (Scramble Square, whose deck SHIBUYA SKY furnishes) and solids a landmark draws
instead are left alone. Every kind is one small vertex-coloured model drawn as one instanced mesh (`web/buildings.js`,
"the rooftop kit"), split into culling cells; the instance colour is the paint, a building's wall for a hut or a
plant room, and a unit's paint differs from the next by at most 8%, no random tones. The marks are flat geometry
with a polygon offset, no texture. A phone draws the kit only within 420 m of where its map was built (the hero level
and the flight), and still no parapets.

Prior art looked at (design only; no code taken): Streets GL (MIT) and OSM2World (LGPL) put generic rooftop objects
only where OSM tags them, which Tokyo's roofs almost never are; three.js's city examples and hobby generators
(`SkyscraperGenerator`, MIT, merged geometry) place boxes at random. What was adopted is the pattern common to
game cities: a small kit of shared meshes instanced over the roofs, placed by rules from the footprint rather than
by noise, so each piece has a cause (a stair to the roof, a unit's condensers along its parapet, a mark the fire
service requires at a height).

### Signs and lit windows from the air (issue 73)

A lit window is a room's light: offices under cool white tubes, homes under warm bulbs or cool ceiling lights
(`lampC` in the facade shader). Colour comes from signs, and signs hang where the shops are: a mixed-use building's
floor panels now stand only on a street face (one with a shopfront or an awning), in one column of two bays down
it (two on a wide front), a tenant a floor with some floors to let, and its corner sign only on a street face too.
Before, a panel was drawn on any floor of any face by a hash, and from the air the backs and sides of the blocks
were dotted with red, yellow, blue and green squares that read as coloured windows. Far off, the signs' mean colour
is laid on street faces only.

## 5. Regions

The city's `architecture` key picks the rules: `sydney`, `japan`, `hong_kong` or
`default`. Without the key, the country decides (AU, JP, HK). Hong Kong's region
sets only the roof priors, measured across the SAR; its walls and streets are the
defaults. `architecture_overrides` adjusts the rules for one city, and Kyoto and
Osaka have built-in adjustments:

| | Sydney | Japan (Tokyo, Osaka, Kyoto) |
|---|---|---|
| Roofs | Hipped houses and semis, gabled terraces, tile, metal or slate | Gabled houses, kawara or sheet metal, flat from 3–4 floors |
| Walls | Painted stucco and sandstock brick (terraces); red face brick and roughcast (Federation); liver and cream brick (flats); precast (offices); sandstone | Ceramic siding (over 80% of new houses); tile and painted concrete; low chroma under the Tokyo and Kyoto colour rules |
| Grids | Metric bays, 2.8–3.6 m | The 910 mm module: sliding units of 1,690 mm on 1,820 mm bays; machiya fronts of three 1.97 m bays |
| Street | Awnings over shopfronts | Shop signs on mixed-use mid-rises, lettered with real words (a business across a floor's panel, a two-character tenant a floor down a corner sign, read top to bottom; dark on a light sign, white on a dark one) and backlit at night. A building has one corner sign, at the start of the longest street front of its tallest solid, and a floor's panel takes two whole bays of a wall run, never its margins. The words are kinds of business, not shops' names, drawn into `web/assets/signs/glyphs.png` by `pipeline/sign_glyphs.py` with Google Fonts (Zen Kaku Gothic New, Shippori Mincho, Dela Gothic One, RocknRoll One, M PLUS Rounded 1c; SIL Open Font License); until it loads, strokes in the shape of characters |
| City adjustments | | Kyoto: machiya, signs at 0.35 (no rooftop or flashing signs by ordinance). Osaka: signs at 1.4 |

**Paris** (`paris`, country FR) measures its roofs instead of drawing them. IGN's
LiDAR over BD TOPO's surveyed eaves gives each roof its height and its shape
(flat, mansard, hipped; gambrel or gabled where a third of the outline is party
wall), with the land tax files' material; roof source `measured`
(`pipeline/measured.py`, the Paris case study). The
region's own rules:
- roofs flush behind the cornice, ridges along the street, standing-seam zinc;
- a `haussmann` facade style for stone blocks of four to eight floors: ashlar
  courses, a rusticated base under a shop and its entresol, balconies along the
  second and top floors, railings across the other French windows (wrought iron:
  a handrail, a bottom rail, balusters and a band of lattice), a cornice;
- dormers on the street side of mansards and tall attics, and chimney stacks on
  the party walls (rooftop kinds 3 and 4, with an absolute base);
- limestone palettes, and awnings over 45% of shopfronts.

**Amsterdam** (`amsterdam`, country NL) measures its roofs from the 3DBAG's LOD2.2
models, roof tier by roof tier. The region's own rules:
- a `grachtenpand` (canal house) facade style for a house of the canal era (built
  before 1880 by the BAG's year, or of no known year) on a lot at most 13 m wide:
  brick in courses, tall sash windows with glazing bars and a stone lintel each,
  a raised ground floor over the basement;
- a gable on each street front where the roof ends in one (the ridge runs back
  from the street), drawn from the house's year of construction on the
  Grachtenmuseum's dates: step gables to c. 1665, spout gables c. 1620-1720
  (warehouses), neck gables c. 1640-1770, bell gables c. 1660-1790, then the
  cornice (`typology.gable_type`). Each is a slab in the plane of the front, cut to
  its outline, with sandstone trims, attic windows, the loading door and its
  hoisting beam (rooftop kind 5, instanced per type in `web/buildings.js`);
- no eaves past the walls; red and glazed black pantiles, and slate;
- brick palettes, dark red-brown to purple-brown, a fifth of the fronts painted.

Sources for these numbers:
- Woollahra DCP C1 Paddington and the City of Sydney terrace guidelines;
- BlueScope's COLORBOND colour values;
- the Tokyo colour guideline and Kyoto's *The Landscape of Kyoto*;
- JSMA standard sash sizes;
- taginfo roof-shape statistics for Australia, Kanto and Kansai.

## 6. One model, three consumers

- **The browser.** Walls, roofs, parapets, coping and awnings are one mesh with packed attributes, so raycasts and the inspector still work by building. Rooftop plant is instanced. The inspector shows each building's roof and how it was chosen: ruled, drawn from the region's mix, mapped, or measured. It also shows the facade style.
- **The surface model** that ray-casts the sun (`sun.js`, `buildDSM`). A solid with a roof rises to its eaves and then follows the roof's triangles. A scenario that scales a building's height scales its roof with it.
  - In Sydney this removes 1.36 million m³ that the flat prisms counted as building (192,000 cells of 2 m, lower by 1.8 m on average).
  - The protected places barely move: Pitt Street Mall changes by +0.02 points of sun, Belmore Park's shaded share by −0.1 points, and the 90% ranges by up to ±0.8 points.
  - Protected places sit among flat-roofed towers, which is why.
- **Blender** (`blender/buildings.py`). It builds the same walls, roofs, parapets, awnings and plant. The facade grid is rebuilt from shader nodes: punched windows, curtain walls, shopfronts, whole floors, and lit rooms at night from a white-noise draw against the hour's occupancy.

## 7. Data and cost

`buildings.json` gains these fields; `docs/ARCHITECTURE.md` has the layout.
- **Per building:** style, storey and ground-floor heights, roof material, seed, roof shape and roof source, as integer codes.
- **`r`:** a roof mesh per pitched solid, base64 int16 in decimetres like the terrain grid.
- **`f`:** shopfront and awning edges.
- **`p`:** rooftop plant.

Old files without these fields still render: styles are guessed from class and height, and roofs stay flat.
`buildings.js` knows the fields by the name `build_scene.py` gives the first of them,
`style (index in styles)`. Until issue #46 it looked for `style` alone, so every city
was drawn from the guess: no machiya, Haussmann, canal house or mixed-use front, and
every pitched roof plain. The before/after stills of that fix are in
images/facade-styles/; `tools/style_shots.sh` takes them
(each city's opening view and a street view of its most characteristic styles, at
day, dusk and night, on a desktop and a phone, from `tools/style_views.py`: night at 21:00 on a winter date, and a street
view that sees past eaves and tree crowns as well as buildings) and
`tools/style_compare.py` lays two runs side by side. The stills after issue #73 (the storeys counted again,
one corner sign a building, the views past trees and at a winter night) are in
images/facade-styles/after-73/, with `corner-signs.jpg` taken from
the mixed-use cameras of the sheets above.

The integrated build, every city rebuilt (mesh and build time in headless Chrome
on a CPU, SwiftShader):

| City | `buildings.json` before → after (gzip) | Pitched roofs | Mesh | Built in |
|---|---|---|---|---|
| Sydney | 1.51 → 3.47 MB (0.46 → 1.35) | 4,190 | 1.07 M vertices, 0.53 M triangles | about 1 s |
| Melbourne | 2.22 → 4.19 MB | 4,530 | 1.41 M vertices, 0.73 M triangles | 1.1 s |
| Melbourne Bayside | 1.42 → 3.60 MB | 6,561 | 0.82 M vertices, 0.33 M triangles | 0.7 s |
| Tokyo | 3.07 → 4.63 MB | 3,130 | 1.90 M vertices, 1.17 M triangles | 2.0 s |
| Kyoto | 9.81 → 25.71 MB (2.67 → 8.90) | 45,866, most of them measured | 5.77 M vertices, 2.46 M triangles | 4.4 s |
| Osaka | 11.12 → 24.60 MB (3.27 → 8.62) | 32,955 | 6.33 M vertices, 3.12 M triangles | 4.9 s |
| Paris | new: 21.40 MB (8.71) | 24,294, 20,002 of them measured by LiDAR | 6.31 M vertices, 3.17 M triangles | 4.6 s |

The roof meshes are most of the growth: 14.6 MB of Kyoto's file, about 320 bytes
a roof. Delta-encoding their vertices would save only 2–11% after gzip, so the
format stays as it is.

Small screens skip parapets and awnings, and draw the rooftop kit only near where their map was built.

## 7b. Today's city (Shibuya, November 2026)

The map's heights were built from PLATEAU's 2020 LOD2 (as indigo-lab's vector tiles) on Overture's outlines, and its
ground from GSI's seamless photo, flown round the Scramble between June and November 2019. Since then Sakura Stage,
Dogenzaka-dori and SHIBUYA AXSH have gone up, and three blocks have come down. The first episode is played on the
crossing (the hero level, hand-modelled), on SHIBUYA SKY's roof at 229 m, at the east exit and in the helicopter, so the
errors a player sees are the city seen from above: its massing, its flat roofs and its ground.

**Buildings: a targeted update, not a swap** (`pipeline/plateau_today.py`, `pipeline/today_diff.py`). Swapping all of
the map's 48,000 buildings for the newest release would gain almost nothing on screen, and it would move the buildings
the hero levels anchor on (`cities/shibuya/hero_*.py` find them by name). So the update diffs the release against the
map and takes only what changed visibly:

| Rule | What it catches |
|---|---|
| A release building 25 m or taller (45 m or taller anywhere in the frame, below that within 1 km of SKY's deck) where the map has nothing within max(10 m, 25%) of its height | new towers; the map's 12.7 m guesses (`estimate`) under buildings surveyed at 30 m and more |
| A release building 45 m or taller that the map has at about its height, whose area above 60% of its height is not within 0.6-1.6 of the map's | a slab drawn for a tower on a podium (SAKURA Tower: 5,143 m² at 133 m in the map, 1,519 m² of tower in the release) |
| A release building lower than the map's, only where the release surveyed it again (survey year 1 in FY2025, 3,189 buildings); a record still from 2021 is measured the way the map's was, so a drop there is how the roof was measured, not a change | demolitions and rebuilds, without the false drops of rooftop billboards |
| A map building 30 m or taller with nothing of the release under it, within 1 km of the deck | buildings pulled down |
| A construction site from OpenStreetMap (`today.sites`) | what stood there goes; the release's own buildings there (flown before the demolition) do not come |

Each changed release building opens a *patch*: its footprint and the map's solids on it, grown until no release
building or map solid straddles the edge. Inside a patch the map's solids go and every release building comes,
massed from its LOD2 roofs (one solid per roof level: faces within 3 m merged), each roof's height in metres T.P.
over the map's own ground under it. Where a release building matches one map solid (IoU 0.6 or more) and has one roof
level, the map's solid is only re-topped, and it keeps its style. Added buildings take the style of the map building
they replace when that was as tall, else one by their use and height, and the colours of the nearest standing building
of that style. Nothing is touched within 25 m of a hero level, on the Toyoko site behind Hachiko (the owner's choice:
the West and South buildings stand, though FY2025 has removed them), on a solid a landmark draws or a hook names, or
on a building `today.osm` keeps (SHIBUYA AXSH: the release has it half built at 50.8 m, flown March 2023; OSM's 120 m
outline stays). The result is `cities/shibuya/today.json`: 147 patches (165 buildings, 456 solids), 21 re-topped
solids, 223 solids taken down (`landmarks.json` "demolished", from `city.py` `landmark_demolished`; the page draws them
flat and leaves them out of the visibility raster). Its additions are appended, so no solid index any landmark, scene
or hero level holds moves, and `apply` takes its own rows off first.

The construction sites (`city.py` `today_sites`, `works_site`): the Upper West Project on the Tokyu main store's site
(OSM way 1194193924, due FY2029), Dogenzaka 2-chome South (1159013859, February 2027) and MITAKE Link Park (1558469714,
June 2027), each a 3.5 m white hoarding round OSM's outline, floodlights on 16 m masts and a tower crane over the middle
(its position and height illustrative). On the ground photo each is one even tone of a site's ground.

**Checked against the 2023 LiDAR** (`tools/lidar_heights.py`: the top of the points inside each footprint over the
solid's base, both metres T.P.). Finished towers agree within a few metres: Scramble Square 229.9 m (map 227.1), Shibuya
Stream 180.1 (182.3), Hikarie 183.1 (182.8), SHIBUYA Tower 185.7 (180.0). SAKURA Tower's measured height in the release,
116.3 m, is taken from the top of its slope; its roof is at 128 m over the slope's foot, as its LOD2 roofs are (the
map now 126.9 m). Dogenzaka-dori: 111 m over the foot of Dogenzaka (101.2 m is the official height from the street).

**The ground: Tokyo's 2023 photograph** (`pipeline/fetch_tokyo_ortho.py`, `pipeline/ortho_tokyo.py`). Tokyo's Digital
Twin project flew the 23 wards in March and April 2023 for its LiDAR and published a 0.2 m ortho with it: 195 sheets of
400 x 300 m cover the frame. Each is averaged to the map's 1 m in its own grid (zone IX, EPSG:6677) and resampled into the
frame. It is a "simple" ortho (rectified to the bare earth), flown in late morning with long shadows, so before it
reaches the tiles:

- the shadows come out: the map's own buildings are lit by the sun the photo was flown under (azimuth 150°, elevation
  45°, fitted to its shadows), and where they shade the photo and it is dark, each channel is raised by the measured
  ratio of lit to shaded ground in the shadows of towers 25 m and taller (red the most: a shadow is lit by the blue sky);
- the leaning walls come off the ground: each tower's lean in the photo is measured (its roof's outline moved to where
  it meets the photo's strongest edges; median 0.08 m a metre, most roofs on their footprints), and the ground a tower
  40 m or taller sweeps over, and a 2 m band at the foot of every building over 20 m, is filled from the ground round it;
- its brightness range is matched to the GSI tiles' (2nd to 98th percentile), its own neutral white balance kept
  (matching GSI's channels tinted the ground and the lifted shadows blue);
- the open ground is softened as the build does (`aerial_clean.soften`), with buildings.json and game.json's roads.

Outside the frame the GSI photo stays, with a 20 m blend at the frame's edge. What is not done: true orthorectification
(the photo's camera positions are not published), and the street trees and parked cars the 2023 photo has printed.

## 8. What is next

- **More measured roofs.** Osaka's 2020 CityGML is LOD1 only and Tokyo's vector tiles carry heights, not roof faces. Newer PLATEAU releases with LOD2 for those wards would replace their inferred roofs the same way.
- **A roof classifier on imagery.** Inputs: footprint shape, class and height, plus luminance asymmetry across the ridge in the aerial photo. Training data: about 5,800 mapped roofs in Greater Sydney, and Kyoto's 79,889 measured roofs. This is what Mapbox and Microsoft Flight Simulator do, but here it would be scored like everything else.
- **Rendering on r186.** Cascaded shadow maps (`CSM`), and screen-space ambient occlusion (`GTAOPass` or N8AO). The baked openness term covers ambient light at street scale today.
- **Sydney terrace street parapets.** These hide the roof on about 40% of Victorian terraces. Also rake overhangs on two-plane gables.
- **Headless test renders.** These use SwiftShader. Its software shadow filtering shows dotted shadow edges that a GPU does not.
