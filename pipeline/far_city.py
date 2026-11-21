"""The towers past the map's frame: the far skyline (web/farcity.js; docs/NIGHT.md and docs/LOOK.md, "The far skyline").

The map's own buildings end at its frame (city.json extent_m); past it farland.js draws the land, its colour and its
night glow, flat. From SHIBUYA SKY and the flight the eye looks over that plain to Shinjuku's towers, Roppongi and
Toranomon, Shiodome, Shinagawa and the bay, and found nothing standing. This writes what stands there: every roof face of
Project PLATEAU's LOD2 models of the 23 wards (MLIT, CC BY 4.0; the vector-tile mirror the map's own heights come from,
city.json plateau.tiles, indigo-lab, MIT) within RADIUS_M of the frame's middle and outside the frame, at least as tall as
its distance asks (MIN_H at the frame, rising PER_KM a kilometre: a 60 m block 10 km off is a pixel in haze), simplified
to a few corners and stood on the far land's ground (far.png).

    python pipeline/far_city.py --city shibuya

web/data/<city>/farcity.bin, little-endian: uint32 count, then a record a roof face: uint8 corners n, uint8 seed,
uint16 height (dm), int16 ground (dm), n * (int16 x, int16 y) in half metres of the city's local frame (anticlockwise).
farcity.json beside it: the counts, the sources and the rule.
"""
import io
import json
import math
import os
import struct
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cityctx import city_args  # noqa: E402
from fetch_tiles import get, tile_xy  # noqa: E402

EXTENT = 4096
RADIUS_M = 14000        # Skytree is 11 km from the frame's middle; Ikebukuro's Sunshine 60 nine
MIN_H, PER_KM = 45.0, 5.5   # tall enough at d km from the frame's middle: MIN_H + PER_KM * max(0, d - 2)
MIN_AREA = 60.0         # a roof face smaller than this is a lift overrun or a plant box: left out
MAX_CORNERS = 12
# drawn as cards instead (blender/build_far_towers.py): PLATEAU models their lattices as a block. (lon, lat, radius m)
CARDS = {"tokyo_tower": (139.745433, 35.658581, 60.0), "skytree": (139.810700, 35.710063, 70.0)}
# The vector tiles are PLATEAU's 2020 models: the towers finished since are not in them, the tallest in Japan among them,
# Azabudai Hills' Mori JP Tower, between the Scramble and Tokyo Tower. OpenStreetMap maps them with their heights: round
# each of these places, every building or part at least NEW_H tall that no PLATEAU face as tall stands on is added
# (OpenStreetMap contributors, ODbL; the map call of api.openstreetmap.org, cached in data/raw/<city>/far_osm).
NEW_H = 150.0
NEW_AT = {"azabudai": (139.7404, 35.6606), "toranomon": (139.7486, 35.6672), "kamiyacho": (139.7448, 35.6634),
          "kabukicho": (139.7004, 35.6955), "yaesu": (139.7690, 35.6797), "tokiwabashi": (139.7700, 35.6870),
          "otemachi": (139.7637, 35.6873), "nihonbashi": (139.7740, 35.6860), "hamamatsucho": (139.7570, 35.6555),
          "takeshiba": (139.7615, 35.6545), "shiodome": (139.7610, 35.6640), "takanawa": (139.7405, 35.6355),
          "shinagawa": (139.7420, 35.6280), "toyosu": (139.7955, 35.6550), "ikebukuro": (139.7150, 35.7300),
          "nishi_shinjuku": (139.6930, 35.6900)}


def main():
    city, _ = city_args(__doc__.splitlines()[0])
    import mapbox_vector_tile
    from shapely.geometry import Polygon
    from shapely.ops import unary_union
    from PIL import Image
    cfg = city.cfg["plateau"]
    z = cfg["zoom"]
    x0f, x1f, y0f, y1f = city.cfg["extent_m"]
    mx, my = (x0f + x1f) / 2, (y0f + y1f) / 2
    lon_c, lat_c = city.inv.transform(mx, my)
    dlat = RADIUS_M / 111320.0
    dlon = RADIUS_M / (111320.0 * math.cos(math.radians(lat_c)))
    ax, ay = tile_xy(lon_c - dlon, lat_c + dlat, z)
    bx, by = tile_xy(lon_c + dlon, lat_c - dlat, z)
    d = os.path.join(city.raw, "plateau_mvt")
    os.makedirs(d, exist_ok=True)
    n2 = 2 ** z
    pieces = {}   # feature id -> [(height, polygon in local metres)]: a face cut by tile edges comes back whole
    tiles = 0
    for tx in range(int(ax), int(bx) + 1):
        for ty in range(int(ay), int(by) + 1):
            p = os.path.join(d, f"{z}_{tx}_{ty}.pbf")
            if not get(cfg["tiles"].format(z=z, x=tx, y=ty), p):
                continue
            tiles += 1
            layer = mapbox_vector_tile.decode(open(p, "rb").read()).get("bldg")
            if not layer:
                continue
            clip = Polygon([(0, 0), (EXTENT, 0), (EXTENT, EXTENT), (0, EXTENT)])   # (the tile's own square, not its buffer)
            for f in layer["features"]:
                h = f["properties"].get("z")
                if h is None or h < MIN_H or f["geometry"]["type"] not in ("Polygon", "MultiPolygon"):
                    continue
                polys = [f["geometry"]["coordinates"]] if f["geometry"]["type"] == "Polygon" else f["geometry"]["coordinates"]
                for poly in polys:
                    P = Polygon(poly[0]).buffer(0).intersection(clip)
                    if P.is_empty or P.area <= 0:
                        continue
                    for g in getattr(P, "geoms", [P]):
                        if g.geom_type != "Polygon":
                            continue
                        pts = []
                        for px, py in g.exterior.coords:
                            fx, fy = tx + px / EXTENT, ty + 1 - py / EXTENT   # (mapbox_vector_tile turns y to grow north)
                            lon = fx / n2 * 360 - 180
                            lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * fy / n2))))
                            pts.append(city.fwd.transform(lon, lat))
                        pieces.setdefault(f.get("id", id(f)), []).append((float(h), Polygon(pts).buffer(0)))
    # the towers finished since 2020 (NEW_AT), from OpenStreetMap
    from shapely.strtree import STRtree
    tall_faces = [(h, P) for ps in pieces.values() for h, P in ps if h >= NEW_H * 0.5]
    tree = STRtree([P for _, P in tall_faces])
    added = []
    od = os.path.join(city.raw, "far_osm")
    os.makedirs(od, exist_ok=True)
    for key, (lon, lat) in NEW_AT.items():
        for g, h, name in osm_towers(od, key, lon, lat, city):
            if any(tall_faces[i][0] >= 0.8 * h and tall_faces[i][1].intersects(g) for i in tree.query(g)):
                continue
            if name in {a[2] for a in added}:
                continue
            added.append((g, h, name))
            pieces[f"osm:{name}:{len(added)}"] = [(h, g)]
    print("far city: from OpenStreetMap,", ", ".join(f"{n} {h:.0f} m" for _, h, n in added) or "none")
    cards = [(city.fwd.transform(lon, lat), r) for lon, lat, r in CARDS.values()]
    # the far land's ground (far.json, far.png: (r * 256 + g) / 4 - 100 m, north up)
    far = json.load(open(os.path.join(city.out, "far.json")))
    img = np.asarray(Image.open(os.path.join(city.out, "far.png")).convert("RGB"), float)
    half, fcx, fcy, nh = far["half_m"], far["cx"], far["cy"], img.shape[0]

    def ground(x, y):
        u = (x - (fcx - half)) / (2 * half) * (nh - 1)
        v = ((fcy + half) - y) / (2 * half) * (nh - 1)
        i, j = int(np.clip(round(v), 0, nh - 1)), int(np.clip(round(u), 0, nh - 1))
        r, g, _ = img[i, j]
        return (r * 256 + g) / 4 - 100

    out, kept, tall = [], 0, 0
    for fid, ps in pieces.items():
        h = max(q[0] for q in ps)
        P = unary_union([q[1] for q in ps]).buffer(0)
        for g in getattr(P, "geoms", [P]):
            if g.geom_type != "Polygon" or g.area < MIN_AREA:
                continue
            c = g.centroid
            if x0f <= c.x <= x1f and y0f <= c.y <= y1f:
                continue   # the map's own
            if any(math.hypot(c.x - q[0], c.y - q[1]) < r for q, r in cards):
                continue   # a card's
            dk = math.hypot(c.x - mx, c.y - my) / 1000
            if dk * 1000 > RADIUS_M or h < MIN_H + PER_KM * max(0.0, dk - 2):
                continue
            s = g.simplify(1.0 + 0.25 * dk, preserve_topology=True)
            if len(s.exterior.coords) - 1 > MAX_CORNERS:
                r = g.minimum_rotated_rectangle
                s = r if g.area / max(r.area, 1) > 0.8 else g.convex_hull.simplify(2.0 + 0.4 * dk)
            ring = np.asarray(s.exterior.coords)[:-1]
            if len(ring) < 3:
                continue
            if not s.exterior.is_ccw:
                ring = ring[::-1]
            ring = ring[:MAX_CORNERS] if len(ring) > MAX_CORNERS else ring
            gz = ground(c.x, c.y) - 2.0
            seed = int(abs(hash((round(c.x), round(c.y)))) % 256)
            out.append((len(ring), seed, int(round(h * 10)), int(round(gz * 10)), [(int(round(x * 2)), int(round(y * 2))) for x, y in ring]))
            kept += 1
            tall += h >= 150
    # tallest first (a phone keeps a prefix: web/farcity.js)
    out.sort(key=lambda r: -r[2])
    buf = io.BytesIO()
    buf.write(struct.pack("<I", len(out)))
    for n, seed, hd, gd, ring in out:
        buf.write(struct.pack("<BBHh", n, seed, min(hd, 65535), max(-32768, min(32767, gd))))
        for x, y in ring:
            buf.write(struct.pack("<hh", max(-32768, min(32767, x)), max(-32768, min(32767, y))))
    open(os.path.join(city.out, "farcity.bin"), "wb").write(buf.getvalue())
    meta = {"count": len(out), "over_150m": tall, "tiles": tiles, "radius_m": RADIUS_M, "rule": f"height >= {MIN_H} + {PER_KM} m a km past 2 km from the frame's middle",
            "min_area_m2": MIN_AREA, "centre": [round(mx, 1), round(my, 1)], "frame": city.cfg["extent_m"], "order": "tallest first",
            "added": [{"name": n, "height": h} for _, h, n in added],
            "cards": {k: [round(q[0], 1), round(q[1], 1), round(ground(*q) - 1.0, 1)] for k, (q, _) in zip(CARDS, cards)},
            "sources": {"plateau": cfg.get("attribution", "MLIT Project PLATEAU, CC BY 4.0"),
                        "added": "OpenStreetMap contributors (ODbL), the towers finished since PLATEAU's 2020 models"}}
    json.dump(meta, open(os.path.join(city.out, "farcity.json"), "w"), indent=1)
    print(f"far city: {len(out)} roof faces ({tall} over 150 m) from {tiles} tiles, {len(buf.getvalue()) / 1e3:.0f} kB")


def osm_towers(od, key, lon, lat, city, d=0.003):
    """The buildings and building parts at least NEW_H tall that OpenStreetMap maps round (lon, lat): [(polygon in local
    metres, height, name)]."""
    import requests
    from shapely.geometry import Polygon
    p = os.path.join(od, f"{key}.json")
    if not os.path.exists(p):
        url = f"https://api.openstreetmap.org/api/0.6/map.json?bbox={lon - d:.6f},{lat - d:.6f},{lon + d:.6f},{lat + d:.6f}"
        r = requests.get(url, headers={"User-Agent": "blue-hour (https://github.com/Mira190/blue-hour)"}, timeout=120)
        r.raise_for_status()
        open(p, "w").write(r.text)
    els = json.load(open(p))["elements"]
    nodes = {e["id"]: (e["lon"], e["lat"]) for e in els if e["type"] == "node"}
    out = []
    for e in els:
        t = e.get("tags", {})
        if e["type"] != "way" or not ("building" in t or "building:part" in t):
            continue
        try:
            h = float(str(t.get("height", "")).split()[0].replace("m", ""))
        except (ValueError, IndexError):
            continue
        if h < NEW_H or len(e.get("nodes", [])) < 4:
            continue
        pts = [city.fwd.transform(*nodes[n]) for n in e["nodes"] if n in nodes]
        if len(pts) < 4:
            continue
        out.append((Polygon(pts).buffer(0), h, t.get("name:en") or t.get("name") or f"way {e['id']}"))
    return out


if __name__ == "__main__":
    main()
