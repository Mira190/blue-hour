// The frame's cost part by part on the walk (game/perf.js, the page's own ?perf), from a harness: the walk set out at an
// hour and sky, the desktop's tier, and the table printed when perf.js has measured it. A software renderer's times are
// not a GPU's, but what a part costs against the others (the post stack, the shadows, the multisampling, a group of the
// scene) points at what to make cheaper first; a real device's own table comes with ?perf in its telemetry.
//   cd web && python3 -m http.server 8800 &
//   xvfb-run -a node tools/perf_walk.js [WxH] [night|blue] [clear|rain]
// GOV=0.65/0 starts the governor where a device held it (scale/extras); DPR=2 a dense display.
const { chromium } = require('playwright');
const [,, size = '960x720', hour = 'night', sky = 'clear'] = process.argv;
const PORT = process.env.PORT || 8800;
(async () => {
  const [w, h] = size.split('x').map(Number);
  const b = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: +(process.env.DPR || 1) });
  await p.addInitScript(t => { try { localStorage.setItem('oe3d-quality', t); localStorage.setItem('oe3d-onboard', JSON.stringify({ done: 1 })); localStorage.setItem('oe3d-player', 'W'); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  await p.addInitScript(s => { try { sessionStorage.setItem('oe-walk-auto', s); } catch (e) { /* storage blocked */ } }, JSON.stringify({ t: hour, w: sky }));
  const errors = [];
  p.on('pageerror', e => errors.push(String(e)));
  const done = new Promise(res => p.on('console', m => { const t = m.text(); if (t.startsWith('perf ')) res(JSON.parse(t.slice(5))); }));
  const t0 = Date.now();
  await p.goto(`http://localhost:${PORT}/?perf${process.env.GOV ? `&gov=${process.env.GOV}` : ''}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => document.getElementById('game-stage') && document.getElementById('game-stage').classList.contains('walk-on'), null, { timeout: 1200000, polling: 1000 });
  console.log(`on the walk after ${Math.round((Date.now() - t0) / 1000)} s`);
  const rows = await Promise.race([done, new Promise((_, rej) => setTimeout(() => rej(new Error('perf.js did not finish in 40 minutes')), 2400000))]);
  const info = await p.evaluate(() => { const g = window.__game; return { scale: g.governor.scale, extras: g.governor.extras, ladder: g.governor.ladder }; });
  console.log(JSON.stringify(info));
  for (const r of rows) console.log(`${r.name.padEnd(36)} ${r.ms.toFixed(1).padStart(8)} ${r.d == null ? '' : `costs ${r.d.toFixed(1)}`.padEnd(14)} ${r.note || ''}`);
  if (errors.length) console.log(`page errors: ${errors.slice(0, 5).join(' | ')}`);
  await b.close().catch(() => {});
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
