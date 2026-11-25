// The guide's body and the player's never share ground (web/game/companion.js keepOff; game.js stops the player at
// his flank only where a wall holds him). The map without its story (?walk=1), the world held and stepped a
// thirtieth of a second at a time, the guide made as the story makes him and ticked with it, and the player walked
// and run into him from four sides while he sits, turned about with him at heel, run past him while he leads, and
// pushed into him where he sits against a wall. Each step measures how far the player's circle is from his spine
// past the clearance (companion.js PLAYER_R + FLANK). The rule is companion.js keepOff's: the two may touch and never
// overlap, in the open or against a wall, so a step that ends with his capsule more than half a centimetre inside the
// player's circle fails (the solver sets them down against each other to 2 mm; it was 3 cm, the same 3 cm he was let in
// before he said a wall held him, and the case against the wall passed or failed by the run: issues 133 and 138), and
// so does any vertex of his model inside the player's torso. Stills of the moments they are nearest, from the chase camera.
//   python3 -m http.server 8800 --directory web &
//   xvfb-run -a node tools/guide_body.js out_dir [WxH]
const { chromium } = require('playwright');
const { watch: watchPage } = require('./browser_watch'); // (what the browser says of its GPU, in the log: issue 49)
const fs = require('fs');
const { startPlay } = require('./start_play');
const [,, out = '/tmp/guide-body', size = '1440x900'] = process.argv;
(async () => {
  const [w, h] = size.split('x').map(Number), phone = w < 600;
  const b = await chromium.launch({ headless: !process.env.DISPLAY, args: ['--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=gl', '--disable-gpu-sandbox', '--disable-gpu-watchdog'] });
  const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: phone, hasTouch: phone });
  watchPage(p);
  const errors = [];
  p.on('pageerror', e => { errors.push(String(e)); console.log('pageerror:', String(e).slice(0, 300)); });
  fs.mkdirSync(out, { recursive: true });
  await p.addInitScript(t => { try { localStorage.setItem('bh-quality', t); } catch (e) { /* storage blocked */ } }, process.env.TIER || 'high');
  await p.goto(`http://localhost:${process.env.PORT || 8800}/?walk=1`, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await p.waitForFunction('window.__game && window.__game.flyover', null, { timeout: 900000 });
  await startPlay(p, { timeout: 900000, asIs: true });
  await p.waitForTimeout(1500);
  // the guide, made as the story makes him, and the world held
  const ok = await p.evaluate(async () => {
    const g = window.__game;
    for (const id of ['g-title', 'g-menu', 'g-bigmap', 'g-pass']) { const el = document.getElementById(id); if (el) el.hidden = true; }
    if (g.cine && g.cine.active) g.cine.skip();
    if (g.settleArrival) try { g.settleArrival(); } catch (e) { /* no arrival */ }
    g.clock.frozen = true; g.setClock(2026, 10, 10, 17 * 60 + 39);
    g.hold(true);
    const gd = g.G.story && g.G.story.episodes[0].guide;
    const d = gd && g.makeGuide(gd);
    if (!d) return false;
    window.__dog = d;
    for (let i = 0; i < 600 && !d.ready; i++) await new Promise(r => setTimeout(r, 100));
    return d.ready;
  });
  if (!ok) { console.log('FAIL no guide'); await b.close(); process.exit(1); }
  // a step: the world a thirtieth of a second on with the keys held, and the guide with it; the gap measured
  // (and his model as it is drawn: every third vertex of every mesh in him, posed by the clip of that frame, against the
  // player's torso, a vertical column TORSO m round where they stand from their feet to their shoulders; so that a new
  // model, or a clip that throws a leg out, is judged by its geometry and not by the capsule companion.js keeps)
  const run = (steps, keys, yaw) => p.evaluate(([steps, keys, yaw]) => {
    const g = window.__game, d = window.__dog, pl = g.player, T = window.THREE, v = new T.Vector3(), TORSO = 0.26; let worst = Infinity, at = null, jam = 0, real = Infinity;
    // (his model's meshes: not the pale ring at his feet while he leads, a mark on the ground and not a body)
    const meshes = []; for (const c of d.root.children) if (!c.isMesh) c.traverse(o => { if (o.isMesh && o.geometry && o.geometry.attributes.position) meshes.push(o); });
    for (let i = 0; i < steps; i++) {
      if (yaw != null) { g.cam.yaw = typeof yaw === 'number' ? yaw : Math.atan2(d.x - pl.x, d.y - pl.y); }
      g.advance(1 / 30, keys); d.tick(1 / 30);
      const [cx, cy] = d.spineNear(pl.x, pl.y), gap = Math.hypot(cx - pl.x, cy - pl.y) - d.clearance;
      if (gap < worst) { worst = gap; at = { i, pl: [+pl.x.toFixed(2), +pl.y.toFixed(2)], dog: [+d.x.toFixed(2), +d.y.toFixed(2)], state: d.state }; }
      if (d.jammed) jam++;
      if (i % 3 === 0 && Math.hypot(d.x - pl.x, d.y - pl.y) < 1.6) {
        d.root.updateMatrixWorld(true);
        for (const m of meshes) { const n = m.geometry.attributes.position.count; for (let k = 0; k < n; k += 3) {
          m.getVertexPosition(k, v); v.applyMatrix4(m.matrixWorld);
          const hy = v.y - pl.z; if (hy < 0.05 || hy > 1.45) continue;
          const r = Math.hypot(v.x - pl.x, -v.z - pl.y) - TORSO; if (r < real) real = r;
        } }
      }
    }
    return { worst: +worst.toFixed(3), real: real === Infinity ? null : +real.toFixed(3), at, jam, state: d.state, yielded: d.yielded, body: d.body };
  }, [steps, keys, yaw]);
  const set = (pl, dog) => p.evaluate(([pl, dog]) => {
    const g = window.__game, d = window.__dog, P = g.player, z = g.nav.terrain(pl[0], pl[1]);
    P.x = pl[0]; P.y = pl[1]; P.h = pl[2]; P.vz = 0; P.ground = true; g.cam.yaw = pl[2]; g.cam.pitch = 0.35; g.cam.dist = 4.5;
    if (dog) { d.place(dog[0], dog[1], dog[2]); if (dog[3] === 'sit') d.go([dog[0], dog[1]], null, 1); else if (dog[3] === 'heel') d.heel(); }
    for (let i = 0; i < 20; i++) { g.advance(1 / 30); d.tick(1 / 30); } // (settled: sitting, or at heel)
    return { pl: [P.x, P.y], dog: [d.x, d.y, d.state] };
  }, [pl, dog]);
  // a still from the side of the two of them, close and low, with the map's instruments and its tour put away: the
  // camera turned a quarter round from the way the player faces, so that neither hides the other
  await p.addStyleTag({ content: '#g-hud, .g-hud, #g-toast, .g-toasts, .tour, #g-onboard, #g-tour, .g-touch, #g-area, .g-quest, .g-right, .g-labels, .ob-tour, .ob-coach, .g-minimap, .gm-clock { display: none !important; }' });
  const snap = async name => {
    await p.evaluate(() => { const g = window.__game, d = window.__dog, P = g.player; g.cam.yaw = Math.atan2(d.x - P.x, d.y - P.y) + Math.PI / 2; g.cam.pitch = 0.18; g.cam.dist = 2.6; g.cam.lastInput = 1e9; });
    await p.evaluate(() => new Promise(r => { let n = 8; const f = () => (--n > 0 ? requestAnimationFrame(f) : r()); requestAnimationFrame(f); }));
    await p.screenshot({ path: `${out}/${name}.png` });
  };
  const fails = [];
  const judge = (name, r) => { const bad = r.worst < -0.005 || (r.real != null && r.real < 0); console.log(`${bad ? 'FAIL' : 'ok  '} ${name}: his capsule ${r.worst >= 0 ? '+' : ''}${(r.worst * 100).toFixed(1)} cm off the player's circle, his model ${r.real == null ? 'never near' : `${r.real >= 0 ? '+' : ''}${(r.real * 100).toFixed(1)} cm off their torso`}${r.jam ? `, held against a wall ${r.jam} steps` : ''}, he ${r.yielded ? `made way ${r.yielded} times, ` : ''}now ${r.state}`); if (bad) fails.push(name); };
  // 1. sitting on open paving (frame 1's light): walked and run into from four sides
  const S = [362.3, -988.6];
  console.log('his body, measured from the model:', JSON.stringify(await p.evaluate(() => window.__dog.body)));
  const gaitIs = gait => p.evaluate(gait => { window.__game.player.walking = gait === 'walk'; }, gait);
  // ONLY=wall: the wall's case alone; WALL_N=n: it n times over, the street moved on two seconds between (the crowd
  // elsewhere each time, which is what his way round you is planned through: how often the case fails, in one load)
  const ONLY = process.env.ONLY || '', WALL_N = +(process.env.WALL_N || 1);
  if (!ONLY) for (const [k, a] of [['north', 0], ['east', Math.PI / 2], ['south', Math.PI], ['west', -Math.PI / 2]]) for (const gait of ['walk', 'run', 'sprint']) {
    const from = [S[0] - Math.sin(a) * 4, S[1] - Math.cos(a) * 4, a];
    await set(from, [S[0], S[1], 0.3, 'sit']); await gaitIs(gait);
    const keys = gait === 'sprint' ? ['KeyW', 'ShiftLeft'] : ['KeyW'];
    const r = await run(gait === 'walk' ? 120 : 60, keys, a);
    judge(`sitting, ${gait} into him heading ${k}`, r);
    // (and the nearest moment again, for its still: the same steps up to it)
    if ((k === 'north' || k === 'east') && r.at) { await set(from, [S[0], S[1], 0.3, 'sit']); await gaitIs(gait); await run(r.at.i + 1, keys, a); await snap(`sit-${k}-${gait}-nearest`); }
  }
  // 2. at heel while the player walks a circle, then stops and turns on the spot
  if (!ONLY) {
  await set([S[0], S[1], 0], [S[0] - 1, S[1] - 1, 0, 'heel']);
  await gaitIs('walk');
  judge('at heel, walking a circle', await run(150, ['KeyW', 'KeyA'], null));
  judge('at heel, turning on the spot', await run(90, ['KeyD'], null));
  await snap('heel');
  // 3. leading to a place 25 m on, and the player running past him
  await set([S[0], S[1] - 3, 0], null); await gaitIs('run');
  await p.evaluate(S => { const d = window.__dog; d.place(S[0], S[1], Math.PI / 2); d.met(); d.lead([S[0], S[1] + 25], 3); }, S);
  judge('leading, the player running past him', await run(120, ['KeyW'], 0));
  }
  // 4. sitting against a wall, the player pushing into him towards it: he cannot make way, and they stop at his flank
  // (the nearest wall from the light, looking round it: what the walker may not stand on, a step past its last open ground)
  const wall = await p.evaluate(S => { const g = window.__game; let best = null;
    for (let a = 0; a < 16; a++) { const ux = Math.sin(a * Math.PI / 8), uy = Math.cos(a * Math.PI / 8);
      for (let k = 10; k < 200; k++) { const x = S[0] + ux * k * 0.1, y = S[1] + uy * k * 0.1; if (!g.nav.walk(x, y, g.nav.terrain(x, y), true).ok) { const r = (k - 1) * 0.1; if (!best || r < best.r) best = { r, ux, uy }; break; } } }
    return best; }, S);
  if (wall) for (let n = 0; n < WALL_N; n++) {
    if (n) await p.evaluate(() => { const g = window.__game, d = window.__dog; for (let i = 0; i < 60; i++) { g.advance(1 / 30); d.tick(1 / 30); } });
    // he sits against it, side on, and the player walks into him straight at the wall
    const wx = S[0] + wall.ux * (wall.r - 0.3), wy = S[1] + wall.uy * (wall.r - 0.3), a = Math.atan2(wall.ux, wall.uy);
    await set([wx - wall.ux * 3, wy - wall.uy * 3, a], [wx, wy, Math.atan2(wall.ux, -wall.uy), 'sit']);
    await gaitIs('walk');
    const r = await run(90, ['KeyW'], a);
    judge(`sitting against a wall ${wall.r.toFixed(1)} m from the light, pushed into it${WALL_N > 1 ? ` (${n + 1} of ${WALL_N})` : ''}`, r);
    if (!n) await snap('wall');
  } if (!wall) console.log('(no wall within 20 m of the light: the wall case not run)');
  console.log(errors.length ? `${errors.length} page errors` : 'no page errors');
  console.log(fails.length ? `${fails.length} cases with the two bodies in each other` : 'the guide and the player kept out of each other in every case');
  await b.close();
  process.exit(fails.length || errors.length ? 1 : 0);
})();
