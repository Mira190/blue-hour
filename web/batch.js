// Many meshes of one material, submitted as one draw (docs/PERFORMANCE.md, "Draws: one a material, not one a square").
// A model cut into squares for the frustum's sake is a mesh per material and square, and each mesh is a draw call with
// its binds and uniforms: on an iPhone and in a Mac's Safari every one of them crosses to the GPU process. Here the
// meshes under a root that share a material become one three.js BatchedMesh (MIT): their vertices in one buffer, each
// square still left out by the frustum on its own bounds, and what is left drawn by one multiDrawElementsWEBGL
// (WEBGL_multi_draw: every iOS Safari from 15, and Chrome; where it is missing three.js draws them one by one, as
// before). The picture is the same triangles through the same material: nothing is merged across materials, and a
// square's own matrix (a meshopt-packed position is in its node's units) is kept as its instance's.
//   OEBatch.merge(root, { name: m => string, skip: o => bool, min: 2 }) -> the batches made (the meshes they replace
//   are taken out of the tree and their geometry let go). ?batch=off: every mesh as it was.
window.OEBatch = (function () {
  const off = /[?&]batch=off\b/.test(location.search);
  const stats = { batches: 0, meshes: 0 };
  // what must agree for two geometries to share a buffer: the attributes, their sizes and their arrays' kinds
  const sig = g => {
    const a = g.attributes, ks = Object.keys(a).sort();
    return `${g.index ? 'i' : '-'}|${ks.map(k => `${k}:${a[k].itemSize}${a[k].normalized ? 'n' : ''}${(a[k].isInterleavedBufferAttribute ? a[k].data.array : a[k].array).constructor.name}`).join(',')}`;
  };
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
        for (const o of s) b.setMatrixAt(b.addInstance(b.addGeometry(o.geometry)), rel.multiplyMatrices(inv, o.matrixWorld));
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
  return { merge, stats, off };
})();
