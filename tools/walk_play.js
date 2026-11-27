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
//   - the walk's menu does not offer the story, shows anything of the map's panel of settings (its heading, its tour and
//     passport, the date, the clock's speed, who is played, the crowd, its hours and weathers) or a browser's own field,
//     does not hold the hour, the sky and Continue inside its first screen, a choice of hour or sky there does not
//     change the street, or opened out it lacks any hour, any sky, the sound, the words, the frame rate, the keys or
//     the credits (issue 147);
//   - the camera (photo mode) does not open from the walk's own button, its controls cover more of the frame than they
//     may (a fifth on a desktop; on a phone a sixteenth with the lens's settings put away, a quarter with them out) or
//     lie over the middle of the frame, on a phone Adjust does not bring the settings out, or a photograph of Hachiko from
//     beside him is not the first of the views of Shibuya with its picture in the menu's album;
//   - by Hachiko's wall Wait with her does not sit the two of you, or the wait does not end on your feet a few minutes
//     before the last train, or she does not walk to the station's front, ask for one more photograph, take yours and
//     go (walktalk.js wait, gate);
//   - beside the kerb nobody walks into Nagi, she is not left on the ground with the corner saying what he did, Help her
//     up is not offered beside her, helped she does not ask for her photograph, or a photograph with her in it does not
//     send you back to her and put the walk's line away (walktalk.js, its incident);
//   - Mei at Hachiko has no amber speech mark over her from fourteen metres, E (or a tap) beside her does not open her
//     talk in the story's box, the corner does not then say what she asked, Riko across the crossing does not have her
//     part, or back with Mei the story is not put away with its name (walktalk.js);
//   - the first walk from the title: the office does not ring, or speaks of your car without its button lit, or is not
//     kept as heard; a street moment (Ren asking the way) cannot be answered by a choice and thanked;
//   - as the walk lands the corner does not say who has the first story with the metres and the way, or does not name
//     tonight's next moment when it is within the hour, or a phone is taught its thumbs in two lines (issue 146);
//   - nine metres from Hachiko's wall nobody sits on it beside the free place and no mark offers it, or a mark is drawn over
//     the free place beside someone seated;
//   - beside the end of Hachiko's wall nothing offers to sit and watch the crossing, or seated the camera does not stand
//     behind your shoulder framing the scramble, a drag does not turn it (and left alone it does not come back), the
//     time-lapse held (Space; on a phone its button) does not run the clock fast, or E (or a tap) does not stand you up
//     (perch.js; WALK_ONLY=sit stops after this; WALK_ONLY=film after the walk's opening, its length in seconds and timed by the clock: issue 229);
//   - on foot the corner has no Your car button, or pressed, the car does not pull in at a kerb near you; the walk's menu
//     does not list the walk's stories;
//   - beside your car, E (or a tap on the prompt) does not put you at the wheel, the car's keys are not at the foot of the
//     frame (on a phone: the hand brake, the horn and the view by the stick), it does not drive, the corner does not say
//     the speed, or once stopped nothing lets you out; the menu's Bring your car does not bring it to a kerb near you;
//   - in SKY GATE's lobby the lift is not offered, is not watched from outside the tower as it climbs (mid-ride the
//     camera high over the street and in no building), or does not end at the top stop;
//   - beside Taro on SHIBUYA SKY's roof his talk's shot does not have his face in the frame over the words, or a wall or a
//     body stands before it;
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
const { wholeWatch, wholeReport } = require('./whole_watch.js');
const { tones, flat } = require('./tone');
const { skip, whole } = require('./draw_skip');
const { logger: browserLog, watch: watchPage, expectReload } = require('./browser_watch'); // (what the browser says of its GPU, in the log: issue 49)
const pacing = require('./pacing_watch'); // (nobody of the crowd walks to and fro: issue 168)
const fs = require('fs');
const { drawnSeat } = require('./drawn_seat'); // (the seated sat on something drawn, not on the walking grid: issue 171)
const { measure: umbrellaHeld } = require('./umbrella_held'); // (in the rain: every umbrella held, issue 165)
const { dump: uiDump } = require('./ui_dump'); // (UI_DUMP=dir: the interface at each still, for tools/ui_fit.js)
const [,, out = '/tmp/walk-play', size = '1440x900', hour = 'night', sky = 'rain'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number), phone = w < 500;
  const args = process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox', '--disable-gpu-watchdog'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-watchdog'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args, logger: browserLog() });
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
  const p = await ctx.newPage();
  watchPage(p);
  // DRAW=n: one frame in n drawn (tools/draw_skip.js); STILLS=0: no still taken. The walk's beats read the page's state,
  // and at night in the rain every frame drawn whole was all of its time on a software renderer (issue 131)
  await skip(p, +(process.env.DRAW || 0));
  const errors = [];
  const lost = await require('./gl_lost').watch(p); // (a lost WebGL context said in the failure after it)
  // (a failure that leaves the walk stuck, a talk still open or a walk's line mid-way (its incident not over), and every
  // beat after it waited out its own timeout, up to 15 min each, on prompts that read "": walk1 ran 2215 s against 763 s
  // where Nagi's gate stalled, 24 November. Once stuck, the state is said and the beats after it are given 20 s each:
  // they fail as before, at once; nothing they check is changed)
  let stuck = '';
  const wf0 = p.waitForFunction.bind(p);
  // (the page loaded again by itself, a software renderer's GPU process lost and the page reloaded (glcare): what reads
  // the game first waits for it to be back, and says so, instead of reading window.__game before the page has made it.
  // A walk2 of the #220 session's threw on __game.walkLine there, a TypeError that failed the play, 25 November)
  const ev0 = p.evaluate.bind(p);
  p.evaluate = async (fn, arg) => {
    if (p.__unasked) {
      p.__unasked = false;
      const back = await wf0(() => !!(window.__game && window.__game.player), null, { timeout: 900000, polling: 500 }).then(() => true, () => false);
      console.log(back ? '(the page loaded again by itself, a GPU process lost: the game back before it was read again)' : '(the page loaded again by itself, and the game never came back in fifteen minutes)');
    }
    return ev0(fn, arg);
  };
  p.waitForFunction = (f, a, o = {}) => wf0(f, a, stuck ? { ...o, timeout: Math.min(o.timeout || 30000, 20000) } : o);
  const fail = m => {
    m = lost.tag() + m; errors.push(m); console.log(`FAIL ${m}`);
    if (!stuck) p.evaluate(gate => { const g = window.__game; if (!g || !g.dlg) return ''; const l = g.walkLine && g.walkLine(); return g.dlg.open ? 'a talk left open' : gate && l && l.w !== 'gone' ? `the walk's line never ended (${JSON.stringify(l)})` : ''; }, /she does not go/.test(m))
      .then(s => { if (s && !stuck) { stuck = s; console.log(`(the walk is stuck after that: ${s.slice(0, 200)}; the beats after it are given 20 s each)`); } }).catch(() => {});
  };
  const ok = m => console.log(`ok   ${m}`);
  p.on('pageerror', e => fail(`pageerror: ${String(e).slice(0, 200)}`));
  p.on('crash', () => fail('the page crashed (the renderer died)'));
  fs.mkdirSync(out, { recursive: true });
  await pacing.install(p);
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  if (process.env.CAM_IN === '1') await require('./cam_intrude').install(p); // (CAM_IN=1: the camera's window in nobody's body, on foot, by car and in the helicopter, issue 226; off by default, the walk check being near its time cap)
  await p.addInitScript(wholeWatch); // (nobody drawn in part: tools/whole_watch.js, issue 241)
  if (process.env.LENSGUARD === '0') await p.addInitScript(() => { window.__lensGuardOff = true; }); // (the game's lens guard off, to weigh its cost)
  // someone who has never played: nothing kept (once: the page opened again from the last card keeps what it was given)
  await p.addInitScript(() => { if (!sessionStorage.getItem('wp-once')) { sessionStorage.setItem('wp-once', '1'); try { for (const k of ['bh-player', 'bh-walk', 'bh-story-late', 'bh-story-late-closed']) localStorage.removeItem(k); } catch (e) { /* storage blocked */ } } });
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
  // (a button seen a moment ago and gone at the press is waited for once more, and said: the corner lays itself out again as
  // the player gets out of the car, seconds on a software renderer, and the button was seen and then laid out away, walk1 on
  // the branch routes-yield)
  const press = async sel => { let r = await p.locator(sel).first().boundingBox(); if (!r && (await shown(sel, 10000))) { console.log(`(${sel} gone at the press and back)`); r = await p.locator(sel).first().boundingBox(); } if (!r) return fail(`${sel}: not on the screen`); const x = r.x + r.width / 2, y = r.y + r.height / 2; if (phone) await p.touchscreen.tap(x, y); else await p.mouse.click(x, y); };
  const shot = async n => { if (process.env.STILLS !== '0') await whole(p, () => p.screenshot({ path: `${out}/${phone ? 'phone' : 'desk'}-${n}.png`, timeout: 120000 })).catch(() => console.log(`(no still ${n})`)); if (process.env.UI_DUMP) await uiDump(p, `${process.env.UI_DUMP}/walk-${n}.json`, { ctx: phone ? 'touch' : 'desk' }).catch(() => {}); };
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
  // the menu's Title screen (menus.js #gm-title), from the walk: the title again on its menu, with nothing of the walk
  // left on it, and the case begun from there (the play's last step; WALK_ONLY=title plays it alone, out from a fresh page)
  const titleBack = async () => {
    await press('#g-walk-acts [data-do="menu"]'); await shown('#g-menu');
    const t = await p.evaluate(() => { const e = document.getElementById('gm-title'), r = e && e.getBoundingClientRect(); return { on: !!e && !!e.closest('#gw-menu') && r.height > 0, first: !!r && r.top >= 0 && r.bottom <= innerHeight + 1, tall: innerHeight >= 640 }; }); // (in the first screen of a desktop's or a phone's; a short window scrolls to it)
    if (!t.on) fail('the walk\'s menu has no Title screen'); else if (!t.first && t.tall) fail('the walk\'s Title screen is below its first screen');
    await shot('9-menu-title');
    await p.locator('#gm-title').scrollIntoViewIfNeeded().catch(() => {});
    await press('#gm-title'); // (in place: the walk parked under the title, game.js parkTitle)
    if (!(await until(() => { const t = document.getElementById('g-title'), l = document.getElementById('g-loader'); return window.__game && t && !t.hidden && t.dataset.screen === 'menu' && l && l.hidden; }, null, 900000))) fail('Title screen: the title never opened on its menu');
    else {
      await p.waitForTimeout(2500);
      const left = await p.evaluate(() => { const v = s => { const e = document.querySelector(s); return !!e && !e.closest('[hidden]') && e.getBoundingClientRect().height > 0 && getComputedStyle(e).visibility !== 'hidden' && +getComputedStyle(e).opacity > 0.05; }; const st = document.getElementById('game-stage'); return [st.classList.contains('walk') && !st.classList.contains('parked-walk') && 'the walk\'s stage', v('#g-walk-acts') && 'the walk\'s corner', v('#g-menu') && 'the menu', v('#g-story-goal.on') && 'the goal line'].filter(Boolean); });
      if (left.length) fail(`back at the title, left over: ${left.join(', ')}`); else ok('Title screen: the title on its menu, nothing of the walk left');
      await shot('9-title-back');
      await press('#gt-story-go'); await until(() => document.getElementById('g-title').dataset.screen === 'story', null, 20000);
      expectReload(p, 'the case from a parked walk'); await press('#gt-play');
      if (await until(() => document.getElementById('g-title').dataset.screen === 'who', null, 5000)) { await press('#gt-who [data-c="W"]'); await p.waitForTimeout(500); await press('#gt-who-go'); }
      // (begun: the title gone and the street not the walk's; the opening's film, where it plays, is the case's first minutes)
      const where = () => p.evaluate(() => { const s = window.__game.story.state, t = document.getElementById('g-title'); return `${s.phase}/${s.beat}, title ${t.hidden ? 'gone' : t.dataset.screen}, walk ${document.getElementById('game-stage').classList.contains('walk')}`; }).catch(e => String(e).slice(0, 80));
      // (from a parked walk the case opens on a page of its own, game.js parkedWay: a wait cut off by the load is waited again)
      let begun = false;
      for (const t0 = Date.now(); !begun && Date.now() - t0 < 900000;) { begun = await until(() => !!window.__game && document.getElementById('g-title').hidden && !document.getElementById('game-stage').classList.contains('walk'), null, 30000); if (!begun) await p.waitForTimeout(1000); }
      if (!begun)
        fail(`from the title, the case did not begin (${await where()})`);
      else ok(`from the title, the case begins (${await where()})`);
    }
  };
  if (process.env.WALK_ONLY === 'title') {
    await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await p.evaluate(() => { sessionStorage.setItem('bh-walk-auto', JSON.stringify({ t: 'night', w: 'clear' })); });
    expectReload(p, 'out on the walk at once'); await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    if (!(await until(() => document.getElementById('game-stage').classList.contains('walk-on'), null, 900000))) fail('the walk never set out');
    else { await p.waitForTimeout(3000); await titleBack(); }
    await b.close(); console.log(errors.length ? `${errors.length} failure(s)` : 'walk title: all passed'); process.exit(errors.length ? 1 : 0);
  }
  // WALK_PART=1 or 2: the walk in two halves, a runner each (tools/check.sh walk1 and walk1b; issue 192 made the whole a
  // desktop page's 1373 s here against 1016, near CI's cap of 2400). The first is the title's way in to the seat on
  // Hachiko's wall, as the whole plays it; the second sets out at once (the last card's way, at the hour and sky asked)
  // and plays from the walk's line to the end. Every beat is in one or the other; none is played twice.
  const PART = +process.env.WALK_PART || 0; // (3: out at once and from your car on, its own runner since the walk's film and its incident's calm grew the second part to CI's cap, 25 November)
  const pace = async () => { // nobody of the crowd paced, wherever the walk went (issue 168: two men under the deck walked to and fro)
    const { hard } = pacing.print(await pacing.report(p), m => console.log(m.replace(/^FAIL /, 'pace ')));
    if (hard.length) fail(`${hard.length} of the crowd walked to and fro (${hard.slice(0, 6).map(q => `walker ${q.id} at (${q.x}, ${q.y})`).join('; ')})`);
    else ok('nobody of the crowd paced to and fro');
  };
  let s;
  if (PART >= 2) {
    await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await p.evaluate(([t, w]) => { sessionStorage.setItem('bh-walk-auto', JSON.stringify({ t, w })); }, [hour, sky]);
    expectReload(p, 'out on the walk at once (the second half)'); await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    if (!(await until(() => document.getElementById('game-stage').classList.contains('walk-on'), null, 900000))) { fail('the walk never set out'); await b.close(); process.exit(1); }
    await p.waitForTimeout(2500);
    s = await state();
    if (s.phase !== 'dressed' || s.goal || s.lights.story) fail(`set out at once on the walk, and the story has begun (phase ${s.phase})`);
    else ok(`the second half: out on the walk at once, ${s.clock.hm}, ${s.wx.mode}`);
    // (from your car on, WALK_PART=3: the helicopter's model is asked for once you are within 800 m of it, as you are at
    // Hachiko, and in the walk played whole it came in during the people's quarter of an hour before the roof. Here the
    // roof comes four minutes on: its model is waited for first, as that time gave it, and on the roof it must still stand
    // on its pad. Two plays on one machine, it had not come in the roof's four minutes)
    if (PART === 3) { const t0h = Date.now(), came = await until(() => window.__game.heli.loaded(), null, 600000); console.log(`(the helicopter's model ${came ? 'in' : 'not in'} after ${Math.round((Date.now() - t0h) / 1000)} s of setting out)`); }
  } else {
    await title();
    s = await state();
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
    if (!(await visible('#gt-walk-go'))) fail('the title has no Walk Shibuya under the episode');
    else ok(`the title offers two ways in: "${(await p.textContent('#gt-walk-go', { timeout: 180000 })).trim()}" and "${(await p.textContent('#gt-play', { timeout: 180000 })).trim()}"`); // (a software renderer can hold the page's thread for half a minute behind the title, compiling)
    // (the ways in are one list: the story first and the one Enter takes, the walk under it (the owner's word for the launch,
    // November 2026); every row the same width and height, none bigger than another, on a desktop and a phone alike)
    { const rows = await p.$$eval('#g-title .gt-go > .btn', bs => bs.filter(b => b.offsetParent).map(b => { const r = b.getBoundingClientRect(); return { id: b.id, w: Math.round(r.width), h: Math.round(r.height), lead: b.classList.contains('primary') }; }));
      if (!rows.length || rows[0].id !== 'gt-story-go' || !rows[0].lead || rows.filter(r => r.lead).length !== 1 || !rows[1] || rows[1].id !== 'gt-walk-go') fail(`the title's list does not lead with the story, the walk under it: ${JSON.stringify(rows)}`);
      else if (rows.some(r => Math.abs(r.w - rows[0].w) > 1 || Math.abs(r.h - rows[0].h) > 1)) fail(`the title's ways in are not all one size: ${JSON.stringify(rows)}`);
      else ok(`the title's ways in, one list led by the story, the walk under it, each ${rows[0].w}x${rows[0].h}: ${rows.map(r => r.id).join(', ')}`); }
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
      // (its length, in seconds (issue 229): a first visit's aerial holds each shot long enough to read the place, at least
      // 6 s, and at least 20 s in all before the land shot; and the film is timed by the clock, never by frames, so a 120 Hz
      // display sees the length a 60 Hz one does. Over a few seconds the film's own time is read against the frames drawn
      // and the time the game's clock was given (each frame's step, capped at 0.05 s): a film counted in frames would move
      // 1/60 s a frame)
      const len = await p.evaluate(async () => {
        const o = window.__game.overture(), sh = o.shots.map(q => ({ id: q.id, dur: q.dur, type: q.type }));
        let n = 0, given = 0, last = performance.now(), on = true;
        const tick = now => { if (!on) return; n++; given += Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now; requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
        const t0 = o.t; await new Promise(r => setTimeout(r, 6000)); on = false;
        return { sh, total: o.total, dt: o.t - t0, n, given, active: o.active };
      });
      const air = len.sh.filter(q => q.type !== 'land'), short = air.filter(q => q.dur < 6), airS = air.reduce((a, q) => a + q.dur, 0);
      if (short.length || airS < 20) fail(`the walk's opening is too short to take in: ${air.map(q => `${q.id} ${q.dur} s`).join(', ')} (${airS.toFixed(1)} s from the air)`);
      else ok(`the walk's opening: ${air.map(q => `${q.id} ${q.dur} s`).join(', ')}, ${airS.toFixed(1)} s from the air, ${len.total.toFixed(1)} s in all`);
      if (len.active && len.n > 3) {
        const byFrames = len.n / 60, r = len.dt / len.given;
        if (r < 0.6 || r > 1.4) fail(`the walk's opening is not timed by the clock: ${len.dt.toFixed(2)} s of film over ${len.n} frames given ${len.given.toFixed(2)} s (${byFrames.toFixed(2)} s if counted at 60 a second)`);
        else ok(`the walk's opening is timed by the clock: ${len.dt.toFixed(2)} s of film over ${len.n} frames given ${len.given.toFixed(2)} s`);
      } else console.log(`(the walk's opening's clock not read: too few frames drawn here (${len.n} frames in 6 s, the film ${len.active ? 'on' : 'over'}))`);
      if (phone) await p.touchscreen.tap(w / 2, h / 2); else await p.keyboard.press('Space');
      const ts = Date.now();
      if (!(await until(() => document.getElementById('game-stage').classList.contains('walk-on'), null, 120000))) fail(`a ${phone ? 'tap' : 'key'} in the walk's opening did not bring the walk to you`);
      else ok(`a ${phone ? 'tap' : 'key'} in the walk's opening: on the street ${((Date.now() - ts) / 1000).toFixed(1)} s later`);
    }
    if (process.env.WALK_ONLY === 'film') { await b.close(); console.log(errors.length ? `${errors.length} failure(s)` : 'walk film: all passed'); process.exit(errors.length ? 1 : 0); } // (WALK_ONLY=film stops after the opening)
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
    // (nobody drawn near you with only a head over the floor: a woman's head and neck stood on the carriageway by the
    // zebra as control was handed over, her body under the road, issue 241. Each whole person within 40 m, the crowd's near
    // people and the map's, their head's height over the walk's floor where they stand, for three seconds)
    {
      const sunk = [];
      for (let k = 0; k < 6; k++) {
        sunk.push(...await p.evaluate(() => { const g = window.__game, me = g.player, R = g.crowdDraw && g.crowdDraw(), V = new THREE.Vector3(), out = [];
          const test = (who, root) => { if (!root || !root.visible) return; let h = root.userData.headBone; if (h === undefined) { h = null; root.traverse(o => { if (!h && o.isBone && /Head$/.test(o.name)) h = o; }); root.userData.headBone = h; }
            if (!h) return; root.updateMatrixWorld(true); h.getWorldPosition(V); const x = V.x, y = -V.z; if (Math.hypot(x - me.x, y - me.y) > 40) return;
            const f = g.nav.floorAt(x, y, V.y); if (f && V.y - f.z < 0.9) out.push(`${who} at (${x.toFixed(1)}, ${y.toFixed(1)}): head ${(V.y - f.z).toFixed(2)} m over the floor`); };
          if (R && R.active) for (const [i, r] of R.active) test('crowd ' + i, r.root);
          for (const n of g.npcs) if (!n.away && !n.sit && n.rig) test(n.id, n.rig.root);
          return out; }));
        await p.waitForTimeout(500);
      }
      if (sunk.length) fail(`someone drawn near you with their head at the floor: ${[...new Set(sunk)].slice(0, 4).join('; ')}`);
      else ok('everyone drawn within 40 m stands with their head over the floor');
    }
    // (and nobody drawn in part, from the page's start through the handover: a woman's head drew while her body's shader
    // was still linking and the draw gate held it, issue 241; tools/whole_watch.js)
    {
      const R = wholeReport(await p.evaluate(() => window.__whole));
      if (R.fail) { for (const l of R.lines) console.log(l); fail(R.fail); }
      else ok(`nobody drawn in part through the walk's handover (${R.lines[0]})`);
    }
    // the walk's way in, the first time from the title (game.js walkIntro): the office rings in its own voice, the corner's
    // Your car lit while the car is spoken of; passed line by line, and kept as heard
    {
      const rang = await p.waitForFunction(() => { const b = document.getElementById('gd'); return b && !b.hidden && /office/i.test(document.getElementById('gd-name').textContent); }, null, { timeout: 120000, polling: 300 }).then(() => true, () => false);
      if (!rang) fail('the first walk from the title: the office does not ring');
      else {
        let carLit = false, n = 0;
        for (let i = 0; i < 40 && (await p.evaluate(() => window.__game.dlg.open)); i++) {
          const r = await p.evaluate(() => { const g = window.__game; g.dlg.next(false); return { t: document.getElementById('gd-text').textContent, lit: !!document.querySelector('#g-walk-acts button.hl[data-do="car"]'), open: g.dlg.open }; });
          if (/car/i.test(r.t) && r.lit) { if (!carLit) await shot('4a-intro'); carLit = true; }
          if (r.open) n++;
        }
        const kept = await p.evaluate(() => { try { return localStorage.getItem('bh-walk-intro'); } catch (e) { return null; } });
        if (!carLit) fail('the office speaks of your car without the corner\'s Your car lit');
        else if (!kept) fail('the walk\'s way in is not kept as heard (it would ring every time)');
        else ok('the walk\'s way in: the office rings, your car\'s button lit while it is spoken of, kept as heard');
      }
    }
    // the walk's first minute (issue 146; docs/STORY.md "The walk's first ten minutes"): before a step is taken the corner
    // says the one thing there is to do, who has the first story and the metres and the way to them, and under the date
    // tonight's next moment when it is within the hour; on a phone the thumbs are taught in one line, not two
    {
      const f = await p.waitForFunction(() => { const q = document.querySelector('#g-walk-where .q'); return q && !q.hidden && /\d+ m/.test(q.textContent); }, null, { timeout: 60000, polling: 300 }).then(() => p.evaluate(() => {
        const q = document.querySelector('#g-walk-where .q'), tn = document.querySelector('#g-walk-where .tn'), k = document.getElementById('g-walk-keys');
        return { q: q.textContent.replace(/\s+/g, ' ').trim(), dir: !!q.querySelector('.dir'), tn: tn && !tn.hidden ? tn.textContent.replace(/\s+/g, ' ').trim() : '', keys: k ? k.querySelectorAll('span').length : 0, soon: (() => { const g = window.__game, T = g.tonight && g.tonight(); if (!T) return null; const s = T.state(g.clock.min); return s.on ? 0 : s.soon ? s.soon.inMin : null; })() };
      }), () => null);
      if (!f) fail('the first minute: the corner does not say who has the first story and how far');
      else {
        if (!f.dir) fail(`the first minute: "${f.q}" has no needle for the way`); else ok(`the first minute: the corner says "${f.q}", with the way to it`);
        if (f.soon != null && f.soon <= 60 && !f.tn) fail(`the first minute: tonight's next moment is ${f.soon} min off and the corner does not name it`);
        else if (f.tn) ok(`the first minute: tonight in the corner, "${f.tn}"`);
        if (phone && f.keys > 1) fail(`the first minute on a phone: the thumbs are taught in ${f.keys} lines over the crowd`);
      }
      await shot('4-first-minute');
    }
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
  // the walk's own menu (issue 147): the story offered; none of the map's panel (its tour, its passport, the date, the
      // clock's speed, who is played, the crowd, the old hours and weathers); the hour, the sky and Continue inside the
      // first screen; a choice of hour or sky changes the street and is put back
      const m = await p.evaluate(() => {
        const vis = s => { const e = document.querySelector(s); if (!e || e.closest('[hidden]')) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
        const inFirst = s => { const e = document.querySelector(s); if (!e) return false; const r = e.getBoundingClientRect(); return r.height > 0 && r.top >= 0 && r.bottom <= innerHeight + 1 && r.left >= 0 && r.right <= innerWidth + 1; };
        const old = ['#gm-intro', '#gm-reset', '#gm-date', '#gm-speed', '#gm-who', '#gm-density', '#gm-time', '#gm-weather', '#gm-clock', '#g-menu .g-panel h2', '.gt-keys'].filter(vis);
        const native = [...document.querySelectorAll('#g-menu input')].filter(e => /date|time|datetime-local|month|week|color/.test(e.type) && e.getBoundingClientRect().height > 0).map(e => e.type);
        return { story: vis('#gm-story'), old, native, first: ['#gw-menu [data-k="t"]', '#gw-menu [data-k="w"]', '#gw-continue'].filter(q => !inFirst(q)), head: (document.querySelector('#gw-l') || {}).textContent || '' };
      });
      if (!m.story) fail('the walk\'s menu does not offer the story');
      if (m.old.length) fail(`the walk's menu still shows the map's panel: ${m.old.join(', ')}`);
      if (m.native.length) fail(`the walk's menu has a browser's own field: ${m.native.join(', ')}`);
      if (m.first.length) fail(`the walk's menu: not inside its first screen: ${m.first.join(', ')}`);
      if (m.story && !m.old.length && !m.native.length && !m.first.length) ok(`the menu "${m.head}": "${(await p.textContent('#gm-story')).trim()}", the hour, the sky and Continue in its first screen, nothing of the map's panel`);
      {
        const was = await p.evaluate(() => ({ min: window.__game.clock.min, t: (document.querySelector('#gw-menu [data-k="t"] [aria-checked="true"]') || { dataset: {} }).dataset.v || null, w: (document.querySelector('#gw-menu [data-k="w"] [aria-checked="true"]') || { dataset: {} }).dataset.v || null }));
        const other = await p.evaluate(() => { const b = document.querySelector('#gw-menu [data-k="t"] [aria-checked="false"]:not([data-v="live"])'); return b ? { v: b.dataset.v, at: b.querySelector('small').textContent } : null; });
        if (!other) fail('the walk\'s menu offers no other hour');
        else {
          await press(`#gw-menu [data-k="t"] [data-v="${other.v}"]`); await p.waitForTimeout(400);
          const now = await p.evaluate(() => ({ t: document.querySelector('#gw-menu .gw-t').textContent, on: (document.querySelector('#gw-menu [data-k="t"] [aria-checked="true"]') || { dataset: {} }).dataset.v }));
          if (now.t !== other.at || now.on !== other.v) fail(`the menu's hour "${other.v}" (${other.at}): the street is at ${now.t}, the choice marked is ${now.on}`);
          else ok(`the menu's hour: ${other.v}, ${now.t}`);
          if (was.t) await press(`#gw-menu [data-k="t"] [data-v="${was.t}"]`); else await p.evaluate(mn => { const g = window.__game; g.setClock(g.clock.y, g.clock.m, g.clock.d, mn); }, was.min);
        }
        const sky = was.w === 'rain' ? 'clear' : 'rain';
        await press(`#gw-menu [data-k="w"] [data-v="${sky}"]`); await p.waitForTimeout(400);
        const sub = await p.textContent('#gw-menu .gw-sub');
        if (!new RegExp(sky, 'i').test(sub)) fail(`the menu's sky "${sky}": its head says "${sub.trim()}"`); else ok(`the menu's sky: ${sky}`);
        if (was.w) await press(`#gw-menu [data-k="w"] [data-v="${was.w}"]`); else await p.evaluate(() => { const b = document.querySelector('#gw-menu [data-sky="clear"]'); if (b) b.click(); });
        await p.waitForTimeout(300);
      }
      // (and the walk's stories, as a game's list of side stories: each by its name, with where to look for the ones not met)
      const tales = await p.evaluate(() => { const e = document.getElementById('gm-tales'); return e && !e.hidden ? [...e.querySelectorAll('li')].map(l => `${l.dataset.s}:${l.querySelector('b').textContent}`) : []; });
      if (tales.length < 4) fail(`the walk's menu does not list its stories (${JSON.stringify(tales)})`);
      else ok(`the menu lists the walk's stories: ${tales.join(', ')}`);
      await shot('6-menu');
      // what folds away: any hour and any sky; the sound, the words and the frame rate; the keys or the thumbs' controls
      await p.evaluate(() => { for (const d of document.querySelectorAll('#gw-menu details')) d.open = true; });
      await p.waitForTimeout(300);
      {
        const f = await p.evaluate(() => { const vis = s => { const e = document.querySelector(s); if (!e || e.closest('[hidden]')) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
          return { missing: ['#gw-clock', '#gw-menu [data-sky="snow"]', '#gw-opts #gm-sound', '#gw-opts #gm-words', '#gw-opts #gm-fps', '#gw-keys tr', '#gw-credits'].filter(q => !vis(q)), wide: document.getElementById('g-menu').scrollWidth > innerWidth + 1 }; });
        if (f.missing.length) fail(`the walk's menu, opened out, lacks ${f.missing.join(', ')}`); else ok('the menu opened out: any hour, any sky, the sound, the words, the frame rate, the keys, the credits');
        if (f.wide) fail('the walk\'s menu is wider than the screen');
      }
      await shot('6-menu-open');
      await p.evaluate(() => { for (const d of document.querySelectorAll('#gw-menu details')) d.open = false; document.getElementById('g-menu').scrollTop = 0; });
      await press('#gw-continue'); await gone('#g-menu');
      if (await visible('#g-menu')) fail('the menu\'s Continue does not shut it (off the screen, or under something)');
    }
    // the camera, by Hachiko and facing him: the photograph is the first of the views of Shibuya (walktalk.js views), its
    // name put up over the street and its picture in the menu's album
    await p.evaluate(() => { const g = window.__game, t = g.walkTalk(); if (t) t.reset(); g.spawn([381, -1040]); g.player.h = Math.atan2(374.79 - g.player.x, -1046.45 - g.player.y); g.cam.yaw = g.player.h; g.cam.pitch = 0.12; for (let i = 0; i < 10; i++) g.frame(0.05); });
    await press('#g-walk-acts [data-do="photo"]'); await until(() => document.getElementById('game-stage').classList.contains('photo'), undefined, 20000);
    if (!(await p.evaluate(() => document.getElementById('game-stage').classList.contains('photo')))) fail('the walk\'s camera button does not open photo mode');
    else {
      ok('the camera opens photo mode'); await p.waitForTimeout(600); await shot('7-photo');
      // (in the rain, with the world held by the camera: each umbrella near the lens is held, its handle at its hand, its
      // shaft clear of the body under it, no canopy in another or in a head: issue 165, tools/umbrella_held.js)
      if (sky === 'rain') { const U = await umbrellaHeld(p, { label: 'the walk in the rain, the camera up', held: true, loose: true, within: 14 }); for (const l of U.lines) console.log(l); if (U.none) fail('the page has no umbrella report to measure'); else if (U.bad.length) fail(`umbrellas not held: ${U.bad.join('; ')}`); else ok(`${U.n} open umbrellas near the lens, every one held`); }
      // the frame is the photograph's (issue 147): what the camera's controls cover, and nothing of them over the middle
      // of the frame where the subject stands (tools/ui_fit.js holds the same at every size)
      const cover = () => p.evaluate(() => {
        const W = innerWidth, H = innerHeight, mid = { l: W / 3, r: W * 2 / 3, t: H / 3, b: H * 2 / 3 }, on = [];
        let area = 0;
        for (const e of document.querySelectorAll('#g-photo, #g-photo *')) {
          const c = getComputedStyle(e), r = e.getBoundingClientRect();
          if (e.closest('[hidden]') || !(r.width > 0 && r.height > 0) || c.visibility === 'hidden') continue;
          const paints = c.backgroundImage !== 'none' || !/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(c.backgroundColor) || c.backdropFilter !== 'none';
          if (!paints || [...document.querySelectorAll('#g-photo, #g-photo *')].some(o => o !== e && o.contains(e) && on.includes(o))) continue; // (a box inside a box that paints is counted once)
          on.push(e); area += r.width * r.height;
          if (r.left < mid.r && r.right > mid.l && r.top < mid.b && r.bottom > mid.t) on.mid = (on.mid || []).concat(e.id || e.className);
        }
        return { share: area / (W * H), mid: on.mid || [] };
      });
      const put = await cover(), lim = phone ? 0.0625 : 0.2;
      if (put.share > lim || put.mid.length) fail(`photo mode: the camera's controls cover ${(put.share * 100).toFixed(0)}% of the frame (${(lim * 100).toFixed(0)}% allowed)${put.mid.length ? `, and ${put.mid.join(', ')} lie over its middle` : ''}`);
      else ok(`photo mode: the controls cover ${(put.share * 100).toFixed(1)}% of the frame, none of its middle`);
      if (phone) {
        await press('#ph-adj'); await p.waitForTimeout(400);
        const out = await cover();
        if (!(await visible('#ph-time'))) fail('photo mode: Adjust does not bring out the lens\'s settings');
        else if (out.share > 0.25 || out.mid.length) fail(`photo mode, the settings out: ${(out.share * 100).toFixed(0)}% of the frame (25% allowed)${out.mid.length ? `, ${out.mid.join(', ')} over its middle` : ''}`);
        else ok(`photo mode, the settings out: ${(out.share * 100).toFixed(1)}% of the frame, none of its middle`);
        await shot('7-photo-adjust');
        await press('#ph-adj'); await p.waitForTimeout(300);
        if (!(await visible('#ph-snap'))) fail('photo mode: no shutter on the screen');
      }
      const view = await p.evaluate(() => { const g = window.__game; g.snapPhoto(); const v = g.walkTalk().views().find(q => q.id === 'hachiko'); return v ? { found: v.found, pic: !!v.pic } : null; });
      if (!view || !view.found) fail('a photograph of Hachiko from beside him is not among the views of Shibuya');
      else if (!view.pic) fail('Hachiko found, but no picture of him kept for the album');
      else ok('a photograph of Hachiko: the first of the views of Shibuya, with its picture');
    }
    if (phone) await press('#ph-done'); else await p.keyboard.press('Escape');
    // (the camera cranes back to the chase view, 0.9 s of the game's frames, many seconds of a software renderer's; the
    // walk's buttons take no press while it moves. Read from the game, not the stage's class: the frame puts .cine on, and
    // a software renderer's next frame can be seconds after photo mode is left)
    await until(() => { const g = window.__game; return !g.photo.on && !g.cine.active; }, undefined, 120000);
    await p.waitForTimeout(800);
    { // (the menu's album: Hachiko as his picture)
      await press('#g-walk-acts [data-do="menu"]'); await shown('#g-menu');
      const album = await p.evaluate(() => [...document.querySelectorAll('#gm-tales .gm-album li')].map(l => `${l.dataset.f}${l.querySelector('img') ? 'p' : ''}`));
      if (album.length < 6 || album[0] !== '1p') fail(`the walk's menu album: ${JSON.stringify(album)} (want Hachiko's picture first of six)`);
      else ok(`the menu's album: ${album.filter(a => a[0] === '1').length} of ${album.length} views, Hachiko's picture in it`);
      await shot('7e-album');
      await press('#gw-continue'); await gone('#g-menu');
      await p.evaluate(() => { const t = window.__game.walkTalk(); if (t) t.reset(); });
    }
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
        // (the street offers the seat by a person: from nine metres off, someone of the place already sits on the wall beside
        // the free place (visitors.js, game.json visitors), and no mark is drawn over it: issues 146, 171)
        const placeMark = () => p.evaluate(() => { const e = document.querySelector('.g-walk-mark[data-k="place"]'); return e ? { o: +e.style.opacity || 0, name: e.querySelector('span').textContent } : null; });
        const here = await p.evaluate(() => [window.__game.player.x, window.__game.player.y]);
        await p.evaluate(() => { const g = window.__game, s = g.perch.list[0]; g.player.x = s.at[0] + s.face[0] * 9; g.player.y = s.at[1] + s.face[1] * 9; { const f = g.nav.floorAt(g.player.x, g.player.y, g.nav.terrain(g.player.x, g.player.y) + 1); if (f) g.player.z = f.z; } g.player.h = Math.atan2(-s.face[0], -s.face[1]); g.cam.yaw = g.player.h; g.cam.pitch = 0.1; g.advance(0.3); });
        await frames(24);
        // (the sitter's body may still be coming: the crowd's cast loads a few at a time. Within 2.5 m, as the game's seatMarks asks
        // visitors.seated: one sat 2.2 m off, the game rightly offered no mark, and a 2 m look found nobody, walk1 on stop-warm)
        const sitter = await p.waitForFunction(() => { const g = window.__game, s = g.perch.list[0], V = g.visitors; if (!V) return 'none'; const q = V.shown().find(v => v.sit && Math.hypot(v.x - s.at[0], v.y - s.at[1]) < 2.5); if (!q) { g.frame(0.05); return false; } return { d: +Math.hypot(q.x - s.at[0], q.y - s.at[1]).toFixed(2), who: q.character }; }, null, { timeout: 90000, polling: 300 }).then(h => h.jsonValue(), () => null);
        // (once someone sits there, the mark that offered the place while their body came fades: a few frames for it to go)
        let pm = await placeMark();
        for (let i = 0; i < 40 && sitter && sitter !== 'none' && pm && pm.o > 0.05; i++) { await frames(4); pm = await placeMark(); }
        // (and if their body is still coming, a software renderer behind another browser: the seat must be offered by its mark
        // meanwhile, never an empty wall with nothing on it, visitors.js seated)
        const waiting = !sitter || sitter === 'none';
        // (said with what was there: the one who sits by it, drawn or not, and the mark's state, so a failure says which half failed)
        const why = waiting && !(pm && pm.o > 0.05) ? await p.evaluate(() => { const g = window.__game, s = g.perch.list[0], V = g.visitors, me = g.player; const q = V ? V.groups.flatMap(G => G.people).filter(v => v.p.sit != null && Math.hypot(v.x - s.at[0], v.y - s.at[1]) < 2.5) : []; const e = document.querySelector('.g-walk-mark[data-k="place"]'); return `sitters ${JSON.stringify(q.map(v => ({ shown: !!v.shown, rig: !!v.rig, ch: v.p.look && v.p.look.character })))}; mark ${e ? `opacity ${e.style.opacity}` : 'none'}; you ${Math.hypot(me.x - s.at[0], me.y - s.at[1]).toFixed(1)} m off, mode ${me.mode || '?'}; queue ${JSON.stringify(window.OEWorld.uploadStats ? window.OEWorld.uploadStats() : null)}`; }).catch(e => String(e)) : '';
        if (waiting && !(pm && pm.o > 0.05)) fail(`nine metres from ${seat.name}, nobody sits on the wall beside the free place, and no mark offers it (${why})`);
        else if (waiting) ok(`nine metres from ${seat.name}: the one who sits beside it has not come yet (their body still loading), and the mark offers the place meanwhile ("${pm.name}")`);
        else ok(`nine metres from ${seat.name}: someone sits ${sitter.d} m from the free place (${sitter.who})`);
        // (sat on the stone drawn, not on the walking grid's wider block: a ray down through the meshes, tools/drawn_seat.js)
        for (const r of await p.evaluate(drawnSeat, { rigs: 'visitors' })) { if (r.ok === null) console.log(`(${r.who}: what is drawn under them cannot be read here: this device let go of its vertices)`); else if (!r.ok) fail(`${r.who}: not on anything drawn (${JSON.stringify(r.under)})`); else ok(`the one on the wall sits on the drawn stone (hips ${r.under.pelvis} m over it)`); }
        if (!waiting && pm && pm.o > 0.05) fail(`${seat.name} is still offered by a mark ("${pm.name}", ${pm.o}): the person beside it does that`);
        else if (!waiting) ok(`${seat.name}: no mark over it, the person beside it offers it`);
        await shot('4f-seat-mark');
        await p.evaluate(([x, y]) => { const g = window.__game; g.player.x = x; g.player.y = y; g.advance(0.2); }, here);
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
          for (const r of await p.evaluate(drawnSeat, { rigs: 'player' })) { if (r.ok === null) console.log(`(${r.who}: what is drawn under them cannot be read here: this device let go of its vertices)`); else if (!r.ok) fail(`seated, you are not on anything drawn (${JSON.stringify(r.under)})`); else ok(`seated on the drawn stone (hips ${r.under.pelvis} m over it)`); }
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
          { // (sat on once, the seat is the player's to come back to: no mark over it again)
            await frames(20);
            const pm2 = await placeMark();
            if (pm2 && pm2.o > 0.05) fail(`sat on once, ${seat.name} is still marked`); else ok(`sat on once, ${seat.name} is no longer marked`);
          }
        }
      }
      if (process.env.WALK_ONLY === 'sit') { await b.close(); console.log(errors.length ? `${errors.length} failure(s)` : 'walk sit: all passed'); process.exit(errors.length ? 1 : 0); }
    }
    if (PART === 1) { await pace(); await b.close(); console.log(errors.length ? `FAIL ${errors.length}` : 'ok   the walk\'s first half: the title\'s way in, out on the street, the camera and the seat'); process.exit(errors.length ? 1 : 0); }
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
    if (PART !== 3) { // (WALK_PART=3 plays from your car on: the walk's people are the second part's)
      const talk = (id, near = 2) => p.evaluate(([id, near]) => { const g = window.__game, n = g.npcs.find(q => q.id === id); if (!n) return false; const a = Math.atan2(g.player.x - n.x, g.player.y - n.y) || 0; g.player.x = n.x + Math.sin(a) * near; g.player.y = n.y + Math.cos(a) * near; g.player.z = n.z; g.player.h = a + Math.PI; g.player.speed = 0; g.advance(0.3); return true; }, [id, near]);
      const through = () => p.evaluate(() => { const g = window.__game; for (let i = 0; i < 60 && g.dlg.open; i++) g.dlg.next(false); return g.dlg.open; });
      const errandNow = () => p.evaluate(() => { const e = document.querySelector('#g-walk-where .q'); return e && !e.hidden ? e.textContent : ''; });
      // (the corner and the marks are the page's own frames' to draw: waited for, a software renderer's frame being seconds long)
      const errandIs = re => p.waitForFunction(r => { const e = document.querySelector('#g-walk-where .q'); return e && !e.hidden && new RegExp(r).test(e.textContent); }, re.source, { timeout: 90000, polling: 500 }).then(() => true, () => false);
      // the walk's line (walktalk.js, its incident; docs/STORY.md "The walk's line"): beside the kerb you came down at a woman
      // is walked into and left on the ground; the corner says what he did; beside her Help her up is offered, and taken,
      // she speaks and asks for her photograph; a photograph with her in it sends you back to her, and the story is put away
      {
        const line = () => p.evaluate(() => (window.__game && window.__game.walkLine ? window.__game.walkLine() : null)).catch(() => null); // (null while the page loads again: a lost context it could not take back, glcare.js)
        const beside = near => p.evaluate(near => { const g = window.__game, n = g.npcById('nagi'); g.spawn([n.x + near * 0.55, n.y - near * 0.83]); const a = Math.atan2(n.x - g.player.x, n.y - g.player.y); g.player.h = a; g.cam.yaw = a; for (let i = 0; i < 6; i++) g.frame(0.05); }, near);
        const drawnN = await p.waitForFunction(() => { const n = window.__game.npcById('nagi'); return n && !n.rig.pending; }, null, { timeout: 600000, polling: 1000 }).then(() => true, () => false);
        await p.evaluate(() => window.__game.walkTalk().lineAgain()); // (the checks before this one began the stories again, and with them took the incident away)
        if (!drawnN) fail(`Nagi is not drawn ten minutes after setting out: ${JSON.stringify(await p.evaluate(() => { const g = window.__game, n = g.npcById('nagi'); return n ? { at: [Math.round(n.x), Math.round(n.y)], away: !!n.away, pending: !!n.rig.pending, loading: !!n.loading, you: [Math.round(g.player.x), Math.round(g.player.y)], mode: g.player.mode } : 'none'; }))}`);
        else {
          await beside(4);
          // (the man's character comes too, then the page's own frames set him off and carry him to her)
          await p.waitForFunction(() => window.__game.walkLine().ph !== 'wait', null, { timeout: 600000, polling: 250 }).catch(() => {});
          await p.waitForFunction(() => /down|up/.test(window.__game.walkLine().ph), null, { timeout: 600000, polling: 250 }).catch(() => {}); // (the line goes by the page's own frames: seconds each on a software renderer)
          const l = await line();
          // (not in the first calm of control, and a man running: issue 229)
          if (l.startedAt == null || l.startedAt < 24.9) fail(`the walk's line began ${l.startedAt} s into control, inside its calm of 25 s`);
          if (!(l.v >= 4)) fail(`the walk's line: he came at ${l.v} m/s, a walk, not a run`);
          if (l.ph !== 'down' || l.at[2] !== 'down') fail(`the walk's line: nobody walked into her, or she is not on the ground (${JSON.stringify(l)})`);
          else {
            ok(`the walk's line: he walked into her and walked on (he is at ${l.man}); she is on the ground`);
            if (!(await errandIs(/walked into her/))) fail(`she is on the ground and the corner does not say what he did ("${await errandNow()}")`);
            await shot('4a-down');
            await beside(1.7);
            if (!(await waitPrompt(/Help her up/))) fail(`beside her on the ground, nothing offers to help her up ("${await prompt()}")`);
            else {
              await act();
              await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 40; i++) g.frame(0.05); });
              const box = await p.evaluate(() => { const b = document.getElementById('gd'); return b && !b.hidden ? document.getElementById('gd-name').textContent : ''; });
              const up = await line();
              if (!/Nagi/.test(box) || up.at[2] !== 'up') fail(`helped up, she is not on her feet and speaking ("${box}", ${JSON.stringify(up)})`);
              else ok('Help her up: she is on her feet, and speaks');
              await shot('4a-helped');
              await through();
              if (!(await errandIs(/Photograph Nagi/))) fail(`she does not ask for her photograph ("${await errandNow()}")`);
              else {
                await beside(3.2);
                const back = await p.evaluate(() => { const g = window.__game; g.photoMode(true); g.snapPhoto(); g.photoMode(false); for (let i = 0; i < 6; i++) g.frame(0.05); const e = g.walkTalk().errand(); return e ? e.text : ''; });
                if (!/Back to Nagi/.test(back)) fail(`a photograph with her in it is not the one she asked for ("${back}")`);
                else {
                  await beside(1.7);
                  if (!(await waitPrompt(/Talk to Nagi/))) fail('the photograph taken, she has nothing to say');
                  else {
                    await act(); await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 40; i++) g.frame(0.05); });
                    await shot('4a-last-train');
                    await through();
                    const st = await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 10; i++) g.frame(0.05); return (g.walkTalk().state().last || {}); });
                    if (!st.done || st.inc !== 'helped') fail(`her story is not put away (${JSON.stringify(st)})`);
                    else ok('her photograph taken and shown: The last train is put away, the 0:33 named');
                    // the line's end (walktalk.js wait, gate; game.js waitWith): by the wall, Wait with her sits the two of you and
                    // the night passes until a few minutes before her train; she stands, walks to the station's front, asks for one
                    // more photograph, takes yours, goes in along the walkway and turns round, and is gone
                    const clockWas = await p.evaluate(() => { const c = window.__game.clock; return [c.y, c.m, c.d, c.min]; }); // (put back after: the beats after this one at the walk's own hour)
                    await p.evaluate(() => { const g = window.__game, n = g.npcById('nagi'); g.npcMove(n, [372.6, -1043.2]); g.setClock(g.clock.y, g.clock.m, g.clock.d, 20); g.spawn([n.x + 0.9, n.y + 1.6]); g.player.h = Math.atan2(-0.9, -1.6); g.cam.yaw = g.player.h; for (let i = 0; i < 6; i++) g.frame(0.05); });
                    if (!(await waitPrompt(/Wait with her for the last train/))) fail(`by the wall, her story told, nothing offers to wait with her ("${await prompt()}")`);
                    else {
                      await act();
                      const sat = await p.evaluate(() => { const g = window.__game, n = g.npcById('nagi'); return { me: g.player.mode, her: !!n.sit, wait: g.walkLine().wait }; });
                      if (sat.me !== 'seat' || !sat.her || !sat.wait) fail(`Wait with her: not the two of them sat on the wall (${JSON.stringify(sat)})`);
                      else ok('Wait with her: the two of you on Hachiko\'s wall, the night passing');
                      // (her sit is laid on in her next pose, and the seat's thigh slope comes to rest a step a frame: measured after
                      // a second of the game's own clock, not the wall's. Beside another browser no frame had run in the 400 ms act()
                      // waits, and she was read standing, her hips 0.52 m over the stone, or half sat, 0.026: issue 211)
                      await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 20; i++) g.frame(0.05); });
                      for (const r of await p.evaluate(drawnSeat, { rigs: ['nagi'] })) { if (r.ok === null) console.log(`(${r.who}: what is drawn under them cannot be read here: this device let go of its vertices)`); else if (!r.ok) fail(`Wait with her: ${r.who} is not sat on anything drawn (${JSON.stringify(r.under)})`); else ok(`Wait with her: ${r.who} on the drawn stone`); }
                      await shot('4b-wait');
                      if (!(await p.waitForFunction(() => window.__game.walkLine().gate === 'ask', null, { timeout: 900000, polling: 500 }).then(() => true, () => false))) fail(`she never came to the station's front (${JSON.stringify(await line())})`);
                      else {
                        const up = await p.evaluate(() => { const g = window.__game; return { me: g.player.mode, min: Math.round(g.clock.min) }; });
                        if (up.me !== 'foot' || up.min < 25 || up.min > 33) fail(`the wait did not end on your feet a few minutes before 0:33 (${JSON.stringify(up)})`);
                        else ok(`the wait ended at ${up.min} minutes past midnight; she walked to the station's front`);
                        await beside(1.8);
                        if (!(await waitPrompt(/Talk to Nagi/))) fail('at the station she has nothing to say');
                        else {
                          await act(); await through();
                          if ((await line()).gate !== 'shot') fail(`at the station she does not ask for one more photograph (${JSON.stringify(await line())})`);
                          await beside(3.2);
                          await p.evaluate(() => { const g = window.__game; g.photoMode(true); g.snapPhoto(); g.photoMode(false); for (let i = 0; i < 30; i++) g.frame(0.05); });
                          await beside(1.8);
                          if ((await line()).gate !== 'shown' || !(await waitPrompt(/Talk to Nagi/))) fail(`her last photograph is not the one she asked for (${JSON.stringify(await line())})`);
                          else {
                            // (her talk opens in a frame after E: up to a second of the game's clock after each press, not 600 ms of the
                            // wall's. Beside another browser the three presses ran out before it opened, the talk was left unread, and she
                            // never went: issue 211)
                            for (let k = 0; k < 3 && !(await p.evaluate(() => window.__game.dlg.open)); k++) { await act(); await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 20 && !g.dlg.open; i++) g.frame(0.05); }); }
                            // (what she says when shown it, a pause of 900 ms of the wall's clock, then her last words, and only then does
                            // she go: walktalk.js gateTalk. Each talk read as it opens, until she goes, the page's frames and the wall's
                            // clock both running. Read twice with 1.5 s between, her last words opened after the second read on a slow
                            // machine and stayed open: she never went, and every talk after it was shut out: issue 211)
                            for (let t0 = Date.now(); Date.now() - t0 < 120000;) {
                              await through();
                              if (await p.evaluate(() => window.__game.walkLine().gate === 'going')) break;
                              await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 4 && !g.dlg.open; i++) g.frame(0.05); });
                              await p.waitForTimeout(250);
                            }
                            await shot('4b-goes');
                            const gone = await p.waitForFunction(() => window.__game.walkLine().w === 'gone', null, { timeout: 600000, polling: 500 }).then(() => true, () => false);
                            const hid = await p.evaluate(() => { const n = window.__game.npcById('nagi'); return !!n.away && !n.rig.root.visible; });
                            if (!gone || !hid) fail(`she does not go (${JSON.stringify(await line())}, hidden ${hid})`);
                            else ok('she took yours, went in along the walkway, turned round, and is gone');
                            await p.evaluate(c => { const g = window.__game; g.setClock(...c); g.spawn([376.9, -1013.1]); }, clockWas); // (and back where the walk sets out: from the station's side the next beat's camera stood in its pillars)
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      await p.evaluate(() => { const t = window.__game.walkTalk(); if (t) t.startAt('hachiko'); }); // (Mei's turn: the walk's line before hers told)
      // (Mei and Riko drawn first: a character's pictures go to the GPU a frame at a time, minutes on a software renderer)
      const drawn = await p.waitForFunction(() => window.__game.npcs.filter(n => n.id === 'mei' || n.id === 'riko').every(n => !n.rig.pending), null, { timeout: 600000, polling: 1000 }).then(() => true, () => false);
      if (!drawn) fail('Mei and Riko are not drawn ten minutes after setting out');
      if (!(await talk('mei', 14))) fail('no Mei on the walk (game.json npcs: mei)');
      else {
        await p.evaluate(() => { const g = window.__game, n = g.npcs.find(q => q.id === 'mei'); g.cam.yaw = Math.atan2(n.x - g.player.x, n.y - g.player.y); for (let i = 0; i < 8; i++) g.frame(0.05); });
        await p.waitForFunction(() => [...document.querySelectorAll('.g-walk-mark')].some(e => +e.style.opacity > 0.3 && e.dataset.k === 'story'), null, { timeout: 90000, polling: 500 }).catch(() => {}); // (the mark that is judged, not any mark: a seat's may be up already)
        const mk = await p.evaluate(() => [...document.querySelectorAll('.g-walk-mark')].filter(e => +e.style.opacity > 0.3).map(e => e.dataset.k));
        if (!mk.includes('story')) fail(`fourteen metres from Mei, no amber speech mark over anyone (kept off the words: ${await p.evaluate(() => window.__marksWords || 'none')}; ${JSON.stringify(mk)}; ${JSON.stringify(await p.evaluate(() => { const g = window.__game, t = g.walkTalk(), n = g.npcs.find(q => q.id === 'mei'); return { want: t.want('mei'), dlg: g.dlg.open, photo: g.photo.on, mode: g.player.mode, d: Math.hypot(n.x - g.player.x, n.y - g.player.y).toFixed(1), seen: !!n.rig.root.visible, stage: document.getElementById('game-stage').className }; }))})`);
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
              if (n.done !== 2) fail(`Mei's story told to its end, but ${n.done} of ${n.of} are put away`); // (hers, and the walk's line before it)
              else if (!/Which Hachiko/.test(told)) fail(`Mei's story told, but its name is not put up ("${told}")`);
              else ok(`told: "${told}"`);
              await p.addStyleTag({ content: '#g-walk-told { transition: none !important; }' }); // (its fade is the compositor's, and a software renderer's page has no frame to give it)
              await shot('4e-told');
            }
          }
        }
      }
      await p.evaluate(() => { const t = window.__game.walkTalk(); if (t) t.reset(); });
      // a street moment (walktalk.js events): Ren, lost, asks the way to SHIBUYA SKY; the answers are choices, and the
      // right one is thanked
      const started = await p.evaluate(() => window.__game.walkTalk().events.start('way-sky', 0));
      if (!started) fail('a street moment (way-sky) could not be put on the street');
      else {
        // (he walks in to his corner from out of sight: his steps are the walk's own frames', run here as a player's would be)
        const walkedIn = await p.evaluate(() => { const g = window.__game, t = g.walkTalk(), was = t.events.moving; for (let i = 0; i < 120 && t.events.moving; i++) t.tick(0.25, false); return { was, now: t.events.moving }; });
        if (!walkedIn.was) console.log('(no clear way in for Ren from out of sight here: he stands at his corner)');
        else if (walkedIn.now) fail('Ren walking in to his corner never arrives');
        else ok('Ren walks in to his corner from out of sight');
        const drawnRen = await p.waitForFunction(() => { const n = window.__game.npcs.find(q => q.id === 'ren'); return n && !n.rig.pending && n.rig.root.visible; }, null, { timeout: 600000, polling: 1000 }).then(() => true, () => false);
        if (!drawnRen) fail('Ren is not drawn ten minutes after his street moment began');
        else {
          await talk('ren', 1.6);
          if (!(await waitPrompt(/Talk to Ren/))) fail(`beside Ren, nothing offers to talk ("${await prompt()}")`);
          else {
            await act();
            await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 6 && !g.dlg.hasChoices; i++) g.dlg.next(false); });
            const chs = await p.evaluate(() => [...document.querySelectorAll('#gd-choices button')].map(b => b.textContent));
            if (chs.length < 2) fail(`Ren asks the way, but there are no answers to choose (${JSON.stringify(chs)})`);
            else {
              await shot('4f-street');
              // (a phone's answer is tapped once its button has stopped sliding in: a tap at where it was going missed, the talk
              // stayed open, and every prompt after it read "" on a phone, main's walk2 on 6b0d8ee. Where a tap does not take,
              // which kind of miss it was is said: a tap outside the box as it then stood is the harness's, and is tapped
              // again once; one inside it the game did not take, as a player's would not be, and fails)
              if (phone) {
                const box = () => p.evaluate(() => { const r = document.querySelector('#gd-choices button').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
                const still = () => p.evaluate(async () => { let a = null; for (let i = 0; i < 20; i++) { const r = document.querySelector('#gd-choices button').getBoundingClientRect(), k = `${r.x.toFixed(0)},${r.y.toFixed(0)}`; if (k === a) return; a = k; await new Promise(o => setTimeout(o, 150)); } });
                for (let n = 0; n < 2; n++) {
                  // (and not before the answers have been up 350 ms of the page's clock: hud.js lets no tap choose sooner, so
                  // that a tap meant for the line before is not taken as an answer. A tap at once on a box already still
                  // was dropped by it, and failed as the game's on main's walk2, 04d6cc4)
                  await still(); await p.waitForTimeout(500);
                  const r0 = await box(), tx = r0.x + r0.w / 2, ty = r0.y + r0.h / 2;
                  await p.touchscreen.tap(tx, ty); await p.waitForTimeout(1500);
                  if (!(await p.evaluate(() => window.__game.dlg.hasChoices))) break;
                  const r1 = await box(), inside = tx >= r1.x && tx <= r1.x + r1.w && ty >= r1.y && ty <= r1.y + r1.h;
                  if (inside) { fail(`Ren asks the way: a tap on the answer inside its box (${tx.toFixed(0)}, ${ty.toFixed(0)}) was not taken by the game`); break; }
                  console.log(`(the answer's box moved from (${r0.x.toFixed(0)}, ${r0.y.toFixed(0)}) to (${r1.x.toFixed(0)}, ${r1.y.toFixed(0)}) under the tap: tapped again)`);
                  if (n === 1) fail('Ren asks the way: the answer\'s box would not stand still to be tapped');
                }
              } else await p.keyboard.press('Digit1');
              await through();
              const done = await p.evaluate(() => window.__game.walkTalk().events.done);
              if (done !== 1) fail(`the right way given to Ren, ${done} favours done`);
              else {
                const off = await p.evaluate(() => window.__game.walkTalk().events.moving);
                if (!off) fail('Ren thanked, he does not walk off (no clear way 14 or 26 m from his corner)');
                else ok(`a street moment: Ren asks the way ("${chs[0].slice(1, 40)}" chosen), is thanked, and walks off`);
              }
            }
          }
        }
      }
    }
    if (PART === 2) { await pace(); await b.close(); console.log(errors.length ? `FAIL ${errors.length}` : 'ok   the walk\'s second part: its line, Nagi\'s wait, Mei and Riko, and Ren asking the way'); process.exit(errors.length ? 1 : 0); }
    const haveCar = await p.waitForFunction(() => !!window.__game.myCar(), null, { timeout: 300000, polling: 1000 }).then(() => true, () => false);
    if (!haveCar) fail('no car of your own on the walk (five minutes after setting out)');
    else {
      // beside its driver's door, at the kerb it waits at
      await p.evaluate(() => { const g = window.__game, st = g.myCar().D.st, fx = Math.sin(st.h), fy = Math.cos(st.h); g.player.x = st.x - fy * 2.1; g.player.y = st.y + fx * 2.1; g.player.z = st.z; g.player.speed = 0; });
      if (!(await waitPrompt(/Drive your car/))) fail(`beside your car on the walk, nothing offers to drive it ("${await prompt()}")`);
      else {
        // (the press is the game's at once, its prompt the page's at the next frame drawn, seconds later on a software
        // renderer: a passer-by to talk to, a seat, or the quiet after a talk ended (hud.js) can take the press by then.
        // When something else took it, that is said and E pressed again with the car's prompt up; one the car's own
        // prompt was given and not taken fails)
        const quiet = await p.evaluate(() => !!window.__game.dlg.quiet);
        await act();
        const went = await p.evaluate(() => { const g = window.__game, d = g.dlg, w = d.open ? 'a talk' : g.player.mode === 'seat' ? 'a seat' : ''; if (d.open) d.quit(); return w; }) || (quiet ? 'the quiet after a talk' : '');
        if ((await mode()) !== 'car' && went) {
          console.log(`(E by your car went to ${went}; pressed again)`);
          if (await p.evaluate(() => window.__game.player.mode === 'seat')) { await act(); await p.waitForTimeout(600); }
          if (await waitPrompt(/Drive your car/)) await act();
        }
        if ((await mode()) !== 'car') fail(`E (or a tap) by your car: not at the wheel (${await mode()}; the prompt "${await prompt()}", the game's "${await p.evaluate(() => { const a = window.__game.currentAction(); return a ? a.text : ''; })}")`);
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
      // (waited for, not read 0.8 s on: put down there out of the car, the corner's buttons are the page's next frames' to
      // lay out, seconds on a software renderer; read at once it was not there yet, and pressed a beat later it was, main's
      // walk3 on beb0fdb)
      if (!(await shown('#g-walk-acts [data-do="car"]'))) fail('on foot, the walk\'s corner has no Your car button');
      else {
        await press('#g-walk-acts [data-do="car"]');
        const c0 = await p.evaluate(() => { const g = window.__game, s = g.myCar().D.st; return [s.x, s.y]; });
        await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 120; i++) g.frame(0.05); });
        if (await p.evaluate(() => window.__game.carComing())) fail('Your car: still pulling in after six seconds');
        const c1 = await p.evaluate(() => { const g = window.__game, s = g.myCar().D.st; return { xy: [s.x, s.y], d: Math.hypot(s.x - g.player.x, s.y - g.player.y) }; });
        if (c1.d > 45) fail(`Your car: it stopped ${c1.d.toFixed(0)} m away`);
        else ok(`Your car: ${Math.hypot(c1.xy[0] - c0[0], c1.xy[1] - c0[1]) > 3 ? `pulled in ${Math.hypot(c1.xy[0] - c0[0], c1.xy[1] - c0[1]).toFixed(0)} m up the kerb` : 'at the kerb (no room to come from)'}, ${c1.d.toFixed(0)} m from you`);
        // (more than a few steps off, the way to it, and one guide to it at a time: its own mark over it while it is in the
        // picture, or else a line of its own in the corner, the car's, not the errand's amber one, with its metres and its
        // arrow; never both (the owner's phone, 27 Nov: two teal boxes). Waited for, both being the page's own frames to
        // draw: game.js carAim, carMark)
        if (c1.d > 7) {
          const cl = await p.waitForFunction(() => {
            const e = document.querySelector('#g-walk-where .c'), mk = document.querySelector('#g-car-mark.on');
            const line = e && !e.hidden && /your car/i.test(e.textContent) && /\d+ m/.test(e.textContent) && e.querySelector('.dir');
            const mark = mk && /\d+ m/.test(mk.textContent);
            return line && mark ? 'BOTH' : line ? `the corner's own line says "${e.textContent.replace(/^Your car/i, 'Your car ')}"` : mark ? `its own mark over it says "${mk.textContent}"` : null;
          }, null, { timeout: 90000, polling: 250 }).then(h => h.jsonValue()).catch(() => null);
          if (!cl) fail(`Your car: ${c1.d.toFixed(0)} m off, neither its mark nor a line of its own in the corner shows the way to it`);
          else if (cl === 'BOTH') fail('Your car: two guides to it at once, its mark over it and the corner\'s line');
          else ok(`Your car: ${cl}`);
        }
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
    // SKY GATE: in its hall (a hero level open to the sky: its floor, its two lifts and their shaft), E or a tap takes the
    // lift, watched from outside the tower as it climbs (game.js rideLift; the owner found the ride in the dark odd and the
    // tower climbed from outside the better, November 2026), out at the top stop
    const lobby = await p.evaluate(() => { const g = window.__game, l = (g.G.lifts || []).find(q => q.id === 'sky-gate'), s = l && l.stops[0]; if (!s) return null; const [ax, ay, az] = s.at, [dx, dy] = s.door || s.at, n = Math.hypot(ax - dx, ay - dy) || 1; g.player.x = ax - (ax - dx) / n * 1.2; g.player.y = ay - (ay - dy) / n * 1.2; g.player.z = az; g.player.h = Math.atan2(ax - dx, ay - dy); g.player.speed = 0; return { top: l.stops[l.stops.length - 1].at[2], street: az }; });
    if (!lobby) fail('no SKY GATE lift (game.json lifts "sky-gate") on the map');
    else if (!(await waitPrompt(/lift/i))) fail(`in SKY GATE's lobby on the walk, nothing offers the lift ("${await prompt()}")`);
    else {
      // (the hall is a hero level of its own, cities/shibuya/hero_skylobby.py: loaded and shown round you, its floor stood on)
      const hall = await p.evaluate(async () => { const g = window.__game, H = g.hero && g.hero(); for (let i = 0; i < 480; i++) { const L = H && H.levels.find(q => q.h.id === 'skylobby'); if (L && L.state === 'ready' && L.h.shown) break; await new Promise(r => setTimeout(r, 250)); } /* (two minutes: a level fetched as you are put by it compiles its shaders on a software renderer for most of one) */ const L = H && H.levels.find(q => q.h.id === 'skylobby'); return L ? { state: L.state, shown: !!L.h.shown, feet: +(g.player.z - (g.nav.terrain(g.player.x, g.player.y) + g.nav.lift(g.player.x, g.player.y))).toFixed(3), floor: L.h.z } : null; });
      if (!hall) fail('SKY GATE\'s hall: no hero level "skylobby" on the map');
      else if (hall.state !== 'ready' || !hall.shown) fail(`SKY GATE's hall is not drawn round you in its lobby (${JSON.stringify(hall)})`);
      else ok(`SKY GATE's hall drawn round you in its lobby (${JSON.stringify(hall)})`);
      // (the view comes round to the lift as its offer comes up, once no hand has been on it for a second: game.js, the
      // prompt's lift. Given up to six seconds of frames, simulation and camera together (advance() moves the world and
      // left the camera most of a turn behind), until the turn is done, and half a second more)
      const hallView = await p.evaluate(() => { const g = window.__game, l = g.G.lifts.find(q => q.id === 'sky-gate'), s = l.stops[0], want = Math.atan2(s.at[0] - s.door[0], s.at[1] - s.door[1]); let i = 0; for (; i < 120; i++) { g.frame(0.05); if (g.cam.yawTo == null && Math.abs(Math.atan2(Math.sin(g.cam.yaw - want), Math.cos(g.cam.yaw - want))) < 0.1) break; } for (let k = 0; k < 10; k++) g.frame(0.05); return { yaw: +g.cam.yaw.toFixed(2), want: +want.toFixed(2), yawTo: g.cam.yawTo, idle: +(g.t() - g.cam.lastInput).toFixed(1), s: +((i + 1) * 0.05).toFixed(2) }; });
      await shot('7a-hall');
      // (and the hall is a picture, not one flat tone from edge to edge: issue 144)
      // (0.6: the lacquered wall across the frame under a strip of the deck was 0.73 of it one tone, and passed at 0.85.
      // A flat frame is kept, whatever STILLS says, with where the camera and the level stood, and taken again after three
      // seconds of whole frames: main's checks found it flat on a phone's page now and then, which no run here has shown,
      // and the still is what tells a level still arriving from a picture that is wrong)
      const hallPng = () => p.screenshot({ timeout: 120000 });
      let hallTone = await tones(p, await hallPng()), hallFlat = flat(hallTone, 0.6);
      if (hallFlat) {
        const where = await p.evaluate(() => { const g = window.__game, c = g.camera.position, pl = g.player, H = g.hero && g.hero(), L = H && H.levels.find(q => q.h.id === 'skylobby'); return { cam: [c.x, -c.z, c.y].map(v => +v.toFixed(2)), at: [pl.x, pl.y, pl.z].map(v => +v.toFixed(2)), pull: +(g.cam.pull || 0).toFixed(2), dist: +g.cam.dist.toFixed(2), level: L ? { state: L.state, shown: !!(L.root && L.root.visible), steps: L.steps } : null }; });
        require('fs').writeFileSync(`${out}/${phone ? 'phone' : 'desk'}-7a-hall-flat.png`, await hallPng());
        console.log(`(the hall's frame is flat at first: ${hallFlat}; ${JSON.stringify(where)}; kept as ${phone ? 'phone' : 'desk'}-7a-hall-flat.png, taken again after three seconds)`);
        await p.evaluate(async () => { const g = window.__game; for (let k = 0; k < 60; k++) { g.frame(0.05); if (k % 6 === 5) await new Promise(r => requestAnimationFrame(r)); } });
        hallTone = await tones(p, await hallPng()); hallFlat = flat(hallTone, 0.6);
      }
      if (hallFlat) fail(`SKY GATE's hall: the frame is one flat tone (${hallFlat}; the view ${JSON.stringify(hallView)}; the still: ${phone ? 'phone' : 'desk'}-7a-hall-flat.png)`);
      else ok(`SKY GATE's hall: a picture (luma sd ${hallTone.sd}, ${Math.round(hallTone.share * 100)}% its commonest tone)`);
      await act();
      await p.evaluate(() => window.__game.advance(4.5)); // (the shot eases off from your shoulder: by now it is well up the face, turned out to the city)
      const mid = await p.evaluate(() => { const g = window.__game, c = g.camera.position, x = c.x, y = -c.z, z = c.y; return { z: +z.toFixed(1), inside: !!g.nav.col.overlap(x, y, 0.3, z - 0.3, z + 0.3), riding: !!g.cine.active }; });
      await shot('7b-climb');
      const climbTone = await tones(p, await p.screenshot({ timeout: 120000 })), climbFlat = flat(climbTone);
      if (climbFlat) { require('fs').writeFileSync(`${out}/${phone ? 'phone' : 'desk'}-7b-climb-flat.png`, await p.screenshot({ timeout: 120000 })); fail(`SKY GATE: mid-ride the frame is one flat tone (${climbFlat}; the camera at ${await p.evaluate(() => { const c = window.__game.camera.position; return JSON.stringify([c.x, -c.z, c.y].map(v => +v.toFixed(1))); })}; the still: ${phone ? 'phone' : 'desk'}-7b-climb-flat.png)`); }
      // (the rest of the climb a quarter of a second at a time: the camera rises, and never by a jump. It was put on the
      // tower's roof for a frame when the shot's roofline clamp caught it beside the shaft)
      const rise = await p.evaluate(() => { const g = window.__game; let z = g.camera.position.y, jump = 0, drop = 0; for (let i = 0; i < 60 && g.cine.active; i++) { g.advance(0.25); const y = g.camera.position.y; jump = Math.max(jump, y - z); drop = Math.max(drop, z - y); z = y; } return { jump: +jump.toFixed(1), drop: +drop.toFixed(1) }; });
      if (rise.jump > 25 || rise.drop > 8) fail(`SKY GATE: the climb's camera jumps (${JSON.stringify(rise)} m in a quarter of a second)`);
      const top = await p.evaluate(() => window.__game.player.z);
      if (!mid.riding || mid.z < lobby.street + 20 || mid.inside) fail(`SKY GATE: mid-ride the camera is not climbing outside the tower (${JSON.stringify(mid)})`);
      else if (top < lobby.top - 3) fail(`SKY GATE: the ride ended at ${top.toFixed(0)} m, not the top stop (${lobby.top.toFixed(0)} m)`);
      else ok(`SKY GATE: watched from outside the tower, the camera at ${mid.z} m mid-ride, out at ${top.toFixed(0)} m`);
    }
    // Taro's story (walktalk.js "Above the crossing"): on the roof he asks for the crossing photographed from the
    // helicopter, and a photograph from the roof on foot is not it
    // (his talk as a player has it: beside him on the roof, on the deck's side, and the conversation's camera on his first
    // line. Issue 145: no still was taken of it, and the stills of the walk's people had looked at him from the street
    // 226 m below. The shot the game cut to says where his face is in the frame, game.js talkCam.log: it is in front of
    // the lens, inside the frame and over the words, with no wall or body before it and the lens in no wall)
    const taroShot = await p.evaluate(async () => {
      const g = window.__game, T3 = window.THREE, t = g.walkTalk(), n = g.npcs.find(q => q.id === 'taro');
      if (!t || !n) return { err: 'no Taro on the walk' };
      t.startAt('air'); // (his turn in the walk's line: every story before his told)
      let at = null;
      for (const da of [0, Math.PI, Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4]) {
        const x = n.x + Math.sin(n.h + da) * 1.6, y = n.y + Math.cos(n.h + da) * 1.6;
        if (!g.nav.walk(x, y, n.z, true).ok || !g.nav.room(x, y, n.z, 0.35) || !g.nav.floorAt(x, y, n.z + 1)) continue;
        if (g.nav.clearFraction(new T3.Vector3(x, n.z + 1.55, -y), new T3.Vector3(n.x, n.z + 1.55, -n.y)) < 0.99) continue;
        at = [x, y]; break;
      }
      if (!at) return { err: 'nowhere on the roof to stand beside Taro' };
      const pl = g.player; pl.x = at[0]; pl.y = at[1]; pl.z = n.z; pl.vz = 0; pl.speed = 0; pl.ground = true; pl.h = Math.atan2(n.x - pl.x, n.y - pl.y); g.cam.snap = true;
      g.advance(0.3);
      const n0 = g.talkCam ? g.talkCam.log.length : 0;
      if (!t.talk(n)) return { err: 'Taro has nothing to say' };
      for (let i = 0; i < 40; i++) { g.frame(0.05); await new Promise(r => requestAnimationFrame(r)); }
      const L = g.talkCam && g.talkCam.log.length > n0 ? g.talkCam.log[g.talkCam.log.length - 1] : null;
      return L ? { kind: L.kind, x: L.x, y: L.y, front: L.front, block: L.block || null, inWall: !!L.inWall, panel: L.panel || 0 } : { err: 'the talk cut to no shot of its own' };
    });
    if (taroShot.err) fail(`on the roof, Taro's talk: ${taroShot.err}`);
    else {
      await p.waitForTimeout(1500);
      await shot('8-taro-talk');
      const T = taroShot, low = -1 + 2 * T.panel; // (the foot of the picture left over the words, in the frame's own -1 to 1)
      if (!T.front || Math.abs(T.x) > 0.92 || T.y > 0.92 || T.y < low || T.block || T.inWall) fail(`on the roof, Taro's talk: his head is not in the frame over the words (${JSON.stringify(T)})`);
      else ok(`on the roof, Taro's talk: his face in the frame at ${T.x}, ${T.y}, over the words (${T.kind})`);
    }
    const taroAsked = await p.evaluate(() => {
      const g = window.__game, t = g.walkTalk(), n = g.npcs.find(q => q.id === 'taro');
      if (!t || !n) return 'no Taro on the walk';
      if (!g.dlg.open) { t.startAt('air'); if (!t.talk(n)) return 'Taro has nothing to say'; } // (his turn in the walk's line: every story before his told)
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
        const overCrossing = () => p.evaluate(() => {
          const g = window.__game, s = g.heli.st, was = { x: s.x, y: s.y, z: s.z };
          Object.assign(s, { x: 368, y: -1016, z: 15 + 130 });
          for (const k of ['vx', 'vy', 'vz', 'speed']) if (k in s) s[k] = 0;
          for (let i = 0; i < 3; i++) g.frame(0.05);
          g.photoMode(true); Object.assign(g.photo, { az: 0, pitch: 1.35, dist: 45 });
          return was;
        });
        // (the photo camera over the crossing before the release: what the photograph is judged by, read from the camera
        // itself, not from its matrix reading alike over six of the display's frames: issues 142 and 153)
        const atPose = () => until(() => { const g = window.__game, c = g.camera, f = g.photo.focus, e = c.matrixWorld.elements; return g.photo.on && Math.abs(Math.hypot(e[12] - f.x, e[13] - f.y, e[14] - f.z) - g.photo.dist) < 1.5 && e[13] - f.y > 35; }, null, 90000);
        const sixAlike = async () => { await p.waitForFunction(() => window.__game.camera.position.y > 120, null, { timeout: 90000, polling: 500 }).catch(() => {}); await p.evaluate(() => new Promise(r => { const c = window.__game.camera; let was = null, same = 0, n = 0; const f = () => { const now = c.matrixWorld.elements.map(v => v.toFixed(3)).join(); same = now === was ? same + 1 : 0; was = now; if (same >= 6 || ++n > 900) r(); else requestAnimationFrame(f); }; requestAnimationFrame(f); })); };
        // the shutter, with what the page was doing as it was released and whether the crossing is in the photograph: a
        // photograph that is not Taro's says why in its own line
        const release = () => p.evaluate(() => {
          const g = window.__game, T = window.THREE, c = g.camera, why = { photo: g.photo.on, talk: !!(g.dlg && g.dlg.open), film: !!(g.cine && g.cine.active), mode: g.player.mode };
          g.snapPhoto();
          const F = new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse)), e = c.matrixWorld.elements, f = g.photo.focus, s = g.heli.st;
          Object.assign(why, { sees: F.containsPoint(new T.Vector3(368, 15, 1002)), lens: [e[12], -e[14], e[13]].map(v => +v.toFixed(1)), focus: [f.x, -f.z, f.y].map(v => +v.toFixed(1)), heli: [s.x, s.y, s.z].map(v => +v.toFixed(1)) });
          g.photoMode(false);
          const st = g.walkTalk().state(), er = g.walkTalk().errand();
          return { met: !!(st.air && st.air.met), errand: er ? er.text : '', why };
        });
        const back = await overCrossing();
        if (!(await atPose())) fail('over the crossing with the camera up, photo mode\'s camera did not come to the pose asked for in 90 s');
        await shot('7d-air-photo');
        const aerial = await release();
        if (!aerial.met) fail(`over the crossing in the helicopter, a photograph of it does not meet what Taro asked (${JSON.stringify(aerial.why)})`);
        else if (!/Back to Taro/.test(aerial.errand)) fail(`the aerial photograph taken, the corner does not send you back to Taro ("${aerial.errand}")`);
        else ok(`a photograph of the crossing from the helicopter: "${aerial.errand}"`);
        // AIR_N=n: the same photograph n times more, to say how often it misses (AIR_WAIT=six: after the wait the check
        // had, the lens's matrix alike over six frames; pose, the default: after the pose is reached; none: at once)
        if (+process.env.AIR_N) {
          const N = +process.env.AIR_N, W = process.env.AIR_WAIT || 'pose'; let miss = 0;
          for (let i = 0; i < N; i++) {
            await p.waitForTimeout(300 + (i % 7) * 130);
            await overCrossing();
            if (W === 'six') await sixAlike(); else if (W === 'pose') await atPose();
            const r = await release();
            if (!r.why.sees) { miss++; console.log(`  (${i + 1}: the crossing is not in the photograph: ${JSON.stringify(r.why)})`); }
          }
          (miss ? fail : ok)(`${N - miss} of ${N} more photographs from the helicopter have the crossing in them (AIR_WAIT=${W})`);
        }
        await p.evaluate(was => { const g = window.__game, s = g.heli.st; Object.assign(s, { x: was.x, y: was.y, z: was.z }); for (const k of ['vx', 'vy', 'vz', 'speed']) if (k in s) s[k] = 0; g.frame(0.05); }, back);
        await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 60 && !g.heli.st.landed; i++) g.advance(0.5, ['KeyC']); g.advance(1); });
        if (!(await waitPrompt(/Get out/))) fail(`landed, nothing offers to get out of the helicopter ("${await prompt()}")`);
        else { await act(); await p.evaluate(() => window.__game.advance(3)); if ((await mode()) !== 'foot') fail(`out of the helicopter: still ${await mode()}`); else ok('landed and climbed out'); }
      }
    }
  }
  await pace();
  { // the camera's window in nobody's body, every frame of the walk so far, on foot, by car and in the helicopter (issue 226)
    const ci = require('./cam_intrude'), R = process.env.CAM_IN !== '1' ? { off: true } : await ci.report(p), { errs } = R.off ? { errs: [] } : ci.print(R);
    if (!R.off && (!R || R.err)) fail(`cam: the window was not measured (${R ? R.err : 'not in the page'})`);
    for (const e of errs) fail(`cam: ${e}`);
  }
  // from the story's last card: the page again, straight out on the walk
  if (!phone && !process.env.NO_END) {
    await p.evaluate(() => { sessionStorage.setItem('bh-walk-auto', JSON.stringify({ t: 'night', w: 'clear' })); });
    expectReload(p, "the last card's Walk Shibuya"); await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
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
  if (!process.env.NO_TITLE) await titleBack();
  console.log(errors.length ? `FAIL ${errors.length}` : 'ok   the walk: two ways in, its hour and sky, out on the street with nothing of the story or the old game');
  await b.close();
  process.exit(errors.length ? 1 : 0);
})();
