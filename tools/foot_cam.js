// The chase camera on foot (issue 71), as a player sees it walking each frame's way at the hour the frame is set: the
// player is put at the way's start, walked along it for a few seconds of the game's own frames (the crowd and the
// traffic running, the camera's lifts and easing as they are), and two stills of the same moment are taken: the camera
// as the game leaves it ("now") and the old pose, 7.5 m back at 0.36 rad ("was"). For each it prints the camera's eye
// over the ground, its pitch and lift, and the share of the frame above the horizon. A dense kerb (Hachiko's, the crowd
// waiting for the scramble) is walked last, the camera behind the player into the crowd: how often a person stands
// across the line from the lens to the head over five seconds, and the lift it took.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/foot_cam.js out_dir [WxH]          (ONLY=f2,f7: only those; WAS=0: no "was" stills)
// Stills force the desktop tier (TIER=low to see a phone's). lensMax: the most of the frame one of the crowd within 2.5 m
// of the lens covered while walking, and lensFrames the frames where one covered more than 6% of it (issue 82).
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const fs = require('fs');
const [,, out = '/tmp/foot-cam', size = '1440x900'] = process.argv;
// each frame's walk: from where the player is when it is given, towards whom or where the story sends them
// (tools/guide_way.js LEADS, and the start's own view for the first frame), at its stamp; the last frame's rain
const WALKS = [
  { name: 'f1-start', time: '17:14', from: [376.9, -1013.1], to: [358.8, -985.5] },
  { name: 'f2-kerb-to-shun', time: '17:19', from: [362.3, -988.6], to: [342.1, -978.4] },
  { name: 'f3-centergai-to-hachiko', time: '17:24', from: [342.1, -978.4], to: [374.79, -1046.45] },
  { name: 'f4-hachiko-to-lift', time: '17:31', from: [374.79, -1046.45], to: [513.9, -1097.3] },
  { name: 'f6-lift-to-tanaka', time: '17:46', from: [521.87, -1074.06], to: [378.79, -1030.7] },
  { name: 'f7-hachiko-to-kerb', time: '17:53', weather: 'rain', from: [377.0, -1013.2], to: [359.4, -983.0] },
  { name: 'kerb-hachiko-wait', time: '17:31', from: [372.0, -1016.0], to: [362.0, -1000.0], kerb: true },
].filter(v => !process.env.ONLY || process.env.ONLY.split(',').some(k => v.name.startsWith(k)));
const WAS = { dist: 7.5, pitch: 0.36 };
(async () => {
  const [w, h] = size.split('x').map(Number), phone = w < 500;
  const b = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
  await p.addInitScript(t => { try { localStorage.setItem('oe3d-quality', t); localStorage.setItem('oe3d-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  const errors = [];
  p.on('pageerror', e => { errors.push(String(e)); console.log(`pageerror: ${String(e).slice(0, 300)}`); });
  fs.mkdirSync(out, { recursive: true });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1&overture=0#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 600000 });
  await startPlay(p, { asIs: true });
  await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 200 && g.arriving && g.arriving(); i++) { g.settleArrival(); g.advance(0.1); } });
  // the game's frames, n of them at dt each, the player walked along pts meanwhile (a step of 1.4 m/s a frame, turned to
  // the way); returns how many frames had someone across the line to the head, and the camera's highest lift
  const walk = (n, dt, still) => p.evaluate(async ([n, dt, still]) => {
    const g = window.__game, pl = g.player, nav = g.nav, P = window.__footWay || [];
    let across = 0, lift = 0, lensMax = 0, lensFrames = 0;
    // (issue 82: the most of the frame one of the crowd within 2.5 m of the lens covers, a body 0.5 m wide and 1.7 m tall
    // projected; and the frames where one covers more than 6% of it, a corner filled)
    const T = window.THREE, cam = g.camera, v3 = new T.Vector3(), C = g.crowd;
    const cover = () => {
      let worst = 0;
      const cx = cam.position.x, cy = -cam.position.z;
      for (let j = 0; j < C.active; j++) {
        const q = C.P[j]; if (q.line < 0 && !q.pz) continue;
        const x = q.rx ?? q.x, y = q.ry ?? q.y, z = q.rz ?? q.z, d = Math.hypot(x - cx, y - cy);
        if (d > 2.5 || d < 0.55) continue; // (within 0.55 m the lens is inside them: not drawn, game.js lensClear)
        let x0 = 1, x1 = -1, y0 = 1, y1 = -1, ok = false;
        for (const [a, b, h] of [[-0.25, 0, 0], [0.25, 0, 0], [-0.25, 0, 1.7], [0.25, 0, 1.7], [0, -0.25, 0.9], [0, 0.25, 0.9]]) {
          v3.set(x + a, z + h, -(y + b)).applyMatrix4(cam.matrixWorldInverse);
          if (v3.z > -0.05) continue; // (behind the lens)
          v3.applyMatrix4(cam.projectionMatrix); ok = true;
          x0 = Math.min(x0, v3.x); x1 = Math.max(x1, v3.x); y0 = Math.min(y0, v3.y); y1 = Math.max(y1, v3.y);
        }
        if (!ok) continue;
        const a = Math.max(0, Math.min(1, x1) - Math.max(-1, x0)) * Math.max(0, Math.min(1, y1) - Math.max(-1, y0)) / 4;
        worst = Math.max(worst, a);
      }
      return worst;
    };
    for (let i = 0; i < n; i++) {
      if (!still && P.length) {
        let k = window.__footK || 1;
        while (k < P.length - 1 && Math.hypot(P[k][0] - pl.x, P[k][1] - pl.y) < 0.8) k++;
        window.__footK = k;
        const dx = P[k][0] - pl.x, dy = P[k][1] - pl.y, d = Math.hypot(dx, dy);
        if (d > 0.3) { const s = Math.min(1.4 * dt, d) / d, m = nav.slide(pl.x, pl.y, pl.z, dx * s, dy * s), wk = nav.walk(m.x, m.y, pl.z + 0.3, true); if (wk.ok) { pl.x = m.x; pl.y = m.y; pl.z = wk.z; } pl.h = Math.atan2(dx, dy); pl.speed = 1.4; }
      } else pl.speed = 0;
      g.cam.trace = {};
      g.frame(dt);
      if (g.cam.trace.folk) across++;
      if (!still) { cam.updateMatrixWorld(); const c = cover(); lensMax = Math.max(lensMax, c); if (c > 0.06) lensFrames++; }
      lift = Math.max(lift, g.cam.lift);
      if (i % 10 === 9) await new Promise(r => setTimeout(r, 0));
    }
    return { across, lift: +lift.toFixed(2), lensMax: +lensMax.toFixed(3), lensFrames };
  }, [n, dt, still]);
  // the camera's eye over the ground, its pitch, and the share of the frame's height above the horizon
  const pose = () => p.evaluate(() => {
    const g = window.__game, c = g.camera, pl = g.player, d = new window.THREE.Vector3();
    c.getWorldDirection(d);
    const down = -Math.asin(d.y), half = c.fov / 2 * Math.PI / 180, above = 0.5 - Math.tan(down) / (2 * Math.tan(half));
    return { eye: +(c.position.y - Math.max(0, g.nav.terrain(c.position.x, -c.position.z))).toFixed(2), back: +Math.hypot(c.position.x - pl.x, -c.position.z - pl.y).toFixed(2), down: +down.toFixed(3), sky: +above.toFixed(2), lift: +g.cam.lift.toFixed(2) };
  });
  const shoot = async name => { await p.evaluate(() => window.__game.hold(true)); await p.screenshot({ path: `${out}/${name}.png`, timeout: 180000 }); await p.evaluate(() => window.__game.hold(false)); };
  const rows = [];
  for (const v of WALKS) {
    await p.evaluate(v => {
      const g = window.__game, pl = g.player, nav = g.nav, [hh, mm] = v.time.split(':').map(Number);
      g.setClock(g.clock.y, g.clock.m, g.clock.d, hh * 60 + mm); if (g.weather) g.weather.set(v.weather || 'clear', { now: true });
      pl.x = v.from[0]; pl.y = v.from[1]; const f = nav.floorAt(pl.x, pl.y, nav.terrain(pl.x, pl.y) + 1); pl.z = f ? f.z : nav.terrain(pl.x, pl.y);
      const way = g.ways.walk({ x: pl.x, y: pl.y, z: pl.z }, { x: v.to[0], y: v.to[1], z: pl.z });
      window.__footWay = way && !v.kerb ? way.pts : [[pl.x, pl.y], [v.to[0], v.to[1]]]; window.__footK = 1;
      const P = window.__footWay, q = P[Math.min(P.length - 1, 1)];
      pl.h = Math.atan2(q[0] - pl.x, q[1] - pl.y); pl.vz = 0; pl.ground = true; pl.mode = 'foot';
      Object.assign(g.cam, { mode: 'chase', yaw: pl.h, yawTo: null, pitchTo: null, distTo: 0, tilt: 0, snap: true, lastInput: -10 });
    }, v);
    // (the level and the crowd round the new place: a few seconds of the world, the player standing)
    await walk(40, 0.05, true);
    await p.evaluate(() => new Promise(ok => { const g = window.__game, t0 = Date.now(); const f = () => (!g.hero || g.hero().levels.every(q => q.state !== 'loading') || Date.now() - t0 > 300000 ? ok() : setTimeout(f, 1000)); f(); }));
    const r = await walk(v.kerb ? 100 : 80, 0.05, false); // (4 or 5 s of walking)
    const now = await pose();
    await shoot(`${v.name}-now`);
    const row = { name: v.name, time: v.time, now, across: r.across, maxLift: r.lift, lensMax: r.lensMax, lensFrames: r.lensFrames };
    if (process.env.WAS !== '0') {
      await p.evaluate(W => Object.assign(window.__game.cam, W, { pitchTo: null, distTo: 0 }), WAS);
      await walk(30, 0.05, true);
      row.was = await pose();
      await shoot(`${v.name}-was`);
      await p.evaluate(F => Object.assign(window.__game.cam, F), { dist: 5.5, pitch: 0.17 });
    }
    rows.push(row); console.log(JSON.stringify(row));
  }
  fs.writeFileSync(`${out}/foot_cam.json`, JSON.stringify(rows, null, 1));
  await b.close();
  if (errors.length) { console.log(`FAIL: ${errors.length} page errors`); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
