// The menus' Title screen in place (issue 215, game.js parkTitle and putAway), on a phone's page (390x844, touch, the
// low tier) or a desktop's: the case or the walk put away, the title over the street on its menu, and every way in on
// it run as on a fresh page, either mode, with no page load. A case kept at frame 3 is taken up, then the menu's Title
// screen and Continue N times; then across, the walk set out from that title and the case taken up from the walk's;
// then the walk N times. Fails if:
//   - the page loads again, ever (it is to stay the same page from the first title to the last);
//   - the title is not on its menu, usable, within a second of the press on a phone (or three of the page's frames where
//     a frame is slower), three seconds on a desktop (or six frames: a software renderer draws its 1440x900 in 200 to 400 ms);
//   - anything of the mode is left after the return: its interface over the title (beside what a fresh page's title
//     shows), the story's people, the guide, the goal's lights, the walk's own people, the walk going, you anywhere
//     but on foot, your car away from its kerb, the helicopter off its pad;
//   - the mode taken up is not where it was: the case's frame and prints; the walk where you stood within 0.5 m, at
//     the minute it was left and under its sky;
//   - memory grows over the second half of the returns: the JS heap after a collection more than 8 MB, any geometry
//     or program the renderer counts, textures by more than 12 (each counted at its first draw, as the crowd brings a
//     face or a sign into view, return or none), the GPU's memory more than 8 MB, any listener or interval more;
//   - the title after a return asks far more of WebGL than the cold title did (40 MB; its draws, triangles and memory
//     are said beside the cold title's, the budget's own counts, tools/beat_count.js and tools/gl_mem.js): what a mode
//     leaves is judged thing by thing above, and memory across the returns.
// Stills of the title after each return go in out_dir (desk- or phone-<name>.png).
//   xvfb-run -a node tools/title_inplace.js out_dir [WxH] [returns]
//   EACH=1 prints every round; ONLY=story stops after the case's rounds; TEXWHO=1 names where each texture of the second
//   half was made; HOUR=night (or blue, dusk) sets the case's and the title's evening by the walk's step first, for stills
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/title-inplace', size = '390x844', N = '6'] = process.argv;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const [w, h] = size.split('x').map(Number), phone = w < 500;
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox', '--enable-precise-memory-info', '--js-flags=--expose-gc'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, hasTouch: phone, isMobile: phone });
  const PORT = process.env.PORT || 8800, URL0 = `http://localhost:${PORT}/${phone ? '?tier=low' : ''}`;
  const errors = [], fail = m => { errors.push(m); console.log(`FAIL ${m}`); }, ok = m => console.log(`ok   ${m}`);
  let loads = 0;
  p.on('framenavigated', f => { if (f === p.mainFrame()) loads++; });
  p.on('pageerror', e => fail(`pageerror: ${String((e && e.stack) || e).replace(/https?:\/\/[^/]+\//g, '').slice(0, 600)}`));
  // (what the page holds that a return could leave behind: WebGL's own memory as asked of it, tools/gl_mem.js; the
  // event listeners added and not taken off, by target and type; the intervals running; the timeouts waiting)
  await p.addInitScript(require('./gl_mem').hook);
  await p.addInitScript(require('./beat_count').hook);
  await p.addInitScript(() => {
    // (counted on what is still part of the page: the window, the document, an element in it, a context; a listener on an
    // element the page has taken out goes with it, and is not one left behind)
    const L = window.__lis = new WeakMap(), refs = []; const T = window.__timers = { iv: new Set(), to: new Set() };
    const add = EventTarget.prototype.addEventListener, rem = EventTarget.prototype.removeEventListener;
    const key = (type, f, o) => `${type}|${typeof o === 'boolean' ? o : !!(o && o.capture)}`;
    EventTarget.prototype.addEventListener = function (type, f, o) { if (f && !(o && o.signal && o.signal.aborted)) { let m = L.get(this); if (!m) { L.set(this, m = new Map()); refs.push(new WeakRef(this)); } const k = key(type, f, o); let s2 = m.get(k); if (!s2) m.set(k, s2 = new Set()); if (!s2.has(f)) { s2.add(f); if (o && o.signal) o.signal.addEventListener('abort', () => s2.delete(f), { once: true }); } } return add.call(this, type, f, o); };
    EventTarget.prototype.removeEventListener = function (type, f, o) { const m = L.get(this), s2 = m && m.get(key(type, f, o)); if (s2) s2.delete(f); return rem.call(this, type, f, o); };
    window.__lisBy = () => { const o = {}; for (const r of refs) { const t = r.deref(); if (!t || (t instanceof Node && t !== document && !t.isConnected)) continue; const d = t === window ? 'window' : t === document ? 'document' : t.id ? `#${t.id}` : t.constructor.name; for (const [k, s2] of L.get(t)) if (s2.size) o[`${d} ${k}`] = (o[`${d} ${k}`] || 0) + s2.size; } return o; };
    window.__lisN = () => { let n = 0; for (const r of refs) { const t = r.deref(); if (!t || (t instanceof Node && t !== document && !t.isConnected)) continue; for (const s2 of L.get(t).values()) n += s2.size; } return n; };
    const si = window.setInterval, ci = window.clearInterval, st = window.setTimeout, ct = window.clearTimeout;
    window.setInterval = function (...a) { const id = si.apply(this, a); T.iv.add(id); return id; };
    window.clearInterval = function (id) { T.iv.delete(id); return ci.call(this, id); };
    window.setTimeout = function (f, ...a) { let id; id = st.call(this, typeof f === 'function' ? function (...b2) { T.to.delete(id); return f.apply(this, b2); } : f, ...a); T.to.add(id); return id; };
    window.clearTimeout = function (id) { T.to.delete(id); return ct.call(this, id); };
  });
  await p.addInitScript(() => { try { if (sessionStorage.getItem('ti-seeded')) return; sessionStorage.setItem('ti-seeded', '1'); localStorage.setItem('bh-player', 'W'); localStorage.removeItem('bh-walk-talk'); localStorage.setItem('bh-story-late', JSON.stringify({ fi: 2, left: 5, prints: [0, 1].map(i => ({ src: null, stamp: `frame ${i + 1}`, cap: '' })) })); } catch (e) { /* storage blocked */ } });
  const tap = async sel => { const r = await p.locator(sel).first().boundingBox(); if (!r) return fail(`${sel}: not on the screen`); const x = r.x + r.width / 2, y = r.y + r.height / 2; if (phone) await p.touchscreen.tap(x, y); else await p.mouse.click(x, y); };
  const titleUp = () => p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden && t.dataset.screen === 'menu' && getComputedStyle(t).visibility !== 'hidden'; }, null, { timeout: 900000, polling: 50 });
  const shot = n => p.screenshot({ path: `${out}/${phone ? 'phone' : 'desk'}-${n}.png`, timeout: 120000 }).catch(() => console.log(`(no still ${n})`));
  const snap = () => p.evaluate(() => { const g = window.__game, s = g.story.state, c = g.clock; return { fi: s.fi, phase: s.phase, beat: s.beat, prints: s.prints.length, at: [g.player.x, g.player.y, g.player.z], min: c.min, sky: g.weather ? g.weather.state.kind : '', mode: g.player.mode }; });
  const shown = () => p.evaluate(() => [...document.querySelectorAll('#g-story-goal, #g-story-frames, #g-story-menu, #g-story-cam, #g-story-mark, #g-walk-acts, #g-walk-where, #g-walk-keys, #g-walk-told, #gd, #g-btns, #g-touch, #g-menu, .g-walk-marks')].filter(e => { const r = e.getBoundingClientRect(), c = getComputedStyle(e); return !e.closest('[hidden]') && r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && +c.opacity > 0.05; }).map(e => e.id || e.className));
  // (what a mode leaves in the street: the story's people, the guide, the goal's lights, the walk's own people, the
  // walk itself, how you stand, your car and the helicopter; read after each return, against a fresh title's)
  const left = () => p.evaluate(() => {
    const g = window.__game, st = document.getElementById('game-stage'), l = g.lights(), car = g.myCar(), h = g.heli.st, pad = (g.helipads || [])[0];
    return { figs: g.storyFigs().size, guide: !!(g.guideMade() && g.guideMade().root && g.guideMade().root.parent), beacon: !!l.story, here: !!l.here,
      walkers: g.npcs.filter(n => n.walk && !n.away).length, walk: st.classList.contains('walk') || st.classList.contains('walk-on'), storyOn: st.classList.contains('story-on'),
      mode: g.player.mode, phase: g.story.state.phase, car: car ? [car.D.st.x, car.D.st.y] : null, heli: pad ? Math.hypot(h.x - pad.at[0], h.y - pad.at[1]) : 0, heliOn: !!h.on, talk: !!(g.dlg && g.dlg.open) };
  });
  const mem = async () => { await p.evaluate(() => { if (window.gc) { window.gc(); window.gc(); } }); await p.waitForTimeout(500); return p.evaluate(() => { const i = window.__game.renderer.info; return { heap: performance.memory ? performance.memory.usedJSHeapSize / 1048576 : 0, geo: i.memory.geometries, tex: i.memory.textures, prog: (i.programs || []).length, gpu: window.__mem ? +(window.__mem.sum / 1048576).toFixed(1) : 0, lis: window.__lisN ? window.__lisN() : 0, iv: window.__timers ? window.__timers.iv.size : 0, to: window.__timers ? window.__timers.to.size : 0 }; }); };
  // the title's beat as the budget counts it (tools/beat_budget.py "title"): the heavier of two frames' asks, and WebGL's memory
  const beat = async () => { await p.waitForTimeout(4000); const c = await require('./beat_count').sample(p, 2, !!process.env.BY); const m = await mem(); console.log(`  the street: ${JSON.stringify(await p.evaluate(() => { const g = window.__game, C = g.cars.cars || []; return { crowd: g.crowd.active, crowdWant: g.crowd.want, carsActive: g.cars.active, carsPlaced: Array.isArray(C) ? C.filter(c => c.line >= 0).length : null, fleetShown: Object.values(g.cars.fleet || {}).flat().reduce((a, q) => a + (q.visible ? q.count : 0), 0) }; }))}`); if (process.env.BY) console.log(`  by what is drawn:\n    ${(c.groups || []).slice(0, 24).map(q => `${q.group}: ${q.draws} draws, ${q.tris} tris`).join('\n    ')}`); return { draws: c.draws, tris: c.tris, passes: c.passes, gpu: m.gpu, tex: m.tex, geo: m.geo }; };
  const openMenu = async mode => { if (mode === 'walk') await tap('#g-walk-acts [data-do="menu"]'); else await tap('#g-story-menu'); await p.waitForFunction(() => !document.getElementById('g-menu').hidden, null, { timeout: 20000 }); await p.waitForTimeout(400); };
  const who = async () => { for (let k = 0; k < 6 && await p.evaluate(() => document.getElementById('g-title').dataset.screen === 'who' && !document.getElementById('g-title').hidden); k++) { await tap('#gt-who [data-c="W"]'); await p.waitForTimeout(400); await tap('#gt-who-go'); await p.waitForTimeout(800); } };
  const near = (a, b2) => Math.hypot(a.at[0] - b2.at[0], a.at[1] - b2.at[1], a.at[2] - b2.at[2]);
  // (the world settled first: what streams in after a mode sets out, the late parts, its people's faces and pictures, is
  // not counted against the returns. Read every 5 s until two readings agree, for two minutes at most)
  const settle = async label => { let a = await mem(); for (let i = 0; i < 24; i++) { await p.waitForTimeout(5000); const c = await mem(); if (c.geo === a.geo && c.tex === a.tex && c.prog === a.prog) { console.log(`  ${label}: settled ${JSON.stringify(c)}`); return; } a = c; } console.log(`  ${label}: still moving after two minutes ${JSON.stringify(a)}`); };
  let base = null, cold = null, carHome = null;
  // out of a mode by the menu's Title screen: timed, then everything it could leave read
  const toTitle = async (mode, k, name) => {
    await openMenu(mode);
    const t0 = Date.now(); await tap('#gm-title'); await titleUp(); const dt = (Date.now() - t0) / 1000;
    const ms = await p.evaluate(() => { const e = performance.getEntriesByName('oe:title').pop(); return e && e.detail ? e.detail.ms : null; });
    await p.waitForTimeout(1500);
    const o = (await shown()).filter(x => !base.includes(x)); if (o.length) fail(`${mode}: over the title, ${o.join(', ')}`);
    const L = await left(), bad = [];
    if (L.figs) bad.push(`${L.figs} of the story's people`); if (L.guide) bad.push('the guide'); if (L.beacon || L.here) bad.push('the goal\'s lights');
    if (L.walkers) bad.push(`${L.walkers} of the walk's people`); if (L.walk) bad.push('the walk\'s classes'); if (L.storyOn) bad.push('the case\'s class');
    if (L.mode !== 'foot') bad.push(`you in ${L.mode}`); if (L.phase !== 'dressed') bad.push(`the case ${L.phase}`); if (L.talk) bad.push('a talk open');
    if (carHome && L.car && Math.hypot(L.car[0] - carHome[0], L.car[1] - carHome[1]) > 3) bad.push(`your car ${Math.hypot(L.car[0] - carHome[0], L.car[1] - carHome[1]).toFixed(0)} m from its kerb`);
    if (L.heli > 3 || L.heliOn) bad.push(`the helicopter ${L.heli.toFixed(0)} m from its pad`);
    if (bad.length) fail(`${mode}: back at the title, left over: ${bad.join(', ')}`);
    if (name) await shot(name);
    if (process.env.EACH) console.log(`  ${mode} ${k + 1}: to the title ${dt.toFixed(2)} s (the switch ${ms} ms)`);
    return { dt, ms };
  };
  // one mode, N times out to the title and back in by its own way
  const rounds = async (mode, way, inMode) => {
    await settle(mode);
    let m0 = null, m1 = null, worst = 0, worstMs = 0, back = 0;
    for (let k = 0; k < +N; k++) {
      const before = await snap();
      const t = await toTitle(mode, k, k === 0 ? `${mode}-title` : null); worst = Math.max(worst, t.dt); worstMs = Math.max(worstMs, t.ms || 0);
      const t1 = Date.now(); for (const s of way) { await tap(s); await p.waitForTimeout(600); } await who();
      if (!(await p.waitForFunction(inMode, null, { timeout: 120000, polling: 100 }).then(() => true, () => false))) { fail(`${mode}: not taken up from the title`); break; }
      back = Math.max(back, (Date.now() - t1) / 1000);
      await p.waitForTimeout(6000);
      const after = await snap();
      if (mode === 'story' && (after.fi !== before.fi || after.prints !== before.prints)) fail(`the case taken up elsewhere: ${JSON.stringify(before)} / ${JSON.stringify(after)}`);
      if (mode === 'walk') {
        const d = near(before, after);
        if (d > 0.5 && before.mode === 'foot') fail(`the walk taken up ${d.toFixed(2)} m from where it was left`);
        if (Math.abs(after.min - before.min) > 3 || after.sky !== before.sky) fail(`the walk: the street's hour or sky changed (${before.min.toFixed(1)} ${before.sky} / ${after.min.toFixed(1)} ${after.sky})`);
      }
      if (k === 0) await shot(`${mode}-back`);
      if (k === Math.floor(+N / 2) - 1) { m0 = await mem(); m0.by = await p.evaluate(() => window.__lisBy()); if (process.env.TEXWHO) await p.evaluate(() => { const gl = window.__game.renderer.getContext(), mk = gl.createTexture.bind(gl); window.__texWho = []; gl.createTexture = () => { window.__texWho.push(new Error().stack.split('\n').slice(2, 7).map(l => l.trim().replace(/https?:\/\/[^/]+\//, '')).join(' < ')); return mk(); }; }); }
      if (k >= Math.floor(+N / 2) - 1) m1 = await mem();
      if (process.env.EACH) console.log(`  ${mode} ${k + 1}: ${JSON.stringify(m1 || await mem())}`);
    }
    if (process.env.TEXWHO) { const W = await p.evaluate(() => { const v = window.__texWho || []; window.__texWho = null; return v; }); console.log(`  ${mode}: ${W.length} textures made in the second half:\n    ${W.join('\n    ')}`); }
    console.log(`${mode}: to the title ${worst.toFixed(2)} s at most (the switch itself ${worstMs.toFixed(0)} ms), back in ${back.toFixed(2)} s at most, over ${N}; memory after the first half ${JSON.stringify(m0)}, after the last ${JSON.stringify(m1)}`);
    const fm = await p.evaluate(() => (window.__game.governor && window.__game.governor.frameMs) || 0), bound = phone ? Math.max(1, 3 * fm / 1000) : Math.max(3, 6 * fm / 1000); // (a phone's under a second, the owner's bar; a desktop's page on a software renderer draws 1440x900 in 200 to 400 ms)
    console.log(`  ${mode}: a frame ${fm.toFixed(0)} ms here, the bound ${bound.toFixed(2)} s`);
    if (worst > bound) fail(`${mode}: the title took ${worst.toFixed(2)} s`);
    if (!m0 || !m1) return;
    if (m1.heap - m0.heap > 8) fail(`${mode}: the heap grew ${(m1.heap - m0.heap).toFixed(1)} MB over ${N} returns`);
    for (const k of ['geo', 'prog']) if (m1[k] > m0[k]) fail(`${mode}: ${k} ${m0[k]} to ${m1[k]} over the returns`);
    if (m1.lis > m0.lis) { const by = await p.evaluate(() => window.__lisBy()); fail(`${mode}: listeners ${m0.lis} to ${m1.lis} over the returns (${Object.keys(by).filter(k => by[k] > (m0.by[k] || 0)).map(k => `${k} +${by[k] - (m0.by[k] || 0)}`).join(', ')})`); }
    if (m1.iv > m0.iv) fail(`${mode}: intervals ${m0.iv} to ${m1.iv} over the returns`);
    if (m1.gpu - m0.gpu > 8) fail(`${mode}: the GPU's memory ${m0.gpu} to ${m1.gpu} MB over the returns`);
    if (m1.tex - m0.tex > 12) fail(`${mode}: textures ${m0.tex} to ${m1.tex} over the returns`);
  };
  // OWN=1: the textures the scene's materials hold, by the first names up each mesh's parents and whether it is shown
  // (MB, as sent, a third more with mips): read at the cold title and after the returns, and the owners that differ said
  const owners = () => p.evaluate(() => { const g = window.__game, T = window.THREE; let root = g.world; while (root.parent) root = root.parent; const own = {}, seen = new Set();
    const tex = (t, k) => { if (!t || !t.isTexture || seen.has(t)) return; seen.add(t); const im = t.image || {}, w = im.width || im.videoWidth || 0, h = im.height || im.videoHeight || 0; own[k] = (own[k] || 0) + w * h * (t.isCompressedTexture ? 1 : 4) * (t.generateMipmaps ? 1.33 : 1) / 1048576; };
    root.traverse(o => { if (!(o.isMesh || o.isPoints || o.isSprite)) return; let vis = true; const names = []; for (let q = o; q && q !== root; q = q.parent) { if (!q.visible) vis = false; if (q.name && !/^(Scene|Group)$/.test(q.name)) names.push(q.name.replace(/[_-]?\d+$/, '')); }
      const k = `${names.length ? names[names.length - 1] : o.type} ${vis ? 'shown' : 'hidden'}`; for (const m of Array.isArray(o.material) ? o.material : [o.material]) { if (!m) continue; for (const q in m) tex(m[q], k); if (m.uniforms) for (const u in m.uniforms) tex(m.uniforms[u] && m.uniforms[u].value, k); } });
    return own; });
  let own0 = null;
  const ownDiff = (a, b2) => { const keys = new Set([...Object.keys(a), ...Object.keys(b2)]); return [...keys].map(k => [k, +((b2[k] || 0) - (a[k] || 0)).toFixed(1)]).filter(x => Math.abs(x[1]) >= 0.5).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])).slice(0, 30); };
  // against the cold title: the title after a return asks no more of the GPU than a fresh page's did
  const weigh = (label, c) => {
    console.log(`  the title ${label}: ${JSON.stringify(c)} (cold ${JSON.stringify(cold)})`);
    // (the draws and triangles are said, not judged: the street under a title come back to stands as it was left, the
    // crossing at its green with the crowd in the box and a car or two, where a fresh title's has not begun and waits at
    // the kerbs; what a mode leaves is judged above, thing by thing, and by WebGL's memory here)
    for (const k of ['draws', 'tris']) if (c[k] > cold[k] * 1.08 + 4) console.log(`  (the title ${label}: ${k} ${c[k]} against ${cold[k]} cold, the street as it was left)`);
    // (WebGL's memory is said beside the cold title's, and judged across the returns above, where it must stay flat: a
    // fresh title has not yet sent up what the street's play first drew, the crowd's and the traffic's and the walk's
    // area, nor the models a case keeps for its next taking up, past.js's and stopfx.js's; none of it grows with a return)
    console.log(`  (the title ${label}: WebGL holds ${c.gpu} MB against ${cold.gpu} MB cold)`);
    if (c.gpu > cold.gpu + 40) fail(`the title ${label}: WebGL holds ${c.gpu} MB against ${cold.gpu} MB cold`);
  };
  await p.goto(URL0, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const loads0 = loads;
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 250 }); await p.evaluate(() => window.__game.titleScreen('menu')); await p.waitForTimeout(1500);
  // (the cold title as a fresh page's settles: its late parts in, the traffic's cars and the near trees, which the title
  // after a return has from the mode it came from; then read until it holds still)
  const lateIn = await p.waitForFunction(() => { const l = window.__game.late(); return l.carsFull && l.fleetNear && l.treesNear; }, null, { timeout: 600000, polling: 1000 }).then(() => true, () => false);
  if (!lateIn) console.log('  (the late parts not in after ten minutes: the cold title read without them)');
  await settle('the cold title');
  base = await shown(); carHome = (await left()).car;
  cold = await beat(); console.log(`  the cold title: ${JSON.stringify(cold)}`); await shot('title-cold');
  if (process.env.OWN) own0 = await owners();
  // HELD=1: what WebGL holds after the returns that it did not hold at the cold title, texture by texture (its picture's
  // name where it has one, tools/gl_mem.js) and buffer by buffer, the largest first
  const chars = () => p.evaluate(() => { const L = window.__game.peopleLib, cast = new Set(); for (const ep of (window.__game.G.story || {}).episodes || []) for (const c of [...(ep.cast || []), ...(ep.frames || []).flatMap(f => [f.afterimage, f.afterimage2])]) if (c && c.character) cast.add(c.character); const walkers = new Set(window.__game.npcs.filter(n => n.walk).map(n => n.look && n.look.character)); const of = n => `${n}${cast.has(n) ? ' (cast)' : walkers.has(n) ? ' (walk)' : ''}`; return { tpl: Object.keys(L.tpl).map(of), parked: Object.keys(L.parked || {}).map(of) }; });
  const chars0 = process.env.HELD ? await chars() : null;
  if (process.env.HELD) await p.evaluate(() => { const M = window.__mem; window.__held0 = { tex: new WeakSet([...M.tex.keys()]), buf: new WeakSet([...M.buf.keys()]) }; });
  // the case
  const inCase = () => { const s = window.__game.story.state, t = document.getElementById('g-title'); return t.hidden && s.fi === 2 && s.phase !== 'idle' && s.phase !== 'dressed'; };
  await tap('#gt-cont-go'); await who();
  await p.waitForFunction(inCase, null, { timeout: 900000, polling: 250 });
  await p.waitForTimeout(8000); // (into the frame: its talk or the way to the Stop)
  await rounds('story', ['#gt-cont-go'], inCase);
  ok(errors.length ? 'the case: see above' : `the case out to the title and back ${N} times, in place`);
  if (process.env.ONLY !== 'story') {
    // across: from the title the case was put away to, the walk; and from the walk's, the case; no page load either way
    await toTitle('story', 0, null);
    await tap('#gt-walk-go'); await p.waitForTimeout(800); await tap('#gt-walk-set'); await who();
    const inWalk = () => document.getElementById('g-title').hidden && document.getElementById('game-stage').classList.contains('walk-on');
    if (await p.waitForFunction(inWalk, null, { timeout: 300000, polling: 250 }).then(() => true, () => false)) ok('from the case put away, the walk sets out on the same page'); else fail('from the case put away, the walk never set out');
    await p.waitForTimeout(8000);
    await toTitle('walk', 0, 'walk-title');
    await tap('#gt-cont-go'); await who();
    if (await p.waitForFunction(inCase, null, { timeout: 300000, polling: 250 }).then(() => true, () => false)) ok('from the walk put away, the case is taken up at frame 3 on the same page'); else fail('from the walk put away, Continue did not take the case up at frame 3');
    await p.waitForTimeout(6000);
    await toTitle('story', 0, null);
    await tap('#gt-walk-go'); await p.waitForTimeout(800); await tap('#gt-walk-set'); await who();
    await p.waitForFunction(inWalk, null, { timeout: 300000, polling: 250 }).catch(() => fail('the walk did not set out again'));
    await p.waitForTimeout(6000);
    // the walk: Continue the walk on the title goes on where you stood (its step opens, then Continue)
    await rounds('walk', ['#gt-walk-go', '#gt-walk-set'], inWalk);
    ok(errors.length ? 'the walk: see above' : `the walk out to the title and back ${N} times, in place`);
    await toTitle('walk', 0, null);
  } else await toTitle('story', 0, null);
  await settle('the title after the returns');
  weigh('after the returns', await beat()); await shot('title-after');
  if (process.env.HELD) console.log(`  held after the returns, not at the cold title:\n    ${(await p.evaluate(() => { const M = window.__mem, H = window.__held0, g = {}; for (const [k, m] of [['tex', M.tex], ['buf', M.buf]]) for (const [x, e] of m) if (!H[k].has(x)) { const l = `${k} ${String(e.label || '').replace(/\d+x\d+/, '').trim() || '(no name)'}`; g[l] = g[l] || { n: 0, mb: 0 }; g[l].n++; g[l].mb += e.bytes / 1048576; } return Object.entries(g).sort((a, b) => b[1].mb - a[1].mb).slice(0, 40).map(([l, v]) => `${v.mb.toFixed(2)} MB ${v.n}x ${l}`); })).join('\n    ')}`);
  if (chars0) { const c1 = await chars(); console.log(`  characters come since the cold title: ${c1.tpl.filter(n => !chars0.tpl.includes(n)).join(', ') || 'none'}; parked since: ${c1.parked.filter(n => !chars0.parked.includes(n)).join(', ') || 'none'}`); }
  if (own0) console.log(`  textures by owner, after the returns less the cold title (MB):\n    ${ownDiff(own0, await owners()).map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${k}`).join('\n    ')}`);
  // the title come back to at night too: its walk step at Night dresses the street under it (stills only), then Back
  await tap('#gt-walk-go'); await p.waitForTimeout(800); await tap('#gt-walk [data-k="t"] [data-v="night"]'); await p.waitForTimeout(6000); await shot('title-after-night');
  await tap('#gt-walk-back'); await p.waitForTimeout(1500);
  if (loads !== loads0) fail(`the page loaded again (${loads - loads0} times)`); else ok('the same page throughout: no page load');
  console.log(errors.length ? `FAIL ${errors.length}` : 'ok   title in place: all passed');
  await b.close();
  process.exit(errors.length ? 1 : 0);
})();
