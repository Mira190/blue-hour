// The menu's Title screen timed against a cold load (menus.js #gm-title): on a phone's page (390x844, touch, the low
// tier) or a desktop's, the seconds from the page opened to the title's menu usable, then from the press of Title screen
// in a kept case's pause to the title's menu usable again; and stills through the second load every half second, to
// see that the way out is the loader's plate and never a white page.
//   xvfb-run -a node tools/title_time.js out_dir [WxH]
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/title-time', size = '390x844'] = process.argv;
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const [w, h] = size.split('x').map(Number), phone = w < 500;
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--use-gl=angle', '--use-angle=gl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, hasTouch: phone, isMobile: phone });
  const PORT = process.env.PORT || 8800, Q = phone ? '?tier=low' : '';
  let net = 0, cached = 0;
  p.on('response', r => { net++; if (r.fromServiceWorker() || r.status() === 304) cached++; });
  // a case kept at frame 3 (as tools/story_play.js FROM seeds it), once
  await p.addInitScript(() => { try { if (sessionStorage.getItem('tt-seeded')) return; sessionStorage.setItem('tt-seeded', '1'); localStorage.setItem('bh-player', 'W'); localStorage.setItem('bh-story-late', JSON.stringify({ fi: 2, left: 5, prints: [0, 1].map(i => ({ src: null, stamp: `frame ${i + 1}`, cap: '' })) })); } catch (e) { /* storage blocked */ } });
  const usable = () => p.waitForFunction(() => { const t = document.getElementById('g-title'), l = document.getElementById('g-loader'), c = document.getElementById('gt-cont-go'); return window.__game && t && !t.hidden && l && l.hidden && c && !c.hidden && c.getBoundingClientRect().height > 0; }, null, { timeout: 900000, polling: 100 });
  let t0 = Date.now();
  await p.goto(`http://localhost:${PORT}/${Q}`, { waitUntil: 'commit', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 100 });
  await p.evaluate(() => window.__game.titleScreen('menu'));
  await usable();
  const cold = (Date.now() - t0) / 1000, coldN = net;
  console.log(`cold load to the title's menu: ${cold.toFixed(1)} s, ${coldN} responses`);
  await p.click('#gt-cont-go');
  await p.waitForFunction(() => { const s = window.__game.story.state, t = document.getElementById('g-title'); return t.hidden && s.fi === 2 && s.phase !== 'idle' && s.phase !== 'dressed'; }, null, { timeout: 900000, polling: 250 });
  await p.waitForTimeout(3000);
  const before = await p.evaluate(() => { const s = window.__game.story.state; return { fi: s.fi, prints: s.prints.length, roll: document.querySelector('#g-story-frames b') ? document.querySelector('#g-story-frames b').textContent : '' }; });
  await p.click('#g-story-menu'); await p.waitForTimeout(600);
  net = 0; cached = 0;
  const shots = []; let shooting = true;
  t0 = Date.now();
  const shoot = (async () => { for (let i = 0; shooting && i < 120; i++) { const f = `${out}/reload-${String(i).padStart(3, '0')}.png`; try { await p.screenshot({ path: f, timeout: 5000 }); shots.push([f, (Date.now() - t0) / 1000]); } catch (e) { /* between documents */ } await new Promise(r => setTimeout(r, 500)); } })();
  await p.click('#gm-title');
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden && t.dataset.screen === 'menu'; }, null, { timeout: 900000, polling: 100 });
  await usable();
  const again = (Date.now() - t0) / 1000;
  shooting = false; await shoot;
  console.log(`Title screen to the title's menu: ${again.toFixed(1)} s, ${net} responses (${cached} from a cache by status)`);
  // a white page: a still whose mean is near white
  const white = [];
  for (const [f, t] of shots) { const m = await p.evaluate(async src => { const i = new Image(); i.src = src; await i.decode(); const c = document.createElement('canvas'); c.width = 32; c.height = 32; const x = c.getContext('2d'); x.drawImage(i, 0, 0, 32, 32); const d = x.getImageData(0, 0, 32, 32).data; let s = 0; for (let k = 0; k < d.length; k += 4) s += d[k] + d[k + 1] + d[k + 2]; return s / (d.length / 4) / 3; }, `data:image/png;base64,${fs.readFileSync(f).toString('base64')}`); if (m > 200) white.push(`${t.toFixed(1)} s`); }
  console.log(white.length ? `FAIL white stills at ${white.join(', ')}` : `ok   no white still in ${shots.length} through the load`);
  await p.click('#gt-cont-go');
  await p.waitForFunction(() => { const s = window.__game.story.state, t = document.getElementById('g-title'); return t.hidden && s.fi === 2 && s.phase !== 'idle' && s.phase !== 'dressed'; }, null, { timeout: 900000, polling: 250 });
  await p.waitForTimeout(3000);
  const after = await p.evaluate(() => { const s = window.__game.story.state; return { fi: s.fi, prints: s.prints.length, roll: document.querySelector('#g-story-frames b') ? document.querySelector('#g-story-frames b').textContent : '' }; });
  console.log(`${JSON.stringify(before) === JSON.stringify(after) ? 'ok  ' : 'FAIL'} the case before and after: ${JSON.stringify(before)} / ${JSON.stringify(after)}`);
  await b.close();
})();
