// What a mark laid over the picture may do: the rules of perspective every world-space mark and prompt of the page keeps
// (docs/MARKS.md). A mark over someone's head, a call-out, an overheard line, a name, the goal's ring: each is drawn on
// the picture at a point of the world, and the picture is a view from one eye. So a mark is a thing in that view, and
// where something stands between the eye and its point, it is behind that thing. The owner's stills of 22 November 2026
// showed why: a yellow "!" over a man beyond the player was drawn on the back of her head, on her hair (a sprite drawn
// through everything, depthTest off), and the walk's marks asked only the city's walls whether they were hidden.
//
// The rules, as the third-person games that do this well keep them (docs/MARKS.md, "What was adopted"):
//   - behind the player's body: not drawn. Her body is the nearest thing in the frame; a mark on it is read as a mark
//     on her. Tested against her figure as the camera sees it (a capsule from her feet to the top of her head, the
//     mark's own size round its point), only where she is nearer the eye than the point.
//   - behind someone else: not drawn (a person of the crowd, a figure of the story, a named person, the dog), tested
//     the same way against those drawn near the eye.
//   - behind a wall, a deck or a floor: not drawn (the city's solids, a ray from the eye to the point).
//   - by distance: a mark comes in only within its own reach (someone to talk to within talking distance, a seat within
//     a few steps), fades in over the last metres of it, and keeps its size on the screen between a least and a most,
//     so that it neither shrinks to a speck nor swells over a face.
//   - off the frame, or behind the eye: not drawn where it is (the story's goal has its arrow at the frame's edge).
//
//   create({ camera, W(x, y, z) -> THREE.Vector3, size() -> [w, h] CSS px, body() -> { x, y, z, h, r } | null,
//            people(cx, cy, cz, reach) -> [{ x, y, z, h, r, who }], solid(cx, cy, cz, x, y, z) -> true when blocked })
//   .frame()                 once a frame, before the marks are placed: the camera's matrices and the bodies near it
//   .see(x, y, z, o)         -> { x, y, d, why } where the point is on the stage (CSS px) and its distance from the
//                            player, and why it is not to be drawn ('behind', 'off', 'body', 'person', 'solid') or ''.
//                            o: { pad: the mark's half size in px (14), self: who the mark is over (not their own
//                            cover), key: for the solid ray, asked again every few frames (none: every call), solid:
//                            false to skip the walls (a thing that is itself a building), people: false to skip others }
//   .fade(d, reach, over)    1 within reach - over, 0 at reach and beyond
//   .scale(d, at, lo, hi)    the mark's scale for distance d: 1 at `at` metres, held between lo and hi
'use strict';
window.OEMarks = (function () {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function create({ camera, W, size, body, people, solid, from }) {
    let w = 1, h = 1, f = 1, near = [], me = null, frameN = 0;
    const V = new THREE.Vector3(), A = new THREE.Vector3(), B = new THREE.Vector3(), rays = new Map();
    const stat = { body: 0, person: 0, solid: 0 };
    // a point of the map on the stage, in CSS px, and its depth along the eye's axis (null: behind the eye)
    function scr(x, y, z, out) {
      V.copy(W(x, y, z)).applyMatrix4(camera.matrixWorldInverse);
      const dep = -V.z;
      if (dep < camera.near) return null;
      V.applyMatrix4(camera.projectionMatrix);
      out.x = (V.x + 1) / 2 * w; out.y = (1 - V.y) / 2 * h; out.dep = dep;
      return out;
    }
    const pa = {}, pb = {}, pp = {};
    // whether a figure (a capsule standing at x, y, z, h tall, r round) covers the stage point p (pad px round it)
    // from nearer the eye than p
    function covers(b, p, pad) {
      if (!scr(b.x, b.y, b.z + 0.05, pa) || !scr(b.x, b.y, b.z + b.h, pb)) return false;
      const dep = (pa.dep + pb.dep) / 2;
      if (dep > p.dep - Math.max(0.35, b.r * 1.5)) return false; // (level with the point or beyond it: it stands behind the mark, or the mark is over it)
      const rpx = b.r * f / dep + pad;
      const ex = pb.x - pa.x, ey = pb.y - pa.y, L = ex * ex + ey * ey;
      const t = L > 0 ? clamp(((p.x - pa.x) * ex + (p.y - pa.y) * ey) / L, 0, 1) : 0;
      // (the head is round, not a flat cap: the capsule's top is a half circle of its radius over the top point)
      const cx = pa.x + ex * t, cy = pa.y + ey * t;
      return Math.hypot(p.x - cx, p.y - cy) < rpx;
    }
    return {
      stat,
      frame() {
        frameN++;
        camera.updateMatrixWorld();
        [w, h] = size();
        f = h / 2 / Math.tan(camera.fov * Math.PI / 360) / (camera.zoom || 1);
        me = body ? body() : null;
        const c = camera.position;
        near = people ? people(c.x, -c.z, c.y, 40) : [];
      },
      see(x, y, z, o = {}) {
        const out = { x: 0, y: 0, d: Infinity, why: '' };
        const p = scr(x, y, z, pp);
        const at = from ? from() : me;
        if (at) out.d = Math.hypot(x - at.x, y - at.y);
        if (!p) { out.why = 'behind'; return out; }
        out.x = p.x; out.y = p.y; out.dep = p.dep;
        if (p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) { out.why = 'off'; return out; }
        const pad = o.pad ?? 14;
        if (me && o.self !== me && covers(me, p, pad)) { out.why = 'body'; stat.body++; return out; }
        if (o.people !== false) for (const b of near) if (b.who !== o.self && (o.self == null || b.who !== o.self.id) && covers(b, p, pad * 0.6)) { out.why = 'person'; stat.person++; return out; }
        if (o.solid !== false && solid) {
          const c = camera.position;
          let r = o.key != null ? rays.get(o.key) : null;
          if (!r || frameN - r.n >= 6 || Math.abs(r.x - x) + Math.abs(r.y - y) + Math.abs(r.z - z) > 0.5) {
            r = { n: frameN, x, y, z, hit: !!solid(c.x, -c.z, c.y, x, y, z) };
            if (o.key != null) rays.set(o.key, r);
          }
          if (r.hit) { out.why = 'solid'; stat.solid++; return out; }
        }
        return out;
      },
      fade: (d, reach, over) => clamp((reach - d) / Math.max(0.01, over), 0, 1),
      scale: (d, at, lo, hi) => clamp(at / Math.max(0.5, d), lo, hi),
      // the player's figure on the stage now, as the rules see it (for tools/mark_cover.js)
      body: () => { if (!me) return null; const a = scr(me.x, me.y, me.z + 0.05, {}), b = scr(me.x, me.y, me.z + me.h, {}); return a && b ? { a: [a.x, a.y], b: [b.x, b.y], r: me.r * f / ((a.dep + b.dep) / 2) } : null; },
    };
  }
  return { create };
})();
