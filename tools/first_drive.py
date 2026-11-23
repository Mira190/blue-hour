"""The first drive, held statically (the owner's report of 22 November 2026: "the protagonist has just set out and the
road is a dead end"). "YOUR CAR [C]" is on the screen from the walk's first second; the drive from where the car waits
is the test of that promise. Inside the playable area (city.json game.bounds.ground, docs/BOUNDS.md; a street that
crosses its edge is shut there by the road works, bounds.js) the road graph is built as the game drives it
(pipeline/road_plan.py's plan: closed pieces out, one-ways, the turns banned at all times, and at each hour of the
story's day the streets shut at that hour, junctions.js shutNow), and this fails where:

  - your car (game.start.car, on the open road nearest it, as game.js kerbNear parks it) waits on a piece from which
    no drive at some hour reaches the area's main group: the streets each of which leads to every other, a two-way
    street turned round in where it ends (at the works, as the walk's line says, or in a cul-de-sac) but never a
    one-way one (a one-way street the car waits on, its way; a two-way one, both);
  - from there, straight on, no junction offers a way into the main group within AHEAD_M;
  - a place a drive is asked to (game.road_plan.drives, the walk's drive errands) cannot be driven to from the car
    at some hour;
  - a street open to cars inside the area is a one-way into a dead end, or is not a carriageway in the survey
    (OpenStreetMap as fetched: a service road with no access, a pedestrian street, a footway, a path, steps);
  - one is narrower between its walls than a car needs (road_plan.py playable(): it would close it).

It prints, inside the area, every drivable dead end (two-way culs-de-sac, streets that lead only to the works at the
edge at some hour) with its place, which are reported, not failed: the works are the area's designed edge.

    python tools/first_drive.py [city]          (shibuya; a few seconds; tools/check.sh's static checks)
The browser half, stills along the drive: tools/first_drive.js.
"""
import collections
import datetime
import heapq
import json
import math
import os
import sys

import numpy as np
import shapely
from shapely.geometry import LineString, Point, Polygon

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "pipeline"))
import road_plan as R  # noqa: E402

AHEAD_M = 200.0
NOT_ROAD = ("pedestrian", "footway", "path", "steps", "cycleway", "track", "corridor", "bridleway")


def main(city="shibuya"):
    cfg, rp, measured, bus, osm = R.load(city)
    game = json.load(open(os.path.join(ROOT, "web", "data", city, "game.json"), encoding="utf8"))
    roads = game["paths"]["road"]
    g = (cfg.get("game") or {})
    area = Polygon(g["bounds"]["ground"]["poly"])
    P = [R.pts_of(o) for o in roads]
    open_ = [i for i, o in enumerate(roads) if not o.get("x") and len(P[i]) > 1]
    lines = {i: LineString(P[i][:, :2]) for i in open_}
    inside = {i for i in open_ if area.contains(lines[i])}
    crossing = {i for i in open_ if i not in inside and lines[i].intersects(area)}
    key = lambda p: R.key_of(p[0], p[1])
    head = lambda i, d: key(P[i][-1 if d else 0])
    tail = lambda i, d: key(P[i][0 if d else -1])
    legal = lambda i, d: not (roads[i].get("o") == 1 and d == 0) and not (roads[i].get("o") == -1 and d == 1)
    node = collections.defaultdict(list)
    for i in inside | crossing:
        node[key(P[i][0])].append((i, 0))
        node[key(P[i][-1])].append((i, 1))
    bans = {(i, e, k, e2) for i in inside for e, k, e2, n in (roads[i].get("nt") or []) if n == 1}
    # the story's day: its first episode's date, in the year the walk is set
    ep = ((g.get("story") or {}).get("episodes") or [{}])[0]
    m, d = ep.get("date", [10, 10])
    dow = datetime.date(2026, m, d).weekday()

    def shut_at(i, dirn, t):
        for way, shut, W in roads[i].get("tb") or []:
            if not way or way == dirn:
                win = any(((w[0] >> dow) & 1) and w[1] <= t < w[2] for w in W)
                if (shut and win) or (not shut and not win):
                    return True
        return False

    def graph(t):
        arcs = [(i, dd) for i in inside | crossing for dd in (0, 1) if legal(i, dd) and not shut_at(i, 1 if dd else -1, t)]
        A = set(arcs)
        succ = {}
        for a in arcs:
            i, dd = a
            e = 1 if dd else 0
            pe = P[i][-1 if dd else 0]
            if i in crossing and not area.contains(Point(pe[0], pe[1])):
                succ[a] = []   # (it leaves the area: the works stand across it)
            else:
                succ[a] = [(j, 1 if e2 == 0 else 0) for j, e2 in node[head(i, dd)]
                           if j != i and (j, 1 if e2 == 0 else 0) in A and (i, e, j, e2) not in bans]
            if not succ[a] and (i, 1 - dd) in A:
                succ[a] = [(i, 1 - dd)]   # (a two-way street that ends, at the works or in a cul-de-sac: turned round in, as at any closed road)
        return arcs, succ

    def sccs(arcs, succ):
        idx, low, on, st, out, n = {}, {}, set(), [], [], [0]
        for s in arcs:
            if s in idx:
                continue
            work = [(s, iter(succ[s]))]
            idx[s] = low[s] = n[0]; n[0] += 1; st.append(s); on.add(s)
            while work:
                v, it = work[-1]
                w = next(it, None)
                if w is not None:
                    if w not in idx:
                        idx[w] = low[w] = n[0]; n[0] += 1; st.append(w); on.add(w)
                        work.append((w, iter(succ[w])))
                    elif w in on:
                        low[v] = min(low[v], idx[w])
                    continue
                work.pop()
                if work:
                    low[work[-1][0]] = min(low[work[-1][0]], low[v])
                if low[v] == idx[v]:
                    comp = set()
                    while True:
                        w = st.pop(); on.discard(w); comp.add(w)
                        if w == v:
                            break
                    out.append(comp)
        return out

    bad, notes = [], []
    # where the car waits
    cx, cy = (game.get("start") or {}).get("car") or game["start"]["at"]   # (as the page has it)
    car = min(inside | crossing, key=lambda i: lines[i].distance(Point(cx, cy)))
    off = lines[car].distance(Point(cx, cy))
    if off > 40:
        bad.append(f"your car: no open street inside the area within 40 m of {cx:.0f}, {cy:.0f}")
    car_arcs = [(car, dd) for dd in (0, 1) if legal(car, dd)]
    s_car = lines[car].project(Point(cx, cy))
    spots = [(x, y, name) for x, y, name in R.drives(cfg, game, rp) if name != "where your car starts"]
    traps = collections.defaultdict(set)
    for hour in range(24):
        t = hour * 60 + 30
        arcs, succ = graph(t)
        comps = sccs(arcs, succ)
        main_ = max(comps, key=lambda c: sum(lines[i].length for i, _ in c))
        hm = f"{hour:02d}:30"
        reach = set()
        for a in car_arcs:
            seen, stack = {a}, [a]
            while stack:
                for b in succ.get(stack.pop(), []):
                    if b not in seen:
                        seen.add(b)
                        stack.append(b)
            if a not in succ or not (seen & main_):
                bad.append(f"your car at {cx:.0f}, {cy:.0f} waits on piece {car} ({roads[car].get('c')}), going {'with' if a[1] else 'against'} its points, which at {hm} leads nowhere but a dead end or the works: no way into the area's streets")
            reach |= seen
        # ahead: the shortest drive from the car into the main group, never turning round
        for a in car_arcs:
            if a not in succ:
                continue
            first = (lines[car].length - s_car) if a[1] else s_car
            best, heap = {a: first}, [(first, a)]
            run = math.inf
            while heap:
                dist, cur = heapq.heappop(heap)
                if dist > best.get(cur, math.inf) or dist > AHEAD_M:
                    continue
                if cur in main_:
                    run = dist - (first if cur == a else 0) if cur == a else dist - lines[cur[0]].length
                    break
                for b2 in succ.get(cur, []):
                    if b2[0] == cur[0]:
                        continue   # (not turned round)
                    nd = dist + lines[b2[0]].length
                    if nd < best.get(b2, math.inf):
                        best[b2] = nd
                        heapq.heappush(heap, (nd, b2))
            if run > AHEAD_M:
                bad.append(f"your car at {cx:.0f}, {cy:.0f}: at {hm} the streets that lead on are not within {AHEAD_M:.0f} m ahead (going {'with' if a[1] else 'against'} piece {car}'s points)")
            elif hour == 17:
                notes.append(f"your car waits on piece {car} ({roads[car].get('c')}{', one-way' if roads[car].get('o') else ''}), {off:.0f} m from game.start.car; the streets that lead on begin {max(0.0, run):.0f} m ahead")
        # each place a drive is asked to: on a street the car reaches
        for x, y, name in spots:
            near = sorted({i for i, _ in reach}, key=lambda i: lines[i].distance(Point(x, y)))
            if not near or lines[near[0]].distance(Point(x, y)) > 40:
                bad.append(f"\"{name}\" at {x:.0f}, {y:.0f}: no street the car reaches from where it waits within 40 m at {hm}")
        for i, dd in arcs:
            if (i, dd) not in main_:
                traps[(i, dd)].add(hour)
    # the streets open to cars inside the area
    ways = [(osm["_loc"](w["ll"]), w["t"]) for w in osm["ways"] if len(w["ll"]) > 1] if osm else []
    tree = shapely.STRtree([w for w, _ in ways]) if ways else None
    W, wt = R.walls(city, area.buffer(20))
    n_dead = 0
    for i in sorted(inside | crossing):
        o, line = roads[i], lines[i]
        part = line.intersection(area)
        part = max(getattr(part, "geoms", [part]), key=lambda x: x.length)
        mid = part.interpolate(0.5, normalized=True)
        if tree is not None and not o.get("j"):
            best = None
            for j in tree.query(mid, predicate="dwithin", distance=6.0):
                dd = ways[j][0].distance(mid)
                if best is None or dd < best[0]:
                    best = (dd, ways[j][1])
            tg = best[1] if best else None
            if tg and (tg.get("highway") in NOT_ROAD or (tg.get("highway") == "service" and tg.get("access") in ("no", "private"))
                       or tg.get("motor_vehicle") in ("no", "private") or tg.get("motorcar") in ("no", "private")):
                bad.append(f"piece {i} ({o.get('c')}) at {mid.x:.0f}, {mid.y:.0f} is open to cars and is not a carriageway in the survey: {json.dumps(tg, ensure_ascii=False)}")
        if part.length >= 8:
            p = P[i]
            z_of = lambda q, p=p: float(p[int(np.argmin(np.hypot(p[:, 0] - q.x, p[:, 1] - q.y))), 2])
            w50, _ = R.clear_width(part, z_of, W, wt)
            need = R.LANE_ONE_M if o.get("o") else R.LANE_TWO_M
            if w50 < need:
                bad.append(f"piece {i} ({o.get('c')}) at {mid.x:.0f}, {mid.y:.0f}: {w50:.1f} m between its walls, open to cars (needs {need} m)")
        for end in (0, -1):
            pe = P[i][end, :2]
            if not area.contains(Point(*pe)):
                continue
            k = key(pe)
            deg = sum(1 for j in open_ if key(P[j][0]) == k or key(P[j][-1]) == k) if i in inside or i in crossing else 0
            if deg == 1:
                n_dead += 1
                if o.get("o") and (end == -1) == (o["o"] == 1):
                    bad.append(f"piece {i} ({o.get('c')}) is a one-way street into a dead end at {pe[0]:.0f}, {pe[1]:.0f}")
                else:
                    notes.append(f"drivable dead end at {pe[0]:.0f}, {pe[1]:.0f}: piece {i} ({o.get('c')}, {line.length:.0f} m), a cul-de-sac")
    for (i, dd), hours in sorted(traps.items()):
        if (i, 1 - dd) in traps or not legal(i, 1 - dd):
            hs = sorted(hours)
            when = "at every hour" if len(hs) == 24 else f"at {len(hs)} hours ({hs[0]:02d}:30 to {hs[-1]:02d}:30)"
            notes.append(f"leads only to the works at the edge {when}: piece {i} ({roads[i].get('c')}) at {lines[i].interpolate(0.5, normalized=True).x:.0f}, {lines[i].interpolate(0.5, normalized=True).y:.0f}, going {'with' if dd else 'against'} its points")
    for n in notes:
        print(f"  {n}")
    import re
    folded = collections.OrderedDict()   # (one line for each finding, with the hours it holds at)
    for msg in bad:
        m = re.search(r"\b(\d\d):30\b", msg)
        k = re.sub(r"\b\d\d:30\b", "{hours}", msg) if m else msg
        folded.setdefault(k, []).append(m.group(1) if m else None)
    for k, hs in folded.items():
        hs = sorted({h for h in hs if h})
        print(f"FAIL {city}: " + k.replace("{hours}", hs[0] + ":30" if len(hs) == 1 else f"{len(hs)} hours, {hs[0]}:30 to {hs[-1]}:30"))
    print(f"{city}: first drive {'FAILED' if bad else 'ok'}: {len(inside)} streets inside the area, {len(crossing)} crossing its edge, {n_dead} drivable dead ends")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:2]))
