// What a junction with signals passes (issue 175): stand at a kerb by it for some minutes of the game's time and
// measure, as a traffic engineer's count at the stop line would,
//   the cycle      each phase's green, its change, and the whole: the mean, the longest, each phase's share
//   the flow       per arm, the vehicles that went into the box in each of its greens, against the queue that waited
//                  when the green began, and the headway between them once the first has gone
//   the loss       per arm, the seconds of its green that the vehicle at its line stood, by the reason it gave
// for the junctions with signals within R (45 m) of each place given.
//   xvfb-run -a node tools/junction_flow.js shibuya [minutes=6] [x,y ...]       (PHONE=1: a phone's district; CYCLES=1:
//   every cycle printed)
// The places default to the Scramble and the foot of Dogenzaka at 109. With CHECK=1 it fails where the figures of
// docs/ROADS.md ("The junctions' capacity") are not kept: a cycle over 130 s, a queued arm's green that passes
// nobody, an arm that passes under a third of its queue.
const { chromium, devices } = require('playwright');
const { startPlay } = require('./start_play');
const { pinClock } = require('./pin_clock');
const [,, city = 'shibuya', MIN = '6', ...at] = process.argv;
const PLACES = at.length ? at.map(s => s.split(',').map(Number)) : [[372, -1010], [268, -998.6]];
const R = +(process.env.R || 45);

// (in the page) watch the junctions within R of (x, y) for `secs`
function watch({ x, y, secs, R }) {
  const g = window.__game, JN = g.junctions, cars = g.cars, C = cars.C, L = cars.netL, FN = g.footNet, at = {};
  const HALF = { motorway: 7, trunk: 6, primary: 6, secondary: 5, tertiary: 4.5, residential: 3.5, unclassified: 3 };
  const clear = (px, py) => { const r = g.roadNet.nearest(px, py, 14); return !r || r.d > (HALF[L[r.line].c] || 3.5) + 1.5; };
  // (on a footway out of every scramble's reach: on foot at a scramble's kerb you press for its walk, pilot.js, and
  // the count would be of a junction whose turns you keep cutting short)
  const far = JN.scrambles || [];
  let k = null, bd = 110;
  for (const i of new Set(FN.near(x, y, 0, 110))) { const l = FN.L[i]; for (let s = 0; s <= l.len; s += 2) { FN.at(i, s, at); const d = Math.hypot(at.x - x, at.y - y); if (d < bd && clear(at.x, at.y) && !far.some(j => Math.hypot(j.x - at.x, j.y - at.y) < (j.reach || 30) + 14)) { bd = d; k = { x: at.x, y: at.y, z: at.z }; } } }
  g.hopTo(k ? k.x : x, k ? k.y : y, k ? k.z : g.player.z, 'the kerb');
  g.advance(30); // (the traffic settles round the new place)
  const JS = JN.J.filter(j => j.sig && !j.rail && j.mid == null && Math.hypot(j.x - x, j.y - y) < R);
  const out = JS.map(j => ({ id: j.id, at: [Math.round(j.x), Math.round(j.y)], scramble: !!j.scramble, green: j.green.slice(), phases: [], arms: j.arms.filter(a => a.in).map(a => ({ i: a.i, phase: a.phase, c: L[a.line].c, lanes: JN.lanesOf(L[a.line]), dir: Math.round(Math.atan2(Math.sin(a.out), Math.cos(a.out)) * 180 / Math.PI), greens: [], lost: {}, cur: null })) }));
  const S = JS.map(j => ({ ph: j.ph, st: j.st, t0: 0, seen: new Set(j.active.map(o => o.c)) }));
  const DT = 0.25;
  for (let t = 0; t < secs; t += DT) {
    g.advance(DT);
    JS.forEach((j, n) => {
      const s = S[n], o = out[n];
      if (j.ph !== s.ph || j.st !== s.st) { o.phases.push([s.ph, s.st, +(t - s.t0).toFixed(2)]); s.ph = j.ph; s.st = j.st; s.t0 = t; }
      const now = new Set();
      for (const q of j.active) { now.add(q.c); if (!s.seen.has(q.c)) { const A = o.arms.find(a => a.i === q.k); if (A && A.cur) A.cur.in.push(+(t - A.cur.t0).toFixed(2)); else if (A) A.late = (A.late || 0) + 1; } }
      s.seen = now;
      // (a scramble's crowd off its walk: who stands in the carriageway while the traffic has its turn, sampled each second)
      if (j.scramble && j.ph < 2 && j.st === 'g' && j.t > 3 && Math.abs(t - Math.round(t)) < 1e-6 && g.crowd && g.crowd.P && g.crowd.crossings) {
        let n = 0; const P = g.crowd.P, road = g.crowd.crossings.road;
        for (let i = 0; i < Math.min(g.crowd.active, P.length); i++) { const q = P[i]; if ((q.line >= 0 || q.pz) && (q.v || 0) < 0.3 && Math.hypot(q.x - j.x, q.y - j.y) < (j.reach || 30) + 12 && road(q.x, q.y)) { n++; const k = `${Math.round(q.x / 4) * 4},${Math.round(q.y / 4) * 4} ${q.pz ? q.ph : 'footway'}`; (o.inRoad || (o.inRoad = {}))[k] = (o.inRoad[k] || 0) + 1; } }
        o.roadN = (o.roadN || 0) + n; o.roadT = (o.roadT || 0) + 1; o.roadMax = Math.max(o.roadMax || 0, n);
      }
      for (const A of o.arms) {
        const a = j.arms[A.i], lt = JN.light(a);
        if (lt === 'g' && !A.cur) A.cur = { t0: t, q: a.qn || 0, in: [] };
        // (the amber's cars count to the green they came through on; the green's record closes at the red)
        if (lt === 'r' && A.cur) { A.cur.len = +(t - A.cur.t0).toFixed(1); A.greens.push(A.cur); A.cur = null; }
        if (lt === 'g') { // the vehicle at this arm's line, standing in its green: why
          let head = null;
          for (let i = 0; i < Math.min(C.length, cars.active); i++) { const c = C[i]; if (c.line >= 0 && c.lineArm === a && c.toLine - c.half < 3 && (!head || c.toLine < head.toLine)) head = c; }
          const me = g.pilot && g.pilot() ? g.pilot().drv.st : null;
          if (me && me.lineAt === a && me.toLine - 2.3 < 3 && me.v < 0.3) A.lost[`you: ${me.junction || '?'}`] = (A.lost[`you: ${me.junction || '?'}`] || 0) + DT;
          else if (head && head.v < 0.3) {
            let w = `${head.why || '?'}${head.heldBy ? '/' + head.heldBy : ''}`;
            // (held by a movement in the box: the first there that crosses its own, from which arm to which)
            if (head.why === 'cross' && head.lineEx) { const m = JN.mv(head, head.lineEx), by = j.active.find(q => q.c !== head && (JN.conflict(j, a.i, m, q.k, q.m) || q.c.half > 3.5 || head.half > 3.5)); if (by) w += ` by ${by.k}>${by.m & 15}${by.c.half > 3.5 ? ' bus' : ''}${(by.c.v || 0) < 0.3 ? ' standing ' + (by.c.why || '') : ''}`; }
            A.lost[w] = (A.lost[w] || 0) + DT;
            // (held by someone on foot, at its line or of the car in the box it waits on: who, where, doing what)
            const stoodFor = head.why === 'person' ? head : head.why === 'cross' ? (j.active.find(q => q.c !== head && (q.c.v || 0) < 0.3 && q.c.why === 'person') || {}).c : null;
            if (stoodFor) {
              const fx = stoodFor.x + Math.sin(stoodFor.h) * (stoodFor.half + 2), fy = stoodFor.y + Math.cos(stoodFor.h) * (stoodFor.half + 2); let who = null, bd = 6;
              const P = g.crowd && g.crowd.P ? g.crowd.P : [];
              for (let i = 0; i < Math.min(g.crowd ? g.crowd.active : 0, P.length); i++) { const q = P[i], d = Math.hypot(q.x - fx, q.y - fy); if (d < bd) { bd = d; who = `walker ${q.ph || ''}${q.wait ? ' waiting' : ''} v ${(q.v || 0).toFixed(1)}`; } }
              for (const n of g.npcs || []) { const d = Math.hypot(n.x - fx, n.y - fy); if (d < bd) { bd = d; who = `npc ${n.id || n.name}`; } }
              { const d = Math.hypot(g.player.x - fx, g.player.y - fy); if (d < bd) { bd = d; who = 'you'; } }
              const key = `${who || 'nobody found'} near ${Math.round(fx / 3) * 3},${Math.round(fy / 3) * 3} in ph ${j.ph}${j.st} `;
              (o.people || (o.people = {}))[key] = (o.people[key] || 0) + DT;
            }
          }
        }
      }
    });
  }
  return out;
}

(async () => {
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const ctx = await b.newContext(process.env.PHONE ? { ...devices['iPhone 13'] } : { viewport: { width: 1100, height: 650 } });
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log('pageerror', String(e).slice(0, 400)));
  await p.addInitScript(() => { try { localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } });
  await pinClock(p, city);
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-${city}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.cars', null, { timeout: 400000 });
  await p.evaluate(async () => { const g = window.__game; g.hold(true, true); await g.ways.build(); if (g.lateReady) await g.lateReady(); });
  await startPlay(p, { asIs: !!process.env.ASIS });
  await p.evaluate(() => { const g = window.__game; for (let t = 0; g.arriving() && t < 10; t += 0.25) g.advance(0.25); g.advance(2); });
  if (process.env.DUMP) { // the junctions as built: their arms, stop lines, ways across and which of them cross
    for (const [x, y] of PLACES) console.log(await p.evaluate(({ x, y, R }) => {
      const g = window.__game, JN = g.junctions, L = g.cars.netL, out = [];
      g.hopTo(x, y, g.player.z, 'the kerb'); g.advance(40);
      for (const j of JN.J.filter(q => q.sig && q.mid == null && Math.hypot(q.x - x, q.y - y) < R)) {
        out.push(`junction ${j.id} at ${j.x.toFixed(0)},${j.y.toFixed(0)}${j.scramble ? ' scramble, reach ' + j.reach.toFixed(0) : ''} green ${j.green} allred ${j.allred || 1} amber ${j.amber} arrow ${!!j.arrow}${j.lead ? `, run from scramble ${j.lead.id} (its stage ${j.leadPh} with that one's traffic)` : ''}${j.cycle ? `, cycle ${j.cycle} s at most` : ''}${j.staged ? ', stages set by what crosses' : ''}`);
        if (j.scramble) out.push(`  (all scrambles: ${JN.scrambles.map(q => `${q.id} at ${q.x.toFixed(0)},${q.y.toFixed(0)}`).join('; ')}; run from one: ${JN.J.filter(q => q.lead).map(q => `${q.id} at ${q.x.toFixed(0)},${q.y.toFixed(0)} from ${q.lead.id}`).join('; ')})`);
        const M = [];
        for (const a of j.arms) {
          const l = L[a.line], far = JN.armBy(a.line, 1 - a.end);
          out.push(`  arm ${a.i}: ${l.c}${l.ow ? ' one-way' : ''} line ${a.line} len ${l.len.toFixed(0)} m, heading out ${Math.round(a.out * 180 / Math.PI)} deg, ${a.in ? 'in' : 'out only'}, phase ${a.phase}, line ${a.back.toFixed(1)} m back, lanes ${a.lanes}, far end ${far ? 'junction ' + far.j.id + (far.j.sig ? ' (lights)' : '') : 'none'}`);
          if (a.in) for (const e of JN.exits(a)) { const w = e.way, len = w ? (w.length / 2 - 1) * 1.2 : 0; out.push(`     to arm ${e.m.i}: turn ${Math.round(e.turn * 180 / Math.PI)} deg${e.across ? ' across' : ''}, way ${len.toFixed(0)} m, lanes ${e.lanes}`); M.push([a, e]); }
        }
        for (let u = 0; u < M.length; u++) { const [a, e] = M[u], X = []; for (let v = 0; v < M.length; v++) { const [b, f] = M[v]; if (b !== a && JN.conflict(j, a.i, e.m.i, b.i, f.m.i)) {
              // (how: the least distance between the two ways and how far along this one, and whether their lines cut each other)
              const A = e.way, B = f.way; let md = 1e9, at = 0, cut = false;
              for (let i = 0; i < A.length; i += 2) for (let q = 0; q < B.length; q += 2) { const d = Math.hypot(A[i] - B[q], A[i + 1] - B[q + 1]); if (d < md) { md = d; at = i / 2 * 1.2; } }
              const ccw = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
              for (let i = 2; i < A.length && !cut; i += 2) for (let q = 2; q < B.length; q += 2) if (ccw(A[i - 2], A[i - 1], A[i], A[i + 1], B[q - 2], B[q - 1]) * ccw(A[i - 2], A[i - 1], A[i], A[i + 1], B[q], B[q + 1]) < 0 && ccw(B[q - 2], B[q - 1], B[q], B[q + 1], A[i - 2], A[i - 1]) * ccw(B[q - 2], B[q - 1], B[q], B[q + 1], A[i], A[i + 1]) < 0) { cut = true; break; }
              X.push(`${b.i}>${f.m.i}${b.phase === a.phase ? '*' : ''}(${cut ? 'cuts' : f.m.i === e.m.i ? 'joins' : 'near ' + md.toFixed(1)} at ${at.toFixed(0)} m)`);
            } } out.push(`  ${a.i}>${e.m.i} (phase ${a.phase}) crosses (* in its own stage): ${X.join(' ') || 'none'}`); }
      }
      return out.join('\n');
    }, { x, y, R }));
    await b.close(); return;
  }
  let bad = 0;
  const NAME = ['main', 'cross', 'arrow', 'walk'], f1 = v => v.toFixed(1), mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const seen = new Set();
  for (const [x, y] of PLACES) {
    const js = await p.evaluate(watch, { x, y, secs: +MIN * 60, R });
    for (const j of js) {
      if (seen.has(j.id)) continue;
      seen.add(j.id);
      // the cycles: from one start of the main road's green to the next
      const cyc = []; let cur = null;
      for (const [ph, st, d] of j.phases) { if (ph === 0 && st === 'g') { if (cur) cyc.push(cur); cur = { len: 0, g: [0, 0, 0, 0] }; } if (cur) { cur.len += d; if (st === 'g') cur.g[ph] += d; } }
      const lens = cyc.map(c => c.len), share = [0, 1, 2, 3].map(ph => (cyc.length ? cyc.reduce((s, c) => s + c.g[ph], 0) / cyc.reduce((s, c) => s + c.len, 0) : 0));
      console.log(`junction ${j.id} at ${j.at}${j.scramble ? ' (scramble)' : ''}: ${cyc.length} cycles, mean ${f1(mean(lens))} s, longest ${f1(Math.max(0, ...lens))} s; green ${[0, 1, 2, 3].filter(ph => share[ph] > 0).map(ph => `${NAME[ph]} ${f1(mean(cyc.map(c => c.g[ph])))} s (${Math.round(share[ph] * 100)}%)`).join(', ')}`);
      if (process.env.CYCLES) for (const c of cyc) console.log(`   cycle ${f1(c.len)} s: ${c.g.map((v, ph) => `${NAME[ph]} ${f1(v)}`).join(', ')}`);
      const perHour = 3600 / Math.max(1, mean(lens));
      for (const A of j.arms) {
        const G = A.greens, n = G.reduce((s, q) => s + q.in.length, 0), queued = G.filter(q => q.q > 0), none = queued.filter(q => !q.in.length).length;
        const heads = []; for (const q of G) for (let i = 1; i < q.in.length; i++) heads.push(q.in[i] - q.in[i - 1]);
        const first = G.filter(q => q.in.length && q.q > 0).map(q => q.in[0]);
        const lost = Object.entries(A.lost).sort((u, v) => v[1] - u[1]).slice(0, 6).map(([w, s]) => `${w} ${Math.round(s)} s`).join(', ');
        const qMean = mean(queued.map(q => q.q)), passQ = mean(queued.map(q => q.in.length));
        console.log(`   arm ${A.i} (${A.c}, ${A.lanes} lane${A.lanes > 1 ? 's' : ''}, ${NAME[A.phase]}): ${n} in over ${G.length} greens of ${f1(mean(G.map(q => q.len)))} s = ${f1(G.length ? n / G.length : 0)} a green, ${Math.round((G.length ? n / G.length : 0) * perHour)} an hour; queued greens ${queued.length}, queue ${f1(qMean)}, passed ${f1(passQ)}, none through in ${none}; first away after ${f1(mean(first))} s, headway ${f1(mean(heads))} s${A.late ? `; ${A.late} in at a red` : ''}${lost ? `; stood at the line in green: ${lost}` : ''}`);
        if (process.env.CHECK) {
          if (queued.length >= 3 && none > Math.max(1, queued.length / 4)) { bad++; console.log(`FAIL junction ${j.id} arm ${A.i}: ${none} of ${queued.length} greens with a queue passed nobody`); }
          if (queued.length >= 3 && qMean >= 2 && passQ < Math.min(qMean, 3) / 3) { bad++; console.log(`FAIL junction ${j.id} arm ${A.i}: a queue of ${f1(qMean)} and ${f1(passQ)} through a green`); }
        }
      }
      if (j.roadT) console.log(`   standing in the carriageway in the traffic's turns: ${f1(j.roadN / j.roadT)} of the crowd at a time, ${j.roadMax} at most; where: ${Object.entries(j.inRoad || {}).sort((u, v) => v[1] - u[1]).slice(0, 6).map(([w, n]) => `${w} ${f1(n / j.roadT)}`).join('; ')}`);
      if (j.people) console.log(`   stood for people: ${Object.entries(j.people).sort((u, v) => v[1] - u[1]).slice(0, 8).map(([w, t]) => `${w}${Math.round(t)} s`).join('; ')}`);
      if (process.env.CHECK && cyc.length && Math.max(...lens) > 130) { bad++; console.log(`FAIL junction ${j.id}: a cycle of ${f1(Math.max(...lens))} s (130 at most)`); }
    }
  }
  if (process.env.CHECK && !bad) console.log('ok   the junctions keep their cycles and pass their queues');
  await b.close();
  process.exit(bad ? 1 : 0);
})();
