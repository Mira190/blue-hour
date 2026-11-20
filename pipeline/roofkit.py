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


def place(k, s, p, seed, taken, out):
    top = s[3] / 10
    inner = largest(p.buffer(-0.7, join_style=2))
    if inner is None or inner.area < 12:
        return
    ang = long_axis(p)
    a = math.radians(ang)
    ax, perp = np.array([math.cos(a), math.sin(a)]), np.array([-math.sin(a), math.cos(a)])
    c = inner.centroid
    C = np.asarray(inner.exterior.coords)
    L, W = C @ ax, C @ perp
    free = lambda q: inner.contains(q) and not q.intersects(taken)

    def at(u, v):  # a point from coordinates along and across the roof
        o = ax * u + perp * v
        return o[0], o[1]

    # the fire service's mark: as near the middle of the roof as the plant leaves a square of it open
    if top >= R_FROM:
        typ = 1 if top >= H_FROM else 0
        size = H_SIZE if typ else R_SIZE
        best = None
        for du in np.linspace(-0.35, 0.35, 15):
            for dv in np.linspace(-0.35, 0.35, 9):
                u, v = (L.min() + L.max()) / 2 + du * np.ptp(L), (W.min() + W.max()) / 2 + dv * np.ptp(W)
                x, y = at(u, v)
                q = rect(x, y, size + 1.0, size + 1.0, ang)
                if free(q):
                    dd = du * du + dv * dv
                    if best is None or dd < best[0]:
                        best = (dd, x, y, q)
        if best:
            _, x, y, q = best
            out.append([k, 8, round(x * 10), round(y * 10), round(size * 10), round(size * 10), typ, round(ang * 100)])
            taken = taken.union(q)
    if top < HUT_FROM:
        return
    # the stair hut, against the roof's edge: a corner of the longer side, its door facing in
    w, d, h = 2.6 + 1.0 * unit(seed, 1), 2.4 + 0.8 * unit(seed, 2), 2.7 + 0.4 * unit(seed, 3)
    hut = None
    for side in ((1, -1) if unit(seed, 4) < 0.5 else (-1, 1)):
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
    out = []
    for k, s in enumerate(B["s"]):
        b = B["b"][s[0]]
        if k in pitched or k in hidden or b[6] in skip or styles[b[10]] not in flat_styles:
            continue
        if s[3] < 60:
            continue
        p = poly(s)
        if p.is_empty or p.area < 25 or p.geom_type != "Polygon":
            p = largest(p)
            if p is None or p.area < 25:
                continue
        taken = unary_union([rect(q[2] / 10, q[3] / 10, q[4] / 10, q[5] / 10, q[7] / 100).buffer(0.6) for q in by.get(k, [])]) \
            if k in by else Polygon()
        if any(q[1] == 1 for q in by.get(k, [])):  # a plant room holds the stair already: the marks and condensers only
            before = len(out)
            place(k, s, p, b[14], taken, out)
            out[before:] = [q for q in out[before:] if q[1] != 6]
        else:
            place(k, s, p, b[14], taken, out)
    B["p"] = rows + out
    f = B["p_fields"]
    f[1] = "kind (0 plant box, 1 plant room, 2 water tank, 3 dormers, 4 chimney stack, 5 gable, 6 stair hut, 7 condenser row, 8 rescue mark: h 0 R, 1 H)"
    json.dump(B, open(path, "w"), separators=(",", ":"))
    from collections import Counter
    print("roofkit:", dict(Counter(q[1] for q in out)))


if __name__ == "__main__":
    main()
