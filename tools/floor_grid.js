// A level whose floor is its own (game.json hero[].floor: SKY's street lift hall) is walked on at the height its
// floor grid says (game.js heroCover h.height, nav.js lift): a grid of cells, each the drawn floor's height at its
// middle. Where an edge between two heights (a plank's step, a kerb, a mat) crosses a cell, the whole cell takes the
// height at its middle, and whoever stands on the low side of it stands in the air, or on the high side in it: the
// guide's frame 4 lead failed on his feet 7 to 9 cm over the forecourt by SKY's hall, by where the crowd put his way.
// This opens the map without its story, takes the player to each such level, and over its circle every STEP m (0.05)
// compares the grid's height with a ray down onto the level's own floor meshes: the share of points more than 6 cm out
// (the guide check's FLOAT_M), the worst, and where. Fails when any point is more than 6 cm out.
//   xvfb-run -a node tools/floor_grid.js
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
(async () => {
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  await p.addInitScript(() => { try { localStorage.setItem('bh-quality', 'high'); } catch (e) { /* storage blocked */ } });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 900000 });
  await startPlay(p, { timeout: 900000, asIs: true });
  const levels = await p.evaluate(() => (window.__game.G.hero || []).filter(h => h.floor).map(h => h.id));
  let bad = 0;
  for (const id of levels) {
    await p.evaluate(id => { const g = window.__game, h = g.G.hero.find(q => q.id === id); g.spawn([h.at[0], h.at[1]]); }, id);
    const ready = await p.waitForFunction(id => { const g = window.__game, h = g.G.hero.find(q => q.id === id), L = g.hero().state().find(q => q.id === id); return L && L.state === 'ready' && h.height; }, id, { timeout: 600000, polling: 1000 }).then(() => true, () => false);
    if (!ready) { console.log(`FAIL ${id}: not ready in ten minutes`); bad++; continue; }
    const r = await p.evaluate(([id, STEP, OUT]) => {
      const g = window.__game, T = window.THREE, h = g.G.hero.find(q => q.id === id), H = g.hero(), L = H.levels.find(q => q.h.id === id), floors = [];
      L.root.updateMatrixWorld(true);
      L.root.traverse(o => { if (o.isMesh && /(^|_)(ground|room_floor)_/.test(o.name)) floors.push(o); });
      const ray = new T.Raycaster(), down = new T.Vector3(0, -1, 0), o = new T.Vector3();
      let n = 0, out = 0, worst = 0, at = null; const where = {};
      for (let x = h.at[0] - h.r; x <= h.at[0] + h.r; x += STEP) for (let y = h.at[1] - h.r; y <= h.at[1] + h.r; y += STEP) {
        if (Math.hypot(x - h.at[0], y - h.at[1]) > h.r - 0.5) continue;
        // (the least of the point and four a centimetre round it: on an edge between two heights, a plank's own, both are
        // the floor and either may be read)
        let d = Infinity;
        for (const [ex, ey] of [[0, 0], [0.01, 0], [-0.01, 0], [0, 0.01], [0, -0.01]]) {
          const z = h.height(x + ex, y + ey); if (z == null) continue;
          o.set(x + ex, z + 1, -(y + ey)); ray.set(o, down); ray.far = 3;
          const hit = ray.intersectObjects(floors, false)[0]; if (!hit) continue;
          if (Math.abs(z - hit.point.y) < Math.abs(d)) d = z - hit.point.y;
        }
        if (d === Infinity) continue;
        n++;
        if (Math.abs(d) > OUT) { out++; const k = `${Math.round(x)},${Math.round(y)}`; where[k] = (where[k] || 0) + 1; }
        if (Math.abs(d) > Math.abs(worst)) { worst = d; at = [+x.toFixed(2), +y.toFixed(2)]; }
      }
      // (at the worst point: every floor surface over it, either face, with its mesh and which way it faces)
      let there = [];
      if (at) { o.set(at[0], 40, -at[1]); ray.set(o, down); ray.far = 80; const ds = new Map(); for (const m of floors) { ds.set(m, m.material.side); m.material.side = T.DoubleSide; } there = ray.intersectObjects(floors, false).map(q => `${q.object.name} ${q.point.y.toFixed(2)} ${q.face && q.face.normal ? (q.face.normal.clone().transformDirection(q.object.matrixWorld).y > 0 ? 'up' : 'down') : '?'}`); for (const [m, sd] of ds) m.material.side = sd; there.unshift(`height ${h.height(at[0], at[1]).toFixed(2)}`); }
      return { there, n, out, worst: +worst.toFixed(3), at, where: Object.entries(where).sort((a, b) => b[1] - a[1]).slice(0, 6) };
    }, [id, +(process.env.STEP || 0.05), 0.06]);
    const fail = r.out > 0;
    if (fail) bad++;
    console.log(`${fail ? 'FAIL' : 'ok  '} ${id}: ${r.n} points; ${r.out} (${(100 * r.out / Math.max(1, r.n)).toFixed(2)}%) more than 6 cm off the floor drawn, the worst ${(r.worst * 100).toFixed(1)} cm at ${r.at}; there: ${r.there.join(' | ')}${r.where.length ? `; most at ${r.where.map(([k, v]) => `${k} (${v})`).join(', ')}` : ''}`);
  }
  await b.close();
  process.exit(bad ? 1 : 0);
})();
