"""The skyline the loading screen draws (web/skyline.js): the map's own rooftops as a few lines of numbers.

Seen from the air south-west of the Scramble, as the opening film first sees the district, the buildings are sorted
into bands by how far they stand from the eye, and each band keeps one number for each of BINS directions: how high
on the picture its tallest roof reaches there. The page draws each band as a silhouette, the far ones pale and the
near ones dark, and lights windows in them; so the first thing on screen is Shibuya's own outline, from a file of a
few kilobytes fetched before the map is.

    python pipeline/skyline.py [--city shibuya]      # writes web/data/<city>/skyline.json
    python pipeline/skyline.py --check                # fails if the file is not what the buildings give now

Run it after a step that writes buildings.json (docs/CHECKS.md).
"""
import argparse
import base64
import json
import math
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BINS = 768
HALF = math.tan(math.radians(50))          # half the picture's width, as a tangent (a wide screen sees this much)
Y0, Y1 = -1.05, 0.12                       # the tangents of the lowest and highest line a roof is kept at
BANDS = [0, 420, 640, 900, 1300, 2200, 1e9]  # metres from the eye: six bands, the nearest first
AZ, DIST, UP = 222.0, 640.0, 170.0         # the eye: this bearing from the Scramble, this far, this high over its ground


def build(city):
    b = json.load(open(os.path.join(ROOT, 'web', 'data', city, 'buildings.json'), encoding='utf8'))
    cfg = json.load(open(os.path.join(ROOT, 'cities', city, 'city.json'), encoding='utf8'))
    at = (cfg['game'].get('story') or {}).get('at') or cfg['game']['start']['at']
    cx, cy = at[0], at[1]
    a = math.radians(AZ)
    ex, ey = cx + math.sin(a) * DIST, cy + math.cos(a) * DIST
    fx, fy = (cx - ex) / DIST, (cy - ey) / DIST          # forward, towards the Scramble
    rx, ry = fy, -fx                                      # right
    ground = None
    lay = [[0] * BINS for _ in range(len(BANDS) - 1)]
    for s in b['s']:
        base, top, ring = s[1] / 10, s[3] / 10, s[4]
        if ground is None or (abs(ring[0] / 10 - cx) < 60 and abs(ring[1] / 10 - cy) < 60):
            ground = base if ground is None else min(ground, base)
    eye = (ground or 0) + UP
    for s in b['s']:
        base, top, ring = s[1] / 10, s[3] / 10, s[4]
        xs, ys, near = [], [], 1e9
        for k in range(0, len(ring), 2):
            dx, dy = ring[k] / 10 - ex, ring[k + 1] / 10 - ey
            f = dx * fx + dy * fy
            if f < 30:
                xs = []
                break
            xs.append((dx * rx + dy * ry) / f)
            ys.append((base + top - eye) / f)
            near = min(near, f)
        if not xs or max(xs) < -HALF or min(xs) > HALF:
            continue
        band = next(i for i in range(len(BANDS) - 1) if near < BANDS[i + 1])
        y = max(ys)
        v = max(1, min(255, round((y - Y0) / (Y1 - Y0) * 255)))
        i0 = max(0, int((min(xs) + HALF) / (2 * HALF) * BINS))
        i1 = min(BINS - 1, int((max(xs) + HALF) / (2 * HALF) * BINS))
        for i in range(i0, i1 + 1):
            if v > lay[band][i]:
                lay[band][i] = v
    return {'note': 'pipeline/skyline.py: the rooftops of each band of distance, nearest first, as the loader draws them (web/skyline.js)',
            'bins': BINS, 'half': round(HALF, 4), 'y0': Y0, 'y1': Y1,
            'layers': [base64.b64encode(bytes(l)).decode() for l in lay]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--city', default='shibuya')
    ap.add_argument('--check', action='store_true')
    a = ap.parse_args()
    out = os.path.join(ROOT, 'web', 'data', a.city, 'skyline.json')
    text = json.dumps(build(a.city), ensure_ascii=False, separators=(',', ':')) + '\n'
    if a.check:
        if not os.path.exists(out) or open(out, encoding='utf8').read() != text:
            print(f'FAIL {out} is not what buildings.json gives now: python pipeline/skyline.py')
            sys.exit(1)
        print('ok   skyline the loader\'s skyline is the map\'s')
        return
    open(out, 'w', encoding='utf8').write(text)
    lay = json.loads(text)['layers']
    print(f'{out}: {len(text)} bytes; roofs kept in each band: {[sum(1 for c in base64.b64decode(l) if c) for l in lay]}')


if __name__ == '__main__':
    main()
