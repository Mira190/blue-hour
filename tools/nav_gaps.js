// What is drawn but not solid where a camera goes (issue 231): the planner of a shot and the chase camera keep the lens off
// what the game's own solids hold (nav.clearFraction: the buildings' cells, the landmarks, the decks, a level's walls), and
// a surface drawn there and not held is invisible to them. Frame 4's lift ride read `clear: 1` with the lens a few metres
// from the station's curved glazed vault beside SKY GATE, which filled a phone's tall frame.
//
// At each point (the camera's places: a shot's logged samples, the story's places at a camera's height) rays go out in 16
// bearings and 5 pitches, up to REACH m, against what is drawn (every visible mesh of the hero levels and the city, its own
// triangles) and against nav (clearFraction along the same ray). A drawn hit nav does not stop within 0.5 m of it is a gap:
// printed by mesh, with the nearest point and how far nav reaches past it. Exits 1 when there is a gap.
//   PORT=8800 xvfb-run -a node tools/nav_gaps.js                 (POINTS="x,y,z;x,y,z" game coordinates; REACH=8)
// Without POINTS: frame 4's lift ride's logged camera samples (tools/story_play.js "frame 4 lift ride") and the hall.
'use strict';
const { open } = require('./cam_jumps');
const POINTS = (process.env.POINTS || '533.7,-1076.8,18.3;534.2,-1072,27.8;528,-1069,40;521.2,-1065.6,63.1;530,-1077,17')
  .split(';').filter(Boolean).map(q => q.split(',').map(Number));
const REACH = +(process.env.REACH || 8);
(async () => {
  const { b, p } = await open('shibuya', { width: 800, height: 500 });
  // (the hero levels round the points in and their fine parts: what is drawn there)
  await p.evaluate(async P => {
    const g = window.__game, [x, y] = P[0];
    g.player.x = x; g.player.y = y; g.player.z = g.nav.terrain(x, y); g.advance(0.3);
    for (let i = 0; i < 240; i++) { const H = g.hero && g.hero(), st = H ? H.state() : []; if (st.length && st.every(L => L.state !== 'loading' && L.fine !== 'loading')) break; g.advance(0.05); await new Promise(r => setTimeout(r, 250)); }
  }, POINTS);
  const R = await p.evaluate(([P, REACH]) => {
    const g = window.__game, T = window.THREE, rc = new T.Raycaster(), V = (x, y, z) => new T.Vector3(x, z, -y), out = new Map();
    const drawn = [];
    g.world.traverseVisible(o => { if ((o.isMesh || o.isInstancedMesh) && !o.isSkinnedMesh && !o.isSprite && o.geometry && o.geometry.attributes.position && o.geometry.attributes.position.array && (!o.geometry.index || o.geometry.index.array)) drawn.push(o); });
    const near = (o, c) => { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); const s = o.geometry.boundingSphere.clone().applyMatrix4(o.matrixWorld); return s.center.distanceTo(c) < s.radius + REACH; };
    let rays = 0;
    for (const [x, y, z] of P) {
      const c = V(x, y, z), set = drawn.filter(o => near(o, c));
      for (let pi = -2; pi <= 2; pi++) for (let k = 0; k < 16; k++) {
        const a = k * Math.PI / 8, e = pi * 0.35, d = new T.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e));
        rc.set(c, d); rc.far = REACH; rays++;
        const h = rc.intersectObjects(set, false)[0];
        if (!h) continue;
        if (h.face && Math.abs(h.face.normal.clone().transformDirection(h.object.matrixWorld).y) > 0.7) continue; // (a floor or a roof is no wall: the camera's clamps keep it over the ground)
        const f = g.nav.clearFraction(c, c.clone().addScaledVector(d, REACH)) * REACH; // (how far the solids let the line go)
        if (f < h.distance + 0.5) continue; // (held: nav stops the line at the drawn surface, or before it)
        const o = h.object, name = o.name || (o.parent && o.parent.name) || o.type, key = name;
        const q = out.get(key) || { mesh: name, n: 0, nearest: Infinity, at: null, from: null, past: 0 };
        q.n++; if (h.distance < q.nearest) { q.nearest = +h.distance.toFixed(2); q.at = [h.point.x, -h.point.z, h.point.y].map(v => +v.toFixed(1)); q.from = [x, y, z]; q.past = +(f - h.distance).toFixed(1); }
        out.set(key, q);
      }
    }
    return { rays, gaps: [...out.values()].sort((a, b) => a.nearest - b.nearest) };
  }, [POINTS, REACH]);
  console.log(`nav gaps: ${POINTS.length} points, ${R.rays} rays to ${REACH} m; ${R.gaps.length} drawn surface(s) the solids do not hold`);
  for (const q of R.gaps.slice(0, 30)) console.log(`  ${q.mesh}: ${q.n} ray(s), nearest ${q.nearest} m at ${q.at} from ${q.from}; nav lets the line on ${q.past} m past it`);
  await b.close();
  process.exit(R.gaps.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
