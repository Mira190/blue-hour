// The picture a shared link shows (web/og.jpg, 1200x630; web/index.html og:image): the story's title as the page
// itself draws it, the Scramble at the blue hour under the name, with the prompt to press a key taken off (a link's
// preview is not a screen to press). Taken from the real page at twice the size and brought down, so the type is clean.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/og_shot.js [out_dir]      (GPU=metal on a Mac)   WRITE=1: also writes web/og.jpg (Pillow)
// It prints the picture's mean brightness and that of the name's band, and fails a page error or a picture too dark
// or too bright to be the title.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const [,, out = '/tmp/og-shot'] = process.argv;
const ROOT = path.join(__dirname, '..');
(async () => {
  const args = process.env.GPU === 'metal' ? ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-gpu']
    : ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
  const errors = [];
  p.on('pageerror', e => { errors.push(String(e)); console.log('pageerror:', String(e).slice(0, 300)); });
  fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(() => { try { localStorage.setItem('bh-quality', 'high'); } catch (e) { /* storage blocked */ } });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden && t.dataset.screen === 'press'; }, null, { timeout: 900000, polling: 500 });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(+process.env.SETTLE || 8000); // (the name and its line come in over a few seconds, and the street's lights with them)
  // (the prompt, and the meteor if one is crossing: neither is the title's picture)
  await p.addStyleTag({ content: '.gt-press .go { visibility: hidden !important; } #g-title *, #g-title *::before, #g-title *::after { animation-play-state: paused !important; }' });
  await p.evaluate(() => { for (const a of document.getAnimations()) if (a.animationName === 'g-story-meteor') a.cancel(); });
  await p.waitForTimeout(400);
  const png = path.join(out, 'og@2x.png');
  await p.screenshot({ path: png });
  await b.close();
  const jpg = process.env.WRITE ? path.join(ROOT, 'web', 'og.jpg') : path.join(out, 'og.jpg');
  const stat = execFileSync('python3', ['-c', `
import sys
from PIL import Image, ImageStat
im = Image.open(sys.argv[1]).convert('RGB').resize((1200, 630), Image.LANCZOS)
im.save(sys.argv[2], quality=86, optimize=True, progressive=True, subsampling=0)
g = im.convert('L'); w, h = g.size
print(round(ImageStat.Stat(g).mean[0], 1), round(ImageStat.Stat(g.crop((0, int(h * 0.35), w, int(h * 0.6)))).mean[0], 1))
`, png, jpg]).toString().trim();
  const [mean, band] = stat.split(' ').map(Number);
  console.log(`${jpg}: ${Math.round(fs.statSync(jpg).size / 1024)} kB, mean brightness ${mean}, the name's band ${band}`);
  let bad = errors.length;
  if (!(mean > 18 && mean < 150)) { console.log(`FAIL the picture's mean brightness is ${mean}: not the title at the blue hour`); bad++; }
  process.exit(bad ? 1 : 0);
})();
