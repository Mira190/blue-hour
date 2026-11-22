#!/usr/bin/env python3
"""Draw each scanned person's body picture beside its skin mask (the alpha build_people.py skin_mask writes, which the
crowd's change of clothes leaves undyed and the street light lights as skin): the texels marked skin in red over the
picture, the rest greyed. Prints each character's share of skin and the share of skin that lies in islands joined to
no hand, face edge or leg (what a garment of a skin-like colour taken for skin shows as).

  python3 tools/skin_mask_audit.py OUT_DIR [--against REV] [glb ...]   (no glb: the cast Shibuya's crowd draws from)

--against REV: the mask each file had at git revision REV beside it, what it lost in blue and what it gained in green.
"""
import io, json, struct, subprocess, sys, os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def images(path, data=None):
    data = data or open(path, "rb").read()
    jlen = struct.unpack("<I", data[12:16])[0]
    j = json.loads(data[20:20 + jlen])
    off = 20 + jlen
    buf = data[off + 8:off + 8 + struct.unpack("<I", data[off:off + 4])[0]]
    out = {}
    for mat in j.get("materials", []):
        tex = mat.get("pbrMetallicRoughness", {}).get("baseColorTexture")
        if not tex:
            continue
        t = j["textures"][tex["index"]]
        src = t.get("source", t.get("extensions", {}).get("EXT_texture_webp", {}).get("source"))
        v = j["bufferViews"][j["images"][src]["bufferView"]]
        out[mat.get("name", "?")] = Image.open(io.BytesIO(buf[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]]))
    return out


def main():
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    files = sys.argv[2:]
    rev = None
    if files[:1] == ["--against"]:
        rev, files = files[1], files[2:]
    if not files:
        g = json.load(open(os.path.join(ROOT, "web/data/shibuya/game.json")))
        cast = g["crowd"]["cast"]
        files = [os.path.join(ROOT, "web/assets/people", n + ".glb") for n in cast["f"] + cast["m"]]
    for f in files:
        name = os.path.basename(f)[:-4]
        for mname, im in images(f).items():
            if not mname.endswith("_body"):
                continue
            im = im.convert("RGBA")
            a = np.asarray(im)
            rgb = a[..., :3].astype(np.float32)
            skin = a[..., 3] < 230
            grey = rgb.mean(-1, keepdims=True) * 0.35 + rgb * 0.15
            ov = np.where(skin[..., None], rgb * 0.5 + np.array([255, 0, 0]) * 0.5, grey)
            note = ""
            if rev:
                rel = os.path.relpath(f, ROOT)
                was = subprocess.run(["git", "-C", ROOT, "show", f"{rev}:{rel}"], capture_output=True).stdout
                old = images(f, was).get(mname) if was else None
                if old is not None:
                    o = np.asarray(old.convert("RGBA").resize(im.size))[..., 3] < 230
                    ov = np.where((o & ~skin)[..., None], rgb * 0.4 + np.array([0, 120, 255]) * 0.6, ov)
                    ov = np.where((skin & ~o)[..., None], rgb * 0.4 + np.array([0, 255, 80]) * 0.6, ov)
                    note = f" (was {o.mean():.3f})"
            both = np.concatenate([rgb, ov], 1).clip(0, 255).astype(np.uint8)
            Image.fromarray(both).save(os.path.join(out, name + ".png"))
            print(f"{name:44s} {mname:28s} skin {skin.mean():.3f}{note}")


if __name__ == "__main__":
    main()
