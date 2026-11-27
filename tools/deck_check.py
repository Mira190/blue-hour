"""Every built solid standing on a road the survey has as a driven carriageway (issue 196, the owner's report of
24 November 2026: on the walk south of Hachiko, the paving ended against a wide stretch of asphalt that ran up to the
face of a low building, with no road in or out of it).

The building there is Shibuya's west exit deck (しぶにしデッキ, OpenStreetMap w1333409445: man_made=bridge, layer 1),
which PLATEAU gives a height and the map's data a footprint and no underside: the game built it as a two-storey building
of shops from the ground up, across the bus terminal's surveyed carriageway, with a road piece running through it. A
road the survey has, with a piece of the map driven along it, is where nothing stands on the ground: a solid there is
a deck, a bridge or a canopy over it.

A street the survey does not have (one opened after it: Shibuya Sakura Stage's SAKURAストリート, December 2023) is the
map's own road where the map's line runs right through a solid and out of its far side, over its class's width: the
owner's report of 28 November 2026, at the street's end past the Sakura Stage tower, a low building closing it. That was
the covered bridge between Sakura Stage's two sides (OpenStreetMap w1412628591: building, height 8.1, layer 1), built
from the ground as a house with a hipped roof, and the game then cut the street at its wall (road_measured.json): a
street the game cut only there is still its road.

    python tools/deck_check.py shibuya            # list them; FAIL where one is left in the planned area
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "pipeline"))
import numpy as np
import shapely
from shapely.geometry import Polygon

import road_ground

ROADW = road_ground.ROADW
SPAN_OUT_M = 3.0               # a line crosses a solid when this much of it lies outside on both sides

ON_M2, ON_SHARE = 30.0, 0.4    # a solid this much on driven carriageway, and this share of it
MARGIN_M = 150.0               # round the planned area


def standing(city, game=None, B=None):
    """[(solid index, building index, solid's polygon, m² on the carriageway, the pieces under it)] for every solid
    standing on the ground over a driven surveyed carriageway."""
    game = game or json.load(open(os.path.join(ROOT, "web", "data", city, "game.json"), encoding="utf8"))
    B = B or json.load(open(os.path.join(ROOT, "web", "data", city, "buildings.json"), encoding="utf8"))
    S = road_ground.of_game(city, game)
    shapely.prepare(S.asphalt)
    tree = shapely.STRtree(S.lines)
    f = B["s_fields"]
    k_b, k_min, k_ring = f.index("building"), f.index("min_dm"), f.index("ring_dm")
    roads = game["paths"]["road"]
    index = {id(o): i for i, o in enumerate(roads)}
    spans = span_lines(city, S)
    stree = shapely.STRtree([ln for ln, _ in spans]) if spans else None
    out = []
    for si, s in enumerate(B["s"]):
        if s[k_min] > 0 or len(s[k_ring]) < 6:
            continue
        P = Polygon(np.asarray(s[k_ring], float).reshape(-1, 2) / 10).buffer(0)
        if P.area < ON_M2:
            continue
        on = P.intersection(S.asphalt).area if P.intersects(S.asphalt) else 0.0
        if on < ON_M2 or on < ON_SHARE * P.area:
            on = max(on, spanned(P, spans, stree, S.cover))
        if on < ON_M2 or on < ON_SHARE * P.area:
            continue
        # (the asphalt is the survey's carriageways that a piece of the map's roads runs through: driven, whether or not
        # the piece runs under this solid itself)
        under = [index[id(S.pieces[i])] for i in tree.query(P.buffer(8.0)) if not S.pieces[i].get("x") and S.lines[i].distance(P) < 8.0]
        out.append((si, s[k_b], P, on, under))
    return out


def span_lines(city, S):
    """[(line, half-width)]: the map's road pieces open to cars, and those closed only because the game cut them at a
    wall (road_measured.json "cut": the wall may be the very solid that stands over them)."""
    mp = os.path.join(ROOT, "cities", city, "road_measured.json")
    cut = {tuple(e) for e in (json.load(open(mp, encoding="utf8")).get("cut", []) if os.path.exists(mp) else [])}
    out = []
    for o, ln in zip(S.pieces, S.lines):
        if o.get("x") and (o["p"][0], o["p"][1], o["p"][-3], o["p"][-2]) not in cut:
            continue
        out.append((ln, (o.get("cw") or ROADW.get(o.get("c"), 7)) / 2))
    return out


def spanned(P, spans, tree, cover):
    """m² of a solid on the map's own carriageway where the survey has none: the band of each line that runs into the
    solid and out of its far side, at its width, outside what the survey covers."""
    if tree is None:
        return 0.0
    on = []
    for i in tree.query(P):
        ln, hw = spans[i]
        if not ln.intersects(P) or ln.intersection(P).length < 1.0:
            continue
        rest = ln.difference(P)
        if sum(1 for g in getattr(rest, "geoms", [rest]) if g.length >= SPAN_OUT_M) < 2:
            continue   # (a line that ends in it: a road into a building, the game's own measure of that)
        on.append(P.intersection(ln.buffer(hw, cap_style=2)))
    if not on:
        return 0.0
    g = shapely.union_all(on).difference(cover)
    return g.area


def main():
    city = sys.argv[1] if len(sys.argv) > 1 else "shibuya"
    game = json.load(open(os.path.join(ROOT, "web", "data", city, "game.json"), encoding="utf8"))
    B = json.load(open(os.path.join(ROOT, "web", "data", city, "buildings.json"), encoding="utf8"))
    b = game.get("bounds", {}).get("ground", {}).get("poly")
    area = Polygon(b).buffer(MARGIN_M) if b else None
    hits = standing(city, game, B)
    f = B["s_fields"]
    low = lambda h: B["s"][h[0]][f.index("top_dm")] < 62   # (lower than a vehicle passes under: a kiosk, a shelter; not a deck)
    near = [h for h in hits if (area is None or area.intersects(h[2])) and not low(h)]
    for si, bi, P, on, under in hits[:20]:
        m = B["b"][bi]
        c = P.centroid
        print(f"  solid {si} of {m[0] or m[6]} at {c.x:.0f}, {c.y:.0f}: {on:.0f} of {P.area:.0f} m2 on the carriageway, pieces {under} by it")
    if near:
        raise SystemExit(f"FAIL decks: {len(near)} solids stand on a driven surveyed carriageway in or near the planned area ({len(hits)} on the map)")
    print(f"decks: no solid stands on a driven carriageway in or near the planned area ({len(hits)} on the map past it)")


if __name__ == "__main__":
    main()
