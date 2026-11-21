"""The diff and the apply stages of pipeline/plateau_today.py (see its docstring): what changed visibly between a built
map's buildings and a newer PLATEAU release, kept in cities/<id>/today.json, and that file written into
web/data/<id>/buildings.json."""
import glob
import json
import math
import os
import re
import sys

import numpy as np
import shapely
from shapely import STRtree
from shapely.geometry import Point, Polygon, box
from shapely.ops import unary_union

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import jsonfmt  # noqa: E402

SRC = "plateau2025"     # height_src of what this adds (buildings.json "fields": height_src)
FOOT_SRC = "P"          # footprint_src: PLATEAU's roof edge
OSM_SRC = "osm2026"


def local_ring(city, flat):
    xs, ys = city.fwd.transform(flat[0::2], flat[1::2])
    return list(zip(xs, ys))


def poly(pts):
    p = Polygon(pts)
    return p if p.is_valid else p.buffer(0)


def load_map(city):
    path = os.path.join(city.out, "buildings.json")
    B = json.load(open(path, encoding="utf8"))
    return path, B


def solid_poly(s):
    r = s[4]
    return poly([(r[k] / 10, r[k + 1] / 10) for k in range(0, len(r), 2)])


def keep_zones(city):
    """Where nothing is touched: the hero levels (with a margin) and city.json today.keep."""
    cfg = city.cfg.get("today", {})
    zones = []
    for h in city.cfg.get("game", {}).get("hero", []):
        zones.append(Point(*h["at"]).buffer(h["r"] + cfg.get("hero_margin_m", 25.0)))
    for k in cfg.get("keep", []):
        zones.append(poly(k["ring"]))
    return unary_union(zones)


def named_anchors(city, B):
    """The names of buildings the city's hooks and hero levels ask buildings.json for by name."""
    text = ""
    for f in glob.glob(os.path.join(city.dir, "*.py")):
        text += open(f, encoding="utf8").read()
    lits = set(re.findall(r'"([^"\n]{2,60})"', text))
    return {b[0] for b in B["b"] if b[0] and b[0] in lits}


def held_solids(city):
    """Solids a landmark or the scene draws in its own way (hidden), which a change must not move."""
    out = set()
    L = json.load(open(os.path.join(city.out, "landmarks.json"), encoding="utf8"))
    out |= set(L.get("hidden") or [])
    S = json.load(open(os.path.join(city.out, "scene.json"), encoding="utf8"))
    out |= set(S.get("hidden_solids") or [])
    return out


def release_pieces(city, r):
    """A release building's massing: [(polygon, top over its lowest ground)] from its LOD2 roofs, one piece per roof
    level (faces within 3 m of each other's height merged), or its roof edge at its measured height. Not capped at
    the measured height: on a slope that is taken from higher ground (SAKURA Tower's 116.3 m on Sakuragaoka, whose
    roof the 2023 LiDAR has at 125 m over the foot of the slope, as its LOD2 roof is)."""
    z0, ring = r[5], local_ring(city, r[9])
    h = r[3] if r[3] is not None else r[6]
    faces = r[10] if len(r) > 10 else []
    if not faces:
        return [(poly(ring), h)]
    lv = []
    for zm, zx, flat in faces:
        p = poly(local_ring(city, flat))
        if p.area < 2:
            continue
        lv.append([zm - z0, p])
    lv.sort(key=lambda t: -t[0])
    groups = []
    for z, p in lv:
        for g in groups:
            if abs(g[0] - z) < 3.0:
                g[1].append(p)
                g[2] += p.area
                break
        else:
            groups.append([z, [p], p.area])
    out = []
    for z, ps, a in groups:
        u = unary_union([q.buffer(0.15) for q in ps]).buffer(-0.15)
        for g in getattr(u, "geoms", [u]):
            if g.area >= 12 and g.geom_type == "Polygon":
                out.append((g.simplify(0.25), round(z, 1)))
    return out or [(poly(ring), h)]


def load_osm(city):
    """OpenStreetMap's buildings and construction sites round the station as they are today (data/raw/<id>/osm_today,
    the API's map calls): [(way id, tags, polygon)]."""
    nodes, ways = {}, {}
    for f in glob.glob(os.path.join(city.raw, "osm_today", "*.json")):
        for e in json.load(open(f))["elements"]:
            if e["type"] == "node":
                nodes[e["id"]] = (e["lon"], e["lat"])
            elif e["type"] == "way":
                ways[e["id"]] = e
    out = []
    for wid, w in ways.items():
        t = w.get("tags", {})
        if not ("building" in t or "building:part" in t or t.get("landuse") == "construction"):
            continue
        if w["nodes"][0] != w["nodes"][-1] or any(n not in nodes for n in w["nodes"]):
            continue
        out.append((wid, t, poly(local_ring(city, [c for n in w["nodes"] for c in nodes[n]]))))
    return out


def osm_height(t):
    for k in ("height", "est_height"):
        try:
            return float(str(t[k]).split()[0].replace("m", ""))
        except (KeyError, ValueError):
            pass
    try:
        return float(t["building:levels"]) * 3.6 + 2.0
    except (KeyError, ValueError):
        return None


def compute(city, rows):
    cfg = city.cfg["today"]
    min_h, dh, rel_dh = cfg.get("min_h", 25.0), cfg.get("dh", 10.0), cfg.get("rel_dh", 0.25)
    tall, min_gone, massing = cfg.get("tall_h", 45.0), cfg.get("min_gone", 30.0), cfg.get("massing", 0.6)
    near = Point(*cfg["near"]["at"]).buffer(cfg["near"]["r"])
    ward = cfg.get("ward", "")
    fresh = cfg.get("resurveyed", 1)   # the survey year the release gives a building it surveyed again (FY2025: 1)
    path, B = load_map(city)
    F = B["fields"]
    osm_col = F.index("osm_id")
    keep, names, held = keep_zones(city), named_anchors(city, B), held_solids(city)
    osm_keep = {"w%d" % k["way"] for k in cfg.get("osm", []) if k.get("keep")}
    S = B["s"]
    polys = [solid_poly(s) for s in S]
    tree = STRtree(polys)
    top = [s[3] / 10 for s in S]
    frame = box(city.x0, city.y0, city.x1, city.y1)
    big = lambda a, b: abs(a - b) >= max(dh, rel_dh * max(a, b))   # a change, not a difference in how a roof was measured
    rel = []
    for r in rows:
        ring = local_ring(city, r[9])
        if len(ring) < 4 or not (r[0] or "").startswith(ward):
            continue   # a neighbouring ward's buildings in a shared mesh file are its own release, not this one
        p = poly(ring)
        h = r[3] if r[3] is not None and r[3] > 0 else r[6]   # (-9999: no survey record)
        if p.is_empty or p.area < 4 or h is None or h <= 0 or not frame.contains(p.centroid):
            continue
        rel.append((r, p, h))
    rpolys = [p for _, p, _ in rel]
    rtree = STRtree(rpolys)
    covered = unary_union([p.buffer(40) for p in rpolys]).buffer(-30)   # where the release has buildings at all (its ward)
    print(f"map: {len(B['b'])} buildings, {len(S)} solids; release: {len(rel)} buildings in the frame")

    def exempt(si):
        return (si in held or B["b"][S[si][0]][0] in names or B["b"][S[si][0]][osm_col] in osm_keep
                or keep.intersects(polys[si].centroid))

    def under(p):
        """the map's solids that stand on a footprint: their middle inside it, or most of them"""
        out = []
        for si in tree.query(p):
            q = polys[si]
            if q.intersects(p) and (p.buffer(2.0).contains(q.centroid) or q.intersection(p).area > 0.5 * q.area):
                out.append(int(si))
        return out

    def area_above(pairs, z):
        u = [g for g, t in pairs if t >= z]
        return unary_union(u).area if u else 0.0

    # 0. construction sites (city.json today.sites, OpenStreetMap's landuse=construction outlines): what the map has
    # standing on one is gone, and what the release has there (flown before the demolition) does not come
    osm_ways = {wid: q for wid, t, q in load_osm(city)}
    taken, gone, patches, sites = set(), {}, [], []
    for st in cfg.get("sites", []):
        q = osm_ways.get(st["way"])
        if q is None:
            print(f"  site {st['name']}: way {st['way']} not in data/raw/{city.id}/osm_today")
            continue
        q = q.buffer(0)
        inner = q.buffer(-1.0)
        ss = [int(si) for si in tree.query(q) if inner.contains(polys[int(si)].representative_point())]
        bad = [si for si in ss if exempt(si)]
        if bad:
            print(f"  site {st['name']}: keeps {len(bad)} solids a hero level, a landmark or an anchor holds")
        for si in ss:
            if si not in bad:
                gone[si] = f"site {st['way']}"
        taken |= {int(k) for k in rtree.query(q) if inner.contains(rpolys[int(k)].representative_point())}
        sites.append({"way": st["way"], "name": st["name"], "opening": st.get("opening"), "map_solids": sorted(set(ss) - set(bad)),
                      "ring": [[round(x, 2), round(y, 2)] for x, y in shapely.geometry.polygon.orient(q, 1.0).exterior.coords[:-1]]})

    # 1. seeds: the release's buildings that the map has wrong, where it shows
    seeds, retop = [], {}
    for j, (r, p, h) in enumerate(rel):
        if j in taken or h < min_h or keep.intersects(p.centroid) or (h < tall and not near.contains(p.centroid)):
            continue
        inside = [si for si in under(p) if si not in gone]
        mtop = max([top[si] for si in inside], default=0.0)
        if inside and not big(mtop, h):
            if h < tall:
                continue
            # a tower the map has at about its height: is its massing the release's? (a slab for a tower on a podium)
            z = massing * h
            a_rel = area_above(release_pieces(city, r), z)
            a_map = area_above([(polys[si], top[si]) for si in inside], z)
            if a_rel and 0.6 < a_map / a_rel < 1.6:
                continue
            reason = f"massing: {a_map:.0f} m2 above {z:.0f} m in the map, {a_rel:.0f} in the release"
        else:
            if h < mtop and r[8] != fresh:
                continue   # lower than the map on a record not surveyed again: how the roof was measured, not a change
            reason = "new" if mtop < min_h else f"top {mtop:.0f} -> {h:.0f}"
            # one solid of the map on the same footprint: given the new top and nothing else (it keeps its style)
            if len(inside) == 1 and len(release_pieces(city, r)) == 1:
                q = polys[inside[0]]
                if q.intersection(p).area / q.union(p).area >= 0.6 and not exempt(inside[0]):
                    retop[inside[0]] = {"from": top[inside[0]], "to": h, "id": r[0], "name": B["b"][S[inside[0]][0]][0],
                                        "iou": round(q.intersection(p).area / q.union(p).area, 2)}
                    taken.add(j)
                    continue
        seeds.append((j, reason))
    # 2. each seed opens a patch: the release's footprint and the map's solids on it; inside a patch the map's solids
    # go and the release's buildings come, all of them (a podium's neighbours under a slab the map drew too wide)
    for j, reason in sorted(seeds, key=lambda t: -rel[t[0]][2]):
        if j in taken:
            continue
        area, members, solids = rel[j][1], {j}, set(under(rel[j][1])) - set(gone) - set(retop)
        for _ in range(3):
            area = unary_union([area] + [polys[si] for si in solids])
            grown = {int(k) for k in rtree.query(area) if area.buffer(-1.0).contains(rpolys[k].representative_point())} - taken
            more = {si for k in grown for si in under(rpolys[k])} - set(gone) - set(retop)
            if grown <= members and more <= solids:
                break
            members |= grown
            solids |= more
        bad = [si for si in solids if exempt(si)]
        r0 = rel[j][0]
        if bad:
            print(f"  kept as it is (a hero level, a landmark, a named anchor or a kept OSM building): {r0[0]} {rel[j][2]} m, {reason}")
            continue
        taken |= members
        for si in solids:
            gone[si] = f"patch {r0[0]}"
        patches.append({"seed": r0[0], "h": rel[j][2], "why": reason, "at": [round(area.centroid.x), round(area.centroid.y)],
                        "map_solids": sorted(solids), "map_top": max([top[si] for si in solids], default=0.0),
                        "buildings": [rel[k][0][0] for k in sorted(members, key=lambda k: -rel[k][2])]})
    # 3. a map building gone (nothing of the release under it) or re-topped (the release's building on its footprint)
    for si, sp in enumerate(polys):
        if si in gone or si in retop or exempt(si) or sp.area < 30 or top[si] < min_h - dh:
            continue
        hits = [int(j) for j in rtree.query(sp) if rpolys[j].intersects(sp)]
        share = sum(rpolys[j].intersection(sp).area for j in hits) / sp.area
        mt = top[si]
        if share < 0.2:
            if mt >= min_gone and covered.contains(sp.centroid) and near.contains(sp.centroid):
                gone[si] = "nothing of the release here"
            continue
        best = max(hits, key=lambda j: rpolys[j].intersection(sp).area / rpolys[j].union(sp).area)
        iou = rpolys[best].intersection(sp).area / rpolys[best].union(sp).area
        h = rel[best][2]
        # lower now only when no release building over it is still about the map's height (a tower and its podium
        # surveyed as two buildings)
        still = any(not big(mt, rel[j][2]) for j in hits)
        if (iou >= 0.6 and big(mt, h) and max(mt, h) >= min_h and (rel[best][0][3] or 0) > 0 and not (h < mt and (still or rel[best][0][8] != fresh))
                and (max(mt, h) >= tall or near.contains(sp.centroid))):
            retop[si] = {"from": mt, "to": h, "id": rel[best][0][0], "name": B["b"][S[si][0]][0], "iou": round(iou, 2)}
    return {"source": cfg["attribution"],
            "rule": {"min_h": min_h, "dh": dh, "rel_dh": rel_dh, "tall_h": tall, "massing": massing, "min_gone": min_gone, "near": cfg["near"]},
            "sites": sites, "patches": sorted(patches, key=lambda a: -a["h"]),
            "gone": [{"solid": si, "osm": B["b"][S[si][0]][osm_col], "name": B["b"][S[si][0]][0], "top": top[si], "why": gone[si]}
                     for si in sorted(gone)],
            "retop": [dict(solid=si, osm=B["b"][S[si][0]][osm_col], **v)
                      for si, v in sorted(retop.items(), key=lambda kv: -max(kv[1]["from"], kv[1]["to"]))]}


def report(out, city=None):
    osm = load_osm(city) if city else []
    otree = STRtree([p for _, _, p in osm]) if osm else None

    def osm_at(p):
        if not otree:
            return ""
        best = [(osm[k][2].intersection(p).area, osm[k]) for k in otree.query(p) if osm[k][2].intersects(p) and "building" in osm[k][1]]
        if not best:
            return "osm: -"
        a, (wid, t, q) = max(best, key=lambda b: b[0])
        return f"osm w{wid} {t.get('name', '')} h {osm_height(t)} lv {t.get('building:levels', '')}"
    print(f"patches {len(out['patches'])}, gone {len(out['gone'])} solids, re-topped {len(out['retop'])}")
    for a in out["patches"]:
        print(f"  + {a['h']:6.1f} m (map {a['map_top']:5.1f}) {a['why']} | seed {a['seed']} at {a['at'][0]},{a['at'][1]}: "
              f"{len(a['buildings'])} buildings for {len(a['map_solids'])} solids")
    for g in sorted(out["gone"], key=lambda g: -g["top"]):
        if not g["why"].startswith("patch"):
            print(f"  - {g['top']:6.1f} m {g['name'] or ''} {g['osm']} solid {g['solid']}")
    for t in out["retop"]:
        print(f"  ~ {t['from']:6.1f} -> {t['to']:6.1f} {t['name'] or ''} {t['osm']} iou {t['iou']} solid {t['solid']}")


def diff(city, rows):
    out = compute(city, rows)
    report(out, city)
    json.dump(out, open(os.path.join(city.dir, "today.json"), "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))


# ---------------------------------------------------------------- apply

USAGE = {"401": "office", "402": "commercial", "403": "hotel", "404": "commercial", "411": "house", "412": "apartments",
         "413": "apartments", "414": "apartments", "421": "education", "422": "public", "431": "industrial", "441": "public",
         "451": "industrial", "452": "industrial", "453": "industrial", "454": "industrial", "461": "industrial"}


def terrain(city):
    import base64
    S = json.load(open(os.path.join(city.out, "scene.json")))
    t = json.load(open(os.path.join(city.out, "terrain.json")))
    g = np.frombuffer(base64.b64decode(t["data"]), "<i2").astype(float).reshape(t["ny"], t["nx"]) * S["terrain"]["scale"]
    x0, y1, cell = S["frame"]["x"][0], S["frame"]["y"][1], S["terrain"]["cell"]

    def at(x, y):
        fx, fy = (np.asarray(x) - x0) / cell - 0.5, (y1 - np.asarray(y)) / cell - 0.5
        i0 = np.clip(np.floor(fx).astype(int), 0, g.shape[1] - 2)
        j0 = np.clip(np.floor(fy).astype(int), 0, g.shape[0] - 2)
        tx, ty = np.clip(fx - i0, 0, 1), np.clip(fy - j0, 0, 1)
        return (g[j0, i0] * (1 - tx) * (1 - ty) + g[j0, i0 + 1] * tx * (1 - ty) + g[j0 + 1, i0] * (1 - tx) * ty
                + g[j0 + 1, i0 + 1] * tx * ty)
    return at


def demolished(city):
    """The solids today.json takes down (the patches' and the sites' map solids, and the gone): city.py
    landmark_demolished lists them for the page (landmarks.json "demolished")."""
    path = os.path.join(city.dir, "today.json")
    if not os.path.exists(path):
        return []
    T = json.load(open(path, encoding="utf8"))
    return sorted({g["solid"] for g in T["gone"]})


def apply(city, rows):
    from build_scene import ring as flat_ring, valid_rings
    T = json.load(open(os.path.join(city.dir, "today.json"), encoding="utf8"))
    path, B = load_map(city)
    F = B["fields"]
    col = {k.split(" ")[0]: i for i, k in enumerate(F)}
    # this pass's own earlier rows come off first: its buildings are the last rows, its solids theirs
    first = next((i for i, b in enumerate(B["b"]) if b[col["height_src"]] == SRC), len(B["b"]))
    s_first = next((i for i, s in enumerate(B["s"]) if s[0] >= first), len(B["s"]))
    B["b"], B["s"] = B["b"][:first], B["s"][:s_first]
    for k in ("r", "f", "p"):
        B[k] = [q for q in B[k] if q[0] < s_first]
    # the map's buildings as they were before any re-top (kept in today.json), then the new tops
    for t in T["retop"]:
        s = B["s"][t["solid"]]
        s[3] = round(t["to"] * 10)
        bi = s[0]
        B["b"][bi][col["top_m"]] = round(max(q[3] for q in B["s"] if q[0] == bi) / 10, 1)   # its tallest solid
        B["b"][bi][col["height_src"]] = "plateau"
    gone = {g["solid"] for g in T["gone"]}
    # what stands on a solid that is gone goes with it: its pitched roof, its fronts, its roof's plant
    for k in ("r", "f", "p"):
        B[k] = [q for q in B[k] if q[0] not in gone]
    by_id = {r[0]: r for r in rows}
    osm = load_osm(city)
    otree = STRtree([q for _, _, q in osm]) if osm else None
    ground = terrain(city)
    S = B["s"]
    polys = [solid_poly(s) for s in S]
    tree = STRtree(polys)
    styles = B["styles"]
    keep_b = [i for i in range(len(B["b"]))]

    def neighbour(p, style=None, exclude=()):
        """the nearest standing building of the map (of a style), for the colours and storeys of a new one"""
        best, d = None, 1e9
        for si in tree.query(p.buffer(250)):
            si = int(si)
            if si in gone or si in exclude:
                continue
            b = B["b"][S[si][0]]
            if style is not None and styles[b[col["style"]]] != style:
                continue
            dd = polys[si].distance(p)
            if dd < d:
                best, d = b, dd
        return best

    def osm_for(p):
        if not otree:
            return None
        hits = [(osm[k][2].intersection(p).area, osm[k]) for k in otree.query(p)
                if "building" in osm[k][1] and osm[k][2].intersects(p)]
        hits = [h for h in hits if h[0] > 0.5 * min(p.area, h[1][2].area)]
        return max(hits, key=lambda h: h[0])[1] if hits else None

    added = 0
    for pa in T["patches"]:
        replaced = [S[si][0] for si in pa["map_solids"]]
        for rid in pa["buildings"]:
            r = by_id[rid]
            pieces = release_pieces(city, r)
            lod2 = len(r) > 10 and bool(r[10]) and r[5] > 0
            foot = poly(local_ring(city, r[9]))
            h = max(z for _, z in pieces)
            if h < 2.5:
                continue
            o = osm_for(foot)
            # the style of the map building it replaces when that one is like it (a tower for a tower), else by its use
            # and height, and the colours of the nearest building of that style
            old = [B["b"][bi] for bi in replaced if B["b"][bi][col["top_m"]] >= 0.6 * h]
            usage = USAGE.get(r[2] or "", "")
            if old:
                proto = old[0]
                style = styles[proto[col["style"]]]
            else:
                style = "glass" if h >= 60 else "apartment" if usage == "apartments" else "office" if h >= 18 else "plain"
                proto = neighbour(foot, style) or neighbour(foot)
            row = list(proto)
            st = r[4] if r[4] and r[4] < 200 else 0
            row[col["name"]] = (o[1].get("name") if o else None) or r[1] or ""
            row[col["class"]] = usage or row[col["class"]]
            row[col["top_m"]] = round(h, 1)
            row[col["floors"]] = st
            row[col["height_src"]] = SRC
            row[col["footprint_src"]] = FOOT_SRC
            row[col["osm_id"]] = f"w{o[0]}" if o else ""
            row[col["open_data_top_m"]] = round(h, 1)
            row[col["style"]] = styles.index(style)
            row[col["seed"]] = int.from_bytes(rid.encode()[-6:], "little") % 65536
            row[col["roof_shape"]] = 0
            if st:
                gf = row[col["ground_floor_m"]] - row[col["storey_m"]]
                row[col["storey_m"]] = round(max(2.8, min(5.0, (h - gf) / st)), 2)
                row[col["ground_floor_m"]] = round(row[col["storey_m"]] + max(gf, 0.6), 2)
            bi = len(B["b"])
            n0 = len(S)
            for g, z in sorted(pieces, key=lambda t: -t[1]):
                g = g.simplify(0.15, preserve_topology=True)
                if g.is_empty or g.area < 2 or z < 2.5:
                    continue
                g = shapely.geometry.polygon.orient(g, 1.0)
                rings = valid_rings([flat_ring(g.exterior.coords)] + [flat_ring(q.coords) for q in g.interiors if len(q.coords) > 3])
                if rings is None:
                    continue
                cs = np.asarray(g.exterior.coords)
                zb = max(float(np.min(ground(cs[:, 0], cs[:, 1]))), 0.0)
                if lod2:   # the roof's own height (metres T.P., as the map's ground is) over the map's ground under it
                    z = r[5] + z - zb
                S.append([bi, round(zb * 10), 0, round(z * 10)] + rings)
            if len(S) > n0:
                row[col["top_m"]] = row[col["open_data_top_m"]] = round(max(q[3] for q in S[n0:]) / 10, 1)
                B["b"].append(row)
                added += 1
    json.dump(B, open(path, "w"), separators=(",", ":"))   # as build_scene.py and the passes after it write it
    print(f"buildings.json: {added} buildings added ({len(S) - s_first} solids), {len(gone)} solids taken down, "
          f"{len(T['retop'])} re-topped")
