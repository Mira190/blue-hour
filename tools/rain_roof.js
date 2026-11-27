// No rain under a roof (issue 239 item 1): the rain falls where the cover map (web/game/weather.js renderOcc: what
// stands over each point, drawn from above round the camera) says it is open, so whatever is a roof must be drawn into
// that map. This walks the places a player stands under one: each hero level's circle (the Scramble and Hachiko
// Square, the east exit, the Ginza line's deck over Meiji-dori, SKY GATE's lift hall, Scramble Square's foot) on a grid,
// the player put there and the map drawn afresh round them. At each point on the walking floor a ray goes up from a head's
// height through what is drawn (no person, no tree, no rain, no sprite or line, nothing that writes no depth); where it meets a
// surface within 12 m the point is under a roof, and the map must say covered there too. A point the map leaves open
// under a roof fails, with the mesh over it and its material (see-through? its opacity, which side is drawn).
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/rain_roof.js [out_dir] [WxH]     LEVELS=scramble,skylobby  STEP=2 (m between points)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { startPlay } = require('./start_play');
const [,, out = '/tmp/rain-roof', size = '1440x900'] = process.argv;
const [W, H] = size.split('x').map(Number), phone = W < 600;
const city = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'cities', 'shibuya', 'city.json'), 'utf8'));
const LEVELS = (process.env.LEVELS ? process.env.LEVELS.split(',') : null);
const STEP = +(process.env.STEP || 2);
(async () => {
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] });
  const p = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
  const errors = [];
  p.on('pageerror', e => { errors.push(`pageerror: ${String(e).slice(0, 300)}`); console.log(errors[errors.length - 1]); });
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); localStorage.setItem('bh-onboard', JSON.stringify({ done: 1 })); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1&overture=0#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 900000 });
  await startPlay(p, { asIs: true });
  await p.evaluate(() => {
    const g = window.__game;
    g.setClock(g.clock.y, 10, 10, 30); g.weather.set('rain', { now: true });
    for (let i = 0; i < 200 && g.arriving && g.arriving(); i++) { g.settleArrival(); g.advance(0.1); }
    if (g.governor) g.governor.auto = false;
  });
  // the places: each level's circle in squares of 50 m, the player put at each square's middle (on the floor)
  const spots = [];
  for (const h of city.game.hero || []) {
    if (LEVELS && !LEVELS.includes(h.id)) continue;
    const r = h.r, n = Math.max(1, Math.ceil(2 * r / 50));
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = h.at[0] - r + (i + 0.5) * 2 * r / n, y = h.at[1] - r + (j + 0.5) * 2 * r / n;
      if (Math.hypot(x - h.at[0], y - h.at[1]) <= r + 10) spots.push({ level: h.id, at: [x, y], half: Math.min(25, r) });
    }
  }
  const bad = [];
  let tested = 0, roofed = 0;
  for (const s of spots) {
    const ok = await p.evaluate(at => { const g = window.__game, f = g.nav.floorAt(at[0], at[1], g.nav.terrain(at[0], at[1]) + 30); if (!f) return false; g.spawn([at[0], at[1]]); return true; }, s.at);
    if (!ok) continue;
    // (the level near the player drawn, a few frames for its parts, then the cover map drawn afresh round the camera)
    const t0 = Date.now();
    while (Date.now() - t0 < 600000 && await p.evaluate(() => { const h = window.__game.hero && window.__game.hero(); return !!h && h.state().some(q => q.state === 'loading'); })) await p.waitForTimeout(1000);
    await p.evaluate(() => { const g = window.__game; for (let i = 0; i < 8; i++) g.frame(0.05); });
    await p.waitForTimeout(1500);
    const res = await p.evaluate(({ at, half, STEP }) => {
      const g = window.__game, T = window.THREE, Wt = g.weather, R = g.renderer, world = g.world;
      // (twice: a still map's job of the place before, which the jump here left half drawn, is finished by the first; the
      // second draws this place's)
      Wt.cover.draw(performance.now() / 1000, true); Wt.cover.draw(performance.now() / 1000 + 50, true);
      const occ = Wt.occ, U = Wt.U, box = U.uOeOccBox.value, base = U.uOeOccBase.value, n = occ.width;
      const buf = new Uint16Array(n * n * 4);
      R.readRenderTargetPixels(occ, 0, 0, n, n, buf);
      const half16 = T.DataUtils.fromHalfFloat;
      // (the map as the shaders read it: weather.js oeCover)
      const mapAt = (x, y, z) => { const u = (x - box.x) / box.z + 0.5, v = (-y - box.y) / box.w + 0.5; if (u < 0 || v < 0 || u >= 1 || v >= 1) return null; const i = Math.floor(v * n) * n + Math.floor(u * n); const a = half16(buf[i * 4 + 3]), top = half16(buf[i * 4]) + base; return a > 0.5 && z < top - 0.05; };
      // what is drawn and could be over a head: meshes seen by the camera's layer, with depth, no person, nothing of the rain's
      const nobody = new Set((window.OEPeople && OEPeople.uncovered) || []);
      const cand = [], bb = new T.Box3();
      const cx = g.camera.position.x, cz = g.camera.position.z;
      world.traverseVisible(o => {
        if (!(o.isMesh || o.isInstancedMesh || o.isBatchedMesh) || o.isSkinnedMesh || o.isSprite || o.isPoints || o.isLine) return;
        for (let q = o; q; q = q.parent) if (nobody.has(q)) return;
        if (o.userData.oeNoOcc || o.userData.fadeGhost || !o.layers.test(g.camera.layers)) return;
        for (let q = o; q; q = q.parent) if (q.userData.oeTree || q.userData.shKeys) return; // (a tree is no roof: rain falls under one)
        const m = o.material; if (!m || Array.isArray(m) ? false : (m.depthWrite === false || m.colorWrite === false || m.visible === false)) return;
        if (!o.geometry || !o.geometry.attributes.position) return;
        try { bb.setFromObject(o); } catch (e) { return; }
        if (bb.isEmpty() || bb.max.x < cx - 45 || bb.min.x > cx + 45 || bb.max.z < cz - 45 || bb.min.z > cz + 45) return;
        cand.push({ o, b: bb.clone() });
      });
      const rc = new T.Raycaster(), up = new T.Vector3(0, 1, 0), o0 = new T.Vector3(), hits = [];
      const out = { tested: 0, roofed: 0, bad: [] };
      const pcx = cx, pcy = -cz;
      for (let dy = -half; dy <= half; dy += STEP) for (let dx = -half; dx <= half; dx += STEP) {
        const x = at[0] + dx, y = at[1] + dy;
        if (Math.hypot(x - pcx, y - pcy) > 36) continue; // (inside the map round the camera, 80 m across)
        const f = g.nav.floorAt(x, y, g.nav.terrain(x, y) + 30);
        if (!f || !g.nav.walk(x, y, f.z).ok) continue;
        // (each floor a player can stand on at this point: the deck and the street under it)
        const zs = [f.z]; const f2 = g.nav.floorAt(x, y, f.z - 2.5); if (f2 && f2.z < f.z - 2.4 && g.nav.walk(x, y, f2.z).ok) zs.push(f2.z);
        for (const z of zs) {
          out.tested++;
          const ray = (x, y) => {
            o0.set(x, z + 2.1, -y);
            rc.set(o0, up); rc.far = 12; rc.near = 0;
            let first = null;
            for (const c of cand) {
              if (x < c.b.min.x - 0.01 || x > c.b.max.x + 0.01 || -y < c.b.min.z - 0.01 || -y > c.b.max.z + 0.01 || c.b.max.y < z + 2.1) continue;
              hits.length = 0;
              try { c.o.raycast(rc, hits); } catch (e) { continue; }
              for (const h of hits) if (h.distance <= 12 && (!first || h.distance < first.d)) first = { d: h.distance, o: c.o, face: h.face };
            }
            return first;
          };
          // (a roof is something a metre across over the head: the point and four round it, half a metre out, all under it.
          // A lamp's arm, a signal's mast or a cable is narrower than the map's texel and keeps no rain off)
          const first = ray(x, y);
          if (!first || !ray(x + 0.45, y) || !ray(x - 0.45, y) || !ray(x, y + 0.45) || !ray(x, y - 0.45)) continue;
          out.roofed++;
          const cov = mapAt(x, y, z + 1.7);
          if (cov === false) {
            const m = Array.isArray(first.o.material) ? first.o.material[0] : first.o.material, chain = [];
            for (let q = first.o; q && q !== world && chain.length < 3; q = q.parent) chain.push(q.name || q.type);
            out.bad.push({ at: [+x.toFixed(1), +y.toFixed(1), +z.toFixed(2)], over: +first.d.toFixed(2), mesh: chain.join(' < '), mat: m && m.name, transparent: !!(m && m.transparent), opacity: m ? +m.opacity.toFixed(2) : null, side: m ? m.side : null, kind: first.o.isInstancedMesh ? `instanced ${first.o.count}` : first.o.isBatchedMesh ? 'batched' : first.o.type, size: (() => { const B = new T.Box3().setFromObject(first.o), v = B.getSize(new T.Vector3()); return [+v.x.toFixed(1), +v.y.toFixed(1), +v.z.toFixed(1)]; })(), before: typeof first.o.onBeforeRender === 'function' && first.o.onBeforeRender !== T.Object3D.prototype.onBeforeRender });
          }
        }
      }
      // (a point left open: the map drawn whole, in one pass of everything, and with every cell the visibility sweep hid
      // from the camera shown, to tell which part of the rule leaves it open)
      if (out.bad.length) {
        const was = Wt.cover.cache, vis = window.OEVis && OEVis.shadow ? OEVis : null;
        Wt.cover.cache = false;
        Wt.cover.draw(performance.now() / 1000 + 100, true); R.readRenderTargetPixels(occ, 0, 0, n, n, buf);
        for (const q of out.bad) q.whole = mapAt(q.at[0], q.at[1], q.at[2] + 1.7);
        if (vis) { vis.shadow(true); try { Wt.cover.draw(performance.now() / 1000 + 200, true); } finally { vis.shadow(false); } R.readRenderTargetPixels(occ, 0, 0, n, n, buf); for (const q of out.bad) q.unswept = mapAt(q.at[0], q.at[1], q.at[2] + 1.7); }
        Wt.cover.cache = was;
      }
      return out;
    }, { at: s.at, half: s.half, STEP });
    tested += res.tested; roofed += res.roofed;
    for (const q of res.bad) bad.push(Object.assign({ level: s.level }, q));
    console.log(`${s.level} (${s.at.map(v => v.toFixed(0)).join(', ')}): ${res.tested} points, ${res.roofed} under a roof, ${res.bad.length} of those open to the rain`);
  }
  // by what is over them
  const by = new Map();
  for (const q of bad) { const k = `${q.mesh} [${q.mat}${q.transparent ? `, see-through ${q.opacity}` : ''}${q.side ? `, side ${q.side}` : ''}${q.before ? ', drawn by its own hook' : ''}; the map drawn whole: ${q.whole ? 'covered' : 'open'}, with the sweep's hidden shown: ${q.unswept ? 'covered' : 'open'}]`; if (!by.has(k)) by.set(k, []); by.get(k).push(q); }
  for (const [k, l] of by) console.log(`  under ${k}: ${l.length} points, e.g. ${l.slice(0, 3).map(q => `(${q.at.join(', ')}) ${q.over} m under it`).join('; ')}`);
  fs.writeFileSync(path.join(out, 'rain-roof.json'), JSON.stringify(bad, null, 1));
  if (bad.length) errors.push(`${bad.length} of ${roofed} points under a roof are open to the rain (of ${tested} on the walking floor)`);
  else console.log(`ok   every one of ${roofed} points under a roof is kept from the rain (of ${tested} on the walking floor)`);
  for (const e of errors) console.log(`FAIL ${e}`);
  await b.close();
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
