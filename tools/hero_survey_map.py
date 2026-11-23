"""A hero level's ground plan against the surveyed road surface (docs/HERO.md, docs/ROADS.md; issue 196).

    python tools/hero_survey_map.py shibuya out.jpg [cx cy r]      # default: the Scramble's level
    python tools/hero_survey_map.py shibuya --figures [cx cy r]    # the figures alone

The survey's carriageways (dark), junctions (lighter), footways (sand) and islands (green); over them the level's
carriageway as its plan has it (cyan outline), its crosswalks (white), and OpenStreetMap's crossings (yellow: the
walkers' lines). The figures: how much of what the level draws as carriageway the survey has as carriageway, and
the reverse; the mean and the greatest distance between the two kerb lines.
"""
import importlib.util
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for d in ("pipeline", "blender"):
    sys.path.insert(0, os.path.join(ROOT, d))
import numpy as np
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

import road_survey


def scramble(city):
    spec = importlib.util.spec_from_file_location("scramble", os.path.join(ROOT, "cities", city, "scramble.py"))
    S = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(S)
    return S


def figures(plan_roads, geo, disc, asphalt=None, solids=None):
    """The plan's carriageway against the survey's, inside the disc and the survey's cover. `asphalt`: the survey's
    carriageways that are streets (pipeline/road_ground.py: not a pedestrian street's), else all of them; `solids`:
    what stands on the ground, which neither lays a road under."""
    sv = (asphalt if asphalt is not None else unary_union([geo["carriage"], geo["cross"]])).intersection(disc)
    if solids is not None:
        sv = sv.difference(solids)
    cover = unary_union([geo["carriage"], geo["cross"], geo["walk"], geo["island"]]).intersection(disc)
    pr = plan_roads.intersection(disc)
    both = pr.intersection(sv).area
    out = {"plan_m2": round(pr.area), "survey_m2": round(sv.area), "both_m2": round(both),
           "plan_on_survey_walk_m2": round(pr.intersection(geo["walk"]).area), "plan_on_survey_island_m2": round(pr.intersection(geo["island"]).area),
           "survey_road_not_plan_m2": round(sv.difference(pr).area), "plan_road_not_survey_m2": round(pr.intersection(cover).difference(sv).area),
           "iou": round(both / max(pr.union(sv).area, 1e-9), 3)}
    # the kerb lines: the survey's, sampled every metre, and how far the plan's is from each point
    edge = sv.boundary.intersection(disc.buffer(-3))
    pb = pr.boundary
    ds = []
    for ln in getattr(edge, "geoms", [edge]):
        if ln.geom_type != "LineString" or ln.length < 1:
            continue
        for s in np.arange(0.5, ln.length, 1.0):
            p = ln.interpolate(s)
            if geo["walk"].distance(p) > 0.3 and geo["island"].distance(p) > 0.3:
                continue          # (the survey's edge where it meets no footway or island is a cut, not a kerb)
            ds.append(pb.distance(p))
    ds = np.asarray(ds) if ds else np.zeros(1)
    out.update(kerb_m=len(ds), kerb_mean=round(float(ds.mean()), 2), kerb_p90=round(float(np.percentile(ds, 90)), 2), kerb_max=round(float(ds.max()), 2),
               kerb_within_1_75=round(float((ds <= 1.75).mean()), 3))
    return out


def main():
    a = [v for v in sys.argv[1:] if not v.startswith("--")]
    city = a[0]
    only = "--figures" in sys.argv
    S = scramble(city)
    nums = [float(v) for v in a[(1 if only else 2):]]
    cx, cy, r = nums if len(nums) == 3 else (*S.HERO_CENTRE, S.HERO_R)
    geo = road_survey.load(os.path.join(ROOT, "cities", city, "road_surface.json"))
    D = S.Data(city)
    plan = S.Plan(D, centre=(cx, cy), r=r)
    disc = Point(cx, cy).buffer(r, 64)
    surface = getattr(D, "surface", None)
    f = figures(plan.roads, geo, disc, surface.asphalt if surface else None, plan.solids)
    print(json.dumps(f))
    if only:
        return
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.patches import PathPatch
    from matplotlib.path import Path
    fig, ax = plt.subplots(figsize=(14, 14), dpi=110)

    def draw(geom, fc, z, ec="none", lw=0, alpha=1):
        for p in getattr(geom, "geoms", [geom]):
            if p.is_empty or p.geom_type != "Polygon":
                continue
            v, c = [], []
            for ring in [p.exterior] + list(p.interiors):
                xy = np.asarray(ring.coords)
                v += list(xy)
                c += [Path.MOVETO] + [Path.LINETO] * (len(xy) - 2) + [Path.CLOSEPOLY]
            ax.add_patch(PathPatch(Path(v, c), fc=fc, ec=ec, lw=lw, zorder=z, alpha=alpha))
    draw(geo["walk"], "#c9b79a", 1)
    draw(geo["carriage"], "#4a4f57", 2)
    draw(geo["cross"], "#5f6672", 2)
    draw(geo["island"], "#7fae7a", 3)
    draw(plan.solids, "#2b2e35", 4, alpha=0.85)
    draw(plan.roads, "none", 6, ec="#39d0ff", lw=1.3)
    for cw in (S.crosswalk_list(D) + plan.zebras) if hasattr(S, "crosswalk_list") else S.CROSSWALKS:
        q = np.asarray(S.crosswalk_poly(cw))
        ax.plot(*np.vstack([q, q[:1]]).T, color="#fff", lw=1.2, zorder=8)
    for w in D.ways:
        t = w.get("tags", {})
        if t.get("highway") == "footway" and t.get("crossing"):
            xy = np.asarray(w["xy"])
            ax.plot(xy[:, 0], xy[:, 1], color="#ffd400", lw=1.0, zorder=7)
    ax.add_patch(plt.Circle((cx, cy), r, fc="none", ec="#888", ls="--", lw=0.8, zorder=9))
    ax.set_xlim(cx - r - 5, cx + r + 5)
    ax.set_ylim(cy - r - 5, cy + r + 5)
    ax.set_aspect("equal")
    ax.set_facecolor("#1b1d21")
    fig.patch.set_facecolor("#0c0d10")
    ax.tick_params(colors="#888")
    ax.set_title(f"{city}: the level's carriageway (cyan) on the survey; kerbs {f['kerb_mean']} m apart on average, {int(f['kerb_within_1_75'] * 100)} % within 1.75 m; "
                 f"overlap {f['iou']}", color="#ddd", loc="left", fontsize=10)
    plt.tight_layout()
    plt.savefig(a[1], dpi=110, pil_kwargs={"quality": 84})


if __name__ == "__main__":
    main()
