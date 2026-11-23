"""Each bus route as the way it runs, on the game's road pieces (docs/ROADS.md, issue 196).

The road plan knew the streets a bus takes (`b`: any route's), not which route goes where: a bus kept to bus streets
and at each junction took any of them, so one came up Dogenzaka and turned into Meiji-dori as no route does. A route
is an ordered thing. OpenStreetMap maps each direction of each route as a relation whose members are its ways in the
order it runs them (the wiki's public transport schema, version 2), with its number, its operator and where it is
bound.

  --fetch   reads the relations over the city's `bus_lines.area` (local metres; the part of the map a player can
            reach, with the traffic's ring round it) from the OSM API's map call, joins each relation's ways end to
            end, and writes cities/<id>/bus_lines.json: [{ref, to, from, by, name, ll: [[lon, lat], ...]}, ...], one
            entry per unbroken run inside the area.

Without it, the lines of that file are matched onto game.json's road pieces: from where a line first meets a piece
it is walked through the road graph, at each node taking the piece that lies along the line ahead (within NEAR_M of
it, the way the piece may be driven), and written as

  game.bus_lines   [{ref, to, by}, ...]: the lines that run 150 m or more on the pieces
  on a piece: bl   [line, step, way, ...]: for each line that runs it, its place in the line's order and the way
                   the line runs it (1 as the piece's points go, -1 against them)

A bus of the traffic is made on a piece with a line that runs its way, is that line's, and at a junction takes the
piece with the line's next step (web/game/junctions.js `choose`); where its line ends (a terminal, the map's edge,
the area's) it takes up a line that starts there, or keeps to the bus streets as before. The steps are places in an
order, not indices: a piece dropped later (the game's cut at a wall, a phone's district) leaves the order whole.

    python pipeline/bus_lines.py --city shibuya --fetch
    python pipeline/bus_lines.py --city shibuya            # then pipeline/road_plan.py and pipeline/pack.py
    python pipeline/bus_lines.py --city shibuya --check

OpenStreetMap contributors, ODbL.
"""
import argparse
import datetime
import json
import math
import os
import time

import numpy as np
import shapely
from shapely.geometry import LineString, Point
from shapely.ops import substring

from cityctx import City

NODE = 2.0        # pieces join where their ends share a 2 m cell (web/game/actors.js network; road_plan.py)
NEAR_M = 7.0      # a piece lies along a line where its points are this near it on average
START_M = 5.0     # a line is taken up on a piece this near it
MIN_RUN_M = 150.0  # a line shorter than this on the pieces is not kept
UA = "blue-hour (https://github.com/Mira190/blue-hour)"


def pts_of(o):
    return np.asarray(o["p"], np.float64).reshape(-1, 3) / 10


def key_of(x, y):
    return (round(x / NODE), round(y / NODE))


# ---------------------------------------------------------------------------------------------- fetch
def fetch(C):
    import road_osm
    x0, x1, y0, y1 = C.cfg["bus_lines"]["area"]
    lon, lat = C.inv.transform([x0, x1, x0, x1], [y0, y0, y1, y1])
    box = (min(lon), min(lat), max(lon), max(lat))
    nodes, ways, rels = {}, {}, {}
    for e in road_osm.get(box):
        (nodes if e["type"] == "node" else ways if e["type"] == "way" else rels)[e["id"]] = e
    out = []
    for r in rels.values():
        t = r.get("tags") or {}
        if t.get("type") != "route" or t.get("route") != "bus":
            continue
        runs, run, single = [], [], True   # runs of node ids, each way turned to follow the one before
        for m in r["members"]:
            w = ways.get(m["ref"]) if m["type"] == "way" else None
            if m["type"] != "way" or m.get("role", "").startswith(("platform", "stop")):
                continue
            if w is None or not (w.get("tags") or {}).get("highway"):
                if run:
                    runs.append(run)
                run = []
                continue
            n = list(w["nodes"])
            if not run:
                run, single = n, True
                continue
            if single and run[0] in (n[0], n[-1]) and run[-1] not in (n[0], n[-1]):
                run = run[::-1]      # (the first way was the other way round)
            if run[-1] == n[0]:
                run += n[1:]
            elif run[-1] == n[-1]:
                run += n[::-1][1:]
            else:
                runs.append(run)
                run = n
                single = True
                continue
            single = False
        if run:
            runs.append(run)
        for run in runs:
            ll = [[round(nodes[i]["lon"], 6), round(nodes[i]["lat"], 6)] for i in run if i in nodes]
            if len(ll) > 1:
                out.append({"ref": t.get("ref", ""), "to": t.get("to", ""), "from": t.get("from", ""),
                            "by": t.get("operator") or t.get("network") or "", "name": t.get("name", ""), "id": r["id"], "ll": ll})
    out.sort(key=lambda l: (l["by"], l["ref"], l["id"], l["ll"][0]))
    path = C.file("bus_lines.json")
    src = (f"OpenStreetMap contributors (ODbL), the OSM API's map call over the area, fetched {datetime.date.today().isoformat()}: "
           "each route=bus relation's ways in the order it runs them, joined end to end; lon/lat")
    json.dump({"source": src, "area": [x0, x1, y0, y1], "lines": out}, open(path, "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
    refs = sorted({l["ref"] for l in out if l["ref"]})
    print(f"{C.id}: {len(out)} runs of {len({l['id'] for l in out})} bus routes ({len(refs)} numbers) -> {path} ({os.path.getsize(path) / 1e3:.0f} kB)")
    time.sleep(1)


# ---------------------------------------------------------------------------------------------- match
def graph(roads):
    """pieces as lines, and for each node's cell the (piece, end) that meet there; a closed piece is not in it."""
    lines, at = [], {}
    for i, o in enumerate(roads):
        p = pts_of(o)
        if len(p) < 2 or o.get("x"):
            lines.append(None)
            continue
        lines.append(LineString(p[:, :2]))
        for e, q in ((0, p[0]), (1, p[-1])):
            at.setdefault(key_of(q[0], q[1]), []).append((i, e))
    return lines, at


def along(line, track, s0, s1):
    """How a piece lies along the part [s0, s1] of a line: (mean distance of its points, where its last point falls)."""
    part = substring(track, max(0.0, s0), min(track.length, s1))
    if part.is_empty or part.geom_type != "LineString":
        return 1e9, s0
    n = max(2, int(line.length // 4) + 1)
    pts = [line.interpolate(k / (n - 1), normalized=True) for k in range(n)]
    d = float(np.mean([part.distance(q) for q in pts]))
    return d, max(0.0, s0) + part.project(pts[-1])


def walk(track, roads, lines, at, tree):
    """The pieces a line runs, in order: [(piece, way), ...] in unbroken stretches [[...], ...]."""
    out, run, s, used = [], [], 0.0, set()
    cur = None   # (piece, way) the walk is on, its far end reached at s
    guard = 0
    while s < track.length - 1 and guard < 4000:
        guard += 1
        if cur is None:
            # take the line up: the first piece from s on that it runs along
            best = None
            for ds in np.arange(s, track.length, 6.0):
                q = track.interpolate(ds)
                q2 = track.interpolate(min(track.length, ds + 3))
                hx, hy = q2.x - q.x, q2.y - q.y
                for i in tree.query(q.buffer(START_M)):
                    ln = lines[i]
                    if ln is None or ln.distance(q) > START_M:
                        continue
                    f = ln.project(q)
                    a, b = ln.interpolate(max(0, f - 1.5)), ln.interpolate(min(ln.length, f + 1.5))
                    dot = (b.x - a.x) * hx + (b.y - a.y) * hy
                    den = (math.hypot(b.x - a.x, b.y - a.y) * math.hypot(hx, hy)) or 1
                    if abs(dot) / den < 0.8:
                        continue
                    way = 1 if dot > 0 else -1
                    ow = roads[i].get("o", 0)
                    if ow and ow != way:
                        continue
                    seg = ln if way > 0 else ln.reverse()
                    rest = substring(seg, seg.project(q), seg.length)
                    if rest.is_empty or rest.geom_type != "LineString" or rest.length < 3:
                        continue
                    d, s_end = along(rest, track, ds - 5, ds + rest.length + 40)
                    if d < NEAR_M and (best is None or d < best[0]):
                        best = (d, i, way, s_end)
                if best:
                    break
            if not best:
                break
            if run:
                out.append(run)
            run = []
            _, i, way, s = best
            cur = (i, way)
            run.append(cur)
            used.add(cur)
            continue
        i, way = cur
        p = pts_of(roads[i])
        far = p[-1] if way > 0 else p[0]
        best = None
        for j, e in at.get(key_of(far[0], far[1]), []):
            if j == i or lines[j] is None:
                continue
            w2 = 1 if e == 0 else -1
            ow = roads[j].get("o", 0)
            if (ow and ow != w2) or (j, w2) in used:
                continue
            seg = lines[j] if w2 > 0 else lines[j].reverse()
            d, s_end = along(seg, track, s - 8, s + seg.length + 40)
            if d < NEAR_M and (best is None or d < best[0]):
                best = (d, j, w2, s_end)
        if best is None:
            cur = None        # (the line leaves the pieces here: a closed street, the map's edge, a gap in the data)
            s += 6.0
            continue
        _, j, w2, s2 = best
        s = max(s + 0.5, s2)
        cur = (j, w2)
        run.append(cur)
        used.add(cur)
    if run:
        out.append(run)
    return out


def match(C, game):
    roads = game["paths"]["road"]
    src = json.load(open(C.file("bus_lines.json"), encoding="utf8"))
    lines, at = graph(roads)
    tree = shapely.STRtree([l if l is not None else Point(1e9, 1e9) for l in lines])
    per = [[] for _ in roads]
    table, rep = [], []
    seen = {}
    for L in src["lines"]:
        ll = np.asarray(L["ll"], float)
        track = LineString(np.column_stack(C.fwd.transform(ll[:, 0], ll[:, 1])))
        if track.length < MIN_RUN_M:
            continue
        runs = [r for r in walk(track, roads, lines, at, tree)]
        length = sum(lines[i].length for r in runs for i, _ in r)
        if length < MIN_RUN_M:
            continue
        sig = tuple(x for r in runs for x in r)
        if sig in seen:      # (two relations that run the same pieces the same way: one line of the game)
            continue
        k = len(table)
        seen[sig] = k
        table.append({"ref": L["ref"], "to": L["to"], "by": L["by"]})
        step = 0
        for r in runs:
            for i, way in r:
                per[i] += [k, step, way]
                step += 1
            step += 2    # (a break in the line: no piece after it is the next step of the one before)
        rep.append({"line": k, "ref": L["ref"], "to": L["to"], "by": L["by"], "track_m": round(track.length), "on_pieces_m": round(length),
                    "stretches": len(runs)})
    return table, per, rep


def apply(game, table, per):
    n = 0
    for o, b in zip(game["paths"]["road"], per):
        if b:
            n += o.get("bl") != b
            o["bl"] = b
        elif "bl" in o:
            del o["bl"]
            n += 1
    n += game.get("bus_lines") != table
    game["bus_lines"] = table
    return n


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--city", default="shibuya")
    ap.add_argument("--fetch", action="store_true")
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    C = City(a.city)
    if a.fetch:
        fetch(C)
        return
    if not os.path.exists(C.file("bus_lines.json")):
        print(f"{a.city}: no bus_lines.json (pipeline/bus_lines.py --fetch); buses keep to the bus streets")
        return
    gp = os.path.join(C.out, "game.json")
    game = json.load(open(gp, encoding="utf8"))
    table, per, rep = match(C, game)
    roads = game["paths"]["road"]
    if a.check:
        bad = []
        if game.get("bus_lines") != table:
            bad.append("game.json's bus_lines are not the ones the lines give now")
        for i, (o, b) in enumerate(zip(roads, per)):
            if (o.get("bl") or []) != b:
                bad.append(f"piece {i}: bl {o.get('bl')} is not {b}")
            if b and o.get("x"):
                bad.append(f"piece {i}: a bus line on a closed piece")
            for k in range(0, len(b), 3):
                if o.get("o") and o["o"] != b[k + 2]:
                    bad.append(f"piece {i}: line {b[k]} runs against its one-way")
        for b in bad[:20]:
            print("  " + b)
        if bad:
            raise SystemExit(f"FAIL bus lines: {len(bad)} faults (python pipeline/bus_lines.py --city {a.city}, then pipeline/pack.py)")
        print(f"bus lines: {len(table)} lines on {sum(1 for b in per if b)} pieces, each along its one-ways")
        return
    n = apply(game, table, per)
    json.dump(game, open(gp, "w"), separators=(",", ":"))   # as game_data.py writes it
    json.dump({"note": "The bus lines as pipeline/bus_lines.py matched them onto the road pieces (docs/ROADS.md).", "lines": rep},
              open(C.file("bus_lines_report.json"), "w", encoding="utf8"), indent=1, ensure_ascii=False)
    on = sum(1 for b in per if b)
    print(f"bus lines: {len(table)} lines on {on} pieces ({sum(LineString(pts_of(o)[:, :2]).length for o, b in zip(roads, per) if b) / 1000:.1f} km); {n} changed")
    for r in rep:
        print(f"  {r['line']:>3} {r['ref']:<8} {r['by'][:10]:<10} -> {r['to'][:18]:<18} {r['on_pieces_m']:>5} of {r['track_m']:>5} m, {r['stretches']} stretch(es)")


if __name__ == "__main__":
    main()
