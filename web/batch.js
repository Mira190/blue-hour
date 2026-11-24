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
  // Cells that come and go, of one material, in one draw, their vertices the GPU's alone: the buildings round the
  // player (buildings.js put). A cell was a mesh and a draw of its own, 27 to 45 of them in a phone's frame on foot. A
  // BatchedMesh keeps every vertex in the page's memory to add to its buffer, and a phone's cells are 20 MB that it
  // lets go once sent (world.js onCell). So the arena holds one buffer an attribute on the GPU (THREE.GLBufferAttribute,
  // written with bufferSubData as a cell comes, its place given back as it goes, grown by a copy on the GPU when it
  // is full), and draws through three.js's own multi-draw path: the cells the sweep has not hidden (a cell's mesh is
  // kept, undrawn, for the visibility sweep to gate: its layer says whether it is seen) and the frustum of the pass
  // being drawn leaves, their index ranges in one multiDrawElementsWEBGL. Every cell stands where it is, so the
  // batch's matrix is one identity for all of them.
  //   const a = OEBatch.arena(renderer, material, { name }); a.mesh in the scene; slot = a.add(cellMesh); a.remove(slot)
  function arena(renderer, material, opts = {}) {
    const THREE = window.THREE;
    if (off || !THREE || !THREE.GLBufferAttribute || !THREE.BatchedMesh || !renderer || !renderer.getContext) return null;
    let gl = renderer.getContext();
    if (!gl || !gl.copyBufferSubData) return null;
    const TYPES = [[Float32Array, 0x1406], [Int8Array, 0x1400], [Uint8Array, 0x1401], [Int16Array, 0x1402], [Uint16Array, 0x1403], [Uint32Array, 0x1405]];
    const typeOf = arr => { for (const [C, t] of TYPES) if (arr instanceof C) return t; return 0; };
    const CW = 0x8F37, CR = 0x8F36; // (COPY_WRITE_BUFFER, COPY_READ_BUFFER: no vertex array's state is touched by a write)
    // ranges of a buffer, given out first fit and given back joined to their neighbours
    const ranges = cap => { let free = cap ? [[0, cap]] : []; return { cap,
      take(n) { for (let i = 0; i < free.length; i++) if (free[i][1] >= n) { const s = free[i][0]; free[i][0] += n; free[i][1] -= n; if (!free[i][1]) free.splice(i, 1); return s; } return -1; },
      give(s, n) { let i = 0; while (i < free.length && free[i][0] < s) i++; free.splice(i, 0, [s, n]);
        if (i + 1 < free.length && free[i][0] + free[i][1] === free[i + 1][0]) { free[i][1] += free[i + 1][1]; free.splice(i + 1, 1); }
        if (i > 0 && free[i - 1][0] + free[i - 1][1] === free[i][0]) { free[i - 1][1] += free[i][1]; free.splice(i, 1); } },
      grow(nc) { this.give(this.cap, nc - this.cap); this.cap = nc; } }; };
    let lay = null, V = null, I = null, bufs = {}, ibuf = null; // (lay: [{ name, size, type, bytes, normalized }])
    const geo = new THREE.BufferGeometry(), slots = new Set();
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity); geo.boundingBox = new THREE.Box3(new THREE.Vector3(-Infinity, -Infinity, -Infinity), new THREE.Vector3(Infinity, Infinity, Infinity)); // (never asked of the buffers: a cell is culled by its own bounds)
    const mesh = new THREE.Mesh(geo, material);
    const one = new THREE.DataTexture(new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), 4, 1, THREE.RGBAFormat, THREE.FloatType);
    one.needsUpdate = true;
    const which = new THREE.DataTexture(new Uint32Array(64 * 64), 64, 64, THREE.RedIntegerFormat, THREE.UnsignedIntType); // (every cell: matrix 0)
    which.needsUpdate = true;
    Object.assign(mesh, { isBatchedMesh: true, _matricesTexture: one, _indirectTexture: which, _colorsTexture: null, _multiDrawInstances: null,
      _multiDrawStarts: new Int32Array(256), _multiDrawCounts: new Int32Array(256), _multiDrawCount: 0, frustumCulled: false, matrixAutoUpdate: false });
    mesh.name = opts.name || 'cells'; mesh.userData.batched = 0;
    mesh.raycast = () => {}; // (nothing is picked from it: the game picks from its collision world)
    const attach = () => { // the buffers as the geometry's attributes: new ones each time a buffer is another, so that three.js binds them again
      for (const a of lay) { const g = new THREE.GLBufferAttribute(bufs[a.name], a.type, a.size, a.bytes, V.cap); g.normalized = a.normalized; geo.setAttribute(a.name, g); }
      geo.index = new THREE.GLBufferAttribute(ibuf, 0x1405, 1, 4, I.cap);
    };
    const make = bytes => { const b = gl.createBuffer(); gl.bindBuffer(CW, b); gl.bufferData(CW, bytes, gl.STATIC_DRAW); gl.bindBuffer(CW, null); return b; };
    // (an index buffer is one from its first binding: WebGL keeps the two kinds apart, and will not copy one kind into
    // the other. A buffer grown through a copy lost every cell it held: their indices were never copied, and whole
    // blocks of buildings were not drawn. So it is first bound as an index buffer, with no vertex array bound, whose
    // own index binding that would have changed)
    const makeIndex = bytes => { const b = gl.createBuffer(), vao = gl.getParameter(0x85B5); gl.bindVertexArray(null); gl.bindBuffer(0x8893, b); gl.bufferData(0x8893, bytes, gl.STATIC_DRAW); gl.bindBuffer(0x8893, null); gl.bindVertexArray(vao); return b; };
    const regrow = (b, was, now, index = false) => { const n = index ? makeIndex(now) : make(now); gl.bindBuffer(CR, b); gl.bindBuffer(CW, n); gl.copyBufferSubData(CR, CW, 0, 0, was); gl.bindBuffer(CR, null); gl.bindBuffer(CW, null); gl.deleteBuffer(b); return n; };
    const room = (nv, ni) => { // buffers for nv vertices and ni indices more than fit now
      // (a fiftieth over what is asked: the room is the GPU's memory, and a phone's cells are 20 MB of it)
      const vc = Math.ceil((V.cap + nv) * 1.02), ic = Math.ceil((I.cap + ni) * 1.02);
      for (const a of lay) bufs[a.name] = bufs[a.name] ? regrow(bufs[a.name], V.cap * a.size * a.bytes, vc * a.size * a.bytes) : make(vc * a.size * a.bytes);
      ibuf = ibuf ? regrow(ibuf, I.cap * 4, ic * 4, true) : makeIndex(ic * 4);
      V.grow(vc); I.grow(ic); attach(); stats.grown = (stats.grown || 0) + 1;
    };
    const write = s => {
      const g = s.o.geometry;
      for (const a of lay) { gl.bindBuffer(CW, bufs[a.name]); gl.bufferSubData(CW, s.v0 * a.size * a.bytes, g.attributes[a.name].array); }
      const src = g.index.array, idx = new Uint32Array(s.ni); for (let k = 0; k < s.ni; k++) idx[k] = src[k] + s.v0; // (an index counts from its cell's first vertex)
      gl.bindBuffer(CW, ibuf); gl.bufferSubData(CW, s.i0 * 4, idx); gl.bindBuffer(CW, null);
    };
    const used = { v: 0, i: 0 };
    const layout = g => {
      lay = Object.keys(g.attributes).map(name => { const a = g.attributes[name]; return { name, size: a.itemSize, type: a.array ? typeOf(a.array) : 0, bytes: a.array ? a.array.BYTES_PER_ELEMENT : 0, normalized: !!a.normalized }; });
      if (lay.some(a => !a.type)) { lay = null; return false; }
      V = ranges(0); I = ranges(0); return true;
    };
    // a cell's mesh (its geometry indexed, its arrays still the page's): sent, and drawn from now on. null: not one of these
    function add(o) {
      const g = o.geometry, P = g && g.attributes.position;
      if (!P || !P.array || !g.index || !g.index.array) return null;
      if (!lay && !layout(g)) return null;
      for (const a of lay) { const q = g.attributes[a.name]; if (!q || !q.array || q.itemSize !== a.size || typeOf(q.array) !== a.type) return null; }
      const nv = P.count, ni = g.index.count;
      let v0 = V.take(nv), i0 = v0 < 0 ? -1 : I.take(ni);
      if (v0 < 0 || i0 < 0) { if (v0 >= 0) V.give(v0, nv); room(nv, ni); v0 = V.take(nv); i0 = I.take(ni); }
      if (!g.boundingSphere) g.computeBoundingSphere();
      const s = { o, v0, nv, i0, ni, ball: g.boundingSphere.clone() };
      write(s); slots.add(s); used.v += nv; used.i += ni; mesh.userData.batched = slots.size;
      if (slots.size > mesh._multiDrawStarts.length) { mesh._multiDrawStarts = new Int32Array(slots.size * 2); mesh._multiDrawCounts = new Int32Array(slots.size * 2); }
      return s;
    }
    function remove(s) { if (!s || !slots.delete(s)) return; V.give(s.v0, s.nv); I.give(s.i0, s.ni); used.v -= s.nv; used.i -= s.ni; mesh.userData.batched = slots.size; }
    // What is held and not used, given back. A range a cell has left is free for the next cell that fits, but the
    // buffers were never smaller for it: played from the title to frame 7, with the map built round SKY and round
    // Hachiko again, a phone's arena held 25.9 MB for the 20.7 MB of its cells, and frame 7's GPU memory read 251.4 MB
    // over a budget of 250 (main red, 24 November; tools/arena_probe.js). When more than a megabyte and a twenty-fifth
    // of the whole is idle, the cells are moved up together into buffers of their own size: an attribute at a time
    // (the GPU holds one attribute twice for a moment, never the arena twice), each cell's range copied on the GPU,
    // and the indices, which count from their cell's first vertex, read back once, moved by as much as their cell
    // was, and sent again. Called where the cells have just changed (buildings.js put), not in a frame of its own
    function trim(force = false) {
      if (!lay || !slots.size || !gl.getBufferSubData) return false;
      const vb = lay.reduce((n, a) => n + a.size * a.bytes, 0), held = V.cap * vb + I.cap * 4, idle = held - used.v * vb - used.i * 4;
      if (!force && idle < Math.max(1 << 20, held / 25)) return false;
      const vc = Math.ceil(used.v * 1.02) + 16, ic = Math.ceil(used.i * 1.02) + 48;
      const was = new Uint32Array(I.cap); gl.bindBuffer(CR, ibuf); gl.getBufferSubData(CR, 0, was); gl.bindBuffer(CR, null);
      const order = [...slots].sort((a, b) => a.v0 - b.v0), to = new Int32Array(order.length), now = new Uint32Array(ic);
      let v = 0, i = 0;
      order.forEach((s, k) => { to[k] = v; const d = v - s.v0; for (let j = 0; j < s.ni; j++) now[i + j] = was[s.i0 + j] + d; s.i0 = i; v += s.nv; i += s.ni; });
      for (const a of lay) {
        const st = a.size * a.bytes, n = make(vc * st);
        gl.bindBuffer(CR, bufs[a.name]); gl.bindBuffer(CW, n);
        order.forEach((s, k) => gl.copyBufferSubData(CR, CW, s.v0 * st, to[k] * st, s.nv * st));
        gl.bindBuffer(CR, null); gl.bindBuffer(CW, null); gl.deleteBuffer(bufs[a.name]); bufs[a.name] = n;
      }
      order.forEach((s, k) => { s.v0 = to[k]; });
      gl.deleteBuffer(ibuf); ibuf = makeIndex(ic * 4); gl.bindBuffer(CW, ibuf); gl.bufferSubData(CW, 0, now); gl.bindBuffer(CW, null);
      V = ranges(vc); V.take(used.v); I = ranges(ic); I.take(used.i);
      attach(); stats.trimmed = (stats.trimmed || 0) + 1;
      return true;
    }
    // room made once for cells about to come (nv vertices and ni indices in all), not cell by cell
    function reserve(nv, ni, like) {
      if (!lay) { if (!like || !layout(like)) return; }
      const dv = used.v + nv - V.cap, di = used.i + ni - I.cap;
      if (dv > 0 || di > 0) room(Math.max(0, dv), Math.max(0, di));
    }
    // the cells a pass draws: those the sweep has left on the layer every camera sees, inside that pass's frustum
    const fr = new THREE.Frustum(), pm = new THREE.Matrix4();
    const list = camera => {
      pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(mesh.matrixWorld);
      fr.setFromProjectionMatrix(pm, camera.coordinateSystem, camera.reversedDepth);
      const S = mesh._multiDrawStarts, C = mesh._multiDrawCounts; let n = 0;
      let hid = 0, out = 0;
      for (const s of slots) { if (!(s.o.layers.mask & 1) || !s.o.visible) { hid++; continue; } if (!fr.intersectsSphere(s.ball)) { out++; continue; } S[n] = s.i0 * 4; C[n] = s.ni; n++; }
      mesh._multiDrawCount = n; mesh.userData.last = { drawn: n, hidden: hid, out, cells: slots.size };
    };
    mesh.onBeforeRender = (r, scene, camera) => list(camera);
    mesh.onBeforeShadow = (r, object, camera, shadowCamera) => list(shadowCamera);
    // a context that came back: the buffers made again from the cells whose arrays the page still has (a desktop's;
    // a phone's are the GPU's alone and its game loads again: world.js gpuOnly)
    const back = () => {
      if (!lay) return;
      gl = renderer.getContext();
      const all = [...slots].filter(s => s.o.geometry.attributes.position.array && s.o.geometry.index.array);
      bufs = {}; ibuf = null; V = ranges(0); I = ranges(0); slots.clear(); used.v = used.i = 0;
      let nv = 0, ni = 0; for (const s of all) { nv += s.nv; ni += s.ni; }
      room(nv, ni);
      for (const s of all) { s.v0 = V.take(s.nv); s.i0 = I.take(s.ni); write(s); slots.add(s); used.v += s.nv; used.i += s.ni; }
      one.needsUpdate = which.needsUpdate = true;
    };
    if (renderer.domElement && renderer.domElement.addEventListener) renderer.domElement.addEventListener('webglcontextrestored', back);
    mesh.userData.arena = () => ({ cells: slots.size, used: [used.v, used.i], cap: V ? [V.cap, I.cap] : [0, 0], mb: lay ? +(lay.reduce((n, q) => n + V.cap * q.size * q.bytes, I.cap * 4) / 1048576).toFixed(2) : 0, used_mb: lay ? +(lay.reduce((n, q) => n + used.v * q.size * q.bytes, used.i * 4) / 1048576).toFixed(2) : 0, grown: stats.grown || 0, trimmed: stats.trimmed || 0 }); // (for the harnesses: what it holds and what of that is in use)
    stats.batches++;
    return { mesh, add, remove, reserve, trim, slots, info: () => ({ cells: slots.size, vertices: V ? V.cap : 0, indices: I ? I.cap : 0, bytes: lay ? lay.reduce((n, a) => n + V.cap * a.size * a.bytes, I.cap * 4) : 0 }),
      dispose() { for (const k in bufs) gl.deleteBuffer(bufs[k]); if (ibuf) gl.deleteBuffer(ibuf); one.dispose(); which.dispose(); slots.clear(); } };
  }
  return { merge, pool, arena, stats, off };
})();
