// Does a footway's walker pace (issue 168: walked on and back, ending where it began)? The walk (?walk=1) stepped headless a
// thirtieth of a second at a time, as tools/crowd_press.js steps it, for `seconds`; every walker on the lines named is
// followed: its turns (its direction along a line flipping) in any 30 s, the ground it walked and where it ended. A walker
// that turned twice in 30 s and ended within 3 m of where the window began is counted as pacing, as tools/pacing_watch.js
// counts it in a play of the story.
//   GAME_TIME=17:30 xvfb-run -a node tools/pace_line.js 781[,782...] [seconds, 300]    (AT=x,y where you stand; PORT=)
//   EVERY=1: every walker stepped every frame as if drawn (p.inPic set before each step): the walkers out of the picture
//   step ten times a second otherwise (actors.js update, OUT_S), and this says whether that is what turns them
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const { pinClock } = require('./pin_clock');
const [,, lines = '781', secs = '300'] = process.argv;
(async () => {
  const b = await chromium.launch(process.env.DISPLAY
    ? { headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] }
    : { args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 400 } });
  await pinClock(p, 'shibuya');
  p.on('pageerror', e => console.log(`pageerror: ${String(e).slice(0, 300)}`));
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game', null, { timeout: 400000 });
  await startPlay(p);
  const at = (process.env.AT || '376.9,-1013.1').split(',').map(Number);
  const out = await p.evaluate(([L, secs, at, every]) => {
    window.requestAnimationFrame = () => 0;
    const g = window.__game, P = g.crowd.P, me = g.player, dt = 1 / 30, want = new Set(L);
    if (g.cine && g.cine.active) g.cine.skip();
    me.x = at[0]; me.y = at[1]; g.advance(1);
    for (let f = 0; f < 30 * 20; f++) { if (every) for (const q of P) q.inPic = true; g.advance(dt); }
    const T = new Map(); let paced = 0, followed = 0, turns = 0; const cases = [];
    for (let f = 0; f < secs * 30; f++) {
      if (every) for (const q of P) q.inPic = true;
      g.advance(dt);
      const t = f * dt;
      for (let i = 0; i < g.crowd.active; i++) {
        const q = P[i];
        let o = T.get(i);
        if (!want.has(q.line) || q.pz) { if (o) T.delete(i); continue; }
        if (!o) { T.set(i, o = { line: q.line, dir: q.dir, turns: [], x: q.x, y: q.y, walked: 0, px: q.x, py: q.y, t0: t, pts: [[t, q.x, q.y]] }); followed++; continue; }
        if (o.line !== q.line) { T.set(i, { line: q.line, dir: q.dir, turns: [], x: q.x, y: q.y, walked: 0, px: q.x, py: q.y, t0: t, pts: [[t, q.x, q.y]] }); continue; }
        const st = Math.hypot(q.x - o.px, q.y - o.py); if (st < 2) o.walked += st; o.px = q.x; o.py = q.y;
        if (f % 15 === 0) o.pts.push([t, q.x, q.y]);
        if (q.dir !== o.dir) { o.dir = q.dir; o.turns.push(t); turns++;
          const win = o.turns.filter(s => t - s <= 30);
          if (win.length >= 2) { const s0 = win[0] - 0.5, start = o.pts.find(pt => pt[0] >= s0 - 30) || o.pts[0], d = Math.hypot(q.x - start[1], q.y - start[2]);
            if (d < 3 && !o.counted) { o.counted = true; paced++; cases.push({ i, x: +q.x.toFixed(1), y: +q.y.toFixed(1), turns: win.length, why: q.turnWhy || null, inPic: q.inPic, d: +d.toFixed(1) }); } } }
      }
    }
    return { followed, turns, paced, cases: cases.slice(0, 8) };
  }, [lines.split(',').map(Number), +secs, at, !!process.env.EVERY]);
  console.log(`lines ${lines}, ${secs} s${process.env.EVERY ? ', every walker stepped every frame' : ''}: ${out.followed} walkers followed, ${out.turns} turns, ${out.paced} paced${out.cases.length ? ': ' + JSON.stringify(out.cases) : ''}`);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
