// What the walk's opening flight costs a phone: the hero levels fetched while it flies, the programs linked in it and in
// the first seconds of the walk after it, and the GPU memory WebGL was asked for. The owner's iPhone lost its WebGL
// context at the end of that flight (26 November 2026: sixteen programs linked in ten seconds, no frame for 5.1 s).
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/flight_cost.js [seconds after the flight, default 20]   (DPR=1: one device pixel to the point, quicker)
// Opens the page as an iPhone on the low tier (390 x 844 at 3x, touch, the phone's user agent), sets out on the walk
// from the title, and prints each level as it is fetched and ready, with whether the flight was on, the programs
// linked during the flight and after it, and the peak GPU memory. Exits 1 when a level is fetched during the flight.
const { chromium } = require('playwright');
const after = +(process.argv[2] || 20);
(async () => {
  const b = await chromium.launch(process.env.DISPLAY
    ? { headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] }
    : { args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: +(process.env.DPR || 3), isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' });
  await ctx.addInitScript(() => { try { localStorage.setItem('bh-quality', 'low'); localStorage.setItem('bh-onboard', '1'); } catch (e) { /* storage blocked */ } });
  await ctx.addInitScript(require('./gl_mem').hook);
  // every program linked, with the second and whether the flight was on
  await ctx.addInitScript(() => {
    const L = window.__links = [];
    for (const proto of [WebGL2RenderingContext.prototype, WebGLRenderingContext.prototype]) {
      const link = proto.linkProgram;
      proto.linkProgram = function (p) { let fly = null; try { const o = window.__game && window.__game.overture && window.__game.overture(); fly = !!(o && o.active); } catch (e) { /* not yet */ } L.push([performance.now() / 1000, fly]); return link.call(this, p); };
    }
  });
  const p = await ctx.newPage();
  const levels = [];
  p.on('console', m => { const t = m.text(); if (/^hero \w+:/.test(t)) levels.push(t); });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const until = (fn, arg, ms = 600000) => p.waitForFunction(fn, arg, { timeout: ms, polling: 250 });
  const press = async sel => { await until(s => { const e = document.querySelector(s); return e && e.getBoundingClientRect().width > 0; }, sel); await p.evaluate(s => document.querySelector(s).click(), sel); };
  // the title's press (the street and the name), and a tap anywhere opens its menu
  await until(() => window.__game && window.__game.screen && window.__game.screen() === 'press', null, 900000);
  await p.waitForTimeout(1500);
  await p.touchscreen.tap(195, 422);
  await until(() => window.__game.screen() === 'menu');
  await press('#gt-walk-go');
  await until(() => window.__game.screen() === 'who');
  await press('#gt-who .gt-who-row [data-c="M"]'); await p.waitForTimeout(800);
  await press('#gt-who-go');
  await press('#gt-walk-set');
  // the levels fetched: hero.js logs "hero <id>: n materials, ready in ..." once ready; which are loading is read in the page
  const seen = new Map();
  const poll = () => p.evaluate(() => { const g = window.__game, o = g.overture && g.overture(); return { fly: !!(o && o.active), t: o ? +o.t.toFixed(1) : 0, gpu: Math.round(window.__mem.sum / 1048576), peak: Math.round(window.__mem.peak / 1048576),
    levels: (g.hero && g.hero() ? g.hero().state() : []) }; }).catch(() => null);
  await until(() => { const o = window.__game.overture && window.__game.overture(); return o && o.active; });
  const t0 = Date.now(); let flew = true, landed = 0, last = null;
  const fetchedInFlight = [];
  while (true) {
    const s = await poll();
    if (s) {
      last = s;
      for (const L of s.levels) if (L.state !== 'idle' && !seen.has(L.id)) { seen.set(L.id, s.fly); if (s.fly) fetchedInFlight.push(L.id); console.log(`${((Date.now() - t0) / 1000).toFixed(0).padStart(4)} s  ${L.id} fetched ${s.fly ? `in the flight (t ${s.t} s)` : 'after it'}; GPU ${s.gpu} MB`); }
      if (flew && !s.fly) { flew = false; landed = Date.now(); console.log(`${((Date.now() - t0) / 1000).toFixed(0).padStart(4)} s  the flight is over; GPU ${s.gpu} MB`); }
    }
    if (!flew && Date.now() - landed > after * 1000) break;
    if (Date.now() - t0 > 1800000) { console.log('(the flight did not end in 30 minutes)'); break; }
    await p.waitForTimeout(500);
  }
  const links = await p.evaluate(() => window.__links);
  console.log(`programs linked in the flight ${links.filter(l => l[1] === true).length}, after it ${links.filter(l => l[1] === false).length}, before it ${links.filter(l => l[1] === null).length}`);
  for (const l of levels) console.log(`  ${l}`);
  console.log(`peak GPU ${last ? last.peak : '?'} MB, at the end ${last ? last.gpu : '?'} MB; levels held at the end: ${last ? last.levels.filter(L => L.state !== 'idle').map(L => L.id).join(', ') : '?'}`);
  await b.close();
  process.exit(fetchedInFlight.length ? 1 : 0);
})();
