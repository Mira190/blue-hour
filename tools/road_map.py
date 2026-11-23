"""A city's road plan drawn over its aerial photograph: what is drivable, one-way, quiet, closed, a bus street, and
what every end of the network is (pipeline/road_plan.py, docs/ROADS.md).

    python tools/road_map.py shibuya out_dir            # whole.jpg (the map) and centre.jpg (round the start)
    python tools/road_map.py shibuya out_dir x0 x1 y0 y1 name   # one more window, in local metres

Needs matplotlib and Pillow. Reads web/data/<city>/game.json, scene.json and the ground tiles, and
cities/<city>/road_plan.json.
"""
import json
import os
import sys

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.collections import LineCollection
from matplotlib.lines import Line2D
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
W = {"motorway": 3.2, "trunk": 3.0, "primary": 2.8, "secondary": 2.3, "tertiary": 1.9, "residential": 1.1, "unclassified": 1.1}
OPEN, QUIET, SHUT, BUS = "#f4f1e8", "#6fa8dc", "#ff4d4d", "#19d3c5"
GATE, DEAD, CLOSURE = "#57e389", "#c0bfbc", "#ff4d4d"


def draw(city, out, win, name, title, scale=1.0, labels=False):
    data = os.path.join(ROOT, "web", "data", city)
    game = json.load(open(os.path.join(data, "game.json"), encoding="utf8"))
    scene = json.load(open(os.path.join(data, "scene.json"), encoding="utf8"))
    plan = json.load(open(os.path.join(ROOT, "cities", city, "road_plan.json"), encoding="utf8"))
    x0, x1, y0, y1 = win
    wide = 15.0
    fig, ax = plt.subplots(figsize=(wide, wide * (y1 - y0) / (x1 - x0)), dpi=150)
    ax.set_facecolor("#0d0f12")
    for t in scene["ground"]:
        if t["x1"] < x0 or t["x0"] > x1 or t["y1"] < y0 or t["y0"] > y1:
            continue
        im = np.asarray(Image.open(os.path.join(data, t["file"])).convert("L"), np.float32) / 255
        ax.imshow(np.dstack([im * 0.42, im * 0.45, im * 0.5]), extent=[t["x0"], t["x1"], t["y0"], t["y1"]], interpolation="bilinear", zorder=0)
    roads = game["paths"]["road"]
    layers = {"bus": [], "open": [], "quiet": [], "shut": []}
    widths = {k: [] for k in layers}
    arrows = []
    for o in roads:
        p = np.asarray(o["p"], np.float64).reshape(-1, 3)[:, :2] / 10
        if p[:, 0].max() < x0 or p[:, 0].min() > x1 or p[:, 1].max() < y0 or p[:, 1].min() > y1:
            continue
        k = "shut" if o.get("x") else "quiet" if o.get("q") else "open"
        w = W.get(o.get("c"), 1.1) * scale
        layers[k].append(p)
        widths[k].append(w)
        if o.get("b"):
            layers["bus"].append(p)
            widths["bus"].append(w + 3.2 * scale)
        if o.get("o") and not o.get("x"):
            seg = np.hypot(*np.diff(p, axis=0).T)
            if seg.sum() > (30 if scale > 1 else 120):
                s = np.concatenate([[0], np.cumsum(seg)])
                m = s[-1] / 2
                i = min(len(seg) - 1, int(np.searchsorted(s, m)) - 1)
                d = (p[i + 1] - p[i]) / (seg[i] or 1) * o["o"]
                c = p[i] + (p[i + 1] - p[i]) * ((m - s[i]) / (seg[i] or 1))
                arrows.append((c, d))
    ax.add_collection(LineCollection(layers["bus"], colors=BUS, linewidths=widths["bus"], alpha=0.5, zorder=2, capstyle="round"))
    ax.add_collection(LineCollection(layers["open"], colors=OPEN, linewidths=widths["open"], zorder=3, capstyle="round"))
    ax.add_collection(LineCollection(layers["quiet"], colors=QUIET, linewidths=widths["quiet"], zorder=3, capstyle="round"))
    ax.add_collection(LineCollection(layers["shut"], colors=SHUT, linewidths=[w + 0.6 for w in widths["shut"]], linestyles=(0, (2, 1.5)), zorder=4))
    a = 9 * (1.0 if scale > 1 else 4.0)
    for c, d in arrows:
        ax.annotate("", xy=c + d * a, xytext=c - d * a, arrowprops=dict(arrowstyle="-|>", color="#ffb000", lw=0.9 * scale, mutation_scale=7 * scale), zorder=5)
    ms = 5.5 * scale
    for e in plan["ends"]:
        x, y = e["at"]
        if not (x0 < x < x1 and y0 < y < y1):
            continue
        if e["kind"] == "gate":
            ax.plot([x], [y], "^", color=GATE, ms=ms, mec="#0d0f12", mew=0.5, zorder=6)
        elif e["kind"] == "dead end":
            ax.plot([x], [y], "o", color=DEAD, ms=ms * 0.75, mec="#0d0f12", mew=0.5, zorder=6)
        else:
            ax.plot([x], [y], "X", color=CLOSURE, ms=ms * 1.3, mec="#ffffff", mew=0.6, zorder=7)
    if labels:
        for x, y, text in labels:
            if x0 < x < x1 and y0 < y < y1:
                ax.annotate(text, xy=(x, y), xytext=(8, 8), textcoords="offset points", color="#ffffff", fontsize=9, zorder=9,
                            bbox=dict(boxstyle="round,pad=0.25", fc="#0d0f12", ec="#ffb000", lw=0.6, alpha=0.85), arrowprops=dict(arrowstyle="-", color="#ffb000", lw=0.6))
                ax.plot([x], [y], "*", color="#ffb000", ms=10, mec="#0d0f12", mew=0.5, zorder=8)
    r = plan["report"]
    leg = [Line2D([], [], color=OPEN, lw=2.5, label="Open to traffic (a way from gate to gate)"),
           Line2D([], [], color=BUS, lw=6, alpha=0.5, label="A bus street (OSM route=bus, Toei GTFS)"),
           Line2D([], [], color=QUIET, lw=2, label="Quiet: a cul-de-sac or a stub; no traffic made, none turns in"),
           Line2D([], [], color=SHUT, lw=2, ls=(0, (2, 1.5)), label="Closed to cars: the model stands across it, or no car fits"),
           Line2D([], [], color="#ffb000", lw=0, marker=">", ms=7, label="One-way"),
           Line2D([], [], color=GATE, lw=0, marker="^", ms=8, label=f"Gate: the street leaves the map ({r['ends'].get('gate', 0)})"),
           Line2D([], [], color=DEAD, lw=0, marker="o", ms=6, label=f"Dead end, as in the city ({r['ends'].get('dead end', 0)})"),
           Line2D([], [], color=CLOSURE, lw=0, marker="X", ms=9, label=f"Closure: the level closes the street ({r['ends'].get('closure', 0)})")]
    lg = ax.legend(handles=leg, loc="lower left", fontsize=9, facecolor="#0d0f12", edgecolor="#3a3f47", labelcolor="#e8e6e0", framealpha=0.9)
    lg.set_zorder(20)
    ax.set_title(title, color="#e8e6e0", fontsize=13, loc="left", pad=8)
    ax.set_xlim(x0, x1)
    ax.set_ylim(y0, y1)
    ax.set_aspect("equal")
    ax.tick_params(colors="#8a8f98", labelsize=7)
    for s in ax.spines.values():
        s.set_color("#3a3f47")
    fig.patch.set_facecolor("#0d0f12")
    os.makedirs(out, exist_ok=True)
    path = os.path.join(out, name + ".png")
    fig.savefig(path, bbox_inches="tight", facecolor=fig.get_facecolor())
    plt.close(fig)
    Image.open(path).convert("RGB").save(os.path.join(out, name + ".jpg"), quality=86)
    os.remove(path)
    print(os.path.join(out, name + ".jpg"))


def main():
    city, out = sys.argv[1], sys.argv[2]
    data = os.path.join(ROOT, "web", "data", city)
    game = json.load(open(os.path.join(data, "game.json"), encoding="utf8"))
    scene = json.load(open(os.path.join(data, "scene.json"), encoding="utf8"))
    cfg = json.load(open(os.path.join(ROOT, "cities", city, "city.json"), encoding="utf8"))
    labels = [(d[0], d[1], d[2]) for d in ((cfg.get("game") or {}).get("road_plan") or {}).get("drives", [])]
    if len(sys.argv) >= 8:
        draw(city, out, [float(v) for v in sys.argv[3:7]], sys.argv[7], f"{city}: the road plan", 2.2, labels)
        return
    f = scene["frame"]
    draw(city, out, [f["x"][0], f["x"][1], f["y"][0], f["y"][1]], "whole", f"{city}: the road plan, the whole map (local metres; x east, y north)", 1.0)
    sx, sy = game["start"]["at"]
    draw(city, out, [sx - 420, sx + 420, sy - 520, sy + 520], "centre", f"{city}: the road plan round the start", 2.2, labels)


if __name__ == "__main__":
    main()
