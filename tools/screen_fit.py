"""Does every screen fit the wall it hangs on? (docs/HERO.md, "Scramble Square's base": what read as twisted)

For each screen of a map's ScreenSets (cities/<id>/city.py, pipeline/screens.py) that hangs on a wall (not a roof
screen on legs, not one bent along its own foot line), the wall behind it is sampled across its width at its foot, its
middle and its top, from the building's own solids at those heights: how far behind the screen's face the wall is at
each point. A screen whose wall is not one flat plane behind it (a curved or stepped front: the depth changes across it)
stands off it in places and cuts into it in others; one with no wall behind part of it hangs past the face's end
(wider than the face); one with the wall in front of part of it is inside the building.

    python tools/screen_fit.py [shibuya]        # prints each screen's fit; exit 1 on a misfit
"""
import json
import os
import sys

import numpy as np
from shapely.geometry import LineString, Polygon

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CITY = sys.argv[1] if len(sys.argv) > 1 else "shibuya"
sys.path.insert(0, os.path.join(ROOT, "pipeline"))
sys.path.insert(0, os.path.join(ROOT, "cities", CITY))
import screens as SC  # noqa: E402
import city as C  # noqa: E402

SPREAD = 0.6    # the wall's depth may vary this much across a frameless screen (m)
GAP = 0.3       # a framed screen's frame reaches back to its wall within this (m)
REACH = 4.0     # how far behind its face a wall is looked for (m)


def wall_depth(solids, p, n, z):
    """the distance from p back along -n to the first wall of a solid standing at height z; None if none within REACH;
    negative if p is inside one"""
    from shapely.geometry import Point
    for q in solids:
        if q["base"] <= z <= q["base"] + q["top"] and Polygon(q["ring"]).buffer(0).contains(Point(*p)):
            return -0.01
    best = None
    ray = LineString([p, p - n * REACH])
    for q in solids:
        if not (q["base"] + q.get("min", 0) - 0.5 <= z <= q["base"] + q["top"] + 0.5):
            continue
        hit = ray.intersection(Polygon(q["ring"]).buffer(0).exterior)
        if hit.is_empty:
            continue
        pts = [hit] if hit.geom_type == "Point" else [g for g in getattr(hit, "geoms", []) if g.geom_type == "Point"]
        for g in pts:
            d = float(np.linalg.norm(np.array([g.x, g.y]) - p))
            best = d if best is None else min(best, d)
    return best


def main():
    scene = json.load(open(os.path.join(ROOT, "web", "data", CITY, "scene.json")))
    node = scene["landmarks"]["scramble"]["node"]
    sets = [v for v in vars(C).values() if isinstance(v, SC.ScreenSet)]
    bad = 0
    for S in sets:
        try:
            placed = S.placed(node)
        except KeyError as e:   # (a set of another map's screens, not built here)
            print(f"  (a set not on this map: {e})")
            continue
        for spec, s in zip(S.specs, placed):
            if "path" in s:
                continue
            if s.get("roof"):   # on legs on the roof (pipeline/screens.py): every leg's foot on a roof at its height
                from shapely.geometry import Point
                n = np.asarray(s["normal"], float)
                t = SC.left_of(n)
                allsol = [q for k, v in SC.buildings(S.city)["s"].items() for q in v]
                feet = [np.asarray(s["at"], float) - n * 2.0 - n * back + t * v for back in (0.3, 3.0)
                        for v in np.linspace(-s["w"] / 2 + 0.8, s["w"] / 2 - 0.8, max(2, int(s["w"] / 4.5) + 1))]
                # (a brace's foot may meet the wall of a taller part behind: inside a solid that stands over the roof)
                off = [f for f in feet if not any(q["base"] + q["top"] > s["top"] - 1.5 and Polygon(q["ring"]).buffer(0.3).contains(Point(*f))
                                                  for q in allsol)]
                bad += bool(off)
                print(f"{'! ' if off else '  '}{s['name']} (on the roof of {spec['building']}): {len(feet) - len(off)} of {len(feet)} legs on the roof")
                continue
            try:
                bi = SC.building_index(S.city, spec["building"])[0]
            except Exception:
                print(f"  ? {s['name']}: its building {spec['building']} is not on this map")
                continue
            # (the city's solids near the screen: a building of another name may be the wall it hangs on)
            allsol = [q for k, v in SC.buildings(S.city)["s"].items() for q in v]
            n, t = np.asarray(s["normal"], float), SC.left_of(np.asarray(s["normal"], float))
            c = np.asarray(s["at"], float) + n * (s["off"] + 0.125)
            near = [q for q in allsol if Polygon(q["ring"]).distance(LineString([c - t * s["w"], c + t * s["w"]])) < REACH]
            parts = spec.get("parts", [[0.0, 1.0, 0.0, 1.0]])
            depths, rows = [], []
            for fv in (0.05, 0.5, 0.95):
                row = []
                z = s["z0"] + fv * s["h"]
                # the screen's extent at this height: its parts' union
                us = [(q[0] + (q[4] - q[0]) * ((fv - q[2]) / max(q[3] - q[2], 1e-6)), q[1] + (q[5] - q[1]) * ((fv - q[2]) / max(q[3] - q[2], 1e-6)))
                      if len(q) >= 6 else (q[0], q[1]) for q in parts if q[2] - 1e-6 <= fv <= q[3] + 1e-6]
                if not us:
                    continue
                u0, u1 = min(a for a, _ in us), max(b for _, b in us)
                ov = spec.get("overhang", 0.0) / s["w"]   # (published wider than the mapped face: its ends past it, on its frame)
                for fu in np.linspace(u0 + max(0.02, ov), u1 - max(0.02, ov), 9):
                    p = c + t * (-s["w"] / 2 + fu * s["w"])
                    d = wall_depth(near, p, n, z)
                    row.append(d)
                    if d is not None:
                        depths.append(d)
                rows.append((fv, row))
            miss = sum(d is None for _, r in rows for d in r)
            inside = sum(d is not None and d < 0 for _, r in rows for d in r)
            spread = (max(depths) - min(depths)) if depths else 0.0
            # a framed screen's frame fills back to the wall (pipeline/screens.py: from its face to off + 0.125 behind it):
            # its wall may curve behind it so long as the frame reaches it; a frameless one lies on its wall
            reach = s["off"] + 0.125 + spec.get("back", 0.0)
            fits = (max(depths, default=0) <= reach + GAP) if s["frame"] > 0 else spread <= SPREAD
            ok = miss == 0 and inside == 0 and fits
            bad += not ok
            fmt = lambda r: " ".join("--" if d is None else f"{d:4.1f}" for d in r)
            print(f"{'  ' if ok else '! '}{s['name']} ({s['w']} x {s['h']} m on {spec['building']}): wall {min(depths, default=0):.2f} to "
                  f"{max(depths, default=0):.2f} m behind{'' if not miss else f', none behind {miss} of {sum(len(r) for _, r in rows)} points'}"
                  f"{'' if not inside else f', inside the building at {inside}'}")
            if not ok:
                for fv, r in rows:
                    print(f"      at {fv:.2f} of its height: {fmt(r)}")
    print(f"{bad} screens do not fit their walls" if bad else "every wall screen fits its wall")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
