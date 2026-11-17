// The trees of the hero level (docs/HERO.md) and what a camera at eye height meets in them: each tree within R m of the
// Scramble (or AT=x,y) with its species, its trunk, where its lowest leaves hang and how far its crown reaches, as
// drawn (web/trees.js crowns()). Exits 1 if one standing on open paving within the level hangs leaves lower than
// MIN m (default 2.5): a crowd and a camera at eye height walk under a square's trees (issue 19).
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/hero_trees.js            (R=60 AT=381,-1040 MIN=2.5)
'use strict';
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage({ viewport: { width: 640, height: 400 } });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.Wd && window.__game.Wd.trees', null, { timeout: 900000, polling: 500 });
  const at = (process.env.AT || '381,-1040').split(',').map(Number), R = +(process.env.R || 60), MIN = +(process.env.MIN || 2.5);
  const out = await p.evaluate(([at, R]) => {
    const T = window.__game.Wd.trees, tr = T.trunks(), cw = T.crowns ? T.crowns() : [], list = [];
    const spOf = (x, y) => { for (let i = 0; i < T.n; i++) { const q = T.at(i); if (q && Math.abs(q[0] - x) < 0.06 && Math.abs(q[1] - y) < 0.06) return T.species[T.kind(i)]; } return '?'; };
    for (let i = 0, j = 0; i < tr.length; i += 4, j += 3) {
      const x = tr[i], y = tr[i + 1], d = Math.hypot(x - at[0], y - at[1]);
      if (d < R) list.push({ x: +x.toFixed(1), y: +y.toFixed(1), d: +d.toFixed(1), sp: spOf(x, y), clear: cw.length ? +cw[j].toFixed(2) : null, reach: cw.length ? +cw[j + 1].toFixed(2) : null });
    }
    return list.sort((a, b) => a.d - b.d);
  }, [at, R]);
  let bad = 0;
  for (const t of out) { const low = t.clear != null && t.clear < MIN && t.clear > 0.5; if (low) bad++; console.log(`${low ? 'LOW ' : '    '}${String(t.sp).padEnd(12)} at (${t.x}, ${t.y}) ${t.d} m off: leaves from ${t.clear} m, reach ${t.reach} m`); }
  console.log(`${out.length} trees within ${R} m; ${bad} with leaves under ${MIN} m`);
  await b.close();
  process.exit(bad ? 1 : 0);
})();
