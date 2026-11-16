// Watches the story's mark (web/game/story.js markTick) for three seconds a view, frame by frame, with the player
// standing still and the lens turned each way round the compass: the goal ahead, to each side, behind. A mark that is
// told where to be twice (two places, two arrows, two wordings in turn) trembles, and a still does not show it. Fails
// when, with nothing moving, the mark's words, its classes or its kind change between two frames, when its place goes
// back and forth (a slow drift as the view settles is not a tremble), or when its words or its arrow are cut by the
// frame's edge. Takes a still of each view.
//   python3 -m http.server 8800 --directory web &
//   node tools/mark_steady.js out_dir [WxH]          (GPU=metal on a Mac; under xvfb-run -a elsewhere; FROM=3: frame four)
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/mark-steady', size = '1440x900'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number), from = +(process.env.FROM || 3);
  const args = process.env.GPU === 'metal' ? ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-gpu']
    : process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 500, isMobile: w < 500 });
  const errors = [], fail = m => { errors.push(m); console.log('FAIL', m); };
  p.on('pageerror', e => fail(`pageerror: ${String(e).slice(0, 300)}`));
  fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(t => { try { localStorage.setItem('oe3d-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  if (from) await p.addInitScript(n => { try { localStorage.setItem('oe-story-late', JSON.stringify({ fi: n, left: 7 - n, prints: Array.from({ length: n }, (_, i) => ({ src: null, stamp: `frame ${i + 1}`, cap: '' })) })); } catch (e) { /* storage blocked */ } }, from);
  await p.goto(`http://localhost:${process.env.PORT || 8800}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.waitForTimeout(2000);
  await p.evaluate(() => document.getElementById('gt-play').click());
  await p.waitForFunction(() => { const s = window.__game.story.state; return s.target && document.getElementById('g-story-mark').classList.contains('on'); }, null, { timeout: 180000, polling: 500 });
  await p.waitForTimeout(3000); // (the view has been brought round to the goal and has settled)
  const beat = await p.evaluate(() => { const s = window.__game.story.state; return `frame ${s.fi + 1}, ${s.phase} ${s.beat}, the mark "${document.getElementById('g-story-mark').dataset.kind}"`; });
  console.log(beat);
  for (let i = 0; i < 12; i++) {
    const deg = i * 30;
    // the lens turned `deg` from the goal, and held
    await p.evaluate(deg => { const g = window.__game, t = g.story.state.target, pl = g.player; g.cam.yaw = Math.atan2(t[0] - pl.x, t[1] - pl.y) + deg * Math.PI / 180; }, deg);
    await p.waitForTimeout(700);
    const r = await p.evaluate(() => new Promise(done => {
      const e = document.getElementById('g-story-mark'), seen = [], t0 = performance.now();
      const read = () => `${e.querySelector('b').textContent} | ${e.className} | ${e.dataset.kind}`, at = [];
      const tick = () => {
        seen.push(read()); at.push((e.style.transform.match(/-?[\d.]+/g) || [0, 0]).map(Number));
        if (performance.now() - t0 < 3000) return requestAnimationFrame(tick);
        const kinds = [...new Set(seen)], W = innerWidth, H = innerHeight, cut = [];
        if (e.classList.contains('on')) for (const [name, el] of [['words', e.querySelector('b')], ['arrow', e.classList.contains('off') ? e.querySelector('u') : null]]) {
          if (!el) continue; const q = el.getBoundingClientRect(); if (q.left < 0 || q.right > W || q.top < 0 || q.bottom > H) cut.push(`${name} ${Math.round(q.left)}..${Math.round(q.right)} × ${Math.round(q.top)}..${Math.round(q.bottom)}`);
        }
        let turns = 0, jump = 0; // (how often its place turns back on itself by more than a pixel and a half, and its biggest step)
        for (const a of [0, 1]) { let was = 0; for (let i = 1; i < at.length; i++) { const d = at[i][a] - at[i - 1][a]; jump = Math.max(jump, Math.abs(d)); if (Math.abs(d) > 1.5) { if (was && Math.sign(d) !== was) turns++; was = Math.sign(d); } } }
        done({ frames: seen.length, kinds, cut, turns, jump, at: at[at.length - 1] });
      };
      requestAnimationFrame(tick);
    }));
    if (r.kinds.length > 1) fail(`turned ${deg}°: ${r.kinds.length} states in ${r.frames} frames with nothing moving: ${r.kinds.slice(0, 3).join('  //  ')}`);
    if (r.cut.length) fail(`turned ${deg}°: cut by the frame's edge: ${r.cut.join('; ')}`);
    if (r.turns > 2 || r.jump > 24) fail(`turned ${deg}°: its place goes back and forth ${r.turns} times in ${r.frames} frames (biggest step ${r.jump.toFixed(1)} px)`);
    if (r.kinds.length === 1 && !r.cut.length && r.turns <= 2 && r.jump <= 24) console.log(`ok   turned ${String(deg).padStart(3)}° at ${r.at.map(v => Math.round(v)).join(', ')}: ${r.kinds[0]}`);
    await p.screenshot({ path: `${out}/turn-${String(deg).padStart(3, '0')}-${size}.png` });
  }
  await b.close();
  console.log(errors.length ? `FAIL ${errors.length}` : 'PASS');
  process.exit(errors.length ? 1 : 0);
})();
