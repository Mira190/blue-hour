// The road network driven (issue 167): your own car on the autopilot, with the traffic running, takes every piece of
// the game's road graph within RADIUS of the start once, a leg at a time to the nearest piece not yet driven, and
// the run fails where
//   no route    the routes find no way to a piece the plan says is open (pipeline/road_plan.py)
//   stood       the car stands 150 s on a leg (a wall, a jam that does not clear) or the autopilot hands it back
//   off         the car's middle is further from the road's line than the carriageway is wide
//   wall        the car's body is in a building's solid
// A leg's pieces are counted as it passes them, so most legs drive several.
//   xvfb-run -a node tools/road_drive.js shibuya [radius=320]        (MINUTES=40 of the game's time at most; LOG=1)
// An errand's drive instead: TO=x,y FROM="x,y;x,y;x,y" drives from each start (the car brought to the kerb there, as
// the C key does) to the place, and fails if one does not arrive within r=35 m; OUT=dir takes a still every EVERY=8 s
// of each drive. PHONE=1 plays a phone's district.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const { startPlay } = require('./start_play');
const { pinClock } = require('./pin_clock');
const [,, city = 'shibuya', RADIUS = '320'] = process.argv;
const TO = process.env.TO ? process.env.TO.split(',').map(Number) : null;
const FROM = (process.env.FROM || '').split(';').filter(Boolean).map(s => s.split(',').map(Number));
const OUT = process.env.OUT, EVERY = +(process.env.EVERY || 8);

// (in the page) into the driver's seat of your car, brought to the kerb at (x, y) when given
function seatAt(at) {
  const g = window.__game, car = g.myCar(), st = car.D.st;
  if (g.pilot()) g.pilotOff();
  if (g.player.mode === 'car') { g.exitCar(); for (let t = 0; t < 12 && g.player.mode !== 'foot'; t += 0.5) g.advance(0.5); }
  if (at) {
    const q = g.roadNet.nearest(at[0], at[1], 60);
    if (!q) return `no road within 60 m of ${at}`;
    g.hopTo(q.x, q.y, q.z, 'the kerb');
    for (let t = 0; t < 10 && (g.arriving() || g.cine.active); t += 0.25) g.advance(0.25);
    g.advance(1);
    if (g.player.mode !== 'foot') return `not on foot at ${at} (${g.player.mode})`;
    g.bringCar();
    for (let t = 0; t < 30 && g.carComing(); t += 0.5) g.advance(0.5);
    g.advance(1);
  }
  for (let k = 0; k < 2 && g.player.mode !== 'car'; k++) {
    const s = (g.KEEP === 'left' ? 1 : -1) * (k ? -1 : 1);
    g.player.x = st.x + Math.cos(st.h) * 2.6 * s; g.player.y = st.y - Math.sin(st.h) * 2.6 * s; g.player.z = st.z;
    g.advance(0.3);
    g.enterCar();
    for (let i = 0; i < 24 && g.player.mode !== 'car'; i++) g.advance(0.5);
  }
  return g.player.mode === 'car' ? null : `could not get into the car at ${st.x.toFixed(0)}, ${st.y.toFixed(0)}`;
}

// (in the page) one stretch of a drive: up to `secs` of the game's time, or to the leg's end. Returns what happened.
function driveFor({ secs, mark }) {
  const g = window.__game, car = g.myCar(), st = car.D.st, L = g.roadNet.L, HALF = { motorway: 7, trunk: 6, primary: 6, secondary: 5, tertiary: 4.5, residential: 3.5, unclassified: 3 };
  const S = window.__drive || (window.__drive = { stood: 0, t: 0, seen: {}, bad: [] });
  const out = { done: null };
  for (let t = 0; t < secs; t += 0.5) {
    if (!g.pilot()) { out.done = g.pilotEnd ? g.pilotEnd() || 'ended' : 'ended'; break; }
    g.advance(0.5);
    S.t += 0.5;
    S.stood = st.speed < 0.3 ? S.stood + 0.5 : 0;
    const q = g.roadNet.nearest(st.x, st.y, 14, st.z, 4);
    if (q) {
      if (mark && q.d < 4) S.seen[q.line] = 1;
      const o = g.pilot();
      if (o && !o.join && q.d > (HALF[L[q.line].c] || 3.5) + 1.5 && !(o.drv.st.why || '').match(/kerb|park|pull/)) S.bad.push({ what: 'off', x: +st.x.toFixed(0), y: +st.y.toFixed(0), d: +q.d.toFixed(1), c: L[q.line].c });
    }
    if ((car.D.st.wedged || 0) > 3 && !S.wallT) { S.wallT = 1; S.bad.push({ what: 'wall', x: +st.x.toFixed(0), y: +st.y.toFixed(0) }); } // (its body held in a wall for over 3 s, cars.js drive)
    if (!(car.D.st.wedged > 0)) S.wallT = 0;
    if (S.stood >= 150) { const o = g.pilot(); out.done = 'stood'; out.why = o ? `${o.join ? 'joining' : o.drv.st.why || '?'}` : ''; S.stood = 0; break; }
  }
  out.at = [+st.x.toFixed(1), +st.y.toFixed(1)]; out.v = +st.speed.toFixed(1); out.t = S.t;
  return out;
}

(async () => {
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const ctx = await b.newContext(process.env.PHONE ? { ...devices['iPhone 13'] } : { viewport: { width: +(process.env.W || 1100), height: +(process.env.H || 650) } });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('pageerror', String(e).slice(0, 400)));
  await p.addInitScript(() => { try { localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } }); // (no first-run tour over the picture)
  await pinClock(p, city);
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-${city}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.cars', null, { timeout: 400000 });
  await p.evaluate(async () => { const g = window.__game; g.hold(true, true); await g.ways.build(); if (g.lateReady) await g.lateReady(); });
  await startPlay(p, { asIs: !!process.env.ASIS }); // (ASIS=1: at the hour GAME_TIME gives, in real time; else a morning that runs)
  await p.evaluate(() => { const g = window.__game; for (let t = 0; g.arriving() && t < 10; t += 0.25) g.advance(0.25); g.advance(2); });
  await p.waitForFunction(() => window.__game.myCar && window.__game.myCar(), null, { timeout: 180000 });
  let bad = 0;
  const tag = process.env.PHONE ? '_phone' : '';
  if (TO) {
    if (OUT) fs.mkdirSync(OUT, { recursive: true });
    for (let k = 0; k < FROM.length; k++) {
      const no = await p.evaluate(seatAt, FROM[k]);
      if (no) { console.log(`FAIL start ${k + 1} (${FROM[k]}): ${no}`); bad++; continue; }
      const leg = await p.evaluate(({ to }) => { const g = window.__game, st = g.myCar().D.st; window.__drive = null; const ok = g.pilotTo({ id: 'errand', name: 'the errand', at: to }, { quiet: true }); return { ok, len: ok ? g.pilot().len : 0, turns: ok ? g.pilot().turns.length - 1 : 0, from: [+st.x.toFixed(0), +st.y.toFixed(0)] }; }, { to: TO });
      if (!leg.ok) { console.log(`FAIL start ${k + 1} (${FROM[k]}): no road from there reaches ${TO}`); bad++; continue; }
      let r = null, n = 0;
      for (let t = 0; t < 600; t += EVERY) {
        r = await p.evaluate(driveFor, { secs: EVERY, mark: false });
        if (OUT) { await p.evaluate(() => window.__game.frame(0)); await p.waitForTimeout(400); await p.screenshot({ path: `${OUT}/drive${k + 1}${tag}_${String(n++).padStart(2, '0')}.png` }); }
        if (r.done) break;
      }
      const d = Math.hypot(r.at[0] - TO[0], r.at[1] - TO[1]), S = await p.evaluate(() => window.__drive);
      const ok = d <= 35 && !S.bad.length;
      console.log(`${ok ? 'ok  ' : 'FAIL'} start ${k + 1}: from ${leg.from} by road ${Math.round(leg.len)} m with ${leg.turns} turn${leg.turns === 1 ? '' : 's'}, ${r.t.toFixed(0)} s; ended ${d.toFixed(0)} m from ${TO} (${r.done || 'still driving'}${r.why ? ', ' + r.why : ''})${S.bad.length ? ' ' + JSON.stringify(S.bad.slice(0, 4)) : ''}`);
      if (!ok) bad++;
    }
    await b.close();
    process.exit(bad ? 1 : 0);
  }
  // ---- every piece within the radius
  const plan = await p.evaluate(R => {
    const g = window.__game, L = g.roadNet.L, av = g.roadNet.avoid, [sx, sy] = g.G.start.at, want = [];
    L.forEach((l, i) => {
      const n = l.pts.length / 3, k = n >> 1, x = l.pts[3 * k], y = l.pts[3 * k + 1];
      if ((av && av[i]) || l.c === 'motorway' || (l.deck && Array.prototype.some.call(l.deck, Boolean)) || l.len < 12 || Math.hypot(x - sx, y - sy) > R) return;
      want.push({ i, x, y, len: l.len, c: l.c, quiet: l.quiet });
    });
    return want;
  }, +RADIUS);
  const no = await p.evaluate(seatAt, null);
  if (no) { console.log(`FAIL ${no}`); await b.close(); process.exit(1); }
  const left = new Map(plan.map(w => [w.i, w])), fails = [], LIMIT = +(process.env.MINUTES || 40) * 60;
  let t = 0, legs = 0;
  while (left.size && t < LIMIT) {
    const st = await p.evaluate(() => { const s = window.__game.myCar().D.st; return [s.x, s.y]; });
    const next = [...left.values()].sort((a, b) => Math.hypot(a.x - st[0], a.y - st[1]) - Math.hypot(b.x - st[0], b.y - st[1]))[0];
    const ok = await p.evaluate(w => { const g = window.__game; if (g.player.mode !== 'car') return 'not at the wheel'; return g.pilotTo({ id: 'piece', name: `piece ${w.i}`, at: [w.x, w.y] }, { quiet: true }) ? null : 'no route'; }, next);
    if (ok) {
      // (right here already, or no way: a piece under the car counts as driven; else it is a failure of the routes)
      const here = Math.hypot(next.x - st[0], next.y - st[1]) < 40;
      if (!here) fails.push({ what: ok, piece: next.i, c: next.c, at: [Math.round(next.x), Math.round(next.y)], quiet: next.quiet });
      left.delete(next.i);
      if (ok === 'not at the wheel') { const s = await p.evaluate(seatAt, null); if (s) { fails.push({ what: s }); break; } }
      continue;
    }
    legs++;
    let r = null;
    for (let k = 0; k < 40; k++) { r = await p.evaluate(driveFor, { secs: 15, mark: true }); if (r.done) break; }
    t = r.t;
    const seen = await p.evaluate(() => { const s = Object.keys(window.__drive.seen).map(Number); window.__drive.seen = {}; return s; });
    for (const i of seen) left.delete(i);
    if (r.done === 'stood' || r.done === 'blocked' || !r.done) {
      fails.push({ what: r.done || 'a leg of over 10 minutes', why: r.why || '', at: r.at, to: next.i });
      await p.evaluate(() => { const g = window.__game; if (g.pilot()) g.pilotOff(); g.resetCar && g.resetCar(); g.advance(2); });
    }
    left.delete(next.i);
    if (process.env.LOG) console.log(`leg ${legs} to piece ${next.i} (${next.c}): ${r.done} at ${r.at}, ${left.size} left, ${Math.round(t)} s`);
  }
  const S = await p.evaluate(() => window.__drive || { bad: [] });
  const km = plan.reduce((a, w) => a + w.len, 0) / 1000, leftKm = [...left.values()].reduce((a, w) => a + w.len, 0) / 1000;
  const checks = [
    [left.size === 0, `every piece within ${RADIUS} m of the start driven: ${plan.length - left.size} of ${plan.length} (${(km - leftKm).toFixed(1)} of ${km.toFixed(1)} km) in ${legs} legs, ${(t / 60).toFixed(0)} min of the game's time`],
    [!fails.some(f => f.what === 'no route'), `the routes reach every open piece (${fails.filter(f => f.what === 'no route').length} not reached) ${JSON.stringify(fails.filter(f => f.what === 'no route').slice(0, 6))}`],
    [!fails.some(f => f.what !== 'no route'), `the car never stood for good nor was handed back (${fails.filter(f => f.what !== 'no route').length}) ${JSON.stringify(fails.filter(f => f.what !== 'no route').slice(0, 6))}`],
    [!S.bad.length, `the car kept to the carriageway and out of the walls (${S.bad.length}) ${JSON.stringify(S.bad.slice(0, 6))}`],
  ];
  for (const [ok, what] of checks) { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) bad++; }
  await b.close();
  process.exit(bad ? 1 : 0);
})();
