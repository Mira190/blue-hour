// The title's ways in, as one list (story.css "the title's ways in", walk.js, game.js titleLead): on a desktop's page and
// a phone's, for a player who has chosen who they play, with no case going and with one going. It fails a list not led
// by the walk, rows not all one width and height, the Enter key shown on a row Enter does not take, up and down that do
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
    };
    // the list as it is laid out: each row's id, size, whether it leads, whether its Enter key shows, and where the hand is
    const rows = () => p.evaluate(() => ({ focus: (document.activeElement || {}).id || '', list: [...document.querySelectorAll('#g-title .gt-go > .btn')].filter(x => x.offsetParent).map(x => { const r = x.getBoundingClientRect(), k = x.querySelector('kbd');
      return { id: x.id, w: Math.round(r.width), h: Math.round(r.height), lead: x.classList.contains('primary'), key: !!k && getComputedStyle(k).display !== 'none' && getComputedStyle(k).visibility === 'visible' }; }) }));
    const step = () => p.evaluate(() => !document.getElementById('gt-walk').hidden);
    const shot = async n => { await p.waitForTimeout(500); await p.screenshot({ path: `${out}/${screen}-${n}.png` }); };
    const sameSize = (l, what) => {
      if (!l.length || l[0].id !== 'gt-walk-go' || !l[0].lead || l.filter(r => r.lead).length !== 1) return fail(`${screen} ${what}: the list does not lead with the walk: ${JSON.stringify(l)}`);
      if (l.some(r => Math.abs(r.w - l[0].w) > 1 || Math.abs(r.h - l[0].h) > 1)) return fail(`${screen} ${what}: the rows are not all one size: ${JSON.stringify(l.map(r => [r.id, r.w, r.h]))}`);
      if (touch ? l.some(r => r.h < 48) : false) return fail(`${screen} ${what}: a row lower than a thumb's 48 px: ${l[0].h}`);
      ok(`${screen} ${what}: one list led by the walk, ${l.length} rows each ${l[0].w}x${l[0].h} (${l.map(r => r.id).join(', ')})`);
    };

    await open(false);
    let s = await rows();
    sameSize(s.list, 'no case going');
    if (touch ? s.list.some(r => r.key) : !(s.list[0].key && s.list.filter(r => r.key).length === 1)) fail(`${screen}: the Enter key shows on ${JSON.stringify(s.list.filter(r => r.key).map(r => r.id))}`);
    else ok(`${screen}: the Enter key ${touch ? 'on no row (a phone has none)' : 'on the walk alone, the row Enter takes'}`);
    await shot('1-menu');
    if (!touch) {
      await p.keyboard.press('ArrowDown'); await p.waitForTimeout(400);
      s = await rows();
      const play = s.list.find(r => r.id === 'gt-play') || {};
      if (s.focus !== 'gt-play') fail(`desk: down did not move the hand from the walk to the episode (on "${s.focus}")`);
      else if (!play.key || s.list.find(r => r.id === 'gt-walk-go').key) fail(`desk: the hand on the episode, and the Enter key is on ${JSON.stringify(s.list.filter(r => r.key).map(r => r.id))}`);
      else ok('desk: down puts the hand on the episode, and the Enter key goes with it');
      await shot('2-down');
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
      await p.tap('#gt-walk-go'); await p.waitForTimeout(1500);
      if (!(await step())) fail('touch: a tap on the walk did not open its step');
      else ok('touch: a tap on the walk opens its step');
      await shot('3-step');
      await p.tap('#gt-walk-back'); await p.waitForTimeout(1500);
      if (await step() || (await rows()).list.length < 2) fail('touch: Back did not give the list back');
      else ok('touch: Back gives the list back');
    }

    await open(true);
    s = await rows();
    sameSize(s.list, 'a case going');
    if (s.list.length !== 3) fail(`${screen} a case going: ${s.list.length} rows, not the walk, Continue and the evening again`);
    await shot('4-going');
    await ctx.close();
  }
  await b.close();
  console.log(fails ? `FAIL ${fails} (stills in ${out})` : `ok   the title's ways in: one list, every row one size, the walk first (stills in ${out})`);
  process.exit(fails ? 1 : 0);
})();
