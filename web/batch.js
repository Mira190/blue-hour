// Many meshes of one material, submitted as one draw (docs/PERFORMANCE.md, "Draws: one a material, not one a square").
// A model cut into squares for the frustum's sake is a mesh per material and square, and each mesh is a draw call with
// its binds and uniforms: on an iPhone and in a Mac's Safari every one of them crosses to the GPU process. Here the
// meshes under a root that share a material become one three.js BatchedMesh (MIT): their vertices in one buffer, each
// square still left out by the frustum on its own bounds, and what is left drawn by one multiDrawElementsWEBGL
// (WEBGL_multi_draw: every iOS Safari from 15, and Chrome; where it is missing three.js draws them one by one, as
// before). The picture is the same triangles through the same material: nothing is merged across materials, and a
// square's own matrix (a meshopt-packed position is in its node's units) is kept as its instance's.
//   OEBatch.merge(root, { name: m => string, skip: o => bool, min: 2, pack: true, unit: ['_bake'] }) -> the batches made (the meshes they replace
//   are taken out of the tree and their geometry let go). ?batch=off: every mesh as it was.
window.OEBatch = (function () {
  const off = /[?&]batch=off\b/.test(location.search);
  const stats = { batches: 0, meshes: 0 };
  // what must agree for two geometries to share a buffer: the attributes, their sizes and their arrays' kinds
  const sig = g => {
    const a = g.attributes, ks = Object.keys(a).sort();
    return `${g.index ? 'i' : '-'}|${ks.map(k => `${k}:${a[k].itemSize}${a[k].normalized ? 'n' : ''}${(a[k].isInterleavedBufferAttribute ? a[k].data.array : a[k].array).constructor.name}`).join(',')}`;
  };
  // A batch holds its whole model's vertices on the GPU from its first draw, where the meshes it replaces were sent one
  // by one as each was first seen: so its vertices are packed as they go in (opts.pack). A normal in three 16-bit
  // numbers (a float's twelve bytes in six: a part in 32,767, renormalised by the shader), and an attribute named in
  // opts.unit whose values all lie in 0..1 (a hero level's baked light) in 16 bits each
  function packer(geos, unit) {
    const THREE = window.THREE, ok = new Set();
    for (const k of unit) {
      let fits = true;
      for (const g of geos) { const a = g.attributes[k]; if (!a || !(a.array instanceof Float32Array) || a.isInterleavedBufferAttribute) { fits = false; break; } const A = a.array; for (let i = 0; i < A.length; i++) if (!(A[i] >= 0 && A[i] <= 1)) { fits = false; break; } if (!fits) break; }
      if (fits) ok.add(k);
    }
    const nrm = geos.every(g => g.attributes.normal && g.attributes.normal.array instanceof Float32Array && !g.attributes.normal.isInterleavedBufferAttribute);
    if (!nrm && !ok.size) return g => g;
    return g => {
      const q = new THREE.BufferGeometry();
      q.setIndex(g.index); q.boundingBox = g.boundingBox; q.boundingSphere = g.boundingSphere;
      for (const [k, a] of Object.entries(g.attributes)) {
        if (k === 'normal' && nrm) { const A = a.array, B = new Int16Array(A.length); for (let i = 0; i < A.length; i++) B[i] = Math.round(Math.max(-1, Math.min(1, A[i])) * 32767); q.setAttribute(k, new THREE.BufferAttribute(B, 3, true)); }
        else if (ok.has(k)) { const A = a.array, B = new Uint16Array(A.length); for (let i = 0; i < A.length; i++) B[i] = Math.round(A[i] * 65535); q.setAttribute(k, new THREE.BufferAttribute(B, a.itemSize, true)); }
        else q.setAttribute(k, a);
      }
      return q;
    };
  }
  function merge(root, opts = {}) {
    const THREE = window.THREE, made = [];
    if (off || !THREE || !THREE.BatchedMesh) return made;
    const min = opts.min || 2, sets = new Map(), inv = new THREE.Matrix4(), rel = new THREE.Matrix4();
    root.updateMatrixWorld(true);
    root.traverse(o => {
      if (!o.isMesh || o.isBatchedMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.material || Array.isArray(o.material) || o.children.length) return;
      const g = o.geometry;
      if (!g || !g.attributes.position || (g.morphAttributes && Object.keys(g.morphAttributes).length) || (g.groups && g.groups.length > 1)) return;
      if (g.drawRange.start !== 0 || g.drawRange.count !== Infinity) return;
      if (o.matrixWorld.determinant() < 0) return; // (a mirrored node: its winding is its own)
      if (opts.skip && opts.skip(o)) return;
      const k = [o.material.uuid, o.castShadow ? 1 : 0, o.receiveShadow ? 1 : 0, o.renderOrder, o.layers.mask, o.visible ? 1 : 0, sig(g)].join('|');
      let s = sets.get(k); if (!s) sets.set(k, s = []);
      s.push(o);
    });
    inv.copy(root.matrixWorld).invert();
    for (const s of sets.values()) {
      if (s.length < min) continue;
      let nv = 0, ni = 0;
      for (const o of s) { nv += o.geometry.attributes.position.count; ni += o.geometry.index ? o.geometry.index.count : 0; }
      const first = s[0], m = first.material;
      let b;
      try {
        b = new THREE.BatchedMesh(s.length, nv, Math.max(ni, 3), m);
        const lean = opts.pack ? packer(s.map(o => o.geometry), opts.unit || []) : g => g;
        for (const o of s) b.setMatrixAt(b.addInstance(b.addGeometry(lean(o.geometry))), rel.multiplyMatrices(inv, o.matrixWorld));
      } catch (e) { console.warn('batch:', m.name, e); if (b) b.dispose(); continue; } // (left as they were)
      b.name = opts.name ? opts.name(m, first) : m.name || 'batch';
      b.castShadow = first.castShadow; b.receiveShadow = first.receiveShadow; b.renderOrder = first.renderOrder; b.layers.mask = first.layers.mask; b.visible = first.visible;
      // (the squares of an opaque material need no order among themselves; a pane's are drawn far to near, as they were)
      b.sortObjects = !!m.transparent; b.perObjectFrustumCulled = true;
      b.userData.batched = s.length;
      b.computeBoundingBox(); b.computeBoundingSphere();
      b.matrixAutoUpdate = false; b.updateMatrix();
      root.add(b); b.updateMatrixWorld(true);
      for (const o of s) { if (o.parent) o.parent.remove(o); o.geometry.dispose(); }
      made.push(b); stats.batches++; stats.meshes += s.length;
    }
    return made;
  }
  // Things that move, of one material and several shapes, in one draw: a pool of `cap` places, each given a shape and a
  // matrix a frame (a train's cars: three bodies, each near and far, in one material's draw, each car culled by itself).
  //   const p = OEBatch.pool(material, geometries, cap); p.begin(); p.put(k, matrix) ...; p.end();   null: not here
  function pool(material, geos, cap) {
    const THREE = window.THREE;
    if (off || !THREE || !THREE.BatchedMesh || !geos.length) return null;
    if (new Set(geos.map(sig)).size > 1) return null;
    let nv = 0, ni = 0;
    for (const g of geos) { nv += g.attributes.position.count; ni += g.index ? g.index.count : 0; }
    let b, ids;
    try {
      b = new THREE.BatchedMesh(cap, nv, Math.max(ni, 3), material);
      ids = geos.map(g => b.addGeometry(g));
      for (let i = 0; i < cap; i++) b.setVisibleAt(b.addInstance(ids[0]), false);
    } catch (e) { console.warn('batch pool:', material.name, e); if (b) b.dispose(); return null; }
    b.frustumCulled = false; b.perObjectFrustumCulled = true; b.sortObjects = !!material.transparent; b.visible = false;
    b.userData.batched = cap;
    const at = new Int32Array(cap).fill(0); let n = 0, shown = 0;
    stats.batches++;
    return { mesh: b, begin() { n = 0; },
      put(k, matrix) { if (n >= cap) return false; if (at[n] !== k) { b.setGeometryIdAt(n, ids[k]); at[n] = k; } b.setMatrixAt(n, matrix); if (n >= shown) b.setVisibleAt(n, true); n++; return true; },
      end() { for (let i = n; i < shown; i++) b.setVisibleAt(i, false); shown = n; b.visible = n > 0; } };
  }
  return { merge, pool, stats, off };
})();
