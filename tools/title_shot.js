// Stills of the story's title as a player first sees it: once it has settled, and with its meteor held mid-flight.
//   python3 -m http.server 8800 --directory web &
//   node tools/title_shot.js out_dir [WxH]          (GPU=metal on a Mac; under xvfb-run -a elsewhere)
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/title-shot', size = '1440x900'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number);
  const args = process.env.GPU === 'metal' ? ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-gpu']
    : ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 500, isMobile: w < 500 });
  const errors = [];
  p.on('pageerror', e => { errors.push(String(e)); console.log('pageerror:', String(e).slice(0, 300)); });
  fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(t => { try { localStorage.setItem('oe3d-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  await p.goto(`http://localhost:${process.env.PORT || 8800}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.waitForTimeout(6000);
  await p.screenshot({ path: `${out}/title-${size}.png` });
  // a meteor (story.css g-story-meteor): its animation held where the streak is at its longest
  const got = await p.evaluate(() => { const a = document.getAnimations().find(x => x.animationName === 'g-story-meteor'); if (!a) return false; a.pause(); a.currentTime = 3000 + 9000 * 0.075; return true; });
  if (got) { await p.waitForTimeout(200); await p.screenshot({ path: `${out}/title-meteor-${size}.png` }); }
  console.log(got ? 'meteor held' : 'no meteor animation', `page errors: ${errors.length}`);
  await b.close();
  process.exit(errors.length ? 1 : 0);
})();
