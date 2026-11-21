// You on foot set down in a lane of the traffic just ahead of a car coming on in it, alone and quickly (#94): the game
// held in lockstep on the map without the story, and for each of the moving cars nearest you, you put d m ahead of its
// nose (1 to 9 m), on its line and off it to either side by its half width, then the world stepped a thirtieth of a second
// at a time for two seconds and, after every step, the car tested against you as tools/ride_people.js tests it (its box,
// your middle with 5 cm of your width). Prints how many of the tries ended with the car in you for a step, and for how many.
// This is what the ride check did by standing you off the ride's road-side flank, where its lane runs.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/lane_you_probe.js [cars to try, default 12]
const { chromium } = require('playwright');
const [,, tries = '12'] = process.argv;
(async () => {
  const b = await chromium.launch(process.env.DISPLAY
    ? { headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] }
    : { args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 960, height: 600 } });
  p.on('pageerror', e => console.log(`pageerror: ${String(e).slice(0, 300)}`));
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game', null, { timeout: 600000, polling: 500 });
  await p.evaluate(async () => { const g = window.__game; g.hold(true, true); await g.ways.build(); g.advance(20); });
  const out = await p.evaluate(n => {
    const g = window.__game, pl = g.player;
    const inBox = (c, x, y, r) => { const fx = Math.sin(c.h), fy = Math.cos(c.h), dx = x - c.x, dy = y - c.y; return Math.abs(dx * fx + dy * fy) < c.half + r && Math.abs(-dx * fy + dy * fx) < c.hw + r; };
    const res = { tries: 0, hit: 0, frames: 0, rows: [] }, home = [pl.x, pl.y, pl.z];
    for (let k = 0; k < n; k++) {
      const cands = g.cars.live.filter(o => o.line >= 0 && o.v > 6 && !o.park && Math.abs(o.z - pl.z) < 3).sort((a, b) => Math.hypot(a.x - home[0], a.y - home[1]) - Math.hypot(b.x - home[0], b.y - home[1]));
      const o = cands[k % Math.max(1, Math.min(4, cands.length))];
      if (!o) { g.advance(2); continue; }
      for (const d of [1, 3, 6, 9]) for (const side of [0, -1, 1]) {
        if (o.line < 0) break;
        const fx = Math.sin(o.h), fy = Math.cos(o.h), a = o.half + d, l = side * o.hw;
        pl.x = o.x + fx * a + fy * l; pl.y = o.y + fy * a - fx * l; pl.z = o.z; pl.speed = 0;
        const v0 = o.v;
        let frames = 0;
        for (let i = 0; i < 60; i++) { g.advance(1 / 30); if (pl.mode === 'foot' && inBox(o, pl.x, pl.y, 0.05)) frames++; }
        res.tries++;
        if (frames) { res.hit++; res.frames += frames; if (res.rows.length < 30) res.rows.push({ d, side, v0: +v0.toFixed(1), v: +o.v.toFixed(1), frames, why: o.why || '' }); }
        pl.x = home[0]; pl.y = home[1]; pl.z = home[2]; g.advance(1);
      }
    }
    // and set down inside a moving car's flank (10 cm in), as the ride check set you down 1.6 m off the ride's road-side
    // flank whatever was passing there: tested before the world is stepped (a frame of the page's the world did not move
    // in, which the ride check also tests) and after one step
    res.inside = { tries: 0, before: 0, after: 0 };
    for (let k = 0; k < n; k++) {
      const o = g.cars.live.filter(o => o.line >= 0 && o.v > 6 && !o.park && Math.abs(o.z - pl.z) < 3).sort((a, b) => Math.hypot(a.x - home[0], a.y - home[1]) - Math.hypot(b.x - home[0], b.y - home[1]))[k % 4];
      if (!o) { g.advance(2); continue; }
      const fx = Math.sin(o.h), fy = Math.cos(o.h), l = o.hw - 0.1;
      pl.x = o.x + fy * l; pl.y = o.y - fx * l; pl.z = o.z; pl.speed = 0;
      res.inside.tries++;
      if (inBox(o, pl.x, pl.y, 0.05)) res.inside.before++;
      g.advance(1 / 30);
      if (inBox(o, pl.x, pl.y, 0.05)) res.inside.after++;
      pl.x = home[0]; pl.y = home[1]; pl.z = home[2]; g.advance(1);
    }
    return res;
  }, +tries);
  console.log('set down in a car: tries', out.inside.tries, '| in it before a step', out.inside.before, '| after one step', out.inside.after);
  console.log('tries', out.tries, '| a car in you for a step:', out.hit, 'tries,', out.frames, 'steps in all');
  for (const r of out.rows) console.log('  ', JSON.stringify(r));
  await b.close();
})();
