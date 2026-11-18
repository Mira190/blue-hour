// The walk (web/game/walk.js; docs/STORY.md "The walk"), played as a person would: the title's second way in, by the
// mouse and keys on a desktop's page or by touch on a phone's. Opens the page as someone who has never played (nothing
// kept in this browser), and fails if:
//   - the title has no Walk Shibuya beside the episode's button, or it opens before who you play is chosen;
//   - its step does not ask the hour and the sky, or what is chosen there is not the street behind the card (the clock
//     at the hour on the story's evening, the rain falling), or Back does not give the title its own evening again;
//   - set out, the title is still up, the story has begun (its goal, its light, a phase past dressed), the old free
//     game's objective light stands, or where and when you are is not in the corner (the hour as the clock has it);
//   - you cannot walk (the player does not move), or a key of the old free game opens one of its panels (the map,
//     the passport, the lens);
//   - the walk's menu does not offer the story, or still offers the old game's tour and passport;
//   - the camera (photo mode) does not open from the walk's own button;
//   - (on a desktop) the story's last card's Walk Shibuya does not set out on the walk from a fresh page, without the
//     title, at the hour and under the sky it was given.
// Stills of each beat in out_dir.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/walk_play.js out_dir [WxH] [hour] [sky]     (390x844: a phone, by touch; hour blue|night|live, sky clear|rain)
const { chromium } = require('playwright');
const fs = require('fs');
const { dump: uiDump } = require('./ui_dump'); // (UI_DUMP=dir: the interface at each still, for tools/ui_fit.js)
const [,, out = '/tmp/walk-play', size = '1440x900', hour = 'night', sky = 'rain'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number), phone = w < 500;
  const args = process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
  const p = await ctx.newPage();
  const errors = [];
  const fail = m => { errors.push(m); console.log(`FAIL ${m}`); };
  const ok = m => console.log(`ok   ${m}`);
  p.on('pageerror', e => fail(`pageerror: ${String(e).slice(0, 200)}`));
  fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(t => { try { localStorage.setItem('oe3d-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  // someone who has never played: nothing kept (once: the page opened again from the last card keeps what it was given)
  await p.addInitScript(() => { if (!sessionStorage.getItem('wp-once')) { sessionStorage.setItem('wp-once', '1'); try { for (const k of ['oe3d-player', 'oe-walk', 'oe-story-late', 'oe-story-late-closed']) localStorage.removeItem(k); } catch (e) { /* storage blocked */ } } });
  const PORT = process.env.PORT || 8800;
  const title = async () => {
    await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden && getComputedStyle(t).opacity > 0.9; }, null, { timeout: 900000, polling: 500 });
    await p.waitForTimeout(2500); // (the card's parts slide in)
  };
  const visible = sel => p.evaluate(s => { const e = document.querySelector(s); if (!e || e.hidden) return false; const r = e.getBoundingClientRect(), c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.display !== 'none' && c.visibility !== 'hidden' && +c.opacity > 0.05; }, sel);
  const press = async sel => { const r = await p.locator(sel).first().boundingBox(); if (!r) return fail(`${sel}: not on the screen`); const x = r.x + r.width / 2, y = r.y + r.height / 2; if (phone) await p.touchscreen.tap(x, y); else await p.mouse.click(x, y); };
  const shot = async n => { await p.screenshot({ path: `${out}/${phone ? 'phone' : 'desk'}-${n}.png`, timeout: 120000 }).catch(() => console.log(`(no still ${n})`)); if (process.env.UI_DUMP) await uiDump(p, `${process.env.UI_DUMP}/walk-${n}.json`, { ctx: phone ? 'touch' : 'desk' }).catch(() => {}); };
  const state = () => p.evaluate(() => {
    const g = window.__game, c = g.clock, wx = g.weather ? g.weather.state : {};
    const pad = n => String(n).padStart(2, '0'), hm = m => `${pad(Math.floor(m / 60) % 24)}:${pad(Math.floor(m) % 60)}`;
    return { title: !document.getElementById('g-title').hidden, step: !!document.getElementById('gt-walk') && !document.getElementById('gt-walk').hidden,
      ask: (document.querySelector('#gt-who .gt-who-ask') || {}).textContent || '', clock: { m: c.m, d: c.d, min: Math.floor(c.min), hm: hm(c.min) }, wx: { mode: wx.mode, kind: wx.kind, rain: +(wx.rain || 0).toFixed(2) },
      phase: g.story ? g.story.state.phase : null, lights: g.lights(), eyebrow: document.getElementById('gt-city').textContent,
      walkOn: document.getElementById('game-stage').classList.contains('walk-on'), where: (document.querySelector('#g-walk-where small') || {}).textContent || '', at: (document.querySelector('#g-walk-where .t') || {}).textContent || '',
      goal: !!document.querySelector('#g-story-goal.on'), xy: [g.player.x, g.player.y] };
  });

  // the title, the first time
  await title();
  let s = await state();
  const story0 = { eyebrow: s.eyebrow, clock: s.clock };
  if (!(await visible('#gt-walk-go'))) fail('the title has no Walk Shibuya beside the episode');
  else ok(`the title offers two ways in: "${(await p.textContent('#gt-play')).trim()}" and "${(await p.textContent('#gt-walk-go')).trim()}"`);
  await shot('1-title');
  await press('#gt-walk-go'); await p.waitForTimeout(800);
  s = await state();
  if (s.step) fail('the walk opened before who you play was chosen');
  else if (!/choose who you play/i.test(s.ask)) fail(`Walk Shibuya, pressed before who you play is chosen, did not ask ("${s.ask}")`);
  else ok('the walk waits for who you play, as the story does');
  await press('#gt-who [data-c="M"]'); await p.waitForTimeout(600);
  await press('#gt-walk-go'); await p.waitForTimeout(1200);
  s = await state();
  if (!s.step) fail('who you play chosen, Walk Shibuya does not open its step');
  else if (await visible('#gt-play')) fail('the walk\'s step is up, and the episode\'s button still shows');
  const hours = await p.$$eval('#gt-walk [data-k="t"] button', bs => bs.map(x => [x.dataset.v, x.querySelector('small').textContent]));
  const skies = await p.$$eval('#gt-walk [data-k="w"] button', bs => bs.map(x => x.dataset.v));
  if (hours.length < 3 || hours.some(x => !/^\d\d:\d\d$/.test(x[1])) || !skies.includes('rain')) fail(`the step's hours and skies: ${JSON.stringify(hours)} ${JSON.stringify(skies)}`);
  else ok(`the step asks the hour (${hours.map(x => x.join(' ')).join(', ')}) and the sky (${skies.join(', ')})`);
  await shot('2-step');
  // the hour and the sky chosen are the street behind the card
  await press(`#gt-walk [data-k="t"] [data-v="${hour}"]`); await press(`#gt-walk [data-k="w"] [data-v="${sky}"]`);
  await p.waitForTimeout(3000);
  s = await state();
  const want = hours.find(x => x[0] === hour);
  if (want && s.clock.hm !== want[1] && hour !== 'live') fail(`chose ${hour} (${want[1]}), and the street behind the title is at ${s.clock.hm}`);
  else if (hour !== 'live' && (s.clock.m !== story0.clock.m || s.clock.d !== story0.clock.d)) fail(`chose ${hour}, and the walk is not on the story's evening (${s.clock.d}/${s.clock.m})`);
  else if (sky === 'rain' && !(s.wx.mode === 'rain' && s.wx.rain > 0.3)) fail(`chose the rain, and it is not raining behind the title (${JSON.stringify(s.wx)})`);
  else ok(`${hour} and ${sky} chosen: the street behind the title is at ${s.clock.hm}, ${s.wx.kind}; over the card "${s.eyebrow}"`);
  if (!s.eyebrow.includes(s.clock.hm)) fail(`the card's line over the title does not say the hour chosen ("${s.eyebrow}")`);
  await shot('3-chosen');
  // back, and the title's own evening again; then the step again, as it was left
  await press('#gt-walk-back'); await p.waitForTimeout(2500);
  s = await state();
  if (s.step || !(await visible('#gt-play'))) fail('Back did not give the title its two ways in again');
  else if (s.eyebrow !== story0.eyebrow || s.clock.hm !== story0.clock.hm) fail(`Back: the title is not the story's evening again ("${s.eyebrow}", ${s.clock.hm}; was ${story0.clock.hm})`);
  else if (sky === 'rain' && s.wx.mode === 'rain') fail('Back: the rain the walk was offered in still falls on the story\'s title');
  else ok(`Back: the story's evening again (${s.clock.hm}, ${s.wx.mode})`);
  await press('#gt-walk-go'); await p.waitForTimeout(1500);
  s = await state();
  const kept = await p.$$eval('#gt-walk [aria-checked="true"]', bs => bs.map(x => x.dataset.v));
  if (!s.step || !kept.includes(hour) || !kept.includes(sky)) fail(`the step opened again does not keep what was chosen (${kept})`);
  // set out
  if (phone) await press('#gt-walk-set'); else await p.keyboard.press('Enter');
  const t0 = Date.now();
  await p.waitForFunction(() => document.getElementById('game-stage').classList.contains('walk-on'), null, { timeout: 600000, polling: 500 }).catch(() => fail('set out, and the walk never came to you (no walk-on in ten minutes)'));
  await p.waitForTimeout(2500);
  s = await state();
  console.log('out:', JSON.stringify(s));
  if (s.title) fail('set out, and the title is still up');
  if (s.phase !== 'dressed' || s.goal || s.lights.story) fail(`set out on the walk, and the story has begun (phase ${s.phase}, goal ${s.goal}, its light ${s.lights.story})`);
  if (s.lights.objective) fail('the old free game\'s objective light stands in the walk');
  if (!s.where || s.at !== s.clock.hm) fail(`the corner does not say where and when you are ("${s.where}" "${s.at}", the clock ${s.clock.hm})`);
  else ok(`out in ${Math.round((Date.now() - t0) / 1000)} s: "${s.where}", ${s.at}, ${s.wx.kind}; no goal, no light`);
  // (nothing unseen over the walk's own buttons: the story's film's skip button, invisible, took the phone's taps there)
  const over = await p.evaluate(() => [...document.querySelectorAll('#g-walk-acts button')].map(b => { const r = b.getBoundingClientRect(), e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return e && b.contains(e) ? null : `${b.dataset.do} under ${e ? e.id || e.className || e.tagName : 'nothing'}${e && e.parentElement ? ` in ${e.parentElement.id || e.parentElement.className}` : ''}`; }).filter(Boolean));
  if (over.length) fail(`something unseen lies over the walk's buttons: ${over.join('; ')}`);
  await shot('4-out');
  // walk: the keys, or the stick by touch
  const xy0 = s.xy;
  // (four seconds of the game's own frames with the key or the stick held: a software renderer draws a frame in seconds,
  // and the game moves a twentieth of a second a frame at most)
  const steps = () => p.evaluate(async () => { const g = window.__game; for (let i = 0; i < 80; i++) { g.frame(0.05); if (i % 10 === 9) await new Promise(r => setTimeout(r, 0)); } });
  if (phone) {
    const j = await p.locator('#gt-joy').boundingBox();
    if (!j) fail('no stick on the phone\'s walk');
    else {
      const cx = j.x + j.width / 2, cy = j.y + j.height / 2, cdp = await ctx.newCDPSession(p);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
      for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx, y: cy - i * 6, id: 1 }] }); await p.waitForTimeout(60); }
      await steps();
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
  } else { await p.keyboard.down('KeyW'); await steps(); await p.keyboard.up('KeyW'); }
  await p.waitForTimeout(800);
  s = await state();
  const moved = Math.hypot(s.xy[0] - xy0[0], s.xy[1] - xy0[1]);
  if (moved < 2) fail(`walked for four seconds and moved ${moved.toFixed(1)} m`);
  else ok(`walked ${moved.toFixed(1)} m`);
  await shot('5-walked');
  // none of the old free game's panels from its keys
  if (!phone) {
    for (const k of ['KeyM', 'KeyP', 'KeyQ']) { await p.keyboard.press(k); await p.waitForTimeout(500); }
    const open = await p.evaluate(() => ['g-bigmap', 'g-pass', 'g-lens', 'g-phone'].filter(id => { const e = document.getElementById(id); return e && !e.hidden; }));
    if (open.length) fail(`the old free game's keys open ${open.join(', ')} on the walk`); else ok('M, P and Q open nothing of the old free game');
    await p.evaluate(() => ['g-bigmap', 'g-pass', 'g-lens'].forEach(id => { const e = document.getElementById(id); if (e) e.hidden = true; }));
  }
  // the menu, from the walk's own button: the story offered, the old game's tour and passport not
  await press('#g-walk-acts [data-do="menu"]'); await p.waitForTimeout(800);
  if (!(await visible('#g-menu'))) fail('the walk\'s menu button does not open the menu');
  else {
    const m = { story: await visible('#gm-story'), intro: await visible('#gm-intro'), reset: await visible('#gm-reset'), time: await visible('#gm-time'), weather: await visible('#gm-weather') };
    if (!m.story) fail('the walk\'s menu does not offer the story');
    if (m.intro || m.reset) fail(`the walk's menu still offers the old game's ${m.intro ? 'tour' : ''} ${m.reset ? 'passport' : ''}`);
    if (!m.time || !m.weather) fail('the walk\'s menu does not offer the hour and the sky');
    if (m.story && !m.intro && !m.reset && m.time && m.weather) ok(`the menu: "${(await p.textContent('#gm-story')).trim()}", the hour and the sky`);
    await shot('6-menu');
    await press('#g-menu-close'); await p.waitForTimeout(600);
    if (await visible('#g-menu')) fail('the menu\'s close button does not shut it (off the screen, or under something)');
  }
  // the camera
  await press('#g-walk-acts [data-do="photo"]'); await p.waitForTimeout(1200);
  if (!(await p.evaluate(() => document.getElementById('game-stage').classList.contains('photo')))) fail('the walk\'s camera button does not open photo mode');
  else { ok('the camera opens photo mode'); await shot('7-photo'); }
  if (phone) await press('#ph-done'); else await p.keyboard.press('Escape');
  await p.waitForTimeout(800);
  // from the story's last card: the page again, straight out on the walk
  if (!phone && !process.env.NO_END) {
    await p.evaluate(() => { sessionStorage.setItem('oe-walk-auto', JSON.stringify({ t: 'night', w: 'clear' })); });
    await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    // (the loader's words are written once the page's boot has the map's list: waited for, not read at once)
    const roll = await p.waitForFunction(() => { const e = document.querySelector('#g-loader .roll-title span'); return e && e.textContent; }, null, { timeout: 120000, polling: 100 }).then(h => h.jsonValue()).catch(() => '');
    if (!/walk/i.test(roll)) fail(`come from the last card, the loader does not say it is a walk ("${roll}")`);
    await p.waitForFunction(() => document.getElementById('game-stage').classList.contains('walk-on'), null, { timeout: 900000, polling: 500 }).catch(() => fail('come from the last card, the walk never set out'));
    s = await state();
    if (s.phase !== 'dressed' || s.lights.story) fail(`come from the last card, the story began again (${s.phase})`);
    else if (s.wx.mode !== 'clear' || s.at !== s.clock.hm) fail(`come from the last card, not the night it was given (${s.clock.hm}, ${s.wx.mode})`);
    else ok(`from the last card: out on the walk at ${s.clock.hm}, ${s.wx.mode}, with no title to press ("${roll}")`);
    await p.waitForTimeout(1500);
    await shot('8-from-end');
  }
  console.log(errors.length ? `FAIL ${errors.length}` : 'ok   the walk: two ways in, its hour and sky, out on the street with nothing of the story or the old game');
  await b.close();
  process.exit(errors.length ? 1 : 0);
})();
