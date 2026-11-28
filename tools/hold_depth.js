// How deep a person's forearms, hands and what the right hand holds go inside their own torso, measured on the skinned
// mesh as it is posed (the owner's report: the crowd's texting clip put the right forearm into the chest of a body broader
// than the one the clip was made on). Shared by tools/hold_check.js (every cast avatar through every held clip, on a lineup)
// and tools/clip_probe.js (the near crowd and the map's people round the player, every frame of the story).
//
// The torso is the skin whose vertices are carried most by the pelvis or the spine (the jacket and the blouse over them).
// Each vertex is skinned as the GPU skins it and its normal turned with it. A point of a forearm (the vertices carried by
// the forearm, the hand and the fingers) or a corner of the held thing is inside where it lies behind the torso's surface:
// the signed distance along the normals of the nearest torso vertices (the mean of the four nearest, within 15 cm). The
// rest pose's own depths are not taken off: in the rest pose (arms out) no forearm is near the torso.
//
//   page side:  (pageSide)()  ->  window.__holdDepth.measure(root) -> { R_forearm, R_hand, L_forearm, L_hand, held }, metres
//   node side:  const H = require('./hold_depth'); await page.addInitScript(H.script);  H.LIMIT
const LIMIT = 0.02; // m: deeper than this is a limb in the body (a sleeve pressed on a jacket reads 0.5 to 1.5 cm)
// (an avatar whose clothes read deeper than they are: its own limit, and why)
const ALLOW = {
  // a loose vest whose armholes hang over the upper arm and whose sides stand off the body: the sleeve under the vest's side
  // reads 2 to 3.1 cm in (3.1 waiting at the crossing in frame 1's Stop), where a still shows the arm coming out of the
  // armhole as it should
  R_Male_Adult_05_m008: 0.04,
};
const limitOf = name => { for (const k in ALLOW) if (String(name).includes(k.replace(/^R_/, ''))) return ALLOW[k]; return LIMIT; };

function pageSide() {
  if (window.__holdDepth) return;
  const ELBOW = 0.07;
  const CHEST = /(Spine2|Spine1|Spine)$/;
  const TORSO = /(Pelvis|Spine2|Spine1|Spine|Neck|Clavicle)$/, PART = /_([RL])_(Forearm|Hand|Finger\d*)$/;
  const cache = new WeakMap();
  // a model's skinned meshes, its torso vertices and its limb vertices (a fifth of them: enough points, a fifth the time)
  function build(root) {
    const T = window.THREE, meshes = [];
    // (only what is drawn: the one you play carries a hidden copy of each of their meshes on the same skeleton)
    const shown = o => { for (let q = o; q && q !== root; q = q.parent) if (!q.visible) return false; return true; };
    root.traverse(o => { if (o.isSkinnedMesh && o.skeleton && o.geometry.attributes.skinIndex && o.geometry.attributes.normal && shown(o)) meshes.push(o); });
    if (!meshes.length || !meshes.some(o => o.skeleton.bones.some(b => /Bip01/.test(b.name)))) return null;
    const out = { meshes: [] };
    for (const o of meshes) {
      const g = o.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, bones = o.skeleton.bones;
      const torso = [], limb = { R_forearm: [], R_hand: [], L_forearm: [], L_hand: [] }, head = [];
      // (the head: the skin the head carries and whatever hangs under it, the hair's own bones among them)
      const underHead = b => { for (let q = b; q && q.isBone; q = q.parent) { if (/Head$/.test(q.name)) return true; if (/(Neck|Spine)$/.test(q.name)) return false; } return false; };
      const named = bones.map(b => { const m = PART.exec(b.name); if (m) return `${m[1]}_${m[2] === 'Forearm' ? 'forearm' : 'hand'}`; if (underHead(b)) return 'head'; return TORSO.test(b.name) ? 'torso' : ''; });
      const chestBone = bones.map(b => CHEST.test(b.name));
      const chest = [];
      for (let i = 0; i < g.attributes.position.count; i++) {
        let bi = 0, bw = -1;
        for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; bi = si.getComponent(i, k); } }
        const n = named[bi];
        if (n === 'torso') { torso.push(i); chest.push(chestBone[bi]); } else if (n === 'head') { if (i % 3 === 0) head.push(i); } else if (n && i % 5 === 0) limb[n].push(i);
      }
      // the torso's triangles (all three corners torso), its corners numbered in the order of torso
      const slot = new Int32Array(g.attributes.position.count).fill(-1); torso.forEach((i, k) => { slot[i] = k; });
      const tri = [], ix = g.index ? g.index.array : null, nt = (ix ? ix.length : g.attributes.position.count) / 3;
      const chestTri = [];
      for (let t = 0; t < nt; t++) { const a = slot[ix ? ix[t * 3] : t * 3], b = slot[ix ? ix[t * 3 + 1] : t * 3 + 1], c = slot[ix ? ix[t * 3 + 2] : t * 3 + 2]; if (a >= 0 && b >= 0 && c >= 0) { tri.push(a, b, c); if (chest[a] && chest[b] && chest[c]) chestTri.push(a, b, c); } }
      // (a mesh every vertex of which the trunk carries, with nothing of a limb, the head or the legs, is a thing worn on the
      // trunk, not its skin: the camera the one you play wears on its strap, its strap, a bag. Counted as the torso, the
      // player's running hand between the camera at the hip, its strap and the body read 10 cm "inside the torso" on a
      // phone, main's run 578, issue 157. Its triangles are kept apart, wornTri, and a hand inside one of them is its own
      // reading, worn)
      const worn = torso.length === g.attributes.position.count && torso.length > 0;
      out.meshes.push({ o, torso, limb, head, tri: Int32Array.from(worn ? [] : tri), chestTri: Int32Array.from(worn ? [] : chestTri), wornTri: Int32Array.from(worn ? tri : []), pos: new Float32Array(torso.length * 3), M: bones.map(() => new T.Matrix4()) });
    }
    return out;
  }
  const P = [], N = [];
  function skin(m, i, p, nrm) {
    const o = m.o, g = o.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, e = p.e || (p.e = new Float32Array(16));
    e.fill(0);
    for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (!w) continue; const s = m.M[si.getComponent(i, k)].elements; for (let j = 0; j < 16; j++) e[j] += w * s[j]; }
    const x = g.attributes.position.getX(i), y = g.attributes.position.getY(i), z = g.attributes.position.getZ(i);
    p.x = e[0] * x + e[4] * y + e[8] * z + e[12]; p.y = e[1] * x + e[5] * y + e[9] * z + e[13]; p.z = e[2] * x + e[6] * y + e[10] * z + e[14];
    if (nrm) {
      const a = g.attributes.normal.getX(i), b = g.attributes.normal.getY(i), c = g.attributes.normal.getZ(i);
      let u = e[0] * a + e[4] * b + e[8] * c, v = e[1] * a + e[5] * b + e[9] * c, w = e[2] * a + e[6] * b + e[10] * c; const L = Math.hypot(u, v, w) || 1;
      nrm.x = u / L; nrm.y = v / L; nrm.z = w / L;
    }
  }
  // the torso as posed (or, rest, in the model's own pose: arms out, head up), its triangles (key: 'tri', all the torso's;
  // 'chestTri', the spine's alone) in bands 2 cm high; and the depth of a point inside them
  function shape(r, key, rest) {
    const T = window.THREE;
    const bi = new T.Matrix4(), tmp = new T.Matrix4();
    // (the triangles in bands 2 cm high)
    const BAND = 0.02, bands = new Map();
    for (const m of r.meshes) {
      const o = m.o, bones = o.skeleton.bones, inv = o.skeleton.boneInverses;
      // (as the GPU skins it once the mesh's matrices are fresh: attached, the mesh's world and its bind matrix's inverse are
      // one and the same and cancel, and a vertex is the bones' world times their inverses times the bind matrix. Read
      // through o.bindMatrixInverse, which three.js sets only when it updates the mesh's world (the renderer, once a drawn
      // frame), every point lay where the body was at the last frame drawn: 1.7 m off after a short run with frames not
      // drawn, and off by another distance on each mesh brought up to date at another time, so that one mesh's hand was
      // measured against another's chest, issue 157)
      if (o.bindMode === 'detached') bi.multiplyMatrices(o.matrixWorld, tmp.copy(o.bindMatrix).invert()); else bi.identity();
      for (let b = 0; b < bones.length; b++) if (rest) m.M[b].copy(o.matrixWorld); else m.M[b].copy(bi).multiply(tmp.multiplyMatrices(bones[b].matrixWorld, inv[b])).multiply(o.bindMatrix);
      const q = { x: 0, y: 0, z: 0 };
      m.torso.forEach((i, k) => { skin(m, i, q); m.pos[k * 3] = q.x; m.pos[k * 3 + 1] = q.y; m.pos[k * 3 + 2] = q.z; });
      const tri = m[key];
      for (let t = 0; t < tri.length; t += 3) {
        const P = m.pos, ya = P[tri[t] * 3 + 1], yb = P[tri[t + 1] * 3 + 1], yc = P[tri[t + 2] * 3 + 1];
        for (let j = Math.floor(Math.min(ya, yb, yc) / BAND); j <= Math.floor(Math.max(ya, yb, yc) / BAND); j++) { let L = bands.get(j); if (!L) bands.set(j, L = []); L.push(m, t); }
      }
    }
    // a point is inside the torso when a level ray from it meets the torso in every one of eight ways (beside a skirt's
    // flare or a jacket's open front, a ray out to the side meets nothing); its depth is the nearest of those meetings
    const RAYS = 8, dirs = []; for (let k = 0; k < RAYS; k++) dirs.push([Math.cos(k * Math.PI * 2 / RAYS), Math.sin(k * Math.PI * 2 / RAYS)]);
    return (x, y, z) => {
      const L = bands.get(Math.floor(y / BAND)); if (!L) return 0;
      let near = Infinity;
      for (const [dx, dz] of dirs) {
        let best = Infinity;
        for (let k = 0; k < L.length; k += 2) {
          const m = L[k], t = L[k + 1], P = m.pos, a = m[key][t] * 3, b = m[key][t + 1] * 3, c = m[key][t + 2] * 3;
          // (Moller-Trumbore, the ray level: its direction (dx, 0, dz))
          const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2], e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
          const px = -dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y, det = e1x * px + e1y * py + e1z * pz;
          if (Math.abs(det) < 1e-12) continue;
          const f = 1 / det, sx = x - P[a], sy = y - P[a + 1], sz = z - P[a + 2], u = f * (sx * px + sy * py + sz * pz);
          if (u < 0 || u > 1) continue;
          const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x, w = f * (dx * qx + dz * qz);
          if (w < 0 || u + w > 1) continue;
          const d = f * (e2x * qx + e2y * qy + e2z * qz);
          if (d > 0 && d < best) best = d;
        }
        if (best > 0.8) return 0;
        near = Math.min(near, best);
      }
      return near;
    };
  }
  function measure(root) {
    const T = window.THREE;
    let r = cache.get(root);
    if (r === undefined) { r = build(root); cache.set(root, r); }
    if (!r) return null;
    root.updateWorldMatrix(true, true);
    const res = { R_forearm: 0, R_hand: 0, L_forearm: 0, L_hand: 0, held: 0, worn: 0 };
    const where = {};
    const wornAt = r.meshes.some(m => m.wornTri.length) ? shape(r, 'wornTri', false) : null;
    const depth = shape(r, 'tri', false);
    const p = { x: 0, y: 0, z: 0 };
    // (not the forearm's first ELBOW from the elbow: an elbow against one's side, or under a vest's armhole, is the body's own
    // contact, not a limb through it)
    const elbow = {};
    root.traverse(o => { const m = o.isBone && /_([RL])_Forearm$/.exec(o.name); if (m) elbow[m[1]] = o.getWorldPosition(new T.Vector3()); });
    for (const m of r.meshes) for (const part in m.limb) for (const i of m.limb[part]) {
      skin(m, i, p);
      const e = part.endsWith('forearm') && elbow[part[0]]; if (e && Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z) < ELBOW) continue;
      const d = depth(p.x, p.y, p.z); if (d > res[part]) { res[part] = d; where[part] = [p.x, p.y, p.z]; }
      if (wornAt) { const dw = wornAt(p.x, p.y, p.z); if (dw > res.worn) { res.worn = dw; where.worn = [p.x, p.y, p.z]; } }
    }
    const v = new T.Vector3();
    // what is held in a hand, as the rig holds it now: a mesh that is no part of the skin, hung under a hand (the phone,
    // the book, the cup), the corners and the middles of its box
    root.traverse(o => {
      if (!o.isMesh || o.isSkinnedMesh || !o.geometry || !o.geometry.attributes.position) return;
      let bone = null, vis = true; for (let q = o; q && q !== root; q = q.parent) { if (!q.visible) vis = false; if (!bone && q.isBone) bone = q; }
      if (!vis || !bone || !/_[RL]_(Hand|Forearm|Finger\d*)$/.test(bone.name)) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox;
      for (let i = 0; i < 27; i++) {
        v.set([b.min.x, (b.min.x + b.max.x) / 2, b.max.x][i % 3], [b.min.y, (b.min.y + b.max.y) / 2, b.max.y][(i / 3 | 0) % 3], [b.min.z, (b.min.z + b.max.z) / 2, b.max.z][i / 9 | 0]).applyMatrix4(o.matrixWorld);
        const d = depth(v.x, v.y, v.z); if (d > res.held) res.held = d;
      }
    });
    for (const k in res) res[k] = +res[k].toFixed(3);
    if (window.__holdDepth.where) res.where = where;
    return res;
  }
  // the head in its own chest (issue 157): how deep the skin the head carries (the face, the jaw, the hair, a ponytail)
  // goes inside the skin of the spine (the chest, the back; not the neck or the collarbones, which a chin or the hair meets
  // as it should), less what it read in the model's own pose (hair that lies on the shoulders there). tools/clip_probe.js
  // read this against ellipsoids fitted to the parts, and a man bent over his camera read 3.8 cm where his skin had 1.4
  function head(root) {
    let r = cache.get(root);
    if (r === undefined) { r = build(root); cache.set(root, r); }
    if (!r || !r.meshes.some(m => m.head.length && m.chestTri.length)) return null;
    root.updateWorldMatrix(true, true);
    const p = { x: 0, y: 0, z: 0 };
    if (!r.headRest) {
      const at = shape(r, 'chestTri', true);
      r.headRest = r.meshes.map(m => Float32Array.from(m.head, i => { skin(m, i, p); return at(p.x, p.y, p.z); }));
    }
    const at = shape(r, 'chestTri', false);
    let deep = 0, where = null;
    r.meshes.forEach((m, k) => m.head.forEach((i, j) => { skin(m, i, p); const d = at(p.x, p.y, p.z) - r.headRest[k][j]; if (d > deep) { deep = d; where = [p.x, p.y, p.z]; } }));
    return { head: +deep.toFixed(3), where };
  }
  window.__holdDepth = { measure, head };
}

module.exports = { pageSide, script: `(${pageSide.toString()})()`, LIMIT, ALLOW, limitOf };
