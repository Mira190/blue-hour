// The rails, fences, bollards and posts as they are drawn (issue 208: the car that came for you drove through a railing),
// for a harness to hold a car against: the guard rails and posts the hero levels draw (their metal_guard and metal_pole
// meshes, the levels' own triangles, never the walking grid's), sampled every 0.2 m along their triangles' edges between
// 0.15 and 1.3 m over the floor under them (a car's body; a sign's arm overhead is not met), in 1 m cells.
//   const { railsInPage } = require('./rails_drawn'); await page.evaluate(railsInPage);
//   then in the page: __rails.levels() (reads the levels shown since the last call), __rails.inBox(x, y, z, h, half, hw)
//   -> the first point inside that box [x, y, height over z] or null, __rails.across(ax, ay, bx, by, z) -> the points within
//   0.12 m of that line (rails and fences: a post beside a door is walked round), __rails.points(), __rails.selfTest() -> null, or what is wrong (no points read, or a box laid over a
//   point that does not find it).
function railsInPage() {
  const g = window.__game, THREE = window.THREE, RC = 1, rk = (i, j) => i * 1000003 + j, RP = new Map(), seen = new Set();
  let n = 0;
  const read = root => {
    const v = new THREE.Vector3(), P = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    root.updateMatrixWorld(true);
    root.traverse(o => {
      const nm = `${o.name} ${(o.material && o.material.name) || ''}`;
      if (!o.isMesh || !o.geometry || !/metal_(guard|pole)|bollard|fence/i.test(nm)) return;
      const rail = /metal_guard|fence/i.test(nm) ? 1 : 0; // (a rail or a fence; else a post: across() asks for rails alone)
      const pos = o.geometry.attributes.position, idx = o.geometry.index;
      // (a level's squares of one material are one BatchedMesh, batch.js: each square's triangles by its own matrix)
      const parts = o.isBatchedMesh ? o._instanceInfo.map((q, i) => (q && q.active !== false ? i : -1)).filter(i => i >= 0).map(i => {
        const r = o.getGeometryRangeAt(o.getGeometryIdAt(i)), M = new THREE.Matrix4();
        o.getMatrixAt(i, M); return { M: M.premultiply(o.matrixWorld), a: idx ? r.indexStart : r.vertexStart, c: idx ? r.indexCount : r.vertexCount };
      }) : [{ M: o.matrixWorld, a: 0, c: idx ? idx.count : pos.count }];
      for (const { M, a: t0, c } of parts) for (let t = t0; t + 2 < t0 + c; t += 3) {
        for (let k = 0; k < 3; k++) P[k].fromBufferAttribute(pos, idx ? idx.getX(t + k) : t + k).applyMatrix4(M);
        for (let k = 0; k < 3; k++) {
          const a = P[k], b = P[(k + 1) % 3], m = Math.max(1, Math.ceil(a.distanceTo(b) / 0.2));
          for (let i = 0; i < m; i++) {
            v.lerpVectors(a, b, i / m);
            const x = v.x, y = -v.z, z = v.y, f = g.nav.floorAt(x, y, z + 0.2), gz = f ? f.z : g.nav.terrain(x, y);
            if (z < gz + 0.15 || z > gz + 1.3) continue;
            const key = rk(Math.floor(x / RC), Math.floor(y / RC)), l = RP.get(key);
            if (l) l.push(x, y, z, rail); else RP.set(key, [x, y, z, rail]);
            n++;
          }
        }
      }
    });
  };
  const levels = () => { const H = g.hero && g.hero(); if (H) for (const L of H.levels) if (L.root && !seen.has(L.root)) { seen.add(L.root); read(L.root); } };
  const inBox = (cx, cy, cz, h, half, hw) => {
    const fx = Math.sin(h), fy = Math.cos(h), R = Math.hypot(half, hw);
    for (let i = Math.floor((cx - R) / RC); i <= Math.floor((cx + R) / RC); i++) for (let j = Math.floor((cy - R) / RC); j <= Math.floor((cy + R) / RC); j++) {
      const l = RP.get(rk(i, j));
      if (l) for (let k = 0; k < l.length; k += 4) {
        const dx = l[k] - cx, dy = l[k + 1] - cy;
        if (Math.abs(l[k + 2] - cz) > 2 || Math.abs(dx * fx + dy * fy) > half || Math.abs(-dx * fy + dy * fx) > hw) continue;
        return [+l[k].toFixed(2), +l[k + 1].toFixed(2), +(l[k + 2] - cz).toFixed(2)];
      }
    }
    return null;
  };
  const across = (ax, ay, bx, by, z) => {
    const out = [], L = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / L, uy = (by - ay) / L;
    for (let i = Math.floor((Math.min(ax, bx) - 1) / RC); i <= Math.floor((Math.max(ax, bx) + 1) / RC); i++) for (let j = Math.floor((Math.min(ay, by) - 1) / RC); j <= Math.floor((Math.max(ay, by) + 1) / RC); j++) {
      const l = RP.get(rk(i, j));
      if (l) for (let k = 0; k < l.length; k += 4) { const dx = l[k] - ax, dy = l[k + 1] - ay, u = dx * ux + dy * uy; if (l[k + 3] && u > 0 && u < L && Math.abs(-dx * uy + dy * ux) < 0.12 && Math.abs(l[k + 2] - z) < 2) out.push([+l[k].toFixed(2), +l[k + 1].toFixed(2)]); }
    }
    return out;
  };
  const selfTest = () => {
    levels();
    if (!n) return 'no rail read from any hero level';
    for (const l of RP.values()) { if (!l[3]) continue; const x = l[0], y = l[1], z = l[2] - 0.6; if (!inBox(x + 0.5, y - 0.3, z, 0.4, 2.2, 0.9)) return `a box over the rail point at ${x.toFixed(1)}, ${y.toFixed(1)} did not find it`; if (!across(x - 1, y - 0.05, x + 1, y + 0.05, z).length) return `a line across ${x.toFixed(1)}, ${y.toFixed(1)} did not find it`; return null; }
    return null;
  };
  window.__rails = { levels, inBox, across, points: () => n, selfTest };
}
module.exports = { railsInPage };
