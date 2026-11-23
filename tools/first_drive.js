// The first drive (the owner's report of 22 November 2026: "the protagonist has just set out and the road is a dead end"):
// the walk opened as a player opens it (blue hour, clear), your car taken where it waits (game.start.car, or with
// BRING=1 brought to the kerb by the start as the C key does), you at the wheel, and the car driven from there by the
// autopilot to each place in TO, a still every EVERY seconds of the game's time. Prints where the car waits, on which
// piece of the road graph and which way, and each drive's length and time; fails where a drive finds no road, stands
// 120 s, or ends more than 35 m from its place. The static half of the same promise is tools/first_drive.py.
//   xvfb-run -a node tools/first_drive.js out_dir [WxH] [hour]
//   TO="268,-998.6;535,-1078" (109's foot, SKY GATE's kerb) EVERY=6 STILLS=0 (no stills) BRING=1
const { chromium } = require('playwright');
const fs = require('fs');
const [,, OUT = '/tmp/first-drive', size = '1440x900', hour = 'blue'] = process.argv;
const [W, H] = size.split('x').map(Number), phone = W < 600, tag = phone ? 'phone' : 'desk';
const TO = (process.env.TO || '268,-998.6;535,-1078').split(';').filter(Boolean).map(s => s.split(',').map(Number));
const EVERY = +(process.env.EVERY || 6), STILLS = process.env.STILLS !== '0';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => { errors.push(String(e).slice(0, 300)); console.log('pageerror', errors[errors.length - 1]); });
  await p.addInitScript(([t]) => {
    try { localStorage.setItem('bh-quality', 'high'); localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); sessionStorage.setItem('bh-walk-auto', JSON.stringify({ t, w: 'clear', film: false })); } catch (e) { /* storage blocked */ }
  }, [hour]);
  await p.goto(`http://localhost:${process.env.PORT || 8800}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const s = document.getElementById('game-stage'); return s && s.classList.contains('walk-on'); }, null, { timeout: 900000, polling: 500 });
  await p.waitForFunction(() => window.__game.myCar && window.__game.myCar(), null, { timeout: 300000, polling: 500 });
  const shot = async n => { if (!STILLS) return; await p.evaluate(() => window.__game.frame(0)); await p.waitForTimeout(500); await p.screenshot({ path: `${OUT}/${tag}-${n}.png`, timeout: 180000 }); };
  // where it waits
  const waits = await p.evaluate(bring => {
    const g = window.__game;
    if (bring) { g.bringCar(); for (let t = 0; t < 12 && g.carComing(); t += 0.5) g.advance(0.5); }
    const st = g.myCar().D.st, q = g.roadNet.nearest(st.x, st.y, 30, st.z), l = q && g.roadNet.L[q.line];
    const rq = {}; if (q) g.roadNet.at(q.line, q.s, rq);
    const along = q ? Math.sin(st.h) * rq.hx + Math.cos(st.h) * rq.hy : 0;
    // (its four wheels on the carriageway a hero level draws there: nav.carriageway, false on the paving)
    const C = g.myCar().C, fx = Math.sin(st.h), fy = Math.cos(st.h), wheels = [];
    if (g.nav.carriageway) for (const a of [-1, 1]) for (const b of [-1, 1]) { const f = a * (C.half - 0.6), l = b * (C.hw - 0.15); wheels.push(g.nav.carriageway(st.x + fx * f + fy * l, st.y + fy * f - fx * l) !== false); }
    return { paving: wheels.filter(w => !w).length, at: [+st.x.toFixed(1), +st.y.toFixed(1)], h: +(st.h * 180 / Math.PI).toFixed(0), piece: q ? l.i0 : null, c: q && l.c, oneway: q ? l.ow : 0, quiet: q ? l.quiet : 0,
      off: q ? +q.d.toFixed(1) : null, with: along > 0 ? 'with its points' : 'against its points', legal: !q || !l.ow || (l.ow > 0) === (along > 0) };
  }, !!process.env.BRING);
  console.log(`your car waits at ${waits.at} heading ${waits.h} deg on piece ${waits.piece} (${waits.c}${waits.oneway ? ', one-way' : ''}${waits.quiet ? ', quiet' : ''}), ${waits.off} m off its line, ${waits.with}`);
  let bad = 0;
  if (!waits.legal) { console.log('FAIL your car faces against its one-way street'); bad++; }
  if (waits.paving) { console.log(`FAIL your car waits with ${waits.paving} wheel${waits.paving > 1 ? 's' : ''} off the carriageway, on the paving`); bad++; }
  if (waits.quiet) { console.log('FAIL your car waits on a quiet street (a cul-de-sac or a stub)'); bad++; }
  // at the wheel
  const seated = await p.evaluate(() => {
    const g = window.__game, st = g.myCar().D.st;
    for (let k = 0; k < 2 && g.player.mode !== 'car'; k++) {
      const s = (g.KEEP === 'left' ? 1 : -1) * (k ? -1 : 1);
      g.player.x = st.x + Math.cos(st.h) * 2.6 * s; g.player.y = st.y - Math.sin(st.h) * 2.6 * s; g.player.z = st.z;
      g.advance(0.3); g.enterCar();
      for (let i = 0; i < 24 && g.player.mode !== 'car'; i++) g.advance(0.5);
    }
    g.advance(1.5);
    return g.player.mode;
  });
  if (seated !== 'car') { console.log(`FAIL could not get into the car (${seated})`); await b.close(); process.exit(1); }
  await shot('0-wheel');
  for (let k = 0; k < TO.length; k++) {
    const to = TO[k];
    const leg = await p.evaluate(to => { const g = window.__game, st = g.myCar().D.st; const ok = g.pilotTo({ id: 'first', name: 'the first drive', at: to }, { quiet: true }); return { ok: !!ok, len: ok ? Math.round(g.pilot().len) : 0, from: [Math.round(st.x), Math.round(st.y)] }; }, to);
    if (!leg.ok) { console.log(`FAIL drive ${k + 1}: no road from ${leg.from} to ${to}`); bad++; continue; }
    let t = 0, stood = 0, n = 0, end = null, at = leg.from, ahead = 0;
    while (t < 600) {
      const r = await p.evaluate(secs => {
        const g = window.__game, st = g.myCar().D.st; let stood = 0;
        for (let u = 0; u < secs; u += 0.5) { if (!g.pilot()) return { end: (g.pilotEnd && g.pilotEnd()) || 'ended', at: [st.x, st.y], stood }; g.advance(0.5); stood = st.speed < 0.3 ? stood + 0.5 : 0; }
        const o = g.pilot(), d = o && o.drv && o.drv.st;
        return { end: null, at: [st.x, st.y], stood, log: `${st.x.toFixed(1)},${st.y.toFixed(1)},${st.z.toFixed(1)} v ${st.speed.toFixed(1)} ${o && o.join ? 'joining ' + (o.joinWhy || '') : (d && d.why) || ''}${st.wedged ? ' wedged ' + st.wedged.toFixed(1) : ''}` };
      }, EVERY);
      t += EVERY; stood = r.stood ? stood + r.stood : 0; at = r.at;
      if (process.env.LOG && r.log) console.log(`  ${t} s: ${r.log}`);
      if (n < 40) await shot(`${k + 1}-${String(n++).padStart(2, '0')}`);
      if (r.end) { end = r.end; break; }
      if (stood >= 120) { end = 'stood 120 s'; break; }
      ahead = t;
    }
    const d = Math.hypot(at[0] - to[0], at[1] - to[1]), ok = d <= 35 && end !== 'stood 120 s';
    console.log(`${ok ? 'ok  ' : 'FAIL'} drive ${k + 1}: from ${leg.from} to ${to}, ${leg.len} m by road, ${t} s; ended ${d.toFixed(0)} m from it (${end || 'still driving'})`);
    if (!ok) bad++;
  }
  if (errors.length) { console.log(`FAIL ${errors.length} errors on the page`); bad++; }
  await b.close();
  process.exit(bad ? 1 : 0);
})();
