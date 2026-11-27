// Your car driven at a hero level's guard rail (the owner's still of 27 November 2026: the rail through the bonnet). Finds
// rails by the scramble with a street before them, sets the car down on the carriageway N m short of each, facing it,
// drives at it with W for a few seconds, and fails where any of the car's body ends in the rail or past it.
//   xvfb-run -a node tools/car_rail.js        N=7 (m short) K=6 (rails tried) R=110 (m round the start)
const { chromium } = require('playwright');
const N = +(process.env.N || 7), K = +(process.env.K || 6), R = +(process.env.R || 110);
(async () => {
  const b = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await (await b.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 })).newPage();
  const errors = [];
  p.on('pageerror', e => { errors.push(String(e).slice(0, 300)); console.log('pageerror', errors[errors.length - 1]); });
  await p.addInitScript(() => { try { localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); sessionStorage.setItem('bh-walk-auto', JSON.stringify({ t: 'blue', w: 'clear', film: false })); } catch (e) { /* storage blocked */ } });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const s = document.getElementById('game-stage'); return s && s.classList.contains('walk-on'); }, null, { timeout: 900000, polling: 500 });
  await p.waitForFunction(() => window.__game.myCar && window.__game.myCar(), null, { timeout: 300000, polling: 500 });
  const out = await p.evaluate(([N, K, R]) => {
    const g = window.__game, nav = g.nav, [cx, cy] = g.G.start.at, c = g.myCar(), st = c.D.st, C = c.C, s = g.KEEP === 'left' ? 1 : -1;
    if (!nav.fenceHit) return { err: 'no nav.fenceHit' };
    const zAt = (x, y) => { const f = nav.floorAt(x, y, nav.terrain(x, y) + 1.5); return f ? f.z : nav.terrain(x, y); };
    const railAt = (x, y, z) => nav.fenceHit(x, y, 0.1, z + 0.3, z + 1.4);
    // rails with a carriageway N m before them, straight and clear of walls and other rails on the way
    const tries = [];
    for (let x = cx - R; x <= cx + R && tries.length < K; x += 3) for (let y = cy - R; y <= cy + R && tries.length < K; y += 3) {
      const z = zAt(x, y);
      if (!railAt(x, y, z) || tries.some(t => Math.hypot(t.p[0] - x, t.p[1] - y) < 25)) continue;
      for (let k = 0; k < 16; k++) {
        const a = k / 16 * Math.PI * 2, dx = Math.sin(a), dy = Math.cos(a), qx = x - dx * N, qy = y - dy * N, qz = zAt(qx, qy);
        if (!nav.carriageway || nav.carriageway(qx, qy) === false || Math.abs(qz - z) > 0.4) continue;
        let ok = true;
        for (let u = 0; u < N - 1.2 && ok; u += 0.5) { const px = qx + dx * u, py = qy + dy * u; for (const w of [-1, 0, 1]) if (railAt(px - dy * w, py + dx * w, qz) || nav.solid(px - dy * w, py + dx * w, qz, 0.3)) ok = false; }
        if (ok) { tries.push({ p: [x, y, z], q: [qx, qy, qz], a }); break; }
      }
    }
    const rows = [];
    for (const t of tries) {
      if (g.player.mode === 'car') { st.speed = 0; st.v = 0; g.exitCar(); g.advance(1); }
      Object.assign(st, { x: t.q[0], y: t.q[1], z: t.q[2], h: t.a, vx: 0, vy: 0, v: 0, speed: 0, r: 0, vz: 0, steer: 0, air: false, pitch: 0, roll: 0 });
      C.place(st.x, st.y, st.z, st.h);
      g.player.x = st.x + Math.cos(st.h) * 2.6 * s; g.player.y = st.y - Math.sin(st.h) * 2.6 * s; g.player.z = st.z;
      g.advance(0.3); g.enterCar();
      for (let i = 0; i < 20 && g.player.mode !== 'car'; i++) g.advance(0.5);
      if (g.player.mode !== 'car') { rows.push({ t, err: 'not seated' }); continue; }
      Object.assign(st, { x: t.q[0], y: t.q[1], h: t.a, vx: 0, vy: 0, v: 0, speed: 0 }); C.place(st.x, st.y, st.z, st.h);
      for (let i = 0; i < 10; i++) g.advance(0.4, ['KeyW']);
      g.advance(0.5);
      const fx = Math.sin(st.h), fy = Math.cos(st.h), dx = Math.sin(t.a), dy = Math.cos(t.a);
      let inRail = 0;
      for (let u = -C.half + 0.1; u <= C.half - 0.1; u += 0.2) for (let v = -C.hw + 0.1; v <= C.hw - 0.1; v += 0.2) if (railAt(st.x + fx * u + fy * v, st.y + fy * u - fx * v, st.z)) inRail++;
      const past = (st.x - t.p[0]) * dx + (st.y - t.p[1]) * dy; // (the car's centre beyond the rail, along the way it was driven)
      rows.push({ rail: t.p.map(v => +v.toFixed(1)), car: [+st.x.toFixed(1), +st.y.toFixed(1)], past: +past.toFixed(2), half: C.half, inRail, kmh: +(st.speed * 3.6).toFixed(0) });
    }
    return { rows };
  }, [N, K, R]);
  let bad = 0;
  if (out.err) { console.log('FAIL', out.err); bad++; }
  for (const r of out.rows || []) {
    const f = r.err || r.inRail > 0;
    if (f) bad++;
    console.log(`${f ? 'FAIL' : 'ok  '} rail at ${r.rail}: car ends at ${r.car}, ${r.inRail} cells of its body in the rail${r.err ? ` (${r.err})` : ''}`);
  }
  console.log(`${(out.rows || []).length} rails driven at, ${bad} failing`);
  if (!(out.rows || []).length) { console.log('FAIL no rail with a street before it found'); bad++; }
  await b.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
