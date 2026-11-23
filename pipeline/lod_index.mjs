// A lighter set of triangles for a model's heaviest parts, over the same vertices (a phone's load, November 2026).
//   node pipeline/lod_index.mjs <model.glb> <out.json> <mesh>:<primitive>:<share> [...]
// e.g. node pipeline/lod_index.mjs web/assets/animals/akita.glb web/assets/animals/akita.lod.json Akita:0:0.22
// Each named primitive is simplified with meshoptimizer's simplifier (MIT, pipeline/vendor/) to about `share` of its
// triangles, keeping its borders and texture seams (positions, normals and texture coordinates weighed), and only its
// index is written: the vertices, their skin and their attributes stay the model's, so a page swaps the index in
// (geometry.setIndex) and the model is drawn as it was, posed by the same skeleton, with fewer triangles. The file
// keeps each primitive's vertex count, and a page uses an index only where the model it loaded has that many vertices
// (a model built again without this run is drawn whole, never wrongly). blender/build_dog.py runs it after its build.
import fs from 'fs';
import { MeshoptDecoder } from './vendor/meshoptimizer/meshopt_decoder.mjs';
import { MeshoptSimplifier } from './vendor/meshoptimizer/meshopt_simplifier.mjs';

const COMPS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NORM = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 };

function readGlb(file) {
  const buf = fs.readFileSync(file);
  let o = 12, json = null, bin = null;
  while (o < buf.length) {
    const len = buf.readUInt32LE(o), type = buf.readUInt32LE(o + 4), data = buf.subarray(o + 8, o + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    else if (type === 0x004e4942) bin = data;
    o += 8 + len;
  }
  const views = json.bufferViews.map(v => {
    const ex = v.extensions && v.extensions.EXT_meshopt_compression;
    if (!ex) return bin.subarray(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength);
    const out = new Uint8Array(ex.count * ex.byteStride);
    MeshoptDecoder.decodeGltfBuffer(out, ex.count, ex.byteStride, bin.subarray(ex.byteOffset || 0, (ex.byteOffset || 0) + ex.byteLength), ex.mode, ex.filter || 'NONE');
    return Buffer.from(out.buffer);
  });
  const read = (i, raw = false) => {
    const a = json.accessors[i], v = json.bufferViews[a.bufferView], n = COMPS[a.type], C = CT[a.componentType];
    const ex = v.extensions && v.extensions.EXT_meshopt_compression;
    const stride = (ex ? ex.byteStride : v.byteStride) || n * C.BYTES_PER_ELEMENT, src = views[a.bufferView];
    const out = raw ? new Uint32Array(a.count * n) : new Float32Array(a.count * n);
    const dv = new DataView(src.buffer, src.byteOffset, src.byteLength);
    const get = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType];
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) {
      let x = dv[get]((a.byteOffset || 0) + k * stride + c * C.BYTES_PER_ELEMENT, true);
      if (!raw && a.normalized) x = Math.max(-1, x / NORM[a.componentType]);
      out[k * n + c] = x;
    }
    return out;
  };
  return { json, read };
}

const [, , file, outFile, ...specs] = process.argv;
if (!file || !outFile || !specs.length) { console.error('usage: node pipeline/lod_index.mjs <model.glb> <out.json> <mesh>:<primitive>:<share> ...'); process.exit(2); }
await MeshoptSimplifier.ready;
const glb = readGlb(file), out = { model: file.split('/').pop(), parts: {} };
for (const spec of specs) {
  const [mesh, pi, share] = spec.split(':'), m = glb.json.meshes.find(x => x.name === mesh);
  if (!m || !m.primitives[+pi]) { console.error(`no ${mesh} primitive ${pi} in ${file}`); process.exit(1); }
  const p = m.primitives[+pi], pos = glb.read(p.attributes.POSITION), nv = pos.length / 3;
  const idx = glb.read(p.indices, true), nrm = p.attributes.NORMAL != null ? glb.read(p.attributes.NORMAL) : null, uv = p.attributes.TEXCOORD_0 != null ? glb.read(p.attributes.TEXCOORD_0) : null;
  const attrs = new Float32Array(nv * 5);
  for (let i = 0; i < nv; i++) { if (nrm) attrs.set(nrm.subarray(i * 3, i * 3 + 3), i * 5); if (uv) attrs.set(uv.subarray(i * 2, i * 2 + 2), i * 5 + 3); }
  const want = Math.floor(idx.length * +share / 3) * 3;
  const [res, err] = MeshoptSimplifier.simplifyWithAttributes(idx, pos, 3, attrs, 5, [0.5, 0.5, 0.5, 1, 1], null, want, 0.01, ['LockBorder']);
  const I = nv < 65536 ? Uint16Array.from(res) : Uint32Array.from(res);
  out.parts[`${mesh}:${pi}`] = { vertices: nv, triangles: I.length / 3, of: idx.length / 3, error: +err.toFixed(5), bits: I.BYTES_PER_ELEMENT * 8, index: Buffer.from(I.buffer).toString('base64') };
  console.log(`${mesh}:${pi}: ${idx.length / 3} -> ${I.length / 3} triangles (error ${err.toFixed(4)} of its size)`);
}
fs.writeFileSync(outFile, JSON.stringify(out));
