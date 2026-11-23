// Nobody leaves or joins the street in the player's sight: the walk, stood at the Scramble and inside each side of
// the planned area's edge looking out, the camera held and then panned, then at the Scramble again with a quarter of
// the crowd taken off (the governor's rung, a late hour), and every walker that is gone (hidden, or
// somewhere else in one step) or come from nowhere while it is on the screen is counted. On the screen is worked out
// here, not asked of the crowd (actors.js seen()): inside the camera's frame, within FAR metres of it, and no
// building's solid on the line from the eye to the walker's head.
// Fails on more than LIMIT such walkers a minute (0.5 by default).
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/crowd_vanish.js [WxH, 1440x900] [hour, blue] [seconds a standpoint, 40]
const { chromium } = require('playwright');
const [,, size = '1440x900', hour = 'blue', secs = '40'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number), phone = w < 500;
  const args = process.env.GPU === 'metal' ? ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-gpu']
    : process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: process.env.GPU !== 'metal' && !process.env.DISPLAY, args });
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
  const p = await ctx.newPage();
  let bad = false;
  p.on('pageerror', e => { bad = true; console.log(`FAIL pageerror: ${String(e).slice(0, 200)}`); });
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); localStorage.setItem('bh-player', 'kagami'); localStorage.setItem('bh-walk-intro', '1'); } catch (e) { /* storage blocked */ } }, process.env.TIER || (phone ? 'low' : 'high'));
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?overture=0`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  const stands = await p.evaluate(async hr => {
    const g = window.__game, B = g.bounds && g.bounds();
    if (g.lateReady) await g.lateReady();
    g.hold(true);
    g.walkStart({ t: hr, w: 'clear' });
    for (let i = 0; i < 40; i++) { g.advance(0.25); if (g.dlg.open) g.dlg.quit(); }
    const S = [{ name: 'the start', x: g.player.x, y: g.player.y, z: g.player.z, yaw: g.cam.yaw }];
    if (!B) return S;
    // the widest street's works facing each quarter: stood 25 m inside them, looking out across the edge
    const q = {};
    for (const c of B.works.filter(c => !c.foot && c.cos > 0.6)) { const k = Math.round(Math.atan2(c.e.nx, c.e.ny) / (Math.PI / 2)) & 3; if (!q[k] || c.w > q[k].w) q[k] = c; }
    for (const [k, c] of Object.entries(q)) for (const d of [25, 30, 20, 36]) {
      const x = c.x - c.rx * d, y = c.y - c.ry * d, wk = g.nav.walk(x, y, c.z + 0.5, true);
      if (wk.ok) { S.push({ name: `the ${['north', 'east', 'south', 'west'][k]} edge`, x, y, z: wk.z, yaw: Math.atan2(c.rx, c.ry) }); break; }
    }
    S.push(Object.assign({}, S[0], { name: 'the start, the crowd thinned by a quarter', thin: true }));
    return S;
  }, hour);
  let total = 0, minutes = 0;
  for (const st of stands) {
    const r = await p.evaluate(([st, secs, FAR, thin]) => {
      const g = window.__game, P = g.player, C = g.camera, B = g.bounds && g.bounds(), W = g.crowd.P, dt = 1 / 30;
      if (g.dlg.open) g.dlg.quit();
      [P.x, P.y, P.z] = [st.x, st.y, st.z]; P.speed = 0; P.h = st.yaw;
      Object.assign(g.cam, { yaw: st.yaw, yawTo: null, pitchTo: null });
      for (let i = 0; i < 90; i++) g.frame(dt); // (the crowd round the new place, the camera settled: not counted)
      const v = new THREE.Vector3(), vp = new THREE.Matrix4(), vp0 = new THREE.Matrix4();
      const onScreen = (m, e, x, y, z) => {
        const d = Math.hypot(x - e.x, y - e.y, z + 1 - e.z);
        if (d > FAR) return false;
        v.set(x, z + 1, -y).applyMatrix4(m);
        if ((x - e.x) * e.fx + (y - e.y) * e.fy + (z + 1 - e.z) * e.fz < 0.5) return false; // (behind the camera: its projection is no test, the depth reversed)
        if (Math.abs(v.x) > 0.96 || Math.abs(v.y) > 0.96) return false;
        for (let s = 0.5; s < d - 0.5; s += 0.5) { const k = s / d; if (g.nav.solid(e.x + (x - e.x) * k, e.y + (y - e.y) * k, e.z + (z + 1.5 - e.z) * k, 0.2)) return false; }
        return true;
      };
      const view = m => { C.updateMatrixWorld(); m.multiplyMatrices(C.projectionMatrix, C.matrixWorldInverse.copy(C.matrixWorld).invert()); C.getWorldDirection(v); return { x: C.position.x, y: -C.position.z, z: C.position.y, fx: v.x, fy: -v.z, fz: v.y }; };
      const here = q => q.line >= 0 || !!q.pz || q.state === 'reg';
      const CARS = (g.cars && g.cars.C) || [];
      const snap = () => W.map((q, i) => i < g.crowd.active && here(q) ? [q.x, q.y, q.z, q.arrived | 0, q.state, g.crowd.seen(q.x, q.y, q.z)] : null)
        .concat(CARS.map((c, i) => i < g.cars.active && c.line >= 0 ? [c.x, c.y, c.z || 0, 0, c.bus ? 'a bus' : c.park ? 'a parked car' : 'a car', null] : null)); // (and the traffic's cars after them)
      const ev = [];
      g.crowd.why = true;
      let e0 = view(vp0), was = snap();
      for (let f = 0; f < secs * 30; f++) {
        if (f > secs * 15) g.cam.yaw += 0.2 * dt; // (the second half: the camera pans, 11 degrees a second)
        // (thin: a quarter of the crowd taken off a third of the way in, as a slow device's governor does and a late hour)
        if (thin && f === secs * 10) { if (g.crowdAuto) g.crowdAuto(false); const n = Math.round(g.crowd.active * 0.75); if ('want' in g.crowd) g.crowd.want = n; else g.crowd.active = n; }
        const bus0 = (g.crowd.boarded | 0) + (g.crowd.alighted | 0);
        g.frame(dt);
        const e = view(vp), now = snap(), bus = (g.crowd.boarded | 0) + (g.crowd.alighted | 0) > bus0; // (bus: someone got on a bus or off one this step, at its door: seen, and as it should be)
        for (let i = 0; i < now.length; i++) {
          const a = was[i], c = now[i];
          if ((bus && i < W.length) || (a && c && Math.hypot(c[0] - a[0], c[1] - a[1]) < (i < W.length ? 3 : 6))) continue;
          // (seen to go: where it was is on the screen in the frame before and in this one; seen to come: where it is)
          if (a && onScreen(vp0, e0, a[0], a[1], a[2]) && onScreen(vp, e, a[0], a[1], a[2])) ev.push({ how: 'gone', t: +(f * dt).toFixed(1), x: +a[0].toFixed(1), y: +a[1].toFixed(1), d: +Math.hypot(a[0] - e.x, a[1] - e.y).toFixed(0), edge: B ? +B.sd(a[0], a[1]).s.toFixed(1) : null, arrived: a[3], state: a[4], seen: a[5], pan: f > secs * 15, why: i < W.length ? W[i].goneWhy : '' });
          if (c && onScreen(vp0, e0, c[0], c[1], c[2]) && onScreen(vp, e, c[0], c[1], c[2])) ev.push({ how: 'come', t: +(f * dt).toFixed(1), x: +c[0].toFixed(1), y: +c[1].toFixed(1), d: +Math.hypot(c[0] - e.x, c[1] - e.y).toFixed(0), edge: B ? +B.sd(c[0], c[1]).s.toFixed(1) : null, arrived: c[3], state: c[4], seen: c[5], pan: f > secs * 15 });
        }
        was = now; e0 = e; vp0.copy(vp);
      }
      return { ev, active: g.crowd.active, boarded: g.crowd.boarded | 0 };
    }, [st, +secs, phone ? 250 : 400, !!st.thin]);
    total += r.ev.length; minutes += secs / 60;
    console.log(`${st.name} (${st.x.toFixed(0)}, ${st.y.toFixed(0)}): ${r.ev.length} seen to go or come in ${secs} s, of ${r.active} walkers`);
    for (const e of r.ev.slice(0, 12)) console.log(`  ${e.how} at ${e.t} s (${e.x}, ${e.y}) ${e.d} m off${e.edge != null ? `, ${e.edge} m from the edge` : ''}, ${e.state}${e.arrived ? ' arrived ' + e.arrived : ''}, the crowd's own seen() ${e.seen}${e.pan ? ', panning' : ''}${e.why ? ' ' + e.why.replace(/^.*\//, '') : ''}`);
  }
  const rate = total / minutes, limit = +(process.env.LIMIT || 0.5);
  console.log(`${total} walkers seen to go or come in ${minutes.toFixed(1)} minutes: ${rate.toFixed(2)} a minute (limit ${limit})`);
  if (rate > limit) { bad = true; console.log('FAIL walkers leave or join the street in sight'); }
  await b.close();
  process.exit(bad ? 1 : 0);
})();
