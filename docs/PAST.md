# What the camera sees: the things of 1964

Through the story's finder, and only there, a thing of 1964 stands where it stood (docs/STORY.md, "The camera sees
1964"). The models are built by `blender/build_past.py` into `web/assets/past/past.glb`; `web/game/past.js` draws them;
each frame places its own in `cities/shibuya/city.json` (`game.story` episodes, `frames[i].task.relic`). This page
records what each model is drawn from, what was adopted and what was left as a liberty. The models are our own
geometry: proportions, layout and colour were learnt from the sources below, nothing of theirs was copied.

## The look

One look for everything of that year, a silver print's (`past.js`): three quarters of the colour taken to a warm grey
scale between a lifted black (the paper's, never pure) and a warm white, so that the red of a pillar box still reads as
red but quietly; a fine grain that moves at 24 frames a second; a soft warm light along each form's edge (a rim term on
the angle to the eye), which is what separates the past from tonight's street in the same frame; and its own key and
fill light, since tonight's light is not its light. A thing forms the first time it is inside the finder's lines: in
0.8 s its points come out of a glow of grain into the solid (`REVEAL_MS`); the photograph taken always has it whole.

Things that stood where something has since been built (`over`: the dome inside Hikarie, the river under the street)
are drawn through what is there now. Their depth is written just past the near plane in their own order, so they hide
themselves as a solid does and nothing of tonight hides them.

## The two sites

The dome and the river are not things on a pavement: each is a place that fills its frame, seen from one stand point,
and each is the answer its frame is asked for. Until November 2026 they were the roughest models of the story: a pale
box under a hemisphere, and a grey trough with a flat sheet in it, drawn once at 0.86 of themselves with both sides of
every face, so that their far walls and tonight's windows showed through them (issue 100). What was done, and why:

- **A solid, drawn twice.** A site's depth alone is drawn first, then its colour where that depth is (`past.js` `make`,
  `pre`). It hides itself from whichever side its faces are wound and in whatever order they come, and nothing shows
  through it. Where it goes out into tonight (the street at the building's foot, the footbridge, the far end of the
  river) its vertices' alpha falls to nothing, and there it hides nothing.
- **Its own evening's light, in its colours.** A print keeps its blacks by what stands over what. `build_past.py`
  `shade` lights each site once: from every vertex, twenty rays over the hemisphere (how much of the sky it sees
  within a few metres) and one to the key light (whether something stands in the way), multiplied into the vertex's
  colour. A window set back a foot behind its spandrel, the roof behind the parapet, the foot of the river's wall and
  the water under the bridge are dark because of that, not because a tone was laid on them. The page lights a site by
  the same key (`relic.key`, [east, north, up]; the dome's is the afterglow in the west-south-west, which is on the
  face to the station), tonight's lamps add almost nothing to it, the edge light that separates a thing from tonight's
  street is all but off (a wall looked along is not a form's edge), and the print's black for a site is deeper
  (0.024 against a thing's 0.075).
- **Water that mirrors.** The river is a sheet whose colour at each point is what a mirror lying there, tilted by
  the ripples, shows the lens at the stand point: a ray from the lens is reflected in it and cast into the site
  (the wall, the board, a red lamp) or leaves it for the evening sky; the flatter the sheet is looked along the more of
  the mirror and the less of the water's own dark (Fresnel's term). Nine rays over each point's own patch of water, so
  that the sheet carries no finer ripple than its points can. It is right from the stand point and nowhere else, and
  the finder shows the past from nowhere else (docs/STORY.md, rule 5).
- **Detail the material explains.** The dome's aluminium is laid in sheets, 32 gores by 9 rings, with a standing seam
  between; each sheet is flat, and shows the sky it is turned to. The roof is concrete slabs with a joint every 4.4 m.
  The river's wall is stones laid in level courses, each half a stone over the one under it, the joints the wall
  behind them; its two lowest courses are damp. No tone is random.
- **What a phone holds.** The two sites have 18,000 vertices each (7,100 and 10,700 before). `past.js` now keeps every
  model's colours at 16 bits and normals at 8 (24 bytes a vertex, from 40), so the river is the size on the GPU it
  was (0.44 MB of vertices against 0.43) and every other model is two fifths smaller; and a frame's models leave the
  GPU when the frame is done (`remove` disposes them), where a phone at frame 5 still held the board, the box, the
  lamp and the dome it had photographed (0.5 MB, issue 105).

`python blender/build_past.py --only dome,river --view DIR` renders the two as their frames see them (the stand
point, the lens, a desktop's and a phone's picture) in a few seconds, before the story is played; `--only` keeps every
other model in `past.glb` byte for byte (their lettering is the building machine's fonts).

## The afterimages

The people of that year (the story's afterimages, `game.story` frames' `afterimage`, cast as Rocketbox avatars) have the
same look as the things, laid differently: they are not in the finder only, they stand in tonight's street, and they
read as a person left in an old exposure rather than a ghost (docs/STORY.md, rule 3). `OEPeople.exposure`
(`web/game/people.js`), applied by the story's `figure` in `web/game/game.js`:

- **Their own body, face and clothes.** A figure made before its character has come stands in as someone of the
same sex until it does, and then is swapped for itself where it stood (five of the cast were once one man in a
vest); the story asks for its cast as the game opens.
- **The print's tones.** The avatar's materials are kept and patched, not replaced: the same silver print
  tones as the things (85% of the colour to the warm grey scale, lifted blacks, the warm white), a living grain at 24
  frames a second, and a soft warm light on the edge that rises with how light the surface is. A little of their own
  light (a key from above) so that a face is read at night, much less than a thing of 1964 has: they stand in the
  street's light too.
- **A double exposure, not a hologram.** They are drawn as a second exposure is laid on a first: what they add, over the
  street let through as much as they are dark (blend one, one minus alpha, alpha falling to 0.45 where they are dark).
  Against a lit shop front a dark coat is half there; against the night they stand whole. No outline, no glow, no blue,
  and no shadow thrown on tonight's ground.
- **They move.** The held crowd does not; an afterimage plays its own idle clip, and its head turns to the player (two
  fifths at the neck, the rest at the head, up to 70 degrees each way, eased), and its body comes round only when the
  head cannot reach. The turn is laid over the clip's pose after the mixer and taken off before the next update, so
  that a held world, where the clip may not move a bone, never winds it round (AGENTS.md).
- **The living of tonight** (`cast`: Mrs Hayase, Mr Tanaka) are not touched.

What was learnt from, not copied: the double exposure of film and of the cinema's dissolves, where the second image is
added to the first and only its light shows (the screen blend of compositing); *Return of the Obra Dinn* (2018) and
*Ghost Trick* (2010) for the dead as a held moment that is read rather than feared; past.js's own silver print. The
blending is three.js's `CustomBlending` (MIT).

**What the cast cannot show.** The avatars are of today: there is no 1964 among them. Sumiko is a fair-haired
young woman in a jacket and cargo trousers, not a Japanese lift girl of 22 in her store's uniform with a pillbox
hat and one glove; the detective is a present-day officer in a white shirt and a peaked cap, not a 1964 detective
in a hat and a raincoat; Kanbara is in shirtsleeves, not a 1964 suit; Tatsuo is in a blue work uniform, bare-headed
where a site of 1964 would have given him a helmet; Akira in a tweed jacket is the nearest to his year. The print's
tones take the most modern of it away (no saturated colour, no logo reads), but the cut of the clothes and the
faces are today's, and Sumiko is not cast as who she is. That waits on faces and costume (issue 12).

## The things

| Model | Drawn from | Adopted |
|---|---|---|
| `board` | Japanese event signboards (tate-kanban) of the 1950s and 60s; the Gotoh Planetarium's programme lettering | A tall board on two legs under a small gable roof, 2 m to the ridge. A painted night sky at its head with the dome on its building, projector beams, Cassiopeia and a crescent moon; the title lettered top to bottom in columns read right to left: 五島プラネタリウム (black), 今夜の星空 (red), 十月十日 午後七時, and who gives the lecture: 解説 水野 晶, and 東急文化会館 八階 across the foot (the planetarium was on the eighth floor). Bold gothic for the title so its strokes hold at 7 m. |
| `postbox` | Post Office pillar box type 1 (郵便差出箱1号, 1949): body 135 cm high, 40 cm across, on a root stone 60 cm across (ja.wikipedia 郵便ポスト) | The cylinder on its root stone, the cap flaring to a brim, the slot under the cap with its hood, the white collection-times plate, the 〒 on its breast, the collection door at the back. Vermilion. |
| `umbrella` | A black eight-rib umbrella | Open and set down on its rim to dry, crown to the front; the panels sag between their ribs and the edge is scalloped. Open, because a furled umbrella is a line at 25 m. |
| `tram` | Tokyu type 200 (デハ200, "Pekochan"), Tamagawa line, 1955 to 10 May 1969: two bodies of 10.2 m (21 m over both) on three bogies, the middle one shared; 2.3 m wide, 3.05 m high; light green with a cream band under the windows; one pantograph, on the body towards Futakotamagawa-en; side windows 1.0 by 0.9 m, a single door behind the cab and double doors (ja.wikipedia 東急デハ200形電車) | The two bodies and the bellows between, round faces with three windscreens, the lamp low in the middle, 渋谷 in the destination box at the Shibuya end and 二子玉川 at the other, a route board over the windows on each side reading 三軒茶屋 経由 (the line ran Shibuya, Sangenjaya, Futako-Tamagawaen), デハ203/204 on the sides, the pantograph on its wire, the rails in setts, and the stop's safety island with a round stop sign. **Not drawn since November 2026:** from 1939 to 1969 the line left Shibuya from the second floor of the Tamaden building behind today's Hachiko square, and no tram stood at a stop at that kerb in 1964 (docs/STORY.md, section 4). Kept in `past.glb`. |
| `shoeshine` | A shoeshine boy's kit; the Bank of Japan's series B 100 yen note (1953 to 1974; Itagaki Taisuke, 148 by 76 mm), the note in use in 1964 | The box with its foot-rest, his stool with a cloth on it, a brush; くつみがき lettered on the box; on its lid a hundred-yen note (the portrait's oval at its left, 百円 at its right) under the tin of polish. In frame 2 it stands alone at the station kerb, on the line from the old man's blossom to her corner, so that her corner is across the road behind it. |
| `lamp` | The red globe lamp that marks a police box | The globe on its bracket and stay at the head of an iron post, and a name plate, 派出所 (the official word for a police box until 1994). |
| `dome` | Tokyu Bunka Kaikan (Junzo Sakakura, built by Shimizu, opened 1 December 1956, closed 30 June 2003; steel and reinforced concrete, one basement, eight storeys and a three-storey penthouse, 30,000 m² of floor on a 5,103 m² site; known for the four large film hoardings seen from the station's east exit; ja.wikipedia 東急文化会館) and the Gotoh Planetarium on its roof (1 April 1957 to 11 March 2001; the projection dome 20 m across, 453 seats; ja.wikipedia 天文博物館五島プラネタリウム). 43 m to the top of the dome, where the law's limit for a building was 31 m; a footbridge 8 m wide and 95 m long ran from it to the station over Meiji-dori, beside the Ginza line's viaduct (Tokyu's history, chapter 2). The dome was silver (film stills of 1960 to 1964). In the aerial photograph of about 1960, taken from the south-west over the station's east plaza, the building is a slab in flat bands of windows and pale spandrels, its short face to the plaza; on its flat roof, inside a low parapet, the dome stands on the north side a third of the way along from the station end, on a low drum in a wide dark ring, its skin a fine pale grid; in front of it, at the station end's south corner, a penthouse tower three storeys high; along the south side beyond it a long low roof in ribs, and a second tower near the far end; the covered footbridge leaves the north-west corner for the station. The building was demolished in 2003; Shibuya Hikarie stands on its site. | The slab 84 by 46 m and 31 m to its roof, its short face to the station and Meiji-dori and its long side along Hikarie's south edge (20 degrees north of east): the shape of Hikarie's plot, which is 48 m on the street and 85 m deep. A ground floor of lit shop fronts under a canopy; seven storeys of ribbon windows set back a foot behind the spandrels, a pier at every bay, the rooms lit by threes as at half past five; the four hoardings across the station face, each a painted board in a frame with a trough of lamps at its foot, and 東急文化会館 over them; the footbridge from the north side, going out into tonight. The roof, laid out as the aerial photograph has it: concrete slabs jointed every 4.4 m inside a coped parapet; the three-storey penthouse a tower at the station end's south corner, in front of the dome; the long ribbed roof of the cinema's hall along the south side; a second tower and a stair head at the far end; and what the photograph is too coarse to show, a steel water tank on its stand, two cooling towers and a row of vent cowls. The dome on the roof's north side, 20 m in from the station face, 21 m across over its sheets (the 20 m projection dome inside it) on a drum 1.2 m high, its top 12.5 m over the roof (43.5 m): aluminium sheets in 32 gores and 9 rings, a ventilator at the crown. |
| `river` | The Shibuya River (ja.wikipedia 渋谷川): walled along nearly its whole length in 1929 to 1931; the stretch from just below Miyamasu Bridge down to Inari Bridge covered in 1961 ahead of the Olympics (the ward's sheet gives 1960 to 1962 for the river beside the station, moved east and put under upstream of Inari Bridge); the length directly below Miyamasu Bridge already under the Toyoko store since 1934. The ward's photograph of 1960 from Inari Bridge, looking up the river: near-vertical walls of squared blocks in level courses, dark and stained, a plain flat coping, a low ledge of concrete at the wall's foot, shallow dark rippled water, a drain running out of the wall, cars parked at the edge with almost no fence. Its photograph of 1959 at Horinouchi Bridge: a thin handrail of steel pipe on slender posts, about a metre high, round timber posts with strands of wire, a board fence. Its photograph of the works in 1961: the new channel a concrete box with a slab over it, beside the old one. | Six metres between walls of squared stone in level courses of 32 cm, each stone half a stone over the one under it, the two lowest courses damp; a flat coping in stones of 96 cm, a ledge of concrete at the foot, the water 2.6 m down; a stoneware drain in the west wall with its collar, what runs out of it and the rings where it falls in; a pipe rail on slender posts along each bank. Miyamasu Bridge (宮益橋) behind the lens, with a solid parapet rail on pierced panels and four newel posts with the name, and beyond it the dark mouth where the river went in under the store. Up the river, the works coming down it: a timber gantry across the channel with the contract's board, 渋谷川暗渠工事, and under it 工事主任 神原 and 現場主任 早瀬 (the story's men), red lamps on trestles along both banks, planks stacked on the west bank, a board fence on the east and posts and wire on the west, the channel shored with walings and struts, and at 31 m the new culvert's slab across it, its mouth dark under it, props under the slab's edge and the bars of the next pour standing out of it. The channel follows Meiji-dori (21 degrees west of north), whose line the old river kept on the station side. The frame is taken from the bridge, looking up the river: from its bank, the near wall hides the water. |

## Framing

Each frame with a thing of 1964 has a stand point (`task.stand`) and a lens (`task.lens`, the finder's vertical
field in degrees, set when the camera is raised and given back when it is lowered), chosen so that the thing fills
about a third of the finder at 1440x900 and reads on a 390x844 phone (where the print is a band across the middle of
the screen held upright, and the finder's lines are drawn inside it: docs/STORY.md, "The lines are the print"): the board at 6.5 m through 40 degrees; the boy's
box and stool at the kerb, 9.4 m from the stone cherry blossom nearest the crossing, through 20, turned to the lens and on
the line to her corner, which stands across the road behind them (until November 2026 a tram stood broadside behind the
box, at 14 m through 50: see the tram above); the building and its dome from the Scramble
Square roof through 24, 67 degrees under the horizon (a raised camera now looks down to 75; at 57 the dome sat on the
picture's lower edge); the river from the bridge through 50; her corner from his kerb through the longest lens, 12. Her corner is the kerb: the board, the pillar box with her umbrella against it, the girl and the old woman stand on tonight's pavement a metre or two behind the kerb line at the Scramble's north-west corner (`cities/shibuya/scramble.py` `Plan`, its `pave`), never on the crossing's paint. Until November 2026 they stood out on the diagonal crosswalk, 3 to 10 m into the road, and the first photograph of the story was of a signboard on zebra stripes.
The afterimage of each frame stands beside the sightline, not in it, and the crowd standing in it is sent on when the
frame begins (`clearSight`, `web/game/game.js`). Where the thing is small and what stands behind it is the point of the
picture (frame 2: the boy's empty stool, and her corner across the road, where he ran), the way on past it and a ring
round it are kept clear too (`task.clear`, points beyond the thing; `task.clear_round`, metres), and the lens is aimed
0.6 m above it (`eye`), so that the box sits below the middle of the print and the crossing (and, on a desktop, her
corner) stands above it; a phone's print, cut from a portrait screen, keeps the box whole and the crossing.

## Liberties

- The river at the station was covered in 1961; the story's evening is in 1964 and has Kanbara's works putting it
  under. The camera shows it open, as the story needs.
- The board's wording (今夜の星空, the date and the hour) is invented for the story's lecture.
- The building's footprint is an estimate from the site area and the west part of Hikarie's footprint (OpenStreetMap
  way 渋谷ヒカリエ), and what stands where on the roof is read off the aerial photograph of about 1960 by eye, to a
  few metres. For an hour in November 2026 the model was a slab along Meiji-dori with the dome at its north end,
  until the plot's shape was measured and the photograph looked at.
- Not documented in our sources, and so chosen: the dome's outer diameter (21 m over a 20 m projection dome) and its
  metal (silver in the films; aluminium here), the count of its gores and rings (the photograph shows a grid too
  fine to count), the colours of the walls, what stood on the roof in 1964 beyond the penthouses (the tank, the towers
  and the cowls are what a roof of 1956 carried), the hoardings' pictures, and the name's lettering over them. The
  drum's lettering of the model before (五島プラネタリウム) had no source and is gone.
- The river's width and depth are estimates from the photographs (6 to 8 m, walls 3 to 3.5 m). No photograph of
  Miyamasu Bridge's parapets in 1959 to 1964 was found, and no legible works board or lamp of those years: the
  gantry, the board's wording and the red lamps are the story's.

## Lettering

The lettering is the system's CJK fonts turned into mesh at build time: Hiragino (Kaku Gothic W6/W8, Maru Gothic W4,
Mincho) on a Mac, Noto CJK (SIL Open Font License) on Linux. Only the outlines of the characters used go into the
model, as geometry.

## Sources

- ja.wikipedia: 天文博物館五島プラネタリウム, 東急文化会館, 東急デハ200形電車, 郵便ポスト, 渋谷川 (read November 2026; CC BY-SA 4.0,
  facts only).
- Tokyu Corporation, the company's history, chapter 2 section 2 (tokyu.co.jp/history/chapter02_2_2/): the building's
  height, the footbridge, a photograph of it under construction. Copyright Tokyu; read for facts, nothing reproduced.
- Wikimedia Commons, *View of Shibuya circa 1960* (File:View_of_Shibuya_circa_1960.jpg; author unknown, a book scan;
  public domain in Japan, possibly not in the United States): the aerial photograph the massing, the roof and the
  dome's grid are read from. *Shibuya Tokyu Bunka Kaikan 2003* (File:Shibuya_Tokyu_Bunka_Kaikan_2003.jpg; Imtn, CC
  BY-SA 2.5) and *Tokyu Bunka Kaikan 2006 Tokyo* (File:Tokyu_Bunka_Kaikan_2006_Tokyo.jpg; Shiodome, GFDL / CC BY 3.0):
  the banded face and the dome low behind the roof's rail, in its last year. Looked at; none is in the repository.
- Film stills of 1957 to 1967 with the building in them, among them the roof in *Yaburezaru mono* (1964), collected at
  tokyofukubukuro.com/pochi-2/?p=27003: the silver dome. Copyright their studios; looked at only.
- Shibuya ward, the sheet on the river in its town plan papers (files.city.shibuya.tokyo.jp, spub03_10.pdf), with four
  photographs of 1933, 1959, 1960 and 1961 from the Shirane Memorial Shibuya Folk and Literary Museum's
  『「春の小川」の流れた街・渋谷』 and the ward's board of education's 『渋谷の記憶』: the walls, the coping, the ledge, the drain,
  the rails and fences, the new culvert. Copyright the ward and the museum; looked at only. No freely licensed
  photograph of the open river at the station was found.
- OpenStreetMap (ODbL), `cities/shibuya/scramble_osm.json`: the footprints of Shibuya Hikarie and Shibuya Scramble
  Square, Meiji-dori, Inari Bridge.
