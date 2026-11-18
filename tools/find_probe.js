// A found frame (task.find: no light stands where its picture is taken from) as a player meets it: the frame played
// from its beginning to the camera's beat, then stills from where the world stopped (the camera down, then up and on
// the thing), from the standpoint itself, and from each AT=x,y;x,y given; with the state at each (placed, aimed, the
// rangefinder patch, the goal's words) printed, and a plan from above of where each still was taken.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/find_probe.js out_dir [WxH]        FRAME=2 (counted from 1), AT="345.5,-980.4;360.8,-1021.8"
// HOLD=seconds: how long the hunt has gone on when the stills are taken (the second line, the light: find2, find_s).
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/find-probe', size = '1440x900'] = process.argv;
const FRAME = +(process.env.FRAME || 2);
(async () => {
  const [w, h] = size.split('x').map(Number);
  const args = process.env.GPU === 'metal' ? ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-gpu']
    : ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: w < 500, isMobile: w < 500 });
  const errors = [];
  p.on('pageerror', e => { errors.push(String(e)); console.log('pageerror:', String(e).slice(0, 300)); });
  fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(t => { try { localStorage.setItem('oe3d-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  // as a case left at that frame and opened again
  await p.addInitScript(n => { try { localStorage.setItem('oe-story-late', JSON.stringify({ fi: n, left: 7 - n, prints: Array.from({ length: n }, (_, i) => ({ src: null, stamp: `frame ${i + 1}`, cap: '' })) })); } catch (e) { /* storage blocked */ } }, FRAME - 1);
  await p.goto(`http://localhost:${process.env.PORT || 8800}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => document.getElementById('gt-play').click());
  const state = () => p.evaluate(() => { const g = window.__game, s = g.story.state, d = document.getElementById('gd'); return { phase: s.phase, beat: s.beat, fi: s.fi, t: +s.t.toFixed(1), dlg: d && !d.hidden, goal: document.querySelector('#g-story-goal span').textContent, how: document.querySelector('#g-story-goal em').textContent, at: [+g.player.x.toFixed(1), +g.player.y.toFixed(1)] }; });
  const goTo = (at, d = 1.6) => p.evaluate(([at, d]) => { const g = window.__game, pl = g.player; let dx = pl.x - at[0], dy = pl.y - at[1], l = Math.hypot(dx, dy); if (l < 0.5 || l > 60) { dx = 1; dy = 0; l = 1; } pl.x = at[0] + dx / l * d; pl.y = at[1] + dy / l * d; pl.h = Math.atan2(-dx, -dy); if (g.cam) g.cam.yaw = pl.h; }, [at, d]);
  const frames = n => p.evaluate(n => new Promise(r => { const f = () => (n-- > 0 ? requestAnimationFrame(f) : r()); f(); }), n);
  const snap = name => p.screenshot({ path: `${out}/${name}.png`, timeout: 120000 }).catch(() => console.log(`(no still ${name})`));
  const t0 = Date.now(); let was = '';
  console.log('loaded');
  // to the camera's beat of the frame, as a player who walks where the goal says
  while (Date.now() - t0 < 900000) {
    const s = await state();
    if (s.fi === FRAME - 1 && s.phase === 'stop' && s.beat === 'shoot') break;
    const k = `${s.phase}/${s.beat}/${s.fi}/${s.dlg}`; if (k !== was) { was = k; console.log(`${((Date.now() - t0) / 1000).toFixed(0)} s`, JSON.stringify(s)); }
    if (s.dlg) { await p.keyboard.press('KeyE'); await p.waitForTimeout(300); continue; }
    if (s.phase === 'dressed') { await p.keyboard.press('Space'); await p.waitForTimeout(800); continue; } // (the opening film: minutes of frames on a software renderer)
    if (s.phase === 'go' && s.beat === 'meet') { const at = await p.evaluate(() => { const t = window.__game.story.state.target; return t ? [t[0], t[1]] : null; }); if (at) await goTo(at, 1.8); }
    else if (s.phase === 'go' && s.beat === 'approach') { const at = await p.evaluate(() => { const fr = window.__game.story.state.fr; return fr.stop_at || (fr.afterimage && fr.afterimage.at); }); if (at) await goTo(at, 4); }
    else if (s.phase === 'stop' && s.beat === 'seek') { const at = await p.evaluate(() => { const g = window.__game.story.state.ghost; return g ? [g.x, g.y] : null; }); if (at) await goTo(at, 2.2); }
    await p.waitForTimeout(400);
  }
  const T = await p.evaluate(() => { const st = window.__game.story.state, T = st.fr.task, R = T.relic; return { stand: T.stand, within: T.within_m || 4, rel: R ? [R.at[0], R.at[1]] : T.subject, eye: R ? (R.eye ?? 0.6) : 0 }; });
  const look = () => p.evaluate(([at, eye]) => { const g = window.__game, pl = g.player, z = g.nav.terrain(at[0], at[1]); g.story.raise(false); pl.h = Math.atan2(at[0] - pl.x, at[1] - pl.y); if (g.cam) { g.cam.yaw = pl.h; g.cam.pitch = 0.25; } }, [T.rel, T.eye]);
  const read = () => p.evaluate(() => { const g = window.__game, st = g.story.state, f = document.getElementById('g-story-finder'), m = document.getElementById('g-story-mark'); return { at: [+g.player.x.toFixed(1), +g.player.y.toFixed(1)], d: +Math.hypot(g.player.x - st.fr.task.stand[0], g.player.y - st.fr.task.stand[1]).toFixed(1), fix: f.dataset.fix || '', ready: f.classList.contains('ready'), lit: !!st.lit, findT: +(st.findT || 0).toFixed(1), goal: document.querySelector('#g-story-goal span').textContent, mark: m.classList.contains('on') ? `${m.dataset.kind}: ${m.querySelector('b').textContent}` : '' }; });
  const where = await state();
  console.log('the camera beat:', JSON.stringify(where));
  const views = [['stopped', where.at]];
  if (T.stand) views.push(['stand', T.stand]);
  for (const q of (process.env.AT || '').split(';').filter(Boolean)) views.push([`at-${q.replace(/[^0-9.-]+/g, '_')}`, q.split(',').map(Number)]);
  if (process.env.HOLD) await p.evaluate(s => { window.__game.story.state.findT = s; }, +process.env.HOLD);
  for (const [name, at] of views) {
    await p.evaluate(at => { const g = window.__game, pl = g.player; pl.x = at[0]; pl.y = at[1]; }, at);
    await look(); await frames(4); await p.waitForTimeout(600);
    await snap(`${name}-down`);
    await p.evaluate(() => window.__game.story.raise(true)); await frames(6); await p.waitForTimeout(1500);
    const r = await read();
    console.log(name, JSON.stringify(r));
    await snap(`${name}-up`);
    await p.evaluate(() => window.__game.story.raise(false)); await frames(2);
  }
  // HINT=n: back where the world stopped, n hints asked for (H), and a still four seconds on, the view turned to the place
  if (+process.env.HINT) {
    await p.evaluate(at => { const g = window.__game, pl = g.player; pl.x = at[0]; pl.y = at[1]; }, where.at);
    for (let k = 0; k < +process.env.HINT; k++) { await p.keyboard.press('KeyH'); await frames(3); }
    await p.evaluate(at => { const g = window.__game, pl = g.player; pl.h = Math.atan2(at[0] - pl.x, at[1] - pl.y); if (g.cam) { g.cam.yaw = pl.h; g.cam.pitch = 0.3; } }, T.stand);
    await frames(4); await p.waitForTimeout(4000);
    const r = await p.evaluate(() => { const st = window.__game.story.state, d = st.dog; return { hint: st.hint, lit: st.lit, goal: document.querySelector('#g-story-goal span').textContent, dog: d ? { at: [+d.x.toFixed(1), +d.y.toFixed(1)], state: d.state } : null, button: document.getElementById('g-story-hint').textContent }; });
    console.log(`hint ${process.env.HINT}`, JSON.stringify(r)); await snap(`hint-${process.env.HINT}`);
  }
  console.log(errors.length ? `${errors.length} page errors` : 'no page errors');
  await b.close();
  process.exit(errors.length ? 1 : 0);
})();
