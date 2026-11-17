// The loading screen's three pictures (web/index.html, .roll-art): the crossing, the helicopter over the roof, the
// district from the air, each dissolved into the next. They came round once in thirty seconds, and a desktop's load is
// nine to eleven, so the loader had gone before the second came up and a player saw one picture. This checks that all
// three come up within a load, in order, and that a dissolve never lets the frame dip (one picture coming up over the
// other at full strength, not two half-strength pictures over black). It takes stills of each picture and of a dissolve
// at a desktop's and a phone's size, the animations held at the moment (so the stills do not depend on how fast the
// machine loads), and then lets them run while the map builds and reads which picture is up after a few seconds.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/loader_roll.js [out_dir]
// Exits 1 if a picture never comes up in the first LOAD seconds (default 9: a desktop's load), if they come up out of
// order, if the frame dips below 98% covered at any moment, or if the loader goes before the stills are taken.
const { chromium } = require('playwright');
const fs = require('fs');
const out = process.argv[2] || '/tmp/loader-roll';
const LOAD = +(process.env.LOAD || 9);
fs.mkdirSync(out, { recursive: true });
(async () => {
  const args = process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  let bad = 0;
  const fail = m => { bad++; console.log('FAIL', m); };
  for (const [w, h, tag] of [[1440, 900, 'desktop'], [390, 844, 'phone']]) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 500, isMobile: w < 500 });
    p.on('pageerror', e => console.log('pageerror:', String(e).slice(0, 200)));
    await p.goto(`http://localhost:${process.env.PORT || 8800}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await p.waitForFunction(() => document.querySelectorAll('.roll-art').length === 3, null, { timeout: 60000 });
    // the pictures decoded, so that a still shows them and not the black under them
    await p.evaluate(() => Promise.all([...document.querySelectorAll('.roll-art')].map(el => {
      const img = new Image(); img.src = getComputedStyle(el).backgroundImage.replace(/^url\("?|"?\)$/g, ''); return img.decode();
    })));
    // the timeline, read by holding the three animations at each moment: how much of each picture is seen (the later
    // ones lie over the earlier), and how much of the frame is covered
    const tl = await p.evaluate(() => {
      const els = [...document.querySelectorAll('.roll-art')], an = els.map(e => e.getAnimations()[0]);
      if (an.some(a => !a)) return null;
      const T = an[0].effect.getComputedTiming().duration, rows = [];
      an.forEach(a => a.pause());
      for (let t = 0; t <= T * 1.5; t += 50) {
        an.forEach(a => { a.currentTime = t; });
        const o = els.map(e => +getComputedStyle(e).opacity);
        const seen = [o[0] * (1 - o[1]) * (1 - o[2]), o[1] * (1 - o[2]), o[2]];
        rows.push({ t, o, seen, cover: 1 - (1 - o[0]) * (1 - o[1]) * (1 - o[2]) });
      }
      return { T, rows };
    });
    if (!tl) { fail(`${tag}: the pictures have no animation (reduced motion, or the CSS did not apply)`); await p.close(); continue; }
    const dips = tl.rows.filter(r => r.cover < 0.98);
    if (dips.length) fail(`${tag}: the frame dips to ${(Math.min(...dips.map(r => r.cover)) * 100).toFixed(0)}% covered at ${dips[0].t} ms`);
    const order = [];
    for (const r of tl.rows) { const k = r.seen.indexOf(Math.max(...r.seen)); if (order[order.length - 1]?.k !== k) order.push({ k, t: r.t }); }
    console.log(`${tag}: a turn of ${tl.T / 1000} s; the picture most seen:`, order.map(x => `${['crossing', 'helicopter', 'air'][x.k]} from ${(x.t / 1000).toFixed(2)} s`).join(', '));
    const first = [0, 1, 2].map(k => order.find(x => x.k === k));
    first.forEach((x, k) => { if (!x || x.t > LOAD * 1000) fail(`${tag}: picture ${k + 1} is not up in the first ${LOAD} s`); });
    if (first.every(Boolean) && !(first[0].t < first[1].t && first[1].t < first[2].t)) fail(`${tag}: the pictures come up out of order`);
    // stills, held: each picture at its fullest and two dissolves (the second into the third, and the third back into the first)
    for (const [ms, name] of [[1500, 'crossing'], [5900 + 550, 'dissolve-to-air'], [4700, 'helicopter'], [8200, 'air'], [9950, 'dissolve-to-crossing']]) {
      const up = await p.evaluate(t => {
        if (document.getElementById('g-loader').hidden) return false;
        document.querySelectorAll('.roll-art').forEach(e => { const a = e.getAnimations()[0]; a.pause(); a.currentTime = t; });
        document.querySelectorAll('.roll-title').forEach(e => e.getAnimations().forEach(a => a.finish())); // (the title risen)
        return true;
      }, ms);
      if (!up) { fail(`${tag}: the loader went before the stills were taken`); break; }
      await p.waitForTimeout(150);
      await p.screenshot({ path: `${out}/${tag}-${String(ms).padStart(5, '0')}-${name}.png` });
    }
    // and running, while the map builds on the main thread: the animations go on by themselves from where they are put
    await p.evaluate(() => document.querySelectorAll('.roll-art').forEach(e => { const a = e.getAnimations()[0]; a.currentTime = 0; a.play(); }));
    const t0 = Date.now(), live = [];
    for (const at of [1000, 4700, 8200]) {
      await p.waitForTimeout(Math.max(0, at - (Date.now() - t0)));
      const r = await p.evaluate(() => {
        if (document.getElementById('g-loader').hidden) return null;
        const els = [...document.querySelectorAll('.roll-art')], o = els.map(e => +getComputedStyle(e).opacity), seen = [o[0] * (1 - o[1]) * (1 - o[2]), o[1] * (1 - o[2]), o[2]];
        return { t: Math.round(els[0].getAnimations()[0].currentTime), k: seen.indexOf(Math.max(...seen)) };
      });
      if (!r) { console.log(`${tag}: the loader went at ${Date.now() - t0} ms`); break; }
      live.push(`${(at / 1000).toFixed(1)} s by the clock (${(r.t / 1000).toFixed(1)} s by the animation): ${['crossing', 'helicopter', 'air'][r.k]}`);
    }
    console.log(`${tag} running:`, live.join('; '));
    await p.close();
  }
  await b.close();
  console.log(bad ? `${bad} failed` : 'ok', '· stills in', out);
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
