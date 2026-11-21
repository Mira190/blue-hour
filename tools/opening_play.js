// The first frame as the opening plays it (docs/STORY.md, "The opening rebuilt"): the order in the hand, then the office on
// the phone hands-free while the street runs, the player's own camera raised to her corner, the world stopped in the
// finder, her talk, the camera of 1964 taught and the first print, and time running again into the second frame's goal.
// Fails if the player cannot walk while the call is said, if the camera can come up before the office asks for the
// picture, if the world stops before the camera is raised or does not stop once her corner is held in the finder, if the
// view is not the lens's as it stops, or if the second frame's goal is waited for after the first print (it was ten
// seconds and a five-line call that held the player still). Stills of each beat.
//   JOB_LIGHT=1 tools/job.sh run serve -- python3 -m http.server 8800 --directory web
//   xvfb-run -a node tools/opening_play.js out_dir [WxH]          (390x844: a phone, by touch)
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/opening-play', size = '1440x900'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number), phone = w < 500;
  const args = process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
  const errors = [], fail = m => { errors.push(m); console.log('FAIL', m); };
  p.on('pageerror', e => fail(`pageerror: ${String(e).slice(0, 200)}`));
  fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(t => { try { localStorage.setItem('oe3d-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'low');
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?overture=0&preface=0`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.evaluate(() => document.getElementById('gt-play').click());
  await p.waitForFunction(() => !['idle', 'dressed'].includes(window.__game.story.state.phase), null, { timeout: 900000, polling: 500 });
  const snap = name => p.screenshot({ path: `${out}/${name}.png` }).catch(() => console.log(`(no still ${name})`));
  const S = () => p.evaluate(() => { const g = window.__game, s = g.story.state, d = document.getElementById('gd'), pl = g.player;
    return { phase: s.phase, beat: s.beat, fi: s.fi, t: +s.t.toFixed(1), dlg: !!(d && !d.hidden), free: !!(d && d.classList.contains('free')), cut: !!(d && d.classList.contains('cut')), text: (document.getElementById('gd-text') || {}).textContent || '',
      cam: !!s.cam, finder: !!g.story.finder, ready: !!s.jobReady, goal: (document.querySelector('#g-story-goal span') || {}).textContent || '', btn: document.getElementById('g-story-cam').classList.contains('on'),
      at: [+pl.x.toFixed(2), +pl.y.toFixed(2)], dog: !!s.dog }; });
  const until = async (f, s, what) => { const t0 = Date.now(); for (;;) { const q = await S(); if (f(q)) return q; if (Date.now() - t0 > s * 1000) { fail(`waited ${s} s for ${what}: ${JSON.stringify(q).slice(0, 300)}`); return q; } await p.waitForTimeout(250); } };
  const press = async k => { if (phone && k === 'R') await p.tap('#g-story-cam', { timeout: 1500 }).catch(() => {}); else await p.keyboard.press(`Key${k}`); }; // (a phone: the button, where it is offered)
  const t0 = Date.now(), wall = () => `${((Date.now() - t0) / 1000).toFixed(0)} s`;
  // the order in the hand, put away
  await until(q => q.beat === 'order', 120, 'the order');
  await p.waitForTimeout(2500); await snap('1-order');
  if (phone) await p.touchscreen.tap(w / 2, h * 0.83); else await p.keyboard.press('KeyE');
  // the office rings: the call is hands-free, and the street the player's
  let q = await until(q => q.dlg, 240, 'the office on the phone');
  console.log(`${wall()} the call: free ${q.free}, phase ${q.phase}/${q.beat}, goal "${q.goal}" · "${q.text.slice(0, 60)}"`);
  if (q.phase !== 'go' || q.beat !== 'job') fail(`the call is heard in ${q.phase}/${q.beat}, not before the Stop`);
  if (!q.free) fail('the call holds the player: it is not hands-free');
  await p.waitForTimeout(1500); await snap('2-call');
  // walk while it is said (a desktop: W for a second and a half; a phone has the stick, which is the same walk)
  if (!phone) {
    // (held until a step is made or eight seconds of the wall: on a software renderer a second of the wall is a tenth of the game's)
    const a = q.at; let b2 = q, moved = 0; await p.keyboard.down('KeyW');
    for (let i = 0; i < 32 && moved < 0.5; i++) { await p.waitForTimeout(250); b2 = await S(); moved = Math.hypot(b2.at[0] - a[0], b2.at[1] - a[1]); }
    await p.keyboard.up('KeyW'); await p.waitForTimeout(300);
    console.log(`${wall()} walked ${moved.toFixed(2)} m while the call was said (still on: ${b2.dlg})`);
    if (moved < 0.5) fail(`the player could not walk while the call was said (${moved.toFixed(2)} m)`);
    await p.evaluate(a => { const g = window.__game, pl = g.player; pl.x = a[0]; pl.y = a[1]; }, a); // (back where the street was given)
  }
  // the camera does not come up before the office asks for the picture
  await press('R'); await p.waitForTimeout(600); q = await S();
  if (q.cam || q.btn) fail(`the camera ${q.cam ? 'came up' : 'was offered'} before the office asked for the picture`);
  // the lines pass by themselves (on a software renderer the game's clock runs a tenth of the wall's: E passes them, as
  // a player in a hurry does); then the push, and the camera may come up
  for (let i = 0; i < 40; i++) { q = await S(); if (q.ready) break; if (q.dlg) await p.keyboard.press(phone ? 'Enter' : 'KeyE'); await p.waitForTimeout(1200); }
  q = await until(q => q.ready, 120, 'the office asking for the picture');
  console.log(`${wall()} ready: goal "${q.goal}", button ${q.btn}, line "${q.text.slice(0, 60)}"`);
  await p.waitForTimeout(900); q = await S(); if (!q.btn) fail('the office asked for the picture, and there is no button to raise the camera');
  await snap('3-raise');
  // turned away from her corner, raised: it does not stop until the corner is in the frame lines
  await p.evaluate(() => { const g = window.__game, pl = g.player, J = g.story.state.fr.job; const yaw = Math.atan2(J.at[0] - pl.x, J.at[1] - pl.y) + Math.PI; pl.h = yaw; g.cam.yaw = yaw; g.cam.pitch = 0.3; });
  await p.waitForTimeout(400); await press('R'); await p.waitForTimeout(2500); q = await S();
  console.log(`${wall()} raised facing away: phase ${q.phase}, finder ${q.finder}, goal "${q.goal}"`);
  if (q.phase !== 'go') fail('the world stopped with her corner behind the camera');
  if (!q.finder) fail('raised, the view is not the lens\'s');
  await snap('4-raised-away');
  // turned onto it, held: the world stops in the finder
  await p.evaluate(() => { const g = window.__game, pl = g.player, J = g.story.state.fr.job, z = g.story.state.fr.job.at; const yaw = Math.atan2(z[0] - pl.x, z[1] - pl.y); g.cam.yaw = yaw; });
  q = await until(q => q.phase === 'stop', 120, 'the world to stop with her corner in the frame lines');
  console.log(`${wall()} the Stop: finder ${q.finder}, call ${q.cut ? 'cut off' : q.dlg ? 'still on' : 'over'} "${q.text.slice(-30)}"`);
  if (!q.finder) fail('the world stopped, and the view is not the lens\'s as it does');
  await p.waitForTimeout(500); await snap('5-stop-in-the-finder');
  q = await until(q => !q.finder, 60, 'the camera to come down for the Stop');
  await p.waitForTimeout(1200); await snap('6-stop-turn');
  // the dog's film, then her
  q = await until(q => q.beat === 'seek' || q.beat === 'talk', 600, 'the afterimage to walk to');
  console.log(`${wall()} ${q.beat}: the dog ${q.dog}, goal "${q.goal}"`);
  await p.evaluate(() => { const g = window.__game, a = g.story.state.fr.afterimage.at, pl = g.player; const dx = pl.x - a[0], dy = pl.y - a[1], l = Math.hypot(dx, dy) || 1; pl.x = a[0] + dx / l * 2.2; pl.y = a[1] + dy / l * 2.2; pl.h = Math.atan2(-dx, -dy); g.cam.yaw = pl.h; });
  q = await until(q => q.dlg && q.beat === 'talk', 120, 'her talk');
  for (let i = 0; i < 60; i++) { q = await S(); if (q.beat === 'shoot') break; if (q.dlg) await p.keyboard.press('KeyE'); await p.waitForTimeout(500); }
  // the camera of 1964, taught: from the light, raised onto the board, the picture
  const T = await p.evaluate(() => { const T = window.__game.story.state.fr.task; return { stand: T.stand, at: T.relic.at }; });
  await p.evaluate(T => { const g = window.__game, pl = g.player; pl.x = T.stand[0]; pl.y = T.stand[1]; const yaw = Math.atan2(T.at[0] - pl.x, T.at[1] - pl.y); pl.h = yaw; g.cam.yaw = yaw; g.cam.pitch = 0.3; }, T);
  await p.waitForTimeout(1500); await press('R'); await p.waitForTimeout(3000);
  for (let i = 0; i < 30; i++) { q = await S(); if (q.beat === 'shown') break; await p.keyboard.press('KeyF'); if (phone) await p.tap('#g-story-shutter').catch(() => {}); await p.waitForTimeout(800); }
  if (q.beat !== 'shown') fail(`the first picture was not taken: ${q.beat}`);
  // the print, her two lines, and time runs: the second frame's goal at once
  for (let i = 0; i < 80; i++) { q = await S(); if (q.phase === 'after' || q.fi === 1) break; if (q.dlg && !q.free) await p.keyboard.press('KeyE'); await p.waitForTimeout(500); }
  const tRun = Date.now(), s0 = await p.evaluate(() => performance.now());
  q = await until(q => q.fi === 1 && !!q.goal, 120, 'the second frame\'s goal');
  const game = await p.evaluate(() => window.__game.story.state.t);
  const waited = (Date.now() - tRun) / 1000;
  console.log(`${wall()} time ran, and the second frame's goal came ${waited.toFixed(1)} s of the wall later: "${q.goal}" (call: ${q.dlg ? `"${q.text.slice(0, 60)}"` : 'none'})`);
  await snap('7-frame-two');
  if (q.dlg && !q.free) fail('after the first print a call holds the player before the second frame');
  await b.close();
  if (errors.length) { console.log(`${errors.length} failure(s)`); process.exit(1); }
  console.log('ok');
})().catch(e => { console.error(e); process.exit(1); });
