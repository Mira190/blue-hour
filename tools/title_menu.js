// The title's ways in, as one list (story.css "the title's ways in", walk.js, game.js titleLead): on a desktop's page and
// a phone's, for a player who has chosen who they play, with no case going and with one going, the menu opened from the
// title's press by a key or a tap (a press that does not open it fails; game.js titleScreen). It fails a list not led
// by the story with the walk under it, rows not all one width and height, the Enter key shown on a row Enter does not take, up and down that do
// not move the hand along the list (the desktop), and a press of the walk's row that does not open its step or a step
// left that does not give the list back. Stills of each state go to out_dir.
//
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/title_menu.js out_dir            (SCREENS=desk or touch: only that one)
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/title-menu'] = process.argv;
const PORT = process.env.PORT || 8800;
const SCREENS = (process.env.SCREENS || 'desk,touch').split(',');
let fails = 0;
const fail = m => { fails++; console.log(`FAIL ${m}`); };
const ok = m => console.log(`ok   ${m}`);

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const args = process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  for (const screen of SCREENS) {
    const touch = screen === 'touch', size = touch ? { width: 390, height: 844 } : { width: 1440, height: 900 };
    const ctx = await b.newContext({ viewport: size, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch });
    const p = await ctx.newPage();
    p.on('pageerror', e => fail(`pageerror (${screen}): ${String(e).slice(0, 200)}`));
    const open = async going => {
      await p.addInitScript(`try { localStorage.setItem('oe3d-quality', 'high'); localStorage.setItem('oe3d-player', 'M'); localStorage.removeItem('oe-story-late-closed');
        ${going ? `localStorage.setItem('oe-story-late', JSON.stringify({ fi: 2, left: 5, prints: [{ src: null, stamp: '17:14', cap: '' }, { src: null, stamp: '17:19', cap: '' }] }));` : `localStorage.removeItem('oe-story-late');`} } catch (e) {}`);
      await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden && document.getElementById('gt-walk-go'); }, null, { timeout: 900000, polling: 500 });
      await p.waitForTimeout(3000);
      await p.evaluate(() => document.getAnimations().forEach(a => { try { if (a.effect.getComputedTiming().iterations !== Infinity) a.finish(); } catch (e) { /* */ } }));
      // (the title opens on its press: a key, or on a phone a tap anywhere, opens the menu)
      if (!going) await shot('0-press');
      if (touch) await p.touchscreen.tap(size.width / 2, size.height / 2); else await p.keyboard.press('Space');
      // (the name's flight from the press to the menu's corner, held at three moments of it: lockupFlip)
      if (!going) for (const [i, t] of [[1, 0.15], [2, 0.4], [3, 0.7]]) {
        await p.evaluate(t => { const a = document.getElementById('gt-title').getAnimations().find(x => x instanceof Animation && x.effect && x.effect.getKeyframes().some(k => /translate/.test(k.transform || ''))); if (a) { a.pause(); a.currentTime = a.effect.getTiming().duration * t; } }, t);
        await shot(`0-flight-${i}`);
      }
      await p.evaluate(() => document.getElementById('gt-title').getAnimations().forEach(a => a.play()));
      await p.waitForTimeout(1600);
      const at = await p.evaluate(() => window.__game.screen());
      if (at !== 'menu') fail(`${screen}: the press did not open the menu (on "${at}")`);
      await p.evaluate(() => document.getAnimations().forEach(a => { try { if (a.effect.getComputedTiming().iterations !== Infinity) a.finish(); } catch (e) { /* */ } }));
    };
    // the list as it is laid out: each row's id, size, whether it leads, whether its Enter key shows, and where the hand is
    const rows = () => p.evaluate(() => ({ focus: (document.activeElement || {}).id || '', list: [...document.querySelectorAll('#g-title .gt-go > .btn')].filter(x => x.offsetParent).map(x => { const r = x.getBoundingClientRect(), k = x.querySelector('kbd');
      return { id: x.id, w: Math.round(r.width), h: Math.round(r.height), lead: x.classList.contains('primary'), key: !!k && getComputedStyle(k).display !== 'none' && getComputedStyle(k).visibility === 'visible' }; }) }));
    const step = () => p.evaluate(() => !document.getElementById('gt-walk').hidden);
    const shot = async n => { await p.waitForTimeout(500); await p.screenshot({ path: `${out}/${screen}-${n}.png` }); };
    const scr = () => p.evaluate(() => window.__game.screen());
    const lent = () => p.evaluate(() => ({ opts: !!document.querySelector('#gt-opts #gm-fps'), menu: !!document.querySelector('#g-menu #gm-fps') }));
    const sameSize = (l, what, lead = 'gt-story-go') => {
      if (!l.length || l[0].id !== lead || !l[0].lead || l.filter(r => r.lead).length !== 1) return fail(`${screen} ${what}: the list does not lead with ${lead}: ${JSON.stringify(l)}`);
      if (l.some(r => Math.abs(r.w - l[0].w) > 1 || Math.abs(r.h - l[0].h) > 1)) return fail(`${screen} ${what}: the rows are not all one size: ${JSON.stringify(l.map(r => [r.id, r.w, r.h]))}`);
      if (touch ? l.some(r => r.h < 48) : false) return fail(`${screen} ${what}: a row lower than a thumb's 48 px: ${l[0].h}`);
      ok(`${screen} ${what}: one list led by ${lead}, ${l.length} rows each ${l[0].w}x${l[0].h} (${l.map(r => r.id).join(', ')})`);
    };
    // (a button pressed as the hand would: a click on a desktop, a tap on a phone)
    const hit = async sel => { const r = await p.locator(sel).first().boundingBox(); if (!r) return fail(`${screen}: ${sel} is not on the screen`); const x = r.x + r.width / 2, y = r.y + r.height / 2; if (touch) await p.touchscreen.tap(x, y); else await p.mouse.click(x, y); };

    await open(false);
    let s = await rows();
    sameSize(s.list, 'no case going');
    if (s.list.map(r => r.id).join() !== 'gt-story-go,gt-walk-go,gt-opts-go') fail(`${screen} no case going: the menu is ${s.list.map(r => r.id).join(', ')}, not the story, the walk and the options`);
    if (touch ? s.list.some(r => r.key) : !(s.list[0].key && s.list.filter(r => r.key).length === 1)) fail(`${screen}: the Enter key shows on ${JSON.stringify(s.list.filter(r => r.key).map(r => r.id))}`);
    else ok(`${screen}: the Enter key ${touch ? 'on no row (a phone has none)' : 'on the story alone, the row Enter takes'}`);
    await shot('1-menu');
    if (!touch) {
      await p.keyboard.press('ArrowDown'); await p.waitForTimeout(400);
      s = await rows();
      const walkRow = s.list.find(r => r.id === 'gt-walk-go') || {};
      if (s.focus !== 'gt-walk-go') fail(`desk: down did not move the hand from the story to the walk (on "${s.focus}")`);
      else if (!walkRow.key || s.list.find(r => r.id === 'gt-story-go').key) fail(`desk: the hand on the walk, and the Enter key is on ${JSON.stringify(s.list.filter(r => r.key).map(r => r.id))}`);
      else ok('desk: down puts the hand on the walk, and the Enter key goes with it');
      await shot('2-down');
      await p.keyboard.press('ArrowUp'); await p.waitForTimeout(400); // (back to the story's row, where Enter opens its screen)
      // the story's screen: Enter opens it with the hand on Begin, Esc gives the menu back with the hand on the story's row
      await p.keyboard.press('Enter'); await p.waitForTimeout(1500);
      const st = await p.evaluate(() => ({ focus: (document.activeElement || {}).id, line: document.querySelector('#gt-eps .line').textContent, h: document.querySelector('#gt-eps .cap h3').textContent, roll: document.querySelectorAll('#gt-eps .gt-roll li').length, play: document.getElementById('gt-play').innerText.replace(/\s+/g, ' ').trim() }));
      if ((await scr()) !== 'story' || st.focus !== 'gt-play' || !st.h || st.line.length < 40 || st.roll !== 7 || !/^Begin/i.test(st.play)) fail(`desk: Enter on the story did not open its screen whole, the hand on Begin (${JSON.stringify(st)})`);
      else ok(`desk: the story's screen: "${st.h}", its line, a roll of ${st.roll}, the hand on "${st.play}"`);
      await shot('2-story');
      await p.keyboard.press('Escape'); await p.waitForTimeout(1200);
      s = await rows();
      if ((await scr()) !== 'menu' || s.focus !== 'gt-story-go') fail(`desk: Esc on the story's screen did not give the menu back, the hand on its row (${await scr()}, ${s.focus})`);
      else ok("desk: Esc gives the menu back, the hand on the story's row");
      // the options: the pause menu's controls lent while the screen is up, and given back as it goes
      await p.keyboard.press('ArrowDown'); await p.keyboard.press('ArrowDown'); await p.keyboard.press('Enter'); await p.waitForTimeout(1200);
      let l = await lent();
      if ((await scr()) !== 'opts' || !l.opts || l.menu) fail(`desk: the options did not open with the controls lent (${await scr()}, ${JSON.stringify(l)})`);
      else ok('desk: the options open with the sound, the crowd and the frame rate');
      await shot('2-opts');
      await p.keyboard.press('Escape'); await p.waitForTimeout(1000);
      l = await lent();
      if ((await scr()) !== 'menu' || l.opts || !l.menu) fail(`desk: Esc on the options did not give the controls back to the pause menu (${JSON.stringify(l)})`);
      else ok('desk: Esc gives the menu back and the controls back to the pause menu');
      await p.keyboard.press('ArrowUp'); await p.waitForTimeout(400);
      s = await rows();
      if (s.focus !== 'gt-walk-go') fail(`desk: up did not move the hand back to the walk (on "${s.focus}")`);
      await p.keyboard.press('Enter'); await p.waitForTimeout(1500);
      if (!(await step())) fail('desk: Enter on the walk did not open its step');
      else ok('desk: Enter on the walk opens its step (the hour and the sky)');
      await shot('3-step');
      await p.keyboard.press('Escape'); await p.waitForTimeout(1500);
      s = await rows();
      if (await step() || s.list.length < 2 || s.focus !== 'gt-walk-go') fail(`desk: Esc did not give the list back with the hand on the walk (${JSON.stringify(s)})`);
      else ok('desk: Esc gives the list back, the hand on the walk');
    } else {
      await hit('#gt-walk-go'); await p.waitForTimeout(1500);
      if (!(await step())) fail('touch: a tap on the walk did not open its step');
      else ok('touch: a tap on the walk opens its step');
      await shot('3-step');
      await hit('#gt-walk-back'); await p.waitForTimeout(1500);
      if (await step() || (await rows()).list.length < 2) fail('touch: Back did not give the list back');
      else ok('touch: Back gives the list back');
      await hit('#gt-story-go'); await p.waitForTimeout(1500);
      if ((await scr()) !== 'story') fail("touch: a tap on the story did not open its screen");
      await shot('2-story');
      await hit('#gt-eps-back'); await p.waitForTimeout(1200);
      if ((await scr()) !== 'menu') fail("touch: the story's Back did not give the menu back");
      else ok("touch: the story's screen opens by a tap and its Back gives the menu again");
      await hit('#gt-opts-go'); await p.waitForTimeout(1200);
      if ((await scr()) !== 'opts' || !(await lent()).opts) fail('touch: a tap on the options did not open them with the controls lent');
      await shot('2-opts');
      await hit('#gt-opts-back'); await p.waitForTimeout(1000);
      if ((await scr()) !== 'menu' || !(await lent()).menu) fail("touch: the options' Back did not give the controls back");
      else ok("touch: the options open by a tap and their Back gives the controls back");
    }

    // a case going: Continue first, with the amber; the story's screen says how far and offers the evening again, asked first
    await open(true);
    s = await rows();
    sameSize(s.list, 'a case going', 'gt-cont-go');
    if (s.list.map(r => r.id).join() !== 'gt-cont-go,gt-story-go,gt-walk-go,gt-opts-go') fail(`${screen} a case going: the menu is ${s.list.map(r => r.id).join(', ')}, not Continue, the story, the walk and the options`);
    await shot('4-going');
    await hit('#gt-story-go'); await p.waitForTimeout(1500);
    const g = await p.evaluate(() => ({ state: document.querySelector('#gt-eps .state').textContent, got: document.querySelectorAll('#gt-eps .gt-roll li.got').length, now: document.querySelectorAll('#gt-eps .gt-roll li.now').length, play: document.getElementById('gt-play').innerText.replace(/\s+/g, ' ').trim(), anew: !document.getElementById('gt-anew').hidden }));
    if (!/In progress/.test(g.state) || g.got !== 2 || g.now !== 1 || !/^Continue/i.test(g.play) || !g.anew) fail(`${screen} a case going: the story's screen does not say how far, or offer Continue and the evening again (${JSON.stringify(g)})`);
    else ok(`${screen} a case going: "${g.state}", ${g.got} frames on the roll, "${g.play}" and the evening again`);
    await shot('5-story-going');
    await hit('#gt-anew'); await p.waitForTimeout(800);
    const sure = () => p.evaluate(() => document.getElementById('gt-eps').classList.contains('sure'));
    if (!(await sure())) fail(`${screen}: the evening again did not ask first`);
    await shot('6-sure');
    if (touch) await hit('#gt-anew-no'); else await p.keyboard.press('Escape');
    await p.waitForTimeout(800);
    if ((await sure()) || (await scr()) !== 'story') fail(`${screen}: ${touch ? 'Keep the case' : 'Esc'} on the question did not keep the case on the story's screen`);
    else if (!(await p.evaluate(() => { try { return !!localStorage.getItem('oe-story-late'); } catch (e) { return false; } }))) fail(`${screen}: the case was lost by asking`);
    else ok(`${screen}: the evening again asks first, and ${touch ? 'Keep the case' : 'Esc'} keeps it`);
    await ctx.close();
  }
  await b.close();
  console.log(fails ? `FAIL ${fails} (stills in ${out})` : `ok   the menu: Continue, the walk, the story and the options, each one size; the story's and the options' screens (stills in ${out})`);
  process.exit(fails ? 1 : 0);
})();
