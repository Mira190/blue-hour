// Walkers met head on along a footway (issue 85): on the walk (?walk=1), on footway lines round the Scramble, two
// parties are put facing each other a few metres apart, each a group abreast (a leader and its mates) or someone alone,
// with the rest of the crowd going about its business round them, and the world stepped a thirtieth of a second at a
// time. For each one put there it measures the longest it stood without making half a metre of ground, whether it got
// past the other party (6 m beyond where they met) and whether it turned back. People passing on a street step aside
// or turn a shoulder and walk on: nobody should be held more than a few seconds, and nobody should turn back.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/crowd_knot.js [seconds per case, default 25]
// Fails (exit 1) on anyone held more than HELD s (default 6), on a case where fewer than all got past, or where more than
// one turned back before getting past.
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const secs = +(process.argv[2] || 25), HELD = +(process.env.HELD || 6);
// [name, x, y, sizes of the two parties]: footways by the Scramble (Hachiko's side and the station's kerb, issue 85's two knots)
const CASES = [
  ['hachiko 3v3', 393, -988, [3, 3]],
  ['hachiko 2v3', 393, -988, [2, 3]],
  ['station 3v2', 418, -1029, [3, 2]],
  ['station 4v1', 418, -1029, [4, 1]],
  ['qfront 2v2', 345, -972, [2, 2]],
];
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
  let fail = 0;
  for (const [name, x, y, sizes] of CASES) {
    const r = await p.evaluate(([x, y, sizes, secs]) => {
      window.requestAnimationFrame = () => 0;
      const g = window.__game, me = g.player, C = g.crowd, net = g.crowdNet, P = C.P;
      C.why = true;
      g.setClock(g.clock.y, 10, 10, 17 * 60 + 41); g.clock.scale = 1; if (g.crowdAuto) g.crowdAuto(true);
      // you stand 12 m off, out of the way
      const put = () => { me.x = x + 12; me.y = y + 9; me.z = g.nav.terrain(me.x, me.y); };
      put(); for (let t = 0; t < 8; t += 0.1) { g.advance(0.1); put(); }
      // the footway line nearest (x, y), and a stretch along it at least 16 m long
      const tmp = {};
      let best = null;
      for (let i = 0; i < net.L.length; i++) {
        const l = net.L[i];
        if (l.len < 16) continue;
        for (let s = 8; s <= l.len - 8; s += 1) { net.at(i, s, tmp); const d = Math.hypot(tmp.x - x, tmp.y - y); if (d < 6 && Math.abs(tmp.z - me.z) < 3 && (!best || d < best.d)) best = { d, line: i, s }; }
      }
      if (!best) return { err: 'no footway line there' };
      const { line, s: sm } = best, len = net.L[line].len;
      // nobody else on that stretch: those within 8 m sent elsewhere (respawned out of sight)
      net.at(line, sm, tmp);
      for (let i = 0; i < C.active; i++) { const q = P[i]; if (q.line >= 0 && !q.pz && q.state === 'walk' && Math.hypot(q.x - tmp.x, q.y - tmp.y) < 8) q.line = -1; }
      const free = [];
      for (let i = 0; i < C.active && free.length < 12; i++) { const q = P[i]; if (q.state === 'walk' && !q.pz && q.lead < 0 && !q.mates && !q.seat && Math.hypot(q.x - tmp.x, q.y - tmp.y) > 60) free.push(q); }
      if (free.length < sizes[0] + sizes[1]) return { err: 'too few free walkers' };
      const W = [];
      sizes.forEach((n, side) => {
        const dir = side === 0 ? 1 : -1, s0 = Math.max(1, Math.min(len - 1, sm - dir * 4));
        const L = free.shift(), M = [];
        const set = (q, k) => {
          q.state = 'walk'; q.mode = 'ground'; q.line = line; q.s = Math.max(0.5, Math.min(len - 0.5, s0 - dir * (k > 2 ? 0.9 : 0))); q.dir = dir; q.lat = null;
          q.side = 0.9 - (k % 3) * 0.72; q.pause = 0; q.stop = null; q.stopFace = null; q.kerbNext = null; q.kerbBack = false; q.detourT = 0; q.still = q.slow = q.wait = q.stuckT = 0;
          q.squeeze = 0; q.dodge = 0; q.fx = q.gx = q.av = null; q.rx = null; q.v = q.speed; q.browse = 999; q.rest = 999; q.give = false; q.pBack = 0;
          W.push({ q, dir, s0, side, held: 0, mark: null, through: false, turned: false, turns: 0, was: dir });
        };
        set(L, 0);
        for (let k = 1; k < n; k++) { const o = free.shift(); set(o, k); o.lead = L.id; o.gk = k; M.push(o.id); }
        if (M.length) { L.mates = M; L.gk = 0; L.went = null; L.speed0 = L.speed0 ?? L.speed; L.speed = Math.max(0.95, L.speed0 * (1 - 0.05 * M.length)); for (const j of M) { P[j].speed0 = P[j].speed0 ?? P[j].speed; P[j].speed = L.speed; } }
      });
      for (let t = 0; t < secs; t += 1 / 30) {
        g.advance(1 / 30); put();
        for (const w of W) {
          const q = w.q;
          if (q.line !== line && q.line >= 0) { w.through = w.through || !w.turns; continue; } // (on along the next line: through)
          if (q.line < 0 || q.state !== 'walk') continue;
          if (q.dir !== w.was) { if (!w.through) w.turns++; w.was = q.dir; } // (turned back before getting past: a turn at a line's end on the way on is a route)
          if ((q.s - sm) * w.dir > 6) w.through = true;
          if (!w.mark || Math.hypot(q.x - w.mark.x, q.y - w.mark.y) > 0.5) w.mark = { x: q.x, y: q.y, t };
          else w.held = Math.max(w.held, t - w.mark.t);
        }
      }
      return { line, s: sm, fw: net.L[line].c, W: W.map(w => ({ side: w.side, held: +w.held.toFixed(1), through: w.through, turns: w.turns })) };
    }, [x, y, sizes, secs]);
    if (r.err) { console.log(`[${name}] ${r.err}`); continue; }
    const held = Math.max(...r.W.map(w => w.held)), through = r.W.filter(w => w.through).length, turned = r.W.filter(w => w.turns).length;
    const bad = held > HELD || through < r.W.length || turned > 1;
    if (bad) fail++;
    console.log(`[${name}] line ${r.line} (${r.fw}) at s ${r.s}: ${through}/${r.W.length} through, ${turned} turned back, longest held ${held} s  ${bad ? 'HELD' : 'ok'}  ${JSON.stringify(r.W)}`);
  }
  await b.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
