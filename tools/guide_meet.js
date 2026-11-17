// The guide met, and followed at a run: the first Stop of the episode played from the title, and the film of the dog
// coming to you through the stopped crowd (story.js meetGuide) taken in stills as it plays (on him as he is first seen,
// as he comes, as he nears you, as he sits and looks up, and the view handed back); every frame of it the dog is
// checked against every person standing in the crowd (his middle never within 0.42 m of theirs: through a coat), and
// the film must end with him beside you. Then the player runs (the game's own run, 6 m/s) after him to whoever is
// still moving: he must stay in front, at a gallop, and never be found behind them. Exits 1 on any fault.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/guide_meet.js out_dir [WxH]          DRAW=n: one frame in n drawn between stills (as story_play.js)
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/guide-meet', size = '1440x900'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number);
  const args = process.env.GPU === 'metal' ? ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-gpu']
    : ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 500, isMobile: w < 500 });
  const errors = [];
  p.on('pageerror', e => { errors.push(String(e)); console.log('pageerror:', String(e).slice(0, 300), (e.stack || '').split('\n').slice(1, 3).join(' | ')); });
  fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(t => { try { localStorage.setItem('oe3d-quality', t); localStorage.removeItem('oe-story-late'); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  const DRAW = +(process.env.DRAW || 0);
  if (DRAW > 1) await p.addInitScript(n => {
    const P = WebGL2RenderingContext.prototype, raf = window.requestAnimationFrame.bind(window), D = window.__draw = { all: false, on: true, frames: 0 };
    window.requestAnimationFrame = fn => raf(t => { D.on = D.all || D.frames++ % n === 0; fn(t); D.on = true; });
    for (const k of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements', 'blitFramebuffer']) { const f = P[k]; P[k] = function (...a) { if (D.on) return f.apply(this, a); }; }
  }, DRAW);
  await p.goto(`http://localhost:${process.env.PORT || 8800}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => document.getElementById('gt-play').click());
  const drawAll = on => (DRAW > 1 ? p.evaluate(on => new Promise(r => { window.__draw.all = on; if (!on) return r(); requestAnimationFrame(() => requestAnimationFrame(r)); }), on) : null);
  const snap = async name => { await drawAll(true); await p.screenshot({ path: `${out}/${name}.png`, timeout: 120000 }).catch(() => console.log(`(no still ${name})`)); await drawAll(false); };
  const state = () => p.evaluate(() => { const g = window.__game, s = g.story.state, d = document.getElementById('gd'); return { phase: s.phase, beat: s.beat, fi: s.fi, dlg: d && !d.hidden, film: !!g.story.film }; });
  const t0 = Date.now(); let was = '';
  // to the first Stop's film: the opening skipped, the order put away
  while (Date.now() - t0 < 900000) {
    const s = await state();
    const k = `${s.phase}/${s.beat}/${s.fi}`; if (k !== was) { was = k; console.log(`${((Date.now() - t0) / 1000).toFixed(0)} s`, k); }
    if (s.beat === 'guide' || s.film) break;
    if (s.phase === 'stop' && s.beat === 'seek') { errors.push('the first Stop went to its afterimage without the film of the guide'); break; }
    if (s.dlg) await p.keyboard.press('KeyE');
    else if (s.phase === 'dressed') await p.keyboard.press('Space');
    else if (s.phase === 'go' && s.beat === 'order') await p.keyboard.press('KeyE');
    await p.waitForTimeout(500);
  }
  // the film, watched: where he is, how near the nearest held person is, every frame; stills at its beats
  await p.evaluate(() => {
    const g = window.__game, W = window.__meet = { min: Infinity, at: null, n: 0, t: 0, path: [], gone: false };
    const tick = () => {
      const st = g.story.state, d = st.dog, F = st.mov;
      if (!F) { W.gone = true; W.end = d ? { x: d.x, y: d.y, state: d.state, pl: [g.player.x, g.player.y] } : null; return; }
      if (d && F.t > 0) {
        W.n++; W.t = F.t; W.prog = F.sat ? 'sat' : F.went ? 'went' : 'stand';
        if (W.n % 6 === 0) W.path.push([+d.x.toFixed(2), +d.y.toFixed(2)]);
        const C = g.crowd; if (C && C.P) for (let i = 0, n = Math.min(C.active, C.P.length); i < n; i++) { const q = C.P[i]; if (q.line < 0) continue; const e = Math.hypot(q.x - d.x, q.y - d.y); if (e < W.min) { W.min = e; W.at = [+d.x.toFixed(2), +d.y.toFixed(2), +F.t.toFixed(1)]; } }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const shots = [[0.3, 'film-1-first-sight'], [2.2, 'film-2-he-comes'], [5, 'film-3-coming'], [8, 'film-4-nearing']];
  for (const [at, name] of shots) {
    await p.waitForFunction(at => (window.__meet.t >= at) || window.__meet.gone || window.__meet.prog === 'sat', at, { timeout: 600000, polling: 100 });
    const r = await p.evaluate(() => ({ t: window.__meet.t, prog: window.__meet.prog, gone: window.__meet.gone }));
    if (r.gone || r.prog === 'sat') break;
    console.log(`${name} at ${r.t.toFixed(1)} s`); await snap(name);
  }
  await p.waitForFunction(() => window.__meet.prog === 'sat' || window.__meet.gone, null, { timeout: 600000, polling: 100 });
  await p.waitForTimeout(800); await snap('film-5-sits'); await p.waitForTimeout(1600); await snap('film-6-looks-up');
  await p.waitForFunction(() => window.__meet.gone, null, { timeout: 600000, polling: 200 });
  await p.waitForTimeout(500); await snap('film-7-handed-back'); await p.waitForTimeout(1600); await snap('film-8-the-goal');
  const m = await p.evaluate(() => window.__meet);
  console.log('the film:', JSON.stringify({ frames: m.n, seconds: +m.t.toFixed(1), nearest: +m.min.toFixed(2), at: m.at, end: m.end, path: m.path.length }));
  fs.writeFileSync(`${out}/meet_path.json`, JSON.stringify(m.path));
  if (m.min < 0.42) errors.push(`the dog went within ${m.min.toFixed(2)} m of a held person's middle (${m.at}): through them`);
  if (!m.end || Math.hypot(m.end.x - m.end.pl[0], m.end.y - m.end.pl[1]) > 2.2) errors.push(`the film ended with the dog ${m.end ? Math.hypot(m.end.x - m.end.pl[0], m.end.y - m.end.pl[1]).toFixed(1) : '?'} m from the player`);
  // then followed at a run: the player runs (the game's own walk step, its run) at the dog; he must stay in front
  await p.evaluate(() => { window.__run = new Promise(done => {
    const g = window.__game, st = g.story.state, d = st.dog, pl = g.player, log = window.__runLog = { n: 0, behind: 0, gap: [], speeds: [], clips: {} };
    const down = c => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c, bubbles: true })), up = c => window.dispatchEvent(new KeyboardEvent('keyup', { code: c, key: c, bubbles: true }));
    let t = 0, last = performance.now();
    const tick = () => {
      const now = performance.now(); t += Math.min(0.05, (now - last) / 1000); last = now;
      if (!d || st.beat !== 'seek' || t > 25) { up('KeyW'); return done(log); }
      // the lens kept behind the player and turned to him, so that W runs at him
      g.cam.yaw = Math.atan2(d.x - pl.x, d.y - pl.y); if (!log.n) down('KeyW');
      log.n++; if (d.behind) log.behind++;
      if (log.n % 10 === 0) { log.gap.push(+Math.hypot(d.x - pl.x, d.y - pl.y).toFixed(1)); log.speeds.push([+pl.speed.toFixed(1), +d.speed.toFixed(1)]); }
      log.clips[d.state] = (log.clips[d.state] || 0) + 1;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }); });
  // (a still of him at a gallop, the first time he is at a run's pace, from the chase view behind the player)
  for (let k = 0; k < 400; k++) {
    const r = await p.evaluate(() => ({ v: window.__game.story.state.dog.speed, done: window.__game.story.state.beat !== 'seek' }));
    if (r.done) break;
    if (r.v > 5) { await snap('run-gallop'); break; }
    await p.waitForTimeout(150);
  }
  const run = await p.evaluate(() => window.__run);
  console.log('the run:', JSON.stringify(run));
  await snap('run-end');
  if (run.n && run.behind / run.n > 0.25) errors.push(`run after him, the dog was behind the player ${(100 * run.behind / run.n).toFixed(0)}% of the time`);
  console.log(errors.length ? `FAIL\n${errors.join('\n')}` : 'ok');
  await b.close();
  process.exit(errors.length ? 1 : 0);
})();
