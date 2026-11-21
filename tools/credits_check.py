#!/usr/bin/env python3
"""What a launch needs of the page's credits and of a link's preview, read from the files (issue 115):

  * web/credits.json parses, every work names its licence, and every licence text it points at is shipped under web/;
  * every family web/fonts.css sets type in has its copyright line in web/assets/fonts/OFL.txt;
  * the map's scene.json has the sources the Credits screen shows, and the README names the same aerial photographs;
  * web/index.html carries og:image, og:url, twitter:card and a canonical link, all absolute and of one site, and
    web/og.jpg is the 1200x630 picture they name;
  * web/version.js links commits in this repository, and the page loads credits.js, which shows the version;
  * the Credits can be reached from the title, the pause menu and the story's last card.

    python3 tools/credits_check.py [map]      # prints FAIL lines and exits 1, or one ok line
"""
import json
import os
import re
import struct
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
WEB = os.path.join(ROOT, "web")
MAP = sys.argv[1] if len(sys.argv) > 1 else "shibuya"
fails = []


def read(*p):
    with open(os.path.join(*p), encoding="utf8") as f:
        return f.read()


def jpeg_size(path):
    """(width, height) of a JPEG, from its start-of-frame marker"""
    with open(path, "rb") as f:
        b = f.read()
    i = 2
    while i + 9 < len(b):
        if b[i] != 0xFF:
            i += 1
            continue
        m = b[i + 1]
        if 0xC0 <= m <= 0xCF and m not in (0xC4, 0xC8, 0xCC):
            h, w = struct.unpack(">HH", b[i + 5:i + 9])
            return w, h
        i += 2 + struct.unpack(">H", b[i + 2:i + 4])[0]
    return None


# the list of works, and the licence texts it points at
try:
    credits = json.loads(read(WEB, "credits.json"))
except (OSError, ValueError) as e:
    credits = {}
    fails.append(f"web/credits.json: {e}")
works = credits.get("works", [])
if credits and len(works) < 6:
    fails.append(f"web/credits.json names {len(works)} works")
for w in works:
    for k in ("name", "use", "by", "licence"):
        if not w.get(k):
            fails.append(f"credits.json: {w.get('name', '?')} has no {k}")
    if w.get("text") and not os.path.isfile(os.path.join(WEB, w["text"])):
        fails.append(f"credits.json: {w['name']}: its licence text web/{w['text']} is not shipped")
    if w.get("licence", "").startswith(("MIT", "SIL")) and not w.get("text"):
        fails.append(f"credits.json: {w['name']} ({w['licence']}) ships no licence text")
if credits and len(credits.get("attribution", [])) < 4:
    fails.append("credits.json: the credit lines the data's licences ask for are missing")

# the fonts the page sets type in, each in the OFL's list
try:
    ofl = read(WEB, "assets", "fonts", "OFL.txt")
    if "SIL OPEN FONT LICENSE Version 1.1" not in ofl:
        fails.append("web/assets/fonts/OFL.txt does not carry the licence's text")
    for fam in sorted(set(re.findall(r"font-family:\s*'([^']+)'", read(WEB, "fonts.css")))):
        if not re.search(rf"^{re.escape(fam)}: .*\S", ofl, re.M):
            fails.append(f"web/assets/fonts/OFL.txt has no copyright line for {fam} (web/fonts.css)")
except OSError as e:
    fails.append(f"the fonts' licence: {e}")

# the map's sources, and the README beside them
try:
    src = json.loads(read(WEB, "data", MAP, "scene.json")).get("sources") or {}
    for k in ("buildings", "heights", "terrain", "imagery"):
        if not src.get(k):
            fails.append(f"web/data/{MAP}/scene.json sources has no {k}")
    readme = read(ROOT, "README.md")
    if "Tokyo Metropolitan Government" in src.get("imagery", "") and "Tokyo Metropolitan Government" not in readme:
        fails.append("README.md does not name the aerial photographs scene.json does (Tokyo Metropolitan Government)")
    for w in works:
        key = re.sub(r"\s+(r?\d[\d.]*|avatars and animations|textures)$", "", w.get("name", ""))
        if key and key != "Typefaces" and key.split()[0].lower() not in readme.lower():
            fails.append(f"README.md does not name {w['name']} (web/credits.json)")
except (OSError, ValueError) as e:
    fails.append(f"the map's sources: {e}")

# a link's preview
html = read(WEB, "index.html")


def meta(attr, name):
    m = re.search(rf'<meta {attr}="{re.escape(name)}" content="([^"]*)"', html)
    return m.group(1) if m else None


canon = re.search(r'<link rel="canonical" href="([^"]+)"', html)
site = canon.group(1) if canon else None
if not site or not site.startswith("https://") or not site.endswith("/"):
    fails.append(f"web/index.html: no absolute canonical link ({site})")
if meta("property", "og:url") != site:
    fails.append(f"web/index.html: og:url ({meta('property', 'og:url')}) is not the canonical address ({site})")
for attr, name in (("property", "og:image"), ("name", "twitter:image")):
    if site and meta(attr, name) != site + "og.jpg":
        fails.append(f"web/index.html: {name} ({meta(attr, name)}) is not {site}og.jpg")
if meta("name", "twitter:card") != "summary_large_image":
    fails.append("web/index.html: twitter:card is not summary_large_image")
if not meta("property", "og:image:alt"):
    fails.append("web/index.html: og:image has no alt text")
try:
    size = jpeg_size(os.path.join(WEB, "og.jpg"))
    if size != (1200, 630):
        fails.append(f"web/og.jpg is {size}, not 1200x630")
    elif (meta("property", "og:image:width"), meta("property", "og:image:height")) != ("1200", "630"):
        fails.append("web/index.html: og:image:width and og:image:height do not say 1200x630")
    kb = os.path.getsize(os.path.join(WEB, "og.jpg")) / 1024
    if kb > 600:
        fails.append(f"web/og.jpg is {kb:.0f} kB: some sites drop a preview picture that heavy")
except OSError as e:
    fails.append(f"web/og.jpg: {e}")

# the version, and the ways in
ver = read(WEB, "version.js")
m = re.search(r"REPO = '([^']+)'", ver)
if not m or not m.group(1).endswith("/blue-hour"):
    fails.append(f"web/version.js links commits at {m.group(1) if m else 'nothing'}")
for need, why in (('<script src="credits.js">', "does not load credits.js"), ('href="credits.css"', "does not load credits.css")):
    if need not in html:
        fails.append(f"web/index.html {why}")
if html.find('src="version.js"') > html.find('src="credits.js"'):
    fails.append("web/index.html loads credits.js before version.js")
if "OEVersion" not in read(WEB, "credits.js"):
    fails.append("web/credits.js does not show the version")
for q, where in ((r'id="gt-credits-go"[^>]*data-credits', "the title's menu"), (r'id="gm-credits"[^>]*data-credits', "the pause menu")):
    if not re.search(q, html):
        fails.append(f"no way to the Credits from {where} (web/index.html)")
if "data-credits" not in read(WEB, "game", "story.js"):
    fails.append("no way to the Credits from the story's last card (web/game/story.js)")
if "consent" not in read(WEB, "telemetry.js") or "data-measure" not in read(WEB, "credits.js"):
    fails.append("the measurements have no switch (web/telemetry.js consent, web/credits.js)")

for f in fails:
    print("FAIL", f)
if not fails:
    print(f"ok   credits  {len(works)} works with their licences, the fonts' OFL, the map's sources, the link's picture and the version")
sys.exit(1 if fails else 0)
