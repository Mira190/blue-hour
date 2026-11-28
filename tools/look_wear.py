"""A look says only what it changes (the owner's iPhone, 28 November 2026: Mei's look asked for a blue-grey top, and she
wore a black hoodie with neon cords and a purple print). A look's top and legs colours (top, shirt, legs, pants) reach
only the old painted characters, at run time (actors.js makePerson, people.js paletteMaterial). A Rocketbox character
(R_...) wears what its picture and its tags say (blender/build_people.py: its clothes chosen by casting and retouched by
its tags at the build), and never read them. Ten looks of the map's people carried colours from when they were painted
characters; none was ever drawn, and Riko's said mustard against her green top and the story's "a green top". So a
Rocketbox look names no clothes' colour: what one wears is chosen by its character, and seen in tools/talk_shot.js.
    python3 tools/look_wear.py            # every city; prints ok or FAIL per look, exits 1 on a FAIL
"""
import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    bad = n = 0
    for path in sorted(glob.glob(os.path.join(ROOT, "cities", "*", "city.json"))):
        city = os.path.basename(os.path.dirname(path))
        for npc in (json.load(open(path, encoding="utf8")).get("game") or {}).get("npcs", []):
            look = npc.get("look") or {}
            cid = look.get("character", "")
            if not cid.startswith("R_"):
                continue
            n += 1
            named = [k for k in ("top", "shirt", "legs", "pants") if k in look]
            if named:
                bad += 1
                print(f"FAIL {city} {npc['id']}: its look names {', '.join(f'{k} {look[k]}' for k in named)}, which {cid} never "
                      f"wears: a Rocketbox character wears its picture and its tags (blender/build_people.py)")
    if not bad:
        print(f"ok   look_wear {n} Rocketbox looks name no clothes' colour their character does not wear")
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
