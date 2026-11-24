"""Tokyo's 0.20 m orthophoto under the map's ground, to set the survey's kerbs and islands beside the photograph.

    python pipeline/fetch_tokyo_ortho.py --city shibuya     # once: the sheets, data/raw/<id>/tokyo_ortho/<sheet>.zip
    python tools/ortho_overlay.py shibuya x0 y0 x1 y1 out.jpg [--plain] [--sheets <dir>]

The sheets are the Tokyo Metropolitan Government Digital Twin project's 2023 ortho photographs (CC BY 4.0, credited on
the Credits screen, web/credits.json): GeoTIFF sheets of 400 x 300 m at 0.20 m a pixel in JGD2011 plane zone IX
(EPSG:6677), each zipped with its .tfw world file. The west exit is 09LD2659, 09LD2669, 09LD2750 and 09LD2760. They
are not kept in the repository.

The box x0 y0 x1 y1 is in the map's metres (cityctx: x east, y north). The photo is resampled into it at 0.2 m a
pixel; over it, unless --plain, the page's ground (game.json road_ground): carriageway edges in red, islands in green,
footway edges in amber, zebras in white, and a grid every 10 m with its numbers.
"""
import glob
import io
import json
import os
import sys
import zipfile

import numpy as np
from PIL import Image, ImageDraw
from pyproj import Transformer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "pipeline"))
from cityctx import City  # noqa: E402

Image.MAX_IMAGE_PIXELS = None
argv = sys.argv[1:]
plain = "--plain" in argv
argv = [v for v in argv if v != "--plain"]
sheets = None
if "--sheets" in argv:
    i = argv.index("--sheets")
    sheets = argv[i + 1]
    del argv[i:i + 2]
city = argv[0]
x0, y0, x1, y1 = (float(v) for v in argv[1:5])
out = argv[5]
PX = 0.2

C = City(city)
sheets = sheets or os.path.join(C.raw, "tokyo_ortho")
to_plane = Transformer.from_crs(C.proj, "EPSG:6677", always_xy=True)
W, H = int(round((x1 - x0) / PX)), int(round((y1 - y0) / PX))
gx, gy = np.meshgrid(x0 + (np.arange(W) + 0.5) * PX, y1 - (np.arange(H) + 0.5) * PX)
# EPSG:6677 is northing first by its axis order; always_xy hands back easting (Y in Japanese survey) then northing
E, N = to_plane.transform(gx.ravel(), gy.ravel())
E, N = np.asarray(E).reshape(H, W), np.asarray(N).reshape(H, W)
img = np.zeros((H, W, 3), np.uint8)
def sheet_files():
    """(world file text, image) of each sheet: a .tif beside its .tfw, or the zip pipeline/fetch_tokyo_ortho.py keeps."""
    for tif in sorted(glob.glob(os.path.join(sheets, "*.tif"))):
        yield open(tif[:-4] + ".tfw").read(), Image.open(tif)
    for zp in sorted(glob.glob(os.path.join(sheets, "*.zip"))):
        with zipfile.ZipFile(zp) as z:
            names = z.namelist()
            t = next((n for n in names if n.lower().endswith(".tif")), None)
            w = next((n for n in names if n.lower().endswith(".tfw")), None)
            if t and w:
                yield z.read(w).decode(), Image.open(io.BytesIO(z.read(t)))


for tfw, image in sheet_files():
    a, d, b, e, c, f = (float(v) for v in tfw.split())
    im = np.asarray(image.convert("RGB"))
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
