"""Build what only the camera sees: web/assets/past/past.glb (web/game/past.js, a story frame's `relic`).

The story's camera sees the evening it was loaded for. Through its finder, things of 1964 that are gone from the
street stand where they stood; each is what a frame's photograph is of, and a piece of the case. What each is drawn
from (photographs, measures) is in docs/PAST.md.

  board     the planetarium's standing signboard (tate-kanban) for the evening's show: a night sky with the dome
            under it, and the title lettered down it, 五島プラネタリウム, 今夜の星空, the date and the hour
  postbox   the round red pillar box (Post Office type 1, 1949): its flared cap, the slot under it, the times plate
  umbrella  a black umbrella, open, set down on its rim to dry
  shoeshine a shoeshine boy's box with its foot-rest, his stool and a tin of polish
  tram      the Tamagawa line's type 200 (Pekochan, 1955-69): two bodies on three bogies, light green with a cream
            band, rounded faces, a pantograph on the wire, 渋谷 in the destination box; at its stop on its rails
  lamp      the red globe of a police box on its iron bracket, and the box's name plate
  dome      Tokyu Bunka Kaikan (1956), east of the station, with the Gotoh Planetarium's dome on its roof, 五島
            プラネタリウム round the drum and the four film hoardings on the face towards the station; its origin is
            the dome's foot on the roof, the building goes down 32 m under it
  river     the Shibuya River open between its stone walls, three metres down, Miyamasu Bridge over it with its
            parapets and newel posts, and the culvert mouth beyond where it went under the Toyoko store; origin on
            the river's line at street level, ten metres upstream of the bridge's middle

Each is life size in metres, stands on the ground at its origin, +Z up, its front towards -Y, and carries its colour
in its vertices; the page draws them in the tones of an old print, inside the finder only. Lettering is the system's
CJK fonts turned to mesh (Hiragino on a Mac, Noto CJK elsewhere).

    blender -b -P blender/build_past.py                  # or: pip install bpy==5.2.3; python blender/build_past.py
    blender -b -P blender/build_past.py -- --preview DIR # also render a still of each into DIR
    python blender/build_past.py --only dome,river       # build these and keep the others in the file as they are
    python blender/build_past.py --only dome,river --view DIR   # the two sites as their frames see them, and no file
"""
import math
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_stop import ROOT, compress, grid_faces, hexc, join, lin, make, mix  # noqa: E402

OUT = os.path.join(ROOT, "web", "assets", "past")
INK, PAPER, RED = hexc(0x1c1a17), hexc(0xece2c6), hexc(0xb3261e)


# ---- shapes -------------------------------------------------------------------------------------------------------

def flat(ob):
    for p in ob.data.polygons:
        p.use_smooth = False
    return ob


def box(x0, y0, z0, x1, y1, z1, col, name="b", rot=0.0, at=(0, 0, 0)):
    V = np.array([(x, y, z) for z in (z0, z1) for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))], float)
    c, s = math.cos(rot), math.sin(rot)
    V = np.c_[V[:, 0] * c - V[:, 1] * s + at[0], V[:, 0] * s + V[:, 1] * c + at[1], V[:, 2] + at[2]]
    F = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
    return flat(make(name, V, F, np.tile(col, (8, 1))))


def lathe(profile, seg=20, name="l", at=(0, 0, 0), smooth=True):
    """profile: [(radius, z, colour)] from the bottom up; closed at both ends."""
    V, C = [], []
    for r, z, c in profile:
        for k in range(seg):
            a = k / seg * 2 * math.pi
            V.append((math.cos(a) * r + at[0], math.sin(a) * r + at[1], z + at[2]))
            C.append(c)
    n = len(V)
    ob = make(name, np.array(V), grid_faces(len(profile), seg, wrap=True) + [tuple(range(seg - 1, -1, -1)), tuple(range(n - seg, n))], np.array(C))
    return ob if smooth else flat(ob)


def quads(name, Q, alpha=None):
    """A mesh of polygons that share no vertices, each one colour: Q is [(points, colour)]. Bands of colour stay
    crisp (a shared vertex would blend its neighbours), and a flat panel is lit as a flat panel."""
    V, F, C = [], [], []
    for pts, col in Q:
        n = len(V)
        V += [tuple(p) for p in pts]
        F.append(tuple(range(n, n + len(pts))))
        C += [col] * len(pts)
    ob = flat(make(name, np.array(V, float), F, np.array(C, float)))
    if alpha is not None:
        set_alpha(ob, [alpha(v) for v in V])
    return ob


def set_alpha(ob, A):
    att = ob.data.color_attributes["Col"]
    col = np.zeros(len(A) * 4)
    att.data.foreach_get("color", col)
    col = col.reshape(len(A), 4)
    col[:, 3] = A
    att.data.foreach_set("color", col.ravel())


def rect(x0, z0, x1, z1, y, col):
    """A flat panel facing -Y."""
    return ([(x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)], col)


def disc(cx, cz, r, y, col, a0=0.0, a1=2 * math.pi, seg=24):
    """A fan facing -Y (a half disc with a0=0, a1=pi)."""
    pts = [(cx + math.cos(a0 + (a1 - a0) * k / seg) * r, y, cz + math.sin(a0 + (a1 - a0) * k / seg) * r) for k in range(seg + 1)]
    return [([(cx, y, cz), pts[k], pts[k + 1]][::-1], col) for k in range(seg)]


def star(cx, cz, r, y, col):
    """A four-pointed star, as a sign-painter draws one."""
    pts = []
    for k in range(8):
        a = k / 8 * 2 * math.pi + math.pi / 2
        rr = r if k % 2 == 0 else r * 0.28
        pts.append((cx + math.cos(a) * rr, y, cz + math.sin(a) * rr))
    return [([(cx, y, cz), pts[(k + 1) % 8], pts[k]], col) for k in range(8)]


def line(x0, z0, x1, z1, w, y, col):
    dx, dz = x1 - x0, z1 - z0
    l = math.hypot(dx, dz) or 1
    nx, nz = -dz / l * w / 2, dx / l * w / 2
    return ([(x0 - nx, y, z0 - nz), (x0 + nx, y, z0 + nz), (x1 + nx, y, z1 + nz), (x1 - nx, y, z1 - nz)][::-1], col)


def blob(rx, ry, at=(0, 0), dark=0.6, name="shadow"):
    """What a thing puts on the ground under it: a soft dark patch, densest in the middle and gone at its edge."""
    seg, rings = 24, [(0.0, dark), (0.45, dark * 0.85), (0.78, dark * 0.4), (1.0, 0.0)]
    V, A = [], []
    for r, al in rings:
        for k in range(seg):
            t = k / seg * 2 * math.pi
            V.append((at[0] + math.cos(t) * rx * max(r, 0.02), at[1] + math.sin(t) * ry * max(r, 0.02), 0.035))
            A.append(al)
    ob = make(name, np.array(V), grid_faces(len(rings), seg, wrap=True) + [tuple(range(seg - 1, -1, -1))], np.tile(hexc(0x05060a), (len(V), 1)))
    set_alpha(ob, A)
    return ob


def place(ob, rx=0.0, rz=0.0, at=(0, 0, 0)):
    """Turn an object about X then Z (radians) and move it, applying both to its mesh."""
    ob.rotation_euler = (rx, 0, rz)
    ob.location = at
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True)
    return ob


# ---- lettering ----------------------------------------------------------------------------------------------------

FONTS = {  # (first found wins: a Mac's Hiragino, then Noto CJK as Linux distributions ship it)
    "gothic": ["/System/Library/Fonts/ヒラギノ角ゴシック W8.ttc", "/usr/share/fonts/opentype/noto/NotoSansCJK-Black.ttc", "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"],
    "medium": ["/System/Library/Fonts/ヒラギノ角ゴシック W6.ttc", "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"],
    "maru": ["/System/Library/Fonts/ヒラギノ丸ゴ ProN W4.ttc", "/usr/share/fonts/opentype/noto/NotoSansCJK-Medium.ttc"],
    "mincho": ["/System/Library/Fonts/ヒラギノ明朝 ProN.ttc", "/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc"],
}
EM = 0.6  # (a full-width glyph at a Blender text size of 1 is this tall)
_fonts = {}


def font(kind):
    if kind not in _fonts:
        path = next((p for p in FONTS[kind] if os.path.exists(p)), None)
        if not path:
            sys.exit(f"build_past: no CJK font for {kind}; looked for {FONTS[kind]}")
        _fonts[kind] = bpy.data.fonts.load(path)
    return _fonts[kind]


def glyphs(s, size, kind):
    """The text s set in one line, as flat triangles in XY centred on the origin, size metres to the em."""
    cu = bpy.data.curves.new("t", "FONT")
    cu.body, cu.font, cu.size, cu.align_x, cu.align_y, cu.resolution_u = s, font(kind), size / EM, "CENTER", "CENTER", 2
    ob = bpy.data.objects.new("t", cu)
    bpy.context.collection.objects.link(ob)
    me = ob.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh()
    V = np.array([v.co[:] for v in me.vertices], float).reshape(-1, 3)
    F = [tuple(p.vertices) for p in me.polygons]
    bpy.data.objects.remove(ob)
    return V[:, :2], F


def letters(s, size, col, kind="gothic", at=(0, 0, 0), vertical=False, track=1.0, name="text"):
    """Lettering on a plane facing -Y: centred on at (x, y, z), or down from at in a column when vertical (the long
    vowel mark stood upright, as it is written down a page). Returns a list of objects."""
    obs = []
    chars = list(s) if vertical else [s]
    for i, c in enumerate(chars):
        if c == " ":
            continue
        P, F = glyphs(c, size, kind)
        if vertical and c in "ー〜":
            P = P[:, ::-1] * np.array([1, -1])
        cz = at[2] - (i + 0.5) * size * track if vertical else at[2]
        V = np.c_[at[0] + P[:, 0], np.full(len(P), at[1]), cz + P[:, 1]]
        ob = flat(make(name, V, F, np.tile(col, (len(V), 1))))
        obs.append(ob)
    return obs


def ring_letters(s, size, col, r, z, centre, kind="gothic", name="text"):
    """Lettering round a drum of radius r, read from outside, its middle at the angle centre (radians)."""
    obs, step = [], size * 1.08 / r
    for i, c in enumerate(s):
        a = centre + (i - (len(s) - 1) / 2) * step  # (seen from outside, a greater angle is further to the reader's right)
        P, F = glyphs(c, size, kind)
        ux, uy = -math.sin(a), math.cos(a)  # (the tangent, pointing to the reader's right)
        ox, oy = math.cos(a) * r, math.sin(a) * r
        V = np.c_[ox + ux * P[:, 0], oy + uy * P[:, 0], z + P[:, 1]]
        obs.append(flat(make(name, V, [f for f in F], np.tile(col, (len(V), 1)))))
    return obs


# ---- the things ---------------------------------------------------------------------------------------------------

def board():
    """A planetarium's tate-kanban as the 1960s lettered them: a tall board on two legs under a little gable roof,
    a night sky painted across its head with the dome under its stars, and the title brushed down the paper in
    columns, the evening's in red."""
    wood, dark, roofc, night, pale, dome_c, gold = hexc(0x7c5e40), hexc(0x4a3828), hexc(0x34302c), hexc(0x1e2b57), hexc(0xf1e7c8), hexc(0xcfd2cb), hexc(0xe8c76a)
    parts = []
    for x in (-0.33, 0.33):  # its legs and feet
        parts.append(box(x - 0.024, -0.02, 0, x + 0.024, 0.03, 1.96, dark))
        parts.append(box(x - 0.03, -0.24, 0, x + 0.03, 0.26, 0.06, dark))
    parts.append(box(-0.33, 0.0, 0.33, 0.33, 0.024, 1.87, wood))                      # the board itself
    parts.append(box(-0.335, -0.012, 1.855, 0.335, 0.03, 1.885, dark))                 # its head rail
    parts.append(box(-0.335, -0.012, 0.315, 0.335, 0.03, 0.345, dark))                 # its foot rail
    for s in (-1, 1):                                                                   # the little roof
        parts.append(quads("roof", [([(0, -0.09, 1.99), (0, 0.12, 1.99), (s * 0.4, 0.12, 1.885), (s * 0.4, -0.09, 1.885)][::(1 if s > 0 else -1)], roofc)]))
    y, Q = -0.002, []
    Q.append(rect(-0.305, 0.36, 0.305, 1.84, y, pale))                                  # the paper
    y -= 0.002
    Q.append(rect(-0.285, 1.38, 0.285, 1.82, y, night))                                 # the sky at its head
    y -= 0.002
    Q.append(rect(-0.2, 1.38, 0.2, 1.44, y, hexc(0xb9b2a0)))                            # the building under the dome
    for k in range(5):
        Q.append(rect(-0.18 + k * 0.075, 1.395, -0.135 + k * 0.075, 1.425, y - 0.001, hexc(0xf2cf78)))  # its lit windows
    Q += disc(0, 1.44, 0.12, y, dome_c, 0, math.pi)                                    # the dome
    for k in range(1, 6):                                                               # its ribs
        a = k / 6 * math.pi
        Q.append(line(0, 1.44, math.cos(a) * 0.118, 1.44 + math.sin(a) * 0.118, 0.006, y - 0.001, hexc(0x8d9493)))
    for a in (-0.22, 0.0, 0.22):                                                        # the projector's beams on the sky
        Q.append(([(0, y - 0.0005, 1.56), (math.sin(a) * 0.3 - 0.02, y - 0.0005, 1.81), (math.sin(a) * 0.3 + 0.02, y - 0.0005, 1.81)][::-1], mix(night, pale, 0.18)))
    rng = np.random.default_rng(1964)
    for cx, cz, r in ((-0.22, 1.76, 0.022), (0.21, 1.72, 0.026), (-0.12, 1.66, 0.014), (0.13, 1.79, 0.012), (0.24, 1.6, 0.012), (-0.25, 1.58, 0.016), (0.06, 1.75, 0.01), (-0.05, 1.8, 0.009)):
        Q += star(cx, cz, r, y - 0.001, gold if r > 0.02 else pale)
    for k in range(26):                                                                 # and the small ones
        cx, cz = rng.uniform(-0.27, 0.27), rng.uniform(1.5, 1.81)
        if abs(cx) < 0.15 and cz < 1.6:
            continue
        Q.append(rect(cx - 0.0035, cz - 0.0035, cx + 0.0035, cz + 0.0035, y - 0.001, pale))
    W = [(-0.24, 1.7), (-0.2, 1.665), (-0.165, 1.695), (-0.13, 1.66), (-0.095, 1.69)]   # Cassiopeia, joined
    for (a, b) in zip(W[:-1], W[1:]):
        Q.append(line(a[0], a[1], b[0], b[1], 0.003, y - 0.0012, mix(night, pale, 0.5)))
    for cx, cz in W:
        Q += star(cx, cz, 0.009, y - 0.0015, pale)
    Q += disc(0.205, 1.53, 0.035, y - 0.001, pale)                                     # the moon, a crescent
    Q += disc(0.222, 1.54, 0.032, y - 0.0015, night)
    Q.append(rect(-0.285, 1.36, 0.285, 1.372, -0.006, RED))                            # a red rule under the sky
    Q.append(rect(0.096, 0.47, 0.104, 1.33, -0.006, mix(PAPER, RED, 0.5)))             # and between the title and the rest
    parts.append(quads("face", Q))
    # (read right to left: the title; the evening's, in red; the date and the hour; and who gives it)
    parts += letters("五島プラネタリウム", 0.098, INK, "gothic", (0.175, -0.008, 1.335), vertical=True, track=0.97)
    parts += letters("今夜の星空", 0.08, RED, "gothic", (0.04, -0.008, 1.33), vertical=True, track=1.02)
    parts += letters("十月十日", 0.05, INK, "maru", (-0.09, -0.008, 1.33), vertical=True)
    parts += letters("午後七時", 0.068, INK, "gothic", (-0.09, -0.008, 1.1), vertical=True)
    parts += letters("解説", 0.05, INK, "maru", (-0.215, -0.008, 1.33), vertical=True)
    parts += letters("水野", 0.07, INK, "gothic", (-0.215, -0.008, 1.2), vertical=True)
    parts += letters("晶", 0.07, INK, "gothic", (-0.215, -0.008, 1.03), vertical=True)
    parts += letters("東急文化会館 八階", 0.036, INK, "medium", (0.0, -0.008, 0.41))
    parts.append(blob(0.5, 0.42))
    return join("board", parts)


def postbox():
    """The round pillar box, type 1 (1949): 1.35 m to the top of its cap, 40 cm through, on a root stone; the cap
    flares into a brim, the slot is under it with its hood, the collection times are on a white plate, and the 〒
    is on its breast."""
    red, dark, stone, plate = hexc(0xc0281f), hexc(0x221f1d), hexc(0x8e897e), hexc(0xefeadb)
    shade = mix(red, dark, 0.25)
    body = lathe([(0.3, 0, stone), (0.3, 0.1, stone), (0.24, 0.12, stone), (0.215, 0.12, shade), (0.215, 0.2, shade), (0.2, 0.215, red), (0.2, 1.17, red),
                  (0.214, 1.185, red), (0.255, 1.215, red), (0.258, 1.24, shade), (0.215, 1.26, red), (0.17, 1.3, red), (0.1, 1.335, red), (0.03, 1.35, red), (0.0, 1.352, red)], seg=32, name="postbox")
    parts = [body]
    parts.append(box(-0.095, -0.208, 1.05, 0.095, -0.19, 1.085, dark))                 # the slot
    parts.append(quads("hood", [([(-0.115, -0.2, 1.105), (0.115, -0.2, 1.105), (0.115, -0.245, 1.09), (-0.115, -0.245, 1.09)][::-1], red),
                                ([(-0.115, -0.245, 1.09), (0.115, -0.245, 1.09), (0.115, -0.245, 1.075), (-0.115, -0.245, 1.075)][::-1], shade)]))
    parts.append(box(-0.065, -0.214, 0.78, 0.065, -0.2, 0.97, plate))                  # the times plate
    Q = [rect(-0.052, 0.94, 0.052, 0.955, -0.2145, RED)]
    for k in range(5):
        Q.append(rect(-0.05, 0.8 + k * 0.026, 0.05 if k % 2 else 0.03, 0.81 + k * 0.026, -0.2145, INK))
    parts.append(quads("times", Q))
    parts += letters("〒", 0.11, hexc(0xf4efe2), "medium", (0, -0.205, 0.64))
    parts.append(box(-0.11, 0.195, 0.3, 0.11, 0.212, 0.62, shade))                     # the collection door at its back
    parts.append(blob(0.5, 0.5))
    return join("postbox", parts)


def umbrella():
    """A black umbrella open on the ground, set down on its rim to dry the way it is done: eight panels sagging
    between their ribs, the ferrule out at the crown, the shaft and its cane crook up in the air."""
    black, rib, wood, tipc = hexc(0x1a1b20), hexc(0x3c3e46), hexc(0x6e4c2c), hexc(0xbab5a6)
    R, H, seg = 0.5, 0.2, 32
    V, C = [(0.0, 0.0, H)], [black]
    rings = (0.25, 0.5, 0.75, 1.0)
    for f in rings:
        for k in range(seg):
            a = k / seg * 2 * math.pi
            onrib = k % 4 == 0
            r = R * f * (1.0 if onrib else 1 - 0.045 * math.sin(math.pi * (k % 4) / 4) * f)
            z = H * (1 - f ** 1.6) - (0.0 if onrib else 0.025 * f * math.sin(math.pi * (k % 4) / 4))
            V.append((math.cos(a) * r, math.sin(a) * r, z))
            C.append(rib if onrib and f > 0.3 else black)
    F = [(0, 1 + k, 1 + (k + 1) % seg) for k in range(seg)]
    for i in range(len(rings) - 1):
        for k in range(seg):
            a, b = 1 + i * seg + k, 1 + i * seg + (k + 1) % seg
            F.append((a, a + seg, b + seg, b))
    can = make("umbrella", np.array(V), F, np.array(C))
    parts = [can, lathe([(0.008, H, tipc), (0.006, H + 0.07, tipc), (0.0, H + 0.075, tipc)], seg=8)]  # the ferrule
    parts.append(lathe([(0.009, -0.62, wood), (0.009, H, black)], seg=8))              # the shaft
    hook = [(0.0, -0.62)] + [(0.05 - math.cos(t) * 0.05, -0.62 - math.sin(t) * 0.05) for t in np.linspace(0.3, math.pi, 7)]
    for (x0, z0), (x1, z1) in zip(hook[:-1], hook[1:]):
        parts.append(quads("crook", [line(x0, z0, x1, z1, 0.022, 0.0, wood)]))
    u = join("umbrella", parts)
    # set down: the canopy tipped over until its rim rests on the ground, the crown towards -Y (the front)
    tilt = math.radians(52)
    place(u, rx=tilt, at=(0, 0, 0))
    zmin = min(v.co.z for v in u.data.vertices)
    for v in u.data.vertices:
        v.co.z -= zmin
    return join("umbrella", [u, blob(0.5, 0.42, at=(0, 0.1), dark=0.45)])


def shoeshine():
    wood, dark, tin, cloth = hexc(0x7a5a3a), hexc(0x3e2c1c), hexc(0xb8b2a0), hexc(0x8a2f2a)
    parts = [box(-0.24, -0.15, 0, 0.24, 0.15, 0.27, wood, "shoeshine"), box(-0.25, -0.16, 0.27, 0.25, 0.16, 0.295, dark)]
    parts += [box(-0.03, -0.03, 0.295, 0.03, 0.03, 0.42, dark), box(-0.05, -0.13, 0.42, 0.05, 0.13, 0.45, wood)]  # the foot-rest
    sx = 0.55  # the stool beside it, a cloth over it
    parts += [box(sx - 0.15, -0.15, 0.24, sx + 0.15, 0.15, 0.28, wood), box(sx - 0.12, -0.13, 0.28, sx + 0.1, 0.11, 0.295, cloth)]
    for dx, dy in ((-0.13, -0.13), (0.1, -0.13), (-0.13, 0.1), (0.1, 0.1)):
        parts.append(box(sx + dx, dy, 0, sx + dx + 0.03, dy + 0.03, 0.24, dark))
    # a hundred-yen note (series B, 1953: Itagaki Taisuke in an oval at its left, 百円 at its right) on the lid, under the
    # tin of polish, its end out from under it
    note, ink2 = hexc(0xd9c48c), hexc(0x6b4a2a)
    nz, nx0 = 0.2965, -0.2
    Qn = [([(nx0, -0.06, nz), (nx0 + 0.148, -0.06, nz), (nx0 + 0.148, 0.016, nz), (nx0, 0.016, nz)], note),
          ([(nx0 + 0.006, -0.054, nz + 0.0005), (nx0 + 0.142, -0.054, nz + 0.0005), (nx0 + 0.142, -0.051, nz + 0.0005), (nx0 + 0.006, -0.051, nz + 0.0005)], ink2),
          ([(nx0 + 0.006, 0.007, nz + 0.0005), (nx0 + 0.142, 0.007, nz + 0.0005), (nx0 + 0.142, 0.01, nz + 0.0005), (nx0 + 0.006, 0.01, nz + 0.0005)], ink2)]
    ov = [(nx0 + 0.04 + math.cos(k / 16 * 2 * math.pi) * 0.022, -0.022 + math.sin(k / 16 * 2 * math.pi) * 0.027, nz + 0.0006) for k in range(16)]
    Qn += [([(nx0 + 0.04, -0.022, nz + 0.0006), ov[k], ov[(k + 1) % 16]], ink2) for k in range(16)]
    parts.append(quads("note", Qn))
    for o in letters("百円", 0.026, ink2, "mincho", (0, 0, 0)):
        parts.append(place(o, rx=-math.pi / 2, at=(nx0 + 0.105, -0.022, nz + 0.0007)))
    parts.append(lathe([(0.045, 0, tin), (0.045, 0.03, tin), (0.0, 0.031, dark)], seg=14, at=(nx0 + 0.11, -0.01, 0.2965)))  # the tin of polish
    parts.append(box(-0.2, -0.36, 0, -0.04, -0.3, 0.05, dark))  # the brush
    parts += letters("くつみがき", 0.05, PAPER, "maru", (0, -0.152, 0.15))  # (lettered on the box's front)
    parts.append(blob(0.75, 0.5, at=(0.25, 0)))
    return join("shoeshine", parts)


def lamp():
    """The red globe that marks a police box, on its bracket at the head of an iron post, and the box's name plate."""
    iron, red, glow = hexc(0x2a2c2e), hexc(0xa81c14), hexc(0xe2402a)
    post = lathe([(0.11, 0, iron), (0.11, 0.1, iron), (0.045, 0.14, iron), (0.04, 2.5, iron), (0.06, 2.52, iron), (0.0, 2.56, iron)], seg=12, name="lamp")
    arm = box(0.0, -0.02, 2.36, 0.34, 0.02, 2.4, iron)
    stay = quads("stay", [line(0.04, 2.1, 0.3, 2.37, 0.025, 0.0, iron)])
    cap = lathe([(0.0, 2.36, iron), (0.12, 2.33, iron), (0.13, 2.3, iron), (0.06, 2.29, iron)], seg=14, at=(0.34, 0, 0))
    globe = lathe([(0.0, 1.98, red), (0.05, 1.985, red)] + [(0.14 * math.sin(k / 10 * math.pi) + 0.01, 1.99 + 0.3 * k / 10, mix(red, glow, math.sin(k / 10 * math.pi))) for k in range(1, 10)] + [(0.05, 2.29, red)], seg=18, at=(0.34, 0, 0))
    plate = box(-0.09, -0.06, 1.25, 0.09, -0.04, 1.85, hexc(0xe9e3d0))
    parts = [post, arm, stay, cap, globe, plate] + letters("派出所", 0.13, INK, "mincho", (0, -0.062, 1.79), vertical=True)
    return join("lamp", parts + [blob(0.4, 0.4)])


def tram():
    """The Tamagawa line's type 200 at its Shibuya stop: two bodies of 10.2 m on three bogies, 2.3 m wide, light green
    with a cream band under the windows and a grey roof, round faces (each a curve of three windscreens, the lamp
    low in the middle, the destination box over it: 渋谷 at the Shibuya end), a single door behind each cab and a
    double door by the joint, the pantograph on the Futako body under its wire; under it the rails in their setts,
    and the stop's safety island beside it with its sign."""
    green, green2, cream, glass, roofc, dark, steel, lampc, sett, sett2, stone = (hexc(h) for h in (0x6e9a6a, 0x5c8659, 0xeee2c0, 0x2a3036, 0x8b8f8c, 0x1f2123, 0x8d9296, 0xfff4cc, 0x4a4c50, 0x55585d, 0x9a968c))
    lit = hexc(0x5a5243)  # (the windows: glass, the saloon behind it dim)
    W, L0, L1 = 1.15, 0.3, 10.5  # half width; each body from the joint (L0) to its face (L1)
    NOSE = 1.0

    def half(ax):  # half width in plan at a distance from the joint
        if ax <= L1 - NOSE:
            return W
        t = (ax - (L1 - NOSE)) / NOSE
        return W * math.sqrt(max(0.0, 1 - t * t * 0.55))

    ZS = [0.32, 0.5, 1.05, 1.2, 2.12, 2.42]

    def profile(w):  # up the near side (-y), over the roof, down the far side
        pts = [(-w, z) for z in ZS]
        pts += [(-w * math.cos(k / 12 * math.pi), 2.42 + 0.6 * math.sin(k / 12 * math.pi)) for k in range(1, 12)]
        pts += [(w, z) for z in reversed(ZS)]
        return pts

    def openings(body):  # (x0, x1, kind) in distance from the joint
        return [(0.55, 1.97, "door2"), (2.3, 3.3, "win"), (3.55, 4.55, "win"), (4.8, 5.8, "win"), (6.05, 7.05, "win"), (7.3, 8.3, "door1"), (8.5, 9.35, "win")]

    def colour(ax, z, body):
        if z > 2.42:
            return roofc
        if z < 0.5:
            return dark
        op = next((k for a, b, k in openings(body) if a <= ax <= b), None)
        if ax > L1 - NOSE + 0.12:  # the face
            if 1.2 <= z < 2.12:
                return glass
            if z < 1.05:
                return green
            return cream if z < 1.2 else green
        if op and op.startswith("door"):
            if 1.25 <= z < 2.05:
                return lit
            return green2 if z < 2.12 else green
        if 1.05 <= z < 1.2:
            return cream
        if 1.25 <= z < 2.08:
            return lit if op == "win" else green
        return green

    parts = []
    for body in (-1, 1):
        edges = [L0, L1 - NOSE, L1 - NOSE + 0.12]
        for a, b, _ in openings(body):
            edges += [a, b]
        edges += [L1 - NOSE + k * NOSE / 6 for k in range(1, 7)]
        xs = sorted(set(round(e, 3) for e in edges))
        Q = []
        for a0, a1 in zip(xs[:-1], xs[1:]):
            p0, p1 = profile(half(a0)), profile(half(a1))
            for i in range(len(p0) - 1):
                zc, ac = (p0[i][1] + p0[i + 1][1]) / 2, (a0 + a1) / 2
                pts = [(body * a0, p0[i][0], p0[i][1]), (body * a1, p1[i][0], p1[i][1]), (body * a1, p1[i + 1][0], p1[i + 1][1]), (body * a0, p0[i + 1][0], p0[i + 1][1])]
                Q.append((pts if body > 0 else pts[::-1], colour(ac, zc, body)))
        w = half(L1)  # the face: flat, in the same bands as the sides (the windscreen in its place), the roof's arch over it
        for z0, z1, col in ((0.32, 0.5, dark), (0.5, 1.05, green), (1.05, 1.2, cream), (1.2, 2.12, glass), (2.12, 2.42, green)):
            pts = [(body * L1, -w, z0), (body * L1, w, z0), (body * L1, w, z1), (body * L1, -w, z1)]
            Q.append((pts if body > 0 else pts[::-1], col))
        arch = [p for p in profile(w) if p[1] >= 2.42]
        for p0, p1 in zip(arch[:-1], arch[1:]):
            tri = [(body * L1, 0.0, 2.42), (body * L1, p0[0], p0[1]), (body * L1, p1[0], p1[1])]
            Q.append((tri if body > 0 else tri[::-1], roofc))
        pr = profile(W)  # the end at the joint
        Q.append(([(body * L0, p[0], p[1]) for p in pr][::(1 if body < 0 else -1)], green))
        parts.append(quads("tram", Q))
        fx = body * (L1 + 0.03)
        # the windscreen's pillars, the lamp, the fender, the destination box and the number
        for py in (-0.36, 0.36):
            parts.append(box(fx - 0.06, py - 0.04, 1.2, fx + 0.06, py + 0.04, 2.12, green))
        lampo = lathe([(0.0, 0, lampc), (0.13, 0.0, lampc), (0.13, 0.05, steel), (0.0, 0.06, lampc)], seg=14)
        place(lampo, rx=math.pi / 2, rz=math.pi / 2 * (1 if body > 0 else -1), at=(body * (L1 + 0.12), 0, 0.82))
        parts.append(lampo)
        parts.append(box(body * (L1 + 0.12) - 0.05, -0.95, 0.32, body * (L1 + 0.12) + 0.05, 0.95, 0.45, steel))
        parts.append(box(fx - 0.04 * body - 0.04, -0.42, 2.18, fx - 0.04 * body + 0.04, 0.42, 2.44, hexc(0xf4efe0)))
        dest = letters("渋谷" if body > 0 else "二子玉川", 0.2 if body > 0 else 0.13, INK, "gothic", (0, 0, 2.31))
        for d in dest:
            place(d, rz=math.pi / 2 * (1 if body > 0 else -1), at=(fx + 0.012 * body, 0, 0))
        parts += dest
        num = letters("204" if body > 0 else "203", 0.12, cream, "medium", (0, 0, 0.62))
        for d in num:
            place(d, rz=math.pi / 2 * (1 if body > 0 else -1), at=(body * (L1 + 0.11), 0, 0))
        parts += num
        for side in (-1, 1):  # the number on each side too, and the Tokyu wheel on the near side
            parts += [place(d, rz=0 if side < 0 else math.pi, at=(body * 5.0, side * (W + 0.006), 0)) for d in letters("デハ204" if body > 0 else "デハ203", 0.11, cream, "medium", (0, 0, 0.78))]
        parts.append(box(body * 7.4 - 1.0, -0.86, 0.1, body * 7.4 + 1.0, 0.86, 0.36, hexc(0x2b2d30)))  # its bogie
    parts.append(box(-0.32, -0.9, 0.45, 0.32, 0.9, 2.3, hexc(0x2a2a28)))                 # the bellows at the joint
    for body in (-1, 1):  # the route boards over the windows, both sides: the line runs by way of Sangenjaya
        for side in (-1, 1):
            parts.append(box(body * 5.2 - 0.85, side * W - 0.012, 2.15, body * 5.2 + 0.85, side * W + 0.012, 2.4, hexc(0xf4efe0)))
            parts += [place(d, rz=0 if side < 0 else math.pi, at=(body * 5.2, side * (W + 0.016), 0)) for d in letters("三軒茶屋 経由", 0.21, INK, "gothic", (0, 0, 2.275))]
    parts.append(box(-0.9, -0.86, 0.1, 0.9, 0.86, 0.36, hexc(0x2b2d30)))                  # and its bogie
    for bx in (-7.4, 0.0, 7.4):
        for wx in ((-0.6, 0.6) if bx else (0.0,)):
            for wy in (-0.74, 0.74):                                                       # the wheels, on the rails
                cx, r = bx + wx, 0.3
                ring = [(cx + math.cos(k / 12 * 2 * math.pi) * r, r + math.sin(k / 12 * 2 * math.pi) * r) for k in range(12)]
                Qw = [([(ring[k][0], wy - 0.05, ring[k][1]), (ring[(k + 1) % 12][0], wy - 0.05, ring[(k + 1) % 12][1]), (ring[(k + 1) % 12][0], wy + 0.05, ring[(k + 1) % 12][1]), (ring[k][0], wy + 0.05, ring[k][1])], steel) for k in range(12)]
                Qw += [([(px, wy + s * 0.05, pz) for px, pz in (ring if s > 0 else ring[::-1])], dark) for s in (-1, 1)]
                parts.append(quads("wheel", Qw))
    # the pantograph on the Futako body: its base, two diamonds of tube, the bow on the wire
    px, top = -5.2, 4.55
    parts.append(box(px - 0.7, -0.5, 3.0, px + 0.7, 0.5, 3.07, dark))
    for py in (-0.45, 0.45):
        for (x0, z0), (x1, z1) in (((px - 0.6, 3.07), (px, 3.8)), ((px, 3.8), (px - 0.25, top)), ((px + 0.6, 3.07), (px, 3.8)), ((px, 3.8), (px + 0.25, top))):
            ob = quads("panto", [line(x0, z0, x1, z1, 0.035, 0.0, dark)])
            for v in ob.data.vertices:
                v.co.y += py
            parts.append(ob)
    parts.append(box(px - 0.3, -0.6, top, px + 0.3, 0.6, top + 0.04, steel))
    parts.append(box(px - 0.04, -0.46, 3.78, px + 0.04, 0.46, 3.82, dark))
    parts.append(box(-16.0, -0.012, top + 0.04, 16.0, 0.012, top + 0.065, dark))          # the wire
    # the rails in their bed of setts, and the safety island with its stop sign on the near side
    parts.append(box(-16.0, -1.25, 0.0, 16.0, 1.25, 0.03, sett))
    for k in range(64):
        if k % 2:
            parts.append(box(-16.0 + k * 0.5, -1.25, 0.03, -16.0 + k * 0.5 + 0.47, 1.25, 0.034, sett2))
    for yy in (-0.74, 0.74):
        parts.append(box(-16.0, yy - 0.035, 0.0, 16.0, yy + 0.035, 0.07, steel))
    parts.append(box(-9.0, -2.75, 0.0, 9.0, -1.55, 0.2, stone))
    parts.append(box(-9.0, -1.6, 0.0, 9.0, -1.55, 0.21, hexc(0xd8d2c0)))
    parts.append(lathe([(0.04, 0.2, dark), (0.035, 2.3, dark), (0.0, 2.32, dark)], seg=8, at=(4.0, -2.2, 0)))  # the stop's sign
    parts.append(quads("sign", disc(4.0, 2.45, 0.25, -2.23, RED) + disc(4.0, 2.45, 0.2, -2.235, hexc(0xf2ede0))))
    parts += letters("渋谷", 0.13, INK, "gothic", (4.0, -2.24, 2.45))
    parts.append(blob(11.0, 1.8, dark=0.7))
    return join("tram", parts)


# ---- the two sites ------------------------------------------------------------------------------------------------
# The dome and the river are places, not things: each fills its frame, and is seen from one stand point (docs/PAST.md,
# "The two sites"). They are built as solids whose every face looks outward, and then lit once, here: how much of the
# sky each point sees and whether the print's key light reaches it are multiplied into its colour (shade), so that a
# recessed window, the foot of a wall and the roof behind a parapet are dark because of what stands over them. The
# page's material lights them with the same key (web/game/past.js), turned by the heading the frame gives the model.

KEY_MAP = (0.35, -0.4, 0.85)  # the print's key light in the map's axes (past.js: (0.35, 0.85, 0.4) with y up, -z north)
SITES = {  # where each is seen from: the frame's stand point, what it aims at and its heading (cities/shibuya/city.json)
    "dome": {"stand": (543.33, -1108.84, 241.8 + 1.6), "at": (611.85, -1051.28, 51.0), "eye": -6.0, "h": 20.0, "lens": 24.0, "key": (-0.44, -0.53, 0.72)},
    "river": {"stand": (521.87, -1074.06, 1.6), "at": (519.42, -1067.66, 0.0), "eye": 1.0, "h": 21.0, "lens": 50.0},
}


def in_model(v, h):
    """A direction or an offset in the map's axes, in the axes of a model turned h degrees anticlockwise."""
    c, s = math.cos(math.radians(h)), math.sin(math.radians(h))
    return np.array([v[0] * c + v[1] * s, -v[0] * s + v[1] * c, v[2]])


def site_eye(name):
    """The lens of the frame in the model's own axes: (where it is, what it looks at)."""
    s = SITES[name]
    return in_model(np.subtract(s["stand"], s["at"]), s["h"]), np.array([0.0, 0.0, s["eye"]])


class Solid:
    """Polygons that share no vertices, each one colour and each wound to face the way it is told to."""

    def __init__(self):
        self.Q = []

    def quad(self, pts, col, out):
        pts = [tuple(float(c) for c in p) for p in pts]
        n = np.cross(np.subtract(pts[1], pts[0]), np.subtract(pts[2], pts[0]))
        self.Q.append((pts if np.dot(n, out) >= 0 else pts[::-1], col))

    def box(self, x0, y0, z0, x1, y1, z1, col, skip="", top=None):
        """A box; skip names faces to leave out: w e (-x, +x), s n (-y, +y), d u (down, up)."""
        f = {"w": ([(x0, y0, z0), (x0, y1, z0), (x0, y1, z1), (x0, y0, z1)], (-1, 0, 0)), "e": ([(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)], (1, 0, 0)),
             "s": ([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], (0, -1, 0)), "n": ([(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)], (0, 1, 0)),
             "d": ([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)], (0, 0, -1)), "u": ([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], (0, 0, 1))}
        for k, (pts, out) in f.items():
            if k not in skip:
                self.quad(pts, top if k == "u" and top is not None else col, out)

    def sheet(self, o, u, v, nu, nv, col, out):
        """A rectangle from o along u and v in nu by nv cells, so that a shadow can fall across it; col may be a
        function of a cell's middle."""
        o, u, v = (np.asarray(a, float) for a in (o, u, v))
        for i in range(nu):
            for j in range(nv):
                p = [o + u * (i / nu) + v * (j / nv), o + u * ((i + 1) / nu) + v * (j / nv), o + u * ((i + 1) / nu) + v * ((j + 1) / nv), o + u * (i / nu) + v * ((j + 1) / nv)]
                self.quad(p, col(sum(p) / 4) if callable(col) else col, out)

    def ob(self, name, alpha=None):
        return quads(name, self.Q, alpha)


def colours(ob):
    att = ob.data.color_attributes["Col"]
    col = np.zeros(len(ob.data.vertices) * 4)
    att.data.foreach_get("color", col)
    return att, col.reshape(-1, 4)


def shade(ob, key, ao=0.55, cast=0.42, reach=6.0, rays=20):
    """Light a solid once: each vertex's colour is multiplied by how much of the sky it sees within reach metres
    (ao: how dark a point that sees none of it gets) and, where it faces the key light and something stands in the
    way, by the shadow thrown on it (cast). Returns the tree the rays were cast in and the colour of each polygon,
    for what is reflected in water."""
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    me = ob.data
    co = [v.co.copy() for v in me.vertices]
    polys = [tuple(p.vertices) for p in me.polygons]
    bvh = BVHTree.FromPolygons([c[:] for c in co], polys)
    key = Vector(key).normalized()
    dirs = []
    for i in range(rays):  # (the hemisphere, weighted by the cosine: a spiral of fixed points, the same every build)
        u = (i + 0.5) / rays
        r, t = math.sqrt(u), i * 2.399963
        dirs.append((r * math.cos(t), r * math.sin(t), math.sqrt(1 - u)))
    att, col = colours(ob)
    for i, v in enumerate(me.vertices):
        n = v.normal.copy()
        if n.length < 0.5:
            continue
        p = co[i] + n * 0.03
        if bvh.ray_cast(p, n, 0.05)[0] is not None:  # (wound the other way, lettering laid on a face: it looks out all the same)
            n = -n
            p = co[i] + n * 0.03
        t = n.orthogonal().normalized()
        b = n.cross(t)
        seen = 0.0
        for d in dirs:
            hit = bvh.ray_cast(p, t * d[0] + b * d[1] + n * d[2], reach)
            seen += 1.0 if hit[0] is None else hit[3] / reach
        f = 1 - ao * (1 - seen / rays)
        if n.dot(key) > 0.05 and bvh.ray_cast(p, key, 300.0)[0] is not None:
            f *= 1 - cast
        col[i, :3] *= f
    att.data.foreach_set("color", col.ravel())
    pc = np.array([col[list(p), :3].mean(0) for p in polys])
    return bvh, pc, [p.normal.copy() for p in me.polygons]


def lit(c, n, key):
    """A face's colour as the page's material shows it under the print's key (past.js), near enough for a reflection."""
    return c * (0.36 + 0.72 * max(n.dot(key), 0.0))


def water(name, eye, key, tree, x0, x1, rows, z, slope, nx=40):
    """A sheet of water as it is seen from one place: at each point the sheet's own dark, and over it what it
    mirrors there, more of it the flatter it is looked along (Fresnel's term). What it mirrors is found by a ray:
    a wall, a board, a lamp of the solid already lit (tree: shade's), or the evening sky. slope(x, y) is the water's
    tilt, its ripples; they break the mirror into the streaks a slow river has."""
    from mathutils import Vector
    bvh, pc, pn = tree
    key = Vector(key).normalized()
    deep = lin(hexc(0x141c1b))
    V, C = [], []
    dx, dy = (x1 - x0) / nx, np.gradient(np.array(rows, float))
    for i, y in enumerate(rows):
        for j in range(nx + 1):
            x = x0 + (x1 - x0) * j / nx
            tone = np.zeros(3)
            for q in range(9):  # (over the point's own patch of water: what a sheet's points can carry, and no more)
                qx, qy = x + (q % 3 - 1) * dx / 3, y + (q // 3 - 1) * dy[i] / 3
                sx, sy = slope(qx, qy)
                n = Vector((-sx, -sy, 1.0)).normalized()
                p = Vector((qx, qy, z))
                v = (Vector(eye) - p).normalized()
                c = max(n.dot(v), 0.0)
                r = (2 * n.dot(v) * n - v).normalized()
                hit = bvh.ray_cast(p + Vector((0, 0, 0.02)), r, 120.0)
                if hit[0] is not None:
                    got = lit(pc[hit[2]], pn[hit[2]] if pn[hit[2]].dot(r) < 0 else -pn[hit[2]], key)
                else:  # the sky of that evening: pale at the horizon, deeper overhead
                    got = mix(lin(hexc(0xe9e2d0)), lin(hexc(0x8d9ca8)), max(r.z, 0.0) ** 0.6)
                f = 0.05 + 0.95 * (1 - c) ** 3
                tone += (deep * (1 - f) + np.asarray(got) * f) / 9
            V.append((x, y, z))
            C.append(tone)
    ob = make(name, np.array(V), grid_faces(len(rows), nx + 1), np.zeros((len(V), 3)))
    att, col = colours(ob)
    col[:, :3] = np.clip(np.array(C), 0, 1)
    att.data.foreach_set("color", col.ravel())
    return ob


def dome():
    """Tokyu Bunka Kaikan (Junzo Sakakura, 1956) with the Gotoh Planetarium on its roof, as the roof across the street
    looks down on it: a slab eight storeys high, its end to Meiji-dori and the station, in bands of windows, the four film hoardings on its
    short face to the station, the footbridge to the station from its north side, a roof of concrete slabs inside a
    parapet with what a roof of 1956 carried (the penthouses, a water tank, two cooling towers, vents), and at the
    station end the silver dome on its low drum, its sheets of aluminium laid in gores and rings. The origin is the
    foot of the drum; the station face is to -X, north is +Y."""
    S = Solid()
    X0, X1, Y0, Y1, HT = -20.0, 64.0, -32.0, 14.0, 31.0
    R, DRUM = 10.5, 1.2
    G = 4.6                      # the ground floor, shops
    FH = (HT - G) / 7            # a storey above it
    SILL, HEAD, IN = 0.95, 0.4, 0.3
    wall, pier, glass, lamp_c, dim, roof_c, seam_c, cope = (hexc(h) for h in (0xd6d0c0, 0xc4bdac, 0x272d34, 0xecd096, 0x8d8468, 0x959188, 0x4c4a45, 0xe3dece))
    eye, _ = site_eye("dome")
    key = in_model(SITES["dome"]["key"], SITES["dome"]["h"])

    def lights(face, storey, bay):  # which rooms have their lamps on at half past five: by the room, three bays to one
        k = (face * 31 + storey * 17 + (bay // 3) * 7) % 10
        return lamp_c if k < 4 else dim if k < 6 else glass

    HB = [(-30.0 + k * 11.0, -30.0 + k * 11.0 + 9.5) for k in range(4)]  # the four hoardings along the station face
    HZ0, HZ1 = -17.6, -7.6
    faces = [((X0, Y0), (X0, Y1), (-1, 0)), ((X0, Y1), (X1, Y1), (0, 1)), ((X1, Y1), (X1, Y0), (1, 0)), ((X1, Y0), (X0, Y0), (0, -1))]
    for fi, (a, b, out) in enumerate(faces):
        a, b, o = np.array(a, float), np.array(b, float), np.array([*out, 0.0])
        L = float(np.linalg.norm(b - a))
        d = (b - a) / L
        bays = round(L / 3.0)
        bw = L / bays
        P = lambda t, z, back=0.0: (a[0] + d[0] * t - o[0] * back, a[1] + d[1] * t - o[1] * back, z)
        strip = lambda z0, z1, col, back=0.0, n=8: [S.quad([P(L * k / n, z0, back), P(L * (k + 1) / n, z0, back), P(L * (k + 1) / n, z1, back), P(L * k / n, z1, back)], col, o) for k in range(n)]
        # the ground floor: lit shop fronts set back between piers, under a fascia
        strip(-HT + G - 0.9, -HT + G + SILL, wall)
        for k in range(bays):
            S.quad([P(k * bw + 0.3, -HT, IN), P((k + 1) * bw - 0.3, -HT, IN), P((k + 1) * bw - 0.3, -HT + G - 0.9, IN), P(k * bw + 0.3, -HT + G - 0.9, IN)], lamp_c if (k + fi) % 5 else dim, o)
            S.quad([P(k * bw - 0.3, -HT), P(k * bw + 0.3, -HT), P(k * bw + 0.3, -HT + G - 0.9), P(k * bw - 0.3, -HT + G - 0.9)], pier, o)
        # seven storeys of ribbon windows: the glass set back a foot behind the spandrels, a pier at every bay
        for f in range(7):
            z0 = -HT + G + f * FH
            if f:
                strip(z0 - HEAD, z0 + SILL, wall)
            S.quad([P(0, z0 + SILL), P(L, z0 + SILL), P(L, z0 + SILL, IN), P(0, z0 + SILL, IN)], wall, (0, 0, 1))  # the sill
            for k in range(bays):
                t0, t1 = k * bw, (k + 1) * bw
                if fi == 0 and HZ0 - 1 < z0 + FH / 2 < HZ1 + 1 and any(y0 - 1 < Y0 + (t0 + t1) / 2 < y1 + 1 for y0, y1 in HB):
                    continue  # behind a hoarding
                S.quad([P(t0 + 0.2, z0 + SILL, IN), P(t1 - 0.2, z0 + SILL, IN), P(t1 - 0.2, z0 + FH - HEAD, IN), P(t0 + 0.2, z0 + FH - HEAD, IN)], lights(fi, f, k), o)
                S.quad([P(t0 - 0.2, z0 + SILL), P(t0 + 0.2, z0 + SILL), P(t0 + 0.2, z0 + FH - HEAD), P(t0 - 0.2, z0 + FH - HEAD)], pier, o)
            if fi == 0:  # (the wall behind the hoardings)
                for y0, y1 in HB:
                    if HZ0 - 1 < z0 + FH / 2 < HZ1 + 1:
                        S.quad([P(y0 - Y0 - 1.5, z0 + SILL), P(y1 - Y0 + 1.5, z0 + SILL), P(y1 - Y0 + 1.5, z0 + FH - HEAD), P(y0 - Y0 - 1.5, z0 + FH - HEAD)], wall, o)
        strip(-HEAD, 1.1, wall)  # the last head, and the parapet's outer face
        # the parapet: a wall a foot thick round the roof, coped
        n = round(L / 4.4)
        for k in range(n):
            S.quad([P(L * k / n, 0.0, 0.35), P(L * (k + 1) / n, 0.0, 0.35), P(L * (k + 1) / n, 1.1, 0.35), P(L * k / n, 1.1, 0.35)], wall, -o)
            S.quad([P(L * k / n, 1.1, -0.05), P(L * (k + 1) / n, 1.1, -0.05), P(L * (k + 1) / n, 1.1, 0.4), P(L * k / n, 1.1, 0.4)], cope, (0, 0, 1))
    # the canopy over the pavement along the station face
    for k in range(12):
        S.box(X0 - 2.6, Y0 + k * (Y1 - Y0) / 12, -HT + G - 0.25, X0, Y0 + (k + 1) * (Y1 - Y0) / 12, -HT + G + 0.05, wall, skip="e" + ("" if k == 0 else "s") + ("" if k == 11 else "n"))
    # the four hoardings: a painted board in a frame that stands off the wall, a trough of lamps at its foot
    tones = [(0xc9a24a, 0x7a2c24, 0xf0e2b8), (0x4f6f7d, 0xe8d9b0, 0x1f2a33), (0x9c3a2e, 0xead6a4, 0x2a1c18), (0x34465e, 0xd9b46a, 0xeee4c8)]
    for k, (y0, y1) in enumerate(HB):
        bg, fg, ink = (hexc(h) for h in tones[k])
        x = X0 - 0.6
        S.box(x, y0, HZ0, X0, y1, HZ1, hexc(0x2a2826), skip="e")
        for i in range(4):  # the picture, brighter towards the lamps at its foot
            za, zb = HZ0 + 0.3 + i * 2.35, HZ0 + 0.3 + (i + 1) * 2.35
            S.quad([(x - 0.04, y0 + 0.3, za), (x - 0.04, y1 - 0.3, za), (x - 0.04, y1 - 0.3, zb), (x - 0.04, y0 + 0.3, zb)], mix(bg, hexc(0xfff2d0), 0.16 - 0.05 * i), (-1, 0, 0))
        ya = y0 + 0.9 + (k % 2) * 3.7  # a star's head, and the title in a band
        S.quad([(x - 0.08, ya, HZ0 + 3.2), (x - 0.08, ya + 4.0, HZ0 + 3.2), (x - 0.08, ya + 4.0, HZ1 - 0.9), (x - 0.08, ya, HZ1 - 0.9)], fg, (-1, 0, 0))
        S.quad([(x - 0.12, ya + 1.0, HZ0 + 4.6), (x - 0.12, ya + 3.0, HZ0 + 4.6), (x - 0.12, ya + 3.0, HZ1 - 2.0), (x - 0.12, ya + 1.0, HZ1 - 2.0)], ink, (-1, 0, 0))
        S.quad([(x - 0.08, y0 + 1.0, HZ0 + 0.9), (x - 0.08, y1 - 1.0, HZ0 + 0.9), (x - 0.08, y1 - 1.0, HZ0 + 2.5), (x - 0.08, y0 + 1.0, HZ0 + 2.5)], ink, (-1, 0, 0))
        S.box(x - 1.1, y0, HZ0 - 0.5, x, y1, HZ0 - 0.1, hexc(0x3a3733), skip="e", top=hexc(0xfff0c4))
    # the roof: concrete slabs over the asphalt, a joint every 4.4 m, drained to the parapet
    S.sheet((X0 + 0.35, Y0 + 0.35, 0.0), (X1 - X0 - 0.7, 0, 0), (0, Y1 - Y0 - 0.7, 0), 38, 21, roof_c, (0, 0, 1))
    for k in range(1, 19):
        x = X0 + k * 4.4
        S.quad([(x - 0.06, Y0 + 0.4, 0.015), (x + 0.06, Y0 + 0.4, 0.015), (x + 0.06, Y1 - 0.4, 0.015), (x - 0.06, Y1 - 0.4, 0.015)], seam_c, (0, 0, 1))
    for k in range(1, 10):
        y = Y0 + k * 4.4
        S.quad([(X0 + 0.4, y - 0.06, 0.015), (X1 - 0.4, y - 0.06, 0.015), (X1 - 0.4, y + 0.06, 0.015), (X0 + 0.4, y + 0.06, 0.015)], seam_c, (0, 0, 1))

    def house(x0, y0, x1, y1, h, bands):  # a penthouse: rendered walls, a band of windows to a storey, its own flat roof
        S.box(x0, y0, 0.0, x1, y1, h, wall, skip="du")
        S.sheet((x0, y0, h), (x1 - x0, 0, 0), (0, y1 - y0, 0), max(1, round((x1 - x0) / 3)), max(1, round((y1 - y0) / 3)), roof_c, (0, 0, 1))
        S.box(x0 - 0.15, y0 - 0.15, h, x1 + 0.15, y1 + 0.15, h + 0.35, cope, skip="du")
        for b in range(bands):
            z = 1.1 + b * 3.4
            for k in range(round((y1 - y0 - 1.6) / 2.0)):
                S.quad([(x0 - 0.02, y0 + 0.8 + k * 2.0, z), (x0 - 0.02, y0 + 2.4 + k * 2.0, z), (x0 - 0.02, y0 + 2.4 + k * 2.0, z + 1.5), (x0 - 0.02, y0 + 0.8 + k * 2.0, z + 1.5)], lights(5, b, k * 3), (-1, 0, 0))
            for k in range(round((x1 - x0 - 1.6) / 2.0)):
                S.quad([(x0 + 0.8 + k * 2.0, y0 - 0.02, z), (x0 + 2.4 + k * 2.0, y0 - 0.02, z), (x0 + 2.4 + k * 2.0, y0 - 0.02, z + 1.5), (x0 + 0.8 + k * 2.0, y0 - 0.02, z + 1.5)], lights(6, b, k * 3), (0, -1, 0))

    # (as the aerial photograph of about 1960 has them: a tower at the station end's south corner, in front of the dome;
    # the long ribbed roof of the cinema's hall along the south side; a second tower at the far end)
    house(X0 + 3.0, -31.0, X0 + 15.0, -21.0, 10.5, 3)   # the three-storey penthouse
    house(55.0, -31.0, 63.0, -23.0, 9.0, 2)             # the far tower
    house(55.0, 2.0, 63.0, 11.5, 6.8, 2)                # the stair's head at the north-east corner
    hall = hexc(0xb3b6b1)
    S.box(20.0, -29.0, 0.0, 52.0, -9.0, 2.2, wall, skip="du")
    S.sheet((20.0, -29.0, 2.2), (32.0, 0, 0), (0, 20.0, 0), 16, 5, hall, (0, 0, 1))
    for k in range(17):                                 # its standing ribs
        S.box(20.0 + k * 2.0 - 0.12, -29.0, 2.2, 20.0 + k * 2.0 + 0.12, -9.0, 2.5, hall, skip="d")
    steel, fan = hexc(0x8a938f), hexc(0x1d2022)
    for lx, ly in ((29.5, -4.0), (34.5, -4.0), (29.5, 1.0), (34.5, 1.0)):  # the water tank, of steel panels on its stand
        S.box(lx - 0.15, ly - 0.15, 0.0, lx + 0.15, ly + 0.15, 1.8, steel, skip="du")
    S.box(28.6, -5.0, 1.8, 35.4, 2.0, 4.8, steel, skip="d")
    for k in range(1, 4):
        S.quad([(28.6 + k * 1.7 - 0.04, -5.0, 4.82), (28.6 + k * 1.7 + 0.04, -5.0, 4.82), (28.6 + k * 1.7 + 0.04, 2.0, 4.82), (28.6 + k * 1.7 - 0.04, 2.0, 4.82)], seam_c, (0, 0, 1))
    for k in range(6):  # a row of vent cowls along the north parapet
        S.box(16.0 + k * 4.5, 9.0, 0.0, 17.2 + k * 4.5, 10.2, 0.9, steel, skip="d", top=hexc(0x4c5150))
    parts = [S.ob("kaikan")]
    for cx in (41.0, 46.5):  # two cooling towers: a steel drum, the dark of its fan at the top
        parts.append(lathe([(1.7, 0.0, steel), (1.7, 3.0, steel), (1.45, 3.3, steel), (1.3, 3.3, fan), (0.0, 3.2, fan)], seg=16, at=(cx, 6.0, 0.0), smooth=False))
    # the drum, and the dome: a shell whose sheets are laid in thirty-two gores and nine rings, a standing seam between
    drum_c, metal_lo, metal_hi = hexc(0xdcd6c6), lin(hexc(0x848c90)), lin(hexc(0xe8ecea))
    Z0 = DRUM + 0.15
    parts.append(lathe([(R + 1.6, 0.0, roof_c), (R + 1.6, 0.25, drum_c), (R + 0.5, 0.25, drum_c), (R + 0.5, DRUM, drum_c), (R + 0.1, Z0, hexc(0x6a7174))], seg=64, name="drum", smooth=False))
    prof = [(math.cos(math.radians(e)) * (R - 0.12), Z0 + math.sin(math.radians(e)) * (R - 0.12), hexc(0x596064)) for e in range(0, 84, 3)]  # (the seams: under the sheets' chords)
    parts.append(lathe(prof + [(1.5, Z0 + R - 0.05, hexc(0x596064)), (1.5, Z0 + R + 0.3, hexc(0xb9bfbf)), (1.1, Z0 + R + 0.55, hexc(0xb9bfbf)), (0.0, Z0 + R + 0.6, hexc(0x9aa1a2))], seg=64, name="shell"))
    GORES, RINGS, GAP = 32, 9, 0.07
    V, F, C = [], [], []
    hv = (np.array(key) / np.linalg.norm(key) + eye / np.linalg.norm(eye))
    hv /= np.linalg.norm(hv)
    for i in range(RINGS):
        e0, e1 = math.radians(i * 9.0) + GAP / R, math.radians((i + 1) * 9.0) - GAP / R
        for j in range(GORES):
            pts = []
            for e, s in ((e0, 1), (e1, -1)):
                da = GAP / (R * math.cos(e))
                for a in ((j / GORES * 2 * math.pi + da, (j + 1) / GORES * 2 * math.pi - da)[::s]):
                    pts.append((math.cos(a) * math.cos(e) * (R + 0.05), math.sin(a) * math.cos(e) * (R + 0.05), Z0 + math.sin(e) * (R + 0.05)))
            nrm = np.cross(np.subtract(pts[1], pts[0]), np.subtract(pts[3], pts[0]))
            nrm /= np.linalg.norm(nrm)
            # bright aluminium: it shows the sky it is turned to (paler the more it looks up) and, where a sheet lies
            # between the lamp and the lens, the lamp
            tone = mix(metal_lo, metal_hi, 0.12 + 0.75 * max(nrm[2], 0.0) ** 0.8) + 0.5 * max(float(nrm @ hv), 0.0) ** 60
            n0 = len(V)
            V += pts
            F.append((n0, n0 + 1, n0 + 2, n0 + 3))
            C += [np.clip(tone, 0, 1)] * 4
    sheets = flat(make("sheets", np.array(V), F, np.zeros((len(V), 3))))
    att, col = colours(sheets)
    col[:, :3] = np.array(C)
    att.data.foreach_set("color", col.ravel())
    # the street at its foot, going out into tonight; and the footbridge to the station from the north end
    A = Solid()
    pave = hexc(0xa39f95)
    for x0, x1, y0, y1 in ((X0 - 9.0, X0, Y0 - 9.0, Y1 + 9.0), (X1, X1 + 9.0, Y0 - 9.0, Y1 + 9.0), (X0, X1, Y0 - 9.0, Y0), (X0, X1, Y1, Y1 + 9.0)):
        A.sheet((x0, y0, -HT + 0.02), (x1 - x0, 0, 0), (0, y1 - y0, 0), max(1, round((x1 - x0) / 3)), max(1, round((y1 - y0) / 3)), pave, (0, 0, 1))
    BZ = -HT + 5.4
    for k in range(10):
        xa, xb = X0 - 2.6 - (k + 1) * 3.2, X0 - 2.6 - k * 3.2
        A.box(xa, 3.0, BZ - 0.6, xb, 11.0, BZ, hexc(0xb8b3a6), skip="we", top=hexc(0x8f8b82))
        for y in (3.0, 10.75):
            A.box(xa, y, BZ, xb, y + 0.25, BZ + 1.1, wall, skip="wed")
    for x in (X0 - 12.0, X0 - 24.0):
        A.box(x - 0.45, 6.5, -HT, x + 0.45, 7.5, BZ - 0.6, hexc(0xb8b3a6), skip="du")
    out = lambda v: max(X0 - v[0], v[0] - X1, Y0 - v[1], v[1] - Y1, 0.0)
    parts.append(A.ob("street", alpha=lambda v: float(np.clip(1 - (X0 - 2.6 - v[0]) / 30.0, 0, 1)) if v[2] > -HT + 1 else float(np.clip(1 - out(v) / 9.0, 0, 1)) ** 1.5))
    parts += [place(o, rz=-math.pi / 2, at=(X0 - 0.5, -9.0, -4.3)) for o in letters("東急文化会館", 3.4, hexc(0x9b2a22), "gothic", (0, 0, 0))]  # its name over the hoardings
    parts.append(sheets)
    ob = join("dome", parts)
    att, before = colours(ob)
    keep = before[:, :3].copy()
    shade(ob, key, ao=0.6, cast=0.45, reach=9.0)
    # (the dome's sheets keep the sky they mirror: only the shadow of what stands over them is laid on them)
    att, after = colours(ob)
    co = np.array([v.co[:] for v in ob.data.vertices])
    on = (np.hypot(co[:, 0], co[:, 1]) < R + 0.2) & (co[:, 2] > Z0 + 0.01)
    after[on, :3] = keep[on] * (0.55 + 0.45 * (after[on, :3].sum(1) / np.maximum(keep[on].sum(1), 1e-6)))[:, None]
    att.data.foreach_set("color", after.ravel())
    return ob


def river():
    """The Shibuya River at the station in the last weeks it was open, seen from Miyamasu Bridge looking up it: six
    metres between walls of squared stone laid in level courses, damp at their foot, a ledge of concrete along each,
    a drain running out of the west wall, a pipe rail on the bank; the works coming down the river to meet the
    bridge: the contract's board on a timber gantry, red lamps on trestles, a board fence, the channel shored with
    timbers, and beyond them the new culvert's slab already across it and its mouth dark under it. The channel runs
    along Y (upstream to +Y); the origin is on its line at street level, ten metres upstream of the bridge's middle;
    behind the lens, the bridge with its parapets and newel posts and the mouth of 1934 under the store."""
    S = Solid()
    stone, damp, joint, cope_c, bank, rail, dark, timber, conc = (hexc(h) for h in (0x7e786c, 0x504c45, 0x2e2b27, 0x9c9688, 0x8a857a, 0x2f2c29, 0x0e1012, 0x6a5640, 0xb1ada2))
    board_c, red_lamp = hexc(0xece6d4), hexc(0xd23a22)
    W, DEEP, B = 3.0, 2.88, -10.0
    BY0, BY1 = B - 4.0, B + 4.0
    YN, YM, YC, YE = B - 7.0, 24.0, 31.0, 64.0   # the store's mouth; where the stones are no longer drawn one by one; the new culvert's mouth; where it is gone
    WL = -DEEP + 0.24
    GY, PIPE = 12.0, (-W, 3.2, -1.5)
    course, sl, g = 0.32, 0.64, 0.012
    eye, _ = site_eye("river")
    key = in_model(KEY_MAP, SITES["river"]["h"])
    for s in (-1, 1):
        x, o = s * W, (-s, 0, 0)
        S.sheet((x, YN, -DEEP), (0, YC + 0.4 - YN, 0), (0, 0, DEEP), 14, 1, joint, o)  # the joints: the wall behind its stones
        for c in range(9):
            z0, z1 = -DEEP + c * course + g, -DEEP + (c + 1) * course - g
            wet = damp if c < 2 else mix(damp, stone, 0.55) if c == 2 else stone  # (the river's mark on its wall)
            y = BY1 - (c % 2) * sl / 2
            while y < YM:  # each stone, half a stone over the one under it
                a, b = max(BY1, y + g), min(YM, y + sl - g)
                if b > a:
                    under = s < 0 and abs((a + b) / 2 - PIPE[1]) < 0.45 and z1 < PIPE[2]  # (and the drain's, under its pipe)
                    S.quad([(x - s * 0.012, a, z0), (x - s * 0.012, b, z0), (x - s * 0.012, b, z1), (x - s * 0.012, a, z1)], mix(wet, damp, 0.7) if under else wet, o)
                y += sl
            for y0, y1, n in ((YN, BY1, 3), (YM, YC + 0.4, 3)):  # (under the bridge and far up the river: a course at a time)
                S.sheet((x - s * 0.012, y0, z0), (0, y1 - y0, 0), (0, 0, z1 - z0), n, 1, wet, o)
        # the coping stones along its top, the ledge at its foot, the bank at the street's level
        y = BY1
        while y < YM:
            S.box(min(x - s * 0.03, x + s * 0.45), y + 0.006, 0.0, max(x - s * 0.03, x + s * 0.45), min(y + 0.96, YM) - 0.006, 0.13, cope_c, skip="d")
            y += 0.96
        for y0, y1 in ((YN, BY0), (YM, YC)):
            S.box(min(x - s * 0.03, x + s * 0.45), y0, 0.0, max(x - s * 0.03, x + s * 0.45), y1, 0.13, cope_c, skip="dsn")
        for k in range(12):
            y0, y1 = BY1 + (YC - BY1) * k / 12, BY1 + (YC - BY1) * (k + 1) / 12
            S.box(min(x, x - s * 0.36), y0, -DEEP, max(x, x - s * 0.36), y1, WL + 0.2, conc, skip="dsn" + ("e" if s > 0 else "w"))
        S.sheet((x + s * 0.45, YN, 0.02), (s * 3.8, 0, 0), (0, YE - YN, 0), 3, 27, bank, (0, 0, 1))
        # the rail along the bank from the bridge to the works: two pipes on slender posts
        fx = x + s * 0.24
        for k in range(int((GY - 0.6 - BY1) / 1.8) + 1):
            py = BY1 + 0.5 + k * 1.8
            S.box(fx - 0.025, py - 0.025, 0.13, fx + 0.025, py + 0.025, 1.0, rail, skip="d")
            if py + 1.8 < GY:
                for z in (0.55, 0.96):
                    S.box(fx - 0.02, py, z, fx + 0.02, py + 1.8, z + 0.04, rail, skip="sn")
    # the works' fences beyond the gantry: boards on the east bank, posts and wire on the west
    y = GY + 0.8
    while y < YC + 6:
        S.quad([(W + 0.5, y, 0.02), (W + 0.5, y + 0.19, 0.02), (W + 0.5, y + 0.19, 1.75), (W + 0.5, y, 1.75)], hexc(0x8b7355), (-1, 0, 0))
        y += 0.21
    for z in (0.5, 1.4):
        S.box(W + 0.5, GY + 0.8, z, W + 0.56, YC + 6, z + 0.09, timber, skip="sne")
    for k in range(9):
        py = GY + 1.2 + k * 2.4
        S.box(-W - 0.3, py - 0.05, 0.02, -W - 0.2, py + 0.05, 1.15, timber, skip="d")
    for z in (0.45, 0.8, 1.1):
        S.box(-W - 0.26, GY + 1.2, z, -W - 0.24, GY + 1.2 + 8 * 2.4, z + 0.015, rail, skip="sn")
    # the drain: a stoneware pipe in the west wall, its collar, and what runs out of it
    px, py, pz = PIPE
    ring = lambda r, x, col: [S.quad([(x, py, pz), (x, py + r * math.cos(a0), pz + r * math.sin(a0)), (x, py + r * math.cos(a1), pz + r * math.sin(a1))], col, (1, 0, 0))
                              for a0, a1 in ((k / 12 * 2 * math.pi, (k + 1) / 12 * 2 * math.pi) for k in range(12))]
    ring(0.3, px + 0.03, conc)
    ring(0.2, px + 0.05, dark)
    for k in range(5):  # the fall of it, out and down to the river
        t0, t1 = k / 5, (k + 1) / 5
        f = lambda t: (px + 0.06 + 0.3 * t, pz - 0.16 - (pz - 0.16 - WL) * t * t)
        (xa, za), (xb, zb) = f(t0), f(t1)
        S.quad([(xa, py - 0.07, za), (xa, py + 0.07, za), (xb, py + 0.07, zb), (xb, py - 0.07, zb)], hexc(0x9fb0ad), (1, 0, 0.3))
        S.quad([(xa - 0.07, py, za), (xa + 0.07, py, za), (xb + 0.07, py, zb), (xb - 0.07, py, zb)], hexc(0x9fb0ad), (0, -1, 0))
    # Miyamasu Bridge, where the frame is taken from: its deck, the slab's face over the water with its arch, the
    # parapets (a solid rail on panels pierced with openings) and the newel posts with the name
    stone2 = hexc(0x878172)
    for yy, sgn in ((BY1, 1), (BY0, -1)):
        for k in range(12):
            xa, xb = -W + 2 * W * k / 12, -W + 2 * W * (k + 1) / 12
            za, zb = -0.75 - 0.55 * math.sin(math.pi * k / 12), -0.75 - 0.55 * math.sin(math.pi * (k + 1) / 12)
            S.quad([(xa, yy, za), (xb, yy, zb), (xb, yy, 0.12), (xa, yy, 0.12)], stone2, (0, sgn, 0))
    S.quad([(-W, BY0, -1.0), (W, BY0, -1.0), (W, BY1, -1.0), (-W, BY1, -1.0)], hexc(0x4a4842), (0, 0, -1))
    S.sheet((-W - 0.5, BY0, 0.12), (2 * W + 1.0, 0, 0), (0, BY1 - BY0, 0), 7, 8, hexc(0x7d7a72), (0, 0, 1))
    for yy in (BY0 + 0.15, BY1 - 0.15):
        S.box(-W - 0.5, yy - 0.15, 0.12, W + 0.5, yy + 0.15, 0.3, stone, skip="d")
        if yy > B:  # (the parapet the lens is held over is not in its picture: on a phone it lay across the foot of the finder)
            continue
        S.box(-W - 0.5, yy - 0.13, 0.85, W + 0.5, yy + 0.13, 1.0, stone)
        for k in range(8):
            xx = -W - 0.4 + k * (2 * W + 0.8) / 7
            S.box(xx - 0.09, yy - 0.1, 0.3, xx + 0.09, yy + 0.1, 0.85, stone2, skip="du")
        for xx in (-W - 0.75, W + 0.75):
            S.box(xx - 0.25, yy - 0.25, 0.0, xx + 0.25, yy + 0.25, 1.35, stone, skip="du")
            S.box(xx - 0.3, yy - 0.3, 1.35, xx + 0.3, yy + 0.3, 1.47, stone2)
    S.quad([(-W, YN + 1.2, -DEEP), (W, YN + 1.2, -DEEP), (W, YN + 1.2, 0.12), (-W, YN + 1.2, 0.12)], dark, (0, 1, 0))  # the mouth of 1934, under the store
    # the works. The contract's board on a timber gantry across the river, facing the bridge
    for s in (-1, 1):
        S.box(s * (W + 0.7) - 0.09, GY - 0.09, 0.0, s * (W + 0.7) + 0.09, GY + 0.09, 3.0, timber, skip="d")
    S.box(-W - 0.8, GY - 0.08, 2.82, W + 0.8, GY + 0.08, 3.0, timber)
    S.box(-1.35, GY - 0.03, 1.3, 1.35, GY + 0.03, 2.72, board_c)
    for x in (-1.0, 1.0):
        S.box(x - 0.02, GY - 0.02, 2.72, x + 0.02, GY + 0.02, 2.82, timber, skip="du")
    S.box(-1.2, GY - 0.036, 2.13, 1.2, GY - 0.03, 2.15, RED, skip="n")
    # red lamps on trestles along both banks, and planks stacked for the shoring
    lamps = []
    for s in (-1, 1):
        for ty in (1.0, 6.0):
            x = s * (W + 1.3)
            S.box(x - 0.6, ty - 0.03, 0.75, x + 0.6, ty + 0.03, 0.88, board_c)
            for lx in (-0.5, 0.5):
                for dy in (-0.14, 0.14):
                    S.quad([(x + lx - 0.03, ty + dy, 0.02), (x + lx + 0.03, ty + dy, 0.02), (x + lx + 0.03, ty, 0.8), (x + lx - 0.03, ty, 0.8)], timber, (0, dy, 0.2))
            lamps.append(lathe([(0.0, 0.88, red_lamp), (0.07, 0.92, red_lamp), (0.08, 0.98, red_lamp), (0.05, 1.04, red_lamp), (0.0, 1.06, red_lamp)], seg=10, at=(x, ty, 0)))
    for k in range(3):
        for j in range(4):
            S.box(-W - 2.6 + j * 0.26, 7.6, 0.02 + k * 0.07, -W - 2.6 + j * 0.26 + 0.24, 11.2, 0.02 + k * 0.07 + 0.06, hexc(0x9a8362), skip="d")
    # the channel shored for the culvert: a waling along each wall, struts across from one to the other
    for s in (-1, 1):
        S.box(min(s * W, s * (W - 0.2)), GY + 3.0, -0.75, max(s * W, s * (W - 0.2)), YC, -0.55, timber, skip="sn")
    for k in range(5):
        y = GY + 4.0 + k * 3.0
        S.box(-W + 0.2, y - 0.1, -0.75, W - 0.2, y + 0.1, -0.55, timber, skip="we")
    # the new culvert, come this far: its slab across the channel, its mouth, props under the slab's edge, the bars of
    # the next pour standing out of it
    for k in range(11):
        y0, y1 = YC + (YE - YC) * k / 11, YC + (YE - YC) * (k + 1) / 11
        S.box(-W - 0.6, y0, -0.38, W + 0.6, y1, 0.1, conc, skip="dn" + ("" if k == 0 else "s"))
    S.quad([(-W, YC + 0.35, -DEEP), (W, YC + 0.35, -DEEP), (W, YC + 0.35, -0.38), (-W, YC + 0.35, -0.38)], dark, (0, -1, 0))
    for x in (-1.8, 0.0, 1.8):
        S.box(x - 0.08, YC + 0.1, WL, x + 0.08, YC + 0.26, -0.38, timber, skip="du")
    for k in range(13):
        x = -W - 0.4 + k * (2 * W + 0.8) / 12
        S.box(x - 0.012, YC + 0.05, 0.1, x + 0.012, YC + 0.074, 0.62, hexc(0x3a2a22), skip="d")
    fade = lambda v: float(np.clip((YE - v[1]) / 16.0, 0, 1) * np.clip((7.0 - abs(v[0])) / 2.2, 0, 1))
    parts = [S.ob("river", alpha=fade)] + lamps
    parts += letters("渋谷川暗渠工事", 0.3, INK, "gothic", (0, GY - 0.035, 2.38))
    parts += letters("工事主任 神原", 0.19, INK, "gothic", (0, GY - 0.035, 1.92))
    parts += letters("現場主任 早瀬", 0.19, INK, "gothic", (0, GY - 0.035, 1.6))
    for xx, name in ((-W - 0.75, "宮益橋"), (W + 0.75, "みやますはし")):
        parts.append(box(xx - 0.16, BY0 - 0.27, 0.35, xx + 0.16, BY0 - 0.25, 1.25, hexc(0x3b3833)))
        parts += letters(name, 0.26 if len(name) == 3 else 0.14, hexc(0xe9e2cc), "mincho", (xx, BY0 - 0.275, 1.2), vertical=True, track=1.0 if len(name) == 3 else 0.98)
    ob = join("river", parts)
    tree = shade(ob, key, ao=0.6, cast=0.4, reach=5.0)
    # the water: slow, a long swell down the current and a finer one across it, and the rings where the drain falls in
    rows = list(np.arange(YN + 1.2, BY1, 1.0)) + list(np.arange(BY1, 14.0, 0.2))
    step = 0.2
    while rows[-1] < YC + 0.35:
        step *= 1.06
        rows.append(min(rows[-1] + step, YC + 0.35))

    def slope(x, y):
        r = math.hypot(x - (px + 0.36), y - py)
        k = 0.16 * math.cos(r * 10.0) * math.exp(-r / 1.1)
        far = 1 / (1 + max(y - 6.0, 0.0) / 6.0)  # (the fine ripples are below what a sheet's points can carry far off)
        sx = 0.025 * math.cos(x * 2.3 + 1.1 * math.sin(y * 0.6)) + k * (x - (px + 0.36)) / max(r, 0.05)
        sy = 0.05 * math.cos(y * 1.9 + 1.6 * math.sin(x * 0.8 + y * 0.23)) + 0.02 * far * math.cos(y * 4.3 + x * 1.9) + k * (y - py) / max(r, 0.05)
        return sx, sy

    sheet = water("water", eye, key, tree, -W + 0.36, W - 0.36, rows, WL, slope)
    return join("river", [ob, sheet])


# ---- the file -----------------------------------------------------------------------------------------------------

def preview(folder, obs):
    """Two stills of each, from in front and a little above and from its three-quarter, framed to its size."""
    from mathutils import Vector
    os.makedirs(folder, exist_ok=True)
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in [e.identifier for e in type(sc.render).bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE_NEXT"
    sc.render.resolution_x, sc.render.resolution_y = 1000, 760
    sc.world = bpy.data.worlds.new("w")
    sc.world.use_nodes = True
    sc.world.node_tree.nodes["Background"].inputs[0].default_value = (0.42, 0.44, 0.48, 1)
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.0
    sun.rotation_euler = (0.8, 0.2, -0.5)
    sc.collection.objects.link(sun)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.lens = 35
    cam.data.clip_end = 2000
    sc.collection.objects.link(cam)
    sc.camera = cam
    for ob in obs:
        ob.hide_render = True
    for ob in obs:
        ob.hide_render = False
        co = np.array([v.co[:] for v in ob.data.vertices])
        lo, hi = co.min(0), co.max(0)
        c, size = (lo + hi) / 2, float(np.linalg.norm(hi - lo))
        for name, dirn in (("front", (0.0, -1.0, 0.25)), ("three", (0.75, -0.75, 0.45))):
            v = Vector(dirn).normalized()
            cam.location = Vector(c) + v * size * 1.05
            cam.rotation_euler = (-v).to_track_quat("-Z", "Y").to_euler()
            sc.render.filepath = os.path.join(folder, f"{ob.name}_{name}.png")
            bpy.ops.render.render(write_still=True)
        ob.hide_render = True


def view(folder, obs):
    """Each site as its frame sees it, on a desktop and on a phone: from the stand point through the frame's lens, lit
    and toned as the page's material does it (past.js), near enough to judge a model before the story is played."""
    from mathutils import Vector
    os.makedirs(folder, exist_ok=True)
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples, sc.cycles.use_denoising = 8, False
    sc.view_settings.view_transform = "Standard"
    sc.world = bpy.data.worlds.new("w")
    sc.world.use_nodes = True
    sc.world.node_tree.nodes["Background"].inputs[0].default_value = (0.012, 0.016, 0.03, 1)
    mat = bpy.data.materials.new("view")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    col, em, out = nt.nodes.new("ShaderNodeVertexColor"), nt.nodes.new("ShaderNodeEmission"), nt.nodes.new("ShaderNodeOutputMaterial")
    col.layer_name = "View"
    nt.links.new(col.outputs["Color"], em.inputs["Color"])
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.clip_start, cam.data.clip_end, cam.data.sensor_fit = 0.1, 2000, "VERTICAL"
    sc.collection.objects.link(cam)
    sc.camera = cam
    for ob in obs:
        ob.hide_render = True
    enc = lambda c: np.where(c <= 0.0031308, c * 12.92, 1.055 * np.clip(c, 0, None) ** (1 / 2.4) - 0.055)
    for ob in obs:
        if ob.name not in SITES:
            continue
        key, fill = in_model(SITES[ob.name].get("key", KEY_MAP), SITES[ob.name]["h"]), in_model((-0.6, 0.5, 0.25), SITES[ob.name]["h"])
        key, fill = key / np.linalg.norm(key), fill / np.linalg.norm(fill)
        eye, at = site_eye(ob.name)
        co = np.array([v.co[:] for v in ob.data.vertices])
        n = np.array([v.normal[:] for v in ob.data.vertices])
        n *= np.sign(np.sum(n * (eye - co), axis=1))[:, None]  # (drawn from both sides: lit as the side that is seen)
        _, c = colours(ob)
        c3 = enc(np.clip(c[:, :3] * (0.36 + 0.72 * np.clip(n @ key, 0, 1) + 0.2 * np.clip(n @ fill, 0, 1))[:, None], 0, 1))
        L = c3 @ np.array([0.3, 0.59, 0.11])
        t = np.clip((L + 0.05) / 1.05, 0, 1)
        P = mix(np.array([0.02, 0.018, 0.016]), np.array([1.02, 0.94, 0.8]), t * t * (3 - 2 * t))
        c3 = c3 + (0.65 * P + 0.35 * P * (0.7 + 0.6 * c3 / np.maximum(L, 0.02)[:, None]) - c3) * 0.82
        att = ob.data.color_attributes.new("View", "FLOAT_COLOR", "POINT")
        att.data.foreach_set("color", np.c_[lin(np.clip(c3, 0, 1)) * c[:, 3:4], np.ones(len(c))].ravel())
        ob.data.materials.clear()
        ob.data.materials.append(mat)
        ob.hide_render = False
        v = Vector(at - eye).normalized()
        cam.location = Vector(eye)
        cam.rotation_euler = v.to_track_quat("-Z", "Y").to_euler()
        cam.data.angle_y = math.radians(SITES[ob.name]["lens"])
        for w, h in ((1440, 900), (390, 844)):
            sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = w, h, 100
            sc.render.filepath = os.path.join(folder, f"{ob.name}_{w}.png")
            bpy.ops.render.render(write_still=True)
        ob.hide_render = True


def glb(path):
    import json
    import struct
    b = open(path, "rb").read()
    n = struct.unpack("<I", b[12:16])[0]
    return json.loads(b[20:20 + n]), b[28 + n:]


def keep_others(path, new):
    """Put the models of the file `new` into the file at `path` in place of its own of those names, and keep every
    other model there byte for byte (--only: the lettering is the building machine's fonts, and a model that was not
    asked for must not change with the machine)."""
    import json
    import struct
    EXT = "EXT_meshopt_compression"
    (ja, ba), (jb, bb) = glb(path), glb(new)
    names = {n["name"]: (ja, ba, n) for n in ja["nodes"]}
    names.update({n["name"]: (jb, bb, n) for n in jb["nodes"]})
    out = {k: v for k, v in ja.items() if k not in ("nodes", "meshes", "accessors", "bufferViews", "buffers", "scenes")}
    out.update(nodes=[], meshes=[], accessors=[], bufferViews=[])
    data, fallback = bytearray(), 0
    for name in sorted(names):
        j, b, node = names[name]
        mesh = json.loads(json.dumps(j["meshes"][node["mesh"]]))
        seen = {}

        def acc(i):
            if i not in seen:
                nonlocal fallback
                a = dict(j["accessors"][i])
                bv = json.loads(json.dumps(j["bufferViews"][a["bufferView"]]))
                e = bv["extensions"][EXT]
                data.extend(b"\0" * (-len(data) % 4))
                chunk = b[e.get("byteOffset", 0):e.get("byteOffset", 0) + e["byteLength"]]
                e["buffer"], e["byteOffset"] = 0, len(data)
                data.extend(chunk)
                bv["buffer"], bv["byteOffset"] = 1, fallback
                fallback += bv["byteLength"] + (-bv["byteLength"] % 4)
                a["bufferView"] = len(out["bufferViews"])
                a.pop("byteOffset", None)
                out["bufferViews"].append(bv)
                seen[i] = len(out["accessors"])
                out["accessors"].append(a)
            return seen[i]

        for pr in mesh["primitives"]:
            pr["attributes"] = {k: acc(i) for k, i in pr["attributes"].items()}
            pr["indices"] = acc(pr["indices"])
            pr["material"] = 0
        out["nodes"].append({**node, "mesh": len(out["meshes"])})
        out["meshes"].append(mesh)
    data.extend(b"\0" * (-len(data) % 4))
    out["buffers"] = [{"byteLength": len(data)}, {"byteLength": fallback, "extensions": {EXT: {"fallback": True}}}]
    out["scenes"] = [{"name": "Scene", "nodes": list(range(len(out["nodes"])))}]
    out["scene"] = 0
    js = json.dumps(out, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    with open(path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, 28 + len(js) + len(data)) + struct.pack("<I4s", len(js), b"JSON") + js + struct.pack("<I4s", len(data), b"BIN\0") + bytes(data))


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    os.makedirs(OUT, exist_ok=True)
    only = argv[argv.index("--only") + 1].split(",") if "--only" in argv else None
    makers = [postbox, board, shoeshine, dome, river, umbrella, lamp, tram]
    obs = [f() for f in makers if not only or f.__name__ in only]
    for ob in obs:
        print(f"  {ob.name}: {len(ob.data.vertices)} vertices, {sum(len(p.vertices) - 2 for p in ob.data.polygons)} triangles")
    if "--preview" in argv:
        preview(argv[argv.index("--preview") + 1], obs)
        return
    if "--view" in argv:
        view(argv[argv.index("--view") + 1], obs)
        return
    path = os.path.join(OUT, "past.glb")
    to = path if not only else os.path.join(OUT, "past.part.glb")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=to, export_format="GLB", use_selection=True, export_vertex_color="ACTIVE", export_normals=True,
                              export_materials="EXPORT", export_cameras=False, export_lights=False, export_animations=False, export_texcoords=False)
    compress(to)
    if only:  # the others stay as they are in the file
        keep_others(path, to)
        os.remove(to)
    print(f"  {os.path.relpath(path, ROOT)}: {os.path.getsize(path) / 1e3:.0f} kB")


if __name__ == "__main__":
    main()
