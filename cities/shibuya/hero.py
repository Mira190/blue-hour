"""The Scramble, the Shibuya map's hero level (blender/build_hero.py --city shibuya; docs/HERO.md).

Why here: the game opens on Hachiko Square at the Scramble's south-east corner, looking across the
diagonal to QFRONT. The hundred metres round that spot are the most photographed junction there is, and
almost all of what a player sees of it from eye level is ground: the square's blocks in the foreground,
then the asphalt with its worn bars, then the kerbs and what stands on them.

What is built, over the city's own ground and landmarks (cities/shibuya/scramble.py keeps the fronts,
the entrances, the tracks and Hachiko himself):

  * the carriageways as one asphalt surface on the game's road bands, with the concrete gutter Japanese
    streets have along each kerb, flush granite kerbs, manholes and gully grates; clean and of one tone
    (AGENTS.md, "The bar": the ground is never aged);
  * the paint, in a thermoplastic of its own: the five crosswalks at their measured places
    (scramble.CROSSWALKS, off GSI's aerial photo), stop lines, the diamonds before them, centre lines;
  * the pavements in grey blocks and Hachiko Square in red-brown concrete blocks, the yellow tactile blocks along
    the lines OpenStreetMap maps, with their bars and domes in relief;
  * on the kerbs: the white guard pipes between the crosswalks, tall steel lamp posts whose light is
    baked into everything here, tree grates round the trees that stand in the paving.

Nothing is built under a building, in a stair well or beyond 100 m of the junction: from the spawn and
from each corner of the crossing the fronts close the view before that.
"""
import importlib.util
import json
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(ROOT, "pipeline"))
sys.path.insert(0, os.path.join(ROOT, "blender"))

sys.path.insert(0, HERE)
import scramble_tex as hero_tex  # noqa: E402
sys.path.remove(HERE)
import hero_open as HP  # noqa: E402
import hero_parts as PT  # noqa: E402
from hero_open import unit  # noqa: E402

ID = "scramble"
CENTRE = (368.0, -1002.0)
R = 100.0
UP = np.array([0.0, 0.0, 1.0])
LIFT = 0.04                       # the asphalt over the game's ground (docs/HERO.md: paving 4 cm over it)
PAINT = LIFT + 0.012
GUTTER_M = 0.5                    # the concrete gutter along a kerb (街渠: 50 cm is the common section)
KERB_M = 0.18
PLAZA = (369.0, -1080.0, 416.0, -1009.5)   # Hachiko Square: west, south, east, north (red-brown blocks; the rest is grey)

TEX = {
    "road": ("OEAsphalt031d", 3.2),     # Asphalt031 with its stones' contrast raised (drawn here: a worn carriageway shows its aggregate)
    "paver": ("PavingStones136", 2.0),  # grey interlocking blocks: the pavements
    "tile": ("Tiles036", 0.9),          # small square facing tiles, the skin of Japan's mixed-use buildings
    "dark": ("Tiles138", 1.6),          # dark stone at a shop front's foot
    "conc": ("Concrete034", 3.0),       # gutters
    "granite": ("Granite005A", 1.5),    # kerbs
    "paint": ("OEPaint002", 2.4),       # thermoplastic road paint (drawn here)
    "tact_bar": ("OETactileBar", 0.3),  # a 30 cm guide block: four bars (drawn here, JIS T 9251's pattern)
    "tact_dot": ("OETactileDot", 0.3),  # a 30 cm warning block: five by five domes
}


def materials():
    return {
        "ground_asphalt": {"tex": "road", "tint": (0.5, 0.5, 0.5), "bump": 1.8},
        "ground_gutter": {"tex": "conc", "tint": (0.62, 0.61, 0.59), "maps": "cn"},
        "ground_kerb": {"tex": "granite", "tint": (0.7, 0.69, 0.68), "maps": "cn"},
        "ground_paint": {"tex": "paint", "tint": (0.92, 0.92, 0.9)},
        "ground_paver": {"tex": "paver", "tint": (0.7, 0.7, 0.7)},
        "ground_sett": {"tex": "plaza"},                 # Hachiko Square's blocks, drawn in their own colour (scramble_tex.plaza)
        "ground_tact_bar": {"tex": "tact_bar", "maps": "cn", "rough": 0.7},
        "ground_tact_dot": {"tex": "tact_dot", "maps": "cn", "rough": 0.7},
        "ground_iron": {"map": "atlas", "rough": 0.5, "metal": 0.7},
        "metal_guard": {"color": (0.78, 0.78, 0.76), "rough": 0.42, "metal": 0.3},
        "metal_pole": {"color": (0.5, 0.51, 0.52), "rough": 0.38, "metal": 0.85},
        "metal_dark": {"color": (0.03, 0.032, 0.035), "rough": 0.5, "metal": 0.7},
        "lamp_head": {"color": (0.95, 0.97, 1.0), "emissive": (1.0, 0.93, 0.82), "glow": 2.4},
        # the fronts: facing in three close tones, dark stone at the foot, aluminium frames
        "wall_white": {"tex": "tile", "maps": "cn", "rough": 0.42},
        "wall_cream": {"tex": "tile", "maps": "cn", "rough": 0.45},
        "wall_grey": {"tex": "clad", "maps": "cn", "rough": 0.55},                     # grey precast panels (the scanned concrete it had was mottled: blotches on a wall)
        "wall_clad": {"tex": "clad", "maps": "cn", "rough": 0.42, "metal": 0.35},      # pale metal cladding panels
        "wall_char": {"tex": "clad", "maps": "cn", "rough": 0.46, "metal": 0.3},       # the same in charcoal: a front that is a ground for its signs
        "wall_foot": {"tex": "dark", "tint": (0.5, 0.5, 0.52), "maps": "cn", "rough": 0.3},
        "metal_alu": {"color": (0.56, 0.57, 0.58), "rough": 0.36, "metal": 0.9},
        # glass: dark and mirror-smooth, so that by day it shows the sky (the game's environment) and after dark
        # the rooms drawn behind it, which are its light alone
        # (an upper window by day is what it mirrors: a pane of the sky in a grey-blue, not a black hole in the wall)
        "win_glass": {"map": "atlas", "color": (0.2, 0.235, 0.275), "rough": 0.05, "metal": 0.9, "sky": 0.75, "emissive": True, "emissive_only": True, "glow": 0.9},
        "glow_shop": {"map": "atlas", "color": (0.03, 0.035, 0.04), "rough": 0.08, "metal": 0.0, "sky": 0.15, "emissive": True, "emissive_only": True, "glow": 1.0},
    }


# ---------------------------------------------------------------- textures drawn here

def _noise(n, cells, rng):
    """Smooth tiling noise in 0..1: a grid of `cells` random values, interpolated (cubic) and wrapped."""
    from scipy import ndimage
    g = rng.random((cells, cells))
    return np.clip(ndimage.zoom(g, n / cells, order=3, mode="grid-wrap"), 0, 1)


def paint_texture(K, tid="OEPaint002", n=512, seed=7):
    """Thermoplastic road paint: off-white, the fine grain of its glass beads in colour and relief, matt. Clean
    and even (AGENTS.md, "The bar": the ground is never aged)."""
    if os.path.exists(os.path.join(K.TEX_DIR, tid, f"{tid}_1K-JPG_Color.jpg")):
        return tid
    from PIL import Image
    rng = np.random.default_rng(seed)
    grain = rng.random((n, n))
    lum = 234 - 9 * (grain - 0.5)
    col = np.dstack([lum, lum * 0.995, lum * 0.97])
    HP._save_set(K, tid, Image.fromarray(np.clip(col, 0, 255).astype(np.uint8)), 0.5 + 0.1 * grain, rough=0.7, normal_k=2.0)
    return tid


def asphalt_texture(K, tid="OEAsphalt031d", base="Asphalt031", seed=3):
    """ambientCG's Asphalt031 with its aggregate a little clearer (the stones' tops show pale in a laid
    carriageway) and a roughness that is lower on them. Nothing else: the ground is clean and of one tone
    (AGENTS.md, "The bar": no variation the material does not explain)."""
    if os.path.exists(os.path.join(K.TEX_DIR, tid, f"{tid}_1K-JPG_Color.jpg")):
        return tid
    from PIL import Image
    K.TEXTURES["_base"] = (base, 1.0)
    T = K.fetch_texture("_base")
    del K.TEXTURES["_base"]
    rng = np.random.default_rng(seed)
    c = np.asarray(Image.open(T["Color"]).convert("L"), float)
    n = c.shape[0]
    m = c.mean()
    lum = m + (c - m) * 1.5
    col = np.dstack([lum * 1.0, lum * 0.992, lum * 0.975])           # a touch warm: stone, not blue
    d = os.path.join(K.TEX_DIR, tid)
    os.makedirs(d, exist_ok=True)
    Image.fromarray(np.clip(col, 0, 255).astype(np.uint8)).save(os.path.join(d, f"{tid}_1K-JPG_Color.jpg"), quality=92)
    Image.open(T["NormalGL"]).convert("RGB").save(os.path.join(d, f"{tid}_1K-JPG_NormalGL.jpg"), quality=92)
    r = np.asarray(Image.open(T["Roughness"]).convert("L"), float) / 255.0
    r = np.clip(0.86 - 0.3 * np.clip((c - m) / 60.0, -0.3, 1), 0.35, 1)
    Image.fromarray((r * 255).astype(np.uint8)).save(os.path.join(d, f"{tid}_1K-JPG_Roughness.jpg"), quality=92)
    return tid


def tactile_texture(K, tid, dots, n=128):
    """One 30 cm tactile block (JIS T 9251): four bars 17 mm wide at 75 mm centres along v, or five by five
    domes at 60 mm centres; safety yellow, a little scuffed, the relief in its normal map."""
    if os.path.exists(os.path.join(K.TEX_DIR, tid, f"{tid}_1K-JPG_Color.jpg")):
        return tid
    from PIL import Image
    rng = np.random.default_rng(11 + dots)
    yy, xx = np.mgrid[0:n, 0:n] / n * 300.0                      # mm across the block
    if dots:
        d = np.full((n, n), 1e9)
        for i in range(5):
            for j in range(5):
                d = np.minimum(d, np.hypot(xx - (30 + 60 * i), yy - (30 + 60 * j)))
        h = np.clip((11.0 - d) / 5.0, 0, 1)
    else:
        d = np.full((n, n), 1e9)
        for i in range(4):
            d = np.minimum(d, np.abs(xx - (37.5 + 75 * i)))
        h = np.clip((8.5 - d) / 4.0, 0, 1) * np.clip((yy - 8) / 6, 0, 1) * np.clip((292 - yy) / 6, 0, 1)
    joint = np.clip(1 - np.minimum(np.minimum(xx, 300 - xx), np.minimum(yy, 300 - yy)) / 2.5, 0, 1)
    scuff = _noise(n, 6, rng)
    lum = 1.0 - 0.22 * joint - 0.1 * scuff + 0.07 * h
    col = np.dstack([226 * lum, 176 * lum, 22 * lum])
    HP._save_set(K, tid, Image.fromarray(np.clip(col, 0, 255).astype(np.uint8)), h * 0.9 - joint * 0.5, rough=0.72, normal_k=4.0)
    return tid


def draw_manhole(kind):
    """A cast-iron cover in its frame: rings and a field of studs (a sewer's), or a square service cover."""
    def draw(img, r):
        from PIL import ImageDraw
        x, y, w, h = r
        d = ImageDraw.Draw(img)
        d.rectangle([x, y, x + w, y + h], fill=(52, 50, 48))
        if kind == 2:                                             # a square two-leaf cover (telecoms, hydrants)
            d.rectangle([x + 3, y + 3, x + w - 4, y + h - 4], fill=(40, 38, 36), outline=(88, 84, 78), width=3)
            d.line([(x + w / 2, y + 4), (x + w / 2, y + h - 5)], fill=(18, 18, 18), width=2)
            for i in range(8):
                for j in range(8):
                    cx, cy = x + 12 + i * (w - 24) / 7, y + 12 + j * (h - 24) / 7
                    d.rectangle([cx - 3, cy - 3, cx + 3, cy + 3], fill=(66, 62, 58))
            return
        d.ellipse([x + 2, y + 2, x + w - 3, y + h - 3], fill=(36, 34, 32), outline=(92, 88, 80), width=4)
        cx, cy = x + w / 2, y + h / 2
        for k in range(1, 5):
            rr = w * 0.105 * k
            d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=(74, 70, 64), width=2)
        for k in range(24 if kind == 0 else 16):
            a = 2 * math.pi * k / (24 if kind == 0 else 16)
            for rr in ((0.16, 0.27, 0.37) if kind == 0 else (0.2, 0.33)):
                px, py = cx + math.cos(a) * w * rr, cy + math.sin(a) * w * rr
                d.ellipse([px - 2.5, py - 2.5, px + 2.5, py + 2.5], fill=(84, 80, 72))
        d.ellipse([cx - 7, cy - 7, cx + 7, cy + 7], fill=(60, 56, 52))
    return draw


def draw_grate(img, r):
    """A gully's steel grating: bearing bars across, in a frame."""
    from PIL import ImageDraw
    x, y, w, h = r
    d = ImageDraw.Draw(img)
    d.rectangle([x, y, x + w, y + h], fill=(70, 70, 70))
    d.rectangle([x + 4, y + 4, x + w - 5, y + h - 5], fill=(8, 8, 8))
    for i in range(14):
        xx = x + 6 + i * (w - 12) / 13
        d.rectangle([xx - 2, y + 4, xx + 2, y + h - 5], fill=(92, 92, 90))
    for j in (0.33, 0.66):
        d.rectangle([x + 4, y + h * j - 2, x + w - 5, y + h * j + 2], fill=(80, 80, 78))


def draw_tree_grate(img, r):
    """A cast-iron tree grate: a square of radial slots round the trunk's hole."""
    from PIL import ImageDraw
    x, y, w, h = r
    d = ImageDraw.Draw(img)
    d.rectangle([x, y, x + w, y + h], fill=(44, 42, 40))
    cx, cy = x + w / 2, y + h / 2
    for k in range(40):
        a = 2 * math.pi * k / 40
        for (r0, r1) in ((0.2, 0.3), (0.33, 0.45)):
            m = 1.0 / max(abs(math.cos(a)), abs(math.sin(a))) if r1 > 0.4 else 1.0
            d.line([(cx + math.cos(a) * w * r0, cy + math.sin(a) * w * r0), (cx + math.cos(a) * w * min(r1 * m, 0.47 * m), cy + math.sin(a) * w * min(r1 * m, 0.47 * m))], fill=(10, 9, 8), width=3)
    d.ellipse([cx - w * 0.16, cy - w * 0.16, cx + w * 0.16, cy + w * 0.16], fill=(30, 24, 18))
    d.rectangle([x, y, x + w - 1, y + h - 1], outline=(80, 76, 70), width=3)


def _paste(img, r, a):
    from PIL import Image
    x, y, w, h = r
    img.paste(Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), "RGB").resize((w, h), Image.LANCZOS), (x, y))


def draw_room(seed, lit):
    """A room behind an upstairs window, as its light after dark: a box room seen from the street below, its
    ceiling and the panels in it, the head of the back wall and what stands against it (scramble_tex.room)."""
    return lambda img, r: _paste(img, r, hero_tex.room(seed, lit, r[2], r[3]))


def draw_shop(kind):
    """A shop through its glass from the pavement, as its light: a box room with its trade in it (shelves and
    gondolas, a bookshop, a cafe's counter, a clothes rail), lit from its ceiling (scramble_tex.shop)."""
    return lambda img, r: _paste(img, r, hero_tex.shop(kind, r[2], r[3]))


ROOMS, SHOPS = 16, 8
OUT = 0.1           # the fronts' face in front of the city's wall (m): behind the landmarks' signs, which stand 0.16 m off and more
STOREY = 3.5

# The fronts that face the junction, each by what its photographs show (docs/HERO.md, "The Scramble"): the wall's
# material, ribbon windows or punched ones, and its storey height where the photograph counts the floors. The
# rest take one of three quiet facings by a seeded draw. No front is white: beside a real street's greys and
# beiges a white tile read as a card model.
FRONTS = {
    # the block on Center Gai's corner: charcoal cladding behind its screens and tenant signs, ribbons of glass
    "w136690966": {"wall": "wall_char", "ribbon": True},
    # 渋谷駅前ビル on Dogenzaka's corner: pale metal panels, ribbon windows
    "w60739635": {"wall": "wall_clad", "ribbon": True},
    # the blocks south of Hachiko Square: grey precast, ribbons
    "s49004": {"wall": "wall_grey", "ribbon": True}, "s49591": {"wall": "wall_grey", "ribbon": True},
    "s49358": {"wall": "wall_clad", "ribbon": True}, "s49241": {"wall": "wall_clad", "ribbon": True},
    "s49151": {"wall": "wall_grey", "ribbon": True},
    # MAGNET by SHIBUYA109: pale metal panels over the landmark's glazed corner and fascia, ribbons of glass
    "w116806281": {"wall": "wall_clad", "ribbon": True},
    # Jingu-dori's east side north of MAGNET: tiled office blocks
    "w136730049": {"wall": "wall_cream", "ribbon": False}, "w136730040": {"wall": "wall_white", "ribbon": True},
    "w136691389": {"wall": "wall_white", "ribbon": False}, "w114755219": {"wall": "wall_grey", "ribbon": True},
}


# ---------------------------------------------------------------- the street's signs (issue 57)

# Up Meiji-dori from Miyamasuzaka-shita the photographs show fronts dense with tenant signs: tall vertical signs standing
# out from the buildings' corners, a tenant to each panel floor by floor (Shibuya's 袖看板, as city.py's tenant stacks
# round the crossing), lit boxes over the shops, and a building's name high on its face. The trades are typical and
# the tenants invented (city.py TENANTS); a name is a building's own, set in an open font, not its logo. Each level
# hangs them on its own fronts (Level.SIGNED, by the building's OpenStreetMap way), only on the faces the frame looks
# at, a few to a building: the street is busy, but each sign is one a tenant put up, never a pattern laid over a wall.
STAND = (521.9, -1074.1)                 # frame 5's standpoint (city.json frame 5 task.stand): the faces turned to it
BLADES = 8                               # the tall signs' faces in the atlas
BOX_H, BOXES = 41, 6                     # a lit box's face in the atlas: BOXES of them, one over another, to a cell
# the lit boxes over the shops: (words, ground, letters); invented, of the trades on such a street, BOXES to a cell
BOX_SIGNS = [("ドラッグストア", "#ffffff", "#0050a0"), ("らーめん 宮益", "#ffe600", "#c8000a"), ("CAFE  珈琲", "#3a2a20", "#f4e2c8"),
             ("メガネ", "#ffffff", "#333333"), ("居酒屋  灯", "#1a1a1a", "#ffcf3a"), ("携帯  SHOP", "#e60012", "#ffffff"),
             ("カラオケ", "#7a0f8c", "#ffffff"), ("歯科  2F", "#ffffff", "#00843d"), ("焼肉", "#141414", "#ff5a1f"),
             ("BOOKS", "#f2efe6", "#1f3a6e"), ("不動産", "#1d5fa8", "#ffffff"), ("うどん  そば", "#f6f0e0", "#7a1a12")]


def _city():
    spec = importlib.util.spec_from_file_location("shibuya_city", os.path.join(HERE, "city.py"))
    C = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(C)
    return C


def draw_blade(k):
    """A tall sign's face: five or six tenants, one to a panel, set vertically (city.py's tenant stacks)."""
    def draw(img, r):
        from PIL import ImageDraw
        C = _city()
        x, y, w, h = r
        d = ImageDraw.Draw(img)
        rng = np.random.default_rng(5700 + k)
        picks = [C.TENANTS[j] for j in rng.choice(len(C.TENANTS), int(rng.integers(5, 7)), replace=False)]
        ph = h / len(picks)
        d.rectangle([x, y, x + w - 1, y + h - 1], fill=(30, 30, 34))
        for i, (txt, bg, fg) in enumerate(picks):
            y0 = y + i * ph
            d.rectangle([x + 2, y0 + 2, x + w - 3, y0 + ph - 2], fill=bg)
            C.draw_vertical(d, txt, x + w / 2, y0 + 4, y0 + ph - 4, "rocknroll" if len(txt) > 3 or txt.isascii() else "mincho", fg, width=w - 8)
    return draw


def draw_boxes(c):
    """Cell c of the lit boxes' faces over the shops, one over another: each its words on its ground."""
    def draw(img, r):
        from PIL import ImageDraw
        C = _city()
        x, y, w, _ = r
        d = ImageDraw.Draw(img)
        for k, (txt, bg, fg) in enumerate(BOX_SIGNS[c * BOXES:(c + 1) * BOXES]):
            y0 = y + k * BOX_H
            d.rectangle([x, y0, x + w - 1, y0 + BOX_H - 2], fill=bg)
            f, _ = C.fit_lines(d, [txt], "rocknroll", w - 16, BOX_H - 8, max_size=int(BOX_H * 0.68))
            d.text((x + w / 2, y0 + BOX_H / 2), txt, font=f, fill=fg, anchor="mm")
    return draw


def box_uv(A, k):
    """Box k's face (k over all the boxes' cells), as Atlas.uv's corners (v up: a cell's top row is vb)."""
    c, k = divmod(k, BOXES)
    (ua, va), (ub, _), (_, vb), _ = A.uv(f"boxes{c}")
    f0, f1 = (k * BOX_H) / (BOXES * BOX_H), (k * BOX_H + BOX_H - 2) / (BOXES * BOX_H)
    top, bot = vb + (va - vb) * f0, vb + (va - vb) * f1
    return [(ua, bot), (ub, bot), (ub, top), (ua, top)]


def draw_name(name):
    """A building's name in lit letters on a dark band, as the street's office blocks carry theirs high up."""
    def draw(img, r):
        from PIL import ImageDraw
        C = _city()
        x, y, w, h = r
        d = ImageDraw.Draw(img)
        d.rectangle([x, y, x + w - 1, y + h - 1], fill=(26, 28, 32))
        f, _ = C.fit_lines(d, [name], "rocknroll", w - 20, h - 8, max_size=int(h * 0.72))
        d.text((x + w / 2, y + h / 2), name, font=f, fill=(246, 244, 236), anchor="mm")
    return draw


# ---------------------------------------------------------------- the level

class Level:
    def __init__(self, K, centre=CENTRE, r=R):
        from shapely.geometry import Point, Polygon, box
        self.centre, self.r = tuple(centre), float(r)
        from shapely.ops import unary_union
        self.K = K
        K.TEXTURES.update(TEX)
        for key, (make, rep) in hero_tex.SETS.items():
            K.register(key, rep, make)
        asphalt_texture(K)
        paint_texture(K)
        tactile_texture(K, "OETactileBar", False)
        tactile_texture(K, "OETactileDot", True)
        self.geo = K.Geo()
        self.A = K.Atlas(2048, 1024)
        self.T = HP.Ground("shibuya")
        self.X = HP.Parts(K, self.geo, self.T, self.A)
        self.rng = np.random.default_rng(1973)
        spec = importlib.util.spec_from_file_location("shibuya_scramble", os.path.join(HERE, "scramble.py"))
        self.S = S = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(S)
        self.D = D = S.Data("shibuya")
        import road_ground
        self.road_ground = road_ground
        # the junction's plan is the landmarks' own (scramble.Plan): one kerb line, one set of guard pipes
        L = json.load(open(os.path.join(ROOT, "web", "data", "shibuya", "landmarks.json")))
        self.plan = P = S.Plan(D, [q["ring"] for q in L.get("clip", [])], self.centre, self.r, standing=self.standing)
        self.disc, self.solids, self.wells, self.junction, self.roads, self.walks, self.pave = P.disc, P.solids, P.wells, P.junction, P.roads, P.walks, P.pave
        S.write_plan(P, D)   # (what this level is built from, for tools/hero_survey_map.py --check)
        # paint lies on the asphalt: inside the gutter's line, never over a kerb or a pavement
        self.paintable = self.roads.buffer(-(GUTTER_M + 0.12))
        self.box = box

    def Gp(self, x, y, h=0.0):
        return self.X.G((x, y), h)

    def build(self):
        A = self.A
        for k in range(3):
            A.cell(f"manhole{k}", 124, 124, draw_manhole(k))
        A.cell("grate", 124, 100, draw_grate)
        A.cell("tree_grate", 248, 248, draw_tree_grate)
        for k in range(ROOMS):
            A.cell(f"room{k}", 124, 160, draw_room(700 + k, k % 5 != 0 and k % 3 != 0))
        for k in range(SHOPS):
            A.cell(f"shop{k}", 480, 256, draw_shop(k))
        self.sign_cells()
        self.carriageway()
        self.markings()
        self.pavements()
        self.tactile()
        self.guards()
        self.lamps()
        self.fronts()
        self.qfront_base()
        return self.geo, self.A

    # -- helpers
    def ribbon(self, mat, a, b, w, h, step=2.0, uvk=1.0):
        """A flat band from a to b (x, y), w wide, laid on the ground in pieces `step` long."""
        a, b = np.asarray(a, float)[:2], np.asarray(b, float)[:2]
        L = float(np.linalg.norm(b - a))
        if L < 1e-3:
            return
        f = (b - a) / L
        r = np.array([f[1], -f[0]])
        fn = lambda d, o, hh: self.Gp(*(a + f * d + r * o), hh)
        self.X.strip(mat, fn, 0.0, L, [-w / 2, w / 2], h, step=step, uvk=uvk, across=max(w, 1.0))

    def paint(self, a, b, w, step=2.0):
        """A painted band from a to b, w wide: only its lengths on the asphalt (a stop line or a crosswalk's bar
        measured to a straight kerb would run on over a kerb that bulges, onto the paving)."""
        from shapely.geometry import LineString
        for co in self.lines(LineString([tuple(a[:2]), tuple(b[:2])]).intersection(self.paintable)):
            if np.linalg.norm(co[-1] - co[0]) > 0.3:
                self.ribbon("ground_paint", co[0], co[-1], w, PAINT, step=step, uvk=1.0 / TEX["paint"][1])

    def lines(self, geom):
        for g in getattr(geom, "geoms", [geom]):
            if g.geom_type == "LineString" and g.length > 0.3:
                yield np.asarray(g.coords)
            elif g.geom_type in ("MultiLineString", "GeometryCollection"):
                yield from self.lines(g)

    # -- the carriageway
    def carriageway(self):
        X, A, rng = self.X, self.A, self.rng
        from shapely.geometry import LineString, Point
        k = 1.0 / TEX["road"][1]
        edge = self.roads.buffer(-GUTTER_M)
        # the gutter runs where the road meets a pavement, not across the level's rim or a building's foot
        gutter = self.roads.difference(edge).intersection(self.pave.buffer(KERB_M + 0.3)).buffer(0)
        X.cover("ground_asphalt", self.roads.difference(gutter).buffer(0), LIFT, cell=2.0, uvk=k)
        X.cover("ground_gutter", gutter, LIFT + 0.002, cell=2.0, uvk=1.0 / TEX["conc"][1])
        kerb = self.roads.buffer(KERB_M).difference(self.roads).intersection(self.pave.buffer(KERB_M + 0.05)).intersection(self.disc).difference(self.wells).buffer(0)
        X.cover("ground_kerb", kerb, LIFT + 0.016, cell=2.0, uvk=1.0 / TEX["granite"][1])
        self.kerb_line = kerb
        # manholes down each road's lanes
        inner = self.roads.buffer(-1.6)
        for cls, pts in self.D.roads:
            ln = LineString([p[:2] for p in pts]).intersection(self.disc)
            for co in self.lines(ln):
                P = HP.Path(np.c_[co, np.zeros(len(co))])
                if P.L < 12:
                    continue
                half = self.S.ROADW.get(cls, 7) / 2
                d = rng.uniform(4, 14)
                while d < P.L - 5:
                    o = rng.uniform(-half + 1.2, half - 1.2)
                    q = P.xy(d, o)
                    if inner.contains(Point(*q)) and not self.walks.buffer(0.6).contains(Point(*q)):
                        kind = int(rng.integers(3))
                        s = (0.66, 0.6, 0.5)[kind]
                        X.decal("ground_iron", self.Gp(*q), P.at(d)[1], s, s, uv=A.uv(f"manhole{kind}"), h=LIFT + 0.008)
                    d += rng.uniform(11, 24)
        # gully grates in the gutter, every 14 m or so along each kerb
        for co in self.lines(self.roads.buffer(-GUTTER_M / 2).boundary.intersection(self.pave.buffer(1.2))):
            P = HP.Path(np.c_[co, np.zeros(len(co))])
            d = 5.0
            while d < P.L - 3:
                q, t, _ = P.at(d)
                if not self.walks.buffer(0.3).contains(Point(*q[:2])):
                    X.decal("ground_iron", self.Gp(*q[:2]), t, 0.4, 0.5, uv=A.uv("grate"), h=LIFT + 0.01)
                d += 14.0

    # -- the paint
    def markings(self):
        S, D, rng = self.S, self.D, self.rng
        from shapely.geometry import LineString, Point
        k = 1.0 / TEX["paint"][1]
        walks = S.crosswalk_list(D)
        centre = np.mean([np.asarray(c["a"]) + np.asarray(c["b"]) for c in walks], axis=0) / 2
        bands = S.road_bands(D)
        stand = self.stand()
        for cw in walks + self.plan.zebras:
            for p, q in S.walk_bars(cw):
                self.paint(p, q, S.BAR, step=2.4)
        for cw in walks:
            st = S.stop_line(D, cw, centre)
            if st is None:
                continue
            p, q, lanes, o, left = st
            self.paint(p, q, S.STOP_W)
            for c0 in lanes:                                          # the diamonds 30 m and 50 m before a crossing
                for dd in (30.0, 50.0):
                    cc = c0 + o * dd
                    if not (bands.contains(Point(*cc).buffer(1.0)) and self.disc.contains(Point(*cc).buffer(2.6))):
                        continue
                    if stand is not None and stand.intersects(Point(*cc).buffer(2.5)):
                        continue                                      # (none in the bus stand, which the photo has bare)
                    pts = [cc + o * 2.5, cc + left * 0.75, cc - o * 2.5, cc - left * 0.75]
                    for j in range(4):
                        self.paint(pts[j], pts[(j + 1) % 4], 0.2)
        self.traced_paint()
        # centre lines on the two-way streets, up to the stop lines (none through the junction)
        keep_out = self.junction.buffer(S.STOP_BACK + 1.0).union(self.walks.buffer(S.STOP_BACK + 1.0))
        inner = self.roads.buffer(-2.5)
        for piece, line in zip(D.surface.pieces, D.surface.lines):
            w = piece.get("cw") or S.ROADW.get(piece.get("c"), 7)
            if piece.get("o") or piece.get("x") or w < 9:
                continue
            for co in self.lines(line.intersection(inner).difference(keep_out)):
                if LineString(co).length < 4:
                    continue
                for a, b in zip(co[:-1], co[1:]):
                    self.paint(a, b, 0.15)
            # two lanes each way where the game drives two (web/game/junctions.js: the second lane 3 m outside the
            # first, which is 1.7 m off the line): a broken line between them, 5 m of paint and 5 m of gap
            if self.road_ground.lanes_each_way(piece) < 2:
                continue
            for side in (3.2, -3.2):
                off = line.offset_curve(side)
                for co in self.lines(off.intersection(inner).difference(keep_out)):
                    P = HP.Path(np.c_[co, np.zeros(len(co))])
                    d = 0.0
                    while d + 5.0 <= P.L:
                        self.paint(P.xy(d, 0.0), P.xy(d + 5.0, 0.0), 0.15)
                        d += 10.0

    def traced(self):
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "terminal_paint.json")
        return json.load(open(path)) if os.path.exists(path) else {}

    def stand(self):
        """Where the buses stand in front of Hachiko: the U of solid line closed by the diagonal (terminal_paint.json)."""
        from shapely.geometry import Polygon
        sol = self.traced().get("solid") or []
        if len(sol) < 2:
            return None
        return Polygon(sol[0] + sol[1][::-1]).buffer(0)

    def traced_paint(self):
        """The bus stand in front of Hachiko as the 2023 orthophoto has it (cities/shibuya/terminal_paint.json):
        one asphalt plain laid out in paint, solid lines round where the buses stand, a dotted lane edge, a hatched
        wedge. Without it the stand read as a dead end of bare asphalt (issue 213)."""
        from shapely.geometry import LineString, Polygon
        T = self.traced()
        for co in T.get("solid", []):
            for a, b in zip(co[:-1], co[1:]):
                self.paint(np.asarray(a, float), np.asarray(b, float), 0.15)
        for co in T.get("dotted", []):                   # the bay edge: dashes 0.5 m long every 1.1 m, 0.2 m wide
            P = LineString(co)
            d = 0.0
            while d + 0.5 <= P.length:
                p, q = P.interpolate(d), P.interpolate(d + 0.5)
                self.paint(np.array([p.x, p.y]), np.array([q.x, q.y]), 0.2)
                d += 1.1
        for ring in T.get("hatched", []):                # an outline and stripes at 45 degrees, 0.45 m every 1.5 m
            poly = Polygon(ring)
            co = np.asarray(poly.exterior.coords)
            for a, b in zip(co[:-1], co[1:]):
                self.paint(a, b, 0.15)
            x0, y0, x1, y1 = poly.bounds
            span = (x1 - x0) + (y1 - y0)
            c = x0 - (y1 - y0)
            while c < x1:
                line = LineString([(c, y0), (c + span, y0 + span)]).intersection(poly.buffer(-0.1))
                for seg in self.lines(line):
                    self.paint(seg[0], seg[-1], 0.45)
                c += 1.5 * np.sqrt(2)

    # -- the pavements
    def pavements(self):
        X, A = self.X, self.A
        plaza = self.box(PLAZA[0], PLAZA[1], PLAZA[2], PLAZA[3])
        X.cover("ground_sett", self.pave.intersection(plaza).buffer(0), LIFT + 0.01, cell=2.0, uvk=1.0 / self.K.TEXTURES["plaza"][1])
        X.cover("ground_paver", self.pave.difference(plaza).buffer(0), LIFT + 0.01, cell=2.0, uvk=1.0 / TEX["paver"][1])
        self.geo.walls += [(np.asarray(a), np.asarray(b), self.T(*a), self.T(*a) + 4.0) for poly in getattr(self.solids, "geoms", [self.solids])
                           for a, b in zip(list(poly.exterior.coords)[:-1], list(poly.exterior.coords)[1:]) if np.linalg.norm(np.subtract(a, b)) > 1.0]
        # a cast-iron grate round each tree that stands in the paving (OpenStreetMap's trees)
        from shapely.geometry import Point
        for n in self.D.nodes:
            if n["tags"].get("natural") == "tree" and self.pave.contains(Point(*n["xy"]).buffer(0.8)):
                X.decal("ground_iron", self.Gp(*n["xy"]), (1, 0), 1.3, 1.3, uv=A.uv("tree_grate"), h=LIFT + 0.02)

    def tactile(self):
        """The yellow blocks as Japan lays them (scramble.tactile_layout, from the footways OpenStreetMap tags
        tactile_paving=yes): guide blocks in straight runs along the paving's grid, their bars along the way; a
        warning block at each bend and branch; a row of warning blocks two deep where a line meets a kerb."""
        lay = self.S.tactile_layout(self.D, self.plan)
        T = self.S.TACT
        for a, b in lay["runs"]:
            a, b = np.asarray(a, float), np.asarray(b, float)
            L = float(np.linalg.norm(b - a))
            f = (b - a) / L
            r = np.array([f[1], -f[0]])
            n = max(1, int(round(L / T)))
            # (uv: across the block along u, so that the bars run along the line; a block a unit of v)
            for i0 in range(0, n, 8):
                d0, d1 = L * i0 / n, L * min(n, i0 + 8) / n
                p0, p1 = a + f * d0, a + f * d1
                q = [self.Gp(*(p0 - r * T / 2), LIFT + 0.022), self.Gp(*(p0 + r * T / 2), LIFT + 0.022), self.Gp(*(p1 + r * T / 2), LIFT + 0.022), self.Gp(*(p1 - r * T / 2), LIFT + 0.022)]
                self.geo.quad("ground_tact_bar", *q, uv=[(0, i0), (1, i0), (1, min(n, i0 + 8)), (0, min(n, i0 + 8))], n=UP)
        for c, f, nw, nd in lay["dots"]:
            c, f = np.asarray(c, float), np.asarray(f, float)
            l = np.array([-f[1], f[0]])
            q = [c + f * s * nw * T / 2 + l * t * nd * T / 2 for s, t in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
            self.geo.quad("ground_tact_dot", *[self.Gp(*p, LIFT + 0.024) for p in q], uv=[(0, 0), (nw, 0), (nw, nd), (0, nd)], n=UP)

    # -- what stands on the kerbs
    def guards(self):
        """The white guard pipes along the kerbs (scramble.guard_runs: the same runs the landmarks make solid),
        drawn finely: a post every 2 m on a base plate, two rails."""
        G = self.geo
        from shapely.geometry import Point
        # (none along a floor the level lays itself, `no_guard`: a hall's forecourt opens onto its road, and a fence
        # there stood across the way the story walks to the lift)
        clear = getattr(self, "no_guard", None)
        runs = []
        for run in self.S.guard_runs(self.plan):
            part = []
            for q in list(run) + [None]:
                if q is not None and (clear is None or clear.distance(Point(*q)) > 1.5):
                    part.append(q)
                    continue
                if len(part) > 2:
                    runs.append(part)
                part = []
        for run in runs:
            pts = [self.Gp(*q, LIFT + 0.01) for q in run]
            for p in pts:
                G.cylinder("metal_guard", p, 0.038, 0.8, 8)
                G.lathe("metal_guard", p, [(0.07, 0.0), (0.07, 0.012), (0.04, 0.03)], segs=8)
            for h in (0.42, 0.74):
                G.tube("metal_guard", [p + UP * h for p in pts], 0.024, 6)

    def lamps(self):
        """Tall tapered steel posts with a flat LED head out over the road (the square's and the junction's own, from
        photographs), on the pavement 0.9 m behind the kerb, about 26 m apart; their light is the bake's."""
        from shapely.geometry import Point
        from shapely.geometry import Polygon
        from shapely.ops import unary_union
        centre, R = np.asarray(self.centre), self.r
        placed = []
        # (none under what is raised over the ground lower than the post: the station over the west exit's roads has its
        # underside at 3.9 m, and once the level's plan stopped counting it as standing (issue 213) a 9 m post stood
        # through it, in the way frame 6's car leaves its stop)
        over = unary_union([Polygon(s["ring"]).buffer(0) for s in self.D.solids
                            if len(s["ring"]) >= 3 and 2.5 <= s.get("base", 0) < 10.0]).buffer(2.0)
        for co in self.lines(self.roads.buffer(KERB_M + 0.9).boundary.intersection(self.pave)):
            P = HP.Path(np.c_[co, np.zeros(len(co))])
            d = 6.0
            while d < P.L - 2:
                q, t, r = P.at(d)
                q = q[:2]
                to_road = r if self.roads.contains(Point(*(q + r * 1.5))) else -r
                if (np.linalg.norm(q - centre) < R - 8 and not self.walks.buffer(1.5).contains(Point(*q)) and self.solids.distance(Point(*q)) > 1.2
                        and all(np.linalg.norm(q - p) > 20 for p in placed) and not over.contains(Point(*q))
                        and self.plan.footways.distance(Point(*q)) > 1.0 and not self.plan.mouths.contains(Point(*q))):   # (never in a walker's way)
                    placed.append(q)
                    PT.lamp_post(self.geo, q, math.atan2(to_road[1], to_road[0]), self.T(*q) + LIFT + 0.01, h=9.0, arms=((1.9, 8.6),),
                                 low=(-0.9, 4.6), mat="metal_pole", light="lamp_head", rgb=(1.0, 0.9, 0.76), power=230.0)
                    d += 26.0
                else:
                    d += 3.0
        self.lamp_at = placed

    # -- the fronts round the junction
    def seen(self, mid, n):
        """Whether a wall's middle can be seen from somewhere a player stands (the junction's roads and pavements
        within 70 m): from in front of it, with no building between."""
        from shapely.geometry import LineString
        p = np.asarray(mid) + np.asarray(n) * 0.4
        for e in self.eyes:
            if (e - mid) @ n > 1.5 and np.linalg.norm(e - mid) < 130 and not self.block.intersects(LineString([e, p])):
                return True
        return False

    def fronts(self):
        """Each wall a player can see, of the buildings round the junction that the landmarks do not draw whole: a
        skin OUT in front of the city's plain wall. A glazed street floor between piers on a dark stone foot, onto
        a lit shop; above it, storey by storey, facing tile or panel with windows set back in their reveals, frames,
        sills, and a coping on the parapet. The landmarks' signs and screens hang in front of it as before."""
        from shapely.geometry import Point, Polygon
        from shapely.ops import unary_union
        from shapely.prepared import prep
        G, D = self.geo, self.D
        c = np.asarray(self.centre)
        # whole buildings scramble.py draws (QFRONT, 109, MAGNET, Seibu, the station) keep their own fronts
        whole = {"w136691386", "w55895868", "w55896465", "w136692137", "w136692134", "w904652357", "w116710254"}
        L = json.load(open(os.path.join(ROOT, "web", "data", "shibuya", "landmarks.json")))
        gone = set(L.get("hidden", [])) | set(L.get("demolished", []))
        near = [(Polygon(s["ring"]).buffer(0), s) for s in D.solids if len(s["ring"]) >= 3 and np.linalg.norm(np.mean(s["ring"], axis=0) - c) < 160
                and s.get("base", 0) < 2.5 and s["si"] not in gone]
        self.block = prep(unary_union([p.buffer(-0.25) for p, _ in near if p.area > 4]))
        walk = self.roads.union(self.pave).intersection(Point(*c).buffer(70))
        x0, y0, x1, y1 = walk.bounds
        self.eyes = [np.array([x, y]) for x in np.arange(x0, x1, 7.0) for y in np.arange(y0, y1, 7.0) if walk.contains(Point(x, y))]
        allp = unary_union([p for p, _ in near]).buffer(0.3)
        # what the landmarks hang on these walls (signs, prints, screens, their boxes and frames): the skin leaves the
        # wall behind each alone, so that nothing of it stands in front of a picture (tools/sign_clear.py's rule)
        M = L["materials"]
        self.hung = []
        for m in L["meshes"]:
            mt = M.get(m["material"], {})
            if not (mt.get("map") or "screen" in m["material"] or "print" in m["material"] or "atlas" in m["material"]):
                continue
            P = np.asarray(m["position"], float).reshape(-1, 3)
            I = np.asarray(m.get("index") or np.arange(len(P)), np.int64).reshape(-1, 3)
            T = P[I]
            keep = np.linalg.norm(T.mean(1)[:, :2] - c, axis=1) < 150
            self.hung += [t for t in T[keep] if t[:, 2].max() - t[:, 2].min() > 0.4]
        n_faces = 0
        for poly, s in near:
            h = s["top"] - s.get("base", 0)
            if s["osm"] in whole or h < 7 or h > 62 or poly.area < 25 or np.linalg.norm(np.asarray(poly.centroid.coords[0]) - c) > 115 or self.skip_front(s, poly):
                continue
            # (a sliver the survey left on a footprint, a hand's breadth across, is opened away: its edges would carry
            # windows with nothing behind them, seen from behind: tools/sign_check.py --hero)
            opened = poly.buffer(-0.15, join_style=2).buffer(0.15, join_style=2)   # (what is under 0.3 m across)
            opened = max(getattr(opened, "geoms", [opened]), key=lambda q: q.area) if not opened.is_empty else poly
            if poly.symmetric_difference(opened).area > 0.05:
                poly = opened
            self.cur = s                                   # (whose walls these are, for a level that dresses some itself)
            rng = np.random.default_rng(sum(ord(ch) for ch in (s["osm"] or str(s["si"]))) * 7919 % (2 ** 31))
            wall = ("wall_white", "wall_cream", "wall_grey")[int(rng.integers(3))]
            ribbon = rng.random() < 0.4                    # an office floor's ribbon windows, or punched ones
            own = FRONTS.get(s["osm"] or f"s{s['si']}")
            if own:
                wall, ribbon = own["wall"], own["ribbon"]
            rep = self.K.TEXTURES[materials()[wall]["tex"]][1]
            co = np.asarray(poly.exterior.coords)[:-1]
            if poly.exterior.is_ccw:
                co = co[::-1]                              # clockwise: the outside is on the left of the way round
            top = s["ground"] + s["top"]
            for i in range(len(co)):
                a, b = co[i], co[(i + 1) % len(co)]
                Ln = float(np.linalg.norm(b - a))
                if Ln < 3.2:
                    continue
                u = (b - a) / Ln
                n = np.array([-u[1], u[0]])
                mid = (a + b) / 2
                # (a wall against a neighbour is no front; nor one no player sees)
                if allp.contains(Point(*(mid + n * 1.2))) or not self.seen(mid, n):
                    continue
                # (nor the edge of a sliver the survey left on a footprint, a hand's breadth across: its windows would
                # stand in the air with nothing behind them, seen from behind: tools/sign_check.py --hero)
                if not poly.contains(Point(*(mid - n * 0.8))):
                    self.slivers = getattr(self, "slivers", 0) + 1
                    continue
                F = PT.Frame(b, a)
                self.front(F, Ln, self.T(*(mid + n * 0.8)) + LIFT, top, wall, rep, ribbon, rng, self.behind(F, Ln))
                G.walls.append((a + n * OUT, b + n * OUT, self.T(*mid), top))
                n_faces += 1
        print(f"fronts: {n_faces} walls dressed, seen from {len(self.eyes)} places ({getattr(self, 'slivers', 0)} slivers' edges left bare)")

    standing = None   # (scramble.Plan's test of what stands on the ground; a level under a deck gives its own)
    cur = None        # the building whose walls fronts() is dressing

    def sills(self, F, Ln):
        """Whether a wall's windows get their sills (4 cm of stone under each: a level whose fronts stand far from where
        it is walked leaves them off the far ones, hero_miyamasu.py)."""
        return True

    def skip_front(self, s, poly):
        """Whether a building's walls are another level's to dress (a second level, hero_miyamasu.py, leaves the
        Scramble's own alone, so that no wall is drawn twice)."""
        return False

    def qfront_base(self):
        """QFRONT's street floor under its canopy, which the landmark draws as one plain band: the shopfront line a
        metre behind the building's face, glazed from a stone foot to the canopy's soffit onto the shops (the
        coffee shop's stair hall, the bookshop's entrance), and the building's round columns in silver cladding
        standing free in front of it, as the photographs show."""
        from shapely.geometry import Polygon
        SC = self.S
        G, A, D = self.geo, self.A, self.D
        Q = SC.QFRONT
        s = next((s for s in D.solids if s["osm"] == Q["osm"] and s["top"] > 40), None)
        if not s:
            return
        R = Q["round_m"]
        O = Polygon(s["ring"]).buffer(-R, join_style=2).buffer(R, resolution=6)
        cen, toward = np.array(O.centroid.coords[0]), np.asarray(Q["toward"])
        front = lambda mid, n: (toward - cen) @ n / np.linalg.norm(toward - cen) > -0.25 and (mid - cen) @ (toward - cen) > -8.0
        zs = s["ground"] + Q["shop_m"] - 0.55              # the canopy's soffit
        n_bays = 0
        for a, b, n, L in SC.ring_edges(O.buffer(-1.0 + OUT, join_style=2)):
            mid = (a + b) / 2
            if L < 0.6 or not front(mid, n):
                continue
            F = PT.Frame(a, b) if np.allclose(PT.Frame(a, b).n, n, atol=0.05) else PT.Frame(b, a)
            g = self.T(*(mid + n * 1.5)) + LIFT
            nb = max(1, int(round(L / 3.0)))
            bw = L / nb
            for j in range(nb):
                u0, u1 = j * bw, (j + 1) * bw
                z0 = g + 0.3
                key = f"shop{(2 + n_bays // 2) % SHOPS}"
                (ua, va), (ub, _), (_, vb), _ = A.uv(key)
                half = n_bays % 2
                uv = [(ua + (ub - ua) * (half + s_) / 2, v_) for s_, v_ in ((0, va), (1, va), (1, vb), (0, vb))]
                G.quad("glow_shop", F.P(u0, 0.0, z0), F.P(u1, 0.0, z0), F.P(u1, 0.0, zs), F.P(u0, 0.0, zs), uv=uv, n=F.N, emit=(A.mean[key], 1.3))
                PT.fbox(G, "wall_foot", F, u0, u1, 0.0, 0.05, g, z0, TEX["dark"][1], faces=("front", "top"))
                PT.fbox(G, "metal_alu", F, u0 - 0.035, u0 + 0.035, 0.0, 0.08, z0, zs, faces=("front", "left", "right"))
                PT.fbox(G, "metal_alu", F, u0, u1, 0.0, 0.07, g + 2.5, g + 2.56, faces=("front", "top", "bottom"))
                PT.fbox(G, "metal_alu", F, u0, u1, 0.0, 0.07, zs - 0.08, zs, faces=("front", "bottom"))
                n_bays += 1
        # the columns, on the building's face line, 5.4 m apart along the front
        acc, last, n_cols = 2.7, None, 0
        for a, b, n, L in SC.ring_edges(O.buffer(-0.35, join_style=2)):
            if not front((a + b) / 2, n):
                last = None
                continue
            for t in np.arange(0.0, L, 0.3):
                p = a + (b - a) * (t / L)
                acc += 0.3
                if acc >= 5.4:
                    acc = 0.0
                    g = self.T(*p) + LIFT
                    G.tube("metal_alu", [(p[0], p[1], g), (p[0], p[1], zs)], 0.3, segs=14)
                    G.tube("wall_foot", [(p[0], p[1], g), (p[0], p[1], g + 0.25)], 0.34, segs=14)
                    n_cols += 1
        print(f"QFRONT's street floor: {n_bays} bays of glass, {n_cols} columns")

    # -- the street's signs (issue 57)
    # {osm way: {"blades": n, "boxes": n, "name": text}}: the signs a level hangs on a building's fronts. The Scramble's:
    # the west side of Meiji-dori up from Miyamasuzaka-shita, within this level's reach (hero_miyamasu.py skip_front),
    # as the photographs show it: 渋谷パークサイド共同ビル's south front over the street with its tall signs and boxes,
    # and the slim towers behind it, each a tall sign down its narrow south face
    SIGNED = {
        "w116806280": {"blades": 2, "boxes": 3},    # 渋谷パークサイド共同ビル
        "w138670889": {"blades": 1},                # the slim tower beyond it (47 m)
        "w749184350": {"blades": 1},                # and its low neighbour
    }

    def sign_cells(self):
        """The signs' faces, on the atlas's last shelf after the shops (no bigger an atlas on a phone)."""
        if not self.SIGNED:
            return
        A = self.A
        for k in range(BLADES):
            A.cell(f"blade{k}", 44, 254, draw_blade(k))
        for c in range(len(BOX_SIGNS) // BOXES):
            A.cell(f"boxes{c}", 176, BOXES * BOX_H, draw_boxes(c))
        for osm, sp in self.SIGNED.items():
            if sp.get("name"):
                A.cell(f"name_{osm}", 360, 50, draw_name(sp["name"]))
        self.signed = {}

    def hang(self, F, Ln, g, top, hung):
        """After a front is dressed: its signs, if its building has some (SIGNED) and the face is one frame 5 looks at."""
        osm = (self.cur or {}).get("osm")
        spec = self.SIGNED.get(osm)
        if not spec or Ln < 3.2:
            return
        mid = (F.a + F.b) / 2
        to = np.asarray(STAND) - mid
        if to @ F.n < 0.3 * np.linalg.norm(to):        # only the faces the frame looks at
            return
        self.signs(osm, spec, F, Ln, g, top, hung)

    def signs(self, osm, spec, F, Ln, g, top, hung):
        """A front's signs (SIGNED): its name high on its longest face, lit boxes over its shops, and its tall
        tenant signs standing out from an end of the face, read from up and down the street."""
        G, A = self.geo, self.A
        done = self.signed.setdefault(osm, {"blades": 0, "boxes": 0, "name": 0})
        free = lambda u0, u1, z0, z1: not any(u0 < h[1] and u1 > h[0] and z0 < h[3] and z1 > h[2] for h in hung)
        Hh = top - g
        gf = 4.3 if Hh > 11 else 3.3
        o = OUT
        nbox = len(BOX_SIGNS)
        lit = lambda key, *P, uv=None: G.quad("glow_shop", *P, uv=uv or A.uv(key), emit=(A.mean[key], 1.0))
        # the name, once, on a face long enough for it
        if spec.get("name") and not done["name"] and Ln >= 12 and Hh > 16:
            w = min(Ln * 0.6, 15.0)
            h = w / 7.2
            u0, z1 = (Ln - w) / 2, top - 1.4
            if free(u0, u0 + w, z1 - h, z1):
                PT.fbox(G, "wall_char", F, u0 - 0.15, u0 + w + 0.15, o, o + 0.2, z1 - h - 0.15, z1 + 0.15, faces=("front", "left", "right", "top", "bottom"))
                lit(f"name_{osm}", F.P(u0, o + 0.205, z1 - h), F.P(u0 + w, o + 0.205, z1 - h), F.P(u0 + w, o + 0.205, z1), F.P(u0, o + 0.205, z1))
                done["name"] = 1
        # lit boxes on the band over the shops, one to each shop's width along the face
        z0, z1 = g + gf - 0.8, g + gf - 0.22
        slots = max(1, min(3, int(Ln // 5.5)))
        for i in range(slots):
            if done["boxes"] >= spec.get("boxes", 0):
                break
            u = Ln * (i + 0.5) / slots
            w = min(Ln / slots * 0.62, 4.8)
            a = u - w / 2
            if w < 2.0 or not free(a, a + w, z0, z1):
                continue
            k = (sum(ord(ch) for ch in osm) + done["boxes"] * 5) % nbox
            PT.fbox(G, "wall_char", F, a, a + w, o, o + 0.16, z0, z1, faces=("front", "left", "right", "top", "bottom"))
            lit("boxes0", F.P(a + 0.04, o + 0.165, z0 + 0.04), F.P(a + w - 0.04, o + 0.165, z0 + 0.04), F.P(a + w - 0.04, o + 0.165, z1 - 0.04), F.P(a + 0.04, o + 0.165, z1 - 0.04), uv=box_uv(A, k))
            done["boxes"] += 1
        # the tall tenant signs, 0.9 m out from the wall at an end of the face, from over the shops' band
        h = min(Hh - gf - 2.5, 16.0)
        for u in (Ln - 0.9, 0.9):
            if done["blades"] >= spec.get("blades", 0) or h < 5.0:
                break
            b0, b1 = g + gf + 0.4, g + gf + 0.4 + h
            if not free(u - 0.3, u + 0.3, b0, b1):
                continue
            key = f"blade{(sum(ord(ch) for ch in osm) + done['blades'] * 3) % BLADES}"
            u0, u1, q0, q1 = u - 0.09, u + 0.09, o + 0.12, o + 1.02
            PT.fbox(G, "metal_alu", F, u0, u1, o, q0, b0 + 0.6, b0 + 0.75, faces=("front", "left", "right", "top", "bottom"))   # its brackets
            PT.fbox(G, "metal_alu", F, u0, u1, o, q0, b1 - 0.75, b1 - 0.6, faces=("front", "left", "right", "top", "bottom"))
            PT.fbox(G, "wall_char", F, u0, u1, q0, q1, b0, b1, faces=("front", "top", "bottom"))
            e = 0.005
            lit(key, F.P(u0 - e, q0, b0), F.P(u0 - e, q1, b0), F.P(u0 - e, q1, b1), F.P(u0 - e, q0, b1))   # read from one way up the street
            lit(key, F.P(u1 + e, q1, b0), F.P(u1 + e, q0, b0), F.P(u1 + e, q0, b1), F.P(u1 + e, q1, b1))   # and from the other
            done["blades"] += 1

    def behind(self, F, Ln):
        """The parts of a wall that a landmark's picture hangs on: [(u0, u1, z0, z1)] in the wall's frame, for each
        upright picture face that lies along the wall within 1.6 m in front of it (or 0.6 m inside it: a wall the
        city draws a little off its sign's)."""
        out = []
        for t in self.hung:
            d = (t[:, :2] - F.a) @ F.n
            u = (t[:, :2] - F.a) @ F.t
            if d.min() < -0.6 or d.max() > 1.6 or u.max() < 0.2 or u.min() > Ln - 0.2 or d.max() - d.min() > 0.5 * (u.max() - u.min()) + 0.3:
                continue
            out.append((max(0.0, u.min() - 0.12), min(Ln, u.max() + 0.12), t[:, 2].min() - 0.12, t[:, 2].max() + 0.12))
        # (two triangles to a face, and faces side by side: joined where they overlap, so that the wall is cut once)
        out.sort()
        merged = []
        for r in out:
            for k, q in enumerate(merged):
                if r[0] <= q[1] + 0.3 and r[1] >= q[0] - 0.3 and r[2] <= q[3] + 0.3 and r[3] >= q[2] - 0.3:
                    merged[k] = (min(q[0], r[0]), max(q[1], r[1]), min(q[2], r[2]), max(q[3], r[3]))
                    break
            else:
                merged.append(r)
        return merged

    def door(self, F, u0, u1, g, z0, z1, uv, mean):
        """A shop's way in, in the middle of a bay: a pair of glass doors 0.9 m wide under the transom, the stone
        foot stopping either side of them, the glass running down to a steel threshold. The leaves' stiles and
        rails and the pull handles are the level's finest parts (geo.fine: drawn near, never on a phone)."""
        G, fine = self.geo, self.geo.fine
        um = (u0 + u1) / 2
        d0, d1 = um - 0.92, um + 0.92
        head = g + 2.25
        for a, b in ((u0, d0), (d1, u1)):
            PT.fbox(G, "wall_foot", F, a, b, 0.0, OUT + 0.03, g, z0, TEX["dark"][1], faces=("front", "top", "left", "right"))
            PT.fbox(G, "metal_alu", F, a, b, 0.02, 0.09, z0, z0 + 0.06, faces=("front", "left", "right", "top", "bottom"))
        (ua, va), (ub, _), _, _ = uv                                   # the shop's floor shows through the leaves' feet
        k = lambda u: ua + (ub - ua) * (u - u0) / (u1 - u0)
        G.quad("glow_shop", F.P(d0, 0.03, g + 0.03), F.P(d1, 0.03, g + 0.03), F.P(d1, 0.03, z0), F.P(d0, 0.03, z0),
               uv=[(k(d0), va), (k(d1), va), (k(d1), va), (k(d0), va)], n=F.N, emit=(mean, 1.3))
        for x in (d0, d1):                                             # the door frame's jambs, to the ground
            PT.fbox(G, "metal_alu", F, x - 0.035, x + 0.035, 0.02, 0.09, g, z1, faces=("front", "left", "right"))
        PT.fbox(G, "metal_alu", F, d0, d1, 0.0, OUT + 0.05, g, g + 0.03, faces=("front", "top"))                     # the threshold
        for lo, hi, s_ in ((d0 + 0.035, um - 0.004, 1), (um + 0.004, d1 - 0.035, -1)):                           # each leaf
            for (m0, m1, y0, y1) in ((lo, lo + 0.05, g + 0.03, head), (hi - 0.05, hi, g + 0.03, head), (lo, hi, g + 0.03, g + 0.16), (lo, hi, head - 0.06, head)):
                PT.fbox(fine, "metal_alu", F, m0, m1, 0.03, 0.075, y0, y1, faces=("front", "left", "right", "top", "bottom"))
            hx = (hi - 0.11) if s_ > 0 else (lo + 0.11)                # the pull handle by the meeting stiles
            fine.tube("metal_alu", [F.P(hx, 0.125, g + 0.85), F.P(hx, 0.125, g + 1.4)], 0.014, 8)
            for hz in (g + 0.92, g + 1.33):
                fine.tube("metal_alu", [F.P(hx, 0.07, hz), F.P(hx, 0.125, hz)], 0.009, 6)

    def front(self, F, Ln, g, top, wall, rep, ribbon, rng, hung=()):
        G, A = self.geo, self.A
        free = lambda u0, u1, z0, z1: not any(u0 < h[1] and u1 > h[0] and z0 < h[3] and z1 > h[2] for h in hung)
        H = top - g
        gf = 4.3 if H > 11 else 3.3
        floors = max(1, int(round((H - gf - 0.6) / STOREY)))
        st = (H - gf - 0.6) / floors
        nb = max(1, int(round(Ln / (4.2 if ribbon else 3.3))))
        bw = Ln / nb
        pier = 0.32 if ribbon else 0.75                    # the wall left either side of a bay's window
        holes = []
        # the street floor: glass onto the shop between piers, over a stone foot
        k0 = int(rng.integers(SHOPS))
        for j in range(nb):
            u0, u1 = j * bw + 0.3, (j + 1) * bw - 0.3
            z0, z1 = g + 0.38, g + gf - 0.85
            if u1 - u0 < 1.2 or not free(u0 - 0.1, u1 + 0.1, g, z1 + 0.1):
                continue
            holes.append((u0, u1, g, z1))
            key = f"shop{(k0 + j // 2) % SHOPS}"
            (ua, va), (ub, _), (_, vb), _ = A.uv(key)
            half = j % 2                                    # a shop's picture runs across two bays
            uv = [(ua + (ub - ua) * (half + s_) / 2, v_) for s_, v_ in ((0, va), (1, va), (1, vb), (0, vb))]
            G.quad("glow_shop", F.P(u0, 0.03, z0), F.P(u1, 0.03, z0), F.P(u1, 0.03, z1), F.P(u0, 0.03, z1), uv=uv, n=F.N,
                   emit=(A.mean[key], 1.3))
            door = j % 2 == 1 and u1 - u0 >= 2.3                      # every second bay is the shop's way in
            if door:
                self.door(F, u0, u1, g, z0, z1, uv, A.mean[key])
            else:
                PT.fbox(G, "wall_foot", F, u0, u1, 0.0, OUT + 0.03, g, z0, TEX["dark"][1], faces=("front", "top"))
            for (m0, m1, y0, y1) in ((u0, u1, z1 - 0.07, z1), (u0, u1, z0, z0 + 0.06), (u0, u0 + 0.06, z0, z1), (u1 - 0.06, u1, z0, z1)):
                if door and y1 - y0 < 0.1 and y0 == z0:
                    continue                                          # (no sill rail across a doorway)
                PT.fbox(G, "metal_alu", F, m0, m1, 0.02, 0.09, y0, y1, faces=("front", "left", "right", "top", "bottom"))
            for t in (() if door else (0.5,) if u1 - u0 < 2.6 else (0.34, 0.67)):
                um = u0 + (u1 - u0) * t
                PT.fbox(G, "metal_alu", F, um - 0.03, um + 0.03, 0.02, 0.08, z0, z1, faces=("front", "left", "right"))
            PT.fbox(G, "metal_alu", F, u0, u1, 0.02, 0.07, g + 2.25, g + 2.31, faces=("front", "top", "bottom"))     # the transom over the doors
            # the reveal's soffit and jambs
            G.quad(wall, F.P(u1, 0.03, z1), F.P(u0, 0.03, z1), F.P(u0, OUT, z1), F.P(u1, OUT, z1), ao=0.7)
            G.quad(wall, F.P(u0, 0.03, z0), F.P(u0, OUT, z0), F.P(u0, OUT, z1), F.P(u0, 0.03, z1), ao=0.7)
            G.quad(wall, F.P(u1, OUT, z0), F.P(u1, 0.03, z0), F.P(u1, 0.03, z1), F.P(u1, OUT, z1), ao=0.7)
        # the floors above: windows in their reveals
        k1 = int(rng.integers(ROOMS))
        wins = []
        for f in range(floors):
            zf = g + gf + f * st
            sill, head = zf + (0.85 if ribbon else 0.95), zf + st - 0.4
            for j in range(nb):
                u0, u1 = j * bw + pier, (j + 1) * bw - pier
                if u1 - u0 < 0.8 or head - sill < 1.0 or not free(u0 - 0.2, u1 + 0.2, sill - 0.25, head + 0.2):
                    continue
                holes.append((u0, u1, sill, head))
                wins.append((u0, u1, sill, head, (k1 + f * 5 + j * 3) % ROOMS))
        holes += [(max(0.0, h[0]), min(Ln, h[1]), max(g, h[2]), min(top + 0.5, h[3])) for h in hung]
        PT.wall(G, wall, F, 0.0, Ln, g, top + 0.5, OUT, rep, holes=holes, sub=3.5)
        d = OUT
        for (u0, u1, z0, z1, k) in wins:
            cols = max(1, int(round((u1 - u0) / 1.5)))
            for ci in range(cols):                          # a room to each 1.5 m of glass
                a0, a1 = u0 + (u1 - u0) * ci / cols, u0 + (u1 - u0) * (ci + 1) / cols
                G.quad("win_glass", F.P(a0, 0.02, z0), F.P(a1, 0.02, z0), F.P(a1, 0.02, z1), F.P(a0, 0.02, z1), uv=A.uv(f"room{(k + ci) % ROOMS}"), n=F.N)
                if ci:
                    PT.fbox(G, "metal_alu", F, a0 - 0.025, a0 + 0.025, 0.02, 0.07, z0, z1, faces=("front", "left", "right"))
            # the reveal: sill, jambs, head
            G.quad(wall, F.P(u0, 0.02, z0), F.P(u1, 0.02, z0), F.P(u1, d, z0), F.P(u0, d, z0), ao=0.75)
            G.quad(wall, F.P(u1, 0.02, z1), F.P(u0, 0.02, z1), F.P(u0, d, z1), F.P(u1, d, z1), ao=0.65)
            G.quad(wall, F.P(u0, 0.02, z0), F.P(u0, d, z0), F.P(u0, d, z1), F.P(u0, 0.02, z1), ao=0.72)
            G.quad(wall, F.P(u1, d, z0), F.P(u1, 0.02, z0), F.P(u1, 0.02, z1), F.P(u1, d, z1), ao=0.72)
            t = 0.045
            for (m0, m1, y0, y1) in ((u0, u1, z0, z0 + t), (u0, u1, z1 - t, z1), (u0, u0 + t, z0, z1), (u1 - t, u1, z0, z1)):
                PT.fbox(G, "metal_alu", F, m0, m1, 0.02, 0.065, y0, y1, faces=("front", "left", "right", "top", "bottom"))
            if self.sills(F, Ln):
                PT.fbox(G, wall, F, u0 - 0.06, u1 + 0.06, OUT, OUT + 0.04, z0 - 0.1, z0, rep)                        # the sill
        # a band over the shops, and the parapet's coping
        if free(0.0, Ln, g + gf - 0.2, g + gf + 0.1):
            PT.fbox(G, wall, F, 0.0, Ln, OUT, OUT + 0.04, g + gf - 0.12, g + gf, rep, faces=("front", "top", "bottom"))
        PT.fbox(G, "metal_alu", F, -0.05, Ln + 0.05, -0.3, OUT + 0.1, top + 0.5, top + 0.62, faces=("front", "left", "right", "top", "bottom"))
        self.hang(F, Ln, g, top, hung)


def build(K):
    """(geo, atlas, materials, meta) for blender/build_hero.py."""
    L = Level(K)
    geo, atlas = L.build()
    M = materials()
    # the pavements, the square, kerbs and gutters in close tones of one grey family (AGENTS.md, "The bar"): each
    # texture brought to its tone by its own mean, so that a yellowish block ends as a grey
    for mat, key, srgb in (("ground_paver", "paver", (150, 150, 148)),
                           ("ground_kerb", "granite", (160, 160, 158)), ("ground_gutter", "conc", (152, 152, 150)),
                           ("wall_white", "tile", (192, 192, 188)), ("wall_cream", "tile", (190, 180, 164)), ("wall_grey", "clad", (158, 160, 162)),
                           ("wall_clad", "clad", (176, 180, 184)), ("wall_char", "clad", (62, 64, 68))):
        M[mat]["tint"] = K.tint_to(key, srgb)
    meta = {"id": ID, "at": list(CENTRE), "r": R, "z": 15.0, "glb": f"hero/{ID}.glb", "bake_gain": 1.0, "cell": 28.0,
            "sky_rays": 20, "sky_reach": 5.0, "sky_strength": 1.0}   # (the sky's light occluded, ray-cast: hero_kit.sky_occlusion)
    # for cities/shibuya/city.json game.hero[]: the paving's height over the game's ground, which walkers are stood on
    # (web/game/nav.js lift), and the lamp posts, which are solid (game.js)
    meta["lift"] = LIFT + 0.01
    meta["posts"] = [[round(float(q[0]), 1), round(float(q[1]), 1)] for q in L.lamp_at]
    print("game.hero:", json.dumps({"lift": meta["lift"], "posts": meta["posts"]}))
    return geo, atlas, M, meta
