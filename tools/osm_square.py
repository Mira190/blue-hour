"""OpenStreetMap's small things round a point, in the map's metres, from an API map call's JSON (planting, beds,
railings, trees, subway entrances): what the hero level's hand-placed things are checked against (issue 213).

    python tools/osm_square.py shibuya <map.json> x0 y0 x1 y1 [--draw photo.jpg out.jpg]

The map call: https://api.openstreetmap.org/api/0.6/map.json?bbox=<lon0,lat0,lon1,lat1> (ODbL). With --draw, over a
picture of the same box from tools/ortho_overlay.py --plain: planting green, barriers cyan, entrances magenta, trees
as rings, a grid every 10 m.
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "pipeline"))
from cityctx import City  # noqa: E402

KEEP = {"landuse", "leisure", "natural", "barrier", "railway", "highway", "amenity", "man_made", "tourism", "historic", "entrance"}
GREEN = {"grass", "flowerbed", "garden", "planter", "scrub", "tree_row"}


def load(city, path):
    C = City(city)
    d = json.load(open(path))
    nodes = {e["id"]: e for e in d["elements"] if e["type"] == "node"}
    out = []
    for e in d["elements"]:
        t = e.get("tags") or {}
        if not (KEEP & set(t)):
            continue
        if e["type"] == "node":
            out.append(("node", e["id"], t, [C.fwd.transform(e["lon"], e["lat"])]))
        elif e["type"] == "way":
            out.append(("way", e["id"], t, [C.fwd.transform(nodes[n]["lon"], nodes[n]["lat"]) for n in e["nodes"] if n in nodes]))
    return out


def kind(t):
    if t.get("landuse") in GREEN or t.get("leisure") in GREEN or t.get("natural") in GREEN:
        return "green"
    if "barrier" in t:
        return "barrier"
    if t.get("railway") == "subway_entrance" or t.get("highway") == "elevator":
        return "entrance"
    if t.get("natural") == "tree":
        return "tree"
    return None


if __name__ == "__main__":
    city, path = sys.argv[1], sys.argv[2]
    x0, y0, x1, y1 = (float(v) for v in sys.argv[3:7])
    feats = [f for f in load(city, path) if kind(f[2]) and any(x0 <= x <= x1 and y0 <= y <= y1 for x, y in f[3])]
    for typ, i, t, pts in feats:
        from shapely.geometry import Polygon
        area = Polygon(pts).area if typ == "way" and len(pts) > 3 and pts[0] == pts[-1] else 0
        cx, cy = sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)
        tags = {k: v for k, v in t.items() if k in KEEP | {"ref", "name", "barrier", "height", "wheelchair", "level"}}
        print(f"{typ[0]}{i} {kind(t):8s} at {cx:.1f},{cy:.1f} {area:.0f} m2 {tags}")
    if "--draw" in sys.argv:
        from PIL import Image, ImageDraw
        i = sys.argv.index("--draw")
        im = Image.open(sys.argv[i + 1]).convert("RGB")
        s = im.width / (x1 - x0)
        D = ImageDraw.Draw(im)

        def P(x, y):
            return ((x - x0) * s, (y1 - y) * s)
        col = {"green": (60, 230, 90), "barrier": (0, 220, 255), "entrance": (255, 60, 220), "tree": (120, 255, 120)}
        for typ, _, t, pts in feats:
            k = kind(t)
            if len(pts) == 1:
                x, y = pts[0]
                r = 0.6
                D.ellipse([P(x - r, y + r), P(x + r, y - r)], outline=col[k], width=2)
            else:
                D.line([P(*q) for q in pts], fill=col[k], width=2)
        for v in range(int(x0 // 10 * 10 + 10), int(x1), 10):
            D.line([P(v, y0), P(v, y1)], fill=(0, 120, 180))
            D.text((P(v, y1)[0] + 2, 2), str(v), fill=(255, 255, 0))
        for v in range(int(y0 // 10 * 10 + 10), int(y1), 10):
            D.line([P(x0, v), P(x1, v)], fill=(0, 120, 180))
            D.text((2, P(x0, v)[1] + 2), str(v), fill=(255, 255, 0))
        im.save(sys.argv[i + 2], quality=88)
