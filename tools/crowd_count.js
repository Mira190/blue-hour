// How often the same person is seen in one view (issue 64): the crowd's walkers drawn in the camera's frustum within
// R m of it, counted by cast member (the scanned character a walker is drawn as, far and near) and by cast member
// in the same clothes (people.js DRESS). Used by tools/game_shot.js and tools/story_play.js with COUNT=R (metres).
//   const { count } = require('./crowd_count'); console.log(await count(page, 60));
async function count(page, R = 60) {
  return page.evaluate(R => {
    const g = window.__game, d = g && g.crowdDraw && g.crowdDraw(), C = g && g.crowd;
    if (!d || !C) return 'crowd: none';
    const cam = g.camera, fr = new THREE.Frustum(), m = new THREE.Matrix4(), v = new THREE.Vector3();
    cam.updateMatrixWorld(); m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); fr.setFromProjectionMatrix(m);
    const who = {}, worn = {}, body = {};
    let n = 0;
    for (let i = 0; i < Math.min(C.active, C.P.length); i++) {
      const p = C.P[i];
      if (!d.shows(i)) continue;
      v.set(p.rx ?? p.x, (p.rz ?? p.z ?? 0) + 0.9, -(p.ry ?? p.y));
      if (v.distanceTo(cam.position) > R || !fr.containsPoint(v)) continue;
      const k = p.far || (p.look && p.look.character) || '?';
      const b = k.replace(/_[mf]\d{3}.*$|_(grey|brown|dark)$/, ''); // (the body and its clothes, whatever the head)
      body[b] = (body[b] || 0) + 1;
      n++; who[k] = (who[k] || 0) + 1; worn[k + '#' + p.dress] = (worn[k + '#' + p.dress] || 0) + 1;
    }
    const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]);
    const w = top(who), s = top(worn), bo = top(body);
    return `crowd within ${R} m in view: ${n} people, ${w.length} cast members; most seen ${w.length ? w[0][1] + 'x ' + w[0][0] : '-'}; one body most ${bo.length ? bo[0][1] + 'x ' + bo[0][0] : '-'}` +
      `; same person in the same clothes most ${s.length ? s[0][1] + 'x ' + s[0][0] : '-'} (pairs or more: ${s.filter(e => e[1] > 1).length})` +
      `; by cast member ${w.map(e => e[0].replace(/^R_/, '') + ' ' + e[1]).join(', ')}`;
  }, R);
}
module.exports = { count };
