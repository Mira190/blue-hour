// The loading screen as a visitor first sees it: stills at 1, 3 and 7 seconds after the page is asked for, on a desktop
// and a phone, and how long it was before the drawn skyline (web/skyline.js) was on screen.
//   python3 -m http.server 8800 --directory web &
//   node tools/loader_shot.js out_dir          (under xvfb-run -a for Mesa's renderer; without a display, SwiftShader)
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/loader-shot'] = process.argv;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const args = process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  let bad = 0;
  for (const [name, w, h] of [['desktop', 1440, 900], ['phone', 390, 844]]) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 500, hasTouch: w < 500 });
    p.on('pageerror', e => { bad++; console.log('pageerror:', String(e).slice(0, 200)); });
    const t0 = Date.now();
    await p.goto(`http://localhost:${process.env.PORT || 8800}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    const seen = await p.waitForFunction(() => { const c = document.querySelector('.roll-sky'); return c && c.classList.contains('on'); }, null, { timeout: 20000, polling: 50 }).then(() => Date.now() - t0, () => -1);
    if (seen < 0) { bad++; console.log(`FAIL ${name}: the skyline was not drawn within 20 s`); } else console.log(`ok   ${name}: the skyline on screen ${seen} ms after the page was asked for`);
    for (const t of [1000, 3000, 7000]) { await p.waitForTimeout(Math.max(0, t - (Date.now() - t0))); await p.screenshot({ path: `${out}/${name}-${t / 1000}s.png` }); }
    await p.close();
  }
  await b.close();
  process.exit(bad ? 1 : 0);
})();
