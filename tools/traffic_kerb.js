// The traffic's bodies against the carriageway as drawn (issue 224, and #208's rule that a car keeps to the carriageway):
// the cars of the traffic round a place, sampled once a second for some minutes of the game's time at the real rate, each
// car's four corners (less 0.25 m) read against the drawn carriageway (nav.carriageway, as tools/ride_people.js reads a
// ride's stop). Prints the share of car-seconds with a corner over the kerb and the pieces of road where it happens,
// worst first, with a car there as an example.
//   xvfb-run -a node tools/traffic_kerb.js [minutes=4] [x,y=372,-1010] [R=120]     (GAME_TIME=17:57 by default;
//   MAX=share: exits 1 over it)
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const { pinClock } = require('./pin_clock');
const [,, MIN = '4', AT = '372,-1010', RR = '120'] = process.argv;
const [X, Y] = AT.split(',').map(Number);
if (!process.env.GAME_TIME) process.env.GAME_TIME = '17:57';
(async () => {
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await (await b.newContext({ viewport: { width: 1100, height: 650 } })).newPage();
  p.on('pageerror', e => console.log('pageerror', String(e).slice(0, 300)));
  await p.addInitScript(() => { try { localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } });
  await pinClock(p, 'shibuya');
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.cars', null, { timeout: 400000 });
  await p.evaluate(async () => { const g = window.__game; g.hold(true, true); await g.ways.build(); if (g.lateReady) await g.lateReady(); });
  await startPlay(p, { asIs: true });
  const r = await p.evaluate(({ X, Y, R, secs }) => {
    const g = window.__game, cars = g.cars, cw = g.nav.carriageway, by = {};
    g.clock.scale = 1;
    for (let t = 0; g.arriving() && t < 10; t += 0.25) g.advance(0.25);
    g.hopTo(X, Y, g.player.z, 'the kerb');
    g.advance(40);
    let n = 0, off = 0;
    for (let t = 0; t < secs; t++) {
      g.advance(1);
      for (const c of cars.live) {
        if (c.line < 0 || c.park || Math.hypot(c.x - X, c.y - Y) > R) continue;
        n++;
        const hx = Math.sin(c.h), hy = Math.cos(c.h), a = c.half - 0.25, w = c.hw - 0.25;
        let k = 0;
        for (const [u, v] of [[a, w], [a, -w], [-a, w], [-a, -w]]) if (cw(c.x + hx * u - hy * v, c.y + hy * u + hx * v) === false) k++;
        if (!k) continue;
        off++;
        const o = by[c.line] || (by[c.line] = { n: 0, eg: null });
        o.n++; if (!o.eg) o.eg = { at: [+c.x.toFixed(1), +c.y.toFixed(1)], corners: k, lo: +(c.lo || 0).toFixed(2), off: +(c.off || 0).toFixed(2), ln: c.ln, why: c.why, mv: c.mv ? `${c.mv.j.id} ${c.mv.a.i}>${c.mv.e.m.i}` : '', bus: !!c.bus, v: +c.v.toFixed(1) };
      }
    }
    return { n, off, by: Object.entries(by).sort((u, v) => v[1].n - u[1].n).slice(0, 12) };
  }, { X, Y, R: +RR, secs: +MIN * 60 });
  const share = r.n ? r.off / r.n : 0;
  console.log(`${r.off} of ${r.n} car-seconds within ${RR} m with a corner over the drawn kerb (${(share * 100).toFixed(1)}%)`);
  for (const [line, o] of r.by) console.log(`  piece ${line}: ${o.n} car-seconds; e.g. at ${o.eg.at}, ${o.eg.corners} corners off, lane ${o.eg.ln} lo ${o.eg.lo} off ${o.eg.off}${o.eg.mv ? ` in ${o.eg.mv}` : ''}, ${o.eg.why || ''} v ${o.eg.v}${o.eg.bus ? ', a bus' : ''}`);
  await b.close();
  process.exit(process.env.MAX && share > +process.env.MAX ? 1 : 0);
})();
