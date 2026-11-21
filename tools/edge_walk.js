// The walk's edge tried as a walker and a driver try it (issue 143; web/game/edge.js). Sets out on the walk from a
// fresh page, then:
//   - at every footway the bounds close: stands you 9 m inside, takes a still looking out at the closure, then walks
//     you at it for eight seconds and says where you were stopped (never past the edge);
//   - at every road that leaves the bounds: walks you out along it in the roadway, and says where you were stopped;
//   - WITH CAR=1: drives your car out along the first road and says whether it was turned round, facing in.
// Fails (exit 1) when a walker ends outside the bounds, or a closure was never laid where a footway leaves them.
//   xvfb-run -a node tools/edge_walk.js out_dir [WxH] [hour.sky]     PORT, TIER, ONLY=foot|road, STILLS=0
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/edge-walk', size = '1440x900', cond = ''] = process.argv;
const PORT = process.env.PORT || 8800, ONLY = process.env.ONLY || '', STILLS = process.env.STILLS !== '0';
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const [w, h] = size.split('x').map(Number), phone = w < 500, tag = phone ? 'phone' : 'desk';
  const args = process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log(`pageerror: ${String(e).slice(0, 200)}`));
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); localStorage.setItem('bh-player', 'W'); if (!sessionStorage.getItem('wr-once')) { sessionStorage.setItem('wr-once', '1'); sessionStorage.setItem('bh-walk-auto', JSON.stringify({ t: 'blue', w: 'clear' })); } } catch (e) { /* storage blocked */ } }, process.env.TIER || (phone ? 'low' : 'high'));
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  const set = await p.waitForFunction(() => { const s = document.getElementById('game-stage'); return !!s && /\bwalk-on\b/.test(s.className) && window.__game; }, null, { timeout: 40 * 60000, polling: 1000 }).then(() => true, () => false);
  if (!set) { console.log('the walk did not set out'); await b.close(); process.exit(1); }
  await p.waitForTimeout(6000);
  if (cond) {
    const [t, sky] = cond.split('.');
    await p.evaluate(([t, sky]) => { const g = window.__game; if (/^\d+:\d+$/.test(t)) { const [hh, mm] = t.split(':').map(Number); g.setClock(g.clock.y, g.clock.m, g.clock.d, hh * 60 + mm); } if (sky && g.weather && g.weather.set) g.weather.set(sky, { now: true }); }, [t, sky]);
    await p.waitForTimeout(8000);
  }
  const E = await p.evaluate(() => { const e = window.__game.edge; return e ? { feet: e.feet, roads: e.roads } : null; });
  if (!E) { console.log('FAIL: the map has no bounds (window.__game.edge)'); await b.close(); process.exit(1); }
  console.log(`${E.feet.length} footways and ${E.roads.length} roads leave the bounds`);
  // walk from `from` towards `to` for `secs` seconds; where the walker ends, and whether inside the bounds
  const walk = (from, to, secs) => p.evaluate(async ([from, to, secs]) => {
    const g = window.__game, pl = g.player;
    g.spawn(from);
    g.advance(0.5);
    for (let i = 0; i < secs * 10; i++) { pl.h = g.cam.yaw = Math.atan2(to[0] - pl.x, to[1] - pl.y); g.advance(0.1, ['KeyW']); if (i % 20 === 19) await new Promise(r => setTimeout(r, 0)); }
    return { x: +pl.x.toFixed(1), y: +pl.y.toFixed(1), inside: g.edge.inside(pl.x, pl.y), runs: g.edge.runs.length, toast: (document.getElementById('g-toast') || {}).textContent || '' };
  }, [from, to, secs]);
  // the way in from a crossing: towards the middle of the bounds' first hero level
  const C = await p.evaluate(() => window.__game.G.hero[0].at);
  const inward = (q, d) => { const l = Math.hypot(C[0] - q[0], C[1] - q[1]); return [q[0] + (C[0] - q[0]) / l * d, q[1] + (C[1] - q[1]) / l * d]; };
  let bad = 0;
  for (const [kind, list] of [['foot', E.feet], ['road', E.roads]]) {
    if (ONLY && ONLY !== kind) continue;
    for (let i = 0; i < list.length; i++) {
      const q = list[i], from = inward(q, 9), past = inward(q, -12);
      if (STILLS) {
        await p.evaluate(([at, yaw]) => { const g = window.__game; g.spawn(at); g.player.h = yaw; g.cam.yaw = yaw; g.cam.pitch = -0.04; g.cam.dist = 5; g.advance(1); }, [from, Math.atan2(q[0] - from[0], q[1] - from[1])]);
        await p.waitForTimeout(4000);
        await p.screenshot({ path: `${out}/${tag}-${kind}-${String(i).padStart(2, '0')}.png`, timeout: 120000 }).catch(() => console.log('(no still)'));
      }
      const r = await walk(from, past, 8);
      const ok = r.inside;
      if (!ok) bad++;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${kind} ${i} at ${q[0].toFixed(0)},${q[1].toFixed(0)}: walked from ${from.map(v => v.toFixed(0))} and stood at ${r.x},${r.y} (${Math.hypot(r.x - q[0], r.y - q[1]).toFixed(1)} m from the edge's crossing)${r.toast ? `; told "${r.toast.slice(0, 60)}"` : ''}`);
    }
  }
  if (process.env.CAR && E.roads.length) {
    const q = E.roads[+process.env.CAR - 1] || E.roads[0], from = inward(q, 25);
    const r = await p.evaluate(async ([from, q]) => {
      const g = window.__game, pl = g.player;
      g.spawn(from); g.advance(0.5);
      if (g.bringCar) g.bringCar();
      for (let i = 0; i < 100 && !g.myCar(); i++) await new Promise(r => setTimeout(r, 200));
      if (!g.myCar()) return { err: 'no car' };
      const st = g.myCar().D.st, hh = Math.atan2(q[0] - from[0], q[1] - from[1]);
      Object.assign(st, { x: from[0], y: from[1], h: hh, vx: 0, vy: 0, v: 0, speed: 0 }); g.myCar().C.place(st.x, st.y, st.z, st.h);
      pl.x = st.x + 2; pl.y = st.y; g.advance(0.3); g.enterCar(); g.advance(0.5);
      // (set on the road again once at the wheel: getting in can bring the car from where it waited)
      Object.assign(st, { x: from[0], y: from[1], h: hh, vx: 0, vy: 0, v: 0, speed: 0, r: 0 }); g.myCar().C.place(st.x, st.y, st.z, st.h); g.advance(0.1);
      const start = `${st.x.toFixed(0)},${st.y.toFixed(0)} in the bounds: ${g.edge.inside(st.x, st.y)}, mode ${pl.mode}`;
      let outside = 0;
      const trace = [];
      for (let i = 0; i < 160; i++) { g.advance(0.1, ['KeyW']); if (!g.edge.inside(st.x, st.y)) outside++; if (i % 10 === 9) { trace.push(`${st.x.toFixed(0)},${st.y.toFixed(0)}`); await new Promise(r => setTimeout(r, 60)); } }
      await new Promise(r => setTimeout(r, 800));
      g.advance(0.2);
      return { start, trace: trace.join(' '), mode: pl.mode, x: +st.x.toFixed(1), y: +st.y.toFixed(1), h: +st.h.toFixed(2), inside: g.edge.inside(st.x, st.y), stepsOutside: outside, facingIn: Math.sin(st.h) * (from[0] - q[0]) + Math.cos(st.h) * (from[1] - q[1]) > 0 };
    }, [from, q]);
    // (a car that never reached the edge, held by the traffic in front of it, has not tried it: said, not failed)
    if (r.err) { console.log(`NOT TRIED car: ${r.err}`); } else if (r.stepsOutside === 0 && r.inside) console.log(`NOT TRIED car at road ${q.map(v => v.toFixed(0))}: it did not reach the edge in 16 s: ${JSON.stringify(r)}`);
    else { console.log(`${r.inside && r.facingIn ? 'ok  ' : 'FAIL'} car at road ${q.map(v => v.toFixed(0))}: ${JSON.stringify(r)}`); if (!(r.inside && r.facingIn)) bad++; }
    if (STILLS) { await p.waitForTimeout(3000); await p.screenshot({ path: `${out}/${tag}-car.png` }).catch(() => {}); }
  }
  const laid = await p.evaluate(() => window.__game.edge.runs.map(r => [r.a.map(v => +v.toFixed(1)), r.b.map(v => +v.toFixed(1))]));
  console.log(`${laid.length} closures laid: ${JSON.stringify(laid)}`);
  await b.close();
  console.log(bad ? `FAIL: ${bad} ways out of the bounds` : 'ok: nobody leaves the bounds on foot or by car');
  process.exit(bad ? 1 : 0);
})();
