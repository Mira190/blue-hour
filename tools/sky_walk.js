// SHIBUYA SKY walked as a player walks it, with W held and the camera turned toward where they are going.
//  - The street lift hall (the owner, November 2026: "the player is still stopped by the black line; take away the ropes
//    in the way, have the protagonist walk it and you will see; the way has to be completely smooth"). The player is set
//    down round it: on the forecourt to the west, along the tower's north face from the south-west, by the sign pillar,
//    out on the planks to the north-west and to the north (the hall is open to the west and the north), and walks to the
//    lift. Each walk must arrive within a pace of the cars' stop, by a path no longer than 1.25 times the straight line,
//    never held, and the lift's prompt must then be offered.
//  - The roof's flights up to the helipad (the owner: "walking past the side of the stairs still goes into them"). Beside
//    each cheek of each flight, where the flight stands over a knee, the player walks into it, and along it: their middle
//    must stay a body's half width (0.3 m) out from the cheek.
// The game is stepped by its own frames (window.__game.frame), not the wall's clock, so a slow renderer walks the same.
// Exits 1 on any failure.
//   JOB_LIGHT=1 tools/job.sh run serve -- python3 -m http.server 8800 --directory web
//   tools/job.sh run skywalk -- xvfb-run -a node tools/sky_walk.js [out_dir] [WxH]
// out_dir: a still at each start and at each end. PHONE=1: as a phone (390x844, touch, the low tier). ONLY=hall|roof.
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { startPlay } = require('./start_play');
const [,, out = '', size = process.env.PHONE ? '390x844' : '960x600'] = process.argv;
const G = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'web', 'data', 'shibuya', 'game.json'), 'utf8'));
(async () => {
  const [w, h] = size.split('x').map(Number), phone = !!process.env.PHONE, only = process.env.ONLY || '';
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone });
  const errors = [];
  p.on('pageerror', e => { errors.push(String(e)); console.log('pageerror:', String(e).slice(0, 300)); });
  if (out) fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(t => { try { localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); localStorage.setItem('bh-quality', t); } catch (e) { /* storage blocked */ } }, phone ? 'low' : 'high');
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await startPlay(p);
  await p.waitForFunction(() => { const g = window.__game; return g && g.player && g.player.rig && g.lifts && g.frame; }, null, { timeout: 600000, polling: 500 });
  const shot = async name => { if (out) await p.screenshot({ path: `${out}/${phone ? 'phone' : 'desk'}-${name}.png` }); };
  const S = () => p.evaluate(() => { const g = window.__game, pl = g.player, pr = document.getElementById('g-prompt');
    return { x: pl.x, y: pl.y, z: pl.z, prompt: pr && !pr.hidden ? (document.getElementById('gp-text') || pr).textContent : '' }; });
  // set down at (x, y) on the level at about z, facing (tx, ty), and given a few seconds of the game to settle and load
  const put = (x, y, z, tx, ty) => p.evaluate(([x, y, z, tx, ty]) => {
    const g = window.__game; g.spawn([x, y], z); const pl = g.player, yaw = Math.atan2(tx - x, ty - y);
    pl.speed = 0; pl.h = yaw; g.cam.yaw = yaw; g.cam.pitch = 0.3;
    for (let k = 0; k < 60; k++) g.frame(0.05);
  }, [x, y, z, tx, ty]);
  // W held, the camera turned to (tx, ty) before each quarter second of the game; the samples of the way
  const walk = async (tx, ty, secs, stopAt = 0.9) => {
    await p.keyboard.down('KeyW');
    const r = await p.evaluate(([tx, ty, secs, stopAt]) => {
      const g = window.__game, pl = g.player, pts = [[pl.x, pl.y]];
      for (let t = 0; t < secs * 4; t++) {
        if (Math.hypot(tx - pl.x, ty - pl.y) <= stopAt) break;
        g.cam.yaw = Math.atan2(tx - pl.x, ty - pl.y);
        for (let k = 0; k < 5; k++) g.frame(0.05);
        pts.push([pl.x, pl.y]);
      }
      return pts;
    }, [tx, ty, secs, stopAt]);
    await p.keyboard.up('KeyW');
    await p.evaluate(() => { const g = window.__game; for (let k = 0; k < 12; k++) g.frame(0.05); });
    return r;
  };
  let bad = 0;
  if (only !== 'roof') {
    // the hall's frame: v from its door (the middle of its west side) to the cars' stop, u to the right of that (south)
    const s0 = G.lifts.find(q => q.id === 'sky-gate').stops[0];
    const L = { door: s0.door, at: s0.at };
    const nx = L.at[0] - L.door[0], ny = L.at[1] - L.door[1], nl = Math.hypot(nx, ny), n = [nx / nl, ny / nl], u = [n[1], -n[0]];
    const P = (uu, vv) => [L.door[0] + u[0] * uu + n[0] * vv, L.door[1] + u[1] * uu + n[1] * vv];
    const starts = [['west', P(0, -9)], ['south-west', P(2.4, -12)], ['pillar', P(-3.6, -3.4)], ['north-west', P(-7, -6)], ['north', P(-6.5, 2.2)]];
    for (const [k, [sx, sy]] of starts) {
      await put(sx, sy, L.at[2] + 1, L.at[0], L.at[1]);
      let q = await S();
      const line = Math.hypot(L.at[0] - q.x, L.at[1] - q.y);
      await shot(`hall-${k}-start`);
      const pts = await walk(L.at[0], L.at[1], 30);
      let len = 0, held = 0, most = 0;
      for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); len += d; held = d < 0.1 ? held + 1 : 0; most = Math.max(most, held); }
      // (the prompt is the page's own loop's to draw, which the harness's frames do not run: up to 8 s of the wall for it)
      for (let k = 0; k < 16; k++) { q = await S(); if (/lift/i.test(q.prompt)) break; await p.waitForTimeout(500); }
      const d = Math.hypot(L.at[0] - q.x, L.at[1] - q.y), ratio = len / Math.max(0.1, line - Math.min(d, 0.9));
      await shot(`hall-${k}-end`);
      const ok = d <= 1.2 && ratio <= 1.25 && most < 4 && /lift/i.test(q.prompt);
      if (!ok) bad++;
      console.log(`${ok ? 'ok  ' : 'FAIL'} hall from the ${k}: ${line.toFixed(1)} m in a line, walked ${len.toFixed(1)} m (x${ratio.toFixed(2)}) in ${((pts.length - 1) / 4).toFixed(1)} s, ` +
        `${d.toFixed(2)} m from the stop, held ${(most / 4).toFixed(2)} s at most, prompt "${q.prompt}"`);
    }
  }
  if (only !== 'hall') {
    // the cheeks: the solids hero_skyroof.py gives them (half width 0.03 m), each with the side away from its flight
    const H = G.hero.find(q => q.id === 'skyroof'), c = H.at;
    const cheeks = H.boxes.filter(q => Math.abs(q[4] - 0.03) < 1e-6 && Math.abs(q[3] - 0.9) < 1e-6);
    if (cheeks.length !== 8) { bad++; console.log(`FAIL the roof has ${cheeks.length} stair cheeks, not 8`); }
    let i = 0;
    for (const [x, y, hd, hl, , z0] of cheeks) {
      const f = [Math.sin(hd), Math.cos(hd)];
      let o = [f[1], -f[0]];
      if ((x - c[0]) * o[0] + (y - c[1]) * o[1] < 0) o = [-o[0], -o[1]]; // (outward: away from the pad's middle line)
      // the cheek's high end, by the pad: which end of the box is nearer the pad's middle
      const e1 = [x + f[0] * hl, y + f[1] * hl], e2 = [x - f[0] * hl, y - f[1] * hl];
      const hi = Math.hypot(e1[0] - c[0], e1[1] - c[1]) < Math.hypot(e2[0] - c[0], e2[1] - c[1]) ? e1 : e2, lo = hi === e1 ? e2 : e1;
      const mid = [(hi[0] * 2 + lo[0]) / 3, (hi[1] * 2 + lo[1]) / 3]; // (two thirds up the flight)
      const out = q => (q.x - x) * o[0] + (q.y - y) * o[1];
      // into it, square on
      await put(mid[0] + o[0] * 1.6, mid[1] + o[1] * 1.6, z0 + 0.5, mid[0], mid[1]);
      const a = await walk(mid[0] - o[0] * 1.0, mid[1] - o[1] * 1.0, 3, 0.05);
      let least = Math.min(...a.map(([px, py]) => out({ x: px, y: py })));
      await shot(`roof-cheek${i}-into`);
      // along it, a hand's width out, from its foot to the pad, as the owner walked
      await put(lo[0] + o[0] * 0.35 - f[0] * 0, lo[1] + o[1] * 0.35, z0 + 0.5, hi[0], hi[1]);
      const bpts = await walk(hi[0] + o[0] * 0.2, hi[1] + o[1] * 0.2, 3, 0.3);
      const along = Math.min(...bpts.slice(4).map(([px, py]) => out({ x: px, y: py })));
      least = Math.min(least, along);
      await shot(`roof-cheek${i}-along`);
      const ok = least >= 0.28;
      if (!ok) bad++;
      console.log(`${ok ? 'ok  ' : 'FAIL'} roof stair cheek ${i}: nearest the middle came to it ${least.toFixed(2)} m (walked into it ${Math.min(...a.map(([px, py]) => out({ x: px, y: py }))).toFixed(2)}, along it ${along.toFixed(2)})`);
      i++;
    }
  }
  if (errors.length) { bad++; console.log(`${errors.length} page errors`); }
  await b.close();
  console.log(bad ? `${bad} walks failed` : 'every walk is clear: the hall straight into, the roof\'s stairs kept to their outsides');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
