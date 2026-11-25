// What a frame draws, thing by thing and target by target, for tools/story_play.js PROBE=<still>[,<still>...]: put on
// before a still's frame is drawn (install) and read after it (read), each draw put down to its target's size, its
// parents' names, its material, its userData keys and where it stands, so that an unnamed draw can be found in the code.
exports.install = p => p.evaluate(() => {
  const g = window.__game, r = g.renderer, was = r.renderBufferDirect, seen = new Map();
  r.renderBufferDirect = function (camera, scene, geometry, material, object, group) {
    const t = r.getRenderTarget(), size = t ? `${t.width}x${t.height}` : 'screen';
    if (object) {
      const chain = []; for (let q = object; q && chain.length < 5; q = q.parent) chain.push(q.name || q.type);
      const n = geometry.index ? geometry.index.count : geometry.attributes.position ? geometry.attributes.position.count : 0;
      const ud = []; for (let q = object; q; q = q.parent) for (const k of Object.keys(q.userData || {})) if (!ud.includes(k)) ud.push(k);
      const p = object.getWorldPosition ? object.getWorldPosition(new THREE.Vector3()) : null;
      const own = object.material && !Array.isArray(object.material) ? object.material : material, ga = Object.keys(geometry.attributes).join('+'), sc = scene.overrideMaterial ? ' (in place of ' + own.type + ':' + (own.name || '') + ')' : '';
      const k = `${size} | ${chain.join(' < ')} | ${material.type}:${material.name || ''}${sc} | ${ud.slice(0, 6).join(',')} | ${ga} ${object.isInstancedMesh ? 'inst' : ''}${object.isBatchedMesh ? 'batch' : ''}`;
      const v = seen.get(k) || { draws: 0, tris: 0, at: p ? [Math.round(p.x), Math.round(p.y), Math.round(p.z)] : null };
      v.draws++; v.tris += Math.round(n / 3) * (object.count || 1); seen.set(k, v);
    }
    return was.call(this, camera, scene, geometry, material, object, group);
  };
  window.__who = { seen, off: () => { r.renderBufferDirect = was; } };
});
exports.read = p => p.evaluate(() => { const w = window.__who; if (!w) return []; w.off(); window.__who = null; return [...w.seen.entries()].sort((a, b) => b[1].draws - a[1].draws).map(([k, v]) => `${v.draws} ${v.tris} ${k} @${v.at}`); });
