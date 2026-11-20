// The trees near the camera as the game draws them (docs/HERO.md, "The trees up close"): whether the near models, the
// hero models and the bark scans have come once the game can be played, how far the hero models are drawn and how
// many trees draw them at a place, and each bark material's picture. Exits 1 if the hero models or the scans did not
// come, or no tree near the place draws its hero model.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/tree_probe.js            (AT=392,-1014.6: the zelkova by Hachiko's koban; LEAN=1 a phone)
'use strict';
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
(async () => {
  const lean = !!process.env.LEAN;
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const ctx = lean ? await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' }) : b;
  const p = lean ? await ctx.newPage() : await b.newPage({ viewport: { width: 960, height: 600 } });
  await p.addInitScript(t => { try { localStorage.setItem('oe3d-quality', t); localStorage.setItem('oe3d-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } }, lean ? 'low' : 'high');
  const logs = [];
  p.on('console', m => { if (['error', 'warning'].includes(m.type())) logs.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
  p.on('pageerror', e => logs.push(`pageerror: ${String(e).slice(0, 200)}`));
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const l = document.getElementById('g-loader'); return window.__game && (!l || l.hidden); }, null, { timeout: 900000, polling: 500 });
  await startPlay(p);
  const at = (process.env.AT || '392,-1014.6').split(',').map(Number);
  const out = await p.evaluate(async at => {
    const g = window.__game, T = g.Wd.trees;
    const t0 = performance.now();
    await Promise.race([g.lateReady(), new Promise(r => setTimeout(r, 180000))]);
    const late = (performance.now() - t0) / 1000;
    // stand by the place and let the trees sort round the camera
    g.player.x = at[0] - 4; g.player.y = at[1] - 6;
    for (let i = 0; i < 20; i++) { g.advance(0.1); await new Promise(r => requestAnimationFrame(r)); }
    return { late: +late.toFixed(1), near: T.nearReady(), hero: T.hero ? T.hero() : null, tier: window.OEQuality && OEQuality.city().name };
  }, at);
  console.log(JSON.stringify(out, null, 1));
  for (const l of logs.filter(l => /tree|bark|hero/i.test(l))) console.log(l);
  await b.close();
  const h = out.hero;
  process.exit(h && h.species > 0 && h.drawn > 0 && h.barks === h.of ? 0 : 1);
})();
