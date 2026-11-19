"""The Akita who walks: web/assets/animals/akita.glb, a dog a story can give the player as a guide
(web/game/companion.js). He shares the broad skull of the Hachiko Square bronze, with a shorter muzzle
and a pair of upright, cupped ears shaped from the owner's portrait of a living Akita.

Sizes: a male Akita Inu stands 64 to 70 cm at the withers (the Japan Kennel Club's standard: 67 cm, 3 cm either
way) and is a little longer than tall (10:11); Hachiko himself was measured at 64 cm and 41 kg. This one stands
0.65 m at the withers and 0.72 m from breast to rump, his tail curled over his back.

Coat: red fawn over the back, the outer legs and the skull, with urajiro (the standard's word: whitish fur) on the
sides of the muzzle, the cheeks, under the jaw and neck, the chest, the belly, the inside and the lower half of
the legs and the underside of the tail. Hachiko's coat was a pale cream fawn (his mounted hide is in the National
Museum of Nature and Science, Ueno); the fawn here is kept light for that.

Clips, all on the spot (the page moves him): `idle` (standing, the tail moving), `walk` (a four-beat walk at
WALK_SPEED), `trot` (diagonal pairs at TROT_SPEED), `run` (a rotary gallop at RUN_SPEED, as a dog runs to keep ahead of
someone running: hind, hind, fore, fore, and a moment with no paw down) and `sit` (as the statue sits). The legs are placed by
inverse kinematics in his sagittal plane, so a paw on the ground stays on it and travels back at the clip's speed.

    pip install bpy==5.2.3
    python blender/build_dog.py            # -> web/assets/animals/akita.glb (meshopt-compressed)
"""
import math
import os
import sys
import tempfile

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "pipeline"))
sys.path.insert(0, os.path.join(ROOT, "cities", "shibuya"))
import sculptkit as sk  # noqa: E402
import hachiko as statue  # noqa: E402  (his head)

OUT = os.path.join(ROOT, "web", "assets", "animals", "akita.glb")
CELL = 0.0085         # resolves the eyelids, stop and interdigital clefts
FPS = 30
WALK_SPEED, WALK_T = 0.95, 0.74      # m/s over the ground, and one stride's seconds
TROT_SPEED, TROT_T = 2.3, 0.44
RUN_SPEED, RUN_T = 6.0, 0.32         # (about three strides a second: a dog's gallop)
HEAD_AT = (0.47, 0.0, 0.83)          # the middle of his skull, standing
LEG_Y, HIND_Y = 0.10, 0.11

# the joints, standing: (x forward, z up) in his sagittal plane; metres
HIPS = (-0.25, 0.46)
CHEST = (0.20, 0.50)
NECK0, NECK1, NOSE = (0.24, 0.56), (0.40, 0.78), (0.62, 0.80)
TAIL0, TAIL1, TAIL2 = (-0.40, 0.56), (-0.45, 0.70), (-0.33, 0.79)
SHOULDER, ELBOW, WRIST = (0.22, 0.46), (0.22, 0.25), (0.22, 0.04)
HIP, STIFLE, HOCK, TOE = (-0.25, 0.44), (-0.20, 0.30), (-0.33, 0.16), (-0.30, 0.03)


def muzzle_x(x):
    # The living dog's muzzle tapers sooner than the long profile of the cast.
    return x + 0.48 * np.maximum(0, x - 0.075)


def ear_frame(x, y, z):
    # The opening faces forward and slightly outward. Each tip leans away from the crown.
    height = (z - 0.047) * 1.18
    width = abs(y) - 0.093 - 0.40 * height
    depth = x + 0.018 - 0.16 * height + 0.32 * width
    return depth, width, height


def upright_ears(x, y, z):
    depth, width, height = ear_frame(x, y, z)
    outer = sk.capsule((0, 0, 0), (0, 0, 0.087), 0.052, 0.013)
    cup = sk.capsule((0.026, 0, 0.021), (0.016, 0, 0.073), 0.034, 0.009)
    return np.maximum(outer(depth * 1.65, width, height), -cup(depth, width, height))


def body():
    """The dog standing, as a signed distance field: x forward, y to his left, z up from the ground."""
    L = sk.mirror_v
    chest = sk.ellipsoid((0.19, 0.0, 0.50), (0.20, 0.16, 0.185))
    trunk = sk.capsule((0.16, 0.0, 0.51), (-0.24, 0.0, 0.50), 0.162, 0.14)
    rump = sk.ellipsoid((-0.27, 0.0, 0.49), (0.155, 0.148, 0.158))
    withers = sk.ellipsoid((0.17, 0.0, 0.60), (0.12, 0.10, 0.07))
    neck = sk.capsule((0.24, 0.0, 0.57), (0.41, 0.0, 0.79), 0.138, 0.115)
    ruff = sk.ellipsoid((0.32, 0.0, 0.65), (0.133, 0.147, 0.15))
    shoulders = L(sk.ellipsoid((0.21, LEG_Y, 0.47), (0.085, 0.065, 0.14)))
    upper_f = L(sk.capsule((0.22, LEG_Y, 0.44), (0.22, LEG_Y, 0.25), 0.064, 0.05))
    lower_f = L(sk.capsule((0.22, LEG_Y, 0.25), (0.22, LEG_Y, 0.07), 0.05, 0.043))
    def paw(x, y):
        pad = sk.ellipsoid((x, y, 0.033), (0.049, 0.044, 0.03))
        toes = [sk.ellipsoid((x + 0.048 - abs(i) * 0.007, y + i * 0.021, 0.021),
                             (0.027, 0.014, 0.019)) for i in (-1.5, -0.5, 0.5, 1.5)]
        return L(sk.smooth_union(0.006, pad, *toes))
    paws_f = paw(0.236, LEG_Y)
    thighs = L(sk.ellipsoid((-0.25, HIND_Y, 0.40), (0.125, 0.078, 0.155)))
    shanks = L(sk.capsule((-0.21, HIND_Y, 0.31), (-0.33, HIND_Y, 0.165), 0.062, 0.04))
    hocks = L(sk.capsule((-0.33, HIND_Y, 0.165), (-0.315, HIND_Y, 0.06), 0.039, 0.036))
    paws_h = paw(-0.291, HIND_Y)
    tail = sk.path([(-0.39, 0.0, 0.55), (-0.46, 0.0, 0.66), (-0.44, 0.02, 0.77), (-0.35, 0.05, 0.82), (-0.26, 0.07, 0.78), (-0.25, 0.08, 0.70), (-0.30, 0.07, 0.66)],
                   [0.055, 0.072, 0.077, 0.073, 0.065, 0.054, 0.035])
    nostrils = L(sk.ellipsoid((0.253, 0.017, -0.032), (0.012, 0.008, 0.007)))
    pads = L(sk.ellipsoid((0.173, 0.033, -0.054), (0.055, 0.031, 0.029)))
    face = sk.smooth_union(0.009, statue.head(ears=(upright_ears,)), pads)
    eyes = L(sk.ellipsoid((0.095, 0.063, 0.01), (0.015, 0.017, 0.011)))
    face = sk.union(sk.subtract(0.002, face, nostrils), eyes)
    head = statue.posed(lambda x, y, z: face(muzzle_x(x), y, z), HEAD_AT, 0.0, -4.0)
    b = sk.smooth_union(0.05, chest, trunk, rump, withers, neck, ruff, shoulders, thighs)
    legs = sk.smooth_union(0.025, upper_f, lower_f, paws_f, shanks, hocks, paws_h)
    d = sk.smooth_union(0.035, b, legs)
    d = sk.smooth_union(0.045, d, head)
    d = sk.smooth_union(0.03, d, tail)
    return d


def coat(v, n):
    """Each vertex's colour (linear RGB): red fawn, the urajiro, the black of the nose, the eyes and the lips."""
    s = lambda x, a, b: np.clip((x - a) / (b - a), 0.0, 1.0) ** 2 * (3 - 2 * np.clip((x - a) / (b - a), 0.0, 1.0))
    x, y, z = v[:, 0], v[:, 1], v[:, 2]
    # the head's own frame (hachiko.posed: yaw 0, pitch -4)
    cp, sp = math.cos(math.radians(-4.0)), math.sin(math.radians(-4.0))
    hx0, hz0 = x - HEAD_AT[0], z - HEAD_AT[2]
    hx, hz, hy = hx0 * cp + hz0 * sp, -hx0 * sp + hz0 * cp, y
    hx = muzzle_x(hx)
    on_head = s(x, 0.36, 0.42)
    on_tail = (x < -0.3) & (z > 0.56)
    white = np.maximum.reduce([
        s(-n[:, 2], 0.15, 0.6) * (1 - on_head),                       # whatever faces the ground: belly, brisket, under the tail
        (1 - s(z, 0.2, 0.31)) * (1 - on_tail),                        # the legs' lower half
        s(x, 0.27, 0.36) * (1 - s(z, 0.5, 0.62)) * (1 - on_head),     # the breast
        s(np.abs(y) * 0 + (0.105 - np.abs(np.abs(y) - 0.02)), 0.0, 0.03) * (1 - s(z, 0.3, 0.42)) * (np.abs(y) < 0.085),  # the legs' inner faces
        on_head * s(hx + abs(hy) * 0.7, -0.065, 0.045) * (1 - s(hz + 0.15 * hx, -0.026, 0.013)),
        s(x, 0.18, 0.37) * (1 - s(z + abs(y) * 0.9, 0.59, 0.82)),    # cream bib tapers between the cheeks
        on_head * (1 - s(hz, -0.085, -0.05)),                         # under the jaw
    ])
    red = np.array([0.46, 0.27, 0.125])
    cream = np.array([0.80, 0.72, 0.58])
    c = red[None] * (1 - white[:, None]) + cream[None] * white[:, None]
    depth, width, height = ear_frame(hx, hy, hz)
    aperture = abs(width) / np.maximum(0.010, 0.047 - 0.39 * height)
    ear = s(height, 0.003, 0.024) * s(depth, -0.019, -0.006) * (1 - s(hx, 0.012, 0.035))
    rim = ear * (1 - s(aperture, 0.86, 1.08)) * (1 - 0.58 * s(height, 0.077, 0.092))
    c = c * (1 - rim[:, None]) + np.array([0.66, 0.50, 0.37]) * rim[:, None]
    cup = ear * (1 - s(aperture, 0.24, 0.73)) * (1 - s(height, 0.067, 0.082))
    c = c * (1 - cup[:, None]) + np.array([0.087, 0.044, 0.034]) * cup[:, None]
    dark = np.array([0.012, 0.01, 0.01])
    nose = on_head * (1 - s(np.sqrt((hx - 0.238) ** 2 + hy ** 2 + (hz + 0.035) ** 2), 0.024, 0.034))
    eye = np.zeros(len(v))
    for sg in (-1, 1):
        eye = np.maximum(eye, 1 - s(np.sqrt((hx - 0.095) ** 2 + (hy - sg * 0.063) ** 2 + (1.5 * (hz - 0.01)) ** 2), 0.018, 0.025))
    lips = on_head * (1 - s(np.abs(hz + 0.08), 0.004, 0.009)) * s(hx, 0.11, 0.14) * (1 - s(np.abs(hy), 0.03, 0.05))
    k = np.maximum.reduce([nose, eye * on_head, lips * 0.8])
    c = c * (1 - k[:, None]) + dark[None] * k[:, None]
    gloss = np.maximum(nose, eye * on_head)
    return c, gloss


# ------------------------------------------------------------------ the poses
def rot2(p, a):
    c, s = math.cos(a), math.sin(a)
    return (p[0] * c - p[1] * s, p[0] * s + p[1] * c)


def add(a, b):
    return (a[0] + b[0], a[1] + b[1])


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1])


def ang(v):
    return math.atan2(v[1], v[0])


def wrap(a):
    return (a + math.pi) % (2 * math.pi) - math.pi


def ik(root, target, l1, l2, knee_forward):
    """Two bones from root to target in the plane: the angles of the first and of the second."""
    d = sub(target, root)
    L = max(abs(l1 - l2) + 1e-3, min(l1 + l2 - 1e-4, math.hypot(*d)))
    base = ang(d)
    a = math.acos(max(-1.0, min(1.0, (l1 * l1 + L * L - l2 * l2) / (2 * l1 * L))))
    best = None
    for sgn in (1, -1):
        a1 = base + sgn * a
        knee = add(root, (l1 * math.cos(a1), l1 * math.sin(a1)))
        end = add(root, (L * math.cos(base), L * math.sin(base)))
        side = (knee[0] - (root[0] + end[0]) / 2)
        if best is None or (side > best[0]) == knee_forward:
            best = (side, a1, ang(sub(end, knee)))
    return best[1], best[2]


L_UP, L_LO = math.dist(SHOULDER, ELBOW), math.dist(ELBOW, WRIST)
L_TH, L_SH = math.dist(HIP, STIFLE), math.dist(STIFLE, HOCK)
FOOT = sub(TOE, HOCK)


def pose(root=(0.0, 0.0), pitch=0.0, fore=((0, 0), (0, 0)), hind=((0, 0), (0, 0)), foot=(0.0, 0.0), neck=0.0, head=0.0, tail=0.0, wag=0.0, head_yaw=0.0):
    """One frame: each bone's turn from standing, in the sagittal plane (radians, nose up), and the hips' move.
    root: the hips' offset; pitch: the trunk's; fore, hind: each paw's offset from where it stands (left, right);
    foot: each hind foot's turn (toe down negative); neck, head: turns over the trunk's; tail: the tail's lift;
    wag: its swing to his left; head_yaw: the head's turn to his left."""
    hips = add(HIPS, root)
    at = lambda j: add(hips, rot2(sub(j, HIPS), pitch))
    out = {"hips": pitch, "spine": pitch, "neck": pitch + neck, "head": pitch + neck + head, "tail1": pitch + tail, "tail2": pitch + tail * 1.5}
    for i, side in enumerate("LR"):
        a1, a2 = ik(at(SHOULDER), add(WRIST, fore[i]), L_UP, L_LO, knee_forward=False)
        out["upper_f." + side] = wrap(a1 - ang(sub(ELBOW, SHOULDER)))
        out["lower_f." + side] = wrap(a2 - ang(sub(WRIST, ELBOW)))
        toe = add(TOE, hind[i])
        hock = sub(toe, rot2(FOOT, foot[i]))
        a1, a2 = ik(at(HIP), hock, L_TH, L_SH, knee_forward=True)
        out["thigh." + side] = wrap(a1 - ang(sub(STIFLE, HIP)))
        out["shank." + side] = wrap(a2 - ang(sub(HOCK, STIFLE)))
        out["foot." + side] = foot[i]
    return {"root": root, "turn": out, "wag": wag, "head_yaw": head_yaw}


def step(u, duty, sweep, lift):
    """A paw's offset through one stride (u in 0..1): on the ground travelling back, then lifted forward."""
    u %= 1.0
    if u < duty:
        return (sweep * (0.5 - u / duty), 0.0)
    w = (u - duty) / (1 - duty)
    e = w * w * (3 - 2 * w)
    return (sweep * (-0.5 + e), lift * math.sin(math.pi * w) ** 1.2)


def toe_turn(u, duty, amount):
    """The hind foot's turn through the stride: the toe trails as it leaves the ground."""
    u %= 1.0
    if u < duty:
        return -amount * 0.5 * max(0.0, (u / duty - 0.6) / 0.4)
    w = (u - duty) / (1 - duty)
    return -amount * (0.5 + 0.5 * math.sin(math.pi * w)) * (1 - w)


def clip_gait(T, speed, duty, phases, lift, drop, bob, nod, beats=2, rock=0.8, rock_at=0.6, bob_at=0.0):
    """A walking clip's frames: phases (LF, RF, LH, RH). beats: how often the trunk rocks and bobs in a stride (twice in
    the walk and the trot, whose two halves are alike; once in the gallop); rock: how far it pitches, degrees."""
    n = int(round(T * FPS))
    sweep = speed * T * duty
    frames = []
    for f in range(n):
        u = f / n
        lf, rf, lh, rh = (step(u + p, duty, sweep, lift) for p in phases)
        w = 2 * math.pi * u
        frames.append(pose(root=(0.0, -drop + bob * math.cos(beats * w - bob_at)), pitch=math.radians(rock) * math.sin(beats * w + rock_at),
                           fore=(lf, rf), hind=(add(lh, (0.02, 0)), add(rh, (0.02, 0))), foot=(toe_turn(u + phases[2], duty, 0.9), toe_turn(u + phases[3], duty, 0.9)),
                           neck=math.radians(nod) * math.sin(beats * w + 1.2) - math.radians(4), head=math.radians(3) + math.radians(nod * 0.5) * math.sin(beats * w + 2.0),
                           tail=math.radians(2) * math.sin(2 * w), wag=math.radians(5) * math.sin(w)))
    return frames


def clip_idle(T=2.0):
    n = int(round(T * FPS))
    out = []
    for f in range(n):
        w = 2 * math.pi * f / n
        out.append(pose(root=(0.0, -0.006 + 0.003 * math.sin(w)), pitch=math.radians(0.4) * math.sin(w), neck=math.radians(1.2) * math.sin(w + 0.8),
                        head=math.radians(1.0) * math.sin(w + 1.6), wag=math.radians(10) * math.sin(2 * w), tail=math.radians(1.5) * math.sin(w)))
    return out


def clip_sit(T=2.4):
    """As the statue sits: on his haunches, the forelegs long and straight under his chest, his head up."""
    n = int(round(T * FPS))
    out = []
    P = math.radians(33)
    for f in range(n):
        w = 2 * math.pi * f / n
        br = math.sin(w)
        out.append(pose(root=(-0.02, -0.30 + 0.002 * br), pitch=P + math.radians(0.5) * br, fore=((-0.07, 0.0), (-0.07, 0.0)), hind=((0.24, 0.0), (0.24, 0.0)),
                        foot=(ang((1.0, -0.06)) - ang(FOOT), ang((1.0, -0.06)) - ang(FOOT)), neck=-math.radians(17) + math.radians(1) * br, head=-math.radians(14),
                        tail=-math.radians(8), wag=math.radians(7) * math.sin(w)))
    return out


CLIPS = {
    "idle": clip_idle,
    "walk": lambda: clip_gait(WALK_T, WALK_SPEED, 0.62, (0.5, 0.0, 0.25, 0.75), 0.05, 0.022, 0.004, 2.5),
    "trot": lambda: clip_gait(TROT_T, TROT_SPEED, 0.44, (0.0, 0.5, 0.5, 0.0), 0.075, 0.03, 0.012, 1.5),
    # (the hinds land at 0 and 0.1 of the stride, the fores at 0.35 and 0.45; off the ground from 0.72: the trunk nose up
    # as the hinds drive, nose down on the fores, and highest in the air)
    "run": lambda: clip_gait(RUN_T, RUN_SPEED, 0.27, (0.55, 0.65, 0.0, 0.9), 0.12, 0.05, 0.03, 5.0, beats=1, rock=5.0, rock_at=0.31, bob_at=2 * math.pi * 0.86),
    "sit": clip_sit,
}

BONES = [  # name, head, tail (x, z), y, parent
    ("hips", HIPS, (HIPS[0] + 0.12, HIPS[1]), 0.0, None),
    ("spine", (HIPS[0] + 0.12, HIPS[1]), CHEST, 0.0, "hips"),
    ("neck", NECK0, NECK1, 0.0, "spine"),
    ("head", NECK1, NOSE, 0.0, "neck"),
    ("tail1", TAIL0, TAIL1, 0.0, "hips"),
    ("tail2", TAIL1, TAIL2, 0.03, "tail1"),
] + [b for side, sg in (("L", 1), ("R", -1)) for b in [
    ("upper_f." + side, SHOULDER, ELBOW, sg * LEG_Y, "spine"),
    ("lower_f." + side, ELBOW, WRIST, sg * LEG_Y, "upper_f." + side),
    ("thigh." + side, HIP, STIFLE, sg * HIND_Y, "hips"),
    ("shank." + side, STIFLE, HOCK, sg * HIND_Y, "thigh." + side),
    ("foot." + side, HOCK, TOE, sg * HIND_Y, "shank." + side),
]]


def eye_surfaces(bpy, skin, rig, wet):
    """Fit the lids to the actual sculpt and dome each cornea above its socket."""
    from mathutils import Vector
    points, faces, colors = [], [], []
    steps = 40
    for side in (-1, 1):
        outward = Vector((0.84, side * 0.54, 0.04)).normalized()
        across = Vector((-0.54, side * 0.84, 0.12)).normalized()
        up = outward.cross(across) * side
        centre = Vector((0.558, side * 0.067, 0.835))
        start = len(points)
        for ring, radius in enumerate((0, 0.32, 0.39, 0.65, 0.82, 0.93, 1.0, 1.12)):
            for j in range(1 if ring == 0 else steps):
                a = 2 * math.pi * j / steps
                u, z = radius * math.cos(a), radius * math.sin(a)
                target = centre + across * (0.018 * u) + up * (0.011 * z * (1 - 0.33 * abs(u)))
                hit, loc, _, _ = skin.ray_cast(target + outward * 0.07, -outward)
                assert hit, "eye missed its socket"
                depth = 0.0014 + 0.0046 * max(0, 1 - radius ** 2)
                points.append(tuple(loc + outward * (depth if radius <= 1 else 0.0002)))
                iris = math.hypot(u * 1.55, z)
                amber = np.clip((iris - 0.39) / 0.16, 0, 1) * np.clip((1.02 - iris) / 0.19, 0, 1)
                pigment = (0.009 + amber * 0.056, 0.006 + amber * 0.024, 0.005 + amber * 0.012)
                colors.append((*pigment, 1))
                if ring:
                    i = start + 1 + (ring - 1) * steps
                    k = (j + 1) % steps
                    tris = [(start, i + j, i + k)] if ring == 1 else [
                        (i - steps + j, i + j, i + k), (i - steps + j, i + k, i - steps + k)]
                    faces.extend(tri if side > 0 else tri[::-1] for tri in tris)
    me = bpy.data.meshes.new("Corneas and lid margins")
    me.from_pydata(points, [], faces)
    me.update()
    for f in me.polygons:
        f.use_smooth = True
    me.color_attributes.new("Color", "FLOAT_COLOR", "POINT").data.foreach_set("color", np.ravel(colors))
    eyes = bpy.data.objects.new("Eyes", me)
    bpy.context.scene.collection.objects.link(eyes)
    me.materials.append(wet)
    eyes.vertex_groups.new(name="head").add(list(range(len(points))), 1, "REPLACE")
    eyes.parent = rig
    eyes.modifiers.new("Skin", "ARMATURE").object = rig
    return eyes


def guard_coat(bpy, skin, rig, v, normal, color, gloss):
    """Each tapered lock carries a fan of individual hairs and the weights at its root."""
    rng = np.random.default_rng(1923)
    eligible = np.flatnonzero((v[:, 2] > 0.09) & (v[:, 0] < 0.62) & (gloss < 0.01))
    roots = np.sort(rng.choice(eligible, min(10500, len(eligible)), replace=False))
    p, n = v[roots], normal[roots]
    x, y, z = p.T
    # Sweep back over the saddle, down the cheeks and limbs, and around the tail curl.
    plume = (x < -0.21) & (z > 0.64)
    flow = np.column_stack((-np.ones_like(x), 0.12 * np.sign(y),
                            -0.48 - 2.4 * ((x > 0.28) | (z < 0.36))))
    flow[plume, 0] = z[plume] - 0.735
    flow[plume, 2] = -x[plume] - 0.35
    flow[plume, 1] = 0.03
    flow -= np.sum(flow * n, axis=1)[:, None] * n
    flow /= np.maximum(np.linalg.norm(flow, axis=1)[:, None], 1e-6)
    side = np.cross(flow, n)
    length = (0.017 + 0.013 * (z > 0.36) + 0.014 * plume) * rng.uniform(0.74, 1.22, len(p))
    length *= 1 - 0.7 * np.clip((x - 0.38) / 0.17, 0, 1)
    width = length * rng.uniform(0.055, 0.10, len(p))
    along = flow * length[:, None]
    across = side * width[:, None]
    base = p - n * 0.0015
    ridge = p + along * 0.45 + n * (length * 0.19)[:, None]
    tip = p + along + n * (length * 0.22)[:, None]
    vertices = np.stack([base - across, base + across, ridge, tip], axis=1).reshape(-1, 3)
    faces = (4 * np.arange(len(p))[:, None, None] + np.array([[0, 1, 2], [0, 2, 3], [2, 1, 3]])).reshape(-1, 3)
    me = bpy.data.meshes.new("Outer coat")
    me.from_pydata(vertices.tolist(), [], faces.tolist())
    me.update()
    me.polygons.foreach_set("use_smooth", np.ones(len(faces), dtype=bool))
    me.normals_split_custom_set_from_vertices(np.repeat(n, 4, axis=0).tolist())
    tones = rng.uniform(0.99, 1.03, len(p))[:, None] * np.array([0.98, 0.98, 1.02, 1.06])
    rgb = np.minimum(1, color[roots, None, :] * tones[:, :, None]).reshape(-1, 3)
    ca = me.color_attributes.new("Color", "FLOAT_COLOR", "POINT")
    ca.data.foreach_set("color", np.c_[rgb, np.ones(len(rgb))].ravel())
    locks = bpy.data.objects.new("Guard hairs", me)
    bpy.context.scene.collection.objects.link(locks)
    uv = np.tile([[0, 0], [1, 0], [0.5, 0.45], [0.5, 1]], (len(p), 1))
    me.uv_layers.new(name="Locks").data.foreach_set("uv", uv[faces.ravel()].astype(np.float32).ravel())
    hair = skin.data.materials[0].copy()
    hair.name = "Guard coat"
    hair.use_backface_culling = True
    nodes, links = hair.node_tree.nodes, hair.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    # At a distance mipmaps merge the filaments into the colour of the undercoat.
    from PIL import Image, ImageDraw
    image = Image.new("RGBA", (256, 512), (247, 242, 233, 0))
    draw = ImageDraw.Draw(image)
    for root in np.linspace(0.015, 0.985, 21):
        end = rng.uniform(0.66, 1.0)
        bend = rng.uniform(-0.019, 0.019)
        tone = int(rng.uniform(235, 255))
        def strand(t, side):
            u = 0.5 + (root - 0.5) * (1 - t) + bend * np.sin(t * np.pi)
            u += side * (0.015 * (1 - t / end) + 0.002)
            return (u * 255, (1 - t) * 511)
        steps = np.linspace(0, end, 18)
        draw.polygon([strand(t, -1) for t in steps] + [strand(t, 1) for t in steps[::-1]],
                     fill=(tone, tone, tone, 255))
    with tempfile.TemporaryDirectory() as folder:
        path = os.path.join(folder, "guard-hairs.png")
        image.save(path)
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(path)
        tex.image.pack()
    mul = nodes.new("ShaderNodeMixRGB")
    mul.blend_type = "MULTIPLY"
    mul.inputs[0].default_value = 1
    links.new(next(node for node in nodes if node.type == "VERTEX_COLOR").outputs["Color"], mul.inputs[1])
    links.new(tex.outputs["Color"], mul.inputs[2])
    links.new(mul.outputs[0], bsdf.inputs["Base Color"])
    clip = nodes.new("ShaderNodeMath")
    clip.operation = "GREATER_THAN"
    clip.inputs[1].default_value = 0.30
    links.new(tex.outputs["Alpha"], clip.inputs[0])
    links.new(clip.outputs[0], bsdf.inputs["Alpha"])
    me.materials.append(hair)
    groups = [locks.vertex_groups.new(name=g.name) for g in skin.vertex_groups]
    for i, root in enumerate(roots):
        indices = list(range(i * 4, i * 4 + 4))
        for g in skin.data.vertices[int(root)].groups:
            groups[g.group].add(indices, g.weight, "REPLACE")
    locks.parent = rig
    locks.modifiers.new("Skin", "ARMATURE").object = rig
    return locks


def undercoat(me, mat, v, t, fn):
    """Lay a tile of fine fibres along the limbs, back and face, in physical units."""
    from PIL import Image
    from scipy.ndimage import gaussian_filter, map_coordinates
    import bpy
    # Neighbouring triangles on a projection share UVs and stay welded on the GPU.
    dominant = np.argmax(abs(fn), axis=1)
    n = np.eye(3)[dominant] * np.sign(fn[np.arange(len(t)), dominant])[:, None]
    p = v[t].mean(axis=1)
    direction = np.tile([-1., 0., -0.32], (len(t), 1))
    direction[p[:, 2] < 0.38] = [-0.14, 0., -1.]
    direction[p[:, 0] > 0.34, 2] = -1.4
    cross = np.cross(n, direction)
    pole = np.linalg.norm(cross, axis=1) < 0.12
    cross[pole] = np.cross(n[pole], [0., 1., 0.])
    cross /= np.maximum(np.linalg.norm(cross, axis=1)[:, None], 1e-12)
    along = np.cross(cross, n)
    uv = np.stack([np.einsum("ijk,ik->ij", v[t], cross), np.einsum("ijk,ik->ij", v[t], along)], axis=2)
    me.uv_layers.new(name="Undercoat").data.foreach_set("uv", (uv / 0.054).astype(np.float32).ravel())
    rng = np.random.default_rng(1935)
    height = gaussian_filter(rng.normal(size=(256, 256)), (15, 0.9), mode="wrap")
    y, x = np.indices(height.shape)
    height = map_coordinates(height, [y, x + 2.5 * np.sin(2 * np.pi * y / 256)], order=1, mode="grid-wrap")
    height /= height.std()
    nodes, links = mat.node_tree.nodes, mat.node_tree.links
    bsdf = nodes.get("Principled BSDF")
    with tempfile.TemporaryDirectory() as folder:
        def tile(name, pixels):
            path = os.path.join(folder, name + ".png")
            Image.fromarray(np.uint8(np.clip(pixels, 0, 255))).save(path)
            node = nodes.new("ShaderNodeTexImage")
            node.image = bpy.data.images.load(path)
            node.image.pack()
            return node
        albedo = tile("Underfur", 244 + 7 * height)
        mul = nodes.new("ShaderNodeMixRGB")
        mul.blend_type = "MULTIPLY"
        mul.inputs[0].default_value = 1
        links.new(next(node for node in nodes if node.type == "VERTEX_COLOR").outputs["Color"], mul.inputs[1])
        links.new(albedo.outputs["Color"], mul.inputs[2])
        links.new(mul.outputs[0], bsdf.inputs["Base Color"])
        dy, dx = np.gradient(height)
        normals = np.stack([-0.24 * dx, 0.24 * dy, np.ones_like(dx)], axis=2)
        normals /= np.linalg.norm(normals, axis=2, keepdims=True)
        relief = tile("Underfur relief", 127.5 * (1 + normals))
        relief.image.colorspace_settings.name = "Non-Color"
        bump = nodes.new("ShaderNodeNormalMap")
        links.new(relief.outputs["Color"], bump.inputs["Color"])
        links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])


def main():
    import bpy
    from mathutils import Matrix, Vector

    print("sculpting ...")
    v, t = sk.mesh(body(), (-0.56, -0.24, -0.02), (0.76, 0.24, 1.02), CELL)
    v = sk.relax(v, t, 0.45, 2)
    v[:, 2] -= v[:, 2].min()   # (his paws on the ground)
    fn = np.cross(v[t[:, 1]] - v[t[:, 0]], v[t[:, 2]] - v[t[:, 0]])
    vn = np.zeros_like(v)
    for k in range(3):
        np.add.at(vn, t[:, k], fn)
    vn /= np.linalg.norm(vn, axis=1, keepdims=True) + 1e-12
    col, gloss = coat(v, vn)
    print(f"  {len(v)} vertices, {len(t)} triangles; {v[:, 2].max():.3f} m to his ears, {v[:, 0].max() - v[:, 0].min():.3f} m long")

    bpy.ops.wm.read_factory_settings(use_empty=True)
    me = bpy.data.meshes.new("Akita")
    me.from_pydata(v.tolist(), [], t.tolist())
    me.update()
    for p in me.polygons:
        p.use_smooth = True
    ca = me.color_attributes.new("Color", "FLOAT_COLOR", "POINT")
    ca.data.foreach_set("color", np.c_[col, np.ones(len(v))].ravel().tolist())
    ob = bpy.data.objects.new("Akita", me)
    bpy.context.scene.collection.objects.link(ob)

    mat = bpy.data.materials.new("Coat")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    attr = mat.node_tree.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Color"
    mat.node_tree.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.86
    bsdf.inputs["Metallic"].default_value = 0.0
    me.materials.append(mat)
    wet = mat.copy()
    wet.name = "Eyes and nose"
    wet.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.28
    me.materials.append(wet)
    me.polygons.foreach_set("material_index", (gloss[t].mean(axis=1) > 0.48).astype(np.int32))

    arm = bpy.data.armatures.new("AkitaRig")
    rig = bpy.data.objects.new("AkitaRig", arm)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for name, h, tl, y, parent in BONES:
        b = arm.edit_bones.new(name)
        b.head, b.tail = (h[0], y, h[1]), (tl[0], y, tl[1])
        b.roll = 0.0
        if parent:
            b.parent = arm.edit_bones[parent]
    bpy.ops.object.mode_set(mode="OBJECT")

    # the skin: Blender's own weights from the bones' heat
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    rig.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")
    W = np.zeros((len(v), len(BONES)))
    names = [g.name for g in ob.vertex_groups]
    for vert in me.vertices:
        for g in vert.groups:
            W[vert.index, [b[0] for b in BONES].index(names[g.group])] = g.weight
    lost = int((W.sum(1) < 1e-6).sum())
    print(f"  weights: {lost} vertices without a bone")
    if lost > len(v) * 0.01:
        raise SystemExit("the automatic weights failed")
    # a side's leg is never moved by the other side's bones (the heat crosses between legs that stand close)
    for j, (name, *_rest) in enumerate(BONES):
        if name.endswith(".L") or name.endswith(".R"):
            wrong = (v[:, 1] < -0.012) if name.endswith(".L") else (v[:, 1] > 0.012)
            g = ob.vertex_groups[name]
            idx = np.nonzero(wrong & (W[:, j] > 0))[0]
            if len(idx):
                g.remove(idx.tolist())
    # the head is one piece: its skull, ears and muzzle turn together
    hd = np.nonzero(v[:, 0] > HEAD_AT[0] - 0.06 + (0.80 - v[:, 2]) * 0.6)[0]
    for g in ob.vertex_groups:
        if g.name != "head":
            g.remove(hd.tolist())
    ob.vertex_groups["head"].add(hd.tolist(), 1.0, "REPLACE")
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.vertex_group_normalize_all(lock_active=False)
    bpy.ops.object.vertex_group_limit_total(limit=4)
    locks = guard_coat(bpy, ob, rig, v, vn, col, gloss)
    eyes = eye_surfaces(bpy, ob, rig, wet)
    undercoat(me, mat, v, t, fn)

    # the clips
    rest = {b.name: b.matrix_local.to_3x3() for b in arm.bones}
    parent = {b[0]: b[4] for b in BONES}
    rig.animation_data_create()
    roty = lambda a: Matrix.Rotation(-a, 3, "Y")   # (nose up, in the plane x forward, z up)
    rotz = lambda a: Matrix.Rotation(a, 3, "Z")
    for pb in rig.pose.bones:
        pb.rotation_mode = "QUATERNION"
    for cname, make in CLIPS.items():
        frames = make()
        act = bpy.data.actions.new(cname)
        rig.animation_data.action = act
        last = {}
        for f, fr in enumerate(frames + frames[:1]):   # (the first frame again at the end: the loop closes)
            D = {}
            for name, *_r in BONES:
                d = roty(fr["turn"][name])
                if name.startswith("tail"):
                    d = rotz(fr["wag"] * (1.0 if name == "tail1" else 1.6)) @ d
                if name == "head":
                    d = rotz(fr["head_yaw"]) @ d
                D[name] = d
            for name, *_r in BONES:
                pb = rig.pose.bones[name]
                R = rest[name]
                Dp = D[parent[name]] if parent[name] else Matrix.Identity(3)
                q = (R.inverted() @ Dp.inverted() @ D[name] @ R).to_quaternion()
                if name in last and last[name].dot(q) < 0:
                    q.negate()
                last[name] = q.copy()
                pb.rotation_quaternion = q
                pb.keyframe_insert("rotation_quaternion", frame=f)
                if name == "hips":
                    pb.location = R.inverted() @ Vector((fr["root"][0], 0.0, fr["root"][1]))
                    pb.keyframe_insert("location", frame=f)
        rig.animation_data.action = None
        tr = rig.animation_data.nla_tracks.new()
        tr.name = cname
        tr.strips.new(cname, 0, act)
        print(f"  clip {cname}: {len(frames)} frames")
    for pb in rig.pose.bones:
        pb.rotation_quaternion = (1, 0, 0, 0)
        pb.location = (0, 0, 0)

    bpy.context.scene.render.fps = FPS
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    ob.select_set(True)
    locks.select_set(True)
    eyes.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_skins=True, export_animations=True,
                              export_animation_mode="NLA_TRACKS", export_optimize_animation_size=True, export_vertex_color="ACTIVE",
                              export_all_vertex_colors=False, export_materials="EXPORT", export_morph=False, export_yup=True)
    raw = os.path.getsize(OUT)
    import meshopt
    meshopt.compress(OUT)
    print(f"wrote {os.path.relpath(OUT, ROOT)}: {raw / 1024:.0f} kB, {os.path.getsize(OUT) / 1024:.0f} kB compressed")


if __name__ == "__main__":
    main()
