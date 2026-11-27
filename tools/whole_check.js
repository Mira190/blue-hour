// Nobody drawn in part (issue 241): a person, the guide or a car is a model of several meshes (a person's body, and
// the head's face, scalp and hair as materials of their own), and a frame that drew some of a model's meshes and held
// back others showed a woman's head and neck standing on the Scramble's asphalt with no body under it, as the walk was
// handed over after its opening. The draw gate (web/world.js gate: a mesh never drawn whose shader is still being
// linked, KHR_parallel_shader_compile, comes a frame or more late rather than the frame waiting) held her body's
// material while her head's, already linked, drew.
//
// This page opens the walk as Set out does (its opening's film, then the walk handed over), and from the page's start
// to WAIT seconds after the handover watches every draw of the scene: each draw asked of the renderer is drawn or held
// (the renderer's count of draws before and after it). A model is a child of the scene with a skinned mesh in it (a
// person, the guide), or a model marked whole (userData.whole: a car, the helicopter). A frame that drew a model's mesh
// and held another of the same model fails, naming the model and its meshes.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/whole_check.js [out_dir] [WxH] [hour] [sky]     WAIT=12 (seconds after the handover)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { wholeWatch, wholeReport } = require('./whole_watch.js');
const [,, out = '/tmp/whole-check', size = '1440x900', hour = 'night', sky = 'clear'] = process.argv;
const [W, H] = size.split('x').map(Number), phone = W < 600, tag = phone ? 'phone' : 'desk';
const WAIT = +(process.env.WAIT || 12);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const args = process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(`pageerror: ${String(e).slice(0, 300)}`));
  await p.addInitScript(([t, spec]) => {
    try { localStorage.setItem('bh-quality', t); sessionStorage.setItem('bh-walk-auto', JSON.stringify(spec)); } catch (e) { /* storage blocked */ }
  }, [process.env.TIER || 'high', { t: hour, w: sky, film: true }]);
  await p.addInitScript(wholeWatch);
  const t0 = Date.now();
  await p.goto(`http://localhost:${process.env.PORT || 8800}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  // the film: let it begin, then (FILM=1 plays it whole) sought to its end, as walk_open.js does, so that the handover
  // comes in minutes on a software renderer and not in half an hour
  const film = await p.waitForFunction(() => { const g = window.__game, o = g && g.overture && g.overture(); return !!(o && o.active && o.walk); }, null, { timeout: 900000, polling: 200 }).then(() => true, () => false);
  if (!film) errors.push('the walk set out and its opening did not play');
  else if (!process.env.FILM) { await p.waitForTimeout(3000); await p.evaluate(() => window.__game.cine.seek(0.985)); }
  const on = await p.waitForFunction(() => document.getElementById('game-stage').classList.contains('walk-on'), null, { timeout: 1500000, polling: 250 }).then(() => true, () => false);
  if (!on) errors.push('the walk was never handed over');
  else console.log(`the walk handed over ${Math.round((Date.now() - t0) / 1000)} s after the page opened`);
  const shot = path.join(out, `whole-${tag}-${hour}-${sky}-control.png`);
  // (the frames after the handover, in the page's own time: a software renderer draws a few a second)
  if (on) await p.waitForTimeout(WAIT * 1000);
  await p.screenshot({ path: shot, timeout: 180000 });
  const R = wholeReport(await p.evaluate(() => window.__whole));
  for (const l of R.lines) console.log(l);
  if (R.fail) errors.push(R.fail);
  else console.log('ok   nobody and no model drawn in part, from the page\'s start to the walk handed over and after');
  console.log(shot);
  for (const e of errors) console.log(`FAIL ${e}`);
  await b.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
