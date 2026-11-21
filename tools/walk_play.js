// The walk (web/game/walk.js; docs/STORY.md "The walk"), played as a person would: the title's first way in, by the
// mouse and keys on a desktop's page or by touch on a phone's. Opens the page as someone who has never played (nothing
// kept in this browser), and fails if:
//   - the title does not open on its press, or a key or a tap there does not open the menu; the menu has no Walk
//     Shibuya over the episode's button, or it opens before who you play is chosen and confirmed on a screen of its own;
//   - its step does not ask the hour and the sky, or what is chosen there is not the street behind the card (the clock
//     at the hour on the story's evening, the rain falling), or Back does not give the title its own evening again;
//   - set out, the walk's opening does not play (the city from the air, its title in the bars), or a key or a tap in it
//     does not bring the walk to you;
//   - set out, the title is still up, the story has begun (its goal, its light, a phase past dressed), the old free
//     game's objective light stands, or where and when you are is not in the corner (the hour as the clock has it);
//   - you cannot walk (the player does not move), or a key of the old free game opens one of its panels (the map,
//     the passport, the lens);
//   - the walk's menu does not offer the story, or still offers the old game's tour and passport;
//   - the camera (photo mode) does not open from the walk's own button;
//   - Mei at Hachiko has no amber speech mark over her from fourteen metres, E (or a tap) beside her does not open her
//     talk in the story's box, the corner does not then say what she asked, Riko across the crossing does not have her
//     part, or back with Mei the story is not put away with its name (walktalk.js);
//   - beside the end of Hachiko's wall nothing offers to sit and watch the crossing, or seated the camera does not stand
//     behind your shoulder framing the scramble, a drag does not turn it (and left alone it does not come back), the
//     time-lapse held (Space; on a phone its button) does not run the clock fast, or E (or a tap) does not stand you up
//     (perch.js; WALK_ONLY=sit stops after this);
//   - on foot the corner has no Your car button, or pressed, the car does not pull in at a kerb near you; the walk's menu
//     does not list the walk's stories;
//   - beside your car, E (or a tap on the prompt) does not put you at the wheel, the car's keys are not at the foot of the
//     frame (on a phone: the hand brake, the horn and the view by the stick), it does not drive, the corner does not say
//     the speed, or once stopped nothing lets you out; the menu's Bring your car does not bring it to a kerb near you;
//   - in SKY GATE's lobby the lift is not offered, is not ridden in the dark (its doors shut, the car's ceiling and lines),
//     or does not end at the top stop;
//   - on SHIBUYA SKY's roof Taro does not ask for the crossing from the helicopter (or a photograph from the roof on foot
//     is taken for it), or over the crossing in the helicopter a photograph of it is not;
//   - on SHIBUYA SKY's roof the helicopter does not stand on its pad, cannot be boarded, does not show its keys (on a
//     phone: Up and Down), does not climb, the corner does not say its height, or landed, nothing lets you out
//     (NO_RIDE=1 leaves the car and the helicopter out);
//   - (on a desktop) the story's last card's Walk Shibuya does not set out on the walk from a fresh page, without the
//     title, at the hour and under the sky it was given.
// Stills of each beat in out_dir.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/walk_play.js out_dir [WxH] [hour] [sky]     (390x844: a phone, by touch; hour blue|night|live, sky clear|rain)
const { chromium } = require('playwright');
const { logger: browserLog, watch: watchPage } = require('./browser_watch'); // (what the browser says of its GPU, in the log: issue 49)
const fs = require('fs');
const { dump: uiDump } = require('./ui_dump'); // (UI_DUMP=dir: the interface at each still, for tools/ui_fit.js)
const [,, out = '/tmp/walk-play', size = '1440x900', hour = 'night', sky = 'rain'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number), phone = w < 500;
  const args = process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args, logger: browserLog() });
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
  const p = await ctx.newPage();
  watchPage(p);
  const errors = [];
  const fail = m => { errors.push(m); console.log(`FAIL ${m}`); };
  const ok = m => console.log(`ok   ${m}`);
  p.on('pageerror', e => fail(`pageerror: ${String(e).slice(0, 200)}`));
  p.on('crash', () => fail('the page crashed (the renderer died)'));
  fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(t => { try { localStorage.setItem('oe3d-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  // someone who has never played: nothing kept (once: the page opened again from the last card keeps what it was given)
  await p.addInitScript(() => { if (!sessionStorage.getItem('wp-once')) { sessionStorage.setItem('wp-once', '1'); try { for (const k of ['oe3d-player', 'oe-walk', 'oe-story-late', 'oe-story-late-closed']) localStorage.removeItem(k); } catch (e) { /* storage blocked */ } } });
  const PORT = process.env.PORT || 8800;
  // (a beat waits for what it tests, up to a minute, not for a fixed time: on a slow runner the desktop page took the press
  // and read Back's state 2.5 s later, a frame before Back had been drawn, and every beat after failed with it; issue 49)
  const until = (fn, arg, ms = 60000) => p.waitForFunction(fn, arg, { timeout: ms, polling: 250 }).then(() => true, () => false);
  const stepUp = () => { const e = document.getElementById('gt-walk'); return !!e && !e.hidden; };
  const seen = s => { const e = document.querySelector(s); if (!e || e.hidden) return false; const r = e.getBoundingClientRect(), c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.display !== 'none' && c.visibility !== 'hidden'; };
  // (pressed again, measured again, when what the press brings has not come in 20 s: a click taken where the button was
  // before the page laid it out again)
  const pressFor = async (sel, fn, arg) => { await press(sel); if (!(await until(fn, arg, 20000))) { await press(sel); await until(fn, arg, 40000); } };
  const shown = (sel, ms = 20000) => until(seen, sel, ms), gone = (sel, ms = 20000) => until(new Function('s', `return !(${seen})(s)`), sel, ms);
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
      ask: (document.querySelector('#gt-who .gt-who-ask') || {}).textContent || '', screen: window.__game.screen ? window.__game.screen() : null, clock: { m: c.m, d: c.d, min: Math.floor(c.min), hm: hm(c.min) }, wx: { mode: wx.mode, kind: wx.kind, rain: +(wx.rain || 0).toFixed(2) },
      phase: g.story ? g.story.state.phase : null, lights: g.lights(), eyebrow: document.getElementById('gt-city').textContent,
      walkOn: document.getElementById('game-stage').classList.contains('walk-on'), where: (document.querySelector('#g-walk-where small') || {}).textContent || '', at: (document.querySelector('#g-walk-where .t') || {}).textContent || '',
      goal: !!document.querySelector('#g-story-goal.on'), xy: [g.player.x, g.player.y] };
  });

  // the title, the first time
  await title();
  let s = await state();
  const story0 = { eyebrow: s.eyebrow, clock: s.clock };
  // the press: the street and the name, nothing to choose; a key (on a phone a tap anywhere) opens the menu
  if (s.screen !== 'press') fail(`the title does not open on its press (on "${s.screen}")`);
  else ok('the title opens on its press: the street and the name');
  await shot('0-press');
  if (phone) await p.touchscreen.tap(w / 2, h / 2); else await p.keyboard.press('Space');
  await p.waitForTimeout(1600);
  s = await state();
  if (s.screen !== 'menu') fail(`a ${phone ? 'tap' : 'key'} on the press did not open the menu (on "${s.screen}")`);
  else ok(`a ${phone ? 'tap' : 'key'} on the press opens the menu`);
  if (!(await visible('#gt-walk-go'))) fail('the title has no Walk Shibuya over the episode');
  else ok(`the title offers two ways in: "${(await p.textContent('#gt-walk-go', { timeout: 180000 })).trim()}" and "${(await p.textContent('#gt-play', { timeout: 180000 })).trim()}"`); // (a software renderer can hold the page's thread for half a minute behind the title, compiling)
  // (the ways in are one list: the walk first and the one Enter takes, while the episodes are being finished; every row
  // the same width and height, none bigger than another, on a desktop and a phone alike)
  { const rows = await p.$$eval('#g-title .gt-go > .btn', bs => bs.filter(b => b.offsetParent).map(b => { const r = b.getBoundingClientRect(); return { id: b.id, w: Math.round(r.width), h: Math.round(r.height), lead: b.classList.contains('primary') }; }));
    if (!rows.length || rows[0].id !== 'gt-walk-go' || !rows[0].lead || rows.filter(r => r.lead).length !== 1) fail(`the title's list does not lead with the walk: ${JSON.stringify(rows)}`);
    else if (rows.some(r => Math.abs(r.w - rows[0].w) > 1 || Math.abs(r.h - rows[0].h) > 1)) fail(`the title's ways in are not all one size: ${JSON.stringify(rows)}`);
    else ok(`the title's ways in, one list led by the walk, each ${rows[0].w}x${rows[0].h}: ${rows.map(r => r.id).join(', ')}`); }
  await shot('1-title');
  await press('#gt-walk-go'); await until(() => window.__game.screen() === 'who');
  s = await state();
  if (s.step) fail('the walk opened before who you play was chosen');
  else if (s.screen !== 'who') fail(`Walk Shibuya, pressed before who you play is chosen, did not bring who you play up (on "${s.screen}")`);
  else ok('the walk waits for who you play, on a screen of its own, as the story does');
  await shot('1-who');
  await press('#gt-who .gt-who-row [data-c="M"]'); await p.waitForTimeout(800);
  await press('#gt-who-go'); await until(stepUp);
  s = await state();
  if (!s.step) fail('who you play chosen and confirmed, the walk does not go on to its step');
  else if (await visible('#gt-story-go')) fail('the walk\'s step is up, and the menu\'s other ways in still show');
  const hours = await p.$$eval('#gt-walk [data-k="t"] button', bs => bs.map(x => [x.dataset.v, x.querySelector('small').textContent]));
  const skies = await p.$$eval('#gt-walk [data-k="w"] button', bs => bs.map(x => x.dataset.v));
  if (hours.length < 3 || hours.some(x => !/^\d\d:\d\d$/.test(x[1])) || !skies.includes('rain')) fail(`the step's hours and skies: ${JSON.stringify(hours)} ${JSON.stringify(skies)}`);
  else ok(`the step asks the hour (${hours.map(x => x.join(' ')).join(', ')}) and the sky (${skies.join(', ')})`);
  await shot('2-step');
  // the hour and the sky chosen are the street behind the card
  await press(`#gt-walk [data-k="t"] [data-v="${hour}"]`); await press(`#gt-walk [data-k="w"] [data-v="${sky}"]`);
  const want = hours.find(x => x[0] === hour);
  await until(([hm, rain]) => { const g = window.__game, w = g.weather ? g.weather.state : {}; return (!hm || document.getElementById('gt-city').textContent.includes(hm)) && (!rain || (w.mode === 'rain' && w.rain > 0.3)); }, [hour !== 'live' && want ? want[1] : '', sky === 'rain']);
  await p.waitForTimeout(3000);
  s = await state();
  if (want && s.clock.hm !== want[1] && hour !== 'live') fail(`chose ${hour} (${want[1]}), and the street behind the title is at ${s.clock.hm}`);
  else if (hour !== 'live' && (s.clock.m !== story0.clock.m || s.clock.d !== story0.clock.d)) fail(`chose ${hour}, and the walk is not on the story's evening (${s.clock.d}/${s.clock.m})`);
  else if (sky === 'rain' && !(s.wx.mode === 'rain' && s.wx.rain > 0.3)) fail(`chose the rain, and it is not raining behind the title (${JSON.stringify(s.wx)})`);
  else ok(`${hour} and ${sky} chosen: the street behind the title is at ${s.clock.hm}, ${s.wx.kind}; over the card "${s.eyebrow}"`);
  if (!s.eyebrow.includes(s.clock.hm)) fail(`the card's line over the title does not say the hour chosen ("${s.eyebrow}")`);
  await shot('3-chosen');
  // back, and the title's own evening again; then the step again, as it was left
  await pressFor('#gt-walk-back', () => { const w = document.getElementById('gt-walk'), b = document.getElementById('gt-story-go'); return (!w || w.hidden) && b && !b.hidden && b.getBoundingClientRect().width > 0; }); await p.waitForTimeout(2500);
  s = await state();
  if (s.step || !(await visible('#gt-story-go'))) fail('Back did not give the menu its ways in again');
  else if (s.eyebrow !== story0.eyebrow || s.clock.hm !== story0.clock.hm) fail(`Back: the title is not the story's evening again ("${s.eyebrow}", ${s.clock.hm}; was ${story0.clock.hm})`);
  else if (sky === 'rain' && s.wx.mode === 'rain') fail('Back: the rain the walk was offered in still falls on the story\'s title');
  else ok(`Back: the story's evening again (${s.clock.hm}, ${s.wx.mode})`);
  await pressFor('#gt-walk-go', stepUp); await p.waitForTimeout(1500);
  s = await state();
  const kept = await p.$$eval('#gt-walk [aria-checked="true"]', bs => bs.map(x => x.dataset.v));
  if (!s.step || !kept.includes(hour) || !kept.includes(sky)) fail(`the step opened again does not keep what was chosen (${kept})`);
  // set out
  if (phone) await press('#gt-walk-set'); else await p.keyboard.press('Enter');
  // the walk's opening: the city from the air, its title in the bars, and a key or a tap eases down to you at once
  // (the film itself, shot by shot: tools/walk_open.js)
  const film = await until(() => { const g = window.__game, o = g.overture && g.overture(); return !!(o && o.active && o.walk); }, null, 120000);
  if (!film) fail('set out, and the walk\'s opening did not play');
  else {
    await until(() => window.__game.overture().t > 3, null, 120000);
    const f = await p.evaluate(() => ({ bars: document.getElementById('game-stage').classList.contains('letterbox'), title: !!document.querySelector('.ov-title.card'), name: (document.querySelector('.ov-title.card b') || {}).textContent || '', t: +window.__game.overture().t.toFixed(1), total: +window.__game.overture().total.toFixed(1), up: Math.round(window.__game.camera.position.y) }));
    if (!f.bars || !f.title || f.up < 150) fail(`the walk's opening: ${JSON.stringify(f)}`);
    else ok(`the walk's opening plays: "${f.name}" in the bars, ${f.up} m up at ${f.t} of ${f.total} s`);
    await shot('3-film');
    if (phone) await p.touchscreen.tap(w / 2, h / 2); else await p.keyboard.press('Space');
    const ts = Date.now();
    if (!(await until(() => document.getElementById('game-stage').classList.contains('walk-on'), null, 120000))) fail(`a ${phone ? 'tap' : 'key'} in the walk's opening did not bring the walk to you`);
    else ok(`a ${phone ? 'tap' : 'key'} in the walk's opening: on the street ${((Date.now() - ts) / 1000).toFixed(1)} s later`);
  }
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
  await press('#g-walk-acts [data-do="menu"]'); await shown('#g-menu');
  if (!(await visible('#g-menu'))) fail('the walk\'s menu button does not open the menu');
  else {
    const m = { story: await visible('#gm-story'), intro: await visible('#gm-intro'), reset: await visible('#gm-reset'), time: await visible('#gm-time'), weather: await visible('#gm-weather') };
    if (!m.story) fail('the walk\'s menu does not offer the story');
    if (m.intro || m.reset) fail(`the walk's menu still offers the old game's ${m.intro ? 'tour' : ''} ${m.reset ? 'passport' : ''}`);
    if (!m.time || !m.weather) fail('the walk\'s menu does not offer the hour and the sky');
    if (m.story && !m.intro && !m.reset && m.time && m.weather) ok(`the menu: "${(await p.textContent('#gm-story')).trim()}", the hour and the sky`);
    // (and the walk's stories, as a game's list of side stories: each by its name, with where to look for the ones not met)
    const tales = await p.evaluate(() => { const e = document.getElementById('gm-tales'); return e && !e.hidden ? [...e.querySelectorAll('li')].map(l => `${l.dataset.s}:${l.querySelector('b').textContent}`) : []; });
    if (tales.length < 4) fail(`the walk's menu does not list its stories (${JSON.stringify(tales)})`);
    else ok(`the menu lists the walk's stories: ${tales.join(', ')}`);
    await shot('6-menu');
    await press('#g-menu-close'); await gone('#g-menu');
    if (await visible('#g-menu')) fail('the menu\'s close button does not shut it (off the screen, or under something)');
  }
  // the camera
  await press('#g-walk-acts [data-do="photo"]'); await until(() => document.getElementById('game-stage').classList.contains('photo'), undefined, 20000);
  if (!(await p.evaluate(() => document.getElementById('game-stage').classList.contains('photo')))) fail('the walk\'s camera button does not open photo mode');
  else { ok('the camera opens photo mode'); await shot('7-photo'); }
  if (phone) await press('#ph-done'); else await p.keyboard.press('Escape');
  await p.waitForTimeout(800);
  // somewhere to sit and watch the crossing (perch.js; docs/STORY.md "The walk", *Somewhere to sit*): beside the end of
  // Hachiko's wall, E (or a tap on the prompt) sits you on it; seated, the camera stands behind your shoulder and frames
  // the scramble, a drag turns the view, Space held (on a phone the Time-lapse button) runs the evening's clock fast, the
  // stills catch the crowd waiting and then crossing, and E (or a tap) stands you up again on the square
  {
    const prompt = () => p.evaluate(() => { const m = document.getElementById('g-prompt'), t = document.getElementById('gp-text'); return m && !m.hidden && t ? t.textContent : ''; });
    const waitPrompt = re => p.waitForFunction(r => { const m = document.getElementById('g-prompt'), t = document.getElementById('gp-text'); return m && !m.hidden && t && new RegExp(r).test(t.textContent); }, re.source, { timeout: 120000, polling: 250 }).then(() => true, () => false);
    const act = async () => { if (phone) await press('#gp-main'); else await p.keyboard.press('KeyE'); await p.waitForTimeout(400); };
    const frames = n => p.evaluate(async n => { const g = window.__game; for (let i = 0; i < n; i++) { g.frame(0.05); if (i % 10 === 9) await new Promise(r => setTimeout(r, 0)); } }, n);
    const seat = await p.evaluate(() => { const g = window.__game, P = g.perch; if (!P || !P.list.length) return null; const s = P.list[0]; g.player.x = s.at[0] + s.face[0] * 1.4; g.player.y = s.at[1] + s.face[1] * 1.4; { const f = g.nav.floorAt(g.player.x, g.player.y, g.nav.terrain(g.player.x, g.player.y) + 1); if (f) g.player.z = f.z; } g.player.h = Math.atan2(-s.face[0], -s.face[1]); g.player.speed = 0; g.cam.yaw = g.player.h; g.advance(0.3); return { name: s.name }; });
    if (!seat) fail('no place to sit on the walk (game.json hero[].perches, perch.js)');
    else {
      await frames(6);
      if (!(await waitPrompt(/Sit and watch the crossing/))) fail(`beside ${seat.name}, nothing offers to sit ("${await prompt()}"; ${JSON.stringify(await p.evaluate(() => { const g = window.__game, s = g.perch.list[0]; return { mode: g.player.mode, at: [g.player.x, g.player.y, g.player.z], seatZ: s.z, near: !!g.perch.near(g.player.x, g.player.y, g.player.z), act: g.currentAction ? String((g.currentAction() || {}).text) : '?' }; }))})`);
      else {
        await act(); await frames(40);
        const s = await p.evaluate(() => {
          const g = window.__game, P = g.perch, st = P.seat, c = g.camera, d = new THREE.Vector3(); c.getWorldDirection(d);
          if (!st) return { mode: g.player.mode };
          const toLook = Math.atan2(st.look[0] - c.position.x, st.look[1] + c.position.z), aim = Math.atan2(d.x, -d.z), off = Math.abs(((aim - toLook) * 180 / Math.PI + 540) % 360 - 180);
          return { mode: g.player.mode, back: Math.hypot(c.position.x - st.at[0], -c.position.z - st.at[1]), up: c.position.y - st.z, off, seen: g.player.rig.root.visible, feet: g.player.z - st.z, fov: c.fov, hand: g.player.rig.fist ? +(g.player.rig.fist(new THREE.Vector3()).y - st.z).toFixed(2) : null, inFrame: (() => { const v = g.player.rig.root.getWorldPosition(new THREE.Vector3()); v.y += 0.8; v.project(c); return Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95 && v.z < 1; })() };
        });
        if (s.mode !== 'seat' || s.off == null) fail(`E beside ${seat.name}: not seated (${JSON.stringify(s)})`);
        else if (s.back > 4 || s.up < 0.8 || s.up > 2.2 || s.off > (phone ? 40 : 25) || !s.seen || !s.inFrame) fail(`seated, the camera does not frame the crossing over your shoulder (${JSON.stringify(s)})`);
        else ok(`seated on ${seat.name}: the camera ${s.back.toFixed(1)} m behind, ${s.up.toFixed(1)} m up, ${s.off.toFixed(0)}° off the crossing, fov ${s.fov.toFixed(0)}, you in the frame`);
        // (the hands in the lap, over the stone's top 0.4 m above the feet: hung straight down from a standing clip they went into it)
        if (s.hand != null && s.hand < 0.44) fail(`seated, your hand is ${s.hand} m over your feet: in the stone, not in your lap`);
        else if (s.hand != null) ok(`seated, the hands in the lap (${s.hand} m over the feet)`);
        if (!(await waitPrompt(/Stand up/))) fail(`seated, nothing offers to stand up ("${await prompt()}")`);
        await shot('4f-sit');
        // a drag turns the head (on a phone a finger, by touch)
        const box = await p.locator('#game-stage canvas').first().boundingBox(), cx = box.x + box.width / 2, cy = box.y + box.height / 2;
        if (phone) {
          const cdp = await ctx.newCDPSession(p);
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy }] });
          for (let k = 1; k <= 6; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + k * 25, y: cy }] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else { await p.mouse.move(cx, cy); await p.mouse.down(); for (let k = 1; k <= 6; k++) await p.mouse.move(cx + k * 25, cy); await p.mouse.up(); }
        const yaw = await p.evaluate(() => window.__game.perch.look.yaw);
        if (Math.abs(yaw) < 0.2) fail(`seated, a drag does not turn the view (yaw ${yaw.toFixed(2)})`);
        else ok(`a drag turns the head ${(yaw * 180 / Math.PI).toFixed(0)}°`);
        await frames(4); await shot('4g-sit-look');
        await frames(200); // (left alone, the view comes back round to the crossing)
        const back = await p.evaluate(() => window.__game.perch.look.yaw);
        if (Math.abs(back) > 0.1) fail(`left alone ten seconds, the view does not come back to the crossing (yaw ${back.toFixed(2)})`);
        // the evening let pass: Space held, or on a phone the Time-lapse button
        const m0 = await p.evaluate(() => window.__game.clock.min);
        if (phone) {
          const tl = await p.evaluate(() => { const b = document.getElementById('gt-jump'); return b && !b.hidden && b.getBoundingClientRect().width > 0 ? b.textContent : ''; });
          if (!/Time-lapse/.test(tl)) fail(`seated on a phone, no Time-lapse button ("${tl}")`);
          const r = await p.locator('#gt-jump').boundingBox(), cdp = await ctx.newCDPSession(p);
          if (r && r.width) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x + r.width / 2, y: r.y + r.height / 2 }] });
          await frames(40);
          if (r && r.width) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        } else { await p.keyboard.down('Space'); await frames(40); await p.keyboard.up('Space'); }
        const m1 = await p.evaluate(() => window.__game.clock.min), dm = ((m1 - m0) + 1440) % 1440;
        if (dm < 3) fail(`held, the time-lapse does not run the clock fast (${dm.toFixed(1)} minutes in two seconds)`);
        else ok(`held two seconds, the evening runs on ${dm.toFixed(1)} minutes`);
        // the crowd waiting, then everyone going: the scramble's all-walk phase caught in a still
        const go = await p.evaluate(async () => {
          const g = window.__game, j = g.junctions.scrambles.find(q => Math.hypot(q.x - g.player.x, q.y - g.player.y) < 120);
          if (!j) return null;
          for (let i = 0; i < 160 && j.ph === 3; i++) g.advance(0.5); // (to the wait first)
          for (let i = 0; i < 240 && j.ph !== 3; i++) g.advance(0.5);
          for (let i = 0; i < 80; i++) { g.frame(0.05); if (i % 10 === 9) await new Promise(r => setTimeout(r, 0)); }
          return j.ph === 3;
        });
        if (go === null) console.log('(no scramble near the seat)');
        else if (!go) fail('seated, the scramble never turned to all-walk in two minutes');
        else { ok('the scramble crossing, from the seat'); await shot('4h-sit-go'); }
        await act(); await frames(30);
        const up = await p.evaluate(() => { const g = window.__game, P = g.perch; return { mode: g.player.mode, seat: !!P.seat, z: g.player.z, ground: g.nav.floorAt(g.player.x, g.player.y, g.player.z + 1), jump: document.getElementById('gt-jump').textContent }; });
        if (up.mode !== 'foot' || up.seat) fail(`E seated does not stand you up (${JSON.stringify(up)})`);
        else ok(`stood up, on foot again${phone ? ` (the button reads "${up.jump}")` : ''}`);
        if (phone && /Time-lapse/.test(up.jump)) fail('stood up, the phone\'s button still reads Time-lapse');
        await shot('4i-stood');
      }
    }
    if (process.env.WALK_ONLY === 'sit') { await b.close(); console.log(errors.length ? `${errors.length} failure(s)` : 'walk sit: all passed'); process.exit(errors.length ? 1 : 0); }
  }
  // your car at the kerb and the helicopter on SHIBUYA SKY's roof (docs/STORY.md "The walk": a free ride's own car, a
  // flight's own aircraft): in by E or a tap on the prompt, their keys at the foot of the frame the first time, the speed
  // (and in the air the height) in the corner, the phone's buttons for each, out again once stopped or landed
  if (!process.env.NO_RIDE) {
    const prompt = () => p.evaluate(() => { const m = document.getElementById('g-prompt'), t = document.getElementById('gp-text'); return m && !m.hidden && t ? t.textContent : ''; });
    const waitPrompt = re => p.waitForFunction(r => { const m = document.getElementById('g-prompt'), t = document.getElementById('gp-text'); return m && !m.hidden && t && new RegExp(r).test(t.textContent); }, re.source, { timeout: 120000, polling: 250 }).then(() => true, () => false);
    // (on a phone, the prompt is tapped where it is: nothing may lie over it, as the car's buttons once did over Get out)
    const act = async () => {
      if (phone) {
        const over = await p.evaluate(() => { const b = document.getElementById('gp-main'), r = b.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2; if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return `nothing: it is off the screen at (${Math.round(x)}, ${Math.round(y)})`; const e = document.elementFromPoint(x, y); return e && !b.contains(e) ? (e.id || e.className || e.tagName) : ''; });
        if (over) fail(`on a phone, ${over} lies over the prompt ("${await prompt()}")`);
        await press('#gp-main');
      } else await p.keyboard.press('KeyE');
      await p.waitForTimeout(400);
    };
    const corner = () => p.evaluate(() => { const e = document.querySelector('#g-walk-where .g'); return e && !e.hidden ? e.textContent : ''; });
    const keyLine = () => p.evaluate(() => { const e = document.getElementById('g-walk-keys'); return e && e.classList.contains('on') ? e.textContent : ''; });
    // (the line changes on the page's next frame drawn, which on a software renderer can be seconds after the step: waited for, up to a minute)
    const keysFor = re => p.waitForFunction(r => { const e = document.getElementById('g-walk-keys'); return e && e.classList.contains('on') && new RegExp(r, 'i').test(e.textContent); }, re.source, { timeout: 60000, polling: 250 }).then(() => true, () => false);
    const shown = sel => p.evaluate(s => [...document.querySelectorAll(s)].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && getComputedStyle(e).display !== 'none'; }).map(e => e.textContent.trim()), sel);
    const mode = () => p.evaluate(() => window.__game.player.mode);
    // (a key or a phone's button held for some seconds of the game's own time, a twentieth of a second a frame with the
    // camera following each, as a player's frames do: a software renderer's own frames are too slow to hold it for, and
    // advance() moves the world without the camera, which was left tens of metres behind the car for the still)
    const hold = (key, s) => p.evaluate(async ([k, t]) => { const g = window.__game; g.keys.add(k); try { for (let i = 0; i < Math.round(t / 0.05); i++) { g.frame(0.05); if (i % 10 === 9) await new Promise(r => setTimeout(r, 0)); } } finally { g.keys.delete(k); } }, [key, s]);
    // someone with something to say (walktalk.js; docs/STORY.md "People with something to say"): Mei at Hachiko, with a
    // part of a story, has an amber speech mark over her head from across the plaza and her name under it close to; E (or a
    // tap) beside her opens her talk in the story's box; what she asks is under the hour with the metres to it; Riko, across
    // the crossing, has her part; back with Mei (Riko there already, never seen going), the story is put away with its name
    {
      const talk = (id, near = 2) => p.evaluate(([id, near]) => { const g = window.__game, n = g.npcs.find(q => q.id === id); if (!n) return false; const a = Math.atan2(g.player.x - n.x, g.player.y - n.y) || 0; g.player.x = n.x + Math.sin(a) * near; g.player.y = n.y + Math.cos(a) * near; g.player.z = n.z; g.player.h = a + Math.PI; g.player.speed = 0; g.advance(0.3); return true; }, [id, near]);
      const through = () => p.evaluate(() => { const g = window.__game; for (let i = 0; i < 60 && g.dlg.open; i++) g.dlg.next(false); return g.dlg.open; });
      const errandNow = () => p.evaluate(() => { const e = document.querySelector('#g-walk-where .q'); return e && !e.hidden ? e.textContent : ''; });
      // (the corner and the marks are the page's own frames' to draw: waited for, a software renderer's frame being seconds long)
      const errandIs = re => p.waitForFunction(r => { const e = document.querySelector('#g-walk-where .q'); return e && !e.hidden && new RegExp(r).test(e.textContent); }, re.source, { timeout: 90000, polling: 500 }).then(() => true, () => false);
      await p.evaluate(() => { const t = window.__game.walkTalk(); if (t) t.reset(); });
      // (Mei and Riko drawn first: a character's pictures go to the GPU a frame at a time, minutes on a software renderer)
      const drawn = await p.waitForFunction(() => window.__game.npcs.filter(n => n.id === 'mei' || n.id === 'riko').every(n => !n.rig.pending), null, { timeout: 600000, polling: 1000 }).then(() => true, () => false);
      if (!drawn) fail('Mei and Riko are not drawn ten minutes after setting out');
      if (!(await talk('mei', 14))) fail('no Mei on the walk (game.json npcs: mei)');
      else {
        await p.evaluate(() => { const g = window.__game, n = g.npcs.find(q => q.id === 'mei'); g.cam.yaw = Math.atan2(n.x - g.player.x, n.y - g.player.y); for (let i = 0; i < 8; i++) g.frame(0.05); });
        await p.waitForFunction(() => [...document.querySelectorAll('.g-walk-mark')].some(e => +e.style.opacity > 0.3), null, { timeout: 90000, polling: 500 }).catch(() => {});
        const mk = await p.evaluate(() => [...document.querySelectorAll('.g-walk-mark')].filter(e => +e.style.opacity > 0.3).map(e => e.dataset.k));
        if (!mk.includes('story')) fail(`fourteen metres from Mei, no amber speech mark over anyone (${JSON.stringify(mk)})`);
        else ok(`speech marks from fourteen metres: ${mk.join(', ')}`);
        await shot('4b-marks');
        await talk('mei', 1.6);
        if (!(await waitPrompt(/Talk to Mei/))) fail(`beside Mei, nothing offers to talk ("${await prompt()}")`);
        else {
          await act();
          await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 40; i++) g.frame(0.05); });
          const box = await p.evaluate(() => { const b = document.getElementById('gd'); return b && !b.hidden ? document.getElementById('gd-name').textContent : ''; });
          if (!/Mei/.test(box)) fail(`E beside Mei: no talk in the box ("${box}")`);
          else ok(`E beside Mei: "${box}" in the story's box`);
          await shot('4c-talk');
          if (await through()) fail('Mei\'s talk does not end');
          await errandIs(/Riko/);
          const e1 = await errandNow();
          if (!/Riko/.test(e1)) fail(`after Mei's talk, the corner does not say what she asked ("${e1}")`);
          else ok(`the corner: "${e1}"`);
          await shot('4d-asked');
          await talk('riko', 1.6);
          if (!(await waitPrompt(/Talk to Riko/))) fail(`beside Riko, nothing offers to talk ("${await prompt()}")`);
          else {
            await act(); await through();
            await errandIs(/Mei/);
            const e2 = await errandNow();
            if (!/Mei/.test(e2)) fail(`after Riko's talk, the corner does not send you back to Mei ("${e2}")`);
            // back across: Riko goes ahead unseen (the camera turned from her as you walk away)
            await talk('mei', 6);
            await p.evaluate(() => { const g = window.__game, n = g.npcs.find(q => q.id === 'mei'); g.cam.yaw = Math.atan2(n.x - g.player.x, n.y - g.player.y); for (let i = 0; i < 6; i++) g.frame(0.05); });
            const met = await p.evaluate(() => { const g = window.__game, a = g.npcs.find(q => q.id === 'mei'), b = g.npcs.find(q => q.id === 'riko'); return Math.hypot(a.x - b.x, a.y - b.y); });
            if (met > 4) console.log(`(Riko is ${met.toFixed(0)} m from Mei: she goes only when nobody sees her)`);
            else ok(`Riko waits by Mei (${met.toFixed(1)} m), never seen going`);
            await talk('mei', 1.6);
            if (!(await waitPrompt(/Talk to Mei/))) fail(`back beside Mei, nothing offers to talk ("${await prompt()}")`);
            else {
              await act(); await through();
              await p.waitForFunction(() => { const e = document.getElementById('g-walk-told'); return e && e.classList.contains('on'); }, null, { timeout: 30000, polling: 250 }).catch(() => {});
              const told = await p.evaluate(() => { const e = document.getElementById('g-walk-told'); return e && e.classList.contains('on') ? e.textContent : ''; });
              const n = await p.evaluate(() => window.__game.walkTalk().count());
              if (n.done !== 1) fail(`Mei's story told to its end, but ${n.done} of ${n.of} are put away`);
              else if (!/Which Hachiko/.test(told)) fail(`Mei's story told, but its name is not put up ("${told}")`);
              else ok(`told: "${told}"`);
              await p.addStyleTag({ content: '#g-walk-told { transition: none !important; }' }); // (its fade is the compositor's, and a software renderer's page has no frame to give it)
              await shot('4e-told');
            }
          }
        }
      }
      await p.evaluate(() => { const t = window.__game.walkTalk(); if (t) t.reset(); });
    }
    const haveCar = await p.waitForFunction(() => !!window.__game.myCar(), null, { timeout: 300000, polling: 1000 }).then(() => true, () => false);
    if (!haveCar) fail('no car of your own on the walk (five minutes after setting out)');
    else {
      // beside its driver's door, at the kerb it waits at
      await p.evaluate(() => { const g = window.__game, st = g.myCar().D.st, fx = Math.sin(st.h), fy = Math.cos(st.h); g.player.x = st.x - fy * 2.1; g.player.y = st.y + fx * 2.1; g.player.z = st.z; g.player.speed = 0; });
      if (!(await waitPrompt(/Drive your car/))) fail(`beside your car on the walk, nothing offers to drive it ("${await prompt()}")`);
      else {
        await act();
        if ((await mode()) !== 'car') fail(`E (or a tap) by your car: not at the wheel (${await mode()})`);
        else {
          await keysFor(phone ? /drives/i : /steer/i);
          const kl = await keyLine(), btn = phone ? await shown('.gt-btns button') : [];
          if (!(phone ? /drives/i.test(kl) : /steer/i.test(kl))) fail(`at the wheel, the foot of the frame does not show the car's keys ("${kl}")`);
          if (phone && !(btn.includes('Hand brake') && btn.includes('Horn') && btn.includes('View'))) fail(`at the wheel on a phone, the buttons are ${JSON.stringify(btn)} (want the hand brake, the horn and the view)`);
          const st0 = await p.evaluate(() => { const s = window.__game.myCar().D.st; return [s.x, s.y]; });
          await hold('KeyW', 2.5); await p.waitForTimeout(1200);
          const c = await p.evaluate(() => { const s = window.__game.myCar().D.st; return { xy: [s.x, s.y], v: s.speed }; }), drove = Math.hypot(c.xy[0] - st0[0], c.xy[1] - st0[1]), kmh = await corner();
          if (drove < 3) fail(`at the wheel with W held for two and a half seconds, the car moved ${drove.toFixed(1)} m`);
          else if (!/km\/h/.test(kmh)) fail(`driving, the corner does not say the speed ("${kmh}")`);
          else ok(`drove ${drove.toFixed(1)} m; the corner says "${kmh}"; the keys: "${kl.slice(0, 60)}"`);
          await shot('7a-car');
          await hold('Space', 4); await hold('KeyS', 0.2); await p.waitForTimeout(800);
          if (!(await waitPrompt(/Get out/))) fail(`stopped at the wheel, nothing offers to get out ("${await prompt()}"): stuck in the car`);
          else { await act(); await p.evaluate(() => window.__game.advance(0.5)); if ((await mode()) !== 'foot') fail(`Get out: still ${await mode()}`); else ok('stopped and got out'); }
        }
      }
      // the corner's Your car (C on a desktop): it pulls in at the kerb nearest you, up the kerb's lane, and stops there
      // (from Hachiko's side of the crossing, where the car is called from most; then back where the menu's step expects you)
      const here0 = await p.evaluate(() => { const g = window.__game, at = [g.player.x, g.player.y]; g.spawn([395, -1052]); return at; });
      await p.waitForTimeout(800);
      if (!(await visible('#g-walk-acts [data-do="car"]'))) fail('on foot, the walk\'s corner has no Your car button');
      else {
        await press('#g-walk-acts [data-do="car"]');
        const c0 = await p.evaluate(() => { const g = window.__game, s = g.myCar().D.st; return [s.x, s.y]; });
        await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 120; i++) g.frame(0.05); });
        if (await p.evaluate(() => window.__game.carComing())) fail('Your car: still pulling in after six seconds');
        const c1 = await p.evaluate(() => { const g = window.__game, s = g.myCar().D.st; return { xy: [s.x, s.y], d: Math.hypot(s.x - g.player.x, s.y - g.player.y) }; });
        if (c1.d > 45) fail(`Your car: it stopped ${c1.d.toFixed(0)} m away`);
        else ok(`Your car: ${Math.hypot(c1.xy[0] - c0[0], c1.xy[1] - c0[1]) > 3 ? `pulled in ${Math.hypot(c1.xy[0] - c0[0], c1.xy[1] - c0[1]).toFixed(0)} m up the kerb` : 'at the kerb (no room to come from)'}, ${c1.d.toFixed(0)} m from you`);
        await p.evaluate(() => { const g = window.__game, s = g.myCar().D.st; g.cam.yaw = Math.atan2(s.x - g.player.x, s.y - g.player.y); for (let i = 0; i < 6; i++) g.frame(0.05); }); // (the still looks at it)
        await p.waitForTimeout(1500);
        await shot('7b-car-called');
      }
      await p.evaluate(at => window.__game.spawn(at), here0);
      // the menu's Bring your car: to the kerb nearest you
      await p.evaluate(() => { const g = window.__game; g.player.x += 40; g.spawn([g.player.x, g.player.y]); });
      await p.waitForTimeout(800);
      await press('#g-walk-acts [data-do="menu"]'); await shown('#gm-car');
      if (!(await visible('#gm-car'))) fail('the walk\'s menu does not offer to bring your car');
      else {
        await press('#gm-car'); await gone('#g-menu'); await p.waitForTimeout(800);
        await p.evaluate(() => window.__game.advance(6)); // (it pulls in over a few seconds of the game's own time)
        const far = await p.evaluate(() => { const g = window.__game, s = g.myCar().D.st; return Math.hypot(s.x - g.player.x, s.y - g.player.y); });
        if (await visible('#g-menu')) fail('Bring your car: the menu stayed up');
        else if (far > 60) fail(`Bring your car: it is ${far.toFixed(0)} m away`);
        else ok(`Bring your car: at the kerb ${far.toFixed(0)} m away`);
      }
    }
    // SKY GATE: in its hall (a hero level: the glass, the lines of light, its two lifts), E or a tap takes the lift, ridden in
    // the dark as the real one is (the doors shut, the car's ceiling and its lines; game.js podRide), out at the top stop
    const lobby = await p.evaluate(() => { const g = window.__game, l = (g.G.lifts || []).find(q => q.pod), s = l && l.stops[0]; if (!s) return null; const [ax, ay, az] = s.at, [dx, dy] = s.door || s.at, n = Math.hypot(ax - dx, ay - dy) || 1; g.player.x = ax - (ax - dx) / n * 1.2; g.player.y = ay - (ay - dy) / n * 1.2; g.player.z = az; g.player.h = Math.atan2(ax - dx, ay - dy); g.player.speed = 0; return { top: l.stops[l.stops.length - 1].at[2] }; });
    if (!lobby) fail('no lift ridden in the dark (game.json lifts[].pod) on the map');
    else if (!(await waitPrompt(/lift/i))) fail(`in SKY GATE's lobby on the walk, nothing offers the lift ("${await prompt()}")`);
    else {
      // (the hall is a hero level of its own, cities/shibuya/hero_skylobby.py: loaded and shown round you, its floor stood on)
      const hall = await p.evaluate(async () => { const g = window.__game, H = g.hero && g.hero(); for (let i = 0; i < 480; i++) { const L = H && H.levels.find(q => q.h.id === 'skylobby'); if (L && L.state === 'ready' && L.h.shown) break; await new Promise(r => setTimeout(r, 250)); } /* (two minutes: a level fetched as you are put by it compiles its shaders on a software renderer for most of one) */ const L = H && H.levels.find(q => q.h.id === 'skylobby'); return L ? { state: L.state, shown: !!L.h.shown, feet: +(g.player.z - (g.nav.terrain(g.player.x, g.player.y) + g.nav.lift(g.player.x, g.player.y))).toFixed(3), floor: L.h.z } : null; });
      if (!hall) fail('SKY GATE\'s hall: no hero level "skylobby" on the map');
      else if (hall.state !== 'ready' || !hall.shown) fail(`SKY GATE's hall is not drawn round you in its lobby (${JSON.stringify(hall)})`);
      else ok(`SKY GATE's hall drawn round you in its lobby (${JSON.stringify(hall)})`);
      await shot('7a-hall');
      await act();
      await p.evaluate(() => window.__game.advance(1.6));
      const mid = await p.evaluate(() => { const e = document.getElementById('g-pod'); return e ? e.className : ''; });
      await shot('7b-pod');
      await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 40 && g.cine.active; i++) g.advance(0.25); });
      const top = await p.evaluate(() => window.__game.player.z);
      if (!/ride/.test(mid)) fail(`SKY GATE: mid-ride the car is not dark round you (the pod's "${mid}")`);
      else if (top < lobby.top - 3) fail(`SKY GATE: the ride ended at ${top.toFixed(0)} m, not the top stop (${lobby.top.toFixed(0)} m)`);
      else ok(`SKY GATE: ridden in the dark, out at ${top.toFixed(0)} m`);
    }
    // Taro's story (walktalk.js "Above the crossing"): on the roof he asks for the crossing photographed from the
    // helicopter, and a photograph from the roof on foot is not it
    const taroAsked = await p.evaluate(() => {
      const g = window.__game, t = g.walkTalk(), n = g.npcs.find(q => q.id === 'taro');
      if (!t || !n) return 'no Taro on the walk';
      t.reset();
      if (!t.talk(n)) return 'Taro has nothing to say';
      for (let i = 0; i < 60 && g.dlg.open; i++) g.dlg.next(false);
      const e = t.errand(), roofShot = t.photo({ z: 250, sees: () => true });
      return `${e ? e.text : 'nothing asked'}${roofShot ? ' (and a photograph from the roof on foot was taken for it)' : ''}`;
    });
    if (!/helicopter/i.test(taroAsked) || /on foot was taken/.test(taroAsked)) fail(`on the roof, Taro: "${taroAsked}"`);
    else ok(`on the roof, Taro asks: "${taroAsked}"`);
    // the helicopter: up on the roof beside it (as the SKY GATE lift and the escalator bring you), fetched and drawn there
    const pad = await p.evaluate(() => { const g = window.__game, s = g.heli.st, d = g.heli.doorAt(); g.player.x = d.x + (d.x - s.x) * 0.8; g.player.y = d.y + (d.y - s.y) * 0.8; g.player.z = s.z; g.player.speed = 0; g.player.vz = 0; return { z: s.z }; });
    const seen = await p.waitForFunction(() => window.__game.heli.loaded() && window.__game.heli.group.visible, null, { timeout: 240000, polling: 500 }).then(() => true, () => false);
    if (!seen) fail(`up on the roof beside the helicopter's pad (${pad.z.toFixed(0)} m), it never stands there`);
    else if (!(await waitPrompt(/Board the helicopter/))) fail(`beside the helicopter on the walk, nothing offers to board it ("${await prompt()}")`);
    else {
      await act();
      await p.evaluate(() => window.__game.advance(4));
      if ((await mode()) !== 'heli') fail(`E (or a tap) by the helicopter: not at the stick (${await mode()})`);
      else {
        await keysFor(/climb/i);
        const kl = await keyLine(), btn = phone ? await shown('.gt-btns button') : [], z0 = await p.evaluate(() => window.__game.heli.st.z);
        if (!(phone ? /climb/i.test(kl) : /climb/i.test(kl) && /descend/i.test(kl))) fail(`at the stick, the foot of the frame does not show the helicopter's keys ("${kl}")`);
        if (phone && !(btn.includes('Up') && btn.includes('Down'))) fail(`at the stick on a phone, the buttons are ${JSON.stringify(btn)} (want Up and Down)`);
        await hold('Space', 10); await p.waitForTimeout(1200);
        const z1 = await p.evaluate(() => window.__game.heli.st.z), up = await corner();
        if (z1 - z0 < 10) fail(`at the stick with Space held for ten seconds, the helicopter climbed ${(z1 - z0).toFixed(1)} m`);
        else if (!/m up/.test(up)) fail(`in the air, the corner does not say the height ("${up}")`);
        else ok(`flew: climbed ${(z1 - z0).toFixed(0)} m off the roof; the corner says "${up}"`);
        await shot('7c-heli');
        // over the crossing with the camera up (photo mode holds the world): Taro's photograph from the air, then back
        // over the roof to set down
        const back = await p.evaluate(() => {
          const g = window.__game, s = g.heli.st, was = { x: s.x, y: s.y, z: s.z };
          Object.assign(s, { x: 368, y: -1016, z: 15 + 130 });
          for (const k of ['vx', 'vy', 'vz', 'speed']) if (k in s) s[k] = 0;
          for (let i = 0; i < 3; i++) g.frame(0.05);
          g.photoMode(true); Object.assign(g.photo, { az: 0, pitch: 1.35, dist: 45 });
          return was;
        });
        await p.waitForFunction(() => window.__game.camera.position.y > 120, null, { timeout: 90000, polling: 500 }).catch(() => {});
        await shot('7d-air-photo');
        const aerial = await p.evaluate(() => { const g = window.__game; g.snapPhoto(); g.photoMode(false); const st = g.walkTalk().state(), e = g.walkTalk().errand(); return { met: !!(st.air && st.air.met), errand: e ? e.text : '' }; });
        if (!aerial.met) fail('over the crossing in the helicopter, a photograph of it does not meet what Taro asked');
        else if (!/Back to Taro/.test(aerial.errand)) fail(`the aerial photograph taken, the corner does not send you back to Taro ("${aerial.errand}")`);
        else ok(`a photograph of the crossing from the helicopter: "${aerial.errand}"`);
        await p.evaluate(was => { const g = window.__game, s = g.heli.st; Object.assign(s, { x: was.x, y: was.y, z: was.z }); for (const k of ['vx', 'vy', 'vz', 'speed']) if (k in s) s[k] = 0; g.frame(0.05); }, back);
        await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 60 && !g.heli.st.landed; i++) g.advance(0.5, ['KeyC']); g.advance(1); });
        if (!(await waitPrompt(/Get out/))) fail(`landed, nothing offers to get out of the helicopter ("${await prompt()}")`);
        else { await act(); await p.evaluate(() => window.__game.advance(3)); if ((await mode()) !== 'foot') fail(`out of the helicopter: still ${await mode()}`); else ok('landed and climbed out'); }
      }
    }
  }
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
