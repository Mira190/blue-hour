// The camera of a conversation. While one of the story's people speaks to the player (story.js ctx.say and ctx.ask),
// the view is not the chase camera's, behind and above a hard hat, but a conversation's as a film covers one:
//   two      over the player's shoulder onto the speaker, at eye height, a 40 mm lens, the speaker on a third
//   single   the speaker alone, from the player's side of them, a 50 mm lens (the lines after the first)
//   close    a closer single, 75 mm, on a line that turns the talk (the answer to a print, a lie seen through)
//   reverse  over the speaker's shoulder onto the player, for what the player says (a question of their own, the roll)
// Each change is a cut, never a move. The camera keeps to one side of the line between the two of them for the whole
// talk (the 180 degree rule: the speaker is always on the left of the frame or always on the right), and that side is
// chosen as the talk opens for the one from which every shot is clear: no wall, no tree's crown or trunk and nobody
// standing between the lens and a face. A shot that is not clear on its side is taken closer in along the same line;
// only when nothing on that side is clear is the line crossed, and that is written in the log.
//
// It works in the map's metres (x east, y north, z up). The game gives it what it needs to look:
//   create({ walls(a, b) -> 0..1 how far a probe gets from a to b (each [x, y, z]),
//            trees(x, y, r) -> [{ x, y, z, r, hb, rc, kind }]  trunks and posts round a point (z: the foot; kind 'lamp':
//                                                         a lamp post; else a tree, hb the crown's lowest leaves over its
//                                                         foot, rc its reach; both guessed if absent),
//            bodies(x, y, r) -> [{ x, y, z, h, id, crowd }] people round a point (the crowd's with crowd: its index) })
//   open(speaker, player, kind)    a line is said: speaker { id, x, y, z, eye } (eye: the eye's height over z) or null
//                                  for the player's own; player { x, y, z, eye }; kind as above, or null for the default
//   shot(player, aspect) -> { pos: [x, y, z], look: [x, y, z], fov (vertical, degrees), focus (m), subject } | null
//   line()                         the next line of the same speech (the two-shot gives way to the single)
//   close()                        the talk is over
//   framed()      -> the crowd's indices the shot cut to would show in front of the face, or at its shoulder (the game
//                    sends a walker among them on elsewhere at the cut, and leaves the rest undrawn while the shot lasts)
//   clearing()    -> those, and whoever of the crowd stands in the way from the lens to the face now (left undrawn)
//   log: one entry a shot cut to, for tools/talk_check.js: { name, kind, side, crossed, clear, why }
'use strict';
window.OETalkCam = (function () {
  const LENS = { two: 48, single: 40, close: 28, reverse: 46 };   // horizontal angle of view (40, 50, 75 mm on a full frame), degrees
  const PORTRAIT = { two: 50, single: 40, close: 30, reverse: 46 }; // a screen held upright: the vertical angle instead
  const BODY_R = 0.3, HEAD_TOP = 1.85;
  const RING = 1.6; // (nobody of the crowd within this of the face a shot is on: a stranger at the shoulder of a close shot reads as one of the talk)
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  function create(o) {
    const walls = o.walls, trees = o.trees || (() => []), bodies = o.bodies || (() => []);
    let talk = null;
    const log = [];
    // the closest the segment a -> b comes to the vertical axis at (x, y): [distance in plan, t along it]
    const toAxis = (a, b, x, y) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2));
      return [Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y), t];
    };
    // what stands between the lens at c and a face at h: null when nothing, else what ('wall', 'tree', 'leaves', 'body')
    // skip: ids of the people who may be in the line (the subject; for a shot over a shoulder, the shoulder's, which is
    // checked narrower: a shoulder at the frame's edge, never over the face)
    function blocked(c, h, skip, shoulder, noCrowd) {
      if (walls(h, c) < 0.999) return 'wall';
      const mx = (c[0] + h[0]) / 2, my = (c[1] + h[1]) / 2, half = Math.hypot(h[0] - c[0], h[1] - c[1]) / 2;
      for (const q of trees(mx, my, half + 6)) {
        const [d, t] = toAxis(c, h, q.x, q.y), z = c[2] + (h[2] - c[2]) * t;
        if (q.kind === 'lamp') { if (d < (q.r || 0.12) + 0.14 && z < q.z + 7) return 'post'; continue; }
        if (d < (q.r || 0.3) + 0.12 && z < q.z + 8) return 'tree';
        if (d < (q.rc || 3) && z > q.z + (q.hb != null ? q.hb : 1.8) - 0.2 && z < q.z + 14) return 'leaves';
      }
      for (const q of bodies(mx, my, half + 1)) {
        if (skip.includes(q.id) || (q.crowd != null && (noCrowd === true || (noCrowd && noCrowd.has(q.crowd))))) continue;
        const [d, t] = toAxis(c, h, q.x, q.y), z = c[2] + (h[2] - c[2]) * t, s = q.id === shoulder;
        if (t < 0.02 || t > 0.98) { if (d < 0.2 && !s) return q.crowd != null ? 'crowd' : 'body'; continue; } // (the lens inside someone)
        if (d < (s ? 0.2 : BODY_R) && z < q.z + (q.h || HEAD_TOP)) return q.crowd != null ? 'crowd' : 'body';
      }
      return null;
    }
    // where the lens stands for a shot, on a side of the line (s: +1 left of the way from the player to the speaker),
    // pulled in by k (1: as framed; less: closer along the same line)
    function place(kind, P, S, s, k) {
      const dx = S[0] - P[0], dy = S[1] - P[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, lx = -uy * s, ly = ux * s;
      if (kind === 'two') { // behind the player's shoulder, a little above their eye, on side s
        const back = 1.55 * k, out = 0.78;
        return { c: [P[0] - ux * back + lx * out, P[1] - uy * back + ly * out, P[2] - 0.02], at: S, shoulder: 'player' };
      }
      if (kind === 'reverse') { // behind the speaker's shoulder onto the player, on the same side s
        const back = 1.55 * k, out = 0.78;
        return { c: [S[0] + ux * back + lx * out, S[1] + uy * back + ly * out, S[2] - 0.02], at: P, shoulder: 'speaker' };
      }
      // a single: from the player's side of the line, 25 degrees off it, at the speaker's eye
      const d = (kind === 'close' ? 1.35 : 2.0) * Math.min(1, Math.max(0.6, L / 2.2)) * (0.5 + 0.5 * k), a = 0.44;
      const bx = -ux * Math.cos(a) + lx * Math.sin(a), by = -uy * Math.cos(a) + ly * Math.sin(a);
      return { c: [S[0] + bx * d, S[1] + by * d, S[2] - 0.04], at: S, shoulder: null };
    }
    // the shot of `kind` on side s, the farthest in that is clear, or null
    // (lenient: one of the crowd may stand in the way, whom the game then leaves undrawn while the shot lasts: in a
    // Stop the held crowd cannot be seen to move aside)
    function fit(kind, P, S, s, ids, lenient) {
      for (const k of [1, 0.8, 0.6, 0.42]) {
        const q = place(kind, P, S, s, k);
        const why = blocked(q.c, q.at, kind === 'reverse' ? ['player'] : [ids.speaker], q.shoulder === 'player' ? 'player' : q.shoulder === 'speaker' ? ids.speaker : null);
        if (!why) return Object.assign(q, { k, why: null });
        if (lenient && why === 'crowd') return Object.assign(q, { k, why, crowd: true });
      }
      return null;
    }
    // the side of the line for this talk: the one on which the opening two-shot, the single and the reverse are clear
    function side(P, S, ids) {
      let best = null;
      for (const s of [1, -1]) {
        let score = 0;
        for (const kind of ['two', 'single', 'reverse']) { const q = fit(kind, P, S, s, ids) || fit(kind, P, S, s, ids, true); score += !q ? 10 : (q.crowd ? 2 : 0) + (1 - q.k); }
        if (!best || score < best.score) best = { s, score };
      }
      return best.s;
    }
    const head = q => [q.x, q.y, q.z + (q.eye || 1.58)];
    function open(speaker, player, kind) {
      const fresh = !talk;
      if (!talk) talk = { speaker: null, s: 0, n: 0, kind: null };
      if (speaker) {
        if (!talk.speaker || talk.speaker.id !== speaker.id) { talk.speaker = speaker; talk.s = 0; talk.n = 0; }
        else talk.speaker = speaker;
      }
      if (!talk.speaker) { talk.kind = null; return; } // (nobody here to look at: a voice on the phone; the chase view stays)
      talk.kind = kind || (speaker ? (talk.n === 0 ? 'two' : 'single') : 'reverse');
      talk.n++;
      talk.cut = true;
      talk.fresh = fresh;
    }
    // the shot now; the place of the lens is fixed at a cut and kept until the next (a cut, never a move), but where it
    // looks follows the face a little, as an operator's hand does
    function shot(player, aspect) {
      if (!talk || !talk.kind || !talk.speaker) return null;
      const sp = talk.speaker, P = head(player), S = head(sp), ids = { speaker: sp.id }, cutNow = talk.cut;
      if (talk.cut) {
        talk.cut = false;
        if (!talk.s) talk.s = side(P, S, ids);
        let q = fit(talk.kind, P, S, talk.s, ids), crossed = false;
        if (!q) q = fit(talk.kind, P, S, talk.s, ids, true);
        if (!q) { q = fit(talk.kind, P, S, -talk.s, ids) || fit(talk.kind, P, S, -talk.s, ids, true); if (q) { crossed = true; talk.s = -talk.s; } }
        // (nothing clear on either side: through the player's eyes, a little in front of their face)
        if (!q && talk.kind !== 'reverse') { const dx = S[0] - P[0], dy = S[1] - P[1], L = Math.hypot(dx, dy) || 1; q = { c: [P[0] + dx / L * 0.25, P[1] + dy / L * 0.25, P[2]], at: S, shoulder: null, k: 0, why: 'eyes' }; }
        if (!q) { const dx = P[0] - S[0], dy = P[1] - S[1], L = Math.hypot(dx, dy) || 1; q = { c: [S[0] + dx / L * 0.25, S[1] + dy / L * 0.25, S[2]], at: P, shoulder: null, k: 0, why: 'eyes' }; }
        talk.q = q; talk.at = q.at === P ? 'player' : 'speaker';
        log.push({ name: sp.name || sp.id, kind: talk.kind, side: talk.s, crossed, k: q.k, why: q.why, fresh: talk.fresh, t: Date.now() });
        talk.fresh = false;
      }
      const q = talk.q, sub = talk.at === 'player' ? P : S, other = talk.at === 'player' ? S : P;
      // where it looks: the subject's eye on a third of the frame, the side away from the other one (a two-shot has
      // the speaker on one third and the shoulder on the other); a single looks into the space the speaker talks into
      const lens = (aspect >= 1 ? LENS : PORTRAIT)[talk.kind] || 50, vfov = aspect >= 1 ? 2 * Math.atan(Math.tan(lens * Math.PI / 360) / aspect) * 180 / Math.PI : lens;
      const hfov = 2 * Math.atan(Math.tan(vfov * Math.PI / 360) * aspect);
      const vx = sub[0] - q.c[0], vy = sub[1] - q.c[1], dist = Math.hypot(vx, vy, sub[2] - q.c[2]) || 1;
      // (which way the other one is from the subject, across the frame: the subject goes to the opposite third)
      const yaw = Math.atan2(vx, vy), ox = other[0] - q.c[0], oy = other[1] - q.c[1], across = Math.sin(Math.atan2(ox, oy) - yaw) >= 0 ? 1 : -1;
      const third = aspect >= 1 ? 1 / 3 : 0.16, off = -across * Math.atan(third * Math.tan(hfov / 2));
      const yw = yaw - off, h = Math.hypot(vx, vy), pitch = Math.atan2(sub[2] - q.c[2], h) + Math.atan(0.12 * Math.tan(vfov * Math.PI / 360)); // (the eyes a little over the middle: headroom)
      const look = [q.c[0] + Math.sin(yw) * Math.cos(pitch) * 10, q.c[1] + Math.cos(yw) * Math.cos(pitch) * 10, q.c[2] + Math.sin(pitch) * 10];
      if (cutNow) { talk.view = [q.c, sub, yw, hfov]; talk.framed = framedBy(q.c, sub, yw, hfov); }
      return { pos: q.c.slice(), look, fov: vfov, focus: dist, subject: sub, kind: talk.kind, side: talk.s, shoulder: q.shoulder };
    }
    // the crowd's people a shot shows in front of the face it is on, or at its shoulder: everyone nearer the lens than a
    // pace beyond the face whose body comes into the frame (its reach at its distance: 0.75 m, an open umbrella's), and anyone within RING of
    // the face. Only those in the line from the lens to the face were left undrawn, so a held walker a shoulder's width
    // off it filled the middle of the summation's close shot, the old woman half hidden at its edge (issue 45). Worked
    // out at the cut, from where the lens stands and where the frame looks
    function framedBy(c, sub, yw, hfov) {
      const D = Math.hypot(sub[0] - c[0], sub[1] - c[1]), out = [];
      for (const b of bodies(c[0], c[1], D + RING + 1)) {
        if (b.crowd == null) continue;
        const dx = b.x - c[0], dy = b.y - c[1], r = Math.hypot(dx, dy);
        if (Math.hypot(b.x - sub[0], b.y - sub[1]) < RING) { out.push(b.crowd); continue; }
        if (r > D + 0.6) continue; // (the street beyond the face: the life behind a talk)
        if (Math.abs(angDiff(Math.atan2(dx, dy), yw)) < hfov / 2 + Math.atan2(0.75, Math.max(r, 0.3))) out.push(b.crowd);
      }
      return out;
    }
    // the crowd's people the shot cut to shows in front of the face or at its shoulder (the game sends the walkers among
    // them on elsewhere, and keeps what it leaves here undrawn while the shot lasts: talk.framed)
    function framed() { return talk && talk.framed ? talk.framed : []; }
    // for the harness: how many of the crowd the shot shows in front of the face or at its shoulder, of those drawn
    // (undrawn: a Set of the crowd's indices not drawn this frame)
    function framing(undrawn) { return talk && talk.view ? framedBy(...talk.view).filter(i => !undrawn.has(i)).length : 0; }
    // the crowd's people standing in the way from the lens to the face now, and those the cut found in the frame: the
    // game leaves them undrawn
    function clearing() {
      if (!talk || !talk.q) return [];
      const out = framed().slice(), q = talk.q;
      for (const b of bodies((q.c[0] + q.at[0]) / 2, (q.c[1] + q.at[1]) / 2, Math.hypot(q.at[0] - q.c[0], q.at[1] - q.c[1]) / 2 + 1)) {
        if (b.crowd == null) continue;
        const [d, t] = toAxis(q.c, q.at, b.x, b.y);
        if (d < BODY_R + 0.35 && t > -0.05 && t < 0.98) out.push(b.crowd);
      }
      return out;
    }
    // what stands between the lens and the face now, for the harness: null when clear. undrawn: the crowd's people not
    // drawn this frame (a Set of indices; the game asks its renderer), or true for the whole crowd
    function check(undrawn = true) {
      if (!talk || !talk.q) return null;
      const q = talk.q, skip = talk.at === 'player' ? ['player'] : [talk.speaker.id];
      return blocked(q.c, q.at, skip, q.shoulder === 'player' ? 'player' : q.shoulder === 'speaker' ? talk.speaker.id : null, undrawn);
    }
    // the next line of the same speech: from the opening two-shot to the speaker's single, a cut; after that the
    // lines run on in the single (a cut to the same framing is a jump, not a cut)
    function line() { if (talk && talk.kind === 'two' && talk.speaker) { talk.kind = 'single'; talk.n++; talk.cut = true; } }
    function close() { talk = null; }
    return { open, line, shot, close, framed, framing, clearing, check, log, get on() { return !!(talk && talk.kind && talk.speaker); }, get talk() { return talk; } };
  }
  return { create };
})();
