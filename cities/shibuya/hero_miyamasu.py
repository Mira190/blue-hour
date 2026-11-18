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
    linear lights between them, the box girders along its edges clad in white panels; its piers as round steel
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

ID = "miyamasu"
CENTRE = (512.0, -1052.0)
R = 50.0
STATION = {"w810356690"}                 # the Ginza line's station over the east exit (pipeline/stations.py UNDERSIDE)
GIRDER_EVERY, GIRDER_D, GIRDER_W = 3.0, 0.72, 0.42   # cross girders: spacing, depth under the deck, flange width (m)
EDGE_D, EDGE_UP = 1.15, 1.4              # the edge box girders' cladding: below the deck, above it
PIER_R, COLLAR_R, HEAD_R = 0.68, 0.8, 1.02   # a pier's shaft (round over the city's 0.9 m square one), its collar, its head


def materials():
    M = H.materials()
    M.update({
        # the deck's underside and its girders: steel painted a warm pale grey, as Tokyo Metro's new stations are
        "steel_soffit": {"color": (0.36, 0.365, 0.37), "rough": 0.62, "metal": 0.1},
        "steel_girder": {"color": (0.48, 0.485, 0.49), "rough": 0.5, "metal": 0.15},
        "clad_white": {"tex": "clad", "maps": "cn", "rough": 0.4, "metal": 0.3},
        "steel_pier": {"color": (0.56, 0.565, 0.57), "rough": 0.42, "metal": 0.2},
        "stone_collar": {"tex": "granite", "maps": "cn", "rough": 0.45},
        # the linear lights between the girders: on as dusk falls (hero.js lamp*), their light on the street baked
        "lamp_soffit": {"color": (0.95, 0.96, 0.98), "emissive": (1.0, 0.95, 0.88), "glow": 2.0},
    })
    return M


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

    def __init__(self, K):
        from shapely.geometry import Point
        from shapely.ops import unary_union
        super().__init__(K, CENTRE, R)
        self.deck = _station(self.D)
        self.over = unary_union([p for p, _, _ in self.deck]) if self.deck else None
        self.scramble = Point(*H.CENTRE).buffer(H.R + 15)
        B = json.load(open(os.path.join(ROOT, "web", "data", "shibuya", "buildings.json")))
        si = {s["si"] for _, _, s in self.deck}
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
        self.carriageway()
        self.markings()
        self.pavements()
        self.tactile()
        self.guards()
        self.lamps()
        self.fronts()
        self.underside()
        self.piers()
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
        linear light in every second bay, and the box girders along its edges clad in white panels. All of it hangs
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
                           emit=((1.0, 0.94, 0.86), 30.0))
                    n_l += 1
            # the edge girders, clad: white panels 1.8 m wide with an open joint, from the girders' foot to above the
            # deck, standing 0.12 m out from the city's wall; their underside closed back to the soffit
            ring = np.asarray(poly.exterior.coords)[:-1]
            if poly.exterior.is_ccw:
                ring = ring[::-1]
            rep = self.K.TEXTURES["clad"][1]
            for i in range(len(ring)):
                a, b = ring[i], ring[(i + 1) % len(ring)]
                Ln = float(np.linalg.norm(b - a))
                mid = (a + b) / 2
                if Ln < 1.5 or not reach.contains(Point(*mid)):
                    continue
                F = PT.Frame(b, a)
                PT.fbox(G, "clad_white", F, -0.12, Ln + 0.12, 0.0, 0.12, zs - EDGE_D, zs + EDGE_UP, rep, faces=("front", "bottom", "top", "left", "right"))
                G.walls.append((a, b, zs - EDGE_D, zs + EDGE_UP))
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
            G.walls.append((np.array([x - PIER_R, y]), np.array([x + PIER_R, y]), g, top))
            G.walls.append((np.array([x, y - PIER_R]), np.array([x, y + PIER_R]), g, top))
            n += 1
        print(f"piers: {n} clad")


def build(K):
    """(geo, atlas, materials, meta) for blender/build_hero.py."""
    L = Level(K)
    geo, atlas = L.build()
    M = materials()
    for mat, key, srgb in (("ground_paver", "paver", (150, 150, 148)),
                           ("ground_kerb", "granite", (160, 160, 158)), ("ground_gutter", "conc", (152, 152, 150)),
                           ("wall_white", "tile", (192, 192, 188)), ("wall_cream", "tile", (190, 180, 164)), ("wall_grey", "clad", (158, 160, 162)),
                           ("wall_clad", "clad", (176, 180, 184)), ("wall_char", "clad", (62, 64, 68)),
                           ("clad_white", "clad", (206, 208, 208)), ("stone_collar", "granite", (96, 96, 98))):
        M[mat]["tint"] = K.tint_to(key, srgb)
    meta = {"id": ID, "at": list(CENTRE), "r": R, "z": 16.0, "glb": f"hero/{ID}.glb", "bake_gain": 1.0, "cell": 24.0,
            "sky_rays": 20, "sky_reach": 9.0, "sky_strength": 1.0}
    meta["lift"] = H.LIFT + 0.01
    meta["posts"] = [[round(float(q[0]), 1), round(float(q[1]), 1)] for q in L.lamp_at]
    print("game.hero:", json.dumps({"lift": meta["lift"], "posts": meta["posts"]}))
    return geo, atlas, M, meta
