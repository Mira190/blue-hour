// The story's guide led to frame 4's goal (SKY's lift, Yuna by it) with a player who does not follow his trail: they
// take their own line (the way on foot from where they stand, as a player reading the gold line or the signs would),
// at a run or a walk, and in one run they go ahead of him from the start. The owner's rule for waiting (issue 207):
//   - ahead of the player, he stops and looks back (wait);
//   - behind them (held at a planter, held by the crowd, the player on another line), nothing waits for him: he runs
//     to catch up and pass, or is found at their heels, and the player is never held by him;
//   - he never stands at an obstacle walking on the spot.
// Every game frame it reads: his commanded speed against what he went (a step asked for and not gone, STUCK_S running,
// is a fault, with where); his state 'wait' while the player is further along the way than he is (a fault); the
// player held by him (game.js stops a step into his flank where a wall jams him: their step shorter than asked while
// he is jammed, a fault). Stills behind the player where a fault is first seen and at the end. Exits 1 on any fault.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/guide_follow.js out_dir [WxH]      (RUNS=run,walk,ahead: only those)
const { chromium } = require('playwright');
const { logger: browserLog, watch: watchPage } = require('./browser_watch');
const fs = require('fs');
const [,, out = '/tmp/guide-follow', size = '1440x900'] = process.argv;
const STUCK_S = 1.5, STUCK_M = 0.3;
// the player's line: their own way to the goal (own), at RUN m/s; 'ahead' starts them 6 m along it, past him
// (from: where frame 3 leaves a player who plays on, at Hachiko among the round planters' rails, the owner's way, issue
// 207; else where the page puts a case opened again at frame 4, the kerb)
const HACHIKO = [374.79, -1046.45];
const RUNS = [
  { name: 'hachiko-run', speed: 6, start: 0, from: HACHIKO },
  { name: 'hachiko-walk', speed: 2.4, start: 0, from: HACHIKO },
  { name: 'kerb-run', speed: 6, start: 0 },
  { name: 'ahead', speed: 6, start: 8, from: HACHIKO },
  // (round each of Hachiko Square's two planters, rails 1.75 m out: a start every 45 degrees 3.2 m from the middle, and
  // the first 20 s of the lead only; game.json hero rounds)
  ...[[381.0, -1035.5], [383.6, -1049.2]].flatMap(([x, y], k) => [0, 1, 2, 3, 4, 5, 6, 7].map(i => ({ name: `planter${k + 1}-${i * 45}`, speed: 6, start: 0, from: [x + 3.2 * Math.cos(i * Math.PI / 4), y + 3.2 * Math.sin(i * Math.PI / 4)], until: 20 }))),
].filter(r => !process.env.RUNS || process.env.RUNS.split(',').some(k => r.name.startsWith(k)));
(async () => {
  const [w, h] = size.split('x').map(Number);
  const args = process.env.GPU === 'metal' ? ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-gpu']
    : ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args, logger: browserLog() });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 500, isMobile: w < 500 });
  watchPage(p);
  const errors = [];
  p.on('pageerror', e => { errors.push(String(e)); console.log('pageerror:', String(e).slice(0, 300)); });
  fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || (w < 500 ? 'low' : 'high'));
  const DRAW = +(process.env.DRAW ?? (process.env.GPU === 'metal' ? 0 : 20));
  if (DRAW > 1) await p.addInitScript(n => {
    const P = WebGL2RenderingContext.prototype, raf = window.requestAnimationFrame.bind(window), D = window.__draw = { all: false, on: true, frames: 0 };
    window.requestAnimationFrame = fn => raf(t => { D.on = D.all || D.frames++ % n === 0; fn(t); D.on = true; });
    for (const k of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements', 'blitFramebuffer']) { const f = P[k]; P[k] = function (...a) { if (D.on) return f.apply(this, a); }; }
  }, DRAW);
  const shoot = async path => {
    try {
      if (DRAW > 1) await p.evaluate(() => new Promise(r => { window.__draw.all = true; const t = setTimeout(r, 60000); requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(t); r(); })); }));
      await p.screenshot({ path, timeout: 180000 });
    } catch (e) { console.log('still missed:', path, String(e).split('\n')[0]); }
    finally { if (DRAW > 1) await p.evaluate(() => { window.__draw.all = false; }).catch(() => {}); }
  };
  // (as a case left at frame 4 and opened again: guide_way.js does the same)
  await p.addInitScript(() => { try { localStorage.setItem('bh-story-late', JSON.stringify({ fi: 3, left: 4, prints: [0, 1, 2].map(i => ({ src: null, stamp: `frame ${i + 1}`, cap: '' })) })); } catch (e) { /* storage blocked */ } });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?overture=0${process.env.QUERY || ''}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.evaluate(() => document.getElementById('gt-play').click());
  const t0 = Date.now();
  let live = null;
  while (Date.now() - t0 < 1200000) {
    const s = await p.evaluate(() => { const st = window.__game.story.state, d = document.getElementById('gd'), pl = window.__game.player; return { dlg: d && !d.hidden, dog: !!(st.dog && st.dog.ready), target: st.target, beat: st.beat, at: [pl.x, pl.y, pl.z], h: pl.h, ready: window.__game.ways.ready && (!window.__game.hero || !window.__game.hero() || window.__game.hero().levels.every(L => L.state === 'ready' || L.state === 'idle')) }; });
    if (!s.dog && s.target && s.ready && s.beat === 'meet') await p.evaluate(() => { const g = window.__game, st = g.story.state; if (st.dog) return; const d = g.makeGuide(st.ep.guide); if (d) { d.place(g.player.x + 1.2, g.player.y + 1.2, 0); d.met(); st.dog = d; } });
    if (s.dog && s.target && s.ready && s.beat === 'meet') { live = s; break; }
    if (s.dlg) await p.evaluate(() => document.getElementById('gd').click());
    await p.waitForTimeout(500);
  }
  if (!live) { console.log('FAIL: frame 4 never gave its lead'); await b.close(); process.exit(1); }
  console.log('frame 4:', JSON.stringify({ at: live.at.map(v => +v.toFixed(2)), target: live.target.map(v => +v.toFixed(2)) }));
  let fails = 0;
  for (const R of RUNS) {
    let r = null;
    const run = p.evaluate(({ R, live, STUCK_S, STUCK_M, TRACE }) => new Promise(done => {
      const g = window.__game, st = g.story.state, dog = st.dog, pl = g.player, nav = g.nav, ways = g.ways;
      // (the story kept off its own beat: Yuna's talk would begin as the player arrives, and the check ends there itself)
      st.beat = 'meet';
      pl.x = live.at[0]; pl.y = live.at[1]; pl.z = live.at[2]; pl.h = live.h; st.target = live.target;
      if (R.from) { const fl = nav.floorAt(R.from[0], R.from[1], nav.terrain(R.from[0], R.from[1]) + 1); pl.x = R.from[0]; pl.y = R.from[1]; if (fl) pl.z = fl.z; pl.h = Math.atan2(live.target[0] - pl.x, live.target[1] - pl.y); }
      const to = st.target;
      const f = dog.free(pl.x + 1.2 * Math.sin(pl.h + 0.6), pl.y + 1.2 * Math.cos(pl.h + 0.6), 2) || [pl.x + 1, pl.y];
      dog.place(f[0], f[1], 0); dog.met();
      // the player's own line: the way on foot from them to the goal
      const own = ways.walk({ x: pl.x, y: pl.y, z: pl.z }, { x: to[0], y: to[1], z: to[3] ?? to[2] });
      if (!own) return done({ error: 'no way for the player' });
      const P = own.pts;
      // (along the way: the point s m on, and how far is left from the nearest point of it to (x, y))
      const along = m => { let l = m; for (let i = 1; i < P.length; i++) { const L = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); if (L >= l) return [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * l / L, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * l / L, i]; l -= L; } return [P[P.length - 1][0], P[P.length - 1][1], P.length - 1]; };
      const left = (x, y) => { let best = Infinity, out = 0, rest = 0; for (let i = P.length - 1; i > 0; i--) { const a = P[i - 1], c = P[i], ux = c[0] - a[0], uy = c[1] - a[1], L = Math.hypot(ux, uy) || 1e-9, k = Math.max(0, Math.min(1, ((x - a[0]) * ux + (y - a[1]) * uy) / (L * L))), d = Math.hypot(a[0] + ux * k - x, a[1] + uy * k - y); if (d < best - 0.01) { best = d; out = rest + L * (1 - k); } rest += L; } return out; };
      if (R.start) { const q = along(R.start), fl = nav.floorAt(q[0], q[1], pl.z + 1); pl.x = q[0]; pl.y = q[1]; if (fl) pl.z = fl.z; }
      dog.lead([to[0], to[1]], 2.2);
      let s = R.start, was = performance.now(), t = 0;
      const hist = [], faults = [], seen = {}, trace = [];
      const fault = (kind, msg) => { if (seen[kind] && seen[kind] > 3) return; seen[kind] = (seen[kind] || 0) + 1; faults.push(`${kind} t=${t.toFixed(1)} ${msg}`); if (!window.__f207) window.__f207 = kind; };
      let waitT = 0, heldT = 0;
      const step = now => {
        const dt = Math.min(0.05, Math.max(0, (now - was) / 1000)); was = now; t += dt;
        // the player: along their own line at their speed (as a walker steps: nav.slide), never waiting for him
        const pl0 = [pl.x, pl.y];
        if (pl.mode === 'foot' && Math.hypot(to[0] - pl.x, to[1] - pl.y) > 2.5) {
          s += R.speed * dt; const q = along(s), dx = q[0] - pl.x, dy = q[1] - pl.y, d = Math.hypot(dx, dy);
          if (d > 1e-3) { const k = Math.min(1, R.speed * dt * 1.5 / d), m = nav.slide(pl.x, pl.y, pl.z, dx * k, dy * k), wk = nav.walk(m.x, m.y, pl.z + 0.3, true); if (wk.ok) { pl.x = m.x; pl.y = m.y; pl.z = wk.z; } pl.h = Math.atan2(dx, dy); if (g.cam) g.cam.yaw = pl.h; }
          pl.speed = R.speed;
          // (the page's own step does the rest: makeWay and the stop at his flank are game.js's, called from the walk;
          // here the same, so that a jammed guide stops this player as he would stop yours)
          if (dog.makeWay) dog.makeWay();
          if (dog.jammed && dog.spineNear) { const [cx, cy] = dog.spineNear(pl.x, pl.y), ex = pl.x - cx, ey = pl.y - cy, e = Math.hypot(ex, ey) || 1e-3; if (e < dog.clearance) { heldT += dt; if (heldT > 0.3) fault('held-by-him', `the player stopped at his flank at ${pl.x.toFixed(1)}, ${pl.y.toFixed(1)}`); pl.x = pl0[0]; pl.y = pl0[1]; s -= R.speed * dt; } else heldT = 0; } else heldT = 0;
        } else pl.speed = 0;
        hist.push([t, dog.x, dog.y, dog.speed]);
        while (hist.length && t - hist[0][0] > STUCK_S) hist.shift();
        const lp = left(pl.x, pl.y), ld = left(dog.x, dog.y), arrived = Math.hypot(to[0] - dog.x, to[1] - dog.y) < 3.5;
        // a step asked for and not gone, STUCK_S running
        if (!arrived && hist.length > 5 && t - hist[0][0] > STUCK_S * 0.9 && hist.every(q => q[3] > 0.5) && Math.hypot(dog.x - hist[0][1], dog.y - hist[0][2]) < STUCK_M) fault('stuck', `${dog.state} at ${dog.x.toFixed(2)}, ${dog.y.toFixed(2)}, ${dog.z.toFixed(2)} (player ${pl.x.toFixed(1)}, ${pl.y.toFixed(1)}; ${(lp - ld).toFixed(1)} m ${lp < ld ? 'ahead of' : 'behind'} him on the way)`);
        // waiting while the player is further along than he is
        if (dog.state === 'wait' && lp < ld - 1.5) { waitT += dt; if (waitT > 0.5) fault('waits-behind', `he waits at ${dog.x.toFixed(1)}, ${dog.y.toFixed(1)} with the player ${(ld - lp).toFixed(1)} m further along`); } else waitT = 0;
        if (Math.round(t * 4) !== Math.round((t - dt) * 4)) trace.push([+t.toFixed(2), dog.state, +dog.x.toFixed(2), +dog.y.toFixed(2), +dog.speed.toFixed(2), +pl.x.toFixed(1), +pl.y.toFixed(1), +(lp - ld).toFixed(1)]);
        if (dog.state === 'sit' || t > (R.until || 150)) return done({ t: +t.toFixed(1), state: dog.state, at: [+dog.x.toFixed(2), +dog.y.toFixed(2)], left: +Math.hypot(dog.x - to[0], dog.y - to[1]).toFixed(2), player: [+pl.x.toFixed(1), +pl.y.toFixed(1)], faults, trace: faults.length || TRACE ? trace : [] });
        requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }), { R, live, STUCK_S, STUCK_M, TRACE: !!process.env.TRACE }).then(v => { r = v; }, e => { r = { error: String(e).slice(0, 300) }; });
    let shot = false;
    while (!r) {
      await p.waitForTimeout(500);
      if (!shot && await p.evaluate(() => !!window.__f207).catch(() => false)) { shot = true; await shoot(`${out}/${R.name}-fault.png`); }
    }
    await run;
    await p.evaluate(() => { window.__f207 = null; });
    const ok = !r.error && !r.faults.length && (r.state === 'sit' || R.until || (r.state === 'heel' && r.left < 5)); // (heel: the story's own beat came, Yuna's talk, as the player arrived)
    if (!ok) fails++;
    const { trace, ...head } = r;
    console.log(ok ? 'ok  ' : 'FAIL', R.name, JSON.stringify(head));
    if (trace && trace.length) fs.writeFileSync(`${out}/${R.name}-trace.json`, JSON.stringify(trace));
    await shoot(`${out}/${R.name}-end.png`);
  }
  console.log(`page errors: ${errors.length}`);
  await b.close();
  process.exit(fails || errors.length ? 1 : 0);
})();
