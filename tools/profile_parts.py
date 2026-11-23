#!/usr/bin/env python3
"""A CPU profile of the page by whose script it is (issue 130, "CPU: the frame's script by system").
  PROFILE=<still>:<seconds> ... node tools/story_play.js <out> <size>    writes <out>/profile.cpuprofile
  python3 tools/profile_parts.py <out>/profile.cpuprofile [--top 25] [--frames n]
Own time summed by file, then the heaviest functions; three.js, the browser's own work (garbage collection, the
program's idle) and the harness are named apart. --frames n: the frames the page ran in that time, for
milliseconds a frame. The times are this machine's: they compare one system with another, not with a device."""
import collections, json, sys

args = sys.argv[1:]
top = int(args[args.index('--top') + 1]) if '--top' in args else 25
frames = float(args[args.index('--frames') + 1]) if '--frames' in args else 0
P = json.load(open(args[0]))
by = {n['id']: n for n in P['nodes']}
own = collections.Counter()
for i, s in enumerate(P['samples']):
    own[s] += P['timeDeltas'][i] / 1000
total = sum(own.values())
idle = sum(ms for i, ms in own.items() if by[i]['callFrame']['functionName'] in ('(idle)', '(program)'))
busy = total - idle


def where(n):
    f = n['callFrame']
    u = f['url'].split('?')[0]
    if not u:
        return '(browser: ' + (f['functionName'] or 'native') + ')' if f['functionName'].startswith('(') else '(native)'
    if '/vendor/three/' in u:
        return 'three.js'
    if not u.startswith('http'):
        return '(harness)'
    return u.split('/', 3)[-1]


files, funcs = collections.Counter(), collections.Counter()
for i, ms in own.items():
    n = by[i]
    if n['callFrame']['functionName'] in ('(idle)', '(program)'):
        continue
    w = where(n)
    files[w] += ms
    funcs[f"{n['callFrame']['functionName'] or '(anon)'}  {w}:{n['callFrame']['lineNumber'] + 1}"] += ms
per = (lambda ms: f'{ms / frames:6.2f} ms a frame') if frames else (lambda ms: f'{ms / 1000:6.2f} s')
print(f'{total / 1000:.1f} s profiled, {busy / 1000:.1f} s of script ({100 * busy / total:.0f}%)' + (f', {busy / frames:.1f} ms a frame over {frames:.0f} frames' if frames else ''))
print('by file:')
for k, ms in files.most_common(top):
    print(f'  {per(ms)}  {100 * ms / busy:4.1f}%  {k}')
print('by function:')
for k, ms in funcs.most_common(top):
    print(f'  {per(ms)}  {100 * ms / busy:4.1f}%  {k}')
