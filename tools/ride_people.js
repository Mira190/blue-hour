// Takes frame 6's car (the ride the story sends: fr.ride) from where the flight sets you down to Hachiko, and on
// every frame the page draws checks every car against every person: the ride, your own car and the traffic against
// the crowd, the NPCs and you on foot. Exits 1 on any car standing in a person (or if the ride does not arrive).
// Stills from behind the car on the way, at the hour the frame is set (its headlamps on the car ahead).
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/ride_people.js out_dir [WxH]       (GPU=metal on a Mac)
// LIMIT=seconds: how long the ride may take (default 600). TIER=low|medium|high (default high).
// PIN=n: the skip's case (#50): once the ride is under way, n of the crowd are held standing where the car would stand at
// its stop (pulled in to the kerb, off its way's line) and the trip is skipped (F); they are let go when it is set down.
// A set-down on them fails as any overlap does.
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/ride-people', size = '1440x900'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number);
  const args = process.env.GPU === 'metal' ? ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-gpu']
    : process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 500, isMobile: w < 500 });
  const errors = [];
  p.on('pageerror', e => { errors.push(String(e)); console.log('pageerror:', String(e).slice(0, 300), (e.stack || '').split('\n').slice(1, 3).join(' | ').slice(0, 300)); });
  fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(t => { try { localStorage.setItem('oe3d-quality', t); localStorage.setItem('oe-story-late', JSON.stringify({ fi: 5, left: 2, prints: [0, 1, 2, 3, 4].map(i => ({ src: null, stamp: `frame ${i + 1}`, cap: '' })) })); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?overture=0`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => document.getElementById('gt-play').click());
  await p.waitForTimeout(2500);
  // the watch: each frame, each car (an oriented box) against each person (a body 0.22 m round), on one level
  await p.evaluate(() => {
    const g = window.__game, W = window.__ridePeople = { frames: 0, hits: [], worst: {}, rideV: 0, rideT: 0, rideM: 0, was: new Map() };
    const inBox = (c, half, hw, x, y, r) => { const fx = Math.sin(c.h), fy = Math.cos(c.h), dx = x - c.x, dy = y - c.y; return Math.abs(dx * fx + dy * fy) < half + r && Math.abs(-dx * fy + dy * fx) < hw + r; };
    let last = performance.now();
    const tick = () => { requestAnimationFrame(tick); const now = performance.now(), dt = Math.min(0.5, (now - last) / 1000); last = now; check(dt); };
    // (and the world stepped on without drawing, checked at every step: a software renderer draws a frame in two seconds)
    window.__rpStep = n => { for (let i = 0; i < n; i++) { g.frame(1 / 30); check(1 / 30); } };
    function check(dt) {
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
      for (const [, c] of cars) W.was.set(c, { x: c.x, y: c.y, h: c.h });
      for (const [, q] of people) W.was.set(q, { x: q.x, y: q.y });
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
    requestAnimationFrame(tick);
  });
  await p.evaluate(() => { const pl = window.__game.player; pl.x = 498; pl.y = -1046; }); // (where the flight sets you down)
  const t0 = Date.now();
  let arrivedShot = false, pinned = null, rode = false, shots = 0, tick = 0, ended = 'not arrived', s0 = null;
  while (Date.now() - t0 < (+process.env.LIMIT || 600) * 1000) {
    if (s0 && s0.ride && (s0.ride.phase === 'coming' || (s0.ride.phase === 'driving' && s0.mode === 'ride'))) await p.evaluate(n => window.__rpStep(n), s0.ride.v < 0.5 && s0.ride.phase === 'driving' ? 150 : 45); // (1.5 s of the world; 5 s stood at a light)
    await p.waitForTimeout(s0 && s0.dlg ? 400 : 1000);
    const s = s0 = await p.evaluate(() => { const g = window.__game, pl = g.player, r = g.ride(), st = g.story.state; const d = document.getElementById('gd'); return { dlg: !!(d && !d.hidden), choices: document.querySelectorAll('#gd-choices button').length, phase: st.phase, mode: pl.mode, beat: st.beat, fi: st.fi, at: [Math.round(pl.x), Math.round(pl.y)], ride: r ? { phase: r.phase, v: +r.drv.st.v.toFixed(1), why: r.drv.st.why, intent: r.drv.st.intent, jn: r.drv.st.junction || '', sig: (a => a && a.j ? `${a.j.scramble ? 'scr ' : ''}ph${a.j.ph}/${a.phase} ${a.j.st} t${(+a.j.t).toFixed(1)} nxt${a.j.nxt} g${(a.j.green || []).join(',')} skip${a.j.skip} busy${a.j.busy || 0} hold${a.j.hold != null ? 1 : 0}` : '')(r.drv.st.lineAt), blk: (b => b ? `${b.walker ? 'walker' : 'car'} v${(+(b.v || 0)).toFixed(1)} ${b.why || ''}${b.q ? ' q' : ''}` : '')(r.drv.st.block), gap: r.drv.st.gap === Infinity ? null : +(+r.drv.st.gap).toFixed(1) } : null, goal: (document.querySelector('#g-story-goal span') || {}).textContent || '', prompt: [...document.querySelectorAll('[id*=prompt]')].map(e => e.textContent).join('|').slice(0, 60), W: { frames: window.__ridePeople.frames, worst: window.__ridePeople.worst } }; });
    console.log(Math.round((Date.now() - t0) / 1000), JSON.stringify(s).slice(0, 360));
    if (s.phase === 'dressed') { await p.keyboard.press('KeyQ'); continue; } // (the opening shots: a key ends them, many minutes of frames on a software renderer)
    // the cards before the ride (as tools/story_play.js answers them)
    if (s.dlg) { await p.evaluate(() => { const st = window.__game.story.state, B = document.querySelectorAll('#gd-choices button'); if (B.length) (B[st.want] || B[0]).click(); }); if (!s.choices) await p.keyboard.press('KeyE'); continue; }
    if (s.mode === 'foot' && s.ride && (s.ride.phase === 'waiting') && !rode) { await p.evaluate(() => { const g = window.__game, r = g.ride(), st = r.drv.st; g.player.x = st.x + 2.4 * Math.cos(st.h); g.player.y = st.y - 2.4 * Math.sin(st.h); }); await p.waitForTimeout(600); await p.keyboard.press('KeyE'); }
    if (s.mode === 'ride') {
      if (+process.env.PIN && !pinned && s.ride && s.ride.phase === 'driving') { pinned = await p.evaluate(n => window.__rpPin(n), +process.env.PIN); console.log('pinned', JSON.stringify(pinned)); await p.waitForTimeout(300); await p.keyboard.press('KeyF'); }
      if (!rode) { rode = true; await p.evaluate(() => { const g = window.__game; if (g.cam && g.cam.mode === 'cabin' && g.keys) {} }); }
      if (shots < 24 && s.ride && s.ride.phase === 'driving' && (++tick % (s.ride.v < 0.5 ? 6 : 3) === 1)) { try { await p.screenshot({ path: `${out}/ride-${String(shots).padStart(2, '0')}.png`, timeout: 120000 }); } catch (e) { console.log('(no still)'); } shots++; }
      if (s.ride && s.ride.phase === 'arrived' && !arrivedShot) { arrivedShot = true; await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 400 && g.cine.active; i += 15) window.__rpStep(15); window.__rpStep(60); }); try { await p.screenshot({ path: `${out}/arrived.png`, timeout: 120000 }); } catch (e) { console.log('(no still)'); } } // (the car where it sets you down, at Hachiko, once the view has come down onto it)
      if (s.ride && s.ride.phase === 'arrived') await p.keyboard.press('KeyE'); // (out only where it sets you down: 'Get out here' is offered all the way)
    }
    if (rode && s.mode === 'foot') { ended = 'arrived'; break; }
  }
  const W = await p.evaluate(() => { const W = window.__ridePeople; W.was = null; return W; });
  console.log('frames watched', W.frames, '| ride driving', W.rideT.toFixed(1), 's,', W.rideM.toFixed(0), 'm, mean', (W.rideM / Math.max(1, W.rideT) * 3.6).toFixed(1), 'km/h moving, top', (W.rideV * 3.6).toFixed(1), 'km/h');
  console.log('ride from boarding to setting down', (W.driveT || 0).toFixed(1), 's, stopped', (W.stopT || 0).toFixed(1), 's (not counting the cut on)', W.cut != null ? `; held still, cut on to its stop ${W.cut.toFixed(1)} s in` : '; never cut on');
  if (process.env.PIN) console.log('pinned', W.pinned || 0, 'at the stop; set down', JSON.stringify(W.setAt || null));
  console.log('overlaps', JSON.stringify(W.worst));
  for (const x of W.hits) console.log('  ', JSON.stringify(x));
  console.log('ride', ended, errors.length ? `| ${errors.length} page errors` : '');
  await b.close();
  const bad = Object.keys(W.worst).length > 0 || ended !== 'arrived' || errors.length > 0 || (+process.env.PIN > 0 && !(W.pinned > 0 && W.setAt));
  process.exit(bad ? 1 : 0);
})();
