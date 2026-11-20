"""Vendor what the web page used to fetch from third parties at load: three.js r186 with the
addons the app imports, three-mesh-bvh, and the fonts (Google Fonts, all SIL Open Font
Licence). Served from the site itself, the page no longer depends on cdnjs, jsDelivr or
Google being reachable (fonts.googleapis.com is blocked in mainland China, where a
render-blocking stylesheet that never arrives holds the first paint), sends no visitor's
address to them, and works offline.

    python3 pipeline/fetch_vendor.py
    python3 pipeline/fetch_vendor.py --check   # the fixes to three.js (PATCHES) in the vendored files
    python3 pipeline/fetch_vendor.py --patch   # the fixes made to the vendored files as they are

Writes web/vendor/three/{three.module.min.js, three.core.min.js, addons/...},
web/vendor/three-mesh-bvh/index.module.min.js, web/assets/fonts/*.woff2 and web/fonts.css.
The reef's WebGPU build (web/vendor/three/three.webgpu.js) is the same release and stays.
"""
import glob
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.join(os.path.dirname(__file__), "..")
WEB = os.path.join(ROOT, "web")
THREE = "0.186.1"
BVH = "0.9.16"
NPM = "https://cdn.jsdelivr.net/npm"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"

# what index.html imports from three/addons; their own imports are followed
ADDONS = ["controls/OrbitControls.js", "objects/Sky.js", "objects/Reflector.js", "loaders/GLTFLoader.js",
          "utils/SkeletonUtils.js", "utils/BufferGeometryUtils.js", "postprocessing/EffectComposer.js",
          "postprocessing/RenderPass.js", "postprocessing/UnrealBloomPass.js", "postprocessing/OutputPass.js",
          "postprocessing/ShaderPass.js", "libs/meshopt_decoder.module.js"]

# the families index.html sets type in, latin and latin-ext only; Japanese and Chinese text
# falls back to the system's own fonts (Hiragino, Yu Gothic, Noto CJK) except the city names,
# subset to their characters
FONTS = [
    "family=Bricolage+Grotesque:opsz,wdth,wght@12..96,75..100,500..800",
    "family=Public+Sans:wght@400;500;600",
    "family=JetBrains+Mono:wght@400;500",
    "family=Zalando+Sans+Expanded:wght@200..500",
    "family=Inter+Tight:wght@400;500;600",
    "family=Newsreader:opsz,wght@6..72,400",  # the story's serif: what someone of another year says, and what was found
    "family=Caveat:wght@400..600",  # the hand the file is written in, on its kraft paper (the roll)
]
def cjk_text():
    """the cities' names on the title, the title drop of each map's overture (game.overture.title), and what is
    printed on the thing a story's last card shows (game.story episodes' end.found.ticket)"""
    chars = set("大阪京都東香港")
    for f in glob.glob(os.path.join(os.path.dirname(WEB), "cities", "*", "city.json")):
        g = json.load(open(f, encoding="utf8")).get("game") or {}
        ov = g.get("overture", {})
        for ep in (g.get("story") or {}).get("episodes", []):
            for v in ((ep.get("end") or {}).get("found") or {}).get("ticket", {}).values():
                chars |= {c for c in "".join(v) if ord(c) > 0x2e7f}
        for t in (ov.get("title", {}), ov.get("night", {}).get("title", {})):  # (the day's and the night's)
            chars |= {c for c in t.get("name", "") + t.get("line", "") if ord(c) > 0x2e7f}
    return "".join(sorted(chars))


CJK = "family=Shippori+Mincho:wght@500&family=Noto+Serif+TC:wght@500&text=" + urllib.request.quote(cjk_text())
HAND = "family=Klee+One:wght@400&text=" + urllib.request.quote("待つ")  # the one word in pencil (the story's last card)
SUBSETS = {"latin", "latin-ext"}


def get(url, binary=True):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    return data if binary else data.decode("utf8")


def save(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)


# Fixes to three.js r186's minified module, made on every fetch and held by `--check` (tools/check.sh static): each
# (file, the text as published, the text as fixed, why). The published text must occur once.
PATCHES = [
    # A texture over the renderer's texture cap is drawn smaller into a canvas before it is sent (WebGLTextures
    # resizeImage). The flags a canvas is sent with (UNPACK_FLIP_Y, UNPACK_PREMULTIPLY_ALPHA, UNPACK_COLORSPACE_CONVERSION)
    # are set only when the texture's image is not an ImageBitmap, which ignores them; so an ImageBitmap that is made
    # smaller went up as a canvas with whatever flags the texture sent before it left. Every glTF model's pictures are
    # ImageBitmaps (GLTFLoader), and a phone's cap (quality.js tex, 1024) or the low tier's (2048) makes them smaller:
    # after a texture with flipY, the trees' leaf atlas went up upside down and the zelkovas and the camphors wore the
    # cherries' blossom (issue 68). Sent as an ImageBitmap is: unturned, its alpha as it is, its colours as they are.
    ("three.module.min.js",
     "a)}n.pixelStorei(e.UNPACK_ALIGNMENT,o.unpackAlignment);let t=h(o.image,!1,a.maxTextureSize)",
     "a)}else Math.max(o.image.width,o.image.height)>a.maxTextureSize&&(n.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,!1),"
     "n.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),n.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,e.NONE));"
     "n.pixelStorei(e.UNPACK_ALIGNMENT,o.unpackAlignment);let t=h(o.image,!1,a.maxTextureSize)",
     "an ImageBitmap made smaller than the texture cap is sent with the flags an ImageBitmap is (issue 68)"),
]


def patch(name, data):
    """the vendored file with its fixes (PATCHES) made"""
    for f, old, new, why in PATCHES:
        if f != name:
            continue
        n = data.count(old.encode())
        if n != 1:
            sys.exit(f"FAIL {f}: the text to fix occurs {n} times ({why}): three.js has changed, see PATCHES")
        data = data.replace(old.encode(), new.encode())
    return data


def check():
    """FAIL for each fix not in the vendored file"""
    bad = 0
    for f, old, new, why in PATCHES:
        with open(os.path.join(WEB, "vendor", "three", f), "rb") as fh:
            data = fh.read()
        if data.count(new.encode()) != 1 or old.encode() in data:
            print(f"FAIL {f}: {why} is not made (python3 pipeline/fetch_vendor.py)")
            bad += 1
    print(f"{len(PATCHES) - bad} of {len(PATCHES)} fixes to three.js in place")
    return bad


def three():
    base = f"{NPM}/three@{THREE}"
    out = os.path.join(WEB, "vendor", "three")
    for f in ["three.module.min.js", "three.core.min.js"]:
        data = get(f"{base}/build/{f}")
        # the minified module imports the full-size core (1.5 MB): point it at the minified one (0.4 MB)
        save(os.path.join(out, f), patch(f, data.replace(b'from"./three.core.js"', b'from"./three.core.min.js"')))
    todo, done = list(ADDONS), set()
    while todo:
        rel = todo.pop()
        if rel in done:
            continue
        done.add(rel)
        src = get(f"{base}/examples/jsm/{rel}", binary=False)
        save(os.path.join(out, "addons", rel), src.encode("utf8"))
        for dep in re.findall(r"""from\s+['"](\.{1,2}/[^'"]+)['"]""", src):
            todo.append(os.path.normpath(os.path.join(os.path.dirname(rel), dep)).replace(os.sep, "/"))
    save(os.path.join(WEB, "vendor", "three-mesh-bvh", "index.module.min.js"), get(f"{NPM}/three-mesh-bvh@{BVH}/build/index.module.min.js"))
    print(f"three.js {THREE}: {len(done)} addons; three-mesh-bvh {BVH}")


def fonts():
    css_out, files = ["/* Vendored by pipeline/fetch_vendor.py from Google Fonts (SIL Open Font Licence). */"], {}
    for q, all_subsets in [(f, False) for f in FONTS] + [(CJK, True), (HAND, True)]:
        css = get(f"https://fonts.googleapis.com/css2?{q}&display=swap", binary=False)
        for subset, block in re.findall(r"/\*\s*([\w-]+)\s*\*/\s*(@font-face\s*{[^}]*})", css) or [("all", b) for b in re.findall(r"@font-face\s*{[^}]*}", css)]:
            if not all_subsets and subset not in SUBSETS:
                continue
            fam = re.search(r"font-family:\s*'([^']+)'", block).group(1)
            weight = re.search(r"font-weight:\s*([\d ]+);", block).group(1).strip().replace(" ", "-")
            url = re.search(r"url\((https://[^)]+)\)", block).group(1)
            if url not in files:  # a variable font comes back once per weight asked for: keep one file
                files[url] = f"{fam.lower().replace(' ', '-')}-{weight}-{subset}.woff2"
                save(os.path.join(WEB, "assets", "fonts", files[url]), get(url))
            css_out.append(block.replace(url, f"assets/fonts/{files[url]}"))
    with open(os.path.join(WEB, "fonts.css"), "w", encoding="utf8") as f:
        f.write("\n".join(css_out) + "\n")
    print(f"fonts: {len(files)} files")


if __name__ == "__main__":
    if "--check" in sys.argv:  # (the fixes to three.js in the vendored files: tools/check.sh static)
        sys.exit(1 if check() else 0)
    if "--patch" in sys.argv:  # (the fixes made to the vendored files as they are, without fetching them again)
        for f in sorted({p[0] for p in PATCHES}):
            path = os.path.join(WEB, "vendor", "three", f)
            with open(path, "rb") as fh:
                data = fh.read()
            if all(data.count(p[2].encode()) == 1 for p in PATCHES if p[0] == f):
                continue
            save(path, patch(f, data))
        sys.exit(check())
    if "--fonts" not in sys.argv:  # (--fonts: the fonts only, as after a new overture title)
        three()
    fonts()
