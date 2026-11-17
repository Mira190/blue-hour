// The headlamp on the car ahead, at the hour frame 6 is set: frame 6's car (fr.ride) is taken until it stands queued
// close behind another car, and stills are taken from the chase camera with the beam set to each of a list of
// settings (cars.js BEAM, OECars.beam: candela at the hot spot, its angle, the spread, the stray light over the
// cut-off), one page load for all of them. Then one from the street on foot, the traffic's lamps coming at you.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/headlamp_shot.js out_dir [WxH] ['[{"cd":1000},{"cd":1500,"hot":-2.5}]']
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/headlamp', size = '1440x900', list = '[{}]'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number), sets = JSON.parse(list);
  const args = process.env.GPU === 'metal' ? ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-gpu']
    : process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 500, isMobile: w < 500 });
  p.on('pageerror', e => console.log('pageerror:', String(e).slice(0, 300)));
  fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(t => { try { localStorage.setItem('oe3d-quality', t); localStorage.setItem('oe-story-late', JSON.stringify({ fi: 5, left: 2, prints: [0, 1, 2, 3, 4].map(i => ({ src: null, stamp: `frame ${i + 1}`, cap: '' })) })); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?overture=0`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => document.getElementById('gt-play').click());
  await p.waitForTimeout(2500);
  await p.evaluate(() => { const pl = window.__game.player; pl.x = 498; pl.y = -1046; });
  const snap = async name => { try { await p.waitForTimeout(2500); await p.screenshot({ path: `${out}/${name}.png`, timeout: 120000 }); console.log('still', name); } catch (e) { console.log(`(no still ${name})`); } };
  const t0 = Date.now();
  let onFoot = false, done = false;
  while (!done && Date.now() - t0 < (+process.env.LIMIT || 1500) * 1000) {
    const s = await p.evaluate(() => { const g = window.__game, r = g.ride(), st = g.story.state, d = document.getElementById('gd'); return { dlg: !!(d && !d.hidden), phase: st.phase, beat: st.beat, mode: g.player.mode, ride: r ? { phase: r.phase, v: r.drv.st.v, gap: r.drv.st.gap, block: !!(r.drv.st.block && r.drv.st.block.h != null) } : null }; });
    if (s.phase === 'dressed') { await p.keyboard.press('KeyQ'); await p.waitForTimeout(800); continue; }
    if (s.dlg) { await p.evaluate(() => { const st = window.__game.story.state, B = document.querySelectorAll('#gd-choices button'); if (B.length) (B[st.want] || B[0]).click(); }); await p.keyboard.press('KeyE'); await p.waitForTimeout(400); continue; }
    if (s.beat === 'ride' && s.ride && s.ride.phase === 'coming') {
      if (!onFoot) { onFoot = true; await p.evaluate(() => { const g = window.__game; g.player.h = Math.PI / 2 + 0.3; if (g.cam) { g.cam.yaw = g.player.h; g.cam.pitch = 0.12; } }); await snap('foot-street'); }
      await p.evaluate(() => { for (let i = 0; i < 45; i++) window.__game.frame(1 / 30); });
    } else if (s.ride && s.ride.phase === 'waiting' && s.mode === 'foot') {
      await p.evaluate(() => { const g = window.__game, st = g.ride().drv.st; g.player.x = st.x + 2.4 * Math.cos(st.h); g.player.y = st.y - 2.4 * Math.sin(st.h); });
      await p.waitForTimeout(600); await p.keyboard.press('KeyE');
    } else if (s.mode === 'ride' && s.ride && s.ride.phase === 'driving') {
      if (s.ride.v < 0.3 && s.ride.gap < 9 && s.ride.block) {
        console.log('queued', s.ride.gap.toFixed(1), 'm behind a car');
        for (const [i, set] of sets.entries()) {
          await p.evaluate(set => { const B = window.OECars.beam; Object.assign(B, set); B.apply(); }, set);
          await snap(`queued-${i}`);
          console.log(i, JSON.stringify(await p.evaluate(() => { const B = window.OECars.beam; return Object.fromEntries(Object.entries(B).filter(e => typeof e[1] === 'number')); })));
        }
        done = true;
      } else await p.evaluate(() => { for (let i = 0; i < 15; i++) window.__game.frame(1 / 30); });
    }
    await p.waitForTimeout(300);
  }
  if (!done) console.log('FAIL never queued behind a car');
  await b.close();
  process.exit(done ? 0 : 1);
})();
