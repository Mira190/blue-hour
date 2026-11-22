// The sky's light taken afresh, counted apart from the frame it falls in (tools/beat_count.js, issue 151): the map
// without its story opened, a frame counted as it is, then the clock moved three hours inside a counted frame so
// that world.js setSun takes the sky's light again. Fails unless the second count says sky_refresh and its draws are
// not in the frame's own.
//   xvfb-run -a node tools/sky_count.js
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
(async () => {
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  await p.addInitScript(require('./beat_count').hook);
  await p.addInitScript(() => { try { localStorage.setItem('bh-quality', 'high'); } catch (e) { /* storage blocked */ } });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 900000 });
  await startPlay(p, { timeout: 900000, asIs: true });
  await p.waitForTimeout(3000);
  const count = move => p.evaluate(move => new Promise(r => {
    const B = window.__beat, g = window.__game;
    requestAnimationFrame(() => { B.begin(); if (move) { const c = g.clock; g.setClock(c.y, c.m, c.d, (c.min + 180) % 1440); } requestAnimationFrame(() => r(B.end())); });
  }), move);
  const a = await count(false), c = await count(true);
  const line = x => `draws ${x.draws}, triangles ${(x.tris / 1e6).toFixed(2)} M, targets ${x.scene_targets}, sky_refresh ${x.sky_refresh} (${x.sky_draws} draws)`;
  console.log(`a frame as it is: ${line(a)}`);
  console.log(`the clock moved three hours in it: ${line(c)}`);
  const ok = c.sky_refresh >= 1 && c.sky_draws > 0 && c.scene_targets <= a.scene_targets + 1;
  console.log(ok ? 'ok   the sky\'s light taken afresh is counted apart from the frame' : 'FAIL the sky\'s refresh was not counted apart');
  await b.close();
  process.exit(ok ? 0 : 1);
})();
