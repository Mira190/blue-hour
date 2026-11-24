// The route to go: the gold line by the way you are going (on foot, by car, in the helicopter) and the way on foot
// the guide leads. A part of the game cut out of game.js (tools/cut.js; docs/SEAMS.md, "The cut of game.js").
// `g` is the rest of the game, by name. What this part asks of it:
//   firstFramed, G, H, driveTo, gold, groundZ, heli, keepSign, myCar, nav, npcs, pilot, player, ride, roadNet, roads, rq, stepOf,
//   story, waypoint, ways, wharfById
// and what it gives back:
//   guide, updateRoute, wayOnFoot
'use strict';
window.OEGameRouteLine = function (g) {
  // ------------------------------------------------------------ the route to go (route.js)
  // By the way you are going: on foot over the footways and streets as you can walk them, by car
  // along the roads on your side, in the helicopter over or round the buildings to a spot it can
  // come down on, and aboard a ferry its course to the stop. A step that needs the helicopter
  // leads you to it first. Worked out again when the target moves, when you stray off the line,
  // and (a ride, a ferry) as the trip goes on.
  const guide = { key: '', at: -9, pts: null, fail: false, n: 0 };
  // (built once the first frame is drawn, not beside the loader's warm-up: on a phone's tier its ticks were 1 to 2 s of the main
  // thread between "built" and the first frame, issue 194. Nothing before play reads it: the line, the mark and the guide ask
  // for ways.ready first. The log says when it was ready against the first frame, for tools/check.sh mem)
  Promise.resolve(g.firstFramed).then(() => { const t0 = performance.now(); return g.ways.build().then(() => { guide.key = ''; console.info(`routes: built after the first frame, ready ${Math.round(performance.now() - t0)} ms after it`); }); })
    .catch(e => console.warn('Routes unavailable:', e));
  // The way on foot from you to a story's goal, for its mark: the gold line's own points while it is drawn to that goal,
  // else the same route worked out here (route.js ways.walk, which the dog follows too), again only when the goal moves or
  // you are 4 m off it (where you are along it is found every frame: a way worked out again as you walk hitched a phone's
  // frame every few seconds). Returns the metres left along it (to the lift's door, toDoor: the
  // way breaks at the stop it rides to) and `aim`: the furthest point along it you can walk to in a straight line, the
  // way never more than WAY_BEND m off that line on the way there, within WAY_AHEAD m; null where that is the goal
  const WAY_BEND = 1.0, WAY_AHEAD = 60, wayMemo = { key: '', pts: null };
  function wayOnFoot(at, toDoor) {
    if (g.player.mode !== 'foot' || !g.ways.ready || !at) return null;
    const key = `${Math.round(at[0])},${Math.round(at[1])},${Math.round(at[3] ?? 0)}`;
    const near = P => { // (where you are on a way: the stretch nearest you, the point on it, and how far off it you are)
      let bd = Infinity, bi = 0, bt = 0;
      for (let i = 1; i < P.length; i++) {
        if (P[i][3]) continue;
        const [ax, ay] = P[i - 1], [bx, by] = P[i], ux = bx - ax, uy = by - ay, t = Math.max(0, Math.min(1, ((g.player.x - ax) * ux + (g.player.y - ay) * uy) / (ux * ux + uy * uy || 1e-9)));
        const d = Math.hypot(ax + ux * t - g.player.x, ay + uy * t - g.player.y) + (Math.abs(P[i - 1][2] - g.player.z) > 3 ? 50 : 0);
        if (d < bd) { bd = d; bi = i; bt = t; }
      }
      return { d: bd, i: bi, t: bt };
    };
    let P = guide.pts && guide.key.includes(`|${Math.round(at[0])},${Math.round(at[1])}|waypoint`) ? guide.pts : null;
    if (!P) {
      P = wayMemo.key === key ? wayMemo.pts : null;
      if ((!P && wayMemo.key !== key) || (P && near(P).d > 4)) {
        const r = g.ways.walk({ x: g.player.x, y: g.player.y, z: g.player.z }, { x: at[0], y: at[1], z: at[3] ?? null });
        Object.assign(wayMemo, { key, pts: r ? r.pts : null });
        P = wayMemo.pts;
      }
    }
    if (!P || P.length < 2) return null;
    const { i: i0, t: t0 } = near(P), [ax, ay, az] = P[i0 - 1], cx = ax + (P[i0][0] - ax) * t0, cy = ay + (P[i0][1] - ay) * t0, cz = az + (P[i0][2] - az) * t0;
    // the metres left: from the point nearest you to the way's end (or its first ride up)
    let left = Math.hypot(P[i0][0] - cx, P[i0][1] - cy), end = P.length - 1;
    for (let i = i0 + 1; i < P.length; i++) { if (P[i][3]) { if (toDoor) { end = i - 1; break; } continue; } left += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); }
    if (toDoor) { left = Math.hypot(P[i0][0] - cx, P[i0][1] - cy); for (let i = i0 + 1; i <= end; i++) left += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); }
    left += Math.hypot(cx - g.player.x, cy - g.player.y);
    // the next turn: along the way a metre at a time, while every point passed lies within WAY_BEND of the line to it
    const S = [[cx, cy, cz]];
    let L = 0;
    for (let i = i0; i <= end && L < WAY_AHEAD; i++) {
      const [px, py, pz] = S[S.length - 1], [qx, qy, qz] = P[i], d = Math.hypot(qx - px, qy - py), m = Math.max(1, Math.round(d));
      if (i > i0 && P[i][3]) break;
      for (let k = 1; k <= m; k++) S.push([px + (qx - px) * k / m, py + (qy - py) * k / m, pz + (qz - pz) * k / m]);
      L += d;
    }
    let aim = S.length - 1;
    for (let j = 1; j < S.length; j++) {
      const ex = S[j][0] - g.player.x, ey = S[j][1] - g.player.y, l = Math.hypot(ex, ey) || 1;
      let ok = true;
      for (let k = 1; k < j && ok; k++) if (Math.abs((S[k][0] - g.player.x) * ey - (S[k][1] - g.player.y) * ex) / l > WAY_BEND) ok = false;
      if (!ok) { aim = j - 1; break; }
    }
    const straight = aim === S.length - 1 && L < WAY_AHEAD; // (it runs straight to the goal, or the door)
    return { left, aim: straight ? null : S[Math.max(1, aim)], pts: P };
  }
  function routeGoal(target, ob) {
    const s = ob && !g.waypoint ? g.stepOf(ob.line) : null;
    if (s && (s.type === 'land' || s.type === 'under_bridge') && g.player.mode !== 'heli') { const d = g.heli.doorAt(); return { x: d.x, y: d.y, z: g.heli.st.z, kind: 'heli' }; }
    if (!target) return null;
    const n = g.npcs.find(q => Math.abs(q.x - target[0]) < 0.01 && Math.abs(q.y - target[1]) < 0.01); // someone to talk to stands at a known height
    return { x: target[0], y: target[1], z: n ? n.z : null, kind: s ? s.type : 'waypoint', step: s };
  }
  // a road route's points moved over to the lane on your side, or less far where a lane that
  // narrow has a wall closer (a back lane in Shibuya)
  const laneOf = pts => pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    for (const f of [1, 0.5, 0]) {
      const k = OECars.LANE * g.keepSign * f, x = p[0] - (b[1] - a[1]) / l * k, y = p[1] + (b[0] - a[0]) / l * k;
      if (!f || g.nav.room(x, y, p[2], 0.6, 1.6, true)) return [x, y, p[2]];
    }
  });
  // a line on the ground: a point every metre, on the floor there (the street, a deck, the quay), a
  // little above it; broken where a lift takes you up (route.js marks the stop you get out at)
  function drape(pts, lift = 0.12) {
    const out = [], on = (x, y, z, jump) => { const f = g.nav.floorAt(x, y, z + 0.6), q = [x, y, (f && Math.abs(f.z - z) < 2.5 ? f.z : z) + lift]; if (jump) q.push(1); out.push(q); };
    if (pts.length) on(...pts[0].slice(0, 3));
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay, az] = pts[i - 1], [bx, by, bz, jump] = pts[i];
      if (jump) { on(bx, by, bz, 1); continue; }
      const m = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay)));
      for (let k = 1; k <= m; k++) { const t = k / m; on(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t); }
    }
    return out;
  }
  function plan(goal) {
    const m = g.player.mode;
    if (m === 'foot') {
      const me = { x: g.player.x, y: g.player.y, z: g.player.z }, r = g.ways.walk(me, goal);
      if (r) return { pts: drape(r.pts), width: 0.8 };
      // no way there on foot (across the water): to the wharf of a ferry that calls nearest it
      const near = g.G.wharves.slice().sort((a, b) => Math.hypot(a.landing[0] - goal.x, a.landing[1] - goal.y) - Math.hypot(b.landing[0] - goal.x, b.landing[1] - goal.y))[0];
      const from = near ? g.G.wharves.filter(w => w !== near && (g.G.ferries || []).some(f => f.stops.includes(w.id) && f.stops.includes(near.id)))
        .sort((a, b) => Math.hypot(a.landing[0] - me.x, a.landing[1] - me.y) - Math.hypot(b.landing[0] - me.x, b.landing[1] - me.y)) : [];
      for (const w of from.slice(0, 3)) {
        const q = g.ways.walk(me, { x: w.landing[0], y: w.landing[1] });
        if (q) return { pts: drape(q.pts), width: 0.8, ferry: w };
      }
      return null;
    }
    if (m === 'car' && g.pilot && !g.pilot.join) return { pts: drape(laneOf(g.pilot.drv.path.pts), 0.1), width: 1.3 }; // (the autopilot's own way)
    if (m === 'car' && g.myCar) {
      const st = g.myCar.D.st, a = g.roads.place(st.x, st.y, 200, g.keepSign, st.z);
      if (!a) return null;
      g.roadNet.at(a.line, a.s, g.rq);
      a.dir = Math.sin(st.h) * g.rq.hx + Math.cos(st.h) * g.rq.hy >= 0 ? 1 : -1; // the way the car faces
      const rt = g.driveTo(a, goal.x, goal.y, goal.z ?? g.groundZ(goal.x, goal.y)); // (in a park, inside the castle grounds: the nearest kerb a road from here reaches)
      return rt && { pts: drape([[st.x, st.y, st.z]].concat(laneOf(rt.pts)), 0.1), width: 1.3 };
    }
    if (m === 'ride' && g.ride && g.ride.phase === 'driving') return { pts: drape(laneOf(g.ride.drv.path.pts), 0.1), width: 1.3 };
    if (m === 'heli') {
      const st = g.heli.st, s = goal.step;
      if (s && s.type === 'under_bridge') {
        const strip = g.nav.strips.find(q => q.fly_under && (!s.surface || q.name === s.surface)), u = strip && g.ways.underSpan(st, strip), r = u && g.ways.flight(st, goal, { end: u.end, under: u });
        if (r) return { pts: r.pts, flat: false, width: 1.6 };
      }
      const r = g.ways.flight(st, goal);
      return r && { pts: r.pts, flat: false, width: 1.6, land: r.land };
    }
    if (m === 'ferry' && g.player.vehicle) { // the vessel's own course, on to the stop nearest the target
      const v = g.player.vehicle, out = [[v.x, v.y, 0.4]];
      let best = Infinity, cut = 1;
      for (let n = 0, ci = v.ci; n < v.cycle.length; n++, ci = (ci + 1) % v.cycle.length) {
        const c = v.cycle[ci], p = c.rev ? c.leg.p.slice().reverse() : c.leg.p, cum = c.rev ? c.leg.cum.map(q => c.leg.len - q).reverse() : c.leg.cum;
        for (let k = 0; k < p.length; k++) if (n || v.phase === 'dwell' || cum[k] > v.s) out.push([p[k][0], p[k][1], 0.4]);
        const w = g.wharfById(c.rev ? c.leg.from : c.leg.to), d = w ? Math.hypot(w.landing[0] - goal.x, w.landing[1] - goal.y) : Infinity;
        if (d < best - 1) { best = d; cut = out.length; }
      }
      return { pts: out.slice(0, cut), width: 3 };
    }
    return null;
  }
  function updateRoute(t, target, ob, titled) {
    const m = g.player.mode, me = m === 'heli' ? g.heli.st : m === 'ferry' ? g.player.vehicle : g.player;
    const auto = m === 'car' && g.pilot ? g.pilot : null; // (the autopilot's destination is the route's, whatever the walk's is)
    // (in a story the way is to the story's own goal, by the footways and the lifts: round a station, up a tower)
    // (and none while the dog leads: he is the way; nor to a thing to photograph, story.js kind 'frame': the way ends at the
    // standpoint and the thing is framed from there, and a line drawn on to it ran from the player's feet across the zebra)
    const storyWay = g.story && g.story.on && g.story.state.target && m === 'foot' && !g.story.guided && g.story.state.kind !== 'frame' ? g.story.state.target : null;
    const goal = titled ? null : storyWay ? { x: storyWay[0], y: storyWay[1], z: storyWay[3] != null ? storyWay[3] : null, kind: 'waypoint' } : auto ? { x: auto.dest.at[0], y: auto.dest.at[1], z: null, kind: 'pilot' } : routeGoal(target, ob);
    const here = goal && Math.hypot(goal.x - me.x, goal.y - me.y) < (m === 'heli' ? 30 : 12) && (m !== 'heli' || g.heli.st.landed);
    // (in a story no line is drawn on the ground but the story's own way: the map's routes are not the story's way, and a line that leads elsewhere is worse than none)
    if ((g.story && !storyWay) || !goal || here || m === 'rail') { if (guide.pts) g.gold.set(null);  guide.key = ''; guide.pts = null; return; }
    const off = g.gold.follow(me.x, me.y, m === 'heli' ? me.z : null);
    const key = `${m}|${Math.round(goal.x)},${Math.round(goal.y)}|${goal.kind}|${m === 'ride' && g.ride ? `${g.ride.phase}${g.ride.drv.path ? (g.ride.drv.path.rid ??= ++guide.n) : ''}` : auto ? `${auto.join ? 'join' : (auto.drv.path.rid ??= ++guide.n)}` : ''}|${m === 'ferry' && me ? me.ci : ''}`;
    const stray = auto ? Infinity : { foot: 6, car: 14, heli: 70 }[m] ?? Infinity;
    if (key === guide.key && (off < stray || t - guide.at < (guide.fail ? 3 : 0.6))) return;
    if ((m === 'foot' || m === 'heli') && !g.ways.ready) return;
    guide.key = key; guide.at = t;
    const r = plan(goal);
    if (r && r.ferry && guide.ferry !== r.ferry.id) g.H.toast(`No way there on foot from here. The gold line leads to <b>${r.ferry.name}</b> for the ferry.`);
    guide.ferry = r && r.ferry ? r.ferry.id : null;
    guide.fail = !r;
    guide.pts = r ? r.pts : null;
    g.gold.set(guide.pts, r || {});
    if (r) g.gold.follow(me.x, me.y, m === 'heli' ? me.z : null);
  }
  return { guide, updateRoute, wayOnFoot };
};
