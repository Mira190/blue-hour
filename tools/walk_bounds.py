"""The walk's bounds on foot and by car (issue 143): where each footway and road of the map leaves the polygon in
cities/<city>/city.json game.walk.bounds.polygon, which is where the page closes a footway (web/game/edge.js) and
turns a walker in the road or the player's car back. Prints each crossing and, with an output path, draws them on the
streets, so that a closure that would stand in a square, on a stair or inside a building is seen before it is built.

    python3 tools/walk_bounds.py [city] [out.png]
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def crossings(poly, lines, dm=10.0):
    """Each place a polyline crosses the polygon's edge: (x, y, the line's direction outward, the line's index)."""
    out = []
    n = len(poly)
    for li, ln in enumerate(lines):
        p = ln["p"]
        for k in range(0, len(p) - 5, 3):
            ax, ay, bx, by = p[k] / dm, p[k + 1] / dm, p[k + 3] / dm, p[k + 4] / dm
            for e in range(n):
                cx, cy = poly[e]
                dx, dy = poly[(e + 1) % n]
                den = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx)
                if abs(den) < 1e-9:
                    continue
                t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / den
                u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / den
                if 0 <= t < 1 and 0 <= u < 1:
                    length = ((bx - ax) ** 2 + (by - ay) ** 2) ** 0.5 or 1
                    ux, uy = (bx - ax) / length, (by - ay) / length
                    # outward: the edge's normal away from the polygon (the polygon runs clockwise or not: by its area)
                    ex, ey = dx - cx, dy - cy
                    side = ux * ey - uy * ex
                    if side * area(poly) < 0:
                        ux, uy = -ux, -uy
                    out.append((ax + (bx - ax) * t, ay + (by - ay) * t, ux, uy, li, p[k + 2] / dm))
    return out


def area(poly):
    return sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1] for i in range(len(poly))) / 2


def main():
    city = sys.argv[1] if len(sys.argv) > 1 else "shibuya"
    cfg = json.load(open(os.path.join(ROOT, "cities", city, "city.json"), encoding="utf8"))
    game = json.load(open(os.path.join(ROOT, "web", "data", city, "game.json"), encoding="utf8"))
    poly = cfg["game"]["walk"]["bounds"]["polygon"]
    foot = crossings(poly, game["paths"]["foot"])
    road = crossings(poly, game["paths"]["road"])
    for name, rows, lines in (("foot", foot, game["paths"]["foot"]), ("road", road, game["paths"]["road"])):
        for x, y, ux, uy, li, z in rows:
            print(f"{name}\t{x:7.1f}\t{y:8.1f}\tz {z:5.1f}\tout {ux:+.2f},{uy:+.2f}\t{lines[li]['c']}")
    print(f"{len(foot)} footways and {len(road)} roads leave the bounds")
    if len(sys.argv) > 2:
        from PIL import Image, ImageDraw
        xs, ys = [p[0] for p in poly], [p[1] for p in poly]
        x0, x1, y0, y1, s = min(xs) - 40, max(xs) + 40, min(ys) - 40, max(ys) + 40, 3.0
        im = Image.new("RGB", (int((x1 - x0) * s), int((y1 - y0) * s)), "white")
        d = ImageDraw.Draw(im)
        P = lambda x, y: ((x - x0) * s, (y1 - y) * s)  # noqa: E731
        for ln in game["paths"]["road"]:
            d.line([P(ln["p"][k] / 10, ln["p"][k + 1] / 10) for k in range(0, len(ln["p"]), 3)], fill="#888", width=4)
        for ln in game["paths"]["foot"]:
            d.line([P(ln["p"][k] / 10, ln["p"][k + 1] / 10) for k in range(0, len(ln["p"]), 3)], fill="#c0c" if ln["c"] == "steps" else "#0a0", width=1)
        d.polygon([P(*p) for p in poly], outline="red")
        for i, (x, y) in enumerate(poly):
            d.text(P(x, y), str(i), fill="red")
        for rows, col in ((foot, "blue"), (road, "black")):
            for x, y, ux, uy, li, z in rows:
                a, b = P(x - uy * 3, y + ux * 3), P(x + uy * 3, y - ux * 3)
                d.line([a, b], fill=col, width=3)
                d.text(P(x + ux * 4, y + uy * 4), f"{z:.0f}", fill=col)
        im.save(sys.argv[2])


if __name__ == "__main__":
    main()
