// The watch for a model drawn in part (issue 241; tools/whole_check.js, tools/walk_play.js): given to a page with
// addInitScript, it wraps the game's renderer as soon as there is one, outside the draw gate (web/world.js gate), and
// sees each draw of the scene asked for: drawn or held (the renderer's count of draws before and after it). A model is a
// child of the scene with a skinned mesh in it (a person, the guide), or one marked whole (userData.whole: a car, the
// helicopter). A frame that drew one of a model's meshes and held another is counted, with the model and its meshes:
// window.__whole { frames, draws, held, splitFrames, split: [...] }.
function wholeWatch() {
  // the watch, set on the renderer as soon as the game has one (outside the gate: it sees each draw asked for)
  const watch = () => {
    const g = window.__game;
    if (!g || !g.renderer || !g.world) { setTimeout(watch, 50); return; }
    const R = g.renderer, world = g.world, draw = R.renderBufferDirect, unitOf = new WeakMap(), isModel = new WeakMap();
    const S = window.__whole = { frames: 0, draws: 0, held: 0, split: [], splitFrames: 0 };
    let frame = -1, cur = new Map();
    const model = o => { // (the model a mesh is part of: the scene's child holding it, if a person or marked whole)
      if (unitOf.has(o)) return unitOf.get(o);
      let u = null, q = o;
      for (; q && q.parent; q = q.parent) { if (q.userData && q.userData.whole) { u = q; break; } if (q.parent === world) break; }
      if (!u && q && q.parent === world) {
        if (!isModel.has(q)) { let s = false; q.traverse(c => { if (c.isSkinnedMesh) s = true; }); isModel.set(q, s); }
        if (isModel.get(q)) u = q;
      }
      unitOf.set(o, u);
      return u;
    };
    const close = () => {
      let bad = false;
      for (const [u, e] of cur) if (e.held.size && e.drawn.size) {
        bad = true;
        if (S.split.length < 40) S.split.push({ at: S.frames, walk: document.getElementById('game-stage').classList.contains('walk-on'), name: u.name || (u.userData && u.userData.who) || u.uuid.slice(0, 8), where: [+u.position.x.toFixed(1), +(-u.position.z).toFixed(1)], drawn: [...e.drawn].slice(0, 4), held: [...e.held].slice(0, 4) });
      }
      if (bad) S.splitFrames++;
      cur = new Map();
    };
    R.renderBufferDirect = function (camera, sc, geometry, material, object, group) {
      if (sc !== world || !object) return draw.apply(this, arguments);
      const f = R.info.render.frame;
      if (f !== frame) { if (frame >= 0) close(); frame = f; S.frames++; }
      const u = model(object), n0 = R.info.render.calls, r = draw.apply(this, arguments), drew = R.info.render.calls > n0;
      S.draws++; if (!drew) S.held++;
      if (u) {
        let e = cur.get(u); if (!e) cur.set(u, e = { drawn: new Set(), held: new Set() });
        const nm = `${object.name || object.type}/${(material && material.name) || '-'}`;
        (drew ? e.drawn : e.held).add(nm);
      }
      return r;
    };
  };
  watch();
}
// its lines for a log, and the failure, if any
function wholeReport(S) {
  if (!S) return { lines: [], fail: 'the watch for a model drawn in part never came on' };
  const lines = [`${S.frames} frames watched, ${S.draws} draws asked, ${S.held} held by the gate; ${S.splitFrames} frames drew a model in part`];
  for (const s of S.split.slice(0, 8)) lines.push(`  frame ${s.at}${s.walk ? ' (the walk handed over)' : ''}: ${s.name} at (${s.where.join(', ')}) drew ${s.drawn.join(', ')} and held ${s.held.join(', ')}`);
  return { lines, fail: S.splitFrames ? `${S.splitFrames} frames drew a person or a model in part (some of its meshes drawn, others held: a head with no body, issue 241)` : null };
}
module.exports = { wholeWatch, wholeReport };
