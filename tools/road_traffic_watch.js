// The traffic watched from a kerb (issue 167): stand at each place given for some minutes of the game's time and
// count what the road plan (pipeline/road_plan.py, docs/ROADS.md) says must not happen:
//   made quiet   a vehicle made on a quiet street (a cul-de-sac, the stub before a closure) or on a piece cut at a wall
//   bus off      a bus made off the bus streets; and the share of the buses' time spent off them, and off the line each
//                is on (game.json bl, pipeline/bus_lines.py: its own line's pieces, the way the line runs them)
//   made near    a vehicle made within 120 m of you (in sight)
//   inside       two vehicles drawn one inside the other (their boxes, each drawn in by 0.25 m, overlapping) for
//                more than 3 s, within 200 m of you
//   stood        a vehicle within 250 m that stands for more than 150 s, not parked and not a bus at its stop
// and how many came into and went out of the 150 m round you. Fails on any of the first four, and on a vehicle
// stood for good.
//   xvfb-run -a node tools/road_traffic_watch.js shibuya [minutes=5] [x,y x,y ...]     (OUT=dir: a still at each end)
// The places default to the two junctions the issue's report lies between: Miyashita Park's (under the Yamanote
// Line) and the foot of Dogenzaka at 109. PHONE=1 plays a phone's district.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const { startPlay } = require('./start_play');
const { pinClock } = require('./pin_clock');
const [,, city = 'shibuya', MIN = '5', ...at] = process.argv;
const PLACES = at.length ? at.map(s => s.split(',').map(Number)) : [[470, -722], [262, -1004]];
(async () => {
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const ctx = await b.newContext(process.env.PHONE ? { ...devices['iPhone 13'] } : { viewport: { width: 1100, height: 650 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('pageerror', String(e).slice(0, 400)));
  await p.addInitScript(() => { try { localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } }); // (no first-run tour over the picture)
  await pinClock(p, city);
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-${city}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.cars', null, { timeout: 400000 });
  await p.evaluate(async () => { const g = window.__game; g.hold(true, true); await g.ways.build(); if (g.lateReady) await g.lateReady(); });
  await startPlay(p, { asIs: !!process.env.ASIS });
  await p.evaluate(() => { const g = window.__game; for (let t = 0; g.arriving() && t < 10; t += 0.25) g.advance(0.25); g.advance(2); });
  let bad = 0;
  for (const [x, y] of PLACES) {
    const r = await p.evaluate(({ x, y, secs }) => {
      // (on the footway nearest the place, out of the carriageway: a watcher stood in the road is someone the traffic waits on)
      // (a footway's point 1.5 m or more past the drawn edge of every carriageway: not a crosswalk over one)
      const g = window.__game, cars = g.cars, C = cars.C, L = cars.netL, q = g.roadNet.nearest(x, y, 40), FN = g.footNet;
      const HALF = { motorway: 7, trunk: 6, primary: 6, secondary: 5, tertiary: 4.5, residential: 3.5, unclassified: 3 }, at = {};
      const clear = (px, py) => { const r = g.roadNet.nearest(px, py, 14); return !r || r.d > (HALF[L[r.line].c] || 3.5) + 1.5; };
      let k = null, bd = 60;
      for (const i of new Set(FN.near(x, y, 0, 60))) { const l = FN.L[i]; for (let s = 0; s <= l.len; s += 2) { FN.at(i, s, at); const d = Math.hypot(at.x - x, at.y - y); if (d < bd && clear(at.x, at.y)) { bd = d; k = { x: at.x, y: at.y, z: at.z }; } } }
      g.hopTo(k ? k.x : x, k ? k.y : y, k ? k.z : q ? q.z : g.player.z, 'the kerb');
      g.advance(20); // (the traffic settles round the new place: what is made in these seconds is not counted)
      const prev = C.map(c => ({ line: c.line, x: c.x, y: c.y })), still = new Float32Array(C.length), pairT = new Map();
      const out = { at: [x, y], secs, made: 0, madeQuiet: [], busMadeOff: [], madeNear: [], inside: [], stood: [], busT: 0, busOffT: 0, busLineOffT: 0, cameIn: 0, wentOut: 0, quietT: 0, carT: 0, cars: 0, buses: 0, bound: 0, tripsEnded: 0, places: 0, fields: 0 };
      const box = c => { const hx = Math.sin(c.h), hy = Math.cos(c.h); return { x: c.x, y: c.y, hx, hy, l: Math.max(0.3, c.half - 0.25), w: Math.max(0.2, c.hw - 0.25) }; };
      const sep = (A, B, ax, ay) => { // (is axis (ax, ay) a separating one?)
        const pa = Math.abs(ax * A.hx + ay * A.hy) * A.l + Math.abs(-ax * A.hy + ay * A.hx) * A.w, pb = Math.abs(ax * B.hx + ay * B.hy) * B.l + Math.abs(-ax * B.hy + ay * B.hx) * B.w;
        return Math.abs((B.x - A.x) * ax + (B.y - A.y) * ay) > pa + pb;
      };
      const hit = (A, B) => !(sep(A, B, A.hx, A.hy) || sep(A, B, -A.hy, A.hx) || sep(A, B, B.hx, B.hy) || sep(A, B, -B.hy, B.hx));
      const DT = 0.5;
      for (let t = 0; t < secs; t += DT) {
        g.advance(DT);
        const px = g.player.x, py = g.player.y, nearby = [];
        for (let i = 0; i < Math.min(C.length, cars.active); i++) {
          const c = C[i], was = prev[i];
          if (c.line < 0) { was.line = -1; continue; }
          const l = L[c.line], d = Math.hypot(c.x - px, c.y - py), dWas = Math.hypot(was.x - px, was.y - py);
          const made = was.line < 0 || Math.hypot(c.x - was.x, c.y - was.y) > 40;
          if (made) {
            out.made++; still[i] = 0;
            if (!c.park && (l.quiet || l.wall)) out.madeQuiet.push({ t, x: +c.x.toFixed(0), y: +c.y.toFixed(0), c: l.c, bus: !!c.bus, wall: l.wall });
            if (c.bus && cars.netL.some(k => k.bus) && !l.bus) out.busMadeOff.push({ t, x: +c.x.toFixed(0), y: +c.y.toFixed(0), c: l.c });
            if (d < 120) out.madeNear.push({ t, d: +d.toFixed(0), x: +c.x.toFixed(0), y: +c.y.toFixed(0), park: !!c.park });
          } else {
            if (d < 150 && dWas >= 150) out.cameIn++;
            if (d >= 150 && dWas < 150) out.wentOut++;
          }
          out.carT += DT; if (l.quiet && !c.park) out.quietT += DT;
          if (c.bus) { out.busT += DT; if (!l.bus) out.busOffT += DT; if (cars.netL.some(k => k.bl) && !(c.bl >= 0 && OEJunctions.lineOn(l, c.dir, c.bl) === c.bl)) out.busLineOffT += DT; }
          if (d < 250 && !c.park && !(c.dwell > 0)) { still[i] = c.v < 0.15 ? still[i] + DT : 0; if (still[i] === 150) { const f = c.front, fi = f ? C.indexOf(f) : -1; out.stood.push({ t, i, x: +c.x.toFixed(0), y: +c.y.toFixed(0), c: l.c, bus: !!c.bus, why: c.why || '', by: c.heldBy || '', mv: c.mv ? c.mv.j.id : null, at: c.lineArm ? c.lineArm.j.id : null, front: f ? { i: fi, x: +(f.x || 0).toFixed(0), y: +(f.y || 0).toFixed(0), why: f.why || '', bus: !!f.bus, mv: f.mv ? f.mv.j.id : null, park: !!f.park, frontIsMe: f.front === c, mine: fi < 0 } : null }); } }
          if (d < 200) nearby.push(i);
          was.line = c.line; was.x = c.x; was.y = c.y;
        }
        for (let a = 0; a < nearby.length; a++) for (let b2 = a + 1; b2 < nearby.length; b2++) {
          const A = C[nearby[a]], B = C[nearby[b2]], k = nearby[a] * 4096 + nearby[b2];
          if (Math.abs(A.z - B.z) > 2.5 || Math.hypot(A.x - B.x, A.y - B.y) > A.half + B.half || !hit(box(A), box(B))) { pairT.delete(k); continue; }
          const s = (pairT.get(k) || 0) + DT;
          pairT.set(k, s);
          if (s === 3.5) { const who = o => ({ kind: o.bus ? 'bus' : o.park ? 'parked' : 'car', at: [+o.x.toFixed(1), +o.y.toFixed(1)], h: +o.h.toFixed(2), line: o.line, s: +(+o.s).toFixed(1), dir: o.dir, ln: o.ln, lo: +(o.lo || 0).toFixed(2), off: +(o.off || 0).toFixed(2), v: +(+o.v).toFixed(1), why: o.why || '', mv: o.mv ? `${o.mv.j.id} ${o.mv.a.i}>${o.mv.e.m.i}` : '', rev: !!o.rev }); out.inside.push({ t, x: +A.x.toFixed(0), y: +A.y.toFixed(0), a: A.bus ? 'bus' : A.park ? 'parked' : 'car', b: B.bus ? 'bus' : B.park ? 'parked' : 'car', A: who(A), B: who(B) }); }
        }
      }
      for (let i = 0; i < Math.min(C.length, cars.active); i++) if (C[i].line >= 0) { out.cars++; if (C[i].bus) out.buses++; else { if (C[i].trip >= 0) out.bound++; out.tripsEnded += C[i].trips || 0; } }
      { const T = cars.junctions.trips && cars.junctions.trips(); if (T) { out.places = T.places.length; out.fields = T.fields ? T.fields() : 0; } }
      return out;
    }, { x, y, secs: +MIN * 60 });
    const share = r.busT ? r.busOffT / r.busT : 0;
    console.log(JSON.stringify(r));
    const checks = [
      [r.madeQuiet.length === 0, `no vehicle made on a quiet street or at a wall (${r.madeQuiet.length} of ${r.made} made)`],
      [r.busMadeOff.length === 0, `no bus made off the bus streets (${r.busMadeOff.length}); the buses' time off them ${(share * 100).toFixed(1)}%`],
      [share < 0.15, 'the buses keep to their streets (under 15% of their time off them)'],
      [!r.busT || r.busLineOffT / r.busT < 0.2, `each bus on a line of its own, the way the line runs (bus_lines.py): off it ${(r.busT ? r.busLineOffT / r.busT * 100 : 0).toFixed(1)}% of the buses' time (under 20%)`],
      [r.madeNear.filter(m => !m.park).length === 0, `nothing made within 120 m of you (${r.madeNear.filter(m => !m.park).length})`],
      [r.inside.length === 0, `no vehicle drawn inside another for over 3 s (${r.inside.length})`],
      // (a scramble's turns are a few seconds long, and the head of a queue there can wait two of its cycles: one or two
      // vehicles so held are a slow junction, more are a jam that does not clear)
      [r.stood.length <= 3, `no queue stood for good: ${r.stood.length} vehicle${r.stood.length === 1 ? '' : 's'} stood 150 s within 250 m (3 at most)`],
      [r.places > 0 && r.bound >= 0.5 * (r.cars - r.buses), `every car has somewhere to go (trips.js): ${r.bound} of ${r.cars - r.buses} cars bound for one of ${r.places} places (seven in ten are; the rest take what comes), ${r.tripsEnded} trips ended and begun again, ${r.fields} fields worked out`],
      [r.cameIn > 0 && r.wentOut > 0, `traffic came in and went out round ${x}, ${y}: ${r.cameIn} in, ${r.wentOut} out in ${MIN} min; ${r.cars} vehicles alive, ${r.buses} buses`],
    ];
    for (const [ok, what] of checks) { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) bad++; }
    if (process.env.OUT) { fs.mkdirSync(process.env.OUT, { recursive: true }); await p.evaluate(() => window.__game.hold(false)); await p.waitForTimeout(1500); await p.screenshot({ path: `${process.env.OUT}/watch_${x}_${y}${process.env.PHONE ? '_phone' : ''}.png` }); await p.evaluate(() => window.__game.hold(true)); }
  }
  await b.close();
  process.exit(bad ? 1 : 0);
})();
