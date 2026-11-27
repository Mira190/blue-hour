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

**Where the edge is: the story's area, and the drive area round it** (`pipeline/bounds.py`, written to
`cities/shibuya/city.json` `game.bounds`, copied by `pipeline/game_text.py`).

- **The story's area** is the convex hull of what the story and the walk are played round. Each place gets room
  round it: the hero levels' circles plus 45 m (docs/HERO.md), and 70 m round every place a frame of the story stands
  in or looks at, the walk's views from the street, the start and the car's kerb, and the roads the drives between its
  places take (`pipeline/road_routes.py`, docs/ROADS.md, issue 196), with 40 m of room. It comes to about 500 by 425 m
  (x 190 to 683, y -1282 to -857): 0.14 km², the car's kerb 90 m from its edge. Until 27 November 2026 this was the
  edge itself.
- **The drive area is wider** (the owner, 27 November 2026: "I drove off from the start and soon it wouldn't let me go
  on"). An open world keeps its story's streets small and finished and gives the car a district: GTA's and
  Spider-Man's story missions are played a few blocks wide in a city the car crosses in minutes. So the ground's edge
  (`game.bounds.ground`) is now the drive area: `game.drive_area` gives starting corners, an octagon of about 1.2 by
  1.25 km round the Scramble, and `bounds.py` `drive_area()` slides each edge along its normal, up to 90 m, to where
  the city's streets cross it least: every street that crosses it costs by its class (a car meets the edge at speed on
  a trunk road), four times as much within 40 m of a junction (a car is never turned back in a junction), and a street
  running along the edge within 25 m costs by its length (half in, half out). The edge so finds the back of a block, a
  park, a railway. It is held 200 m inside a phone's district (`phone_district`: past that a phone has the scenery
  band and the skyline, docs/PERFORMANCE.md) and round the story's area with the easing band. It stays convex, as
  `bounds.js` measures a convex edge. Shibuya: x -105 to 955, y -1785 to -310, 1.45 km², ten times the story's area.
- **What follows the drive area.** Everything that was made for "where a player can go" reads `game.bounds.ground`, so
  it reaches the drive area with no code of its own: the surveyed ground the page paints (`road_ground.py`: kerbs,
  footways, islands, zebras, 25 to 121 kB), the lines inside their kerbs (`road_fit.py`), the streets closed to cars
  because no car fits or a one-way leads into a dead end (`road_plan.py` `playable()`), the routes kept inside
  (`closeRoads`), the rides' and the map's places (`keep`), and the checks (`first_drive.py`, `deck_check.py`,
  `car_edges.js`, `bounds_check.js`).
- **Streets the car cannot drive.** In the hills north and west of the station a few lanes run along a terrace's edge
  or meet a slope in a step the survey keeps, and the car, driven along them by its own rules, stops
  (`tools/car_edges.js`). Inside the drive area those are closed to cars as the pieces the game cuts at a wall are: by
  their ends, under `steep` in `cities/<id>/road_measured.json`, written by `pipeline/road_steep.py` from the check's
  findings; still painted and walked. Four in Shibuya.
- **The air's edge** is the story's places given 360 m, the landmarks the walk's opening flies past given 120 m (Cerulean
  Tower, Hikarie), and the drive area given 290 m, cut to 100 m past a phone's district: x -395 to 1245, y -2075 to -20.
  It turns back over the built city before the land past it shows.
- **The ceiling** is 420 m above the sea: well over SKY's roof (244 m), and under Haneda's approach, which is the
  reason the tower gives.
- **It is on the map.** The minimap and the full map shade what lies past the drive area and draw its edge dashed
  (`hud.js` `baseMap`), as an open world greys what is not open yet, so the edge is seen before it is met.

**How it is met** (`web/game/bounds.js`, a part of the game: docs/SEAMS.md).

- **Nothing drawn at the edge, and the world runs on past it** (the owner, 25 November 2026). The edge was first
  closed by road works across each street and footway that crosses it (cones, barricades with amber lamps, 工事中 /
  この先 通行止め), the streets shut to cars. On the walk at 17:42 the owner met them at the foot of Dogenzaka with the
  traffic still driving up to the barriers from the far side and a car parked inside the works: "This road says it's
  closed, so why is a pile of cars coming through?". The shut streets kept the cars inside from crossing, but nothing
  kept the cars beyond from being made there, and a drawn closure that traffic ignores reads as a broken one. The
  answer the owner chose is the open world's (GTA V's mainland, Forza Horizon, Spider-Man's Manhattan): no sign where
  you cannot go; the roads and their traffic run on past the edge, and the crowd walks on past it; only you are turned
  back, softly, as below. The streets that cross it are left out of your routes, a ride's and the autopilot's
  (`l.edge`, `cars.js` `route`), and are open to the traffic (`bounds.js` `closeRoads`); the crossings are found, unseen,
  for the checks that meet the edge there (`mark`). The lines say where the evening is, not why the road is closed.
- **On foot.** In the last 22 m before the edge, the part of each step that goes outward is taken away, more the
  closer the walker is, so they slide along the edge and never into it. Pushed against it, the line is said once.
  After a second of pushing, the camera eases round to face back in (`cam.yawTo`), and the same key walks them back
  in. There is no wall that stops them, and no teleport.
- **By car.** The car is braked to a stop short of the edge at the rate that brings it there (a comfortable stop,
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

- anything is drawn across a crossing (`bounds-works`), or a street across the edge is shut to the traffic;
- the player ends past the edge;
- a walker is stopped dead (from a run to a stand in one step), or is not turned back in;
- a car's nose passes the edge, it is braked harder than 13 m/s², or it cannot back away;
- the helicopter crosses the air's edge, is not turned back, or turns on the spot instead of in an arc;
- it climbs over the ceiling;
- anything offered lies outside.

It takes stills of the crossing from the walker, of the car at its stop and of the helicopter mid-turn. `ONLY=foot,car,heli`
runs part of it.
