"""Buildings by what they are, where the data does not say: a building's style from its proportions (issue 163).

In Japan four buildings in five carry no class, and typology.facade_style() judged them by height and area alone:
anything under 10.5 m and 300 m2 was a house. So a footprint 36 m long and 9 m deep, one storey high, was drawn as a
house: a gabled box with a row of small windows and front doors along it (the "shed with pinhole windows" of the
owner's stills), and a low hall of 600 m2 as a block of flats. A detached house is small in both directions; what is
low and long, or low and wide, is something else, and its proportions say what:

  - one storey (up to SHED_TOP_M) and larger than a house: a shed. `industrial` (wide bays, a band of glazing, a big
    door) from SHED_M2 up, `plain` (no windows: drawn plainly and honestly) below it;
  - two or three storeys and longer than a house: a walk-up block (アパート): `apartment`, its roof as it is;
  - any windowed style on a hall: low (up to HALL_TOP_M), HALL_M2 or more and HALL_SIDE_M or more across: `industrial`.

typology.facade_style() has the same rule (not_a_house(), hall()) for the next build from the raw data; this pass
gives it to a buildings.json built before, without the downloads, with the storeys the style asks (typology.storeys).
Buildings with a class, a name's override, a landmark's parametric walls or a wall's style are left. A second run
changes nothing.

    python pipeline/proportion.py --city shibuya     # after build_scene.py's file, before stations.py ... pack.py
"""
import argparse
import json
import os
from collections import defaultdict

import numpy as np
from shapely.geometry import Polygon
from shapely.ops import unary_union

import restorey
import typology

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def shape_of(B, ks):
    """(area m2, short side m, long side m) of a building's parts on the ground, by its smallest rectangle."""
    P = []
    for k in ks:
        s = B["s"][k]
        if s[2] <= 0:
            r = np.asarray(s[4], np.float64).reshape(-1, 2) / 10
            if len(r) >= 3:
                P.append(Polygon(r).buffer(0))
    if not P:
        return None
    U = unary_union(P)
    if U.is_empty:
        return None
    c = np.asarray(U.minimum_rotated_rectangle.exterior.coords)
    a, b = float(np.hypot(*(c[1] - c[0]))), float(np.hypot(*(c[2] - c[1])))
    return U.area, min(a, b), max(a, b)


def mark(out_dir):
    path = os.path.join(out_dir, "buildings.json")
    B = json.load(open(path, encoding="utf8"))
    styles = B["styles"]
    by_b = defaultdict(list)
    for k, s in enumerate(B["s"]):
        by_b[s[0]].append(k)
    eaves = {r[0]: r[2] for r in B.get("r", [])}
    fronted = {B["s"][r[0]][0] for r in B.get("f", [])}
    count = defaultdict(int)
    for bi, m in enumerate(B["b"]):
        if len(m) < 13 or (m[1] or "") or m[4] == "parametric" or not by_b.get(bi):
            continue
        old = styles[m[10]]
        sh = shape_of(B, by_b[bi])
        if sh is None:
            continue
        new = typology.by_proportion(old, m[2], m[3], *sh)
        if new == old or new not in styles:
            continue
        m[10] = styles.index(new)
        wall = restorey.wall_height(B, by_b[bi], eaves)
        m[11], m[12] = typology.storeys(new, wall, m[3], bi in fronted and new in typology.STOREFRONT_STYLES) if new != "plain" else (m[11], m[12])
        count[f"{old} -> {new}"] += 1
    if count:
        with open(path, "w") as f:
            json.dump(B, f, separators=(",", ":"))
    return dict(count)


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--city", required=True)
    a = ap.parse_args()
    print(f"{a.city}: {mark(os.path.join(ROOT, 'web', 'data', a.city)) or 'nothing changed'}")


if __name__ == "__main__":
    main()
