"""The planned area: where a player may walk, drive and fly, worked out from the map's own data (docs/BOUNDS.md).

The ground's edge is the convex hull of what the story and the walk are played round, each given room: the hero
levels (their circles, and a street's width past them), every place a frame of the story stands or looks, the walk's
views from the street, the start and the car's kerb. The air's edge is the same places given a wider ring, and the
landmarks the walk's opening flies past, so that the helicopter turns back over the built city, before the land past
it shows. Both are written to cities/<id>/city.json game.bounds, simplified to a few corners, with the lines said at
the edge. Run again, it writes the same.

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


def compute(game, roads=None):
    P = places(game) + drive_room(game, roads)
    near = [(x, y) for x, y, _ in P]
    cx, cy = sum(p[0] for p in near) / len(near), sum(p[1] for p in near) / len(near)
    # (a stray far point, such as a quest's in another district, is not what the story is played round)
    P = [p for p in P if math.hypot(p[0] - cx, p[1] - cy) < 700]
    g = hull([q for x, y, r in P for q in circle(x, y, r)])
    marks = [m["at"] for m in ((game.get("walk") or {}).get("overture") or {}).get("marks", []) if m.get("at")]
    a = hull([q for x, y, r in P for q in circle(x, y, r + AIR_ROOM - GROUND_ROOM)] + [q for m in marks for q in circle(m[0], m[1], MARK_ROOM)])
    rnd = lambda poly: [[round(x, 1), round(y, 1)] for x, y in poly]
    return {
        "note": "The planned area (pipeline/bounds.py, docs/BOUNDS.md): the ground's edge, where a walker and a car are eased to a stop at the road works and turned back in, and the air's, where the helicopter is turned back in an arc. Local metres, counter-clockwise. Written by the pipeline; the lines are by hand.",
        "ground": {"poly": rnd(simplify(g, 12)), "soft": GROUND_SOFT},
        "air": {"poly": rnd(simplify(a, 12)), "soft": AIR_SOFT, "ceiling": CEILING},
    }


LINES = {
    "foot": "<b>Road works · closed ahead.</b> The streets past here are still being built; tonight Shibuya is open round the Scramble.",
    "car": "<b>Road closed ahead.</b> The streets past the works are still being built. Turn round at the barriers.",
    "air": "<b>Tower:</b> “{reg}, the city past here isn't open yet. Bring her round, back over the Scramble.”",
    "ceiling": "<b>Tower:</b> “{reg}, that's Haneda's approach above you. Down to four hundred, please.”",
    "closed": "Not open yet: the streets past the road works are still being built.",
    "sign": ["工事中", "この先 通行止め", "ROAD WORKS · CLOSED AHEAD"],
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
    b = compute(game, roads)
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
