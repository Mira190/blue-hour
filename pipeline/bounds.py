"""The planned area: where a player may walk, drive and fly, worked out from the map's own data (docs/BOUNDS.md).

The ground's edge is the convex hull of what the story and the walk are played round, each given room: the hero
levels (their circles, and a street's width past them), every place a frame of the story stands or looks, the walk's
views from the street, the start and the car's kerb. The air's edge is the same places given a wider ring, and the
landmarks the walk's opening flies past, so that the helicopter turns back over the built city, before the land past
it shows. Where city.json game.drive_area gives corners, the ground's edge is the drive area instead: those corners,
each edge slid to where the city's streets cross it least, held inside a phone's district and round the story's places
(drive_area()), and the air's edge takes it in too. Both are written to cities/<id>/city.json game.bounds, with the
lines said at the edge. Run again, it writes the same.

    python pipeline/bounds.py --city shibuya          # write game.bounds, then pipeline/game_text.py and pack.py
    python pipeline/bounds.py --city shibuya --check  # exit 1 if game.bounds is not what the data gives
"""
import argparse
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

GROUND_ROOM = 70.0    # m past a place of the story or the walk: the street it stands in, and the next corner
HERO_ROOM = 45.0      # m past a hero level's circle
AIR_ROOM = 360.0      # m past the ground's places: what the helicopter is given
MARK_ROOM = 120.0     # m past a landmark the walk's opening flies by
CEILING = 420.0       # m above the sea: over SKY's roof (244 m) with room, under Haneda's approach and the far map
DRIVE_ROOM = 40.0     # m past the roads a drive between two of the places takes: the easing at the edge, a carriageway, and a car
GROUND_SOFT = 22.0    # m inside the ground's edge where a walker and a car are eased (bounds.js)
DISTRICT_BAND = 200.0 # m inside a phone's district the drive area keeps: past it a phone has the scenery band and the skyline
EDGE_SLIDE = 90.0     # m each edge of the drive area may slide along its normal to where the city's streets cross it least
NODE_CLEAR = 40.0     # m from a junction an edge crossing is not wanted: a car is never turned back in a junction
ALONG_M = 25.0        # m: a street running along an edge within this is half in, half out
AIR_SOFT = 220.0      # m inside the air's edge where the helicopter is turned back, in an arc


def circle(x, y, r, n=24):
    return [(x + r * math.cos(2 * math.pi * k / n), y + r * math.sin(2 * math.pi * k / n)) for k in range(n)]


def hull(pts):
    pts = sorted(set(pts))
    if len(pts) < 3:
        return pts
    cross = lambda o, a, b: (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, hi = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0:
            lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(hi) >= 2 and cross(hi[-2], hi[-1], p) <= 0:
            hi.pop()
        hi.append(p)
    return lo[:-1] + hi[:-1]  # counter-clockwise


def simplify(poly, keep):
    """Drop the corner that turns least, again and again, to `keep` corners; each drop moves the edge outward only
    (the two neighbours' edges are extended to meet), so the simplified hull still holds every place."""
    P = list(poly)
    while len(P) > keep:
        best, bi = None, -1
        for i in range(len(P)):
            a, b, c = P[i - 1], P[i], P[(i + 1) % len(P)]
            area = abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2
            if best is None or area < best:
                best, bi = area, i
        # cut the shortest edge instead: meet its two neighbouring edges' lines (outward)
        n = len(P)
        i = min(range(n), key=lambda k: math.dist(P[k], P[(k + 1) % n]))
        a, b, c, d = P[i - 1], P[i], P[(i + 1) % n], P[(i + 2) % n]
        m = meet(a, b, d, c)
        if m is None or math.dist(m, b) > 80:
            del P[bi]  # (nearly parallel: the corner that turns least goes)
            continue
        P[i] = m
        del P[(i + 1) % n]
    return P


def meet(a, b, c, d):
    """Where the line a->b meets the line c->d (or None, near parallel)."""
    r = (b[0] - a[0], b[1] - a[1])
    s = (d[0] - c[0], d[1] - c[1])
    den = r[0] * s[1] - r[1] * s[0]
    if abs(den) < 1e-6 * math.hypot(*r) * math.hypot(*s):
        return None
    t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den
    return (a[0] + t * r[0], a[1] + t * r[1])


def places(game):
    """[(x, y, room)] of what the story and the walk stand on the ground and look at there."""
    out = []
    for h in game.get("hero", []):
        if h.get("at") and h.get("r"):
            out.append((h["at"][0], h["at"][1], h["r"] + HERO_ROOM))
    s = game.get("start", {})
    for k in ("at", "car", "facing"):
        if s.get(k):
            out.append((s[k][0], s[k][1], GROUND_ROOM))

    def walk(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if k in ("at", "stand", "look", "subject", "drive", "photo", "to", "from") and isinstance(v, list) and len(v) >= 2 \
                        and all(isinstance(t, (int, float)) for t in v[:2]) and (len(v) < 3 or v[2] < 60):
                    out.append((v[0], v[1], GROUND_ROOM))
                walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)
    for k in ("story", "frames"):
        walk((game.get("story") or {}).get(k) if k == "frames" else None)
    st = game.get("story") or {}
    walk({k: v for k, v in st.items() if k not in ("note",)})
    wk = game.get("walk") or {}
    walk({k: v for k, v in wk.items() if k != "overture"})
    return out


def drive_room(game, roads):
    """[(x, y, room)] along the roads that the drives between the places a drive is asked to take (road_routes.py):
    the planned area holds its own drives, or a route line leads the player into the road works (issue 196: the
    only way to SKY GATE's kerb, on Meiji-dori's northbound side, is round the station by Route 246, and that
    left the hull of the places by 57 m)."""
    if not roads:
        return []
    import road_routes
    spots = road_routes.places(game, {"game": game})
    return [(x, y, DRIVE_ROOM) for x, y in road_routes.ways(roads, spots)]


def convex(poly):
    n = len(poly)
    cross = lambda o, a, b: (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    return all(cross(poly[i], poly[(i + 1) % n], poly[(i + 2) % n]) > 0 for i in range(n))


def lines_of(roads):
    """[(points (k, 2), class)] of the open road pieces on the ground, and the junction nodes (where three or more meet)."""
    import collections
    import numpy as np
    out, ends = [], collections.Counter()
    for o in roads or []:
        if o.get("x") or len(o["p"]) < 6:
            continue
        p = np.asarray(o["p"], float).reshape(-1, 3)
        if p[:, 2].max() - p[:, 2].min() > 25:   # (an expressway's ramp: not where a player meets the edge)
            continue
        out.append((p[:, :2] / 10, o.get("c")))
        for q in (p[0], p[-1]):
            ends[(round(q[0] / 10), round(q[1] / 10))] += 1
    return out, [k for k, n in ends.items() if n >= 3]


CROSS_COST = {"motorway": 0, "trunk": 6, "primary": 5, "secondary": 4, "tertiary": 3, "unclassified": 2, "residential": 1.5, "living_street": 1, "service": 0.5}


def edge_cost(a, b, lines, nodes):
    """What it costs to put the edge on the line a -> b: each street that crosses it (the wider the street, the more:
    a car meets the edge there at speed), more where it crosses near a junction, and a street that runs along it.
    lines: lines_of()'s, with an STRtree over them (index())."""
    import numpy as np
    from shapely.geometry import LineString, Point
    E = LineString([a, b])
    tx, ty = (b[0] - a[0]) / E.length, (b[1] - a[1]) / E.length
    cost = 0.0
    tree, geoms, items = lines
    for j in tree.query(E.buffer(ALONG_M), predicate="intersects"):
        L, (p, c) = geoms[j], items[j]
        hit = L.intersection(E)
        pts = [hit] if hit.geom_type == "Point" else list(getattr(hit, "geoms", []))
        for q in pts:
            if q.geom_type != "Point":
                continue
            w = CROSS_COST.get(c, 1.0)
            near = float(np.min(np.hypot(nodes[:, 0] - q.x, nodes[:, 1] - q.y))) if len(nodes) else 1e9
            cost += w * (1 + 3 * max(0.0, 1 - near / NODE_CLEAR))
        # a street along the edge: the length of it within ALONG_M that runs within 30 degrees of the edge's way
        seg = np.diff(p, axis=0)
        ln = np.hypot(seg[:, 0], seg[:, 1])
        mid = (p[:-1] + p[1:]) / 2
        par = np.abs(seg[:, 0] * tx + seg[:, 1] * ty) > 0.866 * np.maximum(ln, 1e-6)
        for k in np.nonzero(par)[0]:
            if E.distance(Point(mid[k])) < ALONG_M:
                cost += 0.02 * ln[k] * CROSS_COST.get(c, 1.0)
    return cost


def drive_area(spec, keep, district, roads):
    """The drive area (docs/BOUNDS.md): the corners city.json game.drive_area gives, each edge slid along its normal,
    within EDGE_SLIDE, to where the city's streets cross it least (a railway, a park, the back of a block), never in a
    junction; held DISTRICT_BAND inside a phone's district and round every place of the story (keep, a polygon)."""
    from shapely.geometry import Polygon, box
    import numpy as np
    import shapely
    from shapely.geometry import LineString
    P = [tuple(q) for q in spec["poly"]]
    items, nodes = lines_of(roads)
    geoms = [LineString(p) for p, _ in items]
    lines, nodes = (shapely.STRtree(geoms), geoms, items), np.asarray(nodes, float).reshape(-1, 2)
    lim = box(district["x"][0] + DISTRICT_BAND, district["y"][0] + DISTRICT_BAND, district["x"][1] - DISTRICT_BAND, district["y"][1] - DISTRICT_BAND) if district else None
    n = len(P)
    off = [0.0] * n
    for _ in range(2):
        for i in range(n):
            a, b = P[i], P[(i + 1) % n]
            l = math.dist(a, b)
            nx, ny = (b[1] - a[1]) / l, -(b[0] - a[0]) / l     # (outward, counter-clockwise)
            best = None
            for d in range(-int(EDGE_SLIDE), int(EDGE_SLIDE) + 1, 5):
                q = [((x + nx * d), (y + ny * d)) for x, y in (a, b)]
                trial = list(P)
                trial[i], trial[(i + 1) % n] = q[0], q[1]
                poly = corners(trial, i, n, P)
                if poly is None:
                    continue
                g = Polygon(poly)
                if not g.is_valid or not g.contains(keep) or (lim is not None and not lim.contains(g)) or not convex(poly):
                    continue
                c = edge_cost(q[0], q[1], lines, nodes) + 0.004 * abs(d)
                if best is None or c < best[0]:
                    best = (c, d, poly)
            if best:
                off[i] += best[1]
                P = best[2]
    return P


def corners(trial, i, n, P):
    """The polygon with edge i moved: its two corners where it meets its neighbours' lines."""
    prev_a, prev_b = P[(i - 1) % n], P[i]
    next_a, next_b = P[(i + 1) % n], P[(i + 2) % n]
    a = meet(prev_a, prev_b, trial[i], trial[(i + 1) % n])
    b = meet(trial[i], trial[(i + 1) % n], next_a, next_b)
    if a is None or b is None:
        return None
    out = list(P)
    out[i], out[(i + 1) % n] = a, b
    return out


def compute(game, roads=None, district=None):
    P = places(game) + drive_room(game, roads)
    near = [(x, y) for x, y, _ in P]
    cx, cy = sum(p[0] for p in near) / len(near), sum(p[1] for p in near) / len(near)
    # (a stray far point, such as a quest's in another district, is not what the story is played round)
    P = [p for p in P if math.hypot(p[0] - cx, p[1] - cy) < 700]
    g = hull([q for x, y, r in P for q in circle(x, y, r)])
    marks = [m["at"] for m in ((game.get("walk") or {}).get("overture") or {}).get("marks", []) if m.get("at")]
    story = simplify(g, 12)
    spec = game.get("drive_area")
    if spec:
        from shapely.geometry import Polygon
        ground = drive_area(spec, Polygon(story).buffer(GROUND_SOFT), district, roads)
    else:
        ground = story
    a = hull([q for x, y, r in P for q in circle(x, y, r + AIR_ROOM - GROUND_ROOM)] + [q for m in marks for q in circle(m[0], m[1], MARK_ROOM)]
             + ([q for x, y in ground for q in circle(x, y, AIR_ROOM - GROUND_ROOM)] if spec else []))
    if spec and district:   # (the helicopter turns back over the built city: no further than the phone's scenery band)
        from shapely.geometry import Polygon, box
        clip = Polygon(a).intersection(box(district["x"][0] - 100, district["y"][0] - 100, district["x"][1] + 100, district["y"][1] + 100))
        a = [tuple(q) for q in list(clip.exterior.coords)[:-1]]
        if Polygon(a).exterior.is_ccw is False:
            a = a[::-1]
    rnd = lambda poly: [[round(x, 1), round(y, 1)] for x, y in poly]
    return {
        "note": "The playable area (pipeline/bounds.py, docs/BOUNDS.md): the ground's edge, the drive area where a walker and a car are eased to a stop and turned back in (nothing drawn there: the roads and their traffic run on past it), and the air's, where the helicopter is turned back in an arc. Local metres, counter-clockwise. Written by the pipeline; the lines are by hand.",
        "ground": {"poly": rnd(ground if spec else simplify(g, 12)), "soft": GROUND_SOFT},
        "air": {"poly": rnd(simplify(a, 12)), "soft": AIR_SOFT, "ceiling": CEILING},
    }


LINES = {
    "foot": "<b>Tonight is round the Scramble.</b> The story is back towards the crossing.",
    "car": "<b>Tonight's drive is the streets round the station.</b> Turn back towards Shibuya.",
    "air": "<b>Tower:</b> “{reg}, the city past here isn't open yet. Bring her round, back over the Scramble.”",
    "ceiling": "<b>Tower:</b> “{reg}, that's Haneda's approach above you. Down to four hundred, please.”",
    "closed": "Tonight is round the Scramble: somewhere nearer the crossing.",
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--city", default="shibuya")
    ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    path = os.path.join(ROOT, "cities", a.city, "city.json")
    cfg = json.load(open(path, encoding="utf8"))
    game = cfg["game"]
    gp = os.path.join(ROOT, "web", "data", a.city, "game.json")
    roads = json.load(open(gp, encoding="utf8"))["paths"]["road"] if os.path.exists(gp) else None
    b = compute(game, roads, cfg.get("phone_district"))
    old = game.get("bounds") or {}
    b["lines"] = old.get("lines") or LINES
    if a.check:
        same = {k: old.get(k) for k in ("ground", "air")} == {k: b[k] for k in ("ground", "air")}
        print("ok   bounds: as the data gives" if same else "FAIL bounds: game.bounds is not what the data gives: run python pipeline/bounds.py, game_text.py and pack.py")
        return 0 if same else 1
    # (city.json keeps one line a key under "game": the line is replaced, or put in after "lobbies")
    text = open(path, encoding="utf8").read().split("\n")
    line = '    "bounds": ' + json.dumps(b, ensure_ascii=False) + ","
    at = [i for i, t in enumerate(text) if t.startswith('    "bounds": ')]
    if at:
        text[at[0]] = line
    else:
        text.insert([i for i, t in enumerate(text) if t.startswith('    "lobbies": ')][0] + 1, line)
    open(path, "w", encoding="utf8").write("\n".join(text))
    assert json.load(open(path, encoding="utf8"))["game"]["bounds"]["ground"] == b["ground"]
    gx = [p[0] for p in b["ground"]["poly"]]
    gy = [p[1] for p in b["ground"]["poly"]]
    ax = [p[0] for p in b["air"]["poly"]]
    ay = [p[1] for p in b["air"]["poly"]]
    print(f"bounds: ground {len(gx)} corners, x {min(gx):.0f}..{max(gx):.0f}, y {min(gy):.0f}..{max(gy):.0f}; "
          f"air {len(ax)} corners, x {min(ax):.0f}..{max(ax):.0f}, y {min(ay):.0f}..{max(ay):.0f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
