// Jams: the traffic run for some minutes of the game's time round a place, and every car that stood for a long
// while listed with what held it, the chain of cars in front of it, and the knots (a chain that comes back to
// itself). CAR=x,y,h parks your car there first (on a kerb's corner, say) and sits you in it, as a player leaves it.
//   xvfb-run -a node tools/jam_probe.js shibuya [seconds=300] [x,y] [still=30]
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const { pinClock } = require('./pin_clock');
const [,, city = 'shibuya', SECS = '300', at = '372,-1010', STILL = '30'] = process.argv;
(async () => {
  const b = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 900, height: 560 } });
  p.on('pageerror', e => console.log('pageerror', String(e).slice(0, 400)));
  await p.addInitScript(() => { try { localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* */ } });
  await pinClock(p, city);
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-${city}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.cars', null, { timeout: 400000 });
  await p.evaluate(async () => { const g = window.__game; g.hold(true, true); await g.ways.build(); if (g.lateReady) await g.lateReady(); });
  await startPlay(p, { asIs: true });
  await p.evaluate(() => { const g = window.__game; window.requestAnimationFrame = () => 0; for (let t = 0; g.arriving() && t < 10; t += 0.25) g.advance(0.25); g.advance(2); });
  const r = await p.evaluate(async ({ secs, at, still, car, want, watch, seen, trace }) => {
    const g = window.__game, A = g.cars, C = A.C, L = A.netL;
    const [x, y] = at.split(',').map(Number); let carAt = null;
    g.hopTo(x, y, g.player.z, 'here');
    if (car) { // (your car brought to the kerb nearest you, and you sat in it, as the player in the report)
      for (let t = 0; !g.myCar() && t < 60; t++) { await new Promise(r => setTimeout(r, 500)); g.advance(0.1); }
      if (!g.myCar()) return { err: 'no car' };
      g.bringCar(); for (let t = 0; g.carComing() && t < 40; t++) g.advance(0.25);
      const st = g.myCar().D.st; g.player.x = st.x + Math.cos(st.h) * 1.6; g.player.y = st.y - Math.sin(st.h) * 1.6; g.enterCar();
      carAt = [+st.x.toFixed(1), +st.y.toFixed(1), +st.h.toFixed(2), g.player.mode];
    }
    if (seen) A.knotsSeen = true;
    g.advance(20);
    const stood = new Float32Array(C.length), worst = new Map(), DT = 0.5;
    const idx = new Map(C.map((c, i) => [c, i]));
    const desc = c => c ? `#${idx.get(c)} ${c.why || '-'}${c.youBy ? `(${c.youBy})` : ''} v${(c.v || 0).toFixed(1)} line ${c.line}${c.mv ? ` in j${c.mv.j.id}` : c.lineArm ? ` at j${c.lineArm.j.id}` : ''} @${c.x.toFixed(0)},${c.y.toFixed(0)}` : 'none';
    let maxNear = 0; const knots = []; const tr = [];
    const W = watch ? watch.split(',').map(Number) : [], red = {}, seq = {};
    for (let t = 0; t < secs; t += DT) {
      if (want) A.want = want;
      g.advance(DT);
      const px = g.player.x, py = g.player.y;
      if (t % 1 === 0) for (const jid of W) { const j = A.junctions.J.find(q => q.id === jid); if (!j) continue;
        for (const a of j.arms) { const k = jid + ':' + a.i, lt = A.junctions.light(a), q = C.some((c, ci) => ci < A.active && c.lineArm === a && c.v < 0.3 && c.toLine - c.half < 4);
          const R = red[k] || (red[k] = { cur: 0, max: 0 }); R.cur = q && lt !== 'g' ? R.cur + 1 : 0; R.max = Math.max(R.max, R.cur);
          const sq = seq[k] || (seq[k] = []); const tag = (lt || '-') + (q ? '*' : ''); if (!sq.length || sq[sq.length - 1][0] !== tag) sq.push([tag, t]); } }
      if (trace && t % 1 === 0) { const [tj, ta] = trace.split(':').map(Number); const hd = C.slice(0, A.active).filter(c => c.lineArm && c.lineArm.j.id === tj && c.lineArm.i === ta).sort((a, b) => a.toLine - b.toLine)[0];
        if (hd) { const e2 = hd.ex2; tr.push(`${t} ${desc(hd)} toLine ${(hd.toLine - hd.half).toFixed(1)} ex ${hd.lineEx && hd.lineEx.m.line} a2 ${e2 && e2.a ? e2.a.j.id + ':' + e2.a.i : '-'} lt2 ${e2 && e2.a && e2.e ? A.junctions.light(e2.a, e2.e) : '-'} xBy ${desc(hd.xBy)} roomBy ${desc(hd.roomBy)}`); } }
      for (let i = 0; i < Math.min(C.length, A.active); i++) {
        const c = C[i];
        if (c.line < 0 || c.park || c.parking || (c.bus && c.why === 'stop')) { stood[i] = 0; continue; }
        if (Math.hypot(c.x - px, c.y - py) > 250) { stood[i] = 0; continue; }
        stood[i] = c.v < 0.3 ? stood[i] + DT : 0;
        if (stood[i] >= still) {
          const chain = []; let f = c.front, seen = new Set([c]), loop = false;
          for (let k = 0; f && k < 8; k++) { if (seen.has(f)) { loop = true; chain.push('LOOP->#' + idx.get(f)); break; } seen.add(f); chain.push(desc(f)); f = f.front; }
          if ((stood[i] === 60 || stood[i] === 150) && knots.length < 12) { // (the junction it waits at, as it stands then: who is in its box and why)
            const j = (c.lineArm && c.lineArm.j) || (c.mv && c.mv.j);
            const j2 = c.ex2 && c.ex2.a && c.ex2.a.j;
            if (j2 && j2 !== j) knots.push({ t, car: desc(c), second: true, j: j2.id, ph: [j2.ph, j2.st, +(j2.t || 0).toFixed(1)], myLight: A.junctions.light(c.ex2.a, c.ex2.e), busy: j2.busy, active: j2.active.map(o => `${desc(o.c)} arm ${o.k} mv ${o.m}${o.forced ? ' forced' : ''} in at ${(+o.t).toFixed(0)} conflict ${A.junctions.conflict(j2, c.ex2.a.i, A.junctions.mv(c, c.ex2.e), o.k, o.m)}`) });
            if (j) knots.push({ t, car: desc(c), j: j.id, sig: !!j.sig, active: j.active.map(o => `${desc(o.c)} [front ${desc(o.c.front)} / ${desc(o.c.front && o.c.front.front)}] mvline ${o.c.mv && o.c.mv.e.m.line} back ${o.c.mv && o.c.mv.e.m.back.toFixed(1)} s ${o.c.s.toFixed(1)}/${A.netL[o.c.line].len.toFixed(1)} dir ${o.c.dir} arm ${o.k} mv ${o.m}${o.forced ? ' forced' : ''} since ${(t - 0).toFixed(0)}`), pend: j.pend.map(o => desc(o.c)), lights: j.arms.map(a => `${a.i}:${A.junctions.light ? A.junctions.light(a) : '?'}`).join(' ') });
          }
          const w = worst.get(i);
          if (!w || stood[i] > w.s) worst.set(i, { s: stood[i], t: +t.toFixed(0), car: desc(c), chain, loop, d: +Math.hypot(c.x - px, c.y - py).toFixed(0) });
        }
      }
    }
    const list = [...worst.values()].sort((a, b) => b.s - a.s);
    const byWhy = {}; for (const w of list) { const k = w.car.split(' ')[1]; byWhy[k] = (byWhy[k] || 0) + 1; }
    const ST = A.stats(); return { tr, knotsUndone: ST.knotsUndone, knotsGone: ST.knotsGone, knotLog: (ST.knotLog || []).slice(0, 15), squeezes: ST.squeezes, cars: A.active, long: list.length, byWhy, list: list.slice(0, 12), knots, carAt, red, seq: Object.fromEntries(Object.entries(seq).map(([k, v]) => [k, v.map(x => x[0] + '@' + x[1]).join(' ')])) };
  }, { secs: +SECS, at, still: +STILL, car: process.env.CAR || '', want: +process.env.WANT || 0, watch: process.env.WATCH || '', seen: !!process.env.SEEN, trace: process.env.TRACE || '' });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
