"""The ground a road is, from the survey: the carriageway, the footway and the islands as polygons (docs/ROADS.md,
"The ground as surveyed"; issue 196).

A band along a centre line cannot give a junction's mouth, a corner's radius, an island or a carriageway that is not
centred on the map's line. The survey's polygons can (pipeline/road_survey.py -> cities/<id>/road_surface.json). This
sorts them by what the game's road pieces say of them, for everything that builds or paints ground: a hero level's
plan (cities/shibuya/scramble.py), the page's drawing of the streets (game.json `road_ground`, written here), and the
checks.

  asphalt   the survey's carriageways (車道部) and junctions (車道交差部) that a road piece on the ground runs through
  shared    those no piece runs through, or only a piece closed to cars with the crowd's own line down it: a
            pedestrian street the survey has as a road (Center Gai and its mouth). Paved, no kerb
  walk      the footways (歩道部)
  island    the islands (島)
  cover     all of them: where the survey says what the ground is

`bands()` gives what the survey does not have: each ground piece's own band at the width it carries (`cw`, else its
class's), outside the cover (a private way, a street past the ward's edge).

    python pipeline/road_ground.py --city shibuya            # write game.json `road_ground` (the planned area's), then pipeline/pack.py
    python pipeline/road_ground.py --city shibuya --check    # it is what the survey gives now; every level's plan agrees with it
"""
import json
import os
import sys

import numpy as np
import shapely
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

import road_survey

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROADW = {"motorway": 14, "trunk": 12, "primary": 12, "secondary": 10, "tertiary": 9, "residential": 7, "unclassified": 6, "living_street": 5}
THROUGH_M = 3.0     # a piece runs through a surveyed polygon when this much of it lies inside
DECK_M = 3.0        # a piece this far over the ground is on a deck
MARGIN_M = 60.0     # the page's surface reaches this far past the planned area (the easing at its edge, and the view from the air)
ACCURACY_M = 1.75   # the survey's own (map level 2500: 公共測量作業規程, 1.75 m in plan)


TWO_LANES = {"motorway", "trunk", "primary"}
WIDE_TWO_WAY, WIDE_ONE_WAY = 13.6, 9.6   # a surveyed carriageway with room for two lanes each way (the outer lane's middle 4.7 m off the line, a car and a gutter past it), or for two lanes one way


def lanes_each_way(o):
    """Lanes each way on a piece, as web/game/junctions.js drives it (`byClass`, `tight`): two on a main road by its
    class, or on any street the survey has wide enough; one where the map's count says one, or the survey has no room."""
    w, one = o.get("cw") or 0, bool(o.get("o"))
    two = o.get("c") in TWO_LANES or (one and o.get("c") == "secondary") or w >= (WIDE_ONE_WAY if one else WIDE_TWO_WAY)
    if not two or o.get("nl") == 1 or (w and w < (6.4 if one else 11.2)):
        return 1
    return 2


def pts_of(o):
    return np.asarray(o["p"], float).reshape(-1, 3) / 10


def polys(g):
    if g is None or g.is_empty:
        return []
    if g.geom_type == "Polygon":
        return [g]
    return [p for q in getattr(g, "geoms", []) for p in polys(q)]


class Surface:
    def __init__(self, city, roads, ground=None, geo=None, foot=()):
        """roads: game.json paths.road; ground(x, y): the ground's height (a piece DECK_M over it is on a deck); foot:
        the lines the crowd walks, as LineStrings."""
        self.geo = geo or road_survey.load(os.path.join(ROOT, "cities", city, "road_surface.json"))
        self.lines, self.pieces = [], []
        for o in roads:
            p = pts_of(o)
            if len(p) < 2 or o.get("d") or o.get("j") or o.get("c") == "motorway":
                continue
            if ground is not None and min(q[2] - ground(q[0], q[1]) for q in p) >= DECK_M:
                continue
            self.lines.append(LineString(p[:, :2]))
            self.pieces.append(o)
        tree = shapely.STRtree(self.lines) if self.lines else None
        foot = [f for f in foot if f is not None and f.length > 0]
        ftree = shapely.STRtree(foot) if foot else None
        asphalt, shared = [], []
        for kind in ("carriage", "cross"):
            for p in polys(self.geo[kind]):
                near = tree.query(p) if tree is not None else []
                run = sum(self.lines[i].intersection(p).length for i in near)
                driven = sum(self.lines[i].intersection(p).length for i in near if not self.pieces[i].get("x"))
                walked = sum(foot[i].intersection(p).length for i in ftree.query(p)) if ftree is not None else 0.0
                street = driven >= THROUGH_M or (run >= THROUGH_M and walked < THROUGH_M)
                (asphalt if street else shared).append(p)
        # (the survey's parts were grown by a centimetre to close its tiles' cuts: a carriageway and the junction it
        # comes to share an edge, and are one asphalt)
        self.asphalt = unary_union([p.buffer(0.03) for p in asphalt]).buffer(-0.03) if asphalt else Polygon()
        self.shared = unary_union(shared) if shared else Polygon()
        self.walk, self.island = self.geo["walk"], self.geo["island"]
        self.cover = unary_union([self.asphalt.buffer(0.05), self.shared, self.walk, self.island])

    def bands(self, clip=None):
        """The ground pieces' own bands where the survey has no ground: one geometry."""
        out = []
        keep = self.cover.buffer(0.5)
        for o, ln in zip(self.pieces, self.lines):
            if clip is not None and not ln.intersects(clip):
                continue
            rest = ln.difference(keep)
            if rest.length < 1.0:
                continue
            out.append(rest.buffer((o.get("cw") or ROADW.get(o.get("c"), 7)) / 2, cap_style=2))
        return unary_union(out) if out else Polygon()

    def carriageway(self, clip=None):
        """The asphalt, surveyed and (where the survey has none) banded: what a level or the page lays as carriageway."""
        b = self.bands(clip)
        a = self.asphalt if clip is None else self.asphalt.intersection(clip)
        return unary_union([a, b.difference(self.cover)]).buffer(0) if not b.is_empty else a


def of_game(city, game=None, ground=None):
    game = game or json.load(open(os.path.join(ROOT, "web", "data", city, "game.json"), encoding="utf8"))
    if ground is None:
        try:
            from levels import Levels
            ground = Levels(city, game).at
        except Exception as e:
            print(f"  (no ground: {e})", file=sys.stderr)
    foot = [LineString(pts_of(o)[:, :2]) for o in game["paths"].get("foot", []) if len(o["p"]) >= 6]
    return Surface(city, game["paths"]["road"], ground, foot=foot)


def rings(g, simplify=0.1):
    """[[ring, hole, ...], ...] in decimetres, as road_survey packs them."""
    out = []
    for p in polys(g.simplify(simplify) if simplify else g):
        if p.area < 0.5:
            continue
        flat = lambda r: [int(round(v * 10)) for xy in np.asarray(r.coords)[:-1] for v in xy]
        out.append([flat(p.exterior)] + [flat(h) for h in p.interiors if Polygon(h).area > 0.3])
    return out


def zebra_lines(game, S, area):
    """Each zebra crossing of the map's data (props.crossing_zebra) inside the area, as the line of its middle from
    kerb to kerb across the surveyed carriageway: [x0, y0, x1, y1] in decimetres. The page laid each across the
    nearest piece at the piece's own width."""
    Z = (game.get("props") or {}).get("crossing_zebra") or []
    tree = shapely.STRtree(S.lines) if S.lines else None
    out = []
    for k in range(0, len(Z), 3):
        p = Point(Z[k] / 10, Z[k + 1] / 10)
        if tree is None or not area.contains(p):
            continue
        i = tree.nearest(p)
        ln = S.lines[i]
        if ln.distance(p) > 12:
            continue
        s = ln.project(p)
        a, b = ln.interpolate(max(0, s - 1)), ln.interpolate(min(ln.length, s + 1))
        h = np.array([b.x - a.x, b.y - a.y])
        if np.hypot(*h) < 1e-6:
            continue
        h /= np.hypot(*h)
        n = np.array([-h[1], h[0]])
        q = np.array(ln.interpolate(s).coords[0])
        best = None
        hit = LineString([q - n * 24, q + n * 24]).intersection(S.asphalt)
        for g in getattr(hit, "geoms", [hit]):
            if g.geom_type != "LineString" or g.is_empty:
                continue
            c = np.asarray(g.coords)
            t = (c - q) @ n
            d = 0.0 if t.min() <= 0 <= t.max() else min(abs(t.min()), abs(t.max()))
            if best is None or d < best[0]:
                best = (d, float(t.min()), float(t.max()))
        if best is None or best[0] > 3 or best[2] - best[1] < 2.5:
            continue
        e0, e1 = q + n * (best[1] + 0.6), q + n * (best[2] - 0.6)   # (the bars end short of the gutters)
        out.append([int(round(v * 10)) for v in (*e0, *e1)])
    return out


def kerb_to_kerb(S, a, b, reach=6.0):
    """The line a-b across a carriageway taken to the surveyed kerbs at both ends: where its own line leaves the
    asphalt; a and b themselves where it meets none."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    L = float(np.hypot(*(b - a)))
    if L < 1e-6:
        return a, b
    f, mid = (b - a) / L, (a + b) / 2
    best = None
    hit = LineString([mid - f * (L / 2 + reach), mid + f * (L / 2 + reach)]).intersection(S.asphalt)
    for g in getattr(hit, "geoms", [hit]):
        if g.geom_type != "LineString" or g.is_empty:
            continue
        t = (np.asarray(g.coords) - mid) @ f
        d = 0.0 if t.min() <= 0 <= t.max() else min(abs(t.min()), abs(t.max()))
        if best is None or d < best[0]:
            best = (d, float(t.min()), float(t.max()))
    if best is None or best[0] > 0:
        return a, b
    return mid + f * best[1], mid + f * best[2]


def scramble_lines(city, S):
    """The scramble's mapped crosswalks (scene.json landmarks.scramble.lines: OpenStreetMap's crossing ways, which the
    crowd crosses along and waits at the ends of) from kerb to kerb as surveyed, in the scene's order; None where the
    map has no scramble. OpenStreetMap's south crosswalk ends 2.8 m short of Hachiko Square's kerb, which GSI's
    aerial photograph has where the survey has it: its walkers waited in the carriageway."""
    scene = json.load(open(os.path.join(ROOT, "web", "data", city, "scene.json"), encoding="utf8"))
    sc = (scene.get("landmarks") or {}).get("scramble")
    if not sc or not sc.get("lines"):
        return None
    out = []
    for a, b in sc["lines"]:
        p, q = kerb_to_kerb(S, a, b)
        out.append([[round(float(p[0]), 2), round(float(p[1]), 2)], [round(float(q[0]), 2), round(float(q[1]), 2)]])
    return out


def page_surface(city, game, ground=None):
    """game.json `road_ground`: the planned area's ground as the page paints it (web/game/game.js `streetTexture`):
    "area" the ring inside which the survey is the ground (the planned area and MARGIN_M round it), "a" the
    carriageways (and, where the survey has none, the pieces' own bands), "s" the shared streets, "w" the footways,
    "i" the islands, each [[ring, hole, ...], ...] in decimetres, "z" the zebra crossings' lines, and "x" the
    scramble's crosswalks from kerb to kerb (metres, as scene.json has them)."""
    b = game.get("bounds", {}).get("ground", {}).get("poly")
    if not b:
        return None
    area = Polygon(b).buffer(MARGIN_M, join_style=2).simplify(1.0)
    S = of_game(city, game, ground)
    cut = lambda g: g.intersection(area.buffer(2.0))
    out = {"area": [int(round(v * 10)) for xy in np.asarray(area.exterior.coords)[:-1] for v in xy],
           "a": rings(cut(S.carriageway(area.buffer(30.0)))), "s": rings(cut(S.shared)), "w": rings(cut(S.walk)), "i": rings(cut(S.island)),
           "z": zebra_lines(game, S, area)}
    x = scramble_lines(city, S)
    if x:
        out["x"] = x
    return out


def main():
    import argparse
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--city", default="shibuya")
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    gp = os.path.join(ROOT, "web", "data", a.city, "game.json")
    game = json.load(open(gp, encoding="utf8"))
    if not os.path.exists(os.path.join(ROOT, "cities", a.city, "road_surface.json")):
        print(f"{a.city}: no road_surface.json (pipeline/road_survey.py); the ground is painted as bands")
        return
    s = page_surface(a.city, game)
    n = {k: len(v) for k, v in s.items() if k != "area"}
    if a.check:
        if game.get("road_ground") != s:
            raise SystemExit(f"FAIL road ground: game.json `road_ground` is not what the survey gives now (python pipeline/road_ground.py --city {a.city}, then pipeline/pack.py)")
        print(f"road ground: the planned area's surface as surveyed ({n['a']} carriageways, {n['s']} shared streets, {n['w']} footways, {n['i']} islands, {n['z']} zebras)")
        return
    game["road_ground"] = s
    json.dump(game, open(gp, "w"), separators=(",", ":"))
    print(f"road ground: {n['a']} carriageways, {n['s']} shared streets, {n['w']} footways, {n['i']} islands, {n['z']} zebras in the planned area "
          f"({len(json.dumps(s, separators=(',', ':'))) / 1e3:.0f} kB)")


if __name__ == "__main__":
    main()
