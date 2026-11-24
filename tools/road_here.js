// What the game's tests say of a point on the ground (issue 204): the crowd's onRoad (the nearest road line and its
// half-width), the drawn carriageway (nav.carriageway), and every road line within 8 m with its distance and
// half-width. One of the Scramble's crowd waited in the middle of its west arm, which onRoad called pavement.
//   xvfb-run -a node tools/road_here.js shibuya x,y [x,y ...]
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const { pinClock } = require('./pin_clock');
const [,, city = 'shibuya', ...pts] = process.argv;
(async () => {
  process.env.GAME_TIME = process.env.GAME_TIME || '17:57';
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await (await b.newContext({ viewport: { width: 640, height: 400 } })).newPage();
  p.on('pageerror', e => console.log('pageerror', String(e).slice(0, 300)));
  await p.addInitScript(() => { try { localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } });
  await pinClock(p, city);
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-${city}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.cars && window.__game.crowd && window.__game.crowd.plazas', null, { timeout: 400000 });
  await startPlay(p, { asIs: true });
  const out = await p.evaluate(pts => pts.map(s => {
    const [x, y] = s.split(',').map(Number), g = window.__game, R = g.roadNet, pz = g.crowd.plazas.find(q => Math.hypot(q.x - x, q.y - y) < 80);
    const rw = l => (window.OEStreets && OEStreets.widthOf ? OEStreets.widthOf(l) : l.w || 0);
    const near = [];
    for (let i = 0; i < R.L.length; i++) { const l = R.L[i]; const P = l.pts; if (!P) continue; let best = Infinity; for (let k = 0; k + 5 < P.length; k += 3) { const ax = P[k], ay = P[k + 1], bx = P[k + 3], by = P[k + 4], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0; best = Math.min(best, Math.hypot(x - ax - dx * t, y - ay - dy * t)); } if (best < 8) near.push(`line ${i} ${l.c} d ${best.toFixed(2)} half ${(rw(l) / 2).toFixed(2)}${best < rw(l) / 2 ? ' INSIDE' : ''}`); }
    const q = R.nearD ? R.nearD(x, y, 8, {}) : R.nearest(x, y, 8);
    return `${s}: onRoad ${pz ? pz.road(x, y) : '-'}; carriageway ${g.nav.carriageway ? g.nav.carriageway(x, y) : '-'}; nearest line ${q ? q.line + ' d ' + q.d.toFixed(2) + ' half ' + (rw(R.L[q.line]) / 2).toFixed(2) : '-'}\n   ${near.join('\n   ')}`;
  }), pts);
  console.log(out.join('\n'));
  await b.close();
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
