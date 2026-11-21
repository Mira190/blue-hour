// A phone's lost WebGL context, on the story's page (web/glcare.js, web/quality.js lost; the owner's iPhone, 21 November
// 2026: lost at 35 s, reloaded at the same set, the reload killed at "built", the third load in at last):
//   1. the story's page (no address after #) reads its map from <html data-map>: a death noted for it makes a phone's
//      next load a level lighter, and a minute held there does not climb above the set the budget is measured at;
//   2. a context lost while the tab is put away: the game holds under the note and nothing reloads, nor is a death
//      noted (the tab in front took the memory); once the page is seen again it reloads;
//   3. a context lost while the page is seen: a death at the level it ran at is noted, the frames hold (no script error
//      from what the phone let go of), the page reloads, and the reload says it is making room and loads a level lighter.
// The phone is played as mem_check.js plays one (390 x 844, touch, an iPhone's user agent, the low tier).
//   xvfb-run -a node tools/glcare_phone.js            (the page served on PORT, 8800)
const { chromium } = require('playwright');
const PORT = process.env.PORT || 8800, URL = `http://localhost:${PORT}/?overture=0`;
let fails = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails++; };
(async () => {
  const args = process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  });
  // the tab put away and back, as the page sees it (document.hidden and a visibilitychange)
  await ctx.addInitScript(() => {
    try { localStorage.setItem('oe3d-onboard', '1'); } catch (e) { /* storage blocked */ }
    window.__hid = false; Error.stackTraceLimit = 60; // (the page's own lines under three.js's, in an error's stack)
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__hid });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (window.__hid ? 'hidden' : 'visible') });
    window.__setHidden = h => { window.__hid = h; document.dispatchEvent(new Event('visibilitychange')); };
  });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => { errors.push(String(e)); console.log('pageerror:', String(e).slice(0, 200), (e.stack || '').split('\n').slice(1).map(l => l.trim()).filter(l => !/three\.module/.test(l)).slice(0, 6).join(' | ').slice(0, 900)); });
  const loaded = async () => {
    await p.waitForFunction(() => window.__game && window.__game.care, null, { timeout: 900000, polling: 1000 });
    await p.waitForFunction(() => { const l = document.getElementById('g-loader'); return !l || l.hidden || l.classList.contains('out'); }, null, { timeout: 900000, polling: 1000 });
    await p.waitForTimeout(1500);
  };
  const died = () => p.evaluate(() => { try { return JSON.parse(localStorage.getItem('oe3d-died-shibuya')); } catch (e) { return null; } });
  const lose = () => p.evaluate(() => { const gl = document.getElementById('game-gl').getContext('webgl2'); window.__lc = gl.getExtension('WEBGL_lose_context'); window.__lc.loseContext(); });
  const restore = () => p.evaluate(() => window.__lc.restoreContext());
  const noteText = () => p.evaluate(() => { const n = document.querySelector('#game-stage .gl-note'); return n && !n.hidden ? n.textContent : ''; });

  // 1. the level, from the notes alone (quality.js)
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => window.OEQuality, null, { timeout: 120000 });
  const lv = await p.evaluate(() => {
    const Q = window.OEQuality, t = Date.now(), at = notes => { for (const k of ['oe3d-died-shibuya', 'oe3d-held-shibuya']) localStorage.removeItem(k); for (const [k, v] of Object.entries(notes)) localStorage.setItem(k, JSON.stringify(v)); return Q.level(); };
    const r = { lean: Q.lean(), map: document.documentElement.dataset.map, none: at({}), died2: at({ 'oe3d-died-shibuya': { n: 1, t, lv: 2 } }), held2: at({ 'oe3d-held-shibuya': { lv: 2, t } }),
      held3: at({ 'oe3d-held-shibuya': { lv: 3, t } }), old: at({ 'oe3d-died-shibuya': { n: 1, t: t - 15 * 864e5, lv: 2 } }) };
    at({});
    return r;
  });
  check(lv.lean && lv.map === 'shibuya', `the story's page is a phone's lean page of the map in <html data-map> (lean ${lv.lean}, map ${lv.map})`);
  check(lv.none === 2 && lv.died2 === 3 && lv.old === 2, `a death at level 2 makes the next load level 3, for fourteen days (no record ${lv.none}, a death ${lv.died2}, one 15 days old ${lv.old})`);
  check(lv.held2 === 2 && lv.held3 === 2, `a minute held climbs no higher than level 2 (held at 2: ${lv.held2}, at 3: ${lv.held3})`);

  // 2. lost while the tab is put away
  await p.reload({ waitUntil: 'domcontentloaded' });
  await loaded();
  const lv0 = await p.evaluate(() => window.OEQuality.city().lighter);
  await p.evaluate(() => { window.__same = true; window.__setHidden(true); });
  await lose();
  await p.waitForTimeout(800);
  await restore();
  await p.waitForTimeout(4000);
  const away = await p.evaluate(() => ({ same: !!window.__same, held: !!window.__game.care.lost, reloads: window.__game.care.stats.reloads }));
  const awayNote = await noteText(), awayDied = await died();
  check(away.same && away.reloads === 1 && away.held, `lost and restored while put away: the page stays, holding (same page ${away.same}, gave up ${away.reloads}, holding ${away.held})`);
  check(/Reloading/.test(awayNote) && !awayDied, `under the note "${awayNote.slice(0, 40)}", and no death noted (${JSON.stringify(awayDied)})`);
  const nav = p.waitForNavigation({ timeout: 15000 }).then(() => true).catch(() => false);
  await p.evaluate(() => window.__setHidden(false));
  check(await nav, 'seen again, the page reloads');

  // 3. lost while the page is seen
  const errs0 = errors.length;
  await loaded();
  await p.evaluate(() => { try { sessionStorage.removeItem('oe3d-gl-reload'); } catch (e) { /* storage blocked */ } window.__same = true; });
  const lv1 = await p.evaluate(() => window.OEQuality.city().lighter);
  await lose();
  await p.waitForTimeout(300);
  const nav2 = p.waitForNavigation({ timeout: 20000 }).then(() => true).catch(() => false);
  await restore();
  await p.waitForTimeout(600);
  const seenDied = await died(), seenNote = await noteText(), held = await p.evaluate(() => !!(window.__game && window.__game.care.lost)).catch(() => null);
  check(!!seenDied && seenDied.lv === lv1 && seenDied.gl === true, `lost while seen at level ${lv1}: a death noted at it (${JSON.stringify(seenDied)})`);
  check(/Reloading/.test(seenNote) && held !== false, `the frames hold under "${seenNote.slice(0, 40)}" (holding ${held})`);
  check(await nav2, 'and the page reloads');
  check(!errors.slice(errs0).some(e => /byteLength|null is not an object|Cannot read properties of null/.test(e)), `no script error from what the phone let go of (${errors.slice(errs0).length} errors)`);
  let room = '';
  for (let i = 0; i < 40 && !/Making room/.test(room); i++) { room = await p.evaluate(() => (document.getElementById('g-load-msg') || {}).textContent || '').catch(() => ''); await p.waitForTimeout(250); }
  const lv2 = await p.evaluate(() => window.OEQuality.city().lighter);
  const first = await p.evaluate(() => { try { return Number(sessionStorage.getItem('oe3d-gl-reload')) > 0; } catch (e) { return false; } });
  check(/Making room/.test(room) && lv2 === Math.min(3, lv1 + 1), `the reload makes room ("${room.slice(0, 50)}") and loads level ${lv2} (was ${lv1}; the first load ${lv0})`);
  check(first, 'and knows it is a reload after a lost context (telemetry gl_reload)');
  await b.close();
  console.log(fails ? `FAIL: ${fails}` : 'PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
