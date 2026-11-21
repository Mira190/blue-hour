#!/usr/bin/env python3
"""What the page's code can see of a model, compared with the model at another commit (docs/CHECKS.md, "The router").

The game finds a model's parts by name (a bone, a car's lamp, a door's leaf, a clip), reads the flags Blender left on
them (extras, three.js userData) and draws the attributes its meshes carry. Those names, flags and attributes are the
model's interface. A model rebuilt with the same interface (a sculpt, a texture, a finer mesh) cannot send the story
down another path, so tools/check.sh routes it to the checks that load and measure it (look, mem) rather than to the
story played through; one whose interface lost or changed something goes to the page's checks like any code change.
What a model adds (a new node, a new clip) is reported and allowed: nothing in the code can be waiting for it.
A hero level's ground (its materials named ground*) is part of its interface by where it lies: the walking heights
are taken from it, so ground moved, added or taken away runs as code, and ground left alone does not.

Reads only the GLB's JSON chunk: no buffer is decoded, so a meshopt-compressed model costs what its header does.
  python3 tools/model_contract.py <base-commit> <file.glb>...   # one line each: same, new, added, or CHANGED
  python3 tools/model_contract.py --show <file.glb>             # the interface itself
Exit status 0 whatever it finds; the router reads the CHANGED lines.
"""
import json
import struct
import subprocess
import sys


def gltf_json(data):
    if len(data) < 20 or data[:4] != b'glTF':
        raise ValueError('not a GLB')
    n, kind = struct.unpack_from('<I4s', data, 12)
    if kind != b'JSON':
        raise ValueError('no JSON chunk first')
    return json.loads(data[20:20 + n].decode('utf8'))


def interface(g):
    """The model's interface as a flat set of strings, each one thing the code could ask of it."""
    out = set()
    nodes = g.get('nodes', [])
    nn = lambda i: nodes[i].get('name', f'#{i}') if 0 <= i < len(nodes) else f'#{i}'
    acc = g.get('accessors', [])
    for i, n in enumerate(nodes):
        out.add(f'node {nn(i)}')
        if n.get('extras'):
            out.add(f'node {nn(i)} extras {json.dumps(n["extras"], sort_keys=True)}')
        for c in n.get('children', []):
            out.add(f'node {nn(i)} > {nn(c)}')
    for s in g.get('skins', []):
        out.add(f'skin {s.get("name", "")} joints {",".join(nn(j) for j in s.get("joints", []))}')
    for a in g.get('animations', []):
        name = a.get('name', '')
        t1 = 0.0
        for smp in a.get('samplers', []):
            m = (acc[smp['input']].get('max') or [0])[0] if smp.get('input', -1) < len(acc) else 0
            t1 = max(t1, m)
        out.add(f'clip {name} {t1:.2f} s')
        for ch in a.get('channels', []):
            t = ch.get('target', {})
            if 'node' in t:
                out.add(f'clip {name} drives {nn(t["node"])}.{t.get("path")}')
    for m in g.get('materials', []):
        out.add(f'material {m.get("name", "")}')
        if m.get('extras'):
            out.add(f'material {m.get("name", "")} extras {json.dumps(m["extras"], sort_keys=True)}')
    for m in g.get('meshes', []):
        name = m.get('name', '')
        out.add(f'mesh {name}')
        if m.get('extras'):
            out.add(f'mesh {name} extras {json.dumps(m["extras"], sort_keys=True)}')
        for p in m.get('primitives', []):
            out.add(f'mesh {name} attributes {",".join(sorted(p.get("attributes", {})))}')
            if p.get('targets'):
                out.add(f'mesh {name} morphs {len(p["targets"])}')
    # The ground: what is walked on (a hero level's materials named ground*, hero.js; game.js heroCover takes the walking
    # heights from those meshes). Its interface is where it lies: each such primitive's vertex count, its bounds, and
    # where its nodes put it. A hero level rebuilt with its ground as it was cannot move anyone's feet.
    mats = g.get('materials', [])
    parent = {c: i for i, n in enumerate(nodes) for c in n.get('children', [])}
    for i, n in enumerate(nodes):
        if 'mesh' not in n or n['mesh'] >= len(g.get('meshes', [])):
            continue
        for p in g['meshes'][n['mesh']].get('primitives', []):
            m = mats[p['material']].get('name', '') if 0 <= p.get('material', -1) < len(mats) else ''
            if not m.lower().startswith('ground') or 'POSITION' not in p.get('attributes', {}):
                continue
            a = acc[p['attributes']['POSITION']]
            chain, j = [], i
            while j is not None:
                chain.append({k: nodes[j][k] for k in ('translation', 'rotation', 'scale', 'matrix') if k in nodes[j]})
                j = parent.get(j)
            out.add(f'ground {m} on {nn(i)}: {a.get("count")} vertices, {json.dumps(a.get("min"))} to {json.dumps(a.get("max"))}, placed {json.dumps(chain, sort_keys=True)}')
    for k in ('extensionsRequired',):
        for e in g.get(k, []):
            out.add(f'{k} {e}')
    for s in g.get('scenes', []):
        if s.get('extras'):
            out.add(f'scene extras {json.dumps(s["extras"], sort_keys=True)}')
    return out


def at(commit, path):
    r = subprocess.run(['git', 'show', f'{commit}:{path}'], capture_output=True)
    return r.stdout if r.returncode == 0 else None


def main(argv):
    if argv[:1] == ['--show']:
        for p in argv[1:]:
            for line in sorted(interface(gltf_json(open(p, 'rb').read()))):
                print(line)
        return 0
    if len(argv) < 2:
        print(__doc__.strip().split('\n\n')[-1])
        return 2
    base, files = argv[0], argv[1:]
    for p in files:
        try:
            now = open(p, 'rb').read()
        except OSError:
            print(f'CHANGED {p}: removed (the code may still load it)')
            continue
        old = at(base, p)
        if old is None:
            print(f'new     {p}')
            continue
        try:
            a, b = interface(gltf_json(old)), interface(gltf_json(now))
        except (ValueError, KeyError, IndexError, json.JSONDecodeError) as e:
            print(f'CHANGED {p}: unreadable ({e})')
            continue
        lost, added = sorted(a - b), sorted(b - a)
        if lost:
            # ([ground]: where what is walked on lies; the router plays the guide's ways over it, his feet on what is drawn)
            print(f'CHANGED {p}{" [ground]" if any(x.startswith("ground ") for x in lost) else ""}: {len(lost)} lost or changed, e.g. {"; ".join(x[:80] for x in lost[:3])}')
        elif added:
            print(f'added   {p}: {len(added)} new, nothing lost ({"; ".join(x[:60] for x in added[:2])})')
        else:
            print(f'same    {p}: {len(a)} names, flags and attributes as at {base[:8]}')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
