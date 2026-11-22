"""Find signs whose words read mirrored, in every city's built landmarks (web/data/<id>/landmarks.json).

Signs are drawn double-sided, so a face seen from behind shows its picture mirrored. Two faults make
that happen:
  - a face whose picture runs against its own winding (u x v points into the face): mirrored from the
    front it was built to be read from;
  - a sign read from both sides (a blade standing out from a wall, a box sign) built as two faces back
    to back where each face sits on the far side of the other: from either side the near face is seen
    from behind, so both sides read mirrored.
  - a face wound the right way but turned the wrong way: its front against a wall, a girder or the inside
    of a building, its open side behind it. People stand on the open side, so they see it from behind.
    Each face is cast from its middle along its normal and back: blocked within half a metre in front
    and open behind is a fault. What blocks is every landmark's triangles and the map's buildings (their
    walls, from buildings.json, less the ones a landmark stands in for);
  - an upright face with nothing within half a metre behind it: anyone who passes behind it, looks down from a deck
    or flies over sees it mirrored. pipeline/landmarks.py gives every upright picture a plain back (sign_back),
    which the test before looks past.
Meshes whose material has a picture (a "map": sign atlases, the LED screens' programmes) are looked
at; the aerial photo draped on a landmark's ground is not a picture to read, nor are leaf cards cut out
of an atlas ("cutout").

    python3 tools/sign_check.py [city ...]      # exits 1 if anything is mirrored
    python3 tools/sign_check.py --hero [city] [level ...]   # the hero levels' own pictures (a few minutes)
"""
import json
import os
import sys

import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "web", "data")


def faces(mesh):
    """Each triangle as (centroid, unit normal by winding, uv-orientation sign, uv rect key, area)."""
    P = np.asarray(mesh["position"], float).reshape(-1, 3)
    T = np.asarray(mesh["uv"], float).reshape(-1, 2)
    I = np.asarray(mesh["index"], int).reshape(-1, 3)
    out = []
    for i, j, k in I:
        a, b, c = P[i], P[j], P[k]
        n = np.cross(b - a, c - a)
        ln = np.linalg.norm(n)
        if ln < 1e-6:
            continue
        n = n / ln
        e1, e2 = b - a, c - a
        du1, dv1 = T[j] - T[i]
        du2, dv2 = T[k] - T[i]
        det = du1 * dv2 - du2 * dv1
        if abs(det) < 1e-9:   # one colour, no picture
            continue
        dpdu = (e1 * dv2 - e2 * dv1) / det
        dpdv = (e2 * du1 - e1 * du2) / det
        o = float(np.dot(np.cross(dpdu, dpdv), n))
        uvk = tuple(np.round(np.r_[T[[i, j, k]].min(axis=0), T[[i, j, k]].max(axis=0)], 3))
        out.append([(a + b + c) / 3, n, o, uvk, ln / 2, {i, j, k}])
    # a quad's two triangles (written one after the other, sharing an edge and a picture) as one face,
    # centred on its four corners, so the twin of a two-sided sign lies straight behind it
    merged, q = [], 0
    while q < len(out):
        f = out[q]
        g = out[q + 1] if q + 1 < len(out) else None
        if g is not None and g[3] == f[3] and len(f[5] & g[5]) == 2 and np.dot(f[1], g[1]) > 0.99:
            vs = sorted(f[5] | g[5])
            merged.append((P[vs].mean(axis=0), f[1], min(f[2], g[2]), f[3], f[4] + g[4]))
            q += 2
        else:
            merged.append(tuple(f[:5]))
            q += 1
    return merged


BACKS = "sign_back"   # the mesh of the signs' back panels (pipeline/landmarks.py sign_backs)
REACH = 0.5    # how far in front of a face, and behind it, a wall is looked for (m)


class Solids:
    """What a ray can hit: every landmark triangle in a grid of 2 m cells, and the buildings' prisms."""

    CELL = 2.0

    def __init__(self, L, B, extra=(), drop=(), near=None):
        """extra: more triangles, (n, 3, 3); drop: landmark meshes left out (a hero level's `hide`); near: the points
        (x, y) rays will start from, so that only what lies in their cells is put in the grid."""
        tris = [np.asarray(e, float).reshape(-1, 3, 3) for e in extra]
        backs = [np.zeros(len(t), bool) for t in tris]
        clear = {k for k, m in L.get("materials", {}).items() if m.get("opacity", 1) < 0.9 or m.get("transparent")}
        for mesh in L.get("meshes", []):
            if mesh.get("material") in clear or mesh["name"] in drop:   # glass and nets: a sign behind a shop window is read through it
                continue
            P = np.asarray(mesh["position"], float).reshape(-1, 3)
            I = np.asarray(mesh["index"], int).reshape(-1, 3)
            if len(I):
                tris.append(P[I])
                backs.append(np.full(len(I), mesh["name"] == BACKS))
        self.T = np.concatenate(tris) if tris else np.zeros((0, 3, 3))
        self.back = np.concatenate(backs) if backs else np.zeros(0, bool)   # the signs' own backs (pipeline/landmarks.py)
        lo = np.floor(self.T.min(axis=1)[:, :2] / self.CELL).astype(int)
        hi = np.floor(self.T.max(axis=1)[:, :2] / self.CELL).astype(int)
        keep = (hi - lo).max(axis=1) <= 40 if len(self.T) else np.zeros(0, bool)   # the ground's great sheets: never a sign's wall
        want = None
        if near is not None and len(near):
            # the cells a ray from a face can reach (a face's middle, a cell either way), as a summed-area table
            q = np.floor(np.asarray(near, float)[:, :2] / self.CELL).astype(int)
            o = q.min(axis=0) - 2
            shape = q.max(axis=0) - o + 3
            occ = np.zeros(shape, np.int32)
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    occ[q[:, 0] - o[0] + dx, q[:, 1] - o[1] + dy] = 1
            sat = np.zeros((shape[0] + 1, shape[1] + 1), np.int32)
            sat[1:, 1:] = occ.cumsum(0).cumsum(1)

            def want(a, b):   # does any wanted cell lie in the boxes [a, b] (cells, inclusive)?
                a = np.clip(np.asarray(a) - o, 0, shape - 1)
                b = np.clip(np.asarray(b) - o, -1, shape - 1)
                ok = (b >= a).all(axis=-1)
                b = np.maximum(b, a - 1)
                n = sat[b[..., 0] + 1, b[..., 1] + 1] - sat[a[..., 0], b[..., 1] + 1] - sat[b[..., 0] + 1, a[..., 1]] + sat[a[..., 0], a[..., 1]]
                return ok & (n > 0)
            keep &= want(lo, hi)
        self.grid = {}
        for t in np.nonzero(keep)[0]:
            for gx in range(lo[t, 0], hi[t, 0] + 1):
                for gy in range(lo[t, 1], hi[t, 1] + 1):
                    self.grid.setdefault((gx, gy), []).append(t)
        self.prisms = {}
        if B:
            hidden = set(L.get("hidden", [])) | set(L.get("demolished", []))
            secs = B.get("s", [])
            rings = [np.asarray(sec[4], float).reshape(-1, 2) / 10 for sec in secs]
            plo = np.array([np.floor(r.min(axis=0) / self.CELL) for r in rings], int).reshape(-1, 2)
            phi = np.array([np.floor(r.max(axis=0) / self.CELL) for r in rings], int).reshape(-1, 2)
            pk = want(plo, phi) if want is not None else np.ones(len(secs), bool)
            for si in np.nonzero(pk)[0]:   # (a hero level's solids stay: it draws the same building there)
                if si in hidden:
                    continue
                sec = secs[si]
                pr = (rings[si], sec[1] / 10 + sec[2] / 10, sec[1] / 10 + sec[3] / 10)
                for gx in range(plo[si, 0], phi[si, 0] + 1):
                    for gy in range(plo[si, 1], phi[si, 1] + 1):
                        self.prisms.setdefault((gx, gy), []).append(pr)

    def _cell(self, p):
        return (int(np.floor(p[0] / self.CELL)), int(np.floor(p[1] / self.CELL)))

    def inside(self, p):
        """Is p inside a building?"""
        for ring, z0, z1 in self.prisms.get(self._cell(p), ()):
            if not (z0 - 0.05 <= p[2] <= z1 + 0.05):
                continue
            x, y, c = ring[:, 0], ring[:, 1], False
            for i in range(len(ring)):
                j = i - 1
                if (y[i] > p[1]) != (y[j] > p[1]) and p[0] < (x[j] - x[i]) * (p[1] - y[i]) / (y[j] - y[i]) + x[i]:
                    c = not c
            if c:
                return True
        return False

    def hit(self, o, d, length, backs=True):
        """Does the segment o + t d, 0 < t < length, cross a triangle (the signs' backs too, with backs)?"""
        cx, cy = self._cell(o)
        cells = [(cx + i, cy + j) for i in (-1, 0, 1) for j in (-1, 0, 1)]   # (a segment shorter than a cell)
        idx = sorted({t for c in cells for t in self.grid.get(c, ())})
        if idx and not backs:
            idx = [t for t in idx if not self.back[t]]
        if not idx:
            return False
        T = self.T[idx]
        e1, e2 = T[:, 1] - T[:, 0], T[:, 2] - T[:, 0]
        h = np.cross(d, e2)
        a = np.einsum("ij,ij->i", e1, h)
        ok = np.abs(a) > 1e-9
        f = np.where(ok, 1.0 / np.where(ok, a, 1), 0)
        s = o - T[:, 0]
        u = f * np.einsum("ij,ij->i", s, h)
        q = np.cross(s, e1)
        v = f * (q @ d)
        t = f * np.einsum("ij,ij->i", e2, q)
        return bool(np.any(ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > 0) & (t < length)))

    def blocked(self, c, n, backs=True):
        """Is there a wall within REACH of c along n (a triangle crossed, or a building's inside)?"""
        o = c + n * 0.001   # (a picture's own plane aside: a notice 2 mm off its plate has the plate behind it)
        return self.hit(o, n, REACH, backs) or self.inside(c + n * 0.25) or self.inside(c + n * (REACH - 0.02))


def check(city):
    path = os.path.join(DATA, city, "landmarks.json")
    if not os.path.exists(path):
        return []
    L = json.load(open(path))
    bpath = os.path.join(DATA, city, "buildings.json")
    mats = L.get("materials", {})
    bad = []
    pics = []
    for mesh in L.get("meshes", []):
        m = mats.get(mesh.get("material"), {})
        if not m.get("map") or m["map"].startswith("ground") or not mesh.get("uv"):   # a picture, not the aerial photo
            continue
        if m.get("cutout"):   # leaves and needles cut out of an atlas: nothing to read either way round
            continue
        pics.append((mesh, faces(mesh)))
    near = [f[0] for _, F in pics for f in F]
    solids = Solids(L, json.load(open(bpath)) if os.path.exists(bpath) else None, near=near)
    for mesh, F in pics:
        if not F:
            continue
        # turned to a wall: blocked in front, open behind
        bad += turned(mesh["name"], F, solids)
        flipped = [f for f in F if f[2] < 0]
        for f in flipped:
            bad.append((mesh["name"], "picture against its winding", f[0]))
        # back-to-back pairs: same picture, opposite normals, centroids close
        C = np.array([f[0] for f in F])
        N = np.array([f[1] for f in F])
        by = {}
        for idx, f in enumerate(F):
            by.setdefault(f[3], []).append(idx)
        for idxs in by.values():
            idxs = [i for i in idxs if F[i][4] > 0.1]   # sign-sized faces, not a rope's or a lantern's slivers
            if len(idxs) < 2:
                continue
            for x in idxs:
                for y in idxs:
                    if y <= x or np.dot(N[x], N[y]) > -0.9:
                        continue
                    d = C[x] - C[y]
                    if np.linalg.norm(d) > 1.0:
                        continue
                    sep = float(np.dot(d, N[x]))   # x should stand in front of y, along x's normal
                    if np.linalg.norm(d - sep * N[x]) > 0.05:   # not its twin: another sign crossing it
                        continue
                    if sep < -0.01:
                        bad.append((mesh["name"], "back-to-back faces swapped", C[x]))
    return bad


def turned(name, F, solids):
    """The faces of F seen from behind: turned to a wall (blocked in front within REACH and open behind, a sign's
    own back panel aside), or upright with nothing behind them at all, where anyone who passes behind, looks down
    from a deck or flies over sees the picture mirrored (a floor's picture aside)."""
    bad = []
    for f in F:
        if f[4] < 0.05:
            continue
        if solids.blocked(f[0], f[1], backs=False) and not solids.blocked(f[0], -f[1], backs=False):
            bad.append((name, "picture turned to a wall, seen from behind", f[0]))
        elif abs(f[1][2]) < 0.7 and not solids.blocked(f[0], -f[1]) and not solids.blocked(f[0], f[1]):
            bad.append((name, "picture with nothing behind it, seen mirrored from behind", f[0]))
    return bad


HERO_LEVELS = ("scramble", "miyamasu", "ginza", "scramblesq", "skylobby", "skyroof")


def check_hero(city, levels):
    """The hero levels' own pictures (blender/build_hero.py: their signs, notices and shop windows), built here as
    geometry (no Blender needed, about half a minute a level) and cast against the level, the landmarks it keeps
    and the buildings."""
    import importlib.util
    sys.path.insert(0, os.path.join(ROOT, "blender"))
    import hero_kit as K
    L = json.load(open(os.path.join(DATA, city, "landmarks.json")))
    B = json.load(open(os.path.join(DATA, city, "buildings.json")))
    G = json.load(open(os.path.join(DATA, city, "game.json"))).get("hero", [])
    bad = []
    for lvl in levels:
        src = os.path.join(ROOT, "cities", city, "hero.py" if lvl == "scramble" else f"hero_{lvl}.py")
        if not os.path.exists(src):
            continue
        spec = importlib.util.spec_from_file_location(f"hero_{lvl}", src)
        mod = importlib.util.module_from_spec(spec)
        import contextlib
        import io
        with contextlib.redirect_stdout(io.StringIO()):
            spec.loader.exec_module(mod)
            geo, _, M, meta = mod.build(K)
        hide = next((h.get("hide", []) for h in G if h.get("id") == meta["id"]), [])
        parts = [(k, g) for gg in (geo, geo._fine) if gg is not None for k, g in gg.parts.items() if g["tri"]]
        clear = {k for k, m in M.items() if m.get("opacity", 1) < 0.9 or m.get("glass") or m.get("transmission")}
        extra = [np.asarray(g["p"], float)[np.asarray(g["tri"], int)] for k, g in parts if k not in clear]
        pics = [(k, faces({"position": np.ravel(g["p"]), "uv": np.ravel(g["uv"]), "index": np.ravel(g["tri"])}))
                for k, g in parts if M.get(k, {}).get("map") and not k.startswith(("ground", "refl"))]
        n = sum(len(F) for _, F in pics)
        if n:
            solids = Solids(L, B, extra, drop=set(hide), near=[f[0] for _, F in pics for f in F])
            for k, F in pics:
                bad += [(f"hero {meta['id']}: {k}",) + b[1:] for b in turned(k, F, solids)]
        print(f"  hero {meta['id']}: {n} picture faces looked at", file=sys.stderr)
    return bad


def main():
    args = sys.argv[1:]
    hero = "--hero" in args
    args = [a for a in args if a != "--hero"]
    if hero:   # python3 tools/sign_check.py --hero [city] [level ...]
        city = args[0] if args else "shibuya"
        bad = check_hero(city, args[1:] or HERO_LEVELS)
        kinds = {}
        for name, why, at in bad:
            kinds.setdefault((name, why), []).append(at)
        for (name, why), ats in kinds.items():
            print(f"{city}: {name}: {len(ats)} faces, {why}, e.g. at {np.round(ats[0], 1).tolist()}")
        if not bad:
            print(f"ok {city}: the hero levels' pictures face the street")
        sys.exit(1 if bad else 0)
    cities = args or sorted(d for d in os.listdir(DATA) if os.path.isdir(os.path.join(DATA, d)))
    total = 0
    for c in cities:
        bad = check(c)
        total += len(bad)
        if bad:
            kinds = {}
            for name, why, at in bad:
                kinds.setdefault((name, why), []).append(at)
            for (name, why), ats in kinds.items():
                print(f"{c}: {name}: {len(ats)} faces, {why}, e.g. at {np.round(ats[0], 1).tolist()}")
        else:
            print(f"ok {c}: signs read the right way round")
    sys.exit(1 if total else 0)


if __name__ == "__main__":
    main()
