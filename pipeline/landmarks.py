"""Parametric landmark meshes for a city, from the hooks in cities/<id>/city.py
(landmark_meshes(scene) -> (materials, meshes)). Cities without hooks get an
empty file. The output is shared by the web viewer and the Blender script, so
both show the same geometry. A city whose materials take an image (`map`) draws it
with landmark_assets(out_dir, scene), which writes the image next to landmarks.json.
landmark_glows(scene) -> [[x, y, radius m, colour, strength(, on hour, off hour)], ...] adds the light
a landmark's screens and signs throw on the street after dark (web/night.js), while they are on. landmark_demolished(scene) ->
[solid index, ...] names solids of the built city that have been pulled down since its survey:
the viewer and the game neither draw them nor let them stand in the surface model (web/world.js),
until the city's next build leaves them out itself. landmark_treeless(scene) -> [[x, y, ...] in decimetres, ...]: rings where
no mapped or wood tree stands (a viaduct and its platforms over trees mapped on the ground, web/world.js).
landmark_meshes may return a third item, more keys for landmarks.json: "hidden", solids of the built city that a
landmark mesh draws instead (not drawn, but kept in the surface model, as scene.json's hidden_solids); "props", street furniture
drawn once per kind and instanced at every [x, y, z, heading(, scale across)] in "at", within
"far" metres; "clip", regions ({ring, holes}) where the viewer does not draw the ground above
the water (under paving, and in front of a seawall) (web/world.js); "seawalls", the face of a
seawall the landmark draws itself, polylines [[x, y], ...] with the water on their right, where a
walker stops at its edge (web/quays.js); "trees", a landmark's own trees, [x, y, z, height] in decimetres as
places.json's, standing at z (a roof garden's, on its terraces), drawn after the woods' in the city's mix (web/world.js).
"water_cover": rings [[x, y], ...] where the water closes over the aerial photograph of the bottom (a deck over a
river the photograph shows wider than the landmark draws it) (web/world.js waterCover).

    python pipeline/landmarks.py --city sydney      # reads/writes web/data/<city>
"""
import json
import os

import numpy as np

import bridges
import webtex
from cityctx import city_args


BACK_M = 0.05   # how far behind its picture a sign's back stands (m)


def sign_backs(materials, meshes):
    """A sign's back: every upright face that carries a picture (an atlas's sign, a print, a screen) gets a plain
    painted panel BACK_M behind it, facing the other way. The landmarks' materials are drawn double-sided, so a
    picture with nothing behind it is seen from behind, mirrored: from the street past a scaffold's advert, from a
    deck above it, from the helicopter (tools/sign_check.py). Against a wall the panel is out of sight; a floor's
    picture (a compass, a marking) is left as it is."""
    pos, idx = [], []
    for m in meshes:
        mt = materials.get(m["material"], {})
        if not mt.get("map") or mt["map"].startswith("ground") or mt.get("cutout") or "uv" not in m:
            continue
        P = np.asarray(m["position"], float).reshape(-1, 3)
        for i, j, k in np.asarray(m["index"], int).reshape(-1, 3):
            a, b, c = P[i], P[j], P[k]
            n = np.cross(b - a, c - a)
            ln = np.linalg.norm(n)
            if ln < 0.02 or abs(n[2]) / ln > 0.7:   # a sliver, or a floor's picture
                continue
            d = -n / ln * BACK_M
            base = len(pos)
            pos += [a + d, c + d, b + d]   # wound the other way: its face is the back
            idx += [base, base + 1, base + 2]
    if not pos:
        return None
    materials.setdefault("sign_back", {"color": "#45484c", "roughness": 0.6, "metalness": 0.35, "solid": False})
    return {"name": "sign_back", "material": "sign_back", "smooth": False, "floodlit": False,
            "position": np.round(np.asarray(pos), 3).ravel().tolist(), "index": idx}


OUT_M = 0.06   # a picture moved out of a building stands this far off its face
OUT_REACH_M = 30.0   # ... and is moved no further than this the way it faces


def signs_out(city, materials, meshes, hidden=()):
    """A picture stands in front of its building's face, never inside it (issue 169): how many were moved.

    A sign is placed by its own generator from the footprint that generator read (the Scramble's own outline of a
    building, a survey of the street), and the building the page draws there is the city model's solid: where the two
    differ by a hand's breadth the picture's front lay inside the solid, in the wall or behind it (a blade sign at
    Center Gai's mouth stood 0.65 m into its building, the station's hoarding prints 0.25 m). So each upright picture
    (a quad as its generator wrote it) whose middle and whose front lie inside one of the buildings' solids at its
    height is moved out of it: a board the way it faces, to the face of the solid it is to be read on (the station's
    hoarding stood on the Scramble's own outline of the station, 16 m inside the city model's box: it goes to the
    box's side on the square), a blade (two faces back to back) through the nearest face until its root is at the
    wall. What stood on the ground is set on the ground where it now is. tools/sign_check.py fails one left inside."""
    bp = os.path.join(city.out, "buildings.json")
    if not os.path.exists(bp):
        return 0
    import shapely
    from shapely.geometry import LineString, Point, Polygon
    B = json.load(open(bp, encoding="utf8"))
    hidden, polys, zs = set(hidden), [], []
    for si, sd in enumerate(B["s"]):
        if si in hidden or len(sd[4]) < 6:
            continue
        g = Polygon(np.asarray(sd[4], float).reshape(-1, 2) / 10)
        polys.append(g if g.is_valid else g.buffer(0))
        zs.append(((sd[1] + sd[2]) / 10, (sd[1] + sd[3]) / 10))
    tree, moved = shapely.STRtree(polys), 0
    import levels
    GL = None
    for m in meshes:
        mt = materials.get(m["material"], {})
        if not mt.get("map") or mt["map"].startswith("ground") or mt.get("cutout") or "uv" not in m:
            continue
        P = np.asarray(m["position"], float).reshape(-1, 3)
        I = np.asarray(m["index"], int).reshape(-1, 3)
        quads, t = [], 0
        while t < len(I):
            vs, step = set(I[t].tolist()), 1
            if t + 1 < len(I) and len(vs & set(I[t + 1].tolist())) == 2:   # a quad's two triangles
                vs, step = vs | set(I[t + 1].tolist()), 2
            a, b, c = P[I[t]]
            n = np.cross(b - a, c - a)
            ln = np.linalg.norm(n)
            t += step
            if ln >= 0.02 and abs(n[2]) / ln <= 0.7:
                quads.append((sorted(vs), n / ln))
        ctrs = [P[vs].mean(0) for vs, _ in quads]
        changed = False
        for k, (vs, n) in enumerate(quads):
            ctr = ctrs[k]
            for j in tree.query(Point(*ctr[:2])):
                g = polys[j]
                if not (zs[j][0] - 0.05 <= ctr[2] <= zs[j][1] + 0.05 and g.contains(Point(*ctr[:2])) and g.contains(Point(*(ctr[:2] + n[:2] * 0.25)))):
                    continue
                # a blade (a face with its twin back to back) goes out through the nearest face and keeps its depth; a
                # board goes out the way it faces, to the face it is to be read on
                twin = any(q != k and float(n @ quads[q][1]) < -0.9 and np.linalg.norm(ctrs[q] - ctr) < 0.6 for q in range(len(quads)))
                d2 = n[:2] / (np.hypot(*n[:2]) or 1.0)
                ahead = LineString([ctr[:2], ctr[:2] + d2 * OUT_REACH_M]).intersection(g.exterior)
                if not twin and not ahead.is_empty:
                    out = d2
                    depth = min(float((np.array(q_.coords[0]) - ctr[:2]) @ d2) for q_ in getattr(ahead, "geoms", [ahead]) if q_.geom_type == "Point")
                else:
                    q_ = g.exterior.interpolate(g.exterior.project(Point(*ctr[:2])))
                    out = np.array([q_.x - ctr[0], q_.y - ctr[1]])
                    if np.hypot(*out) < 1e-6:
                        continue
                    out /= np.hypot(*out)
                    depth = max(float((q_.x - P[v, 0]) * out[0] + (q_.y - P[v, 1]) * out[1]) for v in vs)
                # (what stood on the ground stands on the ground where it now is: its foot as far under it as it was)
                GL = GL or levels.Levels(city.id)
                lo = P[vs, 2].min()
                foot = [v for v in vs if P[v, 2] - lo < 0.01]
                was = float(np.min(GL.at(P[foot, 0], P[foot, 1]))) - lo
                P[vs, :2] += out * (depth + OUT_M)
                if abs(was) < 1.0:
                    P[vs, 2] += float(np.min(GL.at(P[foot, 0], P[foot, 1]))) - was - lo
                ctrs[k] = P[vs].mean(0)
                moved, changed = moved + 1, True
                break
        if changed:
            m["position"] = np.round(P, 3).ravel().tolist()
    return moved


def main():
    city, _ = city_args(__doc__.splitlines()[0])
    scene = json.load(open(os.path.join(city.out, "scene.json")))
    hook = city.hook("landmark_meshes")
    got = hook(scene) if hook else ({}, [])
    materials, meshes, extra = got if len(got) == 3 else (*got, {})  # extra: "props", "clip" (see above)
    bm, bmeshes = bridges.meshes(scene)   # the bridges over the water the city does not draw itself (bridges.py)
    materials, meshes = {**materials, **bm}, list(meshes) + bmeshes
    if city.hook("landmark_assets"):
        files = city.hook("landmark_assets")(city.out, scene) or []
        done = webtex.landmark_maps(city.out, materials, files)   # shipped as WebP (pipeline/webtex.py)
        for f in files:
            f = done.get(f, f)
            print(f"{f}: {os.path.getsize(os.path.join(city.out, f)) / 1e6:.2f} MB")
    # a material whose image this city never writes and no mesh uses (one a shared module defines for another
    # city: Shibuya's Hachiko lilyturf in Shinjuku) is left out, or the viewer asks for the missing image
    used = {m.mat for m in meshes} | {q.get("material") for p in extra.get("props", []) for q in p.get("parts", [])}
    for k in [k for k, v in materials.items() if v.get("map") and k not in used and not os.path.exists(os.path.join(city.out, v["map"]))]:
        print(f"  material {k}: unused, its image {materials[k]['map']} not here; left out")
        del materials[k]
    dumped = [m.dump() for m in meshes]
    n_out = signs_out(city, materials, dumped, list(extra.get("hidden", [])) + list(extra.get("demolished", [])))
    if n_out:
        print(f"  {n_out} pictures moved out of a building to its face")
    back = sign_backs(materials, dumped)
    if back:
        dumped.append(back)
    out = {"materials": materials, "meshes": dumped,
           "notes": "Parametric; dimensions from published figures, anchors from OpenStreetMap footprints." if meshes else "No parametric landmarks."}
    out.update(extra)
    # what was built by the one rule of levels (pipeline/levels.py): each run of bays with its tops and feet, and each
    # footing, for tools/levels_check.py to hold against the ground as it is, and for street_ground.py, which does not
    # keep the survey's lumps under what follows the ground by rule
    import levels
    levels.save(city.id)   # (beside the city's sources, cities/<id>/levels.json: the page has no use for it)
    if city.hook("landmark_glows"):
        out["glows"] = city.hook("landmark_glows")(scene)
    if bridges.glows(scene):
        out["glows"] = out.get("glows", []) + bridges.glows(scene)
    if city.hook("landmark_demolished"):
        out["demolished"] = city.hook("landmark_demolished")(scene)
    if city.hook("landmark_treeless"):
        out["treeless"] = city.hook("landmark_treeless")(scene)
    if city.hook("landmark_bare"):   # rings as "treeless": where no lamp or bench of the map's stands (web/streets.js tidy)
        out["bare"] = city.hook("landmark_bare")(scene)
    path = os.path.join(city.out, "landmarks.json")
    # the passages through the landmarks (pipeline/landmark_passages.py): kept until that script measures them
    # again on the new meshes, which it does here when the segments it reads are cached (data/raw/<id>)
    old = json.load(open(path)) if os.path.exists(path) else {}
    if old.get("passages"):
        out["passages"] = old["passages"]
    json.dump(out, open(path, "w"), separators=(",", ":"))
    for p in extra.get("props", []):
        print(f"  props: {len(p['at'])} x {p['name']} ({sum(len(q['index']) // 3 for q in p['parts'])} triangles each)")
    print(f"{sum(len(m.v) for m in meshes)} vertices, {sum(len(m.i) for m in meshes) // 3} triangles -> {path}"
          f" ({os.path.getsize(path) / 1e6:.2f} MB)")
    if os.path.exists(os.path.join(city.raw, "overture_passages.json")):
        import subprocess
        import sys
        subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), "landmark_passages.py"), "--city", city.id], check=True)
    elif out.get("passages"):
        print("  passages kept from before: run pipeline/landmark_passages.py to measure them on the new meshes")


if __name__ == "__main__":
    main()
