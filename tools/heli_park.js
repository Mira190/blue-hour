// The helicopter left on a road: does the traffic keep out of it, and does its pilot take it home? Plays the walk's map
// headless (web/ served on PORT or 8800, run under xvfb-run), at night as the owner found it, and fails if:
//   - set down on the road at the Scramble (an arm of the crossing with traffic on it, just short of its line) with you
//     stepped out beside it, any of the traffic's cars ever has its box over the helicopter's hull, or under its rotor's
//     reach (turning or stopped: its blades droop over a bus's roof); or a walker of the crowd stands in its hull or rotor;
//   - while you stand beside it (under 12 m), it leaves;
//   - once you have walked away (40 m off, the camera on it), it does not start up, lift off and reach its pad on SHIBUYA
//     SKY's roof inside 90 s; or on its way it comes within CLEAR m over a roof (sampled under its rotor and round it,
//     as tools/flight_clear.py margins a story's flight) after it has climbed off the street;
//   - set down there again and walked away from with the camera turned from it, it is not put back on its pad unseen
//     (it never flies where you cannot see it);
//   - your own car, left across a lane by the crossing, has a car of the traffic's box over its own (the same class:
//     a car left in the road is driven round or waited for, never through).
//   (a car it was set down onto, inside its footprint as it came within 8 m of the road, is let drive on out from under
//   it, game.js heliFree, and counted apart)
// Stills, desktop and phone (SIZE=WxH, default both): the helicopter on the road with the traffic held short of it, its
// lift-off, and on its pad. Exits 1 on a failure.
//   JOB_LIGHT=1 tools/job.sh run serve -- python3 -m http.server 8800 --directory web
//   tools/job.sh run heli-park -- xvfb-run -a node tools/heli_park.js out_dir
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/heli-park'] = process.argv;
const SIZES = (process.env.SIZE || '1440x900,390x844').split(',');
const CLEAR = 3;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  let failed = 0;
  const fail = m => { failed++; console.log('FAIL ' + m); }, ok = m => console.log('ok   ' + m);
  for (const size of SIZES) {
    const [w, h] = size.split('x').map(Number), phone = w < 500, tag = phone ? 'phone' : 'desktop';
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
    p.on('pageerror', e => { console.log('pageerror:', String(e).slice(0, 300)); fail(`${tag}: a page error: ${String(e).slice(0, 120)}`); });
    // the walk a player is given (the title's second way in), set out at night under a clear sky, as the owner found it
    await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); localStorage.setItem('bh-player', 'W'); sessionStorage.setItem('bh-walk-auto', JSON.stringify({ t: 'night', w: 'clear' })); } catch (e) { /* storage blocked */ } }, phone ? 'low' : 'high');
    await p.goto(`http://localhost:${process.env.PORT || 8800}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await p.waitForFunction(() => { const s = document.getElementById('game-stage'); return window.__game && window.__game.heli && s && s.classList.contains('walk-on'); }, null, { timeout: 1200000, polling: 1000 });
    await p.evaluate(async () => { const g = window.__game; if (g.heli.want) await g.heli.want(); });
    await p.waitForTimeout(3000);
    // held: only advance() moves the world from here, and frame() the camera with it
    await p.evaluate(() => { const g = window.__game; g.hold(true); g.advance(20); });
    // the spot: the arm of the Scramble with the most cars coming in, 14 m back from its line, on the road's middle
    const spot = await p.evaluate(() => {
      const g = window.__game, S = g.G.start.at, J = g.junctions.J.filter(j => j.scramble).sort((a, b) => Math.hypot(a.x - S[0], a.y - S[1]) - Math.hypot(b.x - S[0], b.y - S[1])).slice(0, 1);
      let best = null;
      for (const j of J) for (const a of j.arms) {
        const L = g.roadNet.L[a.line]; if (!L || L.len < 40) continue;
        const n = g.cars.live.filter(c => c.line === a.line).length;
        if (!best || n > best.n) best = { n, a, j, L };
      }
      const { a, L } = best, s = a.end === 0 ? a.back + 14 : L.len - a.back - 14, q = {};
      g.roadNet.at(a.line, s, q);
      const z = g.nav.groundBelow(q.x, q.y, q.z + 2);
      return { x: q.x, y: q.y, z, h: Math.atan2(q.hx, q.hy), line: a.line, cars: best.n, jx: best.j.x, jy: best.j.y };
    });
    console.log(`${tag}: the spot ${spot.x.toFixed(1)}, ${spot.y.toFixed(1)} (${spot.z.toFixed(1)} m) on line ${spot.line}, ${spot.cars} cars on it`);
    // (set down where no car is, as a pilot waits for the road under it to be clear: the traffic is held off it from 4 m up)
    // into the helicopter on its pad, flown (set) onto the spot, landed, and out of its door
    const landed = await p.evaluate(s => {
      const g = window.__game, st = g.heli.st, P = g.helipads[0].at;
      g.player.x = P[0] + 3; g.player.y = P[1] + 3; g.player.z = P[2]; g.enterHeli(); g.advance(1);
      for (let i = 0; i < 300 && g.cars.live.some(c => c.line >= 0 && Math.hypot(c.x - s.x, c.y - s.y) < 16); i++) g.advance(0.1);
      // (coming down onto it from 12 m over four seconds, as you fly it down: the traffic holds off from 8 m up)
      const log = [];
      for (let i = 0; i <= 40; i++) { Object.assign(st, { x: s.x, y: s.y, z: s.z + 12 * (1 - i / 40), h: s.h + Math.PI / 2, vx: 0, vy: 0, vz: 0, speed: 0, pitch: 0, roll: 0, landed: i === 40, scripted: i < 40 }); g.heli.place(); g.advance(0.1); const b = g.heliBlock(), n = g.cars.live.filter(c => c.line >= 0 && Math.hypot(c.x - s.x, c.y - s.y) < 9).length; if (i % 5 === 0) log.push(`${(st.z - s.z).toFixed(1)} m up: ${b ? 'held off' : 'open'}, ${n} near, ${g.heliFree() ? g.heliFree().size : '-'} under`); }
      st.scripted = false; g.advance(1.5);
      g.exitHeli(); g.advance(0.5);
      const F = g.heliFree(), close = g.cars.live.filter(c => c.line >= 0 && Math.hypot(c.x - st.x, c.y - st.y) < 9).map(c => `car ${g.cars.live.indexOf(c)} ${Math.hypot(c.x - st.x, c.y - st.y).toFixed(1)} m${F && F.has(c) ? ' (set down onto)' : ''}`);
      return { mode: g.player.mode, me: [g.player.x, g.player.y], d: Math.hypot(g.player.x - st.x, g.player.y - st.y), block: !!g.heliBlock(), close, log };
    }, spot);
    console.log(`${tag}: coming down: ${landed.log.join('; ')}; cars within 9 m once out: ${landed.close.join(', ') || 'none'}`);
    if (landed.mode !== 'foot') { fail(`${tag}: could not get out on the road (${landed.mode})`); await p.close(); continue; }
    if (!landed.block) fail(`${tag}: set down on the road, the helicopter is no obstacle to it (heliBlock null)`);
    else ok(`${tag}: down on the road and out, ${landed.d.toFixed(1)} m from it; it stands in the road as an obstacle`);
    // the measure, each step: the traffic's boxes against its hull (and its rotor's reach while it turns), the crowd in it
    await p.addScriptTag({ content: `window.__parkMeasure = (other) => {
      const g = window.__game, st = g.heli.st, hull = other ? [other] : g.heli.boxes(), R = 5.1, spin = !other && st.z - g.nav.groundBelow(st.x, st.y, st.z + 0.5) < 4;
      const corners = (x, y, h, hl, hw) => { const fx = Math.sin(h), fy = Math.cos(h); return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([u, v]) => [x + fx * hl * u - fy * hw * v, y + fy * hl * u + fx * hw * v]); };
      const meet = (A, B) => { for (const P of [A, B]) for (let i = 0; i < 4; i++) { const a = P[i], b = P[(i + 1) % 4], nx = b[1] - a[1], ny = a[0] - b[0];
        const pa = A.map(q => q[0] * nx + q[1] * ny), pb = B.map(q => q[0] * nx + q[1] * ny); if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false; } return true; };
      const H = hull.map(q => corners(q.x, q.y, q.h, q.hl, q.hw)), hits = [], free = (!other && g.heliFree()) || null;
      let caught = 0;
      for (const c of g.cars.live) {
        if (free && free.has(c)) { caught++; continue; } // (one it was set down onto, driving on out from under it: game.js heliFree)
        if (c.line < 0 || Math.abs(c.z - st.z) > 3 || Math.hypot(c.x - st.x, c.y - st.y) > 20) continue;
        const C = corners(c.x, c.y, c.h, c.half, c.hw);
        const who = ' (car ' + g.cars.live.indexOf(c) + ': ' + (c.why || '-') + ' ' + (c.youBy || '') + ', ' + c.v.toFixed(1) + ' m/s, ' + Math.hypot(c.x - st.x, c.y - st.y).toFixed(1) + ' m off)';
        if (H.some(q => meet(q, C))) hits.push('a car in the hull' + who);
        else if (spin) { const fx = Math.sin(c.h), fy = Math.cos(c.h), dx = st.x - c.x, dy = st.y - c.y, a = Math.max(-c.half, Math.min(c.half, dx * fx + dy * fy)), b2 = Math.max(-c.hw, Math.min(c.hw, -dx * fy + dy * fx));
          if (Math.hypot(c.x + fx * a - fy * b2 - st.x, c.y + fy * a + fx * b2 - st.y) < R) hits.push('a car under its rotor' + who); }
      }
      let walkers = 0;
      if (!other && g.crowd && g.crowd.P) for (let i = 0; i < g.crowd.active; i++) { const q = g.crowd.P[i]; if (q.line < 0 || Math.abs(q.z - st.z) > 3) continue; const d = Math.hypot(q.x - st.x, q.y - st.y);
        if ((spin && d < R) || H.some(B => meet(B, corners(q.x, q.y, 0, 0.2, 0.2)))) walkers++; }
      const near = g.cars.live.filter(c => c.line >= 0 && Math.hypot(c.x - st.x, c.y - st.y) < 30).length;
      const held = g.cars.live.filter(c => c.line >= 0 && c.why === 'you' && /^(heli|car)/.test(c.youBy || '')).length;
      return { hits, walkers, near, held, caught };
    };` });
    const run = (secs, opts = {}) => p.evaluate(([secs, opts]) => {
      const g = window.__game, st = g.heli.st, res = { hits: [], walkers: 0, near: 0, held: 0, caught: 0, left: null, home: null, path: [], t: 0 };
      for (let i = 0; i < secs * 10; i++) {
        if (opts.stay) { g.player.x = opts.stay[0]; g.player.y = opts.stay[1]; }
        if (opts.look) { g.cam.yaw = Math.atan2(st.x - g.player.x, st.y - g.player.y) + (opts.away ? Math.PI : 0); g.cam.yawTo = null; }
        g.advance(0.1); if (opts.cam) g.frame(1 / 30);
        if (opts.look) { // (the camera set by hand, behind you and on it, or turned from it: the chase camera follows its yaw only loosely, and a portrait phone sees 12 degrees either side)
          const c = g.camera, me = g.player, d = Math.hypot(st.x - me.x, st.y - me.y) || 1, k = opts.away ? -1 : 1, ux = k * (st.x - me.x) / d, uy = k * (st.y - me.y) / d;
          c.position.set(me.x - ux * 5, me.z + 2.2, -(me.y - uy * 5)); c.up.set(0, 1, 0); c.lookAt(me.x + ux * 40, st.z + (opts.away ? 1 : Math.max(1, st.z - me.z)), -(me.y + uy * 40)); c.updateMatrixWorld();
        }
        const m = window.__parkMeasure(opts.car);
        for (const x of m.hits) if (res.hits.length < 12) res.hits.push(`${(i / 10).toFixed(1)} s: ${x}`);
        res.walkers += m.walkers; res.near = Math.max(res.near, m.near); res.held = Math.max(res.held, m.held); res.caught = Math.max(res.caught, m.caught);
        const H = g.heliHome(), P = g.helipads[0].at, onPad = Math.hypot(st.x - P[0], st.y - P[1]) < 1 && Math.abs(st.z - P[2]) < 0.2;
        if ((H || onPad) && res.left == null) { res.left = i / 10; res.unseen = !H; }
        if (H) res.path = H.path.slice(-1)[0] ? res.path.concat([H.path[H.path.length - 1]]) : res.path;
        if (!H && res.left != null && onPad) { res.home = i / 10; break; }
        if (opts.untilUp && H && H.phase === 'up' && st.z > H.z0 + 8) break;
      }
      return res;
    }, [secs, opts]);
    const shot = async name => { await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 4; i++) g.frame(1 / 30); }); await p.waitForTimeout(400); await p.screenshot({ path: `${out}/${tag}-${name}.png`, timeout: 180000 }); };
    // you stand beside it for half a minute: it stays, and nothing drives into it
    const beside = await run(30, { stay: landed.me });
    if (beside.left != null) fail(`${tag}: it left while you stood beside it (${beside.left} s)`); else ok(`${tag}: it stays while you stand ${landed.d.toFixed(1)} m from it`);
    if (beside.hits.length) fail(`${tag}: the traffic drove into it: ${beside.hits.join('; ')}`); else ok(`${tag}: 30 s beside it, no car's box over its hull (${beside.near} cars within 30 m at most, ${beside.held} held short of it at once${beside.caught ? `, ${beside.caught} it was set down onto driving out from under it` : ''})`);
    if (beside.walkers) fail(`${tag}: walkers inside its hull: ${beside.walkers} walker-steps`);
    await p.evaluate(s => { const g = window.__game; g.cam.yaw = Math.atan2(s.x - g.player.x, s.y - g.player.y) + 0.5; g.cam.dist = 9; }, spot);
    await shot('1-on-road');
    // you walk away, 40 m along the footway, looking back at it: it starts up, lifts off and flies home
    const away = await p.evaluate(s => {
      const g = window.__game, st = g.heli.st;
      for (let r = 40; r < 90; r += 5) for (let k = 0; k < 16; k++) {
        const a = k * Math.PI / 8, x = st.x + Math.sin(a) * r, y = st.y + Math.cos(a) * r, f = g.nav.floorAt(x, y, s.z + 1.5);
        let open = true; // (it in plain sight from there: nothing standing between, at head height and over)
        for (let u = 0.1; u < 0.95 && open; u += 0.05) if (g.nav.groundBelow(x + (st.x - x) * u, y + (st.y - y) * u, s.z + 30) > s.z + 2.5) open = false;
        if (open && f && Math.abs(f.z - s.z) < 2 && g.nav.walk(x, y, f.z).ok && g.roadsNow.depth(x, y, f.z, 0.5) <= 0) { g.player.x = x; g.player.y = y; g.player.z = f.z; g.cam.yaw = Math.atan2(st.x - x, st.y - y); g.cam.dist = 6; return [x, y]; }
      }
      return null;
    }, spot);
    if (!away) { fail(`${tag}: no footway 40 m from the spot to walk to`); await p.close(); continue; }
    const go = await run(14, { stay: away, cam: true, look: true, untilUp: true });
    if (go.hits.length) fail(`${tag}: the traffic drove into it as it started up: ${go.hits.join('; ')}`);
    if (go.left == null) fail(`${tag}: walked away 40 m, it did not leave in 14 s (${await p.evaluate(() => window.__game.heliHomeWhy())})`);
    else if (go.unseen) fail(`${tag}: walked away with it in view, it was put back on its pad unseen instead of flown (${go.left} s; ${await p.evaluate(() => window.__game.heliHomeLast())}; you at ${away.map(v => v.toFixed(0))})`);
    else { ok(`${tag}: walked away, its pilot started it up after ${go.left} s`); // (from 30 m down the street it stood in, 3 m up, looking up at it: the camera set by hand, which a held world draws as it is; the road's own line is open)
      await p.evaluate(s => { const g = window.__game, st = g.heli.st, c = g.camera; for (const k of [1, -1]) { const x = s.x + Math.sin(s.h) * 30 * k, y = s.y + Math.cos(s.h) * 30 * k;
          let open = true; for (let u = 0.05; u < 0.95; u += 0.05) if (g.nav.groundBelow(x + (st.x - x) * u, y + (st.y - y) * u, s.z + 40) > s.z + 2) open = false;
          if (open || k === -1) { c.position.set(x, s.z + 3, -y); break; } }
        c.up.set(0, 1, 0); c.lookAt(st.x, st.z + 1.5, -st.y); c.updateMatrixWorld(); }, spot);
      await p.waitForTimeout(800); await p.screenshot({ path: `${out}/${tag}-2-lift-off.png`, timeout: 180000 }); }
    const fly = await run(90, { stay: away, cam: true, look: true });
    const path = go.path.concat(fly.path);
    if (fly.home == null) fail(`${tag}: it did not reach its pad in 90 s (at ${JSON.stringify(path.slice(-1)[0])})`);
    else ok(`${tag}: home on its pad ${fly.home} s after lifting clear (${path.length} steps)`);
    // its way, against the roofs under it and round its rotor: from 10 m over the street until 10 m over its pad
    const low = await p.evaluate(([path, s, CLEAR]) => {
      const g = window.__game, P = g.helipads[0].at; let worst = null;
      for (const [x, y, z] of path) {
        if (z < s.z + 10 && Math.hypot(x - s.x, y - s.y) < 8) continue;
        if (z < P[2] + 10 && Math.hypot(x - P[0], y - P[1]) < 8) continue;
        for (let k = 0; k < 9; k++) { const a = k * Math.PI / 4, r = k < 8 ? 8 : 0, q = g.nav.groundBelow(x + Math.sin(a) * r, y + Math.cos(a) * r, z + 0.2); const c = z - q; if (!worst || c < worst.c) worst = { c, at: [x, y, z] }; }
      }
      return worst;
    }, [path, spot, CLEAR]);
    if (low && low.c < CLEAR) fail(`${tag}: its way home came ${low.c.toFixed(1)} m over a roof at ${low.at.map(v => v.toFixed(0))}`);
    else ok(`${tag}: its way home cleared every roof by ${low ? low.c.toFixed(1) : '?'} m or more`);
    await p.evaluate(() => { const g = window.__game, st = g.heli.st; g.player.x = st.x + 14; g.player.y = st.y - 10; g.player.z = st.z; g.cam.yaw = Math.atan2(-14, 10); g.cam.dist = 10; });
    await shot('3-on-pad');
    // again, and walked away from with the camera turned from it: put back on its pad unseen, never flown out of sight
    await p.evaluate(s => {
      const g = window.__game, st = g.heli.st;
      Object.assign(st, { x: s.x, y: s.y, z: s.z, h: s.h + Math.PI / 2, landed: true, on: false, rotor: 0, scripted: false, door: 0, doorTo: 0 }); g.heli.place(); g.heli.group.visible = true;
    }, spot);
    const unseen = await run(30, { stay: away, cam: true, look: true, away: true });
    const P0 = await p.evaluate(() => { const g = window.__game, st = g.heli.st, P = g.helipads[0].at; return Math.hypot(st.x - P[0], st.y - P[1]) < 1 && Math.abs(st.z - P[2]) < 0.2; });
    if (!P0) fail(`${tag}: left with the camera turned from it, it was not put back on its pad`);
    else ok(`${tag}: left out of sight, it was put back on its pad unseen`);
    if (unseen.path.length > 5) fail(`${tag}: it flew while out of sight (${unseen.path.length} steps)`);
    // your own car left across a lane at the same spot: driven round or waited for, never through
    const car = await p.evaluate(s => {
      const g = window.__game, c = g.myCar();
      if (!c) return null;
      const st = c.D.st; Object.assign(st, { x: s.x, y: s.y, z: s.z, h: s.h, v: 0, speed: 0 }); if (c.D.place) c.D.place();
      return { half: c.C.half, hw: c.C.hw };
    }, spot);
    if (!car) console.log(`${tag}: no car of yours on this map: not measured`);
    else {
      const r = await run(30, { stay: away, car: { x: spot.x, y: spot.y, h: spot.h, hl: car.half, hw: car.hw } });
      if (r.hits.length) fail(`${tag}: the traffic drove into your car left in the lane: ${r.hits.join('; ')}`);
      else ok(`${tag}: your car left in the lane: 30 s, no car's box over it (${r.near} cars within 30 m at most, ${r.held} held short of it at once)`);
    }
    await p.close();
  }
  await b.close();
  console.log(failed ? `${failed} failure(s)` : 'all passed');
  process.exit(failed ? 1 : 0);
})();
