// Steering your car (issue: mouse steering, 27 November 2026): the keyboard's steering measured, and a stretch driven with
// the keys and with mouse steering on, each held to its lane.
//   xvfb-run -a node tools/mouse_steer.js [out_dir] [WxH] [hour]
// 1. The keys: how fast the wheel turns in (D held) and back (let go), the lock it reaches, the yaw it gives, at 0, 8 and 16
//    m/s, stepped at 30 and at 60 frames a second; and a tap of one frame's length at each rate. Printed as a table.
// 2. The drive: your car at the wheel where it waits, driven SECS (12) of the game's time at about 8 m/s by a driver that
//    reads its lane (pilot.js laneHere, the lane keeping's own steer) and presses only what a player has: A and D, or the
//    mouse's sideways movement under pointer lock (mousemove events with movementX, the lock taken by a click into the
//    picture or, where the browser will not grant it, held by the module's harness switch). Fails where the car leaves
//    its lane by more than OFF (1.3) metres, or where mouse steering moved the wheel less than the keys did (it did nothing).
//    Then the lock let go by the menu (Escape), and the car stepped out of: the lock must be gone each time.
// Stills of each drive at its end, desktop only (a phone has the touch stick: PHONE=1 checks the setting is hidden there and
// the stick still steers).
const { chromium, devices } = require('playwright');
const fs = require('fs');
const [,, OUT = '/tmp/mouse-steer', size = '1440x900', hour = 'dusk'] = process.argv;
const [W, H] = size.split('x').map(Number);
const PHONE = !!process.env.PHONE, SECS = +(process.env.SECS || 12), OFF = +(process.env.OFF || 1.3), STILLS = process.env.STILLS !== '0';
const tag = PHONE ? 'phone' : 'desk';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const ctx = await b.newContext(PHONE ? Object.assign({}, devices['iPhone 13'], { deviceScaleFactor: 1 }) : { viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => { errors.push(String(e).slice(0, 300)); console.log('pageerror', errors[errors.length - 1]); });
  await p.addInitScript(([t]) => {
    try { localStorage.setItem('bh-quality', 'high'); localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); sessionStorage.setItem('bh-walk-auto', JSON.stringify({ t, w: 'clear', film: false })); } catch (e) { /* storage blocked */ }
  }, [hour]);
  await p.goto(`http://localhost:${process.env.PORT || 8800}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const s = document.getElementById('game-stage'); return s && s.classList.contains('walk-on'); }, null, { timeout: 900000, polling: 500 });
  await p.waitForFunction(() => window.__game.myCar && window.__game.myCar(), null, { timeout: 300000, polling: 500 });
  let bad = 0;
  const fail = m => { console.log('FAIL ' + m); bad++; };
  const shot = async n => { if (!STILLS) return; await p.evaluate(() => { window.__game.hold(false); }); await p.waitForTimeout(1500); await p.screenshot({ path: `${OUT}/${tag}-${n}.png`, timeout: 180000 }); await p.evaluate(() => window.__game.hold(true)); };
  const seat = () => p.evaluate(() => {
    const g = window.__game, st = g.myCar().D.st;
    g.hold(true);
    for (let k = 0; k < 2 && g.player.mode !== 'car'; k++) {
      const s = (g.KEEP === 'left' ? 1 : -1) * (k ? -1 : 1);
      g.player.x = st.x + Math.cos(st.h) * 2.6 * s; g.player.y = st.y - Math.sin(st.h) * 2.6 * s; g.player.z = st.z;
      g.advance(0.3); g.enterCar();
      for (let i = 0; i < 24 && g.player.mode !== 'car'; i++) g.advance(0.5);
    }
    g.advance(1.5);
    return g.player.mode;
  });
  if (await seat() !== 'car') { fail('could not get into the car'); await b.close(); process.exit(1); }
  const start = await p.evaluate(() => { const st = window.__game.myCar().D.st; return { x: st.x, y: st.y, z: st.z, h: st.h }; });
  // the drive's start: the longest straight piece of road near the car (not the expressway overhead), in its lane, 10 m in
  // (from where the car waits, the first junction's lane read jumps 3 m across, and a driver chases it)
  const road = await p.evaluate(start => {
    const g = window.__game, N = g.roadNet, rq = {}, a = {}, c = {}, keep = g.KEEP === 'left' ? 1 : -1;
    let best = null;
    N.L.forEach((l, i) => {
      if (!(l.len > 130) || /motorway/.test(l.c || '')) return;
      N.at(i, 0, a); N.at(i, l.len, c);
      if (Math.hypot(c.x - a.x, c.y - a.y) < l.len * 0.985 || Math.abs(a.z - start.z) > 6 || Math.hypot(a.x - start.x, a.y - start.y) > 700) return;
      if (!best || l.len > best.len) best = { i, len: l.len, dir: l.ow < 0 ? -1 : 1 };
    });
    if (!best) return null;
    const s0 = best.dir > 0 ? 10 : best.len - 10;
    N.at(best.i, s0, rq);
    const hx = rq.hx * best.dir, hy = rq.hy * best.dir, off = OECars.LANE * keep;
    return { line: best.i, len: Math.round(best.len), c: N.L[best.i].c, x: rq.x - hy * off, y: rq.y + hx * off, z: rq.z, h: Math.atan2(hx, hy) };
  }, start);
  if (road) { console.log(`the drive: road piece ${road.line} (${road.c}, ${road.len} m, straight) from ${road.x.toFixed(0)},${road.y.toFixed(0)}`); Object.assign(start, road); }
  else console.log('no straight road near: the drive starts where the car waits');

  if (PHONE) {
    const r = await p.evaluate(() => {
      const g = window.__game, st = g.myCar().D.st, f = document.getElementById('gm-steer'), field = f && f.closest('.field');
      const h0 = st.h;
      for (let i = 0; i < 60; i++) { g.joy.x = 0.8; g.joy.y = 0.6; g.frame(1 / 30); }
      g.joy.x = g.joy.y = 0;
      return { hidden: !field || field.hidden || getComputedStyle(field).display === 'none', turned: +(st.h - h0).toFixed(2), speed: +st.speed.toFixed(1), steer: !!g.msteer && g.msteer.enabled };
    });
    console.log(`phone: setting hidden ${r.hidden}, the stick held right 2 s turned the car ${r.turned} rad at ${r.speed} m/s`);
    if (!r.hidden) fail('the mouse steering setting shows on a phone');
    if (Math.abs(r.turned) < 0.2) fail('the touch stick did not steer the car');
    await shot('stick');
    console.log(errors.length ? `${errors.length} page errors` : 'no page errors');
    await b.close(); process.exit(bad || errors.length ? 1 : 0);
  }

  // 1. the keys measured
  const rows = await p.evaluate(start => {
    const g = window.__game, car = g.myCar(), st = car.D.st, out = [];
    const reset = () => { Object.assign(st, { x: start.x, y: start.y, z: start.z, h: start.h, vx: 0, vy: 0, r: 0, steer: 0 }); car.C.place(start.x, start.y, start.z, start.h); };
    for (const fps of [30, 60]) for (const v of [0, 8, 16]) {
      const dt = 1 / fps;
      reset();
      // (the speed held each frame, as on a long straight: the car is not driven far, 1.2 s)
      let t = 0, peak = 0, t90 = null, back = null, lock = 0, yaw = 0, rel = null;
      const tr = [];
      for (; t < 1.2; t += dt) {
        st.vx = Math.sin(st.h) * v; st.vy = Math.cos(st.h) * v;
        if (t < 0.6) g.keys.add('KeyD'); else { g.keys.delete('KeyD'); if (rel == null) rel = t; }
        g.frame(dt);
        tr.push([t, st.steer]);
        if (t < 0.6) { peak = Math.max(peak, st.steer); yaw = Math.max(yaw, st.r); }
      }
      g.keys.delete('KeyD');
      lock = peak;
      for (const [tt, s] of tr) { if (t90 == null && s >= 0.9 * lock) t90 = tt + dt; if (tt >= rel && back == null && s <= 0.1 * lock) back = tt + dt - rel; }
      // a tap: one frame of D, and what the heading did over the next second
      reset();
      const h0 = st.h;
      let tapPeak = 0;
      for (let u = 0; u < 1; u += dt) { st.vx = Math.sin(st.h) * v; st.vy = Math.cos(st.h) * v; if (u < dt * 0.5) g.keys.add('KeyD'); else g.keys.delete('KeyD'); g.frame(dt); tapPeak = Math.max(tapPeak, st.steer); }
      g.keys.delete('KeyD');
      out.push({ fps, v, lock: +lock.toFixed(3), t90: t90 == null ? null : +t90.toFixed(3), back: back == null ? null : +back.toFixed(3), yaw: +yaw.toFixed(2), tap: +tapPeak.toFixed(3), tapTurn: +((st.h - h0) * 180 / Math.PI).toFixed(2) });
    }
    reset();
    return out;
  }, start);
  console.log('the keys (D held 0.6 s, then let go):');
  console.log(' fps  m/s   lock rad  to 90% s  back s  yaw rad/s  one-frame tap: wheel rad, turn deg');
  for (const r of rows) console.log(` ${String(r.fps).padStart(3)}  ${String(r.v).padStart(3)}   ${String(r.lock).padEnd(8)}  ${String(r.t90).padEnd(8)}  ${String(r.back).padEnd(6)}  ${String(r.yaw).padEnd(9)}  ${r.tap}, ${r.tapTurn}`);
  for (const v of [0, 8, 16]) {
    const a = rows.find(r => r.fps === 30 && r.v === v), c = rows.find(r => r.fps === 60 && r.v === v);
    if (Math.abs(a.lock - c.lock) > 0.02 || Math.abs((a.t90 || 0) - (c.t90 || 0)) > 0.05) fail(`the keys steer differently at 30 and 60 fps at ${v} m/s (lock ${a.lock}/${c.lock}, to 90% ${a.t90}/${c.t90} s)`);
  }

  // 2. the drive: keys, then the mouse
  const drive = async how => {
    await p.evaluate(start => { const g = window.__game, car = g.myCar(), st = car.D.st; Object.assign(st, { x: start.x, y: start.y, z: start.z, h: start.h, vx: 0, vy: 0, r: 0, steer: 0 }); car.C.place(start.x, start.y, start.z, start.h); g.advance(0.5); }, start);
    if (how === 'mouse') {
      await p.evaluate(() => { const m = window.__game.msteer; m.set(true); });
      // the lock as a player takes it: a click into the picture
      await p.evaluate(() => window.__game.hold(false));
      await p.mouse.click(W / 2, H / 2);
      await p.waitForTimeout(600);
      const real = await p.evaluate(() => !!document.pointerLockElement);
      await p.evaluate(real => { const g = window.__game; g.hold(true); if (!real) g.msteer.harness(true); }, real);
      console.log(`mouse: the pointer lock ${real ? 'granted by the browser on the click' : 'not granted here (no focus): held by the harness switch'}`);
    }
    const r = await p.evaluate(({ how, SECS }) => {
      const g = window.__game, st = g.myCar().D.st, m = g.msteer;
      let maxOff = 0, n = 0, sumOff = 0, wheel = 0, dist = 0, px = st.x, py = st.y, lost = 0, moved = 0, joined = false, prevD = null, jumps = 0;
      const trace = [];
      for (let t = 0; t < SECS; t += 1 / 30) {
        const L = g.laneHere(st);
        // (a driver's eye on the lane: the lane keeping's law (autopilot.js laneKeep), held twice as firmly, as a player watching it)
        const v = Math.max(3, Math.abs(st.v)), lock = 0.62 / (1 + v / 13), Wn = 2.0;
        const want = L ? Math.max(-1, Math.min(1, Math.atan(((L.curv || 0) - Wn * Wn * L.d / (v * v) - 2.3 * Wn * L.dh / v) * 2.6) / lock)) : 0;
        if (st.speed < 8) g.keys.add('KeyW'); else g.keys.delete('KeyW');
        if (how === 'keys') {
          // (a player's thumb: the key held while the wheel wants more than a little that way)
          g.keys.delete('KeyA'); g.keys.delete('KeyD');
          if (want > 0.12) g.keys.add('KeyD'); else if (want < -0.12) g.keys.add('KeyA');
        } else {
          // (the hand: the mouse moved towards where the wheel should be, a few pixels a frame as a hand moves it)
          const dx = Math.max(-40, Math.min(40, Math.round((want - m.pos) / m.gain(st.speed) * 0.5)));
          if (dx) { document.dispatchEvent(new MouseEvent('mousemove', { movementX: dx, movementY: 0, bubbles: true })); moved += Math.abs(dx); }
        }
        g.advance(1 / 30);
        // (counted once the car has pulled out from the kerb into its lane)
        if (L && prevD != null && Math.abs(L.d - prevD) > 1.2) { joined = false; jumps++; } // (the lane read jumped to another line)
        prevD = L ? L.d : null;
        if (L && Math.abs(L.d) < 0.6) joined = true;
        // (not across a junction's turn, where the lane read is another road's)
        if (L && joined && st.speed > 3 && Math.abs(L.dh) < 0.45) { const off = Math.abs(L.d); maxOff = Math.max(maxOff, off); sumOff += off; n++; } else if (!L) lost++;
        if (Math.round(t * 30) % 15 === 0) trace.push(`${t.toFixed(1)} s ${st.x.toFixed(0)},${st.y.toFixed(0)} v ${st.speed.toFixed(1)} lane ${L ? L.d.toFixed(2) + ' dh ' + L.dh.toFixed(2) : '-'} want ${want.toFixed(2)} wheel ${st.steer.toFixed(3)}${m ? ' mouse ' + m.pos.toFixed(2) : ''}`);
        wheel += Math.abs(st.steer) / 30;
        dist += Math.hypot(st.x - px, st.y - py); px = st.x; py = st.y;
      }
      for (const c of ['KeyW', 'KeyA', 'KeyD']) g.keys.delete(c);
      return { trace, joined, jumps, maxOff: +maxOff.toFixed(2), meanOff: n ? +(sumOff / n).toFixed(2) : null, wheel: +wheel.toFixed(3), dist: Math.round(dist), lost, moved, at: [Math.round(st.x), Math.round(st.y)] };
    }, { how, SECS });
    if (process.env.LOG) for (const l of r.trace) console.log('   ' + l);
    if (!r.joined) fail(`${how}: the car never came into its lane`);
    console.log(`${how}: ${r.dist} m in ${SECS} s, off its lane at most ${r.maxOff} m (mean ${r.meanOff}), the wheel turned ${r.wheel} rad·s${how === 'mouse' ? `, the mouse moved ${r.moved} px` : ''}${r.jumps ? `, the lane read jumped ${r.jumps} times` : ''}${r.lost ? `, no lane for ${(r.lost / 30).toFixed(1)} s` : ''}`);
    if (r.dist < SECS * 4) fail(`${how}: the car went only ${r.dist} m`);
    if (r.maxOff > OFF) fail(`${how}: the car left its lane by ${r.maxOff} m`);
    await shot(how);
    return r;
  };
  const keys = await drive('keys');
  const mouse = await drive('mouse');
  if (mouse.wheel < 0.02 && keys.wheel > 0.02) fail('mouse steering did not move the wheel');
  // let go: the menu, then out of the car
  const lets = await p.evaluate(() => {
    const g = window.__game, m = g.msteer, out = {};
    document.dispatchEvent(new MouseEvent('mousemove', { movementX: 200, movementY: 0, bubbles: true }));
    g.advance(1 / 30);
    out.before = m.locked;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
    g.frame(1 / 30);
    out.menu = !document.getElementById('g-menu').hidden;
    out.afterMenu = m.locked;
    out.pos = m.pos;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
    g.frame(1 / 30);
    m.harness(true); g.frame(1 / 30);
    const st = g.myCar().D.st; st.vx = st.vy = 0; g.advance(0.5);
    g.exitCar(); for (let t = 0; t < 6 && g.player.mode !== 'foot'; t += 0.5) g.advance(0.5);
    g.frame(1 / 30); // (the next frame lets it go)
    out.mode = g.player.mode; out.afterOut = m.locked;
    m.set(false);
    return out;
  });
  console.log(`let go: locked before ${lets.before}; the menu up ${lets.menu}, locked after it ${lets.afterMenu} (wheel ${lets.pos}); out of the car (${lets.mode}), locked ${lets.afterOut}`);
  if (!lets.before) fail('mouse steering was not locked before the menu');
  if (lets.afterMenu) fail('the menu left the mouse locked');
  if (lets.afterOut) fail('stepping out of the car left the mouse locked');
  // the menu with the setting on, as a player finds it
  if (STILLS) {
    const menu = await p.evaluate(() => { const g = window.__game; g.msteer.set(true); window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true })); const m = document.getElementById('g-menu'), f = document.getElementById('gm-steer'); if (f) f.scrollIntoView({ block: 'center' }); return { up: !m.hidden, on: f && f.querySelector('[data-m="mouse"]').getAttribute('aria-pressed'), keys: [...document.querySelectorAll('.gk-mouse')].filter(e => getComputedStyle(e).display !== 'none').length }; document.querySelectorAll('#gw-opts, #gw-keys').forEach(d => { d.open = true; }); const f2 = document.getElementById('gm-steer'); if (f2) f2.scrollIntoView({ block: 'center' }); });
    console.log(`menu: up ${menu.up}, On pressed ${menu.on}, the keys table's mouse lines shown ${menu.keys}`);
    if (menu.on !== 'true' || !menu.keys) fail('the menu does not show mouse steering on');
    const where = await p.evaluate(() => { const f = document.getElementById('gm-steer'), d = f && f.closest('details'); for (const e of document.querySelectorAll('details.gw-fold')) e.setAttribute('open', ''); return d ? d.id : f ? 'not in a fold: ' + (f.closest('[id]') || {}).id : 'missing'; });
    console.log(`menu: the steering field is in ${where}`);
    await p.waitForTimeout(800); await p.screenshot({ path: `${OUT}/${tag}-menu.png` });
    const fold = await p.$('#gw-opts'); if (fold) await fold.screenshot({ path: `${OUT}/${tag}-menu-options.png` }).catch(e => console.log('fold still: ' + String(e).slice(0, 120)));
    const keysFold = await p.$('#gw-keys'); if (keysFold) await keysFold.screenshot({ path: `${OUT}/${tag}-menu-keys.png` }).catch(() => {});
    await p.evaluate(() => { window.__game.msteer.set(false); });
  }
  console.log(errors.length ? `${errors.length} page errors` : 'no page errors');
  await b.close();
  process.exit(bad || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
