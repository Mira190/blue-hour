"""The map's ground photograph from Tokyo's 2023 aerial ortho (pipeline/fetch_tokyo_ortho.py), in place of GSI's seamless
photo (flown June-November 2019 round the Scramble, construction pits where the towers now stand).

    python pipeline/ortho_tokyo.py --city shibuya      # data/raw/<id>/tokyo_ortho -> web/data/<id>/ground_*.jpg|avif

Each 0.2 m sheet is averaged down to the map's 1 m in its own grid (Japan Plane Rectangular CS zone IX, EPSG:6677), the
sheets are laid side by side, and the mosaic is resampled into the map's frame (a transverse Mercator about 0.08 degrees
off zone IX's grid here). Then, before the photo reaches the ground tiles:

  * Its towers stood up. It is a "simple" ortho: rectified to the bare earth, so a building leans out from the camera
    that took it, by its height times the distance from that camera's nadir over the flying height. The lean is
    measured on the map's own tall buildings (where the roof's outline, shifted, meets the photograph's strongest
    edges) and smoothed across the frame. A building's roof is then put back over its footprint (taken from where it
    lies in the photo), and the ground its leaning walls cover in the photo is filled from the ground round it, so
    no facade prints onto a roof or a street ("The bar": no aerial photograph shows through as ground where it can be
    read as something it is not).
  * Its colour matched to the photo the map was graded for (the GSI tiles), channel by channel at the 2nd to 98th
    percentiles, so the page's grade (world.js photoGrade) holds.
  * Its open ground softened (aerial_clean.soften, city.json imagery.soften), as build_scene.py does, with the
    buildings from buildings.json and the roads from game.json.
  * The construction sites of today's city (cities/<id>/today.json) laid as one even tone of a site's ground.

Tokyo Metropolitan Government, Digital Twin project: 2023 aerial survey ortho photographs, CC BY 4.0.
"""
import glob
import io
import json
import math
import os
import sys
import zipfile

import numpy as np
from PIL import Image
from pyproj import Transformer
from scipy import ndimage
from scipy.ndimage import map_coordinates

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cityctx import city_args  # noqa: E402

Image.MAX_IMAGE_PIXELS = None
PX = 1.0          # the ground tiles' metres per pixel (build_scene.py IMG_M)
SRC_PX = 0.2      # the sheets'


def read_sheet(path):
    """(rgb at 1 m, x_left, y_top) of a sheet zip, in zone IX."""
    z = zipfile.ZipFile(path)
    tfw = [n for n in z.namelist() if n.lower().endswith(".tfw")][0]
    tif = [n for n in z.namelist() if n.lower().endswith((".tif", ".tiff"))][0]
    a, _, _, e, c, f = [float(v) for v in z.read(tfw).decode().split()]
    im = np.asarray(Image.open(io.BytesIO(z.read(tif))).convert("RGB"), np.float32)
    k = int(round(PX / a))
    H, W = im.shape[0] // k * k, im.shape[1] // k * k
    small = im[:H, :W].reshape(H // k, k, W // k, k, 3).mean((1, 3))
    # the world file names the first pixel's middle
    return small, c - a / 2, f - e / 2


def mosaic(city):
    """The sheets laid side by side at 1 m in zone IX: (rgb float32, valid mask, x_left, y_top). Cached."""
    cache = os.path.join(city.raw, "tokyo_ortho_1m.npz")
    if os.path.exists(cache):
        d = np.load(cache)
        return d["rgb"], d["ok"], float(d["x0"]), float(d["y1"])
    sheets = []
    for p in sorted(glob.glob(os.path.join(city.raw, "tokyo_ortho", "*.zip"))):
        sheets.append(read_sheet(p))
    x0 = min(s[1] for s in sheets)
    y1 = max(s[2] for s in sheets)
    x1 = max(s[1] + s[0].shape[1] * PX for s in sheets)
    y0 = min(s[2] - s[0].shape[0] * PX for s in sheets)
    W, H = int(round((x1 - x0) / PX)), int(round((y1 - y0) / PX))
    rgb = np.zeros((H, W, 3), np.float32)
    ok = np.zeros((H, W), bool)
    for im, sx, sy in sheets:
        i, j = int(round((sx - x0) / PX)), int(round((y1 - sy) / PX))
        rgb[j:j + im.shape[0], i:i + im.shape[1]] = im
        ok[j:j + im.shape[0], i:i + im.shape[1]] = im.max(axis=2) > 0
    np.savez(cache, rgb=rgb.astype(np.float16), ok=ok, x0=x0, y1=y1)
    print(f"mosaic: {len(sheets)} sheets, {W} x {H} px at {PX} m")
    return rgb, ok, x0, y1


def to_frame(city, rgb, ok, mx0, my1, x0, y1, w, h):
    """The mosaic resampled onto a w x h raster of the map's frame whose top-left corner is (x0, y1)."""
    to = Transformer.from_crs(city.proj, "EPSG:6677", always_xy=True)
    gx, gy = np.meshgrid(x0 + (np.arange(w) + 0.5) * PX, y1 - (np.arange(h) + 0.5) * PX)
    X, Y = to.transform(gx.ravel(), gy.ravel())
    ci, cj = (np.asarray(X) - mx0) / PX - 0.5, (my1 - np.asarray(Y)) / PX - 0.5
    out = np.stack([map_coordinates(rgb[..., k], [cj, ci], order=1, cval=0).reshape(h, w) for k in range(3)], -1)
    valid = map_coordinates(ok.astype(np.float32), [cj, ci], order=1, cval=0).reshape(h, w)
    return out, valid


# ---------------------------------------------------------------- heights, shadows, lean

def surface(city, B, demolished, px=PX):
    """The map's buildings as heights above the ground on the frame's raster (m), and their footprints."""
    from PIL import ImageDraw
    W, H = int((city.x1 - city.x0) / px), int((city.y1 - city.y0) / px)
    hm = Image.new("F", (W, H), 0.0)
    foot = Image.new("L", (W, H), 0)
    dh, df = ImageDraw.Draw(hm), ImageDraw.Draw(foot)
    order = sorted((s[3], si) for si, s in enumerate(B["s"]) if si not in demolished)
    for top, si in order:   # the tallest last, so a tower over a podium keeps its height
        s = B["s"][si]
        r = np.asarray(s[4], float).reshape(-1, 2) / 10
        p = [((x - city.x0) / px, (city.y1 - y) / px) for x, y in r]
        if len(p) >= 3:
            dh.polygon(p, fill=float(top) / 10)
            df.polygon(p, fill=1)
    return np.asarray(hm, np.float32), np.asarray(foot, bool)


def shadow_mask(hm, az_deg, el_deg, px=PX, reach_m=500.0):
    """Where the buildings shade the ground or a lower roof, for a sun at azimuth az (from north, clockwise) and
    elevation el: a cell is in shadow when, marching toward the sun, something stands higher than the sun's ray."""
    a = math.radians(az_deg)
    dx, dy = math.sin(a), -math.cos(a)   # toward the sun, in raster steps (x right, y down; north is up)
    t = math.tan(math.radians(el_deg))
    sh = np.zeros(hm.shape, bool)
    H, W = hm.shape
    for k in range(1, int(reach_m / px)):
        ox, oy = int(round(dx * k)), int(round(dy * k))
        need = hm + k * px * t
        src = np.zeros_like(hm)
        ys0, ys1 = max(0, oy), min(H, H + oy)
        xs0, xs1 = max(0, ox), min(W, W + ox)
        src[ys0 - oy:ys1 - oy, xs0 - ox:xs1 - ox] = hm[ys0:ys1, xs0:xs1]
        sh |= src > need
        if k * px * t > hm.max():
            break
    return sh


def lift_shadows(rgb, hm, foot, az, el, px=PX):
    """The photograph's shadows taken out: where the map's buildings shade the ground at the hour it was flown (and
    the photograph is dark there), each channel is brought up by the ratio of the lit to the shaded ground across the
    shadows' edges, so that the page's own sun casts the only shadows. Returns (rgb, mask)."""
    f = rgb.astype(np.float32)
    L = f @ np.array([0.299, 0.587, 0.114], np.float32)
    model = shadow_mask(hm, az, el, px)
    near = ndimage.binary_dilation(model, iterations=int(4 / px))
    lit = ~ndimage.binary_dilation(model, iterations=int(6 / px))
    # the dark of a shadow, judged against the lit ground round it (a dark roof in the sun is not a shadow)
    lit_med = ndimage.gaussian_filter(np.where(lit, L, 0), 25 / px) / np.maximum(ndimage.gaussian_filter(lit.astype(np.float32), 25 / px), 1e-3)
    sh_med = ndimage.gaussian_filter(np.where(model, L, 0), 25 / px) / np.maximum(ndimage.gaussian_filter(model.astype(np.float32), 25 / px), 1e-3)
    m = near & (L < 0.5 * (lit_med + sh_med))
    m = ndimage.binary_closing(ndimage.binary_opening(m, iterations=1), iterations=2)
    # the gain, channel by channel, for the ground and for the roofs: the lit over the shaded where the model's shadows
    # are certain (3 m inside the shadows of buildings 25 m and taller, 6 m clear of any); a shadow is lit by the blue sky, so red gains the most
    core = ndimage.binary_erosion(shadow_mask(np.where(hm >= 25, hm, 0), az, el, px), iterations=int(3 / px))
    gain = np.ones(f.shape, np.float32)
    g0 = []
    for part in (~foot, foot):
        g = [float(np.median(f[..., k][lit & part]) / max(np.median(f[..., k][core & part]), 1.0)) for k in range(3)]
        g = np.clip(g, 1.0, 3.0)
        gain[part] = g
        g0.append(np.round(g, 2).tolist())
    w = ndimage.gaussian_filter(m.astype(np.float32), 1.2 / px)
    out = f * (1 + w[..., None] * (gain - 1))
    gain = g0
    return np.clip(out, 0, 255), m, gain


def measure_lean(city, B, demolished, L, min_h=35.0):
    """Each tall building's lean in the photograph, per metre of height: the shift of its roof's outline that lies on
    the photograph's strongest edges, searched within 0.45 of its height. [(x, y, h, kx, ky, score)]"""
    from PIL import ImageDraw
    G = np.hypot(ndimage.sobel(L, 1), ndimage.sobel(L, 0))
    out = []
    for si, s in enumerate(B["s"]):
        h = s[3] / 10
        if si in demolished or h < min_h:
            continue
        r = np.asarray(s[4], float).reshape(-1, 2) / 10
        px, py = (r[:, 0] - city.x0) / PX, (city.y1 - r[:, 1]) / PX
        area = 0.5 * abs(np.dot(px, np.roll(py, 1)) - np.dot(py, np.roll(px, 1)))
        if area < 250:
            continue
        lim = int(0.45 * h)
        i0, j0, i1, j1 = int(px.min()) - lim - 2, int(py.min()) - lim - 2, int(px.max()) + lim + 2, int(py.max()) + lim + 2
        if i0 < 0 or j0 < 0 or i1 >= G.shape[1] or j1 >= G.shape[0]:
            continue
        o = Image.new("L", (i1 - i0, j1 - j0), 0)
        ImageDraw.Draw(o).polygon(list(zip(px - i0, py - j0)), outline=1)
        O = np.asarray(o, np.float32)
        # the score of every shift at once: the outline correlated with the edges
        from scipy.signal import fftconvolve
        win = G[j0:j1, i0:i1]
        sc = fftconvolve(win, O[::-1, ::-1], mode="same") / O.sum()
        cy, cx = (j1 - j0) // 2, (i1 - i0) // 2
        yy, xx = np.mgrid[0:sc.shape[0], 0:sc.shape[1]]
        inside = (yy - cy) ** 2 + (xx - cx) ** 2 <= lim * lim
        sc = np.where(inside, sc, 0)
        j, i = np.unravel_index(np.argmax(sc), sc.shape)
        med = np.median(sc[inside])
        out.append((float(r[:, 0].mean()), float(r[:, 1].mean()), h, (i - cx) * PX / h, -(j - cy) * PX / h, float(sc[j, i] / max(med, 1e-3))))
    return out


def lean_field(meas, x, y, r_m=450.0):
    """The lean at (x, y): the median of the trustworthy measurements within r_m (the tallest count most)."""
    m = np.array([q for q in meas if q[5] > 1.6])
    if not len(m):
        return 0.0, 0.0
    d = np.hypot(m[:, 0] - x, m[:, 1] - y)
    sel = m[d < r_m]
    if len(sel) < 3:
        sel = m[np.argsort(d)[:5]]
    w = sel[:, 2]
    def wmed(v):
        o = np.argsort(v)
        c = np.cumsum(w[o])
        return float(v[o][np.searchsorted(c, c[-1] / 2)])
    return wmed(sel[:, 3]), wmed(sel[:, 4])


def fill(rgb, mask, keep_out, sigma_m=8.0, px=PX):
    """mask filled from the pixels round it that are neither masked nor in keep_out (normalised convolution), with
    a quarter of the photograph's own fine grain laid back."""
    f = rgb.astype(np.float32)
    src = ~(mask | keep_out)
    s = sigma_m / px
    den = ndimage.gaussian_filter(src.astype(np.float32), s)
    out = f.copy()
    for k in range(3):
        low = ndimage.gaussian_filter(np.where(src, f[..., k], 0), s) / np.maximum(den, 1e-3)
        fine = f[..., k] - ndimage.gaussian_filter(f[..., k], 1.5 / px)
        out[..., k] = np.where(mask, low + 0.25 * fine, f[..., k])
    w = ndimage.gaussian_filter(mask.astype(np.float32), 1.0 / px)
    return f * (1 - w[..., None]) + out * w[..., None]


def lean_zones(city, B, demolished, meas, foot, min_h=40.0, px=PX):
    """Where the photograph shows a building's walls instead of the ground: the sweep of each footprint 40 m or taller
    from where it stands to where its roof lies in the photograph, off every footprint; and a 2 m band at the foot
    of every building over 20 m (the wall's base, which leans out of any footprint)."""
    from PIL import ImageDraw
    W, H = foot.shape[1], foot.shape[0]
    z = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(z)
    for si, s in enumerate(B["s"]):
        h = s[3] / 10
        if si in demolished or h < 20:
            continue
        r = np.asarray(s[4], float).reshape(-1, 2) / 10
        P = [((x - city.x0) / px, (city.y1 - y) / px) for x, y in r]
        d.line(P + P[:1], fill=1, width=int(4 / px))
        if h < min_h:
            continue
        kx, ky = lean_field(meas, r[:, 0].mean(), r[:, 1].mean())
        for t in np.linspace(0.1, 1.0, 10):
            dx, dy = kx * h * t / px, -ky * h * t / px
            d.polygon([(u + dx, v + dy) for u, v in P], fill=1)
    return np.asarray(z, bool) & ~foot


# ---------------------------------------------------------------- the tiles

def old_canvas(city, scene):
    """The ground tiles as built (x0, y1 of the canvas, rgb uint8), to keep outside the photo and to match colours to."""
    G = scene["ground"]
    x0, x1 = min(g["x0"] for g in G), max(g["x1"] for g in G)
    y0, y1 = min(g["y0"] for g in G), max(g["y1"] for g in G)
    a = np.zeros((int((y1 - y0) / PX), int((x1 - x0) / PX), 3), np.uint8)
    for g in G:
        im = np.asarray(Image.open(os.path.join(city.out, g["file"])).convert("RGB"))
        i, j = int((g["x0"] - x0) / PX), int((y1 - g["y1"]) / PX)
        a[j:j + im.shape[0], i:i + im.shape[1]] = im[:a.shape[0] - j, :a.shape[1] - i]
    return x0, y1, a


def match(src, ref, mask):
    """src's brightness mapped linearly so its 2nd and 98th percentiles over mask meet ref's: the range of the photo the
    page was graded for. Its own white balance is kept (a neutral grey in 2023; GSI's is cooler, and matching its
    channels, or stretching each on its own, tinted the ground and the lifted shadows blue)."""
    f = src.astype(np.float32)
    w = np.array([0.299, 0.587, 0.114], np.float32)
    Ls, Lr = f @ w, ref.astype(np.float32) @ w
    a0, a1 = np.percentile(Ls[mask], (2, 98))
    b0, b1 = np.percentile(Lr[mask], (2, 98))
    Ln = (Ls - a0) * (b1 - b0) / max(a1 - a0, 1.0) + b0
    out = f * (np.maximum(Ln, 0) / np.maximum(Ls, 1.0))[..., None]
    return np.clip(out, 0, 255)


def main():
    import aerial_clean
    from build_scene import SOFT_ROAD_W, ground_overview, save_tile
    from PIL import ImageDraw
    city, _ = city_args(__doc__.splitlines()[0])
    cfg = city.cfg["imagery"]["tokyo_ortho"]
    scene_path = os.path.join(city.out, "scene.json")
    scene = json.load(open(scene_path, encoding="utf8"))
    B = json.load(open(os.path.join(city.out, "buildings.json")))
    L = json.load(open(os.path.join(city.out, "landmarks.json")))
    gone = set(L.get("demolished") or [])
    W, H = int((city.x1 - city.x0) / PX), int((city.y1 - city.y0) / PX)
    rgb, ok, mx0, my1 = mosaic(city)
    new, valid = to_frame(city, rgb.astype(np.float32), ok, mx0, my1, city.x0, city.y1, W, H)
    del rgb
    hm, foot = surface(city, B, gone)
    # 1. the photograph's shadows out
    az, el = cfg["sun"]
    new, shade, gain = lift_shadows(new, hm, foot, az, el)
    print(f"shadows: {shade.mean() * 100:.0f}% of the frame lifted (sun {az} / {el} deg; gain ground, roofs {gain})")
    # 2. the leaning walls off the ground
    lum = new.astype(np.float32) @ np.array([0.299, 0.587, 0.114], np.float32)
    meas = measure_lean(city, B, gone, lum)
    zones = lean_zones(city, B, gone, meas, foot)
    new = fill(new, zones, foot)
    k = np.array([[q[3], q[4]] for q in meas if q[5] > 1.6])
    print(f"lean: {len(k)} towers measured, median {np.median(np.hypot(k[:, 0], k[:, 1])):.3f} m a metre; {zones.mean() * 100:.1f}% of the frame filled")
    # 3. the colours of the photo the page was graded for
    cx0, cy1, old = old_canvas(city, scene)
    i0, j0 = int((city.x0 - cx0) / PX), int((cy1 - city.y1) / PX)
    old_f = old[j0:j0 + H, i0:i0 + W]
    new = match(new, old_f, valid > 0.99)
    # 4. today's construction sites, one even tone of a site's ground (crisp at the hoarding)
    tj = os.path.join(city.dir, "today.json")
    site = Image.new("L", (W, H), 0)
    if os.path.exists(tj):
        d = ImageDraw.Draw(site)
        for st in json.load(open(tj, encoding="utf8")).get("sites", []):
            d.polygon([((x - city.x0) / PX, (city.y1 - y) / PX) for x, y in st["ring"]], fill=1)
    site = np.asarray(site, bool)
    new[site] = np.array(cfg.get("site_rgb", [134, 133, 130]), np.float32)
    # 5. the open ground softened, as build_scene.py does
    rings = []
    for si, s in enumerate(B["s"]):
        if si not in gone:
            r = np.asarray(s[4], float).reshape(-1, 2) / 10
            rings.append([tuple(p) for p in r])
    G = json.load(open(os.path.join(city.out, "game.json")))
    roads = []
    for r in G["paths"]["road"]:
        w = SOFT_ROAD_W.get(r["c"])
        if w:
            p = np.asarray(r["p"], float).reshape(-1, 3)[:, :2] / 10
            roads.append(([tuple(q) for q in p], w))
    sf = city.cfg["imagery"].get("soften")
    new8 = np.clip(np.round(new), 0, 255).astype(np.uint8)
    if sf:
        soft, share = aerial_clean.soften(new8, city.x0, city.y1, PX, rings, roads, sf.get("sigma_m", 6.0), sf.get("keep", 0.15))
        new8 = np.where(site[..., None], new8, soft)
        print(f"ground: softened over {share * 100:.0f}% of the frame")
    # 6. into the tiles, the old photo kept outside the frame (a 20 m blend at its edge)
    w = np.clip(ndimage.distance_transform_edt(valid > 0.99) / 20.0, 0, 1)[..., None]
    out = old.copy()
    out[j0:j0 + H, i0:i0 + W] = np.round(old_f * (1 - w) + new8 * w).astype(np.uint8)
    for g in scene["ground"]:
        i, j = int((g["x0"] - cx0) / PX), int((cy1 - g["y1"]) / PX)
        tw, th = int((g["x1"] - g["x0"]) / PX), int((g["y1"] - g["y0"]) / PX)
        save_tile(city, g["file"].rsplit(".", 1)[0], out[j:j + th, i:i + tw], 82)
    scene["ground_lo"] = ground_overview(city, out[j0:j0 + H, i0:i0 + W])
    scene["sources"]["imagery"] = cfg["attribution"]
    with open(scene_path, "w", encoding="utf8") as f:
        json.dump(scene, f, separators=(",", ":"))   # (as build_scene.py writes it)
    print(f"{city.id}: {len(scene['ground'])} ground tiles from the 2023 photograph")


if __name__ == "__main__":
    main()
