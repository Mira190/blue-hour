"""Tokyo's 0.20 m orthophoto under the map's ground, to set the survey's kerbs and islands beside the photograph.

    python tools/ortho_overlay.py shibuya <sheets dir> x0 y0 x1 y1 out.jpg [--plain]

The sheets are the Tokyo Digital Twin Project's 23-ward orthophoto (FY2023 survey, published October 2024; CC BY 4.0,
「東京都デジタルツイン実現プロジェクト 区部点群データ」（東京都）を加工して作成): GeoTIFF sheets of 400 x 300 m at
0.20 m a pixel in JGD2011 plane zone IX (EPSG:6677), each with its .tfw world file. The sheet index is a vector tile
set (https://gic-tokyo.s3.ap-northeast-1.amazonaws.com/2024/dig/Vectortile/23ku/ortho/{z}/{x}/{y}.pbf, MESH_NO and URL
on each sheet); a sheet is https://gic-tokyo.s3.ap-northeast-1.amazonaws.com/2024/dig/ortho/{MESH}.zip. The west
exit is 09LD2659, 09LD2669, 09LD2750 and 09LD2760. They are not kept in the repository (6 MB a sheet).

The box x0 y0 x1 y1 is in the map's metres (cityctx: x east, y north). The photo is resampled into it at 0.2 m a
pixel; over it, unless --plain, the page's ground (game.json road_ground): carriageway edges in red, islands in green,
footway edges in amber, zebras in white, and a grid every 10 m with its numbers.
"""
import glob
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from pyproj import Transformer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "pipeline"))
from cityctx import City  # noqa: E402

Image.MAX_IMAGE_PIXELS = None
city, sheets = sys.argv[1], sys.argv[2]
x0, y0, x1, y1 = (float(v) for v in sys.argv[3:7])
out = sys.argv[7]
plain = "--plain" in sys.argv
PX = 0.2

C = City(city)
to_plane = Transformer.from_crs(C.proj, "EPSG:6677", always_xy=True)
W, H = int(round((x1 - x0) / PX)), int(round((y1 - y0) / PX))
gx, gy = np.meshgrid(x0 + (np.arange(W) + 0.5) * PX, y1 - (np.arange(H) + 0.5) * PX)
# EPSG:6677 is northing first by its axis order; always_xy hands back easting (Y in Japanese survey) then northing
E, N = to_plane.transform(gx.ravel(), gy.ravel())
E, N = np.asarray(E).reshape(H, W), np.asarray(N).reshape(H, W)
img = np.zeros((H, W, 3), np.uint8)
for tif in sorted(glob.glob(os.path.join(sheets, "*.tif"))):
    a, d, b, e, c, f = (float(v) for v in open(tif[:-4] + ".tfw").read().split())
    im = np.asarray(Image.open(tif).convert("RGB"))
    col = np.floor((E - c) / a).astype(int)
    row = np.floor((N - f) / e).astype(int)
    ok = (col >= 0) & (col < im.shape[1]) & (row >= 0) & (row < im.shape[0])
    img[ok] = im[row[ok], col[ok]]
pic = Image.fromarray(img)

if not plain:
    D = ImageDraw.Draw(pic)

    def px(x, y):
        return ((x - x0) / PX, (y1 - y) / PX)

    g = json.load(open(f"web/data/{city}/game.json"))
    S = g["road_ground"]
    for key, col, w in (("w", (255, 190, 60), 2), ("s", (255, 120, 200), 2), ("a", (255, 60, 50), 3), ("i", (80, 230, 90), 3)):
        for p in S[key]:
            for ring in p:
                xy = np.asarray(ring, float).reshape(-1, 2) / 10
                if xy[:, 0].max() < x0 or xy[:, 0].min() > x1 or xy[:, 1].max() < y0 or xy[:, 1].min() > y1:
                    continue
                D.line([px(*q) for q in np.vstack([xy, xy[:1]])], fill=col, width=w)
    for z in S["z"]:
        D.line([px(z[0] / 10, z[1] / 10), px(z[2] / 10, z[3] / 10)], fill=(255, 255, 255), width=2)
    for v in np.arange(np.ceil(x0 / 10) * 10, x1, 10):
        D.line([px(v, y0), px(v, y1)], fill=(0, 200, 255), width=1)
        D.text((px(v, y1)[0] + 2, 2), f"{v:.0f}", fill=(0, 220, 255))
    for v in np.arange(np.ceil(y0 / 10) * 10, y1, 10):
        D.line([px(x0, v), px(x1, v)], fill=(0, 200, 255), width=1)
        D.text((2, px(x0, v)[1] + 2), f"{v:.0f}", fill=(0, 220, 255))
pic.save(out, quality=88)
print(f"{out}: {W} x {H} px, {(img.sum(axis=2) > 0).mean() * 100:.0f} % of it from the sheets")
