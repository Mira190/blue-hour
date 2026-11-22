// Does the text the page writes on its vehicles read the right way round? The models' decal patches (materials
// named Decal_*: a helicopter's registration and its operator's name, a ferry's name) take a canvas the game draws
// (web/game/vehicles.js decalTexture, put on unflipped as glTF textures are: u to the right, v down the picture).
// Seen from outside, each patch must run left to right and top to bottom, or its words read mirrored or upside
// down; and its front must face out of the model, or it is seen from behind through a double-sided material.
//   node tools/decal_check.js [glb ...]       # default: every model in web/assets/vehicles; exits 1 on a fault
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), DIR = path.join(ROOT, 'web/assets/vehicles');
const SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }, N = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const local = nd => {
  if (nd.matrix) return nd.matrix;
  const [x, y, z, w] = nd.rotation || [0, 0, 0, 1], [sx, sy, sz] = nd.scale || [1, 1, 1], [tx, ty, tz] = nd.translation || [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0, 2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
};
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

async function check(file) {
  const { MeshoptDecoder } = await import(path.join(ROOT, 'pipeline/vendor/meshoptimizer/meshopt_decoder.mjs'));
  await MeshoptDecoder.ready;
  const buf = fs.readFileSync(file);
  let o = 12, json = null, bin = null;
  while (o < buf.length) {
    const len = buf.readUInt32LE(o), type = buf.readUInt32LE(o + 4), data = buf.subarray(o + 8, o + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8')); else if (type === 0x004e4942) bin = data;
    o += 8 + len;
  }
  if (!(json.materials || []).some(m => /^Decal_/.test(m.name || ''))) return [];
  const views = json.bufferViews.map(v => {
    const e = v.extensions && v.extensions.EXT_meshopt_compression;
    if (!e) return { data: bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength), stride: v.byteStride || 0 };
    const out = new Uint8Array(e.count * e.byteStride);
    MeshoptDecoder.decodeGltfBuffer(out, e.count, e.byteStride, bin.subarray(e.byteOffset || 0, (e.byteOffset || 0) + e.byteLength), e.mode, e.filter);
    return { data: out, stride: e.byteStride };
  });
  const accessor = i => {
    const a = json.accessors[i], v = views[a.bufferView], n = N[a.type], sz = SIZE[a.componentType], stride = v.stride || n * sz;
    const dv = new DataView(v.data.buffer, v.data.byteOffset + (a.byteOffset || 0)), out = new Float64Array(a.count * n);
    const get = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType];
    const norm = a.normalized ? { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[a.componentType] : 0;
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) { const x = dv[get](k * stride + c * sz, true); out[k * n + c] = norm ? Math.max(-1, x / norm) : x; }
    // (KHR_texture_transform and quantised uvs aside: meshopt's filters leave floats here)
    return out;
  };
  const bad = [];
  // each model (a top node) on its own: its centre, then its decal triangles
  const roots = json.scenes[json.scene || 0].nodes;
  for (const ri of roots) {
    const tris = [], all = [];
    const walk = (ni, M) => {
      const nd = json.nodes[ni], W = mul(M, local(nd));
      if (nd.mesh != null) {
        const det = W[0] * (W[5] * W[10] - W[6] * W[9]) - W[4] * (W[1] * W[10] - W[2] * W[9]) + W[8] * (W[1] * W[6] - W[2] * W[5]);
        for (const p of json.meshes[nd.mesh].primitives) {
          const mname = (json.materials[p.material] || {}).name || '';
          const P = accessor(p.attributes.POSITION);
          const X = i => [W[0] * P[i * 3] + W[4] * P[i * 3 + 1] + W[8] * P[i * 3 + 2] + W[12], W[1] * P[i * 3] + W[5] * P[i * 3 + 1] + W[9] * P[i * 3 + 2] + W[13], W[2] * P[i * 3] + W[6] * P[i * 3 + 1] + W[10] * P[i * 3 + 2] + W[14]];
          for (let i = 0; i < P.length / 3; i += 7) all.push(X(i));
          if (!/^Decal_/.test(mname) || p.attributes.TEXCOORD_0 == null) continue;
          const T = accessor(p.attributes.TEXCOORD_0), I = p.indices != null ? accessor(p.indices) : Float64Array.from({ length: P.length / 3 }, (_, i) => i);
          for (let t = 0; t < I.length; t += 3) {
            const ks = det < 0 ? [I[t], I[t + 2], I[t + 1]] : [I[t], I[t + 1], I[t + 2]];
            tris.push({ node: nd.name, mat: mname, p: ks.map(X), uv: ks.map(k => [T[k * 2], T[k * 2 + 1]]) });
          }
        }
      }
      for (const c of nd.children || []) walk(c, W);
    };
    walk(ri, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    if (!tris.length) continue;
    const ctr = all.reduce((s, q) => [s[0] + q[0], s[1] + q[1], s[2] + q[2]], [0, 0, 0]).map(v => v / all.length);
    const tally = {};
    for (const t of tris) {
      const [a, b, c] = t.p, e1 = sub(b, a), e2 = sub(c, a), n = cross(e1, e2), ln = Math.hypot(...n);
      if (ln < 1e-9) continue;
      const du1 = t.uv[1][0] - t.uv[0][0], dv1 = t.uv[1][1] - t.uv[0][1], du2 = t.uv[2][0] - t.uv[0][0], dv2 = t.uv[2][1] - t.uv[0][1], det = du1 * dv2 - du2 * dv1;
      if (Math.abs(det) < 1e-12) continue;
      const dpdu = [0, 1, 2].map(i => (e1[i] * dv2 - e2[i] * dv1) / det), dpdv = [0, 1, 2].map(i => (e2[i] * du1 - e1[i] * du2) / det);
      // read from its front, u runs right and v runs down: dpdu x dpdv points into the face
      const mirrored = dot(cross(dpdu, dpdv), n) > 0;
      const mid = [0, 1, 2].map(i => (a[i] + b[i] + c[i]) / 3), out = dot(n, sub(mid, ctr)) < 0;
      // upright: on a side, v (down the picture) runs downwards
      const up = Math.abs(n[1] / ln) > 0.8 ? true : dpdv[1] < 0;
      // (each side of the model on its own: a side drawn mirrored is half the patches, never a majority of all)
      const ax = [0, 1, 2].reduce((m, i) => Math.abs(n[i]) > Math.abs(n[m]) ? i : m, 0), side = `${n[ax] > 0 ? '+' : '-'}${'xyz'[ax]}`;
      const key = `${t.node} ${t.mat} ${side}`;
      const s = tally[key] || (tally[key] = { n: 0, mirrored: 0, inward: 0, upside: 0, at: mid });
      s.n++; s.mirrored += mirrored; s.inward += out; s.upside += !up;
    }
    for (const [key, s] of Object.entries(tally)) {
      const why = [s.mirrored > s.n / 2 && 'reads mirrored', s.inward > s.n / 2 && 'faces into the model', s.upside > s.n / 2 && 'upside down'].filter(Boolean);
      if (why.length) bad.push(`${path.basename(file)}: ${key}: ${why.join(', ')} (${s.n} triangles, at ${s.at.map(v => v.toFixed(2)).join(', ')})`);
      else if (process.env.VERBOSE) console.log(`  ${path.basename(file)}: ${key}: ${s.n} triangles read right`);
    }
  }
  return bad;
}

(async () => {
  const files = process.argv.slice(2).length ? process.argv.slice(2) : fs.readdirSync(DIR).filter(f => f.endsWith('.glb')).map(f => path.join(DIR, f));
  let bad = [];
  for (const f of files) bad = bad.concat(await check(f));
  for (const b of bad) console.log(b);
  if (!bad.length) console.log('ok: the vehicles\' decals read the right way round');
  process.exit(bad.length ? 1 : 0);
})();
