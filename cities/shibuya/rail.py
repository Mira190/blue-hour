"""The Yamanote Line through the Shibuya map: Harajuku, Shibuya and Ebisu, and its trains' courses.

The line runs north and south through the map on OpenStreetMap's two tracks (山手線, cities/shibuya/rail_osm.json,
pipeline/rail_osm.py): from the Yoyogi side past Harajuku, along the Miyashita Park side to the girder bridge east
of the Scramble (the bed cities/shibuya/scramble.py draws, JR), through Shibuya Station, and south beside Meiji-dori
to Ebisu. In the city model all three stations stand inside buildings (JR Shibuya's works-site box, Harajuku's
station building of 2020, the JR Ebisu Building over Ebisu's platforms), so their platforms are not drawn: a train is
not drawn inside a station's box (a course's "dark" stretches), and a station is boarded and left at its street
entrance, OpenStreetMap's railway=train_station_entrance (web/game/trains.js "under"). Between them the trains run
in the open on the bed drawn here.

  levels    the rail is the ground under the track (the 5 m bare-earth model, which has the embankments and the
            cuttings in it) smoothed over 50 m and 0.8 m over it, and over a valley the grade-limited envelope of that
            (an embankment: Shibuya Station is on the second floor over the Shibuya River's valley), across a mapped
            bridge straight from end to end,
            and at the Scramble's bed its rail height (scramble.py JR: 7.4 m over the road); no grade steeper than
            3% (the Yamanote's steepest is about 2.5%)
  trains    E235 sets of eleven cars, each way every three minutes, the inner loop (内回り, south: Shinagawa and
            Tokyo) on the eastern track and the outer loop (外回り, north: Shinjuku and Ikebukuro) on the western,
            keeping left; the platform numbers OpenStreetMap's stopping points give
  overhead  masts every 46 m on the outer side with a cantilever over the track and the contact wire 5.0 m up

  bridges   where a street of the game's road graph passes under the line (underbridges(): a road of game.json that
            crosses a track with UNDER_CLEAR or more between its surface and the bed) the embankment's wall is not
            drawn across it: the bed is carried over the carriageway and a footway either side on a plate girder
            between two abutments, as the Yamanote's street bridges are (issue 167: the wall stood across the street
            west of Miyashita Park and four others, and the game's roads ended at it from both sides)

  platforms a station whose platform runs on out of its box (Shibuya's, south over Route 246 to the new south exit:
            the Yamanote's one island platform since January 2023, under the two platform roofs OpenStreetMap maps,
            w1350895891 and w1350895892) has it drawn: between its two tracks, its edges EDGE_M off each track's middle,
            its floor DECK_M over the rail, from INTO_BOX inside the box out to the far end of the roofs over it. Its
            floor, a coping and the yellow tactile strip along each edge, its faces down to the bed, its underside
            over the street, a railing across its open end, and the roofs' columns down its middle every POST_M. The
            platform was drawn under each roof's own outline and stopped where the roof did, a slab hanging over Route
            246 short of the station's wall (the owner's report, 27 November 2026); the roofs over it now stand on it
            (game.json trains "platforms", pipeline/stations.py on_platforms: web/buildings-geo.js draws neither a
            platform nor posts of its own under them)

meshes(Mesh)   the bed, its rails, its walls where it stands on an embankment or in a cutting, its bridges over the
               streets, the masts and the contact wire, outside the stations' boxes and the Scramble's stretch
trains()       game.json "trains" (web/game/trains.js)
"""
import json
import math
import os

import numpy as np
import shapely
from shapely.geometry import LineString, Point, Polygon

HERE = os.path.dirname(os.path.abspath(__file__))
LINE = "山手線"
FREIGHT = "山手貨物線"  # the Yamanote Freight Line's tracks beside it: the Saikyo Line's and the Shonan-Shinjuku Line's
BESIDE = 25.0        # a freight track is laid out where it runs this near the Yamanote's (m)
GAP = 3.8            # nor nearer a Yamanote track than this, middle to middle (JR's least between two lines)
CARS = {"yamanote": 11, "saikyo": 10}
STEP = 5.0           # the courses' sample spacing (m)
GRADE = 0.03
BED_HALF = 2.1       # a track's bed either side of its middle
MAST_EVERY = 46.0
WIRE = 5.0
EDGE_M = 1.6         # a platform's edge from its track's middle (the E235's cars are 2.95 m wide)
DECK_M = 1.1         # a platform's floor over the rail (web/buildings-geo.js PLATFORM_DECK)
ISLAND = (8.0, 22.0)  # two tracks this far apart by a station have an island platform between them (m)
SHED = 8.0           # where the platforms run out of a box in the open: the station's dark inside, this far in
INTO_BOX = SHED + 1.0  # how far a platform runs on into its station's box (to the dark)
CAR_HALF = 10.0      # (a car is not drawn once its middle is in the dark: half a car past the dark's face, all of it is)
REACH = 150.0        # how far out of the box a platform is looked for (m)
ROOF_NEAR = 8.0      # a roof this near a track is a platform's (pipeline/stations.py PLATFORM_M)
WIRE_CLEAR = 5.2     # a platform roof's underside over the rail (tools/rail_clear.py WIRE_M: pipeline/stations.py platform_roofs)
POST_M = 12.0        # a platform roof's columns, down the platform's middle
TACTILE = (0.8, 1.1)  # the yellow tactile strip, in from the edge (m)
COPING = 0.3
# a street under the line (underbridges()): the road's half width as the game draws it (game.js ROAD_HALF), a footway
# either side, and the least height of the bed's underside over the road for the crossing to be a bridge
ROAD_HW = {"motorway": 7, "trunk": 6, "primary": 6, "secondary": 5, "tertiary": 4.5, "residential": 3.5, "unclassified": 3, "living_street": 2.5}
UNDER_SIDE = 2.5
UNDER_CLEAR = 3.0
GIRDER = 1.1         # a plate girder's depth under the bed
# the Scramble's bed (scramble.py JR): its stretch, its rail height over the road at `at`
SCRAMBLE = {"x0": 380.0, "x1": 520.0, "y0": -1016.0, "y1": -860.0, "rail_m": 7.4, "at": (430.0, -1000.0)}
# each station: its name, the solids its platforms stand inside in the city model (by OSM id or by name), its street
# entrance (OSM, read 14 November 2026) and the line said as you come up there
STATIONS = [
    {"id": "harajuku", "name": "Harajuku", "native": "原宿", "kana": "はらじゅく", "names": ("原宿駅",), "osm": (),
     "entrance": (139.7026567, 35.6700700), "text": "Out by the East Exit, onto Omotesando's top end."},
    {"id": "shibuya", "name": "Shibuya", "native": "渋谷", "kana": "しぶや", "names": (), "osm": ("w904652357",), "open": True,
     "entrance": (139.7010554, 35.6589885), "text": "Out through the Hachiko Gate, Hachiko and the Scramble in front of you."},
    {"id": "ebisu", "name": "Ebisu", "native": "恵比寿", "kana": "えびす", "names": ("JR恵比寿ビル", "恵比寿"), "osm": (),
     "entrance": (139.7094755, 35.6470028), "text": "Out by the West Exit, beside the station's Ebisu statue."},
]
SERVICES = [
    {"track": "yamanote-s", "stock": "e235", "cars": 11, "every_s": 180, "offset_s": 30, "stops": True, "v_ms": 19,
     "for": {"ja": "品川・東京方面", "en": "Shinagawa and Tokyo"}, "line": {"ja": "山手線", "en": "Yamanote Line"}},
    {"track": "yamanote-n", "stock": "e235", "cars": 11, "every_s": 180, "offset_s": 120, "stops": True, "v_ms": 19,
     "for": {"ja": "新宿・池袋方面", "en": "Shinjuku and Ikebukuro"}, "line": {"ja": "山手線", "en": "Yamanote Line"}},
    # on the freight line's tracks beside it: the Saikyo Line (E233-7000, ten cars, a green band) and the
    # Shonan-Shinjuku Line (E233-3000, orange over green), stopping at Shibuya and Ebisu
    {"track": "saikyo-s", "stock": "e233s", "cars": 10, "every_s": 600, "offset_s": 90, "stops": True, "v_ms": 19,
     "for": {"ja": "大崎・新木場方面", "en": "Osaki and Shin-Kiba"}, "line": {"ja": "埼京線", "en": "Saikyo Line"}},
    {"track": "saikyo-n", "stock": "e233s", "cars": 10, "every_s": 600, "offset_s": 390, "stops": True, "v_ms": 19,
     "for": {"ja": "新宿・池袋・大宮方面", "en": "Shinjuku, Ikebukuro and Omiya"}, "line": {"ja": "埼京線", "en": "Saikyo Line"}},
    {"track": "saikyo-s", "stock": "e233t", "cars": 10, "every_s": 900, "offset_s": 390, "stops": True, "v_ms": 21,
     "for": {"ja": "横浜・大船方面", "en": "Yokohama and Ofuna"}, "line": {"ja": "湘南新宿ライン", "en": "Shonan-Shinjuku Line"}},
    {"track": "saikyo-n", "stock": "e233t", "cars": 10, "every_s": 900, "offset_s": 840, "stops": True, "v_ms": 21,
     "for": {"ja": "新宿・池袋方面", "en": "Shinjuku and Ikebukuro"}, "line": {"ja": "湘南新宿ライン", "en": "Shonan-Shinjuku Line"}},
]

MATERIALS = {
    "yl_ballast": {"color": "#6d665e", "roughness": 0.95, "metalness": 0.0, "solid": False},
    "yl_steel": {"color": "#8d8478", "roughness": 0.32, "metalness": 0.85, "solid": False},
    "yl_wall": {"color": "#a8a39a", "roughness": 0.9, "metalness": 0.0, "pattern": "ashlar", "course_m": 0.6, "block_m": 1.8},
    "yl_mast": {"color": "#7d8283", "roughness": 0.55, "metalness": 0.6, "solid": False},
    "yl_wire": {"color": "#3b3d3f", "roughness": 0.5, "metalness": 0.7, "solid": False},
    "yl_girder": {"color": "#59635f", "roughness": 0.6, "metalness": 0.45, "solid": False},
    "yl_platform": {"color": "#a7a49c", "roughness": 0.85, "metalness": 0.0},
    "yl_coping": {"color": "#d4d1c8", "roughness": 0.7, "metalness": 0.0},
    "yl_tactile": {"color": "#d8a71e", "roughness": 0.6, "metalness": 0.0},
    "yl_pface": {"color": "#75716a", "roughness": 0.9, "metalness": 0.0},
    # (a platform's underside, and the deck's between two beds, cast no shadow: their floor over them does, and the shadow
    # map cannot tell the two apart, 2 m under each other, so the floor was striped with the underside's shadow)
    "yl_soffit": {"color": "#59635f", "roughness": 0.6, "metalness": 0.45, "solid": False, "shadow": False},
    "yl_shed": {"color": "#16181a", "roughness": 0.95, "metalness": 0.0},   # the station's dark inside, through a portal
    "yl_column": {"color": "#b8bbbd", "roughness": 0.45, "metalness": 0.6, "solid": False},
}

_S = {}


def city():
    if "C" not in _S:
        from cityctx import City
        _S["C"] = City("shibuya")
    return _S["C"]


def _smooth(v, k):
    out = np.empty_like(v)
    for i in range(len(v)):
        out[i] = np.median(v[max(0, i - k):i + k + 1])
    return out


def layout():
    if "L" in _S:
        return _S["L"]
    path = os.path.join(HERE, "rail_osm.json")
    if not os.path.exists(path):
        return None
    import archkit as ak
    C, D, T = city(), json.load(open(path, encoding="utf8")), ak.Terrain("shibuya")
    loc = lambda ll: [C.fwd.transform(*p) for p in ll]
    pieces = [(LineString(loc(t["ll"])), t) for t in D["tracks"] if t["line"] == LINE]
    merged = shapely.line_merge(shapely.union_all([g for g, _ in pieces]), directed=False)
    parts = sorted(getattr(merged, "geoms", [merged]), key=lambda g: -g.length)
    # the two tracks: chain each of the two longest runs on at each end with the piece that carries it on (a crossover
    # breaks OpenStreetMap's tracks in two north of Shibuya)
    def chain(g, rest):
        g = LineString(g.coords if g.coords[0][1] > g.coords[-1][1] else g.coords[::-1])   # north to south
        while True:
            a, b = Point(g.coords[0]), Point(g.coords[-1])
            best = None
            for q in rest:
                for end, rev in ((0, False), (-1, True)):
                    for tip, at_north in ((a, True), (b, False)):
                        d = Point(q.coords[end]).distance(tip)
                        if d < 10.0 and (best is None or d < best[0]):
                            best = (d, q, end, at_north)
            if not best:
                return g
            _, q, end, at_north = best
            rest.remove(q)
            qc = list(q.coords)
            if at_north:   # q ends where g starts
                qc = qc if end == -1 else qc[::-1]
                g = LineString(qc[:-1] + list(g.coords))
            else:
                qc = qc if end == 0 else qc[::-1]
                g = LineString(list(g.coords) + qc[1:])
    rest = [p for p in parts[2:] if p.length > 40]
    lines = [chain(parts[0], rest), chain(parts[1], rest)]
    lines.sort(key=lambda g: g.interpolate(0.5, normalized=True).x)   # west first
    rx, ry = SCRAMBLE["at"]
    zr = T(rx, ry) + SCRAMBLE["rail_m"]
    bridges = [g for g, t in pieces if t.get("bridge")]
    solids = ak.load_solids("shibuya")
    fpieces = [(LineString(loc(t["ll"])), t) for t in D["tracks"] if t["line"] == FREIGHT]
    boxes, houses, opens = {}, {}, {}
    for S in STATIONS:
        ps = [Polygon(q["ring"]).buffer(0) for q in solids if len(q["ring"]) > 2 and (q["osm"] in S["osm"] or q.get("name") in S["names"])]
        houses[S["id"]] = shapely.union_all(ps).buffer(1.0) if ps else Polygon()
        # and its platforms near its entrance (Harajuku's run out of its building to the north and south), as OSM maps
        # them: in its box, or, at a station whose platforms run on out of its building in the open (Shibuya's, south
        # over Route 246), drawn there (platforms())
        ex, ey = C.fwd.transform(*S["entrance"])
        opens[S["id"]] = []
        for q in D["platforms"]:
            P = Polygon(loc(q["ll"])).buffer(0)
            if P.area > 300 and P.centroid.distance(Point(ex, ey)) < 160 and any(g.distance(P) < 4 for g, _ in pieces + fpieces):
                (opens[S["id"]].append(P) if S.get("open") else ps.append(P.buffer(4.0)))
        boxes[S["id"]] = shapely.union_all(ps).buffer(1.0) if ps else Polygon()
    tracks = []
    for g, tid in zip(lines, ("yamanote-n", "yamanote-s")):
        north = tid == "yamanote-n"                 # the western track runs north (keeping left)
        n = int(g.length / STEP) + 1
        pts = np.array([g.interpolate(k * g.length / (n - 1)).coords[0] for k in range(n)])
        s = np.linspace(0, g.length, n)
        # (the ground under the track as surveyed, settled once and kept: _surveyed())
        ground = _surveyed(tid, pts, T)
        # the rail never under the ground, and across a valley on an embankment: the upper envelope of the smoothed
        # ground at the steepest grade (Shibuya Station stands in the valley of the Shibuya River on its second floor)
        zs = _smooth(ground, 5) + 0.8
        z = np.max(zs[None, :] - GRADE * STEP * np.abs(np.arange(n)[:, None] - np.arange(n)[None, :]), axis=1)
        fixed = np.zeros(n, bool)
        # across a bridge, straight from end to end
        for b in bridges:
            on = np.array([b.distance(Point(*p)) < 2.5 for p in pts])
            idx = np.flatnonzero(on)
            if len(idx) > 1:
                i0, i1 = idx[0], idx[-1]
                z[i0:i1 + 1] = np.linspace(z[i0], z[i1], i1 - i0 + 1)
        sc = (pts[:, 0] > SCRAMBLE["x0"]) & (pts[:, 0] < SCRAMBLE["x1"]) & (pts[:, 1] > SCRAMBLE["y0"]) & (pts[:, 1] < SCRAMBLE["y1"])
        z[sc], fixed[sc] = zr, True
        # a station is level: its stretch at the highest rail within 30 m of it (at Shibuya, the Scramble's bed), and
        # so are its platforms out of its box (platforms())
        for S in STATIONS:
            inb = np.array([boxes[S["id"]].contains(Point(*p)) or any(P.distance(Point(*p)) < 15 for P in opens[S["id"]]) for p in pts])
            idx = np.flatnonzero(inb)
            if len(idx) < 3:
                continue
            k = int(30 / STEP)
            lo, hi = max(0, idx[0] - k), min(n, idx[-1] + k + 1)
            z[idx[0]:idx[-1] + 1], fixed[idx[0]:idx[-1] + 1] = z[lo:hi].max(), True
        for _ in range(3):   # no grade steeper than GRADE, the Scramble's bed held
            for i in range(1, n):
                if not fixed[i]:
                    z[i] = min(max(z[i], z[i - 1] - GRADE * STEP), z[i - 1] + GRADE * STEP)
            for i in range(n - 2, -1, -1):
                if not fixed[i]:
                    z[i] = min(max(z[i], z[i + 1] - GRADE * STEP), z[i + 1] + GRADE * STEP)
        if north:   # in the direction of travel
            pts, z, ground, sc = pts[::-1], z[::-1], ground[::-1], sc[::-1]
        geom = LineString(pts)
        dark = []
        for S in STATIONS:
            inside = geom.intersection(boxes[S["id"]])
            for q in getattr(inside, "geoms", [inside]):
                if q.is_empty or q.length < 10:
                    continue
                m0, m1 = sorted((geom.project(Point(q.coords[0])), geom.project(Point(q.coords[-1]))))
                dark.append((S["id"], m0, m1))
        tracks.append({"id": tid, "line": "yamanote", "north": north, "pts": pts, "z": z, "ground": ground, "geom": geom, "scramble": sc, "dark": dark})
    tracks += _freight(fpieces, chain, tracks, boxes, houses, D, C)
    # where the platforms run out of a box in the open, the station is open to the line there: its face has a portal
    # over the tracks and the platforms (portals(), cities/shibuya/scramble.py station()), and a train is drawn on in
    # through it to the dark SHED inside, so that its cars are put out of sight behind it, not at the face
    for t in tracks:
        for k, (sid, m0, m1) in enumerate(t["dark"]):
            if not opens.get(sid):
                continue
            near = lambda m: any(P.distance(t["geom"].interpolate(m)) < 15 for P in opens[sid])
            if near(m0):
                m0 += SHED + CAR_HALF + 2
            if near(m1):
                m1 -= SHED + CAR_HALF + 2
            t["dark"][k] = (sid, m0, m1)
    # each track's halts: at the station's stopping point on it (OSM railway=stop with its platform number), or the
    # middle of its dark stretch there
    for t in tracks:
        t["stops"] = []
        for S in STATIONS:
            here = [(C.fwd.transform(*q["ll"]), q) for q in D["stops"] if q["name"] == S["native"]]
            near = [(t["geom"].distance(Point(*xy)), xy, q) for xy, q in here]
            near = [v for v in near if v[0] < 2.5]
            dk = [d for d in t["dark"] if d[0] == S["id"]]
            if not dk or (t["line"] != "yamanote" and not near):
                continue   # (the Saikyo Line passes Harajuku: it halts only where OpenStreetMap has its stopping point)
            m0, m1, half = dk[0][1], dk[0][2], CARS[t["line"]] * 20.0 / 2
            if near:
                _, xy, q = min(near, key=lambda v: v[0])
                m, no = t["geom"].project(Point(*xy)), int(q["platform"])
            else:
                m, no = (m0 + m1) / 2, None
            beside = [P for P in opens[S["id"]] if t["geom"].distance(P) < 3]
            if beside:
                # by a platform out in the open: the train's middle at the platform's, on the platform as it stands
                ms = [t["geom"].project(Point(x, y)) for x, y in beside[0].exterior.coords]
                m = (min(ms) + max(ms)) / 2
            else:
                # a standing train inside the building: its middle where the whole of it fits, or the stretch's middle
                m = (m0 + m1) / 2 if m1 - m0 < 2 * half + 10 else min(max(m, m0 + half + 5), m1 - half - 5)
            t["stops"].append({"station": S["id"], "m": round(float(m), 1), **({"platform": no} if no else {})})
        t["stops"].sort(key=lambda h: h["m"])
    L = {"C": C, "T": T, "tracks": tracks, "boxes": boxes, "opens": opens, "zr": zr}
    _S["L"] = L
    return L


def _run(ok):
    """The longest run of True in ok: (first, last) or None."""
    best, i = None, 0
    while i < len(ok):
        if ok[i]:
            j = i
            while j + 1 < len(ok) and ok[j + 1]:
                j += 1
            if best is None or j - i > best[1] - best[0]:
                best = (i, j)
            i = j + 1
        else:
            i += 1
    return best


def _freight(fpieces, chain, Y, boxes, houses, D, C):
    """The Yamanote Freight Line's two tracks beside the Yamanote's (the Saikyo Line's and the Shonan-Shinjuku Line's:
    OpenStreetMap's 山手貨物線), where they run beside it: on the same embankment and viaducts, so at the Yamanote's
    level across from them; never nearer a Yamanote track than GAP (OpenStreetMap has them 1.4 m apart in places,
    closer than two trains can pass); dark in a station's box where they stop there (Shibuya and Ebisu), in its
    building where they pass (Harajuku)."""
    if len(fpieces) < 2:
        return []
    merged = shapely.line_merge(shapely.union_all([g for g, _ in fpieces]), directed=False)
    parts = sorted(getattr(merged, "geoms", [merged]), key=lambda g: -g.length)
    rest = [p for p in parts[2:] if p.length > 40]
    lines = [chain(parts[0], rest), chain(parts[1], rest)]
    lines.sort(key=lambda g: g.interpolate(0.5, normalized=True).x)   # west first
    for t in Y:
        t.setdefault("s", np.concatenate([[0], np.cumsum(np.hypot(*np.diff(t["pts"], axis=0).T))]))
    def nearest(p):
        t = min(Y, key=lambda t: t["geom"].distance(Point(*p)))
        m = t["geom"].project(Point(*p))
        return t, np.array(t["geom"].interpolate(m).coords[0]), float(np.interp(m, t["s"], t["z"]))
    stops = [C.fwd.transform(*q["ll"]) for q in D["stops"]]
    out = []
    for g, tid in zip(lines, ("saikyo-n", "saikyo-s")):
        north = tid == "saikyo-n"                   # the western track runs north (keeping left)
        n = int(g.length / STEP) + 1
        pts = np.array([g.interpolate(k * g.length / (n - 1)).coords[0] for k in range(n)])
        near = np.array([min(t["geom"].distance(Point(*p)) for t in Y) for p in pts])
        r = _run(near < BESIDE)
        if not r or r[1] - r[0] < 10:
            continue
        pts = pts[r[0]:r[1] + 1]
        # apart from the Yamanote's tracks: pushed out where OpenStreetMap has them nearer than GAP, the push eased
        # over the samples either side
        push = np.zeros_like(pts)
        for i, p in enumerate(pts):
            _, q, _ = nearest(p)
            d = float(np.linalg.norm(p - q))
            if 0 < d < GAP:
                push[i] = (p - q) / d * (GAP - d)
        mag = np.linalg.norm(push, axis=1)
        env = np.array([mag[max(0, i - 2):i + 3].max() for i in range(len(mag))])
        dirs = np.array([push[max(0, i - 2):i + 3].sum(axis=0) for i in range(len(push))])
        dn = np.linalg.norm(dirs, axis=1)
        dirs[dn > 0] /= dn[dn > 0][:, None]
        env = np.convolve(np.pad(env, 2, mode="edge"), np.ones(5) / 5, mode="valid")
        pts = pts + dirs * env[:, None]
        z = np.array([nearest(p)[2] for p in pts])
        sc = (pts[:, 0] > SCRAMBLE["x0"]) & (pts[:, 0] < SCRAMBLE["x1"]) & (pts[:, 1] > SCRAMBLE["y0"]) & (pts[:, 1] < SCRAMBLE["y1"])
        if north:
            pts, z, sc = pts[::-1], z[::-1], sc[::-1]
        geom = LineString(pts)
        dark = []
        for S in STATIONS:
            halts = any(geom.distance(Point(*xy)) < 2.5 for xy, q in zip(stops, D["stops"]) if q["name"] == S["native"])
            inside = geom.intersection(boxes[S["id"]] if halts else houses[S["id"]])
            for q in getattr(inside, "geoms", [inside]):
                if q.is_empty or q.length < 10:
                    continue
                m0, m1 = sorted((geom.project(Point(q.coords[0])), geom.project(Point(q.coords[-1]))))
                dark.append((S["id"], m0, m1))
        out.append({"id": tid, "line": "saikyo", "north": north, "pts": pts, "z": z, "ground": None, "geom": geom, "scramble": sc, "dark": dark})
    return out


def platforms():
    """The platforms of a station whose platforms run on out of its box (see the module's note), as OpenStreetMap maps
    them: [{station, a, b, z, roofs, ends}], drawn between the two tracks beside each from INTO_BOX inside the box to
    its far end, a and b its edges on the one track and the other, z the floor's height at each pair, roofs
    [(Polygon, underside)] over it, and ends, whether each end is the platform's own (in the open: a railing across it)
    or in the box."""
    if "P" in _S:
        return _S["P"]
    L = layout()
    out = []
    _S["P"] = out
    if not L:
        return out
    import archkit as ak
    T = L["tracks"]
    for t in T:
        t.setdefault("s", np.concatenate([[0], np.cumsum(np.hypot(*np.diff(t["pts"], axis=0).T))]))
    zof = lambda t, m: float(np.interp(m, t["s"], t["z"]))
    roofs = [Polygon(q["ring"]).buffer(0) for q in ak.load_solids("shibuya") if q["cls"] == "roof" and len(q["ring"]) > 2]
    for S in STATIONS:
        box = L["boxes"][S["id"]]
        deep = box.buffer(-INTO_BOX)
        for P in L["opens"][S["id"]]:
            side = sorted([t for t in T if t["geom"].distance(P) < 3], key=lambda t: t["geom"].distance(P.centroid))[:2]
            if len(side) < 2:
                continue
            A, B = sorted(side, key=lambda t: t["pts"][:, 0].mean())
            ms = [A["geom"].project(Point(x, y)) for x, y in P.exterior.coords]

            def pair(m):
                p = np.array(A["geom"].interpolate(m).coords[0])
                mb = B["geom"].project(Point(*p))
                q = np.array(B["geom"].interpolate(mb).coords[0])
                d = float(np.linalg.norm(q - p))
                if d < 2 * EDGE_M + 1.0:
                    return None
                u = (q - p) / d
                return p + u * EDGE_M, q - u * EDGE_M, max(zof(A, m), zof(B, mb)) + DECK_M

            m0, m1 = min(ms), max(ms)
            run = [m for m in [*np.arange(m0, m1, 2.0), m1] if pair(m) is not None and not deep.contains(Point(*((pair(m)[0] + pair(m)[1]) / 2)))]
            if len(run) < 3:
                continue
            ps = [pair(m) for m in run]
            mid = lambda k: Point(*((ps[k][0] + ps[k][1]) / 2))
            band = Polygon([*[q[0] for q in ps], *[q[1] for q in ps[::-1]]]).buffer(0)
            over = []
            for F in roofs:
                if F.intersection(band).area > 20:
                    # (its underside as pipeline/stations.py platform_roofs sets it: over the wire above the highest rail under it)
                    rail = max(zof(t, t["geom"].project(Point(x, y))) for x, y in F.exterior.coords for t in T if t["geom"].distance(Point(x, y)) < ROOF_NEAR)
                    over.append((F, math.ceil((rail + WIRE_CLEAR) * 10) / 10))
            out.append({"station": S["id"], "a": [q[0] for q in ps], "b": [q[1] for q in ps], "z": [q[2] for q in ps], "roofs": over,
                        "ends": [not box.contains(mid(0)), not box.contains(mid(-1))]})
    return out


def portals():
    """Where the line runs out of an open station's box (Shibuya's south face, over Route 246): [{a, b, z0, z1, back,
    sides, si}], a and b the opening's ends on the face of the station's solid si (the plan, m), z0 and z1 its sill
    (under the bed's girders) and its head (over the wire, or the box's top), back the station's dark across the
    tracks SHED inside ([p, q]), and sides the opening's two jambs carried back to it ([[p, q], [p, q]]); line, the
    opening along the face's edges ([(x, y), ...])."""
    if "portals" in _S:
        return _S["portals"]
    out = []
    _S["portals"] = out
    L = layout()
    if not L:
        return out
    import archkit as ak
    T, Pl = L["tracks"], platforms()
    for S in STATIONS:
        if not L["opens"].get(S["id"]):
            continue
        bands = [Polygon([*Q["a"], *Q["b"][::-1]]).buffer(0) for Q in Pl if Q["station"] == S["id"]]
        if not bands:
            continue
        reach = shapely.union_all(bands).buffer(60)
        lane = shapely.union_all([t["geom"].intersection(reach).buffer(BED_HALF + 0.4, cap_style="flat") for t in T] + [b.buffer(0.4) for b in bands])
        for q in ak.load_solids("shibuya"):
            if q["osm"] not in S["osm"] or len(q["ring"]) < 3:
                continue
            O = Polygon(q["ring"]).buffer(0)
            cut = O.exterior.intersection(lane)
            for g in getattr(cut, "geoms", [cut]):
                if g.is_empty or g.length < 4 or not any(b.distance(g) < 1.0 for b in bands):
                    continue
                a, b = np.array(g.coords[0]), np.array(g.coords[-1])
                # the rails through it, and the dark SHED in from each end, across the tracks
                inside = O.buffer(-SHED)
                rails = []
                for t in T:
                    hit = t["geom"].intersection(LineString([a, b]).buffer(0.5))
                    if hit.is_empty:
                        continue
                    m = t["geom"].project(hit.centroid)
                    rails.append(float(np.interp(m, t.setdefault("s", np.concatenate([[0], np.cumsum(np.hypot(*np.diff(t["pts"], axis=0).T))])), t["z"])))
                if not rails:
                    continue
                n = np.array([-(b - a)[1], (b - a)[0]]) / np.linalg.norm(b - a)
                if not O.contains(Point(*((a + b) / 2 + n * 1.0))):
                    n = -n                                  # (into the box)
                zt = q["ground"] + q["top"]
                out.append({"si": q["si"], "line": [tuple(c) for c in g.coords], "a": a, "b": b, "z0": min(rails) - 0.55 - GIRDER - 0.1, "z1": min(zt, max(rails) + WIRE + 1.4),
                            "zt": zt, "back": [a + n * SHED, b + n * SHED], "sides": [[a, a + n * SHED], [b, b + n * SHED]]})
    return out


def underbridges():
    """The streets that pass under the line: [{line, hw, z}], the road's line (a LineString), the half width of what the
    bridge spans (carriageway and footways) and the road's height where it crosses. From the game's road graph
    (web/data/shibuya/game.json paths.road, written before the landmarks are built)."""
    if "U" in _S:
        return _S["U"]
    L, out = layout(), []
    gp = os.path.join(HERE, "..", "..", "web", "data", "shibuya", "game.json")
    if L and os.path.exists(gp):
        for e in json.load(open(gp, encoding="utf8"))["paths"]["road"]:
            p = np.asarray(e["p"], np.float64).reshape(-1, 3) / 10
            line = LineString(p[:, :2])
            for t in L["tracks"]:
                if not line.intersects(t["geom"]):
                    continue
                x = line.intersection(t["geom"])
                for q in getattr(x, "geoms", [x]):
                    if q.geom_type != "Point":
                        continue
                    i = int(np.argmin(np.hypot(t["pts"][:, 0] - q.x, t["pts"][:, 1] - q.y)))
                    k = int(np.argmin(np.hypot(p[:, 0] - q.x, p[:, 1] - q.y)))
                    if _open(t, i) and t["z"][i] - 0.55 - p[k, 2] >= UNDER_CLEAR and not any(u["line"] is line and math.hypot(u["at"][0] - q.x, u["at"][1] - q.y) < 12 for u in out):
                        out.append({"line": line, "hw": (e["cw"] / 2 if e.get("cw") else ROAD_HW.get(e.get("c", ""), 3.5)) + UNDER_SIDE, "z": float(p[k, 2]), "at": (q.x, q.y)})
    _S["U"] = out
    return out


def _surveyed(tid, pts, T):
    """The ground under a track's samples as the survey had it, kept beside the city's sources (rail_levels.json).

    The rail's level is made from the ground under the track, embankment and all. Read from the ground as it is now, it
    was a function of what the grading had last done there: with the embankment taken out of the ground (the bed stands
    on its walls, pipeline/street_ground.py viaduct(), issue 158) the line would have come down to the street. So the
    profile is written once, from the ground as it was when the line was laid out, and read from then on; a track
    whose samples have changed (the mapped line moved) is laid out afresh."""
    path = os.path.join(HERE, "rail_levels.json")
    rec = json.load(open(path, encoding="utf8")) if os.path.exists(path) else {"note": "The ground under the Yamanote's tracks as surveyed, a value at each sample of rail.py layout() (m): written once, so that the rail's level does not follow what the grading does to the ground under it.", "tracks": {}}
    t = rec["tracks"].get(tid)
    key = [round(float(v), 1) for v in (pts[0][0], pts[0][1], pts[-1][0], pts[-1][1])]
    if not t or t["n"] != len(pts) or t["ends"] != key:
        t = rec["tracks"][tid] = {"n": len(pts), "ends": key, "ground": [round(T(x, y), 2) for x, y in pts]}
        json.dump(rec, open(path, "w", encoding="utf8"), separators=(",", ":"))
    return np.array(t["ground"], float)


def _open(t, i):
    """Whether the bed is drawn at sample i: not in a station's box, nor on the Scramble's stretch."""
    if t["scramble"][i]:
        return False
    m = t["geom"].project(Point(*t["pts"][i]))
    return not any(m0 - 4 < m < m1 + 4 for _, m0, m1 in t["dark"])


def meshes(Mesh):
    L = layout()
    if not L:
        return {}, []
    from railkit import Kit, offset
    K = Kit(Mesh, "yl", MATERIALS, uv={"yl_wall", "yl_ballast"})
    # (what stands on the ground reads the ground the game draws: pipeline/levels.py, docs/LEVELS.md)
    import levels
    GL = levels.Levels("shibuya")
    T = lambda x, y: float(GL.at(x, y))
    U = underbridges()
    under = lambda p: next((u for u in U if u["line"].distance(Point(float(p[0]), float(p[1]))) < u["hw"]), None)
    two = lambda mesh, a, b, c, d: (mesh.quad(a, b, c, d), mesh.quad(d, c, b, a))   # (seen from either side)
    decks = shapely.union_all([Polygon([*Q["a"], *Q["b"][::-1]]).buffer(0.5) for Q in platforms()]) if platforms() else Polygon()
    for t in L["tracks"]:
        others = [q["geom"] for q in L["tracks"] if q is not t]
        P, Z = t["pts"], t["z"]
        ok = np.array([_open(t, i) for i in range(len(P))])
        d = np.gradient(P, axis=0)
        d /= np.linalg.norm(d, axis=1)[:, None]
        nrm = np.stack([-d[:, 1], d[:, 0]], axis=1)
        # its outer sides: a side with no other track beside it (the Yamanote's and the freight line's four tracks
        # share one bed between two walls); free[i, 0] the side at -nrm, free[i, 1] at +nrm
        # (nor a side with a platform on it: the masts stood on the island's tactile strip)
        # (nor a side in a station's box: the bed runs on into an open station's dark (its shed) where the trains go
        # out of sight, but the box's own walls stand round it there; a wall of the bed's stood on the box's east face
        # over its print, the Saikyo line's outer track hugging it)
        nb = lambda p: min(g.distance(p) for g in others)
        boxed = lambda p: any(b.contains(Point(*p)) for b in L["boxes"].values())
        free = np.array([[not boxed(p) and all(nb(Point(*(p + q * sg * k))) > 1.2 for k in (3.0, 4.5, 6.0)) and not decks.contains(Point(*(p + q * sg * 3.0)))
                          for sg in (-1, 1)] for p, q in zip(P, nrm)])
        out = np.where(free[:, 1], 1.0, np.where(free[:, 0], -1.0, 0.0))   # (the masts' side)
        rails = [offset(P, sg * 1.067 / 2) for sg in (-1, 1)]
        run = []
        for i in range(len(P) + 1):
            if i < len(P) and ok[i]:
                run.append(i)
                continue
            if len(run) > 1:
                R = np.array(run)
                # the bed: ballast either side of the track's middle, a little under the rail
                K["yl_ballast"].grid([[[*(P[k] - nrm[k] * BED_HALF), Z[k] - 0.55], [*(P[k] + nrm[k] * BED_HALF), Z[k] - 0.55]] for k in R],
                                     [[[float(k * STEP), 0.0], [float(k * STEP), 2 * BED_HALF]] for k in R])
                for rl in rails:
                    K["yl_steel"].sweep([[*rl[k], Z[k] - 0.08] for k in R[::2]], [(-0.035, -0.08), (0.035, -0.08), (0.035, 0.08), (-0.035, 0.08)])
                # over a street: the bed's deck seen from under
                for a, b in zip(R[:-1], R[1:]):
                    if under((P[a] + P[b]) / 2):
                        two(K["yl_girder"], [*(P[a] - nrm[a] * BED_HALF), Z[a] - 0.8], [*(P[a] + nrm[a] * BED_HALF), Z[a] - 0.8], [*(P[b] + nrm[b] * BED_HALF), Z[b] - 0.8], [*(P[b] - nrm[b] * BED_HALF), Z[b] - 0.8])
                # its walls on its outer sides: down to the ground on an embankment, up to it in a cutting
                for c, sg in enumerate((-1.0, 1.0)):
                    segs = []
                    for a, b in zip(R[:-1], R[1:]):
                        if not (free[a, c] and free[b, c]):
                            continue
                        ea, eb = P[a] + nrm[a] * sg * BED_HALF, P[b] + nrm[b] * sg * BED_HALF
                        # (near a street under the line, a metre at a time: the wall ends at the abutment, not 5 m short of it)
                        n = int(STEP) if any(u["line"].distance(LineString([ea, eb])) < u["hw"] + 1 for u in U) else 1
                        for j in range(n):
                            f0, f1 = j / n, (j + 1) / n
                            segs.append((ea + (eb - ea) * f0, ea + (eb - ea) * f1, Z[a] + (Z[b] - Z[a]) * f0 - 0.55, Z[a] + (Z[b] - Z[a]) * f1 - 0.55))
                    for pa, pb, za, zb in segs:
                        ga, gb = T(*pa), T(*pb)
                        (fa, fza, fga), (fb, fzb, fgb) = ((pa, za, ga), (pb, zb, gb)) if sg > 0 else ((pb, zb, gb), (pa, za, ga))
                        if under((pa + pb) / 2):
                            # over a street: no wall, the bed on a plate girder with a parapet
                            K["yl_girder"].quad([*fa, fza - GIRDER], [*fb, fzb - GIRDER], [*fb, fzb + 0.9], [*fa, fza + 0.9])
                        elif max(za - ga, zb - gb) > 0.5:     # an embankment: the wall from the ground to a coping over the bed
                            K["yl_wall"].quad([*fa, min(fga, fza) - 0.3], [*fb, min(fgb, fzb) - 0.3], [*fb, fzb + 0.9], [*fa, fza + 0.9])
                        elif max(ga - za, gb - zb) > 0.5:   # a cutting: the retaining wall from the bed up to the ground and a parapet
                            K["yl_wall"].quad([*fb, fzb], [*fa, fza], [*fa, max(fga, fza) + 0.9], [*fb, max(fgb, fzb) + 0.9])
                # the masts, the cantilever over the track and the contact wire
                ms = R[:: int(MAST_EVERY / STEP)]
                for k in ms:
                    if not out[k]:   # (an inner track's wire hangs from the outer tracks' masts)
                        continue
                    base = P[k] + nrm[k] * out[k] * (BED_HALF + 0.3)
                    if under(base):   # (no mast stands in a street: its bridge's span carries the wire)
                        continue
                    zb_ = min(Z[k] - 0.55, T(*base))
                    K["yl_mast"].tube([[*base, zb_], [*base, Z[k] + WIRE + 1.2]], 0.13, 8)
                    tip = P[k] - nrm[k] * out[k] * 0.6
                    K["yl_mast"].tube([[*base, Z[k] + WIRE + 0.9], [*tip, Z[k] + WIRE + 0.9]], 0.05, 6)
                    K["yl_mast"].tube([[*base, Z[k] + WIRE + 0.3], [*tip, Z[k] + WIRE + 0.9]], 0.04, 6)
                K["yl_wire"].sweep([[*P[k], Z[k] + WIRE] for k in R[::2]], [(-0.012, -0.012), (0.012, -0.012), (0.012, 0.012), (-0.012, 0.012)])
            run = []
    # between two tracks whose beds part (round a platform, or as the lines spread towards a station): the bed carried
    # across, ballast over a deck, so that the street is not seen between them from over the line (the owner's
    # stills of the platform south of Shibuya, 27 November 2026)
    for ia, t in enumerate(L["tracks"]):
        for q in L["tracks"][ia + 1:]:
            nq = len(q["pts"])
            prev = None
            for i, p in enumerate(t["pts"]):
                cur = None
                m = q["geom"].project(Point(*p))
                c = np.array(q["geom"].interpolate(m).coords[0])
                d = float(np.linalg.norm(c - p))
                j = min(nq - 1, int(round(m / q["geom"].length * (nq - 1))))
                if _open(t, i) and _open(q, j) and 2 * BED_HALF < d < 25:
                    mid = (p + c) / 2
                    if not any(r is not t and r is not q and r["geom"].distance(Point(*mid)) < d / 2 - 0.5 for r in L["tracks"]):
                        u = (c - p) / d
                        zz = (float(t["z"][i]) + float(q["z"][j])) / 2 - 0.55
                        cur = (p + u * BED_HALF, c - u * BED_HALF, zz)
                if prev and cur:
                    (a0, a1, za), (b0, b1, zb) = prev, cur
                    up(K["yl_ballast"], [*a0, za], [*b0, zb], [*b1, zb], [*a1, za], [list(map(float, v)) for v in (a0, b0, b1, a1)])
                    two(K["yl_soffit"], [*a0, za - 0.25], [*b0, zb - 0.25], [*b1, zb - 0.25], [*a1, za - 0.25])
                prev = cur
    # a bridge's abutments: a wall either side of the street, across under both tracks from the ground to the bed
    edges = [LineString(offset(t["pts"], s * BED_HALF)) for t in L["tracks"] for s in (-1, 1)]
    for u in U:
        for s in (-1, 1):
            side = u["line"].offset_curve(s * u["hw"])
            hit = [q for g in edges for q in getattr(side.intersection(g), "geoms", [side.intersection(g)]) if q.geom_type == "Point" and q.distance(Point(*u["at"])) < 60]
            if len(hit) < 2:
                continue
            hit.sort(key=lambda q: side.project(q))
            a, b = hit[0], hit[-1]
            mid = Point((a.x + b.x) / 2, (a.y + b.y) / 2)
            if any(o is not u and o["line"].distance(mid) < o["hw"] - 0.5 for o in U):
                continue   # (in the next carriageway of the same road: the bridge spans them all, its abutments outside)
            top = []
            for q in (a, b):
                t = min(L["tracks"], key=lambda t: t["geom"].distance(q))
                top.append(float(t["z"][int(np.argmin(np.hypot(t["pts"][:, 0] - q.x, t["pts"][:, 1] - q.y)))]) - 0.55 - 0.25)
            z0 = min(u["z"], T(a.x, a.y), T(b.x, b.y)) - 0.3
            two(K["yl_wall"], [a.x, a.y, z0], [b.x, b.y, z0], [b.x, b.y, top[1]], [a.x, a.y, top[0]])
    for P in platforms():
        platform(K, P, two)
    # in each portal: the station's dark across the tracks SHED in, and the opening's jambs carried back to it; the
    # box's own roof is over them (cities/shibuya/scramble.py station())
    for o in portals():
        p, q = o["back"]
        two(K["yl_shed"], [*p, o["z0"]], [*q, o["z0"]], [*q, o["zt"]], [*p, o["zt"]])
        for p, q in o["sides"]:
            two(K["yl_shed"], [*p, o["z0"]], [*q, o["z0"]], [*q, o["zt"]], [*p, o["zt"]])
    return MATERIALS, [m for m in K.values() if m.v]


def up(mesh, a, b, c, d, uvs=None):
    """A quad facing up, whichever way round its corners come (a floor's normal turned down shades it with its own
    shadow: the platforms' floors striped)."""
    n = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
    if n >= 0:
        mesh.quad(a, b, c, d, uvs)
    else:
        mesh.quad(d, c, b, a, uvs[::-1] if uvs else None)


def platform(K, P, two):
    """A platform out of its station's box (platforms()): its floor with a coping and a tactile strip along each
    edge, its faces down to the bed, its underside, a railing across its free end, and its roofs' columns."""
    a, b, z = np.array(P["a"]), np.array(P["b"]), np.array(P["z"])
    w = np.linalg.norm(b - a, axis=1)[:, None]
    u = (b - a) / w                                     # across, from the west edge to the east
    def strip(mat, f0, f1, dz=0.0):
        """A band of the floor from f0 to f1 metres in from the west edge (negative: in from the east; None: the east
        edge itself), dz over it."""
        at = lambda f: a + u * (w if f is None else f if f >= 0 else w + f)
        x0, x1 = at(f0), at(f1)
        for k in range(len(a) - 1):
            up(K[mat], [*x0[k], z[k] + dz], [*x0[k + 1], z[k + 1] + dz], [*x1[k + 1], z[k + 1] + dz], [*x1[k], z[k] + dz])
    t0, t1 = TACTILE
    strip("yl_coping", 0.0, COPING)
    strip("yl_platform", COPING, t0)
    strip("yl_tactile", t0, t1, 0.01)
    strip("yl_platform", t1, -t1)
    strip("yl_tactile", -t1, -t0, 0.01)
    strip("yl_platform", -t0, -COPING)
    strip("yl_coping", -COPING, None)
    rail = z - DECK_M
    under = rail - 0.8                                  # (the bed's underside over a street: meshes())
    for k in range(len(a) - 1):
        # the faces to the tracks, from the floor down to the ballast, a little under the coping's lip
        K["yl_pface"].quad([*a[k + 1], z[k + 1] - 0.05], [*a[k], z[k] - 0.05], [*a[k], rail[k] - 0.55], [*a[k + 1], rail[k + 1] - 0.55])
        K["yl_pface"].quad([*b[k], z[k] - 0.05], [*b[k + 1], z[k + 1] - 0.05], [*b[k + 1], rail[k + 1] - 0.55], [*b[k], rail[k] - 0.55])
        two(K["yl_soffit"], [*a[k], under[k]], [*a[k + 1], under[k + 1]], [*b[k + 1], under[k + 1]], [*b[k], under[k]])
        # (the coping's lip: its edge face, the floor's thickness over the face below)
        K["yl_coping"].quad([*a[k + 1], z[k + 1]], [*a[k], z[k]], [*a[k], z[k] - 0.05], [*a[k + 1], z[k + 1] - 0.05])
        K["yl_coping"].quad([*b[k], z[k]], [*b[k + 1], z[k + 1]], [*b[k + 1], z[k + 1] - 0.05], [*b[k], z[k] - 0.05])
    for k, free in zip((0, -1), P["ends"]):
        if not free:
            continue
        # its own end, in the open: the end face down to the underside, and a railing across it
        e, f, ze = a[k], b[k], z[k]
        two(K["yl_pface"], [*e, under[k]], [*f, under[k]], [*f, ze], [*e, ze])
        n = max(2, int(np.linalg.norm(f - e) / 1.5))
        for j in range(n + 1):
            p = e + (f - e) * j / n
            K["yl_column"].tube([[*p, ze], [*p, ze + 1.1]], 0.025, 6)
        for h in (0.55, 1.1):
            K["yl_column"].tube([[*e, ze + h], [*f, ze + h]], 0.03, 6)
    # the roofs' columns, down the platform's middle every POST_M where a roof is over it, from its own end in
    mid = (a + b) / 2
    L = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(mid, axis=0), axis=1))])
    line = LineString(mid)
    ds = np.arange(3.0, L[-1], POST_M) if P["ends"][0] else np.arange(L[-1] - 3.0, 0, -POST_M)
    for d in ds:
        x, y = line.interpolate(d).coords[0]
        top = next((zu for F, zu in P["roofs"] if F.buffer(-1.0).contains(Point(x, y))), None)
        if top is None:
            continue
        zf = float(np.interp(d, L, z))
        K["yl_column"].tube([[x, y, zf], [x, y, top + 0.3]], 0.16, 10)
        # (its head: a short cross-arm under the roof, across the platform)
        k = int(np.clip(np.searchsorted(L, d), 0, len(u) - 1))
        h = u[k] * 1.6
        K["yl_column"].tube([[x - h[0], y - h[1], top - 0.15], [x + h[0], y + h[1], top - 0.15]], 0.1, 6)


def trains():
    L = layout()
    if not L:
        return None
    C, T = L["C"], L["T"]
    tracks = []
    for t in L["tracks"]:
        P, Z = t["pts"], t["z"]
        tracks.append({"id": t["id"], "line": t["line"], "south": not t["north"], "gauge": 1.067,
                       "p": [v for q, z in zip(P, Z) for v in (round(q[0] * 10), round(q[1] * 10), round(z * 10))],
                       "stops": t["stops"], "hide_m": [3.0, round(t["geom"].length - 3.0, 1)],
                       "dark": [[round(m0 - 2, 1), round(m1 + 2, 1)] for _, m0, m1 in t["dark"]]})
    # the platforms out of the stations' boxes (platforms()): their outlines and floors, for the roofs over them
    # (pipeline/stations.py on_platforms)
    plats = [{"station": P["station"], "z": round(float(min(P["z"])), 2),
              "ring": [round(float(v) * 10) for p in [*P["a"], *P["b"][::-1]] for v in p]} for P in platforms()]
    stations = []
    for S in STATIONS:
        x, y = C.fwd.transform(*S["entrance"])
        stations.append({"id": S["id"], "name": S["name"], "native": S["native"], "kana": S["kana"], "at": [round(x, 1), round(y, 1), round(T(x, y), 2)],
                         "r": 6, "hear_m": 25, "under": {"text": S["text"]}})
    return {
        "note": "The Yamanote Line through the map (cities/shibuya/rail.py): courses in decimetres at rail level, in the direction of travel. The stations stand inside buildings: boarded and left at a street entrance, the trains not drawn inside them.",
        "stations": stations,
        "tracks": tracks,
        "platforms": plats,
        "services": SERVICES,
    }
