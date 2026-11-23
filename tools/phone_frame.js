// What a phone's frame asks of the GPU at the title and on foot at the Scramble (docs/PERFORMANCE.md, "A phone's frame
// halved"): the page as an iPhone (390 x 844 at three pixels to the point, touch, its user agent, the low tier), its
// title counted, then the map on foot (?walk=1, the builder's walk, from the map's start by Hachiko) counted facing each
// of four ways, a still of each. The counts are the page's own asks (tools/beat_count.js), the same under a software
// renderer as on a GPU; what WebGL holds is tools/gl_mem.js's.
//   JOB_WAIT=540 tools/job.sh run frame -- xvfb-run -a node tools/phone_frame.js [out dir]
// PORT (8800), QUERY=&a=b added to both pages' addresses, SIZE=390x844, BY=1 the heaviest things drawn on foot, by name,
// SETTLE=s on foot before counting (20), HOUR=19.5 the walk's clock (dusk), STILLS=0 none.
const { chromium } = require('playwright');
const fs = require('fs');
const out = process.argv[2] || 'out/phone_frame';
fs.mkdirSync(out, { recursive: true });
const [W, H] = (process.env.SIZE || '390x844').split('x').map(Number), PORT = process.env.PORT || 8800, Q = process.env.QUERY || '';
const BY = !!process.env.BY, STILLS = process.env.STILLS !== '0';
const line = (name, c) => `${name.padEnd(14)} ${String(c.draws).padStart(5)} draws ${String(Math.round(c.tris / 1000)).padStart(6)}k triangles ${String(c.passes).padStart(3)} passes  ${c.gpu_mb} MB GPU  canvas ${(c.canvas || []).join('x')}`;
(async () => {
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const page = async () => {
    const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 3, hasTouch: true, isMobile: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' });
    p.on('pageerror', e => console.log('pageerror:', String(e).slice(0, 300)));
    await p.addInitScript(() => { try { localStorage.setItem('bh-quality', 'low'); } catch (e) { /* storage blocked */ } });
    await p.addInitScript(require('./gl_mem').hook);
    await p.addInitScript(require('./beat_count').hook);
    if (BY) await p.addInitScript(() => { window.__beat.top = 400; }); // (every thing drawn, by name, not the heaviest forty)
    return p;
  };
  const rows = [];
  // the title, as the page opens on it
  {
    const p = await page();
    await p.goto(`http://localhost:${PORT}/${Q ? `?${Q.replace(/^&/, '')}` : ''}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
    await p.waitForTimeout(8000);
    const c = await require('./beat_count').sample(p, 3, BY);
    rows.push(['title', c]); console.log(line('title', c));
    if (STILLS) await p.screenshot({ path: `${out}/title.png` });
    await p.close();
  }
  // on foot at the Scramble, the walk's dusk
  {
    const p = await page();
    await p.goto(`http://localhost:${PORT}/?walk=1${Q}#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 900000 });
    await p.waitForFunction(() => { const l = document.getElementById('g-loader'); return !l || l.hidden; }, null, { timeout: 900000, polling: 500 });
    // as tools/game_shot.js starts the game on foot: Play pressed until the title goes, the arrival settled, no tour, and
    // what comes after the game can be played in place (two minutes at most)
    await p.waitForFunction(() => !document.getElementById('g-title').hidden, null, { timeout: 300000 }).catch(() => {});
    await require('./start_play').startPlay(p);
    for (let i = 0; i < 60 && !(await p.evaluate(() => { const t = document.getElementById('g-title'); return !t || t.hidden; })); i++) {
      await p.evaluate(() => { const b = document.getElementById('gt-play'); if (b) b.click(); });
      await p.waitForTimeout(1000);
    }
    await p.evaluate(async () => {
      const g = window.__game;
      for (let t = 0; t < 10 && (!g.arriving || !g.arriving()); t += 0.25) await new Promise(r => setTimeout(r, 250));
      for (let t = 0; t < 10 && g.arriving && g.arriving(); t += 0.25) { g.settleArrival(); g.advance(0.25); await new Promise(r => requestAnimationFrame(r)); }
      const O = window.OEOnboard, t = O && O.current && O.current(); if (t) t.skip();
      if (g.cine && g.cine.active) g.cine.skip();
    });
    await p.evaluate(() => { const g = window.__game, T = g.Wd && g.Wd.trees, cap = ms => new Promise(r => setTimeout(r, ms));
      return Promise.all([T && T.loadNear ? Promise.race([T.loadNear(), cap(120000)]) : null, g.lateReady ? Promise.race([g.lateReady(), cap(120000)]) : null]); });
    await p.evaluate(h => { const g = window.__game, c = g.clock; g.setClock(c.y, c.m, c.d, Math.round(h * 60)); if (g.weather) g.weather.set('clear', { now: true }); }, +(process.env.HOUR || 19.5));
    await p.waitForTimeout(1000 * +(process.env.SETTLE || 20));
    const all = [];
    for (let k = 0; k < 4; k++) {
      await p.evaluate(k => { const g = window.__game; g.player.h = (g.player.h0 ?? (g.player.h0 = g.player.h || 0)) + k * Math.PI / 2; Object.assign(g.cam, { mode: 'chase', yaw: g.player.h, pitch: 0.12, dist: 5.5, distTo: 0, yawTo: null, lastInput: -10 }); }, k);
      await p.waitForTimeout(2500);
      const c = await require('./beat_count').sample(p, 3, BY);
      all.push(c); rows.push([`foot ${k * 90}`, c]); console.log(line(`foot ${k * 90}°`, c));
      if (STILLS) await p.screenshot({ path: `${out}/foot-${k * 90}.png` });
    }
    if (BY) {
      const heavy = all.sort((x, y) => y.tris - x.tris)[0];
      for (const g of heavy.groups.slice(0, 25)) console.log(`   ${String(g.draws).padStart(4)} ${String(Math.round(g.tris / 100) / 10).padStart(7)}k  ${g.group}`);
    }
    await p.close();
  }
  fs.writeFileSync(`${out}/frame.json`, JSON.stringify(rows.map(([name, c]) => ({ name, draws: c.draws, tris: c.tris, passes: c.passes, gpu_mb: c.gpu_mb, canvas: c.canvas, groups: c.groups })), null, 1));
  await b.close();
})();
