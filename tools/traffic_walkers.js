// The traffic against the crowd round one place, the world stepped on without drawing (#28): on every step every
// car of the traffic (an oriented box) against every walker's middle (as tools/ride_people.js checks them), and on a
// hit what the car and the walker were doing: the car's turn, its body's swing, why it moved, the walker's phase.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/traffic_walkers.js [x,y] [minutes of world] [runs]
// Exits 1 on any car standing in a walker. Defaults: the north scramble (392,-819), 10 minutes, 1 run.
// Also counts, by bus and car, each step that drove a body deeper into where a walker stands, past 0.03 m of their 0.3
// (a driver waited on a while may edge to 0.12 m: counts deeper than that are the ones to look at). STORY=1: from Play in the
// ride check's frame 6, the player where the flight sets them down; MARGIN=m: how far outside a body a walker's middle
// counts as in it (0.05, as tools/ride_people.js).
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const [,, at = '392,-819', mins = '10', runs = '1'] = process.argv;
const [X, Y] = at.split(',').map(Number), STORY = !!process.env.STORY, MARGIN = +(process.env.MARGIN || 0.05); // (MARGIN: how far outside the body a walker's middle counts, 0.05 as the ride check; 0.3, a walker's body) // (STORY=1: from Play in frame 6, the ride check's start, the player where the story puts them)
(async () => {
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let bad = 0;
  for (let run = 0; run < +runs; run++) {
    const p = await b.newPage({ viewport: { width: 640, height: 400 } });
    p.on('pageerror', e => { bad++; console.log('pageerror', String(e).slice(0, 300)); });
    if (STORY) { // (as tools/ride_people.js starts: frame 6 of the story, from Play, every step from the first watched)
      await p.addInitScript(() => { try { localStorage.setItem('bh-quality', 'high'); localStorage.setItem('bh-story-late', JSON.stringify({ fi: 5, left: 2, prints: [0, 1, 2, 3, 4].map(i => ({ src: null, stamp: `frame ${i + 1}`, cap: '' })) })); } catch (e) { /* storage blocked */ } });
      await p.goto(`http://localhost:${process.env.PORT || 8800}/?overture=0`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
      await p.evaluate(() => { window.__game.hold(true); document.getElementById('gt-play').click(); });
    } else {
      await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await p.waitForFunction('window.__game', null, { timeout: 600000, polling: 500 });
      await p.evaluate(() => window.__game.lateReady && window.__game.lateReady());
      await startPlay(p);
      await p.waitForTimeout(2000);
    }
    const r = await p.evaluate(async ([X, Y, mins, STORY, MARGIN]) => {
      const g = window.__game, pl = g.player;
      if (!STORY) { pl.x = X + 14; pl.y = Y + 14; } else { pl.x = 498; pl.y = -1046; } // (on foot near it, the traffic and the crowd kept round the player; or where the flight sets you down, as the ride check)
      const R = STORY ? 1e9 : 60, was = new Map(); // (each car's and walker's place the step before)
      const inBox = (c, x, y, r) => { const fx = Math.sin(c.h), fy = Math.cos(c.h), dx = x - c.x, dy = y - c.y; return Math.abs(dx * fx + dy * fy) < c.half + r && Math.abs(-dx * fy + dy * fx) < c.hw + r; };
      const depth = (c, x, y) => { const fx = Math.sin(c.h), fy = Math.cos(c.h), dx = x - c.x, dy = y - c.y, ea = c.half + 0.3 - Math.abs(dx * fx + dy * fy), eb = c.hw + 0.3 - Math.abs(-dx * fy + dy * fx); return ea > 0 && eb > 0 ? Math.min(ea, eb) : 0; };
      const f = v => typeof v === 'number' ? +v.toFixed(2) : v;
      const hits = [], count = {};
      let frames = 0, near = 0;
      const steps = Math.round(mins * 60 * 30);
      for (let k = 0; k < steps; k++) {
        g.frame(1 / 30);
        frames++;
        const cr = g.crowd;
        for (const c of g.cars.live) {
          if (c.line < 0 || Math.abs(c.x - X) > R || Math.abs(c.y - Y) > R) continue;
          near++;
          const c0w = was.get(c);
          for (let i = 0, n = Math.min(cr.active, cr.P.length); i < n; i++) {
            const q = cr.P[i];
            if (!(q.line >= 0 || q.pz)) continue;
            if (Math.abs(q.x - c.x) > 8 || Math.abs(q.y - c.y) > 8 || Math.abs(q.z - c.z) > 2) continue;
            // (the car's own step driving its body deeper into where the walker stands now, past the 0.02 m a driver allows
            // into a walker's 0.3 m: what the drivers hold on, so 0 but for a walker stepping in)
            if (c0w) { const e1 = depth(c, q.x, q.y), e0 = depth(c0w, q.x, q.y); if (e1 > 0.03 && e1 > e0 + 2e-3) { const k = `${c.half > 3.5 ? 'bus' : 'car'} deeper`; count[k] = (count[k] || 0) + 1; } }
            if (!inBox(c, q.x, q.y, MARGIN)) continue;
            const c0 = was.get(c), q0 = was.get(q), how = !c0 || !q0 ? 'new' : inBox(c0, q0.x, q0.y, MARGIN) ? 'already in' : inBox(c, q0.x, q0.y, MARGIN) ? (inBox(c0, q.x, q.y, MARGIN) ? 'both' : 'car moved in') : inBox(c0, q.x, q.y, MARGIN) ? 'walker moved in' : 'both';
            const key = `${c.half > 3.5 ? 'bus' : 'car'} ${how}`; count[key] = (count[key] || 0) + 1;
            if (hits.length < 30) hits.push({ t: f(g.t()), how, c0: c0 && [f(c0.x), f(c0.y), f(c0.h)], q0: q0 && [f(q0.x), f(q0.y)], car: { x: f(c.x), y: f(c.y), h: f(c.h), half: f(c.half), hw: f(c.hw), v: f(c.v), why: c.why, heldBy: c.heldBy, mv: !!c.mv, sq: !!c.squeezing, pw: f(c.pw || 0), who: c.who, rx: f(c.rx), ry: f(c.ry), line: c.line, bus: !!c.bus, backoff: f(c.backoff || 0) },
              walker: { i, x: f(q.x), y: f(q.y), v: f(q.v), state: q.state, ph: q.ph, pz: !!q.pz, tight: !!q.tight, ej: !!q.ejected, jam: f(q.jam || 0), sq: f(q.squeeze || 0), line: q.line } });
          }
        }
        for (const c of g.cars.live) if (c.line >= 0) was.set(c, { x: c.x, y: c.y, h: c.h, half: c.half, hw: c.hw });
        for (let i = 0, n = Math.min(g.crowd.active, g.crowd.P.length); i < n; i++) { const q = g.crowd.P[i]; was.set(q, { x: q.x, y: q.y }); }
        if (k % 300 === 0) await new Promise(r => setTimeout(r, 0));
      }
      return { frames, near, hits, count };
    }, [X, Y, +mins, STORY, MARGIN]);
    console.log(`run ${run + 1}: ${r.frames} steps, ${r.near} car-steps within 60 m, ${r.hits.length} hits`, JSON.stringify(r.count));
    for (const h of r.hits) console.log('  ', JSON.stringify(h));
    if (r.hits.length) bad++;
    await p.close();
  }
  await b.close();
  process.exit(bad && MARGIN <= 0.05 ? 1 : 0);
})();
