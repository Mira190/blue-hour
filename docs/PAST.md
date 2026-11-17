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

## The afterimages

The people of that year (the story's afterimages, `game.story` frames' `afterimage`, cast as Rocketbox avatars) have the
same look as the things, laid differently: they are not in the finder only, they stand in tonight's street, and they
read as a person left in an old exposure rather than a ghost (docs/STORY.md, rule 3). `OEPeople.exposure`
(`web/game/people.js`), applied by the story's `figure` in `web/game/game.js`:

- **Their own body, face and clothes.** The avatar's materials are kept and patched, not replaced: the same silver print
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

**What the cast cannot show.** The avatars are of today: there is no 1964 among them. Sumiko is a young woman in
everyday clothes, not a lift girl in her store's uniform with a pillbox hat and one glove; the detective (Rocketbox's
police avatar) is a young man of today in a work vest over a sweater, not a 1964 detective in a hat and a raincoat;
Kanbara is a modern suit; Tatsuo a construction worker of today in a work shirt, bare-headed, where a site of 1964 would have given him a helmet.
The print's tones take the most modern of it away (no saturated colour, no logo reads), but the cut of the clothes is
today's. That waits on faces and costume (issue 12).

## The things

| Model | Drawn from | Adopted |
|---|---|---|
| `board` | Japanese event signboards (tate-kanban) of the 1950s and 60s; the Gotoh Planetarium's programme lettering | A tall board on two legs under a small gable roof, 2 m to the ridge. A painted night sky at its head with the dome on its building, projector beams, Cassiopeia and a crescent moon; the title lettered top to bottom in columns read right to left: 五島プラネタリウム (black), 今夜の星空 (red), 十月十日 午後七時, and who gives the lecture: 解説 水野 晶, and 東急文化会館 八階 across the foot (the planetarium was on the eighth floor). Bold gothic for the title so its strokes hold at 7 m. |
| `postbox` | Post Office pillar box type 1 (郵便差出箱1号, 1949): body 135 cm high, 40 cm across, on a root stone 60 cm across (ja.wikipedia 郵便ポスト) | The cylinder on its root stone, the cap flaring to a brim, the slot under the cap with its hood, the white collection-times plate, the 〒 on its breast, the collection door at the back. Vermilion. |
| `umbrella` | A black eight-rib umbrella | Open and set down on its rim to dry, crown to the front; the panels sag between their ribs and the edge is scalloped. Open, because a furled umbrella is a line at 25 m. |
| `tram` | Tokyu type 200 (デハ200, "Pekochan"), Tamagawa line, 1955 to 10 May 1969: two bodies of 10.2 m (21 m over both) on three bogies, the middle one shared; 2.3 m wide, 3.05 m high; light green with a cream band under the windows; one pantograph, on the body towards Futakotamagawa-en; side windows 1.0 by 0.9 m, a single door behind the cab and double doors (ja.wikipedia 東急デハ200形電車) | The two bodies and the bellows between, round faces with three windscreens, the lamp low in the middle, 渋谷 in the destination box at the Shibuya end and 二子玉川 at the other, a route board over the windows on each side reading 三軒茶屋 経由 (the line ran Shibuya, Sangenjaya, Futako-Tamagawaen), デハ203/204 on the sides, the pantograph on its wire, the rails in setts, and the stop's safety island with a round stop sign. |
| `shoeshine` | A shoeshine boy's kit; the Bank of Japan's series B 100 yen note (1953 to 1974; Itagaki Taisuke, 148 by 76 mm), the note in use in 1964 | The box with its foot-rest, his stool with a cloth on it, a brush; くつみがき lettered on the box; on its lid a hundred-yen note (the portrait's oval at its left, 百円 at its right) under the tin of polish. In frame 2 the box stands in the foreground, the tram behind it. |
| `lamp` | The red globe lamp that marks a police box | The globe on its bracket and stay at the head of an iron post, and a name plate, 派出所 (the official word for a police box until 1994). |
| `dome` | Tokyu Bunka Kaikan (Junzo Sakakura, opened 1 December 1956; one basement, eight storeys and a three-storey penthouse, on a 5,103 m² site; known for the four large film hoardings that faced the station; ja.wikipedia 東急文化会館) and the Gotoh Planetarium on its roof (1 April 1957 to 11 March 2001; dome 20 m across; ja.wikipedia 五島プラネタリウム). The building was demolished in 2003; Shibuya Hikarie stands on its site. | The building as a block of ribbon windows 84 by 46 m and 32 m high, its long side along Hikarie's (20 degrees north of east); the four hoardings and 東急文化会館 on the station face; the penthouse; the dome, 20 m across, on a drum lettered 五島プラネタリウム on the side that faces the Scramble Square roof. The dome's place on the roof is not documented in our sources: it stands in the middle. |
| `river` | The Shibuya River (ja.wikipedia 渋谷川): walled along nearly its whole length by 1931; the stretch from just below Miyamasu Bridge down to Inari Bridge covered in 1961 ahead of the Olympics; the length directly below Miyamasu Bridge already under the Toyoko store since 1934 | Six metres between walls of coursed squared stone, the water three metres down, a fence along each bank, Miyamasu Bridge (宮益橋) at the foot of today's tower with a solid parapet rail on pierced panels and four newel posts with the name, and beyond it the dark mouth where the river went in under the store. Upstream, the works: a timber gantry across the channel with the contract's board, 渋谷川暗渠工事, and under it 工事主任 神原 and 現場主任 早瀬 (the story's men), and red lamps on trestles along both banks. The channel follows Meiji-dori (21 degrees west of north), whose line the old river kept on the station side. The frame is taken from the bridge, looking up the river: from its bank, the near wall hides the water. |

## Framing

Each frame with a thing of 1964 has a stand point (`task.stand`) and a lens (`task.lens`, the finder's vertical
field in degrees, set when the camera is raised and given back when it is lowered), chosen so that the thing fills
about a third of the finder at 1440x900 and reads on a 390x844 phone: the board at 6.5 m through 40 degrees; the tram
three-quarters on, its Shibuya face towards you, at 24 m through 40; the building and its dome from the Scramble
Square roof through 34; the river from the bridge through 50; her corner from his kerb through the longest lens, 22.
The afterimage of each frame stands beside the sightline, not in it, and the crowd standing in it is sent on when the
frame begins (`clearSight`, `web/game/game.js`). A phone's portrait finder takes in the tram's side, not its whole
length.

## Liberties

- The river at the station was covered in 1961; the story's evening is in 1964 and has Kanbara's works putting it
  under. The camera shows it open, as the story needs.
- The board's wording (今夜の星空, the date and the hour) is invented for the story's lecture.
- The dome's exact place on the building's roof, and the building's exact footprint, are estimates from the site area
  and Hikarie's footprint (OpenStreetMap way 渋谷ヒカリエ).

## Lettering

The lettering is the system's CJK fonts turned into mesh at build time: Hiragino (Kaku Gothic W6/W8, Maru Gothic W4,
Mincho) on a Mac, Noto CJK (SIL Open Font License) on Linux. Only the outlines of the characters used go into the
model, as geometry.

## Sources

- ja.wikipedia: 五島プラネタリウム, 東急文化会館, 東急デハ200形電車, 郵便ポスト, 渋谷川 (read November 2026).
- OpenStreetMap (ODbL), `cities/shibuya/scramble_osm.json`: the footprints of Shibuya Hikarie and Shibuya Scramble
  Square, Meiji-dori, Inari Bridge.
