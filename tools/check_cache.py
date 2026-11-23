#!/usr/bin/env python3
"""What each of tools/check.sh's browser checks read, and a pass kept for as long as all of it is as it was
(docs/CHECKS.md, "The router and the cache").

A browser check reads three things: its own harness (tools/<check>.js and the modules it requires), the function
tools/check.sh runs it with, and the files the page fetched from the server check.sh started. The server's log says which files those were, so
after a pass this keeps, in the clone's git directory, the list of them and a hash of their bytes. The next run asks
first: when every file on the list (and every harness file, and the settings that steer the check) is byte for byte
as it was, the check would play the same page and is not run again. A file the page asked for and did not get (a 404)
is on the list as missing, so a file added there later counts as a change. A file edited while the check ran keeps
the pass from being kept.

And when something it read has changed, the pass may still stand (docs/CHECKS.md, "Checks by reach"): a check is worth
its time only where the change can alter its result. With the pass are kept each file's bytes (as a git blob) and, for
the page's scripts, which of their functions the check ran (tools/browser_watch.js, COVER). A changed file does not
reach the check when every change in it since the pass is
  - main's: the lines are as origin/main has them now, in a function this branch has not changed against main (main's
    own checks play main's change with this branch once it lands, and only a commit they pass is published);
  - or only comments and spacing;
  - or inside a function the check never ran, which is still that one whole function;
  - or a new function of its own, by a name nothing in the file as it was says.
Anything else reaches it, and `hit` says what: the function that ran and where it changed.
  python3 tools/check_cache.py hit <target>                       # exit 0 and the pass's commit when it holds
  python3 tools/check_cache.py save <target> <server.log> <line> <t0> [seconds] [cover dir]   # after a pass: what it read since
  python3 tools/check_cache.py drop <target>                      # after a failure
  python3 tools/check_cache.py users <tools/file.js>              # the targets whose harness requires it
  python3 tools/check_cache.py files <target>                     # what the last pass read
  python3 tools/check_cache.py why <target>                       # each file changed since the pass, and whether it reaches
  python3 tools/check_cache.py ran <target> <web/file.js> [name]  # the functions of a script the pass ran (or did not)
"""
import gzip
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from urllib.parse import unquote

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
# each target's harness: the scripts tools/check.sh runs for it (their requires follow), and what else it reads itself
HARNESS = {
    'story': ['tools/story_play.js'], 'story1': ['tools/story_play.js'], 'story2': ['tools/story_play.js'],
    'story3': ['tools/story_play.js'], 'budget': ['tools/story_play.js'], 'budget1': ['tools/story_play.js'],
    'budget2': ['tools/story_play.js'], 'budget3': ['tools/story_play.js'],
    'storyp': ['tools/story_play.js'], 'storyl': ['tools/story_play.js'],
    'guide': ['tools/guide_way.js', 'tools/guide_body.js'], 'guide1': ['tools/guide_way.js'],
    'guide2': ['tools/guide_body.js'],
    'walk': ['tools/walk_play.js'], 'walk1': ['tools/walk_play.js'], 'walk2': ['tools/walk_play.js'],
    'ride': ['tools/ride_people.js'], 'roads': ['tools/road_traffic_watch.js', 'tools/road_drive.js', 'tools/junction_flow.js'], 'mem': ['tools/mem_check.js', 'tools/lost_check.js', 'tools/glcare_phone.js', 'tools/killed_check.js', 'tools/ctx_beats.js'], 'look': ['tools/look_check.js'],
    'audio': ['tools/reverb_check.js', 'tools/audio_graph_check.js', 'tools/audio_shed_check.js', 'tools/sound_places.js', 'tools/phone_audio.js'],
    'clip': ['tools/clip_check.js'], 'gl': ['tools/gl_error_probe.js', 'tools/sampler_probe.js'],
    'touch': ['tools/touch_check.js'], 'astc': ['tools/astc_check.js'], 'hold': ['tools/hold_check.js', 'tools/hold_depth.js'], 'game': ['tools/game_check.js'],
    'launch': ['tools/launch_check.js'],
}
EXTRA = {k: ['cities/shibuya/city.json'] for k in ('story', 'story1', 'story2', 'story3', 'budget', 'budget1', 'budget2', 'budget3', 'storyp', 'storyl')}  # (story_play.js reads it)
EXTRA['launch'] = ['vercel.json', 'web/index.html', 'web/fonts.css', 'web/game/story.css', 'web/game/story.js', 'web/data/shibuya/game.json']  # (read, and stamped, by the tool itself)
# the settings a run takes from the environment that change what it plays or measures (CHECK_FN: a hash of the
# functions tools/check.sh runs the target with)
ENV = ['CHECK_FN', 'GAME_TIME', 'DRAW', 'GPU', 'AT', 'PIN', 'TIER', 'QUERY', 'LIMIT', 'MEM_GPU', 'MEM_HEAP', 'MEM_DESK', 'LOOK_BASE',
       'TOUCH', 'SLIP', 'SPEND', 'CHOOSE', 'ACCUSE', 'BACKTO', 'PLAYER',
       'STILLS', 'Q', 'WALK', 'START']
LOG = re.compile(r'"(?:GET|HEAD) (\S+) HTTP/[\d.]+" (\d{3})')


def git_dir():
    return subprocess.run(['git', 'rev-parse', '--absolute-git-dir'], cwd=ROOT, capture_output=True, text=True).stdout.strip()


def store(target):
    d = os.environ.get('CHECK_STORE') or os.path.join(git_dir(), 'oe-check-cache')
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, f'{target}.json')


# Main's passes, for a clone that has none of its own (docs/CHECKS.md, "Main's passes, shared"): main's full tier
# keeps each shard's pass as a session keeps its own (what it read, as git blobs' ids, and the functions it ran) and
# pushes them to the branch below, one small file a check. A fresh session starts from them: a check is played only
# where this branch's own change reaches it. The bytes a pass read are main's commits, which the clone has.
PASSES = os.environ.get('CHECK_PASSES_REF', 'origin/check-passes')


def passes(target):
    """The passes of a check to judge by: this clone's own first, then main's."""
    out = []
    try:
        out.append(('', json.load(open(store(target)))))
    except (OSError, ValueError):
        pass
    if os.environ.get('CHECK_SHARED', '1') != '0' and not os.environ.get('CHECK_STORE'):
        raw = git('show', f'{PASSES}:{target}.json.gz')
        if raw:
            try:
                out.append(("main's ", json.loads(gzip.decompress(raw))))
            except (OSError, ValueError):
                pass
    return out


def closure(scripts):
    """The harness files: the scripts and every ./module they require, transitively."""
    seen, todo = set(), list(scripts)
    while todo:
        f = todo.pop()
        if f in seen or not os.path.exists(os.path.join(ROOT, f)):
            continue
        seen.add(f)
        src = open(os.path.join(ROOT, f), encoding='utf8', errors='replace').read()
        for m in re.finditer(r"require\(\s*['\"](\.{1,2}/[^'\"]+)['\"]\s*\)", src):
            p = os.path.normpath(os.path.join(os.path.dirname(f), m.group(1)))
            todo.append(p if p.endswith('.js') or p.endswith('.json') else p + '.js')
    return sorted(seen)


def harness(target):
    return closure(HARNESS.get(target, [])) + EXTRA.get(target, [])


def digest(path):
    p = os.path.join(ROOT, path)
    if not os.path.isfile(p):
        return 'missing'
    h = hashlib.sha1()
    with open(p, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()


def git(*a, data=None):
    r = subprocess.run(['git', *a], cwd=ROOT, capture_output=True, input=data)
    return r.stdout if r.returncode == 0 else None


def blob_id(path):
    """The file's bytes by the name git gives them (a blob's id), or 'missing'."""
    p = os.path.join(ROOT, path)
    if not os.path.isfile(p):
        return 'missing'
    data = open(p, 'rb').read()
    return hashlib.sha1(b'blob %d\0' % len(data) + data).hexdigest()


def keep_blobs(paths):
    """Each file written into the clone's object store, so that it can be read back as it was: {path: blob id}."""
    there = [f for f in paths if os.path.isfile(os.path.join(ROOT, f))]
    out = {f: 'missing' for f in paths}
    ids = (git('hash-object', '-w', '--stdin-paths', data='\n'.join(there).encode()) or b'').decode().split()
    if len(ids) == len(there):
        out.update(zip(there, ids))
    return out


def worker_scripts():
    """Scripts a worker runs too (a worker's own script, and what it imports): the page's count says nothing of what
    ran there, so these are judged by their bytes alone."""
    out = set()
    for d in ('web', 'web/game'):
        for n in os.listdir(os.path.join(ROOT, d)):
            if not n.endswith('.js'):
                continue
            src = open(os.path.join(ROOT, d, n), encoding='utf8', errors='replace').read()
            for m in re.finditer(r"importScripts\(([^)]*)\)", src):
                for q in re.findall(r"['\"]([^'\"]+)['\"]", m.group(1)):
                    out.add(os.path.normpath(os.path.join(d, q)))
            for m in re.finditer(r"new (?:Shared)?Worker\(\s*(?:new URL\(\s*)?['\"]([^'\"]+)['\"]", src):
                out.add(os.path.normpath(os.path.join('web', m.group(1))))
    return out


def read_cover(cover_dir):
    """What the browsers of a check wrote (tools/browser_watch.js): {web/path.js: [[start, end, ran, name], ...]}, a
    function ran if it ran in any of them. None when a browser left no file (closed another way): then no function of
    the check is known not to have run."""
    if not cover_dir or not os.path.isdir(cover_dir):
        return None
    names = os.listdir(cover_dir)
    files = [n for n in names if n.startswith('cover-')]
    if not files or len(files) != len([n for n in names if n.startswith('launch-')]):
        return None
    skip, out = worker_scripts(), {}
    for n in files:
        for url, fns in json.load(open(os.path.join(cover_dir, n))).items():
            f = os.path.normpath('web/' + unquote(url))
            if f in skip or not f.endswith('.js'):
                continue
            m = out.setdefault(f, {})
            for s, e, ran, name in fns:
                was = m.get((s, e))
                m[(s, e)] = [s, e, 1 if ran or (was and was[2]) else 0, name]
    return {f: sorted(m.values(), key=lambda x: (x[0], -x[1])) for f, m in out.items()}


class Src:
    """A source as V8 counts it: in UTF-16 units."""
    def __init__(self, data):
        self.text = data.decode('utf8', errors='replace')
        self.b = self.text.encode('utf-16-le', errors='surrogatepass')
        self.lines = self.text.split('\n')
        self.off = [0]
        for l in self.lines:
            self.off.append(self.off[-1] + len(l.encode('utf-16-le', errors='surrogatepass')) // 2 + 1)

    def cut(self, s, e):
        return self.b[2 * s:2 * e].decode('utf-16-le', errors='replace')


def hunks(a, b):
    """git's line diff of two blobs with no context: (old line, old count, new line, new count), lines from 1; a
    count of 0 is a place after that line."""
    out = git('diff', '-U0', '--no-color', '--no-ext-diff', a, b)
    res = []
    for m in re.finditer(r'^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@', (out or b'').decode('utf8', errors='replace'), re.M):
        res.append((int(m.group(1)), int(m.group(2) or 1), int(m.group(3)), int(m.group(4) or 1)))
    return res


def span(line, n):
    """A hunk's side as places between lines: place i is after line i."""
    return (line - 1, line + n - 1) if n else (line, line)


def chars(old, new, h):
    """A line hunk narrowed to the characters that differ: (old start, old end, new start, new end), in UTF-16 units."""
    a, na, c, nc = h
    os_, oe = (old.off[a - 1], old.off[a - 1 + na]) if na else (old.off[a], old.off[a])
    ns, ne = (new.off[c - 1], new.off[c - 1 + nc]) if nc else (new.off[c], new.off[c])
    oe, ne = min(oe, len(old.b) // 2), min(ne, len(new.b) // 2)
    x, y = old.b[2 * os_:2 * oe], new.b[2 * ns:2 * ne]
    k = 0
    while k + 2 <= min(len(x), len(y)) and x[k:k + 2] == y[k:k + 2]:
        k += 2
    j = 0
    while j + 2 <= min(len(x), len(y)) - k and x[len(x) - j - 2:len(x) - j] == y[len(y) - j - 2:len(y) - j]:
        j += 2
    return (os_ + k // 2, oe - j // 2, ns + k // 2, ne - j // 2)


def node(args, payload):
    env = dict(os.environ)
    if not env.get('NODE_PATH'):
        env['NODE_PATH'] = subprocess.run(['npm', 'root', '-g'], capture_output=True, text=True).stdout.strip()
    r = subprocess.run(['node', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fn_whole.js'), *args], input=json.dumps(payload).encode(),
                       capture_output=True, env=env)
    try:
        return json.loads(r.stdout)
    except ValueError:
        return [False] * len(payload)


def inner(fns, s, e, ran=None):
    """The smallest function holding [s, e) (a place, s == e, strictly inside it); of those that ran, or did not."""
    best = None
    for f in fns:
        if ran is not None and bool(f[2]) != ran:
            continue
        ok = (f[0] < s < f[1]) if s == e else (f[0] <= s and e <= f[1])
        if ok and (best is None or f[1] - f[0] < best[1] - best[0]):
            best = f
    return best


def where(src, off):
    """The line of a place in a source, from 1."""
    lo, hi = 0, len(src.off) - 1
    while lo < hi:
        m = (lo + hi + 1) // 2
        if src.off[m] <= off:
            lo = m
        else:
            hi = m - 1
    return lo + 1


def reach(path, was, fns):
    """Whether what changed in a file since a pass can alter the check that passed: (reaches, why).
    `was` is the blob the check read, `fns` the functions of it the check ran or did not (None: not known)."""
    now = blob_id(path)
    if was == 'missing':
        return True, f'{path} is there now (the page asked for it and did not get it)'
    if now == 'missing':
        return True, f'{path} is gone'
    main = (git('rev-parse', '-q', '--verify', f'origin/main:{path}') or b'').decode().strip()
    if main == now:
        return False, f'{path}: main\'s, as main has it'
    old_data, now_data = git('cat-file', 'blob', was), open(os.path.join(ROOT, path), 'rb').read()
    if old_data is None:
        return True, f'{path} changed (as it was is no longer in this clone)'
    if b'\0' in now_data[:8000] or b'\0' in old_data[:8000] or path.endswith(('.bin', '.glb', '.webp', '.png', '.jpg', '.mp3')):
        return True, f'{path} changed'
    keep_blobs([path])
    old, new = Src(old_data), Src(now_data)
    since = hunks(was, now)
    # what this branch has that main has not, as places in the file as it is now
    own = [span(c, nc) for _, _, c, nc in hunks(main, now)] if main else [(0, len(new.lines))]
    js = path.endswith('.js') and fns is not None and not old.text.startswith('\ufeff')
    mains, mine = [], []
    for h in since:
        lo, hi = span(h[2], h[3])
        (mine if any(lo <= b and a <= hi for a, b in own) else mains).append(h)
    # main's change stands apart only in a function this branch has not changed against main
    if js and mains and own:
        cs = [chars(old, new, h) for h in since]

        def to_new(o):
            d = 0
            for a, b, c, e in cs:
                if b <= o:
                    d = e - b
                elif a < o:
                    return None
            return o + d
        # (a closure that holds a script's functions, eight or more of them, is a scope as a file is, not a function: two
        # of its own statements are no nearer each other than two of its functions; game.js is one such, 8,700 lines)
        scope = {(f[0], f[1]) for f in fns if sum(1 for h in fns if f[0] <= h[0] and h[1] <= f[1]) > 8}
        fns_ = [f for f in fns if (f[0], f[1]) not in scope]
        own_fns, spots = set(), [(to_new(f[0]), to_new(f[1]), f) for f in fns_]
        for a, b in own:
            s_, e_ = new.off[min(a, len(new.off) - 1)], new.off[min(b, len(new.off) - 1)]
            best = None
            for ns, ne, f in spots:   # (a function whose ends main moved has no place to compare: then the whole script's)
                if ns is not None and ne is not None and ns <= s_ and e_ <= ne and (best is None or f[1] - f[0] < best[1] - best[0]):
                    best = f
            if best:
                own_fns.add((best[0], best[1]))
            elif not scope:
                own_fns.add(None)
        for h in list(mains):
            c = chars(old, new, h)
            f = inner(fns_, c[0], c[1])
            if None in own_fns or (f and (f[0], f[1]) in own_fns):
                mains.remove(h)
                mine.append(h)
    said = []
    if mains:
        said.append(f'{len(mains)} change{"s" if len(mains) > 1 else ""} main\'s')
    if not mine:
        return False, f'{path}: {", ".join(said)}'
    if not js:
        h = mine[0]
        return True, f'{path} changed at line {h[2]}' + (f' ({len(mine)} places)' if len(mine) > 1 else '')
    # comments and spacing only: the file as it was with this branch's changes alone laid in
    every = sorted(chars(old, new, h) for h in since)
    cs = sorted(chars(old, new, h) for h in mine)
    laid, at = [], 0
    for a, b, c, e in cs:
        laid.append(old.cut(at, a)); laid.append(new.cut(c, e)); at = b
    laid.append(old.cut(at, len(old.b) // 2))
    laid = ''.join(laid)
    if node(['same'], [[old.text, laid]])[0]:
        return False, f'{path}: {", ".join(said + ["comments and spacing"])}'
    # each change inside a function the check never ran, which is still one whole function; or a new function by a new name
    groups, fresh = {}, []
    for c in cs:
        f = inner(fns, c[0], c[1], ran=False)
        if f:
            groups.setdefault((f[0], f[1], f[3]), []).append(c)
            continue
        # (a new function: a diff may put it down a few characters late, its last brace taken for the one before it)
        cands = []
        for k in range(0, min(400, c[2]) + 1) if c[0] == c[1] else []:
            if k and new.cut(c[2] - k, c[2] - k + 1) != new.cut(c[3] - k, c[3] - k + 1):
                break
            body = re.sub(r'^(\s*//[^\n]*\n|\s*\n)*', '', new.cut(c[2] - k, c[3] - k)).strip()
            m = re.match(r'(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)', body)
            if m and body.endswith('}') and not re.search(r'(?<![\w$])' + re.escape(m.group(1)) + r'(?![\w$])', old.text):
                cands.append((body, m.group(1)))
        good = [x for x, ok_ in zip(cands, node([], [b_ for b_, _ in cands])) if ok_] if cands else []
        if good:
            fresh.append((c, good[0][0], good[0][1]))
            continue
        g = inner(fns, c[0], c[1], ran=True)
        return True, (f'{path}:{where(new, c[2])} changed in {g[3] or "a function"}(), which it ran' if g and g[1] - g[0] < len(old.b) // 2
                      else f'{path}:{where(new, c[2])} changed outside any function, where every check runs')
    texts, names = [], []
    head = re.compile(r'(?:async\s+)?function\s*\*?\s*[\w$]*\s*\(|(?:async\s+|get\s+|set\s+|static\s+|\*\s*)*[\w$]+\s*\(')
    for (s_, e_, name), g in groups.items():
        if any(a < s_ < b or a < e_ < b for a, b, _, _ in every):
            return True, f'{path}: {name or "a function"}() changed across its end'
        d0 = sum((e - c) - (b - a) for a, b, c, e in every if b <= s_)
        d1 = sum((e - c) - (b - a) for a, b, c, e in every if b <= e_ and not a == b == e_)
        was_, is_ = old.cut(s_, e_), new.cut(s_ + d0, e_ + d1)
        m = head.match(was_)   # (its name is the scope's, not its own: a function that never ran may still be named)
        if m and not is_.startswith(m.group(0)):
            return True, f'{path}: {name or "a function"}() changed its name or kind'
        texts.append(is_); names.append(name or 'a function')
    ok = node([], texts)
    for t, name, good in zip(texts, names, ok):
        if not good:
            return True, f'{path}: {name}() changed and is no longer one whole function where it stood'
    if groups:
        said.append(f'{", ".join(sorted(set(n for _, _, n in groups if n))[:4]) or "a function"}{" and others" if len(groups) > 4 else ""} never ran in it')
    if fresh:
        said.append(f'{", ".join(n for _, _, n in fresh[:3])} new')
    return False, f'{path}: {", ".join(said)}'


# The story's words (docs/CHECKS.md, "Checks by reach"): a frame's prose is read by the play of that frame and by
# nothing else. The packed game data every page fetches is made from game.json, which is kept with a pass as the
# pack's source; when all that differs in it is prose inside the story's frames (a string with a space in it, for
# another: not a name, a clip or an hour), the pack reaches only the checks that play those frames.
SOURCE = {'web/data/shibuya/game.bin': ('web/data/shibuya/game.json', ('story',)),
          'web/data/shibuya/d/game.bin': ('web/data/shibuya/game.json', ('story',)),
          'cities/shibuya/city.json': ('cities/shibuya/city.json', ('game', 'story'))}
FRAMES = {'story1': {0, 1, 2, 3}, 'story2': {4, 5}, 'story3': {0, 6},   # (the last card offers the first frame again)
          'budget1': {0, 1, 2, 3}, 'budget2': {4, 5}, 'budget3': {0, 6},
          'story': set(range(7)), 'budget': set(range(7)), 'storyp': set(range(7)), 'storyl': set(range(7)), 'ride': {5}}


def leaves(a, b, path, out):
    """Every place two JSON values differ: (path, was, is); a value of another shape is one difference."""
    if type(a) is not type(b):
        out.append((path, a, b))
    elif isinstance(a, dict):
        for k in sorted(set(a) | set(b)):
            if k not in a or k not in b:
                out.append((path + (k,), a.get(k), b.get(k)))
            else:
                leaves(a[k], b[k], path + (k,), out)
    elif isinstance(a, list):
        if len(a) != len(b):
            out.append((path, a, b))
        else:
            for i, (x, y) in enumerate(zip(a, b)):
                leaves(x, y, path + (i,), out)
    elif a != b:
        out.append((path, a, b))
    return out


def words(target, path, was):
    """(reaches, why) when all that changed in a pack's source is the story's prose; None when it is anything else."""
    src, at = SOURCE[path]
    try:
        old, new = json.loads(git('cat-file', 'blob', was)), json.load(open(os.path.join(ROOT, src)))
    except (TypeError, ValueError, OSError):
        return None
    diff = leaves(old, new, (), [])
    frames = set()
    for p_, a, b in diff:
        n = len(at)
        prose = isinstance(a, str) and isinstance(b, str) and ' ' in a and ' ' in b
        if not (prose and p_[:n] == at and len(p_) > n + 4 and p_[n] == 'episodes' and p_[n + 2] == 'frames' and isinstance(p_[n + 3], int)):
            return None
        frames.add(p_[n + 3])
    if not diff:
        return None
    said = f'the words of frame{"s" if len(frames) > 1 else ""} {", ".join(str(i + 1) for i in sorted(frames))}'
    if frames & FRAMES.get(target, set()):
        return True, f'{path}: {said} changed, which it plays'
    return False, f'{path}: only {said}, which it does not play'


# A model, a picture or a sound behind its contract (docs/SEAMS.md): it can change how the street looks and what a
# phone holds, which look and mem measure, and nothing a play decides. So for any other check such a file is apart
# when it is still there and, a model, gives what the code asks of it: a person's by the people's contract
# (tools/people_contract.py, with the static checks), any other by its own interface as the check's pass read it
# (tools/model_contract.py: its names, flags, attributes and where its ground lies).
SEEN_BY = ('look', 'mem')
# And what a beat draws is counted (issue 131): the story's parts hold each beat they play to its budget of draws,
# triangles, passes, pixels and GPU memory, on the desktop's tier (story1 to story3) and a phone's (budget1 to budget3;
# tools/beat_budget.py). A model or a picture one of them fetched can cost its beats more while it keeps every name the
# code asks for, so for these it is not apart: the part is played and its beats counted before the change lands. A part
# that never fetched the file has no line of it in its pass, and is kept. A sound draws nothing.
COUNTED = ('story1', 'story2', 'story3', 'budget1', 'budget2', 'budget3', 'budget')
SOUNDS = ('.mp3', '.ogg', '.m4a', '.wav')
PICTURES = ('.webp', '.png', '.jpg', '.jpeg', '.avif', '.ktx2', '.mp3', '.ogg', '.m4a', '.wav')


def looked(target, path, was):
    if target in SEEN_BY or not path.startswith('web/') or was == 'missing' or not os.path.isfile(os.path.join(ROOT, path)):
        return None
    if target in COUNTED and path.endswith(('.glb',) + PICTURES) and not path.endswith(SOUNDS):
        return True, f'{path}: a {"model" if path.endswith(".glb") else "picture"} it drew, its beats counted again'
    if path.endswith(PICTURES):
        return False, f'{path}: a picture or a sound, looked at and weighed'
    if not path.endswith('.glb'):
        return None
    if path.startswith('web/assets/people/'):
        return False, f'{path}: behind the people\'s contract'
    if path.startswith('web/assets/animals/'):
        return None   # (the guide's body is measured from his model)
    try:
        import model_contract as mc
        old = mc.interface(mc.gltf_json(git('cat-file', 'blob', was)))
        new = mc.interface(mc.gltf_json(open(os.path.join(ROOT, path), 'rb').read()))
    except Exception:
        return None
    lost = sorted(old - new)
    if lost:
        return True, f'{path}: a model that lost or changed {lost[0][:70]}'
    return False, f'{path}: a model with its names, flags, attributes and ground as they were'


def judge(target, c):
    """Every file the pass read that is not as it was: [(path, reaches, why)]; None when the pass kept no bytes."""
    blobs = c.get('blobs')
    if not blobs:
        return None
    cover = c.get('cover') or {}
    out = []
    for f in sorted(blobs):
        if blob_id(f) != blobs[f]:
            w = None
            main = (git('rev-parse', '-q', '--verify', f'origin/main:{f}') or b'').decode().strip()
            if main == blob_id(f):   # (main's, as main has it: before any other rule; reach() says so)
                pass
            elif f in SOURCE:
                was = blobs[f] if SOURCE[f][0] == f else (c.get('sources') or {}).get(SOURCE[f][0])
                w = words(target, f, was) if was else None
                w = w or looked(target, f, blobs[f])
            else:
                w = looked(target, f, blobs[f])
            r, why = w or reach(f, blobs[f], cover.get(f))
            out.append((f, r, why))
    for f in harness(target):   # (a module the harness requires now and did not then)
        if f not in blobs:
            out.append((f, True, f'{f} is new to its harness'))
    return out


def key(target, files):
    h = hashlib.sha1()
    for f in sorted(set(harness(target)) | set(files)):
        h.update(f'{f} {digest(f)}\n'.encode())
    for e in ENV:
        h.update(f'{e}={os.environ.get(e, "")}\n'.encode())
    return h.hexdigest()


def read_log(log, start):
    """The files under web/ the page fetched, from the server's log from line `start` on."""
    out = set()
    with open(log, encoding='utf8', errors='replace') as f:
        for i, line in enumerate(f):
            if i < start:
                continue
            m = LOG.search(line)
            if not m:
                continue
            p = unquote(m.group(1).split('?')[0].split('#')[0])
            if p.endswith('/'):
                p += 'index.html'
            p = os.path.normpath('web/' + p.lstrip('/'))
            if p.startswith('web/') and '..' not in p.split('/'):
                out.add(p)
    return sorted(out)


def hit(target, c):
    """(kept, what to say) for a pass of a check: kept when nothing it read has changed, or nothing that changed reaches it."""
    at = (f'{c.get("commit", "?")[:8]}{" with changes" if c.get("dirty") else ""}, {c.get("at", "")}'
          f'{", " + str(c["s"]) + " s saved" if c.get("s") else ""}')
    if c.get('key') == key(target, c.get('files', [])):
        return True, f'{at}: nothing it read has changed since'
    env = c.get('env')
    same = lambda e: os.environ.get(e, '') == env.get(e, '') or (e == 'CHECK_FN' and 'CHECK_FN' not in os.environ)   # (asked by hand)
    if env is None or not all(same(e) for e in ENV):
        e = next((e for e in ENV if env and not same(e)), None)
        return False, (f'its settings changed ({"how tools/check.sh runs it" if e == "CHECK_FN" else e})' if e else 'its pass kept no bytes to compare')
    j = judge(target, c)
    if j is None:
        return False, 'its pass kept no bytes to compare'
    hits = [w for _, r, w in j if r]
    if hits:
        return False, hits[0] + (f' (and {len(hits) - 1} more)' if len(hits) > 1 else '')
    if not j:
        return True, f'{at}: nothing it read has changed since'
    # (what changed and why none of it reaches: main's files in one count, the rest by name)
    whole = sum(1 for _, _, w in j if w.endswith("main's, as main has it"))
    rest = [w for _, _, w in j if not w.endswith("main's, as main has it")]
    said = ([f'{whole} file{"s" if whole > 1 else ""} main\'s as main has {"them" if whole > 1 else "it"}'] if whole else []) + rest[:3]
    return True, f'{at}: what changed since cannot reach it: {"; ".join(said)}{f" (and {len(rest) - 3} more)" if len(rest) > 3 else ""}'


def main(a):
    cmd = a[0] if a else ''
    if cmd == 'users':
        f = os.path.normpath(a[1])
        print(' '.join(t for t in HARNESS if not re.search(r'\d$', t) and f in closure(HARNESS[t])))
        return 0
    if cmd == 'hit':
        said = ''
        for whose, c in passes(a[1]):
            ok, text = hit(a[1], c)
            if ok:
                print(f'{whose}{text}')
                return 0
            said = said or text
        print(said or 'no pass of it kept in this clone, and none of main\'s')
        return 1
    if cmd == 'pack':   # <dir>: each pass in it as main shares it (tools/check_cache.py passes; .github/workflows/checks.yml)
        for n in sorted(os.listdir(a[1])):
            if n.endswith('.json'):
                raw = json.dumps(json.load(open(os.path.join(a[1], n))), separators=(',', ':'), sort_keys=True).encode()
                with open(os.path.join(a[1], n + '.gz'), 'wb') as f:
                    f.write(gzip.compress(raw, 9, mtime=0))
                os.remove(os.path.join(a[1], n))
        return 0
    if cmd == 'why':
        cs = passes(a[1])
        if not cs:
            print(f'no pass of {a[1]} kept in this clone, and none of main\'s')
            return 1
        j = judge(a[1], cs[0][1]) or []
        for _, r, w in j:
            print(f'{"REACHES" if r else "apart  "} {w}')
        return 1 if any(r for _, r, _ in j) else 0
    if cmd == 'ran':
        try:
            fns = passes(a[1])[0][1]['cover'][a[2]]
        except (IndexError, KeyError, TypeError):
            print(f'no count of {a[2] if len(a) > 2 else "?"} in a pass of {a[1]} kept in this clone')
            return 1
        for s_, e_, ran, name in fns:
            if len(a) < 4 or a[3] == name:
                print(f'{"ran    " if ran else "not run"} {name or "(no name)"} {s_}-{e_}')
        return 0
    if cmd == 'save':
        target, log, start, t0 = a[1], a[2], int(a[3] or 0), float(a[4])
        files = read_log(log, start)
        if not files:
            print(f'(not kept: no request of {target} in the server\'s log)')
            return 0
        late = [f for f in set(harness(target)) | set(files)
                if os.path.isfile(os.path.join(ROOT, f)) and os.path.getmtime(os.path.join(ROOT, f)) >= t0]
        if late:
            print(f'(not kept: {late[0]}{" and others" if len(late) > 1 else ""} changed while {target} ran)')
            return 0
        rev = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=ROOT, capture_output=True, text=True).stdout.strip()
        dirty = bool(subprocess.run(['git', 'status', '--porcelain'], cwd=ROOT, capture_output=True, text=True).stdout.strip())
        cover = read_cover(a[6] if len(a) > 6 else '')
        blobs = keep_blobs(sorted(set(harness(target)) | set(files)))
        # (a function that ran in any play seen of the same bytes ran: this clone's last pass and main's; of 8,200
        # functions six to ten differ between two plays of one check, the traffic's and the crowd's by the moment)
        for _, was in passes(target) if cover else []:
            for f, fns in (was.get('cover') or {}).items():
                if f in cover and (was.get('blobs') or {}).get(f) == blobs.get(f):
                    ran = {(s_, e_) for s_, e_, r, _ in fns if r}
                    for fn in cover[f]:
                        if (fn[0], fn[1]) in ran:
                            fn[2] = 1
        json.dump({'key': key(target, files), 'files': files, 'commit': rev, 'dirty': dirty,
                   'at': time.strftime('%Y-%m-%d %H:%M'), 's': int(a[5]) if len(a) > 5 and a[5] else None,
                   'env': {e: os.environ.get(e, '') for e in ENV}, 'blobs': blobs,
                   'sources': keep_blobs(sorted({SOURCE[f][0] for f in files if f in SOURCE})), 'cover': cover},
                  open(store(target), 'w'), separators=(',', ':'))
        if cover is None:
            print(f'(kept by its files alone: no count of the functions {target} ran)')
        return 0
    if cmd == 'drop':
        try:
            os.remove(store(a[1]))
        except OSError:
            pass
        return 0
    if cmd == 'files':
        try:
            print('\n'.join(json.load(open(store(a[1])))['files']))
        except (OSError, ValueError, KeyError):
            return 1
        return 0
    print(__doc__)
    return 2


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
