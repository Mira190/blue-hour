#!/usr/bin/env python3
"""The story's hitches, beat by beat (issue 220: a hitch is a single long frame, which a player feels more than a steady
low rate; each beat's longest frame and its p99 are recorded on a phone's tier, to be held as the budgets are once a
week of them shows what a play differs from itself by).

tools/story_play.js HITCH=file (with BUDGET and DRAW=n) writes a line a still: the game's frames since the one before,
each [its own cost in ms, drawn (1) or not (0) or drawn whole for the still (2), programs linked in it, MB sent to the
GPU in it, and for a frame over 100 ms that linked, the programs' names]. A frame's own cost is the time its callbacks took on the page, not the wall's, which a software renderer
stretches; a frame not drawn has no draw calls, so what is read is the frame's script and what the GPU is given, which
is where the hitches of #205 (programs linked on first draw), #192 (the cells' uploads) and #206 (costs that grow) are.
The frames drawn whole for a still are the harness's and are left out.

  tools/beat_hitch.py show <hitch.jsonl>...      each beat: frames, p50, p99, the longest and what was in it
  tools/beat_hitch.py line <hitch.jsonl>...      the same, one line for a check's log
"""
import json, sys


def beat_of(s):
    return 'title' if s.get('still') == '00-title' or s.get('fi', -1) < 0 else 'frame %d' % (s['fi'] + 1)


def beats(paths):
    out = {}
    for path in paths:
        for line in open(path):
            line = line.strip()
            if not line:
                continue
            s = json.loads(line)
            b = out.setdefault(beat_of(s), [])
            b.extend(f for f in s.get('fr', []) if f[1] != 2)
    return out


def pct(v, q):
    if not v:
        return 0.0
    v = sorted(v)
    return v[min(len(v) - 1, int(q * len(v)))]


def summary(fr):
    ms = [f[0] for f in fr]
    top = max(fr, key=lambda f: f[0]) if fr else [0, 0, 0, 0]
    return {'n': len(fr), 'p50': pct(ms, 0.5), 'p99': pct(ms, 0.99), 'max': top[0], 'max_links': top[2], 'max_mb': top[3],
            'names': top[4] if len(top) > 4 else [], 'over100': sum(1 for m in ms if m > 100), 'links': sum(f[2] for f in fr), 'mb': round(sum(f[3] for f in fr), 1)}


def order(k):
    return -1 if k == 'title' else int(k.split()[1])


def main():
    if len(sys.argv) < 3 or sys.argv[1] not in ('show', 'line'):
        print(__doc__); sys.exit(2)
    B = beats(sys.argv[2:])
    rows = [(k, summary(B[k])) for k in sorted(B, key=order)]
    if sys.argv[1] == 'line':
        print('; '.join('%s p99 %.0f ms, longest %.0f%s' % (k, s['p99'], s['max'],
              ' (%d linked, %.1f MB)' % (s['max_links'], s['max_mb']) if s['max_links'] or s['max_mb'] >= 0.5 else '') for k, s in rows if s['n']))
        return
    print('%-9s %7s %7s %7s %8s  %s' % ('beat', 'frames', 'p50', 'p99', 'longest', 'in the longest; over 100 ms; linked and MB in the beat'))
    for k, s in rows:
        print('%-9s %7d %7.1f %7.1f %8.1f  %d linked, %.2f MB; %d; %d, %.1f MB' % (k, s['n'], s['p50'], s['p99'], s['max'], s['max_links'], s['max_mb'], s['over100'], s['links'], s['mb']))
        if s['names']:
            print('%-9s linked in the longest: %s' % ('', ', '.join(s['names'])))


if __name__ == '__main__':
    main()
