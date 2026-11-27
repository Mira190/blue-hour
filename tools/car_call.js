// Your car called to the kerb (C) from the footways round the scramble, as a walker calls it: from each place, where
// it stops, how far from you, and whether anything of the street is in its body (a lamp post, a signal, a trunk, a hero
// level's guard rail). The owner's stills of 27 November 2026: called by the scramble it stood 33 m off with nothing
// to say which way, and another time with a rail and a post through it. Fails where the car stands in anything, where
// it stands more than FAR m from you with a clear kerb nearer that the search should have found, or where, called from
// beyond CAR_MARK m, there is no guide to the car (its mark over it in the picture, else its own line in the corner:
// game.js carAim, carMark, walk.js) or there are both at once (the owner's phone, 27 Nov: two teal boxes).
//   xvfb-run -a node tools/car_call.js [out_dir] [WxH]     STEP=20 (m between places) R=110 (m round the start)
const { chromium } = require('playwright');
const fs = require('fs');
const [,, OUT = '/tmp/car-call', size = '1440x900'] = process.argv;
const [W, H] = size.split('x').map(Number), phone = W < 600;
const STEP = +(process.env.STEP || 20), R = +(process.env.R || 110), FAR = +(process.env.FAR || 45);

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => { errors.push(String(e).slice(0, 300)); console.log('pageerror', errors[errors.length - 1]); });
  await p.addInitScript(() => {
    try { localStorage.setItem('bh-quality', 'high'); localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); sessionStorage.setItem('bh-walk-auto', JSON.stringify({ t: 'blue', w: 'clear', film: false })); } catch (e) { /* storage blocked */ }
  });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const s = document.getElementById('game-stage'); return s && s.classList.contains('walk-on'); }, null, { timeout: 900000, polling: 500 });
  await p.waitForFunction(() => window.__game.myCar && window.__game.myCar(), null, { timeout: 300000, polling: 500 });
  // the places: on foot, on the paving (not the carriageway), within 14 m of a street
  const spots = await p.evaluate(([STEP, R]) => {
    const g = window.__game, [cx, cy] = g.G.start.at, out = [];
    for (let dx = -R; dx <= R; dx += STEP) for (let dy = -R; dy <= R; dy += STEP) {
      const x = cx + dx, y = cy + dy, t = g.nav.terrain(x, y), f = g.nav.floorAt(x, y, t + 1.5);
      if (!f || Math.abs(f.z - t) > 1.5) continue;
      const w = g.nav.walk(x, y, f.z + 0.6, true);
      if (!w.ok || (g.nav.carriageway && g.nav.carriageway(x, y) !== false)) continue;
      const q = g.roadNet.nearest(x, y, 14, f.z, 3);
      if (q) out.push([+x.toFixed(1), +y.toFixed(1), +w.z.toFixed(2)]);
    }
    return out;
  }, [STEP, R]);
  console.log(`${spots.length} places on the paving by a street within ${R} m of the start`);
  let bad = 0, n = 0, farN = 0, shown = 0;
  const rows = [];
  for (const [x, y, z] of spots) {
    const r = await p.evaluate(([x, y, z]) => {
      const g = window.__game, pl = g.player;
      pl.x = x; pl.y = y; pl.z = z; g.advance(0.6);
      g.bringCar();
      for (let t = 0; t < 12 && g.carComing(); t += 0.5) g.advance(0.5);
      g.advance(0.3);
      const c = g.myCar(), st = c.D.st, hl = c.C.half || 2.2, hw = c.C.hw || 0.9, fx = Math.sin(st.h), fy = Math.cos(st.h);
      const ins = [];
      g.posts.near(st.x, st.y, hl + 1, q => { if (q.kind === 'npc' || q.kind === 'story') return; const dx = q.x - st.x, dy = q.y - st.y; if (Math.abs(dx * fx + dy * fy) < hl + q.r && Math.abs(-dx * fy + dy * fx) < hw + q.r) ins.push(q.kind); }, st.z);
      if (g.nav.fenceHit) for (let u = -hl + 0.15; u <= hl - 0.15; u += 0.3) for (let v = -hw + 0.15; v <= hw - 0.15; v += 0.3) if (g.nav.fenceHit(st.x + fx * u + fy * v, st.y + fy * u - fx * v, 0.12, st.z + 0.15, st.z + 1.3)) { ins.push('rail'); u = 99; break; }
      return { at: [+st.x.toFixed(1), +st.y.toFixed(1)], m: +Math.hypot(st.x - x, st.y - y).toFixed(1), ins, toast: [...document.querySelectorAll('.g-toast')].map(t => t.textContent).pop() || '' };
    }, [x, y, z]);
    // (the corner is drawn by the page's own frames, not by advance: a few of them before it is read, however slowly this machine draws them)
    { const t0 = await p.evaluate(() => window.__game.t()); await p.waitForFunction(t0 => window.__game.t() > t0 + 0.2, t0, { timeout: 300000, polling: 100 }); }
    Object.assign(r, await p.evaluate(() => { const e = document.querySelector('#g-walk-where .c'), mk = document.querySelector('#g-car-mark.on'); return { line: !!e && !e.hidden, lineText: e ? e.textContent.replace('Your car', 'Your car ') : '', mark: !!mk, markText: mk ? mk.textContent : '' }; }));
    n++;
    rows.push({ from: [x, y], ...r });
    const why = [];
    if (r.ins.length) why.push(`stands in ${[...new Set(r.ins)].join(', ')}`);
    if (r.m > FAR) { farN++; why.push(`${r.m} m off`); }
    if (r.m > 7 && !r.line && !r.mark) why.push('no guide to it, neither its mark nor a line in the corner');
    if (r.line && r.mark) why.push('two guides to it at once, its mark and the corner\'s line');
    if (r.line || r.mark) shown++;
    console.log(`${why.some(w => /stands|guide/.test(w)) ? 'FAIL' : r.m > FAR ? 'far ' : 'ok  '} from ${x},${y}: car at ${r.at}, ${r.m} m${r.ins.length ? `, in ${r.ins.join(',')}` : ''}${r.line ? ` · corner "${r.lineText}"` : ''}${r.mark ? ` · mark "${r.markText}"` : ''}${/no clear/.test(r.toast) ? ` · "${r.toast}"` : ''}`);
    if (why.some(w => /stands|guide/.test(w))) bad++;
  }
  fs.writeFileSync(`${OUT}/car-call.json`, JSON.stringify(rows, null, 1));
  const ms = rows.map(r => r.m).sort((a, b) => a - b);
  console.log(`${n} calls: median ${ms[Math.floor(ms.length / 2)]} m, ${farN} beyond ${FAR} m, ${shown} with one guide to the car, ${bad} failing`);
  if (errors.length) { console.log(`FAIL ${errors.length} page errors`); bad++; }
  await b.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
