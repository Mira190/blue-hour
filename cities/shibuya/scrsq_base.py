"""Shibuya Scramble Square's base on its north face, as measured (issue 66; docs/HERO.md, "Scramble Square's base"):
the glass skirts that flare out of the north face below 15F, the screen between them, and the overhang over the Urban
Core's forecourt.

    python cities/shibuya/scrsq_base.py        # after lobby.py, before roofkit.py; then: python pipeline/pack.py

The city drew the tower as a prism on OpenStreetMap's footprint, straight from the street to the roof. The real north
face (Nikken Sekkei, the tower; Kengo Kuma & Associates, the lower part; Shibuya City's design council summary, "東口
アーバン・コア") is straight from the roof down to 15F and below it carries the "くぼみ", the stepped void of the Urban
Core seen from the plaza over the Ginza line, behind two glass skirts that flare out of the face as they come down:

  * the north-west skirt, from 15F (76.5 m over 1F) down to the Skyway at 4F (19.3 m): its east edge sweeps down and
    across the face from the north-west corner to 21 m from it (of 59), each storey's slab standing further out than the
    one over it (the stacked soffits), the glass between them a concave trumpet: the corner toward Hachiko, the one the
    design council asked to be "large and distinctive";
  * the north-east tent, a gabled glass lobe from 4F up to a point at about 8F (38 m), 18 m wide at its foot, over the Urban Core;
  * between them, in the face's own plane, the screen (Shibuya Scramble Square Vision, Panasonic, 2019: LEDs behind the
    windows, 552.6 m2 in a 40.05 by 25.24 m box, Tokyu OOH), seen from the north its lower left (east) cut by the tent
    and its right (west) by the skirt;
  * under the 4F terrace, the floors 2F to 4F carried out over the 1F forecourt in front of SKY's street lift (the
    overhang over the Urban Core), whose soffit is the faceted mirror ceiling with its lit slots (hero_skylobby.py).

How it was measured (no elevation or dimension of the base is published; the sources and the uncertainties are in
docs/HERO.md): the storeys from Elevator Journal 28's escalator rises (2F 7.7 m, 3F 13.3, 4F 19.3, 5F 25.0 ... 14F
71.3, 15F 76.5); the face's width from the footprint (59.3 m from the west slab's north-west corner to the tower's north-east corner); the edges
read off a near-frontal photograph from the north (Commons, "Shibuya Scramble Square-1", 2019-01) by counting storeys
and scaling the width, checked from Miyamasuzaka-shita ("Shibuya Station 191129a", "宮益坂下交差点 ... IMG 0569") and
against the screen's published box. The skirts' depth (how far they stand out) is the least certain number: 6.5 m at
the foot of the north-west skirt and 4 m at the tent's, +-2 m.

The pass keeps every solid's index: the tower's solids are untouched, and the flares are new solids of the same
building, one a storey band (each band the outline at its top, so that the glass drawn through the outlines stands
outside it), all passages (an underside, no posts); running it again rewrites them in place. They stand clear of every
other building's solids (the Ginza line's station, the station's concourse) by half a metre.
"""
import json
import math
import os

import numpy as np
from shapely.geometry import Polygon
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
BUILDING = "渋谷スクランブルスクエア"

# the storeys over 1F (Elevator Journal 28, the escalators' rises): 2F, 3F, 4F ... 15F
LEVELS = [7.7, 13.3, 19.3, 25.0, 30.0, 35.0, 40.0, 45.0, 50.5, 55.5, 60.5, 65.9, 71.3, 76.5]
F4, F15 = 19.3, 76.5
# the north-west skirt's east edge, (height over 1F, metres along the face from the north-east corner): read off the
# frontal photograph as shares of the face's width (59.3 m), storeys counted from the skirt's top at 15F down to its big
# terrace at 4F
SKIRT_EDGE = [(19.3, 38.7), (29.0, 42.6), (43.0, 46.8), (61.0, 52.4), (70.0, 53.0), (76.5, 53.5)]
SKIRT_OUT, SKIRT_POW = 6.5, 1.6      # how far its foot stands out of the face at the corner, and how the flare grows downward
# the north-east tent: its foot from the corner to 17.7 m along, its ridge at 30 % across, up to a point at 32.5 m
TENT = {"s0": 0.0, "s1": 17.7, "top": 38.0, "tip": 1.5, "out": 4.0, "ridge": 0.3, "pow": 1.0}
# the overhang under the 4F terrace: 2F to 4F carried out over the forecourt, 6.5 m, from the north-east corner to 17.4 m
# along the face, then on an S back to the face at 35 m; a slot of sky is left between it and the Ginza line's
# station (the light beyond the soffit's edge in the forecourt's photograph)
OVER = {"z0": 7.7, "z1": 19.3, "s0": 35.1, "s1": 17.4, "out": 6.5}
# the screen: its box (Tokyu OOH: 552.6 m2 in 40.05 x 25.24 m), its foot at 4F, its west side under the skirt's edge
# (s_right: the side further along the face)
SCREEN = {"w": 40.05, "h": 25.24, "z": 19.3, "s_right": 47.3}
CLEAR = 0.5                    # off any other building's solid
HALL_KEEP = (4.6, -6.0, 8.0)   # SKY's hall kept clear: half its width (3.1 m) and 1.5 m, from 6 m in front of its doors
                               # (its canopy, its apron, the queue's belt) to past its glass shaft


def ring_of(s):
    r = s[4]
    return [(r[i] / 10, r[i + 1] / 10) for i in range(0, len(r), 2)]


class Face:
    """The north face's frame: s along it from the north-west corner toward the north-east, n out of it (north)."""

    def __init__(self, B):
        self.bi = next(i for i, b in enumerate(B["b"]) if b[0] == BUILDING)
        tower = max((s for s in B["s"] if s[0] == self.bi and s[3] > 2000), key=lambda s: Polygon(ring_of(s)).buffer(0).area)
        self.tower = tower
        # the building's outline: the tower and PLATEAU's west slab beside it, which together make the north face one
        # straight line from the slab's north-west corner to the tower's north-east corner
        self.ring = unary_union([Polygon(ring_of(s)).buffer(0) for s in B["s"] if s[0] == self.bi and s[3] > 1000])
        if self.ring.geom_type != "Polygon":
            self.ring = max(self.ring.geoms, key=lambda g: g.area)
        pts = np.asarray(self.ring.exterior.coords)[:-1]
        c = self.ring.centroid
        # the north-west corner: the point furthest out along north-west; the north-east: along north-east
        # s runs from the north-east corner (a) west to the north-west corner (b): the photographs were read from the
        # face's left as it is seen from the north, its east end
        self.a = max(pts, key=lambda p: (p[1] - c.y) + (p[0] - c.x))
        self.b = max(pts, key=lambda p: (p[1] - c.y) - (p[0] - c.x))
        d = self.b - self.a
        self.W = float(np.linalg.norm(d))
        self.u = d / self.W
        self.n = np.array([-self.u[1], self.u[0]])
        if self.n[1] < 0:
            self.n = -self.n
        # the end faces, east and west, up toward the north: their lines carried north bound the flares (the east one
        # where SKY's street hall and its lift stand, the west one the skirt's side)
        def up_face(q):
            k = [tuple(p) for p in pts].index(tuple(q))
            nb = pts[(k - 1) % len(pts)] if pts[(k - 1) % len(pts)][1] < pts[(k + 1) % len(pts)][1] else pts[(k + 1) % len(pts)]
            e = q - nb
            return e / np.linalg.norm(e)
        self.e0, self.e = up_face(self.a), up_face(self.b)
        self.base = tower[1] / 10

    def xy(self, s, n):
        return self.a + self.u * s + self.n * n

    def sn(self, x, y):
        p = np.array([x, y]) - self.a
        return float(p @ self.u), float(p @ self.n)

    def end_s(self, n):
        """where the west face's line, carried north, is at n out of the face"""
        return self.W + float(self.e @ self.u) / float(self.e @ self.n) * n

    def start_s(self, n):
        """where the east face's line, carried north, is at n out of the face"""
        return float(self.e0 @ self.u) / float(self.e0 @ self.n) * n


def _interp(pairs, z):
    zs, ss = zip(*pairs)
    return float(np.interp(z, zs, ss))


def skirt_out(z):
    """how far the north-west skirt stands out of the face at height z (over 1F), at the corner"""
    if z >= F15 or z < F4 - 1e-6:
        return 0.0
    return SKIRT_OUT * ((F15 - z) / (F15 - F4)) ** SKIRT_POW


def skirt_edge(z):
    return _interp(SKIRT_EDGE, z)


def skirt_curve(F, z, steps=14):
    """the north-west skirt's outline at height z: points (s, n) from its east edge on the face, out along the curve to
    the west face's line, and back to the corner"""
    P, s0 = skirt_out(z), skirt_edge(z)
    if P < 0.05:
        return []
    out = []
    for k in range(steps + 1):
        x = k / steps
        n = P * math.sin(math.pi / 2 * x) ** 0.85
        out.append((s0 + (F.end_s(n) - s0) * x if k < steps else F.end_s(P), n))
    return out


def tent_curve(z, steps=8):
    """the north-east tent's outline at height z: (s, n) from its west foot on the face, out to its ridge, back to the
    face at the corner"""
    T = TENT
    if z < F4 - 1e-6 or z >= T["top"]:
        return []
    tau = (z - F4) / (T["top"] - F4)
    s1 = T["tip"] + (T["s1"] - T["tip"]) * (1 - tau) ** T["pow"]
    s0 = T["s0"]
    out_n = T["out"] * (1 - tau) ** 1.3
    sr = s0 + (s1 - s0) * T["ridge"]
    pts = [(s1 + (sr - s1) * k / steps, out_n * (k / steps) ** 0.8) for k in range(steps + 1)]
    pts += [(sr + (s0 - sr) * k / steps, out_n * (1 - (k / steps) ** 1.6)) for k in range(1, steps + 1)]
    return pts


def over_curve(F, steps=16):
    """the overhang's outline under the 4F terrace: from the east face's line at its full depth to s1, then an S back to
    the face at s0"""
    O = OVER
    pts = [(F.start_s(O["out"]), O["out"])]
    for k in range(steps + 1):
        x = k / steps
        pts.append((O["s1"] + (O["s0"] - O["s1"]) * x, O["out"] * (0.5 + 0.5 * math.cos(math.pi * x))))
    return pts


def solid_poly(F, curve, inset=0.3):
    """a flare's plan as a polygon: the curve closed back along the inside of the face, less the tower (each solid
    reaches 0.3 m into the tower's wall, so that no seam shows between them)"""
    if len(curve) < 3:
        return None
    s_lo = min(s for s, _ in curve) - 0.5
    s_hi = max(s for s, _ in curve) + 0.5
    ring = [F.xy(s, n) for s, n in curve] + [F.xy(s_hi, -inset - 0.2), F.xy(s_lo, -inset - 0.2)]
    P = Polygon(ring).buffer(0)
    # (never past the end faces' lines: east of the east one stand SKY's street hall and its lift)
    between = Polygon([F.a + F.e0 * 200, F.b + F.e * 200, F.b - F.e * 200, F.a - F.e0 * 200]).buffer(0)
    return P.intersection(between).difference(F.ring.buffer(-inset))


def screen_poly():
    """the screen's outline in the face's plane, (s, z over 1F): its box less what the tent and the skirt cover"""
    S = SCREEN
    box = Polygon([(S["s_right"] - S["w"], S["z"]), (S["s_right"], S["z"]), (S["s_right"], S["z"] + S["h"]), (S["s_right"] - S["w"], S["z"] + S["h"])])
    zs = np.linspace(F4, F15, 60)
    skirt = Polygon([(skirt_edge(z), z) for z in zs] + [(80.0, F15), (80.0, F4)])
    tz = np.linspace(F4, TENT["top"], 30)
    tent = Polygon([(-20.0, F4)] + [(max(s for s, _ in tent_curve(z)), z) for z in tz[:-1]] + [(TENT["tip"], TENT["top"]), (-20.0, TENT["top"])])
    return box.difference(skirt).difference(tent)


def screen_parts(step=None):
    """the screen as trapezoids of its box (pipeline/screens.py "parts", fractions, u from its east side as it is seen
    from in front): its sides run along the tent's edge and the skirt's, as they do in the photographs from the north
    and from Miyamasuzaka-shita (its rows cut to whole storeys, each its mean width, stepped against the skirt's sweep: a
    sawtooth of glass between the two that read as the base twisting)"""
    S = SCREEN
    P = screen_poly()
    z0, z1 = S["z"], S["z"] + S["h"]
    s_left = S["s_right"] - S["w"]   # (its east side: s runs west)
    # where either side changes its slope: the skirt edge's measured points, where the tent's foot passes the box's side,
    # the tent's point
    T = TENT
    tau = 1 - (s_left - T["tip"]) / (T["s1"] - T["tip"])
    cuts = {z0, z1, T["top"], F4 + tau * (T["top"] - F4)} | {z for z, _ in SKIRT_EDGE}
    zs = sorted(z for z in cuts if z0 - 1e-6 <= z <= z1 + 1e-6)
    def span(z):
        z = min(max(z, z0 + 0.01), z1 - 0.01)
        cut = P.intersection(Polygon([(-50, z - 0.005), (100, z - 0.005), (100, z + 0.005), (-50, z + 0.005)]))
        a, _, b, _ = cut.bounds
        return (a - s_left) / S["w"], (b - s_left) / S["w"]
    out = []
    for za, zb in zip(zs[:-1], zs[1:]):
        if zb - za < 0.05:
            continue
        (a0, b0), (a1, b1) = span(za), span(zb)
        out.append([round(a0, 4), round(b0, 4), round((za - z0) / S["h"], 4), round((zb - z0) / S["h"], 4), round(a1, 4), round(b1, 4)])
    return out


def bands():
    """(z0, z1) over 1F: the overhang's, then a storey band each from 4F to 15F"""
    out = [(OVER["z0"], OVER["z1"])]
    lv = [z for z in LEVELS if z >= F4 - 1e-6]
    out += list(zip(lv[:-1], lv[1:]))
    return out


def flares(F, z0, z1):
    """the flares' plans for the band z0..z1 over 1F (the outline at its top: the glass drawn through the outlines stands
    outside it): a list of polygons"""
    polys = []
    if z1 <= OVER["z1"] + 1e-6:
        polys.append(solid_poly(F, over_curve(F)))
    else:
        zt = z1 - 1e-3
        polys.append(solid_poly(F, skirt_curve(F, zt)))
        polys.append(solid_poly(F, tent_curve(zt)))
    out = []
    for p in polys:
        if p is None or p.is_empty:
            continue
        for g in getattr(p, "geoms", [p]):
            if g.area > 1.0:
                out.append(g)
    return out


def dm(P):
    out = []
    for x, y in list(P.exterior.coords)[:-1]:
        out += [round(x * 10), round(y * 10)]
    return out


def hall_keep(G):
    """where SKY's street hall, its canopy, its glass shaft and the way up to its doors stand (game.json lifts "sky-gate"
    in the hall's frame, hero_skylobby.py's measures), with a margin: no flare stands over it. A walker or a story's
    beat put at the hall's door is stood on the highest floor there, and the overhang's roof at 4F was one."""
    stop = next(l for l in G.get("lifts", []) if l["id"] == "sky-gate")["stops"][0]
    door, at = np.asarray(stop["door"], float), np.asarray(stop["at"][:2], float)
    nv = (at - door) / np.linalg.norm(at - door)
    uv = np.array([nv[1], -nv[0]])
    P = lambda u, v: door + uv * u + nv * v
    U, V0, V1 = HALL_KEEP
    return Polygon([P(-U, V0), P(U, V0), P(U, V1), P(-U, V1)])


def run(B, G=None):
    """rewrite the flares' solids in B (buildings.json) in place: returns (rewritten, appended)"""
    F = Face(B)
    bi, g0 = F.bi, F.tower[1]
    keep = hall_keep(G) if G else None
    ours = {}
    passages0 = set(B.get("passages", []))
    keys = {(round(a * 10), round(b * 10)) for a, b in bands()}
    for k, s in enumerate(B["s"]):
        if s[0] == bi and k in passages0 and (s[2], s[3]) in keys:   # (no solid of the tower's own has a band's heights)
            ours.setdefault((s[2], s[3]), []).append(k)
    # what the flares stand clear of: every other building's solid near the face, by its heights
    near = []
    for k, s in enumerate(B["s"]):
        if s[0] == bi:
            continue
        r = s[4]
        if abs(r[0] / 10 - F.a[0]) > 160 or abs(r[1] / 10 - F.a[1]) > 160:
            continue
        P = Polygon(ring_of(s)).buffer(0)
        if P.distance(Polygon([F.xy(-5, -1), F.xy(F.W + 5, -1), F.xy(F.W + 5, 14), F.xy(-5, 14)])) < 1.0:
            near.append((P, s[1] / 10 + s[2] / 10, s[1] / 10 + s[3] / 10))
    passages = set(B.get("passages", []))
    rewritten = appended = 0
    used = set()
    for z0, z1 in bands():
        key = (round(z0 * 10), round(z1 * 10))
        za, zb = F.base + z0, F.base + z1
        plans = []
        for P in flares(F, z0, z1):
            if keep is not None:
                P = P.difference(keep)
            for Q, qa, qb in near:
                if qa < zb and qb > za:
                    P = P.difference(Q.buffer(CLEAR))
            for g in getattr(P, "geoms", [P]):
                if g.geom_type == "Polygon" and g.area > 5.0:   # (no slivers where the curve meets the face)
                    plans.append(g.simplify(0.05))
        slots = list(ours.get(key, []))
        for P in plans:
            row = [bi, g0, key[0], key[1], dm(P)] + [[v for x, y in list(h.coords)[:-1] for v in (round(x * 10), round(y * 10))] for h in P.interiors]
            if slots:
                k = slots.pop(0)
                B["s"][k] = row
                rewritten += 1
            else:
                B["s"].append(row)
                k = len(B["s"]) - 1
                appended += 1
            passages.add(k)
            used.add(k)
        for k in slots:   # (a band that has fewer pieces than before: the spare solid kept, its index too, as a sliver inside the tower)
            c = F.ring.representative_point()
            B["s"][k] = [bi, g0, key[0], key[1], dm(Polygon([(c.x, c.y), (c.x + 0.3, c.y), (c.x + 0.3, c.y + 0.3), (c.x, c.y + 0.3)]))]
    B["passages"] = sorted(passages)
    return rewritten, appended


def main():
    path = os.path.join(ROOT, "web", "data", "shibuya", "buildings.json")
    raw = open(path, encoding="utf8").read()
    B = json.loads(raw)
    G = json.load(open(os.path.join(ROOT, "web", "data", "shibuya", "game.json"), encoding="utf8"))
    r, a = run(B, G)
    out = json.dumps(B, separators=(",", ":"))
    if out != raw:
        open(path, "w", encoding="utf8").write(out)
    F = Face(B)
    print(f"scrsq_base: {r} flare solids rewritten, {a} appended; face {F.W:.1f} m from {F.a.round(1).tolist()} to {F.b.round(1).tolist()};",
          f"screen {screen_poly().area:.0f} m2 (published 552.6), parts {screen_parts()}", "(changed)" if out != raw else "(unchanged)")


if __name__ == "__main__":
    main()
