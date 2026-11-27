// Your car driven at the guard rails a hero level draws (the owner's report, 27 November 2026: the car stood with the
// white pipes through its bonnet at the Scramble's kerb). At every few metres of rail on the carriageway's side, your car
// is put 5 m off it, facing it, and driven at it, W held, for two seconds of the game; then its body, as drawn, is held
// against the rails' points (tools/rails_drawn.js inBox, drawn in by 0.15 m). Exits 1 on a car with a rail inside it.
//   python3 -m http.server 8800 --directory web &
//   node tools/car_rail.js [level=scramble] [every=6]        (OFF=1: the rails not solid to the car, nav.pushFence off)
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const { railsInPage } = require('./rails_drawn');
const [,, LEVELS = 'scramble,miyamasu,scramblesq', EVERY = '3'] = process.argv;
(async () => {
  const b = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 900, height: 560 } });
  p.on('pageerror', e => console.log(`pageerror: ${String(e).slice(0, 300)}`));
  await p.addInitScript(() => { try { localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* */ } });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1&overture=0#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 600000 });
  await startPlay(p, { asIs: true });
  await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 200 && g.arriving && g.arriving(); i++) { g.settleArrival(); g.advance(0.1); } if (g.cine && g.cine.active) g.cine.skip(); });
  await p.evaluate(railsInPage);
  const R = { tried: 0, through: [] };
  for (const LEVEL of LEVELS.split(',')) {
  const r = await p.evaluate(async ([id, EVERY, OFF]) => {
    const g = window.__game, H = g.hero(), L = H.levels.find(q => q.h.id === id), pl = g.player;
    if (!L) return { err: `no level ${id}` };
    const [x, y] = L.h.at, f = g.nav.floorAt(x, y, (L.h.z ?? g.nav.terrain(x, y)) + 1);
    pl.x = x; pl.y = y; pl.z = f ? f.z : g.nav.terrain(x, y); pl.mode = 'foot';
    const t0 = Date.now();
    while (Date.now() - t0 < 300000 && !(L.root && L.root.visible)) { g.frame(1 / 30); await new Promise(r => setTimeout(r, 200)); }
    for (let t = 0; !g.myCar() && t < 120; t++) { await new Promise(r => setTimeout(r, 500)); g.frame(1 / 30); }
    const mc = g.myCar(); if (!mc) return { err: 'no car' };
    if (OFF) g.nav.pushFence = null;
    window.__rails.levels();
    const all = []; for (const l of window.__rails.cells()) if (l[3] && Math.hypot(l[0] - x, l[1] - y) < L.h.r) all.push(l);
    const road = (px, py) => { const q = g.roadNet.nearest(px, py, 12); return q && q.d < 3.5; };
    const out = { rails: all.length, tried: 0, through: [] }, done = new Set();
    let m = 0;
    for (const [px, py, pz] of all) {
      const k = `${Math.floor(px / 3)},${Math.floor(py / 3)}`; if (done.has(k)) continue; done.add(k);
      if (m++ % EVERY) continue;
      // (the rail's way here, and the side of it the road is on)
      const P = all.filter(q => Math.abs(q[0] - px) < 1.2 && Math.abs(q[1] - py) < 1.2);
      let sxx = 0, sxy = 0, syy = 0, mx = 0, my = 0; for (const q of P) { mx += q[0]; my += q[1]; } mx /= P.length; my /= P.length;
      for (const q of P) { const dx = q[0] - mx, dy = q[1] - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
      const a = 0.5 * Math.atan2(2 * sxy, sxx - syy), ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
      let side = 0; for (const sgn of [1, -1]) if (road(px + nx * sgn * 5, py + ny * sgn * 5)) { side = sgn; break; }
      if (!side) continue;
      const sx = px + nx * side * 5, sy = py + ny * side * 5, fl = g.nav.floorAt(sx, sy, pz + 1), h = Math.atan2(px - sx, py - sy);
      if (!fl) continue;
      if (g.player.mode === 'car') g.exitCar();
      Object.assign(mc.D.st, { x: sx, y: sy, z: fl.z, h, v: 0, speed: 0, vx: 0, vy: 0, r: 0 }); mc.C.place(sx, sy, fl.z, h);
      g.player.mode = 'foot'; g.player.x = sx + 1.5; g.player.y = sy; g.enterCar();
      if (g.player.mode !== 'car') continue;
      out.tried++;
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true }));
      for (let i = 0; i < 60; i++) g.frame(1 / 30);
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w', bubbles: true }));
      for (let i = 0; i < 10; i++) g.frame(1 / 30);
      const st = mc.D.st, hit = window.__rails.inBox(st.x, st.y, st.z, st.h, mc.C.half - 0.15, mc.C.hw - 0.15);
      (out.end || (out.end = [])).push([+(Math.hypot(st.x - px, st.y - py) - mc.C.half).toFixed(1), +Math.hypot(st.x - sx, st.y - sy).toFixed(1)]);
      const past = ((st.x - px) * nx + (st.y - py) * ny) * side < 0 && Math.abs((st.x - px) * ux + (st.y - py) * uy) < 2; // (its middle over on the rail's far side, straight across from where it met it: driven through it, not round its end)
      if (hit || past) out.through.push({ at: [+px.toFixed(1), +py.toFixed(1)], car: [+st.x.toFixed(1), +st.y.toFixed(1)], pt: hit ? hit.map(v => +v.toFixed(2)) : null });
    }
    return out;
  }, [LEVEL, +EVERY, !!process.env.OFF]);
  console.log(LEVEL, JSON.stringify(r));
  if (r.err) R.err = r.err; else { R.tried += r.tried; R.through.push(...r.through); }
  }
  const r = R, bad = r.err || r.through.length;
  console.log(bad ? `FAIL car_rail: ${r.err || `${r.through.length} of ${r.tried} drives ended with a rail inside the car`}` : `ok   car_rail: ${r.tried} drives at the rails, none through one`);
  await b.close();
  process.exit(bad ? 1 : 0);
})();
