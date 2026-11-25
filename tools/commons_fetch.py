"""Reference photographs from Wikimedia Commons for checking the hero level against the place (issue 213): never
textures. One request at a time, honouring Retry-After (the shared egress is rate-limited), many files per query.

    tools/job.sh run commons -- python3 tools/commons_fetch.py <out dir> [--since 2023] [--max 12] "query" ...

Each query is a Commons file search. A file is kept when its licence is CC BY, CC BY-SA or CC0 (or public domain),
and its date taken (DateTimeOriginal, else the upload) is in --since or later. Kept: <out dir>/<title>.jpg at 1600 px
wide, and <out dir>/sources.json with each file's title, licence, artist, date, page URL and the query that found it.
"""
import json
import os
import re
import sys
import time

import requests

API = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "blue-hour (https://github.com/Mira190/blue-hour)"}
OPEN = re.compile(r"^(cc[- ]by(-sa)?[- ][0-9.]+|cc0|public domain|pd)", re.I)


def get(url, params=None, stream=False, tries=9):
    for k in range(tries):
        r = requests.get(url, params=params, headers=UA, timeout=120, stream=stream)
        if r.status_code == 429 or r.status_code >= 500:
            wait = float(r.headers.get("retry-after", 15)) + 3 + 5 * k
            print(f"  {r.status_code}, waiting {wait:.0f} s", flush=True)
            time.sleep(wait)
            continue
        r.raise_for_status()
        return r
    raise RuntimeError(f"gave up on {url}")


def strip(html):
    return re.sub(r"<[^>]+>", "", html or "").strip()


def main():
    a = sys.argv[1:]
    out = a.pop(0)
    since, most = 2023, 12
    if "--since" in a:
        i = a.index("--since"); since = int(a[i + 1]); del a[i:i + 2]
    if "--max" in a:
        i = a.index("--max"); most = int(a[i + 1]); del a[i:i + 2]
    os.makedirs(out, exist_ok=True)
    src_path = os.path.join(out, "sources.json")
    sources = json.load(open(src_path)) if os.path.exists(src_path) else {}
    for q in a:
        r = get(API, {"action": "query", "format": "json", "generator": "search", "gsrsearch": f"filetype:bitmap {q}",
                      "gsrnamespace": 6, "gsrlimit": 40, "prop": "imageinfo", "iiprop": "url|extmetadata|timestamp",
                      "iiurlwidth": 1600})
        pages = sorted((r.json().get("query") or {}).get("pages", {}).values(), key=lambda p: p.get("index", 0))
        kept = 0
        for p in pages:
            if kept >= most or p["title"] in sources:
                continue
            ii = (p.get("imageinfo") or [{}])[0]
            md = ii.get("extmetadata") or {}
            lic = strip((md.get("LicenseShortName") or {}).get("value"))
            date = strip((md.get("DateTimeOriginal") or {}).get("value")) or ii.get("timestamp", "")
            year = int(m.group(0)) if (m := re.search(r"(19|20)\d\d", date)) else 0
            if not OPEN.match(lic) or year < since or not ii.get("thumburl"):
                continue
            name = re.sub(r"[^\w.-]+", "_", p["title"].split(":", 1)[1])[:120]
            name = os.path.splitext(name)[0] + ".jpg"
            img = get(ii["thumburl"])
            open(os.path.join(out, name), "wb").write(img.content)
            sources[p["title"]] = {"file": name, "licence": lic, "artist": strip((md.get("Artist") or {}).get("value")),
                                   "date": date, "url": ii.get("descriptionurl"), "query": q}
            json.dump(sources, open(src_path, "w"), ensure_ascii=False, indent=1)
            kept += 1
            print(f"  kept {name} ({lic}, {date[:10]})", flush=True)
            time.sleep(2)
        print(f"{q}: {kept} kept of {len(pages)} found", flush=True)
        time.sleep(4)
    print(f"{len(sources)} photographs in {out}")


if __name__ == "__main__":
    main()
