// The way through Shibuya station from Hachiko Square to the Miyamasuzaka exit (cities/shibuya/scramble.py HACHIKO_EXIT),
// walked as a player walks it, with W held and the camera turned toward the next bend of OSM's footway it follows.
//  - Through, both ways: set down on the square (or on the east side), the player walks in at one opening, along the
//    passage and out at the other. Each walk must come out within a pace of the far side, by a path no longer than 1.2
//    times the footway's, and never be held a second.
//  - The gate: from the passage in front of the Hachiko gate, walking at it, the player reaches the gate and is stopped by
//    its closed flaps (the free side ends there).
// The game is stepped by its own frames (window.__game.frame), not the wall's clock, so a slow renderer walks the same.
// Exits 1 on any failure.
//   JOB_LIGHT=1 tools/job.sh run serve -- python3 -m http.server 8800 --directory web
//   tools/job.sh run stationwalk -- xvfb-run -a node tools/station_walk.js [out_dir] [WxH]
// out_dir: a still at each start and end. PHONE=1: as a phone (390x844, touch, the low tier).
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const { startPlay } = require('./start_play');
const [,, out = '', size = process.env.PHONE ? '390x844' : '960x600'] = process.argv;
// the footway's bends inside the station (HACHIKO_EXIT "way"), and a few metres out on either side of it
const WAY = [[420.2, -1027.8], [424.7, -1023.7], [432.4, -1022.0], [441.0, -1021.1]];
const WEST = [401.0, -1030.2], EAST = [459.5, -1024.3];
const GATE = { at: [437.2, -1021.5], leg: [WAY[2], WAY[3]], half: 2.8, flaps: 1.65 };   // the gate on the south side of the leg between the 3rd and 4th bends
(async () => {
  const [w, h] = size.split('x').map(Number), phone = !!process.env.PHONE;
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone });
  const errors = [];
  p.on('pageerror', e => { errors.push(String(e)); console.log('pageerror:', String(e).slice(0, 300)); });
  if (out) fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(t => { try { localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); localStorage.setItem('bh-quality', t); } catch (e) { /* storage blocked */ } }, phone ? 'low' : 'high');
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await startPlay(p);
  await p.waitForFunction(() => { const g = window.__game; return g && g.player && g.player.rig && g.frame; }, null, { timeout: 600000, polling: 500 });
  await p.evaluate(() => { const g = window.__game; if (g.cine && g.cine.active && g.cine.skip) g.cine.skip(); });
  await p.waitForFunction(() => { const g = window.__game; return !(g.cine && g.cine.active); }, null, { timeout: 120000, polling: 500 }).catch(() => console.log('(the arrival shot still on)'));
  const shot = async name => { if (out) await p.screenshot({ path: `${out}/${phone ? 'phone' : 'desk'}-${name}.png` }); };
  const put = (x, y, tx, ty) => p.evaluate(([x, y, tx, ty]) => {
    const g = window.__game; g.spawn([x, y]); const pl = g.player, yaw = Math.atan2(tx - x, ty - y);
    pl.speed = 0; pl.h = yaw; g.cam.yaw = yaw; g.cam.pitch = 0.3;
    for (let k = 0; k < 60; k++) g.frame(0.05);
  }, [x, y, tx, ty]);
  // W held along the points in turn (the camera turned to the next before each quarter second), the samples of the way
  const walk = async (pts, secs, stopAt = 0.9) => {
    await p.keyboard.down('KeyW');
    const r = await p.evaluate(([pts, secs, stopAt]) => {
      const g = window.__game, pl = g.player, way = [[pl.x, pl.y]];
      let i = 0;
      for (let t = 0; t < secs * 4 && i < pts.length; t++) {
        while (i < pts.length - 1 && Math.hypot(pts[i][0] - pl.x, pts[i][1] - pl.y) <= 2.0) i++;
        if (i === pts.length - 1 && Math.hypot(pts[i][0] - pl.x, pts[i][1] - pl.y) <= stopAt) break;
        g.cam.yaw = Math.atan2(pts[i][0] - pl.x, pts[i][1] - pl.y);
        for (let k = 0; k < 5; k++) g.frame(0.05);
        way.push([pl.x, pl.y]);
      }
      return way;
    }, [pts, secs, stopAt]);
    await p.keyboard.up('KeyW');
    await p.evaluate(() => { const g = window.__game; for (let k = 0; k < 12; k++) g.frame(0.05); });
    return r;
  };
  const length = pts => pts.slice(1).reduce((a, q, i) => a + Math.hypot(q[0] - pts[i][0], q[1] - pts[i][1]), 0);
  let bad = 0;
  for (const [name, from, to, via] of [['west to east', WEST, EAST, WAY], ['east to west', EAST, WEST, WAY.slice().reverse()]]) {
    await put(from[0], from[1], via[0][0], via[0][1]);
    await shot(`way-${name.replace(/ /g, '-')}-start`);
    const line = length([from, ...via, to]);
    const pts = await walk([...via, to], 60);
    let held = 0, most = 0;
    for (let i = 1; i < pts.length; i++) { held = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) < 0.1 ? held + 1 : 0; most = Math.max(most, held); }
    const end = pts[pts.length - 1], d = Math.hypot(to[0] - end[0], to[1] - end[1]), len = length(pts), ratio = len / Math.max(0.1, line - Math.min(d, 0.9));
    await shot(`way-${name.replace(/ /g, '-')}-end`);
    const ok = d <= 1.2 && ratio <= 1.2 && most < 4;
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: the footway ${line.toFixed(1)} m, walked ${len.toFixed(1)} m (x${ratio.toFixed(2)}) in ${((pts.length - 1) / 4).toFixed(1)} s, ` +
      `${d.toFixed(2)} m from the far side, held ${(most / 4).toFixed(2)} s at most`);
  }
  {
    // the gate: in from the passage's middle, square at it, until stopped
    const [a, c] = GATE.leg, L = Math.hypot(c[0] - a[0], c[1] - a[1]), f = [(c[0] - a[0]) / L, (c[1] - a[1]) / L], r = [f[1], -f[0]];
    await put(GATE.at[0], GATE.at[1], GATE.at[0] + r[0] * 8, GATE.at[1] + r[1] * 8);
    const pts = await walk([[GATE.at[0] + r[0] * 9, GATE.at[1] + r[1] * 9]], 8, 0.05);
    // (measured from the passage's middle line, the leg's own: where the player is set down is the game's to settle)
    const deep = Math.max(...pts.map(([x, y]) => (x - a[0]) * r[0] + (y - a[1]) * r[1]));
    await shot('gate');
    // (into the gate's opening, and short of its flaps: its cabinets, as the walking world holds them, stand a little
    // proud of where they are drawn, so the player stops at the line of them)
    const ok = deep >= GATE.half + 0.3 && deep <= GATE.half + GATE.flaps;
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} the gate: came ${deep.toFixed(2)} m in from the passage's middle, into its opening (from ${(GATE.half + 0.3).toFixed(2)} m) and short of its flaps (${(GATE.half + GATE.flaps).toFixed(2)} m)`);
  }
  if (errors.length) { bad++; console.log(`${errors.length} page errors`); }
  await b.close();
  console.log(bad ? `${bad} walks failed` : 'the way through the station is clear both ways, and the gate holds');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
