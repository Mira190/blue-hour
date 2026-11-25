// Blue Hour: a model's vertices at the size the picture needs (issue 130, "geometry quantised").
//
// The models' files keep every vertex attribute as 32-bit floats, so that the code that reads a geometry reads it
// as it always did (pipeline/meshopt_glb.mjs). The GPU does not need them so: a unit normal is three signed bytes
// (half a degree, and exact along an axis, which is what a street's walls and paving are), a baked light is a
// half float, a skin's weights are sixteen bits each, a colour is a byte a channel. Sent as floats, a hero level's
// vertex was 48 bytes of which 20 said nothing the picture shows. This rewrites the attributes a caller names,
// after its own code has read them and before the geometry is first drawn, so the float copy never reaches the
// GPU: a third of a level's vertex memory on every device, with the same download.
//
//   OEVerts.lean(geometry, { normal: 'unit8', _bake: 'half', skinWeight: 'unorm16', color: 'unorm8' })
//       'unit8'    a unit vector of three: signed bytes, normalised, in rows of four (a vertex buffer's stride is a
//                  multiple of four bytes on Metal, which is every Apple GPU: three in a row are converted on the CPU there)
//       'half'     half floats, whatever their range (a baked light runs past 1)
//       'unorm8'   values in 0..1: a byte each, normalised; three to a vertex in rows of four
//       'unorm16'  values in 0..1: sixteen bits each, normalised (a skin's four weights still sum to 1 within 1/65535)
//     An attribute that is not there, is not floats (but for a colour in sixteen bits, taken down to eight), has
//     shapes of its own (morph targets move a normal as floats) or would not fit its kind (a value outside 0..1,
//     a vector that is not a unit) is left as it was. Returns the bytes saved.
//   OEVerts.leanObject(root, spec)   every mesh's geometry under root, each once
//   OEVerts.row(geometry, [['tone', 'byte'], ['part', 'byte'], ['ao', 'unorm']])
//                                    up to four one-float attributes as one row of four bytes: 'byte' a whole number
//                                    0..255 the shader reads as a float, 'unorm' a value in 0..1
//   OEVerts.compact(geometry)        the vertices its index does not use dropped (a model drawn by a lighter index
//                                    over the same vertices, pipeline/lod_index.mjs, still held all of them)
//   OEVerts.stats                    { geos, before, after } in bytes, for the tools
//   ?verts=raw                       leaves everything as the file has it, to compare
(function () {
  'use strict';
  const RAW = /[?&]verts=raw/.test(location.search);
  const stats = { geos: 0, before: 0, after: 0 };
  const bytes = a => (a.isInterleavedBufferAttribute ? a.count * a.data.stride * a.data.array.BYTES_PER_ELEMENT : a.array.byteLength);
  // rows of four bytes holding n to a vertex, as an attribute three.js reads n from
  function rows(T, arr, n, normalized, name) {
    const a = new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(arr, 4), n, 0, normalized);
    a.name = name;
    return a;
  }
  const KIND = {
    unit8(a) {
      if (a.itemSize !== 3) return null;
      const n = a.count, out = new Int8Array(n * 4);
      for (let i = 0; i < n; i++) {
        const x = a.getX(i), y = a.getY(i), z = a.getZ(i), l = Math.hypot(x, y, z);
        if (!(l > 0.5 && l < 1.5)) { if (l < 1e-6) continue; return null; } // (not a unit vector: not a normal as this reads one; none at all: left at zero, as it was)
        out[4 * i] = Math.round(x / l * 127); out[4 * i + 1] = Math.round(y / l * 127); out[4 * i + 2] = Math.round(z / l * 127);
      }
      return rows(Int8Array, out, 3, true, a.name);
    },
    half(a) {
      const src = a.array, out = new Uint16Array(src.length), h = THREE.DataUtils.toHalfFloat;
      for (let i = 0; i < src.length; i++) { const v = src[i]; if (!(Math.abs(v) < 65000)) return null; out[i] = h(v); }
      const b = new THREE.Float16BufferAttribute(out, a.itemSize);
      b.name = a.name;
      return b;
    },
    unorm8(a) {
      const n = a.count, k = a.itemSize, four = k === 3 ? 4 : k, out = new Uint8Array(n * four);
      if (k !== 3 && k !== 4) return null;
      // (read straight from their array, as getComponent reads them: floats as they are, sixteen bits scaled to 0..1 by the
      // same division three.js makes. Read through getComponent, the loop was thrown out of its optimised code on each
      // call, 44 times as the player's car was built (0.7 µs a vertex): tools/deopt_survey.js, issue 220; the bytes the
      // same, tools/verts_same.js)
      const src = a.array, f32 = src instanceof Float32Array && !a.normalized, u16 = src instanceof Uint16Array && a.normalized;
      if (f32 || u16) {
        for (let i = 0, j = 0; i < n; i++, j += k) for (let c = 0; c < k; c++) {
          const v = f32 ? src[j + c] : src[j + c] / 65535;
          if (!(v >= -1e-4 && v <= 1.0001)) return null;
          out[four * i + c] = Math.round(Math.min(1, Math.max(0, v)) * 255);
        }
      } else for (let i = 0; i < n; i++) for (let c = 0; c < k; c++) {
        const v = a.getComponent(i, c);
        if (!(v >= -1e-4 && v <= 1.0001)) return null;
        out[four * i + c] = Math.round(Math.min(1, Math.max(0, v)) * 255);
      }
      if (k === 3) return rows(Uint8Array, out, 3, true, a.name);
      const b = new THREE.BufferAttribute(out, 4, true);
      b.name = a.name;
      return b;
    },
    unorm16(a) {
      if (a.itemSize !== 2 && a.itemSize !== 4) return null;
      const src = a.array, out = new Uint16Array(src.length);
      for (let i = 0; i < src.length; i++) { const v = src[i]; if (!(v >= -1e-4 && v <= 1.0001)) return null; out[i] = Math.round(Math.min(1, Math.max(0, v)) * 65535); }
      const b = new THREE.BufferAttribute(out, a.itemSize, true);
      b.name = a.name;
      return b;
    },
  };
  function lean(g, spec) {
    if (RAW || !g || !g.attributes || !window.THREE || !THREE.InterleavedBuffer || g.userData.oeLean) return 0;
    let saved = 0, all = 0;
    for (const k in g.attributes) all += bytes(g.attributes[k]);
    for (const name in spec) {
      const a = g.attributes[name], kind = spec[name];
      if (!a || !KIND[kind] || a.isInterleavedBufferAttribute || a.isInstancedBufferAttribute || !a.array) continue;
      if (g.morphAttributes && g.morphAttributes[name] && g.morphAttributes[name].length) continue;
      const floats = a.array instanceof Float32Array, wide = kind === 'unorm8' && a.array instanceof Uint16Array && a.normalized;
      if (!floats && !wide) continue;
      const b = KIND[kind](a);
      if (!b) continue;
      if (!saved) g.dispose(); // (what the GPU held of it, if it was drawn before: sent again as it is now)
      saved += bytes(a) - bytes(b);
      g.setAttribute(name, b);
    }
    if (saved) { g.userData.oeLean = true; stats.geos++; stats.before += all; stats.after += all - saved; }
    return saved;
  }
  // up to four numbers a vertex (each an attribute of one float) as one row of four bytes: 'byte' a small whole number
  // 0..255 the shader reads as a float (a part's number), 'unorm' a value in 0..1
  function row(g, list) {
    if (RAW || !g || !g.attributes || !window.THREE || !THREE.InterleavedBuffer || list.length > 4) return 0;
    const src = list.map(([name]) => g.attributes[name]);
    if (src.some(a => !a || a.itemSize !== 1 || !(a.array instanceof Float32Array) || a.isInstancedBufferAttribute || a.count !== src[0].count)) return 0;
    const n = src[0].count, out = new Uint8Array(n * 4);
    for (let k = 0; k < list.length; k++) {
      const A = src[k].array, unorm = list[k][1] === 'unorm';
      for (let i = 0; i < n; i++) {
        const v = A[i];
        if (unorm ? !(v >= -1e-4 && v <= 1.0001) : !(v >= 0 && v <= 255 && v === Math.round(v))) return 0;
        out[4 * i + k] = unorm ? Math.round(Math.min(1, Math.max(0, v)) * 255) : v;
      }
    }
    g.dispose(); // (what the GPU held of it, if it was drawn before: sent again as it is now)
    const buf = new THREE.InterleavedBuffer(out, 4);
    let before = 0;
    list.forEach(([name, kind], k) => { before += src[k].array.byteLength; const a = new THREE.InterleavedBufferAttribute(buf, 1, k, kind === 'unorm'); a.name = name; g.setAttribute(name, a); });
    stats.before += before; stats.after += out.byteLength;
    return before - out.byteLength;
  }
  function leanObject(root, spec) {
    const seen = new Set();
    let saved = 0;
    if (root) root.traverse(o => { const g = o.geometry; if (g && g.isBufferGeometry && !seen.has(g)) { seen.add(g); saved += lean(g, spec); } });
    return saved;
  }
  function compact(g) {
    if (RAW || !g || !g.index || !g.attributes.position) return 0;
    const I = g.index.array, n = g.attributes.position.count, map = new Int32Array(n).fill(-1);
    let m = 0;
    for (let i = 0; i < I.length; i++) if (map[I[i]] < 0) map[I[i]] = m++;
    if (m >= n) return 0;
    if (g.morphAttributes && Object.keys(g.morphAttributes).length) return 0;
    for (const k in g.attributes) { const a = g.attributes[k]; if (a.isInstancedBufferAttribute || a.count !== n) return 0; }
    g.dispose(); // (what the GPU held of it, if it was drawn before: sent again as it is now)
    let saved = 0;
    const rowsOf = new Map(); // (rows several attributes share, verts.js's own among them: each buffer once)
    const pick = (src, s) => { const out = new src.constructor(m * s); for (let i = 0; i < n; i++) { const j = map[i]; if (j >= 0) for (let c = 0; c < s; c++) out[j * s + c] = src[i * s + c]; } saved += src.byteLength - out.byteLength; return out; };
    for (const k in g.attributes) {
      const a = g.attributes[k];
      let b;
      if (a.isInterleavedBufferAttribute) {
        let buf = rowsOf.get(a.data);
        if (!buf) { buf = new THREE.InterleavedBuffer(pick(a.data.array, a.data.stride), a.data.stride); buf.usage = a.data.usage; rowsOf.set(a.data, buf); }
        b = new THREE.InterleavedBufferAttribute(buf, a.itemSize, a.offset, a.normalized);
      } else {
        b = new a.constructor(pick(a.array, a.itemSize), a.itemSize, a.normalized);
        b.usage = a.usage;
        if (a.gpuType !== undefined) b.gpuType = a.gpuType;
      }
      b.name = a.name;
      g.setAttribute(k, b);
    }
    const J = m <= 65535 ? new Uint16Array(I.length) : new Uint32Array(I.length);
    for (let i = 0; i < I.length; i++) J[i] = map[I[i]];
    saved += I.byteLength - J.byteLength;
    g.setIndex(new THREE.BufferAttribute(J, 1));
    return saved;
  }
  window.OEVerts = { lean, leanObject, row, compact, stats, raw: RAW };
})();
