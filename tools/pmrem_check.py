#!/usr/bin/env python3
"""No picture of the page's goes through a sky-light generator out of the page's reach (main red on frame 5, run 529).

three.js turns an environment map into the form its materials sample (a PMREM) with a generator of the renderer's own
when a material is handed a cube or a panorama as its envMap, or a texture is marked needsPMREMUpdate. That generator
keeps a blur target the size of the map (768 x 1024 in half floats, 6 MB for a cube 256 a side) for as long as the
page lives, and nothing in the page can reach it to let it go: the roof's glass cube went that way, and the target stood
idle from frame 4's lift ride to the last card, frame 5's flight over its budget on a desktop. The world's own generator
(web/world.js pmrem) lets its blur target go once a map is made (envSpare, #162); every map is made with it
(web/game/hero.js probeMap).

So, in the page's own scripts (web/, not web/vendor/):
  - no texture is marked needsPMREMUpdate;
  - a PMREMGenerator is made only in web/world.js, once.
Prints `ok` or one `FAIL` line for each place.
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
WEB = ROOT / 'web'


def strip_comments(src):
    # (the rules are about code: a line's // comment and a /* */ block are prose that may name the thing)
    src = re.sub(r'/\*.*?\*/', lambda m: '\n' * m.group(0).count('\n'), src, flags=re.S)
    return [re.sub(r'(^|[^:\\])//.*$', r'\1', line) for line in src.split('\n')]


def main():
    bad = []
    makers = []
    for f in sorted(WEB.rglob('*.js')):
        rel = f.relative_to(ROOT).as_posix()
        if rel.startswith('web/vendor/'):
            continue
        for n, line in enumerate(strip_comments(f.read_text(encoding='utf-8', errors='replace')), 1):
            if re.search(r'\.needsPMREMUpdate\s*=(?!=)', line):
                bad.append(f'{rel}:{n}: a texture marked needsPMREMUpdate: three.js makes its map with a generator of its own whose 6 MB blur target is never let go; make it with the world\'s (Wd.pmrem, then Wd.envSpare: web/game/hero.js probeMap)')
            if re.search(r'new\s+(THREE\.)?PMREMGenerator\s*\(', line):
                makers.append(f'{rel}:{n}')
    for m in makers:
        if not m.startswith('web/world.js:'):
            bad.append(f'{m}: a PMREMGenerator of its own: the world\'s (web/world.js pmrem) lets its blur target go once a map is made; use it')
    if len([m for m in makers if m.startswith('web/world.js:')]) > 1:
        bad.append(f'web/world.js: {len(makers)} PMREMGenerators made: one, whose blur target envSpare lets go')
    for b in bad:
        print('FAIL ' + b)
    if not bad:
        print('ok   pmrem: every sky-light map made by the world\'s generator, its blur target let go')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
