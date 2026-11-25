// Where the traffic round a place stands and why (issue 204): after a minute's settling at a kerb, a minute sampled
// once a second; for the cars within R (100 m) of the place, by the road piece they are on: how many on average, the
// share standing (under 0.5 m/s) and the reasons the standing ones give (c.why)
//   xvfb-run -a node tools/traffic_feed.js [x,y=362,-1012] [seconds=60]     (GAME_TIME=17:57 by default)
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const { pinClock } = require('./pin_clock');
const [,, AT = '362,-1012', SECS = '60'] = process.argv;
const [X, Y] = AT.split(',').map(Number);
if (!process.env.GAME_TIME) process.env.GAME_TIME = '17:57';
(async () => {
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await (await b.newContext({ viewport: { width: 1100, height: 650 } })).newPage();
  p.on('pageerror', e => console.log('pageerror', String(e).slice(0, 400)));
  await p.addInitScript(() => { try { localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); localStorage.setItem('bh-quality', 'high'); } catch (e) { /* storage blocked */ } });
  await pinClock(p, 'shibuya');
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.cars', null, { timeout: 400000 });
  await p.evaluate(async () => { const g = window.__game; g.hold(true, true); await g.ways.build(); if (g.lateReady) await g.lateReady(); });
  await startPlay(p, { asIs: true });
  const r = await p.evaluate(({ X, Y, secs }) => {
    const g = window.__game, cars = g.cars, L = cars.netL, R = +(new URLSearchParams(location.search).get('R') || 100);
    g.clock.scale = 1;
    for (let t = 0; g.arriving() && t < 10; t += 0.25) g.advance(0.25);
    g.hopTo(X, Y, g.player.z, 'the kerb');
    g.advance(60); g.frame(1 / 30);
    const by = {}, why = {}; let n = 0, stand = 0;
    for (let t = 0; t < secs; t++) {
      g.advance(1); g.frame(1 / 30);
      for (const c of cars.live) {
        if (c.line < 0 || Math.hypot(c.x - X, c.y - Y) > R) continue;
        const k = `${c.line} ${L[c.line].c}${L[c.line].name ? ' ' + L[c.line].name : ''}`;
        const o = by[k] || (by[k] = { n: 0, st: 0 });
        o.n++; n++;
        if (c.v < 0.5) { o.st++; stand++; const w = (c.why || '?').replace(/[0-9.]+/g, '#').slice(0, 50); why[w] = (why[w] || 0) + 1; }
      }
    }
    return { n: n / secs, stand: stand / Math.max(1, n), by: Object.entries(by).sort((a, b) => b[1].n - a[1].n).slice(0, 18).map(([k, o]) => [k, +(o.n / secs).toFixed(1), +(o.st / Math.max(1, o.n)).toFixed(2)]), why: Object.entries(why).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([w, k]) => [w, +(k / secs).toFixed(1)]) };
  }, { X, Y, secs: +SECS });
  console.log(`within 100 m of ${X},${Y}: ${r.n.toFixed(1)} cars on average, ${Math.round(100 * r.stand)}% standing`);
  for (const [k, n, s] of r.by) console.log(`  piece ${k}: ${n} (${Math.round(100 * s)}% standing)`);
  console.log('  standing, why:'); for (const [w, k] of r.why) console.log(`    ${k}  ${w}`);
  await b.close();
})();
