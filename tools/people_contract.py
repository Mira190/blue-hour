#!/usr/bin/env python3
"""The people's models against their contract (contracts/people.json; docs/SEAMS.md, "A new avatar set").

The page asks a person's model for bones by name (the head to turn, the chest a camera hangs on, the hands' grip),
for clips by name (Walk, Talk, the clip an NPC is cast with), for materials by the end of their name, for a face's
shapes, and takes its height, its feet at the origin and the way it faces as given. That is the seam between the
models and everything that plays: the story, the crowd, the cameras. This reads the index
(web/assets/people/people.json), each model's JSON header (no buffer is decoded) and who the map casts
(cities/shibuya/city.json), and fails on anything the contract asks for that a model in use does not give.

A model, or the whole set, replaced by one that passes here cannot send the story another way: tools/check.sh then
runs this with the static checks, look and mem, and does not play the story.
  python3 tools/people_contract.py            # every model the map casts, and who you play (two seconds)
  python3 tools/people_contract.py --all      # every model in the index
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from model_contract import gltf_json  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
C = json.load(open(os.path.join(ROOT, 'contracts/people.json')))
three = lambda n: re.sub(r'[\[\].:/]', '', n.replace(' ', '_'))   # (a node's name as three.js gives it to the code)
_seen = {}


def header(path):
    if path not in _seen:
        try:
            _seen[path] = gltf_json(open(os.path.join(ROOT, path), 'rb').read())
        except (OSError, ValueError) as e:
            _seen[path] = e
    return _seen[path]


def strings(o, key, out):
    if isinstance(o, dict):
        for k, v in o.items():
            if k == key and isinstance(v, str):
                out.add(v)
            strings(v, key, out)
    elif isinstance(o, list):
        for v in o:
            strings(v, key, out)
    return out


def body(g, who, alias, fails):
    """What every person's model gives: the joints, the materials, its size and where it stands."""
    nodes = g.get('nodes', [])
    joints = {three(nodes[j].get('name', '')) for s in g.get('skins', []) for j in s.get('joints', [])}
    if not joints:
        fails.append(f'{who}: no skin')
        return
    for a in C['bones']['aliases']:
        if three(alias.get(a, '')) not in joints:
            fails.append(f'{who}: no joint for {a} ({alias.get(a, "not in the index\'s bones")})')
    for p in C['bones']['by_pattern']['patterns']:
        if not any(re.search(p, j) for j in joints):
            fails.append(f'{who}: no joint whose name ends {p}')
    for side in ('WristR', 'WristL'):
        hand = three(alias.get(side, ''))
        stem = re.sub(r'_Hand$', '', hand)
        if not any(f'{stem}_{f}' in joints for f in C['bones']['grip']['fingers']):
            fails.append(f'{who}: no finger to grip with on {hand} ({stem}_{C["bones"]["grip"]["fingers"][0]})')
    mats = [m.get('name', '') for m in g.get('materials', [])]
    for p in C['materials']['required']:
        if not any(re.search(p, m) for m in mats):
            fails.append(f'{who}: no material whose name ends {p}')


def stands(g, who, h, fails):
    """Feet at the origin and as tall as the index says: from the bounds of the meshes' positions, y up, in metres."""
    acc = g.get('accessors', [])
    lo, hi = [], []
    for m in g.get('meshes', []):
        for p in m.get('primitives', []):
            a = acc[p['attributes']['POSITION']] if 'POSITION' in p.get('attributes', {}) else None
            if a and a.get('min') and a.get('max'):
                lo.append(a['min']); hi.append(a['max'])
    if not lo:
        return
    # (a model may be written lying as Blender has it, z up, under a node that stands it up: the tallest axis is its height)
    span = [max(x[i] for x in hi) - min(x[i] for x in lo) for i in range(3)]
    up = span.index(max(span))
    feet, top = min(x[up] for x in lo), max(x[up] for x in hi)
    if a.get('normalized') or max(abs(feet), abs(top)) > 50:   # (positions packed as integers: the node's scale gives metres, not read here)
        return
    if abs(feet) > C['units']['feet_within_m']:
        fails.append(f'{who}: its feet are {feet:+.2f} m from the ground at its origin')
    if h and abs((top - feet) - h) > C['units']['height_within_m']:
        fails.append(f'{who}: {top - feet:.2f} m tall, the index says {h} m')


def main(a):
    idx = json.load(open(os.path.join(ROOT, C['index'])))
    city = json.load(open(os.path.join(ROOT, 'cities/shibuya/city.json')))['game']
    d = os.path.dirname(C['index'])
    fails, n = [], 0
    H, N = idx['heroes'], idx['npcs']
    cast = strings(city, 'character', set())
    for k in ('f', 'm'):
        cast |= set((city.get('crowd', {}).get('cast', {}) or {}).get(k, []))
    lo, hi = C['height_m']
    # who you play
    for cid, c in H['characters'].items():
        who = f'{cid} ({c.get("file")})'
        for f in C['heroes']['fields']:
            if f not in c:
                fails.append(f'{who}: the index gives no {f}')
        g = header(f'{d}/{c.get("file")}')
        if isinstance(g, Exception):
            fails.append(f'{who}: {g}'); continue
        n += 1
        body(g, who, H['bones'], fails)
        stands(g, who, c.get('height_m'), fails)
        clips = {x.get('name') for x in g.get('animations', [])}
        for x in C['heroes']['clips']:
            if x not in clips:
                fails.append(f'{who}: no clip {x}')
        for x in C['heroes']['ground_speed']:
            if not (c.get('ground_speed', {}).get(x, 0) > 0):
                fails.append(f'{who}: no ground speed for {x}')
        for x in C['heroes']['neck_camera']:
            if x not in (c.get('neck_camera') or {}):
                fails.append(f'{who}: neck_camera without {x}')
        mats = [m.get('name', '') for m in g.get('materials', [])]
        for p in C['heroes']['materials']:
            if not any(re.search(p, m) for m in mats):
                fails.append(f'{who}: no material {p}')
        if not lo <= c.get('height_m', 0) <= hi:
            fails.append(f'{who}: {c.get("height_m")} m is not a person\'s height ({lo} to {hi})')
        if not faced(g):
            fails.append(f'{who}: no mesh with the face\'s shapes ({", ".join(C["face"]["shapes"][:3])} ...)')
    # everyone else: the models cast, and their sex's clips
    drives = {}
    for sex, cl in N['clips'].items():
        g = header(f'{d}/{cl["file"]}')
        if isinstance(g, Exception):
            fails.append(f'{cl["file"]}: {g}'); continue
        names = {x.get('name') for x in g.get('animations', [])}
        for x in C['npcs']['clips']:
            if x not in names:
                fails.append(f'{cl["file"]}: no clip {x}')
        for x in C['npcs']['ground_speed']:
            if not (cl.get('ground_speed', {}).get(x, 0) > 0):
                fails.append(f'{cl["file"]}: no ground speed for {x}')
        nodes = g.get('nodes', [])
        drives[sex] = ({three(nodes[ch['target']['node']].get('name', '')) for an in g.get('animations', []) for ch in an.get('channels', []) if 'node' in ch.get('target', {})}, names)
    for sex, cl in (N.get('field') or {}).items():
        g = header(f'{d}/{cl["file"]}')
        names = set() if isinstance(g, Exception) else {x.get('name') for x in g.get('animations', [])}
        for x in C['npcs']['field_clips']:
            if x not in names:
                fails.append(f'{cl["file"]}: no clip {x}')
    for cid in sorted(N['characters'] if '--all' in a else cast & set(N['characters'])):
        c = N['characters'][cid]
        who = f'{cid}'
        for f in C['npcs']['fields']:
            if f not in c:
                fails.append(f'{who}: the index gives no {f}')
        g = header(f'{d}/{c.get("file")}')
        if isinstance(g, Exception):
            fails.append(f'{who}: {g}'); continue
        n += 1
        body(g, who, N['bones'], fails)
        stands(g, who, c.get('height_m'), fails)
        if not lo <= c.get('height_m', 0) <= hi:
            fails.append(f'{who}: {c.get("height_m")} m is not a person\'s height ({lo} to {hi})')
        have = {three(x.get('name', '')) for x in g.get('nodes', [])}
        miss = sorted(drives.get(c.get('sex'), (set(), set()))[0] - have)
        if miss:
            fails.append(f'{who}: its sex\'s clips drive {len(miss)} bones it has not ({", ".join(miss[:3])})')
        if c.get('face') and not faced(g):
            fails.append(f'{who}: the index gives it a face, and no mesh has the face\'s shapes')
    for c in sorted(cast - set(N['characters']) - set(H['characters'])):
        if c.startswith(('R_', 'H_')):
            fails.append(f'{c} is cast by the map and is not in the index')
    # the clip each of the map's people is cast with
    for p in city.get('npcs', []):
        look = p.get('look') or {}
        c, clip = N['characters'].get(look.get('character', '')), look.get('clip')
        if c and clip and clip not in drives.get(c.get('sex'), (set(), set()))[1] and C['npcs'].get('cast_clips_known', {}).get(p.get('id')) != clip:
            fails.append(f'{p.get("id", "?")} is cast with the clip {clip}, which {N["clips"][c["sex"]]["file"]} has not')
    # the guide
    for model in sorted(strings(city.get('story', {}), 'model', set())):
        if 'animals/' not in model:
            continue
        g = header(f'web/{model}')
        if isinstance(g, Exception):
            fails.append(f'{model}: {g}'); continue
        n += 1
        names, nodes = {x.get('name') for x in g.get('animations', [])}, {x.get('name') for x in g.get('nodes', [])}
        for x in C['guide']['clips']:
            if x not in names:
                fails.append(f'{model}: no clip {x}')
        for x in C['guide']['bones']:
            if x not in nodes:
                fails.append(f'{model}: no bone {x}')
    for f in fails[:14]:
        print(f'FAIL {f}')
    if len(fails) > 14:
        print(f'FAIL ... and {len(fails) - 14} more')
    if not fails:
        print(f'ok   people   {n} models in use give what the page asks of them: joints, clips, materials, faces, their height and their feet')
    return 1 if fails else 0


def faced(g):
    want = set(C['face']['shapes'])
    return any(want <= set((m.get('extras') or {}).get('targetNames', [])) for m in g.get('meshes', []))


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
