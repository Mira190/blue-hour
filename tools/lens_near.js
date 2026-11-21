// Someone of the crowd a pace from the chase camera on foot (issue 82). With the camera at a shoulder, 2.5 m up and
// 5.5 m back, a walker a pace in front of the lens and to its side filled a corner of a phone's upright frame: not
// between the lens and the player, so the rig's lift over the crowd did nothing, and not inside the lens, so lensClear
// left them drawn. The player walks four seconds from Hachiko's side towards the crossing at dusk (tools/foot_cam.js's
// first way), the chase view behind; then one of a kerb's crowd is put at each of a few places in the frame (a point
// of the frame, x and y from -1 to 1, at D m from the lens along it), the world held, and stills taken of each: "off" with people.js's dissolve at the lens turned off, "on" as the game draws it, and "on-5s"
// the same after five seconds of held time (anything that changes between the two flickers in play). Prints how far
// the person is from the lens and the box it covers in the frame.
// On the walk as a player has it (Walk Shibuya, its own phone buttons).
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/lens_near.js out_dir [WxH]       (TIER=low for a phone's; PLACES="x,y,D;..." )
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/lens-near', size = '390x844'] = process.argv;
const PLACES = (process.env.PLACES || '0.55,-0.5,1.3;0.5,-0.45,1.9;-0.45,-0.4,2.8').split(';').map(s => s.split(',').map(Number));
(async () => {
  const [w, h] = size.split('x').map(Number), phone = w < 500;
  const b = await chromium.launch(process.env.DISPLAY
    ? { headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] }
    : { args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  const errors = [];
  p.on('pageerror', e => { errors.push(String(e)); console.log(`pageerror: ${String(e).slice(0, 300)}`); });
  fs.mkdirSync(out, { recursive: true });
  // the walk as a player has it (the title's Walk Shibuya: its own buttons and words, not ?walk=1's bare map), at blue hour
  await p.addInitScript(() => { try { if (!sessionStorage.getItem('oe-lens-near')) { sessionStorage.setItem('oe-lens-near', '1'); sessionStorage.setItem('bh-walk-auto', JSON.stringify({ t: 'blue', w: 'clear' })); } } catch (e) { /* storage blocked */ } });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => window.__game && document.getElementById('game-stage').classList.contains('walk-on'), null, { timeout: 900000, polling: 500 });
  await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 200 && g.arriving && g.arriving(); i++) { g.settleArrival(); g.advance(0.1); } if (g.cine && g.cine.active) g.cine.skip(); }); // (the walk's opening shot of the Scramble, skipped: the chase view)
  // from Hachiko's side towards the crossing at dusk, the chase view behind (tools/foot_cam.js's f1-start)
  await p.evaluate(() => {
    const g = window.__game, pl = g.player, nav = g.nav;
    g.setClock(g.clock.y, g.clock.m, g.clock.d, 17 * 60 + 14); if (g.weather) g.weather.set('clear', { now: true });
    pl.x = 376.9; pl.y = -1013.1; const f = nav.floorAt(pl.x, pl.y, nav.terrain(pl.x, pl.y) + 1); pl.z = f ? f.z : nav.terrain(pl.x, pl.y);
    pl.h = Math.atan2(358.8 - pl.x, -985.5 - pl.y); pl.vz = 0; pl.ground = true; pl.mode = 'foot'; pl.speed = 0;
    Object.assign(g.cam, { mode: 'chase', yaw: pl.h, yawTo: null, pitchTo: null, distTo: 0, tilt: 0, snap: true, lastInput: -10 });
  });
  // the level and the crowd round the place, then four seconds' walk at 1.4 m/s, as the player walks it
  for (let k = 0; k < 4; k++) await p.evaluate(async () => { const g = window.__game; for (let i = 0; i < 15; i++) { g.player.speed = 0; g.frame(1 / 30); } });
  for (let k = 0; k < 8; k++) await p.evaluate(async () => {
    const g = window.__game, pl = g.player, nav = g.nav, dt = 1 / 30;
    for (let i = 0; i < 15; i++) {
      const dx = 358.8 - pl.x, dy = -985.5 - pl.y, d = Math.hypot(dx, dy);
      if (d > 1) { const s = 1.4 * dt / d, m = nav.slide(pl.x, pl.y, pl.z, dx * s, dy * s), wk = nav.walk(m.x, m.y, pl.z + 0.3, true); if (wk.ok) { pl.x = m.x; pl.y = m.y; pl.z = wk.z; } pl.h = Math.atan2(dx, dy); pl.speed = 1.4; }
      if (g.cine && g.cine.active) g.cine.skip();
      g.frame(dt);
    }
  });
  const shoot = async name => { await p.screenshot({ path: `${out}/${name}.png`, timeout: 180000 }); };
  const rows = [];
  for (const [sx, sy, D] of PLACES) {
    // one of the crowd put there, its head and shoulders on that point of the frame, facing the way the lens looks
    const at = await p.evaluate(([sx, sy, D]) => {
      const g = window.__game, c = g.camera, P = g.crowd.P, T = window.THREE, d = new T.Vector3(sx, sy, 0.5).unproject(c).sub(c.position).normalize(), f0 = new T.Vector3();
      c.getWorldDirection(f0);
      const cx = c.position.x, cy = -c.position.z, l = Math.hypot(f0.x, f0.z) || 1, fx = f0.x / l, fy = -f0.z / l;
      const x = cx + d.x * D, y = cy - d.z * D;
      let best = -1, bd = Infinity;
      for (let i = 0; i < Math.min(g.crowd.active, P.length); i++) { const q = P[i]; if (!q.pz || q.lead >= 0 || q.mates || q.ph === 'cross') continue; const e = Math.hypot(q.x - cx, q.y - cy); if (e < bd) { bd = e; best = i; } }
      if (best < 0) return null;
      const q = P[best], f = g.nav.floorAt(x, y, g.player.z + 1), z = f ? f.z : g.nav.terrain(x, y);
      // (one of a kerb's crowd, alone: stood waiting where it is put, its place q.T; a walker on a footway is put back on
      // its line by the next step)
      q.T = q.T || {}; q.T.x = x; q.T.y = y; q.ph = 'wait';
      Object.assign(q, { x, y, z, rx: null, ry: null, rz: null, h: Math.atan2(fx, fy), v: 0, vx: 0, vy: 0, av: 0.6, pause: 0 });
      window.__lensQ = best;
      return { i: best, x, y };
    }, [sx, sy, D]);
    if (!at) { console.log('no one of the crowd to put there'); continue; }
    // drawn there (two frames that hardly move the world), then the world held
    await p.evaluate(() => { const g = window.__game, q = g.crowd.P[window.__lensQ], x = q.x, y = q.y, z = q.z, h = q.h; for (let k = 0; k < 3; k++) { Object.assign(q, { x, y, z, h, rx: null }); g.frame(0.001); } g.hold(true); });
    const box = await p.evaluate(() => {
      const g = window.__game, q = g.crowd.P[window.__lensQ], c = g.camera, T = window.THREE, pts = [];
      for (const [a, b, zz] of [[0, 0, 0], [0, 0, 1.75], [0.3, 0, 1.0], [-0.3, 0, 1.0], [0, 0.3, 1.0], [0, -0.3, 1.0]]) pts.push(new T.Vector3(q.x + a, q.z + zz, -(q.y + b)).project(c));
      const xs = pts.map(v => (v.x + 1) / 2), ys = pts.map(v => (1 - v.y) / 2), cl = v => Math.max(0, Math.min(1, v));
      const x0 = cl(Math.min(...xs)), x1 = cl(Math.max(...xs)), y0 = cl(Math.min(...ys)), y1 = cl(Math.max(...ys));
      const f = new T.Vector3(); c.getWorldDirection(f);
      return { dist: +Math.hypot(q.x - c.position.x, q.z + 1 - c.position.y, -q.y - c.position.z).toFixed(2), area: +((x1 - x0) * (y1 - y0)).toFixed(3), person: !!(g.crowdDraw() && g.crowdDraw().active.has(window.__lensQ)),
        view: `${g.cine && g.cine.active ? `shot ${g.cine.label}` : g.cam.mode}, ${(-Math.asin(f.y)).toFixed(2)} rad down, ${Math.hypot(c.position.x - g.player.x, -c.position.z - g.player.y).toFixed(1)} m back` };
    });
    const tag = `${D}m-at-${sx},${sy}`;
    const band = await p.evaluate(() => OEPeople.nearBand()); // (as the game set it for this view)
    await p.evaluate(() => OEPeople.setNear(-2, -1)); await shoot(`${tag}-off`);
    await p.evaluate(b => OEPeople.setNear(b[0], b[1]), band); await shoot(`${tag}-on`);
    await p.waitForTimeout(5000); await shoot(`${tag}-on-5s`);
    await p.evaluate(() => window.__game.hold(false));
    rows.push({ place: tag, band, ...box });
    console.log(`${tag}: ${box.dist} m from the lens (dissolved from ${band[1].toFixed(1)} to ${band[0].toFixed(1)} m), ${box.person ? 'a person' : 'a far figure'}, ${(box.area * 100).toFixed(0)}% of the frame's box; the view: ${box.view}`);
  }
  fs.writeFileSync(`${out}/lens_near.json`, JSON.stringify({ size, rows, errors }, null, 1));
  console.log(errors.length ? `FAIL ${errors.length} page errors` : 'ok   no page errors');
  await b.close();
  process.exit(errors.length ? 1 : 0);
})();
