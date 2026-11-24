// Two of the crowd in one place (issue 187): walk1 beside another browser failed on two people stood 6 cm apart in a
// square by Hachiko, in the rain, each under an umbrella (a rim 0.53 m in the other's canopy). The crowd's own spacing
// (actors.js plazaStep) pushes two that close apart at more than a metre a second, so such a pair is either a moment
// (someone just put there) or something holds them. This counts it: the walk at the hour and weather asked, the player
// stood at a place, and every frame of the game's clock, every two of the crowd drawn within RANGE m of the lens whose
// middles are nearer than NEAR (0.25 m), each pair kept once with how many frames it lasted, how far apart it came, and
// what each was doing (its state, phase, whether stood, in a square, and, with the crowd's `why` on, the line that last
// sent it somewhere new).
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/crowd_pairs.js [seconds=180] [x,y]    (TIME=21:00 SKY=rain; TIER; PORT)
// Exits 1 when a pair lasted more than LAST frames (3): two people in each other a player can see.
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const [,, secs = '180', at = '381.6,-1040'] = process.argv;
const NEAR = +process.env.NEAR || 0.25, RANGE = +process.env.RANGE || 25, LAST = +process.env.LAST || 3;
(async () => {
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  p.on('pageerror', e => console.log(`pageerror: ${String(e).slice(0, 300)}`));
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1&overture=0#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 600000 });
  await startPlay(p, { asIs: true });
  await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 200 && g.arriving && g.arriving(); i++) { g.settleArrival(); g.advance(0.1); } if (g.cine && g.cine.active) g.cine.skip(); });
  const [hh, mm] = (process.env.TIME || '21:00').split(':').map(Number), [x, y] = at.split(',').map(Number);
  await p.evaluate(async ([min, x, y, sky]) => {
    const g = window.__game, pl = g.player, nav = g.nav;
    await new Promise(ok => { const t0 = Date.now(); const f = () => (!g.hero || g.hero().levels.every(q => q.state !== 'loading') || Date.now() - t0 > 300000 ? ok() : setTimeout(f, 1000)); f(); });
    g.setClock(g.clock.y, 11, 21, min); g.clock.scale = 1; if (g.crowdAuto) g.crowdAuto(true);
    if (g.weather && sky !== 'clear') g.weather.set(sky, { now: true });
    pl.x = x + 2.5; pl.y = y + 2.5; const f = nav.floorAt(pl.x, pl.y, nav.terrain(pl.x, pl.y) + 1); pl.z = f ? f.z : nav.terrain(pl.x, pl.y);
    pl.h = Math.atan2(x - pl.x, y - pl.y); pl.vz = 0; pl.ground = true; pl.mode = 'foot'; pl.speed = 0;
    Object.assign(g.cam, { mode: 'chase', yaw: pl.h, yawTo: null, pitchTo: null, distTo: 0, tilt: 0, snap: true, lastInput: -10, dist: 5.5, pitch: 0.17 });
    g.crowd.why = true; // (each walker keeps the line that last sent it somewhere new: actors.js respawn)
    window.__pairs = { seen: new Map(), frames: 0, drawn: 0 };
  }, [hh * 60 + mm, x, y, process.env.SKY || 'rain']);
  // a second of the game at a time, thirty frames, each one read; the page's own frames let run between
  const t0 = Date.now();
  for (let s = 0; s < +secs; s++) {
    await p.evaluate(([NEAR, RANGE]) => {
      const g = window.__game, Q = window.__pairs, R = g.crowdDraw(), P = g.crowd.P;
      for (let f = 0; f < 30; f++) {
        g.player.speed = 0; if (g.cine && g.cine.active) g.cine.skip();
        g.frame(1 / 30); Q.frames++;
        const rows = R.umbrellaReport(RANGE); Q.drawn = Math.max(Q.drawn, rows.length);
        const now = new Set();
        for (let a = 0; a < rows.length; a++) for (let c = a + 1; c < rows.length; c++) {
          const A = rows[a], B = rows[c], d = Math.hypot(A.x - B.x, A.y - B.y);
          if (d >= NEAR) continue;
          const pa = P[A.i], pb = P[B.i];
          if (Math.abs((pa.rz ?? pa.z ?? 0) - (pb.rz ?? pb.z ?? 0)) > 1.5) continue;
          const key = `${Math.min(A.i, B.i)}|${Math.max(A.i, B.i)}`; now.add(key);
          const who = (r, q) => ({ i: r.i, near: r.near, char: String(r.character || '').replace(/^R_/, ''), state: q.state, ph: q.ph || '', mode: q.mode || '', lst: !!q.lst, pz: !!q.pz, wait: r.wait, moving: r.moving, umb: !!r.umb, why: q.goneWhy ? String(q.goneWhy).replace(/^at /, '').replace(/\(http:\/\/[^)]*\/web\/|\(http:\/\/localhost:\d+\//, '(').slice(0, 90) : '' });
          let c0 = Q.seen.get(key);
          if (!c0) Q.seen.set(key, c0 = { key, f0: Q.frames, n: 0, run: 0, longest: 0, min: 9, at: [+A.x.toFixed(2), +A.y.toFixed(2)], a: who(A, pa), b: who(B, pb) });
          c0.n++; c0.run = c0.last === Q.frames - 1 ? c0.run + 1 : 1; c0.last = Q.frames; c0.longest = Math.max(c0.longest, c0.run);
          if (d < c0.min) { c0.min = +d.toFixed(3); c0.a = who(A, pa); c0.b = who(B, pb); }
        }
      }
    }, [NEAR, RANGE]);
    await p.evaluate(() => new Promise(r => requestAnimationFrame(() => r())));
  }
  const Q = await p.evaluate(() => { const Q = window.__pairs; return { frames: Q.frames, drawn: Q.drawn, pairs: [...Q.seen.values()].sort((a, b) => b.longest - a.longest) }; });
  const long = Q.pairs.filter(c => c.longest > LAST);
  console.log(`crowd_pairs: ${Q.frames} frames (${(Q.frames / 30).toFixed(0)} s of the game) in ${((Date.now() - t0) / 1000).toFixed(0)} s, up to ${Q.drawn} of the crowd drawn within ${RANGE} m; ${Q.pairs.length} pairs nearer than ${NEAR} m, ${long.length} of them for more than ${LAST} frames`);
  for (const c of Q.pairs.slice(0, 20)) console.log(`${c.longest > LAST ? 'FAIL' : 'note'} ${c.min} m apart at (${c.at}), ${c.n} frames, the longest run ${c.longest}, from frame ${c.f0}: ${JSON.stringify(c.a)} | ${JSON.stringify(c.b)}`);
  await b.close();
  process.exit(long.length ? 1 : 0);
})();
