// The street's own people (issue 168; docs/STORY.md "The street's own people"). The crowd is a flow: it has no one in
// it. A place is remembered for the two or three people you came to recognise, so a handful of the crowd are given a
// routine that the clock carries and that says who they are without a word: the man who waits at Hachiko every
// evening, the patrol on its round, the girl who leaves when the shutters come down, the one who misses the last train.
//
// What it costs, from first principles:
//  - A routine is data, not simulation: a few rows of clock time and place per person (game.json `regulars`, from
//    cities/<city>/city.json game.regulars). Where someone is at any minute is a function of the clock alone (plan):
//    standing at a row's place, or on the straight way to the next row's place so as to be there at its time.
//  - Out of reach they cost nothing: no body, no step. Four times a second each routine's place is worked out (a
//    dozen subtractions each) and nothing else. When you come within IN metres of where one is at that minute, a
//    walker the crowd already has, of the body and the clothes that person wears, is lent to the routine
//    (crowd.enlist) and put there, where the camera is not looking; beyond OUT metres, or when the routine goes
//    indoors, it is given back. No model, no texture and no draw is added: the lent walker is drawn in the slot it
//    always had. At most `cap` are lent at once (3), the nearest first.
//  - While lent they walk straight to where the clock says they should be and stand there (actors.js regStep): one
//    comparison a frame each.
// Things to find (never announced): a row can hold only in the rain or only when it is dry (`if`), a row's minute can
// differ each night (`vary`: minutes, drawn from the date), two routines can be written to meet, and a person can turn
// to whoever has stood by them a while, once a night (`notice`).
//
//   create({ data, crowd, clock: () => minutes of the day, day: () => a number of the date, rain: () => bool,
//            here: () => ({ x, y, z, mode }), ground: (x, y, z) => z })
//     -> { tick(dt), plan(id, min, rain), live() -> [{ id, x, y }], people }
window.OERegulars = (function () {
  const IN = 110, OUT = 150, WALK = 1.15; // (m; m/s: the pace a routine's legs are timed at)
  const hm = s => { const m = /^(\d+):(\d+)$/.exec(s); return m ? (+m[1]) * 60 + (+m[2]) : 0; };
  // a number from the date and a name, the same all night: 0..n-1
  function draw(day, name, n) { let h = (day * 2654435761) >>> 0; for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619) >>> 0; h ^= h >>> 15; return n > 0 ? h % n : 0; }
  function create({ data, crowd, clock, day, rain, here, ground }) {
    const cap = data.cap || 3;
    // the evening runs past midnight: a row's minute before `turn` (04:00) belongs to the night before
    const TURN = 240, night = m => (m < TURN ? m + 1440 : m);
    const people = (data.people || []).map(r => ({ id: r.id, who: r.who || '', want: r.wear || {}, notice: r.notice || null, with: r.with || null, rows: r.rows.map(q => ({ t: night(hm(q.t)), vary: q.vary || 0, at: q.at || null, face: q.face || null, off: !!q.off, if: q.if || null, pace: q.pace || 0 })), p: null, goal: { x: 0, y: 0, face: null, pace: 0.9 }, noticed: -1, near: 0, look: 0 }));
    // where they are at `min` (minutes of the day) under that sky: null when indoors; else { x, y, face, to: where they
    // are bound, or null when standing }
    function plan(r, min, wet, d) {
      const t = night(min), rows = r.rows.filter(q => !q.if || (q.if === 'rain') === wet);
      let k = -1;
      const at = i => rows[i].t + (rows[i].vary ? draw(d, r.id + i, rows[i].vary) : 0);
      for (let i = 0; i < rows.length; i++) if (at(i) <= t) k = i;
      if (k < 0) return null;
      const a = rows[k], b = rows[k + 1];
      if (a.off) return null;
      const face = a.face ? Math.atan2(a.face[0] - a.at[0], a.face[1] - a.at[1]) : null;
      if (b && b.at) {
        const dx = b.at[0] - a.at[0], dy = b.at[1] - a.at[1], len = Math.hypot(dx, dy), need = len / (WALK * (b.pace || 1)) / 60, left = at(k + 1) - t; // (minutes)
        if (len > 0.5 && left < need) { const f = 1 - left / need; return { x: a.at[0] + dx * f, y: a.at[1] + dy * f, face: null, to: b.at, pace: b.pace || 1 }; }
      }
      return { x: a.at[0], y: a.at[1], face, to: null, pace: 1 };
    }
    let acc = 0, t = 0;
    function tick(dt) {
      t += dt;
      const me = here(), min = clock(), wet = rain(), d = day();
      // those lent: where they should be now, each frame (a comparison); given back when far, indoors or taken from us
      let n = 0;
      for (const r of people) {
        if (!r.p) continue;
        if (r.p.reg !== r || r.p.line < 0 || r.p.state !== 'reg') { r.p = null; continue; }
        const pl = plan(r, min, wet, d), far = Math.hypot(r.p.x - me.x, r.p.y - me.y);
        if (far > OUT || (!pl && !crowd.seen(r.p.x, r.p.y, r.p.z))) { crowd.dismiss(r.p); r.p = null; continue; }
        n++;
        if (!pl) continue; // (indoors by the clock but in sight: they stand where they are until nobody is looking)
        const g = r.goal;
        g.x = pl.to ? pl.to[0] : pl.x; g.y = pl.to ? pl.to[1] : pl.y; g.pace = 0.9 * pl.pace; g.face = pl.face;
        // (someone who has stood by them a while: they turn and look, once a night; a person noticed, not a prompt)
        if (r.notice && me.mode === 'foot' && r.noticed !== d && !pl.to && r.p.reg.there) {
          const dm = Math.hypot(me.x - r.p.x, me.y - r.p.y);
          r.near = dm < (r.notice.r || 5) ? r.near + dt : 0;
          if (r.near > (r.notice.after || 8)) { r.noticed = d; r.look = t + (r.notice.hold || 6); r.near = 0; }
        }
        if (r.look > t) g.face = Math.atan2(me.x - r.p.x, me.y - r.p.y);
      }
      if ((acc += dt) < 0.25) return;
      acc = 0;
      // those not lent: lent when you come within reach of where the clock puts them, the nearest first, where the
      // camera is not looking (found there, not seen arriving)
      if (n >= cap) return;
      let best = null, bd = IN, bp = null;
      for (const r of people) {
        if (r.p) continue;
        const pl = plan(r, min, wet, d);
        if (!pl) continue;
        const dd = Math.hypot(pl.x - me.x, pl.y - me.y);
        if (dd < bd) { best = r; bd = dd; bp = pl; }
      }
      if (!best) return;
      const z = ground(bp.x, bp.y, me.z);
      if (z == null || (bd < 60 && crowd.seen(bp.x, bp.y, z))) return;
      const w = best.want, p = crowd.enlist(q => (!w.cast || q.far === w.cast) && (w.dress == null || q.dress === w.dress), bp.x, bp.y, z, bp.face ?? (bp.to ? Math.atan2(bp.to[0] - bp.x, bp.to[1] - bp.y) : 0), best);
      if (p) { best.p = p; best.goal.x = bp.to ? bp.to[0] : bp.x; best.goal.y = bp.to ? bp.to[1] : bp.y; best.goal.face = bp.face; best.goal.pace = 0.9 * bp.pace; }
    }
    return { tick, plan: (id, min, wet) => { const r = people.find(q => q.id === id); return r ? plan(r, min, !!wet, day()) : null; }, live: () => people.filter(r => r.p).map(r => ({ id: r.id, x: r.p.x, y: r.p.y, h: r.p.h, there: !!r.p.reg.there })), people, cap, IN, OUT };
  }
  return { create };
})();
