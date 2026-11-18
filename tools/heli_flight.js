// The story's flight (frame 5's way down from SHIBUYA SKY), measured frame by frame: does the helicopter hold steady
// in the air, and does it set you and the dog down outside it?
//   - steady: the helicopter's attitude (heading, pitch, bank) changes smoothly from one frame to the next whatever the
//     frame rate. Its attitude was once worked out from how far it had gone since the last frame (pitch = metres per
//     frame / 2, the nose wherever that step pointed, a leaf's flutter in its path): at an uneven frame rate the tail
//     shook up and down and the nose swung after the flutter in a hover. It is checked as the tail's own motion on the
//     screen, less the cabin's: the turn of the tail about the cabin, frame on frame, must not reverse back and forth.
//   - clear: once it is down and you are out, you stand outside its hull and so does the dog (both were set down at
//     the flight's end spot, in its cabin, whichever way its nose had come to point).
// Stills of each shot and of you out of its door. Exits 1 on a failure.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/heli_flight.js out_dir [WxH]
// SLOW=n: a frame in n is held a further 80 ms (an uneven frame rate, as a phone's in a flight over the lit city).
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/heli-flight', size = '1440x900'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number);
  const args = process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 500, isMobile: w < 500 });
  const errors = [];
  p.on('pageerror', e => { errors.push(String(e)); console.log('pageerror:', String(e).slice(0, 300)); });
  fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(t => { try { localStorage.setItem('oe3d-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  // DRAW=n: one frame in n is drawn, the others run the game without their draw calls (as tools/story_play.js): on a
  // software renderer a film of fifty seconds is otherwise most of an hour. The stills are of frames drawn whole
  const DRAW = +(process.env.DRAW || 0);
  if (DRAW > 1) await p.addInitScript(n => {
    const P = WebGL2RenderingContext.prototype, raf = window.requestAnimationFrame.bind(window), D = window.__draw = { all: false, on: true, frames: 0 };
    window.requestAnimationFrame = fn => raf(t => { D.on = D.all || D.frames++ % n === 0; fn(t); D.on = true; });
    for (const k of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements', 'blitFramebuffer']) { const f = P[k]; P[k] = function (...a) { if (D.on) return f.apply(this, a); }; }
  }, DRAW);
  const still = async path => { if (DRAW > 1) await p.evaluate(() => new Promise(r => { window.__draw.all = true; requestAnimationFrame(() => requestAnimationFrame(r)); })); await p.screenshot({ path }); if (DRAW > 1) await p.evaluate(() => { window.__draw.all = false; }); };
  // a case left at frame 5 and opened again: on the street, so the flight plays by itself (story.js frame: no pad near)
  await p.addInitScript(() => { try { localStorage.setItem('oe-story-late', JSON.stringify({ fi: 4, left: 3, prints: Array.from({ length: 4 }, (_, i) => ({ src: null, stamp: `frame ${i + 1}`, cap: '' })) })); } catch (e) { /* storage blocked */ } });
  // every frame the game draws, after it: the helicopter as drawn, the camera, the tail and the cabin on the screen
  await p.addInitScript(slow => {
    const raf = window.requestAnimationFrame.bind(window);
    let n = 0;
    window.__rec = null;
    window.requestAnimationFrame = fn => raf(t => {
      if (slow > 1 && window.__rec && ++n % slow === 0) { const e = performance.now() + 80; while (performance.now() < e) { /* a long frame */ } }
      fn(t);
      const R = window.__rec, g = window.__game;
      if (!R || !g || !g.heli || !g.heli.group.visible) return;
      const o = g.overture && g.overture(), st = g.heli.st, cam = g.camera || null;
      const V = window.THREE.Vector3, gr = g.heli.group;
      gr.updateMatrixWorld(true);
      const tail = new V(0.04, 2.12, -5.78).applyMatrix4(gr.matrixWorld), body = new V(0, 1.2, 0).applyMatrix4(gr.matrixWorld), nose = new V(0, 1.0, 4.4).applyMatrix4(gr.matrixWorld);
      const scr = v => { if (!cam) return null; const q = v.clone().project(cam); return [q.x * innerWidth / 2, -q.y * innerHeight / 2]; };
      if (R.last === g.t()) return; // (a frame the game did not move: a held or skipped one)
      R.last = g.t();
      R.f.push({ t: o && o.active ? o.t : -1, shot: o && o.active ? (o.shots.filter(q => o.t >= q.t0 - 1e-6).pop() || {}).id : '', x: st.x, y: st.y, z: st.z, h: st.h, pitch: st.pitch, roll: st.roll, landed: st.landed, tail: scr(tail), body: scr(body), nose: scr(nose), cam: cam ? [cam.position.x, cam.position.y, cam.position.z] : null });
    });
  }, +(process.env.SLOW || 0));
  await p.goto(`http://localhost:${process.env.PORT || 8800}/${process.env.Q || ''}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => document.getElementById('gt-play').click());
  const beat = () => p.evaluate(() => { const g = window.__game, s = g && g.story && g.story.state; return s ? s.beat : ''; });
  // (the opening film, before the frame comes, is skipped as a player would: on a software renderer it is many minutes)
  for (let i = 0; i < 2400 && (await beat()) !== 'flight'; i++) {
    await p.evaluate(() => { const g = window.__game, o = g.overture && g.overture(), s = g.story && g.story.state; if (o && o.active && s && s.beat !== 'flight' && o.skip) o.skip(); });
    await p.waitForTimeout(500);
  }
  if ((await beat()) !== 'flight') { console.log('the flight never began: beat', await beat()); await b.close(); process.exit(1); }
  await p.evaluate(() => { window.__rec = { f: [], last: null }; });
  console.log('the flight is on');
  // a still in each shot, and the film played out
  const shots = await p.evaluate(() => { const o = window.__game.overture(); return o.shots.map(q => ({ id: q.id, t0: q.t0, dur: q.dur })); });
  const seen = new Set();
  for (let i = 0; i < 3000 && (await beat()) === 'flight'; i++) {
    const t = await p.evaluate(() => { const o = window.__game.overture(); return o && o.active ? o.t : null; });
    if (t == null) break;
    for (const s of shots) {
      for (const k of [0.15, 0.5, 0.9]) {
        const key = `${s.id}-${k}`;
        if (!seen.has(key) && t >= s.t0 + s.dur * k && t < s.t0 + s.dur) { seen.add(key); await still(`${out}/flight-${s.id}-${Math.round(k * 100)}.png`); }
      }
    }
    await p.waitForTimeout(150);
  }
  // out: where you, the dog and the helicopter are, and a still a moment later
  const after = async () => p.evaluate(() => {
    const g = window.__game, st = g.heli.st, d = g.guideMade && g.guideMade(), me = g.player;
    const hull = g.heli.boxes ? g.heli.boxes() : [];
    const inside = (x, y, r) => hull.filter(q => { const fx = Math.sin(q.h), fy = Math.cos(q.h), dx = x - q.x, dy = y - q.y; return Math.abs(dx * fx + dy * fy) < q.hl + r && Math.abs(-dx * fy + dy * fx) < q.hw + r; }).length > 0;
    // (in the model's own frame, as a check that needs no boxes of the helicopter's: forward along its nose, right of it)
    const local = (x, y) => { const fx = Math.sin(st.h), fy = Math.cos(st.h), dx = x - st.x, dy = y - st.y; return [+(dx * fx + dy * fy).toFixed(2), +(dx * fy - dy * fx).toFixed(2)]; };
    return { heli: [+st.x.toFixed(2), +st.y.toFixed(2), +st.z.toFixed(2), +(st.h * 180 / Math.PI).toFixed(1)], seen: g.heli.group.visible, landed: st.landed,
      me: [+me.x.toFixed(2), +me.y.toFixed(2), +me.z.toFixed(2)], meLocal: local(me.x, me.y), meIn: inside(me.x, me.y, 0.3), meShown: me.rig.root.visible,
      dog: d && d.ready ? [+d.x.toFixed(2), +d.y.toFixed(2), +d.z.toFixed(2)] : null, dogLocal: d && d.ready ? local(d.x, d.y) : null, dogIn: d && d.ready ? inside(d.x, d.y, 0.35) : null, beat: g.story.state.beat };
  });
  const A = [];
  for (let k = 0; k < 6; k++) { A.push(await after()); if (k === 0) await still(`${out}/out-0.png`); await p.waitForTimeout(400); }
  await still(`${out}/out-1.png`);
  console.log('after the flight:', JSON.stringify(A[0]));
  console.log('a moment later:', JSON.stringify(A[A.length - 1]));
  const R = await p.evaluate(() => window.__rec.f);
  fs.writeFileSync(`${out}/flight.json`, JSON.stringify(R));
  // steady: the tail's turn about the cabin on the screen (its offset from the cabin), frame on frame. A steady turn
  // changes it in one direction for many frames; a shake reverses it every frame or two. Counted per shot over the
  // frames it is in the air and moving: reversals of the offset's change bigger than 1.5 px both ways
  const byShot = {};
  for (let i = 2; i < R.length; i++) {
    const a = R[i - 2], m = R[i - 1], c = R[i];
    if (!a.tail || !c.tail || a.shot !== c.shot || c.landed) continue;
    const off = q => [q.tail[0] - q.body[0], q.tail[1] - q.body[1]];
    const o0 = off(a), o1 = off(m), o2 = off(c), d1 = [o1[0] - o0[0], o1[1] - o0[1]], d2 = [o2[0] - o1[0], o2[1] - o1[1]];
    const S = byShot[c.shot] = byShot[c.shot] || { n: 0, flips: 0, dh: 0, dp: 0, maxDh: 0, maxDp: 0 };
    S.n++;
    for (const k of [0, 1]) if (Math.sign(d1[k]) !== Math.sign(d2[k]) && Math.abs(d1[k]) > 1.5 && Math.abs(d2[k]) > 1.5) { S.flips++; break; }
    // and the attitude itself: heading and pitch, how much they changed against how much they did the frame before
    const ddh = Math.abs(Math.atan2(Math.sin(c.h - m.h), Math.cos(c.h - m.h)) - Math.atan2(Math.sin(m.h - a.h), Math.cos(m.h - a.h)));
    const ddp = Math.abs((c.pitch - m.pitch) - (m.pitch - a.pitch));
    S.dh += ddh; S.dp += ddp; S.maxDh = Math.max(S.maxDh, ddh); S.maxDp = Math.max(S.maxDp, ddp);
  }
  const fails = [];
  for (const [id, S] of Object.entries(byShot)) {
    const share = S.flips / Math.max(1, S.n);
    console.log(`shot ${id}: ${S.n} frames, the tail reversed about the cabin in ${S.flips} (${(share * 100).toFixed(0)}%), heading's jerk ${(S.maxDh * 180 / Math.PI).toFixed(2)}° at most, pitch's ${(S.maxDp * 180 / Math.PI).toFixed(2)}° at most`);
    if (share > 0.08) fails.push(`shot ${id}: the tail shakes about the cabin (reversed in ${(share * 100).toFixed(0)}% of frames)`);
    if (S.maxDp > 2 * Math.PI / 180) fails.push(`shot ${id}: the pitch jerks ${(S.maxDp * 180 / Math.PI).toFixed(1)}° in a frame`);
    if (S.maxDh > 3 * Math.PI / 180) fails.push(`shot ${id}: the heading jerks ${(S.maxDh * 180 / Math.PI).toFixed(1)}° in a frame`);
  }
  for (const q of A) {
    if (q.meIn) fails.push(`you stand inside the helicopter (${q.meLocal} m from its mast, forward and right)`);
    if (q.dogIn) fails.push(`the dog stands inside the helicopter (${q.dogLocal} m from its mast, forward and right)`);
  }
  if (!A[0].meLocal) fails.push('nothing to measure');
  for (const e of errors) fails.push(`page error: ${e.slice(0, 200)}`);
  const uniq = [...new Set(fails)];
  for (const f of uniq) console.log('FAIL', f);
  console.log(uniq.length ? `${uniq.length} failures` : 'the flight holds steady and sets you both down outside it');
  await b.close();
  process.exit(uniq.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
