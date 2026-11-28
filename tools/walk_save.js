// The walk kept and the walk begun again (web/game/walk.js keptSync, ask, wipe; walktalk.js saved, clear; game.js
// startWalk's Continue, anew), played as a person would on a desktop's page or a phone's, with a still of each screen.
// Fails if:
//   - on a fresh page the walk's way in is not Walk Shibuya, or Start the walk again is offered with nothing to lose;
//   - with Oda's story under way the way in is not Continue the walk with where you were (Mr Oda and what he asked, and
//     how many are told), Start the walk again is not under it, or the step does not say where you were;
//   - Start the walk again does not ask first, or Keep my walk loses anything;
//   - Continue plays the opening flight or the office's call, or does not put a card over the street naming the story
//     and what it asks, or the corner is not Oda's;
//   - the menu's Start the walk again does not ask first, or the second press does not open the page on the walk's step
//     as a first visit: no walk kept, the incident to come, the office's call to come, the views and photographs kept.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/walk_save.js out_dir [WxH]          (390x844: a phone)
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/walk-save', size = '1440x900'] = process.argv;
const PORT = process.env.PORT || 8800;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const [w, h] = size.split('x').map(Number), phone = w < 500, tag = phone ? 'phone' : 'desk';
  const args = process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
  const p = await ctx.newPage();
  const errors = [];
  const fail = m => { errors.push(m); console.log(`FAIL ${m}`); };
  const ok = m => console.log(`ok   ${m}`);
  p.on('pageerror', e => fail(`pageerror: ${String(e).slice(0, 200)}`));
  p.on('crash', () => { console.log('the page crashed'); process.exit(1); });
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); localStorage.setItem('bh-player', 'W'); } catch (e) { /* storage blocked */ } }, process.env.TIER || (phone ? 'low' : 'high'));
  const until = (fn, arg, ms = 60000) => p.waitForFunction(fn, arg, { timeout: ms, polling: 250 }).then(() => true, () => false);
  const press = sel => (phone ? p.tap(sel, { timeout: 60000 }) : p.click(sel, { timeout: 60000 })).catch(e => fail(`${sel} could not be pressed: ${String(e).split('\n')[0]}`));
  const text = sel => p.evaluate(s => { const e = document.querySelector(s); return e && !e.hidden && e.offsetParent ? e.textContent.replace(/\s+/g, ' ').trim() : ''; }, sel);
  const shot = n => p.screenshot({ path: `${out}/${tag}-${n}.png`, timeout: 120000 }).catch(() => console.log(`(no still ${n})`));
  const kept = () => p.evaluate(() => ({ talk: JSON.parse(localStorage.getItem('bh-walk-talk') || '{}'), roll: localStorage.getItem('bh-walk-roll'), intro: localStorage.getItem('bh-walk-intro') }));
  // the title: loaded, past its press, on its menu
  const title = async (reload = true) => {
    if (reload) await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 180000 });
    if (!(await until(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden && getComputedStyle(t).opacity > 0.9; }, null, 15 * 60000))) { fail('the title never came'); await b.close(); process.exit(1); }
    await p.waitForTimeout(2500);
    if (await p.evaluate(() => window.__game.screen() === 'press')) { if (phone) await p.touchscreen.tap(w / 2, h / 2); else await p.keyboard.press('Space'); }
    await until(() => window.__game.screen() === 'menu', null, 20000);
    await p.waitForTimeout(1200);
  };
  const t0 = Date.now(), el = () => `${Math.round((Date.now() - t0) / 1000)}s`;

  // 1. a fresh page: the walk as it was, nothing to begin again
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await p.evaluate(() => { for (const k of ['bh-walk-talk', 'bh-walk-roll', 'bh-walk-intro']) localStorage.removeItem(k); });
  await title();
  { const go = await text('#gt-walk-go'), an = await text('#gt-walk-anew');
    if (!/^Walk Shibuya/.test(go) || an) fail(`a fresh page: the walk's way in reads "${go}", and Start again "${an}"`);
    else ok(`a fresh page: "${go}", nothing to begin again`); }
  await shot('1-title-fresh');

  // 2. a walk kept: her story told, Mei's told, Oda's under way, a view found and its photograph
  await p.evaluate(() => {
    localStorage.setItem('bh-walk-talk', JSON.stringify({ last: { part: 2, met: false, done: true, inc: 'helped', rested: true }, hachiko: { part: 3, met: false, done: true }, taxi: { part: 1, met: false, done: false }, _views: { scramble: { when: '10 October, 17:40' } } }));
    localStorage.setItem('bh-walk-roll', '{"scramble":"data:image/webp;base64,AA=="}');
    localStorage.setItem('bh-walk-intro', '1');
  });
  await title();
  console.log(`${el()} the title with a walk kept`);
  { const go = await text('#gt-walk-go'), an = await text('#gt-walk-anew');
    if (!/^Continue the walk/.test(go) || !/Oda · Drive to 109/.test(go) || !/2 of 6 told/.test(go)) fail(`a walk kept: the way in reads "${go}"`);
    else ok(`a walk kept: "${go}"`);
    if (!/^Start the walk again/.test(an)) fail(`a walk kept: no Start the walk again under it ("${an}")`); else ok(`and under it "${an}"`); }
  await shot('2-title-kept');
  await press('#gt-walk-go'); await until(() => { const e = document.getElementById('gt-walk'); return e && !e.hidden; }, null, 20000);
  { const was = await text('#gt-walk-was'), set = await text('#gt-walk-set');
    if (!/Once round by car/.test(was) || !/Drive to 109/.test(was) || !/^Continue/.test(set)) fail(`the step with a walk kept: "${was}", its button "${set}"`);
    else ok(`the step says where you were: "${was}"; its button "${set}"`); }
  await p.waitForTimeout(1800); await shot('3-step-kept'); // (the step slides in)
  await press('#gt-walk-back'); await p.waitForTimeout(800);

  // 3. Start the walk again asks first; Keep my walk loses nothing
  await press('#gt-walk-anew'); await p.waitForTimeout(800);
  { const q = await text('#gt-walk-sure-l');
    if (!/will be lost/.test(q) || !/photographs are kept/.test(q)) fail(`Start the walk again did not ask first ("${q}")`);
    else ok(`Start the walk again asks first: "${q.slice(0, 70)}..."`); }
  await p.waitForTimeout(1200); await shot('4-sure');
  if (phone) await press('#gt-walk-keep'); else await p.keyboard.press('Escape');
  await p.waitForTimeout(800);
  { const k = await kept(), go = await text('#gt-walk-go');
    if (!k.talk.taxi || !/^Continue the walk/.test(go)) fail(`Keep my walk lost it (${JSON.stringify(k.talk)}, "${go}")`); else ok('Keep my walk: the walk as it was, the title\'s list back'); }

  // 4. Continue: no flight, no call, a card with the story and what it asks, the corner Oda's
  await press('#gt-walk-go'); await until(() => { const e = document.getElementById('gt-walk'); return e && !e.hidden; }, null, 20000);
  await press('#gt-walk-set');
  if (!(await until(() => document.getElementById('game-stage').classList.contains('walk-on'), null, 10 * 60000))) fail('Continue: the walk did not set out');
  const film = await p.evaluate(() => { const g = window.__game, o = typeof g.overture === 'function' ? g.overture() : g.overture; return !!(o && o.active); });
  if (film) fail('Continue played the opening flight');
  await until(() => { const e = document.getElementById('g-walk-told'); return e && e.classList.contains('on'); }, null, 60000);
  { const card = await p.evaluate(() => document.getElementById('g-walk-told').textContent.replace(/\s+/g, ' ').trim()), dlg = await p.evaluate(() => window.__game.dlg.open);
    if (!/Where you left it/.test(card) || !/Once round by car/.test(card) || !/Drive to 109/.test(card)) fail(`Continue: the card over the street reads "${card}"`); else ok(`Continue: "${card}"`);
    if (dlg) fail('Continue: the office rang again'); }
  await p.waitForTimeout(1500);
  await shot('5-continue-card');
  await until(() => { const e = document.querySelector('#g-walk-where .q'); return e && !e.hidden && /Drive to 109/.test(e.textContent); }, null, 30000);
  { const q = await text('#g-walk-where .q'); if (!/Drive to 109/.test(q)) fail(`Continue: the corner reads "${q}", not Oda's`); else ok(`the corner: "${q}"`); }

  // 5. the menu's Start the walk again: asked on its first press, the page opened again on a first visit's step
  await press('#g-walk-acts [data-do="menu"]'); await until(() => !document.getElementById('g-menu').hidden, null, 20000);
  await p.evaluate(() => { const e = document.getElementById('gw-anew'); if (e) e.scrollIntoView({ block: 'center' }); });
  await press('#gw-anew'); await p.waitForTimeout(600);
  { const n = await text('#gw-anew-note'), bt = await text('#gw-anew');
    if (!/will be lost/.test(n) || !/^Yes/.test(bt)) fail(`the menu's Start the walk again did not ask first ("${bt}", "${n}")`); else ok(`the menu asks first: "${bt}"`); }
  await shot('6-menu-sure');
  await press('#gw-anew');
  await p.waitForEvent('load', { timeout: 120000 }).catch(() => {});
  await title(false);
  await until(() => { const e = document.getElementById('gt-walk'); return e && !e.hidden; }, null, 60000);
  { const k = await kept(), set = await text('#gt-walk-set'), was = await text('#gt-walk-was');
    const stories = Object.keys(k.talk).filter(id => !id.startsWith('_'));
    if (stories.length || !k.talk._views || !k.roll || k.intro) fail(`begun again: kept ${JSON.stringify(k)}`);
    else ok('begun again: no story kept, the office\'s call to come, the views and their photographs kept');
    if (!/^Set out/.test(set) || was) fail(`begun again: the step reads "${set}", "${was}", not a first visit's`); else ok('the page opened again on the walk\'s step, as a first visit\'s'); }
  await p.waitForTimeout(1800); await shot('7-anew-step');
  await p.goto(`http://localhost:${PORT}/?overture=0`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await title(false);
  await press('#gt-walk-go'); await until(() => { const e = document.getElementById('gt-walk'); return e && !e.hidden; }, null, 20000);
  await press('#gt-walk-set');
  if (!(await until(() => document.getElementById('game-stage').classList.contains('walk-on'), null, 10 * 60000))) fail('begun again: the walk did not set out');
  if (!(await until(() => window.__game.dlg.open, null, 120000))) fail('begun again: the office did not ring, as at a first visit');
  else ok('begun again and set out: the office rings, as at a first visit');
  { const l = await p.evaluate(() => window.__game.walkLine()); if (!l || l.ph !== 'wait') fail(`begun again: the incident is not to come (${JSON.stringify(l)})`); else ok('and the incident is to come'); }
  await shot('8-anew-out');
  await b.close();
  console.log(errors.length ? `${errors.length} failure(s)` : 'walk save: all passed');
  process.exit(errors.length ? 1 : 0);
})();
