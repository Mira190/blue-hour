// The traffic a player hears and sees at a kerb (issue 204): stood at a place on foot for some minutes of the game's
// time, the nearest moving vehicle (over 1 m/s) every half second, and the cars within 30 and 60 m.
// The sound session found the Scramble's red quiet, the nearest moving car 40 to 90 m off.
//   xvfb-run -a node tools/near_traffic.js shibuya [minutes=5] [x,y=362,-1012]      (GAME_TIME=17:57; PHONE=1)
// Prints the median and the 90th percentile of the nearest moving vehicle's distance, the share of samples with one
// within 30 m, and the mean count of moving vehicles within 30 and 60 m.
const { chromium, devices } = require('playwright');
const { startPlay } = require('./start_play');
const { pinClock } = require('./pin_clock');
const [,, city = 'shibuya', MIN = '5', AT = '362,-1012'] = process.argv;
const at = AT.split(',').map(Number);
(async () => {
  process.env.GAME_TIME = process.env.GAME_TIME || '17:57';
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await (await b.newContext(process.env.PHONE ? { ...devices['iPhone 13'] } : { viewport: { width: 800, height: 500 } })).newPage();
  p.on('pageerror', e => console.log('pageerror', String(e).slice(0, 300)));
  await p.addInitScript(() => { try { localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } });
  await pinClock(p, city);
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-${city}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.cars', null, { timeout: 400000 });
  await p.evaluate(async () => { const g = window.__game; g.hold(true, true); await g.ways.build(); if (g.lateReady) await g.lateReady(); });
  await startPlay(p, { asIs: true });
  await p.evaluate(at => { const g = window.__game; g.hopTo(at[0], at[1], g.nav.terrain(at[0], at[1]), 'the kerb'); for (let t = 0; t < 10 && (g.arriving() || g.cine.active); t += 0.25) g.advance(0.25); g.advance(60); window.__nt = []; }, at); // (a minute for the traffic to settle round you)
  const steps = Math.round(+MIN * 60 * 2);
  for (let s = 0; s < steps; s += 120) {
    await p.evaluate(n => {
      const g = window.__game, pl = g.player;
      for (let k = 0; k < n; k++) {
        for (let f = 0; f < 15; f++) g.frame(1 / 30);
        let nd = Infinity, n30 = 0, n60 = 0;
        for (const c of g.cars.C) { if (c.line < 0 || (c.v || 0) < 1) continue; const d = Math.hypot(c.x - pl.x, c.y - pl.y); if (d < nd) nd = d; if (d < 30) n30++; if (d < 60) n60++; }
        window.__nt.push([nd, n30, n60]);
      }
    }, Math.min(120, steps - s));
  }
  const S = await p.evaluate(() => ({ s: window.__nt, live: window.__game.cars.C.filter(c => c.line >= 0).length }));
  const d = S.s.map(r => r[0]).sort((a, b) => a - b), q = f => d[Math.min(d.length - 1, Math.floor(d.length * f))];
  const m = k => S.s.reduce((a, r) => a + r[k], 0) / S.s.length;
  console.log(`at ${at}, ${MIN} min at ${process.env.GAME_TIME}${process.env.PHONE ? ' (phone)' : ''}, ${S.live} vehicles live: the nearest moving vehicle median ${q(0.5).toFixed(0)} m, 90% within ${q(0.9).toFixed(0)} m; one within 30 m in ${(100 * d.filter(x => x < 30).length / d.length).toFixed(0)}% of samples; moving within 30 m ${m(1).toFixed(1)}, within 60 m ${m(2).toFixed(1)} on average`);
  await b.close();
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
