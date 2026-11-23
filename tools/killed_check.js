// A phone whose page the system killed loads a level lighter next time, with the measurements off (issue 128;
// web/lifeline.js). The page is opened as an iPhone with ?telemetry=off (and automated, which turns them off as well):
// its note that it is alive must be written all the same; a note left behind by a page that died (the page's own, aged
// past the half minute a live tab keeps it fresh) must be counted by the next load as a death at its level, and that
// load must be a level lighter (quality.js level). A note another tab keeps fresh must not be counted.
//   xvfb-run -a node tools/killed_check.js            (the page served on PORT, 8800)
const { chromium } = require('playwright');
require('./browser_watch'); // (which functions the page ran, for tools/check_cache.py)
const PORT = process.env.PORT || 8800, URL = `http://localhost:${PORT}/?telemetry=off&overture=0`;
let fails = 0;
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails++; };
(async () => {
  const args = process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  });
  await ctx.addInitScript(() => { try { localStorage.setItem('bh-quality', 'low'); for (const k of ['bh-died-shibuya', 'bh-held-shibuya']) if (!sessionStorage.getItem('kc-once')) localStorage.removeItem(k); sessionStorage.setItem('kc-once', '1'); } catch (e) { /* storage blocked */ } });
  const p = await ctx.newPage();
  await p.goto(URL, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => window.OEQuality && window.OETelemetry && window.OELifeline, null, { timeout: 120000 });
  await p.waitForTimeout(6000); // (a note written with the phone's level: the five seconds' refresh after quality.js is in)
  const a = await p.evaluate(() => {
    const notes = Object.keys(localStorage).filter(k => k.startsWith('bh-alive-')).map(k => [k, JSON.parse(localStorage.getItem(k))]);
    const own = notes.find(([k]) => k === `bh-alive-${OELifeline.sid}`);
    const o = { telemetry: OETelemetry.on, lean: OEQuality.lean(), lv: OEQuality.level('shibuya'), own: own ? own[1] : null };
    // a page of this map that died two minutes ago, and another tab's, alive (written a second ago)
    if (own) {
      localStorage.setItem('bh-alive-deadpage', JSON.stringify(Object.assign({}, own[1], { t: Date.now() - 120000 })));
      localStorage.setItem('bh-alive-othertab', JSON.stringify(Object.assign({}, own[1], { t: Date.now() - 1000 })));
    }
    return o;
  });
  check(a.telemetry === false, `the measurements are off (${a.telemetry})`);
  check(a.lean && !!a.own && a.own.view === 'game' && a.own.city === 'shibuya' && a.own.lv === a.lv, `the page's alive note is written all the same: ${JSON.stringify(a.own)} (level ${a.lv})`);
  await p.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => window.OEQuality && window.OELifeline, null, { timeout: 120000 });
  const r = await p.evaluate(() => ({ died: JSON.parse(localStorage.getItem('bh-died-shibuya') || 'null'), lv: OEQuality.level('shibuya'), other: !!localStorage.getItem('bh-alive-othertab'), found: OELifeline.found.length }));
  check(!!r.died && r.died.n === 1 && r.died.lv === a.lv, `the next load counts the dead page once, at its level (${JSON.stringify(r.died)}; ${r.found} found)`);
  check(r.lv === Math.min(3, a.lv + 1), `and loads a level lighter (${a.lv} then ${r.lv})`);
  check(r.other, 'another tab\'s fresh note is left alone');
  await b.close();
  console.log(fails ? `FAIL: ${fails}` : 'PASS');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
