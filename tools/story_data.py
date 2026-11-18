"""The story's data, edited as data: cities/<city>/city.json holds game.story on one line (json.dumps with its default
separators), and web/data/<city>/game.json holds the same story, written compact. This loads the story, hands it to an
edit, writes it back in place in both files byte for byte as they are written, and leaves the rest of each file as it
was; then run python pipeline/pack.py.
    from story_data import edit
    with edit('shibuya') as S: S['episodes'][0]['frames'][1]['task']['within_m'] = 1.2
"""
import contextlib
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@contextlib.contextmanager
def edit(city='shibuya'):
    cp = os.path.join(ROOT, 'cities', city, 'city.json')
    gp = os.path.join(ROOT, 'web', 'data', city, 'game.json')
    t = open(cp, encoding='utf8').read()
    story = json.loads(t)['game']['story']
    was = json.dumps(story, ensure_ascii=False)
    if t.count(was) != 1:
        raise SystemExit('the story is not on one line of city.json as json.dumps writes it')
    yield story
    t = t.replace(was, json.dumps(story, ensure_ascii=False))
    open(cp, 'w', encoding='utf8').write(t)
    G = json.load(open(gp, encoding='utf8'))
    G['story'] = story
    open(gp, 'w', encoding='utf8').write(json.dumps(G, separators=(',', ':')))
