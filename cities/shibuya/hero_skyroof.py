"""SHIBUYA SKY's roof, SKY STAGE, a hero level of its own (blender/build_hero.py --city shibuya --level skyroof;
docs/HERO.md, "SKY STAGE: the roof frame 4 is played on"; issue 72).

Why: frame 4 of the story is played on the roof of Shibuya Scramble Square (the lift up, Kanbara at the glass, the
find, the frame looking down on the scramble) and frame 5 lifts off from its pad. The roof was the city's landmark
mesh in flat colours (cities/shibuya/city.py sky_meshes): a deck of pale tiles in two random tones, a grey block for
GEO COMPASS and a texture of its compass, nets as a grid, a glass fence on posts. At 17:31 it read as a pale void.

The real roof (docs/HERO.md, its sources): about 2,500 m2 open to the sky at 229 m, walled in tall glass, a dark
deck, the heliport raised in the middle (GEO COMPASS, the roof's highest point, the bearings of far places on its
floor round the pad's marking), CLOUD HAMMOCK's nets on lawn, SKY EDGE the corner over the scramble where the glass
is lowest, benches along the glass, CROSSING LIGHT's 18 searchlights, and at night lines of light along the glass's
foot and under the steps, little else: the city is the light.

What is built, in the roof's frame (scene.json landmarks.shibuya_sky: centre, a1 toward the north edge, a2 toward
the west edge, half-lengths, the deck's height):

  * the deck: dark grey porcelain pavers 600 by 600 mm on pedestals in straight courses with 5 mm open joints, each
    paver its own part of the stone, cut clean at the channels, the pad and the glass; a stainless slot drain along
    the glass's foot;
  * GEO COMPASS: the raised deck's top in a non-slip coat with the heliport's marking (the white edge line, the yellow
    touchdown circle, the white H) and round it the compass (a white ring, its degrees, north, east, south and west,
    a gold line to each far place with its name and distance, true north), drawn here (`skypad`); its sides in dark
    metal panels; its four flights of steps in the deck's stone with a pale nosing and a line of light under each;
    green flush lights round the pad's edge, as a heliport has;
  * the glass round the deck: frameless panes on a dark aluminium shoe with a line of light in its face toward the
    deck, a slim steel cap; at SKY EDGE and over the channels the city's own lower glass stays;
  * CLOUD HAMMOCK: three nets of white rope on low dark steel frames over beds of short artificial lawn in a timber
    kerb, the net's sag the landmark's (the story's poses lie in it);
  * benches of timber slats on dark steel along the glass, where nothing else stands;
  * CROSSING LIGHT: each searchlight a plinth, a yoke and a drum, its lens lit after dark;
  * the escalators' heads: a stainless landing plate and a yellow line before each.

It is drawn a few centimetres over the landmark (which keeps the walking and the channels), and while it is shown it
hides the landmark's deck, compass picture, steps, nets, fence and searchlights (game.hero[].hide). It is fetched
only when the camera is near it in height as well as in plan (game.hero[].zr: hero.js), so the street under the
tower never holds it.
"""
import importlib.util
import json
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "blender"))
sys.path.insert(0, os.path.join(ROOT, "pipeline"))
sys.path.insert(0, HERE)

ID = "skyroof"
PAVER = 0.6          # the deck's pavers, square, laid in straight courses along the roof's long axis
JOINT = 0.0025       # half an open joint
LIFT = 0.05          # the deck drawn this far over the landmark's (which is 3 cm over the solids' top)
GLASS_H = 2.0        # the glass round the deck (city.py SKY fence_m)
SHOE_H = 0.16        # its aluminium shoe
WARM = (1.0, 0.86, 0.66)        # 3000 K, the lines of light at the glass's foot and under the steps
AMBER = (1.0, 0.72, 0.42)       # the light under CLOUD HAMMOCK's nets
GREEN = (0.35, 1.0, 0.45)       # a heliport's perimeter lights


def _city():
    spec = importlib.util.spec_from_file_location("shibuya_city", os.path.join(HERE, "city.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def _lobby():
    spec = importlib.util.spec_from_file_location("hero_skylobby", os.path.join(HERE, "hero_skylobby.py"))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def materials(K):
    granite = lambda srgb: K.tint_to("granite", srgb)
    return {
        # the deck: dark grey porcelain, the stone's fine speckle, honed: at dusk it is near black and gives back the sky
        # at a low angle, which is how its courses read in the photographs (issue 125; wet in the rain: ground*)
        "ground_deck": {"tex": "granite", "maps": "cn", "rough": 0.44, "tint": granite((70, 72, 75)), "sky": 0.85},
        "ground_deck_joint": {"color": (0.012, 0.012, 0.013), "rough": 0.9},
        # the pad's top: its coat and its paint, drawn here
        "ground_pad": {"tex": "skypad", "maps": "cn", "rough": 0.6, "sky": 0.7},
        # the steps: the deck's stone, a pale honed nosing
        "ground_step": {"tex": "granite", "maps": "cn", "rough": 0.46, "tint": granite((70, 72, 75)), "sky": 0.85},
        "ground_nosing": {"tex": "granite", "maps": "cn", "rough": 0.5, "tint": granite((168, 166, 160)), "sky": 0.5},
        # the lawn under the nets: short artificial turf, one even green
        "ground_lawn": {"tex": "grass", "maps": "c", "rough": 0.85, "tint": K.tint_to("grass", (74, 104, 52)), "sky": 0.3},
        # stainless: the drain's grate, the landing plates, the cap on the glass
        "metal_grate": {"color": (0.16, 0.165, 0.17), "rough": 0.4, "metal": 1.0, "sky": 0.6},
        "metal_plate": {"color": (0.55, 0.56, 0.57), "rough": 0.32, "metal": 1.0, "sky": 0.6},
        "metal_cap": {"color": (0.72, 0.73, 0.74), "rough": 0.2, "metal": 1.0, "sky": 1.0},
        # dark anodised aluminium and painted steel: the glass's shoe, the pad's cladding, the frames, the lights' bodies
        "metal_dark": {"color": (0.045, 0.047, 0.05), "rough": 0.45, "metal": 0.6, "sky": 0.5},
        "metal_panel": {"color": (0.075, 0.078, 0.082), "rough": 0.4, "metal": 0.55, "sky": 0.5},
        "metal_reveal": {"color": (0.01, 0.01, 0.011), "rough": 0.8},
        "steel_frame": {"color": (0.06, 0.062, 0.065), "rough": 0.5, "metal": 0.5, "sky": 0.5},
        # timber: the benches' slats and the lawn's kerb (the planks' grain, oiled)
        "wood_slat": {"tex": "deck", "maps": "cn", "rough": 0.55, "tint": K.tint_to("deck", (128, 92, 62)), "sky": 0.4},
        # the nets' rope, white
        "net_rope": {"color": (0.78, 0.78, 0.76), "rough": 0.9},
        # the glass round the deck: clear, a little of the sky in it
        "glass_wall": {"color": (0.55, 0.62, 0.64), "rough": 0.03, "alpha": 0.2, "sky": 1.0},
        # what gives light after dark (lamp*: off by day): the lines along the glass and under the steps, the
        # searchlights' lenses, the pad's green lights
        "lamp_line": {"color": (0.4, 0.37, 0.33), "emissive": WARM, "glow": 0.85},
        "lamp_under": {"color": (0.4, 0.33, 0.24), "emissive": AMBER, "glow": 0.7},
        "lamp_lens": {"color": (0.5, 0.5, 0.5), "emissive": (1.0, 0.97, 0.92), "glow": 0.7},
        "lamp_green": {"color": (0.3, 0.5, 0.3), "emissive": GREEN, "glow": 1.6},
        "yellow_line": {"color": (0.78, 0.6, 0.08), "rough": 0.55},
    }


# ---------------------------------------------------------------- the pad's top, drawn here

PAD_N = 2048


def pad_maker(city, frame, lobby):
    """make(dir) for GEO COMPASS's top: a non-slip coat (its fine aggregate the only grain in it), the heliport's
    paint and the compass, in the pad's own frame (u to the image's right, v up), turned so that north is true north."""
    gc = city.SKY["compass_m"] / 2
    a1, a2 = frame["a1"], frame["a2"]

    def make(d):
        from PIL import Image, ImageDraw
        from scipy import ndimage
        N = PAD_N
        S = N / (2 * gc)                      # pixels a metre
        P = lambda u, v: ((u + gc) * S, (gc - v) * S)
        # a mask per paint: white, yellow, gold
        masks = {k: Image.new("L", (N, N), 0) for k in ("white", "yellow", "gold")}
        D = {k: ImageDraw.Draw(m) for k, m in masks.items()}
        w = lambda m: max(1, int(round(m * S)))
        # the edge line, 0.3 m wide 0.3 m in
        e = gc - 0.3
        D["white"].rectangle([*P(-e, e), *P(e, -e)], outline=255, width=w(0.3))
        # the touchdown circle (yellow, 0.5 m wide, 9 m across) and the H (white, 3 by 4 m, strokes 0.6 m)
        r = 4.5
        D["yellow"].ellipse([*P(-r, r), *P(r, -r)], outline=255, width=w(0.5))
        for x0, x1, y0, y1 in ((-1.5, -0.9, -2.0, 2.0), (0.9, 1.5, -2.0, 2.0), (-0.9, 0.9, -0.3, 0.3)):
            D["white"].rectangle([*P(x0, y1), *P(x1, y0)], fill=255)
        # the compass: its ring (white, 0.25 m at 10.6 m), an inner ring, degrees every 5, the four letters
        R, Ri = 10.6, 5.4
        D["white"].ellipse([*P(-R, R), *P(R, -R)], outline=255, width=w(0.25))
        D["white"].ellipse([*P(-Ri, Ri), *P(Ri, -Ri)], outline=255, width=w(0.08))
        dirv = lambda brg: (math.sin(math.radians(brg)), math.cos(math.radians(brg)))      # (east, north)
        to_uv = lambda e_, n_: (e_ * a1[0] + n_ * a1[1], e_ * a2[0] + n_ * a2[1])          # world xy -> pad (u, v)
        for k in range(72):
            du, dv = to_uv(*dirv(k * 5))
            r0 = R - (0.9 if k % 18 == 0 else 0.55 if k % 6 == 0 else 0.32)
            D["white"].line([P(du * r0, dv * r0), P(du * (R - 0.12), dv * (R - 0.12))], fill=255, width=w(0.1 if k % 6 == 0 else 0.05))
        big = lobby.font("jost", w(1.1), 500)
        for lab, brg in (("N", 0), ("E", 90), ("S", 180), ("W", 270)):
            du, dv = to_uv(*dirv(brg))
            one = Image.new("L", (w(2.0), w(2.0)), 0)
            ImageDraw.Draw(one).text((one.width / 2, one.height / 2), lab, font=big, fill=255, anchor="mm")
            # (each letter reads from the middle, its foot toward the middle)
            ang = math.degrees(math.atan2(du, dv))
            one = one.rotate(ang, resample=Image.BICUBIC)
            cx, cy = P(du * (R - 1.7), dv * (R - 1.7))
            masks["white"].paste(255, (int(cx - one.width / 2), int(cy - one.height / 2)), one)
        # each far place: a gold line from the inner ring toward the outer at its bearing, its name and distance along
        # it. Places in nearly one direction (Mt Fuji, Osaka, Kyoto, Hong Kong all lie west-south-west) would write
        # over one another: each name takes the first of its places along its line and either side of it that is
        # clear of the names placed before it, the four letters and the other lines
        from shapely.geometry import LineString, Point, Polygon as SPoly
        small = lobby.font("jost", w(0.26), 500)
        noto = lobby.font("noto", w(0.26), 500)
        meas = ImageDraw.Draw(Image.new("L", (1, 1)))
        places = []
        for name, ll in city.COMPASS_TO.items():
            brg, km = city.bearing_km(city.COMPASS_FROM, ll)
            near = min(abs((brg - c4 + 180) % 360 - 180) for c4 in (0, 90, 180, 270))
            places.append((brg, km, name, to_uv(*dirv(brg)), R - (2.7 if near < 6 else 0.9)))     # (short of a letter it points at)
        taken = [Point(*[q * (R - 1.7) for q in to_uv(*dirv(b))]).buffer(0.75) for b in (0, 90, 180, 270)]
        lines = []
        for brg, km, name, (du, dv), end in places:
            D["gold"].line([P(du * (Ri + 0.15), dv * (Ri + 0.15)), P(du * end, dv * end)], fill=255, width=w(0.05))
            D["gold"].ellipse([*P(du * end - 0.12, dv * end + 0.12), *P(du * end + 0.12, dv * end - 0.12)], fill=255)
            lines.append(LineString([(du * (Ri + 0.15), dv * (Ri + 0.15)), (du * end, dv * end)]).buffer(0.04))
        for brg, km, name, (du, dv), end in sorted(places):
            text = f"{name}  {km:,.0f} km" if km >= 10 else f"{name}  {km:.1f} km"
            f = noto if any(ord(ch) > 0x3000 for ch in text) else small
            ln = (meas.textlength(text, font=f) + 8) / S                 # its length, metres
            hgt = 0.34
            own = LineString([(du * (Ri + 0.15), dv * (Ri + 0.15)), (du * end, dv * end)]).buffer(0.04)
            others = [g for g in lines if not g.equals(own)]
            nu_, nv_ = -dv, du                                             # across the line
            best = None
            for side in (1, -1):
                for r0 in np.linspace(Ri + 0.3, max(Ri + 0.3, end - 0.1 - ln), 6):
                    a, b = 0.1 * side, (0.1 + hgt) * side
                    poly = SPoly([(du * r0 + nu_ * a, dv * r0 + nv_ * a), (du * (r0 + ln) + nu_ * a, dv * (r0 + ln) + nv_ * a),
                                  (du * (r0 + ln) + nu_ * b, dv * (r0 + ln) + nv_ * b), (du * r0 + nu_ * b, dv * r0 + nv_ * b)])
                    if not any(poly.intersects(g) for g in taken + others):
                        best = (poly, r0, (a + b) / 2)
                        break
                if best:
                    break
            if best is None:                                               # (nowhere clear: its own line's outer end)
                r0 = end - 0.1 - ln
                best = (None, r0, 0.27)
            poly, r0, mid = best
            if poly is not None:
                taken.append(poly.buffer(0.04))
            one = Image.new("L", (int(ln * S), w(hgt)), 0)
            ImageDraw.Draw(one).text((4, one.height / 2), text, font=f, fill=255, anchor="lm")
            ang = math.degrees(math.atan2(dv, du))
            flip = 90 < (ang % 360) < 270
            one = one.rotate(ang + (180 if flip else 0), resample=Image.BICUBIC, expand=True)
            rm = r0 + ln / 2
            cx, cy = P(du * rm + nu_ * mid, dv * rm + nv_ * mid)
            masks["gold"].paste(255, (int(cx - one.width / 2), int(cy - one.height / 2)), one)
        # the name, small, inside the edge line on the side toward the scramble (+v)
        one = Image.new("L", (w(9), w(0.6)), 0)
        ImageDraw.Draw(one).text((one.width / 2, one.height / 2), "GEO COMPASS   SHIBUYA SKY  229.71 m", font=lobby.font("jost", w(0.34), 500), fill=255, anchor="mm")
        cx, cy = P(0, e - 0.75)
        masks["white"].paste(255, (int(cx - one.width / 2), int(cy - one.height / 2)), one.rotate(180))
        M = {k: np.asarray(m, float) / 255 for k, m in masks.items()}
        # the coat: one dark grey, its fine aggregate a pixel's grain (a millimetre's), nothing larger
        rng = np.random.default_rng(72)
        grain = ndimage.gaussian_filter(rng.normal(size=(N, N)), 0.7)
        grain /= grain.std() or 1
        base = np.array([54, 56, 59.0])
        col = base[None, None, :] + grain[..., None] * 2.2
        paint = {"white": np.array([214, 215, 212.0]), "yellow": np.array([214, 164, 36.0]), "gold": np.array([196, 160, 92.0])}
        cover = np.zeros((N, N))
        for k in ("white", "yellow", "gold"):
            a = M[k][..., None]
            col = col * (1 - a) + (paint[k][None, None, :] + grain[..., None] * 1.2) * a
            cover = np.maximum(cover, M[k])
        os.makedirs(d, exist_ok=True)
        Image.fromarray(np.clip(col, 0, 255).astype(np.uint8), "RGB").save(os.path.join(d, "Color.png"))
        # the paint stands half a millimetre proud of the coat; the aggregate's grain
        hgt = ndimage.gaussian_filter(cover, 1.0) * 1.0 + grain * 0.12
        gy, gx = np.gradient(hgt)
        nm = np.dstack([-gx * 0.6, gy * 0.6, np.ones_like(gx)])
        nm /= np.linalg.norm(nm, axis=2, keepdims=True)
        Image.fromarray(np.clip((nm * 0.5 + 0.5) * 255, 0, 255).astype(np.uint8), "RGB").save(os.path.join(d, "NormalGL.png"))
        rough = np.clip(0.74 - 0.16 * cover + grain * 0.01, 0, 1)
        Image.fromarray((rough * 255).astype(np.uint8), "L").save(os.path.join(d, "Roughness.png"))

    return make


# ---------------------------------------------------------------- the level

class Level:
    def __init__(self, K):
        self.K = K
        self.city = city = _city()
        self.lobby = _lobby()
        S = json.load(open(os.path.join(ROOT, "web", "data", "shibuya", "scene.json")))["landmarks"]["shibuya_sky"]
        self.s = S
        self.c, self.a1, self.a2 = np.array(S["centre"], float), np.array(S["a1"], float), np.array(S["a2"], float)
        self.h1, self.h2 = S["half"]
        self.z = S["deck_z"]
        self.zt = self.z + 2.0                  # GEO COMPASS's top
        self.gc = city.SKY["compass_m"] / 2
        self.F = city.sky_flights(self.h1, self.h2)
        K.register("skypad", 2 * self.gc, pad_maker(city, {"a1": self.a1, "a2": self.a2}, self.lobby))
        self.geo = K.Geo()
        self.A = K.Atlas(256, 256)
        self.beams = [self.uv_of(b) for b in S["beams"]]

    # the roof's frame
    def P(self, u, v, z):
        x, y = self.c + self.a1 * u + self.a2 * v
        return np.array([x, y, z])

    def uv_of(self, p):
        d = np.asarray(p[:2], float) - self.c
        return float(d @ self.a1), float(d @ self.a2)

    def q(self, mat, a, b, c, d, **kw):
        return self.geo.quad(mat, self.P(*a), self.P(*b), self.P(*c), self.P(*d), **kw)

    def box(self, mat, u0, u1, v0, v1, z0, z1, faces="all", emit=None, geo=None):
        (geo or self.geo).box(mat, self.P((u0 + u1) / 2, (v0 + v1) / 2, z0), (self.a1, self.a2), (u1 - u0, v1 - v0, z1 - z0), faces=faces, emit=emit)

    # what stands on the deck, as rectangles (u0, u1, v0, v1) the pavers keep out of
    def obstacles(self):
        F, gc = self.F, self.gc
        rect = lambda r: (min(p[0] for p in r), max(p[0] for p in r), min(p[1] for p in r), max(p[1] for p in r))
        n, w = rect(F["north"]), rect(F["west"])
        out = [(n[0] - 0.3, n[1] + 1, n[2] - 0.3, n[3] + 1), (w[0] - 0.3, w[1] + 1, w[2] - 0.3, w[3] + 1), (-gc, gc, -gc, gc)]
        for su, sv in ((1, 0), (-1, 0), (0, 1), (0, -1)):        # the steps up each side of the pad
            if su:
                out.append((gc, gc + 2.0, -2.5, 2.5) if su > 0 else (-gc - 2.0, -gc, -2.5, 2.5))
            else:
                out.append((-2.5, 2.5, gc, gc + 2.0) if sv > 0 else (-2.5, 2.5, -gc - 2.0, -gc))
        return out

    def build(self):
        self.deck()
        self.pad()
        self.steps()
        self.glass()
        self.hammocks()
        self.searchlights()
        self.benches()
        self.heads()
        return self.geo, self.A

    def deck(self):
        """The pavers, 600 mm square in straight courses from the roof's south-east corner, each its own part of the
        stone, cut at whatever stands on the deck; under them the joints' dark slab; the drain along the glass."""
        from shapely.geometry import box as sbox
        from shapely.ops import unary_union
        h1, h2, z = self.h1, self.h2, self.z + LIFT
        rep = self.K.TEXTURES["granite"][1]
        rng = np.random.default_rng(2500)
        edge = 0.32                                    # the drain's width along the glass
        U0, U1, V0, V1 = -h1 + edge, h1 - edge, -h2 + edge, h2 - edge
        obs = unary_union([sbox(a, c, b, d) for a, b, c, d in self.obstacles()])
        free = sbox(U0, V0, U1, V1).difference(obs)
        up = np.array([0, 0, 1.0])
        nu, nv = int(math.ceil((U1 - U0) / PAVER)), int(math.ceil((V1 - V0) / PAVER))
        for i in range(nu):
            for j in range(nv):
                ua, va = U0 + i * PAVER, V0 + j * PAVER
                ub, vb = min(U1, ua + PAVER), min(V1, va + PAVER)
                t = sbox(ua + JOINT, va + JOINT, ub - JOINT, vb - JOINT)
                if not t.intersects(free):
                    continue
                ou, ov = rng.random(2) * 3
                uvf = lambda a, b: (ou + (a - ua) / rep, ov + (b - va) / rep)
                if free.contains(t):
                    pts = [(ua + JOINT, va + JOINT), (ub - JOINT, va + JOINT), (ub - JOINT, vb - JOINT), (ua + JOINT, vb - JOINT)]
                    self.q("ground_deck", *[(a, b, z) for a, b in pts], uv=[uvf(a, b) for a, b in pts], n=up)
                    continue
                cut = t.intersection(free)
                for g in getattr(cut, "geoms", [cut]):
                    if g.geom_type != "Polygon" or g.area < 0.004:
                        continue
                    # (a paver cut by rectangles is a rectangle, or an L: a fan from a corner that sees all of it
                    # is enough for a rectangle; an L is split along its inner corner)
                    for part in self.rects(g):
                        a0, b0, a1_, b1 = part.bounds
                        pts = [(a0, b0), (a1_, b0), (a1_, b1), (a0, b1)]
                        self.q("ground_deck", *[(a, b, z) for a, b in pts], uv=[uvf(a, b) for a, b in pts], n=up)
        # the joints' slab under the pavers, over the free deck
        for g in getattr(free, "geoms", [free]):
            for part in self.rects(g):
                a0, b0, a1_, b1 = part.bounds
                self.q("ground_deck_joint", (a0, b0, z - 0.004), (a1_, b0, z - 0.004), (a1_, b1, z - 0.004), (a0, b1, z - 0.004), n=up)

    def rects(self, g):
        """A rectilinear polygon as rectangles: cut into vertical strips at its corners' u, and a strip that is not one
        rectangle (a corner a hair off its neighbour's u leaves a sliver in it) cut again at its own corners' v, so that
        no rectangle is ever more than the polygon. The corners' u were rounded to 0.1 mm: the west channel's notch began a
        hair past its rounded u, the strip beside it was an L of the deck and a hairline up the notch, and its bounds laid
        the joints' black slab over the top of the west flight, 44 m2 of it at the deck's height (the owner's phone: "a
        black cover over the escalator")."""
        from shapely.geometry import box as sbox
        def cuts(vals):
            vals = sorted(vals)
            return [v for i, v in enumerate(vals) if i == 0 or v - vals[i - 1] > 1e-6]
        xs = cuts({x for x, _ in g.exterior.coords} | {x for r in g.interiors for x, _ in r.coords})
        out = []
        b = g.bounds
        for x0, x1 in zip(xs, xs[1:]):
            if x1 - x0 < 1e-3:
                continue
            strip = g.intersection(sbox(x0, b[1] - 1, x1, b[3] + 1))
            for s in getattr(strip, "geoms", [strip]):
                if s.geom_type != "Polygon" or s.area <= 1e-4:
                    continue
                if s.area >= sbox(*s.bounds).area * (1 - 1e-6):
                    out.append(sbox(*s.bounds))
                    continue
                ys = cuts({y for _, y in s.exterior.coords} | {y for r in s.interiors for _, y in r.coords})
                for y0, y1 in zip(ys, ys[1:]):
                    cell = s.intersection(sbox(s.bounds[0] - 1, y0, s.bounds[2] + 1, y1))
                    for c in getattr(cell, "geoms", [cell]):
                        if c.geom_type == "Polygon" and c.area > 1e-4:
                            out.append(sbox(*c.bounds))
        return out

    def pad(self):
        """GEO COMPASS's top in its coat and paint, its sides in dark metal panels 1.2 m wide, the green lights."""
        gc, zt, z = self.gc, self.zt + 0.03, self.z
        up = np.array([0, 0, 1.0])
        self.q("ground_pad", (-gc, -gc, zt), (gc, -gc, zt), (gc, gc, zt), (-gc, gc, zt), uv=[(0, 0), (1, 0), (1, 1), (0, 1)], n=up, sub=(12, 12))
        # a coping of stainless round the top's edge
        o = 0.04
        for (ua, va), (ub, vb) in (((-gc - o, -gc - o), (gc + o, -gc + 0.06)), ((-gc - o, gc - 0.06), (gc + o, gc + o)),
                                   ((-gc - o, -gc - o), (-gc + 0.06, gc + o)), ((gc - 0.06, -gc - o), (gc + o, gc + o))):
            self.box("metal_cap", ua, ub, va, vb, zt - 0.06, zt + 0.012)
        # the sides: panels 1.2 m wide with a dark reveal, 3 cm out of the landmark's block, from the deck to the top
        for side in range(4):
            for k in range(int(2 * gc / 1.2)):
                a, b = -gc + k * 1.2 + 0.006, -gc + (k + 1) * 1.2 - 0.006
                if -2.5 - 0.01 < (a + b) / 2 < 2.5 + 0.01:   # (where the steps rise: they cover it)
                    continue
                d = gc + 0.03
                pts = {0: ((a, -d), (b, -d)), 1: ((d, a), (d, b)), 2: ((b, d), (a, d)), 3: ((-d, b), (-d, a))}[side]
                (u0, v0), (u1, v1) = pts
                self.q("metal_panel", (u0, v0, z + LIFT), (u1, v1, z + LIFT), (u1, v1, zt - 0.06), (u0, v0, zt - 0.06))
            # the reveal behind the panels
            d = gc + 0.025
            pts = {0: ((-gc, -d), (gc, -d)), 1: ((d, -gc), (d, gc)), 2: ((gc, d), (-gc, d)), 3: ((-d, gc), (-d, -gc))}[side]
            (u0, v0), (u1, v1) = pts
            self.q("metal_reveal", (u0, v0, z + LIFT), (u1, v1, z + LIFT), (u1, v1, zt - 0.06), (u0, v0, zt - 0.06))
        # the heliport's perimeter lights: green, flush, every 3 m round the top's edge, inside the line
        e = gc - 0.15
        for t in np.arange(-e, e + 0.01, 3.0):
            for (u, v) in ((t, -e), (t, e), (-e, t), (e, t)):
                if abs(t) < 3.0 and (abs(u) > e - 0.01 or abs(v) > e - 0.01) and abs(t) < 2.6:
                    continue                                    # (not on the steps' heads)
                self.geo.lathe("lamp_green", self.P(u, v, zt), [(0.09, 0.0), (0.09, 0.008), (0.06, 0.016), (0.0, 0.018)], segs=10)
                self.geo.emitters.append((self.P(u, v, zt + 0.1), up, 0.02, np.array(GREEN) * 0.6))

    def steps(self):
        """Ten steps up each side of the pad (the landmark's: 0.2 m rise on 0.2 m going), the deck's stone with a pale
        nosing, a line of light under each nosing; their cheeks in the pad's panels."""
        gc, z = self.gc, self.z + 0.03
        for su, sv in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            # the step's frame: s out from the pad, t across (5 m), the point (s, t) -> (u, v)
            # (turned, never mirrored, so that a face's winding holds on every side)
            if su:
                X = (lambda su_: lambda s, t: (su_ * s, su_ * t))(su)
            else:
                X = (lambda sv_: lambda s, t: (-sv_ * t, sv_ * s))(sv)
            Q = lambda s, t, zz: (*X(s, t), zz)
            for j in range(10):
                s0, s1 = gc + 1.8 - j * 0.2, gc + 2.0 - j * 0.2      # the tread (outermost first, lowest)
                zz = z + (j + 1) * 0.2 + 0.006
                self.q("ground_step", Q(s1 - 0.04, -2.5, zz), Q(s1 - 0.04, 2.5, zz), Q(s0, 2.5, zz), Q(s0, -2.5, zz), n=np.array([0, 0, 1.0]))
                self.q("ground_nosing", Q(s1 + 0.006, -2.5, zz), Q(s1 + 0.006, 2.5, zz), Q(s1 - 0.04, 2.5, zz), Q(s1 - 0.04, -2.5, zz), n=np.array([0, 0, 1.0]))
                # the riser, set back 2 cm under the nosing, and the line of light in the shadow there
                zb = zz - 0.2
                self.q("ground_step", Q(s1 - 0.014, -2.5, zb), Q(s1 - 0.014, 2.5, zb), Q(s1 - 0.014, 2.5, zz - 0.035), Q(s1 - 0.014, -2.5, zz - 0.035))
                self.q("lamp_line", Q(s1 - 0.012, -2.45, zz - 0.035), Q(s1 - 0.012, 2.45, zz - 0.035), Q(s1 - 0.012, 2.45, zz - 0.02), Q(s1 - 0.012, -2.45, zz - 0.02),
                       emit=(WARM, 12.0))
                self.q("ground_nosing", Q(s1 + 0.006, -2.5, zz - 0.02), Q(s1 + 0.006, 2.5, zz - 0.02), Q(s1 + 0.006, 2.5, zz), Q(s1 + 0.006, -2.5, zz))
            # the cheeks: dark panels either side, from the deck to each step's top
            for t, sgn in ((-2.5 - 0.03, -1), (2.5 + 0.03, 1)):
                for j in range(10):
                    s0, s1 = gc + 1.8 - j * 0.2, gc + 2.0 - j * 0.2
                    a, b = (Q(s1, t, z + 0.02), Q(s0, t, z + 0.02)) if sgn > 0 else (Q(s0, t, z + 0.02), Q(s1, t, z + 0.02))
                    zz = z + (j + 1) * 0.2
                    self.q("metal_panel", a, b, (*b[:2], zz), (*a[:2], zz))

    def glass(self):
        """The glass round the deck's outer edge, where the landmark's fence stood (not where a channel runs out):
        frameless panes 1.5 m wide on a dark shoe, a line of light along the shoe's face toward the deck, a slim cap;
        the drain's grate along its foot."""
        h1, h2, z = self.h1, self.h2, self.z + 0.03
        F = self.F
        nv0, wu0 = F["north"][0][1], F["west"][0][0]
        sides = [((-h1, -h2), (h1, -h2), (0, 1)), ((h1, -h2), (h1, h2), (-1, 0)), ((h1, h2), (-h1, h2), (0, -1)), ((-h1, h2), (-h1, -h2), (1, 0))]
        for (ua, va), (ub, vb), (iu, iv) in sides:
            L = math.hypot(ub - ua, vb - va)
            n = max(1, int(round(L / 1.5)))
            for k in range(n):
                t0, t1 = k / n, (k + 1) / n
                pa = (ua + (ub - ua) * t0, va + (vb - va) * t0)
                pb = (ua + (ub - ua) * t1, va + (vb - va) * t1)
                mid = ((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2)
                if (mid[0] > h1 - 0.1 and mid[1] > nv0 - 0.2) or (mid[1] > h2 - 0.1 and mid[0] > wu0 - 0.2):
                    continue
                if mid[0] > h1 - 0.1 and max(pa[1], pb[1]) > nv0:
                    pa, pb = (pa, (pb[0], nv0)) if pb[1] > pa[1] else ((pa[0], nv0), pb)
                if mid[1] > h2 - 0.1 and max(pa[0], pb[0]) > wu0:
                    pa, pb = (pa, (wu0, pb[1])) if pb[0] > pa[0] else ((wu0, pa[1]), pb)
                self.pane(pa, pb, (iu, iv), z)

    def pane(self, pa, pb, inn, z):
        iu, iv = inn
        off = lambda p, d: (p[0] + iu * d, p[1] + iv * d)
        # the shoe: 0.14 wide, its face toward the deck 0.16 high
        a0, b0, a1_, b1 = off(pa, 0.02), off(pb, 0.02), off(pa, 0.16), off(pb, 0.16)
        top = z + SHOE_H
        self.q("metal_dark", (*b1, z + 0.02), (*a1_, z + 0.02), (*a1_, top - 0.06), (*b1, top - 0.06))
        self.q("lamp_line", (*off(pb, 0.161), top - 0.055), (*off(pa, 0.161), top - 0.055), (*off(pa, 0.161), top - 0.035), (*off(pb, 0.161), top - 0.035))
        # its light on the deck, baked: lights facing down a little in front of it, so that the shoe beside them (its
        # faces upright, edge on to them) takes none of it and glows no brighter than its line
        L_ = math.hypot(pb[0] - pa[0], pb[1] - pa[1])
        for k in range(max(1, int(L_ / 0.75))):
            t = (k + 0.5) / max(1, int(L_ / 0.75))
            m = off((pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t), 0.4)
            # (thrown out across the deck, as a line of light in a shoe's face is: pointed straight down it lit one
            # course of pavers and no more, a wash nobody could see from across the roof, issue 125)
            wi = self.a1 * iu + self.a2 * iv
            self.geo.emitters.append((self.P(*m, top - 0.04), np.array([wi[0] * 0.8, wi[1] * 0.8, -0.6]), 0.015, np.array(WARM) * 125.0))
        self.q("metal_dark", (*b1, top - 0.035), (*a1_, top - 0.035), (*a1_, top), (*b1, top))
        self.q("metal_dark", (*a0, top), (*b0, top), (*b1, top), (*a1_, top), n=np.array([0, 0, 1.0]))
        # the pane, both faces, 12 mm short of its neighbours
        L = math.hypot(pb[0] - pa[0], pb[1] - pa[1])
        du, dv = (pb[0] - pa[0]) / L, (pb[1] - pa[1]) / L
        ga, gb = off((pa[0] + du * 0.006, pa[1] + dv * 0.006), 0.09), off((pb[0] - du * 0.006, pb[1] - dv * 0.006), 0.09)
        zg = z + GLASS_H
        self.q("glass_wall", (*ga, top), (*gb, top), (*gb, zg), (*ga, zg))
        self.q("glass_wall", (*gb, top), (*ga, top), (*ga, zg), (*gb, zg))
        # the cap over the top
        self.geo.tube("metal_cap", [self.P(*off(pa, 0.096), zg + 0.02), self.P(*off(pb, 0.096), zg + 0.02)], 0.024, 6)
        # the drain along the shoe: 0.3 m of dark steel level with the pavers
        zd = self.z + LIFT - 0.002
        c0, c1 = off(pa, 0.16), off(pb, 0.16)
        d0, d1 = off(pa, 0.32 + 0.16), off(pb, 0.32 + 0.16)
        self.q("metal_grate", (*c0, zd), (*c1, zd), (*d1, zd), (*d0, zd), n=np.array([0, 0, 1.0]))
        # its slot: a stainless lip either side of a 3 cm dark slot down its middle
        for a, b in ((0.16 + 0.135, 0.16 + 0.15), (0.16 + 0.18, 0.16 + 0.195)):
            e0, e1, f0, f1 = off(pa, a), off(pb, a), off(pa, b), off(pb, b)
            self.q("metal_plate", (*e0, zd + 0.002), (*e1, zd + 0.002), (*f1, zd + 0.002), (*f0, zd + 0.002), n=np.array([0, 0, 1.0]))

    def hammocks(self):
        """CLOUD HAMMOCK where the landmark has them: a bed of lawn in a timber kerb, four dark posts and two rails at
        0.9 m, the net's ropes 0.12 m apart sagging to 0.45 m in the middle (the landmark's, which the poses lie in)."""
        h1, h2, z = self.h1, self.h2, self.z + LIFT
        rep = self.K.TEXTURES["grass"][1]
        for (u, v) in ((-h1 + 9, h2 - 9), (-h1 + 9, -h2 + 22), (h1 - 24, -h2 + 7)):
            hu, hv = 3.0, 1.75
            self.q("ground_lawn", (u - hu, v - hv, z + 0.01), (u + hu, v - hv, z + 0.01), (u + hu, v + hv, z + 0.01), (u - hu, v + hv, z + 0.01),
                   uv=[((u - hu) / rep, (v - hv) / rep), ((u + hu) / rep, (v - hv) / rep), ((u + hu) / rep, (v + hv) / rep), ((u - hu) / rep, (v + hv) / rep)],
                   n=np.array([0, 0, 1.0]))
            k = 0.1
            for a, b, c, d in ((u - hu - k, u + hu + k, v - hv - k, v - hv), (u - hu - k, u + hu + k, v + hv, v + hv + k),
                               (u - hu - k, u - hu, v - hv, v + hv), (u + hu, u + hu + k, v - hv, v + hv)):
                self.box("wood_slat", a, b, c, d, z - 0.01, z + 0.1)
            # the light under the net (in the photographs at dusk the nets are lit from beneath, amber, and whoever lies
            # in one is dark on a glowing mesh): a line along the inside of each long kerb, and its light on the lawn
            for sv in (-1, 1):
                vv = v + sv * (hv - 0.004)
                a, b = ((u - hu, vv, z + 0.05), (u + hu, vv, z + 0.05)) if sv < 0 else ((u + hu, vv, z + 0.05), (u - hu, vv, z + 0.05))
                self.q("lamp_under", a, b, (b[0], b[1], z + 0.085), (a[0], a[1], z + 0.085))
                for t in np.arange(-hu + 0.25, hu, 0.5):
                    nn = self.a2 * -sv * 0.8
                    self.geo.emitters.append((self.P(u + t, v + sv * (hv - 0.3), z + 0.35), np.array([nn[0], nn[1], -0.6]), 0.015, np.array(AMBER) * 20.0))
            for du in (-2.6, 2.6):
                for dv in (-1.4, 1.4):
                    self.box("steel_frame", u + du - 0.045, u + du + 0.045, v + dv - 0.045, v + dv + 0.045, z, z + 0.92)
            for dv in (-1.4, 1.4):
                self.box("steel_frame", u - 2.65, u + 2.65, v + dv - 0.04, v + dv + 0.04, z + 0.84, z + 0.92)
            for du in (-2.6, 2.6):
                self.box("steel_frame", u + du - 0.04, u + du + 0.04, v - 1.4, v + 1.4, z + 0.84, z + 0.92)
            sag = lambda a, b: z + 0.88 - 0.43 * (1 - (a / 2.5) ** 2) * (1 - (b / 1.35) ** 2)
            # ropes along u and along v, each a thin strip lying in the net's surface
            for b in np.arange(-1.32, 1.33, 0.12):
                pts = [(a, b) for a in np.linspace(-2.55, 2.55, 18)]
                self.rope([(u + a, v + bb, sag(min(abs(a), 2.5) * np.sign(a), bb)) for a, bb in pts], (0, 1))
            for a in np.arange(-2.52, 2.53, 0.12):
                pts = [(a, b) for b in np.linspace(-1.38, 1.38, 10)]
                self.rope([(u + aa, v + b, sag(aa, min(abs(b), 1.35) * np.sign(b))) for aa, b in pts], (1, 0))

    def rope(self, pts, across, w=0.011):
        """A rope as a strip w wide lying in the net, both faces."""
        au, av = across
        for (u0, v0, z0), (u1, v1, z1) in zip(pts, pts[1:]):
            a = (u0 - au * w, v0 - av * w, z0)
            b = (u1 - au * w, v1 - av * w, z1)
            c = (u1 + au * w, v1 + av * w, z1)
            d = (u0 + au * w, v0 + av * w, z0)
            self.q("net_rope", a, b, c, d, n=np.array([0, 0, 1.0]))
            self.q("net_rope", d, c, b, a, n=np.array([0, 0, -1.0]))

    def searchlights(self):
        """CROSSING LIGHT: at each of the landmark's 18 points a plinth, a yoke and a drum pointing up, its lens lit
        after dark (the beams are lights.js's, from the same points)."""
        z = self.z + LIFT
        for u, v in self.beams:
            # a low plinth, a turntable on it, a yoke of two arms, and between them the drum, tilted 20 degrees out
            # toward the glass (the beams lean out over the city), the lens at its upper end and a finned back
            self.box("metal_dark", u - 0.3, u + 0.3, v - 0.3, v + 0.3, z, z + 0.12)
            self.geo.lathe("metal_panel", self.P(u, v, z + 0.12), [(0.22, 0.0), (0.22, 0.06), (0.18, 0.08), (0.0, 0.08)], segs=16)
            out = np.array([u, v]) / (np.hypot(u, v) or 1.0)
            ax = np.array([out[0] * math.sin(math.radians(20)), out[1] * math.sin(math.radians(20)), math.cos(math.radians(20))])
            side = np.array([-out[1], out[0]])
            piv = np.array([u, v, z + 0.62])
            for sgn in (-1, 1):                                         # the yoke's arms
                a0 = (u + side[0] * 0.3 * sgn, v + side[1] * 0.3 * sgn)
                self.box("metal_dark", a0[0] - 0.035, a0[0] + 0.035, a0[1] - 0.035, a0[1] + 0.035, z + 0.2, z + 0.66)
            self.geo.tube("metal_dark", [self.P(u + side[0] * 0.3, v + side[1] * 0.3, z + 0.62), self.P(u - side[0] * 0.3, v - side[1] * 0.3, z + 0.62)], 0.03, 8)
            lo, hi = piv - ax * 0.32, piv + ax * 0.3
            W = lambda q: self.P(q[0], q[1], q[2])
            self.geo.tube("metal_panel", [W(lo), W(lo + ax * 0.06), W(hi - ax * 0.04), W(hi)], 0.24, 20)
            for k in range(5):                                          # the fins round the back
                q = lo + ax * (0.06 + k * 0.035)
                self.geo.tube("metal_dark", [W(q), W(q + ax * 0.012)], 0.262, 20)
            self.geo.tube("metal_dark", [W(hi), W(hi + ax * 0.03)], 0.255, 20)     # the bezel
            self.disc("lamp_lens", W(hi + ax * 0.02), ax, 0.215)
            self.disc("metal_dark", W(lo), -ax, 0.24)

    def disc(self, mat, c, n, r, segs=20):
        n = n / np.linalg.norm(n)
        a = np.cross(n, [0, 0, 1.0]) if abs(n[2]) < 0.95 else np.cross(n, [1.0, 0, 0])
        a /= np.linalg.norm(a)
        b = np.cross(n, a)
        P = [c] + [c + (a * math.cos(t) + b * math.sin(t)) * r for t in np.linspace(0, 2 * math.pi, segs, endpoint=False)]
        self.geo.mesh(mat, P, [(0, 1 + k, 1 + (k + 1) % segs) for k in range(segs)], n=n, uv=[(0.5, 0.5)] * len(P))

    def benches(self):
        """Benches along the glass, 3 m of timber slats on dark steel, 1.0 m in from the glass, wherever the glass's
        foot is clear of the searchlights, the nets, the channels' ends and the pad's steps."""
        h1, h2, z = self.h1, self.h2, self.z + LIFT
        obs = self.obstacles()
        nets = [(-h1 + 9, h2 - 9), (-h1 + 9, -h2 + 22), (h1 - 24, -h2 + 7)]
        # (and none where the flights come up onto the deck: 6 m clear past each channel's end, the whole width of its
        # escalator and stair. Two benches stood 3 m in line past the escalators' heads, and once the benches were solid,
        # a walker stepping off was stopped by one)
        F = self.F
        n_, w_ = F["north"], F["west"]
        nu = (min(p[0] for p in n_) - 0.3, max(p[0] for p in n_) + 1.0)
        nv0 = min(p[1] for p in n_) - 0.3
        wu0 = min(p[0] for p in w_) - 0.3
        wv = (min(p[1] for p in w_) - 0.3, max(p[1] for p in w_) + 1.0)
        exits = [(nu[0], nu[1], nv0 - 6.0, nv0), (wu0 - 6.0, wu0, wv[0], wv[1])]
        clear = lambda u, v, r: (all(math.hypot(u - a, v - b) > r + 1.2 for a, b in self.beams)
                                 and all(abs(u - a) > 3.0 + r or abs(v - b) > 1.75 + 1.5 for a, b in nets)
                                 and all(not (a - r - 0.5 < u < b + r + 0.5 and c - r - 0.5 < v < d + r + 0.5) for a, b, c, d in obs)
                                 and all(not (a - r < u < b + r and c - r < v < d + r) for a, b, c, d in exits))
        self.bench_at = []
        for (axis, fixed, lo, hi) in (("u", -h2 + 1.0, -h1 + 4, h1 - 4), ("u", h2 - 1.0, -h1 + 4, h1 - 4), ("v", -h1 + 1.0, -h2 + 4, h2 - 4), ("v", h1 - 1.0, -h2 + 4, h2 - 4)):
            t = lo
            while t < hi:
                u, v = (t, fixed) if axis == "u" else (fixed, t)
                if clear(u, v, 1.6) and all(math.hypot(u - a, v - b) > 12.0 for a, b in self.bench_at):
                    self.bench(u, v, axis)
                    self.bench_at.append((u, v))
                    t += 14.0
                else:
                    t += 1.0

    def bench(self, u, v, axis):
        z = self.z + LIFT
        L, D = 1.5, 0.25
        R = (lambda a, b: (u + a, v + b)) if axis == "u" else (lambda a, b: (u + b, v + a))
        def bx(mat, a0, a1_, b0, b1, z0, z1, geo=None):
            (p, q_), (r, s) = R(a0, b0), R(a1_, b1)
            self.box(mat, min(p, r), max(p, r), min(q_, s), max(q_, s), z0, z1, geo=geo)
        for k in range(5):                              # the slats, 9 cm with 1 cm between
            b0 = -D + k * 0.1
            bx("wood_slat", -L, L, b0, b0 + 0.09, z + 0.40, z + 0.44)
        for a in (-L + 0.25, L - 0.25):                 # two legs of flat dark steel, a foot along the floor
            bx("steel_frame", a - 0.03, a + 0.03, -D + 0.02, D - 0.02, z + 0.36, z + 0.40)
            for b in (-D + 0.06, D - 0.06):
                bx("steel_frame", a - 0.03, a + 0.03, b - 0.02, b + 0.02, z, z + 0.36)
            bx("steel_frame", a - 0.03, a + 0.03, -D + 0.02, D - 0.02, z, z + 0.03)

    def heads(self):
        """The escalators' heads on the deck: a stainless landing plate, and a yellow line across before it."""
        F, z = self.F, self.z + LIFT + 0.004
        h1, h2 = self.h1, self.h2
        nv0, wu0 = F["north"][0][1], F["west"][0][0]
        up = np.array([0, 0, 1.0])
        # north (up): its head at v = nv0, the escalator 0.6 to 1.8 in from the outer glass (u = h1)
        self.q("metal_plate", (h1 - 1.85, nv0 - 1.6, z), (h1 - 0.55, nv0 - 1.6, z), (h1 - 0.55, nv0 - 0.3, z), (h1 - 1.85, nv0 - 0.3, z), n=up)
        self.q("yellow_line", (h1 - 1.85, nv0 - 1.75, z), (h1 - 0.55, nv0 - 1.75, z), (h1 - 0.55, nv0 - 1.65, z), (h1 - 1.85, nv0 - 1.65, z), n=up)
        # west (down): its head at u = wu0, 0.6 to 1.8 in from the outer glass (v = h2)
        self.q("metal_plate", (wu0 - 1.6, h2 - 1.85, z), (wu0 - 0.3, h2 - 1.85, z), (wu0 - 0.3, h2 - 0.55, z), (wu0 - 1.6, h2 - 0.55, z), n=up)
        self.q("yellow_line", (wu0 - 1.75, h2 - 1.85, z), (wu0 - 1.65, h2 - 1.85, z), (wu0 - 1.65, h2 - 0.55, z), (wu0 - 1.75, h2 - 0.55, z), n=up)


    # what stands on the deck and is solid to a walker (game.json hero[].boxes, game.js): the benches, the nets' frames
    # with their kerbs, the searchlights. The level is drawn, not walked: the landmark under it keeps the deck, the pad,
    # its steps, the channels and the glass, but nothing of what this level adds, so a walker went through the benches to
    # the knee (the owner's phone, at the glass where the walk's Yuna waits). Each a box in the city's frame:
    # [x, y, heading (to the box's length, from north toward east), half its length, half its width, z bottom, z top],
    # its top over a walker's knee (nav.js KNEE) however low the thing is, so that it is a thing to walk round, never a
    # step to take onto it
    def boxes(self):
        z, out = self.z + LIFT, []
        ang = lambda d: math.atan2(float(d[0]), float(d[1]))      # (a direction in the city's frame as a heading from north)
        def put(u, v, axis, hl, hw, top):
            x, y = self.c + self.a1 * u + self.a2 * v
            out.append([round(float(x), 2), round(float(y), 2), round(ang(self.a1 if axis == "u" else self.a2), 4), hl, hw, round(z - 0.05, 2), round(max(z + 0.6, top), 2)])
        for (u, v) in self.bench_at:                                 # 3 m of slats, 0.5 m deep (bench)
            axis = "u" if abs(abs(v) - (self.h2 - 1.0)) < 0.01 else "v"
            put(u, v, axis, 1.55, 0.27, z + 0.44)
        h1, h2 = self.h1, self.h2
        for (u, v) in ((-h1 + 9, h2 - 9), (-h1 + 9, -h2 + 22), (h1 - 24, -h2 + 7)):   # the nets: their frames and the kerbs round the lawn
            put(u, v, "u", 3.1, 1.85, z + 0.92)
        for (u, v) in self.beams:                                    # the searchlights: the plinth, the yoke and the drum
            put(u, v, "u", 0.34, 0.34, z + 1.0)
        return out


HIDE = ["sky_deck", "sky_deck_light", "sky_glass", "sky_steel_dark", "sky_compass_atlas", "sky_steps_deck_light", "sky_net", "sky_lit_lamp"]


def boxes_only():
    """The solids alone, without Blender: python cities/shibuya/hero_skyroof.py --boxes writes them into
    cities/shibuya/city.json game.hero (skyroof) .boxes (then pipeline/game_text.py and pipeline/pack.py)."""
    import hero_kit as K
    L = Level(K)
    L.benches()
    return L.boxes()


def build(K):
    """(geo, atlas, materials, meta) for blender/build_hero.py."""
    L = Level(K)
    geo, atlas = L.build()
    r = round(math.hypot(L.h1, L.h2) + 1.0, 1)
    meta = {"id": ID, "at": [round(float(L.c[0]), 2), round(float(L.c[1]), 2)], "r": r, "z": round(L.z, 2), "glb": f"hero/{ID}.glb",
            "bake_gain": 8.0, "hide": HIDE, "boxes": L.boxes()}
    print("game.hero:", json.dumps({k: meta[k] for k in ("at", "r", "z")}), f"{len(L.bench_at)} benches, {len(meta['boxes'])} solid boxes")
    return geo, atlas, materials(K), meta


if __name__ == "__main__" and "--boxes" in sys.argv:
    # (written into city.json's own lines, as its other hand-kept lists are: the file is not reflowed)
    import re
    sys.path.insert(0, os.path.join(ROOT, "blender"))
    B = boxes_only()
    path = os.path.join(HERE, "city.json")
    text = open(path, encoding="utf-8").read()
    at = text.index('"id": "%s",' % ID)
    note = text.index('"note":', at)
    ind = re.search(r"\n( *)\"note\":", text[at:note + 8]).group(1)
    head, body = text[:at], text[at:note]
    body = re.sub(r'\n *"boxes(_note)?": .*,(?=\n)', "", body)
    lines = (f'{ind}"boxes": {json.dumps(B)},\n'
             f'{ind}"boxes_note": "What stands on the deck and is solid to a walker (cities/shibuya/hero_skyroof.py boxes, game.js): the benches, '
             "the nets' frames and kerbs, the searchlights. [x, y, heading of its length from north toward east, half length, half width, "
             'z bottom, z top], its top over a walker\'s knee: a thing to walk round, never a step.",\n')
    body = body[:body.rstrip(" ").rfind("\n") + 1] + lines + ind
    open(path, "w", encoding="utf-8").write(head + body + text[note:])
    print(f"{len(B)} boxes into {path}")
