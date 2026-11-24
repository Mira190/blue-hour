// A car stood at its line for the lane (issue 198): the roads check's drive from start 3 went over its time behind a queue
// whose head stood a hundred seconds and more at junction 1978 arm 0 (424,-1006, no lights) with the reason 'lane'. This
// plays the walk's traffic at the check's hour, with the player stood on foot at a place (the junction by default), and
// every half second of the game reads every car stood at a line with that reason: once one has stood LONG seconds (10),
// what decides it is printed (actors.js traffic(), the stop-line block's inLane): its lane, its offset against that
// lane's, the lanes its chosen way out leaves from, whether it is let into the junction, and its other ways out.
//   python3 -m http.server 8800 --directory web &
//   GAME_TIME=17:57 xvfb-run -a node tools/lane_wait.js [seconds=600] [x,y]
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const { pinClock } = require('./pin_clock');
const [,, secs = '600', at = '440,-1012'] = process.argv;
const LONG = +process.env.LONG || 10;
(async () => {
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await (await b.newContext({ viewport: { width: 1100, height: 650 } })).newPage();
  p.on('pageerror', e => console.log('pageerror', String(e).slice(0, 400)));
  await p.addInitScript(() => { try { localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } });
  await pinClock(p, 'shibuya');
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.cars', null, { timeout: 400000 });
  await p.evaluate(async () => { const g = window.__game; g.hold(true, true); await g.ways.build(); if (g.lateReady) await g.lateReady(); });
  await startPlay(p, { asIs: !!process.env.ASIS });
  await p.evaluate(([x, y]) => { const g = window.__game; for (let t = 0; g.arriving() && t < 10; t += 0.25) g.advance(0.25); const pl = g.player; pl.x = x; pl.y = y; const f = g.nav.floorAt(x, y, g.nav.terrain(x, y) + 1); pl.z = f ? f.z : g.nav.terrain(x, y); g.advance(2); window.__lw = { seen: new Map() }; }, at.split(',').map(Number));
  for (let t = 0; t < +secs; t += 5) {
    await p.evaluate(LONG => {
      const g = window.__game, C = g.cars.C, JN = g.junctions, W = window.__lw;
      for (let k = 0; k < 10; k++) {
        g.advance(0.5);
        for (let i = 0; i < C.length; i++) {
          const c = C[i]; if (c.line < 0 || c.why !== 'lane' || (c.v || 0) > 0.6) { if (W.seen.has(i) && !W.seen.get(i).done) W.seen.get(i).end = g.clock.min; continue; }
          let s = W.seen.get(i); if (!s || s.done || s.end != null) { s = { t: 0 }; W.seen.set(i, s); }
          s.t += 0.5;
          if (s.t >= LONG && !s.out) {
            const l = g.roadNet ? null : null, side = c.dir === 1 ? 1 : -1, jA = c.lineArm, jE = c.lineEx, L = g.cars.netL ? g.cars.netL[c.line] : null;
            const shift = JN && JN.shiftOf && L ? JN.shiftOf(L, c.ln || 0) : null;
            s.out = { car: i, at: [+c.x.toFixed(1), +c.y.toFixed(1)], j: jA && jA.j ? jA.j.id : null, arm: jA ? jA.i ?? jA.k ?? null : null, line: c.line, dir: c.dir, ln: c.ln, lo: +(c.lo || 0).toFixed(2), laneLo: shift == null ? null : +(side * shift).toFixed(2),
              lanesOfLine: L && JN.lanesOf ? JN.lanesOf(L) : null, exLanes: jE && jE.lanes ? jE.lanes.slice() : null, exTurn: jE ? +(jE.turn || 0).toFixed(2) : null, mv: !!c.mv, mv0: !!c.mv0, anyLane: c.anyLane === jA, toLine: c.toLine == null ? null : +(c.toLine - c.half).toFixed(1),
              roomT: +(c.roomT || 0).toFixed(1), nose: c.nose ?? null, lnWait: +(c.lnWait || 0).toFixed(1), lcT: +(c.lcT || 0).toFixed(1), beside: C.filter(o => o !== c && o.line === c.line && o.dir === c.dir && Math.abs(o.s - c.s) < 8).map(o => ({ ds: +((o.s - c.s) * c.dir).toFixed(1), ln: o.ln, lo: +(o.lo || 0).toFixed(2), v: +(o.v || 0).toFixed(1), why: o.why })), reroutes: c.reroutes || 0, exits: jA && JN.exits ? JN.exits(jA).map(e => ({ lanes: e.lanes, turn: +e.turn.toFixed(2), rank: e.m && e.m.rank, closed: JN.closedNow ? !!JN.closedNow(e) : null })) : null };
          }
        }
      }
    }, LONG);
  }
  const R = await p.evaluate(() => [...window.__lw.seen.values()].filter(s => s.out).map(s => Object.assign({ stood: s.t }, s.out)));
  console.log(`lane_wait: ${R.length} cars stood ${LONG} s or more at a line for the lane`);
  for (const r of R) console.log(JSON.stringify(r));
  await b.close();
})();
