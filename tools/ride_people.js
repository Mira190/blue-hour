// Takes frame 6's car (the ride the story sends: fr.ride) from where the flight sets you down to Hachiko, and on
// every frame the page draws checks every car against every person: the ride, your own car and the traffic against
// the crowd, the NPCs and you on foot. Exits 1 on any car standing in a person (or if the ride does not arrive).
// Stills from behind the car on the way, at the hour the frame is set (its headlamps on the car ahead).
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/ride_people.js out_dir [WxH]       (GPU=metal on a Mac)
// LIMIT=seconds: how long the ride may take (default 600, 900 with PASS). TIER=low|medium|high (default high).
// UPTO=pickup: only the car's way in to you, ended once you are in. The ride is checked against the rails and posts the hero levels
// draw (issue 208) as well as against people: "rails" in the log. Set down, you walk the station's free passage by Hachiko with
// the chase camera, which must stay under its ceiling (tools/cam_ceiling.js; PASSAGE=0 leaves it out).
// PIN=n: the skip's case (#50): once the ride is under way, n of the crowd are held standing where the car would stand at
// its stop (pulled in to the kerb, off its way's line) and the trip is skipped (F); they are let go when it is set down.
// A set-down on them fails as any overlap does.
// SIDE=road: you stand to get in off the car's road-side flank, in the lane beside it, as before #94 (default: by the kerb
// seat's door). PASS=1: that stand made when a car of the traffic is passing over it (#94's failure, made to happen).
const { skip, whole } = require('./draw_skip');
const { railsInPage } = require('./rails_drawn');
const camCeiling = require('./cam_ceiling');
const { chromium } = require('playwright');
const { logger: browserLog, watch: watchPage } = require('./browser_watch'); // (what the browser says of its GPU, in the log: issue 49)
const fs = require('fs');
const [,, out = '/tmp/ride-people', size = '1440x900'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number);
  const args = process.env.GPU === 'metal' ? ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-gpu']
    : process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args, logger: browserLog() });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 500, isMobile: w < 500 });
  await skip(p, +(process.env.DRAW || 0)); // (DRAW=n: one frame in n drawn, the stills drawn whole: tools/draw_skip.js)
  watchPage(p);
  const errors = [];
  p.on('pageerror', e => { errors.push(String(e)); console.log('pageerror:', String(e).slice(0, 300), (e.stack || '').split('\n').slice(1, 3).join(' | ').slice(0, 300)); });
  fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); localStorage.setItem('bh-story-late', JSON.stringify({ fi: 5, left: 2, prints: [0, 1, 2, 3, 4].map(i => ({ src: null, stamp: `frame ${i + 1}`, cap: '' })) })); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?overture=0`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => document.getElementById('gt-play').click());
  await p.waitForTimeout(2500);
  // the watch: each frame, each car (an oriented box) against each person (a body 0.22 m round), on one level
  await p.evaluate(railsInPage);
  await p.evaluate(() => {
    const g = window.__game, W = window.__ridePeople = { frames: 0, hits: [], worst: {}, rideV: 0, rideT: 0, rideM: 0, was: new Map() };
    const inBox = (c, half, hw, x, y, r) => { const fx = Math.sin(c.h), fy = Math.cos(c.h), dx = x - c.x, dy = y - c.y; return Math.abs(dx * fx + dy * fy) < half + r && Math.abs(-dx * fy + dy * fx) < hw + r; };
    let last = performance.now();
    const tick = () => { requestAnimationFrame(tick); const now = performance.now(), dt = Math.min(0.5, (now - last) / 1000); last = now; check(dt); };
    // (and the world stepped on without drawing, checked at every step: a software renderer draws a frame in two seconds)
    window.__rpStep = n => { for (let i = 0; i < n; i++) { g.frame(1 / 30); check(1 / 30); } };
    function check(dt) {
      if (!W.was) return; // (the watch is over: the harness has taken its tally, and a frame drawn after that wrote into nothing, a page error that failed a ride that had arrived)
      if (g.held && g.held()) return;
      W.frames++;
      pin();
      const cars = [], pl = g.player, ride = g.ride(), my = g.myCar();
      if (ride) { const s = ride.drv.st; cars.push(['ride', s, ride.C.half, ride.C.hw, s.v]); if (ride.phase === 'driving') { W.driveT = (W.driveT || 0) + dt; if (s.v <= 0.3 && !g.cine.active) W.stopT = (W.stopT || 0) + dt; } if (ride.cut != null) W.cut = ride.cut; if (ride.phase === 'driving' && s.v > 0.1) { W.rideT += dt; W.rideM += s.v * dt; W.rideV = Math.max(W.rideV, s.v); } }
      if (my && my.D && my.D.st) { const s = my.D.st; cars.push(['your car', s, my.C.half, my.C.hw, s.v || s.speed || 0]); }
      for (const c of g.cars.live) if (c.line >= 0) cars.push(['traffic', c, c.half, c.hw, c.v]);
      const people = [];
      const cr = g.crowd;
      if (cr && cr.P) for (let i = 0, n = Math.min(cr.active, cr.P.length); i < n; i++) { const q = cr.P[i]; if (q.line >= 0 || q.pz) people.push(['crowd', q]); }
      for (const n of g.npcs) people.push(['npc', n]);
      if (pl.mode === 'foot') people.push(['you', pl]);
      for (const [kind, c, half, hw, v] of cars) for (const [who, q] of people) {
        if (Math.abs(q.x - c.x) > 8 || Math.abs(q.y - c.y) > 8 || (q.z != null && c.z != null && Math.abs(q.z - c.z) > 2)) continue;
        if (!inBox(c, half, hw, q.x, q.y, 0.05)) continue; // (a body's middle inside the car, with a little of its width)
        const k = `${kind}/${who}`;
        W.worst[k] = (W.worst[k] || 0) + 1;
        // (and how it came about: the walker where it stood the step before against the car where it stands now, and the other way)
        const c0 = W.was.get(c), q0 = W.was.get(q), how = !c0 || !q0 ? 'new' : inBox(c0, half, hw, q0.x, q0.y, 0.05) ? 'already in' : inBox(c, half, hw, q0.x, q0.y, 0.05) ? (inBox(c0, half, hw, q.x, q.y, 0.05) ? 'both moved' : 'car moved in') : inBox(c0, half, hw, q.x, q.y, 0.05) ? 'walker moved in' : 'both moved';
        if (W.hits.length < 40) W.hits.push({ kind, who, t: +g.t().toFixed(1), car: [+c.x.toFixed(1), +c.y.toFixed(1)], at: [+q.x.toFixed(1), +q.y.toFixed(1)], v: +(v || 0).toFixed(1), why: c.why || '', block: c.block ? (c.block.walker ? 'walker' : 'car') : '', how,
          was: c0 && q0 ? { car: [+c0.x.toFixed(2), +c0.y.toFixed(2), +c0.h.toFixed(3)], at: [+q0.x.toFixed(2), +q0.y.toFixed(2)] } : null, h: +(+c.h).toFixed(3), half: +(+half).toFixed(2), hw: +(+hw).toFixed(2),
          held: c.heldBy || '', mv: !!c.mv, sq: !!c.squeezing, pw: +(c.pw || 0).toFixed(1), bus: !!c.bus, line: c.line, walker: { state: q.state || '', ph: q.ph || '', pz: !!q.pz, v: +(q.v || 0).toFixed(2), line: q.line, sq: +(q.squeeze || 0).toFixed(1), ej: !!q.ejected } });
      }
      if (ride) rails(ride, dt);
      for (const [, c] of cars) W.was.set(c, { x: c.x, y: c.y, h: c.h });
      for (const [, q] of people) W.was.set(q, { x: q.x, y: q.y });
    }
    // The ride against the rails as drawn (issue 208: the car that came for you drove through a railing): the guard rails,
    // bollards and posts the hero levels draw (their metal_guard and metal_pole meshes, the levels' own, not the walking
    // grid's), sampled every 0.2 m along their triangles' edges between 0.15 and 1.3 m over the ground under them (a car's
    // body; a sign's arm overhead is not met), against the ride's box less 5 cm, on every step, from the moment it is sent
    // until it sets you down. W.rail: by phase; W.railHits: the first of them
    W.rail = {}; W.railHits = [];
    const R = window.__rails, railsAcross = (ax, ay, bx, by, z) => R.across(ax, ay, bx, by, z);
    function rails(r) {
      R.levels();
      const c = r.drv.st, hit = R.inBox(c.x, c.y, c.z, c.h, r.C.half - 0.05, r.C.hw - 0.05);
      if (!hit) return;
      const ph = `${r.phase}${r.phase === 'coming' && c.end - c.s < 25 ? ' (pulling in)' : ''}`;
      W.rail[ph] = (W.rail[ph] || 0) + 1;
      if (W.railHits.length < 12) W.railHits.push({ phase: ph, t: +g.t().toFixed(1), car: [+c.x.toFixed(2), +c.y.toFixed(2), +c.h.toFixed(3)], v: +(c.v || 0).toFixed(1), lat: +(c.lat || 0).toFixed(2), toEnd: +(c.end - c.s).toFixed(1), rail: hit, you: [+g.player.x.toFixed(1), +g.player.y.toFixed(1)] });
    }
    // (PIN: people held where the car will stand at its stop, until the skip sets it down: W.pinned, W.setAt)
    function pin() {
      const r = g.ride();
      if (!W.pin || !r) return;
      if (W.pin.skipped && !r.hold) { const st = r.drv.st; W.setAt = { at: [+st.x.toFixed(1), +st.y.toFixed(1)], short: +(st.end - st.s).toFixed(1), stop: W.pin.stop }; W.pin = null; return; }
      if (r.hold) W.pin.skipped = true;
      const cr = g.crowd;
      for (const [i, x, y, z] of W.pin.at) { const q = cr.P[i]; if (q && q.line >= 0) { q.x = x; q.y = y; q.z = z; q.v = 0; } }
    }
    window.__rpPin = n => {
      const r = g.ride(), st = r.drv.st, e = {}, sh = st.shift, cr = g.crowd;
      st.shift = 0; r.drv.poseAt(st.end, e); st.shift = sh;
      const line = {}; r.drv.path.at(st.end, line);
      const fx = e.hx, fy = e.hy, spots = [[0, 0], [1.2, 0.3], [-1.2, -0.3], [2, -0.4], [-2, 0.4], [0.6, -0.5], [-0.6, 0.5]].slice(0, n);
      const free = []; for (let i = 0; i < Math.min(cr.active, cr.P.length) && free.length < spots.length; i++) if (cr.P[i].line >= 0 && !cr.P[i].pz) free.push(i);
      W.pin = { at: spots.slice(0, free.length).map(([a, b], k) => [free[k], e.x + fx * a + fy * b, e.y + fy * a - fx * b, e.z]), stop: [+e.x.toFixed(1), +e.y.toFixed(1)], offLine: +Math.hypot(e.x - line.x, e.y - line.y).toFixed(2) };
      W.pinned = W.pin.at.length;
      return { pinned: W.pinned, stop: W.pin.stop, offLine: W.pin.offLine };
    };
    // where you stand to get in: beside the door of the seat the ride gives you, on the kerb side (game.js rideSeat and
    // doorAt). (#94, and 0f1d8d8 on its own: it stood you 2.4 m off the car's other flank, in the lane of the traffic beside
    // it, and in some runs a car of the traffic was passing there as you were put down: counted in you for the one frame before the
    // traffic's step moved you out of it.) SIDE=road stands you off the other flank, as it was. PASS=1 makes that case
    // happen: the world stepped on (up to 240 s) until a car of the traffic is passing over the spot, you put down there
    // then and the frame tested before the world moves, as a frame of the page's is that the world did not move in.
    window.__rpBoard = (side, pass) => {
      const r = g.ride(), st = r.drv.st, C = r.C, seat = C.seats[g.rideSeat(r)], fx = Math.sin(st.h), fy = Math.cos(st.h);
      const l = (side === 'road' ? -1 : 1) * Math.sign(seat.x || 1) * (C.hw + 0.55), f = seat.z + 0.2, x = st.x + fx * f - fy * l, y = st.y + fy * f + fx * l;
      let steps = 0, by = null;
      if (pass) for (; steps < 30 * 240 && !by; steps++) { g.frame(1 / 30); check(1 / 30); for (const c of g.cars.live) if (c.line >= 0 && c.v > 1 && Math.abs(c.z - st.z) < 2 && inBox(c, c.half, c.hw, x, y, -0.1)) { by = c; break; } }
      // (#208: no rail, fence or post between the door the car stopped for you at and the pavement beside it: the drawn
      // rails within 0.12 m of the line from 2.2 m out on the kerb side to the door, in the band they were read in)
      const ox = -fy * Math.sign(l), oy = fx * Math.sign(l), across = railsAcross(x + ox * 2.2, y + oy * 2.2, x - ox * 0.5, y - oy * 0.5, st.z); // (from 2.2 m out on the pavement to the door)
      if (across.length) { W.rail['between you and the door'] = across.length; W.railHits.push({ phase: 'between you and the door', door: [+x.toFixed(1), +y.toFixed(1)], car: [+st.x.toFixed(2), +st.y.toFixed(2), +st.h.toFixed(3)], rail: across[0] }); }
      g.player.x = x; g.player.y = y;
      if (by) check(0);
      return { side, seat: g.rideSeat(r), at: [+x.toFixed(1), +y.toFixed(1)], steps, passing: by ? { at: [+by.x.toFixed(1), +by.y.toFixed(1)], v: +by.v.toFixed(1) } : null, worst: W.worst };
    };
    requestAnimationFrame(tick);
  });
  await p.evaluate(() => { const pl = window.__game.player; pl.x = 498; pl.y = -1046; }); // (where the flight sets you down)
  const t0 = Date.now();
  let arrivedShot = false, pinned = null, rode = false, shots = 0, tick = 0, ended = 'not arrived', s0 = null, stood = null;
  while (Date.now() - t0 < (+process.env.LIMIT || (process.env.PASS ? 900 : 600)) * 1000) {
    if (s0 && s0.ride && (s0.ride.phase === 'coming' || (s0.ride.phase === 'driving' && s0.mode === 'ride'))) await p.evaluate(n => window.__rpStep(n), s0.ride.v < 0.5 && s0.ride.phase === 'driving' ? 150 : 45); // (1.5 s of the world; 5 s stood at a light)
    await p.waitForTimeout(s0 && s0.dlg ? 400 : 1000);
    const s = s0 = await p.evaluate(() => { const g = window.__game, pl = g.player, r = g.ride(), st = g.story.state; const d = document.getElementById('gd'); return { dlg: !!(d && !d.hidden), choices: document.querySelectorAll('#gd-choices button').length, phase: st.phase, mode: pl.mode, beat: st.beat, fi: st.fi, at: [Math.round(pl.x), Math.round(pl.y)], ride: r ? { phase: r.phase, v: +r.drv.st.v.toFixed(1), why: r.drv.st.why, intent: r.drv.st.intent, jn: r.drv.st.junction || '', sig: (a => a && a.j ? `${a.j.scramble ? 'scr ' : ''}ph${a.j.ph}/${a.phase} ${a.j.st} t${(+a.j.t).toFixed(1)} nxt${a.j.nxt} g${(a.j.green || []).join(',')} skip${a.j.skip} busy${a.j.busy || 0} hold${a.j.hold != null ? 1 : 0}` : '')(r.drv.st.lineAt), blk: (b => b ? `${b.walker ? 'walker' : 'car'} v${(+(b.v || 0)).toFixed(1)} ${b.why || ''}${b.q ? ' q' : ''}` : '')(r.drv.st.block), gap: r.drv.st.gap === Infinity ? null : +(+r.drv.st.gap).toFixed(1), xb: (o => (o && /Giving way/.test(r.drv.st.intent || '') ? { at: [+o.x.toFixed(1), +o.y.toFixed(1)], v: +(o.v || 0).toFixed(1), why: o.why || '', by: o.youBy || o.heldBy || '', mv: !!o.mv, q: !!o.q, line: o.line, toLine: o.toLine != null ? +(+o.toLine).toFixed(1) : null, xMut: !!r.drv.st.xMutual, held: +(r.drv.st.held || 0).toFixed(1), mutT: +(r.drv.st.mutT || 0).toFixed(1) } : null))(r.drv.st.xBlock) } : null, goal: (document.querySelector('#g-story-goal span') || {}).textContent || '', prompt: [...document.querySelectorAll('[id*=prompt]')].map(e => e.textContent).join('|').slice(0, 60), W: { frames: window.__ridePeople.frames, worst: window.__ridePeople.worst } }; });
    console.log(Math.round((Date.now() - t0) / 1000), JSON.stringify(s).slice(0, 360));
    if (s.phase === 'dressed') { await p.keyboard.press('KeyQ'); continue; } // (the opening shots: a key ends them, many minutes of frames on a software renderer)
    // the cards before the ride (as tools/story_play.js answers them)
    if (s.dlg) { await p.evaluate(() => { const st = window.__game.story.state, B = document.querySelectorAll('#gd-choices button'); if (B.length) (B[st.want] || B[0]).click(); }); if (!s.choices) await p.keyboard.press('KeyE'); continue; }
    if (s.mode === 'foot' && s.ride && (s.ride.phase === 'waiting') && !rode) { const at = await p.evaluate(([side, pass]) => window.__rpBoard(side, pass), [process.env.SIDE || 'kerb', +process.env.PASS || 0]); console.log('board', JSON.stringify(at)); await p.waitForTimeout(600); await p.keyboard.press('KeyE'); }
    if (s.mode === 'ride') {
      if (+process.env.PIN && !pinned && s.ride && s.ride.phase === 'driving') { pinned = await p.evaluate(n => window.__rpPin(n), +process.env.PIN); console.log('pinned', JSON.stringify(pinned)); await p.waitForTimeout(300); await p.keyboard.press('KeyF'); }
      if (!rode) { rode = true; await p.evaluate(() => { const g = window.__game; if (g.cam && g.cam.mode === 'cabin' && g.keys) {} }); }
      if (shots < 24 && s.ride && s.ride.phase === 'driving' && (++tick % (s.ride.v < 0.5 ? 6 : 3) === 1)) { try { await whole(p, () => p.screenshot({ path: `${out}/ride-${String(shots).padStart(2, '0')}.png`, timeout: 120000 })); } catch (e) { console.log('(no still)'); } shots++; }
      if (s.ride && s.ride.phase === 'arrived' && !arrivedShot) { arrivedShot = true; const camAt = () => p.evaluate(() => { const g = window.__game, c = g.camera.position, st = g.ride().drv.st; return { t: +g.t().toFixed(1), cine: g.cine.active, camH: +c.y.toFixed(0), off: +Math.hypot(c.x - st.x, -c.z - st.y).toFixed(0) }; });
        const was = await camAt(); let now = was; for (let k = 0; k < 60 && (now.cine || now.off > 15); k++) { await p.waitForTimeout(2000); now = await camAt(); } await p.waitForTimeout(4000); console.log('settle', JSON.stringify({ was, now })); try { await whole(p, () => p.screenshot({ path: `${out}/arrived.png`, timeout: 120000 })); } catch (e) { console.log('(no still)'); }
        // (#54: at its stop the car stands on the carriageway the hero level draws, not over the kerb on a square's paving; and the
        // goal line says to get out, no longer to skip a ride that has arrived)
        const stop = await p.evaluate(() => { const g = window.__game, r = g.ride(), st = r.drv.st, C = r.C, hx = Math.sin(st.h), hy = Math.cos(st.h), cw = g.nav.carriageway, off = [];
          if (cw) for (const a of [-C.half, C.half]) for (const l of [-C.hw, C.hw]) { const x = st.x + hx * a - hy * l, y = st.y + hy * a + hx * l; if (cw(x, y) === false) off.push([+x.toFixed(1), +y.toFixed(1)]); }
          // (#208: and nothing of a rail between its kerb-side door and the pavement, where you get out)
          const seat = C.seats[g.rideSeat(r)], l = Math.sign(seat.x || 1) * (C.hw + 0.05), dx = st.x + hx * seat.z - hy * l, dy = st.y + hy * seat.z + hx * l, ox = -hy * Math.sign(l), oy = hx * Math.sign(l);
          const rail = window.__rails.across(dx + ox * 2.2, dy + oy * 2.2, dx - ox * 0.3, dy - oy * 0.3, st.z).slice(0, 2);
          const lp = {}; r.drv.path.at(st.end, lp); const T = window.THREE, a = new T.Vector3(st.x + hx * 2.6, st.z + 1.2, -(st.y + hy * 2.6)), b = new T.Vector3(st.x + hx * 12, st.z + 1.2, -(st.y + hy * 12));
          // (#208: its heading and its way's there, and how far ahead a solid stands on the line it faces)
          const ahead = +(g.nav.clearFraction(a, b) * 9.4 + 2.6).toFixed(1);
          return { at: [+st.x.toFixed(1), +st.y.toFixed(1)], h: +st.h.toFixed(3), wayH: +Math.atan2(lp.hx, lp.hy).toFixed(3), ahead, lat: +(st.lat || 0).toFixed(2), off, rail, how: (document.querySelector('#g-story-goal em') || {}).textContent || '' }; });
        console.log('stop', JSON.stringify(stop));
        // (and the car at its stop from above behind it and from across the square, the film's camera held there for the still)
        for (const [n, back, side, up] of [['stop-above', -9, 0, 7], ['stop-side', 2, -10, 3]]) {
          await p.evaluate(([back, side, up]) => { const g = window.__game, st = g.ride().drv.st, hx = Math.sin(st.h), hy = Math.cos(st.h), W = (x, y, z) => new THREE.Vector3(x, z, -y);
            const k = Math.sign(st.lat || 1), pose = { pos: W(st.x + hx * back - hy * side * k, st.y + hy * back + hx * side * k, st.z + up), look: W(st.x, st.y, st.z + 0.6) };
            g.cine.stop(); g.cine.play(() => pose, 1e9, { label: 'film' }); }, [back, side, up]);
          await p.waitForTimeout(3000);
          try { await whole(p, () => p.screenshot({ path: `${out}/${n}.png`, timeout: 120000 })); } catch (e) { console.log('(no still)'); }
        }
        await p.evaluate(() => window.__game.cine.stop());
        { const d = Math.abs(((stop.h - stop.wayH + 3 * Math.PI) % (2 * Math.PI)) - Math.PI); if (d > 0.1) errors.push(`the car sets you down turned ${(d * 180 / Math.PI).toFixed(0)} degrees off its road: a taxi stands parallel to the kerb`); }
        if (stop.rail.length) errors.push(`a rail between the car's door and the pavement where it sets you down: ${JSON.stringify(stop.rail)}`);
        if (stop.off.length) errors.push(`the car at its stop has ${stop.off.length} corners off the carriageway: ${JSON.stringify(stop.off)}`);
        if (/to be there now/.test(stop.how) || !/You are there/.test(stop.how)) errors.push(`arrived, the goal line still says "${stop.how}"`); } // (the car where it sets you down, at Hachiko, once the view has come down onto it: the page's own frames, which move the world's clock the hop runs on and the chase camera it hands over to; a step of the harness moves neither)
      if (s.ride && s.ride.phase === 'arrived') await p.keyboard.press('KeyE'); // (out only where it sets you down: 'Get out here' is offered all the way)
    }
    if (rode && s.mode === 'foot') { ended = 'arrived'; break; }
    // (the car on its way to you stood still five minutes of the game's own clock, 9000 of its frames: not a light's red,
    // which is two minutes at most, but a standstill, and said at once with what holds it, not after the play's limit.
    // Main's ride on f69bd7d8 gave way at (531, -995.8) for 40 minutes of a runner, #235)
    if (s.ride && (s.ride.phase === 'coming' || s.ride.phase === 'waiting') && s.ride.v < 0.1 && s.W) {
      if (stood == null) stood = s.W.frames;
      else if (s.W.frames - stood > 9000) { ended = `not arrived: the car coming to you stood still five minutes of the game's clock ("${s.ride.intent}", ${s.ride.why}${s.ride.jn ? `, junction ${s.ride.jn}` : ''})`; break; }
    } else stood = null;
    if (process.env.UPTO === 'pickup' && s.mode === 'ride') { ended = 'arrived'; break; } // (UPTO=pickup: the car's way in to you alone)
  }
  // (not arrived: what holds the car up, and what holds that up in turn, ten cars on: #97)
  if (ended !== 'arrived') console.log('held by', JSON.stringify(await p.evaluate(() => { const g = window.__game, r = g.ride(); if (!r) return null; const st = r.drv.st, out = [{ ride: r.phase, at: [+st.x.toFixed(1), +st.y.toFixed(1)], v: +st.v.toFixed(1), intent: st.intent, why: st.why, held: +(st.held || 0).toFixed(1), xMut: !!st.xMutual }], seen = new Set();
    let o = st.block; for (let k = 0; k < 10 && o && !seen.has(o); k++) { seen.add(o); const lx = o.leadX || null; out.push({ at: [+(+o.x).toFixed(1), +(+o.y).toFixed(1)], h: +(+o.h || 0).toFixed(2), v: +(o.v || 0).toFixed(1), why: o.why || '', youBy: o.youBy || '', heldBy: o.heldBy || '', q: !!o.q, mv: !!o.mv, line: o.line, toLine: o.toLine != null ? +(+o.toLine).toFixed(1) : null, stuck: +(o.stuck || 0).toFixed(1), walker: !!o.walker, id: o.id || '' }); o = o.front || o.xBlock || (o.block && !o.block.walker ? o.block : null) || null; }
    return out; })));
  // (#208: set down by Hachiko, on foot, the walk through the station's free passage 50 m east, frame 4's way to SKY's lift:
  // both ways, turning and dragging the view at its ends and in its middle, the lens never over or through its ceiling,
  // as drawn and as built: tools/cam_ceiling.js. PASSAGE=0 leaves it out)
  if (ended === 'arrived' && process.env.PASSAGE !== '0') {
    await p.evaluate(() => { window.__ridePeople.was = null; window.requestAnimationFrame = () => 0; }); // (the watch over; the world stepped by the walk alone)
    const r = await camCeiling.run(p, Object.assign({ quick: process.env.PASSAGE !== 'all' }, camCeiling.PLACES[0])); // (PASSAGE=all: both ways and the middle too)
    for (const f of r.bad.slice(0, 6)) console.log('  ceiling', JSON.stringify(f));
    console.log(`passage: ${r.frames} frames walked, ${r.bad.length} with the lens over or through its ceiling`);
    if (r.bad.length) errors.push(`the lens over or through the passage's ceiling in ${r.bad.length} frames`);
  }
  const W = await p.evaluate(() => { const W = window.__ridePeople; W.was = null; return W; });
  console.log('frames watched', W.frames, '| ride driving', W.rideT.toFixed(1), 's,', W.rideM.toFixed(0), 'm, mean', (W.rideM / Math.max(1, W.rideT) * 3.6).toFixed(1), 'km/h moving, top', (W.rideV * 3.6).toFixed(1), 'km/h');
  console.log('ride from boarding to setting down', (W.driveT || 0).toFixed(1), 's, stopped', (W.stopT || 0).toFixed(1), 's (not counting the cut on)', W.cut != null ? `; held still, cut on to its stop ${W.cut.toFixed(1)} s in` : '; never cut on');
  if (process.env.PIN) console.log('pinned', W.pinned || 0, 'at the stop; set down', JSON.stringify(W.setAt || null));
  W.railPts = await p.evaluate(() => window.__rails.points());
  W.railSelf = await p.evaluate(() => window.__rails.selfTest());
  if (W.railSelf) errors.push(`the rail check is blind: ${W.railSelf}`);
  console.log('rails', W.railPts ? `${W.railPts} points of the levels' rails and posts;` : '(no rails read: no hero level shown);', Object.keys(W.rail).length ? `the ride through them ${JSON.stringify(W.rail)} steps` : 'the ride clear of them');
  for (const x of W.railHits) console.log('  rail', JSON.stringify(x));
  console.log('overlaps', JSON.stringify(W.worst));
  for (const x of W.hits) console.log('  ', JSON.stringify(x));
  console.log('ride', ended, errors.length ? `| ${errors.join(' | ').slice(0, 600)}` : ''); // (what failed, said: the page's errors and the ride's own, which were counted as "page errors" and never named)
  await b.close();
  const bad = Object.keys(W.worst).length > 0 || Object.keys(W.rail).length > 0 || ended !== 'arrived' || errors.length > 0 || (+process.env.PIN > 0 && !(W.pinned > 0 && W.setAt));
  process.exit(bad ? 1 : 0);
})();
