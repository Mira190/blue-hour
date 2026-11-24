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
  await p.addInitScript(() => { try { if (sessionStorage.getItem('ti-seeded')) return; sessionStorage.setItem('ti-seeded', '1'); localStorage.setItem('bh-player', 'W'); localStorage.setItem('bh-story-late', JSON.stringify({ fi: 2, left: 5, prints: [0, 1].map(i => ({ src: null, stamp: `frame ${i + 1}`, cap: '' })) })); } catch (e) { /* storage blocked */ } });
  const tap = async sel => { const r = await p.locator(sel).first().boundingBox(); if (!r) return fail(`${sel}: not on the screen`); const x = r.x + r.width / 2, y = r.y + r.height / 2; if (phone) await p.touchscreen.tap(x, y); else await p.mouse.click(x, y); };
  const titleUp = () => p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden && t.dataset.screen === 'menu' && getComputedStyle(t).visibility !== 'hidden'; }, null, { timeout: 900000, polling: 50 });
  const shot = n => p.screenshot({ path: `${out}/${phone ? 'phone' : 'desk'}-${n}.png`, timeout: 120000 }).catch(() => console.log(`(no still ${n})`));
  const snap = () => p.evaluate(() => { const g = window.__game, s = g.story.state, c = g.clock; return { fi: s.fi, phase: s.phase, beat: s.beat, prints: s.prints.length, at: [g.player.x, g.player.y, g.player.z], min: c.min, sky: g.weather ? g.weather.state.kind : '', mode: g.player.mode }; });
  const shown = () => p.evaluate(() => [...document.querySelectorAll('#g-story-goal, #g-story-frames, #g-story-menu, #g-walk-acts, #g-walk-where, #gd, #g-btns, #g-touch')].filter(e => { const r = e.getBoundingClientRect(), c = getComputedStyle(e); return !e.closest('[hidden]') && r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && +c.opacity > 0.05; }).map(e => e.id));
  const mem = async () => { await p.evaluate(() => { if (window.gc) { window.gc(); window.gc(); } }); await p.waitForTimeout(500); return p.evaluate(() => { const i = window.__game.renderer.info; return { heap: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0, geo: i.memory.geometries, tex: i.memory.textures, prog: (i.programs || []).length }; }); };
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
    // (textures are uploaded at their first draw: a face or a sign the crowd brings into view for the first time counts
    // as one more, switch or none; TEXWHO=1 says where each was made. The walk's CONTROL=1 rose 6 in the same time)
    if (m1.tex - m0.tex > 12) fail(`${mode}: textures ${m0.tex} to ${m1.tex} over the switches`);
    if (loads !== expect) fail(`${mode}: the page loaded again (${loads - expect} times)`);
  };
  await p.goto(URL0, { waitUntil: 'domcontentloaded', timeout: 120000 }); expect = loads;
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 250 }); await p.evaluate(() => window.__game.titleScreen('menu')); await p.waitForTimeout(1500);
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
