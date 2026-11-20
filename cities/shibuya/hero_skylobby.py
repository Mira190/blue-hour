"""SHIBUYA SKY's street entrance and lift hall, a small hero level of its own (blender/build_hero.py --city shibuya
--level skylobby; docs/HERO.md, "SKY's street entrance"; docs/cities/shibuya.md, "The way up, as it is").

Why: the story's fourth frame and the walk send the player from the crossing to the lift at Shibuya Scramble Square
that goes up to SHIBUYA SKY. Until November 2026 its lobby was set dressing drawn with the story's own flat, self-lit
material (blender/build_set.py LOBBY and `lift`): stone, steel and the lift's doors read as flat colour, nothing
reflected the lines of light, and the way in was an open mouth in the tower's generic wall, 17 m west of where the
real one is (issue 53).

The real one (docs/HERO.md, "SKY's street entrance", its sources): a lift hall of its own at the far east end of the
tower's north face, practically at its north-east corner, a few metres east of the Hikarie-side entrance, under the
station deck's overhang. A glass wall in stainless frames, its lower lites fritted, with two single framed doors in it
about 2 m apart; a dark metal soffit over it with one line of round downlights; pale square tiles in front of it; and to
its west, free-standing, a square pillar in light grey panels carrying SHIBUYA SKY's lit disc and name over a portrait
screen. Behind the glass the lifts (two glass-shafted cars, 1F to 14F: Elevator Journal 28's E3 bank).

What is built, in the frame of the lobby pipeline/lobby.py cut into the tower (game.json lifts "sky-gate", its first
stop's `door` on the face and `at` inside; city.json game.lobbies gives where the way in is and where the glass stands):

  * in front: the tiles from the street to the glass, meeting the street's slope; the cut's sides lined in dark granite;
    the soffit in dark metal with its line of downlights; the pillar with its disc, its name and its screen;
  * the glass wall: dark-tinted, in stainless frames, its lower lites fritted; the two doors, automatic sliding leaves
    standing open behind the fixed lites beside them (a door that is always open is what a player walking up to an
    automatic one sees); solid where it is glass (game.json hero[].posts), open in the doorways;
  * the hall behind it (its finishes are not in any photograph found: they are SKY's own, the black and the lines of
    light of SKY GATE's cars and the 45F LEADING LINE): a floor of polished charcoal granite in slabs laid in courses,
    each slab cut from its own part of the block; black panelled walls with a reveal between each panel and a line of
    light at their foot; a black ceiling with five lines of light leading to the lifts, and their reflections in the
    polished floor;
  * the lifts: two cars side by side in stainless portals with hairline-brushed leaves, each with its indicator (the
    arrow and 14F, where the street lift goes: SKY GATE runs on from 14F to 45F) and its call plate, the name over
    them in lit letters; a queue's two belts on stainless posts (game.json hero[].belts: solid).

The hall's floor is level (a real hall is), while the game's ground under it falls half a metre from the street to the
back wall: the level says so (meta "floor": its walking surface is its own drawn floor, nav.js lift), so that whoever
stands in it stands on the stone and not in it or over it.
"""
import json
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "blender"))
import hero_open as HP  # noqa: E402

ID = "skylobby"
LIFT_ID = "sky-gate"

# the lobby's measures (metres, in its own frame: u across to the right as you go in, v in from the face, z up)
BACK_V = 7.8            # the lifts' wall, from the face (the cut goes 8 m in; its lining stands in front of the cut's wall)
LINE = 0.04             # a wall's lining stands this far in front of the cut's own wall
APRON_V = -1.8          # the tiles reach this far out from the face
DOORS = (-1.0, 1.0)     # the two doors' middles across the glass
DOOR_W = 1.0            # a door's clear width
TRANSOM = 2.5           # the doors' head, over the floor
TILE = 0.6              # the tiles in front: 600 mm square, laid square
SLAB = (1.2, 0.6)       # the hall's slabs (across, in), in courses across the way in, every other course half a slab over
JOINT = 0.004
PANEL = 1.2             # the hall's wall panels
CARS = (-1.45, 1.45)    # the two cars' middles across the back wall
CAR_W, CAR_H = 1.1, 2.35  # a car's doorway
BELTS = (-2.7, 2.7)     # the queue's two belts, from a post 3 m out to a catch on the back wall
PILLAR = (3.55, 0.9, 1.1, 3.7)    # the sign pillar: u, v of its middle (u is west: to the right going in), its side, its height
LINES_U = (-3.2, -1.6, 0.0, 1.6, 3.2)   # the hall's lines of light
WARM = (1.0, 0.93, 0.82)                # 3500 K, the lines' light
DOWN = (1.0, 0.95, 0.88)                # the soffit's downlights, 4000 K


def materials(K):
    granite = lambda srgb: K.tint_to("granite", srgb)
    return {
        # the tiles in front: pale beige, a fine-grained stone's speckle, honed (wet in the rain: ground*)
        "ground_tile": {"tex": "granite", "maps": "cn", "rough": 0.45, "tint": granite((196, 188, 172))},
        "ground_tile_joint": {"color": (0.36, 0.34, 0.31), "rough": 0.9},
        # the hall's floor: polished granite, charcoal; under it the joints' slab
        "room_floor_stone": {"tex": "granite", "maps": "cn", "rough": 0.14, "tint": granite((30, 30, 32)), "sky": 0.12},
        "room_floor_joint": {"color": (0.008, 0.008, 0.009), "rough": 0.7},
        # the cut's sides in front of the glass: honed dark granite
        "wall_jamb": {"tex": "granite", "maps": "cn", "rough": 0.3, "tint": granite((52, 52, 54)), "sky": 0.5},
        # the soffit: dark grey metal panels
        "metal_soffit": {"color": (0.075, 0.077, 0.08), "rough": 0.45, "metal": 0.7, "sky": 0.4},
        # the pillar: light warm grey panels, its name printed on them
        "wall_pillar": {"color": (0.5, 0.485, 0.46), "rough": 0.5, "sky": 0.6},
        "wall_pillar_sign": {"map": "atlas", "rough": 0.5, "sky": 0.6},
        # the hall's lining: black lacquered panels, a reveal between them; its ceiling matt black
        "room_panel": {"color": (0.007, 0.007, 0.008), "rough": 0.22, "sky": 0.1},
        "room_reveal": {"color": (0.004, 0.004, 0.004), "rough": 0.8},
        "room_ceiling": {"color": (0.016, 0.016, 0.017), "rough": 0.85},
        # stainless steel, hairline-brushed: the glass wall's frames, the portals, the leaves, the posts, the call plates
        "room_steel": {"tex": "hairline", "maps": "cnr", "color": (0.42, 0.43, 0.45), "metal": 1.0, "rough": 0.3, "sky": 0.35},
        "metal_frame": {"color": (0.5, 0.51, 0.52), "rough": 0.32, "metal": 1.0, "sky": 0.5},
        "room_belt": {"color": (0.02, 0.02, 0.022), "rough": 0.6},
        "room_mat": {"color": (0.03, 0.03, 0.032), "rough": 0.95},
        # the glass: tinted dark, a little of the street mirrored in it, the hall seen through it; its frit
        "glass_front": {"color": (0.3, 0.34, 0.35), "rough": 0.03, "metal": 0.0, "alpha": 0.32, "sky": 0.55},
        "glass_frit": {"color": (0.85, 0.85, 0.84), "rough": 0.4, "alpha": 0.55},
        # what gives light: the lines, the downlights, the indicators, the name, the disc and the screen (in the atlas)
        "glow_line": {"color": (0.9, 0.86, 0.8), "emissive": WARM, "glow": 1.6},
        "glow_down": {"color": (0.9, 0.9, 0.88), "emissive": DOWN, "glow": 2.0},
        "glow_sign": {"map": "atlas", "color": (0.01, 0.01, 0.01), "rough": 0.2, "emissive": True, "emissive_only": True, "glow": 1.0},
        # the lines of light mirrored in the polished floor: light added over it (hero.js refl*), drawn in the atlas
        "refl_floor": {"map": "atlas", "color": (0.0, 0.0, 0.0), "rough": 1.0, "emissive": True, "emissive_only": True, "glow": 1.0},
    }


# ---------------------------------------------------------------- textures drawn here

def hairline(d, n=512):
    """Stainless steel with a hairline finish: fine scratches all one way, the only thing in it."""
    from PIL import Image
    from scipy import ndimage
    rng = np.random.default_rng(11)
    h = ndimage.gaussian_filter1d(rng.normal(size=(n, n)), 40, axis=1, mode="wrap")     # long along u, fine across
    h = (h - h.mean()) / (h.std() or 1)
    col = np.dstack([np.full((n, n), 200.0) + 5 * h] * 3) * np.array([0.99, 1.0, 1.01])
    rough = np.clip(0.3 + 0.05 * h, 0.2, 0.4)
    os.makedirs(d, exist_ok=True)
    Image.fromarray(np.clip(col, 0, 255).astype(np.uint8), "RGB").save(os.path.join(d, "Color.png"))
    dy = (np.roll(h, 1, 0) - np.roll(h, -1, 0)) * 0.5 * 0.35
    nm = np.dstack([np.zeros_like(dy), -dy, np.ones_like(dy)])
    nm /= np.linalg.norm(nm, axis=2, keepdims=True)
    Image.fromarray(np.clip((nm * 0.5 + 0.5) * 255, 0, 255).astype(np.uint8), "RGB").save(os.path.join(d, "NormalGL.png"))
    Image.fromarray((rough * 255).astype(np.uint8), "L").save(os.path.join(d, "Roughness.png"))


# ---------------------------------------------------------------- the atlas

FONT_URL = "https://raw.githubusercontent.com/google/fonts/main/{}"
FONTS = {"jost": "ofl/jost/Jost%5Bwght%5D.ttf", "noto": "ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf"}   # SIL Open Font License


def font(name, size, weight=None):
    import urllib.request
    from PIL import ImageFont
    d = os.path.join(ROOT, "data", "raw", "fonts")
    os.makedirs(d, exist_ok=True)
    local = os.path.join(d, os.path.basename(FONTS[name]).replace("%5B", "[").replace("%5D", "]"))
    if not os.path.exists(local):
        req = urllib.request.Request(FONT_URL.format(FONTS[name]), headers={"User-Agent": "blue-hour (https://github.com/Mira190/blue-hour)"})
        with urllib.request.urlopen(req, timeout=120) as r, open(local, "wb") as f:
            f.write(r.read())
    f = ImageFont.truetype(local, size)
    if weight:
        try:
            f.set_variation_by_axes([weight])
        except Exception:
            pass
    return f


def spaced(d, text, f, size, track, w, y, fill):
    widths = [d.textlength(c, font=f) for c in text]
    cx = (w - sum(widths) - track * size * (len(text) - 1)) / 2
    for c, cw in zip(text, widths):
        d.text((cx, y), c, font=f, fill=fill, anchor="lm")
        cx += cw + track * size


def draw_name(text, size, track=0.18, colour=(255, 246, 228), ground=(0, 0, 0), weight=500, halo=True):
    """Letters on a face: lit on black (with the faint spread of a lit acrylic letter), or printed on a panel."""
    def draw(img, r):
        from PIL import Image, ImageDraw, ImageFilter
        x, y, w, h = r
        one = Image.new("RGB", (w, h), ground)
        spaced(ImageDraw.Draw(one), text, font("jost", size, weight), size, track, w, h / 2, colour)
        if halo:
            one = Image.blend(one.filter(ImageFilter.GaussianBlur(size * 0.06)), one, 0.75).point(lambda v: min(255, v * 1.15))
        img.paste(one, (x, y))
    return draw


def draw_indicator(img, r):
    """A car's indicator: the up arrow and the floor it goes to, amber in a black glass face."""
    from PIL import Image, ImageDraw
    x, y, w, h = r
    one = Image.new("RGB", (w, h), (2, 2, 2))
    d = ImageDraw.Draw(one)
    col = (255, 170, 70)
    ax, ay, s = w * 0.27, h * 0.5, h * 0.28
    d.polygon([(ax - s, ay + s * 0.1), (ax + s, ay + s * 0.1), (ax, ay - s * 1.0)], fill=col)
    d.rectangle([ax - s * 0.3, ay + s * 0.1, ax + s * 0.3, ay + s * 0.95], fill=col)
    d.text((w * 0.66, h * 0.52), "14F", font=font("jost", int(h * 0.62), 500), fill=col, anchor="mm")
    img.paste(one, (x, y))


def draw_button(img, r):
    """A call plate's face: one round button, its ring lit."""
    from PIL import Image, ImageDraw
    x, y, w, h = r
    one = Image.new("RGB", (w, h), (0, 0, 0))
    d = ImageDraw.Draw(one)
    c, rr = (w / 2, h / 2), min(w, h) * 0.32
    d.ellipse([c[0] - rr, c[1] - rr, c[0] + rr, c[1] + rr], outline=(255, 200, 120), width=max(2, int(rr * 0.22)))
    s = rr * 0.42
    d.polygon([(c[0] - s, c[1] + s * 0.5), (c[0] + s, c[1] + s * 0.5), (c[0], c[1] - s * 0.7)], fill=(255, 230, 190))
    img.paste(one, (x, y))


def draw_disc(img, r):
    """The pillar's lit disc: an opal face lit from behind, the sky's pale blue over a warm white (the hall's mark, not
    its logo drawn: a disc of light)."""
    from PIL import Image
    x, y, w, h = r
    t = (np.arange(h) + 0.5)[:, None] / h * np.ones((1, w))
    top, low = np.array([196, 222, 240.0]), np.array([255, 244, 222.0])
    k = np.clip((t - 0.25) / 0.5, 0, 1)[..., None]
    rgb = top * (1 - k) + low * k
    img.paste(Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB"), (x, y))


def draw_screen(img, r):
    """The pillar's portrait screen: the roof at dusk over the city and the way up (invented, as a screen there shows)."""
    from PIL import Image, ImageDraw
    x, y, w, h = r
    t = (np.arange(h) + 0.5)[:, None] / h * np.ones((1, w))
    sky = np.array([22, 40, 92.0]) * (1 - t[..., None]) + np.array([214, 132, 96.0]) * t[..., None]
    one = Image.fromarray(np.clip(sky, 0, 255).astype(np.uint8), "RGB")
    d = ImageDraw.Draw(one)
    rng = np.random.default_rng(5)
    base = int(h * 0.7)
    xx = 0
    while xx < w:           # the city's towers against the glow, their windows lit
        bw, bh = int(rng.integers(8, 22)), int(rng.integers(20, 90))
        d.rectangle([xx, base - bh, xx + bw, h], fill=(12, 14, 24))
        for wy in range(base - bh + 4, h, 6):
            for wx in range(xx + 2, xx + bw - 2, 5):
                if rng.random() < 0.35:
                    d.point((wx, wy), fill=(255, 210, 140))
        xx += bw + int(rng.integers(0, 4))
    d.rectangle([0, int(h * 0.82), w, h], fill=(8, 10, 18))
    spaced(d, "SHIBUYA SKY", font("jost", int(w * 0.11), 500), int(w * 0.11), 0.12, w, int(h * 0.12), (255, 255, 255))
    d.text((w / 2, h * 0.88), "14F  ↑", font=font("jost", int(w * 0.1), 500), fill=(255, 255, 255), anchor="mm")
    d.text((w / 2, h * 0.95), "展望施設へのエレベーター", font=font("noto", int(w * 0.06), 500), fill=(220, 225, 235), anchor="mm")
    img.paste(one, (x, y))


def draw_refl(img, r):
    """A line of light's reflection in polished stone: brightest under the line, spread a little across by the polish,
    falling off at its ends."""
    from PIL import Image
    x, y, w, h = r
    u = (np.arange(w) + 0.5) / w * 2 - 1
    v = (np.arange(h) + 0.5) / h
    across = (np.exp(-(u / 0.12) ** 2) * 0.8 + np.exp(-(u / 0.45) ** 2) * 0.2) * 0.35   # (a dark polished stone gives back a few percent)
    along = np.clip(np.minimum(v / 0.12, (1 - v) / 0.12), 0, 1) ** 1.5
    a = (along[:, None] * across[None, :])[..., None] * np.array(WARM) * 255
    img.paste(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGB"), (x, y))


# ---------------------------------------------------------------- the frame of the lobby

class Frame:
    """The lobby's frame from its lift's first stop (game.json): the door on the tower's face, the stop inside."""

    def __init__(self):
        from shapely.geometry import Point, Polygon
        G = json.load(open(os.path.join(ROOT, "web", "data", "shibuya", "game.json")))
        C = json.load(open(os.path.join(ROOT, "cities", "shibuya", "city.json")))
        s = next(l for l in G["lifts"] if l["id"] == LIFT_ID)["stops"][0]
        self.door, self.at = np.array(s["door"], float), np.array(s["at"][:2], float)
        self.lobby = s["lobby"]
        self.glass = C["game"]["lobbies"][LIFT_ID].get("glass", 2.4)
        n = self.at - self.door
        self.n = n / np.linalg.norm(n)
        self.u = np.array([self.n[1], -self.n[0]])       # to the right as you go in
        self.half = self.lobby["w"] / 2 - LINE
        self.T = HP.Ground("shibuya")
        # the cut's ceiling: the underside of the tower over the lobby (buildings.json passages), less a hair
        B = json.load(open(os.path.join(ROOT, "web", "data", "shibuya", "buildings.json")))
        mid = Point(*(self.door + self.n * 4.0))
        ring = lambda r: [(r[i] / 10, r[i + 1] / 10) for i in range(0, len(r), 2)]
        unders = [(q[1] + q[2]) / 10 for q in (B["s"][k] for k in B.get("passages", [])) if q[2] > 0 and Polygon(ring(q[4])).buffer(0).contains(mid)]
        self.ceil = min(unders) - 0.02 if unders else self.ground(0, 0) + 5.35
        # the hall's floor: level, at the street's height where the doorway meets the glass (the stop's own: lobby.py)
        self.floor = round(self.ground(0.0, self.glass) + 0.012, 3)

    def xy(self, u, v):
        return self.door + self.u * u + self.n * v

    def P(self, u, v, z):
        x, y = self.xy(u, v)
        return np.array([x, y, z])

    def ground(self, u, v):
        return self.T(*self.xy(u, v))


# ---------------------------------------------------------------- the level

class Level:
    def __init__(self, K):
        self.K = K
        K.register("hairline", 0.6, hairline)
        self.geo = K.Geo()
        self.A = K.Atlas(1024, 1024)
        self.F = Frame()
        self.G = self.F.glass
        self.posts, self.belts = [], []

    # a quad in the frame: corners as (u, v, z), counter-clockwise from its front
    def q(self, mat, a, b, c, d, **kw):
        F = self.F
        return self.geo.quad(mat, F.P(*a), F.P(*b), F.P(*c), F.P(*d), **kw)

    def box(self, mat, u0, u1, v0, v1, z0, z1, faces="all", emit=None, uvm=1.0):
        F = self.F
        self.geo.box(mat, F.P((u0 + u1) / 2, (v0 + v1) / 2, z0), (F.u, F.n), (u1 - u0, v1 - v0, z1 - z0), faces=faces, emit=emit, uvm=uvm)

    def disc(self, mat, u, v, z, r, segs=20, normal="down", uv=None, emit=None):
        """A round face: lying under a soffit (normal down), or standing on a face toward -v (normal "out")."""
        F, geo = self.F, self.geo
        if normal == "down":
            P = [F.P(u, v, z)] + [F.P(u + r * math.cos(t), v + r * math.sin(t), z) for t in np.linspace(0, 2 * math.pi, segs, endpoint=False)]
            tri, nn = [(0, 1 + (k + 1) % segs, 1 + k) for k in range(segs)], np.array([0, 0, -1.0])
        else:
            P = [F.P(u, v, z)] + [F.P(u + r * math.cos(t), v, z + r * math.sin(t)) for t in np.linspace(0, 2 * math.pi, segs, endpoint=False)]
            tri, nn = [(0, 1 + k, 1 + (k + 1) % segs) for k in range(segs)], -np.r_[F.n, 0.0]
        UV = None
        if uv:   # (the cell's corners: bottom left .. top left)
            (u0, v0), (u1, _), (_, v1), _ = uv
            UV = [((u0 + u1) / 2, (v0 + v1) / 2)] + [((u0 + u1) / 2 + (u1 - u0) / 2 * math.cos(t), (v0 + v1) / 2 + (v1 - v0) / 2 * math.sin(t))
                                                     for t in np.linspace(0, 2 * math.pi, segs, endpoint=False)]
        geo.mesh(mat, P, tri, n=nn, uv=UV)
        if emit:
            geo.emitters.append((P[0] + nn * 0.05, nn, math.pi * r * r, np.asarray(emit[0]) * emit[1]))

    def build(self):
        self.atlas()
        self.apron()
        self.floor()
        self.front()
        self.pillar()
        self.screen()
        self.walls()
        self.ceiling()
        self.lifts()
        self.queue()
        return self.geo, self.A

    def atlas(self):
        A = self.A
        A.cell("name_big", 1000, 150, draw_name("SHIBUYA SKY", 104, 0.2))
        A.cell("name_pillar", 512, 96, draw_name("SHIBUYA SKY", 62, 0.16, colour=(40, 42, 46), ground=(188, 183, 175), weight=600, halo=False))
        A.cell("indicator", 256, 96, draw_indicator)
        A.cell("button", 64, 64, draw_button)
        A.cell("refl", 64, 128, draw_refl)
        A.cell("disc", 128, 128, draw_disc)
        A.cell("screen", 256, 448, draw_screen)

    def courses(self, a, b, w, off=0.0):
        out, x = [], a - off
        while x < b - 1e-6:
            if min(b, x + w) - max(a, x) > 0.02:
                out.append((max(a, x), min(b, x + w)))
            x += w
        return out

    def apron(self):
        """The tiles from the street to the glass: 600 mm square, pale, laid square, 5 mm joints. Out in front of the face
        they lie on the street (over the paving the Miyamasu level draws there), and from the face to the glass they come
        to the hall's level floor."""
        F, G, rep = self.F, self.G, self.K.TEXTURES["granite"][1]
        rng = np.random.default_rng(7)
        def z(u, v):
            out = F.ground(u, min(v, 0.0)) + 0.06
            if v <= 0:
                return out
            k = min(1.0, v / G)
            return F.ground(u, v) + 0.06 * (1 - k) + (F.floor - F.ground(u, G)) * k
        j = 0.0025
        us = self.courses(-F.half, F.half, TILE, off=(F.half % TILE) / 2)
        vs = self.courses(APRON_V, G, TILE)
        for v0, v1 in vs:
            for u0, u1 in us:
                pts = [(u0 + j, v0 + j), (u1 - j, v0 + j), (u1 - j, v1 - j), (u0 + j, v1 - j)]
                ou, ov = rng.random(2) * 3
                self.q("ground_tile", *[(a, b, z(a, b)) for a, b in pts], uv=[(ou + a / rep, ov + b / rep) for a, b in pts])
        # the joints: a slab of grout just under the tiles, its edges down to the street
        pts = [(-F.half, APRON_V), (F.half, APRON_V), (F.half, G), (-F.half, G)]
        self.q("ground_tile_joint", *[(a, b, z(a, b) - 0.004) for a, b in pts], sub=(8, 6))
        for s in (-1, 1):
            u = s * F.half
            a, b = (APRON_V, 0.0) if s > 0 else (0.0, APRON_V)
            self.q("ground_tile_joint", (u, a, z(u, a) - 0.004), (u, b, z(u, b) - 0.004), (u, b, z(u, b) - 0.07), (u, a, z(u, a) - 0.07))
        self.q("ground_tile_joint", (F.half, APRON_V, z(F.half, APRON_V) - 0.004), (-F.half, APRON_V, z(-F.half, APRON_V) - 0.004),
               (-F.half, APRON_V, z(-F.half, APRON_V) - 0.07), (F.half, APRON_V, z(F.half, APRON_V) - 0.07))

    def floor(self):
        """The hall's floor: polished granite slabs 1.2 m by 0.6 m in courses across the way in, every other course half a
        slab over, joints 4 mm. Each slab shows its own part of the stone (the texture's offset is the slab's own), so a
        slab differs from its neighbour as cut stone does, and nothing else changes across the floor."""
        F, G, rep, z = self.F, self.G, self.K.TEXTURES["granite"][1], self.F.floor
        rng = np.random.default_rng(53)
        sw, sd = SLAB
        v0 = G + 0.08
        self.q("room_floor_joint", (-F.half, v0, z - 0.003), (F.half, v0, z - 0.003), (F.half, BACK_V, z - 0.003), (-F.half, BACK_V, z - 0.003))
        for row, (va, vb) in enumerate(self.courses(v0, BACK_V, sd)):
            for u0, u1 in self.courses(-F.half, F.half, sw, off=sw / 2 if row % 2 else 0.0):
                ou, ov = rng.random(2) * 4
                pts = [(u0 + JOINT / 2, va + JOINT / 2), (u1 - JOINT / 2, va + JOINT / 2), (u1 - JOINT / 2, vb - JOINT / 2), (u0 + JOINT / 2, vb - JOINT / 2)]
                self.q("room_floor_stone", *[(a, b, z) for a, b in pts], uv=[(ou + a / rep, ov + b / rep) for a, b in pts], sub=(2, 1))
        # the doors' track in the threshold, and a mat inside each door, sunk flush in a stainless frame
        self.box("room_steel", -F.half + 0.1, F.half - 0.1, G - 0.04, G + 0.08, z - 0.01, z + 0.002, faces=("top",))
        for du in DOORS:
            self.box("room_steel", du - 0.75, du + 0.75, G + 0.12, G + 1.5, z - 0.01, z + 0.002, faces=("top",))
            self.box("room_mat", du - 0.72, du + 0.72, G + 0.15, G + 1.47, z - 0.01, z + 0.004, faces=("top",))
        # the lines' reflections in the polished floor, under each line, from inside the doors to the lifts' threshold
        q = self.A.uv("refl")
        for lu in LINES_U:
            self.q("refl_floor", (lu - 0.32, G + 0.6, z + 0.003), (lu + 0.32, G + 0.6, z + 0.003), (lu + 0.32, BACK_V - 0.5, z + 0.003), (lu - 0.32, BACK_V - 0.5, z + 0.003), uv=q)

    def front(self):
        """In front of the glass: the cut's sides lined in dark granite, the soffit in dark metal with its line of round
        downlights over the doors."""
        F, G, h, z1 = self.F, self.G, self.F.half, self.F.ceil
        z0 = F.floor - 0.6
        for s in (-1, 1):
            u = s * h
            a, b = (APRON_V * 0 - 0.02, G) if s < 0 else (G, -0.02)
            self.q("wall_jamb", (u, a, z0), (u, b, z0), (u, b, z1), (u, a, z1))
        self.q("metal_soffit", (-h, G, z1), (h, G, z1), (h, -0.02, z1), (-h, -0.02, z1))
        # (the soffit's panel joints: a dark line every 1.2 m across)
        for v in np.arange(0.6, G - 0.1, 0.6):
            self.q("room_reveal", (-h, v + 0.006, z1 - 0.003), (h, v + 0.006, z1 - 0.003), (h, v - 0.006, z1 - 0.003), (-h, v - 0.006, z1 - 0.003))
        for u in np.arange(-4.2, 4.21, 1.4):
            self.disc("room_steel", u, G - 0.75, z1 - 0.004, 0.09, normal="down")
            self.disc("glow_down", u, G - 0.75, z1 - 0.008, 0.07, normal="down", emit=(DOWN, 26.0))

    def pillar(self):
        """The sign pillar, free-standing in front of the glass to the west of the doors: light grey panels with a reveal
        between them; on its face and its west side the lit disc and the name, and on its face the portrait screen."""
        F = self.F
        pu, pv, side, ht = PILLAR
        z0, s2 = F.ground(pu, min(pv, 0)) - 0.1, side / 2
        A = self.A
        self.box("wall_pillar", pu - s2, pu + s2, pv - s2, pv + s2, z0, F.floor + ht)
        # its panels' reveals: a band round it every 0.9 m
        for zz in np.arange(F.floor + 0.9, F.floor + ht - 0.1, 0.9):
            self.box("room_reveal", pu - s2 - 0.003, pu + s2 + 0.003, pv - s2 - 0.003, pv + s2 + 0.003, zz - 0.005, zz + 0.005)
        # the face (toward the street, -v) and the west side (+u): the disc over the name
        dz, nz = F.floor + ht - 0.62, F.floor + ht - 1.18
        self.disc("glow_sign", pu, pv - s2 - 0.006, dz, 0.36, segs=40, normal="out", uv=A.uv("disc"), emit=((0.95, 0.97, 1.0), 2.5))
        self.q("wall_pillar_sign", (pu - 0.5, pv - s2 - 0.004, nz), (pu + 0.5, pv - s2 - 0.004, nz), (pu + 0.5, pv - s2 - 0.004, nz + 0.19), (pu - 0.5, pv - s2 - 0.004, nz + 0.19), uv=A.uv("name_pillar"))
        # (on the west side, the same, facing +u: seen from there, +v is to the right)
        wu = pu + s2 + 0.006
        c = F.P(wu, pv, dz)
        P = [c] + [F.P(wu, pv + 0.36 * math.cos(t), dz + 0.36 * math.sin(t)) for t in np.linspace(0, 2 * math.pi, 40, endpoint=False)]
        (u0, v0), (u1, _), (_, v1), _ = A.uv("disc")
        UV = [((u0 + u1) / 2, (v0 + v1) / 2)] + [((u0 + u1) / 2 + (u1 - u0) / 2 * math.cos(t), (v0 + v1) / 2 + (v1 - v0) / 2 * math.sin(t)) for t in np.linspace(0, 2 * math.pi, 40, endpoint=False)]
        self.geo.mesh("glow_sign", P, [(0, 1 + k, 1 + (k + 1) % 40) for k in range(40)], n=np.r_[F.u, 0.0], uv=UV)
        self.q("wall_pillar_sign", (wu - 0.002, pv - 0.5, nz), (wu - 0.002, pv + 0.5, nz), (wu - 0.002, pv + 0.5, nz + 0.19), (wu - 0.002, pv - 0.5, nz + 0.19), uv=A.uv("name_pillar"))
        # the screen, sunk in a frame on the face
        sz = F.floor + 0.55
        self.box("metal_frame", pu - 0.42, pu + 0.42, pv - s2 - 0.03, pv - s2, sz - 0.04, sz + 1.38, faces=("-v", "+u", "-u", "top", "bot"))
        self.q("glow_sign", (pu - 0.37, pv - s2 - 0.031, sz), (pu + 0.37, pv - s2 - 0.031, sz), (pu + 0.37, pv - s2 - 0.031, sz + 1.3), (pu - 0.37, pv - s2 - 0.031, sz + 1.3),
               uv=A.uv("screen"), emit=((0.55, 0.5, 0.6), 1.2))
        x, y = F.xy(pu, pv)
        for a in (-1, 1):     # (solid: its corners and middle as posts)
            for b in (-1, 1):
                xx, yy = F.xy(pu + a * (s2 - 0.14), pv + b * (s2 - 0.14))
                self.posts.append([round(float(xx), 2), round(float(yy), 2)])
        self.geo.walls.append((F.P(pu - s2, pv - s2, z0), F.P(pu + s2, pv - s2, z0), z0, F.floor + ht))

    def screen(self):
        """The glass wall across the cut, set back under the soffit: stainless frames, fixed lites with a fritted band
        low, two doorways with a transom over them, lites to the soffit over that; each door's sliding leaf standing
        open behind the fixed lite beside it, outward. Solid where it is glass (posts), open in the doorways."""
        F, G, z0, z1, h = self.F, self.G, self.F.floor, self.F.ceil, self.F.half
        m, dm = 0.05, 0.12
        frame = lambda u0, u1, za, zb: self.box("metal_frame", u0, u1, G - dm / 2, G + dm / 2, za, zb)
        hw = DOOR_W / 2
        cuts = sorted({-h, h} | {d + s * hw for d in DOORS for s in (-1, 1)} | {d + s * (DOOR_W + hw) for d in DOORS for s in (-1, 1)})
        cuts = [c for c in cuts if -h <= c <= h]
        doors = [(d - hw, d + hw) for d in DOORS]
        for u in cuts:
            a, b = (-h, -h + m) if u == -h else (h - m, h) if u == h else (u - m / 2, u + m / 2)
            frame(a, b, z0, z1)
        frame(-h, h, z1 - 0.08, z1)
        for a, b in zip(cuts[:-1], cuts[1:]):
            door = any(abs(a - d0) < 1e-6 and abs(b - d1) < 1e-6 for d0, d1 in doors)
            frame(a, b, z0 + TRANSOM, z0 + TRANSOM + 0.1)
            self.pane(a + m / 2, b - m / 2, G, z0 + TRANSOM + 0.1, z1 - 0.08)
            if door:
                continue
            frame(a, b, z0, z0 + 0.08)
            self.pane(a + m / 2, b - m / 2, G, z0 + 0.08, z0 + TRANSOM)
            self.q("glass_frit", (a + m / 2, G - 0.004, z0 + 0.08), (b - m / 2, G - 0.004, z0 + 0.08), (b - m / 2, G - 0.004, z0 + 1.0), (a + m / 2, G - 0.004, z0 + 1.0))
            for t in np.linspace(a, b, max(2, int(abs(b - a) / 0.25) + 1)):
                if all(t < d0 - 0.1 or t > d1 + 0.1 for d0, d1 in doors):
                    x, y = F.xy(t, G)
                    self.posts.append([round(float(x), 2), round(float(y), 2)])
        # the leaves, open: each slid outward behind its neighbouring lite, 0.09 m inside it, in a stainless frame
        for d in DOORS:
            s = 1 if d > 0 else -1
            a, b = sorted((d + s * (hw + 0.02), d + s * (hw + DOOR_W + 0.02)))
            vv = G + 0.1
            for za, zb in ((z0 + 0.012, z0 + 0.1), (z0 + TRANSOM - 0.09, z0 + TRANSOM - 0.01)):
                self.box("metal_frame", a, b, vv - 0.02, vv + 0.02, za, zb)
            for e in (a, b):
                self.box("metal_frame", e - 0.025, e + 0.025, vv - 0.02, vv + 0.02, z0 + 0.012, z0 + TRANSOM - 0.01)
            self.pane(a + 0.025, b - 0.025, vv, z0 + 0.1, z0 + TRANSOM - 0.09)
            # its operator over the doorway, inside the transom
            self.box("metal_frame", min(a, d - hw) - 0.05, max(b, d + hw) + 0.05, G + 0.07, G + 0.22, z0 + TRANSOM, z0 + TRANSOM + 0.18)

    def pane(self, u0, u1, v, z0, z1):
        if u1 - u0 < 0.05 or z1 - z0 < 0.05:
            return
        self.q("glass_front", (u0, v, z0), (u1, v, z0), (u1, v, z1), (u0, v, z1))

    def walls(self):
        """The hall's sides and back: black lacquered panels 1.2 m wide, floor to ceiling, an 8 mm reveal between each;
        along each side's foot a line of light in a slot."""
        F, G, z0, z1, h = self.F, self.G, self.F.floor, self.F.ceil, self.F.half
        for s in (-1, 1):
            u = s * h
            a, b = (G, BACK_V) if s < 0 else (BACK_V, G)
            self.q("room_reveal", (u, a, z0), (u, b, z0), (u, b, z1), (u, a, z1))
            for va, vb in self.courses(G + 0.06, BACK_V, PANEL):
                pa, pb = (va + 0.004, vb - 0.004) if s < 0 else (vb - 0.004, va + 0.004)
                uu = u - s * 0.012
                self.q("room_panel", (uu, pa, z0 + 0.1), (uu, pb, z0 + 0.1), (uu, pb, z1), (uu, pa, z1))
            uu = u - s * 0.006
            a, b = (G + 0.3, BACK_V - 0.25) if s < 0 else (BACK_V - 0.25, G + 0.3)
            self.q("glow_line", (uu, a, z0 + 0.03), (uu, b, z0 + 0.03), (uu, b, z0 + 0.07), (uu, a, z0 + 0.07), emit=(WARM, 4.0))
            self.geo.walls.append((F.P(u, G, z0), F.P(u, BACK_V, z0), z0, z1))
        v = BACK_V
        self.q("room_reveal", (-h, v, z0), (h, v, z0), (h, v, z1), (-h, v, z1))
        for ua, ub in self.courses(-h, h, PANEL):
            self.q("room_panel", (ua + 0.004, v - 0.012, z0), (ub - 0.004, v - 0.012, z0), (ub - 0.004, v - 0.012, z1), (ua + 0.004, v - 0.012, z1))
        self.geo.walls.append((F.P(-h, v, z0), F.P(h, v, z0), z0, z1))

    def ceiling(self):
        """The hall's ceiling, matt black, and five lines of light in it from the glass to the lifts (the 45F LEADING
        LINE's grammar: lines of light in black)."""
        F, G, z, h = self.F, self.G, self.F.ceil, self.F.half
        self.q("room_ceiling", (-h, BACK_V, z), (h, BACK_V, z), (h, G, z), (-h, G, z))
        a, b = G + 0.35, BACK_V - 0.35
        for lu in LINES_U:
            for s in (-1, 1):
                uu = lu + s * 0.04
                p, q = (a, b) if s < 0 else (b, a)
                self.q("room_reveal", (uu, p, z), (uu, q, z), (uu, q, z + 0.06), (uu, p, z + 0.06))
            self.q("glow_line", (lu - 0.03, b, z + 0.055), (lu + 0.03, b, z + 0.055), (lu + 0.03, a, z + 0.055), (lu - 0.03, a, z + 0.055), emit=(WARM, 12.0))

    def lifts(self):
        """The two cars at the back: each a stainless portal standing proud of the wall, the two leaves shut on their
        meeting line; over each its indicator (the arrow and 14F); beside each its call plate; the name over both."""
        F, z0, v, A = self.F, self.F.floor, BACK_V - 0.012, self.A
        for cu in CARS:
            hw = CAR_W / 2
            self.box("room_steel", cu - hw - 0.12, cu - hw, v - 0.1, v, z0, z0 + CAR_H + 0.12)
            self.box("room_steel", cu + hw, cu + hw + 0.12, v - 0.1, v, z0, z0 + CAR_H + 0.12)
            self.box("room_steel", cu - hw - 0.12, cu + hw + 0.12, v - 0.1, v, z0 + CAR_H, z0 + CAR_H + 0.12)
            for s in (-1, 1):
                a, b = sorted((cu + s * 0.003, cu + s * hw))
                self.box("room_steel", a, b, v - 0.04, v, z0 + 0.012, z0 + CAR_H, faces=("-v",))
            self.box("room_steel", cu - hw - 0.12, cu + hw + 0.12, v - 0.16, v, z0 - 0.01, z0 + 0.003, faces=("top",))
            iz = z0 + CAR_H + 0.3
            self.q("glow_sign", (cu - 0.3, v - 0.015, iz), (cu + 0.3, v - 0.015, iz), (cu + 0.3, v - 0.015, iz + 0.225), (cu - 0.3, v - 0.015, iz + 0.225), uv=A.uv("indicator"),
                   emit=((1.0, 0.6, 0.2), 1.5))
            pu = cu + (-1 if cu < 0 else 1) * (hw + 0.35)
            self.box("room_steel", pu - 0.07, pu + 0.07, v - 0.02, v, z0 + 1.0, z0 + 1.3)
            self.q("glow_sign", (pu - 0.05, v - 0.021, z0 + 1.1), (pu + 0.05, v - 0.021, z0 + 1.1), (pu + 0.05, v - 0.021, z0 + 1.2), (pu - 0.05, v - 0.021, z0 + 1.2), uv=A.uv("button"))
        nz = z0 + CAR_H + 0.95
        self.q("glow_sign", (-2.6, v - 0.02, nz), (2.6, v - 0.02, nz), (2.6, v - 0.02, nz + 0.78), (-2.6, v - 0.02, nz + 0.78), uv=A.uv("name_big"), emit=((1.0, 0.95, 0.86), 1.2))

    def queue(self):
        """The queue: two stainless posts 3 m out from the lifts' wall, outside the portals, a black belt from each drawn
        taut to its catch on the wall (a hall's retractable queue belt). The belts are solid (game.json hero[].belts)."""
        F, z0 = self.F, self.F.floor
        vv = BACK_V - 3.0
        for su in BELTS:
            self.geo.lathe("room_steel", F.P(su, vv, z0), [(0.16, 0.0), (0.16, 0.025), (0.03, 0.045), (0.025, 0.86), (0.04, 0.88), (0.04, 0.99), (0.0, 1.0)], segs=20)
            self.box("room_belt", su - 0.005, su + 0.005, vv, BACK_V - 0.05, z0 + 0.87, z0 + 0.92)
            self.box("room_steel", su - 0.03, su + 0.03, BACK_V - 0.05, BACK_V - 0.012, z0 + 0.85, z0 + 0.94)
            for t in np.arange(vv, BACK_V - 0.01, 0.2):
                x, y = F.xy(su, t)
                self.belts.append([round(float(x), 2), round(float(y), 2)])


def build(K):
    """(geo, atlas, materials, meta) for blender/build_hero.py."""
    L = Level(K)
    geo, atlas = L.build()
    F = L.F
    mid = F.xy(0.0, (BACK_V + APRON_V) / 2)
    meta = {"id": ID, "at": [round(float(mid[0]), 2), round(float(mid[1]), 2)], "r": 9.0, "z": round(F.floor, 2), "glb": f"hero/{ID}.glb", "bake_gain": 1.0,
            "floor": True, "lift": 0.012, "posts": L.posts, "belts": L.belts}
    print("game.hero:", json.dumps({k: meta[k] for k in ("at", "r", "z", "floor", "lift")}), f"{len(L.posts)} posts, {len(L.belts)} belt points")
    return geo, atlas, materials(K), meta
