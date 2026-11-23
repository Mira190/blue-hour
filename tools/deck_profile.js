// The profile of a road line as a car meets it: along its centre and a lane either side, every STEP metres, the ground
// drawn (nav.terrain), every deck there (nav.decksAt) and the line's own height, so that a deck's end standing over
// the road it joins (issue 173) is seen in numbers.
//   xvfb-run -a node tools/deck_profile.js <line,line,...> [step=1] [out.json]
const { chromium } = require('playwright');
const fs = require('fs');
const { startPlay } = require('./start_play');
const [,, LINES = '', STEP = '1', OUT] = process.argv;
(async () => {
  const b = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage({ viewport: { width: 640, height: 400 } });
  p.on('pageerror', e => console.log('pageerror', String(e).slice(0, 300)));
  await p.addInitScript(() => { try { localStorage.setItem('bh-quality', 'low'); localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game', null, { timeout: 600000 });
  await startPlay(p);
  await p.evaluate(() => { const g = window.__game; if (g.cine && g.cine.active) g.cine.skip(); g.spawn(); g.advance(0.5); });
  await p.evaluate(() => window.__game.hold(true));
  const r = await p.evaluate(([lines, step]) => {
    const g = window.__game, nav = g.nav, L = g.roadNet.L, q = {}, out = {};
    if (nav.layAll) nav.layAll();
    for (const li of lines) {
      const l = L[li]; if (!l) continue;
      const rows = [];
      for (let s = 0; s <= l.len; s += step) {
        g.roadNet.at(li, s, q);
        const s2 = Math.min(l.len, s + 0.5), q2 = {}; g.roadNet.at(li, s2 === s ? s - 0.5 : s2, q2);
        let fx = q2.x - q.x, fy = q2.y - q.y; const n = Math.hypot(fx, fy) || 1; fx /= n; fy /= n; if (s2 === s) { fx = -fx; fy = -fy; }
        const row = { s: +s.toFixed(1), x: +q.x.toFixed(1), y: +q.y.toFixed(1), z: +q.z.toFixed(2), deck: q.deck ? 1 : 0, w: [] };
        for (const o of [-3, -1.4, 0, 1.4, 3]) {
          const x = q.x - fy * o, y = q.y + fx * o, d = [];
          nav.decksAt(x, y, h => d.push(+h.toFixed(2)));
          row.w.push([+nav.terrain(x, y).toFixed(2), ...d]);
        }
        rows.push(row);
      }
      out[li] = { c: l.c, len: +l.len.toFixed(1), rows };
    }
    return out;
  }, [LINES.split(',').map(Number), +STEP]);
  for (const [li, l] of Object.entries(r)) {
    console.log(`line ${li} ${l.c} ${l.len} m`);
    for (const w of l.rows) console.log(`  ${String(w.s).padStart(6)} (${w.x}, ${w.y}) z ${w.z}${w.deck ? ' D' : '  '} | ` + w.w.map(v => v.join('/')).join('  '));
  }
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(r));
  await b.close();
})();
