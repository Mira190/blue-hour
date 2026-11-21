#!/usr/bin/env python3
"""Pixel diff of stills (#78): each pair of the PNGs given, or of every onetest-*.png in a folder
(tools/story_play.js ONETEST=still): how many pixels differ, by how much at most, and where.
  python3 tools/still_diff.py <dir> | <a.png> <b.png> ...   [--heat out.png: the first pair side by side with its difference]"""
import itertools, os, sys
from PIL import Image, ImageChops

args = [a for a in sys.argv[1:] if a != '--heat']
heat = sys.argv[sys.argv.index('--heat') + 1] if '--heat' in sys.argv else None
if heat: args.remove(heat)
files = sorted(os.path.join(args[0], f) for f in os.listdir(args[0]) if f.startswith('onetest-') and f.endswith('.png')) if len(args) == 1 and os.path.isdir(args[0]) else args
im = {f: Image.open(f).convert('RGB') for f in files}
for k, (a, b) in enumerate(itertools.combinations(files, 2)):
    d = ImageChops.difference(im[a], im[b]).convert('L')
    h = d.histogram()
    n = sum(h[1:]); top = max((i for i, v in enumerate(h) if v), default=0); over = sum(h[9:])
    print(f'{os.path.basename(a)} {os.path.basename(b)}: {n} pixels differ ({100 * n / (d.width * d.height):.2f}%), {over} by more than 8, at most {top}; {d.getbbox()}')
    if heat and k == 0:
        W, H = im[a].size; s = Image.new('RGB', (W * 3, H)); s.paste(im[a], (0, 0)); s.paste(im[b], (W, 0)); s.paste(d.point(lambda v: min(255, v * 12)).convert('RGB'), (2 * W, 0)); s.save(heat)
