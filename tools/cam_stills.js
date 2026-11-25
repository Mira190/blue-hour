// Stills of the camera's tight places (issue 226), the same poses whichever page is served, for a before and an after
// side by side: the view held by a hand at a pose where the lens has least room, and what the measure
// (tools/cam_intrude.js) says of each still's frame. The poses are the forced cases' worst on main and the owner's
// own: the chase view lifted over a wall at your back and pulled in, over your head looking down.
//   xvfb-run -a node tools/cam_stills.js out_dir [WxH]     (PORT=8800: the page; FROM=n the frame, 2 by default)
// Writes out_dir/<pose>-<W>x<H>.png and out_dir/poses-<W>x<H>.json (each pose's depth into whom, and whom the guard took out).
// COST=1: and what the game's lens guard (game.js lensGuard) costs a frame at each pose, its mean and its most, over 60 frames.
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const camIn = require('./cam_intrude');
const [,, out = 'out/cam-stills', size = '1440x900'] = process.argv;
const [w, h] = size.split('x').map(Number), phone = w < 600;
// where: the tight spots near frame 3's start, as tools/cam_intrude.js found them; the view as a hand holds it
const SPOTS = {
  wall: { x: 457.71, y: -983.69, z: 15.44, h: 7.85 },
  corner: { x: 422.94, y: -1029.86, z: 15.04, h: 3.14 },
  under: { x: 420.2, y: -988.1, z: 16.1, h: -0.58 },
};
const POSES = [
  // (the owner's: lifted over the wall behind and pulled in short; the hand off, the rig choosing)
  { name: 'wall-lifted', at: 'wall', yaw: 0, pitch: 0.6, dist: 5.5, hand: false },
  { name: 'corner-lifted', at: 'corner', yaw: 0, pitch: 0.6, dist: 5.5, hand: false },
  // (the hand holding the view into the wall at the wheel's nearest)
  { name: 'wall-held', at: 'wall', yaw: 0, pitch: 0.17, dist: 2.5, hand: true },
  { name: 'corner-held', at: 'corner', yaw: 7.461 - 3.14, pitch: -0.25, dist: 2.5, hand: true },
  { name: 'under-held', at: 'under', yaw: 1.776 + 0.58, pitch: -0.25, dist: 2.5, hand: true },
  // (frame 3's place, where the owner's still was: the walk's own view, and zoomed in and turned to look down)
  { name: 'frame3', at: 'start', yaw: 0, pitch: 0.17, dist: 5.5, hand: false },
  { name: 'frame3-down', at: 'start', yaw: 0, pitch: 1.35, dist: 2.5, hand: true },
  { name: 'trunk', at: 'trunk', yaw: 0, pitch: 0.17, dist: 5.5, hand: false },
];
(async () => {
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone });
  p.on('pageerror', e => console.log('page error:', String(e).slice(0, 300)));
  fs.mkdirSync(out, { recursive: true });
  const FROM = +(process.env.FROM ?? 2);
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high'); // (stills on the desktop tier: AGENTS.md)
  await p.addInitScript(n => { try { localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); localStorage.setItem('bh-story-late', JSON.stringify({ fi: n, left: 7 - n, prints: Array.from({ length: n }, (_, i) => ({ src: null, stamp: `frame ${i + 1}`, cap: '' })) })); } catch (e) { /* storage blocked */ } }, FROM);
  await camIn.install(p);
  await p.addInitScript(() => { window.__trunks = []; }); // (game.js trunksCheck: a trunk or post filling the view for a second, #233)
  if (process.env.COST) await p.addInitScript(() => { window.__lensGuardT = { ms: 0, n: 0, max: 0 }; });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.evaluate(() => document.getElementById('gt-play').click());
  for (let i = 0; i < 400; i++) {
    const s = await p.evaluate(() => { const g = window.__game, o = g.overture && g.overture(); return { phase: g.story.state.phase, film: !!(o && o.active), cine: g.cine.active, dlg: g.dlg.open }; });
    if (s.phase === 'go' && !s.film && !s.cine && !s.dlg) break;
    if (s.dlg) await p.evaluate(() => window.__game.dlg.next(false)); else if (phone) await p.touchscreen.tap(w / 2, h / 2); else await p.keyboard.press('Space');
    await p.waitForTimeout(1500);
  }
  await p.waitForTimeout(3000);
  SPOTS.start = await p.evaluate(() => { const pl = window.__game.player; return { x: pl.x, y: pl.y, z: pl.z, h: pl.h }; });
  // (a planter tree's trunk 2.5 m from the lens, you 3 m past it facing away: #233's phone still in frame 3's Stop by Hachiko)
  SPOTS.trunk = await p.evaluate(() => { const g = window.__game, pl = g.player, P = []; g.posts.near(pl.x, pl.y, 40, q => { if (q.kind === 'tree' && q.hb != null) P.push(q); });
    P.sort((a, b) => Math.hypot(a.x - pl.x, a.y - pl.y) - Math.hypot(b.x - pl.x, b.y - pl.y));
    for (const q of P) for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, x = q.x + Math.sin(a) * (q.r + 3), y = q.y + Math.cos(a) * (q.r + 3), w = g.nav.walk(x, y, pl.z + 0.6, true);
      if (w && w.ok && Math.abs(w.z - pl.z) < 1.5) return { x, y, z: w.z, h: a, tree: [+q.x.toFixed(1), +q.y.toFixed(1)] }; }
    return null; });
  if (!SPOTS.trunk) delete SPOTS.trunk;
  const frames = n => p.evaluate(n => new Promise(r => { const C = window.__camIn, f0 = C.frames, t0 = performance.now(); const go = () => (C.frames - f0 >= n || performance.now() - t0 > 30000 ? r() : requestAnimationFrame(go)); go(); }), n);
  const res = {};
  for (const q of POSES) {
    const s = SPOTS[q.at];
    if (!s) { console.log(q.name, 'no such place'); continue; }
    await p.evaluate(([s, q]) => { const g = window.__game, pl = g.player, c = g.cam; pl.x = s.x; pl.y = s.y; pl.z = s.z; pl.h = s.h; pl.speed = 0; c.yaw = s.h + q.yaw; c.pitch = q.pitch; c.dist = q.dist; c.distTo = 0; c.yawTo = c.pitchTo = null; c.lastInput = q.hand ? 1e12 : -10; c.snap = true; }, [s, q]);
    await p.evaluate(() => { window.__trunks.length = 0; });
    await frames(q.hand ? 20 : 45); // (the hand off: the rig's lift and pull-in eased to where they settle)
    await frames(q.at === 'trunk' ? 30 : 0);
    await camIn.reset(p);
    if (process.env.COST) await p.evaluate(() => Object.assign(window.__lensGuardT, { ms: 0, n: 0, max: 0 }));
    await frames(process.env.COST ? 60 : 4);
    const R = await camIn.report(p);
    const worst = R.cases.sort((x, y) => y.depth - x.depth)[0];
    res[q.name] = { into: worst ? `${worst.who}'s ${worst.part} ${worst.depth} m` : null, guard: R.guard, near: await p.evaluate(() => window.__camIn.last[3]), trunk: await p.evaluate(() => window.__trunks.map(r => `${r.kind} ${r.m} m, ${Math.round(r.share * 100)}%`).join('; ') || null) };
    if (process.env.COST) res[q.name].cost = await p.evaluate(() => { const T = window.__lensGuardT; return T && T.n ? { mean_ms: +(T.ms / T.n).toFixed(3), max_ms: +T.max.toFixed(2), frames: T.n } : null; });
    await p.screenshot({ path: `${out}/${q.name}-${w}x${h}.png` });
    console.log(q.name, JSON.stringify(res[q.name]));
  }
  fs.writeFileSync(`${out}/poses-${w}x${h}.json`, JSON.stringify(res, null, 1));
  for (const [k, r] of Object.entries(res)) if (r.trunk) { console.log(`FAIL ${k}: ${r.trunk} of the frame's width between the lens and you`); process.exitCode = 1; }
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
