"""The streets your car cannot be driven along, from the game's own measure (docs/ROADS.md, docs/BOUNDS.md).

tools/car_edges.js drives the car's own rules along every road line and lists where the car, driven through, stops
on dry, open road: a lane along a terrace's edge, a step the survey keeps where a street meets a slope. Inside the
area a car can go (game.bounds.ground) such a street is not one to offer a car: it is closed to cars in the plan as
the pieces the game cuts at a wall are, by its ends, under "steep" in cities/<id>/road_measured.json. Still painted,
still walked, out of the traffic's graph and every route.

    xvfb-run -a node tools/car_edges.js 1200 out_dir
    python pipeline/road_steep.py --city shibuya out_dir/car_edges.json   # then road_plan.py and pack.py
"""
import argparse
import json
import os

import numpy as np
from shapely.geometry import LineString, Point, Polygon

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NEAR_M = 4.0   # a place found within this of a piece's line is on it


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--city", default="shibuya")
    ap.add_argument("found")
    a = ap.parse_args()
    game = json.load(open(os.path.join(ROOT, "web", "data", a.city, "game.json"), encoding="utf8"))
    area = Polygon(game["bounds"]["ground"]["poly"]).buffer(game["bounds"]["ground"].get("soft", 22))
    found = json.load(open(a.found, encoding="utf8"))["found"]
    roads = game["paths"]["road"]
    lines = [LineString(np.asarray(o["p"], float).reshape(-1, 3)[:, :2] / 10) if len(o["p"]) >= 6 else None for o in roads]
    mp = os.path.join(ROOT, "cities", a.city, "road_measured.json")
    M = json.load(open(mp, encoding="utf8"))
    have = {tuple(e) for e in M.get("steep", [])}
    added = []
    for f in found:
        if f.get("wall") or f.get("water") or not f.get("met") or not area.contains(Point(f["at"][:2])):   # (met: the car driven through stopped there, or could not start)
            continue
        q = Point(f["at"][:2])
        best = min(((L.distance(q), i) for i, L in enumerate(lines) if L is not None and not roads[i].get("x") and L.distance(q) < NEAR_M), default=None)
        if best is None:
            print(f"  nothing open within {NEAR_M} m of {f['at'][0]:.0f}, {f['at'][1]:.0f}: {f['met']}")
            continue
        o = roads[best[1]]
        e = (o["p"][0], o["p"][1], o["p"][-3], o["p"][-2])
        if e not in have:
            have.add(e)
            added.append(e)
            print(f"  piece {best[1]} ({o.get('c')}) at {f['at'][0]:.0f}, {f['at'][1]:.0f}: {f['met']}")
    M["steep"] = sorted([list(e) for e in have])
    M["steep_source"] = "Inside the area a car can go, the pieces on which tools/car_edges.js finds your car, driven through, stops on dry, open road (pipeline/road_steep.py)."
    open(mp, "w", encoding="utf8").write(json.dumps(M, ensure_ascii=False, separators=(",", ":")).replace("],[", "],\n[") + "\n")   # (as tools/road_net_dump.js writes it)
    print(f"road steep: {len(added)} pieces added, {len(have)} in all")


if __name__ == "__main__":
    main()
