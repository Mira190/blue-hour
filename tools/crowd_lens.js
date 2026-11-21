// The near crowd and the lens on foot (issue 82): you stand on a footway by the Scramble with the chase camera behind
// you, and walkers are sent along that footway from behind the camera, past it and past you, with the rest of the crowd
// going about its business. Each frame of the game (the camera's own easing and lifts running) it measures, for the
// crowd's people within 2.5 m of the lens, how much of the frame the nearest covers (a body 0.5 m wide and 1.7 m tall,
// projected), and how close any of them came to the lens. Someone walking a pace beside the lens filled a corner of a
// phone's upright frame: here the most any one covers, and the frames where one covers more than 6% of it.
// A still is taken (the frame held) into out_dir the moment the first of them is level with the lens. The share is counted as
// drawn: one within 2.6 m of the lens dissolves (people.js rig.fade; FADE=0 counts them whole, as main draws them).
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/crowd_lens.js out_dir [WxH, default 390x844] [seconds per case, default 14]
// Fails (exit 1) when one of the crowd covers more than 6% of the frame in more than MAXF frames (default 3).
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const fs = require('fs');
const [,, out = '/tmp/crowd-lens', size = '390x844', secs = '14'] = process.argv;
const MAXF = +(process.env.MAXF || 3);
// [name, where you stand, the way you face along the footway]
const CASES = [
  ['hachiko-footway', 393, -988],
  ['station-footway', 418, -1029],
];
(async () => {
  const [w, h] = size.split('x').map(Number), phone = w < 500;
  const b = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
  await p.addInitScript(t => { try { localStorage.setItem('oe3d-quality', t); localStorage.setItem('oe3d-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  const errors = [];
  p.on('pageerror', e => { errors.push(String(e)); console.log(`pageerror: ${String(e).slice(0, 300)}`); });
  p.on('console', m => { if (m.type() === 'error' || /shader|program/i.test(m.text()) && /error|fail/i.test(m.text())) { errors.push(m.text()); console.log(`${m.type()}: ${m.text().slice(0, 300)}`); } }); // (a shader that does not compile: issue 82's fade is in every person's)
  fs.mkdirSync(out, { recursive: true });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1&overture=0${process.env.QUERY || ''}#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 600000 });
  await startPlay(p, { asIs: true });
  await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 200 && g.arriving && g.arriving(); i++) { g.settleArrival(); g.advance(0.1); } });
  let fail = 0;
  for (const [name, x, y] of CASES) {
    const r = await p.evaluate(async ([x, y, secs, FADES]) => {
      await new Promise(ok => { const g = window.__game, t0 = Date.now(); const f = () => (!g.hero || g.hero().levels.every(q => q.state !== 'loading') || Date.now() - t0 > 300000 ? ok() : setTimeout(f, 1000)); f(); });
      const g = window.__game, pl = g.player, C = g.crowd, net = g.crowdNet, T = window.THREE, cam = g.camera, v3 = new T.Vector3();
      g.setClock(g.clock.y, 10, 10, 17 * 60 + 41); g.clock.scale = 1; if (g.crowdAuto) g.crowdAuto(true);
      // the footway line nearest, and you on it facing along it
      const tmp = {};
      let best = null;
      for (let i = 0; i < net.L.length; i++) { const l = net.L[i]; if (l.len < 18) continue; for (let s = 11; s <= l.len - 6; s += 1) { net.at(i, s, tmp); const d = Math.hypot(tmp.x - x, tmp.y - y); if (d < 6 && (!best || d < best.d)) best = { d, line: i, s }; } }
      if (!best) return { err: 'no footway there' };
      net.at(best.line, best.s, tmp);
      pl.x = tmp.x; pl.y = tmp.y; pl.z = tmp.z; pl.h = Math.atan2(tmp.hx, tmp.hy); pl.speed = 0; pl.vz = 0; pl.ground = true; pl.mode = 'foot';
      Object.assign(g.cam, { mode: 'chase', yaw: pl.h, yawTo: null, pitchTo: null, distTo: 0, tilt: 0, snap: true, lastInput: -10, dist: 5.5, pitch: 0.17 }); // (the chase camera on foot, as tools/foot_cam.js leaves it)
      for (let i = 0; i < 60; i++) g.frame(1 / 30);
      // walkers sent along the footway from 10 to 16 m behind you (behind the lens), towards you and past
      const send = [];
      for (let i = 0; i < C.active && send.length < 8; i++) { const q = C.P[i]; if (q.state === 'walk' && !q.pz && q.lead < 0 && !q.mates && !q.seat && Math.hypot(q.x - pl.x, q.y - pl.y) > 60) send.push(q); }
      send.forEach((q, k) => {
        q.line = best.line; q.s = Math.max(0.5, best.s - 10 - k * 0.9); q.dir = 1; q.lat = null; q.side = [-0.9, 0.6, -0.3, 1.1, 0.2, -1.1, 0.9, -0.6][k];
        q.pause = 0; q.stop = null; q.stopFace = null; q.kerbNext = null; q.kerbBack = false; q.detourT = 0; q.still = q.slow = q.wait = q.stuckT = 0; q.mgT = 0; q.mgx = null;
        q.fx = q.gx = q.av = null; q.rx = null; q.v = q.speed; q.browse = 999; q.rest = 999;
      });
      const cover = () => {
        let worst = 0, near = Infinity;
        const cx = cam.position.x, cy = -cam.position.z;
        for (let j = 0; j < C.active; j++) {
          const q = C.P[j]; if (q.line < 0 && !q.pz) continue;
          const qx = q.rx ?? q.x, qy = q.ry ?? q.y, qz = q.rz ?? q.z, d = Math.hypot(qx - cx, qy - cy);
          if (d < near) near = d;
          if (d > 2.5 || d < 0.55) continue; // (further off, beside the player, they are the street the frame is of) // (within 0.55 m the lens is inside them and they are not drawn: game.js lensClear)
          let x0 = 1, x1 = -1, y0 = 1, y1 = -1, ok = false;
          for (const [a, c, hh] of [[-0.25, 0, 0], [0.25, 0, 0], [-0.25, 0, 1.7], [0.25, 0, 1.7], [0, -0.25, 0.9], [0, 0.25, 0.9]]) {
            v3.set(qx + a, qz + hh, -(qy + c)).applyMatrix4(cam.matrixWorldInverse);
            if (v3.z > -0.05) continue;
            v3.applyMatrix4(cam.projectionMatrix); ok = true;
            x0 = Math.min(x0, v3.x); x1 = Math.max(x1, v3.x); y0 = Math.min(y0, v3.y); y1 = Math.max(y1, v3.y);
          }
          if (!ok) continue;
          worst = Math.max(worst, Math.max(0, Math.min(1, x1) - Math.max(-1, x0)) * Math.max(0, Math.min(1, y1) - Math.max(-1, y0)) / 4 * (FADES ? Math.max(0, Math.min(1, (d - 0.8) / 1.8)) : 1)); // (as drawn: dissolved within 2.6 m of the lens, people.js rig.fade)
        }
        return { worst, near };
      };
      // (run until the first of them is level with the lens, for the still; then on to the end, measuring throughout)
      const st = window.__lens = { max: 0, frames: 0, nearest: Infinity, i: 0, n: secs * 30 };
      window.__lensStep = async level => {
        for (; st.i < st.n; st.i++) {
          pl.speed = 0;
          g.frame(1 / 30); cam.updateMatrixWorld();
          const c = cover();
          st.max = Math.max(st.max, c.worst); if (c.worst > 0.06) st.frames++; st.nearest = Math.min(st.nearest, c.near);
          if (st.i % 15 === 14) await new Promise(r => setTimeout(r, 0));
          if (level) { const q = send[0], fx = Math.sin(pl.h), fy = Math.cos(pl.h), a = (q.x - cam.position.x) * fx + (q.y + cam.position.z) * fy; if (a > 0.3) { st.i++; return true; } }
        }
        return false;
      };
      await window.__lensStep(true);
      return { line: best.line, lensUp: +(cam.position.y - pl.z).toFixed(2), back: +Math.hypot(cam.position.x - pl.x, -cam.position.z - pl.y).toFixed(2) };
    }, [x, y, +secs, process.env.FADE !== '0']);
    if (r.err) { console.log(`[${name}] ${r.err}`); continue; }
    // a still the moment the first of them is level with the lens (the frame held), then the rest of the measure
    await p.evaluate(() => window.__game.hold(true));
    await p.screenshot({ path: `${out}/${name}.png`, timeout: 180000 });
    await p.evaluate(() => window.__game.hold(false));
    Object.assign(r, await p.evaluate(async () => { await window.__lensStep(false); const st = window.__lens; return { max: +st.max.toFixed(3), frames: st.frames, nearest: +st.nearest.toFixed(2) }; }));
    const bad = r.frames > MAXF;
    if (bad) fail++;
    console.log(`[${name}] line ${r.line}, the lens ${r.back} m back and ${r.lensUp} m up: nearest of the crowd to the lens ${r.nearest} m; the most of the frame one covered ${(r.max * 100).toFixed(1)}%, frames over 6% ${r.frames}  ${bad ? 'IN THE LENS' : 'ok'}`);
  }
  await b.close();
  if (errors.length) { console.log(`FAIL: ${errors.length} page errors`); process.exit(1); }
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
