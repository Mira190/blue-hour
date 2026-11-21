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
  python3 tools/check_cache.py hit <target>                       # exit 0 and the pass's commit when it holds
  python3 tools/check_cache.py save <target> <server.log> <line> <t0> [seconds]   # after a pass: what it read since
  python3 tools/check_cache.py drop <target>                      # after a failure
  python3 tools/check_cache.py users <tools/file.js>              # the targets whose harness requires it
  python3 tools/check_cache.py files <target>                     # what the last pass read
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from urllib.parse import unquote

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# each target's harness: the scripts tools/check.sh runs for it (their requires follow), and what else it reads itself
HARNESS = {
    'story': ['tools/story_play.js'], 'story1': ['tools/story_play.js'], 'story2': ['tools/story_play.js'],
    'story3': ['tools/story_play.js'],
    'guide': ['tools/guide_way.js', 'tools/guide_body.js'], 'guide1': ['tools/guide_way.js'],
    'guide2': ['tools/guide_body.js'],
    'walk': ['tools/walk_play.js'], 'walk1': ['tools/walk_play.js'], 'walk2': ['tools/walk_play.js'],
    'ride': ['tools/ride_people.js'], 'mem': ['tools/mem_check.js', 'tools/glcare_phone.js'], 'look': ['tools/look_check.js'],
    'audio': ['tools/reverb_check.js', 'tools/audio_graph_check.js', 'tools/phone_audio.js'],
    'clip': ['tools/clip_check.js'], 'gl': ['tools/gl_error_probe.js', 'tools/sampler_probe.js'],
    'touch': ['tools/touch_check.js'], 'astc': ['tools/astc_check.js'], 'game': ['tools/game_check.js'],
}
EXTRA = {k: ['cities/shibuya/city.json'] for k in ('story', 'story1', 'story2', 'story3')}  # (story_play.js reads it)
# the settings a run takes from the environment that change what it plays or measures (CHECK_FN: a hash of the
# functions tools/check.sh runs the target with)
ENV = ['CHECK_FN', 'GAME_TIME', 'DRAW', 'GPU', 'AT', 'PIN', 'TIER', 'QUERY', 'LIMIT', 'MEM_GPU', 'MEM_HEAP', 'MEM_DESK', 'LOOK_BASE',
       'STILLS', 'Q', 'WALK', 'START']
LOG = re.compile(r'"(?:GET|HEAD) (\S+) HTTP/[\d.]+" (\d{3})')


def git_dir():
    return subprocess.run(['git', 'rev-parse', '--absolute-git-dir'], cwd=ROOT, capture_output=True, text=True).stdout.strip()


def store(target):
    d = os.path.join(git_dir(), 'oe-check-cache')
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, f'{target}.json')


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


def main(a):
    cmd = a[0] if a else ''
    if cmd == 'users':
        f = os.path.normpath(a[1])
        print(' '.join(t for t in HARNESS if not re.search(r'\d$', t) and f in closure(HARNESS[t])))
        return 0
    if cmd == 'hit':
        try:
            c = json.load(open(store(a[1])))
        except (OSError, ValueError):
            return 1
        if c.get('key') != key(a[1], c.get('files', [])):
            return 1
        print(f'{c.get("commit", "?")[:8]}{" with changes" if c.get("dirty") else ""}, {c.get("at", "")}'
              f'{", " + str(c["s"]) + " s saved" if c.get("s") else ""}')
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
        json.dump({'key': key(target, files), 'files': files, 'commit': rev, 'dirty': dirty,
                   'at': time.strftime('%Y-%m-%d %H:%M'), 's': int(a[5]) if len(a) > 5 and a[5] else None},
                  open(store(target), 'w'), indent=0)
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
