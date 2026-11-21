"""The Ginza line's Shibuya station over Meiji-dori, a hero level of its own (blender/build_hero.py --city shibuya --level
ginza; docs/HERO.md, "The Ginza line's station").

The station was moved about 130 m east in January 2020 onto a box over Meiji-dori and the east exit's bus terminal
(Tokyo Metro; architect of its roof Hiroshi Naito). The box carries a 12 m island platform under a roof of M-shaped
arch frames: 110 m long, about 28 m wide over its eaves and 9 m high, assembled from 44 spans, with no column on the
platform (Railway Gazette 2019, Tokyo Metro news 2019-10-28, Shinkenchiku 2020-04). Seen from the street it is a white
deck edge, a glazed band where the frames' feet stand, and over it the white frames themselves, rib after rib, each an
M across the station: steep at the eaves, two crowns, and a shallow valley over the platform's middle.

The city drew it as a flat panelled box 15 m tall over its deck. What is built here, a few centimetres outside the
city's walls (whose box pipeline/stations.py TOP caps under the frames' feet):

  * the deck's edge: the box girders along its sides clad in white panels 1.8 m wide with open joints, from 1.15 m
    under the deck to 1.4 m over it (the Miyamasu level draws the deck's underside, its cross girders and piers);
  * over it the glazed band round the station, mullions every 1.25 m and a white frame foot every 2.5 m, the
    platform's light behind the glass after dark (win*: hero.js lights it with the evening);
  * the roof: a white rib every 2.5 m (44 spans over 110 m), each a box section swept along the M, the skin between
    them glass up the frames' steep feet and white panels over the crowns, a glazing bar along the legs, a gutter in
    the valley, and the gables closed in glass behind their heavier end frames.

Its finest parts (the frames' sides and feet, the light mullions and transoms, the glazing bars, the gables' mullions,
the cladding's joints) are its fine model, drawn near the camera and never fetched on a phone, where frame 5 holds the
Scramble's and Miyamasu's levels beside it at the edge of the memory budget (issue 105).

It is the station a player sees from frame 5's place under it, from up and down Meiji-dori, from Scramble Square's
roof (frame 4) and from the air, so it is fetched wherever the story walks (game.hero[].load_m), and drawn in plain
materials only: no picture, a few hundred kilobytes on a phone.

Measured, not drawn: its outline is the city's (OpenStreetMap, PLATEAU); its width 20.5 m between the walls the record
gives, which with the eaves' overhang is short of the published 28 m (the record's outline is the box, not the roof).
"""
import json
import math
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))

ID = "ginza"
STATION = "w810356690"
UNDERSIDE = 7.0              # the deck's underside over the ground (pipeline/stations.py UNDERSIDE)
EDGE_D, EDGE_UP = 1.15, 1.4  # the edge girders' cladding: under the deck's underside, over it
PANEL = 1.8                  # the cladding's panels, with an open joint
BAND = 3.2                   # the glazed band over the cladding, to the frames' feet
SPAN, SPANS = 2.5, 44        # the frames' spacing, and their number: 44 spans over 110 m
RISE = 8.6                   # the frames' crowns over their feet (the valley is the M's own share of it)
RIB_W, RIB_D = 0.28, 0.42    # a frame's box section: along the station, and its depth under the roof's skin
EAVE = 0.35                  # the frames' feet inside the band's face
# the M across the station, from an eave (d = 0) to the middle (d = 1, the valley), as (d, height over the feet / RISE):
# steep at the foot, a crown two fifths of the way in, and a shallow valley over the platform's middle
M = [(0.0, 0.0), (0.01, 0.25), (0.04, 0.5), (0.1, 0.72), (0.2, 0.9), (0.31, 0.982), (0.42, 1.0), (0.55, 0.972),
     (0.7, 0.92), (0.85, 0.888), (1.0, 0.875)]
GLASS_TO = 0.62              # the skin is glass up the frames' feet to this share of the rise, white panels over it


def materials():
    return {
        "ginza_white": {"color": (0.80, 0.81, 0.80), "rough": 0.42, "metal": 0.12},      # the frames and the cladding: white paint
        "ginza_panel": {"color": (0.74, 0.75, 0.75), "rough": 0.55, "metal": 0.05},      # the roof's panels over the crowns
        "ginza_joint": {"color": (0.16, 0.17, 0.18), "rough": 0.8, "metal": 0.0},        # an open joint's shadow, a gutter
        # glass: dark and mirroring the sky by day, the platform's light behind it after dark (hero.js win*)
        "win_ginza": {"color": (0.13, 0.16, 0.19), "rough": 0.05, "metal": 0.85, "sky": 0.8,
                      "emissive": (0.95, 0.93, 0.88), "glow": 0.55},
    }


def _station():
    """The station's solids (polygon, ground, underside z, top z), and the frame of its long axis."""
    from shapely.geometry import Polygon
    from shapely.ops import unary_union
    B = json.load(open(os.path.join(ROOT, "web", "data", "shibuya", "buildings.json")))
    bi = {i for i, b in enumerate(B["b"]) if b[6] == STATION}
    ring = lambda r: [(r[i] / 10, r[i + 1] / 10) for i in range(0, len(r), 2)]
    S = [(Polygon(ring(s[4])).buffer(0), s[1] / 10) for s in B["s"] if s[0] in bi]
    main = max(S, key=lambda q: q[0].area)
    co = np.asarray(main[0].exterior.coords)
    e = max(((co[i], co[i + 1]) for i in range(len(co) - 1)), key=lambda ab: np.linalg.norm(ab[1] - ab[0]))
    u = (e[1] - e[0]) / np.linalg.norm(e[1] - e[0])
    v = np.array([-u[1], u[0]])
    allp = unary_union([p for p, _ in S])
    if (np.asarray(allp.centroid.coords[0]) - e[0]) @ v < 0:
        v = -v
    return S, main, allp, e[0], u, v


class Station:
    def __init__(self, K):
        sys.path.insert(0, os.path.join(ROOT, "blender"))
        import hero_open as HP
        import hero_parts as PT
        self.K, self.PT = K, PT
        self.geo = K.Geo()
        self.A = K.Atlas(64, 64)
        self.T = HP.Ground("shibuya")
        self.X = HP.Parts(K, self.geo, self.T, self.A)
        self.S, self.main, self.allp, self.o, self.u, self.v = _station()
        g = min(gr for _, gr in self.S)
        self.zs = g + UNDERSIDE                       # the deck's underside
        self.z0 = self.zs + EDGE_UP                   # the cladding's top, the band's foot
        self.zf = self.z0 + BAND                      # the frames' feet
        # the roof's rectangle: across, the main box's walls (its long south edge is v = 0); along, as far as the
        # station's outline reaches along its middle
        cv = [(np.asarray(q) - self.o) @ self.v for q in self.main[0].exterior.coords]
        self.W = float(np.percentile(cv, 90))
        from shapely.geometry import LineString
        mid = self.o + self.v * self.W / 2
        cut = LineString([mid - self.u * 200, mid + self.u * 200]).intersection(self.allp.buffer(0.5))
        us = [(np.asarray(q) - self.o) @ self.u for g_ in getattr(cut, "geoms", [cut]) for q in g_.coords]
        self.ua, self.ub = min(us), max(us)
        print(f"ginza: deck underside {self.zs:.1f}, {self.W:.1f} m wide between its walls, {self.ub - self.ua:.1f} m along")

    def P(self, a, b, z):
        """A point a metres along the station, b across it from its south wall, at height z."""
        q = self.o + self.u * a + self.v * b
        return np.array([q[0], q[1], z])

    def build(self):
        self.cladding()
        self.band()
        self.roof()
        return self.geo, self.A

    # -- the deck's edge and the glazed band, round the station's own outline
    def _ring(self):
        from shapely.geometry import Polygon
        P = self.allp.buffer(0.05, join_style=2)
        if P.geom_type != "Polygon":
            P = max(P.geoms, key=lambda q: q.area)
        P = Polygon(P.exterior).simplify(0.3)
        ring = np.asarray(P.exterior.coords)[:-1]
        if P.exterior.is_ccw:
            ring = ring[::-1]                          # clockwise: the outside on the left of the way round
        return P, ring

    def cladding(self):
        """White panels 1.8 m wide with open joints over the edge girders, from under the deck to over it."""
        G, PT = self.geo, self.PT
        P, ring = self._ring()
        z0, z1 = self.zs - EDGE_D, self.z0
        n = 0
        for i in range(len(ring)):
            a, b = ring[i], ring[(i + 1) % len(ring)]
            Ln = float(np.linalg.norm(b - a))
            if Ln < 0.6:
                continue
            F = PT.Frame(b, a)
            k = max(1, int(round(Ln / PANEL)))
            w = Ln / k
            # the panels' face in one, its edges, and each open joint as a dark line just in front of it (a face to a
            # panel cost a phone at frame 5 four times the vertices for the same picture)
            PT.fbox(G, "ginza_white", F, 0.0, Ln, 0.0, 0.12, z0, z1, faces=("front", "bottom", "top"))
            for j in range(1, k):
                PT.fbox(G.fine, "ginza_joint", F, j * w - 0.012, j * w + 0.012, 0.12, 0.124, z0, z1, faces=("front",))
                n += 1
            # a horizontal joint where the girder's face meets the parapet over the deck
            PT.fbox(G, "ginza_joint", F, 0.0, Ln, 0.11, 0.125, self.zs + 0.02, self.zs + 0.05, faces=("front",))
            G.walls.append((a, b, z0, z1))
        # (the city's box under the deck's edge, closed from below where the Miyamasu level's soffit does not reach:
        # the panels' feet are its underside's edge)
        print(f"cladding: {n} panels")

    def band(self):
        """The glazed band over the cladding to the frames' feet: glass on a white sill, a mullion every 1.25 m and a
        frame's foot every 2.5 m, a white cornice over it, and the box's top closed in white panels inside it."""
        G, PT = self.geo, self.PT
        P, ring = self._ring()
        z0, z1 = self.z0, self.zf
        for i in range(len(ring)):
            a, b = ring[i], ring[(i + 1) % len(ring)]
            Ln = float(np.linalg.norm(b - a))
            if Ln < 0.6:
                continue
            F = PT.Frame(b, a)
            G.quad("win_ginza", F.P(0.0, 0.04, z0 + 0.25), F.P(Ln, 0.04, z0 + 0.25), F.P(Ln, 0.04, z1 - 0.3), F.P(0.0, 0.04, z1 - 0.3), n=F.N,
                   sub=(max(1, int(Ln / 2.5)), 1))
            PT.fbox(G, "ginza_white", F, 0.0, Ln, 0.0, 0.14, z0, z0 + 0.25, faces=("front", "top"))                    # the sill
            PT.fbox(G, "ginza_white", F, -0.05, Ln + 0.05, -0.1, 0.22, z1 - 0.3, z1, faces=("front", "bottom", "top", "left", "right"))   # the cornice
            k = max(1, int(round(Ln / (SPAN / 2))))
            for j in range(k + 1):
                um = Ln * j / k
                heavy = j % 2 == 0
                w2 = 0.09 if heavy else 0.035
                PT.fbox(G if heavy else G.fine, "ginza_white", F, um - w2, um + w2, 0.0, 0.2 if heavy else 0.1, z0 + 0.25, z1 - 0.3,
                        faces=("front", "left", "right") if heavy else ("front",))
            # a transom a metre over the sill
            PT.fbox(G.fine, "ginza_white", F, 0.0, Ln, 0.03, 0.08, z0 + 1.25, z0 + 1.3, faces=("front", "top", "bottom"))
            G.walls.append((a, b, z0, z1))
        self.X.cover("ginza_panel", P.buffer(-0.08), 0.0, cell=3.0, zfn=lambda x, y: z1 - 0.02)

    # -- the roof of M-shaped frames
    def profile(self):
        """The M across the station: [(b across, height)] from the south eave to the north one."""
        W, e = self.W, EAVE
        half = W / 2 - e
        out = [(e + half * d, self.zf + RISE * h) for d, h in M]
        back = [(W - e - half * d, self.zf + RISE * h) for d, h in reversed(M[:-1])]
        return out + back

    def roof(self):
        G = self.geo
        prof = self.profile()
        bs = np.array([b for b, _ in prof])
        zs = np.array([z for _, z in prof])
        # each point's outward normal in the (across, up) plane
        nrm = []
        for i in range(len(prof)):
            j0, j1 = max(i - 1, 0), min(i + 1, len(prof) - 1)
            db, dz = bs[j1] - bs[j0], zs[j1] - zs[j0]
            ln = math.hypot(db, dz)
            nb, nz = -dz / ln, db / ln
            if i == 0:
                nb, nz = -1.0, 0.0
            if i == len(prof) - 1:
                nb, nz = 1.0, 0.0
            nrm.append((nb, nz))
        nrm = np.array(nrm)
        # make the normals point outward (up at the crowns)
        if nrm[len(nrm) // 4, 1] < 0:
            nrm = -nrm
        # 44 spans, 110 m, from the station's west end over Meiji-dori; past them its box (the concourse's way to
        # Hikarie's deck) has the band's flat top
        L0 = self.ua + 0.3
        L1 = min(self.ub - 0.3, L0 + SPANS * SPAN)
        n_sp = max(1, int(round((L1 - L0) / SPAN)))
        sp = (L1 - L0) / n_sp
        V = self.v
        up = np.array([0.0, 0.0, 1.0])
        world_n = lambda k: np.r_[V * nrm[k, 0], 0.0] + up * nrm[k, 1]
        # the skin between the frames: a strip along the station for each segment of the M
        glass_z = self.zf + RISE * GLASS_TO
        for k in range(len(prof) - 1):
            mat = "win_ginza" if max(zs[k], zs[k + 1]) <= glass_z + 0.01 else "ginza_panel"
            a0, a1 = self.P(L0, bs[k], zs[k]), self.P(L0, bs[k + 1], zs[k + 1])
            b0, b1 = self.P(L1, bs[k], zs[k]), self.P(L1, bs[k + 1], zs[k + 1])
            n = world_n(k) + world_n(k + 1)
            n = n / np.linalg.norm(n)
            q = [a0, b0, b1, a1]
            if np.cross(q[1] - q[0], q[3] - q[0]) @ n < 0:
                q = [a0, a1, b1, b0]
            m_ = max(1, n_sp // 4)                     # (the bake's points along it, every 10 m: no light falls on it nearer)
            G.quad(mat, *q, n=n, sub=(m_, 1) if q[1] is b0 else (1, m_))
        # a glazing bar along each leg, at the glass's top and half way up it
        for frac in (0.3, GLASS_TO):
            for side in (0, 1):
                kk = int(np.argmin([abs(zs[i] - (self.zf + RISE * frac)) + (1e3 if (i < len(prof) // 2) != (side == 0) else 0) for i in range(len(prof))]))
                p0, p1 = self.P(L0, bs[kk], zs[kk]) + world_n(kk) * 0.035, self.P(L1, bs[kk], zs[kk]) + world_n(kk) * 0.035
                G.fine.tube("ginza_white", [p0, p1], 0.04, segs=6)
        # the gutter in the valley
        km = len(prof) // 2
        G.tube("ginza_joint", [self.P(L0, bs[km], zs[km] + 0.02), self.P(L1, bs[km], zs[km] + 0.02)], 0.09, segs=6)
        # the frames: a box section swept along the M, standing proud of the skin, every SPAN; the end frames heavier
        n_ribs = 0
        for j in range(n_sp + 1):
            a = L0 + j * sp
            w = RIB_W * (1.8 if j in (0, n_sp) else 1.0)
            self.rib(a, w, prof, nrm, world_n, deep=j in (0, n_sp))
            n_ribs += 1
        # the gables, closed in glass behind the end frames, with a mullion every 1.25 m
        for a, s in ((L0, -1), (L1, 1)):
            self.gable(a, s, prof)
        print(f"roof: {n_ribs} frames, {n_sp} spans of {sp:.2f} m over {L1 - L0:.1f} m")

    def rib(self, a, w, prof, nrm, world_n, deep=False):
        """One frame at a metres along, w wide: what of its box section stands proud of the skin (0.15 m), as three
        strips that share their points along the M (its back and its two sides; the rest of it is inside the roof,
        where no one sees it). An end frame, seen across the gable, shows its whole depth, RIB_D under the skin."""
        G = self.geo
        U = np.r_[self.u, 0.0]
        out_, in_ = 0.15, (-RIB_D if deep else -0.02)
        h = U * w / 2
        pts = [self.P(a, b, z) for b, z in prof]
        Ns = [world_n(k) for k in range(len(prof))]
        n_pt = len(pts)

        def strip(P, N, g=G):
            tri = [t for k in range(n_pt - 1) for t in ((2 * k, 2 * k + 1, 2 * k + 3), (2 * k, 2 * k + 3, 2 * k + 2))]
            q = np.asarray(P)
            if np.cross(q[1] - q[0], q[3] - q[0]) @ N[0] < 0:          # (each face counter-clockwise seen from outside)
                tri = [(x, z, y) for x, y, z in tri]
            g.mesh("ginza_white", P, tri, n=N, uv=[(i % 2, i // 2) for i in range(len(P))])
        back, sides = [], []
        for p, n in zip(pts, Ns):
            back += [p + n * out_ - h, p + n * out_ + h]
        strip(back, [n for n in Ns for _ in (0, 1)])
        for sgn in (1, -1):
            P = []
            for p, n in zip(pts, Ns):
                P += [p + n * in_ + h * sgn, p + n * out_ + h * sgn] if sgn > 0 else [p + n * out_ + h * sgn, p + n * in_ + h * sgn]
            strip(P, [U * sgn] * len(P), G if deep else G.fine)
        # its feet on the cornice
        for k in (0, n_pt - 1):
            G.fine.box("ginza_white", pts[k] - np.r_[0, 0, 0.3], (self.u, self.v), (w + 0.1, 0.5, 0.32))

    def gable(self, a, s, prof):
        """The M's end, closed in glass from the frames' feet up, a mullion every 1.25 m across it."""
        G = self.geo
        n = np.r_[self.u * s, 0.0]
        bs = [b for b, _ in prof]
        zs = [z for _, z in prof]
        P0 = [self.P(a + s * 0.02, b, self.zf) for b in bs]
        P1 = [self.P(a + s * 0.02, b, z) for b, z in zip(bs, zs)]
        for k in range(len(prof) - 1):
            q = [P0[k], P0[k + 1], P1[k + 1], P1[k]]
            if np.cross(q[1] - q[0], q[3] - q[0]) @ n < 0:
                q = [q[0], q[3], q[2], q[1]]
            G.quad("win_ginza", *q, n=n)
        for b in np.arange(EAVE + 1.25, self.W - EAVE - 0.5, 1.25):
            ztop = float(np.interp(b, bs, zs))
            c = self.P(a + s * 0.06, b, self.zf)
            G.fine.box("ginza_white", c, (self.u, self.v), (0.08, 0.06, ztop - self.zf - 0.05))


def build(K):
    """(geo, atlas, materials, meta) for blender/build_hero.py."""
    L = Station(K)
    geo, atlas = L.build()
    c = L.P((L.ua + L.ub) / 2, L.W / 2, 0)
    meta = {"id": ID, "at": [round(float(c[0]), 2), round(float(c[1]), 2)], "r": round((L.ub - L.ua) / 2 + 8, 1), "z": round(L.zs, 2),
            "glb": f"hero/{ID}.glb", "bake_gain": 1.0, "cell": 40.0, "fine_cell": 30.0, "sky_rays": 16, "sky_reach": 6.0, "sky_strength": 1.0}
    print("game.hero:", json.dumps({"at": meta["at"], "r": meta["r"], "z": meta["z"]}))
    return geo, atlas, materials(), meta
