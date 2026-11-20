// The story played with a controller (#21): a virtual pad (navigator.getGamepads stubbed, the standard mapping) and
// nothing else. A on the title, A to put the order in the hand away, the left stick walks and the right one looks, A passes
// each line, the left trigger raises the camera and the right one is the release: frame 1 to its print. Then the case
// taken up at frame 3, and the detective's question answered with the d-pad and A. Stills of the prompts while the pad is
// in the hand and after a key is pressed (the keys' again). Exits 1 on a failure. No physical pad is held by this.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/pad_check.js out_dir [WxH]
// DRAW=n as tools/story_play.js (default 30: one frame in thirty drawn, so that the story keeps its time on a software renderer)
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/pad-check', size = '1440x900'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number);
  const args = process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const errors = [], fail = m => { errors.push(m); console.log('FAIL', m); };
  p.on('pageerror', e => fail(`pageerror: ${String(e).slice(0, 240)}`));
  fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(() => {
    try { localStorage.setItem('oe-quality', 'high'); } catch (e) { /* storage blocked */ }
    // the virtual pad: seventeen buttons and four axes, as a standard-mapping pad has; a rumble that is counted
    const btn = () => ({ pressed: false, touched: false, value: 0 });
    const V = window.__vpad = { id: 'Virtual pad (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', index: 0, connected: true, mapping: 'standard', timestamp: 0, buttons: Array.from({ length: 17 }, btn), axes: [0, 0, 0, 0], rumbles: [],
      vibrationActuator: { type: 'dual-rumble', playEffect: (t, o) => { V.rumbles.push(o.duration); return Promise.resolve('complete'); } } };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [V, null, null, null], configurable: true });
  });
  const DRAW = +(process.env.DRAW || 30);
  if (DRAW > 1) await p.addInitScript(n => {
    const P = WebGL2RenderingContext.prototype, raf = window.requestAnimationFrame.bind(window), D = window.__draw = { all: false, on: true, frames: 0 };
    window.requestAnimationFrame = fn => raf(t => { D.on = D.all || D.frames++ % n === 0; fn(t); D.on = true; });
    for (const k of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements', 'blitFramebuffer']) { const f = P[k]; P[k] = function (...a) { if (D.on) return f.apply(this, a); }; }
  }, DRAW);
  const snap = async name => { if (DRAW > 1) await p.evaluate(() => new Promise(r => { window.__draw.all = true; requestAnimationFrame(() => requestAnimationFrame(r)); })); await p.screenshot({ path: `${out}/${name}.png` }); if (DRAW > 1) await p.evaluate(() => { window.__draw.all = false; }); };
  const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
  // (a button held over a few of the game's frames, so that its poll sees it go down and come up)
  const frames = n => p.evaluate(n => new Promise(r => { const f = () => (n-- > 0 ? requestAnimationFrame(f) : r()); f(); }), n);
  const set = (k, v) => p.evaluate(([i, v]) => { const q = window.__vpad.buttons[i]; q.pressed = v > 0.5; q.value = v; window.__vpad.timestamp++; }, [B[k], v]);
  const press = async k => { await set(k, 1); await frames(3); await set(k, 0); await frames(3); };
  const axes = a => p.evaluate(a => { window.__vpad.axes = a; window.__vpad.timestamp++; }, a);
  const st = () => p.evaluate(() => { const s = window.__game.story.state, d = document.getElementById('gd'); return { phase: s.phase, beat: s.beat, fi: s.fi, cam: !!s.cam, prints: s.prints.length, dlg: !d.hidden, choices: document.querySelectorAll('#gd-choices button').length, want: s.want, pad: document.getElementById('game-stage').classList.contains('pad') }; });
  const goTo = (at, d) => p.evaluate(([at, d]) => { const g = window.__game, pl = g.player; let dx = pl.x - at[0], dy = pl.y - at[1], l = Math.hypot(dx, dy); if (l < 0.5) { dx = 1; dy = 0; l = 1; } pl.x = at[0] + dx / l * d; pl.y = at[1] + dy / l * d; if (at[2] != null) pl.z = at[2] + 0.2; pl.h = Math.atan2(-dx, -dy); if (g.cam) g.cam.yaw = pl.h; }, [at, d]);
  const until = async (fn, secs, what) => { const t = Date.now(); while (Date.now() - t < secs * 1000) { const s = await st(); if (await fn(s)) return s; await p.waitForTimeout(400); } fail(`timed out: ${what} ${JSON.stringify(await st())}`); return null; };

  await p.goto(`http://localhost:${process.env.PORT || 8800}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.waitForTimeout(2500);
  // the title: A starts the evening (and the prompt on its button is the pad's once the pad is touched)
  await axes([0, 0, 0.6, 0]); await frames(3); await axes([0, 0, 0, 0]); await frames(3); await p.waitForTimeout(300); // (the pad touched: a stick nudged)
  await snap('0-title-pad');
  const titleKbd = await p.evaluate(() => (document.querySelector('#gt-play kbd') || {}).textContent);
  if (titleKbd !== 'A') fail(`the title's button names "${titleKbd}", not the pad's A`);
  // (the title opens on its press: A opens the menu)
  await press('A'); await p.waitForTimeout(1200);
  if ((await p.evaluate(() => window.__game.screen())) !== 'menu') fail(`A on the press did not open the menu (on "${await p.evaluate(() => window.__game.screen())}")`);
  // (the walk leads the menu's list while the episodes are being finished, and A takes it: down moves the hand from it,
  // whether it is on it or on none, to the story; A opens the story's screen with the hand on its Begin, and A again begins)
  if (await p.evaluate(() => !!document.getElementById('gt-walk-go'))) {
    await press('DOWN'); await p.waitForTimeout(200);
    if (!(await p.evaluate(() => document.activeElement && document.activeElement.id === 'gt-story-go'))) fail(`down on the menu did not move the hand from the walk to the story (${await p.evaluate(() => (document.activeElement || {}).id)})`);
    await press('A'); await p.waitForTimeout(1200);
    if ((await p.evaluate(() => window.__game.screen())) !== 'story' || !(await p.evaluate(() => (document.activeElement || {}).id === 'gt-play'))) fail("A on the story's row did not open its screen with the hand on Begin");
  }
  await press('A'); await p.waitForTimeout(1200);
  // (the first time, who you play comes up on its own screen: A puts the hand on the first portrait, the d-pad moves it,
  // A chooses, and A again confirms and begins. An A that began without asking, or a choice not made by the pad, fails)
  if (await p.evaluate(() => document.getElementById('g-title').hasAttribute('data-choose'))) {
    await press('A'); await p.waitForTimeout(300);
    if (!(await p.evaluate(() => document.getElementById('g-title').hidden === false && document.activeElement && document.activeElement.dataset.c === 'W'))) fail('the first A on who you play did not put the hand on the first portrait');
    await press('RIGHT'); await p.waitForTimeout(200); await press('A');
    await p.waitForFunction(() => { try { return localStorage.getItem('oe3d-player') === 'M'; } catch (e) { return false; } }, null, { timeout: 120000 }).catch(() => fail('the pad did not choose the second portrait'));
    await snap('0-title-chosen');
    await press('A');
  }
  if (!(await p.waitForFunction(() => document.getElementById('g-title').hidden, null, { timeout: 30000 }).catch(() => null))) fail('A did not start from the title');
  // the order in the hand: A puts it away
  const ord = await until(async s => s.beat === 'order' || (s.phase === 'stop'), 900, 'the order in the hand');
  if (ord && ord.beat === 'order') { await p.waitForTimeout(2500); await snap('1-order-pad'); const em = await p.evaluate(() => (document.querySelector('#g-story-order em') || {}).textContent || ''); if (!/^A\b/.test(em.trim())) fail(`the order's prompt says "${em}" to a pad`); await press('A'); await until(async s => s.beat !== 'order', 30, 'A to put the order away'); console.log('the order: A put it away'); }
  // the opening plays itself out; then the first Stop, and the afterimage to walk to
  await until(async s => s.phase === 'stop' && s.beat === 'seek', 1500, 'the first Stop');
  console.log('the first Stop; rumbles so far:', await p.evaluate(() => window.__vpad.rumbles.length));
  if (!(await p.evaluate(() => window.__vpad.rumbles.length))) fail('no rumble on the Stop');
  // the left stick walks (held forward a while: the player moves), and the right stick looks
  { const a = await p.evaluate(() => [window.__game.player.x, window.__game.player.y, window.__game.cam.yaw]);
    await axes([0, -1, 0.9, 0]); await p.waitForTimeout(2500); await snap('2-walk-pad'); await axes([0, 0, 0, 0]);
    const z = await p.evaluate(() => [window.__game.player.x, window.__game.player.y, window.__game.cam.yaw]);
    const moved = Math.hypot(z[0] - a[0], z[1] - a[1]), turned = Math.abs(z[2] - a[2]);
    console.log(`left stick: ${moved.toFixed(1)} m walked; right stick: ${turned.toFixed(2)} rad turned`);
    if (moved < 0.5) fail('the left stick did not walk'); if (turned < 0.05) fail('the right stick did not look'); }
  const at = await p.evaluate(() => { const g = window.__game.story.state.ghost; return [g.x, g.y, g.z]; });
  await goTo(at, 2.2);
  // what they say: A passes each line (the first press shows a typed line whole)
  for (let i = 0; i < 80; i++) { const s = await st(); if (s.beat === 'shoot') break; if (s.dlg) { if (i === 2) await snap('3-dialogue-pad'); await press('A'); await p.waitForTimeout(250); } else await p.waitForTimeout(400); }
  const T = await p.evaluate(() => { const st = window.__game.story.state, T = st.fr.task; return { stand: T.stand || null, subject: T.relic ? [T.relic.at[0], T.relic.at[1], (T.relic.at[2] != null ? T.relic.at[2] : window.__game.player.z - 0.2) + (T.relic.eye != null ? T.relic.eye : 0.6)] : T.subject || null }; });
  if (T.stand) await goTo(T.stand, 0.6);
  if (T.subject) await p.evaluate(at => { const g = window.__game, pl = g.player, d = Math.hypot(at[0] - pl.x, at[1] - pl.y); pl.h = Math.atan2(at[0] - pl.x, at[1] - pl.y); g.cam.yaw = pl.h; g.cam.pitch = at[2] != null ? Math.max(-0.25, Math.min(1.35, 0.3 - Math.atan2(at[2] - (pl.z + 1.6), d))) : 0.25; }, T.subject);
  await p.waitForTimeout(1200);
  await snap('4-camera-down-pad');
  const prompts = await p.evaluate(() => ({ cam: document.getElementById('g-story-cam').textContent, shutter: document.getElementById('g-story-shutter').textContent }));
  console.log('prompts with the pad:', JSON.stringify(prompts));
  if (!/LT/.test(prompts.cam)) fail(`the camera's prompt with a pad: "${prompts.cam}"`);
  // the left trigger, held, raises the camera; let go, it comes down; held again, and the right trigger is the release
  await set('LT', 1); await frames(4); let s = await st();
  if (!s.cam) fail('the left trigger did not raise the camera');
  await p.waitForTimeout(1500); await snap('5-camera-up-pad');
  const sh = await p.evaluate(() => document.getElementById('g-story-shutter').textContent);
  if (!/RT/.test(sh)) fail(`the shutter's prompt with a pad: "${sh}"`);
  await set('LT', 0); await frames(4); s = await st();
  if (s.cam) fail('let go, the left trigger did not lower the camera');
  await set('LT', 1); await frames(4); await p.waitForTimeout(800);
  const r0 = await p.evaluate(() => window.__vpad.rumbles.length);
  if (DRAW > 1) await p.evaluate(() => { window.__draw.all = true; });
  await press('RT');
  if (DRAW > 1) await p.evaluate(() => { window.__draw.all = false; });
  await set('LT', 0);
  s = await until(async s => s.prints >= 1, 30, 'the right trigger to take frame 1');
  if (s) console.log('frame 1: taken with the right trigger');
  if ((await p.evaluate(() => window.__vpad.rumbles.length)) <= r0) fail('no rumble on the shutter');
  await p.waitForTimeout(2000); await snap('6-print-pad');
  // a key pressed: the keys' prompts again
  await p.keyboard.press('KeyW'); await p.waitForTimeout(300);
  const keysBack = await p.evaluate(() => ({ pad: document.getElementById('game-stage').classList.contains('pad'), kbd: [...document.querySelectorAll('#game-stage kbd')].filter(k => k.offsetParent).map(k => k.textContent) }));
  if (keysBack.pad) fail('a key pressed, and the pad\'s prompts stayed');
  // and the roll: Y opens it, the d-pad moves through it, B closes it
  // (what is said of the print: A through it, until time runs again)
  for (let i = 0; i < 60; i++) { const s = await st(); if (s.phase === 'after' || s.phase === 'go') break; if (s.dlg) await press('A'); await p.waitForTimeout(400); }
  await until(async s => s.phase === 'after' || s.phase === 'go', 60, 'time to run again');
  await press('Y'); await p.waitForTimeout(500);
  if (!(await p.evaluate(() => document.getElementById('g-story-album').classList.contains('on')))) fail('Y did not open the roll');
  await press('DOWN'); await press('DOWN'); await p.waitForTimeout(300); await snap('7-roll-pad');
  await press('B'); await p.waitForTimeout(400);
  if (await p.evaluate(() => document.getElementById('g-story-album').classList.contains('on'))) fail('B did not close the roll');
  if (await p.evaluate(() => !document.getElementById('g-menu').hidden)) fail('B on the roll opened the pause menu too');
  await press('VIEW'); await p.waitForTimeout(400);
  if (!(await p.evaluate(() => document.getElementById('g-story-log').classList.contains('on')))) fail('View did not open the log');
  await snap('8-log-pad'); await press('B'); await p.waitForTimeout(300);
  // a key: the prompts are the keys' again
  await p.keyboard.press('KeyA'); await p.waitForTimeout(500); await snap('9-keys-again');

  // a question with choices: the case taken up at frame 3, the detective asks who you are; the d-pad to the answer, and A
  await p.evaluate(() => { localStorage.setItem('oe-story-late', JSON.stringify({ fi: 2, left: 5, prints: [{ src: null, stamp: 'frame 1', cap: '' }, { src: null, stamp: 'frame 2', cap: '' }] })); });
  await p.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.waitForTimeout(2000);
  await press('A');
  await until(async s => s.fi === 2 && (s.phase === 'go' || s.phase === 'stop'), 600, 'frame 3');
  // (to where the world stops, put there as tools/story_play.js puts its player: the way between places is not what this checks)
  for (let i = 0; i < 300; i++) { const s = await st(); if (s.phase === 'stop') break; if (s.dlg) await press('A'); else if (s.beat === 'approach') { const at = await p.evaluate(() => { const fr = window.__game.story.state.fr; return fr.stop_at || (fr.afterimage && fr.afterimage.at); }); if (at) await goTo(at, 4); } await p.waitForTimeout(500); }
  await until(async s => s.phase === 'stop' && s.beat === 'seek', 300, 'the Stop of frame 3');
  await goTo(await p.evaluate(() => { const g = window.__game.story.state.ghost; return [g.x, g.y, g.z]; }), 2.2);
  let answered = false;
  for (let i = 0; i < 120 && !answered; i++) {
    const s = await st();
    if (s.dlg && s.choices) {
      await snap('10-question-pad');
      for (let k = 0; k <= s.want; k++) await press('DOWN'); // (the first press puts the hand on the first answer)
      const f = await p.evaluate(() => { const b = document.activeElement; return b && b.closest('#gd-choices') ? +b.dataset.k : -1; });
      if (f !== s.want) fail(`the d-pad is on answer ${f + 1}, not ${s.want + 1}`);
      await snap('11-question-chosen-pad');
      await press('A'); await p.waitForTimeout(600);
      const after = await p.evaluate(() => document.getElementById('g-story-fail').classList.contains('on'));
      if (after) fail('the answer chosen with the pad was taken for a wrong one');
      answered = true; console.log('a question with choices: answered with the d-pad and A');
    } else if (s.dlg) { await press('A'); await p.waitForTimeout(250); } else await p.waitForTimeout(400);
  }
  if (!answered) fail('no question with choices came');
  console.log(`${errors.length ? 'FAIL' : 'ok'}: ${errors.length} failures`);
  await b.close();
  process.exit(errors.length ? 1 : 0);
})();
