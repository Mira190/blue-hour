#!/usr/bin/env python3
"""A standpoint is never inside a body or a thing (issue 126): read from the map's story as it is written.

For every frame of every episode in cities/<map>/city.json: who stands there (the cast, all evening; the frame's
afterimages; the map's NPC it sends the player to; the guide where he first appears) and what stands there (the thing of
1964 the frame's camera sees, `task.relic`), against each other and against every place the story sends the player to
stand (`task.stand`, `stop_at`, `task.hint_at`). In frame 6 the goal sent the player to the stone blossom the old man
holds, and the two stood in one body; the game now keeps the player out of the story's people (web/game/game.js
storyFigure), and this keeps the places apart on paper, before a play.

  FAIL  two who stand within BODY (0.6 m) of each other; a standpoint within BODY of someone or inside a thing
  note  a standpoint whose ring (within_m) someone stands in: there is room in it, and it is said

  python3 tools/standpoints.py [map]        exits 1 on a FAIL
"""
import json
import math
import sys

BODY = 0.6     # m between two middles that leaves each a body's width (the player stops 0.57 m from one of them)
THING = 0.9    # m from the middle of a thing of 1964 (a box and stool, a board, a lamp) to anyone's middle


def main():
    city = sys.argv[1] if len(sys.argv) > 1 else 'shibuya'
    game = json.load(open(f'cities/{city}/city.json'))['game']
    npcs = {n['id']: n for n in game.get('npcs', [])}
    story = game.get('story') or {}
    fails = notes = pairs = 0

    def d(a, b):
        return math.hypot(a[0] - b[0], a[1] - b[1])

    def level(a, b):
        return len(a) < 3 or len(b) < 3 or abs(a[2] - b[2]) < 1.5

    for ep in story.get('episodes', [story]):
        cast = [(f"{c.get('name') or c['id']} (cast)", c['at']) for c in ep.get('cast', []) if c.get('at')]
        for i, fr in enumerate(ep.get('frames', [])):
            n = i + 1
            who = list(cast)
            for k in ('afterimage', 'afterimage2'):
                a = fr.get(k)
                if a and a.get('at'):
                    who.append((f"{a.get('name', k)} (afterimage)", a['at']))
            m = fr.get('meet') or {}
            if m.get('npc') in npcs:
                who.append((f"{npcs[m['npc']].get('name', m['npc'])} (npc)", npcs[m['npc']]['at']))
            g = ep.get('guide') or {}
            if i == 0 and g.get('from'):
                who.append(('the guide, where he is first seen', g['from']))
            t = fr.get('task') or {}
            things = [(f"{t['relic'].get('name', 'the thing of 1964')}", t['relic']['at'])] if (t.get('relic') or {}).get('at') and not t['relic'].get('over') else []
            stands = [(k, v, r) for k, v, r in (('task.stand', t.get('stand'), t.get('within_m') or 0), ('stop_at', fr.get('stop_at'), 0), ('task.hint_at', t.get('hint_at'), 0)) if v]
            for a in range(len(who)):
                for b in range(a + 1, len(who)):
                    if not level(who[a][1], who[b][1]):
                        continue
                    pairs += 1
                    x = d(who[a][1], who[b][1])
                    if x < BODY:
                        fails += 1
                        print(f'FAIL frame {n}: {who[a][0]} and {who[b][0]} stand {x:.2f} m apart (a body is {BODY} m)')
            for name, at in who:
                for tn, ta in things:
                    pairs += 1
                    x = d(at, ta)
                    if x < THING:
                        fails += 1
                        print(f'FAIL frame {n}: {name} stands {x:.2f} m from the middle of {tn}')
            for k, at, r in stands:
                for name, wa in who:
                    if not level(at, wa):
                        continue
                    pairs += 1
                    x = d(at, wa)
                    if x < BODY:
                        fails += 1
                        print(f'FAIL frame {n}: {k} ({at[0]}, {at[1]}) is {x:.2f} m from {name}: the player is sent to stand in them')
                    elif r and x < r:
                        notes += 1
                        print(f'note frame {n}: {name} stands in the ring of {k} ({x:.2f} m from its middle, ring {r} m): the player stands beside them')
                for tn, ta in things:
                    pairs += 1
                    x = d(at, ta)
                    if x < THING:
                        fails += 1
                        print(f'FAIL frame {n}: {k} is {x:.2f} m from the middle of {tn}: the player stands in it')
    print(f'{"FAIL" if fails else "ok"}: {pairs} pairs of places in the story of {city}; {fails} inside each other, {notes} sharing a ring')
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main())
