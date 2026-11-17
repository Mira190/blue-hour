"""A lift's street door set inside its building: a lobby cut into the ground floor.

    python pipeline/lobby.py --city shibuya        # then: python pipeline/pack.py

A lift in game.json "lifts" whose first stop stands on the pavement outside the building it climbs (SHIBUYA
SKY's stood three metres off Scramble Square's north face, a door to nowhere in the open air) and is named
in cities/<city>/city.json game.lobbies ({lift id: {"w", "d", "h"}}, metres: the opening's width, how far in
it goes, its height) gets what the real building has: a way in. The nearest face of the nearest building is opened: the solid is kept whole from h
upwards (a passage, so it gets a ceiling: buildings.json "passages"), a new solid is the same footprint
with the lobby taken out of it from the ground to h, and the stop is moved to the back of the lobby, where
the lift's doors would be. Roofs, plant and frontages stay with the solid they were on. Every other solid that
stands in the lobby below its ceiling (a building's ground floor in several solids) is cut back round it the same
way, so that nothing passes through the lift's portal (tools/lobby_check.py fails on one that does).

Rewrites web/data/<city>/buildings.json and game.json; a lift whose stop is already under a passage is left alone, so running it again changes nothing.
"""
import argparse
import json
import os

from shapely.geometry import Point, Polygon

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def poly(s):
    ring = lambda r: [(r[i] / 10, r[i + 1] / 10) for i in range(0, len(r), 2)]
    return Polygon(ring(s[4]), [ring(h) for h in s[5:]]).buffer(0)


def dm(coords):
    out = []
    for x, y in list(coords)[:-1]:
        out += [round(x * 10), round(y * 10)]
    return out


def room_of(stop, L, grow=0.0):
    """The lobby's floor plan from where its stop and its door are: from a metre outside the face to d in, w across."""
    fx, fy = stop["door"]
    nx, ny = stop["at"][0] - fx, stop["at"][1] - fy
    n = (nx * nx + ny * ny) ** 0.5
    nx, ny = nx / n, ny / n
    ux, uy, w, d = -ny, nx, L["w"] / 2 + grow, L["d"] + grow
    return Polygon([(fx - ux * w - nx * (1 + grow), fy - uy * w - ny * (1 + grow)), (fx + ux * w - nx * (1 + grow), fy + uy * w - ny * (1 + grow)),
                    (fx + ux * w + nx * d, fy + uy * w + ny * d), (fx - ux * w + nx * d, fy - uy * w + ny * d)])


def intruders(B, stop, L):
    """The solids that stand in a lobby below its ceiling: any whose foot is under h and whose plan reaches more than a
    few centimetres into the room (Scramble Square's ground floor is several solids; the lobby was cut from the nearest,
    and the next one stood in it, through the lift's portal and its sign)."""
    room = room_of(stop, L, grow=-0.05)
    return [k for k, s in enumerate(B["s"]) if s[2] < L["h"] * 10 and abs(s[4][0] / 10 - stop["door"][0]) < 300 and abs(s[4][1] / 10 - stop["door"][1]) < 300
            and poly(s).intersection(room).area > 0.01]


def clear(B, stop, L):
    """Every solid still standing in the lobby cut back round it, as the first was: kept whole from h up (a passage),
    and a new solid of what is left of its foot below h. Returns how many were cut."""
    room, n = room_of(stop, L), 0
    passages = set(B.get("passages", []))
    for k in intruders(B, stop, L):
        s = B["s"][k]
        low = poly(s).difference(room)
        if low.is_empty:
            pass  # (all of its foot is in the lobby: nothing of it stands below the ceiling)
        elif low.geom_type != "Polygon":
            raise SystemExit(f"the lobby at {stop['door']} would cut solid {k} in two")
        elif s[3] <= L["h"] * 10:  # (a solid wholly under the ceiling: its foot loses the room)
            s[4:] = [dm(low.exterior.coords)] + [dm(h.coords) for h in low.interiors]
            n += 1
            continue
        else:
            B["s"].append([s[0], s[1], s[2], round(L["h"] * 10), dm(low.exterior.coords)] + [dm(h.coords) for h in low.interiors])
        if s[3] <= L["h"] * 10:
            raise SystemExit(f"the lobby at {stop['door']} would take all of solid {k}")
        s[2] = round(L["h"] * 10)
        passages.add(k)
        n += 1
    B["passages"] = sorted(passages)
    return n


def cut(B, lift):
    stop, L = lift["stops"][0], lift["stops"][0]["lobby"]
    p = Point(stop["at"][0], stop["at"][1])
    passages = set(B.get("passages", []))
    if any(B["s"][k][2] > 0 and poly(B["s"][k]).contains(p) for k in passages):
        return clear(B, stop, L) > 0  # (cut already: only what still stands in it)
    k = min((k for k, s in enumerate(B["s"]) if s[2] == 0 and s[3] / 10 > L["h"] + 6 and abs(s[4][0] / 10 - p.x) < 300 and abs(s[4][1] / 10 - p.y) < 300),
            key=lambda k: poly(B["s"][k]).distance(p))
    s, P = B["s"][k], poly(B["s"][k])
    # the face nearest the stop, its direction and the way in
    ext = P.exterior
    foot = ext.interpolate(ext.project(p))
    a, b = ext.interpolate(max(0, ext.project(p) - 0.5)), ext.interpolate(min(ext.length, ext.project(p) + 0.5))
    ux, uy = b.x - a.x, b.y - a.y
    n = (ux * ux + uy * uy) ** 0.5
    ux, uy = ux / n, uy / n
    nx, ny = -uy, ux
    if not P.contains(Point(foot.x + nx * 0.5, foot.y + ny * 0.5)):
        nx, ny = -nx, -ny
    w, d = L["w"] / 2, L["d"]
    room = Polygon([(foot.x - ux * w - nx * 1.0, foot.y - uy * w - ny * 1.0), (foot.x + ux * w - nx * 1.0, foot.y + uy * w - ny * 1.0),
                    (foot.x + ux * w + nx * d, foot.y + uy * w + ny * d), (foot.x - ux * w + nx * d, foot.y - uy * w + ny * d)])
    low = P.difference(room)
    if low.geom_type != "Polygon":
        raise SystemExit(f"{lift['id']}: the lobby would cut its building in two")
    B["s"].append([s[0], s[1], 0, round(L["h"] * 10), dm(low.exterior.coords)] + [dm(h.coords) for h in low.interiors])
    s[2] = round(L["h"] * 10)
    B["passages"] = sorted(passages | {k})
    z = stop["at"][2] if len(stop["at"]) > 2 else None
    stop["at"] = [round(foot.x + nx * (d - 1.6), 2), round(foot.y + ny * (d - 1.6), 2)] + ([z] if z is not None else [])
    stop["door"] = [round(foot.x, 2), round(foot.y, 2)]  # (the opening in the face: where the way in is, for a goal or a sign)
    clear(B, stop, L)
    return True


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--city", required=True)
    a = ap.parse_args()
    d = os.path.join(ROOT, "web", "data", a.city)
    B = json.load(open(os.path.join(d, "buildings.json"), encoding="utf8"))
    raw = open(os.path.join(d, "game.json"), encoding="utf8").read()
    G = json.loads(raw)
    cfg = json.load(open(os.path.join(ROOT, "cities", a.city, "city.json"), encoding="utf8"))
    for l in G.get("lifts", []):  # (cities/<city>/city.json game.lobbies: {lift id: {w, d, h}})
        if l["id"] in cfg.get("game", {}).get("lobbies", {}):
            l["stops"][0]["lobby"] = cfg["game"]["lobbies"][l["id"]]
    n = sum(cut(B, l) for l in G.get("lifts", []) if l["stops"][0].get("lobby"))
    if n:
        json.dump(B, open(os.path.join(d, "buildings.json"), "w"), separators=(",", ":"))
        open(os.path.join(d, "game.json"), "w", encoding="utf8").write(json.dumps(G, separators=(",", ":")))
    print(f"{a.city}: {n} lobbies cut", [(l["id"], l["stops"][0]["at"]) for l in G.get("lifts", [])])


if __name__ == "__main__":
    main()
