// Your car driven up through a place on a street where it once stopped dead on open paving with "Too steep a drop."
// (tools/car_edges.js), with the game running at the owner's hour: the car put on the road line nearest (x, y), 12 m
// below the place on its uphill side, you at the wheel and W held until it is 10 m past the place or the time runs out.
// Prints what the car did (how far it got, its speed, every toast shown) and writes stills before, at and after the place.
//   GAME_TIME=17:43 xvfb-run -a node tools/car_edge_shot.js <x> <y> <outDir> [phone]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { startPlay } = require('./start_play');
const { pinClock } = require('./pin_clock');
const [,, X = '413.9', Y = '-989.6', OUT = 'out/car_edge', dev = ''] = process.argv;
const phone = dev === 'phone';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const ctx = phone ? await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
    : await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('pageerror', String(e).slice(0, 300)));
  await pinClock(p, 'shibuya');
  await p.addInitScript(() => { try { localStorage.setItem('bh-quality', 'high'); localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game', null, { timeout: 600000 });
  await startPlay(p, { asIs: true });
  await p.evaluate(() => { const g = window.__game; if (g.cine && g.cine.active) g.cine.skip(); });
  await p.waitForFunction(() => window.__game.myCar && window.__game.myCar(), null, { timeout: 180000 });
  // the place on its road line, and the way up it
  const at = await p.evaluate(([x, y]) => {
    const g = window.__game, nav = g.nav, D = g.myCar().D;
    let best = null;
    for (const l of g.roadNet.L) {
      const P = l.pts;
      for (let k = 0; k + 5 < P.length; k += 3) {
        const ax = P[k], ay = P[k + 1], dx = P[k + 3] - ax, dy = P[k + 4] - ay, L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2));
        const d = Math.hypot(x - ax - dx * t, y - ay - dy * t);
        if (!best || d < best.d) best = { d, x: ax + dx * t, y: ay + dy * t, h: Math.atan2(dx, dy) };
      }
    }
    const fx = Math.sin(best.h), fy = Math.cos(best.h), T = (s, sg) => nav.terrain(best.x + sg * fx * s, best.y + sg * fy * s);
    const sg = T(8, 1) > T(8, -1) ? 1 : -1, h = sg > 0 ? best.h : best.h + Math.PI;
    const x0 = best.x - Math.sin(h) * 12, y0 = best.y - Math.cos(h) * 12, f = nav.floorAt(x0, y0, nav.terrain(x0, y0) + 1);
    Object.assign(D.st, { x: x0, y: y0, z: f ? f.z : nav.terrain(x0, y0), h, vx: 0, vy: 0, r: 0, steer: 0, vz: 0, air: false, reverse: false });
    g.enterCar();
    // (the traffic on this stretch sent away, so that what stops the car, if anything, is the street: not a car in its lane)
    if (g.cars && g.cars.C) for (const c of g.cars.C) if (Math.hypot(c.x - best.x, c.y - best.y) < 60) { c.line = -1; c.x = c.y = 1e5; }
    window.__toasts = [];
    new MutationObserver(() => { const t = document.getElementById('g-toasts'); if (t) for (const e of t.children) { const s = e.textContent.trim(); if (s && !window.__toasts.includes(s)) window.__toasts.push(s); } })
      .observe(document.getElementById('g-toasts'), { childList: true, subtree: true });
    return { x: best.x, y: best.y, h, z0: D.st.z, rise: +(nav.terrain(best.x + Math.sin(h) * 6, best.y + Math.cos(h) * 6) - nav.terrain(best.x - Math.sin(h) * 6, best.y - Math.cos(h) * 6)).toFixed(2) };
  }, [+X, +Y]);
  console.log(`the place ${at.x.toFixed(1)}, ${at.y.toFixed(1)}, heading ${at.h.toFixed(2)}: the ground rises ${at.rise} m in the 12 m round it`);
  const along = () => p.evaluate(a => { const st = window.__game.myCar().D.st; return { s: (st.x - a.x) * Math.sin(a.h) + (st.y - a.y) * Math.cos(a.h), v: st.speed, z: st.z, toasts: window.__toasts.slice() }; }, at);
  await p.waitForTimeout(3000);
  await p.screenshot({ path: path.join(OUT, `${phone ? 'phone' : 'desktop'}_0_below.png`) });
  await p.keyboard.down('KeyW');
  const t0 = Date.now(); let q = await along(), shotAt = false, vmax = 0;
  while (Date.now() - t0 < 180000 && q.s < 10) {
    await p.waitForTimeout(400);
    q = await along(); vmax = Math.max(vmax, q.v);
    if (!shotAt && q.s > -1) { shotAt = true; await p.screenshot({ path: path.join(OUT, `${phone ? 'phone' : 'desktop'}_1_at.png`) }); }
  }
  await p.keyboard.up('KeyW');
  await p.screenshot({ path: path.join(OUT, `${phone ? 'phone' : 'desktop'}_2_past.png`) });
  const stuck = q.s < 10;
  console.log(`${stuck ? 'FAIL' : 'ok  '} the car ${stuck ? `stopped ${(-q.s).toFixed(1)} m ${q.s < 0 ? 'short of' : 'past'} the place` : `drove up through the place, ${q.s.toFixed(1)} m past it`} (up to ${(vmax * 3.6).toFixed(0)} km/h); toasts: ${q.toasts.length ? q.toasts.join(' | ') : 'none'}`);
  await b.close();
  process.exit(stuck || q.toasts.some(t => /steep|step|wall/i.test(t)) ? 1 : 0);
})();
