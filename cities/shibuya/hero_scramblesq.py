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
from the street to the roof's deck, in one material (`win_scrsq`: hero.js win*, dark glass that mirrors the sky, its
storeys behind it drawn by the page) on a drawn tile 12 m across and eight office storeys high:

  * the colour: a blue-green glass, each 1.5 m pane its own tone within a few percent (each reflects at its own angle);
  * the normal map: each pane tilted by its own small angle (a pane's tilt is the cause of its tone), the mullions as
    fine ribs and the slab's spandrel as a recessed band;
  * the frit: white on the outer face, dense at the spandrel and thinning up the pane (its millimetre dots drawn as
    what they add up to);
  * the joints: every pane's mullion, and every second one heavier, stepping 0.75 m along at each floor.

After dark the storeys behind the glass are drawn by the page, not in the tile (meta "offices", web/interior.js offices,
docs/HERO.md "Its floors after dark"): each storey a plain room the eye's ray is traced into, a floor and a white
ceiling with rows of line luminaires, the offices', the shops', the restaurants' on 12F and 13F, the sky lobby's on 17F,
SKY GALLERY's on 45F and 46F, lit whole by its use's hours in one cool white for the whole tower. The tile's spandrel,
frit and mullions are drawn there too, in the same places, so the light stops where the tile draws a joint.

The shop floors (to 14F, about 71 m) take the same tile stretched to their storeys. The ground floor's faces round the
lobby SKY's street lift stands in (pipeline/lobby.py) are left to the lobby's own level (hero_skylobby.py).

The tower's wing outside its ring (PLATEAU's west slab over the crossing, from the street to 218 m) takes the same
skin, its faces against the tower left out.

Below 15F on the north face, the base as measured (cities/shibuya/scrsq_base.py, issue 66; docs/HERO.md, "Scramble
Square's base"): the north-west skirt and the north-east tent as curved glass in the same skin, with their aluminium
fins, and the overhang over the Urban Core's forecourt (base_glass).
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
    base = np.array([44, 82, 94.0])                      # blue-green glass (sRGB)
    yy, xx = np.mgrid[0:H, 0:W]
    for r in range(ROWS):
        y1, y0 = H - int(round(r * STOREY * py_m)), H - int(round((r + 1) * STOREY * py_m))   # (image rows run down)
        shift = (r * 0.75) % (2 * PANE)
        for k in range(-1, int(TILE_W / PANE) + 1):
            xa = (k * PANE + shift) % TILE_W
            x0 = int(round(xa * px_m)); x1 = x0 + int(round(PANE * px_m))
            cols = np.arange(x0, x1) % W
            tone = 1.0 + rng.normal(0, 0.035)
            tx, ty = rng.normal(0, 0.035), rng.normal(0, 0.02)
            col[y0:y1, cols] = base * tone
            nx[y0:y1, cols] = tx; ny[y0:y1, cols] = ty
        # the spandrel at the slab: 0.55 m, recessed, fritted white, no light
        sp = int(round(0.55 * py_m))
        col[y1 - sp:y1] = np.array([70, 92, 98.0]); height[y1 - sp:y1] -= 1.0; rough[y1 - sp:y1] = 0.35
        # the frit: printed on the outer face, dense over the spandrel and thinning up the pane. Its dots are a few
        # millimetres, under a texel at any distance: drawn as what they add up to, the pane paler and duller toward its foot
        g = np.clip(((y1 - sp) - np.arange(y0, y1 - sp)) / (1.4 * py_m), 0, 1)[:, None]
        k = (1 - g) ** 1.6 * 0.45
        col[y0:y1 - sp] = col[y0:y1 - sp] * (1 - k[..., None]) + np.array([214, 220, 218.0]) * k[..., None]
        rough[y0:y1 - sp] = rough[y0:y1 - sp] * (1 - k) + 0.4 * k
        # the joints: every pane's mullion, and every second one heavier, stepping at each floor
        for k in range(int(TILE_W / PANE) + 1):
            xm = ((k * PANE + shift) % TILE_W) * px_m
            wpx = 3 if k % 2 == 0 else 2
            cols = (np.arange(int(xm) - wpx // 2, int(xm) + (wpx + 1) // 2)) % W
            col[y0:y1, cols] = np.array([38, 44, 48.0]); height[y0:y1, cols] += 1.2; rough[y0:y1, cols] = 0.3
    return col, nx, ny, height, rough


def drawn(d):
    """The tile's surface set (hero_kit.register): Color, NormalGL (each pane's tilt and the ribs), Roughness."""
    from PIL import Image
    col, nx, ny, height, rough = _tile()
    gx = (np.roll(height, -1, 1) - np.roll(height, 1, 1)) * 0.5
    gy = (np.roll(height, 1, 0) - np.roll(height, -1, 0)) * 0.5
    n = np.dstack([nx - gx * 0.6, ny - gy * 0.6, np.ones_like(nx)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    os.makedirs(d, exist_ok=True)
    Image.fromarray(np.clip(col, 0, 255).astype(np.uint8), "RGB").save(os.path.join(d, "Color.png"))
    Image.fromarray(np.clip((n * 0.5 + 0.5) * 255, 0, 255).astype(np.uint8), "RGB").save(os.path.join(d, "NormalGL.png"))
    Image.fromarray(np.clip(rough * 255, 0, 255).astype(np.uint8), "L").save(os.path.join(d, "Roughness.png"))


def materials():
    return {
        # dark glass mirroring the sky (sky 0.9: up the tower it sees the sky, not a street); its storeys after dark are
        # the page's (meta "offices": web/interior.js), so it carries no light of its own
        "win_scrsq": {"tex": "scrsq", "maps": "cnr", "metal": 0.85, "rough": 0.06, "sky": 0.9},
        # the base's skirts: the aluminium fins on the curved glass (KKAA: 250, 400 and 550 mm deep, graded across it),
        # a light anodised silver; and the skirts' undersides at 4F, the same metal in its shade
        "alu_fin": {"color": (0.62, 0.64, 0.66), "rough": 0.32, "metal": 0.9, "sky": 0.6},
        "alu_soffit": {"color": (0.34, 0.35, 0.36), "rough": 0.4, "metal": 0.8, "sky": 0.3},
    }


# What each of the tile's storeys is (storey 0 is 1F; the tile's storeys are the real ones from 17F, at 84 m, up):
# shops to 11F, restaurants on 12F and 13F, SHIBUYA SKY's counter on 14F, QWS on 15F, the sky lobby on 17F, offices to
# 44F, SKY GALLERY on 45F and 46F, plant over it (the official floor guide; docs/HERO.md)
FLOORS = [[0, 10, "shop"], [11, 12, "dining"], [13, 13, "shop"], [14, 15, "office"], [16, 16, "lobby"], [17, 43, "office"],
          [44, 45, "gallery"], [46, 60, "plant"]]


def offices(base):
    """The storeys behind the skin, for the page to draw after dark (web/interior.js offices): where they are in the
    tile's storey coordinate (as tile_v lays it), the tile's own spandrel, frit and joints in the same places, and each
    storey's use."""
    return {"base": round(base, 2), "shop_top": SHOP_TOP, "shop_storey": SHOP_STOREY, "storey": STOREY,
            "spandrel": round(0.55 / STOREY, 4), "frit": round(1.4 / STOREY, 4), "tile": TILE_W, "rows": ROWS, "pane": PANE,
            "shift": 0.75, "mullion": 0.06, "trans": 0.55, "busy": 1.15, "floors": FLOORS}


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


def _loft(geo, mat, rows, uvs, hint):
    """A smooth surface through rows of points (each row the same count, bottom to top): its normals from the grid,
    facing `hint` (a horizontal vector out of the building)."""
    R = np.asarray(rows, float)
    nz, nx = R.shape[0], R.shape[1]
    du = np.gradient(R, axis=1)
    dv = np.gradient(R, axis=0)
    N = np.cross(du, dv)
    flip = float(np.sum(N[..., :2] * np.asarray(hint)[:2])) < 0
    if flip:
        N = -N
    N /= np.maximum(np.linalg.norm(N, axis=2, keepdims=True), 1e-9)
    P = R.reshape(-1, 3)
    tri = []
    for j in range(nz - 1):
        for i in range(nx - 1):
            k = j * nx + i
            a, b, c, d = k, k + 1, k + nx + 1, k + nx
            tri += [(a, c, b), (a, d, c)] if flip else [(a, b, c), (a, c, d)]
    geo.mesh(mat, P, tri, n=N.reshape(-1, 3), uv=np.asarray(uvs, float).reshape(-1, 2))
    return R, N.reshape(nz, nx, 3)


def _fins(geo, R, N, cols, depth):
    """Fins standing out of a lofted surface along its columns: two-sided strips `depth` deep along the normal."""
    for i, d in zip(cols, depth):
        for j in range(R.shape[0] - 1):
            a, b = R[j, i], R[j + 1, i]
            if np.linalg.norm(b - a) < 0.05:
                continue
            na, nb = N[j, i], N[j + 1, i]
            q = [a, b, b + nb * d, a + na * d]
            geo.quad("alu_fin", q[0], q[1], q[2], q[3])
            geo.quad("alu_fin", q[3], q[2], q[1], q[0])


def _slabs(geo, SB, F, base, curve, top=None):
    """Each storey's slab edge on a skirt: a dark band 0.4 m deep standing 0.1 m proud of the glass along its outline at
    the slab (the stacked soffits, the strongest lines of the skirts in every photograph)."""
    for z in SB.LEVELS:
        if z < SB.F4 - 1e-6 or z > (top or SB.F15) - 0.3:
            continue
        c = curve(z + 0.01)
        if len(c) < 2:
            continue
        P = [np.r_[F.xy(s, n), base + z] for s, n in c]
        for a, b in zip(P[:-1], P[1:]):
            d = b - a
            L = float(np.linalg.norm(d[:2]))
            if L < 0.05:
                continue
            o = np.r_[np.array([d[1], -d[0]]) / L, 0.0]
            if o[:2] @ F.n < 0 and abs(o[:2] @ F.u) < 0.9:
                o = -o
            mid = (a + b) / 2
            if (np.r_[F.sn(*mid[:2])] @ [0, 1]) < 0.05 and abs(o[:2] @ F.n) > 0.5:
                continue
            a1, b1 = a + o * 0.1, b + o * 0.1
            geo.quad("alu_soffit", a1 - [0, 0, 0.4], b1 - [0, 0, 0.4], b1, a1)
            geo.quad("alu_soffit", a1, b1, b1 - [0, 0, 0.4], a1 - [0, 0, 0.4])
            geo.quad("alu_soffit", a, b, b1, a1, n=np.array([0, 0, 1.0]))
            geo.quad("alu_soffit", a1 - [0, 0, 0.4], b1 - [0, 0, 0.4], b - [0, 0, 0.4], a - [0, 0, 0.4], n=np.array([0, 0, -1.0]))


def base_glass(geo, base, tile_v, inner):
    """The base's north face as measured (cities/shibuya/scrsq_base.py; issue 66): the north-west skirt and the
    north-east tent as curved glass through their outlines storey by storey, in the tower's own glass and its offices
    behind it after dark, with their aluminium fins; their undersides at 4F; and the overhang over the Urban Core's
    forecourt (2F to 4F) in the same skin."""
    sys.path.insert(0, HERE)
    import scrsq_base as SB
    from shapely.geometry import Polygon
    B = json.load(open(os.path.join(ROOT, "web", "data", "shibuya", "buildings.json")))
    F = SB.Face(B)
    hint = np.r_[F.n, 0.0]
    def rows_of(curves, zs):
        rows, uvs = [], []
        for c, z in zip(curves, zs):
            pts = [np.r_[F.xy(s, n), base + z] for s, n in c]
            L = np.r_[0.0, np.cumsum([np.linalg.norm(pts[k + 1][:2] - pts[k][:2]) for k in range(len(pts) - 1)])]
            rows.append(pts)
            # (u measured from the skirt's east end, where it meets the corner: the joints run down the trumpet in
            # diagonals as its girth grows)
            uvs.append([((L[-1] - l) / TILE_W, tile_v(base + z)) for l in L])
        return rows, uvs
    # the north-west skirt: from 4F to 15F, three rows a storey
    zs = []
    for a, b in zip([z for z in SB.LEVELS if z >= SB.F4 - 1e-6][:-1], [z for z in SB.LEVELS if z >= SB.F4 - 1e-6][1:]):
        zs += list(np.linspace(a, b, 4)[:-1])
    zs.append(SB.F15 - 0.02)
    curves = []
    for z in zs:
        P, s0 = SB.skirt_out(z), SB.skirt_edge(z)
        if P < 0.05:   # (at its top the skirt is the face itself, from its edge to the corner)
            curves.append([(s0 + (F.W - s0) * k / 14, 0.02) for k in range(15)])
        else:
            curves.append(SB.skirt_curve(F, z, steps=14))
    rows, uvs = rows_of(curves, zs)
    R, N = _loft(geo, "win_scrsq", rows, uvs, hint)
    _fins(geo, R, N, range(1, 14), [0.25 + 0.3 * (k / 13) ** 1.5 for k in range(1, 14)])
    _fins(geo, R, N, [0], [0.7])   # (the trim along its edge on the face, the bright line the photographs draw the sweep with)
    _slabs(geo, SB, F, base, lambda z: SB.skirt_curve(F, z, steps=14))
    # its side in the west face's plane: from the corner out to the skirt's edge, storey by storey
    for j in range(len(zs) - 1):
        za, zb = base + zs[j], base + zs[j + 1]
        pa, pb = R[j, -1], R[j + 1, -1]
        c0 = np.r_[F.xy(F.W, 0.0), za]
        c1 = np.r_[F.xy(F.W, 0.0), zb]
        if np.linalg.norm(pa[:2] - c0[:2]) < 0.05 and np.linalg.norm(pb[:2] - c1[:2]) < 0.05:
            continue
        e_out = np.r_[np.array([F.e[1], -F.e[0]]), 0.0]
        if e_out[:2] @ (F.b - F.ring.centroid.coords[0]) < 0:
            e_out = -e_out
        w0, w1 = np.linalg.norm(pa[:2] - c0[:2]) / TILE_W, np.linalg.norm(pb[:2] - c1[:2]) / TILE_W
        geo.quad("win_scrsq", c0, pa, pb, c1, n=e_out, uv=[(0, tile_v(za)), (w0, tile_v(za)), (w1, tile_v(zb)), (0, tile_v(zb))])
        geo.quad("win_scrsq", c0, c1, pb, pa, n=e_out, uv=[(0, tile_v(za)), (0, tile_v(zb)), (w1, tile_v(zb)), (w0, tile_v(za))])
    # its underside at 4F, past the overhang under it
    foot = R[0]
    m = np.r_[F.xy((SB.skirt_edge(SB.F4) + F.W) / 2, -0.2), base + SB.F4 - 0.02]
    for k in range(len(foot) - 1):
        a, b = foot[k] - [0, 0, 0.02], foot[k + 1] - [0, 0, 0.02]
        geo.mesh("alu_soffit", [m, a, b], [(0, 1, 2)], n=np.array([0, 0, -1.0]))   # (a west of b: wound to face down)
    # the north-east tent: from 4F to its point, three rows a storey
    tz = list(np.linspace(SB.F4, SB.TENT["top"] - 0.05, 10))
    tcurves = [SB.tent_curve(z, steps=7) for z in tz]
    trows, tuvs = rows_of(tcurves, tz)
    TR, TN = _loft(geo, "win_scrsq", trows, tuvs, hint)
    _fins(geo, TR, TN, range(1, len(tcurves[0]) - 1), [0.25] * (len(tcurves[0]) - 2))
    _slabs(geo, SB, F, base, lambda z: SB.tent_curve(z, steps=7), top=SB.TENT["top"])
    foot = TR[0]
    m = np.r_[F.xy((SB.TENT["s0"] + SB.TENT["s1"]) / 2, -0.2), base + SB.F4 - 0.02]
    for k in range(len(foot) - 1):
        geo.mesh("alu_soffit", [m, foot[k + 1] - [0, 0, 0.02], foot[k] - [0, 0, 0.02]], [(0, 1, 2)], n=np.array([0, 0, -1.0]))
    # the overhang over the forecourt (2F to 4F): its walls in the tower's skin (pipeline's solids, as the city has them)
    for s in B["s"]:
        if s[0] == F.bi and (s[2], s[3]) == (round(SB.OVER["z0"] * 10), round(SB.OVER["z1"] * 10)):
            P = Polygon(SB.ring_of(s)).buffer(0)
            skin_poly(geo, P, base + SB.OVER["z0"], base + SB.OVER["z1"], tile_v, skip=inner)


def skin_poly(geo, P, z0, z1, tile_v, skip=None):
    """the tower's skin on a solid's walls, z0 to z1 (a part off the ground: no foot taken down to the street)"""
    from shapely.geometry import Point
    ring = np.asarray(P.exterior.coords)[:-1]
    if not P.exterior.is_ccw:
        ring = ring[::-1]
    along = 0.0
    for i in range(len(ring)):
        a, b = ring[i], ring[(i + 1) % len(ring)]
        L = float(np.linalg.norm(b - a))
        if L < 0.2:
            continue
        tv = (b - a) / L
        nrm = np.array([tv[1], -tv[0]])
        mid = (a + b) / 2
        if skip is not None and skip.contains(Point(*(mid + nrm * 0.3))):
            along += L
            continue
        pa, pb = a + nrm * OUT, b + nrm * OUT
        U0, U1 = along / TILE_W, (along + L) / TILE_W
        geo.quad("win_scrsq", np.r_[pa, z0], np.r_[pb, z0], np.r_[pb, z1], np.r_[pa, z1], n=np.r_[nrm, 0.0],
                 uv=[(U0, tile_v(z0)), (U1, tile_v(z0)), (U1, tile_v(z1)), (U0, tile_v(z1))])
        along += L


def build(K):
    from shapely.geometry import Point, Polygon
    sys.path.insert(0, os.path.join(ROOT, "blender"))
    import hero_open as HP
    from lobby import room_of
    K.register("scrsq", TILE_W, drawn)
    geo, A = K.Geo(), K.Atlas(64, 64)   # (no atlas: the skin's one material is its drawn tile)
    T = HP.Ground("shibuya")
    G = json.load(open(os.path.join(ROOT, "web", "data", "shibuya", "game.json")))
    stop = next(l for l in G["lifts"] if l["id"] == "sky-gate")["stops"][0]
    room = None if stop["lobby"].get("outside") else room_of(stop, stop["lobby"], grow=0.3)   # (a lobby cut into it is the lobby level's to draw)
    solids = _rings()
    # the tower: the largest solid that reaches the top; its lower part: the solid of the same foot under it
    tower = max((s for s in solids if s[3] > 200), key=lambda s: s[0].area)
    low = [s for s in solids if s[2] == 0 and s[3] <= tower[2] + 0.1 and s[0].area > 0.5 * tower[0].area]
    # and a wing of it outside the tower's ring, standing from the street nearly to the top (PLATEAU's west slab over the
    # crossing, 218 m): the same glass, or the face the crossing sees was the city's generic wall, dark among lit floors
    wings = [s for s in solids if s is not tower and s[3] > 100 and s[0].difference(tower[0]).area > 0.5 * s[0].area]
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
    inner = tower[0].buffer(0.5) if room is None else tower[0].buffer(0.5).union(room)
    for P, b0, m0, t0 in wings:   # (its faces against the tower are inside: skipped)
        skin(P, base if m0 == 0 else b0 + m0, b0 + t0, skip=inner)
    base_glass(geo, base, tile_v, inner)
    mid = tower[0].centroid
    meta = {"id": ID, "at": [round(mid.x, 2), round(mid.y, 2)], "r": 50.0, "z": round(base, 2), "glb": f"hero/{ID}.glb", "bake_gain": 0.0,
            "load_m": 900, "show_m": 950, "drop_m": 1100, "offices": offices(base)}
    print("game.hero:", json.dumps(meta))
    M = materials()
    return geo, A, M, meta
