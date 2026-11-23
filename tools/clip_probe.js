// What stands inside what, measured (issue 126). The page side of it is put into the page before the game starts
// (install), and the game calls it every frame it has run (game.js: window.__probe.frame), drawn or not, with the people
// as they are about to be drawn. Nothing here is judged by eye: every case is a distance between things the game holds
// or a depth read from the bones of the models as they are posed.
//
//   bodies   the player, each of the story's people (the living and the afterimages), the guide along his spine, the
//            map's NPCs: every pair of them, by the distance between their middles in plan (the guide: to his spine,
//            less his flank). Under NEAR (0.45 m, the crowd's own measure, game.js bodiesCheck) is one body in another.
//   limbs    each model is cut into its parts by the bone that carries each vertex (pelvis, the three of the spine,
//            neck, head, upper arms, forearms, hands, thighs, calves, feet; for an animal, every bone that carries
//            enough of it). A part is an ellipsoid fitted to its vertices in the bone's own space, and a few of its
//            outermost vertices are its points. Each frame the points of the hands, forearms, feet, calves and head, and
//            of anything carried (a camera on its strap, a bag), are looked for inside the parts of the body that
//            carries them and inside those of anyone within reach. Its own body is measured from the rest pose: the
//            depth a point has there (a collar round a neck, hair on a shoulder) is taken off.
//   feet     the lowest of each foot's vertices against the floor the walker stands on (nav.floorAt): under it, sunk;
//            the lower foot over it, floating.
//   things   each body's middle against the walls (nav.push), the posts, trunks, bollards and boxes (posts.pushOut),
//            the cars and the helicopter (OECars.pushOut on the game's boxes) and a floor over its head (nav.bodyIn);
//            and the points of the hands, the head and what is carried against the walls and the posts.
//   hold     the near crowd (the skinned walkers people.js draws as people, ctx.crowdDraw.active), the map's people and the
//            story's people within HOLD_R of the camera, a few times a second: how deep each forearm, hand and what the hand
//            holds go inside the person's own torso (tools/hold_depth.js, the measure tools/hold_check.js takes of every cast
//            avatar through every held clip). Deeper than its LIMIT for three readings fails the play: the owner saw a
//            texting forearm in a jacket at the crossing in the opening.
//   seats    in the helicopter and in a car: the seat under the pelvis, the floor under the feet and the roof over the
//            head, by rays into the vehicle's own model, once a second.
//
// Every case is kept once, with where the story was when it began (frame, phase, beat), the place, its greatest depth
// and how many frames it lasted. tools/story_play.js prints them all and fails the play on those in `fails`.
//   const probe = require('./clip_probe'); await probe.install(page); ... const R = await probe.report(page); probe.print(R)
const NEAR = 0.45; // m between two people's middles: nearer is one inside the other (a shoulder is 0.2 to 0.23 from the spine)

function pageSide(NEAR, HOLD) {
  const MAIN = /(Pelvis|Spine2|Spine1|Spine|Neck|Head|Clavicle|UpperArm|Forearm|Hand|Thigh|Calf|Foot)$/;
  const DISTAL = /(Forearm|Hand|Calf|Foot|Head)$/, TORSO = /(Pelvis|Spine2|Spine1|Spine|Thigh|Head|Calf)$/;
  const P = window.__probe = { cases: new Map(), seen: new Map(), frames: 0, t: 0, rigs: new WeakMap(), err: null, seatT: 0, NEAR };
  let T = null, v = null, v2 = null, m = null;
  const note = (kind, a, b, depth, ctx, x, y, z, extra) => {
    const key = `${kind}|${a}|${b}|${ctx.at.replace(/ \((Stop|talk)\)/g, '')}`;
    let c = P.cases.get(key);
    if (!c) { if (P.cases.size > 3000) return; c = { kind, a, b, at: ctx.at, depth: 0, n: 0, x: +x.toFixed(2), y: +y.toFixed(2), z: +(z || 0).toFixed(2), f0: P.frames, mode: ctx.player.mode }; P.cases.set(key, c); }
    c.n++; c.f1 = P.frames;
    if (depth > c.depth) { c.depth = +depth.toFixed(3); if (extra) c.extra = extra; }
  };
  // a model's parts: by the bone that carries each vertex most
  const build = (root, sole) => {
    const parts = new Map(), meshes = [];
    root.traverse(o => { if (o.isSkinnedMesh && o.skeleton && o.geometry.attributes.skinIndex) meshes.push(o); });
    if (!meshes.length) return null;
    const human = meshes.some(o => o.skeleton.bones.some(b => /Bip01/.test(b.name)));
    const partOf = b => { if (!human) return b; for (let q = b; q && q.isBone; q = q.parent) if (MAIN.test(q.name)) return q; return b; };
    const p = new T.Vector3(), q = new T.Vector3(), inv = new T.Matrix4();
    for (const o of meshes) {
      const g = o.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, bones = o.skeleton.bones, binv = o.skeleton.boneInverses;
      for (let i = 0; i < pos.count; i++) {
        let bi = 0, bw = -1;
        for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; bi = si.getComponent(i, k); } }
        const b = bones[bi]; if (!b) continue;
        const pb = partOf(b), pi = bones.indexOf(pb); if (pi < 0) continue;
        p.fromBufferAttribute(pos, i).applyMatrix4(o.bindMatrix);
        q.copy(p).applyMatrix4(binv[pi]);
        let part = parts.get(pb);
        if (!part) parts.set(pb, part = { bone: pb, name: pb.name.replace(/^Bip01_?/, '').replace(/_/g, ' '), loc: [], bind: [], bindInv: binv[pi].clone(), bindMat: binv[pi].clone().invert() });
        part.loc.push(q.x, q.y, q.z);
      }
    }
    const out = [];
    for (const part of parts.values()) {
      const n = part.loc.length / 3; if (n < 24) continue;
      const ax = [0, 1, 2].map(k => { const a = []; for (let i = 0; i < n; i++) a.push(part.loc[i * 3 + k]); return a; });
      const lo = [], hi = [], pts = [];
      for (let k = 0; k < 3; k++) {
        const s = ax[k].slice().sort((a, b) => a - b); lo[k] = s[Math.floor(n * 0.08)]; hi[k] = s[Math.min(n - 1, Math.floor(n * 0.92))];
        let a = 0, b = 0; for (let i = 1; i < n; i++) { if (ax[k][i] < ax[k][a]) a = i; if (ax[k][i] > ax[k][b]) b = i; }
        for (const i of [a, b]) pts.push(new T.Vector3(ax[0][i], ax[1][i], ax[2][i]));
      }
      part.c = new T.Vector3((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2);
      part.h = new T.Vector3(Math.max(1e-6, (hi[0] - lo[0]) / 2), Math.max(1e-6, (hi[1] - lo[1]) / 2), Math.max(1e-6, (hi[2] - lo[2]) / 2));
      pts.push(part.c.clone());
      part.pts = pts; part.n = n; part.inv = new T.Matrix4(); part.rest = new Map();
      out.push(part);
    }
    // what is carried: a thing that is no part of the skin, hung from a bone (a camera, a bag): the corners of its box
    const carried = [];
    root.traverse(o => {
      if (!o.isMesh || o.isSkinnedMesh || !o.geometry || !o.geometry.attributes.position) return;
      let bone = null; for (let q2 = o.parent; q2 && q2 !== root; q2 = q2.parent) if (q2.isBone) { bone = q2; break; }
      if (!bone) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const bb = o.geometry.boundingBox, pts = [];
      for (let i = 0; i < 8; i++) pts.push(new T.Vector3(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z));
      pts.push(bb.getCenter(new T.Vector3()));
      carried.push({ o, pts, name: o.name || (o.parent && o.parent.name) || 'carried', bone });
    });
    const rig = { parts: out, carried, human, soles: null, meshes, hops: new Map() };
    // (how far apart two parts are along the skeleton: neighbours bend into each other at their joint, and are not measured)
    const chain = b => { const c = []; for (let q2 = b; q2 && q2.isBone; q2 = q2.parent) c.push(q2); return c; };
    const idx = new Map(out.map((x, i) => [x.bone, i]));
    const up = b => { for (let q2 = b.parent; q2 && q2.isBone; q2 = q2.parent) if (idx.has(q2)) return q2; return null; };
    const steps = (a, b) => { const A = [], B = []; for (let q2 = a; q2; q2 = up(q2)) A.push(q2); for (let q2 = b; q2; q2 = up(q2)) B.push(q2); for (let i = 0; i < A.length; i++) { const j = B.indexOf(A[i]); if (j >= 0) return i + j; } return 99; };
    void chain;
    for (const a of out) for (const b of out) if (a !== b) rig.hops.set(`${a.name}|${b.name}`, steps(a.bone, b.bone));
    // the rest pose's own depths: each point of a part inside each other part, as the model was bound
    for (const a of out) for (const b of out) {
      if (a === b) continue;
      const d = a.pts.map(pt => inside(q.copy(pt).applyMatrix4(a.bindMat).applyMatrix4(b.bindInv), b, null));
      if (d.some(x => x > 0)) a.rest.set(b, d);
    }
    return rig;
  };
  // a point in a part's own space: how deep inside its ellipsoid (0: outside). With the part's world matrix, in metres
  function inside(l, part, world) {
    const dx = (l.x - part.c.x) / part.h.x, dy = (l.y - part.c.y) / part.h.y, dz = (l.z - part.c.z) / part.h.z, s = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (s >= 1) return 0;
    if (!world) return 1 - s; // (as a share of the way in: the rest pose's)
    const k = s > 1e-6 ? 1 / s : 0;
    v2.set(part.c.x + (l.x - part.c.x) * k, part.c.y + (l.y - part.c.y) * k, part.c.z + (l.z - part.c.z) * k);
    if (!k) v2.set(part.c.x + part.h.x, part.c.y, part.c.z);
    const a = v2.clone().applyMatrix4(world), b = l.clone().applyMatrix4(world);
    return a.distanceTo(b);
  }
  const rigOf = (root, who) => {
    if (!root) return null;
    let r = P.rigs.get(root);
    // (someone whose model has not come yet has nothing to measure: looked at again later, when it may have)
    if (r === undefined || (r && r.none && P.frames - r.at > 90) || (r && r.none && who === 'look')) { try { r = build(root) || { none: true, at: P.frames }; } catch (e) { r = { none: true, at: 1e12 }; P.err = `${who}: ${e && e.message}`; } P.rigs.set(root, r); }
    return r.none ? null : r;
  };
  const pose = (root, rig) => {
    root.updateWorldMatrix(true, true);
    for (const part of rig.parts) part.inv.copy(part.bone.matrixWorld).invert();
  };
  // the lowest of each foot (a person), or of the whole animal: found once, in the pose it is first seen in
  const soles = (rig) => {
    if (rig.soles) return rig.soles;
    // (an animal: its skin itself, every vertex of the lowest band of it as it was bound, skinned as the GPU skins it. Moved
    // by its one strongest bone, the folded hock of the guide sitting read 10 cm under the floor where the skin, blended
    // over its bones, is 1.4 cm under it at most: issue 157)
    if (!rig.human && rig.meshes.length) {
      const band = [];
      for (const o of rig.meshes) { const pos = o.geometry.attributes.position; let lo = Infinity, hi = -Infinity; const ys = new Float32Array(pos.count); for (let i = 0; i < pos.count; i++) { ys[i] = v.fromBufferAttribute(pos, i).applyMatrix4(o.bindMatrix).y; lo = Math.min(lo, ys[i]); hi = Math.max(hi, ys[i]); } const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight; for (let i = 0; i < pos.count; i++) if (ys[i] < lo + (hi - lo) * 0.12) { let bi = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > bw) { bw = w; bi = si.getComponent(i, k); } } band.push([o, i, (o.skeleton.bones[bi] || {}).name || '?']); } }
      return (rig.soles = [{ name: 'paws', skin: band }]);
    }
    const feet = rig.human ? rig.parts.filter(x => /Foot$/.test(x.bone.name)) : [null];
    rig.soles = feet.map(part => {
      const cand = [];
      const from = part ? [part] : rig.parts;
      for (const pt of from) for (let i = 0; i < pt.n; i++) { v.set(pt.loc[i * 3], pt.loc[i * 3 + 1], pt.loc[i * 3 + 2]); const y = v.clone().applyMatrix4(pt.bone.matrixWorld).y; cand.push([y, pt, v.clone()]); }
      cand.sort((a, b) => a[0] - b[0]);
      return { name: part ? part.name : 'paws', pts: cand.slice(0, part ? 10 : 24) };
    });
    return rig.soles;
  };
  const frame = ctx => {
    T = ctx.THREE; if (!v) { v = new T.Vector3(); v2 = new T.Vector3(); m = new T.Matrix4(); }
    P.frames++;
    const { player, nav } = ctx, at = ctx.at || '';
    // who is there
    const who = [];
    const onFoot = player.mode === 'foot' && player.rig && player.rig.root && player.rig.root.visible;
    if (onFoot) who.push({ name: 'you', x: player.x, y: player.y, z: player.z, root: player.rig.root, kind: 'you', floorZ: player.ground ? player.floorZ : null, moving: player.speed > 0.05 });
    for (const f of ctx.storyFigs) if (f.rig && f.rig.root && f.rig.root.visible) who.push({ name: (f.name || f.character) + (f.ghost ? ' (afterimage)' : ''), x: f.x, y: f.y, z: f.z, root: f.rig.root, kind: 'story', moving: !!f.to });
    const px = onFoot ? player.x : ctx.camera.position.x, py = onFoot ? player.y : -ctx.camera.position.z;
    for (const q of ctx.npcs) if (q.rig && q.rig.root && q.rig.root.visible && !q.away && (Math.hypot(q.x - px, q.y - py) < 40 || who.some(w => Math.hypot(q.x - w.x, q.y - w.y) < 4))) who.push({ name: `npc ${q.name || q.id}`, x: q.x, y: q.y, z: q.z, root: q.rig.root, kind: 'npc', seated: !!(q.sit || q.seat || q.pose === 'sit') });
    const g = ctx.guideSeg && ctx.guideSeg();
    const seenKey = at.replace(/ \((Stop|talk)\)/g, '');
    { let s = P.seen.get(seenKey); if (!s) P.seen.set(seenKey, s = { n: 0, who: {}, mode: {} }); s.n++; s.mode[player.mode] = (s.mode[player.mode] || 0) + 1; for (const w of who) s.who[w.name] = (s.who[w.name] || 0) + 1; if (g) s.who.guide = (s.who.guide || 0) + 1; }
    // bodies: middle to middle
    for (let i = 0; i < who.length; i++) for (let j = i + 1; j < who.length; j++) {
      const a = who[i], b = who[j];
      if (a.kind === 'npc' && b.kind === 'npc') continue; // (the map's own, where it put them: tools/clip_check.js)
      if (Math.abs((a.z || 0) - (b.z || 0)) > 1.5) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < NEAR) note('bodies', a.name, b.name, NEAR - d, ctx, a.x, a.y, a.z, `${d.toFixed(2)} m apart`);
    }
    if (g) for (const a of who) {
      if (Math.abs((a.z || 0) - (g[5] || 0)) > 1.5) continue;
      const dx = g[2] - g[0], dy = g[3] - g[1], L2 = dx * dx + dy * dy, t = L2 > 1e-9 ? Math.max(0, Math.min(1, ((a.x - g[0]) * dx + (a.y - g[1]) * dy) / L2)) : 0;
      const d = Math.hypot(g[0] + dx * t - a.x, g[1] + dy * t - a.y) - g[4];
      if (d < 0.2) note('bodies', a.name, 'guide', 0.2 - d, ctx, a.x, a.y, a.z, `${d.toFixed(2)} m from his flank`);
    }
    // things: each middle against walls, posts, cars, a floor over the head
    const boxes = (x, y) => { try { return ctx.carBoxes(x, y, 6); } catch (e) { return []; } };
    // (a post: a lamp, a signal, a trunk, a bollard, a belt's column, a box; not the place a map's NPC or one of the
    // story's people holds, which the bodies above measure)
    let postKind = '';
    const postAt = (x, y, z, r) => { let deep = 0; ctx.posts.near(x, y, r + 1.5, q => { if (q.kind === 'npc' || q.kind === 'story' || Math.abs((q.z || 0) - z) > 2.2) return; const d = r + (q.r || 0.1) - Math.hypot(q.x - x, q.y - y); if (d > deep) { deep = d; postKind = q.kind || 'post'; } }); return deep; };
    const thingAt = (name, x, y, z, r) => {
      const w = nav.push(x, y, z, r); let d = w ? Math.hypot(w.x - x, w.y - y) : 0;
      if (d > 0.03) note('wall', name, 'a wall', d, ctx, x, y, z);
      d = postAt(x, y, z, r);
      if (d > 0.03) note('post', name, `a ${postKind}`, d, ctx, x, y, z);
      const bx = boxes(x, y);
      if (bx.length && window.OECars) { const c = OECars.pushOut(x, y, z, r, bx); d = c && c.hit ? Math.hypot(c.x - x, c.y - y) : 0; if (d > 0.03) note('car', name, 'a car or the helicopter', d, ctx, x, y, z); }
      if (nav.bodyIn(x, y, z)) note('floor', name, 'a floor at its head', 0.5, ctx, x, y, z);
    };
    for (const a of who) if (a.kind !== 'you' || !a.moving) thingAt(a.name, a.x, a.y, a.z, a.kind === 'you' ? 0.2 : 0.22);
    if (g) { thingAt('guide (one end)', g[0], g[1], g[5] || 0, g[4]); thingAt('guide (other end)', g[2], g[3], g[5] || 0, g[4]); }
    // limbs and feet, from the bones
    const posed = [];
    for (const a of who) { if (a.kind === 'npc' && Math.hypot(a.x - px, a.y - py) > 12) continue;
      if (Math.hypot(a.root.position.x - a.x, a.root.position.z + a.y) > 0.6 || Math.abs(a.root.position.y - (a.z || 0)) > 1.2) continue; // (not yet put where it stands: under the title)
      const rig = rigOf(a.root, a.name); if (rig) { pose(a.root, rig); posed.push([a, rig]); } }
    const gd = ctx.guide;
    if (g && gd && gd.root && gd.root.visible) { const rig = rigOf(gd.root, 'guide'); if (rig) { pose(gd.root, rig); posed.push([{ name: 'guide', x: gd.x, y: gd.y, z: gd.z, root: gd.root, kind: 'guide', moving: gd.state !== 'sit' }, rig]); } }
    const wallAt = (x, y, z) => !nav.free(x, y, z - 0.03, z + 0.03, 0.02);
    for (const [a, rig] of posed) {
      // feet
      // (the floor the body stands on, and under each foot the same floor as it slopes: a kerb, a step or a wall's top
      // beside the foot is another floor, and measured against it a planted foot read 8 cm sunk)
      const fz = a.z || 0;
      const floor = (x, y) => { const f = nav.floorAt(x, y, fz + 0.05), h = f ? f.z : Math.max(0, nav.terrain(x, y)); return Math.abs(h - fz) < 0.12 ? h : fz; };
      if (!(a.kind === 'you' && !player.ground) && !a.seated) {
        let low = Infinity, lowName = '';
        for (const s of soles(rig)) {
          // (each foot over the floor under it: on a slope or a step the floor at the body's middle is not the foot's)
          let y = Infinity;
          let at = '';
          if (s.skin) for (const [o, i, bn] of s.skin) { o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld); const h = v.y - floor(v.x, -v.z); if (h < y) { y = h; at = bn; } }
          else for (const [, pt, l] of s.pts) { v.copy(l).applyMatrix4(pt.bone.matrixWorld); const h = v.y - floor(v.x, -v.z); if (h < y) y = h; }
          if (y < low) { low = y; lowName = s.name; }
          if (y < -0.03) note('sunk', a.name, s.name, -y, ctx, a.x, a.y, a.z, `floor ${fz.toFixed(2)}${at ? `, under ${at}` : ''}`);
        }
        if (low < Infinity && low > 0.04 && !a.moving) note('floating', a.name, lowName, low, ctx, a.x, a.y, a.z, `floor ${fz.toFixed(2)}`);
      }
      if (!rig.human) continue;
      // its own body
      for (const pa of rig.parts) {
        if (!DISTAL.test(pa.bone.name)) continue;
        for (const pb of rig.parts) {
          if (pa === pb || !TORSO.test(pb.bone.name) || rig.hops.get(`${pa.name}|${pb.name}`) < 2) continue;
          if (/Head$/.test(pa.bone.name) && !/(Spine2|Spine1)$/.test(pb.bone.name)) continue;
          const rest = pa.rest.get(pb);
          for (let i = 0; i < pa.pts.length; i++) {
            v.copy(pa.pts[i]).applyMatrix4(pa.bone.matrixWorld);
            const wx = v.x, wy = v.y, wz = v.z, l = v.applyMatrix4(pb.inv);
            const share = inside(l, pb, null); if (!share || (rest && share <= rest[i] + 0.05)) continue;
            const d = inside(l, pb, pb.bone.matrixWorld) * (rest && rest[i] ? Math.max(0, 1 - rest[i] / share) : 1);
            if (d > 0.03) note('limb', a.name, `own ${pa.name} in own ${pb.name}`, d, ctx, wx, -wz, wy);
          }
        }
      }
      for (const c of rig.carried) {
        if (!c.o.visible || !c.o.parent) continue; let vis = true; for (let q = c.o; q && q !== a.root; q = q.parent) if (!q.visible) { vis = false; break; } if (!vis) continue;
        for (const pb of rig.parts) {
          if (!TORSO.test(pb.bone.name) || pb.bone === c.bone) continue;
          let deep = 0; for (const pt of c.pts) { const d = inside(v.copy(pt).applyMatrix4(c.o.matrixWorld).applyMatrix4(pb.inv), pb, pb.bone.matrixWorld); if (d > deep) deep = d; }
          if (deep > 0.04) note('carried', a.name, `${c.name} in own ${pb.name}`, deep, ctx, a.x, a.y, a.z);
        }
      }
      // the walls and posts at its hands, head and what it carries
      if (a.kind !== 'npc') {
        for (const pa of rig.parts) {
          if (!/(Hand|Head|Forearm)$/.test(pa.bone.name)) continue;
          for (const pt of pa.pts) {
            v.copy(pt).applyMatrix4(pa.bone.matrixWorld);
            const x = v.x, y = -v.z, z = v.y;
            if (wallAt(x, y, z)) {
              // (how deep: back towards the body's middle until it is out)
              let d = 0.02; const dx = a.x - x, dy = a.y - y, L = Math.hypot(dx, dy) || 1;
              while (d < L && wallAt(x + dx / L * d, y + dy / L * d, z)) d += 0.02;
              if (d > 0.04) note('limb-wall', a.name, `${pa.name} in a wall`, d, ctx, x, y, z);
            }
            const d2 = postAt(x, y, a.z || 0, 0.01);
            if (d2 > 0.04) note('limb-post', a.name, `${pa.name} in a ${postKind}`, d2, ctx, x, y, z);
          }
        }
      }
    }
    // each other's bodies: the points of one inside the parts of another within reach
    for (let i = 0; i < posed.length; i++) for (let j = 0; j < posed.length; j++) {
      if (i === j) continue;
      const [a, ra] = posed[i], [b, rb] = posed[j];
      if (a.kind === 'npc' && b.kind === 'npc') continue;
      if (Math.hypot(a.x - b.x, a.y - b.y) > 1.6 || Math.abs((a.z || 0) - (b.z || 0)) > 1.5) continue;
      let deep = 0, what = '';
      const test = (wp, name) => { for (const pb of rb.parts) { const d = inside(v2.copy(wp).applyMatrix4(pb.inv).clone(), pb, pb.bone.matrixWorld); if (d > deep) { deep = d; what = `${name} in ${b.name}'s ${pb.name}`; } } };
      for (const pa of ra.parts) for (const pt of pa.pts) test(v.copy(pt).applyMatrix4(pa.bone.matrixWorld), pa.name);
      for (const c of ra.carried) if (c.o.visible) for (const pt of c.pts) test(v.copy(pt).applyMatrix4(c.o.matrixWorld), c.name);
      if (deep > 0.02) note('touch', a.name, b.name, deep, ctx, a.x, a.y, a.z, what);
    }
    // hold: forearms and hands in their own torsos, the near crowd's, the map's people's and the story's (every HOLD.every
    // frames, the camera's nearest HOLD.n within HOLD.r: the measure skins every vertex)
    if (window.__holdDepth && P.frames % HOLD.every === 0) {
      const cam = ctx.camera.position, list = [];
      const add = (root, name) => { if (!root || !root.visible) return; let vis = true; for (let q = root; q; q = q.parent) if (!q.visible) { vis = false; break; } if (!vis) return; const d = cam.distanceTo(root.position); if (d < HOLD.r) list.push([d, root, name]); };
      if (ctx.crowdDraw && ctx.crowdDraw.active) for (const [i, r] of ctx.crowdDraw.active) add(r.root, `walker ${i} (${(r.character || '').replace(/^R_/, '')}${r.look && r.look.clip ? ', ' + r.look.clip : ''})`);
      for (const q of ctx.npcs) if (q.rig && !q.away) add(q.rig.root, `npc ${q.name || q.id}`);
      for (const f of ctx.storyFigs) if (f.rig) add(f.rig.root, f.name || f.character);
      list.sort((a, b) => a[0] - b[0]);
      for (const [, root, name] of list.slice(0, HOLD.n)) {
        const m = window.__holdDepth.measure(root); if (!m) continue;
        let deep = 0, part = ''; for (const k in m) if (m[k] > deep) { deep = m[k]; part = k; }
        if (deep > HOLD.note) note('hold', name.replace(/^walker \d+ /, 'walker '), part.replace('_', ' '), deep, ctx, root.position.x, -root.position.z, root.position.y);
      }
    }
    // seats: in the helicopter or a car, once a second
    const now = performance.now();
    if ((player.mode === 'heli' || player.mode === 'car') && player.rig && player.rig.root && player.rig.root.visible && now - P.seatT > 1000) {
      P.seatT = now;
      const veh = player.mode === 'heli' ? ctx.heli && (ctx.heli.root || ctx.heli.group || ctx.heli.model) : ctx.car && (ctx.car.root || ctx.car.group || (ctx.car.D && ctx.car.D.root));
      const rig = rigOf(player.rig.root, 'you');
      if (veh && rig) {
        pose(player.rig.root, rig); veh.updateWorldMatrix(true, true);
        const ray = new T.Raycaster(); ray.firstHitOnly = false;
        const skip = o => { for (let q = o; q; q = q.parent) if (q === player.rig.root) return true; return false; };
        const cast = (from, dir, far) => { ray.set(from, dir); ray.far = far; ray.near = 0; const h = ray.intersectObject(veh, true).filter(x => !skip(x.object) && x.object.visible); return h.length ? h[0].distance : null; };
        const part = n => rig.parts.find(x => x.bone.name.endsWith(n));
        const world = (pt, l) => l.clone().applyMatrix4(pt.bone.matrixWorld);
        const pel = part('Pelvis'), head = part('Head');
        const name = player.mode === 'heli' ? 'the helicopter' : 'the car';
        if (pel) {
          // (from the pelvis's middle down: the seat should lie at the pelvis's underside, within a few centimetres)
          const c = world(pel, pel.c); let low = Infinity; for (const pt of pel.pts) low = Math.min(low, world(pel, pt).y);
          const d = cast(c, new T.Vector3(0, -1, 0), 1.5), under = c.y - low;
          if (d == null) note('seat', 'you', `${name}: no seat under the pelvis`, 1, ctx, player.x, player.y, player.z);
          else if (d < under - 0.06) note('seat', 'you', `${name}: sunk in the seat`, under - d, ctx, player.x, player.y, player.z);
          else if (d > under + 0.08) note('seat', 'you', `${name}: over the seat`, d - under, ctx, player.x, player.y, player.z);
        }
        if (head) {
          const c = world(head, head.c); let top = -Infinity; for (const pt of head.pts) top = Math.max(top, world(head, pt).y);
          const d = cast(c, new T.Vector3(0, 1, 0), 1.2);
          if (d != null && d < top - c.y - 0.01) note('seat', 'you', `${name}: head through the roof`, top - c.y - d, ctx, player.x, player.y, player.z);
        }
        for (const s of soles(rig)) {
          let lowP = null, y = Infinity; for (const [, pt, l] of s.pts) { const w = world(pt, l); if (w.y < y) { y = w.y; lowP = w; } }
          if (!lowP) continue;
          const up = lowP.clone(); up.y += 0.25;
          const d = cast(up, new T.Vector3(0, -1, 0), 1.2);
          if (d != null && d < 0.25 - 0.05) note('seat', 'you', `${name}: ${s.name} under the floor`, 0.25 - d, ctx, player.x, player.y, player.z);
          else if (d != null && d > 0.25 + 0.12) note('seat', 'you', `${name}: ${s.name} over the floor`, d - 0.25, ctx, player.x, player.y, player.z);
        }
        for (const pa of rig.parts) if (/(Hand|Forearm|Calf|Thigh)$/.test(pa.bone.name)) {
          // (a limb through the shell: from the pelvis out to each of its points, the first thing of the vehicle met on the way)
          const c = pel ? world(pel, pel.c) : null; if (!c) break;
          for (const pt of pa.pts) { const w = world(pa, pt), dir = w.clone().sub(c), L = dir.length(); if (L < 0.05) continue; const d = cast(c, dir.normalize(), L); if (d != null && L - d > 0.05 && d > 0.25) { note('seat', 'you', `${name}: ${pa.name} through a part of it`, L - d, ctx, player.x, player.y, player.z); break; } }
        }
      }
    }
  };
  // (for tools/clip_look.js: the lowest point of each foot of a model as it is posed now, in the world)
  P.solesOf = root => { T = window.THREE; if (!v) { v = new T.Vector3(); v2 = new T.Vector3(); m = new T.Matrix4(); } const rig = rigOf(root, 'look'); if (!rig) return []; pose(root, rig);
    return soles(rig).map(s => { let low = null; for (const [, pt, l] of s.pts) { const w = l.clone().applyMatrix4(pt.bone.matrixWorld); if (!low || w.y < low.y) low = w; } return { side: s.name, x: low.x, y: low.y, z: low.z }; }); };
  P.frame = ctx => { try { frame(ctx); } catch (e) { if (!P.err) P.err = `${e && e.message} ${(e && e.stack || '').split('\n')[1] || ''}`; } };
  P.out = () => ({ frames: P.frames, err: P.err, cases: [...P.cases.values()], seen: [...P.seen.entries()].map(([at, s]) => Object.assign({ at }, s)) });
}

// the cases that fail a play: one body in another (the player, the story's people, the guide; a map's NPC against the
// player or the story's people too), and a foot well under or over its floor
// (a foot is told from the lowest vertices its bone carried in the pose it was first seen in. The first whole play after
// the fix read 3 to 10 cm under the floor for the walkers of frame 7, for Yuna and for the guide's paws, where
// tools/clip_look.js had a standing sole within a centimetre of the paving drawn: readings that small are printed for a
// look, and the play fails on a foot more than FOOT under or over its floor, someone standing in or over the ground)
const FOOT = 0.15;
// (the guide against someone for a frame or two is him making way: run at from 1.3 m he is off the player in the next
// frame, companion.js keepOff; three frames or more is him standing in them)
// (a forearm or a hand in its own body: deeper than tools/hold_depth.js's LIMIT for three readings, a third of a second
// apart at the story's pace. The arms are moved out over the clip by springs (people.js armsClear), which may let a hand that
// meets the body at speed in by a centimetre for a frame or two)
const HOLD = { every: 15, r: 12, n: 10, note: 0.012 };
const H = require('./hold_depth');
// (issue 157: Yuna's 8 to 9 cm was real, her soles under the sky lobby's planks as drawn, for the whole story: someone
// standing still with a foot sunk past STAND for more than STAND_N frames fails too, the player, the story's people,
// and the map's NPCs alike. A step read a few cm for a few frames, and still prints. Not the guide: sitting, his paws
// read 11 cm for a hundred frames on main as it was, a reading of his sit pose not yet looked at in a still, issue 157)
// (and the guide's body in a wall for more than WALL_N frames: he stood in the roof's glass for 492 frames of frame 4)
const STAND = 0.07, STAND_N = 60, WALL_N = 30;
// (issue 157 again, on 8ff6099: the guide's paws read 4 to 11 cm under the floor through every beat of frames 1 and 2,
// 67 frames at frame 2's shutter, the floors there flat to 2 cm. The model's own sit is 1.4 cm low at most
// (blender/build_dog.py's Akita); it was his hind feet as the crossfade between a clip and the sit folded them, up to 5 cm
// in the model by itself, and held halfway by a Stop. Now, while that crossfade runs, he is lifted by any paw his skin
// puts under its floor (companion.js onSoles); paws past PAW for more than PAW_N frames fail.
// And the player's hand in someone run at: a hand of yours more than TOUCH_YOU in anyone for two frames or more fails. For
// one frame, as you are stopped against them, it prints: at 0.57 m from an NPC's middle (a post of 0.22) the leading hand
// read 4 to 6 cm in Aoi's back for a frame, and a talker's arm out to her side met it at 0.63 and at 0.67 m alike, by the
// parts' ellipsoids. Kept further off, the player's few centimetres decided between two ways of the same length, and the
// guide's lost sign pointed down the other one (tools/guide_way.js f3); issue 157)
const PAW = 0.05, PAW_N = 30, TOUCH_YOU = 0.04;
const fails = c => (c.kind === 'bodies' && (c.b !== 'guide' || c.n >= 3)) || ((c.kind === 'sunk' || c.kind === 'floating') && !c.a.startsWith('npc ') && c.n >= 3 && c.depth > FOOT)
  || (c.kind === 'hold' && c.n >= 3 && c.depth > H.limitOf(c.a))
  || (c.kind === 'sunk' && c.a !== 'guide' && c.n > STAND_N && c.depth > STAND) || (c.kind === 'wall' && /^guide/.test(c.a) && c.n > WALL_N && c.depth > 0.1)
  || (c.kind === 'sunk' && c.a === 'guide' && c.n > PAW_N && c.depth > PAW) || (c.kind === 'touch' && c.a === 'you' && c.b !== 'guide' && c.n >= 2 && c.depth > TOUCH_YOU);

async function install(page) { await page.addInitScript(H.script); await page.addInitScript(`(${pageSide.toString()})(${NEAR}, ${JSON.stringify(HOLD)})`); }
async function report(page) { return page.evaluate(() => (window.__probe ? window.__probe.out() : null)).catch(() => null); }
const WORD = { bodies: 'one body in another', touch: 'a part of one in another', limb: 'a limb in its own body', carried: 'what is carried in its bearer', hold: 'a forearm or a hand in its own torso', 'limb-wall': 'a limb in a wall', 'limb-post': 'a limb in a post', wall: 'a body in a wall', post: 'a body in a post', car: 'a body in a car', floor: 'a floor through a body', sunk: 'a foot under the floor', floating: 'feet over the floor', seat: 'a seat' };
function print(R, log = console.log) {
  if (!R) { log('clip: nothing measured (the page had no probe)'); return { hard: [], all: [] }; }
  if (R.err) log(`clip: the probe threw: ${R.err}`);
  const all = R.cases.slice().sort((a, b) => (fails(b) - fails(a)) || a.kind.localeCompare(b.kind) || b.depth - a.depth);
  for (const c of all) log(`${fails(c) ? 'FAIL' : 'note'} clip ${c.kind}: ${c.a} / ${c.b}, ${c.depth} m deep${c.extra ? ` (${c.extra})` : ''}, at ${c.at || 'no story'}${c.mode && c.mode !== 'foot' ? ` [${c.mode}]` : ''}, (${c.x}, ${c.y}, ${c.z}), ${c.n} frames`);
  const by = {}; for (const c of all) by[c.kind] = (by[c.kind] || 0) + 1;
  log(`clip: ${R.frames} frames measured over ${R.seen.length} beats; ${all.length ? Object.entries(by).map(([k, n]) => `${n} ${WORD[k] || k}`).join(', ') : 'nothing inside anything'}`);
  return { hard: all.filter(fails), all };
}
module.exports = { install, report, print, fails, NEAR };
