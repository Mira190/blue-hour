"""The roads as OpenStreetMap surveys them, and the buses' streets, for a city's road plan (pipeline/road_plan.py).

The game's road graph comes from Overture's segments (pipeline/game_data.py), which carry OpenStreetMap's class,
one-way and turn bans but not everything a plan of the traffic needs. Read here, from the OSM API's map call over the
city's box in tiles, and written to cities/<id>/roads_osm.json in longitude and latitude:

  ways    every highway a car may be on (motorway to service), with its class, one-way, lanes, access, service,
          tunnel, bridge, covered and layer: what the audit holds the game's pieces against
  bus     the ways of every route=bus relation (the routes' names, refs and operators with them): the streets a bus
          really takes. With --gtfs <zip>, the shapes of a GTFS feed too (Toei's, Tokyo's open data)
  taxi    amenity=taxi nodes: where taxis rank
  bars    barrier nodes on those ways (bollard, gate, lift_gate, chain, block): where a street is closed to cars

    python pipeline/road_osm.py --city shibuya [--gtfs ToeiBus-GTFS.zip]

OpenStreetMap contributors, ODbL. Toei Bus GTFS: Bureau of Transportation, Tokyo Metropolitan Government, CC BY 4.0
(the Public Transportation Open Data Center, api-public.odpt.org).
"""
import csv
import datetime
import io
import json
import os
import sys
import time
import urllib.error
import urllib.request
import zipfile

from cityctx import city_args

API = "https://api.openstreetmap.org/api/0.6/map.json?bbox={:.5f},{:.5f},{:.5f},{:.5f}"
UA = "blue-hour (https://github.com/Mira190/blue-hour)"
CAR = {"motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential", "living_street", "service",
       "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link"}
TAGS = ("highway", "oneway", "lanes", "access", "motor_vehicle", "vehicle", "service", "tunnel", "bridge", "covered", "layer", "name", "bus", "psv", "junction")
BARS = {"bollard", "gate", "lift_gate", "chain", "block", "swing_gate", "jersey_barrier"}


def get(box, depth=0):
    """The map call's elements for a box, split in four where the API refuses it as too large."""
    x0, y0, x1, y1 = box
    try:
        req = urllib.request.Request(API.format(*box), headers={"User-Agent": UA})
        return json.load(urllib.request.urlopen(req, timeout=180))["elements"]
    except urllib.error.HTTPError as e:
        if e.code not in (400, 509) or depth > 3:
            raise
        if e.code == 509:
            time.sleep(30)
            return get(box, depth + 1)
        xm, ym = (x0 + x1) / 2, (y0 + y1) / 2
        out = []
        for b in ((x0, y0, xm, ym), (xm, y0, x1, ym), (x0, ym, xm, y1), (xm, ym, x1, y1)):
            out += get(b, depth + 1)
        return out


def main():
    gtfs = None
    if "--gtfs" in sys.argv:
        k = sys.argv.index("--gtfs")
        gtfs = sys.argv[k + 1]
        del sys.argv[k:k + 2]
    city, _ = city_args(__doc__.splitlines()[0])
    x0, y0, x1, y1 = city.cfg["bbox"]
    nx, ny = 4, 4
    nodes, ways, rels = {}, {}, {}
    for i in range(nx):
        for j in range(ny):
            box = (x0 + (x1 - x0) * i / nx, y0 + (y1 - y0) * j / ny, x0 + (x1 - x0) * (i + 1) / nx, y0 + (y1 - y0) * (j + 1) / ny)
            for e in get(box):
                (nodes if e["type"] == "node" else ways if e["type"] == "way" else rels)[e["id"]] = e
            print(f"  tile {i},{j}: {len(nodes)} nodes, {len(ways)} ways, {len(rels)} relations so far", flush=True)
            time.sleep(1)
    ll = lambda w: [[round(nodes[n]["lon"], 6), round(nodes[n]["lat"], 6)] for n in w["nodes"] if n in nodes]
    out_w, on_road = [], set()
    for w in ways.values():
        t = w.get("tags") or {}
        if t.get("highway") in CAR and len(w["nodes"]) > 1:
            out_w.append({"id": w["id"], "t": {k: t[k] for k in TAGS if k in t}, "ll": ll(w)})
            on_road.update(w["nodes"])
    bus, routes = {}, []
    for r in rels.values():
        t = r.get("tags") or {}
        if t.get("type") == "route" and t.get("route") == "bus":
            routes.append({k: t[k] for k in ("ref", "name", "operator", "network", "from", "to") if k in t})
            for m in r["members"]:
                if m["type"] == "way" and m["ref"] in ways and (ways[m["ref"]].get("tags") or {}).get("highway") and not m.get("role", "").startswith("platform"):
                    bus.setdefault(m["ref"], set()).add(t.get("operator") or t.get("network") or "")
    out_b = [{"id": i, "by": sorted(o for o in ops if o), "ll": ll(ways[i])} for i, ops in sorted(bus.items())]
    shapes = []
    if gtfs:
        z, by = zipfile.ZipFile(gtfs), {}
        for row in csv.DictReader(io.TextIOWrapper(z.open("shapes.txt"), encoding="utf-8-sig")):
            by.setdefault(row["shape_id"], []).append((int(row["shape_pt_sequence"]), float(row["shape_pt_lon"]), float(row["shape_pt_lat"])))
        for sid, pts in sorted(by.items()):
            pts.sort()
            run = [[round(lo, 6), round(la, 6)] for _, lo, la in pts if x0 - 0.002 < lo < x1 + 0.002 and y0 - 0.002 < la < y1 + 0.002]
            if len(run) > 1:
                shapes.append({"id": sid, "ll": run})
        agency = next(csv.DictReader(io.TextIOWrapper(z.open("agency.txt"), encoding="utf-8-sig")))["agency_name"]
        feed = next(csv.DictReader(io.TextIOWrapper(z.open("feed_info.txt"), encoding="utf-8-sig")))
    taxi = [[round(n["lon"], 6), round(n["lat"], 6)] for n in nodes.values() if (n.get("tags") or {}).get("amenity") == "taxi"]
    bars = [{"ll": [round(n["lon"], 6), round(n["lat"], 6)], "k": n["tags"]["barrier"]} for i, n in nodes.items()
            if i in on_road and (n.get("tags") or {}).get("barrier") in BARS]
    today = datetime.date.today().isoformat()
    src = f"OpenStreetMap contributors (ODbL), the OSM API's map call, fetched {today}: highway ways open to cars, the ways of route=bus relations, amenity=taxi, barrier nodes on roads; lon/lat"
    if gtfs:
        src += f". GTFS shapes: {agency} ({feed['feed_publisher_name']}), feed version {feed['feed_version']}, CC BY 4.0, from the Public Transportation Open Data Center"
    out = {"source": src, "ways": out_w, "bus": out_b, "routes": sorted(routes, key=lambda r: (r.get("operator", ""), r.get("ref", ""))), "gtfs": shapes, "taxi": taxi, "bars": bars}
    path = os.path.join(city.dir, "roads_osm.json")
    json.dump(out, open(path, "w", encoding="utf8"), ensure_ascii=False, separators=(",", ":"))
    print(f"{city.id}: {len(out_w)} roads, {len(out_b)} ways of {len(routes)} bus routes, {len(shapes)} GTFS shapes, {len(taxi)} taxi ranks, {len(bars)} barriers -> {path} ({os.path.getsize(path) / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
