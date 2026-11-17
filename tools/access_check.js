// The story's reach without a mouse and a keyboard: a controller at parity with the keys (the Gamepad API's standard
// mapping, faked in the page) into play, through a conversation and its answers, to the log of the evening (log.js) and
// the roll and back; and the chase camera kept out of the tree crowns by Hachiko (issue 10). Stills of each into out_dir.
// (The log's own words and sizes are tools/dialogue_check.js's.)
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/access_check.js out_dir [WxH]          (ONLY=trees: the camera by Hachiko's cherries only)
// Exits 1 on a failed check or a page error.
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/access-check', size = '1440x900'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number), phone = w < 500;
  const args = process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
  const errors = [], fails = [];
  p.on('pageerror', e => { errors.push(String(e)); console.log('pageerror:', String(e).slice(0, 300)); });
  fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(t => { try { localStorage.setItem('oe3d-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  // a controller: window.__pad, read by the game through navigator.getGamepads
  await p.addInitScript(() => {
    const pad = window.__pad = { id: 'test pad', index: 0, connected: true, mapping: 'standard', timestamp: 0, buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })), axes: [0, 0, 0, 0] };
    navigator.getGamepads = () => [pad, null, null, null];
  });
  const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };
  const frames = n => p.evaluate(n => new Promise(r => { const f = () => (n-- > 0 ? requestAnimationFrame(f) : r()); f(); }), n);
  const press = async (i, hold = 3) => { await p.evaluate(i => { const b = window.__pad.buttons[i]; b.pressed = true; b.value = 1; }, i); await frames(hold); await p.evaluate(i => { const b = window.__pad.buttons[i]; b.pressed = false; b.value = 0; }, i); await frames(2); };
  const snap = name => p.screenshot({ path: `${out}/${name}.png`, timeout: 120000 }).catch(() => console.log(`(no still ${name})`));
  await p.goto(`http://localhost:${process.env.PORT || 8800}/${process.env.Q || ''}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.waitForTimeout(1500);

  // the title: A begins
  await press(0);
  await p.waitForTimeout(800);
  check(await p.evaluate(() => document.getElementById('g-title').hidden), 'A on the title begins');
  const play = () => p.evaluate(() => { const g = window.__game, s = g.story && g.story.state, o = g.overture && g.overture(), d = document.getElementById('gd'); return { phase: s ? s.phase : 'free', beat: s ? s.beat : '', dlg: !!d && !d.hidden, choices: !!g.dlg.hasChoices, film: !!(o && o.active) || !!(g.cine && g.cine.active) }; });
  if (process.env.ONLY !== 'trees') { // (ONLY=trees: the camera by the trees alone)
  // on into play by the controller alone: A through the preface and every line, until the first walk to someone
  // (the opening film and its cameras, which a key would skip, played out as they are)
  const t0 = Date.now();
  for (;;) {
    const s = await play();
    if (s.phase === 'free' || (s.phase === 'go' && !s.dlg && !s.film)) break;
    if (Date.now() - t0 > 1200e3) { check(false, `into play by the controller (stuck at ${JSON.stringify(s)})`); break; }
    if (s.dlg && s.choices) { await press(13); await press(0); } // (an answer: ringed, then taken)
    else if (s.dlg || s.film || (s.phase === 'dressed' && s.beat === 'preface')) await press(0); // (A skips the opening's film, as any key does)
    await p.waitForTimeout(700);
  }
  check((await play()).phase !== 'dressed', 'into play by the controller alone');
  await frames(10);

  // a conversation: A goes on, the d-pad rings an answer, A takes it; every line and the answer are in the log
  const talk = await p.evaluate(() => new Promise(r => { window.__picked = null; window.__game.dlg.show({ name: 'Sumiko', role: '1964', alive: false, color: '#9fc4ff', log: true }, ['The glove was on the rail.', 'Whose was it?'], [{ text: 'Hers' }, { text: 'His' }], c => { window.__picked = c ? c.text : null; }); r(true); }));
  check(talk, 'a conversation opens');
  await p.evaluate(() => { const d = window.__game.dlg; for (let i = 0; i < 200; i++) d.tick(0.05); });
  await press(0); // (to the second line)
  await p.evaluate(() => { const d = window.__game.dlg; for (let i = 0; i < 200; i++) d.tick(0.05); });
  check(await p.evaluate(() => window.__game.dlg.hasChoices), 'the answers stand after the last line');
  await press(13); await press(13); // (down twice: the second answer)
  check(await p.evaluate(() => window.__game.dlg.sel === 1 && document.querySelector('#gd-choices button.sel') && document.querySelector('#gd-choices button.sel').dataset.k === '1'), 'the d-pad rings the second answer');
  await snap('1-answer-ringed');
  await press(0);
  check(await p.evaluate(() => window.__picked === 'His'), 'A takes the ringed answer');
  await press(4); // LB: the log of the evening
  const log = await p.evaluate(() => { const l = document.getElementById('g-story-log'); return { open: !!l && l.classList.contains('on'), rows: l ? [...l.querySelectorAll('li:not(.fr)')].map(li => li.className + '|' + li.textContent).slice(-3) : [] }; });
  console.log('  log:', JSON.stringify(log.rows));
  check(log.open && log.rows.length === 3 && /glove/.test(log.rows[0]) && /past/.test(log.rows[0]) && /^a\|/.test(log.rows[2]) && /His/.test(log.rows[2]), 'LB opens the log: both lines, of 1964, and the answer as yours');
  await snap('2-log');
  await press(1); // B puts it away
  check(await p.evaluate(() => !document.getElementById('g-story-log').classList.contains('on')), 'B closes the log');

  // the left stick walks, the right stick looks
  const before = await p.evaluate(() => { const g = window.__game; return { x: g.player.x, y: g.player.y, yaw: g.cam.yaw }; });
  await p.evaluate(() => { window.__pad.axes = [0, -1, 0.9, 0]; });
  await frames(40);
  await p.evaluate(() => { window.__pad.axes = [0, 0, 0, 0]; });
  await frames(3);
  const after = await p.evaluate(() => { const g = window.__game; return { x: g.player.x, y: g.player.y, yaw: g.cam.yaw }; });
  check(Math.hypot(after.x - before.x, after.y - before.y) > 0.3, `the left stick walks (${Math.hypot(after.x - before.x, after.y - before.y).toFixed(2)} m)`);
  check(Math.abs(after.yaw - before.yaw) > 0.05, `the right stick looks (${(after.yaw - before.yaw).toFixed(2)} rad)`);

  // the roll (RB) and, in it, the way to the log; the d-pad rings its buttons and A presses one
  const story = await p.evaluate(() => !!(window.__game.story && document.getElementById('g-story-album')));
  if (story) {
    await press(5);
    const roll = await p.evaluate(() => document.getElementById('g-story-album').classList.contains('on'));
    check(roll, 'RB opens the roll');
    if (roll) {
      check(await p.evaluate(() => !!document.querySelector('#g-story-album button[data-do=log]')), 'the roll has the log');
      let ringed = '';
      for (let k = 0; k < 12 && ringed !== 'log'; k++) { await press(15); ringed = await p.evaluate(() => (document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.do || '' : '')); }
      check(ringed === 'log', 'the d-pad rings the log in the roll');
      await press(0);
      check(await p.evaluate(() => document.getElementById('g-story-log').classList.contains('on') && !document.getElementById('g-story-album').classList.contains('on')), 'A on it opens the log from the roll');
      await press(1);
    }
  }

  }
  await p.evaluate(() => { const m = document.getElementById('g-menu'); if (m && !m.hidden) document.getElementById('g-menu-close').click(); });
  // the camera by Hachiko's cherries: never in a crown, walking round the planters at each side (judged against the crown
  // itself, below its lowest leaf; the game aims 0.4 m lower still, as low as just over the walker's head allows)
  const inCrown = () => p.evaluate(() => { const g = window.__game, c = g.camera.position, L = g.Wd.trees.crownsNear(c.x, -c.z, 20, []); let worst = 9; for (const [cx, cy, cz, r, h] of L) { const out = Math.max(Math.hypot(c.x - cx, -c.z - cy) / r, c.y < cz ? 1 + (cz - h - c.y) / h : 1 + (c.y - cz - h) / h); worst = Math.min(worst, out); } return { worst: +worst.toFixed(2), cam: [+c.x.toFixed(1), +(-c.z).toFixed(1), +c.y.toFixed(1)], duck: +(g.cam.duck || 0).toFixed(2), n: L.length }; });
  const P = [[381.0, -1035.5], [383.6, -1049.2]];
  let worst = 9, k = 0;
  const has = await p.evaluate(() => !!(window.__game.Wd && window.__game.Wd.trees && window.__game.Wd.trees.crownsNear));
  check(has, 'the trees give their crowns');
  // (the opening's film, if it still plays, skipped as a player does: the chase camera is the one judged)
  for (let k = 0; k < 240; k++) { const s = await play(); if (s.phase === 'free' || (s.phase !== 'dressed' && !s.film)) break; await press(s.choices ? 13 : 0); if (s.choices) await press(0); await p.waitForTimeout(700); }
  if (has) for (const [px, py] of P) for (const a of [0, 1.6, 3.1, 4.7]) {
    await p.evaluate(([px, py, a]) => { const g = window.__game, pl = g.player; pl.x = px + Math.sin(a) * 2.4; pl.y = py + Math.cos(a) * 2.4; pl.h = a + Math.PI; g.cam.yaw = pl.h; g.cam.pitch = 0.36; g.cam.dist = 7.5; g.cam.snap = true; }, [px, py, a]);
    await frames(60);
    const s = await inCrown();
    console.log('  hachiko', k, JSON.stringify(s));
    const off = Math.hypot(s.cam[0] - (px + Math.sin(a) * 2.4), s.cam[1] - (py + Math.cos(a) * 2.4));
    if (off > 12) check(false, `the chase camera behind the walker at ${k} (it is ${off.toFixed(0)} m off)`);
    worst = Math.min(worst, s.worst);
    if (k === 0 || k === 6) await snap(`4-hachiko-${k}`);
    k++;
  }
  if (has) check(worst >= 1, `the chase camera stays out of the crowns (nearest ${worst.toFixed(2)}: 1 is a crown's edge)`);
  check(!errors.length, `no page errors (${errors.length})`);
  await b.close();
  console.log(fails.length ? `${fails.length} failed` : 'all passed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
