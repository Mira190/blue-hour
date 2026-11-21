// Tonight on the walk (web/game/tonight.js; docs/STORY.md "Tonight"): the night's moments, each by the walk's own clock.
// Sets out on the walk at night under a clear sky, then for each moment sets the clock to a minute or two before it and
// lets it run there (the clock sped up, as the menu's speed does), and fails if:
//   - a few minutes before, the walk's corner has no line naming it and its time (and more than one such line);
//   - as the clock comes to it, the corner's line does not say Now, or its name is not over the street;
//   - CROSSING LIGHT: the searchlights (lights.js) are not on;
//   - the last Yamanote trains: a train of the night's last is not said to be one (trains.js isLast), trains still run
//     on the line twenty minutes after the last, or set back to the evening, they do not run again;
//   - set back to the evening, a moment's line does not come round again;
//   - the walk's menu has no timetable under its stories, or the next is not marked.
// Stills of each moment as it happens in out_dir (desk-* or phone-*), the camera where a player would look.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/tonight_play.js out_dir [WxH]          (390x844: a phone, by touch)
// ONLY=light,shops,screens,last plays some of them.
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/tonight-play', size = '1440x900'] = process.argv;
const PORT = process.env.PORT || 8800;
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
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
  p.on('crash', () => fail('the page crashed'));
  await p.addInitScript(t => { try { localStorage.setItem('oe3d-quality', t); localStorage.setItem('oe3d-onboard', JSON.stringify({ done: 1 })); localStorage.setItem('oe3d-player', 'W'); sessionStorage.setItem('oe-walk-auto', JSON.stringify({ t: 'night', w: 'clear' })); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  const t0 = Date.now(), el = () => `${Math.round((Date.now() - t0) / 1000)}s`;
  await p.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  // (set out: the walk's corner up; a minute's word on where the page is meanwhile)
  for (let i = 0; ; i++) {
    const st = await p.evaluate(() => { const s = document.getElementById('game-stage'); return s ? s.className : 'none'; }).catch(() => 'gone');
    if (/\bwalk-on\b/.test(st)) break;
    if (i > 40) { fail(`the walk did not set out in forty minutes (${st})`); await b.close(); process.exit(1); }
    console.log(`  ${el()} waiting: ${st.slice(0, 120)}`);
    await p.waitForTimeout(60000);
  }
  ok(`${el()} out on the walk`);
  const has = await p.evaluate(() => { const g = window.__game, t = g && g.tonight && g.tonight(); return t ? t.moments.map(m => m.id) : null; });
  if (!has || !has.length) { fail('no tonight on the walk'); await b.close(); process.exit(1); }
  ok(`tonight has ${has.join(', ')}`);

  // the clock to a minute, running at `scale` times real time
  const setAt = (min, scale) => p.evaluate(([min, scale]) => { const g = window.__game; g.clock.frozen = false; g.clock.scale = scale; g.setClock(g.clock.y, g.clock.m, g.clock.d, min); }, [min, scale]);
  const look = (at, yaw, pitch, dist = 6) => p.evaluate(([at, yaw, pitch, dist]) => { const g = window.__game; g.spawn(at); g.player.h = yaw; g.cam.yaw = yaw; g.cam.pitch = pitch; g.cam.dist = dist; }, [at, yaw, pitch, dist]);
  const corner = () => p.evaluate(() => { const L = [...document.querySelectorAll('#g-walk-where .tn')].filter(e => !e.hidden); return { n: L.length, text: L.map(e => e.textContent).join(' | '), card: (document.querySelector('#g-walk-tonight.on') || { textContent: '' }).textContent }; });
  const clockMin = () => p.evaluate(() => window.__game.clock.min);
  const until = (fn, arg, ms) => p.waitForFunction(fn, arg, { timeout: ms, polling: 200 }).then(() => true, () => false);
  const hm = m => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;

  // each moment: where to stand and look, the minute it comes at, and what else to check as it does
  const MOMENTS = [
    { id: 'light', at: 20 * 60, name: 'CROSSING LIGHT', stand: [300, -930], yaw: 2.23, pitch: -0.7, dist: 4, after: 1.5 },
    { id: 'shops', at: 21 * 60, name: 'The shutters come down', stand: [318, -962], yaw: -1.3, pitch: -0.02, dist: 6, after: 4 },
    { id: 'screens', at: 0, name: 'The screens go dark', stand: [352, -975], yaw: 0.9, pitch: -0.12, dist: 5, after: 1.5 },
    { id: 'last', at: 48, name: 'The last Yamanote trains', stand: [392, -1030], yaw: 2.2, pitch: -0.08, dist: 6 },
  ].filter(m => !ONLY || ONLY.includes(m.id));
  for (const M of MOMENTS) {
    await look(M.stand, M.yaw, M.pitch, M.dist);
    // a few minutes before: its line in the corner, with its time
    await setAt((M.at - 4 + 1440) % 1440, 1);
    await p.waitForTimeout(2500);
    let c = await corner();
    if (c.n !== 1 || !c.text.includes(M.name) || !c.text.includes(hm(M.at))) fail(`${M.id}: four minutes before, the corner says "${c.text}" (${c.n} lines)`);
    else ok(`${M.id}: before, the corner says "${c.text}"`);
    if (M.id === 'shops' || M.id === 'screens') await p.screenshot({ path: `${out}/${tag}-${M.id}-before.png` });
    // the clock run on to it: the corner says Now, and its name is over the street
    await setAt((M.at - 0.4 + 1440) % 1440, 20);
    const came = await until(name => { const e = document.querySelector('#g-walk-tonight.on'); return !!e && e.textContent.includes(name); }, M.name, 240000);
    c = await corner();
    if (!came) fail(`${M.id}: at ${hm(await clockMin())} its name is not over the street ("${c.card}")`);
    else ok(`${M.id}: its name over the street at ${hm(await clockMin())}: "${c.card}"`);
    if (!/^Now/.test(c.text)) fail(`${M.id}: as it happens the corner says "${c.text}"`);
    else ok(`${M.id}: the corner says "${c.text}"`);
    await p.evaluate(() => { window.__game.clock.scale = 1; });
    if (M.id === 'light') {
      const on = await until(() => { const s = window.__game.lightShow(); return !!s && s.active(); }, null, 60000);
      if (!on) fail('light: the searchlights are not on at 20:00'); else ok('light: the searchlights are on');
    }
    if (M.after) { await setAt((M.at + M.after) % 1440, 1); await p.waitForTimeout(1500); }
    await p.waitForTimeout(3000);
    await p.screenshot({ path: `${out}/${tag}-${M.id}.png` });
    if (M.id === 'last') {
      // the night's last train said to be one; none on the line twenty minutes on; and back in the evening, trains again
      const lastSeen = await p.evaluate(() => { const T = window.__game.trains; if (!T) return null; const S = new Set(); for (let i = -20; i <= 20; i++) for (const s of T.services) { const k = Math.floor((T.t - s.offset_s) / s.every_s) + i; if (T.isLast(s, k)) S.add(`${s.track} ${Math.round(T.depMin(s, k))}`); } return [...S]; });
      if (!lastSeen || lastSeen.length < 1) fail(`last: no train is the night's last (${JSON.stringify(lastSeen)})`); else ok(`last: the night's last trains ${lastSeen.join(', ')} (minutes after midnight)`);
      await setAt(70, 1);
      await p.waitForTimeout(1500);
      const night = await p.evaluate(() => window.__game.trains.at(window.__game.trains.t).length);
      if (night) fail(`last: ${night} trains still on the line at 01:10`); else ok('last: no train on the line at 01:10');
      await setAt(23 * 60, 1);
      await p.waitForTimeout(1500);
      const eve = await p.evaluate(() => window.__game.trains.at(window.__game.trains.t).length);
      if (!eve) fail('last: set back to 23:00, no trains run again'); else ok(`last: set back to 23:00, ${eve} trains on the line again`);
    }
  }
  // set back to the evening: the first moment comes round again, and the menu has tonight under its stories
  await setAt(19 * 60 + 56, 1);
  await p.waitForTimeout(2500);
  const again = await corner();
  if (!again.text.includes('CROSSING LIGHT') || !again.text.includes('20:00')) fail(`set back to 19:56, the corner says "${again.text}"`);
  else ok(`set back to 19:56, the corner says "${again.text}" again`);
  await p.keyboard.press('Escape');
  const menu = await until(() => { const e = document.getElementById('gm-tonight'); return !!e && !e.hidden && e.offsetHeight > 0; }, null, 20000);
  const rows = await p.evaluate(() => [...document.querySelectorAll('#gm-tonight li')].map(li => `${li.dataset.s}: ${li.textContent}`));
  if (!menu || rows.length < 3) fail(`the menu has no timetable under its stories (${rows.length} rows)`);
  else if (!rows.some(r => /^next:/.test(r))) fail(`the menu's timetable marks no next: ${rows.join(' / ')}`);
  else ok(`the menu's timetable: ${rows.join(' / ')}`);
  await p.evaluate(() => { const e = document.getElementById('gm-tonight'); if (e) e.scrollIntoView({ block: 'center' }); });
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${out}/${tag}-menu.png` });
  await b.close().catch(() => {});
  console.log(errors.length ? `${errors.length} failed (${el()})` : `all passed (${el()})`);
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
