// Where can your car get to, and is any of it somewhere a car should not be? Plays a city's game (web/ served on PORT
// or 8800, under xvfb-run) and floods out from where your car is parked over a 1 m grid, by the rules the driven car
// moves by (cars.js drive: the floor no more than a kerb over its wheels, no drop of over 3.5 m, its body's circle clear
// of the walls from the knee to 1.6 m), out to RADIUS (default 600 m) from the start. Reports
//   inside    the buildings a car's centre gets into (the middle of the car in a building's solid between its knee
//             and its roof, by the collision scene itself): a wall that hangs over the ground and lets the body
//             under, a gap between two solids. Under a raised part with room for it (a passage, an arcade) it is not
//   lamps     the lamp posts that are solid to it: those that stand in a carriageway (within a road's drawn width of
//             its line), and those whose foot is more than half a metre off the ground drawn there (a pole under the
//             ground, its head at the road's surface: met, and not seen)
// and writes a plan of it (PNG: reach grey, inside red, lamps yellow) when an out directory is given.
//   xvfb-run -a node tools/car_reach.js shibuya [radius=600] [outDir]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { startPlay } = require('./start_play');
const [,, city = 'shibuya', RADIUS = '600', OUT] = process.argv;
(async () => {
  const b = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage({ viewport: { width: 640, height: 400 } });
  p.on('pageerror', e => console.log('pageerror', String(e).slice(0, 300)));
  await p.addInitScript(() => { try { localStorage.setItem('oe3d-quality', 'low'); localStorage.setItem('oe3d-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-${city}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game', null, { timeout: 600000 });
  await startPlay(p);
  await p.evaluate(() => { const g = window.__game; if (g.cine && g.cine.active) g.cine.skip(); g.spawn(); g.advance(0.5); });
  await p.waitForFunction(() => window.__game.myCar && window.__game.myCar(), null, { timeout: 180000 }); // (its model loads after the start)
  await p.evaluate(() => window.__game.hold(true));
  const r = await p.evaluate(R => {
    const g = window.__game, nav = g.nav, G = g.G, car = g.myCar(), C = car.C, st = car.D.st, [sx, sy] = G.start.at;
    const STEPC = window.OECars.CAR_STEP, rad = C.hw + 0.04, N = 2 * R + 1, I = (i, j) => j * N + i;
    nav.prefetch(sx, sy, R + 20, Infinity);
    if (nav.layAll) nav.layAll();
    const floor = (x, y, z) => { const f = nav.floorAt(x, y, z - (nav.STEP - STEPC)); return f ? f : null; };
    const fits = (x, y, z) => { const q = nav.push(x, y, z, rad, 1.6); return Math.hypot(q.x - x, q.y - y) < 0.05; };
    const Z = new Float32Array(N * N).fill(NaN), kind = new Uint8Array(N * N);
    const i0 = Math.round(st.x - sx) + R, j0 = Math.round(st.y - sy) + R, q = [I(i0, j0)];
    Z[q[0]] = st.z;
    // the buildings that stand on the ground, by the game's own surface model (a cell's building, and its top over the car)
    // (in a wall: the middle of the car inside a building's solid between its knee and its roof, by the collision scene itself)
    const standing = (x, y, z) => (nav.col.overlap(x, y, 0.05, z + 0.4, z + 1.6, i => nav.col.tagOf(i) !== nav.BUILDING) ? Math.max(0, nav.buildingId(x, y)) : -1);
    const inside = new Map();
    let reach = 0;
    for (let h = 0; h < q.length; h++) {
      const k = q[h], i = k % N, j = (k - i) / N, x = sx + i - R, y = sy + j - R, z = Z[k];
      reach++;
      const id = standing(x, y, z);
      if (id >= 0) { kind[k] = 2; const e = inside.get(id) || { id, n: 0, at: [x, y, +z.toFixed(1)] }; e.n++; inside.set(id, e); } else kind[k] = 1;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const a = i + di, c = j + dj;
        if (a < 0 || c < 0 || a >= N || c >= N || Math.hypot(a - R, c - R) > R) continue;
        const kk = I(a, c);
        if (!Number.isNaN(Z[kk])) continue;
        const nx = sx + a - R, ny = sy + c - R, f = floor(nx, ny, z);
        if (!f || f.z < z - 3.5 || nav.isWater(nx, ny) || !fits(nx, ny, f.z)) continue;
        Z[kk] = f.z; q.push(kk);
      }
    }
    const ins = [...inside.values()].sort((a, c) => c.n - a.n);
    // lamps: every post of kind lamp within the radius
    const lamps = [], seenL = new Set();
    const roads = g.roadNet.L, roadAt = (x, y) => {
      let best = null;
      for (const l of roads) {
        const P = l.pts, hw = (l.cw || l.w || 6) / 2;
        for (let k = 0; k + 5 < P.length; k += 3) {
          const ax = P[k], ay = P[k + 1], bx = P[k + 3], by = P[k + 4];
          if (Math.min(ax, bx) - 12 > x || Math.max(ax, bx) + 12 < x || Math.min(ay, by) - 12 > y || Math.max(ay, by) + 12 < y) continue;
          const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1))), d = Math.hypot(x - ax - dx * t, y - ay - dy * t);
          if (d < hw && (!best || d - hw < best.in)) best = { in: +(d - hw).toFixed(2), z: P[k + 2] };
        }
      }
      return best;
    };
    let nl = 0;
    nav.posts.near(sx, sy, R, q2 => {
      if (q2.kind !== 'lamp') return;
      nl++;
      const t = nav.terrain(q2.x, q2.y), f = nav.floorAt(q2.x, q2.y, q2.z + 1), off = +(q2.z - (f ? f.z : t)).toFixed(2), rd = roadAt(q2.x, q2.y);
      const k = I(Math.round(q2.x - sx) + R, Math.round(q2.y - sy) + R);
      if (Math.abs(off) > 4) return; // (on a viaduct's deck, which is laid as the player nears it)
      if ((rd && Math.abs(rd.z - q2.z) < 2 && rd.in < -0.6) || Math.abs(off) > 0.5) lamps.push({ at: [+q2.x.toFixed(1), +q2.y.toFixed(1), +q2.z.toFixed(1)], off, road: rd ? rd.in : null, reached: kind[k] > 0 });
    });
    return { reach, N, R, start: [sx, sy], car: [st.x, st.y, st.z], rad, inside: ins, lampsSeen: nl, lamps, roadKeys: Object.keys(roads[0] || {}).join(','), kind: Array.from(kind) };
  }, +RADIUS);
  console.log(`${city}: your car reaches ${r.reach} m2 within ${r.R} m of the start (body ${r.rad.toFixed(2)} m)`);
  const big = r.inside.filter(e => e.n >= 3);
  console.log(`inside a building: ${r.inside.reduce((a, e) => a + e.n, 0)} m2 in ${r.inside.length} buildings (${big.length} of 3 m2 or more)`);
  for (const e of big.slice(0, 25)) console.log(`  building ${e.id}: ${e.n} m2, first at ${e.at.join(', ')}, ${Math.round(Math.hypot(e.at[0] - r.start[0], e.at[1] - r.start[1]))} m from the start`);
  console.log(`lamp posts: ${r.lampsSeen} solid within ${r.R} m; ${r.lamps.filter(l => l.road != null && l.road < -0.6).length} in a carriageway, ${r.lamps.filter(l => Math.abs(l.off) > 0.5).length} with the foot over half a metre off the ground`);
  for (const l of r.lamps.slice(0, 25)) console.log(`  lamp at ${l.at.join(', ')}: foot ${l.off} m off the ground${l.road != null ? `, ${-l.road} m inside a carriageway's edge` : ''}${l.reached ? ', where your car goes' : ''}`);
  if (OUT) {
    fs.mkdirSync(OUT, { recursive: true });
    await p.evaluate(() => { const g = window.__game; if (g.stop) g.stop(); }); // (the page is given over to the plan's canvas)
    const { N } = r, lampAt = new Set(r.lamps.map(l => (Math.round(l.at[1] - r.start[1]) + r.R) * N + Math.round(l.at[0] - r.start[0]) + r.R));
    await p.setContent(`<canvas id=c width=${N} height=${N}></canvas>`);
    const url = await p.evaluate(({ kind, N, lamps }) => {
      const c = document.getElementById('c'), x = c.getContext('2d'), im = x.createImageData(N, N), L = new Set(lamps);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const k = j * N + i, o = ((N - 1 - j) * N + i) * 4, v = kind[k];
        const col = v === 2 ? [230, 40, 40] : v === 1 ? [150, 150, 150] : [20, 20, 24];
        im.data[o] = col[0]; im.data[o + 1] = col[1]; im.data[o + 2] = col[2]; im.data[o + 3] = 255;
      }
      x.putImageData(im, 0, 0);
      x.fillStyle = '#ffd400';
      for (const k of L) { const i = k % N, j = (k - i) / N; x.fillRect(i - 2, N - 1 - j - 2, 5, 5); }
      return c.toDataURL('image/png');
    }, { kind: r.kind, N, lamps: [...lampAt] });
    fs.writeFileSync(path.join(OUT, `car_reach_${city}.png`), Buffer.from(url.split(',')[1], 'base64'));
    delete r.kind;
    fs.writeFileSync(path.join(OUT, `car_reach_${city}.json`), JSON.stringify(r, null, 1));
  }
  await b.close();
})();
