// What the rain's cover map draws (weather.js renderOcc), for tools/phone_frame.js EVAL=tools/cover_probe.js: the
// weather set to rain, the map drawn afresh once, and every thing drawn into it listed by pass (the still things'
// map, then what moves over a copy of it) with its triangles and its bounds' size, heaviest first.
(async () => {
  const g = window.__game, r = g.atmos.composer.renderer, was = r.renderBufferDirect, seen = [];
  g.weather.set('rain', { now: true });
  await new Promise(q => setTimeout(q, 3000));
  let pass = 0, lastRT = null;
  r.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
    const rt = r.getRenderTarget(); if (rt !== lastRT) { lastRT = rt; pass++; }
    if (object) {
      const chain = []; for (let q = object; q; q = q.parent) chain.push(q.name || q.type);
      const n = object.isBatchedMesh ? Array.from(object._multiDrawCounts.slice(0, object._multiDrawCount)).reduce((a, b) => a + b, 0) : (geometry.index ? geometry.index.count : geometry.attributes.position ? geometry.attributes.position.count : 0) * (object.isInstancedMesh ? object.count : 1);
      const bs = geometry.boundingSphere;
      seen.push({ pass, name: chain.slice(0, 3).join(' < '), tris: Math.round(n / 3), r: bs && isFinite(bs.radius) ? +bs.radius.toFixed(1) : null, still: !!(object.userData.shadowStatic || object.userData.oeStill), inst: object.isInstancedMesh ? object.count : undefined });
    }
    return was.call(this, camera, scene, geometry, material, object, group);
  };
  const s0 = Object.assign({}, g.weather.cover);
  g.weather.cover.draw(performance.now() / 1000, true);
  r.renderBufferDirect = was;
  const by = {};
  for (const s of seen) { const k = `${s.pass} | ${s.name.replace(/[-_ ]?\d+\b/g, '')}`; const q = by[k] || (by[k] = { draws: 0, tris: 0, rmax: 0 }); q.draws++; q.tris += s.tris; q.rmax = Math.max(q.rmax, s.r || 0); }
  return { sorted: g.weather.cover.sorted, total: seen.length, by: Object.entries(by).sort((a, b) => b[1].draws - a[1].draws).slice(0, 60).map(([k, v]) => `${v.draws} ${v.tris} r${v.rmax} | ${k}`) };
})()
