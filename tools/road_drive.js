// The road network driven (issue 167): your own car on the autopilot, with the traffic running, takes every piece of
// the game's road graph within RADIUS of the start once, a leg at a time to the nearest piece not yet driven, and
// the run fails where
//   no route    the routes find no way to a piece the plan says is open (pipeline/road_plan.py)
//   stood       the car stands 150 s on a leg (a wall, a jam that does not clear) or the autopilot hands it back
//   off         the car's middle is further from the road's line than the carriageway is wide
//   wall        the car's body is in a building's solid
// A leg's pieces are counted as it passes them, so most legs drive several.
//   xvfb-run -a node tools/road_drive.js shibuya [radius=320]        (MINUTES=40 of the game's time at most; LOG=1)
// TRACE=1 prints each stand of a drive (when, where, how long, why, and the light it stood at); TIMED=1 fails a drive
// that takes longer than its road at 6 m/s and one cycle of each scramble on its way, or than its start's own figure
// ("x,y@180") (issue 175).
// An errand's drive instead: TO=x,y FROM="x,y;x,y;x,y" drives from each start (the car brought to the kerb there, as
// the C key does) to the place, and fails if one does not arrive within r=35 m; OUT=dir takes a still every EVERY=8 s
// of each drive. PHONE=1 plays a phone's district.
const { chromium, devices } = require('playwright');
const fs = require('fs');
const { startPlay } = require('./start_play');
const { pinClock } = require('./pin_clock');
const [,, city = 'shibuya', RADIUS = '320'] = process.argv;
const TO0 = process.env.TO ? process.env.TO.split(',').map(Number) : null, TO = TO0;
// (a start may name its own place to drive to, "x,y>x,y": the drive back across the Scramble beside the drives to 109)
const FROM = (process.env.FROM || '').split(';').filter(Boolean).map(s => { const [ab, cap] = s.split('@'), [a, b] = ab.split('>'), f = a.split(',').map(Number); if (b) f.to = b.split(',').map(Number); if (cap) f.cap = +cap; return f; });
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
    if (!g.pilot()) { out.done = g.pilotEnd ? g.pilotEnd() || 'ended' : 'ended'; if (out.done === 'blocked') out.why = (S.last || '') + ' | round it: ' + (S.round || ''); break; }
    g.advance(0.5);
    { const o = g.pilot(); if (o && (o.stoodT || 0) > 40) { const R = []; for (const q of g.cars.C) { if (q.line < 0) continue; const dd = Math.hypot(q.x - st.x, q.y - st.y); if (dd < 9) R.push(`car ${g.cars.C.indexOf(q)}${q.bus ? ' bus' : ''} ${dd.toFixed(1)} m at ${q.x.toFixed(0)},${q.y.toFixed(0)} v ${(q.v || 0).toFixed(1)} ${q.why || ''}${q.heldBy ? '/' + q.heldBy : ''}${q.front ? ' front ' + (g.cars.C.includes(q.front) ? g.cars.C.indexOf(q.front) : 'other') : ''}`); } S.round = R.join('; ') + ` | wedged ${(o.drv.st.wedged || 0).toFixed(0)} junction ${o.drv.st.junction || ''} mv ${o.drv.st.mv ? 'j' + o.drv.st.mv.j.id : '-'}`; } }
    { const o = g.pilot(); if (o) { const d = o.drv.st, bl = d.block; S.last = `${o.join ? 'joining ' + (o.joinWhy || '') : d.why || '?'}${o.turn ? ' turning' : ''} stood ${(o.stoodT || 0).toFixed(0)} s, crawl ${o.crawl ? o.crawl.t.toFixed(0) : 0} s, at ${st.x.toFixed(0)},${st.y.toFixed(0)}${bl ? `, behind ${bl.walker ? 'a person' : g.cars.C.includes(bl) ? (() => { const ch = []; for (let q = bl, n = 0; q && n < 6; n++) { const i = g.cars.C.indexOf(q); if (i < 0) { ch.push(q === car.C ? 'MY CAR' : 'other'); break; } ch.push(`car ${i}${q.bus ? ' (bus)' : ''}${q.park ? ' parked' : ''} at ${q.x.toFixed(0)},${q.y.toFixed(0)} v ${(q.v || 0).toFixed(1)} ${q.why || ''}${q.heldBy ? '/' + q.heldBy : ''}${q.mv ? ' in j' + q.mv.j.id : q.lineArm ? ' at j' + q.lineArm.j.id : ''}`); q = q.front; } return ch.join(' < '); })() : bl.id || 'something'}` : ''}`; } }
    S.t += 0.5;
    S.stood = st.speed < 0.3 ? S.stood + 0.5 : 0;
    // (what it stands behind: the car ahead, and the head of that car's queue: where, why it stands, the line it waits at and its light)
    const behind = bl => {
      if (!bl) return '';
      if (bl.walker) return ' behind someone on foot';
      if (!g.cars.C.includes(bl)) return ` behind ${bl.id || 'something'}`;
      let h = bl; for (let n = 0; n < 12 && h.front && g.cars.C.includes(h.front) && h.front !== bl; n++) h = h.front;
      const one = q => `${q.bus ? 'bus' : q.park ? 'parked car' : 'car'} at ${Math.round(q.x)},${Math.round(q.y)} v ${(q.v || 0).toFixed(1)} ${q.why || '?'}${q.heldBy ? '/' + q.heldBy : ''} still ${Math.round(q.still || 0)} s${q.mv ? ` in j${q.mv.j.id}` : ''}${q.lineArm ? ` for j${q.lineArm.j.id}${q.lineArm.j.lead ? ' (run from j' + q.lineArm.j.lead.id + ')' : ''} arm ${q.lineArm.i} light ${g.junctions.light(q.lineArm, q.lineEx)}${q.ex2 && q.ex2.a ? ` then j${q.ex2.a.j.id} light ${g.junctions.light(q.ex2.a, q.ex2.e)}` : ''}` : ''}`;
      return ` behind a ${one(bl)}${h !== bl ? `; the head of its queue: ${one(h)}` : ''}`;
    };
    { const o = g.pilot(), d = o && o.drv.st, a = d && d.lineAt, j = a && a.j; // (TRACE=1: where the time went, and at which light)
      (S.tr || (S.tr = [])).push([S.t, Math.round(st.x), Math.round(st.y), +st.speed.toFixed(1), d ? `${d.junction || ''}|${d.why || ''}${st.speed < 0.3 ? behind(d.block) : ''}` : '', j && st.speed < 0.3 ? `j${j.id}${j.scramble ? ' scramble' : ''} arm ${a.i} ${j.sig ? `ph ${j.ph}${j.st} ${j.t.toFixed(0)} s` : "no lights"}${d.junction === 'cross' || d.junction === 'walk' || d.junction === 'turn' ? ` busy ${j.busy || 0}; in the box: ${j.active.map(q => `arm ${q.k}>${q.m} ${q.c.bus ? 'bus ' : ''}${q.c === d ? 'ME ' : ''}at ${Math.round(q.c.x)},${Math.round(q.c.y)} v ${(q.c.v || 0).toFixed(1)} ${q.c.why || ''} still ${(q.c.still || 0).toFixed(0)}`).join('; ')}; waiting: ${j.pend.map(q => `arm ${q.k}>${q.m} ${q.c.why || ''}`).join('; ')}` : ''}` : '']); }
    const q = g.roadNet.nearest(st.x, st.y, 14, st.z, 4);
    if (q) {
      if (mark && q.d < 4) S.seen[q.line] = 1;
      const o = g.pilot();
      if (o && !o.join && q.d > (HALF[L[q.line].c] || 3.5) + 1.5 && !(o.drv.st.why || '').match(/kerb|park|pull/)) S.bad.push({ what: 'off', x: +st.x.toFixed(0), y: +st.y.toFixed(0), d: +q.d.toFixed(1), c: L[q.line].c });
    }
    if ((car.D.st.wedged || 0) > 3 && !S.wallT) { S.wallT = 1; S.bad.push({ what: 'wall', x: +st.x.toFixed(0), y: +st.y.toFixed(0) }); } // (its body held in a wall for over 3 s, cars.js drive)
    if (!(car.D.st.wedged > 0)) S.wallT = 0;
    if (S.stood >= 150) { const o = g.pilot(); out.done = 'stood'; out.why = o ? `${o.join ? 'joining' : o.drv.st.why || '?'}` : '';
      // (what holds it: the thing it waits on, and who stands within 5 m of it)
      const bl = o && o.drv.st.block, near = [];
      for (const n of g.npcs) if (Math.hypot(n.x - st.x, n.y - st.y) < 5) near.push(`${n.id || n.name} at ${n.x.toFixed(1)},${n.y.toFixed(1)}${g.nav.carriageway ? ` (carriageway ${g.nav.carriageway(n.x, n.y)})` : ''}`);
      if (g.crowd && g.crowd.P) for (let i = 0; i < Math.min(g.crowd.active, g.crowd.P.length); i++) { const q = g.crowd.P[i]; if (Math.hypot(q.x - st.x, q.y - st.y) < 5) near.push(`walker ${i} at ${q.x.toFixed(1)},${q.y.toFixed(1)} line ${q.line} v ${(q.v || 0).toFixed(1)}`); }
      out.why += bl ? ` | waits on ${bl.walker ? 'a person' : g.cars.C.includes(bl) ? `car ${g.cars.C.indexOf(bl)}${bl.bus ? ' (bus)' : ''} v ${(bl.v || 0).toFixed(1)} ${bl.why || ''}${bl.park ? ' parked' : ''}` : bl.id || 'something'}` : '';
      if (near.length) out.why += ` | near: ${near.join('; ')}`;
      S.stood = 0; break; }
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
    const cycle = await p.evaluate(() => Math.max(60, ...window.__game.junctions.scrambles.map(j => j.cycle || 0)));
    for (let k = 0; k < FROM.length; k++) {
      const no = await p.evaluate(seatAt, FROM[k]);
      if (no) { console.log(`FAIL start ${k + 1} (${FROM[k]}): ${no}`); bad++; continue; }
      const TO = FROM[k].to || TO0;
      const leg = await p.evaluate(({ to }) => { const g = window.__game, st = g.myCar().D.st; window.__drive = null; const ok = g.pilotTo({ id: 'errand', name: 'the errand', at: to }, { quiet: true });
        // (the scrambles on its way, each with the junctions run from it: one cycle of each is the most their lights can cost it)
        let cyc = 0; if (ok) { const S = new Set(); for (const nd of g.pilot().drv.st.route.nodes || []) { const a = g.junctions.armAt(nd.line, nd.end), j = a && a.in ? a.j.lead || a.j : null; if (j && j.scramble && j.cycle && !S.has(j)) { S.add(j); cyc += j.cycle; } } }
        return { ok, cyc, len: ok ? g.pilot().len : 0, turns: ok ? g.pilot().turns.length - 1 : 0, from: [+st.x.toFixed(0), +st.y.toFixed(0)] }; }, { to: TO });
      if (!leg.ok) { console.log(`FAIL start ${k + 1} (${FROM[k]}): no road from there reaches ${TO}`); bad++; continue; }
      let r = null, n = 0;
      for (let t = 0; t < 600; t += EVERY) {
        r = await p.evaluate(driveFor, { secs: EVERY, mark: false });
        if (OUT) { await p.evaluate(() => window.__game.frame(0)); await p.waitForTimeout(400); await p.screenshot({ path: `${OUT}/drive${k + 1}${tag}_${String(n++).padStart(2, '0')}.png` }); }
        if (r.done) break;
      }
      const d = Math.hypot(r.at[0] - TO[0], r.at[1] - TO[1]), S = await p.evaluate(() => window.__drive);
      // (TIMED=1, issue 175: a drive takes no longer than its road at 6 m/s and one whole cycle of each scramble on its
      // way, 118 s at Shibuya's and 63 at 109's fork; and no longer than the figure its start names, "x,y@180": the
      // 364 m from SKY GATE across the Scramble to 109, which took 401 s, in the three minutes the issue asks)
      const limit = process.env.TIMED ? Math.min(leg.len / 6 + (leg.cyc || cycle), FROM[k].cap || Infinity) : Infinity, slow = r.t > limit;
      const ok = d <= 35 && !S.bad.length && !slow;
      if (process.env.TRACE) { // (each stand of 3 s or more: when, where, how long, why at its start and its end, the light then)
        let run = null; const put = r => { if (r && r.n >= 6) console.log(`   stood ${String(r.n / 2).padStart(5)} s from ${String(r.t).padStart(5)} s at ${r.x},${r.y}: ${r.why} [${r.j}] ... ${r.why1} [${r.j1}]`); };
        for (const [t, x, y, v, why, j] of S.tr || []) { if (v < 0.3) { if (!run) run = { t, x, y, n: 0, why, j }; run.n++; run.why1 = why; run.j1 = j; } else { put(run); run = null; } }
        put(run);
      }
      console.log(`${ok ? 'ok  ' : 'FAIL'} start ${k + 1}: from ${leg.from} by road ${Math.round(leg.len)} m with ${leg.turns} turn${leg.turns === 1 ? '' : 's'}, ${r.t.toFixed(0)} s${process.env.TIMED ? ` (${slow ? 'over' : 'within'} ${limit.toFixed(0)} s)` : ''}; ended ${d.toFixed(0)} m from ${TO} (${r.done || 'still driving'}${r.why ? ', ' + r.why : ''})${S.bad.length ? ' ' + JSON.stringify(S.bad.slice(0, 4)) : ''}`);
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
