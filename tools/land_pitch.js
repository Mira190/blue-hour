// The walk's opening, its land shot read whole (issue 239): from where the shot before it ends down to the chase camera
// over your shoulder, the look is never tipped onto the tops of heads. The film's own pose at every hundredth of the shot
// (overture.js frame: the hand-over to the chase camera and the bound on the look included, as a frame draws it), its
// look's angle under the horizon against the bound: 20 degrees (overture.js LAND_DOWN keeps it), or the chase camera's own look where that is
// steeper (the shot ends on it), with half a degree for the arithmetic.
//   const { landPitch } = require('./land_pitch'); const r = await landPitch(page);   // null: no land shot in this film
//   r = { ok, worst: degrees down, at: k, y: the camera's height there, bound: degrees, chase: degrees, n: samples }
'use strict';
async function landPitch(p, n = 100) {
  return p.evaluate(n => {
    const DOWN = 20; // (the bound docs/STORY.md sets, held here and not read from the film: overture.js LAND_DOWN is what this checks)
    const o = window.__game && window.__game.overture && window.__game.overture();
    if (!o || !o.frame) return null;
    const i = o.shots.findIndex(q => q.type === 'land');
    if (i < 1) return null;
    const s = o.shots[i], e = o.sample(o.shots[i - 1], 1), from = { pos: e.pos, look: e.look };
    const down = q => { const dx = q.look.x - q.pos.x, dy = q.look.y - q.pos.y, dz = q.look.z - q.pos.z; return -Math.atan2(dy, Math.hypot(dx, dz)) * 180 / Math.PI; };
    const chase = down(o.frame(s, 1, from)), bound = Math.max(DOWN, chase) + 0.5;
    let worst = -90, at = 0, y = 0;
    for (let j = 0; j <= n; j++) {
      const q = o.frame(s, j / n, from), d = down(q);
      if (d > worst) { worst = d; at = j / n; y = q.pos.y; }
    }
    return { ok: worst <= bound, worst: +worst.toFixed(1), at, y: +y.toFixed(1), bound: +bound.toFixed(1), chase: +chase.toFixed(1), n: n + 1, id: s.id };
  }, n);
}
module.exports = { landPitch };
