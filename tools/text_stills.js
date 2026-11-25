// What a frame puts over the street to read, as it begins and once the player has walked on (story.js goal, "read, then
// folded"): a case kept at frame n taken up from the title, a still 2 s in, then a few steps walked and a still 14 s in;
// and the number of text blocks over the scene at each (the goal's words, its line, a notice, a talk's box, the mark's
// words), with any two that overlap named.
//   xvfb-run -a node tools/text_stills.js out_dir [WxH] [frames, e.g. 3,6]
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/text-stills', size = '390x844', list = '3,6'] = process.argv;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const [w, h] = size.split('x').map(Number), phone = w < 500, tag = phone ? 'phone' : 'desk';
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  for (const n of list.split(',').map(Number)) {
    const p = await b.newPage({ viewport: { width: w, height: h }, hasTouch: phone, isMobile: phone });
    await p.addInitScript(n => { try { localStorage.setItem('bh-player', 'W'); localStorage.setItem('bh-story-late', JSON.stringify({ fi: n - 1, left: 8 - n, prints: Array.from({ length: n - 1 }, (_, i) => ({ src: null, stamp: `frame ${i + 1}`, cap: '' })) })); } catch (e) { /* storage blocked */ } }, n);
    await p.goto(`http://localhost:${process.env.PORT || 8800}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 250 });
    await p.evaluate(() => window.__game.titleScreen('menu')); await p.waitForTimeout(1000);
    await p.evaluate(() => document.getElementById('gt-cont-go').click());
    await p.waitForFunction(n => { const s = window.__game.story.state; return document.getElementById('g-title').hidden && s.fi === n - 1 && s.phase === 'go'; }, n, { timeout: 900000, polling: 250 });
    const blocks = () => p.evaluate(() => {
      const vis = e => { if (!e || e.closest('[hidden]')) return null; const c = getComputedStyle(e), r = e.getBoundingClientRect(); return r.width > 2 && r.height > 2 && c.visibility !== 'hidden' && +c.opacity > 0.1 && e.textContent.trim() ? r : null; };
      const B = [['goal words', '#g-story-goal span'], ['goal line', '#g-story-goal em'], ['eyebrow', '#g-story-goal small'], ['notice', '.g-toasts'], ['talk', '#gd'], ['mark', '#g-story-mark b']].map(([k, s]) => [k, vis(document.querySelector(s))]).filter(x => x[1]);
      const hit = [];
      const own = k => /^goal|eyebrow/.test(k); // (the goal's three parts are one block)
      for (let i = 0; i < B.length; i++) for (let j = i + 1; j < B.length; j++) { const a = B[i][1], c = B[j][1]; if (a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom && !(own(B[i][0]) && own(B[j][0]))) hit.push(`${B[i][0]} over ${B[j][0]}`); }
      return { on: B.map(x => x[0]), hit };
    });
    await p.waitForTimeout(2000);
    await p.screenshot({ path: `${out}/${tag}-f${n}-begins.png` });
    console.log(`${tag} frame ${n} begins: ${JSON.stringify(await blocks())}`);
    await p.keyboard.down('KeyW'); await p.waitForTimeout(1500); await p.keyboard.up('KeyW');
    await p.waitForTimeout(12000);
    await p.screenshot({ path: `${out}/${tag}-f${n}-on.png` });
    console.log(`${tag} frame ${n} walked on: ${JSON.stringify(await blocks())}`);
    await p.close();
  }
  await b.close();
})();
