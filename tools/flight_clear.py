"""Does a story's flight clear the buildings? For every frame with a `flight` in cities/<city>/city.json, the
helicopter's path through each shot (a Catmull-Rom curve through the shot's `guide` points, as web/game/overture.js
flies it) is walked a metre at a time against the map's solids: it fails where a solid within MARGIN metres of the
path (LOW metres where it lifts off and comes down to land) stands higher than the helicopter's skids less CLEAR metres. Exits 1 on a failure.

    python tools/flight_clear.py [city]
"""
import json
import os
import sys

from shapely.geometry import Point, Polygon
from shapely.strtree import STRtree

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOW = 9.0
MARGIN, CLEAR = 16.0, 10.0  # (room that is seen to be room: twice a rotor, and a storey or three under the skids)


def curve(P, n=40):
    out = []
    for i in range(len(P) - 1):
        p0, p1, p2, p3 = P[max(i - 1, 0)], P[i], P[i + 1], P[min(i + 2, len(P) - 1)]
        for k in range(n):
            t = k / n
            out.append(tuple(0.5 * ((2 * p1[a]) + (-p0[a] + p2[a]) * t + (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t * t + (-p0[a] + 3 * p1[a] - 3 * p2[a] + p3[a]) * t ** 3) for a in range(3)))
    return out + [tuple(P[-1])]


def timed(path, step=0.05):
    """The film's own path (a flight's `path`: [x, y, z, t] points) as overture.js flies it: a cubic in time through the
    points (Hermite, each point's velocity from its neighbours, nought at an end and at a point repeated)."""
    P = [tuple(q[:3]) for q in path]
    T = [q[3] for q in path]
    n = len(P)
    same = lambda u, v: sum((u[a] - v[a]) ** 2 for a in range(3)) < 1e-6
    M = []
    for i in range(n):
        if i == 0 or i == n - 1 or same(P[i - 1], P[i]) or same(P[i], P[i + 1]):
            M.append((0.0, 0.0, 0.0))
        else:
            M.append(tuple((P[i + 1][a] - P[i - 1][a]) / max(1e-3, T[i + 1] - T[i - 1]) for a in range(3)))
    out = []
    for i in range(n - 1):
        h = max(1e-3, T[i + 1] - T[i])
        k = max(1, int(h / step))
        for j in range(k):
            u = j / k
            h00, h10, h01, h11 = 2 * u ** 3 - 3 * u ** 2 + 1, u ** 3 - 2 * u ** 2 + u, -2 * u ** 3 + 3 * u ** 2, u ** 3 - u ** 2
            out.append(tuple(h00 * P[i][a] + h10 * h * M[i][a] + h01 * P[i + 1][a] + h11 * h * M[i + 1][a] for a in range(3)))
    return out + [P[-1]]


def main():
    city = sys.argv[1] if len(sys.argv) > 1 else "shibuya"
    B = json.load(open(os.path.join(ROOT, "web", "data", city, "buildings.json"), encoding="utf8"))
    cfg = json.load(open(os.path.join(ROOT, "cities", city, "city.json"), encoding="utf8"))
    polys = [Polygon([(s[4][i] / 10, s[4][i + 1] / 10) for i in range(0, len(s[4]), 2)]).buffer(0) for s in B["s"]]
    tops = [(s[1] + s[3]) / 10 for s in B["s"]]
    lows = [(s[1] + s[2]) / 10 for s in B["s"]]
    tree = STRtree(polys)
    bad = 0
    for ep in cfg["game"]["story"]["episodes"]:
        for fi, fr in enumerate(ep["frames"]):
            fl = fr.get("flight") or {}
            ways = [("path", [tuple(q[:3]) for q in fl["path"]], timed(fl["path"]))] if fl.get("path") else []
            for shot in fl.get("shots", []):
                g = [p for p in shot.get("guide", []) if isinstance(p, list) and isinstance(p[0], (int, float))]
                if len(g) >= 2 and g[0] != g[-1]:
                    ways.append((shot["id"], g, curve(g)))
            for name, g, pts in ways:
                hits = []
                for x, y, z in pts:
                    m = LOW if z < g[-1][2] + 25 or z < g[0][2] + 8 else MARGIN  # (coming down to land, and lifting off: a rotor's width and a little)
                    for k in tree.query(Point(x, y).buffer(m)):
                        if tops[k] > z - CLEAR and lows[k] < z + 3 and polys[k].distance(Point(x, y)) < m:
                            if tops[k] - z > -CLEAR + 0.5 and not (abs(z - tops[k]) < 2.5 and (x, y, z) in (tuple(g[0]), tuple(g[-1]))):  # (not the roof or the ground it stands on)
                                hits.append((round(x), round(y), round(z), round(tops[k])))
                                break
                # (the pad it leaves and the ground it lands on are within a few metres of its skids by design)
                hits = [h for h in hits if not (h[3] - h[2] < 3 and (abs(h[2] - g[0][2]) < 6 or abs(h[2] - g[-1][2]) < 6))]
                # (and a whole flight's path lifts straight up off its pad and settles straight down onto its spot: within 12 m of
                # either, and less than 10 m over it, what is under it is the roof or the ground it stands on)
                hits = [h for h in hits if not (h[3] - h[2] < 3 and any(abs(h[0] - e[0]) < 12 and abs(h[1] - e[1]) < 12 and h[2] - e[2] < 10 for e in (g[0], g[-1])))]
                hits = sorted(set(hits), key=hits.index)
                print(f"frame {fi + 1} {name}: {'clear' if not hits else f'{len(hits)} points too close, first at {hits[0][:3]} under a top of {hits[0][3]} m'}")
                bad += bool(hits)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
