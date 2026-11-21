"""SHIBUYA SKY's street lift hall, a small hero level of its own (blender/build_hero.py --city shibuya --level
skylobby; docs/HERO.md, "SKY's street entrance"; docs/cities/shibuya.md, "The way up, as it is").

Why: the story's fourth frame and the walk send the player from the crossing to the lift at Shibuya Scramble Square
that goes up to SHIBUYA SKY. Until November 2026 its lobby was set dressing in the story's flat, self-lit material
(blender/build_set.py), an open mouth cut 8 m into the tower's north face 17 m west of where the real hall is (issue 53).

The real one (docs/HERO.md, "SKY's street entrance", its sources): the official 1F plan draws the SKY lift as a small
hall of its own, "館外1階", standing just outside the tower's north-east corner, east of its east wall's line and mostly
north of its north face's, entered from the west (the plan's ▷ on its west side). The section drawing has its shaft
of glass outside the tower's east face, 1F to 14F, and the lift schedule has the bank as two scenic cars (展望用,
Elevator Journal 28's E3). So a visitor walks east along the forecourt, goes in through the glass doors on the hall's
west side, queues facing east, toward the outside, and boards a car whose back is glass onto Meiji-dori and Hikarie.
In the photographs: a glass front in stainless frames, its lower lites fritted, two framed doors, a dark soffit with a
line of round downlights; pale square tiles in front; to the doors' north-west a free-standing pillar in light grey
panels with SKY's lit disc and name over a portrait screen; the forecourt's striped planks beyond.

What is built, in the frame of the lift's first stop (game.json lifts "sky-gate": its `door` in the hall's west front,
its `at` before the cars; city.json game.lobbies "sky-gate" "outside" places them):

  * the hall: a floor 6.2 m north to south and 4.2 m west to east, open to the sky and to the west and the north (the
    owner, November 2026, from the street lift as it is: no glass box and no roof over it; the box drawn first from the
    plan and the photographs, a glass front with two doors, a glass north side and a roof carried out as a canopy, was
    an odd place to walk into, and the chase camera came down inside it); a honed granite floor in slabs a step darker
    than the tiles, a step down into it from the forecourt's planks along its north side, the black panelled wall against the tower to
    its south with a line of light at its foot and a stainless coping; the queue's two belts running east, and outside
    a belt along the front where the line forms;
  * the lifts: two cars on the east wall in stainless portals, hairline-brushed leaves, each with its indicator (the
    arrow and 14F: the street lift's top, SKY GATE runs on from 14F to 45F) and call plate, the name over them; behind
    them the glass shaft outside the tower's east face, up to 14F, the cars' lit cabins standing at the street;
  * in front: the tiles, the pillar, and the forecourt's planks out along the tower's north face.

The hall's floor is level while the ground under it rises to the north (meta "floor": its own floor is stood on,
nav.js lift). Solid where it is wall and shaft (game.json hero[].posts), and the belts (hero[].belts); open to the west
and the north.
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

# the hall's measures (metres, in its own frame: v east from its west front, the way in; u south across it, to the
# right going in; z up)
HALL_U = (-3.1, 3.1)     # its north and south walls
HALL_V = 4.2             # its east wall, the lifts'
SHAFT_V = 2.4            # the lifts' glass shaft outside it, up the tower's east face
SHAFT_TOP = 74.0         # to 14F (about 71 m over 1F) and the machine over it
APRON_V = -2.4           # the tiles reach this far out in front
CANOPY_V = -1.6          # the roof carried out over the doors
DOORS = (-0.9, 0.9)      # the two doors' middles across the west front
DOOR_W = 1.2             # a door's clear width
TRANSOM = 2.4            # the doors' head, over the floor
TILE = 0.6               # the tiles in front: 600 mm square, laid square
SLAB = (1.2, 0.6)        # the hall's slabs (across, in), in courses across the way in, every other course half a slab over
JOINT = 0.004
PANEL = 1.2              # the hall's wall panels
CARS = (-1.4, 1.4)       # the two cars' middles across the east wall
CAR_W, CAR_H = 1.1, 2.1  # a car's doorway (the hall is 2.65 m high under the station deck)
BELTS = (-2.3, 2.3)      # the queue's two belts, from a post 2.9 m out to a catch on the east wall
FORECOURT = ((-8.0, 2.5, -14.0, APRON_V), (-8.0, HALL_U[0] - 0.1, APRON_V, HALL_V + SHAFT_V))   # (u0, u1, v0, v1): the planks
PILLAR = (-2.4, -1.9, 1.1, 3.6)    # the sign pillar: u, v of its middle (north-west of the doors), its side, its height
LINES_U = (-2.2, -0.75, 0.75, 2.2)  # the hall's lines of light, running east
WARM = (1.0, 0.93, 0.82)                # 3500 K, the lines' light
DOWN = (1.0, 0.95, 0.88)                # the canopy's downlights, 4000 K
GLOW_SLOT = (0.62, 0.66, 1.0)           # the slots in the forecourt's ceiling, blue-white as the joints' lines


def materials(K):
    granite = lambda srgb: K.tint_to("granite", srgb)
    return {
        # the tiles in front: pale beige, a fine-grained stone's speckle, honed (wet in the rain: ground*)
        "ground_tile": {"tex": "granite", "maps": "cn", "rough": 0.45, "tint": granite((196, 188, 172))},
        "ground_tile_joint": {"color": (0.36, 0.34, 0.31), "rough": 0.9},
        # the forecourt beyond: long planks of honed stone in three close greys laid in stripes (the Urban Core's floor),
        # a line of light in a joint here and there
        "ground_plank": {"tex": "granite", "maps": "cn", "rough": 0.5, "tint": granite((150, 150, 150))},
        "ground_plank_dark": {"tex": "granite", "maps": "cn", "rough": 0.5, "tint": granite((128, 129, 131))},
        "ground_plank_pale": {"tex": "granite", "maps": "cn", "rough": 0.5, "tint": granite((168, 167, 165))},
        "glow_strip": {"color": (0.8, 0.82, 0.95), "emissive": (0.62, 0.66, 1.0), "glow": 1.4},
        # the forecourt's ceiling: facets of mirror-polished stainless steel, two finishes a shade apart (the photograph's
        # slivers, some brighter than others as they catch the street)
        "metal_facet": {"color": (0.5, 0.51, 0.53), "rough": 0.1, "metal": 1.0, "sky": 0.4},
        "metal_facet_b": {"color": (0.36, 0.37, 0.39), "rough": 0.14, "metal": 1.0, "sky": 0.3},
        # the hall's floor: polished granite, charcoal; under it the joints' slab
        # the hall's floor: open to the sky now, a honed granite a step darker than the tiles before it, in their family
        # (it was a polished charcoal for a room under a roof, and under the open sky it read as a black hole in the street)
        "room_floor_stone": {"tex": "granite", "maps": "cn", "rough": 0.32, "tint": granite((152, 147, 138)), "sky": 0.5},
        "room_floor_joint": {"color": (0.3, 0.29, 0.27), "rough": 0.9},
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



# ---------------------------------------------------------------- the frame of the hall

class Frame:
    """The hall's frame from its lift's first stop (game.json): `door` in the middle of its west front, `at` before the
    cars; v runs from the one to the other (east), u to the right of it (south)."""

    def __init__(self):
        from shapely.geometry import Polygon
        G = json.load(open(os.path.join(ROOT, "web", "data", "shibuya", "game.json")))
        s = next(l for l in G["lifts"] if l["id"] == LIFT_ID)["stops"][0]
        self.door, self.at = np.array(s["door"], float), np.array(s["at"][:2], float)
        n = self.at - self.door
        self.n = n / np.linalg.norm(n)
        self.u = np.array([self.n[1], -self.n[0]])
        self.T = HP.Ground("shibuya")
        # the hall's floor: level, at the ground's mean height under it; its ceiling under whatever stands over it (the
        # station deck's underside), at most 3.3 m up
        self.floor = round(float(np.mean([self.ground(u, v) for u in HALL_U for v in (0.0, HALL_V)])) + 0.012, 3)
        B = json.load(open(os.path.join(ROOT, "web", "data", "shibuya", "buildings.json")))
        ring = lambda r: [(r[i] / 10, r[i + 1] / 10) for i in range(0, len(r), 2)]
        hall = Polygon([self.xy(HALL_U[0], CANOPY_V), self.xy(HALL_U[1], CANOPY_V), self.xy(HALL_U[1], HALL_V), self.xy(HALL_U[0], HALL_V)])
        over = [(q[1] + q[2]) / 10 for q in B["s"] if q[2] > 0 and (q[1] + q[2]) / 10 > self.floor + 2.6 and abs(q[4][0] / 10 - self.door[0]) < 200
                and abs(q[4][1] / 10 - self.door[1]) < 200 and Polygon(ring(q[4])).buffer(0).intersects(hall)]
        self.ceil = round(min([self.floor + 3.3] + [z - 0.32 for z in over]), 3)

    def xy(self, u, v):
        return self.door + self.u * u + self.n * v

    def P(self, u, v, z):
        x, y = self.xy(u, v)
        return np.array([x, y, z])

    def ground(self, u, v):
        return self.T(*self.xy(u, v))


class Level:
    def __init__(self, K):
        self.K = K
        K.register("hairline", 0.6, hairline)
        self.geo = K.Geo()
        self.A = K.Atlas(1024, 768)
        self.F = Frame()
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


    def build(self):
        self.atlas()
        self.apron()
        self.forecourt()
        self.floor()
        self.pillar()
        self.edges()
        self.walls()
        self.lifts()
        self.shaft()
        self.queue()
        self.soffit()
        return self.geo, self.A

    def soffit(self):
        """The ceiling over the forecourt, under the overhang of 2F to 4F (cities/shibuya/scrsq_base.py; issue 66; the
        photograph of the entrance at dusk, Wpcpey 2019): long narrow facets of mirror-polished metal laid at a slant to
        the face, each its own length and its own small tilt (the tilt is why each gives back the street in its own
        tone), on a dark backing; between them here and there a slot of blue-white light; the ceiling sloping up from
        the shop fronts to the overhang's edge, and a fascia there up to the overhang's underside."""
        import sys as _sys
        from shapely.geometry import Point as SPoint, Polygon as SPoly, box as sbox
        from shapely.affinity import rotate as srot
        from shapely.ops import triangulate, unary_union
        _sys.path.insert(0, HERE)
        import scrsq_base as SB
        B = json.load(open(os.path.join(ROOT, "web", "data", "shibuya", "buildings.json")))
        Fa = SB.Face(B)
        key = (round(SB.OVER["z0"] * 10), round(SB.OVER["z1"] * 10))
        ov = unary_union([SPoly(SB.ring_of(s)).buffer(0) for s in B["s"] if s[0] == Fa.bi and (s[2], s[3]) == key])
        if ov.is_empty:
            return
        top = Fa.base + SB.OVER["z0"]          # the overhang's underside
        z_in, z_out = Fa.base + 5.6, top - 0.35   # the ceiling at the shop fronts, and at the edge
        out = SB.OVER["out"]
        def zc(x, y):
            return z_in + (z_out - z_in) * min(max(Fa.sn(x, y)[1] / out, 0.0), 1.0)
        geo = self.geo
        under = ov.difference(Fa.ring.buffer(0.02))   # (what is over the forecourt, not over the tower's own floor)
        def fill(mat, P, dz, n_down=True):
            for g in getattr(P, "geoms", [P]):
                if g.geom_type != "Polygon" or g.area < 0.01:
                    continue
                for tr in triangulate(g):
                    if not g.buffer(1e-6).contains(tr.representative_point()):
                        continue
                    pts = [np.array([x, y, zc(x, y) + dz]) for x, y in list(tr.exterior.coords)[:3]]
                    if np.cross(pts[1] - pts[0], pts[2] - pts[0])[2] > 0:   # (wound to face down)
                        pts = [pts[0], pts[2], pts[1]]
                    geo.mesh(mat, pts, [(0, 1, 2)], n=np.array([0, 0, -1.0]))
        # the backing, a hand's depth over the facets
        fill("metal_soffit", under, 0.06)
        # the facets: in courses 0.34 m wide at 32 degrees to the face, each 1.6 to 4.8 m long, 25 mm apart
        ang = math.degrees(math.atan2(Fa.u[1], Fa.u[0])) + 32.0
        c = under.centroid
        flat = srot(under, -ang, origin=c, use_radians=False)
        x0, y0, x1, y1 = flat.bounds
        rng = np.random.default_rng(2019)
        ca, sa = math.cos(math.radians(-ang)), math.sin(math.radians(-ang))
        w, gap = 0.34, 0.025
        y = y0
        row = 0
        while y < y1:
            x = x0 - rng.random() * 3.0
            while x < x1:
                L = 1.6 + rng.random() * 3.2
                strip = sbox(x + gap / 2, y + gap / 2, x + L - gap / 2, y + w - gap / 2)
                piece = srot(strip, ang, origin=c, use_radians=False).intersection(under.buffer(-0.05))
                if not piece.is_empty and piece.area > 0.05:
                    tilt = rng.normal(0, 0.035)            # (each facet tipped about its long axis: a few degrees)
                    mats = ("metal_facet", "metal_facet_b")
                    for g in getattr(piece, "geoms", [piece]):
                        if g.geom_type != "Polygon":
                            continue
                        for tr in triangulate(g):
                            if not g.buffer(1e-6).contains(tr.representative_point()):
                                continue
                            pts = []
                            for px, py in list(tr.exterior.coords)[:3]:
                                qy = c.y + (px - c.x) * sa + (py - c.y) * ca   # (the point in the courses' frame)
                                across = (qy - (y + w / 2)) / w
                                pts.append(np.array([px, py, zc(px, py) - 0.02 + tilt * across]))
                            if np.cross(pts[1] - pts[0], pts[2] - pts[0])[2] > 0:
                                pts = [pts[0], pts[2], pts[1]]
                            nn = np.cross(pts[1] - pts[0], pts[2] - pts[0])
                            nn = nn / (np.linalg.norm(nn) or 1.0)
                            geo.mesh(mats[row % 2 if rng.random() < 0.7 else 1 - row % 2], pts, [(0, 1, 2)], n=nn)
                # a slot of light along the facet after one in seven: 60 mm of blue-white under the joint, as photographed
                if rng.random() < 1 / 7:
                    sl = sbox(x + 0.3, y + w - 0.03, x + L - 0.3, y + w + 0.03)
                    sp = srot(sl, ang, origin=c, use_radians=False).intersection(under.buffer(-0.1))
                    if not sp.is_empty and sp.area > 0.01:
                        fill("glow_strip", sp, -0.045)
                        cc = sp.centroid
                        geo.emitters.append((np.array([cc.x, cc.y, zc(cc.x, cc.y) - 0.05]), np.array([0, 0, -1.0]), sp.area * 4, np.array(GLOW_SLOT) * 1.2))
                x += L
            y += w
            row += 1
        # the fascia at the overhang's edge: from the ceiling up to the overhang's underside, its face outward
        ring = np.asarray(under.exterior.coords) if under.geom_type == "Polygon" else np.asarray(max(under.geoms, key=lambda g: g.area).exterior.coords)
        if not SPoly(ring).exterior.is_ccw:
            ring = ring[::-1]
        for a, b in zip(ring[:-1], ring[1:]):
            mid = (a + b) / 2
            if Fa.ring.buffer(0.3).contains(SPoint(*mid)) or np.linalg.norm(b - a) < 0.05:   # (its side against the tower)
                continue
            za, zb = zc(*a), zc(*b)
            geo.quad("metal_soffit", np.r_[a, za - 0.03], np.r_[b, zb - 0.03], np.r_[b, top + 0.02], np.r_[a, top + 0.02])

    def post_line(self, u0, v0, u1, v1, skip=()):
        """posts every 0.25 m along a wall, but in a doorway (skip: (u0, u1) ranges along the west front)"""
        F, n = self.F, max(2, int(math.hypot(u1 - u0, v1 - v0) / 0.25) + 1)
        for t in np.linspace(0, 1, n):
            u, v = u0 + (u1 - u0) * t, v0 + (v1 - v0) * t
            if any(a - 0.12 < u < b + 0.12 for a, b in skip):
                continue
            x, y = F.xy(u, v)
            self.posts.append([round(float(x), 2), round(float(y), 2)])

    def ztile(self, u, v):
        """the tiles' and planks' height: on the street (over the Miyamasu level's paving, 5 cm over the ground), coming
        to the hall's floor over the last 1.2 m before its doors"""
        F = self.F
        out = F.ground(u, v) + 0.075
        if v < -1.2 or not (HALL_U[0] <= u <= HALL_U[1]):
            return out
        k = min(1.0, (v + 1.2) / 1.2)
        return out * (1 - k) + F.floor * k

    def apron(self):
        """The tiles before the doors: 600 mm square, pale, laid square, their joints a slab of grout under them."""
        F, rep = self.F, self.K.TEXTURES["granite"][1]
        rng = np.random.default_rng(7)
        j, u1 = 0.0025, 2.5
        for v0, v1 in self.courses(APRON_V, 0.0, TILE):
            for ua, ub in self.courses(HALL_U[0], u1, TILE):
                pts = [(ua + j, v0 + j), (ub - j, v0 + j), (ub - j, v1 - j), (ua + j, v1 - j)]
                ou, ov = rng.random(2) * 3
                self.q("ground_tile", *[(a, b, self.ztile(a, b)) for a, b in pts], uv=[(ou + a / rep, ov + b / rep) for a, b in pts])
        pts = [(HALL_U[0], APRON_V), (u1, APRON_V), (u1, 0.0), (HALL_U[0], 0.0)]
        self.q("ground_tile_joint", *[(a, b, self.ztile(a, b) - 0.004) for a, b in pts], sub=(8, 4))

    def forecourt(self):
        """The forecourt's planks out along the tower's north face and round the hall's north side: 0.3 m wide, 1.2 to 3 m
        long, in courses running east to west, each one of three close greys of the honed stone (the photograph's five
        tones from white to charcoal kept close, so that it reads as a laid floor), each its own part of the stone; in one
        joint in seven a line of light."""
        F, rep = self.F, self.K.TEXTURES["granite"][1]
        rng = np.random.default_rng(1101)
        mats = ("ground_plank", "ground_plank_dark", "ground_plank_pale")
        j = 0.003
        for u0, u1, v0, v1 in FORECOURT:
            for k, (ua, ub) in enumerate(self.courses(u0, u1, 0.3)):
                v = v0 - rng.random() * 2.0
                while v < v1 - 1e-6:
                    vb, va = min(v1, v + 1.2 + rng.random() * 1.8), max(v0, v)
                    if vb - va > 0.1:
                        m = mats[int(rng.choice(3, p=(0.5, 0.25, 0.25)))]
                        pts = [(ua + j, va + j), (ub - j, va + j), (ub - j, vb - j), (ua + j, vb - j)]
                        ou, ov = rng.random(2) * 3
                        self.q(m, *[(a, b, self.ztile(a, b)) for a, b in pts], uv=[(ou + a / rep, ov + b / rep) for a, b in pts])
                    v = vb
                if k % 7 == 3:
                    self.q("glow_strip", (ua - 0.006, v0 + 0.6, self.ztile(ua, v0) + 0.002), (ua + 0.006, v0 + 0.6, self.ztile(ua, v0) + 0.002),
                           (ua + 0.006, v1 - 0.6, self.ztile(ua, v1) + 0.002), (ua - 0.006, v1 - 0.6, self.ztile(ua, v1) + 0.002), sub=(1, 10))
            pts = [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]
            self.q("ground_tile_joint", *[(a, b, self.ztile(a, b) - 0.004) for a, b in pts], sub=(6, 12))

    def floor(self):
        """The hall's floor: honed granite slabs 1.2 m by 0.6 m in courses across the way in, every other course half a
        slab over, joints 4 mm, each slab its own part of the stone; a stainless strip along its west edge."""
        F, rep, z = self.F, self.K.TEXTURES["granite"][1], self.F.floor
        rng = np.random.default_rng(53)
        sw, sd = SLAB
        u0, u1, v0 = HALL_U[0] + 0.02, HALL_U[1] - 0.02, 0.08
        self.q("room_floor_joint", (u0, v0, z - 0.003), (u1, v0, z - 0.003), (u1, HALL_V, z - 0.003), (u0, HALL_V, z - 0.003))
        for row, (va, vb) in enumerate(self.courses(v0, HALL_V, sd)):
            for ua, ub in self.courses(u0, u1, sw, off=sw / 2 if row % 2 else 0.0):
                ou, ov = rng.random(2) * 4
                pts = [(ua + JOINT / 2, va + JOINT / 2), (ub - JOINT / 2, va + JOINT / 2), (ub - JOINT / 2, vb - JOINT / 2), (ua + JOINT / 2, vb - JOINT / 2)]
                self.q("room_floor_stone", *[(a, b, z) for a, b in pts], uv=[(ou + a / rep, ov + b / rep) for a, b in pts], sub=(2, 1))
        self.box("room_steel", HALL_U[0] + 0.02, HALL_U[1] - 0.02, -0.04, 0.08, z - 0.01, z + 0.002, faces=("top",))

    def pillar(self):
        """The sign pillar, free-standing north-west of the doors: light grey panels with a reveal between them; on its
        face to the west (-v) and its side to the north (-u) the lit disc over the name, and on its face the screen."""
        F, A = self.F, self.A
        pu, pv, side, ht = PILLAR
        s2 = side / 2
        z0 = min(F.ground(pu + a, pv + b) for a in (-s2, s2) for b in (-s2, s2)) - 0.1
        top = self.ztile(pu, pv) + ht
        self.box("wall_pillar", pu - s2, pu + s2, pv - s2, pv + s2, z0, top)
        for zz in np.arange(self.ztile(pu, pv) + 0.9, top - 0.1, 0.9):
            self.box("room_reveal", pu - s2 - 0.003, pu + s2 + 0.003, pv - s2 - 0.003, pv + s2 + 0.003, zz - 0.005, zz + 0.005)
        dz, nz = top - 0.62, top - 1.18
        (c0, d0), (c1, _), (_, d1), _ = A.uv("disc")
        ring = lambda t: ((c0 + c1) / 2 + (c1 - c0) / 2 * math.cos(t), (d0 + d1) / 2 + (d1 - d0) / 2 * math.sin(t))
        ts = np.linspace(0, 2 * math.pi, 40, endpoint=False)
        # the west face (-v): seen from there, +u (south) is to the right
        wv = pv - s2 - 0.006
        P = [F.P(pu, wv, dz)] + [F.P(pu + 0.36 * math.cos(t), wv, dz + 0.36 * math.sin(t)) for t in ts]
        self.geo.mesh("glow_sign", P, [(0, 1 + k, 1 + (k + 1) % 40) for k in range(40)], n=-np.r_[F.n, 0.0], uv=[((c0 + c1) / 2, (d0 + d1) / 2)] + [ring(t) for t in ts])
        self.geo.emitters.append((P[0] - np.r_[F.n, 0.0] * 0.05, -np.r_[F.n, 0.0], math.pi * 0.13, np.array([0.95, 0.97, 1.0]) * 2.5))
        self.q("wall_pillar_sign", (pu - 0.5, wv + 0.002, nz), (pu + 0.5, wv + 0.002, nz), (pu + 0.5, wv + 0.002, nz + 0.19), (pu - 0.5, wv + 0.002, nz + 0.19), uv=A.uv("name_pillar"))
        # the north side (-u): seen from there, -v (west) is to the right
        nu = pu - s2 - 0.006
        P = [F.P(nu, pv, dz)] + [F.P(nu, pv - 0.36 * math.cos(t), dz + 0.36 * math.sin(t)) for t in ts]
        self.geo.mesh("glow_sign", P, [(0, 1 + k, 1 + (k + 1) % 40) for k in range(40)], n=-np.r_[F.u, 0.0], uv=[((c0 + c1) / 2, (d0 + d1) / 2)] + [ring(t) for t in ts])
        self.q("wall_pillar_sign", (nu + 0.002, pv + 0.5, nz), (nu + 0.002, pv - 0.5, nz), (nu + 0.002, pv - 0.5, nz + 0.19), (nu + 0.002, pv + 0.5, nz + 0.19), uv=A.uv("name_pillar"))
        # the screen, sunk in a frame on the west face
        sz = self.ztile(pu, pv) + 0.55
        self.box("metal_frame", pu - 0.42, pu + 0.42, wv - 0.03, wv + 0.006, sz - 0.04, sz + 1.38, faces=("-v", "+u", "-u", "top", "bot"))
        self.q("glow_sign", (pu - 0.37, wv - 0.031, sz), (pu + 0.37, wv - 0.031, sz), (pu + 0.37, wv - 0.031, sz + 1.3), (pu - 0.37, wv - 0.031, sz + 1.3), uv=A.uv("screen"),
               emit=((0.55, 0.5, 0.6), 1.2))
        for a in (-1, 1):
            for b in (-1, 1):
                x, y = F.xy(pu + a * (s2 - 0.14), pv + b * (s2 - 0.14))
                self.posts.append([round(float(x), 2), round(float(y), 2)])

    def edges(self):
        """The hall is open: no roof, no canopy and no glass to the west or the north, as the owner remembers the real
        one at the street (November 2026: "the real ground-floor lifts have none of this glass"; the box under its roof was
        an odd thing to walk into, and the chase camera came down inside it). Its floor is level where the ground slopes:
        to the north the forecourt's planks stand 0.2 to 0.4 m over it, a step down in the hall's stone with a stainless
        nosing; to the west the tiles come down to it before the lifts, and where the ground falls away at the south end a
        stainless kick plate closes the floor's edge."""
        F, z0 = self.F, self.F.floor
        u = HALL_U[0] + 0.02
        for va, vb in self.courses(APRON_V, HALL_V, 0.6):
            ta, tb = self.ztile(u - 0.12, va), self.ztile(u - 0.12, vb)
            if va < 0.0:   # (west of the hall: the planks meet the tiles, no step)
                continue
            self.q("room_floor_stone", (u, va, z0), (u, vb, z0), (u, vb, tb), (u, va, ta))
            self.q("metal_frame", (u - 0.12, va, ta + 0.004), (u, va, ta + 0.004), (u, vb, tb + 0.004), (u - 0.12, vb, tb + 0.004))
        lo = min(F.ground(uu, -0.1) for uu in np.linspace(HALL_U[0], HALL_U[1], 9)) - 0.15
        self.box("metal_frame", HALL_U[0] + 0.02, HALL_U[1], -0.05, -0.04, min(lo, z0 - 0.3), z0 + 0.002, faces=("-v",))

    def walls(self):
        """The south wall (against the tower) and the east wall round the cars: black lacquered panels 1.2 m wide, an
        8 mm reveal between them; a line of light at the south wall's foot. Outside, the south wall is dark metal."""
        F, z0, z1 = self.F, self.F.floor, self.F.ceil
        u = HALL_U[1]
        self.q("room_reveal", (u, HALL_V, z0), (u, 0.06, z0), (u, 0.06, z1), (u, HALL_V, z1))
        for va, vb in self.courses(0.06, HALL_V, PANEL):
            self.q("room_panel", (u - 0.012, vb - 0.004, z0 + 0.1), (u - 0.012, va + 0.004, z0 + 0.1), (u - 0.012, va + 0.004, z1), (u - 0.012, vb - 0.004, z1))
        self.q("glow_line", (u - 0.006, HALL_V - 0.25, z0 + 0.03), (u - 0.006, 0.3, z0 + 0.03), (u - 0.006, 0.3, z0 + 0.07), (u - 0.006, HALL_V - 0.25, z0 + 0.07), emit=(WARM, 4.0))
        self.box("metal_soffit", u, u + 0.1, 0.0, HALL_V, z0 - 0.4, z1, faces=("+u",))
        self.post_line(u, 0.0, u, HALL_V)
        v = HALL_V
        self.q("room_reveal", (HALL_U[0], v, z0), (HALL_U[1], v, z0), (HALL_U[1], v, z1), (HALL_U[0], v, z1))
        for ua, ub in self.courses(HALL_U[0], HALL_U[1], PANEL):
            self.q("room_panel", (ua + 0.004, v - 0.012, z0), (ub - 0.004, v - 0.012, z0), (ub - 0.004, v - 0.012, z1), (ua + 0.004, v - 0.012, z1))
        self.post_line(HALL_U[0], v, HALL_U[1], v)
        # (open to the sky: the south wall's top and its west end capped in stainless; over the cars' wall a stainless
        # lintel, and over that the shaft's glass on to its top, so that nobody looks down into the shaft from the street;
        # a stainless post at each corner where the hall meets the shaft)
        su = HALL_U[1]
        self.box("metal_frame", su - 0.03, su + 0.1, -0.05, HALL_V, z1, z1 + 0.05)
        self.box("metal_frame", su - 0.03, su + 0.1, -0.05, 0.0, z0 - 0.3, z1, faces=("-v", "+u", "-u"))
        self.box("metal_frame", HALL_U[0], HALL_U[1], v - 0.06, v + 0.06, z1, z1 + 0.14)
        top = z0 + SHAFT_TOP
        self.q("glass_front", (HALL_U[1], v, z1 + 0.14), (HALL_U[0], v, z1 + 0.14), (HALL_U[0], v, top), (HALL_U[1], v, top), sub=(1, 6))
        for cu in HALL_U:
            self.box("metal_frame", cu - 0.05, cu + 0.05, v - 0.05, v + 0.05, z0 - 0.3, top)
        self.geo.walls.append((F.P(HALL_U[1], 0.0, z0), F.P(HALL_U[1], HALL_V, z0), z0, z1))
        self.geo.walls.append((F.P(HALL_U[0], HALL_V, z0), F.P(HALL_U[1], HALL_V, z0), z0, z1))

    def lifts(self):
        """The two cars on the east wall: stainless portals proud of it, the leaves shut on their meeting line; over each
        its indicator (the arrow and 14F); beside each its call plate; the name over both."""
        F, z0, v, A = self.F, self.F.floor, HALL_V - 0.012, self.A
        for cu in CARS:
            hw = CAR_W / 2
            self.box("room_steel", cu - hw - 0.12, cu - hw, v - 0.1, v, z0, z0 + CAR_H + 0.12)
            self.box("room_steel", cu + hw, cu + hw + 0.12, v - 0.1, v, z0, z0 + CAR_H + 0.12)
            self.box("room_steel", cu - hw - 0.12, cu + hw + 0.12, v - 0.1, v, z0 + CAR_H, z0 + CAR_H + 0.12)
            for s in (-1, 1):
                a, b = sorted((cu + s * 0.003, cu + s * hw))
                self.box("room_steel", a, b, v - 0.04, v, z0 + 0.012, z0 + CAR_H, faces=("-v",))
            self.box("room_steel", cu - hw - 0.12, cu + hw + 0.12, v - 0.16, v, z0 - 0.01, z0 + 0.003, faces=("top",))
            iz = z0 + CAR_H + 0.2
            self.q("glow_sign", (cu - 0.3, v - 0.015, iz), (cu + 0.3, v - 0.015, iz), (cu + 0.3, v - 0.015, iz + 0.225), (cu - 0.3, v - 0.015, iz + 0.225), uv=A.uv("indicator"),
                   emit=((1.0, 0.6, 0.2), 1.5))
            pu = cu + (-1 if cu < 0 else 1) * (hw + 0.3)
            self.box("room_steel", pu - 0.07, pu + 0.07, v - 0.02, v, z0 + 1.0, z0 + 1.3)
            self.q("glow_sign", (pu - 0.05, v - 0.021, z0 + 1.1), (pu + 0.05, v - 0.021, z0 + 1.1), (pu + 0.05, v - 0.021, z0 + 1.2), (pu - 0.05, v - 0.021, z0 + 1.2), uv=A.uv("button"))
        # (the hall is low under the station deck: the name between the cars, at the eye's height)
        nz = z0 + 1.62
        self.q("glow_sign", (-0.66, v - 0.02, nz), (0.66, v - 0.02, nz), (0.66, v - 0.02, nz + 0.198), (-0.66, v - 0.02, nz + 0.198), uv=A.uv("name_big"), emit=((1.0, 0.95, 0.86), 0.6))

    def shaft(self):
        """The lifts' shaft outside the hall, up the tower's east face to 14F: glass in stainless frames, a transom at each
        shop floor; at its foot the two cars standing at the street, their cabins lit, seen through it."""
        F, z0 = self.F, self.F.floor
        v0, v1, top = HALL_V, HALL_V + SHAFT_V, z0 + SHAFT_TOP
        u0, u1 = HALL_U[0], HALL_U[1]
        faces = [((u1, v1), (u0, v1)), ((u0, v1), (u0, v0)), ((u1, v0), (u1, v1))]   # east, north, south: anticlockwise from outside
        for (ua, va), (ub, vb) in faces:
            self.q("glass_front", (ua, va, z0 - 0.3), (ub, vb, z0 - 0.3), (ub, vb, top), (ua, va, top), sub=(1, 6))
        for z in list(np.arange(z0 + 3.4, top, 5.4)) + [top]:
            self.box("metal_frame", u0 - 0.05, u1 + 0.05, v1 - 0.05, v1 + 0.05, z - 0.08, z + 0.08)
            self.box("metal_frame", u0 - 0.05, u0 + 0.05, v0, v1, z - 0.08, z + 0.08)
            self.box("metal_frame", u1 - 0.05, u1 + 0.05, v0, v1, z - 0.08, z + 0.08)
        for u in (u0, 0.0, u1):
            self.box("metal_frame", u - 0.04, u + 0.04, v1 - 0.04, v1 + 0.04, z0 - 0.3, top)
        for u in (u0, u1):
            self.box("metal_frame", u - 0.04, u + 0.04, v0 + SHAFT_V / 2 - 0.04, v0 + SHAFT_V / 2 + 0.04, z0 - 0.3, top)
        self.box("metal_soffit", u0 - 0.06, u1 + 0.06, v0, v1 + 0.06, top, top + 1.2, faces=("top", "+v", "+u", "-u"))
        # the cars at the street: a dark cabin each, its ceiling lit, its back glass
        for cu in CARS:
            self.box("room_panel", cu - 0.95, cu + 0.95, v0 + 0.15, v1 - 0.25, z0, z0 + 0.012, faces=("top",))
            self.box("room_panel", cu - 0.95, cu + 0.95, v0 + 0.15, v1 - 0.25, z0 + 2.6, z0 + 2.75)
            self.q("glow_line", (cu - 0.8, v1 - 0.4, z0 + 2.598), (cu + 0.8, v1 - 0.4, z0 + 2.598), (cu + 0.8, v0 + 0.3, z0 + 2.598), (cu - 0.8, v0 + 0.3, z0 + 2.598), emit=(WARM, 3.0))
            for s in (-1, 1):
                self.box("room_panel", cu + s * 0.95 - 0.02, cu + s * 0.95 + 0.02, v0 + 0.15, v1 - 0.25, z0, z0 + 2.6)
        self.post_line(u0, v1, u1, v1)
        self.post_line(u0, v0, u0, v1)
        self.post_line(u1, v0, u1, v1)

    def queue(self):
        """The queue: two stainless posts 2.9 m out from the cars' wall, a black belt from each drawn taut east to its
        catch on the wall, the queue facing the cars between them. Solid (game.json hero[].belts)."""
        F, z0 = self.F, self.F.floor
        vv = HALL_V - 2.9
        for su in BELTS:
            self.geo.lathe("room_steel", F.P(su, vv, z0), [(0.16, 0.0), (0.16, 0.025), (0.03, 0.045), (0.025, 0.86), (0.04, 0.88), (0.04, 0.99), (0.0, 1.0)], segs=20)
            self.box("room_belt", su - 0.005, su + 0.005, vv, HALL_V - 0.05, z0 + 0.87, z0 + 0.92)
            self.box("room_steel", su - 0.03, su + 0.03, HALL_V - 0.05, HALL_V - 0.012, z0 + 0.85, z0 + 0.94)
            for t in np.arange(vv, HALL_V - 0.01, 0.2):
                x, y = F.xy(su, t)
                self.belts.append([round(float(x), 2), round(float(y), 2)])
        # and outside, where the line forms (the owner's memory and the photographs of 2019-20): a belt along the west
        # front 1.5 m out, from beside the pillar to a post south of the doors, the line between it and the glass, come
        # into from the south. Solid (its points are posts)
        u0, u1, vb = PILLAR[0] + PILLAR[2] / 2 + 0.25, 2.4, -1.5
        for su in (u0, u1):
            self.geo.lathe("room_steel", F.P(su, vb, self.ztile(su, vb)), [(0.16, 0.0), (0.16, 0.025), (0.03, 0.045), (0.025, 0.86), (0.04, 0.88), (0.04, 0.99), (0.0, 1.0)], segs=20)
        za, zb = self.ztile(u0, vb), self.ztile(u1, vb)
        self.q("room_belt", (u0, vb, za + 0.87), (u1, vb, zb + 0.87), (u1, vb, zb + 0.92), (u0, vb, za + 0.92))
        self.q("room_belt", (u1, vb, zb + 0.87), (u0, vb, za + 0.87), (u0, vb, za + 0.92), (u1, vb, zb + 0.92))
        self.post_line(u0, vb, u1, vb)


def build(K):
    """(geo, atlas, materials, meta) for blender/build_hero.py."""
    L = Level(K)
    geo, atlas = L.build()
    F = L.F
    mid = F.xy(-2.5, (HALL_V + SHAFT_V + APRON_V - 6.0) / 2)
    meta = {"id": ID, "at": [round(float(mid[0]), 2), round(float(mid[1]), 2)], "r": 16.0, "z": round(F.floor, 2), "glb": f"hero/{ID}.glb", "bake_gain": 1.0,
            "floor": True, "lift": 0.012, "posts": L.posts, "belts": L.belts}
    print("game.hero:", json.dumps({k: meta[k] for k in ("at", "r", "z", "floor", "lift")}), f"{len(L.posts)} posts, {len(L.belts)} belt points",
          f"floor {F.floor}, ceiling {F.ceil}")
    return geo, atlas, materials(K), meta
