// How the crowd is spread round where you stand: the walk (?walk=1) at an hour, you at a spot on foot, the world
// stepped headless a thirtieth of a second at a time through two signal cycles, and once a second the walkers within
// R m of you measured:
//   peak:  the most people inside any circle 2 m across (centred on one of them), and the mean of that per second
//   still: the same for those standing (slower than 0.3 m/s): a heap is people stood still; two flows meeting out on the
//          crossing press closer for a moment and move on, and are reported (peak) but not failed on
//   clump: the most standing within 1.5 m of one of them (a circle 3 m across: twenty in a few metres is a heap)
//   cover: the share of the walkable ground round you (the footways' metre cells, off the road) with someone within 3 m
//   and the worst clump's centre, its people's states (waiting at a kerb, crossing, walking a footway) and their gate.
// It fails on a footway walker held more than HELD s (default 8) without making half a metre of ground, away from a
// kerb, a stop or a seat, or four such held within 1.5 m of one another (a knot met head on, issue 85); and on a clump of people standing: a 2 m circle with more than MAX2 of them (default 6: about 1.9 a square
// metre, past a waiting crowd's comfortable 1 to 1.5 and a queue's 0.6 to 0.9 m spacing; Fruin's level of service D
// for queuing) for more than six seconds of the run, or a 3 m circle with more than MAX3 (default 13: a kerb's crowd at its 0.9 m pace holds about 10 there).
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/crowd_spread.js [HH:MM] [x,y,face] [seconds]
//     (default 17:41 by Hachiko looking across to the kerb under the viaduct, 200 s)
//   SPOTS=all: the four the check reads (Hachiko, the scramble's middle, QFRONT's kerb, the station's kerb)
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const [,, time = '17:41', at = '', secs = '200'] = process.argv;
const MAX2 = +(process.env.MAX2 || 6), MAX3 = +(process.env.MAX3 || 13), R = +(process.env.R || 40), HELD = +(process.env.HELD || 8);
const SPOTS = {
  hachiko: [378, -1030, 0.6], // (Hachiko Square, by the information kiosk and the planters, facing the kerb under the viaduct)
  middle: [362, -1000, 0],
  qfront: [350, -978, 3.4],
  station: [392, -1012, 4.2],
};
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
  const [h, m] = time.split(':').map(Number);
  const spots = at ? { given: at.split(',').map(Number) } : process.env.SPOTS === 'all' ? SPOTS : { hachiko: SPOTS.hachiko };
  let fail = 0;
  for (const [name, spot] of Object.entries(spots)) {
    const r = await p.evaluate(([min, spot, secs, R, MAX2, MAX3]) => {
      window.requestAnimationFrame = () => 0;
      const g = window.__game, me = g.player, C = g.crowd, net = g.crowdNet;
      g.setClock(g.clock.y, 10, 10, min); g.clock.scale = 1; if (g.crowdAuto) g.crowdAuto(true);
      if (g.cine && g.cine.active) g.cine.skip();
      const [x, y, face] = spot;
      const put = () => { me.x = x; me.y = y; me.h = face || 0; me.z = g.nav.terrain(x, y); };
      me.x = x + 400; g.advance(0.05); put();
      for (let t = 0; g.arriving && g.arriving() && t < 6; t += 0.1) { g.settleArrival(); g.advance(0.1); }
      put();
      for (let t = 0; t < 20; t += 1 / 10) { g.advance(1 / 10); put(); } // (the crowd settled round you: the scramble's share drawn in)
      // the walkable ground: metre cells within 2.5 m of a footway, off the road, within R of you
      const road = C.crossings && C.crossings.road, cells = new Set(), tmp = {};
      for (let i = 0; i < net.L.length; i++) {
        const l = net.L[i];
        for (let s = 0; s <= l.len; s += 0.8) {
          net.at(i, s, tmp);
          if (Math.hypot(tmp.x - x, tmp.y - y) > R || Math.abs(tmp.z - me.z) > 2) continue;
          for (let a = -2; a <= 2; a++) for (let c = -2; c <= 2; c++) {
            const cx = Math.round(tmp.x) + a, cy = Math.round(tmp.y) + c;
            if (Math.hypot(cx - tmp.x, cy - tmp.y) > 2.5 || Math.hypot(cx - x, cy - y) > R) continue;
            if (road && road(cx, cy)) continue;
            cells.add(cx * 100000 + cy);
          }
        }
      }
      const W = [...cells].map(k => [Math.round(k / 100000), k - Math.round(k / 100000) * 100000]);
      let peak = 0, busiest = null, still = 0, sum2 = 0, n = 0, over = 0, clump = 0, cover = 0, worst = null, people = 0;
      let grouped = 0, stops = 0, xpeak = 0, xsum = 0, xn = 0; // (walking in a group; stopped along the way; crossers in a 2 m circle round one)
      // (held: each footway walker's longest wait without making half a metre of ground, not at a kerb, a stop or a seat:
      // met head on and jammed, issue 85; a knot: four or more of them so held within 1.5 m of one another)
      C.why = true;
      const made = new Map(); let held = 0, heldAt = null, knot = 0, knotAt = null;
      for (let t = 0; t < secs; t += 1) {
        for (let k = 0; k < 30; k++) { g.advance(1 / 30); put(); }
        const A = C.P.slice(0, C.active).filter(q => q.line >= 0 && Math.hypot(q.x - x, q.y - y) < R && Math.abs(q.z - me.z) < 2);
        people += A.length;
        { const inA = new Set(A); for (const q of made.keys()) if (!inA.has(q)) made.delete(q); } // (out of the circle, or put elsewhere: measured afresh)
        for (const q of A) {
          const free = q.state !== 'walk' || q.pz || q.kw > 0 || q.pause > 0 || q.kerbNext || q.kerbBack || q.stop || q.seat;
          const m = made.get(q);
          if (free || !m || Math.hypot(q.x - m.x, q.y - m.y) > 0.5) { made.set(q, { x: q.x, y: q.y, t, free, tr: [] }); continue; }
          if (m.free) { made.set(q, { x: q.x, y: q.y, t, free: false, tr: [] }); continue; } // (its wait over, here: measured from now)
          m.tr.push([q.line, +q.s.toFixed(1), q.dir, +(q.lat ?? 0).toFixed(2), +(q.v || 0).toFixed(2), +(q.mgT || 0).toFixed(1), q.squeeze > 0 ? 1 : 0, q.detourT > 0 ? q.detourOf : '']); if (m.tr.length > 6) m.tr.shift();
          const d = t - m.t;
          if (d > held) { held = d; heldAt = { t, at: [+q.x.toFixed(1), +q.y.toFixed(1)], line: q.line, s: +q.s.toFixed(1), dir: q.dir, lead: q.lead >= 0, mates: q.mates ? q.mates.length : 0, trace: m.tr.slice(), why: Object.fromEntries(['v', 'lat', 'still', 'slow', 'wait', 'stuckT', 'detourT', 'squeeze', 'pzSlow', 'gw', 'pStuck', 'dodge', 'speed'].map(k => [k, typeof q[k] === 'number' ? +q[k].toFixed(2) : q[k]])), step: q.why, bad: q.whyBad, near: A.filter(o => o !== q && Math.hypot(o.x - q.x, o.y - q.y) < 1.6).map(o => `${o.pz ? 'scr:' + o.ph : o.state}${o.line === q.line ? (o.dir === q.dir ? ' same' : ' oncoming') : ' l' + o.line} d${Math.hypot(o.x - q.x, o.y - q.y).toFixed(2)} v${(o.v || 0).toFixed(2)}${o.lead >= 0 ? ' mate' : o.mates ? ' leader' : ''}`) }; }
        }
        { const H = A.filter(q => { const m = made.get(q); return m && !m.free && t - m.t >= 5; }); for (const q of H) { let a = 0; for (const o of H) if (Math.hypot(o.x - q.x, o.y - q.y) < 1.5) a++; if (a > knot) { knot = a; knotAt = { t, at: [+q.x.toFixed(1), +q.y.toFixed(1)] }; } } }
        grouped += A.filter(q => q.lead >= 0 || (q.mates && q.mates.length)).length;
        stops += A.filter(q => (q.stop && q.pause > 0) || (q.pz && q.ph === 'linger' && q.lst && q.lface != null)).length; // (at a window or a rail on the way, or leaning on something at the square)
        { const X = A.filter(q => q.pz && q.ph === 'cross'); let m = 0; for (const q of X) { let a = 0; for (const o of X) if (Math.hypot(o.x - q.x, o.y - q.y) < 1) a++; if (a > m) m = a; } if (X.length > 4) { xpeak = Math.max(xpeak, m); xsum += m; xn++; } }
        let m2 = 0, s2 = 0, m3 = 0, c3 = null;
        const St = A.filter(q => (q.v ?? 0) < 0.3);
        let c2 = null;
        for (const q of A) { let a2 = 0; for (const o of A) if (Math.hypot(o.x - q.x, o.y - q.y) < 1) a2++; if (a2 > m2) { m2 = a2; c2 = q; } }
        for (const q of St) {
          let a2 = 0, a3 = 0;
          for (const o of St) { const d = Math.hypot(o.x - q.x, o.y - q.y); if (d < 1) a2++; if (d < 1.5) a3++; }
          if (a2 > s2) s2 = a2;
          if (a3 > m3) { m3 = a3; c3 = q; }
        }
        if (s2 > MAX2) over++;
        sum2 += s2; n++;
        if (m2 > peak && c2) { peak = m2; const S = {}; for (const o of A) if (Math.hypot(o.x - c2.x, o.y - c2.y) < 1) { const k = o.pz ? `scr:${o.ph}${o.g ? `@${o.g.x.toFixed(0)},${o.g.y.toFixed(0)}` : ''}` : o.state; S[k] = (S[k] || 0) + 1; } busiest = { t, at: [+c2.x.toFixed(1), +c2.y.toFixed(1)], states: S }; } still = Math.max(still, s2);
        let cv = 0;
        for (const [cx, cy] of W) { for (const q of A) if (Math.abs(q.x - cx) < 3 && Math.abs(q.y - cy) < 3 && Math.hypot(q.x - cx, q.y - cy) < 3) { cv++; break; } }
        cover += W.length ? cv / W.length : 0;
        if (m3 > clump && c3) {
          clump = m3;
          const S = {};
          for (const o of St) if (Math.hypot(o.x - c3.x, o.y - c3.y) < 1.5) { const k = o.pz ? `scr:${o.ph}${o.g ? `@${o.g.x.toFixed(0)},${o.g.y.toFixed(0)}` : ''}` : `${o.state}${o.kw ? ':kerb' : ''}${o.v < 0.1 ? ':still' : ''}`; S[k] = (S[k] || 0) + 1; }
          const walk = C.plazas && C.plazas[0] ? C.plazas.map(pz => pz.walk()) : [];
          worst = { t, at: [+c3.x.toFixed(1), +c3.y.toFixed(1)], states: S, walk };
        }
      }
      const gates = (C.plazas || []).flatMap(pz => (pz.gates || []).map(gt => ({ at: [+gt.x.toFixed(0), +gt.y.toFixed(0)], n: gt.n, len: +gt.len.toFixed(0) })));
      return { held, heldAt, knot, knotAt, grouped: people ? +(grouped / people).toFixed(2) : 0, stops: +(stops / n).toFixed(1), xpeak, xmean: xn ? +(xsum / xn).toFixed(1) : 0, peak, busiest, still, mean2: +(sum2 / n).toFixed(1), over, clump, cover: +(cover / n).toFixed(2), people: +(people / n).toFixed(0), cells: W.length, worst, gates };
    }, [h * 60 + m, spot, +secs, R, MAX2, MAX3]);
    const bad = r.over > 6 || r.clump > MAX3 || r.held > HELD || r.knot >= 4;
    if (bad) fail++;
    console.log(`[${name}] ${time} at ${spot.join(',')}: ${r.people} walkers within ${R} m on ${r.cells} m2 of footway; most in a 2 m circle ${r.peak}, standing ${r.still} (mean ${r.mean2}, over ${MAX2} for ${r.over} s); most standing in a 3 m circle ${r.clump}; ground with someone within 3 m ${Math.round(r.cover * 100)}%  ${bad ? 'CLUMP' : 'ok'}`);
    console.log(`  in groups ${Math.round(r.grouped * 100)}% of them; stopped along the way ${r.stops} at a time; crossing, most in a 2 m circle ${r.xpeak} (${(r.xpeak / Math.PI).toFixed(1)} a m2), mean of each second's most ${r.xmean} (${(r.xmean / Math.PI).toFixed(1)} a m2)`);
    console.log(`  footway: longest held without making half a metre ${r.held} s ${JSON.stringify(r.heldAt)}; most so held 5 s or more within 1.5 m ${r.knot} ${JSON.stringify(r.knotAt)}${r.held > HELD || r.knot >= 4 ? '  KNOT' : ''}`);
    console.log(`  busiest at t ${r.busiest && r.busiest.t}s ${JSON.stringify(r.busiest)}`);
    console.log(`  worst standing at t ${r.worst && r.worst.t}s ${JSON.stringify(r.worst)}`);
    console.log(`  gates ${JSON.stringify(r.gates)}`);
  }
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
