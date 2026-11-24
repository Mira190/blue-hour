// The lens's last resort, faded (issue 209): stills of the one you play going out of the picture where the lens cannot
// leave them (the view held by a hand into the wall at your back) and coming back as it is let go, and what it costs.
// The fade is FADE_S (0.2 s) in play; here it is slowed to 0.5 s (window.__fadeS) and a still taken every frame, five each
// way, as a session's machine draws a frame in seconds; then it is run at its own speed and its frames counted. And the cost: game.js lensGuard's time a
// frame while it fades, read in the page (window.__lensGuardT).
//   xvfb-run -a node tools/cam_fade.js out_dir [WxH]       (PORT=8800; FROM=n the frame, 2 by default; TIER=high)
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = 'out/cam-fade', size = '1440x900'] = process.argv;
const [w, h] = size.split('x').map(Number), phone = w < 600;
const WALL = { x: 457.71, y: -983.69, z: 15.44, h: 7.85 }; // (the back 0.14 m from a wall, facing out: tools/cam_intrude.js's `wall`)
(async () => {
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone });
  const errors = [];
  p.on('pageerror', e => { errors.push(String(e).slice(0, 300)); console.log('page error:', errors[errors.length - 1]); });
  fs.mkdirSync(out, { recursive: true });
  const FROM = +(process.env.FROM ?? 2);
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  await p.addInitScript(n => { try { localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); localStorage.setItem('bh-story-late', JSON.stringify({ fi: n, left: 7 - n, prints: Array.from({ length: n }, (_, i) => ({ src: null, stamp: `frame ${i + 1}`, cap: '' })) })); } catch (e) { /* storage blocked */ } }, FROM);
  await p.addInitScript(() => { window.__lensGuard = {}; window.__lensGuardT = { ms: 0, n: 0, max: 0 }; window.__fadeLog = { a: 1 }; });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.evaluate(() => document.getElementById('gt-play').click());
  for (let i = 0; i < 400; i++) {
    const s = await p.evaluate(() => { const g = window.__game, o = g.overture && g.overture(); return { phase: g.story.state.phase, film: !!(o && o.active), cine: g.cine.active, dlg: g.dlg.open }; });
    if (s.phase === 'go' && !s.film && !s.cine && !s.dlg) break;
    if (s.dlg) await p.evaluate(() => window.__game.dlg.next(false)); else if (phone) await p.touchscreen.tap(w / 2, h / 2); else await p.keyboard.press('Space');
    await p.waitForTimeout(1500);
  }
  await p.waitForTimeout(6000); // (the idle warm-up: the fade's programs compiled before it is first needed)
  const pose = (yaw, dist) => p.evaluate(([s, yaw, dist]) => { const g = window.__game, pl = g.player, c = g.cam; pl.x = s.x; pl.y = s.y; pl.z = s.z; pl.h = s.h; pl.speed = 0; c.yaw = s.h + yaw; c.pitch = 0.17; c.dist = dist; c.distTo = 0; c.yawTo = c.pitchTo = null; c.lastInput = 1e12; }, [WALL, yaw, dist]);
  const alpha = () => p.evaluate(() => +(window.__fadeLog.a).toFixed(2));
  const res = { out: [], back: [] };
  // the view at your shoulder, away from the wall: you whole
  await pose(Math.PI, 2.5); await p.evaluate(() => { window.__game.cam.snap = true; }); await p.waitForTimeout(2500);
  await p.screenshot({ path: `${out}/fade-0-whole-${w}x${h}.png` });
  // a frame at a time (a session's machine draws this page at a frame in two or three seconds, and the fade's step is held
  // to 0.1 s a frame): slowed so that it takes five frames each way (window.__fadeS = 0.5), a still at each
  const frame = () => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await p.evaluate(() => { window.__fadeS = 0.5; });
  await pose(0, 2.5); await p.evaluate(() => { window.__game.cam.snap = true; });
  for (let k = 1; k <= 6; k++) { await frame(); const a = await alpha(); res.out.push(a); await p.screenshot({ path: `${out}/fade-1-out-${k}-${w}x${h}.png` }); }
  await pose(Math.PI, 2.5); await p.evaluate(() => { window.__game.cam.snap = true; });
  for (let k = 1; k <= 6; k++) { await frame(); const a = await alpha(); res.back.push(a); await p.screenshot({ path: `${out}/fade-2-back-${k}-${w}x${h}.png` }); }
  res.log = await p.evaluate(() => window.__fadeLog);
  // at its own speed: how many frames it takes, and the guard's time a frame meanwhile
  await p.evaluate(() => { delete window.__fadeS; Object.assign(window.__lensGuardT, { ms: 0, n: 0, max: 0 }); });
  res.own = await p.evaluate(([s]) => new Promise(r => {
    const g = window.__game, c = g.cam, t0 = performance.now(), seen = [];
    c.yaw = s.h; c.lastInput = 1e12; c.snap = true;
    const go = () => { seen.push(+window.__fadeLog.a.toFixed(2)); if (window.__fadeLog.a <= 0 || performance.now() - t0 > 4000) return r({ frames: seen.length, ms: Math.round(performance.now() - t0), alpha: seen }); requestAnimationFrame(go); };
    requestAnimationFrame(go);
  }), [WALL]);
  const T = await p.evaluate(() => window.__lensGuardT);
  res.cost = { mean_ms: +(T.ms / Math.max(1, T.n)).toFixed(3), max_ms: +T.max.toFixed(2), frames: T.n };
  res.guard = await p.evaluate(() => window.__lensGuard);
  res.errors = errors;
  fs.writeFileSync(`${out}/fade-${w}x${h}.json`, JSON.stringify(res, null, 1));
  console.log(JSON.stringify(res));
  await b.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
