"""Shibuya's scramble at street level (#111): the street and the things on it, at their measured sizes.

cities/shibuya/city.py builds the crossing's landmarks; this module adds what a walker sees round the
scramble, from OpenStreetMap's hand-mapped detail (cities/shibuya/scramble_osm.json,
pipeline/osm_detail.py), GSI's aerial photo (zoom 18, tools/aerial_local.py) and photographs:

  * the crosswalks at their real widths and positions, read off the aerial photo (OSM's lines are
    the walkers' paths, not the paint), with 45 cm bars and 45 cm gaps; the stop lines in front of
    them; the junction's asphalt laid over the game's street texture, so no lane line runs through
    the scramble;
  * the underground's entrances (A5a ... A7b, 8): stairs going down under a flat roof on steel and
    glass, each with its exit's sign, where OSM maps the entrance and its little building;

Everything is built in the city's local frame (x east, y north, z up, metres). Sizes that are not
published are estimates from photographs and are marked so.
"""
import json
import math
import os

import numpy as np
from shapely.geometry import LineString, Point, Polygon

import adkit as ad
import archkit as ak
from japankit import Atlas

HERE = os.path.dirname(os.path.abspath(__file__))
ATLAS_FILE = "scramble.jpg"


def _sibling(name):
    """A module next to this one (this folder is not on sys.path): streets.py, the streets off the scramble."""
    import importlib.util
    spec = importlib.util.spec_from_file_location(f"shibuya_{name}", os.path.join(HERE, f"{name}.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


streets = _sibling("streets")

MATERIALS = {
    # the junction's asphalt, laid over the ground (dark, a little worn; the game's street texture under it)
    "x_asphalt": {"color": "#4b4e52", "roughness": 0.93, "metalness": 0.0, "pattern": "granite", "joints_m": [0, 0], "decal": True, "street_lit": True},
    # road paint: thermoplastic, a little glass bead in it (paler and rougher than a sign)
    "x_paint": {"color": "#e4e2da", "roughness": 0.62, "metalness": 0.0, "decal": True, "street_lit": True},
    # the entrances: aluminium panels, the steel frame, the glass, the stairs' granite and the well's tiles
    # (panels 0.9 m wide with their joints: a plain pale box read as a model with no texture on it)
    "x_panel": {"color": "#a9aeb3", "roughness": 0.46, "metalness": 0.5, "pattern": "granite", "joints_m": [0.9, 0.0]},
    "x_frame": {"color": "#55595e", "roughness": 0.45, "metalness": 0.6},
    "x_glass": {"color": "#1c2529", "roughness": 0.04, "metalness": 0.2, "opacity": 0.16},
    "x_tread": {"color": "#8e8a84", "roughness": 0.85, "metalness": 0.0, "pattern": "granite", "joints_m": [0.6, 0.0], "stair": "tread"},
    "x_riser": {"color": "#7d7a75", "roughness": 0.85, "metalness": 0.0, "pattern": "granite", "joints_m": [0.6, 0.0], "stair": "riser"},
    "x_tile": {"color": "#d9d6cf", "roughness": 0.5, "metalness": 0.0, "pattern": "granite", "joints_m": [0.3, 0.15]},
    "x_dark": {"color": "#1d1e20", "roughness": 0.9, "metalness": 0.0},
    "x_tactile": {"color": "#e1b20f", "roughness": 0.7, "metalness": 0.0, "pattern": "granite", "joints_m": [0.3, 0.1], "decal": True},
    "x_tactile_dot": {"color": "#e8b711", "roughness": 0.7, "metalness": 0.0, "pattern": "granite", "joints_m": [0.075, 0.075], "decal": True},
    "x_rail": {"color": "#b7bcc0", "roughness": 0.3, "metalness": 0.8},
    "x_guard": {"color": "#eeeeea", "roughness": 0.45, "metalness": 0.2},
    "x_light": {"color": "#f3f1ea", "roughness": 0.5, "metalness": 0.0, "emissive": "#fff4e0", "glow": 2.4},
    # the drawn signs (this module's own atlas, scramble.jpg), lit after dark
    # the JR lines' bed: retaining walls of concrete, the girder bridge's steel (painted grey), ballast, rails
    "x_jr_wall": {"color": "#a7a39a", "roughness": 0.9, "metalness": 0.0, "pattern": "granite", "joints_m": [5.0, 0.0]},
    "x_jr_concrete": {"color": "#bab6ad", "roughness": 0.9, "metalness": 0.0},
    "x_jr_steel": {"color": "#727a80", "roughness": 0.55, "metalness": 0.45},
    "x_ballast": {"color": "#6f6a63", "roughness": 1.0, "metalness": 0.0, "pattern": "granite", "joints_m": [0, 0]},
    "x_sleeper": {"color": "#9a968e", "roughness": 0.9, "metalness": 0.0},
    "x_rail_steel": {"color": "#8a8580", "roughness": 0.35, "metalness": 0.85},
    "x_wire": {"color": "#26292c", "roughness": 0.6, "metalness": 0.4},
    # QFRONT: its silver fins and panels, the shopfronts lit from inside, the crown's roof
    "x_fin": {"color": "#a9afb5", "roughness": 0.35, "metalness": 0.7},
    "x_qf_glass": {"color": "#4a565e", "roughness": 0.04, "metalness": 0.85, "opacity": 0.5},
    "x_qf_panel": {"color": "#cfd2d5", "roughness": 0.45, "metalness": 0.5},
    "x_qf_roof": {"color": "#6d7176", "roughness": 0.8, "metalness": 0.2},
    "x_shop": {"color": "#59616a", "roughness": 0.12, "metalness": 0.3, "pattern": "curtain_wall", "bay_m": 2.4, "storey_m": 4.8, "spandrel": 0.04,
               "mullion_m": 0.08, "frame": "#30343a", "lit_share": 0.9, "lit_k": 0.8, "warm_share": 0.8},
    # QFRONT's floors behind the outer skin (as city.py's qfront_glass)
    "qfront_glass": {"color": "#2b3741", "roughness": 0.12, "metalness": 0.35, "pattern": "curtain_wall", "bay_m": 1.8, "storey_m": 4.6,
                     "spandrel": 0.1, "mullion_m": 0.09, "frame": "#a9b3bb", "lit_share": 0.55, "lit_k": 0.6},
    # SHIBUYA109's aluminium panels: horizontal joints every 0.9 m, vertical every 1.8 m (photographs)
    "x_alu": {"color": "#b9bdc1", "roughness": 0.38, "metalness": 0.6, "pattern": "granite", "joints_m": [1.8, 0.9]},
    # printed adverts lit from outside by lamps: dimmer after dark than a lit box
    "x_print": {"color": "#ffffff", "roughness": 0.7, "metalness": 0.0, "map": ATLAS_FILE, "emissive_map": True, "glow": 0.5},
    "x_station": {"color": "#c9ccce", "roughness": 0.6, "metalness": 0.2, "pattern": "granite", "joints_m": [1.5, 3.6]},
    "x_koban": {"color": "#d8d4cb", "roughness": 0.7, "metalness": 0.0, "pattern": "granite", "joints_m": [0.3, 0.6]},
    "x_red_lamp": {"color": "#d0201a", "roughness": 0.3, "metalness": 0.0, "emissive": "#ff2010", "glow": 3.0},
    # a white grid of mullions and floor bands over a building's glass (city windows lit behind it after dark)
    "x_skin": {"color": "#3a4650", "roughness": 0.15, "metalness": 0.3, "pattern": "curtain_wall", "bay_m": 1.7, "storey_m": 3.4, "spandrel": 0.3,
               "mullion_m": 0.22, "frame": "#ecebe6", "lit_share": 0.6, "lit_k": 0.9, "warm_share": 0.5},
    "x_gate": {"color": "#7c8086", "roughness": 0.5, "metalness": 0.55},
    "x_fence": {"color": "#6f757b", "roughness": 0.5, "metalness": 0.6, "pattern": "railing", "bar_m": 0.1, "rails_m": [0.05, 1.75]},
    "x_tyre": {"color": "#1b1b1c", "roughness": 0.8, "metalness": 0.0},
    "x_bike_silver": {"color": "#b4b8bc", "roughness": 0.35, "metalness": 0.7},
    "x_bike_black": {"color": "#26282b", "roughness": 0.5, "metalness": 0.3},
    "x_bike_white": {"color": "#e8e8e4", "roughness": 0.45, "metalness": 0.2},
    "x_bike_red": {"color": "#a8262a", "roughness": 0.45, "metalness": 0.3},
    "x_atlas": {"color": "#ffffff", "roughness": 0.6, "metalness": 0.0, "map": ATLAS_FILE, "emissive_map": True, "glow": 1.3},
    # the bookshop on Center Gai's corner: white clapboard, its blue awning and trim, the sign box's white sides
    "x_clap": {"color": "#ecebe6", "roughness": 0.7, "metalness": 0.0, "pattern": "granite", "joints_m": [0.0, 0.2]},
    "x_bk_blue": {"color": "#1f45a8", "roughness": 0.65, "metalness": 0.0},
    "x_bk_box": {"color": "#f1f1ee", "roughness": 0.5, "metalness": 0.1},
    # its box sign's face: the atlas as the other signs', lit at its own level. A white light box is the largest lit
    # area round the crossing; at the signs' common 1.3 it was the brightest thing in a frame by stops, its white
    # clipped, its haze over everything near it and its blue name washed pale. A diffuser lit from inside sits
    # some two to three stops over the street's fronts in a photograph of the corner at dusk, with its name the
    # deep blue it is printed in: 0.68
    "x_bk_sign": {"color": "#ffffff", "roughness": 0.6, "metalness": 0.0, "map": ATLAS_FILE, "emissive_map": True, "glow": 0.68},
    # the station's way in from Hachiko Square (HACHIKO_EXIT): a passage lit by its own lamps by day as by night, so its
    # surfaces glow a little at both (glow_day), as a lit room seen from the street does; its white works panels with
    # their joints, the ceiling's panels, the floor's non-slip tiles, the LED fittings and its signs, lit from inside
    # (by night brighter than by day: its lamps against the dark, and over the blue fill light the player carries)
    "x_pass_wall": {"color": "#e4e4df", "roughness": 0.55, "metalness": 0.1, "pattern": "granite", "joints_m": [0.9, 0.0], "emissive": "#eef0ec", "glow": 0.6, "glow_day": 0.3},
    "x_pass_ceil": {"color": "#dadad5", "roughness": 0.7, "metalness": 0.0, "pattern": "granite", "joints_m": [0.6, 0.6], "emissive": "#eef0ec", "glow": 0.48, "glow_day": 0.24},
    # (its floor is stood on as drawn, "pave": navcells.js. It is laid on the game's ground at the height the Scramble's paving
    # is outside, and a walker inside stood at the ground's own height, 27 cm under the floor where it had been laid level
    # and 4.6 cm under the setts at the threshold, where the level's paving stops at the station's front)
    "x_pass_floor": {"color": "#9e9c96", "roughness": 0.42, "metalness": 0.0, "pattern": "granite", "joints_m": [0.3, 0.3], "emissive": "#e6e7e3", "glow": 0.32, "glow_day": 0.14, "pave": True},
    "x_pass_lamp": {"color": "#f4f6f4", "roughness": 0.4, "metalness": 0.0, "emissive": "#f3f6ff", "glow": 2.2, "glow_day": 2.2},
    "x_pass_sign": {"color": "#ffffff", "roughness": 0.5, "metalness": 0.0, "map": ATLAS_FILE, "emissive_map": True, "glow": 1.0, "glow_day": 0.55},
    # its guide line: the street's tactile blocks, but its own (the Scramble's hero level hides the landmark's paving and
    # draws its own, and took the passage's with it), lit as the floor is
    "x_pass_gate": {"color": "#d5d8db", "roughness": 0.4, "metalness": 0.1, "emissive": "#eef0ec", "glow": 0.32, "glow_day": 0.16},   # the gate's cabinets: pale panels
    "x_pass_tactile": {"color": "#e1b20f", "roughness": 0.7, "metalness": 0.0, "pattern": "granite", "joints_m": [0.3, 0.1], "emissive": "#f0c43a", "glow": 0.3, "glow_day": 0.14},
    "x_pass_tactile_dot": {"color": "#e8b711", "roughness": 0.7, "metalness": 0.0, "pattern": "granite", "joints_m": [0.075, 0.075], "emissive": "#f0c43a", "glow": 0.3, "glow_day": 0.14},
}
MATERIALS.update(streets.MATERIALS)
LIT = {"x_light", "x_atlas", "x_print", "x_red_lamp", "x_bk_sign", "x_pass_wall", "x_pass_ceil", "x_pass_floor", "x_pass_lamp", "x_pass_sign", "x_pass_tactile", "x_pass_tactile_dot", "x_pass_gate"}


# ---------------------------------------------------------------- data

class Data:
    """OSM's detail round the scramble in the local frame, and the built city's solids."""

    def __init__(self, city_id):
        import cityctx
        self.C = cityctx.City(city_id)
        self.T = ak.Terrain(city_id)
        self.solids = ak.load_solids(city_id)
        raw = json.load(open(os.path.join(HERE, "scramble_osm.json"), encoding="utf8"))
        fwd = self.C.fwd.transform
        self.nodes = [dict(n, xy=np.array(fwd(*n["ll"]))) for n in raw["nodes"]]
        self.ways = [dict(w, xy=[np.array(fwd(*p)) for p in w["ll"]]) for w in raw["ways"]]
        self.by_id = {n["id"]: n for n in self.nodes}
        G = json.load(open(os.path.join(self.C.out, "game.json")))
        self.roads = [(r["c"], [(r["p"][k] / 10, r["p"][k + 1] / 10, r["p"][k + 2] / 10) for k in range(0, len(r["p"]), 3)]) for r in G["paths"]["road"]]
        self.pieces = G["paths"]["road"]   # (as the game has them: their one-ways and the widths they carry)
        self.foot = [[(r["p"][k] / 10, r["p"][k + 1] / 10) for k in range(0, len(r["p"]), 3)] for r in G["paths"]["foot"]]   # (the lines the crowd walks)

    def ground(self, x, y):
        # (the ground the game draws, outside the hero levels: pipeline/levels.py Standing)
        if getattr(self, "_stand", None) is None:
            import levels
            self._stand = levels.Standing(self.C.id, self.T)
        return self._stand(x, y)


def unit(v):
    v = np.asarray(v, float)
    return v / (np.linalg.norm(v) or 1.0)


def frame(o, f):
    """(u, v, z) -> local point: u along f from o, v to its left, z absolute."""
    o, f = np.asarray(o, float)[:2], unit(f)[:2]
    l = np.array([-f[1], f[0]])
    return lambda u, v, z: np.array([o[0] + f[0] * u + l[0] * v, o[1] + f[1] * u + l[1] * v, z])


def box(m, P, u0, u1, v0, v1, z0, z1, uvm=False):
    """A box in frame P, faces wound outward; with uvm, texture coordinates in metres along each face."""
    c = [P(u, v, z) for z in (z0, z1) for v in (v0, v1) for u in (u0, u1)]
    du, dv, dz = u1 - u0, v1 - v0, z1 - z0
    faces = ((0, 2, 3, 1, du, dv), (4, 5, 7, 6, du, dv), (0, 1, 5, 4, du, dz), (2, 6, 7, 3, dz, du), (0, 4, 6, 2, dz, dv), (1, 3, 7, 5, dv, dz))
    for a, b, cc, d, w, h in faces:
        m.quad(c[a], c[b], c[cc], c[d], [[0, 0], [w, 0], [w, h], [0, h]] if uvm else None)


def flat(m, pts, z, uvm=True):
    """A flat polygon (convex or star-shaped from its first vertex) at height z, facing up."""
    pts = [np.asarray(p, float) for p in pts]
    for k in range(1, len(pts) - 1):
        a, b, c = pts[0], pts[k], pts[k + 1]
        m.tri(np.array([*a, z]), np.array([*b, z]), np.array([*c, z]), [list(a), list(b), list(c)] if uvm else None)


# ---------------------------------------------------------------- the crosswalks

# Each crosswalk as the paint lies, measured on GSI's aerial photo (zoom 18) in the local frame: the
# walkers' line across the road (from, to) and the band's width across it. OSM's footway crossings
# run along their middles, but the scramble's are wider than the 4 m minimum: the diagonal and the
# two on the station side about 9 m, Dogenzaka's and Center Gai's 7 to 8 m. OSM's short crossing
# north of Center Gai's mouth is not painted. Bars 45 cm wide with 45 cm gaps (the national standard,
# 道路標示 横断歩道: 45 cm bars, gaps of 45 to 90 cm), parallel to the traffic, so you step over them.
# The photograph gives each walk's line and width; its two ends are the surveyed kerbs' (fit_walk: PLATEAU's road
# model, issue 196), so `a` and `b` here are where to look, and crosswalk_list(D) is what is painted.
CROSSWALKS = [
    {"id": "diagonal", "a": [358.4, -985.9], "b": [376.0, -1012.6], "width": 9.4, "inside": 1},   # QFRONT to Hachiko: across the junction's middle, no arm's
    {"id": "north", "a": [366.9, -979.5], "b": [381.6, -982.5], "width": 9.2},       # QFRONT to MAGNET, across Bunkamura-dori's end
    {"id": "east", "a": [385.2, -1011.1], "b": [387.6, -994.8], "width": 9.0},       # MAGNET to Hachiko, across the road under the tracks
    {"id": "south", "a": [343.8, -1013.7], "b": [368.9, -1018.9], "width": 7.8},     # Hachiko to the Ekimae building, across Dogenzaka's foot
    {"id": "west", "a": [338.9, -987.1], "b": [335.5, -1004.5], "width": 7.2},       # Center Gai's corner to the Ekimae building
]
BAR, GAP = 0.45, 0.45
STOP_W, STOP_BACK = 0.45, 2.0   # the stop line: 45 cm wide (30 to 45 cm), about 2 m before the crosswalk (estimate)


def crosswalk_poly(c):
    a, b = np.asarray(c["a"], float), np.asarray(c["b"], float)
    f = unit(b - a)
    l = np.array([-f[1], f[0]]) * c["width"] / 2
    return [a - l, b - l, b + l, a + l]


ROADW = {"motorway": 14, "trunk": 12, "primary": 12, "secondary": 10, "tertiary": 9, "residential": 7, "unclassified": 6, "living_street": 5}  # as web/game/game.js
WALK_REACH = 10.0     # how far past a crosswalk's measured end its kerb is looked for
ZEBRA_W = 4.0         # a crossing OpenStreetMap maps and the photograph was not measured for: the standard's least width
ZEBRA_TAGS = ("traffic_signals", "marked", "uncontrolled", "zebra")


def road_bands(D):
    """The carriageway round the Scramble: the survey's own polygons (pipeline/road_ground.py: PLATEAU's road model,
    the carriageways and junctions a road piece runs through), and a piece's band only where the survey has no
    ground. Until issue 196 it was every piece's band at its class's width, which drew Dogenzaka-shita 9 m wide
    where it is 16.6 m, and an island down the middle of the road south of the junction that is not there."""
    if not hasattr(D, "_bands"):
        import road_ground
        D.surface = road_ground.Surface(D.C.id, D.pieces, D.ground, foot=[LineString(f) for f in D.foot if len(f) > 1])
        D._bands = D.surface.carriageway(clip=Point(*HERO_CENTRE).buffer(420.0))
    return D._bands


def _chord(area, mid, f, half):
    """The stretch of the line through `mid` along `f` that lies on `area` and holds `mid` (or is nearest it), as
    (t0, t1) along f from mid; None where the line meets none of it."""
    line = LineString([mid - f * half, mid + f * half])
    best = None
    for g in lines_of(line.intersection(area)):
        t = (g - mid) @ f
        t0, t1 = float(t.min()), float(t.max())
        d = 0.0 if t0 <= 0 <= t1 else min(abs(t0), abs(t1))
        if best is None or d < best[0]:
            best = (d, t0, t1)
    return best and best[1:]


def fit_walk(c, area):
    """A crosswalk as measured off the photograph, its ends taken to the surveyed kerbs: `a` and `b` where its middle
    line meets them, and `lay`, how far along a to b its bars are laid so that both its edges reach a kerb that
    runs askew (the paint is cut to the asphalt). `moved`: how far each end went."""
    a, b = np.asarray(c["a"], float), np.asarray(c["b"], float)
    f = unit(b - a)
    l = np.array([-f[1], f[0]])
    mid, L = (a + b) / 2, float(np.linalg.norm(b - a))
    ch = [_chord(area, mid + l * k * c["width"] * 0.45, f, L / 2 + WALK_REACH) for k in (0, -1, 1)]
    if ch[0] is None:
        return dict(c, lay=(0.0, L), moved=(0.0, 0.0))
    t0, t1 = ch[0]
    na, nb = mid + f * t0, mid + f * t1
    lo = min(t[0] for t in ch if t) - t0
    hi = max(t[1] for t in ch if t) - t0
    return dict(c, a=[float(na[0]), float(na[1])], b=[float(nb[0]), float(nb[1])], lay=(float(lo), float(hi)),
                moved=(round(float(np.linalg.norm(na - a)), 2), round(float(np.linalg.norm(nb - b)), 2)), drawn=(c["a"], c["b"]))


def crosswalk_list(D):
    """The five crosswalks, kerb to kerb as surveyed."""
    if not hasattr(D, "_walks"):
        area = road_bands(D)
        D._walks = [fit_walk(c, area) for c in CROSSWALKS]
    return D._walks


def zebras(D, disc=None):
    """The other crossings OpenStreetMap maps as marked round the Scramble (a way tagged footway=crossing with
    signals or marks), each a zebra across the surveyed carriageway where the way crosses it, ZEBRA_W wide: Koen-dori's
    foot, under Mark City, the back streets' mouths. Not the five, and not a crossing inside the junction's own floor
    (OpenStreetMap's short crossing north of Center Gai's mouth is not painted). The fetch keeps a way's `crossing`
    and not its `footway=crossing`."""
    if not hasattr(D, "_zebras"):
        area = road_bands(D)
        five = [Polygon(crosswalk_poly(c)).buffer(3.0) for c in crosswalk_list(D)]
        hull = Polygon([p for c in crosswalk_list(D) for p in crosswalk_poly(c)]).convex_hull.buffer(2.0)
        out = []
        for w in D.ways:
            t = w.get("tags", {})
            if t.get("highway") != "footway" or t.get("crossing") not in ZEBRA_TAGS or len(w["xy"]) < 2 or t.get("layer") or t.get("tunnel") or t.get("bridge"):
                continue
            ln = LineString(w["xy"])
            if ln.distance(Point(*HERO_CENTRE)) > 130.0 or any(q.intersects(ln) for q in five) or hull.contains(ln.centroid):
                continue
            a, b = np.asarray(w["xy"][0], float), np.asarray(w["xy"][-1], float)
            if np.linalg.norm(b - a) < 2.0:
                continue
            f = unit(b - a)
            ch = _chord(area, (a + b) / 2, f, float(np.linalg.norm(b - a)) / 2 + 4.0)
            if ch is None or ch[1] - ch[0] < 3.0 or ch[1] - ch[0] > 34.0:
                continue
            c = fit_walk({"id": f"w{w['id']}", "a": list((a + b) / 2 + f * ch[0]), "b": list((a + b) / 2 + f * ch[1]), "width": ZEBRA_W}, area)
            if any(Polygon(crosswalk_poly(c)).intersects(Polygon(crosswalk_poly(o))) for o in out):
                continue
            out.append(c)
        D._zebras = out
    # (a level paints the ones that lie whole inside it: past its rim the map's own drawing has the crossing)
    return D._zebras if disc is None else [c for c in D._zebras if disc.buffer(-2.0).contains(Polygon(crosswalk_poly(c)))]


def walk_bars(c):
    """Each bar of a crosswalk as the ends of its middle line across the walk: along the traffic (you step over
    them), 45 cm wide with 45 cm gaps, laid from kerb to kerb."""
    a, b = np.asarray(c["a"], float), np.asarray(c["b"], float)
    f = unit(b - a)
    l = np.array([-f[1], f[0]]) * c["width"] / 2
    lo, hi = c.get("lay", (0.0, float(np.linalg.norm(b - a))))
    L = hi - lo
    n = int((L - 0.6) // (BAR + GAP))
    u0 = lo + (L - (n * (BAR + GAP) - GAP)) / 2
    return [(a + f * (u0 + k * (BAR + GAP) + BAR / 2) - l, a + f * (u0 + k * (BAR + GAP) + BAR / 2) + l) for k in range(n)]


def stop_line(D, c, centre):
    """Where the traffic coming in to a crosswalk stops: (p, q, lanes, out, left), the line's ends, a point in each
    lane's middle, the way out of the junction and the incoming driver's left; None where nothing comes in. Read
    from the road pieces that cross it (their one-ways) on the surveyed carriageway: from the line that divides the
    two ways (a two-way piece's own, or half way between the pieces in and out) to the left kerb, Japan keeping left;
    the whole width where every piece comes in."""
    if c.get("inside"):
        return None
    a, b = np.asarray(c["a"], float), np.asarray(c["b"], float)
    f = unit(b - a)
    o = np.array([-f[1], f[0]])
    mid = (a + b) / 2
    if (mid - centre) @ o < 0:
        o = -o                                       # outward, away from the junction
    left = np.array([o[1], -o[0]])                   # the left of a driver coming in (heading -o)
    back = mid + o * (c["width"] / 2 + STOP_BACK + STOP_W / 2)
    ch = _chord(road_bands(D), back, left, float(np.linalg.norm(b - a)) / 2 + 6.0)
    if ch is None:
        return None
    u0, u1 = ch
    line = LineString([back + left * u0, back + left * u1])
    ins, outs, both = [], [], []
    for piece, ln in zip(D.surface.pieces, D.surface.lines):
        if piece.get("x") or not ln.intersects(line):
            continue
        x = ln.intersection(line)
        g = x if x.geom_type == "Point" else x.centroid
        s = ln.project(g)
        h = np.subtract(ln.interpolate(min(ln.length, s + 1)).coords[0], ln.interpolate(max(0, s - 1)).coords[0])
        u = float((np.array([g.x, g.y]) - back) @ left)
        way = piece.get("o", 0)
        if not way:
            both.append(u)
        elif (h @ -o) * way > 0:
            ins.append(u)
        else:
            outs.append(u)
    if both:
        div = float(np.mean(both))
    elif ins and outs:
        div = (max(outs) + min(ins)) / 2
    elif ins:
        div = u0 - 0.15
    else:
        return None
    w = u1 - div
    if w < 2.4:
        return None
    n = max(1, int(w // 3.1))
    return back + left * (div + 0.15), back + left * (u1 - 0.5), [back + left * (div + (k + 0.5) * w / n) for k in range(n)], o, left


def junction_area(D):
    """The scramble's floor: the surveyed carriageway inside the hull of the five crosswalks, which the asphalt
    covers over the game's street texture (so no lane line runs through it)."""
    hull = Polygon([p for c in crosswalk_list(D) for p in crosswalk_poly(c)]).convex_hull
    area = road_bands(D).intersection(hull.buffer(0.3, join_style=2))
    return max(getattr(area, "geoms", [area]), key=lambda g: g.area)   # (a sliver of a neighbouring carriageway inside the hull dropped)


def ground_polygon(m, area, gz, z_off, cell=2.0):
    """A polygon laid on the ground: cut into a grid of cells, each triangulated, every vertex on the ground."""
    from shapely.geometry import box as sbox
    from shapely.ops import triangulate
    x0, y0, x1, y1 = area.bounds
    for gx in np.arange(x0, x1, cell):
        for gy in np.arange(y0, y1, cell):
            piece = area.intersection(sbox(gx, gy, gx + cell, gy + cell))
            if piece.is_empty:
                continue
            for poly in getattr(piece, "geoms", [piece]):
                if poly.geom_type != "Polygon" or poly.area < 1e-4:
                    continue
                for tri in triangulate(poly):
                    if not poly.buffer(1e-6).contains(tri.centroid):
                        continue
                    q = list(tri.exterior.coords)[:3]
                    a, b, c = (np.array([x, y, gz((x, y)) + z_off]) for x, y in q)
                    if np.cross(b - a, c - a)[2] < 0:
                        b, c = c, b
                    m.tri(a, b, c, [list(a[:2]), list(b[:2]), list(c[:2])])


def paint_strip(m, gz, a, b, w, z_off=0.045, n=None):
    """A painted strip from a to b, w wide, in pieces that follow the ground."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    f = unit(b - a)
    l = np.array([-f[1], f[0]]) * w / 2
    n = n or max(1, int(np.linalg.norm(b - a) // 2.5) + 1)
    for k in range(n):
        p, q = a + (b - a) * k / n, a + (b - a) * (k + 1) / n
        pts = [p - l, q - l, q + l, p + l]
        m.quad(*[np.array([*x, gz(x) + z_off]) for x in pts])


def crosswalks(K, D, node):
    paint, asphalt = K["x_paint"], K["x_asphalt"]
    gz = lambda p: D.ground(*p)
    area = junction_area(D)
    ground_polygon(asphalt, area, gz, 0.03)
    walks = crosswalk_list(D)
    centre = np.mean([np.asarray(c["a"]) + np.asarray(c["b"]) for c in walks], axis=0) / 2
    bands = road_bands(D)
    for cw in walks:
        st = stop_line(D, cw, centre)
        if st is None:
            continue
        p, q, lanes, o, drv_left = st
        paint_strip(paint, gz, p, q, STOP_W)
        # the diamonds that warn of the crosswalk ahead (横断歩道又は自転車横断帯あり), 30 m and 50 m back, one per lane
        for c0 in lanes:
            for d in (30.0, 50.0):
                cc = c0 + o * d
                if not bands.contains(Point(*cc).buffer(1.0)):
                    continue
                pts = [cc + o * 2.5, cc + drv_left * 0.75, cc - o * 2.5, cc - drv_left * 0.75]
                for k in range(4):
                    paint_strip(paint, gz, pts[k], pts[(k + 1) % 4], 0.2, n=2)
    # the bars: along the traffic (across the walk), one every 90 cm across the walk's length, on the asphalt only
    lay = bands.buffer(-0.3)
    for cw in walks + zebras(D, Point(*HERO_CENTRE).buffer(HERO_R, 48)):
        for p, q in walk_bars(cw):
            for co in lines_of(LineString([p, q]).intersection(lay)):
                paint_strip(paint, gz, co[0], co[-1], BAR, n=3)


# The junction's plan, which the landmarks here and the hero level (hero.py) both draw from, so that what is
# drawn and what is solid are one thing: the carriageways, the pavements and the kerb between them.
HERO_CENTRE, HERO_R = (368.0, -1002.0), 100.0
KERB_M = 0.18
GUARD_NEAR = 62.0            # guard pipes within this of the junction's centre


class Plan:
    def __init__(self, D, wells=(), centre=HERO_CENTRE, r=HERO_R, standing=None):
        from shapely.ops import unary_union
        c = np.asarray(centre)
        self.centre, self.r = c, float(r)
        self.disc = Point(*c).buffer(r, 48)
        # what stands on the ground: not a deck or a bridge over it. (`base` is the underside over the ground and
        # `ground` the ground's height over the sea, so the test the Scramble was built with counts every solid as
        # standing; its plan is kept as built. A level that stands under a deck says what stands: `standing`.)
        standing = standing or (lambda s: s.get("base", 0) - s.get("ground", 0) < 2.5)
        near = [Polygon(s["ring"]).buffer(0) for s in D.solids if len(s["ring"]) >= 3 and np.linalg.norm(np.mean(s["ring"], axis=0) - c) < r + 120
                and standing(s)]
        self.solids = unary_union([p.buffer(0.12) for p in near if p.is_valid and p.area > 1]).intersection(self.disc.buffer(5))
        # the stair wells the entrances cut into the ground (the landmarks' clip rings)
        self.wells = unary_union([Polygon(q).buffer(0.25) for q in wells if len(q) >= 3])
        self.junction = junction_area(D)
        self.roads = unary_union([road_bands(D), self.junction]).intersection(self.disc).difference(self.solids).buffer(0)
        self.zebras = zebras(D, self.disc)
        self.walks = unary_union([Polygon(crosswalk_poly(cw)) for cw in crosswalk_list(D) + self.zebras])
        self.pave = self.disc.difference(self.roads.buffer(KERB_M)).difference(self.solids).difference(self.wells).buffer(0)
        # where walkers step off a crosswalk: its band carried 4 m past each end, a metre wider each side. Nothing
        # stands there (a guard pipe across a crosswalk's end is a fence across the crossing)
        mouths = []
        for cw in crosswalk_list(D) + self.zebras:
            a, b = np.asarray(cw["a"], float), np.asarray(cw["b"], float)
            f = unit(b - a)
            mouths.append(Polygon(crosswalk_poly({"a": a - f * 4.0, "b": b + f * 4.0, "width": cw["width"] + 2.0})))
        # ... and wherever else a mapped footway leaves the pavement for the carriageway (a crossing OSM maps that is
        # not one of the five, a path's end at a kerb): 2.5 m each side of the line, from 4 m before the kerb.
        # Japan's rule for these fences (防護柵の設置基準, 横断防止柵) is the same thing said from the road's side:
        # they stand where crossing is to be stopped, and are open at every crossing
        near = self.disc.buffer(20)
        for pts in D.foot:
            if len(pts) < 2:
                continue
            ln = LineString(pts)
            if not ln.intersects(near) or not ln.intersects(self.roads):
                continue
            mouths.append(ln.intersection(self.roads.buffer(4.0)).buffer(2.5))
        self.mouths = unary_union(mouths)
        self.footways = unary_union([LineString(pts) for pts in D.foot if len(pts) > 1 and LineString(pts).intersects(near)])


PLAN_FILE = os.path.join(HERE, "hero_plan.json")


def plan_rings(plan):
    """A plan's carriageway as [[ring, hole, ...], ...] in decimetres."""
    import road_ground
    return road_ground.rings(plan.roads, simplify=0.05)


def write_plan(plan, D, roads=None, own=None):
    """What a level was built from, kept beside it (cities/shibuya/hero_plan.json): its carriageway, what stands on
    its ground (no road is laid under it) and its crosswalks.
    tools/hero_survey_map.py --check holds the built level to the survey with it: a plan that has moved since (the
    survey fetched again, a piece's width, this file) is a level to build again."""
    key = f"{plan.centre[0]:.0f},{plan.centre[1]:.0f},{plan.r:.0f}"
    rec = json.load(open(PLAN_FILE, encoding="utf8")) if os.path.exists(PLAN_FILE) else {}
    walks = [c for c in crosswalk_list(D) if plan.disc.contains(Point(*c["a"]))] + plan.zebras
    import road_ground
    # (roads: the carriageway as the level lays it, where that is less than the plan's; own: floors the level lays itself
    # there, a hall's or a forecourt's, which are no road's whatever an older survey has under them)
    solids = plan.solids if own is None else plan.solids.union(own)
    rec[key] = {"roads": road_ground.rings(plan.roads if roads is None else roads, simplify=0.05), "solids": road_ground.rings(solids, simplify=0.2),
                "walks": [[round(v, 1) for v in (*c["a"], *c["b"], c["width"])] for c in walks]}
    json.dump(rec, open(PLAN_FILE, "w", encoding="utf8"), separators=(",", ":"), sort_keys=True)


def lines_of(geom):
    for g in getattr(geom, "geoms", [geom]):
        if g.geom_type == "LineString" and g.length > 0.3:
            yield np.asarray(g.coords)
        elif g.geom_type in ("MultiLineString", "GeometryCollection"):
            yield from lines_of(g)


def guard_runs(plan):
    """White guard pipes (ガードパイプ: posts every 2 m, 0.8 m high, two rails) along the kerbs between the
    crosswalks, on the pavement's side, as photographs show them on the Hachiko and station sides: each run as
    its posts' places. None where walkers step off a crosswalk, round a stair well, against a building or
    along QFRONT's forecourt, which has steel bollards."""
    runs = []
    for co in lines_of(plan.roads.buffer(KERB_M + 0.32).boundary.intersection(plan.pave)):
        seg = np.linalg.norm(np.diff(co, axis=0), axis=1)
        cum = np.r_[0.0, np.cumsum(seg)]
        n = int(cum[-1] // 2.0)
        run = []
        for i in range(n + 1):
            d = cum[-1] * i / max(n, 1)
            q = np.array([np.interp(d, cum, co[:, 0]), np.interp(d, cum, co[:, 1])])
            pt = Point(*q)
            ok = (np.linalg.norm(q - plan.centre) < GUARD_NEAR and not plan.mouths.contains(pt) and not (q[1] > -992.0 and q[0] < 372.0)
                  and plan.solids.distance(pt) > 1.4 and (plan.wells.is_empty or plan.wells.distance(pt) > 0.9))
            if ok:
                run.append(q)
            if (not ok or i == n) and run:
                if len(run) > 2:                 # (a fence is a run: not a post or two left between two openings)
                    runs.append(run)
                run = []
    return runs


def guard_rails(K, D, plan, near=40.0):
    """The guard pipes along the scramble's kerbs (guard_runs: solid here, and drawn finely by the hero level
    while it is shown), and short stainless bollards along QFRONT's forecourt, where the photographs show them."""
    white, steel = K["x_guard"], K["x_rail"]
    gz = lambda p: D.ground(*p)
    for run in guard_runs(plan):
        for c in run:
            white.tube([np.array([*c, gz(c)]), np.array([*c, gz(c) + 0.8])], 0.035, 6)
        for h in (0.42, 0.74):
            for p, q in zip(run[:-1], run[1:]):
                white.tube([np.array([*p, gz(p) + h]), np.array([*q, gz(q) + h])], 0.025, 6)
    from shapely.geometry.polygon import orient
    bands = road_bands(D)
    ring = np.asarray(orient(plan.junction, 1.0).exterior.coords)
    for a, b in zip(ring[:-1], ring[1:]):
        L = float(np.linalg.norm(b - a))
        if L < 0.5:
            continue
        f = (b - a) / L
        out = np.array([f[1], -f[0]])
        n = max(1, int(L // 2.0))
        for k in range(n):
            m = a + f * L * (k + 0.5) / n
            c = m + out * 0.45
            if not (m[1] > -992.0 and m[0] < 372.0) or np.linalg.norm(m - plan.centre) > near or plan.mouths.contains(Point(*c)) or bands.contains(Point(*(m + out * 1.2))):
                continue
            if any(Polygon(s_["ring"]).contains(Point(*(m + out * 0.6))) for s_ in D.solids if abs(s_["ring"][0][0] - m[0]) < 25 and abs(s_["ring"][0][1] - m[1]) < 25):
                continue
            lathe = [(gz(c), 0.09), (gz(c) + 0.75, 0.09), (gz(c) + 0.8, 0.06), (gz(c) + 0.82, 0.0)]
            steel.lathe([(float(z), float(r)) for z, r in lathe], (float(c[0]), float(c[1])), 10)


# ---------------------------------------------------------------- tactile paving

TACT = 0.3          # a block (JIS T 9251): 30 cm square
TACT_TURN = 25.0    # a bend (degrees) that gets a warning block at its corner; under it the line runs on, angled
TACT_SNAP = 14.0    # a mapped leg within this of the paving's grid is laid straight along it as it is
TACT_SIMPLIFY = 2.0 # how far (m) a run may stand off the mapped line it is laid along
TACT_CORNER_M = 1e9 # a mapped leg longer than this, 30 degrees and more across the grid, turns a corner instead


def tactile_ways(D, near, radius):
    """The footways OpenStreetMap tags tactile_paving=yes on the ground within radius of near: each as its points."""
    for w in D.ways:
        t = w["tags"]
        if t.get("tactile_paving") != "yes" or not t.get("highway") or t.get("highway") in ("steps", "elevator"):
            continue
        if str(t.get("layer", "0")) != "0" or str(t.get("level", "0"))[:1] in "-123" or t.get("bridge"):
            continue
        pts = np.asarray(w["xy"], float)
        if len(pts) >= 2 and np.min(np.linalg.norm(pts - near, axis=1)) <= radius:
            yield pts


def tactile_layout(D, plan, radius=None):
    """Where the yellow blocks lie round the scramble, as they are laid in Japan, from where OpenStreetMap says a
    footway has them (tactile_paving=yes). A mapped footway is the walkers' line, not the blocks': it cuts across
    Hachiko Square on the diagonal and follows a kerb's curve point by point, and drawn as it is mapped it was a
    tangle of yellow arcs (the owner's iPhone, November 2026). Blocks are 30 cm squares laid in straight rows:
    guide blocks (bars along the way) in runs along the paving's own grid, the kerbs and the building lines round
    them, a turn at a corner, never a curve; a warning block (domes) at each bend and branch; and where a line meets a
    kerb, a row of warning blocks along it, two deep, 30 cm back from its edge, which the guide line runs into square
    (国土交通省, 道路の移動等円滑化に関するガイドライン: the warning row parallel to the road, set back about 30 cm).
    So each mapped leg that runs along the grid (within TACT_SNAP) is kept; one that runs across it becomes two legs
    along it, turning at the corner that keeps both on the paving; and a line's last leg to a kerb comes in square.
    Returns {"runs": [(a, b)], "dots": [(centre, along, n_along, n_deep)]}: guide runs from a to b (30 cm wide,
    each end at a block's edge), and warning blocks, n_along by n_deep of them, centred, laid with their rows along
    `along` (a unit vector)."""
    from shapely.geometry import MultiLineString, box as sbox
    from shapely.ops import linemerge, nearest_points, unary_union
    near = np.asarray(plan.centre, float)
    radius = radius or float(plan.disc.exterior.distance(Point(*near)))
    ok = plan.pave.buffer(-0.2)
    kerb = plan.roads.boundary
    # the grid the paving keeps near a point: the kerbs' and the building lines' directions round it, by length and
    # nearness (each edge's angle taken four times over, so that along and across are one direction)
    edges = []
    big = unary_union([q for q in getattr(plan.solids, "geoms", [plan.solids]) if q.area > 150.0])   # (not a kiosk turned its own way)
    for g in (kerb, big.boundary):
        for co in lines_of(g.intersection(plan.disc.buffer(30))):
            for a, b in zip(co[:-1], co[1:]):
                L = float(np.linalg.norm(b - a))
                if L > 0.8:
                    edges.append((a, b, L, math.atan2(b[1] - a[1], b[0] - a[0])))
    E = np.array([[a[0], a[1], b[0], b[1], L, th] for a, b, L, th in edges]) if edges else np.zeros((0, 6))

    def axis_at(p, fallback):
        if not len(E):
            return fallback
        a, b = E[:, 0:2], E[:, 2:4]
        ab = b - a
        t = np.clip(((p - a) * ab).sum(1) / np.maximum((ab * ab).sum(1), 1e-9), 0, 1)
        d = np.linalg.norm(a + ab * t[:, None] - p, axis=1)
        w = np.minimum(E[:, 4], 6.0) * np.exp(-d / 2.5)   # (the nearest edge rules: a corner's two kerbs are not averaged)
        c, s = (w * np.cos(4 * E[:, 5])).sum(), (w * np.sin(4 * E[:, 5])).sum()
        return fallback if math.hypot(c, s) < 0.05 else math.atan2(s, c) / 4

    def dev(th, ax):   # how far a direction is off the grid (radians, 0 to 45 degrees)
        return abs(((th - ax + math.pi / 4) % (math.pi / 2)) - math.pi / 4)

    def outside(pts):
        return LineString(pts).difference(ok).length if len(pts) > 1 else 0.0

    back = 0.18 + 0.3                       # a row's near edge: the kerb's top, then 30 cm of paving
    # each crosswalk's two ends: where its middle line meets the kerb, and the way onto the paving there. Every line
    # that comes to a crosswalk comes to the middle of its end, so that the lines of a corner share one way in
    ends = []
    for cw in crosswalk_list(D):
        A, B = np.asarray(cw["a"], float), np.asarray(cw["b"], float)
        f = unit(B - A)
        for e, out_ in ((A, -f), (B, f)):
            ln = LineString([tuple(e - out_ * 3.0), tuple(e + out_ * 6.0)]).intersection(plan.roads.buffer(0.01))
            k = None
            for co in lines_of(ln):   # (the kerb: where the line through the crosswalk leaves the carriageway)
                q = max((np.asarray(co[0]), np.asarray(co[-1])), key=lambda q: (q - e) @ out_)
                k = q if k is None or (q - e) @ out_ > (k - e) @ out_ else k
            if k is not None and plan.disc.contains(Point(*k)):
                ends.append({"k": k, "n": out_, "w": cw["width"]})
    pads, legs, used, fixed = [], [], set(), []

    def approach(q, end):
        """The way from q on the paving square in to a crosswalk's end: along the kerb to its middle, then across."""
        k, n = end["k"], end["n"]
        tip = k + n * (back + 2 * TACT)
        depth = max((q - k) @ n, back + 2 * TACT + 1.2)
        c = k + n * depth
        return [c, tip] if np.linalg.norm(q - c) > 0.5 else [tip]

    for raw in tactile_ways(D, near, radius):
        line = LineString(raw)
        # the ends a line comes to a crosswalk at: cut back 4 m from its kerb, and come in square from there
        heads = []
        for which in (0, -1):
            e = np.asarray(line.coords[which])
            end = min(ends, key=lambda q: np.linalg.norm(q["k"] - e), default=None)
            if end is not None and np.linalg.norm(end["k"] - e) < 0.6 * end["w"] + 2.0:
                heads.append(end)
                used.add(id(end))
                cut = line.difference(Point(*end["k"]).buffer(4.0))
                parts = [g for g in getattr(cut, "geoms", [cut]) if g.geom_type == "LineString" and g.length > 0.5]
                if not parts:
                    line = None
                    break
                line = max(parts, key=lambda g: g.length)
            else:
                heads.append(None)
        if line is None:
            continue
        pts = [np.asarray(q) for q in np.asarray(line.simplify(TACT_SIMPLIFY).coords)]
        out = [pts[0]]
        for a, b in zip(pts[:-1], pts[1:]):
            d = b - a
            L = float(np.linalg.norm(d))
            if L < 0.3:
                continue
            th = math.atan2(d[1], d[0])
            ax = axis_at((a + b) / 2, th)
            # (a leg near the grid, or a short one, runs straight as it is; a long one across the grid turns a corner)
            if L < TACT_CORNER_M or dev(th, ax) < math.radians(30.0):
                out.append(b)
                continue
            u, v = np.array([math.cos(ax), math.sin(ax)]), np.array([-math.sin(ax), math.cos(ax)])
            c1, c2 = a + u * (d @ u), a + v * (d @ v)
            prev = out[-1] - out[-2] if len(out) > 1 else None
            def cost(c):
                k = 10 * outside([a, c, b])
                if prev is not None and np.linalg.norm(c - a) > 1e-6:   # (a turn saved where the leg before runs on)
                    k += 0.0 if abs(np.dot(prev / np.linalg.norm(prev), (c - a) / np.linalg.norm(c - a))) > 0.97 else 0.5
                return k
            out += [min((c1, c2), key=cost), b]
        if len(out) < 2 and not any(heads):
            continue
        if heads[0] is not None:
            out = approach(out[0], heads[0])[::-1] + out
        if heads[-1] is not None:
            out = out + approach(out[-1], heads[-1])
        # a line's end at a kerb that is not a crosswalk's (a path's end, a crossing OSM maps that is not painted):
        # a row of four warning blocks, the line in to it square
        for which in (0, -1):
            e = out[which]
            if heads[which] is not None or len(out) < 2 or plan.roads.distance(Point(*e)) > 2.0:
                continue
            k = np.asarray(nearest_points(kerb, Point(*e))[0].coords[0])
            n = unit(e - k) if np.linalg.norm(e - k) > 0.05 else unit((out[1] if which == 0 else out[-2]) - e)
            if plan.roads.contains(Point(*(k + n * 0.5))):
                n = -n
            pads.append((k + n * (back + TACT), np.array([-n[1], n[0]]), 4, 2))
            tip = k + n * (back + 2 * TACT)
            if which == 0:
                out = [tip] + out[1:]
            else:
                out = out[:-1] + [tip]
        fixed += [out[0], out[-1]] if heads[0] is not None or heads[-1] is not None else []
        legs.append([np.asarray(q, float) for q in out])
    # the corners and branches of all the lines as one set of nodes: the points of different lines within a metre of
    # each other made one (the mapped lines meet near each other, not at one point, and a jog of half a metre between
    # two runs left a gap with a warning block either side of it); a line's end at a warning row stays where it is
    nodes = []
    for co in legs:
        for q in co:
            hit = next((n for n in nodes if np.linalg.norm(n["sum"] / n["k"] - q) < 1.0), None)
            if hit is None:
                nodes.append({"sum": q.copy(), "k": 1, "pin": None})
            else:
                hit["sum"] += q; hit["k"] += 1
    for co in legs:
        for q in co:
            if any(np.linalg.norm(q - f) < 1e-6 for f in fixed):
                n = next(n for n in nodes if np.linalg.norm(n["sum"] / n["k"] - q) < 1.0 + 1e-6)
                n["pin"] = q
    at = lambda q: next(((n["pin"] if n["pin"] is not None else n["sum"] / n["k"]) for n in nodes if np.linalg.norm(n["sum"] / n["k"] - q) < 1.0 + 1e-6), q)
    legs = [LineString([tuple(at(a)), tuple(at(b))]) for co in legs for a, b in zip(co[:-1], co[1:]) if np.linalg.norm(at(b) - at(a)) > 0.05]
    for end in ends:   # each crosswalk end a line comes to: its row, as wide as six blocks, centred on the crosswalk
        if id(end) in used:
            pads.append((end["k"] + end["n"] * (back + TACT), np.array([-end["n"][1], end["n"][0]]), 6, 2))
    if not legs:
        return {"runs": [], "dots": []}
    # one network: the legs two lines share laid once (noded and merged), kept to the paving and off the warning rows
    rows = unary_union([Polygon([tuple(c + f * s * w * TACT / 2 + np.array([-f[1], f[0]]) * t * dd * TACT / 2) for s, t in ((-1, -1), (1, -1), (1, 1), (-1, 1))])
                        for c, f, w, dd in pads]) if pads else None
    net = unary_union(legs)
    net = linemerge(net) if net.geom_type != "LineString" else net
    keep = ok.difference(rows.buffer(0.01)) if rows is not None else ok
    lines = [np.asarray(co) for co in lines_of(net.intersection(keep))]
    # the network's nodes: where three legs or more meet (a branch), counted at the merged lines' ends
    key = lambda q: (round(q[0] / 0.1), round(q[1] / 0.1))
    count = {}
    for co in lines:
        for q in (co[0], co[-1]):
            count[key(q)] = count.get(key(q), 0) + 1
    runs, dots, seen = [], [], set()
    def dot(q, f):
        if key(q) not in seen and (rows is None or not rows.contains(Point(*q))):
            seen.add(key(q))
            dots.append((np.asarray(q, float), f, 1, 1))
    for co in lines:
        co = np.asarray(LineString(co).simplify(0.3).coords)
        cuts = [0]
        for i in range(1, len(co) - 1):
            f0, f1 = unit(co[i] - co[i - 1]), unit(co[i + 1] - co[i])
            if math.degrees(math.acos(np.clip(f0 @ f1, -1, 1))) >= TACT_TURN:
                cuts.append(i)
        cuts.append(len(co) - 1)
        for i0, i1 in zip(cuts[:-1], cuts[1:]):
            a, b = co[i0], co[i1]
            f = unit(b - a)
            # (a corner or a branch is a warning block: the bars stop half a block short of it either side)
            ca = i0 > 0 or count.get(key(a), 0) >= 3
            cb = i1 < len(co) - 1 or count.get(key(b), 0) >= 3
            if ca:
                dot(a, f)
            if cb:
                dot(b, f)
            a2, b2 = a + f * (TACT / 2 if ca else 0), b - f * (TACT / 2 if cb else 0)
            if np.linalg.norm(b2 - a2) >= TACT:
                runs.append((a2, b2))
    return {"runs": runs, "dots": pads + dots}


def tactile(K, D, plan, top=None):
    """The yellow blocks round the scramble in the city's own model (drawn where the hero level is not shown: from
    afar, and on a phone in the seconds before the level has come), as tactile_layout lays them, flush on what they
    lie on: the ground, or what the city lays over it there (top(x, y): Hachiko Square's setts; city.py), 6 mm over it.
    They were 12 cm over the ground, along the mapped lines, and stood over the feet of whoever stood on them."""
    lay = tactile_layout(D, plan, radius=125.0)
    def z(q):
        g = D.ground(*q) + 0.02
        t = top(*q) if top else None
        return max(g, t + 0.006) if t is not None else g
    m, dots = K["x_tactile"], K["x_tactile_dot"]
    for a, b in lay["runs"]:
        L = float(np.linalg.norm(b - a))
        f = (b - a) / L
        l = np.array([-f[1], f[0]]) * TACT / 2
        n = max(1, int(round(L / 2.4)))
        for k in range(n):
            p, q = a + f * L * k / n, a + f * L * (k + 1) / n
            u0, u1 = L * k / n, L * (k + 1) / n
            m.quad(*[np.array([*x, z(x)]) for x in (p - l, q - l, q + l, p + l)], [[u0, 0], [u1, 0], [u1, TACT], [u0, TACT]])
    for c, f, nw, nd in lay["dots"]:
        l = np.array([-f[1], f[0]])
        q = [c + f * s * nw * TACT / 2 + l * t * nd * TACT / 2 for s, t in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        dots.quad(*[np.array([*x, z(x) + 0.002]) for x in q], [[0, 0], [nw * TACT, 0], [nw * TACT, nd * TACT], [0, nd * TACT]])


# ---------------------------------------------------------------- the underground's entrances

def entrance_sites(D, near, radius=150.0):
    """The entrances OSM maps as a subway entrance on a little building: the building's solid, the
    direction the stairs go down (toward the underground footway from the entrance), the exit's ref."""
    from shapely.geometry import Polygon as Poly
    out = []
    for n in D.nodes:
        t = n["tags"]
        if t.get("railway") != "subway_entrance" or np.linalg.norm(n["xy"] - near) > radius:
            continue
        p = Point(*n["xy"])
        best = None
        for s in D.solids:
            if s["top"] > 5 or len(s["ring"]) < 4 or abs(s["ring"][0][0] - n["xy"][0]) > 30 or abs(s["ring"][0][1] - n["xy"][1]) > 30:
                continue
            g = Poly(s["ring"])
            if g.area < 200 and g.distance(p) < 0.5:
                best = s
        if not best:
            continue
        down, up = None, None
        for w in D.ways:
            if n["id"] not in w["nodes"] or w["tags"].get("building"):
                continue
            k = w["nodes"].index(n["id"])
            for j in (k - 1, k + 1):
                if 0 <= j < len(w["xy"]):
                    under = str(w["tags"].get("layer", "0")).startswith("-") or str(w["tags"].get("level", "0")).startswith("-")
                    if under:
                        down = w["xy"][j]
                    else:
                        up = w["xy"][j]
        cx, cy, ax, L, W = ak.oriented(best["ring"])
        f = np.array([math.cos(math.radians(ax)), math.sin(math.radians(ax))])
        c = np.array([cx, cy])
        kiosk = Poly(best["ring"]).area > 150       # Shibuchika's pavilion on Hachiko Square: open toward the crossing
        if kiosk:
            f = unit(near - c)
            up = None
            down = c - f
        # the stairs go down away from the open end: the end the street footway comes in at
        if up is not None and abs((up - c) @ f) > 0.3:
            sgn = 1.0 if (up - c) @ f > 0 else -1.0
        elif down is not None:
            sgn = -1.0 if (down - c) @ f > 0 else 1.0
        else:
            sgn = 1.0 if (n["xy"] - c) @ f >= 0 else -1.0
        out.append({"ref": t.get("ref") or "", "name": "しぶちか" if kiosk else (t.get("name") or "渋谷駅"), "kiosk": kiosk, "si": best["si"], "c": c, "f": f * sgn, "L": L, "W": W,
                    "g": min(D.ground(*q) for q in best["ring"]), "top": best["top"]})
    return out


def entrance(K, A, e):
    """A covered stair down to the underground: a flat roof on a steel frame, aluminium panels to waist
    height and glass above on three sides, the stair (30 cm treads, 16.5 cm risers) going down between
    tiled walls, a handrail each side, tactile paving at its head and a lit sign over the open end:
    the exit's code in yellow (as Tokyo's underground signs its exits) and the station's name. The
    roof's height is OSM's; the rest is from photographs (estimates)."""
    P = frame(e["c"], e["f"])
    hl, hw, g = e["L"] / 2, e["W"] / 2, e["g"]
    zr = g + min(max(e["top"], 3.0), 3.9) - 0.32      # the roof's underside
    panel, fr, gl = K["x_panel"], K["x_frame"], K["x_glass"]
    t = 0.07                                          # the walls' thickness
    # the roof: a slab with a deeper fascia over the open end, cantilevered 0.6 m past it
    box(panel, P, -hl - 0.12, hl + 0.6, -hw - 0.12, hw + 0.12, zr, zr + 0.32)
    box(fr, P, hl + 0.6, hl + 0.66, -hw - 0.12, hw + 0.12, zr - 0.38, zr + 0.4)    # the fascia's edge
    # posts at the corners and every 1.8 m along the sides
    n = max(2, int(round(2 * hl / 1.8)) + 1)
    for v in (-hw + t / 2, hw - t / 2):
        for u in np.linspace(-hl + 0.05, hl - 0.05, n):
            box(fr, P, u - 0.05, u + 0.05, v - 0.05, v + 0.05, g, zr)
        box(panel, P, -hl, hl, v - t / 2, v + t / 2, g, g + 1.05)                 # waist panels
        box(fr, P, -hl, hl, v - 0.04, v + 0.04, g + 1.05, g + 1.12)               # their capping
        box(gl, P, -hl, hl, v - 0.012, v + 0.012, g + 1.12, zr)                   # glass to the roof
    box(panel, P, -hl, -hl + t, -hw, hw, g, zr)                                   # the back wall
    # the stair: from the open end down toward the back, under the ground
    rise, tread = 0.165, 0.30
    w0, w1 = -hw + t + 0.02, hw - t - 0.02
    u = hl - 0.35
    z = g
    tr, ri, tile = K["x_tread"], K["x_riser"], K["x_tile"]
    box(tile, P, hl - 0.35, hl, w0, w1, g - 0.3, g + 0.012, uvm=True)            # the landing at the top
    k = 0
    while u - tread > -hl + 0.2 and k < 40:
        z1 = z - rise
        box(ri, P, u - 0.02, u, w0, w1, z1, z, uvm=True)
        tr.quad(P(u - tread, w0, z1), P(u, w0, z1), P(u, w1, z1), P(u - tread, w1, z1), [[0, 0], [0, 1], [w1 - w0, 1], [w1 - w0, 0]])
        u -= tread
        z = z1
        k += 1
    zb = z - 0.05
    # the well's walls, tiled, from the bottom of the stair to the ground, and the dark beyond it
    for v in (w0, w1):
        P2 = lambda uu, zz, v=v: P(uu, v, zz)
        tile.quad(P2(-hl, zb), P2(hl - 0.35, zb), P2(hl - 0.35, g), P2(-hl, g), [[0, zb], [2 * hl, zb], [2 * hl, g], [0, g]])
    K["x_dark"].quad(P(-hl + 0.2, w1, zb), P(-hl + 0.2, w0, zb), P(-hl + 0.2, w0, g + 0.02), P(-hl + 0.2, w1, g + 0.02))
    K["x_dark"].quad(P(-hl + 0.2, w0, zb), P(-hl + 0.2, w1, zb), P(u, w1, zb), P(u, w0, zb))
    # handrails, 85 cm over the nosings, each side
    for v in (w0 + 0.06, w1 - 0.06):
        K["x_rail"].tube([P(hl - 0.2, v, g + 0.85), P(hl - 0.35, v, g + 0.85), P(-hl + 0.4 + 0.3, v, z + 0.85 + 0.3 * rise / tread), P(-hl + 0.3, v, z + 0.85)], 0.022, 6)
    # tactile warning blocks across the head of the stair (30 cm, dots)
    K["x_tactile"].quad(P(hl, w0, g + 0.02), P(hl, w1, g + 0.02), P(hl + 0.3, w1, g + 0.02), P(hl + 0.3, w0, g + 0.02))
    # the strip light under the roof and the sign over the open end, each side facing out
    box(K["x_light"], P, -hl + 0.4, hl - 0.2, -0.06, 0.06, zr - 0.05, zr)
    A.quad(K["x_atlas"], P(hl + 0.67, -hw, zr - 0.36), P(hl + 0.67, hw, zr - 0.36), P(hl + 0.67, hw, zr + 0.38), P(hl + 0.67, -hw, zr + 0.38), f"exit_{e['ref']}")
    for side in (-1, 1):
        v = side * (hw + 0.125)
        a, b = (P(-hl + 0.2, v, zr + 0.02), P(hl - 0.2, v, zr + 0.02)) if side < 0 else (P(hl - 0.2, v, zr + 0.02), P(-hl + 0.2, v, zr + 0.02))
        A.quad(K["x_atlas"], a, b, b + [0, 0, 0.28], a + [0, 0, 0.28], "exit_side")
    # where the ground is not drawn: over the stair's well
    well = [P(hl - 0.35, w0, 0), P(hl - 0.35, w1, 0), P(-hl + 0.2, w1, 0), P(-hl + 0.2, w0, 0)]
    return [[round(float(p[0]), 2), round(float(p[1]), 2)] for p in well]


def draw_exit(img, rect, ref, name):
    """An exit's sign: navy, the exit's code white on a yellow square at the left, then the station;
    Shibuchika's pavilion carries its own name, white on charcoal."""
    from PIL import ImageDraw
    x, y, w, h = rect
    d = ImageDraw.Draw(img)
    if name == "しぶちか":
        d.rectangle([x, y, x + w, y + h], fill=(38, 40, 44))
        f = ad.font("rounded", int(h * 0.5))
        d.text((x + w * 0.4, y + h * 0.48), "しぶちか", font=f, fill=(255, 255, 255), anchor="mm")
        f = ad.font("bebas", int(h * 0.28))
        d.text((x + w * 0.78, y + h * 0.52), "SHIBUCHIKA  " + ref, font=f, fill=(220, 222, 226), anchor="mm")
        return
    d.rectangle([x, y, x + w, y + h], fill=(22, 34, 72))
    s = h - 16
    if ref:
        d.rectangle([x + 8, y + 8, x + 8 + s * (1.5 if len(ref) > 2 else 1.2), y + 8 + s], fill=(255, 209, 0))
    if ref:
        f = ad.font("zen", int(s * 0.62))
        d.text((x + 8 + s * (0.75 if len(ref) > 2 else 0.6), y + 8 + s / 2), ref, font=f, fill=(20, 20, 20), anchor="mm")
    f = ad.font("zen", int(h * 0.34))
    f2 = ad.font("bebas", int(h * 0.3))
    x1 = x + 16 + (s * (1.5 if len(ref) > 2 else 1.2) if ref else 0)
    d.text((x1 + 8, y + h * 0.36), "渋谷駅", font=f, fill=(255, 255, 255), anchor="lm")
    d.text((x1 + 8, y + h * 0.76), "SHIBUYA STATION", font=f2, fill=(220, 226, 240), anchor="lm")


def draw_side(img, rect):
    from PIL import ImageDraw
    x, y, w, h = rect
    d = ImageDraw.Draw(img)
    d.rectangle([x, y, x + w, y + h], fill=(22, 34, 72))
    f = ad.font("zen", int(h * 0.55))
    d.text((x + w / 2, y + h / 2), "地下鉄・東急線  渋谷駅  Subway / Tokyu Lines", font=f, fill=(235, 238, 245), anchor="mm")


# ---------------------------------------------------------------- the JR lines east of the scramble

# The Yamanote Line's two tracks and the two of the freight line (Saikyo and Shonan-Shinjuku trains)
# run north-south past the scramble on a raised bed, and cross the road under them on a steel girder
# bridge (OSM: bridge=yes, layer 1, level 2). The rails' height over the road, the girder's depth and
# the walls are estimates from photographs: the road under it is signed for about 4.5 m.
JR = {"y0": -1016.0, "y1": -860.0, "bridge": (-1012.5, -987.5), "rail_m": 7.4, "girder_m": 2.0, "clear_m": 4.9, "margin_m": 2.4,
      "lines": ("山手線", "山手貨物線"), "mast_every_m": 46.0}


JR_LOT = (422.5, -908.0, 447.5, -898.8)   # ハチ公口自転車等駐輪場 under the tracks (OSM): x0, y0, x1, y1


def bicycle_model(colour, basket):
    """A city bicycle (mamachari), pointing along +x, its wheels on the ground at x = -0.55 and 0.5."""
    from meshkit import Mesh
    tyre, frm, black, steel = (Mesh(f"bike_{n}", m, False) for n, m in (("tyre", "x_tyre"), ("frame", colour), ("saddle", "x_bike_black"), ("bars", "x_rail")))
    P = lambda u, v, z: np.array([u, v, z])
    r = 0.33
    for u in (-0.55, 0.5):
        tyre.tube([P(u + r * math.cos(t), 0, r + r * math.sin(t)) for t in np.linspace(0, 2 * math.pi, 13)], 0.022, 4)
    frm.tube([P(-0.55, 0, r), P(-0.12, 0, 0.78), P(0.38, 0, 0.8), P(0.5, 0, r)], 0.022, 4)
    frm.tube([P(-0.12, 0, 0.78), P(0.0, 0, r), P(0.38, 0, 0.8)], 0.02, 4)
    black.tube([P(-0.17, 0, 0.92), P(-0.02, 0, 0.92)], 0.045, 5)
    steel.tube([P(0.42, -0.26, 1.0), P(0.42, 0.26, 1.0)], 0.015, 4)
    if basket:
        box(steel, frame((0, 0), (1, 0)), 0.48, 0.78, -0.15, 0.15, 0.72, 0.92)
    return [m for m in (tyre, frm, black, steel) if m.v]


def bicycles(D, lot, every=0.62):
    """The bicycle lot under the tracks: two rows of city bicycles in their racks, in a few colours,
    instanced (landmarks.json props)."""
    x0, y0, x1, y1 = lot
    rng = np.random.default_rng(1105)
    kinds = {f"bicycle_{c}_{b}": (f"x_bike_{c}", b) for c in ("silver", "black", "white", "red") for b in (0, 1)}
    at = {k: [] for k in kinds}
    for row_y, face in ((y0 + 1.2, 1), (y1 - 1.2, -1)):
        for x in np.arange(x0 + 0.6, x1 - 0.4, every):
            if rng.random() < 0.15:
                continue                                   # a free space
            k = list(kinds)[int(rng.integers(len(kinds)))]
            yy = row_y - face * 0.5                        # the bicycle's middle, pointing into the rack
            at[k].append([round(float(x), 2), round(float(yy), 2), round(D.ground(x, yy), 2), round(face * math.pi / 2, 3)])
    return [dict(name=k, at=v, parts=[m.dump() for m in bicycle_model(*kinds[k])], far=250) for k, v in at.items() if v]


def jr_tracks(D):
    """Each track's centre line, south to north, clipped to the corridor drawn (OSM, the surface lines)."""
    from shapely.ops import linemerge
    segs = []
    for w in D.ways:
        t = w["tags"]
        if t.get("railway") == "rail" and t.get("name") in JR["lines"] and not str(t.get("layer", "0")).startswith("-"):
            segs.append(LineString([tuple(p) for p in w["xy"]]))
    merged = linemerge(segs)
    out = []
    from shapely.geometry import box as sbox
    clipbox = sbox(380, JR["y0"], 520, JR["y1"])
    for ln in getattr(merged, "geoms", [merged]):
        c = ln.intersection(clipbox)
        for piece in getattr(c, "geoms", [c]):
            if piece.geom_type == "LineString" and piece.length > 30:
                pts = np.asarray(piece.coords)
                if pts[0][1] > pts[-1][1]:
                    pts = pts[::-1]
                out.append(pts)
    return out


def x_at(pts, y):
    """A south-to-north line's x where it crosses y (extrapolated past its ends)."""
    ys = pts[:, 1]
    if y <= ys[0]:
        i = 0
    elif y >= ys[-1]:
        i = len(ys) - 2
    else:
        i = int(np.searchsorted(ys, y)) - 1
    a, b = pts[i], pts[i + 1]
    return float(a[0] + (b[0] - a[0]) * (y - a[1]) / ((b[1] - a[1]) or 1e-6))


def jr_lines(K, A, D):
    tracks = jr_tracks(D)
    if not tracks:
        return
    ys = np.arange(JR["y0"], JR["y1"] + 0.01, 2.5)
    west = np.array([min(x_at(t, y) for t in tracks) - JR["margin_m"] for y in ys])
    east = np.array([max(x_at(t, y) for t in tracks) + JR["margin_m"] for y in ys])
    road_g = D.ground(430.0, -1000.0)
    zr = road_g + JR["rail_m"]                 # rail top
    zb = zr - 0.55                             # the ballast's top
    b0, b1 = JR["bridge"]
    wall, conc, ballast, steel = K["x_jr_wall"], K["x_jr_concrete"], K["x_ballast"], K["x_jr_steel"]
    # the bed: ballast between the walls, the walls down to the ground, a parapet on each side
    for k in range(len(ys) - 1):
        y, y2 = ys[k], ys[k + 1]
        on_bridge = b0 <= (y + y2) / 2 <= b1
        viaduct = (y + y2) / 2 > b1 + 1.2          # north of the bridge the tracks are on a viaduct (the bicycle lot is under it)
        q = [(west[k], y), (east[k], y), (east[k + 1], y2), (west[k + 1], y2)]
        ballast.quad(*[np.array([x, yy, zb]) for x, yy in q], [[x, yy] for x, yy in q])
        if viaduct:
            conc.quad(*[np.array([x, yy, zb - JR["girder_m"] + 0.3]) for x, yy in (q[1], q[0], q[3], q[2])])   # its soffit
        for xs, side in ((west, -1), (east, 1)):
            a, b = np.array([xs[k], y]), np.array([xs[k + 1], y2])
            g0 = min(D.ground(*a), D.ground(*b))
            zlow = zb - JR["girder_m"] if (on_bridge or viaduct) else g0 - 0.3
            mat = steel if on_bridge else (conc if viaduct else wall)
            p0, p1 = (a, b) if side > 0 else (b, a)    # wound to face out
            mat.quad(np.array([*p0, zlow]), np.array([*p1, zlow]), np.array([*p1, zb + 1.15]), np.array([*p0, zb + 1.15]),
                     [[0, zlow], [np.linalg.norm(b - a), zlow], [np.linalg.norm(b - a), zb + 1.15], [0, zb + 1.15]])
            conc.quad(np.array([*p0, zb + 1.15]), np.array([*p1, zb + 1.15]), np.array([*p1 + np.array([-side * 0.3, 0]), zb + 1.25]),
                      np.array([*p0 + np.array([-side * 0.3, 0]), zb + 1.25]))  # the parapet's coping
            if on_bridge:   # the girder's underside
                steel.quad(np.array([*p1, zlow]), np.array([*p0, zlow]), np.array([*p0 + np.array([-side * 1.2, 0]), zlow]),
                           np.array([*p1 + np.array([-side * 1.2, 0]), zlow]))
    # the bridge's plate girders: vertical stiffeners every 1.2 m and a flange top and bottom, on both faces,
    # and the clearance sign over the road on the scramble's side (高さ制限; its figure is an estimate)
    for xs, side in ((west, -1), (east, 1)):
        for yy in np.arange(b0 + 0.4, b1 - 0.2, 1.2):
            x = np.interp(yy, ys, xs)
            box(steel, frame((x, yy), (side, 0)), 0.0, 0.12, -0.06, 0.06, zb - JR["girder_m"], zb + 1.15)
        for z in (zb - JR["girder_m"], zb + 1.0):
            x0_, x1_ = np.interp(b0, ys, xs), np.interp(b1, ys, xs)
            box(steel, frame((x0_, b0), (x1_ - x0_, b1 - b0)), 0.0, b1 - b0, -0.25 * side - 0.0, 0.25 * side, z, z + 0.15)
    xw0 = np.interp((b0 + b1) / 2, ys, west)
    Pw = frame((xw0 - 0.15, (b0 + b1) / 2), (-1, 0))   # facing west, to the scramble; v runs south (left of f)
    # read from the west, its bottom left is the north end (v = -1.6), and a-b-c-d run counter-clockwise from there
    A.quad(K["x_atlas"], Pw(0, -1.6, zb - JR["girder_m"] + 0.25), Pw(0, 1.6, zb - JR["girder_m"] + 0.25), Pw(0, 1.6, zb - JR["girder_m"] + 1.05),
           Pw(0, -1.6, zb - JR["girder_m"] + 1.05), "jr_clear")
    # the viaduct's columns, in three rows, and the fence between the western ones (open at the bicycle lot)
    lot = JR_LOT
    fence = []
    for yy in np.arange(b1 + 6.0, JR["y1"], 7.5):
        xa, xb = np.interp(yy, ys, west), np.interp(yy, ys, east)
        g = D.ground((xa + xb) / 2, yy)
        for x in (xa + 0.6, (xa + xb) / 2, xb - 0.6):
            box(conc, frame((x, yy), (1, 0)), -0.45, 0.45, -0.45, 0.45, g - 0.2, zb - JR["girder_m"] + 0.3, uvm=True)
        y2 = yy + 7.5
        if y2 < JR["y1"] and not (lot[1] - 1 < yy + 3.75 < lot[3] + 1):
            xa2 = np.interp(y2, ys, west)
            fence.append(((xa + 0.15, yy), (xa2 + 0.15, y2)))
    # (the fence by the rule of levels, pipeline/levels.py: each panel had stood on the ground under its own bay's
    # middle, so its top rose and fell with the ground from panel to panel, a tooth of 0.26 m once the embankment was
    # taken out from under the viaduct, issue 158)
    import levels
    runs_, GLv = [], ground_levels()
    for seg in fence:
        if runs_ and math.hypot(runs_[-1][-1][0] - seg[0][0], runs_[-1][-1][1] - seg[0][1]) < 1e-6:
            runs_[-1].append(seg[1])
        else:
            runs_.append([seg[0], seg[1]])
    for line in runs_:
        for bay in levels.stepped(line, GLv, 1.8, bay=7.5, kind="fence"):
            h = bay.top - bay.foot
            K["x_fence"].quad(np.array([*bay.a, bay.foot]), np.array([*bay.b, bay.foot]), np.array([*bay.b, bay.top]), np.array([*bay.a, bay.top]),
                              [[0, 0], [7.5, 0], [7.5, h], [0, h]])
    D.props = getattr(D, "props", []) + bicycles(D, lot)
    for row_y, face in ((lot[1] + 1.2, 1), (lot[3] - 1.2, -1)):     # the racks' rails
        K["x_rail"].tube([np.array([lot[0] + 0.5, row_y + face * 0.6, D.ground(lot[0], row_y) + 0.3]),
                          np.array([lot[2] - 0.5, row_y + face * 0.6, D.ground(lot[2], row_y) + 0.3])], 0.025, 4)
    # under the bridge: the deck's soffit with its cross girders, and the abutments each side of the road
    xw, xe = np.interp(b0, ys, west), np.interp(b0, ys, east)
    xw2, xe2 = np.interp(b1, ys, west), np.interp(b1, ys, east)
    soffit = zb - JR["girder_m"] + 0.6
    K["x_jr_steel"].quad(np.array([xe, b0, soffit]), np.array([xw, b0, soffit]), np.array([xw2, b1, soffit]), np.array([xe2, b1, soffit]))
    for yy in np.arange(b0 + 1.5, b1 - 1.0, 2.2):
        xa, xb = np.interp(yy, ys, west), np.interp(yy, ys, east)
        box(steel, frame((xa, yy), (xb - xa, 0)), 0, xb - xa, -0.12, 0.12, soffit - 0.9, soffit)
    for yy, s_ in ((b0, -1), (b1, 1)):
        xa, xb = np.interp(yy, ys, west), np.interp(yy, ys, east)
        g = D.ground((xa + xb) / 2, yy)
        box(conc, frame((xa, yy), (xb - xa, 0)), 0, xb - xa, (-1.2 if s_ < 0 else 0.0), (0.0 if s_ < 0 else 1.2), g - 0.3, zb - JR["girder_m"] + 0.2, uvm=True)
    # the rails on their sleepers (1,067 mm gauge, a sleeper every 0.6 m)
    rail, sleeper = K["x_rail_steel"], K["x_sleeper"]
    for t in tracks:
        y = JR["y0"]
        while y < JR["y1"]:
            x = x_at(t, y)
            sleeper.quad(np.array([x - 1.0, y - 0.1, zb + 0.14]), np.array([x + 1.0, y - 0.1, zb + 0.14]), np.array([x + 1.0, y + 0.1, zb + 0.14]),
                         np.array([x - 1.0, y + 0.1, zb + 0.14]))   # (only their tops: the bed is seen from below or from afar)
            y += 0.6
        for off in (-0.5335, 0.5335):
            path = [np.array([x_at(t, yy) + off, yy, zr - 0.08]) for yy in np.arange(JR["y0"], JR["y1"] + 0.1, 5.0)]
            rail.tube(path, 0.04, 4)
    # the overhead line: a portal mast every 46 m across all four tracks, and a contact wire over each
    xs_all = lambda y: [x_at(t, y) for t in tracks]
    for y in np.arange(JR["y0"] + 12.0, JR["y1"], JR["mast_every_m"]):
        if b0 - 3 < y < b1 + 3:
            continue
        xa, xb = np.interp(y, ys, west) + 0.5, np.interp(y, ys, east) - 0.5
        for x in (xa, xb):
            box(steel, frame((x, y), (1, 0)), -0.15, 0.15, -0.15, 0.15, zb, zr + 6.2)
        box(steel, frame((xa, y), (1, 0)), 0, xb - xa, -0.12, 0.12, zr + 5.9, zr + 6.25)
        for x in xs_all(y):
            K["x_wire"].tube([np.array([x, y, zr + 5.9]), np.array([x, y, zr + 5.2])], 0.012, 4)
    for t in tracks:
        for h, r in ((5.1, 0.008), (6.0, 0.01)):
            K["x_wire"].tube([np.array([x_at(t, yy), yy, zr + h]) for yy in np.arange(JR["y0"], JR["y1"] + 0.1, 10.0)], r, 4)


# ---------------------------------------------------------------- the Ginza line's viaduct

# The Ginza line, Tokyo's first underground (1927), comes out into the air at Shibuya: from its depot in
# the Mark City block it runs east on a concrete viaduct at about the third floor, over the street and the
# old Toyoko site, to the station over Meiji-dori (since January 2020). OSM's line (bridge=viaduct, layer
# 2); the rails' height (12 m over the street), the deck and the piers are estimates. It takes its power
# from a third rail, so no wires run over it.
GINZA = {"name": "東京メトロ銀座線", "rail_m": 12.0, "width_m": 9.0, "deck_m": 2.2, "pier_every_m": 24.0, "x1": 418.0}


def ginza_viaduct(K, D):
    ways = [w for w in D.ways if w["tags"].get("name") == GINZA["name"] and w["tags"].get("bridge") == "viaduct" and w["tags"].get("layer") == "2"
            and len(w["xy"]) > 3]
    if not ways:
        return
    from shapely.geometry import box as sbox
    ln = LineString([tuple(p) for p in max(ways, key=lambda w: len(w["xy"]))["xy"]]).intersection(sbox(300, -1200, GINZA["x1"], -1000))
    if ln.is_empty or ln.geom_type != "LineString":
        return
    g0 = D.ground(360.0, -1090.0)
    zr = g0 + GINZA["rail_m"]
    zt, zb = zr - 0.5, zr - 0.5 - GINZA["deck_m"]
    hw = GINZA["width_m"] / 2
    conc, dark = K["x_jr_concrete"], K["x_jr_wall"]
    bands = road_bands(D)
    pts = [np.asarray(ln.interpolate(s_).coords[0]) for s_ in np.arange(0, ln.length, 3.0)] + [np.asarray(ln.coords[-1])]
    for a, b in zip(pts[:-1], pts[1:]):
        f = unit(b - a)
        l = np.array([-f[1], f[0]])
        L = float(np.linalg.norm(b - a))
        for side in (-1, 1):
            p, q = a + l * hw * side, b + l * hw * side
            p0, q0 = (p, q) if side < 0 else (q, p)
            dark.quad(np.array([*p0, zb]), np.array([*q0, zb]), np.array([*q0, zt + 1.1]), np.array([*p0, zt + 1.1]), [[0, zb], [L, zb], [L, zt + 1.1], [0, zt + 1.1]])
            conc.quad(np.array([*p0, zt + 1.1]), np.array([*q0, zt + 1.1]), np.array([*(q0 - l * side * 0.25), zt + 1.2]), np.array([*(p0 - l * side * 0.25), zt + 1.2]))
        conc.quad(np.array([*(b - l * hw), zb]), np.array([*(a - l * hw), zb]), np.array([*(a + l * hw), zb]), np.array([*(b + l * hw), zb]))     # the soffit
        K["x_ballast"].quad(*[np.array([*x, zt]) for x in (a - l * hw, b - l * hw, b + l * hw, a + l * hw)], [list(x) for x in (a - l * hw, b - l * hw, b + l * hw, a + l * hw)])
    # the two tracks with their third rail; piers where they stand clear of the roads
    for off in (-1.9, 1.9):
        for r in (-0.7175, 0.7175, 1.25 * np.sign(off)):
            path = [np.array([*(p + np.array([-unit(np.asarray(ln.coords[-1]) - np.asarray(ln.coords[0]))[1], unit(np.asarray(ln.coords[-1]) - np.asarray(ln.coords[0]))[0]]) * (off + r)), zt + 0.25])
                    for p in pts]
            K["x_rail_steel"].tube(path, 0.04 if abs(r) < 1 else 0.06, 4)
    for s_ in np.arange(6.0, ln.length, GINZA["pier_every_m"]):
        c = np.asarray(ln.interpolate(s_).coords[0])
        if bands.buffer(1.5).contains(Point(*c)):
            continue
        q = np.asarray(ln.interpolate(min(ln.length, s_ + 1.0)).coords[0])
        P = frame(c, q - c)
        g = D.ground(*c)
        box(conc, P, -0.7, 0.7, -hw + 1.0, hw - 1.0, g, zb, uvm=True)


# ---------------------------------------------------------------- QFRONT

# QFRONT (1999, Tokyu; 8 floors over the ground, PLATEAU's 52.2 m to the top of its crown): the glass
# front over the scramble, curved round its two corners, is a double skin, an outer glass wall on dense
# silver fins in front of the floors, with Q'S EYE built into it; the fins run up through the crown, a
# glass box at the top with a roof advert inside it, and the building's name under it. At the foot, a
# canopy over the shopfronts carries a coffee shop's name (2F) and a bookshop's, both invented (the real tenants'
# names are not drawn: docs/HERO.md). From photographs
# (Wikimedia Commons, 2024-25: docs/cities/shibuya.md); the fins' spacing (0.9 m), the skins' gap
# (1.2 m), the storeys and the canopy are estimates. The advert in the crown is invented.
QFRONT = {"osm": "w136691386", "round_m": 5.5, "fin_m": 0.9, "gap_m": 1.2, "shop_m": 4.8, "storey_m": 4.6, "crown_m": 8.6,
          "canopy_m": 1.4, "toward": (369.0, -1000.0)}


def ring_edges(poly):
    """A polygon's outer edges as (a, b, outward normal, length), counter-clockwise."""
    from shapely.geometry.polygon import orient
    cs = np.asarray(orient(poly, 1.0).exterior.coords)
    out = []
    for a, b in zip(cs[:-1], cs[1:]):
        e = b - a
        L = float(np.linalg.norm(e))
        if L > 1e-3:
            out.append((a, b, np.array([e[1], -e[0]]) / L, L))
    return out


def qfront(K, A, D, openings=None):
    s = next((s for s in D.solids if s["osm"] == QFRONT["osm"] and s["top"] > 40), None)
    if not s:
        return []
    g, zt = s["ground"], s["ground"] + s["top"]
    zc = zt - QFRONT["crown_m"]                          # the crown's foot: the top of the floors
    zs = g + QFRONT["shop_m"]                            # the canopy: the shopfronts under it
    R = QFRONT["round_m"]
    O = Polygon(s["ring"]).buffer(-R, join_style=2).buffer(R, resolution=6)   # the rounded corners
    toward = np.asarray(QFRONT["toward"])
    cen = np.array(O.centroid.coords[0])
    front = lambda mid, n: (toward - cen) @ n / np.linalg.norm(toward - cen) > -0.25 and (mid - cen) @ (toward - cen) > -8.0
    inner = O.buffer(-QFRONT["gap_m"], join_style=2)
    fin, panel, cw, glass = K["x_fin"], K["x_qf_panel"], K["qfront_glass"], K["x_qf_glass"]
    # the floors behind the outer skin (lit after dark), and the plain walls at the back
    for a, b, n, L in ring_edges(inner):
        mid = (a + b) / 2
        mat = cw if front(mid, n) else panel
        mat.quad(np.array([*a, g]), np.array([*b, g]), np.array([*b, zc]), np.array([*a, zc]), [[0, 0], [L, 0], [L, zc - g], [0, zc - g]])
    ak.cap(panel, ak.WORLD, [tuple(p) for p in list(inner.exterior.coords)[:-1]], zc)
    # the crown's plant room, dark behind the glass, a little smaller
    crown = O.buffer(-QFRONT["gap_m"] - 0.6, join_style=2)
    for a, b, n, L in ring_edges(crown):
        K["x_dark"].quad(np.array([*a, zc]), np.array([*b, zc]), np.array([*b, zt - 0.4]), np.array([*a, zt - 0.4]))
    ak.cap(K["x_qf_roof"], ak.WORLD, [tuple(p) for p in list(crown.exterior.coords)[:-1]], zt - 0.4)
    # the outer skin: glass on the front from the canopy to the top, fins every 0.9 m, a transom at each floor
    edges = ring_edges(O)
    is_front = [front((a + b) / 2, n) for a, b, n, L in edges]
    fronts = [e for e, f in zip(edges, is_front) if f]
    for (a, b, n, L), f in zip(edges, is_front):
        if f:
            glass.quad(np.array([*a, zs]), np.array([*b, zs]), np.array([*b, zt]), np.array([*a, zt]))
        else:
            panel.quad(np.array([*a, g]), np.array([*b, g]), np.array([*b, zt]), np.array([*a, zt]), [[0, 0], [L, 0], [L, zt - g], [0, zt - g]])
    # the fins and transoms, walking the front at an even spacing
    path = []
    for a, b, n, L in fronts:
        k = max(1, int(round(L / 0.3)))
        path += [(a + (b - a) * t, n) for t in np.linspace(0, 1, k, endpoint=False)]
    if fronts:
        path.append((fronts[-1][1], fronts[-1][2]))
    acc, last = 0.0, None
    fins = []
    for p, n in path:
        if last is not None:
            acc += float(np.linalg.norm(p - last))
        if last is None or acc >= QFRONT["fin_m"]:
            fins.append((p, n))
            acc = 0.0
        last = p
    # the crown's advert inside the glass, on the front's middle: the longest stretch of the front faces the
    # crossing, its chord from the first front edge to the last
    mid_edge = max(fronts, key=lambda e: e[3]) if fronts else None
    opens = [(np.asarray(m, float)[:2], np.asarray(t_, float)[:2], w_, z0_, z1_) for m, t_, w_, z0_, z1_ in (openings or [])]
    if mid_edge is not None:
        fa, fb = fronts[0][0], fronts[-1][1]
        ch = fb - fa
        nf = np.array([ch[1], -ch[0]]) / np.linalg.norm(ch)
        c = (fa + fb) / 2 + nf * 0.0
        # the point of the outline furthest out along nf: the front's face
        depth = max((np.asarray(q) - c) @ nf for q in O.exterior.coords)
        c = c + nf * (depth - QFRONT["gap_m"] - 0.4)
        t = np.array([-nf[1], nf[0]])
        w = np.linalg.norm(ch) * 0.62
        opens.append((c, t, w, zc + 1.0, zt - 1.2))
        opens.append((c, t, 6.8, zc - 1.55, zc - 0.85))      # (and the name plate under it)
        for along, w_, h_, z0_ in ((-5.2, 8.0, 0.95, zs + 1.4), (6.0, 5.6, 0.9, zs + 0.45)):   # (the two names over the canopy, below)
            opens.append(((fa + fb) / 2 + nf * depth + t * along, t, w_ + 0.6, z0_, z0_ + h_))
    # the fins and transoms stop at a screen's or an advert's edge: none runs across a picture (they did, and cut
    # Q'S EYE and the crown's advert into a grid)
    def clear(p):
        """The heights at p (x, y) that a screen or advert takes: [(z0, z1)], with a margin."""
        return [(z0_ - 0.45, z1_ + 0.45) for m, t_, w_, z0_, z1_ in opens
                if abs((p - m) @ t_) < w_ / 2 + 0.45 and abs((p - m) @ np.array([t_[1], -t_[0]])) < 9.0]

    def spans(z0, z1, cut):
        out, z = [], z0
        for a_, b_ in sorted(cut):
            if a_ > z + 0.3:
                out.append((z, min(a_, z1)))
            z = max(z, b_)
        if z < z1 - 0.3:
            out.append((z, z1))
        return [(a_, b_) for a_, b_ in out if b_ - a_ >= 1.5]   # (no stub of a fin left over an advert's top)
    for p, n in fins:
        for z0_, z1_ in spans(zs, zt + 0.2, clear(p)):
            box(fin, frame(p, n), -0.05, 0.42, -0.04, 0.04, z0_, z1_)
    for z in list(np.arange(zs + QFRONT["storey_m"], zc, QFRONT["storey_m"])) + [zc, zs]:
        for (p, n), (q, n2) in zip(fins, fins[1:]):
            if np.linalg.norm(q - p) > 2.0 or any(a_ < z < b_ for a_, b_ in clear((p + q) / 2)):
                continue
            o, o2 = p + n * 0.42, q + n2 * 0.42
            # (a floor's edge behind the glass shows as a silver band 0.8 m deep, the slab and its louvres: photographs)
            fin.quad(np.array([*o, z - 0.55]), np.array([*o2, z - 0.55]), np.array([*o2, z + 0.25]), np.array([*o, z + 0.25]))
    if mid_edge is not None:
        A.quad(K["x_atlas"], np.array([*(c - t * w / 2), zc + 1.0]), np.array([*(c + t * w / 2), zc + 1.0]),
               np.array([*(c + t * w / 2), zt - 1.2]), np.array([*(c - t * w / 2), zt - 1.2]), "qf_crown")
        cl = c + nf * (QFRONT["gap_m"] + 0.25)
        A.quad(K["x_atlas"], np.array([*(cl - t * 2.6), zc - 1.55]), np.array([*(cl + t * 2.6), zc - 1.55]),
               np.array([*(cl + t * 2.6), zc - 0.85]), np.array([*(cl - t * 2.6), zc - 0.85]), "qf_name")
    # the shopfronts under the canopy, set back, lit; the canopy and its signs
    shop = O.buffer(-1.0, join_style=2)
    for a, b, n, L in ring_edges(shop):
        mid = (a + b) / 2
        if front(mid, n):
            K["x_shop"].quad(np.array([*a, g]), np.array([*b, g]), np.array([*b, zs]), np.array([*a, zs]), [[0, 0], [L, 0], [L, zs - g], [0, zs - g]])
    can = O.buffer(QFRONT["canopy_m"], join_style=2)
    cedges = [(a, b, n, L) for a, b, n, L in ring_edges(can) if front((a + b) / 2, n)]
    for a, b, n, L in cedges:
        ai, bi = a - n * (QFRONT["canopy_m"] + 1.0), b - n * (QFRONT["canopy_m"] + 1.0)
        panel.quad(np.array([*bi, zs - 0.55]), np.array([*b, zs - 0.55]), np.array([*a, zs - 0.55]), np.array([*ai, zs - 0.55]))   # its soffit
        panel.quad(np.array([*a, zs - 0.55]), np.array([*b, zs - 0.55]), np.array([*b, zs + 0.35]), np.array([*a, zs + 0.35]))     # its fascia
        panel.quad(np.array([*ai, zs + 0.35]), np.array([*a, zs + 0.35]), np.array([*b, zs + 0.35]), np.array([*bi, zs + 0.35]))
        K["x_light"].quad(np.array([*(b - n * 0.4), zs - 0.56]), np.array([*(a - n * 0.4), zs - 0.56]), np.array([*(a - n * 0.55), zs - 0.56]), np.array([*(b - n * 0.55), zs - 0.56]))
    # the coffee shop's name over the canopy on the left of the front, the bookshop's on the right (as seen from the crossing)
    if fronts:
        ch = fronts[-1][1] - fronts[0][0]
        nf = np.array([ch[1], -ch[0]]) / np.linalg.norm(ch)
        t = np.array([-nf[1], nf[0]])
        c = (fronts[0][0] + fronts[-1][1]) / 2
        depth = max((np.asarray(q) - c) @ nf for q in O.exterior.coords)
        c = c + nf * (depth + 0.35)
        for along, w, h, z0, key in ((-5.2, 8.0, 0.95, zs + 1.4, "qf_coffee"), (6.0, 5.6, 0.9, zs + 0.45, "qf_books")):
            q = c + t * along
            A.quad(K["x_atlas"], np.array([*(q - t * w / 2), z0]), np.array([*(q + t * w / 2), z0]), np.array([*(q + t * w / 2), z0 + h]),
                   np.array([*(q - t * w / 2), z0 + h]), key)
    return [s["si"] for s in D.solids if s["osm"] == QFRONT["osm"]]


def draw_qfront(img, rects):
    from PIL import ImageDraw, ImageFilter
    x, y, w, h = rects["qf_crown"]        # the roof advert: an invented soda, red, white swash
    sub = Image_new(w, h, (196, 18, 30))
    d = ImageDraw.Draw(sub)
    for k in range(6):
        d.arc([-w * 0.2, h * (0.25 + 0.1 * k), w * 1.2, h * (1.6 + 0.1 * k)], 190, 350, fill=(255, 255, 255), width=3)
    f = ad.font("reggae", int(h * 0.52))
    d.text((w * 0.34, h * 0.46), "FIZZLE", font=f, fill=(255, 255, 255), anchor="mm")
    f = ad.font("zen", int(h * 0.16))
    d.text((w * 0.83, h * 0.5), "爽快、ひと口。", font=f, fill=(255, 236, 236), anchor="mm")
    img.paste(sub, (x, y))
    x, y, w, h = rects["qf_name"]
    d = ImageDraw.Draw(img)
    d.rectangle([x, y, x + w, y + h], fill=(40, 44, 50))
    f = ad.font("bebas", int(h * 0.8))
    d.text((x + w / 2, y + h / 2 + 2), "Q FRONT", font=f, fill=(240, 242, 244), anchor="mm")
    x, y, w, h = rects["qf_coffee"]       # an invented coffee shop: dusk, in Japanese
    d.rectangle([x, y, x + w, y + h], fill=(28, 30, 32))
    f = ad.font("bebas", int(h * 0.78))
    d.text((x + w / 2, y + h / 2 + 2), "TASOGARE COFFEE", font=f, fill=(245, 245, 240), anchor="mm")
    x, y, w, h = rects["qf_books"]        # an invented bookshop: three spines for its mark
    d.rectangle([x, y, x + w, y + h], fill=(20, 24, 40))
    for k, c in enumerate(((226, 220, 204), (150, 170, 196), (226, 220, 204))):
        d.rectangle([x + 12 + k * 14, y + 16 + (6 if k == 1 else 0), x + 12 + k * 14 + 9, y + h - 16], fill=c)
    f = ad.font("bebas", int(h * 0.7))
    d.text((x + h + (w - h) / 2, y + h / 2 + 2), "SHIBUYA HONDANA", font=f, fill=(255, 255, 255), anchor="mm")


def Image_new(w, h, c):
    from PIL import Image
    return Image.new("RGB", (w, h), c)


# ---------------------------------------------------------------- SHIBUYA109

# SHIBUYA109 (1979, Minoru Takeyama; 8 floors over the ground): an aluminium-clad block in the fork of
# Dogenzaka and Bunkamura-dori, and at its point, facing the scramble, the cylinder (its lift tower),
# which rises over the roof to carry the name. PLATEAU: 33.6 m measured; the cylinder 49.7 m to its top,
# about 11.5 m across in its generalised model; OSM's footprint rounds its point on a 13.7 m circle. It is
# drawn 13 m across, on the footprint's circle. Its front carries a printed advert over most of its height (estimated 23 m
# tall, invented here). The panels' joints and the shopfronts are from photographs (estimates).
S109 = {"osm": "w55895868", "centre": (229.6, -993.0), "r": 6.5, "top_m": 49.7, "roof_m": 33.6, "toward": (369.0, -1000.0),
        "wrap": (13.0, 31.0, 120.0), "crown": (38.5, 48.4)}


def cyl_strip(m, c, r, a0, a1, z0, z1, segs, uv=None, out=True):
    """A band of a cylinder from angle a0 to a1 (radians, counter-clockwise), facing out; uv: (u0, v0, u1, v1) over it, else metres."""
    for k in range(segs):
        t0, t1 = a0 + (a1 - a0) * k / segs, a0 + (a1 - a0) * (k + 1) / segs
        p = lambda a, z: np.array([c[0] + r * math.cos(a), c[1] + r * math.sin(a), z])
        if uv:
            u0, v0, u1, v1 = uv
            q = [[u0 + (u1 - u0) * k / segs, v0], [u0 + (u1 - u0) * (k + 1) / segs, v0], [u0 + (u1 - u0) * (k + 1) / segs, v1], [u0 + (u1 - u0) * k / segs, v1]]
        else:
            q = [[r * t0, z0], [r * t1, z0], [r * t1, z1], [r * t0, z1]]
        if out:
            m.quad(p(t0, z0), p(t1, z0), p(t1, z1), p(t0, z1), q)
        else:
            m.quad(p(t1, z0), p(t0, z0), p(t0, z1), p(t1, z1), q)


def shibuya109(K, A, D):
    sol = [s for s in D.solids if s["osm"] == S109["osm"]]
    if not sol:
        return []
    from shapely.ops import unary_union
    g = min(s["ground"] for s in sol)
    c = np.asarray(S109["centre"])
    r = S109["r"]
    body = unary_union([Polygon(s["ring"]).buffer(0) for s in sol]).buffer(0.2).buffer(-0.2)
    body = max(getattr(body, "geoms", [body]), key=lambda q: q.area)
    body = body.difference(Point(*c).buffer(r - 0.4, 32))   # the block stops at the cylinder
    body = max(getattr(body, "geoms", [body]), key=lambda q: q.area)
    zr = g + S109["roof_m"]
    alu, shop, panel = K["x_alu"], K["x_shop"], K["x_qf_panel"]
    toward = np.asarray(S109["toward"])
    # the block: aluminium walls, shopfronts at the foot of the street faces, a parapet; the roof
    for a, b, n, L in ring_edges(body):
        mid = (a + b) / 2
        if Point(*mid).distance(Point(*c)) < r + 0.3:
            continue                                     # (the cylinder stands there)
        street = len(ring_edges(body)) and L > 2.0
        gz0 = min(D.ground(*a), D.ground(*b))
        z_shop = gz0 + 4.2 if street else gz0
        if street:
            shop.quad(np.array([*a, gz0 - 0.2]), np.array([*b, gz0 - 0.2]), np.array([*b, z_shop]), np.array([*a, z_shop]), [[0, 0], [L, 0], [L, 4.4], [0, 4.4]])
            box(K["x_fin"], frame(a, b - a), 0, L, 0, 0.6, z_shop, z_shop + 0.5)   # the fascia over the shops
        alu.quad(np.array([*a, z_shop]), np.array([*b, z_shop]), np.array([*b, zr + 1.0]), np.array([*a, zr + 1.0]), [[0, z_shop], [L, z_shop], [L, zr + 1.0], [0, zr + 1.0]])
    ak.cap(K["x_qf_roof"], ak.WORLD, [tuple(p) for p in list(body.exterior.coords)[:-1]], zr + 0.2)
    # the cylinder: panels all round, the advert on the face toward the scramble, the crown with the name
    face = math.atan2(*(toward - c)[::-1])
    w0, w1, span = S109["wrap"]
    half = math.radians(span) / 2
    zt = g + S109["top_m"]
    cyl_strip(alu, c, r, face + half, face - half + 2 * math.pi, g + 4.2, zt, 36)
    cyl_strip(alu, c, r, face - half, face + half, g + 4.2, g + w0, 16)
    cyl_strip(alu, c, r, face - half, face + half, g + w1, zt, 16)
    cyl_strip(shop, c, r, 0, 2 * math.pi, g - 0.2, g + 4.2, 32)
    cyl_strip(K["x_fin"], c, r + 0.35, 0, 2 * math.pi, g + 4.2, g + 4.7, 32)
    u0, v0, u1, v1 = A.uv("s109_wrap")
    # the advert stops where a corner of the block stands out across the cylinder (on its south side, at about
    # -60 degrees), or its end would face the block's wall from a hand's breadth away (tools/sign_check.py)
    out_at = lambda a: Point(*(c + (r + 0.3) * np.array([math.cos(a), math.sin(a)])))
    a_lo, a_hi = face - half, face + half
    while a_lo < face and body.distance(out_at(a_lo)) < 0.1:
        a_lo += math.radians(1.0)
    while a_hi > face and body.distance(out_at(a_hi)) < 0.1:
        a_hi -= math.radians(1.0)
    cyl_strip(K["x_print"], c, r + 0.12, a_lo, a_hi, g + w0, g + w1, 20, uv=(u0, v0, u1, v1))
    # the frame round the advert, and the lamps that light it from below
    for z in (g + w0 - 0.25, g + w1):
        cyl_strip(K["x_fin"], c, r + 0.3, a_lo - 0.03, a_hi + 0.03, z, z + 0.25, 20)
    for k in range(9):
        a = a_lo + (a_hi - a_lo) * (k + 0.5) / 9
        p = c + (r + 1.0) * np.array([math.cos(a), math.sin(a)])
        box(K["x_light"], frame(p, (math.cos(a), math.sin(a))), -0.2, 0.2, -0.25, 0.25, g + w0 - 0.9, g + w0 - 0.6)
    z0c, z1c = (g + x for x in S109["crown"])
    u0, v0, u1, v1 = A.uv("s109_name")
    cyl_strip(K["x_atlas"], c, r + 0.15, face - 1.0, face + 1.0, z0c, z1c, 16, uv=(u0, v0, u1, v1))
    ak.cap(K["x_qf_roof"], ak.WORLD, [tuple(c + r * np.array([math.cos(a), math.sin(a)])) for a in np.linspace(0, 2 * math.pi, 24, endpoint=False)], zt)
    cyl_strip(K["x_fin"], c, r + 0.2, 0, 2 * math.pi, zt - 0.5, zt + 0.3, 32)
    return [s["si"] for s in sol]


def draw_109(img, rects):
    from PIL import ImageDraw
    x, y, w, h = rects["s109_wrap"]   # an invented fashion campaign: a gradient, a figure, the season's words
    sub = Image_new(w, h, (255, 120, 180))
    ad.gradient(sub, "#ff4fa0", "#ffd0e4", angle=90.0)
    ad.figure(sub, w * 0.5, h * 0.18, h * 0.62, "#3a1c3a", coat=True)
    ad.text(sub, (w * 0.5, h * 0.1), "AW 2026", "anton", int(h * 0.07), fill="#ffffff")
    ad.text(sub, (w * 0.5, h * 0.88), "LUMIÈRE", "bebas", int(h * 0.09), fill="#ffffff")
    ad.text(sub, (w * 0.5, h * 0.95), "ルミエール 新作入荷", "zen", int(h * 0.035), fill="#4a0d2e")
    img.paste(sub, (x, y))
    x, y, w, h = rects["s109_name"]   # the name on the cylinder's silver: a pink 109 in a ring, in words, not its logo
    sub = Image_new(w, h, (186, 190, 195))
    d = ImageDraw.Draw(sub)
    for k in range(0, h, 12):
        d.line([(0, k), (w, k)], fill=(170, 174, 180), width=1)
    r = h * 0.42
    d.ellipse([w / 2 - r, h / 2 - r, w / 2 + r, h / 2 + r], outline=(236, 72, 150), width=int(h * 0.05))
    ad.text(sub, (w / 2, h / 2), "109", "anton", int(h * 0.42), fill="#ec4896", max_w=r * 1.5)
    img.paste(sub, (x, y))


# ---------------------------------------------------------------- Center Gai's gate

# The gate at Center Gai's mouth (since the old arcade sign fell in the typhoon of 1997): a grey steel
# post each side of the street that bends over at the top like a shepherd's crook, a disc lamp at its
# tip, センター街 on the posts, and a banner hung between them (in 2024-25 the street's basketball
# banner: it has been "Basketball Street" since 2011). No dimensions are published: the height and the
# span are estimates from photographs (5.5 m posts, the street's 9 m); the banner is drawn for the model.
def center_gai_gate(K, A, D, c):
    P = frame(c["at"], c["axis"])
    z0, hs = c["z"], c["span_m"] / 2
    grey = K["x_gate"]
    for side in (-1, 1):
        v = side * hs
        grey.tube([P(0, v, z0), P(0, v, z0 + 5.2)], 0.22, 12)
        arc = [P(0, v - side * (1.0 - math.cos(t)) * 1.1, z0 + 5.2 + math.sin(t) * 1.1) for t in np.linspace(0, math.pi * 0.95, 10)]
        grey.tube(arc, 0.18, 10)
        tip = arc[-1]
        K["x_gate"].lathe([(float(tip[2] - 0.35), 0.0), (float(tip[2] - 0.3), 0.5), (float(tip[2] - 0.15), 0.55), (float(tip[2] - 0.05), 0.2)],
                          (float(tip[0]), float(tip[1])), 16)
        K["x_light"].lathe([(float(tip[2] - 0.36), 0.0), (float(tip[2] - 0.355), 0.42)], (float(tip[0]), float(tip[1])), 16)
        # the street's name down each post, on both faces
        for u in (-0.23, 0.23):
            a, b = (P(u, v - 0.16, z0 + 2.6), P(u, v + 0.16, z0 + 2.6)) if u > 0 else (P(u, v + 0.16, z0 + 2.6), P(u, v - 0.16, z0 + 2.6))
            A.quad(K["x_atlas"], a, b, b + [0, 0, 2.2], a + [0, 0, 2.2], "cg_name")
    # the banner on a bar between the posts, each face on the side it faces
    grey.tube([P(0, -hs + 0.2, z0 + 4.75), P(0, hs - 0.2, z0 + 4.75)], 0.05, 6)
    w = 2 * hs - 2.6
    for side in (-1, 1):
        u = side * 0.03
        a, b = (P(u, -w / 2, z0 + 3.55), P(u, w / 2, z0 + 3.55)) if side > 0 else (P(u, w / 2, z0 + 3.55), P(u, -w / 2, z0 + 3.55))
        A.quad(K["x_print"], a, b, b + [0, 0, 1.15], a + [0, 0, 1.15], "cg_banner")


def draw_gate(img, rects):
    from PIL import ImageDraw
    x, y, w, h = rects["cg_banner"]
    sub = Image_new(w, h, (250, 206, 0))
    d = ImageDraw.Draw(sub)
    d.rectangle([0, h * 0.72, w, h], fill=(20, 20, 22))
    ad.text(sub, (w * 0.5, h * 0.38), "BASKETBALL STREET", "anton", int(h * 0.42), fill="#141416", max_w=w * 0.9)
    ad.text(sub, (w * 0.5, h * 0.86), "渋谷センター街  SHIBUYA CENTER-GAI", "zen", int(h * 0.17), fill="#ffd200", max_w=w * 0.9)
    img.paste(sub, (x, y))
    x, y, w, h = rects["cg_name"]
    sub = Image_new(w, h, (118, 122, 128))
    ad.vtext(sub, (w / 2, h * 0.1), "センター街", "zen", int(w * 0.62), fill="#ffffff")
    img.paste(sub, (x, y))


# ---------------------------------------------------------------- the west side's rooftop billboards and sign bands

# What makes the west side read as Shibuya from the scramble is its billboards: box signs stacked on
# steel towers over the roofs and bands of tenants' signs floor over floor. Their places and sizes are
# from photographs (2024-26; the Taiseido block's sign tower is in PLATEAU's LOD2, 5.5 x 5.6 m to 39.4 m
# over the street); the brands are invented, in the kinds the real ones are (a pharmaceutical's two
# boxes, a card company, a furniture store, throat lozenges, a karaoke chain).
BILLBOARDS = [
    # the Taiseido block's tower: three boxes stacked tight (15 cm apart) up to the tower's top at 39.4 m
    {"at": (324.7, -971.6), "face": (372.0, -1030.0), "roof_m": 24.1, "boxes": [("bb_hikari", 11.0, 3.6), ("bb_hikari2", 11.0, 6.2), ("bb_lens", 11.0, 4.0)],
     "gap": 0.15, "lift": 1.0},
    {"at": (306.5, -951.0), "face": (372.0, -1030.0), "roof_m": 24.1, "boxes": [("bb_card", 8.0, 8.0)], "lift": 3.0},
    {"at": (281.0, -952.0), "face": (372.0, -1020.0), "roof_m": 37.8, "boxes": [("bb_home", 10.5, 4.8)], "lift": 2.0},
    {"at": (274.0, -968.0), "face": (372.0, -1020.0), "roof_m": 52.1, "boxes": [("bb_nodo", 12.0, 5.6)], "lift": 1.5},
]
# bands of tenants' signs across a building's face toward the scramble: (building, floors' heights above
# the street, art) -- the Oto building's restaurants and opticians (the bookshop on the corner: BOOKSHOP)
BANDS = [
    {"building": "渋谷駅前ビル", "near": (320.0, -1045.0), "toward": (372.0, -1010.0), "rows": [(8.2, "band_shabu"), (11.6, "band_cafe"), (15.0, "band_megane"),
                                                                                       (18.4, "band_price"), (21.8, "band_clinic")], "w": 0.8},
    {"building": "渋谷駅前ビル", "near": (310.0, -1015.0), "toward": (305.0, -980.0), "rows": [(4.6, "band_karaoke"), (8.2, "band_cafe"), (11.6, "band_shabu"),
                                                                                    (15.0, "band_megane"), (18.4, "band_clinic")], "w": 0.85},
]
# the station-front building's faces on the scramble and on Dogenzaka: a white grid of mullions and
# floor bands over its glass (photographs; its windows' red frames are not drawn)
SKINS = [{"building": "渋谷駅前ビル", "near": (320.0, -1045.0), "toward": (372.0, -1010.0)},
         {"building": "渋谷駅前ビル", "near": (310.0, -1015.0), "toward": (305.0, -980.0)},
         {"building": "渋谷駅前ビル", "near": (310.0, -1015.0), "toward": (350.0, -995.0)}]
BB_ART = {
    "bb_hikari": ("#1d4fa8", "HIKARIDO", "bebas", "#ffffff", None),
    "bb_hikari2": ("#1f9a4c", "ヒカリパス", "zen", "#ffffff", "貼る、すっきり。"),
    "bb_card": ("#ffffff", "NC", "anton", "#1d3c9a", "NOVA CARD"),
    "bb_home": ("#f2c400", "HOMELY", "anton", "#164aa8", "家具と雑貨"),
    "bb_nodo": ("#f06aa0", "のどにハッカ", "zen", "#ffffff", "ハッカ散 ダイレクト"),
    "bb_lens": ("#0b2a6f", "1DAY CLEAR", "anton", "#ffffff", "コンタクト レンズ"),
    "band_shabu": ("#f07a1a", "しゃぶしゃぶ 葉山", "zen", "#ffffff", None),
    "band_cafe": ("#d7262b", "Cafeレストラン ガロ", "zen", "#ffffff", None),
    "band_megane": ("#d42f2f", "メガネ・コンタクト", "zen", "#fff3a0", None),
    "band_price": ("#ffde2a", "チケット プライス", "zen", "#c0141c", None),
    "band_clinic": ("#ffffff", "渋谷駅前クリニック", "zen", "#1d4fa8", None),
    "band_karaoke": ("#e01f26", "カラオケ ONE  2F", "zen", "#ffffff", None),
}


def lit_box(K, A, P, w, h, d, z0, key, frame_mat="x_jr_steel"):
    """A box sign, its face toward +u in frame P, lit from inside; steel at the back and sides."""
    box(K[frame_mat], P, -d, 0.0, -w / 2, w / 2, z0, z0 + h)
    A.quad(K["x_atlas"], P(0.02, -w / 2, z0), P(0.02, w / 2, z0), P(0.02, w / 2, z0 + h), P(0.02, -w / 2, z0 + h), key)


def seat(D, b, reach=9.0):
    """Where a billboard's tower stands: (at, the roof's height) on the roof the city has there. Its place and
    roof height are read off photographs, and the city's solids do not always agree: a roof lower than the
    photograph's, or a penthouse narrower than the sign, leaves the tower's legs in the air. So the tower is
    moved, by as little as will do (up to `reach` m), until its whole footprint is over one solid's roof, and
    it stands at that roof's own height; of the roofs that take it, the nearest in height to the one given."""
    at, face = np.asarray(b["at"], float), np.asarray(b["face"], float)
    w = max(w for _, w, _ in b["boxes"])
    f = unit(face - at)
    l = np.array([-f[1], f[0]])
    foot = lambda c: Polygon([c + f * u + l * v for u, v in ((-1.9, -w / 2), (0.7, -w / 2), (0.7, w / 2), (-1.9, w / 2))])
    near = [(Polygon(s["ring"], s.get("holes") or None).buffer(0), s) for s in D.solids
            if len(s["ring"]) >= 3 and abs(s["ring"][0][0] - at[0]) < 60 and abs(s["ring"][0][1] - at[1]) < 60 and s["top"] - s["base"] > 8]
    steps = sorted(((du, dv) for du in np.arange(-reach, reach + 0.1, 0.5) for dv in np.arange(-reach, reach + 0.1, 0.5) if math.hypot(du, dv) <= reach),
                   key=lambda q: math.hypot(*q))
    best = None
    for poly, s in near:
        for du, dv in steps:
            c = at + f * du + l * dv
            if poly.contains(foot(c)):
                cost = math.hypot(du, dv) + 0.25 * abs(s["top"] - b["roof_m"])
                if best is None or cost < best[0]:
                    best = (cost, c, s["ground"] + s["top"])
                break
    if best is None:
        raise ValueError(f"billboard {b['boxes'][0][0]} at {b['at']}: no roof within {reach} m takes its tower")
    return best[1], best[2]


def billboards(K, A, D):
    steel = K["x_jr_steel"]
    for b in BILLBOARDS:
        at, roof = seat(D, b)
        face = np.asarray(b["face"])
        P = frame(at, face - at)
        z = roof + b.get("lift", 0.0)
        hs = sum(h for _, _, h in b["boxes"]) + b.get("gap", 0.0) * (len(b["boxes"]) - 1)
        w = max(w for _, w, _ in b["boxes"])
        # the tower: legs, cross-bracing, a catwalk under the lowest box
        for v in (-w * 0.35, w * 0.35):
            for u in (-1.6, -0.5):
                steel.tube([P(u, v, roof), P(u, v, z + hs)], 0.09, 6)
            steel.tube([P(-1.6, v, roof), P(-0.5, v, z + hs * 0.5)], 0.05, 4)
        box(steel, P, -1.8, 0.6, -w / 2, w / 2, z - 0.15, z - 0.05)
        K["x_wire"].tube([P(0.6, -w / 2, z + 1.0), P(0.6, w / 2, z + 1.0)], 0.02, 4)   # the catwalk's rail
        zz = z + hs
        for key, bw, bh in b["boxes"]:
            zz -= bh
            lit_box(K, A, P, bw, bh, 0.6, zz, key)
            zz -= b.get("gap", 0.0)


def skins(K, D):
    import screens as sc_
    for b in SKINS:
        mid, n, L, z0, z1 = sc_.facade("shibuya", b["building"], b["toward"], near=b.get("near"))
        t = np.array([-n[1], n[0]])
        a, c = mid - t * L / 2 + n * 0.12, mid + t * L / 2 + n * 0.12
        zt = z1 - 0.3
        K["x_skin"].quad(np.array([*a, z0 + 4.0]), np.array([*c, z0 + 4.0]), np.array([*c, zt]), np.array([*a, zt]), [[0, 4.0], [L, 4.0], [L, zt - z0], [0, zt - z0]])


def sign_bands(K, A, D):
    import screens as sc_
    for b in BANDS:
        mid, n, L, z0, z1 = sc_.facade("shibuya", b["building"], b["toward"], near=b.get("near"))
        P = frame(mid + n * 0.5, n)        # (standing out from the wall, in front of its skin)
        w = L * b["w"]
        for z, key in b["rows"]:
            if z0 + z + 1.2 > z1:
                continue
            lit_box(K, A, P, w, 1.15, 0.35, z0 + z, key)


def draw_billboards(img, rects):
    from PIL import ImageDraw
    for key, (bg, word, face, fg, sub_) in BB_ART.items():
        x, y, w, h = rects[key]
        im = Image_new(w, h, ad.rgb(bg))
        d = ImageDraw.Draw(im)
        d.rectangle([3, 3, w - 4, h - 4], outline=tuple(max(0, c - 40) for c in ad.rgb(bg)), width=4)
        if key == "bb_card":
            d.ellipse([w * 0.18, h * 0.1, w * 0.82, h * 0.74], fill=(29, 60, 154))
            ad.text(im, (w / 2, h * 0.42), word, face, int(h * 0.34), fill="#ffffff")
            ad.text(im, (w / 2, h * 0.87), sub_, "bebas", int(h * 0.16), fill=fg)
        elif sub_:
            ad.text(im, (w / 2, h * 0.4), word, face, int(h * 0.44), fill=fg, max_w=w * 0.9)
            ad.text(im, (w / 2, h * 0.8), sub_, "zen", int(h * 0.18), fill=fg, max_w=w * 0.9)
        else:
            ad.text(im, (w / 2, h * 0.52), word, face, int(h * 0.62), fill=fg, max_w=w * 0.92)
        img.paste(im, (x, y))


# ---------------------------------------------------------------- MAGNET by SHIBUYA109's front

# MAGNET's corner on the scramble (1987, as 109-2; MAGNET since 2018): a glazed shopfront under a silver
# fascia that slopes out over the pavement, its name on it in red serif letters (photographs, 2025). The
# fascia's height and slope are estimates.
MAGNET = {"name": "MAGNET SHIBUYA", "faces": [((387.8, -979.0), (394.9, -988.2)), ((394.9, -988.2), (405.0, -988.7)), ((390.6, -965.0), (387.8, -979.0))],
          "z": (4.4, 6.9), "out": 1.3}


def magnet_front(K, A, D):
    panel = K["x_qf_panel"]
    for k, (a, b) in enumerate(MAGNET["faces"]):
        a, b = np.asarray(a, float), np.asarray(b, float)
        L = float(np.linalg.norm(b - a))
        f = (b - a) / L
        n = np.array([-f[1], f[0]])                     # out, toward the street (the faces run clockwise round the corner)
        if n @ (np.array([368.7, -1000.6]) - (a + b) / 2) < 0:
            n = -n
        g = min(D.ground(*a), D.ground(*b))
        z0, z1 = g + MAGNET["z"][0], g + MAGNET["z"][1]
        o = MAGNET["out"]
        K["x_shop"].quad(np.array([*(a + n * 0.05), g - 0.1]), np.array([*(b + n * 0.05), g - 0.1]), np.array([*(b + n * 0.05), z0]), np.array([*(a + n * 0.05), z0]),
                         [[0, 0], [L, 0], [L, z0 - g + 0.1], [0, z0 - g + 0.1]])
        # the sloping fascia: from its foot out over the pavement up to the wall, its soffit lit
        lo_a, lo_b = a + n * o, b + n * o
        if n @ np.array([-f[1], f[0]]) > 0:
            quad = (np.array([*lo_a, z0]), np.array([*lo_b, z0]), np.array([*b, z1]), np.array([*a, z1]))
        else:
            quad = (np.array([*lo_b, z0]), np.array([*lo_a, z0]), np.array([*a, z1]), np.array([*b, z1]))
        panel.quad(*quad)
        panel.quad(np.array([*a, z0 - 0.02]), np.array([*b, z0 - 0.02]), np.array([*lo_b, z0 - 0.02]), np.array([*lo_a, z0 - 0.02]))
        K["x_light"].quad(np.array([*(a + n * (o - 0.3)), z0 - 0.03]), np.array([*(b + n * (o - 0.3)), z0 - 0.03]), np.array([*(b + n * (o - 0.45)), z0 - 0.03]),
                          np.array([*(a + n * (o - 0.45)), z0 - 0.03]))
        if k == 0:   # the name on the corner's fascia, read from the scramble
            c0, c1 = (lo_a + a) / 2, (lo_b + b) / 2
            t = c1 - c0
            m0, m1 = c0 + t * 0.08 + n * 0.03, c0 + t * 0.92 + n * 0.03
            p0, p1 = m0 + n * 0.4, m1 + n * 0.4
            pts = (np.array([*p0, z0 + 0.55]), np.array([*p1, z0 + 0.55]), np.array([*(m1 - n * 0.4), z1 - 0.45]), np.array([*(m0 - n * 0.4), z1 - 0.45]))
            nrm = np.cross(pts[1] - pts[0], pts[3] - pts[0])
            if nrm @ np.array([*n, 0.5]) < 0:              # face it out, so it reads left to right from the street
                pts = (pts[1], pts[0], pts[3], pts[2])
            A.quad(K["x_atlas"], *pts, "magnet_name")


def draw_magnet(img, rects):
    x, y, w, h = rects["magnet_name"]
    im = Image_new(w, h, (206, 210, 214))
    ad.text(im, (w * 0.42, h * 0.5), "MAGNET", "mincho", int(h * 0.7), fill="#d01e2a")
    ad.text(im, (w * 0.86, h * 0.56), "by SHIBUYA109", "mincho", int(h * 0.2), fill="#d01e2a")
    img.paste(im, (x, y))


# ---------------------------------------------------------------- the bookshop on Center Gai's corner

# On the corner where Center Gai meets the scramble stands a bookshop that has been there since 1912, in a
# narrow building at the south-east corner of the block (OSM's w136690966 is the whole block). Its front
# is the corner's chamfer, facing the crossing, and a few metres of the side on the street to the south:
# white clapboard to the first floor, the shop window and door on the chamfer under a blue awning with the
# shop's name in white, and over them a big white box sign, lit from inside, wrapping round the corner:
# the name in heavy blue characters inside a red outline of an open book, the romanised name in red
# under it, a blue edge along its foot (photographs 2021-24). The name is invented in the real one's
# pattern -- five characters, □□堂書店, set the same way in the same colours -- not the real shop's.
# Sizes from photographs, scaled from the door: the awning at 3.0-3.45 m, the sign 3.6-6.9 m.
BOOKSHOP = {"a": (323.6, -975.2), "b": (329.9, -969.4), "south_from": (295.4, -978.2), "return_m": 3.4,
            "name": ("大昇", "堂書店"), "roman": "BOOKS TAISHODO", "awning": "TAISHODO",
            "sign_z": (3.6, 6.9), "sign_off": 0.75, "awning_z": (3.0, 3.45), "awning_out": 1.15}


def _offset_corner(a, n1, f1, n2, f2, off):
    """Where the two faces' lines, each moved `off` out along its normal, meet (the sign's mitre)."""
    p, q = a + n1 * off, a + n2 * off
    M = np.array([f1, -f2]).T
    t = np.linalg.solve(M, q - p)
    return p + f1 * t[0]


def bookshop(K, A, D):
    """The corner bookshop: clapboard, shop window, awning and the wrapping box sign (BOOKSHOP)."""
    B = BOOKSHOP
    a, b, s0 = (np.asarray(B[k], float) for k in ("a", "b", "south_from"))
    f1 = unit(b - a)                       # along the chamfer, from the south corner to Center Gai's
    n1 = np.array([f1[1], -f1[0]])         # its outward normal (the crossing)
    f2 = unit(a - s0)                      # along the south face, toward the corner
    n2 = np.array([f2[1], -f2[0]])         # its outward normal (the street to the south)
    Lc, Lr = float(np.linalg.norm(b - a)), B["return_m"]
    r0 = a - f2 * Lr                       # where the shop's front starts on the south face
    g = min(D.ground(*a), D.ground(*b), D.ground(*r0))

    def face(p, q, n, off, z0, z1, m, uvm=True):
        p, q = p + n * off, q + n * off
        L = float(np.linalg.norm(q - p))
        m.quad(np.array([*p, z0]), np.array([*q, z0]), np.array([*q, z1]), np.array([*p, z1]),
               [[0, z0 - g], [L, z0 - g], [L, z1 - g], [0, z1 - g]] if uvm else None)

    za0, za1 = (g + z for z in B["awning_z"])
    # the ground floor: clapboard, the window and door on the chamfer, a display window on the side
    face(r0, a, n2, 0.12, g, za1, K["x_clap"])
    face(a, b, n1, 0.12, g, za1, K["x_clap"])
    for p, q, n, inset in ((a, b, n1, 1.1), (r0, a, n2, 0.6)):
        ff = unit(q - p)
        pp, qq = p + ff * inset, q - ff * (inset if n is n1 else 1.4)
        face(pp, qq, n, 0.14, g + (0.03 if n is n1 else 0.7), g + 2.55, K["x_shop"])
        P = frame(pp + n * 0.14, n)
        Lw = float(np.linalg.norm(qq - pp))
        for v in np.linspace(0, Lw, max(2, int(Lw / 1.5)) + 1):     # mullions
            box(K["x_frame"], P, 0.0, 0.05, v - 0.03, v + 0.03, g + (0.03 if n is n1 else 0.7), g + 2.55)
        box(K["x_frame"], P, 0.0, 0.05, 0.0, Lw, g + 2.55, g + 2.66)
    # the awning: sloping out from the wall, its front valance carrying the name in white
    for p, q, n in ((r0, a, n2), (a, b, n1)):
        out = B["awning_out"]
        pa, qa = p + n * 0.12, q + n * 0.12
        po, qo = pa + n * out, qa + n * out
        K["x_bk_blue"].quad(np.array([*pa, za1]), np.array([*po, za0 + 0.25]), np.array([*qo, za0 + 0.25]), np.array([*qa, za1]))
        K["x_bk_blue"].quad(np.array([*qa, za1 - 0.02]), np.array([*qo, za0 + 0.23]), np.array([*po, za0 + 0.23]), np.array([*pa, za1 - 0.02]))
        if n is n1:
            A.quad(K["x_atlas"], np.array([*po, za0]), np.array([*qo, za0]), np.array([*qo, za0 + 0.25]), np.array([*po, za0 + 0.25]), "bk_awning")
        else:
            K["x_bk_blue"].quad(np.array([*po, za0]), np.array([*qo, za0]), np.array([*qo, za0 + 0.25]), np.array([*po, za0 + 0.25]))
    # the sign box round the corner: its face (one image across both faces), top, foot and ends
    zs0, zs1 = (g + z for z in B["sign_z"])
    off = B["sign_off"]
    c = _offset_corner(a, n1, f1, n2, f2, off)
    s_start, s_end = r0 + n2 * off, b + n1 * off + f1 * 0.2
    L1, L2 = float(np.linalg.norm(c - s_start)), float(np.linalg.norm(s_end - c))
    u0, v0, u1, v1 = A.uv("bk_sign")
    um = u0 + (u1 - u0) * L1 / (L1 + L2)
    zb = zs0 + 0.16                         # (the blue edge along its foot)
    K["x_bk_sign"].quad(np.array([*s_start, zb]), np.array([*c, zb]), np.array([*c, zs1]), np.array([*s_start, zs1]), [[u0, v0], [um, v0], [um, v1], [u0, v1]])
    K["x_bk_sign"].quad(np.array([*c, zb]), np.array([*s_end, zb]), np.array([*s_end, zs1]), np.array([*c, zs1]), [[um, v0], [u1, v0], [u1, v1], [um, v1]])
    for p, q in ((s_start, c), (c, s_end)):
        K["x_bk_blue"].quad(np.array([*p, zs0]), np.array([*q, zs0]), np.array([*q, zb]), np.array([*p, zb]))
    wall_s, wall_e = r0 + n2 * 0.1, b + n1 * 0.1 + f1 * 0.2
    wall_c = _offset_corner(a, n1, f1, n2, f2, 0.1)
    for z, up in ((zs1, True), (zs0, False)):      # its top and its underside: a band bent round the corner
        for quad in ((wall_s, s_start, c, wall_c), (wall_c, c, s_end, wall_e)):
            for tri in ((quad[0], quad[1], quad[2]), (quad[0], quad[2], quad[3])):
                pts = [np.array([*p, z]) for p in tri]
                nz = np.cross(pts[1] - pts[0], pts[2] - pts[0])[2]
                K["x_bk_box"].tri(*(pts if (nz > 0) == up else pts[::-1]))
    for p, q in ((wall_s, s_start), (s_end, wall_e)):  # its ends
        K["x_bk_box"].quad(np.array([*p, zs0]), np.array([*q, zs0]), np.array([*q, zs1]), np.array([*p, zs1]))
        K["x_bk_box"].quad(np.array([*q, zs0]), np.array([*p, zs0]), np.array([*p, zs1]), np.array([*q, zs1]))


def draw_bookshop(img, rects):
    from PIL import ImageDraw
    x, y, w, h = rects["bk_sign"]
    B = BOOKSHOP
    a, b, s0 = (np.asarray(B[k], float) for k in ("a", "b", "south_from"))
    Lc = float(np.linalg.norm(b - a)) + 0.2 + 0.5
    split = int(w * (B["return_m"] + 0.5) / (B["return_m"] + 0.5 + Lc))
    im = Image_new(w, h, (238, 236, 229))   # (a diffuser's warm white, not the paper's 255: it is the light's colour after dark)
    d = ImageDraw.Draw(im)
    red, blue = (214, 40, 40), (24, 56, 190)
    # the open book: a red outline, its pages' top edges dipping to the spine at the corner (the side face
    # carries its left page, the front its right)
    lw = max(6, h // 40)
    top, bot = h * 0.1, h * 0.86
    spine = split                           # at the corner, where the box turns
    pts_top = [(lw, top + h * 0.06), (spine * 0.5, top), (spine, top + h * 0.1), (spine + (w - spine) * 0.5, top), (w - lw, top + h * 0.06)]
    d.line(pts_top, fill=red, width=lw, joint="curve")
    d.line([(lw, top + h * 0.06), (lw, bot)], fill=red, width=lw)
    d.line([(lw, bot), (spine, bot + h * 0.04), (w * 0.74, bot)], fill=red, width=lw)
    d.line([(spine, top + h * 0.1), (spine, bot + h * 0.04)], fill=red, width=max(3, lw // 2))
    # the name: two characters on the side, three on the front
    left, right = B["name"]
    sz = int(h * 0.62)
    for k, ch in enumerate(left):
        ad.text(im, (split * (k + 0.5) / len(left), h * 0.5), ch, "zen", min(sz, int(split / len(left) * 0.92)), fill="#1838be")
    span = (w - split) * 0.96
    for k, ch in enumerate(right):
        ad.text(im, (split + span * (k + 0.42) / len(right), h * 0.44), ch, "zen", sz, fill="#1838be")
    ad.text(im, (w * 0.86, h * 0.8), B["roman"], "anton", int(h * 0.13), fill="#d42a2a")
    img.paste(im, (x, y))
    x, y, w, h = rects["bk_awning"]
    im = Image_new(w, h, (31, 69, 168))
    ad.text(im, (w * 0.5, h * 0.52), B["awning"], "anton", int(h * 0.74), fill="#ffffff", spacing=int(h * 0.1))
    img.paste(im, (x, y))


# ---------------------------------------------------------------- the JR station's Hachiko side

# OSM maps JR Shibuya station's whole outline as one 15 m building, which the generic styles drew as a
# yellow stone palace. Its Hachiko side is a works site in 2024-26 (the station's rebuilding): pale
# panel walls over the concourse, hoardings at the foot, and over them steel scaffolds that carry huge
# adverts facing the square (photographs 2024-25; the hoarding is still there in JR East's notices of February
# 2026, and the works run to fiscal 2027). Drawn so on OSM's outline, its height kept, with the koban's corner left
# open; the advert is invented.
STATION = {"osm": "w904652357", "billboard": {"a": (407.9, -1022.5), "b": (411.4, -1052.0), "z": (8.0, 19.5), "lift": 1.5}}

# The station's way through from the square, ハチ公口 (OSM's node "Hachiko Exit", beside the police box), to the
# Miyamasuzaka exit on its east side (OSM's node 宮益坂口), along the footway OSM maps through it (the free passage, 43 m).
# The Hachiko gate that faced the square closed on 26 January 2025 and opened again on this passage, toward
# Miyamasuzaka; since 1 March 2026 the way in from the square is a passage through the works (JR East's notices on the
# hoarding, February 2026). Drawn: both openings with the station's sign over them, the passage lit by its own lamps,
# and the gate on its south side with the concourse behind it. Walked: the landmark's mesh is the station's wall to a
# walker (nav.js: a solid a landmark draws instead is not one), so the passage is open from one street to the other
# and the gate's closed flaps are the end of the free side. Its width and clear height (5.6 m, 3.2 m), the gate's
# place on the passage and its six lanes are estimates; the signs are drawn in the station's pattern (a green band, a
# black board for the gates and the lines, a yellow one for an exit), its notices and the poster invented.
HACHIKO_EXIT = {"node": 6223298623, "east": 8401481034,
                "way": [(420.2, -1027.8), (424.7, -1023.7), (432.4, -1022.0), (441.0, -1021.1)],   # (OSM's footway's bends)
                "w": 5.6, "h": 3.2, "band": 0.8, "end": 0.45, "floor": 0.05,   # (its floor: that far over the game's ground, as the hero level's paving outside is)
                "gate": {"leg": 3, "from": 0.8, "to": 0.6, "deep": 8.0, "lanes": 6}}
_LEVELS = {}


def ground_levels():
    """The ground everything built stands on (pipeline/levels.py): the game's, graded."""
    import levels
    if "shibuya" not in _LEVELS:
        _LEVELS["shibuya"] = levels.Levels("shibuya")
    return _LEVELS["shibuya"]


def face_at(O, x, inward, w):
    """The face of outline O at the point x (within a metre) whose outside looks away from `inward`, and the middle of
    an opening w wide on it, as near x as the face leaves 0.4 m either side: (a, b, n, L, middle), or None."""
    best = None
    out = unit(np.asarray(x, float) - np.asarray(inward, float))
    for a, b, n, L in ring_edges(O):
        f = (b - a) / L
        t = float((x - a) @ f)
        dd = abs(float(f[0] * (x - a)[1] - f[1] * (x - a)[0]))
        if -1.0 < t < L + 1.0 and dd < 1.0 and L > w + 0.8 and float(n @ out) > 0.5 and (best is None or float(n @ out) > best[0]):
            best = (float(n @ out), a, b, n, L, a + f * min(max(t, w / 2 + 0.4), L - w / 2 - 0.4))
    return best[1:] if best else None


def meet(p, u, q, v):
    """Where the line p + s u meets the line q + t v."""
    m = np.array([[u[0], -v[0]], [u[1], -v[1]]])
    s, _ = np.linalg.solve(m, np.asarray(q, float) - np.asarray(p, float))
    return np.asarray(p, float) + np.asarray(u, float) * s


def way_plan(D, O):
    """The way through the station (HACHIKO_EXIT) in the outline O: its centre line Q from the west face to the east,
    the passage's edges either side (Lp to its left going east, Rp to its right: mitred at its bends, cut by each face),
    the stations along Q, the floor's level at either end, and the openings it makes in the faces; None if its nodes
    or faces are not there."""
    E = HACHIKO_EXIT
    nw, ne = D.by_id.get(E["node"]), D.by_id.get(E["east"])
    if nw is None or ne is None:
        return None
    way = [np.asarray(p, float) for p in E["way"]]
    fw, fe = face_at(O, nw["xy"], way[0], E["w"]), face_at(O, ne["xy"], way[-1], E["w"])
    if fw is None or fe is None:
        return None
    Q = [fw[4]] + way + [fe[4]]
    hw = E["w"] / 2
    d = [unit(Q[i + 1] - Q[i]) for i in range(len(Q) - 1)]
    lft = [np.array([-v[1], v[0]]) for v in d]
    Lp, Rp = [], []
    for i in range(len(Q)):
        if i in (0, len(Q) - 1):
            k, (a, b) = (0, fw[:2]) if i == 0 else (len(d) - 1, fe[:2])
            Lp.append(meet(Q[i] + lft[k] * hw, d[k], a, b - a))
            Rp.append(meet(Q[i] - lft[k] * hw, d[k], a, b - a))
        else:
            m = unit(lft[i - 1] + lft[i])
            k = hw / float(m @ lft[i])
            Lp.append(Q[i] + m * k)
            Rp.append(Q[i] - m * k)
    s = np.concatenate([[0.0], np.cumsum([np.linalg.norm(Q[i + 1] - Q[i]) for i in range(len(Q) - 1)])])
    # the floor is laid on the game's ground (levels.Levels), not level: under the station it falls 0.4 m from the square to
    # the passage's middle and rises again, and a level floor had walkers' feet in it
    GL = ground_levels()
    zw, ze = float(GL.at(*Q[0])) + E["floor"], float(GL.at(*Q[-1])) + E["floor"]
    opens = []
    for (a, b, n, L, _), l_, r_, z, cell in ((fw, Lp[0], Rp[0], zw, "band_w"), (fe, Lp[-1], Rp[-1], ze, "band_e")):
        f = (b - a) / L
        t0, t1 = sorted([float((l_ - a) @ f), float((r_ - a) @ f)])
        opens.append({"a": a, "b": b, "n": n, "L": L, "t0": t0, "t1": t1, "z": z, "band": cell})
    return {"Q": Q, "L": Lp, "R": Rp, "s": s, "d": d, "lft": lft, "zw": zw, "ze": ze, "open": opens}


def station_hoarding(K, A, p, q, koban_box):
    """The works' hoarding from p to q (0.08 m off the face): its printed panels about 9 m long, level-topped and stepped
    at their joints, their feet in the ground (levels.stepped), none behind the police box."""
    import levels
    keep = (lambda a, b: koban_box.distance(Point(*((a + b) / 2))) >= 3.5) if koban_box is not None else None
    bays = levels.stepped([p, q], ground_levels(), 3.0, bay=9.0, keep=keep, kind="hoarding")
    u0, v0, u1, v1 = A.uv("st_hoarding")
    for bay in bays:
        K["x_print"].quad(np.array([*bay.a, bay.foot]), np.array([*bay.b, bay.foot]), np.array([*bay.b, bay.top]), np.array([*bay.a, bay.top]),
                          [[u0, v0], [u1, v0], [u1, v1], [u0, v1]])
    return bays


def station(K, A, D, koban_box):
    """The station's Hachiko side drawn; returns the solids it draws instead, and where the ground is not drawn (the way
    in's passage: the ground under the station rises east of the threshold, through its level floor)."""
    sol = [s for s in D.solids if s["osm"] == STATION["osm"]]
    if not sol:
        return [], []
    wall = K["x_station"]
    low, clips = None, []                              # the scaffold's foot: over the way in's sign where there is one
    for q in sol:
        O = Polygon(q["ring"]).buffer(0)
        if koban_box is not None:
            O = O.difference(koban_box.buffer(0.4, join_style=2))
        if O.is_empty:
            continue
        O = max(getattr(O, "geoms", [O]), key=lambda p_: p_.area)
        zt = q["ground"] + q["top"]
        W = way_plan(D, O) if q["top"] < 16 else None
        for a, b, n, L in ring_edges(O):
            g = min(D.ground(*a), D.ground(*b))
            f = (b - a) / L
            spans, s0 = [], 0.0                        # the face, less the openings the way through makes in it
            for c0, c1 in sorted((o["t0"], o["t1"]) for o in (W["open"] if W else []) if np.allclose(a, o["a"]) and np.allclose(b, o["b"])):
                spans.append((s0, c0))
                s0 = c1
            spans.append((s0, L))
            for s0, s1 in spans:
                if s1 - s0 > 1e-3:
                    p, r_ = a + f * s0, a + f * s1
                    wall.quad(np.array([*p, g]), np.array([*r_, g]), np.array([*r_, zt]), np.array([*p, zt]), [[s0, g], [s1, g], [s1, zt], [s0, zt]])
            if n[0] < -0.5 and L > 3.0 and q["top"] < 16:      # the side on Hachiko Square: a hoarding along its foot, stopping at the way in's end panels
                for s0, s1 in spans:
                    s0, s1 = s0 + (HACHIKO_EXIT["end"] if s0 > 0 else 0.0), s1 - (HACHIKO_EXIT["end"] if s1 < L else 0.0)
                    if s1 - s0 > 1.5:
                        station_hoarding(K, A, a + f * s0 + n * 0.08, a + f * s1 + n * 0.08, koban_box)
        if W:
            low, room = hachiko_way(K, A, D, W, zt)
            clips.append({"ring": room})
        ak.cap(K["x_qf_roof"], ak.WORLD, [tuple(p) for p in list(O.exterior.coords)[:-1]], zt)
    # the scaffold over the square and its advert
    bb = STATION["billboard"]
    a, b = np.asarray(bb["a"]), np.asarray(bb["b"])
    f = unit(b - a)
    n = np.array([-f[1], f[0]])
    if n[0] > 0:
        n = -n
    g = D.ground(*a)
    z0, z1 = g + bb["z"][0], g + bb["z"][1]
    lift = bb["lift"]
    steel = K["x_jr_steel"]
    L = float(np.linalg.norm(b - a))
    # its standards start over the hoarding, and over the way in's sign where they pass it (their lowest ledger ran
    # across the sign's face), tied back to the station's front at their feet
    low = max(g + 3.0, low or 0.0)
    for k in range(int(L // 3.0) + 1):
        p = a + f * min(L, k * 3.0)
        for d in (0.3, 1.5):
            q = p + n * d
            steel.tube([np.array([*q, low]), np.array([*q, z1 + 0.6])], 0.05, 4)
        steel.tube([np.array([*(p + n * 1.5), low]), np.array([*(p - n * 0.8), low])], 0.04, 4)
    for z in np.arange(low, z1 + 0.7, 2.0):
        for d in (0.3, 1.5):
            steel.tube([np.array([*(a + n * d), z]), np.array([*(b + n * d), z])], 0.04, 4)
    q0, q1 = a + n * (lift + 0.05), b + n * (lift + 0.05)
    pts = [np.array([*q0, z0]), np.array([*q1, z0]), np.array([*q1, z1]), np.array([*q0, z1])]
    if np.cross(pts[1] - pts[0], pts[3] - pts[0]) @ np.array([*n, 0]) < 0:
        pts = [pts[1], pts[0], pts[3], pts[2]]
    A.quad(K["x_print"], *pts, "st_billboard")
    for k in range(6):      # its lamps, on arms over the top
        p = a + f * L * (k + 0.5) / 6 + n * (lift + 1.4)
        box(K["x_light"], frame(p, n), -0.25, 0.25, -0.3, 0.3, z1 + 0.4, z1 + 0.7)
        q = a + f * L * (k + 0.5) / 6                      # its arm, from the frame's top rail out over the face
        steel.tube([np.array([*(q + n * 0.3), z1 + 0.6]), np.array([*(q + n * (lift + 0.6)), z1 + 0.95]), np.array([*(p - n * 0.2), z1 + 0.72])], 0.035, 4)
    return [q["si"] for q in sol], clips


# The cells of the way in's signs and prints, in one atlas cell ("st_hachiko", 1000 x 480: it sits in the shelf beside
# the scaffold's advert, where the atlas has room): (x, y, w, h) in its pixels, each at its face's proportions.
HACHIKO_CELLS = {"band_w": (0, 0, 496, 62), "band_e": (504, 0, 496, 62),
                 "gate_up": (0, 70, 324, 53), "gate_right": (338, 70, 324, 53), "exit_up": (676, 70, 324, 53),
                 "hexit_up": (0, 131, 324, 53), "gate_band": (338, 131, 324, 53), "lines": (676, 131, 324, 53),
                 "notice": (0, 192, 200, 284), "plan": (212, 192, 440, 284), "stripes": (664, 192, 44, 284), "poster": (720, 192, 280, 284)}


def cell_quad(m, A, pts, cell):
    """A picture face a-b-c-d (counter-clockwise seen from its face, a bottom-left) showing one of HACHIKO_CELLS."""
    x, y, _w, _h = A.rects["st_hachiko"]
    sx, sy, sw, sh = HACHIKO_CELLS[cell]
    u0, u1 = (x + sx + 1) / A.W, (x + sx + sw - 1) / A.W
    v0, v1 = 1 - (y + sy + sh - 1) / A.H, 1 - (y + sy + 1) / A.H
    m.quad(*pts, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]])


def hachiko_way(K, A, D, W, zt):
    """The way through (way_plan's W) drawn: in each face its opening, the wall over it, its steel frame and the lit sign
    band over it (on the square's side the hoarding's striped end panels either side); the passage, its floor laid on
    the ground walkers stand on, white works panels with a dark kick strip, a white ceiling running evenly from one
    threshold's height to the other's, its
    lamps and a yellow guide line; the gate on its south side, its closed flaps, and the concourse behind it; the hung
    signs and the prints on its walls. Returns the level the scaffold over the square starts at (over the west sign) and
    the outline the ground is not drawn in (the ground under the station rises through the passage's floor)."""
    E, G_ = HACHIKO_EXIT, HACHIKO_EXIT["gate"]
    h, band, end, hw = E["h"], E["band"], E["end"], E["w"] / 2
    Q, Lp, Rp, s, d, lft = W["Q"], W["L"], W["R"], W["s"], W["d"], W["lft"]
    S = float(s[-1])
    zs = lambda u: W["zw"] + (W["ze"] - W["zw"]) * float(u) / S          # the ceiling's datum at a station along the way (less h)
    fr, Wl, Cl, Fl, Lm = K["x_frame"], K["x_pass_wall"], K["x_pass_ceil"], K["x_pass_floor"], K["x_pass_lamp"]
    for m in (Wl, Cl, Fl, K["x_pass_tactile"], K["x_pass_tactile_dot"], K["x_pass_gate"]):   # (shut in: its own lamps light it, not the sun nor the screens across the square)
        m.sky, m.bounce, m.direct = 0.12, "#9c9a94", 0.0
    GL = ground_levels()
    fz = lambda x, y: float(GL.at(x, y)) + E["floor"]                     # the floor at (x, y)
    low = None
    for o in W["open"]:
        a, b, n, L, t0, t1, z = o["a"], o["b"], o["n"], o["L"], o["t0"], o["t1"], o["z"]
        f = (b - a) / L
        p0, p1 = a + f * t0, a + f * t1
        P = frame((p0 + p1) / 2, -n)                   # (u: in from the face; v: to the left looking in)
        ow = (t1 - t0) / 2
        K["x_station"].quad(np.array([*p0, z + h]), np.array([*p1, z + h]), np.array([*p1, zt]), np.array([*p0, zt]), [[t0, z + h], [t1, z + h], [t1, zt], [t0, zt]])
        if n[0] < -0.5:                                # on the square: the hoarding's end panels, striped as the works' are
            for e0, e1 in ((max(0.0, t0 - end), t0), (t1, min(L, t1 + end))):
                q0, q1 = a + f * e0 + n * 0.1, a + f * e1 + n * 0.1          # (seen from outside, f runs to the right)
                cell_quad(K["x_print"], A, [np.array([*q0, z - 0.25]), np.array([*q1, z - 0.25]), np.array([*q1, z + h]), np.array([*q0, z + h])], "stripes")
            low = z + h + 0.02 + band + 0.35
        for v in (-ow, ow):                            # the steel frame, and over it the station's sign: a lit box, a line of light under it
            box(fr, P, -0.12, 0.04, v - 0.08, v + 0.08, z - 0.1, z + h)
        box(fr, P, -0.12, 0.04, -ow - 0.08, ow + 0.08, z + h - 0.12, z + h)
        bv = 4.0 * band                                # (the band's face at its cell's proportions, 8 to 1)
        box(fr, P, -0.34, -0.02, -bv, bv, z + h + 0.02, z + h + 0.02 + band)
        cell_quad(K["x_pass_sign"], A, [P(-0.345, bv - 0.03, z + h + 0.05), P(-0.345, -bv + 0.03, z + h + 0.05),
                                        P(-0.345, -bv + 0.03, z + h - 0.01 + band), P(-0.345, bv - 0.03, z + h - 0.01 + band)], o["band"])
        box(Lm, P, -0.26, -0.16, -ow + 0.2, ow - 0.2, z + h - 0.01, z + h + 0.02)
    gk = G_["leg"]
    g0, g1 = G_["from"], float(s[gk + 1] - s[gk]) - G_["to"]        # the gate's opening along its leg

    def z_on(i, p):                                    # the floor's level at a point of leg i
        return zs(s[i] + min(max(float((p - Q[i]) @ d[i]), 0.0), float(s[i + 1] - s[i])))

    def panel(p, q, top, k):                           # a wall from p to q, its foot in the floor a metre at a time, up to top(point);
        Lw = float(np.linalg.norm(q - p))              # and its kick strip, k off it on the passage's side
        n_ = max(1, int(math.ceil(Lw / 1.0)))
        for j in range(n_):
            a_, b_ = p + (q - p) * j / n_, p + (q - p) * (j + 1) / n_
            fa, fb, ca, cb, s0, s1 = fz(*a_), fz(*b_), top(a_), top(b_), Lw * j / n_, Lw * (j + 1) / n_
            Wl.quad(np.array([*a_, fa - 0.03]), np.array([*b_, fb - 0.03]), np.array([*b_, cb]), np.array([*a_, ca]), [[s0, fa], [s1, fb], [s1, cb], [s0, ca]])
            fr.quad(np.array([*(a_ + k), fa - 0.03]), np.array([*(b_ + k), fb - 0.03]), np.array([*(b_ + k), fb + 0.1]), np.array([*(a_ + k), fa + 0.1]))

    def run(i, p, q, side):                            # a wall of leg i, up to the ceiling
        panel(p, q, lambda x: z_on(i, x) + h, -side * lft[i] * 0.015)

    def lay(m, pts_of, nu, nv, uv_of, lift=0.0):       # a floor or a strip on it: a grid of points on the floor
        rows, uvs = [], []
        for j in range(nu + 1):
            row, urow = [], []
            for c in range(nv + 1):
                xy = pts_of(j / nu, c / nv)
                row.append(np.array([*xy, fz(*xy) + lift]))
                urow.append(uv_of(xy))
            rows.append(row)
            uvs.append(urow)
        m.grid(rows, uvs)

    def strip(m, i, u0, u1, v0, v1, lift=0.009):       # a strip of leg i's floor, laid on it (a little proud: its grid is not the floor's)
        P = frame(Q[i], d[i])
        nu, nv = max(1, int(math.ceil(abs(u1 - u0) / 0.5))), max(1, int(math.ceil(abs(v1 - v0) / 0.5)))
        lay(m, lambda a_, c_: P(u0 + (u1 - u0) * a_, v0 + (v1 - v0) * c_, 0)[:2], nu, nv,
            lambda xy: [float((xy - Q[i]) @ d[i]), float((xy - Q[i]) @ lft[i])], lift)

    for i in range(len(Q) - 1):
        Li = float(s[i + 1] - s[i])
        P = frame(Q[i], d[i])
        za, zb = zs(s[i]), zs(s[i + 1])
        uv = lambda p: [float((p - Q[i]) @ d[i] + s[i]), float((p - Q[i]) @ lft[i])]
        quad = [Lp[i], Rp[i], Rp[i + 1], Lp[i + 1]]
        lay(Fl, lambda a_, c_, i=i: (Lp[i] + (Lp[i + 1] - Lp[i]) * a_) * (1 - c_) + (Rp[i] + (Rp[i + 1] - Rp[i]) * a_) * c_,
            max(1, int(math.ceil(Li / 0.5))), 8, uv)
        Cl.quad(*[np.array([*p, z_ + h]) for p, z_ in zip(quad[::-1], (zb, zb, za, za))], [uv(p) for p in quad[::-1]])
        run(i, Lp[i], Lp[i + 1], 1)
        if i == gk:
            run(i, Rp[i], Q[i] + d[i] * g0 - lft[i] * hw, -1)
            run(i, Q[i] + d[i] * g1 - lft[i] * hw, Rp[i + 1], -1)
        else:
            run(i, Rp[i], Rp[i + 1], -1)
        for v in (-1.25, 1.25):                        # its lamps: LED fittings in two lines, lit day and night
            for u in np.arange(0.6, Li - 0.5, 1.5):
                zu = zs(s[i] + u)
                box(Lm, P, u, min(u + 1.2, Li - 0.3), v - 0.06, v + 0.06, zu + h - 0.05, zu + h - 0.005)
        strip(K["x_pass_tactile"], i, 0.3, Li - 0.3, -0.15, 0.15)       # the guide line down its middle, dots at each bend
        if i > 0:
            strip(K["x_pass_tactile_dot"], i, -0.3, 0.3, -0.3, 0.3, 0.011)
    # the gate: its opening in the south wall, six lanes between seven cabinets, their flaps closed, and the concourse
    i, Li = gk, float(s[gk + 1] - s[gk])
    P = frame(Q[i], d[i])
    zg, dp = zs(s[i] + (g0 + g1) / 2), G_["deep"]
    A0, A1 = Q[i] + d[i] * g0 - lft[i] * hw, Q[i] + d[i] * g1 - lft[i] * hw
    B0, B1 = A0 - lft[i] * dp, A1 - lft[i] * dp
    room = [(g0, -hw), (g1, -hw), (g1, -hw - dp), (g0, -hw - dp)]
    # (its floor runs 0.15 m on under the passage's and a hair lower, so that where the two grids meet across the ground's
    # creases there is no crack: one showed the light through it as a broken line along the gate's opening)
    lay(Fl, lambda a_, c_: P(g0 + (g1 - g0) * a_, -hw + 0.15 - (dp + 0.15) * c_, 0)[:2], max(1, int(math.ceil((g1 - g0) / 0.5))), max(1, int(math.ceil(dp / 0.5))),
        lambda xy: [float((xy - Q[i]) @ d[i]), float((xy - Q[i]) @ lft[i])], -0.004)
    Cl.quad(*[P(u, v, zg + h) for u, v in room[::-1]], [[u, v] for u, v in room[::-1]])
    for (u0, v0), (u1, v1) in (((g0, -hw), (g0, -hw - dp)), ((g0, -hw - dp), (g1, -hw - dp)), ((g1, -hw - dp), (g1, -hw))):
        p, q = P(u0, v0, 0)[:2], P(u1, v1, 0)[:2]
        c = (p + q) / 2
        panel(p, q, lambda x: zg + h, unit(P((g0 + g1) / 2, -hw - dp / 2, 0)[:2] - c) * 0.015)
    for v in (-hw - 3.0, -hw - 6.0):
        for u in np.arange(g0 + 0.4, g1 - 0.6, 1.5):
            box(Lm, P, u, min(u + 1.2, g1 - 0.3), v - 0.06, v + 0.06, zg + h - 0.05, zg + h - 0.005)
    lanes = G_["lanes"]
    cu = [g0 + 0.3 + k * (g1 - g0 - 0.6) / lanes for k in range(lanes + 1)]
    for u in cu:                                       # the cabinets: pale panels, a black top, standing on the floor
        zc = fz(*P(u, -hw - 1.65, 0)[:2])
        box(K["x_pass_gate"], P, u - 0.11, u + 0.11, -hw - 2.3, -hw - 1.0, zc - 0.03, zc + 0.95)
        box(K["x_dark"], P, u - 0.12, u + 0.12, -hw - 2.32, -hw - 0.98, zc + 0.95, zc + 1.0)
    for ua, ub in zip(cu[:-1], cu[1:]):                # the flaps, closed across each lane
        um = (ua + ub) / 2
        zc = fz(*P(um, -hw - 1.65, 0)[:2])
        for x0, x1 in ((ua + 0.11, um - 0.01), (um + 0.01, ub - 0.11)):
            box(fr, P, x0, x1, -hw - 1.662, -hw - 1.638, zc + 0.45, zc + 0.92)
    strip(K["x_pass_tactile"], i, (g0 + g1) / 2 - 0.15, (g0 + g1) / 2 + 0.15, -hw - 0.9, -0.3)   # (the guide line's branch to the gate)
    uc = (g0 + g1) / 2                                 # the gate's band over its opening, facing the passage
    zb0, zb1 = zg + h - 0.8, zg + h - 0.08
    box(fr, P, uc - 2.2, uc + 2.2, -hw - 0.06, -hw, zb0, zb1)
    cell_quad(K["x_pass_sign"], A, [P(uc + 2.18, -hw + 0.005, zb0 + 0.02), P(uc - 2.18, -hw + 0.005, zb0 + 0.02),
                                    P(uc - 2.18, -hw + 0.005, zb1 - 0.02), P(uc + 2.18, -hw + 0.005, zb1 - 0.02)], "gate_band")
    zl0, zl1 = zg + h - 0.66, zg + h - 0.3            # and inside, the lines' board hung facing the gate
    box(fr, P, uc - 1.1, uc + 1.1, -hw - 5.54, -hw - 5.46, zl0, zl1)
    cell_quad(K["x_pass_sign"], A, [P(uc + 1.08, -hw - 5.455, zl0 + 0.02), P(uc - 1.08, -hw - 5.455, zl0 + 0.02),
                                    P(uc - 1.08, -hw - 5.455, zl1 - 0.02), P(uc + 1.08, -hw - 5.455, zl1 - 0.02)], "lines")
    for du in (-0.8, 0.8):
        K["x_jr_steel"].tube([P(uc + du, -hw - 5.5, zl1), P(uc + du, -hw - 5.5, zg + h)], 0.012, 4)

    def hang(i, u, face, cells, back=(None, None)):    # a pair of boards across leg i at u, on rods, facing back along it (face 1) or on (-1)
        P = frame(Q[i], d[i])                          # (cells: the viewer's left board, then the right; back: on their other faces, seen the other way)
        z = zs(s[i] + u)
        zb0, zb1 = z + h - 0.66, z + h - 0.3
        for vc, cell, other in ((1.3 * face, cells[0], back[1]), (-1.3 * face, cells[1], back[0])):
            box(fr, P, u - 0.04, u + 0.04, vc - 1.1, vc + 1.1, zb0, zb1)
            uf, ub = u - 0.045 * face, u + 0.045 * face
            l_, r_ = vc + 1.08 * face, vc - 1.08 * face
            cell_quad(K["x_pass_sign"], A, [P(uf, l_, zb0 + 0.02), P(uf, r_, zb0 + 0.02), P(uf, r_, zb1 - 0.02), P(uf, l_, zb1 - 0.02)], cell)
            if other:
                cell_quad(K["x_pass_sign"], A, [P(ub, r_, zb0 + 0.02), P(ub, l_, zb0 + 0.02), P(ub, l_, zb1 - 0.02), P(ub, r_, zb1 - 0.02)], other)
            for dv in (-0.8, 0.8):
                K["x_jr_steel"].tube([P(u, vc + dv, zb1), P(u, vc + dv, z + h)], 0.012, 4)

    hang(0, 6.0, 1, ("exit_up", "gate_up"), back=("hexit_up", "hexit_up"))     # (printed on both faces, as the station's are)
    hang(gk - 1, float(s[gk] - s[gk - 1]) - 1.2, 1, ("exit_up", "gate_right"), back=("hexit_up", "hexit_up"))
    hang(len(Q) - 2, float(s[-1] - s[-2]) - 4.5, -1, ("gate_up", "hexit_up"), back=("exit_up", "exit_up"))

    def print_on(i, u, side, wd, z0, z1, cell, framed=False):   # a picture on a wall of leg i (side 1 its left), facing into the passage
        P = frame(Q[i], d[i])
        z = zs(s[i] + u)
        v = side * (hw - 0.02)
        a_, b_ = (u - wd / 2, u + wd / 2) if side > 0 else (u + wd / 2, u - wd / 2)
        if framed:
            box(fr, P, u - wd / 2 - 0.05, u + wd / 2 + 0.05, side * hw - 0.04 * side, side * hw, z + z0 - 0.05, z + z1 + 0.05)
            v = side * (hw - 0.045)
        cell_quad(K["x_pass_sign"] if framed else K["x_print"], A, [P(a_, v, z + z0), P(b_, v, z + z0), P(b_, v, z + z1), P(a_, v, z + z1)], cell)

    print_on(0, 3.6, 1, 0.6, 1.25, 2.1, "notice")
    print_on(0, 8.2, 1, 0.6, 1.25, 2.1, "notice")
    print_on(gk, (g0 + g1) / 2, 1, 1.8, 1.0, 2.16, "plan", framed=True)
    print_on(len(Q) - 2, 4.0, -1, 2.0, 0.55, 2.57, "poster", framed=True)
    print_on(len(Q) - 2, 6.8, 1, 0.6, 1.25, 2.1, "notice")
    from shapely.ops import unary_union
    out = unary_union([Polygon([tuple(p) for p in Lp] + [tuple(p) for p in Rp[::-1]]).buffer(0),
                       Polygon([tuple(A0), tuple(A1), tuple(B1), tuple(B0)]).buffer(0.01)])
    out = max(getattr(out, "geoms", [out]), key=lambda p_: p_.area)
    return low, [[round(float(x), 2), round(float(y), 2)] for x, y in list(out.exterior.coords)[:-1]]


def draw_arrow(d, cx, cy, s, way, fill):
    """An arrow s pixels long centred at (cx, cy), pointing up or right."""
    hl, b, t = s * 0.42, s * 0.36, s * 0.12            # the head's length and half width, the shaft's half width
    pts = [(-t, s / 2), (-t, -s / 2 + hl), (-b, -s / 2 + hl), (0, -s / 2), (b, -s / 2 + hl), (t, -s / 2 + hl), (t, s / 2)]
    if way == "right":                                 # (turned a quarter clockwise: the image's y runs down)
        pts = [(-y, x) for x, y in pts]
    d.polygon([(cx + x, cy + y) for x, y in pts], fill=fill)


def draw_hachiko(img, rects):
    """The way in's signs and prints (HACHIKO_CELLS). The station's own words and the lines' letters; the notices'
    wording and the poster are invented."""
    from PIL import ImageDraw
    X, Y, W, H = rects["st_hachiko"]
    sheet = Image_new(W, H, (40, 42, 46))
    green, black, yellow = (16, 138, 74), (28, 30, 33), (246, 196, 0)

    def cell(k, c):
        x, y, w, h = HACHIKO_CELLS[k]
        im = Image_new(w, h, c)
        return im, ImageDraw.Draw(im), w, h

    def badges(im, d, x, cy, s):   # the lines through the gate: the Yamanote, the Saikyo and the Shonan-Shinjuku
        for k, (code, col) in enumerate((("JY", (128, 194, 65)), ("JA", (0, 172, 154)), ("JS", (226, 31, 38)))):
            x0 = x + k * (s + s * 0.18)
            d.rectangle([x0, cy - s / 2, x0 + s, cy + s / 2], fill=(255, 255, 255), outline=col, width=max(2, int(s * 0.12)))
            ad.text(im, (x0 + s / 2, cy), code, "zen", int(s * 0.46), fill="#1c1e21")

    for k, jp, en in (("band_w", "ハチ公口", "Hachiko Exit"), ("band_e", "宮益坂口", "Miyamasuzaka Exit")):   # the sign bands over the ways in
        im, d, w, h = cell(k, green)
        d.rectangle([0, h - 4, w, h], fill=(10, 96, 52))
        ad.text(im, (w * 0.14, h * 0.4), "渋谷駅", "zen", int(h * 0.42), fill="#ffffff")
        ad.text(im, (w * 0.14, h * 0.79), "Shibuya Sta.", "zen", int(h * 0.17), fill="#ffffff")
        d.line([(w * 0.285, h * 0.18), (w * 0.285, h * 0.82)], fill=(255, 255, 255), width=2)
        ad.text(im, (w * 0.5, h * 0.4), jp, "zen", int(h * 0.46), fill="#ffffff")
        ad.text(im, (w * 0.5, h * 0.8), en, "zen", int(h * 0.18), fill="#ffffff")
        badges(im, d, w * 0.75, h * 0.47, h * 0.42)
        sheet.paste(im, HACHIKO_CELLS[k][:2])
    for k, way in (("gate_up", "up"), ("gate_right", "right")):   # the gate's boards: black, the words in white
        im, d, w, h = cell(k, black)
        ax = h * 0.55 if way == "up" else w - h * 0.55
        draw_arrow(d, ax, h / 2, h * 0.72, way, (255, 255, 255))
        tx = w * 0.42 if way == "up" else w * 0.36
        ad.text(im, (tx, h * 0.38), "ハチ公改札", "zen", int(h * 0.4), fill="#ffffff")
        ad.text(im, (tx, h * 0.78), "Hachiko Gate", "zen", int(h * 0.2), fill="#ffffff")
        badges(im, d, (w * 0.7 if way == "up" else w * 0.6), h / 2, h * 0.36)
        sheet.paste(im, HACHIKO_CELLS[k][:2])
    im, d, w, h = cell("exit_up", yellow)              # the exit's: yellow, the words in black
    draw_arrow(d, h * 0.55, h / 2, h * 0.72, "up", (28, 30, 33))
    ad.text(im, (w * 0.56, h * 0.38), "宮益坂口", "zen", int(h * 0.4), fill="#1c1e21")
    ad.text(im, (w * 0.56, h * 0.78), "Miyamasuzaka Exit", "zen", int(h * 0.19), fill="#1c1e21")
    sheet.paste(im, HACHIKO_CELLS["exit_up"][:2])
    im, d, w, h = cell("hexit_up", yellow)             # and the way back to the square
    draw_arrow(d, h * 0.55, h / 2, h * 0.72, "up", (28, 30, 33))
    ad.text(im, (w * 0.56, h * 0.38), "ハチ公口", "zen", int(h * 0.4), fill="#1c1e21")
    ad.text(im, (w * 0.56, h * 0.78), "Hachiko Exit", "zen", int(h * 0.19), fill="#1c1e21")
    sheet.paste(im, HACHIKO_CELLS["hexit_up"][:2])
    im, d, w, h = cell("gate_band", green)             # the gate's own band
    ad.text(im, (w * 0.36, h * 0.38), "ハチ公改札", "zen", int(h * 0.42), fill="#ffffff")
    ad.text(im, (w * 0.36, h * 0.8), "Hachiko Gate", "zen", int(h * 0.2), fill="#ffffff")
    badges(im, d, w * 0.66, h / 2, h * 0.4)
    sheet.paste(im, HACHIKO_CELLS["gate_band"][:2])
    im, d, w, h = cell("lines", black)                 # inside the gate: the way to the lines' platforms
    draw_arrow(d, h * 0.55, h / 2, h * 0.72, "up", (255, 255, 255))
    ad.text(im, (w * 0.46, h * 0.38), "山手線・埼京線", "zen", int(h * 0.36), fill="#ffffff", max_w=w * 0.5)
    ad.text(im, (w * 0.46, h * 0.78), "Yamanote / Saikyo Lines", "zen", int(h * 0.18), fill="#ffffff", max_w=w * 0.52)
    badges(im, d, w * 0.75, h / 2, h * 0.36)
    sheet.paste(im, HACHIKO_CELLS["lines"][:2])
    im, d, w, h = cell("notice", (250, 250, 248))      # the works' notice: the passages have changed
    d.rectangle([0, 0, w, h * 0.09], fill=(24, 24, 26))
    ad.text(im, (w / 2, h * 0.047), "PASSAGEWAY NOTICE", "zen", int(h * 0.045), fill="#f6d000")
    d.rectangle([0, h * 0.09, w, h * 0.36], fill=(214, 40, 32))
    ad.text(im, (w / 2, h * 0.15), "渋谷駅改良工事に伴い", "zen", int(h * 0.04), fill="#ffffff")
    ad.text(im, (w / 2, h * 0.225), "通路を切り替えました", "zen", int(h * 0.06), fill="#ffffff", max_w=w * 0.92)
    ad.text(im, (w / 2, h * 0.31), "This passageway has changed", "zen", int(h * 0.032), fill="#ffffff", max_w=w * 0.9)
    d.rectangle([w * 0.08, h * 0.41, w * 0.92, h * 0.86], outline=(214, 40, 32), width=3)
    d.rectangle([w * 0.16, h * 0.5, w * 0.84, h * 0.58], fill=(232, 222, 196))
    d.rectangle([w * 0.62, h * 0.5, w * 0.72, h * 0.8], fill=(232, 222, 196))
    d.rectangle([w * 0.5, h * 0.66, w * 0.84, h * 0.78], fill=(226, 196, 230))
    d.line([(w * 0.18, h * 0.54), (w * 0.67, h * 0.54), (w * 0.67, h * 0.72)], fill=(214, 40, 32), width=4)
    d.ellipse([w * 0.15, h * 0.52, w * 0.21, h * 0.56], fill=(214, 40, 32))
    ad.text(im, (w / 2, h * 0.93), "ご理解とご協力をお願いいたします", "zen", int(h * 0.03), fill="#33363a", max_w=w * 0.9)
    sheet.paste(im, HACHIKO_CELLS["notice"][:2])
    im, d, w, h = cell("plan", (244, 244, 240))        # the station's plan, lit: the floor round the gate
    d.rectangle([0, 0, w, h * 0.14], fill=green)
    ad.text(im, (w * 0.3, h * 0.07), "構内のご案内", "zen", int(h * 0.075), fill="#ffffff")
    ad.text(im, (w * 0.75, h * 0.07), "Station Map", "zen", int(h * 0.06), fill="#ffffff")
    d.rectangle([w * 0.06, h * 0.22, w * 0.94, h * 0.92], fill=(226, 226, 220))
    d.rectangle([w * 0.06, h * 0.42, w * 0.6, h * 0.54], fill=(240, 232, 204))
    d.rectangle([w * 0.5, h * 0.42, w * 0.6, h * 0.86], fill=(240, 232, 204))
    d.rectangle([w * 0.3, h * 0.6, w * 0.5, h * 0.86], fill=(222, 196, 228))
    d.rectangle([w * 0.62, h * 0.26, w * 0.9, h * 0.6], fill=(196, 224, 204))
    for k in range(4):
        d.rectangle([w * (0.33 + k * 0.04), h * 0.63, w * (0.345 + k * 0.04), h * 0.7], fill=(70, 74, 80))
    d.ellipse([w * 0.075, h * 0.455, w * 0.105, h * 0.505], fill=(214, 40, 32))
    ad.text(im, (w * 0.16, h * 0.35), "現在地", "zen", int(h * 0.05), fill="#d62820")
    ad.text(im, (w * 0.4, h * 0.82), "ハチ公改札", "zen", int(h * 0.045), fill="#3a3d42")
    ad.text(im, (w * 0.76, h * 0.43), "宮益坂口", "zen", int(h * 0.045), fill="#3a3d42")
    sheet.paste(im, HACHIKO_CELLS["plan"][:2])
    im, d, w, h = cell("stripes", (250, 250, 248))     # the hoarding's end panel
    for k in range(-2, 12):
        y0 = k * w * 1.4
        d.polygon([(0, y0), (w, y0 - w * 0.9), (w, y0 - w * 0.9 + w * 0.7), (0, y0 + w * 0.7)], fill=green)
    sheet.paste(im, HACHIKO_CELLS["stripes"][:2])
    im, d, w, h = cell("poster", (232, 120, 50))       # an invented travel poster: autumn hills at dusk
    ad.gradient(im, "#f2a35e", "#7a3b6e", angle=90.0)
    d = ImageDraw.Draw(im)
    d.ellipse([w * 0.58, h * 0.16, w * 0.82, h * 0.32], fill=(255, 226, 170))
    d.polygon([(0, h * 0.62), (w * 0.3, h * 0.42), (w * 0.55, h * 0.56), (w * 0.8, h * 0.38), (w, h * 0.5), (w, h * 0.8), (0, h * 0.8)], fill=(92, 46, 72))
    d.polygon([(0, h * 0.74), (w * 0.4, h * 0.58), (w * 0.7, h * 0.7), (w, h * 0.62), (w, h * 0.8), (0, h * 0.8)], fill=(150, 52, 40))
    d.rectangle([0, h * 0.8, w, h], fill=(250, 248, 242))
    ad.text(im, (w / 2, h * 0.86), "秋の山へ、各駅で。", "zen", int(h * 0.06), fill="#3a2a30", max_w=w * 0.9)
    ad.text(im, (w / 2, h * 0.94), "Autumn in the hills, a train away", "zen", int(h * 0.035), fill="#5a4a50", max_w=w * 0.9)
    sheet.paste(im, HACHIKO_CELLS["poster"][:2])
    img.paste(sheet, (X, Y))


def draw_jr(img, rects):
    from PIL import ImageDraw
    x, y, w, h = rects["jr_clear"]
    im = Image_new(w, h, (245, 245, 240))
    d = ImageDraw.Draw(im)
    d.rectangle([3, 3, w - 4, h - 4], outline=(30, 60, 150), width=5)
    ad.text(im, (w * 0.3, h * 0.5), "高さ制限", "zen", int(h * 0.36), fill="#1e3c96")
    ad.text(im, (w * 0.74, h * 0.52), "4.5m", "anton", int(h * 0.6), fill="#1e3c96")
    img.paste(im, (x, y))


def draw_station(img, rects):
    from PIL import ImageDraw
    x, y, w, h = rects["st_billboard"]          # an invented game, in the way the station's scaffold adverts run
    im = Image_new(w, h, (90, 170, 235))
    ad.gradient(im, "#3a8fe0", "#bfe6ff", angle=90.0)
    d = ImageDraw.Draw(im)
    d.ellipse([w * 0.52, h * 0.12, w * 0.92, h * 1.15], fill=(255, 150, 40))
    d.ellipse([w * 0.62, h * 0.25, w * 0.72, h * 0.4], fill=(255, 255, 255))
    ad.text(im, (w * 0.28, h * 0.36), "SKYTAIL", "anton", int(h * 0.26), fill="#ffffff")
    ad.text(im, (w * 0.28, h * 0.62), "LEGENDS", "bebas", int(h * 0.16), fill="#0d2b55")
    ad.text(im, (w * 0.28, h * 0.84), "新作 好評発売中", "zen", int(h * 0.1), fill="#0d2b55")
    img.paste(im, (x, y))
    x, y, w, h = rects["st_hoarding"]
    im = Image_new(w, h, (238, 240, 242))
    d = ImageDraw.Draw(im)
    d.rectangle([0, h * 0.82, w, h], fill=(22, 90, 60))
    ad.text(im, (w * 0.5, h * 0.35), "渋谷駅 改良工事", "zen", int(h * 0.2), fill="#1a3c2a")
    ad.text(im, (w * 0.5, h * 0.6), "ご不便をおかけしております  Station works in progress", "zen", int(h * 0.08), fill="#4a5560", max_w=w * 0.9)
    img.paste(im, (x, y))


# ---------------------------------------------------------------- the koban

# 渋谷警察署渋谷駅前交番, the police box on Hachiko Square's north edge (OSM's node), facing the scramble.
# (The owl-eyed koban of 1985 is Udagawa's, at Center Gai's far end.) Its form here is a Tokyo koban's: two
# storeys of pale tile, a glazed front under a canopy, KOBAN and its name over the door and the red lamp
# that burns all night; the size is an estimate from photographs (6.4 x 4.6 m, 6.6 m high).
KOBAN = {"name": "渋谷警察署渋谷駅前交番", "w": 6.4, "d": 4.6, "h": 6.6}


def koban(K, A, D, node):
    n = next((n for n in D.nodes if n["tags"].get("amenity") == "police" and n["tags"].get("name") == KOBAN["name"]), None)
    if n is None:
        return None
    at = n["xy"]
    f = unit(np.asarray(node) - at)
    P = frame(at, f)
    g = D.ground(*at)
    hw, hd, h = KOBAN["w"] / 2, KOBAN["d"] / 2, KOBAN["h"]
    tile, glass, dark = K["x_koban"], K["x_qf_glass"], K["x_frame"]
    box(tile, P, -hd, hd - 0.6, -hw, hw, g, g + h, uvm=True)                     # the body, its front set back under the canopy
    box(dark, P, hd - 0.6, hd - 0.55, -hw + 0.4, hw - 0.4, g, g + 2.9)            # the glazed front's frame
    box(K["x_shop"], P, hd - 0.56, hd - 0.5, -hw + 0.5, hw - 0.5, g + 0.05, g + 2.8, uvm=True)
    box(tile, P, hd - 0.6, hd + 0.5, -hw - 0.2, hw + 0.2, g + 3.0, g + 3.35)    # the canopy
    K["x_light"].quad(P(hd + 0.2, hw - 0.3, g + 2.99), P(hd + 0.2, -hw + 0.3, g + 2.99), P(hd - 0.2, -hw + 0.3, g + 2.99), P(hd - 0.2, hw - 0.3, g + 2.99))
    A.quad(K["x_atlas"], P(hd + 0.51, -2.4, g + 3.4), P(hd + 0.51, 2.4, g + 3.4), P(hd + 0.51, 2.4, g + 4.35), P(hd + 0.51, -2.4, g + 4.35), "koban_sign")
    K["x_red_lamp"].lathe([(g + 4.55, 0.0), (g + 4.6, 0.2), (g + 4.85, 0.24), (g + 5.1, 0.2), (g + 5.15, 0.0)], (float(P(hd - 0.3, 0, 0)[0]), float(P(hd - 0.3, 0, 0)[1])), 14)
    for v in (-1.6, 1.6):                                                        # windows on the upper floor
        box(glass, P, hd - 0.62, hd - 0.58, v - 1.0, v + 1.0, g + 4.4, g + 5.8)
    ak.cap(K["x_qf_roof"], ak.WORLD, [tuple(P(u, v, 0)[:2]) for u, v in ((-hd, -hw), (hd - 0.6, -hw), (hd - 0.6, hw), (-hd, hw))], g + h + 0.01)
    return Polygon([tuple(P(u, v, 0)[:2]) for u, v in ((-hd, -hw), (hd + 0.5, -hw), (hd + 0.5, hw), (-hd, hw))])


def draw_koban(img, rects):
    x, y, w, h = rects["koban_sign"]
    im = Image_new(w, h, (246, 246, 242))
    ad.text(im, (w / 2, h * 0.36), "KOBAN", "bebas", int(h * 0.5), fill="#1a2a6a")
    ad.text(im, (w / 2, h * 0.8), "渋谷駅前交番", "zen", int(h * 0.26), fill="#1a2a6a")
    img.paste(im, (x, y))


# ---------------------------------------------------------------- the module's hooks (city.py)

class Build:
    """What the scramble adds to the Shibuya map's landmarks: meshes, solids it draws instead, ground clips."""

    def __init__(self, city_id, node, lm=None, openings=None, top=None):
        self.lm = lm or {}
        self.top = top                   # what the city lays over the ground at (x, y), its height, or None (Hachiko Square's setts: city.py)
        self.openings = openings or []   # QFRONT's screens and prints: (foot's middle, along, width, z0, z1), which its fins leave clear
        self.D = Data(city_id)
        self.node = np.asarray(node, float)
        self.entrances = entrance_sites(self.D, self.node)
        items = [(f"exit_{e['ref']}", 512, 96) for e in self.entrances] + [("exit_side", 1024, 64)]
        for b in BILLBOARDS:
            items += [(k, int(min(512, 96 * w / h)) if w >= h else 128, 96 if w >= h else int(128 * h / w)) for k, w, h in b["boxes"]]
        items += [(k, 768, 76) for b in BANDS for _, k in b["rows"]]
        items += [("jr_clear", 384, 96), ("st_billboard", 1024, 480), ("st_hoarding", 512, 160), ("magnet_name", 768, 112), ("koban_sign", 384, 76), ("s109_wrap", 512, 768), ("s109_name", 512, 384), ("cg_banner", 768, 160), ("cg_name", 64, 384)]
        items += [("qf_crown", 1024, 320), ("qf_name", 384, 52), ("qf_coffee", 768, 92), ("qf_books", 512, 84)]
        items += [("bk_sign", 1600, 400), ("bk_awning", 768, 48), ("st_hachiko", 1000, 480)]
        items += streets.atlas_items()
        self.A = Atlas(list(dict.fromkeys(items)), width=2048)

    def meshes(self):
        K = ak.Kit("scramble", floodlit=LIT, uv={k for k, m in MATERIALS.items() if "map" in m or "pattern" in m})
        clip, hidden = [], []
        crosswalks(K, self.D, self.node)
        jr_lines(K, self.A, self.D)
        ginza_viaduct(K, self.D)
        hidden += qfront(K, self.A, self.D, self.openings)
        hidden += shibuya109(K, self.A, self.D)
        billboards(K, self.A, self.D)
        kb = koban(K, self.A, self.D, self.node)
        h_, c_ = station(K, self.A, self.D, kb)
        hidden += h_
        magnet_front(K, self.A, self.D)
        skins(K, self.D)
        sign_bands(K, self.A, self.D)
        bookshop(K, self.A, self.D)
        streets.build(K, self.A, self.D)
        if "center_gai" in self.lm:
            center_gai_gate(K, self.A, self.D, self.lm["center_gai"])
        for e in self.entrances:
            clip.append({"ring": entrance(K, self.A, e), "well": True})   # (a stair well the crowd keeps out of while the station below is not built: game.js WELLS; drop the mark when it opens)
            hidden.append(e["si"])
        plan = Plan(self.D, [c["ring"] for c in clip])
        tactile(K, self.D, Plan(self.D, [c["ring"] for c in clip], r=125.0), top=self.top)   # (round the scramble a little wider than the hero level)
        guard_rails(K, self.D, plan)
        clip += c_                       # (the way in's passage: after the plan, whose clips are the stair wells)
        return K.out(), hidden, clip, getattr(self.D, "props", [])

    def draw(self, out_dir):
        from PIL import Image
        img = Image.new("RGB", (self.A.W, self.A.H), (30, 32, 36))
        for e in self.entrances:
            draw_exit(img, self.A.rects[f"exit_{e['ref']}"], e["ref"], e["name"])
        draw_side(img, self.A.rects["exit_side"])
        draw_qfront(img, self.A.rects)
        draw_109(img, self.A.rects)
        draw_gate(img, self.A.rects)
        draw_billboards(img, self.A.rects)
        draw_koban(img, self.A.rects)
        draw_magnet(img, self.A.rects)
        draw_bookshop(img, self.A.rects)
        streets.draw(img, self.A.rects)
        draw_station(img, self.A.rects)
        draw_hachiko(img, self.A.rects)
        draw_jr(img, self.A.rects)
        img.save(os.path.join(out_dir, ATLAS_FILE), quality=90)
        return ATLAS_FILE
