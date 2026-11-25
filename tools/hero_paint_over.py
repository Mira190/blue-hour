"""A hero level's paint (its ground_paint part, as the build makes it) drawn over a picture from tools/ortho_overlay.py
--plain of the same box, to see traced markings land on the photograph's.

    python tools/hero_paint_over.py shibuya [level] x0 y0 x1 y1 photo.jpg out.jpg
"""
import importlib.util
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
sys.path.insert(0, os.path.join(ROOT, "blender"))
import hero_kit as K  # noqa: E402

args = sys.argv[1:]
city = args.pop(0)
level = args.pop(0) if not args[0].lstrip("-").replace(".", "").isdigit() else None
x0, y0, x1, y1 = (float(v) for v in args[:4])
photo, out = args[4], args[5]
spec = importlib.util.spec_from_file_location("hero_level", os.path.join(ROOT, "cities", city, f"hero_{level}.py" if level else "hero.py"))
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
geo, atlas, materials, meta = mod.build(K)
g = geo.part(os.environ.get("PART", "ground_paint"))   # (PART=ground_bed: another of its ground parts)
P = np.asarray(g["p"], float)
pic = Image.open(photo).convert("RGB")
W, H = pic.size
sx, sy = W / (x1 - x0), H / (y1 - y0)
# the level's vertices are in the map's metres (x east, y north, height), as hero_open.G lays them
D = ImageDraw.Draw(pic, "RGBA")
for t in g["tri"]:
    q = [((P[i][0] - x0) * sx, (y1 - P[i][1]) * sy) for i in t]
    D.polygon(q, fill=(255, 40, 200, 150))
pic.save(out, quality=90)
print(out, len(g["tri"]), "triangles of paint")
