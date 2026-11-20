"""Nothing passes through a lift's street lobby or the portal set in it.

    python3 tools/lobby_check.py [city]          # (tools/check.sh static)

A lift's street door is a lobby cut into its building's ground floor (pipeline/lobby.py, game.lobbies in
cities/<city>/city.json). Scramble Square's ground floor is several solids, and the lobby was once cut from the nearest
alone: the next one stood in it, through the left of the lift's portal and its SHIBUYA SKY sign. This fails on:
  - a building solid whose foot is below the lobby's ceiling and whose plan reaches into the lobby
    (more than OVER m², the room taken in by 5 cm for the decimetre grid);
  - a hall built in a lobby as a hero level of its own (game.json hero[] with "floor": SHIBUYA SKY's,
    cities/shibuya/hero_skylobby.py) whose solid parts (its posts: the glass wall's lites and the sign pillar; its belts)
    stand outside every lobby or in a solid below the lobby's ceiling.
Prints one line a lobby and a portal, FAIL for each fault, and exits 1 on any.
"""
import json
import os
import sys

from shapely.geometry import Point, Polygon

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "pipeline"))
from lobby import poly, room_of  # noqa: E402

OVER = 0.01  # m²
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
    for h in G.get("hero", []):
        if not h.get("floor"):
            continue
        pts = [Point(*q) for q in (h.get("posts") or []) + (h.get("belts") or [])]
        out = [p for p in pts if not any(r.contains(p) for r in rooms)]
        inside = [(k, p) for p in pts for k, s in enumerate(B["s"]) if s[2] < 60 and near(s, p.x, p.y) and poly(s).buffer(-0.05).contains(p)]
        for p in out[:3]:
            print(f"FAIL the hall {h['id']}: a post or belt at ({p.x:.2f}, {p.y:.2f}) stands outside every lift's lobby")
        for k, p in inside[:3]:
            print(f"FAIL the hall {h['id']}: a post or belt at ({p.x:.2f}, {p.y:.2f}) stands in solid {k}")
        fails += len(out) + len(inside)
        if not out and not inside:
            print(f"ok   the hall {h['id']}: its {len(pts)} posts and belt points inside its lobby, clear of every solid")
    if fails:
        sys.exit(1)


if __name__ == "__main__":
    main()
