// Walk into what stands on SHIBUYA SKY's roof, as a player might: each bench, each net's frame and each searchlight
// (game.json hero[].boxes, cities/shibuya/hero_skyroof.py boxes), from 2.5 m off each of its four sides, running and
// then walking straight at its middle for three seconds, and see how far into it the body gets. The owner's phone
// showed the walk's player standing in a bench to the knee at the glass where Yuna waits: the level drew the benches
// over a landmark that has none, and nothing made them solid.
//   JOB_LIGHT=1 tools/job.sh run serve -- python3 -m http.server 8800 --directory web
//   tools/job.sh run roofprops -- xvfb-run -a node tools/roof_props_walk.js
// Prints each box and side, and FAIL where the body's middle came within the walker's radius of the box (nav.js R)
// by more than 5 cm; exits 1 on any.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { startPlay } = require('./start_play');
const G = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'web', 'data', 'shibuya', 'game.json'), 'utf8'));
const level = (G.hero || []).find(h => h.id === 'skyroof');
if (!level || !(level.boxes || []).length) { console.error('no boxes on the skyroof level (game.json hero[].boxes)'); process.exit(1); }
(async () => {
  const b = await chromium.launch(process.env.DISPLAY
    ? { headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] }
    : { args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
  await p.addInitScript(() => { try { localStorage.setItem('oe3d-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } });
  const logs = [];
  p.on('pageerror', e => logs.push(`pageerror: ${String(e).slice(0, 300)}`));
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 900000 });
  await p.evaluate(async () => { const g = window.__game; g.hold(true, true); await g.ways.build(); });
  await startPlay(p);
  await p.evaluate(() => { const g = window.__game; g.advance(1); if (g.cine && g.cine.active && g.cine.skip) g.cine.skip(); g.advance(3); });
  const res = await p.evaluate(([B, Z]) => {
    const g = window.__game, pl = g.player, nav = g.nav, R = nav.R, out = [];
    nav.prefetch(B[0][0], B[0][1], 80, Infinity);
    for (let i = 0; i < B.length; i++) {
      const [x, y, hd, hl, hw, z0, z1] = B[i], fx = Math.sin(hd), fy = Math.cos(hd), lx = -fy, ly = fx;
      const toBox = (px, py) => { const dx = px - x, dy = py - y; return [dx * fx + dy * fy, dx * lx + dy * ly]; };
      for (const [su, sv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const off = su ? hl + 2.5 : hw + 2.5, sx = x + (fx * su + lx * sv) * off, sy = y + (fy * su + ly * sv) * off;
        const f = nav.floorAt(sx, sy, Z + 0.5);
        if (!f || Math.abs(f.z - Z) > 0.4 || !nav.walk(sx, sy, f.z).ok) { out.push({ i, su, sv, skip: 'no floor there (the glass, the pad)' }); continue; }
        let depth = -Infinity, at = null;
        for (const walk of [false, true]) {
          [pl.x, pl.y, pl.z] = [sx, sy, f.z]; pl.mode = 'foot'; pl.ground = true; pl.vz = 0; pl.walking = walk; pl.floor = null;
          const a = Math.atan2(x - sx, y - sy);
          pl.h = a; g.cam.yaw = a;
          for (let t = 0; t < 3; t += 0.25) {
            g.cam.yaw = a; g.advance(0.25, ['KeyW']);
            const [u, v] = toBox(pl.x, pl.y), d = Math.min(hl + R - Math.abs(u), hw + R - Math.abs(v));
            if (d > depth) { depth = d; at = [+pl.x.toFixed(2), +pl.y.toFixed(2), +pl.z.toFixed(2)]; }
          }
        }
        out.push({ i, su, sv, depth: +depth.toFixed(3), at });
      }
    }
    return out;
  }, [level.boxes, level.z]);
  const kind = i => { const [, , , hl] = level.boxes[i]; return hl > 3 ? 'net' : hl > 1 ? 'bench' : 'searchlight'; };
  let bad = 0, n = 0;
  for (const r of res) {
    const side = r.su ? (r.su > 0 ? 'one end' : 'the other end') : (r.sv > 0 ? 'one side' : 'the other side');
    if (r.skip) { console.log(`--   box ${r.i} (${kind(r.i)}) from ${side}: ${r.skip}`); continue; }
    n++;
    const fail = r.depth > 0.05;
    if (fail) bad++;
    console.log(`${fail ? 'FAIL' : 'ok  '} box ${r.i} (${kind(r.i)}) from ${side}: ${fail ? `${r.depth.toFixed(2)} m into it` : `stopped ${(-r.depth).toFixed(2)} m short of a body's touch`} at ${r.at}`);
  }
  console.log(`${bad} of ${n} walks went into a bench, a net or a searchlight`);
  if (logs.length) console.log(logs.join('\n'));
  await b.close();
  process.exit(bad || logs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
