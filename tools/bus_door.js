// A bus's stop watched (issue 204's second item): the people who get off a standing bus and those who walk to its door,
// each frame, against the body of every car of the traffic. The ride check once found one of a bus's passengers set
// down inside their own standing bus (388.8,-938.7, state 'leave'); this plays the street there without the story.
//   xvfb-run -a node tools/bus_door.js shibuya [minutes=10] [x,y=388,-938]      (GAME_TIME=17:57 as the roads check; OFF=n
//   has n get off at every stop, where the street gives up to two and only of those out of sight)
// Every bus stop within 150 m of the place is listed; then for each frame (1/30 s) a walker getting on or off a bus
// ('board', 'leave') or one of the crowd within 2 m of a standing bus is tested against each car's box as the ride
// check tests it (its middle inside the length and width, with 5 cm). The first few inside are printed with the bus,
// its door and how the walker came there; the run fails on any.
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const { pinClock } = require('./pin_clock');
const [,, city = 'shibuya', MIN = '10', AT = '388,-938'] = process.argv;
const at = AT.split(',').map(Number);

(async () => {
  process.env.GAME_TIME = process.env.GAME_TIME || '17:57';
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await (await b.newContext({ viewport: { width: 800, height: 500 } })).newPage();
  p.on('pageerror', e => console.log('pageerror', String(e).slice(0, 400)));
  await p.addInitScript(() => { try { localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } });
  await pinClock(p, city);
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-${city}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.cars', null, { timeout: 400000 });
  await p.evaluate(async () => { const g = window.__game; g.hold(true, true); await g.ways.build(); if (g.lateReady) await g.lateReady(); });
  await startPlay(p, { asIs: true });
  if (process.env.OFF) await p.evaluate(n => { window.__OFF = n; }, +process.env.OFF);
  const stops = await p.evaluate(at => {
    const g = window.__game, q = g.roadNet.nearest(at[0], at[1], 60);
    g.hopTo(q.x, q.y, q.z, 'the kerb');
    for (let t = 0; t < 10 && (g.arriving() || g.cine.active); t += 0.25) g.advance(0.25);
    const out = [];
    for (const S of g.cars.busStops.values()) for (const s of S) if (Math.hypot(s.x - at[0], s.y - at[1]) < 150) out.push(`line ${s.line} dir ${s.dir} at ${s.x.toFixed(1)},${s.y.toFixed(1)}`);
    const off = +(window.__OFF || 0); if (off) { const b0 = g.crowd.board; g.crowd.board = (door, n, m, ...r) => b0(door, n, Math.max(m, off), ...r); } // (OFF=n: n off at every stop, for more of them to watch)
    window.__bd = { bad: [], n: 0, frames: 0, alighted0: g.crowd.alighted, boarded0: g.crowd.boarded, stopped0: g.cars.busStopped, was: new Map() };
    return out;
  }, at);
  console.log(`bus stops within 150 m of ${at}: ${stops.length}\n  ${stops.join('\n  ')}`);
  const steps = Math.round(+MIN * 60 * 30), chunk = 30 * 20;
  for (let s = 0; s < steps; s += chunk) {
    const r = await p.evaluate(n => {
      const g = window.__game, W = window.__bd, P = g.crowd.P;
      const inBox = (c, x, y, r) => { const fx = Math.sin(c.h), fy = Math.cos(c.h), dx = x - c.x, dy = y - c.y; return Math.abs(dx * fx + dy * fy) < c.half + r && Math.abs(-dx * fy + dy * fx) < c.hw + r; };
      for (let k = 0; k < n; k++) {
        g.frame(1 / 30); W.frames++;
        const buses = g.cars.live.filter(c => c.line >= 0 && c.bus && c.dwell > 0);
        for (let i = 0, m = Math.min(g.crowd.active, P.length); i < m; i++) {
          const q = P[i]; if (q.line < 0 && !q.pz) continue;
          const near = buses.some(c => Math.hypot(q.x - c.x, q.y - c.y) < c.half + 3);
          if (q.state !== 'board' && q.state !== 'leave' && !near) { W.was.delete(i); continue; }
          for (const c of g.cars.live) {
            if (c.line < 0 || Math.abs((c.z || 0) - (q.z || 0)) > 2 || !inBox(c, q.x, q.y, 0.05)) continue;
            W.n++;
            if (W.bad.length < 8) { const w = W.was.get(i), fx = Math.sin(c.h), fy = Math.cos(c.h), dx = q.x - c.x, dy = q.y - c.y;
              W.bad.push({ t: +(W.frames / 30).toFixed(1), walker: i, state: q.state, at: [+q.x.toFixed(2), +q.y.toFixed(2)], along: +(dx * fx + dy * fy).toFixed(2), across: +(-dx * fy + dy * fx).toFixed(2),
                car: g.cars.C.indexOf(c), bus: !!c.bus, dwell: +(c.dwell || 0).toFixed(1), v: +(c.v || 0).toFixed(2), cAt: [+c.x.toFixed(2), +c.y.toFixed(2), +c.h.toFixed(3)], half: c.half, hw: c.hw, pw: +(c.pw || 0).toFixed(2), why: c.why || '',
                seat: q.seat ? [+q.seat.x.toFixed(2), +q.seat.y.toFixed(2)] : null, back: q.back ? [+q.back.x.toFixed(2), +q.back.y.toFixed(2)] : null, before: w || null }); }
          }
          W.was.set(i, { state: q.state, at: [+q.x.toFixed(2), +q.y.toFixed(2)], t: +(W.frames / 30).toFixed(1) });
        }
      }
      return { n: W.n, t: W.frames / 30, off: g.crowd.alighted - W.alighted0, on: g.crowd.boarded - W.boarded0, stopped: g.cars.busStopped - W.stopped0 };
    }, Math.min(chunk, steps - s));
    console.log(`${r.t.toFixed(0)} s: buses stopped ${r.stopped}, people off ${r.off}, on ${r.on}; inside a car ${r.n}`);
  }
  const W = await p.evaluate(() => window.__bd.bad);
  for (const w of W) console.log('  inside: ' + JSON.stringify(w));
  console.log(W.length ? `FAIL people getting on or off a bus inside a car: ${W.length}${W.length === 8 ? '+' : ''}` : 'ok   nobody getting on or off a bus inside a car');
  await b.close();
  process.exit(W.length ? 1 : 0);
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
