"""Shibuya Scramble Square's curtain wall, a hero level of its own (blender/build_hero.py --city shibuya --level
scramblesq; docs/HERO.md, "Scramble Square's curtain wall").

The tower is the tallest thing in every frame of the story and was drawn with the city's generic curtain wall: a
grey-blue grid like every other tower's. The real one (Nikken Sekkei, the tower; Kengo Kuma & Associates, the lower
part; 2019) is a glass prism of storey-high Low-E panes, each over 4 m tall, with a white ceramic frit printed on their
outer face that thins toward the corners; its mullions shift from floor to floor, so the panes' joints step across the
face in diagonals, and each pane, set at its own slight angle, gives back the sky in its own tone (designboom, gooood,
KKAA; the photographs listed in docs/HERO.md). Office floors run 17F to 45F at about 4.55 m, the shop floors under them
at 5 to 6 m (Elevator Journal 28's escalator rises).

What is built: a skin a few centimetres outside the city's own walls of the tower (buildings.json, the tower's solids),
from the street to the roof's deck, in one material (`win_scrsq`: hero.js win*, dark glass by day that mirrors the sky,
its rooms lit after dark) on a drawn tile 12 m across and eight office storeys high:

  * the colour: a blue-green glass, each 1.5 m pane its own tone within a few percent (each reflects at its own angle);
  * the normal map: each pane tilted by its own small angle (a pane's tilt is the cause of its tone), the mullions as
    fine ribs and the slab's spandrel as a recessed band;
  * the frit: white on the outer face, dense at the spandrel and thinning up the pane (its millimetre dots drawn as
    what they add up to);
  * the joints: every pane's mullion, and every second one heavier, stepping 0.75 m along at each floor;
  * after dark, the offices behind: a ceiling's light in each lit bay, floors lit or dark as a working evening leaves them.

The shop floors (to 14F, about 71 m) take the same tile stretched to their storeys. The ground floor's faces round the
lobby SKY's street lift stands in (pipeline/lobby.py) are left to the lobby's own level (hero_skylobby.py).

Where it falls short: the north face's concave glass sweep over the Urban Core, with the LED screen facing the crossing,
is not modelled (the city's solids are prisms; issue 66).
"""
import json
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "pipeline"))

ID = "scramblesq"
BUILDING = "渋谷スクランブルスクエア"
TILE_W, STOREY, ROWS = 12.0, 4.55, 8        # the tile: 8 panes of 1.5 m across, 8 office storeys up
PANE = 1.5
SHOP_TOP = 71.3                             # 14F's floor over 1F (Elevator Journal 28's rises): the shop floors under it
SHOP_STOREY = 5.4
OUT = 0.06                                  # the skin's distance outside the city's wall
PX_W, PX_H = 512, 1536


def _tile():
    """The tile's colour, height (for the normal map), roughness and its offices' light, drawn together (one cause each)."""
    rng = np.random.default_rng(2019)
    W, H = PX_W, PX_H
    px_m, py_m = W / TILE_W, H / (ROWS * STOREY)
    col = np.zeros((H, W, 3))
    nx = np.zeros((H, W)); ny = np.zeros((H, W)); height = np.zeros((H, W))
    rough = np.full((H, W), 0.06)
    lit = np.zeros((H, W, 3))
    base = np.array([44, 82, 94.0])                      # blue-green glass (sRGB)
    yy, xx = np.mgrid[0:H, 0:W]
    for r in range(ROWS):
        y1, y0 = H - int(round(r * STOREY * py_m)), H - int(round((r + 1) * STOREY * py_m))   # (image rows run down)
        shift = (r * 0.75) % (2 * PANE)
        floor_on = rng.random() < 0.7                      # a floor at work this evening
        for k in range(-1, int(TILE_W / PANE) + 1):
            xa = (k * PANE + shift) % TILE_W
            x0 = int(round(xa * px_m)); x1 = x0 + int(round(PANE * px_m))
            cols = np.arange(x0, x1) % W
            tone = 1.0 + rng.normal(0, 0.035)
            tx, ty = rng.normal(0, 0.035), rng.normal(0, 0.02)
            col[y0:y1, cols] = base * tone
            nx[y0:y1, cols] = tx; ny[y0:y1, cols] = ty
            if floor_on and rng.random() < 0.82:
                g = np.clip((np.arange(y0, y1) - y0) / max(1, (y1 - y0)), 0, 1)[:, None]
                warm = np.array([255, 238, 210.0]) * (0.55 + 0.25 * rng.random())
                # (the ceiling's light, brightest along the top of the window, and the room's floor dark under the sill)
                lit[y0:y1, cols] = warm * (0.35 + 0.65 * (1 - g) ** 1.5)[..., None]
        # the spandrel at the slab: 0.55 m, recessed, fritted white, no light
        sp = int(round(0.55 * py_m))
        col[y1 - sp:y1] = np.array([70, 92, 98.0]); height[y1 - sp:y1] -= 1.0; lit[y1 - sp:y1] = 0; rough[y1 - sp:y1] = 0.35
        # the frit: printed on the outer face, dense over the spandrel and thinning up the pane. Its dots are a few
        # millimetres, under a texel at any distance: drawn as what they add up to, the pane paler and duller toward its foot
        g = np.clip(((y1 - sp) - np.arange(y0, y1 - sp)) / (1.4 * py_m), 0, 1)[:, None]
        k = (1 - g) ** 1.6 * 0.45
        col[y0:y1 - sp] = col[y0:y1 - sp] * (1 - k[..., None]) + np.array([214, 220, 218.0]) * k[..., None]
        rough[y0:y1 - sp] = rough[y0:y1 - sp] * (1 - k) + 0.4 * k
        lit[y0:y1 - sp] *= (1 - 0.7 * k)[..., None]
        # the joints: every pane's mullion, and every second one heavier, stepping at each floor
        for k in range(int(TILE_W / PANE) + 1):
            xm = ((k * PANE + shift) % TILE_W) * px_m
            wpx = 3 if k % 2 == 0 else 2
            cols = (np.arange(int(xm) - wpx // 2, int(xm) + (wpx + 1) // 2)) % W
            col[y0:y1, cols] = np.array([38, 44, 48.0]); height[y0:y1, cols] += 1.2; lit[y0:y1, cols] = 0; rough[y0:y1, cols] = 0.3
    return col, nx, ny, height, rough, lit


def drawn(d):
    """The tile's surface set (hero_kit.register): Color, NormalGL (each pane's tilt and the ribs), Roughness."""
    from PIL import Image
    col, nx, ny, height, rough, _ = _tile()
    gx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * 0.5
    gy = (np.roll(height, 1, 0) - np.roll(height, -1, 0)) * 0.5
    n = np.dstack([nx - gx * 0.6, ny - gy * 0.6, np.ones_like(nx)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    os.makedirs(d, exist_ok=True)
    Image.fromarray(np.clip(col, 0, 255).astype(np.uint8), "RGB").save(os.path.join(d, "Color.png"))
    Image.fromarray(np.clip((n * 0.5 + 0.5) * 255, 0, 255).astype(np.uint8), "RGB").save(os.path.join(d, "NormalGL.png"))
    Image.fromarray(np.clip(rough * 255, 0, 255).astype(np.uint8), "L").save(os.path.join(d, "Roughness.png"))


def draw_lit(img, r):
    from PIL import Image
    *_, lit = _tile()
    img.paste(Image.fromarray(np.clip(lit, 0, 255).astype(np.uint8), "RGB"), (r[0], r[1]))


def materials():
    return {
        # dark glass by day mirroring the sky (sky 0.9: up the tower it sees the sky, not a street), its offices after dark
        "win_scrsq": {"tex": "scrsq", "maps": "cnr", "metal": 0.85, "rough": 0.06, "sky": 0.9, "map": "atlas", "emissive": True, "emissive_only": True, "glow": 0.75},
    }


def _rings():
    from shapely.geometry import Polygon
    B = json.load(open(os.path.join(ROOT, "web", "data", "shibuya", "buildings.json")))
    bi = next(i for i, b in enumerate(B["b"]) if b[0] == BUILDING)
    ring = lambda r: [(r[i] / 10, r[i + 1] / 10) for i in range(0, len(r), 2)]
    out = []
    for s in B["s"]:
        if s[0] != bi:
            continue
        P = Polygon(ring(s[4])).buffer(0)
        out.append((P, s[1] / 10, s[2] / 10, s[3] / 10))
    return out


def build(K):
    from shapely.geometry import Point, Polygon
    sys.path.insert(0, os.path.join(ROOT, "blender"))
    import hero_open as HP
    from lobby import room_of
    K.register("scrsq", TILE_W, drawn)
    geo, A = K.Geo(), K.Atlas(PX_W, PX_H)
    A.cell("lit", PX_W, PX_H, draw_lit)   # (the whole atlas: it repeats with the tile, in the same coordinates)
    T = HP.Ground("shibuya")
    G = json.load(open(os.path.join(ROOT, "web", "data", "shibuya", "game.json")))
    stop = next(l for l in G["lifts"] if l["id"] == "sky-gate")["stops"][0]
    room = room_of(stop, stop["lobby"], grow=0.3)
    solids = _rings()
    # the tower: the largest solid that reaches the top; its lower part: the solid of the same foot under it
    tower = max((s for s in solids if s[3] > 200), key=lambda s: s[0].area)
    low = [s for s in solids if s[2] == 0 and s[3] <= tower[2] + 0.1 and s[0].area > 0.5 * tower[0].area]
    base = tower[1]
    top = base + tower[3]
    def tile_v(z):
        """height over 1F -> the tile's v: the shop floors at their storeys, the offices at theirs"""
        h = z - base
        if h <= SHOP_TOP:
            return h / SHOP_STOREY / ROWS
        return SHOP_TOP / SHOP_STOREY / ROWS + (h - SHOP_TOP) / STOREY / ROWS
    def skin(P, z0, z1, skip=None):
        ring = np.asarray(P.exterior.coords)[:-1]
        if not P.exterior.is_ccw:
            ring = ring[::-1]
        along = 0.0
        for i in range(len(ring)):
            a, b = ring[i], ring[(i + 1) % len(ring)]
            L = float(np.linalg.norm(b - a))
            if L < 0.3:
                continue
            t = (b - a) / L
            nrm = np.array([t[1], -t[0]])                   # outward (the ring runs anticlockwise)
            mid = (a + b) / 2
            if skip is not None and skip.contains(Point(*(mid + nrm * 0.3))):
                along += L
                continue
            pa, pb = a + nrm * OUT, b + nrm * OUT
            za = min(z0, T(*pa) - 0.3) if z0 <= base + 0.01 else z0
            zb = min(z0, T(*pb) - 0.3) if z0 <= base + 0.01 else z0
            # one quad a storey band at most, so that the tile's v runs true through the change of storey at 14F
            cuts = sorted({z0, z1} | ({base + SHOP_TOP} if z0 < base + SHOP_TOP < z1 else set()))
            for ca, cb in zip(cuts[:-1], cuts[1:]):
                qa, qb = (za if ca == z0 else ca), (zb if ca == z0 else ca)
                U0, U1 = along / TILE_W, (along + L) / TILE_W
                geo.quad("win_scrsq", np.r_[pa, qa], np.r_[pb, qb], np.r_[pb, cb], np.r_[pa, cb], n=np.r_[nrm, 0.0],
                         uv=[(U0, tile_v(qa)), (U1, tile_v(qb)), (U1, tile_v(cb)), (U0, tile_v(cb))])
            along += L
    skin(tower[0], base + tower[2], top)
    for P, b0, m0, t0 in low:
        skin(P, b0, b0 + t0, skip=room)
    mid = tower[0].centroid
    meta = {"id": ID, "at": [round(mid.x, 2), round(mid.y, 2)], "r": 50.0, "z": round(base, 2), "glb": f"hero/{ID}.glb", "bake_gain": 0.0,
            "load_m": 900, "show_m": 950, "drop_m": 1100}
    print("game.hero:", json.dumps(meta))
    M = materials()
    return geo, A, M, meta
