// The walk's edge (issue 143): where the level a walker is given ends, and what they meet there.
//
// The owner's bar is a tiny level, finely made, and what cannot be reached costs nothing. So the walk on foot and in
// your car is bounded to the streets that hold (game.walk.bounds.polygon in cities/<city>/city.json: the hero level's
// hundred metres, Center Gai, the fork at 109, the way to SKY GATE), and a walker turns back at something they can
// read, never at nothing:
//   - where a footway leaves the bounds it is closed by what Shibuya closes footways with while its station is
//     rebuilt: a works hoarding of white steel panels across it, from the wall to the kerb, with its notice and, after
//     dark, its red lamps;
//   - a walker in the roadway, where the traffic goes on through, is turned back with a line that says why;
//   - your car is turned round on the road it was leaving by, and set down facing the crossing.
// The helicopter is free of it: the far map is seen from the air. Only on the walk a player is given: the story leads
// by its goals, and the builder's ?walk=1 has no bounds.
//
//   OEEdge.create({ THREE, world, G, nav, roadW })  ->  null where the map sets no bounds, or
//     show(on)             the closures in the world, or out of it
//     tick(x, y)           each frame, where the player is: a closure is laid when they first come within sight of it
//     night(k)             their lamps, by how dark it is (0 to 1)
//     leaves(x0, y0, x, y) whether a step from inside the bounds ends outside them (or too near their edge to stand):
//                          null, or { way: 'foot' | 'road' } by what is crossed there
//     turn(x, y)           for a car at (x, y) past the edge: where to set it down, facing in { x, y, z, h }
//     wall(x, y)           whether a closure stands here (the crowd does not walk through one)
//     runs                 the closures [{ a: [x, y], b: [x, y], out: [x, y] }], for a harness
window.OEEdge = (function () {
  const H = 2.4, PANEL = 0.5, REACH = 7, STAND = 0.45;
  function create({ THREE, world, G, nav, roadW }) {
    const B = G.walk && G.walk.bounds;
    if (!B || !B.polygon || B.polygon.length < 3) return null;
    const P = B.polygon, n = P.length;
    let area = 0;
    for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; area += a[0] * b[1] - b[0] * a[1]; }
    const inside = (x, y) => {
      let c = false;
      for (let i = 0, j = n - 1; i < n; j = i++) { const a = P[i], b = P[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) c = !c; }
      return c;
    };
    const toEdge = (x, y) => { // metres to the nearest edge of the bounds
      let best = Infinity;
      for (let i = 0; i < n; i++) {
        const a = P[i], b = P[(i + 1) % n], ex = b[0] - a[0], ey = b[1] - a[1], u = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / (ex * ex + ey * ey)));
        best = Math.min(best, Math.hypot(a[0] + ex * u - x, a[1] + ey * u - y));
      }
      return best;
    };
    // where each line of the map crosses the edge: [x, y, the edge's own direction there, the way out, the line]
    function crossings(lines) {
      const out = [];
      for (const ln of lines) {
        const p = ln.p;
        for (let k = 0; k + 5 < p.length; k += 3) {
          const ax = p[k] / 10, ay = p[k + 1] / 10, bx = p[k + 3] / 10, by = p[k + 4] / 10;
          if (inside(ax, ay) === inside(bx, by)) continue;
          if (p[k + 2] / 10 - nav.terrain(ax, ay) > 3) continue; // (on a deck over the street: not this ground's way)
          for (let e = 0; e < n; e++) {
            const c = P[e], d = P[(e + 1) % n], ex = d[0] - c[0], ey = d[1] - c[1], den = (bx - ax) * ey - (by - ay) * ex;
            if (Math.abs(den) < 1e-9) continue;
            const t = ((c[0] - ax) * ey - (c[1] - ay) * ex) / den, u = ((c[0] - ax) * (by - ay) - (c[1] - ay) * (bx - ax)) / den;
            if (t < 0 || t > 1 || u < 0 || u > 1) continue;
            const el = Math.hypot(ex, ey), s = area > 0 ? 1 : -1; // (the way out: the edge's normal away from the inside)
            out.push({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t, ex: ex / el, ey: ey / el, ox: s * ey / el, oy: -s * ex / el, ln });
          }
        }
      }
      return out;
    }
    const roads = crossings(G.paths.road), feet = crossings(G.paths.foot.filter(f => f.c !== 'steps'));
    const halfOf = r => (r.ln.cw || roadW[r.ln.c] || 7) / 2;
    // A footway's closure runs along the edge either way from where the footway crosses it, to the wall on one side and
    // the kerb on the other (a road's edge, by the road data), and no further than a footway is wide. It is laid when
    // the walker first comes within sight of it: the walls it ends at are in the collision laid round the player
    const runs = [];
    function lay(f) {
      const z = nav.terrain(f.x, f.y), ends = [];
      for (const s of [-1, 1]) {
        let d = 0;
        for (; d < REACH; d += 0.25) {
          const x = f.x + f.ex * s * (d + 0.25), y = f.y + f.ey * s * (d + 0.25);
          if (nav.solid(x, y, z, 0.15)) { d += 0.25; break; } // (into the wall's face, so no gap is left beside it)
          if (roads.some(r => Math.hypot(r.x - x, r.y - y) < halfOf(r) + 0.2)) break;
        }
        ends.push(d);
      }
      if (ends[0] + ends[1] < 1.5) return null; // (no room for a footway here: the line runs through a wall)
      const a = [f.x - f.ex * ends[0], f.y - f.ey * ends[0]], b = [f.x + f.ex * ends[1], f.y + f.ey * ends[1]];
      // (two footways side by side share one closure)
      if (runs.some(r => Math.hypot(r.a[0] + r.b[0] - a[0] - b[0], r.a[1] + r.b[1] - a[1] - b[1]) / 2 < 2.5)) return null;
      const r = { a, b, out: [f.ox, f.oy], z };
      runs.push(r);
      return r;
    }
    const wall = (x, y) => runs.some(r => {
      const ex = r.b[0] - r.a[0], ey = r.b[1] - r.a[1], u = Math.max(0, Math.min(1, ((x - r.a[0]) * ex + (y - r.a[1]) * ey) / (ex * ex + ey * ey)));
      return Math.hypot(r.a[0] + ex * u - x, r.a[1] + ey * u - y) < 0.7;
    });
    function leaves(x0, y0, x, y) {
      if (!inside(x0, y0) || (inside(x, y) && toEdge(x, y) > STAND)) return null;
      if (toEdge(x, y) >= toEdge(x0, y0) && inside(x, y)) return null; // (walking back in from the edge's margin is free)
      return { way: roads.some(r => Math.hypot(r.x - x, r.y - y) < halfOf(r) + 0.5) ? 'road' : 'foot' };
    }
    function turn(x, y) {
      let best = null, bd = Infinity;
      for (const r of roads) { const d = Math.hypot(r.x - x, r.y - y); if (d < bd) { bd = d; best = r; } }
      if (!best) return null;
      // twelve metres back in along the road, on the side the map keeps to, facing the way it came from
      const keep = (G.keep === 'right' ? -1 : 1) * Math.min(halfOf(best) / 2, 2.2), ix = -best.ox, iy = -best.oy;
      const px = best.x + ix * 12 - iy * keep, py = best.y + iy * 12 + ix * keep;
      return { x: px, y: py, z: nav.terrain(px, py), h: Math.atan2(ix, iy) };
    }

    // ---- the hoardings: one instanced mesh a kind, filled run by run
    let group = null, lampMat = null, kinds = null, shown = false;
    const SEE = 70, MAXP = 420, MAXQ = 110, MAXS = 30;
    function build() {
      group = new THREE.Group();
      group.name = 'walk_edge';
      const mesh = (geo, mat, max) => {
        const im = new THREE.InstancedMesh(geo, mat, max);
        im.count = 0;
        im.castShadow = im.receiveShadow = true;
        im.frustumCulled = false; // (a few dozen boxes round one crossing)
        group.add(im);
        return im;
      };
      lampMat = new THREE.MeshBasicMaterial({ color: 0x200404, fog: true });
      // its notice, on the side a walker comes from
      const cv = document.createElement('canvas');
      cv.width = 512; cv.height = 256;
      const g = cv.getContext('2d'), F = '"Noto Sans JP", "Hiragino Sans", sans-serif';
      g.fillStyle = '#f4f3ee'; g.fillRect(0, 0, 512, 256);
      g.fillStyle = '#1f6a45'; g.fillRect(0, 0, 512, 54);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#f4f3ee'; g.font = '600 30px ' + F; g.fillText('渋谷駅周辺 再開発工事', 256, 28);
      g.fillStyle = '#b3201f'; g.font = '700 64px ' + F; g.fillText('この先 通行止め', 256, 118);
      g.fillStyle = '#23262a'; g.font = '500 26px ' + F; g.fillText('No way through · Station works', 256, 186);
      g.font = '400 20px ' + F; g.fillText('ご迷惑をおかけします', 256, 226);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      kinds = {
        // a flat steel panel, painted white: one colour, its joints the gaps between panels
        panel: mesh(new THREE.BoxGeometry(1, H, 0.03).translate(0, H / 2, 0), new THREE.MeshStandardMaterial({ color: 0xdcdfdd, roughness: 0.5, metalness: 0.1 }), MAXP),
        // the galvanised posts behind it
        post: mesh(new THREE.BoxGeometry(0.06, H + 0.1, 0.06).translate(0, (H + 0.1) / 2, 0), new THREE.MeshStandardMaterial({ color: 0x8e9396, roughness: 0.45, metalness: 0.7 }), MAXQ),
        // the red lamps along its top, lit after dark
        lamp: mesh(new THREE.BoxGeometry(0.07, 0.09, 0.07), lampMat, MAXQ),
        sign: mesh(new THREE.PlaneGeometry(1.2, 0.6), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }), MAXS),
      };
      world.add(group);
    }
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0), S = new THREE.Vector3(), T = new THREE.Vector3();
    const put = (im, x, y, z, yaw, sx = 1) => {
      if (im.count >= im.instanceMatrix.count) return;
      im.setMatrixAt(im.count++, M.compose(T.set(x, z, -y), Q.setFromAxisAngle(UP, yaw), S.set(sx, 1, 1)));
      im.instanceMatrix.needsUpdate = true;
    };
    function dress(r) {
      const len = Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]), ex = (r.b[0] - r.a[0]) / len, ey = (r.b[1] - r.a[1]) / len;
      const k = Math.max(1, Math.round(len / PANEL)), w = len / k, yaw = Math.atan2(ey, ex); // (the box's length along the run: x east, z south)
      for (let i = 0; i < k; i++) put(kinds.panel, r.a[0] + ex * w * (i + 0.5), r.a[1] + ey * w * (i + 0.5), r.z, yaw, w - 0.012);
      const np = Math.max(2, Math.round(len / 2) + 1);
      for (let i = 0; i < np; i++) {
        const u = len * i / (np - 1);
        put(kinds.post, r.a[0] + ex * u + r.out[0] * 0.06, r.a[1] + ey * u + r.out[1] * 0.06, r.z, yaw);
        put(kinds.lamp, r.a[0] + ex * u, r.a[1] + ey * u, r.z + H + 0.06, yaw);
      }
      // (the notice faces in: a plane's front is +z, turned to the way back)
      if (len > 2.6) put(kinds.sign, (r.a[0] + r.b[0]) / 2 - r.out[0] * 0.03, (r.a[1] + r.b[1]) / 2 - r.out[1] * 0.03, r.z + 1.5, Math.atan2(-r.out[0], r.out[1]));
    }
    function tick(px, py) {
      if (!shown) return;
      for (const f of feet) if (!f.laid && Math.hypot(f.x - px, f.y - py) < SEE) { f.laid = true; const r = lay(f); if (r) dress(r); }
    }
    return {
      runs, leaves, turn, wall, inside, tick,
      roads: roads.map(r => [r.x, r.y]),
      feet: feet.map(f => [f.x, f.y]),
      show(on) { if (on && !group) build(); shown = !!on; if (group) group.visible = shown; },
      night(k) { if (lampMat) lampMat.color.setRGB(0.13 + 2.2 * k, 0.02 + 0.1 * k, 0.02 + 0.06 * k); },
    };
  }
  return { create };
})();
