"""A road piece's line taken inside the surveyed carriageway where a lane driven along it would lie over a kerb
(docs/ROADS.md, "The ground as surveyed"; issue 196).

A piece's line is the map's (OpenStreetMap, through Overture) and its kerbs are the survey's. The two agree within a
metre over most of the length, but the traffic drives at fixed places off the line (web/game/junctions.js: a lane's
middle 1.7 m to the keep side, a second 3 m outside it; a one-way pair 1.7 m and 1.5 m either side), and where the
line runs close along one kerb of a wide carriageway a lane's wheels are on the footway: the road past Hachiko is
29 m wide and the map's line 2.5 m from its east kerb, so your car set you down with two wheels on the square. While
a road was a band centred on its line this could not be seen; on the surveyed ground it can.

Each vertex of a piece on the ground, inside the planned area and 60 m round it, is moved square to its line, by no
more than SHIFT_M (the survey's and the map's accuracy together), until the lanes driven there have their room on
both sides: a car's half width, the gutter and a hand past the outer lane's middle. A node is moved once, for every
piece that ends on it. A piece with no room for its lanes at all (a street narrower than they need) is left as it is.
A second run moves nothing.

    python pipeline/road_fit.py --city shibuya            # after road_width.py; then bus_lines.py, road_ground.py, pack.py (tools/road_plan.sh)
    python pipeline/road_fit.py --city shibuya --check    # no vertex in the area is to be moved
"""
import json
import os

import numpy as np
from shapely.geometry import LineString, Point, Polygon

import road_ground

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHIFT_M = 1.5
CAR_M = 0.95 + 0.5 + 0.25     # past a lane's middle: half a car, the gutter, a hand
TOL_M = 0.05


def need(o):
    """Room wanted to the left and to the right of a piece's line (the map keeps left)."""
    two, one = road_ground.lanes_each_way(o) > 1, bool(o.get("o"))
    if o.get("st") or (one and not two):
        return CAR_M, CAR_M                       # (driven down its middle)
    if one:
        return 1.7 + CAR_M, 1.5 + CAR_M
    w = o.get("cw") or 0
    lane = 4.7 if two else (min(1.7, w / 4) if w else 1.7)
    return lane + CAR_M, lane + CAR_M


def moves(game, S):
    """{(piece, vertex): (dx, dy)} for the vertices to move."""
    b = game.get("bounds", {}).get("ground", {}).get("poly")
    if not b:
        return {}
    area = Polygon(b).buffer(road_ground.MARGIN_M)
    edge = S.asphalt.boundary
    roads = game["paths"]["road"]
    index = {id(o): i for i, o in enumerate(roads)}
    want = {}      # (piece, vertex) -> shift
    at_node = {}   # node key -> [(piece, vertex, shift)]
    for o in S.pieces:
        if o.get("x"):
            continue
        i = index[id(o)]
        p = road_ground.pts_of(o)
        L, R = need(o)
        for k in range(len(p)):
            q = p[k, :2]
            pt = Point(*q)
            if not area.contains(pt) or not S.asphalt.contains(pt):
                continue
            h = p[min(k + 1, len(p) - 1), :2] - p[max(k - 1, 0), :2]
            if np.hypot(*h) < 1e-6:
                continue
            h = h / np.hypot(*h)
            n = np.array([-h[1], h[0]])

            def room(sign):
                hit = LineString([q, q + sign * n * 40.0]).intersection(edge)
                return 40.0 if hit.is_empty else pt.distance(hit)
            l, r = room(1), room(-1)
            if l + r < L + R:
                continue                           # (no room for its lanes whichever way it is moved)
            s = 0.0
            if l < L - TOL_M:
                s = -(L - l)                       # (to the right)
            elif r < R - TOL_M:
                s = R - r
            s = float(np.clip(s, -SHIFT_M, SHIFT_M))
            if abs(s) < TOL_M:
                continue
            v = n * s
            if k in (0, len(p) - 1):
                at_node.setdefault((o["p"][3 * k], o["p"][3 * k + 1]), []).append((i, k, v))
            else:
                want[(i, k)] = v
    # a node: the mean of what its pieces ask, for every piece's end on it; left where they ask opposite things
    ends = {}
    for i, o in enumerate(roads):
        n = len(o["p"]) // 3
        for k in (0, n - 1):
            ends.setdefault((o["p"][3 * k], o["p"][3 * k + 1]), []).append((i, k))
    for key, asks in at_node.items():
        v = np.mean([a[2] for a in asks], axis=0)
        if any(a[2] @ v <= 0 for a in asks) or np.hypot(*v) < TOL_M:
            continue
        for i, k in ends[key]:
            want[(i, k)] = v
    return want


def main():
    import argparse
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--city", default="shibuya")
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    gp = os.path.join(ROOT, "web", "data", a.city, "game.json")
    game = json.load(open(gp, encoding="utf8"))
    if not os.path.exists(os.path.join(ROOT, "cities", a.city, "road_surface.json")):
        print(f"{a.city}: no road_surface.json; the pieces keep the map's lines")
        return
    import road_survey
    import road_width
    from cityctx import City
    geo = road_survey.load(os.path.join(ROOT, "cities", a.city, "road_surface.json"))
    ground = road_width.ground_of(City(a.city), game)
    total, worst = 0, 0.0
    # (a vertex moved changes its neighbours' direction a little, and a piece's width, which is measured from its line and
    # gives its lanes their places: the widths are measured again after each pass, and a few passes settle both)
    for _ in range(1 if a.check else 8):
        w = moves(game, road_ground.of_game(a.city, game, ground))
        w = {k: v for k, v in w.items() if np.hypot(*v) >= (0.25 if a.check else TOL_M)}
        if a.check:
            for (i, k), v in list(w.items())[:12]:
                o = game["paths"]["road"][i]
                print(f"  piece {i} ({o.get('c')}) at {o['p'][3 * k] / 10:.0f}, {o['p'][3 * k + 1] / 10:.0f}: a lane {np.hypot(*v):.1f} m over the surveyed kerb")
            if w:
                raise SystemExit(f"FAIL road fit: {len(w)} vertices of the road pieces have a lane over a surveyed kerb (python pipeline/road_fit.py --city {a.city}, then tools/road_plan.sh's last steps)")
            print("road fit: every lane driven in the planned area has its room inside the surveyed kerbs")
            return
        if not w:
            break
        for (i, k), v in w.items():
            p = game["paths"]["road"][i]["p"]
            p[3 * k] = int(round(p[3 * k] + v[0] * 10))
            p[3 * k + 1] = int(round(p[3 * k + 1] + v[1] * 10))
            worst = max(worst, float(np.hypot(*v)))
        total += len(w)
        road_width.apply(game, road_width.widths(game, geo, ground)[0])
    if total:
        json.dump(game, open(gp, "w"), separators=(",", ":"))
    print(f"road fit: {total} vertices moved inside the surveyed carriageway, {worst:.1f} m at most")


if __name__ == "__main__":
    main()
