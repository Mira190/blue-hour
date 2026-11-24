// The story's guide led to frame 4's goal (SKY's lift, Yuna by it) with a player who does not follow his trail: they
// take their own line (the way on foot from where they stand, as a player reading the gold line or the signs would),
// at a run or a walk, and in one run they go ahead of him from the start. The owner's rule for waiting (issue 207):
//   - ahead of the player, he stops and looks back (wait);
//   - behind them (held at a planter, held by the crowd, the player on another line), nothing waits for him: he runs
//     to catch up and pass, or is found at their heels, and the player is never held by him;
//   - he never stands at an obstacle walking on the spot.
// Every game frame it reads: his commanded speed against what he went (a step asked for and not gone, STUCK_S running,
// is a fault, with where); his state 'wait' while the player is further along the way than he is (a fault); the
// player held by him (game.js stops a step into his flank where a wall jams him: their step shorter than asked while
// he is jammed, a fault). Stills behind the player where a fault is first seen and at the end. Exits 1 on any fault.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/guide_follow.js out_dir [WxH]      (RUNS=run,walk,ahead: only those)
const { chromium } = require('playwright');
const { logger: browserLog, watch: watchPage } = require('./browser_watch');
const fs = require('fs');
const [,, out = '/tmp/guide-follow', size = '1440x900'] = process.argv;
const STUCK_S = 1.5, STUCK_M = 0.3;
// the player's line: their own way to the goal (own), at RUN m/s; 'ahead' starts them 6 m along it, past him
// (from: where frame 3 leaves a player who plays on, at Hachiko among the round planters' rails, the owner's way, issue
// 207; else where the page puts a case opened again at frame 4, the kerb)
const HACHIKO = [374.79, -1046.45];
const RUNS = [
  { name: 'hachiko-run', speed: 6, start: 0, from: HACHIKO },
  { name: 'hachiko-walk', speed: 2.4, start: 0, from: HACHIKO },
  { name: 'kerb-run', speed: 6, start: 0 },
  { name: 'ahead', speed: 6, start: 8, from: HACHIKO },
  // (round each of Hachiko Square's two planters, rails 1.75 m out: a start every 45 degrees 3.2 m from the middle, and
  // the first 20 s of the lead only; game.json hero rounds)
  ...[[381.0, -1035.5], [383.6, -1049.2]].flatMap(([x, y], k) => [0, 1, 2, 3, 4, 5, 6, 7].map(i => ({ name: `planter${k + 1}-${i * 45}`, speed: 6, start: 0, from: [x + 3.2 * Math.cos(i * Math.PI / 4), y + 3.2 * Math.sin(i * Math.PI / 4)], until: 20 }))),
].filter(r => !process.env.RUNS || process.env.RUNS.split(',').some(k => r.name.startsWith(k)));
(async () => {
  const [w, h] = size.split('x').map(Number);
  const args = process.env.GPU === 'metal' ? ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-gpu']
    : ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args, logger: browserLog() });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 500, isMobile: w < 500 });
  watchPage(p);
  const errors = [];
  p.on('pageerror', e => { errors.push(String(e)); console.log('pageerror:', String(e).slice(0, 300)); });
  fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || (w < 500 ? 'low' : 'high'));
  const DRAW = +(process.env.DRAW ?? (process.env.GPU === 'metal' ? 0 : 20));
  if (DRAW > 1) await p.addInitScript(n => {
    const P = WebGL2RenderingContext.prototype, raf = window.requestAnimationFrame.bind(window), D = window.__draw = { all: false, on: true, frames: 0 };
    window.requestAnimationFrame = fn => raf(t => { D.on = D.all || D.frames++ % n === 0; fn(t); D.on = true; });
    for (const k of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements', 'blitFramebuffer']) { const f = P[k]; P[k] = function (...a) { if (D.on) return f.apply(this, a); }; }
  }, DRAW);
  const shoot = async path => {
    try {
      if (DRAW > 1) await p.evaluate(() => new Promise(r => { window.__draw.all = true; const t = setTimeout(r, 60000); requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(t); r(); })); }));
      await p.screenshot({ path, timeout: 180000 });
    } catch (e) { console.log('still missed:', path, String(e).split('\n')[0]); }
    finally { if (DRAW > 1) await p.evaluate(() => { window.__draw.all = false; }).catch(() => {}); }
  };
  // (as a case left at frame 4 and opened again: guide_way.js does the same)
  await p.addInitScript(() => { try { localStorage.setItem('bh-story-late', JSON.stringify({ fi: 3, left: 4, prints: [0, 1, 2].map(i => ({ src: null, stamp: `frame ${i + 1}`, cap: '' })) })); } catch (e) { /* storage blocked */ } });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?overture=0${process.env.QUERY || ''}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.evaluate(() => document.getElementById('gt-play').click());
  const t0 = Date.now();
  let live = null;
  while (Date.now() - t0 < 1200000) {
    const s = await p.evaluate(() => { const st = window.__game.story.state, d = document.getElementById('gd'), pl = window.__game.player; return { dlg: d && !d.hidden, dog: !!(st.dog && st.dog.ready), target: st.target, beat: st.beat, at: [pl.x, pl.y, pl.z], h: pl.h, ready: window.__game.ways.ready && (!window.__game.hero || !window.__game.hero() || window.__game.hero().levels.every(L => L.state === 'ready' || L.state === 'idle')) }; });
    if (!s.dog && s.target && s.ready && s.beat === 'meet') await p.evaluate(() => { const g = window.__game, st = g.story.state; if (st.dog) return; const d = g.makeGuide(st.ep.guide); if (d) { d.place(g.player.x + 1.2, g.player.y + 1.2, 0); d.met(); st.dog = d; } });
    if (s.dog && s.target && s.ready && s.beat === 'meet') { live = s; break; }
    if (s.dlg) await p.evaluate(() => document.getElementById('gd').click());
    await p.waitForTimeout(500);
  }
  if (!live) { console.log('FAIL: frame 4 never gave its lead'); await b.close(); process.exit(1); }
  console.log('frame 4:', JSON.stringify({ at: live.at.map(v => +v.toFixed(2)), target: live.target.map(v => +v.toFixed(2)) }));
  let fails = 0;
  for (const R of RUNS) {
    let r = null;
    const run = p.evaluate(require('./guide_own'), { R, live, STUCK_S, STUCK_M, TRACE: !!process.env.TRACE }).then(v => { r = v; }, e => { r = { error: String(e).slice(0, 300) }; });
    let shot = false;
    while (!r) {
      await p.waitForTimeout(500);
      if (!shot && await p.evaluate(() => !!window.__f207).catch(() => false)) { shot = true; await shoot(`${out}/${R.name}-fault.png`); }
    }
    await run;
    await p.evaluate(() => { window.__f207 = null; });
    const ok = !r.error && !r.faults.length && (r.state === 'sit' || R.until || (r.state === 'heel' && r.left < 5)); // (heel: the story's own beat came, Yuna's talk, as the player arrived)
    if (!ok) fails++;
    const { trace, ...head } = r;
    console.log(ok ? 'ok  ' : 'FAIL', R.name, JSON.stringify(head));
    if (trace && trace.length) fs.writeFileSync(`${out}/${R.name}-trace.json`, JSON.stringify(trace));
    await shoot(`${out}/${R.name}-end.png`);
  }
  console.log(`page errors: ${errors.length}`);
  await b.close();
  process.exit(fails || errors.length ? 1 : 0);
})();
