// Where does your car meet an edge or a ledge on a street, with nothing drawn there to stop it? Plays the map (web/
// served on PORT or 8800, under xvfb-run), parks your car, and drives the rules it moves by (cars.js drive: `bodyStands`,
// each wheel's floor reached from the middle with no rise of more than a kerb at once and no drop of over 3.5 m; `ledgesUnder`, a ledge higher than a kerb under
// its footprint) along every road line of the traffic's network, its centre and a lane either side, in steps of 0.25 m
// from the height it was at. Every place one of them fails is listed with what nav.floorAt found there (the floor's kind
// and height, the terrain, the paving), and the run fails (exit 1) where it fails on a surface with no water drawn and no
// wall within a car's width and where the car itself, driven through it, stops: "Too steep a drop." or a bump on dry,
// open road.
//   xvfb-run -a node tools/car_edges.js [radius=900] [outDir]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { startPlay } = require('./start_play');
const [,, RADIUS = '900', OUT] = process.argv;
(async () => {
  const b = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage({ viewport: { width: 640, height: 400 } });
  p.on('pageerror', e => console.log('pageerror', String(e).slice(0, 300)));
  await p.addInitScript(() => { try { localStorage.setItem('bh-quality', 'low'); localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game', null, { timeout: 600000 });
  await startPlay(p);
  await p.evaluate(() => { const g = window.__game; if (g.cine && g.cine.active) g.cine.skip(); g.spawn(); g.advance(0.5); });
  await p.waitForFunction(() => window.__game.myCar && window.__game.myCar(), null, { timeout: 180000 });
  await p.evaluate(() => window.__game.hold(true));
  const r = await p.evaluate(R => {
    const g = window.__game, nav = g.nav, G = g.G, car = g.myCar(), C = car.C, [sx, sy] = G.start.at;
    const STEPC = window.OECars.CAR_STEP, OC = window.OECars;
    nav.prefetch(sx, sy, R + 20, Infinity);
    if (nav.layAll) nav.layAll();
    const floorF = (x, y, z) => nav.floorAt(x, y, z - (nav.STEP - STEPC));
    // (the car's own rules: cars.js bodyStands and ledgesUnder, as drive moves it)
    const ledges = (x, y, z, h) => OC.ledgesUnder(nav, { x, y, z, h }, C.half, C.hw);
    const offs = [C.half - C.hw, 0, -(C.half - C.hw)];
    // a wall within a car's width: the body's circle pushed out by nav (a building, a landmark), so a stop there is seen
    const walled = (x, y, z) => { const q = nav.push(x, y, z, C.hw + 0.04, 1.6); return Math.hypot(q.x - x, q.y - y) > 0.05; };
    const why = (x, y, z) => {
      const f = nav.floorAt(x, y, z + 6), t = nav.terrain(x, y), f0 = floorF(x, y, z);
      return { floor: f ? [f.kind, +f.z.toFixed(2)] : null, carFloor: f0 ? [f0.kind, +f0.z.toFixed(2)] : null, terrain: +t.toFixed(2), off: nav.offGround ? nav.offGround(x, y) || '' : '', water: !!nav.isWater(x, y) };
    };
    const found = [], L = g.roadNet.L;
    let driven = 0;
    for (let li = 0; li < L.length; li++) {
      const l = L[li], P = l.pts;
      if (Math.hypot(P[0] - sx, P[1] - sy) > R) continue;
      const hw = (l.cw || l.w || 6) / 2;
      for (const lane of [0, -Math.max(0, hw - C.hw - 0.6), Math.max(0, hw - C.hw - 0.6)]) for (const dir of [1, -1]) {
        if (lane === 0 && dir === -1) continue;
        // the polyline, offset to the lane, walked in 0.25 m steps
        const pts = [];
        for (let k = 0; k + 5 < P.length; k += 3) {
          const ax = P[k], ay = P[k + 1], bx = P[k + 3], by = P[k + 4], d = Math.hypot(bx - ax, by - ay);
          if (d < 1e-3) continue;
          const ex = (bx - ax) / d, ey = (by - ay) / d, nx = ey, ny = -ex, n = Math.ceil(d / 0.25);
          for (let s = 0; s < n; s++) pts.push([ax + ex * d * s / n + nx * lane, ay + ey * d * s / n + ny * lane, Math.atan2(ex, ey)]);
        }
        if (dir < 0) { pts.reverse(); for (const q of pts) q[2] += Math.PI; }
        if (pts.length < 2) continue;
        let f0 = floorF(pts[0][0], pts[0][1], P[2] + 0.5);
        if (!f0) continue;
        let z = f0.z, lastBad = -1e9;
        for (let i = 1; i < pts.length; i++) {
          const [x, y, h] = pts[i], fx = Math.sin(h), fy = Math.cos(h);
          driven += 0.25;
          const edge = OC.bodyStands ? !OC.bodyStands(nav, C, x, y, z, fx, fy) : offs.some(o => { const f = floorF(x + fx * o, y + fy * o, z); return !f || f.z <= z - 3.5; }); // (the rule before bodyStands, to compare)
          const [px, py, ph] = pts[i - 1];
          const bump = !edge && ledges(x, y, z, h) > ledges(px, py, z, ph);
          if (edge || bump) {
            if (i - lastBad > 40) {
              const wall = walled(x, y, z), water = offs.some(o => nav.isWater(x + fx * o * 2, y + fy * o * 2));
              const at = [x + fx * offs[0], y + fy * offs[0]];
              found.push({ line: li, name: l.name || '', c: l.c, lane: +lane.toFixed(1), at: [+x.toFixed(1), +y.toFixed(1), +z.toFixed(2)], h: +h.toFixed(2), kind: edge ? 'edge' : 'ledge', wall, water, why: why(at[0], at[1], z) });
            }
            lastBad = i;
            // carry on from the far side, as a car let through would (a fresh floor from above)
            const f = floorF(x, y, z + 3); if (f) z = f.z;
            continue;
          }
          const f = floorF(x, y, z); if (f) z = f.z;
        }
      }
    }
    // each place found, driven through by the car itself (cars.js drive, the step the game runs): from 8 m before it at 8 m/s
    // along the lane, on the floor there, at full throttle until 3 m past it. Found by the rules and met by the car: a stop
    const D = car.D, st0 = Object.assign({}, D.st);
    for (const e of found) {
      const [x, y] = e.at, fx = Math.sin(e.h), fy = Math.cos(e.h), x0 = x - fx * 8, y0 = y - fy * 8, f = floorF(x0, y0, e.at[2] + 2);
      if (!f) { e.met = 'no floor to start from'; continue; }
      Object.assign(D.st, st0, { x: x0, y: y0, z: f.z, h: e.h, vx: fx * 8, vy: fy * 8, r: 0, steer: 0, vz: 0, air: false, reverse: false, grip: 1 });
      const ev = [];
      let passed = -8;
      for (let t = 0; t < 180 && passed < 3; t++) { D.step(1 / 60, { fwd: 1, turn: 0, handbrake: false }, { boxes: [], people: [], posts: [] }, ev); passed = (D.st.x - x) * fx + (D.st.y - y) * fy; }
      const stop = ev.find(q => q.type === 'edge' || (q.type === 'bump' && q.what === 'wall'));
      e.met = stop ? `${stop.type}${stop.what ? ' ' + stop.what : ''} ${passed.toFixed(1)} m from it` : passed >= 3 ? '' : `stopped ${(-passed).toFixed(1)} m short`;
    }
    Object.assign(D.st, st0);
    return { driven: Math.round(driven), found, start: [sx, sy], lines: L.length };
  }, +RADIUS);
  const dry = r.found.filter(e => !e.water && !e.wall && e.met);
  console.log(`driven ${(r.driven / 1000).toFixed(1)} km of ${r.lines} road lines within ${RADIUS} m: ${r.found.length} places the rules stop a car, ${r.found.filter(e => e.met).length} where the car driven through stops, ${dry.length} of them on dry, open road`);
  for (const e of dry.slice(0, 60)) console.log(`  ${e.kind} at ${e.at.join(', ')} heading ${e.h} (line ${e.line} ${e.name} ${e.c}, lane ${e.lane}): ${e.met}; ${JSON.stringify(e.why)}`);
  if (OUT) { fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'car_edges.json'), JSON.stringify(r, null, 1)); }
  await b.close();
  process.exit(dry.length ? 1 : 0);
})();
