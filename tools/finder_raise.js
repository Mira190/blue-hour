// A raise of the finder in a living street with the crowd in its way (#232): frame 1's job, the player put 3 m behind
// someone of the crowd standing between them and her corner, so that the lens comes up onto whoever stands there. Stills
// every half second from a second before the raise to four after, and each frame whoever of the crowd within 20 m and in
// the frame is drawn more than 0.6 m from where they were drawn the frame before, or leaves the street (story_play's
// monitor, the same). Exits 1 when anyone jumps in view.
//   PORT=8800 xvfb-run -a node tools/finder_raise.js out_dir [WxH]
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = 'out/finder-raise', size = '1440x900'] = process.argv;
const [w, h] = size.split('x').map(Number), phone = w < 600;
(async () => {
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone });
  p.on('pageerror', e => console.log('page error:', String(e).slice(0, 300)));
  fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high'); // (stills on the desktop tier: AGENTS.md)
  await p.addInitScript(() => {
    const pops = window.__pops = [], was = new Map(); let v = null;
    const tick = () => {
      requestAnimationFrame(tick);
      const g = window.__game, T = window.THREE;
      if (!g || !T || !g.crowd || !g.story || !g.camera) return;
      const fd = !!g.story.finder || !!window.__watch, flash = !!document.querySelector('.game-stage.flash, #g-story-flash.on'), c = g.camera, C = g.crowd;
      if (!fd) { was.clear(); return; }
      v = v || new T.Vector3();
      const now = new Map();
      for (let i = 0; i < C.active; i++) {
        const q = C.P[i], x = q.rx ?? q.x, y = q.ry ?? q.y;
        if (q.line < 0 && !q.pz) { const o = was.get(i); if (o && o.seen && !flash) pops.push({ i, gone: true, m: +o.d.toFixed(1), up: !!g.story.finder }); continue; }
        v.set(x, (q.z || 0) + 1, -y); const d = v.distanceTo(c.position); if (d > 20) continue;
        v.project(c); const seen = v.z < 1 && Math.abs(v.x) < 1 && Math.abs(v.y) < 1.1;
        const o = was.get(i);
        if (o && (seen || o.seen) && !flash) { const m = Math.hypot(x - o.x, y - o.y); if (m > 0.6) pops.push({ i, m: +m.toFixed(2), at: +d.toFixed(1), up: !!g.story.finder }); }
        now.set(i, { x, y, d, seen });
      }
      was.clear(); for (const [k, e] of now) was.set(k, e);
    };
    requestAnimationFrame(tick);
  });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.evaluate(() => document.getElementById('gt-play').click());
  for (let i = 0; i < 600; i++) {
    const s = await p.evaluate(() => { const g = window.__game, o = g.overture && g.overture(), st = g.story.state; return { beat: st.beat, ready: !!st.jobReady, film: !!(o && o.active), cine: g.cine.active, dlg: g.dlg.open }; });
    if (s.beat === 'job' && s.ready && !s.film && !s.cine && !s.dlg) break;
    if (s.dlg) await p.evaluate(() => window.__game.dlg.next(false)); else if (!(s.beat === 'job')) { if (phone) await p.touchscreen.tap(w / 2, h / 2); else await p.keyboard.press('Space'); }
    await p.waitForTimeout(1000);
  }
  // (behind someone of the crowd standing still between you and her corner, 3 m back; the street as it is around them)
  const set = await p.evaluate(() => {
    const g = window.__game, st = g.story.state, J = st.fr.job.at, C = g.crowd, pl = g.player, cand = [];
    for (let i = 0; i < C.active; i++) { const q = C.P[i]; if ((q.line < 0 && !q.pz) || (q.v || 0) > 0.2) continue; const d = Math.hypot(q.x - J[0], q.y - J[1]); if (d > 8 && d < 45) cand.push([d, i]); }
    cand.sort((a, b) => a[0] - b[0]);
    for (const [, i] of cand) {
      const q = C.P[i], dx = J[0] - q.x, dy = J[1] - q.y, L = Math.hypot(dx, dy), x = q.x - dx / L * 3, y = q.y - dy / L * 3, wk = g.nav.walk(x, y, (q.z || pl.z) + 0.6, true);
      if (!wk || !wk.ok || Math.abs(wk.z - (q.z || 0)) > 1) continue;
      pl.x = x; pl.y = y; pl.z = wk.z; pl.h = Math.atan2(dx, dy); pl.speed = 0; g.cam.yaw = pl.h; g.cam.snap = true;
      return { i, at: [+q.x.toFixed(1), +q.y.toFixed(1)], pz: !!q.pz, corner: J.slice(0, 2) };
    }
    return null;
  });
  console.log('placed', JSON.stringify(set));
  await p.waitForTimeout(1500);
  const shot = async n => p.screenshot({ path: `${out}/${String(n).padStart(2, '0')}-${w}x${h}.png` });
  await p.evaluate(() => { window.__watch = true; window.__pops.length = 0; });
  await shot(0); await p.waitForTimeout(500); await shot(1);
  if (phone) await p.evaluate(() => document.querySelector('#g-story-cam, .g-story-cam, [id*="story"][id*="cam"]').click()); else await p.keyboard.press('KeyR');
  const up = await p.evaluate(() => !!window.__game.story.finder);
  console.log('raised', up);
  for (let k = 2; k <= 10; k++) { await p.waitForTimeout(500); await shot(k); }
  const R = await p.evaluate(([i]) => { const g = window.__game, q = g.crowd.P[i]; return { pops: window.__pops.splice(0), who: q ? [+(q.rx ?? q.x).toFixed(2), +(q.ry ?? q.y).toFixed(2), q.line, !!q.pz] : null }; }, [set ? set.i : 0]);
  console.log('the one in the way now', JSON.stringify(R.who));
  if (R.pops.length) { console.log(`FAIL ${R.pops.length} of the crowd jumped or left the street in view: ${JSON.stringify(R.pops.slice(0, 6))}`); process.exitCode = 1; }
  else console.log('nobody of the crowd jumped in view across the raise');
  await b.close();
})().catch(e => { console.error(e); process.exit(2); });
