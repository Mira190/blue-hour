"""Where two levels meet there is a made thing: retaining walls over the breaks of the graded ground (issues 158, 163).

street_ground.py grades the streets and levels each plot to the street it fronts; where two streets' levels meet with
no room for a slope a street could have, it cuts the ground between them, and where the survey itself carries a
terrace's edge or an embankment's foot between buildings it is smeared over a cell. Either way the 5 m grid can only
draw the break as a ramp one cell wide: 3 m of height in 5 m of paving, the "paved hill" of the owner's stills. A
city has a wall there. So every edge of the grid where the ground breaks by more than street_ground.CUT_M, on paved
ground (levels.paved(): by a building, not under one, not water, open land, a mapped stair or a hero level), gets a
retaining block over the cell the break is drawn in: a solid of buildings.json in the `wall` style (walls.py: no
windows or storeys, a plinth and a coping), from under the low ground to a level top just over the high ground, in
bands of TOP_STEP_M so that a wall along a falling street steps down level by level (the rule of pipeline/levels.py),
never raked. The page draws, lights, hides and collides with it as with any solid; nothing is added at run time.

The blocks are the last solids of the file (their footprint source is "R"), made again whole on every run: a second
run writes the same. street_ground.py does not take them for buildings (they stand on the break, they do not make it).

    python pipeline/terraces.py --city shibuya          # after street_ground.py, before stations.py ... pack.py
    python pipeline/terraces.py --city shibuya --check  # are the blocks those the ground as it is asks for?
"""
import argparse
import json
import math
import os

import numpy as np
from shapely.geometry import Polygon, box
from shapely.ops import unary_union
import shapely

import levels
import street_ground as sg

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOP_STEP_M = 0.5     # a wall's top steps in levels this far apart
OVER_M = 0.15        # ... and stands at least this far over the high ground (a kerb's upstand)
MIN_AREA_M2 = 10.0   # a sliver left between two buildings is not a wall
WALL, COPING = "#a9a59c", "#8f8c85"   # cast concrete, and its capping a tone darker
SRC = "R"


def blocks(G, game, B, scene):
    """The retaining blocks the ground asks for: [(ring [[x, y], ...], base m, top m), ...], in a fixed order."""
    T, cell = G.T, G.cell
    pv = levels.paved(G, game, B, scene)          # cells (ny - 1, nx - 1)
    ny, nx = T.shape
    cellok = lambda r, c: 0 <= r < ny - 1 and 0 <= c < nx - 1 and pv[r, c]
    groups = {}
    de, ds = T[:, 1:] - T[:, :-1], T[1:, :] - T[:-1, :]
    for (rr, cc), east in ((np.nonzero(np.abs(de) > sg.CUT_M), True), (np.nonzero(np.abs(ds) > sg.CUT_M), False)):
        for r, c in zip(rr.tolist(), cc.tolist()):
            if east:   # between node (r, c) and (r, c + 1): the cells north and south of the edge
                cells = [(r - 1, c), (r, c)]
                x0, x1 = G.x0 + c * cell, G.x0 + (c + 1) * cell
                y0, y1 = G.y1 - (r + 1) * cell, G.y1 - (r - 1) * cell
                hi, lo = max(T[r, c], T[r, c + 1]), min(T[r, c], T[r, c + 1])
            else:      # between node (r, c) and (r + 1, c): the cells west and east of it
                cells = [(r, c - 1), (r, c)]
                x0, x1 = G.x0 + (c - 1) * cell, G.x0 + (c + 1) * cell
                y0, y1 = G.y1 - (r + 1) * cell, G.y1 - r * cell
                hi, lo = max(T[r, c], T[r + 1, c]), min(T[r, c], T[r + 1, c])
            if not any(cellok(*q) for q in cells):
                continue
            band = math.ceil((hi + OVER_M) / TOP_STEP_M - 1e-9)
            g = groups.setdefault(band, [[], np.inf])
            g[0].append(box(x0, y0, x1, y1))
    if not groups:
        return []
    kr = B["s_fields"].index("ring_dm")
    kb = B["s_fields"].index("building")
    foot = []
    for sd in B["s"]:
        if B["b"][sd[kb]][5] == SRC:
            continue
        r = np.asarray(sd[kr], np.float64).reshape(-1, 2) / 10
        if len(r) >= 3:
            foot.append(Polygon(r))
    # (and the ways: a block never stands in a carriageway or on a footway that lies on the ground. Where a street
    # runs hard by the break there is no room for a wall of its own, and the building beside it takes the level
    # in its plinth, as it does in the place)
    from shapely.geometry import LineString
    for kind in ("road", "foot"):
        for e in game["paths"][kind]:
            hw = sg.half_width(e, kind)
            p = np.asarray(e["p"], np.float64).reshape(-1, 3) / 10
            if hw is None or len(p) < 2:
                continue
            on = np.abs(p[:, 2] - G.at(p[:, 0], p[:, 1])) < 0.3
            i = 0
            while i < len(p) - 1:
                j = i
                while j < len(p) - 1 and on[j] and on[j + 1]:
                    j += 1
                if j > i:
                    foot.append(LineString(p[i:j + 1, :2]).buffer(hw + (0.8 if kind == "road" else 0.3), cap_style=2))
                i = max(j, i + 1)
    tree = shapely.STRtree(foot)
    out = []
    for band in sorted(groups):
        # (the grid's squares along a break that runs askew are a staircase in plan: closed over and simplified, the
        # wall runs straight from corner to corner as a wall is built)
        U = unary_union(groups[band][0]).buffer(3.6, join_style=2).buffer(-3.6, join_style=2).simplify(2.4)
        if not U.is_valid:
            U = U.buffer(0)
        for P in (U.geoms if U.geom_type == "MultiPolygon" else [U]):
            near = [foot[i] for i in tree.query(P)]
            if near:
                P = P.difference(unary_union([f.buffer(0.1) if f.is_valid else f.buffer(0).buffer(0.1) for f in near]))
            for Q in (P.geoms if P.geom_type in ("MultiPolygon", "GeometryCollection") else [P]):
                if Q.geom_type != "Polygon" or Q.is_empty:
                    continue
                Q = Q.buffer(-0.6).buffer(0.6, join_style=2)   # (no fin a wall thinner than 1.2 m would be)
                for R in (Q.geoms if Q.geom_type == "MultiPolygon" else [Q]):
                    if R.is_empty or R.area < MIN_AREA_M2:
                        continue
                    R = Polygon(R.exterior).simplify(0.6)
                    ring = np.round(np.asarray(R.exterior.coords[:-1]) * 10) / 10
                    if len(ring) < 3 or Polygon(ring).area < MIN_AREA_M2:
                        continue
                    if Polygon(ring).exterior.is_ccw is False:
                        ring = ring[::-1]
                    nxt = np.roll(ring, -1, 0)
                    m = np.maximum(1, np.ceil(np.hypot(*(nxt - ring).T))).astype(int)
                    S = np.vstack([a + (b - a) * np.linspace(0, 1, k, endpoint=False)[:, None] for a, b, k in zip(ring, nxt, m)])
                    z = G.at(S[:, 0], S[:, 1])
                    top = band * TOP_STEP_M
                    if top - float(z.min()) < 0.6:
                        continue   # (the break is elsewhere: this piece stands on level ground)
                    out.append((ring.tolist(), float(z.min()), top))
    out.sort(key=lambda b: (b[0][0][0], b[0][0][1], b[2]))
    return out


def strip(B):
    """buildings.json without the blocks of an earlier run (the last buildings and solids of the file)."""
    kb = B["s_fields"].index("building")
    while B["b"] and B["b"][-1][5] == SRC:
        bi = len(B["b"]) - 1
        assert B["s"][-1][kb] == bi, "a retaining block is not the last solid: the file was changed after terraces.py"
        B["s"].pop()
        B["b"].pop()
    return B


def write(cid, check=False):
    out = os.path.join(ROOT, "web", "data", cid)
    bp = os.path.join(out, "buildings.json")
    B = json.load(open(bp, encoding="utf8"))
    game = json.load(open(os.path.join(out, "game.json"), encoding="utf8"))
    scene = json.load(open(os.path.join(out, "scene.json"), encoding="utf8"))
    kb = B["s_fields"].index("building")
    had = [(s[4], s[1], s[3]) for s in B["s"] if B["b"][s[kb]][5] == SRC]
    strip(B)
    G = levels.Levels(cid, game)
    styles = B.setdefault("styles", [])
    if "wall" not in styles:
        styles.append("wall")
    wall_i = styles.index("wall")
    flat = B["roof_shapes"].index("flat") if "flat" in B.get("roof_shapes", []) else 0
    conc = B["roof_materials"].index("concrete") if "concrete" in B.get("roof_materials", []) else 0
    rule = B["roof_sources"].index("rule") if "rule" in B.get("roof_sources", []) else 0
    new = []
    for ring, low, top in blocks(G, game, B, scene):
        base = round((low - 0.3) * 10)
        h = round(top * 10) - base
        new.append(([c for p in ring for c in (round(p[0] * 10), round(p[1] * 10))], base, h))
    if check:
        same = [(r, b, h) for r, b, h in new] == [(r, b, t) for r, b, t in had]
        return len(new), same
    for ring, base, h in new:
        seed = (ring[0] * 7919 + ring[1] * 104729) % 65536
        B["b"].append(["", "", round(h / 10, 1), 0, "rule", SRC, "", WALL, COPING, round(h / 10, 1), wall_i, round(h / 10, 2), 0, conc, seed, flat, rule])
        # (a solid's heights are over its base: base_dm absolute, min_dm and top_dm from it)
        B["s"].append([len(B["b"]) - 1, base, 0, h, ring])
    json.dump(B, open(bp, "w"), separators=(",", ":"))
    return len(new), True


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--city", required=True)
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    n, same = write(a.city, a.check)
    if a.check:
        print(f"{'ok' if same else 'FAIL'} {a.city}: {n} retaining blocks" + ("" if same else " are not those the ground as it is asks for: python pipeline/terraces.py --city " + a.city + ", then the passes after it and pipeline/pack.py"))
        raise SystemExit(not same)
    print(f"{a.city}: {n} retaining blocks")


if __name__ == "__main__":
    main()
