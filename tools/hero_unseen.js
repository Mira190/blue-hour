// Whether a hero level can be seen from a set of eye points (issue 105): from each, six square views (a cube round the
// eye) are drawn with every mesh of the scene black and the level's meshes white, against the depth of everything as the
// page draws it (the city's cells, the landmarks, the stations, the other levels), and the white pixels counted. Nothing
// of the level in any of them: it cannot be seen from there, however the camera is turned. The crowd, the cars and the
// trees are left out (they hide nothing for certain), so the answer leans to "seen".
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/hero_unseen.js <level> x,y[;x,y...] [dz,dz...]
//   e.g. node tools/hero_unseen.js scramble 521.9,-1074.1;512,-1052 1.6,4,8
// GRID=x0,y0,x1,y1,step: eye points on a grid instead (each at the ground or the deck there); FLOOR=z: every eye
// that far over z instead of the ground. TIER=low (default: the phone's level as it loads there). Exits 1 if any eye sees
// more than MAX (default 0) pixels of the level; SIZE=n the cube's side in pixels (256).
const { chromium } = require('playwright');
const { startPlay } = require('./start_play');
const [,, level = 'scramble', ptsArg = '521.9,-1074.1', dzArg = '1.6,4'] = process.argv;
const SIZE = +(process.env.SIZE || 256), MAX = +(process.env.MAX || 0);
(async () => {
  let pts = ptsArg.split(';').map(q => q.split(',').map(Number));
  if (process.env.GRID) {
    const [x0, y0, x1, y1, st] = process.env.GRID.split(',').map(Number);
    pts = [];
    for (let x = x0; x <= x1 + 1e-6; x += st) for (let y = y0; y <= y1 + 1e-6; y += st) pts.push([x, y]);
  }
  // CIRCLE=x,y,r: only the points within r of (x, y)
  if (process.env.CIRCLE) { const [cx, cy, cr] = process.env.CIRCLE.split(',').map(Number); pts = pts.filter(([x, y]) => Math.hypot(x - cx, y - cy) <= cr + 1e-6); }
  const union = new Map(); // (every mesh seen from any eye: its square, `c<i>_<j>`, with the pixels)
  const dzs = dzArg.split(',').map(Number);
  const b = await chromium.launch(process.env.DISPLAY
    ? { headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] }
    : { args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); localStorage.setItem('bh-onboard', '1'); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'low');
  p.on('pageerror', e => console.log(`pageerror: ${String(e).slice(0, 300)}`));
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 600000 });
  await startPlay(p);
  await p.waitForTimeout(1500);
  await p.evaluate(() => { const g = window.__game; if (g.cine.active) g.cine.skip(); if (g.settleArrival) try { g.settleArrival(); } catch (e) { /* none */ } });
  let worst = 0;
  const rows = [];
  for (const [x, y] of pts) {
    // the player put there, and the page run until no level is loading (the level asked for loaded with the rest)
    await p.evaluate(async ([x, y]) => {
      const g = window.__game;
      g.spawn([x, y]);
      for (let i = 0; i < 10; i++) g.advance(1 / 30);
      for (let i = 0; i < 1200; i++) { await new Promise(r => requestAnimationFrame(r)); if (i > 20 && !g.hero().state().some(h => h.state === 'loading')) break; }
    }, [x, y]);
    const r = await p.evaluate(({ level, x, y, dzs, SIZE, floor }) => {
      const g = window.__game, T = window.THREE, R = g.renderer, H = g.hero();
      const L = H.levels.find(q => q.h.id === level);
      if (!L || !L.root) return { err: `${level}: ${L ? L.state : 'no such level'}` };
      const scene = g.Wd.world.parent || g.Wd.world;
      // (each of the level's meshes in a colour of its own, its index + 1 in red and green, so the pixels name who is seen)
      const black = new T.MeshBasicMaterial({ color: 0x000000 }), ids = [], mine = new Map();
      L.root.traverse(o => { if (o.isMesh) { const i = ids.length + 1; ids.push(o); mine.set(o, new T.MeshBasicMaterial({ color: new T.Color().setRGB((i & 255) / 255, (i >> 8) / 255, 1, T.LinearSRGBColorSpace) })); } });
      const saved = [], hidden = [];
      scene.traverse(o => {
        if (o.isMesh && !o.isSkinnedMesh && !o.isInstancedMesh) { saved.push([o, o.material]); o.material = mine.get(o) || black; } else if (o.isSkinnedMesh || o.isInstancedMesh || o.isPoints || o.isLine || o.isSprite) { if (o.visible) { hidden.push(o); o.visible = false; } }
      });
      const wasVis = L.root.visible; L.root.visible = true;
      const bg = scene.background, fog = scene.fog; scene.background = null; scene.fog = null;
      const rt = new T.WebGLRenderTarget(SIZE, SIZE), buf = new Uint8Array(SIZE * SIZE * 4);
      const cam = new T.PerspectiveCamera(90, 1, 0.1, 6000);
      const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
      const ups = [[0, 1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [0, 1, 0], [0, 1, 0]];
      const ground = (() => { const z = Math.max(0, g.nav.terrain(x, y)), f = g.nav.floorAt(x, y, z + 0.5); return f ? f.z : z; })();
      const out = [];
      const was = { tgt: R.getRenderTarget(), auto: R.autoClear, tone: R.toneMapping, sm: R.shadowMap.autoUpdate };
      R.shadowMap.autoUpdate = false; R.toneMapping = T.NoToneMapping; R.autoClear = true;
      if (window.OEVis) OEVis.hold('hero_unseen', true);
      for (const dz of dzs) {
        const z = (floor != null ? floor : ground) + dz;
        cam.position.set(x, z, -y);
        let n = 0;
        const per = [], who = new Map();
        dirs.forEach((d, i) => {
          cam.up.set(...ups[i]); cam.lookAt(x + d[0], z + d[1], -y + d[2]); cam.updateMatrixWorld();
          R.setRenderTarget(rt); R.setClearColor(0x000000, 1); R.clear(); R.render(scene, cam);
          R.readRenderTargetPixels(rt, 0, 0, SIZE, SIZE, buf);
          let k = 0; for (let j = 0; j < buf.length; j += 4) if (buf[j + 2] > 128) { k++; const id = buf[j] + (buf[j + 1] << 8); who.set(id, (who.get(id) || 0) + 1); }
          per.push(k); n += k;
        });
        out.push({ dz, z: +z.toFixed(1), n, per, who: [...who].sort((a, b) => b[1] - a[1]).map(([id, k]) => { const o = ids[id - 1]; return [k, o ? o.name || o.parent.name : '?' + id]; }) });
      }
      if (window.OEVis) OEVis.hold('hero_unseen', false);
      R.setRenderTarget(was.tgt); R.autoClear = was.auto; R.toneMapping = was.tone; R.shadowMap.autoUpdate = was.sm;
      for (const [o, m] of saved) o.material = m;
      for (const o of hidden) o.visible = true;
      L.root.visible = wasVis; scene.background = bg; scene.fog = fog;
      rt.dispose(); black.dispose(); for (const m of mine.values()) m.dispose();
      return { ground: +ground.toFixed(1), out, levels: H.state().map(h => `${h.id} ${h.state}`).join(', ') };
    }, { level, x, y, dzs, SIZE, floor: process.env.FLOOR != null ? +process.env.FLOOR : null });
    if (r.err) { console.log(`${x},${y}: ${r.err}`); worst = Infinity; continue; }
    for (const o of r.out) {
      worst = Math.max(worst, o.n);
      rows.push(`${o.n > MAX ? 'SEEN' : 'none'} ${x.toFixed(1)},${y.toFixed(1)} z ${o.z} (ground ${r.ground} + ${o.dz}): ${o.n} px of ${level} [${o.per.join(' ')}]`);
      console.log(rows[rows.length - 1]);
      if (o.n && process.env.WHO) console.log(`     ${o.who.slice(0, 6).map(q => q.join(' ')).join(', ')}`);
      for (const [k, name] of o.who) { const sq = (/_(c-?\d+_-?\d+)$/.exec(name) || [])[1] || name; union.set(sq, (union.get(sq) || 0) + k); }
    }
  }
  // the squares seen from any of them (blender/hero_kit.py names a level's meshes <material>_c<i>_<j> by square), most first
  console.log(`squares seen (${union.size}): ${JSON.stringify([...union].sort((a, b) => b[1] - a[1]).map(q => q[0]))}`);
  console.log(`  with pixels: ${[...union].sort((a, b) => b[1] - a[1]).map(q => q.join(' ')).join(', ')}`);
  console.log(`${worst > MAX ? 'SEEN' : 'unseen'}: ${level} from ${pts.length} points x ${dzs.length} heights, at most ${worst} of ${6 * SIZE * SIZE} px`);
  await b.close();
  process.exit(worst > MAX ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
