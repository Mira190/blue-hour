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
//    always had. At most `cap` are lent at once (6), the nearest first; that two or three are in sight at once is the routines'
//    own doing, by where and when they are written, not the cap's (nobody comes into being within 30 m of the camera,
//    so one squeezed out by a cap as you come near could never be met).
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
  function draw(day, name, n) { let h = (day * 2654435761) >>> 0; for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619) >>> 0; h = (h ^ (h >>> 15)) >>> 0; return n > 0 ? h % n : 0; }
  function create({ data, crowd, clock, day, rain, here, ground, redress = null }) {
    const cap = data.cap || 3;
    // the evening runs past midnight: a row's minute before `turn` (04:00) belongs to the night before
    const TURN = 240, night = m => (m < TURN ? m + 1440 : m);
    const people = (data.people || []).map(r => ({ id: r.id, who: r.who || '', first: r.first || 0, clip: (r.wear && r.wear.clip) || null, want: r.wear || {}, notice: r.notice || null, with: r.with || null, every: r.every || 0, until: r.until ? night(hm(r.until)) : 0, rows: r.rows.map(q => ({ t: night(hm(q.t)), vary: q.vary || 0, seed: q.seed || null, at: q.at || null, face: q.face || null, off: !!q.off, if: q.if || null, pace: q.pace || 0 })), p: null, goal: { x: 0, y: 0, face: null, pace: 0.9 }, noticed: -1, near: 0, look: 0 }));
    // where they are at `min` (minutes of the day) under that sky: null when indoors; else { x, y, face, to: where they
    // are bound, or null when standing }
    function plan(r, min, wet, d) {
      let t = night(min);
      const rows = r.rows.filter(q => !q.if || (q.if === 'rain') === wet);
      // (a round: the rows are one turn of it, walked again every `every` minutes until `until`)
      if (r.every && rows.length) { if (t >= r.until) return null; if (t >= rows[0].t) t = rows[0].t + (t - rows[0].t) % r.every; }
      let k = -1;
      const at = i => rows[i].t + (rows[i].vary ? draw(d, rows[i].seed || r.id + i, rows[i].vary) : 0); // (seed: two routines that share one draw the same minute: they meet)
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
        if (far > OUT || (!pl && !crowd.seen(r.p.x, r.p.y, r.p.z))) { give(r); continue; }
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
      // (the nearest first; one who cannot be lent now, in sight where the clock puts them or with nobody of that body
      // and those clothes free, is passed over for the next nearest: a few subtractions each)
      const C = [];
      for (const r of people) {
        if (r.p) continue;
        const pl = plan(r, min, wet, d);
        if (!pl) continue;
        const dd = Math.hypot(pl.x - me.x, pl.y - me.y);
        if (dd < IN) C.push({ r, pl, dd });
      }
      C.sort((a, b) => a.dd - b.dd);
      for (const { r, pl, dd } of C) {
        if (n >= cap) { // (all lent: one of them out of sight is given back for this one: one who comes `first` less, else the farthest, 25 m farther off than this one)
          let far = null, fd = dd + 25, fr = r.first;
          for (const o of people) if (o.p && !crowd.seen(o.p.x, o.p.y, o.p.z)) { const od = Math.hypot(o.p.x - me.x, o.p.y - me.y); if (o.first < fr || (o.first === fr && od > fd)) { far = o; fd = od; fr = o.first; } }
          if (!far) return;
          give(far); n--;
        }
        const z = ground(pl.x, pl.y);
        if (z == null || (dd < 60 && crowd.seen(pl.x, pl.y, z))) continue;
        // (one of that body; in its own clothes if one is free, else given them: a body and its clothes are some forty to
        // a crowd, four or five walkers each, and all of them could be in sight at a kerb)
        const w = r.want, body = q => !w.cast || q.far === w.cast, h = pl.face ?? (pl.to ? Math.atan2(pl.to[0] - pl.x, pl.to[1] - pl.y) : 0);
        const p = crowd.enlist(q => body(q) && (w.dress == null || q.dress === w.dress), pl.x, pl.y, z, h, r) || (redress && w.dress != null ? crowd.enlist(body, pl.x, pl.y, z, h, r) : null);
        if (p && w.dress != null && p.dress !== w.dress) { const d0 = p.dress; if (!redress(p, w.dress)) { crowd.dismiss(p); continue; } p.dress0 = d0; }
        if (p) { r.p = p; r.goal.x = pl.to ? pl.to[0] : pl.x; r.goal.y = pl.to ? pl.to[1] : pl.y; r.goal.face = pl.face; r.goal.pace = 0.9 * pl.pace; return; } // (one a turn)
      }
    }
    // given back to the crowd, in the clothes it had
    function give(r) { const p = r.p; r.p = null; if (p.dress0 != null && redress) { redress(p, p.dress0); p.dress0 = null; } crowd.dismiss(p); }
    // (for the checks: tonight's minute of each of a routine's rows under that sky, the draw of the date in it)
    const when = (id, wet) => { const r = people.find(q => q.id === id), d = day(); return r ? r.rows.filter(q => !q.if || (q.if === 'rain') === !!wet).map((q, i) => ({ t: q.t + (q.vary ? draw(d, q.seed || r.id + i, q.vary) : 0), off: q.off })) : []; };
    return { tick, when, plan: (id, min, wet) => { const r = people.find(q => q.id === id); return r ? plan(r, min, !!wet, day()) : null; }, live: () => people.filter(r => r.p).map(r => ({ id: r.id, x: r.p.x, y: r.p.y, h: r.p.h, there: !!r.p.reg.there })), people, cap, IN, OUT };
  }
  return { create };
})();
