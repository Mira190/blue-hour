// A lift you have just stepped out of does not ask you straight back in (game.js liftStop, liftLeft). The owner's phone
// at SHIBUYA SKY 46F: off SKY GATE's lift, "Take the lift to Shibuya Scramble Square, street level" stood in the middle
// of the screen the moment you were up. Rides SKY GATE up from its hall, then reads the prompt: none for the lift where
// it set you down; walked 5 m off and back, the lift is offered again (the way down is still there).
//   JOB_LIGHT=1 tools/job.sh run serve -- python3 -m http.server 8800 --directory web
//   tools/job.sh run liftprompt -- xvfb-run -a node tools/lift_prompt.js
// SHOTS=dir: stills of the hall, the ride a second and a half and three and a half seconds in, and where it set you
// down; LEAN=1: as an iPhone (its user agent, touch, the low tier), at 390x844
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
(async () => {
  const b = await chromium.launch(process.env.DISPLAY
    ? { headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] }
    : { args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const lean = !!process.env.LEAN, shots = process.env.SHOTS || '';
  const ctx = lean ? await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1' }) : b;
  const p = lean ? await ctx.newPage() : await b.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
  await p.addInitScript(t => { try { localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); localStorage.setItem('bh-quality', t); } catch (e) { /* storage blocked */ } }, lean ? 'low' : 'high');
  if (shots) require('fs').mkdirSync(shots, { recursive: true });
  const shot = async name => { if (shots) { await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); await p.screenshot({ path: `${shots}/${name}.png` }); } };
  const logs = [];
  p.on('pageerror', e => logs.push(`pageerror: ${String(e).slice(0, 300)}`));
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 900000 });
  await startPlay(p);
  await p.evaluate(() => { const g = window.__game; g.advance(1); if (g.cine && g.cine.active && g.cine.skip) g.cine.skip(); g.advance(3); });
  const prompt = () => p.evaluate(() => { const m = document.getElementById('g-prompt'), t = document.getElementById('gp-text'); return m && !m.hidden && t ? t.textContent : ''; });
  const settle = () => p.evaluate(async () => { const g = window.__game; for (let i = 0; i < 6; i++) { g.advance(0.1); await new Promise(r => requestAnimationFrame(r)); } });
  let bad = 0;
  const say = (ok, text) => { if (!ok) bad++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${text}`); };
  // in the hall, by the lift (as tools/walk_play.js stands)
  const L = await p.evaluate(() => { const g = window.__game, l = (g.G.lifts || []).find(q => q.id === 'sky-gate'), s = l && l.stops[0]; if (!s) return null; const [ax, ay, az] = s.at, [dx, dy] = s.door || s.at, n = Math.hypot(ax - dx, ay - dy) || 1; g.player.x = ax - (ax - dx) / n * 1.2; g.player.y = ay - (ay - dy) / n * 1.2; g.player.z = az; g.player.h = Math.atan2(ax - dx, ay - dy); g.player.speed = 0; return { top: l.stops[l.stops.length - 1].at }; });
  if (!L) { console.log('FAIL no SKY GATE lift on the map'); process.exit(1); }
  await p.evaluate(() => { const g = window.__game; g.clock.min = 17 * 60 + 43; g.clock.scale = 0; g.cam.yaw = g.player.h; g.cam.pitch = 0.17; g.advance(0.5); });
  // (the hall is a hero level fetched as you are put in it: its prompt comes once it is drawn, up to two minutes here)
  await p.waitForFunction(() => { const m = document.getElementById('g-prompt'), t = document.getElementById('gp-text'); return m && !m.hidden && t && /lift/i.test(t.textContent); }, null, { timeout: 300000, polling: 250 }).catch(() => {});
  await shot('1-hall');
  const before = await prompt();
  say(/lift/i.test(before), `in SKY GATE's hall the lift is offered ("${before}")`);
  if (lean) await p.evaluate(() => document.getElementById('gp-main').click()); else await p.keyboard.press('KeyE');
  for (const [t, name] of [[1.5, '2-ride'], [2.0, '3-ride']]) { await p.evaluate(async t => { const g = window.__game; for (let i = 0; i < t / 0.25; i++) { g.advance(0.25); await new Promise(r => requestAnimationFrame(r)); } }, t); await shot(name); }
  await p.evaluate(async () => { const g = window.__game; for (let i = 0; i < 60 && g.cine.active; i++) { g.advance(0.25); await new Promise(r => requestAnimationFrame(r)); } });
  await settle();
  await p.evaluate(async () => { const g = window.__game; for (let i = 0; i < 8; i++) { g.advance(0.25); await new Promise(r => requestAnimationFrame(r)); } }); // (the hand-over to the chase camera, and the roof's level fetched)
  await shot('4-out');
  const top = await p.evaluate(() => window.__game.player.z), at = await prompt();
  say(top > L.top[2] - 3, `ridden up, out at ${top.toFixed(1)} m`);
  say(!/lift/i.test(at), `where the lift set you down it does not ask you back in ("${at || 'no prompt'}")`);
  // a step off and back: the way down is offered again
  await p.evaluate(T => { const g = window.__game, h = g.player.h; g.player.x = T[0] + Math.sin(h) * 5; g.player.y = T[1] + Math.cos(h) * 5; }, L.top);
  await settle();
  await p.evaluate(T => { const g = window.__game; g.player.x = T[0]; g.player.y = T[1]; g.player.z = T[2]; }, L.top);
  await settle();
  const back = await prompt();
  say(/lift/i.test(back), `walked 5 m off and back to it, the lift is offered again ("${back}")`);
  if (logs.length) console.log(logs.join('\n'));
  await b.close();
  process.exit(bad || logs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
