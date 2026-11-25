// The planned area's edge (web/game/bounds.js; docs/BOUNDS.md), walked, driven and flown at from several sides on the
// walk (the title's way in, at the hour it is set), and fails if:
//   - the page has no edge (no game.bounds, or none made), no street crosses it, anything is drawn across a crossing (the
//     owner, 25 November 2026: no road works at the edge, the roads and their traffic run on past it), or a street
//     across it is shut to the traffic;
//   - on foot, walked at the edge along a street that crosses it, the player ends past it, is stopped dead (from a run
//     to a stand in one step), or stands pressed against it without being turned back in within ten seconds;
//   - by car, driven straight at the edge where a street crosses it, the car's nose passes the edge, it is braked harder than a firm stop
//     (13 m/s²), or it cannot back away from them;
//   - in the helicopter, flown straight out from the middle, it ends past the air's edge, is not turned back in an
//     arc (its speed fell to a hover, or it turned on the spot), or it climbs over the ceiling with the key held;
//   - the rides' destinations, the autopilot's or the map's places offer anywhere past the ground's edge.
// Stills of each edge (the crossing from the walker, the car at its stop, the helicopter in its turn) in out_dir.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/bounds_check.js out_dir [WxH] [hour]      (390x844: a phone; hour blue|night|live, blue by default)
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/bounds-check', size = '1440x900', hour = 'blue'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number), phone = w < 500, tag = phone ? 'phone' : 'desk';
  const args = process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
  const p = await ctx.newPage();
  const errors = [];
  const fail = m => { errors.push(m); console.log(`FAIL ${m}`); };
  const ok = m => console.log(`ok   ${m}`);
  p.on('pageerror', e => fail(`pageerror: ${String(e).slice(0, 200)}`));
  p.on('crash', () => fail('the page crashed'));
  fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); localStorage.setItem('bh-player', 'kagami'); localStorage.setItem('bh-walk-intro', '1'); } catch (e) { /* storage blocked */ } }, process.env.TIER || (phone ? 'low' : 'high'));
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?overture=0`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  const shot = async n => { if (process.env.STILLS === '0') return; await p.waitForTimeout(1200); await p.screenshot({ path: `${out}/${tag}-${n}.png`, timeout: 180000 }).catch(() => console.log(`(no still ${n})`)); };

  const info = await p.evaluate(async hr => {
    const g = window.__game, B = g.bounds && g.bounds();
    if (!B) return { none: true };
    if (g.lateReady) await g.lateReady();
    g.hold(true);
    g.walkStart({ t: hr, w: 'clear' });
    for (let i = 0; i < 40; i++) { g.advance(0.25); if (g.dlg.open) g.dlg.quit(); }
    const roads = B.works.filter(c => !c.foot), foot = B.works.filter(c => c.foot);
    const L = g.cars.netL, edge = L.filter(l => l.edge), shut = edge.filter(l => (l.tb || []).length).length;
    return { closed: B.closed, works: B.works.length, roads: roads.length, foot: foot.length, mode: g.player.mode, drawn: (() => { let r = g.world; while (r && r.parent) r = r.parent; return !!(r && r.getObjectByName('bounds-works')); })(), shut };
  }, hour);
  if (info.none) { fail('the walk has no edge (game.bounds, bounds.js)'); await b.close(); process.exit(1); }
  if (!info.closed || !info.roads) fail(`no street crosses the edge (${info.closed} pieces, ${info.roads} crossings)`);
  else if (info.drawn) fail('road works drawn at the edge (bounds-works): nothing is drawn across a crossing');
  else if (info.shut) fail(`${info.shut} streets across the edge shut to the traffic: they are open, only your routes keep off them`);
  else ok(`the edge: ${info.closed} streets across it open to the traffic and left out of your routes, ${info.works} crossings (${info.roads} streets, ${info.foot} footways), nothing drawn on them`);

  // the sides: of the streets' works, the widest facing each quarter, so the edge is met from four ways
  const reach = { foot: [], car: [] };
  const sides = await p.evaluate(() => {
    const B = window.__game.bounds(), q = {};
    for (const c of B.works.filter(c => !c.foot && c.cos > 0.6)) {
      const k = Math.round(Math.atan2(c.e.nx, c.e.ny) / (Math.PI / 2)) & 3;
      (q[k] = q[k] || []).push(c);
    }
    // (the widest first, and two more of that side for where a wall or a bend comes before the edge)
    return Object.entries(q).flatMap(([k, l]) => l.sort((a, b) => b.w - a.w).slice(0, 3).map((c, i) => ({ alt: i,  k: ['north', 'east', 'south', 'west'][k], x: c.x, y: c.y, z: c.z, nx: c.e.nx, ny: c.e.ny, rx: c.rx, ry: c.ry, w: c.w, c: c.c })));
  });
  const done = { foot: new Set(), car: new Set() }; // (a side met: its other streets not tried)
  const nSides = new Set(sides.map(s => s.k)).size;

  // (ONLY=foot|car|heli|offer: one part, while working on it)
  const only = k => !process.env.ONLY || process.env.ONLY.split(',').includes(k);
  await p.evaluate(() => { const g = window.__game; if (g.dlg.open) g.dlg.quit(); });
  // ---------------------------------------------------------------- on foot
  for (const sd of only('foot') ? sides : []) {
    if (done.foot.has(sd.k)) continue;
    if (sd.skipFoot) continue;
    const r = await p.evaluate(sd => {
      const g = window.__game, B = g.bounds(), P = g.player;
      if (P.mode !== 'foot' && g.exitCar && P.mode === 'car') g.exitCar();
      let at = null;
      for (const d of [26, 30, 22, 34, 18, 40]) { const x = sd.x - sd.rx * d, y = sd.y - sd.ry * d, wk = g.nav.walk(x, y, sd.z + 0.5, true); if (wk.ok) { at = [x, y, wk.z]; break; } }
      if (!at) return { skip: 'nowhere to stand' };
      [P.x, P.y, P.z] = at; P.speed = 0; P.h = Math.atan2(sd.rx, sd.ry);
      Object.assign(g.cam, { yaw: Math.atan2(sd.rx, sd.ry), yawTo: null, pitchTo: null });
      g.advance(0.2);
      const T = [];
      let maxS = -1e9, dead = 0, deadAt = [], prevV = 0, x0 = P.x, y0 = P.y, reached = false, backIn = null;
      g.keys.add('KeyW');
      for (let i = 0; i < 120; i++) { // 24 s, a step 0.2 s, the camera's ease run too (g.frame)
        const px = P.x, py = P.y;
        for (let k = 0; k < 6; k++) g.frame(1 / 30);
        g.advance(0);
        const v = Math.hypot(P.x - px, P.y - py) / 0.2, s = B.sd(P.x, P.y).s;
        if (prevV > 2.5 && v < 0.3 && s > -12) { /* (in the edge's band: a wall met further in is the game's own walk) */ dead++; deadAt.push([i, +s.toFixed(1), B.stats.turned, g.crowd && g.crowd.nearest ? g.crowd.nearest(P.x, P.y, 0.7) : -2]); }
        prevV = v; maxS = Math.max(maxS, s);
        if (s > -7) reached = true;
        if (reached && backIn === null && s < Math.min(-4, maxS - 4)) backIn = i * 0.2; /* (four metres back in from the nearest) */
        T.push([+P.x.toFixed(1), +P.y.toFixed(1), +s.toFixed(1)]);
      }
      g.keys.delete('KeyW');
      const why = { mode: P.mode, auto: !!P.auto, ground: P.ground, state: B.state(), room: g.room ? (g.room() || {}).name || null : null, held: g.held ? g.held() : null, dlg: g.dlg.open };
      return { why, maxS, dead, deadAt, T: T.filter((_, i) => i % 10 === 0), reached, backIn, moved: Math.hypot(P.x - x0, P.y - y0), last: T[T.length - 1], stats: Object.assign({}, B.stats) };
    }, sd);
    const name = `on foot at the ${sd.k} edge (${sd.c})`;
    if (r.skip) { console.log(`skip ${name}: ${r.skip}`); continue; }
    if (r.reached) done.foot.add(sd.k);
    if (!r.reached) { reach.foot.push(sd.k); console.log(`note ${name}: did not reach the edge (a wall first), ends ${JSON.stringify(r.last)}`); continue; }
    if (r.maxS > 0.5) fail(`${name}: past the edge by ${r.maxS.toFixed(1)} m (${JSON.stringify(r.T)})`);
    else if (r.dead) fail(`${name}: stopped dead ${r.dead} times (a run to a stand in one step: ${JSON.stringify(r.deadAt)})`);
    else if (r.backIn === null || r.backIn > 20) fail(`${name}: pressed against the edge and not turned back in (${JSON.stringify(r.T)} ${JSON.stringify(r.why)})`);
    else ok(`${name}: eased along it, ${Math.max(0, -r.maxS).toFixed(1)} m short at the nearest, turned and walking back in by ${r.backIn.toFixed(1)} s`);
    // the still: the works as the walker comes to them
    await p.evaluate(sd => {
      const g = window.__game, P = g.player;
      for (const d of [9, 12, 7, 15, 5]) { const x = sd.x - sd.rx * d, y = sd.y - sd.ry * d, wk = g.nav.walk(x, y, sd.z + 0.5, true); if (wk.ok) { [P.x, P.y, P.z] = [x, y, wk.z]; break; } }
      P.h = Math.atan2(sd.rx, sd.ry); Object.assign(g.cam, { yaw: P.h, yawTo: null, pitchTo: null, mode: 'chase' });
      g.advance(30); /* (time for the edge's line to be said again) */
      for (let i = 0; i < 14; i++) g.advance(0.1, ['KeyW']); /* (walked up to the works: the line is said) */
      for (let k = 0; k < 20; k++) g.frame(1 / 30);
    }, sd);
    await shot(`foot-${sd.k}`);
  }

  // ---------------------------------------------------------------- by car
  const inCar = await p.evaluate(() => {
    const g = window.__game, c = g.myCar && g.myCar();
    if (!c) { if (g.bringCar) g.bringCar(); for (let i = 0; i < 80 && !(g.myCar && g.myCar()); i++) g.advance(0.25); }
    const car = g.myCar && g.myCar();
    if (!car) return 'no car';
    const st = car.D.st, s = g.KEEP === 'left' ? 1 : -1;
    g.player.x = st.x + Math.cos(st.h) * 2.6 * s; g.player.y = st.y - Math.sin(st.h) * 2.6 * s; g.player.z = st.z;
    g.advance(0.3); g.enterCar();
    for (let i = 0; i < 20 && g.player.mode !== 'car'; i++) g.advance(0.5);
    return g.player.mode;
  });
  if (!only('car')) { /* skipped */ } else if (inCar !== 'car') fail(`the car: not at the wheel (${inCar})`);
  else for (const sd of sides) {
    if (done.car.has(sd.k)) continue;
    const r = await p.evaluate(sd => {
      const g = window.__game, B = g.bounds(), car = g.myCar(), st = car.D.st, half = car.C.half;
      const d0 = 55, x = sd.x - sd.rx * d0, y = sd.y - sd.ry * d0, f = g.nav.floorAt(x, y, sd.z + 2);
      Object.assign(st, { x, y, z: f ? f.z : sd.z, h: Math.atan2(sd.rx, sd.ry), vx: 0, vy: 0, v: 0, speed: 0, r: 0, steer: 0, reverse: false });
      // (the traffic out of its way, its lane to 20 m past the edge, as it goes: the streets across the edge are open to the
      // traffic, and a car run into is a crash, not the edge's brake)
      const clear = () => g.cars.clearLane && g.cars.clearLane(st.x, st.y, sd.x + sd.rx * 20, sd.y + sd.ry * 20, 4);
      clear(); g.advance(0.2);
      let maxS = -1e9, maxDec = 0, prev = 0, top = 0, reached = false, near = null;
      for (let i = 0; i < 140; i++) { // 14 s of W
        if (i % 5 === 0) clear();
        g.advance(0.1, ['KeyW']);
        const v = st.speed, s = B.sd(st.x, st.y).s + half; // (its nose)
        const dec = (prev - v) / 0.1;
        if (dec > maxDec) { // (what was nearest it then: a car of the traffic, someone of the crowd)
          let dc = 1e9, dp = 1e9; for (const o of g.cars.live) if (o.line >= 0) dc = Math.min(dc, Math.hypot(o.x - st.x, o.y - st.y));
          const P = g.crowd.P; for (let k = 0; k < g.crowd.active; k++) if (P[k].line >= 0) dp = Math.min(dp, Math.hypot(P[k].x - st.x, P[k].y - st.y));
          near = { car: +dc.toFixed(1), person: +dp.toFixed(1), s: +(B.sd(st.x, st.y).s + half).toFixed(1), v: +v.toFixed(1), was: +prev.toFixed(1), said: [...document.querySelectorAll('#g-toasts .g-toast')].map(e => e.textContent.slice(0, 60)).slice(-2) };
        }
        maxDec = Math.max(maxDec, dec); prev = v; top = Math.max(top, v);
        maxS = Math.max(maxS, s); if (s > -6) reached = true;
      }
      const at = [st.x, st.y];
      for (let i = 0; i < 40; i++) g.advance(0.1, ['KeyS']); // and away again
      return { maxS, maxDec, top, reached, back: Math.hypot(st.x - at[0], st.y - at[1]), end: B.sd(st.x, st.y).s, half, near };
    }, sd);
    const name = `by car at the ${sd.k} edge (${sd.c})`;
    if (r.reached) done.car.add(sd.k);
    if (!r.reached) { reach.car.push(sd.k); console.log(`note ${name}: did not reach the works (top ${(r.top * 3.6).toFixed(0)} km/h, nose ${r.maxS.toFixed(1)} m from the edge)`); continue; }
    if (r.maxS > 0.4) fail(`${name}: the nose ${r.maxS.toFixed(1)} m past the works' line`);
    else if (r.maxDec > 13 && r.near && r.near.said.some(t => /^Careful|Watch out/.test(t))) console.log(`note ${name}: run into something on its way (${r.near.said[0]}), not the edge's brake: ${JSON.stringify(r.near)}`);
    else if (r.maxDec > 13) fail(`${name}: braked at ${r.maxDec.toFixed(1)} m/s² (stopped dead; nearest then: ${JSON.stringify(r.near)})`);
    else if (r.back < 2) fail(`${name}: cannot back away from the works (${r.back.toFixed(1)} m)`);
    else ok(`${name}: from ${(r.top * 3.6).toFixed(0)} km/h to a stop ${(-r.maxS).toFixed(1)} m short, at most ${r.maxDec.toFixed(1)} m/s²; backs away ${r.back.toFixed(1)} m`);
    await p.evaluate(sd => {
      const g = window.__game, car = g.myCar(), st = car.D.st, d0 = car.C.half + 2.2, x = sd.x - sd.rx * d0, y = sd.y - sd.ry * d0, f = g.nav.floorAt(x, y, sd.z + 2);
      Object.assign(st, { x, y, z: f ? f.z : sd.z, h: Math.atan2(sd.rx, sd.ry), vx: 0, vy: 0, v: 0, speed: 0, r: 0, steer: 0 });
      Object.assign(g.cam, { yaw: st.h, yawTo: null });
      g.advance(0.2); for (let k = 0; k < 30; k++) g.frame(1 / 30);
    }, sd);
    await shot(`car-${sd.k}`);
  }

  // ---------------------------------------------------------------- in the air
  const inHeli = await p.evaluate(() => {
    const g = window.__game, hs = g.heli.st;
    if (g.player.mode === 'car') { g.myCar().D.st.vx = g.myCar().D.st.vy = 0; g.exitCar(); g.advance(1); }
    g.player.x = hs.x + 3; g.player.y = hs.y; g.player.z = hs.z; g.advance(0.3);
    g.enterHeli();
    for (let i = 0; i < 30 && g.player.mode !== 'heli'; i++) g.advance(0.5);
    return g.player.mode;
  });
  if (!only('heli')) { /* skipped */ } else if (inHeli !== 'heli') fail(`the helicopter: not at the controls (${inHeli})`);
  else for (const [k, a] of [['north', 0], ['east', Math.PI / 2], ['south', Math.PI], ['west', -Math.PI / 2], ['north-east', Math.PI / 4]]) {
    const r = await p.evaluate(a => {
      const g = window.__game, B = g.bounds(), hs = g.heli.st, A = B.air;
      Object.assign(hs, { x: A.cx, y: A.cy, z: 330, h: a, vx: Math.sin(a) * 30, vy: Math.cos(a) * 30, vz: 0, on: true, landed: false, rotor: 1, yawRate: 0 });
      g.advance(0.2);
      let maxS = -1e9, minV = 1e9, turned = false, spin = 0, T = [];
      for (let i = 0; i < 200; i++) { // 50 s of W held straight out
        g.advance(0.25, ['KeyW']);
        const s = B.sd(hs.x, hs.y, 'air').s, v = hs.speed;
        maxS = Math.max(maxS, s);
        if (maxS > -260) minV = Math.min(minV, v);
        const toC = Math.atan2(A.cx - hs.x, A.cy - hs.y), err = Math.abs(((toC - hs.h + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
        if (maxS > -240 && err < 0.6) turned = true;
        if (v < 4 && Math.abs(hs.yawRate) > 0.6) spin++;
        if (i % 8 === 0) T.push([Math.round(hs.x), Math.round(hs.y), Math.round(s), Math.round(v)]);
      }
      return { maxS, minV, turned, spin, end: B.sd(hs.x, hs.y, 'air').s, T };
    }, a);
    const name = `in the helicopter, flown out ${k}`;
    if (r.end > 0 || r.maxS > 0) fail(`${name}: past the air's edge by ${r.maxS.toFixed(0)} m (ends ${r.end.toFixed(0)} m)`);
    else if (!r.turned) fail(`${name}: not turned back in (${JSON.stringify(r.T.slice(-4))})`);
    else if (r.spin > 4 || r.minV < 6) fail(`${name}: turned on the spot, not in an arc (slowest ${r.minV.toFixed(1)} m/s)`);
    else ok(`${name}: turned back in an arc, ${(-r.maxS).toFixed(0)} m inside the edge at the widest, never under ${r.minV.toFixed(0)} m/s`);
    if (k === 'east') { // the still: mid-turn, from the chase
      await p.evaluate(a => { const g = window.__game, B = g.bounds(), hs = g.heli.st, A = B.air; Object.assign(hs, { x: A.cx, y: A.cy, z: 330, h: a, vx: Math.sin(a) * 30, vy: Math.cos(a) * 30, on: true, landed: false, rotor: 1 }); for (let i = 0; i < 200 && !B.turning(); i++) g.advance(0.25, ['KeyW']); for (let i = 0; i < 8; i++) g.advance(0.25, ['KeyW']); for (let k = 0; k < 20; k++) g.frame(1 / 30); }, a);
      await shot('heli-turn');
    }
  }
  if (inHeli === 'heli' && only('heli')) {
    const r = await p.evaluate(() => {
      const g = window.__game, B = g.bounds(), hs = g.heli.st, A = B.air;
      Object.assign(hs, { x: A.cx, y: A.cy, z: 330, vx: 0, vy: 0, vz: 0, on: true, landed: false, rotor: 1 });
      let top = 0;
      for (let i = 0; i < 120; i++) { g.advance(0.25, ['Space']); top = Math.max(top, hs.z); }
      return { top, ceiling: B.ceiling };
    });
    if (r.top > r.ceiling + 3) fail(`the ceiling: climbed to ${r.top.toFixed(0)} m over ${r.ceiling} m`);
    else ok(`the ceiling: held at ${r.top.toFixed(0)} m with the climb held (ceiling ${r.ceiling} m)`);
  }

  for (const k of ['foot', 'car']) if (only(k) && sides.length && done[k].size < Math.min(3, nSides)) fail(`${k === 'foot' ? 'on foot' : 'by car'}: the edge met from ${done[k].size} sides only (${[...done[k]].join(', ')})`);
  // ---------------------------------------------------------------- what is offered
  const offered = await p.evaluate(() => {
    const g = window.__game, B = g.bounds(), P = g.player, out = [];
    for (const d of g.destinations(P.x, P.y)) if (!B.inside(d.at[0], d.at[1], 'ground', 0)) out.push(`ride: ${d.name}`);
    for (const [t, l] of g.travelGroups()) for (const d of l) if (d.at && !B.inside(d.at[0], d.at[1], 'ground', 0)) out.push(`map ${t}: ${d.name}`);
    return out;
  });
  if (offered.length) fail(`offered past the edge: ${offered.join('; ')}`);
  else ok('the rides, the autopilot and the map offer nowhere past the edge');

  await b.close();
  console.log(errors.length ? `${errors.length} failed` : 'all passed');
  process.exit(errors.length ? 1 : 0);
})();
