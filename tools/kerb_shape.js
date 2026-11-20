// The shape of the crowd waiting at a scramble's kerbs (issue 75): the walk (?walk=1) at an hour, you at a spot on foot,
// the world stepped headless a thirtieth of a second at a time through a few signal cycles, and once a second while
// the walk is not on, for each kerb within R m of you with at least MIN people standing waiting at it:
//   n:      how many stand waiting there
//   depth:  how far behind the kerb they stand (m: the deepest; rows, the depth over a pace)
//   gap:    each one's nearest neighbour (m: the mean, and its spread over the mean, cv: a ruled line is near 0)
//   front:  the front third's distance behind the kerb, its spread (m: a ruled line along the kerb's edge is near 0)
//   turn:   how far each faces from square to the road (degrees: the spread; a parade is near 0)
//   phone:  the share of those drawn as people near the lens who would look at a phone standing (look.clip)
// Means over the samples are printed, kerb by kerb, and over all. Fails when no kerb was sampled.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/kerb_shape.js [HH:MM] [x,y] [seconds]      (default 17:41 by Hachiko, 150 s; MIN=8, R=40)
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const [,, time = '17:41', at = '378,-1030', secs = '150'] = process.argv;
const MIN = +(process.env.MIN || 8), R = +(process.env.R || 40);
(async () => {
  const b = await chromium.launch(process.env.DISPLAY
    ? { headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] }
    : { args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 480, height: 300 } });
  await p.addInitScript(() => { try { localStorage.setItem('oe3d-onboard', '1'); } catch (e) { /* storage blocked */ } });
  p.on('pageerror', e => console.log(`pageerror: ${String(e).slice(0, 300)}`));
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game', null, { timeout: 400000 });
  await startPlay(p);
  const [h, m] = time.split(':').map(Number), spot = at.split(',').map(Number);
  const r = await p.evaluate(([min, spot, secs, R, MIN]) => {
    window.requestAnimationFrame = () => 0;
    const g = window.__game, me = g.player, C = g.crowd;
    g.setClock(g.clock.y, 10, 10, min); g.clock.scale = 1; if (g.crowdAuto) g.crowdAuto(true);
    if (g.cine && g.cine.active) g.cine.skip();
    const [x, y] = spot, put = () => { me.x = x; me.y = y; me.h = 0; me.z = g.nav.terrain(x, y); };
    me.x = x + 400; g.advance(0.05); put();
    for (let t = 0; g.arriving && g.arriving() && t < 6; t += 0.1) { g.settleArrival(); g.advance(0.1); }
    put();
    for (let t = 0; t < 30; t += 1 / 10) { g.advance(1 / 10); put(); } // (the crowd settled round you: the scramble's share drawn in)
    const K = {}, sd = a => { if (a.length < 2) return 0; const mu = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - mu) * (v - mu), 0) / a.length); };
    const mean = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
    let phones = 0, looks = 0;
    for (let t = 0; t < secs; t += 1) {
      for (let k = 0; k < 30; k++) { g.advance(1 / 30); put(); }
      for (const q of C.P.slice(0, C.active)) if (q.look) { looks++; if (q.look.clip === 'Phone') phones++; }
      const W = C.P.slice(0, C.active).filter(q => q.pz && q.ph === 'wait' && q.g && (q.v ?? 0) < 0.3 && Math.hypot(q.x - x, q.y - y) < R && !q.pz.walk());
      const by = new Map();
      for (const q of W) { if (!by.has(q.g)) by.set(q.g, []); by.get(q.g).push(q); }
      for (const [gt, A] of by) {
        if (A.length < MIN) continue;
        const key = `${gt.x.toFixed(0)},${gt.y.toFixed(0)}`, o = K[key] || (K[key] = { n: [], deep: [], rows: [], gap: [], cv: [], front: [], turn: [] });
        const dep = A.map(q => (q.x - gt.x) * gt.ox + (q.y - gt.y) * gt.oy), road = Math.atan2(-gt.ox, -gt.oy);
        const nn = A.map(q => Math.min(...A.filter(r => r !== q).map(r => Math.hypot(r.x - q.x, r.y - q.y))));
        const fr = dep.slice().sort((a, b) => a - b).slice(0, Math.max(2, Math.ceil(A.length / 3)));
        const deep = Math.max(...dep);
        o.n.push(A.length); o.deep.push(deep); o.rows.push(Math.max(1, (deep - Math.min(...dep)) / 0.75 + 1));
        o.gap.push(mean(nn)); o.cv.push(sd(nn) / (mean(nn) || 1)); o.front.push(sd(fr));
        o.turn.push(sd(A.map(q => Math.atan2(Math.sin(q.h - road), Math.cos(q.h - road)) * 180 / Math.PI)));
      }
    }
    const out = {};
    for (const [k, o] of Object.entries(K)) out[k] = Object.fromEntries(Object.entries(o).map(([f, a]) => [f, +mean(a).toFixed(2)]).concat([['samples', o.n.length]]));
    return { kerbs: out, phone: looks ? +(phones / looks).toFixed(2) : 0 };
  }, [h * 60 + m, spot, +secs, R, MIN]);
  const all = Object.values(r.kerbs), w = all.reduce((s, o) => s + o.samples, 0), avg = f => (w ? all.reduce((s, o) => s + o[f] * o.samples, 0) / w : 0);
  for (const [k, o] of Object.entries(r.kerbs)) console.log(`kerb ${k}: ${o.samples} samples, ${o.n} waiting, ${o.deep} m deep (${o.rows} rows), gap ${o.gap} m (cv ${o.cv}), front spread ${o.front} m, turn spread ${o.turn} deg`);
  console.log(`all: ${w} samples, ${avg('n').toFixed(1)} waiting a kerb, ${avg('deep').toFixed(2)} m deep (${avg('rows').toFixed(1)} rows), gap ${avg('gap').toFixed(2)} m (cv ${avg('cv').toFixed(2)}), front spread ${avg('front').toFixed(2)} m, turn spread ${avg('turn').toFixed(1)} deg; phones ${Math.round(r.phone * 100)}% of the crowd`);
  await b.close();
  if (!w) { console.log('FAIL no kerb with a crowd waiting was sampled'); process.exit(1); }
})().catch(e => { console.error(e); process.exit(2); });
