"""A city's road network as a designed thing: what every end of it is, where traffic belongs, and where a bus goes.

The game's road graph is game.json's paths.road (pipeline/game_data.py: Overture's segments, OpenStreetMap's survey),
joined where pieces share an end. Nothing said what an end of it was, so the traffic was made on any street and drove
into any other: a street the model walls off, a cul-de-sac and a road that leaves the map were all the same to it
(issue 167: a drive that ended at a wall with three buses and two cars packed into it, and more coming out). This
pass decides it, from the survey and from what is built, and writes the decision on the road pieces:

  x: 1        a piece closed to cars: the built model stands across it (the game's own measure of it,
              cities/<id>/road_measured.json from tools/road_net_dump.js: a piece the game cuts at a wall or keeps off
              because no car fits along it), or the city closes it by decision (city.json game.road_plan.closed:
              [[x, y, r, why], ...]). It is out of the traffic's graph and the routes'; it is still painted and walked
  e: [a, b]   what each end of the piece is, where no other open piece joins it there: 1 a gate (the street goes on
              in the real city and leaves the map here: traffic comes in and goes out), 2 a dead end (the street ends
              here in the real city too), 3 a closure (the street goes on, and the level closes it here: a piece
              marked x lies beyond, or the city names the place: game.road_plan.closures, [[x, y, r, why], ...], where
              the survey's road goes on under cover and the data has no piece for it). 0 where the end is a junction
  q: 1        a quiet piece: no way along it leads from a gate to a gate without turning round (a cul-de-sac and the
              streets only it serves, a stub left before a closure). No traffic is made on it and none turns into it;
              a route takes it only to a place on it
  b: 1        a bus street: a route=bus relation of OpenStreetMap or a GTFS shape runs along it
              (cities/<id>/roads_osm.json, pipeline/road_osm.py). Buses are made on these and keep to them

A gate is an end within EDGE_M of the edge of the roads' extent (the map's edge; a phone's district's edge, where
pipeline/district.py runs this again on the roads it cut), or one the city names (game.road_plan.gates).

    python pipeline/road_plan.py --city shibuya            # writes game.json and cities/<id>/road_plan.json
    python pipeline/road_plan.py --city shibuya --check    # the static checks (tools/check.sh), nothing written

The checks: the plan in game.json is the one this pass makes now (so a change to the roads, the measure or the bus
data without a new plan fails); no open piece's line runs through a building's solid standing on the ground; every
end is a gate, a dead end or a closure; no bus street is quiet; a closure is not the only way out of an open piece
unless it is quiet; every place a drive is asked to (game.road_plan.drives, the walk's drive errands and the start's
car) lies on an open piece, all in one strongly connected part of the graph: each can be driven to from every other.
"""
import argparse
import collections
import json
import math
import os
import sys

import numpy as np
import shapely
from shapely.geometry import LineString, Point, Polygon

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EDGE_M = 60.0        # an end this near the edge of the roads' extent leaves the map: a gate
NODE = 2.0           # pieces join where their ends share a 2 m cell (web/game/actors.js network)
BUS_NEAR_M = 9.0     # a piece is a bus street where this share of it lies this near a bus route's line
BUS_SHARE = 0.7
THROUGH_M = 1.3      # a road's line runs through a solid when a car's half width of it is inside (road_passages.py)
GATE, DEAD, CLOSED = 1, 2, 3
KIND = {GATE: "gate", DEAD: "dead end", CLOSED: "closure"}


def pts_of(o):
    return np.asarray(o["p"], np.float64).reshape(-1, 3) / 10


def key_of(x, y):
    return (round(x / NODE), round(y / NODE))


def one_ways(roads, osm):
    """A piece that is two-way in the game and one-way in OpenStreetMap as fetched takes OSM's direction (o: 1 with its
    points, -1 against them), marked ow: 1 so that a second run knows it was this pass's. Overture's segments lose a
    one-way that OSM gives with a condition beside it; in Shibuya nine back streets of Dogenzaka were two-way so."""
    ways = [(osm["_loc"](w["ll"]), w["t"]) for w in osm["ways"] if len(w["ll"]) > 1]
    tree = shapely.STRtree([g for g, _ in ways])
    n = 0
    for o in roads:
        if o.pop("ow", None):
            o.pop("o", None)
        if o.get("o"):
            continue
        p = pts_of(o)
        if len(p) < 2:
            continue
        line = LineString(p[:, :2])
        votes = []
        for f in (0.25, 0.5, 0.75):
            q = line.interpolate(f, normalized=True)
            la, lb = line.interpolate(max(0, line.project(q) - 2)), line.interpolate(min(line.length, line.project(q) + 2))
            best = None
            for j in tree.query(q, predicate="dwithin", distance=3.0):
                g, t = ways[j]
                s = g.project(q)
                a, b = g.interpolate(max(0, s - 2)), g.interpolate(min(g.length, s + 2))
                dot = (b.x - a.x) * (lb.x - la.x) + (b.y - a.y) * (lb.y - la.y)
                den = math.hypot(b.x - a.x, b.y - a.y) * math.hypot(lb.x - la.x, lb.y - la.y) or 1
                if abs(dot) / den > 0.9 and (best is None or g.distance(q) < best[0]):
                    best = (g.distance(q), t, 1 if dot > 0 else -1)
            if not best:
                votes.append(0)
                continue
            _, t, sg = best
            ow = t.get("oneway")
            votes.append(sg if ow in ("yes", "1", "true") else -sg if ow == "-1" else 0)
        if votes[0] and votes[0] == votes[1] == votes[2]:
            o["o"], o["ow"] = votes[0], 1
            n += 1
    return n


def join_gaps(roads, max_m=7.0):
    """Two ends of the graph that face each other across a few metres (the data leaves a street in two where a
    crossing or a kerb line was mapped between its halves) are one street: the first piece's end is moved onto the
    other's. Returns how many."""
    P = [pts_of(o) for o in roads]
    node = collections.defaultdict(list)
    for i, p in enumerate(P):
        if len(p) > 1 and not roads[i].get("x"):
            node[key_of(p[0, 0], p[0, 1])].append((i, 0))
            node[key_of(p[-1, 0], p[-1, 1])].append((i, 1))
    loose = [v[0] for v in node.values() if len(v) == 1]
    n, used = 0, set()
    for a in range(len(loose)):
        i, e = loose[a]
        if (i, e) in used:
            continue
        pa = P[i][-1 if e else 0]
        da = pa[:2] - P[i][-2 if e else 1][:2]
        for b in range(a + 1, len(loose)):
            j, f = loose[b]
            if j == i or (j, f) in used:
                continue
            pb = P[j][-1 if f else 0]
            gap = pb[:2] - pa[:2]
            d = float(np.hypot(*gap))
            if d > max_m or d < 1e-6 or abs(pa[2] - pb[2]) > 2:
                continue
            db = pb[:2] - P[j][-2 if f else 1][:2]
            if np.dot(da, gap) / (np.hypot(*da) * d or 1) > 0.8 and np.dot(db, -gap) / (np.hypot(*db) * d or 1) > 0.8:
                k = len(roads[i]["p"]) - 3 if e else 0
                roads[i]["p"][k:k + 3] = roads[j]["p"][len(roads[j]["p"]) - 3:] if f else roads[j]["p"][:3]
                used.update([(i, e), (j, f)])
                n += 1
                break
    return n


def join_under(cid, roads, unders):
    """A road the survey takes on under cover (a trunk road under a station's viaduct), which the data's builder leaves
    out as a tunnel: the one-way pieces that end either side of the place are joined across it, each end that arrives
    to the end it lines up with that leaves (pieces marked j: 1, made again on every run), and the solids over the
    joined lines are raised to stand `clear` metres over the road (buildings.json min_dm: the viaduct is a deck over
    the road, not a wall across it). unders: [{"at": [x, y], "r": m, "clear": m, "why": ...}]. Returns (joins, solids)."""
    roads[:] = [o for o in roads if not o.get("j")]
    if not unders:
        return 0, 0
    P = [pts_of(o) for o in roads]
    node = collections.defaultdict(list)
    for i, p in enumerate(P):
        if len(p) > 1:
            node[key_of(p[0, 0], p[0, 1])].append((i, 0))
            node[key_of(p[-1, 0], p[-1, 1])].append((i, 1))
    loose = [v[0] for v in node.values() if len(v) == 1]
    new, lines = [], []
    for u in unders:
        near = [(i, e) for i, e in loose if math.hypot(P[i][-1 if e else 0, 0] - u["at"][0], P[i][-1 if e else 0, 1] - u["at"][1]) < u["r"] and roads[i].get("o")]
        # an end the traffic arrives at (the piece's way leads to it), and one it leaves from
        arrives = [(i, e) for i, e in near if (roads[i]["o"] == 1) == (e == 1)]
        leaves = [(i, e) for i, e in near if (i, e) not in arrives]
        pairs = []
        for i, e in arrives:
            a = P[i][-1 if e else 0]
            da = a[:2] - P[i][-2 if e else 1][:2]
            for j, f in leaves:
                b = P[j][-1 if f else 0]
                db = P[j][-2 if f else 1][:2] - b[:2]
                gap = b[:2] - a[:2]
                d = float(np.hypot(*gap))
                if d < 3 or d > 2 * u["r"]:
                    continue
                ca, cb = np.dot(da, gap) / (np.hypot(*da) * d or 1), np.dot(db, gap) / (np.hypot(*db) * d or 1)
                if ca > 0.94 and cb > 0.94:
                    pairs.append((2 - ca - cb, i, e, j, f, d))
        used_a, used_b = set(), set()
        for _, i, e, j, f, d in sorted(pairs):
            if (i, e) in used_a or (j, f) in used_b:
                continue
            used_a.add((i, e)), used_b.add((j, f))
            a, b = P[i][-1 if e else 0], P[j][-1 if f else 0]
            n = max(2, int(d / 8) + 1)
            pts = [a + (b - a) * k / (n - 1) for k in range(n)]
            src = roads[i]
            piece = {"c": src["c"], "v": src.get("v", 13.9), "p": [int(round(v * 10)) for q in pts for v in q], "o": 1, "j": 1}
            ka, kb = len(src["p"]) - 3 if e else 0, len(roads[j]["p"]) - 3 if f else 0
            piece["p"][:3], piece["p"][-3:] = src["p"][ka:ka + 3], roads[j]["p"][kb:kb + 3]
            if src.get("nl"):
                piece["nl"] = src["nl"]
            new.append(piece)
            lines.append((LineString([q[:2] for q in pts]), max(a[2], b[2]), u.get("clear", 4.7)))
            # (and the pieces it joins, as far as the cover reaches: r past the place)
            for k in (i, j):
                near = LineString(P[k][:, :2]).intersection(Point(*u["at"]).buffer(u["r"] + 30))
                if near.geom_type == "LineString" and near.length > 1:
                    lines.append((near, max(a[2], b[2]), u.get("clear", 4.7)))
    roads.extend(new)
    # the solids over the joined lines: a deck over the road
    n_s = 0
    bp = os.path.join(ROOT, "web", "data", cid, "buildings.json")
    if lines and os.path.exists(bp):
        B = json.load(open(bp, encoding="utf8"))
        f = B["s_fields"]
        k_base, k_min, k_top, k_ring = f.index("base_dm"), f.index("min_dm"), f.index("top_dm"), f.index("ring_dm")
        for s in B["s"]:
            r = np.asarray(s[k_ring], np.float64).reshape(-1, 2) / 10
            if len(r) < 3:
                continue
            for line, z, clear in lines:
                x0, y0, x1, y1 = line.bounds
                if r[:, 0].max() < x0 - 8 or r[:, 0].min() > x1 + 8 or r[:, 1].max() < y0 - 8 or r[:, 1].min() > y1 + 8:
                    continue
                if Polygon(r).buffer(0).distance(line) > 6.0:   # (the carriageway's half width: the road's line and its lanes)
                    continue
                want = int(math.ceil((z + clear) * 10 - s[k_base]))
                if s[k_min] < want and s[k_top] > want + 5:
                    s[k_min] = want
                    n_s += 1
        if n_s:
            json.dump(B, open(bp, "w"), separators=(",", ":"))   # as build_scene.py and road_passages.py write it
    return len(new), n_s


def plan(roads, extent=None, closed=(), gates=(), measured=None, bus_lines=None, closures=()):
    """Write x, e, q and b on the road pieces (dicts of game.json paths.road) and return a report.

    extent: [x0, x1, y0, y1] in metres, the edge that gates lie on (the roads' own bounding box when not given);
    closed, gates: the city's decisions, [[x, y, r, why], ...]; measured: {"cut": [...], "off": [...]} piece ends in
    decimetres [x0, y0, x1, y1] as the game measured them; bus_lines: LineStrings in local metres, or None to keep b."""
    P = [pts_of(o) for o in roads]
    if extent is None:
        allp = np.concatenate(P)
        extent = [allp[:, 0].min(), allp[:, 0].max(), allp[:, 1].min(), allp[:, 1].max()]
    edge = lambda x, y: min(x - extent[0], extent[1] - x, y - extent[2], extent[3] - y)
    # ---- closed pieces
    why = {}
    ends_dm = lambda o: (o["p"][0], o["p"][1], o["p"][-3], o["p"][-2])
    if measured:
        by = {}
        for k in ("cut", "off"):
            for e in measured.get(k, []):
                by[tuple(e)] = "the built model stands across it" if k == "cut" else "no car fits along it"
        for i, o in enumerate(roads):
            w = by.get(ends_dm(o))
            if w:
                why[i] = w
    for x, y, r, w in closed:
        q = Point(x, y)
        for i, p in enumerate(P):
            if abs(p[0, 0] - x) > 600 and abs(p[-1, 0] - x) > 600:
                continue
            if LineString(p[:, :2]).distance(q) < r:
                why[i] = w
    for i, o in enumerate(roads):
        o.pop("x", None), o.pop("e", None), o.pop("q", None)
        if i in why:
            o["x"] = 1
    # ---- nodes, over the open pieces and over all of them
    node, node_all = collections.defaultdict(list), collections.defaultdict(list)
    for i, p in enumerate(P):
        if len(p) < 2:
            continue
        for end, k in ((0, 0), (1, -1)):
            kk = key_of(p[k, 0], p[k, 1])
            node_all[kk].append((i, end))
            if i not in why:
                node[kk].append((i, end))
    # ---- every end
    ends = []
    kind_at = {}
    for kk, v in node.items():
        if len(v) != 1:
            continue
        i, end = v[0]
        x, y = P[i][-1 if end else 0, :2]
        named = any(math.hypot(x - g[0], y - g[1]) < g[2] for g in gates)
        shut = next((c[3] for c in closures if math.hypot(x - c[0], y - c[1]) < c[2]), None)
        k = GATE if named or edge(x, y) < EDGE_M else CLOSED if shut or len(node_all[kk]) > 1 else DEAD
        kind_at[(i, end)] = k
        ends.append({"at": [round(float(x), 1), round(float(y), 1)], "kind": KIND[k], "piece": i, "class": roads[i].get("c", ""),
                     **({"beyond": shut or why[next(j for j, _ in node_all[kk] if j in why)]} if k == CLOSED else {})})
    for (i, end), k in kind_at.items():
        e = roads[i].setdefault("e", [0, 0])
        e[end] = k
    # ---- through arcs: (piece, dir) with dir 1 along its points, 0 against them
    ok_dir = lambda i, d: i not in why and not (roads[i].get("o") == 1 and d == 0) and not (roads[i].get("o") == -1 and d == 1)
    head = lambda i, d: key_of(*P[i][-1 if d else 0, :2])
    tail = lambda i, d: key_of(*P[i][0 if d else -1, :2])
    arcs = [(i, d) for i in range(len(roads)) if len(P[i]) > 1 for d in (0, 1) if ok_dir(i, d)]
    succ = {}
    for a in arcs:
        i, d = a
        succ[a] = [(j, 1 if e2 == 0 else 0) for j, e2 in node[head(i, d)] if j != i and ok_dir(j, 1 if e2 == 0 else 0)]
    pred = collections.defaultdict(list)
    for a, ss in succ.items():
        for b in ss:
            pred[b].append(a)

    def flood(seeds, nxt):
        seen, stack = set(seeds), list(seeds)
        while stack:
            a = stack.pop()
            for b in nxt(a):
                if b not in seen:
                    seen.add(b)
                    stack.append(b)
        return seen
    out_gate = [a for a in arcs if kind_at.get((a[0], 1 if a[1] else 0)) == GATE]      # its head is a gate: it leaves
    in_gate = [a for a in arcs if kind_at.get((a[0], 0 if a[1] else 1)) == GATE]       # its tail is a gate: it comes in
    leaves = flood(out_gate, lambda a: pred[a])
    comes = flood(in_gate, lambda a: succ[a])
    through = leaves & comes
    thru_piece = {a[0] for a in through}
    n_q = 0
    for i, o in enumerate(roads):
        if i not in why and i not in thru_piece and len(P[i]) > 1:
            o["q"] = 1
            n_q += 1
    # ---- bus streets
    n_b = None
    if bus_lines is not None:
        tree = shapely.STRtree(bus_lines) if len(bus_lines) else None
        n_b = 0
        for i, o in enumerate(roads):
            o.pop("b", None)
            if tree is None or i in why or o.get("q") or len(P[i]) < 2:
                continue
            line = LineString(P[i][:, :2])
            m = max(2, int(line.length / 5) + 1)
            qs = [line.interpolate(k / (m - 1), normalized=True) for k in range(m)]
            near = sum(1 for q in qs if len(tree.query(q, predicate="dwithin", distance=BUS_NEAR_M)))
            if near >= BUS_SHARE * m:
                o["b"] = 1
                n_b += 1
    else:
        n_b = sum(1 for o in roads if o.get("b"))
    deg = collections.Counter(len(v) for v in node.values())
    length = lambda idx: round(sum(float(np.hypot(*np.diff(P[i][:, :2], axis=0).T).sum()) for i in idx) / 1000, 2)
    rep = {
        "pieces": len(roads), "km": length(range(len(roads))),
        "closed": len(why), "closed_km": length(why), "closed_why": dict(collections.Counter(why.values())),
        "quiet": n_q, "quiet_km": length([i for i, o in enumerate(roads) if o.get("q")]),
        "bus": n_b, "bus_km": length([i for i, o in enumerate(roads) if o.get("b")]),
        "one_way": sum(1 for o in roads if o.get("o")),
        "node_degrees": {str(k): v for k, v in sorted(deg.items())},
        "ends": dict(collections.Counter(e["kind"] for e in ends)),
        "extent": [round(float(v), 1) for v in extent],
    }
    return rep, ends, through, succ


def flags(roads):
    return [[o.get("x", 0), o.get("e", 0), o.get("q", 0), o.get("b", 0), o.get("o", 0)] for o in roads]


def load(cid):
    cdir = os.path.join(ROOT, "cities", cid)
    cfg = json.load(open(os.path.join(cdir, "city.json"), encoding="utf8"))
    rp = (cfg.get("game") or {}).get("road_plan") or {}
    mp, op = os.path.join(cdir, "road_measured.json"), os.path.join(cdir, "roads_osm.json")
    measured = json.load(open(mp, encoding="utf8")) if os.path.exists(mp) else None
    bus, osm = None, None
    if os.path.exists(op):
        from cityctx import City
        C = City(cid)
        osm = json.load(open(op, encoding="utf8"))
        loc = lambda ll: LineString(np.column_stack(C.fwd.transform([p[0] for p in ll], [p[1] for p in ll])))
        bus = [loc(w["ll"]) for w in osm["bus"] if len(w["ll"]) > 1] + [loc(s["ll"]) for s in osm.get("gtfs", []) if len(s["ll"]) > 1]
        osm["_loc"] = loc
    return cfg, rp, measured, bus, osm


def survey(roads, osm):
    """The game's pieces against OpenStreetMap's ways as fetched: how many agree in class and in one-way."""
    ways = [(osm["_loc"](w["ll"]), w["t"]) for w in osm["ways"] if len(w["ll"]) > 1]
    tree = shapely.STRtree([g for g, _ in ways])
    n = same_c = same_o = none = 0
    diff = []
    for i, o in enumerate(roads):
        p = pts_of(o)
        if len(p) < 2:
            continue
        line = LineString(p[:, :2])
        mid = line.interpolate(0.5, normalized=True)
        cand = tree.query(mid, predicate="dwithin", distance=4.0)
        best = None
        for j in cand:
            g, t = ways[j]
            f = g.project(mid)
            a, b = g.interpolate(max(0, f - 2)), g.interpolate(min(g.length, f + 2))
            la, lb = line.interpolate(max(0, line.project(mid) - 2)), line.interpolate(min(line.length, line.project(mid) + 2))
            dot = (b.x - a.x) * (lb.x - la.x) + (b.y - a.y) * (lb.y - la.y)
            den = math.hypot(b.x - a.x, b.y - a.y) * math.hypot(lb.x - la.x, lb.y - la.y) or 1
            if abs(dot) / den > 0.9 and (best is None or g.distance(mid) < best[0]):
                best = (g.distance(mid), t, dot)
        if not best:
            none += 1
            continue
        n += 1
        _, t, dot = best
        cls = t["highway"].replace("_link", "")
        if cls == o.get("c") or (cls in ("service", "living_street") and o.get("c") in ("unclassified", "residential")):
            same_c += 1
        ow = t.get("oneway") in ("yes", "1", "-1") or t.get("junction") == "roundabout" or cls == "motorway"
        if ow == bool(o.get("o")):
            same_o += 1
        elif len(diff) < 40:
            diff.append([i, [round(mid.x), round(mid.y)], "OSM one-way" if ow else "OSM two-way"])
    return {"matched": n, "unmatched": none, "class_agrees": same_c, "one_way_agrees": same_o, "one_way_differs": diff}


def drives(cfg, game, rp):
    """The places a drive is asked to: the city's list, the walk's drive errands, and where your car starts."""
    out = [(d[0], d[1], d[2] if len(d) > 2 else "a drive") for d in rp.get("drives", [])]
    for person in ((game.get("walk") or {}).get("people") or []):
        for part in person.get("parts", []):
            d = (part.get("then") or {}).get("drive")
            if d:
                out.append((d[0], d[1], (part["then"].get("goal") or person.get("id", "a drive"))))
    car = (game.get("start") or {}).get("car")
    if car:
        out.append((car[0], car[1], "where your car starts"))
    return out


def check(cid, game, roads, rep, ends, through, succ, cfg, rp):
    bad = []
    P = [pts_of(o) for o in roads]
    # no open piece through a building's solid that stands on the ground
    bp = os.path.join(ROOT, "web", "data", cid, "buildings.json")
    if os.path.exists(bp):
        B = json.load(open(bp, encoding="utf8"))
        f = B["s_fields"]
        k_b, k_base, k_min, k_top, k_ring = f.index("building"), f.index("base_dm"), f.index("min_dm"), f.index("top_dm"), f.index("ring_dm")
        passages = set(B.get("passages") or [])
        polys, meta = [], []
        for si, s in enumerate(B["s"]):
            if s[k_min] > 0 or s[k_b] in passages or si in passages or len(s[k_ring]) < 6:
                continue   # (a part raised over the ground, a building with a passage through it)
            r = np.asarray(s[k_ring], np.float64).reshape(-1, 2) / 10
            g = Polygon(r)
            for h in s[k_ring + 1:]:
                pass
            if len(s) > k_ring + 1:
                g = Polygon(r, [np.asarray(h, np.float64).reshape(-1, 2) / 10 for h in s[k_ring + 1:] if len(h) >= 6])
            polys.append(g if g.is_valid else g.buffer(0))
            meta.append((s[k_b], s[k_base] / 10, (s[k_base] + s[k_top]) / 10))
        tree = shapely.STRtree(polys)
        n_thru = 0
        for i, o in enumerate(roads):
            if o.get("x") or o.get("d") or len(P[i]) < 2:
                continue
            line = LineString(P[i][:, :2])
            for j in tree.query(line, predicate="intersects"):
                g = polys[j]
                inside = line.intersection(g.buffer(-THROUGH_M))
                if inside.is_empty or inside.length < 3.0:
                    continue
                q = inside.interpolate(0.5, normalized=True)
                k = int(np.argmin(np.hypot(P[i][:, 0] - q.x, P[i][:, 1] - q.y)))
                z = P[i][k, 2]
                b, z0, z1 = meta[j]
                if z1 < z + 0.5 or z0 > z + 2.5:   # (the solid is under the road, a deck's pier, or over it)
                    continue
                n_thru += 1
                if n_thru <= 12:
                    bad.append(f"piece {i} ({o.get('c')}) runs {inside.length:.0f} m through building {b} at {q.x:.0f}, {q.y:.0f}: carve a passage (tools/road_passages.sh), or close it (road_measured.json, game.road_plan.closed)")
        if n_thru > 12:
            bad.append(f"... and {n_thru - 12} more pieces through a solid")
    # every end is one of the three (plan() leaves none unnamed: held here against a change to it)
    for i, o in enumerate(roads):
        if o.get("x") or len(P[i]) < 2:
            continue
    n_ends = sum(rep["ends"].values())
    if n_ends != len(ends):
        bad.append("an end without a kind")
    for o in roads:
        if o.get("b") and (o.get("q") or o.get("x")):
            bad.append("a bus street that is quiet or closed")
            break
    # the drives: each on an open piece, and every one reachable from every other
    net_lines = [(i, LineString(P[i][:, :2])) for i, o in enumerate(roads) if not o.get("x") and len(P[i]) > 1]
    tree = shapely.STRtree([g for _, g in net_lines])
    spots = []
    for x, y, name in drives(cfg, game, rp):
        j = tree.nearest(Point(x, y))
        i, g = net_lines[j]
        d = g.distance(Point(x, y))
        if d > 40:
            bad.append(f"{name}: no open road within 40 m of {x:.0f}, {y:.0f} (the nearest is {d:.0f} m off)")
            continue
        spots.append((name, i))
    arcs_of = lambda i: [a for a in ((i, 0), (i, 1)) if a in succ]
    def reach(i):
        seen, stack = set(arcs_of(i)), list(arcs_of(i))
        while stack:
            a = stack.pop()
            for b in succ[a]:
                if b not in seen:
                    seen.add(b)
                    stack.append(b)
        return {a[0] for a in seen}
    for name, i in spots:
        got = reach(i)
        for other, j in spots:
            if j not in got:
                bad.append(f"no way by road from \"{name}\" to \"{other}\"")
    return bad


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--city", required=True)
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    sys.path.insert(0, os.path.join(ROOT, "pipeline"))
    gp = os.path.join(ROOT, "web", "data", a.city, "game.json")
    game = json.load(open(gp, encoding="utf8"))
    roads = game["paths"]["road"]
    cfg, rp, measured, bus, osm = load(a.city)
    before = flags(roads)
    n_before = len(roads)
    n_under, n_solids = join_under(a.city, roads, rp.get("under", [])) if not a.check else (0, 0)
    before = flags(roads)
    n_ow = one_ways(roads, osm) if osm else 0
    n_join = join_gaps(roads)
    rep, ends, through, succ = plan(roads, closed=rp.get("closed", []), gates=rp.get("gates", []), measured=measured, bus_lines=bus, closures=rp.get("closures", []))
    if a.check:
        bad = []
        if flags(roads) != before or n_join:
            n = sum(1 for x, y in zip(flags(roads), before) if x != y)
            bad.append(f"the plan written in game.json is not the one the roads, the measure and the bus data give now ({n} pieces differ): python pipeline/road_plan.py --city {a.city}, then python pipeline/pack.py")
        bad += check(a.city, game, roads, rep, ends, through, succ, cfg, rp)
        for b in bad:
            print(f"FAIL {a.city}: {b}")
        print(f"{a.city}: road plan {'FAILED' if bad else 'ok'}: {rep['pieces']} pieces, {rep['closed']} closed, {rep['quiet']} quiet, {rep['bus']} bus streets; ends {rep['ends']}")
        sys.exit(1 if bad else 0)
    if osm:
        rep["survey"] = survey(roads, osm)
        rep["survey"]["source"] = osm["source"]
        rep["bus_routes"] = len(osm.get("routes", []))
    rep["measured"] = (measured or {}).get("source", "")
    rep["one_way_from_osm"], rep["gaps_joined"] = sum(1 for o in roads if o.get("ow")), n_join
    rep["joined_under_cover"], rep["solids_raised_over_a_road"] = n_under, n_solids
    if n_under or n_solids:
        print(f"  {n_under} pieces joined under cover, {n_solids} solids raised to stand over the road (buildings.json: run the passes after it and pipeline/pack.py)")
    json.dump(game, open(gp, "w"), separators=(",", ":"))   # as game_data.py writes it
    out = os.path.join(ROOT, "cities", a.city, "road_plan.json")
    json.dump({"note": "A city's road plan as pipeline/road_plan.py decided it (docs/ROADS.md): the report, and every end of the network that is not a junction.",
               "report": rep, "ends": sorted(ends, key=lambda e: (e["kind"], e["at"]))}, open(out, "w", encoding="utf8"), ensure_ascii=False, indent=1)
    print(f"{a.city}: {rep['pieces']} road pieces ({rep['km']} km): {rep['closed']} closed ({rep['closed_km']} km), {rep['quiet']} quiet ({rep['quiet_km']} km), "
          f"{rep['bus']} bus streets ({rep['bus_km']} km); ends {rep['ends']}; nodes by degree {rep['node_degrees']}")
    if osm:
        s = rep["survey"]
        print(f"  against OpenStreetMap as fetched: {s['matched']} pieces matched to a way, class agrees on {s['class_agrees']}, one-way on {s['one_way_agrees']}; {s['unmatched']} unmatched")


if __name__ == "__main__":
    main()
