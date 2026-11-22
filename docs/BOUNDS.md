# The edge of the planned area

The owner's ask (November 2026): walking, driving and flying all have a boundary. Past it the player is told that the
rest of the area is still being built, and is never let out of the planned area, because past it is only waste ground.
This page records how games do it, what was adopted, and how it works here (`web/game/bounds.js`,
`pipeline/bounds.py`, `tools/bounds_check.js`).

## How games keep a player inside the made world

These were surveyed from wikis, guides and players' reports (developers say little about their edges). Each line names a
source; anything not confirmed is said to be so.

| Game | On foot, by car or boat, in the air | How it is said |
|---|---|---|
| GTA V | Out at sea a boat's or plane's engine fails, and a swimmer meets a shark ([sportskeeda](https://www.sportskeeda.com/gta/pacific-ocean)). Aircraft have a ceiling near 2,470 m: they climb a few metres over it and sink back ([gta.wiki](https://gta.wiki/w/Ceiling_Height_Limit)). Fort Zancudo's airspace: a radio warning first, then stars and jets ([gta.wiki](https://gta.wiki/wiki/Fort_Zancudo)) | All in the world: an engine, the radio, no text over the picture |
| GTA III, Vice City, IV | Bridges closed until an island opens: a bombed bridge, a hurricane warning with barricades, police cars across the bridges for a terror alert ([grandtheftwiki](https://www.grandtheftwiki.com/Closed_Bridges)) | A reason in the place. Vice City's barricades still had an invisible wall behind them |
| San Andreas | No reason given: crossing early brings four stars | Punishment, not a reason: the least liked |
| Cyberpunk 2077 | "Now leaving Night City" signs, then a prompt to turn back; driven on, the screen breaks into static and you are back inside. Closed areas have roadblocks and "You can't go here yet" ([gamepressure](https://www.gamepressure.com/cyberpunk-2077/is-it-possible-to-leav-the-world-map/zee063)) | A sign in the world first, a line on the screen next, a hidden reset last |
| Battlefield | Outside the combat area a countdown of 3 to 15 s; in Battlefield 1 the picture drains to grey and the announcer orders you back ([fandom](https://battlefield.fandom.com/wiki/Boundary)) | The interface, with a voice |
| Far Cry 3, 6, Primal | Leaving a mission's area: "Leaving mission area", and the mission is failed ([primagames](https://primagames.com/eguides/far-cry-3-with-interactive-map-eguide/walkthrough/the-main-campaign/the-south-island), [Steam](https://steamcommunity.com/app/371660/discussions/0/405693392912566444)). A countdown there is not confirmed | The interface: players dislike it |
| Red Dead Redemption 2 | Arthur in New Austin: bounty hunters, then a marksman's single shot (players' reports, [Steam](https://steamcommunity.com/app/1174180/discussions/0/1750142582990153464)) | In the world, but a death |
| Breath of the Wild | An invisible wall at the world's edge, and "You can't go any farther" ([destructoid](https://destructoid.com/?p=252655)) | A wall with a line: the plainest |
| Ghost of Tsushima | No waypoints: the Guiding Wind blows towards the goal ([pushsquare](https://www.pushsquare.com/news/2020/04/ps4_exclusive_ghost_of_tsushima_wont_have_waypoints_telling_you_where_to_go)). The island's regions open with the story. The sea's edge is not confirmed | Steering, not a fence |
| Marvel's Spider-Man | Manhattan alone, the rivers round it; players swam out "until the map disappeared" ([kotaku](https://kotaku.com/spider-man-one-month-later-1829603233)). The exact edge is not confirmed | Geography |
| Microsoft Flight Simulator | No edge: the whole planet is streamed ([TechCrunch](https://techcrunch.com/2020/08/17/meet-the-startup-that-helped-microsoft-build-the-world-of-flight-simulator)) | None needed |
| Forza Horizon 4 and 5, Ace Combat 7, The Witcher 3 | Players report invisible walls and resets (Forza), mission lines (Ace Combat) and sea edges (The Witcher). None was confirmed from a primary source | |

What reads as part of the world, from these:

1. **A reason in the place**: a bombed bridge, a hurricane, a police line, road works, a radio call. Not a wall, and not
   a line of text alone.
2. **Steps, not a stop**: the sign before the line, the radio before anything happens. Never straight to a hard stop.
3. **One signal per kind of edge, said the same way each time**, and said before it matters.
4. **A soft ceiling**: the aircraft climbs a little over it and sinks back.
5. **Turned back, not stopped or killed.** The invisible wall (Breath of the Wild) and the death (Red Dead's
   marksman, GTA's shark) are what players complain of.
6. **Any reset is hidden** (Cyberpunk's static), and puts the player somewhere sensible. Better still, none.
7. **Steer before you fence** (the Guiding Wind), so the edge is seldom met.

No code or art was taken from any of these. What was taken is the design: GTA's and Cyberpunk's reason in the place,
GTA's radio and soft ceiling, and the turn back rather than a wall.

## What was adopted

**Where the edge is: from the data, not by guess** (`pipeline/bounds.py`, written to `cities/shibuya/city.json`
`game.bounds`, copied by `pipeline/game_text.py`).

- **The ground's edge** is the convex hull of what the story and the walk are played round. Each place gets room
  round it: the hero levels' circles plus 45 m (docs/HERO.md), and 70 m round every place a frame of the story stands
  in or looks at, the walk's views from the street, the start and the car's kerb. The hull is simplified to twelve
  corners, each simplification moving an edge outward only. That gives x 189 to 684 and y -1223 to -854: about 500 by
  370 m round the Scramble, Center Gai's mouth, 109's fork, Hachiko, Miyamasu, the Ginza line's box and Scramble
  Square. It lies well inside the phone's district (`phone_district`), so a phone builds everything inside it at full
  detail (docs/PERFORMANCE.md).
- **The air's edge** is the same places given 360 m, plus 120 m round the landmarks the walk's opening flies past
  (Cerulean Tower, Hikarie): x -114 to 978, y -1518 to -559. It is wider than the ground's because the helicopter sees
  further. It turns back over the built city, still inside the phone's district, before the land past it shows.
- **The ceiling** is 420 m above the sea: well over SKY's roof (244 m), and under Haneda's approach, which is the
  reason the tower gives.

**How it is met** (`web/game/bounds.js`, a part of the game: docs/SEAMS.md).

- **The road works.** Each street and footway that crosses the ground's edge is closed by road works across it, on the
  outer side, facing in: a line of red cones (the Japanese pattern, with the white bands) joined by yellow-and-black
  bars, two A-frame barricades with amber lamps that blink out of step at night, and the sign: 工事中 /
  この先 通行止め / ROAD WORKS · CLOSED AHEAD. All of it is instanced, about a dozen draw calls for every crossing. The
  streets that cross are shut to cars all day, both ways (`junctions.js` `shutNow`, the same mechanism as a street
  closed at an hour), so the traffic and the rides keep off them and the works stand on an empty road. The crowd's
  footways that cross the edge are closed to it too: a band of 0.8 m along the edge counts as a wall in its `wall`
  test (`actors.js` `shutLine`), so nobody walks through the cones, and the streets beyond keep their own people.
- **On foot.** In the last 22 m before the edge, the part of each step that goes outward is taken away, more the
  closer the walker is, so they slide along the edge and never into it. Pushed against it, the line is said once.
  After a second of pushing, the camera eases round to face back in (`cam.yawTo`), and the same key walks them back
  in. There is no wall that stops them, and no teleport.
- **By car.** The car is braked to a stop short of the works at the rate that brings it there (a comfortable stop,
  never a crash), and the throttle outward is let go in the last 12 m. The line is said. Steering, reversing and
  turning are left to the driver, as at any closed road.
- **In the helicopter.** In the last 220 m before the air's edge, flying outward, the tower speaks ("JA26SB, the city
  past here isn't open yet. Bring her round, back over the Scramble.") and the aircraft is turned back towards the
  Scramble in a banked arc. Its own physics fly the turn, with the controls blended over a second (`vehicles.js`
  `update` is given the blended inputs). Once it heads in, the controls are handed back. Over the last 30 m below the
  ceiling, the climb is eased into a descent.
- **Nothing offers a place outside it.** The rides' and the autopilot's destinations (`rides.js` `destinations`),
  every group of the map's places (`travelGroups`) and a pin's "Travel here" (`travelTo`) keep to the ground's edge.
  Sangenjaya, Harajuku and the Yoyogi pad are no longer offered. The trains at Shibuya run only to stations outside
  it, so they are not offered for boarding: "the trains run on past the streets that are open tonight."
- **Where it applies.** The story and the walk, on a desktop and a phone (the stick and the touch controls feed the
  same inputs). `?walk=1`, the builder's map, is left open, and so is `?bounds=off`.

## Checking it

`tools/bounds_check.js out_dir [WxH] [hour]` opens the walk at the hour it is set (blue hour). From four sides it
walks, drives and flies at the edge along a street that crosses it, and it fails if:

- the player ends past the edge;
- a walker is stopped dead (from a run to a stand in one step), or is not turned back in;
- a car's nose passes the works, it is braked harder than 13 m/s², or it cannot back away;
- the helicopter crosses the air's edge, is not turned back, or turns on the spot instead of in an arc;
- it climbs over the ceiling;
- anything offered lies outside.

It takes stills of the works from the walker, of the car at its stop and of the helicopter mid-turn. `ONLY=foot,car,heli`
runs part of it.
