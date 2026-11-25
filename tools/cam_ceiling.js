// The chase camera under a ceiling (issue 208): in a covered place the story or the walk lets you into (the station's
// free passage from Hachiko Square to Miyamasuzaka, frame 4's way to SKY's lift, and the other covered ways), walk it
// both ways a game frame at a time (advance(1/30): a phone's frame rate), turning and dragging the view, at its ends and
// on its steps, and read the camera against what is DRAWN, never the walking grid alone (AGENTS.md: "The walking grid
// is not the picture"): a ray up from your head finds the ceiling you are under; then a ray down from the lens that
// meets a drawn surface over your head means the lens stands over the roof and looks down through it, and the line from
// your head to the lens crossing a drawn surface over your head means it is through the ceiling. Either is a fault.
//   PORT=8800 xvfb-run -a node tools/cam_ceiling.js            (PHONE=1: as a phone; PLACE=passage: one place; AT=x,y,r: the scan in that circle only)
// (A phone lets go of a mesh's arrays once it is on the GPU: those meshes are not read.)
// Exits 1 on a frame with the lens over or through the ceiling, 2 when the page fails.
const { open } = require('./cam_jumps');

// covered places: a way through, walked from its first point to its last and back; z: the floor's height is the
// walking floor's (nav.floorAt) unless given. The passage's bends are scramble.py HACHIKO_EXIT's way.
const PLACES = [
  { id: 'passage', way: [[414.5, -1030.5], [420.2, -1027.8], [424.7, -1023.7], [432.4, -1022.0], [441.0, -1021.1], [446.5, -1020.4]],
    // (and as built, where a phone has let go of what is drawn: scramble.py HACHIKO_EXIT, its bends, its width and its clear
    // height over its floor; a lens inside its corridor higher than that is through its ceiling)
    built: { way: [[420.2, -1027.8], [424.7, -1023.7], [432.4, -1022.0], [441.0, -1021.1]], w: 5.6, h: 3.2 } },
];
// and the class (SCAN=0 leaves it out): every place within these circles where a walker stands under something drawn
// within 5 m over their head (a ray up through what is drawn, not the game's own reading), spots at least 8 m apart,
// each stood at and the view turned and dragged round: the Scramble and Hachiko Square, the passage's ends, frame 5's
// Miyamasu under the Ginza line's station and SKY's lift hall under Scramble Square's skirts
const SCAN = process.env.AT ? [process.env.AT.split(',').map(Number)] : [[368, -1002, 100], [512, -1052, 50], [530.5, -1077, 30]]; // (AT=x,y,r: that circle only)

async function scan(p) {
  return p.evaluate(async SCAN => {
    const g = window.__game, T = window.THREE, rc = new T.Raycaster(), up = new T.Vector3(0, 1, 0), out = [];
    const drawn = [];
    g.world.traverseVisible(o => { if ((o.isMesh || o.isInstancedMesh) && !o.isSkinnedMesh && o.geometry && o.geometry.attributes.position && o.geometry.attributes.position.array && (!o.geometry.index || o.geometry.index.array) && !(o.material && (o.material.transparent || /leaf|tree|foliage/i.test(o.material.name || '')))) drawn.push(o); });
    for (const [cx, cy, R] of SCAN) {
      for (let y = cy - R; y <= cy + R; y += 3) for (let x = cx - R; x <= cx + R; x += 3) {
        if (Math.hypot(x - cx, y - cy) > R) continue;
        const q = g.nav.stand(x, y, g.nav.terrain(x, y) + 1.5, { rMax: 0.4 });
        if (!q || Math.abs(q.z - g.nav.terrain(x, y)) > 3) continue;
        rc.set(new T.Vector3(q.x, q.z + 1.7, -q.y), up); rc.far = 5;
        const h = rc.intersectObjects(drawn, false)[0];
        if (h && out.every(o => Math.hypot(o[0] - q.x, o[1] - q.y) > 8)) out.push([+q.x.toFixed(1), +q.y.toFixed(1), h.object.name]);
      }
      await new Promise(r => setTimeout(r, 0));
    }
    return out;
  }, SCAN);
}

async function run(p, place) {
  return p.evaluate(async place => {
    const g = window.__game, T = window.THREE, rc = new T.Raycaster(), up = new T.Vector3(0, 1, 0), dn = new T.Vector3(0, -1, 0);
    const scene = g.world, bad = [], frames = [];
    // what is drawn: every visible mesh but the people, the cars, the player and the sky (what moves is not a ceiling)
    const drawn = [];
    scene.traverseVisible(o => { if ((o.isMesh || o.isInstancedMesh) && !o.isSkinnedMesh && o.geometry && o.geometry.attributes.position && o.geometry.attributes.position.array && (!o.geometry.index || o.geometry.index.array) && !(o.material && o.material.transparent && o.material.opacity < 0.5)) drawn.push(o); });
    const near = (o, x, y) => { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); const s = o.geometry.boundingSphere.clone().applyMatrix4(o.matrixWorld); return Math.hypot(s.center.x - x, -s.center.z - y) < s.radius + 25; };
    let set = [];
    const hit = (from, dir, far) => { rc.set(from, dir); rc.far = far; const h = rc.intersectObjects(set, false); return h.length ? h[0] : null; };
    const V = (x, y, z) => new T.Vector3(x, z, -y);
    // (a ceiling or a roof lies flat: a wall the line grazes at a bend as the view swings is the walls' business, not this)
    const nW = new T.Vector3(), flat = q => !q.face || Math.abs(nW.copy(q.face.normal).transformDirection(q.object.matrixWorld).y) > 0.7;
    const check = (phase) => {
      const pl = g.player, head = V(pl.x, pl.y, pl.z + 1.7), c = g.camera.position.clone();
      if (place.built) {
        const B = place.built, cx = c.x, cy = -c.z;
        let d = Infinity;
        for (let i = 1; i < B.way.length; i++) { const [ax, ay] = B.way[i - 1], [bx, by] = B.way[i], L2 = (bx - ax) ** 2 + (by - ay) ** 2, t = Math.max(0, Math.min(1, ((cx - ax) * (bx - ax) + (cy - ay) * (by - ay)) / L2)); d = Math.min(d, Math.hypot(ax + (bx - ax) * t - cx, ay + (by - ay) * t - cy)); }
        if (d < B.w / 2 && c.y > pl.z + B.h + 0.05) { frames.push(1); bad.push({ phase, x: +pl.x.toFixed(1), y: +pl.y.toFixed(1), z: +pl.z.toFixed(2), cam: c.toArray().map(v => +v.toFixed(2)), why: `in the passage's corridor ${(c.y - pl.z).toFixed(2)} m over the floor, its ceiling at ${B.h} (as built)` }); return; }
      }
      // the lens behind a wall (issue 217), read with the game's own solids (nav.clearFraction: the buildings' cells, the
      // landmarks, the decks), as the camera reads them: the line from your head to the lens stopped short of it by more than
      // 10 cm (a frame's walk at most: the lens is placed for where you stood when the camera ran, read here after; a wall that
      // near behind the lens lies inside its near plane's 0.3 m and is not in the picture), and not a post or a column the camera looks past on purpose (its own rule, game.js thin: one of the lines beside it
      // stopped too). Under cover or not
      {
        // (from the point the camera aimed from in the frame drawn, game.js camTarget: live.look, less the lift a look up at a
        // landmark adds to its height. Read from your head after the step instead, a lens placed before it stood up to 0.18 m
        // further past a corner than the camera saw, and one frame of main's ride on 04b07bd failed on it, #213)
        const Lv = g.live && g.live.look, tilt = (g.cam && g.cam.tilt) || 0;
        const eye = Lv ? new T.Vector3(Lv.x, Lv.y - (tilt > 0.001 ? Math.tan(tilt) * Math.hypot(c.x - Lv.x, c.z - Lv.z) : 0), Lv.z) : V(pl.x, pl.y, pl.z + 1.55), d = c.clone().sub(eye), L = d.length();
        if (L > 0.6) {
          const sd = new T.Vector3(d.z, 0, -d.x).normalize(), cut = (a, b) => g.nav.clearFraction(a, b) * L < L - 0.1;
          // (the camera's own rule for a post it looks past, game.js thin: a line 0.45 m to the side at your head and 0.6 m at the lens)
          if (cut(eye, c) && [1, -1].some(k => cut(eye.clone().addScaledVector(sd, 0.45 * k), c.clone().addScaledVector(sd, 0.6 * k)))) {
            frames.push(1);
            bad.push({ phase, x: +pl.x.toFixed(1), y: +pl.y.toFixed(1), z: +pl.z.toFixed(2), cam: c.toArray().map(v => +v.toFixed(2)), pull: +(g.cam.pull ?? 1).toFixed(2), why: `behind a wall: ${(L - g.nav.clearFraction(eye, c) * L).toFixed(2)} m of the line past it` });
          }
        }
      }
      const roof = hit(head, up, 8);
      frames.push(1);
      if (!roof) return; // (not under cover: nothing to hold the lens under)
      const ceil = roof.point.y, out = [];
      // the lens over a drawn surface higher than your head: looking down through what you stand under
      const below = hit(c, dn, c.y - pl.z + 0.5);
      if (below && flat(below) && below.point.y > pl.z + 2.0 && below.point.y < c.y - 0.05) out.push(`over a surface ${(below.point.y - pl.z).toFixed(2)} m over the floor (${below.object.name || below.object.parent && below.object.parent.name || '?'})`);
      // the line from your head to the lens through a drawn surface over your head
      const d = c.clone().sub(head), L = d.length();
      if (L > 0.3) {
        rc.set(head, d.normalize()); rc.far = L;
        const h = rc.intersectObjects(set, false).find(q => flat(q) && q.point.y > pl.z + 2.0);
        if (h) out.push(`through a surface at ${(h.point.y - pl.z).toFixed(2)} m (${h.object.name || '?'})`);
      }
      if (c.y > ceil + 0.05 && Math.hypot(c.x - head.x, c.z - head.z) < 1.0) out.push(`over the ceiling right above you (${(c.y - pl.z).toFixed(2)} m, ceiling ${(ceil - pl.z).toFixed(2)})`);
      if (out.length) bad.push({ phase, x: +pl.x.toFixed(1), y: +pl.y.toFixed(1), z: +pl.z.toFixed(2), cam: c.toArray().map(v => +v.toFixed(2)), ceil: +(ceil - pl.z).toFixed(2), lift: +(g.cam.lift || 0).toFixed(2), pull: +(g.cam.pull || 0).toFixed(2), why: out.join('; ') });
    };
    const dt = 1 / 30;
    const go = (x, y, h) => {
      const f = g.nav.floorAt(x, y, g.nav.terrain(x, y) + 1.5) || { z: g.nav.terrain(x, y) };
      g.player.x = x; g.player.y = y; g.player.z = f.z; g.player.h = h;
      Object.assign(g.cam, { mode: 'chase', yaw: h, distTo: 0, yawTo: null, lastInput: -10, snap: true });
    };
    // the far end of the run, then here: the chase camera snaps after a long move
    const w = place.way, a = w[0], b = w[1];
    g.player.x = a[0] + 400; g.advance(0.05);
    go(a[0], a[1], Math.atan2(b[0] - a[0], b[1] - a[1]));
    g.advance(1.5);
    for (let i = 0; i < 40 && g.arriving && g.arriving(); i++) { g.settleArrival(); g.advance(0.1); }
    if (g.cine.active) g.cine.skip();
    go(a[0], a[1], Math.atan2(b[0] - a[0], b[1] - a[1])); g.advance(0.3);
    // the hero levels round the way in and shown (and their fine parts): what the player sees
    for (let i = 0; i < 240; i++) { const H = g.hero && g.hero(), st = H ? H.state() : []; if (st.every(L => L.state !== 'loading' && L.fine !== 'loading')) break; g.advance(0.05); await new Promise(r => setTimeout(r, 250)); }
    go(a[0], a[1], Math.atan2(b[0] - a[0], b[1] - a[1])); g.advance(0.3);
    // (and any hand-over from a shot settled, a story's view blended back to the chase camera, the lens behind your head:
    // a blend from the set-down's shot 40 m off flew in through the station, which is not the chase camera's doing)
    for (let i = 0; i < 120 && (g.cine.active || (g.viewBlend && g.viewBlend.t < 1) || g.camera.position.distanceTo(new T.Vector3(g.player.x, g.player.z + 1.6, -g.player.y)) > 8); i++) { if (g.cine.active) g.cine.skip(); g.advance(0.1); }
    go(a[0], a[1], Math.atan2(b[0] - a[0], b[1] - a[1])); g.advance(0.3);
    scene.traverseVisible(o => { if ((o.isMesh || o.isInstancedMesh) && !o.isSkinnedMesh && o.geometry && o.geometry.attributes.position && o.geometry.attributes.position.array && (!o.geometry.index || o.geometry.index.array) && !drawn.includes(o) && !(o.material && o.material.transparent && o.material.opacity < 0.5)) drawn.push(o); });
    set = drawn.filter(o => w.some(q => near(o, q[0], q[1])));
    // walk the way both ways: steer at each bend towards the next point; turn on the spot and drag the view at each end
    const steer = (tx, ty) => { const want = Math.atan2(tx - g.player.x, ty - g.player.y), d = ((want - g.player.h + 3 * Math.PI) % (2 * Math.PI)) - Math.PI; return Math.abs(d) < 0.12 ? ['KeyW'] : d > 0 ? ['KeyW', 'KeyD'] : ['KeyW', 'KeyA']; };
    const walk = async (pts, phase) => {
      for (const [tx, ty] of pts) {
        for (let k = 0; k < 30 * 25 && Math.hypot(tx - g.player.x, ty - g.player.y) > 1.2; k++) { g.advance(dt, steer(tx, ty)); check(phase); if (k % 30 === 0) await new Promise(r => setTimeout(r, 0)); }
      }
    };
    const spin = (phase) => {
      for (let k = 0; k < 75; k++) { g.advance(dt, ['KeyD']); check(phase + ' turning'); }
      for (let k = 0; k < 60; k++) { g.cam.yaw += 0.05; g.cam.lastInput = g.clockT; g.advance(dt); check(phase + ' dragging round'); }
      for (let k = 0; k < 30; k++) { g.cam.pitch = Math.min(1.2, g.cam.pitch + 0.03); g.advance(dt); check(phase + ' dragging up'); }
      g.cam.pitch = 0.17;
      for (let k = 0; k < 45; k++) { g.advance(dt); check(phase + ' let go'); }
    };
    if (place.spot) { spin('stood'); return { frames: frames.length, bad, meshes: set.length, levels: [] }; }
    await walk(w.slice(1), 'in');
    spin('far end');
    if (place.quick) return { frames: frames.length, bad, meshes: set.length, levels: [] }; // (quick: in, and the far end's turn and drag)
    await walk(w.slice(0, -1).reverse(), 'back');
    spin('near end');
    // and the middle, stood still with the view swung round
    const m = w[Math.floor(w.length / 2)];
    go(m[0], m[1], 0); g.advance(0.5);
    spin('middle');
    return { frames: frames.length, bad, meshes: set.length, levels: (g.G.hero || []).filter(h => h.ceilCells != null).map(h => `${h.id} ${h.ceilCells} cells ${h.ceilMs} ms`) };
  }, place);
}

if (require.main === module) (async () => {
  const { b, p } = await open('shibuya', { width: 1440, height: 900 });
  let fails = 0;
  const places = PLACES.filter(q => !process.env.PLACE || q.id === process.env.PLACE);
  for (const q of (process.env.SPOT || '').split(';').filter(Boolean)) { const [x, y] = q.split(',').map(Number); places.push({ id: `at ${x},${y}`, spot: true, way: [[x, y], [x, y + 1]] }); } // (SPOT=x,y;x,y: stood there, as a scanned spot)
  if (process.env.SCAN !== '0' && !process.env.PLACE && !process.env.SPOT) {
    const spots = (await scan(p)).slice(0, +(process.env.SPOTS || 16));
    console.log(`scan: ${spots.length} covered spots: ${spots.map(q => `${q[0]},${q[1]} (${q[2]})`).join('; ')}`);
    for (const [x, y, what] of spots) places.push({ id: `under ${what} at ${x},${y}`, spot: true, way: [[x, y], [x, y + 1]] });
  }
  for (const place of places) {
    const r = await run(p, place);
    console.log(`${place.id}${process.env.PHONE ? ' (phone)' : ''}: ${r.frames} frames over ${r.meshes} meshes, ${r.bad.length} with the lens over or through the ceiling`);
    if (r.levels.length) console.log(`  ceilings read from the levels: ${r.levels.join(', ')}`);
    const by = {};
    for (const f of r.bad) { const k = f.phase + ': ' + f.why.replace(/[-\d.]+/g, '#'); (by[k] = by[k] || []).push(f); }
    for (const [k, l] of Object.entries(by)) console.log(`  ${l.length} x ${k}\n     e.g. ${JSON.stringify(l[0])}`);
    fails += r.bad.length;
  }
  await b.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

module.exports = { run, PLACES };
