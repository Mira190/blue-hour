"""Nothing passes through a lift's street lobby or the portal set in it.

    python3 tools/lobby_check.py [city]          # (tools/check.sh static)

A lift's street door is a lobby cut into its building's ground floor (pipeline/lobby.py, game.lobbies in
cities/<city>/city.json). Scramble Square's ground floor is several solids, and the lobby was once cut from the nearest
alone: the next one stood in it, through the left of the lift's portal and its SHIBUYA SKY sign. This fails on:
  - a building solid whose foot is below the lobby's ceiling and whose plan reaches into the lobby
    (more than OVER m², the room taken in by 5 cm for the decimetre grid);
  - a story's lift portal (an episode's `set` of model "lift", blender/build_set.py: its wall plate, the sign over it
    and the queue belts in front, x -2.9..2.9 and y -2.5..0.14 in the model, 3.3 m high) that crosses a solid standing
    below its top, or that stands outside the lobby it is set in.
Prints one line a lobby and a portal, FAIL for each fault, and exits 1 on any.
"""
import json
import math
import os
import sys

from shapely.geometry import Polygon

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "pipeline"))
from lobby import poly, room_of  # noqa: E402

OVER = 0.01  # m²
PORTAL = (-2.9, -2.5, 2.9, 0.14, 3.3)  # (the lift's portal in the model: x0, y0, x1, y1, its top)


def portal(r):
    h = math.radians(r.get("h", 0))
    c, s = math.cos(h), math.sin(h)
    x0, y0, x1, y1, _ = PORTAL
    return Polygon([(r["at"][0] + x * c - y * s, r["at"][1] + x * s + y * c) for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))])


def main():
    city = sys.argv[1] if len(sys.argv) > 1 else "shibuya"
    d = os.path.join(ROOT, "web", "data", city)
    B = json.load(open(os.path.join(d, "buildings.json"), encoding="utf8"))
    G = json.load(open(os.path.join(d, "game.json"), encoding="utf8"))
    near = lambda s, x, y: abs(s[4][0] / 10 - x) < 300 and abs(s[4][1] / 10 - y) < 300
    fails, rooms = 0, []
    for l in G.get("lifts", []):
        st = l["stops"][0]
        if not st.get("lobby") or not st.get("door"):
            continue
        L, room = st["lobby"], room_of(st, st["lobby"], grow=-0.05)
        rooms.append(room_of(st, L, grow=0.05))
        hit = [(k, round(poly(s).intersection(room).area, 2)) for k, s in enumerate(B["s"]) if s[2] < L["h"] * 10 and near(s, *st["door"])
               and poly(s).intersection(room).area > OVER]
        for k, a in hit:
            print(f"FAIL {l['id']}: solid {k} (building {B['s'][k][0]}) stands {a} m² into the lobby below its ceiling: python pipeline/lobby.py --city {city}")
        fails += len(hit)
        if not hit:
            print(f"ok   {l['id']}: the lobby at {st['door']} clear, {L['w']} by {L['d']} m to {L['h']} m")
    sets = [r for e in (G.get("story") or {}).get("episodes", []) for r in e.get("set", []) if r.get("model") == "lift"]
    for r in sets:
        P, top = portal(r), PORTAL[4] * 10
        hit = [(k, round(poly(s).intersection(P).area, 2)) for k, s in enumerate(B["s"]) if s[2] < top and near(s, *r["at"]) and poly(s).intersection(P).area > OVER]
        for k, a in hit:
            print(f"FAIL the lift portal at {r['at']}: solid {k} (building {B['s'][k][0]}) passes through it ({a} m²)")
        out = not any(q.contains(P) for q in rooms)
        if out:
            print(f"FAIL the lift portal at {r['at']} stands outside every lift's lobby")
        fails += len(hit) + out
        if not hit and not out:
            print(f"ok   the lift portal at {r['at']}: whole, inside its lobby")
    if fails:
        sys.exit(1)


if __name__ == "__main__":
    main()
