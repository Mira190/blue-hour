"""Every road piece's carriageway, measured against the surveyed road surface (docs/ROADS.md, issue 195).

A road was as wide as its class (web/game: ROADW, in five tables). The survey (pipeline/road_survey.py ->
cities/<id>/road_surface.json) has the carriageway itself, kerb to kerb. This measures each piece of game.json
`paths.road` against it and writes on the piece:

  "cw": w       the carriageway's width in metres, kerb to kerb, where the survey has the street: the median of
                the chords square to the piece's line every 4 m, outside the junctions' own areas (a junction's
                mouth is wider than the street that comes to it). Where two pieces run side by side in one
                surveyed carriageway (the two ways of a divided road, a slip beside its road) each takes the
                carriageway from its own side's kerb to half way between the two lines.
                The band the game draws is centred on the piece's line, which is the map's and not the
                survey's (the two agree within a metre over four fifths of the length, which is what a 1:2,500
                survey and OpenStreetMap promise), so a width is never more than puts the band's edge OFF_M past
                the nearer kerb; and where the survey's carriageway is a forecourt or a terminal's apron and not
                a street (wider than ONE_WAY_MAX or TWO_WAY_MAX), the piece is a lane across it of that width.
  "st": 1       a single track: two ways drive it and it is under TWO_WAY_M wide, so two cars do not pass. It
                is driven down its middle, and the traffic is not made on it or turned into it
                (web/game/junctions.js, actors.js).

and takes away what an earlier run wrote. A piece the survey does not have (outside its area, on a deck or a viaduct,
in a tunnel, a private way) keeps its class's width, and is counted. A piece inside a hero level (game.json `hero`
with a drawn ground: docs/HERO.md) keeps the width its level draws, and its measure goes in the report only: the
level's ground is built from its own plan, and is held to the survey as a figure there until it is built again.

`--check` fails where game.json's widths are not what the survey gives now, where a piece is narrower than a car
needs.

    python pipeline/road_width.py --city shibuya
    python pipeline/road_width.py --city shibuya --check
"""
import json
import math
import os
import sys

import numpy as np
import shapely
from shapely.geometry import LineString, Point

from cityctx import City
import road_survey

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROADW = {"motorway": 14, "trunk": 12, "primary": 12, "secondary": 10, "tertiary": 9, "residential": 7, "unclassified": 6, "living_street": 5}
STEP_M = 4.0        # a chord every 4 m along a piece
REACH_M = 22.0      # a chord looks this far either side for the kerb
MIN_W = 2.6
CAR_M = 2.6         # the narrowest carriageway a car is driven along (a kei lane: 1.8 m of car and a hand either side)
TWO_WAY_M = 5.2     # under this two cars do not pass (two lanes' middles 1.3 m off the line, a car 1.8 m wide): a single track
OFF_M = 1.5         # the band's edge may lie this far past the nearer kerb: the survey's and the map's accuracy together
ONE_WAY_MAX, TWO_WAY_MAX = 14.0, 26.0   # wider than a street of its kind: an apron, a forecourt
DECK_M = 3.0        # a piece this far over the ground is on a deck: the survey's surface there is another road's


def pts_of(o):
    return np.asarray(o["p"], float).reshape(-1, 3) / 10


def chord(surface, x, y, nx, ny):
    """How far the surface runs from (x, y) along (nx, ny) and against it before its edge: (left, right), or None
    where the point is not on the surface."""
    line = LineString([(x - nx * REACH_M, y - ny * REACH_M), (x + nx * REACH_M, y + ny * REACH_M)])
    hit = line.intersection(surface)
    for part in getattr(hit, "geoms", [hit]):
        if part.geom_type != "LineString" or part.is_empty:
            continue
        c = np.asarray(part.coords)
        t = (c[:, 0] - x) * nx + (c[:, 1] - y) * ny
        if t.min() <= 0.05 and t.max() >= -0.05:
            return max(0.0, float(t.max())), max(0.0, float(-t.min()))
    return None


def measure(roads, geo, ground=None):
    """[(width, offset to the left, samples) or None, ...] for each piece."""
    surface = shapely.union(geo["carriage"], geo["cross"]).buffer(0.02)
    shapely.prepare(surface)
    cross = geo["cross"]
    shapely.prepare(cross)
    area = geo["area"]
    lines = []
    for o in roads:
        p = pts_of(o)
        lines.append(LineString(p[:, :2]) if len(p) > 1 else None)
    tree = shapely.STRtree([l if l is not None else Point(1e9, 1e9) for l in lines])
    out = []
    for i, o in enumerate(roads):
        line = lines[i]
        if line is None or line.length < 1 or not area.contains(line) or o.get("d") or o.get("j") or o.get("c") == "motorway":   # (an expressway is a deck or a tunnel here)
            out.append(None)
            continue
        p = pts_of(o)
        if ground is not None and np.median([q[2] - ground(q[0], q[1]) for q in p]) > DECK_M:
            out.append(None)
            continue
        n = max(1, int(line.length // STEP_M))
        ws, offs = [], []
        near = [j for j in tree.query(line.buffer(REACH_M)) if j != i and lines[j] is not None]
        for k in range(n):
            s = (k + 0.5) * line.length / n
            a, b = line.interpolate(max(0, s - 1)), line.interpolate(min(line.length, s + 1))
            q = line.interpolate(s)
            hx, hy = b.x - a.x, b.y - a.y
            h = math.hypot(hx, hy)
            if h < 1e-6 or shapely.contains_xy(cross, q.x, q.y):
                continue
            hx, hy = hx / h, hy / h
            nx, ny = -hy, hx   # to the left of the way the line runs
            c = chord(surface, q.x, q.y, nx, ny)
            if c is None:
                continue
            left, right = c
            # a piece beside this one in the same carriageway takes its own half
            ray = LineString([(q.x - nx * right, q.y - ny * right), (q.x + nx * left, q.y + ny * left)])
            for j in near:
                x = ray.intersection(lines[j])
                if x.is_empty:
                    continue
                for g in getattr(x, "geoms", [x]):
                    if g.geom_type != "Point":
                        continue
                    t = (g.x - q.x) * nx + (g.y - q.y) * ny
                    f = lines[j].project(g)
                    a2, b2 = lines[j].interpolate(max(0, f - 1)), lines[j].interpolate(min(lines[j].length, f + 1))
                    d2 = math.hypot(b2.x - a2.x, b2.y - a2.y) or 1
                    if abs((b2.x - a2.x) * hx + (b2.y - a2.y) * hy) / d2 < 0.8 or abs(t) < 1.0:
                        continue   # (a street that crosses or joins, not one alongside)
                    if t > 0:
                        left = min(left, t / 2)
                    else:
                        right = min(right, -t / 2)
            ws.append(min(left + right, 2 * (min(left, right) + OFF_M)))
            offs.append((left - right) / 2)
        if len(ws) < 2 and (not ws or line.length > 3 * STEP_M):
            out.append(None)
            continue
        out.append((float(np.median(ws)), float(np.median(offs)), len(ws)))
    return out


def in_hero(game, line):
    """Whether most of a piece lies inside a hero level that draws its own ground."""
    for h in game.get("hero", []):
        if h.get("z") or not h.get("lift"):
            continue   # (a level in the air or indoors draws no street)
        if line.intersection(Point(*h["at"]).buffer(h["r"])).length > 0.5 * line.length:
            return h["id"]
    return None


def widths(game, geo, ground=None):
    """The keys each piece is to carry ({} for one the survey does not have), and the report."""
    roads = game["paths"]["road"]
    m = measure(roads, geo, ground)
    keys, rep = [], {"pieces": len(roads), "measured": 0, "measured_m": 0.0, "unmeasured_m": 0.0, "hero": [], "single_track": 0, "off_m": [],
                     "by_class": {}}
    for o, r in zip(roads, m):
        p = pts_of(o)
        line = LineString(p[:, :2]) if len(p) > 1 else None
        k = {}
        if r is None or line is None:
            if line is not None and geo["area"].contains(line):
                rep["unmeasured_m"] += line.length
            keys.append(k)
            continue
        w = round(min(ONE_WAY_MAX if o.get("o") else TWO_WAY_MAX, max(MIN_W, r[0])), 1)
        cls = ROADW.get(o.get("c"), 7)
        hero = in_hero(game, line)
        if hero:
            rep["hero"].append([hero, o.get("c"), round(float(line.interpolate(0.5, normalized=True).x)), round(float(line.interpolate(0.5, normalized=True).y)), cls, w])
            keys.append(k)
            continue
        rep["measured"] += 1
        rep["measured_m"] += line.length
        c = rep["by_class"].setdefault(o.get("c"), [])
        c.append((w, line.length))
        k["cw"] = w
        rep["off_m"].append((abs(r[1]), line.length))
        if not o.get("o") and w < TWO_WAY_M:
            k["st"] = 1
            rep["single_track"] += 1
        keys.append(k)
    by = {}
    for c, v in rep["by_class"].items():
        w = np.array([a for a, _ in v])
        l = np.array([b for _, b in v])
        o = np.argsort(w)
        cum = np.cumsum(l[o])
        q = lambda f: float(w[o][np.searchsorted(cum, cum[-1] * f)])
        by[c] = {"pieces": len(v), "km": round(float(l.sum()) / 1000, 2), "class_m": ROADW.get(c, 7), "p10": q(0.1), "median": q(0.5), "p90": q(0.9)}
    rep["by_class"] = by
    off = np.array(rep["off_m"]) if rep["off_m"] else np.zeros((1, 2))
    rep["off_m"] = {"note": "share of the measured length whose line lies this far or more from the surveyed carriageway's middle",
                    **{str(t): round(float(off[off[:, 0] >= t, 1].sum() / max(1e-9, off[:, 1].sum())), 3) for t in (0.5, 1.0, 1.5, 2.0, 3.0)}}
    rep["measured_m"], rep["unmeasured_m"] = round(rep["measured_m"]), round(rep["unmeasured_m"])
    return keys, rep


OWN = ("cw", "st")


def apply(game, keys, kept=()):
    """Write the keys; a piece in `kept` (another step's width: a channel's bank lane) keeps its own."""
    n = 0
    for i, (o, k) in enumerate(zip(game["paths"]["road"], keys)):
        if i in kept:
            continue
        before = {a: o.get(a) for a in OWN}
        for a in OWN:
            o.pop(a, None)
        o.update(k)
        n += before != {a: o.get(a) for a in OWN}
    return n


def main():
    import argparse
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--city", default="shibuya")
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    C = City(a.city)
    sp = C.file("road_surface.json")
    if not os.path.exists(sp):
        print(f"{a.city}: no road_surface.json (pipeline/road_survey.py); roads keep their class's width")
        return
    geo = road_survey.load(sp)
    gp = os.path.join(C.out, "game.json")
    game = json.load(open(gp, encoding="utf8"))
    keys, rep = widths(game, geo, ground_of(C, game))
    roads = game["paths"]["road"]
    if a.check:
        bad = []
        for i, (o, k) in enumerate(zip(roads, keys)):
            if {x: o.get(x) for x in OWN} != {x: k.get(x) for x in OWN}:
                bad.append(f"piece {i}: game.json has {[o.get(x) for x in OWN]}, the survey gives {[k.get(x) for x in OWN]}")
            if o.get("cw") and o["cw"] < CAR_M and not o.get("x"):
                bad.append(f"piece {i}: a carriageway of {o['cw']} m is open to cars")
        for b in bad[:20]:
            print("  " + b)
        if bad:
            raise SystemExit(f"road widths: {len(bad)} pieces are not as the survey gives them (python pipeline/road_width.py --city {a.city}, then pipeline/pack.py)")
        print(f"road widths: {rep['measured']} pieces carry the surveyed carriageway ({rep['measured_m'] / 1000:.1f} km), {rep['single_track']} single track")
        return
    n = apply(game, keys)
    json.dump(game, open(gp, "w"), separators=(",", ":"))   # as game_data.py writes it
    json.dump(rep, open(C.file("road_width.json"), "w", encoding="utf8"), indent=1, ensure_ascii=False)
    print(f"road widths: {rep['measured']} of {rep['pieces']} pieces measured ({rep['measured_m'] / 1000:.1f} km; {rep['unmeasured_m'] / 1000:.1f} km in the "
          f"survey's area keep their class's), {rep['single_track']} single track, {len(rep['hero'])} in a hero level; {n} changed")
    for c, v in sorted(rep["by_class"].items(), key=lambda kv: -kv[1]["class_m"]):
        print(f"  {c:13s} class {v['class_m']:>2} m   surveyed {v['p10']:.1f} / {v['median']:.1f} / {v['p90']:.1f} m (p10, median, p90)   {v['km']} km")


def ground_of(C, game):
    """The game's ground under a point, or None where the city's terrain cannot be read here."""
    try:
        from levels import Levels
        L = Levels(C.id, game)
        return L.at
    except Exception as e:   # (measured without it: a deck's piece is then told by its "d")
        print(f"  (no ground: {e})", file=sys.stderr)
        return None


if __name__ == "__main__":
    main()
