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

Rewrites web/data/<city>/buildings.json in place; running it again changes nothing.
"""
import argparse
import json
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
        n += 1
    return n


def piers(B, game):
    by_b = defaultdict(list)
    for k, s in enumerate(B["s"]):
        by_b[s[0]].append(k)
    ways = []
    for r in game.get("paths", {}).get("road", []):
        p = r["p"]
        half = r["nl"] * 1.75 + 0.8 if r.get("nl") else HALF.get(r["c"], 3.5)
        ways.append(LineString([(p[i] / 10, p[i + 1] / 10) for i in range(0, len(p), 3)]).buffer(half + PIER))
    for r in game.get("paths", {}).get("foot", []):
        p = r["p"]
        ways.append(LineString([(p[i] / 10, p[i + 1] / 10) for i in range(0, len(p), 3)]).buffer(1.2 + PIER))
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
    raised = over_roads(B, a.city, game)
    P = piers(B, game)
    if P:
        B["piers"] = P
    else:
        B.pop("piers", None)
    changed = json.dumps(B, sort_keys=True) != before
    if changed:
        with open(path, "w") as f:
            json.dump(B, f, separators=(",", ":"))
    print(f"{a.city}: {n} stations restyled, {raised} solids raised over a carriageway, {sum(len(v) // 2 for v in P.values())} piers under {len(P)} solids{'' if changed else ' (nothing changed)'}")


if __name__ == "__main__":
    main()
