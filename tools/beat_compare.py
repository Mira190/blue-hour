"""Two plays' counts side by side, still by still, and what was drawn in one still of each (tools/story_play.js BUDGET=file
BUDGET_BY=1): python3 tools/beat_compare.py before.jsonl after.jsonl [still] [n]"""
import json
import sys

def load(p):
    return {d["still"]: d for d in map(json.loads, open(p))}

a, b = load(sys.argv[1]), load(sys.argv[2])
print(f"{'still':34} {'draws':>11} {'triangles':>17} {'passes':>7} {'GPU MB':>11}")
for k in a:
    if k not in b:
        continue
    x, y = a[k], b[k]
    print(f"{k[:34]:34} {x['draws']:5}>{y['draws']:5} {x['tris'] / 1e3:7.0f}k>{y['tris'] / 1e3:6.0f}k {x['passes']:3}>{y['passes']:3} {x.get('gpu_mb', 0):5.0f}>{y.get('gpu_mb', 0):5.0f}")
if len(sys.argv) > 3:
    k, n = sys.argv[3], int(sys.argv[4]) if len(sys.argv) > 4 else 25
    ga = {g["group"]: g for g in a[k].get("groups", [])}
    gb = {g["group"]: g for g in b[k].get("groups", [])}
    keys = sorted(set(ga) | set(gb), key=lambda g: -max(ga.get(g, {}).get("tris", 0), gb.get(g, {}).get("tris", 0)))
    for g in keys[:n]:
        p, q = ga.get(g, {}), gb.get(g, {})
        print(f"  {g[:60]:60} {p.get('draws', 0):4}>{q.get('draws', 0):4} {p.get('tris', 0) / 1e3:7.1f}k>{q.get('tris', 0) / 1e3:6.1f}k")
