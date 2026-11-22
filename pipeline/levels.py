"""One model of levels for everything that is built on the ground (issue 163).

A city is built to datums. A street is graded, a plot is levelled to its street, and what stands on them has a level
top and a foot on the ground: a wall, a fence, a hoarding, a rail or a parapet takes a slope in steps at its posts,
never by leaning with it. The map was not made that way: each generator read a height under each of its own points
(from whichever grid it had to hand) and added its own height, so a top copied the ground's noise, and when the
ground was graded under it the thing was left hanging. This module is what they all read instead:

  - Levels(city): the ground as the game draws and walks it (game.json "terrain", 5 m, each cell split from its
    north-east to its south-west corner: street_ground.Ground), graded by street_ground.py. Not the viewer's 10 m
    grid (terrain.json), which lies up to a metre off it between its nodes, and never the survey;
  - stepped(line, ground, height): the bays of a thing with a top along a line. Each bay (between two posts) has one
    level top and a foot under the lowest ground along it. The tops are the fewest levels that keep every bay between
    `height` and `height + slack` over the highest ground under it (an interval stabbed along the line: where one
    level serves the next bay too, it is kept), so a line on even ground has one top, a line down a hill steps down
    at posts, and no top rises and falls again inside a slack;
  - footing(points, ground): the level a thing with a footprint stands on (a mast, a crane, a kiosk): the lowest
    ground under its feet, and how far the highest stands over that (what its base has to take up);
  - walls(M, bays, ...) and posts(...) draw bays as panels and uprights into a mesh that has quad(a, b, c, d), so that
    a generator of a new kind of thing draws it by calling these and inherits the rule;
  - every run made is kept (RUNS) and written beside the city's sources (cities/<id>/levels.json), and tools/levels_check.py
    holds each to the ground as it is now: a run whose ground was changed after it was built fails there, with its
    place, instead of hanging in a still.

Adopted from (docs/LEVELS.md): OSM2World's elevation constraints (a way level across, smooth along; a barrier's top
from its ground), CityEngine's "align terrain to shapes" and its level-topped extrusion (world.up.flatTop), PLATEAU's
convention of a building's base at the lowest ground of its footprint, and the fencer's rule for a slope (step the
panels, level each).
"""
import base64
import json
import math
import os
from collections import namedtuple

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

BAY_M = 2.0      # a panel between two posts
SLACK_M = 0.45   # how much higher than asked a level top may stand over its ground before it steps down
FILL_M = 1.0     # ... and how much higher still, to keep a top level over a dip a bay or two long
EMBED_M = 0.25   # a foot goes this far under the lowest ground along its bay
SAMPLE_M = 0.5   # the ground is read this often along a bay (and at its ends)

Bay = namedtuple("Bay", "a b top foot ground_lo ground_hi")

FEET = []        # every footing: [x, y, base, foot, radius]
RUNS = []        # every run built in this process: {"kind", "height", "slack", "bays": [[ax, ay, bx, by, top, foot], ...]}


class Levels:
    """The ground of a map as the game draws it."""

    def __init__(self, city_id, game=None):
        d = os.path.join(ROOT, "web", "data", city_id)
        scene = json.load(open(os.path.join(d, "scene.json"), encoding="utf8"))
        t = (game or json.load(open(os.path.join(d, "game.json"), encoding="utf8")))["terrain"]
        self.cell, self.nx, self.ny = t["cell"], t["nx"], t["ny"]
        self.T = np.frombuffer(base64.b64decode(t["data"]), "<i2").astype(np.float64).reshape(self.ny, self.nx) * t["scale"]
        self.x0, self.y1 = scene["frame"]["x"][0], scene["frame"]["y"][1]

    def at(self, x, y):
        """The ground under (x, y), scalars or arrays: the triangle of the cell the game walks."""
        T = self.T
        c = np.clip((np.asarray(x, np.float64) - self.x0) / self.cell, 0, self.nx - 1.001)
        r = np.clip((self.y1 - np.asarray(y, np.float64)) / self.cell, 0, self.ny - 1.001)
        c0, r0 = c.astype(int), r.astype(int)
        fc, fr = c - c0, r - r0
        a, b, d, e = T[r0, c0], T[r0, c0 + 1], T[r0 + 1, c0], T[r0 + 1, c0 + 1]
        z = np.where(fc + fr <= 1, a + fc * (b - a) + fr * (d - a), e + (1 - fc) * (d - e) + (1 - fr) * (b - e))
        return float(z) if np.ndim(z) == 0 else z

    __call__ = at

    def along(self, a, b, step=SAMPLE_M):
        """The ground along the segment a-b: its lowest and its highest, read every `step` and at both ends."""
        a, b = np.asarray(a, np.float64)[:2], np.asarray(b, np.float64)[:2]
        n = max(2, int(math.ceil(float(np.hypot(*(b - a))) / step)) + 1)
        p = a + (b - a) * np.linspace(0.0, 1.0, n)[:, None]
        z = self.at(p[:, 0], p[:, 1])
        return float(z.min()), float(z.max())


def split(line, bay=BAY_M, closed=False):
    """A polyline cut into bays: each edge into a whole number of equal bays as near `bay` long as it holds, so a post
    stands on every corner. [(a, b), ...] in order."""
    pts = [np.asarray(p, np.float64)[:2] for p in line]
    if closed and len(pts) > 2 and float(np.hypot(*(pts[0] - pts[-1]))) > 1e-6:
        pts.append(pts[0])
    out = []
    for a, b in zip(pts, pts[1:]):
        L = float(np.hypot(*(b - a)))
        if L < 1e-6:
            continue
        n = max(1, int(round(L / bay)))
        for k in range(n):
            out.append((a + (b - a) * (k / n), a + (b - a) * ((k + 1) / n)))
    return out


def stab(lo, hi, breaks=()):
    """The fewest levels along a row of bays, each bay's level within [lo, hi] of it: one level is kept for as long as
    it serves the next bay (the classic interval stabbing, which is the least number of steps there can be), and each
    is as low as its bays allow. A new level starts at every index in `breaks` (a gap in the line)."""
    n, out, i, breaks = len(lo), [], 0, set(breaks)
    while i < n:
        l, h, j = lo[i], hi[i], i + 1
        while j < n and j not in breaks and max(l, lo[j]) <= min(h, hi[j]):
            l, h, j = max(l, lo[j]), min(h, hi[j]), j + 1
        out += [l] * (j - i)
        i = j
    return out


def stepped(line, ground, height, bay=BAY_M, slack=SLACK_M, embed=EMBED_M, closed=False, keep=None, kind=None):
    """The bays of a thing `height` tall along `line` on `ground` (a Levels): [Bay(a, b, top, foot, lo, hi), ...].

    Every bay's top is level, at least `height` over the highest ground under it and at most `height + slack` over
    it; the tops change only at posts and as seldom as that allows; every foot is `embed` under the lowest ground of
    its bay. keep(a, b) -> False leaves a bay out (a gap: a gate, a building against the line), and the tops start
    afresh past it. With `kind` the run is kept for the check (RUNS)."""
    bays = split(line, bay, closed)
    use = [i for i, (a, b) in enumerate(bays) if keep is None or keep(a, b)]
    if not use:
        return []
    g = [ground.along(*bays[i]) for i in use]
    breaks = [k for k in range(1, len(use)) if use[k] != use[k - 1] + 1]
    tops = stab([hi + height for _, hi in g], [hi + height + slack for _, hi in g], breaks)
    if closed and len(use) == len(bays) and len(use) > 2 and abs(tops[0] - tops[-1]) > 1e-9:
        # round a closed line the first level and the last are one if one level serves both ends
        lo0, hi0 = max(g[0][1], g[-1][1]) + height, min(g[0][1], g[-1][1]) + height + slack
        if lo0 <= hi0:
            k0 = next(k for k in range(len(tops)) if tops[k] != tops[0])
            k1 = next(k for k in range(len(tops) - 1, -1, -1) if tops[k] != tops[-1]) + 1
            lo = max(hi + height for _, hi in g[:k0] + g[k1:])
            if lo <= min(hi + height + slack for _, hi in g[:k0] + g[k1:]):
                tops[:k0] = [lo] * k0
                tops[k1:] = [lo] * (len(tops) - k1)
    # no tooth: a level of one or two bays that stands under both its neighbours (a dip of the ground a bay or two
    # long, less than a break) is raised to the lower of them, up to FILL_M: a level top matters more than its height
    for _ in range(3):
        k = 1
        while k < len(tops) - 1:
            j = k
            while j + 1 < len(tops) - 1 and tops[j + 1] == tops[k] and j + 1 not in breaks:
                j += 1
            if j - k < 2 and k not in breaks and j + 1 not in breaks and tops[k - 1] > tops[k] < tops[j + 1]:
                up = min(tops[k - 1], tops[j + 1])
                if up - tops[k] <= FILL_M:
                    tops[k:j + 1] = [up] * (j + 1 - k)
            k = j + 1
    out = [Bay(bays[i][0], bays[i][1], round(tops[k], 3), round(g[k][0] - embed, 3), g[k][0], g[k][1]) for k, i in enumerate(use)]
    if kind:
        RUNS.append({"kind": kind, "height": height, "slack": slack,
                     "bays": [[round(float(v), 2) for v in (*b.a, *b.b)] + [b.top, b.foot] for b in out]})
    return out


def footing(points, ground, embed=EMBED_M):
    """What a thing with feet at `points` stands on: (the level of its base: the highest ground under it, so that
    nothing of it is buried; how far down its feet go to reach under the lowest: base - foot)."""
    p = np.asarray(points, np.float64).reshape(-1, 2)
    c = p.mean(0)
    rad = float(np.hypot(p[:, 0] - c[0], p[:, 1] - c[1]).max())
    z = np.atleast_1d(ground.at(*ring_of(c[0], c[1], rad).T))
    base, deep = float(np.max(z)), float(np.max(z) - np.min(z)) + embed
    FEET.append([round(float(c[0]), 2), round(float(c[1]), 2), round(base, 3), round(base - deep, 3), round(rad, 2)])
    return base, deep


def ring_of(x, y, rad):
    """The points a footing is read at: its middle, and eight round it at its radius."""
    a = np.linspace(0, 2 * np.pi, 9)[:-1]
    return np.stack([np.r_[x, x + rad * np.cos(a)], np.r_[y, y + rad * np.sin(a)]], 1) if rad > 0 else np.array([[x, y]])


def walls(M, bays, both=True, z_from=None, z_to=None):
    """The bays as panels: one upright quad a bay from its foot to its top (or between z_from and z_to over the foot's
    ground: a band of the panel, measured down from the top when negative), seen from both sides unless told
    otherwise. M has quad(a, b, c, d)."""
    for b in bays:
        z0 = b.foot if z_from is None else (b.top + z_from if z_from < 0 else b.top - (b.top - b.ground_hi) + z_from)
        z1 = b.top if z_to is None else (b.top + z_to if z_to <= 0 else z0 + z_to)
        p, q = b.a, b.b
        M.quad(np.array([*p, z0]), np.array([*q, z0]), np.array([*q, z1]), np.array([*p, z1]))
        if both:
            M.quad(np.array([*q, z0]), np.array([*p, z0]), np.array([*p, z1]), np.array([*q, z1]))


def posts(bays):
    """Where the posts of a run stand, and how each reaches: [(xy, foot, top), ...], one at every joint (the higher of
    the two tops that meet there, the lower of the two feet) and one at each end."""
    out = []
    for k, b in enumerate(bays):
        prev = bays[k - 1] if k and float(np.hypot(*(bays[k - 1].b - b.a))) < 1e-6 else None
        out.append((b.a, min(b.foot, prev.foot) if prev else b.foot, max(b.top, prev.top) if prev else b.top))
        nxt = bays[k + 1] if k + 1 < len(bays) and float(np.hypot(*(bays[k + 1].a - b.b))) < 1e-6 else None
        if nxt is None and not (k + 1 == len(bays) and float(np.hypot(*(bays[0].a - b.b))) < 1e-6 and len(bays) > 2):
            out.append((b.b, b.foot, b.top))
    return out


def steps_of(bays):
    """How a run's top moves: (the number of joints where it changes, the largest change, the number of teeth: a
    change one way undone within three bays)."""
    tops = [b.top for k, b in enumerate(bays)]
    d = [tops[k + 1] - tops[k] for k in range(len(tops) - 1) if float(np.hypot(*(bays[k + 1].a - bays[k].b))) < 1e-6]
    ch = [(k, v) for k, v in enumerate(d) if abs(v) > 1e-6]
    teeth = sum(1 for (k0, v0), (k1, v1) in zip(ch, ch[1:]) if k1 - k0 <= 3 and v0 * v1 < 0)
    return len(ch), max((abs(v) for _, v in ch), default=0.0), teeth


def paved(G, game, B, scene=None):
    """The cells of the ground (ny - 1, nx - 1) that are paved: town ground a player sees as a surface somebody laid.
    Not the water, not under a building (a cell its wall crosses is the wall's), not open land (further than 15 m
    from every building: a park, a railway's corridor, a hillside keep the land's shape), not a mapped stair or ramp,
    not a hero level (it draws its own floor: docs/HERO.md)."""
    from PIL import Image, ImageDraw
    from scipy import ndimage
    T, cell = G.T, G.cell
    ny, nx = T.shape[0] - 1, T.shape[1] - 1
    out = np.zeros((ny, nx), bool)
    wm = game.get("water")
    if wm:
        w = np.unpackbits(np.frombuffer(base64.b64decode(wm["bits"]), np.uint8))[:T.size].reshape(T.shape).astype(bool)
        out |= ndimage.binary_dilation(w)[:ny, :nx]
    px = lambda x, y: ((x - G.x0) / cell - 0.5, (G.y1 - y) / cell - 0.5)
    kr = B["s_fields"].index("ring_dm")
    img = Image.new("L", (nx, ny), 0)
    d = ImageDraw.Draw(img)
    for sd in B["s"]:
        r = sd[kr]
        d.polygon([px(r[i] / 10, r[i + 1] / 10) for i in range(0, len(r) - 1, 2)], fill=1, outline=1)
    bld = np.asarray(img, bool)
    out |= ndimage.binary_dilation(bld)
    out |= ndimage.distance_transform_edt(~bld) * cell > 15.0
    img = Image.new("L", (nx, ny), 0)
    d = ImageDraw.Draw(img)
    for kind in ("foot", "road"):
        for e in game["paths"][kind]:
            if e.get("c") in ("steps", "stairs", "ramp"):
                p = np.asarray(e["p"], np.float64).reshape(-1, 3) / 10
                d.line([px(x, y) for x, y, _ in p], fill=1, width=3)
    out |= np.asarray(img, bool)
    yy, xx = np.mgrid[0:ny, 0:nx]
    for h in game.get("hero", []):
        if h.get("at") and h.get("r"):
            out |= np.hypot(G.x0 + (xx + 0.5) * cell - h["at"][0], G.y1 - (yy + 0.5) * cell - h["at"][1]) < h["r"]
    return ~out


def record_path(city_id):
    return os.path.join(ROOT, "cities", city_id, "levels.json")


def save(city_id):
    """What this process built by the rule, kept beside the city's sources (not served): its runs and its footings."""
    if RUNS or FEET or os.path.exists(record_path(city_id)):
        json.dump({"note": "What the landmarks build by the rule of levels (pipeline/levels.py): written by pipeline/landmarks.py, held by tools/levels_check.py, read by pipeline/street_ground.py.",
                   "runs": RUNS, "feet": FEET}, open(record_path(city_id), "w", encoding="utf8"), separators=(",", ":"))


def record(city_id):
    """The runs and footings of the city's landmarks as last built: {"runs": [...], "feet": [...]}."""
    p = record_path(city_id)
    return json.load(open(p, encoding="utf8")) if os.path.exists(p) else {"runs": [], "feet": []}
