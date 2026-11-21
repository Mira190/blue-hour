"""Bring a built map's buildings up to a newer PLATEAU release, where it shows: a targeted update, not a rebuild.

    python pipeline/plateau_today.py --city shibuya fetch    # the newer release's buildings in the bbox (range requests)
    python pipeline/plateau_today.py --city shibuya diff     # what changed visibly -> cities/<id>/today.json
    python pipeline/plateau_today.py --city shibuya apply    # today.json -> web/data/<id>/buildings.json

The map's heights were built from an older survey (Shibuya: PLATEAU's 2020 LOD2 as vector tiles). Swapping every one of
its tens of thousands of small buildings for the newer release gains almost nothing on screen and moves the buildings
the hero levels anchor on. So this takes only what a player sees change (docs/BUILDINGS.md, "Today's city"):

  * a building the newer release has, at least `min_h` tall (`tall_h` anywhere, below that within `near`), standing
    where the map has nothing within max(`dh`, `rel_dh` of it) of its height: a new tower, or the map's guess under a
    surveyed building;
  * a building at least `tall_h` tall that the map has at about its height, whose area above `massing` of its height
    is not within 0.6-1.6 of the map's (a slab for a tower on a podium);
  * lower than the map only on a record the release surveyed again (survey year `resurveyed`): a record carried over
    from the older survey was measured as the map's was, and a drop there is not a change;
  * a map building at least `min_gone` tall within `near` with nothing of the release under it: demolished;
  * `sites`: OpenStreetMap's construction sites, where what stood is taken down and nothing of the release comes.

Each such release building opens a patch (its footprint and the map's solids on it, grown until nothing straddles the
edge), inside which the map's solids go and the release's buildings come, massed from their LOD2 roofs (one solid per
roof level); a building that matches one map solid with one roof level only re-tops it, keeping its style.

Nothing is touched inside city.json `today.keep` (the hero levels, and sites the owner chose to keep as they stood), nor
any building a hero level or a landmark names, nor a building `today.osm` keeps (one the release has wrong). Additions are appended to buildings.json, so every solid index the
landmarks, the scene and the hero levels hold stays the same; the demolished ones are listed in today.json and drawn flat
by the page (landmarks.json "demolished", from cities/<id>/city.py landmark_demolished). `apply` takes out its own earlier
additions before adding again, so it changes nothing when run twice.

The newer release is read out of its CityGML zip with HTTP range requests (pipeline/rangezip.py), a mesh file at a time,
and each mesh's buildings are cached in data/raw/<id>/plateau_today/<mesh>.json.
"""
import json
import os
import re
import sys
import time
import zipfile
from multiprocessing import Pool

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cityctx import City  # noqa: E402
import plateau_citygml as PC  # noqa: E402
from rangezip import RangeFile  # noqa: E402

ROOF = re.compile(r"<bldg:RoofSurface\b.*?</bldg:RoofSurface>", re.S)
TALL = 20.0   # LOD2 roofs are kept for buildings at least this tall (the rest only need their height)


def roofs(b):
    """A building's LOD2 roof faces as [z_mean, z_max, [lon, lat, ...]] (its LOD1 block when it has no LOD2)."""
    out = []
    for m in ROOF.finditer(b):
        for p in PC.POS.findall(m.group(0)):
            v = [float(x) for x in p.split()]
            lat, lon, z = v[0::3], v[1::3], v[2::3]
            if len(lat) < 4:
                continue
            out.append([round(sum(z) / len(z), 2), round(max(z), 2), [round(c, 7) for xy in zip(lon, lat) for c in xy]])
    return out


def parse(text):
    rows = PC.parse(text)
    by_id = {r[0]: r for r in rows}
    for m in PC.B.finditer(text):
        b = m.group(0)
        pid = PC.ID.search(b) or PC.UID.search(b)
        r = by_id.get(pid.group(1) if pid else None)
        if r is None:
            continue
        # spec v5 draws the roof edge at z 0: the ground is the foot of the LOD1 block, and the block's height above it
        solid = PC.SOLID.search(b)
        if solid and r[5] == 0.0:
            zs = [float(x) for q in PC.POS.findall(solid.group(1)) for x in q.split()[2::3]]
            r[5], r[6] = round(min(zs), 2), round(max(zs) - min(zs), 2)
        if max(r[3] or 0, r[6] or 0) >= TALL:
            r.append(roofs(b))
    return rows


def one(args):
    url, entry, path = args
    if os.path.exists(path):
        return path
    t = time.time()
    z = zipfile.ZipFile(RangeFile(url))
    rows = parse(z.read(entry).decode("utf8"))
    json.dump(rows, open(path + ".tmp", "w"), separators=(",", ":"), ensure_ascii=False)
    os.replace(path + ".tmp", path)
    print(f"  {os.path.basename(path)}: {len(rows)} buildings in {time.time() - t:.0f} s", flush=True)
    return path


def cache_dir(city):
    return os.path.join(city.raw, "plateau_today")


def fetch(city):
    cfg = city.cfg["today"]
    w, s, e, n = city.cfg["bbox"]
    z = zipfile.ZipFile(RangeFile(cfg["citygml"]))
    todo = []
    for info in z.infolist():
        f = info.filename
        if f.endswith(".gml") and ("/udx/bldg/" in f or f.startswith("udx/bldg/")):
            a = PC.mesh_bounds(os.path.basename(f)[:8])
            if a[0] < e and a[2] > w and a[1] < n and a[3] > s:
                todo.append(f)
    d = cache_dir(city)
    os.makedirs(d, exist_ok=True)
    print(f"{len(todo)} mesh files cover the bbox")
    jobs = [(cfg["citygml"], f, os.path.join(d, os.path.basename(f)[:8] + ".json")) for f in todo]
    with Pool(3) as pool:
        pool.map(one, jobs, chunksize=1)


def load_release(city):
    d = cache_dir(city)
    rows = []
    for f in sorted(os.listdir(d)):
        if f.endswith(".json"):
            rows += json.load(open(os.path.join(d, f), encoding="utf8"))
    return rows


def main():
    import argparse
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--city", required=True)
    ap.add_argument("stage", choices=("fetch", "diff", "apply"))
    a = ap.parse_args()
    city = City(a.city)
    if a.stage == "fetch":
        fetch(city)
    else:
        import today_diff
        getattr(today_diff, a.stage)(city, load_release(city))


if __name__ == "__main__":
    main()
