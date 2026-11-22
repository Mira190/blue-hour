// The far crowd's copy of one scanned NPC (issue 475): the geometry half of pipeline/crowd_cast.py.
//   node pipeline/crowd_cast.mjs <character.glb> <clips.glb> <target triangles> [error] [hair share]   -> JSON on stdout
// (error 0.2 and hair share 0.2 by default; the coarser copy, crowd_cast.py COARSE, lets the error up, the body's seams go
// and the hair cards fall to the largest of them)
// Reads an NPC built by blender/build_people.py --npcs (meshopt-compressed, quantised), stands it in the first frame
// of its sex's Idle_Neutral clip (the pose the near walker stands in between strides), and simplifies each of its
// pictures' parts with meshoptimizer's simplifier (MIT, pipeline/vendor/), keeping the texture seams, the borders
// between the body, the head and the hair cards, and the parts the far crowd's shader swings (people.js crowdPose:
// 1/2 left/right thigh, 5/6 shin and foot, 3/4 arm and hand, 0 the rest, as pipeline/fetch_people.py part_of), with
// each vertex's share of that limb (_PARTW, below).
// Out: per picture (body, head, hair) the posed positions and normals in the rig's root frame (metres, y up, as the
// near walker's model is drawn), its texture coordinates, parts and triangles; and the pivots the shader swings about.
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
  // an accessor as floats (normalised integers to -1..1 or 0..1), count x comps
  const read = i => {
    const a = json.accessors[i], v = json.bufferViews[a.bufferView], n = COMPS[a.type], C = CT[a.componentType];
    const ex = v.extensions && v.extensions.EXT_meshopt_compression;
    const stride = (ex ? ex.byteStride : v.byteStride) || n * C.BYTES_PER_ELEMENT, src = views[a.bufferView], out = new Float32Array(a.count * n);
    const dv = new DataView(src.buffer, src.byteOffset, src.byteLength);
    const get = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType];
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) {
      let x = dv[get]((a.byteOffset || 0) + k * stride + c * C.BYTES_PER_ELEMENT, true);
      if (a.normalized) x = Math.max(-1, x / NORM[a.componentType]);
      out[k * n + c] = x;
    }
    return out;
  };
  return { json, read, views };
}

// ---- 4x4 matrices, column-major as glTF
const mul = (a, b) => { const o = new Float64Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
const trs = (t, q, s) => {
  const [x, y, z, w] = q, o = new Float64Array(16);
  o[0] = (1 - 2 * (y * y + z * z)) * s[0]; o[1] = (2 * (x * y + z * w)) * s[0]; o[2] = (2 * (x * z - y * w)) * s[0];
  o[4] = (2 * (x * y - z * w)) * s[1]; o[5] = (1 - 2 * (x * x + z * z)) * s[1]; o[6] = (2 * (y * z + x * w)) * s[1];
  o[8] = (2 * (x * z + y * w)) * s[2]; o[9] = (2 * (y * z - x * w)) * s[2]; o[10] = (1 - 2 * (x * x + y * y)) * s[2];
  o[12] = t[0]; o[13] = t[1]; o[14] = t[2]; o[15] = 1;
  return o;
};
const xf = (m, x, y, z, w = 1) => [m[0] * x + m[4] * y + m[8] * z + m[12] * w, m[1] * x + m[5] * y + m[9] * z + m[13] * w, m[2] * x + m[6] * y + m[10] * z + m[14] * w];

// the first frame of a clip, by node name: { name: { translation, rotation, scale } }
function clipPose(clips, name) {
  const a = clips.json.animations.find(x => x.name === name), pose = {};
  for (const ch of a.channels) {
    const node = clips.json.nodes[ch.target.node].name, s = a.samplers[ch.sampler], v = clips.read(s.output), n = { translation: 3, rotation: 4, scale: 3 }[ch.target.path];
    if (!n) continue;
    (pose[node] = pose[node] || {})[ch.target.path] = Array.from(v.subarray(0, n));
  }
  return pose;
}

// the limb a joint is part of (0 none, 1/2 left/right leg, 3/4 left/right arm), and whether it is below the knee
function limb(joint) {
  const m = /^Bip01 ([LR]) (.+)$/.exec(joint);
  if (!m) return [0, false];
  const left = m[1] === 'L', b = m[2];
  if (b === 'Thigh') return [left ? 1 : 2, false];
  if (/^(Calf|Foot|Toe)/.test(b)) return [left ? 1 : 2, true];
  if (/^(UpperArm|Forearm|Hand|Finger)/.test(b)) return [left ? 3 : 4, false];
  return [0, false];
}

function part(joint) {
  const m = /^Bip01 ([LR]) (.+)$/.exec(joint);
  if (!m) return 0;
  const left = m[1] === 'L', b = m[2];
  if (b === 'Thigh') return left ? 1 : 2;
  if (/^(Calf|Foot|Toe)/.test(b)) return left ? 5 : 6;
  if (/^(UpperArm|Forearm|Hand|Finger)/.test(b)) return left ? 3 : 4;
  return 0;
}

// the triangles of the largest cards (the parts joined by shared corners) of a sheet of cards, up to want indices
function largestCards(idx, pos, want) {
  const up = new Int32Array(pos.length / 3).map((_, i) => i), find = i => { while (up[i] !== i) i = up[i] = up[up[i]]; return i; };
  for (let t = 0; t < idx.length; t += 3) { const a = find(idx[t]); up[find(idx[t + 1])] = a; up[find(idx[t + 2])] = a; }
  const cards = new Map(), P = i => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [P(idx[t]), P(idx[t + 1]), P(idx[t + 2])], u = a.map((v, k) => b[k] - v), w = a.map((v, k) => c[k] - v);
    const area = Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2;
    const r = find(idx[t]), k = cards.get(r) || cards.set(r, { area: 0, tris: [] }).get(r);
    k.area += area; k.tris.push(t);
  }
  const out = [];
  for (const k of [...cards.values()].sort((x, y) => y.area - x.area)) {
    if (out.length && out.length + k.tris.length * 3 > want) continue;
    for (const t of k.tris) out.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  return Uint32Array.from(out);
}

async function main() {
  // (error: the simplifier's limit, relative to the model's size; hairMin: the hair cards' least share of their own triangles)
  const [file, clipsFile, target, error = '0.2', hairMin = '0.2'] = process.argv.slice(2);
  await MeshoptDecoder.ready; await MeshoptSimplifier.ready;
  const g = readGlb(file), clips = readGlb(clipsFile), pose = clipPose(clips, 'Idle_Neutral');
  const J = g.json, nodes = J.nodes, root = J.scenes[J.scene || 0].nodes[0];
  // world matrices of the posed rig, from the scene's root (the frame people.js draws the model in)
  const world = [], parent = {};
  nodes.forEach((n, i) => (n.children || []).forEach(c => { parent[c] = i; }));
  const local = i => { const n = nodes[i], p = pose[n.name] || {}; return trs(p.translation || n.translation || [0, 0, 0], p.rotation || n.rotation || [0, 0, 0, 1], p.scale || n.scale || [1, 1, 1]); };
  const W = i => world[i] || (world[i] = parent[i] === undefined ? local(i) : mul(W(parent[i]), local(i)));
  const skin = J.skins[0], ibm = g.read(skin.inverseBindMatrices), jm = skin.joints.map((j, k) => mul(W(j), ibm.subarray(k * 16, k * 16 + 16)));
  const jointName = skin.joints.map(j => nodes[j].name);
  const at = name => { const i = nodes.findIndex(n => n.name === name); const m = W(i); return [m[12], m[13], m[14]]; };
  const mid = (a, b) => { const p = at(a), q = at(b); return [+((p[1] + q[1]) / 2).toFixed(4), +((p[2] + q[2]) / 2).toFixed(4)]; };
  const out = { pivots: { hip: mid('Bip01 L Thigh', 'Bip01 R Thigh'), knee: mid('Bip01 L Calf', 'Bip01 R Calf'), shoulder: mid('Bip01 L UpperArm', 'Bip01 R UpperArm') }, parts: [] };
  // (every skinned mesh of it: a speaking character's face is a mesh of its own, build_people.py add_face)
  const skinned = nodes.filter(n => n.mesh !== undefined && n.skin !== undefined).map(n => J.meshes[n.mesh]);
  const prims = (skinned.length ? skinned : [J.meshes[0]]).flatMap(m => m.primitives).map(pr => {
    const A = pr.attributes, P = g.read(A.POSITION), N = g.read(A.NORMAL), UV = g.read(A.TEXCOORD_0), Js = g.read(A.JOINTS_0), Ws = g.read(A.WEIGHTS_0), I = g.read(pr.indices);
    const n = P.length / 3, pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), prt = new Uint8Array(n), pw = new Float32Array(n * 2);
    for (let v = 0; v < n; v++) {
      const m = new Float64Array(16); let ws = 0;
      const chain = [0, 0, 0, 0, 0], below = [0, 0, 0, 0, 0];
      for (let k = 0; k < 4; k++) ws += Ws[v * 4 + k];
      for (let k = 0; k < 4; k++) {
        const w = Ws[v * 4 + k] / (ws || 1), j = Js[v * 4 + k];
        const [L, low] = limb(jointName[j]);
        chain[L] += w; if (low) below[L] += w;
        if (w) for (let e = 0; e < 16; e++) m[e] += w * jm[j][e];
      }
      const p = xf(m, P[v * 3], P[v * 3 + 1], P[v * 3 + 2]), q = xf(m, N[v * 3], N[v * 3 + 1], N[v * 3 + 2], 0), l = Math.hypot(...q) || 1;
      pos.set(p, v * 3); nrm.set([q[0] / l, q[1] / l, q[2] / l], v * 3);
      // The limb that carries most of the vertex's weight, and how much of it: the shader turns the vertex by that share
      // of the limb's angle (and below the knee, by its share of the knee's), as the near walker's skinning blends its
      // bones. Each vertex took its heaviest bone's part whole before, and the triangles were cut apart where the parts
      // met: a coat's hem with some weight on a thigh, or a cuff on the arm holding an umbrella up, tore off the body as
      // a spike (the owner, the Scramble in the rain, November 2026)
      let L = 1;
      for (let k = 2; k <= 4; k++) if (chain[k] > chain[L]) L = k;
      if (chain[L] < 0.01) { prt[v] = 0; pw[v * 2] = 0; pw[v * 2 + 1] = 0; continue; }
      const kw = below[L] / chain[L];
      prt[v] = L <= 2 ? (kw >= 0.5 ? L + 4 : L) : L;
      pw[v * 2] = chain[L]; pw[v * 2 + 1] = kw;
    }
    const mat = J.materials[pr.material].name;
    return { mat, kind: /_opacity$/.test(mat) ? 'hair' : /_head$/.test(mat) ? 'head' : 'body', pos, nrm, uv: UV, prt, pw, idx: Uint32Array.from(I) };
  });
  // (the triangles as they are: each corner turns by its own share of its limb, so nothing is cut apart where the parts
  // meet; the shares go to the simplifier with the picture's coordinates, so it keeps where the body bends)
  const total = prims.reduce((s, p) => s + p.idx.length / 3, 0);
  for (const p of prims) {
    const T = p.idx.length / 3, tri = p.idx, n = p.pos.length / 3, pos = p.pos, nrm = p.nrm, uv = p.uv, prt = p.prt, pw = p.pw;
    // the share of the target this picture gets: by its triangles, the hair cards held to a fifth of theirs at least
    const want = Math.round(Math.max(p.kind === 'hair' ? +hairMin * T : 0, target * T / total)) * 3;
    const attrs = new Float32Array(n * 8);
    for (let i = 0; i < n; i++) attrs.set([uv[i * 2], uv[i * 2 + 1], nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2], pw[i * 2], pw[i * 2 + 1], prt[i] >= 3 && prt[i] <= 4 ? prt[i] - 3 : prt[i] % 2], i * 8);
    let [idx, err] = MeshoptSimplifier.simplifyWithAttributes(tri, pos, 3, attrs, 8, [1.5, 1.5, 0.3, 0.3, 0.3, 1.0, 1.0, 1.0], null, Math.min(tri.length, want), +error,
      p.kind === 'hair' ? [] : p.kind === 'body' && +error > 0.2 ? ['Permissive'] : ['LockBorder']); // (the coarser copy: the body's seams may move, a few centimetres seen from 60 m)
    // the hair cards are loose quads, which the simplifier cannot merge: below a fifth of them (the coarser copy, issue 61),
    // the largest cards are kept, the head's painted hair showing where a small one was
    if (p.kind === 'hair' && idx.length > want && +hairMin < 0.2) idx = largestCards(idx, pos, want);
    // the vertices still used, in order
    const used = new Map(), keep = [];
    const ix = Array.from(idx, v => { if (!used.has(v)) { used.set(v, keep.length); keep.push(v); } return used.get(v); });
    out.parts.push({ kind: p.kind, material: p.mat, triangles_before: T, error: +err.toFixed(5),
      pos: keep.flatMap(v => Array.from(pos.subarray(v * 3, v * 3 + 3), x => +x.toFixed(5))),
      nrm: keep.flatMap(v => Array.from(nrm.subarray(v * 3, v * 3 + 3), x => +x.toFixed(4))),
      uv: keep.flatMap(v => Array.from(uv.subarray(v * 2, v * 2 + 2), x => +x.toFixed(5))),
      part: keep.map(v => prt[v]), pw: keep.flatMap(v => [+pw[v * 2].toFixed(3), +pw[v * 2 + 1].toFixed(3)]), idx: ix });
  }
  process.stdout.write(JSON.stringify(out));
}
main().catch(e => { console.error(e); process.exit(1); });
