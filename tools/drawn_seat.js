// Whether someone seated is sitting on something drawn (issue 171). The walking grid is not the picture: nav.floorAt
// answers from the walk's own solids, and round Hachiko's bed those are one raised block about a metre wider than the
// stone drawn, so a sitter placed by it sat on the air beside the wall's curve, and a check that asked the same grid what
// was under him passed (owner's still, 23 November 2026). This asks the drawn world: a ray straight down through the
// meshes (never a person, a sprite or a line) under the hips and a third of the way along each thigh, and gives how far over
// the drawn top each is. The hip joint stands about 0.1 m over what it sits on.
//   const { drawnSeat } = require('./drawn_seat');
//   const r = await p.evaluate(drawnSeat, { rigs: 'visitors' | 'player' | [npc id], from: 0.4 })
//     -> [{ who, pelvis: [x, y, z], under: { pelvis, thighL, thighR, feet: [l, r] } (m from each joint down to the drawn top; null: nothing
//          within a metre), ok }]
// ok: the hips 0.04 to 0.25 m over a drawn top (the joint level with it is the body sunk into it), and each ankle on the
// drawn ground (0 to 0.16 m over it: a sitter placed by the walking grid had his feet on the air at the stone's height);
// null where it cannot be read: a phone lets go of a mesh's vertices once it is drawn, and one over the ray is not seen and a thigh's first third within 0.3 m over one (the other may hang over an edge: a seat taken across a corner)
function drawnSeat(o) {
  const g = window.__game, THREE = window.THREE, rc = new THREE.Raycaster(), dn = new THREE.Vector3(0, -1, 0);
  rc.camera = g.camera; rc.far = 1.4;
  // (the drawn meshes: visible, not a person, and still holding their vertices: a phone lets go of a mesh's arrays once
  // it is on the GPU, and a ray through one of those threw)
  const meshes = [], gone = [];
  g.world.traverse(q => { if (!q.isMesh || q.isSkinnedMesh || !q.geometry || !q.geometry.attributes.position) return; for (let o = q; o; o = o.parent) if (!o.visible) return; if (q.geometry.attributes.position.array) meshes.push(q); else { if (!q.geometry.boundingBox) return; gone.push(new THREE.Box3().copy(q.geometry.boundingBox).applyMatrix4(q.matrixWorld)); } });
  let blind = false;
  const gap = (w, from) => {
    rc.set(new THREE.Vector3(w.x, w.y + from, w.z), dn);
    const h = rc.intersectObjects(meshes, false)[0], hit = new THREE.Vector3();
    // (a mesh let go of over the ray, above what it hit: what is drawn there cannot be read on this device)
    if (gone.some(bx => rc.ray.intersectBox(bx, hit) && hit.distanceTo(rc.ray.origin) < (h ? h.distance : rc.far))) blind = true;
    return h ? +(w.y - h.point.y).toFixed(3) : null;
  };
  const bones = rig => { const b = {}; rig.model.traverse(q => { if (q.isBone) { const m = /(Pelvis|L_Thigh|R_Thigh|L_Calf|R_Calf|L_Foot|R_Foot)$/.exec(q.name); if (m && !b[m[1]]) b[m[1]] = q.getWorldPosition(new THREE.Vector3()); } }); return b; };
  const list = [];
  if (o.rigs === 'visitors') for (const G of g.visitors.groups) for (const v of G.people) { if (v.shown && v.p.sit != null) list.push([v.p.why || G.g.id, v.rig]); }
  else if (o.rigs === 'player') list.push(['you', g.player.rig]);
  else for (const id of o.rigs) { const n = g.npcs.find(q => q.id === id); if (n && n.rig && n.rig.model) list.push([n.name || id, n.rig]); }
  const from = o.from ?? 0.4;
  return list.map(([who, rig]) => {
    rig.root.updateMatrixWorld(true);
    const b = bones(rig);
    if (!b.Pelvis) return { who, ok: false, why: 'no pelvis' };
    const mid = (a, c) => (a && c ? a.clone().lerp(c, 0.3) : null); // (the thigh a third of the way to the knee: on a wall the knees are over its edge)
    const under = { pelvis: gap(b.Pelvis, from), thighL: mid(b.L_Thigh, b.L_Calf) && gap(mid(b.L_Thigh, b.L_Calf), from), thighR: mid(b.R_Thigh, b.R_Calf) && gap(mid(b.R_Thigh, b.R_Calf), from) };
    under.feet = [b.L_Foot, b.R_Foot].map(f => (f ? gap(f, 0.3) : null)); // (each ankle over the drawn ground: about 0.08 m, as standing)
    const ok = under.pelvis != null && under.pelvis >= 0.04 && under.pelvis <= 0.25 && [under.thighL, under.thighR].some(t => t != null && t >= -0.05 && t <= 0.3) // (one may hang: the seat on Hachiko's wall is taken across its corner)
      && under.feet.every(f => f == null || (f > 0 && f < 0.16));
    const r = { who, pelvis: [+b.Pelvis.x.toFixed(2), +(-b.Pelvis.z).toFixed(2), +b.Pelvis.y.toFixed(2)], under, ok: blind && !ok ? null : ok };
    blind = false;
    return r;
  });
}
module.exports = { drawnSeat };
