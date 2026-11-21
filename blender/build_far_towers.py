"""The far skyline's two towers as cards: Tokyo Tower and TOKYO SKYTREE (web/farcity.js; docs/LOOK.md, "The far skyline").

From the Scramble Tokyo Tower stands 4.1 km east and the Skytree 11 km north-east: in a frame of the story they are a
hundred pixels tall at most, their lattices finer than a pixel. A model of either at that distance is a shimmer of thin
members; a games' far landmark is an impostor instead, the model drawn once, finely, into a picture with its own
transparency, its mipmaps the lattice's true coverage at every distance. Each tower is modelled here and drawn, square on
and orthographic, into:

  <id>.webp        its colour by day (in sRGB) and its coverage (alpha), lit by an even sky and a high sun;
  <id>_low.webp, <id>_night_low.webp  the same at a quarter of the size, for a phone;
  <id>_night.webp  what lights it after dark: r its lattice's floodlight (Tokyo Tower's Landmark Light from the feet and
                   the main deck, Skytree's LEDs up its lattice), g its decks' windows and lamps, b Skytree's core
                   (the page tints each: orange or white by the season, Iki's blue or Miyabi's purple by the day).

The towers (published figures; the lattices are approximations of the published outlines):

  Tokyo Tower  333 m, a square base 80 m a side, main deck at 150 m, top deck at 250 m, International Orange and white
               in seven bands. The lattice is the one Open Earth 3D modelled (its cities/tokyo/city.py, kept in the
               repository Blue Hour was split from), drawn here whole.
  Skytree      634 m (Nikken Sekkei, 2012), a triangle 68 m a side at the foot turning to a circle by 320 m, the Tembo
               Deck 340 to 350 m, the Tembo Galleria 445 to 451 m, the gain tower over 497 m; a lattice of white steel
               tubes ("Skytree White", a pale indigo white) round the concrete core (shinbashira) to 375 m.

    python blender/build_far_towers.py        # (pip install bpy==5.2.3): web/assets/far/*.webp and far.json
"""
import json
import math
import os
import sys

import bpy
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "web", "assets", "far")
TMP = os.path.join(ROOT, "data", "raw", "far_towers")


class Boxes:
    """Boxes along segments, one list of vertices and quads a material."""

    def __init__(self):
        self.v, self.f = [], []

    def box(self, p0, p1, w, h, up=(0.0, 0.0, 1.0)):
        p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
        d = p1 - p0
        L = np.linalg.norm(d)
        if L < 1e-4:
            return
        d /= L
        u = np.asarray(up, float)
        if abs(np.dot(u, d)) > 0.95:
            u = np.array([1.0, 0.0, 0.0]) if abs(d[0]) < 0.9 else np.array([0.0, 1.0, 0.0])
        a = np.cross(d, u); a /= np.linalg.norm(a)
        b = np.cross(a, d)
        a, b = a * w / 2, b * h / 2
        k = len(self.v)
        for p in (p0, p1):
            for sa, sb in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                self.v.append(tuple(p + sa * a + sb * b))
        for i in range(4):
            j = (i + 1) % 4
            self.f.append((k + i, k + j, k + 4 + j, k + 4 + i))
        self.f.append((k + 3, k + 2, k + 1, k)); self.f.append((k + 4, k + 5, k + 6, k + 7))

    def cylinder(self, z0, z1, r, n=32, r1=None):
        r1 = r if r1 is None else r1
        k = len(self.v)
        for z, rr in ((z0, r), (z1, r1)):
            for i in range(n):
                t = 2 * math.pi * i / n
                self.v.append((rr * math.cos(t), rr * math.sin(t), z))
        for i in range(n):
            j = (i + 1) % n
            self.f.append((k + i, k + j, k + n + j, k + n + i))
        self.f.append(tuple(k + i for i in reversed(range(n)))); self.f.append(tuple(k + n + i for i in range(n)))


# ---------------------------------------------------------------- Tokyo Tower (after Open Earth 3D's)

def tokyo_tower():
    base, top_half, top_z = 80.0, 4.0, 250.0
    H = lambda z: top_half + (base / 2 - top_half) * (1 - min(max(z / top_z, 0.0), 1.0)) ** 1.7
    M = {k: Boxes() for k in ("orange", "white", "deck", "glass", "shaft")}
    band = lambda z: "white" if int(z // 47.6) % 2 else "orange"
    corners = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
    DECK = 140.0
    q = lambda z: 0.9 + 4.6 * max(0.0, 1 - z / DECK) ** 1.25
    node = lambda c, dx, dy, z: (c[0] * H(z) + dx * q(z), c[1] * H(z) + dy * q(z), z)
    zs = [0, 8, 16, 24, 33, 43, 54, 66, 79, 93, 108, 124, 140]
    for i, (lo, hi) in enumerate(zip(zs[:-1], zs[1:])):
        m = M[band((lo + hi) / 2)]
        w = 0.95 - 0.45 * lo / DECK
        for c in corners:
            sq = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
            for j, (dx, dy) in enumerate(sq):
                ex, ey = sq[(j + 1) % 4]
                m.box(node(c, dx, dy, lo), node(c, dx, dy, hi), w, w)
                m.box(node(c, dx, dy, hi), node(c, ex, ey, hi), w * 0.55, w * 0.55)
                A, B = ((dx, dy), (ex, ey)) if (i + j) % 2 else ((ex, ey), (dx, dy))
                m.box(node(c, *A, lo), node(c, *B, hi), w * 0.4, w * 0.4)
                m.box(node(c, *B, lo), node(c, *A, hi), w * 0.4, w * 0.4)
        for k in range(4):
            cA, cB = corners[k], corners[(k + 1) % 4]
            d = ((cB[0] - cA[0]) // 2, (cB[1] - cA[1]) // 2)
            o = ((cA[0] + cB[0]) // 2, (cA[1] + cB[1]) // 2)
            for pl in (1, -1):
                nA = lambda z: node(cA, d[0] + o[0] * pl, d[1] + o[1] * pl, z)
                nB = lambda z: node(cB, -d[0] + o[0] * pl, -d[1] + o[1] * pl, z)
                if hi >= 24:
                    m.box(nA(hi), nB(hi), w * 0.7, w * 0.9)
                if lo >= 24:
                    for p0, p1 in ((nA(lo), nB(hi)), (nB(lo), nA(hi))):
                        m.box(p0, p1, w * 0.45, w * 0.45)
                if lo == 8:   # the arch between the feet, from each leg at 8 m to its crown under the first girder
                    pa, pb = np.asarray(nA(8.0)), np.asarray(nB(8.0))
                    ga, gb = np.asarray(nA(24.0)), np.asarray(nB(24.0))
                    pts = []
                    for j in range(15):
                        s = j / 14
                        b0 = pa + (pb - pa) * s
                        t0 = ga + (gb - ga) * s
                        pts.append(tuple(b0 + (t0 - b0) * (1 - (2 * s - 1) ** 2) * (14.5 / 16.0)))
                    for p0, p1 in zip(pts, pts[1:]):
                        m.box(p0, p1, 0.75, 0.9)
    zs2 = [150, 163, 177, 192, 208, 224, 239, 250]
    for lo, hi in zip(zs2[:-1], zs2[1:]):
        m = M[band((lo + hi) / 2)]
        h0, h1 = H(lo), H(hi)
        for k in range(4):
            (sx, sy), (tx, ty) = corners[k], corners[(k + 1) % 4]
            m.box((sx * h0, sy * h0, lo), (sx * h1, sy * h1, hi), 0.55, 0.55)
            m.box((sx * h1, sy * h1, hi), (tx * h1, ty * h1, hi), 0.39, 0.39)
            m.box((sx * h0, sy * h0, lo), (tx * h1, ty * h1, hi), 0.28, 0.28)
            m.box((tx * h0, ty * h0, lo), (sx * h1, sy * h1, hi), 0.28, 0.28)
    M["shaft"].box((0, 0, 18.0), (0, 0, DECK), 6.0, 6.0)
    for z0, z1, hw in ((140.0, 150.0, 13.0), (239.0, 250.0, 7.0)):
        M["deck"].box((0, 0, z0), (0, 0, z0 + 2), 2 * hw + 3, 2 * hw + 3)
        M["glass"].box((0, 0, z0 + 2), (0, 0, z1), 2 * hw, 2 * hw)
        M["deck"].box((0, 0, z1), (0, 0, z1 + 1.2), 2 * hw + 2, 2 * hw + 2)
    for lo, hi, w in ((250, 270, 5.0), (270, 290, 3.8), (290, 310, 2.8), (310, 333, 1.6)):
        (M["white"] if int(lo // 20) % 2 else M["orange"]).box((0, 0, lo), (0, 0, hi), w, w)
    mats = {"orange": ((0.91, 0.33, 0.11), 0.55), "white": ((0.945, 0.937, 0.914), 0.55), "deck": ((0.79, 0.78, 0.74), 0.6),
            "glass": ((0.16, 0.19, 0.22), 0.15), "shaft": ((0.3, 0.31, 0.33), 0.6)}
    # what lights it: the lattice (r), the decks' windows (g)
    night = {"orange": (1, 0, 0), "white": (1, 0, 0), "deck": (0.6, 0.3, 0), "glass": (0, 1, 0), "shaft": (0, 0, 0)}
    return M, mats, night, {"height": 333.0, "half_width": 48.0}


# ---------------------------------------------------------------- TOKYO SKYTREE

def skytree():
    M = {k: Boxes() for k in ("lattice", "core", "deck", "glass", "gain")}
    R0 = 68.0 / math.sqrt(3)            # the foot's triangle: its corners' radius

    def radius(z):
        """The lattice's corner radius at height z: the triangle's at the foot, drawn in (a sori: the curve of a
        Japanese sword's back) to the Tembo Deck's shaft, narrower still to the gain tower's foot."""
        if z <= 350:
            return 17.0 + (R0 - 17.0) * (1 - z / 350.0) ** 1.35
        if z <= 497:
            return 17.0 - 7.5 * (z - 350) / 147.0
        return 9.5

    def ring(z, n):
        """n points round the plan at z: a triangle's at the foot, a circle's from 320 m (corners at 90, 210, 330)."""
        k = min(1.0, z / 320.0) ** 0.9
        R = radius(z)
        pts = []
        for i in range(n):
            t = 2 * math.pi * i / n + math.pi / 2
            # the triangle's radius at this angle (its corners at R)
            a = (t - math.pi / 2) % (2 * math.pi / 3) - math.pi / 3
            rt = R * math.cos(math.pi / 3) / math.cos(a)
            r = rt * (1 - k) + R * 0.93 * k
            pts.append((r * math.cos(t), r * math.sin(t), z))
        return pts

    N = 36
    levels = list(np.arange(0.0, 497.0, 11.0)) + [497.0]
    rings = [ring(z, N) for z in levels]
    for li in range(len(levels) - 1):
        z0 = levels[li]
        w = 1.6 - 0.9 * z0 / 497.0
        A, B = rings[li], rings[li + 1]
        for i in range(N):
            j = (i + 1) % N
            if i % 3 == 0:
                M["lattice"].box(A[i], B[i], w * 1.3, w * 1.3)                    # a column
            M["lattice"].box(B[i], B[j], w * 0.6, w * 0.6)                        # the ring
            if (i + li) % 2 == 0:
                M["lattice"].box(A[i], B[j], w * 0.55, w * 0.55)                  # the diagonal grid
            else:
                M["lattice"].box(A[j], B[i], w * 0.55, w * 0.55)
    # the three great legs at the triangle's corners, to where the plan is round
    for c in range(3):
        t = math.pi / 2 + c * 2 * math.pi / 3
        pts = [(radius(z) * math.cos(t), radius(z) * math.sin(t), z) for z in np.arange(0, 330, 11.0)]
        for p0, p1 in zip(pts, pts[1:]):
            M["lattice"].box(p0, p1, 3.4, 3.4)
    M["core"].cylinder(0, 375, 4.0, 20)
    # the Tembo Deck and the Tembo Galleria: glass bands between their floors' white slabs
    for z0, z1, r in ((338.0, 352.0, 23.0), (444.0, 452.0, 16.5)):
        M["deck"].cylinder(z0 - 1.5, z0, r + 1.0, 48)
        M["glass"].cylinder(z0, z1, r, 48)
        M["deck"].cylinder(z1, z1 + 2.0, r + 0.8, 48, r1=r * 0.7)
    # the gain tower: a lattice mast tapering to the tip
    for lo, hi, r0, r1 in ((497, 560, 4.6, 3.6), (560, 610, 3.6, 2.4), (610, 634, 2.4, 0.6)):
        M["gain"].cylinder(lo, hi, r0, 16, r1=r1)
    white = (0.90, 0.925, 0.94)
    mats = {"lattice": (white, 0.45), "core": ((0.62, 0.62, 0.6), 0.8), "deck": ((0.88, 0.9, 0.9), 0.5),
            "glass": ((0.14, 0.17, 0.2), 0.12), "gain": (white, 0.45)}
    night = {"lattice": (1, 0, 0), "core": (0, 0, 1), "deck": (0.5, 0.4, 0), "glass": (0, 1, 0), "gain": (0.7, 0, 0)}
    return M, mats, night, {"height": 634.0, "half_width": 40.0}


# ---------------------------------------------------------------- the pictures

def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def build_scene(M, mats, mode):
    """mode 'day': its colours; 'r', 'g', 'b': white where that light falls, black elsewhere (and nothing lit)."""
    for k, B in M.items():
        if not B.v:
            continue
        me = bpy.data.meshes.new(k)
        me.from_pydata(B.v, [], B.f)
        me.update()
        ob = bpy.data.objects.new(k, me)
        bpy.context.scene.collection.objects.link(ob)
        mt = bpy.data.materials.new(k)
        mt.use_nodes = True
        nt = mt.node_tree
        bs = nt.nodes["Principled BSDF"]
        col, rough = mats[k][0], mats[k][1]
        if mode == "day":
            bs.inputs["Base Color"].default_value = (*col, 1)
            bs.inputs["Roughness"].default_value = rough
        else:
            bs.inputs["Base Color"].default_value = (0, 0, 0, 1)
            bs.inputs["Specular IOR Level"].default_value = 0.0
            v = mats[k][2][mode]
            bs.inputs["Emission Color"].default_value = (1, 1, 1, 1)
            bs.inputs["Emission Strength"].default_value = float(v)
        me.materials.append(mt)


def render(M, mats, night, dims, path, mode, px_h):
    clear()
    sc = bpy.context.scene
    for k in M:
        mats[k] = (mats[k][0], mats[k][1], {"r": night[k][0], "g": night[k][1], "b": night[k][2]})
    build_scene(M, mats, mode)
    H, hw = dims["height"], dims["half_width"]
    px_w = int(round(px_h * (2 * hw) / H / 8)) * 8
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = 48 if mode == "day" else 16
    sc.cycles.use_denoising = False
    sc.render.resolution_x, sc.render.resolution_y = px_w, px_h
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.view_settings.view_transform = "Standard"
    cam = bpy.data.cameras.new("cam")
    cam.type = "ORTHO"
    cam.ortho_scale = H   # (the longer side)
    co = bpy.data.objects.new("cam", cam)
    sc.collection.objects.link(co)
    co.location = (0.0, -2000.0, H / 2)
    co.rotation_euler = (math.pi / 2, 0.0, 0.0)
    cam.clip_end = 5000.0
    sc.camera = co
    w = bpy.data.worlds.new("w")
    sc.world = w
    w.use_nodes = True
    bg = w.node_tree.nodes["Background"]
    if mode == "day":
        # an even sky and a sun from the upper left, so the lattice has a lit side and a shaded one
        bg.inputs["Color"].default_value = (0.55, 0.63, 0.75, 1)
        bg.inputs["Strength"].default_value = 0.5
        sun = bpy.data.lights.new("sun", "SUN")
        sun.energy = 2.0
        so = bpy.data.objects.new("sun", sun)
        sc.collection.objects.link(so)
        so.rotation_euler = (math.radians(45), 0.0, math.radians(-55))
    else:
        bg.inputs["Strength"].default_value = 0.0
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return px_w


def main():
    from PIL import Image
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(TMP, exist_ok=True)
    meta = {}
    for tid, make, px_h in (("tokyo_tower", tokyo_tower, 2048), ("skytree", skytree, 2048)):
        M, mats, night, dims = make()
        base = {k: (v[0], v[1]) for k, v in mats.items()}
        paths = {}
        for mode in ("day", "r", "g", "b"):
            p = os.path.join(TMP, f"{tid}_{mode}.png")
            px_w = render(M, dict(base), night, dims, p, mode, px_h)
            paths[mode] = p
        day = Image.open(paths["day"]).convert("RGBA")
        day.save(os.path.join(OUT, f"{tid}.webp"), quality=92, method=6)
        ch = [np.asarray(Image.open(paths[m]).convert("RGB"), float)[..., 0] for m in ("r", "g", "b")]
        n = np.clip(np.dstack(ch), 0, 255).astype(np.uint8)
        night_im = Image.fromarray(n, "RGB")
        night_im.save(os.path.join(OUT, f"{tid}_night.webp"), quality=92, method=6)
        # a phone.s: a quarter of the size (a hundred pixels on its screen at most), the colour averaged with its coverage
        # (premultiplied) so the lattice keeps its edge
        a = np.asarray(day, float) / 255.0
        pm = Image.fromarray(np.clip(np.dstack([a[..., :3] * a[..., 3:], a[..., 3:]]) * 255, 0, 255).astype(np.uint8), "RGBA")
        lo = np.asarray(pm.resize((px_w // 4, px_h // 4), Image.BOX), float) / 255.0
        al = np.maximum(lo[..., 3:], 1e-4)
        lo = np.dstack([np.where(lo[..., 3:] > 0, lo[..., :3] / al, 0), lo[..., 3:]])
        Image.fromarray(np.clip(lo * 255, 0, 255).astype(np.uint8), "RGBA").save(os.path.join(OUT, f"{tid}_low.webp"), quality=90, method=6)
        night_im.resize((px_w // 4, px_h // 4), Image.BOX).save(os.path.join(OUT, f"{tid}_night_low.webp"), quality=90, method=6)
        meta[tid] = {"height": dims["height"], "width": round(2 * dims["half_width"], 2), "px": [px_w, px_h],
                     "picture": f"far/{tid}.webp", "night": f"far/{tid}_night.webp",
                     "low": f"far/{tid}_low.webp", "night_low": f"far/{tid}_night_low.webp"}
        print(f"{tid}: {px_w} x {px_h}, {sum(len(b.f) for b in M.values())} faces")
    json.dump(meta, open(os.path.join(OUT, "far.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
