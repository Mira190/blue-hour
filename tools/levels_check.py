#!/usr/bin/env python3
"""What is built stands on the ground by rule: the checks that hold the class of issue 163 (static, seconds).

A wall with a jagged top, a hoarding hanging over ground that was graded under it, a building a storey over its
street and a paved mound are one fault: a thing whose heights were read point by point from a ground it does not
share with the rest (docs/LEVELS.md). Each was found by the owner in a still. These find them in the data, with
places:

  runs    every run built by the rule (pipeline/levels.py, cities/<id>/levels.json "runs") against the ground as it is now:
          each bay's top level and between its height and its height plus its slack over the highest ground under it,
          its foot under the lowest; no tooth in its tops (a level that rises and falls again within two bays). A run
          whose ground was changed after it was built fails here: build the landmarks again.
  feet    every footing (its "feet"): its base on the highest ground under it, its foot under the lowest.
  tops    every landmark mesh, however it was built: the level top edges of its upright faces, chained end to end;
          a panel whose top stands over or under both its neighbours' is a tooth (a top that copies the ground's
          noise). This is what catches a generator that does not use the rule.
  bases   every building that stands on the ground: its base at the lowest ground along its walls (what
          street_ground.py rebase() sets), so that its ground floor answers the ground and nothing of it hangs.
  slopes  the ground itself: no cell that is paved (outside the water, a building, a mapped stair or ramp, open land)
          steeper than a street can be, beyond the budget in tools/budgets/levels.json: a paved mound.

    python3 tools/levels_check.py [shibuya]            # lines of ok / FAIL, places as x,y
    python3 tools/levels_check.py shibuya --list 20    # the worst places of each kind, for stills
"""
import argparse
import base64
import json
import os
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "pipeline"))
import levels  # noqa: E402

TOL = 0.03          # the heights are written to the centimetre, the ground to the decimetre
TOOTH_M = 0.08      # a top this far over or under both its neighbours
TOOTH_LEN_M = 9.0   # ... on a panel no longer than this (a longer level stretch is a terrace, not a tooth)
BASE_M = 0.25       # a building's base this far from the lowest ground along its walls
STEEP = 0.15        # a paved cell steeper than this (a street's limit is 12 %: 道路構造令, small streets)


def check_runs(L, G):
    fails, n = [], 0
    for r in L.get("runs", []):
        h, slack, bays = r["height"], r.get("slack", levels.SLACK_M), r["bays"]
        for ax, ay, bx, by, top, foot in bays:
            n += 1
            lo, hi = G.along((ax, ay), (bx, by))
            at = f"{(ax + bx) / 2:.0f},{(ay + by) / 2:.0f}"
            if top - hi < h - TOL:
                fails.append((hi + h - top, f"{r['kind']} at {at}: its top is {top - hi:.2f} m over the ground, {h} m asked (buried {hi + h - top:.2f} m)"))
            elif top - hi > h + slack + levels.FILL_M + TOL:
                fails.append((top - hi - h - slack, f"{r['kind']} at {at}: its top stands {top - hi:.2f} m over the ground, at most {h + slack + levels.FILL_M:.2f} m by its rule"))
            if foot > lo - 0.05:
                fails.append((foot - lo + 0.05, f"{r['kind']} at {at}: its foot hangs {foot - lo:+.2f} m from the lowest ground under it"))
        tops = [b[4] for b in bays]
        joined = [np.hypot(bays[k + 1][0] - bays[k][2], bays[k + 1][1] - bays[k][3]) < 0.02 for k in range(len(bays) - 1)]
        for k in range(1, len(bays) - 1):
            if joined[k - 1] and joined[k]:
                for j in (k, k + 1):   # a tooth of one bay, or of two at one level
                    if j < len(bays) - 1 and joined[j] and all(abs(tops[i] - tops[k]) < 1e-6 for i in range(k, j + 1)):
                        a, b = tops[k] - tops[k - 1], tops[k] - tops[j + 1]
                        if a * b > 0 and min(abs(a), abs(b)) > TOOTH_M:
                            fails.append((min(abs(a), abs(b)), f"{r['kind']} at {bays[k][0]:.0f},{bays[k][1]:.0f}: a tooth of {min(abs(a), abs(b)):.2f} m in its top ({tops[k - 1]:.2f}, {tops[k]:.2f}, {tops[j + 1]:.2f})"))
                        break
    return n, fails


def check_feet(L, G):
    fails = []
    for x, y, base, foot, rad in L.get("feet", []):
        z = G.stand(*levels.ring_of(x, y, rad).T)
        if base < z.max() - 0.05 or base > z.max() + 0.05:
            fails.append((abs(base - z.max()), f"a footing at {x:.0f},{y:.0f}: its base {base - z.max():+.2f} m from the ground under it"))
        if foot > z.min() - 0.05:
            fails.append((foot - z.min(), f"a footing at {x:.0f},{y:.0f}: its foot hangs {foot - z.min():+.2f} m over the lowest ground under it"))
    return len(L.get("feet", [])), fails


def check_tops(L, skip=()):
    """Teeth in the tops of every landmark mesh's upright faces."""
    fails, n = [], 0
    for m in L.get("meshes", []):
        if any(m["name"].startswith(s) for s in skip):
            continue
        P = np.asarray(m["position"], np.float64).reshape(-1, 3)
        I = np.asarray(m["index"], np.int64).reshape(-1, 3) if m.get("index") else np.arange(len(P)).reshape(-1, 3)
        if not len(I):
            continue
        T = P[I]
        nrm = np.cross(T[:, 1] - T[:, 0], T[:, 2] - T[:, 0])
        A = np.linalg.norm(nrm, axis=1)
        up = (A > 1e-6) & (np.abs(nrm[:, 2]) < 0.02 * np.maximum(A, 1e-9))
        T = T[up]
        if not len(T):
            continue
        o = np.argsort(T[:, :, 2], 1)
        Ts = np.take_along_axis(T, o[:, :, None], 1)
        # a face's top edge: its two highest corners at one height, a metre or more apart, 0.6 m or more over its lowest
        a, b, low = Ts[:, 1], Ts[:, 2], Ts[:, 0]
        ok = (np.abs(a[:, 2] - b[:, 2]) < 0.005) & (np.hypot(a[:, 0] - b[:, 0], a[:, 1] - b[:, 1]) > 1.0) & (a[:, 2] - low[:, 2] > 0.6)
        a, b = a[ok], b[ok]
        if not len(a):
            continue
        key = lambda p: (int(round(p[0] * 20)), int(round(p[1] * 20)))
        edges = {}
        for p, q in zip(a, b):
            k = tuple(sorted((key(p), key(q))))
            # (the two sides of a panel, and a band over a band, are one top: the highest)
            if k not in edges or p[2] > edges[k][2]:
                edges[k] = (p[:2], q[:2], float(p[2]))
        ends = {}
        for k in edges:
            for e in k:
                ends.setdefault(e, []).append(k)
        n += len(edges)
        for k, (p, q, z) in edges.items():
            if np.hypot(*(p - q)) > TOOTH_LEN_M:
                continue
            nb = []
            for e in k:
                o2 = [x for x in ends[e] if x != k]
                if len(o2) != 1:
                    break
                # (the neighbour runs on along the line: a wall that turns a corner onto another level is not a tooth)
                p2, q2, z2 = edges[o2[0]]
                d1, d2 = (q - p) / np.hypot(*(q - p)), (q2 - p2) / np.hypot(*(q2 - p2))
                if abs(float(d1 @ d2)) < 0.7:
                    break
                nb.append(z2)
            if len(nb) == 2:
                da, db = z - nb[0], z - nb[1]
                if da * db > 0 and min(abs(da), abs(db)) > TOOTH_M:
                    c = (p + q) / 2
                    fails.append((min(abs(da), abs(db)), f"{m['name']} at {c[0]:.0f},{c[1]:.0f}: a tooth of {min(abs(da), abs(db)):.2f} m in a top ({nb[0]:.2f}, {z:.2f}, {nb[1]:.2f})"))
    return n, fails


def check_bases(city, G, game, scene, L):
    """Buildings whose base is not the lowest ground along their walls (as street_ground.rebase() sets them)."""
    bp = os.path.join(ROOT, "web", "data", city, "buildings.json")
    B = json.load(open(bp, encoding="utf8"))
    f = B["s_fields"]
    k_b, k_base, k_min, k_ring = f.index("building"), f.index("base_dm"), f.index("min_dm"), f.index("ring_dm")
    heroes = [(h["at"], h["r"]) for h in game.get("hero", []) if h.get("at") and h.get("r")]
    skip = set()
    for i in list(scene.get("hidden_solids", [])) + list(L.get("demolished", [])) + list(L.get("hidden", [])):
        skip.add(B["s"][i][k_b])
    for key in ("piers", "inner_posts"):
        for i in (B.get(key) or {}):
            skip.add(B["s"][int(i)][k_b] if key == "piers" else int(i))
    by = {}
    for i, sd in enumerate(B["s"]):
        by.setdefault(sd[k_b], []).append(i)
    fails, n = [], 0
    for bi, idxs in by.items():
        if bi in skip or B["b"][bi][5] == "R" or any(B["s"][i][k_min] > 0 for i in idxs):
            continue
        low, base, c = np.inf, np.inf, None
        for i in idxs:
            r = np.asarray(B["s"][i][k_ring], np.float64).reshape(-1, 2) / 10
            c = r.mean(0) if c is None else c
            nx = np.roll(r, -1, 0)
            m = np.maximum(1, np.ceil(np.hypot(*(nx - r).T))).astype(int)
            P = np.vstack([a + (b - a) * np.linspace(0, 1, k, endpoint=False)[:, None] for a, b, k in zip(r, nx, m)])
            low, base = min(low, float(G.at(P[:, 0], P[:, 1]).min())), min(base, B["s"][i][k_base] / 10)
        if any(np.hypot(c[0] - at[0], c[1] - at[1]) < rad + 60 for at, rad in heroes):
            continue   # (a hero level's buildings stand on its own floor: docs/HERO.md)
        n += 1
        d = base - max(low, 0.0)
        if abs(d) > BASE_M:
            fails.append((abs(d), f"a building at {c[0]:.0f},{c[1]:.0f}: its base is {d:+.2f} m from the lowest ground along its walls"))
    return n, fails


def steep_cells(city, G, game, scene):
    """The paved cells steeper than a street: (their number, the places of the worst clusters)."""
    from scipy import ndimage
    T, cell = G.T, G.cell
    gx, gy = np.abs(np.diff(T, axis=1))[:-1, :] / cell, np.abs(np.diff(T, axis=0))[:, :-1] / cell
    s = np.hypot(gx, gy)
    B = json.load(open(os.path.join(ROOT, "web", "data", city, "buildings.json"), encoding="utf8"))
    out = ~levels.paved(G, game, B, scene, blocks=True)
    steep = (s > STEEP) & ~out
    lab, k = ndimage.label(steep)
    places = []
    if k:
        size = ndimage.sum(steep, lab, range(1, k + 1))
        worst = ndimage.maximum(s, lab, range(1, k + 1))
        com = ndimage.center_of_mass(steep, lab, range(1, k + 1))
        for i in np.argsort(-size * worst)[:200]:
            places.append((float(size[i] * worst[i]), f"paved ground at {G.x0 + (com[i][1] + 0.5) * cell:.0f},{G.y1 - (com[i][0] + 0.5) * cell:.0f}: {int(size[i])} cells of 5 m steeper than {STEEP:.0%}, the steepest {worst[i]:.0%}"))
    return int(steep.sum()), places


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("city", nargs="?", default="shibuya")
    ap.add_argument("--list", type=int, default=6, help="how many places to print of each kind that fails")
    ap.add_argument("--json", help="write every place found to this file (for stills)")
    a = ap.parse_args()
    d = os.path.join(ROOT, "web", "data", a.city)
    game = json.load(open(os.path.join(d, "game.json"), encoding="utf8"))
    scene = json.load(open(os.path.join(d, "scene.json"), encoding="utf8"))
    L = json.load(open(os.path.join(d, "landmarks.json"), encoding="utf8"))
    G = levels.Levels(a.city, game)
    bp = os.path.join(ROOT, "tools", "budgets", "levels.json")
    budget = (json.load(open(bp, encoding="utf8")) if os.path.exists(bp) else {}).get(a.city, {})
    bad, found = 0, {}

    def say(name, n, fails, what, allow=0):
        nonlocal bad
        fails = sorted(fails, key=lambda t: -t[0])
        found[name] = [t[1] for t in fails]
        if len(fails) > allow:
            bad += 1
            print(f"FAIL {name}: {len(fails)} of {n} {what}" + (f" (the budget is {allow})" if allow else ""))
            for _, line in fails[:a.list]:
                print(f"  {line}")
        else:
            print(f"ok {name}: {n} {what}" + (f", {len(fails)} within the budget of {allow}" if fails else ""))

    R = levels.record(a.city)
    say("runs", *check_runs(R, G), "bays built by the rule stand level on the ground as it is")
    say("feet", *check_feet(R, G), "footings on the ground as it is")
    say("tops", *check_tops(L, tuple(budget.get("tops_skip", []))), "top edges of the landmarks' upright faces without a tooth", budget.get("teeth", 0))
    say("bases", *check_bases(a.city, G, game, scene, L), "buildings with their base on the lowest ground along their walls", budget.get("bases", 0))
    n, places = steep_cells(a.city, G, game, scene)
    found["slopes"] = [t[1] for t in places]
    lim = budget.get("steep_cells")
    if lim is not None and n > lim:
        bad += 1
        print(f"FAIL slopes: {n} paved cells steeper than {STEEP:.0%} (the budget is {lim})")
        for _, line in places[:a.list]:
            print(f"  {line}")
    else:
        print(f"ok slopes: {n} paved cells steeper than {STEEP:.0%}" + (f" (the budget is {lim})" if lim is not None else " (no budget set)"))
    if a.json:
        json.dump(found, open(a.json, "w", encoding="utf8"), indent=1, ensure_ascii=False)
    raise SystemExit(bad > 0)


if __name__ == "__main__":
    main()
