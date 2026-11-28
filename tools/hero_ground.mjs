// Where a hero level's paving lets the game's ground or its own grout over it (issue 239), read from the models and the
// terrain alone, no browser. The game draws its own ground (game.json's terrain, on each 5 m cell's two triangles as
// nav.js reads it) everywhere but under a level's own floor (hero[].floor: its room_floor_* meshes and a half-metre ring
// round them, game.js heroCover); a level's paving (its ground_* meshes) is seen only where it stands over that ground.
// In SKY GATE's hall the ground came through the tiles in grey patches where they came down to the hall's floor, and the
// grout under the forecourt's planks, one quad over the forecourt with its height taken between its corners, lay 2 cm
// over the planks and covered them in one flat grey. A model built before the terrain was graded again lies under it
// where the ground rose.
//
// For each level (game.json hero[], or LEVELS=id,id), on a GRID m grid over its circle, the top of what its paving draws:
//   - under: more than 5 mm under the game's ground, outside its own floor's cut (the ground drawn over it);
//   - grout: a joint's or grout's mesh (*_joint*) 2 mm to 5 cm over the level's own stone under it (a joint drawn over the
//     stone, not seen in a gap between the stones).
// Prints each level's paved area, each fault's area and its largest patch; exits 1 where either passes the level's
// allowance (ALLOW, m2 by level, for what is known and not yet rebuilt: docs/HERO.md), 0.5 m2 elsewhere.
//   node tools/hero_ground.mjs            (LEVELS=skylobby GRID=0.25)
import fs from 'fs';
import path from 'path';
import { MeshoptDecoder } from '../pipeline/vendor/meshoptimizer/meshopt_decoder.mjs';

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname)), CITY = 'shibuya';
const GRID = +(process.env.GRID || 0.25), MAX = 0.5;
// (levels whose models predate a regrade of the ground, issue 239's reach: their faults as measured on 28 November 2026,
// held here so the check fails on anything new; a level built again from today's ground drops out of this list)
const ALLOW = { scramble: { under: 1141 }, miyamasu: { under: 38, grout: 89 } }; // (issue 262: not yet read against the drawn page)
const ONLY = process.env.LEVELS ? process.env.LEVELS.split(',') : null;
const COMPS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };

function readGlb(file) {
  const buf = fs.readFileSync(file);
  let o = 12, json = null, bin = null;
  while (o < buf.length) {
    const len = buf.readUInt32LE(o), type = buf.readUInt32LE(o + 4), data = buf.subarray(o + 8, o + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8')); else if (type === 0x004e4942) bin = data;
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
    const dv = new DataView(src.buffer, src.byteOffset, src.byteLength), out = raw ? new Uint32Array(a.count * n) : new Float32Array(a.count * n);
    const get = { 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType];
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = dv[get]((a.byteOffset || 0) + k * stride + c * C.BYTES_PER_ELEMENT, true);
    return out;
  };
  return { json, read };
}
// a node's matrix (column-major, glTF's): its own or its translation, rotation and scale
function local(n) {
  if (n.matrix) return n.matrix.slice();
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
  return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0, 2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
}
const mul = (a, b) => { const o = new Array(16).fill(0); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) o[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k]; return o; };

const D = path.join(ROOT, 'web', 'data', CITY), G = JSON.parse(fs.readFileSync(path.join(D, 'game.json'))), S = JSON.parse(fs.readFileSync(path.join(D, 'scene.json')));
const t = G.terrain, raw = Buffer.from(t.data, 'base64'), H = new Float64Array(raw.length / 2);
for (let i = 0; i < H.length; i++) H[i] = raw.readInt16LE(i * 2) * t.scale;
const x0 = S.frame.x[0], y1 = S.frame.y[1];
function terrain(x, y) { // (blender/hero_open.py Ground, nav.js terrain: a cell's two triangles)
  const c = Math.max(0, Math.min(t.nx - 1.001, (x - x0) / t.cell)), r = Math.max(0, Math.min(t.ny - 1.001, (y1 - y) / t.cell)), c0 = Math.floor(c), r0 = Math.floor(r), fc = c - c0, fr = r - r0;
  const a = H[r0 * t.nx + c0], b = H[r0 * t.nx + c0 + 1], d = H[(r0 + 1) * t.nx + c0], e = H[(r0 + 1) * t.nx + c0 + 1];
  return fc + fr <= 1 ? a + fc * (b - a) + fr * (d - a) : e + (1 - fc) * (d - e) + (1 - fr) * (b - e);
}

await MeshoptDecoder.ready;
let bad = 0;
for (const h of G.hero || []) {
  if (ONLY && !ONLY.includes(h.id)) continue;
  const glb = readGlb(path.join(D, h.glb)), tris = []; // [ax, ay, az, bx, by, bz, cx, cy, cz, kind]
  const walk = (i, M) => {
    const n = glb.json.nodes[i], W = mul(M, local(n)), name = `${n.name || ''} ${n.mesh != null ? glb.json.meshes[n.mesh].name || '' : ''}`;
    if (n.mesh != null && /(^|_)(ground|room_floor)_/.test(name)) {
      const kind = (/joint|grout/.test(name) ? 1 : 0) | (/(^|_)room_floor_/.test(name) ? 2 : 0); // (bits: 1 a joint's or grout's, 2 the level's own floor)
      for (const p of glb.json.meshes[n.mesh].primitives) {
        const pos = glb.read(p.attributes.POSITION), idx = p.indices != null ? glb.read(p.indices, true) : null, m = idx ? idx.length : pos.length / 3;
        const P = k => { const q = (idx ? idx[k] : k) * 3, X = pos[q], Y = pos[q + 1], Z = pos[q + 2]; return [W[0] * X + W[4] * Y + W[8] * Z + W[12], -(W[2] * X + W[6] * Y + W[10] * Z + W[14]), W[1] * X + W[5] * Y + W[9] * Z + W[13]]; };
        for (let k = 0; k + 2 < m; k += 3) tris.push([...P(k), ...P(k + 1), ...P(k + 2), kind]);
      }
    }
    for (const c of n.children || []) walk(c, W);
  };
  for (const r of glb.json.scenes[glb.json.scene || 0].nodes) walk(r, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  // the top of the paving in each cell, and each layer under it (z, kind)
  const n = Math.ceil(2 * h.r / GRID), gx = h.at[0] - h.r, gy = h.at[1] - h.r, cells = new Map();
  const HC = 0.5, nc = Math.ceil(2 * h.r / HC), cut = new Uint8Array(nc * nc); // (the game's cut: game.js heroCover)
  for (const [ax, ay, az, bx, by, bz, cx, cy, cz, kind] of tris) {
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(den) < 1e-12) continue;
    const bary = (px, py) => { const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den, l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den; return [l1, l2, 1 - l1 - l2]; };
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - gx) / GRID)), i1 = Math.min(n - 1, Math.ceil((Math.max(ax, bx, cx) - gx) / GRID));
    const j0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - gy) / GRID)), j1 = Math.min(n - 1, Math.ceil((Math.max(ay, by, cy) - gy) / GRID));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const [l1, l2, l3] = bary(gx + (i + 0.5) * GRID, gy + (j + 0.5) * GRID);
      if (l1 < 0 || l2 < 0 || l3 < 0) continue;
      const k = j * n + i; let l = cells.get(k); if (!l) cells.set(k, l = []);
      l.push([l1 * az + l2 * bz + l3 * cz, kind]);
    }
    if ((kind & 2) && h.floor) {
      const I0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - gx) / HC)), I1 = Math.min(nc - 1, Math.ceil((Math.max(ax, bx, cx) - gx) / HC));
      const J0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - gy) / HC)), J1 = Math.min(nc - 1, Math.ceil((Math.max(ay, by, cy) - gy) / HC));
      for (let j = J0; j <= J1; j++) for (let i = I0; i <= I1; i++) { const [l1, l2, l3] = bary(gx + (i + 0.5) * HC, gy + (j + 0.5) * HC); if (l1 >= 0 && l2 >= 0 && l3 >= 0) cut[j * nc + i] = 1; }
    }
  }
  const c0 = cut.slice();
  for (let j = 0; j < nc; j++) for (let i = 0; i < nc; i++) if (c0[j * nc + i]) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < nc && jj < nc) cut[jj * nc + ii] = 1; }
  const under = [], grout = [];
  let paved = 0;
  for (const [k, l] of cells) {
    const i = k % n, j = Math.floor(k / n), x = gx + (i + 0.5) * GRID, y = gy + (j + 0.5) * GRID;
    if (Math.hypot(x - h.at[0], y - h.at[1]) > h.r) continue;
    paved++;
    l.sort((a, b) => b[0] - a[0]);
    const [z, kind] = l[0], ci = Math.floor((x - gx) / HC), cj = Math.floor((y - gy) / HC), isCut = cut[cj * nc + ci];
    if (!(kind & 2) && !isCut && z < terrain(x, y) - 0.005) under.push([i, j, terrain(x, y) - z]);
    if (kind & 1) { const s = l.find(q => !(q[1] & 1) && z - q[0] < 0.05 && z > q[0] + 0.002); if (s) grout.push([i, j, z - s[0]]); }
  }
  const patch = list => { // (the largest patch: cells joined by their sides)
    const have = new Map(list.map(c => [c[1] * n + c[0], c])), seen = new Set(); let best = [];
    for (const c of list) {
      const k0 = c[1] * n + c[0]; if (seen.has(k0)) continue;
      const q = [c], got = []; seen.add(k0);
      while (q.length) { const d = q.pop(); got.push(d); for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const kk = (d[1] + dj) * n + d[0] + di; if (have.has(kk) && !seen.has(kk)) { seen.add(kk); q.push(have.get(kk)); } } }
      if (got.length > best.length) best = got;
    }
    if (!best.length) return '';
    const mx = gx + (best.reduce((a, c) => a + c[0], 0) / best.length + 0.5) * GRID, my = gy + (best.reduce((a, c) => a + c[1], 0) / best.length + 0.5) * GRID;
    return ` (the largest ${(best.length * GRID * GRID).toFixed(2)} m2 about ${mx.toFixed(1)}, ${my.toFixed(1)}, to ${(Math.max(...best.map(c => c[2])) * 100).toFixed(1)} cm)`;
  };
  const a = m => +(m * GRID * GRID).toFixed(2), al = ALLOW[h.id] || {};
  const fail = a(under.length) > (al.under ?? MAX) || a(grout.length) > (al.grout ?? MAX);
  if (fail) bad++;
  console.log(`${fail ? 'FAIL' : 'ok  '} ${h.id.padEnd(10)} paved ${a(paved)} m2; under the ground ${a(under.length)} m2${patch(under)}; grout over the stone ${a(grout.length)} m2${patch(grout)}${al.under || al.grout ? ` (allowed ${JSON.stringify(al)}: built before the ground was graded again)` : ''}`);
}
process.exit(bad ? 1 : 0);
