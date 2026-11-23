// Where the traffic is going, as the page has it (web/game/trips.js, docs/ROADS.md; issue 196): the places a car can
// be bound for, and for one car of the traffic at a time its place, the cost by road from where it is, and whether
// the exit it was given at its last junction brought it nearer. PHONE=1 plays a phone's district.
//   xvfb-run -a node tools/trips_probe.js shibuya [seconds=120]
// Fails when the page has no trips, when fewer than half the cars are bound for a place, or when the cars that chose
// between exits chose the one that brings them nearer less than two times in three.
const { chromium, devices } = require('playwright');
const { startPlay } = require('./start_play');
const { pinClock } = require('./pin_clock');
const [,, city = 'shibuya', SECS = '120'] = process.argv;
(async () => {
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const ctx = await b.newContext(process.env.PHONE ? { ...devices['iPhone 13'] } : { viewport: { width: 1100, height: 650 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('pageerror', String(e).slice(0, 400)));
  await p.addInitScript(() => { try { localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } });
  await pinClock(p, city);
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-${city}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.cars', null, { timeout: 400000 });
  await p.evaluate(async () => { const g = window.__game; g.hold(true, true); await g.ways.build(); if (g.lateReady) await g.lateReady(); });
  await startPlay(p, { asIs: !!process.env.ASIS });
  const r = await p.evaluate(secs => {
    const g = window.__game, cars = g.cars, C = cars.C, L = cars.netL, T = cars.junctions.trips && cars.junctions.trips();
    if (!T) return { none: true, has: !!window.OETrips };
    for (let t = 0; g.arriving() && t < 10; t += 0.25) g.advance(0.25);
    g.advance(20);
    const out = { places: T.places.map(q => ({ kind: q.kind, c: L[q.line].c, x: Math.round(q.x), y: Math.round(q.y) })), chose: 0, nearer: 0, turnedBack: 0, legs: 0 };
    const last = new Map();   // car -> { line, cost, trip }
    for (let t = 0; t < secs; t += 0.5) {
      g.advance(0.5);
      for (let i = 0; i < Math.min(C.length, cars.active); i++) {
        const c = C[i];
        if (c.line < 0 || c.bus || c.park || !(c.trip >= 0)) { last.delete(i); continue; }
        const was = last.get(i), cost = T.cost(c.trip, c.line, c.dir);
        if (was && was.trip === c.trip && was.line !== c.line && cost < Infinity && was.cost < Infinity) {
          out.legs++;
          // (onto a new piece: nearer when what is left is less than it was coming onto the piece before)
          if (cost < was.cost) out.nearer++;
          if (was.prev === c.line) out.turnedBack++;
        }
        if (!was || was.line !== c.line || was.trip !== c.trip) last.set(i, { line: c.line, cost, trip: c.trip, prev: was && was.trip === c.trip ? was.line : -1 });
      }
    }
    let n = 0, bound = 0, ended = 0;
    for (let i = 0; i < Math.min(C.length, cars.active); i++) { const c = C[i]; if (c.line < 0 || c.bus) continue; n++; if (c.trip >= 0) bound++; ended += c.trips || 0; }
    return Object.assign(out, { cars: n, bound, ended, fields: T.fields() });
  }, +SECS);
  await b.close();
  if (r.none) { console.log(`FAIL the page has no trips (OETrips ${r.has ? 'loaded, never set' : 'not loaded'})`); process.exit(1); }
  console.log(`${r.places.length} places: ` + r.places.map(q => `${q.kind} ${q.c} ${q.x},${q.y}`).join('; '));
  const share = r.legs ? r.nearer / r.legs : 0;
  const lines = [
    [r.bound >= 0.5 * r.cars, `${r.bound} of ${r.cars} cars bound for a place; ${r.ended} trips ended and begun again in ${SECS} s; ${r.fields} fields worked out`],
    [share >= 0.66, `a car coming onto a new piece is nearer its place by road ${(share * 100).toFixed(0)}% of the time (${r.nearer} of ${r.legs}; two times in three at least)`],
    [r.turnedBack <= 0.02 * Math.max(1, r.legs), `${r.turnedBack} of ${r.legs} moves went back onto the piece the car had just left`],
  ];
  let bad = 0;
  for (const [ok, text] of lines) { console.log(`${ok ? 'ok  ' : 'FAIL'} ${text}`); if (!ok) bad++; }
  process.exit(bad ? 1 : 0);
})();
