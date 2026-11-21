// A phone whose WebGL context is lost is counted as having died there at once (web/telemetry.js noteLost): the next load
// is a level lighter (quality.js level) before the page itself is taken, and the dead page found afterwards is not counted
// a second time. Played as an iPhone on the map's page (tools/start_play.js); the loss is made with a lost-context event, and telemetry runs in its debug mode (batches to the console), which a checkout
// served here does not otherwise do.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/lost_check.js
const { chromium, devices } = require('playwright');
const { startPlay } = require('./start_play');
require('./browser_watch'); // (which functions the page ran, for tools/check_cache.py)
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist'] });
  const d = devices['iPhone 13'], ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: d.userAgent });
  const p = await ctx.newPage(), port = process.env.PORT || 8800, fails = [];
  await p.goto(`http://localhost:${port}/?walk=1&telemetry=debug#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game', null, { timeout: 400000 });
  await startPlay(p);
  await p.waitForTimeout(6000); // (past the four seconds a view change is not counted)
  const r = await p.evaluate(async () => {
    const lv = () => OEQuality.level('shibuya'), note = () => JSON.parse(localStorage.getItem('oe3d-died-shibuya') || 'null');
    const o = { lvBefore: lv(), noteBefore: note(), lean: OEQuality.lean() };
    document.querySelector('canvas').dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    await new Promise(r => setTimeout(r, 300));
    o.noteAfter = note(); o.lvAfter = lv();
    document.querySelector('canvas').dispatchEvent(new Event('webglcontextlost', { cancelable: true })); // (a second loss in the same page: not counted again)
    await new Promise(r => setTimeout(r, 200));
    o.noteTwice = note();
    const alive = Object.keys(localStorage).filter(k => k.startsWith('oe3d-alive-')).map(k => JSON.parse(localStorage.getItem(k)));
    o.aliveLost = alive.some(a => a.lost);
    return o;
  });
  // the page is taken (a reload of the same tab finds its alive note left behind): the death is not counted a second time
  await p.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game', null, { timeout: 400000 });
  r.afterReload = await p.evaluate(() => JSON.parse(localStorage.getItem('oe3d-died-shibuya') || 'null'));
  console.log(JSON.stringify(r));
  if (!r.lean) fails.push('the page is not a phone to quality.js');
  if (!(r.noteAfter && r.noteAfter.n === 1)) fails.push(`a lost context left the note ${JSON.stringify(r.noteAfter)}, not one death`);
  if (!(r.lvAfter > r.lvBefore)) fails.push(`the level did not go lighter: ${r.lvBefore} then ${r.lvAfter}`);
  if (!(r.noteTwice && r.noteTwice.n === 1)) fails.push(`a second loss in the page counted again: ${JSON.stringify(r.noteTwice)}`);
  if (!(r.afterReload && r.afterReload.n === 1)) fails.push(`the dead page was counted again when the next load found it: ${JSON.stringify(r.afterReload)}`);
  if (!r.aliveLost) fails.push('the page\'s alive note does not say the loss was counted');
  for (const f of fails) console.log('FAIL', f);
  console.log(fails.length ? `FAIL ${fails.length}` : 'PASS');
  await b.close(); process.exit(fails.length ? 1 : 0);
})();
