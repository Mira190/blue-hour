"""Japan's stations as they are built, and a building that stands wholly off the ground stood on piers.

    python pipeline/stations.py --city shibuya        # then: python pipeline/pack.py

Three things a buildings.json written before typology.facade_style() learned them still has wrong:

- a station (class train_station) took the heritage style, brick with arched windows a storey and a half
  tall, as a European terminus would. A station in Japan is concrete, metal panel and glass unless its
  record says brick or stone: it takes the office style, a pale panel colour, and storeys counted again.
- a station the city's 3D survey (PLATEAU) does not have, its height only estimated, is not a building of rooms: it is
  a railway's own structure mapped as a building (a platform's shed, a viaduct's cladding; Shibuya's strip under Mark
  City's south side, w904734439, beside the Ginza line's approach to its depot). Drawn as an office it showed a lane
  a row of shopfronts 5 m tall lit flat white at night, the brightest thing in the picture (issue 143). It takes the
  industrial style instead: metal panel with a high band of windows, lit as a works building is, mostly not after
  hours.
- a building none of whose solids touches the ground (Shibuya station's concourses over the streets
  east of the tracks: its min_height is 3.9 to 6.6 m) was drawn as walls hanging in the air with nothing
  under them. Each such solid gets piers (buildings.json "piers", by solid: [x_dm, y_dm, ...]) on a grid
  under it, kept off the carriageways and the footways mapped beneath it (game.json paths), and not under
  a lower solid of the same building. web/buildings-geo.js draws the piers and the solid's underside;
  web/game/nav.js makes them solid.

- a solid standing on a road the survey has as a driven carriageway (pipeline/road_ground.py: PLATEAU's carriageway that
  a piece of the map's roads runs through) cannot reach the ground there: it is a deck, a bridge or an overhang over the
  road. Its underside is raised to CLEAR_M (UNDERSIDE where its record is known), and it stands on piers kept off the
  carriageway when nothing of its building touches the ground. Shibuya's west exit deck (しぶにしデッキ, OpenStreetMap
  man_made=bridge) was a two-storey building of shops on the bus terminal's carriageway, with a road through it (the
  owner's report, 24 November 2026; tools/deck_check.py, issue 196).

- a solid in a train's way (tools/rail_clear.py: the Yamanote Line's envelope, from the rail to the contact wire,
  outside a station's box) has the envelope carved out of it: what stands beside the tracks keeps its height, what is
  over them starts over the wire, and a roof over a platform is raised to clear it. South of Shibuya Station the trains
  ran through the walls of the new south exit's building and the buildings beside it (the owner's report, 25 November
  2026).

- a solid that is an elevated road's own body (a building with no record of its own along whose top a motorway runs)
  is not drawn (road_bodies(); scene.json hidden_solids).

Rewrites web/data/<city>/buildings.json and scene.json's hidden_solids in place; running it again changes nothing.
"""
import argparse
import json
import math
import os
from collections import defaultdict

from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

import typology
from restorey import wall_height

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PANEL = ["#cfd2d2", "#c3c8cb", "#d8d8d3", "#b9bec2"]  # metal panel and fair-faced concrete
GRID, INSET, PIER = 9.0, 1.0, 0.9                      # the piers' spacing, how far they stand in from the edge, a pier's side (m)
# An underside the map's record gets wrong, by OpenStreetMap id: metres over the building's base. Shibuya's Ginza line
# station (2020, over Meiji-dori and the east exit's bus terminal) is mapped from its first storey (building:min_level=1),
# which a storey of 3.9 m put 2.8 m over the pavement at its south edge: a ceiling at head height across frame 5's view
# (issue 33). Its concourse is at the second-floor deck's level, which the decks to Hikarie and Scramble Square meet
# 6 to 7 m over the street; buses (3.3 m) stand under it. Estimated from photographs; no published figure was found.
UNDERSIDE = {"w810356690": 7.0,
             # Shibuya's west exit deck (しぶにしデッキ, 2023), over the west exit's bus terminal: its walkway at the second
             # floor's level, as the east side's decks meet 6 to 7 m over the street; the record's 10 m is to its roof
             "w1333409445": 6.0}
CLEAR_M = 4.7      # a structure over a carriageway: Japan's 4.5 m clearance (道路構造令 第12条) and a little more
# Piers further apart than the grid's 9 m where the record of the building says so: the same station stands on fewer,
# heavier piers than the one it replaced (seven over Meiji-dori became three, Tokyo Metro, 2019)
SPACING = {"w810356690": 18.0}
# A station whose own walls and roof a hero level draws above its deck caps the city's box under them: the Ginza line's
# box over Meiji-dori is a deck, a white band and an M-shaped arched roof 9 m high (cities/shibuya/hero_ginza.py), and
# the record's flat box 15 m tall stood through the arches. Its top (over the ground, m) at the arches' feet.
TOP = {"w810356690": 11.4}
HALF = {"motorway": 8.0, "trunk": 8.0, "primary": 7.0, "secondary": 6.0, "tertiary": 4.5}  # a carriageway's half-width where its lanes are not given


def restyle(B, japan):
    if not japan or "office" not in B["styles"] or "heritage" not in B["styles"]:
        return 0
    office, heritage = B["styles"].index("office"), B["styles"].index("heritage")
    works = B["styles"].index("industrial") if "industrial" in B["styles"] else None
    by_b = defaultdict(list)
    for k, s in enumerate(B["s"]):
        by_b[s[0]].append(k)
    eaves = {r[0]: r[2] for r in B.get("r", [])}
    fronted = {B["s"][r[0]][0] for r in B.get("f", [])}
    n = 0
    for bi, m in enumerate(B["b"]):
        if m[1] != "train_station" or not by_b.get(bi):
            continue
        style = "industrial" if works is not None and m[4] == "estimate" else "office"
        to = works if style == "industrial" else office
        if m[10] == to or (style == "office" and m[10] != heritage):
            continue
        m[10] = to
        m[7] = typology.jitter(PANEL[m[14] % len(PANEL)], m[14])
        m[11], m[12] = typology.storeys(style, wall_height(B, by_b[bi], eaves), m[3], bi in fronted)
        n += 1
    return n


FLOOR_DM = 39   # build_scene.py's storey for a building:min_level with no min_height (m x 10, a building not lived in)
MEET_M = 1.0          # a neighbour this near a raised building's outline is one it meets
PODIUM_DM = 80        # (a neighbour's underside or a podium's roof no higher than this is its first floor)


def min_levels(city):
    """{OpenStreetMap id: building:min_level} from the city's OpenStreetMap detail (cities/<id>/*_osm.json)."""
    import glob
    out = {}
    for f in glob.glob(os.path.join(ROOT, "cities", city, "*_osm.json")):
        J = json.load(open(f, encoding="utf8"))
        for kind, pre in (("ways", "w"), ("relations", "r")):
            for w in J.get(kind) or []:
                t = w.get("tags") or {}
                if "building:min_level" in t and "min_height" not in t:
                    try:
                        out[pre + str(w["id"])] = float(t["building:min_level"])
                    except ValueError:
                        pass
    return out


def meet_floors(B, city):
    """A building the record starts at a storey (building:min_level n, no min_height) starts where its neighbours' storey
    n does: build_scene.py counts n storeys of 3.9 m from its base, but Shibuya's shops have ground floors of 5 to 6 m
    and stand on ground that climbs from the base, so a bridge between two of them hung a storey under their first
    floor, its underside at a car's roof over the east exit's taxis (the owner's report, 27 November 2026). Its
    underside is set at the highest storey n's floor of the neighbours it meets (2 m of wall or more) that stand on the
    ground and rise past it (base, ground floor and n - 1 storeys of buildings.json; for the first floor also a neighbour's underside or a
    podium's roof up to PODIUM_DM): a bridge reaches the floor at
    either end, and the lower end's stair makes up the rest. Never lower than the record's.
    UNDERSIDE's figures stand. The number raised."""
    import shapely
    levels = min_levels(city)
    def plan(s):
        r = s[4]
        return Polygon([(r[i] / 10, r[i + 1] / 10) for i in range(0, len(r), 2)]).buffer(0)
    polys = [plan(s) for s in B["s"]]
    tree = shapely.STRtree(polys)
    by_b = defaultdict(list)
    for si, s in enumerate(B["s"]):
        if s[2] > 0:
            by_b[s[0]].append(si)
    n = 0
    for bi, ks in by_b.items():
        m = B["b"][bi]
        if m[1] == "roof" or m[6] in UNDERSIDE:
            continue
        lv = levels.get(m[6])
        under = min(B["s"][k][2] for k in ks)
        if lv is None:   # (the record's own min_floor: an underside of whole storeys of build_scene.py's)
            lv = under // FLOOR_DM if under % FLOOR_DM == 0 and 1 <= under // FLOOR_DM <= 6 else None
        if not lv:
            continue
        meet = []   # (storey lv's floor in each neighbour, over the sea: the building's solids are raised as one)
        for si in ks:
            F = polys[si]
            for j in tree.query(F.buffer(MEET_M)):
                t = B["s"][j]
                c = B["b"][t[0]]
                if t[0] == bi or c[1] == "roof" or polys[j].buffer(MEET_M).intersection(F.exterior).length < 2:
                    continue
                if t[2] > 0:   # (a neighbour itself lifted to its first floor: its underside is that floor)
                    if lv == 1 and t[2] <= PODIUM_DM:
                        meet.append((t[1] + t[2]) / 10)
                    continue
                if lv == 1 and 40 <= t[3] <= PODIUM_DM:   # (a podium whose roof is the first floor's deck)
                    meet.append((t[1] + t[3]) / 10)
                    continue
                floor = t[1] / 10 + c[12] + (lv - 1) * c[11]
                if (t[1] + t[3]) / 10 >= floor + 2:   # (not one lower than that storey: a station's box, a kiosk)
                    meet.append(floor)
        if not meet:
            continue
        lows = {k: math.ceil(max(meet) * 10) - B["s"][k][1] for k in ks}
        if all(lows[k] <= B["s"][k][2] for k in ks) or any(B["s"][k][3] - lows[k] < 30 for k in ks):
            continue
        for k in ks:
            B["s"][k][2] = max(B["s"][k][2], lows[k])
        n += 1
    return n


def over_roads(B, city, game):
    """Raise every solid standing on a driven surveyed carriageway to stand over it (see the module's note): the
    number raised. Needs the survey (cities/<id>/road_surface.json); without it nothing is done."""
    if not game or not os.path.exists(os.path.join(ROOT, "cities", city, "road_surface.json")):
        return 0
    import sys
    sys.path.insert(0, os.path.join(ROOT, "tools"))
    import deck_check
    n = 0
    for si, bi, P, on, under in deck_check.standing(city, game, B):
        s = B["s"][si]
        low = round(UNDERSIDE.get(B["b"][bi][6], CLEAR_M) * 10)
        if s[3] - low < 15:
            continue   # (lower than a vehicle passes under: left as the record has it, and listed by the check)
        s[2] = max(s[2], low)
        B.setdefault("over_roads", [])
        if si not in B["over_roads"]:
            B["over_roads"].append(si)
            B["over_roads"].sort()
        n += 1
    return n


UNNAMED_DECK_M = 9.0   # (one of a building with no record of its own)
DECK_M = 6.0      # a raised solid no deeper than this, over the road, of a building with no foot on the ground: a deck


def decks(B):
    """The solids drawn as a deck (buildings.json "decks", web/buildings-geo.js): raised over a road by over_roads(), of
    a building none of whose solids touches the ground, and no deeper than DECK_M from underside to top. Shibuya's west
    exit deck (しぶにしデッキ) is a walkway at the second floor's level under a canopy; drawn with its building's walls
    and windows it read as a row of shopfronts lifted onto piers (issue 212). A raised solid deeper than that (a bridge
    with rooms between two buildings) keeps its walls."""
    by_b = defaultdict(list)
    for k, s in enumerate(B["s"]):
        by_b[s[0]].append(k)
    out = []
    raised, through = set(B.get("over_roads") or []), set(B.get("passages") or [])
    for bi, ks in by_b.items():
        unnamed = not B["b"][bi][6] and B["b"][bi][1] != "roof"
        if not (raised.intersection(ks) or unnamed and through.intersection(ks)) or any(B["s"][k][2] <= 0 for k in ks):
            continue
        # (a building the survey alone has, with no record of what it is, raised over a road and standing nowhere on the
        # ground, is a deck: south of the station one 8 m deep stood over Route 246 as a block of offices on nothing)
        deep = UNNAMED_DECK_M if unnamed else DECK_M
        out += [k for k in ks if B["s"][k][3] - B["s"][k][2] <= deep * 10]
    return sorted(out)


PLATFORM_M = 8.0   # a roof this near a course is over its platform (an island platform's far edge, 6 m off the rail)
CANOPY_DM = 8      # a platform's roof: a slab this thick (dm)
CANOPY_WALL, CANOPY_ROOF = "#c3c6c8", "#9fa3a6"   # its fascia and its sheet: light metal


def platform_roofs(B, game):
    """A roof by the trains' course, at the platforms' level or over it and under the wire, is a platform's roof:
    its underside over the wire, a slab of CANOPY_DM. The open data's levels put them anywhere from the rail to a
    storey over it: south of Shibuya Station one hung a 5 m box 0.9 m over the rail, dark over the street below
    (the owner's report, 25 November 2026). The number set."""
    tracks = game.get("trains", {}).get("tracks", []) if game else []
    if not tracks:
        return 0
    import numpy as np
    import sys
    sys.path.insert(0, os.path.join(ROOT, "tools"))
    import rail_clear
    lines = []
    for t in tracks:
        p = t["p"]
        P = np.array([(p[i] / 10, p[i + 1] / 10, p[i + 2] / 10) for i in range(0, len(p), 3)])
        g = LineString(P[:, :2])
        m = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(P[:, :2], axis=0).T))])
        lines.append((g, m, P))
    n, flat = 0, set()
    for s in B["s"]:
        if B["b"][s[0]][1] != "roof":
            continue
        F = Polygon([(s[4][i] / 10, s[4][i + 1] / 10) for i in range(0, len(s[4]), 2)]).buffer(0)
        near = [(g.distance(F), g, m, P) for g, m, P in lines]
        near = [v for v in near if v[0] < PLATFORM_M]
        if not near:
            continue
        rail = max(float(np.interp(g.project(Point(x, y)), m, P[:, 2])) for _, g, m, P in near for x, y in F.exterior.coords)
        lo, hi = (s[1] + s[2]) / 10, (s[1] + s[3]) / 10
        if hi < rail - 0.5 or lo >= rail + rail_clear.WIRE_M + 1.5:
            continue   # (a canopy over the street under the line, or a roof well over the wire: a station's own)
        m = B["b"][s[0]]   # (a platform's roof is a flat sheet of metal on steel: the record's tiled skillion on a slab
        m[7], m[8], m[13], m[15] = CANOPY_WALL, CANOPY_ROOF, B["roof_materials"].index("metal"), 0   # read as a brown wavy band)
        flat.add(s[0])
        if lo >= rail + rail_clear.WIRE_M:
            continue
        deep = s[3] - s[2]
        s[2] = math.ceil((rail + rail_clear.WIRE_M) * 10) - s[1]
        s[3] = s[2] + min(CANOPY_DM, max(2, deep))
        n += 1
    # and none keeps the record's pitched roof (buildings.json "r"): its mesh stands at the record's height, not
    # the sheet's, and showed as a pale wedge on Shibuya's island platform under the sheet (27 November 2026)
    if flat and B.get("r"):
        B["r"] = [r for r in B["r"] if B["s"][r[0]][0] not in flat]
    return n


def on_platforms(B, game):
    """The platform roofs over a platform the railway draws itself (game.json trains "platforms": Shibuya's island
    out of its box over Route 246, cities/shibuya/rail.py platforms()), by solid: they stand on its columns, and
    web/buildings-geo.js draws no platform of its own under them nor posts down their sides. Set as
    buildings.json "on_platforms"; the number."""
    rings = [Polygon([(p["ring"][i] / 10, p["ring"][i + 1] / 10) for i in range(0, len(p["ring"]), 2)]).buffer(0)
             for p in ((game or {}).get("trains") or {}).get("platforms", [])]
    out = []
    for si, s in enumerate(B["s"]):
        if rings and B["b"][s[0]][1] == "roof" and s[2] > 0:
            F = Polygon([(s[4][i] / 10, s[4][i + 1] / 10) for i in range(0, len(s[4]), 2)]).buffer(0)
            if any(F.intersection(r).area > 20 for r in rings):
                out.append(si)
    if out:
        B["on_platforms"] = out
    else:
        B.pop("on_platforms", None)
    return len(out)


ROOM_M = 2.6   # (what is left over a train's wire lower than this is not kept: no room in it)


def over_tracks(B, city, game):
    """Carve the trains' envelope out of every solid in their way (see the module's note): the number carved. A part
    carved off a solid is kept as a solid of its own, at the end of the list, so that no index into the solids moves."""
    if not game or not game.get("trains"):
        return 0
    import sys
    sys.path.insert(0, os.path.join(ROOT, "tools"))
    import rail_clear
    from solid_rings import valid_rings
    from shapely.geometry.polygon import orient
    E = rail_clear.envelope(game)
    n = 0
    for si, bi, _a, z, lo, hi in rail_clear.in_the_way(city, B, game):
        s = B["s"][si]
        base = s[1]
        env = unary_union([e[1] for e in E if e[1].intersects(Polygon([(s[4][i] / 10, s[4][i + 1] / 10) for i in range(0, len(s[4]), 2)]).buffer(0))])
        rail = max(rail_clear.rail_over(env.buffer(0.3).intersection(Polygon([(s[4][i] / 10, s[4][i + 1] / 10) for i in range(0, len(s[4]), 2)]).buffer(0)), e[2])
                   for e in E if e[1].intersects(env))
        clear = math.ceil((max(z, rail) + rail_clear.WIRE_M) * 10) - base      # over the wire, in decimetres over the base
        if B["b"][bi][1] == "roof":   # a platform's roof: over the wire, as thin as it was
            s[3], s[2] = max(s[3], clear + (s[3] - s[2])), clear
            n += 1
            continue
        P = Polygon([(s[4][i] / 10, s[4][i + 1] / 10) for i in range(0, len(s[4]), 2)],
                    [[(h[i] / 10, h[i + 1] / 10) for i in range(0, len(h), 2)] for h in s[5:] if len(h) >= 6]).buffer(0)
        env = env.buffer(0.3, join_style="mitre")   # (and a hand past it: what the decimetre grid rounds back in)
        def rings(g):
            out = []
            for q in getattr(g, "geoms", [g]):
                if q.geom_type != "Polygon" or q.area < 2:
                    continue
                q = orient(q, 1.0)
                r = valid_rings([[round(v * 10) for xy in list(q.exterior.coords)[:-1] for v in xy]] +
                                [[round(v * 10) for xy in list(h.coords)[:-1] for v in xy] for h in q.interiors])
                if r:
                    out.append((q.area, r))
            return [r for _, r in sorted(out, key=lambda v: -v[0])]
        beside, over = rings(P.difference(env)), rings(P.intersection(env)) if s[3] - clear >= ROOM_M * 10 else []
        head = s[:4]
        parts = [head + r for r in beside] + [[bi, base, max(s[2], clear), s[3]] + r for r in over]
        if not parts:
            continue
        B["s"][si] = parts[0]
        B["s"].extend(parts[1:])
        n += 1
    return n


def road_bodies(B, game):
    """The solids that are an elevated road's own body: PLATEAU's survey extrudes the Shuto Expressway's viaduct over
    Route 246 south of Shibuya Station as a building with no record of its own, from the street to the expressway's
    deck, and the game drew it as a block of offices over the road (the owner's report, 25 November 2026). A solid of
    a building with no OpenStreetMap record, along which a motorway runs for 10 m or more at its top (from a metre
    under it to 2 m over it, the deck the page draws: web/game/decks.js), is that: not drawn, kept in the surface model
    (scene.json hidden_solids), and so is the rest of its building. Their solid indices."""
    import shapely
    roads = []
    for r in (game or {}).get("paths", {}).get("road", []):
        if r.get("c") not in ("motorway", "motorway_link"):
            continue
        p = r["p"]
        pts = [(p[i] / 10, p[i + 1] / 10, p[i + 2] / 10) for i in range(0, len(p), 3)]
        roads.append((LineString([q[:2] for q in pts]), pts))
    if not roads:
        return []
    tree = shapely.STRtree([g for g, _ in roads])
    out = []
    for si, s in enumerate(B["s"]):
        if B["b"][s[0]][6] or len(s[4]) < 6:
            continue
        F = Polygon([(s[4][i] / 10, s[4][i + 1] / 10) for i in range(0, len(s[4]), 2)]).buffer(0)
        top = (s[1] + s[3]) / 10
        for j in tree.query(F, predicate="intersects"):
            g, pts = roads[j]
            zs = [q[2] for q in pts if F.contains(Point(q[:2]))] or [min(q[2] for q in pts)]
            if g.intersection(F).length >= 10 and top - 1 <= sum(zs) / len(zs) <= top + 2:
                out.append(s[0])
                break
    whole = set(out)   # (and the rest of its building: the survey's one body, cut into pieces by the roads under it)
    return [si for si, s in enumerate(B["s"]) if s[0] in whole]


STRAY_M2 = 15.0     # (a bit of a roof no bigger than this)
STRAY_DROP_M = 5.0  # (and this far under the rest of its building)


def stray_bits(B):
    """The scraps of a roof left far under it: a small thin solid off the ground whose underside is STRAY_DROP_M or
    more under its building's largest solid, touching none of them. South of Shibuya Station four
    strips of the new south exit's platform roof hung at head height over the plaza, 10 m under the roof, drawn as
    brown boards on posts (the owner's report, 25 November 2026). Not drawn: the solids' indices."""
    from collections import defaultdict
    by = defaultdict(list)
    for si, s in enumerate(B["s"]):
        by[s[0]].append(si)
    def plan(s):
        return Polygon([(s[4][i] / 10, s[4][i + 1] / 10) for i in range(0, len(s[4]), 2)]).buffer(0)
    out = []
    for bi, ss in by.items():
        if len(ss) < 2:
            continue
        for si in ss:
            s = B["s"][si]
            if s[2] <= 0 or s[3] - s[2] > 15:
                continue
            F = plan(s)
            if F.area > STRAY_M2:
                continue
            rest = [B["s"][j] for j in ss if j != si]
            main = max(rest, key=lambda r: plan(r).area)   # (the building's body: its largest solid)
            if main[1] + main[2] - (s[1] + s[2]) < STRAY_DROP_M * 10 or any(plan(r).buffer(0.2).intersects(F) for r in rest if r[2] < s[3]):
                continue
            out.append(si)
    return out


def ways_of(game):
    """The roads' carriageways and the footways, widened by a pier's side: where no pier stands."""
    ways = []
    for r in game.get("paths", {}).get("road", []):
        p = r["p"]
        half = r["nl"] * 1.75 + 0.8 if r.get("nl") else HALF.get(r["c"], 3.5)
        ways.append(LineString([(p[i] / 10, p[i + 1] / 10) for i in range(0, len(p), 3)]).buffer(half + PIER))
    for r in game.get("paths", {}).get("foot", []):
        p = r["p"]
        ways.append(LineString([(p[i] / 10, p[i + 1] / 10) for i in range(0, len(p), 3)]).buffer(1.2 + PIER))
    return ways


def piers(B, game):
    by_b = defaultdict(list)
    for k, s in enumerate(B["s"]):
        by_b[s[0]].append(k)
    ways = ways_of(game)
    out = {}
    for bi, ks in by_b.items():
        if B["b"][bi][1] == "roof" or any(B["s"][k][2] <= 0 for k in ks) and B["b"][bi][6] not in UNDERSIDE:
            continue  # (a canopy has its posts already: pipeline/arcades.py; a building with a foot on the ground stands on it)
        # its storeys start at its underside, not at a ground it does not touch: a row of windows was cut in half by the
        # slab's edge. One underside for the whole building (the lowest its solids have), the ground floor that high,
        # and the storeys above it shared out over what is left
        low = max(min(B["s"][k][2] for k in ks), round(UNDERSIDE.get(B["b"][bi][6], 0) * 10))
        cap = TOP.get(B["b"][bi][6])
        if cap:
            for k in ks:
                B["s"][k][3] = min(B["s"][k][3], round(cap * 10))
        for k in ks:
            B["s"][k][2] = low
        m, wall = B["b"][bi], (max(B["s"][k][3] for k in ks) - low) / 10
        if len(m) > 12 and wall > 2.6:
            m[12] = round(low / 10, 2)
            m[11] = round(wall / max(1, round(wall / 4.3)), 2)
        polys = {k: Polygon([(B["s"][k][4][i] / 10, B["s"][k][4][i + 1] / 10) for i in range(0, len(B["s"][k][4]), 2)]).buffer(0) for k in ks}
        hull = unary_union(list(polys.values()))
        clear = unary_union([w for w in ways if w.intersects(hull)]) if ways else None
        for k in ks:
            lower = [polys[j] for j in ks if j != k and (B["s"][j][2] < B["s"][k][2] or (B["s"][j][2] == B["s"][k][2] and j < k))]
            area = polys[k].buffer(-INSET)
            if lower:
                area = area.difference(unary_union(lower).buffer(INSET))
            if clear is not None:
                area = area.difference(clear)
            if area.is_empty:
                continue
            x0, y0, x1, y1 = polys[k].bounds
            grid = SPACING.get(B["b"][bi][6], GRID)
            nx, ny = max(1, round((x1 - x0 - 2 * INSET) / grid)), max(1, round((y1 - y0 - 2 * INSET) / grid))
            pts = []
            for i in range(nx + 1):
                for j in range(ny + 1):
                    x, y = x0 + INSET + (x1 - x0 - 2 * INSET) * i / nx, y0 + INSET + (y1 - y0 - 2 * INSET) * j / ny
                    if area.contains(Point(x, y)):
                        pts += [round(x * 10), round(y * 10)]
            if not pts:  # (too small or too crooked for the grid: one pier where there is most room)
                c = area.representative_point()
                pts = [round(c.x * 10), round(c.y * 10)]
            out[str(k)] = pts
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--city", required=True)
    a = ap.parse_args()
    d = os.path.join(ROOT, "web", "data", a.city)
    path = os.path.join(d, "buildings.json")
    B = json.load(open(path, encoding="utf8"))
    cfg = json.load(open(os.path.join(ROOT, "cities", a.city, "city.json"), encoding="utf8"))
    game = json.load(open(os.path.join(d, "game.json"), encoding="utf8")) if os.path.exists(os.path.join(d, "game.json")) else {}
    before = json.dumps(B, sort_keys=True)
    n = restyle(B, typology.region_name(cfg) == "japan")
    met = meet_floors(B, a.city)
    raised = over_roads(B, a.city, game)
    roofs = platform_roofs(B, game)
    plat = on_platforms(B, game)
    carved = over_tracks(B, a.city, game)
    D = decks(B)
    if D:
        B["decks"] = D
    else:
        B.pop("decks", None)
    P = piers(B, game)
    if P:
        B["piers"] = P
    else:
        B.pop("piers", None)
    bodies = road_bodies(B, game)
    strays = stray_bits(B)
    sp = os.path.join(d, "scene.json")
    if os.path.exists(sp):
        scene = json.load(open(sp, encoding="utf8"))
        hidden = sorted(set(scene.get("hidden_solids") or []) | set(bodies) | set(strays))
        if hidden != scene.get("hidden_solids"):
            scene["hidden_solids"] = hidden
            json.dump(scene, open(sp, "w"), separators=(",", ":"))
    changed = json.dumps(B, sort_keys=True) != before
    if changed:
        with open(path, "w") as f:
            json.dump(B, f, separators=(",", ":"))
    print(f"{a.city}: {n} stations restyled, {met} raised to meet their neighbours' floors, {raised} solids raised over a carriageway, {carved} carved out of a train's way, {roofs} platforms' roofs ({plat} over a platform the railway draws), {len(bodies)} an expressway's own body, {len(strays)} scraps of a roof under it, {sum(len(v) // 2 for v in P.values())} piers under {len(P)} solids{'' if changed else ' (nothing changed)'}")


if __name__ == "__main__":
    main()
