"""The planned area's ground as the page paints it (game.json `road_ground`, pipeline/road_ground.py; issue 196).

    python tools/road_ground_map.py shibuya docs/images/roads/ground.jpg

The carriageways (dark), the shared streets (rose: a pedestrian street the survey has as a road), the footways (sand),
the islands (green) and the zebra crossings (white), with the road pieces' lines (thin) and the hero levels' circles;
the planned area's edge dashed, and the ring inside which the survey is the ground.
"""
import json
import sys

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import PathPatch
from matplotlib.path import Path

city, out = sys.argv[1], sys.argv[2]
g = json.load(open(f"web/data/{city}/game.json"))
S = g["road_ground"]
ar = np.asarray(S["area"], float).reshape(-1, 2) / 10
x0, y0, x1, y1 = ar[:, 0].min() - 10, ar[:, 1].min() - 10, ar[:, 0].max() + 10, ar[:, 1].max() + 10
fig, ax = plt.subplots(figsize=(16, 16 * (y1 - y0) / (x1 - x0)), dpi=120)


def draw(polys, fc, z):
    for p in polys:
        v, c = [], []
        for ring in p:
            xy = np.asarray(ring, float).reshape(-1, 2) / 10
            xy = np.vstack([xy, xy[:1]])
            v += list(xy)
            c += [Path.MOVETO] + [Path.LINETO] * (len(xy) - 2) + [Path.CLOSEPOLY]
        ax.add_patch(PathPatch(Path(v, c), fc=fc, ec="none", zorder=z))


draw(S["w"], "#c9b79a", 1)
draw(S["s"], "#c99aa6", 1)
draw(S["a"], "#50555d", 2)
draw(S["i"], "#7fae7a", 3)
for z in S["z"]:
    ax.plot([z[0] / 10, z[2] / 10], [z[1] / 10, z[3] / 10], color="#fff", lw=2.2, zorder=6, solid_capstyle="butt")
for r in g["paths"]["road"]:
    p = np.asarray(r["p"], float).reshape(-1, 3) / 10
    if p[:, 0].max() < x0 or p[:, 0].min() > x1 or p[:, 1].max() < y0 or p[:, 1].min() > y1:
        continue
    ax.plot(p[:, 0], p[:, 1], color="#ff5a4f" if r.get("x") else "#9fd8ff", lw=0.5, zorder=5)
for h in g.get("hero", []):
    if h.get("lift") and not h.get("z"):
        ax.add_patch(plt.Circle(h["at"], h["r"], fc="none", ec="#ffd400", lw=0.9, zorder=7))
b = np.asarray(g["bounds"]["ground"]["poly"])
ax.plot(*np.vstack([b, b[:1]]).T, color="#39d0ff", lw=1.2, ls="--", zorder=7)
ax.plot(*np.vstack([ar, ar[:1]]).T, color="#888", lw=0.8, ls=":", zorder=7)
ax.set_xlim(x0, x1)
ax.set_ylim(y0, y1)
ax.set_aspect("equal")
ax.set_facecolor("#1b1d21")
fig.patch.set_facecolor("#0c0d10")
ax.tick_params(colors="#888")
ax.set_title(f"{city}: the planned area's ground as surveyed (carriageway, shared street, footway, island, zebra)", color="#ddd", loc="left")
plt.tight_layout()
plt.savefig(out, dpi=120, pil_kwargs={"quality": 84})
