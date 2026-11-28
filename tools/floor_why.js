// Why the walking floor stands where it does, at a few points (issue 258): for each, nav.floorAt and its parts (the
// terrain as nav reads it, each hero level's lift, cover and floor, the city's paving and the slab under it) beside
// every surface a ray straight down meets in what is drawn (instanced meshes too), named.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/floor_why.js x,y [x,y ...]    (LEVELS=scramble,miyamasu,skylobby: waited for, shown)
const { chromium } = require('playwright');
const pts = process.argv.slice(2).map(s => s.split(',').map(Number));
(async () => {
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox', '--disable-gpu-watchdog'] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  p.on('pageerror', e => console.log('pageerror:', String(e).slice(0, 200)));
  await p.addInitScript(() => { try { localStorage.setItem('bh-onboard', '1'); } catch (e) { /* storage blocked */ } });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1&overture=0#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.nav && window.__game.hero', null, { timeout: 600000 });
  const r = await p.evaluate(async ([pts, WANT]) => {
    const g = window.__game, nav = g.nav, T = window.THREE, pl = g.player;
    const [x0, y0] = pts[0];
    pl.x = x0; pl.y = y0; const f0 = nav.floorAt(x0, y0, nav.terrain(x0, y0) + 2); pl.z = f0 ? f0.z : nav.terrain(x0, y0);
    const want = WANT ? WANT.split(',') : null;
    for (let i = 0; i < 1500; i++) { g.frame(0.05); const st = g.hero().state(); if (st.every(q => q.state !== 'loading') && (want ? want.every(id => st.some(q => q.id === id && q.shown)) : st.some(q => q.shown))) break; await new Promise(res => setTimeout(res, 200)); }
    for (let i = 0; i < 40; i++) { g.frame(0.05); await new Promise(res => setTimeout(res, 50)); }
    const ray = new T.Raycaster(), down = new T.Vector3(0, -1, 0), o = new T.Vector3();
    ray.layers.enableAll();
    const meshesNow = () => { const meshes = []; g.world.traverse(m => { if (m.isMesh && !m.isSkinnedMesh) { let v = true; for (let q = m; q; q = q.parent) if (!q.visible) { v = false; break; } if (v) meshes.push(m); } }); return meshes; };
    const out = [];
    for (const [x, y] of pts) {
      // (stood there until every level whose circle holds the point is shown)
      pl.x = x; pl.y = y; pl.z = nav.terrain(x, y);
      const mine = (g.G.hero || []).filter(h => h.at && h.r && h.glb && Math.hypot(x - h.at[0], y - h.at[1]) < h.r);
      for (let i = 0; i < 600 && !mine.every(h => h.shown); i++) { g.frame(0.05); await new Promise(res => setTimeout(res, 100)); }
      const t = nav.terrain(x, y), f = nav.floorAt(x, y, t + 1);
      o.set(x, t + 3, -y); ray.set(o, down); ray.far = 6;
      const hits = ray.intersectObjects(meshesNow(), false).slice(0, 8).map(h => [+h.point.y.toFixed(3), h.object.name || '?', [].concat(h.object.material).map(m => m && m.name).join('/'), h.object.isInstancedMesh ? 'inst' : '']);
      const lv = (g.G.hero || []).map(h => ({ id: h.id, shown: !!h.shown, d: +(h.r - Math.hypot(x - h.at[0], y - h.at[1])).toFixed(1), lift: h.lift, cover: h.cover ? !!h.cover(x, y) : null, own: h.height ? h.height(x, y) : null })).filter(q => q.d > -3);
      out.push({ x, y, floor: f && +f.z.toFixed(3), kind: f && f.kind, terrain: +t.toFixed(3), lift: +nav.lift(x, y).toFixed(3), pave: nav.paveAt(x, y), under: nav.under(x, y), lv, hits });
    }
    return out;
  }, [pts, process.env.LEVELS || '']);
  for (const q of r) console.log(JSON.stringify(q));
  await b.close();
})();
