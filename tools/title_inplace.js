// The menus' Title screen in place (issue 215, game.js parkTitle, ?inplace=1), on a phone's page (390x844, touch) or a
// desktop's: a case kept at frame 3 taken up, then the menu's Title screen and Continue N times; the walk the same. Fails
// if:
//   - the page loads again for either (it is to stay the same page);
//   - the title is not on its menu, usable, within 2 s of the press (or six of the page's frames where a frame is slower),
//     or anything of the mode's interface shows over it;
//   - the mode taken up is not where it was: the case's frame, beat and prints, the player's place within 0.5 m, the
//     street's hour within a minute and its sky; for the walk, its hour and sky;
//   - memory grows over the second half of the switches: the JS heap after a collection more than 8 MB, or any
//     geometry or program the renderer counts, or textures by more than 12 (each counted at its first draw, as the
//     crowd brings a face or a sign into view, switch or none: TEXWHO=1 names where each was made). The first half let the title's view and the mode's own world
//     stream in what they see (measured on 24 Nov: the walk's one step of 78 geometries and 21 programs at the fourth
//     visit, the case's textures 374 to 379 by the ninth, flat to the twentieth; CONTROL=1 stays in the mode for the
//     same time without a switch, EACH=1 prints every round);
//   - the other mode's way in, from a parked case, does not open the page once, straight into the walk.
// Stills of the title over each parked mode and of each taken up again go in out_dir.
//   xvfb-run -a node tools/title_inplace.js out_dir [WxH] [switches]
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/title-inplace', size = '390x844', N = '10'] = process.argv;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const [w, h] = size.split('x').map(Number), phone = w < 500;
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, hasTouch: phone, isMobile: phone });
  const PORT = process.env.PORT || 8800, URL0 = `http://localhost:${PORT}/?inplace=1`;
  const errors = [], fail = m => { errors.push(m); console.log(`FAIL ${m}`); }, ok = m => console.log(`ok   ${m}`);
  let loads = 0, expect = 0;
  p.on('framenavigated', f => { if (f === p.mainFrame()) loads++; });
  p.on('pageerror', e => fail(`pageerror: ${String(e).slice(0, 200)}`));
  // (what the page holds that a switch could leave behind: WebGL's own memory as asked of it, tools/gl_mem.js; the event
  // listeners added and not taken off, by target and type; the intervals running; the timeouts waiting)
  await p.addInitScript(require('./gl_mem').hook);
  await p.addInitScript(() => {
    const L = window.__lis = new WeakMap(); let n = 0; const T = window.__timers = { iv: new Set(), to: new Set() };
    const add = EventTarget.prototype.addEventListener, rem = EventTarget.prototype.removeEventListener;
    const key = (type, f, o) => `${type}|${typeof o === 'boolean' ? o : !!(o && o.capture)}`;
    EventTarget.prototype.addEventListener = function (type, f, o) { if (f) { let m = L.get(this); if (!m) L.set(this, m = new Map()); const k = key(type, f, o); let s2 = m.get(k); if (!s2) m.set(k, s2 = new Set()); if (!s2.has(f)) { s2.add(f); n++; } } return add.call(this, type, f, o); };
    EventTarget.prototype.removeEventListener = function (type, f, o) { const m = L.get(this), s2 = m && m.get(key(type, f, o)); if (s2 && s2.delete(f)) n--; return rem.call(this, type, f, o); };
    window.__lisN = () => n;
    const si = window.setInterval, ci = window.clearInterval, st = window.setTimeout, ct = window.clearTimeout;
    window.setInterval = function (...a) { const id = si.apply(this, a); T.iv.add(id); return id; };
    window.clearInterval = function (id) { T.iv.delete(id); return ci.call(this, id); };
    window.setTimeout = function (f, ...a) { let id; id = st.call(this, typeof f === 'function' ? function (...b) { T.to.delete(id); return f.apply(this, b); } : f, ...a); T.to.add(id); return id; };
    window.clearTimeout = function (id) { T.to.delete(id); return ct.call(this, id); };
  });
  await p.addInitScript(() => { try { if (sessionStorage.getItem('ti-seeded')) return; sessionStorage.setItem('ti-seeded', '1'); localStorage.setItem('bh-player', 'W'); localStorage.setItem('bh-story-late', JSON.stringify({ fi: 2, left: 5, prints: [0, 1].map(i => ({ src: null, stamp: `frame ${i + 1}`, cap: '' })) })); } catch (e) { /* storage blocked */ } });
  const tap = async sel => { const r = await p.locator(sel).first().boundingBox(); if (!r) return fail(`${sel}: not on the screen`); const x = r.x + r.width / 2, y = r.y + r.height / 2; if (phone) await p.touchscreen.tap(x, y); else await p.mouse.click(x, y); };
  const titleUp = () => p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden && t.dataset.screen === 'menu' && getComputedStyle(t).visibility !== 'hidden'; }, null, { timeout: 900000, polling: 50 });
  const shot = n => p.screenshot({ path: `${out}/${phone ? 'phone' : 'desk'}-${n}.png`, timeout: 120000 }).catch(() => console.log(`(no still ${n})`));
  const snap = () => p.evaluate(() => { const g = window.__game, s = g.story.state, c = g.clock; return { fi: s.fi, phase: s.phase, beat: s.beat, prints: s.prints.length, at: [g.player.x, g.player.y, g.player.z], min: c.min, sky: g.weather ? g.weather.state.kind : '', mode: g.player.mode }; });
  const shown = () => p.evaluate(() => [...document.querySelectorAll('#g-story-goal, #g-story-frames, #g-story-menu, #g-walk-acts, #g-walk-where, #gd, #g-btns, #g-touch')].filter(e => { const r = e.getBoundingClientRect(), c = getComputedStyle(e); return !e.closest('[hidden]') && r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && +c.opacity > 0.05; }).map(e => e.id));
  const mem = async () => { await p.evaluate(() => { if (window.gc) { window.gc(); window.gc(); } }); await p.waitForTimeout(500); return p.evaluate(() => { const i = window.__game.renderer.info; return { heap: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0, geo: i.memory.geometries, tex: i.memory.textures, prog: (i.programs || []).length, gpu: window.__mem ? +(window.__mem.sum / 1048576).toFixed(1) : 0, lis: window.__lisN ? window.__lisN() : 0, iv: window.__timers ? window.__timers.iv.size : 0, to: window.__timers ? window.__timers.to.size : 0 }; }); };
  const openMenu = async mode => { if (mode === 'walk') await tap('#g-walk-acts [data-do="menu"]'); else await tap('#g-story-menu'); await p.waitForFunction(() => !document.getElementById('g-menu').hidden, null, { timeout: 20000 }); await p.waitForTimeout(400); };
  const near = (a, b2) => Math.hypot(a.at[0] - b2.at[0], a.at[1] - b2.at[1], a.at[2] - b2.at[2]);
  // (the world settled first: what streams in after a mode sets out, the late parts, its people's faces and pictures, is
  // not counted against the switches. Read every 5 s until two readings agree, for two minutes at most)
  const settle = async label => { let a = await mem(); for (let i = 0; i < 24; i++) { await p.waitForTimeout(5000); const c = await mem(); if (c.geo === a.geo && c.tex === a.tex && c.prog === a.prog) { console.log(`  ${label}: settled ${JSON.stringify(c)}`); return; } a = c; } console.log(`  ${label}: still streaming after 2 min ${JSON.stringify(a)}`); };
  // one mode, N times out to the title and back in by its own way
  const rounds = async (mode, way, inMode) => {
    await settle(mode);
    let m0 = null, m1 = null, worst = 0, back = 0;
    for (let k = 0; k < +N; k++) {
      const before = await snap();
      if (process.env.CONTROL) { await p.waitForTimeout(4500); // (CONTROL=1: the same time in the mode, no switch: what grows by itself)
        if (k === Math.floor(+N / 2) - 1) m0 = await mem(); if (k >= Math.floor(+N / 2) - 1) m1 = await mem(); continue; }
      await openMenu(mode);
      if (k === 0) await shot(`${mode}-menu`);
      const t0 = Date.now(); await tap('#gm-title'); await titleUp(); const dt = (Date.now() - t0) / 1000; worst = Math.max(worst, dt);
      await p.waitForTimeout(1500);
      const left = await shown(); if (left.length) fail(`${mode}: over the title, ${left.join(', ')}`);
      if (k === 0) await shot(`${mode}-title`);
      const t1 = Date.now(); await tap(way); await p.waitForFunction(inMode, null, { timeout: 60000, polling: 50 }); back = Math.max(back, (Date.now() - t1) / 1000);
      await p.waitForTimeout(1200);
      const after = await snap();
      const d = near(before, after);
      if (mode === 'story' && (after.fi !== before.fi || after.prints !== before.prints || after.beat !== before.beat)) fail(`the case taken up elsewhere: ${JSON.stringify(before)} / ${JSON.stringify(after)}`);
      if (d > 0.5 && before.mode === 'foot') fail(`${mode}: taken up ${d.toFixed(2)} m from where it was left`);
      if (Math.abs(after.min - before.min) > 1.5 || after.sky !== before.sky) fail(`${mode}: the street's hour or sky changed (${before.min.toFixed(1)} ${before.sky} / ${after.min.toFixed(1)} ${after.sky})`);
      if (k === 0) await shot(`${mode}-back`);
      // (the first two switches let the title's view stream in what it sees, as a fresh page's title does; from there nothing may grow)
      if (k === Math.floor(+N / 2) - 1) { m0 = await mem(); if (process.env.TEXWHO) await p.evaluate(() => { const gl = window.__game.renderer.getContext(), mk = gl.createTexture.bind(gl); window.__texWho = []; gl.createTexture = () => { window.__texWho.push(new Error().stack.split('\n').slice(2, 7).map(l => l.trim().replace(/https?:\/\/[^/]+\//, '')).join(' < ')); return mk(); }; }); }
      if (k >= Math.floor(+N / 2) - 1) m1 = await mem();
      if (process.env.EACH) console.log(`  ${mode} ${k + 1}: ${JSON.stringify(m1 || await mem())}`);
    }
    if (process.env.TEXWHO) { const W = await p.evaluate(() => { const w = window.__texWho || []; window.__texWho = null; return w; }); console.log(`  ${mode}: ${W.length} textures made in the second half:\n    ${W.join('\n    ')}`); }
    console.log(`${mode}: to the title ${worst.toFixed(2)} s at most, back ${back.toFixed(2)} s at most, over ${N}; memory after the first ${JSON.stringify(m0)}, after the last ${JSON.stringify(m1)}`);
    // (the switch is made in the press's own event; what is timed is the press reaching the page and a frame drawn, so the
    // bound is 2 s or six of the page's own frames, whichever is longer: a software renderer draws a desktop's frame in 300 ms)
    const fm = await p.evaluate(() => (window.__game.governor && window.__game.governor.frameMs) || 0), bound = Math.max(2, 6 * fm / 1000);
    console.log(`  ${mode}: a frame ${fm.toFixed(0)} ms here, the bound ${bound.toFixed(2)} s`);
    if (worst > bound) fail(`${mode}: the title took ${worst.toFixed(2)} s`);
    if (m1.heap - m0.heap > 8) fail(`${mode}: the heap grew ${(m1.heap - m0.heap).toFixed(1)} MB over ${N} switches`);
    for (const k of ['geo', 'prog']) if (m1[k] > m0[k]) fail(`${mode}: ${k} ${m0[k]} to ${m1[k]} over the switches`);
    // (the listeners added and not taken off and the intervals running: none more for a switch; the GPU's memory within
    // 8 MB, what the crowd's faces streaming in move it by; timeouts waiting are read, not judged: the street sets them)
    if (m1.lis > m0.lis) fail(`${mode}: listeners ${m0.lis} to ${m1.lis} over the switches`);
    if (m1.iv > m0.iv) fail(`${mode}: intervals ${m0.iv} to ${m1.iv} over the switches`);
    if (m1.gpu - m0.gpu > 8) fail(`${mode}: the GPU's memory ${m0.gpu} to ${m1.gpu} MB over the switches`);
    // (textures are uploaded at their first draw: a face or a sign the crowd brings into view for the first time counts
    // as one more, switch or none; TEXWHO=1 says where each was made. The walk's CONTROL=1 rose 6 in the same time)
    if (m1.tex - m0.tex > 12) fail(`${mode}: textures ${m0.tex} to ${m1.tex} over the switches`);
    if (loads !== expect) fail(`${mode}: the page loaded again (${loads - expect} times)`);
  };
  await p.goto(URL0, { waitUntil: 'domcontentloaded', timeout: 120000 }); expect = loads;
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 250 }); await p.evaluate(() => window.__game.titleScreen('menu')); await p.waitForTimeout(1500);
  // LOSE=1: WebGL's context lost and not given back, with the case parked under the title and again with it running,
  // the page left to open itself again (glcare.js); no page error on the way (the owner's iPhone did this on 24 Nov)
  const lose = async label => {
    const l0 = loads, e0 = errors.length;
    await p.evaluate(() => { const x = window.__game.renderer.getContext().getExtension('WEBGL_lose_context'); window.__lost = x; x.loseContext(); });
    const t0 = Date.now(); while (loads === l0 && Date.now() - t0 < 90000) await p.waitForTimeout(500);
    if (loads === l0) { console.log(`  ${label}: no page load in 90 s; the context given back`); await p.evaluate(() => window.__lost && window.__lost.restoreContext()).catch(() => {}); }
    await p.waitForFunction(() => { const t = document.getElementById('g-title'); return !!window.__game && (!t.hidden || document.getElementById('game-stage').classList.contains('story-on')); }, null, { timeout: 900000, polling: 500 }).catch(() => fail(`${label}: the page never came back`));
    await p.waitForTimeout(3000);
    if (errors.length === e0) ok(`${label}: the context lost, ${loads - l0} page load(s), no page error`);
    expect = loads;
  };
  if (process.env.LOSE) {
    const inCase0 = () => { const s = window.__game.story.state, t = document.getElementById('g-title'); return t.hidden && s.fi === 2 && s.phase !== 'idle' && s.phase !== 'dressed'; };
    await tap('#gt-cont-go'); await p.waitForFunction(inCase0, null, { timeout: 900000, polling: 250 }); await p.waitForTimeout(5000);
    await openMenu('story'); await tap('#gm-title'); await titleUp(); await p.waitForTimeout(1000);
    await lose('the case parked under the title');
    // (a page opened again after a loss takes the case up by itself, game.js takeResume; else Continue does)
    if (!(await p.evaluate(inCase0).catch(() => false))) { await p.evaluate(() => window.__game.titleScreen('menu')).catch(() => {}); await p.waitForTimeout(1000); await tap('#gt-cont-go'); } await p.waitForFunction(inCase0, null, { timeout: 900000, polling: 250 }).catch(() => fail('after the loss, Continue did not take the case up'));
    await p.waitForTimeout(5000);
    await lose('the case running');
    console.log(errors.length ? `FAIL ${errors.length}` : 'ok   title in place, a lost context: all passed');
    await b.close(); process.exit(errors.length ? 1 : 0);
  }
  // the case
  await tap('#gt-cont-go');
  const inCase = () => { const s = window.__game.story.state, t = document.getElementById('g-title'); return t.hidden && s.fi === 2 && s.phase !== 'idle' && s.phase !== 'dressed'; };
  await p.waitForFunction(inCase, null, { timeout: 900000, polling: 250 });
  await p.waitForTimeout(8000); // (into the frame: its talk or the way to the Stop)
  await rounds('story', '#gt-cont-go', inCase);
  ok(errors.length ? 'the case: see above' : `the case out to the title and back ${N} times, in place`);
  if (process.env.ONLY === 'story') { console.log(errors.length ? `FAIL ${errors.length}` : 'ok   title in place: the case passed'); await b.close(); process.exit(errors.length ? 1 : 0); }
  // from a parked case, the walk's way: the page once, straight onto the walk
  await openMenu('story'); await tap('#gm-title'); await titleUp(); await p.waitForTimeout(800);
  await tap('#gt-walk-go'); await p.waitForTimeout(800);
  const l0 = loads; await tap('#gt-walk-set');
  await p.waitForFunction(() => document.getElementById('game-stage') && document.getElementById('game-stage').classList.contains('walk-on'), null, { timeout: 900000, polling: 250 }).catch(() => fail('from a parked case, the walk never set out'));
  if (loads - l0 !== 1) fail(`from a parked case to the walk: ${loads - l0} page loads`); else ok('from a parked case, the walk: one page load, straight onto the walk');
  expect = loads;
  await p.waitForTimeout(6000);
  // the walk
  const inWalk = () => document.getElementById('g-title').hidden && document.getElementById('game-stage').classList.contains('walk-on');
  await rounds('walk', '#gt-walk-go', inWalk);
  ok(errors.length ? 'the walk: see above' : `the walk out to the title and back ${N} times, in place`);
  console.log(errors.length ? `FAIL ${errors.length}` : 'ok   title in place: all passed');
  await b.close();
  process.exit(errors.length ? 1 : 0);
})();
