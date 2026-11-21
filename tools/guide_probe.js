// The story's guide dog walked along its ways with a player following it: from the kerb to Hachiko (round the
// planters' rails by the statue) and up to the lift's doors at Scramble Square (between its queue belts). Every
// frame it checks that the dog stands where a walker may (nav.walk), his body clear of every post, trunk and belt, and on the
// player's floor; it takes a still behind the player at the end of each way, and exits 1 on any fault.
//   python3 -m http.server 8800 --directory web &
//   node tools/guide_probe.js out_dir [WxH]          (GPU=metal on a Mac; under xvfb-run -a elsewhere)
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/guide-probe', size = '1440x900'] = process.argv;
const WAYS = [
  { name: 'kerb-to-hachiko', from: [376.9, -1013.1], to: [374.3, -1041.5] },
  { name: 'hachiko-round-the-planters', from: [368.5, -1046.0], to: [384.0, -1036.0] },
  { name: 'street-to-lift', from: [528.53, -1080.44], to: [535.04, -1077.89] }, // (in through either door in the west front of SKY's hall: cities/shibuya/hero_skylobby.py)
  { name: 'side-to-lift', from: [532.29, -1073.6], to: [535.04, -1077.89] }, // (from the hall's north side, round to its doors)
];
(async () => {
  const [w, h] = size.split('x').map(Number);
  const args = process.env.GPU === 'metal' ? ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-gpu']
    : ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 500, isMobile: w < 500 });
  const errors = [];
  p.on('pageerror', e => { errors.push(String(e)); console.log('pageerror:', String(e).slice(0, 300)); });
  fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  await p.goto(`http://localhost:${process.env.PORT || 8800}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.evaluate(() => document.getElementById('gt-play').click());
  // through the prologue to the first Stop, where the dog comes
  const t0 = Date.now();
  while (Date.now() - t0 < 300000) {
    const s = await p.evaluate(() => { const st = window.__game.story.state, d = document.getElementById('gd'); return { dog: !!st.dog, dlg: d && !d.hidden }; });
    if (s.dog) break;
    if (s.dlg) await p.evaluate(() => document.getElementById('gd').click());
    await p.waitForTimeout(400);
  }
  // the lift's set is placed with the episode; its belts are posts in nav.posts
  let fails = 0;
  for (const wy of WAYS) {
    const r = await p.evaluate(wy => new Promise(done => {
      const g = window.__game, st = g.story.state, dog = st.dog, pl = g.player, nav = g.nav;
      pl.x = wy.from[0]; pl.y = wy.from[1]; const f = nav.floorAt(pl.x, pl.y, 400); pl.z = f ? f.z : pl.z;
      dog.place(wy.from[0] + 1.2, wy.from[1] + 0.8, 0); dog.lead(wy.to, 1.2);
      const bad = [], BODY = (dog.reach || 0.7) - 0.04; let n = 0, t = 0; // (his reach as his model has it, companion.js body, less the pushOut's last few centimetres)
      const iv = setInterval(() => {
        t += 0.05;
        // the player follows a couple of metres behind the dog, as a walker does
        const dx = dog.x - pl.x, dy = dog.y - pl.y, d = Math.hypot(dx, dy);
        if (d > 2.2) { const k = Math.min(1.4 * 0.05, d - 2.2) / d, m = nav.slide(pl.x, pl.y, pl.z, dx * k, dy * k); if (nav.walk(m.x, m.y, pl.z, true).ok) { pl.x = m.x; pl.y = m.y; } pl.h = Math.atan2(dx, dy); if (g.cam) g.cam.yaw = pl.h; }
        n++;
        const w = nav.walk(dog.x, dog.y, dog.z, true);
        let post = null;
        g.posts.near(dog.x, dog.y, BODY, q => { if (Math.hypot(q.x - dog.x, q.y - dog.y) < q.r + BODY) post = q.kind; }, dog.z); // (his body, not only his middle: a belt passed through him)
        if (!w.ok || post || Math.abs(dog.z - pl.z) > 1.5) bad.push([+dog.x.toFixed(2), +dog.y.toFixed(2), w.ok ? '' : w.why, post || '', +(dog.z - pl.z).toFixed(2)]);
        if (dog.state === 'sit' || t > 60) { clearInterval(iv); done({ n, t: +t.toFixed(1), state: dog.state, at: [+dog.x.toFixed(2), +dog.y.toFixed(2)], left: +Math.hypot(dog.x - wy.to[0], dog.y - wy.to[1]).toFixed(2), bad: bad.slice(0, 8), nbad: bad.length }); }
      }, 50);
    }), wy);
    const ok = !r.nbad && r.state === 'sit';
    if (!ok) fails++;
    console.log(ok ? 'ok  ' : 'FAIL', wy.name, JSON.stringify(r));
    await p.waitForTimeout(800);
    await p.screenshot({ path: `${out}/${wy.name}.png` });
  }
  console.log(`page errors: ${errors.length}`);
  await b.close();
  process.exit(fails || errors.length ? 1 : 0);
})();
