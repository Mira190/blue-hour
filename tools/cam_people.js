// The chase camera and the people round the player (issue 22): in the SKY GATE lift's lobby (episode 1, frame 4, where
// Yuna of SKY GATE stands), the player is put a step in front of her and the camera swung round the player in 24 steps,
// and then at the issue's own case (the camera turned to face back out of the lobby, player.h + 0.85 pi). At each, a
// named person, a story figure, the guide or one of the crowd's near people with the lens inside their body must not be
// drawn. Stills of the issue's case before the turn and after. Exits 1 if the lens is inside anyone drawn, or the page throws.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/cam_people.js out_dir [WxH]
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/cam-people', size = '1440x900'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number);
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 600, hasTouch: w < 600 });
  const errors = [];
  p.on('pageerror', e => { errors.push(String(e)); console.log('pageerror:', String(e).slice(0, 300)); });
  fs.mkdirSync(out, { recursive: true });
  // (a case left at frame 4 and opened again: the lobby's frame, with Yuna in it)
  await p.addInitScript(() => { try { localStorage.setItem('oe3d-onboard', JSON.stringify({ done: 1 })); localStorage.setItem('oe-story-late', JSON.stringify({ fi: 3, left: 4, prints: [1, 2, 3].map(i => ({ src: null, stamp: `frame ${i}`, cap: '' })) })); } catch (e) { /* storage blocked */ } });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.evaluate(() => document.getElementById('gt-play').click());
  // (the opening film skipped, the case taken up again at its frame: the street is the player's)
  for (let i = 0; i < 400; i++) {
    const s = await p.evaluate(() => { const g = window.__game, o = g.overture && g.overture(); return { phase: g.story.state.phase, film: !!(o && o.active), cine: g.cine.active, dlg: g.dlg.open }; });
    if (s.phase === 'go' && !s.film && !s.cine && !s.dlg) break;
    if (s.dlg) await p.evaluate(() => window.__game.dlg.next(false)); else await p.keyboard.press('Space');
    await p.waitForTimeout(1500);
  }
  await p.waitForFunction(() => { const g = window.__game, n = g.npcs.find(q => q.id === 'yuna'); return n && n.rig && !n.rig.pending; }, null, { timeout: 600000, polling: 1000 });
  const frames = n => p.evaluate(n => new Promise(r => { const f = () => (n-- > 0 ? requestAnimationFrame(f) : r()); f(); }), n);
  // the frame's word with Yuna first (at the lift's door), as tools/lobby_shot.js does: her talk is over before the queue
  for (let i = 0; i < 80; i++) {
    const m = await p.evaluate(() => { const g = window.__game, st = g.story.state, t = st.target; return { beat: st.beat, dlg: g.dlg.open, t: t ? [t[0], t[1]] : null }; });
    if (m.dlg) { await p.keyboard.press('KeyE'); await p.waitForTimeout(350); continue; }
    if (m.beat !== 'meet' || !m.t) break;
    await p.evaluate(t => { const pl = window.__game.player; pl.x = t[0] + 1.8; pl.y = t[1]; pl.h = Math.atan2(-1.8, 0); }, m.t);
    await p.waitForTimeout(600);
  }
  // the queue between the lift's belts (the story's set dressing, game.story episodes' set: model lift), facing its doors
  const Q = await p.evaluate(() => {
    const g = window.__game, set = (g.G.story.episodes || []).flatMap(e => e.set || []).filter(r => r.model === 'lift')[0];
    if (!set) return null;
    const hd = (set.h || 0) * Math.PI / 180, c = Math.cos(hd), s = Math.sin(hd), M = (lx, ly) => [set.at[0] + lx * c - ly * s, set.at[1] + lx * s + ly * c];
    return { q: M(0, -1.2), front: M(0, -3.2) };
  });
  if (!Q) { console.log('FAIL no lift set in the story'); await b.close(); process.exit(1); }
  // the player in the queue facing the lift's doors, the camera turned yaw from behind them
  const put = yaw => p.evaluate(([yaw, Q]) => {
    const g = window.__game, pl = g.player, f = g.nav.floorAt(Q.q[0], Q.q[1], pl.z + 3);
    pl.x = Q.q[0]; pl.y = Q.q[1]; pl.z = f ? f.z : pl.z; pl.h = Math.atan2(Q.q[0] - Q.front[0], Q.q[1] - Q.front[1]);
    g.cam.yaw = yaw == null ? pl.h : pl.h + yaw; g.cam.pitch = 0.3; g.cam.dist = 7.5; g.cam.snap = true; g.cam.lastInput = g.t();
  }, [yaw, Q]);
  // who the lens is inside (within a body's reach and the near plane's of their middle), and whether they are drawn
  const inside = () => p.evaluate(() => {
    const g = window.__game, c = g.camera.position, cx = c.x, cy = -c.z, cz = c.y, out = [];
    const drawn = root => { let on = false; root.traverse(q => { if (q.isMesh && q.layers.isEnabled(0) && q.visible) on = true; }); return on && root.visible; };
    const test = (who, root, x, y, z, hh, r) => { if (Math.hypot(x - cx, y - cy) < r && cz > z && cz < z + hh) out.push({ who, drawn: !!root && drawn(root), d: +Math.hypot(x - cx, y - cy).toFixed(2) }); };
    for (const n of g.npcs) if (n.rig && n.rig.root) test(n.name || n.id, n.rig.root, n.x, n.y, n.z, 1.85, 0.6);
    const gd = g.guideMade && g.guideMade(); if (gd && gd.root) test('guide', gd.root, gd.x, gd.y, gd.z, 0.85, 0.55);
    return out;
  });
  let bad = 0, near = 0;
  for (let k = 0; k < 24; k++) {
    await put(k / 24 * 2 * Math.PI); await frames(6);
    const r = await inside();
    near += r.length;
    for (const q of r) if (q.drawn) { bad++; console.log(`FAIL camera turned ${(k * 15)}°: the lens ${q.d} m from ${q.who}'s middle, and ${q.who} is drawn`); }
  }
  // and the issue's failure itself, forced: Yuna standing where the lens is (her middle 0.15 m from it)
  await put(Math.PI); await frames(6);
  await p.evaluate(() => { const g = window.__game, n = g.npcs.find(q => q.id === 'yuna'), c = g.camera.position; n.x = c.x + 0.1; n.y = -c.z + 0.1; n.z = Math.max(0, c.y - 1.55); n.rig.root.position.set(n.x, n.z, -n.y); });
  await frames(4);
  { const f = (await inside()).filter(q => /Yuna|yuna|優奈/.test(q.who));
    console.log(`Yuna where the lens is: ${f.length ? f.map(q => (q.drawn ? 'DRAWN' : 'not drawn')).join(', ') : 'the lens not in her (moved on?)'}`);
    for (const q of f) if (q.drawn) bad++;
    await p.screenshot({ path: `${out}/lens-in-yuna-${w}x${h}.png`, timeout: 300000 }); }
  await put(0.85 * Math.PI); await frames(8);
  const r = await inside();
  console.log(`the issue's case (turned 153°): ${r.length ? r.map(q => `inside ${q.who}, ${q.drawn ? 'DRAWN' : 'not drawn'}`).join('; ') : 'the lens in nobody'}`);
  for (const q of r) if (q.drawn) bad++;
  await p.screenshot({ path: `${out}/lobby-turned-${w}x${h}.png`, timeout: 300000 });
  await put(null); await frames(8); await p.screenshot({ path: `${out}/lobby-behind-${w}x${h}.png`, timeout: 300000 });
  console.log(`${near} views with the lens in someone; ${bad} of them drawn; page errors: ${errors.length}`);
  await b.close();
  process.exit(bad || errors.length ? 1 : 0);
})();
