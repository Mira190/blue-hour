// Feet on the ground: plays the story's opening to where the player first stands in the street (or a free walk at
// the start, WALK=1), lets the world run, then for the one you play and everyone drawn whole within RADIUS metres
// measures how far the soles are from the ground drawn under them: the lowest vertex of each foot as the skin poses
// it this frame (every vertex of the body skinned on the CPU, the way the GPU does it), against the first surface a
// ray straight down meets there in whatever is drawn as ground (the hero level's paving, or the city's own where it is not
// shown), or failing that the walking surface (nav.floorAt).
// Sunk is a sole under the ground drawn (a foot through the paving: the owner's iPhone at the opening, November 2026),
// floating a sole over it with the person standing still or at the low point of a stride.
// Prints a line per person and exits 1 when anyone stands more than SINK_M in or FLOAT_M over the ground.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/feet_check.js [out_dir] [WxH]     (390x844: a phone, low tier; 1440x900: a desktop, high)
// TIER: the quality tier (low on a phone's size, high otherwise), SAMPLES: looks a second apart (5), RADIUS (25 m).
// HERO=off: the hero levels held back, as a phone shows the street before its level has come (measure it at a desktop's
// size: a phone lets go of the city's buffers once they are on the GPU, and there is nothing to cast a ray at).
const { chromium } = require('playwright');
const fs = require('fs');
const [,, out = '/tmp/feet-check', size = '390x844'] = process.argv;
// (HERO=off: the city's own Scramble, its paving read between half-metre cells, its edges eased over one: 4 and 6 cm)
const OFF = process.env.HERO === 'off', SINK_M = +(process.env.SINK_M || (OFF ? 0.04 : 0.025)), FLOAT_M = +(process.env.FLOAT_M || (OFF ? 0.06 : 0.05));
(async () => {
  const [w, h] = size.split('x').map(Number), phone = w < 500;
  const args = process.env.GPU === 'metal' ? ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-gpu']
    : process.env.DISPLAY ? ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] : ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: phone, isMobile: phone });
  const errors = [];
  p.on('pageerror', e => { errors.push(String(e)); console.log('pageerror:', String(e).slice(0, 300)); });
  fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || (phone ? 'low' : 'high'));
  await p.goto(`http://localhost:${process.env.PORT || 8800}/${process.env.WALK ? '?walk=1' : ''}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction(() => { const t = document.getElementById('g-title'); return window.__game && t && !t.hidden; }, null, { timeout: 900000, polling: 500 });
  await p.evaluate(() => document.getElementById('gt-play').click());
  // the opening's flight skipped (its own button), then on to where the story first lets you walk
  const t0 = Date.now();
  while (Date.now() - t0 < 900000) {
    const s = await p.evaluate(() => {
      const g = window.__game, sk = document.querySelector('.ov-skip'), mv = document.querySelector('#g-story-mov button');
      if (sk && getComputedStyle(sk).opacity > 0.1) sk.click();
      if (mv && mv.offsetParent) mv.click();
      const st = g.story && g.story.state, d = document.getElementById('gd');
      if (d && !d.hidden) { const c = document.querySelector('#gd-choices button'); if (c) c.click(); else document.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE', key: 'e', bubbles: true })); }
      const hero = g.hero && g.hero();
      return { phase: st ? st.phase : 'walk', mode: g.player.mode, cine: !!(g.cine && g.cine.active), ready: !hero || hero.levels.every(L => L.state !== 'loading'), z: g.player.z };
    });
    if (s.mode === 'foot' && !s.cine && s.ready && s.phase !== 'dressed' && s.phase !== 'idle') break;
    await p.waitForTimeout(1500);
  }
  // HERO=off: the hero levels held back, as a phone shows the street in the seconds before its level has come (the
  // owner's iPhone, resumed at frame 1 six seconds after the load: the city's own Scramble, its tactile lines 12 cm up)
  if (process.env.HERO === 'off') await p.evaluate(() => { const g = window.__game, H = g.hero && g.hero(); if (!H) return; const up = H.update; H.levels.forEach(L => { L.state = 'loading'; if (L.root) L.root.visible = false; L.h.shown = false; for (const n of L.h.hide || []) { const o = g.Wd.world.getObjectByName(n); if (o) o.visible = true; } }); H.update = () => {}; });
  await p.waitForTimeout(4000);
  let worst = 0;
  const N = +(process.env.SAMPLES || 5);
  for (let k = 0; k < N; k++) {
    const r = await p.evaluate(R => {
      const g = window.__game, T = window.THREE, world = g.Wd.world;
      const v = new T.Vector3(), lo = new T.Vector3(), ray = new T.Raycaster(), down = new T.Vector3(0, -1, 0), pl = g.player;
      // everyone drawn as a skinned body: the one you play first, then each group under the world that holds one
      const shown = o => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
      const groups = new Map();
      world.traverse(o => { if (!o.isSkinnedMesh || !shown(o)) return; let top = o; while (top.parent && top.parent !== world) top = top.parent; groups.set(top, true); });
      const rigs = [['you', pl.rig.root, pl.rig]];
      const named = new Map((g.npcs || []).filter(n => n.rig).map(n => [n.rig.root, n]));
      let k = 0;
      for (const top of groups.keys()) if (top !== pl.rig.root) { const n = named.get(top); rigs.push([n ? (n.id || n.name || 'npc') : `body ${++k}`, top, n ? n.rig : null]); }
      const rows = [];
      const me = pl.rig.root.getWorldPosition(new T.Vector3());
      // what is drawn as ground: every opaque mesh shown (the hero level's, or the city's own where it is not), not a body,
      // a crowd drawn instanced, a sprite or a pane of glass; the first a ray down from 40 cm over a sole meets is the ground
      const grounds = []; let held = 0;
      world.traverse(o => { if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || !shown(o)) return; const m = Array.isArray(o.material) ? o.material[0] : o.material;
        if (!m || m.transparent || m.depthWrite === false || /glass|win|tube|glow|shadow|route/i.test(`${m.name} ${o.name}`)) return; const G_ = o.geometry, P_ = G_ && G_.attributes.position; if (!P_ || !P_.array || (G_.index && !G_.index.array)) { held++; return; } // (a phone's buffers let go once on the GPU: world.js gpuOnly)
        if (!G_.boundingSphere) G_.computeBoundingSphere(); grounds.push(o); });
      for (const [id, top, rig] of rigs) {
        if (!top || !shown(top)) continue;
        top.updateWorldMatrix(true, true);
        let at = top.getWorldPosition(new T.Vector3());
        let sk = null; top.traverse(o => { if (o.isSkinnedMesh && !sk) sk = o; });
        if (!sk) continue;
        if (top.isSkinnedMesh || top.isInstancedMesh) continue; // (a crowd drawn as one mesh: no body of its own to measure)
        const dx = at.x - g.camera.position.x, dz = at.z - g.camera.position.z;
        if (id !== 'you' && Math.hypot(at.x - me.x, at.z - me.z) > R) continue;
        // the lowest vertex of each foot, skinned (the left and right of the root's own facing)
        const feet = [Infinity, Infinity], fx = [null, null];
        let side = new T.Vector3(1, 0, 0).applyQuaternion(top.getWorldQuaternion(new T.Quaternion()));
        top.traverse(o => {
          if (!o.isSkinnedMesh || !o.visible) return;
          const P = o.geometry.attributes.position, n = P.count;
          for (let i = 0; i < n; i++) {
            v.fromBufferAttribute(P, i);
            (o.applyBoneTransform || o.boneTransform).call(o, i, v);
            v.applyMatrix4(o.matrixWorld);
            if (v.y > at.y + 0.25) continue;
            const s = (v.x - at.x) * side.x + (v.z - at.z) * side.z > 0 ? 1 : 0;
            if (v.y < feet[s]) { feet[s] = v.y; fx[s] = v.clone(); }
          }
        });
        const one = [];
        for (let s = 0; s < 2; s++) {
          if (!fx[s]) continue;
          let gy = null;
          ray.set(new T.Vector3(fx[s].x, fx[s].y + 0.4, fx[s].z), down); ray.far = 1.4;
          const hit = ray.intersectObjects(grounds, false)[0]; let what = null; if (hit) { gy = hit.point.y; what = `${hit.object.name || '?'}/${(Array.isArray(hit.object.material) ? hit.object.material[0] : hit.object.material).name || '?'}`.slice(0, 48); }
          const lx = fx[s].x, ly = -fx[s].z;
          const fl = g.nav && g.nav.floorAt ? g.nav.floorAt(lx, ly, fx[s].y + 1) : null, nav = fl && fl.z != null ? fl.z : null;
          one.push({ side: s ? 'L' : 'R', sole: +fx[s].y.toFixed(3), drawn: gy == null ? null : +gy.toFixed(3), what, nav: nav == null ? null : +nav.toFixed(3) });
        }
        const clip = rig && rig.mixer && rig.mixer._actions ? rig.mixer._actions.filter(a => a.isRunning() && a.getEffectiveWeight() > 0.3).map(a => a.getClip().name).join('+') : '';
        rows.push({ id, char: rig ? rig.character : (sk.name || ''), clip, root: +at.y.toFixed(3), d: +Math.hypot(dx, dz).toFixed(1), one });
      }
      return { z: pl.z, rows, held };
    }, +(process.env.RADIUS || 25));
    for (const row of r.rows) {
      // sunk: the lower sole under the ground drawn there (the hero level's, else the walking surface)
      const gaps = row.one.map(f => (f.drawn != null ? f.drawn : f.nav) - f.sole).filter(x => isFinite(x));
      if (!gaps.length) continue;
      const sink = Math.max(...gaps), float = -Math.max(...gaps); // (the lower foot: the one that should touch)
      const bad = sink > SINK_M ? `SUNK ${(sink * 100).toFixed(1)} cm` : float > FLOAT_M ? `FLOATING ${(float * 100).toFixed(1)} cm` : '';
      if (row.id === 'you' || bad) console.log(`look ${k + 1}: ${row.id} (${row.char}, ${row.clip || 'no clip'}) root ${row.root} ${row.one.map(f => `${f.side} sole ${f.sole} drawn ${f.drawn} (${f.what})`).join('; ')}${bad ? `  ${bad}` : ''}`);
      if (bad) { worst++; errors.push(`${row.id} ${bad}`); }
    }
    console.log(`look ${k + 1}: ${r.rows.length} people measured, player z ${(+r.z).toFixed(3)}${r.held ? `; ${r.held} meshes held on the GPU alone, not measured` : ''}`);
    if (k === 0) await p.screenshot({ path: `${out}/feet-${size}.png` });
    await p.waitForTimeout(1000);
  }
  await b.close();
  console.log(errors.length ? `FAIL ${errors.length}: ${[...new Set(errors)].slice(0, 12).join('; ')}` : 'OK: every sole on the ground drawn');
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
