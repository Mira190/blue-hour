// Frame 7's kerb as a long play leaves it, then the rain (issue 187). The story's checks found the waiting crowd's
// canopies inside each other twenty seconds into frame 7's rain after a play from the title, and none when frame 7 was
// played alone: who stands where at the kerb is what a long wait leaves. This plays the walk at frame 7's kerb (17:53,
// the lens where the story's is at her kerb, 3 to 12 m from where its check found the canopies crossed) DRY seconds of the game without rain, as a play from the
// title fills the kerb, then brings the rain on as the story does (a sky that lowers, weather pace 0.5), and after
// twenty seconds measures every umbrella within 14 m of the lens as tools/story_play.js does in frame 7
// (umbrella_held.js measure: held, loose). RUNS plays it that many times over, each with the crowd's dice rolled
// afresh, and prints how many rims were inside another canopy in each, and the worst; it fails (exit 1) on any run
// the story's check would fail.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/umbrella_kerb.js [WxH, default 390x844]   (DRY=180 RUNS=3 CROWD=1600 TIER=low PORT=8800)
const { measure } = require('./umbrella_held');
(async () => {
  const { chromium } = require('playwright');
  const { startPlay } = require('./start_play');
  const [,, size = '390x844'] = process.argv;
  const [w, h] = size.split('x').map(Number), phone = w < 500, DRY = +(process.env.DRY || 180), RUNS = +(process.env.RUNS || 3);
  const b = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  let fail = 0;
  for (let run = 0; run < RUNS; run++) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
    await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } }, process.env.TIER || (phone ? 'low' : 'high'));
    const errors = [];
    p.on('pageerror', e => { errors.push(String(e)); console.log(`pageerror: ${String(e).slice(0, 300)}`); });
    await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1&overture=0#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 600000 });
    await startPlay(p, { asIs: true });
    await p.evaluate(async crowd => {
      const g = window.__game, pl = g.player, nav = g.nav, at = [356.0, -985.3], to = [350.0, -983.5];
      for (let i = 0; i < 200 && g.arriving && g.arriving(); i++) { g.settleArrival(); g.advance(0.1); }
      if (g.cine && g.cine.active) g.cine.skip();
      await new Promise(ok => { const t0 = Date.now(); const f = () => (!g.hero || g.hero().levels.every(q => q.state !== 'loading') || Date.now() - t0 > 300000 ? ok() : setTimeout(f, 1000)); f(); });
      g.setClock(g.clock.y, 11, 21, 17 * 60 + 53); g.clock.scale = 1;
      // (the crowd as the story's frame 7 has it, some 1600 of the map's people about, not what a software renderer's governor leaves)
      if (g.crowdAuto) g.crowdAuto(false); g.crowd.active = Math.min(g.crowd.P.length, crowd);
      if (g.weather) g.weather.set('clear', { now: true });
      pl.x = at[0]; pl.y = at[1]; const f = nav.floorAt(pl.x, pl.y, nav.terrain(pl.x, pl.y) + 1); pl.z = f ? f.z : nav.terrain(pl.x, pl.y);
      pl.h = Math.atan2(to[0] - pl.x, to[1] - pl.y); pl.vz = 0; pl.ground = true; pl.mode = 'foot'; pl.speed = 0;
      Object.assign(g.cam, { mode: 'chase', yaw: pl.h, yawTo: null, pitchTo: null, distTo: 0, tilt: 0, snap: true, lastInput: -10, dist: 5.5, pitch: 0.17 });
    }, +(process.env.CROWD || 1600));
    const play = s => p.evaluate(n => { const g = window.__game; for (let i = 0; i < n; i++) { g.player.speed = 0; if (g.cine && g.cine.active) g.cine.skip(); g.advance(1); } }, Math.round(s)); // (a second at a time: advance ticks the weather, which a harness's held frames do not)
    for (let t = 0; t < DRY; t += 10) await play(10);
    // PACK=k: the waiting at each kerb near the lens drawn together about their middle by k (0.8: a pace of 0.9 m made
    // 0.72), as the press of a long play leaves them, nearer than an umbrella's room before anyone has one up
    const pack = () => p.evaluate(k => {
      const g = window.__game, c = g.camera.position, P = g.crowd.P, by = new Map();
      for (let i = 0; i < g.crowd.active; i++) { const q = P[i]; if (q.ph !== 'wait' || !q.g || !q.T || Math.hypot(q.x - c.x, q.y + c.z) > 16) continue; if (!by.has(q.g)) by.set(q.g, []); by.get(q.g).push(q); }
      let n = 0;
      const all = [...by.values()].reduce((a, qs) => a + qs.length, 0);
      for (const qs of (all >= 20 ? by.values() : [])) {
        const mx = qs.reduce((a, q) => a + q.x, 0) / qs.length, my = qs.reduce((a, q) => a + q.y, 0) / qs.length;
        for (const q of qs) { q.x = mx + (q.x - mx) * k; q.y = my + (q.y - my) * k; q.T.x = q.x; q.T.y = q.y; n++; }
      }
      return `packed: ${n} waiting at ${by.size} kerbs drawn together by ${k}`;
    }, +process.env.PACK);
    // (PACK_WET=1: drawn together ten seconds into the rain instead, their umbrellas up, and given the ten seconds left)
    if (process.env.PACK && !process.env.PACK_WET) console.log(await pack());
    await p.evaluate(() => window.__game.weather.set('rain', { pace: 0.5 }));
    if (process.env.PACK && process.env.PACK_WET) {
      // (ten seconds in, then each second until a kerb near the lens has a crowd waiting at it, the lights against them)
      await play(10);
      for (let t = 0; t < 90; t++) { const m = await pack(); if (+m.split(' ')[1] >= 20) { console.log(`${m}, ${10 + t} s into the rain`); break; } await play(1); }
      await play(10);
    } else for (let t = 0; t < 20; t += 5) await play(5);
    const m = await measure(p, { label: `run ${run + 1}, ${DRY} s dry then twenty seconds into the rain`, held: true, loose: true, within: 14 });
    for (const l of m.lines) console.log(l);
    const rims = m.lines.filter(l => /^  (FAIL|\(brushing\)) a rim /.test(l)).length;
    console.log(`run ${run + 1}: ${m.n} umbrellas, ${rims} rims inside another canopy, ${m.bad.length} failing, ${errors.length} page errors`);
    if (m.bad.length || errors.length || !m.n) fail++;
    await p.close();
  }
  console.log(fail ? `FAIL ${fail} of ${RUNS} runs` : `ok   ${RUNS} runs, no canopy inside another past the check's loose limit`);
  await b.close();
  process.exit(fail ? 1 : 0);
})();
