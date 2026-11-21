"""Check building heights against Tokyo's 2023 airborne LiDAR (CC BY 4.0; the Digital Twin project's point clouds,
https://www.geospatial.jp/ckan/dataset/tokyopc-23ku-2024): for the named solids of web/data/<city>/buildings.json, the
top of the points inside each footprint (the 99.5th percentile, so a lightning rod or a bird does not count) over the
solid's base (the map's DEM, T.P. as the LiDAR is), beside the solid's own top.

    python tools/lidar_heights.py --city shibuya data/raw/shibuya/tokyo_lidar/09LD2760.zip ...

Reads LAS 1.2-1.4 point records with numpy (x, y, z and the class), in zone IX (EPSG:6677) as the sheets are.
"""
import argparse
import json
import os
import struct
import sys
import zipfile

import numpy as np
import shapely
from shapely.geometry import Polygon
from pyproj import Transformer

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "pipeline"))
from cityctx import City  # noqa: E402


def read_las(raw):
    off = struct.unpack_from("<I", raw, 96)[0]
    fmt, rec = raw[104] & 0x3F, struct.unpack_from("<H", raw, 105)[0]
    n = struct.unpack_from("<I", raw, 107)[0] or struct.unpack_from("<Q", raw, 247)[0]
    sx, sy, sz, ox, oy, oz = struct.unpack_from("<6d", raw, 131)
    a = np.frombuffer(raw, np.uint8, count=n * rec, offset=off).reshape(n, rec)
    xyz = a[:, :12].copy().view("<i4").astype(np.float64)
    cls = a[:, 15] & 0x1F if fmt < 6 else a[:, 16]
    return xyz[:, 0] * sx + ox, xyz[:, 1] * sy + oy, xyz[:, 2] * sz + oz, cls


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--city", default="shibuya")
    ap.add_argument("--min", type=float, default=60.0, help="solids at least this tall (m)")
    ap.add_argument("sheets", nargs="+")
    a = ap.parse_args()
    C = City(a.city)
    B = json.load(open(os.path.join(C.out, "buildings.json")))
    L = json.load(open(os.path.join(C.out, "landmarks.json")))
    gone = set(L.get("demolished") or [])
    to = Transformer.from_crs(C.proj, "EPSG:6677", always_xy=True)
    for sh in a.sheets:
        z = zipfile.ZipFile(sh)
        x, y, zz, cls = read_las(z.read(z.namelist()[0]))
        gx, gy, gz = x[cls == 2], y[cls == 2], zz[cls == 2]
        x0, x1, y0, y1 = x.min(), x.max(), y.min(), y.max()
        print(f"{os.path.basename(sh)}: {len(x)} points, {len(gx)} ground")
        for si, s in enumerate(B["s"]):
            if si in gone or s[3] < a.min * 10:
                continue
            r = np.asarray(s[4], float).reshape(-1, 2) / 10
            X, Y = to.transform(r[:, 0], r[:, 1])
            X, Y = np.asarray(X), np.asarray(Y)
            if X.min() < x0 or X.max() > x1 or Y.min() < y0 or Y.max() > y1:
                continue
            box = (x > X.min()) & (x < X.max()) & (y > Y.min()) & (y < Y.max())
            ins = shapely.contains_xy(Polygon(np.c_[X, Y]).buffer(-0.5), x[box], y[box])
            if ins.sum() < 50:
                continue
            top = np.percentile(zz[box][ins], 99.5)
            # the ground the solid stands on, as the map has it (its base: the lowest of the DEM under it, metres T.P.,
            # the LiDAR's datum too), and the LiDAR's own ground points round it, beside
            ground = s[1] / 10
            gb = (gx > X.min() - 15) & (gx < X.max() + 15) & (gy > Y.min() - 15) & (gy < Y.max() + 15)
            lg = np.median(gz[gb]) if gb.sum() > 20 else float("nan")
            b = B["b"][s[0]]
            print(f"  solid {si} {b[0] or ''} ({b[4]}): map {s[3] / 10:.1f} m, LiDAR {top - ground:.1f} m over its base "
                  f"({ground:.1f} m T.P.; the LiDAR's ground round it {lg:.1f})")


if __name__ == "__main__":
    main()
