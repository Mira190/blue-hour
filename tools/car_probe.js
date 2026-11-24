// What the player's car draws (issue 192), for tools/phone_frame.js EVAL=tools/car_probe.js: its meshes as drawn now,
// by material, with their triangles and whether each is see-through, and how far it stands from the camera.
(() => {
  const g = window.__game, c = g.myCar && g.myCar();
  if (!c) return { car: null };
  const root = c.C.group, ms = [], p = new THREE.Vector3();
  root.traverse(o => { if (o.isMesh && o.geometry.attributes.position) { let v = true; for (let q = o; q; q = q.parent) if (!q.visible) v = false; if (v) ms.push(o); } });
  const by = {};
  for (const m of ms) { const k = `${m.material.name || m.material.type}${m.material.transparent ? ' (see-through)' : ''}`; const q = by[k] || (by[k] = { draws: 0, tris: 0 }); q.draws++; q.tris += Math.round((m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3); }
  root.getWorldPosition(p);
  return { far: c.C.far ? c.C.far() : null, model: c.C.name, draws: ms.length, tris: ms.reduce((n, m) => n + Math.round((m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3), 0), dist: +p.distanceTo(g.camera.position).toFixed(1), by };
})()
