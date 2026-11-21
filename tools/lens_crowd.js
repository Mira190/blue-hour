// The lens in a held crowd in the rain (issue 129). The owner's still, 17:41 in the rain at Center Gai's mouth: the three
// people nearest the chase camera were drawn through a screen of dots (the dissolve issue 82 gave whoever came near the
// lens), the street seen through their bodies and through a clear umbrella. Either a person is in the picture, whole,
// or out of it. Here you stand in the rain with the chase camera behind you, among a kerb's crowd, at each of two
// places (the corner at Center Gai's mouth, 17:41; the kerb of the story's seventh frame, 17:53); three of those
// waiting are put at 2.2, 2.6 and 3.1 m from the lens in its frame, and walkers are sent along past it; then five
// seconds of the game are played, a still each half second (t00 to t10).
// For each still it prints who of the crowd is within 3.5 m of the lens (from it to their middle): how far, and
// whether they are drawn. Fails (exit 1) on a page error, and, where the page says how it treats the lens's near
// space (game.lensNear), when someone nearer than its inner edge is drawn or someone beyond its outer edge and in
// the frame is not: nobody half in. The stills are for the eye: no dots, no one see-through but the vinyl.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/lens_crowd.js out_dir [WxH, default 1440x900]     (ONLY=center-gai | f7-kerb; TIER; PORT)
// The same file runs against a page from before the change (PORT of a server of that tree), for the stills beside.
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const fs = require('fs');
const [,, out = '/tmp/lens-crowd', size = '1440x900'] = process.argv;
// [name, minutes of the day, where you stand, what you face]
const CASES = [
  ['center-gai', 17 * 60 + 41, [357.6, -985.6], [345.6, -980.4]],
  ['f7-kerb', 17 * 60 + 53, [377.0, -1013.2], [359.4, -983.0]],
].filter(c => !process.env.ONLY || process.env.ONLY.split(',').includes(c[0]));
(async () => {
  const [w, h] = size.split('x').map(Number), phone = w < 500;
  const b = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  const errors = [];
  p.on('pageerror', e => { errors.push(String(e)); console.log(`pageerror: ${String(e).slice(0, 300)}`); });
  p.on('console', m => { if (/shader|program/i.test(m.text()) && /error|fail/i.test(m.text())) { errors.push(m.text()); console.log(`${m.type()}: ${m.text().slice(0, 300)}`); } }); // (a shader that does not compile: the vinyl's)
  fs.mkdirSync(out, { recursive: true });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1&overture=0#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 600000 });
  await startPlay(p, { asIs: true });
  await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 200 && g.arriving && g.arriving(); i++) { g.settleArrival(); g.advance(0.1); } if (g.cine && g.cine.active) g.cine.skip(); });
  const rows = [];
  let fail = 0;
  for (const [name, min, at, to] of CASES) {
    await p.evaluate(async ([min, at, to]) => {
      const g = window.__game, pl = g.player, nav = g.nav;
      await new Promise(ok => { const t0 = Date.now(); const f = () => (!g.hero || g.hero().levels.every(q => q.state !== 'loading') || Date.now() - t0 > 300000 ? ok() : setTimeout(f, 1000)); f(); });
      g.setClock(g.clock.y, 11, 21, min); g.clock.scale = 1; if (g.crowdAuto) g.crowdAuto(true);
      if (g.weather) g.weather.set('rain', { now: true });
      pl.x = at[0]; pl.y = at[1]; const f = nav.floorAt(pl.x, pl.y, nav.terrain(pl.x, pl.y) + 1); pl.z = f ? f.z : nav.terrain(pl.x, pl.y);
      pl.h = Math.atan2(to[0] - pl.x, to[1] - pl.y); pl.vz = 0; pl.ground = true; pl.mode = 'foot'; pl.speed = 0;
      Object.assign(g.cam, { mode: 'chase', yaw: pl.h, yawTo: null, pitchTo: null, distTo: 0, tilt: 0, snap: true, lastInput: -10, dist: 5.5, pitch: 0.17 }); // (the chase camera on foot, as tools/foot_cam.js leaves it)
    }, [min, at, to]);
    // the crowd round the place, and the rain on it: twelve seconds of the game
    for (let k = 0; k < 12; k++) await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 30; i++) { g.player.speed = 0; if (g.cine && g.cine.active) g.cine.skip(); g.frame(1 / 30); } });
    // three of those waiting put near the lens, in its frame; and walkers sent along past it from behind
    const put = await p.evaluate(() => {
      const g = window.__game, c = g.camera, C = g.crowd, P = C.P, T = window.THREE, f0 = new T.Vector3(), pl = g.player;
      c.getWorldDirection(f0);
      const cx = c.position.x, cy = -c.position.z, cz = c.position.y, l = Math.hypot(f0.x, f0.z) || 1, fx = f0.x / l, fy = -f0.z / l;
      const used = new Set(), res = [];
      for (const [sx, sy, D] of [[0.5, -0.45, 2.2], [-0.5, -0.4, 2.6], [0.28, -0.3, 3.1]]) {
        const d = new T.Vector3(sx, sy, 0.5).unproject(c).sub(c.position).normalize();
        // (D from the lens to their middle, a metre over the ground: along the ray to the ground, then that far out)
        const gz = pl.z + 1, hr = Math.sqrt(Math.max(0.01, D * D - (cz - gz) * (cz - gz))), dl = Math.hypot(d.x, d.z) || 1;
        const x = cx + d.x / dl * hr, y = cy - d.z / dl * hr;
        let best = -1, bd = Infinity;
        for (let i = 0; i < Math.min(C.active, P.length); i++) { const q = P[i]; if (used.has(i) || !q.pz || q.lead >= 0 || q.mates || q.ph === 'cross') continue; const e = Math.hypot(q.x - cx, q.y - cy); if (e < bd) { bd = e; best = i; } }
        if (best < 0) continue;
        used.add(best);
        const q = P[best], fl = g.nav.floorAt(x, y, pl.z + 1), z = fl ? fl.z : g.nav.terrain(x, y);
        q.T = q.T || {}; q.T.x = x; q.T.y = y; q.ph = 'wait';
        Object.assign(q, { x, y, z, rx: null, ry: null, rz: null, h: Math.atan2(fx, fy), v: 0, vx: 0, vy: 0, av: 0.6, pause: 0 });
        res.push({ i: best, D, umbrella: q.look && q.look.umbrella });
      }
      window.__lensPut = res.map(r => r.i);
      return res;
    });
    console.log(`${name} ${size}: ${put.length} of the kerb's crowd put at ${put.map(r => `${r.D} m (${r.umbrella} umbrella)`).join(', ')} from the lens`);
    for (let t = 0; t <= 10; t++) {
      if (t) await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 15; i++) { g.player.speed = 0; g.frame(1 / 30); } });
      const m = await p.evaluate(() => {
        const g = window.__game, c = g.camera, C = g.crowd, P = C.P, T = window.THREE, R = g.crowdDraw(), v = new T.Vector3();
        const cx = c.position.x, cy = -c.position.z, cz = c.position.y, near = [];
        const LN = g.lensNear ? g.lensNear() : null;
        for (let i = 0; i < Math.min(C.active, P.length); i++) {
          const q = P[i]; if (!(q.line >= 0 || q.pz)) continue;
          const x = q.rx ?? q.x, y = q.ry ?? q.y, z = q.rz ?? q.z ?? 0, d = Math.hypot(x - cx, y - cy, z + 1 - cz);
          if (d > 3.5) continue;
          v.set(x, z + 1.2, -y).project(c);
          near.push({ i, d: +d.toFixed(2), drawn: !!R.shows(i), inFrame: v.z < 1 && Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95, put: window.__lensPut.includes(i) });
        }
        near.sort((a, b) => a.d - b.d);
        const U = R.umbrellas || {};
        return { near, LN, umb: Object.values(U).reduce((s, m) => s + (m && m.visible ? m.count : 0), 0) };
      });
      await p.screenshot({ path: `${out}/${name}-${size}-t${String(t).padStart(2, '0')}.png`, timeout: 180000 });
      const bad = [];
      if (m.LN && m.LN.out > 0) for (const q of m.near) {
        if (q.d < m.LN.in - 0.05 && q.drawn) bad.push(`#${q.i} drawn ${q.d} m from the lens, inside ${m.LN.in.toFixed(2)}`);
        if (q.d > m.LN.out + 0.05 && q.inFrame && !q.drawn) bad.push(`#${q.i} not drawn ${q.d} m from the lens, beyond ${m.LN.out.toFixed(2)}`);
      }
      fail += bad.length;
      rows.push({ name, size, t: t / 2, ...m, bad });
      console.log(`  ${(t / 2).toFixed(1)} s: within 3.5 m of the lens ${m.near.map(q => `${q.d}${q.drawn ? '' : ' out'}${q.put ? '*' : ''}`).join(', ') || 'nobody'}${m.LN ? `; out within ${m.LN.in.toFixed(2)}, back at ${m.LN.out.toFixed(2)}` : '; (a page from before: the dissolve)'}; ${m.umb} far umbrellas${bad.length ? `  FAIL ${bad.join('; ')}` : ''}`);
    }
  }
  fs.writeFileSync(`${out}/lens_crowd-${size}.json`, JSON.stringify({ size, rows, errors }, null, 1));
  console.log(errors.length || fail ? `FAIL ${errors.length} page errors, ${fail} half in` : 'ok   no page errors, nobody half in');
  await b.close();
  process.exit(errors.length || fail ? 1 : 0);
})();
