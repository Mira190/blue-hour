#!/usr/bin/env python3
"""The seams between the page's parts, written down and held (docs/SEAMS.md; contracts/parts.json).

Each part of the page (the crowd, the traffic, the sound, the story's engine, the camera, the HUD, the world ...) is a
set of scripts that offers the rest a global (window.OEAudio, window.OEStory ...) and, on it, a few names. What one
part may ask of another is those names and nothing else: contracts/parts.json lists them, part by part. This reads
the scripts as they are and fails when
  - a script asks another part for a name its contract does not offer (the seam was widened without saying so);
  - a contract offers a name its part no longer defines (the seam was narrowed under those who use it);
  - a script under web/ belongs to no part, or a part's global is defined by a script outside it;
  - a part cut out of game.js (tools/cut.js: a function of `g`, the rest of the game by name) uses a name of `g` its
    contract does not list, or game.js does not hand over a name the contract lists: the name would be undefined in
    the page, silently.
A seam that changes is then a change to contracts/parts.json, in the diff where a reviewer and the router see it.
  python3 tools/seams.py            # check (a second; one of tools/check.sh's static checks)
  python3 tools/seams.py --write    # write each part's offers as the scripts ask for them now, keeping its notes
  python3 tools/seams.py --uses     # who asks what of whom, a line a name
  python3 tools/seams.py part <file>...   # the part each file belongs to
"""
import fnmatch
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILE = os.path.join(ROOT, 'contracts/parts.json')
DEF = re.compile(r'(?:window|self|globalThis)\.([A-Z][A-Za-z0-9_]+)\s*=(?!=)')


def scripts():
    return sorted(os.path.relpath(p, ROOT) for p in glob.glob(os.path.join(ROOT, 'web/*.js')) + glob.glob(os.path.join(ROOT, 'web/game/*.js')))


def read(f):
    return open(os.path.join(ROOT, f), encoding='utf8', errors='replace').read()


def part_of(parts, f):
    for name, p in parts.items():
        if any(fnmatch.fnmatch(f, g) for g in p['files']):
            return name
    return None


def survey():
    """(defs, uses): the script that defines each global; and for each global, name -> the scripts that ask for it
    (as Global.name, or through a local name it was given: const A = window.OEAudio)."""
    src = {f: read(f) for f in scripts()}
    defs = {}
    for f, s in src.items():
        for m in DEF.finditer(s):
            defs.setdefault(m.group(1), set()).add(f)
    uses = {}
    for f, s in src.items():
        names = {g: [g] for g in defs}
        for m in re.finditer(r'(?<![\w$.])([A-Za-z_$][\w$]*)\s*=\s*(?:window|self)\.([A-Z][A-Za-z0-9_]+)\s*[,;\n]', s):
            if m.group(2) in defs:
                names[m.group(2)].append(m.group(1))
        for g, local in names.items():
            if f in defs[g]:
                continue
            body = ''.join(src[d] for d in defs[g])
            for n in set(local):
                for m in re.finditer(r'(?<![\w$.])(?:window\.|self\.)?' + re.escape(n) + r'\.([A-Za-z_$][\w$]*)', s):
                    # (a local name is only a guess: A is the sound in one function and something else in another, so
                    # through one a name counts only when the part says it at all)
                    if n != g and not re.search(r'(?<![\w$])' + re.escape(m.group(1)) + r'(?![\w$])', body):
                        continue
                    uses.setdefault(g, {}).setdefault(m.group(1), set()).add(f)
    return defs, uses


def cuts():
    """The parts cut out of game.js: {script: (global, the names of g it uses, the names game.js hands it)}."""
    out, game = {}, read('web/game/game.js')
    for f in scripts():
        s = read(f)
        m = re.search(r'window\.(OEGame[A-Z]\w*)\s*=\s*function\s*\(g\)', s)
        if not m:
            continue
        uses = set(re.findall(r'(?<![\w$.])g\.([A-Za-z_$][\w$]*)', s))
        call = re.search(re.escape(m.group(1)) + r'\(\{(.*?)\}\);', game, re.S)
        out[f] = (m.group(1), uses, set(re.findall(r'\bget ([A-Za-z_$][\w$]*)\(\)', call.group(1))) if call else set())
    return out


def main(a):
    parts = json.load(open(FILE))['parts'] if os.path.exists(FILE) else {}
    if a[:1] == ['part']:
        for f in a[1:]:
            print(f'{part_of(parts, f) or "-"} {f}')
        return 0
    defs, uses = survey()
    home = {}   # global -> the part that offers it
    for name, p in parts.items():
        for g in p.get('offers', {}):
            home[g] = name
    if a[:1] == ['--uses']:
        for g in sorted(uses):
            for n in sorted(uses[g]):
                print(f'{home.get(g, "?")}: {g}.{n}  <-  {" ".join(sorted(os.path.basename(f) for f in uses[g][n]))}')
        return 0
    if a[:1] == ['--write']:
        for name, p in parts.items():
            mine = [g for g, fs in defs.items() if any(part_of(parts, f) == name for f in fs)]
            p['offers'] = {g: sorted(n for n, fs in uses.get(g, {}).items() if any(part_of(parts, f) != name for f in fs)) for g in sorted(mine)}
            asked = {f: sorted(u) for f, (_, u, _) in sorted(cuts().items()) if part_of(parts, f) == name}
            if asked:
                p['asks_of_game'] = asked
            else:
                p.pop('asks_of_game', None)
        json.dump({'_': json.load(open(FILE))['_'], 'parts': parts}, open(FILE, 'w'), indent=1)
        open(FILE, 'a').write('\n')
        print(f'wrote {os.path.relpath(FILE, ROOT)}')
        return 0
    fails = []
    for f in scripts():
        if not part_of(parts, f):
            fails.append(f'{f} belongs to no part: give it one in contracts/parts.json')
    for g, fs in sorted(defs.items()):
        owners = {part_of(parts, f) for f in fs}
        if g not in home:
            fails.append(f'window.{g} ({", ".join(sorted(fs))}) is offered by no part\'s contract')
        elif owners != {home[g]}:
            fails.append(f'window.{g} is the {home[g]}\'s by its contract, and is defined in {", ".join(sorted(fs))}')
    asked = 0
    for g, names in sorted(uses.items()):
        if g not in home:
            continue
        offer = set(parts[home[g]]['offers'][g])
        for n, fs in sorted(names.items()):
            out = sorted(f for f in fs if part_of(parts, f) != home[g])
            if not out:
                continue
            asked += 1
            if n not in offer:
                fails.append(f'{out[0]} asks the {home[g]} for {g}.{n}, which its contract does not offer: add it to contracts/parts.json (python3 tools/seams.py --write), so that the seam is seen to widen')
    for name, p in parts.items():
        for g, offer in p.get('offers', {}).items():
            body = ''.join(read(f) for f in defs.get(g, ()))
            if g not in defs:
                fails.append(f'the {name} offers window.{g}, which no script defines')
            for n in offer:
                if not re.search(r'(?<![\w$])' + re.escape(n) + r'(?![\w$])', body):
                    fails.append(f'the {name} offers {g}.{n}, which {", ".join(sorted(defs.get(g, ["?"])))} no longer says')
    for f, (g, used, given) in sorted(cuts().items()):
        listed = set(parts.get(part_of(parts, f) or '', {}).get('asks_of_game', {}).get(f, []))
        for n in sorted(used - listed):
            fails.append(f'{f} asks the game for g.{n}, which its contract does not list (contracts/parts.json asks_of_game; python3 tools/seams.py --write)')
        for n in sorted(listed - given):
            fails.append(f'{f} is to be handed g.{n} by its contract, and web/game/game.js does not give it to {g}: add get {n}() where the part is made')
    for f in fails[:12]:
        print(f'FAIL {f}')
    if not fails:
        print(f'ok   seams    {len(parts)} parts, {len(home)} globals, {asked} names asked across a seam: each one offered by its part\'s contract')
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
