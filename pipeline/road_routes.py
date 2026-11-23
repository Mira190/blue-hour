"""The drives a player is given, held inside the planned area (docs/ROADS.md, issue 196).

The road plan's check holds that every place a drive is asked to can be reached from every other. That is not yet a
drive a player can make: the walk and the story keep to the planned area (game.json bounds.ground, docs/BOUNDS.md),
where a car is stopped at the road works, and the router knows nothing of that edge. A way that leaves the area and
comes back in is a route line that leads the player into the barriers.

For every pair of the places a drive is asked to (game.road_plan.drives, the walk's drive errands, where your car
starts, the story's rides) this finds the shortest way by road, one-ways kept, closed pieces left out, as the game's
router does (web/game/cars.js), twice: on all the roads, and on the roads inside the planned area alone. It fails
where there is no way inside the area, and where the way the router would take (the shortest on all the roads) leaves
it. It prints each drive's length, its narrowest carriageway and its detour inside the area.

pipeline/bounds.py gives the planned area room for these ways (`ways`: the pieces of every such drive), so a fault
here means the area was not made again after a place or a road changed.

    python pipeline/road_routes.py shibuya            # the report
    python pipeline/road_routes.py shibuya --check    # exit 1 on a fault
"""
import heapq
import json
import math
import os
import sys

import numpy as np
from shapely.geometry import LineString, Point, Polygon

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NODE = 2.0
ROADW = {"motorway": 14, "trunk": 12, "primary": 12, "secondary": 10, "tertiary": 9, "residential": 7, "unclassified": 6, "living_street": 5}
EDGE_M = 25.0     # a place is in the area when it is this far inside its edge (rides.js: nowhere past the planned area's edge)


def pts_of(o):
    return np.asarray(o["p"], np.float64).reshape(-1, 3) / 10


def key_of(x, y):
    return (round(x / NODE), round(y / NODE))


def places(game, cfg):
    import road_plan
    out = list(road_plan.drives(cfg, game, (cfg.get("game") or {}).get("road_plan") or {}))
    for ep in ((game.get("story") or {}).get("episodes") or []):
        for f in ep.get("frames", []):
            r = f.get("ride")
            at = r.get("to") or r.get("at") if isinstance(r, dict) else None
            if at:
                out.append((at[0], at[1], f"the story's ride, {f.get('id', 'a frame')}"))
    seen, uniq = set(), []
    for x, y, name in out:
        k = (round(x), round(y))
        if k not in seen:
            seen.add(k)
            uniq.append((x, y, name))
    return uniq


def graph(roads, keep):
    """Directed arcs between node cells over the pieces `keep` passes: {node: [(node2, length, piece)]}."""
    G = {}
    for i, o in enumerate(roads):
        p = pts_of(o)
        if len(p) < 2 or o.get("x") or not keep(i, p):
            continue
        a, b = key_of(*p[0, :2]), key_of(*p[-1, :2])
        l = float(np.hypot(*np.diff(p[:, :2], axis=0).T).sum())
        ow = o.get("o", 0)
        if ow >= 0:
            G.setdefault(a, []).append((b, l, i))
        if ow <= 0:
            G.setdefault(b, []).append((a, l, i))
    return G


def nearest(roads, x, y, keep):
    best = None
    q = Point(x, y)
    for i, o in enumerate(roads):
        p = pts_of(o)
        if len(p) < 2 or o.get("x") or not keep(i, p) or abs(p[0, 0] - x) > 400 or abs(p[0, 1] - y) > 400:
            continue
        d = LineString(p[:, :2]).distance(q)
        if best is None or d < best[0]:
            best = (d, i)
    return best


def shortest(G, roads, src, dst):
    """From piece src to piece dst: (metres, [pieces]) or None. A drive starts at either end its piece lets it reach."""
    ps, pd = pts_of(roads[src]), pts_of(roads[dst])
    ow_s, ow_d = roads[src].get("o", 0), roads[dst].get("o", 0)
    starts = ([key_of(*ps[-1, :2])] if ow_s >= 0 else []) + ([key_of(*ps[0, :2])] if ow_s <= 0 else [])
    ends = set(([key_of(*pd[0, :2])] if ow_d >= 0 else []) + ([key_of(*pd[-1, :2])] if ow_d <= 0 else []))
    if src == dst:
        return 0.0, [src]
    dist, prev, heap = {}, {}, []
    for s in starts:
        dist[s] = 0.0
        heapq.heappush(heap, (0.0, s))
    while heap:
        d, u = heapq.heappop(heap)
        if d > dist.get(u, 1e18):
            continue
        if u in ends:
            way, n = [dst], u
            while n in prev:
                n, i = prev[n]
                way.append(i)
            way.append(src)
            return d, way[::-1]
        for v, l, i in G.get(u, []):
            nd = d + l
            if nd < dist.get(v, 1e18):
                dist[v] = nd
                prev[v] = (u, i)
                heapq.heappush(heap, (nd, v))
    return None


def ways(roads, spots):
    """The points of every piece on the shortest way by road between each two of the places [(x, y, name)]: what a
    planned area has to hold for its drives to be made inside it."""
    anyp = lambda i, p: True
    G = graph(roads, anyp)
    at = [n[1] for n in (nearest(roads, x, y, anyp) for x, y, _ in spots) if n is not None and n[0] <= 35]
    on = set()
    for i in at:
        for j in at:
            if i != j:
                r = shortest(G, roads, i, j)
                if r:
                    on.update(r[1])
    return [(float(q[0]), float(q[1])) for k in sorted(on) for q in pts_of(roads[k])]


def main():
    cid = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("-") else "shibuya"
    check = "--check" in sys.argv
    game = json.load(open(os.path.join(ROOT, "web", "data", cid, "game.json"), encoding="utf8"))
    cfg = json.load(open(os.path.join(ROOT, "cities", cid, "city.json"), encoding="utf8"))
    roads = game["paths"]["road"]
    b = (game.get("bounds") or {}).get("ground")
    if not b:
        print(f"{cid}: no planned area; nothing to hold the drives to")
        return
    area = Polygon(b["poly"])
    inside = lambda i, p: area.contains(LineString(p[:, :2]))
    anyp = lambda i, p: True
    G_all, G_in = graph(roads, anyp), graph(roads, inside)
    spots = []
    bad = []
    for x, y, name in places(game, cfg):
        if area.exterior.distance(Point(x, y)) < EDGE_M or not area.contains(Point(x, y)):
            bad.append(f"\"{name}\" at {x:.0f}, {y:.0f} is not {EDGE_M:.0f} m inside the planned area")
            continue
        n = nearest(roads, x, y, inside)
        if n is None or n[0] > 35:
            bad.append(f"\"{name}\": no road inside the planned area within 35 m")
            continue
        spots.append((name, n[1]))
    width = lambda i: roads[i].get("cw") or ROADW.get(roads[i].get("c"), 7)
    print(f"{cid}: {len(spots)} places a drive is asked to, {sum(1 for i, o in enumerate(roads) if len(pts_of(o)) > 1 and not o.get('x') and inside(i, pts_of(o)))} road pieces inside the planned area")
    for name, i in spots:
        for other, j in spots:
            if i == j:
                continue
            a, c = shortest(G_all, roads, i, j), shortest(G_in, roads, i, j)
            if c is None:
                bad.append(f"no way inside the planned area from \"{name}\" to \"{other}\"")
                continue
            out = [k for k in a[1] if not inside(k, pts_of(roads[k]))] if a else []
            if out:
                bad.append(f"the shortest way from \"{name}\" to \"{other}\" ({a[0]:.0f} m) leaves the planned area on {len(out)} pieces; inside it the way is {c[0]:.0f} m")
            print(f"  {name[:34]:<34} -> {other[:34]:<34} {c[0]:>5.0f} m inside ({(a[0] if a else float('nan')):>5.0f} m on all roads), narrowest {min(width(k) for k in c[1]):.1f} m, {len(c[1])} pieces")
    for m in bad:
        print("  FAULT: " + m)
    if check and bad:
        raise SystemExit(f"FAIL road routes: {len(bad)} faults: python pipeline/bounds.py --city {cid}, game_text.py and pack.py")
    print(f"road routes: {len(spots)} places, every drive between them inside the planned area" if not bad else f"road routes: {len(bad)} faults")


if __name__ == "__main__":
    main()
