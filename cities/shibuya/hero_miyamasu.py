"""Miyamasu, the Shibuya map's second hero level: frame 5's place (blender/build_hero.py --city shibuya --level
miyamasu; docs/HERO.md, "Miyamasu").

Why here: the story's fifth frame is taken at the foot of Shibuya Scramble Square's north face, where Miyamasu Bridge
carried the old road over the Shibuya River until the river was put under the street, looking north-north-west up the
line the water ran (21 degrees west of north, the line Meiji-dori keeps). It is 150 m from the Scramble, outside that
level, and its print showed what the city draws for a place no level covers (issue 33): the Ginza line's station over
the east exit as a plain slab 2.8 m over the pavement, the piers under it as pale boxes, and a bare floor.

What the frame's camera sees, and so what is built here (the city's ground, solids and collision are left as they
are; the level is drawn over them, as the Scramble is):

  * the Ginza line's station (2020) overhead: its underside as built, a steel deck on cross girders every 3 m with
    linear lights between them, (the edge girders' cladding and the station over them are hero_ginza.py's); its piers as round steel
    columns on granite collars with a flared head under the girders (the city's square piers stand inside them);
  * the ground of the east exit: the bus terminal's carriageways in clean asphalt with their gutters and flush granite
    kerbs, the plaza and pavements in grey blocks, the tactile lines OpenStreetMap maps, guard pipes and lamp posts
    on the kerbs out from under the deck;
  * the fronts that close the view up the street and round the plaza, in the Scramble level's grammar (hero.py
    Level.fronts), except the buildings the Scramble level dresses itself.

The level's disc keeps clear of the Scramble's (152 m between the centres, 100 m and 50 m radii), so no ground is
drawn twice.
"""
import importlib.util
import json
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
_spec = importlib.util.spec_from_file_location("shibuya_hero", os.path.join(HERE, "hero.py"))
H = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(H)
PT, HP, unit = H.PT, H.HP, H.unit

# The fronts that close the frame's view up the street, from the photographs (2015 to 2026, docs/HERO.md "Miyamasu"):
# the cinema and Bic Camera's block (渋谷東映プラザ) in grey panel with bands of glass; the 1990s offices beside it in
# the beige tile Shibuya's mid-rises of that decade wear, with punched windows
H.FRONTS.update({
    "w120105804": {"wall": "wall_clad", "ribbon": True},    # 渋谷東映プラザ
    "w116806279": {"wall": "wall_cream", "ribbon": False},  # FPG links SHIBUYA (1995, ten storeys)
    "w155749492": {"wall": "wall_cream", "ribbon": False},
    "w116806280": {"wall": "wall_cream", "ribbon": False},  # 渋谷パークサイド共同ビル
})

# The street's signs (issue 57; hero.py "the street's signs"): on the faces frame 5 looks at up Meiji-dori, as the
# photographs show them (docs/HERO.md "Miyamasu"). The west side's fronts up the street (渋谷パークサイド共同ビル and the
# slim towers beyond it) are within the Scramble level's reach and dressed by it, skip_front: their signs are in
# hero.py's own SIGNED.
SIGNED = {
    "w120105804": {"blades": 4, "boxes": 4, "name": "渋谷東映プラザ"},   # 渋谷東映プラザ, the cinema and Bic Camera's block
    "w116806279": {"blades": 1, "boxes": 1},                            # FPG links SHIBUYA, closing the view
    "w155749492": {"blades": 2, "boxes": 2},
    # the east side's mid-rises up the street, seen in the view up it and back down (tools/views/shibuya-miyamasu.json)
    "w138589860": {"blades": 2, "boxes": 2},
    "w123592007": {"blades": 1, "boxes": 1},
    "w123592018": {"blades": 1, "boxes": 1},
    "w355252205": {"boxes": 1},
    "w120105789": {"blades": 1, "boxes": 1},
    "w155797253": {"blades": 1, "boxes": 1},
}


ID = "miyamasu"
CENTRE = (512.0, -1052.0)
R = 50.0
STATION = {"w810356690"}                 # the Ginza line's station over the east exit (pipeline/stations.py UNDERSIDE)
GIRDER_EVERY, GIRDER_D, GIRDER_W = 3.0, 0.72, 0.42   # cross girders: spacing, depth under the deck, flange width (m)
SILLS_M = 60.0               # a front's windows have their sills within this of frame 5's standpoint
SOFFIT_LIGHT = 16.0          # a linear light's radiance for the bake (30 washed the blocks under the deck out beside the forecourt, issue 124)
PIER_R, COLLAR_R, HEAD_R = 0.68, 0.8, 1.02   # a pier's shaft (round over the city's 0.9 m square one), its collar, its head

# The foot of Scramble Square's north face and the ground under the deck (issue 124; docs/HERO.md, "The east side under
# the deck"). Along the face, s runs west from the tower's north-east corner and n north out of it (scrsq_base.Face).
SHOP_S = (0.4, 44.4)        # the street floor dressed: from SKY's hall (hero_skylobby.py) to the works' hoarding
SHOP_OFF = 0.07             # its frame in front of the face's line (the record's rings are in decimetres: glass 3 cm off the line lay behind the city's wall)
SHOP_HEAD = 5.6             # its head over the tower's base: the forecourt ceiling's height at the glass (hero_skylobby.py soffit)
SHOP_BAY = 3.6              # a bay of the glass, pier to pier
LIFT_ID = "sky-gate"        # the hall whose frame the forecourt's planks are laid in (hero_skylobby.py Frame, FORECOURT)
PLANK_U, PLANK_V = (-8.0, 2.5), (-36.0, -14.0)   # the planks here, in that frame: the same courses, on west from where the hall's stop
PLANK_Z = 0.075             # over the ground, as the hall's (hero_skylobby.py ztile)
HALL_PLANK_V1 = -2.4        # where the hall's own planks stop before its doors (hero_skylobby.py APRON_V)
# the hoarding of the station's works (phase II: the central and west buildings, begun May 2025), along the works' box west
# of the forecourt, 0.9 m off the city's walls: flat steel panels 0.5 m by 3 m (the rental catalogues' size)
HOARDING = [(472.9, -1068.3), (479.6, -1086.0), (486.2, -1087.3), (489.7, -1096.5)]
HOARD_H, HOARD_PANEL = 3.0, 0.5
RIVER = ((519.42, -1067.66), 21.0)   # the culvert's line: through frame 5's relic, 21 degrees west of north (city.json task.relic)
COVERS = (23.0, 39.0)                # its access covers, metres along that line from the relic (clear of the print's river)
# signs hung under the deck: (x, y, the way one face looks in degrees from east, the face's row in the atlas cell)
HUNG = [((509.5, -1062.6), 249.0, 0), ((533.0, -1064.6), 339.0, 1), ((500.5, -1074.6), 339.0, 2)]
HUNG_W, HUNG_H, HUNG_Z = 2.67, 0.3, 4.0     # a sign's face, and its foot over the ground
SIGN_ROWS = [("東口 East Exit", "明治通り Meiji-dori Ave.", (246, 200, 40), (20, 20, 22)),
             ("銀座線 Ginza Line", "のりば Platforms 3F", (28, 34, 44), (244, 244, 240)),
             ("JR線 JR Lines", "宮益坂口 Miyamasuzaka Gate", (28, 34, 44), (244, 244, 240))]


def materials():
    M = H.materials()
    M.update({
        # the deck's underside and its girders: steel painted a warm pale grey, as Tokyo Metro's new stations are
        "steel_soffit": {"color": (0.36, 0.365, 0.37), "rough": 0.62, "metal": 0.1},
        "steel_girder": {"color": (0.48, 0.485, 0.49), "rough": 0.5, "metal": 0.15},
        "steel_pier": {"color": (0.56, 0.565, 0.57), "rough": 0.42, "metal": 0.2},
        "stone_collar": {"tex": "granite", "maps": "cn", "rough": 0.45},
        # the linear lights between the girders: on as dusk falls (hero.js lamp*), their light on the street baked
        "lamp_soffit": {"color": (0.95, 0.96, 0.98), "emissive": (1.0, 0.95, 0.88), "glow": 2.0},
        # the forecourt's planks: honed stone in three close greys laid in stripes, the hall's own (hero_skylobby.py)
        "ground_plank": {"tex": "granite", "maps": "cn", "rough": 0.5},
        "ground_plank_dark": {"tex": "granite", "maps": "cn", "rough": 0.5},
        "ground_plank_pale": {"tex": "granite", "maps": "cn", "rough": 0.5},
        "ground_joint": {"color": (0.1, 0.1, 0.105), "rough": 0.8},
        "glow_strip": {"color": (0.8, 0.82, 0.95), "emissive": (0.62, 0.66, 1.0), "glow": 1.4},
        # the works' hoarding: white flat steel panels, their joints, the striped end posts, the printed boards on it
        "wall_hoard": {"color": (0.74, 0.745, 0.74), "rough": 0.42, "metal": 0.15},
        "wall_hoard_joint": {"color": (0.36, 0.365, 0.37), "rough": 0.5, "metal": 0.2},
        "wall_hoard_green": {"color": (0.03, 0.3, 0.14), "rough": 0.5},
        "wall_notice": {"map": "atlas", "rough": 0.6},
        "lamp_work": {"color": (0.95, 0.96, 0.98), "emissive": (1.0, 0.97, 0.92), "glow": 2.0},
    })
    return M


def place_free(A, key, w, h, draw):
    """A cell where the atlas's shelves left room (a shelf is as tall as its tallest cell, and the short ones leave the
    rest of it empty): the first free place of that size, so that the atlas grows no bigger for it."""
    used = np.zeros((A.height, A.size), bool)
    for x, y, cw, ch in A.cells.values():
        used[max(0, y - 2):y + ch + 2, max(0, x - 2):x + cw + 2] = True
    for y in range(0, A.height - h + 1, 2):
        for x in range(0, A.size - w + 1, 2):
            if not used[y:y + h, x:x + w].any():
                r = (x, y, w, h)
                draw(A.img, r)
                A.cells[key] = r
                a = np.asarray(A.img.crop((x, y, x + w, y + h)), float) / 255.0
                A.mean[key] = (a ** 2.2).reshape(-1, 3).mean(0)
                return r
    raise ValueError(f"atlas: no free place of {w} x {h} for {key}")


def east_cells():
    """The level's own printed and lit faces, each a small cell laid where the atlas's shelves left room: three hung
    signs' faces, the tower's name in lit letters, and the boards on the works' hoarding. {key: (w, h, draw)}. The words
    are the place's own (the exits, the lines, the works under way since May 2025); no operator's mark is drawn."""
    from PIL import ImageDraw
    C = H._city()
    ink, green, white, red = (24, 26, 30), (0, 120, 60), (240, 240, 236), (190, 30, 30)

    def words(d, box, txt, fill, max_size, anchor="mm", pad=4):
        bx, by, bw, bh = box
        f, _ = C.fit_lines(d, [txt], "rocknroll", bw - 2 * pad, bh - 2, max_size=max_size)
        d.text((bx + (bw / 2 if anchor == "mm" else pad), by + bh / 2), txt, font=f, fill=fill, anchor=anchor)

    def sign(jp, en, bg, fg):                                          # a hung sign's face: 2.67 m by 0.3 m
        def draw(img, r):
            x, y, w, h = r
            d = ImageDraw.Draw(img)
            d.rectangle([x, y, x + w - 1, y + h - 1], fill=bg)
            words(d, (x, y, 150, h), jp, fg, 26, "lm", 8)
            words(d, (x + 150, y, w - 150, h), en, fg, 17, "lm", 6)
        return draw

    def name(img, r):                                                  # the tower's name over its doors
        x, y, w, h = r
        d = ImageDraw.Draw(img)
        d.rectangle([x, y, x + w - 1, y + h - 1], fill=(22, 24, 28))
        words(d, (x, y, w, h), "SHIBUYA SCRAMBLE SQUARE", (246, 244, 236), 22)

    def board(title, rows, head=ink):                                  # a works' board: white enamel, ruled as the forms are
        def draw(img, r):
            x, y, w, h = r
            d = ImageDraw.Draw(img)
            d.rectangle([x, y, x + w - 1, y + h - 1], fill=white, outline=(120, 122, 124))
            d.rectangle([x + 1, y + 1, x + w - 2, y + 12], fill=head)
            words(d, (x, y + 1, w, 12), title, white, 10, pad=2)
            rh = (h - 15) / max(len(rows), 1)
            for i, (k_, v_) in enumerate(rows):
                yy = y + 14 + i * rh
                d.line([x + 2, yy + rh - 1, x + w - 3, yy + rh - 1], fill=(170, 172, 174))
                if v_ is None:
                    words(d, (x, yy, w, rh), k_, ink, 9, pad=2)
                else:
                    d.line([x + w * 0.34, yy, x + w * 0.34, yy + rh - 1], fill=(170, 172, 174))
                    words(d, (x, yy, w * 0.34, rh), k_, ink, 8, pad=1)
                    words(d, (x + w * 0.34, yy, w * 0.66, rh), v_, ink, 8, "lm", 2)
        return draw

    def safety(img, r):                                                # 安全第一 either side of the green cross
        x, y, w, h = r
        d = ImageDraw.Draw(img)
        d.rectangle([x, y, x + w - 1, y + h - 1], fill=white, outline=(120, 122, 124))
        c, m = x + w // 2, y + h // 2
        d.rectangle([c - 7, m - 14, c + 7, m + 14], fill=green)
        d.rectangle([c - 14, m - 7, c + 14, m + 7], fill=green)
        words(d, (x, y, w // 2 - 14, h), "安全", green, 18, pad=2)
        words(d, (c + 14, y, w // 2 - 14, h), "第一", green, 18, pad=2)

    def no_entry(img, r):
        x, y, w, h = r
        d = ImageDraw.Draw(img)
        d.rectangle([x, y, x + w - 1, y + h - 1], fill=white, outline=red, width=2)
        words(d, (x, y + 1, w, h * 0.55), "関係者以外立入禁止", red, 12)
        words(d, (x, y + h * 0.5, w, h * 0.45), "Authorized personnel only", ink, 9)

    cells = {f"sign{k}": (356, 40, sign(*row)) for k, row in enumerate(SIGN_ROWS)}
    cells.update({
        "name_tower": (356, 30, name),
        "board_plan": (86, 86, board("建築計画のお知らせ", [("建築物の名称", "渋谷駅街区 中央棟・西棟"), ("建築敷地", "渋谷区渋谷二丁目"), ("用途", "事務所・店舗・駅施設"),
                                              ("着工", "2025年5月"), ("完了予定", "2031年度"), ("標識設置", "2025年")])),
        "board_works": (68, 86, board("工事中", [("渋谷駅街区開発計画 Ⅱ期", None), ("ご迷惑をおかけします", None), ("作業時間", "8:00-18:00"), ("歩行者通路", "Walkway →")], head=green)),
        "board_permit": (62, 43, board("建設業の許可票", [("許可", "国土交通大臣"), ("建設業", "建築工事業")])),
        "board_rosai": (62, 43, board("労災保険関係成立票", [("事業の期間", "2025.5 - 2032.3"), ("成立", "2025年5月")])),
        "board_safety": (118, 43, safety),
        "board_entry": (118, 43, no_entry),
    })
    return cells


def _station(D):
    """The station's solids that stand off the ground: (polygon, underside z, solid)."""
    from shapely.geometry import Polygon
    out = []
    for s in D.solids:
        if s["osm"] in STATION and s["base"] > 2.5 and len(s["ring"]) >= 3:
            out.append((Polygon(s["ring"]).buffer(0), s["ground"] + s["base"], s))
    return out


class Level(H.Level):
    # a solid stands on the ground when its underside is under 2.5 m: the station over the east exit does not, and the
    # ground under it is the bus terminal's, drawn
    standing = staticmethod(lambda s: s.get("base", 0) < 2.5)
    SIGNED = SIGNED

    def __init__(self, K):
        from shapely.geometry import Point
        from shapely.ops import unary_union
        super().__init__(K, CENTRE, R)
        self.deck = _station(self.D)
        self.over = unary_union([p for p, _, _ in self.deck]) if self.deck else None
        self.scramble = Point(*H.CENTRE).buffer(H.R + 15)
        B = json.load(open(os.path.join(ROOT, "web", "data", "shibuya", "buildings.json")))
        si = {s["si"] for _, _, s in self.deck}
        sys.path.insert(0, HERE)
        import scrsq_base as SB
        self.Fa = SB.Face(B)                 # the tower's north face: s west along it from its north-east corner, n out
        self.fence = []                      # what is solid of what stands here: points along the hoarding (game.hero[].posts)
        self.pier_at = [(v[i] / 10, v[i + 1] / 10, int(k)) for k, v in B.get("piers", {}).items() if int(k) in si for i in range(0, len(v), 2)]

    def build(self):
        A = self.A
        for k in range(3):
            A.cell(f"manhole{k}", 124, 124, H.draw_manhole(k))
        A.cell("grate", 124, 100, H.draw_grate)
        A.cell("tree_grate", 248, 248, H.draw_tree_grate)
        for k in range(H.ROOMS):
            A.cell(f"room{k}", 124, 160, H.draw_room(700 + k, k % 5 != 0 and k % 3 != 0))
        for k in range(H.SHOPS):
            A.cell(f"shop{k}", 480, 256, H.draw_shop(k))
        self.sign_cells()                  # (the street's signs, issue 57: hero.py)
        for key, (w, h, draw) in east_cells().items():   # (the hung signs, the tower's name and the works' boards)
            place_free(A, key, w, h, draw)
        # (no carriageway where this level and SKY's hall lay floors of their own: the survey's carriageway here is the
        # east exit's bus apron as it was mapped, and runs on under the forecourt's planks and the hall's stone, which
        # were built since. Laid there at the ground's height the asphalt stood over the hall's level floor, and the guide
        # walked 0.75 m under it: tools/guide_way.js, issue 196)
        own = self.planked().union(self.hall_ground()).buffer(0.05)
        self.roads = self.roads.difference(own).buffer(0)
        self.paintable = self.roads.buffer(-(H.GUTTER_M + 0.12))
        self.S.write_plan(self.plan, self.D, roads=self.roads, own=own)
        self.carriageway()
        self.markings()
        # (no blocks under the forecourt's planks, here or before the hall: a plank is flat from end to end and the
        # blocks follow the ground every 2 m, so where the ground swells they stood through the planks in patches)
        # (nor on SKY's hall's own ground, its tiles, its floor and its planks round its north side: laid at the
        # ground's height 8 cm over the hall's level floor, this level's blocks covered the hall's stone in a patch with
        # a slanting edge, from the forecourt to the cars: the owner's screenshot at the lift, November 2026)
        pave = self.pave
        self.pave = pave.difference(self.planked().union(self.hall_ground()))
        self.pavements()
        self.pave = pave
        self.tactile()
        self.guards()
        self.lamps()
        self.fronts()
        self.underside()
        self.piers()
        self.shopfront()
        self.forecourt()
        self.hoarding()
        self.hung_signs()
        self.drains()
        # the fronts' window frames and mullions (half the level's triangles: 4.5 cm of aluminium, under a pixel past
        # 50 m) go to the fine model, drawn square by square near the camera and never fetched on a phone, where the
        # Scramble's level is held beside this one at frame 5 (tools/mem_check.js AT=521.9,-1074.1)
        alu = self.geo.parts.pop("metal_alu", None)
        if alu:
            f = self.geo.fine.part("metal_alu")
            n0 = len(f["p"])
            for k in ("p", "n", "uv", "ao"):
                f[k] += alu[k]
            f["tri"] += [(a + n0, b + n0, c + n0) for a, b, c in alu["tri"]]
        return self.geo, self.A

    def skip_front(self, s, poly):
        # the Scramble level's buildings (those within its reach of its centre) are its own to dress; the station
        # over the east exit is drawn here as a deck, not as a front
        c = np.asarray(poly.centroid.coords[0])
        return s["osm"] in STATION or np.linalg.norm(c - np.asarray(H.CENTRE)) < 115 + 4

    def sills(self, F, Ln):
        # the fronts stand 60 to 110 m from where the frame is played, across the plaza and up the street: a window's
        # sill is 4 cm of stone there, under a pixel, and 20 vertices; what they held pays for the forecourt on a phone,
        # which is at its budget at frame 5 (issues 105 and 124)
        return np.linalg.norm((F.a + F.b) / 2 - np.asarray(H.STAND)) < SILLS_M

    def lamps(self):
        """The Scramble's lamp posts on the kerbs, but none under the deck (a 9 m post through a 7 m underside)."""
        if self.over is None:
            return super().lamps()
        keep = self.solids
        self.solids = keep.union(self.over.buffer(2.0))
        try:
            super().lamps()
        finally:
            self.solids = keep

    # -- the station's underside
    def _down(self, mat, poly, z, uvk=1.0):
        """A flat face under `poly` at height z, facing down (Parts.cover's grid, turned over)."""
        g = self.geo.part(mat)
        n0, t0 = len(g["p"]), len(g["tri"])
        self.X.cover(mat, poly, 0.0, cell=1.5, uvk=uvk, zfn=lambda x, y: z)
        for i in range(n0, len(g["p"])):
            g["n"][i] = np.array([0.0, 0.0, -1.0])
        g["tri"][t0:] = [(a, c, b) for a, b, c in g["tri"][t0:]]

    def underside(self):
        """The deck seen from the street: a steel soffit on cross girders every 3 m across the station's width, a
        linear light in every second bay. All of it hangs
        from the city's underside (pipeline/stations.py UNDERSIDE), a few centimetres in front of it."""
        from shapely.geometry import LineString, Point
        if not self.deck:
            return
        G = self.geo
        reach = Point(*CENTRE).buffer(R + 25)
        n_g = n_l = 0
        for poly, zs, s in self.deck:
            P = poly.intersection(reach)
            if P.is_empty:
                continue
            # the deck's axis: its longest edge
            co = np.asarray(poly.exterior.coords)
            e = max(((co[i], co[i + 1]) for i in range(len(co) - 1)), key=lambda ab: np.linalg.norm(ab[1] - ab[0]))
            u = unit(e[1] - e[0])
            v = np.array([-u[1], u[0]])
            self._down("steel_soffit", P.buffer(-0.02), zs - 0.03)
            c0 = np.asarray(poly.centroid.coords[0])
            L = max(abs((np.asarray(q) - c0) @ u) for q in co) + 2
            W = max(abs((np.asarray(q) - c0) @ v) for q in co) + 2
            inner = P.buffer(-0.25)
            k = 0
            for d in np.arange(-L, L, GIRDER_EVERY):
                k += 1
                cut = LineString([c0 + u * d - v * W, c0 + u * d + v * W]).intersection(inner)
                for seg in self.lines(cut):
                    a, b = seg[0], seg[-1]
                    if np.linalg.norm(b - a) < 3.0:      # (none across a sliver of the deck: its edge girders carry it)
                        continue
                    mid, ln = (a + b) / 2, float(np.linalg.norm(b - a))
                    # the girder: a web and a bottom flange (an I seen from under it)
                    G.box("steel_girder", np.r_[mid, zs - GIRDER_D], (unit(b - a), u), (ln, 0.06 + 0.0, GIRDER_D - 0.03), ao=0.8)
                    G.box("steel_girder", np.r_[mid, zs - GIRDER_D], (unit(b - a), u), (ln, GIRDER_W, 0.04), faces=("bot", "+v", "-v", "top"))
                    n_g += 1
                # a light along the middle of every second bay, its ends short of the edge girders
                if k % 2:
                    continue
                lit = LineString([c0 + u * (d + GIRDER_EVERY / 2) - v * W, c0 + u * (d + GIRDER_EVERY / 2) + v * W]).intersection(P.buffer(-1.6))
                for seg in self.lines(lit):
                    a, b = seg[0], seg[-1]
                    ln = float(np.linalg.norm(b - a))
                    if ln < 1.5:
                        continue
                    t = unit(b - a)
                    r = np.array([-t[1], t[0]])
                    z = zs - 0.05
                    # the fitting's body, and its diffuser facing down (a lit face the bake takes as a light: a
                    # 4000 K strip, 0.12 m wide, every 6 m, about the light a lamp post gives the street)
                    G.box("steel_girder", np.r_[(a + b) / 2, z - 0.06], (t, r), (ln, 0.2, 0.08), faces=("+v", "-v", "+u", "-u"))
                    q = [np.r_[a - r * 0.06, z - 0.062], np.r_[a + r * 0.06, z - 0.062], np.r_[b + r * 0.06, z - 0.062], np.r_[b - r * 0.06, z - 0.062]]
                    G.quad("lamp_soffit", q[0], q[3], q[2], q[1], uv=[(0, 0), (1, 0), (1, 1), (0, 1)], n=np.array([0.0, 0.0, -1.0]),
                           emit=((1.0, 0.94, 0.86), SOFFIT_LIGHT))
                    n_l += 1
            # what a station hangs under its deck: two conduits and a cable tray along it, under the girders' flanges
            if poly.area > 800:
                zc = zs - GIRDER_D - 0.06
                for off, kind in ((-W * 0.3, "pipe"), (-W * 0.3 + 0.22, "pipe"), (W * 0.22, "tray")):
                    run = LineString([c0 - u * L + v * off, c0 + u * L + v * off]).intersection(P.buffer(-1.2))
                    for seg in self.lines(run):
                        a, b = seg[0], seg[-1]
                        ln = float(np.linalg.norm(b - a))
                        if ln < 6.0:
                            continue
                        if kind == "pipe":
                            G.tube("steel_girder", [np.r_[a + (b - a) * k / 8, zc] for k in range(9)], 0.03, 6)
                        else:
                            G.box("steel_girder", np.r_[(a + b) / 2, zc - 0.07], (unit(b - a), v), (ln, 0.3, 0.07), faces=("bot", "+v", "-v"))
            # (the edge girders' white cladding, and the station's walls and roof over them, are the Ginza line's own
            # level: hero_ginza.py, fetched wherever the story walks)
        print(f"underside: {n_g} girders, {n_l} lights")

    def piers(self):
        """Each pier the city stands the deck on (buildings.json piers): a round steel column on a granite collar,
        flaring at its head into a bearing plate under the girders."""
        from shapely.geometry import Point
        G = self.geo
        under = {s["si"]: zs for _, zs, s in self.deck}
        n = 0
        for x, y, si in self.pier_at:
            if np.hypot(x - CENTRE[0], y - CENTRE[1]) > R + 20:
                continue
            g = self.T(x, y)
            top = under[si] - 0.04
            c = np.array([x, y, g])
            G.lathe("stone_collar", c, [(COLLAR_R, -0.05), (COLLAR_R, 0.36), (COLLAR_R - 0.025, 0.385), (PIER_R + 0.01, 0.385)], segs=28, ao=0.85)
            G.lathe("steel_pier", c, [(PIER_R, 0.38), (PIER_R, top - g - 1.3)], segs=28)
            G.lathe("steel_pier", c, [(PIER_R, top - g - 1.3), (PIER_R + 0.05, top - g - 0.9), (HEAD_R, top - g - 0.12), (HEAD_R, top - g + 0.02)], segs=28)
            G.lathe("steel_girder", c, [(HEAD_R + 0.04, top - g + 0.02), (HEAD_R + 0.04, top - g + 0.08), (0.2, top - g + 0.08)], segs=28)
            # a shadow-gap ring where each 3 m can of the shaft meets the next
            for zz in np.arange(3.0, top - g - 1.6, 3.0):
                G.lathe("steel_girder", c, [(PIER_R - 0.004, zz - 0.012), (PIER_R - 0.004, zz + 0.012)], segs=28)
            # a brushed stainless wrap round the shaft's foot to over a hand's reach, and the deck's rainwater pipe down
            # the shaft in three clamps, on the side turned to the forecourt
            G.lathe("metal_alu", c, [(PIER_R + 0.012, 0.385), (PIER_R + 0.012, 2.1), (PIER_R, 2.115)], segs=28)
            to = unit(np.asarray(H.STAND) - c[:2])
            ca, sa = math.cos(math.radians(50)), math.sin(math.radians(50))
            px = np.r_[c[:2] + np.array([to[0] * ca - to[1] * sa, to[0] * sa + to[1] * ca]) * (PIER_R + 0.075), g]
            G.tube("metal_pole", [px + [0, 0, 0.39], px + [0, 0, top - g - 1.35]], 0.05, 8)
            for zz in (1.2, 3.3, 5.0):
                G.lathe("metal_pole", px, [(0.063, zz - 0.025), (0.063, zz + 0.025)], segs=8)
            G.walls.append((np.array([x - PIER_R, y]), np.array([x + PIER_R, y]), g, top))
            G.walls.append((np.array([x, y - PIER_R]), np.array([x, y + PIER_R]), g, top))
            n += 1
        print(f"piers: {n} clad")


    # -- the foot of the tower and the ground under the deck (issue 124)
    def shopfront(self):
        """The tower's street floor along its north face, which the city draws as a blank white wall: glass from a dark
        stone foot to a charcoal fascia, between piers in pale panel every 3.6 m, onto the lit shops of its ground
        floor; a pair of doors in every third bay, and the tower's name in lit letters on the fascia over the middle
        ones (the photograph of the entrance in 2019; the 1F is food shops and the Urban Core, glass behind its bays)."""
        G, A, Fa = self.geo, self.A, self.Fa
        s0, s1 = SHOP_S
        F = PT.Frame(Fa.xy(s0, SHOP_OFF), Fa.xy(s1, SHOP_OFF))
        if F.n @ Fa.n < 0:
            F = PT.Frame(Fa.xy(s1, SHOP_OFF), Fa.xy(s0, SHOP_OFF))
        Ln, head, o = F.len, Fa.base + SHOP_HEAD, H.OUT
        nb = max(1, int(round(Ln / SHOP_BAY)))
        bw = Ln / nb
        rep = self.K.TEXTURES[materials()["wall_clad"]["tex"]][1]
        gz = lambda u: self.T(*(F.a + F.t * u + F.n * 0.6)) + H.LIFT
        zt = head - 0.8                                     # the glass's head, under the fascia
        kinds = (2, 1, 6, 3, 5, 2)                          # the shops, two bays each: the warm ones, their counters and shelves (one white among them)
        for j in range(nb):
            u0, u1 = j * bw + 0.28, (j + 1) * bw - 0.28
            g = gz((u0 + u1) / 2)
            z0 = g + 0.15
            key = f"shop{kinds[(j // 2) % len(kinds)]}"
            (ua, va), (ub, _), (_, vb), _ = A.uv(key)
            half = j % 2
            uv = [(ua + (ub - ua) * (half + s_) / 2, v_) for s_, v_ in ((0, va), (1, va), (1, vb), (0, vb))]
            G.quad("glow_shop", F.P(u0, 0.03, z0), F.P(u1, 0.03, z0), F.P(u1, 0.03, zt), F.P(u0, 0.03, zt), uv=uv, n=F.N, emit=(A.mean[key], 1.3))
            door = j % 3 == 1
            if door:
                self.door(F, u0, u1, g, z0, zt, uv, A.mean[key])
            else:
                PT.fbox(G, "wall_foot", F, u0, u1, 0.0, o + 0.03, g - 0.3, z0, H.TEX["dark"][1], faces=("front", "top"))
            # the frame: head, sill, jambs, two mullions and a transom over the doors' height
            for (m0, m1, y0, y1) in ((u0, u1, zt - 0.07, zt), (u0, u1, z0, z0 + 0.06), (u0, u0 + 0.06, z0, zt), (u1 - 0.06, u1, z0, zt)):
                if door and y1 - y0 < 0.1 and y0 == z0:
                    continue
                PT.fbox(G, "metal_alu", F, m0, m1, 0.02, 0.09, y0, y1, faces=("front", "left", "right", "top", "bottom"))
            for t in (() if door else (1 / 3, 2 / 3)):
                um = u0 + (u1 - u0) * t
                PT.fbox(G, "metal_alu", F, um - 0.03, um + 0.03, 0.02, 0.08, z0, zt, faces=("front", "left", "right"))
            PT.fbox(G, "metal_alu", F, u0, u1, 0.02, 0.07, g + 2.5, g + 2.56, faces=("front", "top", "bottom"))
        for j in range(nb + 1):                             # the piers
            a, b = max(0.0, j * bw - 0.28), min(Ln, j * bw + 0.28)
            PT.fbox(G, "wall_clad", F, a, b, -SHOP_OFF, o + 0.06, gz((a + b) / 2) - 0.3, zt, rep, faces=("front", "left", "right"))
        PT.fbox(G, "wall_char", F, 0.0, Ln, -SHOP_OFF, o + 0.1, zt, head, rep, faces=("front", "bottom", "left", "right"))
        # the name, over the doors nearest the middle
        jm = min((j for j in range(nb) if j % 3 == 1), key=lambda j: abs(j - nb / 2))
        um, w = (jm + 0.5) * bw, 5.2
        hh = w * 30 / 356
        zm = (zt + head) / 2
        G.quad("glow_shop", F.P(um - w / 2, o + 0.105, zm - hh / 2), F.P(um + w / 2, o + 0.105, zm - hh / 2), F.P(um + w / 2, o + 0.105, zm + hh / 2),
               F.P(um - w / 2, o + 0.105, zm + hh / 2), uv=A.uv("name_tower"), n=F.N, emit=(np.array([0.5, 0.5, 0.48]), 0.6))
        G.walls.append((F.a + F.n * o, F.b + F.n * o, gz(Ln / 2), head))
        print(f"shopfront: {nb} bays over {Ln:.1f} m")

    def hall(self):
        """The frame the forecourt is laid in, SKY's hall's (hero_skylobby.py Frame): its door, u south across it, n east."""
        Gm = json.load(open(os.path.join(ROOT, "web", "data", "shibuya", "game.json")))
        st = next(l for l in Gm["lifts"] if l["id"] == LIFT_ID)["stops"][0]
        door, at = np.array(st["door"], float), np.array(st["at"][:2], float)
        n = unit(at - door)
        return door, np.array([n[1], -n[0]]), n

    def planked(self):
        """Where planks lie: this level's and the hall's first field of them (hero_skylobby.py FORECOURT), as a polygon."""
        from shapely.geometry import Polygon
        door, u, n = self.hall()
        (u0, u1), (v0, v1) = PLANK_U, (PLANK_V[0], HALL_PLANK_V1)
        return Polygon([door + u * a + n * b for a, b in ((u0, v0), (u1, v0), (u1, v1), (u0, v1))]).buffer(-0.03)

    def hall_ground(self):
        """SKY's hall's own ground, which hero_skylobby.py lays: from its tiles 2.4 m before its west side (APRON_V) to
        its shaft's far side (HALL_V + SHAFT_V, 6.6 m in), and from its planks out to the north (FORECOURT's second
        field, u -8) to its wall against the tower (HALL_U, u 3.1), as a polygon in the city's frame."""
        from shapely.geometry import Polygon
        door, u, n = self.hall()
        return Polygon([door + u * a + n * b for a, b in ((-8.0, HALL_PLANK_V1), (3.2, HALL_PLANK_V1), (3.2, 6.7), (-8.0, 6.7))])

    def forecourt(self):
        """The forecourt's planks carried on west along the tower's face from where SKY's hall lays them
        (hero_skylobby.py forecourt: the same courses in the same frame, so that a stripe runs through): honed stone
        0.3 m wide and 1.2 to 3 m long in three close greys, a line of light in one joint in seven."""
        G = self.geo
        door, u, n = self.hall()
        xy = lambda a, b: door + u * a + n * b
        rep = self.K.TEXTURES["granite"][1]
        rng = np.random.default_rng(1124)
        mats = ("ground_plank", "ground_plank_dark", "ground_plank_pale")
        j = 0.003

        def q(mat, pts, dz=0.0, uv=None, sub=None):
            P = [np.r_[xy(a, b), self.T(*xy(a, b)) + PLANK_Z + dz] for a, b in pts]
            G.quad(mat, *P, uv=uv, n=H.UP, sub=sub)

        (u0, u1), (v0, v1) = PLANK_U, PLANK_V
        k, ua, count = 0, u0, 0
        while ua < u1 - 1e-6:
            ub = min(u1, ua + 0.3)
            v = v0 - rng.random() * 2.0
            while v < v1 - 1e-6:
                vb, va = min(v1, v + 1.2 + rng.random() * 1.8), max(v0, v)
                if vb - va > 0.1:
                    m = mats[int(rng.choice(3, p=(0.5, 0.25, 0.25)))]
                    pts = [(ua + j, va + j), (ub - j, va + j), (ub - j, vb - j), (ua + j, vb - j)]
                    ou, ov = rng.random(2) * 3
                    q(m, pts, uv=[(ou + a / rep, ov + b / rep) for a, b in pts])
                    count += 1
                v = vb
            if k % 7 == 3:
                q("glow_strip", [(ua - 0.006, v0 + 0.6), (ua + 0.006, v0 + 0.6), (ua + 0.006, v1 - 0.6), (ua - 0.006, v1 - 0.6)], dz=0.002, sub=(1, 10))
            ua, k = ua + 0.3, k + 1
        q("ground_joint", [(u0, v0), (u1, v0), (u1, v1), (u0, v1)], dz=-0.004, sub=(6, 12))
        print(f"forecourt: {count} planks")

    def hoarding(self):
        """The works' hoarding west of the forecourt (the station's phase II, begun May 2025): white flat steel panels
        0.5 m wide and 3 m high with a joint between each, green and white end posts, the boards a site in Tokyo
        carries (the notice of the building plan, the works' board, the two permits, the safety banner), and a
        works' lamp over them. Solid: points along it go to game.hero[].posts."""
        from shapely.geometry import LineString, Point
        G = self.geo
        for i, (a, b) in enumerate(zip(HOARDING[:-1], HOARDING[1:])):
            a, b = np.array(a), np.array(b)
            d = self.solids.distance(LineString([a, b]))
            if d < 0.2:
                raise SystemExit(f"hoarding: its run {i} is {d:.2f} m from a wall")
            F = PT.Frame(a, b)
            if self.solids.distance(Point(*((a + b) / 2 + F.n * 1.5))) < self.solids.distance(Point(*((a + b) / 2 - F.n * 1.5))):
                F = PT.Frame(b, a)                          # (it faces away from the works)
            Ln = F.len
            gz = lambda u: self.T(*(F.a + F.t * u)) + H.LIFT
            nq = max(1, int(math.ceil(Ln / 2.0)))
            for k in range(nq):
                ua, ub = Ln * k / nq, Ln * (k + 1) / nq
                G.quad("wall_hoard", F.P(ua, 0.0, gz(ua) - 0.1), F.P(ub, 0.0, gz(ub) - 0.1), F.P(ub, 0.0, gz(ub) + HOARD_H), F.P(ua, 0.0, gz(ua) + HOARD_H), n=F.N, sub=(1, 2))
            for um in np.arange(HOARD_PANEL, Ln - 0.1, HOARD_PANEL):
                g = gz(um)
                G.quad("wall_hoard_joint", F.P(um - 0.005, 0.004, g - 0.1), F.P(um + 0.005, 0.004, g - 0.1), F.P(um + 0.005, 0.004, g + HOARD_H), F.P(um - 0.005, 0.004, g + HOARD_H), n=F.N)
            for um in (0.0, Ln):                           # the end posts, banded green and white
                g = gz(um)
                for bnd in range(6):
                    PT.fbox(G, "wall_hoard_green" if bnd % 2 == 0 else "wall_hoard", F, um - 0.07, um + 0.07, -0.02, 0.06, g - 0.1 + bnd * 0.53, g - 0.1 + (bnd + 1) * 0.53,
                            faces=("front", "left", "right") + (("top",) if bnd == 5 else ()))
            if i == 0:
                # the boards, at the eye's height: (the cell's part, width and height in metres, its middle along the run, its foot)
                um = Ln * 0.55
                for key, bw_, bh_, du, z0 in (("board_plan", 0.9, 0.9, -1.25, 1.25), ("board_works", 1.1, 1.4, 0.0, 0.95), ("board_permit", 0.56, 0.4, 1.05, 1.75),
                                           ("board_rosai", 0.56, 0.4, 1.05, 1.25), ("board_safety", 1.8, 0.66, 2.65, 1.55), ("board_entry", 1.2, 0.44, -3.0, 1.45)):
                    c, g = um + du, gz(um + du)
                    PT.fbox(G, "metal_alu", F, c - bw_ / 2 - 0.015, c + bw_ / 2 + 0.015, 0.0, 0.016, g + z0 - 0.015, g + z0 + bh_ + 0.015, faces=("front", "left", "right", "top"))
                    G.quad("wall_notice", F.P(c - bw_ / 2, 0.018, g + z0), F.P(c + bw_ / 2, 0.018, g + z0), F.P(c + bw_ / 2, 0.018, g + z0 + bh_), F.P(c - bw_ / 2, 0.018, g + z0 + bh_),
                           uv=self.A.uv(key), n=F.N)
            if i in (0, 2):
                # a works' lamp on an arm over the run: an LED batten, its face down, its light the bake's
                for um in np.arange(Ln * 0.25, Ln, Ln * 0.5 if i else 6.0):
                    z = gz(um) + HOARD_H + 0.25
                    G.tube("metal_pole", [F.P(um, 0.0, z - 0.3), F.P(um, 0.0, z + 0.05), F.P(um, 0.42, z + 0.05)], 0.014, 6)
                    PT.fbox(G, "metal_pole", F, um - 0.3, um + 0.3, 0.36, 0.48, z - 0.01, z + 0.05, faces=("front", "back", "left", "right", "top"))
                    G.quad("lamp_work", F.P(um - 0.29, 0.47, z - 0.012), F.P(um + 0.29, 0.47, z - 0.012), F.P(um + 0.29, 0.37, z - 0.012), F.P(um - 0.29, 0.37, z - 0.012),
                           n=np.array([0.0, 0.0, -1.0]), emit=((1.0, 0.97, 0.92), 180.0))
            self.fence += [F.a + F.t * um for um in np.arange(0.0, Ln + 0.01, 0.28)]
            G.walls.append((F.a, F.b, gz(Ln / 2), gz(Ln / 2) + HOARD_H))
        print(f"hoarding: {len(HOARDING) - 1} runs, {len(self.fence)} points solid")

    def hung_signs(self):
        """The signs hung under the deck on two rods from a girder: a charcoal box 2.67 m by 0.3 m, lit on both faces,
        its foot 4 m over the paving."""
        from shapely.geometry import Point
        G = self.geo
        for (x, y), deg, row in HUNG:
            zs = next((z for poly, z, _ in self.deck if poly.contains(Point(x, y))), None)
            if zs is None:
                raise SystemExit(f"hung sign at {x}, {y}: not under the deck")
            t = np.array([math.cos(math.radians(deg)), math.sin(math.radians(deg))])
            rr = np.array([-t[1], t[0]])
            z0 = self.T(x, y) + HUNG_Z
            c = np.array([x, y])
            G.box("wall_char", np.r_[c, z0 - 0.04], (rr, t), (HUNG_W + 0.08, 0.12, HUNG_H + 0.08))
            for sgn in (1.0, -1.0):
                e, n_ = c + t * 0.062 * sgn, rr * sgn
                P = [np.r_[e - n_ * HUNG_W / 2, z0], np.r_[e + n_ * HUNG_W / 2, z0], np.r_[e + n_ * HUNG_W / 2, z0 + HUNG_H], np.r_[e - n_ * HUNG_W / 2, z0 + HUNG_H]]
                G.quad("glow_shop", *P, uv=self.A.uv(f"sign{row}"), emit=(np.array([0.5, 0.5, 0.45]), 0.6))
            for sd in (-0.9, 0.9):
                G.tube("metal_pole", [np.r_[c + rr * sd, z0 + HUNG_H + 0.04], np.r_[c + rr * sd, zs - GIRDER_D + 0.3]], 0.012, 6)
        print(f"hung signs: {len(HUNG)}")

    def drains(self):
        """What the ground says of the water under it: a slot drain along the deck's drip line on its south side (a
        cast-iron grating 0.25 m wide), and the culvert's access covers on the line the river ran."""
        from shapely.geometry import Point
        X, A = self.X, self.A
        (rx, ry), deg = RIVER
        d = np.array([-math.sin(math.radians(deg)), math.cos(math.radians(deg))])
        for k, t in enumerate(COVERS):
            q = np.array([rx, ry]) + d * t
            X.decal("ground_iron", self.Gp(*q), d, 0.62, 0.62, uv=A.uv(f"manhole{k % 3}"), h=H.LIFT + 0.02)
        if not self.deck:
            return
        poly = max((p for p, _, _ in self.deck), key=lambda p: p.area)
        co = np.asarray(poly.exterior.coords)
        e = max(((co[i], co[i + 1]) for i in range(len(co) - 1)), key=lambda ab: np.linalg.norm(ab[1] - ab[0]))
        a, b = (e[0], e[1]) if e[0][0] < e[1][0] else (e[1], e[0])
        t = unit(b - a)
        out = np.array([t[1], -t[0]])
        if poly.contains(Point(*((a + b) / 2 + out))):
            out = -out
        (u0, u1), (v0, v1) = PLANK_U, (PLANK_V[0], 0.0)      # (not across the forecourt's planks, here or the hall's)
        n = 0
        for s_ in np.arange(0.25, np.linalg.norm(b - a), 0.5):
            q = a + t * s_ + out * 0.35
            if (np.hypot(*(q - np.asarray(CENTRE))) > R - 1 or not self.pave.contains(Point(*q)) or self.solids.distance(Point(*q)) < 0.6
                    or any(np.hypot(q[0] - x, q[1] - y) < COLLAR_R + 0.5 for x, y, _ in self.pier_at)):
                continue
            X.decal("ground_iron", self.Gp(*q), t, 0.25, 0.5, uv=A.uv("grate"), h=H.LIFT + 0.02)
            n += 1
        print(f"drains: {len(COVERS)} covers, {n * 0.5:.0f} m of grating")


def build(K):
    """(geo, atlas, materials, meta) for blender/build_hero.py."""
    L = Level(K)
    geo, atlas = L.build()
    M = materials()
    # (the blocks: a mid grey beside the forecourt's planks, 128 to 168. At 150 they stood pale under the evening's lamps,
    # "washed out" in frame 6's wide view, issue 124; the ground there in 2024 is dark asphalt)
    for mat, key, srgb in (("ground_paver", "paver", (122, 122, 121)),
                           ("ground_kerb", "granite", (160, 160, 158)), ("ground_gutter", "conc", (152, 152, 150)),
                           ("wall_white", "tile", (192, 192, 188)), ("wall_cream", "tile", (190, 180, 164)), ("wall_grey", "clad", (158, 160, 162)),
                           ("wall_clad", "clad", (176, 180, 184)), ("wall_char", "clad", (62, 64, 68)),
                           ("stone_collar", "granite", (96, 96, 98)),
                           ("ground_plank", "granite", (150, 150, 150)), ("ground_plank_dark", "granite", (128, 129, 131)),
                           ("ground_plank_pale", "granite", (168, 167, 165))):
        M[mat]["tint"] = K.tint_to(key, srgb)
    meta = {"id": ID, "at": list(CENTRE), "r": R, "z": 16.0, "glb": f"hero/{ID}.glb", "bake_gain": 1.0, "cell": 24.0,
            "sky_rays": 20, "sky_reach": 9.0, "sky_strength": 1.0}
    meta["lift"] = H.LIFT + 0.01
    meta["posts"] = [[round(float(q[0]), 1), round(float(q[1]), 1)] for q in L.lamp_at] + [[round(float(q[0]), 2), round(float(q[1]), 2)] for q in L.fence]
    print("game.hero:", json.dumps({"lift": meta["lift"], "posts": meta["posts"]}))
    return geo, atlas, M, meta
