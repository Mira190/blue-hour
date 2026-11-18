// Who you play, on the story's title (web/index.html #gt-who, game.js whoPick): Kagami as a woman or a man. Opens the page
// as someone who has never played (nothing kept in this browser), and as a hand would: the button pressed with the mouse
// or a tap, Enter, the arrows. It fails if the first press begins without asking, if the portraits are not both shown,
// if a portrait chosen is not who you then are (the rig's character) or is not kept, if a press after the choice does
// not begin, or if the page opened again asks again. Stills of the title before and after the choice.
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
      tiles: [...document.querySelectorAll('#gt-who [data-c]')].map(x => [x.dataset.c, x.getAttribute('aria-checked'), x.querySelector('img').naturalWidth > 0]),
      ask: (document.querySelector('#gt-who .gt-who-ask') || {}).textContent || '', choose: document.getElementById('g-title').hasAttribute('data-choose'),
      kept: (() => { try { return localStorage.getItem('oe3d-player'); } catch (e) { return 'blocked'; } })(), rig: g && g.player && g.player.rig ? g.player.rig.character : null };
  });
  const press = async sel => { const r = await p.locator(sel).boundingBox(); if (!r) return fail(`${sel}: not on the screen`); const x = r.x + r.width / 2, y = r.y + r.height / 2; if (phone) await p.touchscreen.tap(x, y); else await p.mouse.click(x, y); };
  const shot = n => p.screenshot({ path: `${out}/${n}.png`, timeout: 120000 }).catch(() => console.log(`(no still ${n})`));
  // someone who has never played: nothing kept
  await p.addInitScript(() => { if (!sessionStorage.getItem('tw-once')) { sessionStorage.setItem('tw-once', '1'); try { localStorage.removeItem('oe3d-player'); } catch (e) { /* storage blocked */ } } });
  await title();
  let s = await state();
  console.log('first title:', JSON.stringify(s));
  if (!s.shown || s.tiles.length !== 2 || !s.tiles.every(t => t[2])) fail('the two portraits are not both shown');
  if (s.tiles.some(t => t[1] === 'true') || !s.choose) fail('the first time, a portrait is chosen for the player');
  await shot('1-first');
  await press('#gt-play'); await p.waitForTimeout(800);
  s = await state();
  if (!s.title) fail('the first press of the button began without asking who you play');
  else if (!s.ask) fail('the first press of the button said nothing');
  await shot('2-asked');
  if (!phone) { await p.keyboard.press('Enter'); await p.waitForTimeout(600); if (!(await state()).title) fail('Enter began without asking who you play'); } // (the hand is on the first portrait: Enter chooses it, and only that)
  await press('#gt-who [data-c="M"]');
  await p.waitForFunction(() => window.__game.player.rig.character && /M/.test(window.__game.player.rig.character) && document.querySelector('#gt-who [data-c="M"]').getAttribute('aria-checked') === 'true', null, { timeout: 600000, polling: 250 }).catch(() => fail('chose the man, and his model did not come in ten minutes'));
  s = await state();
  console.log('chosen:', JSON.stringify(s));
  if (s.kept !== 'M') fail(`the choice is not kept (${s.kept})`);
  if (!/M/.test(s.rig || '')) fail(`chose the man, and the rig is ${s.rig}`);
  if (s.choose || s.ask) fail('chosen, and the title still asks');
  if (!phone) { // (the arrows choose too)
    await p.keyboard.press('ArrowLeft'); await p.waitForFunction(() => document.querySelector('#gt-who [data-c="W"]').getAttribute('aria-checked') === 'true', null, { timeout: 120000 }).catch(() => fail('the left arrow did not choose the woman'));
    await p.keyboard.press('ArrowRight'); await p.waitForFunction(() => document.querySelector('#gt-who [data-c="M"]').getAttribute('aria-checked') === 'true', null, { timeout: 120000 }).catch(() => fail('the right arrow did not choose the man'));
  }
  await shot('3-chosen');
  await press('#gt-play'); await p.waitForTimeout(1500);
  if ((await state()).title) fail('chosen, and the button did not begin');
  // the page opened again: the choice stands, and nothing is asked
  await title();
  s = await state();
  console.log('again:', JSON.stringify(s));
  if (s.kept !== 'M' || s.choose || !s.tiles.some(t => t[0] === 'M' && t[1] === 'true')) fail('opened again, the choice does not stand');
  await shot('4-again');
  await press('#gt-play'); await p.waitForTimeout(1500);
  if ((await state()).title) fail('opened again, the button did not begin');
  console.log(errors.length ? `FAIL ${errors.length}` : 'ok   who you play is asked the first time, kept, and changed on the title');
  await b.close();
  process.exit(errors.length ? 1 : 0);
})();
