// The road lines near a place as the page lays them (issue 173): each line of the traffic's network within R of (x, y),
// its height every 4 m and where it is on a deck, to compare two builds of the page (PORT) line by line.
//   xvfb-run -a node tools/deck_near.js x y [r=60]
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const [,, X, Y, R = '60'] = process.argv;
(async () => {
  const b = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage({ viewport: { width: 640, height: 400 } });
  await p.addInitScript(() => { try { localStorage.setItem('bh-quality', 'low'); localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game', null, { timeout: 600000 });
  await startPlay(p);
  await p.evaluate(() => { const g = window.__game; if (g.cine && g.cine.active) g.cine.skip(); g.spawn(); g.advance(0.5); g.hold(true); });
  const out = await p.evaluate(([x, y, r]) => {
    const g = window.__game, L = g.roadNet.L, q = {}, rows = [];
    L.forEach((l, li) => {
      const pts = [];
      let near = false;
      for (let s = 0; s <= l.len; s += 4) { g.roadNet.at(li, s, q); if (Math.hypot(q.x - x, q.y - y) < r) near = true; pts.push(`${q.x.toFixed(0)},${q.y.toFixed(0)}:${q.z.toFixed(1)}${q.deck ? 'D' : ''}`); }
      if (near) rows.push(`${l.c} ${l.len.toFixed(0)} m | ${pts.join(' ')}`);
    });
    return rows.sort();
  }, [+X, +Y, +R]);
  console.log(out.join('\n'));
  await b.close();
})();
