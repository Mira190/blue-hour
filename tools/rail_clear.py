"""No built solid stands in a train's way (the owner's report, 25 November 2026: south of Shibuya Station the Yamanote
Line's trains ran through the walls of the new south exit's building and of the buildings beside it).

A train is drawn on its course (game.json "trains", cities/shibuya/rail.py) everywhere but its dark stretches, where it
runs inside a station's box and is not drawn. Its envelope is the course's line widened by half a car and a hand
(HALF_M) from the rail to the contact wire (WIRE_M over the rail). Every solid of buildings.json that reaches into that
envelope outside a dark stretch is listed; pipeline/stations.py over_tracks() carves the envelope out of them.

    python tools/rail_clear.py [city]        # list them; FAIL on any
"""
import json
import os
import sys

import numpy as np
import shapely
import shapely.ops
from shapely.geometry import LineString, Polygon

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HALF_M = 1.9    # half an E235's width (2.95 m) and a hand: the envelope either side of the course
WIRE_M = 5.2    # the contact wire 5.0 m over the rail (rail.py), and a little more
FLOOR_M = 0.5   # (a solid's top this little over the rail is the bed or a platform, not in the way)
MIN_M2 = 0.5    # (a sliver this small is a rounding of the decimetre grid)


def courses(game):
    """[(track id, LineString of the light stretches, the course's points (x, y, z) in metres)]: the parts of each
    course where its trains are drawn."""
    out = []
    for t in game.get("trains", {}).get("tracks", []):
        p = t["p"]
        P = np.array([(p[i] / 10, p[i + 1] / 10, p[i + 2] / 10) for i in range(0, len(p), 3)])
        g = LineString(P[:, :2])
        cut = sorted([tuple(d) for d in t.get("dark", [])] + [(-1e9, t["hide_m"][0]), (t["hide_m"][1], 1e9)])
        light, m = [], 0.0
        for a, b in cut:
            if a > m:
                light.append(shapely.ops.substring(g, m, a))
            m = max(m, b)
        if m < g.length:
            light.append(shapely.ops.substring(g, m, g.length))
        out.append((t["id"], [q for q in light if q.length > 0.5], P))
    return out


def envelope(game):
    """[(track id, the envelope's plan (Polygon), rail(x, y) the rail's height at the nearest point of the course)]"""
    out = []
    for tid, light, P in courses(game):
        g = LineString(P[:, :2])
        m = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(P[:, :2], axis=0).T))])
        def rail(x, y, g=g, m=m, P=P):
            return float(np.interp(g.project(shapely.Point(x, y)), m, P[:, 2]))
        for q in light:
            out.append((tid, q.buffer(HALF_M, cap_style="flat"), rail))
    return out


def rail_over(q, rail):
    """The highest the rail is under a piece of plan q (the course climbs and falls under a long building)."""
    return max(rail(x, y) for g in getattr(q, "geoms", [q]) if g.geom_type == "Polygon" for x, y in g.exterior.coords)


def not_drawn(city):
    """The solids a landmark draws instead or that are gone (landmarks.json "hidden" and "demolished", scene.json
    "hidden_solids"): not the city's walls, and not this check's."""
    d = os.path.join(ROOT, "web", "data", city)
    out = set()
    for f, keys in (("landmarks.json", ("hidden", "demolished")), ("scene.json", ("hidden_solids",))):
        if os.path.exists(os.path.join(d, f)):
            J = json.load(open(os.path.join(d, f), encoding="utf8"))
            for k in keys:
                out |= set(J.get(k) or [])
    return out


def in_the_way(city, B=None, game=None):
    """[(solid index, building index, m² in the envelope, the rail's height there, the solid's bottom and top)]"""
    game = game or json.load(open(os.path.join(ROOT, "web", "data", city, "game.json"), encoding="utf8"))
    B = B or json.load(open(os.path.join(ROOT, "web", "data", city, "buildings.json"), encoding="utf8"))
    skip = not_drawn(city)
    E = envelope(game)
    if not E:
        return []
    tree = shapely.STRtree([e[1] for e in E])
    out = []
    for si, s in enumerate(B["s"]):
        if si in skip:
            continue
        rings = s[4:]
        if not rings or len(rings[0]) < 6:
            continue
        P = Polygon([(rings[0][i] / 10, rings[0][i + 1] / 10) for i in range(0, len(rings[0]), 2)],
                    [[(h[i] / 10, h[i + 1] / 10) for i in range(0, len(h), 2)] for h in rings[1:] if len(h) >= 6]).buffer(0)
        for k in tree.query(P, predicate="intersects"):
            tid, env, rail = E[k]
            q = P.intersection(env)
            if q.area < MIN_M2:
                continue
            z = rail_over(q, rail)
            lo, hi = (s[1] + s[2]) / 10, (s[1] + s[3]) / 10
            if lo < z + WIRE_M and hi > z + FLOOR_M:
                out.append((si, s[0], round(q.area, 1), round(z, 2), lo, hi))
                break
    return out


def main():
    city = sys.argv[1] if len(sys.argv) > 1 else "shibuya"
    B = json.load(open(os.path.join(ROOT, "web", "data", city, "buildings.json"), encoding="utf8"))
    bad = in_the_way(city, B)
    for si, bi, a, z, lo, hi in bad:
        m = B["b"][bi]
        print(f"  solid {si} ({m[0] or m[1] or '-'} {m[6]}): {a} m2 in a train's way, rail {z} m, solid {lo} to {hi} m")
    print(f"{city}: {len(bad)} solids in a train's way" + ("" if bad else " (none)"))
    if bad:
        print("FAIL a solid stands in a train's way: pipeline/stations.py over_tracks()")
        sys.exit(1)


if __name__ == "__main__":
    main()
