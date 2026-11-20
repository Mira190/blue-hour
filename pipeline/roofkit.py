"""The rooftop kit: what a Tokyo roof carries, placed from the roof polygons (issue 73).

    python pipeline/roofkit.py --city shibuya        # then: python pipeline/pack.py

From the air a Tokyo roofscape is mostly its equipment: the stair hut (touya) that every flat roof over a few storeys
has, rows of air-conditioning condensers along a parapet, and on the towers the fire service's marks, an "R" in a
square on a building over 31 m (the emergency rescue space, kinkyu kyujo-yo space, about 10 m square) and an "H" in a
circle over 100 m (the emergency landing pad, kinkyu richakurikujo, about 20 m square). build_scene.py puts plant
rooms, plant boxes and water tanks on the larger roofs; this pass adds the rest, on every flat roof the city's walls
draw (not a pitched roof, not a solid a landmark draws instead, and not a roof named in city.json "roofkit" "skip",
whose deck a landmark furnishes: SHIBUYA SKY's).

Rows go in buildings.json "p" beside the plant (same fields, metres in dm, the angle in centidegrees), the deck's
height from the walls at run time (web/buildings.js):
    [solid, 6, x, y, w, d, h, angle]           a stair hut, its door on its +y face (the roof's side)
    [solid, 7, x, y, length, d, h, angle]      a row of condensers, one every UNIT m along its length
    [solid, 8, x, y, size, size, type, angle]  the fire service's mark, type 0 "R", 1 "H"
Each change of tone they bring has a cause: the hut is the building's own render, the condensers off-white
enamel, the marks the fire service's paint. Placement is deterministic (the building's seed) and the pass removes
its own rows first, so running it again changes nothing.
"""
import argparse
import json
import math
import os

import numpy as np
import shapely.affinity
from shapely.geometry import Polygon, box
from shapely.ops import unary_union

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KINDS = (6, 7, 8)
UNIT = 0.95       # m, a condenser's pitch along its row
R_SIZE, H_SIZE = 10.0, 18.0
R_FROM, H_FROM = 31.0, 100.0   # m over the ground (the Fire Service's thresholds, Tokyo Fire Department guidance)
HUT_FROM = 7.0                 # a roof this high (three storeys) has a stair to it


def poly(s):
    ring = lambda r: [(r[i] / 10, r[i + 1] / 10) for i in range(0, len(r), 2)]
    return Polygon(ring(s[4]), [ring(h) for h in s[5:]]).buffer(0)


def largest(g):
    if g.is_empty:
        return None
    return max(getattr(g, "geoms", [g]), key=lambda p: p.area)


def rect(cx, cy, w, d, ang):
    return shapely.affinity.rotate(box(cx - w / 2, cy - d / 2, cx + w / 2, cy + d / 2), ang, origin=(cx, cy))


def long_axis(p):
    """The direction of the roof's longest edge, in degrees (rows and huts square to the building)."""
    c = np.asarray(p.exterior.coords)
    e = np.diff(c, axis=0)
    i = int(np.argmax(np.hypot(e[:, 0], e[:, 1])))
    return math.degrees(math.atan2(e[i, 1], e[i, 0]))


def unit(seed, k):
    return ((seed * 2654435761 + k * 40503) & 0xFFFFFFFF) / 2 ** 32


class Roof:
    """A flat roof's frame: its inner outline (inside the parapet), its long axis and the extents along and across it."""

    def __init__(self, p):
        self.inner = largest(p.buffer(-0.7, join_style=2))
        if self.inner is None:
            return
        self.ang = long_axis(p)
        a = math.radians(self.ang)
        self.ax, self.perp = np.array([math.cos(a), math.sin(a)]), np.array([-math.sin(a), math.cos(a)])
        C = np.asarray(self.inner.exterior.coords)
        self.L, self.W = C @ self.ax, C @ self.perp

    def at(self, u, v):  # a point from coordinates along and across the roof
        o = self.ax * u + self.perp * v
        return o[0], o[1]


def mark(k, s, roof, taken):
    """The fire service's mark on a roof, as near its middle as the plant rooms and tanks leave a square open: a row, or
    None. A pad from 100 m (18 m square, else 15), a rescue space from 31 m (10 m)."""
    top = s[3] / 10
    if top < R_FROM or roof.inner is None:
        return None
    typ = 1 if top >= H_FROM else 0
    L, W = roof.L, roof.W
    for size in ((H_SIZE, 15.0) if typ else (R_SIZE,)):
        best = None
        for du in np.linspace(-0.45, 0.45, 19):
            for dv in np.linspace(-0.45, 0.45, 11):
                x, y = roof.at((L.min() + L.max()) / 2 + du * np.ptp(L), (W.min() + W.max()) / 2 + dv * np.ptp(W))
                q = rect(x, y, size + 1.0, size + 1.0, roof.ang)
                if roof.inner.contains(q) and not q.intersects(taken):
                    dd = du * du + dv * dv
                    if best is None or dd < best[0]:
                        best = (dd, x, y, q)
        if best:
            _, x, y, q = best
            return [k, 8, round(x * 10), round(y * 10), round(size * 10), round(size * 10), typ, round(roof.ang * 100)], q
    return None


def place(k, s, roof, seed, taken, out, hut_ok=True):
    """A stair hut against the roof's long edge and a row of condensers across from it."""
    top = s[3] / 10
    inner = roof.inner
    if inner is None or inner.area < 12 or top < HUT_FROM:
        return
    ang, L, W, at = roof.ang, roof.L, roof.W, roof.at
    free = lambda q: inner.contains(q) and not q.intersects(taken)
    # the stair hut, against the roof's edge: a corner of the longer side, its door facing in
    w, d, h = 2.6 + 1.0 * unit(seed, 1), 2.4 + 0.8 * unit(seed, 2), 2.7 + 0.4 * unit(seed, 3)
    hut = None
    for side in ((1, -1) if unit(seed, 4) < 0.5 else (-1, 1)) if hut_ok else ():
        for f in (0.3, 0.0, 0.6, -0.3):
            u = (L.min() + L.max()) / 2 + f * side * np.ptp(L) / 2
            v = W.min() + d / 2 + 0.15 if side > 0 else W.max() - d / 2 - 0.15
            x, y = at(u, v)
            q = rect(x, y, w, d, ang)
            if free(q):
                hut = (x, y, q, 0 if side > 0 else 180)
                break
        if hut:
            break
    if hut:
        x, y, q, turn = hut
        out.append([k, 6, round(x * 10), round(y * 10), round(w * 10), round(d * 10), round(h * 10), round((ang + turn) * 100)])
        taken = taken.union(q.buffer(0.8))
    # condensers: a row along the edge across from the hut, as long as the roof gives, on all but the towers
    if top <= 80 and np.ptp(L) > 3.0:
        n = max(2, min(12, int(np.ptp(L) * (0.25 + 0.3 * unit(seed, 5)) / UNIT)))
        for side in (-1, 1) if (hut and hut[3] == 0) else (1, -1):
            for f in (0.0, 0.4, -0.4):
                for m in (n, n // 2):
                    if m < 2:
                        continue
                    ln = m * UNIT
                    u = (L.min() + L.max()) / 2 + f * (np.ptp(L) - ln) / 2
                    v = W.min() + 0.55 if side < 0 else W.max() - 0.55
                    x, y = at(u, v)
                    q = rect(x, y, ln, 0.75, ang)
                    if free(q):
                        out.append([k, 7, round(x * 10), round(y * 10), round(ln * 10), 4, 7, round((ang + (0 if side < 0 else 180)) * 100)])
                        return


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--city", default="shibuya")
    a = ap.parse_args()
    d = os.path.join(ROOT, "web", "data", a.city)
    path = os.path.join(d, "buildings.json")
    B = json.load(open(path, encoding="utf8"))
    cfg = json.load(open(os.path.join(ROOT, "cities", a.city, "city.json"), encoding="utf8"))
    kit = cfg.get("roofkit", {})
    skip = set(kit.get("skip", []))
    hidden = set()
    lmp = os.path.join(d, "landmarks.json")
    if os.path.exists(lmp):
        hidden = set(json.load(open(lmp, encoding="utf8")).get("hidden", []))
    pitched = {r[0] for r in B.get("r", [])}
    styles = B["styles"]
    flat_styles = {"office", "glass", "apartment", "heritage", "retail", "civic", "mixed", "industrial", "plain"}
    rows = [p for p in B["p"] if p[1] not in KINDS]
    by = {}
    for p in rows:
        if p[1] <= 2:
            by.setdefault(p[0], []).append(p)
    box_of = lambda q: rect(q[2] / 10, q[3] / 10, q[4] / 10, q[5] / 10, q[7] / 100)
    # the flat roofs, by building
    bld = {}
    for k, s in enumerate(B["s"]):
        b = B["b"][s[0]]
        if k in pitched or k in hidden or b[6] in skip or styles[b[10]] not in flat_styles or s[3] < 60:
            continue
        p = largest(poly(s))
        if p is None or p.area < 25:
            continue
        bld.setdefault(s[0], []).append((k, s, p))
    out, moved = [], set()
    for bi, solids in bld.items():
        seed = B["b"][bi][14]
        roofs_ = {k: Roof(p) for k, s, p in solids}
        taken = {k: unary_union([box_of(q).buffer(0.6) for q in by.get(k, []) if q[1] != 0] + [Polygon()]) for k, s, p in solids}
        # one mark a building, on the highest roof that has room for it; the loose plant boxes on that square are
        # moved off it (a pad is kept clear), the plant rooms and tanks are not
        for k, s, p in sorted(solids, key=lambda t: (-t[1][3], -t[2].area)):
            m = mark(k, s, roofs_[k], taken[k])
            if m:
                row, q = m
                out.append(row)
                for r in by.get(k, []):
                    if r[1] == 0 and box_of(r).intersects(q.buffer(1.0)):
                        moved.add(id(r))
                taken[k] = taken[k].union(q)
                break
        # stair huts on the two largest roofs that have no plant room (which holds the stair already)
        huts = {k for k, s, p in sorted(solids, key=lambda t: -t[2].area) if p.area >= 40
                and not any(q[1] == 1 for q in by.get(k, []))}
        huts = set(list(sorted(huts, key=lambda k: -roofs_[k].inner.area if roofs_[k].inner else 0))[:2])
        for k, s, p in solids:
            t = taken[k].union(unary_union([box_of(q).buffer(0.6) for q in by.get(k, []) if q[1] == 0 and id(q) not in moved] + [Polygon()]))
            place(k, s, roofs_[k], seed + k, t, out, hut_ok=k in huts)
    B["p"] = [p for p in rows if id(p) not in moved] + out
    f = B["p_fields"]
    f[1] = "kind (0 plant box, 1 plant room, 2 water tank, 3 dormers, 4 chimney stack, 5 gable, 6 stair hut, 7 condenser row, 8 rescue mark: h 0 R, 1 H)"
    json.dump(B, open(path, "w"), separators=(",", ":"))
    from collections import Counter
    print("roofkit:", dict(Counter(q[1] for q in out)), f"({len(moved)} plant boxes moved off a mark's square)")


if __name__ == "__main__":
    main()
