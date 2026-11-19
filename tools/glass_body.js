// Walk, run and stand the player into glass and along it, and measure, frame by frame, how far any part of the body
// (the skin of the rig as the clip poses it: hands, forearms, elbows, shoulders, head, hips, knees, feet) and what it
// carries passes the glass. The glass:
//   - each escalator's balustrades (a game surface with moving_ms): two panes 0.1 m past the steps' strip either side,
//     from 0.14 m over the step to the black handrail 1.05 m over it, and the half-round glass of the newels at its ends;
//   - SHIBUYA SKY's rim and every other wall or rail the collision world holds (nav.col): a skin point inside a solid.
// Moves, on each escalator: walked on at the middle then pushed sideways into each balustrade (walking and running),
// stood still against it, on the landing plates at the foot and the head, and come at slantwise from the floor beside
// the newel; on the roof's deck, run and walked into the rim's glass from several angles. Each frame of the move is
// measured (30 a second); the deepest part is printed per move, and the run exits 1 if any crosses by more than TOL m.
// With an out dir, stills at the end of each kind of move (from the chase camera, close by the glass, and from across the
// steps), and five stills a second apart with time held at the end of a stand at the glass (a pose laid over an
// animation is taken off before the next frame: AGENTS.md).
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/glass_body.js [out_dir] [WxH]      # ONLY=esc|rim, MATCH=text (moves whose name has it); TOL=0.01 (m)
const { chromium } = require('playwright');
const fs = require('fs');
const { startPlay } = require('./start_play');
const [,, out = '', size = '1440x900'] = process.argv;
const [VW, VH] = size.split('x').map(Number);
const TOL = +(process.env.TOL || 0.01), ONLY = process.env.ONLY || '', MATCH = process.env.MATCH || '';
(async () => {
  if (out) fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch(process.env.DISPLAY
    ? { headless: false, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox'] }
    : { args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1, hasTouch: VW < 500, isMobile: VW < 500 });
  await p.addInitScript(() => { try { localStorage.setItem('oe3d-onboard', JSON.stringify({ done: 1 })); localStorage.setItem('oe3d-quality', 'high'); } catch (e) { /* storage blocked */ } });
  const logs = [];
  p.on('pageerror', e => logs.push(`pageerror: ${String(e).slice(0, 300)}`));
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1#play-shibuya`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 900000 });
  await p.evaluate(async () => { const g = window.__game; g.hold(true, true); await g.ways.build(); });
  await startPlay(p);
  await p.evaluate(() => { const g = window.__game; g.advance(1); if (g.cine && g.cine.active && g.cine.skip) g.cine.skip(); g.advance(3); });
  // the measure, in the page: every skin vertex (one in STRIDE) of the rig as posed, and the meshes it carries
  await p.evaluate(() => {
    const T = window.THREE, g = window.__game, v3 = new T.Vector3();
    const PART = n => { n = n.replace(/^Bip01_?/, ''); // a bone's name as a body part
      const s = /^L_|^L |Left|_L$/.test(n) ? 'left ' : /^R_|^R |Right|_R$/.test(n) ? 'right ' : '';
      const k = n.replace(/^[LR][_ ]|Left|Right|_[LR]$/g, '').toLowerCase();
      const part = /finger|hand|thumb/.test(k) ? 'hand' : /forearm/.test(k) ? 'forearm' : /upperarm/.test(k) ? 'upper arm' : /clavicle/.test(k) ? 'shoulder'
        : /head|neck|eye|jaw|ponytail|hair/.test(k) ? 'head' : /spine|chest/.test(k) ? 'torso' : /pelvis|hip/.test(k) ? 'hips' : /thigh/.test(k) ? 'thigh'
          : /calf/.test(k) ? 'knee' : /foot|toe/.test(k) ? 'foot' : k;
      return s + part; };
    // the points of the body: [mesh, vertex, part], and the carried meshes' corners
    window.__bodyPts = () => {
      const pl = g.player, pts = [], STRIDE = 3;
      pl.rig.root.updateMatrixWorld(true);
      pl.rig.root.traverse(o => {
        if (!o.visible && o !== pl.rig.root) return;
        if (o.isSkinnedMesh) {
          const pos = o.geometry.attributes.position, si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight, bones = o.skeleton.bones;
          for (let i = 0; i < pos.count; i += STRIDE) {
            o.getVertexPosition(i, v3); o.localToWorld(v3);
            let bi = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; bi = si.getComponent(i, k); } }
            pts.push([v3.x, -v3.z, v3.y, PART(bones[bi] ? bones[bi].name : '?')]);
          }
        } else if (o.isMesh && o.geometry) {
          o.geometry.computeBoundingBox(); const bb = o.geometry.boundingBox;
          for (let k = 0; k < 8; k++) { v3.set(k & 1 ? bb.max.x : bb.min.x, k & 2 ? bb.max.y : bb.min.y, k & 4 ? bb.max.z : bb.min.z); o.localToWorld(v3); pts.push([v3.x, -v3.z, v3.y, `carried (${o.name || 'a prop'})`]); }
        }
      });
      return pts;
    };
    // how far each point is past an escalator's glass (the pane on the side the walker stands, while the walker's middle
    // is between the panes), within the glass's height; and inside a solid of the collision world
    const interp = (us, zs, u) => { if (u <= us[0]) return zs[0]; for (let i = 1; i < us.length; i++) if (u <= us[i]) return zs[i - 1] + (zs[i] - zs[i - 1]) * (u - us[i - 1]) / (us[i] - us[i - 1]); return zs[zs.length - 1]; };
    window.__glassDepth = () => {
      const pl = g.player, nav = g.nav, worst = {};
      const put = (part, d, what) => { if (!(part in worst) || d > worst[part][0]) worst[part] = [d, what]; };
      const pts = window.__bodyPts();
      for (const s of nav.strips) {
        if (!s.moving_ms) continue;
        const [u0, v0] = nav.stripUV(s, pl.x, pl.y), G = s.half_width + 0.1, L = s.us[s.us.length - 1] - 0.5; // (the profile runs half a metre on past the head)
        const up = s.zs[s.zs.length - 1] > s.zs[0]; // (the up flight's origin is its foot; the way down's its head)
        const a = up ? 0.9 : 0.75, z = up ? L - 0.75 : L - 0.9;
        if (Math.abs(v0) > G || u0 < -1.5 || u0 > L + 1.5 || Math.abs(interp(s.us, s.zs, Math.max(0, Math.min(L, u0))) - pl.z) > 1.5) continue;
        for (const [x, y, zz, part] of pts) {
          const [u, v] = nav.stripUV(s, x, y), past = Math.abs(v) - G;
          if (past < -0.3 || Math.sign(v) !== Math.sign(v0 || v)) continue;
          const zs = interp(s.us, s.zs, Math.max(0, Math.min(L, u))), dz = zz - zs;
          let top = -1;
          if (u >= a && u <= z) top = 1.05;
          else { const d = u < a ? a - u : u - z; if (d <= 0.42) top = 0.56 + Math.sqrt(0.42 * 0.42 - d * d); }
          if (top < 0 || dz < 0.14 || dz > top) continue;
          put(part, past, s.name.replace('SHIBUYA SKY escalator, ', 'glass, '));
        }
      }
      // (a wall, a rail or the rim's glass: the point inside a solid of the collision world, above the ankle, a building
      // walked on (no higher than a step over the feet) let go as nav.slide does)
      const col = nav.col, skip = i => col.zhiOf(i) <= pl.z + 0.4 || (col.tagOf(i) === nav.BUILDING && col.zhiOf(i) <= pl.z + nav.STEP); // (a lip under the knee is stepped over)
      const TAG = ['', 'building', 'landmark', 'landmark cell'];
      // (not by an escalator's steps, whose glass is measured above: the collision world's cells there are the clad body
      // under the steps, rasterised, not what is drawn)
      const byEsc = (x, y) => nav.strips.some(s => { if (!s.moving_ms) return false; const [u, v] = nav.stripUV(s, x, y); return Math.abs(v) < s.half_width + 0.2 && u > -1 && u < s.us[s.us.length - 1] + 0.5; });
      for (const [x, y, zz, part] of pts) if (zz > pl.z + 0.2 && !byEsc(x, y) && col.overlap(x, y, 0.012, zz - 0.01, zz + 0.01, skip)) {
        const cand = []; col.overlap(x, y, 0.3, zz - 0.01, zz + 0.01, i => { if (!skip(i)) cand.push(i); return true; });
        const hit = cand.find(c => col.overlap(x, y, 0.012, zz - 0.01, zz + 0.01, i => i !== c));
        // (how deep: the shortest way out of it, a centimetre at a time in sixteen directions)
        let dep = 0.3;
        for (let k = 1; k <= 30 && dep === 0.3; k++) for (let j = 0; j < 16; j++) { const a = j * Math.PI / 8; if (!col.overlap(x + Math.cos(a) * k / 100, y + Math.sin(a) * k / 100, 0.001, zz - 0.01, zz + 0.01, skip)) { dep = k / 100; break; } }
        put(part, dep, hit != null ? `a wall (${TAG[col.tagOf(hit)] || col.tagOf(hit)} ${hit}, ${col.zloOf(hit).toFixed(1)} to ${col.zhiOf(hit).toFixed(1)} m)` : 'a wall');
      }
      return worst;
    };
  });
  // (functions don't cross into the page: keys as a list per frame index range)
  const run = async (name, o) => {
    if (MATCH && !name.includes(MATCH)) return { name, bad: false };
    const r = await p.evaluate(o => {
      const keys = eval(o.keysSrc); // eslint-disable-line no-eval
      const g = window.__game, pl = g.player, nav = g.nav;
      if (o.at) {
        const [x, y, z] = o.at; nav.prefetch(x, y, 48, Infinity);
        const f = nav.floorAt(x, y, z + 0.5);
        [pl.x, pl.y, pl.z] = [x, y, f ? f.z : z]; pl.mode = 'foot'; pl.ground = true; pl.vz = 0; pl.speed = 0; pl.escOff = null; if (f) pl.floor = f.kind;
        pl.h = o.h; g.cam.yaw = o.yaw ?? o.h; g.cam.pitch = 0.3; if (g.cam.snap !== undefined) g.cam.snap = true;
      }
      pl.walking = !o.run;
      const worst = {}, track = []; let deepest = null;
      for (let i = 0; i < o.frames; i++) {
        if (o.yaw != null) g.cam.yaw = o.yaw;
        g.advance(1 / 30, keys(i));
        if (o.trace) track.push([i, +pl.x.toFixed(2), +pl.y.toFixed(2), +pl.z.toFixed(2), pl.floor, pl.ground, +pl.speed.toFixed(2)]);
        const w = window.__glassDepth();
        for (const [part, [d, what]] of Object.entries(w)) {
          if (!(part in worst) || d > worst[part][0]) worst[part] = [d, what, i];
          if (!deepest || d > deepest.d) deepest = { d, part, what, i };
        }
      }
      return { worst, deepest, track, end: [+pl.x.toFixed(2), +pl.y.toFixed(2), +pl.z.toFixed(2), pl.floor] };
    }, Object.assign({}, o, { keysSrc: String(o.keys), keys: undefined, trace: !!process.env.TRACE }));
    const parts = Object.entries(r.worst).filter(([, [d]]) => d > -0.06).sort((a, b) => b[1][0] - a[1][0]).slice(0, 5)
      .map(([part, [d, what, i]]) => `${part} ${d > 0 ? `${(d * 100).toFixed(0)} cm into` : `${(-d * 100).toFixed(0)} cm from`} ${what} (frame ${i})`);
    const bad = r.deepest && r.deepest.d > TOL;
    if (bad && process.env.TRACE) for (const t of r.track.filter(t => Math.abs(t[0] - r.deepest.i) <= 6)) console.log('   ', JSON.stringify(t));
    console.log(`${bad ? 'FAIL' : 'ok  '} ${name}: ${parts.length ? parts.join('; ') : 'nothing within 6 cm'}${bad ? ` (ended at ${r.end.join(', ')})` : ''}`);
    return { name, bad, r };
  };
  const res = [];
  // a camera put by the player: 'close', a metre and a half off the shoulder on the glass's side, looking at the body
  // (through the glass); 'across', from over the far balustrade, looking across the body at the glass behind it, where a
  // hand or a foot past the pane shows against the handrail and the floor beyond
  const camAt = how => p.evaluate(how => {
    const g = window.__game, pl = g.player, T = window.THREE, cam = g.camera, s = g.nav.strips.find(q => q.moving_ms && Math.abs(g.nav.stripUV(q, pl.x, pl.y)[1]) < 0.7 && Math.abs(g.nav.stripUV(q, pl.x, pl.y)[0] - 8) < 12);
    let dx = -Math.sin(pl.h), dy = -Math.cos(pl.h), d = 1.6, up = 1.6; // (behind, if no escalator)
    if (s) {
      const v = g.nav.stripUV(s, pl.x, pl.y)[1], sg = (v >= 0 ? 1 : -1) * (how === 'across' ? -1 : 1);
      dx = -s.axis[1] * sg * 0.8 - s.axis[0] * 0.9; dy = s.axis[0] * sg * 0.8 - s.axis[1] * 0.9;
      if (how === 'across') { d = 1.3; up = 2.3; }
    }
    const L = Math.hypot(dx, dy); cam.position.set(pl.x + dx / L * d, pl.z + up, -(pl.y + dy / L * d)); cam.up.set(0, 1, 0); cam.lookAt(new T.Vector3(pl.x, pl.z + 0.9, -pl.y)); cam.updateMatrixWorld();
  }, how);
  const shots = async (tag) => {
    if (!out) return;
    await p.screenshot({ path: `${out}/${tag}-chase.jpg`, type: 'jpeg', quality: 85 });
    for (const how of ['close', 'across']) { await camAt(how); await p.screenshot({ path: `${out}/${tag}-${how}.jpg`, type: 'jpeg', quality: 85 }); }
  };
  const esc = await p.evaluate(() => window.__game.nav.strips.filter(q => q.moving_ms).map(q => ({ name: q.name, origin: q.origin, axis: q.axis, hw: q.half_width, us: q.us, zs: q.zs })));
  const W = (s, u, v) => [s.origin[0] + s.axis[0] * u - s.axis[1] * v, s.origin[1] + s.axis[1] * u + s.axis[0] * v];
  const head = s => Math.atan2(s.axis[0], s.axis[1]);
  const zAt = (s, u) => { for (let i = 1; i < s.us.length; i++) if (u <= s.us[i]) return s.zs[i - 1] + (s.zs[i] - s.zs[i - 1]) * (u - s.us[i - 1]) / (s.us[i] - s.us[i - 1]); return s.zs[s.zs.length - 1]; };
  if (!ONLY || ONLY === 'esc') for (const s of esc) {
    const n = s.name.replace('SHIBUYA SKY escalator, ', ''), L = s.us[s.us.length - 1] - 0.5, h = head(s);
    for (const side of [1, -1]) {
      const key = side > 0 ? 'KeyA' : 'KeyD'; // (v grows to the left of the axis: A strafes left)
      const tag = `${n}-${side > 0 ? 'left' : 'right'}`;
      // walked on at the middle, and pushed into the glass from the first step on, walking then running
      for (const runIt of [false, true]) res.push(await run(`${n}: ${runIt ? 'run' : 'walk'} on, then into the ${side > 0 ? 'left' : 'right'} glass`, { at: [...W(s, -2.5, 0), zAt(s, 0)], h, yaw: h, run: runIt, frames: 150, keys: `i => i < 45 ? ['KeyW'] : i < 120 ? ['${key}', ...(i % 40 < 20 ? ['KeyW'] : [])] : []` }));
      await shots(`${tag}-pushed`);
      // stood against it half way up: turned to face it, and still
      res.push(await run(`${n}: stood at the ${side > 0 ? 'left' : 'right'} glass half way, facing it`, { at: [...W(s, L / 2, side * 0.47), zAt(s, L / 2)], h: h - side * Math.PI / 2, yaw: h, frames: 90, keys: `i => []` }));
      await shots(`${tag}-stood`);
      // on the landing plates, foot and head: walked across into the glass
      res.push(await run(`${n}: across the foot's landing into the ${side > 0 ? 'left' : 'right'} glass`, { at: [...W(s, 1.2, 0), zAt(s, 1.2)], h: h - side * Math.PI / 2, yaw: h - side * Math.PI / 2, frames: 60, keys: `i => ['KeyW']` }));
      res.push(await run(`${n}: across the head's landing into the ${side > 0 ? 'left' : 'right'} glass`, { at: [...W(s, L - 1.3, 0), zAt(s, L - 1.3)], h: h - side * Math.PI / 2, yaw: h - side * Math.PI / 2, frames: 60, keys: `i => ['KeyW']`, run: true }));
      await shots(`${tag}-landing`);
      // come at slantwise from the floor beside the foot, past the newel
      res.push(await run(`${n}: slantwise from the ${side > 0 ? 'left' : 'right'} onto the foot`, { at: [...W(s, -2.2, side * 0.7), zAt(s, 0)], h: h - side * 0.6, yaw: h - side * 0.6, frames: 90, keys: `i => ['KeyW']` }));
    }
  }
  if (!ONLY || ONLY === 'rim') {
    const MID = [541, -1124], DECK = 241.8;
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4 + 0.2;
      for (const runIt of [true, false]) res.push(await run(`rim: ${runIt ? 'run' : 'walk'} at ${Math.round(a * 180 / Math.PI)} degrees`, { at: [MID[0], MID[1], DECK], h: a, yaw: a, run: runIt, frames: 240, keys: `i => ['KeyW']` }));
      await shots(`rim-${k}`);
      // and along it: turned 70 degrees, walking on, the shoulder at the glass
      res.push(await run(`rim: along it after ${Math.round(a * 180 / Math.PI)} degrees`, { frames: 90, h: a + 1.2, yaw: a + 1.2, keys: `i => ['KeyW']` }));
    }
  }
  // time held: five stills a second apart of the player still at the glass (nothing laid over a pose may wind on)
  if (out) {
    const s = esc[0], L = s.us[s.us.length - 1] - 0.5;
    await run('held at the glass', { at: [...W(s, L / 2, 0.47), zAt(s, L / 2)], h: head(s) - Math.PI / 2, yaw: head(s), frames: 30, keys: `i => []` });
    await camAt('across');
    for (let i = 0; i < 5; i++) { await p.waitForTimeout(1000); await p.screenshot({ path: `${out}/held-${i}.jpg`, type: 'jpeg', quality: 85 }); }
  }
  const bad = res.filter(r => r.bad).length;
  console.log(`${res.length - bad} of ${res.length} moves clear of the glass${bad ? `; ${bad} cross it by more than ${TOL * 100} cm` : ''}`);
  console.log(logs.join('\n'));
  await b.close();
  process.exit(bad || logs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
