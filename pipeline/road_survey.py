"""The surveyed road surface: the carriageways, junctions, footways and islands of Project PLATEAU's road model.

Until issue 196 a road was as wide as its class said (a primary road 12 m, a residential street 7 m, in five tables),
which is true of no street. Tokyo's wards publish the road itself: PLATEAU's `tran` model at LOD2 cuts every public
road into its carriageway (車道部), its junctions (車道交差部), its footways (歩道部) and its islands (島), from the
1:2,500 public survey (数値地形図, 公共測量成果). The city's `road_survey` block names the vector tiles (the
catalogue at api.plateauview.mlit.go.jp/datacatalog/plateau-datasets, type `tran`, `lod` 2; CC BY 4.0).

This reads the tiles over the block's area and writes cities/<id>/road_surface.json, in the city's local frame:

  {"source": ..., "area": [x0, y0, x1, y1],
   "carriage": [[ring, hole, ...], ...],   polygons, each ring a flat list of decimetres [x, y, x, y, ...]
   "cross": [...], "walk": [...], "island": [...]}

Parts of one kind that touch are merged (the tiles cut a road every few metres) and simplified to 0.12 m, so that
what is kept is the kerb lines. pipeline/road_width.py measures every road piece against it.

    python pipeline/road_survey.py --city shibuya            # fetch (cached in data/raw/<id>/tran/) and write
"""
import json
import math
import os

import numpy as np
import shapely
from shapely.geometry import Polygon, box
from shapely.ops import unary_union

from cityctx import city_args, polygons

KIND = {"車道部": "carriage", "車道交差部": "cross", "歩道部": "walk", "島": "island"}
SIMPLIFY_M = 0.12


def lonlat(z, tx, ty, px, py, extent):
    """Tile pixels (y up, as mapbox_vector_tile decodes them) to longitude and latitude."""
    n = 2.0 ** z
    x = (tx + px / extent) / n
    y = (ty + 1 - py / extent) / n
    return x * 360 - 180, np.degrees(np.arctan(np.sinh(math.pi * (1 - 2 * y))))


def rings_of(geom):
    t, c = geom["type"], geom["coordinates"]
    return [c] if t == "Polygon" else c if t == "MultiPolygon" else []


def read(C, cfg):
    # only the fetch needs these (and requests behind fetch_tiles): what the checks import of this file is load()
    import mapbox_vector_tile
    from fetch_tiles import get, tile_xy
    z = cfg.get("zoom", 16)
    x0, x1, y0, y1 = cfg.get("area") or (C.x0, C.x1, C.y0, C.y1)
    lon, lat = C.inv.transform([x0, x1, x0, x1], [y0, y0, y1, y1])
    a, b = tile_xy(min(lon), max(lat), z), tile_xy(max(lon), min(lat), z)
    raw = os.path.join(C.raw, "tran")
    os.makedirs(raw, exist_ok=True)
    area = box(x0, y0, x1, y1)
    parts = {k: [] for k in KIND.values()}
    n = 0
    for tx in range(int(a[0]), int(b[0]) + 1):
        for ty in range(int(a[1]), int(b[1]) + 1):
            path = os.path.join(raw, f"{z}_{tx}_{ty}.mvt")
            if not get(cfg["tiles"].format(z=z, x=tx, y=ty), path):
                continue
            n += 1
            tile = mapbox_vector_tile.decode(open(path, "rb").read())
            for layer in tile.values():
                ext = layer.get("extent", 4096)
                for f in layer["features"]:
                    kind = KIND.get(f["properties"].get("tran_function"))
                    if not kind:
                        continue
                    for poly in rings_of(f["geometry"]):
                        loc = []
                        for ring in poly:
                            r = np.asarray(ring, float)
                            lo, la = lonlat(z, tx, ty, r[:, 0], r[:, 1], ext)
                            loc.append(np.column_stack(C.fwd.transform(lo, la)))
                        if len(loc[0]) < 4:
                            continue
                        p = shapely.make_valid(Polygon(loc[0], [h for h in loc[1:] if len(h) >= 4]))
                        if p.intersects(area):
                            parts[kind].append(p)
    print(f"road survey: {n} tiles at zoom {z}; " + ", ".join(f"{len(v)} {k}" for k, v in parts.items()))
    out = {}
    for kind, ps in parts.items():
        # (the tiles cut a road every few metres and again at their own edges: grown by a centimetre the cuts close)
        u = unary_union([p.buffer(0.01) for p in ps]).intersection(area) if ps else Polygon()
        out[kind] = [p for p in polygons(u.simplify(SIMPLIFY_M)) if p.area > 0.5]
    return out, [x0, y0, x1, y1]


def pack(p):
    flat = lambda r: [int(round(v * 10)) for xy in np.asarray(r.coords)[:-1] for v in xy]
    return [flat(p.exterior)] + [flat(h) for h in p.interiors if Polygon(h).area > 0.3]


def load(path):
    """{kind: one geometry (the union of its polygons), ...} from road_surface.json, in metres."""
    d = json.load(open(path, encoding="utf8"))
    ring = lambda f: np.asarray(f, float).reshape(-1, 2) / 10
    geo = {}
    for kind in KIND.values():
        ps = [Polygon(ring(p[0]), [ring(h) for h in p[1:]]) for p in d.get(kind, [])]
        geo[kind] = unary_union([shapely.make_valid(p) for p in ps]) if ps else Polygon()
    geo["area"] = box(*d["area"])
    return geo


def main():
    C, _ = city_args(__doc__.splitlines()[0])
    cfg = C.cfg.get("road_survey")
    if not cfg:
        raise SystemExit(f"{C.id}: no road_survey block in city.json")
    geo, area = read(C, cfg)
    out = {"source": cfg["source"], "area": area}
    for kind, ps in geo.items():
        out[kind] = [pack(p) for p in ps]
        print(f"  {kind}: {len(ps)} polygons, {sum(p.area for p in ps) / 1e4:.1f} ha")
    path = C.file("road_surface.json")
    json.dump(out, open(path, "w", encoding="utf8"), separators=(",", ":"), ensure_ascii=False)
    print(f"wrote {path} ({os.path.getsize(path) / 1e3:.0f} kB)")


if __name__ == "__main__":
    main()
