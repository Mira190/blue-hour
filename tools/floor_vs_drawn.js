// The walking grid's floor against what is drawn, on a fine grid round a place (issue 257: the guide's feet 7.5 cm over
// the drawn ground at 521.15, -1082.49 on his way to SKY's lift, guide4): for each point, nav.floorAt (what he and you
// stand on: game.js guideGround) and a ray straight down onto the meshes drawn there (the hero levels' and the city's),
// and the difference; the points over LIMIT (0.06 m, tools/guide_way.js FLOAT_M) printed, and the largest.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/floor_vs_drawn.js x,y [half=3] [step=0.1]    (LIMIT=m; LEVELS=miyamasu,skylobby: waited for, shown)
const { chromium } = require('playwright');
const [,, at = '521.15,-1082.49', half = '3', step = '0.1'] = process.argv;
(async () => {
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox', '--disable-gpu-watchdog'] });
  const p = await b.newPage({ viewport: { width: 800, height: 500 } });
  p.on('pageerror', e => console.log('pageerror:', String(e).slice(0, 200)));
  await p.addInitScript(() => { try { localStorage.setItem('bh-onboard', '1'); } catch (e) { /* storage blocked */ } });
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1&overture=0#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.nav && window.__game.hero', null, { timeout: 600000 });
  const [x0, y0] = at.split(',').map(Number);
  const r = await p.evaluate(async ([x0, y0, H, S, LIM, WANT]) => {
    const g = window.__game, nav = g.nav, T = window.THREE, pl = g.player;
    pl.x = x0; pl.y = y0; const f0 = nav.floorAt(x0, y0, nav.terrain(x0, y0) + 2); pl.z = f0 ? f0.z : nav.terrain(x0, y0);
    // (the levels round it in and shown)
    const want = WANT ? WANT.split(',') : null;
    for (let i = 0; i < 1500; i++) { g.frame(0.05); const st = g.hero().state(); if (st.every(q => q.state !== 'loading') && (want ? want.every(id => st.some(q => q.id === id && q.shown)) : st.some(q => q.shown))) break; await new Promise(res => setTimeout(res, 200)); }
    for (let i = 0; i < 40; i++) { g.frame(0.05); await new Promise(res => setTimeout(res, 50)); }
    const ray = new T.Raycaster(), down = new T.Vector3(0, -1, 0), o = new T.Vector3(), out = [];
    const meshes = []; g.world.traverse(m => { if (m.isMesh && m.visible && !m.isSkinnedMesh && !m.isInstancedMesh) { let v = true; for (let q = m; q; q = q.parent) if (!q.visible) { v = false; break; } if (v && !(m.material && (m.material.transparent || m.material.depthWrite === false))) meshes.push(m); } });
    let worst = null;
    for (let dx = -H; dx <= H + 1e-6; dx += S) for (let dy = -H; dy <= H + 1e-6; dy += S) {
      const x = x0 + dx, y = y0 + dy, f = nav.floorAt(x, y, (f0 ? f0.z : 16) + 1); if (!f) continue;
      o.set(x, f.z + 0.9, -y); ray.set(o, down); ray.far = 3;
      const hit = ray.intersectObjects(meshes, false).find(h => h.face && h.face.normal && Math.abs(h.face.normal.y) > 0.3);
      if (!hit) continue;
      const gap = f.z - hit.point.y;
      if (!worst || gap > worst.gap) worst = { x: +x.toFixed(2), y: +y.toFixed(2), floor: +f.z.toFixed(3), kind: f.kind, drawn: +hit.point.y.toFixed(3), gap: +gap.toFixed(3), mesh: hit.object.name };
      if (gap > LIM) out.push([+x.toFixed(2), +y.toFixed(2), +gap.toFixed(3), f.kind, hit.object.name]);
    }
    return { worst, over: out.length, some: out.slice(0, 25), levels: g.hero().state().filter(q => q.shown).map(q => q.id) };
  }, [x0, y0, +half, +step, +(process.env.LIMIT || 0.06), process.env.LEVELS || '']);
  console.log(JSON.stringify(r.worst), `${r.over} points over the limit; levels shown ${r.levels}`);
  for (const q of r.some) console.log('  ', JSON.stringify(q));
  await b.close();
})();
