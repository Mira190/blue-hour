// The nearest crowd at set distances from the lens, each cropped from frames drawn whole, several frames apart, so that
// their arms are seen swinging (issue 130: people.js armsClear asks a crowd member's arms less often by its height on the
// screen, rig.clearEvery). For each distance the near person (a whole rig, not a far copy) standing nearest it is picked
// once and followed; each still crops the box its body projects to, with a margin.
//   node tools/crowd_arms_shot.js <out.png> [WxH]      (PORT=8801: another page; AT=3,6,12 metres; N=6 stills; GAP=150 ms)
// Writes one sheet: a row a distance, a column a still, each crop scaled to the same height; prints who and how tall.
const { chromium } = require('playwright');
const { skip, whole } = require('./draw_skip');
const [,, out = '/tmp/arms.png', size = '1440x900'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number), phone = w < 500;
  const AT = (process.env.AT || '3,6,12').split(',').map(Number), N = +(process.env.N || 6), GAP = +(process.env.GAP || 150);
  const args = process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: phone ? 3 : 1, hasTouch: phone, isMobile: phone });
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || (phone ? 'low' : 'high'));
  await skip(p, +process.env.DRAW || 1); // (every frame drawn: the near people's characters come in as frames are drawn)
  await p.goto(`http://localhost:${process.env.PORT || 8800}/${process.env.Q ?? '?walk=1'}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.waitForTimeout(4000);
  for (let k = 0; k < 15; k++) {
    if (await p.evaluate(() => { const t = document.getElementById('g-title'); if (!t || t.hidden) return true; const x = document.getElementById('gt-play'); if (x) x.click(); return false; })) break;
    await p.waitForTimeout(1500);
  }
  await p.waitForTimeout(1000 * (+process.env.WARM || 25));
  // (until the near people are made: the opening's shots bring the lens to the crowd and away again)
  await p.waitForFunction(n => { const g = window.__game, R = g.crowdDraw(); if (!R || !R.active) return false; const V = new THREE.Vector3(); let k = 0;
    for (const r of R.active.values()) { if (!r.root.visible) continue; let ok = true; for (const y of [0, 1.85]) { V.copy(r.root.position); V.y += y; V.project(g.camera); if (!(V.z > -1 && V.z < 1 && Math.abs(V.x) < 0.9 && Math.abs(V.y) < 1)) ok = false; } if (ok) k++; }
    return k >= n; }, 3, { timeout: 300000, polling: 500 }).catch(() => console.log('fewer than three near people wholly on the screen in five minutes'));
  // (who: for each distance, the near person whose distance from the lens is nearest it)
  const who = await p.evaluate(AT => { const g = window.__game, R = g.crowdDraw(), c = g.camera.position, pick = [];
    for (const d of AT) { let best = null, bd = Infinity; const onScreen = rig => { const V = new THREE.Vector3(); for (const y of [0, 1.85]) { V.copy(rig.root.position); V.y += y; V.project(g.camera); if (!(V.z > -1 && V.z < 1 && Math.abs(V.x) < 0.9 && Math.abs(V.y) < 1)) return false; } return true; };
      for (const [i, rig] of R.active) { if (!rig.root.visible || pick.some(q => q.i === i) || !onScreen(rig)) continue; const e = Math.abs(rig.root.position.distanceTo(c) - d); if (e < bd) { bd = e; best = i; } } if (best != null) pick.push({ i: best, want: d }); }
    return { pick, n: R.active.size, shown: [...R.active.values()].filter(r => r.root.visible).length, dists: [...R.active.values()].map(r => +r.root.position.distanceTo(c).toFixed(1)).slice(0, 20) }; }, AT).then(r => { console.log(`near people: ${r.n}, shown ${r.shown}, at ${r.dists.join(' ')} m`); return r.pick; });
  console.log('camera: ' + await p.evaluate(() => { const c = window.__game.camera; return JSON.stringify({ fov: c.fov, zoom: c.zoom, eff: c.getEffectiveFOV(), aspect: c.aspect, view: c.view, filmOffset: c.filmOffset, h: innerHeight, p11: c.projectionMatrix.elements[5] }); }));
  const shots = [];
  for (let k = 0; k < N; k++) {
    await whole(p, async () => {
      const boxes = await p.evaluate(who => { const g = window.__game, R = g.crowdDraw(), cam = g.camera, V = new THREE.Vector3(), B = new THREE.Box3();
        return who.map(q => { const rig = R.active.get(q.i); if (!rig || !rig.root.visible) return null;
          // (the body's box from where it stands: the feet and a head's height over them, as wide as the arms reach)
          const W = innerWidth, H = innerHeight, f = V.copy(rig.root.position).project(cam), fx = (f.x + 1) / 2 * W, fy = (1 - f.y) / 2 * H;
          const t = V.copy(rig.root.position).add(new THREE.Vector3(0, 1.85, 0)).project(cam), ty = (1 - t.y) / 2 * H, hh = Math.max(4, fy - ty);
          return { d: +rig.root.position.distanceTo(cam.position).toFixed(1), every: rig.clearEvery || 1, x: fx - hh * 0.35, y: ty, w: hh * 0.7, h: hh }; }); }, who);
      shots.push({ png: await p.screenshot({ timeout: 120000 }), boxes });
    });
    await p.waitForTimeout(GAP);
  }
  await b.close();
  // the sheet, laid out by Pillow (as tools/contact_sheet.py does)
  const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arms-')), list = [];
  shots.forEach((s, k) => { const f = path.join(dir, `s${k}.png`); fs.writeFileSync(f, s.png); list.push({ f, boxes: s.boxes }); });
  fs.writeFileSync(path.join(dir, 'boxes.json'), JSON.stringify({ list, at: AT, dpr: phone ? 3 : 1 }));
  execFileSync('python3', ['-c', `
import json, sys
from PIL import Image, ImageDraw
J = json.load(open(sys.argv[1])); dpr = J['dpr']; H = 260; rows = []
for r in range(len(J['at'])):
    cells = []
    for s in J['list']:
        bx = s['boxes'][r] if r < len(s['boxes']) else None
        if not bx: continue
        im = Image.open(s['f']); m = 0.15 * bx['h']
        c = im.crop((int((bx['x'] - m) * dpr), int((bx['y'] - m) * dpr), int((bx['x'] + bx['w'] + m) * dpr), int((bx['y'] + bx['h'] + m) * dpr)))
        c = c.resize((max(1, int(c.width * H / max(1, c.height))), H)); cells.append((c, bx))
    rows.append(cells)
W = max([sum(c.width + 6 for c, _ in row) for row in rows] + [200]); out = Image.new('RGB', (W, len(rows) * (H + 22)), (12, 12, 14)); d = ImageDraw.Draw(out)
for r, row in enumerate(rows):
    x = 0
    for c, bx in row:
        out.paste(c, (x, r * (H + 22) + 20)); d.text((x + 2, r * (H + 22) + 4), f"{bx['d']} m, {int(bx['h'])} px, every {bx['every']}", fill=(220, 220, 220)); x += c.width + 6
out.save(sys.argv[2])
`, path.join(dir, 'boxes.json'), out]);
  console.log(`${out}: ${who.length} people at ${AT.join(', ')} m, ${N} stills ${GAP} ms apart; ${JSON.stringify(shots[0].boxes.map(b => b && { d: b.d, px: Math.round(b.h), every: b.every }))}`);
})().catch(e => { console.error(e); process.exit(1); });
