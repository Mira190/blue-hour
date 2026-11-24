// What the Scramble's crossing carries, and how close its people come (issue 157, item 7): the walk (?walk=1) at an hour,
// you stood at the Hachiko kerb, the world stepped headless a thirtieth of a second at a time, as tools/crowd_press.js
// steps it. Counted over that time:
//   crossed:  the crowd's people who finished a crossing (from out on the crosswalk to the far kerb), a minute
//   whole:    the closest two whole rigs (near people drawn as one: the renderer's list, which p.whole follows) came, centre to centre,
//             and how many steps had two of them nearer than 0.46 m (actors.js NEAR_BODY)
//   canopy:   the closest an open canopy's rim came to your head (WEATHER=rain), and how many steps it was inside it
// Before and after a change to the crowd's spacing, the first must stay where it was and the other two come up.
//   GAME_TIME=17:30 xvfb-run -a node tools/crowd_through.js [seconds, 120]       (PORT=; WEATHER=rain; AT=x,y where you stand)
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const { pinClock } = require('./pin_clock');
const [,, secs = '120'] = process.argv;
(async () => {
  const b = await chromium.launch(process.env.DISPLAY
    ? { headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] }
    : { args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 400 } });
  await pinClock(p, 'shibuya');
  p.on('pageerror', e => console.log(`pageerror: ${String(e).slice(0, 300)}`));
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1${process.env.WEATHER ? '&weather=' + process.env.WEATHER : ''}#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game', null, { timeout: 400000 });
  await startPlay(p);
  const at = (process.env.AT || '376.9,-1013.1').split(',').map(Number);
  // (you put where you stand and the page left running as a player has it for a while: the near people's characters come
  // in over some seconds, as frames are drawn and their files load, and a loop stepped headless lets nothing load)
  await p.evaluate(at => { const g = window.__game; if (g.cine && g.cine.active) g.cine.skip(); g.player.x = at[0]; g.player.y = at[1]; }, at);
  await p.waitForFunction(() => { const R = window.__game.crowdDraw(); return R && R.active && R.active.size >= 4; }, null, { timeout: 240000, polling: 1000 }).catch(() => console.log('fewer than four whole rigs after four minutes'));
  const out = await p.evaluate(([secs, at]) => {
    window.requestAnimationFrame = () => 0;
    const g = window.__game, P = g.crowd.P, me = g.player, dt = 1 / 30;
    if (g.cine && g.cine.active) g.cine.skip();
    me.x = at[0]; me.y = at[1]; g.advance(1);
    const R = g.crowdDraw(), was = new Map();
    let crossed = 0, steps = 0, wMin = 9, wNear = 0, cMin = 9, cIn = 0, umbs = 0;
    for (let f = 0; f < secs * 30; f++) {
      g.advance(dt); steps++;
      const W = [];
      for (let i = 0; i < g.crowd.active; i++) {
        const q = P[i]; if (q.line < 0 && !q.pz) continue;
        const ph = q.pz ? q.ph : null, w0 = was.get(i);
        if (w0 === 'cross' && ph && ph !== 'cross') crossed++;
        was.set(i, ph);
        if (R.active.has(i)) W.push(q); // (a whole rig: the renderer's own list, as people.js place() reads it for p.whole)
        if (q.umbR > 0 && Math.hypot(q.x - me.x, q.y - me.y) < 3) { umbs++; const e = Math.hypot(q.x + (q.ucx || 0) - me.x, q.y + (q.ucy || 0) - me.y) - q.umbR - 0.12; if (e < cMin) cMin = e; if (e < 0) cIn++; }
      }
      let near = false;
      for (let a = 0; a < W.length; a++) for (let c = a + 1; c < W.length; c++) { const d = Math.hypot(W[a].x - W[c].x, W[a].y - W[c].y); if (d < wMin) wMin = d; if (d < 0.46) near = true; }
      if (near) wNear++;
    }
    return { crossed, perMin: +(crossed / secs * 60).toFixed(1), steps, wMin: +wMin.toFixed(3), wNear, cMin: umbs ? +cMin.toFixed(3) : null, cIn, wholeNow: R.active.size };
  }, [+secs, at]);
  console.log(`over ${secs} s: ${out.crossed} crossed (${out.perMin} a minute); whole rigs: closest ${out.wMin} m apart, ${out.wNear} of ${out.steps} steps with two nearer than 0.46 m (${out.wholeNow} whole now); canopy to your head: ${out.cMin == null ? 'no umbrella near' : `closest ${out.cMin} m clear, inside it in ${out.cIn} steps`}`);
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
