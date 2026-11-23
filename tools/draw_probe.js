// What a frame draws, thing by thing, for tools/phone_frame.js EVAL=tools/draw_probe.js: every object the renderer
// draws in the next frame with its name, its parents' names, its material, its triangles and where it stands, so
// that an unnamed draw can be found in the code that made it.
(() => new Promise(done => {
  const g = window.__game, r = g.atmos.composer.renderer, was = r.renderBufferDirect, seen = new Map();
  r.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
    if (object && !seen.has(object)) {
      const chain = []; for (let q = object; q; q = q.parent) chain.push(q.name || q.type);
      const n = geometry.index ? geometry.index.count : geometry.attributes.position ? geometry.attributes.position.count : 0;
      seen.set(object, { chain: chain.slice(0, 4).join(' < '), mat: `${material.type}:${material.name || ''}${material.transparent ? ' transp' : ''}${material.map ? ' map' : ''}`, tris: Math.round(n / 3), count: object.count, ud: Object.keys(object.userData || {}).join(','), draws: 0 });
    }
    if (object) seen.get(object).draws++;
    return was.call(this, camera, scene, geometry, material, object, group);
  };
  requestAnimationFrame(() => requestAnimationFrame(() => { r.renderBufferDirect = was; done([...seen.values()].map(v => `${v.draws} ${v.tris}${v.count != null ? 'x' + v.count : ''} | ${v.chain} | ${v.mat} | ${v.ud}`)); }));
}))()
