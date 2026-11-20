// Who you play, on the story's title (web/index.html #gt-who, game.js whoAsk, whoPick): Kagami as a woman or a man, on
// a screen of its own. Opens the page as someone who has never played (nothing kept in this browser), and as a hand
// would: the press passed by a key or a tap, the buttons pressed with the mouse or a tap, Enter, the arrows. It fails if
// the first press of a way in begins without bringing who you play up, if the portraits are not both shown or the file
// on Kagami is not, if Confirm with none chosen goes on, if a portrait chosen is not who you then are (the rig's
// character), is not kept or does not set the file's lines, if Confirm after the choice does not take the way in asked
// for, or if the page opened again asks again or does not name the choice under the menu. Stills of each screen.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/title_who.js out_dir [WxH]          (390x844: a phone, by touch)
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/title-who', size = '1440x900'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number), phone = w < 500;
  const args = process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
  const p = await ctx.newPage();
  const errors = [];
  const fail = m => { errors.push(m); console.log(`FAIL ${m}`); };
  p.on('pageerror', e => fail(`pageerror: ${String(e).slice(0, 200)}`));
  fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(t => { try { localStorage.setItem('oe3d-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  const title = async () => {
    await p.goto(`http://localhost:${process.env.PORT || 8800}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden && getComputedStyle(t).opacity > 0.9; }, null, { timeout: 900000, polling: 500 });
    await p.waitForTimeout(2500); // (the card's parts slide in)
  };
  const state = () => p.evaluate(() => {
    const g = window.__game, who = document.getElementById('gt-who');
    return { title: !document.getElementById('g-title').hidden, shown: !!who && !who.hidden && who.offsetParent !== null,
      tiles: [...document.querySelectorAll('#gt-who .gt-who-row [data-c]')].map(x => [x.dataset.c, x.getAttribute('aria-checked'), x.querySelector('img').naturalWidth > 0]),
      ask: (document.querySelector('#gt-who .gt-who-ask') || {}).textContent || '', choose: document.getElementById('g-title').hasAttribute('data-choose'),
      kept: (() => { try { return localStorage.getItem('oe3d-player'); } catch (e) { return 'blocked'; } })(), rig: g && g.player && g.player.rig ? g.player.rig.character : null };
  });
  const press = async sel => { const r = await p.locator(sel).boundingBox(); if (!r) return fail(`${sel}: not on the screen`); const x = r.x + r.width / 2, y = r.y + r.height / 2; if (phone) await p.touchscreen.tap(x, y); else await p.mouse.click(x, y); };
  const shot = n => p.screenshot({ path: `${out}/${n}.png`, timeout: 120000 }).catch(() => console.log(`(no still ${n})`));
  // someone who has never played: nothing kept
  await p.addInitScript(() => { if (!sessionStorage.getItem('tw-once')) { sessionStorage.setItem('tw-once', '1'); try { localStorage.removeItem('oe3d-player'); } catch (e) { /* storage blocked */ } } });
  const screen = () => p.evaluate(() => window.__game.screen());
  // (the press: a key, or on a phone a tap anywhere, opens the menu)
  const toMenu = async () => { if (phone) await p.touchscreen.tap(w / 2, h / 2); else await p.keyboard.press('Enter'); await p.waitForTimeout(1500); if ((await screen()) !== 'menu') fail(`the press did not open the menu (on "${await screen()}")`); };
  const file = () => p.evaluate(() => { const f = document.querySelector('#gt-who .gt-who-file'), seen = e => e && e.offsetParent !== null && getComputedStyle(e).display !== 'none';
    return { name: f.querySelector('.nm').textContent, jp: f.querySelector('.jp').textContent, line: f.querySelector('.line').textContent, facts: [...f.querySelectorAll('.facts > div')].filter(seen).map(d => d.textContent), sub: f.querySelector('.sub').innerText }; });
  await title();
  if ((await screen()) !== 'press') fail(`the title does not open on its press (on "${await screen()}")`);
  await shot('0-press');
  await toMenu();
  let s = await state();
  console.log('first menu:', JSON.stringify(s));
  if (s.shown) fail('who you play is up on the menu before a way in is taken');
  if (!(await p.evaluate(() => document.getElementById('gt-who-line').hidden))) fail('the menu names who you play before one is chosen');
  await shot('1-menu');
  await press('#gt-play'); await p.waitForTimeout(1500);
  s = await state();
  if (!s.title) fail('the first press of the episode began without asking who you play');
  else if (!s.shown || (await screen()) !== 'who') fail('the first press of the episode did not bring who you play up');
  if (s.tiles.length !== 2 || !s.tiles.every(t => t[2])) fail('the two portraits are not both shown');
  if (s.tiles.some(t => t[1] === 'true') || !s.choose) fail('the first time, a portrait is chosen for the player');
  if (!/choose one/i.test(s.ask)) fail(`the first time, who you play does not say to choose ("${s.ask}")`);
  let fl = await file();
  console.log('the file:', JSON.stringify(fl));
  if (!fl.name || !fl.jp || fl.line.length < 40 || fl.facts.length < 2) fail(`the file on Kagami is not shown whole: ${JSON.stringify(fl)}`);
  await shot('2-who');
  await press('#gt-who-go'); await p.waitForTimeout(800);
  s = await state();
  if (!s.title || (await screen()) !== 'who') fail('Confirm with none chosen left who you play');
  else if (!/first/i.test(s.ask)) fail(`Confirm with none chosen did not ask ("${s.ask}")`);
  if (!phone) { // (the hand is on the first portrait: Enter chooses it, and only that)
    await p.keyboard.press('Enter'); await p.waitForTimeout(600);
    s = await state();
    if (!s.title || (await screen()) !== 'who') fail('Enter on a portrait left who you play');
    else if (s.kept !== 'W') fail(`Enter on the first portrait did not choose it (${s.kept})`);
  }
  await press('#gt-who .gt-who-row [data-c="M"]');
  await p.waitForFunction(() => window.__game.player.rig.character && /M/.test(window.__game.player.rig.character) && document.querySelector('#gt-who .gt-who-row [data-c="M"]').getAttribute('aria-checked') === 'true', null, { timeout: 600000, polling: 250 }).catch(() => fail('chose the man, and the rig is not his'));
  s = await state();
  console.log('chosen:', JSON.stringify(s));
  if (s.kept !== 'M') fail(`the choice is not kept (${s.kept})`);
  if (!/M/.test(s.rig || '')) fail(`chose the man, and the rig is ${s.rig}`);
  if (s.choose || s.ask) fail('chosen, and who you play still asks');
  fl = await file();
  if (!/a man/i.test(fl.sub) || !fl.facts.some(t => /chore jacket/.test(t)) || fl.facts.some(t => /turtleneck/.test(t))) fail(`chose the man, and the file does not say his lines: ${JSON.stringify(fl)}`);
  if (!phone) { // (the arrows choose too)
    await p.keyboard.press('ArrowLeft'); await p.waitForFunction(() => document.querySelector('#gt-who .gt-who-row [data-c="W"]').getAttribute('aria-checked') === 'true', null, { timeout: 120000 }).catch(() => fail('the left arrow did not choose the woman'));
    await p.keyboard.press('ArrowRight'); await p.waitForFunction(() => document.querySelector('#gt-who .gt-who-row [data-c="M"]').getAttribute('aria-checked') === 'true', null, { timeout: 120000 }).catch(() => fail('the right arrow did not choose the man'));
  }
  await shot('3-chosen');
  await press('#gt-who-go'); await p.waitForTimeout(1800);
  if ((await state()).title) fail('chosen and confirmed, the episode it was asked for did not begin');
  // the page opened again: the choice stands, named under the menu's list, and nothing is asked
  await title();
  await toMenu();
  s = await state();
  console.log('again:', JSON.stringify(s));
  const line = await p.evaluate(() => { const l = document.getElementById('gt-who-line'); return l.hidden ? null : l.innerText; });
  if (s.kept !== 'M' || s.choose || !s.tiles.some(t => t[0] === 'M' && t[1] === 'true')) fail('opened again, the choice does not stand');
  if (!line || !/a man/i.test(line)) fail(`opened again, the menu does not name who you play ("${line}")`);
  await shot('4-again');
  await press('#gt-play'); await p.waitForTimeout(1500);
  if ((await state()).title) fail('opened again, the episode did not begin at once');
  // a case left going by someone who never chose (before the title asked): the evening again and Continue wait too
  await p.evaluate(() => { try { localStorage.setItem('oe3d-player', ''); localStorage.setItem('oe-story-late', JSON.stringify({ fi: 2, left: 5, prints: [{ src: null, stamp: '17:14', cap: '' }, { src: null, stamp: '17:19', cap: '' }] })); } catch (e) { /* storage blocked */ } });
  await title();
  await toMenu();
  if (await p.locator('#gt-anew').count()) {
    await press('#gt-anew'); await p.waitForTimeout(1200);
    if (!(await state()).title || (await screen()) !== 'who') fail('the evening again began without asking who you play');
    await press('#gt-who-back'); await p.waitForTimeout(1000);
    if (!(await state()).title || (await screen()) !== 'menu') fail('Back on who you play did not give the menu back');
  } else fail('a case going: no button for the evening again');
  await press('#gt-play'); await p.waitForTimeout(1200);
  if (!(await state()).title || (await screen()) !== 'who') fail('a case going, never chosen: Continue began without asking');
  await shot('5-going-asked');
  console.log(errors.length ? `FAIL ${errors.length}` : 'ok   who you play is asked on its own screen the first time, kept, named under the menu, and changed there');
  await b.close();
  process.exit(errors.length ? 1 : 0);
})();
