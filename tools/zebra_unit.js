// The crossings' bars widened to their cells (web/streets.js zebraCells), checked on every hero level's own paint
// without a browser: each level's model is read (its meshopt buffers decoded), its paint run through zebraCells, and
// every piece taken for a bar must keep its painted 45 cm exactly where it was laid. Over each piece `a` must climb
// across the bar at one metre a metre, straight (its triangles agree), and each vertex, taken back across by half its
// `a`, must stand where the model had it, to 2 mm, the widened plane as high there as the model's to 4 mm (a third of
// the paint's 12 mm over the asphalt: a quad of paint is not quite flat, and its two triangles' slopes are shared at
// its vertices); no triangle may turn over. A triangle of a quad the model's compression split off, or a bar's end cut
// askew by a kerb, widened along its own long axis, was a wedge of paint in the bar, and one moved across keeping its
// height sank under the asphalt, which drew a line through the bar (the owner's still of the Scramble, 28 November
// 2026).
//   node tools/zebra_unit.js [map]        (shibuya)
'use strict';
const fs = require('fs'), path = require('path');
const R = path.join(__dirname, '..'), MAP = process.argv[2] || 'shibuya';
let fails = 0;
const fail = m => { fails++; if (fails <= 20) console.log(`FAIL ${m}`); };

(async () => {
  const THREE = await import(path.join(R, 'web/vendor/three/three.core.js'));
  const { MeshoptDecoder } = await import(path.join(R, 'web/vendor/meshoptimizer/meshopt_decoder_reference.js'));
  global.window = global; window.THREE = THREE;
  eval(fs.readFileSync(path.join(R, 'web/streets.js'), 'utf8')); // (defines window.OEStreets)
  const dir = path.join(R, 'web/data', MAP, 'hero');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.glb')) : [];
  let levels = 0, pieces = 0, bars = 0;
  for (const f of files) {
    const b = fs.readFileSync(path.join(dir, f)), jl = b.readUInt32LE(12), J = JSON.parse(b.slice(20, 20 + jl).toString());
    const BIN = b.slice(20 + jl + 8), mat = (J.materials || []).findIndex(m => /^ground_paint/i.test(m.name || ''));
    if (mat < 0) continue;
    const views = J.bufferViews.map(bv => {
      const e = bv.extensions && bv.extensions.EXT_meshopt_compression;
      if (!e) return BIN.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
      const out = new Uint8Array(e.count * e.byteStride);
      MeshoptDecoder.decodeGltfBuffer(out, e.count, e.byteStride, new Uint8Array(BIN.slice(e.byteOffset || 0, (e.byteOffset || 0) + e.byteLength)), e.mode, e.filter);
      return Buffer.from(out);
    });
    const RD = { 5126: [4, 'readFloatLE', 1], 5125: [4, 'readUInt32LE', 1], 5123: [2, 'readUInt16LE', 65535], 5122: [2, 'readInt16LE', 32767], 5121: [1, 'readUInt8', 255], 5120: [1, 'readInt8', 127] };
    const acc = i => {
      const a = J.accessors[i], bv = J.bufferViews[a.bufferView], v = views[a.bufferView], nc = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type], rd = RD[a.componentType];
      const st = bv.byteStride || rd[0] * nc, out = new Float64Array(a.count * nc);
      for (let k = 0; k < a.count; k++) for (let c = 0; c < nc; c++) { const x = v[rd[1]]((a.byteOffset || 0) + k * st + c * rd[0]); out[k * nc + c] = a.normalized ? x / rd[2] : x; }
      return out;
    };
    const list = [];
    J.nodes.forEach(n => {
      if (n.mesh == null) return;
      for (const p of J.meshes[n.mesh].primitives) {
        if (p.material !== mat || p.indices == null) continue;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(acc(p.attributes.POSITION)), 3));
        g.setIndex(Array.from(acc(p.indices)));
        const o = new THREE.Mesh(g);
        if (n.matrix) o.matrix.fromArray(n.matrix).decompose(o.position, o.quaternion, o.scale);
        if (n.translation) o.position.fromArray(n.translation);
        if (n.rotation) o.quaternion.fromArray(n.rotation);
        if (n.scale) o.scale.fromArray(n.scale);
        o.updateMatrixWorld(true);
        list.push(o);
      }
    });
    if (!list.length) continue;
    levels++;
    const before = list.map(o => { const p = o.geometry.attributes.position, w = new Float64Array(p.count * 3), v = new THREE.Vector3(); for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); w.set([v.x, v.y, v.z], i * 3); } return w; });
    const nb = OEStreets.zebraCells(list);
    bars += nb;
    list.forEach((o, k) => {
      const p = o.geometry.attributes.position, z = o.geometry.attributes._zebra, I = o.geometry.index.array, W = before[k], v = new THREE.Vector3();
      const F = new Float64Array(p.count * 3);
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); F.set([v.x, v.y, v.z], i * 3); }
      for (let t = 0; t < I.length; t += 3) {
        const [i0, i1, i2] = [I[t], I[t + 1], I[t + 2]];
        if (!(z.getY(i0) > 0.5 && z.getY(i1) > 0.5 && z.getY(i2) > 0.5)) continue;
        pieces++;
        // a's gradient over the triangle on the ground, and what it must undo
        const x1 = F[i1 * 3] - F[i0 * 3], z1 = F[i1 * 3 + 2] - F[i0 * 3 + 2], x2 = F[i2 * 3] - F[i0 * 3], z2 = F[i2 * 3 + 2] - F[i0 * 3 + 2];
        const d = x1 * z2 - x2 * z1, ar = (W[i1 * 3] - W[i0 * 3]) * (W[i2 * 3 + 2] - W[i0 * 3 + 2]) - (W[i2 * 3] - W[i0 * 3]) * (W[i1 * 3 + 2] - W[i0 * 3 + 2]);
        const at = `${f} near (${F[i0 * 3].toFixed(1)}, ${(-F[i0 * 3 + 2]).toFixed(1)})`;
        if (Math.abs(d) < 1e-6) { fail(`${at}: a bar's triangle with no area`); continue; }
        if (Math.sign(d) !== Math.sign(ar)) { fail(`${at}: a bar's triangle turned over`); continue; }
        const a1 = z.getX(i1) - z.getX(i0), a2 = z.getX(i2) - z.getX(i0), gx = (a1 * z2 - a2 * z1) / d, gz = (x1 * a2 - x2 * a1) / d, gl = Math.hypot(gx, gz);
        if (Math.abs(gl - 1) > 0.02) { fail(`${at}: a climbs ${gl.toFixed(3)} m a metre across its bar, not 1`); continue; }
        let off = false;
        for (const i of [i0, i1, i2]) {
          const h = z.getX(i) / 2, e = Math.hypot(F[i * 3] - gx / gl * h - W[i * 3], F[i * 3 + 2] - gz / gl * h - W[i * 3 + 2]);
          if (e > 0.002) { fail(`${at}: its paint ${(e * 100).toFixed(1)} cm from where it was laid`); off = true; break; }
        }
        if (off) continue;
        // and at the height it was laid: the widened triangle's plane, where each of its vertices was, as high as it was
        for (const i of [i0, i1, i2]) {
          const px = W[i * 3] - F[i0 * 3], pz = W[i * 3 + 2] - F[i0 * 3 + 2], u = (px * z2 - x2 * pz) / d, w = (x1 * pz - px * z1) / d;
          const y = F[i0 * 3 + 1] + u * (F[i1 * 3 + 1] - F[i0 * 3 + 1]) + w * (F[i2 * 3 + 1] - F[i0 * 3 + 1]), e = Math.abs(y - W[i * 3 + 1]);
          if (e > 0.004) { fail(`${at}: its paint ${(e * 1000).toFixed(1)} mm off the height it was laid at`); break; }
        }
      }
    });
  }
  if (!levels) { console.log(`ok   zebras  no hero level of ${MAP} has paint`); return; }
  if (!fails) console.log(`ok   zebras  ${bars} bars in ${levels} levels' paint widened to their cells, every one of ${pieces} triangles' paint where it was laid`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log(`FAIL ${e.stack || e}`); process.exit(1); });
