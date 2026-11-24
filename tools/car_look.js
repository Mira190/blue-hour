// The player's car seen from fixed distances, its far copies on and off (issue 192, cars.js far copies): the page on a
// phone (390 x 844 at three to the point, the low tier, as tools/phone_frame.js) or a desktop (SIZE=1440x900, the high
// tier), on foot, the clock set to each hour, and for each distance the player stood that far from the car, between it
// and the Scramble, facing it, the chase camera behind; a still cropped round the car, and what the car draws.
//   JOB_WAIT=540 tools/job.sh run look -- xvfb-run -a node tools/car_look.js out/car_look
// SIZE (390x844), QUERY (&carfar=off: the whole car, to set beside), HOURS=13,18.2,21, DISTS=8,23,27,58,63,80,
// PORT (8800). Prints a line a still: hour, distance, the copy drawn (0 whole, 1, 2), draws, triangles.
const { chromium } = require('playwright');
const fs = require('fs');
const out = process.argv[2] || 'out/car_look';
fs.mkdirSync(out, { recursive: true });
const [W, H] = (process.env.SIZE || '390x844').split('x').map(Number), PHONE = W < 600, PORT = process.env.PORT || 8800, Q = process.env.QUERY || '';
const HOURS = (process.env.HOURS || '13,18.2,21').split(',').map(Number), DISTS = (process.env.DISTS || '8,23,27,58,63,80').split(',').map(Number);
(async () => {
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage(PHONE ? { viewport: { width: W, height: H }, deviceScaleFactor: 3, hasTouch: true, isMobile: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' } : { viewport: { width: W, height: H } });
  p.on('pageerror', e => console.log('pageerror:', String(e).slice(0, 300)));
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); } catch (e) { /* storage blocked */ } }, PHONE ? 'low' : 'high');
  await p.goto(`http://localhost:${PORT}/?walk=1${Q}#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 900000 });
  await p.waitForFunction(() => { const l = document.getElementById('g-loader'); return !l || l.hidden; }, null, { timeout: 900000, polling: 500 });
  await require('./start_play').startPlay(p);
  for (let i = 0; i < 60 && !(await p.evaluate(() => { const t = document.getElementById('g-title'); return !t || t.hidden; })); i++) {
    await p.evaluate(() => { const b = document.getElementById('gt-play'); if (b) b.click(); }); await p.waitForTimeout(1000);
  }
  await p.evaluate(async () => {
    const g = window.__game;
    for (let t = 0; t < 10 && (!g.arriving || !g.arriving()); t += 0.25) await new Promise(r => setTimeout(r, 250));
    for (let t = 0; t < 10 && g.arriving && g.arriving(); t += 0.25) { g.settleArrival(); g.advance(0.25); await new Promise(r => requestAnimationFrame(r)); }
    const O = window.OEOnboard, t = O && O.current && O.current(); if (t) t.skip();
    if (g.cine && g.cine.active) g.cine.skip();
    for (let t = 0; t < 120 && !(g.myCar && g.myCar()); t++) await new Promise(r => setTimeout(r, 500)); // (the car parked once the cars have come)
  });
  const info = await p.evaluate(() => { const c = window.__game.myCar(); return c ? { x: c.D.st.x, y: c.D.st.y, z: c.D.st.z, build: c.C.far ? c.C.far() : null } : null; });
  console.log('car', JSON.stringify(info));
  if (!info) { await b.close(); return; }
  for (const hr of HOURS) {
    await p.evaluate(h => { const g = window.__game, c = g.clock; g.setClock(c.y, c.m, c.d, Math.round(h * 60)); if (g.weather) g.weather.set('clear', { now: true }); }, hr);
    for (const d of DISTS) {
      // the player d - 5.5 m from the car towards the Scramble's middle, facing it: the chase camera 5.5 m behind, so the lens d m off
      const r = await p.evaluate(async ([d, info]) => {
        const g = window.__game, pl = g.player, sx = 377, sy = -1013, ux = sx - info.x, uy = sy - info.y, l = Math.hypot(ux, uy) || 1;
        const k = Math.max(0.5, d - 5.5), x = info.x + ux / l * k, y = info.y + uy / l * k;
        pl.x = x; pl.y = y; if (g.nav && g.nav.terrain) pl.z = g.nav.terrain(x, y); pl.h = Math.atan2(-ux, -uy);
        Object.assign(g.cam, { mode: 'chase', yaw: pl.h, pitch: 0.05, dist: 5.5, distTo: 0, yawTo: null, lastInput: -10 });
        for (let i = 0; i < 30; i++) await new Promise(q => requestAnimationFrame(q));
        const c = g.myCar(), v = new THREE.Vector3(); c.C.group.getWorldPosition(v); const cam = g.camera, dist = v.distanceTo(cam.position);
        v.y += 0.7; v.project(cam);
        const ms = []; c.C.group.traverse(o => { if (o.isMesh && o.geometry.attributes.position) { let s = true; for (let q = o; q; q = q.parent) if (!q.visible) s = false; if (s) ms.push(o); } });
        return { dist: +dist.toFixed(1), sx: (v.x + 1) / 2, sy: (1 - v.y) / 2, far: c.C.far ? c.C.far().far : 0, draws: ms.length, tris: ms.reduce((n, m) => n + (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3, 0) };
      }, [d, info]);
      const png = `${out}/h${hr}-d${d}.png`, s = PHONE ? 3 : 1, half = Math.round((PHONE ? 70 : 160) * 8 / Math.max(8, r.dist) + (PHONE ? 30 : 60));
      const cx = Math.round(r.sx * W), cy = Math.round(r.sy * H);
      await p.screenshot({ path: png, clip: { x: Math.max(0, cx - half), y: Math.max(0, cy - half), width: Math.min(2 * half, W), height: Math.min(2 * half, H) } });
      console.log(`h${hr} d${d}: ${r.dist} m from the lens, copy ${r.far}, ${r.draws} draws, ${Math.round(r.tris)} triangles`);
    }
  }
  await b.close();
})();
