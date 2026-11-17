// The title as a visitor finds it: the crossing held behind it (game.js titleHold), and time let go on Play.
// Stills of the title four seconds apart (the camera has moved, the crowd has not), with its meteor held mid-flight
// (story.css g-story-meteor), then across Play; fails if anyone on the crossing moved while the title stood, if nobody
// is out on the road, or if nobody moved once time was let go.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/title_shot.js out_dir [WxH]          (GPU=metal on a Mac)
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/title-shot', size = '1440x900'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number);
  fs.mkdirSync(out, { recursive: true });
  const args = process.env.GPU === 'metal' ? ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-gpu'] : process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: w < 500, hasTouch: w < 500 });
  let bad = 0; const fail = m => { bad++; console.log(`FAIL ${m}`); };
  p.on('pageerror', e => fail(`pageerror: ${String(e).slice(0, 200)}`));
  await p.addInitScript(t => { try { localStorage.setItem('oe3d-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  await p.goto(`http://localhost:${process.env.PORT || 8800}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'), l = document.getElementById('g-loader'); return window.__game && t && !t.hidden && l.hidden; }, null, { timeout: 900000, polling: 500 });
  const crowd = () => p.evaluate(() => { const g = window.__game, c = g.crowd, P = c.P.slice(0, c.active).filter(q => q.line >= 0); return { n: P.length, road: P.filter(q => q.pz && q.ph === 'cross').length, sum: P.reduce((a, q) => a + q.x * 3 + q.y, 0), cam: [g.camera.position.x, g.camera.position.y, g.camera.position.z].map(v => +v.toFixed(2)) }; });
  await p.waitForTimeout(3000);
  const a = await crowd(); await p.screenshot({ path: `${out}/title-1.png` });
  await p.waitForTimeout(4000);
  const c = await crowd(); await p.screenshot({ path: `${out}/title-2.png` });
  console.log(`the title: ${a.n} people, ${a.road} out on the crossing; camera ${a.cam} then ${c.cam}`);
  if (a.road < 20) fail(`only ${a.road} people are out on the crossing behind the title`);
  if (Math.abs(a.sum - c.sum) > 1e-6) fail('the crowd moved while the title stood');
  if (String(a.cam) === String(c.cam)) fail('the camera did not move through the held street');
  await p.screenshot({ path: `${out}/title-${size}.png` });
  // a meteor: its animation held where the streak is at its longest
  const met = await p.evaluate(() => { const a = document.getAnimations().find(x => x.animationName === 'g-story-meteor'); if (!a) return false; a.pause(); a.currentTime = 3000 + 9000 * 0.075; return true; });
  if (met) { await p.waitForTimeout(200); await p.screenshot({ path: `${out}/title-meteor-${size}.png` }); await p.evaluate(() => { const a = document.getAnimations().find(x => x.animationName === 'g-story-meteor'); if (a) a.play(); }); }
  console.log(met ? 'meteor held' : 'no meteor animation');
  await p.evaluate(() => document.getElementById('gt-play').click());
  await p.waitForTimeout(700); await p.screenshot({ path: `${out}/let-go-1.png` });
  await p.waitForTimeout(700); const d = await crowd(); await p.screenshot({ path: `${out}/let-go-2.png` });
  if (Math.abs(d.sum - c.sum) < 0.5) fail('nobody moved once time was let go');
  await p.waitForFunction(() => document.getElementById('g-title').hidden, null, { timeout: 60000 }).catch(() => fail('the game did not begin after Play'));
  console.log(bad ? `title: ${bad} failed` : 'ok   title  the crossing is held behind the title, and moves on Play');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
