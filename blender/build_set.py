"""Build the story's own set dressing for tonight: web/assets/story/set.glb (web/game/past.js draws it, a story
episode's `set` places it).

  lift      the lift's doors at the back of its lobby: a stone wall, a steel portal with its two leaves shut on a line
            of light, the floor indicator over them with its arrow, the lift's name in lit letters over that, the call
            plate, a mat with a lit edge, two posts and a rope; and the lobby round them, lined (LOBBY: its floor of
            stone in courses, its panelled walls with a line of light at their foot, its ceiling of lines of light)
  skysign   the same name in larger lit letters with an arrow, for over the lobby's opening on the street

Life size in metres; each stands at its origin on the floor and faces -Y (the way you come to it), +Z up. Colour is
in the vertices; the page lights them itself, so a letter that is meant to be lit is simply bright.

    blender -b -P blender/build_set.py                  # or: pip install bpy==5.2.3; python blender/build_set.py
    blender -b -P blender/build_set.py -- --preview DIR # also render a still of each into DIR
"""
import math
import os
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_past import blob, box, lathe  # noqa: E402
from build_stop import ROOT, compress, hexc, join, make, preview  # noqa: E402

OUT = os.path.join(ROOT, "web", "assets", "story")


def text(body, size, at, col, depth=0.012, name="text"):
    """Letters standing on the wall plane, facing -Y: Blender's own face, turned from a curve into a mesh."""
    cu = bpy.data.curves.new(name, "FONT")
    cu.body, cu.size, cu.extrude, cu.align_x, cu.align_y = body, size, depth, "CENTER", "BOTTOM"
    ob = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(ob)
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(bpy.context.evaluated_depsgraph_get()))
    V = np.array([v.co[:] for v in me.vertices], float)
    F = [tuple(p.vertices) for p in me.polygons]
    bpy.data.objects.remove(ob)
    V = np.c_[V[:, 0] + at[0], -V[:, 2] + at[1], V[:, 1] + at[2]]  # (written in x-y, stood up into x-z)
    out = make(name, V, F, np.tile(col, (len(V), 1)))
    for p in out.data.polygons:
        p.use_smooth = False
    return out


def arrow(x, z, s, col, y=-0.02):
    """An up arrow: a head and a stem."""
    V = np.array([(x - s, y, z), (x + s, y, z), (x, y, z + s * 1.1), (x - s * 0.32, y, z - s * 0.9), (x + s * 0.32, y, z - s * 0.9), (x + s * 0.32, y, z), (x - s * 0.32, y, z)])
    ob = make("arrow", V, [(0, 1, 2), (3, 4, 5, 6)], np.tile(col, (7, 1)))
    for p in ob.data.polygons:
        p.use_smooth = False
    return ob


# The lobby the lift's doors stand at the back of: the opening cut into Scramble Square's north face (pipeline/lobby.py,
# city.json game.lobbies "sky-gate": 10 m across, 8 m in, 6 m over the tower's base, which is 5.35 m over the street at the
# doors), the doors 7.8 m in from its face. Lined, so that
# what is round you in it is a lobby's and not the tower's own glazing seen from inside: the SKY lifts' black finishes and
# lines of light (Elevator Journal 28; the 45F LEADING LINE), dark panelled walls to the ceiling, a floor of charcoal stone
# laid in courses, and a ceiling of lines of light that lead from the street to the doors.
LOBBY = {"half": 4.95, "in": 7.8, "h": 5.25, "panel": 1.2, "tile": (1.2, 0.6), "joint": 0.008}  # (h: under the cut's ceiling, 6 m over the tower's base, 5.35 m over the street at the doors)


def lobby(stone, dark, lit):
    L, parts = LOBBY, []
    hw, d, h, j = L["half"], L["in"], L["h"], L["joint"]
    floor, seam = hexc(0x45474c), hexc(0x24262a)
    # the floor: a slab of the joints' colour and on it the stones, each the same, laid in courses across the way in,
    # every other course half a stone over (a running bond); 1.2 by 0.6 m, the joints 8 mm
    parts.append(box(-hw, -d, 0.0, hw, 0.0, 0.006, seam, "lobby"))
    tw, td = L["tile"]
    for r in range(int(math.ceil(d / td))):
        y1, y0 = -r * td, max(-d, -(r + 1) * td)
        x = -hw - (tw / 2 if r % 2 else 0.0)
        while x < hw:
            x0, x1 = max(-hw, x), min(hw, x + tw)
            if x1 - x0 > 0.05:
                parts.append(box(x0 + j / 2, y0 + j / 2, 0.0, x1 - j / 2, y1 - j / 2, 0.012, floor))
            x += tw
    # the side walls, panels of the stone floor to ceiling with a reveal between each (a cause for every line on them)
    for sx in (-1, 1):
        x0, x1 = sorted((sx * (hw - 0.04), sx * hw))
        parts.append(box(x0, -d, 0.0, x1, 0.0, h, seam))
        y = 0.0
        while y > -d + 0.05:
            y0 = max(-d, y - L["panel"])
            parts.append(box(x0 - sx * 0.012, y0 + j / 2, 0.0, x1 - sx * 0.012, y - j / 2, h, stone))
            y = y0
        # a line of light along the foot of each wall, as the 45F corridor's
        parts.append(box(x0 - sx * 0.02, -d + 0.2, 0.06, x1 - sx * 0.02, -0.25, 0.085, lit))
    # the back wall round the doors, floor to ceiling
    parts.append(box(-hw, 0.004, 0.0, hw, 0.14, h, stone))  # (a hair behind the portal's own wall, which it carries on round)
    # the ceiling: dark, and five lines of light from over the way in to over the doors
    parts.append(box(-hw, -d, h - 0.02, hw, 0.0, h, dark))
    for x in (-3.2, -1.6, 0.0, 1.6, 3.2):
        parts.append(box(x - 0.025, -d + 0.35, h - 0.045, x + 0.025, -0.35, h - 0.02, lit))
    return parts


def lift():
    stone, steel, leaf, dark, lit, amber, mat, rope = (hexc(h) for h in (0x2b2f36, 0xc3c8ce, 0x9aa0a8, 0x101216, 0xfff3d2, 0xffb45a, 0x1b1d22, 0x8a2f2a))
    parts = [box(-2.9, 0.0, 0.0, 2.9, 0.14, 3.3, stone, "lift")]
    # the portal: jambs and lintel proud of the wall, the two leaves in it, shut on a line of light
    parts += [box(-1.22, -0.2, 0.0, -1.06, 0.02, 2.44, steel), box(1.06, -0.2, 0.0, 1.22, 0.02, 2.44, steel), box(-1.22, -0.2, 2.3, 1.22, 0.02, 2.44, steel)]
    parts += [box(-1.06, -0.08, 0.0, -0.012, -0.03, 2.3, leaf), box(0.012, -0.08, 0.0, 1.06, -0.03, 2.3, leaf), box(-0.012, -0.06, 0.0, 0.012, -0.04, 2.3, lit)]
    for x in (-0.54, 0.54):  # a kick plate and a rail on each leaf
        parts += [box(x - 0.48, -0.085, 0.0, x + 0.48, -0.08, 0.22, steel), box(x - 0.4, -0.11, 1.02, x + 0.4, -0.085, 1.06, steel)]
    # over the doors: the indicator (an arrow and the floor it goes to), and over that the lift's name, lit
    parts += [box(-0.5, -0.03, 2.52, 0.5, 0.0, 2.78, dark), arrow(-0.3, 2.65, 0.075, amber, y=-0.035), text("46F", 0.15, (0.12, -0.035, 2.575), amber)]
    parts += [box(-2.3, -0.03, 2.88, 2.3, 0.0, 3.26, dark), text("SHIBUYA SKY", 0.25, (0.0, -0.035, 2.95), lit, depth=0.02)]
    # the call plate, its button a ring of light
    parts += [box(1.4, -0.03, 1.0, 1.56, 0.0, 1.32, steel), lathe([(0.03, 0.0, amber), (0.03, 0.012, amber), (0.0, 0.013, lit)], seg=12)]
    b = parts.pop()
    b.rotation_euler = (math.pi / 2, 0, 0)
    b.location = (1.48, -0.03, 1.16)
    bpy.context.view_layer.objects.active = b
    bpy.ops.object.select_all(action="DESELECT")
    b.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True)
    parts.append(b)
    # the way to it: a mat with a lit edge, two posts and a belt from each, drawn taut to a catch on the wall (a lobby's
    # retractable queue belt: one straight strap, not a rope in pieces); web/game/game.js makes them solid
    parts += [box(-1.25, -2.4, 0.0, 1.25, -0.2, 0.02, mat), box(-1.25, -2.46, 0.0, 1.25, -2.4, 0.03, amber)]
    for x in (-1.5, 1.5):
        parts.append(lathe([(0.16, 0.0, steel), (0.16, 0.03, steel), (0.025, 0.05, steel), (0.025, 0.86, steel), (0.045, 0.86, steel), (0.045, 0.99, steel), (0.0, 1.0, steel)], seg=12, at=(x, -2.2, 0)))
        parts += [box(x - 0.006, -2.155, 0.87, x + 0.006, -0.04, 0.92, rope), box(x - 0.03, -0.04, 0.85, x + 0.03, 0.0, 0.94, steel)]
    # (the lobby's light is its ceiling's lines, 5.25 m up: the downlights that hung at 3.3 m, under nothing, are gone)
    parts += lobby(stone, dark, lit)
    parts.append(blob(2.6, 1.6, at=(0, -1.3), dark=0.35))
    return join("lift", parts)


def skysign():
    dark, lit, amber = hexc(0x101216), hexc(0xfff3d2), hexc(0xffb45a)
    return join("skysign", [box(-3.6, 0.0, 0.0, 3.6, 0.12, 1.1, dark, "skysign"), text("SHIBUYA SKY", 0.62, (0.5, -0.03, 0.25), lit, depth=0.04), arrow(-3.0, 0.58, 0.26, amber, y=-0.04)])


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    os.makedirs(OUT, exist_ok=True)
    obs = [lift(), skysign()]
    if "--preview" in argv:
        for ob, s in zip(obs, (0.3, 0.2)):
            ob.scale = (s, s, s)
            ob.location = (0, 0, -0.4)
        preview(argv[argv.index("--preview") + 1], obs)
        return
    path = os.path.join(OUT, "set.glb")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.export_scene.gltf(filepath=path, export_format="GLB", use_selection=True, export_vertex_color="ACTIVE", export_normals=True,
                              export_materials="EXPORT", export_cameras=False, export_lights=False, export_animations=False, export_texcoords=False)
    compress(path)
    print(f"  {os.path.relpath(path, ROOT)}: {os.path.getsize(path) / 1e3:.0f} kB")


if __name__ == "__main__":
    main()
