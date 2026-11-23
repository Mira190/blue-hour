// trig.js: a part of the game cut out of game.js (tools/cut.js; docs/SEAMS.md, "The cut of game.js").
// `g` is the rest of the game, by name. What this part asks of it:
//   G, W, lin, nav, qs, world
// and what it gives back:
//   VP, trigDone
'use strict';
window.OEGameTrig = function (g) {
  // ------------------------------------------------------------ trig stations: survey points with a view
  // Hilltops, a headland and the bridge deck (game.json "viewpoints"). Each has a concrete
  // trig pillar; surveying it turns the camera once round you and names what is in sight.
  const pillarGeo = new THREE.CylinderGeometry(0.22, 0.34, 1.25, 4, 1).rotateY(Math.PI / 4).translate(0, 0.625, 0);
  const pillarMat = new THREE.MeshStandardMaterial({ color: g.lin('#e9e6dc'), roughness: 0.85 });
  const plateMat = new THREE.MeshStandardMaterial({ color: g.lin('#b08a3a'), roughness: 0.4, metalness: 0.6 });
  const VP = (g.G.viewpoints || []).map(v => {
    let f = g.nav.floorAt(v.at[0], v.at[1], v.z_ref ?? 400);
    if (f && f.kind === 'deck' && v.z_ref == null) f = g.nav.floorAt(v.at[0], v.at[1], Math.max(0, g.nav.terrain(v.at[0], v.at[1])) + 1); // not up on a viaduct
    const o = Object.assign({}, v, { x: v.at[0], y: v.at[1], z: f ? f.z : Math.max(0, g.nav.terrain(v.at[0], v.at[1])) });
    const g_ = new THREE.Group();
    const pillar = new THREE.Mesh(pillarGeo, pillarMat), plate = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 12).translate(0, 1.27, 0), plateMat);
    pillar.castShadow = pillar.receiveShadow = true;
    g_.add(pillar, plate);
    g_.position.copy(g.W(o.x + 1.6, o.y, o.z)); // beside the spot you stand on
    g.world.add(g_);
    return o;
  });
  const trigDone = () => g.qs.trig || (g.qs.trig = {});
  return { VP, trigDone };
};
