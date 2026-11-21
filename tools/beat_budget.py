#!/usr/bin/env python3
"""The story's beats against their budgets (docs/PERFORMANCE.md, "A budget for every beat").

tools/story_play.js BUDGET=file writes a line for every still: what that frame asked of the GPU (draw calls, triangles,
full-screen passes, the pixels the passes shade and the scene's targets hold) and what WebGL held (textures, buffers,
renderbuffers). A beat is one of the episode's frames (and the title before the first); its cost is the heaviest of
its stills (of what a frame draws, the second heaviest: a thing drawn once is not the beat's cost). The budgets are in tools/budgets/<map>.json, a set for the desktop's tier and one for a phone's.

  tools/beat_budget.py check <samples.jsonl> <desktop|phone> [--map shibuya]   exit 1 on a beat over its budget
  tools/beat_budget.py set   <samples.jsonl> <desktop|phone> [--margin 0.1]    the budgets from a play (only its beats)
                                                    --down: only where the play is under the budget it has (after a cut)
  tools/beat_budget.py table [--map shibuya]                                    the budgets as a table for the docs
  tools/beat_budget.py show  <samples.jsonl>                                    a play's beats as measured

A budget is a ceiling a little above what the beat costs today, so that a change that adds to a beat fails here and
is either paid for or agreed (set again, with the reason in the commit). It only goes up on purpose.
"""
import json, math, sys, os

HERE = os.path.dirname(os.path.abspath(__file__))
# what is held to a budget, with the room a play's own variation needs (the crowd and the traffic differ from play to play)
GATED = {'draws': 0.12, 'tris': 0.12, 'passes': 0.0, 'px_x': 0.05, 'tex_mb': 0.03, 'gpu_mb': 0.03}
ONCE = ('draws', 'tris', 'passes', 'px_x')   # what one frame draws: the second heaviest still of a beat (beats(), below)
SHOWN = ['draws', 'tris', 'passes', 'px_x', 'tex_n', 'tex_mb', 'buf_mb', 'gpu_mb', 'js_ms']
NAMES = {'draws': 'draws', 'tris': 'triangles', 'passes': 'passes', 'px_x': 'pixels shaded, canvases', 'tex_n': 'textures', 'tex_mb': 'textures, MB',
         'buf_mb': 'buffers, MB', 'gpu_mb': 'GPU memory, MB', 'js_ms': 'script, ms'}


def beat_of(s):
    return 'title' if s['still'] == '00-title' else 'frame %d' % (s['fi'] + 1)


def beats(path):
    """each beat's heaviest still, measure by measure. For what a frame draws (not what is held), the second heaviest
    where a beat has three stills or more: work done once (the mirror's warm-up drawing the scene again as the game
    settles, a cache drawn afresh) falls in whichever frame it falls in and is not what the beat costs; a cost that
    stays shows in more stills than one."""
    out, meta, seen = {}, {}, {}
    for line in open(path):
        line = line.strip()
        if not line:
            continue
        s = json.loads(line)
        cv = s.get('canvas') or [1, 1]
        # the pixels the frame shades at least once, in canvases: every full-screen pass and every target the scene is drawn into
        s['px_x'] = round((s.get('pass_px', 0) + s.get('scene_px', 0)) / max(1, cv[0] * cv[1]), 2)
        b = out.setdefault(beat_of(s), {})
        for k in SHOWN:
            v = s.get(k)
            if v is None:
                continue
            seen.setdefault((beat_of(s), k), []).append((v, s['still']))
            if k not in b or v > b[k][0]:
                b[k] = (v, s['still'])
        meta = {'size': s.get('size'), 'tier': s.get('tier'), 'canvas': cv}
    for (n, k), vs in seen.items():
        if k in ONCE and len(vs) >= 3:
            out[n][k] = sorted(vs, key=lambda x: -x[0])[1]
    return out, meta


def order(names):
    return sorted(names, key=lambda n: (0, 0) if n == 'title' else (1, int(n.split()[1])))


def load(m):
    p = os.path.join(HERE, 'budgets', m + '.json')
    return p, (json.load(open(p)) if os.path.exists(p) else {})


def fmt(k, v):
    if k == 'tris':
        return '%.2f M' % (v / 1e6)
    return ('%g' % v) if isinstance(v, float) else str(v)


def main(a):
    m = 'shibuya'
    if '--map' in a:
        i = a.index('--map'); m = a[i + 1]; del a[i:i + 2]
    margin = None
    if '--margin' in a:
        i = a.index('--margin'); margin = float(a[i + 1]); del a[i:i + 2]
    down = '--down' in a
    if down:
        a.remove('--down')
    if not a:
        print(__doc__); return 2
    cmd = a[0]
    path, B = load(m)
    if cmd == 'table':
        for dev in ('phone', 'desktop'):
            d = B.get(dev)
            if not d:
                continue
            print('\n%s (%s, the %s tier, canvas %s x %s):\n' % (dev, d.get('size'), d.get('tier'), *d.get('canvas', ['?', '?'])))
            ks = [k for k in SHOWN if any(k in b for b in d['beats'].values())]
            print('| beat | ' + ' | '.join(NAMES[k] for k in ks) + ' |')
            print('|---|' + '---|' * len(ks))
            for n in order(d['beats']):
                b = d['beats'][n]
                print('| %s | ' % n + ' | '.join(fmt(k, b[k]) if k in b else '' for k in ks) + ' |')
        return 0
    got, meta = beats(a[1])
    if cmd == 'show':
        for n in order(got):
            print(n.ljust(8), '  '.join('%s %s' % (k, fmt(k, got[n][k][0])) for k in SHOWN if k in got[n]))
        return 0
    dev = a[2]
    if cmd == 'set':
        d = B.setdefault(dev, {'beats': {}})
        d.update(meta)
        for n in got:
            b = d['beats'].setdefault(n, {})
            for k in SHOWN:
                if k not in got[n]:
                    continue
                v = got[n][k][0]
                if k in GATED:
                    r = GATED[k] if margin is None else (0.0 if GATED[k] == 0 else margin)
                    v = v * (1 + r)
                    v = int(math.ceil(v / 1000.0) * 1000) if k == 'tris' else int(math.ceil(v)) if k in ('draws', 'passes', 'tex_mb', 'gpu_mb') else round(v + 0.005, 2)
                b[k] = min(v, b[k]) if down and k in b and k in GATED else v
        d['beats'] = {n: d['beats'][n] for n in order(d['beats'])}
        os.makedirs(os.path.dirname(path), exist_ok=True)
        json.dump(B, open(path, 'w'), indent=1); open(path, 'a').write('\n')
        print('set %d beats of %s in %s' % (len(got), dev, os.path.relpath(path)))
        return 0
    if cmd == 'check':
        d = B.get(dev)
        if not d:
            print('FAIL no budgets for %s in %s' % (dev, path)); return 1
        bad = 0
        for n in order(got):
            b = d['beats'].get(n)
            if not b:
                print('FAIL %s: no budget for this beat (tools/beat_budget.py set, with the play that measured it)' % n); bad += 1; continue
            over = []
            for k in GATED:
                if k in got[n] and k in b and got[n][k][0] > b[k]:
                    over.append('%s %s over %s at %s' % (NAMES[k], fmt(k, got[n][k][0]), fmt(k, b[k]), got[n][k][1]))
            if over:
                bad += 1; print('FAIL %s: %s' % (n, '; '.join(over)))
            else:
                print('ok   %s: %s' % (n, ', '.join('%s %s of %s' % (k, fmt(k, got[n][k][0]), fmt(k, b[k])) for k in ('draws', 'tris', 'passes', 'gpu_mb') if k in got[n] and k in b)))
        return 1 if bad else 0
    print(__doc__); return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
