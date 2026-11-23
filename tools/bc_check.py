#!/usr/bin/env python3
"""The device-side BC7 and BC5 encoder (web/bc7.js) against a decoder that is not its own.

Each picture is encoded by the page's encoder in Node (tools/bc_encode.js), written as a DDS file, decoded by Pillow
and compared with the picture it was made from. A block laid out wrongly decodes to noise, far under the floor; the
figures are the quality a desktop gets. Three things are held:

  - every layout the encoder writes decodes as it counted: made-up blocks that force each of mode 1's 32 patterns,
    mode 5 and mode 6, the decoder's error within a fifth of a decibel of the encoder's own;
  - this project's pictures, opaque and as cut-outs, over the floor (MIN_DB, 36; alpha 30);
  - a sky's gradient without a band: no texel more than two steps of 8-bit from what it was (MAX_STEP);
  - a normal map in BC5 over 40 dB in red and green.

  python3 tools/bc_check.py [pictures under web/...]      exits 1 on any of these
A picture inside a model is named file.glb#n (its n-th image).
"""
import io, json, os, struct, subprocess, sys, tempfile
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PICS = sys.argv[1:] or ['data/shibuya/ground_2_1.avif', 'data/shibuya/atlas.webp', 'data/shibuya/scramble.webp', 'data/shibuya/screens.webp',
                        'data/shibuya/yongen.webp', 'data/shibuya/far.jpg', 'assets/trees/trees_far.glb#0', 'assets/people/R_Female_Adult_14.glb#1']
MIN_DB, MIN_ALPHA, MAX_STEP = float(os.environ.get('MIN_DB', 36)), float(os.environ.get('MIN_ALPHA', 30)), int(os.environ.get('MAX_STEP', 2))
TMP = tempfile.mkdtemp(prefix='bc-check-')


def load(name):
    if '.glb#' in name:
        path, k = name.split('#')
        buf = open(os.path.join(ROOT, 'web', path), 'rb').read()
        jl = struct.unpack_from('<I', buf, 12)[0]
        doc = json.loads(buf[20:20 + jl])
        im = doc['images'][int(k)]
        bv = doc['bufferViews'][im['bufferView']]
        at = 20 + jl + 8 + bv.get('byteOffset', 0)
        return Image.open(io.BytesIO(buf[at:at + bv['byteLength']]))
    return Image.open(os.path.join(ROOT, 'web', name))


def encode(px, kind='bc7'):
    """px: h x w x 4 uint8 -> (what the decoder makes of the blocks, the encoder's own account)"""
    h, w = px.shape[:2]
    raw, dds = os.path.join(TMP, 'in.rgba'), os.path.join(TMP, 'out.dds')
    px.tofile(raw)
    own = json.loads(subprocess.check_output(['node', os.path.join(ROOT, 'tools', 'bc_encode.js'), raw, str(w), str(h), dds] + (['bc5'] if kind == 'bc5' else [])))
    back = np.asarray(Image.open(dds).convert('RGBA'))
    return back, own


def db(px, back, channels=3):
    """colour by how much of it shows (what is cut away has none), and alpha"""
    f = px[..., 3:4].astype(np.float64) / 255
    d = (px[..., :channels].astype(np.float64) - back[..., :channels]) ** 2 * f
    se, n = d.sum(), max(1.0, f.sum()) * 3
    sa = ((px[..., 3].astype(np.float64) - back[..., 3]) ** 2).mean()
    return (99.0 if se == 0 else 10 * np.log10(255 * 255 / (se / n))), (99.0 if sa == 0 else 10 * np.log10(255 * 255 / sa))


bad = 0


def say(ok, line):
    global bad
    bad += 0 if ok else 1
    print(('ok   ' if ok else 'FAIL ') + line)


# ---- every layout: blocks made to take each. Mode 1's patterns: two colours' gradients divided as pattern p
# divides the block (the encoder's own table is not read: a pattern it has wrong fits these badly or decodes wrongly,
# and either shows as an error far from its count)
rng = np.random.default_rng(7)
blocks = []
for rep in range(40):
    for p in range(64):
        a, b, c, d = rng.integers(0, 256, (4, 3))
        blk = np.zeros((4, 4, 4), np.uint8)
        blk[..., 3] = 255
        kind = p % 4
        for i in range(16):
            y, x = divmod(i, 4)
            t = rng.random()
            if kind == 0:   # one line
                blk[y, x, :3] = a + (b - a) * t
            elif kind == 1:  # two lines, by a straight edge at some angle
                side = (x - 1.5) * np.cos(p) + (y - 1.5) * np.sin(p) > (rep % 3 - 1) * 0.7
                blk[y, x, :3] = (a + (b - a) * t * 0.3) if side else (c + (d - c) * t * 0.3)
            elif kind == 2:  # a cut-out whose alpha follows its colour
                blk[y, x, :3] = a + (b - a) * t
                blk[y, x, 3] = int(255 * t)
            else:            # a cut-out whose alpha does not
                blk[y, x, :3] = a + (b - a) * t
                blk[y, x, 3] = int(255 * rng.random())
        blocks.append(blk)
n = int(np.ceil(np.sqrt(len(blocks))))
sheet = np.zeros((n * 4, n * 4, 4), np.uint8)
sheet[..., 3] = 255
for k, blk in enumerate(blocks):
    y, x = divmod(k, n)
    sheet[y * 4:y * 4 + 4, x * 4:x * 4 + 4] = blk
back, own = encode(sheet)
got, gota = db(sheet, back)
say(abs(got - own['db']) < 0.2 and abs(gota - own['adb']) < 0.2 and all(own['modes'][m] > 50 for m in '156'),
    f"layouts: {len(blocks)} made-up blocks, mode 1 {own['modes']['1']}, mode 5 {own['modes']['5']}, mode 6 {own['modes']['6']}; decoded {got:.1f} dB (alpha {gota:.1f}), the encoder counted {own['db']:.1f} ({own['adb']:.1f})")

# ---- a sky: a slow gradient in two directions, dusk's colours. A band is a texel a step or more from its neighbours'
# course; held here as no texel further than MAX_STEP from what it was, and the mean error under half a step
yy, xx = np.mgrid[0:256, 0:512]
sky = np.zeros((256, 512, 4), np.uint8)
sky[..., 0] = np.round(18 + 70 * yy / 255 + 10 * xx / 511)
sky[..., 1] = np.round(24 + 40 * yy / 255 + 6 * xx / 511)
sky[..., 2] = np.round(58 + 50 * yy / 255 - 8 * xx / 511)
sky[..., 3] = 255
back, own = encode(sky)
worst = int(np.abs(sky[..., :3].astype(int) - back[..., :3]).max())
mean = float(np.abs(sky[..., :3].astype(int) - back[..., :3]).mean())
say(worst <= MAX_STEP and mean < 0.5, f"sky: a gradient of 512 x 256, no texel more than {worst} of 255 from what it was (mean {mean:.2f}), {own['db']:.1f} dB")

# ---- this project's pictures
for name in PICS:
    try:
        im = load(name).convert('RGBA')
    except Exception as e:  # noqa: BLE001
        say(False, f'{name}: {e}')
        continue
    w, h = im.size   # (at its own size, as the device encodes it: the middle 1024 at most, whole blocks)
    cw, chh = min(w, 1024) & ~3, min(h, 1024) & ~3
    im = im.crop(((w - cw) // 2, (h - chh) // 2, (w - cw) // 2 + cw, (h - chh) // 2 + chh))
    px = np.asarray(im).copy()
    cut = px[..., 3].min() < 255
    solid = px.copy()
    solid[..., 3] = 255
    back, own = encode(solid)
    got, _ = db(solid, back)
    line = f"{name} {px.shape[1]}x{px.shape[0]}: opaque {got:.1f} dB (counted {own['db']:.1f}; mode 1 in {100 * own['modes']['1'] / sum(own['modes'].values()):.0f}% of blocks; {own['mtps']} M texels/s)"
    ok = (cut or got >= MIN_DB) and abs(got - own['db']) < 0.2   # (a cut-out's colour where nothing shows is whatever its file holds: only its count is held)
    if not cut:  # (a cut-out made of an opaque picture, as tools/astc_check.js makes one: its darks cut away, a soft edge between)
        px[..., 3] = np.clip((px[..., :3].mean(axis=2) - 96) * 9, 0, 255)
    back, own = encode(px)
    got, gota = db(px, back)
    line += f"; alpha {got:.1f} dB, its alpha {gota:.1f} (counted {own['db']:.1f}, {own['adb']:.1f}; mode 5 in {100 * own['modes']['5'] / sum(own['modes'].values()):.0f}%)"
    ok = ok and got >= MIN_DB - 3 and gota >= MIN_ALPHA and abs(got - own['db']) < 0.3 and abs(gota - own['adb']) < 0.3
    say(ok, line)

# ---- a normal map in BC5: red and green
for name in ['assets/people/R_Female_Adult_14.glb#2'] if not sys.argv[1:] else []:
    try:
        im = load(name).convert('RGBA')
    except Exception as e:  # noqa: BLE001
        say(False, f'{name}: {e}')
        continue
    px = np.asarray(im.crop((0, 0, min(im.size[0], 1024), min(im.size[1], 1024)))).copy()
    px[..., 3] = 255
    back, own = encode(px, 'bc5')
    d = (px[..., :2].astype(np.float64) - back[..., :2]) ** 2
    got = 99.0 if d.sum() == 0 else 10 * np.log10(255 * 255 / d.mean())
    # (Pillow divides a step's value as a whole number where a GPU keeps the fraction the encoder counts with: some decibels apart at this height, and still far over the floor)
    say(got >= 40 and abs(got - own['db']) < 4, f"{name} {px.shape[1]}x{px.shape[0]} as BC5: red and green {got:.1f} dB (counted {own['db']:.1f})")

sys.exit(1 if bad else 0)
