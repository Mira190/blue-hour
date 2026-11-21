"""Tokyo Metropolitan Government's 0.2 m aerial ortho photographs (the Digital Twin project's 2023 flight, CC BY 4.0) for a
city's frame: the 400 x 300 m sheets of the Japan Plane Rectangular CS zone IX (EPSG:6677) map grid that cover it.

    python pipeline/fetch_tokyo_ortho.py --city shibuya      # -> data/raw/<id>/tokyo_ortho/<sheet>.zip

A sheet's name is its place in the national 1/500 grid: zone 09, the 1/50,000 sheet (two letters: the row from the north
at y +300 km and the column from the west at x -160 km, 30 x 40 km each), then the 1/5,000 sheet (row, column: 3 x 4 km
each) and the 1/500 sheet (row, column: 300 x 400 m each). Each zip holds a GeoTIFF and its world file. The catalogue:
https://catalog.data.metro.tokyo.lg.jp/dataset/t000029d0000000024 (the "simple ortho" flown with the 2023 LiDAR survey).
"""
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import requests
from pyproj import Transformer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cityctx import city_args  # noqa: E402

URL = "https://gic-tokyo.s3.ap-northeast-1.amazonaws.com/2024/dig/ortho/{}.zip"
UA = {"User-Agent": "blue-hour (https://github.com/Mira190/blue-hour)"}
LET = "ABCDEFGHIJKLMNOPQRST"


def sheet(x, y):
    """The 1/500 sheet holding a point of zone IX (x east, y north, metres)."""
    r50, c50 = int((300000 - y) // 30000), int((x + 160000) // 40000)
    yy, xx = 300000 - r50 * 30000 - y, x - (-160000 + c50 * 40000)
    r5, c5 = int(yy // 3000), int(xx // 4000)
    r1, c1 = int((yy - r5 * 3000) // 300), int((xx - c5 * 4000) // 400)
    return f"09{LET[r50]}{LET[c50]}{r5}{c5}{r1}{c1}"


def sheets(city, pad=0.0):
    to = Transformer.from_crs(city.proj, "EPSG:6677", always_xy=True)
    xs, ys = [], []
    for x in (city.x0 - pad, city.x1 + pad):
        for y in (city.y0 - pad, city.y1 + pad):
            a, b = to.transform(x, y)
            xs.append(a)
            ys.append(b)
    out = set()
    for x in range(int(min(xs) // 400) * 400, int(max(xs)) + 400, 400):
        for y in range(int(min(ys) // 300) * 300, int(max(ys)) + 300, 300):
            out.add(sheet(x + 200, y + 150))
    return sorted(out)


def get(name, d):
    p = os.path.join(d, name + ".zip")
    if os.path.exists(p):
        return name, True
    for a in range(5):
        try:
            r = requests.get(URL.format(name), headers=UA, timeout=300)
            if r.status_code == 200:
                open(p + ".tmp", "wb").write(r.content)
                os.replace(p + ".tmp", p)
                return name, True
            if r.status_code in (403, 404):
                return name, False   # no sheet there (outside the 23 wards)
        except requests.RequestException:
            pass
        time.sleep(2 ** a)
    return name, False


def main():
    city, _ = city_args(__doc__.splitlines()[0])
    d = os.path.join(city.raw, "tokyo_ortho")
    os.makedirs(d, exist_ok=True)
    names = sheets(city)
    print(f"{len(names)} sheets cover the frame")
    with ThreadPoolExecutor(4) as ex:
        got = list(ex.map(lambda n: get(n, d), names))
    miss = [n for n, ok in got if not ok]
    print(f"{len(names) - len(miss)} sheets, {len(miss)} missing: {' '.join(miss)}")


if __name__ == "__main__":
    main()
